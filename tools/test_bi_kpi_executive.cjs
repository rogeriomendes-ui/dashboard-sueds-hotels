const assert = require("node:assert/strict");
const { closedMonthPeriod, buildExecutivePdf } = require("../lib/bi-kpi-executive-pdf.cjs");
const now = new Date("2026-11-02T12:00:00Z");
assert.deepEqual(closedMonthPeriod("2026-10", now), { start: "2026-10-01", end: "2026-10-31" });
assert.equal(closedMonthPeriod("2026-02", now).end, "2026-02-28");
for (const value of ["2026-11", "2026-12", "2025-10", "2026-13", "bad", null]) assert.throws(() => closedMonthPeriod(value, now));
assert.throws(() => closedMonthPeriod("2026-10", new Date("2026-11-01T01:00:00Z")));
const sample = {
  period: closedMonthPeriod("2026-10", now), selected: { hotel: "" }, generatedAt: now.toISOString(),
  dataCoverage: { baseUpdatedAt: now.toISOString(), latestSaleDate: "2026-10-28", queryEndBeyondAvailable: true },
  summary: { sales: 1350000, reservations: 420, ticketAverage: 3214, averageDailyRate: 650, roomNights: 2077, hotels: 4 },
  comparison: { available: true, summary: { sales: 1200000, reservations: 400, ticketAverage: 3000, averageDailyRate: 600, roomNights: 2000 }, coverage: "Comparativo 2025 baseado nas fontes disponíveis no KPI Full." },
  revpar: { summary: { occupancyRate: 65, revpar: 422 } },
  byHotel: [{ label: "SUEDS PLAZA", value: 900000 }, { label: "SUEDS PREMIUM", value: 450000 }],
  byChannel: Array.from({ length: 12 }, (_, i) => ({ label: `Canal ${i + 1}`, value: 100000 })),
  byCheckinMonth: [{ label: "Novembro de 2026", value: 1350000 }]
};
(async () => {
  const pdf = await buildExecutivePdf(sample);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const empty = await buildExecutivePdf({ ...sample, summary: {}, comparison: { available: false }, byHotel: [], byChannel: [], byCheckinMonth: [] });
  assert.ok(empty.length > 1000);
  const { __test } = require("../server");
  const payload = __test.buildCachedBiKpiReportsPayload({ audience: "bi-relatorios-kpi", records: [] }, { ...closedMonthPeriod("2026-10", now), hotel: "", channels: [], checkinMonth: "" });
  assert.deepEqual(payload.period, sample.period);
  assert.ok((await buildExecutivePdf(payload)).length > 1000);
  if (process.argv[2]) require("node:fs").writeFileSync(process.argv[2], pdf);
  console.log("OK: meses encerrados, fuso de São Paulo, PDF com comparativo e sem dados.");
})().catch(error => { console.error(error); process.exitCode = 1; });
