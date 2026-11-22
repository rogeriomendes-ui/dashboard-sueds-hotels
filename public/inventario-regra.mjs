export const properties = {
  "SUEDS PLAZA": { name: "Sueds Plaza", rooms: { STD: "Apartamento Standard", LX: "Apartamento Luxo", MAS: "Suite Master" } },
  "SUEDS CABRALIA": { name: "Sueds Cabralia", rooms: { STD: "Apartamento Standard" } },
  "SUEDS PREMIUM": { name: "Sueds Premium", rooms: { STD: "Standard" } },
  "SUEDS SEGUNDO SOL": { name: "Sueds Segundo Sol", rooms: { STD: "Apartamento Standard" } },
  "SUEDS TRANCOSO": { name: "Sueds Trancoso", rooms: {
    JNR: "Suite Junior", STD: "Suite Standard", DLX: "Suite Deluxe", QDL: "Suite Deluxe Quádrupla"
  } },
  "CASAS SUEDS ARRAIAL": null
};
export function validPeriod(start, end) {
  const valid = v => /^202[67]-\d\d-\d\d$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  return valid(start) && valid(end) && start <= end;
}

export function revisar(rows, hotel, start, end) {
  const rooms = properties[hotel]?.rooms;
  if (!rooms) return "Mapeamento da propriedade ou das categorias pendente.";
  const expected = new Set(Object.keys(rooms));
  const seen = new Set();
  for (const r of rows) {
    const key = r.date + "/" + r.code;
    if (r.hotel !== hotel || r.date < start || r.date > end || seen.has(key) || !expected.has(r.code) ||
        r.status !== "Captura disponível" || !Number.isFinite(Date.parse(r.capturedAt)) ||
        !Number.isSafeInteger(r.capacity) || r.capacity < 0 ||
        !Number.isSafeInteger(r.available) || r.available < 0 || r.available > r.capacity ||
        !Number.isInteger(r.percentualOmnibees ?? 80) || (r.percentualOmnibees ?? 80)<0 || (r.percentualOmnibees ?? 80)>100 ||
        r.targetAvailable !== Math.floor(r.available * (r.percentualOmnibees ?? 80) / 100) || r.targetOccupied !== r.capacity - r.targetAvailable) {
      return "Confira a captura e as categorias em " + r.date + ".";
    }
    seen.add(key);
  }
  const nights = 1 + (Date.parse(end) - Date.parse(start)) / 86400000;
  return seen.size === nights * expected.size ? "" : "Cobertura incompleta do período.";
}

export function revisarPorNoite(rows,hotel,start,end) {
  const dates=[], skipped=[];
  if (!properties[hotel]?.rooms || rows.some(r=>r.hotel!==hotel || !validPeriod(r.date,r.date) || r.date<start || r.date>end))
    return {dates,skipped,issue:"Confira o hotel, o período e o mapeamento das categorias."};
  const groups=new Map();
  for (const row of rows) {
    if (!groups.has(row.date)) groups.set(row.date,[]);
    groups.get(row.date).push(row);
  }
  for (let time=Date.parse(start);time<=Date.parse(end);time+=86400000) {
    const date=new Date(time).toISOString().slice(0,10);
    const day=groups.get(date) || [];
    if (day.some(r=>r.status==="Conferir totais e categorias")) {skipped.push(date);continue;}
    const issue=revisar(day,hotel,date,date);
    if (issue) return {dates,skipped,issue:issue+" Noite: "+date};
    dates.push(date);
  }
  return {dates,skipped,issue:dates.length ? "" : "Todas as noites do período têm divergência."};
}

export function planoAssistido(pedido) {
  const { hotel, start, end, rows } = pedido;
  if (start !== end) throw Error("O modo assistido atende uma noite por pedido.");
  const issue = revisar(rows, hotel, start, end);
  if (issue) throw Error(issue);
  const property = properties[hotel];
  return {
    hotel: property.name, date: start,
    rooms: rows.map(({ code, capacity, targetOccupied, targetAvailable }) => ({
      name: property.rooms[code], capacity, occupied: targetOccupied, available: targetAvailable
    }))
  };
}

export function conferirLeitura(plano, leitura) {
  const normalizar = s => typeof s === "string" ? s.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() : "";
  if (normalizar(leitura?.hotel) !== normalizar(plano.hotel)) return "A propriedade aberta diverge do pedido.";
  if (leitura.date !== plano.date) return "A noite aberta diverge do pedido.";
  if (!Array.isArray(leitura.rooms) || leitura.rooms.length !== plano.rooms.length) return "Confira as categorias da grade.";
  for (const expected of plano.rooms) {
    const matches = leitura.rooms.filter(room => room?.name === expected.name);
    if (matches.length !== 1) return "Categoria ausente ou repetida na grade: " + expected.name + ".";
    const [actual] = matches;
    if (actual.capacity !== expected.capacity || actual.occupied !== expected.occupied || actual.available !== expected.available)
      return expected.name + " na grade: " + actual.occupied + " ocupados e " + actual.available +
        " disponíveis. Esperado: " + expected.occupied + " ocupados e " + expected.available + " disponíveis, com capacidade " + expected.capacity + ".";
  }
  return "";
}
