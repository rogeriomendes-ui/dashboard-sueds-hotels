const element = id => document.getElementById(id);
const floorMode = new URLSearchParams(location.search).get("aba") === "pisos";
element(floorMode ? "settingsTab" : "panelTab").setAttribute("aria-current","page");
const money = n => n == null ? "—" : n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const value = s => s ? Number(s.replaceAll(".","").replace(",",".")) : null;
const date = s => s.split("-").reverse().join("/");
function auditStamp(at,name) {
  if (!at) return "Sem registro";
  const time=new Date(at).toLocaleString("pt-BR",{timeZone:"America/Bahia",dateStyle:"short",timeStyle:"short"});
  return time+" · "+(name || "Usuário sem nome cadastrado");
}
const thresholds = [50,60,70,80,90];
const policyForm = element("policyForm");
for (const threshold of thresholds) {
  const label=document.createElement("label"), input=document.createElement("input");
  label.textContent="Acima de "+threshold+"% · aumento (%)";
  input.name="pct"+threshold;
  input.type="number";
  input.min="0";
  input.step=".01";
  label.append(input);
  policyForm.insertBefore(label,policyForm.querySelector("button"));
}

function conversionRate(quotes, converted) {
  if (String(quotes) === '0') return 'Sem orçamentos';
  const total = Number(quotes);
  if (!Number.isInteger(converted) || converted < 0 || converted > total || !Number.isInteger(total) || total <= 0) return 'Sem apuração';
  const percent = (converted / total).toLocaleString('pt-BR', {style: 'percent', maximumFractionDigits: 1});
  return percent + ' (' + converted + '/' + total + ')';
}

function table(id, labels, rows) {
  const node = element(id);
  node.replaceChildren();
  const head = node.createTHead().insertRow();
  for (const label of labels) head.appendChild(document.createElement("th")).textContent = label;
  const body = node.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const cell of row) tr.insertCell().textContent = cell;
  }
}

function nightFloor(night,policy,floors) {
  const periodFloors=floors.filter(f=>f.inicio<=night && night<=f.fim).map(f=>Number(f.valor));
  return periodFloors.length ? Math.max(...periodFloors) : Number(policy?.piso ?? 0);
}

function periodAdjustment(period, occupancy) {
  if (!period || occupancy == null || !Number.isFinite(Number(occupancy))) return null;
  const band=[80,70,60,50].find(t=>occupancy>t) ?? 0;
  return Number(period["pct"+band]);
}

function plazaNight(row, rates, demand, policy, floors, periods, catalog) {
  const night=row[0], brisa=value(row[2]), standard=rates?.standard;
  const [quotes,sales]=demand[night] || [];
  const floor=nightFloor(night,policy,floors);
  const ready=standard>0 && row[6]!=="Revisar" && row[4]!=="";
  const period=periods.find(p=>p.inicio<=night && night<=p.fim);
  const occupancy=value(row[7]);
  const hold=occupancy>=100;
  const pct=periodAdjustment(period,occupancy);
  const adjust=(current,percent)=>Math.round(Math.round(current*100)*(100+percent)/100)/100;
  const target=plazaLevelComparison(catalog,period,night,occupancy);
  const suggested=target.simulated.standard, bandReady=suggested>0;
  const formatPct=n=>n.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%";
  const rmsPercent=Number(row[4]);
  const rmsStandard=ready ? Math.max(floor,adjust(standard,rmsPercent)) : null;
  const rmsEffective=ready && rmsStandard>adjust(standard,rmsPercent) ? 100*(rmsStandard/standard-1) : rmsPercent;
  const amounts=[];
  const own=policy?.modelo==="proprio";
  const prior=ready && row[19]!=null ? Math.max(floor,adjust(standard,row[19])) : null;
  const change=prior!==null && prior!==rmsStandard ? money(prior)+" → "+money(rmsStandard) : "—";
  let comparable=false, diverges=false;
  for (const key of ["standard","luxo","suite"]) {
    const current=rates?.[key];
    const limited=rates?.restricted?.includes(key);
    amounts.push(current ? money(current)+(limited?" (estadia mínima)":"") : rates?.at ? "Sem oferta" : "Sem cotação");
    const bandRate=hold ? current : target.simulated[key];
    const rmsRate=hold ? current : current && ready ? (key==="standard" ? rmsStandard : Math.max(floor,adjust(current,rmsEffective))) : null;
    const delta=bandRate>0 && rmsRate>0 ? Math.round((rmsRate-bandRate)*100)/100 : null;
    if (delta!==null) { comparable=true; if(delta!==0) diverges=true; }
    amounts.push(money((own ? rmsRate : bandRate) ?? null),money(bandRate ?? null),money(rmsRate ?? null),delta>0 ? "+"+money(delta) : money(delta));
  }
  let reason=!period ? "Sem período BeePrice cadastrado para esta noite." : pct==null ? "Ocupação indisponível." :
    target.level ? period.nome+" · "+target.level.code+" · "+formatPct(pct)+" sobre a base Web com café." : "Sem nível tarifário vinculado.";
  if (hold) reason=occupancy>100 ? "Overbooking. Manter a tarifa vigente." : "Inventário esgotado. Manter a tarifa vigente.";
  const action=hold ? "Manter" : bandReady ? !standard ? "Aplicar nível" : suggested>standard ? "Subir" : suggested<standard ? "Reduzir" : "Manter" : "Revisar";
  const comparison=!comparable ? "Sem comparação" : diverges ? "Diverge" : "Coincide";
  const ownReason=hold ? reason : !(standard>0) ? "Sem tarifa Standard vigente para simular." : row[17]+(ready && rmsStandard>adjust(standard,rmsPercent) ? " Mínimo aplicado ao Standard: "+money(floor)+". Ajuste final de "+formatPct(rmsEffective)+"." : "");
  return [date(night),...[0,5,10].flatMap(i=>[amounts[i],amounts[i+1],amounts[i+(own?2:3)],amounts[i+4]]),
    own ? ownReason : reason,comparison,change,money(brisa),standard && brisa ? formatPct(100*(standard/brisa-1)) : "—",row[7]+"%",row[8],
    quotes ?? "—",conversionRate(quotes,sales),action,hold ? "0%" : bandReady ? formatPct(pct) : "—",date(row[10]),row[12],row[13],row[14],own ? reason : ownReason,
    rates?.at ? new Date(rates.at).toLocaleString("pt-BR",{timeZone:"America/Bahia"}) : "—"];
}

