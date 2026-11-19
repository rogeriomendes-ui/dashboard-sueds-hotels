const fields='hotel_id,periodos,gravado_em,gravado_por';
function valid(periodos){return Array.isArray(periodos)&&periodos.length<=100&&periodos.every(p=>p&&['inicio','fim'].every(k=>typeof p[k]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p[k])&&Number.isFinite(Date.parse(p[k]))&&new Date(p[k]).toISOString().slice(0,10)===p[k])&&p.fim>=p.inicio);}
async function read(client){const q=await client.from('rms_bloqueios_flutuacao').select(fields);if(q.error)throw q.error;return q.data;}
async function save(client,b,hotels,rows){
 if(!hotels.some(h=>h.id===b.hotel_id)||!valid(b.periodos))return {status:400,error:'Confira o hotel e as datas dos bloqueios.'};
 const old=rows.find(r=>r.hotel_id===b.hotel_id);
 if((old?.gravado_em||null)!==(b.gravado_em||null))return {status:409,error:'Os bloqueios mudaram. Recarregue antes de salvar.'};
 const record={hotel_id:b.hotel_id,periodos:b.periodos.map(({inicio,fim})=>({inicio,fim}))};
 const q=old?client.from('rms_bloqueios_flutuacao').update({periodos:record.periodos}).eq('hotel_id',b.hotel_id).eq('gravado_em',old.gravado_em):client.from('rms_bloqueios_flutuacao').insert(record);
 const result=await q.select(fields).maybeSingle();
 if(result.error?.code==='23505'||(!result.error&&!result.data))return {status:409,error:'Os bloqueios mudaram. Recarregue antes de salvar.'};
 if(result.error)throw result.error;return {status:200,row:result.data};
}
module.exports={read,save,valid};
