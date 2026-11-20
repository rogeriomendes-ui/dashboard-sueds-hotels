// Executed in the active inventory tab. Only the displayed inventory section is returned.
export function lerTela() {
  try {
    if (location.origin !== "https://myhotel2.omnibees.com") throw Error("Abra a aba do inventário da Omnibees.");
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
    const heading = [...document.querySelectorAll("h1,h2,h3,h4,h5,[role=heading]")]
      .some(el => visible(el) && el.innerText.trim() === "Inventário");
    const blocked = [...document.querySelectorAll('[role=dialog],dialog[open],[aria-busy=true]')].some(visible);
    if (!heading || blocked) throw Error("Abra o inventário e aguarde a grade após fechar o editor.");
    const header = document.querySelector("#context-sh-context") || document.querySelector("#sh-context");
    const hotels = (header?.innerText || "").split(/\n/).map(s => s.trim()).filter(s => /^sueds\s+\S/i.test(s));
    if (hotels.length !== 1) throw Error("Feche o seletor para identificar o hotel ativo.");
    const fields = [...document.querySelectorAll('input#tdt-excel-from-date,input[placeholder="dd/mm/aaaa — dd/mm/aaaa"]')].filter(visible);
    const range = fields.length === 1 && /^(\d\d)\/(\d\d)\/(\d{4})\s*[—–-]\s*\1\/\2\/\3$/.exec(fields[0].value.trim());
    if (!range) throw Error("Selecione e aplique uma única noite na Omnibees.");
    const [, day, month, year] = range;
    const date = year + "-" + month + "-" + day;
    const weekday = ["dom","seg","ter","qua","qui","sex","sáb"][new Date(date).getUTCDay()];
    const monthName = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][Number(month)-1];
    const page = document.body.innerText;
    const total = /^\s*totais da propriedade\s*$/im.exec(page);
    if (!total) throw Error("Exiba a grade completa com os totais da propriedade.");
    const beforeTotals = page.slice(0,total.index);
    const columns = [...beforeTotals.matchAll(/\b(dom|seg|ter|qua|qui|sex|s[áa]b)\.?\s*(\d{1,2})\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\b/gi)];
    const column = columns[0];
    if (columns.length !== 1 || column[1].toLowerCase().replace("sab","sáb") !== weekday ||
        Number(column[2]) !== Number(day) || column[3].toLowerCase() !== monthName)
      throw Error("A coluna da grade ainda não confirma a noite do filtro.");
    const text = beforeTotals.slice(column.index + column[0].length).trim();
    if (text.length > 8000 || !text.includes("Total de Disponíveis")) throw Error("Grade de inventário incompleta.");
    return { hotel:hotels[0], date, text };
  } catch (e) { return { error:e.message }; }
}

export function parseGrade(text, names) {
  const lines = text.split(/\n|\t/).map(x => x.trim()).filter(Boolean);
  const sections = names.map(name => ({ name, index:lines.lastIndexOf(name) })).sort((a,b) => a.index-b.index);
  const rows = {};
  if (lines.filter(s => s === "Ocupados").length !== names.length) throw Error("Categorias da grade divergentes.");
  for (const [i, {name,index}] of sections.entries()) {
    if (index < 0) throw Error("Categoria ausente: " + name);
    const tail = lines.slice(index+1,sections[i+1]?.index);
    const occupied = tail.indexOf("Ocupados");
    if (occupied < 1 || tail[occupied+2] !== "Total de Disponíveis" ||
        !tail.slice(0,occupied).some(s => s.startsWith("Total de Apartamentos"))) throw Error("Grade inesperada para " + name);
    const numbers = [tail[occupied-1],tail[occupied+1],tail[occupied+3]];
    if (!numbers.every(s => /^\d+$/.test(s))) throw Error("Quantidade ausente em " + name);
    const [capacity,occ,available] = numbers.map(Number);
    if (!Number.isSafeInteger(capacity) || occ + available !== capacity) throw Error("Totais da grade inválidos para " + name);
    rows[name] = { capacity, occupied:occ, available };
  }
  return { rows, order:sections.map(s => s.name) };
}
