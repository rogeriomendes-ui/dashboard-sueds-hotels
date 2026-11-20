export const properties = {
  "SUEDS PLAZA": { name: "Sueds Plaza", rooms: { STD: "Apartamento Standard", LX: "Apartamento Luxo", MAS: "Suite Master" } },
  "SUEDS CABRALIA": { name: "Sueds Cabralia", rooms: { STD: "Apartamento Standard" } },
  "SUEDS PREMIUM": { name: "Sueds Premium", rooms: { STD: "Standard" } },
  "SUEDS SEGUNDO SOL": { name: "Sueds Segundo Sol", rooms: { STD: "Apartamento Standard" } },
  "SUEDS TRANCOSO": null,
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
        r.targetAvailable !== Math.floor(r.available * 4 / 5) || r.targetOccupied !== r.capacity - r.targetAvailable) {
      return "Confira a captura e as categorias em " + r.date + ".";
    }
    seen.add(key);
  }
  const nights = 1 + (Date.parse(end) - Date.parse(start)) / 86400000;
  return seen.size === nights * expected.size ? "" : "Cobertura incompleta do período.";
}
