(function(){
  const form=document.getElementById('inventoryForm'),input=document.getElementById('inventoryFiles'),button=document.getElementById('inventorySubmit'),message=document.getElementById('inventoryMessage');
  form.addEventListener('submit',async event=>{
    event.preventDefault();button.disabled=true;input.disabled=true;
    try{
      const files=[...input.files];
      if(!files.length || files.length>100 || files.reduce((n,f)=>n+f.size,0)>3*1024*1024)throw Error('Selecione uma amostra de até 3 MiB.');
      const chunks=[]; let original;
      for(const file of files){const value=JSON.parse(await file.text());if(value.schema_version===1){if(files.length!==1)throw Error('Envie uma amostra original por vez.');original=value;continue;}if(value.version!==1 || !Array.isArray(value.chunks))throw Error('Formato não reconhecido. Preserve a amostra original para adaptação.');chunks.push(...value.chunks);}
      message.textContent='Validando inventário e Stop Sales WEB…';
      const response=await fetch('/api/portal/omnibees-inventory-test',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(original || {version:1,chunks})});
      if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Conexão interrompida. Preserve os arquivos.');
      const value=await response.json();if(!response.ok)throw Error(value.error);
      if(value.mode!=='preview'||value.productionChanged!==false||value.status!=='validado')throw Error('Resultado não confirmado.');
      message.textContent=`${value.fullCoverage?'Cobertura completa validada em teste.':'Amostra parcial validada em teste.'} ${value.result.hotels} hotéis · ${value.result.found} registros · ${value.result.stopSales} datas/categorias com Stop Sales · ${value.result.from} a ${value.result.to}. Nenhuma base foi alterada.`;
    }catch(error){message.textContent=error.message || 'Falha ao validar a amostra.';}finally{button.disabled=false;input.disabled=false;}
  });
  Promise.resolve(window.suedsManagerAuthReady).then(profile=>{if(!profile?.roles?.includes('admin_geral')){message.textContent='Acesso restrito aos administradores.';return;}form.hidden=false;message.textContent='Ambiente de teste. Selecione a amostra do Dot para conferência.';}).catch(()=>{message.textContent='Entre no Portal para validar a amostra.';});
})();

