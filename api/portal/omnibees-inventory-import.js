const {getPortalProfile,json}=require('../../lib/portal-auth');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function handler({profile=getPortalProfile,send=fetch,env=process.env,oidc=async()=>require('@vercel/oidc').getVercelOidcToken()}={}){
 return async(req,res)=>{try{
  if(env.VERCEL_ENV!=='production')return json(res,403,{error:'Importação de produção indisponível neste ambiente.'});
  const user=await profile(req,res);if(!user)return json(res,401,{error:'Login necessário.'});if(!user.roles?.includes('admin_geral'))return json(res,403,{error:'Acesso restrito aos administradores.'});
  if(!['GET','POST'].includes(req.method))return json(res,405,{error:'Método não permitido.'});
  let route='latest',body;
  if(req.method==='POST'){
   const h=req.headers||{};if(!h.origin||new URL(h.origin).host!==h.host||h['sec-fetch-site']==='cross-site'||!String(h['content-type']).startsWith('application/json'))return json(res,403,{error:'Origem inválida.'});
   body=req.body;if(body===undefined){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4400000)throw Error('size');chunks.push(chunk);}body=Buffer.concat(chunks).toString('utf8');}
   if(Buffer.isBuffer(body))body=body.toString('utf8');if(typeof body==='string')body=JSON.parse(body);
   if(!body||Buffer.byteLength(JSON.stringify(body))>4400000||!UUID.test(body.importId||'')||!['manifest','file','complete'].includes(body.action))return json(res,400,{error:'Lote inválido.'});
   if(body.action==='file'&&(!Number.isSafeInteger(body.index)||body.index<0||body.index>99||typeof body.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.data)||Buffer.from(body.data,'base64').length>3*1024*1024))return json(res,400,{error:'Arquivo inválido.'});
   route=body.importId+'/'+(body.action==='file'?'files/'+body.index:body.action);
  }
  const origin=env.SUEDS_OMNIBEES_IMPORT_URL;
  if(origin!=='https://sueds-capturas-piloto.vercel.app'||!env.SUEDS_OMNIBEES_IMPORT_TOKEN)throw Error('config');
  const response=await send(origin+'/omnibees-inventory-import/'+route,{method:req.method,redirect:'error',headers:{Authorization:'Bearer '+env.SUEDS_OMNIBEES_IMPORT_TOKEN,'x-vercel-trusted-oidc-idp-token':await oidc(),'Content-Type':'application/json'},...(body?{body:body.action==='file'?Buffer.from(body.data,'base64'):JSON.stringify(body.manifest||{})}:{}),signal:AbortSignal.timeout(body?.action==='complete'?240000:60000)});
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('response');const value=await response.json();
  if(!response.ok){const messages={FILES_MISSING:'Faltam partes. Envie o lote completo.',INCOMPLETE_OR_INVALID_MAP:'Cobertura incompleta ou inválida. O mapa anterior foi preservado.',INVALID_INVENTORY_OR_CALENDAR:'Inventário ou calendário inválido.',NEWER_MAP_EXISTS:'Já existe uma captura mais recente.',INVALID_CAPTURE_PERIOD:'O lote deve começar hoje ou ontem e terminar em 31/07/2027.',SOURCE_LOCKED:'Há uma publicação em andamento. Retome o mesmo lote.',IMPORT_EXPIRED:'O prazo deste lote terminou. Prepare um novo lote.'};return json(res,503,{error:messages[value.error]||'Não foi possível confirmar a carga. Preserve os arquivos e retome o mesmo lote.'});}
  const result=value.result||{},count=v=>Number.isSafeInteger(v)&&v>=0?v:0;
  return json(res,200,{status:['aguardando','recebendo','recebido','concluido'].includes(value.status)?value.status:'indisponivel',mode:'production',importId:UUID.test(value.importId||'')?value.importId:null,finished:Number.isFinite(Date.parse(value.finished))?value.finished:null,result:{verified:result.verified===true,found:count(result.found),hotels:count(result.hotels),days:count(result.days),mapRows:count(result.mapRows),stopSales:count(result.stopSales),from:/^\d{4}-\d{2}-\d{2}$/.test(result.from||'')?result.from:null,to:/^\d{4}-\d{2}-\d{2}$/.test(result.to||'')?result.to:null}});
 }catch{return json(res,503,{error:'Não foi possível concluir a importação. Preserve os arquivos e retome o mesmo lote.'});}};
}
module.exports=handler();module.exports.handler=handler;
