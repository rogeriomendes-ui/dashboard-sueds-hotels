const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const SHEET_ID = process.env.GOOGLE_SHEET_ID || "";
const BASE_RANGE = process.env.GOOGLE_BASE_RANGE || "Base_Dashboard!A:Y";
const SALES_RANGE = process.env.GOOGLE_SALES_RANGE || process.env.GOOGLE_LANCAMENTOS_RANGE || "Lancamento_Vendas!A:Y";
const METAS_RANGE = process.env.GOOGLE_METAS_RANGE || "Metas!A:H";
const CARTS_RANGE = process.env.GOOGLE_CARTS_RANGE || "'Recuperação de carrinhos'!A:U";
const ASKSUITE_RANGE = process.env.GOOGLE_ASKSUITE_RANGE || "Asksuite_Atendimentos!A:H";
const ASKSUITE_MARKET_RANGE = process.env.GOOGLE_ASKSUITE_MARKET_RANGE || "Asksuite_Detalhado!A:O";
const OPERATIONAL_SHEET_ID = process.env.GOOGLE_OPERATIONAL_SHEET_ID || "";
const OPINIONS_RANGE = process.env.GOOGLE_OPINIONS_RANGE || "Opinarios!A:AG";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_SECONDS || 60) * 1000;
const TIME_ZONE = "America/Sao_Paulo";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GESTORES_ACCESS_TOKEN = process.env.GESTORES_ACCESS_TOKEN || "";
const GA4_SITE_PROPERTY_ID = process.env.GOOGLE_ANALYTICS_SITE_PROPERTY_ID || process.env.GOOGLE_ANALYTICS_PROPERTY_ID || "";
const GA4_OMNIBEES_PROPERTY_ID = process.env.GOOGLE_ANALYTICS_OMNIBEES_PROPERTY_ID || "";
const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v24";
const GOOGLE_ADS_CUSTOMER_ID = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/\D/g, "");
const GOOGLE_ADS_LOGIN_CUSTOMER_ID = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/\D/g, "");
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
const GOOGLE_ADS_CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID || "";
const GOOGLE_ADS_CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET || "";
const GOOGLE_ADS_REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN || "";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const tokenCache = new Map();
let dataCache = { expiresAt: 0, payload: null };
let analyticsCache = { expiresAt: 0, payload: null };
let operationalCache = { expiresAt: 0, payload: null };
let googleAdsCache = { expiresAt: 0, key: "", payload: null };

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) return;

    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function notFound(res) {
  json(res, 404, { error: "not_found" });
}

function forbidden(res) {
  json(res, 401, { error: "unauthorized" });
}

function getHeader(req, name) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value || "";
}

function hasManagerAccess(req, url) {
  if (!GESTORES_ACCESS_TOKEN) return true;
  const provided = getHeader(req, "x-dashboard-token") || url.searchParams.get("access_token") || "";
  if (!provided) return false;
  const expectedBuffer = Buffer.from(GESTORES_ACCESS_TOKEN);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getServiceAccount() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const file = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8");
    return JSON.parse(file);
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) return null;
  return { client_email: clientEmail, private_key: privateKey };
}

async function getAccessToken(scope = "https://www.googleapis.com/auth/spreadsheets.readonly") {
  const cached = tokenCache.get(scope);
  if (cached?.accessToken && Date.now() < cached.expiresAt - 30000) {
    return cached.accessToken;
  }

  const account = getServiceAccount();
  if (!account) {
    throw new Error("Google credentials are not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: account.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(account.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token request failed: ${response.status} ${text}`);
  }

  const payload = await response.json();
  tokenCache.set(scope, {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000
  });
  return payload.access_token;
}

async function getSheetValues(range, sheetId = SHEET_ID) {
  const token = await getAccessToken("https://www.googleapis.com/auth/spreadsheets.readonly");
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  url.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets request failed: ${response.status} ${text}`);
  }

  const payload = await response.json();
  return payload.values || [];
}

async function getFirstAvailableSheetValues(ranges, sheetId = SHEET_ID) {
  let lastError = null;
  for (const range of ranges.filter(Boolean)) {
    try {
      const rows = await getSheetValues(range, sheetId);
      if (rows.length) return rows;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return [];
}

async function googleAnalyticsRequest(propertyId, method, body) {
  if (!propertyId) throw new Error("Google Analytics property ID is not configured");

  const token = await getAccessToken("https://www.googleapis.com/auth/analytics.readonly");
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Analytics request failed: ${response.status} ${text}`);
  }

  return response.json();
}

function metricValue(row, index = 0) {
  const value = row?.metricValues?.[index]?.value || "0";
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function dimensionValue(row, index = 0) {
  return String(row?.dimensionValues?.[index]?.value || "").trim();
}

async function getRealtimeActiveUsers(propertyId, startMinutesAgo, endMinutesAgo = 0) {
  const payload = await googleAnalyticsRequest(propertyId, "runRealtimeReport", {
    metrics: [{ name: "activeUsers" }],
    minuteRanges: [{ startMinutesAgo, endMinutesAgo }]
  });
  return metricValue(payload.rows?.[0]);
}

async function getRealtimeTopDimension(propertyId, dimensionNames, limit = 4) {
  let lastError = null;
  for (const dimensionName of dimensionNames) {
    try {
      const payload = await googleAnalyticsRequest(propertyId, "runRealtimeReport", {
        dimensions: [{ name: dimensionName }],
        metrics: [{ name: "activeUsers" }],
        limit: String(limit),
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }]
      });
      return (payload.rows || [])
        .map((row) => ({ label: dimensionValue(row), activeUsers: metricValue(row) }))
        .filter((row) => row.label)
        .slice(0, limit);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return [];
}

function shiftDateYear(value, deltaYears) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  const targetYear = year + deltaYears;
  const maxDay = new Date(targetYear, month, 0).getDate();
  return `${targetYear}-${String(month).padStart(2, "0")}-${String(Math.min(day, maxDay)).padStart(2, "0")}`;
}

async function getAnalyticsSummaryForRange(propertyId, startDate, endDate) {
  const payload = await googleAnalyticsRequest(propertyId, "runReport", {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "totalUsers" },
      { name: "activeUsers" },
      { name: "sessions" },
      { name: "screenPageViews" }
    ]
  });
  const row = payload.rows?.[0];
  return {
    startDate,
    endDate,
    totalUsers: metricValue(row, 0),
    activeUsers: metricValue(row, 1),
    sessions: metricValue(row, 2),
    pageViews: metricValue(row, 3)
  };
}

async function getAnalyticsMonthSummary(propertyId, period = {}) {
  const today = period.date || todayKey();
  const month = period.month || today.slice(0, 7);
  const startDate = `${month}-01`;
  const endDate = today.slice(0, 7) === month ? today : `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const previousStartDate = shiftDateYear(startDate, -1);
  const previousEndDate = shiftDateYear(endDate, -1);
  const [current, previousYear] = await Promise.all([
    getAnalyticsSummaryForRange(propertyId, startDate, endDate),
    getAnalyticsSummaryForRange(propertyId, previousStartDate, previousEndDate)
  ]);
  return { ...current, previousYear };
}

async function getAnalyticsTopDimension(propertyId, method, dimensionNames, period = {}, limit = 5) {
  const today = period.date || todayKey();
  const month = period.month || today.slice(0, 7);
  const startDate = `${month}-01`;
  const endDate = today.slice(0, 7) === month ? today : `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  let lastError = null;

  for (const dimensionName of dimensionNames) {
    try {
      const payload = await googleAnalyticsRequest(propertyId, method, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: dimensionName }],
        metrics: [{ name: "activeUsers" }],
        limit: String(limit),
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }]
      });
      return (payload.rows || [])
        .map((row) => ({ label: dimensionValue(row), activeUsers: metricValue(row) }))
        .filter((row) => row.label)
        .slice(0, limit);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

