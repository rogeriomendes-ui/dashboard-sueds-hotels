(() => {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const moduleSlug = params.get('module');
  const editStyle = document.createElement('style');
  editStyle.textContent = '#reader-edit{position:fixed;z-index:10;right:24px;bottom:24px;margin:0;padding:8px 12px;border:1px solid #9aa5a1;border-radius:6px;background:#fff;color:var(--deep);font-size:12px;font-weight:800;text-decoration:none;box-shadow:0 2px 8px #001d1420}.module-training-search{margin:24px 0 16px}.module-training-search label{display:grid;gap:6px;color:var(--deep);font-size:12px;font-weight:800}.module-training-search input{min-height:42px;padding:9px 12px;border:1px solid var(--line);background:#fff;color:var(--ink);font:inherit}.training-video-player{position:relative;margin:18px 0;line-height:0}.training-video-player video{display:block;width:100%;margin:0!important}.training-video-player{background:#111;color:#fff}.training-video-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px;line-height:1.4}.training-video-progress{width:100%;accent-color:#e32732;cursor:pointer}.training-video-time{font-size:13px;font-variant-numeric:tabular-nums}.training-video-player:fullscreen,.training-video-player.training-video-expanded{display:flex;flex-direction:column;justify-content:center;width:100%;height:100%;background:#111}.training-video-player:fullscreen video,.training-video-player.training-video-expanded video{flex:1;min-height:0;object-fit:contain}.training-video-player.training-video-expanded{position:fixed;inset:0;z-index:2147483647;margin:0;height:100dvh}.training-video-controls button{min-height:44px;padding:10px 16px;border:0;border-radius:6px;background:var(--deep);color:#fff;font:inherit;cursor:pointer}.training-video-controls button:focus-visible{outline:3px solid var(--orange);outline-offset:3px}';
  document.head.append(editStyle);
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
      if (module?.pop && !module.pop.read) {
        readerContent.innerHTML = `<section class="training-pop-required"><h2>Leia o POP antes de iniciar</h2><p>Este módulo exige a leitura e confirmação do Procedimento Operacional Padrão antes de liberar os treinamentos.</p><a href="/treinamentos-pop.html?module=${encodeURIComponent(module.slug)}">Abrir POP e confirmar leitura</a></section>`;
        return;
      }
      if (!documents.length) { readerContent.innerHTML = '<p>Nenhum treinamento publicado nesta área.</p>'; return; }
      readerContent.innerHTML = '<div class="module-training-search"><label>Buscar neste módulo<input id="module-training-search" type="search" placeholder="Ex.: atendimento, reservas, hóspedes…"></label></div><div id="module-training-list" class="reader-documents"></div>';
      const list = document.getElementById('module-training-list');
      const publishedVersion = (doc) => doc.versions?.find((item) => item.version === doc.published_version) || doc.versions?.[0] || {};
      const areaName = (doc) => doc.document_type?.trim() || 'Geral';
      const renderDocuments = (query = '') => {
        const normalized = query.trim().toLocaleLowerCase('pt-BR');
        const visible = documents.filter((doc) => `${areaName(doc)} ${doc.title} ${publishedVersion(doc).summary || ''}`.toLocaleLowerCase('pt-BR').includes(normalized));
        const areas = new Map();
        for (const doc of visible) {
          const name = areaName(doc);
          const key = name.toLocaleLowerCase('pt-BR');
          if (!areas.has(key)) areas.set(key, { name, documents: [] });
          areas.get(key).documents.push(doc);
        }
        list.innerHTML = areas.size ? [...areas.values()].map((area) => `<details class="training-area"${normalized ? ' open' : ''}><summary><span class="training-area-toggle" aria-hidden="true"></span><span>${text(area.name)}</span><small>${area.documents.length} treinamento${area.documents.length === 1 ? '' : 's'}</small></summary><div class="training-area-documents">${area.documents.map((doc) => {
          const version = publishedVersion(doc);
          return `<article class="reader-document"><div><h3>${text(doc.title)}</h3><p>${text(version.summary || '')}</p></div><a href="/treinamentos-conteudo.html?id=${encodeURIComponent(doc.id)}">Abrir treinamento</a></article>`;
        }).join('')}</div></details>`).join('') : '<p>Nenhum treinamento encontrado neste módulo.</p>';
      };
      renderDocuments();
      document.getElementById('module-training-search').addEventListener('input', (event) => renderDocuments(event.target.value));
      return;
    }
    const doc = (result.documents || []).find((item) => item.id === id && item.status === 'published');
    if (!doc) throw new Error('Treinamento não encontrado.');
    const modulesResponse = await fetch('/api/knowledge?action=modules', { credentials:'same-origin', cache:'no-store' });
    const modules = modulesResponse.ok ? (await modulesResponse.json()).modules || [] : [];
    const module = modules.find((item) => item.slug === doc.module);
    const moduleBack = document.getElementById('reader-module-back');
    if (moduleBack) {
      moduleBack.href = `/treinamentos-conteudo.html?module=${encodeURIComponent(doc.module)}`;
      moduleBack.hidden = false;
    }
    if (module?.pop && !module.pop.read) {
      document.title = `${module.name} | Centro de Conhecimentos Sueds`;
      readerTitle.textContent = 'Leitura do POP necessária';
      readerSummary.textContent = 'Confirme a leitura do procedimento antes de acessar este treinamento.';
      readerContent.innerHTML = `<section class="training-pop-required"><h2>Este treinamento está bloqueado</h2><p>Leia e confirme o POP de ${text(module.name)} para liberar o conteúdo.</p><a href="/treinamentos-pop.html?module=${encodeURIComponent(module.slug)}">Abrir POP e confirmar leitura</a></section>`;
      return;
    }
    const version = doc.versions?.find((item) => item.version === doc.published_version) || doc.versions?.[0] || {};
    document.title = `${doc.title} | Centro de Conhecimentos Sueds`;
    readerTitle.textContent = doc.title;
    readerSummary.textContent = version.summary || '';
    readerContent.innerHTML = markdown(version.content_markdown);
    if (result.canEdit) { const edit = document.getElementById('reader-edit'); edit.href = `/Treinamentos/Publicar?edit=${encodeURIComponent(doc.id)}`; edit.hidden = false; }
    const confirmation = document.getElementById('training-confirm');
    const button = document.getElementById('training-confirm-button');
    const confirmationResult = document.getElementById('training-confirm-result');
    const setConfirmed = () => { button.disabled = true; button.classList.add('confirmed'); button.textContent = '✓ Leitura confirmada'; };
    confirmation.hidden = false;
    const media = document.getElementById('reader-media');
    const videos = [];
    const updateVideoRequirement = () => {
      const completed = videos.every((video) => video.dataset.completed === 'true');
      if (!button.classList.contains('confirmed')) button.disabled = !completed;
      if (!completed) confirmationResult.textContent = 'Assista ao vídeo até o final para liberar a confirmação.';
      else if (!button.classList.contains('confirmed')) confirmationResult.textContent = 'Vídeo concluído. Agora confirme sua leitura.';
      return completed;
    };
    for (const item of doc.metadata?.media || []) {
      if (!/^https:\/\//.test(item.url)) continue;
      const element = document.createElement(item.type === 'video' ? 'video' : 'img');
      element.src = item.url;
      if (item.type === 'video') {
        let playbackPosition = 0;
        const player = document.createElement('div');
        const controls = document.createElement('div');
        const playButton = document.createElement('button');
        const restartButton = document.createElement('button');
        const backButton = document.createElement('button');
        const fullscreenButton = document.createElement('button');
        const progress = document.createElement('input');
        const time = document.createElement('span');
        progress.type = 'range';
        progress.className = 'training-video-progress';
        progress.min = '0'; progress.max = '0'; progress.step = '0.1'; progress.value = '0';
        progress.setAttribute('aria-label', 'Posição do vídeo (somente voltar)');
        time.className = 'training-video-time';
        const formatTime = (seconds) => {
          const value = Math.floor(Number.isFinite(seconds) ? seconds : 0);
          return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
        };
        const updateProgress = () => {
          progress.max = String(Number.isFinite(element.duration) ? element.duration : 0);
          progress.value = String(element.currentTime);
          time.textContent = `${formatTime(element.currentTime)} / ${formatTime(element.duration)}`;
          progress.setAttribute('aria-valuetext', time.textContent);
        };
        const rewind = (position) => {
          playbackPosition = Math.max(0, Math.min(position, element.currentTime, playbackPosition));
          element.currentTime = playbackPosition;
          updateProgress();
        };
        progress.addEventListener('input', () => rewind(Number(progress.value)));
        backButton.type = fullscreenButton.type = 'button';
        backButton.textContent = '↶ 10 s';
        backButton.setAttribute('aria-label', 'Voltar 10 segundos');
        backButton.addEventListener('click', () => rewind(element.currentTime - 10));
        const expanded = () => document.fullscreenElement === player || player.classList.contains('training-video-expanded');
        const updateFullscreen = () => {
          fullscreenButton.textContent = expanded() ? '⛶ Sair da tela cheia' : '⛶ Tela cheia';
          fullscreenButton.setAttribute('aria-pressed', String(expanded()));
        };
        fullscreenButton.addEventListener('click', async () => {
          if (document.fullscreenElement === player) await document.exitFullscreen();
          else if (player.classList.contains('training-video-expanded')) player.classList.remove('training-video-expanded');
          else {
            try {
              if (!player.requestFullscreen) throw new Error('Fullscreen indisponível');
              await player.requestFullscreen();
            } catch { player.classList.add('training-video-expanded'); }
          }
          updateFullscreen();
        });
        document.addEventListener('fullscreenchange', updateFullscreen);
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && player.classList.contains('training-video-expanded')) {
            player.classList.remove('training-video-expanded'); updateFullscreen();
          }
        });
        updateFullscreen();
        updateProgress();
        player.className = 'training-video-player';
        controls.className = 'training-video-controls';
        playButton.type = restartButton.type = 'button';
        restartButton.textContent = '↺ Reiniciar vídeo';
        const updatePlayButton = () => {
          playButton.textContent = element.paused || element.ended ? '▶ Reproduzir vídeo' : '⏸ Pausar vídeo';
        };
        updatePlayButton();
        element.controls = false;
        element.playsInline = true;
        element.addEventListener('loadedmetadata', updateProgress);
        element.disablePictureInPicture = true;
        element.addEventListener('timeupdate', () => {
          if (!element.seeking) playbackPosition = element.currentTime;
          updateProgress();
        });
        element.addEventListener('seeking', () => {
          if (element.currentTime > playbackPosition + .5) element.currentTime = playbackPosition;
          else playbackPosition = element.currentTime;
        });
        element.addEventListener('play', updatePlayButton);
        element.addEventListener('pause', updatePlayButton);
        element.addEventListener('ended', () => { element.dataset.completed = 'true'; updatePlayButton(); updateVideoRequirement(); });
        const restart = () => {
          playbackPosition = 0;
          element.currentTime = 0;
        };
        const togglePlayback = () => {
          if (!element.paused && !element.ended) { element.pause(); return; }
          if (element.ended) restart();
          element.play().catch(updatePlayButton);
        };
        playButton.addEventListener('click', togglePlayback);
        element.addEventListener('click', togglePlayback);
        restartButton.addEventListener('click', () => {
          restart();
          element.play().catch(updatePlayButton);
        });
        controls.append(progress, playButton, backButton, restartButton, time, fullscreenButton);
        player.append(element, controls);
        videos.push(element);
        media.append(player);
      } else { element.alt = item.caption || doc.title; media.append(element); }
    }
    if (videos.length) updateVideoRequirement();
    const receipt = await fetch(`/api/knowledge?action=training-read&documentId=${encodeURIComponent(doc.id)}`, { credentials:'same-origin', cache:'no-store' });
    if (receipt.ok && (await receipt.json()).read) setConfirmed();
    button.onclick = async () => {
      button.disabled = true;
      try {
        const response = await fetch('/api/knowledge?action=training-read', { method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({ documentId: doc.id, videoCompleted: updateVideoRequirement() }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Não foi possível registrar sua leitura.');
        setConfirmed();
        confirmationResult.textContent = 'Sua confirmação foi registrada.';
      } catch (error) { button.disabled = false; confirmationResult.textContent = error.message; }
    };
  }).catch((error)=>{document.getElementById('reader-title').textContent=error.message;});
})();
