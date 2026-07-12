const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
loadEnv(path.join(ROOT, ".env"));

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
    const text = line.trim();
    if (!text || text.startsWith("#")) return;
    const at = text.indexOf("=");
    if (at < 0) return;
    const key = text.slice(0, at).trim();
    let value = text.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  });
}

function base64url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function serviceAccount() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  return {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  };
}

async function accessToken() {
  const account = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` })
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).access_token;
}

async function readRange(range, render = "FORMATTED_VALUE") {
  const token = await accessToken();
  const id = process.env.GOOGLE_SHEET_ID;
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", render);
  url.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).values || [];
}

function text(value) { return String(value ?? "").trim(); }
function realSale(row) {
  const date = text(row[0]);
  const code = text(row[1]);
  const hotel = text(row[2]);
  const client = text(row[5]);
  const total = text(row[12]);
  return Boolean(date || code || (hotel && client && total && total !== "#REF!"));
}

async function main() {
  const [sales, site] = await Promise.all([
    readRange("Lancamento_Vendas!A2:T1200"),
    readRange("Site!A1:K100")
  ]);
  const realRows = sales.map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }) => realSale(row));
  const siteRows = realRows.filter(({ row }) => text(row[3]).toUpperCase() === "SITE");
  const brokenRows = sales.map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }) => row.some((value) => text(value).includes("#REF!")));
  console.log(JSON.stringify({
    returnedSalesRows: sales.length,
    realSales: realRows.length,
    firstRealRow: realRows[0]?.rowNumber || null,
    lastRealRow: realRows.at(-1)?.rowNumber || null,
    siteSales: siteRows.length,
    siteTargetRows: siteRows.map(({ rowNumber }) => rowNumber),
    brokenRows: brokenRows.slice(0, 30).map(({ rowNumber }) => rowNumber),
    sourceSiteRows: Math.max(site.length - 1, 0),
    sourceSiteDates: site.slice(1).map((row) => ({ code: row[1], creationDate: row[3], checkin: row[4], checkout: row[5] }))
  }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
