const crypto = require("node:crypto");
const { getPortalProfile, json } = require("../../lib/portal-auth");

const TICKET_AUDIENCE = "sueds-site-preview";
const DEFAULT_PREVIEW_URL = "https://novo-site-sueds.vercel.app";

function signingSecret() {
  return process.env.SITE_PREVIEW_SSO_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || "";
}

function signTicket(profile) {
  const secret = signingSecret();
  if (!secret) return "";
  const payload = Buffer.from(JSON.stringify({
    aud: TICKET_AUDIENCE,
    sub: profile.id,
    email: profile.email,
    roles: ["admin_geral"],
    nonce: crypto.randomBytes(16).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + 60
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyTicket(ticket) {
  const secret = signingSecret();
  if (!secret || typeof ticket !== "string" || ticket.length > 4096) return null;
  const parts = ticket.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  let received;
  try { received = Buffer.from(signature, "base64url"); } catch { return null; }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      decoded.aud !== TICKET_AUDIENCE
      || typeof decoded.sub !== "string"
      || typeof decoded.email !== "string"
      || !Array.isArray(decoded.roles)
      || !decoded.roles.includes("admin_geral")
      || typeof decoded.exp !== "number"
      || decoded.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

module.exports = async function sitePreview(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("referrer-policy", "no-referrer");

  if (req.method === "GET") {
    const profile = await getPortalProfile(req, res);
    if (!profile) {
      res.statusCode = 302;
      res.setHeader("location", "/login?next=%2Fgestores");
      return res.end();
    }
    if (!profile.roles.includes("admin_geral")) return json(res, 403, { error: "forbidden" });
    const ticket = signTicket(profile);
    if (!ticket) return json(res, 503, { error: "preview_sso_not_configured" });
    const previewUrl = new URL(process.env.SITE_PREVIEW_URL || DEFAULT_PREVIEW_URL);
    previewUrl.pathname = "/api/preview/access";
    previewUrl.searchParams.set("ticket", ticket);
    previewUrl.searchParams.set("next", "/");
    res.statusCode = 302;
    res.setHeader("location", previewUrl.toString());
    return res.end();
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const ticket = verifyTicket(body.ticket);
    if (!ticket) return json(res, 401, { error: "invalid_or_expired_ticket" });
    return json(res, 200, {
      ok: true,
      profile: { id: ticket.sub, email: ticket.email, roles: ticket.roles }
    });
  }

  return json(res, 405, { error: "method_not_allowed" });
};
