const { handleRequest } = require("../server");
const login = require("./auth/login");
const logout = require("./auth/logout");
const session = require("./auth/session");
const password = require("./auth/password");
const firstAccess = require("./auth/first-access");
const users = require("./portal/users");
const { getPortalProfile, hasEnvironment, withPortalEnvironment, withPortalRoles } = require("../lib/portal-auth");

const adminUsersHandler = withPortalRoles(users, ["admin_geral"]);
const gestoresHandler = withPortalEnvironment(handleRequest, "painel_gestores");
const marketingHandler = withPortalEnvironment(handleRequest, "marketing_competitividade");
const socialHandler = withPortalEnvironment(handleRequest, "redes_sociais");
const tvMessagesHandler = withPortalEnvironment(handleRequest, "mensagens_tv");

module.exports = async function api(req, res) {
  const pathname = new URL(req.url, `https://${req.headers.host || "portal.suedshotels.com.br"}`).pathname;
  if (pathname === "/api/auth/login") return login(req, res);
  if (pathname === "/api/auth/logout") return logout(req, res);
  if (pathname === "/api/auth/session") return session(req, res);
  if (pathname === "/api/auth/password") return password(req, res);
  if (pathname === "/api/auth/first-access") return firstAccess(req, res);
  if (pathname === "/api/portal/users") return adminUsersHandler(req, res);
  if (pathname === "/api/dashboard/vendedores" && req.method === "GET") {
    const profile = await getPortalProfile(req, res);
    if (hasEnvironment(profile, "ranking_vendedores")) req.portalProfile = profile;
    return handleRequest(req, res);
  }
  if (pathname === "/api/operacional/tv" && ["GET", "PATCH"].includes(req.method)) {
    const profile = await getPortalProfile(req, res);
    if (hasEnvironment(profile, "opinarios_hotel") || hasEnvironment(profile, "opinarios_rede")) req.portalProfile = profile;
    return handleRequest(req, res);
  }
  if (pathname === "/api/dashboard/gestores") return gestoresHandler(req, res);
  if (pathname === "/api/inteligencia/mercado") return marketingHandler(req, res);
  if (pathname === "/api/redes-sociais" || pathname.startsWith("/api/redes-sociais/")) return socialHandler(req, res);
  if (pathname === "/api/tv-messages") return tvMessagesHandler(req, res);
  return handleRequest(req, res);
};
