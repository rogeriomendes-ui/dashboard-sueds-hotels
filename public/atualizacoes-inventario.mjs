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
function render(plan) {
  const table = document.createElement("table");
  table.className = "occupancy-table";
  const cell = (row,tag,value) => { const el = document.createElement(tag); el.textContent = value ?? "—"; row.append(el); };
  const header = table.createTHead().insertRow();
  for (const name of ["Noite","Apartamento","Capacidade","Disponíveis no Portal","Disponíveis após envio","Ocupados a lançar","Captura (Brasília)"]) cell(header,"th",name);
  const body = table.createTBody();
  for (const r of plan.rows) {
    const row = body.insertRow(), time = Date.parse(r.capturedAt);
    for (const value of [br(r.date),properties[plan.hotel]?.rooms[r.code] || r.code,r.capacity,r.available,r.targetAvailable,r.targetOccupied,
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
  const scope = {start:fields.get("start"),end:fields.get("end")};
  if (scope.end < scope.start) { status.textContent="Confira as datas do período."; return; }
  status.textContent="Preparando prévia da captura do Portal…";
  try {
    const results = await Promise.allSettled(hotels.map(hotel=>request(endpoint,{action:"preview",...scope,hotel})));
    if (current !== version) return;
    const plans=results.map((entry,index)=>entry.status==="fulfilled"?entry.value:
      {...scope,hotel:hotels[index],rows:[],issue:entry.reason.message});
    plans.forEach(render);
    preview=plans.filter(plan=>plan.id);
    codex.hidden=!preview.length;
    codex.disabled=false;
    codex.textContent=preview.length>1?"Confirmar envio de "+preview.length+" hotéis à extensão":
      "Confirmar e abrir na extensão Ocupação Omnibees";
    status.textContent=preview.length ?
      "Confira as datas e os ocupados. Hotéis prontos para enviar: "+preview.length+" de "+plans.length+"." :
      "Nenhum hotel da prévia está disponível para envio.";
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
    const job=await request(endpoint,{action:"confirmarCodex",id});
    confirmado=true;
    sessionStorage.setItem("inventario.ultimo",id);
    if (plans && plans===preview) {
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
request(last ? endpoint : endpoint+"?retomar=inventario").then(({hotels,pendingId})=>{
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
