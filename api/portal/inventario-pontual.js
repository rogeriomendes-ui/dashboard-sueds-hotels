const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { json, supabaseConfig } = require("../../lib/portal-auth");
const { inventoryOccupancy } = require("../../server");

const source = "inventario_pontual_v1";
// The existing partial unique index permits one active writer for this source.
const writerSlot = "1970-01-01";
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
  const { state, hotel, start, end, done, message, activeDay } = job.payload;
  return { id: job.id, state, hotel, start, end, done, message, activeDay };
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
    const { properties, validPeriod, revisar } = await import("../../public/inventario-regra.mjs");
    if (req.method === "GET") {
      const id = new URL(req.url, "https://portal.invalid").searchParams.get("id");
      if (!id) return json(res,200,{ hotels: Object.keys(properties), canSend: isAdmin });
      const job = await one(query().eq("id",id).eq("payload->>owner",user.id));
      if (!job) throw fail(404,"Pedido não encontrado.");
      return json(res,200,summary(job));
    }
    if (req.method !== "POST") throw fail(405,"Método inválido.");
    if (req.headers.origin !== "https://" + req.headers.host || !req.headers["content-type"]?.startsWith("application/json"))
      throw fail(403,"Origem inválida.");
    const b = await bodyOf(req);
    if (b?.action === "preview") {
      const { hotel, start, end } = b;
      if (!Object.hasOwn(properties, hotel) || !validPeriod(start,end)) throw fail(400,"Escolha um hotel e um período válido.");
      const map = await inventoryOccupancy(start,end,hotel);
      const { linhasInventario } = await import("../../public/inventario-kpi.mjs");
      const rows = linhasInventario(map.occupancy);
      const issue = revisar(rows,hotel,start,end);
      let id = null;
      if (isAdmin && !issue) {
        const payload = { owner: user.id, revision: crypto.randomUUID(), state:"preview", hotel,start,end,rows,done:0 };
        const job = await one(table().insert({source,period_month:start.slice(0,7),payload}).select("id,payload"));
        id = job.id;
      }
      return json(res,200,{ id,hotel,start,end,rows,issue,canSend:isAdmin });
    }
    if (!isAdmin) throw fail(403,"Apenas administradores podem enviar.");
    if (b.action === "claim") {
      const busy = await one(query().eq("period_date",writerSlot));
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
    if (!job) throw fail(404,"Pedido não encontrado.");
    const p = job.payload;
    if (b.action === "confirm") {
      if (p.owner !== user.id) throw fail(403,"Prévia de outro usuário.");
      if (p.state !== "preview") return json(res,200,summary(job));
      if (p.start < new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date())) throw fail(409,"O período já começou no passado.");
      const saved = await update(job,{state:"queued"});
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
