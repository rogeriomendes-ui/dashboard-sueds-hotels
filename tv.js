const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
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
  if (value >= 100) return "gauge-green";
  if (value >= 70) return "gauge-yellow";
  return "gauge-red";
}

function gaugeValue(value) {
  return value === null || value === undefined ? "--" : percent.format(value);
}

function monthlyGauge(seller) {
  const value = gaugePct(seller.monthlyGoalPct);
  return `
    <div class="gauge ${gaugeClass(seller.monthlyGoalPct)}" aria-label="ICM do mês ${formatPct(seller.monthlyGoalPct)}">
      <svg viewBox="0 0 200 118" role="img">
        <path class="gauge-track" pathLength="150" d="M 18 100 A 82 82 0 0 1 182 100"></path>
        <path class="gauge-progress" pathLength="150" stroke-dasharray="${value} 150" d="M 18 100 A 82 82 0 0 1 182 100"></path>
      </svg>
      <div class="gauge-readout">
        <span>ICM mês</span>
        <strong>${gaugeValue(seller.monthlyGoalPct)}</strong>
      </div>
      <div class="gauge-scale"><span>0</span><span>150</span></div>
    </div>
  `;
}

function statusClass(seller) {
  if (seller.dailyStatus === "meta_batida" || seller.monthlyStatus === "meta_batida") return "meta_batida";
  if (seller.dailyStatus === "em_ritmo" || seller.monthlyStatus === "em_ritmo") return "em_ritmo";
  if (seller.dailyStatus === "sem_meta" && seller.monthlyStatus === "sem_meta") return "sem_meta";
  return "abaixo";
}

function render(data) {
  byId("lastUpdate").textContent = `Atualizado ${new Date(data.generatedAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;

  byId("sellerGrid").innerHTML = data.sellers
    .map((seller) => `
      <article class="seller-card ${statusClass(seller)}">
        <h2 class="seller-name">${seller.name}</h2>
        <div class="seller-pills">
          <span class="reservations-pill">${seller.reservationsToday} reservas hoje</span>
          <span class="reservations-pill">${seller.reservationsMonth} no mês</span>
        </div>
        ${monthlyGauge(seller)}
        <div class="goal-block">
          <div class="goal-label"><span>Meta do dia</span><strong>${formatPct(seller.dailyGoalPct)}</strong></div>
          <div class="track"><div class="fill" style="width: ${Math.min(seller.dailyGoalPct || 0, 100)}%"></div></div>
        </div>
        <div class="goal-block">
          <div class="goal-label"><span>Meta do mês</span><strong>${formatPct(seller.monthlyGoalPct)}</strong></div>
          <div class="track"><div class="fill" style="width: ${Math.min(seller.monthlyGoalPct || 0, 100)}%"></div></div>
        </div>
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
