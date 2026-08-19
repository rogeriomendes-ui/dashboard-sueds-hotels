const HOTEL_ROUTE_SLUGS = {
  plaza: "sueds-plaza",
  cabralia: "sueds-cabralia",
  "segundo-sol": "sueds-segundo-sol",
  premium: "sueds-premium",
  trancoso: "sueds-trancoso",
  "casas-arraial": "casas-sueds-arraial"
};
const HOTEL_CONFIG = {
  "sueds-plaza": {
    label: "SUEDS Plaza",
    descriptions: {
      Geral: "Impressão geral e reserva.",
      Alimentos: "Café, almoço e jantar.",
      Atendimento: "Do hotel e Beach Club.",
      Apartamento: "Conforto e limpeza do apto.",
      "Serviços": "Recepção, Wi-Fi, lazer/piscina."
    }
  },
  "sueds-cabralia": {
    label: "SUEDS Cabrália",
    descriptions: {
      Geral: "Impressão geral e reserva.",
      Alimentos: "Café da manhã e jantar.",
      Atendimento: "Do hotel e Beach Club.",
      Apartamento: "Conforto e limpeza do apto.",
      "Serviços": "Recepção, Wi-Fi, lazer/piscina."
    }
  },
  "sueds-segundo-sol": {
    label: "SUEDS Segundo Sol",
    descriptions: {
      Geral: "Impressão geral e reserva.",
      Alimentos: "Café, almoço e jantar.",
      Atendimento: "Do hotel e Beach Club.",
      Apartamento: "Conforto e limpeza do apto.",
      "Serviços": "Recepção, Wi-Fi, lazer/piscina."
    }
  },
  "sueds-premium": {
    label: "SUEDS Premium",
    descriptions: {
      Geral: "Impressão geral e reserva.",
      Alimentos: "Café, almoço e jantar.",
      Atendimento: "Do hotel e Beach Club.",
      Apartamento: "Conforto e limpeza do apto.",
      "Serviços": "Recepção, Wi-Fi, lazer/piscina."
    }
  },
  "sueds-trancoso": {
    label: "SUEDS Trancoso",
    descriptions: {
      Geral: "Impressão geral e reserva.",
      Alimentos: "Café da manhã e chá da tarde.",
      Atendimento: "Da equipe do hotel.",
      Apartamento: "Conforto e limpeza do apto.",
      "Serviços": "Recepção, Wi-Fi, lazer/piscina."
    }
  },
  "casas-sueds-arraial": {
    label: "Casas SUEDS Arraial",
    descriptions: {
      Geral: "Impressão geral e reserva.",
      Alimentos: "Não avaliado neste formulário.",
      Atendimento: "Da equipe.",
      Apartamento: "Conforto, limpeza, equipamentos e localização.",
      "Serviços": "Qualidade do Wi-Fi."
    }
  }
};
const hotelRouteKey = window.location.pathname.split("/").filter(Boolean).pop() || "plaza";
const HOTEL_SLUG = HOTEL_ROUTE_SLUGS[hotelRouteKey] || "sueds-plaza";
const CURRENT_HOTEL = HOTEL_CONFIG[HOTEL_SLUG];
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const KPI_ALERTS_ENABLED = false;
const QUALITY_BLOCK_DESCRIPTIONS = CURRENT_HOTEL.descriptions;
const OPINION_FIELD_LABELS = {
  generalImpression: "Impressão geral",
  reservation: "Reserva",
  frontDesk: "Recepção / Check-in / Check-out",
  teamService: "Atendimento da equipe",
  roomComfort: "Conforto do quarto",
  roomCleaning: "Limpeza do quarto",
  apartmentComfort: "Conforto do apartamento",
  apartmentInitialCleaning: "Limpeza inicial do apartamento",
  apartmentEquipment: "Equipamentos / utensílios",
  apartmentLocation: "Localização do apartamento",
  wifi: "Qualidade do Wi-Fi",
  pool: "Área de lazer / piscina",
  beachClub: "Atendimento do Beach Club",
  foodBreakfast: "Café da manhã",
  foodAfternoonTea: "Chá da tarde",
  foodLunch: "Almoço",
  foodDinner: "Jantar"
};
const state = {
  data: null,
  filter: "all",
  search: "",
  opinionFilter: "all",
  opinionSearch: "",
  periodMode: "month",
  token: "",
  savingStatus: false,
  photoObjectUrl: "",
  photoRotation: 0,
  photoRequestId: 0
};

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function localMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function localDateKey(date = new Date()) {
  return `${localMonthKey(date)}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthOptions() {
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
  const current = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(current.getFullYear(), current.getMonth() - index, 1);
    return { value: localMonthKey(date), label: formatter.format(date).toUpperCase() };
  });
}

function setPeriodMode(mode, shouldLoad = true) {
  state.periodMode = ["day", "tuesday", "friday"].includes(mode) ? mode : "month";
  const monthSelect = byId("monthSelect");
  const daySelect = byId("daySelect");
  const dayMode = state.periodMode === "day";
  monthSelect.hidden = dayMode;
  daySelect.hidden = !dayMode;
  byId("periodValueLabel").htmlFor = dayMode ? "daySelect" : "monthSelect";
  byId("qualityPeriodLabel").textContent = {
    day: "Avaliação diária",
    tuesday: "Avaliação das terças-feiras",
    friday: "Avaliação das sextas-feiras"
  }[state.periodMode] || "Avaliação mensal";
  document.querySelectorAll("[data-period-mode]").forEach((button) => {
    const active = button.dataset.periodMode === state.periodMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (shouldLoad) load().catch(() => {});
}

function setupPeriodControls() {
  const monthSelect = byId("monthSelect");
  const daySelect = byId("daySelect");
  const options = monthOptions();
  const requested = new URLSearchParams(window.location.search);
  const requestedMonth = requested.get("month");
  const requestedDate = requested.get("date");
  const requestedWeekday = requested.get("weekday");
  monthSelect.innerHTML = options.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
  monthSelect.value = options.some((item) => item.value === requestedMonth) ? requestedMonth : options[0].value;
  daySelect.value = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || "") ? requestedDate : localDateKey();

  monthSelect.addEventListener("change", () => {
    if (state.periodMode !== "day") load();
  });
  daySelect.addEventListener("change", () => {
    const matchingMonth = daySelect.value.slice(0, 7);
    if (options.some((item) => item.value === matchingMonth)) monthSelect.value = matchingMonth;
    if (state.periodMode === "day" && daySelect.value) load();
  });
  document.querySelectorAll("[data-period-mode]").forEach((button) => {
    button.addEventListener("click", () => setPeriodMode(button.dataset.periodMode));
  });
  const initialMode = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || "")
    ? "day"
    : ["tuesday", "friday"].includes(requestedWeekday)
      ? requestedWeekday
      : "month";
  setPeriodMode(initialMode, false);
}

function formatScore(value) {
  return Number.isFinite(value) ? `${integer.format(value)}%` : "--";
}

function scoreColor(value) {
  if (!Number.isFinite(value)) return "#8a98a5";
  if (value >= 90) return "#178353";
  if (value >= 75) return "#67a93f";
  if (value >= 60) return "#db8c19";
  return "#d33a42";
}

function safeScore(value) {
  return Math.max(0, Math.min(Number(value || 0), 100));
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatStayDate(value) {
  const text = String(value || "").trim();
  if (!text) return "--";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1].slice(-2)}`;
  const brazilian = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (brazilian) {
    return `${brazilian[1].padStart(2, "0")}/${brazilian[2].padStart(2, "0")}/${brazilian[3].slice(-2)}`;
  }
  return text;
}

