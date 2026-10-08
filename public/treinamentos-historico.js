(() => {
  const text = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const date = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle:'long' }).format(new Date(value)) : '';
  window.suedsManagerAuthReady.then(async () => {
    const response = await fetch('/api/knowledge?action=history', { credentials:'same-origin', cache:'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Não foi possível carregar seu histórico.');
    document.getElementById('history-name').textContent = `Olá, ${payload.name}.`;
    document.getElementById('history-points').textContent = String(payload.points || 0);
    const trainings = payload.trainings || [];
    document.getElementById('history-list').innerHTML = trainings.length ? trainings.map((item) => `<article><div><h3>${text(item.title)}</h3><p>${text(item.module)}</p></div><time>${text(date(item.completedAt))}</time><strong>+10 pontos</strong></article>`).join('') : '<p class="history-empty">Você ainda não concluiu treinamentos. Seus pontos aparecerão aqui.</p>';
  }).catch((error) => { document.getElementById('history-list').innerHTML = `<p class="history-empty">${text(error.message)}</p>`; });
})();
