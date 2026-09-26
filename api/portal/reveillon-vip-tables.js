const { createClient } = require("@supabase/supabase-js");
const { json } = require("../../lib/portal-auth");

const DEFAULT_SUPABASE_URL = "https://pjcmjytiovuukbkewxjj.supabase.co";
const TABLE_COUNT = 59;
const VALID_PARTICIPANT_STATUSES = new Set(["blocked", "paid"]);

function adminClient() {
  const url = process.env.PORTAL_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new Error("A chave secreta do Supabase não está configurada na Vercel.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function clean(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanParticipants(value) {
  if (!Array.isArray(value)) return [];
  return value.map((participant) => {
    if (typeof participant === "string") {
      return { name: clean(participant, 100), reservationNumber: "", status: "blocked", seller: "", notes: "" };
    }
    return {
      name: clean(participant?.name, 100),
      reservationNumber: clean(participant?.reservationNumber, 80),
      status: clean(participant?.status, 20),
      seller: clean(participant?.seller, 100),
      notes: clean(participant?.notes, 500)
    };
  }).filter((participant) => participant.name || participant.reservationNumber || participant.status || participant.seller || participant.notes).slice(0, 5);
}

function recordParticipants(record) {
  const legacyStatus = record?.status === "sold" ? "paid" : "blocked";
  const legacySeller = clean(record?.owner_name, 100);
  const source = Array.isArray(record?.participants) ? record.participants : [];
  const participants = source.map((participant) => {
    if (typeof participant === "string") {
      return {
        name: clean(participant, 100),
        reservationNumber: clean(record?.reservation_number, 80),
        status: legacyStatus,
        seller: legacySeller,
        notes: clean(record?.notes, 500)
      };
    }
    return {
      name: clean(participant?.name, 100),
      reservationNumber: clean(participant?.reservationNumber, 80),
      status: VALID_PARTICIPANT_STATUSES.has(clean(participant?.status, 20)) ? clean(participant.status, 20) : legacyStatus,
      seller: clean(participant?.seller, 100) || legacySeller,
      notes: clean(participant?.notes, 500)
    };
  }).filter((participant) => participant.name || participant.reservationNumber || participant.notes).slice(0, 5);

  if (!participants.length && record && record.table_type === "exclusive" && (record.reservation_number || record.notes)) {
    participants.push({
      name: "",
      reservationNumber: clean(record.reservation_number, 80),
      status: legacyStatus,
      seller: legacySeller,
      notes: clean(record.notes, 500)
    });
  }
  return participants;
}

function participantCounts(participants, tableType) {
  const paidEntries = participants.filter((participant) => participant.status === "paid").length;
  const blockedEntries = participants.filter((participant) => participant.status === "blocked").length;
  const occupiedSeats = tableType === "exclusive" && participants.length ? 5 : participants.length;
  const paidSeats = tableType === "exclusive" && paidEntries ? 5 : paidEntries;
  return { occupiedSeats, paidSeats, blockedEntries };
}

function deriveTableStatus(participants, tableType) {
  const counts = participantCounts(participants, tableType);
  if (!counts.occupiedSeats) return "available";
  if (counts.paidSeats === 5 && counts.blockedEntries === 0) return "sold";
  return "blocked";
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20000) throw Object.assign(new Error("Requisição muito grande."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("Dados inválidos."), { status: 400 });
  }
}

function isAdmin(profile) {
  return Boolean(profile?.roles?.includes("admin_geral"));
}

function canUseModule(profile) {
  return Boolean(isAdmin(profile) || profile?.roles?.includes("vendedor"));
}

function canEditRecord(record, profile) {
  if (isAdmin(profile) || !record) return true;
  const participants = recordParticipants(record);
  return deriveTableStatus(participants, record.table_type || "exclusive") !== "sold";
}

function publicRecord(number, record, profile) {
  const participants = recordParticipants(record);
  const tableType = record?.table_type || "exclusive";
  const counts = participantCounts(participants, tableType);
  const status = record ? deriveTableStatus(participants, tableType) : "available";
  return {
    number,
    status,
    reservationNumber: record?.reservation_number || "",
    notes: record?.notes || "",
    tableType,
    participants,
    occupiedSeats: counts.occupiedSeats,
    paidSeats: counts.paidSeats,
    availableSeats: Math.max(0, 5 - counts.occupiedSeats),
    ownerName: record?.owner_name || "",
    updatedByName: record?.updated_by_name || "",
    updatedAt: record?.updated_at || null,
    canEdit: canEditRecord(record, profile)
  };
}

async function listTables(db, profile) {
  const result = await db
    .from("reveillon_vip_tables")
    .select("*")
    .order("table_number");
  if (result.error) throw result.error;
  const byNumber = new Map((result.data || []).map((record) => [Number(record.table_number), record]));
  return Array.from({ length: TABLE_COUNT }, (_, index) => publicRecord(index + 1, byNumber.get(index + 1), profile));
}

function conflict(message = "Esta mesa foi alterada por outra pessoa. Atualize o mapa e tente novamente.") {
  return Object.assign(new Error(message), { status: 409, code: "table_conflict" });
}

async function saveAudit(db, current, next, profile) {
  const result = await db.from("reveillon_vip_table_audit").insert({
    table_number: next?.table_number || current?.table_number,
    actor_user_id: profile.id,
    actor_name: profile.name || profile.email || "Usuário",
    action: next ? (current ? "update" : "occupy") : "release",
    before_state: current || null,
    after_state: next || null
  });
  if (result.error) console.error("[reveillon-vip-tables] Não foi possível gravar auditoria:", result.error.message);
}

