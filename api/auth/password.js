const { json } = require("../../lib/portal-auth");

module.exports = async function setPassword(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
  const accessToken = String(body.accessToken || "");
  const password = String(body.password || "");
  if (!accessToken || password.length < 8) return json(res, 400, { error: "invalid_request" });
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  if (!url || !key) return json(res, 503, { error: "supabase_not_configured" });
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: key, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!response.ok) return json(res, response.status === 401 ? 401 : 400, { error: "invalid_or_expired_link" });
  return json(res, 200, { ok: true });
};
