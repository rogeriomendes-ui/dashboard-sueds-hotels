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
    let rows=[],selected=null,loaded=false;
    const active=()=>version===current;
    el('baseRates').hidden=false;
    el('baseContent').hidden=true;
    el('baseEdit').hidden=true;
    el('baseExcel').disabled=true;
    el('baseView').disabled=false;
    el('baseView').textContent='Visualizar tarifas';
    el('baseStatus').textContent=hotel?.code==='TRANCOSO'?'Sem tarifas base. Aguardando alimentação por outra fonte.':'Consulte as tarifas base de '+hotel.name+'.';
    el('baseAudit').textContent='';
    function draw(){
      selected=null;el('baseEdit').hidden=true;el('baseAudit').textContent='';
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
          const button=document.createElement('button');button.type='button';button.textContent=money(r.valor);
          button.setAttribute('aria-label',`Editar ${rooms[room]}, ${pax} adultos, ${days[day]}: R$ ${money(r.valor)}`);
          button.onclick=()=>{selected=r;el('baseEdit').hidden=false;el('baseSave').disabled=false;el('baseValue').value=r.valor;el('baseCellLabel').textContent=`${rooms[room]} · ${pax} adultos · ${days[day]}`;el('baseAudit').textContent=r.gravado_em?`Última gravação: ${new Date(r.gravado_em).toLocaleString('pt-BR',{timeZone:'America/Bahia'})} (Bahia) · ${r.gravado_por || 'Usuário não informado'}`:'Sem registro de autoria';el('baseValue').focus();};
          td.append(button);
        }
      }
    }
    function chooseBase(){
      const plans=[...new Set(rows.filter(r=>r.base===el('baseChoice').value).map(r=>r.plano))].sort();
      el('basePlan').replaceChildren(...plans.map(p=>new Option(regimes[p],p)));draw();
    }
    el('baseView').onclick=async()=>{
      if(loaded){el('baseContent').hidden=!el('baseContent').hidden;el('baseView').textContent=el('baseContent').hidden?'Visualizar tarifas':'Recolher tarifas';return;}
      el('baseView').disabled=true;el('baseStatus').textContent='Carregando tarifas base…';
      try{
        const data=await (await request('bases_consultar',hotel)).json();if(!active())return;
        rows=data.rows;loaded=!!rows.length;
        el('baseStatus').textContent=rows.length?`${new Set(rows.map(r=>r.base)).size} bases · ${rows.length.toLocaleString('pt-BR')} valores · ${hotel.name}`:'Sem tarifas base. Aguardando alimentação por outra fonte.';
        if(!rows.length)return;
        el('baseChoice').replaceChildren(...[...new Set(rows.map(r=>r.base))].map(b=>new Option(b,b)));
        el('baseContent').hidden=false;el('baseView').textContent='Recolher tarifas';el('baseExcel').disabled=false;chooseBase();
      }catch(error){if(active())el('baseStatus').textContent=error.message;}
      finally{if(active())el('baseView').disabled=false;}
    };
    el('baseChoice').onchange=chooseBase;el('basePlan').onchange=draw;
    el('baseCancel').onclick=()=>{selected=null;el('baseEdit').hidden=true;el('baseAudit').textContent='';};
    el('baseEdit').onsubmit=async event=>{
      event.preventDefault();if(!selected)return;
      const target=selected;el('baseSave').disabled=true;
      try{
        const data=await (await request('base_salvar',hotel,{...target,valor:Number(el('baseValue').value)})).json();if(!active())return;
        Object.assign(target,data.row);draw();onSave(data.row);
        el('baseStatus').textContent='Tarifa salva no Portal. Nenhuma tarifa enviada aos canais.';
        el('baseAudit').textContent=`Gravado em ${new Date(data.row.gravado_em).toLocaleString('pt-BR',{timeZone:'America/Bahia'})} (Bahia) · ${data.row.gravado_por || 'Usuário não informado'}`;
      }catch(error){if(active())el('baseStatus').textContent=error.message;}
      finally{if(active())el('baseSave').disabled=false;}
    };
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
