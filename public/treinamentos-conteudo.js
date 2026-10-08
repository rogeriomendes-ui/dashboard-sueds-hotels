(() => {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const moduleSlug = params.get('module');
  const text = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function markdown(source) { return String(source || '').split(/\n\s*\n/).map((block) => { const lines=block.split('\n'); if(/^#{1,3} /.test(lines[0])) { const level=lines[0].match(/^#+/)[0].length; return `<h${level}>${text(lines[0].slice(level+1))}</h${level}>`; } if(lines.every((line)=>/^[-*] /.test(line))) return `<ul>${lines.map((line)=>`<li>${text(line.slice(2))}</li>`).join('')}</ul>`; return `<p>${lines.map(text).join('<br>')}</p>`; }).join(''); }
  window.suedsManagerAuthReady.then(async()=>{
    const response = await fetch('/api/knowledge', { credentials:'same-origin', cache:'no-store' });
    if (!response.ok) throw new Error('Não foi possível carregar o treinamento.');
    const result = await response.json();
    const readerTitle = document.getElementById('reader-title');
    const readerSummary = document.getElementById('reader-summary');
    const readerContent = document.getElementById('reader-content');
    if (moduleSlug) {
      const modulesResponse = await fetch('/api/knowledge?action=modules', { credentials:'same-origin', cache:'no-store' });
      const modules = modulesResponse.ok ? (await modulesResponse.json()).modules || [] : [];
      const module = modules.find((item) => item.slug === moduleSlug);
      const documents = (result.documents || []).filter((item) => item.status === 'published' && item.module === moduleSlug);
      document.title = `${module?.name || 'Treinamentos'} | Centro de Conhecimentos Sueds`;
      readerTitle.textContent = module?.name || 'Treinamentos';
      readerSummary.textContent = module?.description || 'Conteúdos disponíveis nesta área.';
      readerContent.className = 'reader-documents';
      readerContent.innerHTML = documents.length ? documents.map((doc) => {
        const version = doc.versions?.find((item) => item.version === doc.published_version) || doc.versions?.[0] || {};
        return `<article class="reader-document"><div><h2>${text(doc.title)}</h2><p>${text(version.summary || '')}</p></div><a href="/treinamentos-conteudo.html?id=${encodeURIComponent(doc.id)}">Abrir treinamento</a></article>`;
      }).join('') : '<p>Nenhum treinamento publicado nesta área.</p>';
      return;
    }
    const doc = (result.documents || []).find((item) => item.id === id && item.status === 'published');
    if (!doc) throw new Error('Treinamento não encontrado.');
    const version = doc.versions?.find((item) => item.version === doc.published_version) || doc.versions?.[0] || {};
    document.title = `${doc.title} | Centro de Conhecimentos Sueds`;
    readerTitle.textContent = doc.title;
    readerSummary.textContent = version.summary || '';
    readerContent.innerHTML = markdown(version.content_markdown);
    if (result.canEdit) { const edit = document.getElementById('reader-edit'); edit.href = `/Treinamentos/Publicar?edit=${encodeURIComponent(doc.id)}`; edit.hidden = false; }
    const media = document.getElementById('reader-media');
    for (const item of doc.metadata?.media || []) { if (!/^https:\/\//.test(item.url)) continue; const element = document.createElement(item.type === 'video' ? 'video' : 'img'); element.src = item.url; if (item.type === 'video') element.controls = true; else element.alt = item.caption || doc.title; media.append(element); }
  }).catch((error)=>{document.getElementById('reader-title').textContent=error.message;});
})();
