const assert=require('node:assert/strict');
const sort=require('../lib/sales-editor-sort.cjs');
const {validate}=require('../lib/sales-write-validator.cjs');
const cell=v=>({userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:v},formattedValue:String(v)});
function row(date,id) {
  const values=Array.from({length:30},()=>({}));
  values[0]=cell(date);values[1]=cell(id);values[28]=cell('sl_'+id);
  values[12]={...cell(123),note:'SUEDS_SYNC_V1:{"numberValue":123}'};
  values[8]={userEnteredValue:{formulaValue:'=H2-G2'}};
  return {values};
}
const header={values:[cell('Data Venda')]};
const grid=[header,row('06/11/2026','late'),row('30/10//2026','invalid'),{},row('30/10/2026','early'),row(sort.dateKey(cell('30/10/2026')),'same-date'),row('01/11/2026','middle')];
const p=sort.prepare(grid,1945937754);
const after=structuredClone(grid);
for(const {moveDimension:m} of p.requests)after.splice(m.destinationIndex,0,...after.splice(m.source.startIndex,m.source.endIndex-m.source.startIndex));
assert.deepEqual(after.slice(1).map(r=>r.values?.[1]?.formattedValue),['early','same-date','middle','late','invalid',undefined]);
assert.equal(after[0].values[0].formattedValue,'Data Venda');
assert.equal(sort.prepare(after,1945937754).requests.length,0);
assert.equal(sort.verify(grid,after,1945937754),true);
assert.equal(sort.dateKey(cell('31/02/2026')),Infinity);
assert.equal(sort.dateKey(cell('3/11/2026')),sort.dateKey(cell('03/11/2026')));
const plan={operation:'seller-date-sort',sourceGrid:grid,mirrorGrid:grid,sourceRequests:p.requests,mirrorRequests:sort.prepare(grid,682229965).requests};
assert.equal(validate(plan).validated,true);
assert.throws(()=>validate({...plan,sourceRequests:[{deleteDimension:{}}]}),/divergem/);
const broken=structuredClone(after);broken[1].values[28]=cell('wrong-id');
assert.throws(()=>sort.verify(grid,broken,1945937754),/ID alterado/);
// Header-only and already sorted grids must be a true no-op.
assert.deepEqual(sort.prepare([header],1945937754).requests,[]);
assert.equal(sort.prepare([header,row('01/01/2026','a'),row('01/02/2026','b')],1945937754).requests.length,0);
console.log('sales editor sort: chronological, stable, whole-row identity, invalid dates, idempotency and exact request validation passed');
