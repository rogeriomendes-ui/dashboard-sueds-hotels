const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../api/portal/integration-status');
const { buildPortalAccess } = require('../lib/portal-auth');
async function call(profile, method = 'GET', query = '') {
  let reads = 0; const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = JSON.parse(v); } };
  await createHandler({ profile: async () => profile, loadFound: async () => [], load: async () => { reads++; return { version: 1, generatedAt: '2026-10-13T23:00:00Z', channels: [], kpi: null }; } })({ method, url: '/api/portal/integration-status' + query }, res);
  return { ...res, reads };
}
test('sem login ou sem permissão não consulta a base privada', async () => {
  const a = await call(null), b = await call({ roles: ['gestor'], environments: ['painel_gestores'] });
  assert.equal(a.statusCode, 401); assert.equal(b.statusCode, 403); assert.equal(a.reads + b.reads, 0);
});
test('acesso individual ou admin permite consulta; resposta não é cacheada', async () => {
  for (const profile of [{ roles: [], environments: ['status_integracoes'] }, { roles: ['admin_geral'], environments: [] }]) {
    const result = await call(profile); assert.equal(result.statusCode, 200); assert.equal(result.reads, 1); assert.equal(result.headers['cache-control'], 'no-store');
  }
});
test('acesso somente ao novo módulo resolve a página inicial correta', () => {
  const access = buildPortalAccess({ roles: [], environments: ['status_integracoes'] }); assert.equal(access.landingPage, '/gestores?modulo=status_integracoes'); assert.equal(access.painel_gestores, false);
});
test('métodos de escrita bloqueados e filtros inválidos recebem 400', async () => {
  const profile = { roles: ['admin_geral'] };
  assert.equal((await call(profile, 'DELETE')).statusCode, 405);
  assert.equal((await call(profile, 'GET', '?from=2026-12-01&to=2026-01-01')).statusCode, 400);
});
test('conexão usa o banco do portal mesmo com variável legada de outro dashboard', async () => {
  const saved = { url: process.env.PORTAL_SUPABASE_URL, legacy: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, fetch: global.fetch };
  try {
    delete process.env.PORTAL_SUPABASE_URL; process.env.SUPABASE_URL = 'https://legacy.invalid'; process.env.SUPABASE_SECRET_KEY = 'test-only';
    let called = '';
    global.fetch = async url => { called = url; return { ok: true, json: async () => [] }; };
    const res = { setHeader() {}, end(v) { this.body = JSON.parse(v); } };
    await createHandler({ profile: async () => ({ roles: ['admin_geral'] }) })({ method: 'GET', url: '/api/portal/integration-status' }, res);
    assert.equal(res.statusCode, 200); assert.ok(called.startsWith('https://pjcmjytiovuukbkewxjj.supabase.co/rest/v1/'));
  } finally {
    for (const [key, value] of Object.entries({ PORTAL_SUPABASE_URL: saved.url, SUPABASE_URL: saved.legacy, SUPABASE_SECRET_KEY: saved.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    global.fetch = saved.fetch;
  }
});
