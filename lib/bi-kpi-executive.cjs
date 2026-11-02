const PDFDocument = require("pdfkit");
require("pdfkit/standard-fonts/Helvetica");
require("pdfkit/standard-fonts/HelveticaBold");
const PptxGenJS = require("pptxgenjs");
const JSZip = require("jszip");
const { closedMonthPeriod } = require("./bi-kpi-executive-pdf.cjs");

const W = 1280, H = 720;
const C = { navy: "172D3D", blue: "31566C", gold: "DAB266", muted: "657D8B", bg: "EDF2F4", line: "D8E3E8", green: "087F68", red: "C94F4A", white: "FFFFFF" };
const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
const decimalMoney = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const number = value => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value || 0);
const pct = value => `${number(value)}%`;
const change = (value, before) => before > 0 ? pct((value / before - 1) * 100) : value > 0 ? "novo" : "-";
const chunk = (rows, count) => rows.length ? Array.from({ length: Math.ceil(rows.length / count) }, (_, i) => rows.slice(i * count, (i + 1) * count)) : [[]];
const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const GROWTH_ARROW = "M2 59C23 56 39 42 45 21H34L49 4 63 21H54C49 46 29 60 2 59Z";
const shareColor = name => ({ AZUL: "59C7EF", SUEDS: "FFE08A", CVC: "FFF318" })[name];

