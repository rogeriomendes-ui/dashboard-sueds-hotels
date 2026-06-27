const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const inputArg = args.find((arg) => !arg.startsWith("--"));
const INPUT_FILE = inputArg || path.join(process.env.USERPROFILE || "C:\\Users\\roger", "Downloads", "reservas-perdidas.xlsx");
const APPLY = args.includes("--apply");
const SHEET_NAME = "Recuperação de carrinhos";
const READ_RANGE = `'${SHEET_NAME}'!A:U`;
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const PYTHON = process.env.PYTHON_EXE
  || "C:\\Users\\roger\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

loadEnvFile(path.join(ROOT, ".env"));

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const TARGET_HEADERS = [
  "ID",
  "Abandono (Data e Hora)",
  "Data do Agendamento",
  "Hora do Agendamento",
  "Check-in",
  "Check-out",
  "Quantidade de Noites",
  "Hotel",
  "Cliente",
  "Origem",
  "Valor total (Com taxas)",
  "Quantidade de quartos",
  "Quarto",
  "Tarifa",
  "Hóspede",
  "E-mail",
  "Telefone",
  "Responsável",
  "STATUS",
  "MOTIVO DA PERDA",
  "SE COMPROU OUTRO HOTEL OU DESTINO, QUAL?"
];

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
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`);
  const response = await fetch(url, {
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

async function sortTargetSheetByAbandonDate(rowCount) {
  if (rowCount <= 2) return;
  const values = (await sheetsValues("GET", READ_RANGE)).values || [];
  const bodyRows = values
    .slice(1)
    .map((row) => padRow(row, TARGET_HEADERS.length))
    .filter((row) => row.some((cell) => normalizeText(cell)));

  if (bodyRows.length <= 1) return;

  bodyRows.sort((a, b) => parseNiaraDateTime(a[1]) - parseNiaraDateTime(b[1]));
  await sheetsValues("PUT", `'${SHEET_NAME}'!A2:U${bodyRows.length + 1}`, { values: bodyRows });
}

function readNiaraWorkbook(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Arquivo nao encontrado: ${filePath}`);
  if (!fs.existsSync(PYTHON)) throw new Error(`Python nao encontrado: ${PYTHON}`);

  const code = String.raw`
import json
import sys
from datetime import datetime, date
from openpyxl import load_workbook

path = sys.argv[1]
wb = load_workbook(path, data_only=True)
ws = wb[wb.sheetnames[0]]

def fmt(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        if value.hour or value.minute or value.second:
            return value.strftime("%d/%m/%Y %H:%M")
        return value.strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    return value

rows = []
for row in ws.iter_rows(values_only=True):
    rows.append([fmt(value) for value in row])
print(json.dumps(rows, ensure_ascii=False))
`;
  const result = spawnSync(PYTHON, ["-c", code, filePath], {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`Falha ao ler Excel: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeHeader(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function sourceIndex(headers, label) {
  const key = normalizeHeader(label);
  return headers.findIndex((header) => normalizeHeader(header) === key);
}

function normalizeRows(rows) {
  const [headers = [], ...body] = rows;
  const indexes = TARGET_HEADERS.slice(0, 17).map((header) => sourceIndex(headers, header));
  const missing = TARGET_HEADERS.slice(0, 17).filter((_, index) => indexes[index] === -1);
  if (missing.length) throw new Error(`Colunas ausentes no arquivo Niara: ${missing.join(", ")}`);

  return body
    .map((row) => indexes.map((index) => row[index] ?? ""))
    .filter((row) => normalizeText(row[0]));
}

function currentRowsById(rows) {
  const map = new Map();
  rows.slice(1).forEach((row, index) => {
    const id = normalizeText(row[0]);
    if (id) map.set(id, { rowNumber: index + 2, row });
  });
  return map;
}

function firstAppendRow(rows) {
  let lastUsed = 1;
  rows.forEach((row, index) => {
    if (row.some((cell) => normalizeText(cell))) lastUsed = index + 1;
  });
  return lastUsed + 1;
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
    return new Date(
      Number(br[3]),
      Number(br[2]) - 1,
      Number(br[1]),
      Number(br[4] || 0),
      Number(br[5] || 0)
    ).getTime();
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

async function main() {
  const sourceRows = normalizeRows(readNiaraWorkbook(INPUT_FILE));
  const currentRows = (await sheetsValues("GET", READ_RANGE)).values || [];
  const currentById = currentRowsById(currentRows);
  let appendRow = firstAppendRow(currentRows);
  const updates = [];
  const stats = { parsed: sourceRows.length, updated: 0, inserted: 0, unchanged: 0 };

  updates.push({
    range: `'${SHEET_NAME}'!A1:U1`,
    values: [TARGET_HEADERS]
  });

  sourceRows.forEach((sourceRow) => {
    const id = normalizeText(sourceRow[0]);
    const existing = currentById.get(id);
    const targetRowNumber = existing ? existing.rowNumber : appendRow++;
    const existingWorkColumns = existing ? padRow(existing.row, 21).slice(17, 21) : ["", "", "", ""];
    const merged = [...sourceRow.slice(0, 17), ...existingWorkColumns];
    const currentComparable = existing ? padRow(existing.row, 21).slice(0, 21) : null;

    if (currentComparable && JSON.stringify(currentComparable) === JSON.stringify(merged)) {
      stats.unchanged += 1;
      return;
    }

    updates.push({
      range: `'${SHEET_NAME}'!A${targetRowNumber}:U${targetRowNumber}`,
      values: [merged]
    });

    if (existing) stats.updated += 1;
    else stats.inserted += 1;
  });

  const summary = {
    file: INPUT_FILE,
    mode: APPLY ? "apply" : "dry-run",
    ...stats,
    preservedColumns: "R:U",
    updatesPrepared: updates.length
  };

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const result = await batchUpdate(updates);
  await sortTargetSheetByAbandonDate(Math.max(appendRow - 1, currentRows.length));
  console.log(JSON.stringify({ ...summary, updatedCells: result.totalUpdatedCells || 0, sortedBy: "B asc" }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
