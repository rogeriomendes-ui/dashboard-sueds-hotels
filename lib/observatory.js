const { createHash } = require('node:crypto');

const SOURCES = {
  airport: { name: 'Aeroporto de Porto Seguro', kind: 'airport', url: 'https://www.portoseguro-aero.com.br/estatisticas/', cadence: 'Conforme publicação', note: 'Movimentação inclui embarques, desembarques e conexões. Não representa turistas únicos.' },
  anac: { name: 'ANAC · etapas básicas', kind: 'aviation', url: 'https://www.gov.br/anac/pt-br/assuntos/dados-e-estatisticas/dados-estatisticos/dados-estatisticos', cadence: 'Mensal', note: 'Operações realizadas envolvendo SBPS. Origem do voo não é residência do passageiro. Dados sujeitos a revisão.' },
  setur: { name: 'SETUR / pesquisas oficiais', kind: 'tourism', url: 'https://www.observatorio.turismo.ba.gov.br/', cadence: 'Conforme estudo', note: 'Pesquisas pontuais, medições e estimativas permanecem separadas por território, período e metodologia.' },
  international: { name: 'MTur · turismo internacional', kind: 'tourism', url: 'https://dados.turismo.gov.br/dataset/chegada-de-turistas-internacionais', cadence: 'Conforme publicação', note: 'País de residência e território de referência devem constar na fonte. Não atribuir dados estaduais ao município.' },
  cadastur: { name: 'Cadastur · meios de hospedagem', kind: 'hotels', url: 'https://www.gov.br/turismo/pt-br/acesso-a-informacao/acoes-e-programas/cadastur/cadastur', cadence: 'Conforme extração', note: 'Cadastro de estabelecimentos, sem informação de ocupação ou preços.' }
};
const REGIONS = ['Porto Seguro', 'Santa Cruz Cabrália', 'Costa do Descobrimento', 'Bahia', 'Brasil'];
const MAX_ROWS = 5000;
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function text(value, max = 180, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw invalid('Texto ausente ou acima do limite.');
  return value.trim();
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw invalid('Data inválida. Use AAAA-MM-DD.');
  return value;
}
function month(value) {
  if (typeof value !== 'string' || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(value)) throw invalid('Mês inválido. Use AAAA-MM.');
  return value;
}
function number(value, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e10 || (integer && !Number.isSafeInteger(value))) throw invalid('Valor numérico inválido. Ausência de dados não pode ser convertida em zero.');
  return value;
}
function choice(value, choices) {
  if (!choices.includes(value)) throw invalid(`Valor inválido: use ${choices.join(', ')}.`);
  return value;
}
function sourceUrl(value) {
  const raw = text(value, 2000);
  let url;
  try { url = new URL(raw); } catch { throw invalid('URL de fonte inválida.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw invalid('A fonte deve ser uma URL HTTPS sem credenciais.');
  return url.href;
}
function normalizeRow(kind, row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw invalid('Registro inválido.');
  if (kind === 'airport') {
    const r = { period: month(row.period), region: 'Porto Seguro', arrivals: number(row.arrivals, true), departures: number(row.departures, true), boardings: number(row.boardings, true), landings: number(row.landings, true), passengers: number(row.passengers, true) };
    if (r.passengers !== r.boardings + r.landings) throw invalid('Total de passageiros diverge de embarques e desembarques.');
    return r;
  }
  if (kind === 'aviation') {
    const r = { period: month(row.period), region: 'Porto Seguro', origin: text(row.origin, 4), destination: text(row.destination, 4), originName: text(row.originName || row.origin), destinationName: text(row.destinationName || row.destination), airline: text(row.airline, 80), nature: choice(row.nature, ['Doméstica', 'Internacional']), passengers: number(row.passengers, true), seats: row.seats == null ? null : number(row.seats, true), flights: number(row.flights, true) };
    if (!/^[A-Z]{4}$/.test(r.origin) || !/^[A-Z]{4}$/.test(r.destination) || ![r.origin, r.destination].includes('SBPS') || r.origin === r.destination) throw invalid('A etapa deve ter origem ou destino SBPS e códigos ICAO válidos.');
    return r;
  }
  if (kind === 'tourism') {
    const r = { period: month(row.period), region: choice(row.region, REGIONS), indicator: text(row.indicator), value: number(row.value), unit: choice(row.unit, ['pessoas', '%', 'R$', 'dias']), method: choice(row.method, ['medida', 'pesquisa pontual', 'estimativa']), methodology: text(row.methodology, 1200), market: text(row.market || 'Não informado'), marketType: choice(row.marketType || 'não informado', ['residência', 'origem da viagem', 'não informado']) };
    if (r.unit === '%' && r.value > 100) throw invalid('Percentual deve estar entre 0 e 100.');
    return r;
  }
  return { externalId: text(row.externalId, 100), name: text(row.name), region: choice(row.region, REGIONS.slice(0, 3)), locality: text(row.locality || row.region), status: text(row.status, 80), registeredAt: date(row.registeredAt) };
}
function rowKey(kind, row) {
  return JSON.stringify(kind === 'airport' ? [row.period] : kind === 'aviation' ? [row.period, row.origin, row.destination, row.airline, row.nature] : kind === 'hotels' ? [row.externalId] : [row.period, row.region, row.indicator, row.market, row.marketType, row.method, row.methodology, row.unit]);
}
function normalizeDataset(input) {
  const source = Object.hasOwn(SOURCES, input?.sourceId || '') ? SOURCES[input.sourceId] : null;
  if (!source || !Array.isArray(input.rows) || !input.rows.length || input.rows.length > MAX_ROWS) throw invalid(`Fonte inválida ou quantidade fora de 1–${MAX_ROWS} registros.`);
  const seen = new Set();
  const rows = input.rows.map((row, index) => {
    try {
      const normalized = normalizeRow(source.kind, row);
      normalized.observedAt = date(row.observedAt || input.retrievedAt);
      const key = rowKey(source.kind, normalized);
      if (seen.has(key)) throw invalid('Chave duplicada na carga.');
      seen.add(key); return normalized;
    } catch (error) { throw invalid(`Linha ${index + 1}: ${error.message}`); }
  }).sort((a, b) => rowKey(source.kind, a).localeCompare(rowKey(source.kind, b)));
  const payload = { sourceId: input.sourceId, sourceUrl: sourceUrl(input.sourceUrl), retrievedAt: date(input.retrievedAt), notes: text(input.notes || '', 1200, false), rows };
  return { ...payload, digest: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
function normalizeEvent(input) {
  const result = { title: text(input.title), region: choice(input.region, REGIONS), locality: text(input.locality || input.region), starts_on: date(input.startsOn), ends_on: date(input.endsOn), category: choice(input.category, ['feriado', 'férias escolares', 'cultural', 'esportivo', 'congresso', 'show', 'outro']), status: choice(input.status, ['confirmado', 'previsto', 'cancelado']), source_url: sourceUrl(input.sourceUrl), notes: text(input.notes || '', 1200, false) };
  if (result.ends_on < result.starts_on) throw invalid('O fim do evento não pode ser anterior ao início.');
  if (input.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)) throw invalid('ID inválido.');
  if (input.id) result.id = input.id;
  return result;
}
function parseFilters(params, datasets) {
  const selectedSource = params.get('aviationSource') || 'airport';
  const periods = datasets.filter(d => (d.payload || d).sourceId === selectedSource).flatMap(d => (d.payload || d).rows.map(r => r.period).filter(Boolean)).sort();
  const last = periods.at(-1) || new Date().toISOString().slice(0, 7);
  const from = month(params.get('from') || `${last.slice(0, 4)}-01`);
  const to = month(params.get('to') || last);
  const span = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5)) - Number(from.slice(5));
  if (span < 0 || span > 23) throw invalid('Selecione até 24 meses, em ordem cronológica.');
  return { from, to, region: params.get('region') ? choice(params.get('region'), REGIONS) : '', aviationSource: choice(params.get('aviationSource') || 'airport', ['airport', 'anac']) };
}
function monthsBetween(from, to) {
  const result = [];
  for (let cursor = new Date(`${from}-01T00:00:00Z`); cursor.toISOString().slice(0, 7) <= to; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) result.push(cursor.toISOString().slice(0, 7));
  return result;
}
function sum(rows, field) { return rows.reduce((total, row) => total + (row[field] ?? 0), 0); }
function aggregate(rows, kind) {
  if (!rows.length) return null;
  return { passengers: sum(rows, 'passengers'), flights: kind === 'airport' ? sum(rows, 'arrivals') + sum(rows, 'departures') : sum(rows, 'flights'), seats: kind === 'airport' || rows.some(r => r.seats == null) ? null : sum(rows, 'seats') };
}
function buildReport(datasets, events, params = new URLSearchParams()) {
  const filters = parseFilters(params, datasets);
  const data = datasets.map(d => ({ ...d, payload: d.payload || d }));
  const bySource = Object.fromEntries(data.map(d => [d.payload.sourceId, d]));
  const aviation = (bySource[filters.aviationSource]?.payload.rows || []).filter(r => !filters.region || r.region === filters.region);
  const kind = SOURCES[filters.aviationSource].kind;
  const monthly = monthsBetween(filters.from, filters.to).map(period => {
    const previousPeriod = `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
    const current = aggregate(aviation.filter(r => r.period === period), kind);
    const previous = aggregate(aviation.filter(r => r.period === previousPeriod), kind);
    return { period, current, previous, change: current && previous?.passengers > 0 ? (current.passengers / previous.passengers - 1) * 100 : null };
  });
  const filtered = aviation.filter(r => r.period >= filters.from && r.period <= filters.to);
  const routes = new Map();
  if (kind === 'aviation') filtered.filter(r => r.destination === 'SBPS').forEach(r => {
    const key = `${r.origin}|${r.nature}`;
    const group = routes.get(key) || { origin: r.origin, name: r.originName, nature: r.nature, passengers: 0, flights: 0 };
    group.passengers += r.passengers; group.flights += r.flights; routes.set(key, group);
  });
  const selected = row => (!filters.region || row.region === filters.region) && (!row.period || row.period >= filters.from && row.period <= filters.to);
  const tourism = ['setur', 'international'].flatMap(id => (bySource[id]?.payload.rows || []).filter(selected).map(r => ({ ...r, sourceId: id })));
  const hotels = (bySource.cadastur?.payload.rows || []).filter(selected);
  const matchingEvents = events.filter(e => (!filters.region || e.region === filters.region || e.region === 'Brasil' || e.region === 'Bahia' && ['Porto Seguro', 'Santa Cruz Cabrália', 'Costa do Descobrimento'].includes(filters.region)) && e.starts_on.slice(0, 7) <= filters.to && e.ends_on.slice(0, 7) >= filters.from);
  const sources = Object.entries(SOURCES).map(([id, definition]) => {
    const snapshot = bySource[id];
    return { id, ...definition, sourceUrl: snapshot?.payload.sourceUrl || definition.url, retrievedAt: snapshot?.payload.retrievedAt || null, updatedAt: snapshot?.updated_at || null, count: snapshot?.payload.rows.length || 0, notes: snapshot?.payload.notes || '', status: snapshot ? 'disponível' : 'aguardando carga' };
  });
  return { filters, sources, regions: REGIONS, monthly, totals: aggregate(filtered, kind), coverage: { available: monthly.filter(m => m.current).length, expected: monthly.length }, routes: [...routes.values()].sort((a, b) => b.passengers - a.passengers), tourism, hotels, events: matchingEvents, records: filtered };
}
function csvCell(value) {
  let cell = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}
function exportRows(report) {
  const source = id => report.sources.find(s => s.id === id);
  const rows = [];
  const add = (type, values, id, url) => {
    const s = source(id);
    rows.push({ tipo: type, ...values, fonte: s?.name || 'Cadastro autorizado', url_fonte: url || s?.sourceUrl || '', consulta_fonte: s?.retrievedAt || '', atualizado_em: s?.updatedAt || '', filtro_inicio: report.filters.from, filtro_fim: report.filters.to, filtro_regiao: report.filters.region || 'Todos' });
  };
  report.records.forEach(r => add('aviacao', r, report.filters.aviationSource));
  report.tourism.forEach(({ sourceId, ...r }) => add('turismo', r, sourceId));
  report.hotels.forEach(r => add('hotelaria', r, 'cadastur'));
  report.events.forEach(({ source_url, ...r }) => add('evento', r, null, source_url));
  return rows;
}
module.exports = { SOURCES, REGIONS, MAX_ROWS, invalid, normalizeDataset, normalizeEvent, buildReport, csvCell, exportRows };
