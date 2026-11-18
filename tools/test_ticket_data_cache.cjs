const assert = require('node:assert/strict');
const { createTicketDataCache } = require('../lib/ticket-data-cache.cjs');
(async () => {
  let clock = 0, calls = 0, fail = false;
  const waits = [];
  const cache = createTicketDataCache({ now: () => clock, random: () => 0,
    sleep: async ms => { waits.push(ms); clock += ms; },
    read: async () => { calls++; if (fail) throw new Error('Google Sheets request failed: 429 quota'); return [{ total: calls }]; }
  });
  const concurrent = await Promise.all(Array.from({ length: 10 }, () => cache()));
  assert.equal(calls, 1, 'card and exports must share one pending read');
  assert.equal(concurrent[0].stale, false);
  assert.deepEqual(await cache(), concurrent[0]);
  clock = 60000;
  fail = true;
  const stale = await cache();
  assert.equal(calls, 5);
  assert.deepEqual(waits, [1000, 2000, 4000]);
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, 0, 'failure must not renew data timestamp');
  await cache();
  assert.equal(calls, 5, 'cooldown must prevent repeated retry storms');
  clock = 128000;
  fail = false;
  assert.equal((await cache()).stale, false);
  assert.equal(calls, 6);
  clock = 429000;
  fail = true;
  await assert.rejects(cache(), /429/, 'expired data must not be used');
  await assert.rejects(cache(), /429/);
  assert.equal(calls, 10);
  let recover = false, attempts = 0;
  const cold = createTicketDataCache({ sleep: async () => {}, read: async () => {
    attempts++;
    if (!recover) { recover = true; throw new Error('Google Sheets request failed: 503 unavailable'); }
    return [];
  } });
  assert.deepEqual((await cold()).records, []);
  assert.equal(attempts, 2, 'first load must recover from temporary failures');
  const denied = createTicketDataCache({ read: async () => { throw new Error('Google Sheets request failed: 403 forbidden'); }, sleep: async () => { throw new Error('must not retry'); } });
  await assert.rejects(denied(), /403/);
  await assert.rejects(denied(), /403/, 'failed promises must not remain stuck');
  console.log('PASS: shared cache, concurrent reads, backoff, cooldown, bounded stale data, recovery and permanent errors.');
})().catch(error => { console.error(error); process.exitCode = 1; });
