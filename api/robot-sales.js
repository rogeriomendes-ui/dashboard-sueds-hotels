const { google } = require("googleapis");

const SHEET_NAME = "Asksuite_Detalhado";

function getSpreadsheetId() {
  const spreadsheetId =
    process.env.GOOGLE_SHEET_ID ||
    process.env.GOOGLE_SPREADSHEET_ID ||
    process.env.SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEET_ID nao configurado");
  }

  return spreadsheetId;
}

function getServiceAccountCredentials() {
  const raw =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_CREDENTIALS_JSON;

  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON nao configurado");
  }

  const credentials = JSON.parse(raw);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  return credentials;
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: getServiceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let text = String(value).trim();
  if (!text) return 0;

  text = text.replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  }
  text = text.replace(/[^\d.-]/g, "");

  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function parseDate(value) {
  if (!value) return null;

  const text = String(value).trim();
  let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  }

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  return null;
}

function getMonthKey(date) {
  if (!date) return "";

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function emptyRobotSales() {
  return {
    name: "ROBÔ",
    dialogs: 0,
    opportunities: 0,
    reservations: 0,
    sales: 0,
    revenue: 0,
  };
}

module.exports = async function handler(req, res) {
  try {
    const month = String(req.query.month || "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_month",
        message: "Informe month no formato YYYY-MM.",
      });
    }

    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: `'${SHEET_NAME}'!A:L`,
      valueRenderOption: "FORMATTED_VALUE",
    });

    const rows = response.data.values || [];
    const robot = emptyRobotSales();

    rows.slice(1).forEach((row) => {
      const attendant = normalizeText(row[3]);
      if (attendant !== "robo") return;

      const date = parseDate(row[6]) || parseDate(row[7]);
      if (getMonthKey(date) !== month) return;

      const sales = parseNumber(row[9]);
      const correctedRevenue = row[11] !== undefined && row[11] !== "" ? row[11] : row[10];

      robot.dialogs += 1;
      robot.opportunities += parseNumber(row[8]);
      robot.sales += sales;
      robot.reservations += sales;
      robot.revenue += parseNumber(correctedRevenue);
    });

    return res.status(200).json({ ok: true, month, robot });
  } catch (error) {
    console.error("robot-sales error", error);
    return res.status(500).json({
      ok: false,
      error: "robot_sales_failed",
      message: error.message,
    });
  }
};
