const assert = require("node:assert/strict");
const { __test } = require("../server");
const { dashboardSources } = require("../lib/sales-routing");
const sale = (code, total, extra = {}) => __test.normalizeRecord({
  "Data Venda": "2026-11-09", "Codigo Reserva": code, Hotel: "SUEDS EXPERIENCIAS",
  Canal: "AFILIADO", Vendedor: "", Fonte: "DESKHOTEL", Status: "Confirmada",
  "Valor Total": total, Adult: "1", Crian: "0",
  "Tipo de Apto": "Réveillon 2026 - Pista - Beach Club Sueds (1º Lote)", ...extra
});
const first = sale("CR29070366218", 1425, { Adult: "3" });
const rows = dashboardSources([{ ...first, channel: "", rawChannel: "" }], [
  first, sale("CR29070366246", 475), sale("CANCELLED", 330, { Status: "Cancelada" }),
  sale("PENDING", 475, { Status: "Pendente" }),
  sale("OTHER-TICKET", 660, { Canal: "SITE" }),
  sale("OCTOBER", 100, { "Data Venda": "2026-10-09" })
]).records;
const period = { month: "2026-11", date: "2026-11-13" };
const goals = [{ month: "2026-11", seller: "Equipe Sueds", revenueGoal: 5000 }];
const metrics = __test.buildMetrics(rows, goals, period);
const affiliate = metrics.channels.find(row => row.label === "AFILIADO");
assert.equal(affiliate.value, 1900);
assert.equal(affiliate.reservations, 2);
assert.equal(metrics.summary.salesMonth, 0);
assert.equal(metrics.managerSummary.salesMonth, 0);
assert.equal(metrics.detailedSales.length, 0);
assert.equal(metrics.detailedTickets.filter(row => row.canal === "AFILIADO").length, 2);
assert.equal(metrics.sellers.find(row => row.name === "EQUIPE SUEDS").salesMonth, 0);
const value = (query) => __test.buildMetrics(rows, goals, { ...period, ...query })
  .channels.find(row => row.label === "AFILIADO").value;
assert.equal(value({ ticketScope: "all" }), 1900);
assert.equal(value({ day: "2026-11-10" }), 0);
assert.equal(value({ day: "2026-11-09" }), 1900);
assert.equal(value({ hotel: "SUEDS PLAZA" }), 0);
assert.equal(value({ channel: "SITE" }), 0);
assert.equal(value({ channel: "AFILIADO" }), 1900);
assert.equal(value({ month: "ytd" }), 2000);
const hotelAffiliate = sale("HOTEL-AFFILIATE", 250, { Hotel: "SUEDS PLAZA", "Tipo de Apto": "Standard" });
assert.equal(__test.buildMetrics([...rows, hotelAffiliate], goals, period)
  .channels.find(row => row.label === "AFILIADO").value, 2150);
console.log("Affiliate channel includes confirmed tickets: OK");
