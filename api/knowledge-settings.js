const { json } = require("../lib/portal-auth");
const { randomUUID } = require("node:crypto");
const { wordToHtml, pdfFromHtml } = require("../lib/knowledge-pop-render");

const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const editable = (level) => ["editorial", "reviewer", "admin"].includes(level);
const VIDEO_BUCKET = "portal-knowledge-videos";
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm", "video/ogg": "ogg" };
const POP_BUCKET = "portal-knowledge-pops";
const POP_TYPES = { "application/pdf": "pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx" };
const MAX_POP_BYTES = 25 * 1024 * 1024;
const MAX_POP_WORD_BYTES = 3 * 1024 * 1024;
const MODULE_ICONS = new Set(["🏨", "🛎️", "📅", "🛏️", "🍽️", "🎉", "🔧", "📈", "💳", "👥", "🚌", "✈️"]);
const moduleIcon = (value) => MODULE_ICONS.has(clean(value, 10)) ? clean(value, 10) : "🏨";
const videoPathFor = (org, activityId, path) => new RegExp(`^${org}/kpi/${activityId}/[0-9a-f-]{36}\\.(mp4|webm|ogg)$`, "i").test(path);
async function ensureVideoBucket(db) {
  const existing = await db.storage.getBucket(VIDEO_BUCKET);
  if (existing.data) return;
  const created = await db.storage.createBucket(VIDEO_BUCKET, { public: false, allowedMimeTypes: Object.keys(VIDEO_TYPES) });
  if (created.error && !/already exists/i.test(created.error.message || "")) throw created.error;
}
async function signedVideoUrl(db, path) {
  if (!path) return "";
  const result = await db.storage.from(VIDEO_BUCKET).createSignedUrl(path, 24 * 60 * 60);
  if (result.error) throw result.error;
  return result.data.signedUrl;
}
function validVideoUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
      const id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
      return /^[a-zA-Z0-9_-]{11}$/.test(id || "");
    }
    if (host === "youtu.be") return /^[a-zA-Z0-9_-]{11}$/.test(url.pathname.split("/")[1] || "");
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) return /\/(?:video\/)?\d+/.test(url.pathname);
    if (host === "drive.google.com") return /^\/file\/d\/[a-zA-Z0-9_-]+/.test(url.pathname);
    return /\.(mp4|webm|ogg)$/i.test(url.pathname);
  } catch (_) { return false; }
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 1000000) throw new Error("Conteúdo muito grande."); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
async function settings(db, org) {
  const result = await db.from("ecosystem_organizations").select("metadata").eq("id", org).single();
  if (result.error) throw result.error;
  const metadata = result.data.metadata || {};
  return { metadata, modules: metadata.knowledgeModules || [{ id: "kpi", slug: "kpi", name: "KPIFull", description: "Manual operacional KPIFull", sort_order: 1, active: true }], edits: metadata.knowledgeKpiEdits || {} };
}
async function save(db, org, metadata) {
  const result = await db.from("ecosystem_organizations").update({ metadata, updated_at: new Date().toISOString() }).eq("id", org);
  if (result.error) throw result.error;
}
async function audit(db, org, profile, action, before, after) {
  const result = await db.from("knowledge_audit_log").insert({ organization_id: org, document_id: null, actor_email: profile.email || profile.id, action, before_state: before, after_state: after });
  if (result.error) throw result.error;
}
async function modules(req, res, db, org, profile, level) {
  const state = await settings(db, org);
  if (req.method === "GET") {
    const reads = await db.from("dashboard_snapshots").select("payload").eq("source", "portal_knowledge_pop_read").contains("payload", { organizationId: org, userId: profile.id });
    if (reads.error) throw reads.error;
    const completed = new Set((reads.data || []).map((row) => `${row.payload?.module}:${row.payload?.version}`));
    return json(res, 200, { ok: true, modules: [...state.modules].filter((item) => editable(level) || item.active).sort((a,b) => a.sort_order-b.sort_order || a.name.localeCompare(b.name)).map(({ pop, ...item }) => ({ ...item, icon: moduleIcon(item.icon), pop: pop ? { name: pop.name, type: pop.type, version: pop.version, publishedAt: pop.publishedAt, read: completed.has(`${item.slug}:${pop.version}`) } : null })) });
  }
  if (!editable(level)) return json(res, 403, { error: "editor_access_required" });
  const data = await body(req);
  if (req.method === "POST") {
    const name = clean(data.name, 80);
    const slug = clean(data.slug || name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), 80);
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return json(res, 400, { error: "invalid_module", message: "Informe um nome e identificador válidos." });
    if (state.modules.some((item) => item.slug === slug)) return json(res, 409, { error: "duplicate_module", message: "Já existe um módulo com esse nome." });
    state.modules.push({ id: slug, slug, name, description: clean(data.description, 500), icon: moduleIcon(data.icon), sort_order: Number.isInteger(data.sortOrder) ? data.sortOrder : state.modules.length + 1, active: true });
    await save(db, org, { ...state.metadata, knowledgeModules: state.modules });
    await audit(db, org, profile, "module_create", null, { slug, name });
    return json(res, 201, { ok: true, id: slug });
  }
  if (req.method === "PATCH") {
    const item = state.modules.find((module) => module.id === clean(data.id, 80));
    if (!item) return json(res, 404, { error: "not_found" });
    const name = clean(data.name, 80);
    if (!name) return json(res, 400, { error: "invalid_module" });
    if (data.active === false) {
      if (item.slug === "kpi") return json(res, 409, { error: "module_in_use", message: "O módulo KPI contém o manual publicado e não pode ser desativado." });
      const used = await db.from("knowledge_documents").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("module", item.slug).neq("status", "archived");
      if (used.error) throw used.error;
      if (used.count) return json(res, 409, { error: "module_in_use", message: "Mova ou arquive os conteúdos deste módulo antes de desativá-lo." });
    }
    const before = { ...item };
    Object.assign(item, { name, description: clean(data.description, 500), icon: moduleIcon(data.icon || item.icon), sort_order: Number.isInteger(data.sortOrder) ? data.sortOrder : 0, active: data.active !== false });
    await save(db, org, { ...state.metadata, knowledgeModules: state.modules });
    await audit(db, org, profile, "module_update", before, item);
    return json(res, 200, { ok: true });
  }
  if (req.method === "DELETE") {
    if (!['reviewer', 'admin'].includes(level)) return json(res, 403, { error: "reviewer_access_required" });
    const item = state.modules.find((module) => module.id === clean(data.id, 80));
    if (!item || data.confirm !== true) return json(res, 400, { error: "invalid_module", message: "Confirme a exclusão do módulo." });
    const documents = await db.from("knowledge_documents").select("id,metadata").eq("organization_id", org).eq("module", item.slug);
    if (documents.error) throw documents.error;
    const mediaPaths = (documents.data || []).flatMap((document) => [...(document.metadata?.media || []), ...(document.metadata?.pending?.media || [])].map((media) => media.path).filter(Boolean));
    if (mediaPaths.length) {
      const removed = await db.storage.from("portal-knowledge-media").remove(mediaPaths);
      if (removed.error && removed.error.code !== "NoSuchBucket") throw removed.error;
    }
    const deleted = await db.from("knowledge_documents").delete().eq("organization_id", org).eq("module", item.slug);
    if (deleted.error) throw deleted.error;
    const trainingReads = await db.from("dashboard_snapshots").delete().eq("source", "portal_knowledge_training_read").contains("payload", { organizationId: org, module: item.slug });
    if (trainingReads.error) throw trainingReads.error;
    const popReads = await db.from("dashboard_snapshots").delete().eq("source", "portal_knowledge_pop_read").contains("payload", { organizationId: org, module: item.slug });
    if (popReads.error) throw popReads.error;
    if (item.pop?.path) {
      const removed = await db.storage.from(POP_BUCKET).remove([item.pop.path]);
      if (removed.error && removed.error.code !== "NoSuchBucket") throw removed.error;
    }
    const before = { ...item };
    state.modules = state.modules.filter((module) => module.id !== item.id);
    await save(db, org, { ...state.metadata, knowledgeModules: state.modules, knowledgeKpiEdits: item.slug === "kpi" ? {} : state.edits });
    await audit(db, org, profile, "module_delete", before, { slug: item.slug, deletedDocuments: documents.data?.length || 0 });
    return json(res, 200, { ok: true, deletedDocuments: documents.data?.length || 0 });
  }
  return json(res, 405, { error: "method_not_allowed" });
}
async function pop(req, res, db, org, profile, level) {
  const state = await settings(db, org);
  const selected = new URL(req.url, `https://${req.headers.host || "portal.suedshotels.com.br"}`).searchParams.get("module");
  const module = state.modules.find((item) => item.slug === selected && (item.active || editable(level)));
  if (!module) return json(res, 404, { error: "module_not_found", message: "Módulo não encontrado." });
  const current = module.pop;
  if (req.method === "GET") {
    if (!current) return json(res, 200, { ok: true, pop: null, read: false, readers: [] });
    const isPdf = current.type === "application/pdf";
    const format = new URL(req.url, `https://${req.headers.host || "portal.suedshotels.com.br"}`).searchParams.get("format");
    if (format === "pdf") {
      const filename = `POP-${module.slug}-v${current.version}.pdf`;
      if (isPdf) {
        const signed = await db.storage.from(POP_BUCKET).createSignedUrl(current.path, 60 * 60, { download: filename });
        if (signed.error) throw signed.error;
        res.statusCode = 302;
        res.setHeader("Location", signed.data.signedUrl);
        res.setHeader("Cache-Control", "private, no-store");
        return res.end();
      }
      const downloaded = await db.storage.from(POP_BUCKET).download(current.path);
      if (downloaded.error) throw downloaded.error;
      const original = Buffer.from(await downloaded.data.arrayBuffer());
      const printable = await pdfFromHtml(await wordToHtml(original), `POP · ${module.name}`);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, no-store");
      return res.end(printable);
    }
    const reads = await db.from("dashboard_snapshots").select("payload,created_at").eq("source", "portal_knowledge_pop_read").contains("payload", { organizationId: org, module: module.slug, version: current.version }).order("created_at", { ascending: true });
    if (reads.error) throw reads.error;
    const unique = new Map();
    for (const row of reads.data || []) if (row.payload?.userId && !unique.has(row.payload.userId)) unique.set(row.payload.userId, row.payload);
    const file = await db.storage.from(POP_BUCKET).createSignedUrl(current.path, 60 * 60);
    if (file.error) throw file.error;
    let html = "";
    if (!isPdf && new URL(req.url, `https://${req.headers.host || "portal.suedshotels.com.br"}`).searchParams.get("summary") !== "1") {
      const downloaded = await db.storage.from(POP_BUCKET).download(current.path);
      if (downloaded.error) throw downloaded.error;
      html = await wordToHtml(Buffer.from(await downloaded.data.arrayBuffer()));
    }
    return json(res, 200, { ok: true, pop: { name: current.name, version: current.version, publishedAt: current.publishedAt, type: current.type, url: file.data.signedUrl, html }, read: unique.has(profile.id), readers: editable(level) ? [...unique.values()].map((item) => ({ name: item.readerName, email: item.readerEmail, readAt: item.readAt })) : [] });
  }
  const data = await body(req);
  if (req.method === "POST" && data.action === "upload") {
    if (!editable(level)) return json(res, 403, { error: "editor_access_required" });
    const type = clean(data.type, 120).toLowerCase();
    const size = Number(data.size);
    if (!POP_TYPES[type] || !Number.isSafeInteger(size) || size < 1 || size > (type === "application/pdf" ? MAX_POP_BYTES : MAX_POP_WORD_BYTES)) return json(res, 400, { error: "invalid_pop", message: "Selecione um Word de até 3 MB ou PDF de até 25 MB." });
    const existing = await db.storage.getBucket(POP_BUCKET);
    if (!existing.data) { const created = await db.storage.createBucket(POP_BUCKET, { public: false, fileSizeLimit: MAX_POP_BYTES, allowedMimeTypes: Object.keys(POP_TYPES) }); if (created.error && !/already exists/i.test(created.error.message || "")) throw created.error; }
    const path = `${org}/${module.slug}/${randomUUID()}.${POP_TYPES[type]}`;
    const signed = await db.storage.from(POP_BUCKET).createSignedUploadUrl(path);
    if (signed.error) throw signed.error;
    return json(res, 200, { ok: true, path, signedUrl: signed.data.signedUrl });
  }
  if (req.method === "POST" && data.action === "read") {
    if (!current) return json(res, 404, { error: "pop_not_found" });
    if (Number(data.version) !== current.version) return json(res, 409, { error: "pop_updated", message: "O POP foi atualizado. Abra a nova versão antes de confirmar." });
    const previous = await db.from("dashboard_snapshots").select("id").eq("source", "portal_knowledge_pop_read").contains("payload", { organizationId: org, module: module.slug, version: current.version, userId: profile.id }).limit(1);
    if (previous.error) throw previous.error;
    if (previous.data?.length) return json(res, 200, { ok: true });
    const readAt = new Date().toISOString();
    const inserted = await db.from("dashboard_snapshots").insert({ source: "portal_knowledge_pop_read", period_month: readAt.slice(0, 7), payload: { organizationId: org, module: module.slug, version: current.version, userId: profile.id, readerName: profile.name || profile.email || "Colaborador", readerEmail: profile.email || "", readAt } });
    if (inserted.error) throw inserted.error;
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && data.action === "publish") {
    if (!editable(level)) return json(res, 403, { error: "editor_access_required" });
    const path = clean(data.path, 300);
    const type = clean(data.type, 120).toLowerCase();
    if (!POP_TYPES[type] || !new RegExp(`^${org}/${module.slug}/[0-9a-f-]{36}\\.${POP_TYPES[type]}$`, "i").test(path)) return json(res, 400, { error: "invalid_pop", message: "Arquivo POP inválido." });
    const existing = await db.storage.from(POP_BUCKET).info(path);
    if (existing.error || !existing.data) return json(res, 400, { error: "upload_missing", message: "Envie o arquivo antes de publicar." });
    if (type !== "application/pdf") {
      const downloaded = await db.storage.from(POP_BUCKET).download(path);
      if (downloaded.error) throw downloaded.error;
      let html;
      try { html = await wordToHtml(Buffer.from(await downloaded.data.arrayBuffer())); }
      catch (_) { return json(res, 400, { error: "invalid_word", message: "Não foi possível ler este Word. Envie um arquivo .docx válido." }); }
      if (!/<p|<h[1-6]|<li/i.test(html)) return json(res, 400, { error: "empty_word", message: "O Word não contém texto para apresentar no portal." });
      await pdfFromHtml(html, `POP · ${module.name}`);
    }
    const before = current || null;
    module.pop = { path, type, name: clean(data.name, 180) || `POP.${POP_TYPES[type]}`, version: (current?.version || 0) + 1, publishedAt: new Date().toISOString() };
    await save(db, org, { ...state.metadata, knowledgeModules: state.modules });
    await audit(db, org, profile, "pop_publish", before, module.pop);
    return json(res, 200, { ok: true, version: module.pop.version });
  }
  return json(res, 405, { error: "method_not_allowed" });
}
async function prepareKpiVideo(req, res, db, org, level) {
  if (!editable(level)) return json(res, 403, { error: "editor_access_required" });
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  const data = await body(req);
  const activityId = clean(data.activityId, 100);
  const type = clean(data.type, 100).toLowerCase();
  const size = Number(data.size);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(activityId) || !VIDEO_TYPES[type] || !Number.isSafeInteger(size) || size <= 0 || size > MAX_VIDEO_BYTES) return json(res, 400, { error: "invalid_video", message: "Escolha um vídeo MP4, WebM ou OGG de até 500 MB." });
  await ensureVideoBucket(db);
  const path = `${org}/kpi/${activityId}/${randomUUID()}.${VIDEO_TYPES[type]}`;
  const signed = await db.storage.from(VIDEO_BUCKET).createSignedUploadUrl(path);
  if (signed.error) throw signed.error;
  return json(res, 200, { ok: true, path, signedUrl: signed.data.signedUrl });
}
async function kpi(req, res, db, org, profile, level) {
  const state = await settings(db, org);
  if (req.method === "GET") {
    const edits = await Promise.all(Object.entries(state.edits).map(async ([activity_id, edit]) => {
      let videoPlaybackUrl = "";
      if (edit.content?.videoPath) {
        try { videoPlaybackUrl = await signedVideoUrl(db, edit.content.videoPath); }
        catch (error) { console.error("[knowledge] Video link failed", error); }
      }
      return { activity_id, ...edit, content: { ...edit.content, videoPlaybackUrl } };
    }));
    return json(res, 200, { ok: true, canEdit: editable(level), edits });
  }
  if (!editable(level)) return json(res, 403, { error: "editor_access_required" });
  if (req.method !== "PATCH") return json(res, 405, { error: "method_not_allowed" });
  const data = await body(req);
  const activityId = clean(data.activityId, 100), content = data.content || {};
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(activityId) || !clean(content.title, 180) || !clean(content.summary, 500) || !Array.isArray(content.steps) || !content.steps.length || content.steps.length > 30 || content.steps.some((step) => !clean(step, 1000))) return json(res, 400, { error: "invalid_activity", message: "Preencha título, resumo e etapas da atividade." });
  const videoUrl = clean(content.videoUrl, 1000);
  if (!validVideoUrl(videoUrl)) return json(res, 400, { error: "invalid_video", message: "Use um link HTTPS válido do YouTube, Vimeo, Google Drive ou de um arquivo MP4, WebM ou OGG." });
  const videoPath = clean(content.videoPath, 300);
  if (videoPath && (videoUrl || !videoPathFor(org, activityId, videoPath))) return json(res, 400, { error: "invalid_video", message: "O arquivo de vídeo não pertence a esta atividade." });
  if (videoPath) {
    const stored = await db.storage.from(VIDEO_BUCKET).info(videoPath);
    if (stored.error || !stored.data) return json(res, 400, { error: "video_not_uploaded", message: "O envio do vídeo não foi concluído. Tente novamente." });
  }
  const normalized = { title: clean(content.title, 180), summary: clean(content.summary, 500), steps: content.steps.map((step) => clean(step, 1000)), attention: clean(content.attention, 1000), image: clean(content.image, 1000), imageAlt: clean(content.imageAlt, 200), videoUrl, videoPath, videoFileName: videoPath ? clean(content.videoFileName, 180) : "", videoTitle: videoUrl || videoPath ? clean(content.videoTitle, 180) : "" };
  const before = state.edits[activityId] || null;
  const version = (before?.version || 0) + 1;
  state.edits[activityId] = { content: normalized, version, updated_at: new Date().toISOString() };
  await save(db, org, { ...state.metadata, knowledgeKpiEdits: state.edits });
  await audit(db, org, profile, "kpi_activity_update", { activityId, edit: before }, { activityId, edit: state.edits[activityId] });
  if (before?.content?.videoPath && before.content.videoPath !== videoPath) {
    const removed = await db.storage.from(VIDEO_BUCKET).remove([before.content.videoPath]);
    if (removed.error) console.error("[knowledge] Old video cleanup failed", removed.error);
  }
  let videoPlaybackUrl = "";
  if (videoPath) {
    try { videoPlaybackUrl = await signedVideoUrl(db, videoPath); }
    catch (error) { console.error("[knowledge] Video link failed", error); }
  }
  return json(res, 200, { ok: true, version, videoPlaybackUrl });
}
module.exports = { modules, pop, kpi, prepareKpiVideo };
