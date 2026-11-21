const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const handlerPath = require.resolve("../../api/portal/inventario-pontual");
const date = (new Date().getFullYear()+1) + "-03-08";
const nextDay = date.slice(0,8) + "09";
const hotel = "SUEDS PLAZA";
const portalHost = "portalsueds.com.br";
const categories = [["STD",89,65],["LX",20,19],["MAS",7,7]];
const rows = categories.map(([code,capacity,available]) => ({
  code, hotel, date, capacity, available, status:"Captura disponível", capturedAt:"2026-11-20T12:00:00Z",
  targetAvailable:Math.floor(available*4/5), targetOccupied:capacity-Math.floor(available*4/5)
}));

function fixture() {
  let job = { id:7, source:"inventario_pontual_v1", period_date:null,
    payload:{ owner:"gestor", state:"preview", revision:"original", hotel, start:date, end:date, rows, done:0 } };
  function table() {
    const filters = [];
    let changes;
    return {
      select(fields) { this.fields=fields; return this; }, order() { return this; }, limit() { return this; },
      eq(key,value) { filters.push([key,value]); return this; },
      in(key,values) { filters.push([key,values]); return this; },
      update(newValues) { changes = newValues; return this; },
      maybeSingle() {
        for (const [key,value] of filters) {
          const actual = key.startsWith("payload->>") ? job.payload[key.slice("payload->>".length)] : job[key];
          if (Array.isArray(value) ? !value.includes(actual) : String(actual)!==String(value)) return {data:null};
        }
        if (changes) job = {...job,...changes};
        if (this.fields?.includes("expires:")) return {data:{id:job.id,expires:String(job.payload.entregarAte)}};
        return {data:structuredClone(job)};
      }
    };
  }
  const original = Module._load;
  const originalSecret = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SECRET_KEY = "fixture";
  Module._load = function(name,parent,...rest) {
    if (parent?.filename === handlerPath) {
      if (name === "@supabase/supabase-js") return {createClient:()=>({from:table})};
      if (name === "../../lib/portal-auth") return {supabaseConfig:()=>({url:"https://local.invalid"}),json:(_,status,data)=>({status,data})};
      if (name === "../../server") return {inventoryOccupancy:()=>{throw Error("Consulta de ocupação inesperada");}};
    }
    return original.call(this,name,parent,...rest);
  };
  let handler;
  try { delete require.cache[handlerPath]; handler = require(handlerPath); }
  finally { Module._load = original; }
  return {
    request(body,search="",user="gestor",roles=["admin_geral"]) {
      return handler({body, method:body?"POST":"GET",url:"/api/portal/inventario-pontual"+search,
        headers:{host:portalHost,origin:"https://"+portalHost,"content-type":"application/json"},portalProfile:{id:user,roles}},{});
    },
    get job() { return job; },
    recibo(body) { return handler.validarRecibo({method:"POST",body},{}); },
    close() {
      if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
      else process.env.SUPABASE_SECRET_KEY = originalSecret;
    }
  };
}

test("confirma, confere e encerra o mesmo pedido de uma noite", async t => {
  const api = fixture();
  t.after(()=>api.close());
  const confirm = {action:"confirmarAssistido",id:7};
  const lookup = "?id=7&modo=assistido";
  assert.equal((await api.request(confirm,"","outro")).status,403);
  assert.equal((await api.request(confirm,"","gestor",[])).status,403);
  api.job.payload.end = nextDay;
  assert.equal((await api.request(confirm)).status,400);
  api.job.payload.end = date;
  assert.equal((await api.request(confirm)).data.state,"assisted");
  assert.equal((await api.request(null,"?retomar=assistido")).data.pendingId,7);
  assert.equal((await api.request(null,"?retomar=assistido","outro")).data.pendingId,null);
  assert.equal((await api.request({action:"claim"})).data.job,null);
  assert.equal((await api.request({action:"confirm",id:7})).data.state,"assisted");
  assert.equal((await api.request(null,lookup,"outro")).status,404);
  const {data:plan} = await api.request(null,lookup);
  assert.deepEqual(plan.rooms.map(r=>r.available),[52,15,5]);
  const read = {hotel:plan.hotel,date:plan.date,rooms:plan.rooms};
  const finish = leitura => ({action:"conferirAssistido",id:7,leitura});
  for (const wrong of [
    {...read,hotel:"Sueds Premium"}, {...read,date:nextDay}, {...read,rooms:read.rooms.slice(1)},
    {...read,rooms:[read.rooms[0],read.rooms[0],read.rooms[2]]},
    ...["available","occupied","capacity"].map(key=>({...read,rooms:read.rooms.map((r,i)=>i?r:{...r,[key]:r[key]-1})}))
  ]) {
    assert.equal((await api.request(finish(wrong))).status,409);
    assert.equal(api.job.payload.state,"assisted");
  }
  assert.equal((await api.request(finish(read),"","outro")).status,403);
  const results = await Promise.all([api.request(finish(read)),api.request(finish(read))]);
  assert.ok(results.some(r=>r.status===200));
  assert.ok(results.every(r=>[200,409].includes(r.status)));
  assert.equal(api.job.payload.done,1);
  const revision = api.job.payload.revision;
  assert.equal((await api.request(finish(read))).data.id,7);
  assert.equal(api.job.payload.revision,revision);
});

