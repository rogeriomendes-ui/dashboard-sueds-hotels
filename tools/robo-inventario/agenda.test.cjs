const test=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {period,schedule,configuration}=require("../../lib/inventario-agenda");
const config={enabled:true,period:"month",days:[0,1,2,3,4,5,6],hotels:["SUEDS CABRALIA"],time:"00:00",mode:"review"};

test("usa o dia da semana e a virada do mês de Brasília",()=>{
  const c={...config,days:[6],time:"23:30"};
  assert.deepEqual(period(c,new Date("2026-11-01T02:45:00Z")),{day:"2026-10-31",start:"2026-10-31",end:"2026-10-31"});
  assert.equal(period(c,new Date("2026-11-01T03:45:00Z")),null);
  assert.equal(period(c,new Date("2026-11-01T02:29:00Z")),null);
});

test("revisa, aprova, espera login, confere e registra uma única vez",async()=>{
  const rules=await import("../../public/inventario-regra.mjs");
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
  const c={...config,start:today,end:today,period:"fixed"};
  let stored={id:90,payload:{config:c,kind:"agenda_inventario",owner:"a",revision:"a",history:[],run:null}}, slot=null;
  const builder={eq(){return this}};
  const deps={...rules,owner:"a",source:"test",writerSlot:"1970-01-01",query:()=>builder,one:async()=>stored,
    update:async(row,changes,nextSlot)=>{assert.equal(stored.payload.revision,row.payload.revision);
      slot=nextSlot;stored={id:90,payload:{...row.payload,...changes,revision:randomUUID()}};return stored;},
    inventoryOccupancy:async()=>({occupancy:[{hotel:c.hotels[0],days:[{date:today,apartments:29,available:19,capturedAt:new Date().toISOString(),
      roomTypes:[{code:"STD",apartments:29,available:19}]}]}]})};
  const device=randomUUID();
  const act=(action,extra={})=>schedule({...deps,body:{id:90,revision:stored.payload.revision,device,action,...extra}});
  assert.equal((await act("agendaPreparar")).run.state,"review");
  await assert.rejects(act("agendaNoite"),/indisponível/);
  await act("agendaAprovar");
  await act("agendaLogin");
  assert.equal(slot,null);
  const {night,revision}=await act("agendaNoite");
  assert.equal(slot,deps.writerSlot);
  assert.equal(night.rows[0].quantity,"14");
  await assert.rejects(act("agendaRegistrar",{...night,rows:[]}),/Grade diferente/);
  await assert.rejects(act("agendaNoite",{device:randomUUID()}),/outro Chrome/);
  await act("agendaLogin");
  assert.equal((await act("agendaNoite")).run.done,0);
  await assert.rejects(act("agendaRegistrar",{...night,revision}),/mudou/);
  await act("agendaRegistrar",night);
  assert.equal(slot,null);
  assert.equal(stored.payload.history[0].done,1);
  await assert.rejects(act("agendaPreparar"),/prevista/);
  assert.throws(()=>configuration({...c,hotels:["SUEDS TRANCOSO"]},rules.properties,rules.validPeriod,today));
});
