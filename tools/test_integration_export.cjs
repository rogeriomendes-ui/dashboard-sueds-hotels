const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { report } = require('../lib/integration-status');
const { buildWorkbook } = require('../lib/integration-status-export');
const { createHandler } = require('../api/portal/integration-status');
const rows = Array.from({ length: 205 }, (_, i) => ({ code: String(i).padStart(8, '0'), hotel: 'SUEDS PLAZA', guest: '=Nome literal', saleDate: '2026-10-01', checkin: '2026-12-04', checkout: '2026-12-10', status: 'Confirmada', lineStatus: 'OK', situation: 'matched', numberMismatch: true, matches: [{ code: '049954', locator: '5931208849', status: 'Confirmada' }] }));
const snapshot = { version: 1, generatedAt: '2026-10-14T11:00:00Z', kpi: { capturedAt: '2026-10-14T10:00:00Z' }, channels: [{ source: 'omnibees', available: true, from: '2026-01-01', to: '2026-10-13', capturedAt: '2026-10-14T09:00:00Z', hotels: ['SUEDS PLAZA', 'SUEDS PREMIUM'], records: [...rows, { ...rows[0], hotel: 'SUEDS PREMIUM' }, { ...rows[0], saleDate: '2026-09-30' }] }, { source: 'cvc', available: true, hotels: ['SUEDS PLAZA'], records: [rows[0]] }] };
const query = { source: 'omnibees', situation: 'different_number', hotel: 'SUEDS PLAZA', from: '2026-10-01', to: '2026-10-13' };
test('Excel exporta todos os registros filtrados, preservando códigos, datas e divergência', async () => {
  assert.equal(report(snapshot, query).details.length, 100);
  const data = report(snapshot, query, { allDetails: true });
  assert.equal(data.details.length, 205);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await buildWorkbook(data));
  const sheet = book.worksheets[0];
  assert.equal(sheet.rowCount, 211);
  assert.equal(sheet.getCell('C7').value, '00000000');
  assert.equal(sheet.getCell('D7').value, '=Nome literal');
  assert.equal(sheet.getCell('D7').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('F7').value.toISOString(), '2026-12-04T00:00:00.000Z');
  assert.match(sheet.getCell('J7').value, /número diferente/);
  assert.equal(sheet.getCell('K7').value, '049954');
  assert.equal(sheet.getCell('L7').value, '5931208849');
  assert.match(sheet.getCell('A3').value, /14\/10\/2026/);
});
test('download exige login e acesso individual; resposta autorizada é um Excel sem cache', async () => {
  for (const [profile, expected] of [[null, 401], [{ roles: [], environments: [] }, 403], [{ roles: [], environments: ['status_integracoes'] }, 200]]) {
    let reads = 0;
    const res = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(v) { this.body = v; } };
    await createHandler({ profile: async () => profile, loadFound: async () => [], load: async () => { reads++; return snapshot; } })({ method: 'GET', url: '/api/portal/integration-status?' + new URLSearchParams({ ...query, format: 'xlsx' }) }, res);
    assert.equal(res.statusCode, expected);
    assert.equal(reads, expected === 200 ? 1 : 0);
    if (expected === 200) {
      assert.ok(Buffer.isBuffer(res.body));
      assert.match(res.headers['content-type'], /spreadsheetml/);
      assert.match(res.headers['content-disposition'], /attachment; filename="status-integracoes_omnibees/);
      assert.equal(res.headers['cache-control'], 'no-store');
      const book = new ExcelJS.Workbook(); await book.xlsx.load(res.body);
      assert.equal(book.worksheets[0].rowCount, 211);
    }
  }
});
