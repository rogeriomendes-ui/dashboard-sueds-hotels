const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const { buildExecutivePages, buildExecutivePdf, buildExecutivePptx, closedMonthPeriod } = require("../lib/bi-kpi-executive.cjs");
const { __test, handleRequest } = require("../server");

const record = (code, year, hotel, channel, total) => ({ dateKey: `${year}-10-15`, monthKey: `${year}-10`, reservationCode: code, hotel, channel, rawChannel: channel, seller: "", checkin: `01/11/${year}`, checkout: `04/11/${year}`, days: "3", uh: "1", reservationCount: 1, status: "Confirmada", source: "KPI", total });
const now = new Date("2026-11-02T12:00:00Z");
assert.equal(closedMonthPeriod("2026-02", now).end, "2026-02-28");
assert.throws(() => closedMonthPeriod("2026-11", now));
assert.throws(() => closedMonthPeriod("2026-10", new Date("2026-11-01T01:00:00Z")));
const dataset = { audience: "bi-relatorios-kpi", records: [record("A", 2026, "SUEDS PLAZA", "Azul Viagens", 12000), record("B", 2026, "SUEDS PREMIUM", "CVC", 8000)], historicalRecords: [record("OLD-A", 2025, "SUEDS PLAZA", "Azul Viagens", 10000)], goals: [] };
const payload = __test.buildBiReportsPayload(dataset, { ...closedMonthPeriod("2026-10", now), channels: [] });
const strings = pages => pages.flatMap(page => page.ops.filter(op => op.type === "text").map(op => op.value));

