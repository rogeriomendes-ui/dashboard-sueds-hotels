const CUTOVER = "2026-09";
const SELLERS_SHEET = "Lancamento_Vendas";
const CHANNELS_SHEET = "teste lancamento_vendas";
const HISTORICAL_CHANNELS_SHEET = "Historico_Canais_AA";

function key(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function month(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 7);
  if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 7);
  const text = String(value || "");
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}` : text.slice(0, 7);
}

function isSite(channel) {
  return /^(site|site sueds|be mobile|be mobille|booking engine|book engine)$/.test(key(channel));
}

function isRobot(channel, seller) {
  return key(channel) === "robo" || /^(robo|alice|alice \(robo\)|alice \(assistente virtual\))$/.test(key(seller));
}

function isKissylaSiteCredit(record) {
  return key(record.codigo || record.reservationCode) === "cr29070361669"
    && key(record.hotel) === "sueds plaza"
    && /^site estabelecimento\s*-\s*amanda sales melgaco$/.test(key(record.origin || record.origem).replace(/[_\\]+/g, " "));
}

function classifyDeskhotel(origin) {
  const normalized = key(origin).replace(/[_\\]+/g, " ");
  if (!normalized) throw new Error("Origem DeskHotel ausente: conferir a reserva antes de gravar.");
  const named = String(origin).match(/^(.+?)\s+-\s+(.+)$/);
  if (named) {
    const seller = named[2].trim();
    if (isRobot(seller, seller)) return { channel: "Robo", robot: true, sellerSale: false };
    const nonHuman = /^(loja online|site(?: do hotel)?|airbnb|booking(?:com|\.com)?|expedia|decolar|selecione|sem vendedor)$/;
    if (!nonHuman.test(key(seller)) && /^[\p{L}][\p{L}\s.'’-]+$/u.test(seller)) {
      return { channel: /^site/.test(normalized) ? "SITE" : "CENTRAL DE RESERVAS", robot: false, sellerSale: true, seller };
    }
  }
  if (/^depto reservas\s*-\s*loja online$/.test(normalized)) return { channel: "SITE", robot: false, sellerSale: false };
  if (normalized === "depto reservas") return { channel: "CENTRAL DE RESERVAS", robot: false, sellerSale: false };
  if (/^depto reservas(?:\s*-|$)/.test(normalized)) return { channel: "CENTRAL DE RESERVAS", robot: false, sellerSale: true };
  if (isRobot(origin, origin)) return { channel: "Robo", robot: true, sellerSale: false };
  if (/^(site do hotel(?: \(venda direta\))?|site estabelecimento(?:\s*-.*)?)$/.test(normalized)) return { channel: "SITE", robot: false, sellerSale: false };
  const channels = { airbnb: "Airbnb", booking: "Booking", bookingcom: "Booking", "booking.com": "Booking", decolar: "Decolar", expedia: "Expedia" };
  return { channel: channels[normalized] || String(origin).trim(), robot: false, sellerSale: false };
}

function destination(record) {
  if (month(record.dataVenda || record.dateKey || record.monthKey) < CUTOVER) return SELLERS_SHEET;
  if (isKissylaSiteCredit(record)) return SELLERS_SHEET;
  if (record.origin || record.origem) return classifyDeskhotel(record.origin || record.origem).sellerSale ? SELLERS_SHEET : CHANNELS_SHEET;
  if (key(record.source || record.fonte) === "omnibees") return CHANNELS_SHEET;
  if (key(record.source || record.fonte) === "juniper") return CHANNELS_SHEET;
  if (key(record.source || record.fonte) === "cvc") return CHANNELS_SHEET;
  const channel = record.canal || record.channel;
  if (isSite(channel) || isRobot(channel, record.vendedor || record.seller)) return CHANNELS_SHEET;
  if (/^(airbnb|booking(?:\.com)?|decolar|expedia)$/.test(key(channel))) return CHANNELS_SHEET;
  if (key(record.source || record.fonte) === "deskhotel" && !/^central de reservas$/.test(key(channel))) return CHANNELS_SHEET;
  return SELLERS_SHEET;
}

function normalizeDeskhotel(record) {
  const classification = classifyDeskhotel(record.origin || record.origem);
  const result = { ...record, canal: classification.channel, fonte: "DESKHOTEL" };
  const observedSeller = classification.seller || (classification.sellerSale
    ? String(record.origin || record.origem).replace(/^depto[_\\\s]+reservas\s*-?\s*/i, "").trim() : "");
  result.vendedor = classification.robot ? "Alice (Robo)" : isKissylaSiteCredit(record) || key(observedSeller) === "amanda sales melgaco"
    ? "Amanda Melgaco" : observedSeller;
  if (key(record.origin || record.origem).replace(/[_\\]+/g, " ") === "depto reservas - loja online") result.hotel = "SUEDS EXPERIENCIAS";
  if (/^sued.?s experiencias/.test(key(result.hotel))) result.hotel = "SUEDS EXPERIENCIAS";
  if (/^bloquead[ao]$/.test(key(record.status))) result.status = "Pendente";
  if (classification.robot) result.formaPagamento = "Cartao credito";
  result.targetSheet = destination(result);
  return result;
}

function assertSalesWrite(record, targetSheet, existingChannels = []) {
  if (record.status !== undefined) assertStatusValue(record.status, targetSheet);
  const saleMonth = month(record.dataVenda || record.dateKey || record.monthKey);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(saleMonth)) throw new Error("Data Venda ausente ou invalida; gravacao bloqueada.");
  if (saleMonth < CUTOVER) return;
  const identity = r => `${key(r.codigo || r.reservationCode)}|${key(r.hotel)}`;
  const existing = existingChannels.find(r => identity(r) === identity(record));
  const authorizedMigration = record.operation === 'seller-migration' && record.authorization === 'named-human-seller-2026-09-17'
    && existing && existing.rowNumber === record.sourceRowNumber && key(existing.fonte) === 'deskhotel'
    && (key(existing.canal) === key(record.origin)
      || (record.originChangeEvidence && record.previousChannel === existing.canal && record.previousSeller === existing.vendedor))
    && classifyDeskhotel(record.origin).sellerSale
    && ['codigo','hotel','dataVenda','status','formaPagamento'].every(f => String(existing[f] ?? '') === String(record[f] ?? ''));
  if (record.operation === 'seller-migration' && !authorizedMigration) throw new Error('Migracao sem origem, identidade e autorizacao verificadas.');
  if (targetSheet === SELLERS_SHEET && existing && destination(existing) === CHANNELS_SHEET && !authorizedMigration) {
    throw new Error("Reserva externa ja cadastrada em teste lancamento_vendas; nao reinserir na aba dos vendedores.");
  }
  if (key(record.source || record.fonte) === "deskhotel") {
    const expected = normalizeDeskhotel(record); // Requires observed origin, never guesses.
    if (key(record.canal || record.channel) !== key(expected.canal) || key(record.vendedor || record.seller) !== key(expected.vendedor) || key(record.hotel) !== key(expected.hotel)) {
      throw new Error("Hotel/canal/vendedor divergem da origem DeskHotel; gravacao bloqueada.");
    }
  }
  if (key(record.source || record.fonte) === "juniper") {
    if (targetSheet !== CHANNELS_SHEET) throw new Error("Venda Juniper deve entrar em teste lancamento_vendas.");
    if (key(record.canal || record.channel) !== key("Azul Viagens")) throw new Error("Canal Juniper invalido.");
    if (key(record.vendedor || record.seller)) throw new Error("Venda Juniper nao deve receber vendedor.");
    if (record.status !== "Confirmada") throw new Error("Somente linhas Juniper OK podem ser importadas como Confirmada.");
    if (!/^JUNIPER-/i.test(String(record.codigo || record.reservationCode || ""))) throw new Error("Codigo Juniper deve preservar o namespace JUNIPER-.");
  }
  if (key(record.source || record.fonte) === "cvc") {
    if (targetSheet !== CHANNELS_SHEET || key(record.canal || record.channel) !== 'cvc' || key(record.vendedor || record.seller)) throw new Error('CVC deve entrar em canais, sem vendedor.');
    if (!['Confirmada', 'Cancelada'].includes(record.status)) throw new Error('Status CVC invalido.');
  }
  if (destination(record) !== targetSheet) throw new Error("Aba de destino incorreta para a origem da venda.");
  const seller = key(record.vendedor || record.seller);
  if (targetSheet === SELLERS_SHEET && (!seller || seller === "selecione" || isRobot(record.canal || record.channel, seller))) {
    throw new Error("Venda sem vendedor humano identificado nao pode entrar em Lancamento_Vendas.");
  }
  if (isRobot(record.canal || record.channel, seller) && key(record.formaPagamento) !== "cartao credito") {
    throw new Error("Venda Robo deve usar Cartao credito.");
  }
}

// Historical channel extracts are kept isolated from the operational tabs.
// They are immutable evidence rows, not candidates for the current-routing rules.
function assertHistoricalChannelWrite(record) {
  if (record.targetSheet !== HISTORICAL_CHANNELS_SHEET) throw new Error("Aba historica invalida.");
  const saleMonth = month(record.dataVenda || record.dateKey || record.monthKey);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(saleMonth)) throw new Error("Data Venda historica ausente ou invalida.");
  const referenceYear = String(record.anoReferencia || "").trim();
  if (!/^\d{4}$/.test(referenceYear) || saleMonth.slice(0, 4) !== referenceYear) {
    throw new Error("Ano de referencia historico diverge da Data Venda.");
  }
  const source = key(record.source || record.fonte);
  if (!["omnibees", "juniper", "cvc"].includes(source)) throw new Error("Fonte historica nao autorizada.");
  if (key(record.vendedor || record.seller)) throw new Error("Historico de canais nao deve receber vendedor.");
  if (source === "omnibees" && !["Confirmada", "Cancelada", "Alterada"].includes(record.status)) throw new Error("Status Omnibees historico invalido.");
  if (source === "juniper") {
    if (record.status !== "Confirmada" || key(record.canal || record.channel) !== key("Azul Viagens") || !/^JUNIPER-/i.test(String(record.codigo || record.reservationCode || ""))) {
      throw new Error("Registro Juniper historico invalido.");
    }
  }
  if (source === "cvc" && (key(record.canal || record.channel) !== "cvc" || !["Confirmada", "Cancelada"].includes(record.status))) {
    throw new Error("Registro CVC historico invalido.");
  }
}

function assertStatusValue(status, targetSheet) {
  if (!String(status || '').trim()) throw new Error('Status ausente; gravacao bloqueada.');
  if (targetSheet === SELLERS_SHEET && !['Confirmada', 'Pendente', 'Cancelada'].includes(status)) {
    throw new Error('Status nao permitido em Lancamento_Vendas: ' + status + '. Nunca mapeie Alterada automaticamente.');
  }
}

// Updates preserve the existing row; insertion routing must not move historical cells.
function assertStatusUpdate(record, existingSellers, existingChannels) {
  assertStatusValue(record.status, record.targetSheet);
  if (![SELLERS_SHEET, CHANNELS_SHEET].includes(record.targetSheet)) throw new Error('Aba de status invalida.');
  if (!Number.isInteger(record.rowNumber) || record.rowNumber < 2) throw new Error('Linha de status invalida.');
  const rows = record.targetSheet === SELLERS_SHEET ? existingSellers : existingChannels;
  const matches = rows.filter(r => r.rowNumber === record.rowNumber);
  if (matches.length !== 1) throw new Error('Linha atual de status ausente ou ambigua.');
  const current = matches[0];
  for (const field of ['codigo', 'hotel', 'dataVenda', 'canal', 'vendedor', 'fonte', 'formaPagamento']) {
    if (String(record[field] || '') !== String(current[field] || '')) throw new Error('Atualizacao de status diverge do registro atual: ' + field);
  }
  if (record.previousStatus !== current.status) throw new Error('Status anterior diverge da leitura atual.');
  if (!record.evidence) throw new Error('Evidencia da alteracao de status obrigatoria.');
  if (record.sourceSystem === 'OMNIBEES' && record.targetSheet === SELLERS_SHEET) throw new Error('Rotina Omnibees nao pode atualizar R em Lancamento_Vendas.');
}

// The workbook location changes; the accounting category does not.
function dashboardSources(sellerRows, channelRows) {
  const modern = r => r.monthKey >= CUTOVER;
  const strategic = r => isSite(r.rawChannel || r.channel) || isRobot(r.rawChannel || r.channel, r.seller);
  const external = r => destination(r) === CHANNELS_SHEET && !strategic(r);
  const identity = r => r.reservationCode ? `${key(r.reservationCode)}|${key(r.hotel)}` : null;
  const migrated = channelRows.filter(r => modern(r) && strategic(r));
  // A stale importer can reinsert the same external reservation with blank
  // channel/source. The classified row in the channels sheet is authoritative.
  const migratedKeys = new Set(channelRows.filter(r => modern(r) && destination(r) === CHANNELS_SHEET).map(identity).filter(Boolean));
  // A reservation may legitimately exist in both tabs when Omnibees carries
  // the channel copy and DeskHotel identifies the human seller. In that case
  // the seller row is authoritative for the ranking. Only suppress a stale
  // seller-tab duplicate when it has no identified seller of its own.
  const records = sellerRows.filter(r => !(modern(r) && (
    external(r) || ((!r.seller || strategic(r)) && migratedKeys.has(identity(r)))
  ))).concat(migrated);
  const channelKeys = new Set(channelRows.map(identity).filter(Boolean));
  const otherChannelRecords = channelRows.filter(r => !(modern(r) && isRobot(r.rawChannel || r.channel, r.seller)))
    .concat(sellerRows.filter(r => modern(r) && external(r) && !channelKeys.has(identity(r))));
  return { records, otherChannelRecords };
}

module.exports = { CUTOVER, SELLERS_SHEET, CHANNELS_SHEET, HISTORICAL_CHANNELS_SHEET, key, month, isSite, isRobot, classifyDeskhotel, normalizeDeskhotel, assertSalesWrite, assertHistoricalChannelWrite, assertStatusValue, assertStatusUpdate, destination, dashboardSources };
