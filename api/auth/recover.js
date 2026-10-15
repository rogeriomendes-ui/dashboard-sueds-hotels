const { json, supabaseConfig } = require("../../lib/portal-auth");

module.exports = async function recover(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10000) return json(res, 413, { error: "request_too_large" });
    chunks.push(chunk);
  }
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
  const email = String(body.email || "").trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(res, 400, { error: "invalid_email" });
  }

  const { url, key } = supabaseConfig();
  if (!url || !key) return json(res, 503, { error: "supabase_not_configured" });
  try {
    const response = await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent("https://portalsueds.com.br/login")}`, {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(10000)
    });
    if (response.status === 429) return json(res, 429, { error: "rate_limited" });
    if (!response.ok) return json(res, 502, { error: "recovery_unavailable" });
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 502, { error: "recovery_unavailable" });
  }
};
