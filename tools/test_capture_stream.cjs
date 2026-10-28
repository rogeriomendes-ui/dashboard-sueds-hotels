const test = require('node:test');
const assert = require('node:assert/strict');
const { readCaptureStart } = require('../lib/capture-stream');
const ack = { source: 'kpi', status: 'executando', requestId: 'manual-kpi-12345678-1234-1234-1234-123456789abc' };
for (const source of ['deskhotel', 'kpi']) test(source + ': acknowledges before EOF and retains the reader until completion', async () => {
  const ack = { source, status: 'executando', requestId: 'manual-' + source + '-12345678-1234-1234-1234-123456789abc' };
  let controller, completion, finished = false;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }));
  const bytes = new TextEncoder().encode(JSON.stringify(ack) + '\n');
  controller.enqueue(bytes.slice(0, 12)); controller.enqueue(bytes.slice(12));
  assert.deepEqual(await readCaptureStart(response, promise => { completion = promise.then(() => { finished = true; }); }), ack);
  assert.equal(finished, false);
  controller.enqueue(new TextEncoder().encode('\n')); controller.close();
  await completion; assert.equal(finished, true);
});
test('rejects missing or invalid acknowledgement without scheduling work', async () => {
  for (const text of ['{}\n', JSON.stringify(ack), 'x'.repeat(4097), JSON.stringify({ ...ack, source: 'deskhotel' }) + '\n']) {
    await assert.rejects(readCaptureStart(new Response(text), () => assert.fail('unexpected background task')));
  }
});
