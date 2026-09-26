const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { __test } = require('../server');
const { normalizeRecord, buildMetrics, buildSellersPayload, buildTicketWorkbook, isEventTicket, sellerAccessProfile } = __test;
const sale = (hotel, total, extra = {}) => normalizeRecord({
  'Data Venda': '2026-09-10', 'Codigo Reserva': hotel, Hotel: hotel, Canal: 'CENTRAL DE RESERVAS',
  Vendedor: 'Aline Nunes', Adult: '2', Crian: '1', Status: 'Confirmada', 'Valor Total': total,
  Recebido: total, Observacoes: 'Levar pulseira', Telefone: '(73) 99999-0000', Email: 'cliente@example.com', MESA: '12', 'DIFICULDADE MOBILIDADE?': 'Sim', ...extra
});
(async () => {
  const types = ['Ingresso Natal', 'Pista Reveillon', 'Vip Réveillon ', 'Mesa fechada Reveillon', 'Mesa fechada VIP Reveillon'];
  types.forEach(hotel => assert.equal(isEventTicket(sale(hotel, 100)), true));
  assert.equal(isEventTicket(sale('SUEDS PLAZA', 100)), false);
  const rows = [sale('SUEDS PLAZA', 1000), ...types.map(hotel => sale(hotel, 200)),
    sale('Ingresso Natal', 999, { Status: 'Cancelada' }),
    sale('Ingresso Natal', 999, { 'Data Venda': '2026-08-10' }),
    sale('Pista Reveillon', 300, { Vendedor: 'Emanoel Cesar', Adult: '4', Crian: '2' })];
  const goals = [{ month: '2026-09', seller: 'Equipe Sueds', revenueGoal: 5000 }];
  const metrics = buildMetrics(rows, goals, { date: '2026-09-10', month: '2026-09' });
  const aline = metrics.sellers.find(seller => seller.name === 'Aline Nunes');
  assert.equal(aline.salesMonth, 1000);
  assert.equal(aline.reservationsMonth, 1);
  assert.equal(aline.ticketQuantity, 15);
  assert.equal(aline.ticketSales, 1000);
  const team = metrics.sellers.find(seller => seller.name === 'EQUIPE SUEDS');
  assert.equal(team.ticketQuantity, 21);
  assert.equal(team.ticketSales, 1300);
  assert.equal(metrics.summary.salesMonth, 1000);
  assert.equal(metrics.detailedSales.length, 1);
  assert.equal(metrics.detailedTickets.length, 6);
  const payload = buildSellersPayload(metrics, { role: 'manager' });
  assert.equal(payload.sellers.find(seller => seller.name === 'Aline Nunes').ticketSales, 1000);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildTicketWorkbook(metrics));
  assert.equal(workbook.worksheets.length, 1);
  assert.equal(workbook.worksheets[0].getCell('F11').value, 21);
  assert.equal(workbook.worksheets[0].getCell('G11').value, 1300);
  assert.equal(workbook.worksheets[0].getCell('C5').value, 'Ingresso Natal');
  assert.deepEqual(workbook.worksheets[0].getRow(4).values.slice(14, 19), ['Observações', 'Telefone', 'Email', 'MESA', 'DIFICULDADE MOBILIDADE?']);
  assert.equal(workbook.worksheets[0].getCell('N5').value, 'Levar pulseira');
  assert.equal(workbook.worksheets[0].getCell('O5').value, '(73) 99999-0000');
  assert.equal(workbook.worksheets[0].getCell('P5').value, 'cliente@example.com');
  assert.equal(workbook.worksheets[0].getCell('Q5').value, '12');
  assert.equal(workbook.worksheets[0].getCell('R5').value, 'Sim');
  const vipProfile = { name: 'Usuário VIP', email: 'vip@example.com', roles: [], environments: ['ranking_vendedores', 'mesas_vip_reveillon'] };
  const vipAccess = sellerAccessProfile({ portalProfile: vipProfile, headers: {} }, new URL('https://localhost/api/dashboard/vendedores?action=export-tickets'));
  assert.equal(vipAccess.role, 'vip_export');
  assert.equal(buildMetrics(rows, goals, { date: '2026-09-10', month: '2026-09', hotel: 'SUEDS PLAZA' }).detailedTickets.length, 0);
  console.log('PASS: ingressos separados da hospedagem, K + L, equipe, filtros e Excel exclusivo.');
})().catch(error => { console.error(error); process.exitCode = 1; });
