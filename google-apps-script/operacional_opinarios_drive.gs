const OPINARIOS_SHEET = "Opinarios";
const OPINARIOS_REVIEW_SHEET = "Revisao_Opinarios";
const OPINARIOS_CONFIG_SHEET = "Config_Operacional";
const OPINARIOS_HOTELS_SHEET = "Hoteis_Operacional";
const OPINARIOS_ROOT_FOLDER_ID = "1JqdCOSc8tdwJKao90qBIPP1ryk-aXnp8";
const OPINARIOS_PLAZA_FOLDER_ID = "16eaSsuRagT5ZYYVz34t5-Bzkvxf0UQZG";
const OPINARIOS_OFFICIAL_FORM_VERSION = "20260719";
const OPINARIOS_ACTIVE_HOTEL = "SUEDS PLAZA";

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
  "Origem",
  "Hotel Slug",
  "Form Version",
  "Idioma",
  "Nome Hospede",
  "Apartamento",
  "Data Entrada",
  "Data Saida",
  "Impressao Geral",
  "Reserva",
  "Recepcao / Check-in / Check-out",
  "Atendimento da equipe",
  "Conforto do quarto",
  "Limpeza do quarto",
  "Qualidade do Wi-fi",
  "Area de lazer / piscina",
  "Atendimento da equipe do Beach Club",
  "Alimentos Cafe da Manha",
  "Alimentos Almoco",
  "Alimentos Jantar",
  "Comentarios",
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
  ["OPINARIOS_ROOT_FOLDER_ID", OPINARIOS_ROOT_FOLDER_ID, "Pasta raiz OPINARIOS no Drive."],
  ["OPINARIOS_SOURCE_FOLDER_ID", OPINARIOS_PLAZA_FOLDER_ID, "Pasta do Drive onde o SUEDS Plaza coloca as fotos novas."],
  ["OPINARIOS_PROCESSED_FOLDER_ID", "", "Opcional. Pasta para mover fotos processadas."],
  ["OPINARIOS_ERROR_FOLDER_ID", "", "Opcional. Pasta para mover fotos com erro."],
  ["OPINARIOS_MIN_CONFIDENCE", "80", "Confianca minima para aprovar automaticamente."],
  ["OPINARIOS_MIN_FILLED_RATINGS", "1", "Minimo de itens avaliados para aprovar automaticamente."],
  ["OPINARIOS_AI_PROVIDER", "OpenAI", "Provedor de IA de visao. Primeira versao usando OpenAI Vision."],
  ["OPENAI_MODEL", "gpt-4o-mini", "Modelo OpenAI usado para ler os opiniarios."],
  ["OPINARIOS_MAX_IMAGE_MB", "10", "Tamanho maximo da imagem para envio automatico a IA."],
  ["OPINARIOS_ACTIVE_HOTEL", OPINARIOS_ACTIVE_HOTEL, "Piloto oficial atual. Demais hoteis serao configurados depois."],
  ["OPINARIOS_FORM_VERSION", OPINARIOS_OFFICIAL_FORM_VERSION, "Versao oficial do formulario impresso Plaza."]
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
    "Piloto SUEDS Plaza configurado.\n\n" +
    `OPINARIOS_SOURCE_FOLDER_ID: ${OPINARIOS_PLAZA_FOLDER_ID}\n` +
    "Agora configure a OPENAI_API_KEY no menu SUEDS Operacional."
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

    const hotel = inferHotelFromFile_(file, sourceFolderId, config);
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
  const headerIndexes = getHeaderIndexes_(opinionsSheet);

  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const row = opinionsSheet.getRange(rowNumber, 1, 1, OPINARIOS_HEADERS.length).getValues()[0];
    const fileId = String(row[headerIndexes["ID Arquivo"]] || "").trim();
    const hotel = String(row[headerIndexes.Hotel] || "").trim() || "Nao identificado";
    const status = String(row[headerIndexes.Status] || "").trim();

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
    const completeness = validateOpinionCompleteness_(extracted, config);
    const expectedVersion = String(config.OPINARIOS_FORM_VERSION || OPINARIOS_OFFICIAL_FORM_VERSION).trim();
    const versionOk = String(extracted.formVersion || "").replace(/\D/g, "") === expectedVersion;
    extracted.status = confidence >= minConfidence && completeness.ok && versionOk ? "Aprovado" : "Revisao";
    extracted.reviewReason = extracted.status === "Aprovado"
      ? ""
      : [
          extracted.reviewReason,
          confidence < minConfidence ? `Confianca ${confidence}% abaixo do minimo ${minConfidence}%.` : "",
          completeness.reason,
          versionOk ? "" : `Versao do formulario nao confirmada como ${expectedVersion}.`
        ]
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

