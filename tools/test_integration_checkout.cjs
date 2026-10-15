const test = require('node:test');
const assert = require('node:assert/strict');
const { report } = require('../lib/integration-status');
test('check-out de ontem é excluído de todos os totais e listas; hoje e futuro permanecem', () => {
  const records = [
    ['ontem', '2026-10-13', 'missing'], ['hoje', '2026-10-14', 'missing'],
    ['futuro', '2027-01-01', 'matched'], ['antigo-match', '2026-10-12', 'matched'],
    ['antigo-review', '2026-10-13', 'review'], ['antigo-uncovered', '2026-10-13', 'uncovered'],
    ['BR-hoje', '14/10/2026', 'matched'], ['BR-ontem', '13/10/2026', 'missing'],
    ['invalida', '', 'missing']
  ].map(([code, checkout, situation]) => ({ code, checkout, situation, numberMismatch: situation === 'matched', saleDate: '2026-01-10', hotel: 'SUEDS PLAZA' }));
  const snapshot = { version: 1, channels: [{ source: 'omnibees', available: true, from: '2026-01-01', to: '2026-10-13', hotels: ['SUEDS PLAZA'], records }] };
  // Às 01h UTC ainda é dia 14 em Brasília.
  const options = { now: new Date('2026-10-15T01:00:00Z') };
  const data = report(snapshot, { situation: 'all' }, options);
  assert.equal(data.checkoutFrom, '2026-10-14');
  assert.deepEqual(data.details.map(r => r.code).sort(), ['BR-hoje', 'futuro', 'hoje']);
  assert.deepEqual(data.summary, { confirmed: 3, missing: 1, matched: 2, uncovered: 0, review: 0, differentNumber: 2 });
  assert.equal(data.channels[0].confirmed, 3);
  assert.equal(report(snapshot, { situation: 'missing' }, options).totalDetails, 1);
  assert.equal(report(snapshot, { situation: 'different_number' }, { ...options, allDetails: true }).totalDetails, 2);
  assert.equal(report(snapshot, { situation: 'all' }, { now: new Date('2026-10-15T03:00:00Z') }).totalDetails, 1);
});
