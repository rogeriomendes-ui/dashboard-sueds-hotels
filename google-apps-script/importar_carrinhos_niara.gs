const NIARA_IMPORT_SHEET = "Importar_Niara";
const NIARA_TARGET_SHEET = "Recuperação de carrinhos";
const ASKSUITE_IMPORT_SHEET = "Importar_Asksuite";
const ASKSUITE_TARGET_SHEET = "Asksuite_Atendimentos";
const ASKSUITE_DETAILED_SHEET = "Asksuite_Detalhado";
const SITE_IMPORT_SHEET = "Site";
const SITE_SALES_TARGET_SHEET = "Lancamento_Vendas";
const SHEET_PROTECTION_NOTE = "Protecao operacional SUEDS. Senha de referencia: SuedsGestores2026!";
const SENSITIVE_SHEETS_PROTECTION_NOTE = "Protecao abas sensiveis SUEDS. Apenas gestores autorizados.";
const TEAM_INPUT_BACKGROUND = "#d9eaf7";
const HEADER_BACKGROUND = "#0f4c5c";
const BODY_BACKGROUND = "#ffffff";
const BODY_ALT_BACKGROUND = "#eef5e6";
const BODY_FONT_COLOR = "#000000";
const HEADER_FONT_COLOR = "#ffffff";
const NIARA_RESPONSIBLE_ROTATION = ["Aline Nunes", "Emanoel Cesar", "Amanda Melgaco", "Julia Reche"];
const NIARA_DISTRIBUTION_START_DATE = "2026-07-01";
const NIARA_RESPONSIBLE_OPTIONS = ["Selecione", "Aline Nunes", "Emanoel Cesar", "Amanda Melgaco", "Julia Reche"];
const NIARA_STATUS_OPTIONS = ["Selecione", "Pensando", "Comprou (recuperado)", "Desistiu (não recuperado)"];
const NIARA_LOSS_REASON_OPTIONS = ["Achou caro", "Desistiu da viagem", "Comprou outro hotel", "Escolheu outro destino"];
const NIARA_DEFAULT_STATUS = "Selecione";

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
const ASKSUITE_DETAILED_VALUE_HEADER = "Valor vendido corrigido";
const ASKSUITE_DETAILED_VALUE_FORMULA = '=ARRAYFORMULA(IF(K2:K="",,IFERROR(IF(REGEXMATCH(TO_TEXT(K2:K),",\\d{1,2}$"),NUMBERVALUE(TO_TEXT(K2:K),",","."),NUMBERVALUE(TO_TEXT(K2:K),".",",")),K2:K)))';

const ASKSUITE_ALLOWED_SELLERS = ["Aline Nunes", "Amanda Melgaco", "Julia Reche", "Emanoel Cesar"];
const SENSITIVE_SHEETS = [
  NIARA_IMPORT_SHEET,
  ASKSUITE_IMPORT_SHEET,
  ASKSUITE_TARGET_SHEET,
  ASKSUITE_DETAILED_SHEET,
  "Metas"
];
const MANAGER_EMAILS_PROPERTY = "SUEDS_MANAGER_EDITORS";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("SUEDS Dashboard")
    .addItem("Importar carrinhos da aba Importar_Niara", "importarCarrinhosNiara")
    .addItem("Importar Asksuite da aba Importar_Asksuite", "importarAsksuite")
    .addItem("Importar vendas da aba Site", "importarVendasSite")
    .addItem("Preparar Asksuite Detalhado", "prepararAsksuiteDetalhado")
    .addSeparator()
    .addItem("Ordenar carrinhos do mais antigo ao mais recente", "ordenarCarrinhosAntigoRecente")
    .addItem("Proteger aba de carrinhos", "protegerAbaCarrinhos")
    .addItem("Configurar e-mails gestores", "configurarEmailsGestores")
    .addItem("Proteger abas sensiveis", "protegerAbasSensiveis")
    .addToUi();
}

