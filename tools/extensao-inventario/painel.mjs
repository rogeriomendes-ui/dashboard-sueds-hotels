import { lerTela, parseGrade } from "./grade.mjs";

const load = document.querySelector("#carregar");
const verify = document.querySelector("#conferir");
const section = document.querySelector("#pedido");
const status = document.querySelector("#mensagem");
let pedido, portalTab;

// Runs in the Portal tab that owns the confirmed preview. The caller cannot supply a URL.
async function pedidoNoPortal(id, leitura) {
  try {
    const page = new URL(location.href);
    if (page.origin !== "https://portalsueds.com.br" || !(page.pathname === "/atualizacoes-inventario.html" ||
        (page.pathname === "/gestores" && page.searchParams.get("modulo") === "inventario")))
      throw Error("Abra Atualizações de inventário no Portal Sueds.");
    const current = Number(sessionStorage.getItem("inventario.ultimo"));
    if (!Number.isSafeInteger(current) || current <= 0) throw Error("Confirme a prévia no modo assistido antes de carregar.");
    if (id !== null && id !== current) throw Error("O pedido selecionado no Portal mudou. Carregue o pedido novamente.");
    const path = "/api/portal/inventario-pontual";
    const response = leitura ? await fetch(path, {
      method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin",
      body:JSON.stringify({ action:"conferirAssistido", id:current, leitura })
    }) : await fetch(path + "?modo=assistido&id=" + current, {cache:"no-store", credentials:"same-origin"});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Confira o acesso ao Portal.");
    return data;
  } catch (e) { return {error:e.message}; }
}

async function executarNaAba(tabId, func, args = []) {
  const [frame] = await chrome.scripting.executeScript({ target:{tabId}, func, args });
  if (!frame?.result || frame.result.error) throw Error(frame?.result?.error || "Reabra a aba e tente novamente.");
  return frame.result;
}
async function abaAtiva(origin, instruction) {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.url || new URL(tab.url).origin !== origin) throw Error(instruction);
  return tab.id;
}
function render(plan) {
  document.querySelector("#hotel").textContent = plan.hotel + " · " + plan.date.split("-").reverse().join("/");
  document.querySelector("#identificador").textContent = "Pedido " + plan.id;
  const body = document.querySelector("tbody");
  body.replaceChildren();
  for (const room of plan.rooms) {
    const row = body.insertRow();
    for (const value of [room.name,room.occupied,room.available]) row.insertCell().textContent = value;
  }
  section.hidden = false;
}
async function atender(work) {
  load.disabled = verify.disabled = true;
  status.textContent = "";
  try { await work(); }
  catch (e) { status.textContent = e.message; }
  finally { load.disabled = verify.disabled = false; }
}
load.addEventListener("click", () => atender(async () => {
  pedido = null;
  section.hidden = true;
  portalTab = await abaAtiva("https://portalsueds.com.br", "Selecione a aba de atualizações do Portal para carregar o pedido.");
  pedido = await executarNaAba(portalTab,pedidoNoPortal,[null,null]);
  render(pedido);
}));
verify.addEventListener("click", () => atender(async () => {
  if (!pedido) return;
  const tabId = await abaAtiva("https://myhotel2.omnibees.com", "Selecione a aba do inventário da Omnibees para conferir.");
  const {hotel,date,text} = await executarNaAba(tabId,lerTela);
  const {rows} = parseGrade(text,pedido.rooms.map(room => room.name));
  const rooms = Object.entries(rows).map(([name,counts]) => ({name,...counts}));
  const saved = await executarNaAba(portalTab,pedidoNoPortal,[pedido.id,{hotel,date,rooms}]);
  if (saved.state !== "finish" || saved.id !== pedido.id) throw Error("Confira o andamento do pedido no Portal.");
  status.textContent = "Pedido " + saved.id + " conferido e concluído no Portal.";
  pedido = null;
  section.hidden = true;
}));
