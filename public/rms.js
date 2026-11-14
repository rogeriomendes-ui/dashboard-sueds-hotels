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

function nightPolicy(night,occupancy,policy,floors) {
  const periodFloors=floors.filter(f=>f.inicio<=night && night<=f.fim).map(f=>Number(f.valor));
  const floor=periodFloors.length ? Math.max(...periodFloors) : Number(policy?.piso ?? 0);
  const threshold=thresholds.filter(t=>occupancy>t && policy?.["pct"+t]!=null).pop();
  return {floor,threshold};
}

function plazaNight(row, rates, demand, policy, floors, periods) {
  const night=row[0], brisa=value(row[2]), standard=rates?.standard;
  const [quotes,sales]=demand[night] || [];
  const {floor,threshold}=nightPolicy(night,value(row[7]),policy,floors);
  const ready=standard>0 && row[6]!=="Revisar" && row[4]!=="";
  const period=periods.find(p=>p.inicio<=night && night<=p.fim);
  const occupancy=value(row[7]);
  const hold=occupancy>=100;
  const band=[80,70,60,50].find(n=>occupancy>n) ?? 0;
  const pct=period ? Number(period["pct"+band]) : threshold ? Number(policy["pct"+threshold]) : 0;
  const adjust=(current,percent)=>Math.round(Math.round(current*100)*(100+percent)/100)/100;
  const bandReady=standard>0 && Number.isFinite(occupancy);
  const raw=bandReady ? adjust(standard,pct) : null;
  const suggested=bandReady ? Math.max(floor,raw) : null;
  const effective=bandReady && suggested>raw ? 100*(suggested/standard-1) : pct;
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
    const bandRate=hold ? current : current && bandReady ? (key==="standard" ? suggested : Math.max(floor,adjust(current,effective))) : null;
    const rmsRate=hold ? current : current && ready ? (key==="standard" ? rmsStandard : Math.max(floor,adjust(current,rmsEffective))) : null;
    const delta=bandRate>0 && rmsRate>0 ? Math.round((rmsRate-bandRate)*100)/100 : null;
    if (delta!==null) { comparable=true; if(delta!==0) diverges=true; }
    amounts.push(money((own ? rmsRate : bandRate) ?? null),money(bandRate ?? null),money(rmsRate ?? null),delta>0 ? "+"+money(delta) : money(delta));
  }
  let reason=threshold && bandReady ? "Faixa acima de "+threshold+"% de ocupação. Ajuste de "+formatPct(pct)+"." : row[17];
  if (period && bandReady) reason=period.nome+" · ocupação de "+row[7]+"% · ajuste do período: "+formatPct(pct)+".";
  if (bandReady && suggested>raw) reason+=" Piso aplicado.";
  if (hold) reason=occupancy>100 ? "Overbooking. Manter a tarifa vigente." : "Inventário esgotado. Manter a tarifa vigente.";
  const action=hold ? "Manter" : bandReady ? suggested>standard ? "Subir" : suggested<standard ? "Reduzir" : "Manter" : "Revisar";
  const comparison=!comparable ? "Sem comparação" : diverges ? "Diverge" : "Coincide";
  return [date(night),comparison,change,...amounts,money(brisa),standard && brisa ? formatPct(100*(standard/brisa-1)) : "—",row[7]+"%",row[8],
    quotes ?? "—",conversionRate(quotes,sales),action,hold ? "0%" : bandReady ? formatPct(effective) : "—",date(row[10]),row[12],row[13],row[14],reason,
    hold ? reason : row[17]+(ready && rmsStandard>adjust(standard,rmsPercent) ? " Piso aplicado." : ""),
    rates?.at ? new Date(rates.at).toLocaleString("pt-BR",{timeZone:"America/Bahia"}) : "—"];
}

