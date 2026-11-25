const { json } = require('./portal-auth');

async function preview(client, night, res) {
  res.setHeader('Cache-Control', 'no-store');
  const hotel = await client.from('hotels').select('id').eq('code', 'PLAZA')
    .eq('status', 'active').is('deleted_at', null).maybeSingle();
  if (hotel.error) throw hotel.error;
  if (!hotel.data) return json(res, 403, { error: 'Plaza indisponível para este acesso.' });
  const { CR_API_LOGIN: login, CR_API_PASSWORD: password, CR_HOTEL_ID: id,
    CR_HOTEL_KEY: key, CR_PARTNER_ORIGIN: origin } = process.env;
  if (id !== '0557' || !login || !password || !key || !origin)
    return json(res, 503, { error: 'Configure o acesso DeskHotel do Plaza no servidor.' });
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
    for (const [roomId, room] of Object.entries({2463:'standard',2464:'luxo',2465:'suite'})) {
      const matches = rows.filter(r => String(r.roomId) === roomId && String(r.meal) === '1' && r.rate_id === null);
      if (matches.length === 1) {
        prices[room] = [1, 2, 3, 4].map(pax => {
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
