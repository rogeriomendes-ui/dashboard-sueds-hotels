const { createClient } = require("@supabase/supabase-js");
const { json, getPortalProfile, hasEnvironment } = require("../lib/portal-auth");
const knowledgeSettings = require("./knowledge-settings");

const DEFAULT_URL = "https://pjcmjytiovuukbkewxjj.supabase.co";
function adminClient() {
  const url = process.env.PORTAL_SUPABASE_URL || DEFAULT_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new Error("A chave secreta do Supabase não está configurada.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 1000000) throw new Error("Conteúdo muito grande."); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function clean(value, max = 500) { return String(value || "").trim().slice(0, max); }
async function accessLevel(db, profile) {
  if (profile.roles?.includes("admin_geral")) return "admin";
  const env = await db.from("portal_environments").select("id").eq("slug", "treinamentos").maybeSingle();
  if (env.error || !env.data) return null;
  const grant = await db.from("user_environment_access").select("knowledge_role").eq("user_id", profile.id).eq("environment_id", env.data.id).maybeSingle();
  return grant.data?.knowledge_role || (hasEnvironment(profile, "treinamentos") ? "viewer" : null);
}
async function organization(db) {
  const result = await db.from("ecosystem_organizations").upsert({ slug: "sueds-hotels", name: "SUEDS Hotels", active: true }, { onConflict: "slug" }).select("id").single();
  if (result.error) throw result.error; return result.data.id;
}
async function list(db, organizationId, includeDrafts) {
  let query = db.from("knowledge_documents").select("id,slug,title,module,document_type,scope_type,visibility,status,owner_key,review_at,published_version,updated_at,created_at,metadata,knowledge_document_versions(id,version,title,summary,content_markdown,change_note,author_email,reviewed_by,reviewed_at,published_at,created_at)").eq("organization_id", organizationId).order("updated_at", { ascending: false });
  if (!includeDrafts) query = query.eq("status", "published");
  const result = await query; if (result.error) throw result.error;
  return (result.data || []).map((item) => ({ ...item, metadata: includeDrafts ? item.metadata : { media: item.metadata?.media || [] }, versions: (item.knowledge_document_versions || []).filter((version) => includeDrafts || version.version === item.published_version).sort((a,b) => b.version-a.version) }));
}
async function create(db, organizationId, profile, payload) {
  const title = clean(payload.title, 180); const content = clean(payload.contentMarkdown, 200000);
  if (!title || !content) throw new Error("Informe título e conteúdo.");
  const slug = clean(payload.slug || title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), 120);
  if (!slug) throw new Error("Informe um identificador válido.");
  const metadata = { media: Array.isArray(payload.media) ? payload.media.slice(0, 20).map((m) => ({ type: clean(m.type, 20), url: clean(m.url, 1000), caption: clean(m.caption, 200) })).filter((m) => m.url) : [] };
  const doc = await db.from("knowledge_documents").insert({ organization_id: organizationId, slug, title, module: clean(payload.module, 80) || "geral", document_type: clean(payload.documentType, 80) || "treinamento", scope_type: "global", visibility: "internal", status: "draft", owner_key: profile.email || profile.id, metadata }).select("id").single();
  if (doc.error) throw doc.error;
  const version = await db.from("knowledge_document_versions").insert({ document_id: doc.data.id, version: 1, title, summary: clean(payload.summary, 500), content_markdown: content, change_note: clean(payload.changeNote, 500) || "Criação do conteúdo", author_email: profile.email || profile.id });
  if (version.error) throw version.error;
  await audit(db, organizationId, doc.data.id, profile, "create", null, { title, status: "draft" });
  return doc.data.id;
}
async function update(db, organizationId, profile, id, payload) {
  const current = await db.from("knowledge_documents").select("*,knowledge_document_versions(version,title,summary,content_markdown)").eq("id", id).eq("organization_id", organizationId).single();
  if (current.error) throw current.error;
  const latest = (current.data.knowledge_document_versions || []).sort((a,b) => b.version-a.version)[0];
  const nextStatus = ["draft", "review", "published", "archived"].includes(payload.status) ? payload.status : current.data.status;
  const title = clean(payload.title || current.data.title, 180); const content = clean(payload.contentMarkdown ?? latest?.content_markdown, 200000);
  const media = Array.isArray(payload.media) ? payload.media.slice(0,20).map((m) => ({ type: clean(m.type,20), url: clean(m.url,1000), caption: clean(m.caption,200) })).filter((m) => m.url) : current.data.metadata?.pending?.media || current.data.metadata?.media || [];
  const moduleName = clean(payload.module, 80) || current.data.module;
  const documentType = clean(payload.documentType, 80) || current.data.document_type;
  const changed = title !== latest?.title || content !== latest?.content_markdown || clean(payload.summary, 500) !== (latest?.summary || "") || JSON.stringify(media) !== JSON.stringify(current.data.metadata?.pending?.media || current.data.metadata?.media || []);
  const pendingPublishedEdit = current.data.status === "published" && nextStatus !== "published" && nextStatus !== "archived";
  const metadata = { ...(current.data.metadata || {}) };
  if (pendingPublishedEdit) metadata.pending = { media, module: moduleName, documentType };
  else { metadata.media = media; delete metadata.pending; }
  const patch = { title: pendingPublishedEdit ? current.data.title : title, module: pendingPublishedEdit ? current.data.module : moduleName, document_type: pendingPublishedEdit ? current.data.document_type : documentType, status: pendingPublishedEdit ? "published" : nextStatus, metadata, updated_at: new Date().toISOString() };
  if (nextStatus === "published") patch.published_version = changed ? (latest?.version || 0) + 1 : latest?.version;
  const saved = await db.from("knowledge_documents").update(patch).eq("id", id).eq("organization_id", organizationId); if (saved.error) throw saved.error;
  if (changed) { const result = await db.from("knowledge_document_versions").insert({ document_id: id, version: (latest?.version || 0) + 1, title, summary: clean(payload.summary, 500), content_markdown: content, change_note: clean(payload.changeNote, 500) || "Atualização editorial", author_email: profile.email || profile.id, published_at: nextStatus === "published" ? new Date().toISOString() : null }); if (result.error) throw result.error; }
  await audit(db, organizationId, id, profile, "update", { status: current.data.status }, { status: nextStatus, changed });
}
async function audit(db, organizationId, documentId, profile, action, beforeState, afterState) { await db.from("knowledge_audit_log").insert({ organization_id: organizationId, document_id: documentId, actor_email: profile.email || profile.id, action, before_state: beforeState, after_state: afterState }); }
module.exports = async function knowledge(req, res) {
  try {
    const profile = await getPortalProfile(req, res); if (!profile) return json(res, 401, { error: "unauthenticated" });
    if (!hasEnvironment(profile, "treinamentos")) return json(res, 403, { error: "forbidden" });
    const db = adminClient(); const org = await organization(db); const level = await accessLevel(db, profile); if (!level) return json(res, 403, { error: "forbidden" });
    const canEdit = ["editorial", "reviewer", "admin"].includes(level); const canPublish = ["reviewer", "admin"].includes(level);
    const action = new URL(req.url, `https://${req.headers.host || "portal.suedshotels.com.br"}`).searchParams.get("action");
    if (action === "modules") return knowledgeSettings.modules(req, res, db, org, profile, level);
    if (action === "pop") return knowledgeSettings.pop(req, res, db, org, profile, level);
    if (action === "kpi-upload") return knowledgeSettings.prepareKpiVideo(req, res, db, org, level);
    if (action === "kpi") return knowledgeSettings.kpi(req, res, db, org, profile, level);
    if (req.method === "GET") return json(res, 200, { ok: true, accessLevel: level, canEdit, canPublish, documents: await list(db, org, canEdit) });
    if (!canEdit) return json(res, 403, { error: "editor_access_required" });
    const payload = await body(req);
    if (req.method === "POST") return json(res, 201, { ok: true, id: await create(db, org, profile, payload) });
    if (req.method === "PATCH") { if (!payload.id) throw new Error("Documento inválido."); if (payload.status === "published" && !canPublish) return json(res, 403, { error: "reviewer_access_required" }); await update(db, org, profile, clean(payload.id, 60), payload); return json(res, 200, { ok: true }); }
    return json(res, 405, { error: "method_not_allowed" });
  } catch (error) { console.error("[knowledge]", error); return json(res, 500, { ok: false, error: "knowledge_failed", message: error.message }); }
};
