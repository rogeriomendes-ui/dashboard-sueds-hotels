const { handleRequest } = require("../server");
const login = require("./auth/login");
const logout = require("./auth/logout");
const session = require("./auth/session");
const password = require("./auth/password");
const firstAccess = require("./auth/first-access");
const sitePreview = require("./auth/site-preview");
const users = require("./portal/users");
const announcements = require("./portal/announcements");
const reveillonVipTables = require("./portal/reveillon-vip-tables");
const { getPortalProfile, hasEnvironment, withPortalEnvironment, withPortalRoles } = require("../lib/portal-auth");
const knowledge = require("./knowledge");

const adminUsersHandler = withPortalRoles(users, ["admin_geral"]);
const announcementsHandler = withPortalEnvironment(announcements, "comunicados");
const reveillonVipTablesHandler = withPortalEnvironment(reveillonVipTables, "mesas_vip_reveillon");
const gestoresHandler = withPortalEnvironment(handleRequest, "painel_gestores");
const marketingHandler = withPortalEnvironment(handleRequest, "marketing_competitividade");
const biReportsHandler = withPortalEnvironment(handleRequest, "bi_relatorios");
const biKpiReportsHandler = withPortalEnvironment(handleRequest, "bi_relatorios_kpi");
const socialHandler = withPortalEnvironment(handleRequest, "redes_sociais");
const tvMessagesHandler = withPortalEnvironment(handleRequest, "mensagens_tv");

module.exports = async function api(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "portal.suedshotels.com.br"}`);
  const pathname = url.pathname;
  if (pathname === "/api/auth/login") return login(req, res);
  if (pathname === "/api/auth/logout") return logout(req, res);
  if (pathname === "/api/auth/session") return session(req, res);
  if (pathname === "/api/auth/password") return password(req, res);
  if (pathname === "/api/auth/first-access") return firstAccess(req, res);
  if (pathname === "/api/auth/site-preview") return sitePreview(req, res);
  if (pathname === "/api/portal/users") return adminUsersHandler(req, res);
  if (pathname === "/api/portal/announcements") return announcementsHandler(req, res);
  if (pathname === "/api/portal/overdue-payments") {
    if (req.method !== "GET") { res.statusCode = 405; return res.end(); }
    const profile = await getPortalProfile(req, res);
    if (profile?.roles?.includes("vendedor")) req.portalProfile = profile;
    return handleRequest(req, res);
  }
  if (pathname === "/api/portal/mesas-vip-reveillon") return reveillonVipTablesHandler(req, res);
  if (pathname === "/api/knowledge") return knowledge(req, res);
  if (pathname === "/api/dashboard/vendedores" && req.method === "GET") {
    const profile = await getPortalProfile(req, res);
    const canExportVipTickets = url.searchParams.get("action") === "export-tickets" && hasEnvironment(profile, "mesas_vip_reveillon");
    if (hasEnvironment(profile, "ranking_vendedores") || canExportVipTickets) req.portalProfile = profile;
    return handleRequest(req, res);
  }
  if (pathname === "/api/operacional/tv" && ["GET", "PATCH"].includes(req.method)) {
    const profile = await getPortalProfile(req, res);
    if (hasEnvironment(profile, "opinarios_hotel") || hasEnvironment(profile, "opinarios_rede")) req.portalProfile = profile;
    return handleRequest(req, res);
  }
  if (pathname === "/api/dashboard/gestores") return gestoresHandler(req, res);
  if (pathname === "/api/dashboard/bi-relatorios") return biReportsHandler(req, res);
  if (pathname === "/api/dashboard/bi-relatorios-kpi") return biKpiReportsHandler(req, res);
  if (pathname === "/api/inteligencia/mercado") return marketingHandler(req, res);
  if (pathname === "/api/redes-sociais" || pathname.startsWith("/api/redes-sociais/")) return socialHandler(req, res);
  if (pathname === "/api/tv-messages") return tvMessagesHandler(req, res);
  return handleRequest(req, res);
};
