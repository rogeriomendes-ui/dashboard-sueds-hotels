const { handleRequest } = require("../server");
const login = require("./auth/login");
const logout = require("./auth/logout");
const session = require("./auth/session");
const password = require("./auth/password");
const firstAccess = require("./auth/first-access");
const { withPortalRoles } = require("../lib/portal-auth");

const adminHandler = withPortalRoles(handleRequest, ["admin_geral"]);

module.exports = async function api(req, res) {
  const pathname = new URL(req.url, `https://${req.headers.host || "portal.suedshotels.com.br"}`).pathname;
  if (pathname === "/api/auth/login") return login(req, res);
  if (pathname === "/api/auth/logout") return logout(req, res);
  if (pathname === "/api/auth/session") return session(req, res);
  if (pathname === "/api/auth/password") return password(req, res);
  if (pathname === "/api/auth/first-access") return firstAccess(req, res);
  if (
    pathname === "/api/dashboard/gestores" ||
    pathname === "/api/inteligencia/mercado" ||
    pathname === "/api/tv-messages"
  ) {
    return adminHandler(req, res);
  }
  return handleRequest(req, res);
};
