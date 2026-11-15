const {json}=require("./portal-auth");

module.exports=async function fluctuation(client,body,hotel,profile,today,end,validDate,res){
  if(!hotel) return json(res,400,{error:"Hotel inválido."});
  const hotel_id=hotel.id;
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
  const policy=await client.from("rms_politicas").select("modelo").eq("hotel_id",hotel_id).maybeSingle();
  if(policy.error) throw policy.error;
  const modelo=policy.data?.modelo || "beeprice";
  if(body.modelo!==modelo) return json(res,409,{error:"O modelo do hotel mudou. Recarregue o painel."});
  const gravado_em=new Date().toISOString();
  const result=await client.from("rms_flutuacao_pendente").upsert(nights.map(({noite,tarifas,gestor})=>({hotel_id,noite,modelo,tarifas,gestor,gravado_por:profile.id,gravado_em})),{onConflict:"hotel_id,noite"});
  if(result.error) throw result.error;
  return json(res,200,{quantidade:nights.length});
};
