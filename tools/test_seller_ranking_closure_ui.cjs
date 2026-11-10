const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
const parent = { appendChild(button) { elements.set(button.id, button); } };
elements.set('exportExcel', { parentElement: parent });
let confirmation = '';
const context = vm.createContext({
 byId: id => elements.get(id),
 document: {createElement: () => ({})},
 monthSelect: {value:'2026-09'},
 MONTH_LABELS: {'2026-09':'SETEMBRO'},
 commissionMoney: new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}),
 window: {confirm: text => {confirmation=text; return false;}},
});
const source=fs.readFileSync(require.resolve('../public/vendedores.js'),'utf8');
vm.runInContext(source.slice(source.indexOf('function renderRankingClosure(data)')),context);
(async()=>{
 const data={period:{month:'2026-09'}, summary:{salesMonth:356197.10},sellers:[{name:'EQUIPE SUEDS',salesMonth:346012.42}],canFreeze:true,rankingClosure:{eligible:true}};
 context.renderRankingClosure(data);
 const button=elements.get('freezeRanking');
 assert.equal(button.hidden,false);
 await button.onclick();
 assert(confirmation.includes('346.012,42'));
 assert(!confirmation.includes('356.197,10'));
 context.renderRankingClosure({...data,canFreeze:false});
 assert.equal(button.hidden,true);
 context.renderRankingClosure({...data,canFreeze:false,rankingClosure:{frozen:true,closedAt:'2026-11-10T12:00:00Z',closedBy:'Gestora'}});
 assert.equal(button.disabled,true);
 assert.equal(button.hidden,false);
 assert(button.title.includes('Gestora'));
 console.log('PASS: confirmation uses team total with cents; button visibility and frozen status.');
})().catch(error=>{console.error(error);process.exitCode=1});
