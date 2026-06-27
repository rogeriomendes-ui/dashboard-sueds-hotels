const NIARA_IMPORT_SHEET = "Importar_Niara";
const NIARA_TARGET_SHEET = "Recuperação de carrinhos";
const ASKSUITE_IMPORT_SHEET = "Importar_Asksuite";
const ASKSUITE_TARGET_SHEET = "Asksuite_Atendimentos";
const SHEET_PROTECTION_NOTE = "Protecao operacional SUEDS. Senha de referencia: SuedsGestores2026!";
const TEAM_INPUT_BACKGROUND = "#d9eaf7";

const NIARA_SOURCE_HEADERS = [
  "ID",
  "Abandono (Data e Hora)",
  "Data do Agendamento",
  "Hora do Agendamento",
  "Check-in",
  "Check-out",
  "Quantidade de Noites",
  "Hotel",
  "Cliente",
  "Origem",
  "Valor total (Com taxas)",
  "Quantidade de quartos",
  "Quarto",
  "Tarifa",
  "Hóspede",
  "E-mail",
  "Telefone"
];

const NIARA_TARGET_HEADERS = [
  ...NIARA_SOURCE_HEADERS,
  "Responsável",
  "STATUS",
  "MOTIVO DA PERDA",
  "SE COMPROU OUTRO HOTEL OU DESTINO, QUAL?"
];

const ASKSUITE_TARGET_HEADERS = [
  "Data",
  "Atendente",
  "Atendimentos",
  "Conv Atendimento %",
  "Oportunidades",
  "Conv Vendas %",
  "Vendas",
  "Receita"
];

const ASKSUITE_ALLOWED_SELLERS = ["Aline Nunes", "Amanda Melgaco", "Julia Reche", "Emanoel Cesar"];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("SUEDS Dashboard")
    .addItem("Importar carrinhos da aba Importar_Niara", "importarCarrinhosNiara")
    .addItem("Importar Asksuite da aba Importar_Asksuite", "importarAsksuite")
    .addSeparator()
    .addItem("Proteger aba de carrinhos", "protegerAbaCarrinhos")
    .addToUi();
}

function importarCarrinhosNiara() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheet = SpreadsheetApp.getActive();
  const importSheet = spreadsheet.getSheetByName(NIARA_IMPORT_SHEET);
  const targetSheet = spreadsheet.getSheetByName(NIARA_TARGET_SHEET);

  if (!importSheet) {
    ui.alert(`Aba ${NIARA_IMPORT_SHEET} nao encontrada.`);
    return;
  }
  if (!targetSheet) {
    ui.alert(`Aba ${NIARA_TARGET_SHEET} nao encontrada.`);
    return;
  }

  ensureTargetHeaders_(targetSheet);

  const importValues = importSheet.getDataRange().getValues();
  if (importValues.length < 2) {
    ui.alert("A aba Importar_Niara nao tem dados para importar.");
    return;
  }

  const sourceHeaders = importValues[0];
  const sourceIndexes = NIARA_SOURCE_HEADERS.map((header) => findHeaderIndex_(sourceHeaders, header));
  const missingHeaders = NIARA_SOURCE_HEADERS.filter((_, index) => sourceIndexes[index] === -1);
  if (missingHeaders.length) {
    ui.alert(`Colunas ausentes na aba Importar_Niara: ${missingHeaders.join(", ")}`);
    return;
  }

  const sourceRows = importValues
    .slice(1)
    .map((row) => sourceIndexes.map((index) => row[index]))
    .filter((row) => String(row[0] || "").trim());

  if (!sourceRows.length) {
    ui.alert("Nenhum ID valido encontrado na aba Importar_Niara.");
    return;
  }

  const targetValues = targetSheet.getDataRange().getValues();
  const rowsById = new Map();
  targetValues.slice(1).forEach((row, index) => {
    const id = String(row[0] || "").trim();
    if (id) rowsById.set(id, index + 2);
  });

  let nextAppendRow = Math.max(targetSheet.getLastRow() + 1, 2);
  let inserted = 0;
  let updated = 0;

  sourceRows.forEach((sourceRow) => {
    const id = String(sourceRow[0] || "").trim();
    const existingRow = rowsById.get(id);
    const targetRow = existingRow || nextAppendRow++;

    targetSheet.getRange(targetRow, 1, 1, NIARA_SOURCE_HEADERS.length).setValues([sourceRow]);

    if (existingRow) updated += 1;
    else inserted += 1;
  });

  sortNiaraTargetByAbandonDate_(targetSheet);
  protectNiaraTargetSheet_(targetSheet);

  ui.alert(
    "Importacao concluida.\n\n" +
    `Lidas: ${sourceRows.length}\n` +
    `Atualizadas: ${updated}\n` +
    `Inseridas: ${inserted}\n\n` +
    "As colunas R:U foram preservadas."
  );
}

