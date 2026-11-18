/* Simulação independente: não chama endpoints de aplicação de tarifas. */
const RmsSimple = (() => {
  const rooms = ['standard','luxo','suite'];
  const groups = ['WEB Café','WEB MAP','WEB PC','SITE Café','SITE MAP','SITE PC','NET Café','NET MAP','NET PC'];
  function project(web, rates, group) {
    const result = {};
    for (const room of rooms) {
      const price = web?.[room];
      if (!(price > 0)) { result[room] = null; continue; }
      if (group === 'WEB Café') result[room] = price;
      else if (group === 'SITE Café') {
        const quote = rates?.site?.[room];
        result[room] = quote && !quote.divergence ? plazaPrices(price,quote.discount)?.final ?? null : null;
      } else if (group === 'NET Café') result[room] = plazaPrices(price,0)?.net ?? null;
      else result[room] = null;
    }
    return result;
  }
  function night(data, hotel, day, group, references) {
    const supported = hotel.code === 'PLAZA' && group.endsWith('Café');
    if (!supported) return {current:{}, observed:{}, proposed:{}, offer:'Aguardando captura', observedBand:'—', band:'—', observedReason:'Sem leitura deste tarifário e regime.', reason:'Aguardando grade e derivações confirmadas.'};
    const rates = data.rates[day.date];
    const period = data.periods.find(p=>p.hotel_id===hotel.id && p.inicio<=day.date && day.date<=p.fim);
    const occupancy = Number.isFinite(day.rate) ? day.rate : null;
    const target = plazaLevelComparison(data.catalog,period,day.date,occupancy);
    const decision = beeWebDecision(target,rates?.web,occupancy>=100);
    const reference = references.get(day.date);
    const current = project(rates?.web,rates,group);
    const proposed = project(decision.prices,rates,group);
    const observed = project(reference?.web,rates,group);
    const offer = group === 'SITE Café'
      ? rooms.map(room=>{const q=rates?.site?.[room];return q ? (q.offer || 'Sem oferta')+(q.discount ? ' · '+q.discount+'%' : '') : 'Não conferida';})
      : 'Oferta não conferida; valores regulares';
    const reason = occupancy==null ? 'Ocupação indisponível.' : occupancy>=100 ? 'Esgotado ou overbooking: manter vigente.' : !target.level ? 'Sem nível vinculado para esta noite.' :
      'Ocupação KPI '+occupancy.toLocaleString('pt-BR',{maximumFractionDigits:2})+'%. '+period.nome+' · '+target.level.code+'.'+(decision.retained.length ? ' Mantida a vigente nas categorias em que a faixa seria menor.' : ' Aplicar o nível cadastrado, sem redução.');
    return {current,observed,proposed,offer,
      observedBand:reference?.level || 'Sem aviso importado',
      band:occupancy>=100 ? 'Manter' : target.level ? '+'+target.level.pct+'% sobre a base' : '—',
      observedReason:reference ? 'Aviso '+reference.at+'. Valores reconstruídos da grade importada, com a oferta da leitura atual; não são comprovação da gravação na Omnibees.' : 'Nenhum aviso importado para esta noite.',
      reason,at:rates?.at};
  }
  async function show(data,hotel,isCurrent,refresh) {
    const el=id=>document.getElementById(id);
    el('beeMenu').hidden=true;el('plazaNotes').hidden=true;el('fluct').hidden=true;
    el('panelHotel').textContent=hotel.name;
    el('simpleControls').hidden=false;
    el('nights').classList.add('simple-grid');
    el('hotelNote').textContent='Consultando ocupação para a simulação…';
    const names={PLAZA:'SUEDS PLAZA',CABRALIA:'SUEDS CABRALIA',SEGUNDO_SOL:'SUEDS SEGUNDO SOL',PREMIUM:'SUEDS PREMIUM',TRANCOSO:'SUEDS TRANCOSO',CASAS:'CASAS SUEDS ARRAIAL'};
    let days;
    try {
      if(hotel.code==='PLAZA') {
        const response=await fetch('/api/portal/rms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo:'ocupacao_plaza'})});
        if(!response.ok) throw Error('Não foi possível consultar a ocupação.');
        days=(await response.json()).days;
      } else {
        const params=new URLSearchParams({hotel:names[hotel.code]||hotel.name,start:data.today,end:'2027-12-31'});
        const response=await fetch('/api/dashboard/mapa-ocupacao?'+params);
        if(!response.ok) throw Error('Não foi possível consultar a ocupação.');
        const map=await response.json();days=map.occupancy.find(h=>h.hotel===map.selected.hotel)?.days || [];
      }
      if(!isCurrent()) return;
      const byDate=new Map(days.map(d=>[d.date,d]));
      if(hotel.code==='PLAZA') for(const day of Object.keys(data.rates)) if(!byDate.has(day))byDate.set(day,{date:day,rate:null});
      days=[...byDate.values()].filter(d=>d.date>=data.today&&d.date<='2027-12-31').sort((a,b)=>a.date.localeCompare(b.date));
      const stamp=days.map(d=>d.capturedAt).filter(Boolean).sort().at(-1);
      el('hotelNote').textContent=stamp ? 'Ocupação lida em '+new Date(stamp).toLocaleString('pt-BR',{timeZone:'America/Bahia'})+' (Bahia).' : 'Horário da leitura de ocupação não informado.';
      const captures=hotel.code==='PLAZA'?Object.values(data.rates).map(r=>r.at).filter(Boolean).sort():[];
      el('ratesStatus').textContent=captures.length ? 'Última captura tarifária: '+new Date(captures.at(-1)).toLocaleString('pt-BR',{timeZone:'America/Bahia'})+'. MAP e PC aguardam captura. WEB e NET exibem valores regulares; ofertas confirmadas apenas no SITE Café.' : 'Aguardando captura dos tarifários deste hotel.';
      const references=hotel.code==='PLAZA'?appliedBeeRates(data.beeHistory,data.catalog):new Map();
      const selected=new Set();let group='WEB Café';
      const tabs=el('simpleGroups');tabs.replaceChildren();
      for(const label of [...groups,'Todos os grupos']) {const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{group=label;draw();};tabs.append(button);}
      const format=n=>Number.isFinite(n)?n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
      function count(){el('simpleCount').textContent=selected.size+' noites selecionadas';el('simpleAll').checked=days.length>0&&selected.size===days.length;el('simpleAll').indeterminate=selected.size>0&&selected.size<days.length;}
      function triple(cell,values){cell.classList.add('simple-prices');rooms.forEach((key,i)=>{const row=document.createElement('div'),label=document.createElement('span'),price=document.createElement('strong');label.textContent=['STD','Luxo','Suíte'][i];price.textContent=format(values[key]);row.append(label,price);cell.append(row);});}
      function draw(){
        [...tabs.children].forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===group)));
        const chosen=group==='Todos os grupos'?groups:[group],table=el('nights');table.replaceChildren();
        const head=table.createTHead().insertRow();
        for(const label of ['Selecionar','Noite'])head.appendChild(document.createElement('th')).textContent=label;
        const labels=['Tarifas vigentes','Oferta aplicada','Flutuação Omnibees','Novo valor Omnibees','Motivo da flutuação Omnibees','Flutuação RMS','Novo valor RMS','Motivo da flutuação RMS'];
        for(const g of chosen) for(const label of labels){const th=document.createElement('th'),title=document.createElement('span');title.className='simple-group-title';title.textContent=g;th.append(title,document.createTextNode(label));head.append(th);}
        const body=table.createTBody();
        for(const day of days){const tr=body.insertRow(),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(day.date);check.setAttribute('aria-label','Selecionar '+day.date);check.onchange=()=>{check.checked?selected.add(day.date):selected.delete(day.date);count();};tr.insertCell().append(check);tr.insertCell().textContent=day.date.split('-').reverse().join('/');
          for(const g of chosen){const n=night(data,hotel,day,g,references),cells=labels.map(()=>tr.insertCell());triple(cells[0],n.current);cells[1].textContent=Array.isArray(n.offer)?[...new Set(n.offer)].length===1?n.offer[0]:n.offer.map((o,i)=>['STD','Luxo','Suíte'][i]+': '+o).join(' · '):n.offer;cells[2].textContent=n.observedBand;triple(cells[3],n.observed);cells[4].textContent=n.observedReason;cells[5].textContent=n.band;triple(cells[6],n.proposed);cells[7].textContent=n.reason;[1,2,4,5,7].forEach(i=>cells[i].classList.add('simple-reason'));
            if(rooms.some(k=>Number.isFinite(n.observed[k])&&Number.isFinite(n.proposed[k])&&Math.round(n.observed[k]*100)!==Math.round(n.proposed[k]*100))){cells[6].classList.add('bee-difference');const badge=document.createElement('small');badge.textContent='Diverge do aviso importado';cells[6].append(badge);}
          }
        }
        count();refresh?.();
      }
      el('simpleAll').onchange=e=>{selected.clear();if(e.target.checked)days.forEach(d=>selected.add(d.date));draw();};draw();
    }catch(error){if(isCurrent())el('hotelNote').textContent=error.message;}
  }
  return {show,night,project,groups};
})();
if(typeof module!=='undefined')module.exports=RmsSimple;
