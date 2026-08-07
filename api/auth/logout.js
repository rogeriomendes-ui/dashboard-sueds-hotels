const { createPortalClient, json } = require("../../lib/portal-auth");

module.exports = async function logout(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  const supabase = createPortalClient(req, res);
  if (supabase) await supabase.auth.signOut();
  return json(res, 200, { ok: true });
};
