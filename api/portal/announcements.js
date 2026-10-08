const { randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { hasEnvironment, json } = require("../../lib/portal-auth");
const { PORTAL_DEPARTMENTS, normalizePortalDepartment } = require("../../lib/portal-departments");

const DEFAULT_SUPABASE_URL = "https://pjcmjytiovuukbkewxjj.supabase.co";
const BUCKET = "portal-announcements";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const DEPARTMENTS = PORTAL_DEPARTMENTS;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", { kind: "image", extension: "jpg" }],
  ["image/png", { kind: "image", extension: "png" }],
  ["image/webp", { kind: "image", extension: "webp" }],
  ["image/gif", { kind: "image", extension: "gif" }],
  ["video/mp4", { kind: "video", extension: "mp4" }],
  ["video/webm", { kind: "video", extension: "webm" }],
  ["video/quicktime", { kind: "video", extension: "mov" }]
]);

function adminClient() {
  const url = process.env.PORTAL_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new Error("A chave secreta do Supabase não está configurada na Vercel.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function clean(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isAdmin(profile) {
  return Boolean(profile?.roles?.includes("admin_geral"));
}

function canManageAnnouncements(profile) {
  return hasEnvironment(profile, "inclusao_comunicados");
}

function normalizeDepartment(value) {
  return normalizePortalDepartment(value);
}

function canSeeDepartment(profile, department) {
  const normalized = normalizeDepartment(department);
  if (canManageAnnouncements(profile) || normalized === "Geral") return true;
  const assigned = Array.isArray(profile?.departments) ? profile.departments : [];
  return assigned.includes(normalized);
}

function visibleDepartments(profile) {
  if (canManageAnnouncements(profile) || !Array.isArray(profile?.departments) || !profile.departments.length) return canManageAnnouncements(profile) ? DEPARTMENTS : ["Geral"];
  return DEPARTMENTS.filter((department) => department === "Geral" || profile.departments.includes(department));
}

function safeUrl(value) {
  const input = clean(value, 2000);
  if (!input) return "";
  try {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 6 * 1024 * 1024) throw Object.assign(new Error("O arquivo enviado é muito grande."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("Dados inválidos."), { status: 400 });
  }
}

function parseUpload(file) {
  if (!file) return null;
  const type = clean(file.type, 100).toLowerCase();
  const allowed = ALLOWED_TYPES.get(type);
  const encoded = String(file.data || "").replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(encoded, "base64");
  if (!allowed || !buffer.length) throw Object.assign(new Error("Use uma imagem JPG, PNG, WEBP ou GIF, ou um vídeo MP4, WEBM ou MOV."), { status: 400 });
  if (buffer.length > MAX_UPLOAD_BYTES) throw Object.assign(new Error("O arquivo deve ter no máximo 4 MB. Para vídeos maiores, use um link."), { status: 413 });
  return { ...allowed, type, buffer, name: clean(file.name, 180) || `anexo.${allowed.extension}` };
}

async function signedMediaUrl(db, record) {
  if (!record.mediaPath) return record.mediaUrl || "";
  const result = await db.storage.from(BUCKET).createSignedUrl(record.mediaPath, 60 * 60);
  return result.data?.signedUrl || "";
}

async function loadAnnouncementSnapshots(db) {
  const snapshots = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from("dashboard_snapshots")
      .select("id,source,payload,created_at")
      .in("source", ["portal_announcement", "portal_announcement_read"])
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + 999);
    if (result.error) throw result.error;
    snapshots.push(...(result.data || []));
    if ((result.data || []).length < 1000) break;
  }
  return snapshots;
}

async function announcementNotificationSummary(db, profile) {
  const snapshots = await loadAnnouncementSnapshots(db);
  const publishedIds = new Set(snapshots
    .filter((item) => item.source === "portal_announcement" && item.payload?.status === "published" && canSeeDepartment(profile, item.payload?.department))
    .map((item) => item.payload.id));
  const readIds = new Set(snapshots
    .filter((item) => item.source === "portal_announcement_read" && item.payload?.userId === profile.id && publishedIds.has(item.payload?.announcementId))
    .map((item) => item.payload.announcementId));
  return { totalCount: publishedIds.size, unreadCount: publishedIds.size - readIds.size };
}

