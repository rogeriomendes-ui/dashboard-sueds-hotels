import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {request} from "node:http";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {servidor} from "./conector-codex.mjs";

test("entrega autenticada e única, inclusive ao repetir o clique após reiniciar",async t=>{
  const pasta=await mkdtemp(join(tmpdir(),"sueds-codex-"));
  t.after(()=>rm(pasta,{recursive:true,force:true}));
  const recibo="91ce9d17-38dc-4677-9178-87fdc9135b3c";
  const pedido={id:42,recibo};
  const mensagens=[];
  async function iniciar() {
    const server=servidor({pasta,validar:async p=>{if(p.recibo!==recibo) throw Object.assign(Error("Inválido"),{status:409});},
      enfileirar:async texto=>{mensagens.push(texto);}});
    server.listen(0,"127.0.0.1");await once(server,"listening");
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    return "http://127.0.0.1:"+server.address().port;
  }
  let url=await iniciar();
  const headers={Origin:"https://portalsueds.com.br",Host:"127.0.0.1:41857","Content-Type":"application/json"};
  const post=(body,extra={})=>new Promise((resolve,reject)=>{
    const req=request(url+"/pedido",{method:"POST",headers:{...headers,...extra}},res=>{
      res.resume(); res.on("end",()=>resolve({status:res.statusCode}));
    });
    req.on("error",reject); req.end(JSON.stringify(body));
  });
  assert.equal((await post(pedido,{Origin:"https://example.org"})).status,403);
  assert.equal((await post(pedido,{Host:"example.org"})).status,403);
  assert.equal((await post({...pedido,comando:"texto"})).status,400);
  assert.equal((await post({...pedido,recibo:"00000000-0000-4000-8000-000000000000"})).status,409);
  assert.equal(mensagens.length,0);
  const respostas=await Promise.all([post(pedido),post(pedido)]);
  assert.deepEqual(respostas.map(r=>r.status),[200,200]);
  url=await iniciar();
  assert.equal((await post(pedido)).status,200);
  assert.equal(mensagens.length,1);
  assert.match(mensagens[0],/pedido-inventario-codex\.html\?id=42/);
  assert.ok(!mensagens[0].includes(recibo));
});
