(() => {
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initialModule = new URLSearchParams(location.search).get('module');
  window.suedsManagerAuthReady.then(async () => {
    const [modulesResponse, documentsResponse] = await Promise.all([
      fetch('/api/knowledge?action=modules', { credentials:'same-origin', cache:'no-store' }),
      fetch('/api/knowledge', { credentials:'same-origin', cache:'no-store' })
    ]);
    if (!modulesResponse.ok || !documentsResponse.ok) return;
    const { modules = [] } = await modulesResponse.json();
    const { documents = [], canEdit = false } = await documentsResponse.json();
    if (!canEdit) document.querySelector('.editor-card')?.remove();
    const published = documents.filter((doc) => doc.status === 'published');
    const activeModules = modules.filter((module) => module.active);
    const target = document.getElementById('published-knowledge');
    const panel = document.getElementById('module-content');
    const search = document.getElementById('knowledge-search');
    const statusFilter = document.getElementById('knowledge-status');
    const renderCards = () => {
      const query = search.value.trim().toLocaleLowerCase('pt-BR');
      const requestedStatus = statusFilter.value;
      const visibleModules = activeModules.filter((module) => {
        const available = module.slug === 'kpi' || published.some((doc) => doc.module === module.slug);
        if (requestedStatus === 'available' && !available) return false;
        if (requestedStatus === 'preparing' && available) return false;
        const documentText = published.filter((doc) => doc.module === module.slug).map((doc) => `${doc.title} ${doc.versions?.[0]?.summary || ''}`).join(' ');
        return !query || `${module.name} ${module.description || ''} ${documentText}`.toLocaleLowerCase('pt-BR').includes(query);
      });
      target.innerHTML = visibleModules.length ? visibleModules.map((module) => {
      const index = activeModules.indexOf(module);
      const kpi = module.slug === 'kpi';
      const count = published.filter((doc) => doc.module === module.slug).length;
      const href = kpi ? '/Treinamentos/KPIFull' : `/Treinamentos?module=${encodeURIComponent(module.slug)}#module-content`;
      const available = kpi || count;
      const status = available ? 'DISPONÍVEL' : 'EM PREPARAÇÃO';
      const description = module.description || (count ? `${count} treinamento${count === 1 ? '' : 's'} publicado${count === 1 ? '' : 's'}` : 'Os treinamentos serão publicados em breve.');
      const popAction = module.pop
        ? `<div class="module-pop"><a href="/treinamentos-pop.html?module=${encodeURIComponent(module.slug)}"><span aria-hidden="true">▤</span>POP</a><small>Procedimento Operacional Padrão</small></div>`
        : `<div class="module-pop-empty" aria-hidden="true"></div>`;
      return `<article class="knowledge-card ${available ? 'available' : 'coming-soon'}"><span class="card-number">${String(index + 1).padStart(2,'0')}</span><div class="card-module-heading"><div class="card-icon" aria-hidden="true">${escapeHtml(module.icon || '🏨')}</div><div><span class="card-status">${status}</span><h3>${escapeHtml(module.name)}</h3></div></div><p class="card-description">${escapeHtml(description)}</p><div class="card-actions">${popAction}<a class="card-action" href="${href}">Acessar treinamento <b aria-hidden="true">→</b></a></div></article>`;
      }).join('') : '<p class="catalog-empty">Nenhum módulo ou treinamento encontrado.</p>';
    };
    renderCards();
    search.addEventListener('input', renderCards);
    statusFilter.addEventListener('change', renderCards);
    const selected = activeModules.find((module) => module.slug === initialModule);
    if (!selected) return;
    const items = published.filter((doc) => doc.module === selected.slug);
    panel.hidden = false;
    panel.innerHTML = `<div class="module-heading"><p class="eyebrow">MÓDULO</p><h2>${escapeHtml(selected.name)}</h2><p>${escapeHtml(selected.description || '')}</p></div>${items.length ? `<div class="module-items">${items.map((doc) => `<article><div><h3>${escapeHtml(doc.title)}</h3><p>${escapeHtml(doc.versions?.[0]?.summary || '')}</p></div><a href="/treinamentos-conteudo.html?id=${encodeURIComponent(doc.id)}">Abrir treinamento →</a>${canEdit ? `<a href="/Treinamentos/Publicar?edit=${encodeURIComponent(doc.id)}">Editar</a>` : ''}</article>`).join('')}</div>` : `<p class="module-empty">Ainda não há treinamentos publicados neste módulo.</p>${canEdit ? `<a class="module-add" href="/Treinamentos/Publicar?module=${encodeURIComponent(selected.slug)}">Adicionar treinamento</a>` : ''}`}`;
  }).catch(() => {});
})();
