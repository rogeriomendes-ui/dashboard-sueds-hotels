const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_fixture';
process.env.GESTORES_ACCESS_TOKEN = 'ranking-test-fixture';
process.env.GOOGLE_SHEET_ID = '';
let stored = null;
let inserts = 0;
global.fetch = async (url, options={}) => {
  assert(String(url).includes('/rest/v1/dashboard_snapshots'), `Unexpected remote call: ${url}`);
  if(options.method === 'POST') {
    if(stored) return new Response('duplicate key', {status:409});
    stored=JSON.parse(options.body); inserts++;
    return new Response('',{status:201});
  }
  return Response.json(stored ? [{payload:stored.payload}] : []);
};
const auth = require('../lib/portal-auth');
// Exercise the real entrypoint, including resolving the portal profile on POST.
auth.getPortalProfile = async req => req.testProfile || null;
const api = require('../api/index');
const server = require('../server');
async function call(method, query, body, profile={roles:['admin_geral'],name:'Gestora Teste'}) {
 const req=Readable.from(body ? [JSON.stringify(body)] : []);
 req.method=method; req.url=`/api/dashboard/vendedores?${query}`;
 req.headers={host:'localhost','content-type':'application/json'};
 req.testProfile=profile;
 let status, response;
 const res={writeHead(code){status=code},end(value){response=value}};
 await api(req,res);
 return {status,body:Buffer.isBuffer(response)?response:JSON.parse(response)};
}
(async()=>{
 const query='month=2026-09&date=2026-09-01';
 const initial=await call('GET',query);
 assert.equal(initial.status,200,JSON.stringify(initial.body));
 assert.equal(initial.body.canFreeze,true);
 assert.equal(initial.body.period.today,'2026-09-30');
 const seller={roles:['vendedor'],environments:['ranking_vendedores'],name:'Aline Nunes',email:'aline@example.test'};
 assert.equal((await call('POST',query+'&action=freeze',{},seller)).status,401);
 const vip={roles:[],environments:['mesas_vip_reveillon'],name:'VIP'};
 assert.equal((await call('POST',query+'&action=freeze',{},vip)).status,401);
 assert.equal((await call('POST','month=2026-12&action=freeze',{})).status,400);
 assert.equal((await call('POST',query+'&hotel=PLAZA&action=freeze',{})).status,400);
 assert.equal((await call('POST',query+'&action=freeze',{digest:'stale'})).status,409);
 assert.equal(inserts,0);
 const freeze=await call('POST',query+'&action=freeze',{digest:initial.body.rankingClosure.digest});
 assert.equal(freeze.status,200,JSON.stringify(freeze.body));
 assert.equal(inserts,1);
 const frozen=await call('GET',query);
 assert.equal(frozen.body.rankingClosure.frozen,true);
 assert.equal(frozen.body.canFreeze,false);
 assert.deepEqual(frozen.body.sellers,initial.body.sellers);
 assert.deepEqual(frozen.body.summary,initial.body.summary);
 assert.equal((await call('POST',query+'&action=freeze',{digest:initial.body.rankingClosure.digest})).status,409);
 const excel=await call('GET',query+'&action=export');
 assert.equal(excel.status,200);
 assert.deepEqual(excel.body,Buffer.from(stored.payload.workbook,'base64'));
 const privateView=await call('GET',query,null,seller);
 assert(!privateView.body.sellers.find(s=>s.name==='Amanda Melgaco')?.commission);
 assert.equal(inserts,1);
 console.log('PASS: portal POST session, seller/VIP permissions, closed month, stale review, freeze, reload, privacy and exact archived Excel.');
})().catch(e=>{console.error(e);process.exitCode=1});
