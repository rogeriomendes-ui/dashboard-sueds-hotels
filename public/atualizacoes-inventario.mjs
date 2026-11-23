import { properties } from "./inventario-regra.mjs";
const form = document.querySelector("#periodo");
const result = document.querySelector("#resultado");
const codex = document.querySelector("#codex");
const retryCodex = document.querySelector("#entregar-codex");
const viewCodex = document.querySelector("#ver-codex");
const adopt = document.querySelector("#assumir");
const status = document.querySelector("#estado");
const progress = document.querySelector("#andamento");
const endpoint = "/api/portal/inventario-pontual";
const today = new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
const stamp = new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"America/Sao_Paulo"});
const br = date => date.split("-").reverse().join("/");
let version = 0, preview, timer;
for (const input of form.querySelectorAll("input[type=date]")) input.value = input.min = today;
async function request(url, data) {
  const res = await fetch(url,data ? {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)} : {cache:"no-store"});
  const value = await res.json();
  if (!res.ok) throw Error(value.error || "Falha na comunicação com o Portal.");
  return value;
}
function invalidate() {
  version++;
  preview = null;
  codex.hidden = true;
  result.replaceChildren();
  status.textContent = "";
}
function render(plan, canais) {
  const table = document.createElement("table");
  table.className = "occupancy-table";
  const cell = (row,tag,value) => { const el = document.createElement(tag); el.textContent = value ?? "—"; row.append(el); };
  const header = table.createTHead().insertRow();
  const columns=[];
  if(canais.includes("omnibees")) columns.push(["Disponíveis Omnibees","targetAvailable"],["Ocupados a lançar","targetOccupied"]);
  if(canais.includes("cvc")) columns.push(["Disponíveis CVC","cvc"]);
  if(canais.includes("juniper")) columns.push(["Disponíveis Juniper","juniper"]);
  for (const name of ["Noite","Apartamento","Capacidade","Disponíveis no KPI",...columns.map(([name])=>name),"Captura (Brasília)"]) cell(header,"th",name);
  const body = table.createTBody();
  for (const r of plan.rows) {
    const row = body.insertRow(), time = Date.parse(r.capturedAt);
    for (const value of [br(r.date),properties[plan.hotel]?.rooms[r.code] || r.code,r.capacity,r.available,...columns.map(([,key])=>r[key]),
      Number.isFinite(time)?stamp.format(time):null]) cell(row,"td",value);
  }
  const section = document.createElement("section");
  section.className = "occupancy-hotel occupancy-scroll";
  const title = document.createElement("h2");
  title.textContent = plan.hotel + " · " + br(plan.start) + " a " + br(plan.end);
  section.append(title);
  if (plan.issue) {
    const warning=document.createElement("p");
    warning.textContent=plan.issue;
    section.append(warning);
  }
  const differences=new Map(plan.rows.filter(row=>row.categoryAvailable!=null).map(row=>[row.date,row]));
  if (differences.size) {
    const warning=document.createElement("p");
    warning.setAttribute("role","status");
    const details=Array.from(differences.values(),row=>br(row.date)+" ("+row.categoryAvailable+" por categoria, "+(row.hotelAvailable ?? "—")+" no hotel)");
    warning.textContent="Divergência na disponibilidade: "+details.join("; ")+". O cálculo usa o saldo de cada categoria.";
    section.append(warning);
  }
  if (plan.skipped?.length) {
    const warning=document.createElement("p");
    warning.setAttribute("role","status");
    warning.textContent="Noites excluídas por divergência: "+plan.skipped.map(br).join(", ")+
      ". Noites válidas para envio: "+(plan.issue ? 0 : plan.dates.length)+".";
    section.append(warning);
  }
  section.append(table);
  result.append(section);
}
form.addEventListener("input",invalidate);
form.addEventListener("submit",async event => {
  event.preventDefault(); invalidate();
  const current = version;
  const fields = new FormData(form);
  const hotels = fields.getAll("hotel");
  if (!hotels.length) {
    status.textContent="Selecione pelo menos um hotel.";
    form.querySelector('input[name="hotel"]')?.focus();
    return;
  }
  const canais=fields.getAll("canal");
  if (!canais.length) {
    status.textContent="Selecione pelo menos um canal.";
    form.querySelector('[name="canal"]').focus();
    return;
  }
  const scope = {start:fields.get("start"),end:fields.get("end"),canais};
  if (scope.end < scope.start) { status.textContent="Confira as datas do período."; return; }
  status.textContent="Preparando prévia da captura do Portal…";
  try {
    const results = await Promise.allSettled(hotels.map(hotel=>request(endpoint,{action:"preview",...scope,hotel})));
    if (current !== version) return;
    const plans=results.map((entry,index)=>entry.status==="fulfilled"?entry.value:
      {...scope,hotel:hotels[index],rows:[],issue:entry.reason.message});
    plans.forEach(plan=>render(plan,canais));
    const omni=canais.includes("omnibees");
    preview=plans.filter(plan=>plan.canSend && !plan.issue && (omni ? plan.id : plan.hotel==="SUEDS PLAZA"));
    const plaza=preview.find(plan=>plan.hotel==="SUEDS PLAZA");
    const etapas=["omnibees","juniper","cvc"].filter(c=>canais.includes(c) && (c==="omnibees" || plaza));
    const nomes={omnibees:"Omnibees",juniper:"Juniper",cvc:"CVC"};
    codex.hidden=!preview.length;
    codex.disabled=false;
    codex.textContent="Confirmar e iniciar "+etapas.map(c=>nomes[c]).join(" → ");
    status.textContent=omni ? "Hotéis prontos na Omnibees: "+preview.length+" de "+plans.length+". " : "";
    if(canais.includes("juniper")) status.textContent+="Juniper: Sueds Plaza, Standard. ";
    if(canais.includes("cvc")) status.textContent+="CVC: Sueds Plaza, Luxo, Suíte Master e Standard. ";
    if(!plaza && canais.some(c=>c!=="omnibees")) status.textContent+="Os canais do Plaza estão fora deste envio.";
    preview.canais=etapas;
  } catch (e) { if(current===version) status.textContent=e.message; }
});
async function track(id) {
  clearTimeout(timer);
  sessionStorage.setItem("inventario.ultimo",id);
  adopt.hidden=true;
  try {
    const j=await request(endpoint+"?id="+encodeURIComponent(id));
    if (String(id)!==sessionStorage.getItem("inventario.ultimo")) return;
    const labels={queued:"Aguardando o robô do notebook",running:"Em execução",assisted:"Abra a extensão Inventário Sueds nesta aba e carregue o pedido.",finish:"Conferido na Omnibees",failed:"Interrompido",
      codex_pendente:"Aguardando a extensão Ocupação Omnibees",codex_ativo:"Gravação em andamento",codex_salvo:"Gravação confirmada na Omnibees"};
    progress.textContent="Pedido "+j.id+" · "+j.hotel+" · "+br(j.start)+" a "+br(j.end)+" · "+(labels[j.state]||j.state)+" · "+j.done+(j.mode==="codex"?" noite(s) gravada(s). ":" noite(s) conferida(s). ")+(j.message||"");
    retryCodex.hidden=j.state!=="codex_pendente";
    retryCodex.dataset.id=j.id;
    viewCodex.hidden=j.mode!=="codex";
    viewCodex.href="/pedido-inventario-codex.html?id="+encodeURIComponent(j.id);
    adopt.hidden=j.state!=="queued" || j.start!==j.end;
    adopt.dataset.id=j.id;
    if (!["running","queued","assisted","codex_pendente","codex_ativo"].includes(j.state)) return;
  } catch (e) {
    if (String(id)!==sessionStorage.getItem("inventario.ultimo")) return;
    progress.textContent="Tentando consultar o andamento. "+e.message;
  }
  timer=setTimeout(()=>track(id),6000);
}
async function abrirNaExtensao(id,plans) {
  codex.disabled=retryCodex.disabled=true;
  let confirmado=false;
  try {
    if (plans && preview!==plans) return;
    const extras=plans?.canais?.filter(c=>c!=="omnibees") || [];
    let lote=null;
    if(extras.length) {
      if(!document.documentElement.hasAttribute("data-inventario-sequencial")) throw Error("Recarregue a extensão 1.8.0 e a página do inventário.");
      const plaza=plans.find(plan=>plan.hotel==="SUEDS PLAZA");
      const rows=plaza.rows.filter(r=>plaza.dates.includes(r.date)).map(({code,date,available,juniper,cvc})=>({code,date,available,juniper,cvc}));
      if(!rows.length) throw Error("Não há noites válidas do Plaza na prévia.");
      lote={key:crypto.randomUUID(),ids:plans.map(p=>p.id).filter(Boolean),extras,rows};
    }
    if(lote && !lote.ids.length) {
      sessionStorage.setItem("inventario.canais",JSON.stringify(lote));
      window.top.location.href="/atualizacoes-inventario.html#lote-canais="+lote.key;
      return;
    }
    const job=await request(endpoint,{action:"confirmarCodex",id});
    confirmado=true;
    sessionStorage.setItem("inventario.ultimo",id);
    if (plans && plans===preview) {
      if(lote) sessionStorage.setItem("inventario.canais",JSON.stringify(lote));
      else sessionStorage.removeItem("inventario.canais");
      codex.hidden=true;
      sessionStorage.setItem("inventario.lote",JSON.stringify(plans.map(plan=>plan.id)));
      sessionStorage.setItem("inventario.inicioConfirmado",JSON.stringify({id:String(job.id),expiresAt:Date.now()+60000}));
    } else if (plans) {
      status.textContent="A seleção mudou. Gere uma nova prévia para o período escolhido.";
      return;
    }
    window.top.location.href="/pedido-inventario-codex.html?id="+encodeURIComponent(job.id)+"#abrir-extensao";
  } catch(e) {
    status.textContent=confirmado ? "Pedido confirmado. "+e.message+" Consulte o andamento deste mesmo pedido." : e.message;
  } finally {
    if (confirmado || !plans) await track(id);
    if (!plans || plans===preview) codex.disabled=false;
    retryCodex.disabled=false;
  }
}
codex.addEventListener("click",()=>{if (preview?.length && !codex.disabled) abrirNaExtensao(preview[0].id,preview);});
retryCodex.addEventListener("click",()=>abrirNaExtensao(Number(retryCodex.dataset.id)));
adopt.addEventListener("click",async () => {
  const id=Number(adopt.dataset.id);
  if (!id || !window.confirm("Retirar o pedido "+id+" da fila do robô dedicado e ajustar manualmente na Omnibees?")) return;
  adopt.disabled=true;
  try {
    const job=await request(endpoint,{action:"confirmarAssistido",id});
    await track(job.id);
  } catch(e) {status.textContent=e.message;}
  finally {adopt.disabled=false;}
});
const last=sessionStorage.getItem("inventario.ultimo");
const configForm=document.querySelector("#percentuais");
const configStatus=document.querySelector("#config-estado");
let savedPercentuais;
configForm.onsubmit=async event=>{
  event.preventDefault();
  const values=Object.fromEntries([...new FormData(configForm)].map(([k,v])=>[k,Number(v)]));
  const button=configForm.querySelector("button");
  button.disabled=true;
  try {
    savedPercentuais=await request(endpoint,{action:"salvarPercentuais",percentuais:values,anterior:savedPercentuais});
    invalidate();
    configStatus.textContent="Percentuais salvos para novas prévias e execuções.";
  } catch(e) {configStatus.textContent=e.message;}
  finally {button.disabled=false;}
};
request(last ? endpoint : endpoint+"?retomar=inventario").then(({hotels,pendingId,percentuais,canSend})=>{
  savedPercentuais=percentuais;
  for(const [key,value] of Object.entries(percentuais)) configForm.elements[key].value=value;
  document.querySelector("#distribuicao").hidden=false;
  for(const control of configForm.elements) control.disabled=!canSend;
  const group = document.querySelector("#hoteis");
  for (const hotel of hotels) {
    const label = document.createElement("label");
    label.className = "availability-filter";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "hotel";
    checkbox.value = hotel;
    label.append(checkbox, hotel);
    group.append(label);
  }
  if (pendingId && !sessionStorage.getItem("inventario.ultimo")) track(pendingId);
}).catch(e=>status.textContent=e.message);
if(last) track(last);
