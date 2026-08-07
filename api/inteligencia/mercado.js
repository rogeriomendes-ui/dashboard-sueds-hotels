const { handleRequest } = require("../../server");
const { withPortalRoles } = require("../../lib/portal-auth");

module.exports = withPortalRoles(handleRequest, ["admin_geral"]);
