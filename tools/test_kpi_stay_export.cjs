const assert = require("node:assert/strict");
const { __test } = require("../server");
const ExcelJS = require("exceljs");

const headers = ["Hotel", "Depósito", "Origem", "Reserva", "Titular", "IN", "OUT", "Diária", "ADT", "CHD", "Apto", "Localizador", "Status", "RN", "ANT", "D.Res", "Pen", "Hóspede", "I.D.", "Nº", "Tipo", "Piso", "Vista", "Total"];
const row = (id, checkin, checkout, status = "Confirmada", sale = "2026-07-09", hotel = "SUEDS VILLA ROMANA") =>
  [hotel, "", "Airbnb", id, id, checkin, checkout, 100, 2, 0, 1, id, status, 3, 0, sale, "", "", "", "", "", "", "", 300];
const source = [headers,
  row("ongoing", "2026-10-28", "2026-11-04"),
  row("old-sale", "2027-02-06", "2027-02-09", "Confirmada", "2025-08-01"),
  row("last-day", "2027-12-31", "2028-01-03"),
  row("finished", "2026-10-27", "2026-10-30"),
  row("too-late", "2028-01-01", "2028-01-04"),
  row("maintenance", "2026-11-01", "2026-11-04", "Manutenção"),
  row("block", "2026-11-01", "2026-11-04", "Bloqueio"),
  row("cancelled", "2026-11-01", "2026-11-04", "Cancelada"),
  row("pending", "2026-11-01", "2026-11-04", "Pendente"),
  row("in-house", "2026-10-28", "2026-11-04", "No Hotel"),
  row("no-sale-date", "2027-01-02", "2027-01-05", "Confirmada", ""),
  row("other-hotel", "2026-11-01", "2026-11-04", "Confirmada", "2026-07-09", "SUEDS PLAZA"),
  row("invalid-stay", "2026-11-04", "2026-11-01")
];
source.push([...source[1]]);
const query = { dateBasis: "stay", stayStart: "2026-10-30", stayEnd: "2027-12-31", hotel: "CASAS SUEDS ARRAIAL",
  start: "2026-10-01", end: "2026-10-29", checkinMonth: "2026-10" };
const result = __test.filterBiKpiSourceRows(source, query);
assert.deepEqual(result.map(r => r[3]), ["ongoing", "old-sale", "last-day", "pending", "in-house", "no-sale-date"]);
assert.equal(result.find(r => r[3] === "old-sale")[5], "06/02/2027");
assert.equal(result.find(r => r[3] === "pending")[12], "Pendente");
const zeroValue = row("zero-value", "2026-11-01", "2026-11-04", "Pendente");
zeroValue[7] = 0; zeroValue[13] = 0; zeroValue[23] = 0;
assert.equal(__test.filterBiKpiSourceRows([headers, zeroValue], query).length, 1);
assert.equal(__test.filterBiKpiSourceRows(source, { ...query, channels: ["CVC"] }).length, 0);
assert.throws(() => __test.biKpiStayPeriod({ stayStart: "2026-02-30", stayEnd: "2027-12-31" }));
assert.throws(() => __test.biKpiStayPeriod({ stayStart: "2027-12-31", stayEnd: "2026-10-30" }));
assert.throws(() => __test.biKpiStayPeriod({}));
// Current cancellation overrides the historical confirmed snapshot.
const historical = row("current-cancelled", "2026-11-01", "2026-11-04");
const control = { Hotel: historical[0], Reserva: historical[3], "D.Res": 46300, Status: "Cancelada" };
assert.equal(__test.filterBiKpiSourceRows([[...headers, "KPI Atual v1"], [...historical, JSON.stringify(control)]], query).length, 0);

(async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await __test.buildBiKpiSourceWorkbook(source, query));
  const sheet = workbook.getWorksheet("Reservas por hospedagem");
  assert.equal(sheet.rowCount, result.length + 1);
  assert.ok(sheet.getCell("F2").value instanceof Date);
  assert.equal(sheet.getCell("F2").numFmt, "dd/mm/yyyy");
  console.log("Extração por hospedagem validada: período, datas originais, status, filtros, deduplicação e Excel.");
})().catch(error => { console.error(error); process.exitCode = 1; });
