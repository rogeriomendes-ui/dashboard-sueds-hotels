import { properties } from "./inventario-regra.mjs";
const form = document.querySelector("#periodo");
const result = document.querySelector("#resultado");
const send = document.querySelector("#enviar");
const assisted = document.querySelector("#assistido");
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
  section.append(title,table);
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
    send.hidden=!plan.id;
    assisted.hidden=!plan.id || plan.start!==plan.end;
    assisted.disabled=send.disabled=false;
    status.textContent=plan.issue || (plan.canSend ?
      (plan.start===plan.end ? "Revise os ocupados a lançar. No Chrome normal, você salva os valores e a extensão confere." : "O ajuste no Chrome normal atende uma noite por pedido.") :
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
    const labels={queued:"Aguardando o robô do notebook",running:"Em execução",assisted:"Abra a extensão Inventário Sueds nesta aba e carregue o pedido.",finish:"Conferido na Omnibees",failed:"Interrompido"};
    progress.textContent="Pedido "+j.id+" · "+j.hotel+" · "+br(j.start)+" a "+br(j.end)+" · "+(labels[j.state]||j.state)+" · "+j.done+" noite(s) conferida(s). "+(j.message||"");
    adopt.hidden=j.state!=="queued" || j.start!==j.end;
    adopt.dataset.id=j.id;
    if (!["running","queued","assisted"].includes(j.state)) return;
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
  assisted.disabled=send.disabled=true;
  try {
    const job=await request(endpoint,{action:manual?"confirmarAssistido":"confirm",id:plan.id});
    if (plan===preview) {assisted.hidden=send.hidden=true;status.textContent="Pedido confirmado.";}
    await track(job.id);
  } catch(e) { if(plan===preview){status.textContent=e.message;assisted.disabled=send.disabled=false;} }
}
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
request(last ? endpoint : endpoint+"?retomar=assistido").then(({hotels,pendingId})=>{
  for (const h of hotels) form.elements.hotel.add(new Option(h,h));
  if (pendingId && !sessionStorage.getItem("inventario.ultimo")) track(pendingId);
}).catch(e=>status.textContent=e.message);
if(last) track(last);
