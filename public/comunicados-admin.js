(function setupAnnouncementsAdmin() {
  const form = document.getElementById("announcementForm");
  const department = document.getElementById("announcementDepartment");
  const fileInput = document.getElementById("announcementFile");
  const mediaUrl = document.getElementById("announcementMediaUrl");
  const mediaTypeField = document.getElementById("mediaTypeField");
  const mediaType = document.getElementById("announcementMediaType");
  const publishButton = document.getElementById("publishButton");
  const formMessage = document.getElementById("formMessage");
  const pageMessage = document.getElementById("pageMessage");
  const list = document.getElementById("adminAnnouncementsList");
  const refreshButton = document.getElementById("refreshButton");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  }

  function fileAsPayload(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      if (file.size > 4 * 1024 * 1024) return reject(new Error("O arquivo deve ter no máximo 4 MB. Para vídeos maiores, use um link."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
      reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
      reader.readAsDataURL(file);
    });
  }

  function renderHistory(announcements) {
    if (!announcements.length) {
      list.innerHTML = '<div class="empty-state">Nenhum comunicado foi publicado ainda.</div>';
      return;
    }
    list.innerHTML = announcements.map((item) => {
      const readers = item.readers || [];
      return `<details class="history-card">
        <summary>
          <span class="history-title"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.department)} · ${escapeHtml(formatDate(item.publishedAt))}</small></span>
          <span class="read-count">👍 ${readers.length} leitura${readers.length === 1 ? "" : "s"}</span>
        </summary>
        <ul class="readers-list">${readers.length ? readers.map((reader) => `<li class="reader-row"><strong>${escapeHtml(reader.name || "Colaborador")}</strong><span>${escapeHtml(reader.email)}</span><time datetime="${escapeHtml(reader.readAt)}">${escapeHtml(formatDate(reader.readAt))}</time></li>`).join("") : '<li class="no-readers">Nenhum colaborador confirmou a leitura até o momento.</li>'}</ul>
      </details>`;
    }).join("");
  }

  async function load() {
    refreshButton.disabled = true;
    pageMessage.className = "page-message";
    pageMessage.textContent = "Carregando histórico…";
    try {
      const response = await fetch("/api/portal/announcements?admin=1", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível carregar o histórico.");
      if (!payload.canManage) throw new Error("Sem permissão para incluir comunicados.");
      department.innerHTML = (payload.departments || []).map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
      renderHistory(payload.announcements || []);
      pageMessage.textContent = `${(payload.announcements || []).length} comunicado${(payload.announcements || []).length === 1 ? " publicado" : "s publicados"}. Abra um item para ver os colaboradores.`;
    } catch (error) {
      pageMessage.textContent = error.message;
      pageMessage.classList.add("error");
      list.innerHTML = "";
    } finally {
      refreshButton.disabled = false;
    }
  }

  function syncMediaFields() {
    const hasFile = Boolean(fileInput.files?.length);
    mediaUrl.disabled = hasFile;
    mediaTypeField.hidden = hasFile || !mediaUrl.value.trim();
  }

  fileInput.addEventListener("change", syncMediaFields);
  mediaUrl.addEventListener("input", syncMediaFields);
  refreshButton.addEventListener("click", load);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    publishButton.disabled = true;
    formMessage.className = "form-message";
    formMessage.textContent = "Publicando comunicado…";
    try {
      const file = await fileAsPayload(fileInput.files?.[0]);
      const response = await fetch("/api/portal/announcements", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: document.getElementById("announcementTitle").value,
          body: document.getElementById("announcementBody").value,
          department: department.value,
          file,
          mediaUrl: file ? "" : mediaUrl.value,
          mediaType: mediaType.value
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível publicar o comunicado.");
      form.reset();
      syncMediaFields();
      formMessage.textContent = payload.message;
      formMessage.classList.add("success");
      await load();
    } catch (error) {
      formMessage.textContent = error.message;
      formMessage.classList.add("error");
    } finally {
      publishButton.disabled = false;
    }
  });

  syncMediaFields();
  Promise.resolve(window.suedsManagerAuthReady).then(() => {
    if (!window.suedsPortalAccess?.inclusao_comunicados) {
      document.body.innerHTML = '<main class="announcements-page"><div class="empty-state"><strong>Acesso restrito.</strong><br>Este usuário não possui permissão para incluir comunicados.</div></main>';
      return;
    }
    load();
  });
})();
