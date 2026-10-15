const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { report } = require('../lib/integration-status');
const { createHandler } = require('../api/portal/integration-status');
const { buildWorkbook } = require('../lib/integration-status-export');
const { loadFound, saveFound } = require('../lib/integration-status-found');
const now = new Date('2026-10-14T15:00:00Z');
const row = { hotel: 'SUEDS PLAZA', code: '00123-0', situation: 'missing', saleDate: '2026-01-10', checkin: '2027-01-01', checkout: '2027-01-05', matches: [] };
const snapshot = () => ({ version: 1, channels: ['omnibees', 'cvc'].map(source => ({ source, available: true, from: '2026-01-01', to: '2026-10-13', hotels: ['SUEDS PLAZA', 'SUEDS PREMIUM'], records: [structuredClone(row), { ...row, hotel: 'SUEDS PREMIUM' }] })) });
const note = { version: 1, source: 'omnibees', hotel: row.hotel, code: row.code, note: 'Achei em outro nome no KPI: 12345', at: now.toISOString(), userId: 'u1', userName: 'Conferente' };
test('Achei reduz pendências da chave exata e persiste após uma captura substituta', async () => {
  for (const current of [snapshot(), JSON.parse(JSON.stringify(snapshot()))]) {
    const data = report(current, { situation: 'all' }, { now, found: [note], allDetails: true });
    assert.equal(data.summary.missing, 3); assert.equal(data.summary.matched, 1); assert.equal(data.summary.confirmed, 4); assert.equal(data.summary.manualFound, 1);
    assert.equal(report(current, { source: 'omnibees' }, { now, found: [note] }).totalDetails, 1);
    const manual = report(current, { situation: 'manual_found' }, { now, found: [note] });
    assert.equal(manual.totalDetails, 1); assert.equal(manual.details[0].manualResolution.note, note.note);
    assert.equal(current.channels[0].records[0].situation, 'missing');
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await buildWorkbook(manual));
    assert.equal(book.worksheets[0].getCell('N7').value, note.note);
    assert.equal(book.worksheets[0].getCell('O7').value, 'Conferente');
  }
});
async function call({ user = { id: 'u1', name: 'Conferente', environments: ['status_integracoes'] }, body = note, headers = { 'content-type': 'application/json', origin: 'https://portalsueds.com.br', host: 'portalsueds.com.br' }, write = async () => {} } = {}) {
  let reads = 0, writes = 0;
  const res = { setHeader() {}, end(v) { this.body = JSON.parse(v); } };
  await createHandler({ profile: async () => user, load: async () => { reads++; return snapshot(); }, saveFound: async record => { writes++; await write(record); } })({ method: 'POST', headers, body, url: '/api/portal/integration-status' }, res);
  return { ...res, reads, writes };
}
test('gravação exige usuário com acesso, JSON da mesma origem e explicação', async () => {
  for (const [options, status] of [[{ user: null }, 401], [{ user: { environments: [] } }, 403], [{ body: { ...note, note: '   ' } }, 400], [{ body: { ...note, note: 'a'.repeat(2001) } }, 400], [{ body: { ...note, code: 'inexistente' } }, 409], [{ headers: { 'content-type': 'text/plain' } }, 403], [{ headers: { 'content-type': 'application/json', origin: 'https://other.invalid', host: 'portalsueds.com.br' } }, 403]]) {
    const r = await call(options); assert.equal(r.statusCode, status); assert.equal(r.writes, 0);
  }
  const result = await call({ body: { ...note, userId: 'forjado', userName: 'forjado' }, write: async record => { assert.equal(record.userId, 'u1'); assert.equal(record.userName, 'Conferente'); assert.equal(record.note, note.note); } });
  assert.equal(result.statusCode, 200); assert.equal(result.writes, 1); assert.equal(result.body.saved, true);
  assert.equal((await call({ write: async () => { throw new Error('Banco indisponível'); } })).statusCode, 503);
});
test('persistência usa registros independentes e lê todas as páginas sem sobrescrever capturas', async () => {
  const original = { fetch: global.fetch, key: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_SECRET_KEY = 'test-only';
  try {
    let writes = 0, reads = 0;
    global.fetch = async (url, options) => {
      if (options.method === 'POST') { const stored = JSON.parse(options.body); assert.equal(stored.source, 'integration_status_found_v1'); assert.equal(stored.payload.note, note.note); assert.equal(stored.period_date, undefined); writes++; return { ok: true, json: async () => [{ payload: stored.payload }] }; }
      reads++; assert.match(url, /source=eq.integration_status_found_v1/);
      return { ok: true, json: async () => reads === 1 ? Array.from({ length: 500 }, (_, i) => ({ payload: { ...note, code: String(i) } })) : [{ payload: { ...note, code: 'extra' } }, { payload: { ...note, code: '0', note: 'antiga' } }] };
    };
    await Promise.all([saveFound(note), saveFound(note)]);
    const found = await loadFound();
    assert.equal(writes, 2); assert.equal(reads, 2); assert.equal(found.length, 501); assert.equal(found.find(r => r.code === '0').note, note.note);
    global.fetch = async () => ({ ok: false });
    await assert.rejects(loadFound); await assert.rejects(() => saveFound(note));
  } finally { global.fetch = original.fetch; if (original.key === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = original.key; }
});