function validateOpinionCompleteness_(extracted, config) {
  const ratingFields = [
    ["generalImpression", "Impressao Geral"],
    ["reservation", "Reserva"],
    ["frontDesk", "Recepcao / Check-in / Check-out"],
    ["teamService", "Atendimento da equipe"],
    ["roomComfort", "Conforto do quarto"],
    ["roomCleaning", "Limpeza do quarto"],
    ["wifi", "Qualidade do Wi-fi"],
    ["pool", "Area de lazer / piscina"],
    ["beachClub", "Atendimento da equipe do Beach Club"],
    ["foodBreakfast", "Alimentos Cafe da Manha"],
    ["foodLunch", "Alimentos Almoco"],
    ["foodDinner", "Alimentos Jantar"]
  ];

  const filled = ratingFields.filter(([field]) => String(extracted[field] || "").trim()).length;
  const missing = ratingFields
    .filter(([field]) => !String(extracted[field] || "").trim())
    .map(([, label]) => label);

  const minFilled = Number(config.OPINARIOS_MIN_FILLED_RATINGS || 1);
  if (filled < minFilled) {
    return {
      ok: false,
      reason: `Poucos campos de nota preenchidos (${filled}/${ratingFields.length}). Conferir marcacoes.`,
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
    "Voce esta lendo uma foto de um opiniario impresso da SUEDS Plaza.",
    "Extraia apenas o que estiver visivel. Se um campo nao estiver legivel, use string vazia e inclua o campo em uncertainFields.",
    "Formulario oficial esperado: HOTEL=SUEDS_PLAZA, FORM_VERSION=20260719, LANG=PT-BR.",
    "No rodape pode aparecer texto semelhante a SUED'S PLAZA Versao190726 ou FORM_VERSION=20260719. Extraia formVersion como 20260719 quando a versao for esta.",
    "As opcoes possiveis de avaliacao sao exatamente: Excelente, Muito bom, Bom, Regular.",
    "Quando houver marcacao com X, risco, circulo, rabisco claro ou preenchimento dentro do quadrado, considere aquela opcao selecionada.",
    "Se nao houver nenhuma marcacao visivel em uma linha, deixe o campo vazio. Nao chute uma nota apenas por proximidade visual.",
    "Trate cada linha como independente. Nunca copie a resposta de uma linha para a proxima apenas porque estao no mesmo bloco.",
    "Nao preencha uma avaliacao por simetria, padrao ou suposicao. Preencha somente quando houver marca visivel naquela linha.",
    "Antes de responder, faca uma segunda varredura visual somente nos quadrados, linha por linha.",
    "Itens oficiais do formulario SUEDS Plaza 20260719:",
    "1. Impressao geral: Como voce avalia sua hospedagem?",
    "2. Reserva: Como foi sua experiencia para reservar?",
    "3. Recepcao / Check-in / Check-out",
    "4. Atendimento da equipe",
    "5. Conforto do quarto",
    "6. Limpeza do quarto",
    "7. Qualidade do Wi-fi",
    "8. Area de lazer / piscina",
    "9. Atendimento da equipe do Beach Club",
    "10. Cafe da manha",
    "11. Almoco",
    "12. Jantar",
    "Leia tambem nome, numero do quarto, data de entrada, data de saida e comentarios/elogios/sugestoes quando estiverem preenchidos.",
    "Padronize acentos e caixa baixa/alta naturalmente em portugues.",
    `Hotel esperado pela pasta: ${hotel}.`,
    "Responda somente JSON valido, sem markdown, neste formato:",
    "{",
    '  "hotel": "SUEDS PLAZA",',
    '  "hotelSlug": "sueds-plaza",',
    '  "formVersion": "20260719",',
    '  "lang": "pt-BR",',
    '  "guestName": "",',
    '  "apartment": "",',
    '  "entryDate": "",',
    '  "exitDate": "",',
    '  "generalImpression": "",',
    '  "reservation": "",',
    '  "frontDesk": "",',
    '  "teamService": "",',
    '  "roomComfort": "",',
    '  "roomCleaning": "",',
    '  "wifi": "",',
    '  "pool": "",',
    '  "beachClub": "",',
    '  "foodBreakfast": "",',
    '  "foodLunch": "",',
    '  "foodDinner": "",',
    '  "comments": "",',
    '  "highlights": "",',
    '  "issues": "",',
    '  "score": 0,',
    '  "confidence": 0,',
    '  "uncertainFields": "",',
    '  "reviewReason": ""',
    "}",
    "Calcule score como media percentual dos campos de nota lidos: Excelente=100, Muito bom=85, Bom=70, Regular=40.",
    "Se o comentario tiver elogio, coloque resumo em highlights. Se tiver reclamacao/problema, coloque resumo em issues. O comentario completo deve ir em comments.",
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
    hotelSlug: data.hotelSlug || "sueds-plaza",
    formVersion: String(data.formVersion || "").replace(/\D/g, ""),
    lang: data.lang || "pt-BR",
    guestName: data.guestName || "",
    apartment: data.apartment || "",
    entryDate: data.entryDate || "",
    exitDate: data.exitDate || "",
    generalImpression: normalizeRating_(data.generalImpression),
    reservation: normalizeRating_(data.reservation),
    frontDesk: normalizeRating_(data.frontDesk),
    teamService: normalizeRating_(data.teamService),
    roomComfort: normalizeRating_(data.roomComfort),
    roomCleaning: normalizeRating_(data.roomCleaning),
    wifi: normalizeRating_(data.wifi),
    pool: normalizeRating_(data.pool),
    beachClub: normalizeRating_(data.beachClub),
    foodBreakfast: normalizeRating_(data.foodBreakfast),
    foodLunch: normalizeRating_(data.foodLunch),
    foodDinner: normalizeRating_(data.foodDinner),
    comments: data.comments || "",
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
    "reservation",
    "frontDesk",
    "teamService",
    "roomComfort",
    "roomCleaning",
    "wifi",
    "pool",
    "beachClub",
    "foodBreakfast",
    "foodLunch",
    "foodDinner"
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
    "Origem": "Foto Drive",
    "Hotel Slug": extracted.hotelSlug || "sueds-plaza",
    "Form Version": extracted.formVersion || "",
    "Idioma": extracted.lang || "pt-BR",
    "Nome Hospede": extracted.guestName || "",
    "Apartamento": extracted.apartment || "",
    "Data Entrada": extracted.entryDate || "",
    "Data Saida": extracted.exitDate || "",
    "Impressao Geral": extracted.generalImpression || "",
    "Reserva": extracted.reservation || "",
    "Recepcao / Check-in / Check-out": extracted.frontDesk || "",
    "Atendimento da equipe": extracted.teamService || "",
    "Conforto do quarto": extracted.roomComfort || "",
    "Limpeza do quarto": extracted.roomCleaning || "",
    "Qualidade do Wi-fi": extracted.wifi || "",
    "Area de lazer / piscina": extracted.pool || "",
    "Atendimento da equipe do Beach Club": extracted.beachClub || "",
    "Alimentos Cafe da Manha": extracted.foodBreakfast || "",
    "Alimentos Almoco": extracted.foodLunch || "",
    "Alimentos Jantar": extracted.foodDinner || "",
    "Comentarios": extracted.comments || "",
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

function getHeaderIndexes_(sheet) {
  const headers = sheet.getRange(1, 1, 1, OPINARIOS_HEADERS.length).getValues()[0];
  const indexes = {};
  headers.forEach((header, index) => {
    if (header) indexes[String(header).trim()] = index;
  });
  return indexes;
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

function inferHotelFromFile_(file, rootFolderId, config) {
  const parents = file.getParents();
  if (!parents.hasNext()) return String(config.OPINARIOS_ACTIVE_HOTEL || OPINARIOS_ACTIVE_HOTEL);

  const parent = parents.next();
  if (parent.getId() === rootFolderId) {
    const parentHotel = inferHotelFromText_(parent.getName());
    if (parentHotel !== "Nao identificado") return parentHotel;
    const fileHotel = inferHotelFromText_(file.getName());
    return fileHotel !== "Nao identificado" ? fileHotel : String(config.OPINARIOS_ACTIVE_HOTEL || OPINARIOS_ACTIVE_HOTEL);
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
