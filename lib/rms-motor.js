const origin = "https://hotels.chatbooking.com.br";
const brisaUrl = origin + "/?hotelId=0005&hotelkey=0005775422857542a592a666653";

function configuration(c, hotels) {
  let config;
  try { config = JSON.parse(c.criterios); } catch {}
  if (config?.rms === 1) return {...c, criterios:config.criterios, motor_url:config.motor_url, categoria:config.categoria};
  const brisa = c.nome.trim().toLowerCase() === "brisa da praia" && hotels.some(h=>h.id===c.hotel_id && h.code==="PLAZA");
  return {...c, motor_url:brisa ? brisaUrl : "", categoria:brisa ? "Standard Plus" : ""};
}

async function quote(c, night) {
  const url = new URL(c.motor_url);
  const hotelId = url.searchParams.get("hotelId"), hotelKey = url.searchParams.get("hotelkey");
  if (url.origin !== origin || !hotelId || !hotelKey) throw Error("A consulta deste motor ainda não está integrada.");
  const end = new Date(night);
  end.setUTCDate(end.getUTCDate()+1);
  const params = new URLSearchParams({hotelId,hotelKey,startDate:night,endDate:end.toISOString().slice(0,10),adults:"2",children:"0",childrenAges:""});
  const response = await fetch(origin+"/api/proxy/rates?"+params,{redirect:"error",signal:AbortSignal.timeout(14000)});
  if (!response.ok) throw Error("Motor indisponível. Tente novamente.");
  const data = await response.json();
  if (!data.rates || data.hotelId !== hotelId) throw Error("O motor não confirmou a consulta.");
  const offers = (data.rates[night] || []).filter(r=>r.roomName?.trim().toLowerCase()===c.categoria.toLowerCase() &&
    String(r.meal)==="1" && r.dispo>0 && r.minimumStay<=1 && !r.rulesCheckin && !r.rulesCheckout && Number(r.pax2)>0);
  const prices = offers.map(r=>{
    const discounts=(r.promo || []).filter(p=>{
      const dates=String(p.range).match(/\d{4}-\d{2}-\d{2}/g);
      return dates?.length===2 && dates[0]<=night && night<=dates[1] && p.limit>=new Date().toISOString().slice(0,10) && Number(p.discount)>0 && Number(p.discount)<100;
    }).map(p=>Number(p.discount));
    return Math.round(Number(r.pax2)*(100-Math.max(0,...discounts)))/100;
  });
  return prices.length ? Math.min(...prices) : null;
}
module.exports={configuration,quote};
