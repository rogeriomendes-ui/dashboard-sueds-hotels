const assert = require("node:assert/strict");
const { __test } = require("../server");

assert.deepEqual(__test.biReportsDefaultKpiPeriod(new Date("2026-10-03T12:00:00Z")),
  { start: "2026-10-01", end: "2026-10-02" });
assert.deepEqual(__test.biReportsDefaultKpiPeriod(new Date("2026-10-03T01:00:00Z")),
  { start: "2026-10-01", end: "2026-10-01" });
assert.deepEqual(__test.biReportsDefaultKpiPeriod(new Date("2026-11-01T12:00:00Z")),
  { start: "2026-10-01", end: "2026-10-31" });
assert.deepEqual(__test.buildBiReportsPayload({ audience: "bi-relatorios-kpi", records: [] }).period,
  __test.biReportsDefaultKpiPeriod());
const futureOccupancy = __test.buildBiReportsPayload({ audience: "bi-relatorios-kpi", records: [] },
  { start: "2026-10-01", end: "2027-02-06", hotel: "SUEDS PLAZA" });
assert.deepEqual(futureOccupancy.period, { start: "2026-10-01", end: "2027-02-06" });
assert.equal(futureOccupancy.occupancy[0].days.at(-1).date, "2027-02-06");
const fullTwoYearOccupancy = __test.buildBiReportsPayload({ audience: "bi-relatorios-kpi", records: [] },
  { start: "2026-01-01", end: "2027-12-31", hotel: "SUEDS PLAZA" });
assert.equal(fullTwoYearOccupancy.occupancy[0].days.length, 730);
assert.equal(fullTwoYearOccupancy.occupancy[0].days.at(-1).date, "2027-12-31");

const availabilityAlerts = __test.availabilityAlertsPayload({
  audience: "bi-relatorios-kpi",
  loadedAt: "availability-alert-test",
  kpiCapturedAt: "2026-10-08T10:33:08.000Z",
  records: [{
    dateKey: "2026-10-01", monthKey: "2026-10", reservationCode: "ALERT-1", hotel: "SUEDS PLAZA",
    channel: "CENTRAL DE RESERVAS", rawChannel: "CENTRAL DE RESERVAS", seller: "", checkin: "10/10/2026",
    checkout: "12/10/2026", status: "Confirmada", reservationCount: 117, total: 1000
  }], maintenanceBlocks: []
});
assert.equal(availabilityAlerts.period.end, "2026-10-12");
assert.equal(availabilityAlerts.updatedAt, "2026-10-08T10:33:08.000Z");
assert.equal(__test.kpiCapturedAt([{ metadataKey: "sueds.kpi.full.last_captured_at", metadataValue: "2026-10-08T10:33:08.014Z" }]), "2026-10-08T10:33:08.014Z");
assert.equal(__test.kpiCapturedAt([{ metadataKey: "sueds.kpi.full.last_captured_at", metadataValue: "inválido" }]), "");
assert.deepEqual(availabilityAlerts.alerts.find((item) => item.hotel === "SUEDS PLAZA")?.days.map((item) => item.date), ["2026-10-10", "2026-10-11"]);

const record = (overrides = {}) => ({
  dateKey: "2026-09-01",
  monthKey: "2026-09",
  reservationCode: "R-1",
  hotel: "SUEDS PLAZA",
  channel: "CENTRAL DE RESERVAS",
  rawChannel: "CENTRAL DE RESERVAS",
  seller: "Amanda Melgaco",
  checkin: "01/10/2026",
  checkout: "03/10/2026",
  days: "2",
  uh: "1",
  status: "Confirmada",
  source: "DESKHOTEL",
  total: 1000,
  ...overrides
});

const payload = __test.buildBiReportsPayload({
  records: [record(), record({ reservationCode: "R-2", dateKey: "2026-09-02", total: 500 })],
  otherChannelRecords: [
    record({ total: 9999 }),
    record({ reservationCode: "JUNIPER-3", dateKey: "2026-09-02", channel: "Azul Viagens", rawChannel: "Azul Viagens", seller: "", source: "JUNIPER", total: 1500 }),
    record({ reservationCode: "C-4", status: "Cancelada", total: 3000 })
  ],
  historicalRecords: [
    record({ reservationCode: "H-1", dateKey: "2025-09-01", monthKey: "2025-09", checkin: "01/10/2025", seller: "", source: "OMNIBEES", total: 900 }),
    record({ reservationCode: "H-1", dateKey: "2025-09-01", monthKey: "2025-09", checkin: "01/10/2025", seller: "", source: "OMNIBEES", total: 900 }),
    record({ reservationCode: "H-2", dateKey: "2025-09-02", monthKey: "2025-09", checkin: "03/10/2025", seller: "", source: "OMNIBEES", status: "Alterada", total: 100 }),
    record({ reservationCode: "H-3", dateKey: "2025-09-02", monthKey: "2025-09", checkin: "03/10/2025", seller: "", source: "CVC", status: "Cancelada", total: 500 })
  ],
  goals: [
    { month: "2026-09", type: "Hotel - Total Geral", channel: "", revenueGoal: 4000 },
    { month: "2026-09", type: "Venda Direta", channel: "", revenueGoal: 2000 },
    { month: "2026-09", type: "", channel: "SITE", revenueGoal: 500 },
    { month: "2026-09", type: "RDS - Hospedagem", hotel: "SUEDS PLAZA", channel: "", revenueGoal: 1000 }
  ]
}, { start: "2026-09-01", end: "2026-09-18" });

