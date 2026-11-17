const {plazaPrices} = require("../public/rms-plaza-tarifas");


// ofertasSite contains the resolved official SITE offer for the sale day,
// stay night and room (two adults, breakfast). Explicit 0 means no offer.
function quoteNight(night, source, today = new Date().toLocaleDateString("en-CA",{timeZone:"America/Bahia"})) {
  const web = source?.noites?.[night] || {};
  const site = {};
  const result = {web,site,at:source?.capturadoEm || null};
  const eligible=source?.ofertas?.filter(o=>o.venda[0]<=today && today<=o.venda[1] &&
    o.estadias.some(([start,end])=>start<=night && night<=end));
  const best=eligible?.sort((a,b)=>b.desconto-a.desconto)[0];
  for (const key of ["standard","luxo","suite"]) {
    const offer = source?.ofertasSite?.[today]?.[night]?.[key] ?? (eligible ? best || {desconto:0,nome:""} : null);
    const prices = plazaPrices(web[key],offer?.desconto,source?.regime);
    if (!prices || (offer.desconto>0 && !offer.nome)) continue;
    const calendarSite = source?.siteRegular?.[night]?.[key];
    site[key] = {regular:prices.site,final:prices.final,discount:offer.desconto,offer:offer.nome || "",
      divergence:calendarSite!=null && calendarSite!==prices.site};
    result[key] = prices.final;
  }
  return result;
}
module.exports={quoteNight};
