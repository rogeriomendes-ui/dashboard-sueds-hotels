const { createPortalClient, getProfileFromClient, json } = require("../../lib/portal-auth");
const { gunzipSync } = require("node:zlib");
const motor = require("../../lib/rms-motor");
const {addPeriods,newPeriod}=require("../../lib/rms-periodos");

function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const date = new Date(s);
  return Number.isFinite(+date) && date.toISOString().slice(0,10) === s;
}

module.exports = async function rms(req, res) {
  try {
    const client = createPortalClient(req,res);
    const profile = await getProfileFromClient(client);
    if (!profile) return json(res,401,{error:"Login necessário."});
    if (!profile.rms) return json(res,403,{error:"Acesso restrito."});
    if (!["GET","POST"].includes(req.method)) return json(res,405,{error:"Método inválido."});
    const analysis = JSON.parse(gunzipSync(Buffer.from(process.env.RMS_ANALISE_GZ, "base64")).toString("utf8"));
    analysis.conversaoDeskhotel = JSON.parse(process.env.RMS_CONVERSAO_DESKHOTEL || "{}");
    const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Bahia"});
    const {quoteNight}=require("../../lib/rms-omnibees");
    const hotels = await client.from("hotels").select("id,code,name").eq("status","active").is("deleted_at",null).order("name");
    if (hotels.error) throw hotels.error;
    if(req.method==="POST" && ["flutuacao_consultar","flutuacao_automatica","flutuacao_aplicar"].includes(req.body?.tipo))
      return await require("../../lib/rms-flutuacao")(client,req.body,hotels.data.find(h=>h.id===req.body.hotel_id),profile,today,analysis.rows.at(-1)[0],validDate,res);
    const competitors = await client.from("rms_concorrentes").select("hotel_id,nome,criterios").order("nome");
    if (competitors.error) throw competitors.error;
    const configs=competitors.data.map(c=>motor.configuration(c,hotels.data));
    const plaza=hotels.data.find(h=>h.code==="PLAZA");
    const catalog=process.env.RMS_PLAZA_NIVEIS_GZ && plaza
      ? JSON.parse(gunzipSync(Buffer.from(process.env.RMS_PLAZA_NIVEIS_GZ,"base64"))) : null;
    const reference=configs.find(c=>c.hotel_id===plaza?.id && c.nome.trim().toLowerCase()==="brisa da praia" && c.categoria==="Standard Plus");
    if (!reference) for (const row of analysis.rows) row[2]="";
    const live=req.method==="POST" && req.body?.tipo==="tarifas_plaza";
    const quotes={};
    if (req.body?.tipo==="concorrentes_painel" && req.method==="POST") {
      const nights=req.body.noites, hotel=hotels.data.find(h=>h.id===req.body.hotel_id);
      if (!hotel || !Array.isArray(nights) || !nights.length || nights.length>4 || !nights.every(d=>validDate(d) && d>=today && analysis.rows.some(r=>r[0]===d)))
        return json(res,400,{error:"Hotel ou período inválido."});
      const config=configs.find(c=>c.hotel_id===hotel.id && c.nome===req.body.nome);
      if (!config) return json(res,404,{error:"Concorrente não cadastrado para este hotel."});
      await Promise.all([...new Set(nights)].map(async d=>{
        try {quotes[d]=await motor.quote(config,d);} catch {quotes[d]="erro";}
      }));
      const rows=[];
      if (reference && hotel.id===plaza.id && config.nome===reference.nome) {
        for (const row of analysis.rows.filter(r=>nights.includes(r[0]))) {
          const current=req.body.standard?.[row[0]];
          row[1]=Number.isFinite(current) && current>0 ? current.toLocaleString("pt-BR",{minimumFractionDigits:2}) : "";
          row[2]=typeof quotes[row[0]]==="number" ? quotes[row[0]].toLocaleString("pt-BR",{minimumFractionDigits:2}) : "";
          rows.push(row);
        }
        require("../../lib/rms-pricing").recalculate(analysis);
      }
      return json(res,200,{quotes,rows});
    }
    const source=(live || req.method==="GET") ? await require("../../lib/rms-web-regular").officialSource(client,plaza?.id) : null;
    if (live) {
      const nights=req.body.noites;
      if (!Array.isArray(nights) || !nights.length || nights.length>4 ||
          !nights.every(d=>validDate(d) && d>=today && analysis.rows.some(r=>r[0]===d)))
        return json(res,400,{error:"Período fora da análise."});
      await Promise.all([...new Set(nights)].map(async d=>{
        try { quotes[d]=quoteNight(d,source); }
        catch { quotes[d]={error:true}; }
      }));
    }
    const rates=live ? quotes : Object.fromEntries(analysis.rows.map(r=>[r[0],quoteNight(r[0],source)]));
    for (const row of analysis.rows) {
      const rate=rates[row[0]];
      const current=rate?.site?.standard?.final;
      row[1]=current ? current.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) : "";
    }
    require("../../lib/rms-pricing").recalculate(analysis);
    if (live) return json(res,200,{rates,rows:analysis.rows.filter(r=>quotes[r[0]])});
    const readPeriods=()=>client.from("rms_faixas_festivas").select("hotel_id,nome,inicio,fim,pct0,pct50,pct60,pct70,pct80,gravado_em,gravado_por,base_origem,precos_duplo,niveis_pct").order("inicio");
    const periods=await readPeriods();
    if(periods.error) throw periods.error;
    if(catalog) addPeriods(catalog,periods.data,plaza.id);
    if (req.method === "POST") {
      if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) return json(res,415,{error:"Envie JSON."});
      const body = req.body;
      if (body?.tipo === "cotacao") {
        if (!validDate(body.noite) || typeof body.nome !== "string" || !hotels.data.some(h=>h.id===body.hotel_id))
          return json(res,400,{error:"Selecione um concorrente e uma noite."});
        const result = await client.from("rms_concorrentes").select("hotel_id,nome,criterios").eq("hotel_id",body.hotel_id).eq("chave",body.nome.trim().toLowerCase()).maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) return json(res,404,{error:"Concorrente não encontrado."});
        const c = motor.configuration(result.data,hotels.data);
        if (!c.motor_url || !c.categoria) return json(res,400,{error:"Cadastre o motor e a categoria."});
        try { return json(res,200,{preco:await motor.quote(c,body.noite)}); }
        catch (err) { return json(res,502,{error:err.message==="A consulta deste motor ainda não está integrada." ? err.message : "Não foi possível confirmar a tarifa no motor."}); }
      }
      if(body?.tipo==="novo_periodo"){
        const hotel=hotels.data.find(h=>h.id===body.hotel_id);
        const record=hotel && newPeriod(body,hotel.code==="PLAZA",catalog,validDate);
        if(!record) return json(res,400,{error:"Confira o nome, as datas, a base e as cinco faixas."});
        const result=await client.from("rms_faixas_festivas").insert(record);
        if(["23505","23P01"].includes(result.error?.code))
          return json(res,409,{error:"Já existe um tarifário para uma ou mais noites desse período."});
        if(result.error) throw result.error;
        return json(res,201,{inicio:record.inicio});
      } else if (body?.tipo === "grade_plaza") {
        const {hotel_id,base,plano,quarto,pax,dia,valor}=body;
        const parent=catalog?.bases.find(b=>b.name===base);
        if (!plaza || hotel_id!==plaza.id || !Number.isInteger(plano) || !parent?.grids[plano]?.[quarto]?.[pax-1] ||
            !["standard","luxo","suite"].includes(quarto) || !Number.isInteger(pax) || !Number.isInteger(dia) || dia<0 || dia>6 ||
            !Number.isFinite(valor) || valor<=0 || valor>=1e8 || Number(valor.toFixed(2))!==valor)
          return json(res,400,{error:"Confira os campos da grade."});
        const saved=await client.from("rms_grade_tarifaria").upsert({hotel_id,base,plano,quarto,pax,dia,valor},{onConflict:"hotel_id,base,plano,quarto,pax,dia"});
        if(saved.error) throw saved.error;
      } else if (body?.tipo === "faixa_festiva") {
        const fields=["pct0","pct50","pct60","pct70","pct80"];
        if (!hotels.data.some(h=>h.id===body.hotel_id) || !validDate(body.inicio) || !fields.every(k=>Number.isFinite(body[k]) && body[k]>=0 && body[k]<=99999 && Number(body[k].toFixed(2))===body[k]))
          return json(res,400,{error:"Confira o período e os percentuais."});
        if (body.hotel_id===plaza?.id && !fields.every(k=>catalog?.bases[catalog.periods[body.inicio]]?.levels.some(l=>l.pct===body[k])))
          return json(res,400,{error:"Selecione um nível cadastrado para cada faixa."});
        const saved=await client.from("rms_faixas_festivas").update(Object.fromEntries(fields.map(k=>[k,body[k]]))).eq("hotel_id",body.hotel_id).eq("inicio",body.inicio).select("inicio,pct0,pct50,pct60,pct70,pct80,gravado_em,gravado_por").maybeSingle();
        if (saved.error) throw saved.error;
        if (!saved.data) return json(res,404,{error:"Período não cadastrado."});
        const changed=periods.data.find(p=>p.inicio===body.inicio && p.hotel_id===body.hotel_id);
        if(changed) Object.assign(changed,saved.data);
      } else if (body?.tipo === "modelo") {
        if (!hotels.data.some(h=>h.id===body.hotel_id) || !["proprio","beeprice"].includes(body.modelo))
          return json(res,400,{error:"Hotel ou modelo inválido."});
        const saved=await client.from("rms_politicas").upsert({hotel_id:body.hotel_id,modelo:body.modelo},{onConflict:"hotel_id"});
        if(saved.error) throw saved.error;
      } else if (body?.tipo === "politica") {
        if (body.modelo!==undefined && !["beeprice","proprio"].includes(body.modelo))
          return json(res,400,{error:"Modelo indisponível para este hotel."});
        const fields = ["piso","pct50","pct60","pct70","pct80","pct90"];
        if (!hotels.data.some(h=>h.id===body.hotel_id) || !fields.every(key=>{
          const v=body[key];
          return v===null || (Number.isFinite(v) && Number(v.toFixed(2))===v &&
            (key==="piso" ? v>0 && v<1e10 : v>=0 && v<1e6));
        })) return json(res,400,{error:"Confira o hotel, o piso e os percentuais."});
        const saved=await client.from("rms_politicas").upsert({
          hotel_id:body.hotel_id,...(body.modelo!==undefined ? {modelo:body.modelo} : {}),...Object.fromEntries(fields.map(key=>[key,body[key]]))
        },{onConflict:"hotel_id"});
        if (saved.error) throw saved.error;
      } else if (body?.tipo === "concorrente") {
        const {hotel_id, nome, criterios} = body;
        if (!hotels.data.some(h => h.id === hotel_id) || typeof nome !== "string" ||
            !nome.trim() || nome.trim().length > 120 || typeof criterios !== "string" || criterios.length > 500)
          return json(res,400,{error:"Confira o hotel, o nome do concorrente e os critérios."});
        const {motor_url,categoria} = body;
        if (typeof motor_url!=="string" || typeof categoria!=="string" || !categoria.trim() || categoria.trim().length>120 ||
            !URL.canParse(motor_url) || new URL(motor_url).protocol!=="https:" || new URL(motor_url).username || new URL(motor_url).password)
          return json(res,400,{error:"Informe o link HTTPS público do motor e a categoria."});
        const config = JSON.stringify({rms:1,criterios:criterios.trim(),motor_url:motor_url.trim(),categoria:categoria.trim()});
        if (config.length>500) return json(res,400,{error:"Encurte o link ou os critérios para salvar o cadastro."});
        const result = await client.from("rms_concorrentes").upsert(
          {hotel_id, nome:nome.trim(), criterios:config}, {onConflict:"hotel_id,chave"});
        if (result.error) throw result.error;
      } else {
      const { hotel_id,inicio,fim,valor } = body || {};
      if (!hotels.data.some(h=>h.id===hotel_id) || !validDate(inicio) || !validDate(fim) || fim<inicio ||
          typeof valor!=="number" || !Number.isFinite(valor) || valor<=0 || valor>=1e10 || Number(valor.toFixed(2))!==valor)
        return json(res,400,{error:"Confira hotel, período e valor em reais."});
      const saved = await client.from("rms_pisos").upsert({hotel_id,inicio,fim,valor},{onConflict:"hotel_id,inicio,fim"});
      if (saved.error) throw saved.error;
      }
    }
    const floors = await client.from("rms_pisos").select("hotel_id,inicio,fim,valor,incluido_em,incluido_por,gravado_em,gravado_por").order("inicio");
    if (floors.error) throw floors.error;
    const policies=await client.from("rms_politicas").select("hotel_id,modelo,piso,pct50,pct60,pct70,pct80,pct90,gravado_em,gravado_por");
    if (policies.error) throw policies.error;
    if (catalog) {
      catalog.edits={};
      for(let offset=0; ;offset+=500) {
        const page=await client.from("rms_grade_tarifaria").select("base,plano,quarto,pax,dia,valor").eq("hotel_id",plaza.id)
          .order("base").order("plano").order("quarto").order("pax").order("dia").range(offset,offset+499);
        if(page.error) throw page.error;
        for(const e of page.data) catalog.edits[JSON.stringify([e.base,e.plano,e.quarto,e.pax,e.dia])]=Number(e.valor);
        if(page.data.length<500) break;
      }
    }
    return json(res,200,{catalog,analysis,rates,today,hotels:hotels.data,floors:floors.data,policies:policies.data,competitors:configs,periods:periods.data});
  } catch {
    return json(res,500,{error:"Falha ao consultar ou salvar dados do RMS."});
  }
};
