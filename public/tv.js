const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const percentDetailed = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
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

function byId(id) {
  return document.getElementById(id);
}

function normalizedName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isTeamSeller(value) {
  return normalizedName(value) === "equipe sueds";
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

function formatPct(value) {
  return value === null || value === undefined ? "Sem meta" : `${percent.format(value)}%`;
}

function gaugePct(value) {
  if (value === null || value === undefined) return 0;
  return Math.max(0, Math.min(value, 150));
}

function gaugeClass(value) {
  if (value === null || value === undefined) return "gauge-sem-meta";
  if (value >= 120) return "gauge-dark-green";
  if (value >= 100) return "gauge-green";
  if (value >= 70) return "gauge-yellow";
  return "gauge-red";
}

function gaugeValue(value) {
  return value === null || value === undefined ? "--" : `${percent.format(value)}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCartPct(value) {
  return value === null || value === undefined ? "0%" : `${percent.format(value)}%`;
}

function formatDetailedPct(value) {
  return value === null || value === undefined ? "0,00%" : `${percentDetailed.format(value)}%`;
}

function formatLastUpdate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function goalGauge(label, value) {
  const gaugeValuePct = gaugePct(value);
  return `
    <div class="gauge ${gaugeClass(value)}" aria-label="${label} ${formatPct(value)}">
      <svg viewBox="0 0 200 118" role="img">
        <path class="gauge-track" pathLength="150" d="M 18 100 A 82 82 0 0 1 182 100"></path>
        <path class="gauge-progress" pathLength="150" stroke-dasharray="${gaugeValuePct} 150" d="M 18 100 A 82 82 0 0 1 182 100"></path>
      </svg>
      <div class="gauge-readout">
        <span>${label}</span>
        <strong>${gaugeValue(value)}</strong>
      </div>
    </div>
  `;
}

function goalColumn(label, value, reservationText) {
  return `
    <div class="goal-column">
      ${goalGauge(label, value)}
      ${reservationText ? `<span class="reservations-pill">${reservationText}</span>` : ""}
    </div>
  `;
}

function statusClass(seller) {
  if (seller.dailyStatus === "meta_batida" || seller.mtdStatus === "meta_batida" || seller.monthlyStatus === "meta_batida") return "meta_batida";
  if (seller.dailyStatus === "em_ritmo" || seller.mtdStatus === "em_ritmo" || seller.monthlyStatus === "em_ritmo") return "em_ritmo";
  if (seller.dailyStatus === "sem_meta" && seller.mtdStatus === "sem_meta" && seller.monthlyStatus === "sem_meta") return "sem_meta";
  return "abaixo";
}

function countList(items, emptyText) {
  if (!items || !items.length) return `<span class="cart-empty">${emptyText}</span>`;
  return items
    .map((item) => `
      <div class="cart-list-row">
        <span>${escapeHtml(item.label)}</span>
        <strong>${item.count}</strong>
      </div>
    `)
    .join("");
}

function renderCartRecoveryBlock(seller) {
  if (!seller) return "";
  return `
    <section class="cart-card" aria-label="Recuperação de carrinhos de ${escapeHtml(seller.name)}">
      <div class="cart-card-title">
        <span>Recuperação de carrinhos</span>
        <strong>${seller.contacted}</strong>
      </div>
      <div class="cart-kpis">
        <div><strong>${seller.recovered}</strong><span>recuperados</span></div>
        <div><strong>${seller.lost}</strong><span>perdidos</span></div>
        <div><strong>${seller.pending}</strong><span>pendentes</span></div>
        <div><strong>${formatCartPct(seller.recoveryPct)}</strong><span>taxa</span></div>
      </div>
      <div class="cart-detail">
        <div>
          <h4>Status</h4>
          ${countList(seller.statusBreakdown, "Sem status")}
        </div>
        <div>
          <h4>Motivos de perda</h4>
          ${countList(seller.lossReasons, "Sem perdas")}
        </div>
      </div>
    </section>
  `;
}

function renderAsksuiteBlock(seller) {
  if (!seller) return "";
  return `
    <section class="asksuite-card" aria-label="Asksuite de ${escapeHtml(seller.name)}">
      <div class="asksuite-title">
        <span>Asksuite</span>
      </div>
      <div class="asksuite-kpis">
        <div><strong>${integer.format(seller.attendances || 0)}</strong><span>atend.</span></div>
        <div><strong>${integer.format(seller.opportunities || 0)}</strong><span>oport.</span></div>
        <div><strong>${integer.format(seller.sales || 0)}</strong><span>vendas</span></div>
        <div><strong>${formatDetailedPct(seller.salesConvPct)}</strong><span>conv. vendas</span></div>
      </div>
    </section>
  `;
}

function analyticsPropertyCard(property, fallbackLabel) {
  const data = property || {};
  const realtime = data.realtime || {};
  return `
    <article class="analytics-card analytics-property-card">
      <span class="analytics-property-title">${escapeHtml(fallbackLabel)}</span>
      <div class="analytics-mini-grid">
        <div>
          <small>30 min</small>
          <strong>${integer.format(realtime.activeUsers30m || 0)}</strong>
        </div>
        <div>
          <small>5 min</small>
          <strong>${integer.format(realtime.activeUsers5m || 0)}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderAnalytics(analytics) {
  byId("analyticsStrip").innerHTML = `
    ${analyticsPropertyCard(analytics?.site, "Sueds")}
    ${analyticsPropertyCard(analytics?.omnibees, "Motor")}
  `;
}

function render(data) {
  byId("lastUpdate").textContent = `Atualizado ${formatLastUpdate(data.generatedAt)}`;
  renderAnalytics(data.analytics);

  const cartsBySeller = new Map((data.cartRecovery || []).map((item) => [normalizedName(item.name), item]));
  const asksuiteBySeller = new Map((data.asksuite || []).map((item) => [normalizedName(item.name), item]));

  byId("sellerGrid").innerHTML = data.sellers
    .map((seller) => `
      <article class="seller-card ${statusClass(seller)} ${isTeamSeller(seller.name) ? "seller-card-team" : ""}">
        <h2 class="seller-name">${isTeamSeller(seller.name) ? "TIME SUEDS" : seller.name}</h2>
        <div class="gauge-layout">
          <div class="goal-column goal-column-day">
            ${goalGauge("Meta hoje", seller.dailyGoalPct)}
            <span class="reservations-pill">${seller.reservationsToday} reservas hoje</span>
          </div>
          ${goalColumn("ICM MTD", seller.mtdGoalPct, "")}
          ${goalColumn("ICM mês", seller.monthlyGoalPct, "")}
          <span class="reservations-pill reservations-pill-month">${seller.reservationsMonth} no mês</span>
        </div>
        ${renderAsksuiteBlock(asksuiteBySeller.get(normalizedName(seller.name)))}
        ${renderCartRecoveryBlock(cartsBySeller.get(normalizedName(seller.name)))}
      </article>
    `)
    .join("");
}

async function load() {
  const month = byId("monthSelect").value;
  const response = await fetch(`/api/dashboard/tv?date=${dateForMonth(month)}&month=${month}`);
  if (!response.ok) throw new Error("Falha ao carregar dados da TV");
  render(await response.json());
}

setupMonthSelect();
load().catch((error) => {
  byId("sellerGrid").innerHTML = `<article class="panel"><h2>${error.message}</h2></article>`;
});
setInterval(load, 60000);
