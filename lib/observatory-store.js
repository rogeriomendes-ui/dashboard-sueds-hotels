const { supabaseConfig } = require('./portal-auth');
const { normalizeDataset } = require('./observatory');
const initial = normalizeDataset(require('../data/observatory-airport.json'));
const COLUMNS = 'source_id,payload,updated_at';

async function request(resource, options = {}) {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw Object.assign(new Error('Persistência indisponível. Configure o acesso de servidor ao projeto SUEDS existente.'), { status: 503 });
  const response = await fetch(`${supabaseConfig().url}/rest/v1/${resource}`, {
    ...options, signal: AbortSignal.timeout(15000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...options.headers }
  });
  if (!response.ok) throw Object.assign(new Error('Não foi possível acessar as tabelas do Observatório no projeto SUEDS. Verifique a preparação do módulo.'), { status: 503 });
  if (response.status === 204) return null;
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
async function load() {
  try {
    const [datasets, events, runs] = await Promise.all([
      request(`observatory_datasets?select=${COLUMNS}&limit=5`),
      request('observatory_events?select=id,title,region,locality,starts_on,ends_on,category,status,source_url,notes,updated_at&order=starts_on.asc,id.asc&limit=1001'),
      request('observatory_audit?select=action,source_id,created_at,details&order=created_at.desc,id.desc&limit=20')
    ]);
    if (events.length > 1000) throw Object.assign(new Error('O calendário excedeu o limite desta versão. Refine a consulta no servidor antes de continuar.'), { status: 503 });
    return { datasets: datasets.some(d => d.source_id === 'airport') ? datasets : [{ payload: initial, updated_at: null }, ...datasets], events, runs, storage: { available: true, message: '' } };
  } catch (error) {
    return { datasets: [{ payload: initial, updated_at: null }], events: [], runs: [], storage: { available: false, message: error.status === 503 ? error.message : 'A base está temporariamente indisponível. Exibindo somente a carga oficial incluída no módulo.' } };
  }
}
async function saveDataset(payload, actor) {
  await request('observatory_datasets?on_conflict=source_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ source_id: payload.sourceId, payload, digest: payload.digest, updated_by: actor }) });
}
async function saveEvent(event, actor) {
  const { id, ...values } = event;
  const resource = id ? `observatory_events?id=eq.${encodeURIComponent(id)}` : 'observatory_events';
  const rows = await request(resource, { method: id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...values, updated_by: actor }) });
  if (!rows?.length) throw Object.assign(new Error('Evento não encontrado.'), { status: 404 });
  return rows[0];
}
async function recordFailure(sourceId, actor, message) {
  await request('observatory_audit', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ action: 'failure', source_id: sourceId, actor_id: actor, details: { message: message.slice(0, 300) } }) });
}
module.exports = { load, saveDataset, saveEvent, recordFailure };
