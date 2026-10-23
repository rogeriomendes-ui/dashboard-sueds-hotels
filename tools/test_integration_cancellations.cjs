const test = require('node:test');
const assert = require('node:assert/strict');
const { report } = require('../lib/integration-status');
const { validate } = require('../api/portal/integration-status-upload');
const row = { code: 'RES037496-6010', hotel: 'SUEDS SEGUNDO SOL', saleDate: '2026-10-16', checkin: '2026-12-18', checkout: '2026-12-23', guest: 'Teste', status: 'Cancelada', lineStatus: '', situation: 'cancellation_pending', matches: [{ code: '42', status: 'Confirmada' }], numberMismatch: false };
const snapshot = () => ({ version: 1, generatedAt: new Date().toISOString(), kpi: null, channels: ['omnibees', 'cvc', 'juniper', 'deskhotel'].map(source => ({ source, available: true, from: '2026-01-01', to: '2026-10-22', capturedAt: new Date().toISOString(), hotels: [row.hotel], records: source === 'cvc' ? [row] : [], cancelledRecords: source === 'cvc' ? [{ ...row, situation: undefined, matches: undefined }] : [] })) });
const now = new Date('2026-10-22T12:00:00Z');
test('cancelamento pendente tem filtro e contador próprios, sem inflar confirmadas ou não localizadas', () => {
  const data = snapshot();
  const result = report(data, { situation: 'cancellation_pending', source: 'cvc', to: '2026-10-22' }, { now });
  assert.equal(result.summary.cancellation_pending, 1);
  assert.equal(result.summary.confirmed, 0);
  assert.equal(result.summary.missing, 0);
  assert.equal(result.details[0].matches[0].status, 'Confirmada');
  assert.equal(report(data, { situation: 'missing', to: '2026-10-22' }, { now }).details.length, 0);
  assert.equal(report(data, { situation: 'all', to: '2026-10-22' }, { now }).details.length, 1);
  assert.equal(report(data, { situation: 'cancellation_pending', source: 'juniper', to: '2026-10-22' }, { now }).details.length, 0);
});
test('upload aceita o alerta novo e evidências de cancelamento, mantendo validação de entradas', () => {
  assert.doesNotThrow(() => validate(snapshot()));
  const invalid = snapshot(); invalid.channels[1].cancelledRecords = 'inválido';
  assert.throws(() => validate(invalid));
  invalid.channels[1].cancelledRecords = [{ ...row, code: '' }];
  assert.throws(() => validate(invalid));
});

test('marcação Achei anterior não oculta nem resolve um cancelamento pendente', () => {
  const found = [{ source: 'cvc', hotel: row.hotel, code: row.code, note: 'Conferência anterior' }];
  const result = report(snapshot(), { situation: 'cancellation_pending', to: '2026-10-22' }, { now, found });
  assert.equal(result.summary.cancellation_pending, 1);
  assert.equal(result.summary.manualFound, 0);
  assert.equal(result.details[0].manualResolution, undefined);
  assert.equal(report(snapshot(), { situation: 'manual_found', to: '2026-10-22' }, { now, found }).details.length, 0);
});
