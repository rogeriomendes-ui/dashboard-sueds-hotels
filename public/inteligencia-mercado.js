const state = {
  payload: null,
  filters: {
    month: currentMonth(),
    hotel: "",
    state: "",
    ddd: "",
    channel: "",
    campaign: "",
    origin: "",
    device: ""
  }
};

const GESTORES_TOKEN_STORAGE_KEY = "sueds_gestores_access_token";

const formatCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});

const formatCurrencyDetailed = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2
});

const formatNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value) {
  if (value === "ytd") return "ESTE ANO";
  const [year, month] = String(value || currentMonth()).split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).toUpperCase();
}

function formatPct(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
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

function createOption(value, label, selectedValue) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.selected = value === selectedValue;
  return option;
}

function setSelect(id, values, placeholder, selectedValue) {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = "";
  if (id === "monthSelect") {
    const months = ["ytd", currentMonth(), "2026-07", "2026-06", "2026-05"];
    [...new Set(months)].forEach((month) => select.appendChild(createOption(month, monthLabel(month), selectedValue)));
  } else {
    select.appendChild(createOption("", placeholder, selectedValue));
    values.forEach((value) => select.appendChild(createOption(value, value, selectedValue)));
  }
}

function updateFilters(payload) {
  const filters = payload.filters || {};
  setSelect("monthSelect", [], "Mês", state.filters.month);
  setSelect("hotelSelect", filters.hotels || [], "Todos os hotéis", state.filters.hotel);
  setSelect("stateSelect", filters.states || [], "Todos os estados", state.filters.state);
  setSelect("dddSelect", filters.ddds || [], "Todos os DDDs", state.filters.ddd);
  setSelect("channelSelect", filters.channels || [], "Todos os canais", state.filters.channel);
  setSelect("campaignSelect", filters.campaigns || [], "Todas as campanhas", state.filters.campaign);
  setSelect("originSelect", filters.origins || [], "Todas as origens", state.filters.origin);
  setSelect("deviceSelect", filters.devices || [], "Todos os dispositivos", state.filters.device);
}

function bindFilters() {
  [
    ["monthSelect", "month"],
    ["hotelSelect", "hotel"],
    ["stateSelect", "state"],
    ["dddSelect", "ddd"],
    ["channelSelect", "channel"],
    ["campaignSelect", "campaign"],
    ["originSelect", "origin"],
    ["deviceSelect", "device"]
  ].forEach(([id, key]) => {
    const select = document.getElementById(id);
    if (!select) return;
    select.addEventListener("change", () => {
      state.filters[key] = select.value;
      loadDashboard();
    });
  });
}

