const { parseDocument } = require('htmlparser2');
const { getElementsByTagName, textContent } = require('domutils');
const { SOURCES, invalid, normalizeDataset } = require('./observatory');
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
function parseAirport(html, retrievedAt) {
  const doc = parseDocument(html);
  const tables = getElementsByTagName('table', doc.children, true);
  const rows = [];
  for (const table of tables) {
    const content = getElementsByTagName('tr', [table], true).flatMap(tr => tr.children.filter(n => ['td', 'th'].includes(n.name)).map(n => textContent(n))).join(' ');
    if (!/Embarque/i.test(content) || !/Desembarque/i.test(content)) continue;
    const year = content.match(/\b20\d{2}\b/)?.[0];
    if (!year) throw invalid('Ano da tabela oficial não reconhecido.');
    for (const tr of getElementsByTagName('tr', [table], true)) {
      const cells = tr.children.filter(n => ['td', 'th'].includes(n.name)).map(n => textContent(n).replace(/\s+/g, ' ').trim());
      const index = MONTHS.findIndex(m => m.toLowerCase() === cells[0]?.toLowerCase());
      if (index < 0 || cells.slice(1).every(c => !c)) continue;
      if (cells.length !== 7 || cells.slice(1).some(c => !/^\d{1,3}(\.\d{3})*$|^\d+$/.test(c))) throw invalid('Formato da tabela mudou. A última carga válida foi preservada.');
      const [arrivals, departures, movements, boardings, landings, passengers] = cells.slice(1).map(c => Number(c.replace(/\./g, '')));
      if (arrivals + departures !== movements) throw invalid('Movimentação de aeronaves inconsistente na fonte.');
      rows.push({ period: `${year}-${String(index + 1).padStart(2, '0')}`, arrivals, departures, boardings, landings, passengers });
    }
  }
  if (!rows.length) throw invalid('A fonte não retornou uma tabela mensal reconhecida.');
  return normalizeDataset({ sourceId: 'airport', sourceUrl: SOURCES.airport.url, retrievedAt, notes: 'Tabela oficial. Embarques incluem conexões e isentos; meses em branco são ausentes.', rows });
}
async function syncAirport() {
  // Fixed official URL only: callers cannot make this endpoint fetch arbitrary hosts.
  const response = await fetch(SOURCES.airport.url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw invalid(`Fonte oficial indisponível (HTTP ${response.status}).`);
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 2_000_000) throw invalid('Fonte excedeu o limite de leitura.');
    chunks.push(Buffer.from(chunk));
  }
  return parseAirport(Buffer.concat(chunks).toString('utf8'), new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
}
module.exports = { parseAirport, syncAirport };
