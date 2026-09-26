const assert = require("node:assert/strict");
const { buildManagerPayload } = require("../server").__test;

const metrics = {
  generatedAt: "2026-09-11T12:00:00.000Z",
  period: { today: "2026-09-11", month: "2026-09" },
  summary: { salesToday: 1250, reservationsToday: 2 },
  managerSummary: { salesToday: 6738.21, reservationsToday: 8, salesMonth: 20000 },
  filters: {},
  sellers: [
    { name: "EQUIPE SUEDS", salesToday: 1250, reservationsToday: 2 },
    { name: "Robo", salesToday: 400, reservationsToday: 1 }
  ],
  channels: [], hotels: [], advancePurchase: {}, dailySales: [], detailedSales: [], otherChannels: {}, analytics: null
};

const payload = buildManagerPayload(metrics);
assert.equal(payload.summary.salesToday, 1250, "O box diário deve usar somente a venda da Equipe SUEDS");
assert.equal(payload.summary.reservationsToday, 2, "O box diário deve usar somente as reservas da Equipe SUEDS");
assert.equal(payload.summary.salesMonth, 20000, "Os demais totais dos gestores devem continuar incluindo Equipe + Site");
console.log("Box de vendas do dia limitado à Equipe SUEDS.");
