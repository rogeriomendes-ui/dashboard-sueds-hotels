(function setupReveillonVipTables() {
  const API_URL = "/api/portal/mesas-vip-reveillon";
  const STATUS_LABELS = { available: "Disponível", sold: "Paga", blocked: "Em andamento" };
  const PARTICIPANT_STATUS_LABELS = { blocked: "Bloqueado", paid: "Pago" };
  const state = { tables: [], selected: null, isAdmin: false, loading: false };
  const byId = (id) => document.getElementById(id);
  const markers = byId("tableMarkers");
  const dialog = byId("tableDialog");
  const form = byId("tableForm");
  const pageMessage = byId("pageMessage");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function positions() {
    const result = [];
    const leftX = [41.15, 38.58, 36.02, 33.44, 30.87, 28.37, 25.8];
    const leftY = [45.18, 41.14, 37.1, 33.17, 29.13];
    leftY.forEach((top, row) => leftX.forEach((left, column) => result.push({ number: row * 7 + column + 1, left, top })));
    const rightX = [80.63, 78.16, 75.76, 73.26];
    const rightY = [42.09, 38.17, 34.13, 30.08, 26.04, 22.12];
    rightY.forEach((top, row) => rightX.forEach((left, column) => result.push({ number: 36 + row * 4 + column, left, top })));
    return result;
  }

  const tablePositions = positions();

  function shortNotes(value) {
    const text = String(value || "").trim();
    return text.length > 110 ? `${text.slice(0, 107)}…` : text;
  }

  function normalizeParticipant(participant) {
    if (typeof participant === "string") return { name: participant, reservationNumber: "", status: "blocked", seller: "", notes: "" };
    return {
      name: String(participant?.name || ""),
      reservationNumber: String(participant?.reservationNumber || ""),
      status: ["blocked", "paid"].includes(participant?.status) ? participant.status : "blocked",
      seller: String(participant?.seller || ""),
      notes: String(participant?.notes || "")
    };
  }

  function participantDetails(table) {
    return (table.participants || []).map(normalizeParticipant).map((participant, index) => {
      const reservation = participant.reservationNumber ? ` · Reserva ${escapeHtml(participant.reservationNumber)}` : "";
      const status = ` · ${PARTICIPANT_STATUS_LABELS[participant.status] || "Bloqueado"}`;
      const seller = participant.seller ? ` · Vendedor: ${escapeHtml(participant.seller)}` : "";
      const notes = shortNotes(participant.notes) ? ` · ${escapeHtml(shortNotes(participant.notes))}` : "";
      return `${index + 1}. ${escapeHtml(participant.name || "Sem nome")}${reservation}${status}${seller}${notes}`;
    });
  }

  function tooltip(table) {
    if (table.status === "available") return `<strong>Mesa ${table.number} · Disponível</strong><span>Clique para registrar.</span>`;
    const details = table.tableType === "shared"
      ? [`Compartilhada · ${table.occupiedSeats || 0}/5 ocupados · ${table.paidSeats || 0}/5 pagos`, ...participantDetails(table)]
      : [`Exclusiva · mesa inteira · ${table.paidSeats === 5 ? "Paga" : "Bloqueada"}`, ...participantDetails(table)];
    return `<strong>Mesa ${table.number} · ${STATUS_LABELS[table.status]}</strong><span>${details.join("<br>") || "Sem observações."}</span>`;
  }

  function visualStatus(table) {
    if (Number(table.paidSeats || 0) === 5) return "sold";
    if (Number(table.occupiedSeats || 0) > 0) return "blocked";
    return "available";
  }

  function renderMarkers() {
    const tables = new Map(state.tables.map((table) => [table.number, table]));
    markers.innerHTML = tablePositions.map((position) => {
      const table = tables.get(position.number) || { number: position.number, status: "available", canEdit: true };
      const locked = !table.canEdit ? " locked" : "";
      const markerStatus = visualStatus(table);
      const aria = `Mesa ${table.number}, ${STATUS_LABELS[markerStatus] || markerStatus}`;
      const occupied = Number(table.occupiedSeats || 0);
      const chairs = Array.from({ length: 5 }, (_, index) => `<i class="table-chair chair-${index + 1}" aria-hidden="true"></i>`).join("");
      return `<button class="table-marker ${markerStatus}${locked}" type="button" style="left:${position.left}%;top:${position.top}%" data-table-number="${table.number}" aria-label="${escapeHtml(`${aria}, ${occupied} de 5 lugares ocupados`)}">${chairs}<span aria-hidden="true">${table.number}</span><small class="table-occupancy" aria-hidden="true">${occupied}/5</small><span class="table-tooltip" aria-hidden="true">${tooltip(table)}</span></button>`;
    }).join("");
  }

  function renderSummary() {
    const counts = state.tables.reduce((result, table) => {
      const markerStatus = visualStatus(table);
      result[markerStatus] = (result[markerStatus] || 0) + 1;
      return result;
    }, { available: 0, sold: 0, blocked: 0 });
    byId("availableCount").textContent = counts.available;
    byId("soldCount").textContent = counts.sold;
    byId("blockedCount").textContent = counts.blocked;
  }

  function showMessage(message, type = "") {
    pageMessage.textContent = message || "";
    pageMessage.className = `page-message${type ? ` ${type}` : ""}`;
  }

  function downloadFile(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportTickets() {
    const button = byId("exportTickets");
    if (!button || button.disabled) return;
    const originalText = button.textContent;
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const month = date.slice(0, 7);
    button.disabled = true;
    button.textContent = "Gerando...";
    showMessage("");
    try {
      const response = await fetch(`/api/dashboard/vendedores?action=export-tickets&date=${encodeURIComponent(date)}&month=${encodeURIComponent(month)}`, {
        cache: "no-store",
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error("Não foi possível gerar o Excel de ingressos.");
      const disposition = response.headers.get("content-disposition") || "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || `relatorio-ingressos-${month}.xlsx`;
      downloadFile(await response.blob(), fileName);
      button.textContent = "Excel gerado";
      window.setTimeout(() => { button.textContent = originalText; }, 1600);
    } catch (error) {
      showMessage(error.message, "error");
      button.textContent = "Falha ao gerar";
      window.setTimeout(() => { button.textContent = originalText; }, 2200);
    } finally {
      button.disabled = false;
    }
  }

  async function loadTables(options = {}) {
    if (state.loading) return;
    state.loading = true;
    byId("refreshButton").disabled = true;
    if (!options.silent) showMessage("");
    try {
      const response = await fetch(API_URL, { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!response.ok) throw new Error(payload.message || "Não foi possível carregar o mapa de mesas.");
      state.tables = payload.tables || [];
      state.isAdmin = Boolean(payload.isAdmin);
      renderMarkers();
      renderSummary();
      byId("lastUpdated").textContent = `Atualizado às ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
    } catch (error) {
      showMessage(error.message, "error");
      byId("lastUpdated").textContent = "Falha ao atualizar";
    } finally {
      state.loading = false;
      byId("refreshButton").disabled = false;
    }
  }

  function updateParticipantRequirements() {
    document.querySelectorAll("[data-participant-row]").forEach((row) => {
      const active = Boolean(
        row.querySelector(".participant-name").value.trim()
        || row.querySelector(".participant-reservation").value.trim()
        || row.querySelector(".participant-seller").value.trim()
        || row.querySelector(".participant-notes").value.trim()
      );
      row.querySelectorAll(".participant-name, .participant-reservation, .participant-status, .participant-seller").forEach((input) => {
        input.required = active;
      });
    });
  }

  function renderParticipantInputs(entries = []) {
    const container = byId("participantInputs");
    const participants = entries.map(normalizeParticipant);
    const rows = Array.from({ length: Math.max(1, Math.min(5, participants.length || 1)) }, (_, index) => {
      const participant = participants[index] || normalizeParticipant(null);
      return `<div class="participant-row" data-participant-row>
        <label><span>Nome / família</span><input class="participant-input participant-name" maxlength="100" placeholder="Nome ou família" value="${escapeHtml(participant.name)}" autocomplete="off"></label>
        <label><span>Número da reserva</span><input class="participant-input participant-reservation" maxlength="80" placeholder="Ex.: 123456" value="${escapeHtml(participant.reservationNumber)}" autocomplete="off"></label>
        <label><span>Status</span><select class="participant-input participant-status"><option value="blocked"${participant.status === "blocked" ? " selected" : ""}>Bloqueado</option><option value="paid"${participant.status === "paid" ? " selected" : ""}>Pago</option></select></label>
        <label><span>Vendedor</span><input class="participant-input participant-seller" maxlength="100" placeholder="Nome do vendedor" value="${escapeHtml(participant.seller)}" autocomplete="off"></label>
        <label><span>Observações</span><textarea class="participant-input participant-notes" maxlength="500" rows="2" placeholder="Informações desta reserva">${escapeHtml(participant.notes)}</textarea></label>
        <button class="participant-remove" type="button" aria-label="Remover lugar ${index + 1}" title="Remover lugar">×</button>
      </div>`;
    });
    container.innerHTML = rows.join("");
    updateParticipantRequirements();
  }

  function readParticipantRows(includeEmpty = false) {
    const participants = [...document.querySelectorAll("[data-participant-row]")].map((row) => ({
      name: row.querySelector(".participant-name").value.trim(),
      reservationNumber: row.querySelector(".participant-reservation").value.trim(),
      status: row.querySelector(".participant-status").value,
      seller: row.querySelector(".participant-seller").value.trim(),
      notes: row.querySelector(".participant-notes").value.trim()
    }));
    return includeEmpty ? participants : participants.filter((participant) => participant.name || participant.reservationNumber || participant.seller || participant.notes);
  }

  function updateParticipantVisibility() {
    const shared = byId("tableType").value === "shared";
    byId("addParticipant").hidden = !shared || byId("participantInputs").children.length >= 5;
    if (!shared && byId("participantInputs").children.length > 1) {
      renderParticipantInputs(readParticipantRows(true).slice(0, 1));
    }
    updateParticipantRequirements();
  }

  function openTable(number) {
    const table = state.tables.find((item) => item.number === number);
    if (!table) return;
    state.selected = table;
    byId("dialogTableNumber").textContent = table.number;
    byId("dialogEyebrow").textContent = table.canEdit ? "Atualizar mesa" : "Consultar mesa";
    byId("tableType").value = table.tableType || "exclusive";
    renderParticipantInputs(table.participants || []);
    byId("formMessage").textContent = "";

    const inputs = [byId("tableType"), ...document.querySelectorAll(".participant-input, .participant-remove"), byId("addParticipant")];
    inputs.forEach((input) => { input.disabled = !table.canEdit; });
    byId("saveTable").hidden = !table.canEdit;
    byId("readOnlyNotice").hidden = table.canEdit;
    if (!table.canEdit) {
      byId("readOnlyNotice").textContent = "Os 5 lugares desta mesa estão pagos. Somente um administrador pode alterar o registro.";
    }

    const metadata = [];
    if (table.ownerName) metadata.push(`Registrada por ${escapeHtml(table.ownerName)}`);
    if (table.updatedByName && table.updatedByName !== table.ownerName) metadata.push(`Última alteração por ${escapeHtml(table.updatedByName)}`);
    if (table.updatedAt) metadata.push(new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(table.updatedAt)));
    byId("recordMetadata").innerHTML = metadata.join(" · ");
    byId("recordMetadata").hidden = !metadata.length;
    updateParticipantVisibility();
    dialog.showModal();
  }

  async function saveTable(event) {
    event.preventDefault();
    if (!state.selected?.canEdit) return;
    const tableType = byId("tableType").value;
    const participants = readParticipantRows();
    const incompleteParticipant = participants.find((participant) => !participant.name || !participant.reservationNumber || !participant.status || !participant.seller);
    if (incompleteParticipant) {
      byId("formMessage").textContent = "Preencha nome/família, número da reserva, status e vendedor em todos os lugares informados.";
      const incompleteRow = [...document.querySelectorAll("[data-participant-row]")].find((row) => {
        const name = row.querySelector(".participant-name").value.trim();
        const reservation = row.querySelector(".participant-reservation").value.trim();
        const seller = row.querySelector(".participant-seller").value.trim();
        return (name || reservation || seller || row.querySelector(".participant-notes").value.trim()) && (!name || !reservation || !seller);
      });
      const missingSelector = !incompleteParticipant.name ? ".participant-name" : !incompleteParticipant.reservationNumber ? ".participant-reservation" : ".participant-seller";
      incompleteRow?.querySelector(missingSelector)?.focus();
      return;
    }

    const button = byId("saveTable");
    button.disabled = true;
    button.textContent = "Salvando…";
    byId("formMessage").textContent = "";
    try {
      const response = await fetch(API_URL, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tableNumber: state.selected.number,
          tableType,
          participants,
          expectedUpdatedAt: state.selected.updatedAt
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Não foi possível salvar a mesa.");
      const tableIndex = state.tables.findIndex((table) => table.number === payload.table?.number);
      if (tableIndex >= 0 && payload.table) {
        state.tables[tableIndex] = payload.table;
        renderMarkers();
        renderSummary();
      }
      dialog.close();
      showMessage(payload.message, "success");
      await loadTables({ silent: true });
    } catch (error) {
      if (/alterada por outra pessoa/i.test(error.message)) {
        dialog.close();
        await loadTables({ silent: true });
        showMessage(error.message, "error");
      } else {
        byId("formMessage").textContent = error.message;
      }
    } finally {
      button.disabled = false;
      button.textContent = "Salvar controle";
    }
  }

  markers.addEventListener("click", (event) => {
    const marker = event.target.closest("[data-table-number]");
    if (marker) openTable(Number(marker.dataset.tableNumber));
  });
  form.addEventListener("submit", saveTable);
  byId("tableType").addEventListener("change", updateParticipantVisibility);
  byId("addParticipant").addEventListener("click", () => {
    const participants = readParticipantRows(true);
    if (byId("participantInputs").children.length < 5) { participants.push(normalizeParticipant(null)); renderParticipantInputs(participants); updateParticipantVisibility(); }
  });
  byId("participantInputs").addEventListener("click", (event) => {
    const removeButton = event.target.closest(".participant-remove");
    if (!removeButton) return;
    const rows = [...document.querySelectorAll("[data-participant-row]")];
    const index = rows.indexOf(removeButton.closest("[data-participant-row]"));
    const participants = readParticipantRows(true);
    if (rows.length === 1) renderParticipantInputs([]);
    else {
      participants.splice(index, 1);
      renderParticipantInputs(participants);
    }
    updateParticipantVisibility();
  });
  byId("participantInputs").addEventListener("input", updateParticipantRequirements);
  byId("closeDialog").addEventListener("click", () => dialog.close());
  byId("cancelDialog").addEventListener("click", () => dialog.close());
  byId("refreshButton").addEventListener("click", () => loadTables());
  byId("exportTickets").addEventListener("click", exportTickets);

  Promise.resolve(window.suedsManagerAuthReady)
    .then(loadTables)
    .catch((error) => showMessage(error.message, "error"));
  window.setInterval(() => {
    if (!dialog.open && document.visibilityState === "visible") loadTables({ silent: true });
  }, 30000);
})();
