function talkingRoomCard(room){
 const profiles=room.followed_profiles||[],extra=room.followed_count-profiles.length,theme=room.theme;
 const path=theme?.assets?.roomCard,art=path&&/^\/assets\/[\w/-]+\.webp$/.test(path)&&(!room.themeUntil||room.themeUntil>Date.now())
  ?`<img class="talk-cover" src="${esc(path)}" alt="" loading="lazy" decoding="async">`:'';
 const host=room.host_name||'';
 return `<a class="v3-room-card" data-talk-id="${esc(room.id)}" href="#voice/${esc(room.id)}">
  <div class="v3-room-art" data-theme="${esc(theme?.sku||room.background||'navy')}">${art}
   ${Number.isInteger(room.member_count)&&Number.isInteger(room.max_members)?`<span class="v3-room-count" aria-label="참여 ${room.member_count}명, 정원 ${room.max_members}명">${icon('users')}${room.member_count}/${room.max_members}</span>`:''}
   <div class="talk-meta">${profiles.length?`<span class="talk-follows" aria-label="팔로우한 참여자 ${room.followed_count}명">${profiles.map(p=>avatarImage(p,'producer',false,false)).join('')}${extra>0?`<span>+${extra}</span>`:''}</span>`:''}
    ${host?`<span class="talk-host" title="${esc(host)}">${esc(host)}</span>`:''}</div>
  </div><div class="v3-room-copy"><h3>${esc(room.title)}</h3></div></a>`;
}
let talkingRoomReturn=null;
function bindTalkingDirectory(root){
 const grid=root.querySelector('.v3-room-grid'),search=root.querySelector('#v3-room-search'),create=root.querySelector('#v3-create-room');
 const status=root.querySelector('.talk-status'),message=status.querySelector('span'),retry=status.querySelector('button'),sentinel=root.querySelector('.talk-sentinel');
 const pane=root.querySelector('.talk-scroll'),desktop=window.matchMedia('(min-width:801px)');
 const shell=root.closest('.page-wrap'),footer=shell.querySelector(':scope > .page-footer');
 const viewer=me?.id||'';
 const saved=talkingRoomReturn?.viewer===viewer&&talkingRoomReturn.until>Date.now()?talkingRoomReturn:null;
 talkingRoomReturn=null;
 let items=new Map(saved?.items),cursor=saved?.cursor||null,done=saved?.done||false;
 let controller=null,debounce,expiry,disposed=false;
 let observer,watching=false;
 function watchEnd(on){
  watching=on;
  if(on)observer.observe(sentinel);else observer.unobserve(sentinel);
 }
 function syncScrollMode(){
  observer?.disconnect();
  if(desktop.matches){
   pane.tabIndex=0;
   if(footer)pane.append(footer);
  }else{
   pane.removeAttribute('tabindex');
   if(footer&&footer.parentElement===pane)shell.append(footer);
  }
  observer=new IntersectionObserver((entries,source)=>{
   if(source===observer&&watching&&entries.some(e=>e.isIntersecting))void load();
  },{root:desktop.matches?pane:null,rootMargin:'0px 0px 160px'});
  if(watching)observer.observe(sentinel);
 }
 syncScrollMode();
 desktop.addEventListener('change',syncScrollMode);
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
  if(!items.size&&done)notice(search.value.trim()?'검색 결과가 없어요.':'아직 열린 공개 토킹룸이 없어요.');
  if(!done)watchEnd(true);
 }
 async function load(){
  if(disposed||controller||done)return;
  watchEnd(false);const active=controller=new AbortController();
  notice();grid.setAttribute('aria-busy','true');
  const pendingNotice=setTimeout(()=>{
   if(controller===active&&!disposed)notice('토킹룸 목록을 불러오는 중이에요.');
  },450);
  try{
   const params=new URLSearchParams({limit:'24'}),query=search.value.trim();
   if(query)params.set('q',query);if(cursor)params.set('cursor',cursor);
   const page=await voiceRequest('public-rooms?'+params,undefined,'GET',active.signal);
   if(active.signal.aborted||disposed)return;
   create.disabled=page.enabled===false;
   if(page.enabled===false){done=true;notice('토킹룸 서비스 연결을 준비하고 있어요.');return;}
   const added=[];
   for(const room of page.rooms){
    if(items.has(room.id))continue;
    if(room.theme?.expires_at)room.themeUntil=Date.now()+(room.theme.expires_at-room.theme.server_now)*1000;
    items.set(room.id,room);added.push(talkingRoomCard(room));
   }
   grid.insertAdjacentHTML('beforeend',added.join(''));
   done=!page.next_cursor||page.next_cursor===cursor;cursor=page.next_cursor;
   notice();expireCovers();ready();
  }catch(e){if(!active.signal.aborted)notice('토킹룸 목록을 불러오지 못했어요.',true);}
  finally{clearTimeout(pendingNotice);if(controller===active){controller=null;grid.setAttribute('aria-busy','false');}}
 }
 function reset(){
  clearTimeout(debounce);clearTimeout(expiry);watchEnd(false);
  if(desktop.matches)pane.scrollTop=0;
  controller?.abort();controller=null;items=new Map();cursor=null;done=false;
  grid.replaceChildren();notice();grid.setAttribute('aria-busy','true');
  debounce=setTimeout(load,220);
 }
 search.oninput=reset;retry.onclick=load;
 grid.addEventListener('click',e=>{
  if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||!e.target.closest('[data-talk-id]'))return;
  talkingRoomReturn={viewer,until:Date.now()+120000,query:search.value,items:[...items],cursor,done,scroll:desktop.matches?pane.scrollTop:window.scrollY};
 });
 registerRouteCleanup(()=>{
  disposed=true;observer.disconnect();controller?.abort();clearTimeout(debounce);clearTimeout(expiry);
  desktop.removeEventListener('change',syncScrollMode);
  if(footer&&footer.parentElement===pane)shell.append(footer);
 });
 if(saved){
  search.value=saved.query;create.disabled=false;grid.innerHTML=[...items.values()].map(talkingRoomCard).join('');expireCovers();
  requestAnimationFrame(()=>{if(!disposed){(desktop.matches?pane:window).scrollTo({top:saved.scroll,behavior:'instant'});ready();}});
 }else void load();
}
function voiceLobbyHTML(data,enabled,talking=true){
 const input='<input id="v3-room-search" type="search" maxlength="100" aria-label="방 제목 또는 방장 검색" placeholder="방 제목 또는 방장 검색">';
 let list;
 if(talking){
  list=`<div class="talk-scroll" role="region" aria-label="토킹룸 목록"><div class="v3-room-grid">${data.rooms.map(talkingRoomCard).join('')}</div>
   <div class="talk-status" role="status" hidden><span></span> <button type="button" class="small-button" hidden>다시 시도</button></div>
   <div class="talk-sentinel" aria-hidden="true"></div></div>`;
 }else{
  const cards=data.rooms.map(r=>`<a class="v3-room-card" href="#voice/${esc(r.id)}" data-room-search="${esc((r.title+' '+r.host_name).toLowerCase())}"><div class="v3-room-art" data-decoration-room="${esc(r.id)}" data-theme="${esc(r.background||'navy')}"><span class="v3-live">LIVE</span><span class="v3-room-count">${icon('users')} ${number(r.member_count||0)}명</span></div><div class="v3-room-copy"><h3>${esc(r.title)}</h3><p>${esc(r.host_name||'방장')}<small>함께 듣는 중</small></p></div></a>`).join('');
  const empty=enabled?'아직 열린 공개 토킹룸이 없어요.':'토킹룸 서비스 연결을 준비하고 있어요.';
  list=`<div class="v3-room-grid">${cards||'<p class="v3-empty">'+empty+'</p>'}</div><p id="v3-search-empty" hidden>검색 결과가 없어요.</p>`;
 }
 return `<section class="community-v3 room-lobby${talking?'':' live-lobby'}"><div class="v3-toolbar">
  <div><h2>지금 열려 있는 토킹룸</h2><p>${talking?'공개된 방만 보여줘 · 방장 승인 후 마이크 참여 가능':'공개된 방만 보여줘 · 방장 승인 후 마이크에 참여할 수 있어'}</p></div>
  <div class="v3-tools">${input}<button class="primary-button" id="v3-create-room" ${enabled?'':'disabled'}>${icon('plus')} 방 만들기</button></div>
 </div>${list}<dialog id="v3-room-create" class="voice-sheet" aria-labelledby="v3-create-title"><button type="button" id="v3-close-create" aria-label="닫기">${voiceGlyph('close')}</button><header class="voice-sheet-heading"><h2 id="v3-create-title">방 만들기</h2></header>${voiceSettingsFormHTML('create',talking)}</dialog></section>`;
}
function bindVoiceLobby(){
 const open=$('#v3-create-room'),modal=$('#v3-room-create');if(!open)return;
 open.onclick=async()=>{if(!me){location.hash='#account';return;}const ticket=renderId;try{const options=await voiceRequest('options');if(ticket!==renderId||!open.isConnected)return;const f=$('#voice-create-form');f.reset();if(open.closest('.talk-directory'))f.elements.title.value=options.suggested_title||'';f.elements.visibility.value='public';f.elements.max_members.value='30';fillRoomThemeChoices(f,options,'navy');f.elements.background.value='navy';f.elements.crew_id.innerHTML='<option value="">크루 선택</option>'+options.crews.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');f.querySelector('#voice-notice-length').textContent='0/200';f.querySelector('.voice-crew-setting').hidden=true;modal.showModal();}catch(e){if(ticket===renderId&&open.isConnected)toast(e.message);}};
 $('#v3-close-create').onclick=()=>modal.close();
 modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});
 const form=$('#voice-create-form');form.addEventListener('input',()=>{form.querySelector('#voice-notice-length').textContent=form.elements.announcement.value.length+'/200';});
 const visibility=()=>{form.querySelector('.voice-crew-setting').hidden=form.elements.visibility.value!=='crew';};form.addEventListener('change',visibility);visibility();
 const directory=open.closest('.talk-directory');
 if(directory){bindTalkingDirectory(directory);return;}
 $('#v3-room-search').oninput=e=>{const q=e.target.value.trim().toLowerCase();let count=0;document.querySelectorAll('[data-room-search]').forEach(c=>{c.hidden=!c.dataset.roomSearch.includes(q);if(!c.hidden)count++;});$('#v3-search-empty').hidden=!q||count>0;};
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