// A single scene drives both formats. All cards, labels, tables and bars remain
// native PowerPoint objects; no screenshots, browser session or static month data.
function buildExecutivePages(p) {
  const pages = [];
  const period = new Date(`${p.period.start}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const previous = p.comparison?.available ? p.comparison : null;
  let page;
  const rect = (x, y, w, h, fill = C.white, radius = 8, stroke = C.line) => page.ops.push({ type: "rect", x, y, w, h, fill, radius, stroke });
  const text = (value, x, y, w, size = 16, color = C.navy, bold = false, align = "left", h = size * 1.5) => page.ops.push({ type: "text", value: String(value ?? ""), x, y, w, h, size, color, bold, align });
  const arrow = (direction, x, y, size, color) => page.ops.push({ type: "arrow", direction, x, y, w: size, h: size, color });
  const trend = (value, before, x, y, w, badge = false, primary = false) => {
    const growth = before > 0 ? (value / before - 1) * 100 : null;
    const direction = growth === null ? (badge ? "flat" : value > 0 ? "up" : "flat") : growth > .05 ? "up" : growth < -.05 ? "down" : "flat";
    const color = direction === "up" ? (primary ? "B9F1D5" : C.green) : direction === "down" ? (primary ? "FFD1CD" : C.red) : (primary ? "D5E1E6" : C.muted);
    if (badge) rect(x, y, w, 30, primary ? (direction === "down" ? "663F42" : direction === "up" ? "245B55" : "344C5A") : (direction === "down" ? "FFF0EF" : direction === "up" ? "E7F6EF" : C.bg), 5);
    if (growth === null && badge) { text("-", x + 8, y + 5, w - 16, 16, color, true, "center"); return; }
    const size = badge ? 20 : 13;
    arrow(direction, x + (badge ? 5 : 0), y + (badge ? 5 : 0), size, color);
    const label = growth === null ? value > 0 ? "novo em 2026" : "0%" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.abs(growth))}%`;
    text(label, x + size + (badge ? 9 : 4), y + (badge ? 5 : 0), w - size - (badge ? 14 : 4), badge ? 16 : 11, color, true, badge ? "right" : "left");
  };
  const start = (title, subtitle = `${period} · Comparativo 2025 × 2026`) => {
    page = { title, ops: [] }; pages.push(page);
    rect(0, 0, W, H, C.bg, 0, C.bg);
    text("SUEDS HOTELS · COMERCIAL · KPI FULL", 40, 22, 1160, 12, "AC813C", true);
    text(title, 40, 54, 1200, 30, C.navy, true);
    text(subtitle, 40, 100, 1200, 15, C.muted);
    text(`${p.selected?.hotel || "Todos os hotéis"} · Todos os canais · Mês completo da venda`, 40, 126, 1200, 12, C.muted);
    text(`Relatório executivo · ${period}`, 40, 687, 1000, 10, C.muted);
    text(String(pages.length).padStart(2, "0"), 1170, 687, 70, 10, C.muted, false, "right");
  };
  const card = (x, y, w, h, label, value, before, formatter = money, primary = false, note = "") => {
    rect(x, y, w, h, primary ? C.navy : C.white);
    text(label, x + 16, y + 14, w - 32, 12, primary ? "C6D9E2" : C.muted, true);
    const display = formatter(value);
    const valueWidth = w - 32 - (before != null ? 86 : 0);
    const size = Math.min(29, valueWidth / Math.max(1, display.length * .59));
    text(display, x + 16, y + 43, valueWidth, size, primary ? C.white : C.navy, true);
    if (before != null) {
      text(`2025: ${formatter(before)}`, x + 16, y + h - 46, w - 32, 12, primary ? C.gold : C.muted);
      trend(value, before, x + w - 90, y + 41, 74, true, primary);
    } else text(note || "2025: sem base comparável", x + 16, y + h - 30, w - 32, 11, primary ? "C6D9E2" : C.muted);
  };
  const legend = (x, y) => {
    if (previous) { rect(x, y + 4, 12, 5, C.gold, 1, C.gold); text("2025", x + 18, y, 46, 11, C.muted); }
    rect(x + 76, y + 4, 12, 5, C.blue, 1, C.blue); text("2026", x + 94, y, 46, 11, C.muted);
  };
  const paired = (rows, beforeRows, field = "value", month = false) => {
    const key = row => month ? row.key || row.label : row.label;
    const old = new Map((previous ? beforeRows || [] : []).map(row => [key(row), row]));
    const current = new Map((rows || []).map(row => [key(row), row]));
    // The BI payload has already aligned historical check-in keys to 2026/2027.
    const pairs = [...current].map(([k, row]) => ({ key: k, label: row.label, value: safeNumber(row[field]), before: previous ? safeNumber(old.get(k)?.[field]) : null }));
    for (const [k, row] of old) if (!current.has(k)) pairs.push({ key: k, label: row.label, value: 0, before: safeNumber(row[field]) });
    return pairs;
  };
  const combineTail = rows => {
    const sorted = [...rows].sort((a, b) => Math.max(b.value, b.before || 0) - Math.max(a.value, a.before || 0) || a.label.localeCompare(b.label, "pt-BR"));
    if (sorted.length <= 8) return sorted;
    return [...sorted.slice(0, 7), { label: "Demais", value: sorted.slice(7).reduce((sum, row) => sum + row.value, 0), before: previous ? sorted.slice(7).reduce((sum, row) => sum + (row.before || 0), 0) : null }];
  };
  const averagePairs = (current, old) => {
    const merged = new Map();
    for (const [rows, prefix] of [[current || [], "now"], [previous ? old || [] : [], "old"]]) for (const row of rows) {
      const item = merged.get(row.label) || { label: row.label, nowSales: 0, oldSales: 0, nowNights: 0, oldNights: 0 };
      item[`${prefix}Sales`] += safeNumber(row.qualifiedSales); item[`${prefix}Nights`] += safeNumber(row.roomNights); merged.set(row.label, item);
    }
    let rows = [...merged.values()].sort((a, b) => Math.max(b.nowNights, b.oldNights) - Math.max(a.nowNights, a.oldNights));
    if (rows.length > 8) {
      const tail = rows.slice(7).reduce((total, row) => ({ label: "Demais", nowSales: total.nowSales + row.nowSales, oldSales: total.oldSales + row.oldSales, nowNights: total.nowNights + row.nowNights, oldNights: total.oldNights + row.oldNights }), { nowSales: 0, oldSales: 0, nowNights: 0, oldNights: 0 });
      rows = [...rows.slice(0, 7), tail];
    }
    return rows.map(row => ({ label: row.label, value: row.nowNights ? row.nowSales / row.nowNights : 0, before: previous ? row.oldNights ? row.oldSales / row.oldNights : 0 : null })).sort((a, b) => Math.max(b.value, b.before || 0) - Math.max(a.value, a.before || 0));
  };
  const bars = (title, rows, x = 40, y = 180, w = 1200, h = 465, formatter = money, share = false) => {
    rect(x, y, w, h);
    text(title, x + 18, y + 17, w - 210, 20, C.navy, true);
    legend(x + w - 160, y + 20);
    const max = Math.max(1, ...rows.flatMap(row => [row.value, row.before || 0]));
    const rowHeight = Math.min(61, (h - 72) / Math.max(1, rows.length));
    const labelWidth = w * .25, valueWidth = Math.max(112, w * .16), barWidth = w - labelWidth - valueWidth - 48;
    if (!rows.length) text("Sem dados no período.", x + 18, y + 85, w - 36, 16, C.muted);
    rows.forEach((row, index) => {
      const yy = y + 62 + index * rowHeight;
      text(row.label, x + 18, yy, labelWidth - 25, Math.min(13, rowHeight * .29), C.navy, false, "left", rowHeight * .56);
      if (row.before != null) trend(row.value, row.before, x + 18, yy + rowHeight * .55, labelWidth - 25);
      const bx = x + labelWidth, bh = Math.min(10, rowHeight * .2);
      if (previous) {
        rect(bx, yy + 2, barWidth, bh, "F3EEE4", 2, "F3EEE4");
        if (row.before > 0) rect(bx, yy + 2, Math.max(1, row.before / max * barWidth), bh, C.gold, 2, C.gold);
        text(formatter(row.before), x + w - valueWidth - 15, yy - 2, valueWidth, 12, "AF823C", true, "right");
      }
      rect(bx, yy + bh + 7, barWidth, bh, C.bg, 2, C.bg);
      if (row.value > 0) rect(bx, yy + bh + 7, Math.max(1, row.value / max * barWidth), bh, C.blue, 2, C.blue);
      const suffix = share && p.summary.sales ? ` · ${pct(row.value / p.summary.sales * 100)}` : "";
      text(`${formatter(row.value)}${suffix}`, x + w - valueWidth - 15, yy + bh + 5, valueWidth, 12, C.navy, true, "right");
    });
  };
  const table = (title, headers, rows, widths, x = 40, y = 180, w = 1200, h = 465, tint = "D8EBC8", options = {}) => {
    rect(x, y, w, h);
    rect(x + 1, y + 1, w - 2, 33, tint, 4, tint);
    text(title, x + 14, y + 9, w - 28, 15, C.navy, true, "center");
    const total = widths.reduce((sum, n) => sum + n, 0);
    const sizes = widths.map(n => (w - 24) * n / total);
    const headY = y + 42;
    const headHeight = options.headerHeight || 30;
    rect(x + 8, headY, w - 16, headHeight, "F0F4F6", 0, C.line);
    let xx = x + 12;
    headers.forEach((value, i) => {
      const color = options.columnColors?.[i];
      if (color) rect(xx, headY, sizes[i], headHeight, color, 0, C.line);
      text(value, xx + 4, headY + 7, sizes[i] - 8, 11, C.navy, true, i ? options.share ? "center" : "right" : "left", headHeight - 12);
      xx += sizes[i];
    });
    const bodyY = headY + headHeight + 5;
    const rh = Math.min(37, (h - (bodyY - y) - 9) / Math.max(1, rows.length));
    if (!rows.length) text("Sem dados no período.", x + 20, y + 105, w - 40, 15, C.muted);
    rows.forEach((row, index) => {
      const yy = bodyY + index * rh;
      const isTotal = String(row[0]).toLowerCase().startsWith("total");
      rect(x + 8, yy, w - 16, rh, isTotal ? "E4ECEF" : index % 2 ? "F4F7F8" : C.white, 0, "E4ECEF");
      let cx = x + 12;
      row.forEach((value, i) => {
        const str = String(value ?? "-");
        const columnColor = options.columnColors?.[i];
        if (columnColor) rect(cx, yy, sizes[i], rh, columnColor, 0, "D1DFE5");
        const variation = /var/i.test(headers[i]) && (/%$/.test(str) || str === "novo");
        const color = variation ? str.startsWith("-") ? C.red : C.green : C.navy;
        text(str, cx + 4, yy + 7, sizes[i] - 8, Math.min(12, rh * .36), color, isTotal || i === 0, i ? "right" : "left", rh - 8);
        cx += sizes[i];
      });
    });
  };
  const pagedTable = (title, headers, rows, weights, tint) => {
    chunk(rows, 12).forEach((part, i, all) => { start(`${title}${all.length > 1 ? ` (${i + 1}/${all.length})` : ""}`); table(title, headers, part, weights, 40, 180, 1200, 465, tint); });
  };

  start("Relatório executivo comercial", `${p.period.start.split("-").reverse().join("/")} a ${p.period.end.split("-").reverse().join("/")}`);
  text("Vendas e desempenho", 55, 265, 1150, 56, C.navy, true);
  text("dos hotéis SUEDS", 55, 340, 1150, 56, C.navy, true);
  text("Resultados, canais, produção futura, rentabilidade e metas", 58, 460, 1140, 24, C.muted);
  text(period, 58, 570, 1140, 30, "AC813C", true);
  start("Principais indicadores");
  const summary = p.summary || {}, prior = previous?.summary;
  card(40, 195, 360, 170, "VENDIDO NO PERÍODO", summary.sales, prior?.sales, money, true);
  card(416, 195, 264, 170, "RESERVAS", summary.reservations, prior?.reservations, number);
  card(696, 195, 264, 170, "TICKET MÉDIO", summary.ticketAverage, prior?.ticketAverage);
  card(976, 195, 264, 170, "HOTÉIS COM VENDAS", summary.hotels, null, number, false, "no recorte selecionado");
  card(40, 385, 389, 165, "ADR · DIÁRIA MÉDIA", summary.averageDailyRate, prior?.averageDailyRate);
  card(445, 385, 389, 165, "TAXA DE OCUPAÇÃO", p.revpar?.summary?.occupancyRate, previous?.revpar?.summary?.occupancyRate, pct);
  card(850, 385, 390, 165, "REVPAR", p.revpar?.summary?.revpar, previous?.revpar?.summary?.revpar);
  const captured = p.dataCoverage?.baseUpdatedAt;
  text(`Base capturada: ${captured ? new Date(captured).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "não informada"}`, 45, 580, 1180, 13, C.muted);
  if (p.dataCoverage?.queryEndBeyondAvailable) text(`Cobertura incompleta: última venda disponível em ${p.dataCoverage.latestSaleDate}.`, 45, 612, 1180, 14, C.red, true);
  for (const [title, current, old] of [["Vendas por canal", p.byChannel, previous?.byChannel], ["Vendas por hotel", p.byHotel, previous?.byHotel]]) {
    const rows = title.includes("canal") ? combineTail(paired(current, old)) : paired(current, old).sort((a, b) => Math.max(b.value, b.before || 0) - Math.max(a.value, a.before || 0));
    chunk(rows, 8).forEach((part, i, all) => { start(`${title}${all.length > 1 ? ` (${i + 1}/${all.length})` : ""}`); bars(title, part, 40, 180, 1200, 465, money, title.includes("canal")); });
  }
  // Reuse the already aligned check-in keys from the BI payload.
  const checkin = paired(p.byCheckinMonth, previous?.byCheckinMonth, "value", true).sort((a, b) => String(a.key).localeCompare(String(b.key)));
  chunk(checkin, 12).forEach((rows, index, all) => {
    start(`Vendas por mês do check-in${all.length > 1 ? ` (${index + 1}/${all.length})` : ""}`);
    rect(40, 180, 1200, 465); text("Produção futura", 60, 196, 950, 20, C.navy, true); legend(1060, 199);
    const max = Math.max(1, ...rows.flatMap(row => [row.value, row.before || 0]));
    const step = 1100 / Math.max(1, rows.length), baseline = 568, chartHeight = 275;
    if (!rows.length) text("Sem dados no período.", 65, 310, 1100, 16, C.muted);
    rows.forEach((row, i) => {
      const x = 90 + step * i, bw = Math.min(27, step * .27);
      if (previous && row.before > 0) {
        const height = row.before / max * chartHeight;
        rect(x, baseline - height, bw, height, C.gold, 2, C.gold);
        text(pct(previous.summary?.sales ? row.before / previous.summary.sales * 100 : 0), x - 12, baseline - height - 22, bw + 24, 10, "AC813C", true, "center");
      }
      if (row.value > 0) {
        const height = row.value / max * chartHeight;
        rect(x + bw + 4, baseline - height, bw, height, C.blue, 2, C.blue);
        text(pct(summary.sales ? row.value / summary.sales * 100 : 0), x + bw - 8, baseline - height - 22, bw + 24, 10, C.navy, true, "center");
      }
      text(row.label, x - 15, baseline + 15, step - 4, 11, C.muted, false, "center", 36);
    });
  });
  const future = p.futureCheckinMonths || [];
  const futureRows = future.map(row => [row.label, number(row.roomNights), decimalMoney(row.value)]);
  if (future.length) futureRows.push(["Total", number(future.reduce((sum, row) => sum + safeNumber(row.roomNights), 0)), decimalMoney(future.reduce((sum, row) => sum + safeNumber(row.value), 0))]);
  pagedTable("Room nights e vendas por mês do check-in", ["Mês/Ano", "UH", "Venda"], futureRows, [2, 1, 2], "B4D6E9");
  const channelsAdr = averagePairs(p.byChannel, previous?.byChannel);
  const hotelsAdr = averagePairs(p.byHotel, previous?.byHotel);
  const channelParts = chunk(channelsAdr, 8), hotelParts = chunk(hotelsAdr, 8);
  for (let i = 0; i < Math.max(channelParts.length, hotelParts.length); i++) {
    start(`Diária média por canal e hotel${i ? ` (${i + 1})` : ""}`);
    bars("Diária média por canal", channelParts[i] || [], 40, 180, 592, 465);
    bars("Diária média por hotel", hotelParts[i] || [], 648, 180, 592, 465);
  }
  // RevPAR summary and its full hotel chart always share the same page.
  const revpar = paired(p.revpar?.byHotel, previous?.revpar?.byHotel, "revpar").sort((a, b) => b.value - a.value);
  start("RevPAR gerado pelas vendas");
  card(40, 177, 592, 110, "RevPAR gerado em 2025", previous?.revpar?.summary?.revpar, null, value => previous ? money(value) : "Sem base", false,
    previous ? `${number(previous.revpar?.summary?.availableRoomNights)} aptos-noite disponíveis` : "2025: sem base comparável");
  card(648, 177, 592, 110, "RevPAR gerado em 2026", p.revpar?.summary?.revpar, null, money, false, `${number(p.revpar?.summary?.availableRoomNights)} aptos-noite disponíveis`);
  bars("RevPAR por hotel", revpar, 40, 302, 1200, 350);
  const hotels = paired(p.byHotel, previous?.byHotel);
  const hotelRows = hotels.map(row => [row.label, money(row.value), previous ? money(row.before) : "Sem base", previous ? change(row.value, row.before) : "-"]);
  hotelRows.push(["Total", money(summary.sales), previous ? money(prior?.sales) : "Sem base", previous ? change(summary.sales, prior?.sales) : "-"]);
  pagedTable("Comparativo de vendas por hotel", ["Hotel", "2026", "2025", "Variação"], hotelRows, [2.3, 1.3, 1.3, 1]);
  const share = p.channelShare || {};
  const groups = [...(share.groups || [])].sort((a, b) => safeNumber(share.totals?.values?.[b]) - safeNumber(share.totals?.values?.[a])).slice(0, 6);
  chunk(groups, 6).forEach((part, i, parts) => {
    const shareRow = row => [row.label, ...part.map(group => pct(row.total ? safeNumber(row.values?.[group]) / row.total * 100 : 0))];
    const rows = (share.byHotel || []).map(shareRow);
    if (rows.length) rows.push(shareRow({ label: "Total", ...share.totals }));
    const title = `Participação dos canais por hotel${parts.length > 1 ? ` (${i + 1}/${parts.length})` : ""}`;
    chunk(rows, 8).forEach((hotelRows, j, hotelParts) => {
      start(`${title}${hotelParts.length > 1 ? ` (${j + 1}/${hotelParts.length})` : ""}`);
      const headerHeight = part.every(name => name.length <= 16) ? 30 : 68;
      table("SHARE DE VENDAS POR HOTEL", ["Hotel", ...part], hotelRows, [2.5, ...part.map(() => 1)], 40, 180, 1200, 465, "D8EBC8", { headerHeight, share: true, columnColors: [null, ...part.map(shareColor)] });
    });
  });
  const operatorRows = group => {
    const values = p.channelHotelComparison?.[group] || {};
    const current = values.current || {}, before = previous ? values.previous || {} : {};
    const rows = [...new Set([...Object.keys(current), ...Object.keys(before)])].map(label => [label, money(current[label]), previous ? money(before[label]) : "Sem base", previous ? change(current[label] || 0, before[label]) : "-"]);
    if (rows.length) { const now = Object.values(current).reduce((sum, v) => sum + safeNumber(v), 0), old = Object.values(before).reduce((sum, v) => sum + safeNumber(v), 0); rows.push(["Total", money(now), previous ? money(old) : "Sem base", previous ? change(now, old) : "-"]); }
    return rows;
  };
  const azul = operatorRows("AZUL"), cvc = operatorRows("CVC");
  const goalTables = p.monthlyGoalTables || [];
  start("Operadoras e metas do mês");
  table("VENDAS · AZUL POR HOTEL", ["Hotel", "2026", "2025", "Var."], azul.slice(0, 7), [2, 1.25, 1.25, .8], 40, 177, 592, 260, "36BADE");
  table("VENDAS · CVC POR HOTEL", ["Hotel", "2026", "2025", "Var."], cvc.slice(0, 7), [2, 1.25, 1.25, .8], 648, 177, 592, 260, "F8EB21");
  goalTables.slice(0, 4).forEach((goal, index) => {
    const row = (goal.rows || []).find(row => row.key === p.period.start.slice(0, 7));
    const optional = v => v == null ? "-" : money(v);
    const x = index % 2 ? 648 : 40, y = 451 + Math.floor(index / 2) * 102;
    const tint = ["D2E7BB", "FFE581", "C4D5ED", "92CF4B"][index];
    rect(x, y, 592, 94); rect(x + 1, y + 1, 590, 25, tint, 4, tint);
    text(goal.title.toUpperCase(), x + 10, y + 7, 572, 12, C.navy, true, "center");
    const labels = ["2026", "2025", "Meta", "% Meta", "Var. A/A"];
    const values = row ? [optional(row.actual), optional(row.previous), optional(row.target), row.target > 0 ? pct(row.actual / row.target * 100) : "-", row.actual == null ? "-" : change(row.actual, row.previous)] : labels.map(() => "-");
    const cols = [132, 132, 132, 90, 90]; let xx = x + 8;
    labels.forEach((label, i) => { text(label, xx + 4, y + 34, cols[i] - 8, 10, C.muted, true, "right"); text(values[i], xx + 4, y + 61, cols[i] - 8, 11, C.navy, true, "right"); xx += cols[i]; });
  });
  if (azul.length > 7) pagedTable("Vendas Azul por hotel · completo", ["Hotel", "2026", "2025", "Variação"], azul, [2, 1, 1, 1], "36BADE");
  if (cvc.length > 7) pagedTable("Vendas CVC por hotel · completo", ["Hotel", "2026", "2025", "Variação"], cvc, [2, 1, 1, 1], "F8EB21");
  const adv = p.advancePurchase || {};
  const advRows = (adv.bands || []).map(band => [`${band.label} (${band.range || ""})`, pct(band.sharePct), number(band.reservations), money(band.revenue)]);
  if (advRows.length) advRows.push(["Total", adv.totalRevenue ? "100%" : "0%", number(adv.totalReservations), money(adv.totalRevenue)]);
  pagedTable("Antecipação de vendas · ADVP", ["Antecipação", "Participação", "Reservas", "Venda"], advRows, [2.8, 1, 1, 1.4], "DDE8ED");
  if (safeNumber(adv.totalReservations) !== safeNumber(summary.reservations) || Math.abs(safeNumber(adv.totalRevenue) - safeNumber(summary.sales)) > .01) {
    text(`ADVP: ${money(adv.totalRevenue)} / ${number(adv.totalReservations)} reservas. Resumo: ${money(summary.sales)} / ${number(summary.reservations)}. Cada indicador mantém o recorte do painel.`, 45, 654, 1185, 11, C.muted);
  }
  return pages;
}

