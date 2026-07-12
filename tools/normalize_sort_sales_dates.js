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

async function request(url, options = {}) {
  const token = await accessToken();
  const response = await fetch(url, {
    ...options,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}

async function readRange(range) {
  const id = process.env.GOOGLE_SHEET_ID;
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  return (await request(url)).values || [];
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!match) return "";
  let year = Number(match[3] || 2026);
  if (year < 100) year += 2000;
  return `${String(match[1]).padStart(2, "0")}/${String(match[2]).padStart(2, "0")}/${year}`;
}

function hasSale(row) {
  return Boolean(String(row[0] || "").trim() || String(row[1] || "").trim());
}

async function main() {
  const id = process.env.GOOGLE_SHEET_ID;
  const [rows, metadata] = await Promise.all([
    readRange("Lancamento_Vendas!A2:T1200"),
    request(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`)
  ]);
  const sheet = metadata.sheets.find((item) => item.properties.title === "Lancamento_Vendas");
  if (!sheet) throw new Error("Aba Lancamento_Vendas nao encontrada.");

  let lastDataIndex = -1;
  rows.forEach((row, index) => { if (hasSale(row)) lastDataIndex = index; });
  if (lastDataIndex < 0) throw new Error("Nenhuma venda encontrada.");

  const data = [];
  for (let index = 0; index <= lastDataIndex; index += 1) {
    const row = rows[index] || [];
    const rowNumber = index + 2;
    const saleDate = normalizeDate(row[0]);
    const checkin = normalizeDate(row[6]);
    const checkout = normalizeDate(row[7]);
    if (saleDate) data.push({ range: `Lancamento_Vendas!A${rowNumber}`, values: [[saleDate]] });
    if (checkin) data.push({ range: `Lancamento_Vendas!G${rowNumber}`, values: [[checkin]] });
    if (checkout) data.push({ range: `Lancamento_Vendas!H${rowNumber}`, values: [[checkout]] });
    if (checkin && checkout) data.push({ range: `Lancamento_Vendas!I${rowNumber}`, values: [[`=H${rowNumber}-G${rowNumber}`]] });
  }

  await request(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
  });

  const sheetId = sheet.properties.sheetId;
  const endRowIndex = lastDataIndex + 2;
  await request(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex, startColumnIndex: 0, endColumnIndex: 1 },
          cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } } },
          fields: "userEnteredFormat.numberFormat"
        }
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex, startColumnIndex: 6, endColumnIndex: 8 },
          cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } } },
          fields: "userEnteredFormat.numberFormat"
        }
      },
      {
        sortRange: {
          range: { sheetId, startRowIndex: 1, endRowIndex, startColumnIndex: 0, endColumnIndex: 20 },
          sortSpecs: [{ dimensionIndex: 0, sortOrder: "ASCENDING" }]
        }
      }
    ] })
  });

  console.log(JSON.stringify({ normalizedRows: lastDataIndex + 1, sortedThroughRow: endRowIndex }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
