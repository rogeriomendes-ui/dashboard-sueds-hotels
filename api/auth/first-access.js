const { json } = require("../../lib/portal-auth");

module.exports = async function firstAccess(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
  const email = String(body.email || "").trim();
  const token = String(body.token || "").replace(/\s/g, "");
  const password = String(body.password || "");
  if (!email || !token || password.length < 8) return json(res, 400, { error: "invalid_request" });
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  if (!url || !key) return json(res, 503, { error: "supabase_not_configured" });

  let accessToken = "";
  for (const type of ["signup", "invite", "recovery"]) {
    const verification = await fetch(`${url}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ email, token, type })
    });
    if (verification.ok) {
      const payload = await verification.json();
      accessToken = payload.access_token || "";
      break;
    }
  }
  if (!accessToken) return json(res, 401, { error: "invalid_or_expired_code" });
  const updated = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: key, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!updated.ok) return json(res, 400, { error: "password_update_failed" });
  return json(res, 200, { ok: true });
};