async function getAnalyticsTodayTopDimension(propertyId, dimensionNames, period = {}, limit = 5) {
  const today = period.date || todayKey();
  let lastError = null;

  for (const dimensionName of dimensionNames) {
    try {
      const payload = await googleAnalyticsRequest(propertyId, "runReport", {
        dateRanges: [{ startDate: today, endDate: today }],
        dimensions: [{ name: dimensionName }],
        metrics: [{ name: "activeUsers" }],
        limit: String(limit),
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }]
      });
      return (payload.rows || [])
        .map((row) => ({ label: dimensionValue(row), activeUsers: metricValue(row) }))
        .filter((row) => row.label)
        .slice(0, limit);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

function emptyAnalyticsProperty(label, propertyId = "") {
  return {
    label,
    propertyId,
    configured: false,
    realtime: { activeUsers30m: 0, activeUsers5m: 0, topPages: [], topSources: [] },
    today: { topSources: [] },
    month: { activeUsers: 0, sessions: 0, pageViews: 0, topPages: [], topSources: [] }
  };
}

async function loadAnalyticsPropertyMetrics(propertyId, label, period = {}) {
  if (!propertyId || !getServiceAccount()) {
    return emptyAnalyticsProperty(label, propertyId);
  }

  try {
    const [
      activeUsers30m,
      activeUsers5m,
      realtimeTopPages,
      realtimeTopSources,
      monthSummary,
      monthTopPages,
      monthTopSources,
      todayTopSources
    ] = await Promise.all([
      getRealtimeActiveUsers(propertyId, 29),
      getRealtimeActiveUsers(propertyId, 4),
      getRealtimeTopDimension(propertyId, ["unifiedPageScreen", "pageTitle", "unifiedScreenName"], 4),
      getRealtimeTopDimension(propertyId, ["sourceMedium", "firstUserSourceMedium", "source", "medium"], 5).catch(() => []),
      getAnalyticsMonthSummary(propertyId, period),
      getAnalyticsTopDimension(propertyId, "runReport", ["pageTitle", "unifiedPageScreen"], period, 5),
      getAnalyticsTopDimension(propertyId, "runReport", ["sessionSourceMedium", "firstUserSourceMedium"], period, 5),
      getAnalyticsTodayTopDimension(propertyId, ["sessionSourceMedium", "firstUserSourceMedium"], period, 5).catch(() => [])
    ]);

    return {
      label,
      propertyId,
      configured: true,
      realtime: {
        activeUsers30m,
        activeUsers5m,
        topPages: realtimeTopPages,
        topSources: realtimeTopSources
      },
      today: {
        topSources: todayTopSources.length ? todayTopSources : realtimeTopSources
      },
      month: {
        ...monthSummary,
        topPages: monthTopPages,
        topSources: monthTopSources
      }
    };
  } catch (error) {
    return {
      ...emptyAnalyticsProperty(label, propertyId),
      configured: true,
      error: error.message
    };
  }
}

async function loadAnalyticsMetrics(period = {}) {
  const cacheKey = JSON.stringify({
    siteProperty: GA4_SITE_PROPERTY_ID,
    omnibeesProperty: GA4_OMNIBEES_PROPERTY_ID,
    date: period.date || "",
    month: period.month || ""
  });

  if (analyticsCache.payload?.cacheKey === cacheKey && Date.now() < analyticsCache.expiresAt) {
    return analyticsCache.payload.data;
  }

  const [site, omnibees] = await Promise.all([
    loadAnalyticsPropertyMetrics(GA4_SITE_PROPERTY_ID, "Site institucional", period),
    loadAnalyticsPropertyMetrics(GA4_OMNIBEES_PROPERTY_ID, "Motor Omnibees", period)
  ]);

  const data = {
    configured: Boolean(site.configured || omnibees.configured),
    site,
    omnibees,
    realtime: site.realtime,
    month: site.month
  };
  analyticsCache = { payload: { cacheKey, data }, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

function googleAdsConfigured() {
  return Boolean(
    GOOGLE_ADS_CUSTOMER_ID &&
    GOOGLE_ADS_DEVELOPER_TOKEN &&
    GOOGLE_ADS_CLIENT_ID &&
    GOOGLE_ADS_CLIENT_SECRET &&
    GOOGLE_ADS_REFRESH_TOKEN
  );
}

async function getGoogleAdsOAuthAccessToken() {
  const cacheKey = "google_ads_oauth";
  const cached = tokenCache.get(cacheKey);
  if (cached?.accessToken && Date.now() < cached.expiresAt - 30000) {
    return cached.accessToken;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Ads OAuth failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  tokenCache.set(cacheKey, {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000
  });
  return payload.access_token;
}

async function googleAdsSearchStream(query) {
  const accessToken = await getGoogleAdsOAuthAccessToken();
  const customerId = GOOGLE_ADS_CUSTOMER_ID;
  const response = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
      "login-customer-id": GOOGLE_ADS_LOGIN_CUSTOMER_ID || customerId,
      "content-type": "application/json"
    },
    body: JSON.stringify({ query })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Ads request failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return Array.isArray(payload) ? payload.flatMap((chunk) => chunk.results || []) : [];
}

function googleAdsMetricNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

async function googleAdsGeoTargetNames(resourceNames) {
  const ids = [...new Set((resourceNames || [])
    .map((name) => String(name || "").match(/(\d+)$/)?.[1])
    .filter(Boolean))];
  if (!ids.length) return new Map();

  try {
    const query = `
      SELECT
        geo_target_constant.id,
        geo_target_constant.name,
        geo_target_constant.country_code,
        geo_target_constant.target_type
      FROM geo_target_constant
      WHERE geo_target_constant.id IN (${ids.join(", ")})
    `;
    const rows = await googleAdsSearchStream(query);
    return new Map(rows.map((row) => [
      String(row.geoTargetConstant?.resourceName || `geoTargetConstants/${row.geoTargetConstant?.id || ""}`),
      {
        name: String(row.geoTargetConstant?.name || ""),
        countryCode: String(row.geoTargetConstant?.countryCode || ""),
        targetType: String(row.geoTargetConstant?.targetType || "")
      }
    ]));
  } catch (error) {
    return new Map();
  }
}

async function loadGoogleAdsMetrics(period = {}) {
  const dateRange = period.startDate && period.endDate
    ? { month: period.month || "custom", startDate: period.startDate, endDate: period.endDate }
    : marketDateRangeForMonth(period.month);
  const { month, startDate, endDate } = dateRange;
  const cacheKey = JSON.stringify({ month, startDate, endDate, customerId: GOOGLE_ADS_CUSTOMER_ID, version: GOOGLE_ADS_API_VERSION });
  if (googleAdsCache.key === cacheKey && googleAdsCache.payload && Date.now() < googleAdsCache.expiresAt) {
    return googleAdsCache.payload;
  }

  if (!googleAdsConfigured()) {
    return {
      configured: false,
      source: "demo",
      campaigns: [],
      keywords: [],
      geoCities: [],
      summary: { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 }
    };
  }

  try {
    const campaignQuery = `
      SELECT
        campaign.id,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `;
    const accountSummaryQuery = `
      SELECT
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM customer
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `;
    const keywordQuery = `
      SELECT
        campaign.id,
        campaign.name,
        ad_group.name,
        ad_group_criterion.keyword.text,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM keyword_view
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
        AND campaign.status != 'REMOVED'
        AND ad_group.status != 'REMOVED'
        AND ad_group_criterion.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `;
    const cityQuery = `
      SELECT
        segments.geo_target_city,
        geographic_view.location_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM geographic_view
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      ORDER BY metrics.cost_micros DESC
    `;
    const [results, accountSummaryResults, keywordResults] = await Promise.all([
      googleAdsSearchStream(campaignQuery),
      googleAdsSearchStream(accountSummaryQuery).catch(() => []),
      googleAdsSearchStream(keywordQuery).catch(() => [])
    ]);
    const cityResults = await googleAdsSearchStream(cityQuery).catch(() => []);
    const cityNameMap = await googleAdsGeoTargetNames(cityResults.map((row) => row.segments?.geoTargetCity));
    const campaigns = results.map((row) => {
      const spend = googleAdsMetricNumber(row.metrics?.costMicros) / 1000000;
      const clicks = googleAdsMetricNumber(row.metrics?.clicks);
      const impressions = googleAdsMetricNumber(row.metrics?.impressions);
      const conversions = googleAdsMetricNumber(row.metrics?.conversions);
      const conversionValue = googleAdsMetricNumber(row.metrics?.conversionsValue);
      return {
        id: String(row.campaign?.id || ""),
        label: String(row.campaign?.name || "Campanha sem nome"),
        spend: marketRound(spend, 2),
        clicks,
        impressions,
        conversions: marketRound(conversions, 2),
        conversionValue: marketRound(conversionValue, 2),
        costPerClick: marketRound(marketSafeDiv(spend, clicks), 2),
        costPerConversion: marketRound(marketSafeDiv(spend, conversions), 2),
        roas: marketRound(marketSafeDiv(conversionValue, spend), 2)
      };
    });
    const keywords = keywordResults
      .map((row) => {
        const spend = googleAdsMetricNumber(row.metrics?.costMicros) / 1000000;
        const clicks = googleAdsMetricNumber(row.metrics?.clicks);
        const impressions = googleAdsMetricNumber(row.metrics?.impressions);
        const conversions = googleAdsMetricNumber(row.metrics?.conversions);
        const conversionValue = googleAdsMetricNumber(row.metrics?.conversionsValue);
        return {
          keyword: String(row.adGroupCriterion?.keyword?.text || "Palavra-chave sem nome"),
          campaign: String(row.campaign?.name || "Campanha sem nome"),
          adGroup: String(row.adGroup?.name || "Grupo sem nome"),
          spend: marketRound(spend, 2),
          clicks,
          impressions,
          conversions: marketRound(conversions, 2),
          conversionValue: marketRound(conversionValue, 2),
          costPerClick: marketRound(marketSafeDiv(spend, clicks), 2),
          costPerConversion: marketRound(marketSafeDiv(spend, conversions), 2),
          roas: marketRound(marketSafeDiv(conversionValue, spend), 2)
        };
      })
      .filter((row) => row.spend || row.clicks || row.conversions || row.conversionValue);
    const cityTotals = new Map();
    cityResults.forEach((row) => {
      const cityResource = String(row.segments?.geoTargetCity || "");
      const cityInfo = cityNameMap.get(cityResource);
      const label = cityInfo?.name || "Cidade não informada";
      const key = `${label}|${cityInfo?.countryCode || ""}`;
      const current = cityTotals.get(key) || {
        city: label,
        countryCode: cityInfo?.countryCode || "",
        targetType: cityInfo?.targetType || "",
        locationType: "MATCHED_LOCATION",
        spend: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        conversionValue: 0
      };
      current.spend += googleAdsMetricNumber(row.metrics?.costMicros) / 1000000;
      current.clicks += googleAdsMetricNumber(row.metrics?.clicks);
      current.impressions += googleAdsMetricNumber(row.metrics?.impressions);
      current.conversions += googleAdsMetricNumber(row.metrics?.conversions);
      current.conversionValue += googleAdsMetricNumber(row.metrics?.conversionsValue);
      cityTotals.set(key, current);
    });
    const geoCities = [...cityTotals.values()]
      .map((row) => ({
        ...row,
        spend: marketRound(row.spend, 2),
        conversions: marketRound(row.conversions, 2),
        conversionValue: marketRound(row.conversionValue, 2),
        costPerClick: marketRound(marketSafeDiv(row.spend, row.clicks), 2),
        costPerConversion: marketRound(marketSafeDiv(row.spend, row.conversions), 2),
        roas: marketRound(marketSafeDiv(row.conversionValue, row.spend), 2)
      }))
      .filter((row) => row.spend || row.clicks || row.conversions || row.conversionValue)
      .sort((a, b) => b.spend - a.spend);
    const campaignSummary = {
      spend: campaigns.reduce((total, row) => total + row.spend, 0),
      clicks: campaigns.reduce((total, row) => total + row.clicks, 0),
      impressions: campaigns.reduce((total, row) => total + row.impressions, 0),
      conversions: campaigns.reduce((total, row) => total + row.conversions, 0),
      conversionValue: campaigns.reduce((total, row) => total + row.conversionValue, 0)
    };
    const accountSummary = accountSummaryResults.reduce((total, row) => ({
      spend: total.spend + googleAdsMetricNumber(row.metrics?.costMicros) / 1000000,
      clicks: total.clicks + googleAdsMetricNumber(row.metrics?.clicks),
      impressions: total.impressions + googleAdsMetricNumber(row.metrics?.impressions),
      conversions: total.conversions + googleAdsMetricNumber(row.metrics?.conversions),
      conversionValue: total.conversionValue + googleAdsMetricNumber(row.metrics?.conversionsValue)
    }), { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 });
    const summarySource = accountSummaryResults.length ? accountSummary : campaignSummary;
    const summary = {
      spend: marketRound(summarySource.spend, 2),
      clicks: Math.round(summarySource.clicks),
      impressions: Math.round(summarySource.impressions),
      conversions: marketRound(summarySource.conversions, 2),
      conversionValue: marketRound(summarySource.conversionValue, 2),
      campaignSpend: marketRound(campaignSummary.spend, 2),
      accountSpend: marketRound(accountSummary.spend, 2),
      source: accountSummaryResults.length ? "customer" : "campaign"
    };
    const payload = {
      configured: true,
      source: "google_ads_api",
      apiVersion: GOOGLE_ADS_API_VERSION,
      customerId: GOOGLE_ADS_CUSTOMER_ID,
      period: { month, startDate, endDate },
      campaigns,
      keywords,
      geoCities,
      summary
    };
    googleAdsCache = { key: cacheKey, payload, expiresAt: Date.now() + CACHE_TTL_MS };
    return payload;
  } catch (error) {
    return {
      configured: true,
      source: "error",
      error: error.message,
      campaigns: [],
      keywords: [],
      geoCities: [],
      summary: { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 }
    };
  }
}

function areContiguousMonths(months = []) {
  const ascending = normalizeMarketMonthList(months).sort((a, b) => a.localeCompare(b));
  if (ascending.length <= 1) return true;
  for (let index = 1; index < ascending.length; index += 1) {
    const previous = ascending[index - 1].split("-").map(Number);
    const current = ascending[index].split("-").map(Number);
    const expectedYear = previous[1] === 12 ? previous[0] + 1 : previous[0];
    const expectedMonth = previous[1] === 12 ? 1 : previous[1] + 1;
    if (current[0] !== expectedYear || current[1] !== expectedMonth) return false;
  }
  return true;
}

function combineGoogleAdsRows(rows = [], keyGetter = (row) => row.label || row.keyword || row.city || "") {
  const totals = new Map();
  rows.forEach((row) => {
    const key = keyGetter(row);
    if (!key) return;
    const current = totals.get(key) || { ...row, spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 };
    current.spend += Number(row.spend || 0);
    current.clicks += Number(row.clicks || 0);
    current.impressions += Number(row.impressions || 0);
    current.conversions += Number(row.conversions || 0);
    current.conversionValue += Number(row.conversionValue || 0);
    totals.set(key, current);
  });

  return [...totals.values()]
    .map((row) => ({
      ...row,
      spend: marketRound(row.spend, 2),
      conversions: marketRound(row.conversions, 2),
      conversionValue: marketRound(row.conversionValue, 2),
      costPerClick: marketRound(marketSafeDiv(row.spend, row.clicks), 2),
      costPerConversion: marketRound(marketSafeDiv(row.spend, row.conversions), 2),
      roas: marketRound(marketSafeDiv(row.conversionValue, row.spend), 2)
    }))
    .sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0));
}

async function loadGoogleAdsMetricsForMonths(months = []) {
  const selectedMonths = normalizeMarketMonthList(months);
  if (!selectedMonths.length) return loadGoogleAdsMetrics({});
  if (selectedMonths.length === 1) return loadGoogleAdsMetrics({ month: selectedMonths[0] });

  if (areContiguousMonths(selectedMonths)) {
    const startMonth = [...selectedMonths].sort((a, b) => a.localeCompare(b))[0];
    const endMonth = [...selectedMonths].sort((a, b) => b.localeCompare(a))[0];
    const payload = await loadGoogleAdsMetrics({
      month: selectedMonths.join(","),
      startDate: `${startMonth}-01`,
      endDate: `${endMonth}-${String(daysInMonth(endMonth)).padStart(2, "0")}`
    });
    return {
      ...payload,
      period: {
        ...(payload.period || {}),
        months: selectedMonths,
        startDate: `${startMonth}-01`,
        endDate: `${endMonth}-${String(daysInMonth(endMonth)).padStart(2, "0")}`
      }
    };
  }

  const payloads = await Promise.all(selectedMonths.map((month) => loadGoogleAdsMetrics({ month })));
  const campaigns = combineGoogleAdsRows(payloads.flatMap((payload) => payload.campaigns || []), (row) => row.label);
  const keywords = combineGoogleAdsRows(
    payloads.flatMap((payload) => payload.keywords || []),
    (row) => `${row.keyword || ""}|${row.campaign || ""}|${row.adGroup || ""}`
  );
  const geoCities = combineGoogleAdsRows(
    payloads.flatMap((payload) => payload.geoCities || []),
    (row) => `${row.city || ""}|${row.countryCode || ""}|${row.locationType || ""}`
  );
  const startMonth = [...selectedMonths].sort((a, b) => a.localeCompare(b))[0];
  const endMonth = [...selectedMonths].sort((a, b) => b.localeCompare(a))[0];
  const summary = {
    spend: marketRound(campaigns.reduce((total, row) => total + Number(row.spend || 0), 0), 2),
    clicks: campaigns.reduce((total, row) => total + Number(row.clicks || 0), 0),
    impressions: campaigns.reduce((total, row) => total + Number(row.impressions || 0), 0),
    conversions: marketRound(campaigns.reduce((total, row) => total + Number(row.conversions || 0), 0), 2),
    conversionValue: marketRound(campaigns.reduce((total, row) => total + Number(row.conversionValue || 0), 0), 2)
  };

  return {
    configured: payloads.some((payload) => payload.configured),
    source: payloads.find((payload) => payload.source === "google_ads_api") ? "google_ads_api" : (payloads[0]?.source || "empty"),
    apiVersion: GOOGLE_ADS_API_VERSION,
    customerId: GOOGLE_ADS_CUSTOMER_ID,
    period: {
      months: selectedMonths,
      startDate: `${startMonth}-01`,
      endDate: `${endMonth}-${String(daysInMonth(endMonth)).padStart(2, "0")}`
    },
    campaigns,
    keywords,
    geoCities,
    summary
  };
}

function rowsToObjects(rows, options = {}) {
  const [headers = [], ...body] = rows;
  return body
    .map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        if (header) item[String(header).trim()] = row[index] ?? "";
      });
      return item;
    })
    .filter((item) => {
      if (options.keepAnyValue) {
        return Object.values(item).some((value) => value !== "");
      }
      return item["Data Venda"] || item["Codigo Reserva"] || item["Valor Total"];
    });
}

