const RmsRuleEditor=(()=>{
  const el=id=>document.getElementById(id),week=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
  const date=s=>s.split('-').reverse().join('/');
  let version=0;
  function node(tag,text){const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;}
  function button(text,action){const n=node('button',text);n.type='button';n.onclick=action;return n;}
  function field(text,input){const l=node('label',text);l.append(input);return l;}
  function input(type,value){const n=node('input');n.type=type;n.value=value??'';n.required=true;return n;}
  async function show(data,hotel,reload){
    const token=++version,host=el('ruleSets');host.hidden=false;
    el('ruleDialog').close();el('ruleMessage').textContent='';
    const catalog=hotel.code==='PLAZA'?data.catalog:null;
    const groups=RmsRules.groups(data.periods,catalog,hotel.id);
    let baseNames=[],mode='active';
    const status=g=>RmsRules.expired(g,data.today)?'expired':g.bloqueado?'blocked':'active';
    const fetchBases=async()=>{
      if(baseNames.length)return;
      const r=await fetch('/api/portal/rms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo:'bases_consultar',hotel_id:hotel.id})});
      const b=await r.json();if(!r.ok)throw Error(b.error||'Falha ao carregar bases.');
      baseNames=[...new Set([...b.rows.map(x=>x.base),...(catalog?.bases.map(b=>b.name)||[])])].sort();
    };
    function render(){
      const list=el('ruleList');list.replaceChildren();
      if(mode==='blocked')renderBlocks(list);
      const visible=groups.filter(g=>status(g)===mode&&g.nome.toLocaleLowerCase().includes(el('ruleSearch').value.toLocaleLowerCase()));
      el('ruleCount').textContent=`${groups.length} conjuntos · ${groups.reduce((n,g)=>n+g.periodos.length,0)} períodos · ${hotel.name}`;
      if(!visible.length&&mode!=='blocked')list.append(node('p','Nenhum conjunto nesta visualização.'));
      for(const g of visible){
        const card=node('article');card.className='rule-card';const title=node('div');title.append(node('strong',g.nome));
        const dates=node('div');
        for(const p of g.periodos){const line=node('div',`Ativo de ${date(p.inicio)} até ${date(p.fim)}`);const days=node('div');days.className='rule-week';for(let d=0;d<7;d++){const badge=node('span',week[d][0]);badge.title=week[d];badge.className=p.dias.includes(d)?'enabled':'';days.append(badge);}line.append(days);dates.append(line);}
        const actions=node('div');actions.className='rule-actions';actions.append(node('small',g.faixas.length+' regras de flutuação'),button('Duplicar',()=>open(g,true)),button('Editar',()=>open(g)),button('Excluir',()=>open(g,false,true)));
        card.append(title,dates,actions);list.append(card);
      }
    }
    function renderBlocks(list){
      const record=data.bloqueios?.find(b=>b.hotel_id===hotel.id);
      const periods=(record?.periodos||[]).map(p=>({...p}));
      const form=node('form'),rows=node('div'),message=node('p');message.setAttribute('role','status');
      form.append(node('p','Da primeira à última noite, manter a tarifa vigente na simulação. O bloqueio vale para todos os regimes e categorias deste hotel.'),rows);
      function draw(){rows.replaceChildren();for(const p of periods){const row=node('div');row.className='rule-date';const start=input('date',p.inicio),end=input('date',p.fim);start.onchange=()=>p.inicio=start.value;end.onchange=()=>p.fim=end.value;row.append(field('De',start),field('Até',end),button('Remover período',()=>{periods.splice(periods.indexOf(p),1);draw();}));rows.append(row);}if(!periods.length)rows.append(node('p','Nenhum período de flutuação bloqueada.'));}
      draw();const save=node('button','Salvar alterações');save.type='submit';form.append(button('+ Adicionar período de flutuação bloqueada',()=>{periods.push({inicio:'',fim:''});draw();}),save,message);
      if(record?.gravado_em)form.append(node('p',`Última gravação: ${new Date(record.gravado_em).toLocaleString('pt-BR')} · ${record.gravado_por||''}`));
      form.onsubmit=async e=>{e.preventDefault();save.disabled=true;message.textContent='Salvando…';try{const r=await fetch('/api/portal/rms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo:'bloqueios_salvar',hotel_id:hotel.id,periodos:periods,gravado_em:record?.gravado_em||null})});const b=await r.json();if(!r.ok)throw Error(b.error||'Falha ao salvar bloqueios.');if(version!==token)return;await reload();el('ruleMessage').textContent='Bloqueios salvos somente na simulação.';}catch(e){message.textContent=e.message;}finally{save.disabled=false;}};
      list.append(form);
    }
    el('ruleTabs').replaceChildren(...[['active','Regras de flutuação'],['expired','Regras vencidas'],['blocked','Flutuação bloqueada']].map(([key,label])=>{const b=button(label,()=>{mode=key;for(const t of el('ruleTabs').children)t.setAttribute('aria-pressed',String(t===b));render();});b.setAttribute('aria-pressed',String(key===mode));return b;}));
    el('ruleSearch').value='';el('ruleSearch').oninput=render;
    el('ruleAdd').onclick=()=>open(null);
    el('ruleClose').onclick=()=>el('ruleDialog').close();
    async function open(source,copy=false,remove=false){
      el('ruleMessage').textContent='';
      try{await fetchBases();}catch(e){el('ruleMessage').textContent=e.message;return;}
      if(version!==token)return;
      if(!baseNames.length){el('ruleMessage').textContent='Cadastre primeiro os tarifários base deste hotel.';return;}
      const g=source?JSON.parse(JSON.stringify(source)):{nome:'',base_origem:'',periodos:[{inicio:'',fim:'',dias:[0,1,2,3,4,5,6]}],faixas:[{de:0,ate:50,pct:0},{de:50.1,ate:60,pct:10},{de:60.1,ate:70,pct:15},{de:70.1,ate:80,pct:20},{de:80.1,ate:100,pct:30}],origens:[],bloqueado:false};
      if(copy){g.id=null;g.origens=[];g.gravado_em=null;g.nome+=' — cópia';}
      el('ruleDialogTitle').textContent=remove?'Excluir conjunto da simulação':source&&!copy?'Edição de conjunto de flutuação':'Novo conjunto de flutuação';
      const form=el('ruleSetForm');form.replaceChildren();
      const name=input('text',g.nome);name.maxLength=120;
      const base=node('select');base.required=true;base.add(new Option('Selecione a base original',''));baseNames.forEach(n=>base.add(new Option(n,n)));base.value=g.base_origem;
      form.append(field('Descrição',name),field('Tarifário base WEB',base));
      const dates=node('fieldset');dates.append(node('legend','Datas e dias da semana'));const dateRows=node('div');dates.append(dateRows);
      function renderDates(){dateRows.replaceChildren();for(const p of g.periodos){const row=node('div');row.className='rule-date';const start=input('date',p.inicio),end=input('date',p.fim);start.onchange=()=>p.inicio=start.value;end.onchange=()=>p.fim=end.value;row.append(field('Válida de',start),field('Até',end));const days=node('div');days.className='rule-week';week.forEach((day,d)=>{const c=node('input');c.type='checkbox';c.checked=p.dias.includes(d);c.setAttribute('aria-label',day);c.onchange=()=>{p.dias=Array.from(days.querySelectorAll('input')).flatMap((n,i)=>n.checked?[i]:[]);};const l=field(day[0],c);l.title=day;days.append(l);});row.append(days,button('Remover período',()=>{g.periodos=g.periodos.filter(x=>x!==p);renderDates();}));dateRows.append(row);}}
      dates.append(button('+ Adicionar período',()=>{g.periodos.push({inicio:'',fim:'',dias:[0,1,2,3,4,5,6]});renderDates();}));renderDates();form.append(dates);
      const bands=node('fieldset');bands.append(node('legend','Faixa de ocupação e nível tarifário'));const bandRows=node('div');bands.append(bandRows);
      function levels(){const b=catalog?.bases.find(b=>b.name===base.value);return b?b.levels:[...new Set([0,...groups.flatMap(x=>x.faixas.map(f=>f.pct)),...g.faixas.map(f=>f.pct)])].sort((a,b)=>a-b).map(pct=>({pct,name:pct?base.value+' +'+pct+'%':base.value+' · Base'}));}
      function renderBands(){
        bandRows.replaceChildren();let from=0;
        g.faixas.forEach((f,i)=>{f.de=from;from=Math.round(f.ate*10+1)/10;const row=node('div');row.className='rule-band';const low=input('number',f.de);low.readOnly=true;const high=input('number',f.ate);high.min=f.de;high.max=100;high.step='.1';high.readOnly=i===g.faixas.length-1;high.onchange=()=>{f.ate=Number(high.value);renderBands();};const level=node('select');level.required=true;level.add(new Option('Selecione um nível',''));levels().forEach(l=>level.add(new Option(l.name,l.pct)));level.value=f.pct;level.onchange=()=>f.pct=Number(level.value);row.append(field('De (%)',low),field('Até (%)',high),field('Preço / nível',level),button('Remover faixa',()=>{g.faixas.splice(i,1);if(g.faixas.length)g.faixas.at(-1).ate=100;renderBands();}));bandRows.append(row);});
      }
      base.onchange=renderBands;
      bands.append(button('+ Adicionar faixa',()=>{const last=g.faixas.at(-1);if(last){if(last.de>=99.9)return;last.ate=Math.round((last.de+100)/2*10)/10;}g.faixas.push({de:last?last.ate+.1:0,ate:100,pct:0});renderBands();}));renderBands();form.append(bands);
      const blocked=node('input');blocked.type='checkbox';blocked.checked=g.bloqueado;form.append(field('Bloquear flutuação deste conjunto na simulação (manter tarifa vigente)',blocked));
      const audit=node('p',g.gravado_em?`Última gravação: ${new Date(g.gravado_em).toLocaleString('pt-BR')} · ${g.gravado_por||''}`:'Configuração importada. Alterações somente no Portal.');form.append(audit);
      if(copy)form.append(node('p','Altere as datas da cópia para não sobrepor o conjunto original.'));
      if(remove)form.append(node('p','A exclusão retira o conjunto da simulação do Portal. Os registros importados e o BeePrice serão preservados.'));
      const msg=node('p');msg.setAttribute('role','status');const save=node('button',remove?'Confirmar exclusão no Portal':'Salvar no Portal');save.type='submit';form.append(msg,save,button('Cancelar',()=>el('ruleDialog').close()));
      form.onsubmit=async e=>{e.preventDefault();save.disabled=true;msg.textContent='Salvando…';
        try{const payload={tipo:'conjunto_salvar',hotel_id:hotel.id,id:g.id||null,gravado_em:g.gravado_em||null,origens:g.origens,nome:name.value,base_origem:base.value,periodos:g.periodos,faixas:g.faixas,bloqueado:blocked.checked,excluido:remove};
          const response=await fetch('/api/portal/rms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw Error(result.error||'Falha ao salvar.');
          if(version!==token)return;el('ruleDialog').close();await reload();el('ruleMessage').textContent='Conjunto salvo no Portal. Nenhuma tarifa enviada aos canais.';
        }catch(error){msg.textContent=error.message;}finally{save.disabled=false;}
      };
      el('ruleDialog').showModal();
    }
    render();
  }
  return {show};
})();
