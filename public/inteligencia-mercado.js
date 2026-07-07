const state = {
  payload: null,
  funnelSource: "geral",
  filters: {
    months: [],
    date: "",
    hotel: "",
    state: "",
    ddd: "",
    channel: "",
    campaign: "",
    checkinMonth: ""
  }
};

const GESTORES_TOKEN_STORAGE_KEY = "sueds_gestores_access_token";
let dashboardRequestId = 0;
let currentKeywordExportRows = [];
let currentMetaAdExportRows = [];

const COMMERCIAL_FUNNEL_STAGES = [
  { key: "visitors", label: "Visitantes do site", detail: "GA4", color: "#1677b8" },
  { key: "viewContent", label: "Visualizações de hotel", detail: "ViewContent", color: "#1d8fd1" },
  { key: "search", label: "Pesquisa de disponibilidade", detail: "Search", color: "#22a7df" },
  { key: "initiateCheckout", label: "Início da reserva", detail: "InitiateCheckout", color: "#f1c84b" },
  { key: "addPaymentInfo", label: "Informações de pagamento", detail: "AddPaymentInfo", color: "#ff9f1a" },
  { key: "purchase", label: "Reserva confirmada", detail: "Purchase", color: "#169755" }
];

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

state.filters.months = [currentMonth()];

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
  values.forEach((item) => {
    const value = typeof item === "string" ? item : item.value;
    const label = typeof item === "string" ? item : item.label;
    select.appendChild(createOption(value, label, selectedValue));
  });
}

function formatDateBr(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function parseDateBr(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!br) return "";
  const day = String(Number(br[1])).padStart(2, "0");
  const month = String(Number(br[2])).padStart(2, "0");
  const year = br[3];
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (date.getFullYear() !== Number(year) || date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day)) {
    return "";
  }
  return `${year}-${month}-${day}`;
}

