const {validDate}=require('./integration-status');
const key=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/SUED'S/gi,'SUEDS').trim().toUpperCase();
function validate(payload){
  if(payload?.kind!=='channel_availability'||payload.version!==1||!Number.isFinite(Date.parse(payload.generatedAt))||Math.abs(Date.now()-Date.parse(payload.generatedAt))>86400000||!Array.isArray(payload.channels)||!payload.channels.length||payload.channels.length>2)throw new Error('Base de disponibilidades inválida.');
  const sources=new Set();
  for(const c of payload.channels){
    if(!['omnibees','juniper'].includes(c.source)||sources.has(c.source)||!validDate(c.from)||!validDate(c.to)||c.from>c.to||!Number.isFinite(Date.parse(c.capturedAt))||!Array.isArray(c.hotels)||!c.hotels.length||new Set(c.hotels).size!==c.hotels.length||c.hotels.some(h=>typeof h!=='string'||h.length>100)||!Array.isArray(c.rows)||c.rows.length>10000)throw new Error('Canal inválido.');sources.add(c.source);
    const keys=new Set(),days=(Date.parse(c.to)-Date.parse(c.from))/86400000+1;
    for(const r of c.rows){const k=JSON.stringify([r.hotel,r.date]);if(keys.has(k)||!c.hotels.includes(r.hotel)||!validDate(r.date)||r.date<c.from||r.date>c.to||![r.available,r.rawAvailable,r.stopSales].every(Number.isSafeInteger)||r.stopSales<0||c.source==='omnibees'&&(r.available!==r.rawAvailable||r.stopSales!==0)||c.source==='juniper'&&r.available<0)throw new Error('Disponibilidade inválida.');keys.add(k);}
    if(c.rows.length!==days*c.hotels.length)throw new Error('Disponibilidades parciais.');
  }return payload;
}
async function load(){
  const base=process.env.PORTAL_SUPABASE_URL||'https://pjcmjytiovuukbkewxjj.supabase.co',secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret)throw new Error('Base de canais não configurada.');
  const response=await fetch(base+'/rest/v1/dashboard_snapshots?source=eq.channel_availability_v1&select=payload&order=created_at.desc,id.desc&limit=1',{headers:{apikey:secret,Authorization:'Bearer '+secret},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Disponibilidades dos canais indisponíveis.');return (await response.json())[0]?.payload||null;
}
function enrich(map,payload){
  const channels=payload?.channels||[],lookup=new Map();
  for(const c of channels)for(const r of c.rows)lookup.set(JSON.stringify([c.source,key(r.hotel),r.date]),r);
  return {...map,channelCaptures:channels.map(({rows,...meta})=>meta),occupancy:map.occupancy.map(h=>({...h,days:h.days.map(d=>({...d,channels:Object.fromEntries(['omnibees','juniper'].map(source=>[source,lookup.get(JSON.stringify([source,key(h.hotel),d.date]))||null]))}))}))};
}
async function withChannels(map){try{return enrich(map,await load());}catch{return {...enrich(map,null),channelError:'Disponibilidades dos canais temporariamente indisponíveis.'};}}
module.exports={validate,enrich,load,withChannels};
