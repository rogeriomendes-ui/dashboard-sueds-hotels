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
  await assert.rejects(act("agendaRegistrar",{...night,rows:night.rows.map(r=>({...r,quantity:"0"}))}),/Grade diferente/);
  await act("agendaRegistrar",{...night,rows:night.rows.map(({room,quantity})=>({quantity,room}))});
  assert.equal(slot,null);
  assert.equal(stored.payload.history[0].done,1);
  await assert.rejects(act("agendaPreparar"),/prevista/);
  assert.deepEqual(configuration({...c,hotels:["SUEDS TRANCOSO"]},rules.properties,rules.validPeriod,today).hotels,["SUEDS TRANCOSO"]);
  assert.throws(()=>configuration({...c,hotels:["CASAS SUEDS ARRAIAL"]},rules.properties,rules.validPeriod,today));
});

test("cancelamento durante a grade protege a execução e preserva o progresso",async()=>{
  const {createHash}=require("node:crypto");
  const day="2026-11-22",device=randomUUID(),otherDevice=randomUUID();
  const night={hotel:"Sueds Cabralia",date:"2027-10-02",rows:[{room:"Apartamento Standard",quantity:"6"}]};
  const base={id:940,payload:{revision:"v2",config,history:[],lastDay:day,run:{day,done:1,state:"running",
    device:createHash("sha256").update(device).digest("hex"),nights:[{...night,date:"2027-10-01"},night,{...night,date:"2027-10-03"}]}}};
  for(const finishingNight of [false,true]){
    let row=structuredClone(base),slot="locked";
    const builder={eq(){return this;}};
    const act=(action,extra={})=>schedule({query:()=>builder,one:async()=>row,writerSlot:"locked",
      update:async(current,changes,newSlot)=>{slot=newSlot;row={...current,payload:{...current.payload,...changes,revision:randomUUID()}};return row;},
      body:{action,id:940,revision:"v2",device,...extra}});
    await assert.rejects(act("agendaCancelar",{day:"2026-11-15",revision:"v1"}),/mudou/);
    assert.equal((await act("agendaCancelar",{day,revision:"v1"})).run.state,"canceling");
    assert.equal(slot,"locked");
    await assert.rejects(act("agendaCategoria",{device:otherDevice}),/outro Chrome/);
    if(finishingNight){
      await assert.rejects(act("agendaRegistrar",{...night,rows:[]}),/Grade diferente/);
      await act("agendaRegistrar",night);
    }else await act("agendaCategoria");
    assert.equal(row.payload.run,null);
    assert.equal(row.payload.history[0].done,finishingNight?2:1);
    assert.equal(row.payload.history[0].state,"Cancelado");
    assert.equal(row.payload.lastDay,day);
    assert.deepEqual(row.payload.config,config);
    assert.equal(slot,null);
    await assert.rejects(act("agendaNoite"),/mudou/);
  }
});

test("retoma a execução antiga na primeira noite pendente e preserva o plano nos próximos cancelamentos",async()=>{
  const rules=await import("../../public/inventario-regra.mjs");
  const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
  const hotels=["SUEDS CABRALIA","SUEDS PREMIUM"],start="2027-10-01",end="2027-10-03",date="2027-10-02";
  let row={id:9,payload:{revision:"initial",lastDay:day,config:{...config,hotels,start,end,period:"fixed",mode:"auto"},
    history:[{state:"Cancelado",day,done:4,total:6}],run:null}};
  const calls=[],builder={eq(){return this;}};
  const device=randomUUID();
  const act=(action,extra={})=>schedule({...rules,body:{id:9,action,revision:row.payload.revision,device,...extra},
    query:()=>builder,one:()=>row,update:async(_,changes)=>{row={...row,payload:{...row.payload,...changes,revision:randomUUID()}};return row;},
    inventoryOccupancy:async(s,e,h)=>{calls.push([s,e,h]);return {occupancy:[{hotel:h,days:[date,end].map(date=>({date,apartments:10,available:8,
      capturedAt:new Date().toISOString(),roomTypes:[{code:"STD",apartments:10,available:8}]}))}]};}});
  const args={day,date,hotel:hotels[1],confirmedOrder:true};
  await assert.rejects(act("agendaRetomarHoje",{...args,confirmedOrder:false}));
  await assert.rejects(act("agendaRetomarHoje",{...args,date:start}));
  const first=await act("agendaRetomarHoje",args);
  assert.equal(first.run.done,4);
  assert.deepEqual(calls,[[date,end,hotels[1]]]);
  await assert.rejects(act("agendaRetomarHoje",args));
  const {night}=await act("agendaNoite");
  assert.deepEqual([night.hotel,night.date],["Sueds Premium",date]);
  await act("agendaRegistrar",night);
  await act("agendaCancelar",{day});await act("agendaCategoria");
  const restored=await act("agendaRetomarHoje",{day,date:end,hotel:night.hotel});
  assert.equal(restored.run.done,5);
  assert.equal((await act("agendaNoite")).night.date,end);
  assert.equal(calls.length,1);
});
