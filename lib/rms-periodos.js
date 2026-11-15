const bands=["pct0","pct50","pct60","pct70","pct80"];
const rooms=["standard","luxo","suite"];

function addPeriods(catalog,periods,hotelId) {
  for(const p of periods.filter(p=>p.hotel_id===hotelId && p.precos_duplo)){
    const code="LOCAL-"+p.inicio.replaceAll("-","");
    const name=p.nome+" ("+code+")";
    const levels=[...new Set([0,...p.niveis_pct.map(Number)])].map(pct=>({
      name:pct ? name+" +"+pct+"%" : name,code:pct ? code+"+"+pct : code,pct
    }));
    const grid=Object.fromEntries(rooms.map((key,i)=>[key,[null,Number(p.precos_duplo[i])]]));
    catalog.periods[p.inicio]=catalog.bases.length;
    catalog.bases.push({code,name,levels,grids:[grid]});
  }
  for(const p of periods.filter(p=>p.hotel_id===hotelId && p.base_origem)){
    const index=catalog.bases.findIndex(base=>base.name===p.base_origem);
    if(index>=0) catalog.periods[p.inicio]=index;
  }
}

function newPeriod(body,isPlaza,catalog,validDate){
  const {hotel_id,inicio,fim}=body;
  const nome=typeof body.nome==="string" ? body.nome.trim() : "";
  if(!nome || nome.length>120 || !validDate(inicio) || !validDate(fim) || fim<inicio) return null;
  const precise=(n,max)=>Number.isFinite(n) && n>=0 && n<max && Number(n.toFixed(2))===n;
  const percentages=bands.map(b=>body[b]);
  if(!percentages.every(n=>precise(n,100000))) return null;
  const record={hotel_id,inicio,fim,nome,...Object.fromEntries(bands.map(b=>[b,body[b]]))};
  if(!isPlaza) return record;
  if(!catalog) return null;
  if(body.base_origem){
    const base=catalog.bases.find(b=>b.name===body.base_origem);
    if(!base || !percentages.every(pct=>base.levels.some(l=>l.pct===pct))) return null;
    return {...record,base_origem:base.name};
  }
  const rates=body.precos_duplo;
  if(!Array.isArray(rates) || rates.length!==3 || !rates.every(n=>precise(n,1e8) && n>0)) return null;
  return {...record,precos_duplo:rates,niveis_pct:percentages};
}
module.exports={addPeriods,newPeriod};
