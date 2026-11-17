// Valores por noite em reais. A Omnibees arredonda cada derivação em centavos.
const plazaDerivations = {
  "CAFÉ DA MANHÃ": {site:25, net:40},
  "MEIA PENSÃO": {site:11, net:30},
  "PENSÃO COMPLETA": {site:5, net:24}
};
function plazaPrices(web, discount, regime="CAFÉ DA MANHÃ") {
  const rule=plazaDerivations[regime];
  if (!rule) return null;
  if (!Number.isFinite(web) || web <= 0 || !Number.isFinite(discount) || discount < 0 || discount >= 100) return null;
  const cents = Math.round(web * 100);
  const site = Math.round(cents * (100-rule.site) / 100);
  return {web:cents/100, site:site/100, net:Math.round(cents*(100-rule.net)/100)/100,
    final:Math.round(site*(100-discount)/100)/100};
}
function plazaWebTarget(regularWeb, quote, desiredFinal, regime="CAFÉ DA MANHÃ") {
  const current = plazaPrices(regularWeb, quote?.discount, regime);
  if (!current || current.site !== quote.regular || current.final !== quote.final || !(desiredFinal>0)) return null;
  if (desiredFinal===current.final) return current;
  const estimate = Math.round(desiredFinal*100 / ((1-plazaDerivations[regime].site/100)*(1-quote.discount/100)));
  for (const offset of [0,-1,1,-2,2]) {
    const proposed = plazaPrices((estimate+offset)/100,quote.discount,regime);
    if (proposed?.final===desiredFinal) return proposed;
  }
  return null;
}
if (typeof module!=="undefined") module.exports={plazaPrices,plazaWebTarget};
