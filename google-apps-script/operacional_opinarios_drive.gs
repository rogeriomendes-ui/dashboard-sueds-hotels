const OPINARIOS_SHEET = "Opinarios";
const OPINARIOS_REVIEW_SHEET = "Revisao_Opinarios";
const OPINARIOS_CONFIG_SHEET = "Config_Operacional";
const OPINARIOS_HOTELS_SHEET = "Hoteis_Operacional";

const OPINARIOS_HOTELS = [
  ["SUEDS CABRALIA", "Ativo", 1, ""],
  ["SUEDS SEGUNDO SOL", "Ativo", 2, ""],
  ["SUEDS PLAZA", "Ativo", 3, ""],
  ["SUEDS PREMIUM", "Ativo", 4, ""],
  ["SUEDS TRANCOSO", "Ativo", 5, ""],
  ["CASAS SUEDS ARRAIAL", "Planejado", 6, "Sexto hotel do grupo."]
];

const OPINARIOS_HEADERS = [
  "ID Arquivo",
  "Data Processamento",
  "Hotel",
  "Nome Arquivo",
  "Link Foto",
  "Nome Hospede",
  "Apartamento",
  "Impressao Geral",
  "Nivel Apartamentos",
  "Alimentos Cafe da Manha",
  "Alimentos Bar da Piscina",
  "Alimentos Jantar",
  "Atendimento Cafe da Manha",
  "Atendimento Bar da Piscina",
  "Atendimento Jantar",
  "Apartamento Limpeza Diaria",
  "Apartamento Conforto Geral",
  "Apartamento Equipamentos",
  "Servicos Recepcao",
  "Servicos Atendimento",
  "Servicos Area Externa",
  "Servicos Piscina",
  "Obs Alimentos",
  "Obs Atendimento",
  "Obs Apartamento",
  "Destaques",
  "Problemas Identificados",
  "Nota Calculada %",
  "Confianca %",
  "Status",
  "Responsavel Revisao",
  "Observacao Revisao",
  "Data Revisao"
];

const OPINARIOS_REVIEW_HEADERS = [
  "ID Arquivo",
  "Data Processamento",
  "Hotel",
  "Link Foto",
  "Motivo Revisao",
  "Campos com Duvida",
  "Status Revisao",
  "Responsavel",
  "Data Revisao"
];

const OPINARIOS_CONFIG_DEFAULTS = [
  ["OPINARIOS_SOURCE_FOLDER_ID", "", "Pasta do Drive onde os hoteis colocam as fotos novas."],
  ["OPINARIOS_PROCESSED_FOLDER_ID", "", "Opcional. Pasta para mover fotos processadas."],
  ["OPINARIOS_ERROR_FOLDER_ID", "", "Opcional. Pasta para mover fotos com erro."],
  ["OPINARIOS_MIN_CONFIDENCE", "80", "Confianca minima para aprovar automaticamente."],
  ["OPINARIOS_AI_PROVIDER", "OpenAI", "Provedor de IA de visao. Primeira versao usando OpenAI Vision."],
  ["OPENAI_MODEL", "gpt-4o-mini", "Modelo OpenAI usado para ler os opiniarios."],
  ["OPINARIOS_MAX_IMAGE_MB", "10", "Tamanho maximo da imagem para envio automatico a IA."]
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("SUEDS Operacional")
    .addItem("Preparar abas de opiniarios", "prepararOpinariosOperacional")
    .addItem("Processar novas fotos do Drive", "processarNovosOpinariosDrive")
    .addItem("Reprocessar pendentes com OpenAI", "reprocessarOpinariosPendentesOpenAI")
    .addSeparator()
    .addItem("Configurar OpenAI API Key", "configurarOpenAiApiKey")
    .addItem("Testar OpenAI API Key", "testarOpenAiApiKey")
    .addItem("Criar gatilho a cada 15 minutos", "criarGatilhoOpinarios15Min")
    .addItem("Remover gatilhos de opiniarios", "removerGatilhosOpinarios")
    .addToUi();
}

