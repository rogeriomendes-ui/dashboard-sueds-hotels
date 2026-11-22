import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { planoAssistido, conferirLeitura } from "../../public/inventario-regra.mjs";

const extension = fileURLToPath(new URL("../extensao-inventario",import.meta.url));
const portal = "https://portalsueds.com.br";
const omni = "https://myhotel2.omnibees.com";
const date = "2027-03-08", hotel = "SUEDS PLAZA", id = 12;
const rows = [["STD",89,65],["LX",20,19],["MAS",7,7]].map(([code,capacity,available])=>({
  code, capacity, available, hotel, date, capturedAt:"2026-11-20T12:00:00Z", status:"Captura disponível",
  targetAvailable:Math.floor(available*4/5), targetOccupied:capacity-Math.floor(available*4/5)
}));
const plan = {id, ...planoAssistido({hotel,start:date,end:date,rows})};
const grade = plan.rooms.slice().reverse().map(r => `<div>${r.name}</div><div>Total de Apartamentos ${r.capacity}</div>
  <div>${r.capacity}</div><div>Ocupados</div><div>${r.occupied}</div><div>Total de Disponíveis</div><div>${r.available}</div>`).join("");

test("extensão instalada lê as duas abas e confere um único pedido", {timeout:120000}, async t => {
  // Both production hostnames are fulfilled from fixtures. DNS is disabled for this disposable profile.
  const context = await chromium.launchPersistentContext("", {
    ...(process.env.INVENTARIO_CHROMIUM && {executablePath:process.env.INVENTARIO_CHROMIUM}),
    channel:"chromium", headless:true, ignoreDefaultArgs:["--disable-extensions"],
    args:["--disable-extensions-except="+extension,"--load-extension="+extension,"--host-resolver-rules=MAP * ~NOTFOUND"]
  });
  t.after(()=>context.close());
  context.setDefaultTimeout(15000);
  await context.addCookies([{name:"sessao_teste",value:"simulada",url:portal,secure:true,httpOnly:true}]);
  const shell = "/gestores?modulo=inventario";
  let state = "preview", conclusions = 0;
  const mock = (route,data,status=200)=>route.fulfill({json:data,status});
  await context.route("https://**/*",async route=>{
    const url = new URL(route.request().url());
    if (url.origin === omni && url.pathname === "/" && route.request().method() === "GET")
      return route.fulfill({contentType:"text/html; charset=utf-8",body:`<header id="context-sh-context">Sueds Plaza</header>
        <h4>Inventário</h4><input id="tdt-excel-from-date" value="08/03/2027 — 08/03/2027">
        <div id="col">Seg<br>8<br>MAR</div>${grade}<div>TOTAIS DA PROPRIEDADE</div>`});
    if (url.origin !== portal) return route.abort();
    if (url.pathname === "/gestores") return route.fulfill({contentType:"text/html",body:'<iframe src="/atualizacoes-inventario.html"></iframe>'});
    if (url.pathname === "/api/portal/inventario-pontual") {
      const data = route.request().postDataJSON();
      const headers = await route.request().allHeaders();
      assert.match(headers.cookie || "",/sessao_teste=simulada/);
      if (data) assert.equal(headers.origin,portal);
      if (!data) {
        if (!url.searchParams.has("id")) return mock(route,{hotels:[hotel],canSend:true});
        assert.equal(Number(url.searchParams.get("id")),id);
        if (url.searchParams.has("modo")) return mock(route,plan);
        return mock(route,{id,hotel,start:date,end:date,state,done:conclusions});
      }
      if (data.action === "preview") return mock(route,{...data,id,rows,canSend:true});
      assert.equal(data.id,id);
      if (data.action === "confirmarAssistido") { state="assisted"; return mock(route,{id,state}); }
      if (data.action === "conferirAssistido") {
        assert.equal(state,"assisted");
        const error = conferirLeitura(plan,data.leitura);
        if (error) return mock(route,{error},409);
        conclusions++; state="finish"; return mock(route,{id,state});
      }
      throw Error("Ação inesperada: "+data.action);
    }
    if (["/atualizacoes-inventario.html","/atualizacoes-inventario.mjs","/inventario-regra.mjs"].includes(url.pathname)) {
      const content = await readFile(new URL("../../public"+url.pathname,import.meta.url));
      return route.fulfill({body:content,contentType:url.pathname.endsWith("html")?"text/html; charset=utf-8":"text/javascript; charset=utf-8"});
    }
    return route.fulfill({status:204,body:""});
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const panel = await context.newPage();
  await panel.goto(new URL("painel.html",worker.url()).href);
  const page = await context.newPage();
  await page.goto(portal+shell);
  page.on("dialog",d=>d.accept());
  const frame = page.frameLocator("iframe");
  await frame.getByRole("checkbox",{name:hotel,exact:true}).check();
  await frame.locator("input[name=start]").fill(date);
  await frame.locator("input[name=end]").fill("2027-03-09");
  // Fixed historical fixture for the extension contract, independent of the machine date.
  await frame.locator("form").evaluate(el=>{el.noValidate=true;});
  await frame.getByText("Gerar prévia").click();
  await frame.locator("#codex").waitFor({state:"visible"});
  assert.equal(await frame.locator("#enviar, #assistido").count(),0);
  await frame.locator("input[name=end]").fill(date);
  await frame.getByText("Gerar prévia").click();
  await frame.locator("#codex").waitFor({state:"visible"});
  // Retoma um pedido legado já enfileirado para testar a extensão assistida.
  state = "queued";
  await page.evaluate(id=>sessionStorage.setItem("inventario.ultimo",id),String(id));
  await page.reload();
  await frame.locator("#assumir").click();
  await frame.locator("#andamento").filter({hasText:/Abra a extensão/}).waitFor();
  await page.bringToFront();
  // Click the side panel document without changing the foreground tab, as Chrome does with its side panel.
  const press = selector => panel.locator(selector).evaluate(button=>button.click());
  await press("#carregar");
  await panel.getByText("Pedido "+id,{exact:true}).waitFor();
  assert.deepEqual(await panel.locator("tbody tr td:last-child").allTextContents(),["52","15","5"]);
  const inventory = await context.newPage();
  await inventory.goto(omni);
  await inventory.bringToFront();
  await inventory.locator("#col").evaluate(el=>{el.textContent="Ter 9 MAR";});
  await press("#conferir");
  await panel.getByText(/coluna da grade ainda/).waitFor();
  assert.equal(conclusions,0);
  await inventory.locator("#col").evaluate(el=>{el.innerHTML="Seg<br>8<br>MAR";});
  await inventory.locator("header").evaluate(el=>{el.textContent="Sueds Premium";});
  await press("#conferir");
  await panel.getByText(/propriedade aberta diverge/).waitFor();
  assert.equal(conclusions,0);
  await inventory.locator("header").evaluate(el=>{el.textContent="Sueds Plaza";});
  await page.evaluate(()=>sessionStorage.setItem("inventario.ultimo","13"));
  await press("#conferir");
  await panel.getByText(/pedido selecionado no Portal mudou/).waitFor();
  assert.equal(conclusions,0);
  await page.evaluate(id=>sessionStorage.setItem("inventario.ultimo",id),String(id));
  await press("#conferir");
  await panel.getByText(/conferido e concluído/).waitFor();
  assert.equal(conclusions,1);
});
