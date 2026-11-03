const liveRoomLabels={karaoke:'노래방',talk:'토킹룸'};
function liveTypeIcon(mode){
 return `<span aria-hidden="true" class="live-type-icon live-type-${mode}"></span>`;
}
function liveRoomTypeFields(){
 return '<fieldset class="live-mode"><legend>방 유형</legend><div>'+Object.entries(liveRoomLabels).map(([mode,label])=>
  `<label><input type="radio" name="mode" value="${mode}">${liveTypeIcon(mode)}${label}</label>`).join('')+'</div></fieldset>';
}
function talkingRoomCard(room){
 const mode=room.mode==='karaoke'?'karaoke':'talk',host=room.host_name||'';
 const profiles=me?.id?(room.followed_profiles||[]).slice(0,3):[];
 const restricted=!!room.visibility&&room.visibility!=='public';
 const path=room.theme?.assets?.roomCard;
 const art=path&&/^\/assets\/[\w/-]+\.webp$/.test(path)&&(!room.themeUntil||room.themeUntil>Date.now())
  ?`<img class="talk-cover" src="${esc(path)}" alt="" loading="lazy" decoding="async">`:'';
 return `<a class="v3-room-card" data-talk-id="${esc(room.id)}" data-room-mode="${mode}" href="#${mode==='karaoke'?'live':'voice'}/${esc(room.id)}">
  <div class="live-card-head"><span class="talk-host">${avatarImage(room.host_profile||{name:host},'producer',false,false)}<span title="${esc(host)}">${esc(host)}</span></span>
   ${Number.isInteger(room.member_count)&&Number.isInteger(room.max_members)?`<span class="v3-room-count" aria-label="${restricted?'입장 제한, ':''}참여 ${room.member_count}명, 정원 ${room.max_members}명">${icon(restricted?'lock':'users')}${room.member_count}/${room.max_members}</span>`:''}
  </div><div class="v3-room-art" data-theme="${esc(room.theme?.sku||room.background||'navy')}">${art}
   ${profiles.length?`<span class="talk-follows" role="group" aria-label="팔로우한 참여자">${profiles.map(p=>avatarImage(p,'producer',false,false)).join('')}</span>`:''}
  </div><div class="v3-room-copy"><h3 title="${esc(room.title)}">${esc(room.title)}</h3><span role="img" aria-label="${liveRoomLabels[mode]}">${liveTypeIcon(mode)}</span></div></a>`;
}
function liveDirectoryHTML(defaultMode){
 const filters=Object.entries({all:'전체',...liveRoomLabels}).map(([value,label])=>
  `<button type="button" data-room-filter="${value}" aria-pressed="${value==='all'}">${value==='all'?'':liveTypeIcon(value)}${label}</button>`).join('');
 return `<div class="talk-directory" data-default-mode="${defaultMode}">${communityNavigation('live')}
 <section class="community-v3 room-lobby live-directory" aria-label="라이브 방">
  <div class="live-tools"><div class="live-filters" role="group" aria-label="방 유형 필터">${filters}</div>
   <div class="directory-actions"><div class="brand-search directory-search">${icon('search')}<input id="v3-room-search" type="search" maxlength="100" placeholder="방 제목 또는 방장 검색" aria-label="방 제목 또는 방장 검색">
   <button type="button" data-live-reset aria-label="전체 방 보기" title="전체 방 보기"><span aria-hidden="true" class="live-home-icon"></span></button></div>
   <button type="button" class="primary-button" id="v3-create-room" disabled>${icon('plus')} 방 만들기</button></div></div>
  <div class="live-list-space"><div class="talk-scroll" role="region" aria-label="라이브 방 목록" tabindex="0"><div class="v3-room-grid"></div>
   <div class="talk-status" role="status" hidden><span></span> <button type="button" class="small-button" hidden>다시 시도</button></div>
   <div class="talk-sentinel" aria-hidden="true"></div></div></div>
  <dialog id="v3-room-create" class="voice-sheet" aria-labelledby="v3-create-title"><header class="voice-sheet-heading"><h2 id="v3-create-title">방 만들기</h2>
   <button type="button" id="v3-close-create" aria-label="닫기">${voiceGlyph('close')}</button></header>${voiceSettingsFormHTML('create',true)}</dialog></section></div>`;
}
let talkingRoomReturn=null;

