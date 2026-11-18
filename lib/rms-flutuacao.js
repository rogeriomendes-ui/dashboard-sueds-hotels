const {json}=require("./portal-auth");

module.exports=async function fluctuation(client,body,hotel,profile,today,end,validDate,res){
  if(!hotel) return json(res,400,{error:"Hotel inválido."});
  const hotel_id=hotel.id;
  const policy=await client.from("rms_politicas").select("modelo").eq("hotel_id",hotel_id).maybeSingle();
  if(policy.error) throw policy.error;
  const modelo=policy.data?.modelo || "beeprice";
  if(modelo==="simples" && body.tipo!=="flutuacao_consultar")
    return json(res,409,{error:"RMS Simples: somente comparação e simulação. Nenhuma tarifa enviada ou agendada."});
  if(body.tipo==="flutuacao_consultar"){
    const [pref,nights]=await Promise.all([
      client.from("rms_flutuacao_diaria").select("automatica").eq("hotel_id",hotel_id).maybeSingle(),
      client.from("rms_flutuacao_pendente").select("noite,gestor,tarifas").eq("hotel_id",hotel_id).gte("noite",today).lte("noite",end)
    ]);
    if(pref.error || nights.error) throw pref.error || nights.error;
    return json(res,200,{automatica:pref.data?.automatica ?? false,noites:nights.data});
  }
  if(body.tipo==="flutuacao_automatica"){
    if(typeof body.automatica!=="boolean") return json(res,400,{error:"Preferência inválida."});
    const result=await client.from("rms_flutuacao_diaria").upsert({hotel_id,automatica:body.automatica});
    if(result.error) throw result.error;
    return json(res,200,{automatica:body.automatica});
  }
  const nights=body.noites, keys=hotel.code==="PLAZA"?["standard","luxo","suite"]:["diaria"];
  const validRates=o=>o && typeof o==="object" && !Array.isArray(o) && Object.entries(o).every(([k,v])=>keys.includes(k) && Number.isFinite(v) && v>0 && v<=999999.99 && Number(v.toFixed(2))===v);
  if(!Array.isArray(nights) || !nights.length || nights.length>366 || nights.some(n=>!n || !validDate(n.noite) || n.noite<today || n.noite>end || !validRates(n.tarifas) || !Object.keys(n.tarifas).length || !validRates(n.gestor) || Object.entries(n.gestor).some(([k,v])=>v!==n.tarifas[k])) || new Set(nights.map(n=>n.noite)).size!==nights.length)
    return json(res,400,{error:"Confira as datas e os valores das tarifas selecionadas."});
  if(body.modelo!==modelo) return json(res,409,{error:"O modelo do hotel mudou. Recarregue o painel."});
  const gravado_em=new Date().toISOString();
  const source=hotel.code==="PLAZA" ? await require("./rms-web-regular").officialSource(client,hotel_id) : null;
  const pending=[];
  for(const {noite,tarifas,gestor} of nights){
    const record={hotel_id,noite,modelo,tarifas,gestor,gravado_por:profile.id,gravado_em};
    if(hotel.code==="PLAZA"){
      const web=source?.noites?.[noite] || {};
      if(!Object.keys(tarifas).every(k=>web[k]>0))
        return json(res,409,{error:"Aguardando WEB regular confirmado para "+noite+". Nenhuma noite gravada."});
      const quote=require("./rms-omnibees").quoteNight(noite,source,today);
      record.projecao_web={};
      for(const [key,target] of Object.entries(tarifas)){
        const site=quote.site?.[key];
        if(site?.divergence) return json(res,409,{error:"SITE do Calendário 360 diverge da derivação cadastrada em "+noite+". Confira a derivação antes de aprovar."});
        const proposed=require("../public/rms-plaza-tarifas").plazaWebTarget(web[key],site,target);
        if(!proposed) return json(res,409,{error:"WEB ou oferta SITE sem conferência em "+noite+" ("+key+"). Nenhuma noite gravada."});
        record.projecao_web[key]={webAnterior:web[key],siteAnterior:site.final,desconto:site.discount,oferta:site.offer,...proposed};
      }
    }
    pending.push(record);
  }
  const result=await client.from("rms_flutuacao_pendente").upsert(pending,{onConflict:"hotel_id,noite"});
  if(result.error) throw result.error;
  return json(res,200,{quantidade:nights.length});
};
