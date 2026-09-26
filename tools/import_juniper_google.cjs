const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const CHANNELS_SHEET = "teste lancamento_vendas";
const SELLERS_SHEET = "Lancamento_Vendas";
const CHANNELS_SHEET_ID = 711290481;
const HEADERS = ["Data Venda", "Codigo Reserva", "Hotel", "Canal", "Vendedor", "Cliente", "Checkin", "Checkout", "Diarias", "UHs", "Adultos", "Criancas", "Valor Total", "Recebido", "A Receber", "Forma Pagto", "Parcelas", "Status", "Fonte", "Observacoes"];
const INPUT_FILE = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
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
    const name = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[name]) process.env[name] = value;
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
  if (!account?.client_email || !account?.private_key) throw new Error("Credenciais Google não configuradas.");
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: account.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now };
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` })
  });
  if (!response.ok) throw new Error(`Token Google falhou: ${response.status}`);
  return (await response.json()).access_token;
}

async function getValues(token, range) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  url.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Leitura Sheets falhou: ${response.status} ${await response.text()}`);
  return (await response.json()).values || [];
}

async function batchValues(token, data) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
  });
  if (!response.ok) throw new Error(`Escrita Sheets falhou: ${response.status} ${await response.text()}`);
  return response.json();
}

async function copyFormatAndValidation(token, sourceRow, firstRow, count) {
  if (!count) return { copied: false, reason: "empty" };
  const source = { sheetId: CHANNELS_SHEET_ID, startRowIndex: sourceRow - 1, endRowIndex: sourceRow, startColumnIndex: 0, endColumnIndex: 20 };
  const destination = { sheetId: CHANNELS_SHEET_ID, startRowIndex: firstRow - 1, endRowIndex: firstRow - 1 + count, startColumnIndex: 0, endColumnIndex: 20 };
  const requests = ["PASTE_FORMAT", "PASTE_DATA_VALIDATION"].map((pasteType) => ({ copyPaste: { source, destination, pasteType, pasteOrientation: "NORMAL" } }));
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ requests })
  });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 400 && /protected cell or object/i.test(detail)) {
      return { copied: false, reason: "protected-range" };
    }
    throw new Error(`Cópia de formato falhou: ${response.status} ${detail}`);
  }
  return { copied: true, reason: "copied" };
}

function recordKey(record) {
  return `${String(record.codigo || "").trim().toUpperCase()}|${String(record.hotel || "").trim().toUpperCase()}`;
}

function currentRecord(row, rowNumber) {
  return {
    rowNumber,
    dataVenda: row[0] || "",
    codigo: row[1] || "",
    hotel: row[2] || "",
    canal: row[3] || "",
    vendedor: row[4] || "",
    formaPagamento: row[15] || "",
    status: row[17] || "",
    fonte: row[18] || ""
  };
}