function bindTalkingDirectory(root){
 const grid=root.querySelector('.v3-room-grid'),search=root.querySelector('#v3-room-search'),create=root.querySelector('#v3-create-room');
 const status=root.querySelector('.talk-status'),message=status.querySelector('span'),retry=status.querySelector('button'),sentinel=root.querySelector('.talk-sentinel');
 const pane=root.querySelector('.talk-scroll');
 const viewer=me?.id||'';
 const saved=talkingRoomReturn?.route===location.hash&&talkingRoomReturn.viewer===viewer&&talkingRoomReturn.until>Date.now()?talkingRoomReturn:null;
 talkingRoomReturn=null;
 let items=new Map(saved?.items),cursor=saved?.cursor||null,done=saved?.done||false;
 let controller=null,debounce,expiry,disposed=false;
 let mode=saved?.mode||'all',refreshController;
 const filterButtons=root.querySelectorAll('[data-room-filter]');
 function setFilter(value){
  mode=value;root.dataset.filter=value;
  for(const btn of filterButtons)btn.setAttribute('aria-pressed',String(btn.dataset.roomFilter===value));
 }
 setFilter(mode);
 for(const btn of filterButtons)btn.onclick=()=>{if(mode!==btn.dataset.roomFilter){setFilter(btn.dataset.roomFilter);reset();}};
 root.querySelector('[data-live-reset]').onclick=()=>{search.value='';setFilter('all');reset();};
 grid.addEventListener('error',e=>{if(e.target.matches?.('.talk-cover'))e.target.remove();},true);
 const observer=new IntersectionObserver(entries=>{
  if(entries.some(e=>e.isIntersecting))void load();
 },{root:pane,rootMargin:'0px 0px 160px'});
 function watchEnd(on){
  if(on)observer.observe(sentinel);else observer.unobserve(sentinel);
 }
 function notice(text='',failed=false){
  message.textContent=text;retry.hidden=!failed;status.hidden=!text;
 }
 function expireCovers(){
  clearTimeout(expiry);let next=Infinity;
  for(const room of items.values()){
   if(!room.themeUntil)continue;
   if(room.themeUntil<=Date.now()){
    grid.querySelector('[data-talk-id="'+CSS.escape(room.id)+'"] .talk-cover')?.remove();
    room.themeUntil=0;room.theme={sku:'navy'};room.background='navy';
   }else next=Math.min(next,room.themeUntil);
  }
  if(Number.isFinite(next))expiry=setTimeout(expireCovers,Math.min(next-Date.now()+50,2147483647));
 }
 function ready(){
  sentinel.hidden=done;
  if(!items.size&&done)notice(search.value.trim()?'검색 결과가 없어요.':'아직 열린 방이 없어요.');
  if(!done)watchEnd(true);
 }
 async function load(){
  if(disposed||controller||done)return;
  refreshController?.abort();
  watchEnd(false);const active=controller=new AbortController();
  notice();grid.setAttribute('aria-busy','true');
  const pendingNotice=setTimeout(()=>{
   if(controller===active&&!disposed)notice('라이브 목록을 불러오는 중이에요.');
  },450);
  try{
   const params=new URLSearchParams({limit:'24',mode}),query=search.value.trim();
   if(query)params.set('q',query);if(cursor)params.set('cursor',cursor);
   const page=await voiceRequest('public-rooms?'+params,undefined,'GET',active.signal);
   if(active.signal.aborted||disposed)return;
   root.dataset.enabled=String(page.enabled!==false);if(!create.dataset.opening)create.disabled=page.enabled===false;
   if(page.enabled===false){done=true;notice('라이브 서비스 연결을 준비하고 있어요.');return;}
   const added=[];
   for(const room of page.rooms){
    if(items.has(room.id))continue;
    if(room.theme?.expires_at)room.themeUntil=Date.now()+(room.theme.expires_at-room.theme.server_now)*1000;
    items.set(room.id,room);added.push(talkingRoomCard(room));
   }
   grid.insertAdjacentHTML('beforeend',added.join(''));
   done=!page.next_cursor||page.next_cursor===cursor;cursor=page.next_cursor;
   notice();expireCovers();ready();
  }catch(e){if(!active.signal.aborted)notice('라이브 목록을 불러오지 못했어요.',true);}
  finally{clearTimeout(pendingNotice);if(controller===active){controller=null;grid.setAttribute('aria-busy','false');}}
 }
 function reset(){
  clearTimeout(debounce);clearTimeout(expiry);refreshController?.abort();watchEnd(false);
  pane.scrollTop=0;
  controller?.abort();controller=null;items=new Map();cursor=null;done=false;
  grid.replaceChildren();notice();grid.setAttribute('aria-busy','true');
  debounce=setTimeout(load,220);
 }
 async function refresh(){
  if(document.hidden||disposed||controller||refreshController||!done&&!items.size||root.querySelector('dialog[open]'))return;
  const atTop=()=>pane.scrollTop<2;
  const refreshTop=atTop()&&!grid.contains(document.activeElement);
  const viewport=pane.getBoundingClientRect();
  const visible=refreshTop?[]:[...grid.children].filter(el=>{
   const rect=el.getBoundingClientRect();return rect.bottom>viewport.top&&rect.top<viewport.bottom;
  }).slice(0,24);
  if(!refreshTop&&!visible.length)return;
  const active=refreshController=new AbortController();
  const params=new URLSearchParams({limit:'24',mode,q:search.value.trim()});
  if(!refreshTop)params.set('ids',visible.map(el=>el.dataset.talkId).join(','));
  try{
   const page=await voiceRequest('public-rooms?'+params,undefined,'GET',active.signal);
   if(active.signal.aborted||disposed||controller)return;
   if(refreshTop&&(!atTop()||grid.contains(document.activeElement)))return;
   const latest=new Map(page.rooms.map(room=>{
    if(room.theme?.expires_at)room.themeUntil=Date.now()+(room.theme.expires_at-room.theme.server_now)*1000;
    return [room.id,room];
   }));
   if(refreshTop){
    watchEnd(false);items=latest;cursor=page.next_cursor;done=!cursor;
    grid.innerHTML=[...items.values()].map(talkingRoomCard).join('');
   }else for(const el of visible){
    const id=el.dataset.talkId,room=latest.get(id);
    if(!room){items.delete(id);el.remove();continue;}
    items.set(id,room);
    const next=document.createElement('template');next.innerHTML=talkingRoomCard(room);
    el.replaceChildren(...next.content.firstElementChild.childNodes);
   }
   root.dataset.enabled=String(page.enabled!==false);if(!create.dataset.opening)create.disabled=page.enabled===false;
   notice();expireCovers();ready();
   if(page.enabled===false)notice('라이브 서비스 연결을 준비하고 있어요.');
  }catch{
   if(!active.signal.aborted&&!disposed){
    for(const room of items.values())room.followed_profiles=[];
    grid.querySelectorAll('.talk-follows').forEach(group=>group.remove());
   }
  }
  finally{if(refreshController===active)refreshController=null;}
 }
 const poll=setInterval(refresh,20000);
 window.addEventListener('aifect:follow-saved',refresh);
 document.addEventListener('visibilitychange',refresh);
 search.oninput=reset;retry.onclick=()=>{done=false;void load();};
 grid.addEventListener('click',e=>{
  if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||!e.target.closest('[data-talk-id]'))return;
  talkingRoomReturn={viewer,mode,route:location.hash,until:Date.now()+120000,query:search.value,items:[...items],cursor,done,scroll:pane.scrollTop};
 });
 registerRouteCleanup(()=>{
  disposed=true;clearInterval(poll);refreshController?.abort();document.removeEventListener('visibilitychange',refresh);observer.disconnect();controller?.abort();clearTimeout(debounce);clearTimeout(expiry);
  window.removeEventListener('aifect:follow-saved',refresh);
 });
 if(saved){
  // The scroll snapshot may predate a leave or unfollow while inside a room.
  for(const room of items.values())room.followed_profiles=[];
  search.value=saved.query;root.dataset.enabled='true';create.disabled=false;grid.innerHTML=[...items.values()].map(talkingRoomCard).join('');expireCovers();
  requestAnimationFrame(()=>{if(!disposed){pane.scrollTo({top:saved.scroll,behavior:'instant'});ready();void refresh();}});
 }else void load();
}
function bindVoiceLobby(){
 const root=document.querySelector('.talk-directory');if(!root)return;
 const open=root.querySelector('#v3-create-room'),modal=root.querySelector('#v3-room-create'),form=modal.querySelector('form');
 const fields=form.elements,generate=form.querySelector('[data-auto-title]'),error=form.querySelector('.form-error');
 const crewChoice=form.querySelector('[name="visibility"][value="crew"]'),crewInfo=form.querySelector('.voice-crew-setting');
 const capacityButtons=form.querySelectorAll('[data-capacity]');
 let requestId,generation=0,closing=false,currentMode=null,titleDrafts={},currentCrew=null,crewIssue='';
 function updateMode(){
  if(currentMode)titleDrafts[currentMode]=fields.title.value;
  currentMode=fields.mode.value==='karaoke'?'karaoke':'talk';
  fields.mode.value=currentMode;fields.title.required=currentMode==='karaoke';
  fields.title.value=titleDrafts[currentMode]||'';
 }
 function updateCrew(){
  crewInfo.hidden=!!currentCrew&&fields.visibility.value!=='crew';
  crewInfo.textContent=currentCrew?'소속 크루 · '+currentCrew.name:crewIssue;
 }
 function updateCapacity(){
  const value=fields.max_members.valueAsNumber;
  for(const button of capacityButtons)button.setAttribute('aria-pressed',String(Number.isInteger(value)&&value===Number(button.dataset.capacity)));
 }
 const viewport=window.visualViewport;
 function fitViewport(){
  if(!viewport||!modal.open)return;
  modal.style.setProperty('--live-vh',viewport.height+'px');
  modal.style.setProperty('--live-top',viewport.offsetTop+'px');
 }
 function focusBack(){if(open.isConnected&&!open.disabled)open.focus({preventScroll:true});}
 function finish(){
  generation++;closing=false;
  if(modal.open){modal.close();requestAnimationFrame(focusBack);}
 }
 function dismiss(){
  if(form._busy||closing)return;
  if(history.state?.liveCreate===requestId){closing=true;history.back();}else finish();
 }
 open.onclick=async()=>{
  if(!me){returnRoute=location.hash;location.hash='#account';return;}
  if(open.dataset.opening||modal.open)return;
  open.dataset.opening='true';open.disabled=true;
  try{
   const options=await voiceRequest('options');if(!root.isConnected)return;
   requestId=crypto.randomUUID();generation++;currentMode=null;
   titleDrafts={talk:options.suggested_titles?.talk||options.suggested_title||'',karaoke:options.suggested_titles?.karaoke||''};
   form.reset();generate.disabled=false;error.textContent='';
   fields.mode.value=root.dataset.filter==='all'?root.dataset.defaultMode:root.dataset.filter;
   fields.visibility.value='public';fields.max_members.value='30';
   fillRoomThemeChoices(form,options,'navy');fields.background.value='navy';
   const crews=options.crews||[];currentCrew=crews.length===1?crews[0]:null;
   crewIssue=crews.length?'크루 소속 정보를 확인해주세요. 새로고침 후 다시 시도할 수 있어요.':'소속 크루가 있어야 크루 방을 만들 수 있어요.';
   crewChoice.disabled=!currentCrew;crewChoice.closest('label').title=currentCrew?'':crewIssue;
   fields.crew_id.value=currentCrew?.id||'';
   form.querySelector('#voice-notice-length').textContent='0/200';updateMode();updateCrew();updateCapacity();
   history.pushState({...history.state,liveCreate:requestId},'');modal.showModal();fitViewport();
  }catch(e){if(root.isConnected)toast(e.message);}
  finally{delete open.dataset.opening;open.disabled=root.dataset.enabled==='false';}
 };
 fields.title.oninput=()=>{titleDrafts[currentMode]=fields.title.value;generation++;generate.disabled=false;};
 fields.max_members.oninput=updateCapacity;
 for(const button of capacityButtons)button.onclick=()=>{fields.max_members.value=button.dataset.capacity;updateCapacity();};
 form.onchange=e=>{if(e.target.name==='mode'){generation++;generate.disabled=false;updateMode();}if(e.target.name==='visibility')updateCrew();if(e.target.name==='max_members')updateCapacity();};
 fields.announcement.oninput=()=>{form.querySelector('#voice-notice-length').textContent=fields.announcement.value.length+'/200';};
 generate.onclick=async()=>{
  const token=++generation,mode=currentMode;generate.disabled=true;error.textContent='';
  try{
   const options=await voiceRequest('options?'+new URLSearchParams({mode,exclude:fields.title.value}));
   if(token===generation&&modal.open){titleDrafts[mode]=options.suggested_title||options.suggested_titles?.[mode];fields.title.value=titleDrafts[mode];}
  }catch(e){if(token===generation&&modal.open)error.textContent=e.message;}
  finally{if(token===generation&&form.isConnected)generate.disabled=false;}
 };
 modal.querySelector('#v3-close-create').onclick=dismiss;
 modal.oncancel=e=>{e.preventDefault();dismiss();};
 modal.onclick=e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss();}};
 const onBack=()=>{if(history.state?.liveCreate!==requestId)finish();};
 window.addEventListener('popstate',onBack);
 viewport?.addEventListener('resize',fitViewport);viewport?.addEventListener('scroll',fitViewport);
 registerRouteCleanup(()=>{
  generation++;window.removeEventListener('popstate',onBack);
  viewport?.removeEventListener('resize',fitViewport);viewport?.removeEventListener('scroll',fitViewport);
  if(modal.open)modal.close();
 });
 form.onsubmit=busyForm(form,async data=>{
  const b=Object.fromEntries(data),capacity=Number(b.max_members);
  if(!String(b.max_members??'').trim()||!Number.isInteger(capacity)||capacity<2||capacity>30)throw Error('참여 인원은 2~30명 사이의 정수로 입력해주세요.');
  if(b.visibility==='crew'&&!currentCrew)throw Error(crewIssue);
  b.crew_id=b.visibility==='crew'?currentCrew.id:'';prepareVoiceListening();
  const creating=requestId;
  const result=await voiceRequest('rooms',{...b,max_members:capacity,request_id:creating});
  if(root.isConnected&&modal.open&&creating===requestId){
   modal.close();
   location.replace('#'+(result.room.mode==='karaoke'?'live':'voice')+'/'+encodeURIComponent(result.room.id));
  }
 });
 bindTalkingDirectory(root);
}

