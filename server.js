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
const ASKSUITE_MARKET_RANGE = process.env.GOOGLE_ASKSUITE_MARKET_RANGE || "Asksuite_Detalhado!A:L";
const OPERATIONAL_SHEET_ID = process.env.GOOGLE_OPERATIONAL_SHEET_ID || "";
const OPINIONS_RANGE = process.env.GOOGLE_OPINIONS_RANGE || "Opinarios!A:AH";
const OPINION_OMR_TOKEN = process.env.OPINION_OMR_TOKEN || "";
const OPINION_UPLOAD_TOKEN = process.env.OPINION_UPLOAD_TOKEN || "";
const OPINION_APPS_SCRIPT_UPLOAD_URL = process.env.OPINION_APPS_SCRIPT_UPLOAD_URL || "";
const OPINION_UPLOAD_MAX_BYTES = Math.min(Number(process.env.OPINION_UPLOAD_MAX_BYTES || 4000000), 4200000);
const OPINION_UPLOAD_SESSION_TTL_SECONDS = Math.min(Math.max(Number(process.env.OPINION_UPLOAD_SESSION_TTL_SECONDS || 43200), 900), 86400);
const OPINION_UPLOAD_FOLDERS = {
  "sueds-plaza": process.env.GOOGLE_OPINIONS_PLAZA_FOLDER_ID || "16eaSsuRagT5ZYYVz34t5-Bzkvxf0UQZG"
};
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
const META_ADS_API_VERSION = process.env.META_ADS_API_VERSION || "v23.0";
const META_ADS_ACCOUNT_ID = (process.env.META_ADS_ACCOUNT_ID || "").replace(/^act_/i, "").replace(/\D/g, "");
const META_ADS_ACCESS_TOKEN = process.env.META_ADS_ACCESS_TOKEN || "";
const META_ADS_CONVERSION_ACTIONS = (process.env.META_ADS_CONVERSION_ACTIONS || "purchase,omni_purchase,offsite_conversion.fb_pixel_purchase")
  .split(",")
  .map((action) => action.trim())
  .filter(Boolean);
const VETOR_TRADE_API_URL = (process.env.VETOR_TRADE_API_URL || "").replace(/\/$/, "");
const VETOR_TRADE_SHARED_TOKEN = process.env.VETOR_TRADE_SHARED_TOKEN || "";
const TV_MESSAGES_SHEET = process.env.GOOGLE_TV_MESSAGES_SHEET || "Mensagens_TV";
const TV_MESSAGES_HEADERS = ["Criado Em", "Mensagem", "Valida Ate", "Status"];

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
let metaAdsCache = { expiresAt: 0, key: "", payload: null };
let tvMessagesSheetReady = false;

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

function sheetRange(range) {
  return encodeURIComponent(range);
}

async function sheetsRequest(pathname, options = {}, scope = "https://www.googleapis.com/auth/spreadsheets") {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID nao configurado");
  return sheetsRequestForSpreadsheet(SHEET_ID, pathname, options, scope);
}

async function sheetsRequestForSpreadsheet(sheetId, pathname, options = {}, scope = "https://www.googleapis.com/auth/spreadsheets") {
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID nao configurado");
  const token = await getAccessToken(scope);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets request failed: ${response.status} ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function todayIsoSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function nowLabelSaoPaulo() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function normalizeIsoDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return "";
}

function formatIsoDateBr(value) {
  const iso = normalizeIsoDate(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function isMissingSheetError(error) {
  return /Unable to parse range|not found|Cannot find/i.test(String(error?.message || ""));
}

function tvMessageErrorMessage(error) {
  const message = String(error?.message || error || "");
  if (/403|PERMISSION_DENIED|insufficient|The caller does not have permission/i.test(message)) {
    return "Sem permissao para gravar na planilha. Compartilhe a planilha com a service account como Editor e tente novamente.";
  }
  if (isMissingSheetError(error)) {
    return `A aba ${TV_MESSAGES_SHEET} nao foi encontrada e nao foi possivel criar automaticamente. Crie a aba ou libere permissao de editor para a service account.`;
  }
  if (/invalid|invalido|vazia|Payload/i.test(message)) return message;
  return message || "Falha interna ao publicar mensagem.";
}

async function ensureTvMessagesSheet() {
  if (tvMessagesSheetReady) return;

  const workbook = await sheetsRequest("?fields=sheets.properties.title", {}, "https://www.googleapis.com/auth/spreadsheets.readonly");
  const exists = (workbook.sheets || []).some((sheet) => sheet.properties?.title === TV_MESSAGES_SHEET);

  if (!exists) {
    await sheetsRequest(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: TV_MESSAGES_SHEET } } }]
      })
    });
  }

  await sheetsRequest(`/values/${sheetRange(`${TV_MESSAGES_SHEET}!A1:D1`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [TV_MESSAGES_HEADERS] })
  });

  tvMessagesSheetReady = true;
}

async function readTvMessages(includeExpired = false) {
  let rows = [];
  try {
    rows = await getSheetValues(`${TV_MESSAGES_SHEET}!A2:D`, SHEET_ID);
  } catch (error) {
    if (isMissingSheetError(error)) return [];
    throw error;
  }

  const today = todayIsoSaoPaulo();
  return rows
    .map((row, index) => {
      const message = String(row[1] || "").trim();
      const expiresAt = normalizeIsoDate(row[2]);
      const status = String(row[3] || "Ativa").trim() || "Ativa";
      const active = Boolean(message) && status.toLowerCase() !== "inativa" && (!expiresAt || expiresAt >= today);
      return {
        id: index + 2,
        createdAt: row[0] || "",
        message,
        expiresAt,
        expiresAtLabel: formatIsoDateBr(expiresAt),
        status,
        active
      };
    })
    .filter((item) => item.message && (includeExpired || item.active));
}

async function appendTvMessage(message, expiresAt) {
  const cleanMessage = String(message || "").replace(/\s+/g, " ").trim();
  if (!cleanMessage) throw new Error("Mensagem vazia");
  if (cleanMessage.length > 180) throw new Error("Mensagem deve ter ate 180 caracteres");

  await ensureTvMessagesSheet();
  await sheetsRequest(`/values/${sheetRange(`${TV_MESSAGES_SHEET}!A:D`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({
      values: [[nowLabelSaoPaulo(), cleanMessage, normalizeIsoDate(expiresAt), "Ativa"]]
    })
  });

  return readTvMessages(true);
}

function readJsonBody(req, maxBytes = 20000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Payload muito grande"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("JSON invalido"));
      }
    });
    req.on("error", reject);
  });
}

