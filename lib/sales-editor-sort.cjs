const SOURCE_ID=1945937754, MIRROR_ID=682229965;
function dateKey(cell) {
  const numeric=cell?.userEnteredValue?.numberValue;
  if(typeof numeric==='number'&&Number.isFinite(numeric))return Math.floor(numeric);
  const text=String(cell?.formattedValue??cell?.userEnteredValue?.stringValue??'').trim();
  const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if(!match)return Infinity;
  const [,day,month,year]=match.map(Number), date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return Infinity;
  return (date.getTime()-Date.UTC(1899,11,30))/86400000;
}
function occupied(row) {
  return [0,1,28].some(col=>{
    const value=row?.values?.[col]?.userEnteredValue;
    return value&&Object.values(value).some(v=>v!==''&&v!==null);
  });
}
function prepare(grid,sheetId) {
  if(![SOURCE_ID,MIRROR_ID].includes(sheetId))throw new Error('Aba de ordenacao invalida.');
  let end=grid.length;
  while(end>1&&!occupied(grid[end-1]))end--;
  const order=Array.from({length:Math.max(0,end-1)},(_,i)=>i+1);
  const sorted=order.slice().sort((a,b)=>{
    const occupiedA=occupied(grid[a]),occupiedB=occupied(grid[b]);
    if(occupiedA!==occupiedB)return occupiedA?-1:1;
    const da=dateKey(grid[a]?.values?.[0]),db=dateKey(grid[b]?.values?.[0]);
    return da===db?a-b:da<db?-1:1;
  });
  const requests=[];
  for(let target=0;target<sorted.length;target++) {
    const from=order.indexOf(sorted[target],target);
    if(from===target)continue;
    let length=1;
    while(from+length<order.length&&order[from+length]===sorted[target+length])length++;
    // Move the entire row: IDs, notes, validations and auxiliary columns travel
    // with the sale. Dates and historical values are never rewritten.
    requests.push({moveDimension:{source:{sheetId,dimension:'ROWS',startIndex:from+1,endIndex:from+length+1},destinationIndex:target+1}});
    order.splice(target,0,...order.splice(from,length));
    target+=length-1;
  }
  return {requests,order:sorted};
}
function validate(input) {
  if(!Array.isArray(input.sourceGrid)||!Array.isArray(input.mirrorGrid))throw new Error('Leituras atuais das duas planilhas obrigatorias para ordenar.');
  for(const [name,id] of [['source',SOURCE_ID],['mirror',MIRROR_ID]]) {
    if(JSON.stringify(prepare(input[name+'Grid'],id).requests)!==JSON.stringify(input[name+'Requests']))throw new Error('Requests de ordenacao divergem das leituras.');
  }
  return {validated:true,sortRequests:input.sourceRequests.length+input.mirrorRequests.length};
}
function verify(before,after,sheetId) {
  const {order}=prepare(before,sheetId);
  if(prepare(after,sheetId).requests.length)throw new Error('Ordenacao por Data Venda nao confirmada.');
  // Native row moves adjust formula references. Check the remaining cell values
  // and sync baselines exactly; formulas must remain formulas.
  const signature=row=>(row?.values||[]).map(cell=>({value:cell.userEnteredValue?.formulaValue?{formula:true}:cell.userEnteredValue??null,note:cell.note||''}));
  for(let index=0;index<order.length;index++) {
    const expected=signature(before[order[index]]),actual=signature(after[index+1]);
    while(expected.length&&expected.at(-1).value===null&&!expected.at(-1).note)expected.pop();
    while(actual.length&&actual.at(-1).value===null&&!actual.at(-1).note)actual.pop();
    if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error(`Venda ou ID alterado durante ordenacao: linha ${index+2}.`);
  }
  return true;
}
module.exports={prepare,validate,verify,dateKey};
