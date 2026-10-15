// As marcações ficam em registros separados das capturas automáticas.
const SOURCE = 'integration_status_found_v1';
const keyOf = (source, hotel, code) => JSON.stringify([source, hotel.trim().toUpperCase(), code.trim().toUpperCase()]);
function connection() {
  const base = process.env.PORTAL_SUPABASE_URL || 'https://pjcmjytiovuukbkewxjj.supabase.co';
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Banco não configurado.');
  return { base, headers: { apikey: secret, Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' } };
}
async function loadFound() {
  const { base, headers } = connection();
  const found = new Map();
  for (let offset = 0; ; offset += 500) {
    const response = await fetch(base + '/rest/v1/dashboard_snapshots?source=eq.' + SOURCE + '&select=payload&order=created_at.desc,id.desc&limit=500&offset=' + offset, { headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Marcações indisponíveis.');
    const rows = await response.json();
    for (const { payload: p } of rows) {
      if (p?.version !== 1 || !p.source || !p.hotel || !p.code || !p.note) throw new Error('Marcação inválida.');
      const key = keyOf(p.source, p.hotel, p.code);
      if (!found.has(key)) found.set(key, p);
    }
    if (rows.length < 500) return [...found.values()];
  }
}
async function saveFound(record) {
  const { base, headers } = connection();
  const response = await fetch(base + '/rest/v1/dashboard_snapshots', { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ source: SOURCE, period_month: record.at.slice(0, 7), payload: record, created_at: record.at }) });
  if (!response.ok) throw new Error('Falha ao gravar marcação.');
  const rows = await response.json();
  if (rows.length !== 1 || Object.keys(record).some(k => rows[0].payload?.[k] !== record[k])) throw new Error('Falha ao verificar marcação.');
  return rows[0].payload;
}
module.exports = { keyOf, loadFound, saveFound };
