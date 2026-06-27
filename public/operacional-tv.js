const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const MONTHS = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const MONTH_LABELS = {
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

function setupMonthSelect() {
  const select = byId("monthSelect");
  select.innerHTML = MONTHS.map((month) => `<option value="${month}">${MONTH_LABELS[month]}</option>`).join("");
  select.value = new URLSearchParams(window.location.search).get("month") || defaultMonth();
  select.addEventListener("change", load);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatScore(value) {
  return value === null || value === undefined ? "--" : `${integer.format(value)}%`;
}

function scoreColor(value) {
  if (value === null || value === undefined) return "#9aa7b4";
  if (value >= 90) return "#168a4a";
  if (value >= 75) return "#7bcf5f";
  if (value >= 60) return "#f2c94c";
  return "#ff6969";
}

function cssScore(value) {
  return Math.max(0, Math.min(Number(value || 0), 100));
}

function formatLastUpdate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function notes(items, emptyText) {
  const text = (items || []).filter(Boolean).join(" | ");
  return escapeHtml(text || emptyText);
}

function blockRow(block) {
  const score = cssScore(block.score);
  const color = scoreColor(block.score);
  return `
    <div class="block-row" style="--score:${score}; --score-color:${color}">
      <span>${escapeHtml(block.label)}</span>
      <div class="bar"><i></i></div>
      <strong>${formatScore(block.score)}</strong>
    </div>
  `;
}

function hotelCard(hotel) {
  const score = cssScore(hotel.finalScore);
  const color = scoreColor(hotel.finalScore);
  const hasData = (hotel.opinions || 0) > 0;
  return `
    <article class="hotel-card ${hasData ? "" : "hotel-card-empty"}">
      <div class="hotel-card-header">
        <div>
          <h2>${escapeHtml(hotel.hotel)}</h2>
          <small>${hasData ? `${integer.format(hotel.opinions || 0)} opiniários | ${integer.format(hotel.answeredItems || 0)} itens avaliados` : "Sem opiniários no mês"}</small>
        </div>
        <div class="score-badge" style="--score:${score}; --score-color:${color}">
          <strong>${formatScore(hotel.finalScore)}</strong>
        </div>
      </div>
      <div class="block-list">
        ${(hotel.blocks || []).map(blockRow).join("")}
      </div>
      <div class="hotel-notes">
        <div>
          <h3>Destaques</h3>
          <p>${notes(hotel.highlights, "Sem destaques")}</p>
        </div>
        <div>
          <h3>Pontos de atenção</h3>
          <p>${notes(hotel.issues, "Sem pontos críticos")}</p>
        </div>
      </div>
    </article>
  `;
}

function render(data) {
  byId("lastUpdate").textContent = `Atualizado ${formatLastUpdate(data.generatedAt)}`;
  byId("summaryScore").textContent = formatScore(data.summary?.finalScore);
  byId("summaryOpinions").textContent = integer.format(data.summary?.opinions || 0);
  byId("summaryHotels").textContent = integer.format(data.summary?.hotels || 0);
  byId("hotelGrid").innerHTML = (data.hotels || []).map(hotelCard).join("") ||
    `<article class="hotel-card"><h2>Sem avaliações no período</h2></article>`;
}

async function load() {
  const month = byId("monthSelect").value;
  const response = await fetch(`/api/operacional/tv?month=${month}`);
  if (!response.ok) throw new Error("Falha ao carregar dados operacionais");
  render(await response.json());
}

setupMonthSelect();
load().catch((error) => {
  byId("hotelGrid").innerHTML = `<article class="hotel-card"><h2>${escapeHtml(error.message)}</h2></article>`;
});
setInterval(load, 60000);