assert.equal(payload.comparison.available, true);
assert.deepEqual(payload.comparison.sources, ["CVC", "Omnibees"]);
assert.match(payload.comparison.coverage, /Base histórica de 2025 atualizada: CVC e Omnibees/);
assert.equal(payload.comparison.summary.sales, 1000);
assert.equal(payload.comparison.summary.reservations, 2);
assert.equal(payload.comparison.summary.roomNights, 4);
assert.equal(payload.comparison.summary.averageDailyRate, 250);
assert.equal(payload.comparison.daily[1].cumulative, 1000);
assert.equal(payload.comparison.byChannel.find((item) => item.label === "CENTRAL DE RESERVAS").value, 1000);
assert.equal(payload.comparison.byHotel.find((item) => item.label === "SUEDS PLAZA").value, 1000);
assert.equal(payload.comparison.byCheckinMonth.find((item) => item.key === "2026-10").value, 1000);
assert.equal(payload.summary.sales, 3000);
assert.equal(payload.summary.reservations, 3);
assert.equal(payload.summary.roomNights, 6);
assert.equal(payload.summary.averageDailyRate, 500);
assert.equal(payload.daily[1].cumulative, 3000);
assert.equal(payload.byChannel.find((item) => item.label === "Azul Viagens").value, 1500);
assert.equal(payload.byChannel.find((item) => item.label === "Azul Viagens").averageDailyRate, 750);
assert.deepEqual(payload.futureCheckinMonths, [{ key: "2026-10", label: "Out/2026", roomNights: 6, value: 3000 }]);
assert.equal(payload.channelShare.byHotel.find((item) => item.label === "SUEDS PLAZA").values.SUEDS, 1500);
assert.equal(payload.channelShare.byHotel.find((item) => item.label === "SUEDS PLAZA").values.AZUL, 1500);
const detailedShare = __test.buildBiReportsPayload({
  records: [record({ reservationCode: "DIRECT-1", total: 100 })],
  otherChannelRecords: [
    record({ reservationCode: "PARTNER-1", channel: "Airbnb", rawChannel: "Airbnb", seller: "", total: 300 }),
    record({ reservationCode: "PARTNER-2", channel: "MaxTour", rawChannel: "MaxTour", seller: "", total: 70 }),
    record({ reservationCode: "PARTNER-3", channel: "maxtour", rawChannel: "maxtour", seller: "", total: 50 })
  ]
}, { start: "2026-09-01", end: "2026-09-18" }).channelShare;
assert.deepEqual(detailedShare.groups, ["SUEDS", "AZUL", "CVC", "DECOLAR", "BOOKING", "ORINTER", "Airbnb", "MaxTour"]);
assert.equal(detailedShare.totals.values.Airbnb, 300);
assert.equal(detailedShare.totals.values.MaxTour, 120);
assert.equal(Object.values(detailedShare.totals.values).reduce((total, value) => total + value, 0), detailedShare.totals.total);
assert.equal(payload.channelHotelComparison.AZUL.current["SUEDS PLAZA"], 1500);
assert.equal(payload.monthlyGoalTables.find((table) => table.key === "sales").rows[0].actual, 3000);
assert.equal(payload.monthlyGoalTables.find((table) => table.key === "sales").rows[0].target, 4000);
assert.equal(payload.monthlyGoalTables.find((table) => table.key === "rds").rows[0].actual, null);
assert.equal(payload.monthlyGoalTables.find((table) => table.key === "rds").rows[0].target, 1000);
const rdsGoals = [
  { month: "2026-09", type: "RDS - Hospedagem", hotel: "SUEDS PLAZA", revenueGoal: 1209379 },
  { month: "2026-09", type: "RDS - Hospedagem", hotel: "SUEDS PREMIUM", revenueGoal: 282121 },
  { month: "2026-09", type: "RDS - Eventos", hotel: "SUEDS PLAZA", revenueGoal: 500000 }
];
const rdsDataset = { records: [record()], goals: rdsGoals };
assert.equal(__test.buildBiReportsPayload(rdsDataset, { start: "2026-09-01", end: "2026-09-30" })
  .monthlyGoalTables.find((table) => table.key === "rds").rows[0].target, 1491500);
assert.equal(__test.buildBiReportsPayload(rdsDataset, { start: "2026-09-01", end: "2026-09-30", hotel: "SUEDS PLAZA" })
  .monthlyGoalTables.find((table) => table.key === "rds").rows[0].target, 1209379);
assert.equal(payload.daily.at(-1).averageDailyRate, 500);
assert.equal(payload.pickup[0].daily.at(-1).cumulative, 3000);
assert.equal(payload.pickup[0].comparisonDaily.at(-1).cumulative, 1000);
assert.equal(payload.revpar.summary.availableRoomNights, 5580);
assert.equal(payload.comparison.revpar.summary.availableRoomNights, 5580);
assert.equal(payload.revpar.summary.revpar, 0);
assert.ok(Math.abs(payload.revpar.summary.revpar - (payload.revpar.summary.averageDailyRate * payload.revpar.summary.occupancyRate / 100)) < 0.000001);
assert.equal(payload.comparison.revpar.summary.revpar, 0);
assert.equal(payload.revpar.byHotel.find((item) => item.label === "SUEDS PLAZA").apartments, 116);
assert.equal(payload.revpar.byHotel.find((item) => item.label === "SUEDS PLAZA").revpar, 0);
assert.equal(payload.revpar.byCheckinMonth[0].key, "2026-10");
assert.ok(Math.abs(payload.revpar.byCheckinMonth[0].revpar - (payload.revpar.byCheckinMonth[0].averageDailyRate * payload.revpar.byCheckinMonth[0].occupancyRate / 100)) < 0.000001);

