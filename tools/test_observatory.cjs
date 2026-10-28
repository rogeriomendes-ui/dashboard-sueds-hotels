const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const ExcelJS = require('exceljs');
const { normalizeDataset, normalizeEvent, buildReport, csvCell } = require('../lib/observatory');
const { parseAirport } = require('../lib/observatory-airport');
const { convert } = require('./prepare_observatory_anac.cjs');
const { handler } = require('../api/portal/observatorio');
const { buildPortalAccess } = require('../lib/portal-auth');
const seed = require('../data/observatory-airport.json');
const data = normalizeDataset(seed);
const admin = { id: '00000000-0000-4000-8000-000000000001', roles: ['admin_geral'], environments: [] };
const reader = { id: admin.id, roles: [], environments: ['observatorio_turismo'] };
const event = { title: 'Evento de teste', region: 'Porto Seguro', locality: 'Centro', startsOn: '2025-07-31', endsOn: '2025-08-02', category: 'cultural', status: 'previsto', sourceUrl: 'https://example.org/event', notes: '' };
function storage() {
  const state = { datasets: [{ payload: data }], events: [], runs: [], storage: { available: true, message: '' } };
  const calls = [];
  return { state, calls, load: async () => state, saveDataset: async (...args) => calls.push(['dataset', ...args]), saveEvent: async (...args) => { calls.push(['event', ...args]); return args[0]; }, recordFailure: async (...args) => calls.push(['failure', ...args]) };
}
async function request(options = {}) {
  const db = options.db || storage(); const headers = {};
  const req = { method: options.method || 'GET', url: options.url || '/api/portal/observatorio', headers: { host: 'localhost:3210', origin: 'http://localhost:3210', 'content-type': 'application/json', ...options.headers }, body: options.body };
  const res = { statusCode: 200, setHeader: (key, value) => { headers[key.toLowerCase()] = value; }, end: value => { res.body = value; } };
  await handler({ profile: async () => options.user === undefined ? admin : options.user, storage: db, sync: options.sync || (async () => data) })(req, res);
  return { status: res.statusCode, body: res.body, json: () => JSON.parse(res.body), headers, calls: db.calls };
}
test('carga oficial confere com os totais publicados; agosto vazio não vira zero', () => {
  const report = buildReport([data], [], new URLSearchParams('from=2025-01&to=2025-08'));
  assert.deepEqual(report.totals, { passengers: 1489813, flights: 10362, seats: null });
  assert.equal(report.monthly[7].current, null);
  assert.deepEqual(report.coverage, { available: 7, expected: 8 });
  assert.equal(report.monthly[0].change, null);
});
test('mês anterior anual é alinhado por mês, usando a mesma fonte', () => {
  const prior = { ...data.rows[0], period: '2024-01', passengers: 200000, boardings: 100000, landings: 100000 };
  const report = buildReport([{ ...data, rows: [prior, ...data.rows] }], [], new URLSearchParams('from=2025-01&to=2025-01'));
  assert.equal(report.monthly[0].previous.passengers, 200000);
  assert.ok(Math.abs(report.monthly[0].change - 42.3585) < 0.00001);
});
test('ANAC não é somada ao aeroporto e origem considera apenas chegadas', () => {
  const anac = normalizeDataset({ sourceId: 'anac', sourceUrl: seed.sourceUrl, retrievedAt: seed.retrievedAt, rows: [{ period: '2025-01', origin: 'SBGR', destination: 'SBPS', airline: 'TAM', nature: 'Doméstica', passengers: 10, seats: 20, flights: 1 }, { period: '2025-01', origin: 'SBPS', destination: 'SBGR', airline: 'TAM', nature: 'Doméstica', passengers: 11, seats: 20, flights: 1 }] });
  const report = buildReport([data, anac], [], new URLSearchParams('from=2025-01&to=2025-01&aviationSource=anac'));
  assert.equal(report.totals.passengers, 21); assert.equal(report.routes[0].passengers, 10);
  assert.equal(report.routes.length, 1);
});
test('validação rejeita datas, duplicatas, inconsistências e tipos numéricos inválidos', () => {
  assert.throws(() => normalizeDataset({ ...seed, rows: [seed.rows[0], seed.rows[0]] }), /duplicada/);
  assert.throws(() => normalizeDataset({ ...seed, retrievedAt: '2025-02-31' }), /Data inválida/);
  for (const field of ['passengers', 'arrivals', 'departures']) assert.throws(() => normalizeDataset({ ...seed, rows: [{ ...seed.rows[0], [field]: -1 }] }));
  assert.throws(() => normalizeDataset({ ...seed, rows: [{ ...seed.rows[0], passengers: '284717' }] }));
  assert.throws(() => normalizeDataset({ ...seed, rows: [{ ...seed.rows[0], passengers: 1 }] }), /diverge/);
  assert.throws(() => normalizeDataset({ ...seed, sourceUrl: 'javascript:alert(1)' }));
  assert.throws(() => buildReport([data], [], new URLSearchParams('from=2025-12&to=2025-01')));
  assert.throws(() => buildReport([data], [], new URLSearchParams('from=2020-01&to=2025-01')));
});
test('dados da Bahia permanecem na Bahia e métodos não são somados', () => {
  const tourism = normalizeDataset({ sourceId: 'setur', sourceUrl: seed.sourceUrl, retrievedAt: seed.retrievedAt, rows: [{ period: '2025-01', region: 'Bahia', indicator: 'Ocupação', value: 80, unit: '%', method: 'pesquisa pontual', methodology: 'Amostra específica', market: 'Brasil' }] });
  assert.equal(buildReport([data, tourism], [], new URLSearchParams('region=Porto+Seguro')).tourism.length, 0);
  assert.equal(buildReport([data, tourism], []).tourism[0].method, 'pesquisa pontual');
});
test('eventos que atravessam o início do mês são incluídos; cancelados são preservados', () => {
  const row = normalizeEvent({ ...event, status: 'cancelado' });
  assert.equal(buildReport([data], [row], new URLSearchParams('from=2025-08&to=2025-08')).events.length, 1);
  assert.throws(() => normalizeEvent({ ...event, endsOn: '2025-01-01' }));
  assert.throws(() => normalizeEvent({ ...event, sourceUrl: 'http://example.org' }));
});
test('parser do aeroporto rejeita HTML incompleto e preserva meses em branco', () => {
  const html = '<table><tr><th>2025</th><th>Embarque</th><th>Desembarque</th></tr><tr><td>Janeiro</td><td>1.006</td><td>1.006</td><td>2.012</td><td>147.955</td><td>136.762</td><td>284.717</td></tr><tr><td>Agosto</td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>';
  assert.equal(parseAirport(html, '2026-10-27').rows.length, 1);
  assert.throws(() => parseAirport('<html>Manutenção</html>', '2026-10-27'), /não retornou/);
  assert.throws(() => parseAirport(html.replace('2.012', '9'), '2026-10-27'), /inconsistente/);
});
test('conversor ANAC filtra SBPS, agrega grupos e mantém ausência de assentos', async () => {
  const header = 'EMPRESA (SIGLA);ANO;MÊS;AEROPORTO DE ORIGEM (SIGLA);AEROPORTO DE DESTINO (SIGLA);NATUREZA;GRUPO DE VOO;PASSAGEIROS PAGOS;PASSAGEIROS GRÁTIS;DECOLAGENS;ASSENTOS';
  const raw = [header, 'TAM;2025;1;SBGR;SBPS;DOMÉSTICA;REGULAR;10;1;1;20', 'TAM;2025;1;SBGR;SBPS;DOMÉSTICA;NÃO REGULAR;5;0;1;', 'TAM;2025;1;SBGR;SBRF;DOMÉSTICA;REGULAR;90;1;1;100'].join('\n');
  const result = await convert(Readable.from([raw]), { sourceUrl: seed.sourceUrl, retrievedAt: seed.retrievedAt, from: '2025-01', to: '2025-12' });
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].passengers, 16); assert.equal(result.rows[0].seats, null);
  await assert.rejects(convert(Readable.from(['invalid']), { sourceUrl: seed.sourceUrl, retrievedAt: seed.retrievedAt, from: '2025-01', to: '2025-12' }), /Cabeçalho/);
});
test('API nega anônimo, usuário sem ambiente e escrita por leitor', async () => {
  assert.equal((await request({ user: null })).status, 401);
  assert.equal((await request({ user: { roles: [], environments: [] } })).status, 403);
  const result = await request({ user: reader, method: 'POST', body: { action: 'event', event } });
  assert.equal(result.status, 403); assert.equal(result.calls.length, 0);
  assert.equal((await request({ user: reader })).status, 200);
});
test('novo ambiente resolve a página inicial e não autoriza ambientes antigos', () => {
  const access = buildPortalAccess(reader);
  assert.equal(access.landingPage, '/gestores?modulo=observatorio_turismo');
  assert.equal(access.painel_gestores, false);
});
test('API nega origem cruzada e importação sem confirmação', async () => {
  const cross = await request({ method: 'POST', headers: { origin: 'https://evil.example' }, body: { action: 'event', event } });
  assert.equal(cross.status, 403); assert.equal(cross.calls.length, 0);
  const result = await request({ method: 'POST', body: { action: 'import', dataset: { ...seed, notes: 'Nova consulta' } } });
  assert.equal(result.status, 400); assert.equal(result.calls.filter(c => c[0] === 'dataset').length, 0);
});
test('validação inválida não grava; importação idêntica é idempotente', async () => {
  const bad = await request({ method: 'POST', body: { action: 'import', replace: true, dataset: { ...seed, rows: [] } } });
  assert.equal(bad.status, 400); assert.equal(bad.calls[0][0], 'failure');
  const repeat = await request({ method: 'POST', body: { action: 'import', replace: true, dataset: seed } });
  assert.equal(repeat.status, 200); assert.equal(repeat.calls.length, 0);
});
test('eventos auditáveis usam ID do usuário autenticado', async () => {
  const result = await request({ method: 'POST', body: { action: 'event', event } });
  assert.equal(result.status, 200); assert.equal(result.calls[0][2], admin.id);
});
test('falha da fonte preserva carga e registra falha sem expor erro interno', async () => {
  const result = await request({ method: 'POST', body: { action: 'sync-airport' }, sync: async () => { throw new Error('private diagnostic'); } });
  assert.equal(result.status, 503); assert.equal(result.calls.length, 1); assert.equal(result.calls[0][0], 'failure');
  assert.ok(!result.body.includes('private diagnostic'));
});
test('sincronização limita frequência e preserva meses de anos anteriores', async () => {
  const db = storage(); db.state.datasets[0].updated_at = new Date().toISOString();
  assert.equal((await request({ db, method: 'POST', body: { action: 'sync-airport' } })).status, 429);
  const next = normalizeDataset({ ...seed, retrievedAt: '2026-10-28', rows: [{ ...seed.rows[0], period: '2026-01' }] });
  const result = await request({ method: 'POST', body: { action: 'sync-airport' }, sync: async () => next });
  assert.equal(result.status, 200); assert.equal(result.calls[0][1].rows.length, 8);
  assert.equal(result.calls[0][1].rows.find(r => r.period === '2025-01').observedAt, '2026-10-27');
  assert.equal(result.calls[0][1].rows.find(r => r.period === '2026-01').observedAt, '2026-10-28');
});
test('exportação CSV inclui fonte, filtros e protege fórmulas', async () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  const result = await request({ user: reader, url: '/api/portal/observatorio?from=2025-01&to=2025-01&format=csv' });
  assert.equal(result.status, 200); assert.match(result.headers['content-type'], /text\/csv/);
  assert.match(result.body, /284717/); assert.match(result.body, /url_fonte/); assert.ok(!result.body.includes('176017'));
});
test('Excel real abre com abas de dados e metodologia', async () => {
  const result = await request({ user: reader, url: '/api/portal/observatorio?from=2025-01&to=2025-01&format=xlsx' });
  assert.equal(result.status, 200);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(result.body);
  assert.equal(workbook.worksheets.length, 2); assert.equal(workbook.worksheets[0].rowCount, 2);
  assert.equal(workbook.worksheets[1].name, 'Fontes e metodologia');
});

