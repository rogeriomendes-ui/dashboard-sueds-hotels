(function(){
 const form=document.getElementById('inventoryForm'),input=document.getElementById('inventoryFiles'),button=document.getElementById('inventorySubmit'),message=document.getElementById('inventoryMessage');
 const hex=b=>[...new Uint8Array(b)].map(n=>n.toString(16).padStart(2,'0')).join('');
 const sha=async b=>hex(await crypto.subtle.digest('SHA-256',b));
 async function request(body){const response=await fetch('/api/portal/omnibees-inventory-import',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error||'Falha no envio.');return value;}
 form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;input.disabled=true;try{
  const files=[...input.files];if(!files.length||files.length>100||files.reduce((n,f)=>n+f.size,0)>30*1024*1024)throw Error('Selecione um lote completo de até 30 MiB.');
  const chunks=[];for(const f of files){const v=JSON.parse((await f.text()).replace(/^\uFEFF/,''));if(v.version!==1||!Array.isArray(v.chunks))throw Error('Use o formato completo version/chunks.');chunks.push(...v.chunks);}
  if(!chunks.length||chunks.length>100)throw Error('Quantidade de lotes inválida.');
  chunks.sort((a,b)=>String(a.hotelId).localeCompare(String(b.hotelId))||String(a.period?.from).localeCompare(String(b.period?.from)));
  const from=chunks.map(c=>c.period?.from).sort()[0],to=chunks.map(c=>c.period?.to).sort().at(-1),parts=[];let group=[];
  const encode=items=>new TextEncoder().encode(JSON.stringify({version:1,chunks:items}));
  for(const c of chunks){if(encode([c]).length>2800000)throw Error('Um lote excede o limite de envio. Preserve o original.');if(group.length&&encode([...group,c]).length>2800000){parts.push(encode(group));group=[];}group.push(c);}if(group.length)parts.push(encode(group));
  const manifest={from,to,files:await Promise.all(parts.map(async b=>({bytes:b.length,sha256:await sha(b)})))};
  const key='omnibees-inventory-'+await sha(new TextEncoder().encode(JSON.stringify(manifest))),importId=sessionStorage.getItem(key)||crypto.randomUUID();sessionStorage.setItem(key,importId);
  message.textContent='Preparando lote completo…';await request({action:'manifest',importId,manifest});
  for(let i=0;i<parts.length;i++){message.textContent=`Enviando parte ${i+1} de ${parts.length}…`;let binary='';for(let start=0;start<parts[i].length;start+=8192)binary+=String.fromCharCode(...parts[i].subarray(start,start+8192));await request({action:'file',importId,index:i,data:btoa(binary)});}
  message.textContent='Conferindo cobertura, Stop Sales e atualização do mapa…';const value=await request({action:'complete',importId});
  if(value.status!=='concluido'||value.mode!=='production'||!value.result.verified)throw Error('Publicação ainda não confirmada. Preserve os arquivos.');
  const r=value.result;message.textContent=`Mapa Omnibees atualizado e conferido. ${r.hotels} hotéis · ${r.days} dias · ${r.found.toLocaleString('pt-BR')} registros · ${r.stopSales} Stop Sales. KPI e Azul/Juniper preservados.`;
 }catch(e){message.textContent=e.message||'Falha ao enviar. Preserve os arquivos.';}finally{button.disabled=false;input.disabled=false;}});
 Promise.resolve(window.suedsManagerAuthReady).then(profile=>{if(!profile?.roles?.includes('admin_geral')){message.textContent='Acesso restrito aos administradores.';return;}form.hidden=false;message.textContent='Produção: selecione o JSON completo ou todas as partes do mesmo lote.';}).catch(()=>{message.textContent='Entre no Portal para continuar.';});
})();
