const assert = require('node:assert/strict');
const c = require('../lib/seller-ranking-closure.cjs');
(async()=>{
 assert(c.eligible({month:'2026-09'},'2026-11'));
 assert.equal(c.canonicalPeriod({month:'2026-09',date:'2026-09-01'}).date,'2026-09-30');
 assert.equal(c.canonicalPeriod({month:'2028-02'}).date,'2028-02-29');
 for(const period of [{month:'2026-11'},{month:'2026-12'},{month:'ytd'},{month:'2026-09',hotel:'PLAZA'},{month:'2026-09',day:'2026-09-01'}]) assert(!c.eligible(period,'2026-11'));
 const metrics={period:{month:'2026-09'},sellers:[{name:'Aline',salesMonth:153901.21}],summary:{salesMonth:387793.30},detailedSales:[]};
 let saved;
 const request=async(path,options)=>{
  if(!options)return saved?[{payload:saved.payload}]:[];
  if(saved)throw Error('unique violation');
  saved=JSON.parse(options.body);
 };
 await assert.rejects(c.save(request,metrics,'Gestor','wrong'));
 assert(!saved);
 const closed=await c.save(request,metrics,'Gestor',c.digest(metrics));
 assert.equal(closed.closedBy,'Gestor');
 metrics.sellers[0].salesMonth=1;
 assert.equal((await c.read(request,'2026-09')).metrics.sellers[0].salesMonth,153901.21);
 await assert.rejects(c.save(request,metrics,'Outro',c.digest(metrics)));
 console.log('Fechamento: mês encerrado, filtros, conferência, persistência e substituição validados.');
})().catch(e=>{console.error(e);process.exitCode=1});