async function updateTable(db, profile, payload) {
  const tableNumber = Number(payload.tableNumber);
  const tableType = clean(payload.tableType, 20) || "exclusive";
  const participants = cleanParticipants(payload.participants);
  const status = deriveTableStatus(participants, tableType);
  const expectedUpdatedAt = payload.expectedUpdatedAt == null ? null : clean(payload.expectedUpdatedAt, 80);

  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > TABLE_COUNT) {
    throw Object.assign(new Error("Número da mesa inválido."), { status: 400 });
  }
  if (!["shared", "exclusive"].includes(tableType)) {
    throw Object.assign(new Error("Selecione se a mesa é compartilhada ou exclusiva."), { status: 400 });
  }
  if (tableType === "exclusive" && participants.length > 1) {
    throw Object.assign(new Error("A mesa exclusiva deve ter apenas um nome/família."), { status: 400 });
  }
  const incompleteParticipant = participants.find((participant) =>
    !participant.name || !participant.reservationNumber || !VALID_PARTICIPANT_STATUSES.has(participant.status) || !participant.seller
  );
  if (incompleteParticipant) {
    throw Object.assign(new Error("Informe nome/família, reserva, status e vendedor em todos os lugares preenchidos."), { status: 400 });
  }

  const currentResult = await db.from("reveillon_vip_tables").select("*").eq("table_number", tableNumber).maybeSingle();
  if (currentResult.error) throw currentResult.error;
  const current = currentResult.data || null;
  if ((current?.updated_at || null) !== expectedUpdatedAt) throw conflict();

  if (!canEditRecord(current, profile)) {
    const paid = deriveTableStatus(recordParticipants(current), current?.table_type || "exclusive") === "sold";
    throw Object.assign(new Error(paid
      ? "Depois de paga, somente administradores podem alterar esta mesa."
      : "Esta mesa foi bloqueada por outro vendedor. Somente ele ou um administrador pode alterá-la."), {
      status: 403,
      code: paid ? "sold_admin_only" : "blocked_owner_only"
    });
  }

  if (status === "available") {
    if (!current) return publicRecord(tableNumber, null, profile);
    const deleted = await db
      .from("reveillon_vip_tables")
      .delete()
      .eq("table_number", tableNumber)
      .eq("updated_at", current.updated_at)
      .select("table_number");
    if (deleted.error) throw deleted.error;
    if (!deleted.data?.length) throw conflict();
    await saveAudit(db, current, null, profile);
    return publicRecord(tableNumber, null, profile);
  }

  const now = new Date().toISOString();
  const next = {
    table_number: tableNumber,
    status,
    reservation_number: participants[0]?.reservationNumber || null,
    notes: tableType === "exclusive" ? participants[0]?.notes || "" : "",
    table_type: tableType,
    participants,
    owner_user_id: current?.owner_user_id || profile.id,
    owner_name: current?.owner_name || profile.name || profile.email || "Usuário",
    owner_email: current?.owner_email || profile.email || "",
    updated_by_user_id: profile.id,
    updated_by_name: profile.name || profile.email || "Usuário",
    updated_at: now
  };

  let saved;
  if (current) {
    saved = await db
      .from("reveillon_vip_tables")
      .update(next)
      .eq("table_number", tableNumber)
      .eq("updated_at", current.updated_at)
      .select("*")
      .maybeSingle();
  } else {
    saved = await db.from("reveillon_vip_tables").insert(next).select("*").maybeSingle();
  }
  if (saved.error?.code === "23505") throw conflict();
  if (saved.error) throw saved.error;
  if (!saved.data) throw conflict();
  await saveAudit(db, current, saved.data, profile);
  return publicRecord(tableNumber, saved.data, profile);
}

module.exports = async function reveillonVipTables(req, res) {
  try {
    const profile = req.portalProfile;
    if (!canUseModule(profile)) return json(res, 403, { ok: false, error: "seller_or_admin_required", message: "Acesso permitido somente para vendedores e administradores." });
    const db = adminClient();
    if (req.method === "GET") {
      return json(res, 200, { ok: true, isAdmin: isAdmin(profile), tables: await listTables(db, profile) });
    }
    if (req.method === "PATCH") {
      const table = await updateTable(db, profile, await readBody(req));
      return json(res, 200, { ok: true, table, message: `Mesa ${table.number} atualizada com sucesso.` });
    }
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  } catch (error) {
    const schemaMissing = ["42P01", "PGRST205"].includes(error?.code)
      || /(reveillon_vip_tables.*does not exist|could not find.*reveillon_vip_tables)/i.test(error?.message || "");
    const status = schemaMissing ? 503 : Number(error?.status) || (/inválid|Informe|muito grande/i.test(error?.message || "") ? 400 : 500);
    const message = schemaMissing
      ? "O controle de mesas ainda não foi ativado no banco de dados."
      : error?.message || "Não foi possível atualizar as mesas.";
    console.error("[reveillon-vip-tables]", error?.message || error);
    return json(res, status, { ok: false, error: error?.code || (schemaMissing ? "schema_not_ready" : "vip_tables_failed"), message });
  }
};

module.exports._test = { canEditRecord, canUseModule, cleanParticipants, deriveTableStatus, participantCounts, publicRecord };
