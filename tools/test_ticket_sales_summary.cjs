const assert = require('node:assert/strict');
const { __test: { normalizeRecord, buildMetrics } } = require('../server');
const { buildTicketSalesSummary } = require('../lib/ticket-sales-summary.cjs');
const sale = (product, date, total, status = 'Confirmada') => normalizeRecord({
  'Data Venda': date, 'Codigo Reserva': `${product}-${date}-${status}`,
  Hotel: 'SUEDS EXPERIENCIAS', 'Tipo de Apto': product, Canal: 'AFILIADO',
  Status: status, Adult: '2', Crian: '1', 'Valor Total': total, Recebido: total
});
const metrics = buildMetrics([
  sale('Ingresso Natal', '2025-12-01', 100),
  sale('Réveillon 2026 - Pista - Beach Club (1º Lote)', '2026-09-01', 200),
  sale('Réveillon 2026 - VIP Mesa compartilhada', '2026-10-01', 300),
  sale('Mesa fechada VIP Reveillon', '2026-11-18', 400),
  sale('Mesa fechada Reveillon', '2026-11-01', 500),
  sale('Ingresso Natal', '2026-11-19', 999),
  sale('Ingresso Natal', '2026-11-01', 999, 'Cancelada'),
  sale('Ingresso Natal', '2026-11-01', 999, 'Pendente'),
  sale('Ingresso Natal', '', 999)
], [], { date: '2026-11-18', month: '2026-11', ticketScope: 'all' });
const summary = buildTicketSalesSummary(metrics);
assert.equal(summary.through, '2026-11-18');
assert.deepEqual(summary.rows.map(row => [row.id, row.quantity, row.sales]), [
  ['natal', 3, 100], ['pista', 3, 200], ['vip', 3, 300], ['mesa', 6, 900]
]);
assert.equal(summary.quantity, 15);
assert.equal(summary.sales, 1500);
assert.equal(buildTicketSalesSummary({ period: metrics.period, detailedTickets: [] }).sales, 0);
console.log('PASS: resumo acumulado por categoria, histórico, data de corte e status.');
