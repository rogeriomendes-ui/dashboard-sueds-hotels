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
    sellers: [],
    summary: { reservationsMonth: 1, salesMonth: 1200 },
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
    }]
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(workbookBuffer);
  const sheet = workbook.getWorksheet("Vendas completas");
  assert.equal(sheet.getCell("G5").value.toISOString().slice(0, 10), "2026-10-05");
  assert.equal(sheet.getCell("H5").value.toISOString().slice(0, 10), "2026-10-07");

  console.log("Seller Excel dates: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
