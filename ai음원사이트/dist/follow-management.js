// Personal FollowPage: the native hash router retains this shell for all three tabs.
// Data, filters and pagination survive a profile visit; pending reads are shared per account.
const followDataCache=new Map(),followPageCache=new Map();
const followPersonalTabs={followers:'내 팔로워',following:'내 팔로잉',blocks:'차단 관리'};
const followStamp=()=>[me?.id||'guest',apiRevision,followRevision].join(':');
function normalizeFollowSearch(value){return String(value||'').normalize('NFC').trim().toLowerCase();}
// Keep composition, clear and debounce on the input itself; never filter just a loaded page.
function bindFollowSearch(input,clearButton,{pending,read,cancelRead}){
 let timer,composing=false,last=normalizeFollowSearch(input.value);
 const cancel=()=>{clearTimeout(timer);timer=null;};
 const sync=()=>{clearButton.hidden=!input.value;clearButton.disabled=input.readOnly||input.disabled;};
 function search(force=false,immediate=false){
  sync();if(composing||input.readOnly||input.disabled)return;
  const query=normalizeFollowSearch(input.value);if(!force&&query===last)return;
  last=query;cancel();pending(query);
  if(immediate)read();else timer=setTimeout(()=>{timer=null;read();},275);
 }
 input.oncompositionstart=()=>{composing=true;cancel();cancelRead();};
 input.oncompositionend=()=>{composing=false;search(true);};
 input.oninput=event=>{sync();if(!event.isComposing&&!composing)search();};
 input.onsearch=()=>search();
 clearButton.onclick=()=>{if(input.readOnly||input.disabled)return;input.value='';composing=false;search(true,true);input.focus();};
 sync();return {cancel,sync};
}
function followSelection(raw){
 raw=raw.replace(/^#/, '');if(raw.split('?')[0]!=='follow')return null;
 const q=new URLSearchParams(raw.split('?')[1]);
 if(q.has('artist')||q.has('tab')&&!Object.hasOwn(followPersonalTabs,q.get('tab')))return null;
 return {raw,tab:Object.hasOwn(followPersonalTabs,q.get('tab'))?q.get('tab'):'followers',user:q.get('user')||'',kind:q.get('kind')||'',q:q.get('q')||''};
}
function followContext(s){return [me?.id||'guest',s.user,s.kind].join(':');}
function followHref(s,tab){return '#follow?'+followOptions(tab,'',s.user,tab==='following'?s.kind:'');}
function followTargetId(raw){try{return decodeURIComponent(raw.replace(/^#/,''));}catch{return raw.replace(/^#/,'');}}
function followTargets(s){return '<div hidden aria-hidden="true" data-follow-route-targets>'+[...new Set([s.raw,'follow',...Object.keys(followPersonalTabs).map(tab=>followHref(s,tab).slice(1))])].map(raw=>'<span data-follow-route-target id="'+esc(followTargetId(raw))+'"></span>').join('')+'</div>';}
function rememberFollowTarget(root,raw){const host=root.querySelector('[data-follow-route-targets]'),id=followTargetId(raw);if([...host.children].some(n=>n.id===id))return;const node=document.createElement('span');node.id=id;node.setAttribute('data-follow-route-target','');host.append(node);}
async function readFollowData(params){
 const q=new URLSearchParams(params);q.sort();const stamp=followStamp(),key=stamp+':'+q,prior=followDataCache.get(key);
 if(prior&&(prior.pending||prior.until>Date.now()))return structuredClone(await prior.promise);
 const entry={pending:true,until:0};
 entry.promise=api('/api/follow-management?'+q,'GET',undefined,{fresh:true}).then(data=>{
  if(stamp!==followStamp())throw Object.assign(new Error('관계 정보가 변경되었습니다.'),{name:'AbortError'});
  entry.pending=false;entry.until=Date.now()+60000;return data;
 }).catch(error=>{if(followDataCache.get(key)===entry)followDataCache.delete(key);throw error;});
 followDataCache.set(key,entry);while(followDataCache.size>48)followDataCache.delete(followDataCache.keys().next().value);
 return structuredClone(await entry.promise);
}
async function followManagementView(raw,readApi){
 const selection=followSelection(raw);
 if(!me&&!selection.user){returnRoute=location.hash;return {html:'<section class="fm-page fm-gate">'+gate()+'</section>'};}
 const tabs=selection.user&&selection.user!==me?.id?['followers','following']:Object.keys(followPersonalTabs);
 const html='<section class="fm-page fm-stable" aria-label="팔로우 목록">'+followTargets(selection)+'<header class="fm-header"><nav class="tabs fm-tabs aifect-main-tabs" style="--fm-tab-columns:'+tabs.length+'" aria-label="팔로우 탭">'+tabs.map(tab=>'<a class="tab" data-follow-tab="'+tab+'" data-tab-tone="pink" href="'+esc(followHref(selection,tab))+'">'+(selection.user?{followers:'팔로워',following:'팔로잉',blocks:'차단 관리'}[tab]:followPersonalTabs[tab])+'<span class="fm-tab-count" data-follow-count-tab="'+tab+'"></span></a>').join('')+'</nav></header><div class="fm-content"></div></section>';
 return {html,followPage:{selection}};
}
function followPanelHTML(tab){return '<div class="fm-tools"><div class="brand-search">'+icon('search')+'<input type="search" maxlength="100" aria-label="닉네임 검색" placeholder="닉네임 검색"><button type="button" class="fm-search-clear" aria-label="검색어 지우기" hidden><span aria-hidden="true">×</span></button></div><select class="fm-sort" aria-label="정렬"><option value="latest">최신순</option><option value="oldest">오래된순</option></select></div><div class="fm-list-panel"><div class="fm-status" role="status"></div><div class="fm-loading" hidden></div><ul class="fm-rows"></ul><button class="small-button fm-more" hidden>더 보기</button></div>';}
function canRefreshFollowRoute(raw){
 const root=document.querySelector('.fm-stable'),state=root?._followPage,s=followSelection(raw);
 return !!(s&&state&&!state.disposed&&state.context===followContext(s)&&state.account===(me?.id||'guest'));
}
function refreshFollowRoute(raw){
 if(!canRefreshFollowRoute(raw))return false;
 const main=document.querySelector('#main');
 if(main.dataset.route!==raw&&typeof cleanupRouteOverlays==='function')cleanupRouteOverlays();
 const root=document.querySelector('.fm-stable');root._followPage.select(followSelection(raw));
 main.dataset.route=raw;return true;
}
function bindFollowManagement(view){
 if(view.legacy)return bindArtistFollowers(view);
 const root=document.querySelector('.fm-stable');if(!root)return;
 const context=followContext(view.selection),account=me?.id||'guest';
 let cache=followPageCache.get(context);if(!cache){cache={tabs:new Map(),counts:{}};followPageCache.set(context,cache);}
 while(followPageCache.size>8)followPageCache.delete(followPageCache.keys().next().value);
 const state=root._followPage={context,account,panels:new Map(),disposed:false,selection:view.selection};
 const current=()=>!state.disposed&&root.isConnected&&account===(me?.id||'guest');
 const paintCounts=()=>{for(const node of root.querySelectorAll('[data-follow-count-tab]')){const count=cache.counts[node.dataset.followCountTab];node.textContent=Number.isFinite(count)?number(count):'';}};
 function showData(panel,tab,saved){
  panel.innerHTML=followPanelHTML(tab);
  const params=followOptions(tab,'',state.selection.user,tab==='following'?state.selection.kind:'');
  bindFollowList(panel,{params:params.toString(),tab,d:saved.d,simple:true,saved,
   onFilters(query,sort){panel._filters={query,sort};},
   onData(data){const entry={...data};cache.tabs.set(tab,entry);panel._entry=entry;panel._filters={query:entry.query,sort:entry.sort};Object.assign(cache.counts,data.d.counts||{[tab]:data.d.total});paintCounts();}
  });
 }
 async function loadPanel(panel,tab){
  if(panel._pending)return panel._pending;
  // Refresh an existing list through its own sequence guard. Replacing its
  // controls here could overwrite a search typed while revalidation is pending.
  if(panel._entry&&panel._followRefresh){panel._pending=Promise.resolve(panel._followRefresh()).finally(()=>{panel._pending=null;});return panel._pending;}
  const selection={...state.selection},saved=cache.tabs.get(tab),filters=panel._filters||{query:saved?.query||selection.q,sort:saved?.sort||'latest'};
  const params=followOptions(tab,'',selection.user,tab==='following'?selection.kind:'');params.set('q',filters.query);params.set('sort',filters.sort);
  if(!panel._entry)panel.innerHTML='<div class="fm-initial" role="status"><span class="sr-only">목록을 불러오는 중…</span>'+followSkeleton()+'</div>';
  panel._pending=(async()=>{try{
   const d=await readFollowData(params);if(!current())return;
   const saved={d,rows:d.items,next:d.next,query:filters.query,sort:filters.sort,stamp:followStamp(),until:Date.now()+60000};
   showData(panel,tab,saved);
  }catch(error){if(!current())return;
   if(error.name==='AbortError'){panel._pending=null;return loadPanel(panel,tab);}
   if(error.status===401||error.status===403){cache.tabs.delete(tab);panel._entry=null;panel.innerHTML='';}
   let status=panel.querySelector('.fm-status');if(!status){panel.innerHTML='<div class="fm-status fm-feedback" role="alert"></div>';status=panel.querySelector('.fm-status');}
   status.innerHTML=esc(error.message)+' <button type="button" class="small-button">다시 시도</button>';status.querySelector('button').onclick=()=>loadPanel(panel,tab);
  }finally{panel._pending=null;}})();return panel._pending;
 }
 state.select=selection=>{
  state.selection=selection;rememberFollowTarget(root,selection.raw);
  for(const link of root.querySelectorAll('[data-follow-tab]')){const active=link.dataset.followTab===selection.tab;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  let panel=state.panels.get(selection.tab);
  if(!panel){panel=document.createElement('div');panel.className='fm-tab-panel';panel.dataset.followPanel=selection.tab;root.querySelector('.fm-content').append(panel);state.panels.set(selection.tab,panel);const saved=cache.tabs.get(selection.tab);if(saved)showData(panel,selection.tab,saved);}
  for(const [tab,node] of state.panels)node.hidden=tab!==selection.tab;
  const entry=panel._entry;if(!entry||entry.stamp!==followStamp()||entry.until<=Date.now())void loadPanel(panel,selection.tab);
  paintCounts();
 };
 const navigate=event=>{const link=event.target.closest('[data-follow-tab]');if(!link||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();const href=link.getAttribute('href');rememberFollowTarget(root,href);if(location.hash!==href){location.hash=href;refreshFollowRoute(href.slice(1));}};
 root.addEventListener('click',navigate);
 const changed=event=>{if(current()&&event.detail?.source!==state.panels.get(state.selection.tab))state.select(followSelection(location.hash)||state.selection);};
 window.addEventListener('aifect:follow-saved',changed);
 registerRouteCleanup(()=>{state.disposed=true;root.removeEventListener('click',navigate);window.removeEventListener('aifect:follow-saved',changed);});
 state.select(view.selection);
}

// Artist fan moderation remains available from the artist fan page, separately.
const followTabs={followers:'내 팔로워',following:'내 팔로잉',artists:'AI 아티스트',blocks:'차단 관리'};
const followOps={remove:'삭제',block:'차단',unfollow:'팔로우 취소',unblock:'차단 해제',follow:'맞팔로우'};
function followOptions(tab,artist='',user='',kind=''){
 const q=new URLSearchParams({tab});if(artist)q.set('artist',artist);if(user)q.set('user',user);if(kind)q.set('kind',kind);return q;
}
async function artistFollowersView(raw,readApi){
 const q=new URLSearchParams(raw.split('?')[1]),tab=q.get('tab')||'followers',aid=q.get('artist')||'';
 if(!me&&!q.has('user')&&!aid){returnRoute=location.hash;return {html:'<section class="fm-page fm-gate">'+gate()+'</section>'};}
 const params=followOptions(tab,aid,q.get('user'),q.get('kind')),initial=q.get('q')||'';
 if(initial)params.set('q',initial);
 return {html:'<section class="fm-page" aria-label="팔로우 목록"><h1>팔로우</h1><div class="fm-initial" role="status"></div></section>',followPage:{legacy:true,params:params.toString(),tab,aid,initial,raw,readApi}};
}
function followSkeleton(){
 return '<div class="fm-skeleton" aria-hidden="true">'+('<div><i></i><span></span></div>').repeat(4)+'</div>';
}
async function bindArtistFollowers({params,tab,aid,initial,raw,readApi}){
 const root=document.querySelector('.fm-page'),pending=root.querySelector('.fm-initial');
 async function load(){
  const revision=followRevision;
  pending.innerHTML='<span class="sr-only">팔로우 목록을 불러오는 중…</span>'+followSkeleton();
  try{
   const d=await readApi('/api/follow-management?'+params,'GET',undefined,{fresh:true});
   if(!root.isConnected)return;
   if(revision!==followRevision)return load();
   root.innerHTML=followListHTML(d,tab,aid,initial,raw);
   bindFollowList(root,{params,d,tab});
  }catch(error){
   if(!root.isConnected||error.name==='AbortError')return;
   pending.innerHTML='<div class="fm-feedback" role="alert">'+esc(error.message)+' <button class="small-button" type="button">다시 시도</button></div>';
   pending.querySelector('button').onclick=load;
  }
 }
 await load();
}
function followListHTML(d,tab,aid,initial,raw){
 const href=k=>'#follow?'+esc(followOptions(k,'',d.own?'':d.owner).toString());
 const tabs=aid?['artists']:['followers','following'];
 const labels=d.own?followTabs:{followers:'팔로워',following:'팔로잉',artists:'아티스트 팔로워'};
 const picker=tab==='artists'&&d.own?'<select class="fm-artist" aria-label="AI 아티스트 선택"><option value="">전체 아티스트</option>'+d.artists.map(a=>'<option value="'+esc(a.id)+'" '+(aid===a.id?'selected':'')+'>'+esc(a.name)+' · '+number(a.followers)+'명</option>').join('')+'</select>':'';
 return '<header class="fm-header"><div class="fm-top"><h1>'+esc(d.own?'팔로우 관리':d.name+(aid?' 팬':'의 팔로우'))+'</h1><span class="fm-count"></span><div class="fm-mode"></div></div>'+
 '<div class="fm-tabs-row"><nav class="tabs fm-tabs aifect-main-tabs" aria-label="팔로우 탭">'+tabs.map(k=>'<a data-tab-tone="mint" class="tab '+(k===tab?'active':'')+'" '+(k===tab?'aria-current="page"':'')+' href="'+(k==='artists'?'#artist-followers/'+encodeURIComponent(aid):href(k))+'">'+labels[k]+'</a>').join('')+'</nav>'+picker+'</div>'+
 '<div class="fm-tools"><label class="brand-search">'+icon('search')+'<input type="search" maxlength="100" aria-label="닉네임 검색" placeholder="닉네임 검색" value="'+esc(initial)+'"></label><select class="fm-sort" aria-label="정렬"><option value="latest">최신순</option><option value="name">이름순</option></select></div></header>'+
 '<div class="fm-list-panel"><div class="fm-status" role="status"></div><div class="fm-loading" hidden></div><ul class="fm-rows"></ul><button class="small-button fm-more" hidden>더 보기</button></div><div class="fm-bulk" hidden></div>';
}
function bindFollowList(root,{params,d,tab,simple=false,saved,onData,onFilters}){
 root._followRelease?.();
 const find=s=>root.querySelector(s),input=find('input'),sort=find('.fm-sort'),modeBox=find('.fm-mode'),bulk=find('.fm-bulk'),list=find('ul'),status=find('.fm-status'),more=find('.fm-more'),loading=find('.fm-loading');
 const viewer=me?.id,hash=location.hash;let disposed=false;const alive=()=>!disposed&&root.isConnected&&viewer===me?.id&&(root.closest('.fm-stable')||location.hash===hash);
 if(saved){input.value=saved.query;sort.value=saved.sort;}
 let dataStamp=saved?.stamp||followStamp(),dataUntil=saved?.until||Date.now()+60000;
 let rows=saved?.rows||d.items,mode=false,busy=false,ready=true,next=saved?.next??d.next,seq=0,timer,reader,searchControl,base=new URLSearchParams(params),chosen=new Map();
 const btn=(action,label,disabled=false)=>'<button type="button" class="small-button" data-fm="'+action+'" '+(disabled?'disabled':'')+'>'+esc(label)+'</button>';
 const ops=tab==='followers'||tab==='artists'?['remove','block']:tab==='following'?['unfollow','block']:['unblock'];
 const clear=()=>{chosen.clear();mode=false;};
 const label=op=>op==='remove'&&tab==='artists'?'팔로워 삭제':followOps[op];
 const allowed=r=>r.uid!==viewer||!!r.artist_id||tab==='blocks';
 function controls(){
  const count=find('.fm-count');if(count)count.textContent=ready?(input.value.trim()?number(d.matched)+'/':'')+number(d.total)+'명':'…';
  if(modeBox)modeBox.innerHTML=!simple&&d.manage?(mode?btn('all',chosen.size===d.matched&&chosen.size?'전체 해제':'전체 선택',busy||!ready||!d.matched)+btn('cancel','취소',busy):btn('select','선택',busy||!ready||!d.total)):'';
  searchControl?.sync();
  if(bulk)bulk.hidden=!mode||!chosen.size;root.classList.toggle('fm-has-bulk',!!bulk&&!bulk.hidden);
  if(bulk&&!bulk.hidden)bulk.innerHTML='<strong>'+number(chosen.size)+'명 선택</strong>'+ops.map(op=>btn(op,'선택 '+followOps[op],busy)).join('');
  more.hidden=next===null||!ready;more.disabled=busy;
 }
 const relationKey=r=>(r.artist_id?'artist/':r.profile_id?'producer/':'member/')+(r.artist_id||r.profile_id||r.uid);
 function rowHTML(r){
  const key=relationKey(r),profile=r.artist_id?'artist/'+encodeURIComponent(r.artist_id):r.profile_id?'producer/'+encodeURIComponent(r.profile_id):r.public_id?'member/'+encodeURIComponent(r.public_id):'follower/'+encodeURIComponent(r.uid);
  const nameMark=r.artist_id?'':premiumNameAttribute(r.profile_id,r.uid);
  const pic=avatarImage({id:r.artist_id||r.profile_id,user_id:r.uid,name:r.name,image_version:r.image_version},r.artist_id?'artist':'producer',false);
  if(simple){
   const actions=d.manage&&allowed(r)?tab==='blocks'?btn('unblock','차단 해제'):profileFollowButton(key,!!r.following,!!r.follows_viewer,r.following?'unfollow':'follow')+btn('block','차단'):'';
   return '<a class="fm-photo" href="#'+esc(profile)+'" aria-label="'+esc(r.name)+' 프로필">'+pic+'</a><div class="fm-name"><strong><a href="#'+esc(profile)+'" title="'+esc(r.name)+'"'+nameMark+'>'+esc(r.name)+'</a></strong></div><div class="fm-actions">'+actions+'</div>';
  }
  const photo=mode?'<span class="fm-photo">'+pic+'</span>':'<button type="button" data-fm="photo" class="fm-photo" aria-haspopup="dialog" aria-label="'+esc(r.name)+' 프로필 미리보기">'+pic+'</button>';
  const check=mode?'<input class="fm-check" aria-label="'+esc(r.name)+' 선택" type="checkbox" '+(chosen.has(r.key)?'checked':'')+' '+(busy?'disabled':'')+'>':'';
  let acts='';
  if(!mode&&d.manage){
   if((tab==='followers'&&allowed(r))||tab==='following')acts+=profileFollowButton(key,!!r.following,!!r.follows_viewer,r.following||tab==='following'?'unfollow':'follow');
   acts+=ops.filter(op=>op!=='unfollow'&&(op!=='block'||allowed(r))).map(op=>btn(op,label(op),busy)).join('');
  }else if(!mode&&!d.own&&viewer&&allowed(r)&&(r.profile_id||r.artist_id)&&tab!=='blocks'){
   acts=profileFollowButton(key,!!r.following,!!r.follows_viewer,'');
  }
  const scope=r.scope_name?r.scope_name+'에서 차단':r.artist_id&&tab==='blocks'?'내가 차단한 아티스트':tab==='blocks'?'개인 계정':'';
  const badge=r.artist_id?'<span class="ai-mini">AI</span>':r.player_xp!=null?'<small class="fm-level" aria-label="레벨 '+playerLevel(r)+'">Lv. '+playerLevel(r)+'</small>':'';
  const name=mode?'<span class="fm-nickname" title="'+esc(r.name)+'"'+nameMark+'>'+esc(r.name)+'</span>':'<a href="#'+esc(profile)+'" title="'+esc(r.name)+'"'+nameMark+'>'+esc(r.name)+'</a>';
  return check+photo+'<div class="fm-name"><strong>'+name+badge+'</strong>'+(scope?'<small>'+esc(scope)+'</small>':'')+(r.bio?'<p>'+esc(r.bio)+'</p>':'')+'</div><div class="fm-actions">'+acts+'</div>';
 }
 function paint(){
  if(ready)onData?.({d,stamp:dataStamp,until:dataUntil,rows:[...rows],next,query:input.value.trim(),sort:sort.value});
  controls();
  const existing=new Map([...list.children].map(li=>[li.dataset.key,li]));
  let previous=null;
  for(const r of rows){
   let li=existing.get(r.key);existing.delete(r.key);
   if(!li){li=document.createElement('li');li.dataset.key=r.key;}
   const html=rowHTML(r);
   if(li.fmHTML!==html){li.innerHTML=html;li.fmHTML=html;}
   const nextNode=previous?previous.nextElementSibling:list.firstElementChild;
   if(nextNode!==li)list.insertBefore(li,nextNode);
   previous=li;
  }
  for(const li of existing.values())li.remove();
  if(ready&&!rows.length&&!status.textContent)status.textContent=input.value.trim()?AifectMessages.searchEmpty:'아직 등록된 대상이 없습니다.';
  status.classList.toggle('fm-feedback',!rows.length&&loading.hidden&&!!status.textContent);
 }
 function showLoading(show){
  if(show&&loading.hidden)loading.innerHTML=rows.length?'<span class="fm-refresh" role="status">목록을 갱신하는 중…</span>':followSkeleton();
  loading.hidden=!show;list.setAttribute('aria-busy',String(show));
 }
 function invalidate(){clearTimeout(timer);searchControl?.cancel();reader?.abort();reader=new AbortController();return ++seq;}
 const options=()=>{const q=new URLSearchParams(base);q.set('q',simple?normalizeFollowSearch(input.value):input.value.trim());q.set('sort',sort.value);return q;};
 async function readPage(append=false,quiet=false){
  const ticket=invalidate(),revision=followRevision,q=options();if(append)q.set('offset',next);
  busy=true;status.textContent='';if(!quiet)showLoading(true);controls();
  try{const res=await readFollowData(q);
   if(ticket!==seq||!alive())return;if(revision!==followRevision)return readPage(false,quiet);d=res;dataStamp=followStamp();dataUntil=Date.now()+60000;ready=true;rows=append?[...new Map([...rows,...res.items].map(r=>[r.key,r])).values()]:res.items;next=res.next;status.textContent='';
  }catch(e){if(ticket===seq&&alive()){if(e.name==='AbortError')return void readPage(false);if(e.status===401||e.status===403){rows=[];followPageCache.clear();}if(!append&&!rows.length){ready=false;next=null;}status.innerHTML=esc(e.message)+' '+btn(append?'more':'retry','다시 시도');}}
  finally{if(ticket===seq&&alive()){busy=false;showLoading(false);paint();}}
 }
 async function selectAll(){
  if(chosen.size===d.matched&&chosen.size){chosen.clear();paint();return;}
  const ticket=invalidate(),q=options(),selection=new Map();q.set('keys','1');busy=true;status.textContent='선택 대상을 확인하고 있습니다.';paint();
  try{let after='';do{q.set('after',after);const res=await api('/api/follow-management?'+q,'GET',undefined,{fresh:true,signal:reader.signal});if(!alive()||ticket!==seq)return;
   for(const r of res.items)selection.set(r.key,r.name);after=res.next;
  }while(after);chosen=selection;status.textContent='';}catch(e){if(alive()&&ticket===seq)status.textContent=e.message;}
  finally{if(alive()&&ticket===seq){busy=false;paint();}}
 }
 function confirmAction(op,targets){
  const scope=tab==='artists'?d.name+'의 팬 관계':tab==='blocks'?'선택한 각 계정·아티스트의 차단 범위':tab==='following'?'내가 팔로우한 계정·아티스트':'내 개인 계정';
  const detail=op==='unblock'?'차단을 풀어도 이전 팔로우는 복구되지 않습니다.':op==='block'?'해당 범위에서 팔로우와 새 상호작용을 제한합니다. 기존 기록은 유지됩니다.':op==='remove'?'상대가 나를 팔로우한 관계만 해제합니다.':'내가 보낸 팔로우만 해제합니다.';
  dialog('<p class="popup-prompt">선택한 '+number(targets.size)+'명을 '+followOps[op]+'하시겠습니까?</p><p>'+esc(scope)+' · '+esc([...targets.values()].slice(0,3).join(', '))+(targets.size>3?' 외 '+number(targets.size-3)+'명':'')+'</p><p>'+esc(tab==='artists'&&op==='remove'?'이 아티스트를 향한 팔로우만 해제합니다.':detail)+'</p><div class="fm-confirm">'+btn('dismiss','취소')+btn('confirm',followOps[op])+'</div>');
  const modal=document.querySelector('#dialog');
  const dismissOutside=event=>{
   if(event.target!==modal)return;
   const box=modal.getBoundingClientRect();
   if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)modal.close();
  };
  modal.addEventListener('click',dismissOutside);
  modal.addEventListener('close',()=>modal.removeEventListener('click',dismissOutside),{once:true});
  modal.querySelector('[data-fm=dismiss]').onclick=()=>modal.close();
  modal.querySelector('[data-fm=dismiss]').focus();
  modal.querySelector('[data-fm=confirm]').onclick=()=>{modal.close();if(alive())runAction(op,targets);};
 }
 function runAction(op,targets){
  if(!mode&&targets.size===1&&(op==='follow'||op==='unfollow')){
   const row=rows.find(r=>targets.has(r.key));
   if(row)return void changeRelation(row,op==='follow');
  }
  void apply(op,targets);
 }
 function syncRelation(row,following){
  const delta=Number(following)-Number(!!row.following);
  row.following=following;
  if(d.own&&d.counts)d.counts.following=Math.max(0,d.counts.following+delta);
  const li=[...list.children].find(item=>item.dataset.key===row.key);
  if(d.own&&tab==='following'&&!following){
   rows=rows.filter(item=>item!==row);li?.remove();
   d.total=Math.max(0,d.total-1);d.matched=Math.max(0,d.matched-1);
   if(next!==null)next=Math.max(0,next-1);
   controls();if(!rows.length)paint();
  }else if(li){
   const button=li.querySelector('[data-follow]');
   if(button?.hasAttribute('data-fm'))button.dataset.fm=following?'unfollow':'follow';
   paintFollowState(relationKey(row),following,false,undefined,!!row.follows_viewer);
   li.fmHTML=rowHTML(row);
  }
  dataStamp=followStamp();dataUntil=Date.now()+60000;
  if(simple)paint();
 }
 async function changeRelation(row,following){
  const key=relationKey(row);
  if(pendingFollows.has(key)||busy||!alive())return;
  busy=true;input.readOnly=true;sort.disabled=true;
  pendingFollows.set(key,viewer);paintFollowState(key,!!row.following,true);
  try{
   const response=await api('/api/follow-management?'+base,'POST',{action:following?'follow':'unfollow',keys:[row.key]});
   if(viewer!==me?.id)return;
   if(!response.ok.includes(row.key))throw new Error('관계가 변경되었습니다. 목록을 다시 확인해 주세요.');
   const [kind,id]=key.split('/');
   updateFollowLocal(kind,id,following,{name:row.name,image_version:row.image_version});
   if(alive())syncRelation(row,following);
   const counter=[...document.querySelectorAll('[data-followers]')].find(el=>el.dataset.followers===key);
   const count=counter?Math.max(0,Number(counter.dataset.count)+(following?1:-1)):undefined;
   paintFollowState(key,following,false,count,!!row.follows_viewer);
   window.dispatchEvent(new CustomEvent('aifect:follow-saved',{detail:{kind,id,following,source:root,followsViewer:!!row.follows_viewer}}));
  }catch(error){
   if(viewer===me?.id){paintFollowState(key,!!row.following,false);toast(error.message);}
  }finally{
   if(pendingFollows.get(key)===viewer)pendingFollows.delete(key);
   if(alive()){busy=false;input.readOnly=false;sort.disabled=false;controls();}
  }
 }
 async function apply(op,targets){
  if(simple&&(op==='block'||op==='unblock'))return applyPersonalBlock(op,targets);
  if(busy||!alive())return;busy=true;input.disabled=sort.disabled=true;const picker=find('.fm-artist');if(picker)picker.disabled=true;
  const failed=new Map(),ok=[],all=[...targets.keys()];let uncertain='';
  paint();status.textContent='처리 중…';
  try{for(let i=0;i<all.length;i+=80){if(viewer!==me?.id){uncertain='계정이 변경되었습니다.';for(const k of all.slice(i))failed.set(k,targets.get(k));break;}const keys=all.slice(i,i+80);
   try{const r=await api('/api/follow-management?'+base,'POST',{action:op,keys});ok.push(...r.ok);for(const k of r.failed)failed.set(k,targets.get(k));}
   catch(e){uncertain=e.message;for(const k of all.slice(i))failed.set(k,targets.get(k));break;}
  }}finally{
   if(viewer===me?.id){++followRevision;void refreshLibrary(true).catch(()=>{});}
   if(!alive()&&viewer===me?.id)toast('팔로우 관리 · 완료 '+number(ok.length)+'명'+(failed.size?' · 확인 필요 '+number(failed.size)+'명':''));
   if(alive()){clear();input.disabled=sort.disabled=false;if(picker)picker.disabled=false;await readPage();
    if(alive()){
     const note=document.createElement('div');note.setAttribute('role','status');note.textContent='완료 '+number(ok.length)+'명'+(failed.size?' · '+(uncertain?'처리 미확인':'실패')+' '+number(failed.size)+'명':'')+(uncertain?' · '+uncertain:'');
     if(failed.size){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='처리 결과 보기';details.append(summary);for(const [title,keys] of [['완료',ok],[uncertain?'미확인':'실패',[...failed.keys()]]]){const p=document.createElement('p');p.textContent=title+': '+keys.map(k=>targets.get(k)).join(', ');details.append(p);}note.append(details);}status.prepend(note);
    }
   }
   if(ok.length&&viewer===me?.id&&root.closest('.fm-stable'))window.dispatchEvent(new CustomEvent('aifect:follow-saved',{detail:{source:root}}));
  }
 }
 async function applyPersonalBlock(op,targets){
  if(busy||!alive()||targets.size!==1)return;
  const row=rows.find(item=>targets.has(item.key));if(!row)return;
  busy=true;input.readOnly=true;sort.disabled=true;
  const card=[...list.children].find(item=>item.dataset.key===row.key);
  card?.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{
   const response=await api('/api/follow-management?'+base,'POST',{action:op,keys:[row.key]});
   if(viewer!==me?.id)return;
   if(!response.ok.includes(row.key))throw new Error('관계가 변경되었습니다. 목록을 다시 확인해 주세요.');
   ++followRevision;void refreshLibrary(true).catch(()=>{});
   if(alive()){
    rows=rows.filter(item=>item!==row);card?.remove();
    d.total=Math.max(0,d.total-1);d.matched=Math.max(0,d.matched-1);
    if(next!==null)next=Math.max(0,next-1);
    if(d.counts){
     d.counts.blocks=Math.max(0,(d.counts.blocks||0)+(op==='block'?1:-1));
     if(op==='block'){d.counts.followers=Math.max(0,d.counts.followers-Number(!!row.follows_viewer));d.counts.following=Math.max(0,d.counts.following-Number(!!row.following));}
    }
    // Retain the remaining cards while reconciling the server's exact counts.
    paint();await readPage(false,true);
   }
   window.dispatchEvent(new CustomEvent('aifect:follow-saved',{detail:{source:root}}));
  }catch(error){if(viewer===me?.id)toast(error.message);}
  finally{if(alive()){busy=false;input.readOnly=false;sort.disabled=false;card?.querySelectorAll('button').forEach(button=>button.disabled=false);controls();}}
 }
 let requested=input.value.trim();
 function search(){
  const term=input.value.trim();if(input.readOnly||term===requested)return;
  requested=term;invalidate();clear();ready=false;busy=false;status.textContent='';onFilters?.(term,sort.value);
  showLoading(true);paint();timer=setTimeout(()=>readPage(),220);
 }
 if(simple)searchControl=bindFollowSearch(input,find('.fm-search-clear'),{
  cancelRead:invalidate,
  pending(query){invalidate();clear();ready=false;busy=false;onFilters?.(query,sort.value);showLoading(false);list.setAttribute('aria-busy','true');controls();},
  read:()=>readPage(false,true)
 });
 else{input.oninput=e=>{if(!e.isComposing)search();};input.oncompositionend=search;}
 sort.onchange=()=>{ready=false;onFilters?.(input.value.trim(),sort.value);void readPage();};
 const nav=find('.fm-tabs'),active=nav?.querySelector('[aria-current]');
 const revealActive=()=>{if(!active||!nav.clientWidth)return;const a=active.getBoundingClientRect(),n=nav.getBoundingClientRect();if(a.right>n.right)nav.scrollLeft+=a.right-n.right;else if(a.left<n.left)nav.scrollLeft+=a.left-n.left;};
 const tabWidth=new ResizeObserver(revealActive);if(nav)tabWidth.observe(nav);
 const picker=find('.fm-artist');if(picker)picker.onchange=()=>{location.hash=picker.value?'artist-followers/'+encodeURIComponent(picker.value):'follow?tab=followers';};
 more.onclick=()=>{if(!busy)void readPage(true);};
 root.onchange=e=>{if(!e.target.matches('.fm-check'))return;const r=rows.find(r=>r.key===e.target.closest('li').dataset.key);if(r){if(e.target.checked)chosen.set(r.key,r.name);else chosen.delete(r.key);controls();}};
 root.onclick=e=>{
  const b=e.target.closest('[data-fm]');if(!b){if(busy&&e.target.closest('[data-follow]')){e.stopPropagation();return;}const item=e.target.closest('li[data-key]'),check=item?.querySelector('.fm-check');if(mode&&!busy&&check&&e.target!==check)check.click();return;}e.stopPropagation();if(busy||b.disabled)return;const action=b.dataset.fm,r=rows.find(r=>r.key===b.closest('li')?.dataset.key);
  if(action==='retry'||action==='more')return void readPage(action==='more');
  if(action==='photo'&&r){return void openProfilePreview(r.artist_id?'artist:'+r.artist_id:r.profile_id||'member:'+r.uid,b);}
  if(action==='select'||action==='cancel'){clear();mode=action==='select';paint();return;}
  if(action==='all')return void selectAll();const targets=r?new Map([[r.key,r.name]]):new Map(chosen);
  if(targets.size){if(action==='follow')runAction(action,targets);else confirmAction(action,targets);}
 };
 // Use actual fixed shell bounds, including the optional player and safe-area nav.
 const layers=[...document.querySelectorAll('.mobile-navigation,.player,#player-extension')];
 const layout=()=>{let reserved=0;for(const el of layers){const r=el.getBoundingClientRect();if(!r.height)continue;const style=getComputedStyle(el);
   // A player entering with translateY has not reached its final fixed position yet.
   const fixed=style.position==='fixed'?el.offsetHeight+(parseFloat(style.bottom)||0):0;
   reserved=Math.max(reserved,fixed,innerHeight-r.top);
  }root.style.setProperty('--fm-bottom',Math.ceil(reserved)+'px');};
 const onExternalFollow=event=>{
  if(root.closest('.fm-stable'))return;
  if(!alive()||event.detail?.source===root)return;
  const {kind,id,following,followsViewer}=event.detail||{},row=rows.find(r=>relationKey(r)===kind+'/'+id);
  if(row&&!busy){if(followsViewer!==undefined)row.follows_viewer=followsViewer;syncRelation(row,following);}
  else if(d.own&&tab==='following'&&!busy)void readPage();
 };window.addEventListener('aifect:follow-saved',onExternalFollow);
 const watch=new ResizeObserver(layout);layers.forEach(el=>watch.observe(el));window.addEventListener('resize',layout);
 root._followRefresh=()=>readPage();
 root._followRelease=registerRouteCleanup(()=>{disposed=true;invalidate();watch.disconnect();tabWidth.disconnect();window.removeEventListener('aifect:follow-saved',onExternalFollow);window.removeEventListener('resize',layout);});layout();paint();
}
