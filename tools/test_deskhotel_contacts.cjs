const assert=require('node:assert/strict');
const routing=require('../lib/sales-routing');
const {buildContactPlan,contactValue}=require('../lib/deskhotel-contacts.cjs');
const {validate}=require('../lib/sales-write-validator.cjs');
const current={rowNumber:4,codigo:'CONTACT-1',hotel:'SUEDS EXPERIENCIAS',dataVenda:'09/11/2026',canal:'AFILIADO',vendedor:'',fonte:'DESKHOTEL',formaPagamento:'PIX',status:'Confirmada',telefone:'',email:'',contactCells:{telefone:null,email:null}};
const capture={codigo:'CONTACT-1',hotel:'SUEDS EXPERIENCIAS',origin:'Depto_Reservas - Loja online / Afiliado: Renato',telefone:'(73) 99999-0000',email:'cliente@example.com',evidence:'Linha visível no DeskHotel'};
const plan=buildContactPlan([capture],[],[current]);
assert.equal(plan.requests.length,2);assert.doesNotThrow(()=>validate(plan));
assert.deepEqual(plan.requests.map(r=>r.updateCells.range.startColumnIndex),[21,22]);
const occupied={...current,telefone:'Contato manual',contactCells:{telefone:{stringValue:'Contato manual'},email:null}};
const partial=buildContactPlan([capture],[],[occupied]);
assert.equal(partial.requests.length,1);assert.equal(partial.records[0].columnIndex,22);
const formula={...current,contactCells:{telefone:{formulaValue:'=""'},email:null}};
assert.equal(buildContactPlan([capture],[],[formula]).requests.length,1);
const done={...current,telefone:capture.telefone,email:capture.email,contactCells:{telefone:{stringValue:capture.telefone},email:{stringValue:capture.email}}};
assert.equal(buildContactPlan([capture],[],[done]).requests.length,0);
assert.equal(buildContactPlan([capture],[current],[current]).requests.length,0);
assert.equal(buildContactPlan([{...capture,telefone:'00000000000',email:''}],[],[current]).requests.length,0);
assert.equal(contactValue('=HYPERLINK("https://example.com")','email'),'');
assert.equal(routing.normalizeDeskhotel({...capture,phone:'123',telefone:undefined}).telefone,'123');
assert.equal(routing.normalizeDeskhotel(capture).email,capture.email);
for(const mutate of [
 p=>p.existingChannels[0].email='Já preenchido',
 p=>p.existingChannels[0].contactCells.telefone={formulaValue:'=""'},
 p=>delete p.existingChannels[0].contactCells,
 p=>p.records[0].status='Cancelada',
 p=>p.requests[0].updateCells.range.startColumnIndex=17,
 p=>p.records[0].newValue={formulaValue:'=1'},
 p=>p.requests=[]
]){const bad=structuredClone(plan);mutate(bad);assert.throws(()=>validate(bad));}
console.log('PASS: contatos somente em V/W vazios, preservação de fórmulas e dados existentes, deduplicação e reexecução.');
