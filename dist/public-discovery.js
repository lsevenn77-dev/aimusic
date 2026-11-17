(() => {
 const dialog=document.querySelector('.guide-dialog');
 if(dialog && typeof dialog.showModal==='function'){
  let opener;
  document.addEventListener('click',event=>{
   const link=event.target.closest('[data-enlarge]');
   if(!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
   event.preventDefault();
   opener=link;
   const thumbnail=link.querySelector('img'), image=dialog.querySelector('img');
   image.src=link.href;
   image.alt=thumbnail.alt;
   dialog.querySelector('#image-caption').textContent=thumbnail.alt;
   dialog.showModal();
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{opener?.focus({preventScroll:true});});
 }
 const form=document.querySelector('#catalog-form');
 if(!form) return;
 const results=document.querySelector('#catalog-results'), status=document.querySelector('#catalog-status');
 const query=form.elements.q;
 let controller, timer, generation=0, pending='', rendered=location.href, retryURL='', typing=false, composing=false;
 function formURL(){
  const url=new URL('/music',location.origin);
  for(const [key,value] of new FormData(form)) if(value.trim())url.searchParams.set(key,value.trim());
  return url;
 }
 function setControls(f){
  query.value=f.q;
  const group=form.querySelector('.discover-kinds');
  // A pre-renewal bookmark may point to the combined cover list.
  let legacy=group.querySelector('input[value="cover"]');
  if(f.kind==='cover'&&!legacy){
   const label=document.createElement('label');
   label.innerHTML='<input type="radio" name="kind" value="cover"><span>모든 커버</span>';
   group.append(label);
  }else if(f.kind!=='cover'&&legacy)legacy.parentElement.remove();
  form.elements.kind.value=f.kind;
  form.elements.genre.value=f.genre;
  form.elements.sort.value=f.sort;
 }
 function stop(){
  clearTimeout(timer);
  generation++;
  controller?.abort();
  pending='';
  results.removeAttribute('aria-busy');
 }
 function refreshMeta(data){
  document.title=data.title;
  document.querySelector('link[rel="canonical"]').href=data.canonical;
  let robots=document.querySelector('meta[name="robots"]');
  if(data.noindex && !robots){robots=document.createElement('meta');robots.name='robots';document.head.append(robots);}
  if(data.noindex)robots.content='noindex,follow';
  else robots?.remove();
 }
 async function update(url,{historyMode='push',moveFocus=false,force=false}={}){
  clearTimeout(timer);
  if(!force && pending===url.href) return;
  stop();
  if(!force && !retryURL && rendered===url.href)return;
  const token=generation;
  pending=url.href;
  controller=new AbortController();
  results.setAttribute('aria-busy','true');
  status.textContent='음악을 불러오는 중입니다.';
  try{
   const response=await fetch(url,{headers:{'X-AIFECT-Results':'1'},signal:controller.signal,cache:'no-store'});
   if(!response.ok && response.status!==404)throw Error('catalogue unavailable');
   const data=await response.json();
   if(token!==generation) return;
   results.innerHTML=data.html;
   setControls(data.filters);
   refreshMeta(data);
   if(historyMode!=='none'&&location.href!==url.href) history[historyMode==='replace'?'replaceState':'pushState'](null,'',url);
   rendered=url.href;
   retryURL='';
   status.textContent=data.announcement;
   if(moveFocus){results.focus({preventScroll:true});results.scrollIntoView({block:'start'});}
  }catch(error){
   if(token!==generation || error.name==='AbortError')return;
   retryURL=url.href;
   results.innerHTML='<div class="catalog-empty"><h2>음악을 불러오지 못했어요</h2><p>연결 상태를 확인하고 다시 시도해 주세요.</p><button type="button" data-retry>다시 시도</button></div>';
   status.textContent='음악을 불러오지 못했어요. 다시 시도해 주세요.';
  }finally{
   if(token===generation){pending='';results.removeAttribute('aria-busy');}
  }
 }
 function schedule(){
  stop();
  if(composing)return;
  timer=setTimeout(()=>{
   const replace=typing&&new URL(location.href).searchParams.has('q');
   typing=true;
   update(formURL(),{historyMode:replace?'replace':'push'});
  },300);
 }
 query.addEventListener('compositionstart',()=>{composing=true;stop();});
 query.addEventListener('compositionend',()=>{composing=false;schedule();});
 query.addEventListener('input',schedule);
 form.addEventListener('change',event=>{if(event.target!==query){typing=false;update(formURL());}});
 form.addEventListener('submit',event=>{event.preventDefault();if(!composing){typing=false;update(formURL());}});
 results.addEventListener('click',event=>{
  if(event.target.closest('[data-retry]')){update(new URL(retryURL||location.href),{force:true});return;}
  const link=event.target.closest('[data-catalog-link]');
  if(!link || event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
  event.preventDefault();
  typing=false;
  update(new URL(link.href),{moveFocus:true,force:true});
 });
 window.addEventListener('popstate',()=>{
  typing=false;
  const url=new URL(location.href),p=url.searchParams;
  setControls({q:p.get('q')||'',kind:p.get('kind')||'',sort:p.get('sort')||'',genre:p.get('genre')||''});
  update(url,{historyMode:'none',force:true});
 });
 window.addEventListener('pagehide',stop);
})();