const { json } = require('./portal-auth');

const hotels = new Map([
  ['PLAZA', { id:'0557', rooms:{2463:'standard',2464:'luxo',2465:'suite'} }],
  ['SEGUNDO_SOL', { id:'0558', rooms:{2466:'standard'} }],
  ['CABRALIA', { id:'0559', rooms:{2467:'standard'} }],
  ['PREMIUM', { id:'0560', rooms:{2468:'standard'} }],
  ['TRANCOSO', { id:'0561', rooms:{2469:'Suite Junior',2470:'Suite Deluxe',2471:'Suite Deluxe Quadrupla',2472:'Suite Standard'} }],
  ['CASAS', { id:'0562', rooms:{} }]
]);

async function preview(client, night, res, code = 'PLAZA') {
  res.setHeader('Cache-Control', 'no-store');
  const config = hotels.get(code);
  if (!config) return json(res, 400, { error: 'Hotel desconhecido.' });
  const hotel = await client.from('hotels').select('id').eq('code', code)
    .eq('status', 'active').is('deleted_at', null).maybeSingle();
  if (hotel.error) throw hotel.error;
  if (!hotel.data) return json(res, 403, { error: 'Hotel indisponível para este acesso.' });
  if (code === 'CASAS') return json(res, 422, { error: 'SITE Café não se aplica ao Casas Sued’s Arraial. O regime é somente hospedagem (meal=0).' });
  const { CR_API_LOGIN: login, CR_API_PASSWORD: password, CR_PARTNER_ORIGIN: origin } = process.env;
  const suffix = code === 'PLAZA' ? '' : '_' + config.id;
  const id = process.env['CR_HOTEL_ID' + suffix], key = process.env['CR_HOTEL_KEY' + suffix];
  if (id !== config.id || !login || !password || !key || !origin)
    return json(res, 503, { error: 'Configure o acesso DeskHotel deste hotel no servidor.' });
  const url = new URL('https://rates.chatbooking.com.br/rates');
  url.search = new URLSearchParams({ hotelId: id, hotelKey: key, startDate: night, endDate: night });
  try {
    const response = await fetch(url, {
      headers: { Authorization: 'Basic ' + Buffer.from(login + ':' + password).toString('base64'), Origin: origin },
      redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw Error();
    const data = await response.json();
    if (data.hotelId !== id || !data.rates || typeof data.rates !== 'object') throw Error();
    const rows = data.rates[night] ?? [];
    if (!Array.isArray(rows)) throw Error();
    const prices = {};
    for (const [roomId, room] of Object.entries(config.rooms)) {
      prices[room] = null;
      const matches = rows.filter(r => String(r.roomId) === roomId && String(r.meal) === '1' && r.rate_id === null);
      if (matches.length === 1) {
        const capacity = Number(matches[0].maxAdt);
        if (!Number.isInteger(capacity) || capacity < 1) continue;
        prices[room] = [1, 2, 3, 4].slice(0,capacity).map(pax => {
          const value = matches[0]['pax' + pax];
          return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
        });
      }
    }
    return json(res, 200, { prices, checkedAt: new Date().toISOString() });
  } catch {
    return json(res, 502, { error: 'Falha na consulta de tarifas ao DeskHotel.' });
  }
}

module.exports = { preview };
