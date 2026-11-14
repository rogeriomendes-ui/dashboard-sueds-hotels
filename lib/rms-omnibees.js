const categories = {"73210":"standard","73211":"luxo","73212":"suite"};
const cache = new Map();
const ttl = 30 * 60 * 1000;

function parseOffers(html, night) {
  const rates = {standard:null,luxo:null,suite:null};
  const restricted = {};
  const requestedDate=html.includes('id="date_from" value="'+night.split("-").reverse().join("")+'"');
  let matchedNight = false;
  for (const tag of html.matchAll(/<div\s+class="rate_plan\s+[^"]*"(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    const fields = Object.fromEntries(Array.from(tag[0].matchAll(/\sdata-([\w-]+)=(?:"([^"]*)"|'([^']*)')/g), m=>[m[1],m[2] ?? m[3]]));
    const category = categories[fields["room-id"]];
    if (category && requestedDate && tag[0].includes("rate_los_restricted") && fields.board==="CAFÉ DA MANHÃ" &&
        fields.currency==="16" && fields.adults==="2" && fields.children==="0" && Number(fields.price)>0) {
      restricted[category]=Math.min(restricted[category] ?? Infinity,Number(fields.price));
      matchedNight=true;
      continue;
    }
    if (!category || fields.start!==night || fields.nights!=="1" || fields.adults!=="2" || fields.children!=="0") continue;
    matchedNight = true;
    const price = Number(fields["price-public"]);
    if (fields.board!=="CAFÉ DA MANHÃ" || fields.allowed==="false" || fields["rate-currency-string-symbol"]!=="BRL" ||
        Number(fields["max-quantity"])<=0 || !(price>0) || !Number.isFinite(price)) continue;
    rates[category] = Math.min(rates[category] ?? Infinity,price);
  }
  if (!matchedNight && !/Não encontramos disponibilidade/i.test(html)) throw Error("Resposta sem cotação confirmada.");
  for (const category of Object.keys(restricted)) {
    if (rates[category]!=null) delete restricted[category];
    else rates[category]=restricted[category];
  }
  return {...rates,restricted:Object.keys(restricted),at:new Date().toISOString()};
}

async function fetchNight(night) {
  const end = new Date(night+"T12:00:00Z");
  end.setUTCDate(end.getUTCDate()+1);
  const fmt = d=>d.split("-").reverse().join("");
  const params = new URLSearchParams({CheckIn:fmt(night),CheckOut:fmt(end.toISOString().slice(0,10)),NRooms:"1",ad:"2",ch:"0",lang:"pt-BR",q:"11640",version:"4"});
  const response = await fetch("https://book.omnibees.com/hotelresults?"+params,{signal:AbortSignal.timeout(18000)});
  if (!response.ok) throw Error("Falha na consulta Omnibees.");
  return parseOffers(await response.text(),night);
}

async function quoteNight(night) {
  const item = cache.get(night);
  if (item && Date.now()-item.time<ttl) return item.promise;
  const promise = fetchNight(night);
  cache.set(night,{promise,time:Date.now()});
  try {return await promise;} catch(error) {cache.delete(night); throw error;}
}
module.exports={quoteNight,parseOffers};
