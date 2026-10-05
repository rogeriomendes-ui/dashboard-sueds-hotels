const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const routing = require('./sales-routing');
const { validate } = require('./sales-write-validator.cjs');

const SOURCE_ID = '1Tcy3kerwSt8yrYTmQorAsHM4mUBQUKFGKcl1BLi4LW0';
const MIRROR_ID = '1RsHiv3mv6gfAiGCLKNFXLcoOiE8GdOj8lDjEgf6Ete0';
const SOURCE_SHEET_ID = 1945937754;
const MIRROR_SHEET_ID = 682229965;
const MIRROR_PROTECTION_ID = 709064888;
const EDIT_COLUMNS = [13, 17, 19];
const MARKER = 'SUEDS_SYNC_V1:';

function scalar(value) {
  if (!value) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'formulaValue')) return {formulaValue:value.formulaValue};
  for (const key of ['stringValue','numberValue','boolValue']) if (Object.prototype.hasOwnProperty.call(value,key)) return {[key]:value[key]};
  return null;
}
function same(a,b) { return JSON.stringify(scalar(a)) === JSON.stringify(scalar(b)); }
function displayed(cell) { return String(cell?.formattedValue ?? cell?.userEnteredValue?.stringValue ?? '').trim(); }
function rowCells(grid,index) { return grid[index]?.values || []; }
function cellValue(row,index) { return scalar(row[index]?.userEnteredValue); }
function hasUserContent(row) { return row.some((cell,index)=>{
  const value=scalar(cell?.userEnteredValue);
  if(!value||[8,14].includes(index))return false;
  if([15,17].includes(index)&&value.stringValue==='Selecione')return false;
  return value.stringValue!=='';
}); }
function key(row) { const code=displayed(row[1]),hotel=displayed(row[2]); return code&&hotel ? `${routing.key(code)}|${routing.key(hotel)}` : ''; }
function baseline(value) { return MARKER + JSON.stringify(scalar(value)); }
function readBaseline(note) {
  if (!note?.startsWith(MARKER)) return undefined;
  try { return JSON.parse(note.slice(MARKER.length)); } catch { return undefined; }
}
function record(row,rowNumber) {
  return {rowNumber,codigo:displayed(row[1]),hotel:displayed(row[2]),dataVenda:displayed(row[0]),canal:displayed(row[3]),vendedor:displayed(row[4]),fonte:displayed(row[18]),formaPagamento:displayed(row[15]),status:displayed(row[17]),recebido:cellValue(row,13),observacoes:cellValue(row,19)};
}
function indexRows(grid) {
  const map=new Map(), counts=new Map(); let lastUsed=1;
  for (let i=1;i<grid.length;i++) {
    const row=rowCells(grid,i), id=key(row);
    if (!id) continue;
    const occurrence=(counts.get(id)||0)+1;counts.set(id,occurrence);
    map.set(`${id}#${occurrence}`,{row,rowNumber:i+1}); lastUsed=i+1;
  }
  return {map,counts,lastUsed};
}
function updateCell(sheetId,rowNumber,columnIndex,value,fields='userEnteredValue',note) {
  const data={};
  if (fields.includes('userEnteredValue') && value) data.userEnteredValue=scalar(value);
  if (fields.includes('note')) data.note=note || '';
  return {updateCells:{range:{sheetId,startRowIndex:rowNumber-1,endRowIndex:rowNumber,startColumnIndex:columnIndex,endColumnIndex:columnIndex+1},rows:[{values:[data]}],fields}};
}
function groupNotes(noteEdits) {
  const requests=[];
  for (const col of EDIT_COLUMNS) {
    const items=noteEdits.filter(x=>x.columnIndex===col).sort((a,b)=>a.rowNumber-b.rowNumber);
    for (let i=0;i<items.length;) {
      let end=i+1;
      while(end<items.length&&items[end].rowNumber===items[end-1].rowNumber+1)end++;
      requests.push({updateCells:{range:{sheetId:MIRROR_SHEET_ID,startRowIndex:items[i].rowNumber-1,endRowIndex:items[end-1].rowNumber,startColumnIndex:col,endColumnIndex:col+1},rows:items.slice(i,end).map(x=>({values:[{note:x.note}]})),fields:'note'}});
      i=end;
    }
  }
  return requests;
}
function protectionRequest(mirrorGrid,sourceGrid,rowCount) {
  const sourceKeys=new Set();
  for(let i=1;i<sourceGrid.length;i++){const id=key(rowCells(sourceGrid,i));if(id)sourceKeys.add(id);}
  const unprotectedRanges=EDIT_COLUMNS.map(col=>({sheetId:MIRROR_SHEET_ID,startRowIndex:1,endRowIndex:rowCount,startColumnIndex:col,endColumnIndex:col+1}));
  let start=null;
  for(let i=1;i<=rowCount;i++) {
    const id=i<rowCount?key(rowCells(mirrorGrid,i)):'';
    const open=!id||!sourceKeys.has(id);
    if(open&&start===null)start=i;
    if((!open||i===rowCount)&&start!==null) {
      const end=i;
      if(end>start)unprotectedRanges.push({sheetId:MIRROR_SHEET_ID,startRowIndex:start,endRowIndex:end,startColumnIndex:0,endColumnIndex:25});
      start=null;
    }
  }
  return {updateProtectedRange:{protectedRange:{protectedRangeId:MIRROR_PROTECTION_ID,unprotectedRanges},fields:'unprotectedRanges'}};
}
function makeInsertValues(row,targetRow) {
  const values=[];
  for(let col=0;col<25;col++) {
    if(col===8) {values.push({formulaValue:`=IF(OR(G${targetRow}="";H${targetRow}="");"";H${targetRow}-G${targetRow})`});continue;}
    if(col===14) {values.push({formulaValue:`=IF(M${targetRow}="";"";M${targetRow}-N${targetRow})`});continue;}
    const value=cellValue(row,col);
    if(value?.formulaValue) throw new Error(`Formula de usuario bloqueada na coluna ${col+1}`);
    values.push(value);
  }
  return values;
}
function plan(sourceGrid,mirrorGrid,channelGrid,sourceRowCount,mirrorRowCount) {
  const source=indexRows(sourceGrid), mirror=indexRows(mirrorGrid);
  const channelKeys=new Set();
  const existingChannels=[];
  for(let i=1;i<channelGrid.length;i++) {
    const row=rowCells(channelGrid,i), id=key(row);
    if(id) {channelKeys.add(id);existingChannels.push(record(row,i+1));}
  }
  const existingSellers=Array.from(source.map.values(),x=>record(x.row,x.rowNumber));
  const records=[],sourceRequests=[],mirrorRequests=[],noteEdits=[];
  const conflict=[];
  for(const [id,count] of source.counts) {
    const mirrorCount=mirror.counts.get(id)||0;
    if(count>1 && mirrorCount && count!==mirrorCount) conflict.push({reason:'duplicate_count_changed',id});
  }
  let nextSource=source.lastUsed+1, nextMirror=mirror.lastUsed+1;
  for(const [id,m] of mirror.map) {
    const s=source.map.get(id);
    if(!s) {
      const tracked=EDIT_COLUMNS.some(col=>readBaseline(m.row[col]?.note)!==undefined);
      if(tracked || channelKeys.has(key(m.row))) {
        conflict.push({row:m.rowNumber,reason:tracked?'deleted_in_source':'already_in_channel_tab',code:displayed(m.row[1])});
        continue;
      }
      if(m.rowNumber<=source.lastUsed) { conflict.push({row:m.rowNumber,reason:'untracked_existing_row'});continue; }
      if(nextSource>sourceRowCount || nextSource>747) throw new Error('Sem linhas preparadas para novas vendas na planilha principal.');
      if(hasUserContent(rowCells(sourceGrid,nextSource-1))) throw new Error(`Linha ${nextSource} da planilha principal contém dados parciais; inclusão bloqueada.`);
      const raw=makeInsertValues(m.row,nextSource), candidate=record(m.row,nextSource);
      records.push({...candidate,operation:'mirror-insert',targetSheet:routing.SELLERS_SHEET,evidence:`Espelho: linha ${m.rowNumber}`,cellValues:raw});
      sourceRequests.push({updateCells:{range:{sheetId:SOURCE_SHEET_ID,startRowIndex:nextSource-1,endRowIndex:nextSource,startColumnIndex:0,endColumnIndex:25},rows:[{values:raw.map(v=>v?{userEnteredValue:v}:{})}],fields:'userEnteredValue'}});
      for(const col of EDIT_COLUMNS)noteEdits.push({rowNumber:m.rowNumber,columnIndex:col,note:baseline(cellValue(m.row,col))});
      nextSource++;
      continue;
    }
    for(const col of EDIT_COLUMNS) {
      const mv=cellValue(m.row,col), sv=cellValue(s.row,col), base=readBaseline(m.row[col]?.note);
      if(base===undefined) {
        if(!same(mv,sv)) {conflict.push({row:m.rowNumber,reason:'untracked_difference',column:col+1});continue;}
        noteEdits.push({rowNumber:m.rowNumber,columnIndex:col,note:baseline(sv)});
        continue;
      }
      const mirrorChanged=!same(mv,base), sourceChanged=!same(sv,base);
      if(mirrorChanged&&sourceChanged&&!same(mv,sv)) {conflict.push({row:m.rowNumber,reason:'concurrent_edit',column:col+1});continue;}
      if(mirrorChanged&&!same(mv,sv)) {
        const r=record(s.row,s.rowNumber);
        if(col===17) {
          records.push({...r,operation:'status-update',targetSheet:routing.SELLERS_SHEET,previousStatus:r.status,status:displayed(m.row[col]),evidence:`Espelho: linha ${m.rowNumber}`});
        } else {
          records.push({...r,operation:'mirror-field-update',targetSheet:routing.SELLERS_SHEET,columnIndex:col,previousValue:sv,newValue:mv,evidence:`Espelho: linha ${m.rowNumber}`});
        }
        sourceRequests.push(updateCell(SOURCE_SHEET_ID,s.rowNumber,col,mv));
        noteEdits.push({rowNumber:m.rowNumber,columnIndex:col,note:baseline(mv)});
      } else if(sourceChanged) {
        mirrorRequests.push(updateCell(MIRROR_SHEET_ID,m.rowNumber,col,sv));
        noteEdits.push({rowNumber:m.rowNumber,columnIndex:col,note:baseline(sv)});
      } else if(mirrorChanged) {
        // A previous source write succeeded but the note update did not.
        noteEdits.push({rowNumber:m.rowNumber,columnIndex:col,note:baseline(mv)});
      }
    }
    for(let col=0;col<25;col++) {
      if(EDIT_COLUMNS.includes(col))continue;
      const sv=cellValue(s.row,col), mv=cellValue(m.row,col);
      const desired=(col===8||col===14)&&sv?.formulaValue ? {formulaValue:sv.formulaValue.replace(/([A-Z]+)\d+/g,(_,letter)=>letter+m.rowNumber)} : sv;
      if(!same(mv,desired))mirrorRequests.push(updateCell(MIRROR_SHEET_ID,m.rowNumber,col,desired));
    }
  }
  for(const [id,s] of source.map) {
    if(mirror.map.has(id))continue;
    // External rows accidentally restored to the seller tab must not reach editors.
    const r=record(s.row,s.rowNumber);
    if(/^(be mobile|be mobille|booking engine|book engine)$/.test(routing.key(r.canal))&&!routing.key(r.vendedor))continue;
    if(routing.month(r.dataVenda)>=routing.CUTOVER && (!routing.key(r.vendedor)||routing.isRobot(r.canal,r.vendedor)))continue;
    if(nextMirror>mirrorRowCount)throw new Error('Sem linhas livres no espelho.');
    if(hasUserContent(rowCells(mirrorGrid,nextMirror-1))) throw new Error(`Linha ${nextMirror} do espelho contém dados parciais; cópia bloqueada.`);
    const values=makeInsertValues(s.row,nextMirror);
    mirrorRequests.push({updateCells:{range:{sheetId:MIRROR_SHEET_ID,startRowIndex:nextMirror-1,endRowIndex:nextMirror,startColumnIndex:0,endColumnIndex:25},rows:[{values:values.map(v=>v?{userEnteredValue:v}:{})}],fields:'userEnteredValue'}});
    for(const col of EDIT_COLUMNS)noteEdits.push({rowNumber:nextMirror,columnIndex:col,note:baseline(cellValue(s.row,col))});
    nextMirror++;
  }
  return {records,existingSellers,existingChannels,sourceRequests,mirrorRequests:mirrorRequests.concat(groupNotes(noteEdits)),conflict,counts:{source:source.map.size,mirror:mirror.map.size,notes:noteEdits.length}};
}

