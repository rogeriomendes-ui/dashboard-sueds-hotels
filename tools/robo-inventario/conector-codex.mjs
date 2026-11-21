import {createServer} from "node:http";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdir,open,readFile,unlink,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";

const origin="https://portalsueds.com.br";
const host="127.0.0.1:41857";
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const error=(status,message)=>Object.assign(new Error(message),{status});

async function verificar(pedido) {
  const response=await fetch(origin+"/api/portal/inventario-codex/recibo",{method:"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(pedido),redirect:"error",signal:AbortSignal.timeout(8000)});
  if (!response.ok || (await response.json()).id!==pedido.id) throw error(409,"O Portal não confirmou a entrega deste pedido.");
}
function comando(id) {
  return `Pedido de inventário ${id} confirmado por mim no Portal Sueds. Use o controle do computador no meu Chrome normal para abrir https://portalsueds.com.br/pedido-inventario-codex.html?id=${id} e conferir o número do pedido. Clique em Assumir este pedido somente se estiver pendente. Prossiga apenas se esta aba assumiu o pedido e mostra a noite e os ocupados. Se outra execução já assumiu, encerre sem reenviar. Na interface normal da Omnibees, confira propriedade, data e categorias e grave somente os apartamentos ocupados exibidos para essa noite. Após a Omnibees confirmar que salvou, volte a essa aba do pedido, registre a noite salva e prossiga com a próxima noite exibida. Se houver login ou verificação, aguarde minha intervenção. Se houver bloqueio, divergência ou resultado de gravação incerto, pare e me informe antes de qualquer outro envio. A conferência final da disponibilidade é minha. Informe o resultado nesta conversa.`;
}
export function servidor({pasta,validar=verificar,enfileirar}) {
  const emCurso=new Map();
  async function enviar(pedido) {
    await validar(pedido);
    await mkdir(pasta,{recursive:true});
    const arquivo=join(pasta,pedido.id+"-"+pedido.recibo+".json");
    let marcador;
    try {marcador=await open(arquivo,"wx");}
    catch (e) {
      if (e.code!=="EEXIST") throw e;
      if ((await readFile(arquivo,"utf8"))==="entregue") return;
      throw error(409,"A entrega anterior ficou sem confirmação. Consulte a conversa do Codex antes de tentar novamente.");
    }
    try {await marcador.writeFile("em andamento"); await marcador.sync();} finally {await marcador.close();}
    try {
      await enfileirar(comando(pedido.id));
    } catch(e) {
      if (e.code==="ENOENT") {
        await unlink(arquivo);
        throw error(503,"Aplicativo Codex indisponível neste notebook.");
      }
      throw error(503,"Entrega sem confirmação do Codex. Consulte a conversa antes de reenviar.");
    }
    await writeFile(arquivo,"entregue");
  }
  const server=createServer(async (req,res)=>{
    const responder=(status,body)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(body));};
    if (req.headers.host!==host || req.headers.origin!==origin) return responder(403,{error:"Origem inválida."});
    res.setHeader("Access-Control-Allow-Origin",origin);
    res.setHeader("Vary","Origin");
    if (req.method==="OPTIONS" && ["/status","/pedido"].includes(req.url)) {
      res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers","Content-Type");
      res.setHeader("Access-Control-Allow-Private-Network","true");
      return responder(200,{});
    }
    if (req.method==="GET" && req.url==="/status") return responder(200,{service:"sueds-inventario"});
    if (req.method!=="POST" || req.url!=="/pedido" || req.headers["content-type"]!=="application/json")
      return responder(400,{error:"Pedido inválido."});
    try {
      let size=0; const chunks=[];
      for await (const chunk of req) {
        size+=chunk.length;
        if (size>512) throw error(413,"Recibo muito grande.");
        chunks.push(chunk);
      }
      let pedido;
      try {pedido=JSON.parse(Buffer.concat(chunks));} catch {throw error(400,"Recibo inválido.");}
      if (!Number.isSafeInteger(pedido?.id) || pedido.id<1 || !uuid.test(pedido.recibo) ||
          typeof pedido.recibo!=="string" || Object.keys(pedido).length!==2) throw error(400,"Recibo inválido.");
      const chave=pedido.id+"/"+pedido.recibo;
      if (!emCurso.has(chave)) emCurso.set(chave,enviar(pedido).finally(()=>emCurso.delete(chave)));
      await emCurso.get(chave);
      responder(200,{id:pedido.id,entregue:true});
    } catch(e) {responder(e.status || 503,{error:e.status ? e.message : "Conector indisponível para esta entrega."});}
  });
  server.requestTimeout=15000;
  return server;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [thread,exe]=process.argv.slice(2);
  if (!uuid.test(thread) || !exe) throw Error("Informe a conversa e o executável local do Codex.");
  const executar=promisify(execFile);
  const pasta=join(process.env.LOCALAPPDATA,"SuedsInventario","recibos-codex");
  servidor({pasta,enfileirar:async message=>{
    const {stdout,stderr}=await executar(exe,["queue","--thread",thread,"--message",message,"--resume"],{windowsHide:true,timeout:15000});
    if (!/Queued message [0-9a-f-]+ for thread/i.test(stdout+"\n"+stderr)) throw Error("Recibo do Codex indisponível.");
  }}).listen(41857,"127.0.0.1");
}