function filterPlazaRow(row) {
  row.hidden=(element("onlyDifferent").checked && row.cells[1].textContent!=="Diverge") ||
    (element("onlyChanged").checked && row.cells[2].textContent==="—");
}
let analysisVersion=0;
async function showPlaza(data,plaza) {
  const version=++analysisVersion;
  const policy=data.policies.find(p=>p.hotel_id===plaza?.id);
  const floors=data.floors.filter(f=>f.hotel_id===plaza?.id);
  const nights=data.analysis.rows.filter(r=>r[0]>=data.today);
  const periods=data.periods.filter(p=>p.hotel_id===plaza.id);
  const render=(r,rates)=>plazaNight(r,rates,data.analysis.conversaoDeskhotel,policy,floors,periods);
  const priceColumns=["Standard","Luxo","Suíte Master"].flatMap(category=>["atual","modelo escolhido","BeePrice","RMS Próprio","RMS − faixa"].map(label=>category+" · "+label));
  table("nights",["Noite","Comparação","Mudança RMS · Standard",...priceColumns,"Tarifa de referência","Plaza × referência","Ocupação","Saldo ADVP","Orçamentos","Taxa de conversão","Sugestão da faixa","Ajuste da faixa","Data comparável","Antecedência","Aptos atuais","Aptos históricos","Motivo da faixa","Motivo do RMS","Consulta Omnibees"],
    nights.map(r=>render(r,data.rates[r[0]])));
  element("selectedModel").textContent="Modelo escolhido: "+(policy?.modelo==="proprio" ? "RMS Próprio" : "BeePrice")+". No RMS Próprio, abaixo de 80%, procura e conversão devem atingir as referências mensais, com venda e ADVP ≥ 0. Aumento de 5%, ou 10% a partir de 70% de ocupação e 10 aptos à frente.";
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
      const policy=data.policies.find(p=>p.hotel_id===hotel.id);
      const ownModel=policy?.modelo==="proprio";
      const floors=data.floors.filter(f=>f.hotel_id===hotel.id);
      dates=days.map(d=>d.date);
      table("nights",["Noite","Ocupação","Aptos ocupados","Ajuste por ocupação","Tarifa vigente (R$)","Tarifa sugerida"],days.map(d=>{
        const rule=nightPolicy(d.date,d.rate,policy,floors);
        return [date(d.date),d.rate==null?"—":d.rate.toLocaleString("pt-BR",{maximumFractionDigits:1})+"%",d.occupied ?? "—",
          d.rate>=100?"Manter":ownModel?"Sem apuração":rule.threshold?policy["pct"+rule.threshold]+"%":"—","—","—"];
      }));
      days.forEach((d,i)=>{
        const {threshold,floor}=nightPolicy(d.date,d.rate,policy,floors);
        if (ownModel || !threshold || d.rate>=100) return;
        const cells=element("nights").tBodies[0].rows[i].cells, input=document.createElement("input");
        input.type="number";input.min=".01";input.step=".01";input.setAttribute("aria-label","Tarifa vigente em "+date(d.date));
        cells[4].replaceChildren(input);
        input.oninput=()=>cells[5].textContent=input.valueAsNumber>0 && input.validity.valid ? money(Math.max(floor,Math.round(Math.round(input.valueAsNumber*100)*(100+Number(policy["pct"+threshold]))/100)/100)) : "—";
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
              plazaNight(r,data.rates[r[0]],data.analysis.conversaoDeskhotel,data.policies.find(p=>p.hotel_id===hotel.id),data.floors.filter(f=>f.hotel_id===hotel.id),data.periods.filter(p=>p.hotel_id===hotel.id))
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

async function load(options) {
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

    function renderHotel() {
      const hotelId=select.value;
      const periods=data.periods.filter(p=>p.hotel_id===hotelId);
      element("festive").hidden=!periods.length;
      const forms=element("festiveForms");
      forms.replaceChildren();
      for (const p of periods) {
        const title=document.createElement("h3"), form=document.createElement("form"), stamp=document.createElement("p");
        title.textContent=p.nome+" · "+date(p.inicio)+" a "+date(p.fim);
        const bands=[0,50,60,70,80];
        for (const [i,b] of bands.entries()) {
          const label=document.createElement("label"), input=document.createElement("input");
          label.textContent=(b?"Acima de "+b+"% até ":"Até ")+(bands[i+1] ?? 100)+"% · ajuste (%)";
          Object.assign(input,{name:"pct"+b,type:"number",required:true,min:"0",max:"99999",step:".01",value:p["pct"+b]});
          label.append(input); form.append(label);
        }
        const save=document.createElement("button");
        save.textContent="Salvar faixas de "+p.nome; form.append(save);
        stamp.textContent=p.gravado_em?"Última gravação: "+auditStamp(p.gravado_em,p.gravado_por):"Cadastro inicial conforme BeePrice.";
        form.onsubmit=async event=>{
          event.preventDefault(); save.disabled=true;
          const fields=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,Number(v)]));
          try {await load({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...fields,tipo:"faixa_festiva",hotel_id:hotelId,inicio:p.inicio})});}
          catch(error){element("status").textContent=error.message;}
          finally {save.disabled=false;}
        };
        forms.append(title,form,stamp);
      }
      const policy=data.policies.find(p=>p.hotel_id===hotelId);
      policyForm.elements.modelo.value=policy?.modelo || "beeprice";
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
    renderHotel();
    element("hotelPicker").hidden=false;
    element("policy").hidden=element("minimum").hidden=!select.value;
    element("competitors").hidden = !select.value;
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
