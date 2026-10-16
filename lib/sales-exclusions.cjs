// Persistent seller deletion protocol. The archive is committed before either copy is cleared.
const crypto = require('node:crypto');
const routing = require('./sales-routing');
const SOURCE_SHEET_ID = 1945937754;
const MIRROR_SHEET_ID = 682229965;
const ARCHIVE_SHEET_ID = 1874602901;
const ARCHIVE_TITLE = 'Exclusoes_Lancamentos';
const ACTION = 'Excluir lançamento';
const ACTION_COL = 25, ID_COL = 28, STATE_COL = 29;
const HEADERS = ['ID lançamento','Código reserva','Hotel','Cliente','Solicitado em UTC','Origem','Dados principal','Dados vendedores','Situação'];
const value = cell => cell?.userEnteredValue?.stringValue ?? cell?.userEnteredValue?.numberValue ?? '';
const businessKey = row => `${routing.key(value(row[1]))}|${routing.key(value(row[2]))}`;
const isSale = row => Boolean(value(row[1]) && value(row[2]));
const idOf = row => String(value(row[ID_COL]));
const update = (sheetId,rowNumber,col,values,fields='userEnteredValue') => ({updateCells:{range:{sheetId,startRowIndex:rowNumber-1,endRowIndex:rowNumber,startColumnIndex:col,endColumnIndex:col+values.length},rows:[{values}],fields}});
const textCell = stringValue => ({userEnteredValue:{stringValue:String(stringValue)}});
function parseArchive(grid) {
  if (HEADERS.some((header,i)=>value(grid[0]?.values?.[i])!==header)) throw new Error('Registro de exclusoes ausente ou com cabecalho invalido.');
  const entries=[];
  for(let i=1;i<grid.length;i++) {
    const row=grid[i]?.values||[];
    if(!row.some(cell=>value(cell)!==''))continue;
    const [id,codigo,hotel,cliente,at,origin,sourceJSON,mirrorJSON,state]=row.map(value);
    if(!/^sl_[a-f0-9]{32}$/.test(id)||!codigo||!hotel||!at||!['Registrada','Concluída'].includes(state)) throw new Error(`Registro de exclusao invalido na linha ${i+1}.`);
    for(const json of [sourceJSON,mirrorJSON]) if(!Array.isArray(JSON.parse(json)))throw new Error('Arquivo de recuperacao invalido.');
    entries.push({id,codigo:String(codigo),hotel:String(hotel),cliente,at,origin,sourceJSON,mirrorJSON,state,rowNumber:i+1,key:`${routing.key(codigo)}|${routing.key(hotel)}`});
  }
  return entries;
}
function rows(grid) {
  return grid.map((entry,i)=>({row:entry?.values||[],rowNumber:i+1})).filter(x=>x.rowNumber>1&&isSale(x.row));
}
function prepare(sourceGrid,mirrorGrid,archiveGrid,at) {
  const entries=parseArchive(archiveGrid), deletedIds=new Set(entries.map(x=>x.id)), deletedKeys=new Set(entries.map(x=>x.key));
  const source=rows(sourceGrid),mirror=rows(mirrorGrid);
  const sourceRequests=[],mirrorRequests=[],newEntries=[];
  // Existing IDs survive row moves and reservation-code corrections. Only initial pairs use occurrence.
  const keyed = list => {
    const counts=new Map(), result=new Map();
    for(const item of list) {const key=businessKey(item.row),n=(counts.get(key)||0)+1;counts.set(key,n);item.pair=`${key}#${n}`;result.set(item.pair,item);}
    return {counts,result};
  };
  const sg=keyed(source),mg=keyed(mirror);
  for(const [key,n] of sg.counts) if(n>1&&mg.counts.has(key)&&mg.counts.get(key)!==n) throw new Error(`Quantidade de duplicatas divergente; conferir antes de vincular: ${key}`);
  for(const [key,n] of mg.counts) if(n>1&&sg.counts.has(key)&&sg.counts.get(key)!==n) throw new Error(`Quantidade de duplicatas divergente; conferir antes de vincular: ${key}`);
  for(const [list,other] of [[source,mg.result],[mirror,sg.result]]) {
    const ids=new Set();
    for(const item of list) {
      const stored=idOf(item.row), partner=other.get(item.pair);
      item.blocked=!stored&&deletedKeys.has(businessKey(item.row));
      item.id=stored||idOf(partner?.row||[])||`sl_${crypto.createHash('sha256').update(item.pair).digest('hex').slice(0,32)}`;
      if(!/^sl_[a-f0-9]{32}$/.test(item.id)||ids.has(item.id)) throw new Error('ID de lancamento invalido ou duplicado.');
      ids.add(item.id);
    }
  }
  const byId = list => new Map(list.map(x=>[x.id,x]));
  const sm=byId(source),mm=byId(mirror);
  for(const item of [...source,...mirror]) {
    const action=value(item.row[ACTION_COL]);
    if(action&&action!==ACTION)throw new Error(`Acao de lancamento invalida na linha ${item.rowNumber}.`);
    if(action!==ACTION||deletedIds.has(item.id))continue;
    const s=sm.get(item.id),m=mm.get(item.id);
    if(s&&m&&businessKey(s.row)!==businessKey(m.row))throw new Error('Reserva alterada nas duas planilhas; exclusao bloqueada para conferencia.');
    const entry={id:item.id,codigo:String(value(item.row[1])),hotel:String(value(item.row[2])),cliente:String(value(item.row[5])),at,origin:'Ação Excluir lançamento',sourceJSON:JSON.stringify(s?.row||[]),mirrorJSON:JSON.stringify(m?.row||[]),state:'Registrada',key:businessKey(item.row)};
    newEntries.push(entry);deletedIds.add(item.id);deletedKeys.add(entry.key);
  }
  const clears=[];
  for(const [list,sheetId,requests] of [[source,SOURCE_SHEET_ID,sourceRequests],[mirror,MIRROR_SHEET_ID,mirrorRequests]]) {
    for(const item of list) {
      const remove=deletedIds.has(item.id)||item.blocked;
      if(remove) {
        const archived=entries.find(e=>e.id===item.id);
        if(archived&&archived.key!==businessKey(item.row))throw new Error('ID excluido reutilizado com outra reserva; limpeza bloqueada.');
        requests.push(update(sheetId,item.rowNumber,0,Array.from({length:26},()=>({})),'userEnteredValue,note'));
        requests.push(update(sheetId,item.rowNumber,ID_COL,[{},textCell('Excluído')]));
        clears.push({sheetId,rowNumber:item.rowNumber,id:item.id,codigo:String(value(item.row[1])),hotel:String(value(item.row[2]))});
      } else {
        const formula=`=IF(Z${item.rowNumber}="${ACTION}";"Exclusão pendente";"Ativo")`;
        if(idOf(item.row)!==item.id) requests.push(update(sheetId,item.rowNumber,ID_COL,[textCell(item.id)]));
        if(item.row[STATE_COL]?.userEnteredValue?.formulaValue!==formula) requests.push(update(sheetId,item.rowNumber,STATE_COL,[{userEnteredValue:{formulaValue:formula}}]));
      }
    }
  }
  const archiveRequests=newEntries.length?[{appendCells:{sheetId:ARCHIVE_SHEET_ID,rows:newEntries.map(e=>({values:[e.id,e.codigo,e.hotel,e.cliente,e.at,e.origin,e.sourceJSON,e.mirrorJSON,e.state].map(textCell)})),fields:'userEnteredValue'}}]:[];
  return {sourceRequests,mirrorRequests,archiveRequests,clears,newEntries};
}
function validateControl(input) {
  const expected=prepare(input.sourceGrid,input.mirrorGrid,input.archiveGrid,input.at);
  for(const field of ['sourceRequests','mirrorRequests','archiveRequests','clears','newEntries']) if(JSON.stringify(input[field])!==JSON.stringify(expected[field]))throw new Error(`Plano de exclusoes diverge dos requests validados: ${field}`);
  return {validated:true,exclusions:expected.newEntries.length,clearedRows:expected.clears.length};
}
function isExcluded(record,entries) {
  const key=`${routing.key(record.codigo||record.reservationCode)}|${routing.key(record.hotel)}`;
  return entries.some(e=>(e.key||`${routing.key(e.codigo)}|${routing.key(e.hotel)}`)===key);
}
function guardRecord(record,entries) {
  if(isExcluded(record,entries))throw new Error(`Lancamento excluido; reinclusao bloqueada: ${record.codigo||record.reservationCode}`);
}
module.exports={SOURCE_SHEET_ID,MIRROR_SHEET_ID,ARCHIVE_SHEET_ID,ARCHIVE_TITLE,ACTION,ACTION_COL,ID_COL,STATE_COL,HEADERS,value,businessKey,idOf,rows,parseArchive,prepare,validateControl,guardRecord,isExcluded,update,textCell};
