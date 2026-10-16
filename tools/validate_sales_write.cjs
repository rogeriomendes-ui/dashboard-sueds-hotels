// CLI preflight for current sales records and exact write requests.
const fs = require('node:fs');
const { validate } = require('../lib/sales-write-validator.cjs');
async function main() {
  for(const file of ['.env','.env.local']) {
    const location=require('node:path').resolve(__dirname,'..',file);
    if(!fs.existsSync(location))continue;
    for(const line of fs.readFileSync(location,'utf8').split(/\r?\n/)) {
      const m=line.match(/^([A-Za-z_][A-Za-z_0-9]*)=(.*)$/);if(!m||process.env[m[1]])continue;
      let v=m[2].trim();if(/^(['"]).*\1$/.test(v))v=v.slice(1,-1);process.env[m[1]]=v;
    }
  }
  if (!process.argv[2]) throw new Error('Informe o caminho do plano JSON.');
  const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if(!['seller-exclusion-control','seller-exclusion-request'].includes(plan.operation))plan.existingExclusions=await require('../lib/sales-exclusions-client.cjs').load();
  console.log(JSON.stringify(validate(plan)));
}
main().catch(error=>{
  console.error(error.message);
  process.exitCode = 1;
});