function prepararOpinariosOperacional() {
  const spreadsheet = SpreadsheetApp.getActive();
  const opinionsSheet = getOrCreateSheet_(spreadsheet, OPINARIOS_SHEET);
  const reviewSheet = getOrCreateSheet_(spreadsheet, OPINARIOS_REVIEW_SHEET);
  const configSheet = getOrCreateSheet_(spreadsheet, OPINARIOS_CONFIG_SHEET);
  const hotelsSheet = getOrCreateSheet_(spreadsheet, OPINARIOS_HOTELS_SHEET);

  ensureHeader_(opinionsSheet, OPINARIOS_HEADERS);
  ensureHeader_(reviewSheet, OPINARIOS_REVIEW_HEADERS);
  ensureConfig_(configSheet);
  ensureHotels_(hotelsSheet);

  formatSheet_(opinionsSheet, OPINARIOS_HEADERS.length);
  formatSheet_(reviewSheet, OPINARIOS_REVIEW_HEADERS.length);
  formatSheet_(configSheet, 3);
  formatSheet_(hotelsSheet, 4);

  SpreadsheetApp.getUi().alert(
    "Abas preparadas.\n\n" +
    "Agora preencha OPINARIOS_SOURCE_FOLDER_ID na aba Config_Operacional com o ID da pasta do Drive."
  );
}

function processarNovosOpinariosDrive() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheet = SpreadsheetApp.getActive();
  const opinionsSheet = spreadsheet.getSheetByName(OPINARIOS_SHEET);
  const reviewSheet = spreadsheet.getSheetByName(OPINARIOS_REVIEW_SHEET);
  const configSheet = spreadsheet.getSheetByName(OPINARIOS_CONFIG_SHEET);

  if (!opinionsSheet || !reviewSheet || !configSheet) {
    ui.alert("Prepare as abas primeiro em SUEDS Operacional > Preparar abas de opiniarios.");
    return;
  }

  const config = readConfig_(configSheet);
  const sourceFolderId = String(config.OPINARIOS_SOURCE_FOLDER_ID || "").trim();
  if (!sourceFolderId) {
    ui.alert("Preencha OPINARIOS_SOURCE_FOLDER_ID na aba Config_Operacional.");
    return;
  }

  ensureHeader_(opinionsSheet, OPINARIOS_HEADERS);
  ensureHeader_(reviewSheet, OPINARIOS_REVIEW_HEADERS);

  const existingIds = getExistingOpinionIds_(opinionsSheet);
  const files = listImageFilesRecursive_(DriveApp.getFolderById(sourceFolderId));
  let inserted = 0;
  let review = 0;
  let ignored = 0;

  files.forEach((file) => {
    const fileId = file.getId();
    if (existingIds.has(fileId)) {
      ignored += 1;
      return;
    }

    const hotel = inferHotelFromFile_(file, sourceFolderId);
    const extracted = analyzeOpinionImage_(file, hotel, config);
    const status = extracted.status || "Pendente IA";
    const now = new Date();

    const row = buildOpinionRow_(file, now, hotel, extracted, status);
    opinionsSheet.appendRow(row);
    inserted += 1;

    if (status !== "Aprovado") {
      reviewSheet.appendRow([
        fileId,
        now,
        hotel,
        file.getUrl(),
        extracted.reviewReason || "Leitura automatica ainda nao configurada ou requer revisao.",
        extracted.uncertainFields || "",
        "Pendente",
        "",
        ""
      ]);
      review += 1;
    }

    moveProcessedFileIfConfigured_(file, config);
  });

  ui.alert(
    "Processamento concluido.\n\n" +
    `Novos registros: ${inserted}\n` +
    `Enviados para revisao: ${review}\n` +
    `Ignorados por ja existir: ${ignored}`
  );
}

