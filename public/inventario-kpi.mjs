export function linhasInventario(occupancy) {
  if (!Array.isArray(occupancy)) throw Error("Resposta do mapa de ocupação inválida.");
  const rows = [];
  for (const { hotel, days } of occupancy) {
    for (const day of days) {
      const types = day.roomTypes || [];
      const codes = new Set(types.map(type => type.code));
      const complete = types.length > 0 && codes.size === types.length &&
        types.every(type => Number.isInteger(type.available) && type.available >= 0 &&
          type.available <= type.apartments) &&
        types.reduce((sum, type) => sum + type.apartments, 0) === day.apartments &&
        types.reduce((sum, type) => sum + type.available, 0) === day.available;
      const stamp = day.capturedAt || null;
      const status = !types.length ? "Sem captura por categoria" :
        !complete ? "Conferir totais e categorias" : !stamp ? "Captura sem horário" : "Captura disponível";
      for (const type of types.length ? types : [null]) {
        rows.push({ hotel, date: day.date, code: type?.code ?? null,
          capacity: type?.apartments ?? null, available: type?.available ?? null,
          targetAvailable: complete && stamp ? Math.floor(type.available * 4 / 5) : null,
          targetOccupied: complete && stamp ? type.apartments - Math.floor(type.available * 4 / 5) : null,
          capturedAt: stamp, status });
      }
    }
  }
  return rows;
}
export function indexarOmnibees(snapshot) {
  const { hotel, start, end, categories, observedOn } = snapshot;
  function parse(value) {
    const time = Date.parse(value + "T00:00:00Z");
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== value) throw Error("Data inválida na captura.");
    return time;
  }
  const first = parse(start);
  const size = (parse(end) - first) / 86400000 + 1;
  parse(observedOn);
  if (!hotel || size < 1 || !Array.isArray(categories) || !categories.length) throw Error("Captura incompleta.");
  const values = new Map();
  for (const {code, available} of categories) {
    if (!code || values.has(code) || !Array.isArray(available) || available.length !== size ||
        !available.every(Number.isSafeInteger)) throw Error("Categoria duplicada ou saldo inválido na captura.");
    values.set(code, available);
  }
  return ({ hotel: kpiHotel, date, code }) => {
    if (hotel !== kpiHotel || date < start || date > end) return null;
    return values.get(code)?.[(parse(date) - first) / 86400000] ?? null;
  };
}
