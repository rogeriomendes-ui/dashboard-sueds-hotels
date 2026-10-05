const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const file of ['.env','.env.local']) {
  const location=path.join(root,file);if(!fs.existsSync(location))continue;
  for(const line of fs.readFileSync(location,'utf8').split(/\r?\n/)) {
    const match=line.match(/^([A-Za-z_][A-Za-z_0-9]*)=(.*)$/);if(!match||process.env[match[1]])continue;
    let value=match[2].trim();if(/^(['"]).*\1$/.test(value))value=value.slice(1,-1);
    process.env[match[1]]=value;
  }
}
require('../lib/sales-editor-sync.cjs').run({apply:process.argv.includes('--apply')})
  .then(result=>console.log(JSON.stringify(result)))
  .catch(error=>{console.error(error.message);process.exitCode=1;});