function importarVendasSite() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheet = SpreadsheetApp.getActive();
  const sourceSheet = spreadsheet.getSheetByName(SITE_IMPORT_SHEET);
  const targetSheet = spreadsheet.getSheetByName(SITE_SALES_TARGET_SHEET);

  if (!sourceSheet) {
    ui.alert(`Aba ${SITE_IMPORT_SHEET} nao encontrada.`);
    return;
  }
  if (!targetSheet) {
    ui.alert(`Aba ${SITE_SALES_TARGET_SHEET} nao encontrada.`);
    return;
  }
  if (sourceSheet.getLastRow() < 2) {
    ui.alert("A aba Site nao tem vendas para importar.");
    return;
  }

  const sourceValues = sourceSheet
    .getRange(1, 1, sourceSheet.getLastRow(), sourceSheet.getLastColumn())
    .getValues();
  const headers = sourceValues[0];
  const indexes = {
    hotel: findHeaderIndex_(headers, "Hotel"),
    reservation: findHeaderIndexAny_(headers, ["N DA RESERVA", "Nº DA RESERVA", "N° DA RESERVA", "NUMERO DA RESERVA"]),
    createdAt: findHeaderIndex_(headers, "DATA DE CRIACAO"),
    checkin: findHeaderIndex_(headers, "CHECK-IN"),
    checkout: findHeaderIndex_(headers, "CHECK-OUT"),
    guest: findHeaderIndex_(headers, "NOME DO HOSPEDE"),
    rooms: findHeaderIndex_(headers, "QUARTOS"),
    total: findHeaderIndex_(headers, "TOTAL (R$)"),
    origin: findHeaderIndex_(headers, "Origem"),
    campaign: findHeaderIndex_(headers, "Campanha")
  };
  const required = ["hotel", "reservation", "createdAt", "checkin", "checkout", "guest", "rooms", "total"];
  const missing = required.filter((key) => indexes[key] < 0);

  if (missing.length) {
    ui.alert(`Colunas obrigatorias ausentes na aba Site: ${missing.join(", ")}`);
    return;
  }

  const targetLastRow = Math.max(targetSheet.getLastRow(), 1);
  const existingCodes = targetLastRow > 1
    ? new Set(targetSheet.getRange(2, 2, targetLastRow - 1, 1).getDisplayValues()
      .flat()
      .map(normalizeReservationCode_)
      .filter(Boolean))
    : new Set();
  const pending = [];
  let skippedDuplicates = 0;

  sourceValues.slice(1).forEach((row) => {
    const reservationCode = String(row[indexes.reservation] || "").trim();
    const normalizedCode = normalizeReservationCode_(reservationCode);
    if (!normalizedCode) return;
    if (existingCodes.has(normalizedCode)) {
      skippedDuplicates += 1;
      return;
    }

    const notes = [];
    if (indexes.origin >= 0 && row[indexes.origin]) notes.push(`Origem: ${row[indexes.origin]}`);
    if (indexes.campaign >= 0 && row[indexes.campaign]) notes.push(`Campanha: ${row[indexes.campaign]}`);

    pending.push({
      reservationCode,
      values: [
        row[indexes.createdAt] || "",
        reservationCode,
        row[indexes.hotel] || "",
        "SITE",
        "",
        row[indexes.guest] || "",
        row[indexes.checkin] || "",
        row[indexes.checkout] || "",
        "",
        row[indexes.rooms] || "",
        "",
        "",
        row[indexes.total] || "",
        "",
        "",
        "Cartao credito",
        "",
        "Confirmada",
        "Site",
        notes.join(" | ")
      ]
    });
    existingCodes.add(normalizedCode);
  });

  if (!pending.length) {
    ui.alert(`Nenhuma venda nova para importar.\nDuplicadas ignoradas: ${skippedDuplicates}`);
    return;
  }

  const targetRows = findEmptySalesRows_(targetSheet, pending.length);
  pending.forEach((record, index) => {
    const rowNumber = targetRows[index];
    targetSheet.getRange(rowNumber, 1, 1, 20).setValues([record.values]);
    targetSheet.getRange(rowNumber, 9).setFormula(`=IF(OR(G${rowNumber}="";H${rowNumber}="");"";H${rowNumber}-G${rowNumber})`);
    targetSheet.getRange(rowNumber, 1).setNumberFormat("dd/mm/yyyy");
    targetSheet.getRange(rowNumber, 7, 1, 2).setNumberFormat("dd/mm/yyyy");
    targetSheet.getRange(rowNumber, 13, 1, 3).setNumberFormat('R$ #,##0.00');
  });

  ui.alert(
    "Importacao de vendas do Site concluida.\n\n" +
    `Novas vendas: ${pending.length}\n` +
    `Duplicadas ignoradas: ${skippedDuplicates}\n` +
    "As vendas foram registradas sem vendedor e serao exibidas apenas no canal Site."
  );
}