function queryString() {
  const params = new URLSearchParams();
  Object.entries(state.filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

async function loadDashboard() {
  try {
    let token = getStoredAccessToken();
    if (!token) token = askAccessToken();
    if (!token) throw new Error("Acesso aos gestores não informado");

    let response = await fetch(`/api/inteligencia/mercado?${queryString()}`, {
      headers: { "x-dashboard-token": token }
    });

    if (response.status === 401) {
      clearAccessToken();
      token = askAccessToken();
      if (!token) throw new Error("Acesso aos gestores não autorizado");
      response = await fetch(`/api/inteligencia/mercado?${queryString()}`, {
        headers: { "x-dashboard-token": token }
      });
    }

    if (!response.ok) throw new Error("Falha ao carregar inteligência de mercado");
    state.payload = await response.json();
    renderDashboard(state.payload);
  } catch (error) {
    document.getElementById("kpiGrid").innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function renderDashboard(payload) {
  updateFilters(payload);
  renderKpis(payload.summary);
  renderDemand(payload.demand);
  renderConversion(payload.conversion);
  renderMedia(payload.media);
  renderCompetitiveness(payload.competitiveness);
  renderOpportunities(payload.opportunities);
  const updated = new Date(payload.generatedAt);
  setText("lastUpdate", `Atualizado ${updated.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${updated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
}

function renderKpis(summary) {
  const cards = [
    ["Diálogos totais", formatNumber.format(summary.dialogues), "Volume bruto de demanda"],
    ["Reservas", formatNumber.format(summary.reservations), "Pré-vendas geradas"],
    ["Vendas", formatNumber.format(summary.sales), "Reservas vendidas"],
    ["Receita", formatCurrency.format(summary.revenue), "Receita confirmada"],
    ["Conversão diálogo → venda", formatPct(summary.dialogueToSaleConversion), "Eficiência comercial"],
    ["Investimento em mídia", formatCurrency.format(summary.mediaSpend), "Google + Meta"],
    ["Custo por venda", formatCurrencyDetailed.format(summary.costPerSale), "Investimento / venda"],
    ["ROAS", `${summary.roas.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`, "Receita / mídia"]
  ];
  document.getElementById("kpiGrid").innerHTML = cards
    .map(([label, value, detail], index) => `
      <article class="kpi-card ${index === 4 || index === 7 ? "accent" : ""}">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${detail}</small>
      </article>
    `)
    .join("");
}

function renderBars(id, rows, valueKey, suffix = "", maxRows = 8) {
  const list = document.getElementById(id);
  const items = (rows || []).slice(0, maxRows);
  const max = Math.max(...items.map((row) => Number(row[valueKey] || 0)), 1);
  list.innerHTML = items.length
    ? items.map((row) => `
      <div class="bar-row">
        <span class="bar-label" title="${row.label}">${row.label}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (Number(row[valueKey] || 0) / max) * 100)}%"></span></span>
        <strong class="bar-value">${valueKey === "conversion" ? formatPct(row[valueKey]) : formatNumber.format(row[valueKey])}${suffix}</strong>
      </div>
    `).join("")
    : `<div class="empty-state">Sem dados para este filtro.</div>`;
}

function renderDemand(demand) {
  renderBars("stateChart", demand.byState, "dialogues");
  renderBars("dddChart", demand.byDdd, "dialogues");
  document.getElementById("stateTable").innerHTML = demand.stateTable.map((row) => `
    <tr>
      <td>${row.state}</td>
      <td>${formatNumber.format(row.dialogues)}</td>
      <td>${formatNumber.format(row.reservations)}</td>
      <td>${formatNumber.format(row.sales)}</td>
      <td>${formatCurrency.format(row.revenue)}</td>
      <td>${formatPct(row.conversion)}</td>
      <td>${formatCurrency.format(row.ticketAverage)}</td>
    </tr>
  `).join("");
}

function renderConversion(conversion) {
  const max = Math.max(...conversion.funnel.map((step) => step.value), 1);
  document.getElementById("funnel").innerHTML = conversion.funnel.map((step) => `
    <div class="funnel-step">
      <span>${step.label}</span>
      <strong>${formatNumber.format(step.value)}</strong>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(5, (step.value / max) * 100)}%"></div></div>
    </div>
  `).join("");
  renderBars("hotelConversion", conversion.byHotel, "conversion", "", 6);
  renderBars("channelConversion", conversion.byChannel, "conversion", "", 6);
  renderRanking("stateDddConversion", conversion.byStateDdd.slice(0, 6), "conversion", true);
}

function renderMedia(media) {
  const googleCards = [
    ["Investimento", formatCurrency.format(media.googleSpend || 0)],
    ["Cliques", formatNumber.format(media.googleClicks || 0)],
    ["Conversões", formatNumber.format(media.googleConversions || 0)],
    ["Valor conv.", formatCurrency.format(media.googleConversionValue || 0)],
    ["CPC médio", formatCurrencyDetailed.format(media.costPerClick || 0)],
    ["Custo/conv.", formatCurrencyDetailed.format(media.googleConversions ? (media.googleSpend || 0) / media.googleConversions : 0)]
  ];
  document.getElementById("googleMediaCards").innerHTML = googleCards.map(([label, value]) => `
    <div class="mini-kpi">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");

  const cityRows = media.byCity && media.byCity.length ? media.byCity : [];
  const citySpend = cityRows.reduce((total, row) => total + Number(row.spend || 0), 0);
  const cityClicks = cityRows.reduce((total, row) => total + Number(row.clicks || 0), 0);
  const cityConversions = cityRows.reduce((total, row) => total + Number(row.conversions || 0), 0);
  const cityCards = [
    ["Cidades", formatNumber.format(cityRows.length)],
    ["Investimento", formatCurrency.format(citySpend)],
    ["Cliques", formatNumber.format(cityClicks)],
    ["Conversões", formatNumber.format(cityConversions)],
    ["CPC médio", formatCurrencyDetailed.format(cityClicks ? citySpend / cityClicks : 0)],
    ["Custo/conv.", formatCurrencyDetailed.format(cityConversions ? citySpend / cityConversions : 0)]
  ];
  document.getElementById("cityMediaCards").innerHTML = cityCards.map(([label, value]) => `
    <div class="mini-kpi">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
  document.getElementById("cityTable").innerHTML = cityRows.length ? cityRows.map((row) => `
    <tr>
      <td>${row.city || row.label}</td>
      <td>${formatCurrency.format(row.spend || 0)}</td>
      <td>${formatNumber.format(row.clicks || 0)}</td>
      <td>${formatNumber.format(row.conversions || 0)}</td>
      <td>${formatCurrency.format(row.revenue || 0)}</td>
      <td>${formatCurrencyDetailed.format(row.costPerClick || 0)}</td>
      <td>${formatCurrencyDetailed.format(row.costPerSale || 0)}</td>
      <td>${Number(row.roas || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="8">Sem dados de localização física por cidade para este período. Cidades apenas de interesse foram ignoradas nesta leitura.</td>
    </tr>
  `;

  const metaCards = [
    ["Investimento", formatCurrency.format(media.metaSpend || 0)],
    ["Cliques", "--"],
    ["Conversões", "--"],
    ["Valor conv.", "--"],
    ["CPC médio", "--"],
    ["Custo/conv.", "--"]
  ];
  document.getElementById("metaMediaCards").innerHTML = metaCards.map(([label, value]) => `
    <div class="mini-kpi">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
  document.getElementById("metaMediaStatus").textContent = media.metaConnected
    ? "Meta Ads conectado."
    : "Meta Ads ainda não conectado. Este bloco está preparado para receber os dados da API da Meta.";

  const keywordRows = media.byKeyword && media.byKeyword.length ? media.byKeyword : [];
  document.getElementById("keywordTable").innerHTML = keywordRows.length ? keywordRows.map((row) => `
    <tr>
      <td title="${row.campaign} | ${row.adGroup}">${row.keyword || row.label}</td>
      <td>${formatCurrency.format(row.spend)}</td>
      <td>${formatNumber.format(row.clicks || 0)}</td>
      <td>${formatNumber.format(row.conversions || 0)}</td>
      <td>${formatCurrency.format(row.revenue)}</td>
      <td>${formatCurrencyDetailed.format(row.costPerSale)}</td>
      <td>${row.roas.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="7">Sem dados de palavras-chave para este período. Algumas campanhas podem não usar palavras-chave tradicionais.</td>
    </tr>
  `;
}

function renderCompetitiveness(competitiveness) {
  document.getElementById("competitivenessTable").innerHTML = competitiveness.rows.map((row) => `
    <tr>
      <td>${row.hotel}</td>
      <td>${formatCurrency.format(row.suedsPrice)}</td>
      <td>${formatCurrency.format(row.competitorAvg)}</td>
      <td>${Math.round(row.diffPct)}%</td>
      <td>${row.rank}º</td>
      <td>${row.demand}</td>
    </tr>
  `).join("");
  document.getElementById("marketAlerts").innerHTML = competitiveness.alerts.map((alert) => `
    <div class="market-alert">
      <strong>${alert.hotel}: ${alert.message}</strong>
      <span>${alert.suggestion}</span>
    </div>
  `).join("");
}

function renderRanking(id, rows, valueKey = "opportunityIndex", isPercent = false) {
  const element = document.getElementById(id);
  element.innerHTML = rows.length
    ? rows.slice(0, 6).map((row, index) => `
      <div class="ranking-row">
        <span class="rank-badge">${index + 1}</span>
        <span class="ranking-label" title="${row.label}">${row.label}</span>
        <strong class="ranking-value">${isPercent ? formatPct(row[valueKey]) : formatNumber.format(row[valueKey])}</strong>
      </div>
    `).join("")
    : `<div class="empty-state">Sem dados.</div>`;
}

function renderOpportunities(opportunities) {
  renderRanking("oppState", opportunities.byState);
  renderRanking("oppDdd", opportunities.byDdd);
  renderRanking("oppChannel", opportunities.byChannel);
  renderRanking("oppHotel", opportunities.byHotel);
  renderRanking("oppCampaign", opportunities.byCampaign);
}

bindFilters();
loadDashboard();
