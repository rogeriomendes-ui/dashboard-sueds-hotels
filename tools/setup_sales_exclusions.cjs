// Idempotent setup; refuses to overwrite occupied control columns or an unrelated archive.
const fs=require('node:fs');
const path=require('node:path');
const sync=require('../lib/sales-editor-sync.cjs');
const ex=require('../lib/sales-exclusions.cjs');
const apply=process.argv.includes('--apply');
const source='1Tcy3kerwSt8yrYTmQorAsHM4mUBQUKFGKcl1BLi4LW0',mirror='1RsHiv3mv6gfAiGCLKNFXLcoOiE8GdOj8lDjEgf6Ete0';
async function main(){
  const bearer=await sync.accessToken();
  const targets=[];
  for(const [id,sheetId] of [[source,ex.SOURCE_SHEET_ID],[mirror,ex.MIRROR_SHEET_ID]]){
    const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets(properties,protectedRanges)`,{headers:{authorization:`Bearer ${bearer}`}});
    if(!response.ok)throw new Error(`Metadata: ${response.status}`);
    const meta=await response.json(),sheet=meta.sheets.find(s=>s.properties.sheetId===sheetId);
    if(!sheet||sheet.properties.gridProperties.columnCount<30)throw new Error('Estrutura da planilha diverge.');
    const current=await sync.sheetsGet(id,'Lancamento_Vendas!A1:AD',bearer);
    const headers={25:'Ação do lançamento',28:'ID do lançamento',29:'Situação do lançamento'};
    for(const [col,title] of Object.entries(headers)){
      const existing=ex.value(current.grid[0]?.values?.[col]);
      if(existing&&existing!==title)throw new Error(`Coluna ${col} ocupada por outro cabecalho.`);
      if(!existing&&current.grid.slice(1).some(r=>r.values?.[col]?.userEnteredValue))throw new Error(`Coluna ${col} contem dados; setup bloqueado.`);
    }
    const n=sheet.properties.gridProperties.rowCount;
    const requests=[];
    for(const [col,title] of Object.entries(headers))requests.push(ex.update(sheetId,1,Number(col),[ex.textCell(title)]));
    requests.push({repeatCell:{range:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:25,endColumnIndex:26},cell:{note:'Escolha Excluir lançamento para retirar esta venda das duas planilhas. Os dados serão arquivados para recuperação. Não apague a linha diretamente.'},fields:'note'}});
    requests.push({setDataValidation:{filteredRowsIncluded:true,range:{sheetId,startRowIndex:1,endRowIndex:n,startColumnIndex:25,endColumnIndex:26},rule:{condition:{type:'ONE_OF_LIST',values:[{userEnteredValue:ex.ACTION}]},strict:true,showCustomUi:true,inputMessage:'A exclusão será registrada e aplicada às duas planilhas.'}}});
    for(const col of [25,28,29])requests.push({copyPaste:{source:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:24,endColumnIndex:25},destination:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:col,endColumnIndex:col+1},pasteType:'PASTE_FORMAT'}});
    for(const col of [25,28,29])requests.push({repeatCell:{range:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:col,endColumnIndex:col+1},cell:{userEnteredFormat:{textFormat:{foregroundColorStyle:{rgbColor:{red:0.1,green:0.1,blue:0.1}},bold:true}}},fields:'userEnteredFormat.textFormat.foregroundColorStyle,userEnteredFormat.textFormat.bold'}});
    for(const [col,width] of [[25,190],[29,220]])requests.push({updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:col,endIndex:col+1},properties:{pixelSize:width,hiddenByUser:false},fields:'pixelSize,hiddenByUser'}});
    requests.push({updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:28,endIndex:29},properties:{hiddenByUser:true},fields:'hiddenByUser'}});
    if(id===source){
      const archive=meta.sheets.find(s=>s.properties.title===ex.ARCHIVE_TITLE||s.properties.sheetId===ex.ARCHIVE_SHEET_ID);
      if(archive&&(archive.properties.title!==ex.ARCHIVE_TITLE||archive.properties.sheetId!==ex.ARCHIVE_SHEET_ID))throw new Error('Nome ou ID do arquivo de exclusoes ja utilizado.');
      if(!archive){
        requests.push({addSheet:{properties:{sheetId:ex.ARCHIVE_SHEET_ID,title:ex.ARCHIVE_TITLE,gridProperties:{rowCount:1000,columnCount:9,frozenRowCount:1}}}});
        requests.push(ex.update(ex.ARCHIVE_SHEET_ID,1,0,ex.HEADERS.map(ex.textCell)));
        requests.push({repeatCell:{range:{sheetId:ex.ARCHIVE_SHEET_ID,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{backgroundColor:{red:.9,green:.93,blue:.85},textFormat:{bold:true},wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}});
        requests.push({updateDimensionProperties:{range:{sheetId:ex.ARCHIVE_SHEET_ID,dimension:'COLUMNS',startIndex:0,endIndex:9},properties:{pixelSize:180},fields:'pixelSize'}});
        requests.push({updateDimensionProperties:{range:{sheetId:ex.ARCHIVE_SHEET_ID,dimension:'COLUMNS',startIndex:6,endIndex:8},properties:{hiddenByUser:true},fields:'hiddenByUser'}});
        const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
        const account=raw?JSON.parse(raw):process.env.GOOGLE_APPLICATION_CREDENTIALS?JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8')):{client_email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL};
        if(!account.client_email)throw new Error('Conta de servico ausente para proteger o arquivo.');
        requests.push({addProtectedRange:{protectedRange:{range:{sheetId:ex.ARCHIVE_SHEET_ID},description:'Histórico de exclusões — preservado pela sincronização',warningOnly:false,editors:{users:[account.client_email]}}}});
      }else ex.parseArchive((await sync.sheetsGet(source,`${ex.ARCHIVE_TITLE}!A1:I`,bearer)).grid);
    }
    targets.push({id,requests});
  }
  const file=path.resolve(__dirname,`../data/sales-exclusions-setup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(file,JSON.stringify({targets}));
  if(apply)for(const target of targets)await sync.sheetsWrite(target.id,target.requests,bearer);
  console.log(JSON.stringify({applied:apply,requests:targets.map(t=>({id:t.id,count:t.requests.length})),plan:file}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