function readBinaryBody(req, maxBytes = OPINION_UPLOAD_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        reject(new Error("A foto ultrapassa o limite de 4 MB apos a preparacao."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
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
  const endpoint = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`;
  const request = async (loginCustomerId = GOOGLE_ADS_LOGIN_CUSTOMER_ID) => {
    const headers = {
      authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
      "content-type": "application/json"
    };
    if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
    return fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query })
    });
  };

  let response = await request();
  let payload = await response.json().catch(() => ({}));
  if (!response.ok && GOOGLE_ADS_LOGIN_CUSTOMER_ID && googleAdsPermissionDenied(payload)) {
    response = await request("");
    payload = await response.json().catch(() => ({}));
  }

  if (!response.ok) {
    throw new Error(`Google Ads request failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return Array.isArray(payload) ? payload.flatMap((chunk) => chunk.results || []) : [];
}

function googleAdsPermissionDenied(payload) {
  const text = JSON.stringify(payload || {});
  return /USER_PERMISSION_DENIED|PERMISSION_DENIED/i.test(text);
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

function metaAdsConfigured() {
  return Boolean(META_ADS_ACCOUNT_ID && META_ADS_ACCESS_TOKEN);
}

function metaAdsMetricNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function metaAdsActionTotal(actions = [], actionTypes = META_ADS_CONVERSION_ACTIONS) {
  const allowed = new Set(actionTypes.map((action) => marketComparable(action)));
  const values = (actions || []).reduce((items, action) => {
    const type = marketComparable(action.action_type || action.actionType || "");
    if (!allowed.has(type)) return items;
    const value = metaAdsMetricNumber(action.value);
    if (value > 0) items.push(value);
    return items;
  }, []);
  return values.length ? Math.max(...values) : 0;
}

function normalizeMetaAdsInsight(row = {}) {
  const spend = metaAdsMetricNumber(row.spend);
  const clicks = metaAdsMetricNumber(row.clicks);
  const impressions = metaAdsMetricNumber(row.impressions);
  const conversions = metaAdsActionTotal(row.actions || []);
  const conversionValue = metaAdsActionTotal(row.action_values || []);
  const id = String(row.ad_id || row.campaign_id || row.account_id || "");
  const locationLabel = String(row.region || row.country || row.publisher_platform || row.platform_position || "");
  const label = String(row.ad_name || row.campaign_name || row.account_name || locationLabel || "Meta Ads");
  return {
    id,
    label,
    campaign: String(row.campaign_name || ""),
    adSet: String(row.adset_name || ""),
    region: String(row.region || ""),
    country: String(row.country || ""),
    spend: marketRound(spend, 2),
    clicks: Math.round(clicks),
    impressions: Math.round(impressions),
    conversions: marketRound(conversions, 2),
    conversionValue: marketRound(conversionValue, 2),
    costPerClick: marketRound(marketSafeDiv(spend, clicks), 2),
    costPerConversion: marketRound(marketSafeDiv(spend, conversions), 2),
    roas: marketRound(marketSafeDiv(conversionValue, spend), 2)
  };
}

async function metaAdsInsightsRequest(params = {}) {
  const url = new URL(`https://graph.facebook.com/${META_ADS_API_VERSION}/act_${META_ADS_ACCOUNT_ID}/insights`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  url.searchParams.set("access_token", META_ADS_ACCESS_TOKEN);

  const allRows = [];
  let nextUrl = url.toString();
  while (nextUrl) {
    const response = await fetch(nextUrl);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Meta Ads request failed: ${response.status} ${JSON.stringify(payload)}`);
    }
    allRows.push(...(payload.data || []));
    nextUrl = payload.paging?.next || "";
  }
  return allRows;
}

async function loadMetaAdsMetrics(period = {}) {
  const dateRange = period.startDate && period.endDate
    ? { month: period.month || "custom", startDate: period.startDate, endDate: period.endDate }
    : marketDateRangeForMonth(period.month);
  const { month, startDate, endDate } = dateRange;
  const cacheKey = JSON.stringify({
    month,
    startDate,
    endDate,
    accountId: META_ADS_ACCOUNT_ID,
    version: META_ADS_API_VERSION,
    actions: META_ADS_CONVERSION_ACTIONS
  });
  if (metaAdsCache.key === cacheKey && metaAdsCache.payload && Date.now() < metaAdsCache.expiresAt) {
    return metaAdsCache.payload;
  }

  if (!metaAdsConfigured()) {
    return {
      configured: false,
      source: "empty",
      campaigns: [],
      ads: [],
      locations: [],
      summary: { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 }
    };
  }

  try {
    const campaignFields = [
      "campaign_id",
      "campaign_name",
      "spend",
      "clicks",
      "impressions",
      "actions",
      "action_values"
    ].join(",");
    const adFields = [
      "campaign_name",
      "adset_name",
      "ad_id",
      "ad_name",
      "spend",
      "clicks",
      "impressions",
      "actions",
      "action_values"
    ].join(",");
    const locationFields = [
      "account_id",
      "account_name",
      "spend",
      "clicks",
      "impressions",
      "actions",
      "action_values"
    ].join(",");
    const timeRange = JSON.stringify({ since: startDate, until: endDate });
    const [campaignRows, adRows, locationRows] = await Promise.all([
      metaAdsInsightsRequest({
        level: "campaign",
        fields: campaignFields,
        time_range: timeRange,
        limit: "500"
      }),
      metaAdsInsightsRequest({
        level: "ad",
        fields: adFields,
        time_range: timeRange,
        limit: "500"
      }).catch(() => []),
      metaAdsInsightsRequest({
        level: "account",
        fields: locationFields,
        breakdowns: "region",
        time_range: timeRange,
        limit: "500"
      }).catch(() => [])
    ]);
    const campaigns = campaignRows
      .map(normalizeMetaAdsInsight)
      .filter((row) => row.spend || row.clicks || row.impressions || row.conversions || row.conversionValue)
      .sort((a, b) => b.spend - a.spend);
    const ads = adRows
      .map(normalizeMetaAdsInsight)
      .filter((row) => row.spend || row.clicks || row.impressions || row.conversions || row.conversionValue)
      .sort((a, b) => b.spend - a.spend);
    const locations = locationRows
      .map(normalizeMetaAdsInsight)
      .map((row) => ({
        ...row,
        label: row.region || row.country || row.label || "Não informado"
      }))
      .filter((row) => row.spend || row.clicks || row.impressions || row.conversions || row.conversionValue)
      .sort((a, b) => b.clicks - a.clicks || b.spend - a.spend);
    const summary = {
      spend: marketRound(campaigns.reduce((total, row) => total + row.spend, 0), 2),
      clicks: campaigns.reduce((total, row) => total + row.clicks, 0),
      impressions: campaigns.reduce((total, row) => total + row.impressions, 0),
      conversions: marketRound(campaigns.reduce((total, row) => total + row.conversions, 0), 2),
      conversionValue: marketRound(campaigns.reduce((total, row) => total + row.conversionValue, 0), 2)
    };
    const payload = {
      configured: true,
      source: "meta_ads_api",
      apiVersion: META_ADS_API_VERSION,
      accountId: META_ADS_ACCOUNT_ID,
      conversionActions: META_ADS_CONVERSION_ACTIONS,
      period: { month, startDate, endDate },
      campaigns,
      ads,
      locations,
      summary
    };
    metaAdsCache = { key: cacheKey, payload, expiresAt: Date.now() + CACHE_TTL_MS };
    return payload;
  } catch (error) {
    return {
      configured: true,
      source: "error",
      error: error.message,
      apiVersion: META_ADS_API_VERSION,
      accountId: META_ADS_ACCOUNT_ID,
      campaigns: [],
      ads: [],
      locations: [],
      summary: { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 }
    };
  }
}

function combineMetaAdsRows(rows = []) {
  return combineGoogleAdsRows(rows, (row) => row.label || row.id || "");
}

function combineMetaAdsAdRows(rows = []) {
  return combineGoogleAdsRows(rows, (row) => `${row.label || row.id || ""}|${row.campaign || ""}|${row.adSet || ""}`);
}

function combineMetaAdsLocationRows(rows = []) {
  return combineGoogleAdsRows(rows, (row) => `${row.label || ""}|${row.region || ""}|${row.country || ""}`);
}

async function loadMetaAdsMetricsForMonths(months = []) {
  const selectedMonths = normalizeMarketMonthList(months);
  if (!selectedMonths.length) return loadMetaAdsMetrics({});
  if (selectedMonths.length === 1) return loadMetaAdsMetrics({ month: selectedMonths[0] });

  if (areContiguousMonths(selectedMonths)) {
    const startMonth = [...selectedMonths].sort((a, b) => a.localeCompare(b))[0];
    const endMonth = [...selectedMonths].sort((a, b) => b.localeCompare(a))[0];
    const payload = await loadMetaAdsMetrics({
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

  const payloads = await Promise.all(selectedMonths.map((month) => loadMetaAdsMetrics({ month })));
  const campaigns = combineMetaAdsRows(payloads.flatMap((payload) => payload.campaigns || []));
  const ads = combineMetaAdsAdRows(payloads.flatMap((payload) => payload.ads || []));
  const locations = combineMetaAdsLocationRows(payloads.flatMap((payload) => payload.locations || []));
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
    source: payloads.find((payload) => payload.source === "meta_ads_api") ? "meta_ads_api" : (payloads[0]?.source || "empty"),
    apiVersion: META_ADS_API_VERSION,
    accountId: META_ADS_ACCOUNT_ID,
    period: {
      months: selectedMonths,
      startDate: `${startMonth}-01`,
      endDate: `${endMonth}-${String(daysInMonth(endMonth)).padStart(2, "0")}`
    },
    campaigns,
    ads,
    locations,
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
  const paymentMethod = String(item["Forma Pagto"] || item["Forma Pagamento"] || "").trim();
  const installments = String(item["Parcelas"] || "").trim();
  const status = String(item["Status"] || "").trim() || "Confirmada";
  const notes = String(item["Observacoes"] || item["Observações"] || item["Observacao"] || item["Observação"] || "").trim();
  const checkin = String(item["Checkin"] || item["Check-in"] || "").trim();
  const checkout = String(item["Checkout"] || item["Check-out"] || "").trim();
  const days = String(item["Diar"] || item["Diarias"] || item["Diárias"] || "").trim();
  const uh = String(item["UH's"] || item["UHs"] || item["UH"] || "").trim();
  const adults = String(item["Adult"] || item["Adultos"] || "").trim();
  const children = String(item["Crian"] || item["Criancas"] || item["Crianças"] || "").trim();

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
    checkin,
    checkout,
    days,
    uh,
    adults,
    children,
    status,
    paymentMethod,
    installments,
    notes,
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

function daysBetweenDateKeys(startKey, endKey) {
  const start = String(startKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const end = String(endKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!start || !end) return null;

  const startTime = Date.UTC(Number(start[1]), Number(start[2]) - 1, Number(start[3]));
  const endTime = Date.UTC(Number(end[1]), Number(end[2]) - 1, Number(end[3]));
  return Math.round((endTime - startTime) / 86400000);
}

function buildAdvancePurchase(records) {
  const bands = [
    { key: "veryShort", label: "Muito Curto Prazo", range: "0 a 7 dias", minDays: 0, maxDays: 7 },
    { key: "short", label: "Curto Prazo", range: "8 a 30 dias", minDays: 8, maxDays: 30 },
    { key: "medium", label: "Médio Prazo", range: "31 a 60 dias", minDays: 31, maxDays: 60 },
    { key: "long", label: "Longo Prazo", range: "61 a 89 dias", minDays: 61, maxDays: 89 },
    { key: "superLong", label: "Super Longo Prazo", range: "90 a 180 dias", minDays: 90, maxDays: 180 },
    { key: "megaLong", label: "Mega Longo Prazo", range: "Mais de 180 dias", minDays: 181, maxDays: Infinity }
  ].map((band) => ({ ...band, reservations: 0, revenue: 0 }));

  records.forEach((record) => {
    const checkinDate = parseDate(record.checkin);
    const checkinKey = checkinDate ? dateKey(checkinDate) : "";
    const advanceDays = daysBetweenDateKeys(record.dateKey, checkinKey);
    if (advanceDays === null || advanceDays < 0) return;

    const band = bands.find((item) => advanceDays >= item.minDays && advanceDays <= item.maxDays);
    if (!band) return;
    band.reservations += 1;
    band.revenue += record.total;
  });

  const totalReservations = sum(bands, (band) => band.reservations);
  const totalRevenue = sum(bands, (band) => band.revenue);
  return {
    totalReservations,
    totalRevenue,
    bands: bands.map(({ minDays, maxDays, ...band }) => ({
      ...band,
      sharePct: totalRevenue ? Math.round((band.revenue / totalRevenue) * 1000) / 10 : 0
    }))
  };
}

function uniqueSummary(rows, getter) {
  const values = Array.from(new Set(
    rows
      .map((row) => String(getter(row) || "").trim())
      .filter(Boolean)
  ));
  return values.join("; ");
}

function salesDetailRow(record, channelLabelForRecord) {
  return {
    dataVenda: record.dateKey,
    codigoReserva: record.reservationCode,
    hotel: record.hotel,
    canal: channelLabelForRecord(record),
    vendedor: record.seller,
    cliente: record.customer,
    checkin: record.checkin,
    checkout: record.checkout,
    diarias: record.days,
    uh: record.uh,
    adultos: record.adults,
    criancas: record.children,
    valorTotal: record.total,
    recebido: record.received,
    aReceber: record.remaining,
    formaPagamento: record.paymentMethod,
    parcelas: record.installments,
    status: record.status,
    observacoes: record.notes
  };
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

function businessDaysRemaining(month, key) {
  const [year, monthNumber] = month.split("-").map(Number);
  const selectedDay = Number(String(key || "").slice(8, 10));
  if (!year || !monthNumber || !selectedDay) return businessDaysInMonth(month);
  const totalDays = daysInMonth(month);
  const startDay = Math.min(Math.max(selectedDay, 1), totalDays);
  let businessDays = 0;
  for (let day = startDay; day <= totalDays; day += 1) {
    const weekday = new Date(year, monthNumber - 1, day).getDay();
    if (weekday !== 0) businessDays += 1;
  }
  return Math.max(1, businessDays);
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

function isImportedSiteSale(record) {
  return !record.seller
    && comparableKey(record.source) === comparableKey("Site")
    && comparableKey(record.channel) === comparableKey("SITE");
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
  const summaryRecords = comparableKey(selectedChannel) === comparableKey("SITE")
    ? filteredRecords
    : filteredRecords.filter((record) => !isImportedSiteSale(record));
  const todayRecords = summaryRecords.filter((record) => record.dateKey === today);
  const selectedSummaryDayRecords = selectedDay ? summaryRecords : todayRecords;
  const monthToDateRecords = summaryRecords.filter((record) => isOnOrBeforeDateKey(record, goalDate));
  const managerTodayRecords = filteredRecords.filter((record) => record.dateKey === today);
  const selectedManagerDayRecords = selectedDay ? filteredRecords : managerTodayRecords;
  const managerMonthToDateRecords = filteredRecords.filter((record) => isOnOrBeforeDateKey(record, goalDate));
  const workdaysInMonth = isYearToDate ? businessDaysElapsed(activeMonth, goalDate) : businessDaysInMonth(month);
  const workdaysElapsed = isYearToDate ? workdaysInMonth : businessDaysElapsed(month, goalDate);
  const workdaysRemaining = isYearToDate ? 1 : businessDaysRemaining(month, goalDate);

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
      const beforeGoalDateRecords = sellerRecords.filter((record) => record.dateKey && goalDate && record.dateKey < goalDate);
      const goal = isYearToDate
        ? ytdGoal(goals, (item) => comparableKey(item.seller) === comparableKey(seller), ytdMonths)
        : sellerGoal(goals, seller, month, goalDate);
      const dayRevenue = sum(dayRecords, (record) => record.total);
      const mtdRevenue = sum(mtdRecords, (record) => record.total);
      const salesBeforeGoalDate = sum(beforeGoalDateRecords, (record) => record.total);
      const monthRevenue = mtdRevenue;
      const monthlyGoal = goal?.revenueGoal || 0;
      const baseDailyGoal = monthlyGoal ? monthlyGoal / workdaysInMonth : 0;
      const dailyGoal = isYearToDate
        ? baseDailyGoal
        : Math.max(0, monthlyGoal - salesBeforeGoalDate) / workdaysRemaining;
      const mtdGoal = baseDailyGoal * workdaysElapsed;

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
  const teamSummarySeller = sellers.find((seller) => isTeamCardName(seller.name));

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
  const selectedChannelMetrics = selectedChannel
    ? channels.find((channel) => comparableKey(channel.label) === comparableKey(selectedChannel))
    : null;
  const siteChannelMetrics = channels.find((channel) => comparableKey(channel.label) === comparableKey("SITE"));
  const managerMonthlyGoal = selectedChannel
    ? selectedChannelMetrics?.monthlyGoal || 0
    : (teamSummarySeller?.monthlyGoal || 0) + (siteChannelMetrics?.monthlyGoal || 0);

  const hotelLabels = new Set([
    ...filteredRecords.map((record) => record.hotel).filter(Boolean),
    ...goals.filter((goal) => ytdMonths.includes(goal.month) && goal.hotel).map((goal) => goal.hotel)
  ]);

  // Hotel performance combines team and imported Site sales. Team summaries and
  // seller rankings continue to use summaryRecords, which excludes Site sales.
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

  const dailySales = [...groupBy(summaryRecords, (record) => record.dateKey).entries()]
    .map(([date, rows]) => ({
      date,
      sales: sum(rows, (record) => record.total),
      received: sum(rows, (record) => record.received),
      remaining: sum(rows, (record) => record.remaining),
      reservations: rows.length,
      paymentMethods: uniqueSummary(rows, (record) => record.paymentMethod),
      installments: uniqueSummary(rows, (record) => record.installments),
      statuses: uniqueSummary(rows, (record) => record.status),
      notes: uniqueSummary(rows, (record) => record.notes)
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const detailedSales = filteredRecords
    .slice()
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.reservationCode.localeCompare(b.reservationCode))
    .map((record) => salesDetailRow(record, channelLabelForRecord));
  const advancePurchaseWithoutGroups = filteredRecords.filter((record) => (
    comparableKey(channelLabelForRecord(record)) !== comparableKey("GRUPOS")
  ));

  return {
    generatedAt: new Date().toISOString(),
    period: { today, month, day: selectedDay, hotel: selectedHotel, channel: selectedChannel },
    filters: {
      selectedDay,
      selectedHotel,
      selectedChannel,
      days: sortLabels(new Set(monthRecords.map((record) => record.dateKey))),
      hotels: sortLabels(new Set(monthRecords.map((record) => record.hotel))),
      channels: [...OFFICIAL_SALES_CHANNELS, "Robo"]
    },
    summary: {
      salesToday: sum(selectedSummaryDayRecords, (record) => record.total),
      salesMtd: sum(monthToDateRecords, (record) => record.total),
      salesMonth: sum(summaryRecords, (record) => record.total),
      receivedMonth: sum(summaryRecords, (record) => record.received),
      remainingMonth: sum(summaryRecords, (record) => record.remaining),
      reservationsToday: selectedSummaryDayRecords.length,
      reservationsMonth: summaryRecords.length,
      dailyGoal: teamSummarySeller?.dailyGoal || 0,
      monthlyGoal: teamSummarySeller?.monthlyGoal || 0,
      ticketAverageMonth: summaryRecords.length ? sum(summaryRecords, (record) => record.total) / summaryRecords.length : 0
    },
    managerSummary: {
      salesToday: sum(selectedManagerDayRecords, (record) => record.total),
      salesMtd: sum(managerMonthToDateRecords, (record) => record.total),
      salesMonth: sum(filteredRecords, (record) => record.total),
      receivedMonth: sum(filteredRecords, (record) => record.received),
      remainingMonth: sum(filteredRecords, (record) => record.remaining),
      reservationsToday: selectedManagerDayRecords.length,
      reservationsMonth: filteredRecords.length,
      dailyGoal: teamSummarySeller?.dailyGoal || 0,
      monthlyGoal: managerMonthlyGoal,
      ticketAverageMonth: filteredRecords.length ? sum(filteredRecords, (record) => record.total) / filteredRecords.length : 0
    },
    sellers,
    channels,
    hotels,
    advancePurchase: {
      withGroups: buildAdvancePurchase(filteredRecords),
      withoutGroups: buildAdvancePurchase(advancePurchaseWithoutGroups)
    },
    dailySales,
    detailedSales
  };
}

function buildManagerPayload(metrics) {
  return {
    audience: "gestores",
    generatedAt: metrics.generatedAt,
    period: metrics.period,
    summary: metrics.managerSummary || metrics.summary,
    filters: metrics.filters,
    sellers: metrics.sellers,
    strategicChannels: metrics.sellers.filter((seller) => (
      STRATEGIC_CHANNEL_SELLERS.includes(seller.name) &&
      comparableKey(seller.name) !== comparableKey("Robo")
    )),
    channels: metrics.channels,
    hotels: metrics.hotels,
    advancePurchase: metrics.advancePurchase,
    dailySales: metrics.dailySales,
    detailedSales: metrics.detailedSales,
    analytics: metrics.analytics || null
  };
}

function buildSellersPayload(metrics) {
  const teamSeller = (metrics.sellers || []).find((seller) => seller.name === TEAM_CARD_DISPLAY_NAME);
  return {
    audience: "vendedores",
    generatedAt: metrics.generatedAt,
    period: metrics.period,
    summary: {
      salesToday: metrics.summary.salesToday,
      salesMonth: metrics.summary.salesMonth,
      receivedMonth: metrics.summary.receivedMonth,
      remainingMonth: metrics.summary.remainingMonth,
      reservationsToday: metrics.summary.reservationsToday,
      reservationsMonth: metrics.summary.reservationsMonth,
      dailyGoal: teamSeller?.dailyGoal || 0,
      monthlyGoal: teamSeller?.monthlyGoal || 0
    },
    sellers: (metrics.sellers || [])
      .filter((seller) => !STRATEGIC_CHANNEL_SELLERS.includes(seller.name))
      .map((seller) => ({
        name: seller.name,
        reservationsMonth: seller.reservationsMonth,
        salesMonth: seller.salesMonth,
        dailyGoal: seller.dailyGoal,
        monthlyGoal: seller.monthlyGoal,
        projectionPct: seller.mtdGoalPct,
        monthlyGoalPct: seller.monthlyGoalPct
      }))
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
  { key: "generalImpression", headers: ["Impressao Geral"], block: "Geral" },
  { key: "reservation", headers: ["Reserva"], block: "Geral" },
  { key: "foodBreakfast", headers: ["Alimentos Cafe da Manha", "Cafe da manha"], block: "Alimentos" },
  { key: "foodLunch", headers: ["Alimentos Almoco", "Almoco"], block: "Alimentos" },
  { key: "foodDinner", headers: ["Alimentos Jantar", "Jantar"], block: "Alimentos" },
  { key: "teamService", headers: ["Atendimento da equipe"], block: "Atendimento" },
  { key: "beachClub", headers: ["Atendimento da equipe do Beach Club"], block: "Atendimento" },
  { key: "roomCleaning", headers: ["Limpeza do quarto"], block: "Apartamento" },
  { key: "roomComfort", headers: ["Conforto do quarto"], block: "Apartamento" },
  { key: "frontDesk", headers: ["Recepcao / Check-in / Check-out"], block: "Serviços" },
  { key: "wifi", headers: ["Qualidade do Wi-fi"], block: "Serviços" },
  { key: "pool", headers: ["Area de lazer / piscina"], block: "Serviços" }
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
const OPERATIONAL_HOTELS_BY_SLUG = {
  "sueds-cabralia": "SUEDS CABRALIA",
  "sueds-segundo-sol": "SUEDS SEGUNDO SOL",
  "sueds-plaza": "SUEDS PLAZA",
  "sueds-premium": "SUEDS PREMIUM",
  "sueds-trancoso": "SUEDS TRANCOSO",
  "casas-sueds-arraial": "CASAS SUEDS ARRAIAL"
};

const OPINION_SUBMISSION_HEADERS = [
  "ID Arquivo",
  "Data Processamento",
  "Hotel",
  "Nome Arquivo",
  "Link Foto",
  "Origem",
  "Hotel Slug",
  "Form Version",
  "Idioma",
  "Nome Hospede",
  "Apartamento",
  "Data Entrada",
  "Data Saida",
  "Impressao Geral",
  "Reserva",
  "Recepcao / Check-in / Check-out",
  "Atendimento da equipe",
  "Conforto do quarto",
  "Limpeza do quarto",
  "Qualidade do Wi-fi",
  "Area de lazer / piscina",
  "Atendimento da equipe do Beach Club",
  "Alimentos Cafe da Manha",
  "Alimentos Almoco",
  "Alimentos Jantar",
  "Comentarios",
  "Destaques",
  "Problemas Identificados",
  "Nota Calculada %",
  "Confianca %",
  "Status",
  "Responsavel Revisao",
  "Observacao Revisao",
  "Data Revisao"
];

const OPINION_FORM_HOTELS = {
  "sueds-cabralia": { hotel: "SUEDS CABRALIA" },
  "sueds-segundo-sol": { hotel: "SUEDS SEGUNDO SOL" },
  "sueds-plaza": { hotel: "SUEDS PLAZA" },
  "sueds-premium": { hotel: "SUEDS PREMIUM" },
  "sueds-trancoso": { hotel: "SUEDS TRANCOSO" },
  "casas-sueds-arraial": { hotel: "CASAS SUEDS ARRAIAL" }
};
const OPINION_ACTIVE_FORM_SLUGS = new Set(["sueds-plaza"]);
const OPINION_MIN_FORM_VERSION = "20260719";

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
    fieldScores[field.key] = ratingScore(firstFilledValue(item, field.headers));
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
    checkIn: String(item["Data Entrada"] || "").trim(),
    checkOut: String(item["Data Saida"] || "").trim(),
    comments: String(item.Comentarios || "").trim(),
    highlights: String(item.Destaques || "").trim(),
    issues: String(item["Problemas Identificados"] || "").trim(),
    status: String(item.Status || "").trim(),
    confidence: parseDecimalNumber(item["Confianca %"]),
    origin: String(item.Origem || "").trim(),
    formVersion: String(item["Form Version"] || "").trim(),
    fieldScores
  };
}

function isCurrentOperationalOpinion(opinion) {
  const version = String(opinion.formVersion || "").replace(/\D/g, "");
  if (!version) return false;
  const status = normalizeTextKey(opinion.status);
  const approved = status === "aprovado" || status === "digital";
  return approved && version >= OPINION_MIN_FORM_VERSION;
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

const PLAZA_OMR_RATING_OPTIONS = ["Excelente", "Muito bom", "Bom", "Regular"];
const PLAZA_OMR_FIELDS = [
  ["generalImpression", "Impressao Geral"],
  ["reservation", "Reserva"],
  ["frontDesk", "Recepcao / Check-in / Check-out"],
  ["teamService", "Atendimento da equipe"],
  ["roomComfort", "Conforto do quarto"],
  ["roomCleaning", "Limpeza do quarto"],
  ["wifi", "Qualidade do Wi-fi"],
  ["pool", "Area de lazer / piscina"],
  ["beachClub", "Atendimento da equipe do Beach Club"],
  ["foodBreakfast", "Alimentos Cafe da Manha"],
  ["foodLunch", "Alimentos Almoco"],
  ["foodDinner", "Alimentos Jantar"]
];

const PLAZA_OMR_TEMPLATE = {
  columns: [0.607, 0.724, 0.836, 0.933],
  rows: [0.168, 0.229, 0.296, 0.339, 0.381, 0.424, 0.466, 0.509, 0.552, 0.636, 0.680, 0.721]
};
const PLAZA_OMR_GUIDE_TEMPLATE = {
  columns: [0.584, 0.711, 0.838, 0.965],
  rows: [0.149, 0.214, 0.283, 0.328, 0.373, 0.418, 0.463, 0.507, 0.552, 0.614, 0.659, 0.700]
};

function hasOmrAccess(req, url) {
  if (!OPINION_OMR_TOKEN) return true;
  const provided = getHeader(req, "x-omr-token") || getHeader(req, "authorization").replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
  if (!provided) return false;
  const expectedBuffer = Buffer.from(OPINION_OMR_TOKEN);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function hasOpinionUploadAccess(req, url) {
  if (!OPINION_UPLOAD_TOKEN) return false;
  const provided = getHeader(req, "x-upload-token") || getHeader(req, "authorization").replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
  if (provided && safeEqualText(OPINION_UPLOAD_TOKEN, provided)) return true;
  return isValidOpinionUploadSession(readCookie(req, "sueds_opinion_upload"));
}

function safeEqualText(expected, provided) {
  const expectedBuffer = Buffer.from(String(expected || ""));
  const providedBuffer = Buffer.from(String(provided || ""));
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function readCookie(req, name) {
  const cookieHeader = getHeader(req, "cookie");
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return "";
}

function createOpinionUploadSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + OPINION_UPLOAD_SESSION_TTL_SECONDS;
  const payload = `v1.${expiresAt}.${crypto.randomBytes(12).toString("hex")}`;
  const signature = crypto.createHmac("sha256", OPINION_UPLOAD_TOKEN).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function isValidOpinionUploadSession(session) {
  const parts = String(session || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^\d+$/.test(parts[1]) || !/^[a-f0-9]{24}$/.test(parts[2])) return false;
  const expiresAt = Number(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt <= now || expiresAt > now + OPINION_UPLOAD_SESSION_TTL_SECONDS + 60) return false;
  const payload = parts.slice(0, 3).join(".");
  const expected = crypto.createHmac("sha256", OPINION_UPLOAD_TOKEN).update(payload).digest("base64url");
  return safeEqualText(expected, parts[3]);
}

function setOpinionUploadSessionCookie(req, res) {
  const secure = getHeader(req, "x-forwarded-proto").toLowerCase() === "https" ? "; Secure" : "";
  res.setHeader(
    "set-cookie",
    `sueds_opinion_upload=${createOpinionUploadSession()}; Max-Age=${OPINION_UPLOAD_SESSION_TTL_SECONDS}; Path=/api/operacional/opinarios-upload; HttpOnly; SameSite=Strict${secure}`
  );
}

function safeDecodedHeader(req, name, maxLength = 120) {
  const raw = String(getHeader(req, name) || "").slice(0, maxLength * 3);
  try {
    return decodeURIComponent(raw).replace(/[\r\n\0]/g, " ").trim().slice(0, maxLength);
  } catch (error) {
    return raw.replace(/[\r\n\0]/g, " ").trim().slice(0, maxLength);
  }
}

function safeOpinionUploadId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(id) ? id : crypto.randomBytes(12).toString("hex");
}

function opinionUploadTimestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}_${value.hour}${value.minute}${value.second}`;
}

function driveQueryValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findUploadedOpinionPhoto(folderId, uploadId, token) {
  const query = `'${driveQueryValue(folderId)}' in parents and trashed = false and appProperties has { key='uploadId' and value='${driveQueryValue(uploadId)}' }`;
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "files(id,name,webViewLink,size,createdTime)");
  url.searchParams.set("pageSize", "1");
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao verificar o envio no Google Drive: ${response.status} ${text}`);
  }
  const payload = await response.json();
  return payload.files?.[0] || null;
}

async function uploadOpinionPhotoViaAppsScript(details, buffer) {
  const response = await fetch(OPINION_APPS_SCRIPT_UPLOAD_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: OPINION_UPLOAD_TOKEN,
      ...details,
      imageBase64: buffer.toString("base64")
    })
  });
  const responseText = await response.text();
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`Apps Script retornou uma resposta invalida: HTTP ${response.status}.`);
  }
  if (!response.ok || !payload.ok || !payload.photo) {
    throw new Error(payload.message || `Falha no Apps Script: HTTP ${response.status}.`);
  }
  return payload.photo;
}

async function uploadOpinionPhoto(req, buffer) {
  if (!buffer.length) throw new Error("A foto recebida esta vazia.");
  const hotelSlug = String(getHeader(req, "x-hotel-slug") || "sueds-plaza").trim().toLowerCase();
  const folderId = OPINION_UPLOAD_FOLDERS[hotelSlug];
  if (!folderId) throw new Error("Hotel ainda nao configurado para envio de opinarios.");

  const mimeType = String(getHeader(req, "content-type") || "").split(";")[0].trim().toLowerCase();
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(mimeType)) throw new Error("Formato de foto nao aceito. Use JPG, PNG ou WEBP.");

  const uploadId = safeOpinionUploadId(getHeader(req, "x-upload-id"));
  const originalName = safeDecodedHeader(req, "x-file-name", 160) || "foto-opinario";
  const uploader = safeDecodedHeader(req, "x-uploader", 80);
  const periodFrom = safeDecodedHeader(req, "x-period-from", 10);
  const periodTo = safeDecodedHeader(req, "x-period-to", 10);
  if (OPINION_APPS_SCRIPT_UPLOAD_URL) {
    return uploadOpinionPhotoViaAppsScript({
      hotelSlug,
      folderId,
      mimeType,
      uploadId,
      originalName,
      uploader,
      periodFrom,
      periodTo
    }, buffer);
  }

  const accessToken = await getAccessToken("https://www.googleapis.com/auth/drive");
  const existing = await findUploadedOpinionPhoto(folderId, uploadId, accessToken);
  if (existing) return { ...existing, duplicate: true, uploadId };

  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const hotelPrefix = hotelSlug.replace(/[^a-z0-9]+/g, "_").toUpperCase();
  const fileName = `${hotelPrefix}_${opinionUploadTimestamp()}_${uploadId.slice(-8)}.${extension}`;
  const metadata = {
    name: fileName,
    parents: [folderId],
    description: [
      `Opinario impresso enviado pela recepcao do ${hotelSlug}.`,
      uploader ? `Responsavel: ${uploader}.` : "",
      periodFrom ? `Periodo informado: ${periodFrom}${periodTo && periodTo !== periodFrom ? ` a ${periodTo}` : ""}.` : "",
      `Arquivo original: ${originalName}.`
    ].filter(Boolean).join(" "),
    appProperties: {
      uploadId,
      hotelSlug,
      source: "reception-upload",
      ...(periodFrom ? { periodFrom } : {}),
      ...(periodTo ? { periodTo } : {})
    }
  };

  const boundary = `sueds_${crypto.randomBytes(16).toString("hex")}`;
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const suffix = Buffer.from(`\r\n--${boundary}--`);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size,createdTime", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": `multipart/related; boundary=${boundary}`
    },
    body: Buffer.concat([prefix, buffer, suffix])
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao gravar a foto no Google Drive: ${response.status} ${text}`);
  }
  return { ...(await response.json()), duplicate: false, uploadId };
}

function imageBufferFromOmrBody(body) {
  const raw = String(body.imageBase64 || body.image || "").trim();
  if (!raw) throw new Error("imageBase64 ausente");
  return Buffer.from(raw.replace(/^data:[^;]+;base64,/, ""), "base64");
}

function detectOmrFormBoxByDarkBounds(gray, width, height) {
  const threshold = 95;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let dark = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = gray[y * width + x];
      if (value < threshold) {
        dark += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!dark || minX >= maxX || minY >= maxY) {
    throw new Error("Nao foi possivel localizar a ficha na foto.");
  }

  const padX = Math.round((maxX - minX) * 0.006);
  const padY = Math.round((maxY - minY) * 0.006);
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(width - 1, maxX + padX);
  maxY = Math.min(height - 1, maxY + padY);

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    darkPixelRatio: dark / (width * height),
    method: "dark-bounds"
  };
}

function findLongOmrLineBands(gray, width, height, axis) {
  const threshold = 110;
  const minRun = Math.round((axis === "horizontal" ? width : height) * 0.48);
  const maxGap = Math.max(6, Math.round((axis === "horizontal" ? width : height) * 0.006));
  const limit = axis === "horizontal" ? height : width;
  const span = axis === "horizontal" ? width : height;
  const bands = [];
  let current = null;

  for (let fixed = 0; fixed < limit; fixed += 1) {
    let bestRun = 0;
    let bestStart = 0;
    let bestEnd = 0;
    let runStart = 0;
    let runLength = 0;
    let gap = 0;

    for (let moving = 0; moving < span; moving += 1) {
      const x = axis === "horizontal" ? moving : fixed;
      const y = axis === "horizontal" ? fixed : moving;
      const dark = gray[y * width + x] < threshold;

      if (dark) {
        if (!runLength) runStart = moving;
        runLength += 1 + gap;
        gap = 0;
      } else if (runLength && gap < maxGap) {
        gap += 1;
      } else {
        if (runLength > bestRun) {
          bestRun = runLength;
          bestStart = runStart;
          bestEnd = moving - gap - 1;
        }
        runLength = 0;
        gap = 0;
      }
    }

    if (runLength > bestRun) {
      bestRun = runLength;
      bestStart = runStart;
      bestEnd = span - gap - 1;
    }

    if (bestRun < minRun) {
      current = null;
      continue;
    }

    const candidate = {
      at: fixed,
      start: Math.max(0, bestStart),
      end: Math.min(span - 1, bestEnd),
      run: bestRun
    };

    if (current && fixed <= current.endAt + 2) {
      current.endAt = fixed;
      if (candidate.run > current.best.run) current.best = candidate;
    } else {
      current = { startAt: fixed, endAt: fixed, best: candidate };
      bands.push(current);
    }
  }

  return bands.map((band) => band.best);
}

function median(values) {
  const sorted = values
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}

function detectOmrFormBoxByLines(gray, width, height) {
  const horizontal = findLongOmrLineBands(gray, width, height, "horizontal");
  if (horizontal.length < 2) return null;

  const topCandidates = horizontal.filter((line) => line.at > height * 0.01 && line.at < height * 0.35);
  const bottomCandidates = horizontal.filter((line) => line.at > height * 0.45 && line.at < height * 0.98);
  const top = (topCandidates[0] || horizontal[0]);
  const bottom = (bottomCandidates[bottomCandidates.length - 1] || horizontal[horizontal.length - 1]);
  if (!top || !bottom || bottom.at - top.at < height * 0.35) return null;

  const candidateLines = horizontal.filter((line) => line.at >= top.at && line.at <= bottom.at);
  let left = Math.max(0, Math.round(median(candidateLines.map((line) => line.start))));
  let right = Math.min(width - 1, Math.round(median(candidateLines.map((line) => line.end))));

  const vertical = findLongOmrLineBands(gray, width, height, "vertical")
    .filter((line) => line.start <= top.at + 10 && line.end >= bottom.at - 10);
  if (vertical.length >= 2) {
    left = vertical[0].at;
    right = vertical[vertical.length - 1].at;
  }

  const boxWidth = right - left + 1;
  const boxHeight = bottom.at - top.at + 1;
  if (boxWidth < width * 0.40 || boxHeight < height * 0.35) return null;

  const padX = Math.round(boxWidth * 0.003);
  const padY = Math.round(boxHeight * 0.003);
  return {
    x: Math.max(0, left - padX),
    y: Math.max(0, top.at - padY),
    width: Math.min(width - 1, right + padX) - Math.max(0, left - padX) + 1,
    height: Math.min(height - 1, bottom.at + padY) - Math.max(0, top.at - padY) + 1,
    darkPixelRatio: null,
    method: "line-bands",
    lineCount: {
      horizontal: horizontal.length,
      vertical: vertical.length
    }
  };
}

function detectOmrFormBox(gray, width, height) {
  return detectOmrFormBoxByLines(gray, width, height) || detectOmrFormBoxByDarkBounds(gray, width, height);
}

function clusterValues(items, valueGetter, tolerance) {
  const sorted = [...items].sort((a, b) => valueGetter(a) - valueGetter(b));
  const clusters = [];

  sorted.forEach((item) => {
    const value = valueGetter(item);
    const current = clusters[clusters.length - 1];
    if (current && Math.abs(value - current.center) <= tolerance) {
      current.items.push(item);
      current.center = current.items.reduce((sum, entry) => sum + valueGetter(entry), 0) / current.items.length;
    } else {
      clusters.push({ center: value, items: [item] });
    }
  });

  return clusters;
}

function buildOmrDarkIntegral(gray, width, height, threshold = 110) {
  const stride = width + 1;
  const integral = new Uint32Array(stride * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowTotal = 0;
    for (let x = 1; x <= width; x += 1) {
      if (gray[(y - 1) * width + x - 1] < threshold) rowTotal += 1;
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowTotal;
    }
  }
  return { data: integral, stride };
}

function omrIntegralSum(integral, minX, minY, maxX, maxY) {
  const { data, stride } = integral;
  return data[maxY * stride + maxX]
    - data[minY * stride + maxX]
    - data[maxY * stride + minX]
    + data[minY * stride + minX];
}

function detectOmrDenseBottomPair(gray, width, height, expectedSize, integral, leftAnchorX, rightAnchorX) {
  if (!expectedSize) return null;
  const windowSize = Math.max(12, Math.round(expectedSize * 0.72));
  const half = Math.floor(windowSize / 2);
  const step = Math.max(2, Math.round(expectedSize * 0.08));

  const bestAtRow = (cy, targetX) => {
    const minCenterX = Math.max(half, targetX - expectedSize * 1.8);
    const maxCenterX = Math.min(width - half, targetX + expectedSize * 1.8);
    const outerHalf = Math.max(half + 2, Math.round(expectedSize * 0.82));
    let best = null;
    for (let cx = Math.round(minCenterX); cx <= Math.round(maxCenterX); cx += step) {
      const minX = Math.max(0, cx - half);
      const maxX = Math.min(width, cx + half + 1);
      const minY = Math.max(0, cy - half);
      const maxY = Math.min(height, cy + half + 1);
      const area = Math.max(1, (maxX - minX) * (maxY - minY));
      const darkPixels = omrIntegralSum(integral, minX, minY, maxX, maxY);
      const density = darkPixels / area;
      const outerMinX = Math.max(0, cx - outerHalf);
      const outerMaxX = Math.min(width, cx + outerHalf + 1);
      const outerMinY = Math.max(0, cy - outerHalf);
      const outerMaxY = Math.min(height, cy + outerHalf + 1);
      const outerArea = Math.max(1, (outerMaxX - outerMinX) * (outerMaxY - outerMinY));
      const ringArea = Math.max(1, outerArea - area);
      const ringDarkPixels = Math.max(
        0,
        omrIntegralSum(integral, outerMinX, outerMinY, outerMaxX, outerMaxY) - darkPixels
      );
      const ringDensity = ringDarkPixels / ringArea;
      const contrast = density - ringDensity;
      const rank = density * 0.65 + contrast * 0.35 - Math.abs(cx - targetX) / width * 0.12;
      if (!best || rank > best.rank) best = { x: cx, y: cy, density, contrast, rank };
    }
    return best;
  };

  let bestPair = null;
  for (let cy = Math.round(height * 0.67); cy <= Math.round(height * 0.92); cy += step) {
    const left = bestAtRow(cy, leftAnchorX);
    const right = bestAtRow(cy, rightAnchorX);
    if (!left || !right) continue;
    const averageRank = (left.rank + right.rank) / 2;
    const rank = Math.min(left.rank, right.rank) * 0.75
      + averageRank * 0.25
      - Math.abs(cy / height - 0.9) * 0.08
      - (Math.abs(left.x - leftAnchorX) + Math.abs(right.x - rightAnchorX)) / width * 0.06;
    if (!bestPair || rank > bestPair.rank) bestPair = { left, right, rank };
  }

  if (
    !bestPair ||
    Math.min(bestPair.left.density, bestPair.right.density) < 0.48 ||
    Math.min(bestPair.left.contrast, bestPair.right.contrast) < 0.12
  ) return null;
  const toMarker = (item, targetX) => ({
    x: item.x,
    y: item.y,
    width: expectedSize,
    height: expectedSize,
    area: Math.round(expectedSize * expectedSize * item.density),
    solidity: item.density,
    score: item.rank,
    cornerDistance: Math.hypot((item.x - targetX) / width, (item.y - height * 0.9) / height),
    method: "dense-corner-pair"
  });
  return {
    left: toMarker(bestPair.left, leftAnchorX),
    right: toMarker(bestPair.right, rightAnchorX),
    rank: bestPair.rank
  };
}

function detectOmrGuideMarkers(gray, width, height) {
  const threshold = 100;
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const candidates = [];
  const minSize = Math.max(18, Math.round(Math.min(width, height) * 0.012));
  const maxSize = Math.round(Math.min(width, height) * 0.11);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || gray[start] >= threshold) continue;

      let stackLength = 0;
      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      stack[stackLength++] = start;
      visited[start] = 1;

      while (stackLength) {
        const index = stack[--stackLength];
        const px = index % width;
        const py = Math.floor(index / width);
        area += 1;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;

        const neighbors = [index - 1, index + 1, index - width, index + width];
        for (const next of neighbors) {
          if (next < 0 || next >= visited.length || visited[next]) continue;
          const nx = next % width;
          if ((next === index - 1 && nx > px) || (next === index + 1 && nx < px)) continue;
          if (gray[next] >= threshold) continue;
          visited[next] = 1;
          stack[stackLength++] = next;
        }
      }

      const markerWidth = maxX - minX + 1;
      const markerHeight = maxY - minY + 1;
      const aspect = markerWidth / markerHeight;
      const solidity = area / (markerWidth * markerHeight);
      if (
        markerWidth >= minSize &&
        markerWidth <= maxSize &&
        markerHeight >= minSize &&
        markerHeight <= maxSize &&
        aspect >= 0.62 &&
        aspect <= 1.62 &&
        solidity >= 0.42
      ) {
        candidates.push({
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
          width: markerWidth,
          height: markerHeight,
          area,
          solidity,
          score: area * solidity
        });
      }
    }
  }

  const cornerOptions = (predicate, cornerX, cornerY, expectedSize = null) => candidates
    .filter(predicate)
    .filter((item) => {
      if (!expectedSize) return true;
      const size = Math.sqrt(item.width * item.height);
      return size >= expectedSize * 0.42 && size <= expectedSize * 1.6;
    })
    .map((item) => ({
      ...item,
      cornerDistance: Math.hypot((item.x - cornerX) / width, (item.y - cornerY) / height)
    }))
    .sort((a, b) => a.cornerDistance - b.cornerDistance || b.score - a.score);
  const pickCorner = (...args) => cornerOptions(...args)[0] || null;
  const topLeft = pickCorner((item) => item.x < width * 0.32 && item.y < height * 0.42, 0, 0);
  const topRight = pickCorner((item) => item.x > width * 0.68 && item.y < height * 0.42, width, 0);
  const expectedSize = topLeft && topRight
    ? median([Math.sqrt(topLeft.width * topLeft.height), Math.sqrt(topRight.width * topRight.height)])
    : null;
  const bottomLeftOptions = cornerOptions(
    (item) => item.x < width * 0.32 && item.y > height * 0.58,
    0,
    height,
    expectedSize
  );
  const bottomRightOptions = cornerOptions(
    (item) => item.x > width * 0.68 && item.y > height * 0.58,
    width,
    height,
    expectedSize
  );
  const topSpan = topLeft && topRight
    ? Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y)
    : 0;
  let bottomPair = bottomLeftOptions
    .flatMap((left) => bottomRightOptions.map((right) => {
      const leftSize = Math.sqrt(left.width * left.height);
      const rightSize = Math.sqrt(right.width * right.height);
      const sizeRatio = Math.max(leftSize, rightSize) / Math.max(1, Math.min(leftSize, rightSize));
      const verticalDifference = Math.abs(left.y - right.y);
      const span = Math.hypot(right.x - left.x, right.y - left.y);
      const leftSpan = Math.hypot(left.x - topLeft.x, left.y - topLeft.y);
      const rightSpan = Math.hypot(right.x - topRight.x, right.y - topRight.y);
      const sideRatio = Math.max(leftSpan, rightSpan) / Math.max(1, Math.min(leftSpan, rightSpan));
      const horizontalRatio = Math.max(topSpan, span) / Math.max(1, Math.min(topSpan, span));
      if (
        verticalDifference > height * 0.04 ||
        span < width * 0.55 ||
        Math.min(leftSpan, rightSpan) < height * 0.55 ||
        sizeRatio > 1.8 ||
        sideRatio > 1.35 ||
        horizontalRatio > 1.35
      ) return null;
      return {
        left,
        right,
        rank: left.cornerDistance
          + right.cornerDistance
          + verticalDifference / height
          + (sizeRatio - 1) * 0.08
          + (sideRatio - 1) * 0.1
          + (horizontalRatio - 1) * 0.1
      };
    }))
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)[0] || null;
  if (expectedSize) {
    const integral = buildOmrDarkIntegral(gray, width, height);
    const densePair = detectOmrDenseBottomPair(
      gray,
      width,
      height,
      expectedSize,
      integral,
      topLeft.x,
      topRight.x
    );
    if (densePair && Math.hypot(
      densePair.right.x - densePair.left.x,
      densePair.right.y - densePair.left.y
    ) >= width * 0.55) {
      if (!bottomPair) bottomPair = densePair;
    }
  }
  const markers = {
    topLeft,
    topRight,
    bottomLeft: bottomPair?.left || null,
    bottomRight: bottomPair?.right || null
  };

  if (Object.values(markers).some((marker) => !marker)) return null;
  const bottomSpan = Math.hypot(markers.bottomRight.x - markers.bottomLeft.x, markers.bottomRight.y - markers.bottomLeft.y);
  const leftSpan = Math.hypot(markers.bottomLeft.x - markers.topLeft.x, markers.bottomLeft.y - markers.topLeft.y);
  const rightSpan = Math.hypot(markers.bottomRight.x - markers.topRight.x, markers.bottomRight.y - markers.topRight.y);
  if (
    Math.min(topSpan, bottomSpan) < width * 0.55 ||
    Math.min(leftSpan, rightSpan) < height * 0.55 ||
    Math.max(topSpan, bottomSpan) / Math.min(topSpan, bottomSpan) > 1.35 ||
    Math.max(leftSpan, rightSpan) / Math.min(leftSpan, rightSpan) > 1.35 ||
    Math.abs(markers.topLeft.y - markers.topRight.y) > height * 0.04 ||
    Math.abs(markers.bottomLeft.y - markers.bottomRight.y) > height * 0.04
  ) {
    return null;
  }

  return {
    ...markers,
    candidates: candidates.length,
    method: "guide-markers"
  };
}

