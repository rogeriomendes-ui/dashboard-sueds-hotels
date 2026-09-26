const assert = require("node:assert/strict");
const { __test } = require("../server");

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
assert.equal(payload.daily.at(-1).averageDailyRate, 500);
assert.equal(payload.pickup[0].daily.at(-1).cumulative, 3000);
assert.equal(payload.pickup[0].comparisonDaily.at(-1).cumulative, 1000);
assert.equal(payload.revpar.summary.availableRoomNights, 5598);
assert.equal(payload.comparison.revpar.summary.availableRoomNights, 5598);
assert.equal(payload.revpar.summary.revpar, 0);
assert.ok(Math.abs(payload.revpar.summary.revpar - (payload.revpar.summary.averageDailyRate * payload.revpar.summary.occupancyRate / 100)) < 0.000001);
assert.equal(payload.comparison.revpar.summary.revpar, 0);
assert.equal(payload.revpar.byHotel.find((item) => item.label === "SUEDS PLAZA").apartments, 117);
assert.equal(payload.revpar.byHotel.find((item) => item.label === "SUEDS PLAZA").revpar, 0);
assert.equal(payload.revpar.byCheckinMonth[0].key, "2026-10");
assert.ok(Math.abs(payload.revpar.byCheckinMonth[0].revpar - (payload.revpar.byCheckinMonth[0].averageDailyRate * payload.revpar.byCheckinMonth[0].occupancyRate / 100)) < 0.000001);

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
  kpiRows.map((row) => row.slice(5, 7)),
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
assert.ok(Math.abs(normalizedKpi[0].total - 3435.97) < 0.000001);
assert.equal(normalizedKpi[0].status, "Confirmada");
assert.equal(normalizedKpi[0].reservationCount, 2);
const multiApartment = normalizedKpi.find((item) => item.reservationCode === "42769");
assert.equal(multiApartment.reservationCount, 2);
assert.equal(multiApartment.days, "7");
assert.equal(multiApartment.total, 4468.8);

const rolloverKpi = __test.normalizeKpiReportRows([
  kpiRows[0],
  ["SUEDS PLAZA", "", "Azul Viagens", "ROLLOVER-1", "Cliente", "02/01", "07/01", 500, 2, 0, "101", "LOC", "Confirmada", 5, "", "18/09", "", "", "", "", "", "", "", 2500]
], 2026);
assert.equal(rolloverKpi[0].dateKey, "2026-09-18");
assert.equal(rolloverKpi[0].checkin, "02/01/2027");
assert.equal(rolloverKpi[0].checkout, "07/01/2027");

const sameMonthPastStay = __test.normalizeKpiReportRows([
  kpiRows[0],
  ["SUEDS VILA ROMANA", "", "AIRBNB PLATAFORMA", "VILA-PAST", "Cliente", "08/09", "09/09", 500, 1, 0, "42", "", "Confirmada", 1, "", "18/09/2026", "", "", "", "", "", "", "", 500]
], 2026);
assert.equal(sameMonthPastStay[0].hotel, "SUEDS VILA ROMANA");
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
assert.equal(occupancyPayload.occupancy[0].apartments, 117);
assert.equal(occupancyPayload.occupancy[0].days[1].occupied, 2);
assert.equal(occupancyPayload.occupancy[0].days[1].available, 115);
assert.equal(occupancyPayload.occupancy[0].days[3].occupied, 0);
assert.ok(Math.abs(occupancyPayload.revpar.summary.revpar - (occupancyPayload.revpar.summary.averageDailyRate * occupancyPayload.revpar.summary.occupancyRate / 100)) < 0.000001);
assert.ok(Math.abs(occupancyPayload.revpar.byHotel[0].revpar - (occupancyPayload.revpar.byHotel[0].averageDailyRate * occupancyPayload.revpar.byHotel[0].occupancyRate / 100)) < 0.000001);
const overbookingPayload = __test.buildBiReportsPayload({ audience: "bi-relatorios-kpi", records: [record({ reservationCode: "OVER-1", checkin: "02/09/2026", checkout: "03/09/2026", reservationCount: 119 })] }, { start: "2026-09-02", end: "2026-09-02", hotel: "SUEDS PLAZA" });
assert.equal(overbookingPayload.occupancy[0].days[0].available, -2);
const vilaRomanaPayload = __test.buildBiReportsPayload({ audience: "bi-relatorios-kpi", records: [record({ hotel: "CASAS SUEDS ARRAIAL", reservationCode: "VILA-1", checkin: "02/09/2026", checkout: "03/09/2026" })] }, { start: "2026-09-02", end: "2026-09-02", hotel: "SUEDS VILA ROMANA" });
assert.equal(vilaRomanaPayload.occupancy[0].hotel, "CASAS SUEDS ARRAIAL");
assert.equal(vilaRomanaPayload.occupancy[0].days[0].occupied, 1);

console.log("BI validado com deduplicação, filtros e curvas comparativas de 2025 e 2026.");
