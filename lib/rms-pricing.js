function numberBR(value) {
  if (value == null || value === "") return NaN;
  return Number(String(value).replaceAll(".", "").replace(",", "."));
}

function validDemand(quotes, sales) {
  return Number.isInteger(quotes) && quotes >= 0 && Number.isInteger(sales) && sales >= 0 && sales <= quotes;
}

function recalculate(analysis) {
  const demand = analysis.conversaoDeskhotel;
  const months = new Map();
  for (const row of analysis.rows) {
    const [quotes, sales] = demand[row[0]] || [];
    if (!validDemand(quotes, sales)) continue;
    const key = row[0].slice(0, 7);
    if (!months.has(key)) months.set(key, { volumes: [], quotes: 0, sales: 0 });
    const month = months.get(key);
    month.volumes.push(quotes);
    month.quotes += quotes;
    month.sales += sales;
  }
  for (const month of months.values()) {
    month.volumes.sort((a,b) => a-b);
    const middle = Math.floor(month.volumes.length / 2);
    month.median = (month.volumes[middle] + month.volumes[Math.floor((month.volumes.length-1)/2)]) / 2;
  }
  for (const row of analysis.rows) {
    const [quotes, sales] = demand[row[0]] || [];
    row[19] = null; // Referência da simulação anterior para a comparação no painel.
    const month = months.get(row[0].slice(0,7));
    const plaza = numberBR(row[1]), brisa = numberBR(row[2]);
    const occ = numberBR(row[7]), balance = numberBR(row[8]);
    if (!month || !validDemand(quotes, sales) || !(plaza > 0) ||
        !Number.isFinite(occ) || occ < 0 || !Number.isFinite(balance) || occ >= 100 ||
        (row[6] === "Revisar" && /evento/i.test(row[17]))) {
      row[4] = row[5] = "";
      row[6] = "Revisar";
      if (occ > 100) row[17] = "Overbooking. Conferir o inventário.";
      else if (occ === 100) row[17] = "Inventário esgotado.";
      else if (!(plaza > 0)) row[17] = "Sem tarifa confirmada do Plaza para a categoria.";
      else if (!/evento/i.test(row[17])) row[17] = "Conferir os dados internos antes de sugerir ajuste.";
      continue;
    }
    const lead = numberBR(row[12]);
    const highDemand = quotes > 0 && quotes >= month.median;
    const goodConversion = sales > 0 && sales * month.quotes >= quotes * month.sales;
    let previous = 0;
    if (quotes > 0) {
      if (occ >= 80) previous = 10;
      else if (highDemand && goodConversion && balance >= 0) previous = occ >= 70 && balance >= 10 ? 10 : 5;
      else if (balance <= -10 && sales * month.quotes <= quotes * month.sales && (highDemand || month.sales > 0))
        previous = (highDemand && goodConversion ? -2.5 : -5) + (brisa > plaza ? 0.5 : 0);
      row[19] = previous;
    }

    // Calibração inicial de simulação. A antecedência curta amplifica os sinais internos.
    const occupancySignal = (occ - 65) / 35;
    const demandSignal = Math.tanh(Math.log((quotes + 1) / (month.median + 1)));
    const monthlyConversion = month.quotes ? month.sales / month.quotes : 0;
    // Dez orçamentos à média mensal reduzem o efeito de amostras pequenas.
    const smoothedConversion = (sales + 10 * monthlyConversion) / (quotes + 10);
    const conversionSignal = monthlyConversion > 0 ? Math.tanh(Math.log(smoothedConversion / monthlyConversion)) : 0;
    const paceSignal = Math.tanh(balance / 20);
    const urgency = Number.isFinite(lead) && lead >= 0 ? 1 + 0.5 * Math.exp(-lead / 14) : 1;
    const internal = urgency * (0.20 * occupancySignal + 0.15 * demandSignal + 0.12 * conversionSignal + 0.13 * paceSignal);
    const market = brisa > 0 ? 0.05 * Math.tanh(Math.log(brisa / plaza)) : 0;
    const pct = Math.round(1000 * Math.expm1(internal + market)) / 10;
    const fmt = n => n.toLocaleString("pt-BR", {maximumFractionDigits:1});
    row[4] = String(pct);
    row[5] = (Math.round(Math.round(plaza * 100) * (100+pct) / 100) / 100).toFixed(2).replace(".",",");
    row[6] = pct > 0 ? "Subir" : pct < 0 ? "Reduzir" : "Manter";
    const otherDays = month.volumes.length - 1;
    const otherQuotes = month.quotes - quotes;
    const demandReference = otherDays
      ? "média de "+fmt(otherQuotes / otherDays)+" nos outros dias deste mês"
      : "sem outros dias com dados neste mês";
    const conversionReference = otherQuotes
      ? "média de "+fmt(100 * (month.sales - sales) / otherQuotes)+"% nos outros dias deste mês"
      : "sem orçamentos nos outros dias deste mês";
    const conversion = quotes ? fmt(100 * sales / quotes)+"%" : "sem orçamentos nesta noite";
    const comparableYear = /^\d{4}-/.test(row[10]) ? row[10].slice(0,4) : null;
    const marketText = brisa > 0 ? "concorrente "+fmt(Math.abs(100*(brisa/plaza-1)))+"% "+(brisa>=plaza?"acima":"abaixo")+" do Plaza" : "sem cotação concorrente";
    row[17] = "Ajuste calculado de "+fmt(pct)+"%. Ocupação "+fmt(occ)+"%. Demanda de "+quotes+" orçamentos ("+demandReference+"). "+
      "Conversão "+conversion+" ("+conversionReference+"). ADVP "+(comparableYear ? "em "+comparableYear : "no ano anterior")+
      ": "+(balance>0?"+":"")+balance+" aptos na mesma antecedência. "+(Number.isFinite(lead) && lead>=0 ? lead+" dias de antecedência" : "Antecedência indisponível")+
      " e "+marketText+".";
  }
}

module.exports = { recalculate };
