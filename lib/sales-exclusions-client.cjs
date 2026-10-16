const ex=require('./sales-exclusions.cjs');
async function load({bearer}={}) {
  const sync=require('./sales-editor-sync.cjs');
  const token=bearer||await sync.accessToken();
  const result=await sync.sheetsGet('1Tcy3kerwSt8yrYTmQorAsHM4mUBQUKFGKcl1BLi4LW0',`${ex.ARCHIVE_TITLE}!A1:I`,token);
  return ex.parseArchive(result.grid);
}
module.exports={load};
