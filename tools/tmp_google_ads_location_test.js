const fs = require("fs");
const https = require("https");
const path = require("path");

loadEnvFile(path.join(__dirname, "..", ".env"));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) return;
    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      method: "POST",
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { "content-type": "application/json", ...headers }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  try {
    const tokenResp = await postJson("https://oauth2.googleapis.com/token", {
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token"
    });
    const tokenJson = JSON.parse(tokenResp.body);
    if (!tokenJson.access_token) {
      throw new Error(tokenResp.body.slice(0, 1000));
    }

    const cid = String(process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/\D/g, "");
    const login = String(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/\D/g, "");
    const query = [
      "SELECT",
      "  campaign_criterion.location.geo_target_constant,",
      "  campaign.name,",
      "  metrics.clicks,",
      "  metrics.impressions,",
      "  metrics.cost_micros,",
      "  metrics.conversions,",
      "  metrics.conversions_value",
      "FROM location_view",
      "WHERE segments.date BETWEEN '2026-05-01' AND '2026-05-31'",
      "ORDER BY metrics.cost_micros DESC"
    ].join("\n");

    const res = await postJson(
      `https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION || "v24"}/customers/${cid}/googleAds:searchStream`,
      { query },
      {
        authorization: `Bearer ${tokenJson.access_token}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        "login-customer-id": login
      }
    );
    if (res.status >= 400) {
      throw new Error(res.body.slice(0, 2000));
    }

    const chunks = JSON.parse(res.body);
    const rows = chunks.flatMap((chunk) => chunk.results || []);
    const total = { cost: 0, clicks: 0, conv: 0 };
    const byLocation = new Map();
    for (const row of rows) {
      const location = row.campaignCriterion?.location?.geoTargetConstant || "sem local";
      const spend = Number(row.metrics?.costMicros || 0) / 1000000;
      const clicks = Number(row.metrics?.clicks || 0);
      const conv = Number(row.metrics?.conversions || 0);
      total.cost += spend;
      total.clicks += clicks;
      total.conv += conv;
      const current = byLocation.get(location) || { location, spend: 0, clicks: 0, conv: 0 };
      current.spend += spend;
      current.clicks += clicks;
      current.conv += conv;
      byLocation.set(location, current);
    }
    console.log(JSON.stringify({
      rows: rows.length,
      total,
      top: [...byLocation.values()].sort((a, b) => b.spend - a.spend).slice(0, 8)
    }, null, 2));
  } catch (error) {
    console.error(String(error.message || error).slice(0, 2500));
    process.exit(1);
  }
})();
