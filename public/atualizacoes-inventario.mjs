import { properties } from "./inventario-regra.mjs";
const form = document.querySelector("#periodo");
const result = document.querySelector("#resultado");
const send = document.querySelector("#enviar");
const assisted = document.querySelector("#assistido");
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
  send.hidden = true;
  assisted.hidden = true;
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
  result.replaceChildren(section);
}
form.addEventListener("input",invalidate);
form.addEventListener("submit",async event => {
  event.preventDefault(); invalidate();
  const current = version;
  const scope = Object.fromEntries(new FormData(form));
  if (scope.end < scope.start) { status.textContent="Confira as datas do período."; return; }
  status.textContent="Preparando prévia da captura do Portal…";
  try {
    const plan = await request(endpoint,{action:"preview",...scope});
    if (current !== version) return;
    render(plan);
    preview=plan;
    codex.hidden=!plan.id;
    codex.disabled=false;
    send.hidden=!plan.id || Boolean(plan.skipped?.length);
    assisted.hidden=!plan.id || plan.start!==plan.end;
    assisted.disabled=send.disabled=false;
    status.textContent=plan.issue || (plan.canSend ?
      "Confira as datas e os ocupados antes de confirmar a gravação." :
      "Consulta disponível. O envio exige perfil de administrador.");
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
      codex_pendente:"Aguardando o Codex assumir",codex_ativo:"Gravação em andamento",codex_salvo:"Gravação confirmada na Omnibees"};
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
async function confirmPreview(manual) {
  const plan=preview;
  if (!plan?.id || send.disabled || (manual && plan.start!==plan.end)) return;
  const prompt=manual ? "Confirmar o ajuste manual de "+plan.hotel+" em "+br(plan.start)+"?" :
    "Enviar os ocupados exibidos pelo robô dedicado para "+plan.hotel+" de "+br(plan.start)+" a "+br(plan.end)+"?";
  if (!window.confirm(prompt)) return;
  codex.disabled=assisted.disabled=send.disabled=true;
  try {
    const job=await request(endpoint,{action:manual?"confirmarAssistido":"confirm",id:plan.id});
    if (plan===preview) {codex.hidden=assisted.hidden=send.hidden=true;status.textContent="Pedido confirmado.";}
    await track(job.id);
  } catch(e) { if(plan===preview){status.textContent=e.message;codex.disabled=assisted.disabled=send.disabled=false;} }
}
async function entregarCodex(id,plan) {
  const local = "http://127.0.0.1:41857";
  codex.disabled=assisted.disabled=send.disabled=retryCodex.disabled=true;
  let confirmado=false;
  try {
    let health;
    try {health=await fetch(local+"/status",{cache:"no-store",credentials:"omit",signal:AbortSignal.timeout(45000)});}
    catch {throw Error("Conector indisponível. Confira se está ligado neste notebook e permita o acesso do Portal à rede local no Chrome.");}
    if (!health.ok || (await health.json()).service!=="sueds-inventario") throw Error("Conector do notebook indisponível.");
    if (plan && preview!==plan) return;
    const job=await request(endpoint,{action:"confirmarCodex",id});
    confirmado=true;
    sessionStorage.setItem("inventario.ultimo",id);
    if (plan && plan===preview) codex.hidden=assisted.hidden=send.hidden=true;
    const response=await fetch(local+"/pedido",{method:"POST",headers:{"Content-Type":"application/json"},
      credentials:"omit",body:JSON.stringify({id:job.id,recibo:job.recibo}),signal:AbortSignal.timeout(25000)});
    const delivery=await response.json();
    if (!response.ok) throw Error(delivery.error || "Falha ao entregar ao Codex.");
    status.textContent="Pedido recebido pelo conector. Acompanhe a gravação abaixo.";
  } catch(e) {
    status.textContent=confirmado ? "Pedido confirmado. "+e.message+" Consulte o andamento deste mesmo pedido." : e.message;
  } finally {
    if (confirmado || !plan) await track(id);
    if (!plan || plan===preview) codex.disabled=assisted.disabled=send.disabled=false;
    retryCodex.disabled=false;
  }
}
codex.addEventListener("click",()=>{if (preview?.id && !codex.disabled) entregarCodex(preview.id,preview);});
retryCodex.addEventListener("click",()=>entregarCodex(Number(retryCodex.dataset.id)));
assisted.addEventListener("click",()=>confirmPreview(true));
send.addEventListener("click",()=>confirmPreview(false));
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
  for (const h of hotels) form.elements.hotel.add(new Option(h,h));
  if (pendingId && !sessionStorage.getItem("inventario.ultimo")) track(pendingId);
}).catch(e=>status.textContent=e.message);
if(last) track(last);
