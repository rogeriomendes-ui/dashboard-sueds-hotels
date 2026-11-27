function openDeskhotelGeneral({modal,hotels,today,request,siteGroups,channelKey,normalize,matchesDeskhotel,panelStatus,refreshSent}) {
  const make=(tag,text)=>{
    const element=document.createElement(tag);
    if(text)element.textContent=text;
    return element;
  };
  const heading=make('h3','Atualizar DeskHotel geral');
  const fieldset=make('fieldset');
  fieldset.append(make('legend','Hotéis'));
  const checks=hotels.map(hotel=>{
    const label=make('label'), input=make('input');
    input.type='checkbox';
    input.disabled=!['PLAZA','SEGUNDO_SOL','CABRALIA','PREMIUM','TRANCOSO'].includes(hotel.code);
    label.append(input,hotel.name+(input.disabled?' · sem tarifa SITE compatível':''));
    fieldset.append(label);
    return {hotel,input};
  });
  const dates=['De','Até'].map(text=>{
    const label=make('label'),input=make('input');
    input.type='date';input.min=today;input.value=today;
    label.append(text,input);return {label,input};
  });
  const send=make('button','Enviar tarifas SITE'), close=make('button','Fechar');
  const status=make('div');
  status.setAttribute('role','status');
  const instructions=make('p','Envie os preços SITE com oferta para as noites do período. Cada regime depende do cadastro no DeskHotel.');
  let busy=false;
  function validate(){
    const [start,end]=dates.map(d=>d.input.value);
    send.disabled=busy || !checks.some(c=>c.input.checked) || !start || start<today || !end || end<start;
  }
  fieldset.onchange=validate;
  dates.forEach(d=>d.input.oninput=validate);
  close.onclick=()=>modal.close();
  const preventClose=e=>{if(busy)e.preventDefault()};
  modal.addEventListener('cancel',preventClose);
  modal.addEventListener('close',()=>modal.removeEventListener('cancel',preventClose),{once:true});
  send.onclick=async()=>{
    validate();if(send.disabled)return;
    const [start,end]=dates.map(d=>d.input.value);
    busy=true;validate();fieldset.disabled=close.disabled=true;
    dates.forEach(d=>d.input.disabled=true);
    status.replaceChildren();
    try{
      for(const {hotel,input} of checks.filter(c=>c.input.checked)){
        const line=make('p',hotel.name+' · conferindo…');status.append(line);
        let queued=0,unchanged=0,skipped=0,night='';
        let changedFrom='',changedTo='';
        async function refreshChanges(){
          if(!changedFrom)return;
          const first=changedFrom;
          changedFrom='';
          await refreshSent(hotel.code,first,changedTo);
        }
        try{
          const snapshot=await request('simulacao_publicada',{hotel:hotel.code,hotel_id:hotel.id});
          const nights=(snapshot?.days||[]).filter(d=>d.date>=start && d.date<=end);
          if(!nights.length)throw Error('Sem tarifas publicadas no período.');
          let confirmed={},statusEnd='';
          for(const day of nights){
            night=day.date;line.textContent=hotel.name+' · '+night+' · conferindo…';
            if(changedFrom && Date.parse(night)-Date.parse(changedFrom)>30*86400000)await refreshChanges();
            const panel=panelStatus(hotel.code,night);
            if(!panel && night>statusEnd){
              const limit=new Date(Date.parse(night)+30*86400000).toISOString().slice(0,10);
              statusEnd=limit<end?limit:end;
              const status=await request('deskhotel_status',{hotel:hotel.code,noite:night,fim:statusEnd});
              confirmed=status.confirmed;
            }
            const values={};
            for(const group of siteGroups){
              for(const [room,price] of Object.entries(day.tariffs[group]?.proposed||{})){
                if(['PREMIUM','CABRALIA','SEGUNDO_SOL'].includes(hotel.code) && room!=='standard')continue;
                if(Number.isFinite(price)&&price>0)values[channelKey(group,room)]=Math.round(price*100);
              }
            }
            if(!Object.keys(values).length){skipped++;continue}
            for(const [key,cents] of Object.entries(values)){
              const current=(panel ?? confirmed[night])?.[key];
              if(matchesDeskhotel(current,cents)){
                delete values[key];
                unchanged++;
              }
            }
            if(!Object.keys(values).length)continue;
            const body={hotel:hotel.code,noite:night};
            const preview=await request('deskhotel_previa',body);
            const mapped=new Set(Object.entries(preview.prices).filter(([,v])=>Array.isArray(v)).map(([k])=>k.includes(':')?k:normalize(k)));
            for(const key of Object.keys(values))if(!mapped.has(key)){delete values[key];skipped++}
            const count=Object.keys(values).length;
            if(!count)continue;
            line.textContent=hotel.name+' · '+night+' · enviando…';
            changedFrom ||= night;
            changedTo=night;
            const result=await request('deskhotel_atualizar',{...body,valores:values});
            queued+=result.queued;unchanged+=count-result.queued;
          }
          line.textContent=hotel.name+' · '+queued+' tarifas aceitas, '+unchanged+' já vigentes. Itens sem envio: '+skipped+'.';
        }catch(error){line.textContent=hotel.name+' · envio interrompido '+night+'. Tarifas aceitas até então: '+queued+'. '+error.message}
        finally{
          try{await refreshChanges();}
          catch{line.textContent+=' Não foi possível confirmar o status no painel.';}
        }
      }
    }finally{
      busy=false;fieldset.disabled=close.disabled=false;
      dates.forEach(d=>d.input.disabled=false);validate();
    }
  };
  modal.replaceChildren(heading,instructions,fieldset,...dates.map(d=>d.label),send,close,status);
  validate();modal.showModal();
}
