const test=require('node:test');
const assert=require('node:assert/strict');
const {handle:handler,validCell,workbook}=require('../lib/rms-bases');
async function handle(client,body){const response={setHeader(){},end(raw){this.body=JSON.parse(raw);}};await handler(client,body,response);return {body:response.body,status:response.statusCode};}
const hotel_id='56313d8e-c392-4f23-8632-a74944166e75';
const row={base:'Base original',plano:0,quarto:'standard',pax:2,dia:0,valor:530,gravado_em:'2026-11-19T12:00:00Z',gravado_por:'Gestor'};
function fake(rows){
  const calls=[];
  return {calls,from(table){let filters={},update;return {select(){return this;},eq(k,v){filters[k]=v;return this;},is(){return this;},order(){return this;},match(f){filters=f;return this;},update(v){update=v;return this;},async maybeSingle(){calls.push({table,filters,update});return {data:table==='hotels'?{id:hotel_id,name:'Sueds Premium',code:'PREMIUM'}:rows.find(r=>r.gravado_em===filters.gravado_em)?{...row,...update}:null};},async range(a,b){assert.equal(filters.hotel_id,hotel_id);calls.push({table,a,b});return {data:rows.slice(a,b+1)};}};}};
}
const res={setHeader(){}};
test('consulta todas as páginas do hotel, além do limite de mil',async()=>{const c=fake(Array.from({length:1512},()=>row));const r=await handle(c,{tipo:'bases_consultar',hotel_id},res);assert.equal(r.body.rows.length,1512);assert.equal(c.calls.filter(x=>x.table==='rms_grade_tarifaria').length,4);});
test('editar não cria células e detecta versão desatualizada',async()=>{const c=fake([row]);let r=await handle(c,{tipo:'base_salvar',hotel_id,...row,valor:600},res);assert.equal(r.body.row.valor,600);assert.equal(c.calls.at(-1).filters.hotel_id,hotel_id);r=await handle(c,{tipo:'base_salvar',hotel_id,...row,gravado_em:'antiga'},res);assert.equal(r.status,409);});
test('rejeita valores e dimensões inválidos',()=>{for(const change of [{valor:0},{valor:-1},{valor:1.234},{valor:Infinity},{plano:3},{pax:5},{dia:7},{quarto:'outro'}])assert.equal(validCell({...row,...change}),false);});
test('Excel preserva tarifas numéricas, autoria e nomes sem fórmulas',async()=>{const ExcelJS=require('exceljs');const buffer=await workbook({name:'Sueds Premium'},[{...row,base:'=nome literal'}]);const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);const s=book.worksheets[0];assert.equal(s.getCell('B2').value,'=nome literal');assert.equal(s.getCell('G2').value,530);assert.equal(s.getCell('I2').value,'Gestor');assert.equal(s.rowCount,2);});
