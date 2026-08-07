const { createServerClient } = require("@supabase/ssr");
const cookie = require("cookie");

const PORTAL_SUPABASE_URL = "https://pjcmjytiovuukbkewxjj.supabase.co";
const PORTAL_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6UOE9AD1ZiNgM1KBnuo6RA_b40Y26Gl";
const ALL_ENVIRONMENTS = [
  "painel_gestores",
  "tv_vendedores",
  "mensagens_tv",
  "ranking_vendedores",
  "opinarios_hotel",
  "opinarios_rede",
  "redes_sociais",
  "marketing_competitividade",
  "inspecoes"
];
const OPINION_ROUTES = {
  PLAZA: "/operacional/plaza",
  CABRALIA: "/operacional/cabralia",
  SEGUNDO_SOL: "/operacional/segundo-sol",
  PREMIUM: "/operacional/premium",
  TRANCOSO: "/operacional/trancoso",
  CASAS: "/operacional/casas-arraial"
};

function supabaseConfig() {
  return {
    url: process.env.PORTAL_SUPABASE_URL || PORTAL_SUPABASE_URL,
    key: process.env.PORTAL_SUPABASE_PUBLISHABLE_KEY || PORTAL_SUPABASE_PUBLISHABLE_KEY
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
  const [{ data: profile }, { data: grants }, { data: environmentGrants }, { data: hotelGrants }] = await Promise.all([
    supabase.from("profiles").select("full_name,status").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("roles(slug)").eq("user_id", user.id),
    supabase.from("user_environment_access").select("portal_environments(slug)").eq("user_id", user.id),
    supabase.from("user_hotels").select("hotels(code,name)").eq("user_id", user.id)
  ]);
  if (profile?.status && profile.status !== "active") return null;
  const roles = (grants || []).flatMap((grant) => {
    const value = grant.roles;
    if (!value) return [];
    return [Array.isArray(value) ? value[0]?.slug : value.slug].filter(Boolean);
  });
  const grantedEnvironments = (environmentGrants || []).flatMap((grant) => {
    const value = grant.portal_environments;
    if (!value) return [];
    return [Array.isArray(value) ? value[0]?.slug : value.slug].filter(Boolean);
  });
  const hotels = (hotelGrants || []).flatMap((grant) => {
    const value = grant.hotels;
    const hotel = Array.isArray(value) ? value[0] : value;
    return hotel?.code ? [{ code: hotel.code, name: hotel.name }] : [];
  });
  const environments = roles.includes("admin_geral") ? ALL_ENVIRONMENTS : [...new Set(grantedEnvironments)];
  return {
    id: user.id,
    email: user.email || "",
    name: profile?.full_name || user.email?.split("@")[0] || "Usuário",
    roles,
    environments,
    hotels
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

function withPortalEnvironment(handler, environment) {
  return async function protectedEnvironmentHandler(req, res) {
    const profile = await getPortalProfile(req, res);
    if (!profile) return json(res, 401, { error: "unauthenticated" });
    if (!hasEnvironment(profile, environment)) return json(res, 403, { error: "forbidden", profile });
    req.portalProfile = profile;
    return handler(req, res);
  };
}

function hasEnvironment(profile, slug) {
  return Boolean(profile?.roles?.includes("admin_geral") || profile?.environments?.includes(slug));
}

function buildPortalAccess(profile) {
  const environments = Object.fromEntries(ALL_ENVIRONMENTS.map((slug) => [slug, hasEnvironment(profile, slug)]));
  const hotelRoute = (profile?.hotels || []).map((hotel) => OPINION_ROUTES[hotel.code]).find(Boolean);
  const landingPage = environments.painel_gestores ? "/gestores"
    : environments.inspecoes ? "/inspecoes"
      : environments.ranking_vendedores ? "/dashboard-vendedores.html"
        : environments.opinarios_rede ? "/dashboard-operacional-tv.html"
          : environments.opinarios_hotel && hotelRoute ? hotelRoute
            : environments.redes_sociais ? "/dashboard-redes-sociais.html"
              : environments.marketing_competitividade ? "/dashboard-inteligencia-mercado.html"
                : environments.tv_vendedores ? "/dashboard-tv.html"
                  : "/login?acesso=nao-configurado";
  return { ...environments, gestores: environments.painel_gestores, inspecoes: environments.inspecoes, landingPage };
}

module.exports = { ALL_ENVIRONMENTS, buildPortalAccess, createPortalClient, getPortalProfile, getProfileFromClient, hasEnvironment, json, withPortalEnvironment, withPortalRoles };