function interpolateOmrGuidePoint(markers, columnRatio, rowRatio) {
  const topX = markers.topLeft.x + (markers.topRight.x - markers.topLeft.x) * columnRatio;
  const topY = markers.topLeft.y + (markers.topRight.y - markers.topLeft.y) * columnRatio;
  const bottomX = markers.bottomLeft.x + (markers.bottomRight.x - markers.bottomLeft.x) * columnRatio;
  const bottomY = markers.bottomLeft.y + (markers.bottomRight.y - markers.bottomLeft.y) * columnRatio;
  return {
    x: topX + (bottomX - topX) * rowRatio,
    y: topY + (bottomY - topY) * rowRatio
  };
}

function buildOmrGuideGrid(markers, bubbleCandidates = []) {
  const rawPoints = PLAZA_OMR_GUIDE_TEMPLATE.rows.map((rowRatio) => (
    PLAZA_OMR_GUIDE_TEMPLATE.columns.map((columnRatio) => (
      interpolateOmrGuidePoint(markers, columnRatio, rowRatio)
    ))
  ));
  const markerPoints = [markers.topLeft, markers.topRight, markers.bottomLeft, markers.bottomRight];
  const minX = Math.min(...markerPoints.map((point) => point.x));
  const maxX = Math.max(...markerPoints.map((point) => point.x));
  const minY = Math.min(...markerPoints.map((point) => point.y));
  const maxY = Math.max(...markerPoints.map((point) => point.y));
  const topSpan = Math.hypot(markers.topRight.x - markers.topLeft.x, markers.topRight.y - markers.topLeft.y);
  const bottomSpan = Math.hypot(markers.bottomRight.x - markers.bottomLeft.x, markers.bottomRight.y - markers.bottomLeft.y);
  const horizontalSpan = (topSpan + bottomSpan) / 2;
  const minBubbleSize = horizontalSpan * 0.022;
  const maxBubbleSize = horizontalSpan * 0.052;
  const matchDistance = horizontalSpan * 0.023;
  const usableCandidates = bubbleCandidates.filter((candidate) => (
    candidate.width >= minBubbleSize &&
    candidate.width <= maxBubbleSize &&
    candidate.height >= minBubbleSize &&
    candidate.height <= maxBubbleSize &&
    candidate.width / candidate.height >= 0.68 &&
    candidate.width / candidate.height <= 1.48
  ));
  let refinedRows = 0;
  const points = rawPoints.map((row) => {
    const offsets = row.map((point) => {
      const candidate = usableCandidates
        .map((item) => ({ item, distance: Math.hypot(item.x - point.x, item.y - point.y) }))
        .filter((entry) => entry.distance <= matchDistance)
        .sort((a, b) => a.distance - b.distance)[0];
      return candidate
        ? { dx: candidate.item.x - point.x, dy: candidate.item.y - point.y }
        : null;
    }).filter(Boolean);
    if (offsets.length < 2) return row;
    refinedRows += 1;
    const dx = median(offsets.map((offset) => offset.dx));
    const dy = median(offsets.map((offset) => offset.dy));
    return row.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  });

  return {
    method: "guide-markers",
    markers,
    points,
    horizontalSpan,
    refinedRows,
    box: {
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.round(maxX - minX + 1),
      height: Math.round(maxY - minY + 1),
      method: "guide-markers",
      markerCandidates: markers.candidates
    }
  };
}

