/* Simulação independente: não chama endpoints de aplicação de tarifas. */
const RmsSimple = ((compareLevel,derivePrice,trancosoRules) => {
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
        result[room] = quote && !quote.divergence ? derivePrice(price,quote.discount)?.final ?? null : null;
      } else if (group === 'NET Café') result[room] = derivePrice(price,0)?.net ?? null;
      else result[room] = null;
    }
    return result;
  }
  function levelDescription(level) {
    if (!level) return '—';
    const parts=[level.code,level.name].filter(Boolean);
    const pct=Number(level.pct);
    if (!Number.isFinite(pct) || pct===0) return parts.join(' · ');
    const percentages=(level.name || '').matchAll(/(\d+(?:[.,]\d+)?)\s*%/g);
    if (!Array.from(percentages).some(match=>Number(match[1].replace(',','.'))===pct)) parts.push('+'+level.pct+'%');
    return parts.join(' · ');
  }
  const plazaCodes = {standard:'STD', luxo:'LX', suite:'MAS'};
  function plazaOccupancy(day) {
    return Object.fromEntries(rooms.map(room => {
      const matches = (day.roomTypes || []).filter(type => type.code === plazaCodes[room]);
      const type = matches.length === 1 ? matches[0] : {};
      const fullyAvailable = type.occupied == null && Number.isInteger(type.apartments) &&
        type.apartments > 0 && type.available === type.apartments;
      const occupied = fullyAvailable ? 0 : type.occupied;
      const kpi = type.apartments > 0 && Number.isInteger(occupied)
        ? occupied / type.apartments * 100 : null;
      return [room, kpi];
    }));
  }
  function tariffDays(data,hotel,days) {
    const dates=new Map(days.filter(day=>day.date>=data.today).map(day=>[day.date,day]));
    function add(date) {
      if(date>=data.today && !dates.has(date)) dates.set(date,{date,rate:null,baseProjection:true});
    }
    if(hotel.code==='TRANCOSO'){
      for(const date of data.hotelBases?.calendar.keys() || []) add(date);
    } else {
      for(const period of data.periods.filter(p=>p.hotel_id===hotel.id && !p.bloqueio_avulso)){
        const first=period.inicio>data.today?period.inicio:data.today;
        for(let ms=Date.parse(first);ms<=Date.parse(period.fim);ms+=86400000){
          const date=new Date(ms);
          if(!period.dias || period.dias.includes((date.getUTCDay()+6)%7)) add(date.toISOString().slice(0,10));
        }
      }
    }
    return [...dates.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }
  function night(data, hotel, day, group, previousTariffs) {
    const [channel, meal]=group.split(' ');
    const plan=['Café','MAP','PC'].indexOf(meal);
    const regime=['CAFÉ DA MANHÃ','MEIA PENSÃO','PENSÃO COMPLETA'][plan];
    const rates=data.rates?.[day.date];
    const rules=typeof RmsRules!=='undefined'?RmsRules:require('./rms-rules');
    const period=rules.forNight(data.periods.filter(p=>p.hotel_id===hotel.id),day.date);
    const occupancy=Number.isFinite(day.rate)?day.rate:null;
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
      const code=trancosoRules.levelFor(day.date);
      const name=trancosoRules.periods.find(([key])=>key===code)?.[1];
      vigenteWeb=plan===0?data.hotelBases?.calendar.get(day.date):null;
      levelLabel='Desligada';
      reason=vigenteWeb&&name?`${code} · ${name}`:'Sem tarifa cadastrada para esta noite e regime.';
    } else if (hotel.code === 'PLAZA') {
      vigenteWeb = {};
      levelLabel = {};
      band = {};
      reason = {};
      const byRoom = plazaOccupancy(day);
      for (const room of rooms) {
        const rate = byRoom[room];
        const target = compareLevel(data.catalog,period,day.date,rate,plan,true,day.baseProjection);
        const keep = period?.bloqueado || rate >= 100;
        const recorded = currentWeb?.[room] > 0 ? currentWeb[room] : target.reference[room];
        vigenteWeb[room] = keep && (period?.bloqueado || recorded > 0)
          ? recorded : target.simulated[room];
        levelLabel[room] = keep ? 'Manter' : levelDescription(target.level);
        band[room] = keep ? 'Manter' : target.level ? '+'+target.level.pct+'% sobre a base' : '—';
        reason[room] = keep ? (period?.bloqueado ? 'Flutuação bloqueada.' : 'Categoria esgotada ou em overbooking.' +
          (!(recorded > 0) && vigenteWeb[room] > 0 ? ' Tarifa projetada pela grade do RMS.' : ''))
          : rate == null ? 'Ocupação indisponível.' : !target.level ? 'Sem nível vinculado para esta noite.'
          : (target.base?.name || period.nome)+' · '+(target.base?.code || target.level.code);
      }
    } else {
      let target;
      {
        const baseName=period?.base_origem || baseAliases[hotel.code]?.[period?.nome] || period?.nome;
        const base=baseName&&data.hotelBases?.bases.get(normalize(baseName));
        const rule=rules.band(period,occupancy);
        const pct=day.baseProjection?0:Math.max(0,Number(rule?.pct));
        const level=base&&(rule||day.baseProjection)&&Number.isFinite(pct)?{
          code:pct===0?base.code:null,
          name:base.name,pct
        }:null;
        target={level,base};
        if(level&&!period?.bloqueado) vigenteWeb=Object.fromEntries(rooms.map(room=>{
          const price=base.prices.get(`${plan}|${weekday}|${room}`);
          return [room,price>0?Math.round(price*(100+pct))/100:null];
        }));
      }
      levelLabel=hold?'Manter':levelDescription(target.level);
      band=hold?'Manter':target.level?'+'+target.level.pct+'% sobre a base':'—';
      reason=hold?(period?.bloqueado?'Flutuação bloqueada.':'Esgotado ou em overbooking.')+
        (vigenteWeb?' Tarifa projetada pela grade do RMS.':' Tarifa indisponível na grade do RMS.'):
        occupancy==null?'Ocupação indisponível.':!target.level?'Sem nível vinculado para esta noite.':
        (target.base?.name || period.nome)+(target.base?.code || target.level.code?' · '+(target.base?.code || target.level.code):'');
    }
    const roomKeys=trancoso?Object.keys(vigenteWeb||{}):rooms;
    // Compare WEB prices before channel derivation and before today's offer.
    const previous = previousTariffs?.['WEB '+meal];
    if (!trancoso && previous) {
      const held = roomKeys.filter(room => previous.current?.[room] > 0 &&
        vigenteWeb?.[room] > 0 && previous.current[room] > vigenteWeb[room]);
      if (held.length) {
        vigenteWeb = {...vigenteWeb};
        const byRoom = value => typeof value === 'object' && value !== null
          ? {...value} : Object.fromEntries(roomKeys.map(room => [room,value]));
        levelLabel = byRoom(levelLabel);
        band = byRoom(band);
        reason = byRoom(reason);
        for (const room of held) {
          vigenteWeb[room] = previous.current[room];
          levelLabel[room] = byRoom(previous.levelLabel)[room];
          band[room] = byRoom(previous.band)[room];
          reason[room] = 'Mantida a última tarifa antes da oferta.';
        }
      }
    }
    function channelPrices(web,discount){
      return Object.fromEntries(roomKeys.map(room=>{
        const price=web?.[room];
        if(!(price>0))return [room,null];
        const cents=Math.round(Math.round(price*100)*(100-discount)/100);
        const derived=cents===0?0:derivePrice(cents/100,0,regime)?.[channel.toLowerCase()];
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
      let published;
      if(data.cloudSnapshots){
        const response=await fetch('/api/portal/rms',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({tipo:'simulacao_publicada',hotel_id:hotel.id})});
        if(!response.ok) throw Error('Não foi possível carregar o cálculo publicado pelo RMS.');
        published=await response.json();
      }
      if(published){
        days=published.days;
      } else {
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
      }
      if(!published || !published.tariffHorizon){
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
      }
      if(!isCurrent()) return;
      days=published?.tariffHorizon?days.filter(day=>day.date>=data.today):tariffDays(data,hotel,days);
      const stamp=days.map(d=>d.capturedAt).filter(Boolean).sort().at(-1);
      el('hotelNote').textContent=stamp ? 'Ocupação lida em '+new Date(stamp).toLocaleString('pt-BR',{timeZone:'America/Bahia'})+' (Bahia).' : 'Horário da leitura de ocupação não informado.';
      el('ratesStatus').textContent=hotel.code==='PLAZA' ? 'Projeção por nível tarifário para dois adultos.' :
        hotel.code==='TRANCOSO'?'Grade WEB cadastrada para dois adultos. Flutuação desligada.':
        data.hotelBases?.bases.size?'Projeção para dois adultos com os níveis e as ofertas cadastrados no Portal.':'Sem grade tarifária cadastrada para dois adultos.';
      if(published) el('ratesStatus').textContent='Tarifas calculadas após a atualização do mapa KPI.';
      const simulated=(day,g)=>day.tariffs?day.tariffs[g]:night(data,hotel,day,g);
      let group='WEB Café';
      const tabs=el('simpleGroups');tabs.replaceChildren();
      for(const label of [...groups,'Todos os grupos']) {const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{group=label;draw();};tabs.append(button);}
      const format=n=>Number.isFinite(n)?n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
      function renderPrices(cell,values,formatter=format){
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
          price.textContent=formatter(values[key]);
          prices.append(label,price);
        });
        cell.append(prices);
      }
      const confirmations = new Map();
      const updateTimes = new Map();
      const localDate = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia'});
      const channels = ['DeskHotel', 'Omnibees', 'CVC', 'Juniper'];
      const enabled = hotel.code==='PLAZA';
      const siteGroups = ['SITE Café','SITE MAP','SITE PC'];
      const channelKey = (g,room)=>(g==='SITE Café'?'':g.slice(5)+':')+normalize(room);
      const modal = el('deskhotelPreview'), update = el('updateDeskhotel');
      if (modal.open) modal.close();
      update.hidden = !enabled || !days.length;
      update.disabled = false;
      const categoryNames = {standard:'Standard',luxo:'Luxo',suite:'Suíte'};
      const categoryKeys = values => standardOnlyHotels.has(hotel.code) ? ['standard'] : Object.keys(values);
      const cellUpdates = new Map();
      function isConfirmed(date,key,price) {
        const read = confirmations.get(date)?.[key];
        const cents = Math.round(price*100);
        const target = [cents,cents,Math.round(cents*140/100),Math.round(cents*180/100)];
        return cents>0 && read?.length>0 && read.length<=4 && read.every((v,i)=>v===target[i]);
      }
      async function request(tipo,body) {
        const response=await fetch('/api/portal/rms',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({tipo,hotel:hotel.code,...body})});
        const result=await response.json();
        if (!response.ok) throw Error(result.error || 'Falha ao consultar o DeskHotel.');
        return result;
      }
      let writing=false, revision=0;
      async function readStatus(first,last) {
        const version=revision;
        const result=await request('deskhotel_status',{noite:first,fim:last});
        if (!isCurrent() || version!==revision) return;
        for (const day of days) {
          if (day.date<first || day.date>last) continue;
          confirmations.set(day.date,result.confirmed[day.date] || {});
          updateTimes.set(day.date,result.updatedAt?.[day.date] || {});
          cellUpdates.get(day.date)?.();
        }
      }
      async function loadStatuses() {
        if (!enabled) return;
        for (let i=0;i<days.length && isCurrent();) {
          const first=days[i].date;
          let last=first;
          while(i<days.length && Date.parse(days[i].date)-Date.parse(first)<=30*86400000) last=days[i++].date;
          try { await readStatus(first,last); }
          catch { /* Sem confirmação de leitura, a coluna permanece pendente. */ }
        }
      }
      update.onclick=()=>{
        if (writing || !enabled || !isCurrent()) return;
        const heading=document.createElement('h3');
        heading.textContent=hotel.name+' · SITE Café, MAP e PC';
        const dates=['De','Até'].map(label=>{
          const wrapper=document.createElement('label'),input=document.createElement('input');
          input.type='date'; input.min=days[0].date; input.max=days.at(-1).date; input.value=days[0].date;
          wrapper.append(label,input); return {wrapper,input};
        });
        const detail=document.createElement('div'), message=document.createElement('p');
        message.setAttribute('role','status');
        const send=document.createElement('button'), close=document.createElement('button');
        send.type=close.type='button'; send.textContent='Enviar tarifas pendentes'; close.textContent='Fechar';
        close.onclick=()=>modal.close();
        modal.oncancel=event=>{if(writing)event.preventDefault();};
        let selection=[];
        function preview() {
          detail.replaceChildren(); selection=[];
          const [start,end]=dates.map(d=>d.input.value);
          if (start && end && start<=end) {
            const table=document.createElement('table'), header=table.createTHead().insertRow();
            for(const name of ['Noite','Regime','Categoria','Tarifa com oferta aplicada (R$)']){
              header.appendChild(document.createElement('th')).textContent=name;
            }
            const body=table.createTBody();
            for (const day of days.filter(d=>d.date>=start && d.date<=end)) {
              const values={};
              for(const g of siteGroups){
                const prices=simulated(day,g)?.proposed || {};
                for(const room of categoryKeys(prices)){
                  const price=prices[room], cents=Math.round(price*100), key=channelKey(g,room);
                  if (!Number.isSafeInteger(cents) || cents<=0 || isConfirmed(day.date,key,price)) continue;
                  values[key]=cents;
                  const row=body.insertRow();
                  for(const value of [day.date.split('-').reverse().join('/'),g,categoryNames[room]||room,format(price)]) row.insertCell().textContent=value;
                }
              }
              if(Object.keys(values).length)selection.push({noite:day.date,valores:values});
            }
            if(selection.length)detail.append(table);
          }
          message.textContent=selection.length?'Envio por categoria, respeitando a capacidade cadastrada no DeskHotel.':'Nenhuma tarifa elegível no período.';
          send.disabled=!selection.length;
        }
        for(const d of dates)d.input.onchange=preview;
        send.onclick=async()=>{
          if(writing || !selection.length || !isCurrent())return;
          writing=true; revision++; send.disabled=close.disabled=update.disabled=true;
          for(const d of dates)d.input.disabled=true;
          let pending=0;
          try{
            for(const item of selection){
              if(!isCurrent())break;
              message.textContent='Atualizando '+item.noite+'…';
              await request('deskhotel_atualizar',item);
              const confirmed=()=>Object.entries(item.valores).every(([room,c])=>isConfirmed(item.noite,room,c/100));
              for(const delay of [0,2000,4000,8000]){
                if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
                await readStatus(item.noite,item.noite);
                if(confirmed())break;
              }
              if(!confirmed())pending++;
            }
            message.textContent=pending?'Envio aceito. Noites aguardando confirmação: '+pending+'.':'Gravação confirmada pela API do DeskHotel.';
          }catch(error){message.textContent=error.message;}
          finally{writing=false;close.disabled=false;update.disabled=false;}
        };
        modal.replaceChildren(heading,...dates.map(d=>d.wrapper),detail,message,send,close);
        preview(); modal.showModal();
      };
      function draw(){
        cellUpdates.clear();
        [...tabs.children].forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===group)));
        const chosen=group==='Todos os grupos'?groups:[group],table=el('nights');table.replaceChildren();
        const head=table.createTHead().insertRow();
        head.appendChild(document.createElement('th')).textContent='Noite';
        const labels=['Vigente após flutuação','Oferta aplicada','Flutuação Omnibees','Tarifa com oferta aplicada'];
        for(const g of chosen){
          for(const label of labels){
            const th=document.createElement('th'),title=document.createElement('span');
            title.className='simple-group-title';
            title.textContent=g;
            th.append(title,document.createTextNode(label));
            head.append(th);
            if(g===chosen[0] && label===labels[0]){
              head.appendChild(document.createElement('th')).textContent='Tx. Ocupação\nKPI';
            }
          }
        }
        for (const channel of channels) head.appendChild(document.createElement('th')).textContent = channel;
        const body=table.createTBody();
        for(const day of days){
          const tr=body.insertRow();
          tr.insertCell().textContent=day.date.split('-').reverse().join('/');
          const sitePrices=new Map();
          let nightPrices;
          const occupancyByRoom = hotel.code === 'PLAZA' ? plazaOccupancy(day) : null;
          for(const g of chosen){
            const n=simulated(day,g);
            nightPrices=n.proposed;
            if (siteGroups.includes(g)) sitePrices.set(g,n.proposed);
            renderPrices(tr.insertCell(),n.current);
            if(g===chosen[0] && occupancyByRoom){
              renderPrices(tr.insertCell(), occupancyByRoom, rate=>Number.isFinite(rate)?Math.round(rate)+'%':'—');
            } else if(g===chosen[0]){
              tr.insertCell().textContent=Number.isFinite(day.rate)?Math.round(day.rate)+'%':'—';
            }
            for(const value of [n.offer,n.levelLabel]){
              const cell=tr.insertCell();
              cell.classList.add('simple-reason');
              if (typeof value === 'object') renderPrices(cell,value,String);
              else cell.textContent=value;
            }
            renderPrices(tr.insertCell(),n.proposed);
          }
          for (const channel of channels) {
            const cell = tr.insertCell();
            const prices=nightPrices;
            const statuses=categoryKeys(prices).map(room=>{
              const line=document.createElement('div');
              line.title=(channel==='DeskHotel' && sitePrices.size?[...sitePrices.keys()].join(', ')+' · ':'')+(categoryNames[room] || room);
              line.className='channel-status';
              line.textContent='Pendente';
              cell.append(line);
              return {room,line};
            });
            if(channel==='DeskHotel' && sitePrices.size && enabled){
              const refreshStatus=()=>{
                for(const {room,line} of statuses){
                  const ok=[...sitePrices].every(([g,prices])=>isConfirmed(day.date,channelKey(g,room),prices[room]));
                  const stamp=[...sitePrices.keys()].map(g=>updateTimes.get(day.date)?.[channelKey(g,room)]).filter(Boolean).sort().at(-1);
                  line.textContent=ok && stamp ? 'OK · '+localDate.format(new Date(stamp)) : ok ? 'OK' : 'Pendente';
                }
              };
              cellUpdates.set(day.date,refreshStatus);
              refreshStatus();
            }
          }
        }
        refresh?.();
      }
      draw();
      void loadStatuses();
    }catch(error){if(isCurrent())el('hotelNote').textContent=error.message;}
  }
  return {show,night,project,groups,indexBases,tariffDays};
})(
  typeof plazaLevelComparison==='function'?plazaLevelComparison:require('./rms-levels').plazaLevelComparison,
  typeof plazaPrices==='function'?plazaPrices:require('./rms-plaza-tarifas').plazaPrices,
  typeof RmsTrancoso!=='undefined'?RmsTrancoso:require('./rms-trancoso')
);
if(typeof module!=='undefined')module.exports=RmsSimple;
