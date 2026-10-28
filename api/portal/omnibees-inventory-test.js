const { getPortalProfile, json } = require('../../lib/portal-auth');
const LIMIT = 3 * 1024 * 1024;
function handler({ profile = getPortalProfile, env = process.env, send = fetch, oidc = async () => require('@vercel/oidc').getVercelOidcToken() } = {}) {
  return async (req,res) => {
    if (env.VERCEL_ENV !== 'preview') return json(res,403,{error:'Disponível somente no ambiente de teste.'});
    try {
      const user=await profile(req,res);
      if (!user) return json(res,401,{error:'Login necessário.'});
      if (!user.roles?.includes('admin_geral')) return json(res,403,{error:'Acesso restrito aos administradores.'});
      if(req.method!=='POST') return json(res,405,{error:'Método não permitido.'});
      if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host || req.headers['sec-fetch-site'] === 'cross-site' || !String(req.headers['content-type'] || '').startsWith('application/json')) return json(res,403,{error:'Origem inválida.'});
      let body=req.body;
      if(body===undefined){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>LIMIT)return json(res,413,{error:'Limite de 3 MiB por amostra.'});chunks.push(chunk);}body=Buffer.concat(chunks).toString('utf8');}
      if(Buffer.isBuffer(body))body=body.toString('utf8');
      if(typeof body!=='string')body=JSON.stringify(body);
      if(!body || Buffer.byteLength(body)>LIMIT)return json(res,413,{error:'Limite de 3 MiB por amostra.'});
      const parsed=JSON.parse(body);
      if(parsed?.schema_version!==1 && (parsed?.version!==1 || !Array.isArray(parsed.chunks)))return json(res,422,{error:'Formato da amostra não reconhecido. Preserve o original para adaptação.'});
      const origin=env.SUEDS_OMNIBEES_INVENTORY_TEST_URL;
      if(!/^https:\/\/sueds-capturas-piloto-[a-z0-9]+-sueds1\.vercel\.app$/.test(origin || '') || !env.SUEDS_OMNIBEES_IMPORT_TOKEN)throw Error('config');
      const response=await send(origin+'/omnibees-inventory-test',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+env.SUEDS_OMNIBEES_IMPORT_TOKEN,'x-vercel-trusted-oidc-idp-token':await oidc(),'Content-Type':'application/json'},body,signal:AbortSignal.timeout(60000)});
      if(!response.headers.get('content-type')?.includes('application/json'))throw Error('connection');
      const value=await response.json();
      if(!response.ok)return json(res,422,{error:'Amostra não validada. Confira inventário, datas, categorias e Stop Sales WEB. Preserve os arquivos.'});
      if(value.mode!=='preview' || value.productionChanged!==false || value.status!=='validado' || value.result?.verified!==true)throw Error('response');
      const result=value.result, count=n=>Number.isSafeInteger(n)&&n>=0?n:0;
      return json(res,200,{mode:'preview',status:'validado',productionChanged:false,fullCoverage:value.fullCoverage===true,result:{found:count(result.found),hotels:count(result.hotels),periods:count(result.periods),stopSales:count(result.stopSales),from:/^\d{4}-\d{2}-\d{2}$/.test(result.from)?result.from:null,to:/^\d{4}-\d{2}-\d{2}$/.test(result.to)?result.to:null}});
    }catch{return json(res,503,{error:'Não foi possível validar a amostra. Nenhuma base foi alterada.'});}
  };
}
module.exports=handler();
module.exports.handler=handler;

