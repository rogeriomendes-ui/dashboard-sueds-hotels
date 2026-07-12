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
    scope: "https://www.googleapis.com/auth/spreadsheets",
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

async function readRange(range) {
  const token = await accessToken();
  const id = process.env.GOOGLE_SHEET_ID;
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).values || [];
}

async function batchWrite(data) {
  const token = await accessToken();
  const id = process.env.GOOGLE_SHEET_ID;
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function normalize(value) { return String(value || "").trim().toUpperCase().replace(/\s+/g, ""); }

async function main() {
  const [site, sales] = await Promise.all([
    readRange("Site!A2:K100"),
    readRange("Lancamento_Vendas!A2:T1200")
  ]);
  const sourceByCode = new Map(site.filter((row) => normalize(row[1])).map((row) => [normalize(row[1]), row]));
  const writes = [];
  const repaired = [];

  sales.forEach((row, index) => {
    const rowNumber = index + 2;
    const code = normalize(row[1]);
    const channel = normalize(row[3]);
    const source = sourceByCode.get(code);
    if (channel !== "SITE" || !source) return;
    const creationDate = source[3] || "";
    const checkin = source[4] || "";
    const checkout = source[5] || "";
    writes.push({ range: `Lancamento_Vendas!A${rowNumber}`, values: [[creationDate]] });
    writes.push({ range: `Lancamento_Vendas!G${rowNumber}:I${rowNumber}`, values: [[
      checkin,
      checkout,
      `=IF(OR(G${rowNumber}="",H${rowNumber}=""),"",H${rowNumber}-G${rowNumber})`
    ]] });
    repaired.push({ row: rowNumber, code, creationDate, checkin, checkout });
  });

  if (!writes.length) throw new Error("Nenhuma venda SITE correspondente foi localizada.");
  const result = await batchWrite(writes);
  console.log(JSON.stringify({ repaired: repaired.length, rows: repaired, updatedCells: result.totalUpdatedCells }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
