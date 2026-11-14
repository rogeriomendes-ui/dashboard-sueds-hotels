function numberBR(value) {
  if (value == null || value === "") return NaN;
  return Number(String(value).replaceAll(".", "").replace(",", "."));
}

function recalculate(analysis) {
  const demand = analysis.conversaoDeskhotel;
  const months = new Map();
  for (const row of analysis.rows) {
    const [quotes, sales] = demand[row[0]] || [];
    if (!Number.isInteger(quotes) || quotes <= 0 || !Number.isInteger(sales) || sales < 0 || sales > quotes) continue;
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
    const month = months.get(row[0].slice(0,7));
    const plaza = numberBR(row[1]), brisa = numberBR(row[2]);
    const occ = numberBR(row[7]), balance = numberBR(row[8]);
    if (!month || !Number.isInteger(quotes) || quotes <= 0 || !Number.isInteger(sales) ||
        sales < 0 || sales > quotes || !(plaza > 0) ||
        !Number.isFinite(occ) || !Number.isFinite(balance) || occ >= 100 ||
        (row[6] === "Revisar" && /evento/i.test(row[17]))) {
      row[4] = row[5] = "";
      row[6] = "Revisar";
      if (occ > 100) row[17] = "Overbooking. Conferir o inventário.";
      else if (occ === 100) row[17] = "Inventário esgotado.";
      else if (!(plaza > 0)) row[17] = "Sem tarifa confirmada do Plaza para a categoria.";
      else if (!/evento/i.test(row[17])) row[17] = "Conferir os dados internos antes de sugerir ajuste.";
      continue;
    }
    const highDemand = quotes >= month.median;
    const goodConversion = sales > 0 && sales * month.quotes >= quotes * month.sales;
    const weakConversion = sales * month.quotes <= quotes * month.sales;
    const increase = occ >= 80;
    const decrease = occ < 80 && balance <= -10 && weakConversion && (highDemand || month.sales > 0);
    let pct = 0;
    if (increase) {
      pct = 10;
    } else if (decrease) {
      pct = highDemand && goodConversion ? -2.5 : -5;
      if (brisa > plaza) pct += 0.5;
    }
    row[4] = String(pct);
    row[5] = (Math.round(Math.round(plaza * 100) * (100+pct) / 100) / 100).toFixed(2).replace(".",",");
    row[6] = increase ? "Subir" : decrease ? "Reduzir" : "Manter";
    const fmt = n => n.toLocaleString("pt-BR", {maximumFractionDigits:1});
    if (row[6] === "Manter") {
      const motivos = [`Ocupação de ${row[7]}%, abaixo dos 80% para subir.`];
      if (balance > -10) {
        if (balance > 0) motivos.push(`O Plaza tem ${balance} apto(s) a mais que na data comparável, na mesma antecedência.`);
        else if (balance === 0) motivos.push("O Plaza tem a mesma quantidade de apartamentos reservados que na data comparável.");
        else motivos.push(`O Plaza está apenas ${-balance} apto(s) atrás da curva. A redução exige atraso de pelo menos 10.`);
      } else {
        motivos.push(`O Plaza está ${-balance} apartamentos atrás da curva.`);
      }
      if (!weakConversion) motivos.push(`A conversão da noite (${fmt(100*sales/quotes)}%) supera a do mês (${fmt(100*month.sales/month.quotes)}%), o que favorece manter o preço.`);
      if (!highDemand && month.sales === 0) motivos.push(`O mês ainda não registrou vendas diretas e houve ${quotes} orçamentos para a noite, abaixo da mediana de ${fmt(month.median)} exigida nesse caso para reduzir.`);
      row[17] = motivos.join(" ");
      continue;
    }
    const reason = increase ? "Ocupação de " + fmt(occ) + "%: aumento de 10% pela regra de ocupação alta." :
      "Ocupação abaixo de 80%, atraso na curva e conversão baixa.";
    row[17] = reason + " CRM: " + quotes + " orçamentos (mediana do mês: " + fmt(month.median) +
      "). Conversão: " + fmt(100*sales/quotes) + "% (mês: " + fmt(100*month.sales/month.quotes) + "%)." +
      (brisa > plaza && decrease ? " Plaza abaixo do Brisa: +0,5 ponto percentual no ajuste." : "");
  }
}

module.exports = { recalculate };
