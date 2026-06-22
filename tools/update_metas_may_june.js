const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT, ".env"));

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const METAS_RANGE = "Metas!A:H";
const MONTHS = ["2026-05", "2026-06"];
const RESPONSAVEIS = [
  "Aline Nunes",
  "Amanda Melgaco",
  "Julia Reche",
  "Emanoel Cesar",
  "Bete Gerente",
  "Site",
  "Operadoras",
  "OTAs",
  "Robo"
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) return;
    const key = trimmed.slice(0, equalsAt).trim();
    const value = trimmed.slice(equalsAt + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  });
}

function base64url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function getServiceAccount() {
  return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
}

async function getAccessToken() {
  const account = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({
    iss: account.client_email,
    scope: WRITE_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`
    })
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).access_token;
}

async function sheetsValues(method, range, body) {
  const token = await getAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`);
  if (method === "GET") {
    url.searchParams.set("majorDimension", "ROWS");
    url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
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
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

function key(value) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

async function main() {
  const rows = (await sheetsValues("GET", METAS_RANGE)).values || [];
  const [headers = [], ...body] = rows;
  const valuesByResponsavel = new Map();

  body.forEach((row) => {
    const responsavel = row[4];
    if (!responsavel) return;
    const existing = valuesByResponsavel.get(key(responsavel)) || {};
    valuesByResponsavel.set(key(responsavel), {
      receita: existing.receita || row[5] || "",
      reservas: existing.reservas || row[6] || "",
      observacoes: existing.observacoes || row[7] || "Preencher"
    });
  });

  const nextRows = [];
  MONTHS.forEach((month) => {
    RESPONSAVEIS.forEach((responsavel) => {
      const existing = valuesByResponsavel.get(key(responsavel)) || {};
      nextRows.push([
        month,
        "Responsavel",
        "",
        "",
        responsavel,
        existing.receita || "",
        existing.reservas || "",
        existing.observacoes || "Preencher"
      ]);
    });
  });

  const finalRows = [
    headers.length ? headers : ["Mes", "Tipo Meta", "Hotel", "Canal", "Responsavel", "Meta Receita", "Meta Reservas", "Observacoes"],
    ...nextRows
  ];

  await sheetsValues("PUT", "Metas!A1:H19", {
    range: "Metas!A1:H19",
    majorDimension: "ROWS",
    values: finalRows
  });

  console.log(JSON.stringify({
    months: MONTHS,
    responsaveis: RESPONSAVEIS,
    rowsWritten: nextRows.length,
    metas: nextRows.map((row) => ({ mes: row[0], responsavel: row[4], metaReceita: row[5], metaReservas: row[6] }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
