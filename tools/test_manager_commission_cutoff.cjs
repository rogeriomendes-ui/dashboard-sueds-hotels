const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { __test } = require("../server");

const team = { name: "EQUIPE SUEDS", monthlyGoalPct: 110, salesMonth: 100000 };
const seller = { ...team, name: "Aline Nunes" };

(async () => {
  assert.equal(__test.teamManagerCommission(team, { month: "2026-07" }).amount, 3064.27);
  assert.equal(__test.teamManagerCommission(team, { month: "2026-09" }).amount, 700);
  for (const month of ["2026-10", "2026-11", "2026-12", "2027-01"]) {
    assert.equal(__test.teamManagerCommission(team, { month }), null);
    const metrics = {
      period: { month }, sellers: [team, seller],
      summary: { salesMonth: 100000 }, detailedSales: []
    };
    const payload = __test.buildSellersPayload(metrics, { role: "manager" });
    assert.equal(payload.sellers[0].commission, null);
    assert.equal(payload.sellers[1].commission.amount, 1300);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await __test.buildSalesCommissionWorkbook(metrics));
    const sheet = workbook.getWorksheet("Resumo");
    for (const column of ["G", "H", "I", "J", "K", "L", "M"]) {
      assert.equal(sheet.getCell(`${column}5`).value, null, `${month}: ${column}5`);
    }
    assert.equal(sheet.getCell("M6").value, 1300);
  }
  console.log("Manager commission cutoff: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