function reprocessarOpinariosPendentesOpenAI() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheet = SpreadsheetApp.getActive();
  const opinionsSheet = spreadsheet.getSheetByName(OPINARIOS_SHEET);
  const reviewSheet = spreadsheet.getSheetByName(OPINARIOS_REVIEW_SHEET);
  const configSheet = spreadsheet.getSheetByName(OPINARIOS_CONFIG_SHEET);

  if (!opinionsSheet || !reviewSheet || !configSheet) {
    ui.alert("Prepare as abas primeiro em SUEDS Operacional > Preparar abas de opiniarios.");
    return;
  }

  const config = readConfig_(configSheet);
  const lastRow = opinionsSheet.getLastRow();
  if (lastRow < 2) {
    ui.alert("Nao ha opiniarios para reprocessar.");
    return;
  }

  let processed = 0;
  let approved = 0;
  let sentToReview = 0;

  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const row = opinionsSheet.getRange(rowNumber, 1, 1, OPINARIOS_HEADERS.length).getValues()[0];
    const fileId = String(row[0] || "").trim();
    const hotel = String(row[2] || "").trim() || "Nao identificado";
    const status = String(row[29] || "").trim();

    if (!fileId || status === "Aprovado") continue;

    const file = DriveApp.getFileById(fileId);
    const extracted = analyzeOpinionImage_(file, hotel, config);
    const newStatus = extracted.status || "Revisao";
    const updatedRow = buildOpinionRow_(file, row[1] || new Date(), hotel, extracted, newStatus);

    opinionsSheet.getRange(rowNumber, 1, 1, OPINARIOS_HEADERS.length).setValues([updatedRow]);
    processed += 1;

    if (newStatus === "Aprovado") {
      approved += 1;
    } else {
      reviewSheet.appendRow([
        fileId,
        new Date(),
        hotel,
        file.getUrl(),
        extracted.reviewReason || "Revisao recomendada pela IA.",
        extracted.uncertainFields || "",
        "Pendente",
        "",
        ""
      ]);
      sentToReview += 1;
    }
  }

  ui.alert(
    "Reprocessamento concluido.\n\n" +
    `Processados: ${processed}\n` +
    `Aprovados automaticamente: ${approved}\n` +
    `Enviados para revisao: ${sentToReview}`
  );
}

function configurarOpenAiApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "Configurar OpenAI API Key",
    "Cole a OPENAI_API_KEY. Ela sera salva nas Propriedades do Script, nao na planilha.",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const apiKey = String(response.getResponseText() || "").trim();
  if (!apiKey) {
    ui.alert("Chave nao informada.");
    return;
  }

  PropertiesService.getScriptProperties().setProperty("OPENAI_API_KEY", apiKey);
  ui.alert("OPENAI_API_KEY salva com sucesso nas Propriedades do Script.");
}

function testarOpenAiApiKey() {
  const ui = SpreadsheetApp.getUi();
  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) {
    ui.alert("OPENAI_API_KEY nao encontrada. Rode primeiro: SUEDS Operacional > Configurar OpenAI API Key.");
    return;
  }

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/models", {
    method: "get",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  if (statusCode >= 200 && statusCode < 300) {
    ui.alert("OpenAI API Key validada com sucesso.");
    return;
  }

  ui.alert(`Falha ao validar OpenAI API Key.\n\nHTTP ${statusCode}\n${response.getContentText().slice(0, 800)}`);
}

function criarGatilhoOpinarios15Min() {
  removerGatilhosOpinarios();
  ScriptApp.newTrigger("processarNovosOpinariosDrive")
    .timeBased()
    .everyMinutes(15)
    .create();
  SpreadsheetApp.getUi().alert("Gatilho criado para processar novas fotos a cada 15 minutos.");
}

function removerGatilhosOpinarios() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "processarNovosOpinariosDrive")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
}

