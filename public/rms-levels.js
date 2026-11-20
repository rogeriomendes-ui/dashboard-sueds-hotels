// Um código pode ser reutilizado em temporadas diferentes. Resolva-o dentro da base do período.
function plazaLevelComparison(catalog, period, night, occupancy, plan=0) {
  const base = period?.base_origem ? catalog?.bases.find(b=>b.name===period.base_origem) : catalog?.bases[catalog.periods[period?.inicio]];
  const rule=(typeof RmsRules!=="undefined"?RmsRules:require("./rms-rules")).band(period,occupancy);
  const level = rule ? base?.levels.find(l => l.pct === Number(rule.pct)) : null;
  const observation = catalog?.calendar?.[night];
  const observed = base?.levels.find(l => l.code === observation?.code);
  const weekday = (new Date(night+"T12:00:00Z").getUTCDay()+6)%7;
  const rates = (l, simulation) => Object.fromEntries(["standard","luxo","suite"].map(room => {
    const original = base?.grids[plan]?.[room]?.[1];
    const price = simulation ? catalog?.edits?.[JSON.stringify([base?.name,plan,room,2,weekday])] ?? original : original;
    return [room,l && price>0 ? Math.round(price*(100+l.pct))/100 : null];
  }));
  const simulated = rates(level,true), reference = rates(observed,false);
  const status = !level || !observed ? "Sem comparação" : occupancy>=100 ? "Manter vigente" :
    level.code!==observed.code ? "Nível divergente" :
    Object.keys(reference).some(k=>simulated[k]!==reference[k]) ? "Grade alterada" : "Coincide";
  return {level,observation,simulated,reference,status};
}
function beeWebDecision(target,current,hold) {
  const prices={}, retained=[];
  for(const room of ["standard","luxo","suite"]){
    const web=current?.[room], candidate=target.simulated[room];
    if(web>0 && candidate!=null && candidate<web) retained.push(room);
    prices[room]=!(web>0) ? null : hold ? web : candidate==null ? null : Math.max(web,candidate);
  }
  return {prices,retained};
}
// O histórico importado informa o nível aplicado. Use a grade original WEB com café para 2 adultos.
function appliedBeeRates(history,catalog) {
  const latest=new Map();
  const levels=new Map();
  for(const base of catalog?.bases || []) for(const level of base.levels){
    const name=level.name.trim().toUpperCase();
    levels.set(name,levels.has(name)?null:{base,level});
  }
  for(const event of history || []){
    const stamp=/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2})$/.exec(event.at);
    if(!stamp) continue;
    const time=stamp[3]+stamp[2]+stamp[1]+stamp[4];
    const match=levels.get(event.level.trim().toUpperCase());
    const web={};
    for(const room of ["standard","luxo","suite"]){
      const price=match?.base.grids[0]?.[room]?.[1];
      if(price>0) web[room]=Math.round(price*(100+match.level.pct))/100;
    }
    for(const night of event.nights){
      const parts=/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(night);
      if(!parts) continue;
      const key=parts[3].padStart(4,"20")+"-"+parts[2]+"-"+parts[1];
      const prior=latest.get(key);
      if(!prior || time>prior.time) latest.set(key,{time,web,at:event.at,level:event.level});
      else if(time===prior.time && prior.level!==event.level) prior.web={};
    }
  }
  return latest;
}
if (typeof module !== "undefined") module.exports = {plazaLevelComparison,beeWebDecision};