async function listAnnouncements(db, profile, includeHistory) {
  const snapshots = await loadAnnouncementSnapshots(db);
  const announcements = snapshots.filter((item) => item.source === "portal_announcement").map((item) => ({ ...item.payload, createdAt: item.created_at }));
  const visibleAnnouncements = announcements.filter((item) => item.status !== "deleted" && (includeHistory || (item.status === "published" && canSeeDepartment(profile, item.department))));
  const ids = new Set(visibleAnnouncements.map((item) => item.id));
  const reads = snapshots.filter((item) => item.source === "portal_announcement_read" && ids.has(item.payload?.announcementId))
    .map((item) => ({ ...item.payload, readAt: item.payload?.readAt || item.created_at }));
  const readsByAnnouncement = new Map();
  for (const receipt of reads) {
    if (!readsByAnnouncement.has(receipt.announcementId)) readsByAnnouncement.set(receipt.announcementId, []);
    readsByAnnouncement.get(receipt.announcementId).push(receipt);
  }
  return Promise.all(visibleAnnouncements.map(async (record) => {
    const summary = summarizeReads(readsByAnnouncement.get(record.id) || [], profile, includeHistory);
    return {
      id: record.id,
      title: record.title,
      body: record.body,
      department: normalizeDepartment(record.department),
      mediaType: record.mediaType,
      mediaUrl: await signedMediaUrl(db, record),
      mediaIsUpload: Boolean(record.mediaPath),
      mediaName: record.mediaName || "",
      author: record.createdByName || "Gestão SUEDS",
      publishedAt: record.publishedAt || record.createdAt,
      status: record.status,
      ...summary
    };
  }));
}

function summarizeReads(receipts, profile, includeHistory = false) {
  const unique = new Map();
  for (const receipt of receipts) {
    const identity = receipt.userId || receipt.readerEmail;
    if (identity && !unique.has(identity)) unique.set(identity, receipt);
  }
  const people = [...unique.values()];
  return {
    read: people.some((item) => item.userId === profile.id),
    readCount: people.length,
    readers: people.map((item) => ({
      name: item.readerName || "Colaborador",
      readAt: item.readAt,
      ...(includeHistory ? { email: item.readerEmail } : {})
    }))
  };
}

async function ensureBucket(db) {
  const existing = await db.storage.getBucket(BUCKET);
  if (existing.data) return;
  const created = await db.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_UPLOAD_BYTES,
    allowedMimeTypes: [...ALLOWED_TYPES.keys()]
  });
  if (created.error && !/already exists/i.test(created.error.message || "")) throw created.error;
}

async function ensurePortalAccess(db) {
  const environmentResult = await db.from("portal_environments").upsert({
    slug: "comunicados",
    name: "Comunicados",
    description: "Comunicados internos por departamento com confirmação individual de leitura.",
    sort_order: 5,
    status: "active"
  }, { onConflict: "slug" }).select("id").single();
  if (environmentResult.error) throw environmentResult.error;
  const profilesResult = await db.from("profiles").select("id").eq("status", "active").is("deleted_at", null);
  if (profilesResult.error) throw profilesResult.error;
  const grants = (profilesResult.data || []).map((item) => ({
    user_id: item.id,
    environment_id: environmentResult.data.id,
    granted_by: item.id
  }));
  if (grants.length) {
    const grantResult = await db.from("user_environment_access").upsert(grants, { onConflict: "user_id,environment_id", ignoreDuplicates: true });
    if (grantResult.error) throw grantResult.error;
  }
  await ensureBucket(db);
}

