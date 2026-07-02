const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SHEET_NAME = "Asksuite_Detalhado";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

loadEnvFile(path.join(ROOT, ".env"));

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const HEADERS = [
  "Viajante",
  "Email",
  "Telefone",
  "Atendente",
  "Empresa",
  "Canal",
  "Início do atendimento",
  "Final do atendimento",
  "Oportunidades",
  "Vendas",
  "Valor vendido"
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
  const claim = {
    iss: account.client_email,
    scope: WRITE_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify(claim))}`;
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

async function getSpreadsheet() {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`);
  url.searchParams.set("fields", "sheets.properties");
  return googleRequest(url);
}

async function batchUpdate(requests) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`;
  return googleRequest(url, {
    method: "POST",
    body: JSON.stringify({ requests })
  });
}

async function updateValues(range, values) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("valueInputOption", "USER_ENTERED");
  return googleRequest(url, {
    method: "PUT",
    body: JSON.stringify({ values })
  });
}

async function main() {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID nao configurado.");
  const spreadsheet = await getSpreadsheet();
  const existing = spreadsheet.sheets.find((sheet) => sheet.properties.title === SHEET_NAME);
  let sheetId = existing?.properties?.sheetId;

  if (!existing) {
    const created = await batchUpdate([{
      addSheet: {
        properties: {
          title: SHEET_NAME,
          gridProperties: { rowCount: 2000, columnCount: HEADERS.length, frozenRowCount: 1 }
        }
      }
    }]);
    sheetId = created.replies?.[0]?.addSheet?.properties?.sheetId;
  }

  await updateValues(`'${SHEET_NAME}'!A1:K1`, [HEADERS]);

  if (sheetId !== undefined) {
    await batchUpdate([
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { columnCount: HEADERS.length, frozenRowCount: 1 }
          },
          fields: "gridProperties.columnCount,gridProperties.frozenRowCount"
        }
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.0588, green: 0.298, blue: 0.3608 },
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
              horizontalAlignment: "CENTER"
            }
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"
        }
      },
      {
        setBasicFilter: {
          filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: HEADERS.length } }
        }
      },
      {
        autoResizeDimensions: {
          dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: HEADERS.length }
        }
      }
    ]);
  }

  console.log(JSON.stringify({ sheet: SHEET_NAME, created: !existing, headers: HEADERS.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
