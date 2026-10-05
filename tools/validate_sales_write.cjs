// CLI preflight for current sales records and exact write requests.
const fs = require('node:fs');
const { validate } = require('../lib/sales-write-validator.cjs');
try {
  if (!process.argv[2]) throw new Error('Informe o caminho do plano JSON.');
  const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(validate(plan)));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