function outputRow(record, rowNumber) {
  return [
    record.dataVenda, record.codigo, record.hotel, record.canal, record.vendedor, record.cliente,
    record.checkin, record.checkout, `=IF(OR(G${rowNumber}="";H${rowNumber}="");"";H${rowNumber}-G${rowNumber})`,
    record.uhs, record.adultos, record.criancas, record.valorTotal, "", "", "", "",
    record.status, record.fonte, record.observacoes
  ];
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function main() {
  if (!INPUT_FILE || !fs.existsSync(INPUT_FILE)) throw new Error("Informe o JSON normalizado da Juniper.");
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID não configurado.");
  const payload = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
  if (!Array.isArray(payload.records)) throw new Error("JSON Juniper sem records.");
  const token = await accessToken();
  const [headers, sellerRows, channelRows] = await Promise.all([
    getValues(token, `'${CHANNELS_SHEET}'!A1:T1`),
    getValues(token, `'${SELLERS_SHEET}'!A2:T5000`),
    getValues(token, `'${CHANNELS_SHEET}'!A2:T5000`)
  ]);
  if (JSON.stringify(headers[0] || []) !== JSON.stringify(HEADERS)) throw new Error("Cabeçalhos A:T divergentes; escrita bloqueada.");
  const existingSellers = sellerRows.map((row, index) => currentRecord(row, index + 2)).filter((record) => record.codigo || record.dataVenda);
  const existingChannels = channelRows.map((row, index) => currentRecord(row, index + 2)).filter((record) => record.codigo || record.dataVenda);
  const existingKeys = new Set(existingSellers.concat(existingChannels).map(recordKey));
  const pending = payload.records.filter((record) => !existingKeys.has(recordKey(record))).map((record) => ({ ...record, sourceSystem: "JUNIPER" }));
  const seen = new Set();
  for (const record of pending) {
    const key = recordKey(record);
    if (seen.has(key)) throw new Error(`Duplicidade no lote: ${key}`);
    seen.add(key);
  }
  const lastDataIndex = channelRows.reduce((last, row, index) => row.some((value) => String(value ?? "").trim()) ? index : last, -1);
  const lastDataRow = lastDataIndex + 2;
  const firstWriteRow = Math.max(2, lastDataRow + 1);
  const planDir = path.join(ROOT, "tmp", "sales-plans");
  fs.mkdirSync(planDir, { recursive: true });
  const stamp = timestamp();
  const planPath = path.join(planDir, `juniper-${stamp}-prewrite.json`);
  const plan = { records: pending, existingSellers, existingChannels };
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
  const validation = spawnSync(process.execPath, [path.join(ROOT, "tools", "validate_sales_write.cjs"), planPath], { cwd: ROOT, encoding: "utf8" });
  if (validation.status !== 0) throw new Error(`Validação bloqueou a escrita: ${(validation.stderr || validation.stdout).trim()}`);
  const summary = {
    mode: APPLY ? "apply" : "dry-run",
    sourceRows: payload.summary?.SourceRows,
    normalizedReservations: payload.records.length,
    skippedExisting: payload.records.length - pending.length,
    toInsert: pending.length,
    firstWriteRow: pending.length ? firstWriteRow : null,
    lastWriteRow: pending.length ? firstWriteRow + pending.length - 1 : null,
    totalValue: Math.round(pending.reduce((sum, record) => sum + Number(record.valorTotal || 0), 0) * 100) / 100,
    planPath
  };
  if (!APPLY || !pending.length) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  if (lastDataRow < 2) throw new Error("Não há linha-base para copiar a formatação.");
  const formatting = await copyFormatAndValidation(token, lastDataRow, firstWriteRow, pending.length);
  const data = pending.map((record, index) => {
    const rowNumber = firstWriteRow + index;
    return { range: `'${CHANNELS_SHEET}'!A${rowNumber}:T${rowNumber}`, values: [outputRow(record, rowNumber)] };
  });
  await batchValues(token, data);
  const writtenRows = await getValues(token, `'${CHANNELS_SHEET}'!A${firstWriteRow}:T${firstWriteRow + pending.length - 1}`);
  const written = writtenRows.map((row, index) => currentRecord(row, firstWriteRow + index));
  const expectedKeys = new Set(pending.map(recordKey));
  const actualKeys = new Set(written.map(recordKey));
  const missing = [...expectedKeys].filter((key) => !actualKeys.has(key));
  const invalid = written.filter((record) => record.fonte !== "JUNIPER" || record.canal !== "Azul Viagens" || record.status !== "Confirmada");
  if (missing.length || invalid.length || written.length !== pending.length) throw new Error(`Verificação pós-escrita falhou: missing=${missing.length}, invalid=${invalid.length}, rows=${written.length}`);
  const verificationPath = path.join(planDir, `juniper-${stamp}-verification.json`);
  fs.writeFileSync(verificationPath, JSON.stringify({ ...summary, inserted: written.length, verifiedKeys: actualKeys.size, formatting }, null, 2));
  console.log(JSON.stringify({ ...summary, inserted: written.length, formatting, verificationPath }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
