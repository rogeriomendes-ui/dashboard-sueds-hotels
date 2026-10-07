const { json } = require('../lib/portal-auth');
const template = require('../data/dre/template.json');
const sheets = require('../data/dre/template-sheets.json').sheets;

const hotels = {
  BTF: 'SUEDS TRANCOSO 2 - BTF',
  CSC: 'BEACH CLUB SEGUNDO S - CSC',
  FHF: 'SUEDS PLAZA - FHF',
  FHM: 'SUEDS PREMIUM - FHM',
  HKF: 'CABANA SUEDS - HKF',
  HKM: 'AEB PLAZA - HKM',
  HSS: 'SUEDS SEGUNDO SOL - HSS',
  PCF: 'SUEDS TRANCOSO - PCF',
  PCL: 'SUEDS CABRALIA - PCL',
  SCS: 'SUEDS MATRIZ - SCS',
  SSF: 'SUEDS FILIAL - SSF',
  SVR: 'SUEDS VILLA ROMANA - SVR',
  TMK: 'TMK SERVICO DE APOIO - TMK',
  WAF: 'WAT FILIAL - WAF',
  WAT: 'WAT MATRIZ - WAT'
};

module.exports = function dreHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const url = new URL(req.url, `https://${req.headers.host || 'portalsueds.com.br'}`);
  const hotelId = url.searchParams.get('hotel');
  const year = url.searchParams.get('year');
  if (!hotels[hotelId] || !/^20\d{2}$/.test(year) || Number(year) < 2024 || Number(year) > new Date().getFullYear()) return json(res, 404, { error: 'dre_not_available' });
  if (url.searchParams.get('format') === 'xlsx') return json(res, 404, { error: 'dre_xlsx_not_available' });
  const sheetId = url.searchParams.get('sheet');
  if (sheetId) {
    const sheet = sheets.find(item => item.id === sheetId);
    return sheet ? json(res, 200, sheet) : json(res, 404, { error: 'sheet_not_available' });
  }
  return json(res, 200, { ...template, hotelId, hotel: hotels[hotelId], year: Number(year), period: Number(year) < new Date().getFullYear() ? 'Ano fechado' : 'Ano parcial' });
};
