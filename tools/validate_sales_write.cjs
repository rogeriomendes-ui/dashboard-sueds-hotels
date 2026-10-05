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
  const manualCells = new Map();
  const insertRows = new Map();
  const deleteRows = new Set();
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
    if (record.operation === 'delete-duplicate-channel') {
      if (record.targetSheet !== routing.SELLERS_SHEET || !Number.isInteger(record.rowNumber) || record.rowNumber < 2) throw new Error('Linha de exclusao invalida.');
      const current = input.existingSellers.find(r => r.rowNumber === record.rowNumber);
      if (!current || ['codigo','hotel','dataVenda','canal','vendedor','fonte','formaPagamento','status'].some(f => String(current[f] ?? '') !== String(record[f] ?? ''))) throw new Error('Exclusao diverge da leitura atual.');
      if (!/^([0-2]\d|3[01])\/(0[1-6])\/2026$/.test(String(record.dataVenda)) || !routing.isSite(record.canal) || !/^(be mobile|be mobille|booking engine|book engine)$/.test(routing.key(record.canal)) || routing.key(record.vendedor)) throw new Error('Exclusao fora do escopo autorizado.');
      if (!input.existingChannels.some(r => routing.key(r.codigo) === routing.key(record.codigo) && routing.key(r.hotel) === routing.key(record.hotel))) throw new Error('Reserva sem copia na aba de canais.');
      if (deleteRows.has(record.rowNumber)) throw new Error('Linha de exclusao repetida.');
      deleteRows.add(record.rowNumber);
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
    if (record.operation === 'mirror-field-update') {
      if (record.targetSheet !== routing.SELLERS_SHEET || ![13, 19].includes(record.columnIndex) || !Number.isInteger(record.rowNumber) || record.rowNumber < 2 || !record.evidence) throw new Error('Edicao manual invalida.');
      const current = input.existingSellers.find(r => r.rowNumber === record.rowNumber);
      if (!current || ['codigo','hotel','dataVenda','canal','vendedor','fonte','formaPagamento','status'].some(f => String(current[f] ?? '') !== String(record[f] ?? ''))) throw new Error('Edicao manual diverge da linha atual.');
      const field = record.columnIndex === 13 ? 'recebido' : 'observacoes';
      if (JSON.stringify(current[field] ?? null) !== JSON.stringify(record.previousValue ?? null)) throw new Error('Valor anterior da edicao manual diverge.');
      const cell = routing.SELLERS_SHEET + '!' + (record.columnIndex === 13 ? 'N' : 'T') + record.rowNumber;
      if (manualCells.has(cell) || (record.newValue !== null && (typeof record.newValue !== 'object' || 'formulaValue' in record.newValue))) throw new Error('Valor manual invalido ou repetido.');
      manualCells.set(cell, record.newValue);
      continue;
    }
    if (record.operation === 'mirror-insert') {
      if (record.targetSheet !== routing.SELLERS_SHEET || !Number.isInteger(record.rowNumber) || record.rowNumber < 2 || !Array.isArray(record.cellValues) || record.cellValues.length !== 25 || !record.evidence) throw new Error('Inclusao espelhada invalida.');
      if (input.existingSellers.some(r => r.rowNumber === record.rowNumber && r.codigo)) throw new Error('Linha de inclusao ja ocupada.');
      if (input.existingSellers.concat(input.existingChannels).some(r => routing.key(r.codigo) === routing.key(record.codigo) && routing.key(r.hotel) === routing.key(record.hotel))) throw new Error('Reserva ja existe em uma das abas.');
      routing.assertSalesWrite(record, record.targetSheet, input.existingChannels);
      const cell = routing.SELLERS_SHEET + '!A' + record.rowNumber;
      if (insertRows.has(cell)) throw new Error('Inclusao repetida.');
      insertRows.set(cell, record.cellValues);
      continue;
    }
    const key = routing.key(record.codigo)+'|'+routing.key(record.hotel);
    if (keys.has(key)) throw new Error('Reserva duplicada no lote: '+record.codigo);
    keys.add(key);
    routing.assertSalesWrite(record,record.targetSheet,input.existingChannels);
  }
  if (statusCells.size && !Array.isArray(input.requests)) throw new Error('Inclua os requests reais de status para conferir a cobertura do plano.');
  if ((manualCells.size || insertRows.size) && !Array.isArray(input.requests)) throw new Error('Inclua os requests reais das edicoes e inclusoes.');
  const covered = new Set();
  const coveredManual = new Set();
  const coveredInserts = new Set();
  const coveredDeletes = new Set();
  for (const request of input.requests || []) {
    if (request.deleteDimension) {
      const r = request.deleteDimension.range;
      if (r?.sheetId !== 1945937754 || r.dimension !== 'ROWS' || !Number.isInteger(r.startIndex) || !Number.isInteger(r.endIndex) || r.startIndex < 1 || r.endIndex <= r.startIndex) throw new Error('Request de exclusao invalido.');
      for (let row = r.startIndex + 1; row <= r.endIndex; row++) {
        if (!deleteRows.has(row) || coveredDeletes.has(row)) throw new Error('Request de exclusao nao validado ou repetido: ' + row);
        coveredDeletes.add(row);
      }
      continue;
    }
    const update = request.updateCells;
    if (!update) throw new Error('Use requests updateCells explicitos no plano auditado.');
    const r = update.range;
    const sheet = {1945937754:routing.SELLERS_SHEET,711290481:routing.CHANNELS_SHEET}[r?.sheetId];
    if (!sheet || update.fields !== 'userEnteredValue' || r.endRowIndex - r.startRowIndex !== update.rows?.length) throw new Error('Request fora dos limites ou campos validados.');
    if (sheet === routing.SELLERS_SHEET && r.startColumnIndex === 0 && r.endColumnIndex === 25 && update.rows.length === 1) {
      const cell = sheet + '!A' + (r.startRowIndex + 1);
      const expected = insertRows.get(cell);
      const actual = update.rows[0]?.values?.map(v => v?.userEnteredValue ?? null);
      if (!expected || JSON.stringify(expected) !== JSON.stringify(actual) || coveredInserts.has(cell)) throw new Error('Request de inclusao nao validado: ' + cell);
      coveredInserts.add(cell);
      continue;
    }
    if (![13,17,19].includes(r.startColumnIndex) || r.endColumnIndex !== r.startColumnIndex + 1) throw new Error('Request deve alterar somente N, R ou T, com limites exatos.');
    update.rows.forEach((row, index) => {
      const letter = {13:'N',17:'R',19:'T'}[r.startColumnIndex];
      const cell = sheet + '!' + letter + (r.startRowIndex + index + 1);
      if (r.startColumnIndex === 17) {
        if (row.values?.length !== 1 || !statusCells.has(cell) || statusCells.get(cell) !== row.values[0]?.userEnteredValue?.stringValue || covered.has(cell)) throw new Error('Request de status nao validado ou repetido: ' + cell);
        covered.add(cell);
      } else {
        if (row.values?.length !== 1 || !manualCells.has(cell) || JSON.stringify(manualCells.get(cell) ?? null) !== JSON.stringify(row.values[0]?.userEnteredValue ?? null) || coveredManual.has(cell)) throw new Error('Request manual nao validado ou repetido: ' + cell);
        coveredManual.add(cell);
      }
    });
  }
  if (covered.size !== statusCells.size) throw new Error('Plano e requests de status incompletos.');
  if (coveredManual.size !== manualCells.size) throw new Error('Plano e requests de edicao manual incompletos.');
  if (coveredInserts.size !== insertRows.size) throw new Error('Plano e requests de inclusao incompletos.');
  if (coveredDeletes.size !== deleteRows.size) throw new Error('Plano e requests de exclusao incompletos.');
  console.log(JSON.stringify({validated:true,records:input.records.length,statusCells:covered.size,manualCells:coveredManual.size,insertRows:coveredInserts.size,deleteRows:coveredDeletes.size}));
} catch (error) { console.error(error.message); process.exitCode=1; }
