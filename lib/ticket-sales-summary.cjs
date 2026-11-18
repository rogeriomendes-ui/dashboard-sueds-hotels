const categories = [
  ['natal', 'Ingressos Natal'],
  ['pista', 'Ingressos Reveillon pista'],
  ['vip', 'Ingressos Reveillon VIP'],
  ['mesa', 'Ingressos Reveillon VIP mesa fechada']
];

function buildTicketSalesSummary(metrics) {
  const rows = categories.map(([id, label]) => ({ id, label, quantity: 0, sales: 0 }));
  for (const sale of metrics.detailedTickets || []) {
    const product = String(sale.hotel || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const id = product.includes('natal') ? 'natal'
      : /mesa\s+fechada/.test(product) ? 'mesa'
      : product.includes('vip') ? 'vip' : product.includes('pista') ? 'pista' : null;
    const row = rows.find(item => item.id === id);
    if (!row) continue;
    row.quantity += Number(sale.quantidade) || 0;
    row.sales += Number(sale.valorTotal) || 0;
  }
  return { through: metrics.period.today, rows, quantity: rows.reduce((n, row) => n + row.quantity, 0), sales: rows.reduce((n, row) => n + row.sales, 0) };
}

module.exports = { buildTicketSalesSummary };
