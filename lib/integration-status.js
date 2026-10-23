const SOURCES = { omnibees: 'Omnibees', cvc: 'CVC', juniper: 'Azul / Juniper', deskhotel: 'DeskHotel' };
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function report(snapshot, query = {}, { allDetails = false, now = new Date(), found = [] } = {}) {
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.channels)) throw new Error('Base de conferência inválida.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  const yesterday = new Date(today + 'T12:00:00Z'); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const from = query.from || '2026-01-01', to = query.to || yesterday.toISOString().slice(0, 10);
  const source = query.source || '', situation = query.situation || 'missing';
  const page = Number(query.page || 1);
  if (!validDate(from) || !validDate(to) || from > to || (source && !SOURCES[source]) || !['missing', 'matched', 'manual_found', 'different_number', 'review', 'uncovered', 'cancellation_pending', 'all'].includes(situation) || !Number.isSafeInteger(page) || page < 1) {
    const error = new Error('Informe filtros válidos e um período inicial anterior ao final.'); error.status = 400; throw error;
  }
  const hotels = [...new Set(snapshot.channels.flatMap(c => c.hotels || []))].sort();
  if (query.hotel && !hotels.includes(query.hotel)) { const error = new Error('Hotel inválido.'); error.status = 400; throw error; }
  const details = [];
  const { keyOf } = require('./integration-status-found');
  const foundByKey = new Map(found.map(r => [keyOf(r.source, r.hotel, r.code), r]));
  const channels = Object.entries(SOURCES).map(([id, name]) => {
    const channel = snapshot.channels.find(c => c.source === id);
    if (!channel?.available) return { source: id, name, available: false, confirmed: 0, missing: 0, matched: 0, uncovered: 0, review: 0, differentNumber: 0, manualFound: 0, cancellation_pending: 0 };
    const counts = { confirmed: 0, missing: 0, matched: 0, uncovered: 0, review: 0, differentNumber: 0, manualFound: 0, cancellation_pending: 0 };
    for (const original of channel.records) {
      const resolution = original.situation === 'cancellation_pending' ? undefined : foundByKey.get(keyOf(id, original.hotel, original.code));
      const row = resolution ? { ...original, manualResolution: resolution, manualFound: ['missing', 'matched'].includes(original.situation), situation: original.situation === 'missing' ? 'matched' : original.situation } : original;
      const checkout = String(row.checkout || '').replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
      if (!validDate(checkout) || checkout < today) continue;
      if (row.saleDate < from || row.saleDate > to || (query.hotel && row.hotel !== query.hotel)) continue;
      if (row.situation !== 'cancellation_pending') counts.confirmed++;
      counts[row.situation]++;
      if (row.manualFound) counts.manualFound++;
      if (row.situation === 'matched' && row.numberMismatch) counts.differentNumber++;
      if ((!source || source === id) && (situation === 'all' || situation === row.situation || situation === 'manual_found' && row.manualResolution || situation === 'different_number' && row.situation === 'matched' && row.numberMismatch)) details.push({ source: id, sourceName: name, ...row });
    }
    return { source: id, name, available: true, from: channel.from, to: channel.to, capturedAt: channel.capturedAt,
      partial: from < channel.from || to > channel.to, ...counts };
  });
  details.sort((a, b) => b.saleDate.localeCompare(a.saleDate) || a.hotel.localeCompare(b.hotel) || a.code.localeCompare(b.code));
  return { generatedAt: snapshot.generatedAt, kpi: snapshot.kpi, checkoutFrom: today, hotels, filters: { from, to, source, situation, hotel: query.hotel || '' }, channels,
    summary: channels.reduce((s, c) => { for (const k of Object.keys(s)) s[k] += c[k]; return s; }, { confirmed: 0, missing: 0, matched: 0, uncovered: 0, review: 0, differentNumber: 0, manualFound: 0, cancellation_pending: 0 }),
    details: allDetails ? details : details.slice((page - 1) * 100, page * 100), totalDetails: details.length, page, pageSize: 100 };
}
module.exports = { SOURCES, report, validDate };
