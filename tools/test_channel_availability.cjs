const test=require('node:test'),assert=require('node:assert/strict');
const {validate,enrich,withChannels}=require('../lib/channel-availability');
const upload=require('../api/portal/integration-status-upload');
function sample(){return {kind:'channel_availability',version:1,generatedAt:new Date().toISOString(),channels:['omnibees','juniper'].map(source=>({source,capturedAt:'2026-10-15T02:00:00Z',from:'2026-10-15',to:'2026-10-15',hotels:['SUEDS PLAZA'],rows:[{hotel:'SUEDS PLAZA',date:'2026-10-15',available:source==='juniper'?0:7,rawAvailable:7,stopSales:source==='juniper'?1:0}]}))};}
test('alinha por hotel/data; SS usa disponibilidade de venda; ausência permanece null',()=>{
  const data=sample();validate(data);
  const map={occupancy:[{hotel:'Sueds Plaza',days:[{date:'2026-10-15',available:0},{date:'2026-10-16',available:9}]},{hotel:'SUEDS TRANCOSO',days:[{date:'2026-10-15',available:10}]}]};
  const result=enrich(map,data);
  assert.equal(result.occupancy[0].days[0].channels.omnibees.available,7);
  assert.equal(result.occupancy[0].days[0].channels.juniper.available,0);
  assert.equal(result.occupancy[0].days[0].channels.juniper.stopSales,1);
  assert.equal(result.occupancy[0].days[1].channels.omnibees,null);
  assert.equal(result.occupancy[1].days[0].channels.juniper,null);
  assert.equal(result.channelCaptures[0].capturedAt,data.channels[0].capturedAt);assert.equal(map.occupancy[0].days[0].channels,undefined);
});
test('upload bloqueia datas/quantidades inválidas, duplicatas e cobertura parcial',()=>{
  for(const mutate of [p=>p.channels[0].rows.pop(),p=>p.channels[0].rows.push(p.channels[0].rows[0]),p=>p.channels[0].rows[0].available=null,p=>p.channels[0].rows[0].date='2026-02-31',p=>p.channels.push(p.channels[0]),p=>p.channels=[],p=>p.channels[0].to='2026-10-16']){const p=sample();mutate(p);assert.throws(()=>validate(p));}
});

test('Omnibees aceita Stop Sales WEB preservando a quantidade original',()=>{
  const p=sample(),r=p.channels[0].rows[0];r.available=0;r.stopSales=1;validate(p);
  const result=enrich({occupancy:[{hotel:'SUEDS PLAZA',days:[{date:r.date}]}]},p);
  assert.deepEqual(result.occupancy[0].days[0].channels.omnibees,r);
  assert.equal(r.rawAvailable,7);r.stopSales=0;assert.throws(()=>validate(p));
});
test('upload grava fonte separada, verifica payload e não altera catálogo ou capturas de reservas',async()=>{
  const old={fetch:global.fetch,token:process.env.INTEGRATION_STATUS_UPLOAD_TOKEN,key:process.env.SUPABASE_SECRET_KEY};process.env.INTEGRATION_STATUS_UPLOAD_TOKEN='t'.repeat(48);process.env.SUPABASE_SECRET_KEY='test-only';let writes=0;
  try{global.fetch=async(url,options)=>{writes++;assert.ok(url.endsWith('/dashboard_snapshots'));const body=JSON.parse(options.body);assert.equal(body.source,'channel_availability_v1');return {ok:true,json:async()=>[{payload:body.payload}]};};
    const res={setHeader(){},end(v){this.body=JSON.parse(v);}};await upload({method:'POST',headers:{authorization:'Bearer '+'t'.repeat(48)},body:sample()},res);assert.equal(res.statusCode,200);assert.equal(res.body.verified,true);assert.equal(writes,1);
    await upload({method:'POST',headers:{},body:sample()},res);assert.equal(res.statusCode,401);assert.equal(writes,1);
    global.fetch=async()=>{throw new Error('Offline');};const map={occupancy:[{hotel:'SUEDS PLAZA',days:[{date:'2026-10-15',available:4}]}]},fallback=await withChannels(map);assert.equal(fallback.occupancy[0].days[0].available,4);assert.equal(fallback.occupancy[0].days[0].channels.omnibees,null);assert.ok(fallback.channelError);
  }finally{global.fetch=old.fetch;for(const [k,v]of Object.entries({INTEGRATION_STATUS_UPLOAD_TOKEN:old.token,SUPABASE_SECRET_KEY:old.key})){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
