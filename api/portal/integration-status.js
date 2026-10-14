const { getPortalProfile, hasEnvironment, json } = require('../../lib/portal-auth');
const { report } = require('../../lib/integration-status');

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
function handler({ profile = getPortalProfile, load = loadSnapshot } = {}) {
  return async (req, res) => {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: 'Método não permitido.' }); }
    try {
      const user = await profile(req, res);
      if (!user) return json(res, 401, { error: 'Login necessário.' });
      if (!hasEnvironment(user, 'status_integracoes')) return json(res, 403, { error: 'Acesso não liberado para este usuário.' });
      const snapshot = await load();
      if (!snapshot) return json(res, 200, { available: false, message: 'Aguardando a publicação das capturas pelo programa local.' });
      const url = new URL(req.url, 'https://portalsueds.com.br');
      return json(res, 200, { available: true, ...report(snapshot, Object.fromEntries(url.searchParams)) });
    } catch (error) { return json(res, error.status || 503, { error: error.status === 400 ? error.message : 'Não foi possível consultar a conferência. Tente novamente.' }); }
  };
}
module.exports = handler();
module.exports.createHandler = handler;
