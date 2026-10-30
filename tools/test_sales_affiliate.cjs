const assert = require('node:assert/strict');
const route = require('../lib/sales-routing');
const { normalizeRecord, buildMetrics, buildManagerPayload } = require('../server').__test;
const visible = 'Depto_Reservas - Loja online 💵 Afiliado: Rogerio\nMendes';
const origin = route.reconcileDeskhotelOrigin(visible, 'Depto_Reservas - Loja online');
const sale = route.normalizeDeskhotel({ codigo: 'CR29070365391', dataVenda: '2026-10-29',
  hotel: 'SUEDS EXPERIENCIAS', origin, status: 'Confirmada', formaPagamento: 'PIX' });
assert.equal(sale.canal, 'AFILIADO');
assert.equal(sale.vendedor, '');
assert.equal(sale.targetSheet, route.CHANNELS_SHEET);
assert.equal(sale.formaPagamento, 'PIX'); // No robot payment inference.
route.assertSalesWrite(sale, route.CHANNELS_SHEET);
assert.equal(route.normalizeDeskhotel({...sale, hotel:'Sued s Experiencias', origin}).hotel, 'SUEDS EXPERIENCIAS');
assert.equal(route.destination({dataVenda:'2026-08-31', canal:'AFILIADO'}), route.SELLERS_SHEET);
assert.equal(route.destination({dataVenda:'2026-10-29', canal:'AFILIADO'}), route.CHANNELS_SHEET);
assert.equal(route.reconcileDeskhotelOrigin(visible, visible), origin);
for (const exported of ['Depto_Reservas - Amanda Sales Melgaço', 'Booking', 'Depto_Reservas - Loja online Afiliado: Outra Pessoa']) {
  assert.throws(() => route.reconcileDeskhotelOrigin(visible, exported));
}
assert.throws(() => route.reconcileDeskhotelOrigin('Depto_Reservas - Loja online', visible));
assert.throws(() => route.reconcileDeskhotelOrigin('Depto_Reservas - Amanda Sales Melgaço', 'Depto_Reservas - Aline Nunes'));
assert.equal(route.classifyDeskhotel('Depto_Reservas - Amanda Sales Melgaço').sellerSale, true);
assert.equal(route.classifyDeskhotel('Depto_Reservas - Loja online').channel, 'SITE');
assert.equal(route.classifyDeskhotel('Alice').channel, 'Robo');
assert.equal(route.normalizeDeskhotel({...sale, origin:'Depto_Reservas - Aline Nunes Afiliado: Rogerio Mendes'}).vendedor, '');
const row = normalizeRecord({'Data Venda':'29/10/2026', 'Codigo Reserva':sale.codigo, Hotel:sale.hotel,
  Canal:sale.canal, Vendedor:'Rogerio Mendes', 'Valor Total':75, Recebido:75, Status:'Confirmada', Fonte:'DESKHOTEL'});
assert.equal(row.seller, ''); // Even a stale manual name cannot enter seller rankings.
const routed = route.dashboardSources([row], [row]);
assert.equal(routed.records.length, 1);
assert.equal(routed.otherChannelRecords.length, 0);
const period = {month:'2026-10', date:'2026-10-29'};
const metrics = buildMetrics(routed.records, [], period);
assert.equal(buildManagerPayload(metrics).summary.salesMonth, 75);
assert.equal(metrics.channels.find(c => c.label === 'AFILIADO').value, 75);
assert.equal(metrics.sellers.some(s => /rogerio|afiliado/i.test(s.name)), false);
assert.equal(metrics.filters.channels.includes('AFILIADO'), true);
assert.equal(buildMetrics(routed.records, [], {...period, channel:'AFILIADO'}).summary.salesMonth, 75);
assert.equal(buildMetrics(routed.records, [], {...period, channel:'SITE'}).summary.salesMonth, 0);
assert.equal(buildMetrics([{...row,status:'Cancelada'}], [], period).summary.salesMonth, 0);
console.log('PASS: affiliate origin reconciliation, guarded routing, sales totals and exclusion from seller rankings.');
