// Private library presentation. Playback, likes and playlist editors use existing services.
const musicLibraryCategories=[['likes','좋아요'],['history','최근 감상'],['playlists','플레이리스트'],['myboxes','마이박스']];
function visibleLibraryCategories(){return globalThis.AifectUnifiedPlaylists ? musicLibraryCategories.slice(0,3) : musicLibraryCategories;}
let musicLibraryState=null,musicLibraryRequest=0;
const musicLibraryReads=new Map();
const musicLibraryAccount=()=>me?.id||'';
const musicLibraryRevision=()=>typeof apiRevision==='number'?apiRevision:0;
function musicLibraryReadKey(options,offset=0){return musicLibraryAccount()+':'+musicLibraryRevision()+':'+new URLSearchParams({...options,offset,limit:20});}
function cachedMusicLibraryRead(options,offset=0){
 if(['playlists','myboxes'].includes(options.section))return null;
 const key=musicLibraryReadKey(options,offset),entry=musicLibraryReads.get(key);
 if(!entry)return null;
 if(entry.until<=Date.now()){musicLibraryReads.delete(key);return null;}
 return structuredClone(entry.data);
}
function musicLibraryOptions(raw){
 const p=new URLSearchParams(raw.split('?')[1]||'');
 return {section:visibleLibraryCategories().some(([key])=>key===p.get('section'))?p.get('section'):'playlists',q:(p.get('q')||'').slice(0,100),sort:['recent','oldest','title','custom','played'].includes(p.get('sort'))?p.get('sort'):p.get('sort')==='name'?'title':'recent',filter:'all'};
}
function musicLibraryHref(options){return menuHref('profile',{view:'library',section:options.section,q:options.q||null,sort:options.sort||'recent',filter:options.filter||'all'});}
async function musicLibraryRead(options,offset=0,readApi=api,{fresh=false}={}){
 const account=musicLibraryAccount(),revision=musicLibraryRevision(),key=musicLibraryReadKey(options,offset);
 const current=()=>account===musicLibraryAccount()&&revision===musicLibraryRevision()&&!readApi.signal?.aborted&&(!readApi.current||readApi.current());
 const check=()=>{if(!current())throw Object.assign(new Error('이전 보관함의 요청입니다.'),{name:'AbortError'});};
 check();const cached=!fresh&&cachedMusicLibraryRead(options,offset);if(cached)return cached;
 const data=await readApi('/api/me/music-library?'+new URLSearchParams({...options,offset,limit:20}),'GET',undefined,{fresh:true});check();
 if(Array.isArray(data?.items)&&data.counts&&!data.error){
  musicLibraryReads.delete(key);musicLibraryReads.set(key,{data:structuredClone(data),until:Date.now()+10000});
  while(musicLibraryReads.size>36)musicLibraryReads.delete(musicLibraryReads.keys().next().value);
 }
 return data;
}
function musicLibraryTabs(s){return visibleLibraryCategories().map(([key,label])=>`<button type="button" role="tab" id="ml-tab-${key}" aria-controls="ml-panel" aria-selected="${s.options.section===key}" tabindex="${s.options.section===key?0:-1}" data-library-tab="${key}">${label}<span aria-label="${s.data.counts[key]===null?'집계 미지원':number(s.data.counts[key])+'개'}">${s.data.counts[key]===null?'—':number(s.data.counts[key])}</span></button>`).join('');}
function musicLibraryRows(s){
 if(s.options.section==='myboxes')return s.data.items.length?`<div class="mybox-grid">${s.data.items.map(myBoxCard).join('')}</div>`:myEmpty(s.options.q?'검색 결과가 없습니다.':'아직 마이박스가 없습니다.');
 if(s.options.section==='playlists')return s.data.items.length?`<div class="ml-playlists">${s.data.items.map(p=>collectionCard(p,'horizontal')).join('')}</div>`:myEmpty(s.options.q?'검색 결과가 없습니다.':'아직 플레이리스트가 없습니다.');
 if(!s.data.items.length)return myEmpty(s.options.q?'검색 결과가 없습니다.':s.options.section==='likes'?'좋아요를 누른 음악이 없습니다.':'아직 감상한 음악이 없습니다.');
 return `<div class="ml-song-list">${s.data.items.map(t=>`<article data-list-row class="ml-song" data-library-track="${esc(t.id)}"><a class="ml-song-info" href="#song/${esc(t.id)}">${cover(t,'mini-cover')}<span class="ml-song-copy"><strong class="ml-song-title" title="${esc(t.title)}">${esc(t.title)}</strong><span class="ml-song-artist" aria-label="가수" title="${esc(t.artist||t.producer||'')}">${t.kind==='cover'?trackPerformers(t):trackNickname(t)}</span><span class="ml-song-producer" aria-label="제작자" title="${esc(t.producer||'')}">${trackNickname(t,'producer')}</span></span></a><div class="ml-song-actions"><button class="list-action icon-button" data-like="${esc(t.id)}" aria-pressed="${!!t.liked}" title="${esc(t.title)} 좋아요" aria-label="${esc(t.title)} 좋아요">${icon('ui-heart')}</button><button class="list-action icon-button song-table-play" data-play="${esc(t.id)}" title="${esc(t.title)} 재생" aria-label="${esc(t.title)} 재생">${icon('ui-play-action')}</button><button class="list-action icon-button" data-track-menu="${esc(t.id)}" title="${esc(t.title)} 더보기" aria-label="${esc(t.title)} 더보기">${icon('ui-menu-action')}</button></div></article>`).join('')}</div>`;
}
function musicLibraryResultCount(s){return number(s.data.total)+(['playlists','myboxes'].includes(s.options.section)?'개 목록':'곡');}
function musicLibraryPanel(s){
 const {options:o,data:d}=s,playlist=o.section==='playlists',box=o.section==='myboxes',placeholder=playlist?'제목·작성자 검색':box?'마이박스 이름 검색':'곡·가수·제작자 검색';
 return `<form id="ml-search" class="ml-toolbar ${playlist||box?'ml-toolbar-create':''}" role="search"><div class="ml-search-box brand-search"><button type="submit" title="보관함 검색" aria-label="보관함 검색">${icon('search')}</button><input type="search" name="q" aria-label="보관함 내 검색" placeholder="${placeholder}" value="${esc(o.q)}" maxlength="100" autocomplete="off"></div>${playlist||box?`<button type="button" class="small-button ml-create" id="${box?'new-mybox':'new-playlist'}" aria-label="${box?'마이박스':'플레이리스트'} 만들기">${icon('plus')}<span>만들기</span></button>`:''}<select data-dropdown="md" data-dropdown-width="full" name="sort" aria-label="보관함 정렬">${[['recent',playlist||box?'최근 수정순':'최신순'],['oldest','오래된순'],['title','이름순'],...(playlist?[['played','최근 재생순'],['custom','내 순서']]:[])].map(([k,l])=>`<option value="${k}" ${o.sort===k?'selected':''}>${l}</option>`).join('')}</select></form><div class="ml-result-bar"><p class="ml-result-count" aria-live="polite">${musicLibraryResultCount(s)}</p>${playlist?`<div class="ml-secondary-tools"><button type="button" class="text-link" data-order-collections ${o.sort==='custom'?'':'hidden'}>순서 편집</button><a class="text-link" href="#collections">추천 플레이리스트</a></div>`:''}</div><div id="ml-items">${musicLibraryRows(s)}</div><button class="small-button ml-more" id="ml-more" ${d.nextOffset===null?'hidden':''}>더보기</button>`;
}
function musicLibraryHTML(s){return `<section class="mp-library" id="music-library" data-unified="${!!globalThis.AifectUnifiedPlaylists}" data-account="${esc(s.account)}" aria-label="내 보관함"><div class="ml-tabs" role="tablist" aria-label="보관함 카테고리">${musicLibraryTabs(s)}</div><div class="ml-status sr-only" role="status" aria-live="polite"></div><div id="ml-panel" role="tabpanel" tabindex="0" aria-labelledby="ml-tab-${s.options.section}">${musicLibraryPanel(s)}</div></section>`;}
function musicLibraryFilter(items,section,q){
 const text=q.trim().toLocaleLowerCase();if(!text)return items;
 return items.filter(t=>!t.unavailable&&(section==='playlists'?[t.name,t.owner_name]:section==='myboxes'?[t.name]:[t.title,t.artist,t.producer]).some(value=>String(value||'').toLocaleLowerCase().includes(text)));
}
function musicLibraryAside(recommendation){
 const tracks=recommendation?.tracks||[];
 const content=tracks.length?`<div class="ml-recommendations" data-library-gesture-ignore>${tracks.slice(0,4).map(t=>`<article class="ml-recommendation"><a href="#song/${esc(t.id)}">${cover(t,'mini-cover')}<span><strong>${esc(t.title)}</strong><small>${trackNickname(t)}</small></span></a><button class="icon-button" data-play="${esc(t.id)}" title="${esc(t.title)} 추천 음악 재생" aria-label="${esc(t.title)} 추천 음악 재생">${icon('ui-play-action')}</button></article>`).join('')}</div>`:myEmpty(recommendation===null?'추천 음악을 불러오지 못했습니다.':'아직 추천할 음악이 없습니다.');
 return mySection('추천 보관 콘텐츠',content,myAll('#discover','음악 둘러보기'));
}
async function musicLibraryView(raw,readApi=api){
 const options=musicLibraryOptions(raw),account=musicLibraryAccount(),revision=musicLibraryRevision();
 const [data,recommendation]=await Promise.all([musicLibraryRead(options,0,readApi),readApi('/api/discovery').catch(()=>null)]);
 if(account!==musicLibraryAccount()||revision!==musicLibraryRevision()||readApi.signal?.aborted||readApi.current&&!readApi.current())throw Object.assign(new Error('이전 보관함의 요청입니다.'),{name:'AbortError'});
 const s={options,data,account,revision,memory:new Map(),recommendation};
 return {musicLibrary:s,tracks:[...(['playlists','myboxes'].includes(options.section)?[]:data.items),...(recommendation?.tracks||[]).slice(0,4)],html:musicLibraryHTML(s),libraryAside:musicLibraryAside(recommendation)};
}
function musicLibraryRemember(s){
 const tracks=['playlists','myboxes'].includes(s.options.section)?[]:s.data.items;remember(tracks);routeTracks=tracks;
 // The legacy library read is capped; preserve the authoritative liked state on every loaded page.
 for(const t of tracks){library.likes=library.likes.filter(x=>x.id!==t.id);if(t.liked)library.likes.push(t);}
}
function musicLibraryCenter(){
 const strip=$('#music-library .ml-tabs'),active=strip?.querySelector('[aria-selected="true"]');if(!active)return;
 strip.scrollTo({left:Math.max(0,active.offsetLeft-(strip.clientWidth-active.offsetWidth)/2),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
function musicLibraryGo(section,focus=false){
 const s=musicLibraryState;if(!s||section===s.options.section)return;
 s.memory.set(s.options.section,{...s.options});s.focus=focus;
 const href=musicLibraryHref(s.memory.get(section)||{section,q:'',sort:'recent',filter:'all'});
 if(typeof rememberMyPageRouteTarget==='function')rememberMyPageRouteTarget(href.slice(1));location.hash=href;
}
// A direction lock excludes vertical drags and short diagonal gestures. Screen-edge gestures belong to the OS.
function boundedCategorySwipe(start,end,index,count){
 const dx=end.x-start.x,dy=end.y-start.y;
 if(start.cancelled||start.x<28||start.x>start.width-28||end.time-start.time>700||Math.abs(dx)<64||Math.abs(dx)<Math.abs(dy)*1.8)return index;
 return Math.max(0,Math.min(count-1,index+(dx<0?1:-1)));
}
function musicLibrarySwipe(start,end,index){return boundedCategorySwipe(start,end,index,visibleLibraryCategories().length);}
function bindMusicLibrary(s){
 const root=$('#music-library');if(!root||me?.id!==s.account)return;musicLibraryState=s;musicLibraryRemember(s);
 root.onclick=async e=>{
  const tab=e.target.closest('[data-library-tab]');if(tab){musicLibraryGo(tab.dataset.libraryTab,true);return;}
  const like=e.target.closest('[data-like]');if(like){e.stopPropagation();const route=location.hash;try{await toggleLike(like);if(root.isConnected&&musicLibraryState===s&&s.account===me?.id&&location.hash===route)await refreshMusicLibraryRoute(route.slice(1),renderId,true);}catch(err){if(root.isConnected&&musicLibraryState===s)toast(err.message);}}
 };
 root.querySelector('.ml-tabs').onkeydown=e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
  const i=visibleLibraryCategories().findIndex(([key])=>key===s.options.section),n=e.key==='Home'?0:e.key==='End'?visibleLibraryCategories().length-1:Math.max(0,Math.min(visibleLibraryCategories().length-1,i+(e.key==='ArrowRight'?1:-1)));musicLibraryGo(visibleLibraryCategories()[n][0],true);
 };
 bindMusicLibraryPanel(s);musicLibraryCenter();paintInteractions();
}
function bindMusicLibraryPanel(s){
 const root=$('#music-library'),panel=$('#ml-panel'),form=$('#ml-search');
 if(form){
  form.onsubmit=e=>{e.preventDefault();clearTimeout(s.searchTimer);const live=s.liveSearch;s.liveSearch=false;const values=Object.fromEntries(new FormData(form)),href=musicLibraryHref({...s.options,...values});if(typeof rememberMyPageRouteTarget==='function')rememberMyPageRouteTarget(href.slice(1));if(live&&typeof history!=='undefined'){history.replaceState(history.state,'',href);window.AifectRender?.syncTarget();void refreshMusicLibraryRoute(href.slice(1),renderId,false);}else if(location.hash===href)refreshMusicLibraryRoute(href.slice(1),renderId,true);else location.hash=href;};
  form.querySelectorAll('select').forEach(el=>el.onchange=()=>form.requestSubmit());
  const input=form.querySelector('input[name="q"]');
  if(input){
   const search=()=>{clearTimeout(s.searchTimer);++musicLibraryRequest;s.pending=false;const q=input.value,items=musicLibraryFilter(s.data.items,s.options.section,q);$('#ml-items').innerHTML=musicLibraryRows({...s,options:{...s.options,q},data:{...s.data,items}});const count=root.querySelector('.ml-result-count');if(count)count.textContent=q===s.options.q?musicLibraryResultCount(s):'검색 중입니다.';const more=$('#ml-more');if(more)more.hidden=true;paintInteractions();s.searchTimer=setTimeout(()=>{if(form.isConnected&&musicLibraryState===s&&s.account===me?.id){s.liveSearch=true;form.requestSubmit();}},180);};
   input.oninput=e=>{if(!e.isComposing)search();};input.oncompositionend=search;
  }
 }

 const more=$('#ml-more');if(more)more.onclick=async()=>{
  if(s.pending||s.data.nextOffset===null)return;
  const uid=me?.id,revision=musicLibraryRevision(),request=++musicLibraryRequest,options={...s.options},route=location.hash;
  const current=()=>request===musicLibraryRequest&&musicLibraryState===s&&root.isConnected&&root===$('#music-library')&&panel===$('#ml-panel')&&uid===me?.id&&revision===musicLibraryRevision()&&location.hash===route&&s.options.section===options.section;
  more.disabled=true;
  try{const data=await musicLibraryRead(options,s.data.nextOffset);if(!current())return;s.data={...data,items:[...s.data.items,...data.items]};$('#ml-items').innerHTML=musicLibraryRows(s);more.hidden=data.nextOffset===null;musicLibraryRemember(s);paintInteractions();}
  catch(e){if(current()&&e.name!=='AbortError')toast(e.message);}finally{if(more.isConnected)more.disabled=false;}
 };
 if($('#new-mybox'))$('#new-mybox').onclick=()=>myBoxDialog().catch(e=>toast(e.message));
 if($('#new-playlist'))$('#new-playlist').onclick=()=>playlistDialog().catch(e=>toast(e.message));
 if(!panel.musicLibrarySwipeBound){panel.musicLibrarySwipeBound=true;bindCategorySwipe(panel,()=>visibleLibraryCategories().findIndex(([key])=>key===musicLibraryState?.options.section),()=>visibleLibraryCategories().length,n=>musicLibraryGo(visibleLibraryCategories()[n][0]));}
}
function bindCategorySwipe(panel,getIndex,count,onChange){
 let start=null;
 panel.addEventListener('touchstart',e=>{
  start=null;if(innerWidth>=1000||e.touches.length!==1||e.target.closest('button,input,select,textarea,[role="slider"],[data-library-gesture-ignore]'))return;
  for(let node=e.target;node&&node!==panel;node=node.parentElement){if(node.scrollWidth>node.clientWidth+2&&['auto','scroll'].includes(getComputedStyle(node).overflowX))return;}
  const t=e.touches[0];start={x:t.clientX,y:t.clientY,width:innerWidth,time:e.timeStamp};
 },{passive:true});
 panel.addEventListener('touchmove',e=>{if(!start)return;if(e.touches.length!==1){start.cancelled=true;return;}const t=e.touches[0],dx=Math.abs(t.clientX-start.x),dy=Math.abs(t.clientY-start.y);if(dy>12&&dy>dx)start.cancelled=true;},{passive:true});
 panel.addEventListener('touchcancel',()=>{start=null;},{passive:true});
 panel.addEventListener('touchend',e=>{if(!start)return;const t=e.changedTouches[0],i=getIndex(),n=boundedCategorySwipe(start,{x:t.clientX,y:t.clientY,time:e.timeStamp},i,typeof count==='function'?count():count);start=null;if(i!==n)onChange(n);},{passive:true});
}
function paintMusicLibraryTabs(root,s){
 for(const tab of root.querySelectorAll('[data-library-tab]')){
  const key=tab.dataset.libraryTab,active=key===s.options.section,count=s.data.counts[key],label=tab.querySelector('span');
  tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
  if(label){label.textContent=count===null?'—':number(count);label.setAttribute('aria-label',count===null?'집계 미지원':number(count)+'개');}
 }
}
function holdMusicLibraryPanel(panel,pending=false){
 const rect=panel.getBoundingClientRect(),scale=panel.offsetHeight?rect.height/panel.offsetHeight:1;
 const height=Math.max(pending?rect.height:0,(window.scrollY||0)>0?window.innerHeight-rect.top:0);
 panel.style.minHeight=height>0?Math.ceil(height/(scale||1))+'px':'';
}
async function refreshMusicLibraryRoute(raw,ticket,force=false,readApi=api,showCurrentTab){
 const root=$('#music-library'),s=musicLibraryState;
 if(typeof myPageState!=='undefined'&&myPageState?.tab!=='library')return false;
 if(!s||!root||s.account!==me?.id||!/^profile\?/.test(raw)||new URLSearchParams(raw.split('?')[1]).get('view')!=='library')return false;
 const options=musicLibraryOptions(raw),request=++musicLibraryRequest,panel=$('#ml-panel'),revision=musicLibraryRevision(),main=$('#main'),status=root.querySelector('.ml-status');
 if(!panel)return false;
 if(root.dataset&&root.dataset.unified!==String(!!globalThis.AifectUnifiedPlaylists)){
  root.dataset.unified=String(!!globalThis.AifectUnifiedPlaylists);
  root.querySelector('.ml-tabs').innerHTML=musicLibraryTabs({...s,options});
 }
 clearTimeout(s.searchTimer);const keepControls=s.options.section===options.section&&!!$('#ml-search');
 let timedOut=false,timer;
 const mounted=()=>!timedOut&&request===musicLibraryRequest&&musicLibraryState===s&&root.isConnected&&root===$('#music-library')&&panel===$('#ml-panel')&&ticket===renderId&&s.account===me?.id&&main.dataset.route===raw&&(typeof myPageState==='undefined'||myPageState?.tab==='library');
 const current=()=>mounted()&&revision===musicLibraryRevision()&&!readApi.signal?.aborted&&(!readApi.current||readApi.current());
 s.memory.set(s.options.section,{...s.options});s.options=options;s.pending=true;main.dataset.route=raw;
 if(typeof rememberMyPageRouteTarget==='function')rememberMyPageRouteTarget(raw);
 status.classList.add('sr-only');status.textContent=visibleLibraryCategories().find(([key])=>key===options.section)[1]+' 선택';
 paintMusicLibraryTabs(root,s);panel.setAttribute('aria-labelledby','ml-tab-'+options.section);
 if(s.focus){$('#ml-tab-'+options.section)?.focus({preventScroll:true});s.focus=false;}musicLibraryCenter();
 const paint=data=>{
  holdMusicLibraryPanel(panel,true);s.data=data;s.revision=revision;s.pending=false;
  paintMusicLibraryTabs(root,s);panel.removeAttribute('aria-busy');panel.classList.remove('ml-enter');
  if(keepControls&&$('#ml-items')){
   $('#ml-items').innerHTML=musicLibraryRows(s);const count=root.querySelector('.ml-result-count');if(count)count.textContent=musicLibraryResultCount(s);const more=$('#ml-more');if(more)more.hidden=data.nextOffset===null;
   const form=$('#ml-search'),input=form.querySelector('input[name="q"]'),sort=form.querySelector('select');if(input&&input.value!==options.q)input.value=options.q;if(sort){sort.value=options.sort;if(typeof window.AifectDropdown?.mount==='function')window.AifectDropdown.mount(sort)?.sync?.();}const order=root.querySelector('[data-order-collections]');if(order)order.hidden=options.sort!=='custom';
  }else panel.innerHTML=musicLibraryPanel(s);
  bindMusicLibraryPanel(s);musicLibraryRemember(s);paintInteractions();holdMusicLibraryPanel(panel);
 };
 const fail=message=>{s.pending=false;panel.removeAttribute('aria-busy');panel.innerHTML='<p class="mp-muted" role="alert">'+esc(message)+' <button class="text-link" id="ml-retry">다시 시도</button></p>';$('#ml-retry').onclick=()=>refreshMusicLibraryRoute(raw,renderId,true,api);holdMusicLibraryPanel(panel);};
 const cached=!force&&cachedMusicLibraryRead(options);
 if(cached&&current()){paint(cached);showCurrentTab?.();return true;}
 holdMusicLibraryPanel(panel,true);panel.setAttribute('aria-busy','true');if(!keepControls)panel.innerHTML='<p class="mp-muted" role="status">불러오는 중입니다.</p>';showCurrentTab?.();
 try{
  const expired=Symbol('library-timeout'),localRead=(...args)=>readApi(...args);localRead.signal=readApi.signal;localRead.current=current;
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{if(mounted())fail('연결이 지연되고 있습니다. 다시 시도해 주세요.');timedOut=true;resolve(expired);},20000);});
  const data=await Promise.race([musicLibraryRead(options,0,localRead,{fresh:force}),timeout]);if(data!==expired&&current())paint(data);
 }catch(e){
  if(e.name==='AbortError'&&mounted()&&revision!==musicLibraryRevision()&&!readApi.signal?.aborted&&(!readApi.current||readApi.current()))return refreshMusicLibraryRoute(raw,ticket,true,readApi,showCurrentTab);
  if(mounted()&&e.name!=='AbortError')fail(e.message);
 }finally{clearTimeout(timer);}
 return true;
}
