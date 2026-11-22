const {randomUUID,createHash} = require("node:crypto");

const clock = new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const kind = "agenda_inventario";
function invalid(message,status=400) { throw Object.assign(new Error(message),{status}); }

function period(config, now) {
  const [today,time] = clock.format(now).split(" ");
  if (!config.enabled || time < config.time || !config.days.includes(new Date(today).getUTCDay())) return null;
  if (config.period==="fixed" && today>config.start) return null;
  const last = new Date(today);
  last.setUTCMonth(last.getUTCMonth()+1,0);
  return {day:today,start:config.period==="fixed"?config.start:today,
    end:config.period==="fixed"?config.end:last.toISOString().slice(0,10)};
}

function configuration(c,properties,validPeriod,today) {
  if (!c || !Array.isArray(c.hotels) || !c.hotels.length || c.hotels.some(h=>!Object.hasOwn(properties,h)||!properties[h]?.rooms)
      || !Array.isArray(c.days) || !c.days.length || c.days.some(d=>!Number.isInteger(d)||d<0||d>6)
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.time) || !["fixed","month"].includes(c.period)
      || !["review","auto"].includes(c.mode) || typeof c.enabled!=="boolean") invalid("Confira hotéis, dias, horário e modo.");
  if (c.period==="fixed" && (!validPeriod(c.start,c.end) || (c.enabled && c.start<today))) invalid("Confira as datas fixas do agendamento.");
  return {hotels:[...new Set(c.hotels)],days:[...new Set(c.days)].sort(),time:c.time,mode:c.mode,enabled:c.enabled,
    period:c.period,...(c.period==="fixed"?{start:c.start,end:c.end}:{})};
}

function view(row,now,details=false) {
  const {config,revision,lastDay,run,history}=row.payload;
  const due=period(config,now);
  return {id:row.id,revision,config,history:details?history:undefined,
    due:!run && !!due && due.day!==lastDay,
    run:run && {day:run.day,state:run.state,message:run.message,done:run.done,total:run.nights.length,
      preview:details && run.state==="review"?run.nights:undefined}};
}

