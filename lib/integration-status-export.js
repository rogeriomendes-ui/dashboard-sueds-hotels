const ExcelJS = require('exceljs');
const { validDate } = require('./integration-status');
const labels = { missing: 'Não localizada', matched: 'Localizada no KPI', manual_found: 'Achei — marcações manuais', review: 'Revisar status na origem', uncovered: 'Sem cobertura KPI', different_number: 'Encontradas com número diferente', all: 'Todas as confirmadas' };
function excelDate(value) {
  let iso = String(value || '');
  const br = iso.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) iso = `${br[3]}-${br[2]}-${br[1]}`;
  return validDate(iso) ? new Date(iso + 'T00:00:00Z') : String(value || '');
}
const stamp = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Sem captura';
async function buildWorkbook(data) {
  const book = new ExcelJS.Workbook(); book.creator = 'Portal SUEDS';
  const sheet = book.addWorksheet('Status integrações', { views: [{ state: 'frozen', ySplit: 6 }] });
  const columns = ['Canal', 'Hotel', 'Reserva no canal', 'Hóspede', 'Data da venda', 'Check-in', 'Check-out', 'Status na origem', 'Estado da linha', 'Conferência KPI', 'Reservas KPI', 'Localizadores KPI', 'Status KPI', 'Explicação Achei', 'Conferido por', 'Data da marcação'];
  const widths = [19, 25, 25, 42, 16, 16, 16, 20, 18, 45, 24, 28, 23, 55, 28, 28];
  sheet.columns = widths.map(width => ({ width }));
  const metadata = [
    'Status integrações · Portal SUEDS',
    `Venda: ${data.filters.from} a ${data.filters.to} | Check-out a partir de: ${data.checkoutFrom} | Hotel: ${data.filters.hotel || 'Todos'} | Canal: ${data.channels.find(c => c.source === data.filters.source)?.name || 'Todos'} | Situação: ${labels[data.filters.situation]} | ${data.totalDetails} reservas`,
    `Captura KPI comparada: ${stamp(data.kpi?.capturedAt)} | Base consolidada: ${stamp(data.generatedAt)} | Horários de Brasília`,
    data.channels.filter(c => c.available && (!data.filters.source || c.source === data.filters.source)).map(c => `${c.name}: ${stamp(c.capturedAt)}`).join(' | ')
  ];
  metadata.forEach((text, i) => { sheet.mergeCells(i + 1, 1, i + 1, columns.length); const cell = sheet.getCell(i + 1, 1); cell.value = text; cell.alignment = { vertical: 'middle', wrapText: true }; sheet.getRow(i + 1).height = i ? 30 : 30; });
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF172D3D' } };
  const header = sheet.getRow(6); header.values = columns; header.height = 30;
  header.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172D3D' } }; cell.alignment = { vertical: 'middle', wrapText: true }; });
  for (const r of data.details) {
    const row = sheet.addRow([r.sourceName, r.hotel, String(r.code), r.guest, excelDate(r.saleDate), excelDate(r.checkin), excelDate(r.checkout), r.status, r.lineStatus,
      r.manualFound ? 'Achei — conferência manual' : r.numberMismatch ? 'Encontrada por nome e datas · número diferente' : labels[r.situation], r.matches.map(m => m.code).join('\n'), r.matches.map(m => m.locator || '').join('\n'), r.matches.map(m => m.status).join('\n'), r.manualResolution?.note || '', r.manualResolution?.userName || '', r.manualResolution ? stamp(r.manualResolution.at) : '']);
    row.alignment = { vertical: 'top', wrapText: true };
    for (const i of [3, 11, 12]) row.getCell(i).numFmt = '@';
    for (const i of [5, 6, 7]) row.getCell(i).numFmt = 'dd/mm/yyyy';
  }
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: sheet.rowCount, column: columns.length } };
  return Buffer.from(await book.xlsx.writeBuffer());
}
module.exports = { buildWorkbook };
