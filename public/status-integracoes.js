(() => {
  const $ = id => document.getElementById(id), form = $('filters');
  const num = n => Number(n || 0).toLocaleString('pt-BR');
  const date = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('/') : d || '—';
  const time = d => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Sem captura';
  const el = (tag, text, className) => { const n = document.createElement(tag); n.textContent = text; if (className) n.className = className; return n; };
  const labels = { missing: 'Não localizada', matched: 'Localizada', uncovered: 'Sem cobertura KPI', review: 'Revisar status na origem' };
  let page = 1, last = null, request = 0, foundRow = null, savingFound = false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const yesterday = new Date(today + 'T12:00:00Z'); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  form.elements.to.value = yesterday.toISOString().slice(0, 10);
  async function load() {
    $('exportXls').disabled = true;
    const current = ++request, query = new URLSearchParams(new FormData(form));
    query.set('source', $('source').value); query.set('situation', $('situation').value); query.set('page', page);
    $('message').textContent = 'Consultando capturas…'; $('message').className = 'notice'; $('results').hidden = true;
    try {
      const response = await fetch('/api/portal/integration-status?' + query, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (current !== request) return;
      if (!response.ok) throw new Error(data.error || 'Falha na consulta.');
      if (!data.available) { $('message').textContent = data.message; $('stamp').textContent = 'Aguardando capturas'; return; }
      last = data; $('message').textContent = ''; $('results').hidden = false;
      $('exportXls').disabled = data.totalDetails === 0;
      $('stamp').textContent = 'Base consolidada: ' + time(data.generatedAt);
      const hotel = form.elements.hotel.value;
      form.elements.hotel.replaceChildren(new Option('Todos os hotéis', ''), ...data.hotels.map(h => new Option(h, h))); form.elements.hotel.value = hotel;
      const { missing, uncovered, review, confirmed, differentNumber } = data.summary;
      $('alert').className = 'integration-alert' + (!missing && !uncovered && !review && confirmed ? ' good' : '');
      $('alert').replaceChildren(el('div', missing ? `${num(missing)} reservas confirmadas não localizadas no KPI` : confirmed && !uncovered && !review ? 'Todas as reservas confirmadas comparadas foram localizadas no KPI' : 'Consulte a cobertura e as pendências das capturas'));
      $('alert').append(el('small', `${num(confirmed)} confirmadas nas fontes · ${num(uncovered)} sem cobertura KPI · ${num(review)} para revisão. Totais somados por canal.`));
      if (differentNumber) $('alert').append(el('div', `${num(differentNumber)} encontradas por nome e datas iguais, com número da reserva diferente.`));
      if (data.summary.manualFound) $('alert').append(el('div', `Marcações Achei por conferência manual: ${num(data.summary.manualFound)}.`));
      $('cards').replaceChildren();
      for (const c of data.channels) {
        const card = el('article', '', 'integration-card'); card.append(el('h2', c.name));
        if (!c.available) { card.append(el('p', 'Aguardando captura completa')); $('cards').append(card); continue; }
        card.append(el('p', `Cobertura: ${date(c.from)} a ${date(c.to)}`), el('div', num(c.confirmed), 'integration-count'), el('p', 'reservas confirmadas no período filtrado'));
        const clean = c.confirmed > 0 && !c.missing && !c.uncovered && !c.review;
        card.append(el('p', c.missing ? `${num(c.missing)} não localizadas no KPI` : clean ? 'Todas localizadas no KPI' : c.confirmed ? 'Há reservas sem conclusão' : 'Sem confirmadas no período', 'integration-result' + (clean ? ' good' : '')));
        card.append(el('p', `${num(c.matched)} localizadas · ${num(c.uncovered)} sem cobertura · ${num(c.review)} revisar`));
        if (c.manualFound) card.append(el('p', `Localizadas com marcação manual Achei: ${num(c.manualFound)}.`));
        if (c.differentNumber) {
          const differences = el('button', `${num(c.differentNumber)} com número diferente — conferir`, 'button button-quiet'); differences.type = 'button';
          differences.addEventListener('click', async () => { $('source').value = c.source; $('situation').value = 'different_number'; page = 1; await load(); $('detailsTitle').focus(); }); card.append(differences);
        }
        if (c.partial) card.append(el('p', 'Captura cobre apenas parte do período solicitado.'));
        card.append(el('p', 'Captura ' + c.name + ': ' + time(c.capturedAt)));
        card.append(el('p', 'Captura KPI comparada: ' + time(data.kpi?.capturedAt)));
        card.append(el('p', 'Horários de Brasília'));
        const button = el('button', c.missing ? 'Conferir não localizadas' : 'Conferir reservas', 'button button-quiet'); button.type = 'button';
        button.addEventListener('click', async () => { $('source').value = c.source; $('situation').value = c.missing ? 'missing' : 'all'; page = 1; await load(); $('detailsTitle').focus(); }); card.append(button); $('cards').append(card);
      }
      $('coverage').textContent = data.kpi ? `KPI capturado em ${time(data.kpi.capturedAt)} · Base venda de ${date(data.kpi.from)} a ${date(data.kpi.to)}. Hotéis: ${data.kpi.hotels.join(', ')}. Azul não disponibiliza Trancoso nesta conta.` : 'Aguardando uma captura completa do KPI. Não há conclusão de integração sem essa base.';
      $('detailsTitle').textContent = $('situation').value === 'all' ? 'Reservas confirmadas' : $('situation').selectedOptions[0].textContent;
      $('rows').replaceChildren();
      for (const r of data.details) {
        const tr = document.createElement('tr');
        const cells = [[r.sourceName, r.hotel], [r.code, [r.status, r.lineStatus].filter(Boolean).join(' / ')], [r.guest], [date(r.saleDate)], [date(r.checkin), date(r.checkout)], [r.numberMismatch ? 'Encontrada por nome e datas · número diferente' : labels[r.situation], r.matches.map(m => `${m.code}${m.locator ? ' · Localizador: ' + m.locator : ''} · ${m.status}`).join('; ')]];
        for (const values of cells) { const td = el('td', values[0]); if (values[1]) td.append(el('small', values[1])); tr.append(td); }
        const action = document.createElement('td');
        if (r.manualResolution) {
          tr.lastChild.append(el('small', 'Achei: ' + r.manualResolution.note), el('small', `${r.manualResolution.userName} · ${time(r.manualResolution.at)}`));
          action.textContent = 'Achei ✓';
        } else if (r.situation === 'missing') {
          const button = el('button', 'Achei', 'button button-quiet'); button.type = 'button';
          button.addEventListener('click', () => {
            foundRow = r; $('foundReservation').textContent = `${r.sourceName} · ${r.hotel} · Reserva ${r.code} · ${r.guest}`;
            $('foundNote').value = ''; $('foundError').textContent = ''; $('foundDialog').showModal(); $('foundNote').focus();
          }); action.append(button);
        }
        tr.append(action); $('rows').append(tr);
      }
      $('empty').hidden = data.details.length > 0;
      $('pageInfo').textContent = `${num(data.totalDetails)} reservas · Página ${page} de ${Math.max(1, Math.ceil(data.totalDetails / data.pageSize))}`;
      $('previous').disabled = page <= 1; $('next').disabled = page * data.pageSize >= data.totalDetails;
    } catch (error) { if (current !== request) return; $('message').textContent = error.message; $('message').className = 'notice notice-error'; $('stamp').textContent = 'Consulta indisponível'; }
  }
  form.addEventListener('submit', e => { e.preventDefault(); page = 1; load(); });
  $('foundCancel').addEventListener('click', () => $('foundDialog').close());
  $('foundDialog').addEventListener('cancel', e => { if (savingFound) e.preventDefault(); });
  $('foundForm').addEventListener('submit', async e => {
    e.preventDefault(); if (!foundRow || savingFound) return;
    const note = $('foundNote').value.trim();
    if (!note) { $('foundError').textContent = 'Escreva uma explicação antes de salvar.'; return; }
    savingFound = true; $('foundSave').disabled = true; $('foundCancel').disabled = true; $('foundSave').textContent = 'Salvando…'; $('foundError').textContent = '';
    try {
      const response = await fetch('/api/portal/integration-status', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: foundRow.source, hotel: foundRow.hotel, code: foundRow.code, note }) });
      const data = await response.json();
      if (!response.ok || !data.saved) throw new Error(data.error || 'Não foi possível salvar. Tente novamente.');
      $('foundDialog').close(); foundRow = null; page = 1; await load();
    } catch (error) { $('foundError').textContent = error.message; }
    finally { savingFound = false; $('foundSave').disabled = false; $('foundCancel').disabled = false; $('foundSave').textContent = 'Salvar Achei'; }
  });
  $('exportXls').addEventListener('click', async () => {
    if (!last) return;
    const button = $('exportXls'); button.disabled = true; button.textContent = 'Gerando…';
    try {
      const query = new URLSearchParams(last.filters); query.set('format', 'xlsx');
      const response = await fetch('/api/portal/integration-status?' + query, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('spreadsheetml')) throw new Error('Não foi possível gerar a planilha. Tente novamente.');
      const blob = await response.blob(), link = document.createElement('a'), url = URL.createObjectURL(blob);
      link.href = url; link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'status-integracoes.xlsx';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { $('message').textContent = error.message; $('message').className = 'notice notice-error'; }
    finally { button.textContent = 'XLS'; button.disabled = !last?.totalDetails; }
  });
  for (const id of ['source', 'situation']) $(id).addEventListener('change', () => { page = 1; load(); });
  $('previous').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('next').addEventListener('click', () => { if (last && page * last.pageSize < last.totalDetails) { page++; load(); } });
  window.suedsManagerAuthReady.then(load).catch(() => {});
})();
