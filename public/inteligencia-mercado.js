const state = {
  payload: null,
  filters: {
    months: [],
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
let dashboardRequestId = 0;
let currentKeywordExportRows = [];
let currentMetaAdExportRows = [];

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
  const [year, month] = String(value || currentMonth()).split("-");
  const monthName = [
    "JANEIRO",
    "FEVEREIRO",
    "MARÇO",
    "ABRIL",
    "MAIO",
    "JUNHO",
    "JULHO",
    "AGOSTO",
    "SETEMBRO",
    "OUTUBRO",
    "NOVEMBRO",
    "DEZEMBRO"
  ][Number(month) - 1] || "";
  return `${monthName} DE ${year}`.trim();
}

function normalizeMonthValues(values = []) {
  return [...new Set((values || [])
    .map((value) => String(value || "").trim())
    .filter((value) => /^\d{4}-\d{2}$/.test(value)))]
    .sort((a, b) => b.localeCompare(a));
}

function formatPct(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
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
  select.appendChild(createOption("", placeholder, selectedValue));
  values.forEach((value) => select.appendChild(createOption(value, value, selectedValue)));
}

function monthSelectionLabel(months = []) {
  const selected = normalizeMonthValues(months);
  if (selected.length === 1) return monthLabel(selected[0]);
  if (selected.length > 1) return `${selected.length} MESES SELECIONADOS`;
  return "Selecione";
}

function setMonthMultiSelect(values = []) {
  const select = document.getElementById("monthSelect");
  if (!select) return;
  const fallbackPeriods = [currentMonth(), "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01"]
    .map((month) => ({ value: month, label: monthLabel(month) }));
  const periodsByValue = new Map();
  [...fallbackPeriods, ...(values.length ? values : [])]
    .map((period) => ({
      value: typeof period === "string" ? period : period.value,
      label: typeof period === "string" ? monthLabel(period) : period.label
    }))
    .filter((period) => /^\d{4}-\d{2}$/.test(period.value))
    .forEach((period) => periodsByValue.set(period.value, period));
  const periods = [...periodsByValue.values()].sort((a, b) => b.value.localeCompare(a.value));
  const available = normalizeMonthValues(periods.map((period) => period.value));
  let selected = normalizeMonthValues(state.filters.months);
  selected = selected.filter((month) => available.includes(month));
  state.filters.months = selected;

  select.hidden = true;
  select.innerHTML = "";
  periods.forEach((period) => {
    const option = createOption(period.value, period.label, "");
    option.selected = selected.includes(period.value);
    select.appendChild(option);
  });

  let wrapper = document.getElementById("monthMultiSelect");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.id = "monthMultiSelect";
    wrapper.className = "market-multi-select";
    wrapper.innerHTML = `
      <button type="button" id="monthMultiButton" class="market-multi-button" aria-expanded="false"></button>
      <div id="monthMultiPanel" class="market-multi-panel" hidden></div>
    `;
    select.insertAdjacentElement("afterend", wrapper);
  }

  const button = document.getElementById("monthMultiButton");
  const panel = document.getElementById("monthMultiPanel");
  if (!button || !panel) return;

  button.textContent = monthSelectionLabel(selected);
  button.onclick = () => {
    const isOpen = !panel.hidden;
    panel.hidden = isOpen;
    button.setAttribute("aria-expanded", String(!isOpen));
  };

  panel.innerHTML = periods.map((period) => `
    <label class="market-multi-option">
      <input type="checkbox" value="${period.value}" ${selected.includes(period.value) ? "checked" : ""}>
      <span>${period.label}</span>
    </label>
  `).join("");
  panel.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const checked = [...panel.querySelectorAll("input[type='checkbox']:checked")].map((item) => item.value);
      state.filters.months = normalizeMonthValues(checked);
      button.textContent = monthSelectionLabel(state.filters.months);
      loadDashboard();
    });
  });
}

function updateFilters(payload) {
  const filters = payload.filters || {};
  setMonthMultiSelect(filters.periods || []);
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
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
    } else if (value) {
      params.set(key, value);
    }
  });
  return params.toString();
}