function analyzeOpinionImage_(file, hotel, config) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) {
    return {
      hotel,
      confidence: 0,
      status: "Pendente IA",
      reviewReason: "Configurar OPENAI_API_KEY no menu SUEDS Operacional.",
      uncertainFields: "Todos os campos"
    };
  }

  try {
    const maxMb = Number(config.OPINARIOS_MAX_IMAGE_MB || 10);
    const bytes = file.getBlob().getBytes();
    const sizeMb = bytes.length / 1024 / 1024;
    if (sizeMb > maxMb) {
      return {
        hotel,
        confidence: 0,
        status: "Revisao",
        reviewReason: `Imagem com ${sizeMb.toFixed(1)} MB, acima do limite configurado de ${maxMb} MB.`,
        uncertainFields: "Todos os campos"
      };
    }

    const extracted = callOpenAiOpinionReader_(file, hotel, config, bytes, apiKey);
    const confidence = Number(extracted.confidence || 0);
    const minConfidence = Number(config.OPINARIOS_MIN_CONFIDENCE || 80);
    const completeness = validateOpinionCompleteness_(extracted);
    extracted.status = confidence >= minConfidence && completeness.ok ? "Aprovado" : "Revisao";
    extracted.reviewReason = extracted.status === "Aprovado"
      ? ""
      : [extracted.reviewReason, confidence < minConfidence ? `Confianca ${confidence}% abaixo do minimo ${minConfidence}%.` : "", completeness.reason]
        .filter(Boolean)
        .join(" ");
    if (completeness.missingFields) extracted.uncertainFields = [extracted.uncertainFields, completeness.missingFields].filter(Boolean).join(", ");
    return extracted;
  } catch (err) {
    return {
      hotel,
      confidence: 0,
      status: "Erro IA",
      reviewReason: err.message,
      uncertainFields: "Todos os campos"
    };
  }
}

function validateOpinionCompleteness_(extracted) {
  const ratingFields = [
    ["generalImpression", "Impressao Geral"],
    ["apartmentLevel", "Nivel Apartamentos"],
    ["foodBreakfast", "Alimentos Cafe da Manha"],
    ["foodPoolBar", "Alimentos Bar da Piscina"],
    ["foodDinner", "Alimentos Jantar"],
    ["serviceBreakfast", "Atendimento Cafe da Manha"],
    ["servicePoolBar", "Atendimento Bar da Piscina"],
    ["serviceDinner", "Atendimento Jantar"],
    ["roomCleaning", "Apartamento Limpeza Diaria"],
    ["roomComfort", "Apartamento Conforto Geral"],
    ["roomEquipment", "Apartamento Equipamentos"],
    ["frontDesk", "Servicos Recepcao"],
    ["generalService", "Servicos Atendimento"],
    ["externalArea", "Servicos Area Externa"],
    ["pool", "Servicos Piscina"]
  ];

  const filled = ratingFields.filter(([field]) => String(extracted[field] || "").trim()).length;
  const missing = ratingFields
    .filter(([field]) => !String(extracted[field] || "").trim())
    .map(([, label]) => label);

  if (filled < 8) {
    return {
      ok: false,
      reason: `Poucos campos de nota preenchidos (${filled}/15). Conferir marcacoes.`,
      missingFields: missing.join(", ")
    };
  }

  return { ok: true, reason: "", missingFields: "" };
}

function callOpenAiOpinionReader_(file, hotel, config, bytes, apiKey) {
  const blob = file.getBlob();
  const mimeType = blob.getContentType() || "image/jpeg";
  const base64 = Utilities.base64Encode(bytes);
  const imageUrl = `data:${mimeType};base64,${base64}`;
  const model = String(config.OPENAI_MODEL || "gpt-4o-mini").trim();

  const payload = {
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildOpenAiOpinionPrompt_(hotel)
          },
          {
            type: "input_image",
            image_url: imageUrl,
            detail: "high"
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_object"
      }
    },
    max_output_tokens: 1800
  };

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`OpenAI HTTP ${statusCode}: ${responseText}`);
  }

  const parsed = JSON.parse(responseText);
  const outputText = extractOpenAiOutputText_(parsed);
  if (!outputText) {
    throw new Error("OpenAI nao retornou texto estruturado.");
  }

  const data = JSON.parse(outputText);
  return normalizeOpenAiOpinionResult_(data, hotel);
}

