const { getPortalProfile, json } = require('../../lib/portal-auth');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const LIMIT = 4 * 1024 * 1024 + 65536;
function validate(body) {
  if (!body || !UUID.test(body.importId || '') || !['manifest', 'file', 'complete', 'status'].includes(body.action)) throw Error('INVALID_INPUT');
  const keys = { manifest: 'action,importId,manifest', file: 'action,data,importId,index', complete: 'action,importId', status: 'action,importId' };
  if (Object.keys(body).sort().join(',') !== keys[body.action]) throw Error('INVALID_INPUT');
  if (body.action === 'manifest' && (!body.manifest || JSON.stringify(body.manifest).length > 65536)) throw Error('INVALID_INPUT');
  if (body.action === 'file' && (!Number.isInteger(body.index) || body.index < 0 || body.index >= 200
    || typeof body.data !== 'string' || !body.data.length || body.data.length > 4 * 1024 * 1024 || body.data.length % 4
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.data) || Buffer.from(body.data, 'base64').toString('base64') !== body.data)) throw Error('INVALID_INPUT');
  return body;
}
async function cloudRequest(body) {
  const origin = process.env.SUEDS_OMNIBEES_IMPORT_URL;
  const token = process.env.SUEDS_OMNIBEES_IMPORT_TOKEN;
  if (!/^https:\/\/sueds-capturas-piloto(?:-[a-z0-9]+-sueds1)?\.vercel\.app$/.test(origin || '') || !token) throw Error('NOT_CONFIGURED');
  const oidc = await require('@vercel/oidc').getVercelOidcToken();
  const route = body.action === 'file' ? `files/${body.index}` : body.action;
  const response = await fetch(`${origin}/omnibees-import/${body.action === 'latest' ? 'latest' : body.importId + '/' + route}`, {
    method: ['status', 'latest'].includes(body.action) ? 'GET' : 'POST', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'x-vercel-trusted-oidc-idp-token': oidc, 'Content-Type': body.action === 'file' ? 'text/csv' : 'application/json' },
    ...(['status', 'latest'].includes(body.action) ? {} : { body: body.action === 'file' ? Buffer.from(body.data, 'base64') : JSON.stringify(body.manifest || {}) }),
    signal: AbortSignal.timeout(body.action === 'complete' ? 240000 : 60000)
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('CONNECTION_FAILED');
  const value = await response.json();
  if (!response.ok) {
    const safe = ['CSV_VALIDATION_FAILED', 'FIVE_HOTELS_REQUIRED', 'FILES_MISSING', 'COVERAGE_GAP_OR_OVERLAP', 'SOURCE_LOCKED', 'NEWER_BASE_EXISTS', 'IMPORT_EXPIRED', 'STALE_CAPTURE_DATE', 'SPLIT_REPORT_PERIOD'];
    throw Error(safe.includes(value.error) ? value.error : 'CONNECTION_FAILED');
  }
  return value;
}
function safeResult(value) {
  if (!UUID.test(value.importId || '')) throw Error('INVALID_RESPONSE');
  const result = value.result || {};
  const count = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
  return { importId: value.importId, status: ['recebendo', 'recebido', 'concluido'].includes(value.status) ? value.status : 'indisponivel',
    mode: ['preview', 'production'].includes(value.mode) ? value.mode : null,
    result: { verified: result.verified === true, found: count(result.found), reservations: count(result.reservations), periods: count(result.periods),
      from: /^\d{4}-\d{2}-\d{2}$/.test(result.from || '') ? result.from : null, to: /^\d{4}-\d{2}-\d{2}$/.test(result.to || '') ? result.to : null } };
}
function handler({ profile = getPortalProfile, request = cloudRequest } = {}) {
  return async (req, res) => {
    try {
      const user = await profile(req, res);
      if (!user) return json(res, 401, { error: 'Login necessário.' });
      if (!user.roles?.includes('admin_geral')) return json(res, 403, { error: 'Acesso restrito aos administradores.' });
      if (req.method === 'GET') {
        const latest = await request({ action: 'latest' });
        if (latest.status === 'aguardando') return json(res, 200, { status: 'aguardando' });
        const value = safeResult(latest);
        return json(res, 200, { ...value, finished: Number.isFinite(Date.parse(latest.finished)) ? new Date(latest.finished).toISOString() : null });
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
      const headers = req.headers || {};
      if (!headers.origin || new URL(headers.origin).host !== headers.host || headers['sec-fetch-site'] === 'cross-site'
        || !String(headers['content-type'] || '').startsWith('application/json')) return json(res, 403, { error: 'Origem inválida.' });
      let body;
      try {
        body = req.body;
        if (body === undefined) {
          const chunks = []; let size = 0;
          for await (const chunk of req) { size += chunk.length; if (size > LIMIT) throw Error(); chunks.push(chunk); }
          body = Buffer.concat(chunks).toString('utf8');
        }
        if (Buffer.isBuffer(body)) body = body.toString('utf8');
        if (typeof body === 'string') { if (Buffer.byteLength(body) > LIMIT) throw Error(); body = JSON.parse(body); }
        if (Buffer.byteLength(JSON.stringify(body)) > LIMIT) throw Error();
        body = validate(body);
      } catch { return json(res, 400, { error: 'Arquivo ou lote inválido. Limite de 3 MiB por CSV.' }); }
      const value = safeResult(await request(body));
      if (value.importId !== body.importId) throw Error('INVALID_RESPONSE');
      return json(res, 200, value);
    } catch (error) {
      const messages = {
        CSV_VALIDATION_FAILED: 'O CSV não corresponde ao relatório detalhado ou seus controles divergem.',
        FIVE_HOTELS_REQUIRED: 'Um dos cinco hotéis está ausente no CSV. Solicite conferência.',
        FILES_MISSING: 'Ainda faltam arquivos do lote.', SOURCE_LOCKED: 'Há uma operação em andamento ou um bloqueio que precisa de revisão.',
        NEWER_BASE_EXISTS: 'Já existe uma base mais recente. Este lote foi preservado sem substituí-la.',
        IMPORT_EXPIRED: 'O prazo do lote terminou. Prepare um novo lote.', STALE_CAPTURE_DATE: 'O período do lote está desatualizado.',
        SPLIT_REPORT_PERIOD: 'Divida o período no relatório da Omnibees e exporte novamente.',
        COVERAGE_GAP_OR_OVERLAP: 'Os períodos têm lacunas ou sobreposições.'
      };
      return json(res, 503, { error: messages[error.message] || 'Não foi possível concluir o envio. Preserve os arquivos e tente retomar o mesmo lote.' });
    }
  };
}
module.exports = handler();
module.exports.handler = handler;
module.exports.validate = validate;
module.exports.safeResult = safeResult;
