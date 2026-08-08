const { handleRequest } = require("../../server");
const { withPortalEnvironment } = require("../../lib/portal-auth");

module.exports = withPortalEnvironment(handleRequest, "marketing_competitividade");
