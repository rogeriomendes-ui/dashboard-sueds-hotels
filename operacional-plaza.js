const HOTEL_SLUG = "sueds-plaza";
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const LEADER_NAME_STORAGE_KEY = "sueds_operational_leader_name";
const state = { data: null, filter: "all", token: "", savingStatus: false };

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

function monthOptions() {
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
  const current = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(current.getFullYear(), current.getMonth() - index, 1);
    return { value: localMonthKey(date), label: formatter.format(date).toUpperCase() };
  });
}

function setupMonthSelect() {
  const select = byId("monthSelect");
  const options = monthOptions();
  select.innerHTML = options.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
  const requested = new URLSearchParams(window.location.search).get("month");
  select.value = options.some((item) => item.value === requested) ? requested : options[0].value;
  select.addEventListener("change", load);
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

function safePhotoUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function renderQuality(evaluation) {
  const hasData = (evaluation.opinions || 0) > 0;
  const score = safeScore(evaluation.finalScore);
  const color = scoreColor(evaluation.finalScore);
  byId("qualitySubtitle").textContent = hasData
    ? `${integer.format(evaluation.opinions)} opiniário${evaluation.opinions === 1 ? "" : "s"} • ${integer.format(evaluation.answeredItems || 0)} itens avaliados`
    : "Sem opiniários no período";
  byId("hotelScore").textContent = formatScore(evaluation.finalScore);
  byId("scoreRing").style.setProperty("--score", score);
  byId("scoreRing").style.setProperty("--score-color", color);
  byId("qualityBlocks").innerHTML = (evaluation.blocks || []).map((block) => {
    const blockScore = safeScore(block.score);
    const blockColor = scoreColor(block.score);
    return `
      <div class="quality-row" style="--score:${blockScore}; --score-color:${blockColor}">
        <span>${escapeHtml(block.label)}</span>
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
  return `
    <button type="button" class="incident-status-button status-${status}" data-status-action data-incident-id="${escapeHtml(incident.id)}">
      <strong>${labels[status]}</strong>
      ${date ? `<small>${escapeHtml(date)}</small>` : ""}
    </button>`;
}

function tableCell(label, content, className = "") {
  return `<td class="${className}"><span class="cell-label">${escapeHtml(label)}</span><span>${content}</span></td>`;
}

function incidentRow(incident) {
  const pending = incident.status === "pending";
  const durationClass = pending && incident.overdue ? "time-overdue" : "";
  const source = incident.source === "Opinario" ? "Opiniário" : incident.source;
  const guestName = incident.guestName || "Hóspede";
  const photoUrl = safePhotoUrl(incident.photoUrl);
  const guest = photoUrl
    ? `<a class="guest-photo-link" href="${escapeHtml(photoUrl)}" target="_blank" rel="noopener" title="Abrir foto do opinário">${escapeHtml(guestName)}<i data-lucide="image" aria-hidden="true"></i></a>`
    : escapeHtml(guestName);
  return `
    <tr>
      ${tableCell("Solicitado", escapeHtml(formatDateTime(incident.requestedAt)))}
      ${tableCell("Apto", escapeHtml(incident.apartment || "--"))}
      ${tableCell("Cliente", guest)}
      ${tableCell("Ocorrência", escapeHtml(incident.description || "--"), "description-cell")}
      ${tableCell("Status", incidentStatus(incident))}
      ${tableCell("Tempo", `<span class="${durationClass}">${escapeHtml(formatDuration(incident.elapsedMinutes))}</span>`)}
      ${tableCell("Origem", `<span class="source-badge">${escapeHtml(source || "--")}</span>`)}
      ${tableCell("Solicitante", escapeHtml(incident.requester || "--"))}
      ${tableCell("O.S.", escapeHtml(incident.orderNumber || "--"))}
    </tr>`;
}

function filteredIncidents() {
  const incidents = state.data?.operations?.incidents || [];
  if (state.filter === "all") return incidents;
  return incidents.filter((incident) => incident.status === state.filter);
}

function renderQueue() {
  const incidents = filteredIncidents();
  byId("queueCount").textContent = `${incidents.length} registro${incidents.length === 1 ? "" : "s"}`;
  byId("incidentsBody").innerHTML = incidents.length
    ? incidents.map(incidentRow).join("")
    : '<tr class="empty-row"><td colspan="9"><span class="cell-label"></span>Nenhuma ocorrência neste filtro.</td></tr>';
  refreshIcons();
}

function render(data) {
  state.data = data;
  const evaluation = data.evaluation || {};
  const summary = data.operations?.summary || {};
  byId("summaryScore").textContent = formatScore(evaluation.finalScore);
  byId("summaryOpinions").textContent = integer.format(evaluation.opinions || 0);
  byId("summaryPending").textContent = integer.format(summary.pending || 0);
  byId("summaryOverdue").textContent = integer.format(summary.overdue || 0);
  byId("lastUpdate").textContent = formatUpdate(data.generatedAt);
  renderQuality(evaluation);
  renderAlerts(data.operations || {});
  renderQueue();
  refreshIcons();
}

async function load() {
  byId("lastUpdate").textContent = "Atualizando...";
  const token = await window.suedsManagerAuthReady;
  state.token = token;
  const month = byId("monthSelect").value;
  const response = await fetch(`/api/operacional/tv?view=hotel&hotel=${HOTEL_SLUG}&month=${month}`, {
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

function closeIncidentStatusDialog() {
  const dialog = byId("incidentStatusDialog");
  if (dialog.open) dialog.close();
}

function openIncidentStatusDialog(incidentId) {
  const incident = findIncident(incidentId);
  if (!incident) return;
  byId("incidentStatusId").value = incident.id;
  byId("incidentStatusDescription").textContent = `${incident.guestName || "Hóspede"} • ${incident.description || "Ocorrência"}`;
  byId("incidentLeaderName").value = localStorage.getItem(LEADER_NAME_STORAGE_KEY) || "";
  byId("incidentStatusMessage").textContent = "";
  const statusInput = document.querySelector(`input[name="incidentStatus"][value="${incident.status || "pending"}"]`);
  if (statusInput) statusInput.checked = true;
  byId("incidentStatusDialog").showModal();
  refreshIcons();
  window.setTimeout(() => byId("incidentLeaderName").focus(), 50);
}

async function saveIncidentStatus(event) {
  event.preventDefault();
  if (state.savingStatus) return;
  const incidentId = byId("incidentStatusId").value;
  const status = document.querySelector('input[name="incidentStatus"]:checked')?.value || "";
  const actor = byId("incidentLeaderName").value.replace(/\s+/g, " ").trim();
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
      body: JSON.stringify({ incidentId, status, actor, hotel: HOTEL_SLUG })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Não foi possível atualizar a ocorrência.");
    localStorage.setItem(LEADER_NAME_STORAGE_KEY, actor);
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

function setupFilters() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderQueue();
    });
  });
}

setupMonthSelect();
setupFilters();
setupIncidentStatusDialog();
refreshIcons();
load().catch((error) => {
  byId("lastUpdate").textContent = "Falha na atualização";
  byId("alertsList").innerHTML = alertItem({ type: "danger", icon: "wifi-off", title: "Dados indisponíveis", detail: error.message });
  refreshIcons();
});
setInterval(() => load().catch(() => {}), 60000);
