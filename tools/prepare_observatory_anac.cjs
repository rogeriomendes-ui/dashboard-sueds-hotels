// Converts an OFFICIAL ANAC basic-stage CSV locally; no network or database writes.
const fs = require('node:fs');
const readline = require('node:readline');
const { normalizeDataset } = require('../lib/observatory');

function csvLine(line) {
  const cells = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ';' && !quoted) { cells.push(value); value = ''; }
    else value += c;
  }
  if (quoted) throw new Error('Campo multilinha ou aspas incompletas: revise o arquivo oficial.');
  return [...cells, value];
}
const key = text => text.replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function integer(raw, optional = false) {
  if (!raw?.trim() && optional) return null;
  if (!/^\d+$/.test(raw?.trim() || '')) throw new Error(`Contagem ausente ou inválida: ${raw}`);
  return Number(raw);
}
async function convert(stream, { sourceUrl, retrievedAt, from, to }) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(from || '') || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(to || '') || from > to) throw new Error('Informe --from e --to em AAAA-MM.');
  let columns; let lineNumber = 0; const groups = new Map(); let examined = 0;
  for await (const line of readline.createInterface({ input: stream, crlfDelay: Infinity })) {
    lineNumber++;
    if (!line.trim()) continue;
    if (line.length > 100000) throw new Error(`Linha ${lineNumber} muito longa.`);
    if (!columns && /^Atualizado em:/i.test(line.replace(/^\uFEFF/, ''))) continue;
    const cells = csvLine(line);
    if (!columns) {
      columns = Object.fromEntries(cells.map((c, i) => [key(c), i]));
      const required = ['EMPRESASIGLA','ANO','MES','AEROPORTODEORIGEMSIGLA','AEROPORTODEDESTINOSIGLA','NATUREZA','GRUPODEVOO','PASSAGEIROSPAGOS','PASSAGEIROSGRATIS','DECOLAGENS','ASSENTOS'];
      if (required.some(c => columns[c] === undefined)) throw new Error('Cabeçalho incompatível. Use etapas básicas, CSV separado por ponto e vírgula, com codificação correta.');
      continue;
    }
    examined++;
    const get = name => cells[columns[name]]?.trim();
    const origin = get('AEROPORTODEORIGEMSIGLA'); const destination = get('AEROPORTODEDESTINOSIGLA');
    if (origin !== 'SBPS' && destination !== 'SBPS') continue;
    const period = `${get('ANO')}-${String(integer(get('MES'))).padStart(2, '0')}`;
    if (period < from || period > to) continue;
    const flightGroup = key(get('GRUPODEVOO') || '');
    if (!['REGULAR','NAOREGULAR','IMPRODUTIVA','IMPRODUTIVO'].includes(flightGroup)) throw new Error(`Grupo de voo desconhecido na linha ${lineNumber}.`);
    if (flightGroup.startsWith('IMPRODUTIV')) continue;
    const nature = key(get('NATUREZA') || '');
    if (!['DOMESTICA','DOMESTICO','INTERNACIONAL'].includes(nature)) throw new Error(`Natureza desconhecida na linha ${lineNumber}.`);
    const paid = integer(get('PASSAGEIROSPAGOS'), true); const free = integer(get('PASSAGEIROSGRATIS'), true);
    const row = { period, origin, destination, originName: get('AEROPORTODEORIGEMNOME') || origin, destinationName: get('AEROPORTODEDESTINONOME') || destination, airline: get('EMPRESASIGLA'), nature: nature === 'INTERNACIONAL' ? 'Internacional' : 'Doméstica', passengers: paid == null || free == null ? null : paid + free, seats: integer(get('ASSENTOS'), true), flights: integer(get('DECOLAGENS'), true) };
    const id = [period, origin, destination, row.airline, row.nature].join('|');
    if (groups.has(id)) { const old = groups.get(id); old.passengers = old.passengers == null || row.passengers == null ? null : old.passengers + row.passengers; old.flights = old.flights == null || row.flights == null ? null : old.flights + row.flights; old.seats = old.seats == null || row.seats == null ? null : old.seats + row.seats; }
    else groups.set(id, row);
    if (groups.size > 5000) throw new Error('Mais de 5.000 agregados. Reduza o período.');
  }
  const dataset = normalizeDataset({ sourceId: 'anac', sourceUrl, retrievedAt, notes: `Etapas básicas regulares e não regulares envolvendo SBPS. Passageiros pagos + grátis. ${examined} linhas examinadas. Período ${from} a ${to}. Campos ausentes permanecem null; qualquer parcela ausente torna o agregado dessa métrica indisponível, sem imputação de zero. Não misturar etapas combinadas.`, rows: [...groups.values()] });
  if (Buffer.byteLength(JSON.stringify(dataset)) > 1900000) throw new Error('Resultado excede 1,9 MB. Reduza o período.');
  return dataset;
}
async function main() {
  const args = process.argv.slice(2); const options = {};
  for (let i = 0; i < args.length; i += 2) options[args[i].replace(/^--/, '')] = args[i + 1];
  if (!options.input || !options.output) throw new Error('Uso: node tools/prepare_observatory_anac.cjs --input etapas.csv --output anac.json --from 2024-01 --to 2025-12 --source-url URL_HTTPS_OFICIAL --retrieved-at AAAA-MM-DD [--encoding utf8|latin1]');
  if (!['utf8', 'latin1'].includes(options.encoding || 'utf8')) throw new Error('Codificação inválida.');
  const result = await convert(fs.createReadStream(options.input, { encoding: options.encoding || 'utf8' }), { from: options.from, to: options.to, sourceUrl: options['source-url'], retrievedAt: options['retrieved-at'] });
  fs.writeFileSync(options.output, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(`${result.rows.length} agregados SBPS preparados. Nenhum dado foi enviado ao Portal.`);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { convert, csvLine };