function normalizeReservationCode_(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function findEmptySalesRows_(sheet, count) {
  const minimumRows = Math.max(sheet.getMaxRows(), sheet.getLastRow() + count + 10);
  if (sheet.getMaxRows() < minimumRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), minimumRows - sheet.getMaxRows());
  }

  const scanRows = Math.max(minimumRows - 1, count);
  const keys = sheet.getRange(2, 1, scanRows, 2).getDisplayValues();
  const available = [];
  keys.forEach((row, index) => {
    if (!String(row[0] || "").trim() && !String(row[1] || "").trim() && available.length < count) {
      available.push(index + 2);
    }
  });

  if (available.length < count) {
    const missing = count - available.length;
    const start = sheet.getMaxRows() + 1;
    sheet.insertRowsAfter(sheet.getMaxRows(), missing);
    for (let offset = 0; offset < missing; offset += 1) available.push(start + offset);
  }
  return available;
}

function prepararAsksuiteDetalhado() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheet = SpreadsheetApp.getActive();
  const sheet = spreadsheet.getSheetByName(ASKSUITE_DETAILED_SHEET);

  if (!sheet) {
    ui.alert(`Aba ${ASKSUITE_DETAILED_SHEET} nao encontrada.`);
    return;
  }

  sheet.getRange("L1").setValue(ASKSUITE_DETAILED_VALUE_HEADER);
  sheet.getRange("L2").setFormula(ASKSUITE_DETAILED_VALUE_FORMULA);
  sheet.getRange("L:L").setNumberFormat('R$ #,##0.00');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumn(12);

  ui.alert(
    "Asksuite_Detalhado preparado.\n\n" +
    "Continue colando o relatorio da Asksuite em A:K.\n" +
    "A coluna L agora calcula o Valor vendido corrigido para o dashboard."
  );
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
  let nextResponsibleIndex = nextResponsibleIndexFromTarget_(targetValues);
  const responsibleDistribution = {};

  sourceRows.forEach((sourceRow) => {
    const id = String(sourceRow[0] || "").trim();
    const existingRow = rowsById.get(id);
    const targetRow = existingRow || nextAppendRow++;

    targetSheet.getRange(targetRow, 1, 1, NIARA_SOURCE_HEADERS.length).setValues([sourceRow]);

    if (existingRow) {
      updated += 1;
    } else {
      const responsible = NIARA_RESPONSIBLE_ROTATION[nextResponsibleIndex % NIARA_RESPONSIBLE_ROTATION.length];
      targetSheet.getRange(targetRow, 18, 1, 4).setValues([[responsible, NIARA_DEFAULT_STATUS, "", ""]]);
      responsibleDistribution[responsible] = (responsibleDistribution[responsible] || 0) + 1;
      nextResponsibleIndex += 1;
      inserted += 1;
    }
  });

  sanitizeNiaraWorkColumns_(targetSheet);
  sortNiaraTargetByAbandonDate_(targetSheet);
  protectNiaraTargetSheet_(targetSheet);

  ui.alert(
    "Importacao concluida.\n\n" +
    `Lidas: ${sourceRows.length}\n` +
    `Atualizadas: ${updated}\n` +
    `Inseridas: ${inserted}\n\n` +
    formatResponsibleDistribution_(responsibleDistribution) +
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

function protegerAbasSensiveis() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheet = SpreadsheetApp.getActive();
  const managerEmails = getManagerEmails_();
  const protectedSheets = [];
  const missingSheets = [];

  if (!managerEmails.length) {
    ui.alert(
      "Antes de proteger, configure os e-mails dos gestores.\n\n" +
      "Use o menu: SUEDS Dashboard > Configurar e-mails gestores"
    );
    return;
  }

  SENSITIVE_SHEETS.forEach((sheetName) => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      missingSheets.push(sheetName);
      return;
    }

    protectSheetForManagers_(sheet, SENSITIVE_SHEETS_PROTECTION_NOTE, managerEmails);
    protectedSheets.push(sheetName);
  });

  ui.alert(
    "Protecao das abas sensiveis aplicada.\n\n" +
    `Abas protegidas:\n${protectedSheets.length ? protectedSheets.join("\n") : "Nenhuma"}\n\n` +
    (missingSheets.length ? `Abas nao encontradas:\n${missingSheets.join("\n")}\n\n` : "") +
    `Gestores autorizados:\n${managerEmails.join("\n")}\n\n` +
    "Somente estes e-mails poderao editar essas guias.\n\n" +
    "Observacao: Google Sheets nao usa senha por aba. A seguranca e feita por e-mail autorizado."
  );
}

