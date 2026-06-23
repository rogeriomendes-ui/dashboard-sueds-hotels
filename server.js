const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const SHEET_ID = process.env.GOOGLE_SHEET_ID || "";
const BASE_RANGE = process.env.GOOGLE_BASE_RANGE || "Base_Dashboard!A:Y";
const METAS_RANGE = process.env.GOOGLE_METAS_RANGE || "Metas!A:H";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_SECONDS || 60) * 1000;
const TIME_ZONE = "America/Sao_Paulo";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GESTORES_ACCESS_TOKEN = process.env.GESTORES_ACCESS_TOKEN || "";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

let tokenCache = { accessToken: "", expiresAt: 0 };
let dataCache = { expiresAt: 0, payload: null };

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

async function getAccessToken() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 30000) {
    return tokenCache.accessToken;
  }

  const account = getServiceAccount();
  if (!account) {
    throw new Error("Google credentials are not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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
  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000
  };
  return tokenCache.accessToken;
}

async function getSheetValues(range) {
  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`);
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

function parseNumber(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const normalized = String(value).replace(/[R$\s.]/g, "").replace(",", ".");
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
    hotel: String(item["Hotel Normalizado"] || item["Hotel"] || "").trim(),
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
    "BETE GERENTE": "Bete Gerente",
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
    hotel: String(item.Hotel || "").trim(),
    channel: String(item.Canal || "").trim(),
    seller: normalizeSellerName(item.Responsavel || item.Vendedor || ""),
    revenueGoal: parseNumber(item["Meta Receita"]),
    reservationGoal: parseNumber(item["Meta Reservas"])
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

function daysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return 30;
  return new Date(year, monthNumber, 0).getDate();
}

const BETE_TEAM = ["Aline Nunes", "Amanda Melgaco", "Julia Reche", "Emanoel Cesar"];

function buildMetrics(records, goals, period = {}) {
  const today = period.date || todayKey();
  const month = period.month || today.slice(0, 7);
  const selectedDay = period.day || "";
  const goalDate = selectedDay || today;
  const selectedHotel = period.hotel || "";
  const selectedChannel = period.channel || "";
  const confirmed = records.filter((record) => record.status.toLowerCase() === "confirmada");
  const monthRecords = confirmed.filter((record) => record.monthKey === month);
  const filteredRecords = monthRecords.filter((record) => {
    const matchesDay = !selectedDay || record.dateKey === selectedDay;
    const matchesHotel = !selectedHotel || comparableKey(record.hotel) === comparableKey(selectedHotel);
    const matchesChannel = !selectedChannel || comparableKey(record.channel) === comparableKey(selectedChannel);
    return matchesDay && matchesHotel && matchesChannel;
  });
  const todayRecords = filteredRecords.filter((record) => record.dateKey === today);
  const selectedDayRecords = selectedDay ? filteredRecords : todayRecords;

  const sellerNames = new Set([
    ...filteredRecords.map((record) => record.seller).filter(Boolean),
    ...goals.filter((goal) => goal.month === month || goal.date === goalDate).map((goal) => goal.seller).filter(Boolean)
  ]);

  const recordsBySeller = groupBy(filteredRecords, (record) => record.seller);
  let sellers = [...sellerNames]
    .map((seller) => {
      const sellerRecords = recordsBySeller.get(seller) || [];
      const dayRecords = selectedDay ? sellerRecords : sellerRecords.filter((record) => record.dateKey === today);
      const goal = sellerGoal(goals, seller, month, goalDate);
      const dayRevenue = sum(dayRecords, (record) => record.total);
      const monthRevenue = sum(sellerRecords, (record) => record.total);
      const dailyGoal = goal?.date === goalDate ? goal.revenueGoal : (goal?.revenueGoal ? goal.revenueGoal / daysInMonth(month) : 0);
      const monthlyGoal = goal?.revenueGoal || 0;

      return {
        name: seller,
        salesToday: dayRevenue,
        salesMonth: monthRevenue,
        reservationsToday: dayRecords.length,
        reservationsMonth: sellerRecords.length,
        dailyGoal,
        monthlyGoal,
        dailyGoalPct: pct(dayRevenue, dailyGoal),
        monthlyGoalPct: pct(monthRevenue, monthlyGoal)
      };
    })
    .sort((a, b) => b.salesMonth - a.salesMonth);

  const bete = sellers.find((seller) => seller.name === "Bete Gerente");
  if (bete) {
    const teamSellers = sellers.filter((seller) => BETE_TEAM.includes(seller.name));
    const teamSalesToday = sum(teamSellers, (seller) => seller.salesToday);
    const teamSalesMonth = sum(teamSellers, (seller) => seller.salesMonth);
    const teamReservationsToday = sum(teamSellers, (seller) => seller.reservationsToday);
    const teamReservationsMonth = sum(teamSellers, (seller) => seller.reservationsMonth);
    bete.salesToday = teamSalesToday;
    bete.salesMonth = teamSalesMonth;
    bete.reservationsToday = teamReservationsToday;
    bete.reservationsMonth = teamReservationsMonth;
    bete.dailyGoalPct = pct(teamSalesToday, bete.dailyGoal);
    bete.monthlyGoalPct = pct(teamSalesMonth, bete.monthlyGoal);
  }

  sellers = sellers.sort((a, b) => b.salesMonth - a.salesMonth);

  const channelLabels = new Set([
    ...filteredRecords.map((record) => record.channel).filter(Boolean),
    ...goals.filter((goal) => goal.month === month && goal.channel).map((goal) => goal.channel)
  ]);

  const recordsByChannel = groupBy(filteredRecords, (record) => record.channel);
  const channels = [...channelLabels]
    .map((label) => {
      const rows = recordsByChannel.get(label) || [];
      const goal = dimensionGoal(goals, "channel", label, month);
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
      channels: sortLabels(new Set(monthRecords.map((record) => record.channel)))
    },
    summary: {
      salesToday: sum(selectedDayRecords, (record) => record.total),
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
    channels: metrics.channels,
    hotels: metrics.hotels,
    dailySales: metrics.dailySales
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
  "Bete Gerente",
  "Emanoel Cesar",
  "Julia Reche",
  "Amanda Melgaco",
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
      .sort((a, b) => tvOrder(a.name) - tvOrder(b.name))
      .map((seller) => ({
        name: seller.name,
        reservationsToday: seller.reservationsToday,
        reservationsMonth: seller.reservationsMonth,
        dailyGoalPct: seller.dailyGoalPct,
        monthlyGoalPct: seller.monthlyGoalPct,
        dailyStatus: statusFromPct(seller.dailyGoalPct),
        monthlyStatus: statusFromPct(seller.monthlyGoalPct)
      }))
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

  return { records, goals };
}

async function loadDataset() {
  if (dataCache.payload && Date.now() < dataCache.expiresAt) {
    return dataCache.payload;
  }

  let records;
  let goals;

  if (!SHEET_ID || !getServiceAccount()) {
    const demo = demoDataset();
    records = demo.records;
    goals = demo.goals;
  } else {
    const [baseRows, goalRows] = await Promise.all([
      getSheetValues(BASE_RANGE),
      getSheetValues(METAS_RANGE)
    ]);
    records = rowsToObjects(baseRows).map(normalizeRecord);
    goals = rowsToObjects(goalRows, { keepAnyValue: true }).map(normalizeGoal);
  }

  const payload = { records, goals, loadedAt: new Date().toISOString() };
  dataCache = { payload, expiresAt: Date.now() + CACHE_TTL_MS };
  return payload;
}

async function loadMetrics(period) {
  const dataset = await loadDataset();
  return buildMetrics(dataset.records, dataset.goals, period);
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
