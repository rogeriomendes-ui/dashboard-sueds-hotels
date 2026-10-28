(function observatory() {
  const $ = id => document.getElementById(id);
  const filters = $('filters');
  const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  let state = null;
  let requestId = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const value = n => n == null ? 'Não disponível' : number.format(n);
  const day = raw => raw ? String(raw).slice(0, 10).split('-').reverse().join('/') : 'Não disponível';
  const month = raw => `${raw.slice(5)}/${raw.slice(0, 4)}`;
  function link(url, label = 'Consultar fonte') {
    try { if (new URL(url).protocol !== 'https:') return escape(label); } catch { return escape(label); }
    return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`;
  }
  function empty(message) { return `<p class="obs-empty">${escape(message)}</p>`; }
  function table(headers, rows, message) {
    if (!rows.length) return empty(message);
    return `<div class="obs-table" tabindex="0" aria-label="Tabela com rolagem horizontal"><table><thead><tr>${headers.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function parameters() { return new URLSearchParams(new FormData(filters)); }
  function render(payload) {
    state = payload;
    Object.entries(payload.filters).forEach(([key, val]) => { if (filters.elements[key]) filters.elements[key].value = val; });
    $('storage').hidden = payload.storage.available;
    $('storage').textContent = payload.storage.message;
    const source = payload.sources.find(s => s.id === payload.filters.aviationSource);
    const stats = [
      ['Movimentação de passageiros', payload.totals?.passengers, 'Embarques e desembarques; não turistas únicos'],
      ['Movimentos de aeronaves', payload.totals?.flights, 'Pousos e decolagens no período'],
      ['Assentos · fonte selecionada', payload.totals?.seats, 'Somente quando informados pela ANAC'],
      ['Meses com dados', payload.coverage.available, `De ${payload.coverage.expected} meses selecionados`]
    ];
    $('cards').innerHTML = stats.map(([title, n, note]) => `<article class="obs-card"><span>${escape(title)}</span><strong>${n == null ? '—' : value(n)}</strong><small>${escape(note)}</small></article>`).join('');
    $('coverage').innerHTML = `${escape(source.name)} · Fonte consultada em ${day(source.retrievedAt)} · ${payload.coverage.available}/${payload.coverage.expected} meses disponíveis. ${link(source.sourceUrl)}`;
    const max = Math.max(1, ...payload.monthly.map(m => m.current?.passengers || 0));
    $('chart').innerHTML = payload.monthly.map(m => `<div class="obs-bar-row"><span>${month(m.period)}</span><div class="obs-track" aria-hidden="true">${m.current?.passengers != null ? `<div class="obs-bar" style="width:${Math.max(0, Math.min(100, m.current.passengers / max * 100))}%"></div>` : ''}</div><span>${m.current ? value(m.current.passengers) : 'Sem dados'}</span></div>`).join('');
    $('aviationNote').textContent = source.note + ' Traço (—) indica métrica ausente ou incompleta. Totais e comparações só são calculados quando todas as parcelas estão informadas.';
    $('monthlyTable').innerHTML = table(['Mês', 'Passageiros', 'Movimentos', 'Assentos', 'Passageiros · mesmo mês anterior', 'Variação anual'], payload.monthly.map(m => [month(m.period), value(m.current?.passengers), value(m.current?.flights), value(m.current?.seats), value(m.previous?.passengers), m.change == null ? 'Não comparável' : `${value(m.change)}%`]), 'Sem movimentação disponível.');
    $('routesTable').innerHTML = table(['Origem', 'Aeroporto', 'Natureza', 'Passageiros chegando', 'Voos chegando'], payload.routes.map(r => [r.origin, r.name, r.nature, value(r.passengers), value(r.flights)]), payload.filters.aviationSource === 'airport' ? 'A tabela do aeroporto não detalha origens. Selecione ANAC após importar as etapas básicas.' : 'Nenhuma rota disponível para os filtros.');
    $('tourismTable').innerHTML = table(['Período', 'Território', 'Indicador', 'Valor', 'Mercado / conceito', 'Método', 'Metodologia', 'Fonte'], payload.tourism.map(r => [month(r.period), r.region, r.indicator, `${value(r.value)} ${r.unit}`, `${r.market} · ${r.marketType}`, r.method, r.methodology, payload.sources.find(s => s.id === r.sourceId).name]), 'Nenhum estudo carregado para este recorte. Consulte as fontes oficiais na aba Fontes e atualizações. Dados estaduais não serão convertidos em dados municipais.');
    $('hotelsTable').innerHTML = table(['Registro', 'Estabelecimento', 'Território', 'Localidade', 'Situação cadastral', 'Referência'], payload.hotels.map(r => [r.externalId, r.name, r.region, r.locality, r.status, day(r.registeredAt)]), 'O cadastro regional ainda não foi importado do Cadastur. Não há hotéis ou quantidades simuladas.');
    $('eventsList').innerHTML = payload.events.length ? payload.events.map(e => `<article class="obs-box obs-event" data-status="${escape(e.status)}"><div class="obs-heading"><h3>${escape(e.title)}</h3><span class="obs-badge">${escape(e.status)}</span></div><p>${day(e.starts_on)} a ${day(e.ends_on)} · ${escape(e.region)} · ${escape(e.locality)} · ${escape(e.category)}</p><p>${escape(e.notes)}</p><div class="obs-heading">${link(e.source_url)}${payload.canManage ? `<button type="button" class="button button-quiet" data-event="${escape(e.id)}">Editar</button>` : ''}</div></article>`).join('') : empty('Nenhum evento cadastrado para este período. Isso não significa ausência de eventos no destino.');
    $('newEvent').hidden = !payload.canManage;
    $('management').hidden = !payload.canManage;
    $('sourcesList').innerHTML = payload.sources.map(s => `<article class="obs-box"><div class="obs-heading"><h3>${escape(s.name)}</h3><span class="obs-badge">${escape(s.status)}</span></div><p>${escape(s.note)}</p><p>Periodicidade: ${escape(s.cadence)}<br>Registros na base: ${value(s.count)}<br>Consulta à fonte: ${day(s.retrievedAt)}<br>Gravação no Portal: ${s.updatedAt ? day(s.updatedAt) : s.count ? 'Carga oficial incluída na versão' : 'Não disponível'}</p><p>${escape(s.notes)}</p>${link(s.sourceUrl)}</article>`).join('');
    $('auditList').innerHTML = table(['Data', 'Ação', 'Fonte', 'Registros / detalhe'], payload.runs.map(r => [day(r.created_at), r.action, r.source_id || 'Calendário', r.details.count ?? r.details.message ?? 'Evento registrado']), 'Histórico de alterações disponível aos administradores após a preparação da base.');
    $('exportCsv').disabled = false;
    $('exportExcel').disabled = false;
  }
  async function load(initial = false) {
    const current = ++requestId;
    $('message').textContent = 'Consultando dados…';
    $('exportCsv').disabled = true; $('exportExcel').disabled = true;
    try {
      const response = await fetch(`/api/portal/observatorio${initial ? '' : `?${parameters()}`}`, { credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json();
      if (current !== requestId) return;
      if (!response.ok) throw new Error(body.error || 'Não foi possível consultar.');
      render(body);
      $('message').textContent = 'Consulta concluída. As datas de referência e de atualização estão identificadas em cada fonte.';
    } catch (error) {
      if (current !== requestId) return;
      if (state) {
        Object.entries(state.filters).forEach(([key, val]) => { if (filters.elements[key]) filters.elements[key].value = val; });
        $('exportCsv').disabled = false; $('exportExcel').disabled = false;
      }
      $('message').textContent = `${error.message}${state ? ' Exibindo a consulta anterior, com seus filtros restaurados.' : ''}`;
    }
  }
  async function save(body) {
    const response = await fetch('/api/portal/observatorio', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.');
    return payload;
  }
  filters.addEventListener('submit', event => { event.preventDefault(); load(); });
  document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-section]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    document.querySelectorAll('.obs-panel').forEach(panel => { panel.hidden = panel.id !== button.dataset.section; });
  }));
  function openEvent(event = null) {
    const form = $('eventForm'); form.reset(); form.elements.id.value = ''; $('eventError').textContent = '';
    $('eventTitle').textContent = event ? 'Editar evento' : 'Cadastrar evento';
    if (event) {
      const values = { ...event, startsOn: event.starts_on, endsOn: event.ends_on, sourceUrl: event.source_url };
      Object.entries(values).forEach(([key, val]) => { if (form.elements[key]) form.elements[key].value = val; });
    }
    $('eventDialog').showModal();
  }
  $('newEvent').addEventListener('click', () => openEvent());
  $('closeEvent').addEventListener('click', () => $('eventDialog').close());
  $('eventsList').addEventListener('click', event => { const button = event.target.closest('[data-event]'); if (button) openEvent(state.events.find(e => e.id === button.dataset.event)); });
  $('eventForm').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try { await save({ action: 'event', event: Object.fromEntries(new FormData(event.target)) }); $('eventDialog').close(); await load(); }
    catch (error) { $('eventError').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('syncAirport').addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true; $('message').textContent = 'Consultando o site oficial do aeroporto…';
    try { const result = await save({ action: 'sync-airport' }); await load(); $('message').textContent = result.message; }
    catch (error) { $('message').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('importForm').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try {
      const file = $('importFile').files[0];
      if (!file || file.size > 2_000_000) throw new Error('Escolha um JSON de até 2 MB.');
      const dataset = JSON.parse(await file.text());
      const result = await save({ action: 'import', dataset, replace: $('replaceSource').checked });
      event.target.reset(); await load(); $('message').textContent = result.message;
    } catch (error) { $('message').textContent = error.message; }
    finally { button.disabled = false; }
  });
  async function download(format, button) {
    button.disabled = true;
    try {
      const params = new URLSearchParams(state.filters); params.set('format', format);
      const response = await fetch(`/api/portal/observatorio?${params}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `observatorio-${state.filters.from}-${state.filters.to}.${format}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { $('message').textContent = error.message; }
    finally { button.disabled = false; }
  }
  $('exportCsv').addEventListener('click', event => download('csv', event.currentTarget));
  $('exportExcel').addEventListener('click', event => download('xlsx', event.currentTarget));
  window.suedsManagerAuthReady.then(() => load(true)).catch(() => { $('message').textContent = 'Faça login com acesso ao Observatório.'; });
})();
