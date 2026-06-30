const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("pt-BR");
const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const MONTH_LABELS = {
  "2026-05": "MAIO",
  "2026-06": "JUNHO",
  "2026-07": "JULHO",
  "2026-08": "AGOSTO",
  "2026-09": "SETEMBRO",
  "2026-10": "OUTUBRO",
  "2026-11": "NOVEMBRO",
  "2026-12": "DEZEMBRO"
};
const GESTORES_TOKEN_STORAGE_KEY = "sueds_gestores_access_token";

function byId(id) {
  return document.getElementById(id);
}

function getStoredAccessToken() {
  return localStorage.getItem(GESTORES_TOKEN_STORAGE_KEY) || "";
}

function askAccessToken() {
  const token = window.prompt("Digite a senha de acesso da visão gestores:");
  if (!token) return "";
  const trimmed = token.trim();
  localStorage.setItem(GESTORES_TOKEN_STORAGE_KEY, trimmed);
  return trimmed;
}

function clearAccessToken() {
  localStorage.removeItem(GESTORES_TOKEN_STORAGE_KEY);
}

function defaultMonth() {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return MONTHS.includes(month) ? month : "2026-06";
}

function lastDayOfMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function dateForMonth(month) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const day = month === currentMonth ? now.getDate() : lastDayOfMonth(month);
  return `${month}-${String(day).padStart(2, "0")}`;
}

function setupMonthSelect() {
  const select = byId("monthSelect");
  select.innerHTML = MONTHS.map((month) => `<option value="${month}">${MONTH_LABELS[month]}</option>`).join("");
  select.value = new URLSearchParams(window.location.search).get("month") || defaultMonth();
  select.addEventListener("change", load);
}

function setupGlobalFilters() {
  byId("daySelect").addEventListener("change", load);
  byId("hotelSelect").addEventListener("change", load);
  byId("channelSelect").addEventListener("change", load);
}

function pct(value) {
  return value === null || value === undefined ? "Sem meta" : `${number.format(Math.round(value))}%`;
}

function icmClass(value) {
  if (value === null || value === undefined) return "icm-no-goal";
  return value < 100 ? "icm-low" : "icm-ok";
}

function formatLastUpdate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function gaugePct(value) {
  if (value === null || value === undefined) return 0;
  return Math.max(0, Math.min(value, 150));
}

function gaugeClass(value) {
  if (value === null || value === undefined) return "gauge-sem-meta";
  if (value >= 100) return "gauge-green";
  if (value >= 70) return "gauge-yellow";
  return "gauge-red";
}

function gaugeValue(value) {
  return value === null || value === undefined ? "--" : number.format(value);
}

function monthlyGauge(item) {
  const value = gaugePct(item.monthlyGoalPct);
  return `
    <div class="gauge ${gaugeClass(item.monthlyGoalPct)}" aria-label="ICM do mês ${pct(item.monthlyGoalPct)}">
      <svg viewBox="0 0 200 118" role="img">
        <path class="gauge-track" pathLength="150" d="M 18 100 A 82 82 0 0 1 182 100"></path>
        <path class="gauge-progress" pathLength="150" stroke-dasharray="${value} 150" d="M 18 100 A 82 82 0 0 1 182 100"></path>
      </svg>
      <div class="gauge-readout">
        <span>ICM mês</span>
        <strong>${gaugeValue(item.monthlyGoalPct)}</strong>
      </div>
      <div class="gauge-scale"><span>0</span><span>150</span></div>
    </div>
  `;
}

function formatDate(value) {
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function displayLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s(/-])([\p{L}])/gu, (_, prefix, char) => `${prefix}${char.toLocaleUpperCase("pt-BR")}`)
    .replace(/\bIcm\b/g, "ICM");
}

function bars(items, options = {}) {
  const formatLabel = options.formatLabel || ((value) => value);
  return items
    .map((item) => `
      <div class="performance-row">
        <span class="row-label">${formatLabel(item.label)}</span>
        <strong>${number.format(item.reservations || 0)}</strong>
        <strong>${money.format(item.value)}</strong>
        <strong>${money.format(item.monthlyGoal || 0)}</strong>
        <strong class="icm-value ${icmClass(item.monthlyGoalPct)}">${pct(item.monthlyGoalPct)}</strong>
      </div>
    `)
    .join("");
}

