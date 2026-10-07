(() => {
  const $ = (id) => document.getElementById(id);
  const modulesView = document.documentElement.dataset.trainingAdminView === 'modules';
  if (modulesView) {
    document.title = 'Gerenciar módulos | Centro de Conhecimentos SUEDS';
    $('editor-page-title').textContent = 'Gerenciar módulos';
    $('editor-page-description').textContent = 'Organize os módulos e publique os POPs do Centro de Conhecimentos.';
  }
  const notice = (message, error = false) => { $('notice').textContent = message; $('notice').hidden = false; $('notice').classList.toggle('error', error); };
  const actionNotice = (message, error = false) => { const target=$('action-notice'); target.textContent=message; target.hidden=false; target.classList.toggle('error',error); };
  const popNotice = (message, error = false) => { const target=$('pop-notice'); target.textContent=message; target.hidden=false; target.classList.toggle('error',error); };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let docs = [], modules = [], canPublish = false;
  async function request(url, options) { const response = await fetch(url, { credentials:'same-origin', cache:'no-store', ...options }); const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Não foi possível concluir a operação.'); return data; }
  function mediaRows(items = []) { $('media-list').replaceChildren(); (items.length ? items : [{type:'imagem',url:''}]).forEach(addMedia); }
  function addMedia(item = {}) {
    const row = document.createElement('div'); row.className='media-row'; row.dataset.path=item.path||'';
    row.innerHTML=`<select aria-label="Tipo"><option value="imagem" ${item.type==='imagem'?'selected':''}>imagem</option><option value="video" ${item.type==='video'?'selected':''}>vídeo</option></select><input class="media-url" aria-label="URL" placeholder="https://…" value="${escapeHtml(item.url||'')}"><input class="media-file" aria-label="Enviar arquivo" type="file"><button type="button" aria-label="Remover">×</button>`;
    const select=row.querySelector('select'), file=row.querySelector('.media-file'), url=row.querySelector('.media-url');
    const setAccept=()=>{ file.accept=select.value==='video'?'video/mp4,video/webm,video/ogg,.mp4,.webm,.ogg':'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif'; };
    setAccept(); select.onchange=setAccept;
    file.onchange=()=>{ if(file.files.length) url.value=''; };
    url.oninput=()=>{ if(url.value.trim()) file.value=''; };
    row.querySelector('button').onclick=()=>row.remove(); $('media-list').append(row);
  }
  function values() { return { id:$('document-id').value, title:$('title').value, module:$('module').value, documentType:$('document-type').value, summary:$('summary').value, contentMarkdown:$('content').value, changeNote:$('change-note').value, media:[...document.querySelectorAll('.media-row')].map((r)=>({type:r.querySelector('select').value,url:r.querySelector('.media-url').value.trim(),path:r.dataset.path||'',caption:''})).filter((m)=>m.url||m.path) }; }
  async function uploadMedia(documentId) {
    const rows=[...document.querySelectorAll('.media-row')].filter((row)=>row.querySelector('.media-file').files.length);
    for(const [index,row] of rows.entries()) {
      const file=row.querySelector('.media-file').files[0], type=row.querySelector('select').value;
      const allowed=type==='video'?['video/mp4','video/webm','video/ogg']:['image/jpeg','image/png','image/webp','image/gif'];
      const max=type==='video'?500*1024*1024:20*1024*1024;
      if(!allowed.includes(file.type)||!file.size||file.size>max) throw new Error(type==='video'?'Escolha um vídeo MP4, WebM ou OGG de até 500 MB.':'Escolha uma imagem JPG, PNG, WebP ou GIF de até 20 MB.');
      $('media-notice').textContent=`Enviando ${type==='video'?'vídeo':'imagem'} ${index+1} de ${rows.length}…`;
      const ticket=await request('/api/knowledge?action=document-media-upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({documentId,type,mimeType:file.type,size:file.size})});
      const form=new FormData(); form.append('cacheControl','3600'); form.append('',file);
      const uploaded=await fetch(ticket.signedUrl,{method:'PUT',body:form});
      if(!uploaded.ok) throw new Error('Não foi possível enviar o arquivo. Tente novamente.');
      row.dataset.path=ticket.path; row.querySelector('.media-file').value='';
    }
  }
  function fill(d) { const v=d.versions?.[0]||{}; $('document-id').value=d.id; $('title').value=d.title; if (![...$('module').options].some((option)=>option.value===d.module)) $('module').add(new Option(d.module, d.module)); $('module').value=d.module; $('document-type').value=d.document_type; $('summary').value=v.summary||''; $('content').value=v.content_markdown||''; $('change-note').value=''; mediaRows(d.metadata?.pending?.media||d.metadata?.media||[]); $('save-draft').textContent='Salvar alterações'; window.scrollTo({top:0,behavior:'smooth'}); }
  function renderModules() {
    $('module').innerHTML=modules.filter((m)=>m.active).map((m)=>`<option value="${escapeHtml(m.slug)}">${escapeHtml(m.name)}</option>`).join('');
    $('module-list').innerHTML=modules.map((m)=>`<form class="module-row" data-id="${escapeHtml(m.id)}"><div><strong>${escapeHtml(m.slug)}</strong><small>Identificador permanente</small></div><label>Nome<input name="name" maxlength="80" required value="${escapeHtml(m.name)}"></label><label>Descrição<input name="description" maxlength="500" value="${escapeHtml(m.description)}"></label><label>Ordem<input name="sortOrder" type="number" value="${m.sort_order}"></label><label class="module-active"><input name="active" type="checkbox" ${m.active?'checked':''}>Ativo</label><button class="secondary small" type="submit">Salvar</button></form>`).join('');
    document.querySelectorAll('.module-row').forEach((form)=>form.onsubmit=async(e)=>{ e.preventDefault(); try { await request('/api/knowledge?action=modules',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:form.dataset.id,name:form.elements.name.value,description:form.elements.description.value,sortOrder:Number(form.elements.sortOrder.value),active:form.elements.active.checked})}); notice('Módulo atualizado.'); await loadModules(); } catch(error) { notice(error.message,true); } });
  }
  async function loadModules() { const result=await request('/api/knowledge?action=modules'); modules=result.modules||[]; renderModules(); const selected=new URLSearchParams(location.search).get('module'); if(selected && [...$('module').options].some((option)=>option.value===selected)) $('module').value=selected; const previous=$('pop-module').value; $('pop-module').innerHTML=modules.filter((m)=>m.active).map((m)=>`<option value="${escapeHtml(m.slug)}">${escapeHtml(m.name)}</option>`).join(''); $('pop-module').value=selected||previous||modules[0]?.slug||''; await loadPop(); }
  async function loadPop() { const slug=$('pop-module').value; if(!slug) return; const result=await request(`/api/knowledge?action=pop&module=${encodeURIComponent(slug)}&summary=1`); const pop=result.pop; $('pop-current').innerHTML=pop?`Publicado: ${escapeHtml(pop.name)} · versão ${pop.version} · ${new Date(pop.publishedAt).toLocaleString('pt-BR')} · <a href="/treinamentos-pop.html?module=${encodeURIComponent(slug)}">Visualizar página do POP</a>`:'Nenhum POP publicado neste módulo.'; const readers=result.readers||[]; $('pop-readers').innerHTML=pop?`<details><summary>${readers.length} colaborador${readers.length===1?'':'es'} confirmou${readers.length===1?'':'aram'} a leitura</summary><ul>${readers.length?readers.map((r)=>`<li>${escapeHtml(r.name)} · ${escapeHtml(r.email)} · ${new Date(r.readAt).toLocaleString('pt-BR')}</li>`).join(''):'<li>Nenhuma confirmação ainda.</li>'}</ul></details>`:''; }
  $('pop-module').onchange=()=>loadPop().catch((error)=>notice(error.message,true));
  $('pop-form').onsubmit=async(e)=>{
    e.preventDefault();
    const file=$('pop-file').files?.[0], slug=$('pop-module').value;
    if(!slug) { popNotice('Escolha o módulo do POP.',true); $('pop-module').focus(); return; }
    if(!file) { popNotice('Escolha um arquivo Word (.docx) ou PDF antes de publicar.',true); $('pop-file').focus(); return; }
    const extension=file.name.split('.').pop().toLowerCase();
    const type={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}[extension];
    if(!type) { popNotice('Use um arquivo .docx ou .pdf.',true); return; }
    if(file.size>(extension==='pdf'?25:3)*1024*1024) { popNotice(extension==='pdf'?'O PDF deve ter até 25 MB.':'O Word deve ter até 3 MB.',true); return; }
    const button=$('pop-form').querySelector('button[type="submit"]'); button.disabled=true;
    try {
      popNotice('Preparando o envio do POP…');
      const ticket=await request(`/api/knowledge?action=pop&module=${encodeURIComponent(slug)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'upload',type,size:file.size})});
      popNotice('Enviando arquivo…');
      const normalizedFile=new File([file],file.name,{type});
      const form=new FormData(); form.append('cacheControl','3600'); form.append('',normalizedFile);
      const uploaded=await fetch(ticket.signedUrl,{method:'PUT',body:form});
      if(!uploaded.ok) { let detail=''; try { detail=(await uploaded.json()).message||''; } catch (_) {} throw new Error(detail||'Não foi possível enviar o arquivo.'); }
      popNotice('Arquivo enviado. Publicando o POP…');
      await request(`/api/knowledge?action=pop&module=${encodeURIComponent(slug)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'publish',path:ticket.path,type,name:file.name})});
      $('pop-file').value=''; popNotice('POP publicado. O link de leitura já está no card do módulo.'); await loadPop();
    } catch(error) { popNotice(error.message||'Não foi possível publicar o POP.',true); }
    finally { button.disabled=false; }
  };
  async function loadDocs() { const result=await request('/api/knowledge'); if(!result.canEdit) { location.replace('/Treinamentos'); return; } docs=result.documents||[]; canPublish=Boolean(result.canPublish); $('publish').hidden=!canPublish; $('documents').innerHTML=docs.length?docs.map((d)=>`<button type="button" class="doc-item" data-id="${escapeHtml(d.id)}"><strong>${escapeHtml(d.title)}</strong><small>${escapeHtml(d.module)} · atualizado em ${new Date(d.updated_at).toLocaleDateString('pt-BR')}</small><span class="status-pill">${escapeHtml(d.status.toUpperCase())}</span></button>`).join(''):'<p class="helper">Nenhum conteúdo criado ainda.</p>'; document.querySelectorAll('.doc-item').forEach((el)=>el.onclick=()=>fill(docs.find((d)=>d.id===el.dataset.id))); const selected=new URLSearchParams(location.search).get('edit'); if(selected) { const doc=docs.find((d)=>d.id===selected); if(doc) fill(doc); } }
  async function save(status) {
    const value=values();
    if(!value.title) { actionNotice('Preencha o título antes de continuar.',true); $('title').focus(); return; }
    if(!value.contentMarkdown) { actionNotice('Preencha o conteúdo antes de continuar.',true); $('content').focus(); return; }
    if(!value.module) { actionNotice('Escolha um módulo antes de continuar.',true); $('module').focus(); return; }
    const buttons=[$('save-draft'),$('send-review'),$('publish')];
    buttons.forEach((button)=>button.disabled=true);
    actionNotice(status==='published'?'Publicando conteúdo…':status==='review'?'Enviando para revisão…':'Salvando rascunho…');
    try {
      const wasNew=!value.id;
      if(wasNew) {
        const created=await request('/api/knowledge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...value,status:'draft'})});
        value.id=created.id;
        $('document-id').value=created.id;
        history.replaceState(null,'',`?edit=${encodeURIComponent(created.id)}`);
      }
      await uploadMedia(value.id);
      const savedValue=values();
      if(!wasNew || status!=='draft' || savedValue.media.some((item)=>item.path)) await request('/api/knowledge',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...savedValue,id:value.id,status})});
      $('media-notice').textContent='';
      actionNotice(status==='published'?'Conteúdo publicado.':status==='review'?'Conteúdo enviado para revisão.':'Rascunho salvo.');
      await loadDocs();
    } catch(error) { actionNotice(error.message || 'Não foi possível salvar o conteúdo.',true); }
    finally { buttons.forEach((button)=>button.disabled=false); }
  }
  $('module-form').onsubmit=async(e)=>{ e.preventDefault(); try { await request('/api/knowledge?action=modules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('module-name').value,description:$('module-description').value})}); $('module-form').reset(); notice('Módulo criado.'); await loadModules(); } catch(error) { notice(error.message,true); } };
  $('add-media').onclick=()=>{ addMedia(); $('media-notice').textContent='Mídia adicionada. Envie um arquivo ou informe um link.'; };
  $('new-content').onclick=()=>{ $('content-form').reset(); $('document-id').value=''; history.replaceState(null,'',location.pathname); mediaRows(); $('save-draft').textContent='Salvar rascunho'; $('action-notice').hidden=true; $('media-notice').textContent=''; };
  $('content-form').onsubmit=(e)=>{e.preventDefault();save('draft');};
  $('send-review').onclick=()=>save('review');
  $('publish').onclick=()=>save('published');
  mediaRows(); window.suedsManagerAuthReady.then(async()=>{ await loadModules(); await loadDocs(); }).catch((error)=>notice(error.message,true));
})();