test('ANAC preserva null por métrica, inclusive em rotas, totais e comparação anual', async () => {
  const header = 'EMPRESA_SIGLA;ANO;MES;AEROPORTO_DE_ORIGEM_SIGLA;AEROPORTO_DE_DESTINO_SIGLA;NATUREZA;GRUPO_DE_VOO;PASSAGEIROS_PAGOS;PASSAGEIROS_GRATIS;DECOLAGENS;ASSENTOS';
  const input = 'Atualizado em: 2026-10-27\n' + header + '\nTAM;2025;1;SBGR;SBPS;DOMESTICA;REGULAR;10;0;1;20\nTAM;2025;1;SBGR;SBPS;DOMESTICA;REGULAR;;0;;\nTAM;2024;1;SBGR;SBPS;DOMESTICA;REGULAR;5;0;1;10\n';
  const dataset = await convert(Readable.from([input]), { sourceUrl: seed.sourceUrl, retrievedAt: seed.retrievedAt, from: '2024-01', to: '2025-01' });
  const row = dataset.rows.find(r => r.period === '2025-01');
  assert.equal(row.passengers, null); assert.equal(row.flights, null); assert.equal(row.seats, null);
  const report = buildReport([dataset], [], new URLSearchParams('from=2025-01&to=2025-01&aviationSource=anac'));
  assert.deepEqual(report.totals, { passengers: null, flights: null, seats: null });
  assert.equal(report.routes[0].passengers, null); assert.equal(report.routes[0].flights, null);
  assert.equal(report.monthly[0].change, null);
  assert.deepEqual(report.coverage, { available: 1, expected: 1 });
  assert.throws(() => normalizeDataset({ ...dataset, rows: [{ ...row, flights: '' }] }));
});
