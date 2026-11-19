/* Tarifas compartilhadas: nenhum envio aos canais. */
const RmsBases=(()=>{
  const el=id=>document.getElementById(id);
  const regimes=['Café da manhã','Meia pensão','Pensão completa'];
  const days=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const rooms={standard:'Standard',luxo:'Luxo',suite:'Suíte'};
  const money=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  let version=0;
  async function request(tipo,hotel,extra={}){
    const response=await fetch('/api/portal/rms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo,hotel_id:hotel.id,...extra})});
    if(!response.ok){const error=await response.json();throw Error(error.error || 'Não foi possível consultar as bases.');}
    return response;
  }
  function show(hotel,onSave){
    const current=++version;
    let rows=[],loaded=false,loading=false,editing=null,calendar=[];
    const disclosure=el('baseRates').querySelector('details');
    const active=()=>version===current;
    el('baseRates').hidden=false;
    el('baseContent').hidden=true;
    el('baseMonth').parentElement.hidden=true;
    el('baseExcel').disabled=true;
    el('baseStatus').textContent=hotel?.code==='TRANCOSO'?'Sem tarifas base. Aguardando alimentação por outra fonte.':'Consulte as tarifas base de '+hotel.name+'.';
    el('baseAudit').textContent='';
    function draw(){
      editing=null;el('baseAudit').textContent='';
      const grid=el('baseGrid');grid.replaceChildren();
      const head=grid.createTHead().insertRow();
      for(const label of ['Categoria','Adultos',...days]){const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);}
      const filtered=rows.filter(r=>r.base===el('baseChoice').value && r.plano===Number(el('basePlan').value));
      const body=grid.createTBody();
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
      const plan=calendar.find(p=>String(p.codigo)===el('baseChoice').value);
      const grid=el('baseGrid');grid.replaceChildren();
      const head=grid.createTHead().insertRow();
      for(const label of ['Noite','Categoria','Ocupação','Tarifa WEB (R$)']){
        const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);
      }
      const body=grid.createTBody();
      for(const [night,room,occupancy,cents] of plan.grade){
        if(!night.startsWith(el('baseMonth').value))continue;
        const row=body.insertRow();
        for(const value of [night.split('-').reverse().join('/'),room,occupancy,money(cents/100)])row.insertCell().textContent=value;
      }
    }
    function chooseCalendar(){
      const plan=calendar.find(p=>String(p.codigo)===el('baseChoice').value);
      const months=[...new Set(plan.grade.map(row=>row[0].slice(0,7)))].sort();
      el('baseMonth').replaceChildren(...months.map(month=>new Option(month.split('-').reverse().join('/'),month)));
      el('basePlan').replaceChildren(new Option('Café da manhã','0'));
      drawCalendar();
    }
    async function loadRates(){
      if(loaded||loading||!disclosure.open)return;
      loading=true;el('baseStatus').textContent='Carregando tarifas base...';
      try{
        const data=await (await request('bases_consultar',hotel)).json();if(!active())return;
        rows=data.rows;loaded=true;
        calendar=data.calendario||[];
        if(calendar.length){
          el('baseStatus').textContent='Tarifas WEB publicadas na Omnibees, por noite. A grade importada está disponível para consulta.';
          el('baseChoice').replaceChildren(...calendar.map(p=>new Option(p.codigo+' · '+p.tarifario,p.codigo)));
          el('baseMonth').parentElement.hidden=false;
          el('baseGridHelp').hidden=true;
          el('baseChoice').onchange=chooseCalendar;
          el('basePlan').onchange=null;
          el('baseMonth').onchange=drawCalendar;
          el('baseContent').hidden=false;el('baseExcel').disabled=false;chooseCalendar();
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
