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
  ${globalThis.AifectChristmasReview?.roomArt()||''}<div class="live-card-head"><span class="talk-host">${avatarImage(room.host_profile||{name:host},'producer',false,false)}<span title="${esc(host)}">${userNickname(host,{profileId:room.host_profile?.profile_id||room.host_profile?.id,userId:room.host_profile?.user_id||room.host_id})}</span></span>
   ${Number.isInteger(room.member_count)&&Number.isInteger(room.max_members)?`<span class="v3-room-count" aria-label="${restricted?'입장 제한, ':''}참여 ${room.member_count}명, 정원 ${room.max_members}명">${icon(restricted?'lock':'users')}${room.member_count}/${room.max_members}</span>`:''}
  </div><div class="v3-room-art" data-theme="${esc(room.theme?.sku||room.background||AifectPlayer.DEFAULT_ROOM_SKIN.sku)}">${art}
   ${profiles.length?`<span class="talk-follows" role="group" aria-label="팔로우한 참여자">${profiles.map(p=>avatarImage(p,'producer',false,false)).join('')}</span>`:''}
  </div><div class="v3-room-copy"><h3 title="${esc(room.title)}">${esc(room.title)}</h3><span role="img" aria-label="${liveRoomLabels[mode]}">${liveTypeIcon(mode)}</span></div></a>`;
}
function liveDirectoryHTML(defaultMode){
 const filters=Object.entries({all:'전체',...liveRoomLabels}).map(([value,label])=>
  `<button type="button" data-room-filter="${value}" aria-pressed="${value==='all'}">${value==='all'?'':liveTypeIcon(value)+`<span class="live-filter-vector" aria-hidden="true">${icon(value==='karaoke'?'mic-handheld':'message')}</span>`}${label}</button>`).join('');
 return `${communityNavigation('live')}<div class="talk-directory" data-default-mode="${defaultMode}">
 <section class="community-v3 room-lobby live-directory" aria-label="라이브 방">
  <div class="live-tools"><div class="live-filters" role="group" aria-label="방 유형 필터">${filters}</div>
   <button type="button" class="live-search-toggle" data-live-search-open aria-label="방 검색" aria-controls="v3-room-search" aria-expanded="false">${icon('search')}</button>
   <button type="button" class="live-search-toggle" data-live-search-close aria-label="검색 닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7"/></svg></button>
   <div class="directory-actions"><div class="brand-search directory-search">${icon('search')}<input id="v3-room-search" type="search" enterkeyhint="search" maxlength="100" placeholder="방 제목 또는 방장 검색" aria-label="방 제목 또는 방장 검색">
   <button type="button" data-live-search-clear aria-label="검색어 지우기" hidden>${voiceGlyph('close')}</button>
   <button type="button" data-live-reset aria-label="전체 방 보기" title="전체 방 보기"><span aria-hidden="true" class="live-home-icon"></span></button></div>
   <button type="button" class="primary-button" id="v3-create-room" aria-label="방 만들기" disabled>${icon('plus')}<span class="live-create-label">방 만들기</span></button></div></div>
  <div class="live-list-space"><div class="talk-scroll" role="region" aria-label="라이브 방 목록" tabindex="0"><div class="v3-room-grid"></div>
   <div class="talk-status" role="status" hidden><img class="live-empty-art" width="242" height="242" alt=""><span></span> <button type="button" class="small-button" hidden>다시 시도</button></div>
   <div class="talk-sentinel" aria-hidden="true"></div></div></div>
  <dialog id="v3-room-create" class="voice-sheet compact-popup" aria-labelledby="v3-create-title"><header class="voice-sheet-heading"><h2 id="v3-create-title">방 만들기</h2>
   <button type="button" id="v3-close-create" aria-label="닫기">${voiceGlyph('close')}</button></header>${voiceSettingsFormHTML('create',true)}</dialog></section></div>`;
}
let talkingRoomReturn=null;

function liveDirectoryAlias(raw){
 return typeof raw==='string'&&['live','voice','community','community/voice'].includes(raw.replace(/^#?\/?/,'').split('?')[0]);
}
function bindTalkingDirectory(root){
 const grid=root.querySelector('.v3-room-grid'),search=root.querySelector('#v3-room-search'),create=root.querySelector('#v3-create-room');
 const status=root.querySelector('.talk-status'),message=status.querySelector('span'),retry=status.querySelector('button'),sentinel=root.querySelector('.talk-sentinel');
 const artwork=status.querySelector('.live-empty-art'),cardMarkup=new WeakMap();
 const pane=root.querySelector('.talk-scroll');
 const tools=root.querySelector('.live-tools'),openSearch=root.querySelector('[data-live-search-open]'),closeSearch=root.querySelector('[data-live-search-close]'),clearSearch=root.querySelector('[data-live-search-clear]');
 const route=location.hash,viewer=me?.id||'',revision=typeof apiRevision==='number'?apiRevision:0;
 const currentRevision=()=>typeof apiRevision==='number'?apiRevision:0;
 const currentViewer=()=>viewer===(me?.id||'');
 const requestedMode=new URLSearchParams(route.split('?')[1]||'').get('mode');
 const linkedMode=['all','karaoke','talk'].includes(requestedMode)?requestedMode:null;
 // An explicit banner type takes priority. Discard a different filter's entire
 // snapshot so its search, cursor and rooms cannot leak into the linked list.
 const sameDirectory=talkingRoomReturn&&(talkingRoomReturn.route===route||liveDirectoryAlias(talkingRoomReturn.route)&&liveDirectoryAlias(route));
 const saved=sameDirectory&&talkingRoomReturn.viewer===viewer&&(talkingRoomReturn.revision??0)===revision&&talkingRoomReturn.until>Date.now()&&(!linkedMode||talkingRoomReturn.mode===linkedMode)?talkingRoomReturn:null;
 talkingRoomReturn=null;
 let items=new Map(saved?.items),cursor=saved?.cursor||null,done=saved?.done||false;
 let controller=null,debounce,expiry,disposed=false;
 let mode=linkedMode||saved?.mode||'all',refreshController,composing=false;
 let snapshotReady=!!saved,fetchedAt=saved?.fetchedAt||0,displayUntil=saved?.until||0,readFailed=!!saved?.readFailed,leavingForRoom=false;
 const main=root.closest('#main');
 const layoutEvents=new AbortController();let layoutFrame=0;
 const measure=()=>{layoutFrame=0;if(disposed||!root.isConnected||!main)return;const vv=window.visualViewport,top=Math.max(main.getBoundingClientRect().top,vv?.offsetTop||0),bottom=(vv?.offsetTop||0)+(vv?.height||innerHeight);const player=document.querySelector('#player');const p=player?.getBoundingClientRect();const end=p?.height&&p.top>top&&getComputedStyle(player).display!=='none'?Math.min(bottom,p.top):bottom;main.style.setProperty('--live-directory-height',Math.max(0,end-top)+'px');};
 const layout=()=>{if(!layoutFrame)layoutFrame=requestAnimationFrame(measure);};
 for(const name of ['resize','aifect:topbar-layout','aifect:input-viewport'])window.addEventListener(name,layout,{signal:layoutEvents.signal});
 window.visualViewport?.addEventListener('resize',layout,{signal:layoutEvents.signal});
 const layoutResize=new ResizeObserver(layout),navigation=main?.querySelector(':scope > .music-community-tabs');
 if(navigation)layoutResize.observe(navigation);layoutResize.observe(tools);layout();
 function syncSearch(){
  clearSearch.hidden=!search.value;
  // A desktop query must stay visible when the directory becomes narrow.
  if(search.value)setSearchOpen(true);
 }
 function setSearchOpen(open){
  tools.dataset.searchOpen=String(open);openSearch.setAttribute('aria-expanded',String(open));
 }
 setSearchOpen(!!(saved?.searchOpen||saved?.query));
 openSearch.onclick=()=>{setSearchOpen(true);search.focus({preventScroll:true});};
 closeSearch.onclick=()=>{
  composing=false;search.value='';search.blur();syncSearch();setSearchOpen(false);reset();
  openSearch.focus({preventScroll:true});
 };
 clearSearch.onpointerdown=e=>{e.preventDefault();};
 clearSearch.onclick=()=>{composing=false;search.value='';syncSearch();reset();search.focus({preventScroll:true});};
 const filterButtons=root.querySelectorAll('[data-room-filter]');
 function setFilter(value){
  mode=value;root.dataset.filter=value;
  for(const btn of filterButtons)btn.setAttribute('aria-pressed',String(btn.dataset.roomFilter===value));
  const label=value==='all'?'방 제목 또는 방장 검색':liveRoomLabels[value]+' 제목·방장 검색';
  search.placeholder=label;search.setAttribute('aria-label',label);
 }
 setFilter(mode);
 for(const btn of filterButtons)btn.onclick=()=>{if(mode!==btn.dataset.roomFilter){setFilter(btn.dataset.roomFilter);reset();}};
 root.querySelector('[data-live-reset]').onclick=()=>{search.value='';syncSearch();setFilter('all');reset();};
 grid.addEventListener('error',e=>{if(e.target.matches?.('.talk-cover'))e.target.remove();},true);
 const observer=new IntersectionObserver(entries=>{
  if(entries.some(e=>e.isIntersecting))void load();
 },{root:pane,rootMargin:'0px 0px 160px'});
 function watchEnd(on){
  if(on)observer.observe(sentinel);else observer.unobserve(sentinel);
 }
 function notice(text='',state=''){
  if(state==='empty'){
   const src='/assets/aifect-empty-'+mode+'.webp';
   if(artwork.getAttribute('src')!==src)artwork.setAttribute('src',src);
  }
  if(status.dataset.state!==state)status.dataset.state=state;
  if(message.textContent!==text)message.textContent=text;
  if(retry.hidden!==(state!=='error'))retry.hidden=state!=='error';
  if(status.hidden!==!text)status.hidden=!text;
 }
 function roomCard(room,card){
  const html=talkingRoomCard(room);
  if(card&&cardMarkup.get(card)===html)return card;
  const template=document.createElement('template');
  template.innerHTML=html;
  const next=template.content.firstElementChild;
  if(card){
   card.href=next.href;card.dataset.roomMode=next.dataset.roomMode;
   card.replaceChildren(...next.childNodes);
  }else card=next;
  cardMarkup.set(card,html);
  return card;
 }
 function reconcileFirstPage(latest){
  const previous=new Map([...grid.children].map(card=>[card.dataset.talkId,card]));
  for(const [id,card] of previous)if(!latest.has(id))card.remove();
  let position=grid.firstElementChild;
  for(const [id,room] of latest){
   const card=roomCard(room,previous.get(id));
   if(card!==position)grid.insertBefore(card,position);
   position=card.nextElementSibling;
  }
 }
 function setAvailability(enabled){
  if(root.dataset.enabled!==String(enabled))root.dataset.enabled=String(enabled);
  if(!create.dataset.opening&&create.disabled!==!enabled)create.disabled=!enabled;
 }
 function serviceUnavailable(){
  items.clear();if(grid.firstElementChild)grid.replaceChildren();
  cursor=null;done=true;ready();rememberRead();
 }
 function rememberRead(){
  snapshotReady=true;readFailed=false;fetchedAt=Date.now();displayUntil=fetchedAt+120000;
 }
 function saveDirectory(fromRoom=false){
  leavingForRoom=leavingForRoom||fromRoom;
  if(!snapshotReady||composing||!currentViewer()||revision!==currentRevision()||displayUntil<=Date.now())return;
  const state=status.dataset.state||'';
  talkingRoomReturn={viewer,revision,route,until:displayUntil,fetchedAt,readFailed,fromRoom:leavingForRoom,
   mode,query:search.value,items:[...items],cursor,done,scroll:pane.scrollTop,
   enabled:root.dataset.enabled!=='false',searchOpen:tools.dataset.searchOpen==='true',
   status:{text:state==='loading'?'':message.textContent,state:state==='loading'?'':state}};
 }
 function expireCovers(){
  clearTimeout(expiry);let next=Infinity;
  for(const room of items.values()){
   if(!room.themeUntil)continue;
   if(room.themeUntil<=Date.now()){
    const card=grid.querySelector('[data-talk-id="'+CSS.escape(room.id)+'"]');
    const fallback=AifectPlayer.DEFAULT_ROOM_SKIN;
    room.themeUntil=0;room.theme={sku:fallback.sku,assets:fallback.assetPaths};room.background=fallback.sku;
    if(card)roomCard(room,card);
   }else next=Math.min(next,room.themeUntil);
  }
  if(Number.isFinite(next))expiry=setTimeout(expireCovers,Math.min(next-Date.now()+50,2147483647));
 }
 function ready(){
  if(sentinel.hidden!==done)sentinel.hidden=done;
  watchEnd(!done);
  if(root.dataset.enabled==='false')notice('라이브 서비스 연결을 준비하고 있어요.');
  else if(!items.size&&done&&!composing){
   if(search.value.trim())notice('검색 결과가 없어요.');
   else notice('아직 열린 공개방이 없어요.','empty');
  }else notice();
 }
 async function load(){
  if(disposed||controller||done||composing||!currentViewer())return;
  refreshController?.abort();
  watchEnd(false);const active=controller=new AbortController(),requestRevision=currentRevision();
  grid.setAttribute('aria-busy','true');
  const pendingNotice=!snapshotReady&&setTimeout(()=>{
   if(controller===active&&!disposed)notice('라이브 목록을 불러오는 중이에요.','loading');
  },450);
  try{
   const params=new URLSearchParams({limit:'24',mode}),query=search.value.trim();
   if(query)params.set('q',query);if(cursor)params.set('cursor',cursor);
   const page=await voiceRequest('public-rooms?'+params,undefined,'GET',active.signal);
   if(active.signal.aborted||disposed||!currentViewer()||requestRevision!==currentRevision())return;
   setAvailability(page.enabled!==false);
   if(page.enabled===false){serviceUnavailable();return;}
   for(const room of page.rooms){
    if(items.has(room.id))continue;
    if(room.theme?.expires_at)room.themeUntil=Date.now()+(room.theme.expires_at-room.theme.server_now)*1000;
    items.set(room.id,room);grid.append(roomCard(room));
   }
   done=!page.next_cursor||page.next_cursor===cursor;cursor=page.next_cursor;
   expireCovers();ready();rememberRead();
  }catch(e){if(!active.signal.aborted&&!disposed&&currentViewer()){readFailed=true;notice('라이브 목록을 불러오지 못했어요.','error');}}
  finally{clearTimeout(pendingNotice);if(controller===active){controller=null;grid.setAttribute('aria-busy','false');}}
 }
 function reset(){
  clearTimeout(debounce);clearTimeout(expiry);refreshController?.abort();watchEnd(false);
  pane.scrollTop=0;
  controller?.abort();controller=null;items=new Map();cursor=null;done=false;
  snapshotReady=false;fetchedAt=0;displayUntil=0;readFailed=false;
  grid.replaceChildren();notice();grid.setAttribute('aria-busy','true');
  debounce=setTimeout(load,220);
 }
 async function refresh(){
  if(document.hidden||disposed||composing||controller||refreshController||!currentViewer()||root.querySelector('dialog[open]'))return;
  if(!snapshotReady){if(readFailed)await load();return;}
  const atTop=()=>pane.scrollTop<2;
  const refreshTop=atTop()&&!grid.contains(document.activeElement);
  const viewport=pane.getBoundingClientRect();
  const visible=refreshTop?[]:[...grid.children].filter(el=>{
   const rect=el.getBoundingClientRect();return rect.bottom>viewport.top&&rect.top<viewport.bottom;
  }).slice(0,24);
  if(!refreshTop&&!visible.length)return;
  const active=refreshController=new AbortController(),requestRevision=currentRevision();
  const params=new URLSearchParams({limit:'24',mode,q:search.value.trim()});
  if(!refreshTop)params.set('ids',visible.map(el=>el.dataset.talkId).join(','));
  const current=()=>!active.signal.aborted&&!disposed&&!controller&&currentViewer()&&requestRevision===currentRevision();
  const read=()=>voiceRequest('public-rooms?'+params,undefined,'GET',active.signal);
  try{
   let page=await read();
   if(!current())return;
   // An ID-only response cannot tell whether a new room replaced the last card.
   if(!refreshTop&&page.enabled!==false&&!page.rooms.length&&visible.length===items.size){
    params.delete('ids');page=await read();if(!current())return;
   }
   // A filtered page may be empty even though a later page contains a room.
   // Keep the last confirmed view until we have a card or reach the end.
   const fullPage=!params.has('ids');
   while(fullPage&&page.enabled!==false&&!page.rooms.length&&page.next_cursor){
    if(page.next_cursor===params.get('cursor')){page.next_cursor=null;break;}
    params.set('cursor',page.next_cursor);page=await read();if(!current())return;
   }
   if(refreshTop&&(!atTop()||grid.contains(document.activeElement)))return;
   setAvailability(page.enabled!==false);
   if(page.enabled===false){serviceUnavailable();return;}
   const latest=new Map(page.rooms.map(room=>{
    if(room.theme?.expires_at)room.themeUntil=Date.now()+(room.theme.expires_at-room.theme.server_now)*1000;
    return [room.id,room];
   }));
   if(fullPage){
    reconcileFirstPage(latest);items=latest;cursor=page.next_cursor;done=!cursor;
   }else for(const el of visible){
    const id=el.dataset.talkId,room=latest.get(id);
    if(!room){items.delete(id);el.remove();continue;}
    items.set(id,room);
    roomCard(room,el);
   }
   expireCovers();ready();rememberRead();
  }catch{
   if(current()){
    readFailed=true;
    for(const room of items.values())room.followed_profiles=[];
    grid.querySelectorAll('.talk-follows').forEach(group=>{cardMarkup.delete(group.closest('[data-talk-id]'));group.remove();});
   }
  }
  finally{if(refreshController===active)refreshController=null;}
 }
 const poll=setInterval(refresh,20000);
 window.addEventListener('aifect:follow-saved',refresh);
 document.addEventListener('visibilitychange',refresh);
 // Keep the same native input mounted while results change, including Korean IME composition.
 search.addEventListener('compositionstart',()=>{composing=true;clearTimeout(debounce);if(status.dataset.state==='empty')notice();});
 search.addEventListener('compositionend',()=>{composing=false;syncSearch();reset();});
 search.oninput=e=>{syncSearch();if(!composing&&!e.isComposing)reset();};
 search.onkeydown=e=>{
  if(e.key!=='Enter'||composing||e.isComposing||e.keyCode===229)return;
  e.preventDefault();clearTimeout(debounce);void load();search.blur();
 };
 retry.onclick=()=>{done=false;void load();};
 grid.addEventListener('click',e=>{
  if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||!e.target.closest('[data-talk-id]'))return;
  saveDirectory(true);
 });
 registerRouteCleanup(()=>{
  saveDirectory();
  disposed=true;layoutEvents.abort();layoutResize.disconnect();cancelAnimationFrame(layoutFrame);main?.style.removeProperty('--live-directory-height');clearInterval(poll);refreshController?.abort();document.removeEventListener('visibilitychange',refresh);observer.disconnect();controller?.abort();clearTimeout(debounce);clearTimeout(expiry);
  window.removeEventListener('aifect:follow-saved',refresh);
 });
 if(saved){
  // Returning from a room may predate a leave or unfollow, even inside the read TTL.
  if(saved.fromRoom)for(const room of items.values())room.followed_profiles=[];
  search.value=saved.query;syncSearch();setAvailability(saved.enabled!==false);
  reconcileFirstPage(items);notice(saved.status?.text||'',saved.status?.state||'');expireCovers();
  requestAnimationFrame(()=>{if(!disposed){pane.scrollTo({top:saved.scroll,behavior:'instant'});if(saved.status?.state!=='error')ready();if(saved.fromRoom||readFailed||!fetchedAt||Date.now()-fetchedAt>=20000)void refresh();}});
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
   fillRoomThemeChoices(form,options);
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
function communityRankingOptions(raw){
 const p=new URLSearchParams(raw.split('?')[1]||'');
 const requested=p.get('category'),kind=p.get('workKind');
 const legacy=requested==='work'||(!requested&&(p.has('original_id')||p.has('kind')));
 let category=legacy?'cover':['cover','aiArtist','crew','dubbing'].includes(requested)?requested:'aiArtist';
 if(kind==='dubbing'&&(requested==='work'||!requested))category='dubbing';
 const period=category==='cover'&&p.get('period')==='month'?'month':'week';
 const workKind=category!=='cover'?'solo':['solo','duet','all'].includes(kind)?kind:legacy?'solo':'all';
 return {category,period,workKind};
}
function communityRankingHref(options){
 const cover=options.category==='cover';
 const p=new URLSearchParams({category:options.category,period:cover&&options.period==='month'?'month':'week'});
 if(cover&&options.workKind&&options.workKind!=='all')p.set('workKind',options.workKind);
 return '#community/rankings?'+p;
}
function communityRankingImage(r){
 const src=typeof r.image_url==='string'&&r.image_url.startsWith('/')&&!r.image_url.startsWith('//')?r.image_url:'/assets/brand/20261117/aifect-icon-512.png';
 return '<span class="ranking-picture cover"><img src="'+esc(src)+'" alt="" loading="lazy" decoding="async"></span>';
}
function rankingCoverActions(r){
 if(r.kind!=='cover')return '';
 const name=esc(r.producer),title=esc(r.name),id=esc(r.id);
 return `<div class="ranking-cover-actions">
  <a class="ranking-performer song-cover-performer" href="#producer/${esc(encodeURIComponent(r.producer_id))}" aria-label="${name} 프로필 보기">${name}</a>
  <div class="ranking-buttons">${songCoverPlayButton(r.id,r.name)}<button type="button" class="list-action song-cover-like" data-like="${id}" aria-pressed="${liked(r.id)}" aria-label="${title} 좋아요">${icon('ui-heart')}</button></div>
 </div>`;
}
function communityRankingRow(r,rank){
 return '<li><a class="ranking-row" href="'+esc(r.href)+'" aria-label="'+rank+'위 '+esc(r.name)+'"><span class="ranking-number">'+rank+'</span>'+communityRankingImage(r)+'<strong title="'+esc(r.name)+'">'+esc(r.name)+'</strong></a>'+rankingCoverActions(r)+'</li>';
}
function communityRankingResults(rows,period='week'){
 if(!rows.length)return '<div class="ranking-empty" role="status"><h2>아직 집계된 순위가 없어요</h2><p>'+(period==='month'?'이번 달':'이번 주')+' 유효한 활동이 쌓이면 순위를 표시해요.</p></div>';
 const podium=rows.slice(0,3).map((r,i)=>'<li class="ranking-place ranking-place-'+(i+1)+'"><a href="'+esc(r.href)+'" aria-label="'+(i+1)+'위 '+esc(r.name)+'">'+communityRankingImage(r)+'<span class="ranking-medal" aria-hidden="true">'+(i+1)+'</span><strong title="'+esc(r.name)+'">'+esc(r.name)+'</strong></a>'+rankingCoverActions(r)+'</li>').join('');
 return '<ol class="ranking-podium" aria-label="상위 3위">'+podium+'</ol><ol class="ranking-list" start="4" aria-label="4위 이하">'+rows.slice(3).map((r,i)=>communityRankingRow(r,i+4)).join('')+'</ol>';
}
function communityRankingInfo(d){
 const date=n=>Number.isFinite(Number(n))?new Date(Number(n)*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'확인 중';
 return '<details class="ranking-info"><summary>집계 정보 보기 <span aria-hidden="true">⌄</span></summary><dl><div><dt>집계 기준</dt><dd>'+(d.period==='month'?'월간':'주간')+'</dd></div><div><dt>집계기간</dt><dd>'+esc(date(d.from))+' ~ '+esc(date(d.until))+' <span>(종료 시각 미포함)</span></dd></div><div><dt>최종 갱신</dt><dd>'+esc(date(d.updated_at))+'</dd></div><div><dt>기준 시간대</dt><dd>KST</dd></div></dl></details>';
}
async function communityRankingV3(raw,readApi=api){
 const options=communityRankingOptions(raw),{category,workKind}=options;
 const nav=(items,key,value,cls,label)=>'<nav class="'+cls+'" aria-label="'+label+'">'+items.map(([v,text])=>{
  const next={...options,[key]:v};
  if(key==='category'&&v==='cover'&&category!=='cover')next.workKind='all';
  return '<a href="'+esc(communityRankingHref(next))+'" '+(value===v?'aria-current="page"':'')+'>'+text+'</a>';
 }).join('')+'</nav>';
 let html=communityNavigation('rankings')+'<section class="community-v3 weekly-rankings" aria-label="커뮤니티 랭킹">'+nav([['aiArtist','AI 아티스트'],['crew','크루 랭킹'],['cover','커버 랭킹'],['dubbing','더빙 랭킹']],'category',category,'ranking-categories','랭킹 카테고리');
 if(category==='cover'){
  html+=nav([['week','주간'],['month','월간']],'period',options.period,'ranking-kinds','집계 기간');
  html+=nav([['all','전체'],['solo','솔로'],['duet','듀엣']],'workKind',workKind,'ranking-kinds','커버 유형');
 }
 const ranking={options,canonicalHref:communityRankingHref(options),raw,readApi,rows:[],nextOffset:null};
 try{
  const d=await readApi('/api/community/rankings?'+new URLSearchParams({...options,limit:20}));
  ranking.rows=d.rows||[];ranking.nextOffset=d.next_offset??null;ranking.from=d.from;
  html+='<div class="ranking-results">'+communityRankingResults(ranking.rows,options.period)+'</div><div class="ranking-more-area"><button type="button" class="ranking-more" data-ranking-more '+(ranking.nextOffset===null?'hidden':'')+'>더 보기</button><p class="ranking-status" role="status" aria-live="polite"></p></div>'+communityRankingInfo(d);
 }catch(e){html+='<div class="ranking-empty" role="alert"><h2>랭킹을 불러오지 못했어요</h2><p>'+esc(e.message)+'</p><button type="button" class="ranking-more" data-ranking-retry>다시 시도</button></div>';}
 return {html:html+'</section>',ranking};
}
function bindCommunityRanking(view){
 const state=view?.ranking;if(!state)return;
 const root=document.querySelector('.weekly-rankings');if(!root)return;
 if(state.options.category==='cover')bindSongCoverPlayback();
 const retry=root.querySelector('[data-ranking-retry]');if(retry)retry.onclick=()=>render();
 const more=root.querySelector('[data-ranking-more]');if(!more)return;
 more.onclick=async()=>{
  if(more.disabled||state.nextOffset===null)return;
  more.disabled=true;more.textContent='불러오는 중…';
  const status=root.querySelector('.ranking-status');status.textContent='';
  try{
   const d=await state.readApi('/api/community/rankings?'+new URLSearchParams({...state.options,limit:20,offset:state.nextOffset}));
   if(!root.isConnected)return;
   if(d.from!==state.from){render();return;}
   const seen=new Set(state.rows.map(r=>r.id));state.rows.push(...d.rows.filter(r=>!seen.has(r.id)));
   const added=state.rows.length;root.querySelector('.ranking-results').innerHTML=communityRankingResults(state.rows,state.options.period);
   if(state.options.category==='cover'){paintInteractions();syncSongCoverPlayback();}
   state.nextOffset=d.next_offset??null;more.hidden=state.nextOffset===null;status.textContent=added+'위까지 표시했어요.';
  }catch(e){if(root.isConnected)status.textContent='불러오지 못했어요. 더 보기를 눌러 다시 시도해주세요.';}
  finally{more.disabled=false;more.textContent='더 보기';}
 };
}

function crewV3SettingsHTML(c){return `<label class="form-field">가입 방식<select name="join_policy">${[['open','자유가입'],['approval','승인제'],['invite_only','초대전용']].map(([v,n])=>`<option value="${v}" ${c?.join_policy===v?'selected':''}>${n}</option>`).join('')}</select></label><label class="form-field">최소 사용자 레벨<input type="number" name="minimum_level" min="1" max="100" value="${c?.minimum_level||1}"></label><label class="form-field">공지<textarea name="notice" maxlength="1000">${esc(c?.notice||'')}</textarea></label>`;}
function crewV3WorksHTML(d){
 const items=[...(d.tracks||[]).map(t=>({id:t.id,title:t.title,kind:t.cover_mode==='duet'?'duet':'solo',created:t.created,href:'#song/'+t.id,track:t})),...(d.dubbings||[]).map(p=>({...p,kind:'dubbing',created:p.updated,href:'#dubbing/'+p.id}))].sort((a,b)=>b.created-a.created||a.id.localeCompare(b.id));
 return '<div class="section-heading"><h2>크루 작품</h2><span>공개일 최신순</span></div>'+(items.length?'<div class="v3-crew-works">'+items.map(w=>'<article data-list-row class="v3-crew-work">'+(w.track||w.posterUrl?cover(w.track||w,'mini-cover'):'<span class="mini-cover">'+icon('mic')+'</span>')+'<a href="'+esc(w.href)+'"><strong>'+icon(w.kind==='duet'?'users':w.kind==='dubbing'?'message':'mic')+esc(w.title)+'</strong><small>'+({solo:'솔로',duet:'듀엣',dubbing:'더빙'}[w.kind])+'</small></a>'+(w.track?'<button class="list-action icon-button" data-play="'+esc(w.id)+'" title="'+esc(w.title)+' 재생" aria-label="'+esc(w.title)+' 재생">'+icon('play')+'</button>':'')+'</article>').join('')+'</div>':'<p class="v3-empty">현재 크루원이 공개한 완성 작품이 없어요.</p>');
}
