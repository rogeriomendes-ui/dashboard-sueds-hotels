// Um código pode ser reutilizado em temporadas diferentes. Resolva-o dentro da base do período.
function plazaLevelComparison(catalog, period, night, occupancy) {
  const base = catalog?.bases[catalog.periods[period?.inicio]];
  const threshold = [80,70,60,50].find(n => occupancy > n) ?? 0;
  const level = occupancy == null ? null : base?.levels.find(l => l.pct === Number(period["pct"+threshold]));
  const observation = catalog?.calendar[night];
  const observed = base?.levels.find(l => l.code === observation?.code);
  const weekday = (new Date(night+"T12:00:00Z").getUTCDay()+6)%7;
  const rates = (l, simulation) => Object.fromEntries(["standard","luxo","suite"].map(room => {
    const original = base?.grids[0]?.[room]?.[1];
    const price = simulation ? catalog?.edits?.[JSON.stringify([base?.name,0,room,2,weekday])] ?? original : original;
    return [room,l && price>0 ? Math.round(price*(100+l.pct))/100 : null];
  }));
  const simulated = rates(level,true), reference = rates(observed,false);
  const status = !level || !observed ? "Sem comparação" : occupancy>=100 ? "Manter vigente" :
    level.code!==observed.code ? "Nível divergente" :
    Object.keys(reference).some(k=>simulated[k]!==reference[k]) ? "Grade alterada" : "Coincide";
  return {level,observation,simulated,reference,status};
}
if (typeof module !== "undefined") module.exports = {plazaLevelComparison};