const pastCheckinPayload = __test.buildBiReportsPayload({
  records: [record({ reservationCode: "PAST-1", checkin: "20/08/2026", checkout: "22/08/2026", total: 700 })],
  otherChannelRecords: []
}, { start: "2026-09-01", end: "2026-09-18" });
assert.deepEqual(pastCheckinPayload.futureCheckinMonths, []);

const sameMonthCheckinPayload = __test.buildBiReportsPayload({
  records: [record({ reservationCode: "SAME-1", dateKey: "2026-08-01", monthKey: "2026-08", checkin: "20/08/2026", checkout: "22/08/2026", total: 700 })],
  otherChannelRecords: []
}, { start: "2026-08-01", end: "2026-08-31" });
assert.deepEqual(sameMonthCheckinPayload.futureCheckinMonths, [{ key: "2026-08", label: "Ago/2026", roomNights: 2, value: 700 }]);

const filtered = __test.buildBiReportsPayload({ records: [record()], otherChannelRecords: [] }, {
  start: "2026-09-01",
  end: "2026-09-18",
  hotel: "SUEDS SEGUNDO SOL"
});
assert.equal(filtered.summary.sales, 0);

const multiChannel = __test.buildBiReportsPayload({
  records: [
    record({ reservationCode: "MULTI-1", channel: "CVC", rawChannel: "CVC", total: 100 }),
    record({ reservationCode: "MULTI-2", channel: "Booking", rawChannel: "Booking", total: 200 }),
    record({ reservationCode: "MULTI-3", channel: "Airbnb", rawChannel: "Airbnb", total: 300 })
  ],
  historicalRecords: [
    record({ reservationCode: "MULTI-25-1", dateKey: "2025-09-01", channel: "CVC", rawChannel: "CVC", total: 50 }),
    record({ reservationCode: "MULTI-25-2", dateKey: "2025-09-01", channel: "Booking", rawChannel: "Booking", total: 60 }),
    record({ reservationCode: "MULTI-25-3", dateKey: "2025-09-01", channel: "Airbnb", rawChannel: "Airbnb", total: 70 })
  ]
}, { start: "2026-09-01", end: "2026-09-18", channels: ["CVC", "Booking"] });
assert.deepEqual(multiChannel.selected.channels, ["CVC", "Booking"]);
assert.equal(multiChannel.summary.sales, 300);
assert.equal(multiChannel.comparison.summary.sales, 110);
assert.deepEqual(multiChannel.byChannel.map((item) => item.label).sort(), ["Booking", "CVC"]);
const cachedMultiChannel = __test.buildCachedBiKpiReportsPayload({ loadedAt: "multi-channel-test", records: [
  record({ reservationCode: "CACHE-1", channel: "CVC", rawChannel: "CVC", total: 100 }),
  record({ reservationCode: "CACHE-2", channel: "Booking", rawChannel: "Booking", total: 200 })
] }, { start: "2026-09-01", end: "2026-09-18", channels: ["CVC", "Booking"] });
assert.equal(cachedMultiChannel.summary.sales, 300);

const kpiRows = [
  ["Hotel", "Depósito", "Origem", "Reserva", "Titular", "IN", "OUT", "Diária", "ADT", "CHD", "Apto", "Localizador", "Status", "RN", "ANT", "D.Res", "Pen", "Hóspede", "I.D.", "Nº", "Tipo", "Piso", "Vista", "Total"],
  ["SUEDS PLAZA", "", "AZUL VIAGENS E TURISMO LTDA.", "42726", "Cliente", "22/02/2026", "28/02/2026", 286.33, 2, 0, "101", "LOC", "Check out", 6, "", "01/01/2026", "", "", "", "", "", "", "", 1717.98],
  ["SUEDS PLAZA", "", "AZUL VIAGENS E TURISMO LTDA.", "42726", "Cliente", "22/02/2026", "28/02/2026", 286.33, 2, 0, "102", "LOC", "Check out", 0, "", "01/01/2026", "", "", "", "", "", "", "", 1717.99],
  ["SUEDS PLAZA", "", "CVC", "42769", "Cliente 2", "24/03/2026", "28/03/2026", 319.2, 2, 2, "134", "LOC2", "Check out", 4, "", "03/01/2026", "", "", "", "", "", "", "", 2234.4],
  ["SUEDS PLAZA", "", "CVC", "42769", "Cliente 2", "28/03/2026", "31/03/2026", 319.2, 2, 2, "213", "LOC2", "Check out", 3, "", "03/01/2026", "", "", "", "", "", "", "", 2234.4],
  ["SUEDS PLAZA", "", "CVC", "42769", "Cliente 2", "28/03/2026", "31/03/2026", 319.2, 2, 2, "213", "LOC2", "Check out", 3, "", "03/01/2026", "", "", "", "", "", "", "", 2234.4]
];
const normalizedKpi = __test.normalizeKpiReportRows(kpiRows, 2025);
const compactKpiObjects = __test.kpiObjectsFromColumnRanges([
  kpiRows.map((row) => row.slice(0, 4)),
  kpiRows.map((row) => row.slice(5, 8)),
  kpiRows.map((row) => row.slice(10, 14)),
  kpiRows.map((row) => row.slice(15, 16)),
  kpiRows.map((row) => row.slice(23, 24))
]);
assert.deepEqual(__test.normalizeKpiReportObjects(compactKpiObjects, 2025), normalizedKpi);
assert.equal(normalizedKpi.length, 2);
assert.equal(normalizedKpi[0].dateKey, "2025-01-01");
assert.equal(normalizedKpi[0].checkin, "22/02/2025");
assert.equal(normalizedKpi[0].channel, "Azul Viagens");
assert.equal(normalizedKpi[0].days, "6");
assert.equal(normalizedKpi[0].total, 1717.98);
assert.equal(normalizedKpi[0].status, "Confirmada");
assert.equal(normalizedKpi[0].reservationCount, 1);
const multiApartment = normalizedKpi.find((item) => item.reservationCode === "42769");
assert.equal(multiApartment.reservationCount, 1);
assert.equal(multiApartment.days, "7");
assert.equal(multiApartment.total, 2234.4);

