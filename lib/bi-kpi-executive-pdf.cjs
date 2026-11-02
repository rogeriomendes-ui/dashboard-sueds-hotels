const PDFDocument = require("pdfkit");

function closedMonthPeriod(month, now = new Date()) {
  const currentMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(now);
  const current = `${currentMonth.find(p => p.type === "year").value}-${currentMonth.find(p => p.type === "month").value}`;
  if (!/^2026-(0[1-9]|1[0-2])$/.test(month || "") || month >= current) {
    throw new Error("Selecione um mês de 2026 já encerrado.");
  }
  const [year, number] = month.split("-").map(Number);
  return { start: `${month}-01`, end: `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}` };
}

function buildExecutivePdf(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: "Relatório executivo mensal | SUEDS" } });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
    const number = value => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value || 0);
    const date = value => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não informada";
    const text = (value, size = 10, color = "#172d3d") => doc.fillColor(color).fontSize(size).text(value, { lineGap: 4 });
    const heading = title => { doc.moveDown(0.7); doc.font("Helvetica-Bold"); text(title, 14); doc.font("Helvetica"); };
    const title = new Date(`${payload.period.start}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    text("SUEDS HOTELS | COMERCIAL - KPI FULL", 10, "#ad7c32");
    doc.font("Helvetica-Bold"); text("Relatório executivo mensal", 25); doc.font("Helvetica");
    text(title, 16);
    text(`Vendas de ${payload.period.start.split("-").reverse().join("/")} a ${payload.period.end.split("-").reverse().join("/")}`);
    text(`Hotel: ${payload.selected.hotel || "Todos os hotéis"} | Todos os canais e meses do check-in`);
    text(`Base capturada: ${date(payload.dataCoverage?.baseUpdatedAt)} | Emitido: ${date(payload.generatedAt)}`, 8);
    heading("Principais indicadores");
    const previous = payload.comparison?.available ? payload.comparison.summary : null;
    const metrics = [
      ["Vendido no mês", "sales", money], ["Reservas", "reservations", number],
      ["Ticket médio", "ticketAverage", money], ["ADR - Diária média", "averageDailyRate", money],
      ["UHs-noite", "roomNights", number]
    ];
    metrics.forEach(([label, key, format]) => {
      const value = payload.summary[key] || 0;
      const prior = previous?.[key];
      const variation = prior > 0 ? ` | Var.: ${number((value / prior - 1) * 100)}%` : "";
      text(`${label}: ${format(value)}${previous ? ` | 2025: ${format(prior)}${variation}` : " | 2025: sem base comparável"}`, 11);
    });
    text(`Hotéis com vendas: ${number(payload.summary.hotels)}`, 11);
    text(`Ocupação: ${number(payload.revpar?.summary?.occupancyRate)}% | RevPAR: ${money(payload.revpar?.summary?.revpar)}`, 11);
    heading("Leitura dos indicadores");
    text("Receita e reservas seguem a data da venda. ADR considera reservas com hospedagem válida. Ocupação e RevPAR seguem o recorte e o inventário do painel; não representam isoladamente o fechamento contábil da hospedagem.", 9);
    if (payload.dataCoverage?.queryEndBeyondAvailable) text(`Atenção: a última venda disponível na base é ${payload.dataCoverage.latestSaleDate}. O mês pode ter cobertura incompleta.`, 9, "#a45810");
    text(payload.comparison?.coverage || "Base histórica indisponível.", 9);
    doc.addPage();
    text(`SUEDS HOTELS | ${title}`, 10, "#ad7c32");
    const table = (label, rows) => {
      heading(label);
      if (!rows?.length) { text("Sem vendas no período."); return; }
      const total = payload.summary.sales || 0;
      rows.slice(0, 10).forEach(row => {
        if (doc.y > 700) doc.addPage();
        text(`${row.label}: ${money(row.value)} | ${number(total ? row.value / total * 100 : 0)}% do vendido`, 10);
      });
      if (rows.length > 10) text(`Exibidos os 10 primeiros de ${rows.length} itens. Consulte o painel para o detalhamento completo.`, 8);
    };
    table("Vendas por hotel", payload.byHotel);
    table("Principais canais", payload.byChannel);
    table("Produção por mês do check-in", payload.byCheckinMonth);
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor("#647582").fontSize(8).text(`KPI Full | Relatório de vendas | ${i + 1} / ${pages.count}`, 42, 794, { lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { closedMonthPeriod, buildExecutivePdf };
