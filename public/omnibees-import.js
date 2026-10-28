(function () {
  const form = document.getElementById('importForm'), input = document.getElementById('importFiles');
  const message = document.getElementById('importMessage'), button = document.getElementById('importSubmit');
  const hex = bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
  async function request(body) {
    const response = await fetch('/api/portal/omnibees-import', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error('Conexão interrompida. Preserve os arquivos e retome o mesmo lote.');
    const value = await response.json(); if (!response.ok) throw Error(value.error || 'Falha ao enviar o lote.'); return value;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); button.disabled = true; input.disabled = true;
    try {
      const files = [...input.files];
      if (!files.length || files.length > 200 || files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024) throw Error('Selecione um lote de até 200 arquivos e 100 MiB.');
      const rows = [];
      for (const file of files) {
        const match = file.name.match(/^omnibees-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})\.csv$/);
        if (!match || !file.size || file.size > 3 * 1024 * 1024) throw Error('Confira o nome e o tamanho dos CSVs.');
        rows.push({ file, from: match[1], to: match[2], bytes: file.size, sha256: hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())) });
      }
      rows.sort((a, b) => a.from.localeCompare(b.from));
      const asOf = new Date(Date.parse(rows.at(-1).to) + 86400000).toISOString().slice(0, 10);
      const manifest = { asOf, files: rows.map(({ from, to, bytes, sha256 }) => ({ from, to, bytes, sha256 })) };
      const fingerprint = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(manifest))));
      const key = 'omnibees-import-' + fingerprint;
      const importId = sessionStorage.getItem(key) || crypto.randomUUID(); sessionStorage.setItem(key, importId);
      message.textContent = 'Preparando o lote…'; await request({ action: 'manifest', importId, manifest });
      for (let i = 0; i < rows.length; i++) {
        message.textContent = `Enviando arquivo ${i + 1} de ${rows.length}…`;
        const bytes = new Uint8Array(await rows[i].file.arrayBuffer()); let binary = '';
        for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
        await request({ action: 'file', importId, index: i, data: btoa(binary) });
      }
      message.textContent = 'Conferindo o lote completo e preparando a base…';
      const value = await request({ action: 'complete', importId });
      if (value.status !== 'concluido' || value.result?.verified !== true || !['preview', 'production'].includes(value.mode)) throw Error('A conclusão ainda não foi confirmada. Preserve os arquivos.');
      message.textContent = `${value.mode === 'preview' ? 'Teste concluído; produção não foi alterada.' : 'Base atualizada e conferida.'} ${value.result.found.toLocaleString('pt-BR')} linhas, ${value.result.reservations.toLocaleString('pt-BR')} reservas.`;
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; input.disabled = false; }
  });
  Promise.resolve(window.suedsManagerAuthReady).then(profile => {
    if (!profile?.roles?.includes('admin_geral')) { message.textContent = 'Acesso restrito aos administradores.'; return; }
    form.hidden = false; message.textContent = 'Selecione os arquivos exportados no computador da nuvem.';
  }).catch(() => { message.textContent = 'Entre no Portal para enviar os relatórios.'; });
})();
