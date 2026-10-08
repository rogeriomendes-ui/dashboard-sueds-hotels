const { createClient } = require("@supabase/supabase-js");
const { json, getPortalProfile, hasEnvironment } = require("../lib/portal-auth");
const knowledgeSettings = require("./knowledge-settings");

const DEFAULT_URL = "https://pjcmjytiovuukbkewxjj.supabase.co";
const DOCUMENT_MEDIA_BUCKET = "portal-knowledge-media";
const DOCUMENT_MEDIA_MAX_BYTES = 50 * 1024 * 1024;
const DOCUMENT_MEDIA_TYPES = {
  "image/jpeg": { type: "imagem", extension: "jpg", maxBytes: 20 * 1024 * 1024 },
  "image/png": { type: "imagem", extension: "png", maxBytes: 20 * 1024 * 1024 },
  "image/webp": { type: "imagem", extension: "webp", maxBytes: 20 * 1024 * 1024 },
  "image/gif": { type: "imagem", extension: "gif", maxBytes: 20 * 1024 * 1024 },
  "video/mp4": { type: "video", extension: "mp4", maxBytes: DOCUMENT_MEDIA_MAX_BYTES },
  "video/webm": { type: "video", extension: "webm", maxBytes: DOCUMENT_MEDIA_MAX_BYTES },
  "video/ogg": { type: "video", extension: "ogg", maxBytes: DOCUMENT_MEDIA_MAX_BYTES }
};
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
function documentMediaPathFor(organizationId, documentId, path) { return new RegExp(`^${organizationId}/documents/${documentId}/[0-9a-f-]{36}\\.(jpg|png|webp|gif|mp4|webm|ogg)$`, "i").test(path); }
function normalizeMedia(items, organizationId, documentId) {
  return Array.isArray(items) ? items.slice(0, 20).map((item) => {
    const type = clean(item.type, 20);
    const path = clean(item.path, 300);
    return { type, url: documentId && documentMediaPathFor(organizationId, documentId, path) ? "" : clean(item.url, 1000), path: documentId && documentMediaPathFor(organizationId, documentId, path) ? path : "", caption: clean(item.caption, 200) };
  }).filter((item) => item.url || item.path) : [];
}
async function mediaForResponse(db, media) {
  return Promise.all((media || []).map(async (item) => {
    if (!item.path) return item;
    const signed = await db.storage.from(DOCUMENT_MEDIA_BUCKET).createSignedUrl(item.path, 24 * 60 * 60);
    return { ...item, url: signed.error ? "" : signed.data.signedUrl };
  }));
}
async function list(db, organizationId, includeDrafts) {
  let query = db.from("knowledge_documents").select("id,slug,title,module,document_type,scope_type,visibility,status,owner_key,review_at,published_version,updated_at,created_at,metadata,knowledge_document_versions(id,version,title,summary,content_markdown,change_note,author_email,reviewed_by,reviewed_at,published_at,created_at)").eq("organization_id", organizationId).order("updated_at", { ascending: false });
  if (!includeDrafts) query = query.eq("status", "published");
  const result = await query; if (result.error) throw result.error;
  return Promise.all((result.data || []).map(async (item) => {
    const metadata = includeDrafts ? { ...(item.metadata || {}) } : { media: item.metadata?.media || [] };
    if (metadata.media) metadata.media = await mediaForResponse(db, metadata.media);
    if (metadata.pending?.media) metadata.pending = { ...metadata.pending, media: await mediaForResponse(db, metadata.pending.media) };
    return { ...item, metadata, versions: (item.knowledge_document_versions || []).filter((version) => includeDrafts || version.version === item.published_version).sort((a,b) => b.version-a.version) };
  }));
}
async function create(db, organizationId, profile, payload) {
  const title = clean(payload.title, 180); const content = clean(payload.contentMarkdown, 200000);
  if (!title || !content) throw new Error("Informe título e conteúdo.");
  const slug = clean(payload.slug || title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), 120);
  if (!slug) throw new Error("Informe um identificador válido.");
  const metadata = { media: normalizeMedia(payload.media, organizationId, "") };
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
  const media = Array.isArray(payload.media) ? normalizeMedia(payload.media, organizationId, id) : current.data.metadata?.pending?.media || current.data.metadata?.media || [];
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
async function removeDocument(db, organizationId, profile, level, payload) {
  if (!['reviewer', 'admin'].includes(level)) throw new Error("Apenas gestores podem excluir treinamentos.");
  const id = clean(payload.id, 60);
  if (payload.confirm !== true || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Confirme a exclusão do treinamento.");
  const document = await db.from("knowledge_documents").select("id,title,module,metadata").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (document.error) throw document.error;
  if (!document.data) throw new Error("Treinamento não encontrado.");
  const paths = [...(document.data.metadata?.media || []), ...(document.data.metadata?.pending?.media || [])].map((media) => media.path).filter(Boolean);
  if (paths.length) {
    const removed = await db.storage.from(DOCUMENT_MEDIA_BUCKET).remove(paths);
    if (removed.error && removed.error.code !== "NoSuchBucket") throw removed.error;
  }
  const deleted = await db.from("knowledge_documents").delete().eq("id", id).eq("organization_id", organizationId);
  if (deleted.error) throw deleted.error;
  const reads = await db.from("dashboard_snapshots").delete().eq("source", "portal_knowledge_training_read").contains("payload", { organizationId, documentId: id });
  if (reads.error) throw reads.error;
  await audit(db, organizationId, id, profile, "delete", { title: document.data.title, module: document.data.module }, null);
}
async function audit(db, organizationId, documentId, profile, action, beforeState, afterState) { await db.from("knowledge_audit_log").insert({ organization_id: organizationId, document_id: documentId, actor_email: profile.email || profile.id, action, before_state: beforeState, after_state: afterState }); }
async function ensureDocumentMediaBucket(db) {
  const options = { public: false, fileSizeLimit: DOCUMENT_MEDIA_MAX_BYTES, allowedMimeTypes: Object.keys(DOCUMENT_MEDIA_TYPES) };
  const bucket = await db.storage.getBucket(DOCUMENT_MEDIA_BUCKET);
  if (bucket.error && bucket.error.code !== "NoSuchBucket") throw bucket.error;
  if (!bucket.data) {
    const created = await db.storage.createBucket(DOCUMENT_MEDIA_BUCKET, options);
    if (created.error && !/already exists/i.test(created.error.message || "")) throw created.error;
    return;
  }
  if (Number(bucket.data.file_size_limit || 0) < DOCUMENT_MEDIA_MAX_BYTES) {
    const updated = await db.storage.updateBucket(DOCUMENT_MEDIA_BUCKET, options);
    if (updated.error) throw new Error("Não foi possível atualizar o limite do armazenamento de mídia. Verifique o limite global do Supabase.");
  }
}
async function documentMediaUpload(req, res, db, organizationId, level) {
  if (!['editorial', 'reviewer', 'admin'].includes(level)) return json(res, 403, { error: 'editor_access_required' });
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const payload = await body(req), documentId = clean(payload.documentId, 60), mimeType = clean(payload.mimeType, 100).toLowerCase(), size = Number(payload.size);
  const details = DOCUMENT_MEDIA_TYPES[mimeType];
  if (!/^[0-9a-f-]{36}$/i.test(documentId) || !details || details.type !== clean(payload.type, 20) || !Number.isSafeInteger(size) || size < 1 || size > details.maxBytes) return json(res, 400, { error: 'invalid_media', message: 'Arquivo de mídia inválido.' });
  const document = await db.from('knowledge_documents').select('id').eq('id', documentId).eq('organization_id', organizationId).maybeSingle();
  if (document.error) throw document.error;
  if (!document.data) return json(res, 404, { error: 'document_not_found' });
  await ensureDocumentMediaBucket(db);
  const path = `${organizationId}/documents/${documentId}/${require('node:crypto').randomUUID()}.${details.extension}`;
  const signed = await db.storage.from(DOCUMENT_MEDIA_BUCKET).createSignedUploadUrl(path);
  if (signed.error) throw signed.error;
  return json(res, 200, { ok: true, path, signedUrl: signed.data.signedUrl });
}
async function trainingRead(req, res, db, organizationId, profile) {
  const query = new URL(req.url, `https://${req.headers.host || "portal.suedshotels.com.br"}`).searchParams;
  const payload = req.method === "POST" ? await body(req) : {};
  const documentId = clean(req.method === "POST" ? payload.documentId : query.get("documentId"), 60);
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return json(res, 400, { error: "invalid_document", message: "Treinamento inválido." });
  const document = await db.from("knowledge_documents").select("id,title,module,published_version,status").eq("id", documentId).eq("organization_id", organizationId).maybeSingle();
  if (document.error) throw document.error;
  if (!document.data || document.data.status !== "published" || !document.data.published_version) return json(res, 404, { error: "document_not_found", message: "Treinamento não encontrado." });
  const receipt = { organizationId, documentId, version: document.data.published_version, userId: profile.id };
  const previous = await db.from("dashboard_snapshots").select("id").eq("source", "portal_knowledge_training_read").contains("payload", receipt).limit(1);
  if (previous.error) throw previous.error;
  if (req.method === "GET") return json(res, 200, { ok: true, read: Boolean(previous.data?.length) });
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  if (previous.data?.length) return json(res, 200, { ok: true, read: true });
  const readAt = new Date().toISOString();
  const inserted = await db.from("dashboard_snapshots").insert({ source: "portal_knowledge_training_read", period_month: readAt.slice(0, 7), payload: { ...receipt, title: document.data.title, module: document.data.module, readerName: profile.name || profile.email || "Colaborador", readerEmail: profile.email || "", readAt } });
  if (inserted.error) throw inserted.error;
  return json(res, 200, { ok: true, read: true });
}
module.exports = async function knowledge(req, res) {
  try {
    const profile = await getPortalProfile(req, res); if (!profile) return json(res, 401, { error: "unauthenticated" });
    if (!hasEnvironment(profile, "treinamentos")) return json(res, 403, { error: "forbidden" });
    const db = adminClient(); const org = await organization(db); const level = await accessLevel(db, profile); if (!level) return json(res, 403, { error: "forbidden" });
    const canEdit = ["editorial", "reviewer", "admin"].includes(level); const canPublish = ["reviewer", "admin"].includes(level);
    const action = new URL(req.url, `https://${req.headers.host || "portal.suedshotels.com.br"}`).searchParams.get("action");
    if (action === "modules") return knowledgeSettings.modules(req, res, db, org, profile, level);
    if (action === "pop") return knowledgeSettings.pop(req, res, db, org, profile, level);
    if (action === "document-media-upload") return documentMediaUpload(req, res, db, org, level);
    if (action === "training-read") return trainingRead(req, res, db, org, profile);
    if (action === "kpi-upload") return knowledgeSettings.prepareKpiVideo(req, res, db, org, level);
    if (action === "kpi") return knowledgeSettings.kpi(req, res, db, org, profile, level);
    if (req.method === "GET") return json(res, 200, { ok: true, accessLevel: level, canEdit, canPublish, documents: await list(db, org, canEdit) });
    if (!canEdit) return json(res, 403, { error: "editor_access_required" });
    const payload = await body(req);
    if (req.method === "POST") return json(res, 201, { ok: true, id: await create(db, org, profile, payload) });
    if (req.method === "PATCH") { if (!payload.id) throw new Error("Documento inválido."); if (payload.status === "published" && !canPublish) return json(res, 403, { error: "reviewer_access_required" }); await update(db, org, profile, clean(payload.id, 60), payload); return json(res, 200, { ok: true }); }
    if (req.method === "DELETE") { await removeDocument(db, org, profile, level, payload); return json(res, 200, { ok: true }); }
    return json(res, 405, { error: "method_not_allowed" });
  } catch (error) { console.error("[knowledge]", error); return json(res, 500, { ok: false, error: "knowledge_failed", message: error.message }); }
};
