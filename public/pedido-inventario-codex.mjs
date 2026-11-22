import {properties} from "./inventario-regra.mjs";

let id=Number(new URLSearchParams(location.search).get("id"));
const endpoint="/api/portal/inventario-pontual";
const el=selector=>document.querySelector(selector);
const status=el("#estado"), start=el("#iniciar"), save=el("#registrar"), stop=el("#interromper");
const next=el("#proximo-hotel");
const br=date=>date.split("-").reverse().join("/");
let job, token, date;
let queue=[];
try {
  const stored=JSON.parse(sessionStorage.getItem("inventario.lote"));
  if (Array.isArray(stored) && stored.every(n=>Number.isSafeInteger(n) && n>0)) queue=stored;
} catch {}

async function api(action,requestId=id) {
  const response=action ? await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(requestId===id?{id,action,token,date}:{id:requestId,action})}) :
    await fetch(endpoint+"?modo=codex&id="+requestId,{cache:"no-store"});
  const result=await response.json();
  if (!response.ok) throw Error(result.error || "Pedido indisponível.");
  return result;
}
function render() {
  const pending=job.state==="codex_pendente", active=job.state==="codex_ativo";
  const ownerOfRun=active && Boolean(token);
  start.hidden=!pending;
  save.hidden=!ownerOfRun;
  stop.hidden=!pending && !active;
  const index=queue.indexOf(id);
  const nextId=index<0?undefined:queue[index+1];
  next.disabled=job.state!=="codex_salvo" || !token || !nextId;
  next.dataset.id=next.disabled?"":String(nextId);
  if (job.state==="codex_salvo" && token && index>=0 && !nextId) sessionStorage.removeItem("inventario.lote");
  el("#noite").hidden=!ownerOfRun;
  el("#escopo").textContent="Pedido "+id+" · "+properties[job.hotel].name+" · "+br(job.start)+" a "+br(job.end);
  if (job.skipped?.length) el("#escopo").textContent+=" · Noites excluídas por divergência: "+job.skipped.map(br).join(", ");
  const labels={codex_pendente:"Pedido confirmado. Abra Ocupação Omnibees no Chrome para iniciar.",
    codex_ativo:ownerOfRun?"Registre cada noite após a confirmação da Omnibees.":"Este pedido já foi assumido.",
    codex_salvo:"Gravação confirmada na Omnibees.",failed:"Pedido interrompido."};
  status.textContent=(labels[job.state] || job.state)+" Noites gravadas: "+job.done+".";
  if (!ownerOfRun) return;
  date=job.dates ? job.dates[job.done] : new Date(Date.parse(job.start)+job.done*86400000).toISOString().slice(0,10);
  el("#data").textContent="Noite de "+br(date);
  const tbody=el("tbody");
  tbody.replaceChildren();
  for (const row of job.rows.filter(row=>row.date===date)) {
    const tr=tbody.insertRow();
    tr.insertCell().textContent=properties[job.hotel].rooms[row.code];
    tr.insertCell().textContent=row.targetOccupied;
  }
  save.textContent="Registrar "+br(date)+" salva na Omnibees";
}
async function act(action) {
  start.disabled=save.disabled=stop.disabled=true;
  try {
    const result=await api(action);
    if (result.token) token=result.token;
    job={...job,...result};
    render();
  } catch(e) {
    // A resposta pode ter se perdido depois de o servidor registrar a noite.
    try {job=await api(); render();} catch {start.hidden=save.hidden=true;}
    status.textContent+=" "+e.message+" Confira o andamento antes de continuar.";
  } finally {start.disabled=save.disabled=stop.disabled=false;}
}
start.addEventListener("click",async event=>{
  if (start.disabled || job?.state!=="codex_pendente") return;
  // A extensão 1.4.0 aciona este controle com button.click() após o comando no painel.
  if (!event.isTrusted) return act("iniciarCodex");
  start.disabled=true;
  try {
    await api("confirmarCodex");
    const destino=new URL(location.href);
    destino.hash="abrir-extensao";
    if (window===window.top) {
      history.replaceState(null,"",destino);
      location.reload();
    } else window.top.location.href=destino.href;
  } catch(e) {
    status.textContent=e.message;
    start.disabled=false;
  }
});
save.addEventListener("click",()=>act("registrarNoiteCodex"));
next.addEventListener("click",async event=>{
  if (event.isTrusted || next.disabled || job?.state!=="codex_salvo" || !token) return;
  const nextId=Number(next.dataset.id);
  next.disabled=true;
  try {
    await api("confirmarCodex",nextId);
    const nextJob=await api(undefined,nextId);
    if (nextJob.state!=="codex_pendente" || nextJob.id!==nextId) throw Error("O próximo pedido não está pendente.");
    const url=new URL(location.href);
    url.searchParams.set("id",nextId);
    url.hash="";
    history.replaceState(null,"",url);
    sessionStorage.setItem("inventario.ultimo",nextId);
    id=nextId;
    job=nextJob;
    token=date=undefined;
    render();
  } catch(e) {
    status.textContent+=" "+e.message+" O lote foi pausado.";
    next.disabled=false;
  }
});
stop.addEventListener("click",()=>{
  if (window.confirm("Interromper o pedido "+id+"? Confirme que a gravação parou. As noites já salvas permanecem na Omnibees."))
    act("interromperCodex");
});
try {
  await window.suedsManagerAuthReady;
  if (!Number.isSafeInteger(id) || id<1) throw Error("Número do pedido inválido.");
  job=await api();
  render();
} catch(e) {status.textContent=e.message;}
