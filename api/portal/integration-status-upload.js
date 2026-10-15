const { timingSafeEqual, createHash } = require('node:crypto');
const { json } = require('../../lib/portal-auth');
const { validDate } = require('../../lib/integration-status');
function canonical(value) {
  return JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
}
function validate(payload) {
  if (payload?.version !== 1 || !Number.isFinite(Date.parse(payload.generatedAt)) || Math.abs(Date.now() - Date.parse(payload.generatedAt)) > 86400000 || !Array.isArray(payload.channels) || payload.channels.length !== 4) throw new Error('Base inválida.');
  const expected = ['cvc', 'deskhotel', 'juniper', 'omnibees'];
  if (JSON.stringify(payload.channels.map(c => c.source).sort()) !== JSON.stringify(expected)) throw new Error('Fontes inválidas.');
  for (const c of payload.channels) {
    if (!Array.isArray(c.records) || c.records.length > 50000 || c.available && (!validDate(c.from) || !validDate(c.to) || c.from > c.to || !Array.isArray(c.hotels) || !Number.isFinite(Date.parse(c.capturedAt)))) throw new Error('Cobertura inválida.');
    for (const r of c.records) {
      if (!r.code || !r.hotel || !validDate(r.saleDate) || !['matched', 'missing', 'uncovered', 'review'].includes(r.situation) || !Array.isArray(r.matches) || Object.values(r).some(v => typeof v === 'string' && v.length > 2000)) throw new Error('Reserva inválida.');
    }
  }
  if (payload.kpi && (!validDate(payload.kpi.from) || !validDate(payload.kpi.to) || !Array.isArray(payload.kpi.hotels) || !Number.isFinite(Date.parse(payload.kpi.capturedAt)))) throw new Error('KPI inválido.');
  return payload;
}
async function readBody(req) {
  if (req.body) { const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; if (Buffer.byteLength(JSON.stringify(body)) > 4000000) throw new Error('Base excede o limite.'); return body; }
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 4000000) throw new Error('Base excede o limite.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function upload(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Método não permitido.' }); }
  const expected = process.env.INTEGRATION_STATUS_UPLOAD_TOKEN || '';
  const actual = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (expected.length < 40 || Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return json(res, 401, { error: 'Credencial de publicação inválida.' });
  let payload;
  try { const body=await readBody(req);payload=body?.kind==='channel_availability'?require('../../lib/channel-availability').validate(body):validate(body); } catch { return json(res, 400, { error: 'Base de conferência inválida ou muito grande.' }); }
  try {
    const base = process.env.PORTAL_SUPABASE_URL || 'https://pjcmjytiovuukbkewxjj.supabase.co';
    const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error('Banco não configurado.');
    const headers = { apikey: secret, Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    const result = await fetch(base + '/rest/v1/dashboard_snapshots', { method: 'POST', headers, signal: AbortSignal.timeout(25000), body: JSON.stringify({ source: payload.kind==='channel_availability'?'channel_availability_v1':'integration_status_v1', period_month: payload.generatedAt.slice(0, 7), payload, created_at: payload.generatedAt }) });
    if (!result.ok) throw new Error('Snapshot: HTTP ' + result.status);
    const stored = await result.json();
    if (stored.length !== 1 || canonical(stored[0].payload) !== canonical(payload)) throw new Error('Verificação do snapshot falhou.');
    if(payload.kind!=='channel_availability'){
      const catalog = await fetch(base + '/rest/v1/portal_environments?on_conflict=slug', { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ slug: 'status_integracoes', name: 'Status integrações', description: 'Conferência das reservas confirmadas nos canais versus as capturas do KPI.', sort_order: 49, status: 'active' }) });
      if (!catalog.ok) throw new Error('Catálogo: HTTP ' + catalog.status);
    }
    return json(res, 200, { verified: true, generatedAt: payload.generatedAt, sha256: createHash('sha256').update(canonical(stored[0].payload)).digest('hex') });
  } catch (error) { console.error('integration-status upload:', error.message); return json(res, 503, { error: 'Não foi possível gravar e verificar a base privada.' }); }
}
module.exports = upload;
module.exports.validate = validate;