function maskDateBr(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function setDateInput() {
  const input = document.getElementById("dateSelect");
  const picker = document.getElementById("datePicker");
  if (input) input.value = formatDateBr(state.filters.date);
  if (picker) picker.value = state.filters.date || "";
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
  const selected = filters.selected || {};
  if (!state.filters.checkinMonth && selected.checkinMonth) {
    state.filters.checkinMonth = selected.checkinMonth;
  }
  setMonthMultiSelect(filters.periods || []);
  setDateInput();
  setSelect("hotelSelect", filters.hotels || [], "Todos os hotéis", state.filters.hotel);
  setSelect("checkinMonthSelect", filters.checkinMonths || [], "Próximo mês", state.filters.checkinMonth);
  setSelect("stateSelect", filters.states || [], "Todos os estados", state.filters.state);
  setSelect("dddSelect", filters.ddds || [], "Todos os DDDs", state.filters.ddd);
  setSelect("channelSelect", filters.channels || [], "Todos os canais", state.filters.channel);
}

function bindFilters() {
  const dateInput = document.getElementById("dateSelect");
  const datePicker = document.getElementById("datePicker");
  const datePickerButton = document.getElementById("datePickerButton");
  if (dateInput) {
    dateInput.addEventListener("input", () => {
      dateInput.value = maskDateBr(dateInput.value);
    });
    dateInput.addEventListener("change", () => {
      state.filters.date = parseDateBr(dateInput.value);
      dateInput.value = formatDateBr(state.filters.date);
      if (datePicker) datePicker.value = state.filters.date || "";
      loadDashboard();
    });
  }
  if (datePicker) {
    datePicker.addEventListener("change", () => {
      state.filters.date = datePicker.value || "";
      setDateInput();
      loadDashboard();
    });
  }
  if (datePickerButton && datePicker) {
    datePickerButton.addEventListener("click", () => {
      datePicker.value = state.filters.date || "";
      if (typeof datePicker.showPicker === "function") {
        datePicker.showPicker();
      } else {
        datePicker.focus();
        datePicker.click();
      }
    });
  }

  [
    ["hotelSelect", "hotel"],
    ["checkinMonthSelect", "checkinMonth"],
    ["stateSelect", "state"],
    ["dddSelect", "ddd"],
    ["channelSelect", "channel"]
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
  if (state.filters.date) return state.filters.date;
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
    "CPC",
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
    formatCurrencyDetailed.format(row.costPerClick || 0),
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
  renderCommercialFunnel(payload);
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
  const conversionRate = (conversions, clicks) => formatPct(clicks ? (Number(conversions || 0) / Number(clicks || 0)) * 100 : 0);
  const roasText = (revenue, spend) => `${(spend ? Number(revenue || 0) / Number(spend || 0) : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })}x`;

  const googleCards = [
    ["Investimento", formatCurrency.format(media.googleSpend || 0)],
    ["Cliques", formatNumber.format(media.googleClicks || 0)],
    ["Conversões", formatNumber.format(media.googleConversions || 0)],
    ["Valor conv.", formatCurrency.format(media.googleConversionValue || 0)],
    ["CPC médio", formatCurrencyDetailed.format(media.costPerClick || 0)],
    ["Custo/conv.", formatCurrencyDetailed.format(media.googleConversions ? (media.googleSpend || 0) / media.googleConversions : 0)],
    ["Tx. conversão", conversionRate(media.googleConversions, media.googleClicks)],
    ["ROAS", roasText(media.googleConversionValue, media.googleSpend)]
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
    ["Custo/conv.", formatCurrencyDetailed.format(cityConversions ? citySpend / cityConversions : 0)],
    ["Tx. conversão", conversionRate(cityConversions, cityClicks)],
    ["ROAS", roasText(cityRevenue, citySpend)]
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
    ["Custo/conv.", formatCurrencyDetailed.format(metaAdConversions ? metaAdSpend / metaAdConversions : 0)],
    ["Tx. conversão", conversionRate(metaAdConversions, metaAdClicks)],
    ["ROAS", roasText(metaAdRevenue, metaAdSpend)]
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
    ["Custo/conv.", media.metaConnected ? formatCurrencyDetailed.format(media.metaCostPerConversion || 0) : "--"],
    ["Tx. conversão", media.metaConnected ? conversionRate(media.metaConversions, media.metaClicks) : "--"],
    ["ROAS", media.metaConnected ? roasText(media.metaConversionValue, media.metaSpend) : "--"]
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

  const metaOriginRows = media.byMetaOrigin || [];
  const metaOriginSpend = metaOriginRows.reduce((total, row) => total + Number(row.spend || 0), 0);
  const metaOriginClicks = metaOriginRows.reduce((total, row) => total + Number(row.clicks || 0), 0);
  const metaOriginConversionsFromRows = metaOriginRows.reduce((total, row) => total + Number(row.conversions || row.sales || 0), 0);
  const metaOriginRevenueFromRows = metaOriginRows.reduce((total, row) => total + Number(row.revenue || row.conversionValue || 0), 0);
  const metaTotalConversions = Number(media.metaConversions || 0);
  const metaTotalRevenue = Number(media.metaConversionValue || 0);
  const metaUnattributedConversions = Math.max(0, metaTotalConversions - metaOriginConversionsFromRows);
  const metaUnattributedRevenue = Math.max(0, metaTotalRevenue - metaOriginRevenueFromRows);
  const metaOriginConversions = metaOriginConversionsFromRows || metaTotalConversions;
  const metaOriginRevenue = metaOriginRevenueFromRows || metaTotalRevenue;
  const metaOriginCards = [
    ["Investimento", formatCurrency.format(metaOriginSpend)],
    ["Cliques", formatNumber.format(metaOriginClicks)],
    ["Conversões", formatNumber.format(metaOriginConversions)],
    ["Valor conv.", formatCurrency.format(metaOriginRevenue)],
    ["CPC médio", formatCurrencyDetailed.format(metaOriginClicks ? metaOriginSpend / metaOriginClicks : 0)],
    ["Custo/conv.", formatCurrencyDetailed.format(metaOriginConversions ? metaOriginSpend / metaOriginConversions : 0)],
    ["Tx. conversão", conversionRate(metaOriginConversions, metaOriginClicks)],
    ["ROAS", roasText(metaOriginRevenue, metaOriginSpend)]
  ];
  const metaOriginMediaCards = document.getElementById("metaOriginMediaCards");
  if (metaOriginMediaCards) {
    metaOriginMediaCards.innerHTML = metaOriginCards.map(([label, value]) => `
      <div class="mini-kpi">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");
  }
  const metaOriginTable = document.getElementById("metaOriginTable");
  if (metaOriginTable) {
    const metaOriginRowsHtml = metaOriginRows.map((row) => {
      const clicks = Number(row.clicks || 0);
      const conversions = Number(row.conversions || row.sales || 0);
      const spend = Number(row.spend || 0);
      const revenue = Number(row.revenue || row.conversionValue || 0);
      return `
        <tr>
          <td>${row.label || row.region || row.country || "Não informado"}</td>
          <td>${formatCurrency.format(spend)}</td>
          <td>${formatNumber.format(clicks)}</td>
          <td>${formatNumber.format(conversions)}</td>
          <td>${conversionRate(conversions, clicks)}</td>
          <td>${formatCurrency.format(revenue)}</td>
          <td>${formatCurrencyDetailed.format(row.costPerClick || (clicks ? spend / clicks : 0))}</td>
          <td>${formatCurrencyDetailed.format(row.costPerSale || row.costPerConversion || (conversions ? spend / conversions : 0))}</td>
          <td>${roasText(revenue, spend)}</td>
        </tr>
      `;
    }).join("");
    const metaUnattributedHtml = metaUnattributedConversions > 0 ? `
        <tr class="attribution-note-row">
          <td>Conversões sem origem atribuída</td>
          <td>--</td>
          <td>--</td>
          <td>${formatNumber.format(metaUnattributedConversions)}</td>
          <td>--</td>
          <td>${formatCurrency.format(metaUnattributedRevenue)}</td>
          <td>--</td>
          <td>--</td>
          <td>--</td>
        </tr>
      ` : "";
    metaOriginTable.innerHTML = (metaOriginRowsHtml || metaUnattributedHtml)
      ? `${metaOriginRowsHtml}${metaUnattributedHtml}`
      : `<tr><td colspan="9">Sem dados de origem dos cliques da Meta para este filtro.</td></tr>`;
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
      <td>${formatCurrencyDetailed.format(row.costPerClick || 0)}</td>
      <td>${formatCurrencyDetailed.format(row.costPerSale)}</td>
      <td>${row.roas.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="9">Sem dados de palavras-chave para este período. Algumas campanhas podem não usar palavras-chave tradicionais.</td>
    </tr>
  `;
}

function renderCompetitiveness(competitiveness) {
  const rows = competitiveness?.rows || [];
  const currencyOrEmpty = (value) => Number.isFinite(Number(value)) && Number(value) > 0
    ? formatCurrencyDetailed.format(Number(value))
    : "--";
  const competitorListHtml = (competitors = []) => {
    const items = (competitors || [])
      .filter((item) => item?.name && Number(item.averagePrice || item.bestPrice || 0) > 0)
      .slice(0, 8);
    if (!items.length) return "";
    return `
      <ul class="market-competitors">
        ${items.map((item) => `
          <li>
            <span title="${item.name}">${item.name}</span>
            <strong>${formatCurrencyDetailed.format(Number(item.averagePrice || item.bestPrice || 0))}</strong>
          </li>
        `).join("")}
      </ul>
    `;
  };
  document.getElementById("competitivenessTable").innerHTML = rows.length ? rows.map((row) => `
    <tr>
      <td>${row.hotel}</td>
      <td>${currencyOrEmpty(row.suedsPrice)}</td>
      <td>${currencyOrEmpty(row.competitorAvg)}</td>
      <td>${Number.isFinite(Number(row.diffPct)) ? `${Math.round(Number(row.diffPct))}%` : "--"}</td>
      <td>${row.rank ? `${row.rank}º` : "--"}</td>
      <td>${row.demand || "--"}</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="6">${competitiveness?.message || "Sem dados do Vetor Trade para este mês de check-in."}</td>
    </tr>
  `;
  document.getElementById("marketAlerts").innerHTML = (competitiveness?.alerts || []).map((alert) => `
    <div class="market-alert">
      <strong>${alert.hotel}: ${alert.message}</strong>
      <span>${alert.suggestion}</span>
      ${competitorListHtml(alert.competitors)}
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
  const element = document.getElementById("investmentSuggestions");
  if (!element) return;
  const suggestions = opportunities?.suggestions || [];
  const metricHtml = (metric = "") => {
    if (!metric) return "";
    const parts = String(metric).split(/\s+\|\s+(?=\d+\.\s)/);
    return parts.length > 1
      ? `<strong>${parts.map((part) => `<span>${part}</span>`).join("")}</strong>`
      : `<strong>${metric}</strong>`;
  };
  element.innerHTML = suggestions.length ? suggestions.map((item, index) => `
    <article class="investment-suggestion">
      <div class="suggestion-rank">${index + 1}</div>
      <div>
        <span class="suggestion-type">${item.type || "Sugestão"}</span>
        <h3>${item.title}</h3>
        <p>${item.action}</p>
        <div class="suggestion-meta">
          ${metricHtml(item.metric)}
          <small>${item.basis || ""}</small>
        </div>
      </div>
    </article>
  `).join("") : `
    <div class="empty-state">
      Sem sugestões para este filtro. Selecione um período com dados de Asksuites, Google Ads ou Meta Ads.
    </div>
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

function numberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const numeric = numberOrNull(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function sumKnown(...values) {
  const known = values.map(numberOrNull).filter((value) => value !== null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

function valueText(value, formatter = formatNumber.format.bind(formatNumber)) {
  const numeric = numberOrNull(value);
  return numeric === null ? "--" : formatter(numeric);
}

function formatFunnelPct(value) {
  const numeric = numberOrNull(value);
  return numeric === null ? "--" : formatPct(numeric);
}

function getConversionToNext(values, index) {
  const current = numberOrNull(values[COMMERCIAL_FUNNEL_STAGES[index].key]);
  if (current === null || current <= 0) return { conversion: null, loss: null };
  const nextStage = COMMERCIAL_FUNNEL_STAGES
    .slice(index + 1)
    .map((stage) => numberOrNull(values[stage.key]))
    .find((value) => value !== null);
  if (nextStage === undefined || nextStage === null) return { conversion: null, loss: null };
  const conversion = Math.min(100, (nextStage / current) * 100);
  return { conversion, loss: Math.max(0, 100 - conversion) };
}

function buildCommercialFunnels(payload = {}) {
  const summary = payload.summary || {};
  const media = payload.media || {};
  const conversion = payload.conversion || {};
  const analytics = payload.analytics || {};
  const ga4 = payload.ga4 || analytics.ga4 || {};
  const site = analytics.site || ga4.site || {};
  const organic = analytics.organic || ga4.organic || {};

  const asksuiteValues = {
    visitors: firstNumber(summary.dialogues),
    viewContent: null,
    search: firstNumber(summary.reservations),
    initiateCheckout: null,
    addPaymentInfo: null,
    purchase: firstNumber(summary.sales)
  };

  const googleValues = {
    visitors: firstNumber(media.googleVisitors, media.googleClicks),
    viewContent: firstNumber(media.googleViewContent, media.googleViewContentEvents, media.googleHotelViews),
    search: firstNumber(media.googleSearch, media.googleSearchEvents, media.googleAvailabilitySearches),
    initiateCheckout: firstNumber(media.googleInitiateCheckout, media.googleCheckoutStarts),
    addPaymentInfo: firstNumber(media.googleAddPaymentInfo, media.googlePaymentInfo),
    purchase: firstNumber(media.googleConversions)
  };

  const metaValues = {
    visitors: firstNumber(media.metaVisitors, media.metaClicks),
    viewContent: firstNumber(media.metaViewContent, media.metaViewContentEvents, media.metaHotelViews),
    search: firstNumber(media.metaSearch, media.metaSearchEvents, media.metaAvailabilitySearches),
    initiateCheckout: firstNumber(media.metaInitiateCheckout, media.metaCheckoutStarts),
    addPaymentInfo: firstNumber(media.metaAddPaymentInfo, media.metaPaymentInfo),
    purchase: firstNumber(media.metaConversions)
  };

  const organicValues = {
    visitors: firstNumber(organic.visitors, organic.activeUsers, site.organicUsers),
    viewContent: firstNumber(organic.viewContent, organic.hotelViews),
    search: firstNumber(organic.search, organic.availabilitySearches),
    initiateCheckout: firstNumber(organic.initiateCheckout, organic.checkoutStarts),
    addPaymentInfo: firstNumber(organic.addPaymentInfo, organic.paymentInfo),
    purchase: firstNumber(organic.purchase, organic.purchases)
  };

  const geralValues = {};
  COMMERCIAL_FUNNEL_STAGES.forEach((stage) => {
    geralValues[stage.key] = sumKnown(organicValues[stage.key], googleValues[stage.key], metaValues[stage.key], asksuiteValues[stage.key]);
  });

  const salesRevenue = firstNumber(summary.revenue);
  return {
    geral: {
      label: "Geral",
      description: "Soma das origens conectadas disponíveis.",
      values: geralValues,
      revenue: sumKnown(salesRevenue, media.googleConversionValue, media.metaConversionValue),
      segments: commercialSegments(payload, "Geral", conversion.byHotel, conversion.byChannel, conversion.byStateDdd)
    },
    organico: {
      label: "Site orgânico",
      description: "Origem orgânica sem investimento. Exibe apenas eventos já conectados no GA4.",
      values: organicValues,
      revenue: firstNumber(organic.revenue),
      segments: commercialSegments(payload, "Orgânico", [], [], [])
    },
    google: {
      label: "Google patrocinado",
      description: "Mídia paga Google Ads e eventos associados quando disponíveis.",
      values: googleValues,
      revenue: firstNumber(media.googleConversionValue),
      segments: commercialSegments(payload, "Google Ads", [], [{ label: "Google Ads", dialogues: media.googleClicks, sales: media.googleConversions, revenue: media.googleConversionValue }], media.byCity)
    },
    meta: {
      label: "Meta Ads",
      description: "Mídia paga Meta Ads e eventos associados quando disponíveis.",
      values: metaValues,
      revenue: firstNumber(media.metaConversionValue),
      segments: commercialSegments(payload, "Meta Ads", [], [{ label: "Meta Ads", dialogues: media.metaClicks, sales: media.metaConversions, revenue: media.metaConversionValue }], media.byMetaOrigin)
    },
    asksuite: {
      label: "Asksuite",
      description: "Atendimentos, oportunidades, reservas e vendas vindos da planilha Asksuite.",
      values: asksuiteValues,
      revenue: salesRevenue,
      segments: commercialSegments(payload, "Asksuite", conversion.byHotel, conversion.byChannel, conversion.byStateDdd)
    }
  };
}

function commercialSegments(payload, sourceLabel, hotelRows = [], originRows = [], stateRows = []) {
  const filters = payload.filters || {};
  const selected = filters.selected || {};
  const selectedMonths = normalizeMonthValues(state.filters.months);
  const periodLabel = state.filters.date
    ? formatDateBr(state.filters.date)
    : (selectedMonths.length ? monthSelectionLabel(selectedMonths) : "Período selecionado");
  const originFallback = originRows?.length ? originRows : [{ label: sourceLabel, dialogues: null, clicks: null, sales: null }];
  return {
    hotels: (hotelRows || []).slice(0, 8).map((row) => ({
      label: row.label || row.hotel || "Não informado",
      value: row.sales ?? row.conversions ?? row.dialogues ?? row.clicks ?? null
    })),
    origins: (originFallback || []).slice(0, 8).map((row) => ({
      label: row.label || row.channel || row.city || row.region || "Não informado",
      value: row.dialogues ?? row.clicks ?? row.sales ?? row.conversions ?? null
    })),
    devices: [
      { label: "Desktop", value: null },
      { label: "Mobile", value: null }
    ],
    states: (stateRows || payload.demand?.stateTable || []).slice(0, 8).map((row) => ({
      label: row.state || row.label || row.city || row.region || "Não informado",
      value: row.dialogues ?? row.clicks ?? row.sales ?? row.conversions ?? null
    })),
    period: [
      { label: "Período", value: periodLabel },
      { label: "Hotel", value: selected.hotel || state.filters.hotel || "Todos os hotéis" },
      { label: "Canal", value: selected.channel || state.filters.channel || "Todos os canais" }
    ]
  };
}

function funnelFirstKnownValue(values) {
  for (const stage of COMMERCIAL_FUNNEL_STAGES) {
    const value = numberOrNull(values[stage.key]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

function funnelTicketAverage(funnel) {
  const purchase = numberOrNull(funnel.values.purchase);
  const revenue = numberOrNull(funnel.revenue);
  return purchase && revenue !== null ? revenue / purchase : null;
}

function funnelPotentialAbandoned(funnel) {
  const checkout = firstNumber(funnel.values.addPaymentInfo, funnel.values.initiateCheckout);
  const purchase = numberOrNull(funnel.values.purchase);
  const ticket = funnelTicketAverage(funnel);
  if (checkout === null || purchase === null || ticket === null || checkout <= purchase) return null;
  return (checkout - purchase) * ticket;
}

function funnelCheckoutAbandonment(funnel) {
  const checkout = firstNumber(funnel.values.addPaymentInfo, funnel.values.initiateCheckout);
  const purchase = numberOrNull(funnel.values.purchase);
  if (checkout === null || checkout <= 0 || purchase === null) return null;
  return Math.max(0, (1 - purchase / checkout) * 100);
}

function funnelGeneralConversion(funnel) {
  const first = funnelFirstKnownValue(funnel.values);
  const purchase = numberOrNull(funnel.values.purchase);
  if (!first || purchase === null) return null;
  return (purchase / first) * 100;
}

function renderCommercialFunnel(payload = {}) {
  const tabs = document.getElementById("commercialFunnelTabs");
  const funnelElement = document.getElementById("commercialFunnel");
  const kpiElement = document.getElementById("commercialFunnelKpis");
  if (!tabs || !funnelElement || !kpiElement) return;

  const funnels = buildCommercialFunnels(payload);
  if (!funnels[state.funnelSource]) state.funnelSource = "geral";
  const active = funnels[state.funnelSource];
  tabs.innerHTML = Object.entries(funnels).map(([key, funnel]) => `
    <button type="button" class="funnel-tab ${key === state.funnelSource ? "is-active" : ""}" data-funnel-source="${key}">
      ${escapeHtml(funnel.label)}
    </button>
  `).join("");
  tabs.querySelectorAll("[data-funnel-source]").forEach((button) => {
    button.addEventListener("click", () => {
      state.funnelSource = button.dataset.funnelSource || "geral";
      renderCommercialFunnel(payload);
    });
  });

  funnelElement.innerHTML = COMMERCIAL_FUNNEL_STAGES.map((stage, index) => {
    const value = numberOrNull(active.values[stage.key]);
    const { conversion, loss } = getConversionToNext(active.values, index);
    const width = Math.max(42, 100 - index * 9);
    const isEmpty = value === null;
    return `
      <button
        type="button"
        class="commercial-funnel-stage ${isEmpty ? "is-empty" : ""}"
        style="--stage-width:${width}%; --stage-color:${stage.color}"
        data-funnel-stage="${stage.key}">
        <span class="commercial-funnel-stage-inner">
          <span>
            ${escapeHtml(stage.label)}
            <small>${escapeHtml(stage.detail)}</small>
            <strong>${valueText(value)}</strong>
            <em class="stage-loss">Perda ${formatFunnelPct(loss)}</em>
          </span>
          <span class="stage-next">Próxima etapa ${formatFunnelPct(conversion)}</span>
        </span>
      </button>
    `;
  }).join("");
  funnelElement.querySelectorAll("[data-funnel-stage]").forEach((button) => {
    button.addEventListener("click", () => openFunnelDrawer(active, button.dataset.funnelStage));
  });

  const potential = funnelPotentialAbandoned(active);
  const abandonment = funnelCheckoutAbandonment(active);
  const generalConversion = funnelGeneralConversion(active);
  const ticket = funnelTicketAverage(active);
  const kpis = [
    ["Receita gerada", valueText(active.revenue, formatCurrency.format.bind(formatCurrency)), "revenue"],
    ["Receita potencial abandonada", valueText(potential, formatCurrency.format.bind(formatCurrency)), "warning"],
    ["Ticket médio", valueText(ticket, formatCurrency.format.bind(formatCurrency)), ""],
    ["Taxa de abandono do checkout", formatFunnelPct(abandonment), "warning"],
    ["Conversão geral do funil", formatFunnelPct(generalConversion), "revenue"]
  ];
  kpiElement.innerHTML = `
    ${kpis.map(([label, value, className]) => `
      <div class="funnel-kpi ${className}">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("")}
    <div class="funnel-note">${escapeHtml(active.description)} Etapas sem evento conectado aparecem como "--".</div>
  `;
}

function openFunnelDrawer(funnel, stageKey) {
  const drawer = document.getElementById("commercialFunnelDrawer");
  if (!drawer || !funnel) return;
  const stage = COMMERCIAL_FUNNEL_STAGES.find((item) => item.key === stageKey) || COMMERCIAL_FUNNEL_STAGES[0];
  const value = numberOrNull(funnel.values[stage.key]);
  const stageIndex = COMMERCIAL_FUNNEL_STAGES.findIndex((item) => item.key === stage.key);
  const { conversion, loss } = getConversionToNext(funnel.values, stageIndex);

  setText("funnelDrawerSource", funnel.label);
  setText("funnelDrawerTitle", stage.label);
  const summary = document.getElementById("funnelDrawerSummary");
  if (summary) {
    summary.innerHTML = `
      <div class="mini-kpi"><span>Quantidade</span><strong>${valueText(value)}</strong></div>
      <div class="mini-kpi"><span>Conversão para próxima</span><strong>${formatFunnelPct(conversion)}</strong></div>
      <div class="mini-kpi"><span>Perda</span><strong>${formatFunnelPct(loss)}</strong></div>
      <div class="mini-kpi"><span>Período</span><strong>${escapeHtml(funnel.segments?.period?.[0]?.value || monthSelectionLabel(state.filters.months))}</strong></div>
    `;
  }

  const segmentElement = document.getElementById("funnelDrawerSegments");
  if (segmentElement) {
    const cards = [
      ["Hotel", funnel.segments?.hotels || []],
      ["Origem", funnel.segments?.origins || []],
      ["Dispositivo", funnel.segments?.devices || []],
      ["Estado do cliente", funnel.segments?.states || []],
      ["Período selecionado", funnel.segments?.period || []]
    ];
    segmentElement.innerHTML = cards.map(([title, rows]) => `
      <section class="segment-card">
        <h3>${title}</h3>
        <ul>
          ${(rows && rows.length ? rows : [{ label: "Sem dados para esta segmentação", value: null }]).map((row) => `
            <li>
              <span title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
              <strong>${typeof row.value === "string" ? escapeHtml(row.value) : valueText(row.value)}</strong>
            </li>
          `).join("")}
        </ul>
      </section>
    `).join("");
  }
  drawer.setAttribute("aria-hidden", "false");
}

function bindFunnelDrawer() {
  document.querySelectorAll("[data-funnel-close]").forEach((element) => {
    element.addEventListener("click", () => {
      const drawer = document.getElementById("commercialFunnelDrawer");
      if (drawer) drawer.setAttribute("aria-hidden", "true");
    });
  });
}

bindExportButtons();
bindFunnelDrawer();
bindFilters();
loadDashboard();
