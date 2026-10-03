(() => {
  const moduleSlug = new URLSearchParams(location.search).get('module');
  const title = document.getElementById('pop-title');
  const message = document.getElementById('pop-message');
  const body = document.getElementById('pop-body');
  const confirm = document.getElementById('pop-confirm');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.suedsManagerAuthReady.then(async () => {
    if (!moduleSlug) throw new Error('Escolha um módulo no catálogo.');
    const [modulesResponse, popResponse] = await Promise.all([
      fetch('/api/knowledge?action=modules', { credentials:'same-origin', cache:'no-store' }),
      fetch(`/api/knowledge?action=pop&module=${encodeURIComponent(moduleSlug)}`, { credentials:'same-origin', cache:'no-store' })
    ]);
    if (!modulesResponse.ok || !popResponse.ok) throw new Error('Não foi possível carregar o POP.');
    const modules = (await modulesResponse.json()).modules || [];
    const module = modules.find((item) => item.slug === moduleSlug);
    const { pop, read } = await popResponse.json();
    if (!module || !pop) throw new Error('Este módulo ainda não tem POP publicado.');
    document.title = `POP ${module.name} | Portal SUEDS`;
    title.textContent = `POP · ${module.name}`;
    document.getElementById('pop-meta').textContent = `${pop.name} · versão ${pop.version}`;
    const isPdf = pop.type === 'application/pdf';
    body.innerHTML = isPdf ? `<iframe title="POP ${escapeHtml(module.name)}" src="${escapeHtml(pop.url)}"></iframe>` : pop.html || '<p>Não foi possível apresentar o conteúdo deste Word.</p>';
    document.getElementById('pop-download').href = `/api/knowledge?action=pop&module=${encodeURIComponent(moduleSlug)}&format=pdf`;
    document.getElementById('pop-original').href = pop.url;
    document.getElementById('pop-original').textContent = isPdf ? 'Abrir PDF original' : 'Abrir Word original';
    document.getElementById('pop-actions').hidden = false;
    document.getElementById('pop-read').hidden = false;
    if (read) { confirm.disabled = true; confirm.textContent = 'Leitura confirmada'; }
    confirm.onclick = async () => {
      confirm.disabled = true;
      try {
        const response = await fetch(`/api/knowledge?action=pop&module=${encodeURIComponent(moduleSlug)}`, { method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({action:'read',version:pop.version}) });
        if (!response.ok) { const error = await response.json(); throw new Error(error.message || 'Não foi possível registrar sua leitura.'); }
        confirm.textContent = 'Leitura confirmada';
        document.getElementById('pop-result').textContent = 'Sua confirmação foi registrada.';
      } catch (error) { confirm.disabled = false; document.getElementById('pop-result').textContent = error.message; }
    };
  }).catch((error) => { title.textContent = 'POP indisponível'; message.textContent = error.message; });
})();
