// Keep source columns addressable while live quotes refresh the table.
function analysisCells(row){return Array.from(row.cells).filter(c=>!c.hasAttribute("data-fluct"));}
async function setupFluctuation(hotel,policy,dates,version){
  const box=element("fluct"), all=element("allNights"), apply=element("applyNights"), daily=element("dailyFluct"), msg=element("fluctMsg");
  const plaza=hotel.code==="PLAZA", cols=plaza?[[2,"standard","Standard"],[8,"luxo","Luxo"],[10,"suite","Suíte Master"]]:[[2,"diaria","Diária"]];
  const grid=element("nights"), rows=[], active=()=>version===analysisVersion;
  const toggle=element("managerToggle"), managerCells=[];
  toggle.hidden=policy?.modelo==="proprio";
  function showManager(visible){
    for(const cell of managerCells) cell.hidden=!visible;
    toggle.setAttribute("aria-expanded",String(visible));
    toggle.textContent=visible?"Recolher Tarifa Gestor":"Mostrar Tarifa Gestor";
  }
  toggle.onclick=()=>showManager(toggle.getAttribute("aria-expanded")!=="true");
  let ready=false,busy=false,automatic=false;
  function addCell(row,before,label){
    const cell=document.createElement(row.parentNode===grid.tHead?"th":"td");
    cell.dataset.fluct="";cell.textContent=label;row.insertBefore(cell,before);return cell;
  }
  const head=grid.tHead.rows[0], orig=analysisCells(head);
  addCell(head,orig[0],"Flutuar");
  for(const [i,,name] of cols) managerCells.push(addCell(head,orig[i+1],name+"\nTarifa Gestor"));
  dates.forEach((night,index)=>{
    const row=grid.tBodies[0].rows[index], cells=analysisCells(row);
    const mark=document.createElement("input");mark.type="checkbox";mark.setAttribute("aria-label","Flutuar tarifa em "+date(night));
    const markCell=addCell(row,cells[0],"");markCell.append(mark);
    const status=document.createElement("small");markCell.append(status);
    const fields=cols.map(([i,key,name])=>{
      const input=document.createElement("input");input.type="number";input.min="0.01";input.max="999999.99";input.step="0.01";input.placeholder="Opcional";input.setAttribute("aria-label","Tarifa Gestor "+name+" em "+date(night));
      const cell=addCell(row,cells[i+1],"");
      cell.append(input);managerCells.push(cell);return {key,input,suggested:cells[i]};
    });
    rows.push({night,mark,status,fields});mark.onchange=sync;
  });
  showManager(toggle.hidden);
  function sync(){
    const count=rows.filter(r=>r.mark.checked).length;
    all.checked=count>0 && count===rows.length;all.indeterminate=count>0 && count<rows.length;
    all.disabled=!ready || busy || !rows.length;apply.disabled=!ready || busy || !count;daily.disabled=!ready || busy;
    daily.textContent=automatic?"Desligar flutuação diária automática":"Ligar flutuação diária automática";
    daily.setAttribute("aria-pressed",String(automatic));
    for(const r of rows){r.mark.disabled=!ready || busy;for(const f of r.fields) f.input.disabled=!ready || busy;}
  }
  async function post(tipo,body={}){
    const res=await fetch("/api/portal/rms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tipo,hotel_id:hotel.id,...body})});
    const result=await res.json();if(!res.ok) throw Error(result.error || "Falha na gravação.");return result;
  }
  function pending(r,tarifas){
    r.status.textContent=" Pendente";r.status.title="Tarifas aguardando integração: "+Object.entries(tarifas).map(([k,v])=>k+": "+money(v)).join(" · ");
  }
  all.onchange=()=>{for(const r of rows) r.mark.checked=all.checked;sync();};
  daily.onclick=async()=>{
    busy=true;sync();
    try{const result=await post("flutuacao_automatica",{automatica:!automatic});if(!active())return;
      automatic=result.automatica;msg.textContent=automatic?"Automática ligada para quando a integração estiver disponível.":"Flutuação automática desligada.";
    } catch(e){if(active())msg.textContent=e.message;}finally{if(active()){busy=false;sync();}}
  };
  apply.onclick=async()=>{
    const selected=rows.filter(r=>r.mark.checked), noites=[];
    for(const r of selected){
      const tarifas={},gestor={};
      for(const {key,input,suggested} of r.fields){
        if(!input.validity.valid){showManager(true);input.reportValidity();return;}
        const v=input.value!==""?input.valueAsNumber:value((suggested.dataset.suggested ?? suggested.textContent).replace(/[^0-9.,]/g,""));
        if(v>0){tarifas[key]=v;if(input.value!=="")gestor[key]=v;}
      }
      if(!Object.keys(tarifas).length){showManager(true);msg.textContent="Informe uma Tarifa Gestor ou desmarque a noite de "+date(r.night)+"; ela não tem tarifa sugerida.";r.fields[0].input.focus();return;}
      noites.push({noite:r.night,tarifas,gestor});
    }
    busy=true;sync();
    try{await post("flutuacao_aplicar",{modelo:policy?.modelo || "beeprice",noites});if(!active())return;
      selected.forEach((r,i)=>{r.mark.checked=false;pending(r,noites[i].tarifas);});
      msg.textContent=noites.length+" noite(s) aguardando integração. Nenhuma tarifa enviada.";
    } catch(e){if(active())msg.textContent=e.message;}finally{if(active()){busy=false;sync();}}
  };
  box.hidden=false;sync();msg.textContent="Carregando flutuação…";
  try{const state=await post("flutuacao_consultar");if(!active())return;
    const saved=new Map(state.noites.map(n=>[n.noite,n]));
    for(const r of rows){const n=saved.get(r.night);if(n){pending(r,n.tarifas);for(const f of r.fields)f.input.value=n.gestor[f.key] ?? "";}}
    automatic=state.automatica;ready=true;sync();msg.textContent=automatic?"Automática ligada; aguardando integração.":"";
  }catch(e){if(active())msg.textContent="Não foi possível carregar a flutuação. Recarregue o painel.";}
}
