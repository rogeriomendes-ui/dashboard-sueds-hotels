const assert = require("node:assert/strict");
const { __test } = require("../server");

const headers = ["Hotel", "Depósito", "Origem", "Reserva", "Titular", "IN", "OUT", "Diária", "ADT", "CHD", "Apto", "Localizador", "Status", "RN", "ANT", "D.Res", "Pen", "Hóspede", "I.D.", "Nº", "Tipo", "Piso", "Vista", "Total", "KPI Atual v1"];
const current = { Hotel: "SUEDS PREMIUM", Origem: "BookingEngine", Reserva: "20413", IN: "01/10", OUT: "06/10", "Diária": "214,65", Apto: "325", Status: "Early check out", RN: "5", "D.Res": 46268, Total: "1.287,90", "Empresa KPI": "FHM" };
function row(overrides = {}) {
  const values = { ...current, OUT: "07/10", RN: "6", Status: "Confirmada", Apto: "301", Localizador: "RES025222-5700", "KPI Atual v1": "HISTORICO", ...overrides };
  return headers.map((header) => values[header] ?? "");
}
function withCurrent(values = current, overrides = {}) {
  return row({ ...overrides, "KPI Atual v1": JSON.stringify(values) });
}
const source = [headers,
  row(),
  row({ Apto: "325", Status: "No Hotel" }),
  withCurrent(current, { OUT: "06/10", RN: "5", Status: "Early check out", Apto: "325" })
];
const query = { start: "2026-09-01", end: "2026-09-30", hotel: "SUEDS PREMIUM" };

// Reproduce the published behavior without the control column: 6 + 5 RN.
const legacy = __test.normalizeKpiReportRows(source.map((r) => r.slice(0, 24)), 2026);
assert.equal(legacy[0].days, "11");
assert.equal(legacy[0].total, 2361.15);

const records = __test.normalizeKpiReportRows(source, 2026);
assert.equal(records.length, 1);
assert.equal(records[0].days, "5");
assert.equal(records[0].total, 1073.25);
assert.equal(records[0].checkout, "06/10/2026");
assert.equal(records[0].kpiCompany, "FHM");
const report = __test.buildBiReportsPayload({ audience: "bi-relatorios-kpi", records }, query);
assert.equal(report.summary.sales, 1073.25);
assert.equal(report.summary.roomNights, 5);
assert.equal(report.summary.reservations, 1);

// The compact read used by the dashboard must agree with the full XLS read.
const compact = __test.kpiObjectsFromColumnRanges([
  source.map((r) => r.slice(0, 4)), source.map((r) => r.slice(5, 8)),
  source.map((r) => r.slice(10, 14)), source.map((r) => r.slice(15, 16)),
  source.map((r) => r.slice(23, 24)), source.map((r) => r.slice(24, 25))
]);
assert.deepEqual(__test.normalizeKpiReportObjects(compact, 2026), records);
assert.equal(__test.kpiLatestSaleDate(compact), "2026-09-03");
const exported = __test.filterBiKpiSourceRows(source, query);
assert.equal(exported.length, 1);
assert.equal(exported[0][13], 5);
assert.equal(exported[0][23], 1073.25);
assert.equal(exported[0][24], "1.287,90");

assert.equal(__test.normalizeKpiReportRows([headers, row()], 2026).length, 0);
assert.equal(__test.normalizeKpiReportRows([headers, row({ "KPI Atual v1": "" })], 2026).length, 0);
const preserved = __test.normalizeKpiReportRows([headers, row({ "KPI Atual v1": "PRESERVADO" })], 2026);
assert.equal(preserved[0].days, "6");
assert.equal(preserved[0].total, 1287.9);
assert.equal(__test.normalizeKpiReportRows([headers.slice(0, 24), row().slice(0, 24)], 2025)[0].total, 1287.9);

const cancelled = [headers, row(), withCurrent({ ...current, Status: "Cancelada" })];
assert.equal(__test.filterBiKpiSourceRows(cancelled, query).length, 0);

// Current room segments are additive; duplicate versions of a room are not.
const rooms = [headers, withCurrent(current), withCurrent(current), withCurrent({ ...current, Apto: "326" })];
assert.equal(__test.normalizeKpiReportRows(rooms, 2026)[0].days, "10");
assert.equal(__test.normalizeKpiReportRows(rooms, 2026)[0].total, 2146.5);
const segments = [headers,
  withCurrent({ ...current, OUT: "03/10", RN: "2" }),
  withCurrent({ ...current, IN: "03/10", RN: "3" })
];
assert.equal(__test.normalizeKpiReportRows(segments, 2026)[0].days, "5");
assert.equal(__test.normalizeKpiReportRows(segments, 2026)[0].total, 1073.25);

// Reservation numbers can repeat in different KPI companies under one hotel.
const companies = [headers,
  withCurrent(current),
  withCurrent({ ...current, "Empresa KPI": "OTHER", RN: "2", Total: "429,30", Apto: "999" })
];
assert.equal(__test.normalizeKpiReportRows(companies, 2026).length, 2);
assert.deepEqual(__test.filterBiKpiSourceRows(companies, query).map((r) => [r[10], r[23], r[24]]),
  [["325", 1073.25, "1.287,90"], ["999", 429.3, "429,30"]]);

for (const control of ["invalid json", "null", JSON.stringify({ ...current, Reserva: "wrong" }), JSON.stringify({ ...current, "D.Res": "03/09" })]) {
  assert.throws(() => __test.normalizeKpiReportRows([headers, row({ "KPI Atual v1": control })], 2026), /Controle atual KPI/);
  assert.throws(() => __test.filterBiKpiSourceRows([headers, row({ "KPI Atual v1": control })], query), /Controle atual KPI/);
}
const maintenance = { ...current, Origem: "Governança", RN: "5", "Diária": "0", Total: "0" };
assert.equal(__test.normalizeKpiMaintenanceObjects([
  Object.fromEntries(headers.map((h, i) => [h, row({ Origem: "Governança" })[i]])),
  Object.fromEntries(headers.map((h, i) => [h, withCurrent(maintenance)[i]]))
], 2026).length, 1);

__test.buildBiKpiSourceWorkbook(source, query).then(async (buffer) => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Base KPI 2026");
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getCell("N2").value, 5);
  assert.equal(sheet.getCell("X2").value, 1073.25);
  assert.equal(sheet.getCell("Y2").value, 1287.9);
  assert.equal(sheet.getCell("Y1").value, "Total bruto (planilha)");
  console.log("PASS: KPI histórico excluído, versão atual, compactação, segmentos, empresas, cancelamentos e XLSX.");
}).catch((error) => { console.error(error); process.exitCode = 1; });