function protegerAbaCarrinhos() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheet = SpreadsheetApp.getActive();
  const targetSheet = spreadsheet.getSheetByName(NIARA_TARGET_SHEET);

  if (!targetSheet) {
    ui.alert(`Aba ${NIARA_TARGET_SHEET} nao encontrada.`);
    return;
  }

  protectNiaraTargetSheet_(targetSheet);
  ui.alert(
    "Protecao aplicada.\n\n" +
    "Apenas as colunas R, S, T e U ficaram liberadas para preenchimento do time.\n\n" +
    "Observacao: Google Sheets nao usa senha em protecao de celulas; a senha SuedsGestores2026! fica como referencia operacional."
  );
}

function importarAsksuite() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheet = SpreadsheetApp.getActive();
  const importSheet = spreadsheet.getSheetByName(ASKSUITE_IMPORT_SHEET);
  const targetSheet = spreadsheet.getSheetByName(ASKSUITE_TARGET_SHEET) || spreadsheet.insertSheet(ASKSUITE_TARGET_SHEET);

  if (!importSheet) {
    ui.alert(`Aba ${ASKSUITE_IMPORT_SHEET} nao encontrada.`);
    return;
  }

  const dateResponse = ui.prompt(
    "Importar Asksuite",
    "Informe a data do relatorio no formato AAAA-MM-DD. Exemplo: 2026-06-23",
    ui.ButtonSet.OK_CANCEL
  );
  if (dateResponse.getSelectedButton() !== ui.Button.OK) return;

  const reportDate = String(dateResponse.getResponseText() || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    ui.alert("Data invalida. Use o formato AAAA-MM-DD, por exemplo 2026-06-23.");
    return;
  }

  ensureAsksuiteHeaders_(targetSheet);

  const importValues = importSheet.getDataRange().getValues();
  if (importValues.length < 2) {
    ui.alert("A aba Importar_Asksuite nao tem dados para importar.");
    return;
  }

  const headers = importValues[0];
  const attendantIndex = findHeaderIndex_(headers, "Atendente");
  const attendancesIndex = findHeaderIndex_(headers, "Atendimentos");
  const opportunitiesIndex = findHeaderIndex_(headers, "Oportunidades");
  const salesIndex = findHeaderIndex_(headers, "Vendas");
  const revenueIndex = findHeaderIndex_(headers, "Receita");
  const conversionIndexes = findAllHeaderIndexes_(headers, "Conv.%");

  const missingHeaders = [];
  if (attendantIndex === -1) missingHeaders.push("Atendente");
  if (attendancesIndex === -1) missingHeaders.push("Atendimentos");
  if (opportunitiesIndex === -1) missingHeaders.push("Oportunidades");
  if (salesIndex === -1) missingHeaders.push("Vendas");
  if (revenueIndex === -1) missingHeaders.push("Receita");
  if (conversionIndexes.length < 2) missingHeaders.push("Conv.% duas vezes");

  if (missingHeaders.length) {
    ui.alert(`Colunas ausentes na aba Importar_Asksuite: ${missingHeaders.join(", ")}`);
    return;
  }

  const sourceRows = importValues
    .slice(1)
    .map((row) => {
      const seller = normalizeSellerName_(row[attendantIndex]);
      return [
        reportDate,
        seller,
        toNumber_(row[attendancesIndex]),
        toNumber_(row[conversionIndexes[0]]),
        toNumber_(row[opportunitiesIndex]),
        toNumber_(row[conversionIndexes[1]]),
        toNumber_(row[salesIndex]),
        toNumber_(row[revenueIndex])
      ];
    })
    .filter((row) => ASKSUITE_ALLOWED_SELLERS.indexOf(row[1]) !== -1);

  if (!sourceRows.length) {
    ui.alert("Nenhum vendedor valido encontrado na aba Importar_Asksuite.");
    return;
  }

  const targetValues = targetSheet.getDataRange().getValues();
  const rowsByKey = new Map();
  targetValues.slice(1).forEach((row, index) => {
    const rowDate = normalizeDateKey_(row[0]);
    const seller = normalizeSellerName_(row[1]);
    if (rowDate && seller) rowsByKey.set(`${rowDate}|${seller}`.toUpperCase(), index + 2);
  });

  let nextAppendRow = Math.max(targetSheet.getLastRow() + 1, 2);
  let inserted = 0;
  let updated = 0;

  sourceRows.forEach((sourceRow) => {
    const rowKey = `${sourceRow[0]}|${sourceRow[1]}`.toUpperCase();
    const existingRow = rowsByKey.get(rowKey);
    const targetRow = existingRow || nextAppendRow++;

    targetSheet.getRange(targetRow, 1, 1, ASKSUITE_TARGET_HEADERS.length).setValues([sourceRow]);

    if (existingRow) updated += 1;
    else inserted += 1;
  });

  ui.alert(
    "Importacao Asksuite concluida.\n\n" +
    `Data: ${reportDate}\n` +
    `Lidas: ${sourceRows.length}\n` +
    `Atualizadas: ${updated}\n` +
    `Inseridas: ${inserted}\n\n` +
    "Instagram e atendentes fora do painel foram ignorados."
  );
}

