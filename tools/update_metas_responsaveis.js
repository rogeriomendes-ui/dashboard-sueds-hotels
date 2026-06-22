const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT, ".env"));

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const METAS_RANGE = "Metas!A:H";
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

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit"
  }).format(new Date());
}

async function main() {
  const month = process.argv[2] || currentMonth();
  const rows = (await sheetsValues("GET", METAS_RANGE)).values || [];
  const [headers = [], ...body] = rows;
  const byResponsavel = new Map();

  body.forEach((row) => {
    const responsavel = String(row[4] || "").trim();
    if (!responsavel) return;
    byResponsavel.set(responsavel.toLocaleLowerCase("pt-BR"), row);
  });

  const nextRows = RESPONSAVEIS.map((responsavel) => {
    const existing = byResponsavel.get(responsavel.toLocaleLowerCase("pt-BR")) || [];
    return [
      existing[0] || month,
      existing[1] || "Responsavel",
      existing[2] || "",
      existing[3] || "",
      responsavel,
      existing[5] || "",
      existing[6] || "",
      existing[7] || "Preencher"
    ];
  });

  await sheetsValues("PUT", "Metas!A1:H10", {
    range: "Metas!A1:H10",
    majorDimension: "ROWS",
    values: [headers.length ? headers : ["Mes", "Tipo Meta", "Hotel", "Canal", "Responsavel", "Meta Receita", "Meta Reservas", "Observacoes"], ...nextRows]
  });

  console.log(JSON.stringify({ month, responsaveis: RESPONSAVEIS, rowsWritten: nextRows.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
