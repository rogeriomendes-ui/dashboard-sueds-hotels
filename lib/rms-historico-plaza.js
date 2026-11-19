const RmsRules=require("../public/rms-rules");
const {gunzipSync}=require("node:zlib");
const {addPeriods}=require("./rms-periodos");
const {officialSource}=require("./rms-web-regular");
const {plazaLevelComparison,beeWebDecision}=require("../public/rms-levels");

function snapshot(day,periods,catalog,web) {
  const period=RmsRules.forNight(periods,day.date);
  const target=plazaLevelComparison(catalog,period,day.date,day.rate);
  const rule=RmsRules.band(period,day.rate);
  const band=rule ? `${rule.de}% a ${rule.ate}%` : null;
  const hold=day.rate>=100 || !!period?.bloqueado;
  const {prices,retained}=beeWebDecision(target,web?.noites?.[day.date],hold);
  return {noite:day.date,captura:day.capturedAt,ocupacao:day.rate,periodo:period?.nome||null,
    faixa:period?band:null,nivel:hold?null:target.level?.code||null,
    situacao:hold?"Manter vigente":!period?"Sem período":!target.level?"Sem nível":retained.length?"Mantida WEB vigente: "+retained.join(", "):Object.values(prices).every(v=>v==null)?"Sem WEB vigente":"Simulada",
    standard:prices?.standard??null,luxo:prices?.luxo??null,suite:prices?.suite??null};
}

async function record() {
  const {createClient}=require("@supabase/supabase-js");
  const db=createClient(process.env.PORTAL_SUPABASE_URL||"https://pjcmjytiovuukbkewxjj.supabase.co",process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY);
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Bahia"});
  const days=(await require("../server").plazaRmsOccupancy(today)).filter(d=>d.capturedAt && d.rate!=null);
  if (!days.length) return 0;
  const {data:hotel}=await db.from("hotels").select("id").eq("code","PLAZA").single().throwOnError();
  const catalog=JSON.parse(gunzipSync(Buffer.from(process.env.RMS_PLAZA_NIVEIS_GZ,"base64")));
  const [{data:legacyPeriods},web]=await Promise.all([
    db.from("rms_faixas_festivas").select("hotel_id,nome,inicio,fim,pct0,pct50,pct60,pct70,pct80,base_origem,precos_duplo,niveis_pct").eq("hotel_id",hotel.id).order("inicio").throwOnError(),
    officialSource(db,hotel.id)
  ]);
  const periods=RmsRules.withBlocks(RmsRules.overlay(legacyPeriods,(await require("./rms-conjuntos").read(db)).filter(c=>c.hotel_id===hotel.id)),(await require("./rms-bloqueios").read(db)).filter(b=>b.hotel_id===hotel.id));
  addPeriods(catalog,legacyPeriods,hotel.id);
  catalog.edits={};
  for(let offset=0;;offset+=500){
    const {data}=await db.from("rms_grade_tarifaria").select("base,plano,quarto,pax,dia,valor").eq("hotel_id",hotel.id).eq("plano",0).eq("pax",2).order("base").order("quarto").order("dia").range(offset,offset+499).throwOnError();
    for(const e of data) catalog.edits[JSON.stringify([e.base,0,e.quarto,2,e.dia])]=Number(e.valor);
    if(data.length<500) break;
  }
  const rows=days.map(day=>snapshot(day,periods,catalog,web));
  await db.from("rms_plaza_historico_simulacao").upsert(rows,{onConflict:"noite,captura",ignoreDuplicates:true}).throwOnError();
  return rows.length;
}
module.exports={record,snapshot};
