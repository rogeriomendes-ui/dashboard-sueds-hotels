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
    target.innerHTML = activeModules.map((module, index) => {
      const kpi = module.slug === 'kpi';
      const count = published.filter((doc) => doc.module === module.slug).length;
      const href = kpi ? '/Treinamentos/KPIFull' : `/Treinamentos?module=${encodeURIComponent(module.slug)}#module-content`;
      const status = kpi || count ? 'DISPONÍVEL' : 'EM PREPARAÇÃO';
      const action = kpi ? 'Abrir manual' : count ? 'Ver treinamentos' : 'Abrir módulo';
      const edit = canEdit ? `<a class="catalog-edit" href="${kpi ? '/Treinamentos/KPIFull' : `/Treinamentos/Admin?module=${encodeURIComponent(module.slug)}`}">${kpi ? 'Editar treinamento' : 'Adicionar treinamento'}</a>` : '';
      const popLink = module.pop ? `<a class="pop-link" href="/treinamentos-pop.html?module=${encodeURIComponent(module.slug)}">Visualizar POP e confirmar leitura →</a>` : '';
      return `<article class="knowledge-card available"><span class="card-number">${String(index + 1).padStart(2,'0')}</span><div class="card-icon" aria-hidden="true">${escapeHtml(module.name?.[0] || 'M')}</div><div class="card-copy"><span class="card-status">${status}</span><h3>${escapeHtml(module.name)}</h3><p>${escapeHtml(module.description || (count ? `${count} treinamento${count === 1 ? '' : 's'} publicado${count === 1 ? '' : 's'}` : 'Os treinamentos serão publicados em breve.'))}</p></div><a class="card-action" href="${href}">${action} <b aria-hidden="true">→</b></a>${popLink}${edit}</article>`;
    }).join('');
    const selected = activeModules.find((module) => module.slug === initialModule);
    if (!selected) return;
    const items = published.filter((doc) => doc.module === selected.slug);
    panel.hidden = false;
    panel.innerHTML = `<div class="module-heading"><p class="eyebrow">MÓDULO</p><h2>${escapeHtml(selected.name)}</h2><p>${escapeHtml(selected.description || '')}</p></div>${items.length ? `<div class="module-items">${items.map((doc) => `<article><div><h3>${escapeHtml(doc.title)}</h3><p>${escapeHtml(doc.versions?.[0]?.summary || '')}</p></div><a href="/treinamentos-conteudo.html?id=${encodeURIComponent(doc.id)}">Abrir treinamento →</a>${canEdit ? `<a href="/Treinamentos/Admin?edit=${encodeURIComponent(doc.id)}">Editar</a>` : ''}</article>`).join('')}</div>` : `<p class="module-empty">Ainda não há treinamentos publicados neste módulo.</p>${canEdit ? `<a class="module-add" href="/Treinamentos/Admin?module=${encodeURIComponent(selected.slug)}">Adicionar treinamento</a>` : ''}`}`;
  }).catch(() => {});
})();