function buildOpenAiOpinionPrompt_(hotel) {
  return [
    "Voce esta lendo uma foto de um opiniario em papel da SUEDS Hotels.",
    "Extraia apenas o que estiver visivel. Se um campo nao estiver legivel, use string vazia e inclua o campo em uncertainFields.",
    "As opcoes possiveis de avaliacao sao: Excelente, Muito bom, Otimo, Bom, Regular.",
    "Quando houver marcacao com X, risco, circulo, rabisco claro ou linha dentro dos parenteses, considere aquela opcao selecionada.",
    "Se nao houver nenhuma marcacao visivel em uma linha, deixe o campo vazio. Nao chute Regular, Bom ou Otimo apenas por proximidade visual.",
    "Trate cada linha como independente. Nunca copie a resposta de uma linha para a proxima apenas porque estao no mesmo bloco.",
    "Nao preencha uma avaliacao por simetria, padrao ou suposicao. Preencha somente quando houver marca visivel naquela linha.",
    "Se houver uma linha vertical ou traco continuo atravessando varios parenteses de uma mesma coluna, aplique a opcao daquela coluna somente aos itens cujos parenteses foram claramente cruzados pela linha.",
    "A regra da linha vertical e mais comum no bloco 'Qual sua opiniao quanto aos servicos'. Nao use essa regra para alimentos, atendimento ou apartamento sem evidencia clara.",
    "Antes de responder, faca uma segunda varredura visual somente nas marcacoes dos parenteses, linha por linha.",
    "Checklist de alimentos: Cafe da Manha, Bar da Piscina e Jantar devem ser avaliados separadamente. Se Bar da Piscina nao tiver marca propria, foodPoolBar deve ficar vazio.",
    "Checklist de atendimento: Cafe da Manha, Bar da Piscina e Jantar devem ser avaliados separadamente. Se Bar da Piscina nao tiver marca propria, servicePoolBar deve ficar vazio.",
    "Checklist de apartamento: Limpeza Diaria, Conforto Geral e Equipamentos devem ser avaliados separadamente; se cada uma das tres linhas tiver X em Regular, preencha as tres como Regular.",
    "Checklist de servicos: Recepcao, Atendimento, Area externa e Piscina devem ser avaliados separadamente; se uma linha vertical cruzar a coluna Bom nas quatro linhas, preencha as quatro como Bom.",
    "Padronize acentos e caixa baixa/alta naturalmente em portugues.",
    `Hotel esperado pela pasta: ${hotel}.`,
    "Responda somente JSON valido, sem markdown, neste formato:",
    "{",
    '  "guestName": "",',
    '  "apartment": "",',
    '  "generalImpression": "",',
    '  "apartmentLevel": "",',
    '  "foodBreakfast": "",',
    '  "foodPoolBar": "",',
    '  "foodDinner": "",',
    '  "serviceBreakfast": "",',
    '  "servicePoolBar": "",',
    '  "serviceDinner": "",',
    '  "roomCleaning": "",',
    '  "roomComfort": "",',
    '  "roomEquipment": "",',
    '  "frontDesk": "",',
    '  "generalService": "",',
    '  "externalArea": "",',
    '  "pool": "",',
    '  "foodNotes": "",',
    '  "serviceNotes": "",',
    '  "roomNotes": "",',
    '  "highlights": "",',
    '  "issues": "",',
    '  "score": 0,',
    '  "confidence": 0,',
    '  "uncertainFields": "",',
    '  "reviewReason": ""',
    "}",
    "Calcule score como media percentual dos campos de nota lidos: Excelente/Otimo=100, Muito bom=85, Bom=70, Regular=40.",
    "confidence deve ser 0 a 100 considerando qualidade da foto, legibilidade e clareza das marcacoes."
  ].join("\n");
}

function extractOpenAiOutputText_(response) {
  if (response.output_text) return response.output_text;
  const chunks = [];
  (response.output || []).forEach((item) => {
    (item.content || []).forEach((content) => {
      if (content.text) chunks.push(content.text);
    });
  });
  return chunks.join("\n").trim();
}

