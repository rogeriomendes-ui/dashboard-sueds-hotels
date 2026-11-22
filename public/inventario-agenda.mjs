import {properties} from "./inventario-regra.mjs";
const endpoint="/api/portal/inventario-pontual";
const el=id=>document.getElementById(id);
const panel=el("agendamentos"), form=el("editar-agenda"), list=el("lista-agendas"), message=el("agenda-estado");
const days=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const states={review:"Aguardando aprovação da prévia",ready:"Aguardando a extensão",login:"Aguardando login na Omnibees",running:"Conferindo a grade",canceling:"Cancelamento solicitado. Aguardando a extensão encerrar a etapa atual",error:"Aguardando revisão"};
let editing,loading=false;
const br=value=>value.split("-").reverse().join("/");
function text(tag,value) { const node=document.createElement(tag); node.textContent=value; return node; }
function checkbox(group,name,value,label) {
  const input=document.createElement("input");
  input.type="checkbox";input.name=name;input.value=value;
  const wrap=document.createElement("label");wrap.className="availability-filter";
  wrap.append(input,label);group.append(wrap);
}
for (const [key,property] of Object.entries(properties)) if (property) checkbox(el("agenda-hoteis"),"hotel",key,property.name);
days.forEach((name,index)=>checkbox(el("agenda-dias"),"days",index,name));
function dates() {
  const fixed=form.elements.period.value==="fixed";
  el("agenda-datas").hidden=!fixed;
  for (const key of ["start","end"]) form.elements[key].required=fixed;
}
form.elements.period.onchange=dates;
function edit(item) {
  editing=item;
  form.reset();
  const c=item?.config || {days:[0,1,2,3,4,5,6],hotels:[],enabled:false,mode:"review",period:"month"};
  for (const key of ["time","period","mode","start","end"]) form.elements[key].value=c[key]||"";
  form.elements.enabled.checked=c.enabled;
  for (const input of form.querySelectorAll('[name="hotel"]')) input.checked=c.hotels.includes(input.value);
  for (const input of form.querySelectorAll('[name="days"]')) input.checked=c.days.includes(Number(input.value));
  dates();form.hidden=false;form.scrollIntoView({block:"nearest"});
}
el("nova-agenda").onclick=()=>edit(null);
el("fechar-agenda").onclick=()=>{form.hidden=true;editing=null;};
async function api(body) {
  const r=await fetch(body?endpoint:endpoint+"?agenda=painel",body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{cache:"no-store"});
  const data=await r.json();
  if (!r.ok) throw Error(data.error||"Agendamento indisponível.");
  return data;
}
async function change(item,action,extra={}) {
  await api({action,id:item?.id,revision:item?.revision,...extra});
  await refresh();
}
form.onsubmit=async e=>{
  e.preventDefault();
  const data=new FormData(form),config=Object.fromEntries(data);
  config.hotels=data.getAll("hotel");config.days=data.getAll("days").map(Number);config.enabled=data.has("enabled");
  if (!config.hotels.length || !config.days.length) {message.textContent="Marque os hotéis e os dias da semana.";return;}
  const submit=form.querySelector('[type="submit"]');submit.disabled=true;
  try {await change(editing,"agendaSalvar",{config});form.hidden=true;message.textContent="Agendamento salvo.";}
  catch(e){message.textContent=e.message;} finally{submit.disabled=false;}
};
function button(parent,label,fn) {
  const btn=text("button",label);btn.type="button";btn.className="button";
  btn.onclick=async()=>{btn.disabled=true;try{await fn();}catch(e){message.textContent=e.message;}finally{btn.disabled=false;}};
  parent.append(btn);
}
function show(item) {
  const {config:c,run}=item,box=document.createElement("section");
  box.append(text("h3",c.hotels.map(h=>properties[h].name).join(", ")),
    text("p",c.days.map(d=>days[d]).join(", ")+" · "+c.time+" (Brasília) · "+(c.period==="month"?"Até o fim do mês":br(c.start)+" a "+br(c.end))+" · "+(c.mode==="review"?"Com aprovação":"Automático")+" · "+(c.enabled?"Ativo":"Pausado")));
  if(!run) button(box,"Editar",()=>edit(item));
  if(item.resume) {
    const {day,date,hotel,done,total,legacy}=item.resume;
    box.append(text("p",done+" de "+total+" noites confirmadas. Próxima: "+hotel+" · "+br(date)+"."));
    button(box,"Retomar hoje",()=>{
      const original=legacy?"Confirme que o período original era "+br(c.start)+" a "+br(c.end)+" e a ordem era "+c.hotels.join(", ")+". ":"";
      if(confirm(original+"Retomar em "+hotel+" em "+br(date)+", preservando as "+done+" noites confirmadas?"))
        return change(item,"agendaRetomarHoje",{day,date,hotel,confirmedOrder:!!legacy});
    });
  }
  else {
    box.append(text("p",states[run.state]+" · "+run.done+"/"+run.total+" noites por hotel"+(run.message?" · "+run.message:"")));
    if(run.state==="review") {
      const table=document.createElement("table"),header=table.createTHead().insertRow();
      for(const value of ["Hotel","Noite","Categoria","Ocupados"]) header.append(text("th",value));
      const body=table.createTBody();
      for(const night of run.preview) for(const row of night.rows) {
        const tr=body.insertRow();
        for(const v of [night.hotel,br(night.date),row.room,row.quantity]) tr.insertCell().textContent=v;
      }
      box.append(table);button(box,"Aprovar esta prévia",()=>change(item,"agendaAprovar"));
    }
    if(run.state==="error") button(box,"Retomar conferência",()=>change(item,"agendaRetomar"));
    if(run.state!=="canceling") button(box,"Cancelar esta execução",()=>{
      if(confirm("Cancelar esta execução de "+br(run.day)+"? Uma categoria em andamento pode terminar. As gravações já feitas serão preservadas."))
        return change(item,"agendaCancelar",{day:run.day});
    });
  }
  if(item.history?.length) {
    const log=document.createElement("details");log.append(text("summary","Histórico de execuções"));
    for(const h of item.history) log.append(text("p",br(h.day)+" · "+h.state+" · "+h.done+" noite(s) confirmada(s)"+(h.message?" · "+h.message:"")));
    box.append(log);
  }
  return box;
}
async function refresh() {
  const {schedules}=await api();
  list.replaceChildren(...schedules.map(show));panel.hidden=false;
}
panel.ontoggle=()=>{if(panel.open) refresh().catch(e=>message.textContent=e.message);};
await window.suedsManagerAuthReady;
refresh().catch(e=>{if(!/administrador/.test(e.message)){panel.hidden=false;message.textContent=e.message;}});
setInterval(async()=>{if(!panel.open || document.hidden || loading) return;loading=true;
  try{await refresh();}catch(e){message.textContent=e.message;}finally{loading=false;}
},30000);
