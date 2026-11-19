const test=require('node:test'),assert=require('node:assert/strict');
const rules=require('../public/rms-rules'),{valid}=require('../lib/rms-bloqueios');
const {beeWebDecision,plazaLevelComparison}=require('../public/rms-levels');
test('vencido apenas quando todos os períodos terminaram; hoje ainda vale',()=>{
 assert.equal(rules.expired({periodos:[{fim:'2026-10-31'},{fim:'2026-11-18'}]},'2026-11-19'),true);
 assert.equal(rules.expired({periodos:[{fim:'2026-10-31'},{fim:'2026-11-19'}]},'2026-11-19'),false);
 assert.equal(rules.expired({periodos:[{fim:'2026-10-31'},{fim:'2027-01-01'}]},'2026-11-19'),false);
});
test('valida datas e permite remover todos os bloqueios',()=>{assert.equal(valid([]),true);assert.equal(valid([{inicio:'2027-02-10',fim:'2027-02-12'}]),true);for(const p of [[{inicio:'2027-02-30',fim:'2027-03-02'}],[{inicio:'2027-02-12',fim:'2027-02-10'}],[null]])assert.equal(valid(p),false);});
test('bloqueia só intervalo inclusivo do hotel, inclusive fora de conjunto',()=>{
 const p={hotel_id:'A',nome:'Carnaval',inicio:'2027-02-01',fim:'2027-02-28',pct0:0,pct50:10,pct60:15,pct70:20,pct80:30};
 const rows=rules.withBlocks([p],[{hotel_id:'A',periodos:[{inicio:'2027-02-10',fim:'2027-02-12'},{inicio:'2027-03-01',fim:'2027-03-01'}]}]);
 for(const d of ['2027-02-10','2027-02-11','2027-02-12','2027-03-01'])assert.equal(rules.forNight(rows,d).bloqueado,true);
 assert.equal(rules.forNight(rows,'2027-02-09').bloqueado,undefined);assert.equal(rules.forNight(rows,'2027-02-13').bloqueado,undefined);
 assert.equal(rules.forNight(rows.filter(p=>p.hotel_id==='B'),'2027-02-10'),undefined);assert.equal(rules.groups(rows,null,'A').length,1);
 const period=rules.forNight(rows,'2027-03-01'),target=plazaLevelComparison({bases:[],periods:{}},period,'2027-03-01',80);
 assert.equal(beeWebDecision(target,{standard:1000},period.bloqueado).prices.standard,1000);
});