const repeatedReservation = __test.normalizeKpiReportRows([
  kpiRows[0],
  ["SUEDS PLAZA", "", "CVC", "49210", "Cliente", "25/09/2026", "29/09/2026", 646.78, 2, 0, 201, "LOC", "Confirmada", 4, "", "01/09/2026", "", "", "", "", "", "", "", 2587.1],
  ["SUEDS PLAZA", "", "CVC", "49210", "Cliente", "25/09/2026", "29/09/2026", 646.78, 2, 0, 120, "LOC", "Confirmada", 4, "", "01/09/2026", "", "", "", "", "", "", "", 2587.1]
], 2026);
assert.equal(repeatedReservation.length, 1);
assert.equal(repeatedReservation[0].reservationCount, 1);
assert.equal(repeatedReservation[0].days, "4");
assert.equal(repeatedReservation[0].total, 2587.12);
const repeatedReservationReport = __test.buildBiReportsPayload({ audience: "bi-relatorios-kpi", records: repeatedReservation }, { start: "2026-09-01", end: "2026-09-01" });
assert.equal(repeatedReservationReport.summary.reservations, 1);
assert.equal(repeatedReservationReport.summary.sales, 2587.12);
assert.equal(repeatedReservationReport.summary.roomNights, 4);

const kpiOnlyReport = __test.buildBiReportsPayload({
  audience: "bi-relatorios-kpi",
  records: [record({ reservationCode: "49321", dateKey: "2026-09-05", total: 3824.76, source: "KPI FULL" })],
  otherChannelRecords: [record({ reservationCode: "RES035889-11640", dateKey: "2026-09-05", total: 3824.76, channel: "SITE", rawChannel: "SITE" })]
}, { start: "2026-09-05", end: "2026-09-05", hotel: "SUEDS PLAZA" });
assert.equal(kpiOnlyReport.summary.sales, 3824.76);
assert.equal(kpiOnlyReport.summary.reservations, 1);

const cancellationDataset = {
  audience: "bi-relatorios-kpi",
  records: [
    record({ reservationCode: "DIRECT-SOLD", channel: "Reserva Direta", rawChannel: "Reserva Direta", source: "KPI FULL", total: 1000 }),
    record({ reservationCode: "DIRECT-CANCELLED", channel: "Reserva Direta", rawChannel: "Reserva Direta", source: "KPI FULL", status: "Cancelada", total: 250 }),
    record({ reservationCode: "DIRECT-CANCELLED", channel: "Reserva Direta", rawChannel: "Reserva Direta", source: "KPI FULL", status: "Cancelada", total: 250 }),
    record({ reservationCode: "BOOKING-CANCELLED", channel: "Booking", rawChannel: "Booking", source: "KPI FULL", status: "Cancelada", total: 200 })
  ],
  historicalRecords: [
    record({ reservationCode: "PRIOR-SOLD", dateKey: "2025-09-01", channel: "Reserva Direta", rawChannel: "Reserva Direta", source: "KPI FULL", total: 400 }),
    record({ reservationCode: "PRIOR-CANCELLED", dateKey: "2025-09-01", channel: "Reserva Direta", rawChannel: "Reserva Direta", source: "KPI FULL", status: "Cancelada", total: 100 })
  ]
};
const cancellationReport = __test.buildBiReportsPayload(cancellationDataset,
  { start: "2026-09-01", end: "2026-09-18", hotel: "SUEDS PLAZA" });
assert.equal(cancellationReport.summary.sales, 1000);
assert.deepEqual(cancellationReport.cancellations.byChannel.find((item) => item.label === "Reserva Direta"),
  { label: "Reserva Direta", value: 250, sales: 1000, reservations: 1, rate: 25 });
assert.equal(cancellationReport.comparison.cancellations.byChannel.find((item) => item.label === "Reserva Direta").rate, 25);
assert.equal(cancellationReport.cancellations.byChannel.find((item) => item.label === "Booking").rate, null);
assert.ok(cancellationReport.filters.channels.includes("Booking"));
assert.deepEqual(__test.buildBiReportsPayload(cancellationDataset,
  { start: "2026-09-01", end: "2026-09-18", channels: ["Reserva Direta"] }).cancellations.byChannel.map((item) => item.label), ["Reserva Direta"]);

