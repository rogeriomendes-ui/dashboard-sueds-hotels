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
  function omnibeesOccupancy(day) {
    if (!Number.isInteger(day.available) || !Number.isInteger(day.apartments) || day.apartments <= 0) return null;
    const channelAvailability = Math.floor(Math.max(0, day.available) * 4 / 5);
    return (day.apartments - channelAvailability) / day.apartments * 100;
  }
  function night(data, hotel, day, group) {
    const [channel, meal]=group.split(' ');
    const plan=['Café','MAP','PC'].indexOf(meal);
    const regime=['CAFÉ DA MANHÃ','MEIA PENSÃO','PENSÃO COMPLETA'][plan];
    if(hotel.code!=='PLAZA')return {current:{},proposed:{},offer:'Aguardando captura',levelLabel:'—',band:'—',reason:'Aguardando grade.'};
    const rates=data.rates[day.date];
    const rules=typeof RmsRules!=='undefined'?RmsRules:require('./rms-rules');
    const period=rules.forNight(data.periods.filter(p=>p.hotel_id===hotel.id),day.date);
    const occupancy=omnibeesOccupancy(day);
    const target=plazaLevelComparison(data.catalog,period,day.date,occupancy,plan);
    const hold=period?.bloqueado||occupancy>=100;
    const currentWeb=plan===0?rates?.web:null;
    const tariff=(channel==='NET'?'Tarifa Net':'Tarifário '+channel)+' - '+regime;
    const weekday=(new Date(day.date+'T12:00:00Z').getUTCDay()+6)%7;
    const covers=(periods,date)=>periods==null||periods.some(([start,end])=>start<=date&&date<=end);
    const norm=value=>value.trim().toLocaleUpperCase('pt-BR');
    const eligible=data.offers.filter(o=>{
      const hours=o.horario_reserva;
      const withinHours=!hours||(hours[0]<=hours[1]?hours[0]<=data.saleTime&&data.saleTime<=hours[1]:data.saleTime>=hours[0]||data.saleTime<=hours[1]);
      return o.tipo==='Desconto'&&Number.isFinite(o.desconto)&&!o.noites_gratis&&!(o.noites>1)&&withinHours&&
        covers(o.reserva,data.today)&&covers(o.estadia,day.date)&&(!o.dias_estadia||o.dias_estadia.includes(weekday))&&
        o.tarifarios.some(t=>norm(t)===norm(tariff));
    });
    const offer=eligible.reduce((best,o)=>!best||o.desconto>best.desconto?o:best,null);
    const vigenteWeb=hold?currentWeb:target.simulated;
    function channelPrices(web,discount){
      return Object.fromEntries(rooms.map(room=>{
        const price=web?.[room];
        if(!(price>0))return [room,null];
        const cents=Math.round(Math.round(price*100)*(100-discount)/100);
        const derived=cents===0?0:plazaPrices(cents/100,0,regime)?.[channel.toLowerCase()];
        return [room,derived??null];
      }));
    }
    const discount=offer?.desconto??0;
    const reason=hold?(period?.bloqueado?'Flutuação bloqueada.':'Esgotado ou em overbooking.')+' Manter a tarifa vigente quando capturada.':
      occupancy==null?'Ocupação indisponível.':!target.level?'Sem nível vinculado para esta noite.':
      period.nome+' · '+target.level.code+' · '+target.level.pct+'% sobre a base WEB de '+regime.toLowerCase()+'.';
    return {current:channelPrices(vigenteWeb,0),
      proposed:channelPrices(vigenteWeb,discount),offer:offer?offer.nome+' · '+offer.desconto+'%':'Sem oferta elegível',
      levelLabel:hold?'Manter':target.level?target.level.code+' · +'+target.level.pct+'%':'—',band:hold?'Manter':target.level?'+'+target.level.pct+'% sobre a base':'—',
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
        const offers=await fetch('/api/portal/rms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo:'ofertas_consultar',hotel_id:hotel.id})});
        if(!offers.ok)throw Error('Não foi possível consultar as ofertas do Plaza.');
        data={...data,offers:(await offers.json()).ofertas.map(row=>row.detalhes),saleTime:new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Bahia',hour:'2-digit',minute:'2-digit'})};
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
      el('ratesStatus').textContent=captures.length ? 'Última captura tarifária: '+new Date(captures.at(-1)).toLocaleString('pt-BR',{timeZone:'America/Bahia'})+'. Projeção por nível tarifário para dois adultos. Valores com a oferta elegível. MAP e PC exibem a proposta quando há base cadastrada.' : 'Aguardando captura dos tarifários deste hotel.';
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
        const labels=['Vigente após flutuação','Oferta aplicada','Flutuação Omnibees','Tarifa com oferta aplicada','Motivo da flutuação'];
        for(const g of chosen){
          for(const label of labels){
            const th=document.createElement('th'),title=document.createElement('span');
            title.className='simple-group-title';
            title.textContent=g;
            th.append(title,document.createTextNode(label));
            head.append(th);
            if(g===chosen[0] && label===labels[0]){
              for(const name of ['Tx. Ocupação Omnibees','Tx. Ocupação KPI'])head.appendChild(document.createElement('th')).textContent=name;
            }
          }
        }
        const body=table.createTBody();
        for(const day of days){const tr=body.insertRow(),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(day.date);check.setAttribute('aria-label','Selecionar '+day.date);check.onchange=()=>{check.checked?selected.add(day.date):selected.delete(day.date);count();};tr.insertCell().append(check);tr.insertCell().textContent=day.date.split('-').reverse().join('/');
          for(const g of chosen){
            const n=night(data,hotel,day,g);
            triple(tr.insertCell(),n.current);
            if(g===chosen[0]){
              const channelRate=omnibeesOccupancy(day);
              tr.insertCell().textContent=channelRate===null?'—':channelRate.toLocaleString('pt-BR')+'%';
              tr.insertCell().textContent=Number.isFinite(day.rate)?day.rate.toLocaleString('pt-BR')+'%':'—';
            }
            for(const value of [n.offer,n.levelLabel]){
              const cell=tr.insertCell();
              cell.classList.add('simple-reason');
              cell.textContent=value;
            }
            triple(tr.insertCell(),n.proposed);
            const reason=tr.insertCell();
            reason.classList.add('simple-reason');
            reason.textContent=n.reason;
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
