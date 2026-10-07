const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {plan,baseline}=require('../lib/sales-editor-sync.cjs');
const value=x=>x===null?{}:{userEnteredValue:typeof x==='number'?{numberValue:x}:{stringValue:String(x)},formattedValue:String(x)};
function row(code='R1',hotel='SUEDS PLAZA',received=20,status='Confirmada',notes='ok') {
  const values=Array.from({length:25},()=>({}));
  for(const [col,data] of [[0,'01/10/2026'],[1,code],[2,hotel],[3,'CENTRAL DE RESERVAS'],[4,'Aline Nunes'],[12,100],[13,received],[15,'PIX'],[17,status],[19,notes]])values[col]=value(data);
  return {values};
}
const header={values:Array.from({length:25},()=>({}))};
const sourceRow=row();
const mirrorRow=row();
for(const col of [12,13,17,19])mirrorRow.values[col].note=baseline(mirrorRow.values[col].userEnteredValue);
mirrorRow.values[12]=value(120);mirrorRow.values[12].note=baseline(value(100).userEnteredValue);
mirrorRow.values[13]=value(30);mirrorRow.values[13].note=baseline(value(20).userEnteredValue);
mirrorRow.values[17]=value('Pendente');mirrorRow.values[17].note=baseline(value('Confirmada').userEnteredValue);
mirrorRow.values[19]=value('novo');mirrorRow.values[19].note=baseline(value('ok').userEnteredValue);
const result=plan([header,sourceRow],[header,mirrorRow],[header],20,20);
assert.equal(result.sourceRequests.length,4);
assert.deepEqual(result.records.map(x=>x.operation),['mirror-field-update','mirror-field-update','status-update','mirror-field-update']);
assert.equal(result.conflict.length,0);
assert.equal(result.mirrorRequests.length,4);
const verify=input=>{
  const file=path.join(os.tmpdir(),`sales-editor-validator-${process.pid}.json`);
  fs.writeFileSync(file,JSON.stringify({records:input.records,existingSellers:input.existingSellers,existingChannels:input.existingChannels,requests:input.sourceRequests}));
  const checked=spawnSync(process.execPath,[path.join(__dirname,'validate_sales_write.cjs'),file],{encoding:'utf8'});
  fs.unlinkSync(file);
  assert.equal(checked.status,0,checked.stderr);
};
verify(result);

const changedSource=row();changedSource.values[13]=value(40);
const conflict=plan([header,changedSource],[header,mirrorRow],[header],20,20);
assert.equal(conflict.conflict[0].reason,'concurrent_edit');

const newRow=row('R2');
const added=plan([header,sourceRow],[header,row(),newRow],[header],20,20);
assert.equal(added.records[0].operation,'mirror-insert');
assert.equal(added.records[0].rowNumber,3);
assert.equal(added.sourceRequests.length,1);
verify(added);

// Empty prepared rows already have sync markers. They are still new sales when
// they are appended after the last populated source row.
const markedNew=row('R3');
for(const col of [13,17,19])markedNew.values[col].note=baseline(markedNew.values[col].userEnteredValue);
for(const col of [13,17,19])markedNew.values[col].note=baseline(null);
const laterSource=row('R4');
const addedWithMarkers=plan([header,sourceRow,{},laterSource],[header,sourceRow,markedNew],[header],20,20);
assert.equal(addedWithMarkers.conflict.length,0);
assert.equal(addedWithMarkers.records[0].operation,'mirror-insert');
verify(addedWithMarkers);

const sourceNearOldLimit=Array.from({length:747},()=>({}));
sourceNearOldLimit[0]=header;sourceNearOldLimit[746]=sourceRow;
const addedAfterOldLimit=plan(sourceNearOldLimit,[header,sourceRow,newRow],[header],1125,1125);
assert.equal(addedAfterOldLimit.sourceRequests[0].updateCells.range.startRowIndex,747);

const sourceWithPartialRow=[header,sourceRow,{values:[value('rascunho')]}];
const addedAfterPartialRow=plan(sourceWithPartialRow,[header,sourceRow,newRow],[header],20,20);
assert.equal(addedAfterPartialRow.sourceRequests[0].updateCells.range.startRowIndex,3);

const copiedToMirror=plan([header,sourceRow,newRow],[header,mirrorRow],[header],20,20);
const mirrorInsert=copiedToMirror.mirrorRequests.find(request=>request.updateCells?.range?.startColumnIndex===0&&request.updateCells?.range?.endColumnIndex===25);
assert.equal(mirrorInsert.updateCells.fields,'userEnteredValue,userEnteredFormat.numberFormat');
for(const columnIndex of [0,6,7]) {
  assert.deepEqual(mirrorInsert.updateCells.rows[0].values[columnIndex].userEnteredFormat.numberFormat,{type:'DATE',pattern:'dd/mm/yyyy'});
}
assert.ok(!copiedToMirror.mirrorRequests.some(request=>request.copyPaste?.pasteType==='PASTE_DATA_VALIDATION'));
console.log('sales editor sync planner: ok');
