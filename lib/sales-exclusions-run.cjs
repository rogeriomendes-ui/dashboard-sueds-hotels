const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const ex=require('./sales-exclusions.cjs');
const SOURCE_ID='1Tcy3kerwSt8yrYTmQorAsHM4mUBQUKFGKcl1BLi4LW0';
const MIRROR_ID='1RsHiv3mv6gfAiGCLKNFXLcoOiE8GdOj8lDjEgf6Ete0';
async function run({apply,bearer,sheetsGet,sheetsWrite}) {
  const read=()=>Promise.all([
    sheetsGet(SOURCE_ID,'Lancamento_Vendas!A1:AD',bearer),
    sheetsGet(MIRROR_ID,'Lancamento_Vendas!A1:AD',bearer),
    sheetsGet(SOURCE_ID,`${ex.ARCHIVE_TITLE}!A1:I`,bearer),
    sheetsGet(SOURCE_ID,"'teste lancamento_vendas'!A1:C",bearer)
  ]);
  const before=await read(),at=new Date().toISOString();
  const proposal=ex.prepare(before[0].grid,before[1].grid,before[2].grid,at);
  const writes=proposal.sourceRequests.length+proposal.mirrorRequests.length+proposal.archiveRequests.length;
  if(!writes&&!ex.parseArchive(before[2].grid).some(e=>e.state!=='Concluída'))return {writes:0,exclusions:0,clearedRows:0,plan:null,validated:{validated:true}};
  const audit={operation:'seller-exclusion-control',at,sourceGrid:before[0].grid,mirrorGrid:before[1].grid,archiveGrid:before[2].grid,channelGrid:before[3].grid,...proposal};
  const folder=process.env.VERCEL?os.tmpdir():path.resolve(__dirname,'../data');
  const location=path.join(folder,`sales-exclusions-${at.replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(location,JSON.stringify(audit));
  const validated=require('./sales-write-validator.cjs').validate(JSON.parse(fs.readFileSync(location,'utf8')));
  if(apply&&(writes||ex.parseArchive(before[2].grid).some(e=>e.state!=='Concluída'))) {
    const fresh=await read();
    if(JSON.stringify(fresh.map(x=>x.grid))!==JSON.stringify(before.map(x=>x.grid)))throw new Error('Planilhas mudaram durante a preparacao das exclusoes; nenhuma gravacao.');
    // Persist intent and full recovery data before any destructive request. Safe to retry after a crash.
    if(proposal.archiveRequests.length)await sheetsWrite(SOURCE_ID,proposal.archiveRequests,bearer);
    const saved=await sheetsGet(SOURCE_ID,`${ex.ARCHIVE_TITLE}!A1:I`,bearer);
    const savedEntries=ex.parseArchive(saved.grid);
    for(const entry of proposal.newEntries)if(!savedEntries.some(x=>x.id===entry.id&&x.sourceJSON===entry.sourceJSON&&x.mirrorJSON===entry.mirrorJSON))throw new Error('Arquivo de recuperacao nao confirmado; exclusao interrompida.');
    if(proposal.sourceRequests.length)await sheetsWrite(SOURCE_ID,proposal.sourceRequests,bearer);
    if(proposal.mirrorRequests.length)await sheetsWrite(MIRROR_ID,proposal.mirrorRequests,bearer);
    const after=await read();
    const pending=ex.prepare(after[0].grid,after[1].grid,after[2].grid,at);
    if(pending.clears.length||pending.newEntries.length)throw new Error('Exclusao registrada mas ainda pendente; proxima execucao retomara.');
    const entries=ex.parseArchive(after[2].grid);
    const complete=entries.filter(e=>e.state!=='Concluída').map(e=>ex.update(ex.ARCHIVE_SHEET_ID,e.rowNumber,8,[ex.textCell('Concluída')]));
    if(complete.length)await sheetsWrite(SOURCE_ID,complete,bearer);
    fs.writeFileSync(location.replace('.json','-verification.json'),JSON.stringify({verified:true,clearedRows:proposal.clears,completed:complete.length,remainingDeletes:pending.clears.length}));
  }
  return {writes,exclusions:proposal.newEntries.length,clearedRows:proposal.clears.length,plan:location,validated};
}
module.exports={run};
