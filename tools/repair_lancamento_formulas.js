const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
loadEnvFile(path.join(ROOT, ".env"));

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const START_ROW = Number(process.argv[2] || 119);
const END_ROW = Number(process.argv[3] || 198);

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
  const data = [];
  for (let row = START_ROW; row <= END_ROW; row += 1) {
    data.push({
      range: `Lancamento_Vendas!I${row}:I${row}`,
      values: [[`=IF(OR(G${row}="";H${row}="");"";H${row}-G${row})`]]
    });
    data.push({
      range: `Lancamento_Vendas!O${row}:O${row}`,
      values: [[`=IF(M${row}="";"";M${row}-N${row})`]]
    });
  }
  const result = await batchUpdate(data);
  console.log(JSON.stringify({ startRow: START_ROW, endRow: END_ROW, updatedCells: result.totalUpdatedCells }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
