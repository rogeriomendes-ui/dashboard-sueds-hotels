const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const inputArg = args.find((arg) => !arg.startsWith("--"));
const INPUT_FILE = inputArg || path.join(process.env.USERPROFILE || "C:\\Users\\roger", "Downloads", "por_atendente.xlsx");
const APPLY = args.includes("--apply");
const DATE_ARG = (args.find((arg) => arg.startsWith("--date=")) || "").slice("--date=".length);
const SUMMARY_MONTH = (args.find((arg) => arg.startsWith("--summary=")) || "").slice("--summary=".length);
const SHEET_NAME = "Asksuite_Atendimentos";
const READ_RANGE = `'${SHEET_NAME}'!A:H`;
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const PYTHON = process.env.PYTHON_EXE
  || "C:\\Users\\roger\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

loadEnvFile(path.join(ROOT, ".env"));

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const HEADERS = [
  "Data",
  "Atendente",
  "Atendimentos",
  "Conv Atendimento %",
  "Oportunidades",
  "Conv Vendas %",
  "Vendas",
  "Receita"
];
const ALLOWED_SELLERS = new Set(["Aline Nunes", "Amanda Melgaco", "Julia Reche", "Emanoel Cesar"]);

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
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
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
  if (!account?.client_email || !account?.private_key) throw new Error("Credenciais Google nao configuradas.");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({
    iss: account.client_email,
    scope: WRITE_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }))}`;
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

async function googleRequest(url, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Google API falhou: ${response.status} ${await response.text()}`);
  return response.json();
}

async function ensureSheet() {
  const spreadsheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`;
  const spreadsheet = await googleRequest(spreadsheetUrl);
  const exists = (spreadsheet.sheets || []).some((sheet) => sheet.properties?.title === SHEET_NAME);
  if (exists) return;

  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`;
  await googleRequest(batchUrl, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: SHEET_NAME,
              gridProperties: { rowCount: 1000, columnCount: 8 }
            }
          }
        }
      ]
    })
  });
}

async function sheetsValues(method, range, body) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`);
  if (method === "GET") {
    url.searchParams.set("majorDimension", "ROWS");
    url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
    url.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
  } else {
    url.searchParams.set("valueInputOption", "USER_ENTERED");
  }
  return googleRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined
  });
}

async function batchUpdate(data) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`;
  return googleRequest(url, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
  });
}

function normalizeName(value) {
  const key = String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const map = {
    "ALINE NUNES": "Aline Nunes",
    "AMANDA MELGACO": "Amanda Melgaco",
    "JULIA RECHE": "Julia Reche",
    "EMANOEL CESAR": "Emanoel Cesar"
  };
  if (key.includes("ALINE NUNES")) return "Aline Nunes";
  if (key.includes("AMANDA MELGACO")) return "Amanda Melgaco";
  if (key.includes("JULIA RECHE")) return "Julia Reche";
  if (key.includes("EMANOEL CESAR")) return "Emanoel Cesar";
  return map[key] || String(value || "").trim();
}

