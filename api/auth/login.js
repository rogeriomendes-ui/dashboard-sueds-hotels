const { buildPortalAccess, createPortalClient, getProfileFromClient, json } = require("../../lib/portal-auth");

module.exports = async function login(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  if (!email || !password) return json(res, 400, { error: "missing_credentials" });
  const supabase = createPortalClient(req, res);
  if (!supabase) return json(res, 503, { error: "supabase_not_configured" });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return json(res, 401, { error: "invalid_credentials" });
  const profile = await getProfileFromClient(supabase);
  return json(res, 200, { ok: true, profile, access: buildPortalAccess(profile) });
};