function rowsToObjectsAny(rows) {
  const [headers = [], ...body] = rows;
  return body
    .map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        if (header) item[String(header).trim()] = row[index] ?? "";
      });
      return item;
    })
    .filter((item) => Object.values(item).some((value) => value !== ""));
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const normalized = String(value).replace(/[R$\s.]/g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function parseDecimalNumber(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const text = String(value).replace(/[R$%\s]/g, "").trim();
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    return new Date(Date.UTC(1899, 11, 30 + value));
  }

  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00-03:00`);

  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return new Date(`${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}T12:00:00-03:00`);

  const brWithoutYear = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (brWithoutYear) {
    const currentYear = todayKey().slice(0, 4);
    return new Date(`${currentYear}-${brWithoutYear[2].padStart(2, "0")}-${brWithoutYear[1].padStart(2, "0")}T12:00:00-03:00`);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateRange(value) {
  const text = String(value || "").trim();
  const parts = text.split(/\s+a\s+/i);
  const start = parseDate(parts[0]);
  const end = parts.length > 1 ? parseDate(parts[1]) : null;
  return {
    start,
    end,
    isRange: Boolean(start && end)
  };
}

function normalizeTextKey(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeHotelName(value) {
  const raw = String(value || "").trim();
  const key = normalizeTextKey(raw);
  if (!key) return "";

  const map = [
    ["segundo sol", "SUEDS SEGUNDO SOL"],
    ["cabralia", "SUEDS CABRALIA"],
    ["plaza", "SUEDS PLAZA"],
    ["premium", "SUEDS PREMIUM"],
    ["trancoso", "SUEDS TRANCOSO"],
    ["casas", "CASAS SUEDS ARRAIAL"],
    ["arraial", "CASAS SUEDS ARRAIAL"]
  ];
  const match = map.find(([needle]) => key.includes(needle));
  return match ? match[1] : raw;
}

function dateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function monthKey(date) {
  return dateKey(date).slice(0, 7);
}

function todayKey() {
  return dateKey(new Date());
}

function normalizeRecord(item) {
  const saleDate = parseDate(item["Data Venda"]);
  const total = parseNumber(item["Valor Total"]);
  const received = parseNumber(item["Recebido"]);
  const remaining = parseNumber(item["A Receber"]);

  return {
    date: saleDate,
    dateKey: saleDate ? dateKey(saleDate) : "",
    monthKey: saleDate ? monthKey(saleDate) : "",
    reservationCode: String(item["Codigo Reserva"] || "").trim(),
    hotel: normalizeHotelName(item["Hotel Normalizado"] || item["Hotel"] || ""),
    channel: String(item["Canal Detalhado"] || item["Canal"] || "").trim(),
    rawChannel: String(item["Canal"] || "").trim(),
    seller: normalizeSellerName(item["Vendedor"] || ""),
    customer: String(item["Cliente"] || "").trim(),
    status: String(item["Status"] || "").trim() || "Confirmada",
    total,
    received,
    remaining,
    source: String(item["Fonte"] || "").trim()
  };
}

function normalizeSellerName(value) {
  const raw = String(value || "").trim();
  const key = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const map = {
    "SITE": "Site",
    "ALINE NUNES": "Aline Nunes",
    "AMANDA MELGACO": "Amanda Melgaco",
    "JULIA RECHE": "Julia Reche",
    "EMANOEL CESAR": "Emanoel Cesar",
    "BETE GERENTE": "Equipe Sueds",
    "EQUIPE SUEDS": "Equipe Sueds",
    "OPERADORAS": "Operadoras",
    "OTAS": "OTAs",
    "ROBO": "Robo"
  };
  if (key.includes("ALINE NUNES")) return "Aline Nunes";
  if (key.includes("AMANDA MELGACO")) return "Amanda Melgaco";
  if (key.includes("JULIA RECHE")) return "Julia Reche";
  if (key.includes("EMANOEL CESAR")) return "Emanoel Cesar";
  return map[key] || raw;
}

function normalizeGoal(item) {
  return {
    month: String(item.Mes || "").trim(),
    date: String(item.Data || item.Dia || "").trim(),
    type: String(item["Tipo Meta"] || "").trim(),
    hotel: normalizeHotelName(item.Hotel || ""),
    channel: String(item.Canal || "").trim(),
    seller: normalizeSellerName(item.Responsavel || item.Vendedor || ""),
    revenueGoal: parseNumber(item["Meta Receita"]),
    reservationGoal: parseNumber(item["Meta Reservas"])
  };
}

function isMeaningfulValue(value) {
  const text = String(value || "").trim();
  return text && comparableKey(text) !== "selecione";
}

function normalizeCartRecord(item) {
  const abandonedAt = parseDate(item["Abandono (Data e Hora)"]);
  const responsible = normalizeSellerName(item["Responsável"] || "");
  const status = String(item.STATUS || "").trim();
  const lossReason = String(item["MOTIVO DA PERDA"] || "").trim();
  const alternateChoice = String(item["SE COMPROU OUTRO HOTEL OU DESTINO, QUAL?"] || "").trim();
  const contactValues = [responsible, status, lossReason, alternateChoice];

  return {
    date: abandonedAt,
    dateKey: abandonedAt ? dateKey(abandonedAt) : "",
    monthKey: abandonedAt ? monthKey(abandonedAt) : "",
    hotel: String(item.Hotel || "").trim(),
    customer: String(item.Cliente || "").trim(),
    value: parseNumber(item["Valor total (Com taxas)"]),
    responsible,
    status,
    lossReason,
    alternateChoice,
    contacted: contactValues.some(isMeaningfulValue)
  };
}

function normalizeAsksuiteRecord(item) {
  const parsedRange = parseDateRange(item.Data);
  const parsedDate = parsedRange.start || parseDate(item.Data);
  const parsedEndDate = parsedRange.end;
  const parsedMonth = parsedDate ? monthKey(parsedDate) : "";
  const parsedEndMonth = parsedEndDate ? monthKey(parsedEndDate) : "";
  return {
    date: parsedDate,
    dateKey: parsedDate ? dateKey(parsedDate) : "",
    endDate: parsedEndDate,
    endDateKey: parsedEndDate ? dateKey(parsedEndDate) : "",
    monthKey: parsedMonth,
    isMonthlyTotal: Boolean(parsedRange.isRange && parsedMonth && parsedMonth === parsedEndMonth),
    seller: normalizeSellerName(item.Atendente || ""),
    attendances: parseDecimalNumber(item.Atendimentos),
    chatConvPct: parseDecimalNumber(item["Conv Atendimento %"]),
    opportunities: parseDecimalNumber(item.Oportunidades),
    salesConvPct: parseDecimalNumber(item["Conv Vendas %"]),
    sales: parseDecimalNumber(item.Vendas),
    revenue: parseDecimalNumber(item.Receita)
  };
}

function dedupeAsksuiteRecords(rows) {
  const byKey = new Map();
  rows.forEach((row) => {
    const periodKey = row.isMonthlyTotal ? `${row.monthKey}|mensal` : `${row.dateKey}|diario`;
    const key = `${periodKey}|${comparableKey(row.seller)}`;
    if (!row.dateKey || !row.seller) return;
    byKey.set(key, row);
  });
  return [...byKey.values()];
}

function sum(records, getter) {
  return records.reduce((total, record) => total + getter(record), 0);
}

function groupBy(records, keyGetter) {
  const map = new Map();
  records.forEach((record) => {
    const key = keyGetter(record) || "Nao informado";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  });
  return map;
}

function pct(value, target) {
  if (!target) return null;
  return Math.round((value / target) * 1000) / 10;
}

function comparableKey(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sellerGoal(goals, seller, period, key) {
  const candidates = goals.filter((goal) => comparableKey(goal.seller) === comparableKey(seller));
  const exact = candidates.find((goal) => goal.date === key);
  if (exact) return exact;
  return candidates.find((goal) => goal.month === period) || null;
}

function dimensionGoal(goals, field, label, period) {
  const key = comparableKey(label);
  return goals.find((goal) => goal.month === period && comparableKey(goal[field]) === key) || null;
}

function monthsFromYearStart(dateKey) {
  const [year, monthNumber] = String(dateKey || todayKey()).split("-").map(Number);
  if (!year || !monthNumber) return [];
  return Array.from({ length: monthNumber }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function ytdGoal(goals, matcher, months) {
  const revenueGoal = sum(
    goals.filter((goal) => months.includes(goal.month) && matcher(goal)),
    (goal) => goal.revenueGoal
  );
  return revenueGoal ? { revenueGoal } : null;
}

function sortLabels(labels) {
  return [...labels].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function topCounts(records, getter, limit = 3) {
  return [...groupBy(records, getter).entries()]
    .filter(([label]) => isMeaningfulValue(label))
    .map(([label, rows]) => ({ label, count: rows.length }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"))
    .slice(0, limit);
}

function daysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return 30;
  return new Date(year, monthNumber, 0).getDate();
}

function businessDaysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return 26;
  const totalDays = daysInMonth(month);
  let businessDays = 0;
  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(Date.UTC(year, monthNumber - 1, day, 12));
    if (date.getUTCDay() !== 0) businessDays += 1;
  }
  return businessDays || totalDays;
}

function businessDaysElapsed(month, key) {
  const [year, monthNumber] = month.split("-").map(Number);
  const selectedDay = Number(String(key || "").slice(8, 10));
  if (!year || !monthNumber || !selectedDay) return businessDaysInMonth(month);
  const limit = Math.min(selectedDay, daysInMonth(month));
  let businessDays = 0;
  for (let day = 1; day <= limit; day += 1) {
    const date = new Date(Date.UTC(year, monthNumber - 1, day, 12));
    if (date.getUTCDay() !== 0) businessDays += 1;
  }
  return businessDays;
}

function isOnOrBeforeDateKey(record, key) {
  return record.dateKey && key && record.dateKey <= key;
}

const TEAM_CARD_NAME = "Equipe Sueds";
const TEAM_CARD_DISPLAY_NAME = "EQUIPE SUEDS";
const TEAM_SELLERS = ["Aline Nunes", "Amanda Melgaco", "Julia Reche", "Emanoel Cesar"];
const STRATEGIC_CHANNEL_SELLERS = ["Site", "Operadoras", "OTAs", "Robo"];
const OFFICIAL_SALES_CHANNELS = [
  "SITE",
  "CENTRAL DE RESERVAS",
  "INDIVIDUAL",
  "BALCÃO",
  "GRUPOS",
  "RECEPÇÃO"
];

function isTeamCardName(value) {
  return comparableKey(value) === comparableKey(TEAM_CARD_NAME);
}

function sellerRankingSort(a, b) {
  const aIsTeam = isTeamCardName(a.name);
  const bIsTeam = isTeamCardName(b.name);
  if (aIsTeam !== bIsTeam) return aIsTeam ? -1 : 1;
  return b.salesMonth - a.salesMonth;
}

function displaySellerName(value) {
  return isTeamCardName(value) ? TEAM_CARD_DISPLAY_NAME : value;
}

function normalizeOfficialSalesChannel(value, record = {}, month = "") {
  const useHistoricalChannel = month === "2026-05" || month === "2026-06";
  const sourceValue = useHistoricalChannel
    ? (record.rawChannel || value || record.channel)
    : (value || record.channel || record.rawChannel);
  const key = comparableKey(sourceValue);
  if (!key || key === "selecione") return "";

  if (useHistoricalChannel) {
    if (key.includes("booking engine") || key.includes("book engine") || key.includes("be mobile") || key === "site") return "SITE";
    if (key.includes("central de reservas")) return "CENTRAL DE RESERVAS";
    if (key.includes("particular") || key.includes("individual")) return "INDIVIDUAL";
    if (key.includes("balcao")) return "BALCÃO";
    if (key.includes("agencia") || key.includes("grupos")) return "GRUPOS";
    if (key.includes("recepcao")) return "RECEPÇÃO";
    return "";
  }

  if (comparableKey(record.seller) === comparableKey("Site")) return "SITE";
  if (key.includes("booking engine") || key === "site") return "SITE";
  if (key.includes("central de reservas") || key.includes("whatsapp")) return "CENTRAL DE RESERVAS";
  if (key.includes("particular") || key.includes("individual")) return "INDIVIDUAL";
  if (key.includes("balcao")) return "BALCÃO";
  if (key.includes("agencia") || key.includes("grupos")) return "GRUPOS";
  if (key.includes("recepcao")) return "RECEPÇÃO";
  return "";
}

function buildCartRecoveryMetrics(carts, period = {}) {
  const today = period.date || todayKey();
  const month = period.month || today.slice(0, 7);
  const monthCarts = carts.filter((cart) => cart.monthKey === month);

  function metricsForSeller(seller) {
    const sellerCarts = monthCarts.filter((cart) => comparableKey(cart.responsible) === comparableKey(seller));
    return metricsFromCarts(seller, sellerCarts);
  }

  function metricsFromCarts(name, sellerCarts) {
    const contacted = sellerCarts.filter((cart) => cart.contacted);
    const recovered = contacted.filter((cart) => comparableKey(cart.status).includes("recuperado") && !comparableKey(cart.status).includes("nao recuperado"));
    const lost = contacted.filter((cart) => comparableKey(cart.status).includes("nao recuperado"));

    return {
      name,
      contacted: contacted.length,
      recovered: recovered.length,
      lost: lost.length,
      pending: Math.max(0, contacted.length - recovered.length - lost.length),
      recoveryPct: pct(recovered.length, contacted.length),
      statusBreakdown: topCounts(contacted, (cart) => cart.status, 4),
      lossReasons: topCounts(lost, (cart) => cart.lossReason, 3)
    };
  }

  const teamMetrics = TV_SELLER_ORDER
    .filter((seller) => TEAM_SELLERS.includes(seller))
    .map(metricsForSeller);
  const teamCarts = monthCarts.filter((cart) => TEAM_SELLERS.some((seller) => comparableKey(cart.responsible) === comparableKey(seller)));

  return [
    ...teamMetrics,
    metricsFromCarts(TEAM_CARD_NAME, teamCarts)
  ];
}

function buildAsksuiteMetrics(asksuite, period = {}) {
  const today = period.date || todayKey();
  const month = period.month || today.slice(0, 7);
  const monthRows = asksuite.filter((row) => row.monthKey === month);

  function rowsForSellerPeriod(seller) {
    const rows = monthRows.filter((row) => comparableKey(row.seller) === comparableKey(seller));
    if (rows.length <= 1) return rows;

    const monthlyTotals = rows
      .filter((row) => row.isMonthlyTotal)
      .sort((a, b) => {
        const scoreA = a.attendances + a.opportunities + a.sales + a.revenue;
        const scoreB = b.attendances + b.opportunities + b.sales + b.revenue;
        return scoreB - scoreA;
      });
    if (monthlyTotals.length) return [monthlyTotals[0]];

    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
    const maxDate = rows.reduce((latest, row) => row.dateKey > latest ? row.dateKey : latest, "");
    const candidates = rows
      .filter((row) => {
        const hasMeaningfulTotal = row.attendances >= 20 || row.opportunities >= 10 || row.sales > 0 || row.revenue > 0;
        const isMonthClosingRow = row.dateKey === monthEnd || (row.dateKey === maxDate && Number(row.dateKey.slice(8, 10)) >= 28);
        return hasMeaningfulTotal && isMonthClosingRow;
      })
      .sort((a, b) => {
        const scoreA = a.attendances + a.opportunities + a.sales + a.revenue;
        const scoreB = b.attendances + b.opportunities + b.sales + b.revenue;
        return scoreB - scoreA;
      });

    return candidates.length ? [candidates[0]] : rows;
  }

  function metricsFromRows(name, rows) {
    const attendances = sum(rows, (row) => row.attendances);
    const opportunities = sum(rows, (row) => row.opportunities);
    const sales = sum(rows, (row) => row.sales);
    const revenue = sum(rows, (row) => row.revenue);

    return {
      name,
      attendances,
      opportunities,
      sales,
      revenue,
      chatConvPct: pct(opportunities, attendances),
      salesConvPct: pct(sales, opportunities)
    };
  }

  const sellerMetrics = TEAM_SELLERS.map((seller) => {
    const rows = rowsForSellerPeriod(seller);
    return metricsFromRows(seller, rows);
  });
  const teamRows = TEAM_SELLERS.flatMap((seller) => rowsForSellerPeriod(seller));

  return [
    ...sellerMetrics,
    metricsFromRows(TEAM_CARD_NAME, teamRows)
  ];
}

function buildMetrics(records, goals, period = {}) {
  const today = period.date || todayKey();
  const requestedMonth = period.month || today.slice(0, 7);
  const isYearToDate = requestedMonth === "ytd";
  const month = requestedMonth;
  const activeMonth = isYearToDate ? today.slice(0, 7) : month;
  const ytdStart = `${today.slice(0, 4)}-01-01`;
  const ytdMonths = isYearToDate ? monthsFromYearStart(today) : [month];
  const selectedDay = period.day || "";
  const goalDate = selectedDay || today;
  const selectedHotel = period.hotel || "";
  const selectedChannel = period.channel || "";
  const channelLabelForRecord = (record) => normalizeOfficialSalesChannel(record.channel, record, record.monthKey || activeMonth);
  const confirmed = records.filter((record) => record.status.toLowerCase() === "confirmada");
  const rawMonthRecords = confirmed.filter((record) => {
    if (isYearToDate) return record.dateKey >= ytdStart && record.dateKey <= today;
    return record.monthKey === month;
  });
  const hasHistoricalMayBase = rawMonthRecords.some((record) => record.monthKey === "2026-05" && comparableKey(record.source).includes("historico"));
  const monthRecords = hasHistoricalMayBase
    ? rawMonthRecords.filter((record) => record.monthKey !== "2026-05" || comparableKey(record.source).includes("historico"))
    : rawMonthRecords;
  const filteredRecords = monthRecords.filter((record) => {
    const matchesDay = !selectedDay || record.dateKey === selectedDay;
    const matchesHotel = !selectedHotel || comparableKey(record.hotel) === comparableKey(selectedHotel);
    const matchesChannel = !selectedChannel || comparableKey(channelLabelForRecord(record)) === comparableKey(selectedChannel);
    return matchesDay && matchesHotel && matchesChannel;
  });
  const todayRecords = filteredRecords.filter((record) => record.dateKey === today);
  const selectedDayRecords = selectedDay ? filteredRecords : todayRecords;
  const monthToDateRecords = filteredRecords.filter((record) => isOnOrBeforeDateKey(record, goalDate));
  const workdaysInMonth = isYearToDate ? businessDaysElapsed(activeMonth, goalDate) : businessDaysInMonth(month);
  const workdaysElapsed = isYearToDate ? workdaysInMonth : businessDaysElapsed(month, goalDate);

  const sellerNames = new Set([
    ...filteredRecords.map((record) => record.seller).filter(Boolean),
    ...goals.filter((goal) => ytdMonths.includes(goal.month) || goal.date === goalDate).map((goal) => goal.seller).filter(Boolean)
  ]);

  const recordsBySeller = groupBy(filteredRecords, (record) => record.seller);
  let sellers = [...sellerNames]
    .map((seller) => {
      const sellerRecords = recordsBySeller.get(seller) || [];
      const dayRecords = selectedDay ? sellerRecords : sellerRecords.filter((record) => record.dateKey === today);
      const mtdRecords = sellerRecords.filter((record) => isOnOrBeforeDateKey(record, goalDate));
      const goal = isYearToDate
        ? ytdGoal(goals, (item) => comparableKey(item.seller) === comparableKey(seller), ytdMonths)
        : sellerGoal(goals, seller, month, goalDate);
      const dayRevenue = sum(dayRecords, (record) => record.total);
      const mtdRevenue = sum(mtdRecords, (record) => record.total);
      const monthRevenue = mtdRevenue;
      const monthlyGoal = goal?.revenueGoal || 0;
      const dailyGoal = monthlyGoal ? monthlyGoal / workdaysInMonth : 0;
      const mtdGoal = dailyGoal * workdaysElapsed;

      return {
        name: seller,
        salesToday: dayRevenue,
        salesMtd: mtdRevenue,
        salesMonth: monthRevenue,
        reservationsToday: dayRecords.length,
        reservationsMtd: mtdRecords.length,
        reservationsMonth: sellerRecords.length,
        dailyGoal,
        mtdGoal,
        monthlyGoal,
        dailyGoalPct: pct(dayRevenue, dailyGoal),
        mtdGoalPct: pct(mtdRevenue, mtdGoal),
        monthlyGoalPct: pct(monthRevenue, monthlyGoal)
      };
    })
    .sort(sellerRankingSort);

  const teamCard = sellers.find((seller) => seller.name === TEAM_CARD_NAME);
  if (teamCard) {
    const teamSellers = sellers.filter((seller) => TEAM_SELLERS.includes(seller.name));
    const teamSalesToday = sum(teamSellers, (seller) => seller.salesToday);
    const teamSalesMtd = sum(teamSellers, (seller) => seller.salesMtd);
    const teamSalesMonth = sum(teamSellers, (seller) => seller.salesMonth);
    const teamReservationsToday = sum(teamSellers, (seller) => seller.reservationsToday);
    const teamReservationsMtd = sum(teamSellers, (seller) => seller.reservationsMtd);
    const teamReservationsMonth = sum(teamSellers, (seller) => seller.reservationsMonth);
    teamCard.salesToday = teamSalesToday;
    teamCard.salesMtd = teamSalesMtd;
    teamCard.salesMonth = teamSalesMonth;
    teamCard.reservationsToday = teamReservationsToday;
    teamCard.reservationsMtd = teamReservationsMtd;
    teamCard.reservationsMonth = teamReservationsMonth;
    teamCard.dailyGoalPct = pct(teamSalesToday, teamCard.dailyGoal);
    teamCard.mtdGoalPct = pct(teamSalesMtd, teamCard.mtdGoal);
    teamCard.monthlyGoalPct = pct(teamSalesMonth, teamCard.monthlyGoal);
  }

  sellers = sellers.sort(sellerRankingSort).map((seller) => ({
    ...seller,
    name: displaySellerName(seller.name)
  }));

  const channelLabels = new Set([
    ...OFFICIAL_SALES_CHANNELS,
    ...goals
      .filter((goal) => ytdMonths.includes(goal.month) && goal.channel)
      .map((goal) => normalizeOfficialSalesChannel(goal.channel, {}, goal.month || activeMonth))
      .filter(Boolean)
  ]);

  const recordsByChannel = groupBy(filteredRecords, channelLabelForRecord);
  const channels = [...channelLabels]
    .map((label) => {
      const rows = recordsByChannel.get(label) || [];
      const goal = isYearToDate
        ? ytdGoal(goals, (item) => comparableKey(normalizeOfficialSalesChannel(item.channel, {}, item.month || activeMonth)) === comparableKey(label), ytdMonths)
        : goals.find((item) => item.month === month && comparableKey(normalizeOfficialSalesChannel(item.channel, {}, month)) === comparableKey(label));
      const value = sum(rows, (record) => record.total);
      const monthlyGoal = goal?.revenueGoal || 0;
      return {
        label,
        value,
        reservations: rows.length,
        monthlyGoal,
        monthlyGoalPct: pct(value, monthlyGoal)
      };
    })
    .sort((a, b) => OFFICIAL_SALES_CHANNELS.indexOf(a.label) - OFFICIAL_SALES_CHANNELS.indexOf(b.label));

  const hotelLabels = new Set([
    ...filteredRecords.map((record) => record.hotel).filter(Boolean),
    ...goals.filter((goal) => ytdMonths.includes(goal.month) && goal.hotel).map((goal) => goal.hotel)
  ]);

  const recordsByHotel = groupBy(filteredRecords, (record) => record.hotel);
  const hotels = [...hotelLabels]
    .map((label) => {
      const rows = recordsByHotel.get(label) || [];
      const goal = isYearToDate
        ? ytdGoal(goals, (item) => comparableKey(item.hotel) === comparableKey(label), ytdMonths)
        : dimensionGoal(goals, "hotel", label, month);
      const value = sum(rows, (record) => record.total);
      const monthlyGoal = goal?.revenueGoal || 0;
      return {
        label,
        value,
        reservations: rows.length,
        monthlyGoal,
        monthlyGoalPct: pct(value, monthlyGoal)
      };
    })
    .sort((a, b) => b.value - a.value);

  const dailySales = [...groupBy(filteredRecords, (record) => record.dateKey).entries()]
    .map(([date, rows]) => ({
      date,
      sales: sum(rows, (record) => record.total),
      received: sum(rows, (record) => record.received),
      remaining: sum(rows, (record) => record.remaining),
      reservations: rows.length
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    generatedAt: new Date().toISOString(),
    period: { today, month, day: selectedDay, hotel: selectedHotel, channel: selectedChannel },
    filters: {
      selectedDay,
      selectedHotel,
      selectedChannel,
      days: sortLabels(new Set(monthRecords.map((record) => record.dateKey))),
      hotels: sortLabels(new Set(monthRecords.map((record) => record.hotel))),
      channels: OFFICIAL_SALES_CHANNELS
    },
    summary: {
      salesToday: sum(selectedDayRecords, (record) => record.total),
      salesMtd: sum(monthToDateRecords, (record) => record.total),
      salesMonth: sum(filteredRecords, (record) => record.total),
      receivedMonth: sum(filteredRecords, (record) => record.received),
      remainingMonth: sum(filteredRecords, (record) => record.remaining),
      reservationsToday: selectedDayRecords.length,
      reservationsMonth: filteredRecords.length,
      ticketAverageMonth: filteredRecords.length ? sum(filteredRecords, (record) => record.total) / filteredRecords.length : 0
    },
    sellers,
    channels,
    hotels,
    dailySales
  };
}

function buildManagerPayload(metrics) {
  return {
    audience: "gestores",
    generatedAt: metrics.generatedAt,
    period: metrics.period,
    summary: metrics.summary,
    filters: metrics.filters,
    sellers: metrics.sellers,
    strategicChannels: metrics.sellers.filter((seller) => STRATEGIC_CHANNEL_SELLERS.includes(seller.name)),
    channels: metrics.channels,
    hotels: metrics.hotels,
    dailySales: metrics.dailySales,
    analytics: metrics.analytics || null
  };
}

function statusFromPct(value) {
  if (value === null) return "sem_meta";
  if (value >= 100) return "meta_batida";
  if (value >= 80) return "em_ritmo";
  return "abaixo";
}

const TV_SELLER_ORDER = [
  TEAM_CARD_NAME,
  "Aline Nunes",
  "Emanoel Cesar",
  "Julia Reche",
  "Amanda Melgaco",
  "Site",
  "Operadoras",
  "OTAs",
  "Robo"
];

function tvOrder(name) {
  const index = TV_SELLER_ORDER.findIndex((item) => comparableKey(item) === comparableKey(name));
  return index === -1 ? TV_SELLER_ORDER.length : index;
}

function buildTvPayload(metrics) {
  return {
    audience: "tv-vendas",
    generatedAt: metrics.generatedAt,
    period: metrics.period,
    sellers: [...metrics.sellers]
      .filter((seller) => !STRATEGIC_CHANNEL_SELLERS.includes(seller.name))
      .sort((a, b) => tvOrder(a.name) - tvOrder(b.name))
      .map((seller) => ({
        name: seller.name,
        reservationsToday: seller.reservationsToday,
        reservationsMtd: seller.reservationsMtd,
        reservationsMonth: seller.reservationsMonth,
        dailyGoalPct: seller.dailyGoalPct,
        mtdGoalPct: seller.mtdGoalPct,
        monthlyGoalPct: seller.monthlyGoalPct,
        dailyStatus: statusFromPct(seller.dailyGoalPct),
        mtdStatus: statusFromPct(seller.mtdGoalPct),
        monthlyStatus: statusFromPct(seller.monthlyGoalPct)
      })),
    cartRecovery: metrics.cartRecovery || [],
    asksuite: metrics.asksuite || [],
    analytics: metrics.analytics || null
  };
}

const OPERATIONAL_RATING_FIELDS = [
  { key: "generalImpression", header: "Impressao Geral", block: "Geral" },
  { key: "apartmentLevel", header: "Nivel Apartamentos", block: "Geral" },
  { key: "foodBreakfast", header: "Alimentos Cafe da Manha", block: "Alimentos" },
  { key: "foodPoolBar", header: "Alimentos Bar da Piscina", block: "Alimentos" },
  { key: "foodDinner", header: "Alimentos Jantar", block: "Alimentos" },
  { key: "serviceBreakfast", header: "Atendimento Cafe da Manha", block: "Atendimento" },
  { key: "servicePoolBar", header: "Atendimento Bar da Piscina", block: "Atendimento" },
  { key: "serviceDinner", header: "Atendimento Jantar", block: "Atendimento" },
  { key: "roomCleaning", header: "Apartamento Limpeza Diaria", block: "Apartamento" },
  { key: "roomComfort", header: "Apartamento Conforto Geral", block: "Apartamento" },
  { key: "roomEquipment", header: "Apartamento Equipamentos", block: "Apartamento" },
  { key: "frontDesk", header: "Servicos Recepcao", block: "Serviços" },
  { key: "generalService", header: "Servicos Atendimento", block: "Serviços" },
  { key: "externalArea", header: "Servicos Area Externa", block: "Serviços" },
  { key: "pool", header: "Servicos Piscina", block: "Serviços" }
];

const OPERATIONAL_BLOCKS = ["Geral", "Alimentos", "Atendimento", "Apartamento", "Serviços"];
const OPERATIONAL_HOTEL_ORDER = [
  "SUEDS CABRALIA",
  "SUEDS SEGUNDO SOL",
  "SUEDS PLAZA",
  "SUEDS PREMIUM",
  "SUEDS TRANCOSO",
  "CASAS SUEDS ARRAIAL"
];

function ratingScore(value) {
  const key = comparableKey(value);
  if (!key) return null;
  if (key === "excelente" || key === "otimo") return 100;
  if (key === "muito bom") return 85;
  if (key === "bom") return 70;
  if (key === "regular") return 40;
  return null;
}

function operationalStatus(score) {
  if (score === null || score === undefined) return "sem_dados";
  if (score >= 90) return "excelente";
  if (score >= 75) return "bom";
  if (score >= 60) return "atencao";
  return "critico";
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return Math.round(valid.reduce((sumValue, value) => sumValue + value, 0) / valid.length);
}

function normalizeOperationalOpinion(item) {
  const processedAt = parseDate(item["Data Processamento"]);
  const fieldScores = {};
  OPERATIONAL_RATING_FIELDS.forEach((field) => {
    fieldScores[field.key] = ratingScore(item[field.header]);
  });

  return {
    fileId: String(item["ID Arquivo"] || "").trim(),
    processedAt,
    dateKey: processedAt ? dateKey(processedAt) : "",
    monthKey: processedAt ? monthKey(processedAt) : "",
    hotel: String(item.Hotel || "Nao identificado").trim() || "Nao identificado",
    photoUrl: String(item["Link Foto"] || "").trim(),
    guestName: String(item["Nome Hospede"] || "").trim(),
    apartment: String(item.Apartamento || "").trim(),
    highlights: String(item.Destaques || "").trim(),
    issues: String(item["Problemas Identificados"] || "").trim(),
    status: String(item.Status || "").trim(),
    confidence: parseDecimalNumber(item["Confianca %"]),
    fieldScores
  };
}

function summarizeOperationalHotel(hotel, opinions) {
  const blockScores = OPERATIONAL_BLOCKS.map((block) => {
    const scores = [];
    opinions.forEach((opinion) => {
      OPERATIONAL_RATING_FIELDS
        .filter((field) => field.block === block)
        .forEach((field) => {
          const score = opinion.fieldScores[field.key];
          if (Number.isFinite(score)) scores.push(score);
        });
    });
    const score = average(scores);
    return {
      label: block,
      score,
      answered: scores.length,
      status: operationalStatus(score)
    };
  });

  const allScores = [];
  opinions.forEach((opinion) => {
    Object.values(opinion.fieldScores).forEach((score) => {
      if (Number.isFinite(score)) allScores.push(score);
    });
  });

  const finalScore = average(allScores);
  const recentHighlights = opinions
    .map((opinion) => opinion.highlights)
    .filter(Boolean)
    .slice(-2);
  const recentIssues = opinions
    .map((opinion) => opinion.issues)
    .filter(Boolean)
    .slice(-2);

  return {
    hotel,
    opinions: opinions.length,
    answeredItems: allScores.length,
    finalScore,
    status: operationalStatus(finalScore),
    blocks: blockScores,
    highlights: recentHighlights,
    issues: recentIssues
  };
}

function emptyOperationalHotel(hotel) {
  return {
    hotel,
    opinions: 0,
    answeredItems: 0,
    finalScore: null,
    status: "sem_dados",
    blocks: OPERATIONAL_BLOCKS.map((block) => ({
      label: block,
      score: null,
      answered: 0,
      status: "sem_dados"
    })),
    highlights: [],
    issues: []
  };
}

function demoOperationalOpinions() {
  const today = new Date();
  const demo = [
    { hotel: "SUEDS CABRALIA", geral: 70, alimentos: 70, atendimento: 100, apartamento: 40, servicos: 70, highlights: "Ótimo atendimento.", issues: "Limpeza do apartamento precisa atenção." },
    { hotel: "SUEDS CABRALIA", geral: 85, alimentos: 70, atendimento: 85, apartamento: 70, servicos: 70, highlights: "Funcionários atenciosos.", issues: "" },
    { hotel: "SUEDS TRANCOSO", geral: 100, alimentos: 85, atendimento: 100, apartamento: 85, servicos: 100, highlights: "Equipe muito elogiada.", issues: "" },
    { hotel: "SUEDS TRANCOSO", geral: 70, alimentos: 70, atendimento: 70, apartamento: 70, servicos: 70, highlights: "", issues: "Acompanhar manutenção preventiva." }
  ];

  return demo.map((item, index) => {
    const blockValues = {
      Geral: item.geral,
      Alimentos: item.alimentos,
      Atendimento: item.atendimento,
      Apartamento: item.apartamento,
      Serviços: item.servicos
    };
    const fieldScores = {};
    OPERATIONAL_RATING_FIELDS.forEach((field) => {
      fieldScores[field.key] = blockValues[field.block];
    });
    return {
      fileId: `demo-${index + 1}`,
      processedAt: today,
      dateKey: dateKey(today),
      monthKey: monthKey(today),
      hotel: item.hotel,
      photoUrl: "",
      guestName: "",
      apartment: "",
      highlights: item.highlights,
      issues: item.issues,
      status: "Demo",
      confidence: 80,
      fieldScores
    };
  });
}

async function loadOperationalOpinions() {
  if (operationalCache.payload && Date.now() < operationalCache.expiresAt) {
    return operationalCache.payload;
  }

  let opinions;
  if (!OPERATIONAL_SHEET_ID || !getServiceAccount()) {
    opinions = demoOperationalOpinions();
  } else {
    const rows = await getSheetValues(OPINIONS_RANGE, OPERATIONAL_SHEET_ID);
    opinions = rowsToObjectsAny(rows).map(normalizeOperationalOpinion);
  }

  operationalCache = { payload: opinions, expiresAt: Date.now() + CACHE_TTL_MS };
  return opinions;
}

async function buildOperationalTvPayload(period = {}) {
  const opinions = await loadOperationalOpinions();
  const month = period.month || todayKey().slice(0, 7);
  const monthOpinions = opinions.filter((opinion) => !opinion.monthKey || opinion.monthKey === month);
  const hotels = [...groupBy(monthOpinions, (opinion) => opinion.hotel).entries()]
    .map(([hotel, rows]) => summarizeOperationalHotel(hotel, rows))
    .sort((a, b) => b.opinions - a.opinions || a.hotel.localeCompare(b.hotel));
  const hotelsByName = new Map(hotels.map((hotel) => [comparableKey(hotel.hotel), hotel]));
  const orderedHotels = OPERATIONAL_HOTEL_ORDER.map((hotel) => hotelsByName.get(comparableKey(hotel)) || emptyOperationalHotel(hotel));
  hotels.forEach((hotel) => {
    if (!OPERATIONAL_HOTEL_ORDER.some((name) => comparableKey(name) === comparableKey(hotel.hotel))) {
      orderedHotels.push(hotel);
    }
  });

  const allScores = [];
  monthOpinions.forEach((opinion) => {
    Object.values(opinion.fieldScores).forEach((score) => {
      if (Number.isFinite(score)) allScores.push(score);
    });
  });

  return {
    audience: "tv-operacional",
    generatedAt: new Date().toISOString(),
    period: { month },
    summary: {
      opinions: monthOpinions.length,
      hotels: orderedHotels.length,
      evaluatedHotels: hotels.filter((hotel) => hotel.opinions > 0).length,
      finalScore: average(allScores),
      status: operationalStatus(average(allScores))
    },
    hotels: orderedHotels
  };
}

function marketComparable(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const MARKET_DDD_CITY = {
  "11": "São Paulo",
  "21": "Rio de Janeiro",
  "27": "Vitória",
  "31": "Belo Horizonte",
  "33": "Governador Valadares",
  "61": "Brasília",
  "62": "Goiânia",
  "71": "Salvador",
  "73": "Porto Seguro",
  "77": "Vitória da Conquista",
  "81": "Recife"
};

function marketDddLabel(state, ddd) {
  const safeDdd = String(ddd || "").trim();
  if (!safeDdd || marketComparable(safeDdd) === "ni") {
    return `${state || "Nao informado"} / NI`;
  }

  const city = MARKET_DDD_CITY[safeDdd];
  return city ? `${city} / ${safeDdd}` : `${state || "Nao informado"} / ${safeDdd}`;
}

function marketGroupBy(rows, keyFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

function marketSum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function marketPct(part, total) {
  return total ? (part / total) * 100 : 0;
}

function marketSafeDiv(part, total) {
  return total ? part / total : 0;
}

function marketRound(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function marketDateRangeForMonth(month) {
  if (month === "ytd") {
    const today = todayKey();
    const year = today.slice(0, 4);
    return {
      month: "ytd",
      label: `Este ano ${year}`,
      startDate: `${year}-01-01`,
      endDate: today
    };
  }

  if (/^\d{4}$/.test(month || "")) {
    return {
      month,
      label: `Ano ${month}`,
      startDate: `${month}-01-01`,
      endDate: `${month}-12-31`
    };
  }

  const safeMonth = /^\d{4}-\d{2}$/.test(month || "") ? month : todayKey().slice(0, 7);
  return {
    month: safeMonth,
    startDate: `${safeMonth}-01`,
    endDate: `${safeMonth}-${String(daysInMonth(safeMonth)).padStart(2, "0")}`
  };
}

function demoMarketRows(month) {
  const rows = [
    ["BA", "73", "SUEDS Segundo Sol", "Central de Reservas", "Google Search Institucional", "Google Ads", "Pesquisa", "Mobile", 1380, 610, 192, 124, 446320, 18200, 0],
    ["BA", "73", "SUEDS Cabralia", "Site", "Stories Junho Porto Seguro", "Meta Ads", "Social", "Mobile", 980, 410, 132, 87, 241120, 0, 8900],
    ["BA", "71", "SUEDS Plaza", "Central de Reservas", "Google Search Marca", "Google Ads", "Pesquisa", "Desktop", 520, 240, 77, 51, 142800, 7450, 0],
    ["MG", "31", "SUEDS Premium", "Central de Reservas", "Google Search Destinos", "Google Ads", "Pesquisa", "Mobile", 460, 198, 48, 31, 98220, 6900, 0],
    ["SP", "11", "SUEDS Segundo Sol", "Site", "Remarketing Motor", "Meta Ads", "Remarketing", "Mobile", 430, 160, 39, 24, 75600, 0, 5200],
    ["RJ", "21", "SUEDS Cabralia", "Particular (Individual)", "Google Performance Max", "Google Ads", "Performance", "Mobile", 390, 136, 31, 19, 66950, 5850, 0],
    ["ES", "27", "SUEDS Trancoso", "Central de Reservas", "Meta Praia Verão", "Meta Ads", "Social", "Mobile", 270, 92, 20, 11, 41200, 0, 2900],
    ["GO", "62", "SUEDS Plaza", "Recepção", "Google Search Regional", "Google Ads", "Pesquisa", "Mobile", 210, 76, 15, 8, 25800, 2600, 0],
    ["DF", "61", "SUEDS Premium", "Agência (Grupos)", "Campanha Grupos Julho", "Meta Ads", "Social", "Desktop", 185, 82, 12, 7, 39100, 0, 2100],
    ["PE", "81", "SUEDS Trancoso", "Central de Reservas", "Google Search Nordeste", "Google Ads", "Pesquisa", "Mobile", 160, 62, 10, 5, 17900, 1800, 0]
  ];

  return rows.map((row, index) => ({
    id: index + 1,
    month,
    state: row[0],
    ddd: row[1],
    hotel: row[2],
    channel: row[3],
    campaign: row[4],
    source: row[5],
    origin: row[6],
    device: row[7],
    dialogues: row[8],
    quotes: row[9],
    reservations: row[10],
    sales: row[11],
    revenue: row[12],
    googleSpend: row[13],
    metaSpend: row[14]
  }));
}

function marketPeriodLabel(value) {
  if (value === "ytd") return `ESTE ANO ${todayKey().slice(0, 4)}`;
  if (/^\d{4}$/.test(value || "")) return `ANO ${value}`;
  const [year, month] = String(value || todayKey().slice(0, 7)).split("-");
  const monthName = [
    "JANEIRO",
    "FEVEREIRO",
    "MARÇO",
    "ABRIL",
    "MAIO",
    "JUNHO",
    "JULHO",
    "AGOSTO",
    "SETEMBRO",
    "OUTUBRO",
    "NOVEMBRO",
    "DEZEMBRO"
  ][Number(month) - 1] || "";
  return `${monthName} DE ${year}`.trim();
}

function generatedMarketMonths(startMonth = "2025-01") {
  const months = [];
  const current = todayKey().slice(0, 7);
  let [year, month] = startMonth.split("-").map(Number);
  while (`${year}-${String(month).padStart(2, "0")}` <= current) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function marketAvailablePeriodsFromRows(rows) {
  const months = [...new Set([
    ...generatedMarketMonths("2025-01"),
    todayKey().slice(0, 7),
    "2026-07",
    ...(rows || []).map((row) => row.month)
  ].filter((month) => /^\d{4}-\d{2}$/.test(month)))]
    .sort((a, b) => b.localeCompare(a));
  const periods = months.map((month) => ({ value: month, label: marketPeriodLabel(month) }));
  const seen = new Set();
  return periods.filter((period) => {
    if (seen.has(period.value)) return false;
    seen.add(period.value);
    return true;
  });
}

function normalizeMarketMonthList(months = []) {
  return [...new Set((months || [])
    .map((month) => String(month || "").trim())
    .filter((month) => /^\d{4}-\d{2}$/.test(month)))]
    .sort((a, b) => b.localeCompare(a));
}

function loadAsksuiteMarketFileRawRows() {
  const filePath = path.join(__dirname, "data", "asksuite-market.json");
  if (!fs.existsSync(filePath)) return [];

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return payload.rows || [];
  } catch (error) {
    return [];
  }
}

function firstFilledValue(item, keys = []) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function monthFromMarketValue(value) {
  const text = String(value || "").trim();
  const isoMonth = text.match(/^(\d{4})-(\d{2})$/);
  if (isoMonth) return `${isoMonth[1]}-${isoMonth[2]}`;
  const isoDate = text.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}`;
  const brDate = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brDate) return `${brDate[3]}-${String(Number(brDate[2])).padStart(2, "0")}`;
  return text;
}

