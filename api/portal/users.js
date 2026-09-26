const { createClient } = require("@supabase/supabase-js");
const { json } = require("../../lib/portal-auth");
const { PORTAL_DEPARTMENTS, validPortalDepartments } = require("../../lib/portal-departments");

const DEFAULT_SUPABASE_URL = "https://pjcmjytiovuukbkewxjj.supabase.co";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function adminClient() {
  const url = process.env.PORTAL_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new Error("A chave secreta do Supabase não está configurada na Vercel.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function relation(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseIds(values, type) {
  if (!Array.isArray(values)) return [];
  if (type === "uuid") return [...new Set(values.map(String).filter((value) => UUID_PATTERN.test(value)))];
  return [...new Set(values.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))];
}

async function catalog(supabase) {
  const biEnvironments = await supabase.from("portal_environments").upsert([
    {
      slug: "bi_relatorios",
      name: "BI - Relatórios",
      description: "Acesso aos relatórios e painéis de inteligência comercial da SUEDS Hotels.",
      sort_order: 46,
      status: "active"
    },
    {
      slug: "bi_relatorios_kpi",
      name: "BI - Relatórios by KPI",
      description: "Acesso aos relatórios comerciais comparativos originados nas bases do KPI Full.",
      sort_order: 47,
      status: "active"
    }
  ], { onConflict: "slug" });
  if (biEnvironments.error) throw biEnvironments.error;

  const [roles, hotels, environments] = await Promise.all([
    supabase.from("roles").select("id,slug,name,description").order("name"),
    supabase.from("hotels").select("id,code,name").eq("status", "active").is("deleted_at", null).order("name"),
    supabase.from("portal_environments").select("id,slug,name,description,sort_order").eq("status", "active").order("sort_order")
  ]);
  const failed = [roles, hotels, environments].find((result) => result.error);
  if (failed) throw failed.error;
  return { roles: roles.data || [], hotels: hotels.data || [], environments: environments.data || [] };
}

async function listUsers(supabase) {
  const [authUsers, profiles, roleGrants, hotelGrants, environmentGrants, accessCatalog] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.from("profiles").select("id,full_name,status").is("deleted_at", null).order("full_name"),
    supabase.from("user_roles").select("user_id,role_id,roles(slug,name)"),
    supabase.from("user_hotels").select("user_id,hotel_id,hotels(code,name)"),
    supabase.from("user_environment_access").select("user_id,environment_id,knowledge_role,portal_environments(slug,name)"),
    catalog(supabase)
  ]);
  if (authUsers.error) throw authUsers.error;
  const failed = [profiles, roleGrants, hotelGrants, environmentGrants].find((result) => result.error);
  if (failed) throw failed.error;
  const authById = new Map((authUsers.data?.users || []).map((user) => [user.id, user]));
  return {
    ...accessCatalog,
    departments: PORTAL_DEPARTMENTS,
    users: (profiles.data || []).map((profile) => ({
      id: profile.id,
      name: profile.full_name,
      email: authById.get(profile.id)?.email || "",
      status: profile.status,
      departments: validPortalDepartments(authById.get(profile.id)?.app_metadata?.departments, { includeGeneral: true }),
      roleIds: (roleGrants.data || []).filter((grant) => grant.user_id === profile.id).map((grant) => Number(grant.role_id)),
      roleNames: (roleGrants.data || []).filter((grant) => grant.user_id === profile.id).map((grant) => relation(grant.roles)?.name).filter(Boolean),
      hotelIds: (hotelGrants.data || []).filter((grant) => grant.user_id === profile.id).map((grant) => grant.hotel_id),
      hotelNames: (hotelGrants.data || []).filter((grant) => grant.user_id === profile.id).map((grant) => relation(grant.hotels)?.name).filter(Boolean),
      environmentIds: (environmentGrants.data || []).filter((grant) => grant.user_id === profile.id).map((grant) => Number(grant.environment_id)),
      environmentNames: (environmentGrants.data || []).filter((grant) => grant.user_id === profile.id).map((grant) => relation(grant.portal_environments)?.name).filter(Boolean)
      ,knowledgeRole: (environmentGrants.data || []).find((grant) => grant.user_id === profile.id && relation(grant.portal_environments)?.slug === "treinamentos")?.knowledge_role || "viewer"
    }))
  };
}