function configurarEmailsGestores() {
  const ui = SpreadsheetApp.getUi();
  const currentEmails = getManagerEmails_();
  const response = ui.prompt(
    "Configurar e-mails gestores",
    "Informe os e-mails que podem editar abas sensiveis, separados por virgula.\n\n" +
    "Exemplo: rogeriomendes@suedshotels.com.br, gestor@suedshotels.com.br\n\n" +
    `Atual: ${currentEmails.join(", ") || "nenhum"}`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const emails = parseEmails_(response.getResponseText());
  const currentUserEmail = Session.getEffectiveUser().getEmail();
  if (currentUserEmail && !emails.includes(currentUserEmail)) emails.unshift(currentUserEmail);

  if (!emails.length) {
    ui.alert("Nenhum e-mail valido informado.");
    return;
  }

  PropertiesService.getDocumentProperties().setProperty(MANAGER_EMAILS_PROPERTY, emails.join(","));
  ui.alert(
    "E-mails gestores salvos.\n\n" +
    emails.join("\n") +
    "\n\nAgora rode: SUEDS Dashboard > Proteger abas sensiveis"
  );
}

function ordenarCarrinhosAntigoRecente() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheet = SpreadsheetApp.getActive();
  const targetSheet = spreadsheet.getSheetByName(NIARA_TARGET_SHEET);

  if (!targetSheet) {
    ui.alert(`Aba ${NIARA_TARGET_SHEET} nao encontrada.`);
    return;
  }

  sortNiaraTargetByAbandonDate_(targetSheet);
  ui.alert("Carrinhos ordenados do mais antigo para o mais recente.");
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

  ensureAsksuiteHeaders_(targetSheet);

  const importValues = importSheet.getDataRange().getValues();
  if (importValues.length < 2) {
    ui.alert("A aba Importar_Asksuite nao tem dados para importar.");
    return;
  }

  const headers = importValues[0];
  const attendantIndex = findHeaderIndex_(headers, "Atendente");
  const startIndex = findHeaderIndex_(headers, "Início do atendimento");
  const attendancesIndex = findHeaderIndex_(headers, "Atendimentos");
  const opportunitiesIndex = findHeaderIndex_(headers, "Oportunidades");
  const salesIndex = findHeaderIndex_(headers, "Vendas");
  const revenueIndex = findHeaderIndex_(headers, "Receita") !== -1
    ? findHeaderIndex_(headers, "Receita")
    : findHeaderIndex_(headers, "Valor vendido");
  const conversionIndexes = findAllHeaderIndexes_(headers, "Conv.%");
  const isDetailedReport = attendantIndex !== -1 && startIndex !== -1 && opportunitiesIndex !== -1 && salesIndex !== -1 && revenueIndex !== -1;

  let sourceRows;
  let reportDateLabel = "datas do arquivo";

  if (isDetailedReport) {
    sourceRows = aggregateDetailedAsksuiteRows_(importValues.slice(1), {
      attendantIndex,
      startIndex,
      opportunitiesIndex,
      salesIndex,
      revenueIndex
    });
  } else {
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
    reportDateLabel = reportDate;

    const missingHeaders = [];
    if (attendantIndex === -1) missingHeaders.push("Atendente");
    if (attendancesIndex === -1) missingHeaders.push("Atendimentos");
    if (opportunitiesIndex === -1) missingHeaders.push("Oportunidades");
    if (salesIndex === -1) missingHeaders.push("Vendas");
    if (revenueIndex === -1) missingHeaders.push("Receita ou Valor vendido");
    if (conversionIndexes.length < 2) missingHeaders.push("Conv.% duas vezes");

    if (missingHeaders.length) {
      ui.alert(`Colunas ausentes na aba Importar_Asksuite: ${missingHeaders.join(", ")}`);
      return;
    }

    sourceRows = importValues
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
  }

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
    `Data: ${reportDateLabel}\n` +
    `Lidas: ${sourceRows.length}\n` +
    `Atualizadas: ${updated}\n` +
    `Inseridas: ${inserted}\n\n` +
    "Instagram e atendentes fora do painel foram ignorados."
  );
}

function ensureTargetHeaders_(sheet) {
  sheet.getRange(1, 1, 1, NIARA_TARGET_HEADERS.length).setValues([NIARA_TARGET_HEADERS]);
  formatNiaraTargetSheet_(sheet);
}

