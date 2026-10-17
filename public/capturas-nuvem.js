(function captureAdministration() {
  const names = { deskhotel: 'DeskHotel', kpi: 'KPI Full' };
  const labels = { executando: 'Em execução', concluido: 'Concluído', 'concluido-com-pendencias': 'Requer atenção', falhou: 'Falhou', indisponivel: 'Status indisponível' };
  const states = new Map(), pending = new Set();
  const message = document.getElementById('captureMessage');
  let loading, generation = 0;
  const number = value => Number(value || 0).toLocaleString('pt-BR');
  function date(value) {
    const parsed = new Date(value);
    return value && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Sem registro';
  }
  function render(value) {
    if (!names[value.source]) return;
    states.set(value.source, value);
    const card = document.getElementById(value.source), status = card.querySelector('.capture-status');
    status.dataset.state = value.status;
    status.textContent = pending.has(value.source) ? 'Iniciando…' : labels[value.status] || labels.indisponivel;
    card.querySelector('.capture-last').textContent = `${value.status === 'executando' ? 'Início' : 'Última execução'}: ${date(value.finished || value.started)}`;
    const details = card.querySelector('.capture-details');
    details.replaceChildren();
    function line(text) { const element = document.createElement('p'); element.textContent = text; details.append(element); }
    if (value.status === 'executando') line('Captura em andamento. O resultado será exibido ao concluir.');
    else if (value.status === 'falhou') line('A captura não foi concluída. Verifique o acesso ao sistema ou solicite uma conferência antes de tentar novamente.');
    else if (value.status === 'indisponivel') line('Não foi possível consultar o status. A página tentará novamente automaticamente.');
    else if (value.result) {
      const result = value.result;
      line(`${number(result.found)} ${value.source === 'deskhotel' ? 'reservas capturadas' : 'linhas capturadas'}.`);
      if (value.source === 'deskhotel') {
        line(`${number(result.inserted)} incluídas · ${number(result.updatedStatus)} status alterados · ${number(result.updatedData)} registros corrigidos.`);
        line(result.attendants ? 'Atendimentos conferidos.' : 'Atendimentos requerem conferência.');
        if (result.pending) line(`${number(result.pending)} itens precisam de revisão.`);
      } else {
        for (const [name, target] of Object.entries(result.targets || {})) line(`${name}: ${number(target.inserted)} incluídas, ${number(target.canceled)} cancelamentos reconciliados.`);
        line(result.occupancy ? 'Mapa de ocupação atualizado.' : 'Mapa de ocupação requer conferência.');
      }
    }
    card.querySelector('button').disabled = pending.has(value.source) || ['executando', 'indisponivel'].includes(value.status);
  }
  async function reload() {
    if (loading) return loading;
    const current = generation;
    loading = (async () => {
      try {
        const response = await fetch('/api/portal/captures', { cache: 'no-store', credentials: 'same-origin' });
        const payload = await response.json();
        if (!response.ok) throw Error(payload.error || 'Não foi possível consultar as capturas.');
        if (current === generation) {
          payload.captures.forEach(render);
          message.textContent = payload.captures.some(value => value.status === 'executando')
            ? 'Captura em andamento. Você pode continuar usando o Portal.'
            : 'Horários e datas exibidos no fuso de Brasília. Status atualizado automaticamente.';
        }
      } catch (error) { if (current === generation) { message.textContent = error.message; for (const source of Object.keys(names)) render({ source, status: 'indisponivel' }); } }
    })().finally(() => { loading = null; });
    return loading;
  }
  async function start(source) {
    if (pending.has(source) || states.get(source)?.status === 'executando') return;
    generation++; pending.add(source); render(states.get(source));
    message.textContent = `Iniciando atualização do ${names[source]}…`;
    try {
      const response = await fetch('/api/portal/captures', { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) });
      const payload = await response.json();
      if (!response.ok) throw Error(payload.error || 'Não foi possível iniciar a captura.');
      states.set(source, { source, status: 'executando', started: new Date().toISOString(), requestId: payload.requestId });
      message.textContent = `${names[source]}: atualização iniciada. Você pode continuar usando o Portal.`;
    } catch (error) { message.textContent = error.message; states.set(source, { source, status: 'indisponivel' }); }
    finally { pending.delete(source); render(states.get(source)); await reload(); }
  }
  Promise.resolve(window.suedsManagerAuthReady).then(async profile => {
    if (!profile?.roles?.includes('admin_geral')) { message.textContent = 'Acesso restrito aos administradores.'; return; }
    document.getElementById('captureContent').hidden = false;
    message.textContent = 'Horários e datas exibidos no fuso de Brasília.';
    document.querySelectorAll('[data-capture]').forEach(button => button.addEventListener('click', () => start(button.dataset.capture)));
    await reload();
    setInterval(() => { if (!document.hidden) void reload(); }, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void reload(); });
  }).catch(() => { message.textContent = 'Entre no Portal para acompanhar as capturas.'; });
})();
