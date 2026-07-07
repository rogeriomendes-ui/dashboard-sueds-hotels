const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const INPUT_FILE = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const APPLY = process.argv.includes("--apply");
const MONTH = getArg("--month");

loadEnvFile(path.join(ROOT, ".env"));

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const RANGE = "Lancamento_Vendas!A2:T5000";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const PYTHON = process.env.PYTHON_EXE
  || "C:\\Users\\roger\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

function getArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

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
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
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

async function sheetsRequest(method, range, body) {
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

function parseMoney(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const text = String(value).trim();
  const normalized = text.includes(",")
    ? text.replace(/[R$\s.]/g, "").replace(",", ".")
    : text.replace(/[R$\s]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

function normalizeSeller(value) {
  const raw = String(value || "").trim().toLocaleUpperCase("pt-BR");
  const map = {
    SITE: "Site",
    "ALINE NUNES": "Aline Nunes",
    "AMANDA MELGAÇO": "Amanda Melgaco",
    "AMANDA MELGACO": "Amanda Melgaco",
    "JULIA RECHE": "Julia Reche",
    "EMANOEL CESAR": "Emanoel Cesar",
    LEONARDO: "Leonardo"
  };
  return map[raw] || normalizeName(value);
}

function normalizeHotel(value) {
  const raw = String(value || "").trim().toLocaleUpperCase("pt-BR");
  const map = {
    "SEGUNDO SOL": "SUEDS SEGUNDO SOL",
    "SUEDS SEGUNDO SOL": "SUEDS SEGUNDO SOL",
    "SUEDS PLAZA": "SUEDS PLAZA",
    "SUEDS PREMIUM": "SUEDS PREMIUM",
    "SUEDS CABRALIA": "SUEDS CABRALIA",
    "SUEDS TRANCOSO": "SUEDS TRANCOSO"
  };
  return map[raw] || String(value || "").trim();
}

function parseInstallments(payment) {
  const match = String(payment || "").match(/(\d+)\s*X/i);
  return match ? match[1] : "";
}

function dateKey(value) {
  if (!value) return "";
  if (typeof value === "number") return "";
  const text = String(value).trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

function monthKey(value) {
  const key = dateKey(value);
  return key ? key.slice(0, 7) : "";
}

function readWorkbookRows(filePath) {
  if (!fs.existsSync(PYTHON)) throw new Error(`Python nao encontrado: ${PYTHON}`);
  const code = String.raw`
import json
import sys
from datetime import date, datetime
from openpyxl import load_workbook

def fmt(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    return value

ws = load_workbook(sys.argv[1], data_only=True).active
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
  if (result.status !== 0) throw new Error(`Falha ao ler Excel: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function parseRows(rows) {
  const records = [];
  rows.forEach((rawColumns, index) => {
    const columns = rawColumns.map((value) => (typeof value === "number" ? value : String(value ?? "").trim()));
    if (columns.length < 11) return;
    const [
      codigo,
      dataVenda,
      hotel,
      canal,
      cliente,
      checkin,
      checkout,
      valorTotal,
      recebido,
      aReceber,
      formaPagamento,
      vendedor
    ] = columns;

    if (String(dataVenda || "").toLocaleUpperCase("pt-BR") === "DATA VENDA") return;
    if (!dataVenda || !hotel || !cliente) return;
    records.push({
      sourceLine: index + 2,
      codigo,
      dataVenda,
      hotel: normalizeHotel(hotel),
      canal,
      vendedor: normalizeSeller(vendedor),
      cliente,
      checkin,
      checkout,
      uhs: 1,
      adultos: "",
      criancas: "",
      valorTotal: parseMoney(valorTotal),
      recebido: parseMoney(recebido),
      aReceber: parseMoney(aReceber),
      formaPagamento,
      parcelas: parseInstallments(formaPagamento),
      status: "Confirmada",
      observacoes: ""
    });
  });
  return records;
}

function readInputRecords(filePath) {
  if (!filePath) throw new Error("Informe o arquivo Excel.");
  if (!/\.xlsx$/i.test(filePath)) throw new Error("Este sincronizador aceita apenas .xlsx.");
  return parseRows(readWorkbookRows(filePath).slice(1));
}

function totals(records) {
  return {
    count: records.length,
    total: round(records.reduce((sum, record) => sum + (Number(record.valorTotal) || 0), 0)),
    received: round(records.reduce((sum, record) => sum + (Number(record.recebido) || 0), 0)),
    remaining: round(records.reduce((sum, record) => sum + (Number(record.aReceber) || 0), 0))
  };
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function rowToRecord(row, rowNumber) {
  return {
    rowNumber,
    dataVenda: row[0] || "",
    codigo: row[1] || "",
    hotel: row[2] || "",
    canal: row[3] || "",
    vendedor: row[4] || "",
    cliente: row[5] || "",
    checkin: row[6] || "",
    checkout: row[7] || "",
    valorTotal: parseMoney(row[12]),
    recebido: parseMoney(row[13]),
    aReceber: parseMoney(row[14])
  };
}

function buildWriteRow(record, rowNumber) {
  return [
    record.dataVenda,
    record.codigo,
    record.hotel,
    record.canal,
    record.vendedor,
    record.cliente,
    record.checkin,
    record.checkout,
    `=IF(OR(G${rowNumber}="";H${rowNumber}="");"";H${rowNumber}-G${rowNumber})`,
    record.uhs,
    record.adultos,
    record.criancas,
    record.valorTotal,
    record.recebido,
    record.aReceber,
    record.formaPagamento,
    record.parcelas,
    record.status,
    "",
    record.observacoes
  ];
}

async function main() {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID nao configurado.");
  const sourceRecords = readInputRecords(INPUT_FILE);
  const targetMonth = MONTH || monthKey(sourceRecords.find((record) => monthKey(record.dataVenda))?.dataVenda);
  if (!targetMonth) throw new Error("Nao foi possivel identificar o mes. Use --month=AAAA-MM.");
  const records = sourceRecords.filter((record) => monthKey(record.dataVenda) === targetMonth);
  const currentRows = (await sheetsRequest("GET", RANGE)).values || [];
  const currentMonthRows = currentRows
    .map((row, index) => rowToRecord(row, index + 2))
    .filter((record) => monthKey(record.dataVenda) === targetMonth);
  const emptyRows = currentRows
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => !row.some((cell) => String(cell || "").trim()))
    .map(({ rowNumber }) => rowNumber);
  const reusableRows = currentMonthRows.map((record) => record.rowNumber);
  const missingRows = Math.max(0, records.length - reusableRows.length);
  const targetRows = reusableRows.concat(emptyRows.slice(0, missingRows));

  if (targetRows.length < records.length) {
    throw new Error(`Linhas disponiveis insuficientes: precisa ${records.length}, encontrou ${targetRows.length}.`);
  }

  const summary = {
    file: INPUT_FILE,
    month: targetMonth,
    mode: APPLY ? "apply" : "dry-run",
    source: totals(records),
    current: totals(currentMonthRows),
    rowsToClear: reusableRows.length,
    rowsToWrite: records.length,
    firstWriteRow: targetRows[0] || null,
    lastWriteRow: targetRows[records.length - 1] || null
  };

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const data = [];
  reusableRows.forEach((rowNumber) => {
    data.push({
      range: `Lancamento_Vendas!A${rowNumber}:T${rowNumber}`,
      values: [Array(20).fill("")]
    });
  });
  records.forEach((record, index) => {
    const rowNumber = targetRows[index];
    data.push({
      range: `Lancamento_Vendas!A${rowNumber}:T${rowNumber}`,
      values: [buildWriteRow(record, rowNumber)]
    });
  });

  const result = await batchUpdate(data);
  console.log(JSON.stringify({
    ...summary,
    updatedCells: result.totalUpdatedCells || 0
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
