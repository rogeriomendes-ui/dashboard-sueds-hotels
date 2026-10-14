const test = require('node:test');
const assert = require('node:assert/strict');
const upload = require('../api/portal/integration-status-upload');
test('credencial de upload ausente nunca grava; GET não aceita credencial de máquina como acesso ao relatório', async () => {
  const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  await upload({ method: 'POST', headers: {} }, res); assert.equal(res.statusCode, 401);
  await upload({ method: 'GET', headers: {} }, res); assert.equal(res.statusCode, 405);
});
test('upload rejeita fonte repetida, cobertura inválida e payload antigo', () => {
  const payload = { version: 1, generatedAt: new Date().toISOString(), kpi: null, channels: ['omnibees', 'cvc', 'juniper', 'deskhotel'].map(source => ({ source, available: false, records: [] })) };
  assert.equal(upload.validate(payload), payload);
  assert.throws(() => upload.validate({ ...payload, generatedAt: '2020-01-01T00:00:00Z' }));
  assert.throws(() => upload.validate({ ...payload, channels: payload.channels.map(() => payload.channels[0]) }));
  assert.throws(() => upload.validate({ ...payload, channels: payload.channels.map(c => ({ ...c, available: true, from: '2026-02-30' })) }));
});
