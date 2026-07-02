const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SHEET_NAME = "Recuperação de carrinhos";
const SHEET_PROTECTION_NOTE = "Protecao operacional SUEDS. Senha de referencia: SuedsGestores2026!";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const RESPONSIBLE_OPTIONS = ["Selecione", "Aline Nunes", "Emanoel Cesar", "Amanda Melgaco", "Julia Reche"];
const STATUS_OPTIONS = ["Pensando", "Comprou (recuperado)", "Desistiu (não recuperado)"];
const LOSS_REASON_OPTIONS = ["Achou caro", "Desistiu da viagem", "Comprou outro hotel", "Escolheu outro destino"];

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

async function sheetsRequest(method, endpoint, body) {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID nao configurado.");
  const token = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${endpoint}`, {
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

function listValidation(values) {
  return {
    condition: {
      type: "ONE_OF_LIST",
      values: values.map((userEnteredValue) => ({ userEnteredValue }))
    },
    strict: true,
    showCustomUi: true
  };
}

async function main() {
  const metadata = await sheetsRequest(
    "GET",
    "?fields=sheets.properties,sheets.protectedRanges(protectedRangeId,description,range)",
    null
  );
  const sheet = metadata.sheets.find((item) => item.properties.title === SHEET_NAME);
  if (!sheet) throw new Error(`Aba ${SHEET_NAME} nao encontrada.`);

  const sheetId = sheet.properties.sheetId;
  const rowCount = Math.max(sheet.properties.gridProperties.rowCount, 1000);
  const protections = (sheet.protectedRanges || [])
    .filter((range) => range.description === SHEET_PROTECTION_NOTE);

  const requests = [
    ...protections.map((range) => ({ deleteProtectedRange: { protectedRangeId: range.protectedRangeId } })),
    {
      addProtectedRange: {
        protectedRange: {
          description: SHEET_PROTECTION_NOTE,
          warningOnly: false,
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: 17
          }
        }
      }
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 17, endColumnIndex: 18 },
        cell: { dataValidation: listValidation(RESPONSIBLE_OPTIONS) },
        fields: "dataValidation"
      }
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 18, endColumnIndex: 19 },
        cell: { dataValidation: listValidation(STATUS_OPTIONS) },
        fields: "dataValidation"
      }
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 19, endColumnIndex: 20 },
        cell: { dataValidation: listValidation(LOSS_REASON_OPTIONS) },
        fields: "dataValidation"
      }
    }
  ];

  const result = await sheetsRequest("POST", ":batchUpdate", { requests });
  console.log(JSON.stringify({
    ok: true,
    sheet: SHEET_NAME,
    protectedColumns: "A:Q",
    unprotectedColumns: "R:U",
    validations: {
      R: RESPONSIBLE_OPTIONS,
      S: STATUS_OPTIONS,
      T: LOSS_REASON_OPTIONS
    },
    replies: result.replies?.length || 0
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