function csvValue(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(filename, headers, rows) {
  const lines = [
    headers.map(csvValue).join(";"),
    ...rows.map((row) => row.map(csvValue).join(";"))
  ];
  const blob = new Blob(["\ufeff", lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function selectedPeriodForFilename() {
  const months = normalizeMonthValues(state.filters.months);
  return months.length ? months.join("_") : "periodo";
}

function exportKeywordTable() {
  const rows = currentKeywordExportRows || [];
  if (!rows.length) return;
  downloadCsv(`google-ads-palavras-chave-${selectedPeriodForFilename()}.csv`, [
    "Palavra-chave",
    "Campanha",
    "Grupo de anúncios",
    "Investimento",
    "Cliques",
    "Vendas",
    "Conversão %",
    "Receita",
    "Custo/conv.",
    "ROAS"
  ], rows.map((row) => [
    row.keyword || row.label || "",
    row.campaign || "",
    row.adGroup || "",
    formatCurrencyDetailed.format(row.spend || 0),
    formatNumber.format(row.clicks || 0),
    formatNumber.format(row.conversions || 0),
    formatPct(row.clicks ? (Number(row.conversions || 0) / Number(row.clicks || 0)) * 100 : 0),
    formatCurrencyDetailed.format(row.revenue || 0),
    formatCurrencyDetailed.format(row.costPerSale || 0),
    `${Number(row.roas || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`
  ]));
}

function exportMetaAdTable() {
  const rows = currentMetaAdExportRows || [];
  if (!rows.length) return;
  downloadCsv(`meta-ads-anuncios-${selectedPeriodForFilename()}.csv`, [
    "Anúncio",
    "Campanha",
    "Conjunto",
    "Investimento",
    "Cliques",
    "Vendas",
    "Conversão %",
    "Receita",
    "CPC",
    "Custo/conv.",
    "ROAS"
  ], rows.map((row) => [
    row.label || "",
    row.campaign || "",
    row.adSet || "",
    formatCurrencyDetailed.format(row.spend || 0),
    formatNumber.format(row.clicks || 0),
    formatNumber.format(row.conversions || 0),
    formatPct(row.clicks ? (Number(row.conversions || 0) / Number(row.clicks || 0)) * 100 : 0),
    formatCurrencyDetailed.format(row.revenue || 0),
    formatCurrencyDetailed.format(row.costPerClick || 0),
    formatCurrencyDetailed.format(row.costPerSale || 0),
    `${Number(row.roas || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`
  ]));
}

function bindExportButtons() {
  const keywordButton = document.getElementById("exportKeywordTable");
  if (keywordButton) keywordButton.addEventListener("click", exportKeywordTable);

  const metaAdButton = document.getElementById("exportMetaAdTable");
  if (metaAdButton) metaAdButton.addEventListener("click", exportMetaAdTable);
}

document.addEventListener("click", (event) => {
  const wrapper = document.getElementById("monthMultiSelect");
  const panel = document.getElementById("monthMultiPanel");
  const button = document.getElementById("monthMultiButton");
  if (!wrapper || !panel || !button || panel.hidden) return;
  if (!wrapper.contains(event.target)) {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }
});

async function loadDashboard() {
  const requestId = ++dashboardRequestId;
  const requestQuery = queryString();
  try {
    let token = getStoredAccessToken();
    if (!token) token = askAccessToken();
    if (!token) throw new Error("Acesso aos gestores não informado");

    let response = await fetch(`/api/inteligencia/mercado?${requestQuery}`, {
      headers: { "x-dashboard-token": token }
    });

    if (response.status === 401) {
      clearAccessToken();
      token = askAccessToken();
      if (!token) throw new Error("Acesso aos gestores não autorizado");
      response = await fetch(`/api/inteligencia/mercado?${requestQuery}`, {
        headers: { "x-dashboard-token": token }
      });
    }

    if (!response.ok) throw new Error("Falha ao carregar inteligência de mercado");
    const payload = await response.json();
    if (requestId !== dashboardRequestId) return;
    state.payload = payload;
    renderDashboard(state.payload);
  } catch (error) {
    if (requestId !== dashboardRequestId) return;
    document.getElementById("kpiGrid").innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function renderDashboard(payload) {
  updateFilters(payload);
  renderKpis(payload.summary, payload.integrations);
  renderDemand(payload.demand);
  renderConversion(payload.conversion);
  renderMedia(payload.media);
  renderCompetitiveness(payload.competitiveness);
  renderOpportunities(payload.opportunities);
  const updated = new Date(payload.generatedAt);
  setText("lastUpdate", `Atualizado ${updated.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${updated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
}

function renderKpis(summary, integrations = {}) {
  const hasDemandData = Boolean(integrations.asksuite?.configured);
  const demandValue = (value) => (hasDemandData ? value : "");
  const cards = [
    ["Diálogos totais", demandValue(formatNumber.format(summary.dialogues)), "Volume bruto de demanda"],
    ["Reservas", demandValue(formatNumber.format(summary.reservations)), "Pré-vendas geradas"],
    ["Vendas", demandValue(formatNumber.format(summary.sales)), "Reservas vendidas"],
    ["Receita", demandValue(formatCurrency.format(summary.revenue)), "Receita confirmada"],
    ["Conversão diálogo → venda", demandValue(formatPct(summary.dialogueToSaleConversion)), "Eficiência comercial"],
    ["Investimento em mídia", formatCurrency.format(summary.mediaSpend), "Google + Meta"],
    ["Custo por venda", demandValue(formatCurrency.format(summary.costPerSale)), "Investimento / venda"],
    ["ROAS", demandValue(`${summary.roas.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`), "Receita / mídia"]
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
  renderConversionTable("hotelConversionTable", conversion.byHotel, 6);
  renderConversionTable("channelConversionTable", conversion.byChannel, 6);
  renderConversionTable("stateDddConversionTable", conversion.byStateDdd, 20);
}

function renderConversionTable(id, rows, maxRows = 8) {
  const items = (rows || []).slice(0, maxRows);
  const body = document.getElementById(id);
  if (!body) return;
  const wrap = body.closest(".table-wrap");
  if (id === "stateDddConversionTable" && wrap) {
    wrap.classList.add("state-ddd-table-wrap");
    wrap.style.maxHeight = "286px";
    wrap.style.overflowY = "scroll";
  }
  body.innerHTML = items.length ? items.map((row) => `
    <tr>
      <td title="${row.label}">${row.label}</td>
      <td>${formatNumber.format(row.dialogues || 0)}</td>
      <td>${formatNumber.format(row.reservations || 0)}</td>
      <td>${formatNumber.format(row.sales || 0)}</td>
      <td>${formatCurrency.format(row.revenue || 0)}</td>
      <td>${formatPct(row.conversion || 0)}</td>
      <td>${formatCurrency.format(row.ticketAverage || 0)}</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="7">Sem dados para este filtro.</td>
    </tr>
  `;
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
  const cityRevenue = cityRows.reduce((total, row) => total + Number(row.revenue || 0), 0);
  const cityCards = [
    ["Investimento", formatCurrency.format(citySpend)],
    ["Cliques", formatNumber.format(cityClicks)],
    ["Conversões", formatNumber.format(cityConversions)],
    ["Valor conv.", formatCurrency.format(cityRevenue)],
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
      <td>${formatPct(row.clicks ? (Number(row.conversions || 0) / Number(row.clicks || 0)) * 100 : 0)}</td>
      <td>${formatCurrency.format(row.revenue || 0)}</td>
      <td>${formatCurrencyDetailed.format(row.costPerClick || 0)}</td>
      <td>${formatCurrencyDetailed.format(row.costPerSale || 0)}</td>
      <td>${Number(row.roas || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="9">Sem dados de localização física por cidade para este período. Cidades apenas de interesse foram ignoradas nesta leitura.</td>
    </tr>
  `;

  const metaAdRows = media.byMetaAd && media.byMetaAd.length ? media.byMetaAd : [];
  currentMetaAdExportRows = metaAdRows;
  const exportMetaAdButton = document.getElementById("exportMetaAdTable");
  if (exportMetaAdButton) exportMetaAdButton.disabled = !metaAdRows.length;
  const metaAdSpend = metaAdRows.reduce((total, row) => total + Number(row.spend || 0), 0);
  const metaAdClicks = metaAdRows.reduce((total, row) => total + Number(row.clicks || 0), 0);
  const metaAdConversions = metaAdRows.reduce((total, row) => total + Number(row.conversions || 0), 0);
  const metaAdRevenue = metaAdRows.reduce((total, row) => total + Number(row.revenue || 0), 0);
  const metaAdCards = [
    ["Investimento", formatCurrency.format(metaAdSpend)],
    ["Cliques", formatNumber.format(metaAdClicks)],
    ["Conversões", formatNumber.format(metaAdConversions)],
    ["Valor conv.", formatCurrency.format(metaAdRevenue)],
    ["CPC médio", formatCurrencyDetailed.format(metaAdClicks ? metaAdSpend / metaAdClicks : 0)],
    ["Custo/conv.", formatCurrencyDetailed.format(metaAdConversions ? metaAdSpend / metaAdConversions : 0)]
  ];
  const metaAdMediaCards = document.getElementById("metaAdMediaCards");
  if (metaAdMediaCards) {
    metaAdMediaCards.innerHTML = metaAdCards.map(([label, value]) => `
      <div class="mini-kpi">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");
  }
  const metaAdTable = document.getElementById("metaAdTable");
  if (metaAdTable) {
    metaAdTable.innerHTML = metaAdRows.length ? metaAdRows.map((row) => `
      <tr>
        <td title="${row.campaign || ""} | ${row.adSet || ""}">${row.label}</td>
        <td>${formatCurrency.format(row.spend || 0)}</td>
        <td>${formatNumber.format(row.clicks || 0)}</td>
        <td>${formatNumber.format(row.conversions || 0)}</td>
        <td>${formatPct(row.clicks ? (Number(row.conversions || 0) / Number(row.clicks || 0)) * 100 : 0)}</td>
        <td>${formatCurrency.format(row.revenue || 0)}</td>
        <td>${formatCurrencyDetailed.format(row.costPerClick || 0)}</td>
        <td>${formatCurrencyDetailed.format(row.costPerSale || 0)}</td>
        <td>${Number(row.roas || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</td>
      </tr>
    `).join("") : `
      <tr>
        <td colspan="9">Sem dados por anúncio da Meta para este período.</td>
      </tr>
    `;
  }

  const metaCards = [
    ["Investimento", formatCurrency.format(media.metaSpend || 0)],
    ["Cliques", media.metaConnected ? formatNumber.format(media.metaClicks || 0) : "--"],
    ["Conversões", media.metaConnected ? formatNumber.format(media.metaConversions || 0) : "--"],
    ["Valor conv.", media.metaConnected ? formatCurrency.format(media.metaConversionValue || 0) : "--"],
    ["CPC médio", media.metaConnected ? formatCurrencyDetailed.format(media.metaCostPerClick || 0) : "--"],
    ["Custo/conv.", media.metaConnected ? formatCurrencyDetailed.format(media.metaCostPerConversion || 0) : "--"]
  ];
  document.getElementById("metaMediaCards").innerHTML = metaCards.map(([label, value]) => `
    <div class="mini-kpi">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
  const metaStatus = document.getElementById("metaMediaStatus");
  if (metaStatus) {
    metaStatus.textContent = media.metaConnected
      ? "Meta Ads conectado."
      : (media.metaError || "Meta Ads ainda não conectado. Este bloco está preparado para receber os dados da API da Meta.");
    metaStatus.hidden = Boolean(media.metaConnected && (media.byMetaCampaign || []).length);
  }
  const metaCampaignRows = media.byMetaCampaign && media.byMetaCampaign.length ? media.byMetaCampaign : [];
  const metaCampaignTable = document.getElementById("metaCampaignTable");
  if (metaCampaignTable) {
    metaCampaignTable.innerHTML = metaCampaignRows.length ? metaCampaignRows.map((row) => `
      <tr>
        <td>${row.label}</td>
        <td>${formatCurrency.format(row.spend || 0)}</td>
        <td>${formatNumber.format(row.clicks || 0)}</td>
        <td>${formatNumber.format(row.conversions || 0)}</td>
        <td>${formatPct(row.clicks ? (Number(row.conversions || 0) / Number(row.clicks || 0)) * 100 : 0)}</td>
        <td>${formatCurrency.format(row.revenue || 0)}</td>
        <td>${formatCurrencyDetailed.format(row.costPerSale || 0)}</td>
        <td>${Number(row.roas || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</td>
      </tr>
    `).join("") : `
      <tr>
        <td colspan="8">Sem campanhas da Meta para este período.</td>
      </tr>
    `;
  }

  const keywordRows = media.byKeyword && media.byKeyword.length ? media.byKeyword : [];
  currentKeywordExportRows = keywordRows;
  const exportButton = document.getElementById("exportKeywordTable");
  if (exportButton) exportButton.disabled = !keywordRows.length;
  document.getElementById("keywordTable").innerHTML = keywordRows.length ? keywordRows.map((row) => `
    <tr>
      <td title="${row.campaign} | ${row.adGroup}">${row.keyword || row.label}</td>
      <td>${formatCurrency.format(row.spend)}</td>
      <td>${formatNumber.format(row.clicks || 0)}</td>
      <td>${formatNumber.format(row.conversions || 0)}</td>
      <td>${formatPct(row.clicks ? (Number(row.conversions || 0) / Number(row.clicks || 0)) * 100 : 0)}</td>
      <td>${formatCurrency.format(row.revenue)}</td>
      <td>${formatCurrencyDetailed.format(row.costPerSale)}</td>
      <td>${row.roas.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="8">Sem dados de palavras-chave para este período. Algumas campanhas podem não usar palavras-chave tradicionais.</td>
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

bindExportButtons();
bindFilters();
loadDashboard();