function renderCatalog(catalog,hotelId) {
  const form=element("gridEditor");
  form.replaceChildren();
  function picker(label,items) {
    const field=document.createElement("label"), select=document.createElement("select");
    field.textContent=label;
    items.forEach((name,i)=>select.add(new Option(name,String(i))));
    field.append(select); form.append(field);
    return select;
  }
  const baseSelect=picker("Nível base",catalog.bases.map(b=>b.code+" · "+b.name));
  const plan=picker("Tarifário",catalog.plans);
  const level=picker("Ver nível",[]);
  const rooms=["standard","luxo","suite"], labels=["Standard","Luxo","Suíte Master"];
  const room=picker("Categoria",labels), pax=picker("Hóspedes",[1,2,3,4]);
  pax.value="1";
  const days=["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];
  const day=picker("Dia da semana",days);
  const field=document.createElement("label"), price=document.createElement("input"), save=document.createElement("button");
  field.textContent="Novo valor base (R$)";
  Object.assign(price,{type:"number",min:".01",max:"99999999.99",step:".01",required:true});
  field.append(price); form.append(field,save); save.textContent="Salvar valor na simulação";
  function refreshLevels(){
    level.replaceChildren(...catalog.bases[baseSelect.value].levels.map((l,i)=>new Option(l.code+" · "+l.name,i)));
    refresh();
  }
  function refresh(){
    const base=catalog.bases[baseSelect.value], grid=base.grids[plan.value];
    const l=base.levels[level.value], persons=Number(pax.value)+1;
    const baseValue=(k,d)=>catalog.edits?.[JSON.stringify([base.name,Number(plan.value),k,persons,d])] ?? grid?.[k]?.[persons-1];
    price.value=baseValue(rooms[room.value],Number(day.value)) ?? "";
    field.hidden=save.hidden=!baseValue(rooms[room.value],Number(day.value)) || l.pct!==0;
    price.disabled=save.hidden;
    element("gridNote").textContent=!grid ? "Tarifário identificado no BeePrice sem preços preenchidos nesta captura." :
      "Grade em reais para "+persons+" hóspede(s). "+(l.pct ? "Acréscimo de "+l.pct+"% sobre a base de cada célula." : "Uma edição da base recalcula os níveis derivados na simulação.");
    table("baseGrid",["Categoria",...days],grid?rooms.map((k,i)=>[labels[i],...days.map((_,d)=>{
      const v=baseValue(k,d);
      return money(v>0 ? Math.round(v*(100+l.pct))/100 : null);
    })]):[]);
  }
  baseSelect.onchange=refreshLevels;
  for(const s of [plan,level,pax,room,day]) s.onchange=refresh;
  form.onsubmit=async event=>{
    event.preventDefault();
    if(price.disabled || save.hidden) return;
    const base=catalog.bases[baseSelect.value].name, plano=Number(plan.value), quarto=rooms[room.value], persons=Number(pax.value)+1,dia=Number(day.value),valor=price.valueAsNumber;
    save.disabled=true;
    try{
      const res=await fetch("/api/portal/rms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tipo:"grade_plaza",hotel_id:hotelId,base,plano,quarto,pax:persons,dia,valor})});
      const result=await res.json();
      if(!res.ok) throw Error(result.error || "Falha ao salvar a grade.");
      Object.assign(catalog.edits,result.catalog.edits);
      refresh(); element("status").textContent="Valor base salvo na simulação.";
    } catch(error){element("status").textContent=error.message;}
    finally{save.disabled=false;}
  };
  refreshLevels();
}

function filterPlazaRow(row) {
  row.hidden=element("compareModels").checked && ((element("onlyDifferent").checked && row.cells[14].textContent!=="Diverge") ||
    (element("onlyChanged").checked && row.cells[15].textContent==="—"));
}
let analysisVersion=0;
async function showPlaza(data,plaza) {
  const version=++analysisVersion;
  const policy=data.policies.find(p=>p.hotel_id===plaza?.id);
  const floors=data.floors.filter(f=>f.hotel_id===plaza?.id);
  const nights=data.analysis.rows.filter(r=>r[0]>=data.today);
  const periods=data.periods.filter(p=>p.hotel_id===plaza.id);
  const checked=data.analysis.rows.filter(r=>data.catalog?.calendar[r[0]]);
  element("levelNote").textContent=data.catalog ? "Calendário consultado em "+date(data.catalog.snapshot)+". Valores da grade Web com café para 2 adultos. Em esgotamento ou overbooking, a simulação mantém a vigente.":"Calendário ainda não importado.";
  table("levelNights",["Noite","Ocupação Portal","Ocupação BeePrice","Nível Portal","Nível BeePrice","Resultado",...["Standard","Luxo","Suíte Master"].flatMap(c=>[c+" · Portal",c+" · BeePrice"])],checked.map(r=>{
    const p=periods.find(p=>p.inicio<=r[0] && r[0]<=p.fim), occ=value(r[7]);
    const t=plazaLevelComparison(data.catalog,p,r[0],occ);
    return [date(r[0]),r[7]+"%",t.observation.occ+"%",t.level?.code||"—",t.observation.code,t.status,...["standard","luxo","suite"].flatMap(k=>[occ>=100?"Manter vigente":money(t.simulated[k]),money(t.reference[k])])];
  }));
  const render=(r,rates)=>plazaNight(r,rates,data.analysis.conversaoDeskhotel,policy,floors,periods,data.catalog);
  const other=policy?.modelo==="proprio" ? "BeePrice" : "RMS Próprio";
  const categories=["Standard","Luxo","Suíte Master"];
  const priceColumns=categories.flatMap(category=>["Vigente","Sugerida",other,"RMS − faixa"].map(label=>category+"\n"+label));
  table("nights",["Noite",...priceColumns,"Motivo do modelo ativo","Comparação","Mudança RMS · Standard","Tarifa de referência","Plaza × referência","Ocupação","Saldo ADVP","Orçamentos","Taxa de conversão","Sugestão da faixa","Ajuste da faixa","Data comparável","Antecedência","Aptos atuais","Aptos históricos","Motivo · "+other,"Consulta Omnibees"],
    nights.map(r=>render(r,data.rates[r[0]])));
  for(const row of element("nights").rows){
    row.cells[13].classList.add("reason");
    for(const start of [1,5,9]) {
      row.cells[start].classList.add("category-start");
      row.cells[start+1].classList.add("suggested");
    }
    for(const col of [3,4,7,8,11,12,14,15,22,23,28]) row.cells[col].classList.add("compare-only");
    row.cells[28].classList.add("reason");
  }
  const applyFilter=()=>{for(const row of element("nights").tBodies[0].rows) filterPlazaRow(row);};
  element("onlyDifferent").onchange=applyFilter;
  element("onlyChanged").onchange=applyFilter;
  applyFilter();
  element("analysis").hidden=false;
  const pending=nights.filter(r=>!(Date.now()-Date.parse(data.rates[r[0]]?.at)<30*60*1000)).map(r=>r[0]);
  let failed=0;
  if (pending.length) element("ratesStatus").textContent="Consultando tarifas para dois adultos na Omnibees…";
  const rows=new Map(nights.map((r,i)=>[r[0],element("nights").tBodies[0].rows[i]]));
  while(pending.length && version===analysisVersion) {
    const batch=pending.splice(0,4);
    try {
      const res=await fetch("/api/portal/rms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tipo:"tarifas_plaza",noites:batch})});
      if(!res.ok) throw Error();
      const fresh=await res.json();
      if(version!==analysisVersion) return;
      for(const r of fresh.rows) {
        const rates=fresh.rates[r[0]];
        if(rates.error){failed++;continue;}
        data.rates[r[0]]=rates;
        const cells=rows.get(r[0]).cells;
        render(r,rates).forEach((v,i)=>cells[i].textContent=v);
        filterPlazaRow(rows.get(r[0]));
      }
    } catch {failed+=batch.length;}
  }
  if(version===analysisVersion) element("ratesStatus").textContent=failed ? "Falha ao atualizar "+failed+" noite(s). Confira a data da última consulta em cada linha." : "";
}

async function showHotel(data,hotel) {
  const version=++analysisVersion;
  element("nights").replaceChildren();
  element("ratesStatus").textContent="";
  element("hotelNote").textContent="";
  element("analysis").hidden=!hotel;
  if (!hotel) return;
  const isPlaza=hotel.code==="PLAZA";
  const policy=data.policies.find(p=>p.hotel_id===hotel.id);
  const ownModel=policy?.modelo==="proprio";
  element("selectedModel").textContent="Modelo ativo: "+(ownModel?"RMS Próprio":"BeePrice");
  element("compareLabel").textContent="Comparar com "+(ownModel?"BeePrice":"RMS Próprio");
  const compare=element("compareModels");
  compare.checked=element("onlyDifferent").checked=element("onlyChanged").checked=false;
  element("analysis").classList.remove("comparing");
  compare.onchange=()=>{
    element("analysis").classList.toggle("comparing",compare.checked);
    if(isPlaza && element("nights").tBodies[0]) {
      for(const row of element("nights").tBodies[0].rows) filterPlazaRow(row);
    }
  };
  element("panelHotel").textContent=hotel.name;
  element("plazaNotes").hidden=!isPlaza;
  const competitors=data.competitors.filter(c=>c.hotel_id===hotel.id);
  let currentVersion=version;
  let dates;
  try {
    if (isPlaza) {
      dates=data.analysis.rows.map(r=>r[0]).filter(d=>d>=data.today);
      currentVersion=version+1;
      await showPlaza(data,hotel);
    } else {
      const names={CABRALIA:"SUEDS CABRALIA",SEGUNDO_SOL:"SUEDS SEGUNDO SOL",PREMIUM:"SUEDS PREMIUM",TRANCOSO:"SUEDS TRANCOSO",CASAS:"CASAS SUEDS ARRAIAL"};
      const params=new URLSearchParams({hotel:names[hotel.code] || hotel.name,start:data.today,end:data.analysis.rows.at(-1)[0]});
      const response=await fetch("/api/dashboard/mapa-ocupacao?"+params);
      if (!response.ok) throw Error("Não foi possível consultar o mapa de ocupação deste hotel.");
      const map=await response.json();
      if (version!==analysisVersion) return;
      const days=map.occupancy.find(h=>h.hotel===map.selected.hotel)?.days || [];
      const periods=data.periods.filter(p=>p.hotel_id===hotel.id);
      dates=days.map(d=>d.date);
      const other=ownModel?"BeePrice":"RMS Próprio";
      table("nights",["Noite","Tarifa vigente (R$)","Tarifa sugerida","Motivo do modelo ativo","Tarifa · "+other,"Motivo · "+other,"Ocupação","Aptos ocupados"],days.map(d=>[
        date(d.date),"—","—","","—","",d.rate==null?"—":d.rate.toLocaleString("pt-BR",{maximumFractionDigits:1})+"%",d.occupied ?? "—"
      ]));
      for(const row of element("nights").rows) {
        row.cells[4].classList.add("compare-only");
        row.cells[5].classList.add("compare-only","reason");
        row.cells[3].classList.add("reason");
        row.cells[2].classList.add("suggested");
      }
      days.forEach((d,i)=>{
        const cells=element("nights").tBodies[0].rows[i].cells;
        const period=periods.find(p=>p.inicio<=d.date && d.date<=p.fim);
        const pct=periodAdjustment(period,d.rate), hold=d.rate>=100;
        const input=document.createElement("input");
        input.type="number";input.min=".01";input.step=".01";input.setAttribute("aria-label","Tarifa vigente em "+date(d.date));
        if(pct!=null || hold) cells[1].replaceChildren(input);
        function update(){
          const rate=input.valueAsNumber>0 && input.validity.valid ? input.valueAsNumber : null;
          const raw=rate!=null && pct!=null ? Math.round(Math.round(rate*100)*(100+pct)/100)/100 : null;
          const band=hold ? rate : raw;
          const holdReason=d.rate>100?"Overbooking. Manter a diária vigente.":"Noite esgotada. Manter a diária vigente.";
          const bandReason=hold ? holdReason : d.rate==null?"Ocupação indisponível.":pct==null?"Sem período BeePrice cadastrado para esta noite.":period.nome+" · ajuste de "+pct+"%.";
          const ownReason=hold ? holdReason : "Aguardando dados de demanda, conversão, curva e tarifas do hotel.";
          cells[ownModel?4:2].textContent=money(band);
          cells[ownModel?5:3].textContent=bandReason+(!rate && (pct!=null || hold)?" Informe a diária vigente.":"");
          cells[ownModel?2:4].textContent=money(hold ? rate : null);
          cells[ownModel?3:5].textContent=ownReason+(hold && !rate?" Informe a diária vigente.":"");
        }
        input.oninput=update;update();
      });
      element("hotelNote").textContent=days.some(d=>d.rate!=null)?"Ocupação do mapa KPI. Nas noites com faixa aplicável, informe a diária vigente para calcular a sugestão. Curva histórica, conversão e tarifas próprias automáticas ainda sem integração para esta unidade.":"Sem ocupação apurada para este hotel no período.";
      if (ownModel) element("hotelNote").textContent="Modelo RMS Próprio selecionado. A simulação desta unidade aguarda os dados de procura, conversão, curva histórica e tarifas.";
    }
    if (currentVersion!==analysisVersion) return;
    const grid=element("nights"), rows=grid.tBodies[0].rows;
    for (const c of competitors) {
      const index=grid.tHead.rows[0].cells.length;
      grid.tHead.rows[0].appendChild(document.createElement("th")).textContent=c.nome+" · "+c.categoria;
      for(const row of rows) row.insertCell().textContent="Consultando…";
      for(let i=0;i<dates.length;i+=4) {
        if(currentVersion!==analysisVersion) return;
        const batch=dates.slice(i,i+4);
        let prices={};
        try {
          const standard=isPlaza ? Object.fromEntries(batch.map(d=>[d,data.rates[d]?.standard])) : undefined;
          const res=await fetch("/api/portal/rms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tipo:"concorrentes_painel",hotel_id:hotel.id,nome:c.nome,noites:batch,standard})});
          if(res.ok) {
            const fresh=await res.json();
            if(currentVersion!==analysisVersion) return;
            prices=fresh.quotes;
            for (const r of fresh.rows) {
              const cells=rows[i+batch.indexOf(r[0])].cells;
              plazaNight(r,data.rates[r[0]],data.analysis.conversaoDeskhotel,data.policies.find(p=>p.hotel_id===hotel.id),data.floors.filter(f=>f.hotel_id===hotel.id),data.periods.filter(p=>p.hotel_id===hotel.id),data.catalog)
                .forEach((v,k)=>cells[k].textContent=v);
              filterPlazaRow(cells[0].parentElement);
            }
          }
        } catch {}
        if(currentVersion!==analysisVersion) return;
        batch.forEach((d,j)=>rows[i+j].cells[index].textContent=typeof prices[d]==="number"?money(prices[d]):prices[d]===null?"Sem oferta":"Sem cotação");
      }
    }
  } catch(error) { if(currentVersion===analysisVersion) element("ratesStatus").textContent=error.message; }
}

function setupNewPeriod(hotel,catalog){
  const form=element("newPeriodForm"), start=element("startPeriod"), message=element("newPeriodMsg");
  const baseSelect=form.elements.base_origem, prices=element("newBasePrices");
  const plaza=hotel?.code==="PLAZA";
  form.reset();
  form.hidden=true; start.setAttribute("aria-expanded","false");
  start.disabled=plaza && !catalog;
  start.title=start.disabled?"O catálogo do Plaza precisa estar disponível para criar um tarifário.":"";
  element("newBaseLabel").hidden=!plaza;
  baseSelect.replaceChildren(new Option("Criar nova base",""),...(catalog?.bases||[]).map(b=>new Option(b.code+" · "+b.name,b.name)));
  function refreshBands(){
    const base=catalog?.bases.find(b=>b.name===baseSelect.value);
    prices.disabled=prices.hidden=!plaza || Boolean(base);
    const fields=element("newBands");
    fields.querySelectorAll("label").forEach(l=>l.remove());
    const bands=[0,50,60,70,80];
    bands.forEach((lower,i)=>{
      const label=document.createElement("label"), input=document.createElement(base?"select":"input");
      label.textContent=(lower?"Acima de "+lower+"% até ":"Até ")+(bands[i+1]||100)+"% · "+(base?"nível":"aumento (%)");
      input.name="pct"+lower; input.required=true;
      if(base){
        base.levels.forEach(l=>input.add(new Option(l.code+" · "+l.pct+"%",l.pct)));
      }else Object.assign(input,{type:"number",min:"0",max:"99999",step:".01"});
      input.value=String(base?.levels[i]?.pct ?? (base?base.levels[0].pct:0));
      label.append(input); fields.append(label);
    });
  }
  baseSelect.onchange=refreshBands;
  form.elements.inicio.oninput=()=>{form.elements.fim.min=form.elements.inicio.value;};
  start.onclick=()=>{form.hidden=false; start.setAttribute("aria-expanded","true"); form.elements.nome.focus();};
  element("cancelPeriod").onclick=()=>{form.reset();form.elements.fim.min="";refreshBands();message.textContent="";form.hidden=true;start.setAttribute("aria-expanded","false");start.focus();};
  form.elements.fim.min=""; message.textContent="";refreshBands();
  form.onsubmit=async event=>{
    event.preventDefault();
    const button=event.submitter||form.querySelector('[type="submit"]');
    const body=Object.fromEntries(new FormData(form));
    for(const b of [0,50,60,70,80]) body["pct"+b]=Number(body["pct"+b]);
    if(plaza && !body.base_origem) body.precos_duplo=["standard","luxo","suite"].map(k=>Number(body[k]));
    button.disabled=true; message.textContent="Salvando…";
    let created=false;
    try{
      const res=await fetch("/api/portal/rms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,hotel_id:hotel.id,tipo:"novo_periodo"})});
      const result=await res.json();
      if(!res.ok) throw Error(result.error||"Falha ao criar o tarifário.");
      created=true;
      if(element("settingsHotel").value!==hotel.id) return;
      await load(undefined,result.inicio);
      element("status").textContent="Tarifário criado. As faixas do novo período estão selecionadas.";
      element("periodChoice").focus();
    }catch(err){message.textContent=created?"Tarifário criado. Recarregue a tela para consultá-lo.":err.message;}
    finally{button.disabled=false;}
  };
}

async function load(options,createdPeriod) {
  const previousHotel=element("settingsHotel").value;
  const previousPeriod=element("periodChoice").value;
  const previousView=document.querySelector("input[name=viewModel]:checked")?.value;
  const response = await fetch("/api/portal/rms",{cache:"no-store",...options});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Falha ao carregar o RMS.");
  const {hotels,floors,analysis} = data;
    const select=element("settingsHotel");
    const selected=select.value || sessionStorage.getItem("rmsHotel") || hotels.find(h=>h.code==="PLAZA")?.id;
    select.replaceChildren(...hotels.map(h=>new Option(h.name,h.id)));
    if (hotels.some(h=>h.id===selected)) select.value=selected;
    element("hotelPicker").hidden=false;
  if (floorMode) {

    function renderHotel(restoreView) {
      const hotelId=select.value;
      const periods=data.periods.filter(p=>p.hotel_id===hotelId).sort((a,b)=>a.inicio.localeCompare(b.inicio));
      element("periodCount").textContent=periods.length ? periods.length+" períodos cadastrados para este hotel." : "Nenhum período BeePrice cadastrado para este hotel.";
      const catalog=hotels.find(h=>h.id===hotelId)?.code==="PLAZA" ? data.catalog : null;
      setupNewPeriod(hotels.find(h=>h.id===hotelId),catalog);
      element("catalogBox").hidden=!catalog;
      if(catalog) renderCatalog(catalog,hotelId);
      const forms=element("festiveForms");
      forms.replaceChildren();
      const choice=element("periodChoice");
      choice.replaceChildren();
      element("periodPicker").hidden=!periods.length;
      const groups=new Map();
      for(const p of periods){
        const groupName=p.fim<data.today?"Encerrados":p.inicio>data.today?"Próximos":"Em vigor";
        if(!groups.has(groupName)){
          const group=document.createElement("optgroup");
          group.label=groupName;
          groups.set(groupName,group);
        }
        groups.get(groupName).append(new Option(date(p.inicio)+" a "+date(p.fim)+" · "+p.nome,p.inicio));
      }
      for(const name of ["Em vigor","Próximos","Encerrados"]) if(groups.has(name)) choice.append(groups.get(name));
      if(options && hotelId===previousHotel && periods.some(p=>p.inicio===previousPeriod)) choice.value=previousPeriod;
      if(createdPeriod && hotelId===previousHotel && periods.some(p=>p.inicio===createdPeriod)) choice.value=createdPeriod;
      const editors=new Map();
      for (const p of periods) {
        const card=document.createElement("article"), header=document.createElement("header"), dates=document.createElement("small");
        card.className="period-editor";
        card.hidden=p.inicio!==choice.value;
        const title=document.createElement("h3"), form=document.createElement("form"), stamp=document.createElement("p");
        title.textContent=p.nome;
        dates.textContent=date(p.inicio)+" a "+date(p.fim);
        header.append(title,dates);
        const bands=[0,50,60,70,80];
        for (const [i,b] of bands.entries()) {
          const base=catalog?.bases[catalog.periods[p.inicio]];
          const label=document.createElement("label"), input=document.createElement(base?"select":"input");
          label.textContent=(b?"Acima de "+b+"% até ":"Até ")+(bands[i+1] ?? 100)+(base?"% · nível":"% · ajuste (%)");
          if(base) {
            input.name="pct"+b; input.required=true;
            input.add(new Option("Selecione um nível",""));
            for(const l of base.levels){
              const option=new Option(l.code+" · "+(l.pct===0?"Base":"+"+l.pct+"%"),l.pct);
              option.title=l.name;
              input.add(option);
            }
            input.value=p["pct"+b];
          } else Object.assign(input,{name:"pct"+b,type:"number",required:true,min:"0",max:"99999",step:".01",value:p["pct"+b]});
          label.append(input); form.append(label);
        }
        const save=document.createElement("button");
        save.textContent="Salvar faixas";
        const footer=document.createElement("div");
        footer.className="period-footer";
        stamp.className="period-audit";
        footer.append(stamp,save); form.append(footer);
        stamp.textContent=p.gravado_em?"Última gravação: "+auditStamp(p.gravado_em,p.gravado_por):"Cadastro inicial conforme BeePrice.";
        form.onsubmit=async event=>{
          event.preventDefault(); save.disabled=true;
          const fields=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,Number(v)]));
          try {await load({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...fields,tipo:"faixa_festiva",hotel_id:hotelId,inicio:p.inicio})});}
          catch(error){element("status").textContent=error.message;}
          finally {save.disabled=false;}
        };
        card.append(header,form); forms.append(card); editors.set(p.inicio,card);
      }
      choice.onchange=()=>{for(const [start,card] of editors) card.hidden=start!==choice.value;};
      const policy=data.policies.find(p=>p.hotel_id===hotelId);
      const active=policy?.modelo || "beeprice";
      const radios=[...document.querySelectorAll("input[name=viewModel]")];
      const activate=element("activateModel");
      function view(model) {
        const own=model==="proprio";
        radios.forEach(r=>{r.checked=r.value===model;});
        element("models").hidden=false;
        element("activeModel").textContent="Modelo em uso na simulação deste hotel: "+(active==="proprio"?"RMS Próprio":"Modelo padrão BeePrice")+".";
        activate.hidden=model===active;
        element("competitors").hidden=element("ownCriteria").hidden=!own;
        element("festive").hidden=own;
        element("policy").hidden=element("minimum").hidden=!own;
        element("ownNote").textContent=hotels.find(h=>h.id===hotelId)?.code==="PLAZA"
          ? "O percentual varia por noite conforme ocupação, procura e conversão frente ao mês e saldo ADVP. Perto da chegada, esses sinais pesam mais. A tarifa concorrente tem peso secundário. O ajuste pode superar 40% quando os indicadores sustentam a alta. Nas reduções, vale o mínimo do período ou, na ausência dele, o mínimo geral. Noites esgotadas ou em overbooking mantêm a tarifa."
          : "A simulação desta unidade depende da integração de procura, conversão, curva histórica e tarifas.";
        for(const t of thresholds) policyForm.elements["pct"+t].parentElement.hidden=true;
      }
      radios.forEach(r=>r.onchange=()=>view(r.value));
      activate.onclick=async()=>{
        activate.disabled=true;
        try {await load({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tipo:"modelo",hotel_id:hotelId,modelo:radios.find(r=>r.checked).value})});}
        catch(error){element("status").textContent=error.message;}
        finally{activate.disabled=false;}
      };
      view(restoreView || active);
      for (const key of ["piso",...thresholds.map(t=>"pct"+t)]) policyForm.elements[key].value=policy?.[key] ?? "";
      element("policyAudit").textContent=policy ? "Última gravação: "+auditStamp(policy.gravado_em,policy.gravado_por) : "";
      table("floors",["Primeira noite","Última noite","Piso","Inclusão · data e usuário","Última gravação · data e usuário"],floors.filter(f=>f.hotel_id===hotelId).map(f=>[
        date(f.inicio),date(f.fim),money(Number(f.valor)),auditStamp(f.incluido_em,f.incluido_por),auditStamp(f.gravado_em,f.gravado_por)]));
      const competitors=data.competitors.filter(c=>c.hotel_id===hotelId);
      element("quoteResult").textContent="";
      const hotelName = c => hotels.find(h=>h.id===c.hotel_id)?.name || c.hotel_id;
      table("competitorList",["Hotel Sueds","Concorrente","Categoria","Motor de reservas","Critérios de comparação","Cadastro"],
        competitors.map(c=>[hotelName(c),c.nome,c.categoria || "—",c.motor_url || "—",c.criterios || "—"]));
      Array.from(element("competitorList").tBodies[0].rows).forEach((row,i)=>{
        const c=competitors[i], edit=document.createElement("button");
        edit.textContent="Editar";
        edit.onclick=()=>{
          const fields=element("competitorForm").elements;
          for (const name of ["nome","motor_url","categoria","criterios"]) fields[name].value=c[name] || "";
          fields.motor_url.focus();
        };
        row.insertCell().append(edit);
      });
      const quoteForm=element("quoteForm");
      quoteForm.elements.concorrente.replaceChildren(...competitors.map((c,i)=>new Option(hotelName(c)+" · "+c.nome+" · "+(c.categoria || "Sem categoria"),i)));
      quoteForm.querySelector("button").disabled=!competitors.length;
      const handler=async event=>{
        event.preventDefault();
        const c=competitors[quoteForm.elements.concorrente.value], noite=quoteForm.elements.noite.value;
        if (!c) return;
        const result=element("quoteResult"), button=quoteForm.querySelector("button");
        button.disabled=true;
        result.textContent="Consultando o motor…";
        try {
          const response=await fetch("/api/portal/rms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tipo:"cotacao",hotel_id:c.hotel_id,nome:c.nome,noite})});
          const data=await response.json();
          if (!response.ok) throw Error(data.error);
          if (select.value!==hotelId || quoteForm.onsubmit!==handler) return;
          result.textContent=[c.nome,c.categoria,date(noite),"2 adultos com café da manhã",data.preco===null?"Sem oferta confirmada":money(data.preco)].join(" · ");
        } catch(error) { if (quoteForm.onsubmit===handler) result.textContent=error.message; }
        finally { if (quoteForm.onsubmit===handler) button.disabled=false; }
      };
      quoteForm.onsubmit=handler;
    }
    select.onchange=()=>{
      sessionStorage.setItem("rmsHotel",select.value);
      for (const form of ["competitorForm","form","quoteForm"]) element(form).reset();
      element("status").textContent="";
      renderHotel();
    };
    renderHotel((options || createdPeriod) && previousHotel===select.value ? previousView : null);
    element("hotelPicker").hidden=false;

  } else {
    select.onchange=()=>{
      sessionStorage.setItem("rmsHotel",select.value);
      showHotel(data,hotels.find(h=>h.id===select.value));
    };
    await showHotel(data,hotels.find(h=>h.id===select.value));
  }
  element("status").textContent = options ? "Cadastro salvo." : "";
}
policyForm.onsubmit=async event=>{
  event.preventDefault();
  const fields=Object.fromEntries(new FormData(policyForm)), button=policyForm.querySelector("button");
  for (const key of ["piso",...thresholds.map(t=>"pct"+t)]) fields[key]=fields[key]==="" ? null : Number(fields[key]);
  button.disabled=true;
  try {
    await load({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...fields,hotel_id:element("settingsHotel").value,tipo:"politica"})});
    element("status").textContent="Regras do hotel salvas.";
  } catch(error){element("status").textContent=error.message;}
  finally {button.disabled=false;}
};
element("competitorForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const fields = Object.fromEntries(new FormData(form));
    await load({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...fields,hotel_id:element("settingsHotel").value,tipo:"concorrente"})});
    for (const name of ["nome","criterios","motor_url","categoria"]) form.elements[name].value="";
  } catch (error) { element("status").textContent = error.message; }
  finally { button.disabled = false; }
};
element("form").onsubmit = async event=>{
  event.preventDefault();
  const form = event.currentTarget, fields = Object.fromEntries(new FormData(form));
  const button = form.querySelector("button");
  button.disabled = true;
  try { await load({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...fields,hotel_id:element("settingsHotel").value,valor:Number(fields.valor)})}); }
  catch(error){element("status").textContent=error.message;}
  finally {button.disabled=false;}
};
window.suedsManagerAuthReady.then(()=>load()).catch(error=>{element("status").textContent=error.message;});