(async () => {
  const pages = buildExecutivePages(payload);
  assert.equal(pages.filter(page => page.title.includes("RevPAR")).length, 1);
  assert.ok(pages.find(page => page.title.includes("RevPAR")).ops.some(op => op.value === "RevPAR por hotel"));
  assert.ok(strings(pages).includes("R$ 20.000"));
  assert.ok(pages.some(page => page.ops.some(op => op.type === "arrow" && op.direction === "up")));
  const falling = buildExecutivePages({ ...payload, summary: { ...payload.summary, sales: 100 } });
  assert.ok(falling.find(page => page.title === "Principais indicadores").ops.some(op => op.type === "arrow" && op.direction === "down"));
  for (const page of pages) for (const op of page.ops) {
    assert.ok(op.x >= 0 && op.y >= 0 && op.x + op.w <= 1280.1 && op.y + op.h <= 720.1, `${page.title}: ${JSON.stringify(op)}`);
  }
  const otherMonth = __test.buildBiReportsPayload(dataset, { start: "2026-09-01", end: "2026-09-30" });
  assert.ok(!strings(buildExecutivePages(otherMonth)).includes("R$ 20.000"));
  const hotelPayload = __test.buildBiReportsPayload(dataset, { ...closedMonthPeriod("2026-10", now), hotel: "SUEDS PREMIUM" });
  assert.equal(hotelPayload.summary.sales, 8000);
  assert.ok(strings(buildExecutivePages(hotelPayload)).includes("R$ 8.000"));
  const noPrevious = buildExecutivePages({ ...payload, comparison: { available: false } });
  assert.ok(strings(noPrevious).some(s => s.includes("Sem base")));
  const monthComparison = buildExecutivePages({ ...payload, byCheckinMonth: [{ key: "2027-01", label: "Jan/2027", value: 100 }], comparison: { ...payload.comparison, byCheckinMonth: [{ key: "2027-01", label: "Jan/2027", value: 200 }, { key: "2027-07", label: "Jul/2027", value: 50 }] } });
  const checkinText = strings(monthComparison.filter(page => page.title.includes("mês do check-in")));
  assert.ok(checkinText.includes("Jul/2027"), "Mês presente apenas em 2025 deve aparecer no comparativo.");
  const large = { ...payload, byChannel: Array.from({ length: 21 }, (_, i) => ({ label: `Canal ${i}`, value: i * 100 })), futureCheckinMonths: Array.from({ length: 20 }, (_, i) => ({ label: `Mês ${i}`, value: i * 10, roomNights: i })), channelShare: { groups: Array.from({ length: 9 }, (_, i) => `Grupo ${i}`), byHotel: [{ label: "Hotel", total: 1000, values: {} }] } };
  const largeText = strings(buildExecutivePages(large));
  assert.ok(largeText.includes("Canal 20")); assert.ok(largeText.includes("Demais")); assert.ok(largeText.includes("Mês 19")); assert.ok(!largeText.includes("Grupo 8"));
  const rankedShare = buildExecutivePages({ ...payload, channelShare: { groups: ["Pequeno", "Terceiro", "Maior", "Segundo", "Sexto", "Quarto", "Quinto"], totals: { values: { Pequeno: 1, Terceiro: 50, Maior: 100, Segundo: 80, Sexto: 10, Quarto: 30, Quinto: 20 } }, byHotel: [] } }).filter(page => page.title.includes("Participação"));
  assert.equal(rankedShare.length, 1, "Share deve ocupar um único slide/página.");
  const rankedHeaders = strings(rankedShare).filter(text => ["Pequeno", "Terceiro", "Maior", "Segundo", "Sexto", "Quarto", "Quinto"].includes(text));
  assert.deepEqual(rankedHeaders, ["Maior", "Segundo", "Terceiro", "Quarto", "Quinto", "Sexto"]);
  const sharePages = buildExecutivePages({ ...payload, channelShare: { groups: ["AZUL", "SUEDS", "CVC", "CONSULTOUR OPERADORA TURISTICA LTDA"], byHotel: [] } }).filter(page => page.title.includes("Participação"));
  assert.ok(strings(sharePages).includes("AZUL"));
  assert.ok(strings(sharePages).includes("CONSULTOUR OPERADORA TURISTICA LTDA"));
  assert.ok(!strings(sharePages).some(label => /^Canal \d/.test(label)));
  for (const fill of ["59C7EF", "FFE08A", "FFF318"]) assert.ok(sharePages.some(page => page.ops.some(op => op.fill === fill)));
  const pdf = await buildExecutivePdf(payload), pptx = await buildExecutivePptx(payload);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const zip = await JSZip.loadAsync(pptx);
  const types = await zip.file("[Content_Types].xml").async("string");
  for (const match of types.matchAll(/<Override PartName="\/([^"]+)"/g)) assert.ok(zip.file(match[1]), `Parte declarada não existe: ${match[1]}`);
  const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  assert.equal(slides.length, pages.length);
  const contents = await Promise.all(slides.map(name => zip.file(name).async("string")));
  assert.equal(contents.filter(xml => xml.includes("RevPAR por hotel")).length, 1);
  assert.ok(contents.every(xml => !xml.includes("<p:pic>")), "Os cards devem continuar editáveis, sem screenshots.");
  assert.ok(contents.some(xml => xml.includes("20.000")));
  assert.ok(contents.some(xml => xml.includes("custGeom")), "Setas devem ser vetoriais no PowerPoint.");
  for (const format of ["pdf", "pptx"]) {
    let status, body;
    await handleRequest({ method: "GET", url: `/api/dashboard/bi-relatorios-kpi?format=${format}&month=2026-13`, headers: { host: "localhost" }, portalProfile: { environments: ["bi_relatorios_kpi"] } }, { writeHead(code) { status = code; }, end(value) { body = value; } });
    assert.equal(status, 400); assert.match(String(body), /encerrado/);
  }
  if (process.argv[2]) {
    const output = process.argv[2]; fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "executivo.pdf"), pdf); fs.writeFileSync(path.join(output, "executivo.pptx"), pptx);
    fs.writeFileSync(path.join(output, "payload.json"), JSON.stringify(payload));
  }
  console.log(`OK: ${pages.length} páginas/slides, RevPAR único, dados por mês/hotel, continuação sem cortes e PDF/PPTX editável.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
