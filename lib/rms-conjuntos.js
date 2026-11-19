const rules=require('../public/rms-rules');
const fields='id,hotel_id,nome,base_origem,periodos,faixas,origens,bloqueado,excluido,gravado_em,gravado_por';
function validDate(s){return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;}
function validate(b){
  if(typeof b.nome!=='string'||!b.nome.trim()||b.nome.length>120||typeof b.base_origem!=='string'||!b.base_origem||b.base_origem.length>200||typeof b.bloqueado!=='boolean'||typeof b.excluido!=='boolean')return false;
  if(!Array.isArray(b.origens)||b.origens.length>100||!b.origens.every(validDate)||new Set(b.origens).size!==b.origens.length)return false;
  if(!Array.isArray(b.periodos)||!b.periodos.length||b.periodos.length>100||!b.periodos.every(p=>validDate(p.inicio)&&validDate(p.fim)&&p.fim>=p.inicio&&(Date.parse(p.fim)-Date.parse(p.inicio))/86400000<=1826&&Array.isArray(p.dias)&&p.dias.length>0&&p.dias.length<=7&&p.dias.every(d=>Number.isInteger(d)&&d>=0&&d<=6)&&new Set(p.dias).size===p.dias.length))return false;
  if(!Array.isArray(b.faixas)||!b.faixas.length||b.faixas.length>20)return false;
  let next=0;
  for(const f of b.faixas){if(![f.de,f.ate,f.pct].every(Number.isFinite)||f.de!==next||f.ate<f.de||f.ate>100||Math.round(f.ate*10)!==f.ate*10||f.pct<0||f.pct>99999||Number(f.pct.toFixed(2))!==f.pct)return false;next=Math.round(f.ate*10+1)/10;}
  return b.faixas.at(-1).ate===100;
}
async function read(client){const q=await client.from('rms_conjuntos_flutuacao').select(fields).order('nome');if(q.error)throw q.error;return q.data;}
async function save(client,body,hotels,legacy,catalog,loadedConfigs){
  if(!hotels.some(h=>h.id===body.hotel_id)||!validate(body))return {status:400,error:'Confira nome, base, datas, dias da semana e faixas contínuas de 0 a 100%.'};
  const configs=loadedConfigs||await read(client);
  const prior=body.id?configs.find(c=>c.id===body.id&&c.hotel_id===body.hotel_id):null;
  if(body.id&&!prior)return {status:404,error:'Conjunto não encontrado.'};
  if(prior && (prior.gravado_em!==body.gravado_em||JSON.stringify(prior.origens)!==JSON.stringify(body.origens)))return {status:409,error:'O conjunto mudou. Recarregue antes de editar.'};
  if(!prior&&body.origens.length){
    const groups=rules.groups(legacy,catalog,body.hotel_id);
    if(!groups.some(g=>JSON.stringify(g.origens.slice().sort())===JSON.stringify(body.origens.slice().sort())))return {status:409,error:'O conjunto original mudou. Recarregue as configurações.'};
  }
  const base=await client.from('rms_grade_tarifaria').select('base').eq('hotel_id',body.hotel_id).eq('base',body.base_origem).limit(1);
  if(base.error)throw base.error;
  const known=catalog?.bases.find(b=>b.name===body.base_origem);
  if(!base.data.length&&!known)return {status:400,error:'Selecione uma base cadastrada neste hotel.'};
  if(known&&!body.faixas.every(f=>known.levels.some(l=>Number(l.pct)===f.pct)))return {status:400,error:'Selecione níveis cadastrados para esta base.'};
  const record={hotel_id:body.hotel_id,nome:body.nome.trim(),base_origem:body.base_origem,periodos:body.periodos,faixas:body.faixas.map(({de,ate,pct})=>({de,ate,pct})),origens:body.origens,bloqueado:body.bloqueado,excluido:body.excluido};
  const query=prior?client.from('rms_conjuntos_flutuacao').update(record).eq('id',prior.id).eq('gravado_em',prior.gravado_em):client.from('rms_conjuntos_flutuacao').insert(record);
  const result=await query.select(fields).maybeSingle();
  if(['23P01','23505','23514'].includes(result.error?.code))return {status:409,error:'Há datas ou dias da semana sobrepostos a outro conjunto. Confira os períodos.'};
  if(result.error)throw result.error;
  if(!result.data)return {status:409,error:'O conjunto foi alterado. Recarregue a página.'};
  return {status:200,row:result.data};
}
module.exports={read,save,validate};
