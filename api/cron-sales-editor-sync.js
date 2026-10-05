const crypto = require('node:crypto');
const { run } = require('../lib/sales-editor-sync.cjs');

module.exports = async function cronSalesEditorSync(req,res) {
  if(req.method!=='GET') {res.statusCode=405;return res.end();}
  const secret=process.env.CRON_SECRET||'';
  const provided=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const valid=secret&&provided&&Buffer.byteLength(secret)===Buffer.byteLength(provided)
    &&crypto.timingSafeEqual(Buffer.from(secret),Buffer.from(provided));
  if(!valid) {res.statusCode=401;return res.end();}
  try {
    const result=await run({apply:true});
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ok:true,sourceWrites:result.sourceWrites,mirrorWrites:result.mirrorWrites,counts:result.counts}));
  } catch(error) {
    console.error('sales-editor-sync:',error.stack||error.message);
    res.statusCode=500;res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ok:false,error:error.message}));
  }
};
