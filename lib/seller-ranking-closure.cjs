const { createHash } = require('node:crypto');
const SOURCE = 'seller_ranking_closed_v1';
function eligible(period, currentMonth) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period.month || '') && period.month < currentMonth
    && !period.day && !period.hotel && !period.channel && !period.weekday;
}
function digest(metrics) {
  return createHash('sha256').update(JSON.stringify({ sellers: metrics.sellers, summary: metrics.summary, detailedSales: metrics.detailedSales })).digest('hex');
}
async function read(request, month) {
  const rows = await request(`dashboard_snapshots?source=eq.${SOURCE}&period_date=eq.${month}-01&select=payload&limit=1`);
  return rows?.[0]?.payload || null;
}
async function save(request, metrics, actor, expectedDigest, workbook) {
  if (digest(metrics) !== expectedDigest) throw new Error('Os valores mudaram. Atualize e confira novamente antes de congelar.');
  const snapshot = { metrics, closedAt: new Date().toISOString(), closedBy: actor, digest: expectedDigest, workbook: workbook?.toString("base64") || null };
  // Plain INSERT plus the existing unique source/date index prevents overwriting a closure, including concurrent requests.
  await request('dashboard_snapshots', { method: 'POST', body: JSON.stringify({ source: SOURCE, period_month: metrics.period.month, period_date: `${metrics.period.month}-01`, payload: snapshot }) });
  const persisted = await read(request, metrics.period.month);
  if (persisted?.digest !== expectedDigest || persisted?.workbook !== snapshot.workbook) throw new Error("Não foi possível confirmar o fechamento salvo. Atualize a página para conferir.");
  return persisted;
}
function canonicalPeriod(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period.month || '')) return period;
  const [year, month] = period.month.split('-').map(Number);
  return { ...period, date: `${period.month}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` };
}
module.exports = { eligible, digest, read, save, canonicalPeriod };