function parseDateFromFile(filePath) {
  if (DATE_ARG) return DATE_ARG;
  const match = path.basename(filePath).match(/(\d{2})_(\d{2})_(\d{4})/);
  if (!match) throw new Error("Nao encontrei a data no nome do arquivo. Use --date=AAAA-MM-DD.");
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function readWorkbookRows(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Arquivo nao encontrado: ${filePath}`);
  const code = String.raw`
import json
import sys
from datetime import date, datetime
from openpyxl import load_workbook
ws = load_workbook(sys.argv[1], data_only=True).active
rows = []
for row in ws.iter_rows(values_only=True):
    values = []
    for value in row:
        if value is None:
            values.append("")
        elif isinstance(value, (datetime, date)):
            values.append(value.isoformat(sep=" "))
        else:
            values.append(value)
    rows.append(values)
print(json.dumps(rows, ensure_ascii=False))
`;
  const result = spawnSync(PYTHON, ["-c", code, filePath], {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`Falha ao ler Excel: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function findHeader(headers, expected) {
  const key = normalizeHeader(expected);
  return headers.findIndex((header) => normalizeHeader(header) === key);
}

function findAllHeaders(headers, expected) {
  const key = normalizeHeader(expected);
  return headers
    .map((header, index) => normalizeHeader(header) === key ? index : -1)
    .filter((index) => index !== -1);
}

function normalizeDateKey(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return "";
}

function toNumber(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").replace(/[R$%\s]/g, "").trim();
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function percentage(part, total) {
  return total ? (Number(part || 0) / Number(total || 0)) * 100 : 0;
}

function normalizeDetailedRows(rows, indexes) {
  const grouped = new Map();
  rows.slice(1).forEach((row) => {
    const seller = normalizeName(row[indexes.attendant]);
    if (!ALLOWED_SELLERS.has(seller)) return;
    const date = normalizeDateKey(row[indexes.start]);
    if (!date) return;

    const key = `${date}|${seller}`.toUpperCase();
    const current = grouped.get(key) || {
      date,
      seller,
      attendances: 0,
      opportunities: 0,
      sales: 0,
      revenue: 0
    };
    current.attendances += 1;
    current.opportunities += toNumber(row[indexes.opportunities]);
    current.sales += toNumber(row[indexes.sales]);
    current.revenue += toNumber(row[indexes.revenue]);
    grouped.set(key, current);
  });

  return [...grouped.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.seller.localeCompare(b.seller, "pt-BR"))
    .map((row) => [
      row.date,
      row.seller,
      row.attendances,
      percentage(row.opportunities, row.attendances),
      row.opportunities,
      percentage(row.sales, row.opportunities),
      row.sales,
      row.revenue
    ]);
}

function normalizeRows(filePath) {
  const workbookRows = readWorkbookRows(filePath);
  const headers = workbookRows[0] || [];
  const detailedIndexes = {
    attendant: findHeader(headers, "Atendente"),
    start: findHeader(headers, "Início do atendimento"),
    opportunities: findHeader(headers, "Oportunidades"),
    sales: findHeader(headers, "Vendas"),
    revenue: findHeader(headers, "Valor vendido")
  };

  if (
    detailedIndexes.attendant !== -1 &&
    detailedIndexes.start !== -1 &&
    detailedIndexes.opportunities !== -1 &&
    detailedIndexes.sales !== -1 &&
    detailedIndexes.revenue !== -1
  ) {
    return normalizeDetailedRows(workbookRows, detailedIndexes);
  }

  const date = parseDateFromFile(filePath);
  const conversionIndexes = findAllHeaders(headers, "Conv.%");
  const indexes = {
    attendant: findHeader(headers, "Atendente"),
    attendances: findHeader(headers, "Atendimentos"),
    opportunities: findHeader(headers, "Oportunidades"),
    sales: findHeader(headers, "Vendas"),
    revenue: findHeader(headers, "Receita")
  };

  const rows = workbookRows.slice(1);
  return rows
    .map((row) => ({
      date,
      seller: normalizeName(row[indexes.attendant]),
      chats: toNumber(row[indexes.attendances]),
      chatConvPct: toNumber(row[conversionIndexes[0]]),
      opportunities: toNumber(row[indexes.opportunities]),
      salesConvPct: toNumber(row[conversionIndexes[1]]),
      sales: toNumber(row[indexes.sales]),
      revenue: toNumber(row[indexes.revenue])
    }))
    .filter((row) => ALLOWED_SELLERS.has(row.seller))
    .map((row) => [
      row.date,
      row.seller,
      row.chats,
      row.chatConvPct,
      row.opportunities,
      row.salesConvPct,
      row.sales,
      row.revenue
    ]);
}

function key(row) {
  return `${row[0]}|${normalizeName(row[1])}`.toUpperCase();
}

function existingRowsByKey(rows) {
  const map = new Map();
  rows.slice(1).forEach((row, index) => {
    if (row[0] && row[1]) map.set(key(row), index + 2);
  });
  return map;
}

async function printSheetSummary(month) {
  await ensureSheet();
  const current = (await sheetsValues("GET", READ_RANGE)).values || [];
  const byKey = new Map();
  current.slice(1).forEach((row) => {
    const date = normalizeDateKey(row[0]);
    if (!date || !date.startsWith(month)) return;
    const seller = normalizeName(row[1]);
    if (!seller) return;
    byKey.set(`${date}|${seller}`.toUpperCase(), [
      date,
      seller,
      row[2],
      row[3],
      row[4],
      row[5],
      row[6],
      row[7]
    ]);
  });

  const totals = new Map();
  [...byKey.values()].forEach((row) => {
    const seller = normalizeName(row[1]);
    if (!seller) return;
    const item = totals.get(seller) || {
      attendances: 0,
      opportunities: 0,
      sales: 0,
      revenue: 0
    };
    item.attendances += toNumber(row[2]);
    item.opportunities += toNumber(row[4]);
    item.sales += toNumber(row[6]);
    item.revenue += toNumber(row[7]);
    totals.set(seller, item);
  });

  const summary = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([seller, values]) => ({
      seller,
      attendances: values.attendances,
      opportunities: values.opportunities,
      sales: values.sales,
      revenue: Math.round(values.revenue * 100) / 100
    }));

  console.log(JSON.stringify({ month, summary }, null, 2));
}

async function main() {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID nao configurado.");
  if (SUMMARY_MONTH) {
    await printSheetSummary(SUMMARY_MONTH);
    return;
  }

  const parsed = normalizeRows(INPUT_FILE);
  await ensureSheet();
  const current = (await sheetsValues("GET", READ_RANGE)).values || [];
  const byKey = existingRowsByKey(current);
  let nextRow = Math.max(current.length + 1, 2);
  const data = [{ range: `'${SHEET_NAME}'!A1:H1`, values: [HEADERS] }];
  let inserted = 0;
  let updated = 0;

  parsed.forEach((row) => {
    const rowNumber = byKey.get(key(row)) || nextRow++;
    data.push({ range: `'${SHEET_NAME}'!A${rowNumber}:H${rowNumber}`, values: [row] });
    if (byKey.has(key(row))) updated += 1;
    else inserted += 1;
  });

  const summary = {
    file: INPUT_FILE,
    mode: APPLY ? "apply" : "dry-run",
    parsed: parsed.length,
    inserted,
    updated,
    ignored: readWorkbookRows(INPUT_FILE).length - 1 - parsed.length,
    updatesPrepared: data.length
  };

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  const result = await batchUpdate(data);
  console.log(JSON.stringify({ ...summary, updatedCells: result.totalUpdatedCells || 0 }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
