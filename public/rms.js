const element = id => document.getElementById(id);
const floorMode = new URLSearchParams(location.search).get("aba") === "pisos";

function setupNightScroll() {
  const bars = document.querySelectorAll(".night-position");
  const viewport = element("nightScroll");
  const table = element("nights");
  const vertical = element("nightVertical");
  function sync() {
    vertical.value = viewport.scrollTop;
    for (const bar of bars) bar.value = viewport.scrollLeft;
  }
  function resize() {
    vertical.max = viewport.scrollHeight - viewport.clientHeight;
    vertical.hidden = Number(vertical.max) <= 0;
    const maximum = viewport.scrollWidth - viewport.clientWidth;
    for (const bar of bars) {
      bar.max = maximum;
      bar.hidden = maximum <= 0;
    }
    sync();
  }
  for (const bar of bars) {
    bar.addEventListener("input", () => {
      viewport.scrollLeft = bar.valueAsNumber;
      sync();
    });
  }
  vertical.addEventListener("input", () => { viewport.scrollTop = vertical.valueAsNumber; });
  viewport.addEventListener("scroll", sync);
  const observer = new ResizeObserver(resize);
  observer.observe(table);
  observer.observe(viewport);
  return resize;
}
const refreshNightScroll = floorMode ? null : setupNightScroll();

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
  return RmsRules.band(period,occupancy)?.pct ?? null;
}