assert.equal(__test.kpiLatestSaleDate([
  { "D.Res": "25/09/2026" },
  { "D.Res": "26/09/2026" },
  { "D.Res": "" }
]), "2026-09-26");
const kpiCoverageDataset = {
  audience: "bi-relatorios-kpi",
  kpiLatestSaleDate: "2026-09-26",
  records: [record({ reservationCode: "COVERAGE-1", dateKey: "2026-09-25", source: "KPI FULL" })]
};
const pastCoverage = __test.buildBiReportsPayload(kpiCoverageDataset, { start: "2026-09-01", end: "2026-09-27" });
assert.deepEqual(pastCoverage.dataCoverage, { baseUpdatedAt: "", latestSaleDate: "2026-09-26", queryEndBeyondAvailable: true });
assert.equal(pastCoverage.summary.sales, 1000);
const withinCoverage = __test.buildBiReportsPayload(kpiCoverageDataset, { start: "2026-09-01", end: "2026-09-26" });
assert.equal(withinCoverage.dataCoverage.queryEndBeyondAvailable, false);
assert.equal(payload.dataCoverage, null);

for (const year of [2025, 2026]) {
  const creditReservation = __test.normalizeKpiReportRows([
    kpiRows[0],
    ["SUEDS PLAZA", "", "Reserva Direta", "43099", "Crédito", "29/05", "03/06", "1.811,05", 2, 0, "112", "", "Confirmada", 5, "", `10/01/${year}`, "", "", "", "", "", "", "", "670.088,50"],
    ["SUEDS PLAZA", "", "CVC", "SEG-1", "Cliente", "24/03", "28/03", "319,20", 2, 0, "134", "", "Confirmada", 4, "", `10/01/${year}`, "", "", "", "", "", "", "", "2.234,40"],
    ["SUEDS PLAZA", "", "CVC", "SEG-1", "Cliente", "28/03", "31/03", "319,20", 2, 0, "213", "", "Confirmada", 3, "", `10/01/${year}`, "", "", "", "", "", "", "", "2.234,40"],
    ["SUEDS PLAZA", "", "CVC", "SEG-1", "Cliente", "28/03", "31/03", "319,20", 2, 0, "120", "", "Confirmada", 3, "", `10/01/${year}`, "", "", "", "", "", "", "", "2.234,40"]
  ], year);
  assert.equal(creditReservation.length, 2);
  assert.equal(creditReservation.find((item) => item.reservationCode === "43099").total, 9055.25);
  assert.equal(creditReservation.find((item) => item.reservationCode === "SEG-1").total, 2234.4);
  assert.equal(creditReservation.find((item) => item.reservationCode === "SEG-1").days, "7");
}

const zeroRateStay = __test.normalizeKpiReportRows([
  kpiRows[0],
  ["SUEDS PLAZA", "", "Reserva Direta", "ZERO-1", "Cliente", "10/02", "14/02", 0, 2, 0, "101", "", "Bloqueio", 4, "", "10/01/2026", "", "", "", "", "", "", "", 0]
], 2026);
assert.equal(zeroRateStay.length, 1);
assert.equal(zeroRateStay[0].total, 0);
assert.equal(zeroRateStay[0].days, "4");

const rolloverKpi = __test.normalizeKpiReportRows([
  kpiRows[0],
  ["SUEDS PLAZA", "", "Azul Viagens", "ROLLOVER-1", "Cliente", "02/01", "07/01", 500, 2, 0, "101", "LOC", "Confirmada", 5, "", "18/09", "", "", "", "", "", "", "", 2500]
], 2026);
assert.equal(rolloverKpi[0].dateKey, "2026-09-18");
assert.equal(rolloverKpi[0].checkin, "02/01/2027");
assert.equal(rolloverKpi[0].checkout, "07/01/2027");

const shortDateNextYearKpi = __test.normalizeKpiReportRows([
  kpiRows[0],
  ["SUEDS PLAZA", "", "Azul Viagens", "NEXT-YEAR-1", "Cliente", "10/03", "15/03", 500, 2, 0, "101", "LOC", "Confirmada", 5, "", "18/08", "", "", "", "", "", "", "", 2500]
], 2026);
assert.equal(shortDateNextYearKpi[0].dateKey, "2026-08-18");
assert.equal(shortDateNextYearKpi[0].checkin, "10/03/2027");
assert.equal(shortDateNextYearKpi[0].checkout, "15/03/2027");

const sameMonthPastStay = __test.normalizeKpiReportRows([
  kpiRows[0],
  ["SUEDS VILA ROMANA", "", "AIRBNB PLATAFORMA", "VILA-PAST", "Cliente", "08/09", "09/09", 500, 1, 0, "42", "", "Confirmada", 1, "", "18/09/2026", "", "", "", "", "", "", "", 500]
], 2026);
assert.equal(sameMonthPastStay[0].hotel, "CASAS SUEDS ARRAIAL");
assert.equal(sameMonthPastStay[0].checkin, "08/09/2026");
assert.equal(sameMonthPastStay[0].checkout, "09/09/2026");

const additionalKpiStatuses = __test.normalizeKpiReportRows([
  kpiRows[0],
  ["SUEDS PLAZA", "", "CVC", "STATUS-1", "Cliente", "01/10/2026", "02/10/2026", 100, 2, 0, "101", "", "Bloqueio", 1, "", "01/09/2026", "", "", "", "", "", "", "", 100],
  ["SUEDS PLAZA", "", "CVC", "STATUS-2", "Cliente", "02/10/2026", "03/10/2026", 200, 2, 0, "102", "", "Manutenção", 1, "", "02/09/2026", "", "", "", "", "", "", "", 200],
  ["SUEDS PLAZA", "", "CVC", "STATUS-3", "Cliente", "03/10/2026", "04/10/2026", 300, 2, 0, "103", "", "No Hotel", 1, "", "03/09/2026", "", "", "", "", "", "", "", 300],
  ["SUEDS PLAZA", "", "CVC", "STATUS-4", "Cliente", "04/10/2026", "05/10/2026", 400, 2, 0, "104", "", "Transferência - out", 1, "", "04/09/2026", "", "", "", "", "", "", "", 400]
], 2026);
assert.equal(additionalKpiStatuses.length, 4);
assert.ok(additionalKpiStatuses.every((item) => item.status === "Confirmada"));
assert.equal(additionalKpiStatuses.reduce((total, item) => total + item.total, 0), 1000);

