(function setupAnnouncements() {
  const list = document.getElementById("announcementsList");
  const filters = document.getElementById("departmentFilters");
  const message = document.getElementById("pageMessage");
  const refreshButton = document.getElementById("refreshButton");
  const readersDialog = document.getElementById("readersDialog");
  let announcements = [];
  let currentDepartment = "Todos";

  function notifyPortal(unreadCount) {
    if (window.parent !== window) window.parent.postMessage({ type: "sueds:announcement-status", unreadCount }, window.location.origin);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
  }

  function mediaMarkup(item) {
    if (!item.mediaUrl) return "";
    const url = escapeHtml(item.mediaUrl);
    if (item.mediaType === "image") return `<img class="announcement-media" src="${url}" alt="Imagem do comunicado ${escapeHtml(item.title)}" loading="lazy">`;
    if (item.mediaType === "video") return `<video class="announcement-media" src="${url}" controls preload="metadata">Seu navegador não consegue reproduzir este vídeo.</video><a class="media-link" href="${url}" target="_blank" rel="noopener">Abrir vídeo em outra janela ↗</a>`;
    return "";
  }

  function renderFilters(departments) {
    const options = ["Todos", ...departments];
    filters.innerHTML = options.map((department) => `<button class="filter-button${department === currentDepartment ? " active" : ""}" type="button" data-department="${escapeHtml(department)}" aria-pressed="${department === currentDepartment}">${escapeHtml(department)}</button>`).join("");
  }

  function render() {
    const visible = announcements.filter((item) => currentDepartment === "Todos" || item.department === currentDepartment);
    if (!visible.length) {
      list.innerHTML = '<div class="empty-state"><strong>Nenhum comunicado nesta seção.</strong><br>Escolha outro departamento ou atualize a página.</div>';
      return;
    }
    list.innerHTML = visible.map((item) => `
      <article class="announcement-card ${item.read ? "read" : "unread"}" data-announcement-id="${escapeHtml(item.id)}">
        <div class="announcement-content">
          <div class="announcement-meta"><span class="department-badge">${escapeHtml(item.department)}</span><span>${escapeHtml(formatDate(item.publishedAt))}</span><span>por ${escapeHtml(item.author)}</span></div>
          <h2>${escapeHtml(item.title)}</h2>
          <p class="announcement-body">${escapeHtml(item.body)}</p>
        </div>
        ${mediaMarkup(item)}
        <div class="announcement-actions">
          <div class="read-control">
          <button class="read-button${item.read ? " confirmed" : ""}" type="button" ${item.read ? "disabled" : ""} aria-label="${item.read ? "Leitura confirmada" : "Confirmar que li este comunicado"}">
            <span class="thumb" aria-hidden="true">👍</span><span>${item.read ? "Leitura confirmada" : "Já li — confirmar leitura"}</span>
          </button>
          <button class="readers-count-button${item.read ? " confirmed" : ""}" type="button" data-readers-id="${escapeHtml(item.id)}" aria-haspopup="dialog" aria-controls="readersDialog" aria-label="Ver quem confirmou a leitura: ${Number(item.readCount) || 0} pessoas" title="Ver quem confirmou a leitura">${Number(item.readCount) || 0}</button>
          </div>
        </div>
      </article>`).join("");
  }

  async function load() {
    refreshButton.disabled = true;
    message.className = "page-message";
    message.textContent = "Carregando comunicados…";
    try {
      const response = await fetch("/api/portal/announcements", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível carregar os comunicados.");
      announcements = payload.announcements || [];
      renderFilters(payload.departments || []);
      render();
      const pending = announcements.filter((item) => !item.read).length;
      notifyPortal(pending);
      message.textContent = pending ? `${pending} comunicado${pending === 1 ? " aguarda" : "s aguardam"} sua confirmação de leitura.` : "Você está em dia com todos os comunicados.";
      if (!pending) message.classList.add("success");
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("error");
      list.innerHTML = "";
    } finally {
      refreshButton.disabled = false;
    }
  }

  filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-department]");
    if (!button) return;
    currentDepartment = button.dataset.department;
    renderFilters([...new Set(announcements.map((item) => item.department))]);
    render();
  });

  list.addEventListener("click", async (event) => {
    const readersButton = event.target.closest("[data-readers-id]");
    if (readersButton) {
      const item = announcements.find((announcement) => announcement.id === readersButton.dataset.readersId);
      if (!item) return;
      const readers = item.readers || [];
      document.getElementById("readersAnnouncementTitle").textContent = item.title;
      document.getElementById("readersSummary").textContent = `${readers.length} ${readers.length === 1 ? "pessoa confirmou" : "pessoas confirmaram"} a leitura.`;
      document.getElementById("readersDialogList").innerHTML = readers.length
        ? readers.map((reader) => `<li><span aria-hidden="true">👍</span><span>${escapeHtml(reader.name)}</span></li>`).join("")
        : '<li class="no-readers">Ninguém confirmou a leitura ainda.</li>';
      readersDialog.showModal();
      return;
    }
    const button = event.target.closest(".read-button:not(.confirmed)");
    if (!button) return;
    const card = button.closest("[data-announcement-id]");
    button.disabled = true;
    try {
      const response = await fetch("/api/portal/announcements", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "read", announcementId: card.dataset.announcementId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível confirmar a leitura.");
      const item = announcements.find((announcement) => announcement.id === card.dataset.announcementId);
      if (item) {
        item.read = true;
        item.readCount = payload.readCount ?? item.readCount;
        item.readers = payload.readers ?? item.readers;
      }
      render();
      list.querySelector(`[data-readers-id="${CSS.escape(card.dataset.announcementId)}"]`)?.focus();
      const pending = announcements.filter((announcement) => !announcement.read).length;
      notifyPortal(pending);
      message.textContent = pending ? `${pending} comunicado${pending === 1 ? " ainda aguarda" : "s ainda aguardam"} sua confirmação.` : "Leitura confirmada. Você está em dia com todos os comunicados.";
      message.className = "page-message success";
    } catch (error) {
      button.disabled = false;
      message.textContent = error.message;
      message.className = "page-message error";
    }
  });

  refreshButton.addEventListener("click", load);
  document.getElementById("closeReadersDialog").addEventListener("click", () => readersDialog.close());
  readersDialog.addEventListener("click", (event) => {
    if (event.target !== readersDialog) return;
    const box = readersDialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) readersDialog.close();
  });
  Promise.resolve(window.suedsManagerAuthReady).then(load);
})();
