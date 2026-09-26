(function () {
  "use strict";

  const apiUrl = document.documentElement.dataset.biApi || "/api/dashboard/bi-relatorios";
  const isKpiReport = document.documentElement.dataset.requiredEnvironment === "bi_relatorios_kpi";
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const percent = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const wholePercent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const shortMoney = new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL", maximumFractionDigits: 1 });
  const dayLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  const els = {
    form: document.getElementById("filterForm"), start: document.getElementById("startDate"), end: document.getElementById("endDate"),
    hotel: document.getElementById("hotelFilter"), channel: document.getElementById("channelFilter"),
    channelSummary: document.getElementById("channelSummary"), channelOptions: document.getElementById("channelOptions"),
    clearChannels: document.getElementById("clearChannels"), checkin: document.getElementById("checkinFilter"),
    clear: document.getElementById("clearFilters"), loading: document.getElementById("loadingState"), content: document.getElementById("dashboardContent"),
    error: document.getElementById("errorNotice"), stamp: document.getElementById("dataStamp"), reason: document.getElementById("comparisonReason"),
    comparisonTitle: document.getElementById("comparisonTitle"), comparisonTotal: document.getElementById("comparisonTotal"),
    sales: document.getElementById("totalSales"), previousSales: document.getElementById("previousPeriodSales"), previousLabel: document.getElementById("previousPeriodLabel"), previousSummary: document.getElementById("previousPeriodSummary"), reservations: document.getElementById("totalReservations"), ticket: document.getElementById("averageTicket"),
    hotels: document.getElementById("activeHotels"), period: document.getElementById("periodCaption"), daily: document.getElementById("dailyChart"),
    channels: document.getElementById("channelChart"), hotelChart: document.getElementById("hotelChart"), checkinChart: document.getElementById("checkinChart"),
    pickup: document.getElementById("pickupGrid"), averageRate2025: document.getElementById("averageRate2025"),
    averageRate2026: document.getElementById("averageRate2026"), roomNights2025: document.getElementById("roomNights2025"),
    roomNights2026: document.getElementById("roomNights2026"), averageRateDaily: document.getElementById("averageRateDailyChart"),
    averageRateChannels: document.getElementById("averageRateChannelChart"), averageRateHotels: document.getElementById("averageRateHotelChart"),
    averageRateCheckin: document.getElementById("averageRateCheckinChart"), revpar2025: document.getElementById("revpar2025"),
    revpar2026: document.getElementById("revpar2026"), availableRoomNights2025: document.getElementById("availableRoomNights2025"),
    availableRoomNights2026: document.getElementById("availableRoomNights2026"), revparDaily: document.getElementById("revparDailyChart"),
    revparHotels: document.getElementById("revparHotelChart"), revparCheckin: document.getElementById("revparCheckinChart"),
    occupancy: document.getElementById("occupancyMap"), topAdr: document.getElementById("topAdr"),
    topAdrPrevious: document.getElementById("topAdrPrevious"), topAdrGrowth: document.getElementById("topAdrGrowth"),
    topOccupancy: document.getElementById("topOccupancy"), topOccupancyPrevious: document.getElementById("topOccupancyPrevious"), topOccupancyGrowth: document.getElementById("topOccupancyGrowth"),
    topRevpar: document.getElementById("topRevpar"), topRevparPrevious: document.getElementById("topRevparPrevious"), topRevparGrowth: document.getElementById("topRevparGrowth"),
    hotelSalesSummary: document.getElementById("hotelSalesSummary")
  };
  let currentPayload = null;
  let resizeTimer = null;

  function safe(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function localDate(value) { return new Date(`${value}T12:00:00Z`); }
  function fmtDate(value) { return dateLabel.format(localDate(value)).replace(" de ", " ").replace(" de ", " "); }
  function empty(target, message) { target.innerHTML = `<div class="empty-chart">${safe(message)}</div>`; }
  function widthOf(target, fallback = 600) { return Math.max(280, Math.round(target.getBoundingClientRect().width || fallback)); }

  function setPerformanceCard(valueEl, previousEl, growthEl, current, previous, formatter) {
    if (!valueEl) return;
    valueEl.textContent = formatter(current || 0);
    previousEl.textContent = `2025: ${formatter(previous || 0)}`;
    const growth = previous > 0 ? (current - previous) / previous * 100 : null;
    const direction = growth === null ? "flat" : growth > .05 ? "up" : growth < -.05 ? "down" : "flat";
    growthEl.className = direction;
    growthEl.textContent = growth === null ? "—" : `${direction === "up" ? "↑" : direction === "down" ? "↓" : "→"} ${wholePercent.format(Math.abs(growth))}%`;
  }

  function setOptions(select, values, selected, placeholder, valueGetter = (item) => item, labelGetter = (item) => item) {
    select.innerHTML = `<option value="">${safe(placeholder)}</option>` + values.map((item) => {
      const value = valueGetter(item);
      return `<option value="${safe(value)}"${value === selected ? " selected" : ""}>${safe(labelGetter(item))}</option>`;
    }).join("");
  }

  function selectedChannels() {
    return [...els.channelOptions.querySelectorAll('input[name="channel"]:checked')].map((input) => input.value);
  }

  function updateChannelSummary() {
    const selected = selectedChannels();
    els.channelSummary.textContent = selected.length === 0 ? "Todos os canais"
      : selected.length === 1 ? selected[0] : `${selected.length} canais selecionados`;
    els.channel.title = selected.join(", ");
  }

  function setChannelOptions(values, selected) {
    const chosen = new Set(selected);
    els.channelOptions.replaceChildren();
    values.forEach((value) => {
      const label = document.createElement("label");
      label.className = "channel-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "channel";
      checkbox.value = value;
      checkbox.checked = chosen.has(value);
      label.append(checkbox, document.createTextNode(value));
      els.channelOptions.append(label);
    });
    updateChannelSummary();
  }

  function renderLine(target, points, options = {}) {
    const comparisonPoints = options.comparisonPoints || [];
    if (!points.length || ![...points, ...comparisonPoints].some((point) => Number(point.value) > 0)) return empty(target, options.empty || "Sem vendas para exibir neste recorte.");
    const w = widthOf(target);
    const h = options.compact ? 92 : Math.round(target.getBoundingClientRect().height || 300);
    const pad = options.compact ? { t: 7, r: 5, b: 6, l: 5 } : { t: 18, r: 18, b: 34, l: w < 500 ? 48 : 62 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const max = Math.max(...points.map((point) => Number(point.value) || 0), ...comparisonPoints.map((point) => Number(point.value) || 0), 1);
    const x = (index) => pad.l + (points.length === 1 ? iw / 2 : (index / (points.length - 1)) * iw);
    const y = (value) => pad.t + ih - ((Number(value) || 0) / max) * ih;
    const line = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
    const comparisonLine = comparisonPoints.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${pad.t + ih} L${x(0).toFixed(1)},${pad.t + ih} Z`;
    let grid = "";
    let labels = "";
    if (!options.compact) {
      for (let tick = 0; tick <= 4; tick += 1) {
        const value = max * tick / 4;
        const yy = y(value);
        grid += `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" stroke="#e7edef" stroke-width="1"/>`;
        labels += `<text x="${pad.l - 8}" y="${yy + 4}" text-anchor="end" fill="#71838d" font-size="10">${safe(shortMoney.format(value))}</text>`;
      }
      const labelEvery = Math.max(1, Math.ceil(points.length / (w < 500 ? 4 : 7)));
      points.forEach((point, index) => {
        if (index % labelEvery === 0 || index === points.length - 1) labels += `<text x="${x(index)}" y="${h - 8}" text-anchor="middle" fill="#71838d" font-size="10">${safe(dayLabel.format(localDate(point.date)))}</text>`;
      });
    }
    const last = points[points.length - 1];
    target.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${safe(options.label || "Curva de vendas")}">
      ${grid}${labels}<path d="${area}" fill="rgba(24,127,119,.08)"/>${comparisonLine ? `<path d="${comparisonLine}" fill="none" stroke="#ac8440" stroke-width="${options.compact ? 2 : 3}" stroke-dasharray="7 5" stroke-linecap="round" stroke-linejoin="round"/>` : ""}<path d="${line}" fill="none" stroke="#187f77" stroke-width="${options.compact ? 2 : 3}" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${x(points.length - 1)}" cy="${y(last.value)}" r="${options.compact ? 2.5 : 4}" fill="#187f77" stroke="#fff" stroke-width="2"/>
    </svg>`;
  }

  function mergeComparisonRows(currentRows, previousRows, keyGetter = (item) => item.label) {
    const merged = new Map();
    (currentRows || []).forEach((item) => {
      const key = keyGetter(item);
      merged.set(key, { key, label: item.label, current: Number(item.value || 0), previous: 0 });
    });
    (previousRows || []).forEach((item) => {
      const key = keyGetter(item);
      const row = merged.get(key) || { key, label: item.label, current: 0, previous: 0 };
      row.previous += Number(item.value || 0);
      merged.set(key, row);
    });
    return [...merged.values()];
  }

  function combineComparisonTail(rows, limit) {
    const sorted = [...rows].sort((a, b) => Math.max(b.current, b.previous) - Math.max(a.current, a.previous) || a.label.localeCompare(b.label, "pt-BR"));
    if (sorted.length <= limit) return sorted;
    const head = sorted.slice(0, limit - 1);
    const tail = sorted.slice(limit - 1);
    return head.concat([{
      key: "demais", label: "Demais",
      current: tail.reduce((sum, item) => sum + item.current, 0),
      previous: tail.reduce((sum, item) => sum + item.previous, 0)
    }]);
  }

  function prepareAverageRateBars(currentRows, previousRows) {
    const merged = new Map();
    const add = (item, prefix) => {
      const key = item.label;
      const row = merged.get(key) || { key, label: item.label, currentSales: 0, currentNights: 0, previousSales: 0, previousNights: 0 };
      row[`${prefix}Sales`] += Number(item.qualifiedSales || 0);
      row[`${prefix}Nights`] += Number(item.roomNights || 0);
      merged.set(key, row);
    };
    (currentRows || []).forEach((item) => add(item, "current"));
    (previousRows || []).forEach((item) => add(item, "previous"));
    let rows = [...merged.values()].sort((a, b) => Math.max(b.currentNights, b.previousNights) - Math.max(a.currentNights, a.previousNights));
    if (rows.length > 8) {
      const head = rows.slice(0, 7);
      const tail = rows.slice(7).reduce((result, item) => ({
        key: "demais", label: "Demais",
        currentSales: result.currentSales + item.currentSales,
        currentNights: result.currentNights + item.currentNights,
        previousSales: result.previousSales + item.previousSales,
        previousNights: result.previousNights + item.previousNights
      }), { currentSales: 0, currentNights: 0, previousSales: 0, previousNights: 0 });
      rows = head.concat(tail);
    }
    return {
      current: rows.map((row) => ({ label: row.label, value: row.currentNights ? row.currentSales / row.currentNights : 0 })),
      previous: rows.map((row) => ({ label: row.label, value: row.previousNights ? row.previousSales / row.previousNights : 0 }))
    };
  }

  function renderBars(target, source, comparisonSource, options = {}) {
    const rows = combineComparisonTail(mergeComparisonRows(source, comparisonSource), 8);
    if (!rows.length || !rows.some((row) => row.current > 0 || row.previous > 0)) return empty(target, "Sem vendas para exibir neste recorte.");
    const w = widthOf(target);
    const rowH = 52;
    const h = Math.max(245, rows.length * rowH + 16);
    const labelW = Math.min(w * (options.showShare ? .34 : .39), options.showShare ? 155 : 170);
    const max = Math.max(...rows.flatMap((row) => [row.current, row.previous]), 1);
    const barX = labelW + 10;
    const valueW = options.showGrowth
      ? (w < 420 ? 122 : 150)
      : options.showShare ? (w < 420 ? 108 : 126) : (w < 420 ? 68 : 92);
    const usable = Math.max(40, w - barX - valueW - 6);
    const body = rows.map((row, index) => {
      const y = 10 + index * rowH;
      const previousLength = row.previous ? Math.max(2, (row.previous / max) * usable) : 0;
      const currentLength = row.current ? Math.max(2, (row.current / max) * usable) : 0;
      const label = String(row.label || "Não informado");
      const clipped = label.length > (w < 420 ? 17 : 22) ? `${label.slice(0, w < 420 ? 15 : 20)}…` : label;
      const previousShare = options.previousTotal ? row.previous / options.previousTotal * 100 : 0;
      const currentShare = options.currentTotal ? row.current / options.currentTotal * 100 : 0;
      const shareFormatter = options.showGrowth ? wholePercent : percent;
      const previousText = `${shortMoney.format(row.previous)}${options.showShare ? ` · ${shareFormatter.format(previousShare)}%` : ""}`;
      const currentText = `${shortMoney.format(row.current)}${options.showShare ? ` · ${shareFormatter.format(currentShare)}%` : ""}`;
      const growth = row.previous > 0 ? (row.current - row.previous) / row.previous * 100 : null;
      const growthDirection = growth === null ? (row.current > 0 ? "up" : "flat") : growth > .05 ? "up" : growth < -.05 ? "down" : "flat";
      const growthArrow = growthDirection === "up" ? "↑" : growthDirection === "down" ? "↓" : "→";
      const growthText = growth === null ? `${growthArrow} novo em 2026` : `${growthArrow} ${wholePercent.format(Math.abs(growth))}%`;
      const growthColor = growthDirection === "up" ? "#137a5a" : growthDirection === "down" ? "#c64b47" : "#607885";
      const valueFontSize = options.showGrowth ? (options.showShare ? 10.5 : 11.5) : (options.showShare ? 8.5 : 9);
      const growthMarkup = options.showGrowth
        ? `<text x="0" y="${y + 33}" fill="${growthColor}" font-size="11.5" font-weight="850">${safe(growthText)}</text>`
        : "";
      return `<g><title>${safe(label)} — 2025: ${safe(money.format(row.previous))}${options.showShare ? ` (${safe(shareFormatter.format(previousShare))}%)` : ""}; 2026: ${safe(money.format(row.current))}${options.showShare ? ` (${safe(shareFormatter.format(currentShare))}%)` : ""}${options.showGrowth ? `; variação: ${safe(growthText)}` : ""}</title>
        <text x="0" y="${y + (options.showGrowth ? 15 : 25)}" fill="#435d6d" font-size="10.5">${safe(clipped)}</text>
        <rect x="${barX}" y="${y + 5}" width="${usable}" height="12" rx="4" fill="#f4eee3"/>
        <rect x="${barX}" y="${y + 5}" width="${previousLength}" height="12" rx="4" fill="#d7b16b"/>
        <rect x="${barX}" y="${y + 23}" width="${usable}" height="12" rx="4" fill="#edf2f3"/>
        <rect x="${barX}" y="${y + 23}" width="${currentLength}" height="12" rx="4" fill="#315269"/>
        <text x="${w - 2}" y="${y + 15}" text-anchor="end" fill="#ac8440" font-size="${valueFontSize}" font-weight="800">${safe(previousText)}</text>
        <text x="${w - 2}" y="${y + 33}" text-anchor="end" fill="#20384a" font-size="${valueFontSize}" font-weight="800">${safe(currentText)}</text>
        ${growthMarkup}
      </g>`;
    }).join("");
    target.style.height = `${h}px`;
    target.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Comparação de vendas de 2025 e 2026">${body}</svg>`;
  }

  function renderColumns(target, rows, comparisonRows, options = {}) {
    const shown = mergeComparisonRows(rows, comparisonRows, (item) => item.key || item.label).sort((a, b) => String(a.key).localeCompare(String(b.key))).slice(0, 12);
    if (!shown.length || !shown.some((row) => row.current > 0 || row.previous > 0)) return empty(target, options.empty || "Nenhum mês de check-in encontrado.");
    const availableWidth = widthOf(target);
    const minimumSlot = options.showShare ? 70 : 0;
    const w = Math.max(availableWidth, shown.length * minimumSlot + (availableWidth < 500 ? 56 : 68));
    const h = Math.round(target.getBoundingClientRect().height || 290);
    const pad = { t: options.showShare ? 38 : 22, r: 10, b: 45, l: availableWidth < 500 ? 46 : 58 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const max = Math.max(...shown.flatMap((row) => [row.current, row.previous]), 1);
    const slot = iw / shown.length;
    const barW = Math.max(5, Math.min(28, slot * .31));
    let markup = "";
    for (let tick = 0; tick <= 3; tick += 1) {
      const value = max * tick / 3;
      const yy = pad.t + ih - (value / max) * ih;
      markup += `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" stroke="#e7edef"/><text x="${pad.l - 7}" y="${yy + 4}" text-anchor="end" fill="#71838d" font-size="9">${safe(shortMoney.format(value))}</text>`;
    }
    shown.forEach((row, index) => {
      const previousHeight = (row.previous / max) * ih;
      const currentHeight = (row.current / max) * ih;
      const groupX = pad.l + index * slot + slot / 2;
      const previousX = groupX - barW - 2;
      const currentX = groupX + 2;
      const label = availableWidth < 520 ? String(row.label).replace(/\/20\d\d$/, "") : row.label;
      const previousShare = options.previousTotal ? row.previous / options.previousTotal * 100 : 0;
      const currentShare = options.currentTotal ? row.current / options.currentTotal * 100 : 0;
      const shareMarkup = options.showShare
        ? `${row.previous ? `<text x="${previousX + barW / 2}" y="${Math.max(12, pad.t + ih - previousHeight - 6)}" text-anchor="middle" fill="#ac8440" font-size="8.5" font-weight="800">${safe(percent.format(previousShare))}%</text>` : ""}${row.current ? `<text x="${currentX + barW / 2}" y="${Math.max(12, pad.t + ih - currentHeight - 6)}" text-anchor="middle" fill="#20384a" font-size="8.5" font-weight="800">${safe(percent.format(currentShare))}%</text>` : ""}`
        : "";
      markup += `<g><title>${safe(row.label)} — 2025: ${safe(money.format(row.previous))}${options.showShare ? ` (${safe(percent.format(previousShare))}%)` : ""}; 2026: ${safe(money.format(row.current))}${options.showShare ? ` (${safe(percent.format(currentShare))}%)` : ""}</title><rect x="${previousX}" y="${pad.t + ih - previousHeight}" width="${barW}" height="${row.previous ? Math.max(2, previousHeight) : 0}" rx="4" fill="#d7b16b"/><rect x="${currentX}" y="${pad.t + ih - currentHeight}" width="${barW}" height="${row.current ? Math.max(2, currentHeight) : 0}" rx="4" fill="#315269"/>${shareMarkup}<text x="${groupX}" y="${h - 16}" text-anchor="middle" fill="#617681" font-size="9">${safe(label)}</text></g>`;
    });
    target.style.overflowX = w > availableWidth ? "auto" : "hidden";
    target.innerHTML = `<svg viewBox="0 0 ${w} ${h}" style="width:${w}px;min-width:${w}px" role="img" aria-label="${safe(options.label || "Comparação de vendas por mês do check-in em 2025 e 2026")}">${markup}</svg>`;
  }

  function renderPickup(rows) {
    if (!rows.length) { els.pickup.innerHTML = '<div class="empty-chart">Nenhuma curva de check-in neste recorte.</div>'; return; }
    els.pickup.innerHTML = rows.map((row, index) => `<article class="pickup-card"><header><h3>${safe(row.label)}</h3><span class="pickup-values"><em class="value-2025">25 ${safe(shortMoney.format(row.comparisonValue || 0))}</em><em class="value-2026">26 ${safe(shortMoney.format(row.value || 0))}</em></span></header><div class="pickup-chart" id="pickup-${index}"></div></article>`).join("");
    rows.forEach((row, index) => renderLine(document.getElementById(`pickup-${index}`), row.daily.map((point) => ({ date: point.date, value: point.cumulative })), {
      compact: true,
      label: `Curvas de vendas de 2025 e 2026 para check-in em ${row.label}`,
      comparisonPoints: (row.comparisonDaily || []).map((point) => ({ date: point.date, value: point.cumulative }))
    }));
  }

  function renderOccupancy(hotels = []) {
    if (!els.occupancy) return;
    if (!hotels.length) return empty(els.occupancy, "Sem estadias capturadas para este período.");
    const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
    els.occupancy.innerHTML = hotels.map((hotel) => {
      const months = [];
      (hotel.days || []).forEach((day) => {
        const key = day.date.slice(0, 7);
        const current = months.at(-1);
        if (current?.key === key) current.count += 1;
        else months.push({ key, count: 1, label: monthName.format(localDate(day.date)) });
      });
      const monthRow = months.map((month) => `<th class="occupancy-month" colspan="${month.count}">${safe(month.label)}</th>`).join("");
      const dayRow = (hotel.days || []).map((day) => `<th class="occupancy-day"><b>${safe(day.date.slice(8))}</b><small>${safe(weekday.format(localDate(day.date)).replace(".", ""))}</small></th>`).join("");
      const cells = (getter, className = "") => (hotel.days || []).map((day) => `<td class="${typeof className === "function" ? className(day) : className}">${safe(getter(day))}</td>`).join("");
      return `<article class="occupancy-hotel"><h3>${safe(hotel.hotel)} · ${integer.format(hotel.apartments)} apartamentos</h3><div class="occupancy-scroll"><table class="occupancy-table"><thead><tr><th class="occupancy-row-label">Mês</th>${monthRow}</tr><tr><th class="occupancy-row-label">Dia</th>${dayRow}</tr></thead><tbody><tr><th class="occupancy-row-label">APT</th>${cells(() => integer.format(hotel.apartments))}</tr><tr><th class="occupancy-row-label">OCP</th>${cells((day) => integer.format(day.occupied))}</tr><tr><th class="occupancy-row-label">DIS</th>${cells((day) => integer.format(day.available), (day) => day.available < 0 ? "occupancy-over" : "")}</tr><tr><th class="occupancy-row-label">Ocupação</th>${cells((day) => `${wholePercent.format(day.rate)}%`, "occupancy-rate")}</tr></tbody></table></div></article>`;
    }).join("");
  }

  function renderHotelSalesSummary(payload) {
    if (!els.hotelSalesSummary) return;
    const current = new Map((payload.byHotel || []).map((item) => [item.label, item.value || 0]));
    const previous = new Map((payload.comparison?.byHotel || []).map((item) => [item.label, item.value || 0]));
    const labels = [...new Set([...current.keys(), ...previous.keys()])].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const growthCell = (now, before) => {
      if (!(before > 0)) return now > 0 ? '<span class="positive">novo</span>' : "—";
      const growth = (now - before) / before * 100;
      const css = growth < 0 ? "negative" : growth > 0 ? "positive" : "";
      return `<span class="${css}">${percent.format(growth)}%</span>`;
    };
    const rows = labels.map((label) => `<tr><td>${safe(label)}</td><td>${safe(money.format(current.get(label) || 0))}</td><td>${safe(money.format(previous.get(label) || 0))}</td><td>${growthCell(current.get(label) || 0, previous.get(label) || 0)}</td></tr>`).join("");
    const currentTotal = payload.summary?.sales || 0;
    const previousTotal = payload.comparison?.summary?.sales || 0;
    els.hotelSalesSummary.innerHTML = `<article class="comparison-table-card"><div class="comparison-table-title">Vendas totais por hotel</div><div class="comparison-table-period">Período ${fmtDate(payload.period.start)} a ${fmtDate(payload.period.end)}</div><div class="comparison-table-scroll"><table class="comparison-table"><thead><tr><th>Hotel</th><th>2026</th><th>2025</th><th>Variação</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total</td><td>${safe(money.format(currentTotal))}</td><td>${safe(money.format(previousTotal))}</td><td>${growthCell(currentTotal, previousTotal)}</td></tr></tfoot></table></div></article>`;
  }

  function render(payload) {
    currentPayload = payload;
    setOptions(els.hotel, payload.filters.hotels || [], payload.selected.hotel, "Todos os hotéis");
    setChannelOptions(payload.filters.channels || [], payload.selected.channels || (payload.selected.channel ? [payload.selected.channel] : []));
    setOptions(els.checkin, payload.filters.checkinMonths || [], payload.selected.checkinMonth, "Todos os meses", (item) => item.key, (item) => item.label);
    els.start.value = payload.period.start;
    els.end.value = payload.period.end;
    els.sales.textContent = money.format(payload.summary.sales || 0);
    const hasPreviousSales = Boolean(payload.comparison?.available);
    els.previousSummary.hidden = !hasPreviousSales;
    els.previousLabel.textContent = `Mesmo período em ${payload.comparison?.year || 2025}`;
    els.previousSales.textContent = money.format(payload.comparison?.summary?.sales || 0);
    els.reservations.textContent = integer.format(payload.summary.reservations || 0);
    els.ticket.textContent = money.format(payload.summary.ticketAverage || 0);
    els.hotels.textContent = integer.format(payload.summary.hotels || 0);
    const currentOccupancy = payload.revpar?.summary?.occupancyRate || 0;
    const previousOccupancy = payload.comparison?.revpar?.summary?.occupancyRate || 0;
    setPerformanceCard(els.topAdr, els.topAdrPrevious, els.topAdrGrowth, payload.summary.averageDailyRate, payload.comparison?.summary?.averageDailyRate, money.format.bind(money));
    setPerformanceCard(els.topOccupancy, els.topOccupancyPrevious, els.topOccupancyGrowth, currentOccupancy, previousOccupancy, (value) => `${wholePercent.format(value)}%`);
    setPerformanceCard(els.topRevpar, els.topRevparPrevious, els.topRevparGrowth, payload.revpar?.summary?.revpar, payload.comparison?.revpar?.summary?.revpar, money.format.bind(money));
    els.period.textContent = `${fmtDate(payload.period.start)} a ${fmtDate(payload.period.end)}`;
    els.comparisonTitle.textContent = payload.comparison?.available ? "Comparativo 2025 × 2026 atualizado" : "Comparativo 2025 × 2026 em preparação";
    els.reason.textContent = payload.comparison?.coverage || payload.comparison?.pendingReason || "A base histórica de 2025 ainda não está disponível.";
    els.comparisonTotal.textContent = payload.comparison?.available ? shortMoney.format(payload.comparison.summary?.sales || 0) : "sem dados";
    els.stamp.textContent = `Atualizado ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(payload.generatedAt))}`;
    renderLine(els.daily, (payload.daily || []).map((point) => ({ date: point.date, value: point.cumulative })), {
      label: "Curvas acumuladas de vendas de 2025 e 2026",
      comparisonPoints: (payload.comparison?.daily || []).map((point) => ({ date: point.date, value: point.cumulative }))
    });
    renderBars(els.channels, payload.byChannel || [], payload.comparison?.byChannel || [], {
      showShare: true,
      showGrowth: isKpiReport,
      currentTotal: payload.summary.sales || 0,
      previousTotal: payload.comparison?.summary?.sales || 0
    });
    renderBars(els.hotelChart, payload.byHotel || [], payload.comparison?.byHotel || [], { showGrowth: isKpiReport });
    renderColumns(els.checkinChart, payload.byCheckinMonth || [], payload.comparison?.byCheckinMonth || [], {
      showShare: true,
      currentTotal: payload.summary.sales || 0,
      previousTotal: payload.comparison?.summary?.sales || 0
    });
    renderPickup(payload.pickup || []);
    renderOccupancy(payload.occupancy || []);
    renderHotelSalesSummary(payload);
    els.averageRate2025.textContent = money.format(payload.comparison?.summary?.averageDailyRate || 0);
    els.averageRate2026.textContent = money.format(payload.summary.averageDailyRate || 0);
    els.roomNights2025.textContent = `${integer.format(payload.comparison?.summary?.roomNights || 0)} UHs-noite`;
    els.roomNights2026.textContent = `${integer.format(payload.summary.roomNights || 0)} UHs-noite`;
    renderLine(els.averageRateDaily, (payload.daily || []).map((point) => ({ date: point.date, value: point.averageDailyRate || 0 })), {
      label: "Curvas acumuladas da diária média de 2025 e 2026",
      empty: "Sem diárias válidas para calcular neste recorte.",
      comparisonPoints: (payload.comparison?.daily || []).map((point) => ({ date: point.date, value: point.averageDailyRate || 0 }))
    });
    const channelRates = prepareAverageRateBars(payload.byChannel || [], payload.comparison?.byChannel || []);
    const hotelRates = prepareAverageRateBars(payload.byHotel || [], payload.comparison?.byHotel || []);
    renderBars(els.averageRateChannels, channelRates.current, channelRates.previous, { showGrowth: isKpiReport });
    renderBars(els.averageRateHotels, hotelRates.current, hotelRates.previous, { showGrowth: isKpiReport });
    renderColumns(
      els.averageRateCheckin,
      (payload.byCheckinMonth || []).map((item) => ({ ...item, value: item.averageDailyRate || 0 })),
      (payload.comparison?.byCheckinMonth || []).map((item) => ({ ...item, value: item.averageDailyRate || 0 })),
      { label: "Comparação da diária média por mês do check-in em 2025 e 2026", empty: "Sem diárias válidas por mês de check-in." }
    );
    els.revpar2025.textContent = money.format(payload.comparison?.revpar?.summary?.revpar || 0);
    els.revpar2026.textContent = money.format(payload.revpar?.summary?.revpar || 0);
    els.availableRoomNights2025.textContent = `${integer.format(payload.comparison?.revpar?.summary?.availableRoomNights || 0)} aptos-noite disponíveis`;
    els.availableRoomNights2026.textContent = `${integer.format(payload.revpar?.summary?.availableRoomNights || 0)} aptos-noite disponíveis`;
    renderLine(els.revparDaily, payload.revpar?.daily || [], {
      label: "Curvas acumuladas de geração de RevPAR em 2025 e 2026",
      empty: "Sem receita de hospedagem para calcular o RevPAR neste recorte.",
      comparisonPoints: payload.comparison?.revpar?.daily || []
    });
    renderBars(
      els.revparHotels,
      (payload.revpar?.byHotel || []).map((item) => ({ ...item, value: item.revpar || 0 })),
      (payload.comparison?.revpar?.byHotel || []).map((item) => ({ ...item, value: item.revpar || 0 }))
    );
    renderColumns(
      els.revparCheckin,
      (payload.revpar?.byCheckinMonth || []).map((item) => ({ ...item, value: item.revpar || 0 })),
      (payload.comparison?.revpar?.byCheckinMonth || []).map((item) => ({ ...item, value: item.revpar || 0 })),
      { label: "Comparação do RevPAR por mês do check-in em 2025 e 2026", empty: "Sem receita de hospedagem por mês para calcular o RevPAR." }
    );
  }

  async function load() {
    els.error.hidden = true;
    els.loading.hidden = false;
    els.content.hidden = true;
    const params = new URLSearchParams(new FormData(els.form));
    try {
      const response = await fetch(`${apiUrl}?${params.toString()}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (response.status === 401) { window.top.location.href = "/portal-login.html"; return; }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar o relatório.");
      els.loading.hidden = true;
      els.content.hidden = false;
      render(payload);
    } catch (error) {
      els.loading.hidden = true;
      els.error.textContent = error.message || "Não foi possível carregar o relatório.";
      els.error.hidden = false;
    }
  }

  els.form.addEventListener("submit", (event) => { event.preventDefault(); load(); });
  els.clear.addEventListener("click", () => {
    els.start.value = "2026-09-01";
    els.end.value = "2026-09-18";
    els.hotel.value = "";
    els.channelOptions.querySelectorAll('input[name="channel"]:checked').forEach((input) => { input.checked = false; });
    updateChannelSummary();
    els.channel.open = false;
    els.checkin.value = "";
    load();
  });
  els.channelOptions.addEventListener("change", updateChannelSummary);
  els.clearChannels.addEventListener("click", () => {
    els.channelOptions.querySelectorAll('input[name="channel"]:checked').forEach((input) => { input.checked = false; });
    updateChannelSummary();
  });
  document.addEventListener("click", (event) => { if (!els.channel.contains(event.target)) els.channel.open = false; });
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (currentPayload && !els.content.hidden) {
        const channels = selectedChannels();
        render(currentPayload);
        setChannelOptions(currentPayload.filters.channels || [], channels);
      }
    }, 180);
  });
  load();
})();