const weightedKpi = __test.buildBiReportsPayload({ records: [
  record({ reservationCode: "KPI-2", reservationCount: 2, total: 2000 })
], otherChannelRecords: [] }, { start: "2026-09-01", end: "2026-09-18" });
assert.equal(weightedKpi.summary.reservations, 2);
assert.equal(weightedKpi.summary.ticketAverage, 1000);
assert.equal(weightedKpi.daily[0].reservations, 2);

const occupancyPayload = __test.buildBiReportsPayload({
  audience: "bi-relatorios-kpi",
  records: [record({ reservationCode: "OCC-1", checkin: "02/09/2026", checkout: "04/09/2026", reservationCount: 2 })]
}, { start: "2026-09-01", end: "2026-09-05", hotel: "SUEDS PLAZA" });
assert.equal(occupancyPayload.occupancy[0].apartments, 116);
assert.equal(occupancyPayload.occupancy[0].days[1].occupied, 2);
assert.equal(occupancyPayload.occupancy[0].days[1].available, 114);
assert.equal(occupancyPayload.occupancy[0].days[3].occupied, 0);
const maintenanceObjects = Array.from({ length: 10 }, (_, index) => ({
  Hotel: "SUEDS PLAZA", Origem: "Governança", Reserva: `BLOCK-${index}`,
  IN: "02/09", OUT: "03/09", Apto: String(200 + index),
  Status: "Bloqueio", RN: 1, "D.Res": "01/09/2026", "Diária": "0,00", Total: "0,00"
}));
maintenanceObjects.push({ ...maintenanceObjects[0], Reserva: "BLOCK-DUPLICATE" });
maintenanceObjects.push({ ...maintenanceObjects[1], Reserva: "BLOCK-CANCELLED", Apto: "999", Status: "Cancelada" });
assert.equal(__test.normalizeKpiReportObjects(maintenanceObjects, 2026).length, 0);
const maintenanceBlocks = __test.normalizeKpiMaintenanceObjects(maintenanceObjects, 2026);
assert.equal(maintenanceBlocks.length, 11);
const maintenancePayload = __test.buildBiReportsPayload({
  audience: "bi-relatorios-kpi",
  records: [record({ reservationCode: "MAINT-OCC", checkin: "02/09/2026", checkout: "03/09/2026", reservationCount: 50 })],
  maintenanceBlocks
}, { start: "2026-09-02", end: "2026-09-03", hotel: "SUEDS PLAZA", channel: "CENTRAL DE RESERVAS" });
assert.equal(maintenancePayload.occupancy[0].days[0].maintenance, 10);
assert.equal(maintenancePayload.occupancy[0].days[0].occupied, 50);
assert.equal(maintenancePayload.occupancy[0].days[0].available, 56);
assert.ok(Math.abs(maintenancePayload.occupancy[0].days[0].rate - 50 / 106 * 100) < 0.000001);
assert.equal(maintenancePayload.occupancy[0].days[1].maintenance, 0);
assert.equal(maintenancePayload.revpar.summary.availableRoomNights, 222);
assert.ok(Math.abs(maintenancePayload.revpar.summary.occupancyRate - 50 / 222 * 100) < 0.000001);
assert.equal(occupancyPayload.monthlyGoalTables.find((table) => table.key === "rds").rows[0].actual, 1000);
const sitePayload = __test.buildBiReportsPayload({ records: [], otherChannelRecords: [record({ channel: "SITE", rawChannel: "SITE", reservationCode: "SITE-1", total: 700 })], historicalRecords: [] }, { start: "2026-09-01", end: "2026-09-18" });
assert.equal(sitePayload.monthlyGoalTables.find((table) => table.key === "site").rows[0].actual, 700);
assert.equal(sitePayload.monthlyGoalTables.find((table) => table.key === "direct").rows[0].actual, 700);
const bookingEnginePayload = __test.buildBiReportsPayload({
  audience: "bi-relatorios-kpi",
  records: [
    record({ reservationCode: "ENGINE-1", rawChannel: "BookingEngine", channel: "BookingEngine", total: 100 }),
    record({ reservationCode: "ENGINE-2", rawChannel: "Booking Engine", channel: "Booking Engine", total: 200 }),
    record({ reservationCode: "ENGINE-3", rawChannel: "BE mobile", channel: "BE mobile", total: 300 }),
    record({ reservationCode: "OTA-1", rawChannel: "Booking", channel: "Booking", total: 400 })
  ]
}, { start: "2026-09-01", end: "2026-09-01", hotel: "SUEDS PLAZA" });
assert.equal(bookingEnginePayload.summary.sales, 1000);
assert.equal(bookingEnginePayload.monthlyGoalTables.find((table) => table.key === "site").rows[0].actual, 600);
assert.equal(bookingEnginePayload.monthlyGoalTables.find((table) => table.key === "direct").rows[0].actual, 600);
assert.equal(bookingEnginePayload.channelShare.totals.values.SUEDS, 600);
assert.equal(bookingEnginePayload.channelShare.totals.values.BOOKING, 400);
assert.equal(bookingEnginePayload.byChannel.find((channel) => channel.label === "SITE SUEDS").value, 600);
assert.deepEqual(bookingEnginePayload.monthlyGoalTables.map((table) => table.title), [
  "Meta de Vendas", "META RDS Hospedagem", "Meta Venda Direta", "Meta do Site"
]);
assert.ok(Math.abs(occupancyPayload.revpar.summary.revpar - (occupancyPayload.revpar.summary.averageDailyRate * occupancyPayload.revpar.summary.occupancyRate / 100)) < 0.000001);
assert.ok(Math.abs(occupancyPayload.revpar.byHotel[0].revpar - (occupancyPayload.revpar.byHotel[0].averageDailyRate * occupancyPayload.revpar.byHotel[0].occupancyRate / 100)) < 0.000001);
const overbookingPayload = __test.buildBiReportsPayload({ audience: "bi-relatorios-kpi", records: [record({ reservationCode: "OVER-1", checkin: "02/09/2026", checkout: "03/09/2026", reservationCount: 119 })] }, { start: "2026-09-02", end: "2026-09-02", hotel: "SUEDS PLAZA" });
assert.equal(overbookingPayload.occupancy[0].days[0].available, -3);
const newYearOccupancy = __test.buildBiReportsPayload({ audience: "bi-relatorios-kpi", records: [record({ reservationCode: "NEW-YEAR", checkin: "31/12/2026", checkout: "03/01/2027" })] }, { start: "2026-12-31", end: "2027-01-03", hotel: "SUEDS PLAZA" });
assert.deepEqual(newYearOccupancy.occupancy[0].days.map((day) => day.occupied), [1, 1, 1, 0]);
const vilaRomanaPayload = __test.buildBiReportsPayload({ audience: "bi-relatorios-kpi", records: [record({ hotel: "CASAS SUEDS ARRAIAL", reservationCode: "VILA-1", checkin: "02/09/2026", checkout: "03/09/2026" })] }, { start: "2026-09-02", end: "2026-09-02", hotel: "SUEDS VILA ROMANA" });
assert.equal(vilaRomanaPayload.occupancy[0].hotel, "CASAS SUEDS ARRAIAL");
assert.equal(vilaRomanaPayload.occupancy[0].days[0].occupied, 1);