async function playBrowseV3(raw,readApi=api){
 const p=new URLSearchParams(raw.split('?')[1]||''),type=['solo','duet','dubbing','following'].includes(p.get('type'))?p.get('type'):'solo';
 let html=heading('플레이','완성된 목소리를 만나보세요.')+singingHubNav('browse')+'<nav class="v3-segments" aria-label="작품 둘러보기">'+[['solo','솔로'],['duet','듀엣'],['dubbing','더빙'],['following','팔로잉']].map(([key,label])=>'<a href="#karaoke/browse?type='+key+'" '+(key===type?'aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>';
 if(type==='following'&&!me){returnRoute=location.hash;return {html:html+gate()};}
 if(type==='dubbing'){const d=await readApi('/api/dubbing/projects?tab=complete');return {html:html+'<div class="dubbing-grid">'+(d.projects.map(dubbingCard).join('')||'<p class="v3-empty">아직 공개된 완성 더빙이 없어요.</p>')+'</div>'};}
 const d=await readApi('/api/community?kind=cover&completed=1&'+(type==='following'?'following=1':'cover_mode='+type));return {html:html+communityFeed(d.tracks),tracks:d.tracks};
}
async function communityRankingV3(raw,readApi=api){
 const p=new URLSearchParams(raw.split('?')[1]||''),category=['work','aiArtist','relationship','crew','dubbing'].includes(p.get('category'))?p.get('category'):'work',period=p.get('period')==='month'?'month':'week',kind=['solo','duet','dubbing'].includes(p.get('workKind'))?p.get('workKind'):'solo';
 const href=changes=>'#community/rankings?'+new URLSearchParams({category,period,workKind:kind,...changes});
 const nav=(items,key,value)=>'<nav '+(key==='period'?'data-dropdown-links="sm" ':'')+'class="v3-segments" aria-label="'+(key==='period'?'집계 기간':'랭킹 종류')+'">'+items.map(([v,label])=>`<a href="${esc(href({[key]:v}))}" ${value===v?'aria-current="page"':''}>${label}</a>`).join('')+'</nav>';
 let html=communityNavigation('rankings')+'<section class="community-v3">'+nav([['work','작품 랭킹'],['aiArtist','AI 아티스트'],['relationship','관계 랭킹'],['crew','크루 랭킹'],['dubbing','더빙 랭킹']],'category',category)+'<div class="v3-toolbar">'+(category==='work'?nav([['solo','솔로'],['duet','듀엣'],['dubbing','더빙']],'workKind',kind):'<h2>'+({aiArtist:'AI 아티스트 랭킹',relationship:'관계 랭킹',crew:'크루 랭킹',dubbing:'더빙 랭킹'}[category])+'</h2>')+nav([['week','주간'],['month','월간']],'period',period)+'</div>';
 try{const d=await readApi('/api/community/rankings?'+new URLSearchParams({category,period,workKind:kind}));
 const isDub=category==='dubbing'||category==='work'&&kind==='dubbing';
 const date=n=>new Date(n*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
 html+='<p class="v3-period">'+esc(date(d.from))+' ~ '+esc(date(d.until))+' · KST<br>최종 갱신 '+esc(date(d.updated_at))+'</p>';
 html+=d.rows.length?'<ol class="v3-ranking">'+d.rows.map((r,i)=>`<li data-list-row><b class="v3-rank">${i+1}</b><a href="${esc(r.href)}">${category==='aiArtist'?avatarImage(r,'artist'):isDub?'<span class="v3-dub-art" role="img" aria-label="더빙 작품">'+icon('message')+'</span>':''}<strong>${esc(r.name)}</strong><small>${esc(r.detail||'')}</small></a><span><strong>${number(r.score)}점</strong><small>${isDub?number(r.reactions)+' 유효 좋아요':number(r.listeners||0)+' 유효 청취 · '+number(r.gold||0)+' G · '+number(r.silver||0)+' S'}</small></span></li>`).join('')+'</ol>':'<div class="v3-empty"><h3>아직 집계된 순위가 없어요.</h3><p>'+esc(d.message||'기간 내 유효한 활동이 쌓이면 순위를 표시해요.')+'</p></div>';
 }catch(e){html+='<p role="alert">'+esc(e.message)+'</p>';}
 return {html:html+'</section>'};
}
function crewV3SettingsHTML(c){return `<label class="form-field">가입 방식<select name="join_policy">${[['open','자유가입'],['approval','승인제'],['invite_only','초대전용']].map(([v,n])=>`<option value="${v}" ${c?.join_policy===v?'selected':''}>${n}</option>`).join('')}</select></label><label class="form-field">최소 사용자 레벨<input type="number" name="minimum_level" min="1" max="100" value="${c?.minimum_level||1}"></label><label class="form-field">최대 인원${c?'':' (0: 크루 레벨 기본값)'}<input type="number" name="member_limit" min="0" max="150" value="${c?.member_limit||0}" ${c?'aria-describedby="crew-limit-help"':''}></label>${c?'<p class="field-help" id="crew-limit-help">0을 입력하면 크루 레벨의 기본 정원을 사용해요.</p>':''}<label class="form-field">공지<textarea name="notice" maxlength="1000">${esc(c?.notice||'')}</textarea></label>`;}
function crewV3WorksHTML(d){
 const items=[...(d.tracks||[]).map(t=>({id:t.id,title:t.title,kind:t.cover_mode==='duet'?'duet':'solo',created:t.created,href:'#song/'+t.id,track:t})),...(d.dubbings||[]).map(p=>({...p,kind:'dubbing',created:p.updated,href:'#dubbing/'+p.id}))].sort((a,b)=>b.created-a.created||a.id.localeCompare(b.id));
 return '<div class="section-heading"><h2>크루 작품</h2><span>공개일 최신순</span></div>'+(items.length?'<div class="v3-crew-works">'+items.map(w=>'<article data-list-row class="v3-crew-work">'+(w.track?cover(w.track,'mini-cover'):'<span class="mini-cover">'+icon('mic')+'</span>')+'<a href="'+esc(w.href)+'"><strong>'+icon(w.kind==='duet'?'users':w.kind==='dubbing'?'message':'mic')+esc(w.title)+'</strong><small>'+({solo:'솔로',duet:'듀엣',dubbing:'더빙'}[w.kind])+'</small></a>'+(w.track?'<button class="list-action icon-button" data-play="'+esc(w.id)+'" title="'+esc(w.title)+' 재생" aria-label="'+esc(w.title)+' 재생">'+icon('play')+'</button>':'')+'</article>').join('')+'</div>':'<p class="v3-empty">현재 크루원이 공개한 완성 작품이 없어요.</p>');
}
