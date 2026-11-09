const assert = require('node:assert/strict');
const routing = require('../lib/sales-routing');
const { validate } = require('../lib/sales-write-validator.cjs');
const origin = 'Depto_Reservas - Loja online / Afiliado: Renato';
const original = {rowNumber:13114,codigo:'CR29070366218',hotel:'SUEDS EXPERIENCIAS',dataVenda:'09/11/2026',canal:'AFILIADO',vendedor:'',fonte:'DESKHOTEL',formaPagamento:'PIX',status:'Confirmada',observacoes:'Observação preservada'};
const captured = routing.normalizeDeskhotel({...original,origin});
assert.equal(captured.observacoes, 'Observação preservada\nAfiliado: Renato');
assert.equal(captured.vendedor, '');
assert.equal(routing.normalizeDeskhotel({...captured,origin}).observacoes,captured.observacoes);
const record = {...original,operation:'affiliate-name-update',targetSheet:routing.CHANNELS_SHEET,origin,evidence:'Marcador visível na linha da reserva',newValue:{stringValue:captured.observacoes}};
const request = {updateCells:{range:{sheetId:711290481,startRowIndex:13113,endRowIndex:13114,startColumnIndex:19,endColumnIndex:20},rows:[{values:[{userEnteredValue:record.newValue}]}],fields:'userEnteredValue'}};
const plan = {records:[record],existingSellers:[],existingChannels:[original],requests:[request]};
assert.doesNotThrow(()=>validate(plan));
for (const mutate of [
 p=>p.records[0].origin='Depto_Reservas - Loja online',
 p=>p.records[0].newValue={stringValue:'Afiliado: Renato'},
 p=>p.records[0].status='Cancelada',
 p=>p.existingChannels[0].observacoes='Alteração concorrente',
 p=>p.requests[0].updateCells.range.startColumnIndex=17,
 p=>p.requests=[],
 p=>p.existingChannels[0].canal='SITE'
]) {const invalid=structuredClone(plan); mutate(invalid); assert.throws(()=>validate(invalid));}
console.log('PASS: nome de afiliado preservado, origem explícita, observações e requests limitados a T.');
