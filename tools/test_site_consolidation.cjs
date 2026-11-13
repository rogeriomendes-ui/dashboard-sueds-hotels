const assert = require("node:assert/strict");
const { dashboardSources, mergeDeskhotelSiteSales } = require("../lib/sales-routing");
const { __test } = require("../server");

const sale = (code, total, extra = {}) => __test.normalizeRecord({
  "Data Venda": "2026-10-10", "Codigo Reserva": code, Hotel: "SUEDS PLAZA",
  Canal: "SITE", Fonte: "DESKHOTEL", Status: "Confirmada", "Valor Total": total,
  Checkin: "01/11/2026", Checkout: "03/11/2026", Diarias: "2", ...extra
});
const kpi = [{ ...sale("OMNI-1", 1000, { Fonte: "KPI FULL" }),
  channel: "Reserva Direta", rawChannel: "Reserva Direta", kpiSiteSale: true }];
const desk = sale("DESK-1", 200);
const routed = dashboardSources([desk], [
  desk, // Same reservation in both tabs.
  sale("OMNI-1", 9999), // Already present in KPI Full: keep the KPI value.
  sale("DESK-1", 300, { Hotel: "SUEDS PREMIUM" }), // Different hotel is distinct.
  sale("CANCELLED", 400, { Status: "Cancelada" }),
  sale("PENDING", 500, { Status: "Pendente" }),
  sale("HISTORY", 600, { "Data Venda": "2026-08-10" }),
  sale("OTHER", 700, { Fonte: "OMNIBEES" }),
  sale("ROBOT", 800, { Canal: "Robo", Vendedor: "Alice (Robo)" }),
  sale("AFFILIATE", 900, { Canal: "AFILIADO" }),
  sale("CENTRAL", 1100, { Canal: "CENTRAL DE RESERVAS", Vendedor: "Aline Nunes" })
]);
const combined = mergeDeskhotelSiteSales(kpi, routed.records);
assert.equal(combined.filter(r => r.reservationCode === "OMNI-1").length, 1);
assert.equal(combined[0].total, 1000);
assert.equal(combined.filter(r => r.reservationCode === "DESK-1").length, 2);
assert.ok(combined.every(r => r.kpiSiteSale));
assert.equal(kpi.length, 1);
assert.equal(desk.channel, "SITE");

const dataset = { audience: "bi-relatorios-kpi", records: combined, historicalRecords: [
  { ...kpi[0], dateKey: "2025-10-10", monthKey: "2025-10", total: 750 }
] };
const query = { start: "2026-10-01", end: "2026-10-31" };
const payload = __test.buildBiReportsPayload(dataset, query);
assert.equal(payload.summary.sales, 1500);
assert.equal(payload.summary.reservations, 3);
assert.equal(payload.monthlyGoalTables.find(t => t.key === "site").rows[0].actual, 1500);
assert.equal(payload.comparison.summary.sales, 750);
assert.equal(payload.byChannel.find(r => r.label === "Reserva Direta").value, 1500);
const hotelPayload = __test.buildBiReportsPayload(dataset, { ...query, hotel: "SUEDS PREMIUM" });
assert.equal(hotelPayload.summary.sales, 300);
assert.equal(__test.buildBiReportsPayload(dataset, { ...query, end: "2026-10-09" }).summary.sales, 0);
assert.equal(__test.buildBiReportsPayload(dataset, { ...query, channels: ["Booking"] }).summary.sales, 0);

assert.deepEqual(mergeDeskhotelSiteSales(combined, routed.records), combined);
console.log("Site DeskHotel + KPI Full: OK");