function normalizeAsksuiteMarketSheetRow(item) {
  const month = monthFromMarketValue(firstFilledValue(item, ["Mês", "Mes", "month", "Data", "Período", "Periodo"]));
  if (!month) return null;

  return {
    month,
    state: firstFilledValue(item, ["Estado", "UF", "state"]) || "Não informado",
    ddd: String(firstFilledValue(item, ["DDD", "ddd"]) || "NI").replace(/\D/g, "") || "NI",
    hotel: firstFilledValue(item, ["Hotel", "hotel"]) || "Não informado",
    channel: firstFilledValue(item, ["Canal", "channel"]) || "Não informado",
    campaign: firstFilledValue(item, ["Campanha", "campaign"]),
    source: firstFilledValue(item, ["Fonte", "Origem Sistema", "source"]) || "Asksuite",
    origin: firstFilledValue(item, ["Origem", "origin", "Canal"]) || "Não informado",
    device: firstFilledValue(item, ["Dispositivo", "device"]) || "Não informado",
    dialogues: parseDecimalNumber(firstFilledValue(item, ["Diálogos", "Dialogos", "dialogues", "Atendimentos"])),
    quotes: parseDecimalNumber(firstFilledValue(item, ["Cotações", "Cotacoes", "quotes", "Oportunidades"])),
    reservations: parseDecimalNumber(firstFilledValue(item, ["Reservas", "reservations", "Cotações", "Cotacoes", "Oportunidades"])),
    sales: parseDecimalNumber(firstFilledValue(item, ["Vendas", "sales"])),
    revenue: parseDecimalNumber(firstFilledValue(item, ["Receita", "revenue", "Valor vendido"])),
    googleSpend: parseDecimalNumber(firstFilledValue(item, ["Investimento Google", "Google Ads", "googleSpend"])),
    metaSpend: parseDecimalNumber(firstFilledValue(item, ["Investimento Meta", "Meta Ads", "metaSpend"]))
  };
}

