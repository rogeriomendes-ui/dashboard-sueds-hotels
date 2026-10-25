const { getPortalProfile, json } = require('../../lib/portal-auth');
const SOURCES = ['deskhotel', 'kpi'];
const ORIGIN = 'https://sueds-capturas-piloto.vercel.app';

async function cloudRequest(source, start = false) {
  const token = process.env.SUEDS_CAPTURE_API_TOKEN;
  if (!token) throw Object.assign(new Error('CAPTURE_NOT_CONFIGURED'), { status: 503 });
  const oidc = await require('@vercel/oidc').getVercelOidcToken();
  const streaming = start && source === 'kpi';
  const response = await fetch(`${ORIGIN}/${start ? 'operations-start' : 'operation-status'}/${source}`, {
    method: start ? 'POST' : 'GET', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'x-vercel-trusted-oidc-idp-token': oidc,
      ...(streaming ? { Accept: 'application/x-ndjson' } : {}) },
    signal: AbortSignal.timeout(streaming ? 780000 : 25000)
  });
  if (streaming && response.status === 202 && response.headers.get('content-type')?.includes('application/x-ndjson')) {
    return require('../../lib/capture-stream').readCaptureStart(response, require('@vercel/functions').waitUntil);
  }
  if (!response.headers.get('content-type')?.includes('application/json')) throw Object.assign(new Error('CAPTURE_CONNECTION_FAILED'), { status: 503 });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(response.status === 409 && value.error === 'SOURCE_LOCKED' ? 'SOURCE_LOCKED' : 'CAPTURE_CONNECTION_FAILED'), { status: response.status === 409 ? 409 : 503 });
  return value;
}
function safeStatus(source, value) {
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const result = value.result || {};
  const targets = Object.fromEntries(Object.entries(result.targets || {}).filter(([name, data]) => typeof data === 'object' && (name === 'VENDA GERAL 26' || /^base kpi \d{4}$/.test(name))).map(([name, data]) => [name, { inserted: count(data.inserted), canceled: count(data.canceled) }]));
  return { source, status: ['executando', 'concluido', 'concluido-com-pendencias', 'falhou'].includes(value.status) ? value.status : 'indisponivel',
    requestId: typeof value.requestId === 'string' ? value.requestId.slice(0, 100) : null,
    started: value.started || null, finished: value.finished || null,
    code: typeof value.code === 'string' && /^[A-Z_0-9]{1,70}$/.test(value.code) ? value.code : null,
    result: { found: count(result.found), inserted: count(result.inserted), updatedStatus: count(result.updatedStatus), updatedData: count(result.updatedData), pending: count(result.pending),
      targets, attendants: result.attendants?.mode === 'gravado', occupancy: result.occupancy?.status === 'atualizado' } };
}
async function readBody(req) {
  let body = req.body;
  if (body === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 1024) throw Error('INVALID_BODY'); chunks.push(chunk); }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (typeof body === 'string') body = JSON.parse(body);
  if (!body || Object.keys(body).some(key => key !== 'source') || !SOURCES.includes(body.source)) throw Error('INVALID_BODY');
  return body;
}
function handler({ profile = getPortalProfile, request = cloudRequest } = {}) {
  return async (req, res) => {
    try {
      const user = await profile(req, res);
      if (!user) return json(res, 401, { error: 'Login necessário.' });
      if (!user.roles?.includes('admin_geral')) return json(res, 403, { error: 'Acesso restrito aos administradores.' });
      if (req.method === 'GET') {
        const captures = await Promise.all(SOURCES.map(async source => {
          try { return safeStatus(source, await request(source)); }
          catch { return { source, status: 'indisponivel' }; }
        }));
        return json(res, 200, { captures });
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return json(res, 405, { error: 'Método não permitido.' }); }
      const headers = req.headers || {};
      if (!String(headers['content-type'] || '').startsWith('application/json') || !headers.origin || new URL(headers.origin).host !== headers.host || headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Origem da solicitação inválida.' });
      let body;
      try { body = await readBody(req); } catch { return json(res, 400, { error: 'Informe DeskHotel ou KPI.' }); }
      const value = await request(body.source, true);
      return json(res, 202, { source: body.source, requestId: value.requestId, status: value.status });
    } catch (error) {
      return json(res, error.status === 409 ? 409 : 503, { error: error.message === 'SOURCE_LOCKED' ? 'Esta captura já está em execução.' : 'Não foi possível acessar as capturas. Tente novamente em alguns instantes.' });
    }
  };
}
module.exports = handler();
module.exports.handler = handler;
module.exports.safeStatus = safeStatus;