function formatUpdate(value) {
  if (!value) return "Atualizando...";
  return `Atualizado ${formatDateTime(value)}`;
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return "--";
  const hours = Math.floor(minutes / 60);
  const rest = Math.max(0, Math.floor(minutes % 60));
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")} h`;
}

function joinNotes(items, emptyText) {
  const values = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
  return values.length ? values.join(" • ") : emptyText;
}

const WORD_CLOUD_STOP_WORDS = new Set([
  "a", "ao", "aos", "aquela", "aquele", "as", "ate", "com", "como", "da", "das", "de", "do", "dos",
  "e", "ela", "ele", "em", "essa", "esse", "esta", "este", "eu", "foi", "hotel", "ja", "mais", "mas",
  "me", "mesmo", "muito", "na", "nas", "no", "nos", "nao", "nosso", "nossa", "o", "os", "ou", "para",
  "pela", "pelas", "pelo", "pelos", "por", "porque", "pra", "que", "se", "sem", "ser", "seu", "sua",
  "tambem", "tem", "teve", "toda", "todo", "todos", "uma", "um", "the", "and", "for", "was", "with",
  "sr", "sra", "dia", "dias", "quarto", "tudo"
]);

const WORD_CLOUD_ALIASES = {
  aguas: "agua",
  apartamentos: "apartamento",
  banheiros: "banheiro",
  cafes: "cafe",
  chuveiros: "chuveiro",
  funcionarios: "funcionario",
  piscinas: "piscina",
  quartos: "quarto",
  refeicoes: "refeicao"
};

