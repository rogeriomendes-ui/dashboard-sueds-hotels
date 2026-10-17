const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../api/portal/captures');
async function invoke(options, input = {}) {
  const req = { method: 'GET', headers: { host: 'portal.suedshotels.com.br', origin: 'https://portal.suedshotels.com.br', 'content-type': 'application/json' }, ...input };
  const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  await handler(options)(req, res);
  return { status: res.statusCode, body: res.body };
}
test('Somente administrador autenticado pode consultar ou iniciar capturas', async () => {
  for (const method of ['GET', 'POST']) for (const user of [null, { roles: ['gestor'] }]) {
    const result = await invoke({ profile: async () => user, request: async () => assert.fail('Não pode acessar a nuvem') }, { method, body: { source: 'kpi', admin: true } });
    assert.equal(result.status, user ? 403 : 401);
  }
});
const profile = async () => ({ roles: ['admin_geral'] });
test('Resumo exclui erros privados e mantém cada sistema independente', async () => {
  const result = await invoke({ profile, request: async source => {
    if (source === 'kpi') throw Error('segredo');
    return { status: 'concluido', requestId: 'safe', message: 'segredo', result: { found: 287, credentials: 'segredo', targets: { private: { inserted: 1 } } } };
  } });
  assert.equal(result.status, 200);
  assert.equal(result.body.captures[0].result.found, 287);
  assert.equal(result.body.captures[1].status, 'indisponivel');
  assert.equal(JSON.stringify(result).includes('segredo'), false);
});
test('Comando rejeita origem externa e corpo com opções não autorizadas', async () => {
  const options = { profile, request: async () => assert.fail('Comando inválido') };
  assert.equal((await invoke(options, { method: 'POST', headers: { host: 'portal.suedshotels.com.br', origin: 'https://outro.com', 'content-type': 'application/json' }, body: { source: 'kpi' } })).status, 403);
  for (const body of [{ source: 'outro' }, { source: 'kpi', url: 'https://outro.com' }, { source: 'deskhotel', commit: true }]) {
    assert.equal((await invoke(options, { method: 'POST', body })).status, 400);
  }
});
test('Comando encaminha somente fonte permitida e retorna confirmação sem dados internos', async () => {
  const result = await invoke({ profile, request: async (source, start) => {
    assert.equal(source, 'deskhotel'); assert.equal(start, true);
    return { requestId: 'manual-safe', status: 'executando', token: 'segredo' };
  } }, { method: 'POST', body: { source: 'deskhotel' } });
  assert.deepEqual(result, { status: 202, body: { source: 'deskhotel', requestId: 'manual-safe', status: 'executando' } });
});
