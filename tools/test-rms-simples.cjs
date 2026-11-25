const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const ctx=vm.createContext({module:{exports:{}}});
for(const file of ['rms-rules.js','rms-plaza-tarifas.js','rms-levels.js','rms-trancoso.js','rms-simples.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'),ctx);
const simple=ctx.module.exports;
const hotel={id:'plaza',code:'PLAZA'};
const kpiDay=rate=>({date:'2027-01-23',rate,apartments:100,available:rate===null?null:100-rate});
const day=kpiDay(55);
function fixture(){return {today:'2027-01-23',offers:[{tipo:'Desconto',nome:'Black Friday',desconto:40,tarifarios:['TARIFÁRIO SITE - CAFÉ DA MANHÃ']}],rates:{[day.date]:{web:{standard:1000,luxo:1200,suite:1500},site:Object.fromEntries(['standard','luxo','suite'].map(k=>[k,{discount:40,offer:'Black Friday',divergence:false}]))}},periods:[{hotel_id:'plaza',inicio:'2027-01-01',fim:'2027-01-31',nome:'Janeiro',pct0:0,pct50:10,pct60:15,pct70:20,pct80:30}],catalog:{bases:[{levels:[0,10,15,20,30].map(pct=>({pct,code:'L'+pct,name:'Nível '+pct})),grids:[{standard:[0,1000],luxo:[0,1200],suite:[0,1500]}]}],periods:{'2027-01-01':0},calendar:{}}};}
test('usa a mesma faixa e não acumula desconto de 40%',()=>{const n=simple.night(fixture(),hotel,day,'SITE Café');assert.equal(n.current.standard,862.5);assert.equal(n.proposed.standard,517.5);assert.equal(n.proposed.luxo,621);assert.equal(n.proposed.suite,776.25);assert.match(n.band,/15%/);});
test('calcula a proposta pela base mesmo com vigente acima da faixa',()=>{const data=fixture();data.rates[day.date].web.standard=1400;const n=simple.night(data,hotel,kpiDay(35),'SITE Café');assert.equal(n.current.standard,750);assert.equal(n.proposed.standard,450);assert.equal(n.reason,"Janeiro · L0");});
test('esgotado e overbooking mantêm valores',()=>{for(const rate of [100,110]){const n=simple.night(fixture(),hotel,kpiDay(rate),'WEB Café');assert.equal(n.proposed.standard,1000);assert.equal(n.band,'Manter');}});
test('oferta SITE não é aplicada no WEB ou NET',()=>{const data=fixture();assert.equal(simple.night(data,hotel,day,'WEB Café').proposed.standard,1150);assert.equal(simple.night(data,hotel,day,'NET Café').proposed.standard,690);});
test('não inventa tarifas onde não há grade cadastrada',()=>{
  assert.equal(simple.night(fixture(),hotel,day,'WEB MAP').proposed.standard,null);
  assert.equal(simple.night(fixture(),{id:'other',code:'PREMIUM'},day,'WEB Café').current.standard,null);
});
test('usa a grade por hotel, dia da semana e regime e aplica ofertas do Portal',()=>{
  const cabralia={id:'cabralia',code:'CABRALIA'};
  const base='FERIADOS 1º E 2º SEM 2026';
  const date='2026-11-20';
  const data={today:date,hotelBases:simple.indexBases({rows:[
    {base,plano:0,quarto:'standard',pax:2,dia:4,valor:800},
    {base,plano:0,quarto:'standard',pax:2,dia:5,valor:900},
    {base,plano:1,quarto:'standard',pax:2,dia:4,valor:1000}
  ]}),periods:[{hotel_id:cabralia.id,nome:base,inicio:date,fim:date,pct50:10}],
  offers:[{tipo:'Desconto',nome:'Promoção',desconto:20,tarifarios:['Tarifa WEB - Café da Manhã','TARIFARIO SITE CAFÉ DA MANHÃ']}]};
  const occupancy={date,apartments:100,available:57};
  for(const [group,regular,final] of [['WEB Café',880,704],['WEB MAP',1100,1100],['SITE Café',660,528],['NET Café',528,528]]){
    const result=simple.night(data,cabralia,occupancy,group);
    assert.equal(result.current.standard,regular);
    assert.equal(result.proposed.standard,final);
  }
  assert.equal(simple.night(data,cabralia,occupancy,'WEB PC').current.standard,null);
});
test('Trancoso usa a grade por noite e categoria real com flutuação desligada',()=>{
  const trancoso={id:'trancoso',code:'TRANCOSO'};
  const data={today:day.date,periods:[{hotel_id:trancoso.id,inicio:day.date,fim:day.date,pct80:30}],
    hotelBases:simple.indexBases({calendario:[{grade:[[day.date,'Suite Junior','2 Pax',100000],[day.date,'Suite Junior','3 Pax',130000]]}]}),
    offers:[{tipo:'Desconto',nome:'Promoção',desconto:40,tarifarios:['Tarifa Net - Café da Manhã']}]};
  const result=simple.night(data,trancoso,kpiDay(99),'NET Café');
  assert.equal(result.levelLabel,'Desligada');
  assert.equal(result.current['Suite Junior'],600);
  assert.equal(result.proposed['Suite Junior'],360);
});
test('recalcula as faixas sobre a base editada da meia pensão e aplica a melhor oferta elegível uma vez',()=>{
  const d=fixture(),base=d.catalog.bases[0];base.name='Janeiro';base.grids.push({standard:[0,900]});
  d.catalog.edits={'["Janeiro",1,"standard",2,5]':1000};
  const offer={nome:'MAP 40%',tipo:'Desconto',desconto:40,tarifarios:['Tarifário WEB - Meia Pensão'],dias_estadia:[5]};
  d.offers=[offer,{...offer,desconto:10},{...offer,desconto:99,estadia:[['2027-01-24','2027-01-31']]}];
  for(const [rate,expected] of [[45,660],[55,690],[null,null]]){
    assert.equal(simple.night(d,hotel,kpiDay(rate),'WEB MAP').proposed.standard,expected);
  }
  assert.equal(d.catalog.edits['["Janeiro",1,"standard",2,5]'],1000);
});
test('WEB vigente vem do nível e SITE e NET derivam do WEB com o maior desconto elegível',()=>{
  const data=fixture();
  data.offers[0].tarifarios.push('Tarifário WEB - Café da Manhã','Tarifa Net - Café da Manhã');
  data.offers.push({...data.offers[0],desconto:30});
  data.rates[day.date].web.standard=1400;
  for(const [group,regular,final] of [['WEB Café',1150,690],['SITE Café',862.5,517.5],['NET Café',690,414]]){
    const result=simple.night(data,hotel,day,group);
    assert.equal(result.current.standard,regular);
    assert.equal(result.proposed.standard,final);
  }
});
test('simula o nível Omnibees pela ocupação mesmo com aviso anterior diferente',()=>{
  const data=fixture();
  data.catalog.bases[0].levels.at(-1).name='Derivada feriados 30%';
  data.beeHistory=[{level:'L30',nights:[day.date]}];
  for(const [rate,label] of [[35,'L0 · Nível 0 · +0%'],[55,'L15 · Nível 15 · +15%'],[90,'L30 · Derivada feriados 30%'],[99,'Manter'],[100,'Manter'],[null,'—']]){
    assert.equal(simple.night(data,hotel,kpiDay(rate),'WEB Café').levelLabel,label);
  }
});
test('API bloqueia aplicação e automação para RMS Simples sem escrever',async()=>{
  const sandbox=vm.createContext({module:{exports:{}},require:()=>({json:(_res,status,body)=>({status,body})})});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../lib/rms-flutuacao.js'),'utf8'),sandbox);
  const client={from(name){assert.equal(name,'rms_politicas');return {select(){return {eq(){return {maybeSingle:async()=>({data:{modelo:'simples'}})}}}}}}};
  for(const tipo of ['flutuacao_aplicar','flutuacao_automatica']){const result=await sandbox.module.exports(client,{tipo},hotel,{},'', '',()=>true,{});assert.equal(result.status,409);}
});
test('painel renderiza nove grupos com a noite na primeira coluna',async()=>{
  class Element {
    constructor(tag='div'){this.tag=tag;this.children=[];this.classList={add(){},remove(){}};this.attributes={};this.textContent='';}
    append(...items){this.children.push(...items);} appendChild(item){this.append(item);return item;}
    replaceChildren(...items){this.children=items;} setAttribute(k,v){this.attributes[k]=v;}
    showModal(){this.open=true;} close(){this.open=false;}
    contains(item){return this.children.includes(item);}
    insertBefore(item,before){this.children.splice(this.children.indexOf(before),0,item);}
    createTHead(){const e=new Element('thead');this.append(e);return e;} createTBody(){const e=new Element('tbody');this.append(e);return e;}
    insertRow(){const e=new Element('tr');this.append(e);return e;} insertCell(){const e=new Element('td');this.append(e);return e;}
  }
  const ids=new Map(),document={getElementById(id){if(!ids.has(id))ids.set(id,new Element());return ids.get(id)},createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
  ctx.document=document;ctx.fetch=async(_url,options)=>{if(JSON.parse(options.body).tipo==='ofertas_consultar')return {ok:true,json:async()=>({ofertas:[]})};assert.equal(JSON.parse(options.body).tipo,'ocupacao_plaza');return {ok:true,json:async()=>({days:[day]})}};
  const data={...fixture(),today:'2027-01-23',beeHistory:[]};
  await simple.show(data,hotel,()=>true,()=>{});
  const tabs=ids.get('simpleGroups');assert.equal(tabs.children.length,10);
  const table=ids.get('nights');
  const columns=()=>table.children[0].children[0].children.map(cell=>cell.children.at(-1)?.textContent||cell.textContent);
  const expected=['Noite','Vigente após flutuação','Tx. Ocupação\nOmnibees','Tx. Ocupação\nKPI','Oferta aplicada','Flutuação Omnibees','Tarifa com oferta aplicada','Nível Tarifário'];
  const channels=['DeskHotel','Omnibees','CVC','Juniper'];
  assert.deepEqual(columns(),expected.concat(channels));
  tabs.children.at(-1).onclick();
  const row=table.children[1].children[0];
  assert.deepEqual(columns(),expected.concat(...Array(8).fill([expected[1],...expected.slice(4)]),channels));
  assert.equal(row.children.length,columns().length);
  assert.equal(row.children[0].textContent,'23/01/2027');
  assert.deepEqual(row.children[1].children[0].children.map(item=>item.textContent),
    ['STD','1.150,00','Luxo','1.380,00','Suíte','1.725,00']);
  assert.equal(row.children[2].textContent,'64%');
  assert.equal(row.children[3].textContent,'55%');
  assert.doesNotMatch(row.children[7].textContent,/ocupação|64%/i);
  assert.equal(row.children[7].textContent,"Janeiro · L15");
  tabs.children[3].onclick();
  const siteRow=table.children[1].children[0];
  const button=siteRow.children.at(-4).children[0];
  const proposed=simple.night({...data,offers:[]},hotel,day,'SITE Café').proposed;
  const prices=Object.fromEntries(Object.entries(proposed).map(([room,value])=>{
    const cents=Math.round(value*100);
    return [room,[cents,cents,Math.round(cents*1.4),Math.round(cents*1.8)]];
  }));
  ctx.fetch=async(url,options)=>{
    assert.equal(url,'/api/portal/rms');
    assert.deepEqual(JSON.parse(options.body),{tipo:'deskhotel_previa',noite:day.date});
    return {ok:true,json:async()=>({prices,checkedAt:'2027-01-23T12:00:00Z'})};
  };
  await button.onclick();
  assert.equal(button.textContent,'OK');
  prices.standard[3]--;
  await button.onclick();
  assert.equal(button.textContent,'Ver diferenças');
  delete prices.standard;
  await button.onclick();
  assert.equal(button.textContent,'Ver diferenças');
  assert.deepEqual(siteRow.children.slice(-3).map(cell=>cell.textContent),['—','—','—']);
});