const WORD_CLOUD_LABELS = {
  agua: "água",
  arcondicionado: "ar-condicionado",
  cafe: "café",
  funcionario: "funcionário",
  manutencao: "manutenção",
  refeicao: "refeição",
  wifi: "Wi-Fi"
};

const WORD_CLOUD_COLORS = ["#176484", "#178353", "#324d67", "#c06d16", "#b23b45", "#4f8f3a"];

function normalizeWordCloudText(value) {
  return String(value || "")
    .toLocaleLowerCase("pt-BR")
    .replace(/wi[\s-]?fi/gi, "wifi")
    .replace(/ar[\s-]?condicionado/gi, "arcondicionado")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function wordCloudEntries(incidents) {
  const counts = new Map();
  (incidents || []).forEach((incident) => {
    const words = normalizeWordCloudText(incident.comments)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);

    words.forEach((word) => {
      const key = WORD_CLOUD_ALIASES[word] || word;
      if (key.length < 4 || WORD_CLOUD_STOP_WORDS.has(key) || /^\d+$/.test(key)) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .slice(0, 28);
}

function renderWordCloud(operations) {
  const incidents = operations.incidents || [];
  const entries = wordCloudEntries(incidents);
  const comments = incidents.filter((incident) => String(incident.comments || "").trim()).length;
  byId("wordCloudSubtitle").textContent = comments
    ? `${integer.format(comments)} comentário${comments === 1 ? "" : "s"} no período`
    : "Sem comentários no período";

  if (!entries.length) {
    byId("wordCloud").innerHTML = '<p class="word-cloud-empty">Nenhuma palavra disponível.</p>';
    return;
  }

  const values = entries.map(([, count]) => count);
  const min = Math.min(...values);
  const max = Math.max(...values);
  byId("wordCloud").innerHTML = entries.map(([word, count], index) => {
    const scale = max === min ? 0.5 : (count - min) / (max - min);
    const size = Math.round(12 + Math.pow(scale, 0.72) * 18);
    const weight = scale >= 0.58 ? 850 : scale >= 0.25 ? 750 : 650;
    const label = WORD_CLOUD_LABELS[word] || word;
    const mentions = `${count} ${count === 1 ? "menção" : "menções"}`;
    return `<span class="word-cloud-item" style="--word-size:${size}px; --word-weight:${weight}; --word-color:${WORD_CLOUD_COLORS[index % WORD_CLOUD_COLORS.length]}" title="${escapeHtml(mentions)}">${escapeHtml(label)}</span>`;
  }).join("");
}

function renderQuality(evaluation) {
  const totalOpinions = Number(evaluation.totalOpinions ?? evaluation.opinions ?? 0);
  const approvedOpinions = Number(evaluation.approvedOpinions ?? evaluation.opinions ?? 0);
  const reviewOpinions = Number(evaluation.reviewOpinions || 0);
  const hasData = totalOpinions > 0;
  const score = safeScore(evaluation.finalScore);
  const color = scoreColor(evaluation.finalScore);
  byId("qualitySubtitle").textContent = hasData
    ? `${integer.format(totalOpinions)} formulários • ${integer.format(approvedOpinions)} avaliados${reviewOpinions ? ` • ${integer.format(reviewOpinions)} em revisão` : ""}`
    : "Sem opiniários no período";
  byId("hotelScore").textContent = formatScore(evaluation.finalScore);
  byId("scoreRing").style.setProperty("--score", score);
  byId("scoreRing").style.setProperty("--score-color", color);
  byId("qualityBlocks").innerHTML = (evaluation.blocks || []).map((block) => {
    const blockScore = safeScore(block.score);
    const blockColor = scoreColor(block.score);
    const description = QUALITY_BLOCK_DESCRIPTIONS[block.label] || "";
    return `
      <div class="quality-row" style="--score:${blockScore}; --score-color:${blockColor}">
        <span class="quality-label">
          <strong>${escapeHtml(block.label)}</strong>
          ${description ? `<small>${escapeHtml(description)}</small>` : ""}
        </span>
        <div class="quality-bar"><i></i></div>
        <strong>${formatScore(block.score)}</strong>
      </div>`;
  }).join("");
  byId("hotelHighlights").textContent = joinNotes(evaluation.highlights, "Sem destaques no período.");
  byId("hotelIssues").textContent = joinNotes(evaluation.issues, "Sem pontos críticos no período.");
}

function alertItem({ type = "info", icon, title, detail, value = "" }) {
  return `
    <div class="alert-item alert-${type}">
      <div class="alert-icon"><i data-lucide="${icon}" aria-hidden="true"></i></div>
      <div class="alert-copy">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(detail)}</p>
      </div>
      ${value ? `<span class="${type === "danger" ? "alert-time" : "alert-count"}">${escapeHtml(value)}</span>` : ""}
    </div>`;
}

function renderAlerts(operations) {
  const incidents = operations.incidents || [];
  const pms = operations.pms || {};
  const status = byId("pmsStatus");
  status.classList.toggle("connected", Boolean(pms.connected));
  status.innerHTML = `<i data-lucide="${pms.connected ? "plug-zap" : "unplug"}" aria-hidden="true"></i><span>${pms.connected ? "KIPFULL conectado" : "KIPFULL aguardando integração"}</span>`;

  const alerts = [];
  const pendingAboveThreeHours = incidents.filter((incident) => (
    incident.status === "pending" && Number(incident.elapsedMinutes || 0) >= 180
  ));

  pendingAboveThreeHours.forEach((incident) => {
    alerts.push(alertItem({
      type: "danger",
      icon: "triangle-alert",
      title: `Atenção${incident.apartment ? ` • Apto ${incident.apartment}` : ""}`,
      detail: incident.description,
      value: formatDuration(incident.elapsedMinutes)
    }));
  });

  if (!pendingAboveThreeHours.length) {
    alerts.push(alertItem({
      type: "success",
      icon: "trophy",
      title: "NENHUMA, PARABÉNS! Continuem assim!",
      detail: "Não há pendências acima de 3 horas sem solução."
    }));
  }

  byId("alertsList").innerHTML = alerts.join("");
}

function incidentStatus(incident) {
  const labels = {
    pending: "Pendente",
    resolved: "Resolvido",
    registered: "Registrado"
  };
  const status = labels[incident.status] ? incident.status : "pending";
  const date = incident.statusAt ? formatDateTime(incident.statusAt) : "";
  const storedActor = String(incident.statusActor || "").replace(/\s+/g, " ").trim();
  const actor = storedActor.toLocaleLowerCase("pt-BR") === "melhorias futuras" ? "" : storedActor;
  return `
    <button type="button" class="incident-status-button status-${status}" data-status-action data-incident-id="${escapeHtml(incident.id)}">
      <strong>${labels[status]}</strong>
      ${date ? `<small>${escapeHtml(date)}</small>` : ""}
      ${actor ? `<small class="incident-status-actor">Por ${escapeHtml(actor)}</small>` : ""}
    </button>`;
}

function tableCell(label, content, className = "") {
  return `<td class="${className}"><span class="cell-label">${escapeHtml(label)}</span><span>${content}</span></td>`;
}

function incidentSituation(incident) {
  const situation = incident.situation === "critica" ? "critica" : "elogio";
  const label = situation === "critica" ? "Crítica" : "Elogio";
  return `<span class="situation-badge situation-${situation}" title="Classificação realizada pela IA">${label}</span>`;
}

function incidentRow(incident) {
  const pending = incident.status === "pending";
  const durationClass = pending && incident.overdue ? "time-overdue" : "";
  const source = incident.source === "Opinario" ? "Opiniário" : incident.source;
  const guestName = incident.guestName || "Hóspede";
  const guest = incident.photoUrl && incident.id
    ? `<button type="button" class="guest-photo-link" data-photo-action data-photo-id="${escapeHtml(incident.id)}" title="Abrir foto do opinário">${escapeHtml(guestName)}<i data-lucide="image" aria-hidden="true"></i></button>`
    : escapeHtml(guestName);
  return `
    <tr>
      ${tableCell("Solicitado", escapeHtml(formatDateTime(incident.requestedAt)))}
      ${tableCell("Apto", escapeHtml(incident.apartment || "--"))}
      ${tableCell("Check-out", escapeHtml(formatStayDate(incident.checkOut)))}
      ${tableCell("Cliente", guest)}
      ${tableCell("Ocorrência", escapeHtml(incident.description || "--"), "description-cell")}
      ${tableCell("Status", incidentStatus(incident))}
      ${tableCell("Tempo", `<span class="${durationClass}">${escapeHtml(formatDuration(incident.elapsedMinutes))}</span>`)}
      ${tableCell("Origem", `<span class="source-badge">${escapeHtml(source || "--")}</span>`)}
      ${tableCell("Situação", incidentSituation(incident))}
      ${tableCell("O.S.", escapeHtml(incident.orderNumber || "--"))}
    </tr>`;
}

function filteredIncidents() {
  const incidents = state.data?.operations?.incidents || [];
  const search = normalizeQueueSearch(state.search);
  return incidents.filter((incident) => {
    if (["critica", "elogio"].includes(state.filter)) {
      if (incident.situation !== state.filter) return false;
    } else if (state.filter !== "all" && incident.status !== state.filter) {
      return false;
    }
    if (!search) return true;
    const guestName = normalizeQueueSearch(incident.guestName || "Hóspede");
    const apartment = normalizeQueueSearch(incident.apartment);
    return guestName.includes(search) || apartment.includes(search);
  });
}

function normalizeQueueSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function opinionsMatchingSearch(value) {
  const search = normalizeQueueSearch(value);
  if (!search) return [];
  return (state.data?.opinionResponses || []).filter((opinion) => (
    normalizeQueueSearch(opinion.guestName || "Hóspede").includes(search)
      || normalizeQueueSearch(opinion.apartment).includes(search)
  ));
}

function renderQueueOpinionMatches() {
  const container = byId("queueOpinionMatches");
  const matches = opinionsMatchingSearch(state.search);
  if (!normalizeQueueSearch(state.search) || !matches.length) {
    container.hidden = true;
    return;
  }
  const alternativesOnly = matches.filter((opinion) => !opinion.hasText).length;
  const totalLabel = `${matches.length} opiniário${matches.length === 1 ? "" : "s"} encontrado${matches.length === 1 ? "" : "s"}`;
  const alternativesLabel = alternativesOnly
    ? ` • ${alternativesOnly} somente com alternativas`
    : "";
  byId("queueOpinionMatchesText").textContent = `${totalLabel}${alternativesLabel}`;
  container.hidden = false;
}

function renderQueue() {
  const incidents = filteredIncidents();
  byId("queueCount").textContent = `${incidents.length} registro${incidents.length === 1 ? "" : "s"}`;
  byId("incidentsBody").innerHTML = incidents.length
    ? incidents.map(incidentRow).join("")
    : `<tr class="empty-row"><td colspan="10"><span class="cell-label"></span>${state.search ? "Nenhuma ocorrência com texto encontrada nesta busca." : "Nenhuma ocorrência neste filtro."}</td></tr>`;
  renderQueueOpinionMatches();
  refreshIcons();
}

function opinionRatingLabel(score) {
  const labels = { 100: "Excelente", 75: "Muito bom", 50: "Bom", 25: "Regular" };
  return labels[Number(score)] || "--";
}

function opinionAverage(fieldScores = {}) {
  const scores = Object.values(fieldScores).filter(Number.isFinite);
  return scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
}

function opinionPeriodLabel() {
  const period = state.data?.period || {};
  if (period.date) return `Data: ${formatStayDate(period.date)}`;
  const selectedMonth = byId("monthSelect").selectedOptions[0]?.textContent || period.month || "";
  const weekday = { tuesday: " • terças-feiras", friday: " • sextas-feiras" }[period.weekday] || "";
  return `${selectedMonth}${weekday}`;
}

function filteredOpinionResponses() {
  const search = normalizeQueueSearch(state.opinionSearch);
  return (state.data?.opinionResponses || []).filter((opinion) => {
    if (state.opinionFilter === "alternatives" && opinion.hasText) return false;
    if (state.opinionFilter === "text" && !opinion.hasText) return false;
    if (!search) return true;
    return normalizeQueueSearch(opinion.guestName || "Hóspede").includes(search)
      || normalizeQueueSearch(opinion.apartment).includes(search);
  });
}

function opinionResponseCard(opinion) {
  const guestName = opinion.guestName || "Hóspede";
  const apartment = opinion.apartment ? `Apto ${opinion.apartment}` : "Apto não informado";
  const averageScore = opinionAverage(opinion.fieldScores);
  const answers = Object.entries(opinion.fieldScores || {})
    .filter(([, score]) => Number.isFinite(score))
    .map(([field, score]) => `
      <div class="opinion-answer">
        <span>${escapeHtml(OPINION_FIELD_LABELS[field] || field)}</span>
        <strong>${escapeHtml(opinionRatingLabel(score))}</strong>
      </div>`)
    .join("");
  return `
    <details class="opinion-response-card">
      <summary>
        <span class="opinion-response-identity">
          <strong>${escapeHtml(guestName)}</strong>
          <small>${escapeHtml(apartment)} • ${escapeHtml(formatDateTime(opinion.submittedAt))}</small>
        </span>
        <span class="opinion-response-summary">
          <em class="${opinion.hasText ? "has-text" : "alternatives-only"}">${opinion.hasText ? "Com texto" : "Somente alternativas"}</em>
          <strong>${Number.isFinite(averageScore) ? formatScore(averageScore) : "--"}</strong>
        </span>
      </summary>
      <div class="opinion-response-details">
        <div class="opinion-answers">${answers || '<p class="opinions-empty">Nenhuma alternativa reconhecida.</p>'}</div>
        ${opinion.text ? `<div class="opinion-response-text"><span>Comentário</span><p>${escapeHtml(opinion.text)}</p></div>` : ""}
        <div class="opinion-response-meta">
          ${opinion.checkIn ? `<span>Entrada: ${escapeHtml(formatStayDate(opinion.checkIn))}</span>` : ""}
          ${opinion.checkOut ? `<span>Saída: ${escapeHtml(formatStayDate(opinion.checkOut))}</span>` : ""}
          ${opinion.language ? `<span>Idioma: ${escapeHtml(String(opinion.language).toUpperCase())}</span>` : ""}
          ${opinion.hasPhoto ? `<button type="button" data-opinion-photo="${escapeHtml(opinion.id)}"><i data-lucide="image" aria-hidden="true"></i>Ver foto</button>` : ""}
        </div>
      </div>
    </details>`;
}

function renderOpinionResponses() {
  const opinions = filteredOpinionResponses();
  byId("opinionsDialogCount").textContent = `${opinions.length} registro${opinions.length === 1 ? "" : "s"}`;
  byId("opinionsList").innerHTML = opinions.length
    ? opinions.map(opinionResponseCard).join("")
    : '<p class="opinions-empty">Nenhum opiniário encontrado neste filtro.</p>';
  refreshIcons();
}

function openOpinionsDialog(options = {}) {
  state.opinionFilter = options.filter || "all";
  state.opinionSearch = options.search || "";
  byId("opinionsSearch").value = state.opinionSearch;
  document.querySelectorAll("[data-opinion-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.opinionFilter === state.opinionFilter);
  });
  byId("opinionsDialogTitle").textContent = `Opiniários • ${CURRENT_HOTEL.label}`;
  byId("opinionsDialogPeriod").textContent = opinionPeriodLabel();
  renderOpinionResponses();
  byId("opinionsDialog").showModal();
  refreshIcons();
}

function closeOpinionsDialog() {
  const dialog = byId("opinionsDialog");
  if (dialog.open) dialog.close();
}

function render(data) {
  state.data = data;
  const evaluation = data.evaluation || {};
  const summary = data.operations?.summary || {};
  const hotelLabel = CURRENT_HOTEL.label;
  document.title = `${hotelLabel} | TV Operacional`;
  byId("hotelPageName").textContent = hotelLabel;
  byId("qualityTitle").textContent = hotelLabel;
  byId("summaryScore").textContent = formatScore(evaluation.finalScore);
  byId("summaryOpinions").textContent = integer.format(evaluation.totalOpinions ?? evaluation.opinions ?? 0);
  byId("summaryPending").textContent = integer.format(summary.pending || 0);
  byId("summaryOverdue").textContent = integer.format(summary.overdue || 0);
  byId("lastUpdate").textContent = formatUpdate(data.generatedAt);
  renderQuality(evaluation);
  renderWordCloud(data.operations || {});
  byId("kpiAlertsPanel").hidden = !KPI_ALERTS_ENABLED;
  if (KPI_ALERTS_ENABLED) renderAlerts(data.operations || {});
  renderQueue();
  if (byId("opinionsDialog").open) renderOpinionResponses();
  refreshIcons();
}

async function load() {
  byId("lastUpdate").textContent = "Atualizando...";
  const token = await window.suedsManagerAuthReady;
  state.token = token;
  const params = new URLSearchParams({ view: "hotel", hotel: HOTEL_SLUG });
  if (state.periodMode === "day") params.set("date", byId("daySelect").value);
  else {
    params.set("month", byId("monthSelect").value);
    if (["tuesday", "friday"].includes(state.periodMode)) params.set("weekday", state.periodMode);
  }
  const response = await fetch(`/api/operacional/tv?${params.toString()}`, {
    cache: "no-store",
    headers: { "x-dashboard-token": token }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Falha ao carregar dados operacionais.");
  render(payload);
}

function findIncident(incidentId) {
  return (state.data?.operations?.incidents || []).find((incident) => incident.id === incidentId);
}

function findOpinion(opinionId) {
  return (state.data?.opinionResponses || []).find((opinion) => opinion.id === opinionId);
}

function releaseOpinionPhoto() {
  state.photoRequestId += 1;
  if (state.photoObjectUrl) URL.revokeObjectURL(state.photoObjectUrl);
  state.photoObjectUrl = "";
  state.photoRotation = 0;
  const image = byId("opinionPhotoImage");
  image.removeAttribute("src");
  image.hidden = true;
  image.style.transform = "";
}

function closeOpinionPhotoDialog() {
  const dialog = byId("opinionPhotoDialog");
  if (dialog.open) dialog.close();
}

function rotateOpinionPhoto(direction) {
  state.photoRotation = (state.photoRotation + direction + 360) % 360;
  byId("opinionPhotoImage").style.transform = `rotate(${state.photoRotation}deg)`;
}

async function openOpinionPhoto(incidentId) {
  const incident = findIncident(incidentId) || findOpinion(incidentId);
  if (!incident?.id) return;

  releaseOpinionPhoto();
  const requestId = state.photoRequestId;
  const dialog = byId("opinionPhotoDialog");
  const image = byId("opinionPhotoImage");
  const message = byId("opinionPhotoMessage");
  const guestName = incident.guestName || "Hóspede";
  byId("opinionPhotoTitle").textContent = guestName;
  image.alt = `Foto do opinário de ${guestName}`;
  message.textContent = "Carregando foto...";
  message.hidden = false;
  dialog.showModal();
  refreshIcons();

  try {
    const params = new URLSearchParams({ view: "opinion-image", id: incident.id });
    const response = await fetch(`/api/operacional/tv?${params.toString()}`, {
      cache: "no-store",
      headers: { "x-dashboard-token": state.token }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Não foi possível carregar a foto.");
    }
    const photo = await response.blob();
    if (!photo.type.startsWith("image/")) throw new Error("O arquivo recebido não é uma imagem.");
    if (requestId !== state.photoRequestId || !dialog.open) return;
    state.photoObjectUrl = URL.createObjectURL(photo);
    image.src = state.photoObjectUrl;
    image.hidden = false;
    message.hidden = true;
  } catch (error) {
    if (requestId !== state.photoRequestId || !dialog.open) return;
    message.textContent = error.message;
    message.hidden = false;
  }
}

function closeIncidentStatusDialog() {
  const dialog = byId("incidentStatusDialog");
  if (dialog.open) dialog.close();
}

function authenticatedActorName() {
  const profile = window.suedsAccessProfile || {};
  return String(profile.displayName || profile.name || profile.username || "Usuário conectado")
    .replace(/\s+/g, " ")
    .trim();
}

function openIncidentStatusDialog(incidentId) {
  const incident = findIncident(incidentId);
  if (!incident) return;
  byId("incidentStatusId").value = incident.id;
  byId("incidentStatusDescription").textContent = `${incident.guestName || "Hóspede"} • ${incident.description || "Ocorrência"}`;
  byId("incidentLeaderName").value = authenticatedActorName();
  byId("incidentTreatmentNotes").value = incident.treatmentNotes || "";
  byId("incidentStatusMessage").textContent = "";
  const statusInput = document.querySelector(`input[name="incidentStatus"][value="${incident.status || "pending"}"]`);
  if (statusInput) statusInput.checked = true;
  byId("incidentStatusDialog").showModal();
  refreshIcons();
  window.setTimeout(() => byId("incidentTreatmentNotes").focus(), 50);
}

async function saveIncidentStatus(event) {
  event.preventDefault();
  if (state.savingStatus) return;
  const incidentId = byId("incidentStatusId").value;
  const status = document.querySelector('input[name="incidentStatus"]:checked')?.value || "";
  const actor = byId("incidentLeaderName").value.replace(/\s+/g, " ").trim();
  const treatmentNotes = byId("incidentTreatmentNotes").value.trim();
  const message = byId("incidentStatusMessage");
  if (!actor) {
    message.textContent = "Informe o responsável pela alteração.";
    byId("incidentLeaderName").focus();
    return;
  }

  state.savingStatus = true;
  byId("incidentStatusSave").disabled = true;
  message.textContent = "Salvando...";
  try {
    const response = await fetch("/api/operacional/tv", {
      method: "PATCH",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-dashboard-token": state.token
      },
      body: JSON.stringify({ incidentId, status, actor, treatmentNotes, hotel: HOTEL_SLUG })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Não foi possível atualizar a ocorrência.");
    closeIncidentStatusDialog();
    await load();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    state.savingStatus = false;
    byId("incidentStatusSave").disabled = false;
  }
}

function setupIncidentStatusDialog() {
  byId("incidentsBody").addEventListener("click", (event) => {
    const photoButton = event.target.closest("[data-photo-action]");
    if (photoButton) {
      openOpinionPhoto(photoButton.dataset.photoId);
      return;
    }
    const button = event.target.closest("[data-status-action]");
    if (button) openIncidentStatusDialog(button.dataset.incidentId);
  });
  byId("incidentStatusForm").addEventListener("submit", saveIncidentStatus);
  byId("incidentStatusClose").addEventListener("click", closeIncidentStatusDialog);
  byId("incidentStatusCancel").addEventListener("click", closeIncidentStatusDialog);
  byId("incidentStatusDialog").addEventListener("click", (event) => {
    if (event.target === byId("incidentStatusDialog")) closeIncidentStatusDialog();
  });
}

function setupOpinionPhotoDialog() {
  byId("opinionPhotoClose").addEventListener("click", closeOpinionPhotoDialog);
  byId("opinionPhotoRotateLeft").addEventListener("click", () => rotateOpinionPhoto(-90));
  byId("opinionPhotoRotateRight").addEventListener("click", () => rotateOpinionPhoto(90));
  byId("opinionPhotoDialog").addEventListener("click", (event) => {
    if (event.target === byId("opinionPhotoDialog")) closeOpinionPhotoDialog();
  });
  byId("opinionPhotoDialog").addEventListener("close", releaseOpinionPhoto);
}

function setupOpinionsDialog() {
  byId("opinionsMetricButton").addEventListener("click", () => openOpinionsDialog());
  byId("queueOpinionMatchesButton").addEventListener("click", () => {
    openOpinionsDialog({ search: state.search, filter: "all" });
  });
  byId("opinionsDialogClose").addEventListener("click", closeOpinionsDialog);
  byId("opinionsDialog").addEventListener("click", (event) => {
    if (event.target === byId("opinionsDialog")) closeOpinionsDialog();
  });
  byId("opinionsSearch").addEventListener("input", (event) => {
    state.opinionSearch = event.target.value;
    renderOpinionResponses();
  });
  document.querySelectorAll("[data-opinion-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.opinionFilter = button.dataset.opinionFilter;
      document.querySelectorAll("[data-opinion-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderOpinionResponses();
    });
  });
  byId("opinionsList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-opinion-photo]");
    if (button) openOpinionPhoto(button.dataset.opinionPhoto);
  });
}

function setupFilters() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderQueue();
    });
  });
  byId("queueSearch").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderQueue();
  });
}

setupPeriodControls();
setupFilters();
setupIncidentStatusDialog();
setupOpinionPhotoDialog();
setupOpinionsDialog();
document.title = `${CURRENT_HOTEL.label} | TV Operacional`;
byId("hotelPageName").textContent = CURRENT_HOTEL.label;
byId("qualityTitle").textContent = CURRENT_HOTEL.label;
refreshIcons();
load().catch((error) => {
  byId("lastUpdate").textContent = "Falha na atualização";
  byId("alertsList").innerHTML = alertItem({ type: "danger", icon: "wifi-off", title: "Dados indisponíveis", detail: error.message });
  refreshIcons();
});
setInterval(() => load().catch(() => {}), 60000);