const kpiHeaders = Array.from({ length: 24 }, (_, index) => `Campo ${index + 1}`);
kpiHeaders[0] = "Hotel";
kpiHeaders[1] = "Depósito";
kpiHeaders[2] = "Origem";
kpiHeaders[3] = "Reserva";
kpiHeaders[5] = "IN";
kpiHeaders[6] = "OUT";
kpiHeaders[7] = "Diária";
kpiHeaders[10] = "Apto";
kpiHeaders[12] = "Status";
kpiHeaders[13] = "RN";
kpiHeaders[15] = "D.Res";
kpiHeaders[23] = "Total";
const kpiSourceRow = (hotel, channel, date, checkin, total, code, apartment = 0) => {
  const row = Array(24).fill("");
  row[0] = hotel;
  row[1] = "1.234,56";
  row[2] = channel;
  row[3] = code;
  row[5] = checkin;
  row[6] = "05/10/2026";
  row[7] = 586.43;
  row[10] = apartment;
  row[12] = "Confirmada";
  row[13] = 2;
  row[15] = date;
  row[23] = total;
  return row;
};
const directKpiSource = [kpiHeaders,
  kpiSourceRow("SUEDS PLAZA", "Reserva Direta", "12/09/2026", "03/10/2026", 200, "DIRECT-1"),
  kpiSourceRow("SUEDS PLAZA", "CENTRAL DE VENDAS", "12/09/2026", "03/10/2026", 400, "DIRECT-2"),
  kpiSourceRow("SUEDS PLAZA", "CENTRAL DE RESERVAS", "12/09/2026", "03/10/2026", 300, "DIRECT-3"),
  kpiSourceRow("SUEDS PLAZA", "CR Soluções", "12/09/2026", "03/10/2026", 100, "DIRECT-4"),
  kpiSourceRow("SUEDS PLAZA", "Grupos Reserva", "12/09/2026", "03/10/2026", 150, "DIRECT-5"),
  kpiSourceRow("SUEDS PLAZA", "Walk in", "12/09/2026", "03/10/2026", 250, "DIRECT-6")
];
directKpiSource[1][7] = 100;
directKpiSource[2][7] = 200;
directKpiSource[3][7] = 150;
directKpiSource[4][7] = 50;
directKpiSource[5][7] = 75;
directKpiSource[6][7] = 125;
const directKpiRecords = __test.normalizeKpiReportRows(directKpiSource, 2026);
assert.deepEqual(directKpiRecords.map((item) => item.channel), Array(6).fill("Reserva Direta"));
const priorDirectKpiSource = directKpiSource.map((row, index) => index === 0 ? row : [
  ...row.slice(0, 5), "03/10/2025", "05/10/2025", ...row.slice(7, 15), "12/09/2025", ...row.slice(16)
]);
const directKpiPayload = __test.buildBiReportsPayload({
  audience: "bi-relatorios-kpi",
  records: directKpiRecords,
  historicalRecords: __test.normalizeKpiReportRows(priorDirectKpiSource, 2025)
}, { start: "2026-09-01", end: "2026-09-18" });
assert.deepEqual(directKpiPayload.filters.channels, ["Reserva Direta"]);
assert.equal(directKpiPayload.byChannel.find((item) => item.label === "Reserva Direta").value, 1400);
assert.equal(directKpiPayload.comparison.byChannel.find((item) => item.label === "Reserva Direta").value, 1400);
assert.equal(directKpiPayload.channelShare.totals.values.SUEDS, 1400);
assert.equal(__test.buildBiReportsPayload({ audience: "bi-relatorios-kpi", records: directKpiRecords },
  { start: "2026-09-01", end: "2026-09-18", channels: ["Reserva Direta"] }).summary.sales, 1400);
