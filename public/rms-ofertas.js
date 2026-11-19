const RmsOfertas=(()=>{
  const el=id=>document.getElementById(id);
  let version=0;

  function node(tag,text){
    const element=document.createElement(tag);
    if(text!=null)element.textContent=text;
    return element;
  }

  function action(text,label,click){
    const button=node('button',text);
    button.type='button';
    button.setAttribute('aria-label',label);
    button.title=label;
    button.onclick=click;
    return button;
  }

  const date=value=>value.split('-').reverse().join('/');
  const weekdays=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  function show(hotel){
    const current=++version;
    const card=el('offerCard'),disclosure=card.querySelector('details'),list=el('offerList'),status=el('offerStatus');
    const dialog=el('offerDialog'),form=el('offerForm');
    dialog.close();
    card.hidden=false;
    list.replaceChildren();
    status.textContent='';
    let loaded=false,loading=false;

    async function request(tipo,extra={}){
      const response=await fetch('/api/portal/rms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo,hotel_id:hotel.id,...extra})});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Não foi possível consultar as ofertas.');
      return data;
    }

    function edit(row){
      const draft=structuredClone(row.detalhes);
      form.replaceChildren();
      function field(parent,label,input){
        const item=node('label',label);
        item.append(input);parent.append(item);
        return input;
      }
      function input(key,label,type='text'){
        const element=node('input');
        element.type=type;
        element.value=draft[key]??'';
        if(type==='text'){element.required=true;element.maxLength=200;}
        else{element.min=key==='desconto'?0:1;element.max=key==='desconto'?100:365;element.step=key==='desconto'?'.01':'1';}
        return field(form,label,element);
      }
      const name=input('nome','Oferta'),type=input('tipo','Tipo de oferta'),discount=input('desconto','Desconto (%)','number');
      const nights=input('noites','Noites de estadia','number'),free=input('noites_gratis','Noites grátis','number');
      function periods(key,title){
        const group=node('fieldset'),dates=node('div');
        const unrestricted=node('input');unrestricted.type='checkbox';unrestricted.checked=draft[key]===null;
        let ranges=draft[key]??[['','']];
        const add=action('+ Período','Adicionar período de '+title.toLowerCase(),()=>{ranges.push(['','']);draw();});
        group.append(node('legend',title));
        field(group,'Qualquer data',unrestricted);
        group.append(dates,add);
        function draw(){
          dates.replaceChildren();
          add.hidden=unrestricted.checked;
          draft[key]=unrestricted.checked?null:ranges;
          if(unrestricted.checked)return;
          ranges.forEach((pair,index)=>{
            const line=node('div');line.className='offer-date-row';
            for(const [i,label] of ['De','Até'].entries()){
              const control=node('input');control.type='date';control.required=true;control.value=pair[i];
              control.oninput=()=>{pair[i]=control.value;};field(line,label,control);
            }
            const remove=action('Remover','Remover período '+(index+1),()=>{ranges.splice(index,1);draw();});
            remove.disabled=ranges.length===1;
            line.append(remove);dates.append(line);
          });
        }
        unrestricted.onchange=draw;
        draw();form.append(group);
      }
      periods('reserva','Reserva');
      const schedule=node('fieldset'),hours=node('div');
      hours.className='offer-date-row';
      schedule.append(node('legend','Horário de reserva'),hours);
      const times=['De','Até'].map((label,index)=>{
        const control=node('input');control.type='time';control.value=draft.horario_reserva?.[index]??'';
        return field(hours,label,control);
      });
      form.append(schedule);
      periods('estadia','Estadia');
      const week=node('fieldset'),dayList=node('div');
      dayList.className='offer-week';
      week.append(node('legend','Dias da semana da estadia'),dayList);
      const days=weekdays.map((day,index)=>{
        const control=node('input');control.type='checkbox';control.checked=draft.dias_estadia?.includes(index)??false;
        return field(dayList,day,control);
      });
      form.append(week);
      const plans=node('textarea');plans.required=true;plans.rows=4;plans.value=draft.tarifarios.join('\n');
      field(form,'Tarifários disponíveis (um por linha)',plans);
      const message=node('p');message.setAttribute('role','status');
      const actions=node('div');actions.className='offer-actions';
      const save=node('button','Salvar no Portal');save.type='submit';
      actions.append(save,action('Cancelar','Cancelar edição',()=>dialog.close()));
      form.append(message,actions);
      form.onsubmit=async event=>{
        event.preventDefault();
        save.disabled=true;message.textContent='';
        const value=element=>element.value===''?null:element.valueAsNumber;
        Object.assign(draft,{nome:name.value.trim(),tipo:type.value.trim(),desconto:value(discount),noites:value(nights),noites_gratis:value(free),tarifarios:plans.value.split('\n').map(v=>v.trim()).filter(Boolean)});
        const horario=times.map(input=>input.value);
        if(horario.some(Boolean))draft.horario_reserva=horario;
        else if('horario_reserva' in draft)draft.horario_reserva=null;
        const dias=days.flatMap((input,index)=>input.checked?[index]:[]);
        if(dias.length)draft.dias_estadia=dias;
        else if('dias_estadia' in draft)draft.dias_estadia=null;
        try{
          await request('oferta_salvar',{id:row.id,gravado_em:row.gravado_em,detalhes:draft});
          if(current===version){dialog.close();loaded=false;await load();}
        }catch(error){message.textContent=error.message;}finally{save.disabled=false;}
      };
      dialog.showModal();
    }

    function render(rows){
      list.replaceChildren();
      if(!rows.length){list.append(node('p','Nenhuma oferta vigente cadastrada para este hotel.'));return;}
      const table=node('table'),header=table.createTHead().insertRow();
      for(const label of ['Oferta','Tipo','Noites de estadia','Noites grátis','Desconto','Editável por','Ações']){
        const th=node('th',label);th.scope='col';header.append(th);
      }
      const body=table.createTBody();
      for(const row of rows){
        const offer=row.detalhes,tr=body.insertRow();
        const expanded=body.insertRow();expanded.hidden=true;
        const cell=expanded.insertCell();cell.colSpan=7;
        const details=node('div');details.className='offer-details';
        cell.append(details);
        const toggle=action(offer.nome,'Detalhes de '+offer.nome,()=>{
          expanded.hidden=!expanded.hidden;
          toggle.setAttribute('aria-expanded',String(!expanded.hidden));
        });
        toggle.className='offer-toggle';toggle.setAttribute('aria-expanded','false');
        tr.insertCell().append(toggle);
        for(const [title,values] of [
          ['Período para reserva',[
            ...(offer.reserva?.map(([a,b])=>date(a)+' a '+date(b))??['Qualquer data']),
            ...(offer.horario_reserva?[offer.horario_reserva.join(' às ')]:[])
          ]],
          ['Período de estadia',[
            ...(offer.estadia?.map(([a,b])=>date(a)+' a '+date(b))??['Qualquer data']),
            ...(offer.dias_estadia?[offer.dias_estadia.map(index=>weekdays[index]).join(', ')]:[])
          ]],
          ['Disponível para',offer.tarifarios]
        ]){
          const group=node('div');
          const ul=node('ul');for(const value of values)ul.append(node('li',value));
          group.append(node('strong',title),ul);details.append(group);
        }
        for(const value of [offer.tipo,offer.noites,offer.noites_gratis,offer.desconto==null?null:offer.desconto.toLocaleString('pt-BR')+'%',offer.editavel_por]){
          tr.insertCell().textContent=value??'—';
        }
        const tools=node('div');tools.className='offer-actions';
        const remove=action('Excluir','Excluir '+offer.nome,async()=>{
          if(!window.confirm('Excluir a oferta “'+offer.nome+'” do Portal Sueds?'))return;
          remove.disabled=true;
          try{await request('oferta_excluir',{id:row.id,gravado_em:row.gravado_em});if(current===version){loaded=false;await load();}}
          catch(error){if(current===version)status.textContent=error.message;}finally{remove.disabled=false;}
        });
        tools.append(action('✎','Editar '+offer.nome,()=>edit(row)),remove);
        tr.insertCell().append(tools);
      }
      list.append(table);
    }

    async function load(){
      if(!disclosure.open||loading||loaded)return;
      loading=true;status.textContent='Carregando ofertas…';
      try{
        const data=await request('ofertas_consultar');
        if(current!==version)return;
        render(data.ofertas);
        loaded=true;status.textContent='';
      }catch(error){if(current===version)status.textContent=error.message;}
      finally{loading=false;}
    }
    disclosure.ontoggle=()=>load();
    load();
  }
  return {show};
})();
