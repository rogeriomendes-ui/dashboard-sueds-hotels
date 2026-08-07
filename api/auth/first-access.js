const { createPortalClient, json } = require("../../lib/portal-auth");

module.exports = async function firstAccess(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
  const email = String(body.email || "").trim();
  const token = String(body.token || "").replace(/\s/g, "");
  const password = String(body.password || "");
  const requestedType = String(body.type || "recovery");
  if (!email || !token || password.length < 8) return json(res, 400, { error: "invalid_request" });
  if (!["recovery", "invite", "signup"].includes(requestedType)) {
    return json(res, 400, { error: "invalid_request" });
  }
  const supabase = createPortalClient(req, res);
  const configuredUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const projectRef = (() => {
    try { return new URL(configuredUrl).hostname.split(".")[0] || "unknown"; } catch { return "unknown"; }
  })();
  if (!supabase) return json(res, 503, { error: "supabase_not_configured", projectRef });

  const { error: verificationError } = await supabase.auth.verifyOtp({
    email,
    token,
    type: requestedType
  });
  if (verificationError) {
    const errorCode = verificationError.code || "invalid_or_expired_code";
    const status = verificationError.status === 429 ? 429 : 401;
    return json(res, status, { error: errorCode, projectRef });
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) return json(res, 400, { error: "password_update_failed" });
  return json(res, 200, { ok: true });
};
