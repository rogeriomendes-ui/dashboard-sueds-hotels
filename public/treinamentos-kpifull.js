(function setupKpiFullManual() {
  const modules = window.SUEDS_MANUAL_MODULES || [];
  const nav = document.getElementById("moduleNav");
  const intro = document.getElementById("moduleIntro");
  const list = document.getElementById("activityList");
  const search = document.getElementById("manualSearch");
  const clear = document.getElementById("clearSearch");
  const editor = document.getElementById("activityEditor");
  const editForm = document.getElementById("activityEditForm");
  let canEdit = false;
  let editingActivity = null;
  let removeVideoRequested = false;
  let savingActivity = false;
  let activeId = modules[0]?.id || "";

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
  }

  function videoSource(value) {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return null;
      const host = url.hostname.toLowerCase();
      let id = "";
      if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
        id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id || "")) return { type: "embed", url: `https://www.youtube-nocookie.com/embed/${id}` };
      }
      if (host === "youtu.be") {
        id = url.pathname.split("/")[1];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id || "")) return { type: "embed", url: `https://www.youtube-nocookie.com/embed/${id}` };
      }
      if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
        id = url.pathname.match(/\/(?:video\/)?(\d+)/)?.[1];
        if (id) return { type: "embed", url: `https://player.vimeo.com/video/${id}` };
      }
      if (host === "drive.google.com") {
        id = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1];
        if (id) return { type: "embed", url: `https://drive.google.com/file/d/${id}/preview` };
      }
      if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) return { type: "file", url: url.href };
    } catch (_) { /* URL inválida. */ }
    return null;
  }

  function videoMarkup(activity) {
    const source = videoSource(activity.videoPlaybackUrl || activity.videoUrl);
    if (!source) return "";
    const title = activity.videoTitle || `Vídeo de ${activity.title}`;
    const player = source.type === "file"
      ? `<video controls preload="metadata" src="${escapeHtml(source.url)}">Seu navegador não reproduz este vídeo.</video>`
      : `<iframe src="${escapeHtml(source.url)}" title="${escapeHtml(title)}" loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    return `<section class="training-video"><h3>${escapeHtml(title)}</h3>${player}</section>`;
  }

  async function uploadVideo(file, activityId) {
    const prepared = await fetch("/api/knowledge?action=kpi-upload", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ activityId, type: file.type, size: file.size }) });
    const ticket = await prepared.json();
    if (!prepared.ok) throw new Error(ticket.message || "Não foi possível preparar o envio do vídeo.");
    const progress = document.getElementById("videoUploadProgress");
    progress.hidden = false;
    progress.textContent = "Enviando vídeo… 0%";
    await new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", ticket.signedUrl);
      request.upload.onprogress = (event) => { if (event.lengthComputable) progress.textContent = `Enviando vídeo… ${Math.round(event.loaded / event.total * 100)}%`; };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) return resolve();
        let message = "O envio do vídeo falhou. Verifique o tamanho do arquivo e tente novamente.";
        try { const error = JSON.parse(request.responseText); message = error.message || error.error || message; } catch (_) { /* Resposta sem JSON. */ }
        reject(new Error(message));
      };
      request.onerror = () => reject(new Error("Não foi possível enviar o vídeo. Verifique sua conexão e tente novamente."));
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      request.send(form);
    });
    progress.textContent = "Vídeo enviado. Salvando atividade…";
    return ticket.path;
  }

  function activityCard(activity, index) {
    const steps = activity.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
    const attention = activity.attention ? `<aside class="attention"><b>!</b><p><strong>Atenção</strong>${escapeHtml(activity.attention)}</p></aside>` : "";
    const image = activity.image ? `<figure><img src="${escapeHtml(activity.image)}" alt="${escapeHtml(activity.imageAlt || activity.title)}"><figcaption>Referência visual da tela no KPIFull</figcaption></figure>` : "";
    return `<article class="activity-card ${index === 0 ? "open" : ""}" id="${escapeHtml(activity.id)}">
      <button class="activity-toggle" type="button" aria-expanded="${index === 0}"><span class="activity-number">${String(index + 1).padStart(2, "0")}</span><span><small>ATIVIDADE</small><strong>${escapeHtml(activity.title)}</strong><em>${escapeHtml(activity.summary)}</em></span><b>${index === 0 ? "−" : "+"}</b></button>
      ${canEdit ? `<button class="edit-activity" type="button" data-edit="${escapeHtml(activity.id)}">Editar atividade</button>` : ""}
      <div class="activity-body" ${index === 0 ? "" : "hidden"}><div class="instruction-grid"><section class="steps"><h3>Como fazer</h3><ol>${steps}</ol></section>${attention}</div>${image}
      ${videoMarkup(activity)}
      <details><summary>Transcrição e materiais complementares</summary><p>Este espaço receberá a transcrição do vídeo, arquivos de apoio e links relacionados à atividade.</p></details></div></article>`;
  }

  function renderNav() {
    nav.innerHTML = modules.map((module, index) => `<button type="button" data-module="${escapeHtml(module.id)}" class="${module.id === activeId ? "active" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><b>${escapeHtml(module.shortTitle)}</b><small>${module.activities.length} atividades</small></button>`).join("");
  }

  function render() {
    const query = search.value.trim().toLocaleLowerCase("pt-BR");
    clear.hidden = !query;
    let activities = [];
    if (query) {
      activities = modules.flatMap((module) => module.activities.filter((activity) => `${module.title} ${activity.title} ${activity.summary} ${activity.steps.join(" ")}`.toLocaleLowerCase("pt-BR").includes(query)));
      intro.innerHTML = `<small>BUSCA</small><h2>${activities.length} resultado${activities.length === 1 ? "" : "s"}</h2><p>Resultados para “${escapeHtml(search.value)}” em todos os módulos.</p>`;
    } else {
      const module = modules.find((item) => item.id === activeId) || modules[0];
      activities = module?.activities || [];
      intro.innerHTML = `<small>${escapeHtml(module?.code)}</small><h2>${escapeHtml(module?.title)}</h2><p>${escapeHtml(module?.description)}</p>`;
    }
    list.innerHTML = activities.length ? activities.map(activityCard).join("") : `<div class="empty"><b>⌕</b><h3>Nenhuma atividade encontrada</h3><p>Tente buscar por outro termo.</p></div>`;
    renderNav();
  }

  nav.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-module]");
    if (!button) return;
    activeId = button.dataset.module;
    search.value = "";
    render();
    window.scrollTo({ top: document.querySelector(".manual-workspace").offsetTop, behavior: "smooth" });
  });
  list.addEventListener("click", (event) => {
    const edit = event.target.closest("button[data-edit]");
    if (edit) {
      editingActivity = modules.flatMap((module) => module.activities).find((activity) => activity.id === edit.dataset.edit);
      if (!editingActivity) return;
      for (const key of ["title", "summary", "attention", "image", "imageAlt", "videoUrl", "videoTitle"]) editForm.elements[key].value = editingActivity[key] || "";
      editForm.elements.videoFile.value = "";
      editForm.elements.steps.value = editingActivity.steps.join("\n");
      document.getElementById("editNotice").hidden = true;
      document.getElementById("videoRemovalNote").hidden = true;
      document.getElementById("videoUploadProgress").hidden = true;
      const currentFile = document.getElementById("currentVideoFile");
      currentFile.textContent = editingActivity.videoPath ? `Arquivo atual: ${editingActivity.videoFileName || "vídeo enviado"}` : "";
      currentFile.hidden = !editingActivity.videoPath;
      removeVideoRequested = false;
      document.getElementById("removeActivityVideo").disabled = !(editingActivity.videoUrl || editingActivity.videoPath);
      editor.showModal();
      return;
    }
    const toggle = event.target.closest(".activity-toggle");
    if (!toggle) return;
    const card = toggle.closest(".activity-card");
    const body = card.querySelector(".activity-body");
    const open = body.hidden;
    body.hidden = !open;
    card.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.lastElementChild.textContent = open ? "−" : "+";
  });
  search.addEventListener("input", render);
  clear.addEventListener("click", () => { search.value = ""; search.focus(); render(); });
  document.getElementById("cancelActivityEdit").onclick = () => { if (!savingActivity) editor.close(); };
  editor.addEventListener("cancel", (event) => { if (savingActivity) event.preventDefault(); });
  document.getElementById("removeActivityVideo").onclick = () => {
    removeVideoRequested = true;
    editForm.elements.videoFile.value = "";
    editForm.elements.videoUrl.value = "";
    editForm.elements.videoTitle.value = "";
    document.getElementById("currentVideoFile").hidden = true;
    document.getElementById("videoRemovalNote").hidden = false;
    document.getElementById("removeActivityVideo").disabled = true;
  };
  editForm.elements.videoFile.addEventListener("change", () => {
    if (!editForm.elements.videoFile.files.length) return;
    editForm.elements.videoUrl.value = "";
    removeVideoRequested = false;
    document.getElementById("videoRemovalNote").hidden = true;
    document.getElementById("removeActivityVideo").disabled = false;
  });
  editForm.elements.videoUrl.addEventListener("input", () => {
    if (editForm.elements.videoUrl.value.trim()) { editForm.elements.videoFile.value = ""; removeVideoRequested = false; }
    document.getElementById("videoRemovalNote").hidden = true;
    document.getElementById("removeActivityVideo").disabled = !(editForm.elements.videoUrl.value.trim() || editingActivity?.videoPath);
  });
  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = Object.fromEntries(["title", "summary", "attention", "image", "imageAlt", "videoUrl", "videoTitle"].map((key) => [key, editForm.elements[key].value.trim()]));
    content.steps = editForm.elements.steps.value.split("\n").map((step) => step.trim()).filter(Boolean);
    const file = editForm.elements.videoFile.files[0];
    const notice = document.getElementById("editNotice");
    const saveButton = editForm.querySelector('button[type="submit"]');
    const cancelButton = document.getElementById("cancelActivityEdit");
    try {
      savingActivity = true;
      saveButton.disabled = true;
      cancelButton.disabled = true;
      notice.hidden = true;
      if (file && (!["video/mp4", "video/webm", "video/ogg"].includes(file.type) || file.size > 500 * 1024 * 1024 || !file.size)) throw new Error("Escolha um vídeo MP4, WebM ou OGG de até 500 MB.");
      if (content.videoUrl && !videoSource(content.videoUrl)) throw new Error("Use um link HTTPS válido do YouTube, Vimeo, Google Drive ou de um arquivo MP4, WebM ou OGG.");
      content.videoPath = removeVideoRequested || content.videoUrl ? "" : editingActivity.videoPath || "";
      content.videoFileName = content.videoPath ? editingActivity.videoFileName || "" : "";
      if (file) {
        content.videoPath = await uploadVideo(file, editingActivity.id);
        content.videoFileName = file.name;
        content.videoUrl = "";
        if (!content.videoTitle) content.videoTitle = file.name.replace(/\.[^.]+$/, "");
      }
      const response = await fetch("/api/knowledge?action=kpi", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ activityId: editingActivity.id, content }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Não foi possível salvar.");
      Object.assign(editingActivity, content, { videoPlaybackUrl: result.videoPlaybackUrl || "" });
      editor.close();
      render();
    } catch (error) { notice.textContent = error.message; notice.hidden = false; }
    finally { savingActivity = false; saveButton.disabled = false; cancelButton.disabled = false; }
  });
  render();
  window.suedsManagerAuthReady.then(async () => {
    const response = await fetch("/api/knowledge?action=kpi", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    canEdit = Boolean(result.canEdit);
    for (const edit of result.edits || []) {
      const activity = modules.flatMap((module) => module.activities).find((item) => item.id === edit.activity_id);
      if (activity) Object.assign(activity, edit.content);
    }
    render();
  }).catch(() => {});
})();
