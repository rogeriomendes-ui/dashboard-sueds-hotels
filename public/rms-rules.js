/* Sem envio de tarifas: regras comuns da simulação e do histórico. */
const RmsRules=(()=>{
  const thresholds=[0,50,60,70,80];
  function expired(group,today){return group.periodos.length>0&&group.periodos.every(p=>p.fim<today);}
  function bands(p){return p.faixas || thresholds.map((de,i)=>({de:i?de+0.1:0,ate:thresholds[i+1]||100,pct:Number(p['pct'+de])}));}
  function matches(p,night){return p.inicio<=night && night<=p.fim && (!p.dias || p.dias.includes((new Date(night+'T12:00:00Z').getUTCDay()+6)%7));}
  function forNight(periods,night){const p=periods.find(p=>!p.bloqueio_avulso&&matches(p,night));return periods.some(b=>b.bloqueio_avulso&&matches(b,night))?{...p,bloqueado:true,nome:p?.nome||'Flutuação bloqueada',faixas:p?.faixas||[]}:p;}
  function withBlocks(periods,blocks){return [...periods,...blocks.flatMap(b=>b.periodos.map(p=>({...p,hotel_id:b.hotel_id,bloqueio_avulso:true,bloqueado:true,nome:'Flutuação bloqueada',faixas:[]})))];}
  function band(p,occupancy){
    if(!p || occupancy==null || !Number.isFinite(Number(occupancy)))return null;
    if(!p.faixas){const i=[80,70,60,50].find(n=>occupancy>n)||0;return bands(p)[thresholds.indexOf(i)];}
    const n=Number(occupancy);return n<0?null:bands(p).find(b=>n<=b.ate)||null;
  }
  function groups(periods,catalog,hotelId){
    const result=new Map();
    for(const p of periods.filter(p=>p.hotel_id===hotelId&&!p.bloqueio_avulso)){
      const base=p.base_origem || catalog?.bases[catalog.periods[p.inicio]]?.name || '';
      const key=p.conjunto_id || JSON.stringify([p.nome,base,bands(p)]);
      if(!result.has(key))result.set(key,{id:p.conjunto_id||null,nome:p.nome,base_origem:base,faixas:bands(p),periodos:[],origens:p.conjunto_origens||[],bloqueado:!!p.bloqueado,gravado_em:p.conjunto_gravado_em||null,gravado_por:p.gravado_por,legado:!p.conjunto_id});
      const g=result.get(key);g.periodos.push({inicio:p.inicio,fim:p.fim,dias:p.dias||[0,1,2,3,4,5,6]});if(!p.conjunto_id)g.origens.push(p.inicio);
    }
    return [...result.values()];
  }
  function overlay(legacy,configs){
    const hidden=new Set(configs.flatMap(c=>c.origens.map(d=>c.hotel_id+'|'+d)));
    return [...legacy.filter(p=>!hidden.has(p.hotel_id+'|'+p.inicio)),...configs.filter(c=>!c.excluido).flatMap(c=>c.periodos.map(p=>({hotel_id:c.hotel_id,nome:c.nome,base_origem:c.base_origem,...p,faixas:c.faixas,bloqueado:c.bloqueado,conjunto_id:c.id,conjunto_origens:c.origens,conjunto_gravado_em:c.gravado_em,gravado_por:c.gravado_por})))];
  }
  return {bands,band,matches,groups,overlay,forNight,withBlocks,expired};
})();
if(typeof module!=='undefined')module.exports=RmsRules;
