const routing = require('./sales-routing');
const fields = [{name:'telefone', columnIndex:21, letter:'V'}, {name:'email', columnIndex:22, letter:'W'}];
function contactValue(value, field) {
  const text = String(value ?? '').trim();
  if (field === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : '';
  const digits = text.replace(/\D/g, '');
  return /^\+?[\d\s().-]+$/.test(text) && digits.length >= 8 && digits.length <= 15 && !/^0+$/.test(digits) ? text : '';
}
function buildContactPlan(captures, existingSellers, existingChannels) {
  const records = [], requests = [], pending = [], seen = new Set();
  for (const capture of captures) {
    const code = String(capture.codigo || '').trim();
    const identity = row => routing.key(row.codigo) === routing.key(code) && routing.key(row.hotel) === routing.key(capture.hotel);
    const matches = [
      ...existingSellers.filter(identity).map(row=>({...row,targetSheet:routing.SELLERS_SHEET})),
      ...existingChannels.filter(identity).map(row=>({...row,targetSheet:routing.CHANNELS_SHEET}))
    ];
    if (!code || !capture.hotel || !capture.origin || !capture.evidence) throw Error('Contato sem identidade, origem ou evidência.');
    routing.classifyDeskhotel(capture.origin);
    const key = `${routing.key(code)}|${routing.key(capture.hotel)}`;
    if (seen.has(key)) throw Error('Reserva repetida na captura de contatos.');
    seen.add(key);
    if (matches.length !== 1) {pending.push({codigo:code,reason:matches.length?'Chave duplicada nas bases':'Reserva ainda ausente da base'});continue;}
    const current = matches[0];
    if (routing.key(current.fonte) !== 'deskhotel') {pending.push({codigo:code,reason:'Fonte diferente de DESKHOTEL'});continue;}
    if (!current.contactCells || fields.some(field=>!Object.hasOwn(current.contactCells,field.name))) throw Error('Leitura dos valores e fórmulas dos contatos obrigatória.');
    for (const field of fields) {
      // Even a formula displaying an empty string is already populated.
      if (current.contactCells?.[field.name] != null || String(current[field.name] || '').trim()) continue;
      const value = contactValue(capture[field.name],field.name);
      if (!value) {pending.push({codigo:code,field:field.name,reason:'Contato ausente ou inválido na origem'});continue;}
      const record = {...current,operation:'contact-fill',origin:capture.origin,evidence:capture.evidence,columnIndex:field.columnIndex,newValue:{stringValue:value}};
      records.push(record);
      const sheetId = current.targetSheet === routing.SELLERS_SHEET ? 1945937754 : 711290481;
      requests.push({updateCells:{range:{sheetId,startRowIndex:current.rowNumber-1,endRowIndex:current.rowNumber,startColumnIndex:field.columnIndex,endColumnIndex:field.columnIndex+1},rows:[{values:[{userEnteredValue:record.newValue}]}],fields:'userEnteredValue'}});
    }
  }
  return {records,existingSellers,existingChannels,requests,pending};
}
module.exports = {fields,contactValue,buildContactPlan};
