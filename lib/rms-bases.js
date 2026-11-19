const {json}=require('./portal-auth');
const {levelFor,weekday,cellKey,isAdult}=require('../public/rms-trancoso');
const fields='base,plano,quarto,pax,dia,valor,gravado_em,gravado_por';
const regimes=['Café da manhã','Meia pensão','Pensão completa'];
const days=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
function validCell(b){
  return typeof b.base==='string' && b.base.length>0 && b.base.length<=200 &&
    Number.isInteger(b.plano) && b.plano>=0 && b.plano<=2 &&
    ['standard','luxo','suite'].includes(b.quarto) && Number.isInteger(b.pax) && b.pax>=1 && b.pax<=4 &&
    Number.isInteger(b.dia) && b.dia>=0 && b.dia<=6 && Number.isFinite(b.valor) && b.valor>0 && b.valor<1e8 &&
    Number(b.valor.toFixed(2))===b.valor && typeof b.gravado_em==='string';
}
async function workbook(hotel,rows){
  const ExcelJS=require('exceljs');
  const book=new ExcelJS.Workbook();
  const sheet=book.addWorksheet('Tarifas base');
  sheet.columns=[['Hotel',26],['Tarifário base',48],['Regime WEB',24],['Categoria',16],['Adultos',10],['Dia da semana',18],['Tarifa (R$)',18],['Última gravação (UTC)',28],['Usuário',34]].map(([header,width])=>({header,width}));
  for(const r of rows) sheet.addRow([hotel.name,r.base,regimes[r.plano],r.quarto,r.pax,days[r.dia],Number(r.valor),r.gravado_em,r.gravado_por]);
  sheet.getColumn(7).numFmt='"R$" #,##0.00';
  sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF165B60'}};
  sheet.views=[{state:'frozen',ySplit:1}];
  sheet.autoFilter='A1:I1';
  return book.xlsx.writeBuffer();
}
async function calendarWorkbook(hotel,plans){
  const ExcelJS=require('exceljs');
  const book=new ExcelJS.Workbook();
  const sheet=book.addWorksheet('WEB por noite');
  sheet.columns=[['Hotel',24],['Código',12],['Tarifário WEB',38],['Noite',16],['Categoria',28],['Ocupação',26],['Tarifa (R$)',16]].map(([header,width])=>({header,width}));
  for(const plan of plans)for(const [night,room,occupancy,cents] of plan.grade){
    sheet.addRow([hotel.name,plan.codigo,plan.tarifario,night,room,occupancy,cents/100]);
  }
  sheet.getColumn(7).numFmt='"R$" #,##0.00';
  sheet.getRow(1).font={bold:true};
  sheet.views=[{state:'frozen',ySplit:1}];
  sheet.autoFilter='A1:G1';
  return book.xlsx.writeBuffer();
}
const calendarFields='codigo,tarifario,primeira_noite,ultima_noite,grade,capturado_em,edicoes,gravado_em,gravado_por';

function effectiveCalendar({edicoes,grade,...plan}){
  const keys=new Map();
  return {...plan,grade:grade.map(row=>{
    const [night,room,occupancy]=row;
    if(!keys.has(night))keys.set(night,[levelFor(night),weekday(night)]);
    const [level,day]=keys.get(night);
    if(!level)return row;
    const cents=edicoes[cellKey(level,room,occupancy,day)];
    return Number.isSafeInteger(cents) && cents>=(isAdult(occupancy)?1:0) && cents<1e10
      ? [night,room,occupancy,cents] : row;
  })};
}

