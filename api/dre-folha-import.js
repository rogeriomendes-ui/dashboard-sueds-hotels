const { createHash } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { json } = require('../lib/portal-auth');

const DEFAULT_URL = 'https://pjcmjytiovuukbkewxjj.supabase.co';
const EXPECTED_HEADERS = [
  ['Código', 'Empresa', 'Líquido'],
  ['Encargos', 'Valor'],
  ['Evento', 'Descrição', 'Total'],
  ['Evento', 'Descrição', 'Total'],
  ['Empresa', 'Nome', 'Admissão', 'Salário'],
  ['Empresa', 'Nome', 'Demissão', 'Salário']
];

function validCapture(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (!/^[A-Z]{2,4}$/.test(payload.companyCode) || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(payload.month) || payload.month < '2025-01') return false;
  if (!Array.isArray(payload.sections) || payload.sections.length !== EXPECTED_HEADERS.length) return false;
  if (payload.sections.some((section, i) => !Array.isArray(section.rows) || JSON.stringify(section.headers) !== JSON.stringify(EXPECTED_HEADERS[i]) || section.rows.some(row => !Array.isArray(row) || row.length !== section.headers.length || row.some(cell => typeof cell !== 'string' || cell.length > 500)))) return false;
  if (!payload.totals || ['liquido', 'encargos', 'proventos', 'descontos'].some(key => !Number.isFinite(payload.totals[key]))) return false;
  if (Math.abs(payload.totals.proventos - payload.totals.descontos - payload.totals.liquido) > 0.05) return false;
  if (typeof payload.companyName !== 'string' || payload.companyName.length > 150 || payload.source !== 'KPI Full · Relatórios · Consulta folha') return false;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(payload.capturedAt) || !/^[a-f0-9]{64}$/.test(payload.sha256)) return false;
  const normalized = { ...payload }; delete normalized.capturedAt; delete normalized.sha256;
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex') === payload.sha256;
}

function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.PORTAL_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

module.exports = async function importFolha(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!req.portalProfile?.roles?.includes('admin_geral')) return json(res, 403, { error: 'forbidden' });
  let payload;
  try { payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return json(res, 400, { error: 'invalid_json' }); }
  if (!payload || JSON.stringify(payload).length > 900000 || !validCapture(payload)) return json(res, 400, { error: 'invalid_capture' });
  const db = adminClient();
  if (!db) return json(res, 503, { error: 'database_not_configured' });
  const source = `kpi_folha_${payload.companyCode}`;
  const periodDate = `${payload.month}-01`;
  const current = await db.from('dashboard_snapshots').select('id').eq('source', source).eq('period_date', periodDate).maybeSingle();
  if (current.error) return json(res, 503, { error: 'database_read_failed' });
  const record = { source, period_month: payload.month, period_date: periodDate, payload };
  const result = current.data
    ? await db.from('dashboard_snapshots').update(record).eq('id', current.data.id)
    : await db.from('dashboard_snapshots').insert(record);
  if (result.error) return json(res, 503, { error: 'database_write_failed' });
  return json(res, 200, { ok: true, companyCode: payload.companyCode, month: payload.month, action: current.data ? 'updated' : 'inserted' });
};

module.exports.validCapture = validCapture;
