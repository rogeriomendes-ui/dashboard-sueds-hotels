const { getPortalProfile, json } = require("../../lib/portal-auth");

module.exports = async function session(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  const profile = await getPortalProfile(req, res);
  if (!profile) return json(res, 401, { error: "unauthenticated" });
  return json(res, 200, {
    ok: true,
    profile,
    access: {
      gestores: profile.roles.includes("admin_geral"),
      inspecoes: profile.roles.some((role) => ["admin_geral", "gestor_unidade", "inspetor"].includes(role))
    }
  });
};
