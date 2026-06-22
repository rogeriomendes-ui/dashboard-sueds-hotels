const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT, ".env"));

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const MONTHS = [
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12"
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

async function sheetsFetch(pathname, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

async function getDashboardSheetId() {
  const spreadsheet = await sheetsFetch("?fields=sheets(properties(sheetId,title))");
  const sheet = spreadsheet.sheets.find((item) => item.properties.title === "Dashboard_Base");
  if (!sheet) throw new Error("Aba Dashboard_Base nao encontrada.");
  return sheet.properties.sheetId;
}

async function setMonthDropdown() {
  const sheetId = await getDashboardSheetId();
  const requests = [
    {
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 1,
          endColumnIndex: 2
        },
        rule: {
          condition: {
            type: "ONE_OF_LIST",
            values: MONTHS.map((month) => ({ userEnteredValue: month }))
          },
          strict: true,
          showCustomUi: true
        }
      }
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 1,
          endColumnIndex: 2
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 0.92, blue: 0.2 },
            horizontalAlignment: "CENTER",
            textFormat: { bold: true }
          }
        },
        fields: "userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)"
      }
    }
  ];

  const result = await sheetsFetch(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({ requests })
  });
  console.log(JSON.stringify({ updated: true, sheetId, months: MONTHS, replies: result.replies.length }, null, 2));
}

setMonthDropdown().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
