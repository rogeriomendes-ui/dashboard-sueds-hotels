const { getPortalProfile, hasEnvironment, json } = require('../../lib/portal-auth');
const { normalizeDataset, normalizeEvent, buildReport, invalid, csvCell, exportRows } = require('../../lib/observatory');
const store = require('../../lib/observatory-store');
const { syncAirport } = require('../../lib/observatory-airport');

async function readBody(req) {
  let body = req.body;
  if (body === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 2_000_000) throw invalid('Carga maior que 2 MB.'); chunks.push(Buffer.from(chunk)); }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > 2_000_000) throw invalid('Carga maior que 2 MB.');
  try { return typeof body === 'string' ? JSON.parse(body) : body; } catch { throw invalid('JSON inválido.'); }
}
function handler({ profile = getPortalProfile, storage = store, sync = syncAirport } = {}) {
  return async (req, res) => {
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return json(res, 405, { error: 'Método não permitido.' }); }
      const user = await profile(req, res);
      if (!user) return json(res, 401, { error: 'Login necessário.' });
      if (!hasEnvironment(user, 'observatorio_turismo')) return json(res, 403, { error: 'Acesso ao Observatório não autorizado.' });
      const admin = user.roles.includes('admin_geral');
      const params = new URL(req.url, 'http://localhost').searchParams;
      if (req.method === 'POST') {
        if (!admin) return json(res, 403, { error: 'Somente administradores podem atualizar fontes e eventos.' });
        const origin = req.headers.origin;
        if (!String(req.headers['content-type'] || '').startsWith('application/json') || !origin || new URL(origin).host !== req.headers.host || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Origem da solicitação inválida.' });
        const body = await readBody(req);
        if (body?.action === 'event') {
          const event = normalizeEvent(body.event);
          return json(res, 200, { event: await storage.saveEvent(event, user.id) });
        }
        if (!['import', 'sync-airport'].includes(body?.action)) throw invalid('Ação inválida.');
        const state = await storage.load();
        if (!state.storage.available) return json(res, 503, { error: state.storage.message });
        if (body.action === 'sync-airport') {
          const previous = state.datasets.find(d => (d.source_id || d.payload.sourceId) === 'airport');
          if (previous?.updated_at && Date.now() - Date.parse(previous.updated_at) < 3600000) return json(res, 429, { error: 'A fonte já foi atualizada nesta hora. Tente mais tarde.' });
        }
        try {
          const dataset = body.action === 'import' ? normalizeDataset(body.dataset) : await sync();
          const previous = state.datasets.find(d => (d.source_id || d.payload.sourceId) === dataset.sourceId)?.payload;
          if (body.action === 'sync-airport' && previous) {
            const incoming = new Map(dataset.rows.map(r => [r.period, r]));
            // Official pages may roll to a new year; keep the previously published months.
            dataset.rows = [...previous.rows.filter(r => !incoming.has(r.period)), ...dataset.rows];
          }
          const payload = normalizeDataset(dataset);
          if (previous?.digest === payload.digest) return json(res, 200, { message: 'Carga idêntica: nenhuma gravação necessária.' });
          if (body.action === 'import' && body.replace !== true) throw invalid('Confirme a substituição integral da fonte antes de importar.');
          await storage.saveDataset(payload, user.id);
          return json(res, 200, { message: `${payload.rows.length} registros validados e salvos.` });
        } catch (error) {
          await storage.recordFailure(body.action === 'sync-airport' ? 'airport' : 'import', user.id, error.status === 400 ? error.message : 'Falha de atualização da fonte.').catch(() => {});
          throw error;
        }
      }
      const state = await storage.load();
      const report = buildReport(state.datasets, state.events, params);
      const format = params.get('format');
      if (format && !['csv', 'xlsx'].includes(format)) throw invalid('Formato de exportação inválido.');
      if (format) {
        const rows = exportRows(report);
        const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Disposition', `attachment; filename="observatorio-${report.filters.from}-${report.filters.to}.${format}"`);
        if (format === 'csv') {
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          return res.end('\uFEFF' + [columns, ...rows.map(row => columns.map(c => row[c]))].map(row => row.map(csvCell).join(';')).join('\r\n'));
        }
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Observatório');
        sheet.columns = columns.map(key => ({ header: key, key, width: 24 }));
        sheet.addRows(rows);
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        const methodology = workbook.addWorksheet('Fontes e metodologia');
        methodology.addRow(['Filtros', JSON.stringify(report.filters)]);
        methodology.addRow(['Persistência', state.storage.available ? 'Disponível' : state.storage.message]);
        report.sources.forEach(s => methodology.addRow([s.name, s.sourceUrl, s.retrievedAt, s.note, s.notes]));
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.end(Buffer.from(await workbook.xlsx.writeBuffer()));
      }
      return json(res, 200, { ...report, storage: state.storage, canManage: admin && state.storage.available, runs: admin ? state.runs : [] });
    } catch (error) { return json(res, error.status || 503, { error: error.status ? error.message : 'Não foi possível consultar o Observatório. Tente novamente.' }); }
  };
}
module.exports = handler();
module.exports.handler = handler;