async function createAnnouncement(db, profile, payload) {
  const title = clean(payload.title, 160);
  const body = clean(payload.body, 12000);
  const normalizedDepartment = normalizeDepartment(payload.department);
  const department = DEPARTMENTS.includes(normalizedDepartment) ? normalizedDepartment : "Geral";
  const upload = parseUpload(payload.file);
  const linkedUrl = safeUrl(payload.mediaUrl);
  const requestedType = clean(payload.mediaType, 20);
  if (title.length < 3 || !body) throw Object.assign(new Error("Informe um título e o texto do comunicado."), { status: 400 });
  if (payload.mediaUrl && !linkedUrl) throw Object.assign(new Error("Informe um link de imagem ou vídeo válido."), { status: 400 });

  let mediaPath = null;
  let mediaType = upload?.kind || (["image", "video"].includes(requestedType) && linkedUrl ? requestedType : null);
  if (upload) {
    await ensureBucket(db);
    mediaPath = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${upload.extension}`;
    const storageResult = await db.storage.from(BUCKET).upload(mediaPath, upload.buffer, { contentType: upload.type, upsert: false });
    if (storageResult.error) throw storageResult.error;
  }
  const announcement = {
    id: randomUUID(), title, body, department, mediaType, mediaPath,
    mediaUrl: upload ? null : linkedUrl || null,
    mediaName: upload?.name || (linkedUrl ? "Mídia do comunicado" : null),
    createdBy: profile.id,
    createdByName: profile.name || profile.email || "Gestão SUEDS",
    status: "published",
    publishedAt: new Date().toISOString()
  };
  const inserted = await db.from("dashboard_snapshots").insert({
    source: "portal_announcement",
    period_month: announcement.publishedAt.slice(0, 7),
    payload: announcement
  });
  if (inserted.error) {
    if (mediaPath) await db.storage.from(BUCKET).remove([mediaPath]);
    throw inserted.error;
  }
  return announcement;
}

async function findAnnouncementSnapshot(db, announcementId) {
  const id = clean(announcementId, 80);
  const result = await db.from("dashboard_snapshots").select("id,payload").eq("source", "portal_announcement").contains("payload", { id }).limit(1).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw Object.assign(new Error("Comunicado não encontrado."), { status: 404 });
  return result.data;
}

async function updateAnnouncement(db, profile, payload) {
  const current = await findAnnouncementSnapshot(db, payload.announcementId);
  const title = clean(payload.title, 160);
  const body = clean(payload.body, 12000);
  const normalizedDepartment = normalizeDepartment(payload.department);
  const department = DEPARTMENTS.includes(normalizedDepartment) ? normalizedDepartment : "Geral";
  const upload = parseUpload(payload.file);
  const linkedUrl = safeUrl(payload.mediaUrl);
  const requestedType = clean(payload.mediaType, 20);
  if (title.length < 3 || !body) throw Object.assign(new Error("Informe um título e o texto do comunicado."), { status: 400 });
  if (payload.mediaUrl && !linkedUrl) throw Object.assign(new Error("Informe um link de imagem ou vídeo válido."), { status: 400 });

  let mediaPath = current.payload.mediaPath || null;
  let mediaType = current.payload.mediaType || null;
  let mediaUrl = current.payload.mediaUrl || null;
  let mediaName = current.payload.mediaName || null;
  if (upload) {
    await ensureBucket(db);
    mediaPath = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${upload.extension}`;
    const storageResult = await db.storage.from(BUCKET).upload(mediaPath, upload.buffer, { contentType: upload.type, upsert: false });
    if (storageResult.error) throw storageResult.error;
    mediaType = upload.kind;
    mediaUrl = null;
    mediaName = upload.name;
  } else if (linkedUrl) {
    mediaPath = null;
    mediaType = ["image", "video"].includes(requestedType) ? requestedType : "image";
    mediaUrl = linkedUrl;
    mediaName = "Mídia do comunicado";
  } else if (payload.removeMedia) {
    mediaPath = null;
    mediaType = null;
    mediaUrl = null;
    mediaName = null;
  }
  const announcement = { ...current.payload, title, body, department, mediaPath, mediaType, mediaUrl, mediaName, updatedAt: new Date().toISOString(), updatedBy: profile.id };
  const result = await db.from("dashboard_snapshots").update({ payload: announcement }).eq("id", current.id);
  if (result.error) {
    if (upload && mediaPath) await db.storage.from(BUCKET).remove([mediaPath]);
    throw result.error;
  }
  if ((upload || linkedUrl || payload.removeMedia) && current.payload.mediaPath && current.payload.mediaPath !== mediaPath) await db.storage.from(BUCKET).remove([current.payload.mediaPath]);
}