async function buildExecutivePdf(payload) {
  const pages = buildExecutivePages(payload);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, info: { Title: "Relatório executivo KPI" } });
    const chunks = [];
    doc.on("data", c => chunks.push(c)); doc.on("error", reject); doc.on("end", () => resolve(Buffer.concat(chunks)));
    for (const page of pages) {
      doc.addPage();
      for (const op of page.ops) {
        if (op.type === "rect") { doc.roundedRect(op.x, op.y, op.w, op.h, Math.min(op.radius, op.h / 2, op.w / 2)).lineWidth(.7).fillAndStroke(`#${op.fill}`, `#${op.stroke}`); }
        else if (op.type === "arrow") {
          doc.save().translate(op.x, op.y);
          if (op.direction === "down") doc.translate(op.w, op.h).scale(-1, -1);
          doc.scale(op.w / 64, op.h / 64).path(op.direction === "flat" ? "M4 28H46V18L62 32 46 46V36H4Z" : GROWTH_ARROW).fill(`#${op.color}`);
          doc.restore();
        }
        else doc.font(op.bold ? "Helvetica-Bold" : "Helvetica").fontSize(op.size).fillColor(`#${op.color}`).text(op.value, op.x, op.y, { width: op.w, height: op.h, align: op.align, lineBreak: true, ellipsis: true });
      }
    }
    doc.end();
  });
}

