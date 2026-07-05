const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("pt-BR");
const pctNumber = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0
});

const MONTHS = [
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12"
];

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

const monthSelect = document.getElementById("monthSelect");

function currentMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function defaultMonth() {
  const current = currentMonth();
  return MONTHS.includes(current) ? current : "2026-07";
}

function dateForMonth(month) {
  const current = currentMonth();
  const now = new Date();
  if (month === current) {
    return `${month}-${String(now.getDate()).padStart(2, "0")}`;
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function byId(id) {
  return document.getElementById(id);
}

function formatPct(value) {
  if (value === null || value === undefined) return "Sem meta";
  return `${pctNumber.format(value)}%`;
}

function icmClass(value) {
  if (value === null || value === undefined) return "muted";
  return value >= 100 ? "good" : "bad";
}

function formatUpdatedAt(value) {
  if (!value) return "Atualizando...";
  const date = new Date(value);
  return `Atualizado ${date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  })}, ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function setupMonthSelect() {
  monthSelect.innerHTML = MONTHS.map((month) => (
    `<option value="${month}">${MONTH_LABELS[month]}</option>`
  )).join("");

  const params = new URLSearchParams(window.location.search);
  const month = params.get("month");
  monthSelect.value = MONTHS.includes(month) ? month : defaultMonth();
  monthSelect.addEventListener("change", load);
}

function renderSummary(summary = {}) {
  byId("salesToday").textContent = money.format(summary.salesToday || 0);
  byId("salesMonth").textContent = money.format(summary.salesMonth || 0);
  byId("receivedMonth").textContent = money.format(summary.receivedMonth || 0);
  byId("remainingMonth").textContent = money.format(summary.remainingMonth || 0);
  byId("reservationsToday").textContent = `${number.format(summary.reservationsToday || 0)} reservas hoje`;
  byId("monthHint").textContent = `${number.format(summary.reservationsMonth || 0)} reservas no mês`;
}

function renderSellers(sellers = []) {
  const ranking = byId("sellerRanking");
  if (!sellers.length) {
    ranking.innerHTML = '<div class="empty-state">Sem dados para este mês.</div>';
    return;
  }

  const rows = sellers.map((seller, index) => {
    const icmValue = seller.monthlyGoalPct;
    const icmText = formatPct(icmValue);
    const icmTone = icmClass(icmValue);
    return `
      <div class="ranking-row">
        <span class="rank">${index + 1}</span>
        <span class="seller-name">${seller.name}</span>
        <span class="metric-cell" data-label="Reservas">${number.format(seller.reservationsMonth || 0)}</span>
        <span class="metric-cell" data-label="Venda">${money.format(seller.salesMonth || 0)}</span>
        <span class="metric-cell" data-label="Meta">${money.format(seller.monthlyGoal || 0)}</span>
        <span class="metric-cell icm ${icmTone}" data-label="ICM %">${icmText}</span>
      </div>
    `;
  }).join("");

  ranking.innerHTML = `
    <div class="ranking-row ranking-head">
      <span>#</span>
      <span>Responsável</span>
      <span>Reservas</span>
      <span>Venda</span>
      <span>Meta</span>
      <span>ICM %</span>
    </div>
    ${rows}
  `;
}

async function load() {
  const month = monthSelect.value;
  const date = dateForMonth(month);
  const url = `/api/dashboard/vendedores?date=${encodeURIComponent(date)}&month=${encodeURIComponent(month)}`;
  byId("lastUpdate").textContent = "Atualizando...";

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderSummary(data.summary);
    renderSellers(data.sellers);
    byId("lastUpdate").textContent = formatUpdatedAt(data.generatedAt);
  } catch (error) {
    byId("sellerRanking").innerHTML = '<div class="empty-state error">Falha ao carregar dados dos vendedores.</div>';
    byId("lastUpdate").textContent = "Falha ao atualizar";
  }
}

setupMonthSelect();
load();
setInterval(load, 60000);
