const { getPortalProfile, hasEnvironment, json } = require('../../lib/portal-auth');
const { report, SOURCES } = require('../../lib/integration-status');
const { loadFound, saveFound, keyOf } = require('../../lib/integration-status-found');

async function readNote(req) {
  let body = req.body;
  if (body === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 8000) throw Object.assign(new Error('Explicação muito longa.'), { status: 400 }); chunks.push(chunk); }
    body = Buffer.concat(chunks).toString('utf8');
  }
  try {
    if (typeof body === 'string') body = JSON.parse(body);
    if (!body || Buffer.byteLength(JSON.stringify(body)) > 8000) throw new Error();
    return body;
  } catch { throw Object.assign(new Error('Dados inválidos.'), { status: 400 }); }
}

async function loadSnapshot() {
  const url = process.env.PORTAL_SUPABASE_URL || 'https://pjcmjytiovuukbkewxjj.supabase.co';
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('A base de conferência ainda não está configurada.');
  const response = await fetch(url + '/rest/v1/dashboard_snapshots?source=eq.integration_status_v1&select=payload&order=created_at.desc,id.desc&limit=1', {
    headers: { apikey: secret, Authorization: 'Bearer ' + secret }, signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('A base de conferência está indisponível. Tente novamente.');
  return (await response.json())[0]?.payload || null;
}
function handler({ profile = getPortalProfile, load = loadSnapshot, loadFound: readFound = loadFound, saveFound: writeFound = saveFound } = {}) {
  return async (req, res) => {
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return json(res, 405, { error: 'Método não permitido.' }); }
    try {
      const user = await profile(req, res);
      if (!user) return json(res, 401, { error: 'Login necessário.' });
      if (!hasEnvironment(user, 'status_integracoes')) return json(res, 403, { error: 'Acesso não liberado para este usuário.' });
      if (req.method === 'POST') {
        const headers = req.headers || {};
        if (!String(headers['content-type'] || '').startsWith('application/json') || headers.origin && new URL(headers.origin).host !== headers.host) return json(res, 403, { error: 'Origem da solicitação inválida.' });
        const body = await readNote(req);
        if (typeof body.note !== 'string' || !body.note.trim() || body.note.trim().length > 2000 || !SOURCES[body.source] || typeof body.hotel !== 'string' || typeof body.code !== 'string') return json(res, 400, { error: 'Informe a reserva e uma explicação de até 2.000 caracteres.' });
        const snapshot = await load();
        const row = snapshot?.channels.find(c => c.source === body.source)?.records.find(r => keyOf(body.source, r.hotel, r.code) === keyOf(body.source, body.hotel, body.code));
        if (!row || row.situation !== 'missing') return json(res, 409, { error: 'A reserva não está mais na lista de não localizadas. Atualize a consulta.' });
        const record = { version: 1, source: body.source, hotel: row.hotel, code: row.code, note: body.note.trim(), at: new Date().toISOString(), userId: user.id, userName: user.name || 'Usuário' };
        if (!record.userId) throw new Error('Usuário inválido.');
        await writeFound(record);
        return json(res, 200, { saved: true });
      }
      const snapshot = await load();
      if (!snapshot) return json(res, 200, { available: false, message: 'Aguardando a publicação das capturas pelo programa local.' });
      const found = await readFound();
      const url = new URL(req.url, 'https://portalsueds.com.br');
      if (url.searchParams.get('format') === 'xlsx') {
        const data = report(snapshot, Object.fromEntries(url.searchParams), { allDetails: true, found });
        const buffer = await require('../../lib/integration-status-export').buildWorkbook(data);
        const filename = `status-integracoes_${data.filters.source || 'todos'}_${data.filters.situation}_${data.filters.from}_${data.filters.to}.xlsx`;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store');
        return res.end(buffer);
      }
      return json(res, 200, { available: true, ...report(snapshot, Object.fromEntries(url.searchParams), { found }) });
    } catch (error) { return json(res, error.status || 503, { error: error.status === 400 ? error.message : req.method === 'POST' ? 'Não foi possível salvar a marcação. Tente novamente.' : 'Não foi possível consultar a conferência. Tente novamente.' }); }
  };
}
module.exports = handler();
module.exports.createHandler = handler;