function marketRowKey(row) {
  return [
    row.month,
    row.state,
    row.ddd,
    row.hotel,
    row.channel,
    row.campaign,
    row.source,
    row.origin,
    row.device
  ].map((value) => marketComparable(value)).join("|");
}

function mergeAsksuiteMarketRows(fileRows = [], sheetRows = []) {
  const rowsByKey = new Map();
  [...fileRows, ...sheetRows].forEach((row) => {
    if (!row?.month) return;
    rowsByKey.set(marketRowKey(row), row);
  });
  return [...rowsByKey.values()];
}

async function loadAsksuiteMarketSheetRawRows() {
  if (!SHEET_ID || !getServiceAccount()) return [];
  try {
    const rows = await getSheetValues(ASKSUITE_MARKET_RANGE);
    return rowsToObjectsAny(rows)
      .map(normalizeAsksuiteMarketSheetRow)
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

async function loadAsksuiteMarketRawRows() {
  const [fileRows, sheetRows] = await Promise.all([
    Promise.resolve(loadAsksuiteMarketFileRawRows()),
    loadAsksuiteMarketSheetRawRows()
  ]);
  return mergeAsksuiteMarketRows(fileRows, sheetRows);
}

function normalizeAsksuiteMarketRow(row, index) {
  return {
    id: `asksuite-${row.month}-${index + 1}`,
    month: row.month,
    state: row.state || "Não informado",
    ddd: row.ddd || "NI",
    hotel: row.hotel || "Não informado",
    channel: row.channel || "Não informado",
    campaign: row.campaign || `Asksuite ${row.channel || ""}`.trim(),
    source: row.source || "Asksuite",
    origin: row.origin || row.channel || "Não informado",
    device: row.device || "Não informado",
    dialogues: Number(row.dialogues || 0),
    quotes: Number(row.quotes || 0),
    reservations: Number(row.reservations || 0),
    sales: Number(row.sales || 0),
    revenue: Number(row.revenue || 0),
    googleSpend: Number(row.googleSpend || 0),
    metaSpend: Number(row.metaSpend || 0)
  };
}

function loadAsksuiteMarketRowsFromRaw(rawRows, month) {
  try {
    const targetYear = todayKey().slice(0, 4);
    return rawRows
      .filter((row) => {
        const rowMonth = String(row.month || "");
        if (month === "ytd") return rowMonth.startsWith(targetYear);
        if (/^\d{4}$/.test(month || "")) return rowMonth.startsWith(month);
        return rowMonth === month;
      })
      .map(normalizeAsksuiteMarketRow);
  } catch (error) {
    return [];
  }
}

function loadAsksuiteMarketRowsForMonthsFromRaw(rawRows, months = []) {
  try {
    const selected = new Set(normalizeMarketMonthList(months));
    if (!selected.size) return [];
    return rawRows
      .filter((row) => selected.has(String(row.month || "")))
      .map(normalizeAsksuiteMarketRow);
  } catch (error) {
    return [];
  }
}

function demoCompetitivenessRows(month) {
  const base = marketDateRangeForMonth(month).startDate;
  return [
    { date: base, hotel: "SUEDS Segundo Sol", suedsPrice: 820, competitorAvg: 910, minCompetitor: 790, rank: 2, demand: "Alta", opportunity: "Alta demanda com preço competitivo", suggestion: "Testar aumento de 6% nas datas de fim de semana." },
    { date: base, hotel: "SUEDS Cabralia", suedsPrice: 640, competitorAvg: 615, minCompetitor: 570, rank: 4, demand: "Média", opportunity: "Preço acima da média em janela sensível", suggestion: "Revisar tarifa ou reforçar diferenciais no anúncio." },
    { date: base, hotel: "SUEDS Plaza", suedsPrice: 590, competitorAvg: 650, minCompetitor: 560, rank: 2, demand: "Alta", opportunity: "Boa posição para captar demanda regional", suggestion: "Manter tarifa e impulsionar canais de melhor ROAS." },
    { date: base, hotel: "SUEDS Premium", suedsPrice: 720, competitorAvg: 705, minCompetitor: 650, rank: 3, demand: "Média", opportunity: "Concorrência próxima", suggestion: "Monitorar ocupação antes de elevar preço." },
    { date: base, hotel: "SUEDS Trancoso", suedsPrice: 980, competitorAvg: 1120, minCompetitor: 930, rank: 2, demand: "Alta", opportunity: "Espaço para captura de margem", suggestion: "Subir 8% em datas de alta procura." },
    { date: base, hotel: "Casas Sueds Arraial", suedsPrice: 1250, competitorAvg: 1190, minCompetitor: 1080, rank: 5, demand: "Planejada", opportunity: "Hotel em fase inicial de leitura", suggestion: "Acompanhar primeiras reservas antes de ajuste agressivo." }
  ].map((row) => ({
    ...row,
    diffPct: marketPct(row.suedsPrice - row.competitorAvg, row.competitorAvg)
  }));
}

function filterMarketRows(rows, filters) {
  return rows.filter((row) => {
    return (!filters.hotel || marketComparable(row.hotel) === marketComparable(filters.hotel))
      && (!filters.state || marketComparable(row.state) === marketComparable(filters.state))
      && (!filters.ddd || marketComparable(row.ddd) === marketComparable(filters.ddd))
      && (!filters.channel || marketComparable(row.channel) === marketComparable(filters.channel))
      && (!filters.campaign || marketComparable(row.campaign) === marketComparable(filters.campaign))
      && (!filters.origin || marketComparable(row.origin) === marketComparable(filters.origin))
      && (!filters.device || marketComparable(row.device) === marketComparable(filters.device));
  });
}

function summarizeMarketGroup(label, rows) {
  const dialogues = marketSum(rows, "dialogues");
  const reservations = marketSum(rows, "reservations");
  const sales = marketSum(rows, "sales");
  const revenue = marketSum(rows, "revenue");
  const spend = marketSum(rows, "googleSpend") + marketSum(rows, "metaSpend");
  return {
    label,
    dialogues,
    quotes: marketSum(rows, "quotes"),
    reservations,
    sales,
    revenue,
    spend,
    conversion: marketRound(marketPct(sales, dialogues)),
    reservationConversion: marketRound(marketPct(reservations, dialogues)),
    ticketAverage: marketRound(marketSafeDiv(revenue, sales), 2),
    costPerDialogue: marketRound(marketSafeDiv(spend, dialogues), 2),
    costPerReservation: marketRound(marketSafeDiv(spend, reservations), 2),
    costPerSale: marketRound(marketSafeDiv(spend, sales), 2),
    roas: marketRound(marketSafeDiv(revenue, spend), 2),
    opportunityIndex: Math.round(dialogues * (1 - marketSafeDiv(sales, dialogues)))
  };
}

function emptyMarketGroup(label) {
  return summarizeMarketGroup(label, []);
}

function ensureMarketGroupRows(rows, labels) {
  const existing = new Set(rows.map((row) => marketComparable(row.label)));
  labels.forEach((label) => {
    if (!existing.has(marketComparable(label))) {
      rows.push(emptyMarketGroup(label));
    }
  });
  return rows;
}

function rankedMarketGroups(rows, key, limit = 10) {
  return [...marketGroupBy(rows, (row) => row[key] || "Nao informado").entries()]
    .map(([label, groupRows]) => summarizeMarketGroup(label, groupRows))
    .sort((a, b) => b.opportunityIndex - a.opportunityIndex || b.dialogues - a.dialogues)
    .slice(0, limit);
}

function selectValues(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
}

function ensureSelectValues(values, labels) {
  const nextValues = [...values];
  const existing = new Set(nextValues.map((value) => marketComparable(value)));
  labels.forEach((label) => {
    if (!existing.has(marketComparable(label))) {
      nextValues.push(label);
    }
  });
  return nextValues.sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
}

function applyGoogleAdsMetricsToMarketPayload(payload, googleAds, filters = {}) {
  payload.integrations = {
    ...(payload.integrations || {}),
    googleAds: {
      configured: googleAds.configured,
      source: googleAds.source,
      error: googleAds.error || "",
      apiVersion: googleAds.apiVersion || "",
      customerId: googleAds.customerId || "",
      period: googleAds.period || payload.period
    }
  };

  if (!googleAds.configured || googleAds.source !== "google_ads_api") {
    return payload;
  }

  const selectedCampaign = filters.campaign || "";
  const campaigns = googleAds.campaigns
    .filter((campaign) => !selectedCampaign || marketComparable(campaign.label) === marketComparable(selectedCampaign))
    .map((campaign) => ({
      label: campaign.label,
      spend: campaign.spend,
      clicks: campaign.clicks,
      impressions: campaign.impressions,
      conversions: campaign.conversions,
      sales: campaign.conversions,
      revenue: campaign.conversionValue,
      conversionValue: campaign.conversionValue,
      costPerClick: campaign.costPerClick,
      costPerSale: campaign.costPerConversion,
      roas: campaign.roas,
      opportunityIndex: Math.max(0, Math.round(campaign.clicks - campaign.conversions))
    }));
  const keywords = (googleAds.keywords || [])
    .filter((keyword) => !selectedCampaign || marketComparable(keyword.campaign) === marketComparable(selectedCampaign))
    .map((keyword) => ({
      label: keyword.keyword,
      keyword: keyword.keyword,
      campaign: keyword.campaign,
      adGroup: keyword.adGroup,
      spend: keyword.spend,
      clicks: keyword.clicks,
      impressions: keyword.impressions,
      conversions: keyword.conversions,
      sales: keyword.conversions,
      revenue: keyword.conversionValue,
      conversionValue: keyword.conversionValue,
      costPerClick: keyword.costPerClick,
      costPerSale: keyword.costPerConversion,
      roas: keyword.roas
    }));
  const geoCities = (googleAds.geoCities || []).map((city) => ({
    label: city.city,
    city: city.city,
    countryCode: city.countryCode,
    locationType: city.locationType,
    spend: city.spend,
    clicks: city.clicks,
    impressions: city.impressions,
    conversions: city.conversions,
    sales: city.conversions,
    revenue: city.conversionValue,
    conversionValue: city.conversionValue,
    costPerClick: city.costPerClick,
    costPerSale: city.costPerConversion,
    roas: city.roas
  }));

  const googleSummary = googleAds.summary || {};
  const campaignSpend = campaigns.reduce((total, row) => total + row.spend, 0);
  const campaignClicks = campaigns.reduce((total, row) => total + row.clicks, 0);
  const campaignConversions = campaigns.reduce((total, row) => total + row.conversions, 0);
  const campaignConversionValue = campaigns.reduce((total, row) => total + row.conversionValue, 0);
  const useCampaignSummary = Boolean(selectedCampaign) || campaignSpend || campaignClicks || campaignConversions || campaignConversionValue;
  const googleSpend = useCampaignSummary
    ? marketRound(campaignSpend, 2)
    : marketRound(googleSummary.spend, 2);
  const googleClicks = useCampaignSummary
    ? campaignClicks
    : Number(googleSummary.clicks || 0);
  const googleConversions = useCampaignSummary
    ? marketRound(campaignConversions, 2)
    : marketRound(googleSummary.conversions, 2);
  const googleConversionValue = useCampaignSummary
    ? marketRound(campaignConversionValue, 2)
    : marketRound(googleSummary.conversionValue, 2);
  const metaSpend = 0;
  const mediaSpend = googleSpend + metaSpend;

  payload.summary.googleSpend = googleSpend;
  payload.summary.metaSpend = metaSpend;
  payload.summary.mediaSpend = marketRound(mediaSpend, 2);
  payload.summary.costPerSale = marketRound(marketSafeDiv(mediaSpend, payload.summary.sales), 2);
  payload.summary.roas = marketRound(marketSafeDiv(payload.summary.revenue, mediaSpend), 2);

  payload.media.googleSpend = googleSpend;
  payload.media.metaSpend = metaSpend;
  payload.media.metaConnected = false;
  payload.media.googleClicks = googleClicks;
  payload.media.googleConversions = googleConversions;
  payload.media.googleConversionValue = googleConversionValue;
  payload.media.googleSummarySource = useCampaignSummary ? "campaigns" : "customer";
  payload.media.googleCampaignSpend = marketRound(googleSummary.campaignSpend, 2);
  payload.media.googleAccountSpend = marketRound(googleSummary.accountSpend, 2);
  payload.media.costPerClick = marketRound(marketSafeDiv(googleSpend, googleClicks), 2);
  payload.media.costPerDialogue = marketRound(marketSafeDiv(mediaSpend, payload.summary.dialogues), 2);
  payload.media.costPerReservation = marketRound(marketSafeDiv(mediaSpend, payload.summary.reservations), 2);
  payload.media.costPerSale = marketRound(marketSafeDiv(mediaSpend, payload.summary.sales), 2);
  payload.media.byCampaign = campaigns.sort((a, b) => b.spend - a.spend);
  payload.media.byKeyword = keywords.sort((a, b) => b.spend - a.spend);
  payload.media.byCity = geoCities.sort((a, b) => b.spend - a.spend);
  payload.filters.campaigns = [...new Set([...(payload.filters.campaigns || []), ...googleAds.campaigns.map((campaign) => campaign.label)])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  payload.opportunities.byCampaign = campaigns
    .map((campaign) => ({
      ...campaign,
      dialogues: campaign.clicks,
      conversion: marketRound(marketPct(campaign.conversions, campaign.clicks)),
      opportunityIndex: Math.max(0, Math.round(campaign.clicks * (1 - marketSafeDiv(campaign.conversions, campaign.clicks))))
    }))
    .sort((a, b) => b.opportunityIndex - a.opportunityIndex);

  return payload;
}

async function buildMarketIntelligencePayload(filters = {}) {
  const requestedMonth = filters.month && (filters.month === "ytd" || /^\d{4}$/.test(filters.month) || /^\d{4}-\d{2}$/.test(filters.month))
    ? filters.month
    : "";
  const { month } = requestedMonth ? marketDateRangeForMonth(requestedMonth) : { month: "" };
  const allMarketRows = await loadAsksuiteMarketRawRows();
  const selectedMonths = normalizeMarketMonthList(filters.months || []);
  const activeMonths = selectedMonths.length ? selectedMonths : normalizeMarketMonthList([month]);
  const asksuiteMarketRows = activeMonths.length > 1
    ? loadAsksuiteMarketRowsForMonthsFromRaw(allMarketRows, activeMonths)
    : (activeMonths.length ? loadAsksuiteMarketRowsFromRaw(allMarketRows, activeMonths[0]) : []);
  const sourceRows = asksuiteMarketRows;
  const marketSource = asksuiteMarketRows.length ? "asksuite_report" : "empty";
  const rows = filterMarketRows(sourceRows, filters);
  const summary = summarizeMarketGroup("Total", rows);
  const googleSpend = marketSum(rows, "googleSpend");
  const metaSpend = marketSum(rows, "metaSpend");
  const googleRows = rows.filter((row) => marketComparable(row.source) === "google ads");
  const demoGoogleClicks = marketSum(googleRows, "dialogues");
  const demoGoogleConversions = marketSum(googleRows, "sales");
  const demoGoogleConversionValue = marketSum(googleRows, "revenue");
  const byState = rankedMarketGroups(rows, "state", 27);
  const byDdd = rankedMarketGroups(rows, "ddd", 30);
  const byHotel = rankedMarketGroups(rows, "hotel", 12);
  const byChannel = ensureMarketGroupRows(rankedMarketGroups(rows, "channel", 12), ["Robo"]);
  const byCampaign = rankedMarketGroups(rows, "campaign", 12);
  const byOrigin = rankedMarketGroups(rows, "origin", 12);
  const byStateDdd = [...marketGroupBy(rows, (row) => marketDddLabel(row.state, row.ddd)).entries()]
    .map(([label, groupRows]) => summarizeMarketGroup(label, groupRows))
    .sort((a, b) => b.dialogues - a.dialogues);
  const competitiveness = [];

  const payload = {
    audience: "gestores-inteligencia-mercado",
    generatedAt: new Date().toISOString(),
    period: { month: activeMonths[0] || month, months: activeMonths },
    integrations: {
      asksuite: {
        configured: Boolean(asksuiteMarketRows.length),
        source: marketSource,
        rows: asksuiteMarketRows.length,
        note: asksuiteMarketRows.length
          ? "Diálogos vêm dos atendimentos; cotações e reservas usam a coluna Oportunidades; vendas e receita usam Vendas e Valor vendido."
          : "Sem relatório Asksuite carregado para este período."
      }
    },
    filters: {
      selected: { ...filters, months: activeMonths },
      periods: marketAvailablePeriodsFromRows(allMarketRows),
      hotels: selectValues(sourceRows, "hotel"),
      states: selectValues(sourceRows, "state"),
      ddds: selectValues(sourceRows, "ddd"),
      channels: ensureSelectValues(selectValues(sourceRows, "channel"), ["Robo"]),
      campaigns: selectValues(sourceRows, "campaign"),
      origins: selectValues(sourceRows, "origin"),
      devices: selectValues(sourceRows, "device")
    },
    summary: {
      dialogues: summary.dialogues,
      reservations: summary.reservations,
      sales: summary.sales,
      revenue: summary.revenue,
      dialogueToSaleConversion: summary.conversion,
      mediaSpend: googleSpend + metaSpend,
      googleSpend,
      metaSpend,
      costPerDialogue: summary.costPerDialogue,
      costPerReservation: summary.costPerReservation,
      costPerSale: summary.costPerSale,
      roas: summary.roas
    },
    demand: {
      byState,
      byDdd,
      stateTable: byState.map((row) => ({
        state: row.label,
        dialogues: row.dialogues,
        reservations: row.reservations,
        sales: row.sales,
        revenue: row.revenue,
        conversion: row.conversion,
        ticketAverage: row.ticketAverage
      }))
    },
    conversion: {
      funnel: [
        { label: "Diálogos", value: summary.dialogues },
        { label: "Cotações", value: summary.quotes },
        { label: "Reservas", value: summary.reservations },
        { label: "Vendas", value: summary.sales }
      ],
      byHotel,
      byChannel,
      byStateDdd
    },
    media: {
      googleSpend,
      metaSpend,
      metaConnected: false,
      googleClicks: demoGoogleClicks,
      googleConversions: demoGoogleConversions,
      googleConversionValue: demoGoogleConversionValue,
      costPerClick: marketRound(marketSafeDiv(googleSpend, demoGoogleClicks), 2),
      costPerDialogue: summary.costPerDialogue,
      costPerReservation: summary.costPerReservation,
      costPerSale: summary.costPerSale,
      byCampaign,
      byKeyword: [],
      byState: byState.map((row) => ({
        state: row.label,
        spend: row.spend,
        revenue: row.revenue,
        roas: row.roas
      }))
    },
    competitiveness: {
      rows: competitiveness,
      alerts: competitiveness
        .filter((row) => row.demand === "Alta" || Math.abs(row.diffPct) >= 8)
        .map((row) => ({
          hotel: row.hotel,
          message: row.opportunity,
          suggestion: row.suggestion
        }))
    },
    opportunities: {
      formula: "Oportunidade = Diálogos × (1 - Conversão de venda)",
      byState,
      byDdd,
      byChannel,
      byHotel,
      byCampaign,
      byOrigin
    }
  };
  const googleAds = activeMonths.length > 1
    ? await loadGoogleAdsMetricsForMonths(activeMonths)
    : (activeMonths.length
      ? await loadGoogleAdsMetrics({ month: activeMonths[0] })
      : {
        configured: false,
        source: "empty",
        campaigns: [],
        keywords: [],
        geoCities: [],
        summary: { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 }
      });
  return applyGoogleAdsMetricsToMarketPayload(payload, googleAds, filters);
}

function marketFiltersFromUrl(url) {
  const period = url.searchParams.get("month") || "";
  const months = normalizeMarketMonthList((url.searchParams.get("months") || "").split(","));
  return {
    month: period === "ytd" || /^\d{4}$/.test(period) || /^\d{4}-\d{2}$/.test(period) ? period : undefined,
    months,
    hotel: url.searchParams.get("hotel") || "",
    state: url.searchParams.get("state") || "",
    ddd: url.searchParams.get("ddd") || "",
    channel: url.searchParams.get("channel") || "",
    campaign: url.searchParams.get("campaign") || "",
    origin: url.searchParams.get("origin") || "",
    device: url.searchParams.get("device") || ""
  };
}

function demoDataset() {
  const today = todayKey();
  const month = today.slice(0, 7);
  const sellers = ["Aline Nunes", "Amanda Melgaco", "Julia Reche", "Emanoel Cesar", "Site"];
  const records = sellers.flatMap((seller, index) => [
    {
      dateKey: today,
      monthKey: month,
      seller,
      hotel: "SUEDS PLAZA",
      channel: index === 4 ? "Booking Engine" : "Central de Reservas",
      status: "Confirmada",
      total: [7800, 9400, 6100, 3300, 5100][index],
      received: [7800, 9400, 6100, 3300, 5100][index],
      remaining: 0
    },
    {
      dateKey: `${month}-01`,
      monthKey: month,
      seller,
      hotel: "SUEDS SEGUNDO SOL",
      channel: index === 4 ? "Booking Engine" : "WhatsApp",
      status: "Confirmada",
      total: [42000, 51000, 31000, 18000, 26000][index],
      received: [42000, 51000, 31000, 18000, 26000][index],
      remaining: 0
    }
  ]);

  const goals = sellers.map((seller, index) => ({
    month,
    date: "",
    seller,
    revenueGoal: [150000, 150000, 120000, 90000, 100000][index]
  }));

  const carts = sellers.slice(0, 4).flatMap((seller, index) => [
    {
      monthKey: month,
      responsible: seller,
      status: index % 2 === 0 ? "Recuperado, comprou" : "Não recuperado",
      lossReason: index % 2 === 0 ? "" : "Desistiu de viajar",
      contacted: true
    }
  ]);

  const asksuite = sellers.slice(0, 4).map((seller, index) => ({
    dateKey: today,
    monthKey: month,
    seller,
    attendances: [249, 210, 269, 249][index],
    opportunities: [130, 90, 131, 133][index],
    sales: [15, 3, 1, 1][index],
    revenue: [59085.03, 9310.61, 4010.22, 260][index]
  }));

  return { records, goals, carts, asksuite };
}

async function loadDataset() {
  if (dataCache.payload && Date.now() < dataCache.expiresAt) {
    return dataCache.payload;
  }

  let records;
  let goals;
  let carts;
  let asksuite;

  if (!SHEET_ID || !getServiceAccount()) {
    const demo = demoDataset();
    records = demo.records;
    goals = demo.goals;
    carts = demo.carts;
    asksuite = demo.asksuite || [];
  } else {
    const [baseRows, goalRows, cartRows, asksuiteRows] = await Promise.all([
      getFirstAvailableSheetValues([SALES_RANGE, BASE_RANGE]),
      getSheetValues(METAS_RANGE),
      getSheetValues(CARTS_RANGE),
      getSheetValues(ASKSUITE_RANGE)
    ]);
    records = rowsToObjects(baseRows).map(normalizeRecord);
    goals = rowsToObjects(goalRows, { keepAnyValue: true }).map(normalizeGoal);
    carts = rowsToObjects(cartRows, { keepAnyValue: true }).map(normalizeCartRecord);
    asksuite = dedupeAsksuiteRecords(rowsToObjects(asksuiteRows, { keepAnyValue: true }).map(normalizeAsksuiteRecord));
  }

  const payload = { records, goals, carts, asksuite, loadedAt: new Date().toISOString() };
  dataCache = { payload, expiresAt: Date.now() + CACHE_TTL_MS };
  return payload;
}

async function loadMetrics(period) {
  const [dataset, analytics] = await Promise.all([
    loadDataset(),
    loadAnalyticsMetrics(period)
  ]);
  const metrics = buildMetrics(dataset.records, dataset.goals, period);
  metrics.cartRecovery = buildCartRecoveryMetrics(dataset.carts || [], period);
  metrics.asksuite = buildAsksuiteMetrics(dataset.asksuite || [], period);
  metrics.analytics = analytics;
  return metrics;
}

function periodFromUrl(url) {
  const date = url.searchParams.get("date") || "";
  const month = url.searchParams.get("month") || "";
  const hotel = url.searchParams.get("hotel") || "";
  const channel = url.searchParams.get("channel") || "";
  const day = url.searchParams.get("day") || "";
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    month: month === "ytd" || /^\d{4}-\d{2}$/.test(month) ? month : undefined,
    day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "",
    hotel,
    channel
  };
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/dashboard-tv.html" : url.pathname;
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) return notFound(res);

  fs.readFile(filePath, (error, content) => {
    if (error) return notFound(res);
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        googleConfigured: Boolean(SHEET_ID && getServiceAccount()),
        analyticsConfigured: Boolean((GA4_SITE_PROPERTY_ID || GA4_OMNIBEES_PROPERTY_ID) && getServiceAccount()),
        analyticsSiteConfigured: Boolean(GA4_SITE_PROPERTY_ID && getServiceAccount()),
        analyticsOmnibeesConfigured: Boolean(GA4_OMNIBEES_PROPERTY_ID && getServiceAccount()),
        googleAdsConfigured: googleAdsConfigured(),
        operationalConfigured: Boolean((OPERATIONAL_SHEET_ID || SHEET_ID) && getServiceAccount()),
        supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
        gestoresProtected: Boolean(GESTORES_ACCESS_TOKEN),
        cacheTtlSeconds: CACHE_TTL_MS / 1000
      });
    }

    if (url.pathname === "/api/debug/metas") {
      const remote = req.socket.remoteAddress || "";
      if (!remote.includes("127.0.0.1") && !remote.includes("::1")) return notFound(res);
      const rows = await getSheetValues(METAS_RANGE);
      return json(res, 200, { range: METAS_RANGE, rowCount: rows.length, rows: rows.slice(0, 20) });
    }

    if (url.pathname === "/api/debug/range") {
      const remote = req.socket.remoteAddress || "";
      if (!remote.includes("127.0.0.1") && !remote.includes("::1")) return notFound(res);
      const range = url.searchParams.get("range");
      if (!range) return json(res, 400, { error: "missing_range" });
      const rows = await getSheetValues(range);
      return json(res, 200, { range, rowCount: rows.length, rows });
    }

    if (url.pathname === "/api/dashboard/gestores") {
      if (!hasManagerAccess(req, url)) return forbidden(res);
      const metrics = await loadMetrics(periodFromUrl(url));
      return json(res, 200, buildManagerPayload(metrics));
    }

    if (url.pathname === "/api/dashboard/tv") {
      const metrics = await loadMetrics(periodFromUrl(url));
      return json(res, 200, buildTvPayload(metrics));
    }

    if (url.pathname === "/api/operacional/tv") {
      return json(res, 200, await buildOperationalTvPayload(periodFromUrl(url)));
    }

    if (url.pathname === "/api/inteligencia/mercado") {
      if (!hasManagerAccess(req, url)) return forbidden(res);
      return json(res, 200, await buildMarketIntelligencePayload(marketFiltersFromUrl(url)));
    }

    return serveStatic(req, res);
  } catch (error) {
    return json(res, 500, {
      error: "internal_error",
      message: error.message
    });
  }
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`SUEDS dashboard server running on http://localhost:${PORT}`);
  });
}

module.exports = { handleRequest };