async function schedule(params,retry=true) {
  const {body:b,details,owner,table,query,one,update,source,writerSlot,inventoryOccupancy,properties,validPeriod,revisarPorNoite}=params;
  const now=new Date(), today=clock.format(now).slice(0,10);
  const list=()=>query().eq("payload->>owner",owner).eq("payload->>kind",kind);
  if (!b) {
    if (!details) {
      const {data,error}=await table().select("id,config:payload->config,revision:payload->>revision,lastDay:payload->>lastDay,state:payload->run->>state")
        .eq("source",source).eq("payload->>owner",owner).eq("payload->>kind",kind);
      if (error) invalid("Falha ao consultar os agendamentos.",503);
      return {schedules:data.map(row=>{
        const range=period(row.config,now);
        return {id:row.id,revision:row.revision,due:!row.state && !!range && row.lastDay!==range.day,
          run:row.state?{state:row.state}:null};
      })};
    }
    const {data,error}=await list().order("id");
    if (error) invalid("Falha ao consultar os agendamentos.",503);
    return {schedules:data.map(row=>view(row,now,details))};
  }
  if (b.action==="agendaSalvar" && !b.id) {
    const config=configuration(b.config,properties,validPeriod,today);
    const payload={kind,owner,mode:"codex",config,revision:randomUUID(),history:[],run:null};
    return view(await one(table().insert({source,period_month:today.slice(0,7),payload}).select("id,payload")),now);
  }
  const row=await one(list().eq("id",b.id));
  if (!row) invalid("Agendamento indisponível.",404);
  const p=row.payload, run=p.run;
  const canceling=run?.state==="canceling";
  const sameExecution=b.action==="agendaCancelar" && run && b.day===run.day;
  if (p.revision!==b.revision && !sameExecution && !(canceling && b.revision===run.previousRevision))
    invalid("O agendamento mudou. Atualize a consulta.",409);
  const save=async(changes,slot=null)=>{
    const saved=await update(row,changes,slot);
    if (!saved && retry && ["agendaCancelar","agendaRegistrar"].includes(b.action)) return schedule(params,false);
    if (!saved) invalid("O agendamento mudou. Atualize a consulta.",409);
    return view(saved,now);
  };
  if (b.action==="agendaSalvar" && !run) return save({config:configuration(b.config,properties,validPeriod,today)});
  if (b.action==="agendaPreparar" && !run) {
    const range=period(p.config,now);
    if (!range || p.lastDay===range.day) invalid("Não há execução prevista.",409);
    const {linhasInventario}=await import("../public/inventario-kpi.mjs");
    const nights=[];
    for (const hotel of p.config.hotels) {
      const map=await inventoryOccupancy(range.start,range.end,hotel);
      const rows=linhasInventario(map.occupancy);
      const review=revisarPorNoite(rows,hotel,range.start,range.end);
      if (review.issue || review.skipped.length) {
        return save({lastDay:range.day,history:[{day:range.day,done:0,state:"Falha na prévia",message:hotel+" · "+(review.issue||"Categorias divergentes.")},...p.history].slice(0,30)});
      }
      for (const date of review.dates) nights.push({hotel:properties[hotel].name,date,rows:rows.filter(r=>r.date===date)
        .map(r=>({room:properties[hotel].rooms[r.code],quantity:String(r.targetOccupied)}))});
    }
    return save({lastDay:range.day,run:{day:range.day,nights,done:0,state:p.config.mode==="review"?"review":"ready"}});
  }
  if (!run) invalid("Sem execução pendente.",409);
  if (b.action==="agendaAprovar" && run.state==="review") return save({run:{...run,state:"ready"}});
  const finish=(state,message,done=run.done)=>save({run:null,history:[{day:run.day,state,message,done,total:run.nights.length},...p.history].slice(0,30)});
  if (sameExecution && canceling) return view(row,now);
  if (sameExecution && run.state==="running") {
    return save({run:{...run,state:"canceling",previousRevision:p.revision}},writerSlot);
  }
  if (b.action==="agendaCancelar" && ["review","login","error","ready"].includes(run.state)) return finish("Cancelado","");
  if (b.action==="agendaRetomar" && run.state==="error") return save({run:{...run,state:"ready",message:""}},run.device?writerSlot:null);
  if (!/^[a-f0-9-]{36}$/i.test(b.device || "")) invalid("Identificação da extensão inválida.");
  const device=createHash("sha256").update(b.device).digest("hex");
  if (run.device && run.device!==device) invalid("Execução em outro Chrome.",409);
  if (canceling && ["agendaCategoria","agendaNoite","agendaErro","agendaLogin"].includes(b.action)) {
    const pending=run.nights[run.done];
    return finish("Cancelado","Última noite pendente: "+pending.hotel+" · "+pending.date+". Categorias já gravadas na Omnibees foram preservadas.");
  }
  if (b.action==="agendaCategoria" && run.state==="running") return view(row,now);
  if (b.action==="agendaLogin" && ["ready","running","login"].includes(run.state)) {
    if(run.state==="login") return view(row,now);
    return save({run:{...run,state:"login",message:"Aguardando login na Omnibees"}},run.device?writerSlot:null);
  }
  if (b.action==="agendaNoite" && ["ready","login","running"].includes(run.state)) {
    const night=run.nights[run.done];
    if(night.date<today) return finish("Interrompido","A próxima noite já passou.");
    const result=run.state==="running"?view(row,now):await save({run:{...run,device,state:"running",message:""}},writerSlot);
    return {...result,night};
  }
  if (b.action==="agendaErro" && run.state==="running") return save({run:{...run,state:"error",message:String(b.message||"Confira a Omnibees.").slice(0,300)}},writerSlot);
  if (b.action==="agendaRegistrar" && (run.state==="running" || canceling)) {
    const night=run.nights[run.done];
    const sameRows=Array.isArray(b.rows) && b.rows.length===night.rows.length &&
      night.rows.every((expected,index)=>b.rows[index]?.room===expected.room && b.rows[index]?.quantity===expected.quantity);
    if (b.hotel!==night.hotel || b.date!==night.date || !sameRows) invalid("Grade diferente da noite esperada.",409);
    const done=run.done+1;
    if (canceling && done<run.nights.length) return finish("Cancelado","Última noite conferida antes da parada.",done);
    if (done===run.nights.length) return save({run:null,history:[{day:run.day,state:"Concluído",done,total:done},...p.history].slice(0,30)});
    return save({run:{...run,done}},writerSlot);
  }
  invalid("Ação indisponível para o estado atual.",409);
}
module.exports={schedule,period,configuration};
