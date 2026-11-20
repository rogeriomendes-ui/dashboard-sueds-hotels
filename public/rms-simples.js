/* Simulação independente: não chama endpoints de aplicação de tarifas. */
const RmsSimple = (() => {
  const rooms = ['standard','luxo','suite'];
  const standardOnlyHotels = new Set(['CABRALIA','PREMIUM','SEGUNDO_SOL']);
  const groups = ['WEB Café','WEB MAP','WEB PC','SITE Café','SITE MAP','SITE PC','NET Café','NET MAP','NET PC'];
  const baseAliases = {
    PREMIUM: {
      '1º e 2º SEMESTRE BAIXA TEMPORADA 2026':'1º E 2º SEM B. TEMPORADA 2026',
      '2º SEMESTRE BAIXA TEMPORADA 2027':'2º SEMESTRE B. TEMPORADA 2027',
      'FERIADOS 2º SEMSTRE 2027':'FERIADOS 2º SEMESTRE 2027',
      '1º SEMESTRE BAIXA TEMPORADA 2028':'1º SEMESTRE B. TEMP 2028'
    },
    CABRALIA: {
      '1º E 2º SEM B. TEMP. 2026':'1º E 2º SEMESTRE BAIXA TEMPORADA 2026',
      '1º SEM FERIADOS 2027':'FERIADOS 1º SEM 2027',
      '2º SEMESTRE BAIXA TEMPORADA 2027':'2º SEM BAIXA TEMPORADA 2027',
      'FERIADOS 2º SEMESTRE 2027':'FERIADOS 2º SEM 2027',
      '1º SEMESTRE BAIXA TEMPORADA 2028':'1º SEM BAIXA TEMPORADA 2028'
    },
    SEGUNDO_SOL: {
      '1º E 2º SEMESTRE BAIXA TEMPORADA 2026':'1º E 2º SEMESTRE B. TEMP. 2026',
      'FERIADOS 1º E 2º SEMESTRE 2026':'FERIADOS 1º E 2º SEM. 2026',
      'BAIXA TEMPORADA 1º SEMESTRE 2027':'BAIXA TEMPORADA 1º SEM 2027',
      '2º SEMESTRE BAIXA TEMPORADA 2027':'BAIXA TEMPORADA 2º SEMESTRE 2027'
    }
  };
  const normalize = value=>value.normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const tariffKey = value=>normalize(value).replace(/^TARIFARIO/,'TARIFA');
  function indexBases(payload) {
    const bases=new Map(),calendar=new Map();
    for(const row of payload.rows || []) {
      if(Number(row.pax)!==2) continue;
      const key=normalize(row.base);
      if(!bases.has(key)) bases.set(key,{name:row.base,code:payload.codes?.[row.base],prices:new Map()});
      bases.get(key).prices.set(`${row.plano}|${row.dia}|${row.quarto}`,Number(row.valor));
    }
    for(const [date,room,pax,cents] of payload.calendario?.[0]?.grade || []) {
      if(!/^2\s+Pax$/i.test(pax)) continue;
      if(!calendar.has(date)) calendar.set(date,{});
      calendar.get(date)[room]=cents/100;
    }
    return {bases,calendar};
  }
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
  function levelDescription(level) {
    if (!level) return '—';
    const parts=[level.code,level.name].filter(Boolean);
    const percentages=(level.name || '').matchAll(/(\d+(?:[.,]\d+)?)\s*%/g);
    if (!Array.from(percentages).some(match=>Number(match[1].replace(',','.'))===Number(level.pct))) parts.push('+'+level.pct+'%');
    return parts.join(' · ');
  }
  function night(data, hotel, day, group) {
    const [channel, meal]=group.split(' ');
    const plan=['Café','MAP','PC'].indexOf(meal);
    const regime=['CAFÉ DA MANHÃ','MEIA PENSÃO','PENSÃO COMPLETA'][plan];
    const rates=data.rates?.[day.date];
    const rules=typeof RmsRules!=='undefined'?RmsRules:require('./rms-rules');
    const period=rules.forNight(data.periods.filter(p=>p.hotel_id===hotel.id),day.date);
    const occupancy=omnibeesOccupancy(day);
    const trancoso=hotel.code==='TRANCOSO';
    const hold=!trancoso&&(period?.bloqueado||occupancy>=100);
    const currentWeb=plan===0?rates?.web:null;
    const tariff=(channel==='NET'?'Tarifa Net':'Tarifário '+channel)+' - '+regime;
    const weekday=(new Date(day.date+'T12:00:00Z').getUTCDay()+6)%7;
    const covers=(periods,date)=>periods==null||periods.some(([start,end])=>start<=date&&date<=end);
    const eligible=(data.offers||[]).filter(o=>{
      const hours=o.horario_reserva;
      const withinHours=!hours||(hours[0]<=hours[1]?hours[0]<=data.saleTime&&data.saleTime<=hours[1]:data.saleTime>=hours[0]||data.saleTime<=hours[1]);
      return o.tipo==='Desconto'&&Number.isFinite(o.desconto)&&!o.noites_gratis&&!(o.noites>1)&&withinHours&&
        covers(o.reserva,data.today)&&covers(o.estadia,day.date)&&(!o.dias_estadia||o.dias_estadia.includes(weekday))&&
        o.tarifarios.some(t=>tariffKey(t)===tariffKey(tariff));
    });
    const offer=eligible.reduce((best,o)=>!best||o.desconto>best.desconto?o:best,null);
    let vigenteWeb,levelLabel,band,reason;
    if(trancoso) {
      const code=RmsTrancoso.levelFor(day.date);
      const name=RmsTrancoso.periods.find(([key])=>key===code)?.[1];
      vigenteWeb=plan===0?data.hotelBases?.calendar.get(day.date):null;
      levelLabel='Desligada';
      reason=vigenteWeb&&name?`${code} · ${name}`:'Sem tarifa cadastrada para esta noite e regime.';
    } else {
      let target;
      if(hotel.code==='PLAZA') {
        target=plazaLevelComparison(data.catalog,period,day.date,occupancy,plan);
        vigenteWeb=hold?currentWeb:target.simulated;
      } else {
        const baseName=period?.base_origem || baseAliases[hotel.code]?.[period?.nome] || period?.nome;
        const base=baseName&&data.hotelBases?.bases.get(normalize(baseName));
        const rule=rules.band(period,occupancy);
        const pct=Number(rule?.pct);
        const level=base&&rule&&Number.isFinite(pct)?{
          code:pct===0?base.code:null,
          name:base.name,pct
        }:null;
        target={level,base};
        if(level&&!hold) vigenteWeb=Object.fromEntries(rooms.map(room=>{
          const price=base.prices.get(`${plan}|${weekday}|${room}`);
          return [room,price>0?Math.round(price*(100+pct))/100:null];
        }));
      }
      levelLabel=hold?'Manter':levelDescription(target.level);
      band=hold?'Manter':target.level?'+'+target.level.pct+'% sobre a base':'—';
      reason=hold?(period?.bloqueado?'Flutuação bloqueada.':'Esgotado ou em overbooking.')+
        (vigenteWeb?' Manter a tarifa vigente.':' Tarifa vigente indisponível no Portal.'):
        occupancy==null?'Ocupação indisponível.':!target.level?'Sem nível vinculado para esta noite.':
        (target.base?.name || period.nome)+(target.base?.code || target.level.code?' · '+(target.base?.code || target.level.code):'');
    }
    const roomKeys=trancoso?Object.keys(vigenteWeb||{}):rooms;
    function channelPrices(web,discount){
      return Object.fromEntries(roomKeys.map(room=>{
        const price=web?.[room];
        if(!(price>0))return [room,null];
        const cents=Math.round(Math.round(price*100)*(100-discount)/100);
        const derived=cents===0?0:plazaPrices(cents/100,0,regime)?.[channel.toLowerCase()];
        return [room,derived??null];
      }));
    }
    const discount=offer?.desconto??0;
    return {current:channelPrices(vigenteWeb,0),
      proposed:channelPrices(vigenteWeb,discount),offer:offer?(Array.from(offer.nome.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)).some(m=>Number(m[1].replace(',','.'))===offer.desconto)?offer.nome:offer.nome+' · '+offer.desconto+'%'):'Sem oferta elegível',
      levelLabel,band,
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
      const readHotel=async tipo=>{
        const result=await fetch('/api/portal/rms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo,hotel_id:hotel.id})});
        if(!result.ok) throw Error('Não foi possível consultar os cadastros do hotel.');
        return result.json();
      };
      const [offers,bases]=await Promise.all([
        readHotel('ofertas_consultar'),hotel.code==='PLAZA'?null:readHotel('bases_consultar')
      ]);
      data={...data,offers:offers.ofertas.map(row=>row.detalhes),hotelBases:bases?indexBases(bases):null,
        saleTime:new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Bahia',hour:'2-digit',minute:'2-digit'})};
      if(!isCurrent()) return;
      const byDate=new Map(days.map(d=>[d.date,d]));
      if(hotel.code==='PLAZA') for(const day of Object.keys(data.rates)) if(!byDate.has(day))byDate.set(day,{date:day,rate:null});
      for(const day of data.hotelBases?.calendar.keys() || []) if(!byDate.has(day))byDate.set(day,{date:day,rate:null});
      days=[...byDate.values()].filter(d=>d.date>=data.today&&d.date<='2027-12-31').sort((a,b)=>a.date.localeCompare(b.date));
      const stamp=days.map(d=>d.capturedAt).filter(Boolean).sort().at(-1);
      el('hotelNote').textContent=stamp ? 'Ocupação lida em '+new Date(stamp).toLocaleString('pt-BR',{timeZone:'America/Bahia'})+' (Bahia).' : 'Horário da leitura de ocupação não informado.';
      const captures=hotel.code==='PLAZA'?Object.values(data.rates).map(r=>r.at).filter(Boolean).sort():[];
      el('ratesStatus').textContent=captures.length ? 'Última captura tarifária: '+new Date(captures.at(-1)).toLocaleString('pt-BR',{timeZone:'America/Bahia'})+'. Projeção por nível tarifário para dois adultos.' :
        hotel.code==='TRANCOSO'?'Grade WEB cadastrada para dois adultos. Flutuação desligada.':
        data.hotelBases?.bases.size?'Projeção para dois adultos com os níveis e as ofertas cadastrados no Portal.':'Sem grade tarifária cadastrada para dois adultos.';
      let group='WEB Café';
      const tabs=el('simpleGroups');tabs.replaceChildren();
      for(const label of [...groups,'Todos os grupos']) {const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{group=label;draw();};tabs.append(button);}
      const format=n=>Number.isFinite(n)?n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
      function renderPrices(cell,values){
        cell.classList.add('simple-prices');
        let keys=rooms;
        if(hotel.code==='TRANCOSO') keys=Object.keys(values);
        if(standardOnlyHotels.has(hotel.code)) keys=['standard'];
        if(!keys.length) {
          cell.textContent='—';
          return;
        }
        const prices=document.createElement('div');
        prices.className='simple-price-list';
        keys.forEach(key=>{
          const label=document.createElement('span'),price=document.createElement('strong');
          label.textContent=({standard:'STD',luxo:'Luxo',suite:'Suíte'})[key] || key;
          price.textContent=format(values[key]);
          prices.append(label,price);
        });
        cell.append(prices);
      }
      function draw(){
        [...tabs.children].forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===group)));
        const chosen=group==='Todos os grupos'?groups:[group],table=el('nights');table.replaceChildren();
        const head=table.createTHead().insertRow();
        head.appendChild(document.createElement('th')).textContent='Noite';
        const labels=['Vigente após flutuação','Oferta aplicada','Flutuação Omnibees','Tarifa com oferta aplicada','Nível Tarifário'];
        for(const g of chosen){
          for(const label of labels){
            const th=document.createElement('th'),title=document.createElement('span');
            title.className='simple-group-title';
            title.textContent=g;
            th.append(title,document.createTextNode(label));
            head.append(th);
            if(g===chosen[0] && label===labels[0]){
              for(const name of ['Tx. Ocupação\nOmnibees','Tx. Ocupação\nKPI'])head.appendChild(document.createElement('th')).textContent=name;
            }
          }
        }
        const body=table.createTBody();
        for(const day of days){
          const tr=body.insertRow();
          tr.insertCell().textContent=day.date.split('-').reverse().join('/');
          for(const g of chosen){
            const n=night(data,hotel,day,g);
            renderPrices(tr.insertCell(),n.current);
            if(g===chosen[0]){
              const channelRate=omnibeesOccupancy(day);
              tr.insertCell().textContent=channelRate===null?'—':Math.round(channelRate)+'%';
              tr.insertCell().textContent=Number.isFinite(day.rate)?Math.round(day.rate)+'%':'—';
            }
            for(const value of [n.offer,n.levelLabel]){
              const cell=tr.insertCell();
              cell.classList.add('simple-reason');
              cell.textContent=value;
            }
            renderPrices(tr.insertCell(),n.proposed);
            const reason=tr.insertCell();
            reason.classList.add('simple-reason');
            reason.textContent=n.reason;
          }
        }
        refresh?.();
      }
      draw();
    }catch(error){if(isCurrent())el('hotelNote').textContent=error.message;}
  }
  return {show,night,project,groups,indexBases};
})();
if(typeof module!=='undefined')module.exports=RmsSimple;
