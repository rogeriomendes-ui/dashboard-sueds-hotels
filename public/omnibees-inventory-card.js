(function(){
 const status=document.getElementById('inventoryLastStatus');if(!status)return;let loading=false;
 async function reload(){if(loading||document.hidden)return;loading=true;try{
  const response=await fetch('/api/portal/omnibees-inventory-import',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('status');const value=await response.json(),r=value.result||{};
  if(value.status==='aguardando'){status.textContent='Aguardando primeira carga';status.dataset.state='aguardando';document.getElementById('inventoryLastDate').textContent='Última carga: sem registro';return;}
  if(value.status!=='concluido'||value.mode!=='production'||!r.verified)throw Error('unverified');
  status.textContent='Concluído';status.dataset.state='concluido';document.getElementById('inventoryLastDate').textContent='Última carga: '+new Date(value.finished).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
  document.getElementById('inventoryLastDetails').textContent=`${r.from} a ${r.to} · ${r.hotels} hotéis · ${r.days} dias · ${r.found.toLocaleString('pt-BR')} registros · ${r.stopSales} Stop Sales · Mapa conferido`;
 }catch{status.textContent='Status indisponível';status.dataset.state='indisponivel';}finally{loading=false;}}
 Promise.resolve(window.suedsManagerAuthReady).then(profile=>{if(!profile?.roles?.includes('admin_geral'))return;void reload();setInterval(reload,60000);document.addEventListener('visibilitychange',reload);}).catch(()=>{});
})();
