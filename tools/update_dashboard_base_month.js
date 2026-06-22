const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT, ".env"));

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

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
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function main() {
  const data = [
    {
      range: "Dashboard_Base!A1:H1",
      values: [["Base do Dashboard - Vendas Offline", "", "", "", "", "", "", ""]]
    },
    {
      range: "Dashboard_Base!A2:B2",
      values: [["Mês selecionado", "2026-06"]]
    },
    {
      range: "Dashboard_Base!A3:B8",
      values: [
        ["Indicador", "Valor"],
        ["Receita Confirmada", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["Recebido", '=SUMIFS(Base_Dashboard!N:N;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["A Receber", '=SUMIFS(Base_Dashboard!O:O;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["Reservas Confirmadas", '=COUNTIFS(Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2;Base_Dashboard!A:A;"<>")'],
        ["Ticket Médio", '=IF(B7=0;0;B4/B7)']
      ]
    },
    {
      range: "Dashboard_Base!D3:E11",
      values: [
        ["Por Canal", ""],
        ["Canal", "Receita"],
        ["Central de Reservas", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!W:W;D5;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["WhatsApp", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!W:W;D6;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["Booking Engine", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!W:W;D7;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["Site", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!W:W;D8;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["Operadoras", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!W:W;D9;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["OTAs", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!W:W;D10;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["Total", '=SUM(E5:E10)']
      ]
    },
    {
      range: "Dashboard_Base!G3:H13",
      values: [
        ["Por Vendedor", ""],
        ["Vendedor", "Receita"],
        ["Aline Nunes", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!E:E;G5;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["Amanda Melgaco", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!E:E;G6;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["Julia Reche", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!E:E;G7;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["Emanoel Cesar", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!E:E;G8;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["Site", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!E:E;G9;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["Operadoras", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!E:E;G10;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["OTAs", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!E:E;G11;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;$B$2)'],
        ["Total", '=SUM(H5:H11)'],
        ["", ""]
      ]
    },
    {
      range: "Dashboard_Base!A11:E18",
      values: [
        ["Resumo por mês", "", "", "", ""],
        ["Mês", "Venda", "Recebido", "A Receber", "Reservas"],
        ["2026-05", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A13)', '=SUMIFS(Base_Dashboard!N:N;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A13)', '=SUMIFS(Base_Dashboard!O:O;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A13)', '=COUNTIFS(Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A13;Base_Dashboard!A:A;"<>")'],
        ["2026-06", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A14)', '=SUMIFS(Base_Dashboard!N:N;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A14)', '=SUMIFS(Base_Dashboard!O:O;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A14)', '=COUNTIFS(Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A14;Base_Dashboard!A:A;"<>")'],
        ["2026-07", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A15)', '=SUMIFS(Base_Dashboard!N:N;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A15)', '=SUMIFS(Base_Dashboard!O:O;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A15)', '=COUNTIFS(Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A15;Base_Dashboard!A:A;"<>")'],
        ["2026-08", '=SUMIFS(Base_Dashboard!M:M;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A16)', '=SUMIFS(Base_Dashboard!N:N;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A16)', '=SUMIFS(Base_Dashboard!O:O;Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A16)', '=COUNTIFS(Base_Dashboard!R:R;"Confirmada";Base_Dashboard!Y:Y;A16;Base_Dashboard!A:A;"<>")'],
        ["", "", "", "", ""],
        ["", "", "", "", ""]
      ]
    }
  ];

  const result = await batchUpdate(data);
  console.log(JSON.stringify({ updatedRanges: data.length, updatedCells: result.totalUpdatedCells }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
