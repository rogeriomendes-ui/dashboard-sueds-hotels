async function officialSource(client, hotelId) {
  if (!hotelId) return null;
  const {data,error}=await client.from("rms_grade_web_simulacao").select("grade").eq("hotel_id",hotelId).maybeSingle();
  if (error) throw error;
  const source=data?.grade;
  if (source?.hotel!=="PLAZA" || source.plano!=="WEB" || source.regime!=="CAFÉ DA MANHÃ" ||
      source.adultos!==2 || source.criancas!==0) return null;
  return source;
}
module.exports={officialSource};
