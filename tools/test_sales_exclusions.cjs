const assert=require('node:assert/strict');
const ex=require('../lib/sales-exclusions.cjs');
const {validate}=require('../lib/sales-write-validator.cjs');
const {plan}=require('../lib/sales-editor-sync.cjs');
const cell=ex.textCell;
const sale=(code='X',id='',action='')=>{const values=Array.from({length:30},()=>({}));for(const [i,v] of [[0,'01/10/2026'],[1,code],[2,'SUEDS PLAZA'],[3,'PARTICULAR'],[4,'Amanda Melgaco'],[5,'Cliente'],[17,'Confirmada'],[25,action],[28,id]])if(v)values[i]=cell(v);return {values};};
const grid=(...rows)=>[{values:[]},...rows];
const archive=()=>[{values:ex.HEADERS.map(cell)}];
const at='2026-10-16T12:00:00Z';
function apply(grid,requests) {const result=structuredClone(grid);for(const r of requests){if(r.appendCells){result.push(...r.appendCells.rows);continue;}const u=r.updateCells;if(!u)continue;const row=u.range.startRowIndex;while(result.length<=row)result.push({values:[]});for(let c=0;c<u.rows[0].values.length;c++)result[row].values[u.range.startColumnIndex+c]=u.rows[0].values[c];}return result;}
let s=grid(sale()),m=grid(sale()),a=archive();
let p=ex.prepare(s,m,a,at);
s=apply(s,p.sourceRequests);m=apply(m,p.mirrorRequests);
assert.equal(ex.idOf(s[1].values),ex.idOf(m[1].values));
assert.equal(ex.prepare(s,m,a,at).sourceRequests.length,0);
// A row move cannot change the identity, and a partial failure resumes from the archive.
m=grid({values:[]},m[1]);m[2].values[25]=cell(ex.ACTION);
p=ex.prepare(s,m,a,at);
assert.equal(p.newEntries.length,1);assert.equal(p.clears.length,2);
assert.equal(validate({operation:'seller-exclusion-control',sourceGrid:s,mirrorGrid:m,archiveGrid:a,at,...p}).validated,true);
assert.throws(()=>validate({operation:'seller-exclusion-control',sourceGrid:s,mirrorGrid:m,archiveGrid:a,at,...p,mirrorRequests:[]}),/diverge/);
a=apply(a,p.archiveRequests);s=apply(s,p.sourceRequests);
p=ex.prepare(s,m,a,at);assert.equal(p.newEntries.length,0);assert.equal(p.clears.length,1);
m=apply(m,p.mirrorRequests);assert.equal(ex.prepare(s,m,a,at).clears.length,0);
// Reimport without an ID is suppressed; a new, unrelated sale can reuse a blank row.
s=grid(sale());p=ex.prepare(s,m,a,at);assert.equal(p.clears.length,1);
assert.throws(()=>ex.guardRecord({codigo:'X',hotel:'SUEDS PLAZA'},ex.parseArchive(a)),/reinclusao bloqueada/);
s=grid(sale('Y'));p=ex.prepare(s,m,a,at);assert.equal(p.clears.length,0);
// Same reservation code in another hotel remains independent.
s[1].values[1]=cell('X');s[1].values[2]=cell('SUEDS TRANCOSO');assert.equal(ex.prepare(s,m,a,at).clears.length,0);
// Removing one duplicate must preserve the distinct, existing ID of its sibling.
s=grid(sale('Z'),sale('Z'));m=structuredClone(s);a=archive();p=ex.prepare(s,m,a,at);s=apply(s,p.sourceRequests);m=apply(m,p.mirrorRequests);
const retained=ex.idOf(s[1].values);m[2].values[25]=cell(ex.ACTION);p=ex.prepare(s,m,a,at);assert.equal(p.clears.length,2);
a=apply(a,p.archiveRequests);s=apply(s,p.sourceRequests);m=apply(m,p.mirrorRequests);assert.equal(ex.idOf(s[1].values),retained);assert.equal(ex.prepare(s,m,a,at).clears.length,0);
// Mismatched copies and corrupt archives fail closed.
m[1].values[25]=cell(ex.ACTION);m[1].values[1]=cell('DIFFERENT');assert.throws(()=>ex.prepare(s,m,a,at),/alterada/);
assert.throws(()=>ex.prepare(s,m,[],at),/cabecalho/);
// Normal sync pairs by stable ID even after sorting or code correction.
s=grid(sale('A','sl_'+'a'.repeat(32)));m=grid({values:[]},sale('OLD','sl_'+'a'.repeat(32)));
const normal=plan(s,m,[],10,10);assert.equal(normal.records.filter(r=>r.operation==='mirror-insert').length,0);assert.equal(normal.mirrorRequests.some(r=>r.updateCells?.range?.startColumnIndex===1),true);
console.log('sales exclusions: identity, partial failures, replay, duplicate safety, guards and normal sync passed');
