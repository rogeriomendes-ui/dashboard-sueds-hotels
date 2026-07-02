const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SHEET_NAME = "Recuperação de carrinhos";
const READ_RANGE = `'${SHEET_NAME}'!A:U`;
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const RESPONSIBLE_ROTATION = ["Aline Nunes", "Emanoel Cesar", "Amanda Melgaco", "Julia Reche"];
const DISTRIBUTION_START_DATE = "2026-07-01";
const APPLY = process.argv.includes("--apply");

loadEnvFile(path.join(ROOT, ".env"));

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
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

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getServiceAccount() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  }
  return {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  };
}

async function getAccessToken() {
  const account = getServiceAccount();
  if (!account?.client_email || !account?.private_key) {
    throw new Error("Credenciais Google nao configuradas.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: account.client_email,
    scope: WRITE_SCOPE,
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

  if (!response.ok) throw new Error(`Token Google falhou: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

async function sheetsValues(method, range, body) {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID nao configurado.");
  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`);
  if (method === "GET") {
    url.searchParams.set("majorDimension", "ROWS");
    url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
    url.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
  } else {
    url.searchParams.set("valueInputOption", "USER_ENTERED");
  }
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) throw new Error(`Sheets ${method} falhou: ${response.status} ${await response.text()}`);
  return response.json();
}

async function batchUpdate(data) {
  const token = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
  });
  if (!response.ok) throw new Error(`Sheets batchUpdate falhou: ${response.status} ${await response.text()}`);
  return response.json();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function padRow(row, length) {
  return [...row, ...Array(Math.max(0, length - row.length)).fill("")].slice(0, length);
}

function parseNiaraDateTime(value) {
  if (typeof value === "number") {
    return new Date(Date.UTC(1899, 11, 30 + value)).getTime();
  }

  const text = normalizeText(value);
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (br) {
    return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] || 0), Number(br[5] || 0)).getTime();
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0)).getTime();
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

async function main() {
  const values = (await sheetsValues("GET", READ_RANGE)).values || [];
  const startAt = parseNiaraDateTime(`${DISTRIBUTION_START_DATE} 00:00`);
  const rows = values
    .slice(1)
    .map((row, index) => ({ rowNumber: index + 2, row: padRow(row, 21) }))
    .filter((item) => normalizeText(item.row[0]) && parseNiaraDateTime(item.row[1]) >= startAt)
    .sort((a, b) => parseNiaraDateTime(a.row[1]) - parseNiaraDateTime(b.row[1]));

  const updates = [];
  rows.forEach((item, index) => {
    const currentResponsible = normalizeText(item.row[17]);
    if (currentResponsible && currentResponsible !== "Selecione") return;
    updates.push({
      range: `'${SHEET_NAME}'!R${item.rowNumber}`,
      values: [[RESPONSIBLE_ROTATION[index % RESPONSIBLE_ROTATION.length]]]
    });
  });

  const summary = {
    mode: APPLY ? "apply" : "dry-run",
    startDate: DISTRIBUTION_START_DATE,
    rowsFromStartDate: rows.length,
    assignmentsPrepared: updates.length,
    assignments: updates.map((update) => ({ range: update.range, responsible: update.values[0][0] }))
  };

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (updates.length) await batchUpdate(updates);
  console.log(JSON.stringify({ ...summary, applied: true }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