test("transferência da fila respeita quem tomou o pedido primeiro", async t => {
  const api = fixture();
  t.after(()=>api.close());
  const confirm = {action:"confirmarAssistido",id:7};
  api.job.payload.state = "queued";
  assert.equal((await api.request(confirm)).data.state,"assisted");
  api.job.payload.state = "running";
  assert.equal((await api.request(confirm)).status,409);
});

test("Codex recebe só a prévia confirmada, assume uma vez e registra as noites em ordem",async t=>{
  const api=fixture(); t.after(()=>api.close());
  const call=(action,data={})=>api.request({action,id:7,...data});
  api.job.payload.end=nextDay;
  api.job.payload.rows=[...rows,...rows.map(r=>({...r,date:nextDay}))];
  assert.equal((await call("iniciarCodex")).status,403);
  const confirm={action:"confirmarCodex",id:7};
  assert.equal((await api.request(confirm,"","outra")).status,403);
  assert.equal((await api.request(confirm,"","gestor",[])).status,403);
  const {data:receipt}=await api.request(confirm);
  assert.equal(receipt.state,"codex_pendente");
  assert.equal((await api.request(confirm)).data.recibo,receipt.recibo);
  assert.equal((await api.recibo({id:7,recibo:receipt.recibo})).data.id,7);
  assert.equal((await api.recibo({id:7,recibo:"00000000-0000-4000-8000-000000000000"})).status,404);
  assert.equal((await api.request({action:"claim"})).data.job,null);
  assert.equal((await api.request(null,"?modo=codex&id=7","outra")).status,404);
  const [one,two]=await Promise.all([call("iniciarCodex"),call("iniciarCodex")]);
  assert.deepEqual([one.status,two.status].sort(),[200,409]);
  const {token}=(one.status===200?one:two).data;
  assert.equal((await api.recibo({id:7,recibo:receipt.recibo})).status,404);
  assert.equal((await api.request({action:"claim"})).data.job,null);
  assert.equal(api.job.period_date,"1970-01-01");
  assert.equal((await call("registrarNoiteCodex",{date})).status,409);
  assert.equal((await call("registrarNoiteCodex",{date:nextDay,token})).status,409);
  assert.equal((await call("registrarNoiteCodex",{date,token})).data.done,1);
  assert.equal((await call("registrarNoiteCodex",{date,token})).status,409);
  assert.equal((await call("registrarNoiteCodex",{date:nextDay,token})).data.state,"codex_salvo");
  assert.equal(api.job.period_date,null);
  assert.equal((await api.request(confirm)).status,409);
});
test("recibo vencido ou pedido interrompido não inicia uma gravação",async t=>{
  const api=fixture(); t.after(()=>api.close());
  const call=action=>api.request({id:7,action});
  const {data:receipt}=await call("confirmarCodex");
  api.job.payload.entregarAte=Date.now()-1;
  assert.equal((await api.recibo({id:7,recibo:receipt.recibo})).status,404);
  assert.equal((await call("iniciarCodex")).status,409);
  assert.notEqual((await call("confirmarCodex")).data.recibo,receipt.recibo);
  assert.equal((await call("interromperCodex")).data.state,"failed");
  assert.equal((await call("iniciarCodex")).status,409);
});