function aggregateDetailedAsksuiteRows_(rows, indexes) {
  const grouped = {};

  rows.forEach((row) => {
    const seller = normalizeSellerName_(row[indexes.attendantIndex]);
    if (ASKSUITE_ALLOWED_SELLERS.indexOf(seller) === -1) return;

    const date = normalizeDateKey_(row[indexes.startIndex]);
    if (!date) return;

    const key = `${date}|${seller}`;
    if (!grouped[key]) {
      grouped[key] = {
        date,
        seller,
        attendances: 0,
        opportunities: 0,
        sales: 0,
        revenue: 0
      };
    }

    grouped[key].attendances += 1;
    grouped[key].opportunities += toNumber_(row[indexes.opportunitiesIndex]);
    grouped[key].sales += toNumber_(row[indexes.salesIndex]);
    grouped[key].revenue += toNumber_(row[indexes.revenueIndex]);
  });

  return Object.values(grouped)
    .sort((a, b) => a.date.localeCompare(b.date) || a.seller.localeCompare(b.seller, "pt-BR"))
    .map((item) => [
      item.date,
      item.seller,
      item.attendances,
      percentage_(item.opportunities, item.attendances),
      item.opportunities,
      percentage_(item.sales, item.opportunities),
      item.sales,
      item.revenue
    ]);
}

function percentage_(part, total) {
  return total ? (Number(part || 0) / Number(total || 0)) * 100 : 0;
}

function formatResponsibleDistribution_(distribution) {
  const lines = NIARA_RESPONSIBLE_ROTATION
    .filter((name) => distribution[name])
    .map((name) => `${name}: ${distribution[name]}`);
  return lines.length ? `Distribuicao automatica:\n${lines.join("\n")}\n\n` : "";
}

function nextResponsibleIndexFromTarget_(targetValues) {
  const distributed = targetValues
    .slice(1)
    .filter((row) => {
      const id = String(row[0] || "").trim();
      const abandonDate = parseNiaraDateTime_(row[1]);
      const responsible = normalizeSellerName_(row[17]);
      return id &&
        abandonDate >= parseNiaraDateTime_(`${NIARA_DISTRIBUTION_START_DATE} 00:00`) &&
        NIARA_RESPONSIBLE_ROTATION.indexOf(responsible) !== -1;
    }).length;
  return distributed % NIARA_RESPONSIBLE_ROTATION.length;
}

function protectNiaraTargetSheet_(sheet) {
  const lastRow = Math.max(sheet.getMaxRows(), 1000);
  const inputRange = sheet.getRange(2, 18, lastRow - 1, 4);

  formatNiaraTargetSheet_(sheet);

  sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)
    .filter((protection) => protection.getDescription() === SHEET_PROTECTION_NOTE)
    .forEach((protection) => protection.remove());

  const protection = sheet.protect();
  protection.setDescription(SHEET_PROTECTION_NOTE);
  protection.setWarningOnly(false);
  protection.setUnprotectedRanges([inputRange]);

  applyNiaraInputValidations_(sheet);
}

function protectSheetForManagers_(sheet, description, managerEmails) {
  sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)
    .filter((protection) => protection.getDescription() === description)
    .forEach((protection) => protection.remove());

  const protection = sheet.protect();
  protection.setDescription(description);
  protection.setWarningOnly(false);

  const currentUser = Session.getEffectiveUser();
  const currentUserEmail = currentUser.getEmail();
  const allowedEmails = Array.from(new Set([currentUserEmail].concat(managerEmails).filter(Boolean)));
  protection.addEditors(allowedEmails);

  const editorsToRemove = protection.getEditors()
    .filter((editor) => !allowedEmails.includes(editor.getEmail()));
  if (editorsToRemove.length) protection.removeEditors(editorsToRemove);

  if (protection.canDomainEdit()) protection.setDomainEdit(false);
}

function getManagerEmails_() {
  const stored = PropertiesService.getDocumentProperties().getProperty(MANAGER_EMAILS_PROPERTY);
  const emails = parseEmails_(stored);
  const currentUserEmail = Session.getEffectiveUser().getEmail();
  if (currentUserEmail && !emails.includes(currentUserEmail)) emails.unshift(currentUserEmail);
  return emails;
}