async function buildExecutivePptx(payload) {
  const ppt = new PptxGenJS();
  ppt.layout = "LAYOUT_WIDE"; ppt.author = "SUEDS Hotels"; ppt.subject = "KPI Full"; ppt.title = "Relatório executivo KPI"; ppt.lang = "pt-BR";
  for (const page of buildExecutivePages(payload)) {
    const slide = ppt.addSlide();
    for (const op of page.ops) {
      const geometry = { x: op.x / 96, y: op.y / 96, w: op.w / 96, h: op.h / 96 };
      if (op.type === "rect") slide.addShape(op.radius ? ppt.ShapeType.roundRect : ppt.ShapeType.rect, { ...geometry, radius: op.radius / 96, rectRadius: op.radius / 96, fill: { color: op.fill }, line: { color: op.stroke, width: .5 } });
      else if (op.type === "arrow") {
        const point = (x, y) => ({ x: x / 64 * geometry.w, y: y / 64 * geometry.h });
        const points = op.direction === "flat"
          ? [[4, 28], [46, 28], [46, 18], [62, 32], [46, 46], [46, 36], [4, 36]].map(([x, y], i) => ({ ...point(x, y), ...(i ? {} : { moveTo: true }) }))
          : [{ ...point(2, 59), moveTo: true }, { ...point(45, 21), curve: { type: "cubic", x1: point(23, 56).x, y1: point(23, 56).y, x2: point(39, 42).x, y2: point(39, 42).y } }, point(34, 21), point(49, 4), point(63, 21), point(54, 21), { ...point(2, 59), curve: { type: "cubic", x1: point(49, 46).x, y1: point(49, 46).y, x2: point(29, 60).x, y2: point(29, 60).y } }];
        slide.addShape("custGeom", { ...geometry, points: [...points, { close: true }], rotate: op.direction === "down" ? 180 : 0, fill: { color: op.color }, line: { color: op.color, transparency: 100 } });
      }
      else slide.addText(op.value, { ...geometry, fontFace: "Arial", fontSize: op.size * .75, color: op.color, bold: op.bold, align: op.align, margin: 0, breakLine: false, valign: "top", fit: "shrink" });
    }
    slide.addNotes(`Fonte: KPI Full. Período ${payload.period.start} a ${payload.period.end}. Hotel: ${payload.selected?.hotel || "Todos"}. Base: ${payload.dataCoverage?.baseUpdatedAt || "não informada"}.`);
  }
  const zip = await JSZip.loadAsync(await ppt.write({ outputType: "nodebuffer", compression: true }));
  // PptxGenJS 4.0.1 declares one master per slide but emits only master1.
  // Remove only those dangling master content types to avoid Office repair prompts.
  const types = zip.file("[Content_Types].xml");
  zip.file("[Content_Types].xml", (await types.async("string")).replace(/<Override PartName="\/(ppt\/slideMasters\/slideMaster\d+\.xml)"[^>]*\/>/g,
    (entry, name) => zip.file(name) ? entry : ""));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

module.exports = { closedMonthPeriod, buildExecutivePages, buildExecutivePdf, buildExecutivePptx };
