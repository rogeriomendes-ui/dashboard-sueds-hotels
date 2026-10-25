async function readCaptureStart(response, defer) {
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let text = '';
  try {
    while (!text.includes('\n')) {
      const { done, value } = await reader.read();
      if (done) throw Error('CAPTURE_STREAM_INCOMPLETE');
      text += decoder.decode(value, { stream: true });
      if (text.length > 4096) throw Error('CAPTURE_STREAM_INVALID');
    }
    const accepted = JSON.parse(text.slice(0, text.indexOf('\n')));
    if (accepted.source !== 'kpi' || accepted.status !== 'executando' || !/^manual-kpi-[a-f0-9-]{36}$/.test(accepted.requestId)) throw Error('CAPTURE_STREAM_INVALID');
    // The Node runtime keeps this invocation alive while the container responds.
    const completion = (async () => {
      try { while (!(await reader.read()).done) {} }
      catch { console.warn('KPI_CAPTURE_STREAM_INTERRUPTED'); }
      finally { reader.releaseLock(); }
    })();
    defer(completion);
    return accepted;
  } catch (error) {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    throw error;
  }
}
module.exports = { readCaptureStart };
