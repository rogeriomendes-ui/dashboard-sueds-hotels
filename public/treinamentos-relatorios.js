(() => {
  const text = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const date = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle:'medium' }).format(new Date(value)) : '';
  window.suedsManagerAuthReady.then(async () => {
    const response = await fetch('/api/knowledge?action=reports', { credentials:'same-origin', cache:'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Não foi possível carregar os relatórios.');
    const people = payload.people || [];
    document.getElementById('reports-list').innerHTML = people.length ? people.map((person) => `<article class="report-person"><header><div><h2>${text(person.name)}</h2><p>${text(person.department)}</p></div><strong>${Number(person.points) || 0}<small> pontos</small></strong></header><section><h3>Treinamentos concluídos</h3>${person.trainings.map((training) => `<div class="report-training"><span>${text(training.title)}</span><small>${text(training.module)}${training.completedAt ? ` · ${text(date(training.completedAt))}` : ''}</small></div>`).join('')}</section></article>`).join('') : '<p class="reports-empty">Ainda não há treinamentos concluídos para exibir.</p>';
  }).catch((error) => { document.getElementById('reports-list').innerHTML = `<p class="reports-empty">${text(error.message)}</p>`; });
})();
