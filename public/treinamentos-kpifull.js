(function setupKpiFullManual() {
  const modules = window.SUEDS_MANUAL_MODULES || [];
  const nav = document.getElementById("moduleNav");
  const intro = document.getElementById("moduleIntro");
  const list = document.getElementById("activityList");
  const search = document.getElementById("manualSearch");
  const clear = document.getElementById("clearSearch");
  let activeId = modules[0]?.id || "";

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
  }

  function activityCard(activity, index) {
    const steps = activity.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
    const attention = activity.attention ? `<aside class="attention"><b>!</b><p><strong>Atenção</strong>${escapeHtml(activity.attention)}</p></aside>` : "";
    const image = activity.image ? `<figure><img src="${escapeHtml(activity.image)}" alt="${escapeHtml(activity.imageAlt || activity.title)}"><figcaption>Referência visual da tela no KPIFull</figcaption></figure>` : "";
    return `<article class="activity-card ${index === 0 ? "open" : ""}" id="${escapeHtml(activity.id)}">
      <button class="activity-toggle" type="button" aria-expanded="${index === 0}"><span class="activity-number">${String(index + 1).padStart(2, "0")}</span><span><small>ATIVIDADE</small><strong>${escapeHtml(activity.title)}</strong><em>${escapeHtml(activity.summary)}</em></span><b>${index === 0 ? "−" : "+"}</b></button>
      <div class="activity-body" ${index === 0 ? "" : "hidden"}><div class="instruction-grid"><section class="steps"><h3>Como fazer</h3><ol>${steps}</ol></section>${attention}</div>${image}
      <section class="video-placeholder"><span>▶</span><div><strong>Vídeo com áudio</strong><small>Espaço preparado para gravação de tela com explicação narrada</small></div><b>EM PRODUÇÃO</b></section>
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
  render();
})();
