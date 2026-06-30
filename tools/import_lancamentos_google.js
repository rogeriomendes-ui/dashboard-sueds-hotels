const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const inputArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const INPUT_FILE = inputArg || path.join(
  process.env.USERPROFILE || "C:\\Users\\roger",
  ".codex",
  "attachments",
  "e9f665a1-fbf3-42c7-b2ef-03aca4c8818a",
  "pasted-text.txt"
);

loadEnvFile(path.join(ROOT, ".env"));

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const RANGE = "Lancamento_Vendas!A2:T501";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const PYTHON = process.env.PYTHON_EXE
  || "C:\\Users\\roger\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

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
    "SITE": "Site",
    "ALINE NUNES": "Aline Nunes",
    "AMANDA MELGAÇO": "Amanda Melgaco",
    "AMANDA MELGACO": "Amanda Melgaco",
    "JULIA RECHE": "Julia Reche",
    "EMANOEL CESAR": "Emanoel Cesar"
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

function makeKey(record) {
  if (record.codigo) return `codigo:${record.codigo.toLocaleUpperCase("pt-BR")}`;
  return [
    "manual",
    record.dataVenda,
    record.hotel,
    record.cliente,
    record.checkin,
    record.checkout,
    record.valorTotal,
    record.vendedor,
    record.formaPagamento
  ].join("|").toLocaleUpperCase("pt-BR");
}

function parseInput(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return parseRows(lines.slice(1).map((line) => line.split("\t")));
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

function readInputRecords(filePath) {
  if (/\.xlsx$/i.test(filePath)) {
    const rows = readWorkbookRows(filePath);
    return parseRows(rows.slice(1));
  }
  return parseInput(fs.readFileSync(filePath, "utf8"));
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
      formaPagamento,
      parcelas: parseInstallments(formaPagamento),
      status: "Confirmada",
      observacoes: aReceber && parseMoney(aReceber) > 0 ? `A receber informado na origem: ${aReceber}` : ""
    });
  });
  return records;
}

function existingKeys(rows) {
  const keys = new Set();
  rows.forEach((row) => {
    const record = {
      dataVenda: row[0] || "",
      codigo: row[1] || "",
      hotel: row[2] || "",
      canal: row[3] || "",
      vendedor: row[4] || "",
      cliente: row[5] || "",
      checkin: row[6] || "",
      checkout: row[7] || "",
      valorTotal: row[12] || "",
      formaPagamento: row[15] || ""
    };
    if (record.dataVenda || record.codigo || record.cliente) keys.add(makeKey(record));
  });
  return keys;
}

function firstEmptyRows(rows, count) {
  const result = [];
  rows.forEach((row, index) => {
    if (!row[0] && result.length < count) result.push(index + 2);
  });
  return result;
}

async function main() {
  const parsed = readInputRecords(INPUT_FILE);
  const current = (await sheetsRequest("GET", RANGE)).values || [];
  const keys = existingKeys(current);
  const pending = parsed.filter((record) => !keys.has(makeKey(record)));
  const targetRows = firstEmptyRows(current, pending.length);

  if (targetRows.length < pending.length) {
    throw new Error(`Linhas livres insuficientes: precisa ${pending.length}, encontrou ${targetRows.length}.`);
  }

  const data = [];
  pending.forEach((record, index) => {
    const row = targetRows[index];
    data.push({
      range: `Lancamento_Vendas!A${row}:H${row}`,
      values: [[
        record.dataVenda,
        record.codigo,
        record.hotel,
        record.canal,
        record.vendedor,
        record.cliente,
        record.checkin,
        record.checkout
      ]]
    });
    data.push({
      range: `Lancamento_Vendas!I${row}:I${row}`,
      values: [[`=IF(OR(G${row}="";H${row}="");"";H${row}-G${row})`]]
    });
    data.push({
      range: `Lancamento_Vendas!J${row}:N${row}`,
      values: [[record.uhs, record.adultos, record.criancas, record.valorTotal, record.recebido]]
    });
    data.push({
      range: `Lancamento_Vendas!O${row}:O${row}`,
      values: [[`=IF(M${row}="";"";M${row}-N${row})`]]
    });
    data.push({
      range: `Lancamento_Vendas!P${row}:R${row}`,
      values: [[record.formaPagamento, record.parcelas, record.status]]
    });
    data.push({
      range: `Lancamento_Vendas!T${row}:T${row}`,
      values: [[record.observacoes]]
    });
  });

  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({
      parsed: parsed.length,
      skippedDuplicates: parsed.length - pending.length,
      toInsert: pending.length,
      firstTargetRow: targetRows[0] || null,
      lastTargetRow: targetRows[targetRows.length - 1] || null,
      sample: pending.slice(0, 3)
    }, null, 2));
    return;
  }

  const result = pending.length ? await batchUpdate(data) : { totalUpdatedCells: 0 };
  console.log(JSON.stringify({
    parsed: parsed.length,
    skippedDuplicates: parsed.length - pending.length,
    inserted: pending.length,
    firstTargetRow: targetRows[0] || null,
    lastTargetRow: targetRows[targetRows.length - 1] || null,
    updatedCells: result.totalUpdatedCells || 0
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
