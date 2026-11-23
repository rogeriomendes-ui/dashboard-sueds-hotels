const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { json, supabaseConfig } = require("../../lib/portal-auth");
const { inventoryOccupancy } = require("../../server");

const source = "inventario_pontual_v1";
// The existing partial unique index permits one active writer for this source.
const writerSlot = "1970-01-01";
const prazoEntrega = 30 * 60000;
const hoje = () => new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
const fail = (status, message) => Object.assign(new Error(message), { status });
function table() {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw fail(503, "Fila indisponível.");
  const client = createClient(supabaseConfig().url, secret, { auth: { persistSession: false } });
  return client.from("dashboard_snapshots");
}
function query() { return table().select("id,payload").eq("source", source); }
async function one(builder) {
  const { data, error } = await builder.maybeSingle();
  if (error) {
    if (error.code === "23505") throw fail(409, "O robô já está executando outro envio.");
    throw fail(503, "Falha ao acessar a fila do Portal.");
  }
  return data;
}
async function update(job, changes, slot = null) {
  const payload = { ...job.payload, ...changes, revision: crypto.randomUUID() };
  return one(table().update({ payload, period_date: slot }).eq("source",source).eq("id",job.id)
    .eq("payload->>revision",job.payload.revision).select("id,payload"));
}
function summary(job) {
  const { state, mode, hotel, start, end, done, message, activeDay } = job.payload;
  return { id: job.id, state, mode, hotel, start, end, done, message, activeDay, dates:job.payload.dates, skipped:job.payload.skipped };
}
async function bodyOf(req) {
  let body = req.body;
  if (body === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8000) throw fail(400, "Pedido inválido.");
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString("utf8");
  }
  try { return typeof body === "string" ? JSON.parse(body) : body; }
  catch { throw fail(400, "Pedido inválido."); }
}
module.exports = async function inventory(req, res) {
  try {
    const user = req.portalProfile;
    const isAdmin = user.roles.includes("admin_geral");
    const { properties, validPeriod, revisarPorNoite, planoAssistido, conferirLeitura } = await import("../../public/inventario-regra.mjs");
    const {padrao,percentuaisValidos}=await import("../../public/inventario-kpi.mjs");
    const configSource="inventario_percentuais";
    const configRow=()=>one(table().select("id,payload").eq("source",configSource).eq("period_date",writerSlot));
    async function loadPercentuais() {
      const row=await configRow();
      if (!row) return padrao;
      if (!percentuaisValidos(row.payload.percentuais)) throw fail(503,"Configuração de inventário inválida.");
      return row.payload.percentuais;
    }
    const agenda=async (body,details=false)=>{
      if (!isAdmin) throw fail(403,"Agendamentos exigem perfil de administrador.");
      const {schedule}=require("../../lib/inventario-agenda");
      return json(res,200,await schedule({body,details,owner:user.id,table,query,one,update,source,writerSlot,inventoryOccupancy,properties,validPeriod,revisarPorNoite,loadPercentuais}));
    };
    if (req.method === "GET") {
      const params = new URL(req.url, "https://portal.invalid").searchParams;
      if (params.has("agenda")) return await agenda(null,params.get("agenda")==="painel");
      const id = params.get("id");
      if (!id) {
        let pending = null;
        if (isAdmin && params.get("retomar") === "assistido")
          pending = await one(table().select("id").eq("source",source).eq("payload->>owner",user.id)
            .eq("payload->>state","assisted").order("id",{ascending:false}).limit(1));
        if (isAdmin && params.get("retomar") === "inventario")
          pending = await one(table().select("id").eq("source",source).eq("payload->>owner",user.id)
            .in("payload->>state",["assisted","codex_pendente","codex_ativo"]).order("id",{ascending:false}).limit(1));
        return json(res,200,{ hotels:Object.keys(properties), canSend:isAdmin, percentuais:await loadPercentuais(), pendingId:pending?.id || null });
      }
      const job = await one(query().eq("id",id).eq("payload->>owner",user.id));
      if (!job || job.payload.kind) throw fail(404,"Pedido não encontrado.");
      if (params.get("modo") === "codex") {
        if (!isAdmin || job.payload.mode !== "codex") throw fail(403,"Pedido indisponível para o Codex.");
        return json(res,200,{...summary(job),rows:job.payload.rows});
      }
      if (params.get("modo") === "assistido") {
        if (!isAdmin) throw fail(403,"A conferência exige perfil de administrador.");
        if (job.payload.state !== "assisted") throw fail(409,"Selecione um pedido confirmado para ajuste assistido.");
        return json(res,200,{ id:job.id, ...planoAssistido(job.payload) });
      }
      return json(res,200,summary(job));
    }
    if (req.method !== "POST") throw fail(405,"Método inválido.");
    if (req.headers.origin !== "https://" + req.headers.host || !req.headers["content-type"]?.startsWith("application/json"))
      throw fail(403,"Origem inválida.");
    const b = await bodyOf(req);
    if (typeof b?.action==="string" && b.action.startsWith("agenda")) return await agenda(b);
    if (b?.action === "salvarPercentuais") {
      if (!isAdmin) throw fail(403,"Apenas administradores podem alterar a distribuição.");
      if (!percentuaisValidos(b.percentuais)) throw fail(400,"Informe um percentual inteiro de 0 a 100 para cada canal.");
      const atual=await configRow();
      const anterior=atual?.payload.percentuais || padrao;
      if (Object.keys(padrao).some(k=>anterior[k]!==b.anterior?.[k])) throw fail(409,"A distribuição mudou. Recarregue a página.");
      const {omnibees,juniper,cvc}=b.percentuais;
      const payload={percentuais:{omnibees,juniper,cvc},revision:crypto.randomUUID()};
      const op=atual ? table().update({payload}).eq("id",atual.id).eq("payload->>revision",atual.payload.revision) :
        table().insert({source:configSource,period_month:"1970-01",period_date:writerSlot,payload});
      const saved=await op.select("id").maybeSingle();
      if (saved.error && saved.error.code!=="23505") throw fail(503,"Falha ao salvar a distribuição.");
      if (!saved.data) throw fail(409,"A distribuição mudou. Recarregue a página.");
      return json(res,200,payload.percentuais);
    }
    if (b?.action === "preview") {
      const { hotel, start, end } = b;
      const canais=b.canais===undefined ? ["omnibees"] : b.canais;
      if (!Array.isArray(canais) || !canais.length || canais.some(c=>!["omnibees","cvc","juniper"].includes(c)))
        throw fail(400,"Selecione os canais de inventário.");
      if (!Object.hasOwn(properties, hotel) || !validPeriod(start,end)) throw fail(400,"Escolha um hotel e um período válido.");
      const map = await inventoryOccupancy(start,end,hotel);
      const { linhasInventario } = await import("../../public/inventario-kpi.mjs");
      const rows = linhasInventario(map.occupancy,await loadPercentuais());
      const {issue,dates,skipped}=revisarPorNoite(rows,hotel,start,end);
      let id = null;
      if (isAdmin && !issue && canais.includes("omnibees")) {
        const payload = { owner: user.id, revision: crypto.randomUUID(), state:"preview", hotel,start,end,rows,done:0,
          ...(skipped.length ? {dates,skipped} : {}) };
        const job = await one(table().insert({source,period_month:start.slice(0,7),payload}).select("id,payload"));
        id = job.id;
      }
      return json(res,200,{ id,hotel,start,end,rows,issue,dates,skipped,canSend:isAdmin });
    }
    if (!isAdmin) throw fail(403,"Apenas administradores podem enviar.");
    if (b.action === "claim") {
      const busy = await one(query().eq("period_date",writerSlot));
      if (busy?.payload.mode === "codex") return json(res,200,{job:null});
      if (busy && Date.now()-Date.parse(busy.payload.heartbeat) < 15*60000) return json(res,200,{job:null});
      if (busy) await update(busy,{state:"failed",token:null,message:"O notebook interrompeu a execução. Confira a grade antes de um novo envio."});
      const job = await one(query().eq("payload->>state","queued").order("id").limit(1));
      if (!job) return json(res,200,{ job:null });
      const token = crypto.randomUUID();
      const claimed = await update(job,{state:"running",token, heartbeat:new Date().toISOString()},writerSlot);
      return json(res,200,{job:claimed ? { ...summary(claimed),rows:claimed.payload.rows,token } : null});
    }
    if (!Number.isSafeInteger(b.id) || b.id < 1) throw fail(400,"Pedido inválido.");
    const job = await one(query().eq("id",b.id));
    if (!job || job.payload.kind) throw fail(404,"Pedido não encontrado.");
    const p = job.payload;
    if (b.action === "confirmarCodex") {
      if (p.owner !== user.id) throw fail(403,"Prévia de outro usuário.");
      if (!["preview","codex_pendente"].includes(p.state)) throw fail(409,"Este pedido já teve outro encaminhamento.");
      const review=revisarPorNoite(p.rows,p.hotel,p.start,p.end);
      if (!validPeriod(p.start,p.end) || p.start < hoje() || review.issue ||
          (review.skipped.length && JSON.stringify(p.dates)!==JSON.stringify(review.dates)))
        throw fail(409,"Gere uma nova prévia válida para esse período.");
      let atual = job;
      if (p.state === "preview" || Date.now() >= p.entregarAte) {
        atual = await update(job,{mode:"codex",state:"codex_pendente",recibo:crypto.randomUUID(),entregarAte:Date.now()+prazoEntrega});
        if (!atual) throw fail(409,"O pedido mudou. Consulte o andamento.");
      }
      return json(res,200,{...summary(atual),recibo:atual.payload.recibo});
    }
    if (["iniciarCodex","registrarNoiteCodex","interromperCodex"].includes(b.action)) {
      if (p.owner !== user.id || p.mode !== "codex") throw fail(403,"Pedido indisponível para o Codex.");
      let changes, slot = null;
      if (b.action === "iniciarCodex") {
        if (p.state !== "codex_pendente" || Date.now() >= p.entregarAte || p.start < hoje())
          throw fail(409,"Pedido já assumido, encerrado ou com confirmação vencida.");
        changes = {state:"codex_ativo",token:crypto.randomUUID(),recibo:null};
        slot = writerSlot;
      } else if (b.action === "interromperCodex") {
        if (!["codex_ativo","codex_pendente"].includes(p.state)) throw fail(409,"Pedido já encerrado.");
        changes = {state:"failed",token:null,recibo:null,message:"Execução interrompida. Confira a última noite antes de outro pedido."};
      } else {
        if (p.state !== "codex_ativo" || !p.token || b.token !== p.token) throw fail(409,"A execução desta aba já encerrou.");
        const data = p.dates ? p.dates[p.done] : new Date(Date.parse(p.start)+p.done*86400000).toISOString().slice(0,10);
        if (data !== b.date) throw fail(409,"A noite já foi registrada ou está fora de ordem.");
        const terminou = p.dates ? p.done+1===p.dates.length : data === p.end;
        changes = {state:terminou?"codex_salvo":p.state, activeDay:data, done:p.done+1, token:terminou?null:p.token};
        slot = terminou ? null : writerSlot;
      }
      const saved = await update(job,changes,slot);
      if (!saved) throw fail(409,"O andamento mudou. Consulte o pedido antes de continuar.");
      return json(res,200,{...summary(saved),...(b.action === "iniciarCodex" ? {token:saved.payload.token} : {})});
    }
    if (b.action === "conferirAssistido") {
      if (p.owner !== user.id) throw fail(403,"Pedido de outro usuário.");
      if (p.mode !== "assisted" || !["assisted","finish"].includes(p.state)) throw fail(409,"Este pedido não está em ajuste assistido.");
      const issue = conferirLeitura(planoAssistido(p),b.leitura);
      if (issue) throw fail(409,issue);
      if (p.state === "finish") return json(res,200,summary(job));
      const saved = await update(job,{state:"finish",done:1,activeDay:p.start,verifiedAt:new Date().toISOString(),
        message:"Grade conferida pela extensão após o ajuste manual."});
      if (!saved) throw fail(409,"O pedido mudou. Consulte o andamento no Portal.");
      return json(res,200,summary(saved));
    }
    if (b.action === "confirm" || b.action === "confirmarAssistido") {
      if (p.skipped?.length) throw fail(409,"Use o envio pelo Codex para processar somente as noites válidas.");
      if (p.owner !== user.id) throw fail(403,"Prévia de outro usuário.");
      const assisted = b.action === "confirmarAssistido";
      if (assisted) {
        if (p.state === "assisted") return json(res,200,summary(job));
        if (!["preview","queued"].includes(p.state)) throw fail(409,"O pedido já está em execução ou foi encerrado.");
        if (p.start !== p.end) throw fail(400,"Escolha uma única noite para o ajuste assistido.");
        planoAssistido(p);
      } else if (p.state !== "preview") return json(res,200,summary(job));
      if (p.start < new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date())) throw fail(409,"O período já começou no passado.");
      const saved = await update(job,assisted ? {state:"assisted",mode:"assisted"} : {state:"queued"});
      if (!saved) throw fail(409,"O pedido já foi alterado. Consulte o andamento.");
      return json(res,200,summary(saved));
    }
    if (p.state !== "running" || b.token !== p.token) throw fail(409,"Execução não está ativa.");
    const nights = 1 + (Date.parse(p.end)-Date.parse(p.start))/86400000;
    if (!["progress","finish","failed"].includes(b.action) || !Number.isSafeInteger(b.done) ||
        b.done < p.done || b.done > nights || (b.action === "finish" && b.done !== nights))
      throw fail(400,"Progresso inválido.");
    const active = b.action === "progress";
    const saved = await update(job,{state:active?"running":b.action, done:b.done, activeDay:String(b.activeDay||"").slice(0,10),
      heartbeat:new Date().toISOString(), message:String(b.message||"").slice(0,350), token:active?p.token:null},active?writerSlot:null);
    if (!saved) throw fail(409,"Execução alterada.");
    return json(res,200,summary(saved));
  } catch (err) { return json(res,err.status || 503,{error:err.status ? err.message : "O Portal não conseguiu concluir o pedido."}); }
};

// Posse do recibo confirma apenas que um clique autenticado aguarda entrega.
// Os valores e as ações de execução continuam no endpoint com sessão de administrador.
module.exports.validarRecibo = async (req,res) => {
  try {
    if (req.method !== "POST") throw fail(405,"Método inválido.");
    const b = await bodyOf(req);
    if (!Number.isSafeInteger(b?.id) || b.id < 1 || typeof b.recibo !== "string" ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(b.recibo)) throw fail(400,"Recibo inválido.");
    const job = await one(table().select("id,expires:payload->>entregarAte").eq("source",source).eq("id",b.id)
      .eq("payload->>state","codex_pendente").eq("payload->>recibo",b.recibo));
    if (!job || !(Number(job.expires) > Date.now())) throw fail(404,"Recibo indisponível.");
    return json(res,200,{id:job.id});
  } catch (err) { return json(res,err.status || 503,{error:err.status ? err.message : "Falha ao validar a entrega."}); }
};