function credentials() {
  if(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if(process.env.GOOGLE_APPLICATION_CREDENTIALS)return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));
  return {client_email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,private_key:(process.env.GOOGLE_PRIVATE_KEY||'').replace(/\\n/g,'\n')};
}
async function accessToken() {
  const account=credentials();if(!account.client_email||!account.private_key)throw new Error('Conta de serviço Google não configurada.');
  const now=Math.floor(Date.now()/1000), b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const unsigned=`${b64({alg:'RS256',typ:'JWT'})}.${b64({iss:account.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
  const signature=crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${signature}`})});
  if(!response.ok)throw new Error(`Google OAuth: ${response.status}`);
  return (await response.json()).access_token;
}
async function sheetsGet(id,range,bearer) {
  const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${id}`);
  url.searchParams.append('ranges',range);url.searchParams.set('includeGridData','true');
  url.searchParams.set('fields','sheets(properties(gridProperties(rowCount,columnCount)),data(rowData(values(userEnteredValue,formattedValue,note))))');
  const response=await fetch(url,{headers:{authorization:`Bearer ${bearer}`}});
  if(!response.ok)throw new Error(`Sheets read ${id}: ${response.status} ${await response.text()}`);
  const sheet=(await response.json()).sheets?.[0];
  return {grid:sheet?.data?.[0]?.rowData||[],rowCount:sheet?.properties?.gridProperties?.rowCount||0};
}
async function sheetsWrite(id,requests,bearer) {
  for(let i=0;i<requests.length;i+=400) {
    const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`,{method:'POST',headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json'},body:JSON.stringify({requests:requests.slice(i,i+400)})});
    if(!response.ok)throw new Error(`Sheets write ${id}: ${response.status} ${await response.text()}`);
  }
}
async function run({apply=false}={}) {
  const bearer=await accessToken();
  const [source,mirror,channels]=await Promise.all([
    sheetsGet(SOURCE_ID,'Lancamento_Vendas!A1:Y1125',bearer),
    sheetsGet(MIRROR_ID,'Lancamento_Vendas!A1:Y1125',bearer),
    sheetsGet(SOURCE_ID,"'teste lancamento_vendas'!A1:C13472",bearer)
  ]);
  const p=plan(source.grid,mirror.grid,channels.grid,source.rowCount,mirror.rowCount);
  for(const row of mirror.grid) for(const cell of row.values||[]) {
    const formula=cell.userEnteredValue?.formulaValue||'';
    if(/IMPORTRANGE\s*\(/i.test(formula)||formula.includes(SOURCE_ID))throw new Error('Formula externa encontrada no espelho; acesso de editores bloqueado.');
  }
  if(p.conflict.length)throw new Error(`Conflitos pendentes; nenhuma gravação: ${JSON.stringify(p.conflict.slice(0,20))}`);
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const root=path.resolve(__dirname,'..');
  const folder=process.env.VERCEL ? os.tmpdir() : path.join(root,'data');
  const location=path.join(folder,`sales-editor-sync-${stamp}.json`);
  fs.writeFileSync(location,JSON.stringify({spreadsheetId:SOURCE_ID,mirrorSpreadsheetId:MIRROR_ID,readRangeSellers:'Lancamento_Vendas!A1:Y1125',readRangeChannels:"'teste lancamento_vendas'!A1:C13472",records:p.records,existingSellers:p.existingSellers,existingChannels:p.existingChannels,requests:p.sourceRequests}));
  // Validate the exact saved plan with the same logic used by the CLI preflight.
  const checked=validate(JSON.parse(fs.readFileSync(location,'utf8')));
  if(apply) {
    // Source is always written first; mirror baseline advances only on success.
    if(p.sourceRequests.length)await sheetsWrite(SOURCE_ID,p.sourceRequests,bearer);
    if(p.mirrorRequests.length)await sheetsWrite(MIRROR_ID,p.mirrorRequests,bearer);
    if(p.records.some(r=>r.operation==='mirror-insert')||p.mirrorRequests.some(r=>r.updateCells?.range?.startColumnIndex===0&&r.updateCells?.range?.endColumnIndex===25)) {
      const [freshSource,freshMirror]=await Promise.all([
        sheetsGet(SOURCE_ID,'Lancamento_Vendas!A1:C1125',bearer),
        sheetsGet(MIRROR_ID,'Lancamento_Vendas!A1:C1125',bearer)
      ]);
      await sheetsWrite(MIRROR_ID,[protectionRequest(freshMirror.grid,freshSource.grid,mirror.rowCount)],bearer);
    }
  }
  return {applied:apply,validated:checked,sourceWrites:p.sourceRequests.length,mirrorWrites:p.mirrorRequests.length,counts:p.counts,plan:location};
}

module.exports={plan,run,readBaseline,baseline};
