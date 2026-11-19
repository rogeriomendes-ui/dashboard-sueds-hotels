const {json}=require('./portal-auth');
const fields='id,origem,detalhes,gravado_em,gravado_por';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);

function dateValid(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value);
  return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value;
}

function validOffer(d){
  const name=v=>typeof v==='string'&&v.trim().length>0&&v.length<=200;
  const periods=v=>Array.isArray(v)&&v.length>0&&v.length<=50&&v.every(p=>Array.isArray(p)&&p.length===2&&p.every(dateValid)&&p[0]<=p[1]);
  const nights=v=>v===null||(Number.isInteger(v)&&v>=1&&v<=365);
  const hour=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
  const hours=v=>v==null||(Array.isArray(v)&&v.length===2&&v.every(hour));
  const days=v=>v==null||(Array.isArray(v)&&v.length>0&&v.length<=7&&new Set(v).size===v.length&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=6));
  return d&&name(d.nome)&&name(d.tipo)&&name(d.editavel_por)&&
    nights(d.noites)&&nights(d.noites_gratis)&&hours(d.horario_reserva)&&days(d.dias_estadia)&&
    (d.desconto===null||(Number.isFinite(d.desconto)&&d.desconto>=0&&d.desconto<=100&&Number(d.desconto.toFixed(2))===d.desconto))&&
    (d.reserva===null||periods(d.reserva))&&(d.estadia===null||periods(d.estadia))&&
    Array.isArray(d.tarifarios)&&d.tarifarios.length>0&&d.tarifarios.length<=60&&d.tarifarios.every(name);
}

function vigente(d,today){
  return (d.reserva===null||d.reserva.some(([start,end])=>start<=today&&today<=end))&&
    (d.estadia===null||d.estadia.some(([,end])=>end>=today));
}

async function handle(client,body,res){
  const {tipo,hotel_id,id,gravado_em,detalhes}=body;
  if(!uuid(hotel_id))return json(res,400,{error:'Hotel inválido.'});
  res.setHeader('Cache-Control','no-store');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia'}).format(new Date());
  const query=()=>client.from('rms_ofertas');
  if(tipo==='ofertas_consultar'){
    const {data,error}=await query().select(fields).eq('hotel_id',hotel_id).eq('excluida',false).order('id');
    if(error)throw error;
    return json(res,200,{ofertas:data.filter(row=>validOffer(row.detalhes)&&vigente(row.detalhes,today))});
  }
  const remove=tipo==='oferta_excluir';
  if(!uuid(id)||typeof gravado_em!=='string'||!Number.isFinite(Date.parse(gravado_em))||(!remove&&!validOffer(detalhes))){
    return json(res,400,{error:'Confira os campos e os períodos da oferta.'});
  }
  const {data,error}=await query().update(remove?{excluida:true}:{detalhes})
    .eq('hotel_id',hotel_id).eq('id',id).eq('excluida',false).eq('gravado_em',gravado_em)
    .select('id').maybeSingle();
  if(error)throw error;
  return data?json(res,200,{id:data.id}):json(res,409,{error:'A oferta foi alterada. Reabra o card e tente novamente.'});
}

module.exports={handle,validOffer,vigente};
