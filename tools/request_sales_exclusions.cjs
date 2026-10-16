// Administrative equivalent of selecting the dropdown. Input identifies exact observed sales.
const fs=require('node:fs');
const path=require('node:path');
const sync=require('../lib/sales-editor-sync.cjs');
const ex=require('../lib/sales-exclusions.cjs');
const {validate}=require('../lib/sales-write-validator.cjs');
async function main(){
  const filename=process.argv[2];if(!filename)throw new Error('Informe JSON com vendas autorizadas.');
  const selected=JSON.parse(fs.readFileSync(filename,'utf8'));
  const bearer=await sync.accessToken(),sourceId='1Tcy3kerwSt8yrYTmQorAsHM4mUBQUKFGKcl1BLi4LW0';
  const read=()=>Promise.all([sync.sheetsGet(sourceId,'Lancamento_Vendas!A1:AD',bearer),sync.sheetsGet(sourceId,"'teste lancamento_vendas'!A1:C",bearer)]);
  const [source,channels]=await read();
  const records=selected.records.map(record=>{
    const matches=ex.rows(source.grid).filter(x=>String(ex.value(x.row[1]))===record.codigo&&ex.value(x.row[2])===record.hotel);
    if(matches.length!==1)throw new Error(`Reserva ausente ou ambigua: ${record.codigo}`);
    return {...record,rowNumber:matches[0].rowNumber};
  });
  const requests=records.map(record=>ex.update(ex.SOURCE_SHEET_ID,record.rowNumber,25,[ex.textCell(ex.ACTION)]));
  const plan={operation:'seller-exclusion-request',userAuthorized:true,evidence:selected.evidence,sourceGrid:source.grid,channelGrid:channels.grid,records,requests};
  const file=path.resolve(__dirname,`../data/sales-exclusion-requests-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(file,JSON.stringify(plan));
  const result=validate(plan);
  if(process.argv.includes('--apply')){
    const fresh=await read();
    if(JSON.stringify(fresh.map(x=>x.grid))!==JSON.stringify([source.grid,channels.grid]))throw new Error('Leitura mudou; nenhuma solicitacao gravada.');
    await sync.sheetsWrite(sourceId,requests,bearer);
  }
  console.log(JSON.stringify({applied:process.argv.includes('--apply'),validated:result,plan:file,records:records.map(r=>({codigo:r.codigo,rowNumber:r.rowNumber}))}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
