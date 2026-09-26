// Include every write, including status-only updates, and current rows of BOTH tabs.
// Pure validation: never writes to Google Sheets. A nonzero exit blocks writing.
const fs = require('node:fs');
const routing = require('../lib/sales-routing');
try {
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (!Array.isArray(input.records) || !Array.isArray(input.existingChannels) || !Array.isArray(input.existingSellers)) throw new Error('Forneca records, existingSellers e existingChannels lidos das duas abas atuais.');
  const hasHistoricalRecords = input.records.some((record) => record.targetSheet === routing.HISTORICAL_CHANNELS_SHEET);
  if (hasHistoricalRecords && !Array.isArray(input.existingHistorical)) throw new Error('Inclua existingHistorical lido da aba Historico_Canais_AA.');
  const keys = new Set();
  const statusCells = new Map();
  for (const record of input.records) {
    if (!record.codigo || !record.hotel || !record.targetSheet) throw new Error('Codigo, hotel e targetSheet obrigatorios.');
    if (record.targetSheet === routing.HISTORICAL_CHANNELS_SHEET) {
      if (record.operation) throw new Error('Historico aceita somente inclusoes imutaveis; nao atualize status.');
      routing.assertHistoricalChannelWrite(record);
      const historicalKey = [record.anoReferencia, routing.key(record.fonte || record.source), routing.key(record.codigo), routing.key(record.hotel)].join('|');
      if (keys.has(historicalKey)) throw new Error('Reserva duplicada no lote historico: ' + record.codigo);
      keys.add(historicalKey);
      const alreadyExists = input.existingHistorical.some((existing) => (
        [existing.anoReferencia, routing.key(existing.fonte || existing.source), routing.key(existing.codigo), routing.key(existing.hotel)].join('|') === historicalKey
      ));
      if (alreadyExists) throw new Error('Reserva historica ja existente: ' + record.codigo);
      continue;
    }
    routing.assertStatusValue(record.status, record.targetSheet);
    if (record.operation === 'status-update') {
      routing.assertStatusUpdate(record, input.existingSellers, input.existingChannels);
      const cell = record.targetSheet + '!R' + record.rowNumber;
      if (statusCells.has(cell)) throw new Error('Celula repetida no plano: ' + cell);
      statusCells.set(cell, record.status);
      continue;
    }
    const key = routing.key(record.codigo)+'|'+routing.key(record.hotel);
    if (keys.has(key)) throw new Error('Reserva duplicada no lote: '+record.codigo);
    keys.add(key);
    routing.assertSalesWrite(record,record.targetSheet,input.existingChannels);
  }
  if (statusCells.size && !Array.isArray(input.requests)) throw new Error('Inclua os requests reais de status para conferir a cobertura do plano.');
  const covered = new Set();
  for (const request of input.requests || []) {
    const update = request.updateCells;
    if (!update) throw new Error('Use requests updateCells explicitos no plano auditado.');
    const r = update.range;
    const sheet = {1945937754:routing.SELLERS_SHEET,711290481:routing.CHANNELS_SHEET}[r?.sheetId];
    if (!sheet || update.fields !== 'userEnteredValue' || r.startColumnIndex !== 17 || r.endColumnIndex !== 18 || r.endRowIndex - r.startRowIndex !== update.rows?.length) throw new Error('Request de status deve alterar somente valores de R, com limites exatos.');
    update.rows.forEach((row, index) => {
      const cell = sheet + '!R' + (r.startRowIndex + index + 1);
      if (row.values?.length !== 1 || !statusCells.has(cell) || statusCells.get(cell) !== row.values[0]?.userEnteredValue?.stringValue || covered.has(cell)) throw new Error('Request de status nao validado ou repetido: ' + cell);
      covered.add(cell);
    });
  }
  if (covered.size !== statusCells.size) throw new Error('Plano e requests de status incompletos.');
  console.log(JSON.stringify({validated:true,records:input.records.length,statusCells:covered.size}));
} catch (error) { console.error(error.message); process.exitCode=1; }