function performanceTable(items, firstColumn, options = {}) {
  return `
    <div class="performance-row performance-head">
      <span>${firstColumn}</span>
      <span>Reservas</span>
      <span>Venda</span>
      <span>Meta</span>
      <span>ICM %</span>
    </div>
    ${bars(items, options)}
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function analyticsList(items, emptyText) {
  if (!items || !items.length) return `<span class="analytics-empty">${emptyText}</span>`;
  return items
    .map((item) => `
      <div class="analytics-list-row">
        <span>${escapeHtml(item.label)}</span>
        <strong>${number.format(item.activeUsers || 0)}</strong>
      </div>
    `)
    .join("");
}

function variationPct(current, previous) {
  if (!previous) return "";
  const value = Math.round(((current - previous) / previous) * 100);
  const sign = value > 0 ? "+" : "";
  return ` | ${sign}${number.format(value)}% vs AA`;
}

function analyticsPropertySection(property, fallbackLabel) {
  const data = property || {};
  const realtime = data.realtime || {};
  const today = data.today || {};
  const month = data.month || {};
  const currentVisitors = month.totalUsers ?? month.activeUsers ?? 0;
  const previousVisitors = month.previousYear?.totalUsers || 0;
  const currentSessions = month.sessions || 0;
  const previousSessions = month.previousYear?.sessions || 0;
  return `
    <article class="analytics-property-panel">
      <h3>${escapeHtml(data.label || fallbackLabel)}</h3>
      <div class="analytics-kpi-grid">
        <div class="analytics-manager-card">
          <span>Últimos 30 min</span>
          <strong>${number.format(realtime.activeUsers30m || 0)}</strong>
          <small>ativos</small>
        </div>
        <div class="analytics-manager-card">
          <span>Últimos 5 min</span>
          <strong>${number.format(realtime.activeUsers5m || 0)}</strong>
          <small>ativos</small>
        </div>
        <div class="analytics-manager-card">
          <span>Visitantes únicos</span>
          <strong>${number.format(currentVisitors)}</strong>
          <small>AA ${number.format(previousVisitors)}${variationPct(currentVisitors, previousVisitors)}</small>
        </div>
        <div class="analytics-manager-card">
          <span>Sessões</span>
          <strong>${number.format(currentSessions)}</strong>
          <small>AA ${number.format(previousSessions)}${variationPct(currentSessions, previousSessions)}</small>
        </div>
      </div>
      <div class="analytics-list-grid">
        <div class="analytics-manager-card list-card">
          <span>Origens hoje</span>
          ${analyticsList(today.topSources, "Sem dados de origem hoje")}
        </div>
        <div class="analytics-manager-card list-card">
          <span>Origens no mês</span>
          ${analyticsList(month.topSources, "Sem dados de origem")}
        </div>
      </div>
    </article>
  `;
}

function renderAnalytics(data) {
  const analytics = data.analytics || {};
  byId("analyticsOverview").innerHTML = `
    ${analyticsPropertySection(analytics.site, "Site institucional")}
    ${analyticsPropertySection(analytics.omnibees, "Motor Omnibees")}
  `;
}

function optionList(options, selected, allLabel) {
  const values = options.includes(selected) || selected === "" ? options : [selected, ...options];
  return [
    `<option value="">${allLabel}</option>`,
    ...values.map((item) => `<option value="${item}"${item === selected ? " selected" : ""}>${item}</option>`)
  ].join("");
}

function renderGlobalFilters(filters) {
  const daySelect = byId("daySelect");
  const hotelSelect = byId("hotelSelect");
  const channelSelect = byId("channelSelect");
  daySelect.innerHTML = optionList(filters.days || [], filters.selectedDay || "", "Todos os dias").replace(
    />(\d{4}-\d{2}-\d{2})</g,
    (_, value) => `>${formatDate(value)}<`
  );
  hotelSelect.innerHTML = optionList(filters.hotels || [], filters.selectedHotel || "", "Todos os hotéis");
  channelSelect.innerHTML = optionList(filters.channels || [], filters.selectedChannel || "", "Todos os canais");
}

function render(data) {
  byId("lastUpdate").textContent = `Atualizado ${formatLastUpdate(data.generatedAt)}`;
  renderAnalytics(data);

  const hasDayFilter = Boolean(data.filters?.selectedDay);
  const hasGlobalFilter = hasDayFilter || Boolean(data.filters?.selectedHotel) || Boolean(data.filters?.selectedChannel);
  byId("salesTodayLabel").textContent = hasDayFilter ? "Vendas no dia" : "Vendas hoje";
  byId("salesMonthLabel").textContent = hasGlobalFilter ? "Vendas no recorte" : "Vendas no mês";
  byId("salesToday").textContent = money.format(data.summary.salesToday);
  byId("reservationsToday").textContent = `${data.summary.reservationsToday} reservas ${hasDayFilter ? "no dia" : "hoje"}`;
  byId("salesMonth").textContent = money.format(data.summary.salesMonth);
  byId("ticketAverage").textContent = `Ticket médio ${money.format(data.summary.ticketAverageMonth)}`;
  byId("receivedMonth").textContent = money.format(data.summary.receivedMonth);
  byId("remainingMonth").textContent = money.format(data.summary.remainingMonth);
  renderGlobalFilters(data.filters || { days: [], hotels: [], channels: [] });

  byId("strategicChannels").innerHTML = (data.strategicChannels || [])
    .map((item) => `
      <article class="strategic-card">
        <h3>${item.name}</h3>
        <div class="seller-pills">
          <span class="reservations-pill">${number.format(item.reservationsToday)} reservas hoje</span>
          <span class="reservations-pill">${number.format(item.reservationsMonth)} no mês</span>
        </div>
        ${monthlyGauge(item)}
        <div class="goal-block">
          <div class="goal-label"><span>Meta do dia</span><strong>${pct(item.dailyGoalPct)}</strong></div>
          <div class="track"><div class="fill" style="width: ${Math.min(item.dailyGoalPct || 0, 100)}%"></div></div>
        </div>
        <div class="goal-block">
          <div class="goal-label"><span>Meta do mês</span><strong>${pct(item.monthlyGoalPct)}</strong></div>
          <div class="track"><div class="fill" style="width: ${Math.min(item.monthlyGoalPct || 0, 100)}%"></div></div>
        </div>
      </article>
    `)
    .join("");

  const rankingSellers = (data.sellers || []).filter((seller) => seller.name !== "Site");

  byId("sellerRanking").innerHTML = `
    <div class="seller-table-row seller-table-head">
      <span>#</span>
      <span>Responsável</span>
      <span>Reservas</span>
      <span>Venda</span>
      <span>Meta</span>
      <span>ICM %</span>
    </div>
    ${rankingSellers
      .map((seller, index) => `
        <div class="seller-table-row">
          <span class="rank-position">${index + 1}</span>
          <span class="row-label">${seller.name}</span>
          <strong>${number.format(seller.reservationsMonth)}</strong>
          <strong>${money.format(seller.salesMonth)}</strong>
          <strong>${money.format(seller.monthlyGoal || 0)}</strong>
          <strong class="icm-value ${icmClass(seller.monthlyGoalPct)}">${pct(seller.monthlyGoalPct)}</strong>
        </div>
      `)
      .join("")}
  `;

  byId("channelBars").innerHTML = performanceTable(data.channels, "Canal", { formatLabel: displayLabel });
  byId("hotelTable").innerHTML = performanceTable(data.hotels, "Hotel", { formatLabel: displayLabel });

  byId("dailySales").innerHTML = data.dailySales
    .map((day) => `
      <div class="daily-row">
        <span>${formatDate(day.date)}</span>
        <span>${number.format(day.reservations)}</span>
        <span>${money.format(day.sales)}</span>
        <span>${money.format(day.received)}</span>
        <span>${money.format(day.remaining)}</span>
      </div>
    `)
    .join("");
}

async function load() {
  const month = byId("monthSelect").value;
  const params = new URLSearchParams({
    date: dateForMonth(month),
    month
  });
  const day = byId("daySelect").value;
  const hotel = byId("hotelSelect").value;
  const channel = byId("channelSelect").value;
  if (day) params.set("day", day);
  if (hotel) params.set("hotel", hotel);
  if (channel) params.set("channel", channel);
  let token = getStoredAccessToken();
  if (!token) token = askAccessToken();
  if (!token) throw new Error("Acesso aos gestores não informado");

  let response = await fetch(`/api/dashboard/gestores?${params.toString()}`, {
    headers: { "x-dashboard-token": token }
  });

  if (response.status === 401) {
    clearAccessToken();
    token = askAccessToken();
    if (!token) throw new Error("Acesso aos gestores não autorizado");
    response = await fetch(`/api/dashboard/gestores?${params.toString()}`, {
      headers: { "x-dashboard-token": token }
    });
  }

  if (!response.ok) throw new Error("Falha ao carregar dados dos gestores");
  render(await response.json());
}

setupMonthSelect();
setupGlobalFilters();
load().catch((error) => {
  byId("sellerRanking").innerHTML = `<div class="panel-error">${error.message}</div>`;
});
setInterval(load, 60000);
