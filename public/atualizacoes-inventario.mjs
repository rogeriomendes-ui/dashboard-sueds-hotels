import { properties } from "./inventario-regra.mjs";
const form = document.querySelector("#periodo");
const result = document.querySelector("#resultado");
const send = document.querySelector("#enviar");
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
    send.disabled=false;
    status.textContent=plan.issue || (plan.canSend?"Revise os ocupados a lançar antes de confirmar o envio.":"Consulta disponível. O envio exige perfil de administrador.");
  } catch (e) { if(current===version) status.textContent=e.message; }
});
async function track(id) {
  clearTimeout(timer);
  sessionStorage.setItem("inventario.ultimo",id);
  try {
    const j=await request(endpoint+"?id="+encodeURIComponent(id));
    if (String(id)!==sessionStorage.getItem("inventario.ultimo")) return;
    const labels={queued:"Aguardando o robô do notebook",running:"Em execução",finish:"Conferido na Omnibees",failed:"Interrompido"};
    progress.textContent=j.hotel+" · "+br(j.start)+" a "+br(j.end)+" · "+(labels[j.state]||j.state)+" · "+j.done+" noite(s) conferida(s). "+(j.message||"");
    if (!["running","queued"].includes(j.state)) return;
  } catch (e) { progress.textContent="Tentando consultar o andamento. "+e.message; }
  timer=setTimeout(()=>track(id),6000);
}
send.addEventListener("click",async () => {
  const plan=preview;
  if (!plan?.id || send.disabled) return;
  if (!window.confirm("Enviar os ocupados exibidos para "+plan.hotel+" de "+br(plan.start)+" a "+br(plan.end)+"?")) return;
  send.disabled=true;
  try {
    const job=await request(endpoint,{action:"confirm",id:plan.id});
    if (plan===preview) {send.hidden=true;status.textContent="Envio confirmado.";}
    await track(job.id);
  } catch(e) { if(plan===preview){status.textContent=e.message;send.disabled=false;} }
});
request(endpoint).then(({hotels})=>{for(const h of hotels) form.elements.hotel.add(new Option(h,h));}).catch(e=>status.textContent=e.message);
const last=sessionStorage.getItem("inventario.ultimo");
if(last) track(last);