async function deleteAnnouncement(db, announcementId) {
  const current = await findAnnouncementSnapshot(db, announcementId);
  const result = await db.from("dashboard_snapshots").update({ payload: { ...current.payload, status: "deleted", deletedAt: new Date().toISOString() } }).eq("id", current.id);
  if (result.error) throw result.error;
}

async function markRead(db, profile, announcementId) {
  const id = clean(announcementId, 80);
  const exists = await db.from("dashboard_snapshots").select("id,payload").eq("source", "portal_announcement").contains("payload", { id }).limit(1).maybeSingle();
  if (exists.error) throw exists.error;
  if (!exists.data || exists.data.payload?.status !== "published" || !canSeeDepartment(profile, exists.data.payload?.department)) {
    throw Object.assign(new Error("Comunicado não encontrado."), { status: 404 });
  }
  const previous = await db.from("dashboard_snapshots").select("id").eq("source", "portal_announcement_read").contains("payload", { announcementId: id, userId: profile.id }).limit(1);
  if (previous.error) throw previous.error;
  if (previous.data?.length) return;
  const readAt = new Date().toISOString();
  const result = await db.from("dashboard_snapshots").insert({
    source: "portal_announcement_read",
    period_month: readAt.slice(0, 7),
    payload: { announcementId: id, userId: profile.id, readerName: profile.name || profile.email || "Colaborador", readerEmail: profile.email || "", readAt }
  });
  if (result.error) throw result.error;
}

module.exports = async function announcements(req, res) {
  try {
    const profile = req.portalProfile;
    const db = adminClient();
    const url = new URL(req.url, `https://${req.headers.host || "portal.suedshotels.com.br"}`);
    if (req.method === "GET") {
      if (isAdmin(profile)) await ensurePortalAccess(db);
      if (url.searchParams.get("summary") === "1") {
        return json(res, 200, { ok: true, ...await announcementNotificationSummary(db, profile) });
      }
      const includeHistory = url.searchParams.get("admin") === "1" && canManageAnnouncements(profile);
      return json(res, 200, { ok: true, isAdmin: isAdmin(profile), canManage: canManageAnnouncements(profile), departments: visibleDepartments(profile), announcements: await listAnnouncements(db, profile, includeHistory) });
    }
    if (req.method === "POST") {
      if (!canManageAnnouncements(profile)) return json(res, 403, { ok: false, error: "permission_required", message: "Sem permissão para incluir comunicados." });
      const record = await createAnnouncement(db, profile, await readBody(req));
      return json(res, 201, { ok: true, id: record.id, message: "Comunicado publicado com sucesso." });
    }
    if (req.method === "PATCH") {
      const payload = await readBody(req);
      if (["update", "delete"].includes(payload.action)) {
        if (!canManageAnnouncements(profile)) return json(res, 403, { ok: false, error: "permission_required", message: "Sem permissão para administrar comunicados." });
        if (payload.action === "update") await updateAnnouncement(db, profile, payload);
        else await deleteAnnouncement(db, payload.announcementId);
        return json(res, 200, { ok: true, message: payload.action === "update" ? "Comunicado atualizado com sucesso." : "Comunicado excluído com sucesso." });
      }
      if (payload.action !== "read") return json(res, 400, { ok: false, error: "invalid_action", message: "Ação inválida." });
      await markRead(db, profile, payload.announcementId);
      const records = await listAnnouncements(db, profile, false);
      const record = records.find((item) => item.id === clean(payload.announcementId, 80));
      return json(res, 200, { ok: true, message: "Leitura confirmada. Obrigado!", readCount: record?.readCount, readers: record?.readers });
    }
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  } catch (error) {
    const status = Number(error?.status) || 500;
    const message = error?.message || "Não foi possível processar os comunicados.";
    console.error("[portal-announcements]", error?.message || error);
    return json(res, status, { ok: false, error: error?.code || "announcements_failed", message });
  }
};

module.exports._test = { DEPARTMENTS, canManageAnnouncements, canSeeDepartment, clean, normalizeDepartment, parseUpload, safeUrl, summarizeReads, visibleDepartments, listAnnouncements, announcementNotificationSummary };