test("clique no Portal entrega ao conector e a tela do pedido registra o resultado",{
  skip:!process.env.INVENTARIO_CHROME_TESTE,timeout:45000
},async t=>{
  const {chromium}=require("playwright-core");
  const {readFile,mkdtemp,rm}=require("node:fs/promises");
  const {resolve,join}=require("node:path");
  const {once}=require("node:events");
  const {tmpdir}=require("node:os");
  const {servidor}=await import("./conector-codex.mjs");
  const api=fixture(); t.after(()=>api.close());
  const pasta=await mkdtemp(join(tmpdir(),"sueds-clique-")); t.after(()=>rm(pasta,{recursive:true,force:true}));
  const msgs=[];
  const server=servidor({pasta,validar:async p=>assert.equal((await api.recibo(p)).status,200),enfileirar:async msg=>msgs.push(msg)});
  server.listen(41857,"127.0.0.1"); await once(server,"listening");
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const browser=await chromium.launch({executablePath:process.env.INVENTARIO_CHROME_TESTE,headless:true});
  t.after(()=>browser.close());
  const ctx=await browser.newContext({serviceWorkers:"block"});
  const origin="https://portalsueds.com.br";
  const page=await ctx.newPage();
  const erros=[];
  page.on("console",msg=>{if(msg.type()==="error") erros.push(msg.text());});
  page.on("requestfailed",req=>erros.push(req.url()+" "+req.failure()?.errorText));
  const cdp=await ctx.newCDPSession(page);
  const {targetInfo}=await cdp.send("Target.getTargetInfo");
  await cdp.send("Browser.setPermission",{permission:{name:"loopback-network"},setting:"granted",origin,browserContextId:targetInfo.browserContextId});
  const assets=new Set(["atualizacoes-inventario.html","atualizacoes-inventario.mjs","inventario-regra.mjs",
    "pedido-inventario-codex.html","pedido-inventario-codex.mjs"]);
  await ctx.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if (url.origin==="http://127.0.0.1:41857") return route.continue();
    if (url.origin!==origin) return route.abort();
    if (url.pathname==="/gestores") return route.fulfill({contentType:"text/html",body:'<iframe src="/atualizacoes-inventario.html"></iframe>'});
    if (url.pathname==="/manager-auth.js") return route.fulfill({contentType:"text/javascript",body:'window.suedsManagerAuthReady=Promise.resolve(true)'});
    if (url.pathname==="/api/portal/inventario-pontual") {
      const b=route.request().postDataJSON();
      if (b?.action==="preview") return route.fulfill({json:{...b,id:7,rows,canSend:true}});
      const result=await api.request(b,url.search);
      return route.fulfill({status:result.status,json:result.data});
    }
    const asset=url.pathname.slice(1);
    if (!assets.has(asset)) return route.fulfill({status:204,body:""});
    return route.fulfill({body:await readFile(resolve(__dirname,"../../public",asset)),contentType:asset.endsWith(".html")?"text/html; charset=utf-8":"text/javascript; charset=utf-8"});
  });
  await page.goto(origin+"/gestores");
  const module=page.frameLocator("iframe");
  await module.locator("[name=hotel]").selectOption(hotel);
  for (const key of ["start","end"]) await module.locator("[name="+key+"]").fill(date);
  await module.getByText("Gerar prévia").click();
  await module.locator("#codex").waitFor();
  assert.equal(msgs.length,0);
  await module.locator("#codex").click();
  try {await module.getByText(/Pedido recebido pelo conector/).waitFor({timeout:12000});}
  catch(e) {throw Error("Entrega pelo Chrome: "+await module.locator("#estado").innerText()+" "+erros.join(" / "),{cause:e});}
  assert.equal(msgs.length,1);
  await module.locator("#entregar-codex").click();
  await module.getByText(/Pedido recebido pelo conector/).waitFor();
  const detail=await ctx.newPage();
  await detail.goto(msgs[0].match(/https:\/\/[^ ]+/)[0]);
  await detail.getByRole("button",{name:"Assumir este pedido"}).click();
  await detail.locator("#registrar").waitFor();
  assert.deepEqual(await detail.locator("tbody tr td:nth-child(2)").allTextContents(),rows.map(r=>String(r.targetOccupied)));
  assert.equal(msgs.length,1);
  await detail.locator("#registrar").click();
  await detail.getByText(/Gravação confirmada na Omnibees/).waitFor();
  assert.equal(api.job.payload.state,"codex_salvo");
});