function ensureTargetHeaders_(sheet) {
  sheet.getRange(1, 1, 1, NIARA_TARGET_HEADERS.length).setValues([NIARA_TARGET_HEADERS]);
}

function protectNiaraTargetSheet_(sheet) {
  const lastRow = Math.max(sheet.getMaxRows(), 1000);
  const inputRange = sheet.getRange(2, 18, lastRow - 1, 4);

  sheet.getRange(2, 18, lastRow - 1, 4).setBackground(TEAM_INPUT_BACKGROUND);
  sheet.getRange(1, 18, 1, 4).setBackground("#9fc5e8").setFontWeight("bold");

  sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)
    .filter((protection) => protection.getDescription() === SHEET_PROTECTION_NOTE)
    .forEach((protection) => protection.remove());

  const protection = sheet.protect();
  protection.setDescription(SHEET_PROTECTION_NOTE);
  protection.setWarningOnly(false);
  protection.setUnprotectedRanges([inputRange]);
}

function sortNiaraTargetByAbandonDate_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 2) return;
  const range = sheet.getRange(2, 1, lastRow - 1, NIARA_TARGET_HEADERS.length);
  const rows = range.getValues();
  rows.sort((a, b) => parseNiaraDateTime_(a[1]) - parseNiaraDateTime_(b[1]));
  range.setValues(rows);
}

function parseNiaraDateTime_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return value.getTime();
  }

  const text = String(value || "").trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (br) {
    return new Date(
      Number(br[3]),
      Number(br[2]) - 1,
      Number(br[1]),
      Number(br[4] || 0),
      Number(br[5] || 0)
    ).getTime();
  }

  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function ensureAsksuiteHeaders_(sheet) {
  sheet.getRange(1, 1, 1, ASKSUITE_TARGET_HEADERS.length).setValues([ASKSUITE_TARGET_HEADERS]);
}

function findHeaderIndex_(headers, expectedHeader) {
  const expected = normalizeHeader_(expectedHeader);
  return headers.findIndex((header) => normalizeHeader_(header) === expected);
}

function findAllHeaderIndexes_(headers, expectedHeader) {
  const expected = normalizeHeader_(expectedHeader);
  return headers
    .map((header, index) => normalizeHeader_(header) === expected ? index : -1)
    .filter((index) => index !== -1);
}

function normalizeHeader_(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeSellerName_(value) {
  const key = normalizeHeader_(value);
  const map = {
    "ALINE NUNES": "Aline Nunes",
    "AMANDA MELGACO": "Amanda Melgaco",
    "JULIA RECHE": "Julia Reche",
    "EMANOEL CESAR": "Emanoel Cesar"
  };
  return map[key] || String(value || "").trim();
}

function normalizeDateKey_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return text;
}

function toNumber_(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").replace(/[R$%\s]/g, "").trim();
  const normalized = text.indexOf(",") !== -1 ? text.replace(/\./g, "").replace(",", ".") : text;
  const number = Number(normalized);
  return isNaN(number) ? 0 : number;
}