function parseEmails_(value) {
  return String(value || "")
    .split(/[,;\n]/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function sortNiaraTargetByAbandonDate_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 2) return;

  sanitizeNiaraWorkColumns_(sheet);

  const range = sheet.getRange(2, 1, lastRow - 1, NIARA_TARGET_HEADERS.length);
  const rows = range.getValues();
  const validRows = rows
    .filter((row) => String(row[0] || "").trim() && parseNiaraDateTime_(row[1]) > 0)
    .sort((a, b) => parseNiaraDateTime_(a[1]) - parseNiaraDateTime_(b[1]));
  const emptyRows = rows.filter((row) => !String(row[0] || "").trim() || parseNiaraDateTime_(row[1]) <= 0);
  const sortedRows = validRows.concat(emptyRows);

  if (!validRows.length) return;

  range.setValues(sortedRows);
  formatNiaraTargetSheet_(sheet);
  sheet.setActiveRange(sheet.getRange(2, 2));
}

function sanitizeNiaraWorkColumns_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const range = sheet.getRange(2, 18, lastRow - 1, 4);
  const values = range.getValues();
  let changed = false;

  const sanitized = values.map((row) => {
    const next = row.slice();
    const responsible = String(next[0] || "").trim();
    const status = String(next[1] || "").trim();
    const reason = String(next[2] || "").trim();

    if (!NIARA_RESPONSIBLE_OPTIONS.includes(responsible)) {
      next[0] = "Selecione";
      changed = true;
    }

    if (!NIARA_STATUS_OPTIONS.includes(status)) {
      next[1] = NIARA_DEFAULT_STATUS;
      changed = true;
    }

    if (reason && !NIARA_LOSS_REASON_OPTIONS.includes(reason)) {
      next[2] = "";
      changed = true;
    }

    return next;
  });

  if (changed) range.setValues(sanitized);
}

function formatNiaraTargetSheet_(sheet) {
  const maxRows = Math.max(sheet.getMaxRows(), 1000);
  const maxColumns = NIARA_TARGET_HEADERS.length;
  const lastRow = Math.max(sheet.getLastRow(), 2);

  sheet.getRange(1, 1, 1, maxColumns)
    .setBackground(HEADER_BACKGROUND)
    .setFontColor(HEADER_FONT_COLOR)
    .setFontWeight("bold");

  const bodyRange = sheet.getRange(2, 1, Math.max(maxRows - 1, 1), maxColumns);
  bodyRange
    .setFontColor(BODY_FONT_COLOR)
    .setFontWeight("normal")
    .setBackground(BODY_BACKGROUND);

  for (let row = 2; row <= lastRow; row += 2) {
    sheet.getRange(row, 1, 1, maxColumns).setBackground(BODY_ALT_BACKGROUND);
  }

  sheet.getRange(2, 18, Math.max(maxRows - 1, 1), 4)
    .setBackground(TEAM_INPUT_BACKGROUND)
    .setFontColor(BODY_FONT_COLOR);
  sheet.getRange(1, 18, 1, 4)
    .setBackground("#9fc5e8")
    .setFontColor(BODY_FONT_COLOR)
    .setFontWeight("bold");

  sheet.getRange(2, 2, Math.max(maxRows - 1, 1), 1).setNumberFormat("dd/mm/yyyy hh:mm");
  sheet.getRange(2, 3, Math.max(maxRows - 1, 1), 1).setNumberFormat("dd/mm/yyyy");
  sheet.getRange(2, 4, Math.max(maxRows - 1, 1), 1).setNumberFormat("hh:mm");
  sheet.getRange(2, 5, Math.max(maxRows - 1, 1), 2).setNumberFormat("dd/mm/yyyy");
  sheet.setColumnWidth(2, 135);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 115);
  sheet.setColumnWidth(5, 105);
  sheet.setColumnWidth(6, 105);

  applyNiaraInputValidations_(sheet);
}

function applyNiaraInputValidations_(sheet) {
  const maxRows = Math.max(sheet.getMaxRows(), 1000);
  const responsibleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(NIARA_RESPONSIBLE_OPTIONS, true)
    .setAllowInvalid(false)
    .build();
  const lossReasonRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(NIARA_LOSS_REASON_OPTIONS, true)
    .setAllowInvalid(false)
    .build();
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(NIARA_STATUS_OPTIONS, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, 18, Math.max(maxRows - 1, 1), 1).setDataValidation(responsibleRule);
  sheet.getRange(2, 19, Math.max(maxRows - 1, 1), 1).setDataValidation(statusRule);
  sheet.getRange(2, 20, Math.max(maxRows - 1, 1), 1).setDataValidation(lossReasonRule);
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

function findHeaderIndexAny_(headers, expectedHeaders) {
  for (const expectedHeader of expectedHeaders) {
    const index = findHeaderIndex_(headers, expectedHeader);
    if (index >= 0) return index;
  }
  return -1;
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
