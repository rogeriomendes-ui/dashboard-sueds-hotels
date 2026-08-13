const { createPortalClient, json } = require("../../lib/portal-auth");

const OTP_TYPES = ["invite", "recovery", "signup"];

function verificationTypes(requestedType) {
  return OTP_TYPES.includes(requestedType) ? [requestedType] : OTP_TYPES;
}

async function verifyFirstAccessOtp(supabase, email, token, requestedType) {
  let lastError = null;
  for (const type of verificationTypes(requestedType)) {
    const { error } = await supabase.auth.verifyOtp({ email, token, type });
    if (!error) return { error: null, type };
    lastError = error;
    if (error.status === 429 || error.code === "over_request_rate_limit") break;
  }
  return { error: lastError, type: null };
}

module.exports = async function firstAccess(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
  const email = String(body.email || "").trim();
  const token = String(body.token || "").replace(/\s/g, "");
  const password = String(body.password || "");
  const requestedType = String(body.type || "auto");
  if (!email || !token || password.length < 8) return json(res, 400, { error: "invalid_request" });
  if (requestedType !== "auto" && !OTP_TYPES.includes(requestedType)) {
    return json(res, 400, { error: "invalid_request" });
  }
  const supabase = createPortalClient(req, res);
  if (!supabase) return json(res, 503, { error: "supabase_not_configured" });

  const { error: verificationError } = await verifyFirstAccessOtp(supabase, email, token, requestedType);
  if (verificationError) {
    const errorCode = verificationError.code || "invalid_or_expired_code";
    const status = verificationError.status === 429 ? 429 : 401;
    return json(res, status, { error: errorCode });
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) return json(res, 400, { error: "password_update_failed" });
  return json(res, 200, { ok: true });
};

module.exports.__test = { verificationTypes, verifyFirstAccessOtp };
