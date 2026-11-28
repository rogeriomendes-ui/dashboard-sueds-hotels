const {createHmac,timingSafeEqual}=require('node:crypto');
const {gzipSync,gunzipSync}=require('node:zlib');
const {json}=require('./portal-auth');
const simple=require('../public/rms-simples');
const folder='rms-simples-v1';
const labels={PLAZA:'SUEDS PLAZA',CABRALIA:'SUEDS CABRALIA',SEGUNDO_SOL:'SUEDS SEGUNDO SOL',
  PREMIUM:'SUEDS PREMIUM',TRANCOSO:'SUEDS TRANCOSO',CASAS:'CASAS SUEDS ARRAIAL'};

function service(){
  const key=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return require('@supabase/supabase-js').createClient(process.env.PORTAL_SUPABASE_URL ||
    'https://pjcmjytiovuukbkewxjj.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function bucket(db){return db.storage.from('sueds-captures-shadow');}
async function latest(store){
  const {data,error}=await store.list(folder,{limit:1,sortBy:{column:'name',order:'desc'}});
  if(error) throw error;
  return data[0]?.name;
}
async function read(handler){
  let value;
  const response={setHeader(){},end(body){
    if(this.statusCode!==200) throw Error('RMS_SOURCE_FAILED');
    value=JSON.parse(body);
  }};
  await handler(response);
  if(!value) throw Error('RMS_SOURCE_EMPTY');
  return value;
}
function authorized(body,signature,secret,now=Date.now()){
  const iso=value=>typeof value==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
  if(!secret || !iso(body?.capturedAt) || !iso(body.sentAt) || Math.abs(Date.parse(body.sentAt)-now)>300000 ||
      Date.parse(body.capturedAt)>Date.parse(body.sentAt) || !/^[0-9a-f]{64}$/.test(signature||'')) return false;
  const expected=createHmac('sha256',secret).update(['rms-simples-v1',body.sentAt,body.capturedAt].join('\n')).digest();
  return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
async function downloadSnapshot(store,name){
  const {data,error}=await store.download(folder+'/'+name);
  if(error) throw error;
  return JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())));
}
async function publish(capturedAt){
  const db=service(),store=bucket(db);
  // New calculation revision sorts after the original snapshot of the same capture.
  const filename=capturedAt.replace(/:/g,'-')+'.v2.json.gz';
  const priorName=await latest(store);
  if(priorName>=filename) return;
  const previous=priorName?await downloadSnapshot(store,priorName):{};
  const data=await read(res=>require('../api/portal/rms').readForPublication(db,res));
  const map=await require('../server').inventoryOccupancy(data.today,'2027-12-31','');
  if(map.updatedAt!==capturedAt) throw Error('RMS_CAPTURE_MISMATCH');
  const hotels={};
  const saleTime=new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Bahia',hour:'2-digit',minute:'2-digit'});
  for(const hotel of data.hotels){
    if(data.policies.some(p=>p.hotel_id===hotel.id && p.modelo==='proprio')) continue;
    const label=labels[hotel.code] || (/casas/i.test(hotel.name)?labels.CASAS:hotel.name.toUpperCase());
    const days=map.occupancy.find(h=>h.hotel===label)?.days;
    if(!days?.some(d=>d.capturedAt)) throw Error('RMS_INCOMPLETE_MAP');
    const query={hotel_id:hotel.id};
    const [offers,bases]=await Promise.all([
      read(res=>require('./rms-ofertas').handle(db,{...query,tipo:'ofertas_consultar'},res)),
      hotel.code==='PLAZA'?null:read(res=>require('./rms-bases').handle(db,{...query,tipo:'bases_consultar'},res))
    ]);
    const inputs={...data,saleTime,offers:offers.ofertas.map(row=>row.detalhes),hotelBases:bases?simple.indexBases(bases):null};
    const priorDays=new Map(previous[hotel.id]?.days.map(day=>[day.date,day.tariffs]));
    hotels[hotel.id]={tariffHorizon:true,days:simple.tariffDays(inputs,hotel,days).map(day=>({...day,tariffs:Object.fromEntries(
      simple.groups.map(group=>[group,simple.night(inputs,hotel,day,group,priorDays.get(day.date))]))}))};
  }
  if(!Object.keys(hotels).length) throw Error('RMS_EMPTY_PUBLICATION');
  const {error}=await store.upload(folder+'/'+filename,gzipSync(JSON.stringify(hotels)),{contentType:'application/octet-stream',upsert:false});
  if(error && !((await latest(store))>=filename)) throw error;
}
async function trigger(req,res){
  if(req.method!=='POST') return json(res,405,{ok:false});
  let body=req.body;
  if(typeof body==='string'){try{body=JSON.parse(body);}catch{return json(res,400,{ok:false});}}
  if(!authorized(body,req.headers['x-rms-signature'],process.env.SUEDS_CAPTURE_API_TOKEN)) return json(res,403,{ok:false});
  try{await publish(body.capturedAt);return json(res,200,{ok:true});}
  catch(error){console.error('RMS cloud publication failed',String(error.code||error.message).slice(0,120));return json(res,503,{ok:false});}
}
async function serve(hotelId,res){
  if(typeof hotelId!=='string'||!/^[a-f0-9-]{36}$/i.test(hotelId)) return json(res,400,{error:'Hotel inválido.'});
  const store=bucket(service()),name=await latest(store);
  if(!name) return json(res,200,null);
  const snapshot=await downloadSnapshot(store,name);
  const hotel=snapshot[hotelId];
  if(!hotel)return json(res,200,null);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Encoding','gzip');
  res.statusCode=200;
  res.end(gzipSync(JSON.stringify(hotel)));
}
function webChanges(previous,current,today){
  const before=new Map(previous.days.map(d=>[d.date,d.tariffs])),items=[];
  for(const day of current.days){
    if(day.date<today)continue;
    for(const group of ['WEB Café','WEB MAP','WEB PC']){
      const tariff=day.tariffs?.[group],prior=before.get(day.date)?.[group];
      for(const [room,value] of Object.entries(tariff?.current||{})){
        if(!(value>0))continue;
        const adults=tariff.adults?.[room],old=prior?.adults?.[room];
        const changed=adults&&old&&Object.keys(adults).some(p=>adults[p]!==old[p]);
        if(!changed && Math.round(value*100)===Math.round(prior?.current?.[room]*100))continue;
        items.push({date:day.date,group,room,adults,tariff:{current:tariff.current,band:tariff.band}});
      }
    }
  }
  return items;
}
async function changes(hotelId,res){
  if(typeof hotelId!=='string'||!/^[a-f0-9-]{36}$/i.test(hotelId))return json(res,400,{error:'Hotel inválido.'});
  const store=bucket(service());
  const {data,error}=await store.list(folder,{limit:2,sortBy:{column:'name',order:'desc'}});
  if(error)throw error;
  if(data.length<2)return json(res,409,{error:'São necessárias duas publicações do RMS para comparar.'});
  const [now,old]=await Promise.all(data.map(f=>downloadSnapshot(store,f.name).then(s=>s[hotelId])));
  if(!old||!now)return json(res,409,{error:'Hotel sem duas publicações comparáveis.'});
  res.setHeader('Cache-Control','no-store');
  return json(res,200,{items:webChanges(old,now,new Date().toLocaleDateString('en-CA',{timeZone:'America/Bahia'}))});
}
module.exports={serve,trigger,authorized,changes,webChanges};