async function replaceAccess(supabase, actorId, userId, payload, options = {}) {
  const name = String(payload.name || "").trim();
  const departments = validPortalDepartments(payload.departments, { includeGeneral: true });
  const roleIds = parseIds(payload.roleIds, "number");
  const hotelIds = parseIds(payload.hotelIds, "uuid");
  let environmentIds = parseIds(payload.environmentIds, "number");
  const knowledgeRole = ["viewer", "editorial", "reviewer", "admin"].includes(payload.knowledgeRole) ? payload.knowledgeRole : "viewer";
  const status = payload.status === "inactive" ? "inactive" : "active";
  if (name.length < 2 || name.length > 120) throw new Error("Informe o nome completo.");
  if (options.requireDepartment && !departments.length) throw new Error("Selecione pelo menos um departamento.");
  if (!roleIds.length) throw new Error("Selecione pelo menos um perfil.");

  const accessCatalog = await catalog(supabase);
  const announcementsEnvironment = accessCatalog.environments.find((item) => item.slug === "comunicados");
  if (announcementsEnvironment) environmentIds = [...new Set([...environmentIds, Number(announcementsEnvironment.id)])];
  if (!environmentIds.length) throw new Error("Selecione pelo menos um ambiente.");
  const validRoles = new Set(accessCatalog.roles.map((item) => Number(item.id)));
  const validHotels = new Set(accessCatalog.hotels.map((item) => item.id));
  const validEnvironments = new Set(accessCatalog.environments.map((item) => Number(item.id)));
  if (roleIds.some((id) => !validRoles.has(id))) throw new Error("Perfil inválido.");
  if (hotelIds.some((id) => !validHotels.has(id))) throw new Error("Hotel inválido.");
  if (environmentIds.some((id) => !validEnvironments.has(id))) throw new Error("Ambiente inválido.");

  const authUserResult = await supabase.auth.admin.getUserById(userId);
  if (authUserResult.error || !authUserResult.data.user) throw authUserResult.error || new Error("Usuário não encontrado.");
  const authUpdate = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { ...(authUserResult.data.user.app_metadata || {}), departments }
  });
  if (authUpdate.error) throw authUpdate.error;

  const profileResult = await supabase.from("profiles").upsert({ id: userId, full_name: name, status }, { onConflict: "id" });
  if (profileResult.error) throw profileResult.error;
  for (const table of ["user_roles", "user_hotels", "user_environment_access"]) {
    const result = await supabase.from(table).delete().eq("user_id", userId);
    if (result.error) throw result.error;
  }
  // Perfis operacionais podem conceder automaticamente o ambiente Inspeções
  // por trigger. Grave os perfis primeiro e faça o restante de forma idempotente
  // para não disputar a mesma chave (usuário + ambiente) em paralelo.
  const roleResult = await supabase.from("user_roles").insert(
    roleIds.map((roleId) => ({ user_id: userId, role_id: roleId, granted_by: actorId }))
  );
  if (roleResult.error) throw roleResult.error;

  if (hotelIds.length) {
    const hotelResult = await supabase.from("user_hotels").insert(
      hotelIds.map((hotelId) => ({ user_id: userId, hotel_id: hotelId, granted_by: actorId }))
    );
    if (hotelResult.error) throw hotelResult.error;
  }

  const environmentResult = await supabase.from("user_environment_access").upsert(
    environmentIds.map((environmentId) => ({ user_id: userId, environment_id: environmentId, granted_by: actorId, knowledge_role: knowledgeRole })),
    { onConflict: "user_id,environment_id", ignoreDuplicates: true }
  );
  if (environmentResult.error) throw environmentResult.error;
  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "update_access",
    entity_type: "profiles",
    entity_id: userId,
    new_data: { role_ids: roleIds, hotel_ids: hotelIds, environment_ids: environmentIds, departments, status }
  });
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 200000) throw new Error("Requisição muito grande.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

module.exports = async function users(req, res) {
  try {
    const supabase = adminClient();
    if (req.method === "GET") return json(res, 200, { ok: true, ...(await listUsers(supabase)) });
    const payload = await body(req);
    if (req.method === "POST") {
      const email = String(payload.email || "").trim().toLowerCase();
      if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new Error("Informe um e-mail válido.");
      if (!validPortalDepartments(payload.departments, { includeGeneral: true }).length) throw new Error("Selecione pelo menos um departamento.");
      const invitation = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { full_name: String(payload.name || "").trim() },
        redirectTo: "https://portalsueds.com.br/login"
      });
      if (invitation.error || !invitation.data.user) {
        if (/already|registered|exists/i.test(invitation.error?.message || "")) throw new Error("Este e-mail já possui cadastro. Pesquise o usuário e edite seus acessos.");
        throw invitation.error || new Error("Não foi possível enviar o convite.");
      }
      try {
        await replaceAccess(supabase, req.portalProfile.id, invitation.data.user.id, payload, { requireDepartment: true });
      } catch (error) {
        await supabase.auth.admin.deleteUser(invitation.data.user.id).catch(() => {});
        throw error;
      }
      return json(res, 201, { ok: true, message: "Convite enviado e acessos configurados." });
    }
    if (req.method === "PATCH") {
      const userId = String(payload.id || "");
      if (!UUID_PATTERN.test(userId)) throw new Error("Usuário inválido.");
      await replaceAccess(supabase, req.portalProfile.id, userId, payload);
      return json(res, 200, { ok: true, message: "Acessos atualizados." });
    }
    return json(res, 405, { error: "method_not_allowed" });
  } catch (error) {
    const rawMessage = typeof error?.message === "string" && error.message
      ? error.message
      : "Não foi possível salvar o usuário.";
    const emailRateLimited = /email rate limit|rate limit.*email|too many.*email/i.test(rawMessage);
    const message = emailRateLimited
      ? "O limite temporário de envio de convites foi atingido. Aguarde alguns minutos e tente novamente."
      : rawMessage;
    console.error("[portal-users]", rawMessage);
    const status = emailRateLimited ? 429 : /Informe|Selecione|inválid|possui cadastro/i.test(message) ? 400 : 500;
    return json(res, status, { ok: false, error: emailRateLimited ? "email_rate_limited" : "user_access_failed", message });
  }
};