function detectOmrBubbleCandidates(gray, width, height) {
  const threshold = 125;
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const candidates = [];
  const minY = Math.round(height * 0.04);
  const maxY = Math.round(height * 0.86);
  const minX = Math.round(width * 0.34);

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || gray[start] >= threshold) continue;

      let size = 0;
      let stackLength = 0;
      let area = 0;
      let darkSum = 0;
      let componentMinX = x;
      let componentMaxX = x;
      let componentMinY = y;
      let componentMaxY = y;
      stack[stackLength++] = start;
      visited[start] = 1;

      while (stackLength) {
        const index = stack[--stackLength];
        const px = index % width;
        const py = Math.floor(index / width);
        area += 1;
        darkSum += 255 - gray[index];
        if (px < componentMinX) componentMinX = px;
        if (px > componentMaxX) componentMaxX = px;
        if (py < componentMinY) componentMinY = py;
        if (py > componentMaxY) componentMaxY = py;

        const neighbors = [index - 1, index + 1, index - width, index + width];
        for (const next of neighbors) {
          if (next < 0 || next >= visited.length || visited[next]) continue;
          const nx = next % width;
          if ((next === index - 1 && nx > px) || (next === index + 1 && nx < px)) continue;
          if (gray[next] >= threshold) continue;
          visited[next] = 1;
          stack[stackLength++] = next;
        }

        size += 1;
      }

      const componentWidth = componentMaxX - componentMinX + 1;
      const componentHeight = componentMaxY - componentMinY + 1;
      const aspect = componentWidth / componentHeight;
      if (
        componentWidth >= 7 &&
        componentWidth <= 48 &&
        componentHeight >= 7 &&
        componentHeight <= 48 &&
        area >= 16 &&
        area <= 850 &&
        aspect >= 0.55 &&
        aspect <= 1.75
      ) {
        candidates.push({
          x: (componentMinX + componentMaxX) / 2,
          y: (componentMinY + componentMaxY) / 2,
          width: componentWidth,
          height: componentHeight,
          area,
          weight: Math.max(area, darkSum / 255)
        });
      }
    }
  }

  return candidates;
}

function chooseOmrColumnCenters(candidates, width) {
  const minColumnGap = Math.max(70, Math.round(width * 0.06));
  const maxColumnGap = Math.round(width * 0.22);
  const xClusters = clusterValues(candidates, (item) => item.x, 20)
    .map((cluster) => ({
      center: cluster.center,
      count: cluster.items.length,
      items: cluster.items
    }))
    .filter((cluster) => cluster.center > width * 0.42 && cluster.count >= 5)
    .sort((a, b) => b.count - a.count);

  const usable = xClusters.slice(0, 10).sort((a, b) => a.center - b.center);
  let best = null;
  for (let start = 0; start <= usable.length - 4; start += 1) {
    const group = usable.slice(start, start + 4);
    const gaps = [group[1].center - group[0].center, group[2].center - group[1].center, group[3].center - group[2].center];
    const gapMedian = median(gaps);
    if (gapMedian < minColumnGap || gapMedian > maxColumnGap) continue;
    const gapSpread = Math.max(...gaps) - Math.min(...gaps);
    const score = group.reduce((sum, cluster) => sum + cluster.count, 0) - gapSpread * 0.08;
    if (!best || score > best.score) best = { score, group };
  }

  return best ? best.group.map((cluster) => cluster.center).sort((a, b) => a - b) : [];
}

function chooseOmrRowCenters(candidates, columnCenters, width) {
  if (columnCenters.length !== 4) return [];
  const columnTolerance = Math.max(18, Math.round(width * 0.018));
  const nearGrid = candidates
    .map((candidate) => {
      const columnIndex = columnCenters.findIndex((center) => Math.abs(candidate.x - center) <= columnTolerance);
      return columnIndex === -1 ? null : { ...candidate, columnIndex };
    })
    .filter(Boolean);

  const yClusters = clusterValues(nearGrid, (item) => item.y, 18)
    .map((cluster) => ({
      center: cluster.center,
      count: cluster.items.length,
      columns: new Set(cluster.items.map((item) => item.columnIndex)).size,
      items: cluster.items
    }))
    .filter((cluster) => cluster.columns >= 2)
    .sort((a, b) => a.center - b.center);

  if (yClusters.length < 12) return [];

  let best = null;
  for (let start = 0; start <= yClusters.length - 12; start += 1) {
    const group = yClusters.slice(start, start + 12);
    const gaps = [];
    for (let index = 1; index < group.length; index += 1) {
      gaps.push(group[index].center - group[index - 1].center);
    }
    const gapMedian = median(gaps);
    if (gapMedian < 22 || gapMedian > 95) continue;
    const spacingPenalty = gaps.reduce((sum, gap) => sum + Math.abs(gap - gapMedian), 0);
    const markStrength = group.reduce((sum, cluster) => {
      const rowScores = columnCenters.map((center) => {
        const item = cluster.items.find((candidate) => Math.abs(candidate.x - center) <= columnTolerance);
        return item ? item.weight : 0;
      });
      return sum + Math.max(...rowScores);
    }, 0);
    const structureScore = group.reduce((sum, cluster) => sum + cluster.columns * 20 + cluster.count, 0);
    const score = markStrength + structureScore - spacingPenalty * 4;
    if (!best || score > best.score) best = { score, group };
  }

  return best ? best.group.map((cluster) => cluster.center) : [];
}