assert.equal(__test.filterBiKpiSourceRows(directKpiSource,
  { start: "2026-09-01", end: "2026-09-18", channels: ["Reserva Direta"] }).length, 6);
const siteKpiSource = [kpiHeaders, ...directKpiSource.slice(1),
  kpiSourceRow("SUEDS PLAZA", "BookingEngine", "12/09/2026", "03/10/2026", 200, "SITE-1"),
  kpiSourceRow("SUEDS PLAZA", "BE mobile", "12/09/2026", "03/10/2026", 300, "SITE-2"),
  kpiSourceRow("SUEDS PLAZA", "SITE", "12/09/2026", "03/10/2026", 100, "SITE-3"),
  kpiSourceRow("SUEDS PLAZA", "Booking", "12/09/2026", "03/10/2026", 400, "OTA-1")
];
[100, 150, 50, 200].forEach((rate, index) => { siteKpiSource[index + 7][7] = rate; });
const siteKpiRecords = __test.normalizeKpiReportRows(siteKpiSource, 2026);
const siteKpiPayload = __test.buildBiReportsPayload({ audience: "bi-relatorios-kpi", records: siteKpiRecords },
  { start: "2026-09-01", end: "2026-09-18" });
assert.equal(siteKpiPayload.byChannel.find((item) => item.label === "Reserva Direta").value, 2000);
assert.equal(siteKpiPayload.byChannel.find((item) => item.label === "Booking").value, 400);
assert.equal(siteKpiPayload.channelShare.totals.values.SUEDS, 2000);
assert.equal(siteKpiPayload.monthlyGoalTables.find((table) => table.key === "direct").rows[0].actual, 2000);
assert.equal(siteKpiPayload.monthlyGoalTables.find((table) => table.key === "site").rows[0].actual, 600);
assert.equal(siteKpiRecords.filter((item) => item.kpiSiteSale).length, 3);
assert.equal(__test.filterBiKpiSourceRows(siteKpiSource,
  { start: "2026-09-01", end: "2026-09-18", channels: ["Reserva Direta"] }).length, 9);
const historicalSiteRow = [...siteKpiSource[7]];
historicalSiteRow[5] = "03/10/2025";
historicalSiteRow[6] = "05/10/2025";
historicalSiteRow[15] = "12/09/2025";
assert.equal(__test.normalizeKpiReportRows([kpiHeaders, historicalSiteRow], 2025)[0].channel, "Reserva Direta");
const kpiSource = [kpiHeaders,
  kpiSourceRow("SUEDS PLAZA", "CVC", "12/09/2026", "03/10/2026", 1200.5, "TEST-1"),
  kpiSourceRow("SUEDS PLAZA", "CVC", "12/09/2026", "03/10/2026", 1200.5, "TEST-1", 120),
  kpiSourceRow("SUEDS PLAZA", "CVC", "19/09/2026", "03/10/2026", 900, "TEST-2"),
  kpiSourceRow("SUEDS PREMIUM", "CVC", "12/09/2026", "03/10/2026", 700, "TEST-3"),
  kpiSourceRow("SUEDS PLAZA", "Airbnb", "12/09/2026", "03/10/2026", 600, "TEST-4")
];
const kpiExportQuery = { start: "2026-09-01", end: "2026-09-18", hotel: "SUEDS PLAZA", channels: ["CVC"], checkinMonth: "2026-10" };
assert.equal(__test.filterBiKpiSourceRows(kpiSource, kpiExportQuery).length, 1);
assert.equal(__test.filterBiKpiSourceRows(kpiSource, kpiExportQuery)[0][23], 1172.86);
assert.equal(__test.filterBiKpiSourceRows(kpiSource, kpiExportQuery)[0][24], 1200.5);
__test.buildBiKpiSourceWorkbook(kpiSource, kpiExportQuery).then(async (buffer) => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Base KPI 2026");
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getCell("D2").value, "TEST-1");
  assert.equal(sheet.getCell("K2").value, 120);
  assert.equal(sheet.getCell("N2").value, 2);
  assert.equal(sheet.getCell("B2").value, 1234.56);
  assert.equal(sheet.getCell("H2").value, 586.43);
  assert.equal(sheet.getCell("X2").value, 1172.86);
  assert.equal(sheet.getCell("Y2").value, 1200.5);
  ["B2", "H2", "X2", "Y2"].forEach((address) => assert.equal(sheet.getCell(address).numFmt, "#,##0.00"));
  assert.equal(sheet.getCell("A1").value, "Hotel");
  assert.equal(sheet.getCell("X1").value, "Venda (KPI)");
  assert.equal(sheet.getCell("Y1").value, "Total bruto (planilha)");
  assert.ok(sheet.getCell("P2").value instanceof Date);
  console.log("BI validado com deduplicação, filtros, comparativo e exportação XLSX.");
}).catch((error) => { console.error(error); process.exitCode = 1; });