function normalizeOpenAiOpinionResult_(data, hotel) {
  const result = {
    hotel,
    guestName: data.guestName || "",
    apartment: data.apartment || "",
    generalImpression: normalizeRating_(data.generalImpression),
    apartmentLevel: normalizeRating_(data.apartmentLevel),
    foodBreakfast: normalizeRating_(data.foodBreakfast),
    foodPoolBar: normalizeRating_(data.foodPoolBar),
    foodDinner: normalizeRating_(data.foodDinner),
    serviceBreakfast: normalizeRating_(data.serviceBreakfast),
    servicePoolBar: normalizeRating_(data.servicePoolBar),
    serviceDinner: normalizeRating_(data.serviceDinner),
    roomCleaning: normalizeRating_(data.roomCleaning),
    roomComfort: normalizeRating_(data.roomComfort),
    roomEquipment: normalizeRating_(data.roomEquipment),
    frontDesk: normalizeRating_(data.frontDesk),
    generalService: normalizeRating_(data.generalService),
    externalArea: normalizeRating_(data.externalArea),
    pool: normalizeRating_(data.pool),
    foodNotes: data.foodNotes || "",
    serviceNotes: data.serviceNotes || "",
    roomNotes: data.roomNotes || "",
    highlights: data.highlights || "",
    issues: data.issues || "",
    score: Number(data.score || 0),
    confidence: Number(data.confidence || 0),
    uncertainFields: data.uncertainFields || "",
    reviewReason: data.reviewReason || ""
  };

  if (!result.score) result.score = calculateOpinionScore_(result);
  return result;
}

function normalizeRating_(value) {
  const text = normalizeText_(value);
  if (!text) return "";
  if (text.indexOf("EXCELENTE") !== -1) return "Excelente";
  if (text.indexOf("OTIMO") !== -1) return "Otimo";
  if (text.indexOf("MUITO") !== -1) return "Muito bom";
  if (text.indexOf("BOM") !== -1) return "Bom";
  if (text.indexOf("REGULAR") !== -1) return "Regular";
  return String(value || "").trim();
}

function calculateOpinionScore_(result) {
  const ratingFields = [
    "generalImpression",
    "apartmentLevel",
    "foodBreakfast",
    "foodPoolBar",
    "foodDinner",
    "serviceBreakfast",
    "servicePoolBar",
    "serviceDinner",
    "roomCleaning",
    "roomComfort",
    "roomEquipment",
    "frontDesk",
    "generalService",
    "externalArea",
    "pool"
  ];
  const scores = ratingFields
    .map((field) => ratingToScore_(result[field]))
    .filter((score) => score !== null);
  if (!scores.length) return 0;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function ratingToScore_(rating) {
  const text = normalizeText_(rating);
  if (!text) return null;
  if (text === "EXCELENTE" || text === "OTIMO") return 100;
  if (text === "MUITO BOM") return 85;
  if (text === "BOM") return 70;
  if (text === "REGULAR") return 40;
  return null;
}

function buildOpinionRow_(file, processedAt, hotel, extracted, status) {
  const values = {
    "ID Arquivo": file.getId(),
    "Data Processamento": processedAt,
    "Hotel": hotel,
    "Nome Arquivo": file.getName(),
    "Link Foto": file.getUrl(),
    "Nome Hospede": extracted.guestName || "",
    "Apartamento": extracted.apartment || "",
    "Impressao Geral": extracted.generalImpression || "",
    "Nivel Apartamentos": extracted.apartmentLevel || "",
    "Alimentos Cafe da Manha": extracted.foodBreakfast || "",
    "Alimentos Bar da Piscina": extracted.foodPoolBar || "",
    "Alimentos Jantar": extracted.foodDinner || "",
    "Atendimento Cafe da Manha": extracted.serviceBreakfast || "",
    "Atendimento Bar da Piscina": extracted.servicePoolBar || "",
    "Atendimento Jantar": extracted.serviceDinner || "",
    "Apartamento Limpeza Diaria": extracted.roomCleaning || "",
    "Apartamento Conforto Geral": extracted.roomComfort || "",
    "Apartamento Equipamentos": extracted.roomEquipment || "",
    "Servicos Recepcao": extracted.frontDesk || "",
    "Servicos Atendimento": extracted.generalService || "",
    "Servicos Area Externa": extracted.externalArea || "",
    "Servicos Piscina": extracted.pool || "",
    "Obs Alimentos": extracted.foodNotes || "",
    "Obs Atendimento": extracted.serviceNotes || "",
    "Obs Apartamento": extracted.roomNotes || "",
    "Destaques": extracted.highlights || "",
    "Problemas Identificados": extracted.issues || "",
    "Nota Calculada %": extracted.score || "",
    "Confianca %": extracted.confidence || 0,
    "Status": status,
    "Responsavel Revisao": "",
    "Observacao Revisao": extracted.reviewReason || "",
    "Data Revisao": ""
  };

  return OPINARIOS_HEADERS.map((header) => values[header]);
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function ensureHeader_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function ensureConfig_(sheet) {
  sheet.getRange(1, 1, 1, 3).setValues([["Chave", "Valor", "Descricao"]]);
  const values = sheet.getDataRange().getValues();
  const existing = new Set(values.slice(1).map((row) => String(row[0] || "").trim()));
  OPINARIOS_CONFIG_DEFAULTS.forEach((row) => {
    if (!existing.has(row[0])) sheet.appendRow(row);
  });
}

function ensureHotels_(sheet) {
  sheet.getRange(1, 1, 1, 4).setValues([["Hotel", "Status", "Ordem TV", "Observacao"]]);
  const values = sheet.getDataRange().getValues();
  const existing = new Set(values.slice(1).map((row) => normalizeText_(row[0])));
  OPINARIOS_HOTELS.forEach((row) => {
    if (!existing.has(normalizeText_(row[0]))) sheet.appendRow(row);
  });
}

function formatSheet_(sheet, columns) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columns)
    .setBackground("#2C3E50")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  sheet.autoResizeColumns(1, columns);
}

