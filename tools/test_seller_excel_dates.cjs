const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { __test } = require("../server");

const assertExcelDate = (value, expected) => {
  const date = __test.excelDateFromKey(value);
  assert.ok(date instanceof Date);
  assert.equal(date.toISOString().slice(0, 10), expected);
};

assertExcelDate("2026-10-05", "2026-10-05");
assertExcelDate("05/10/2026", "2026-10-05");
assertExcelDate("5/10/2026", "2026-10-05");
assert.equal(__test.excelDateFromKey("data inválida"), null);

(async () => {
  const workbookBuffer = await __test.buildSalesCommissionWorkbook({
    period: { month: "2026-10" },
    sellers: [{ name: "EQUIPE SUEDS", reservationsMonth: 1, salesMonth: 1200 }],
    summary: { reservationsMonth: 2, salesMonth: 1500 },
    detailedSales: [{
      dataVenda: "2026-10-01",
      codigoReserva: "TEST-1",
      hotel: "SUEDS PLAZA",
      canal: "INDIVIDUAL",
      vendedor: "Amanda Melgaco",
      cliente: "Cliente de teste",
      checkin: "05/10/2026",
      checkout: "07/10/2026",
      diarias: "2",
      uh: "1",
      adultos: "2",
      criancas: "0",
      valorTotal: 1200,
      recebido: 1200,
      aReceber: 0,
      formaPagamento: "PIX",
      parcelas: "1",
      status: "Confirmada",
      fonte: "Teste",
      observacoes: ""
    }, {
      dataVenda: "2026-10-02",
      codigoReserva: "ROBO-1",
      canal: "Robo",
      vendedor: "Alice (Robo)",
      valorTotal: 300
    }, ...["SITE", " Site Sueds ", "BE MOBILE", "BE MOBILLE", "BOOKING ENGINE", "BOOK ENGINE"].map((canal, index) => ({
      dataVenda: "2026-10-02", codigoReserva: `SITE-${index}`, canal,
      vendedor: index === 0 ? "Amanda Melgaco" : "", valorTotal: 300
    })), {
      dataVenda: "2026-10-02", codigoReserva: "SITE-SELLER", canal: "INDIVIDUAL",
      vendedor: "Site", valorTotal: 300
    }, {
      dataVenda: "2026-10-02", codigoReserva: "ROBO-SELLER", canal: "CENTRAL DE RESERVAS",
      vendedor: "Alice (Assistente Virtual)", valorTotal: 300
    }]
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(workbookBuffer);
  const sheet = workbook.getWorksheet("Vendas completas");
  assert.equal(sheet.getCell("G5").value.toISOString().slice(0, 10), "2026-10-05");
  assert.equal(sheet.getCell("H5").value.toISOString().slice(0, 10), "2026-10-07");
  assert.equal(sheet.getCell("A2").value.includes("1 vendas listadas"), true);
  assert.equal(sheet.getCell("B6").value, null);
  assert.equal(sheet.getCell("B5").value, "TEST-1");
  assert.deepEqual(sheet.getColumn("B").values.slice(5).filter(Boolean), ["TEST-1"]);
  const summary = workbook.getWorksheet("Resumo");
  assert.equal(summary.getCell("B7").value, 1);
  assert.equal(summary.getCell("C7").value, 1200);

  // Old closures must be filtered without recalculating their archived seller values.
  sheet.addRow({ codigoReserva: "FROZEN-SITE", canal: "SITE", vendedor: "Site", valorTotal: 300 });
  sheet.addRow({ codigoReserva: "FROZEN-ROBO", canal: "Robo", vendedor: "Alice (Robo)", valorTotal: 300 });
  sheet.getCell("A2").value = "Período: outubro de 2026 • 3 vendas listadas";
  summary.getCell("M5").value = 42.25;
  summary.getCell("C7").value = 1800;
  const frozenWorkbook = Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64");
  const filtered = new ExcelJS.Workbook();
  await filtered.xlsx.load(await __test.buildSalesCommissionWorkbook({
    frozenWorkbook, period: { month: "2026-10" },
    sellers: [{ name: "EQUIPE SUEDS", reservationsMonth: 1, salesMonth: 1200 }]
  }));
  const frozenDetails = filtered.getWorksheet("Vendas completas");
  assert.deepEqual(frozenDetails.getColumn("B").values.slice(5).filter(Boolean), ["TEST-1"]);
  assert.equal(frozenDetails.getCell("A2").text.includes("1 vendas listadas"), true);
  assert.deepEqual(frozenDetails.autoFilter, "A4:T5");
  assert.equal(filtered.getWorksheet("Resumo").getCell("M5").value, 42.25);
  assert.equal(filtered.getWorksheet("Resumo").getCell("C7").value, 1200);
  assert.equal(frozenWorkbook, Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64"));

  console.log("Seller Excel dates: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
