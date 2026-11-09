const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { __test } = require('../server');
const { readFileSync } = require('node:fs');
const { parseDocument } = require('htmlparser2');
const { findAll } = require('domutils');
const html = parseDocument(readFileSync(require.resolve('../public/bi-relatorios-kpi.html'), 'utf8'));
const dates = findAll((node) => ['startDate', 'endDate'].includes(node.attribs?.id), html.children);
assert.equal(dates.length, 2);
dates.forEach((node) => assert.equal(node.attribs.min, '2025-01-01'));

const sale = (year, overrides = {}) => ({
  dateKey: `${year}-09-12`, reservationCode: 'SAME-CODE', hotel: 'SUEDS PLAZA',
  channel: 'CVC', rawChannel: 'CVC', status: 'Confirmada', total: year === 2025 ? 200 : 300,
  checkin: `03/10/${year}`, checkout: `05/10/${year}`, days: 2, uh: 1, ...overrides
});
const dataset = { audience: 'bi-relatorios-kpi', records: [sale(2026)], historicalRecords: [sale(2025),
  sale(2025, { reservationCode: 'CANCELLED', status: 'Cancelada', total: 50 })] };
const query = { start: '2025-09-01', end: '2025-09-30', hotel: 'SUEDS PLAZA', channels: ['CVC'], checkinMonth: '2025-10' };
const historical = __test.buildBiReportsPayload(dataset, query);
assert.deepEqual(historical.period, { start: query.start, end: query.end });
assert.equal(historical.summary.sales, 200);
assert.equal(historical.summary.reservations, 1);
assert.equal(historical.daily.at(-1).cumulative, 200);
assert.equal(historical.cancellations.byChannel[0].value, 50);
assert.equal(historical.comparison.available, false);
assert.equal(historical.comparison.year, 2024);
assert.match(historical.comparison.coverage, /2024/);
assert.equal(historical.filters.checkinMonths[0].key, '2025-10');
assert.equal(__test.buildBiReportsPayload(dataset, { ...query, channels: ['Booking'] }).summary.sales, 0);
const current = __test.buildBiReportsPayload(dataset, { start: '2026-09-01', end: '2026-09-30' });
assert.equal(current.summary.sales, 300);
assert.equal(current.comparison.summary.sales, 200);
assert.equal(current.comparison.year, 2025);
const mixed = __test.buildBiReportsPayload(dataset, { start: '2025-09-01', end: '2026-09-30' });
assert.equal(mixed.summary.sales, 500);

const headers = Array(24).fill('');
Object.entries({ 0: 'Hotel', 2: 'Origem', 3: 'Reserva', 5: 'IN', 6: 'OUT', 7: 'Diária', 10: 'Apto', 12: 'Status', 13: 'RN', 15: 'D.Res', 23: 'Total' }).forEach(([i, value]) => { headers[i] = value; });
const source = (year) => {
  const row = Array(24).fill('');
  Object.entries({ 0: 'SUEDS PLAZA', 2: 'CVC', 3: 'SAME-CODE', 5: `03/10/${year}`, 6: `05/10/${year}`, 7: year === 2025 ? 100 : 150, 10: '101', 12: 'Confirmada', 13: 2, 15: `12/09/${year}`, 23: 999 }).forEach(([i, value]) => { row[i] = value; });
  return [headers, row];
};
(async () => {
  const rows = __test.filterBiKpiSourceRows(source(2025), query);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][15], '2025-09-12');
  assert.equal(rows[0][23], 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await __test.buildBiKpiSourceWorkbook(source(2025), query));
  const sheet = workbook.getWorksheet('Base KPI 2025');
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getCell('X2').value, 200);
  assert.equal(sheet.getCell('P2').value.getUTCFullYear(), 2025);
  const combinedWorkbook = new ExcelJS.Workbook();
  await combinedWorkbook.xlsx.load(await __test.buildBiKpiSourceWorkbook(source(2025),
    { start: '2025-09-01', end: '2026-09-30' },
    [{ year: 2025, rows: source(2025) }, { year: 2026, rows: source(2026) }]));
  const combinedSheet = combinedWorkbook.worksheets[0];
  assert.equal(combinedSheet.rowCount, 3);
  assert.equal(combinedSheet.getCell('X2').value + combinedSheet.getCell('X3').value, 500);
  console.log('KPI 2025: consulta, filtros, comparação e XLS OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