function readConfig_(sheet) {
  const values = sheet.getDataRange().getValues();
  const config = {};
  values.slice(1).forEach((row) => {
    const key = String(row[0] || "").trim();
    if (key) config[key] = row[1];
  });
  return config;
}

function getExistingOpinionIds_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Set();
  return new Set(
    sheet.getRange(2, 1, lastRow - 1, 1)
      .getValues()
      .map((row) => String(row[0] || "").trim())
      .filter(Boolean)
  );
}

function listImageFilesRecursive_(folder) {
  const files = [];
  const folderFiles = folder.getFiles();
  while (folderFiles.hasNext()) {
    const file = folderFiles.next();
    const mime = String(file.getMimeType() || "");
    if (mime.indexOf("image/") === 0) files.push(file);
  }

  const folders = folder.getFolders();
  while (folders.hasNext()) {
    files.push(...listImageFilesRecursive_(folders.next()));
  }

  return files;
}

function inferHotelFromFile_(file, rootFolderId) {
  const parents = file.getParents();
  if (!parents.hasNext()) return "Nao identificado";

  const parent = parents.next();
  if (parent.getId() === rootFolderId) {
    return inferHotelFromText_(file.getName());
  }

  return inferHotelFromText_(parent.getName());
}

function inferHotelFromText_(value) {
  const text = normalizeText_(value);
  if (text.indexOf("CABRALIA") !== -1) return "SUEDS CABRALIA";
  if (text.indexOf("SEGUNDO") !== -1 || text.indexOf("SOL") !== -1) return "SUEDS SEGUNDO SOL";
  if (text.indexOf("PLAZA") !== -1) return "SUEDS PLAZA";
  if (text.indexOf("PREMIUM") !== -1) return "SUEDS PREMIUM";
  if (text.indexOf("TRANCOSO") !== -1) return "SUEDS TRANCOSO";
  if (text.indexOf("ARRAIAL") !== -1 || text.indexOf("CASAS") !== -1) return "CASAS SUEDS ARRAIAL";
  return "Nao identificado";
}

function moveProcessedFileIfConfigured_(file, config) {
  const processedFolderId = String(config.OPINARIOS_PROCESSED_FOLDER_ID || "").trim();
  if (!processedFolderId) return;

  try {
    file.moveTo(DriveApp.getFolderById(processedFolderId));
  } catch (err) {
    // Mantem o arquivo na origem se a pasta de processados nao estiver acessivel.
  }
}

function normalizeText_(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
