/* Tarifas compartilhadas: nenhum envio aos canais. */
const RmsBases=(()=>{
  const el=id=>document.getElementById(id);
  const regimes=['Café da manhã','Meia pensão','Pensão completa'];
  const days=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const rooms={standard:'Standard',luxo:'Luxo',suite:'Suíte'};
  const money=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const formatDate=iso=>iso.split('-').reverse().join('/');
  const {weekday,periods:levelPeriods}=RmsTrancoso;

  function levelsFor(plan){
    const levels=new Map(),byNight=new Map();
    for(const row of plan.grade){
      if(!byNight.has(row[0]))byNight.set(row[0],[]);
      byNight.get(row[0]).push(row);
    }
    for(const [code,name,start,end] of levelPeriods){
      const nights=[...byNight.keys()].filter(night=>start<=night&&night<=end).sort();
      if(!nights.length)continue;
      if(!levels.has(code))levels.set(code,{code,name,periods:[],grade:[]});
      const level=levels.get(code);
      level.periods.push([nights[0],nights.at(-1)]);
      for(const night of nights){
        level.grade.push(...byNight.get(night));
        byNight.delete(night);
      }
    }
    return {levels,pending:byNight.size};
  }
  function gridBody(labels){
    const grid=el('baseGrid');grid.replaceChildren();
    const head=grid.createTHead().insertRow();
    for(const label of labels){
      const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);
    }
    return grid.createTBody();
  }
  let version=0;
  async function request(tipo,hotel,extra={}){
    const response=await fetch('/api/portal/rms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo,hotel_id:hotel.id,...extra})});
    if(!response.ok){const error=await response.json();throw Error(error.error || 'Não foi possível consultar as bases.');}
    return response;
  }
  function show(hotel,onSave){
    const current=++version;
    let rows=[],loaded=false,loading=false,editing=null,calendarLevels=new Map(),calendarPlan=null;
    const disclosure=el('baseRates').querySelector('details');
    const active=()=>version===current;
    el('baseRates').hidden=false;
    el('baseContent').hidden=true;
    el('baseMonth').parentElement.hidden=true;
    el('baseExcel').disabled=true;
    el('baseStatus').textContent=hotel?.code==='TRANCOSO'?'Sem tarifas base. Aguardando alimentação por outra fonte.':'Consulte as tarifas base de '+hotel.name+'.';
    el('baseAudit').textContent='';
    el('baseGridHelp').textContent='Selecione um valor para editar. Tarifas em reais, por categoria, quantidade de adultos e dia da semana.';
    function showAudit(row){
      el('baseAudit').textContent=row.gravado_por
        ? `Gravado em ${new Date(row.gravado_em).toLocaleString('pt-BR',{timeZone:'America/Bahia'})} · ${row.gravado_por}`
        : '';
    }
    function editCell(td,{label,amount,min,saveRate}){
      const button=document.createElement('button');button.type='button';
      function showAmount(){
        const display=amount==null?'Varia':money(amount);
        button.textContent=display+' ✎';
        button.setAttribute('aria-label',`Editar ${label}: ${amount==null?display:'R$ '+display}`);
      }
      showAmount();
      button.onclick=()=>{
        if(editing)editing();
        const form=document.createElement('form');form.className='base-cell-edit';
        const value=document.createElement('input');value.type='number';value.min=min;value.max='99999999.99';value.step='0.01';value.required=true;value.value=amount??'';value.setAttribute('aria-label',button.getAttribute('aria-label'));
        const save=document.createElement('button');save.type='submit';save.textContent='Salvar';
        const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';
        const status=document.createElement('span');status.setAttribute('role','status');
        const close=()=>{
          if(editing!==close)return;
          td.replaceChildren(button);editing=null;
        };
        cancel.onclick=()=>{close();button.focus();};editing=close;
        value.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();cancel.click();}};
        form.append(value,save,cancel,status);td.replaceChildren(form);value.focus();value.select();
        form.onsubmit=async event=>{
          event.preventDefault();save.disabled=cancel.disabled=value.disabled=true;
          try{
            const row=await saveRate(Number(value.value));
            if(!active())return;
            amount=row.valor;showAmount();
            if(editing===close){close();button.focus();}
            el('baseStatus').textContent='Tarifa salva no Portal.';
            showAudit(row);
          }catch(error){if(active()&&editing===close)status.textContent=error.message;}
          finally{save.disabled=cancel.disabled=value.disabled=false;}
        };
      };
      td.append(button);
    }
    function draw(){
      editing=null;el('baseAudit').textContent='';
      const filtered=rows.filter(r=>r.base===el('baseChoice').value && r.plano===Number(el('basePlan').value));
      const body=gridBody(['Categoria','Adultos',...days]);
      for(const room of Object.keys(rooms))for(let pax=1;pax<=4;pax++){
        const group=filtered.filter(r=>r.quarto===room && r.pax===pax);if(!group.length)continue;
        const tr=body.insertRow();tr.insertCell().textContent=rooms[room];tr.insertCell().textContent=pax;
        for(let day=0;day<7;day++){
          const td=tr.insertCell(),r=group.find(x=>x.dia===day);if(!r){td.textContent='—';continue;}
          editCell(td,{label:`${rooms[room]}, ${pax} adultos, ${days[day]}`,amount:r.valor,min:0.01,saveRate:async valor=>{
            const {row}=await (await request('base_salvar',hotel,{...r,valor})).json();
            Object.assign(r,row);
            if(active())onSave(row);
            return row;
          }});
        }
      }
    }
    function chooseBase(){
      const plans=[...new Set(rows.filter(r=>r.base===el('baseChoice').value).map(r=>r.plano))].sort();
      el('basePlan').replaceChildren(...plans.map(p=>new Option(regimes[p],p)));draw();
    }
    function drawCalendar(){
      editing=null;
      showAudit(calendarPlan);
      const level=calendarLevels.get(el('baseChoice').value);
      if(!level)return;
      const periods=level.periods.map(([start,end])=>start===end?formatDate(start):formatDate(start)+' a '+formatDate(end));
      el('baseGridHelp').hidden=false;
      el('baseGridHelp').textContent='Vigência: '+periods.join(' · ')+'. A edição vale para o dia da semana dentro dessas datas.';
      const body=gridBody(['Categoria','Adultos / crianças',...days]);
      const grouped=new Map();
      const byDay=new Map();
      for(const [night,room,occupancy,cents] of level.grade){
        if(!byDay.has(night))byDay.set(night,weekday(night));
        const key=JSON.stringify([room,occupancy]);
        if(!grouped.has(key))grouped.set(key,{room,occupancy,rates:new Map()});
        const {rates}=grouped.get(key),day=byDay.get(night);
        rates.set(day,rates.has(day)&&rates.get(day)!==cents?'varies':cents);
      }
      const adultCount=label=>Number(/^(\d+)\s+Pax$/i.exec(label)?.[1]||0);
      const groups=[...grouped.values()].sort((a,b)=>a.room.localeCompare(b.room,'pt-BR')||
        Number(!adultCount(a.occupancy))-Number(!adultCount(b.occupancy))||
        adultCount(a.occupancy)-adultCount(b.occupancy)||a.occupancy.localeCompare(b.occupancy,'pt-BR'));
      for(const {room,occupancy,rates} of groups){
        const row=body.insertRow();
        row.insertCell().textContent=room;
        row.insertCell().textContent=adultCount(occupancy)||occupancy;
        for(let day=0;day<7;day++){
          const cents=rates.get(day);
          const td=row.insertCell();
          if(cents==null){td.textContent='—';continue;}
          editCell(td,{
            label:`${room}, ${occupancy}, ${days[day]}`,
            amount:cents==='varies'?null:cents/100,
            min:adultCount(occupancy)?0.01:0,
            saveRate:async valor=>{
              const {row:saved}=await (await request('base_calendario_salvar',hotel,{
                codigo:calendarPlan.codigo,nivel:level.code,quarto:room,ocupacao:occupancy,dia:day,
                valor,gravado_em:calendarPlan.gravado_em
              })).json();
              Object.assign(calendarPlan,{gravado_em:saved.gravado_em,gravado_por:saved.gravado_por});
              for(const rate of level.grade){
                if(rate[1]===room&&rate[2]===occupancy&&byDay.get(rate[0])===day)rate[3]=Math.round(saved.valor*100);
              }
              if(active()&&el('baseChoice').value===level.code&&!td.isConnected)drawCalendar();
              return saved;
            }
          });
        }
      }
    }
    async function loadRates(){
      if(loaded||loading||!disclosure.open)return;
      loading=true;el('baseStatus').textContent='Carregando tarifas base...';
      try{
        const data=await (await request('bases_consultar',hotel)).json();if(!active())return;
        rows=data.rows;loaded=true;
        const calendar=data.calendario||[];
        if(calendar.length){
          const plan=calendar[0];
          calendarPlan=plan;
          const {levels,pending}=levelsFor(plan);
          calendarLevels=levels;
          el('baseStatus').textContent='Tarifário WEB '+plan.codigo+' da Omnibees · níveis organizados pelos valores publicados.'
            +(pending?' Há '+pending+' noites fora dos períodos classificados.':'');
          el('baseChoice').replaceChildren(...[...levels.values()].map(level=>new Option(level.code+' · '+level.name,level.code)));
          el('basePlan').replaceChildren(new Option('Café da manhã','0'));
          el('baseChoice').onchange=drawCalendar;
          el('basePlan').onchange=null;
          el('baseContent').hidden=false;el('baseExcel').disabled=false;drawCalendar();
          return;
        }
        el('baseStatus').textContent=rows.length?'':'Sem tarifas base. Aguardando alimenta\u00e7\u00e3o por outra fonte.';
        if(!rows.length)return;
        el('baseChoice').replaceChildren(...[...new Set(rows.map(r=>r.base))].map(b=>new Option(data.codes?.[b]?data.codes[b]+' · '+b:b,b)));
        el('baseGridHelp').hidden=false;
        el('baseContent').hidden=false;el('baseExcel').disabled=false;chooseBase();
      }catch(error){if(active())el('baseStatus').textContent=error.message;}
      finally{loading=false;}
    }
    disclosure.ontoggle=loadRates;
    loadRates();
    el('baseChoice').onchange=chooseBase;el('basePlan').onchange=draw;
    el('baseExcel').onclick=async()=>{
      el('baseExcel').disabled=true;
      try{
        const blob=await (await request('bases_excel',hotel)).blob();if(!active())return;
        const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`tarifas-base-${hotel.code}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch(error){if(active())el('baseStatus').textContent=error.message;}
      finally{if(active())el('baseExcel').disabled=false;}
    };
  }
  return {show};
})();