async function saveCalendarCell(client,hotel_id,body,res){
  const {codigo,nivel,quarto,ocupacao,dia,valor,gravado_em}=body;
  if(!Number.isSafeInteger(codigo)||codigo<=0||codigo>2147483647||
    [nivel,quarto,ocupacao].some(value=>typeof value!=='string'||!value.trim()||value.length>200)||
    !Number.isInteger(dia)||dia<0||dia>6||!Number.isFinite(valor)||valor<(isAdult(ocupacao)?0.01:0)||
    valor>=1e8||Number(valor.toFixed(2))!==valor||typeof gravado_em!=='string'||!Number.isFinite(Date.parse(gravado_em))){
    return json(res,400,{error:'Confira a tarifa e a célula selecionada.'});
  }
  const table='rms_tarifas_web_por_noite';
  const match={hotel_id,codigo,gravado_em};
  const conflict=()=>json(res,409,{error:'A grade mudou ou a tarifa não está disponível. Recarregue o hotel.'});
  const plan=await client.from(table).select('grade,edicoes').match(match).maybeSingle();
  if(plan.error)throw plan.error;
  if(!plan.data?.grade.some(([night,room,occupancy])=>
    room===quarto&&occupancy===ocupacao&&levelFor(night)===nivel&&weekday(night)===dia))return conflict();
  const key=cellKey(nivel,quarto,ocupacao,dia);
  const edicoes={...plan.data.edicoes,[key]:Math.round(valor*100)};
  const saved=await client.from(table).update({edicoes}).match(match).select('gravado_em,gravado_por').maybeSingle();
  if(saved.error)throw saved.error;
  if(!saved.data)return conflict();
  return json(res,200,{row:{...saved.data,valor}});
}

async function handle(client,body,res){
  const {hotel_id}=body;
  if(typeof hotel_id!=='string' || !/^[0-9a-f-]{36}$/i.test(hotel_id)) return json(res,400,{error:'Hotel inválido.'});
  const hotel=await client.from('hotels').select('id,name,code').eq('id',hotel_id).eq('status','active').is('deleted_at',null).maybeSingle();
  if(hotel.error) throw hotel.error;
  if(!hotel.data) return json(res,404,{error:'Hotel não encontrado.'});
  res.setHeader('Cache-Control','no-store');
  if(body.tipo==='base_calendario_salvar'){
    if(hotel.data.code!=='TRANCOSO')return json(res,400,{error:'Edição da grade indisponível para este hotel.'});
    return saveCalendarCell(client,hotel_id,body,res);
  }
  if(hotel.data.code==='TRANCOSO'&&body.tipo!=='base_salvar'){
    const result=await client.from('rms_tarifas_web_por_noite')
      .select(calendarFields)
      .eq('hotel_id',hotel_id).order('codigo');
    if(result.error)throw result.error;
    const plans=result.data.map(effectiveCalendar);
    if(body.tipo==='bases_excel'){
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition','attachment; filename="tarifas-base-TRANCOSO.xlsx"');
      return res.end(await calendarWorkbook(hotel.data,plans));
    }
    return json(res,200,{rows:[],calendario:plans});
  }
  if(body.tipo==='base_salvar'){
    if(!validCell(body)) return json(res,400,{error:'Confira a tarifa e a célula selecionada.'});
    const {base,plano,quarto,pax,dia,valor,gravado_em}=body;
    const saved=await client.from('rms_grade_tarifaria').update({valor}).match({hotel_id,base,plano,quarto,pax,dia,gravado_em}).select(fields).maybeSingle();
    if(saved.error) throw saved.error;
    if(!saved.data) return json(res,409,{error:'A tarifa foi alterada ou não está disponível para edição. Recarregue o hotel.'});
    return json(res,200,{row:saved.data});
  }
  const rows=[];
  for(let offset=0;;offset+=500){
    const page=await client.from('rms_grade_tarifaria').select(fields).eq('hotel_id',hotel_id).order('base').order('plano').order('quarto').order('pax').order('dia').range(offset,offset+499);
    if(page.error) throw page.error;
    rows.push(...page.data);
    if(page.data.length<500) break;
  }
  if(body.tipo==='bases_excel'){
    const buffer=await workbook(hotel.data,rows);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="tarifas-base-${hotel.data.code}.xlsx"`);
    return res.end(buffer);
  }
  const codes=require('./rms-base-codes.json')[hotel.data.code]||{};
  return json(res,200,{rows,codes});
}
module.exports={handle,validCell,workbook};