function plazaNight(row, rates, demand, policy, floors, periods, catalog) {
  const night=row[0], brisa=value(row[2]), standard=rates?.site?.standard?.final;
  const [quotes,sales]=demand[night] || [];
  const floor=nightFloor(night,policy,floors);
  const ready=standard>0 && row[6]!=="Revisar" && row[4]!=="";
  const period=RmsRules.forNight(periods,night);
  const occupancy=value(row[7]);
  const hold=occupancy>=100 || !!period?.bloqueado;
  const pct=periodAdjustment(period,occupancy);
  const adjust=(current,percent)=>Math.round(Math.round(current*100)*(100+percent)/100)/100;
  const target=plazaLevelComparison(catalog,period,night,occupancy);
  const bee=beeWebDecision(target,rates?.web,hold);
  const formatPct=n=>n.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%";
  const rmsPercent=Number(row[4]);
  const rmsStandard=ready ? Math.max(floor,adjust(standard,rmsPercent)) : null;
  const rmsEffective=ready && rmsStandard>adjust(standard,rmsPercent) ? 100*(rmsStandard/standard-1) : rmsPercent;
  const priceCells=[];
  const webCells=[];
  let suggestedStandard=null;
  const own=policy?.modelo==="proprio";
  for (const key of ["standard","luxo","suite"]) {
    const quote=rates?.site?.[key];
    const current=quote?.final;
    priceCells.push(current ? money(current) : rates?.[key]>0 ? "SITE final não confirmado" : rates?.at ? "Sem oferta" : "Sem cotação");
    const bandWeb=bee.prices[key];
    const bandRate=bandWeb>0 && bandWeb===rates?.web?.[key] ? current : bandWeb>0 ? plazaPrices(bandWeb,quote?.discount)?.final : null;
    const rmsRate=hold ? current : current && ready ? (key==="standard" ? rmsStandard : Math.max(floor,adjust(current,rmsEffective))) : null;
    const activeRate=own ? rmsRate : bandRate;
    const currentWeb=rates?.web?.[key];
    const proposedWeb=hold ? currentWeb : own ? plazaWebTarget(currentWeb,quote,activeRate)?.web : bandWeb;
    webCells.push(money(currentWeb ?? null),money((!own || activeRate>0) ? proposedWeb ?? null : null));
    if(key==="standard") suggestedStandard=activeRate;
    priceCells.push(money(activeRate ?? null));
  }
  let reason=!period ? "Sem período BeePrice cadastrado para esta noite." : pct==null ? "Ocupação indisponível." :
    target.level ? period.nome+" · "+target.level.code+" · "+formatPct(pct)+" sobre a base Web com café." : "Sem nível tarifário vinculado.";
  if(bee.retained.length) reason+=" Na execução, manter WEB vigente em "+bee.retained.map(k=>({standard:"Standard",luxo:"Luxo",suite:"Suíte Master"})[k]).join(", ")+": a faixa indicaria redução.";
  if (hold) reason=period?.bloqueado ? "Flutuacao bloqueada neste conjunto. Manter vigente." : occupancy>100 ? "Overbooking. Manter a tarifa vigente." : "Inventário esgotado. Manter a tarifa vigente.";
  const ownReason=hold ? reason : !(standard>0) ? "Sem tarifa Standard vigente para simular." : row[17]+(ready && rmsStandard>adjust(standard,rmsPercent) ? " Mínimo aplicado ao Standard: "+money(floor)+". Ajuste final de "+formatPct(rmsEffective)+"." : "");
  const differenceFromBrisa=rate=>rate>0 && brisa>0 ? formatPct(100*(rate/brisa-1)) : "—";
  const site=rates?.site?.standard;
  const offer=site ? (/^black friday/i.test(site.offer) ? "Black "+site.discount+"%" : site.offer || "Sem oferta") : "Sem confirmação";
  priceCells.splice(2,0,offer,money(brisa),differenceFromBrisa(standard),differenceFromBrisa(suggestedStandard));
  return [date(night),...priceCells,own ? ownReason : reason,row[7]!=="" ? occupancy.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%" : "—",row[8] || "—",
    quotes ?? "—",conversionRate(quotes,sales),row[10] ? date(row[10]) : "—",row[12],row[13] || "—",row[14] || "—",
    rates?.at ? new Date(rates.at).toLocaleString("pt-BR",{timeZone:"America/Bahia"}) : "—",
    ...webCells,money(rates?.site?.standard?.regular ?? null)];
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
    table("legacyBaseGrid",["Categoria",...days],grid?rooms.map((k,i)=>[labels[i],...days.map((_,d)=>{
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

let analysisVersion=0;
async function showPlaza(data,plaza) {
  const version=++analysisVersion;
  element("simpleControls").hidden=true;
  element("nights").classList.remove("simple-grid");
  const policy=data.policies.find(p=>p.hotel_id===plaza?.id);
  const floors=data.floors.filter(f=>f.hotel_id===plaza?.id);
  const nights=data.analysis.rows.filter(r=>r[0]>=data.today);
  const periods=data.periods.filter(p=>p.hotel_id===plaza.id);
  const render=(r,rates)=>plazaNight(r,rates,data.analysis.conversaoDeskhotel,policy,floors,periods,data.catalog);
  const categories=["Standard","Luxo","Suíte Master"];
  const priceColumns=categories.flatMap(category=>["SITE final","SITE sugerido"].map(label=>category+"\n"+label));
  priceColumns.splice(2,0,"Oferta aplicada\nSITE Standard","Brisa da Praia\nStandard Plus","Plaza vigente × Brisa\nDiferença (%)","Plaza sugerido × Brisa\nDiferença (%)");
  table("nights",["Noite",...priceColumns,"Motivo do modelo ativo","Ocupação","ADVP × ano anterior\n(aptos)","Orçamentos","Taxa de conversão","Data comparável","Antecedência","Aptos atuais","Aptos históricos","Leitura do Calendário 360",...categories.flatMap(c=>[c+"\nWEB regular",c+"\nWEB simulado"]),"Standard\nSITE regular"],
    nights.map(r=>render(r,data.rates[r[0]])));
  for(const row of element("nights").rows){
    row.cells[11].classList.add("reason");
    for(const start of [1,7,9]) {
      row.cells[start].classList.add("category-start");
      row.cells[start+1].classList.add("suggested");
    }
  }
  const references=policy?.modelo==="proprio"?new Map():appliedBeeRates(data.beeHistory,data.catalog);
  const grid=element("nights");
  const headers=Array.from(grid.tHead.rows[0].cells,cell=>cell.textContent);
  function compareSite(row,night){
    if(policy?.modelo==="proprio") return;
    const cells=analysisCells(row), rates=data.rates[night];
    const reference=references.get(night);
    for(const [room,label] of [["standard","Standard"],["luxo","Luxo"],["suite","Suíte Master"]]){
      const site=cells[headers.indexOf(label+"\nSITE sugerido")];
      const web=cells[headers.indexOf(label+"\nWEB simulado")];
      const quote=rates?.site?.[room];
      const actual=plazaPrices(reference?.web[room],quote?.discount)?.final;
      const suggested=site.textContent;
      site.dataset.suggested=suggested;
      // A projeção pela faixa é independente do WEB já alterado. A fila mantém a regra de não reduzir.
      if(quote?.final>0 && suggested!=="—" && value(suggested.replace(/[^0-9.,]/g,""))<quote.final)
        site.dataset.suggested=money(quote.final);
      const divergent=actual>0 && suggested!=="—" && suggested!==money(actual);
      site.classList.toggle("bee-difference",divergent);
      web.classList.toggle("bee-difference",!!divergent);
      if(divergent){
        const detail=document.createElement("small");
        detail.textContent="BeePrice "+money(actual);
        site.append(detail);
        site.title=web.title=reference.level+" · "+reference.at;
      }else{site.removeAttribute("title");web.removeAttribute("title");}
    }
  }
  nights.forEach((r,i)=>compareSite(grid.tBodies[0].rows[i],r[0]));
  element("beeDifferenceNote").hidden=policy?.modelo==="proprio";
  setupFluctuation(plaza,policy,nights.map(r=>r[0]),version);
  element("analysis").hidden=false;
  refreshNightScroll();
  return compareSite;

}

async function showHotel(data,hotel) {
  const version=++analysisVersion;
  element("simpleControls").hidden=true;
  element("nights").classList.remove("simple-grid");
  element("fluct").hidden=true;
  element("beeDifferenceNote").hidden=true;
  element("nights").replaceChildren();
  element("ratesStatus").textContent="";
  element("hotelNote").textContent="";
  element("analysis").hidden=!hotel;
  if (!hotel) return;
  const isPlaza=hotel.code==="PLAZA";
  const policy=data.policies.find(p=>p.hotel_id===hotel.id);
  const ownModel=policy?.modelo==="proprio";
  if(!ownModel) {
    element("selectedModel").textContent="Modelo ativo: RMS Simples";
    return RmsSimple.show(data,hotel,()=>version===analysisVersion,refreshNightScroll);
  }
  element("selectedModel").textContent="Modelo ativo: "+(ownModel?"RMS Próprio":"BeePrice");
  const beeMenu=element("beeMenu");
  beeMenu.hidden=!isPlaza || ownModel;
  if(!beeMenu.hidden){
    element("histNight").value ||= data.today;
    let historyVersion=0;
    function updateHistoryFilter(){
      element("histDateLabel").textContent=element("histChanges").checked?"Dia da leitura (Bahia)":"Noite da hospedagem";
      element("histSearch").click();
    }
    element("histChanges").onchange=updateHistoryFilter;
    element("histNight").onchange=updateHistoryFilter;
    element("histSearch").onclick=async()=>{
      const changes=element("histChanges").checked;
      const night=element("histNight").value, version=++historyVersion, rows=[];
      element("histRows").replaceChildren();
      element("histStatus").textContent="Consultando�";
      try {
        for(let offset=0;;offset+=100){
          const response=await fetch("/api/portal/rms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tipo:"historico_plaza",noite:night,offset,mudancas:changes})});
          if(!response.ok) throw Error();
          const page=await response.json();
          if(version!==historyVersion) return;
          rows.push(...page.rows);
          if(page.rows.length<100) break;
        }
        if(changes){
          const stamp=v=>new Date(v).toLocaleString("pt-BR",{timeZone:"America/Bahia"});
          const band=r=>[r.faixa,r.nivel].filter(Boolean).join(" · ") || "—";
          table("histRows",["Noite","Leitura anterior (Bahia)","Nova leitura (Bahia)","Faixa anterior","Nova faixa",
            "WEB Standard anterior","WEB Standard nova","WEB Luxo anterior","WEB Luxo nova","WEB Suíte anterior","WEB Suíte nova"],
            rows.map(({noite,anterior,atual})=>[date(noite),stamp(anterior.captura),stamp(atual.captura),band(anterior),band(atual),
              ...["standard","luxo","suite"].flatMap(room=>[money(anterior[room]),money(atual[room])])]));
          element("histStatus").textContent=rows.length ? rows.length+" mudança(s) em "+date(night)+"." : "Nenhuma mudança registrada nesse dia. A primeira captura de cada noite serve de referência.";
          return;
        }
        table("histRows",["Captura (Bahia)","Ocupa��o","Per�odo","Faixa","N�vel","Decis�o","WEB Standard","WEB Luxo","WEB Su�te"],rows.map(r=>[new Date(r.captura).toLocaleString("pt-BR",{timeZone:"America/Bahia"}),Number(r.ocupacao).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%",r.periodo||"�",r.faixa||"�",r.nivel||"�",r.situacao,...[r.standard,r.luxo,r.suite].map(money)]));
        element("histStatus").textContent=rows.length+" leitura(s) para "+date(night)+".";
      } catch {if(version===historyVersion) element("histStatus").textContent="Falha ao consultar o hist�rico.";}
    };
    const bases=data.catalog?.bases || [];
    table("beeLevels",["Base","Código","Nível","Derivação"],bases.flatMap(base=>base.levels.map(l=>[base.name,l.code,l.name,l.pct+"%"])));
    table("beeRules",["Período","Primeira noite","Última noite","Dias","Faixas de ocupação","Situação"],data.periods.filter(p=>p.hotel_id===hotel.id).map(p=>{
      const base=p.base_origem?bases.find(b=>b.name===p.base_origem):bases[data.catalog?.periods[p.inicio]];
      return [p.nome,date(p.inicio),date(p.fim),(p.dias||[0,1,2,3,4,5,6]).map(d=>["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"][d]).join(", "),RmsRules.bands(p).map(f=>`${f.de}–${f.ate}%: ${base?.levels.find(l=>l.pct===Number(f.pct))?.code||"Base"} · +${f.pct}%`).join(" / "),p.bloqueado?"Bloqueada · manter vigente":"Ativa"];
    }));
    const auditFilter=element("audit89Filter");
    function showBeeHistory(){
      const note=element("audit89Note");
      note.hidden=!auditFilter.checked;
      if(!auditFilter.checked){
        table("beeHistory",["Data da flutuação","Novo nível","Noites atualizadas"],(data.beeHistory || []).map(r=>[r.at,r.level,r.nights.join(", ")]));
        return;
      }
      const rows=data.auditoria89 || [];
      const occupancy=(n,total)=>n+"/"+total+" ("+(n/total).toLocaleString("pt-BR",{style:"percent",minimumFractionDigits:2,maximumFractionDigits:2})+")";
      const band=pct=>pct===0?"Base":"+"+pct+"%";
      note.textContent=rows.length
        ? rows.length+" noites. Ocupações reconstruídas com o inventário Omnibees de 17/11/2026. A faixa BeePrice vem do aviso. A faixa RMS usa os 116 apartamentos físicos e as regras do período. A ocupação no horário do aviso pode ter sido diferente."
        : "A conferência de 17/11/2026 ainda não foi carregada.";
      table("beeHistory",["Noite","Aviso BeePrice","Ocupação com os 89 extras","Ocupação sem os 89 extras","Faixa aplicada pelo BeePrice","Faixa indicada pelo RMS"],
        rows.map(r=>[date(r.noite),r.aviso,occupancy(r.ocupados+89,205),occupancy(r.ocupados,116),band(r.aplicada),band(r.simulada)]));
    }
    auditFilter.onchange=showBeeHistory;
    showBeeHistory();
  }
  element("panelHotel").textContent=hotel.name;
  element("plazaNotes").hidden=!isPlaza;
  const competitors=data.competitors.filter(c=>c.hotel_id===hotel.id);
  let currentVersion=version;
  let occupancyDays;
  function mapRow(row) {
    if (!occupancyDays) return row;
    const day=occupancyDays.get(row[0]), updated=row.slice();
    updated[7]=day?.rate==null ? "" : String(day.rate).replace(".",",");
    updated[13]=day?.occupied==null ? "" : String(day.occupied);
    updated[8]=day?.occupied!=null && row[14]!=="" && row[14]!=null ? String(day.occupied-Number(row[14])) : "";
    return updated;
  }
  let dates,compareSite;
  try {
    if (isPlaza) {
      dates=data.analysis.rows.map(r=>r[0]).filter(d=>d>=data.today);
      if (!ownModel) {
        element("hotelNote").textContent="Consultando o Mapa de Ocupação do Plaza…";
        const response=await fetch("/api/portal/rms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tipo:"ocupacao_plaza"})});
        if (version!==analysisVersion) return;
        if (!response.ok) throw Error("Não foi possível ler o Mapa de Ocupação do Plaza.");
        const {days}=await response.json();
        if (version!==analysisVersion) return;
        occupancyDays=new Map(days.map(d=>[d.date,d]));
        const stamp=days.map(d=>d.capturedAt).filter(Boolean).sort().at(-1);
        element("hotelNote").textContent=stamp ? "Última captura do Plaza no Mapa de Ocupação: "+new Date(stamp).toLocaleString("pt-BR",{timeZone:"America/Bahia"})+" (Bahia)." : "Mapa do Plaza sem captura para o período.";
        const byDate=new Map(data.analysis.rows.map(r=>[r[0],r]));
        for (const day of days) if (day.rate!=null && !byDate.has(day.date)) {
          const row=Array(20).fill(""); row[0]=day.date;
          byDate.set(day.date,row);
        }
        const rows=[...byDate.values()].sort((a,b)=>a[0].localeCompare(b[0])).map(mapRow);
        data={...data,analysis:{...data.analysis,rows}};
        dates=rows.map(r=>r[0]).filter(d=>d>=data.today);
      }
      currentVersion=version+1;
      compareSite=await showPlaza(data,hotel);
    } else {
      const names={CABRALIA:"SUEDS CABRALIA",SEGUNDO_SOL:"SUEDS SEGUNDO SOL",PREMIUM:"SUEDS PREMIUM",TRANCOSO:"SUEDS TRANCOSO",CASAS:"CASAS SUEDS ARRAIAL"};
      const params=new URLSearchParams({hotel:names[hotel.code] || hotel.name,start:data.today,end:data.analysis.originalEnd || data.analysis.rows.at(-1)[0]});
      const response=await fetch("/api/dashboard/mapa-ocupacao?"+params);
      if (!response.ok) throw Error("Não foi possível consultar o mapa de ocupação deste hotel.");
      const map=await response.json();
      if (version!==analysisVersion) return;
      const days=map.occupancy.find(h=>h.hotel===map.selected.hotel)?.days || [];
      const periods=data.periods.filter(p=>p.hotel_id===hotel.id);
      dates=days.map(d=>d.date);
      table("nights",["Noite","Tarifa vigente (R$)","Tarifa sugerida","Motivo do modelo ativo","Ocupação","Aptos ocupados"],days.map(d=>[
        date(d.date),"—","—","",d.rate==null?"—":d.rate.toLocaleString("pt-BR",{maximumFractionDigits:1})+"%",d.occupied ?? "—"
      ]));
      for(const row of element("nights").rows) {
        row.cells[3].classList.add("reason");
        row.cells[2].classList.add("suggested");
      }
      days.forEach((d,i)=>{
        const cells=Array.from(element("nights").tBodies[0].rows[i].cells);
        const period=RmsRules.forNight(periods,d.date);
        const pct=periodAdjustment(period,d.rate), hold=d.rate>=100 || !!period?.bloqueado;
        const input=document.createElement("input");
        input.type="number";input.min=".01";input.step=".01";input.setAttribute("aria-label","Tarifa vigente em "+date(d.date));
        if(pct!=null || hold) cells[1].replaceChildren(input);
        function update(){
          const rate=input.valueAsNumber>0 && input.validity.valid ? input.valueAsNumber : null;
          const raw=rate!=null && pct!=null ? Math.round(Math.round(rate*100)*(100+pct)/100)/100 : null;
          const band=hold ? rate : raw;
          const holdReason=period?.bloqueado?"Flutuacao bloqueada neste conjunto. Manter vigente.":d.rate>100?"Overbooking. Manter a diária vigente.":"Noite esgotada. Manter a diária vigente.";
          const bandReason=hold ? holdReason : d.rate==null?"Ocupação indisponível.":pct==null?"Sem período BeePrice cadastrado para esta noite.":period.nome+" · ajuste de "+pct+"%.";
          const ownReason=hold ? holdReason : "Aguardando dados de demanda, conversão, curva e tarifas do hotel.";
          cells[2].textContent=money(ownModel && !hold ? null : band);
          cells[3].textContent=(ownModel ? ownReason : bandReason)+(!rate && (hold || (!ownModel && pct!=null)) ? " Informe a diária vigente." : "");
        }
        input.oninput=update;update();
      });
      setupFluctuation(hotel,policy,dates,version);
      element("hotelNote").textContent=days.some(d=>d.rate!=null)?"Ocupação do mapa KPI. Nas noites com faixa aplicável, informe a diária vigente para calcular a sugestão. Curva histórica, conversão e tarifas próprias automáticas ainda sem integração para esta unidade.":"Sem ocupação apurada para este hotel no período.";
      if (ownModel) element("hotelNote").textContent="Modelo RMS Próprio selecionado. A simulação desta unidade aguarda os dados de procura, conversão, curva histórica e tarifas.";
    }
    if (currentVersion!==analysisVersion) return;
    refreshNightScroll();
    const grid=element("nights"), rows=grid.tBodies[0].rows;
    for (const c of competitors) {
      const isReference=isPlaza && c.nome.trim().toLowerCase()==="brisa da praia" && c.categoria==="Standard Plus";
      const index=isReference ? 4 : analysisCells(grid.tHead.rows[0]).length;
      if (!isReference) {
        grid.tHead.rows[0].appendChild(document.createElement("th")).textContent=c.nome+" · "+c.categoria;
        for(const row of rows) row.insertCell().textContent="Consultando…";
      }
      for(let i=0;i<dates.length;i+=4) {
        if(currentVersion!==analysisVersion) return;
        const batch=dates.slice(i,i+4);
        let prices={};
        try {
          const standard=isPlaza ? Object.fromEntries(batch.map(d=>[d,data.rates[d]?.site?.standard?.final])) : undefined;
          const res=await fetch("/api/portal/rms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tipo:"concorrentes_painel",hotel_id:hotel.id,nome:c.nome,noites:batch,standard})});
          if(res.ok) {
            const fresh=await res.json();
            if(currentVersion!==analysisVersion) return;
            prices=fresh.quotes;
            for (const r of fresh.rows) {
              const cells=analysisCells(rows[i+batch.indexOf(r[0])]);
              plazaNight(mapRow(r),data.rates[r[0]],data.analysis.conversaoDeskhotel,data.policies.find(p=>p.hotel_id===hotel.id),data.floors.filter(f=>f.hotel_id===hotel.id),data.periods.filter(p=>p.hotel_id===hotel.id),data.catalog)
                .forEach((v,k)=>cells[k].textContent=v);
              if(compareSite) compareSite(rows[i+batch.indexOf(r[0])],r[0]);
            }
          }
        } catch {}
        if(currentVersion!==analysisVersion) return;
        batch.forEach((d,j)=>{
          const cells=analysisCells(rows[i+j]);
          cells[index].textContent=typeof prices[d]==="number"?money(prices[d]):prices[d]===null?"Sem oferta":"Sem cotação";
          if(isReference && !(prices[d]>0)) {
            cells[6].textContent="—";
            cells[5].textContent="—";
          }
        });
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
      RmsOfertas.show(hotels.find(h=>h.id===hotelId));
      RmsBases.show(hotels.find(h=>h.id===hotelId),row=>{if(hotels.find(h=>h.id===hotelId)?.code==="PLAZA" && data.catalog){data.catalog.edits[JSON.stringify([row.base,row.plano,row.quarto,row.pax,row.dia])]=Number(row.valor);renderCatalog(data.catalog,hotelId);}});
      const periods=data.periods.filter(p=>p.hotel_id===hotelId&&!p.bloqueio_avulso).sort((a,b)=>a.inicio.localeCompare(b.inicio));
      element("periodCount").textContent=periods.length ? periods.length+" períodos cadastrados para este hotel." : "Nenhum período BeePrice cadastrado para este hotel.";
      const catalog=hotels.find(h=>h.id===hotelId)?.code==="PLAZA" ? data.catalog : null;
      setupNewPeriod(hotels.find(h=>h.id===hotelId),catalog);
      RmsRuleEditor.show(data,hotels.find(h=>h.id===hotelId),()=>load());
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
      const active=policy?.modelo==="proprio"?"proprio":"simples";
      const radios=[...document.querySelectorAll("input[name=viewModel]")];
      const activate=element("activateModel");
      function view(model) {
        const own=model==="proprio";
        radios.forEach(r=>{r.checked=r.value===model;});
        element("models").hidden=false;
        element("activeModel").textContent="Modelo em uso na simulação deste hotel: "+({proprio:"RMS Próprio",simples:"RMS Simples"}[active])+".";
        activate.hidden=model===active;
        element("simpleCriteria").hidden=model!=="simples";
        element("competitors").hidden=element("ownCriteria").hidden=!own;
        element("festive").hidden=true;
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
