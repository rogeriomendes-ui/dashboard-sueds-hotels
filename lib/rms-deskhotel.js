const { json } = require('./portal-auth');

const hotels = new Map([
  ['PLAZA', { id:'0557', rooms:{2463:'standard',2464:'luxo',2465:'suite'} }],
  ['SEGUNDO_SOL', { id:'0558', rooms:{2466:'standard'} }],
  ['CABRALIA', { id:'0559', rooms:{2467:'standard'} }],
  ['PREMIUM', { id:'0560', rooms:{2468:'standard'} }],
  ['TRANCOSO', { id:'0561', rooms:{2469:'Suite Junior',2470:'Suite Deluxe',2471:'Suite Deluxe Quadrupla',2472:'Suite Standard'} }],
  ['CASAS', { id:'0562', rooms:{} }]
]);

const normalize = name => name.normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');

function cafeRooms(rows, config) {
  const rooms = [];
  for (const [id,name] of Object.entries(config.rooms)) {
    const found = rows.filter(r=>String(r.roomId)===id && String(r.meal)==='1' && r.rate_id===null);
    if (found.length !== 1) continue;
    const row = found[0], capacity = Number(row.maxAdt);
    if (!Number.isInteger(capacity) || capacity<1 || capacity>4) continue;
    const prices = Array.from({length:capacity},(_,i)=>{
      const price=row['pax'+(i+1)];
      return Number.isFinite(price) && price>0 ? Math.round(price*100) : null;
    });
    rooms.push({id,name,row,prices});
  }
  return rooms;
}

async function preview(client, night, res, code = 'PLAZA', action='deskhotel_previa', end=night, values) {
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
  url.search = new URLSearchParams({ hotelId: id, hotelKey: key, startDate: night, endDate: end });
  const headers = { Authorization: 'Basic ' + Buffer.from(login + ':' + password).toString('base64'), Origin: origin };
  try {
    const response = await fetch(url, {
      headers,
      redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw Error();
    const data = await response.json();
    if (data.hotelId !== id || !data.rates || typeof data.rates !== 'object') throw Error();
    const rows = data.rates[night] ?? [];
    if (!Array.isArray(rows)) throw Error();
    const rooms=cafeRooms(rows,config);
    if (action==='deskhotel_status') {
      const confirmed={}, updatedAt={};
      for (const [date,entries] of Object.entries(data.rates)) {
        if (date<night || date>end || !Array.isArray(entries)) continue;
        const published=cafeRooms(entries,config).filter(r=>r.row.origin==='portal-sueds');
        confirmed[date]=Object.fromEntries(published.map(r=>[normalize(r.name),r.prices]));
        updatedAt[date]={};
        for(const room of published){
          const stamp=room.row.dateTimeChange;
          if(typeof stamp==='string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(stamp)){
            const utc=stamp.replace(' ','T')+'Z';
            if(Number.isFinite(Date.parse(utc)))updatedAt[date][normalize(room.name)]=utc;
          }
        }
      }
      return json(res,200,{confirmed,updatedAt});
    }
    if (action==='deskhotel_atualizar') {
      if (!values || typeof values!=='object' || Array.isArray(values) || !Object.keys(values).length)
        return json(res,400,{error:'Selecione tarifas válidas.'});
      const batch=[];
      for (const [name,cents] of Object.entries(values)) {
        const room=rooms.find(r=>normalize(r.name)===name);
        if (!room || !Number.isSafeInteger(cents) || cents<=0 || cents>=1e10)
          return json(res,422,{error:'Categoria ou tarifa sem correspondência confirmada.'});
        const target=[cents,cents,Math.round(cents*140/100),Math.round(cents*180/100)].slice(0,room.prices.length);
        if (room.row.origin==='portal-sueds' && target.every((v,i)=>v===room.prices[i])) continue;
        const item={hotelId:id,hotelKey:key,roomId:room.id,roomName:room.row.roomName,startDate:night,endDate:night,origin:'portal-sueds'};
        for (const field of ['minimumStay','rulesCheckin','rulesCheckout','refundable','pet','chd1','chd2'])
          item[field]=room.row[field];
        for (let i=0;i<12;i++) item['pax'+(i+1)]=i<target.length ? target[i]/100 : room.row['pax'+(i+1)];
        batch.push(item);
      }
      if (batch.length) {
        const post=await fetch('https://rates.chatbooking.com.br/rates',{method:'POST',
          headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(batch),
          redirect:'error',signal:AbortSignal.timeout(15000)});
        if (!post.ok) throw Error();
      }
      return json(res,200,{queued:batch.length});
    }
    const prices=Object.fromEntries(Object.values(config.rooms).map(name=>[name,null]));
    for (const room of rooms) prices[room.name]=room.prices;
    return json(res, 200, { prices, checkedAt: new Date().toISOString() });
  } catch {
    return json(res, 502, { error: 'Falha na comunicação com o DeskHotel. Confira o status antes de repetir.' });
  }
}

module.exports = { preview };
