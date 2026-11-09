const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const routing=require('../lib/sales-routing');
const {buildContactPlan}=require('../lib/deskhotel-contacts.cjs');
const io=require('../lib/sales-editor-sync.cjs');
const ID='1Tcy3kerwSt8yrYTmQorAsHM4mUBQUKFGKcl1BLi4LW0';
function loadEnv() {
  for(const base of [path.resolve(__dirname,'..'),process.cwd()]) for(const name of ['.env','.env.local']) {
    const file=path.join(base,name);if(!fs.existsSync(file))continue;
    for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)) {
      const match=line.match(/^([A-Za-z_][A-Za-z_0-9]*)=(.*)$/);if(!match||process.env[match[1]])continue;
      let value=match[2].trim();if(/^(['"]).*\1$/.test(value))value=value.slice(1,-1);process.env[match[1]]=value;
    }
  }
}
async function readCurrent(token) {
  const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${ID}`);
  url.searchParams.append('ranges',"'Lancamento_Vendas'!A1:Y");
  url.searchParams.append('ranges',"'teste lancamento_vendas'!A1:Y");
  url.searchParams.set('includeGridData','true');
  url.searchParams.set('fields','sheets(properties(title),data(rowData(values(userEnteredValue,formattedValue))))');
  const response=await fetch(url,{headers:{authorization:`Bearer ${token}`}});
  if(!response.ok)throw Error(`Leitura de contatos falhou: ${response.status}`);
  const data=await response.json();
  const parse=title=>{
    const sheet=data.sheets?.find(s=>s.properties.title===title);if(!sheet)throw Error(`Aba ausente: ${title}`);
    const text=cell=>String(cell?.formattedValue??cell?.userEnteredValue?.stringValue??'').trim();
    return (sheet.data?.[0]?.rowData||[]).slice(1).map((row,i)=>{
      const r=row.values||[];
      return {rowNumber:i+2,dataVenda:text(r[0]),codigo:text(r[1]),hotel:text(r[2]),canal:text(r[3]),vendedor:text(r[4]),formaPagamento:text(r[15]),status:text(r[17]),fonte:text(r[18]),telefone:text(r[21]),email:text(r[22]),contactCells:{telefone:r[21]?.userEnteredValue??null,email:r[22]?.userEnteredValue??null}};
    }).filter(r=>r.codigo);
  };
  return {existingSellers:parse(routing.SELLERS_SHEET),existingChannels:parse(routing.CHANNELS_SHEET)};
}
async function main() {
  loadEnv();
  const input=process.argv.slice(2).find(arg=>!arg.startsWith('--'));if(!input)throw Error('Informe JSON com records: codigo, hotel, origin, telefone, email e evidence.');
  const captures=JSON.parse(fs.readFileSync(input,'utf8')).records;if(!Array.isArray(captures))throw Error('records ausente.');
  const token=await io.accessToken(),current=await readCurrent(token);
  const plan=buildContactPlan(captures,current.existingSellers,current.existingChannels);
  plan.createdAt=new Date().toISOString();
  const dir=path.join(process.cwd(),'data');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,`deskhotel-contacts-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(file,JSON.stringify(plan));
  const result=spawnSync(process.execPath,[path.join(__dirname,'validate_sales_write.cjs'),file],{env:process.env,cwd:process.cwd(),encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr||result.stdout);
  const apply=process.argv.includes('--apply');
  if(apply&&plan.requests.length) {
    const fresh=await readCurrent(token),checked=buildContactPlan(captures,fresh.existingSellers,fresh.existingChannels);
    if(JSON.stringify(checked.records)!==JSON.stringify(plan.records)||JSON.stringify(checked.requests)!==JSON.stringify(plan.requests))throw Error('Base mudou após validação; nenhuma escrita realizada.');
    await io.sheetsWrite(ID,plan.requests,token);
    const after=await readCurrent(token);
    for(const record of plan.records) {
      const rows=record.targetSheet===routing.SELLERS_SHEET?after.existingSellers:after.existingChannels;
      const row=rows.find(r=>r.codigo===record.codigo&&r.hotel===record.hotel&&r.rowNumber===record.rowNumber);
      const field=record.columnIndex===21?'telefone':'email';
      if(!row||row[field]!==record.newValue.stringValue)throw Error('Contato não confirmado após escrita.');
      if(['dataVenda','canal','vendedor','fonte','formaPagamento','status'].some(name=>row[name]!==record[name]))throw Error('Dados da venda mudaram durante a conferência.');
    }
    fs.writeFileSync(file.replace('.json','-verification.json'),JSON.stringify({verified:true,verifiedAt:new Date().toISOString(),cells:plan.records.map(r=>({codigo:r.codigo,sheet:r.targetSheet,row:r.rowNumber,field:r.columnIndex===21?'telefone':'email'}))}));
  }
  console.log(JSON.stringify({applied:apply,cells:plan.requests.length,pending:plan.pending,plan:file}));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={readCurrent};
