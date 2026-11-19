const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildBiReportsPayload } = require('../server').__test;

const records = [
  { hotel: 'SUEDS PLAZA', channel: 'Reserva Direta', dateKey: '2026-11-10', total: 1000, status: 'Confirmada', reservationCode: 'A' },
  { hotel: 'SUEDS PREMIUM', channel: 'Reserva Direta', dateKey: '2026-11-12', total: 2000, status: 'Confirmada', reservationCode: 'B' },
  { hotel: 'SUEDS PLAZA', channel: 'Booking', dateKey: '2026-11-10', total: 9000, status: 'Confirmada', reservationCode: 'C' }
];
const goals = [
  { month: '2026-11', type: 'Venda Direta', hotel: 'SUEDS PLAZA', revenueGoal: 5000 },
  { month: '2026-11', type: 'Venda Direta', hotel: 'SUEDS PREMIUM', revenueGoal: 6000 }
];
const dataset = { audience: 'bi-relatorios-kpi', records, goals };
const query = { start: '2026-11-01', end: '2026-11-19' };
const elements = new Map();
const context = vm.createContext({ Intl, Date, URLSearchParams, document: {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', addEventListener() {} });
    return elements.get(id);
  }
} });
const script = fs.readFileSync(require.resolve('../public/gestores.js'), 'utf8');
vm.runInContext(script.slice(0, script.indexOf('\nsetupMonthSelect();')), context);
function check(payload, value, goal, count) {
  context.payload = payload;
  vm.runInContext('renderHomeSalesGoals(payload); renderKpiDirectSales(payload);', context);
  const top = elements.get('homeSalesGoals').innerHTML;
  const card = elements.get('kpiDirectSales').innerHTML;
  const money = n => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 }).format(n);
  assert.ok(top.includes(money(value)) && card.includes(money(value)));
  assert.ok(top.includes(money(goal)) && card.includes(money(goal)));
  assert.ok(card.includes(`data-label="Reservas">${count}</strong>`));
  assert.ok(!card.includes(money(9000)), 'OTAs não entram no consolidado direto');
}
const all = buildBiReportsPayload(dataset, query);
check(all, 3000, 11000, 2);
check(buildBiReportsPayload(dataset, { ...query, hotel:'SUEDS PLAZA' }), 1000, 5000, 1);
check(buildBiReportsPayload(dataset, { start:'2026-11-10', end:'2026-11-10' }), 1000, 11000, 1);
check(buildBiReportsPayload(dataset, { ...query, channel:'Reserva Direta' }), 3000, 11000, 2);
check(buildBiReportsPayload(dataset, { start:'2026-01-01', end:'2026-11-19' }), 3000, 11000, 2);
context.payload = buildBiReportsPayload({ ...dataset, records:[] }, query);
vm.runInContext('renderKpiDirectSales(payload)', context);
assert.match(elements.get('kpiDirectSales').innerHTML, /Sem vendas KPI/);
assert.match(script, /Comercial \(Equipe \+ Site \+ Robô\)/);
console.log('Cards KPI alinhados: valores, metas, reservas, filtros por hotel/dia/canal, acumulado e ausência de dados.');