function detectOmrBubbleGrid(gray, width, height) {
  const candidates = detectOmrBubbleCandidates(gray, width, height);
  const columns = chooseOmrColumnCenters(candidates, width);
  const rows = chooseOmrRowCenters(candidates, columns, width);
  if (columns.length !== 4 || rows.length !== 12) return null;

  const minX = Math.min(...columns);
  const maxX = Math.max(...columns);
  const minY = Math.min(...rows);
  const maxY = Math.max(...rows);
  const gridWidth = maxX - minX;
  const gridHeight = maxY - minY;
  if (gridWidth < width * 0.18 || gridHeight < height * 0.32) return null;

  return {
    columns,
    rows,
    method: "bubble-grid",
    candidateCount: candidates.length,
    box: {
      x: Math.max(0, Math.round(minX - gridWidth * 0.42)),
      y: Math.max(0, Math.round(minY - gridHeight * 0.22)),
      width: Math.round(gridWidth * 1.52),
      height: Math.round(gridHeight * 1.18),
      method: "bubble-grid",
      candidateCount: candidates.length
    }
  };
}

function omrDarkRatio(gray, width, height, cx, cy, radius, threshold = 145) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));
  let total = 0;
  let dark = 0;
  const radiusSq = radius * radius;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > radiusSq) continue;
      total += 1;
      if (gray[y * width + x] < threshold) dark += 1;
    }
  }

  return total ? dark / total : 0;
}

function omrColorInkRatio(rgb, width, height, channels, cx, cy, radius) {
  if (!rgb || channels < 3) return 0;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));
  const radiusSq = radius * radius;
  let total = 0;
  let colorInk = 0;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > radiusSq) continue;
      total += 1;
      const index = (y * width + x) * channels;
      const red = rgb[index];
      const green = rgb[index + 1];
      const blue = rgb[index + 2];
      const darkest = Math.min(red, green, blue);
      const lightest = Math.max(red, green, blue);
      const brightness = (red + green + blue) / 3;
      if (lightest - darkest >= 42 && darkest <= 185 && brightness <= 220) colorInk += 1;
    }
  }

  return total ? colorInk / total : 0;
}

function omrAdaptiveInkRatios(gray, width, height, cx, cy, innerRadius, coreRadius, bubbleRadius) {
  const reference = [];
  const minReferenceRadius = bubbleRadius * 1.22;
  const maxReferenceRadius = bubbleRadius * 1.62;
  const maxRadius = Math.ceil(maxReferenceRadius);
  const minX = Math.max(0, Math.floor(cx - maxRadius));
  const maxX = Math.min(width - 1, Math.ceil(cx + maxRadius));
  const minY = Math.max(0, Math.floor(cy - maxRadius));
  const maxY = Math.min(height - 1, Math.ceil(cy + maxRadius));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance >= minReferenceRadius && distance <= maxReferenceRadius) {
        reference.push(gray[y * width + x]);
      }
    }
  }

  reference.sort((a, b) => a - b);
  const background = reference.length
    ? reference[Math.min(reference.length - 1, Math.floor(reference.length * 0.72))]
    : 210;
  const threshold = Math.max(28, background - 48);
  return {
    inner: omrDarkRatio(gray, width, height, cx, cy, innerRadius, threshold),
    core: omrDarkRatio(gray, width, height, cx, cy, coreRadius, threshold),
    background,
    threshold
  };
}

function analyzeOmrGuideRow(gray, width, height, grid, rowIndex, colorImage = null) {
  const innerRadius = Math.max(7, Math.round(grid.horizontalSpan * 0.0115));
  const coreRadius = Math.max(5, Math.round(grid.horizontalSpan * 0.0065));
  const bubbleRadius = Math.max(11, grid.horizontalSpan * 0.0185);
  const measurements = grid.points[rowIndex].map((point) => ({
    cx: Math.round(point.x),
    cy: Math.round(point.y),
    colorInk: colorImage
      ? omrColorInkRatio(colorImage.data, width, height, colorImage.channels, point.x, point.y, bubbleRadius)
      : 0,
    ...omrAdaptiveInkRatios(gray, width, height, point.x, point.y, innerRadius, coreRadius, bubbleRadius)
  }));
  const innerBaseline = median(measurements.map((item) => item.inner).sort((a, b) => a - b).slice(0, 2));
  const coreBaseline = median(measurements.map((item) => item.core).sort((a, b) => a - b).slice(0, 2));
  const scores = measurements.map((item) => {
    const innerExcess = Math.max(0, item.inner - innerBaseline);
    const coreExcess = Math.max(0, item.core - coreBaseline);
    const grayscaleScore = innerExcess * 0.72 + coreExcess * 0.28;
    return {
      ...item,
      outer: item.inner,
      excess: innerExcess,
      score: Math.max(grayscaleScore, Math.min(1, item.colorInk * 3.5))
    };
  });
  const selected = scores
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.score >= 0.052 && (
      item.excess >= 0.03 || item.core - coreBaseline >= 0.055 || item.colorInk >= 0.012
    ))
    .sort((a, b) => b.score - a.score);

  if (!selected.length) return { value: "", selectedIndexes: [], scores };
  const best = selected[0];
  const competitors = selected.filter((item) => (
    item.index !== best.index && item.score >= Math.max(0.052, best.score * 0.65)
  ));
  if (competitors.length) {
    return {
      value: "",
      selectedIndexes: [best, ...competitors].map((item) => item.index),
      uncertain: true,
      scores
    };
  }

  return {
    value: PLAZA_OMR_RATING_OPTIONS[best.index],
    selectedIndexes: [best.index],
    scores
  };
}

function analyzeOmrRow(gray, width, height, box, rowRatio) {
  const outerRadius = Math.max(7, Math.round(box.width * 0.024));
  const innerRadius = Math.max(5, Math.round(box.width * 0.013));
  const cy = box.y + box.height * rowRatio;
  const measurements = PLAZA_OMR_TEMPLATE.columns.map((columnRatio) => {
    const cx = box.x + box.width * columnRatio;
    const inner = omrDarkRatio(gray, width, height, cx, cy, innerRadius);
    const outer = omrDarkRatio(gray, width, height, cx, cy, outerRadius);
    return { cx: Math.round(cx), cy: Math.round(cy), inner, outer };
  });

  const minOuter = Math.min(...measurements.map((item) => item.outer));
  const scores = measurements.map((item) => {
    const excess = Math.max(0, item.outer - minOuter);
    return {
      ...item,
      excess,
      score: item.inner * 0.72 + excess * 0.28
    };
  });

  const selected = scores
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.inner >= 0.035 || item.excess >= 0.055 || item.score >= 0.045)
    .sort((a, b) => b.score - a.score);

  if (!selected.length) {
    return { value: "", selectedIndexes: [], scores };
  }

  const best = selected[0];
  const competitors = selected.filter((item) => item.index !== best.index && item.score >= Math.max(0.045, best.score * 0.65));
  if (competitors.length) {
    return {
      value: "",
      selectedIndexes: selected.map((item) => item.index),
      uncertain: true,
      scores
    };
  }

  return {
    value: PLAZA_OMR_RATING_OPTIONS[best.index],
    selectedIndexes: [best.index],
    scores
  };
}

function analyzeOmrGridRow(gray, width, height, grid, rowIndex) {
  const gaps = [];
  for (let index = 1; index < grid.columns.length; index += 1) {
    gaps.push(grid.columns[index] - grid.columns[index - 1]);
  }
  const outerRadius = Math.max(7, Math.round(median(gaps) * 0.18));
  const innerRadius = Math.max(5, Math.round(median(gaps) * 0.095));
  const cy = grid.rows[rowIndex];
  const measurements = grid.columns.map((cx) => {
    const inner = omrDarkRatio(gray, width, height, cx, cy, innerRadius);
    const outer = omrDarkRatio(gray, width, height, cx, cy, outerRadius);
    return { cx: Math.round(cx), cy: Math.round(cy), inner, outer };
  });

  const minInner = Math.min(...measurements.map((item) => item.inner));
  const scores = measurements.map((item) => ({
    ...item,
    excess: Math.max(0, item.inner - minInner),
    score: item.inner
  }));

  const selected = scores
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.inner >= 0.028 && item.excess >= 0.014)
    .sort((a, b) => b.score - a.score);

  if (!selected.length) {
    return { value: "", selectedIndexes: [], scores };
  }

  const best = selected[0];
  const competitors = selected.filter((item) => item.index !== best.index && item.score >= Math.max(0.035, best.score * 0.72));
  if (competitors.length) {
    return {
      value: "",
      selectedIndexes: selected.map((item) => item.index),
      uncertain: true,
      scores
    };
  }

  return {
    value: PLAZA_OMR_RATING_OPTIONS[best.index],
    selectedIndexes: [best.index],
    scores
  };
}

async function readPlazaOpinionOmr(body) {
  const sharp = require("sharp");
  const imageBuffer = imageBufferFromOmrBody(body);
  if (imageBuffer.length > 14 * 1024 * 1024) {
    throw new Error("Imagem acima do limite OMR.");
  }

  const preparedImage = sharp(imageBuffer, { limitInputPixels: 60000000 })
    .rotate()
    .resize({ width: 1600, height: 2200, fit: "inside", withoutEnlargement: true });
  const [image, colorImage] = await Promise.all([
    preparedImage.clone().grayscale().normalise().raw().toBuffer({ resolveWithObject: true }),
    preparedImage.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true })
  ]);

  const { data, info } = image;
  const width = info.width;
  const height = info.height;
  const guideMarkers = detectOmrGuideMarkers(data, width, height);
  const guideBubbleCandidates = guideMarkers ? detectOmrBubbleCandidates(data, width, height) : [];
  const guideGrid = guideMarkers ? buildOmrGuideGrid(guideMarkers, guideBubbleCandidates) : null;
  const bubbleGrid = guideGrid ? null : detectOmrBubbleGrid(data, width, height);
  const box = guideGrid ? guideGrid.box : (bubbleGrid ? bubbleGrid.box : detectOmrFormBox(data, width, height));
  const aspect = box.height / box.width;
  const boxLooksValid = guideGrid || bubbleGrid
    ? true
    : aspect > 1.15 && aspect < 1.8 && box.width > width * 0.45 && box.height > height * 0.45;

  const ratings = {};
  const uncertain = [];
  const debugRows = [];

  PLAZA_OMR_FIELDS.forEach(([field, label], index) => {
    const row = guideGrid
      ? analyzeOmrGuideRow(data, width, height, guideGrid, index, {
          data: colorImage.data,
          channels: colorImage.info.channels
        })
      : (bubbleGrid
          ? analyzeOmrGridRow(data, width, height, bubbleGrid, index)
          : analyzeOmrRow(data, width, height, box, PLAZA_OMR_TEMPLATE.rows[index]));
    ratings[field] = row.value;
    if (row.uncertain) uncertain.push(label);
    debugRows.push({
      field,
      label,
      value: row.value,
      selectedIndexes: row.selectedIndexes,
      scores: row.scores.map((score) => ({
        cx: score.cx,
        cy: score.cy,
        inner: Number(score.inner.toFixed(4)),
        outer: Number(score.outer.toFixed(4)),
        excess: Number(score.excess.toFixed(4)),
        colorInk: Number((score.colorInk || 0).toFixed(4)),
        score: Number(score.score.toFixed(4))
      }))
    });
  });

  const colorMarkedRows = debugRows.filter((row) => (
    Math.max(...row.scores.map((score) => score.colorInk || 0)) >= 0.025
  )).length;
  if (colorMarkedRows >= 3) {
    debugRows.forEach((row) => {
      if (!ratings[row.field] || row.selectedIndexes.length !== 1) return;
      const selectedScore = row.scores[row.selectedIndexes[0]];
      if (
        (selectedScore?.colorInk || 0) >= 0.018 ||
        (selectedScore?.inner || 0) >= 0.18
      ) return;
      ratings[row.field] = "";
      row.value = "";
      row.selectedIndexes = [];
    });
  }

  const answered = Object.values(ratings).filter(Boolean).length;
  const confidence = guideGrid ? 98 : (bubbleGrid ? 92 : (boxLooksValid ? 95 : 72));
  const reviewReason = boxLooksValid ? "" : "OMR nao confirmou proporcao/posicao esperada da ficha. Conferir enquadramento da foto.";

  return {
    ok: true,
    engine: guideGrid ? "pixel-omr-v2-guides" : "pixel-omr-v1",
    form: "sueds-plaza-20260720",
    confidence,
    ratings,
    answered,
    uncertainFields: uncertain.join(", "),
    reviewReason,
    layout: {
      imageWidth: width,
      imageHeight: height,
      box,
      method: guideGrid ? guideGrid.method : (bubbleGrid ? bubbleGrid.method : (box.method || "")),
      guideMarkers: guideGrid
        ? Object.fromEntries(Object.entries(guideGrid.markers)
            .filter(([, value]) => value && typeof value === "object" && Number.isFinite(value.x))
            .map(([key, value]) => [key, { x: Math.round(value.x), y: Math.round(value.y) }]))
        : undefined,
      bubbleGrid: bubbleGrid
        ? {
            candidateCount: bubbleGrid.candidateCount,
            columns: bubbleGrid.columns.map((value) => Math.round(value)),
            rows: bubbleGrid.rows.map((value) => Math.round(value))
          }
        : undefined,
      boxLooksValid
    },
    debugRows: body.debug ? debugRows : undefined
  };
}

function opinionSheetId() {
  return OPERATIONAL_SHEET_ID;
}

function normalizeOpinionHotelSlug(value) {
  const text = comparableKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (OPINION_FORM_HOTELS[text]) return text;
  const hotel = normalizeHotelName(value);
  const match = Object.entries(OPINION_FORM_HOTELS)
    .find(([, config]) => comparableKey(config.hotel) === comparableKey(hotel));
  return match ? match[0] : text;
}

function cleanOpinionRating(value) {
  const score = ratingScore(value);
  if (score === 100 && comparableKey(value).includes("muito")) return "Muito bom";
  if (score === 100) return "Excelente";
  if (score === 85) return "Muito bom";
  if (score === 70) return "Bom";
  if (score === 40) return "Regular";
  return "";
}

function opinionScoreFromRatings(ratings = {}) {
  const scores = Object.values(ratings)
    .map(ratingScore)
    .filter((score) => Number.isFinite(score));
  return average(scores) || "";
}

function opinionCommentBuckets(ratings = {}, comments = "") {
  const text = String(comments || "").trim();
  if (!text) return { highlights: "", issues: "" };
  const hasLowRating = Object.values(ratings).some((rating) => {
    const score = ratingScore(rating);
    return Number.isFinite(score) && score <= 40;
  });
  return hasLowRating
    ? { highlights: "", issues: text }
    : { highlights: text, issues: "" };
}

