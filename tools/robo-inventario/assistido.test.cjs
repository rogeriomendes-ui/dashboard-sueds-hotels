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
      select() { return this; }, order() { return this; }, limit() { return this; },
      eq(key,value) { filters.push([key,value]); return this; },
      update(newValues) { changes = newValues; return this; },
      maybeSingle() {
        for (const [key,value] of filters) {
          const actual = key.startsWith("payload->>") ? job.payload[key.slice("payload->>".length)] : job[key];
          if (String(actual) !== String(value)) return {data:null};
        }
        if (changes) job = {...job,...changes};
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
