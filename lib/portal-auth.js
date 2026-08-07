const { createServerClient } = require("@supabase/ssr");
const cookie = require("cookie");

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    key: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""
  };
}

function appendCookies(res, items) {
  const current = res.getHeader("Set-Cookie");
  const previous = Array.isArray(current) ? current : current ? [current] : [];
  const next = items.map(({ name, value, options = {} }) => cookie.serialize(name, value, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...options
  }));
  res.setHeader("Set-Cookie", [...previous, ...next]);
}

function createPortalClient(req, res) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return null;
  const parsed = cookie.parse(req.headers.cookie || "");
  return createServerClient(url, key, {
    cookies: {
      getAll: () => Object.entries(parsed).map(([name, value]) => ({ name, value })),
      setAll: (items) => appendCookies(res, items)
    }
  });
}

async function getProfileFromClient(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const [{ data: profile }, { data: grants }] = await Promise.all([
    supabase.from("profiles").select("full_name,status").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("roles(slug)").eq("user_id", user.id)
  ]);
  if (profile?.status && profile.status !== "active") return null;
  const roles = (grants || []).flatMap((grant) => {
    const value = grant.roles;
    if (!value) return [];
    return [Array.isArray(value) ? value[0]?.slug : value.slug].filter(Boolean);
  });
  return {
    id: user.id,
    email: user.email || "",
    name: profile?.full_name || user.email?.split("@")[0] || "Usuário",
    roles
  };
}

async function getPortalProfile(req, res) {
  const supabase = createPortalClient(req, res);
  if (!supabase) return null;
  return getProfileFromClient(supabase);
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function withPortalRoles(handler, allowedRoles) {
  return async function protectedHandler(req, res) {
    const profile = await getPortalProfile(req, res);
    if (!profile) return json(res, 401, { error: "unauthenticated" });
    if (!profile.roles.some((role) => allowedRoles.includes(role))) {
      return json(res, 403, { error: "forbidden", profile });
    }
    req.portalProfile = profile;
    return handler(req, res);
  };
}

module.exports = { createPortalClient, getPortalProfile, getProfileFromClient, json, withPortalRoles };