async function ensureOperationalOpinionHeaders(sheetId) {
  let rows = [];
  try {
    rows = await getSheetValues("Opinarios!A1:AZ1", sheetId);
  } catch (error) {
    if (!isMissingSheetError(error)) throw error;
  }

  const current = rows[0] || [];
  const headers = current.length ? current.map((header) => String(header || "").trim()) : [];
  OPINION_SUBMISSION_HEADERS.forEach((header) => {
    if (!headers.includes(header)) headers.push(header);
  });

  if (!current.length || headers.length !== current.length) {
    await sheetsRequestForSpreadsheet(sheetId, `/values/${sheetRange("Opinarios!A1:AZ1")}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: [headers] })
    });
  }

  return headers;
}

async function appendDigitalOpinion(body = {}) {
  const sheetId = opinionSheetId();
  if (!sheetId || !getServiceAccount()) {
    throw new Error("Planilha operacional ou credenciais Google nao configuradas.");
  }

  const hotelSlug = normalizeOpinionHotelSlug(body.hotel || body.hotelSlug);
  if (!OPINION_ACTIVE_FORM_SLUGS.has(hotelSlug)) {
    throw new Error("Formulario deste hotel ainda nao configurado.");
  }
  const hotel = OPINION_FORM_HOTELS[hotelSlug]?.hotel || normalizeHotelName(body.hotel) || "Nao identificado";
  const ratings = body.ratings && typeof body.ratings === "object" ? body.ratings : {};
  const normalizedRatings = Object.fromEntries(
    Object.entries(ratings).map(([key, value]) => [key, cleanOpinionRating(value)])
  );
  const score = opinionScoreFromRatings(normalizedRatings);
  if (!score) throw new Error("Selecione pelo menos uma avaliacao antes de enviar.");

  const headers = await ensureOperationalOpinionHeaders(sheetId);
  const comments = String(body.comments || "").trim().slice(0, 1200);
  const buckets = opinionCommentBuckets(normalizedRatings, comments);
  const now = new Date();
  const generatedId = `digital-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const formVersion = String(body.formVersion || "").trim().slice(0, 20);
  const lang = String(body.lang || "pt-BR").trim().slice(0, 12);

  const values = {
    "ID Arquivo": generatedId,
    "Data Processamento": todayIsoSaoPaulo(),
    "Hotel": hotel,
    "Nome Arquivo": `Opinario digital ${formVersion || todayIsoSaoPaulo()}`,
    "Link Foto": "",
    "Origem": "QR Code",
    "Hotel Slug": hotelSlug,
    "Form Version": formVersion,
    "Idioma": lang,
    "Nome Hospede": String(body.guestName || "").trim().slice(0, 120),
    "Apartamento": String(body.apartment || "").trim().slice(0, 30),
    "Data Entrada": "",
    "Data Saida": "",
    "Impressao Geral": normalizedRatings.generalImpression || "",
    "Reserva": normalizedRatings.reservation || "",
    "Recepcao / Check-in / Check-out": normalizedRatings.frontDesk || "",
    "Atendimento da equipe": normalizedRatings.teamService || "",
    "Conforto do quarto": normalizedRatings.roomComfort || "",
    "Limpeza do quarto": normalizedRatings.roomCleaning || "",
    "Qualidade do Wi-fi": normalizedRatings.wifi || "",
    "Area de lazer / piscina": normalizedRatings.pool || "",
    "Atendimento da equipe do Beach Club": normalizedRatings.beachClub || "",
    "Alimentos Cafe da Manha": normalizedRatings.foodBreakfast || "",
    "Alimentos Almoco": normalizedRatings.foodLunch || "",
    "Alimentos Jantar": normalizedRatings.foodDinner || "",
    "Comentarios": comments,
    "Destaques": buckets.highlights,
    "Problemas Identificados": buckets.issues,
    "Nota Calculada %": score,
    "Confianca %": 100,
    "Status": "Digital",
    "Responsavel Revisao": "",
    "Observacao Revisao": "",
    "Data Revisao": ""
  };

  await sheetsRequestForSpreadsheet(sheetId, `/values/${sheetRange("Opinarios!A:AZ")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [headers.map((header) => values[header] ?? "")] })
  });

  operationalCache = { expiresAt: 0, payload: null };
  return { id: generatedId, hotel, score, submittedAt: now.toISOString() };
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
    opinions = rowsToObjectsAny(rows)
      .map(normalizeOperationalOpinion)
      .filter(isCurrentOperationalOpinion);
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

function operationalHotelFromSlug(value) {
  const slug = String(value || "sueds-plaza").trim().toLowerCase();
  return {
    slug: OPERATIONAL_HOTELS_BY_SLUG[slug] ? slug : "sueds-plaza",
    name: OPERATIONAL_HOTELS_BY_SLUG[slug] || OPERATIONAL_HOTELS_BY_SLUG["sueds-plaza"]
  };
}

function opinionOperationalIncident(opinion, index) {
  const description = opinion.issues;
  if (!description) return null;
  const requestedAt = opinion.processedAt || new Date();
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - requestedAt.getTime()) / 60000));
  return {
    id: opinion.fileId || `opinario-${index + 1}`,
    requestedAt: requestedAt.toISOString(),
    apartment: opinion.apartment,
    guestName: opinion.guestName,
    description,
    comments: opinion.comments,
    status: "pending",
    resolvedAt: null,
    elapsedMinutes,
    overdue: elapsedMinutes >= 180,
    source: "Opinario",
    requester: "Hospede",
    orderNumber: "",
    photoUrl: opinion.photoUrl
  };
}

async function buildOperationalHotelPayload(period = {}) {
  const selectedHotel = operationalHotelFromSlug(period.hotel);
  const opinions = await loadOperationalOpinions();
  const month = period.month || todayKey().slice(0, 7);
  const hotelOpinions = opinions.filter((opinion) => {
    const sameMonth = !opinion.monthKey || opinion.monthKey === month;
    return sameMonth && comparableKey(opinion.hotel) === comparableKey(selectedHotel.name);
  });
  const evaluation = hotelOpinions.length ? summarizeOperationalHotel(selectedHotel.name, hotelOpinions) : emptyOperationalHotel(selectedHotel.name);
  const opinionIncidents = hotelOpinions
    .map(opinionOperationalIncident)
    .filter(Boolean)
    .sort((a, b) => new Date(a.requestedAt) - new Date(b.requestedAt));

  return {
    audience: "tv-operacional-hotel",
    generatedAt: new Date().toISOString(),
    period: { month },
    hotel: selectedHotel,
    evaluation,
    operations: {
      summary: {
        pending: opinionIncidents.length,
        overdue: opinionIncidents.filter((incident) => incident.overdue).length,
        resolvedToday: 0,
        resolvedUnderOneHour: 0,
        opinionComplaints: opinionIncidents.length
      },
      pms: {
        provider: "KIPFULL",
        connected: false,
        status: "awaiting_configuration"
      },
      incidents: opinionIncidents
    }
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
  "12": "São José dos Campos",
  "13": "Santos",
  "14": "Bauru",
  "15": "Sorocaba",
  "16": "Ribeirão Preto",
  "17": "São José do Rio Preto",
  "18": "Presidente Prudente",
  "19": "Campinas",
  "21": "Rio de Janeiro",
  "22": "Campos dos Goytacazes",
  "24": "Volta Redonda",
  "27": "Vitória",
  "28": "Cachoeiro de Itapemirim",
  "31": "Belo Horizonte",
  "32": "Juiz de Fora",
  "33": "Governador Valadares",
  "34": "Uberlândia",
  "35": "Poços de Caldas",
  "37": "Divinópolis",
  "38": "Montes Claros",
  "61": "Brasília",
  "62": "Goiânia",
  "63": "Palmas",
  "64": "Rio Verde",
  "71": "Salvador",
  "73": "Porto Seguro",
  "74": "Juazeiro",
  "75": "Feira de Santana",
  "77": "Vitória da Conquista",
  "81": "Recife",
  "82": "Maceió",
  "84": "Natal",
  "85": "Fortaleza",
  "86": "Teresina",
  "87": "Petrolina",
  "88": "Juazeiro do Norte",
  "98": "São Luís",
  "99": "Imperatriz"
};

const MARKET_DDD_STATE = {
  "11": "SP",
  "12": "SP",
  "13": "SP",
  "14": "SP",
  "15": "SP",
  "16": "SP",
  "17": "SP",
  "18": "SP",
  "19": "SP",
  "21": "RJ",
  "22": "RJ",
  "24": "RJ",
  "27": "ES",
  "28": "ES",
  "31": "MG",
  "32": "MG",
  "33": "MG",
  "34": "MG",
  "35": "MG",
  "37": "MG",
  "38": "MG",
  "61": "DF",
  "62": "GO",
  "63": "TO",
  "64": "GO",
  "71": "BA",
  "73": "BA",
  "74": "BA",
  "75": "BA",
  "77": "BA",
  "81": "PE",
  "82": "AL",
  "84": "RN",
  "85": "CE",
  "86": "PI",
  "87": "PE",
  "88": "CE",
  "98": "MA",
  "99": "MA"
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

function nextCheckinMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth() + 1;
  const next = new Date(year, monthIndex, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function marketCheckinMonthOptions() {
  const current = todayKey().slice(0, 7);
  const [year, month] = current.split("-").map(Number);
  const months = [];
  for (let offset = -1; offset <= 12; offset += 1) {
    const date = new Date(year, month - 1 + offset, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.push({ value, label: marketPeriodLabel(value) });
  }
  return months;
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

function singleDateFromMarketValue(value) {
  const text = String(value || "").trim();
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;

  const brDates = [...text.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)]
    .map((match) => `${match[3]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`);
  if (!brDates.length) return "";
  const uniqueDates = [...new Set(brDates)];
  return uniqueDates.length === 1 ? uniqueDates[0] : "";
}

function dddFromPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "NI";
  if (digits.startsWith("55") && digits.length >= 4) return digits.slice(2, 4);
  return digits.length >= 2 ? digits.slice(0, 2) : "NI";
}

function normalizeMarketHotelName(value) {
  const text = String(value || "").trim();
  const key = marketComparable(text);
  if (!key) return "Não informado";
  if (key.includes("cabralia")) return "SUEDS Cabralia";
  if (key.includes("segundo sol")) return "SUEDS Segundo Sol";
  if (key.includes("plaza")) return "SUEDS Plaza";
  if (key.includes("premium")) return "SUEDS Premium";
  if (key.includes("trancoso")) return "SUEDS Trancoso";
  if (key.includes("arraial")) return "Casas Sueds Arraial";
  if (key.includes("sueds")) return "SUEDS Hotels";
  return text;
}

function normalizeAsksuiteMarketChannel(value) {
  const text = String(value || "").trim();
  const key = marketComparable(text);
  if (!key) return "Não informado";
  if (key.includes("whatsapp")) return "WhatsApp";
  if (key.includes("chat")) return "Chat web";
  if (key.includes("instagram")) return "Instagram";
  if (key.includes("robo")) return "Robo";
  return text;
}

function isRobotAsksuiteAttendant(value) {
  const key = marketComparable(value);
  return key === "robo";
}

function normalizeAsksuiteMarketSheetRow(item, index = 0) {
  const start = firstFilledValue(item, ["Início do atendimento", "Inicio do atendimento"]);
  const periodValue = firstFilledValue(item, ["Mês", "Mes", "month", "Data", "Período", "Periodo"]) || start;
  const month = monthFromMarketValue(periodValue);
  if (!month) return null;

  const rawDdd = String(firstFilledValue(item, ["DDD", "ddd"]) || "").replace(/\D/g, "");
  const ddd = rawDdd || dddFromPhone(firstFilledValue(item, ["Telefone", "phone"]));
  const state = firstFilledValue(item, ["Estado", "UF", "state"]) || MARKET_DDD_STATE[ddd] || "Não informado";
  const attendant = firstFilledValue(item, ["Atendente", "attendant"]);
  const channel = isRobotAsksuiteAttendant(attendant)
    ? "Robo"
    : normalizeAsksuiteMarketChannel(firstFilledValue(item, ["Canal", "channel"]));
  const hotel = normalizeMarketHotelName(firstFilledValue(item, ["Hotel", "hotel", "Empresa"]));
  const dialoguesValue = firstFilledValue(item, ["Diálogos", "Dialogos", "dialogues", "Atendimentos"]);
  const rawKey = [
    firstFilledValue(item, ["Telefone", "phone"]),
    start,
    attendant,
    firstFilledValue(item, ["Empresa"]),
    firstFilledValue(item, ["Canal", "channel"])
  ].join("|");

  return {
    sheetKey: `sheet-${month}-${rawKey || index + 1}`,
    month,
    dateKey: singleDateFromMarketValue(periodValue || start),
    state,
    ddd,
    hotel,
    channel,
    campaign: firstFilledValue(item, ["Campanha", "campaign"]) || `Asksuite ${channel}`,
    source: firstFilledValue(item, ["Fonte", "Origem Sistema", "source"]) || "Asksuite",
    origin: firstFilledValue(item, ["Origem", "origin"]) || channel,
    device: firstFilledValue(item, ["Dispositivo", "device"]) || "Não informado",
    dialogues: dialoguesValue === "" ? 1 : parseDecimalNumber(dialoguesValue),
    quotes: parseDecimalNumber(firstFilledValue(item, ["Cotações", "Cotacoes", "quotes", "Oportunidades"])),
    reservations: parseDecimalNumber(firstFilledValue(item, ["Reservas", "reservations", "Cotações", "Cotacoes", "Oportunidades"])),
    sales: parseDecimalNumber(firstFilledValue(item, ["Vendas", "sales"])),
    revenue: parseDecimalNumber(firstFilledValue(item, ["Valor vendido corrigido", "Receita", "revenue", "Valor vendido"])),
    googleSpend: parseDecimalNumber(firstFilledValue(item, ["Investimento Google", "Google Ads", "googleSpend"])),
    metaSpend: parseDecimalNumber(firstFilledValue(item, ["Investimento Meta", "Meta Ads", "metaSpend"]))
  };
}

function marketRowKey(row) {
  if (row.sheetKey) return row.sheetKey;
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
      .map((row, index) => normalizeAsksuiteMarketSheetRow(row, index))
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
    dateKey: row.dateKey || "",
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

function loadAsksuiteMarketRowsForDateFromRaw(rawRows, date) {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return [];
    return rawRows
      .filter((row) => String(row.dateKey || "") === date)
      .map(normalizeAsksuiteMarketRow);
  } catch (error) {
    return [];
  }
}

function buildRobotSellerFromAsksuiteMarketRows(rawRows = [], period = {}) {
  const today = period.date || todayKey();
  const requestedMonth = period.month || today.slice(0, 7);
  const isYearToDate = requestedMonth === "ytd";
  const activeMonth = isYearToDate ? today.slice(0, 7) : requestedMonth;
  const selectedDay = period.day || "";
  const selectedHotel = period.hotel || "";
  const selectedChannel = period.channel || "";
  const goalDate = selectedDay || today;
  const ytdStart = `${today.slice(0, 4)}-01-01`;

  const periodRows = rawRows.filter((row) => {
    const rowMonth = String(row.month || "");
    if (isYearToDate) return rowMonth.startsWith(today.slice(0, 4)) && (!row.dateKey || row.dateKey >= ytdStart);
    return rowMonth === activeMonth;
  });

  const rows = periodRows.filter((row) => {
    if (comparableKey(row.channel) !== comparableKey("Robo")) return false;
    if (selectedDay && row.dateKey !== selectedDay) return false;
    if (selectedHotel && comparableKey(row.hotel) !== comparableKey(selectedHotel)) return false;
    if (selectedChannel && comparableKey(row.channel) !== comparableKey(selectedChannel)) return false;
    return true;
  });

  if (!rows.length) return null;

  const dayRows = selectedDay ? rows : rows.filter((row) => row.dateKey === today);
  const mtdRows = rows.filter((row) => !row.dateKey || isOnOrBeforeDateKey(row, goalDate));
  const salesToday = sum(dayRows, (row) => row.revenue);
  const salesMtd = sum(mtdRows, (row) => row.revenue);
  const salesMonth = sum(rows, (row) => row.revenue);
  const reservationsToday = sum(dayRows, (row) => row.sales);
  const reservationsMtd = sum(mtdRows, (row) => row.sales);
  const reservationsMonth = sum(rows, (row) => row.sales);

  return {
    name: "Robo",
    salesToday,
    salesMtd,
    salesMonth,
    reservationsToday,
    reservationsMtd,
    reservationsMonth,
    dailyGoal: 0,
    mtdGoal: 0,
    monthlyGoal: 0,
    dailyGoalPct: null,
    mtdGoalPct: null,
    monthlyGoalPct: null
  };
}

function mergeRobotSeller(sellers = [], robotSeller) {
  if (!robotSeller) return sellers;
  const existingIndex = sellers.findIndex((seller) => comparableKey(seller.name) === comparableKey(robotSeller.name));
  if (existingIndex === -1) return [...sellers, robotSeller].sort(sellerRankingSort);

  return sellers.map((seller, index) => {
    if (index !== existingIndex) return seller;
    return {
      ...seller,
      salesToday: robotSeller.salesToday,
      salesMtd: robotSeller.salesMtd,
      salesMonth: robotSeller.salesMonth,
      reservationsToday: robotSeller.reservationsToday,
      reservationsMtd: robotSeller.reservationsMtd,
      reservationsMonth: robotSeller.reservationsMonth,
      dailyGoalPct: pct(robotSeller.salesToday, seller.dailyGoal),
      mtdGoalPct: pct(robotSeller.salesMtd, seller.mtdGoal),
      monthlyGoalPct: pct(robotSeller.salesMonth, seller.monthlyGoal)
    };
  }).sort(sellerRankingSort);
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
    return (!filters.date || row.dateKey === filters.date)
      && (!filters.hotel || marketComparable(row.hotel) === marketComparable(filters.hotel))
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

function marketCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
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

function applyGoogleAdsMetricsToMarketPayload(payload, googleAds, filters = {}, metaAds = {}) {
  payload.integrations = {
    ...(payload.integrations || {}),
    googleAds: {
      configured: googleAds.configured,
      source: googleAds.source,
      error: googleAds.error || "",
      apiVersion: googleAds.apiVersion || "",
      customerId: googleAds.customerId || "",
      period: googleAds.period || payload.period
    },
    metaAds: {
      configured: Boolean(metaAds.configured),
      source: metaAds.source || "empty",
      error: metaAds.error || "",
      apiVersion: metaAds.apiVersion || "",
      accountId: metaAds.accountId || "",
      period: metaAds.period || payload.period
    }
  };

  const hasGoogleAds = Boolean(googleAds.configured && googleAds.source === "google_ads_api");
  const hasMetaAds = Boolean(metaAds.configured && metaAds.source === "meta_ads_api");

  if (!hasGoogleAds && !hasMetaAds) {
    return payload;
  }

  const selectedCampaign = filters.campaign || "";
  const campaigns = (googleAds.campaigns || [])
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
  const metaCampaigns = (metaAds.campaigns || [])
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
      roas: campaign.roas
    }));
  const metaAdsRows = (metaAds.ads || [])
    .filter((ad) => !selectedCampaign || marketComparable(ad.campaign) === marketComparable(selectedCampaign))
    .map((ad) => ({
      label: ad.label,
      campaign: ad.campaign,
      adSet: ad.adSet,
      spend: ad.spend,
      clicks: ad.clicks,
      impressions: ad.impressions,
      conversions: ad.conversions,
      sales: ad.conversions,
      revenue: ad.conversionValue,
      conversionValue: ad.conversionValue,
      costPerClick: ad.costPerClick,
      costPerSale: ad.costPerConversion,
      roas: ad.roas
    }));
  const metaOriginRows = (metaAds.locations || [])
    .map((row) => ({
      label: row.label || row.region || row.country || "Não informado",
      region: row.region || "",
      country: row.country || "",
      spend: Number(row.spend || 0),
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      conversions: Number(row.conversions || 0),
      sales: Number(row.conversions || 0),
      revenue: Number(row.conversionValue || 0),
      conversionValue: Number(row.conversionValue || 0),
      costPerClick: Number(row.costPerClick || 0),
      costPerSale: Number(row.costPerConversion || 0),
      costPerConversion: Number(row.costPerConversion || 0),
      roas: Number(row.roas || 0)
    }));

  const googleSummary = googleAds.summary || {};
  const metaSummary = metaAds.summary || {};
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
  const metaCampaignSpend = metaCampaigns.reduce((total, row) => total + row.spend, 0);
  const metaCampaignClicks = metaCampaigns.reduce((total, row) => total + row.clicks, 0);
  const metaCampaignConversions = metaCampaigns.reduce((total, row) => total + row.conversions, 0);
  const metaCampaignConversionValue = metaCampaigns.reduce((total, row) => total + row.conversionValue, 0);
  const useMetaCampaignSummary = Boolean(selectedCampaign) || metaCampaignSpend || metaCampaignClicks || metaCampaignConversions || metaCampaignConversionValue;
  const metaSpend = useMetaCampaignSummary
    ? marketRound(metaCampaignSpend, 2)
    : marketRound(metaSummary.spend, 2);
  const metaClicks = useMetaCampaignSummary
    ? metaCampaignClicks
    : Number(metaSummary.clicks || 0);
  const metaConversions = useMetaCampaignSummary
    ? marketRound(metaCampaignConversions, 2)
    : marketRound(metaSummary.conversions, 2);
  const metaConversionValue = useMetaCampaignSummary
    ? marketRound(metaCampaignConversionValue, 2)
    : marketRound(metaSummary.conversionValue, 2);
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
  payload.media.metaConnected = hasMetaAds;
  payload.media.metaSource = metaAds.source || "empty";
  payload.media.metaError = metaAds.error || "";
  payload.media.metaClicks = metaClicks;
  payload.media.metaImpressions = useMetaCampaignSummary
    ? metaCampaigns.reduce((total, row) => total + row.impressions, 0)
    : Number(metaSummary.impressions || 0);
  payload.media.metaConversions = metaConversions;
  payload.media.metaConversionValue = metaConversionValue;
  payload.media.metaCostPerClick = marketRound(marketSafeDiv(metaSpend, metaClicks), 2);
  payload.media.metaCostPerConversion = marketRound(marketSafeDiv(metaSpend, metaConversions), 2);
  payload.media.metaRoas = marketRound(marketSafeDiv(metaConversionValue, metaSpend), 2);
  payload.media.byCampaign = campaigns.sort((a, b) => b.spend - a.spend);
  payload.media.byKeyword = keywords.sort((a, b) => b.spend - a.spend);
  payload.media.byCity = geoCities.sort((a, b) => b.spend - a.spend);
  payload.media.byMetaCampaign = metaCampaigns.sort((a, b) => b.spend - a.spend);
  payload.media.byMetaAd = metaAdsRows.sort((a, b) => b.spend - a.spend);
  payload.media.byMetaOrigin = metaOriginRows.sort((a, b) => b.clicks - a.clicks || b.spend - a.spend);
  payload.filters.campaigns = [...new Set([
    ...(payload.filters.campaigns || []),
    ...(googleAds.campaigns || []).map((campaign) => campaign.label),
    ...(metaAds.campaigns || []).map((campaign) => campaign.label)
  ])]
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

function marketPlaceFromDddLabel(label) {
  const text = String(label || "").trim();
  const [rawCity = ""] = text.split("/");
  const ddd = text.match(/\/\s*([0-9]{2}|NI)\b/i)?.[1] || "";
  const mappedCity = MARKET_DDD_CITY[ddd] || "";
  return {
    city: mappedCity || rawCity.trim(),
    ddd: ddd.trim()
  };
}

function marketRowMatchesPlace(row, city, ddd = "") {
  const cityKey = marketComparable(city);
  if (!cityKey || cityKey === "nao informado" || cityKey.length < 3) return false;

  const directCity = marketComparable(row.city || row.label || "");
  if (directCity && (directCity === cityKey || directCity.includes(cityKey) || cityKey.includes(directCity))) {
    return true;
  }

  const text = [
    row.label,
    row.keyword,
    row.campaign,
    row.adGroup,
    row.adSet
  ]
    .map((value) => marketComparable(value))
    .filter(Boolean)
    .join(" ");

  return text.includes(cityKey);
}

function marketSumRows(rows, field) {
  return (rows || []).reduce((total, row) => total + Number(row?.[field] || 0), 0);
}

function buildInvestmentSuggestions(payload) {
  const suggestions = [];
  const addSuggestion = (type, title, action, metric, basis, priority = 0) => {
    if (!title || !action || !basis) return;
    suggestions.push({ type, title, action, metric: metric || "", basis, priority });
  };

  const dddRows = payload.conversion?.byStateDdd || [];
  const keywordRows = payload.media?.byKeyword || [];
  const cityRows = payload.media?.byCity || [];
  const metaCampaignRows = payload.media?.byMetaCampaign || [];
  const metaAdRows = payload.media?.byMetaAd || [];

  const integratedPlace = dddRows
    .map((row) => {
      const { city, ddd } = marketPlaceFromDddLabel(row.label);
      const googleCityMatches = cityRows.filter((cityRow) => marketRowMatchesPlace(cityRow, city, ddd));
      const googleKeywordMatches = keywordRows.filter((keywordRow) => marketRowMatchesPlace(keywordRow, city, ddd));
      const metaMatches = [...metaCampaignRows, ...metaAdRows].filter((metaRow) => marketRowMatchesPlace(metaRow, city, ddd));
      const sourceCount = [
        Number(row.dialogues || 0) > 0 || Number(row.sales || 0) > 0,
        marketSumRows(googleCityMatches, "clicks") > 0 || marketSumRows(googleKeywordMatches, "clicks") > 0,
        marketSumRows(metaMatches, "clicks") > 0
      ].filter(Boolean).length;

      return {
        row,
        city,
        ddd,
        sourceCount,
        googleClicks: marketSumRows(googleCityMatches, "clicks"),
        googleConversions: marketSumRows(googleCityMatches, "conversions") + marketSumRows(googleKeywordMatches, "conversions"),
        googleSpend: marketSumRows(googleCityMatches, "spend") + marketSumRows(googleKeywordMatches, "spend"),
        metaClicks: marketSumRows(metaMatches, "clicks"),
        metaConversions: marketSumRows(metaMatches, "conversions"),
        metaSpend: marketSumRows(metaMatches, "spend"),
        score:
          Number(row.sales || 0) * 500 +
          Number(row.revenue || 0) / 100 +
          Number(row.dialogues || 0) * 2 +
          (marketSumRows(googleCityMatches, "conversions") + marketSumRows(googleKeywordMatches, "conversions")) * 250 +
          (marketSumRows(googleCityMatches, "clicks") + marketSumRows(googleKeywordMatches, "clicks")) * 0.6 +
          marketSumRows(metaMatches, "conversions") * 220 +
          marketSumRows(metaMatches, "clicks") * 0.5
      };
    })
    .filter((candidate) => {
      const cityKey = marketComparable(candidate.city);
      return cityKey && cityKey !== "nao informado" && candidate.sourceCount >= 2 && candidate.score > 0;
    })
    .sort((a, b) => b.score - a.score)[0];

  if (integratedPlace) {
    const placeLabel = `${integratedPlace.city}${integratedPlace.ddd ? ` / ${integratedPlace.ddd}` : ""}`;
    const mediaSignals = [
      integratedPlace.googleClicks ? `${integratedPlace.googleClicks} cliques Google` : "",
      integratedPlace.googleConversions ? `${marketRound(integratedPlace.googleConversions, 2).toLocaleString("pt-BR")} vendas Google` : "",
      integratedPlace.metaClicks ? `${integratedPlace.metaClicks} cliques Meta` : "",
      integratedPlace.metaConversions ? `${marketRound(integratedPlace.metaConversions, 2).toLocaleString("pt-BR")} vendas Meta` : ""
    ].filter(Boolean);
    addSuggestion(
      "Foco integrado",
      `Foco total de investimento em ${placeLabel}`,
      "Concentrar testes de verba, criativos e ofertas para essa praça, pois demanda comercial e mídia paga apontam para o mesmo lugar.",
      [
        `${integratedPlace.row.dialogues} diálogos`,
        `${integratedPlace.row.sales} vendas Asksuites`,
        `${marketRound(marketPct(integratedPlace.row.sales, integratedPlace.row.dialogues), 2).toLocaleString("pt-BR")}% conv.`,
        ...mediaSignals
      ].join(" | "),
      "Cruzamento de Asksuites, cidades físicas dos cliques no Google Ads, palavras/campanhas relacionadas e Meta Ads quando houver sinal por praça.",
      120
    );
  }

  const bestDdd = dddRows
    .filter((row) => Number(row.dialogues || 0) >= 20 && Number(row.sales || 0) > 0)
    .sort((a, b) => b.revenue - a.revenue || b.sales - a.sales || b.dialogues - a.dialogues)[0];
  if (bestDdd) {
    addSuggestion(
      "Origem da demanda",
      `Reforçar mídia para ${bestDdd.label}`,
      "Priorizar campanhas e criativos segmentados para essa praça, pois ela combina demanda e venda real.",
      `${bestDdd.dialogues} diálogos | ${bestDdd.sales} vendas | ${marketRound(bestDdd.conversion, 2).toLocaleString("pt-BR")}% conv.`,
      "Asksuites: cidade/DDD com maior combinação de diálogos, vendas e receita.",
      90
    );
  }

  const bestChannel = (payload.conversion?.byChannel || [])
    .filter((row) => Number(row.dialogues || 0) >= 20)
    .sort((a, b) => b.sales - a.sales || b.revenue - a.revenue || b.dialogues - a.dialogues)[0];
  if (bestChannel) {
    addSuggestion(
      "Canal",
      `Proteger verba e atenção para ${bestChannel.label}`,
      "Manter presença forte nesse canal e usar a taxa de conversão como referência para comparar novos investimentos.",
      `${bestChannel.dialogues} diálogos | ${bestChannel.sales} vendas | ${marketRound(marketPct(bestChannel.sales, bestChannel.dialogues), 2).toLocaleString("pt-BR")}% conv. | ${marketCurrency(bestChannel.revenue)}`,
      "Asksuites: canal com maior volume comercial no período filtrado.",
      80
    );
  }

  const lowConversionHighDemand = dddRows
    .filter((row) => Number(row.dialogues || 0) >= 50 && Number(row.conversion || 0) < 2)
    .sort((a, b) => b.dialogues - a.dialogues)[0];
  if (lowConversionHighDemand) {
    addSuggestion(
      "Recuperação",
      `Criar remarketing para ${lowConversionHighDemand.label}`,
      "Há procura, mas pouca venda. Testar criativos de urgência, prova social e oferta de retomada para esses contatos.",
      `${lowConversionHighDemand.dialogues} diálogos | ${marketRound(lowConversionHighDemand.conversion, 2).toLocaleString("pt-BR")}% conv.`,
      "Asksuites: praça com alto volume de diálogos e baixa conversão.",
      70
    );
  }

  const bestKeyword = keywordRows
    .filter((row) => Number(row.clicks || 0) >= 10 && Number(row.conversions || 0) > 0)
    .sort((a, b) => {
      const convA = marketSafeDiv(a.conversions, a.clicks);
      const convB = marketSafeDiv(b.conversions, b.clicks);
      return convB - convA || b.conversions - a.conversions || b.roas - a.roas;
    })[0];
  if (bestKeyword) {
    addSuggestion(
      "Google Ads",
      `Aumentar teste em "${bestKeyword.keyword || bestKeyword.label}"`,
      "Essa palavra-chave converte melhor que a média do card. Avaliar aumento controlado de orçamento e variações de anúncio.",
      `${bestKeyword.clicks} cliques | ${bestKeyword.conversions} vendas | ${marketRound(marketPct(bestKeyword.conversions, bestKeyword.clicks), 2).toLocaleString("pt-BR")}% conv.`,
      "Google Ads: palavra-chave com cliques e vendas no período selecionado.",
      85
    );
  }

  const bestCity = cityRows
    .filter((row) => Number(row.clicks || 0) >= 10 && Number(row.conversions || 0) > 0)
    .sort((a, b) => b.conversions - a.conversions || b.roas - a.roas || b.clicks - a.clicks)[0];
  if (bestCity) {
    addSuggestion(
      "Localização",
      `Revisar verba por cidade: ${bestCity.city || bestCity.label}`,
      "Usar essa cidade como referência de segmentação geográfica e comparar com as praças de maior diálogo no Asksuites.",
      `${bestCity.clicks} cliques | ${bestCity.conversions} vendas | ${marketRound(marketPct(bestCity.conversions, bestCity.clicks), 2).toLocaleString("pt-BR")}% conv. | ${marketCurrency(bestCity.spend)} investidos`,
      "Google Ads: cidade física de usuários que clicaram nos links patrocinados.",
      82
    );
  }

  const bestMetaAd = metaAdRows
    .filter((row) => Number(row.clicks || 0) >= 10 && Number(row.conversions || 0) > 0)
    .sort((a, b) => b.roas - a.roas || b.conversions - a.conversions || b.clicks - a.clicks)[0];
  if (bestMetaAd) {
    addSuggestion(
      "Meta Ads",
      `Escalar criativo "${bestMetaAd.label}"`,
      "Replicar linguagem, público ou oferta deste anúncio em novos testes, mantendo controle de custo por venda.",
      `${bestMetaAd.clicks} cliques | ${bestMetaAd.conversions} vendas | ${marketRound(marketPct(bestMetaAd.conversions, bestMetaAd.clicks), 2).toLocaleString("pt-BR")}% conv. | ${Number(bestMetaAd.roas || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x ROAS`,
      "Meta Ads: anúncio com conversões no período selecionado.",
      78
    );
  }

  const bestHotel = (payload.conversion?.byHotel || [])
    .filter((row) => !["sueds hotels", "sued's hotels"].includes(marketComparable(row.label)))
    .filter((row) => Number(row.dialogues || 0) >= 20)
    .sort((a, b) => b.opportunityIndex - a.opportunityIndex || b.dialogues - a.dialogues)[0];
  if (bestHotel) {
    addSuggestion(
      "Hotel",
      `Acompanhar oportunidade em ${bestHotel.label}`,
      "Cruzar demanda deste hotel com tarifa e disponibilidade antes de ampliar verba. Se houver inventário, criar campanha específica.",
      `${bestHotel.dialogues} diálogos | ${bestHotel.sales} vendas | ${marketRound(marketPct(bestHotel.sales, bestHotel.dialogues), 2).toLocaleString("pt-BR")}% conv. | índice ${bestHotel.opportunityIndex}`,
      "Asksuites: hotel com maior volume de oportunidade ainda não convertido.",
      65
    );
  }

  const conversionHighlights = [
    ...dddRows
      .filter((row) => Number(row.dialogues || 0) >= 20 && Number(row.sales || 0) > 0)
      .map((row) => ({
        source: "DDD",
        label: row.label,
        base: Number(row.dialogues || 0),
        result: Number(row.sales || 0),
        rate: marketPct(row.sales, row.dialogues)
      })),
    ...(payload.conversion?.byChannel || [])
      .filter((row) => Number(row.dialogues || 0) >= 20 && Number(row.sales || 0) > 0)
      .map((row) => ({
        source: "Canal",
        label: row.label,
        base: Number(row.dialogues || 0),
        result: Number(row.sales || 0),
        rate: marketPct(row.sales, row.dialogues)
      })),
    ...(payload.conversion?.byHotel || [])
      .filter((row) => Number(row.dialogues || 0) >= 20 && Number(row.sales || 0) > 0)
      .map((row) => ({
        source: "Hotel",
        label: row.label,
        base: Number(row.dialogues || 0),
        result: Number(row.sales || 0),
        rate: marketPct(row.sales, row.dialogues)
      })),
    ...keywordRows
      .filter((row) => Number(row.clicks || 0) >= 10 && Number(row.conversions || 0) > 0)
      .map((row) => ({
        source: "Google",
        label: row.keyword || row.label,
        base: Number(row.clicks || 0),
        result: Number(row.conversions || 0),
        rate: marketPct(row.conversions, row.clicks)
      })),
    ...cityRows
      .filter((row) => Number(row.clicks || 0) >= 10 && Number(row.conversions || 0) > 0)
      .map((row) => ({
        source: "Cidade Google",
        label: row.city || row.label,
        base: Number(row.clicks || 0),
        result: Number(row.conversions || 0),
        rate: marketPct(row.conversions, row.clicks)
      })),
    ...metaAdRows
      .filter((row) => Number(row.clicks || 0) >= 10 && Number(row.conversions || 0) > 0)
      .map((row) => ({
        source: "Meta",
        label: row.label,
        base: Number(row.clicks || 0),
        result: Number(row.conversions || 0),
        rate: marketPct(row.conversions, row.clicks)
      }))
  ]
    .filter((row) => Number.isFinite(row.rate) && row.rate > 0)
    .sort((a, b) => b.rate - a.rate || b.result - a.result || b.base - a.base)
    .slice(0, 5);

  if (conversionHighlights.length) {
    addSuggestion(
      "Destaques de conversão",
      "5 maiores taxas de conversão",
      "Usar estes recortes como referência para novos testes de verba, criativos e segmentação, sempre validando volume antes de escalar.",
      conversionHighlights
        .map((row, index) => `${index + 1}. ${row.source}: ${row.label} (${marketRound(row.rate, 2).toLocaleString("pt-BR")}% | ${row.result}/${row.base})`)
        .join(" | "),
      "Ranking calculado com recortes que tiveram volume mínimo e pelo menos uma venda/conversão no período filtrado.",
      77
    );
  }

  return suggestions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 7);
}

function demandLabelFromDialogues(dialogues = 0) {
  const value = Number(dialogues) || 0;
  if (value >= 100) return "Alta";
  if (value >= 30) return "Média";
  if (value > 0) return "Baixa";
  return "";
}

function enrichVetorRowsWithDemand(rows = [], byHotel = []) {
  const demandByHotel = new Map((byHotel || []).map((row) => [marketComparable(row.label), row]));
  return (rows || []).map((row) => {
    const demandRow = demandByHotel.get(marketComparable(row.hotel));
    const demand = row.demand || demandLabelFromDialogues(demandRow?.dialogues || 0);
    return {
      ...row,
      demand,
      demandDialogues: demandRow?.dialogues || 0,
      demandSales: demandRow?.sales || 0
    };
  });
}

async function loadVetorTradeCompetitiveness({ checkinMonth, hotel } = {}, byHotel = []) {
  const month = /^\d{4}-\d{2}$/.test(String(checkinMonth || "")) ? checkinMonth : nextCheckinMonthKey();
  if (!VETOR_TRADE_API_URL) {
    return {
      source: "not_configured",
      checkinMonth: month,
      rows: [],
      alerts: [],
      message: "Configure VETOR_TRADE_API_URL para consumir o resumo calculado no Vetor Trade."
    };
  }

  try {
    const params = new URLSearchParams({ checkin_month: month });
    if (hotel) params.set("hotel", hotel);
    const response = await fetch(`${VETOR_TRADE_API_URL}/api/competitividade-sueds?${params.toString()}`, {
      headers: VETOR_TRADE_SHARED_TOKEN ? { "x-vetor-token": VETOR_TRADE_SHARED_TOKEN } : {}
    });
    if (!response.ok) throw new Error(`Vetor Trade retornou HTTP ${response.status}`);
    const payload = await response.json();
    const rows = enrichVetorRowsWithDemand(payload.rows || [], byHotel);
    return {
      source: payload.source || "vetor_trade",
      checkinMonth: payload.checkinMonth || month,
      rows,
      alerts: (payload.alerts || []).length
        ? payload.alerts
        : rows
          .filter((row) => row.demand === "Alta" || Math.abs(Number(row.diffPct) || 0) >= 8)
          .map((row) => ({
            hotel: row.hotel,
            message: row.opportunity,
            suggestion: row.suggestion,
            competitors: row.competitors || []
          })),
      message: payload.message || ""
    };
  } catch (error) {
    return {
      source: "error",
      checkinMonth: month,
      rows: [],
      alerts: [],
      message: `Falha ao consultar Vetor Trade: ${error.message}`
    };
  }
}

async function buildMarketIntelligencePayload(filters = {}) {
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(filters.date || "")) ? filters.date : "";
  const requestedMonth = filters.month && (filters.month === "ytd" || /^\d{4}$/.test(filters.month) || /^\d{4}-\d{2}$/.test(filters.month))
    ? filters.month
    : "";
  const { month } = requestedMonth ? marketDateRangeForMonth(requestedMonth) : { month: "" };
  const allMarketRows = await loadAsksuiteMarketRawRows();
  const selectedMonths = normalizeMarketMonthList(filters.months || []);
  const activeMonths = selectedDate ? [selectedDate.slice(0, 7)] : (selectedMonths.length ? selectedMonths : normalizeMarketMonthList([month]));
  const asksuiteMarketRows = selectedDate
    ? loadAsksuiteMarketRowsForDateFromRaw(allMarketRows, selectedDate)
    : (activeMonths.length > 1
      ? loadAsksuiteMarketRowsForMonthsFromRaw(allMarketRows, activeMonths)
      : (activeMonths.length ? loadAsksuiteMarketRowsFromRaw(allMarketRows, activeMonths[0]) : []));
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
  const checkinMonth = /^\d{4}-\d{2}$/.test(String(filters.checkinMonth || ""))
    ? filters.checkinMonth
    : nextCheckinMonthKey();
  const competitiveness = await loadVetorTradeCompetitiveness({ checkinMonth, hotel: filters.hotel }, byHotel);

  const payload = {
    audience: "gestores-inteligencia-mercado",
    generatedAt: new Date().toISOString(),
    period: { month: activeMonths[0] || month, months: activeMonths, date: selectedDate },
    integrations: {
      asksuite: {
        configured: Boolean(asksuiteMarketRows.length),
        source: marketSource,
        rows: asksuiteMarketRows.length,
        note: asksuiteMarketRows.length
          ? "Diálogos vêm dos atendimentos; cotações e reservas usam a coluna Oportunidades; vendas e receita usam Vendas e Valor vendido."
          : "Sem relatório Asksuite carregado para este período."
      },
      vetorTrade: {
        configured: Boolean(VETOR_TRADE_API_URL),
        source: competitiveness.source,
        checkinMonth: competitiveness.checkinMonth,
        message: competitiveness.message || ""
      }
    },
    filters: {
      selected: { ...filters, date: selectedDate, months: activeMonths, checkinMonth: competitiveness.checkinMonth },
      periods: marketAvailablePeriodsFromRows(allMarketRows),
      checkinMonths: marketCheckinMonthOptions(),
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
      checkinMonth: competitiveness.checkinMonth,
      rows: competitiveness.rows,
      alerts: competitiveness.alerts,
      message: competitiveness.message || ""
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
  const emptyAdsPayload = {
    configured: false,
    source: "empty",
    campaigns: [],
    ads: [],
    keywords: [],
    geoCities: [],
    summary: { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 }
  };
  const selectedDateAdsPeriod = selectedDate
    ? { month: selectedDate.slice(0, 7), startDate: selectedDate, endDate: selectedDate }
    : null;
  const [googleAds, metaAds] = await Promise.all([
    selectedDateAdsPeriod
      ? loadGoogleAdsMetrics(selectedDateAdsPeriod)
      : activeMonths.length > 1
      ? loadGoogleAdsMetricsForMonths(activeMonths)
      : (activeMonths.length ? loadGoogleAdsMetrics({ month: activeMonths[0] }) : emptyAdsPayload),
    selectedDateAdsPeriod
      ? loadMetaAdsMetrics(selectedDateAdsPeriod)
      : activeMonths.length > 1
      ? loadMetaAdsMetricsForMonths(activeMonths)
      : (activeMonths.length ? loadMetaAdsMetrics({ month: activeMonths[0] }) : emptyAdsPayload)
  ]);
  const enrichedPayload = applyGoogleAdsMetricsToMarketPayload(payload, googleAds, filters, metaAds);
  enrichedPayload.opportunities = {
    ...(enrichedPayload.opportunities || {}),
    suggestions: buildInvestmentSuggestions(enrichedPayload)
  };
  return enrichedPayload;
}

function marketFiltersFromUrl(url) {
  const period = url.searchParams.get("month") || "";
  const months = normalizeMarketMonthList((url.searchParams.get("months") || "").split(","));
  const date = url.searchParams.get("date") || "";
  return {
    month: period === "ytd" || /^\d{4}$/.test(period) || /^\d{4}-\d{2}$/.test(period) ? period : undefined,
    months,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    hotel: url.searchParams.get("hotel") || "",
    state: url.searchParams.get("state") || "",
    ddd: url.searchParams.get("ddd") || "",
    channel: url.searchParams.get("channel") || "",
    campaign: url.searchParams.get("campaign") || "",
    origin: url.searchParams.get("origin") || "",
    device: url.searchParams.get("device") || "",
    checkinMonth: /^\d{4}-\d{2}$/.test(url.searchParams.get("checkinMonth") || "")
      ? url.searchParams.get("checkinMonth")
      : ""
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
  const [dataset, analytics, asksuiteMarketRows] = await Promise.all([
    loadDataset(),
    loadAnalyticsMetrics(period),
    loadAsksuiteMarketRawRows()
  ]);
  const metrics = buildMetrics(dataset.records, dataset.goals, period);
  metrics.sellers = mergeRobotSeller(metrics.sellers, buildRobotSellerFromAsksuiteMarketRows(asksuiteMarketRows, period));
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
  const relativePath = safePath.replace(/^[/\\]+/, "");
  const candidates = [
    path.join(__dirname, relativePath),
    path.join(__dirname, "public", relativePath)
  ];

  function readCandidate(index = 0) {
    const filePath = candidates[index];
    if (!filePath || !filePath.startsWith(__dirname)) return notFound(res);

    fs.readFile(filePath, (error, content) => {
      if (error) return readCandidate(index + 1);
      const ext = path.extname(filePath);
      res.writeHead(200, { "content-type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(content);
    });
  }

  readCandidate();
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
        metaAdsConfigured: metaAdsConfigured(),
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

    if (url.pathname === "/api/tv-messages") {
      if (req.method === "GET") {
        const includeExpired = url.searchParams.get("includeExpired") === "1" && hasManagerAccess(req, url);
        return json(res, 200, { ok: true, messages: await readTvMessages(includeExpired) });
      }

      if (req.method === "POST") {
        if (!hasManagerAccess(req, url)) return forbidden(res);
        try {
          const body = await readJsonBody(req);
          return json(res, 200, { ok: true, messages: await appendTvMessage(body.message, body.expiresAt) });
        } catch (error) {
          return json(res, 500, { ok: false, error: "tv_message_failed", message: tvMessageErrorMessage(error) });
        }
      }

      return json(res, 405, { ok: false, error: "method_not_allowed" });
    }

    if (url.pathname === "/api/dashboard/gestores") {
      if (!hasManagerAccess(req, url)) return forbidden(res);
      if (url.searchParams.get("authOnly") === "1") return json(res, 200, { ok: true });
      const metrics = await loadMetrics(periodFromUrl(url));
      return json(res, 200, buildManagerPayload(metrics));
    }

    if (url.pathname === "/api/dashboard/vendedores") {
      const metrics = await loadMetrics(periodFromUrl(url));
      return json(res, 200, buildSellersPayload(metrics));
    }

    if (url.pathname === "/api/dashboard/tv") {
      const metrics = await loadMetrics(periodFromUrl(url));
      return json(res, 200, buildTvPayload(metrics));
    }

    if (url.pathname === "/api/operacional/tv") {
      if (!hasManagerAccess(req, url)) return forbidden(res);
      if (url.searchParams.get("view") === "hotel") {
        return json(res, 200, await buildOperationalHotelPayload(periodFromUrl(url)));
      }
      return json(res, 200, await buildOperationalTvPayload(periodFromUrl(url)));
    }

    if (url.pathname === "/api/operacional/opinarios") {
      if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
      const body = await readJsonBody(req);
      return json(res, 200, { ok: true, opinion: await appendDigitalOpinion(body) });
    }

    if (url.pathname === "/api/operacional/opinarios-omr") {
      if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
      if (!hasOmrAccess(req, url)) return forbidden(res);
      const body = await readJsonBody(req, 18000000);
      return json(res, 200, await readPlazaOpinionOmr(body));
    }

    if (url.pathname === "/api/operacional/opinarios-upload") {
      if (!OPINION_UPLOAD_TOKEN) {
        return json(res, 503, { ok: false, error: "upload_not_configured", message: "Envio ainda nao configurado no Vercel." });
      }
      if (req.method === "GET") {
        setOpinionUploadSessionCookie(req, res);
        return json(res, 200, { ok: true, hotel: "SUEDS PLAZA", hotelSlug: "sueds-plaza", maxBytes: OPINION_UPLOAD_MAX_BYTES });
      }
      if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
      if (!hasOpinionUploadAccess(req, url)) return forbidden(res);
      try {
        const photo = await uploadOpinionPhoto(req, await readBinaryBody(req));
        return json(res, 200, { ok: true, photo });
      } catch (error) {
        const status = /limite|grande/i.test(error.message) ? 413 : /formato|vazia|hotel/i.test(error.message) ? 400 : 500;
        return json(res, status, { ok: false, error: "opinion_upload_failed", message: error.message });
      }
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

module.exports = {
  handleRequest,
  __test: {
    detectOmrGuideMarkers,
    detectOmrBubbleCandidates,
    detectOmrBubbleGrid,
    readPlazaOpinionOmr
  }
};
