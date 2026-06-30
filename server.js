const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const SHEET_ID = process.env.GOOGLE_SHEET_ID || "";
const BASE_RANGE = process.env.GOOGLE_BASE_RANGE || "Base_Dashboard!A:Y";
const METAS_RANGE = process.env.GOOGLE_METAS_RANGE || "Metas!A:H";
const CARTS_RANGE = process.env.GOOGLE_CARTS_RANGE || "'Recuperação de carrinhos'!A:U";
const ASKSUITE_RANGE = process.env.GOOGLE_ASKSUITE_RANGE || "Asksuite_Atendimentos!A:H";
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

async function loadGoogleAdsMetrics(period = {}) {
  const { month, startDate, endDate } = marketDateRangeForMonth(period.month);
  const cacheKey = JSON.stringify({ month, startDate, endDate, customerId: GOOGLE_ADS_CUSTOMER_ID, version: GOOGLE_ADS_API_VERSION });
  if (googleAdsCache.key === cacheKey && googleAdsCache.payload && Date.now() < googleAdsCache.expiresAt) {
    return googleAdsCache.payload;
  }

  if (!googleAdsConfigured()) {
    return {
      configured: false,
      source: "demo",
      campaigns: [],
      summary: { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 }
    };
  }

  try {
    const query = `
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
    const results = await googleAdsSearchStream(query);
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
    const summary = {
      spend: marketRound(campaigns.reduce((total, row) => total + row.spend, 0), 2),
      clicks: campaigns.reduce((total, row) => total + row.clicks, 0),
      impressions: campaigns.reduce((total, row) => total + row.impressions, 0),
      conversions: marketRound(campaigns.reduce((total, row) => total + row.conversions, 0), 2),
      conversionValue: marketRound(campaigns.reduce((total, row) => total + row.conversionValue, 0), 2)
    };
    const payload = {
      configured: true,
      source: "google_ads_api",
      apiVersion: GOOGLE_ADS_API_VERSION,
      customerId: GOOGLE_ADS_CUSTOMER_ID,
      period: { month, startDate, endDate },
      campaigns,
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
      summary: { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 }
    };
  }
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

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  const parsedDate = parseDate(item.Data);
  return {
    date: parsedDate,
    dateKey: parsedDate ? dateKey(parsedDate) : "",
    monthKey: parsedDate ? monthKey(parsedDate) : "",
    seller: normalizeSellerName(item.Atendente || ""),
    attendances: parseDecimalNumber(item.Atendimentos),
    chatConvPct: parseDecimalNumber(item["Conv Atendimento %"]),
    opportunities: parseDecimalNumber(item.Oportunidades),
    salesConvPct: parseDecimalNumber(item["Conv Vendas %"]),
    sales: parseDecimalNumber(item.Vendas),
    revenue: parseDecimalNumber(item.Receita)
  };
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
const TEAM_SELLERS = ["Aline Nunes", "Amanda Melgaco", "Julia Reche", "Emanoel Cesar"];
const STRATEGIC_CHANNEL_SELLERS = ["Site", "Operadoras", "OTAs", "Robo"];
const OFFICIAL_SALES_CHANNELS = [
  "SITE",
  "CENTRAL DE RESERVAS",
  "PARTICULAR (individual)",
  "BALCÃO",
  "AGÊNCIA (grupos)",
  "RECEPÇÃO"
];

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
    if (key.includes("particular")) return "PARTICULAR (individual)";
    if (key.includes("balcao")) return "BALCÃO";
    if (key.includes("agencia")) return "AGÊNCIA (grupos)";
    if (key.includes("recepcao")) return "RECEPÇÃO";
    return "";
  }

  if (comparableKey(record.seller) === comparableKey("Site")) return "SITE";
  if (key.includes("booking engine") || key === "site") return "SITE";
  if (key.includes("central de reservas") || key.includes("whatsapp")) return "CENTRAL DE RESERVAS";
  if (key.includes("particular")) return "PARTICULAR (individual)";
  if (key.includes("balcao")) return "BALCÃO";
  if (key.includes("agencia")) return "AGÊNCIA (grupos)";
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
    const rows = monthRows.filter((row) => comparableKey(row.seller) === comparableKey(seller));
    return metricsFromRows(seller, rows);
  });
  const teamRows = monthRows.filter((row) => TEAM_SELLERS.some((seller) => comparableKey(row.seller) === comparableKey(seller)));

  return [
    ...sellerMetrics,
    metricsFromRows(TEAM_CARD_NAME, teamRows)
  ];
}

function buildMetrics(records, goals, period = {}) {
  const today = period.date || todayKey();
  const month = period.month || today.slice(0, 7);
  const selectedDay = period.day || "";
  const goalDate = selectedDay || today;
  const selectedHotel = period.hotel || "";
  const selectedChannel = period.channel || "";
  const channelLabelForRecord = (record) => normalizeOfficialSalesChannel(record.channel, record, month);
  const confirmed = records.filter((record) => record.status.toLowerCase() === "confirmada");
  const rawMonthRecords = confirmed.filter((record) => record.monthKey === month);
  const hasHistoricalMayBase = month === "2026-05" && rawMonthRecords.some((record) => comparableKey(record.source).includes("historico"));
  const monthRecords = hasHistoricalMayBase
    ? rawMonthRecords.filter((record) => comparableKey(record.source).includes("historico"))
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
  const workdaysInMonth = businessDaysInMonth(month);
  const workdaysElapsed = businessDaysElapsed(month, goalDate);

  const sellerNames = new Set([
    ...filteredRecords.map((record) => record.seller).filter(Boolean),
    ...goals.filter((goal) => goal.month === month || goal.date === goalDate).map((goal) => goal.seller).filter(Boolean)
  ]);

  const recordsBySeller = groupBy(filteredRecords, (record) => record.seller);
  let sellers = [...sellerNames]
    .map((seller) => {
      const sellerRecords = recordsBySeller.get(seller) || [];
      const dayRecords = selectedDay ? sellerRecords : sellerRecords.filter((record) => record.dateKey === today);
      const mtdRecords = sellerRecords.filter((record) => isOnOrBeforeDateKey(record, goalDate));
      const goal = sellerGoal(goals, seller, month, goalDate);
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
    .sort((a, b) => b.salesMonth - a.salesMonth);

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

  sellers = sellers.sort((a, b) => b.salesMonth - a.salesMonth);

  const channelLabels = new Set([
    ...OFFICIAL_SALES_CHANNELS,
    ...goals
      .filter((goal) => goal.month === month && goal.channel)
      .map((goal) => normalizeOfficialSalesChannel(goal.channel, {}, month))
      .filter(Boolean)
  ]);

  const recordsByChannel = groupBy(filteredRecords, channelLabelForRecord);
  const channels = [...channelLabels]
    .map((label) => {
      const rows = recordsByChannel.get(label) || [];
      const goal = goals.find((item) => item.month === month && comparableKey(normalizeOfficialSalesChannel(item.channel, {}, month)) === comparableKey(label));
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
    ...goals.filter((goal) => goal.month === month && goal.hotel).map((goal) => goal.hotel)
  ]);

  const recordsByHotel = groupBy(filteredRecords, (record) => record.hotel);
  const hotels = [...hotelLabels]
    .map((label) => {
      const rows = recordsByHotel.get(label) || [];
      const goal = dimensionGoal(goals, "hotel", label, month);
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
  "Aline Nunes",
  "Emanoel Cesar",
  "Julia Reche",
  "Amanda Melgaco",
  TEAM_CARD_NAME,
  "Site",
  "Operadoras",
  "OTAs",
  "Robo"
];

function tvOrder(name) {
  const index = TV_SELLER_ORDER.findIndex((item) => item.toLowerCase() === String(name).toLowerCase());
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

function rankedMarketGroups(rows, key, limit = 10) {
  return [...marketGroupBy(rows, (row) => row[key] || "Nao informado").entries()]
    .map(([label, groupRows]) => summarizeMarketGroup(label, groupRows))
    .sort((a, b) => b.opportunityIndex - a.opportunityIndex || b.dialogues - a.dialogues)
    .slice(0, limit);
}

function selectValues(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
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

  const googleSpend = marketRound(campaigns.reduce((total, row) => total + row.spend, 0), 2);
  const googleClicks = campaigns.reduce((total, row) => total + row.clicks, 0);
  const googleConversions = marketRound(campaigns.reduce((total, row) => total + row.conversions, 0), 2);
  const googleConversionValue = marketRound(campaigns.reduce((total, row) => total + row.conversionValue, 0), 2);
  const mediaSpend = googleSpend + payload.summary.metaSpend;

  payload.summary.googleSpend = googleSpend;
  payload.summary.mediaSpend = marketRound(mediaSpend, 2);
  payload.summary.costPerSale = marketRound(marketSafeDiv(mediaSpend, payload.summary.sales), 2);
  payload.summary.roas = marketRound(marketSafeDiv(payload.summary.revenue, mediaSpend), 2);

  payload.media.googleSpend = googleSpend;
  payload.media.googleClicks = googleClicks;
  payload.media.googleConversions = googleConversions;
  payload.media.googleConversionValue = googleConversionValue;
  payload.media.costPerClick = marketRound(marketSafeDiv(googleSpend, googleClicks), 2);
  payload.media.costPerDialogue = marketRound(marketSafeDiv(mediaSpend, payload.summary.dialogues), 2);
  payload.media.costPerReservation = marketRound(marketSafeDiv(mediaSpend, payload.summary.reservations), 2);
  payload.media.costPerSale = marketRound(marketSafeDiv(mediaSpend, payload.summary.sales), 2);
  payload.media.byCampaign = campaigns.sort((a, b) => b.spend - a.spend);
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
  const { month } = marketDateRangeForMonth(filters.month);
  const sourceRows = demoMarketRows(month);
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
  const byChannel = rankedMarketGroups(rows, "channel", 12);
  const byCampaign = rankedMarketGroups(rows, "campaign", 12);
  const byOrigin = rankedMarketGroups(rows, "origin", 12);
  const byStateDdd = [...marketGroupBy(rows, (row) => `${row.state} / ${row.ddd}`).entries()]
    .map(([label, groupRows]) => summarizeMarketGroup(label, groupRows))
    .sort((a, b) => b.dialogues - a.dialogues);
  const competitiveness = demoCompetitivenessRows(month)
    .filter((row) => !filters.hotel || marketComparable(row.hotel) === marketComparable(filters.hotel));

  const payload = {
    audience: "gestores-inteligencia-mercado",
    generatedAt: new Date().toISOString(),
    period: { month },
    filters: {
      selected: filters,
      hotels: selectValues(sourceRows, "hotel"),
      states: selectValues(sourceRows, "state"),
      ddds: selectValues(sourceRows, "ddd"),
      channels: selectValues(sourceRows, "channel"),
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
      googleClicks: demoGoogleClicks,
      googleConversions: demoGoogleConversions,
      googleConversionValue: demoGoogleConversionValue,
      costPerClick: marketRound(marketSafeDiv(googleSpend, demoGoogleClicks), 2),
      costPerDialogue: summary.costPerDialogue,
      costPerReservation: summary.costPerReservation,
      costPerSale: summary.costPerSale,
      byCampaign,
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
  const googleAds = await loadGoogleAdsMetrics({ month });
  return applyGoogleAdsMetricsToMarketPayload(payload, googleAds, filters);
}

function marketFiltersFromUrl(url) {
  return {
    month: /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : undefined,
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
      getSheetValues(BASE_RANGE),
      getSheetValues(METAS_RANGE),
      getSheetValues(CARTS_RANGE),
      getSheetValues(ASKSUITE_RANGE)
    ]);
    records = rowsToObjects(baseRows).map(normalizeRecord);
    goals = rowsToObjects(goalRows, { keepAnyValue: true }).map(normalizeGoal);
    carts = rowsToObjects(cartRows, { keepAnyValue: true }).map(normalizeCartRecord);
    asksuite = rowsToObjects(asksuiteRows, { keepAnyValue: true }).map(normalizeAsksuiteRecord);
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
    month: /^\d{4}-\d{2}$/.test(month) ? month : undefined,
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
