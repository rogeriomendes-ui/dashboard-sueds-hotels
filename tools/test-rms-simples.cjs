const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const ctx=vm.createContext({module:{exports:{}}});
for(const file of ['rms-rules.js','rms-plaza-tarifas.js','rms-levels.js','rms-simples.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'),ctx);
const simple=ctx.module.exports;
const hotel={id:'plaza',code:'PLAZA'};
const day={date:'2027-01-23',rate:65};
function fixture(){return {today:'2027-01-23',offers:[{tipo:'Desconto',nome:'Black Friday',desconto:40,tarifarios:['TARIFÁRIO SITE - CAFÉ DA MANHÃ']}],rates:{[day.date]:{web:{standard:1000,luxo:1200,suite:1500},site:Object.fromEntries(['standard','luxo','suite'].map(k=>[k,{discount:40,offer:'Black Friday',divergence:false}]))}},periods:[{hotel_id:'plaza',inicio:'2027-01-01',fim:'2027-01-31',nome:'Janeiro',pct0:0,pct50:10,pct60:15,pct70:20,pct80:30}],catalog:{bases:[{levels:[0,10,15,20,30].map(pct=>({pct,code:'L'+pct,name:'Nível '+pct})),grids:[{standard:[0,1000],luxo:[0,1200],suite:[0,1500]}]}],periods:{'2027-01-01':0},calendar:{}}};}
test('usa a mesma faixa e não acumula desconto de 40%',()=>{const n=simple.night(fixture(),hotel,day,'SITE Café',new Map());assert.equal(n.current.standard,862.5);assert.equal(n.proposed.standard,517.5);assert.equal(n.proposed.luxo,621);assert.equal(n.proposed.suite,776.25);assert.match(n.band,/15%/);});
test('calcula a proposta pela base mesmo com vigente acima da faixa',()=>{const data=fixture();data.rates[day.date].web.standard=1400;const n=simple.night(data,hotel,{...day,rate:45},'SITE Café',new Map());assert.equal(n.current.standard,750);assert.equal(n.proposed.standard,450);assert.match(n.reason,/sobre a base WEB/);});
test('esgotado e overbooking mantêm valores',()=>{for(const rate of [100,110]){const n=simple.night(fixture(),hotel,{...day,rate},'WEB Café',new Map());assert.equal(n.proposed.standard,1000);assert.equal(n.band,'Manter');}});
test('oferta SITE não é aplicada no WEB ou NET',()=>{const data=fixture();assert.equal(simple.night(data,hotel,day,'WEB Café',new Map()).proposed.standard,1150);assert.equal(simple.night(data,hotel,day,'NET Café',new Map()).proposed.standard,690);});
test('não inventa tarifas de MAP, PC ou outro hotel',()=>{assert.equal(simple.night(fixture(),hotel,day,'WEB MAP',new Map()).proposed.standard,null);assert.equal(Object.keys(simple.night(fixture(),{id:'other',code:'PREMIUM'},day,'WEB Café',new Map()).current).length,0);});
test('recalcula as faixas sobre a base editada da meia pensão e aplica a melhor oferta elegível uma vez',()=>{
  const d=fixture(),base=d.catalog.bases[0];base.name='Janeiro';base.grids.push({standard:[0,900]});
  d.catalog.edits={'["Janeiro",1,"standard",2,5]':1000};
  const offer={nome:'MAP 40%',tipo:'Desconto',desconto:40,tarifarios:['Tarifário WEB - Meia Pensão'],dias_estadia:[5]};
  d.offers=[offer,{...offer,desconto:10},{...offer,desconto:99,estadia:[['2027-01-24','2027-01-31']]}];
  for(const [rate,expected] of [[55,660],[65,690],[null,null]]){
    assert.equal(simple.night(d,hotel,{...day,rate},'WEB MAP',new Map()).proposed.standard,expected);
  }
  assert.equal(d.catalog.edits['["Janeiro",1,"standard",2,5]'],1000);
});
test('WEB vigente vem do nível e SITE e NET derivam do WEB com o maior desconto elegível',()=>{
  const data=fixture();
  data.offers[0].tarifarios.push('Tarifário WEB - Café da Manhã','Tarifa Net - Café da Manhã');
  data.offers.push({...data.offers[0],desconto:30});
  data.rates[day.date].web.standard=1400;
  for(const [group,regular,final] of [['WEB Café',1150,690],['SITE Café',862.5,517.5],['NET Café',690,414]]){
    const result=simple.night(data,hotel,day,group,new Map());
    assert.equal(result.current.standard,regular);
    assert.equal(result.proposed.standard,final);
  }
});
test('não confunde preço atual com aviso ausente e identifica reconstrução',()=>{const n=simple.night(fixture(),hotel,day,'WEB Café',new Map());assert.equal(n.observed.standard,null);const refs=new Map([[day.date,{web:{standard:1100},at:'17/11/2026 17:19',level:'L10'}]]);const observed=simple.night(fixture(),hotel,day,'SITE Café',refs);assert.equal(observed.observed.standard,495);assert.match(observed.observedReason,/reconstruídos/);});
test('API bloqueia aplicação e automação para RMS Simples sem escrever',async()=>{
  const sandbox=vm.createContext({module:{exports:{}},require:()=>({json:(_res,status,body)=>({status,body})})});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../lib/rms-flutuacao.js'),'utf8'),sandbox);
  const client={from(name){assert.equal(name,'rms_politicas');return {select(){return {eq(){return {maybeSingle:async()=>({data:{modelo:'simples'}})}}}}}}};
  for(const tipo of ['flutuacao_aplicar','flutuacao_automatica']){const result=await sandbox.module.exports(client,{tipo},hotel,{},'', '',()=>true,{});assert.equal(result.status,409);}
});
test('painel renderiza nove grupos, repete títulos e conserva seleção local',async()=>{
  class Element {
    constructor(tag='div'){this.tag=tag;this.children=[];this.classList={add(){},remove(){}};this.attributes={};this.textContent='';}
    append(...items){this.children.push(...items);} appendChild(item){this.append(item);return item;}
    replaceChildren(...items){this.children=items;} setAttribute(k,v){this.attributes[k]=v;}
    createTHead(){const e=new Element('thead');this.append(e);return e;} createTBody(){const e=new Element('tbody');this.append(e);return e;}
    insertRow(){const e=new Element('tr');this.append(e);return e;} insertCell(){const e=new Element('td');this.append(e);return e;}
  }
  const ids=new Map(),document={getElementById(id){if(!ids.has(id))ids.set(id,new Element());return ids.get(id)},createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
  ctx.document=document;ctx.fetch=async(_url,options)=>{if(JSON.parse(options.body).tipo==='ofertas_consultar')return {ok:true,json:async()=>({ofertas:[]})};assert.equal(JSON.parse(options.body).tipo,'ocupacao_plaza');return {ok:true,json:async()=>({days:[day]})}};
  const data={...fixture(),today:'2027-01-23',beeHistory:[]};
  await simple.show(data,hotel,()=>true,()=>{});
  const tabs=ids.get('simpleGroups');assert.equal(tabs.children.length,10);
  tabs.children.at(-1).onclick();
  const table=ids.get('nights'),header=table.children[0].children[0],row=table.children[1].children[0];
  assert.equal(header.children.length,66);assert.equal(row.children.length,66);
  assert.equal(header.children[3].children[0].textContent,'WEB Café');
  assert.equal(header.children[10].children[0].textContent,'WEB MAP');
  assert.equal(header.children[2].textContent,'Ocupação (%)');
  assert.equal(row.children[2].textContent,day.rate.toLocaleString('pt-BR')+'%');
  assert.equal(row.children[3].children.length,3);
  ids.get('simpleAll').onchange({target:{checked:true}});
  assert.equal(ids.get('simpleCount').textContent,'1 noites selecionadas');
});

