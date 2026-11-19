/* Tarifas compartilhadas: nenhum envio aos canais. */
const RmsBases=(()=>{
  const el=id=>document.getElementById(id);
  const regimes=['Café da manhã','Meia pensão','Pensão completa'];
  const days=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const rooms={standard:'Standard',luxo:'Luxo',suite:'Suíte'};
  const money=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  // Períodos inferidos da grade WEB importada do Trancoso.
  const levelPeriods=[
    ['FE26','Feriados 2º semestre 2026','2026-11-19','2026-11-22'],
    ['BT26','Baixa Temporada 2026','2026-11-23','2026-12-17'],
    ['NT26','Natal 2026','2026-12-18','2026-12-24'],
    ['RE26','Réveillon 2026','2026-12-25','2027-01-01'],
    ['TR2701','Transição de Réveillon 2027','2027-01-02','2027-01-02'],
    ['AT27','Alta Temporada 2027','2027-01-03','2027-02-04'],
    ['CA27','Carnaval 2027','2027-02-05','2027-02-12'],
    ['BT127','Baixa Temporada · 1º semestre 2027','2027-02-13','2027-03-24'],
    ['FE127','Feriados · 1º semestre 2027','2027-03-25','2027-03-28'],
    ['BT127B','Baixa Temporada · março a maio 2027','2027-03-29','2027-05-25'],
    ['FE127','Feriados · 1º semestre 2027','2027-05-26','2027-05-30'],
    ['BT127','Baixa Temporada · 1º semestre 2027','2027-05-31','2027-06-30'],
    ['JU27','Julho 2027','2027-07-01','2027-07-31'],
    ['BT227','Baixa Temporada · 2º semestre 2027','2027-08-01','2027-09-02'],
    ['FE227','Feriados · 2º semestre 2027','2027-09-03','2027-09-07'],
    ['BT227','Baixa Temporada · 2º semestre 2027','2027-09-08','2027-10-01'],
    ['SC27','Saco Cheio 2027','2027-10-02','2027-10-17'],
    ['BT227','Baixa Temporada · 2º semestre 2027','2027-10-18','2027-10-28'],
    ['FE227','Feriados · 2º semestre 2027','2027-10-29','2027-11-02'],
    ['BT227','Baixa Temporada · 2º semestre 2027','2027-11-03','2027-11-11'],
    ['FE227','Feriados · 2º semestre 2027','2027-11-12','2027-11-15'],
    ['BT227','Baixa Temporada · 2º semestre 2027','2027-11-16','2027-12-17'],
    ['NT27','Natal 2027','2027-12-18','2027-12-24'],
    ['RE27','Réveillon 2027','2027-12-25','2028-01-03'],
    ['AT28','Alta Temporada 2028','2028-01-04','2028-02-04'],
    ['MT28','Média Temporada 2028','2028-02-05','2028-02-25'],
    ['CA28','Carnaval 2028','2028-02-26','2028-03-04'],
    ['BT128','Baixa Temporada · 1º semestre 2028','2028-03-05','2028-04-08']
  ];
  const formatDate=iso=>iso.split('-').reverse().join('/');
  const weekday=iso=>(new Date(iso+'T00:00:00Z').getUTCDay()+6)%7;

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
    let rows=[],loaded=false,loading=false,editing=null,calendarLevels=new Map();
    const disclosure=el('baseRates').querySelector('details');
    const active=()=>version===current;
    el('baseRates').hidden=false;
    el('baseContent').hidden=true;
    el('baseMonth').parentElement.hidden=true;
    el('baseExcel').disabled=true;
    el('baseStatus').textContent=hotel?.code==='TRANCOSO'?'Sem tarifas base. Aguardando alimentação por outra fonte.':'Consulte as tarifas base de '+hotel.name+'.';
    el('baseAudit').textContent='';
    el('baseGridHelp').textContent='Selecione um valor para editar. Tarifas em reais, por categoria, quantidade de adultos e dia da semana.';
    function draw(){
      editing=null;el('baseAudit').textContent='';
      const filtered=rows.filter(r=>r.base===el('baseChoice').value && r.plano===Number(el('basePlan').value));
      const body=gridBody(['Categoria','Adultos',...days]);
      for(const room of Object.keys(rooms))for(let pax=1;pax<=4;pax++){
        const group=filtered.filter(r=>r.quarto===room && r.pax===pax);if(!group.length)continue;
        const tr=body.insertRow();tr.insertCell().textContent=rooms[room];tr.insertCell().textContent=pax;
        for(let day=0;day<7;day++){
          const td=tr.insertCell(),r=group.find(x=>x.dia===day);if(!r){td.textContent='—';continue;}
          const button=document.createElement('button');button.type='button';button.textContent=money(r.valor)+' ✎';
          button.setAttribute('aria-label',`Editar ${rooms[room]}, ${pax} adultos, ${days[day]}: R$ ${money(r.valor)}`);
          button.onclick=()=>{
            if(editing)editing();
            const form=document.createElement('form');form.className='base-cell-edit';
            const value=document.createElement('input');value.type='number';value.min='0.01';value.max='99999999.99';value.step='0.01';value.required=true;value.value=r.valor;value.setAttribute('aria-label',button.getAttribute('aria-label'));
            const save=document.createElement('button');save.type='submit';save.textContent='Salvar';
            const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';
            const status=document.createElement('span');status.setAttribute('role','status');
            const close=()=>{td.replaceChildren(button);editing=null;};cancel.onclick=close;editing=close;
            value.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();button.focus();}};
            form.append(value,save,cancel,status);td.replaceChildren(form);value.focus();value.select();
            form.onsubmit=async event=>{
              event.preventDefault();save.disabled=cancel.disabled=value.disabled=true;
              try{const data=await (await request('base_salvar',hotel,{...r,valor:Number(value.value)})).json();if(!active())return;
                Object.assign(r,data.row);button.textContent=money(r.valor)+' ✎';button.setAttribute('aria-label',`Editar ${rooms[room]}, ${pax} adultos, ${days[day]}: R$ ${money(r.valor)}`);close();onSave(data.row);button.focus();
                el('baseStatus').textContent='Tarifa salva no Portal. Nenhuma tarifa enviada aos canais.';
                el('baseAudit').textContent=`Gravado em ${new Date(r.gravado_em).toLocaleString('pt-BR',{timeZone:'America/Bahia'})} · ${r.gravado_por||''}`;
              }catch(error){if(active())status.textContent=error.message;}
              finally{save.disabled=cancel.disabled=value.disabled=false;}
            };
          };
          td.append(button);
        }
      }
    }
    function chooseBase(){
      const plans=[...new Set(rows.filter(r=>r.base===el('baseChoice').value).map(r=>r.plano))].sort();
      el('basePlan').replaceChildren(...plans.map(p=>new Option(regimes[p],p)));draw();
    }
    function drawCalendar(){
      const level=calendarLevels.get(el('baseChoice').value);
      if(!level)return;
      const periods=level.periods.map(([start,end])=>start===end?formatDate(start):formatDate(start)+' a '+formatDate(end));
      el('baseGridHelp').hidden=false;
      el('baseGridHelp').textContent='Vigência: '+periods.join(' · ');
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
          row.insertCell().textContent=cents==null?'—':cents==='varies'?'Varia':money(cents/100);
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
