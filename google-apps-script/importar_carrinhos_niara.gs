const NIARA_IMPORT_SHEET = "Importar_Niara";
const NIARA_TARGET_SHEET = "Recuperação de carrinhos";

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

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("SUEDS Dashboard")
    .addItem("Importar carrinhos da aba Importar_Niara", "importarCarrinhosNiara")
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

  ui.alert(
    "Importacao concluida.\n\n" +
    `Lidas: ${sourceRows.length}\n` +
    `Atualizadas: ${updated}\n` +
    `Inseridas: ${inserted}\n\n` +
    "As colunas R:U foram preservadas."
  );
}

function ensureTargetHeaders_(sheet) {
  sheet.getRange(1, 1, 1, NIARA_TARGET_HEADERS.length).setValues([NIARA_TARGET_HEADERS]);
}

function findHeaderIndex_(headers, expectedHeader) {
  const expected = normalizeHeader_(expectedHeader);
  return headers.findIndex((header) => normalizeHeader_(header) === expected);
}

function normalizeHeader_(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
