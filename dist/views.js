function officialSupportHTML(d){return d?.quantity?'<section class="official-ai-support"><strong>공식 AI 응원별 '+number(d.quantity)+'개</strong><p>공식 AI 응원 계정의 무료 선물 · 정산·팬 순위 제외</p>'+d.gifts.map(g=>'<a href="#producer/'+esc(g.profile_id)+'">'+esc(g.name)+' <span class="ai-account-badge">AI</span> · 응원별 ×'+number(g.quantity)+'</a>').join('')+'</section>':'';}
// Only browsing surfaces are kept. Editors, messages, money and membership stay live.
const navigationSnapshots=new Map();let navigationRefreshCleanup=null,navigationController=null;
const routeBindingCleanups=new Set();
function registerRouteCleanup(cleanup){
 const release=()=>{routeBindingCleanups.delete(release);cleanup();};routeBindingCleanups.add(release);return release;
}
function navigationRead(ticket,signal){
 const account=me?.id||'guest';
 const current=()=>ticket===renderId&&!signal?.aborted&&account===(me?.id||'guest');
 const check=()=>{if(!current())throw Object.assign(new Error('이전 화면의 요청입니다.'),{name:'AbortError'});};
 const read=async(path,method='GET',body,options={})=>{
  check();const value=await api(path,method,body,method==='GET'?{...options,signal:options.signal||signal}:options);check();return value;
 };
 read.signal=signal;read.current=current;return read;
}
function cleanupRouteBindings(main){
 navigationRefreshCleanup?.();navigationRefreshCleanup=null;
 if(typeof discoverCleanup==='function'){discoverCleanup();discoverCleanup=null;}
 if(typeof searchResizeCleanup==='function'){searchResizeCleanup();searchResizeCleanup=null;}
 if(typeof chartToolbarCleanup==='function'){chartToolbarCleanup();chartToolbarCleanup=null;}
 if(typeof playBannerCleanup==='function'){playBannerCleanup();playBannerCleanup=null;}
 for(const cleanup of [...routeBindingCleanups])cleanup();
 if(typeof activityReadObserver==='function'){document.removeEventListener('visibilitychange',activityReadObserver);activityReadObserver=null;}
 // Inline previews belong to the page. The persistent player uses its own Audio.
 for(const media of main.querySelectorAll('audio,video')){media.pause();media.removeAttribute('src');media.load();}
}
function cleanupRouteOverlays(){
 if(typeof giftDialogSerial==='number')giftDialogSerial++;
 for(const modal of document.querySelectorAll('dialog[open]')){
  if(modal.matches?.('.profile-preview')&&typeof closeProfilePreview==='function')closeProfilePreview();else modal.close();
 }
 const menu=$('#chart-track-menu');
 if(menu){menu._chartCleanup?.();if(menu.matches(':popover-open'))menu.hidePopover();}
}
function clearNavigationSnapshots(){navigationSnapshots.clear();}
function canCacheRoute(raw){
 const [route]=raw.replace(/^#/,'').split('?'),[base,param]=route.split('/');
 if(raw.startsWith('community/following?')&&new URLSearchParams(raw.split('?')[1]).has('people'))return false;
 if(['member','charts','discover','search','collections','artists','producers','artist','following','history'].includes(base))return true;
 if(base==='library')return !param||['likes','playlists','artists','producers','following','followers','history'].includes(param);
 return base==='community'&&(!param||['recommend','covers','latest','duets','following'].includes(param));
}
function navigationKey(raw){return (me?.id||'guest')+':'+raw;}
function saveNavigationSnapshot(raw,html,tracks,explorer,scroll=0){
 if(!canCacheRoute(raw)||html.length>400000)return;
 navigationSnapshots.delete(navigationKey(raw));
 navigationSnapshots.set(navigationKey(raw),{html,tracks:[...tracks],explorer,scroll,account:me?.id||'guest',revision:apiRevision,until:Date.now()+60000});
 while(navigationSnapshots.size>24)navigationSnapshots.delete(navigationSnapshots.keys().next().value);
}
function bindRenderedRoute(base,param,explorer,ticket){
 if(explorer?.followPage)bindFollowManagement(explorer.followPage);
 if(base==='artist'&&typeof bindArtistFanpage==='function')bindArtistFanpage();
 if(typeof bindShopShelves==='function')bindShopShelves();
 if(typeof bindPlay==='function')bindPlay(explorer);
 if(base==='song'){bindSongCoverList();if(typeof bindSongDescription==='function')bindSongDescription();}
 if(typeof bindMyPage==='function')bindMyPage(explorer);
 if(typeof bindCrewIntegrated==='function')void bindCrewIntegrated();
 if(typeof bindProfileManagement==='function')bindProfileManagement(explorer);
 if(typeof bindVoice==='function')bindVoice(explorer?.playVoice?'voice':base,param);
 if(typeof bindUnifiedSearch==='function')bindUnifiedSearch(explorer);
 icons();paintInteractions();bindForms(base,param);bindNotifications(explorer);if(base==='song'){const cid=new URLSearchParams(location.hash.split('?')[1]||'').get('comment');if(cid){const node=[...document.querySelectorAll('[data-comment-id]')].find(n=>n.dataset.commentId===cid);if(node){node.tabIndex=-1;node.scrollIntoView({block:'center'});node.focus({preventScroll:true});}}}bindGiftClaims($('#gift-shop-rewards'));bindExplorer(explorer);bindBrowse(explorer);bindImprovements(explorer);
 if(typeof bindDubbing==='function')bindDubbing(explorer);
 if(['community','covers'].includes(base))void loadCommunityCrews($('#community-crew-preview'),ticket);
}
function watchCachedNavigation(main){
 let touched=false;const initialScroll=window.scrollY||0,mark=()=>{touched=true;};
 const events=['input','change','pointerdown','keydown','wheel','touchstart'];
 events.forEach(event=>main.addEventListener(event,mark,{passive:true}));
 const cleanup=()=>events.forEach(event=>main.removeEventListener(event,mark));
 navigationRefreshCleanup=cleanup;
 return {changed:()=>touched||(window.scrollY||0)!==initialScroll||!!(main.contains(document.activeElement)&&document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')),cleanup};
}
let presentationSerial=0;
async function render(){
 const serial=++presentationSerial,main=typeof $==='function'?$('#main'):null,raw=location.hash.slice(1)||'home';
 const presentation=window.AifectRender;
 const epoch=presentation?.begin(raw,main?.dataset.route,()=>{
  if(serial!==presentationSerial)return;
  ++renderId;navigationController?.abort();
  if(typeof cleanupHome==='function')cleanupHome();
 });
 try{
  const outcome=await renderRoute();
  if(serial===presentationSerial){
   // A rejected recording/editor exit keeps the same live DOM but may restore
   // a canonical URL (for example, removing a draft query parameter).
   if(outcome?.retained&&main)main.dataset.route=location.hash.slice(1)||'home';
   presentation?.ready(epoch);
  }
 }catch(error){
  if(serial!==presentationSerial)return;
  if(presentation)presentation.fail(epoch);
  else throw error;
 }
}
async function renderRoute(){
 if(location.hash.startsWith('#/'))history.replaceState(history.state,'','#'+location.hash.slice(2));
 setMobileMenu(false);
 const menuRedirect=typeof menuAlias==='function'?menuAlias(location.hash):null;
 if(menuRedirect)history.replaceState(history.state,'',menuRedirect);
 const playRedirect=typeof playAlias==='function'?playAlias(location.hash):null;
 if(playRedirect)history.replaceState(null,'',playRedirect);

 const ticket=++renderId,raw=location.hash.slice(1)||'home',[baseQuery,paramQuery]=raw.split('/'),[base]=baseQuery.split('?'),param=paramQuery?.split('?')[0];
 navigationController?.abort();
 const controller=navigationController=typeof AbortController==='function'?new AbortController():null;
 const readApi=navigationRead(ticket,controller?.signal);
 if(typeof syncSearchNavigation==='function')syncSearchNavigation(raw);
 if(typeof dubbingBeforeRoute==='function'&&!dubbingBeforeRoute(raw))return {retained:true};
 if(ticket!==renderId)return;
 if(sing){
  if(!singBusy(sing)&&!confirm('녹음 화면에서 나갈까요? 녹음한 내용은 이 기기의 초안에 보관됩니다.')){history.replaceState(null,'',singRouteHref(sing));return {retained:true};}
  if(singLive(sing))await finishSinging();
  if(ticket!==renderId)return;
  if(singBusy(sing)){history.replaceState(null,'',singRouteHref(sing));toast('녹음을 정리한 뒤 이동해주세요.');return {retained:true};}
  if(sing.dirty){try{await saveSingDraft(sing);}catch(e){if(ticket!==renderId)return;history.replaceState(null,'',singRouteHref(sing));toast('임시저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해주세요.');return {retained:true};}}
 }
 if(ticket!==renderId)return;
 const outgoing=$('#main');
 if(outgoing.dataset.route!==raw||outgoing.dataset.account!==(me?.id||'guest'))cleanupRouteOverlays();
 if(base!=='home'){
  if(typeof refreshMusicLibraryRoute==='function'&&await refreshMusicLibraryRoute(raw,ticket,false,readApi))return;
  if(ticket!==renderId)return;
  if(typeof refreshMyPageRoute==='function'&&await refreshMyPageRoute(raw,ticket,readApi))return;
  if(ticket!==renderId)return;
 }
 if(typeof refreshInventoryRoute==='function'&&refreshInventoryRoute(raw))return;
 if(base!=='home'&&typeof dubbingRefreshList==='function'&&await dubbingRefreshList(raw,ticket,readApi))return;
 if(ticket!==renderId)return;
 clearInterval(socialTimer);socialTimer=null;socialCleanup?.();socialCleanup=null;
 cleanupLyricsEditor();cleanupSing();
 if(typeof cleanupHome==='function')cleanupHome();
 // Voice leave disposes local media/subscriptions synchronously. Its keepalive
 // acknowledgement must not keep the outgoing page mounted for up to 8 seconds.
 if(typeof cleanupVoiceRoute==='function')void Promise.resolve(cleanupVoiceRoute(base,param)).catch(()=>{});
 if(ticket!==renderId)return;
 updateBrowseNavigation(base,param);
 const main=$('#main'),account=me?.id||'guest';
 cleanupRouteBindings(main);
 const previous=navigationSnapshots.get(navigationKey(main.dataset.route));if(previous&&main.dataset.account===account)previous.scroll=window.scrollY||0;
 let cached=navigationSnapshots.get(navigationKey(raw));
 const pendingView=(typeof crewPendingView==='function'?crewPendingView(base,param,raw):null)||(typeof communityPendingView==='function'?communityPendingView(base,param,raw):null)||(typeof dmPendingView==='function'?dmPendingView(base,param,raw):null);
 if(!(cached&&cached.account===account&&cached.revision===apiRevision&&cached.until>Date.now())&&pendingView?.cached&&canCacheRoute(raw))cached={...pendingView,account,revision:apiRevision,until:Date.now()+60000,explorer:pendingView,scroll:0};
 const restored=canCacheRoute(raw)&&cached&&cached.account===account&&cached.revision===apiRevision&&cached.until>Date.now();
 let refreshWatch=null;
 if(restored){routeTracks=remember(cached.tracks);main.innerHTML=cached.html;main.removeAttribute('aria-busy');bindRenderedRoute(base,param,cached.explorer,ticket);window.scrollTo({top:cached.scroll||0,behavior:'instant'});refreshWatch=watchCachedNavigation(main);}
 else main.setAttribute('aria-busy','true');
 if(!restored&&base!=='home'){const titles={notifications:'알림',inventory:'인벤토리',charts:'차트',karaoke:'플레이',community:'커뮤니티',library:'내 보관함',following:'팔로우',gifts:'선물함',gold:'골드',dm:'DM 메시지',crew:'크루',payouts:'정산',rewards:'오늘의 실버',producer:'프로필',artist:'AI 아티스트',profile:'내 프로필',account:'내 계정',upload:'음원 업로드',studio:'스튜디오',search:'음악 검색',discover:'음악 발견',history:'최근 들은 음악'};main.classList.remove('motion-enter');main.innerHTML=pendingView?.html||(['dm','song'].includes(base)?'':heading(titles[base]||'음악 둘러보기'))+'<div class="route-loading" role="status"><span>불러오는 중…</span><div></div><div></div><div></div></div>';window.scrollTo({top:0,behavior:'instant'});}
 main.dataset.account=account;
 main.classList.toggle('secondary-page',['charts','search','discover','collections','artists','producers','library','history','playlist','following','studio','manage','upload','cover','account','membership','rewards','payouts','inventory','gold'].includes(base)||base==='karaoke'&&param==='drafts');
 main.dataset.route=raw;
 main.dataset.commonBackground=String(!['karaoke','sing','cover','studio','manage','upload','dubbing'].includes(base));
 let html='',nextTracks=[];
 try{
  if(base==='home')return await renderHome(ticket);
  await accountReady;if(ticket!==renderId)return;
  if(account!==(me?.id||'guest'))return render();
  if(typeof rememberMenuLogin==='function')rememberMenuLogin(base,param);
  const readRevision=apiRevision;
  const profileHeader=base==='library'?libraryProfileHTML(readApi).catch(error=>({error})):null;
  const loaders=[
   ()=>typeof integratedMenuView==='function'?integratedMenuView(base,param,raw,readApi):null,
   ()=>typeof profileCollectionView==='function'?profileCollectionView(base,param,raw,readApi):null,
   ()=>typeof playView==='function'?playView(base,param,raw,readApi):null,
   ()=>typeof myPageView==='function'?myPageView(base,param,raw,readApi):null,
   ()=>typeof dubbingView==='function'?dubbingView(base,param,raw,readApi):null,
   ()=>typeof voiceView==='function'?voiceView(base,param,readApi.signal):null,
   ()=>notificationsView(base,raw,readApi),()=>playerView(base,readApi),
   ()=>improvementsView(base,param,raw,readApi),()=>browseView(base,param,raw,false,readApi),()=>explorerView(base,param,raw,false,readApi)
  ];
  let explorer=null;
  for(const load of loaders){if(!readApi.current())return;explorer=await load();if(!readApi.current())return;if(explorer)break;}
  if(raw!==(location.hash.slice(1)||'home'))return render();
  if(explorer){html=explorer.html;nextTracks=remember(explorer.tracks||[]);}
  else if(base==='member'){const d=await readApi('/api/members/'+encodeURIComponent(param));html=listenerProfileHTML(d.profile,d.counts);}
  else if(['discover','charts','artists','producers','search'].includes(base)){
   let query='';const genre=base==='discover'?decodeURIComponent(param||'전체'):'전체',searchValue=base==='search'?decodeURIComponent(param||''):'';
   if(base==='charts')query='?chart='+({rising:'rising',newcomers:'newcomers',releases:'releases'}[param]||'top');
   if(base==='discover'&&genre!=='전체')query='?genre='+encodeURIComponent(genre);
   if(base==='search')query='?q='+encodeURIComponent(searchValue);
   if(base==='artists')query='?'+new URLSearchParams({directory:'1',sort:new URLSearchParams(raw.split('?')[1]||'').get('sort')||'popular',offset:new URLSearchParams(raw.split('?')[1]||'').get('offset')||0});
   if(base==='producers'&&new URLSearchParams(raw.split('?')[1]||'').get('sort')==='popular')query='?sort=popular';
   query+=(query?'&':'?')+'section='+(['artists','producers'].includes(base)?base:'tracks');
   const data=await readApi('/api/catalog'+query);nextTracks=remember(data.tracks||[]);
   if(base==='discover')html=heading('음악 발견','장르를 넘나들며 새로운 취향을 찾아보세요.')+`<div class="genre-chips">${genres.map(g=>`<a class="genre-chip ${g===genre?'active':''}" href="#discover/${encodeURIComponent(g)}">${g}</a>`).join('')}</div>`+grid(data.tracks);
   else if(base==='charts'){const titles={releases:['새로 도착한 음악','새로운 곡, 가장 먼저 만나는 취향.'],rising:['급상승 차트','지금 더 많은 리스너에게 발견되는 음악.'],newcomers:['새로운 아티스트','처음 만나는 목소리와 새로운 음악 세계.']},copy=titles[param]||['AIFECT 차트','함께 듣고 발견하는 음악.'];html=heading(...copy)+chartTabs(param||'')+chartLayoutHTML(browsePlaybackActions(data.tracks)+list(data.tracks),data.tracks,param);}
   else if(base==='artists')html=publicArtistDirectory(data);
   else if(base==='producers')html=heading(base==='artists'?'AI 아티스트':'제작자',base==='artists'?'새로운 목소리, 새로운 세계.':'당신이 좋아하는 음악을 만드는 사람들.')+identityCards(data[base],base==='artists'?'artist':'producer');
   else html=heading('음악 검색')+`<form id="search-form" class="aifect-search">${icon('search')}<input name="q" aria-label="곡, 아티스트, 제작자 검색" placeholder="곡, 아티스트, 제작자, 태그" value="${esc(searchValue)}" maxlength="100"><button class="primary-button">검색</button></form><p class="search-caption">${searchValue?`“${esc(searchValue)}” 검색 결과 ${data.tracks.length}곡`:'어떤 음악을 찾고 계신가요?'}</p>`+list(data.tracks);
  }else if(base==='song'){
   const requestedCoverTab=new URLSearchParams(paramQuery?.split('?')[1]||'').get('covers'),coverTab=['all','duet','recent'].includes(requestedCoverTab)?requestedCoverTab:'all';
   const core=readApi('/api/tracks/'+param).then(d=>{
    if(ticket===renderId&&readRevision===apiRevision&&account===(me?.id||'guest')){
     routeTracks=remember([d.track]);main.innerHTML=songDetailHeaderHTML(d.track)+'<div class="route-loading" role="status"><span>이야기와 참여 작품을 불러오는 중…</span><div></div><div></div></div>';icons();paintInteractions();if(typeof bindSongDescription==='function')bindSongDescription();
    }return d;
   });
   const [{track:t},{comments},allCovers,giftData]=await Promise.all([core,readApi('/api/tracks/'+param+'/comments'),readApi('/api/tracks/'+param+'/covers?view='+coverTab),readApi('/api/tracks/'+param+'/gifts')]);
   remember([t]);nextTracks=[t];const coverData=t.kind==='original'?allCovers:null;if(coverData)remember(coverData.covers);
   html=`${songDetailHeaderHTML(t)}<div class="song-page-layout"><div class="song-main-column">${coversPanelHTML(t,coverData,coverTab)}<section class="surface comments-panel"><div class="section-heading"><h2>함께 듣는 이야기</h2><select data-dropdown="md" id="comment-sort" aria-label="댓글 정렬"><option value="latest">최신순</option><option value="popular">인기순</option><option value="timeline">타임라인순</option></select></div><form id="comment-form"><div class="song-comment-compose-row"><textarea name="body" rows="1" maxlength="2000" required placeholder="${me?'이 곡의 어떤 순간이 좋았나요?':'로그인 후 감상을 남겨보세요.'}" aria-label="댓글"></textarea><button class="primary-button song-comment-submit" type="submit">댓글 등록</button></div><div class="comment-compose-bottom"><label><input name="with_time" type="checkbox" checked> 현재 재생 시간 포함</label></div><p class="form-error" role="alert"></p></form><div id="comments">${commentsHTML(comments,t)}</div></section></div><aside class="song-sidebar">${giftsPanelHTML(giftData,'응원 순위',{track:t})}${songCreditCardHTML(t)}</aside></div>`;
  }else if(base==='artist'||base==='producer'){
   const d=await readApi(`/api/${base==='artist'?'artists':'producers'}/${param}`);nextTracks=remember(d.tracks);
   if(base==='producer'){const q=new URLSearchParams(paramQuery?.split('?')[1]||''),tab=['tracks','covers','duets'].includes(q.get('tab'))?q.get('tab'):'all';remember(d.covers||[]);nextTracks=musicProfileItems(d,tab);html=heading('음악가의 페이지')+personProfileHTML(d,param,tab);}
   else html=artistPageHTML(d,param,new URLSearchParams(paramQuery?.split('?')[1]||'').get('tab'));
  }else if(['library','history','studio','upload','manage','cover','gold','admin','sing'].includes(base)&&!me){returnRoute=location.hash;html=gate();}
  else if(base==='library'){
   await refreshLibrary(false,readApi);const tab=param||'likes';nextTracks=library.likes;
   html=heading('내 보관함','좋아하는 음악과 창작자를 한곳에서.')+`<div class="tabs">${[['likes','좋아요'],['playlists','플레이리스트'],['artists','아티스트'],['producers','제작자']].map(([k,v])=>`<a class="tab ${tab===k?'active':''}" href="#library/${k}">${v}</a>`).join('')}</div>`;
   if(tab==='playlists')html+=`<div class="playlist-actions"><button class="primary-button" id="new-playlist">${icon('plus')} 플레이리스트 만들기</button></div>`+playlistsHTML(library.playlists);
   else if(tab==='artists'||tab==='producers')html+=identityCards(library.follows.filter(f=>f.kind===(tab==='artists'?'artist':'producer')).map(f=>({...f,id:f.target_id})),tab==='artists'?'artist':'producer');
   else html+=`<div class="inline-actions playlist-actions"><button class="primary-button" data-organize-likes ${library.likes.length?'':'disabled'}>좋아요한 곡으로 플레이리스트 만들기 ${icon('plus')}</button><span class="field-help">우울할 때, 기분 업… 기분에 맞게 모아보세요.</span></div>`+list(library.likes);
  }else if(base==='history'){const d=await readApi('/api/history');nextTracks=remember(d.tracks);html=heading('최근 들은 음악','다시 듣고 싶은 순간을 찾아보세요.')+list(d.tracks);}
  else if(base==='playlist'){
   const d=await readApi('/api/playlists/'+param);nextTracks=remember(d.tracks);const owned=me?.id===d.playlist.user_id;
   html=heading(esc(d.playlist.name),`${d.tracks.length}곡 · ${d.playlist.is_public?'추천 플레이리스트':'나만 보는 플레이리스트'}`)+`<div class="inline-actions playlist-actions"><button class="primary-button" data-play-all>전체 재생 ${icon('audio-play')}</button>${owned?`<button class="small-button" data-pick-playlist="${param}">좋아요한 곡 담기</button><button class="small-button" data-order-playlist="${param}">곡 순서 편집</button><button class="small-button" data-edit-playlist="${param}">이름 · 공개 설정</button><button class="small-button" data-delete-playlist="${param}">삭제</button>`:''}${d.playlist.is_public?`<button class="small-button" data-share>링크 복사</button>`:''}</div>`+list(d.tracks,owned?param:null);
  }else if(base==='account')html=accountHTML()+(authConfig?.track_moderator?'<p><a class="small-button" href="#admin/track-review">음원 검토 목록</a></p>':'');
  else if(base==='upload'){studioData=await readApi('/api/studio');html=uploadHTML(studioData);}
  else if(base==='karaoke'){const [d,duets]=await Promise.all([readApi('/api/karaoke'),readApi('/api/duets')]);nextTracks=[...d.tracks,...duets.tracks];html=karaokeListHTML(d.tracks,duets.tracks);}
  else if(base==='sing'){const d=await loadSingRoute(param,new URLSearchParams(paramQuery?.split('?')[1]||''),readApi);if(ticket!==renderId)return;if(d.chooseMode){history.replaceState(history.state,'','#song/'+encodeURIComponent(param));await render();openRecordingMode(d);return;}routeSing=d;html=singHTML(d);}
  else if(base==='cover'){const {track:o}=await readApi('/api/tracks/'+param);remember([o]);html=coverUploadHTML(o);}
  else if(base==='gifts')html=await finalGiftShopView(param,readApi);
  else if(base==='gold')html=(param==='history'?heading('보낸 선물 내역')+'<a class="text-link" href="#gold">골드 충전으로</a>'+sentGiftHistoryHTML(await readApi('/api/gold')):goldHTML(await readApi('/api/gold')));
  else if(base==='admin'&&param==='track-review'){const q=new URLSearchParams(paramQuery?.split('?')[1]||'');html=trackReviewHTML(await readApi('/api/admin/track-review?'+q.toString()));if(authConfig?.admin)html+='<section class="surface"><button class="small-button danger-button" data-purge-all-covers>사이트 전체 커버곡 삭제</button></section>';}
  else if(base==='admin'&&param==='partners')html=partnerAdminHTML(await readApi('/api/admin/diamonds'));
  else if(base==='admin')html=adminHTML(await readApi('/api/admin/payouts'+(param?'?period='+encodeURIComponent(param):'')));
  else if(base==='manage'&&param){studioData=await readApi('/api/studio');const {profile,alignment,karaoke}=await readApi('/api/studio/tracks/'+param);html=profile.kind==='cover'?coverEditHTML(profile):trackEditHTML({...profile,alignment,karaoke},studioData);}
  else if(base==='studio'||base==='manage'){
   const d=await readApi('/api/studio');
   studioData=d;html=studioHTML(d)+`<section class="studio-payout-callout"><div><span class="eyebrow">FOR CREATORS</span><h2>음악으로 쌓은 응원</h2><p>정산 현황과 지급 내역을 한곳에서 확인하세요.</p></div><a class="primary-button" href="#studio/payouts">${icon('wallet')} 수익·정산 보기 ${icon('arrow')}</a></section>`;
  }else html=heading('페이지를 찾을 수 없어요')+empty('잠시 길을 잃었네요','홈에서 새로운 음악을 발견해보세요.','#home','홈으로 이동');
  if(profileHeader){const header=await profileHeader;if(header.error)throw header.error;html=header+html;}
  if(ticket!==renderId||account!==(me?.id||'guest'))return;
  if(readRevision!==apiRevision)return render();
  saveNavigationSnapshot(raw,html,nextTracks,explorer,restored?window.scrollY||0:0);
  const keepVisible=restored&&(html===cached.html||refreshWatch.changed()),scroll=window.scrollY||0;
  refreshWatch?.cleanup();
  if(!keepVisible){routeTracks=nextTracks;main.innerHTML=html;if(!restored&&typeof AifectMotion!=='undefined')AifectMotion.enter(main,base+'/'+(param||''));bindRenderedRoute(base,param,explorer,ticket);window.scrollTo({top:restored?scroll:0,behavior:'instant'});}
  main.removeAttribute('aria-busy');window.AifectUploadAds?.routeReady(base);if(base==='song'&&paramQuery?.includes('comments=1'))$('.comments-panel')?.scrollIntoView({block:'start'});
 }catch(e){if(ticket!==renderId||account!==(me?.id||'guest'))return;refreshWatch?.cleanup();if(restored&&e.status!==401&&e.status!==403){main.removeAttribute('aria-busy');return;}main.innerHTML=heading('다시 연결해주세요')+`<div class="surface empty-design"><p>${esc(e.message)}</p><button class="primary-button" id="reload-page">다시 시도</button></div>`;$('#reload-page').onclick=render;main.removeAttribute('aria-busy');}
}
function accountHTML(){
 if(me)return heading('내 계정')+`<div class="surface login-card"><h2>${esc(me.name)}님, 반가워요.</h2><p>${me.email.endsWith('.invalid')?'소셜 로그인 계정':esc(me.email)}</p><p>${member.plan==='premium'?'Premium · AAC 256kbps 고음질':'무료 회원 · AAC 128kbps'} 감상</p><p>내 플레이리스트 ${member.owned_count} / ${member.playlist_limit}개 · ${member.full_lyrics?'전체 싱크 가사':'현재·다음 가사'}</p><p><a class="text-link" href="#membership">무료 · Premium 혜택 보기</a></p><p><a class="text-link" href="#gold">골드 · 보낸 선물</a></p>${authConfig?.admin?'<p><a class="text-link" href="#admin">정산 관리</a></p>':''}<div class="inline-actions"><a class="primary-button" href="#library">내 보관함</a><button class="small-button" id="logout">로그아웃</button></div></div>${accountSettingsHTML()}`;
 const error=location.hash.includes('?error=')?decodeURIComponent(location.hash.split('?error=')[1]):'';
 return `<section class="login-layout"><div class="login-story"><span class="eyebrow">AIFECT · AI + EFFECT</span><h1>새로운 취향의 시작.<br><em>마음껏, 무료로.</em></h1><p>회원이 되면 모든 곡을 끝까지 들을 수 있어요.<br>좋아하는 음악을 모으고 창작자와 이야기를 나눠보세요.</p><div class="login-perks"><span>${icon('play')} 전체곡 무료 스트리밍</span><span>${icon('heart')} 좋아요와 나만의 플레이리스트</span><span>${icon('users')} 아티스트 · 제작자 팔로우</span></div></div><div class="surface login-card"><span class="eyebrow">WELCOME TO AIFECT</span><h2 id="auth-title">이메일로 로그인</h2><p>새로운 음악이 기다리고 있어요.</p>${error?`<p class="form-error">${esc(error)}</p>`:''}<form id="auth-form" data-mode="login"><div id="signup-name" hidden>${formField('닉네임','name','text','','maxlength="12" autocomplete="nickname" disabled')}</div>${formField('이메일','email','email','','required autocomplete="email"')}${formField('비밀번호','password','password','','required minlength="12" maxlength="128" autocomplete="current-password" placeholder="12자 이상"')}<button class="primary-button full-width" id="auth-submit">로그인</button><p class="form-error" role="alert"></p></form><button class="text-link auth-switch" id="auth-switch">처음 오셨나요? 무료 회원가입</button><div class="login-divider">소셜 계정으로 계속하기</div>${inApp&&authConfig.providers?.includes('google')?'<p class="login-note">앱에서는 Google 로그인을 준비 중이에요. 이메일 · 카카오 · Apple로 계속해주세요.</p>':''}${[['google','Google'],['kakao','카카오'],['apple','Apple']].filter(([p])=>!(inApp&&p==='google')).map(([p,n])=>authConfig.providers?.includes(p)?`<a class="social-login ${p}" href="/api/auth/${p}" data-oauth>${n}로 계속하기</a>`:`<button class="social-login ${p}" disabled>${n} · 연결 준비 중</button>`).join('')}<p class="login-note">회원은 모든 곡을 무료로 감상할 수 있습니다.</p><p class="policy-note"><a href="/terms" target="_blank" rel="noopener">이용약관</a> · <a href="/privacy" target="_blank" rel="noopener">개인정보처리방침</a> · <a href="/contact" target="_blank" rel="noopener">고객센터</a></p></div></section>`;
}
function playlistsHTML(items){return `<div class="playlist-grid">${items.map(p=>`<a class="playlist-card surface" href="#playlist/${p.id}"><div class="playlist-art cover-lime">${icon('list')}</div><h2>${esc(p.name)}</h2><p>${p.tracks}곡 · ${p.is_public?'공개':'비공개'}</p></a>`).join('')}</div>`;}
function commentsHTML(comments,t){
 comments=comments.filter(c=>!c.deleted_at);
 const row=c=>`<article data-comment-id="${esc(c.id)}" class="live-comment ${c.parent_id?'is-reply':''}"><div class="comment-avatar profile-avatar">${avatarImage({name:c.name,profile_id:c.profile_id,image_version:c.image_version})}</div><div>${c.parent_id?'<span class="comment-reply-label">답글</span>':''}<div class="song-comment-meta"><strong>${esc(c.name)}</strong>${c.creator?'<span class="creator-badge">PRODUCER</span>':''}<span class="comment-age">${new Date(c.created*1000).toLocaleDateString('ko-KR')}${c.edited?' · 수정됨':''}</span></div><p class="song-comment-body">${c.timestamp!==null?`<button class="timestamp" data-seek="${c.timestamp}" data-track="${t.id}">${time(c.timestamp)}</button>`:''}${esc(c.body)}</p><div class="inline-actions song-comment-actions"><button class="text-link ${c.liked?'is-active':''}" data-comment-like="${c.id}" data-liked="${!!c.liked}" aria-label="댓글 좋아요 ${c.likes}개" aria-pressed="${!!c.liked}">${icon('heart')} ${c.likes}</button>${!c.parent_id?`<button class="text-link" data-reply="${c.id}" data-track="${t.id}">답글</button>`:''}${c.can_report?`<button class="text-link" data-report-comment="${c.id}">신고</button>`:''}${c.can_delete&&me?.id!==c.user_id?`<button class="text-link" data-delete-comment="${c.id}">삭제</button>`:''}${me?.id===c.user_id?`<button class="text-link" data-edit-comment="${c.id}" data-body="${esc(c.body)}">수정</button><button class="text-link" data-delete-comment="${c.id}">삭제</button>`:''}</div></div></article>`;
 return comments.length?comments.filter(c=>!c.parent_id).map(c=>row(c)+comments.filter(r=>r.parent_id===c.id).map(row).join('')).join(''):'<p class="quiet">첫 감상을 남겨보세요.</p>';
}
function songCredits(t){return t.kind==='cover'?`<div class="song-credits"><div><span>COVER BY</span><a href="#producer/${esc(t.producer_id)}">${esc(t.producer)}</a>${t.duet_partner_id?` & <a href="#producer/${esc(t.duet_partner_id)}">${esc(t.duet_partner)}</a>`:''}<small>${t.cover_mode==='duet'?(t.duet_open?'듀엣 · 참여 대기':'듀엣'):'솔로'}</small></div><div><span>ORIGINAL</span><a href="#song/${esc(t.original_id)}">${esc(t.original_title)} · ${esc(t.original_artist)}</a></div></div>`:`<div class="song-credits"><div><span>${hasArtist(t)?'AI ARTIST':'PRODUCER'}</span>${credits(t)}</div></div>`;}
function coversPanelHTML(t,d,tab){return songCoversPanelHTML(t,d,tab);}

function profileMusicCards(items){return '<div class="music-feed">'+items.map(t=>musicTrackCard(t)).join('')+'</div>';}
function personProfileHTML(d,id,tab='all',balances=''){
 const p=d.profile,own=!!me&&p.user_id===me.id,items=musicProfileItems(d,tab),total=musicProfileItems(d).length,duets=(d.covers||[]).filter(t=>t.cover_mode==='duet').length;
 const following=own&&Number.isFinite(d.following_count)?'<a href="#following"><b>'+number(d.following_count)+'</b> 팔로잉</a>':'';
 const tabs=[['all','전체',total],['tracks','제작곡',(d.tracks||[]).length],['covers','커버',(d.covers||[]).length],['duets','듀엣',duets]];
 return ''+
 '<section class="person-profile social-profile social-profile-square">'+profilePhotoHTML(p)+'<div class="social-profile-main"><div class="social-profile-identity"><span class="eyebrow">MY MUSIC, OUR CONNECTION</span><h2>'+esc(p.name)+(p.partner_badge?'<span class="partner-badge">✓ '+esc(p.partner_badge)+'</span>':'')+'<span class="mp-public-id">ID · '+esc(p.public_id||'발급 확인 중')+'</span></h2><p>'+esc(p.bio||'음악으로 나를 소개해요.')+'</p><div class="music-profile-stats"><'+(own?'a href="#library/followers"':'span')+' data-followers="producer/'+esc(id)+'" data-count="'+Number(d.followers||0)+'">'+number(d.followers||0)+' 팔로워</'+(own?'a':'span')+'>'+following+'<span><b>'+total+'</b> 공개 음악</span></div></div><div class="social-profile-actions">'+
 (own?'<a class="primary-button" href="#profile/edit">프로필 수정</a><a class="small-button" href="#studio">스튜디오</a><a class="small-button" href="#library/covers">내 커버</a><a class="small-button" href="#dm">메시지</a>':'<button class="primary-button" data-follow="producer/'+esc(id)+'" aria-pressed="'+followed('producer',id)+'">'+(followed('producer',id)?'팔로잉':'팔로우')+'</button><a class="small-button" href="#dm/'+esc(id)+'">메시지</a><button class="small-button gift-entry" data-profile-gift="'+esc(id)+'">'+icon('gift')+' 선물</button>')+
 (!own&&d.invite_crew?'<button type="button" class="small-button" data-crew-invite="'+esc(id)+'" data-crew="'+esc(d.invite_crew.id)+'" title="'+esc(d.invite_crew.name)+' 크루 초대 DM 보내기">'+icon('users')+' 내 크루에 초대</button>':'')+
 '<button type="button" class="text-link profile-gift-ranking" data-gift-ranking="'+esc(id)+'">'+icon('chart')+' 선물 랭킹 TOP 50</button></div></div></section>'+
 profileGalleryHTML(d,id)+'<div class="profile-page-layout"><div class="profile-music-main"><nav class="profile-content-tabs" aria-label="프로필 음악">'+tabs.map(([key,label,n])=>'<a class="'+(tab===key?'active':'')+'" href="'+(own?'#profile':'#producer/'+esc(id))+'?tab='+key+'" '+(tab===key?'aria-current="page"':'')+'>'+label+'<span>'+n+'</span></a>').join('')+'</nav>'+
 (items.length?'<div class="profile-record-grid">'+(['covers','duets'].includes(tab)?coverCollectionHTML(items,'profile-covers',own):grid(items))+'</div>':'<div class="profile-music-empty">'+icon('music')+'<h3>음악으로 채워갈 공간</h3><p>이 탭에 공개된 음악이 없어요.</p>'+(own?'<a class="small-button" href="#karaoke">플레이로 이동</a>':'')+'</div>')+
 '</div><aside class="profile-about"><section class="surface"><span class="eyebrow">ABOUT</span><h3>음악으로 만나요</h3><p>'+esc(p.bio||'좋아하는 노래와 나만의 이야기를 나누는 공간이에요.')+'</p><a class="text-link" href="#library">'+(own?'내 보관함 열기':'나의 보관함')+' '+icon('chevron')+'</a></section>'+
 (own?balances+'<details class="profile-tools surface"><summary>내 레벨과 활동</summary>'+playerProgressHTML(p)+musicMyShortcuts()+'</details>':'')+'</aside></div>'+
 giftsPanelHTML(d.gifts,'받은 응원',{profile:p});
}
function songCreditCardHTML(t){
 const display=value=>Array.isArray(value)?value.filter(Boolean).join(' · '):value;
 const genres=t.genres?.length?t.genres:[t.genre].filter(Boolean);
 const moods=(t.moods||[]).map(id=>AifectGenres.MOODS.find(m=>m.id===id)?.name||id);
 const fields=[['AI 도구',t.ai_tool],['사람의 참여',t.participation],['장르',genres],['기분 · 활동',moods],['태그',t.tags]];
 return '<section class="surface song-credit-card"><h3>이 음악의 크레딧</h3><dl class="production-info">'+fields.map(([label,value])=>'<dt>'+label+'</dt><dd>'+esc(display(value)||'—')+'</dd>').join('')+'</dl></section>';
}
function songSupportCardsHTML(){
 const silver='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="11" cy="6" rx="9" ry="3.5"/><path d="M2 6v15c0 1.9 4 3.5 9 3.5M20 6v5M2 11c0 1.9 4 3.5 9 3.5M2 16c0 1.9 4 3.5 9 3.5"/><circle cx="22" cy="21" r="9" fill="var(--ds-panel)"/><path d="M24.7 17.8c-.6-.8-1.6-1.2-2.7-1.2-1.7 0-2.8.8-2.8 2.1 0 1.2 1.1 1.8 2.8 2.2s2.8 1 2.8 2.3c0 1.4-1.2 2.3-2.9 2.3-1.3 0-2.5-.5-3.1-1.4"/></svg>';
 const card=(kind,href,title,caption,art)=>'<a class="song-support-card song-support-card--'+kind+'" href="'+href+'"><span class="song-support-card-icon" aria-hidden="true">'+art+'</span><span class="song-support-card-copy"><strong>'+title+'</strong><span>'+caption+'</span></span><span class="song-support-card-arrow" aria-hidden="true">'+icon('chevron')+'</span></a>';
 return '<section class="song-support-gift">'+card('gift','#gifts','선물로 마음 전하기','선물함 둘러보기',icon('gift'))+card('silver','#rewards','무료 실버 받기','출석·활동으로 실버를 모아요.',silver)+'</section>';
}
function songSupportHTML(g,t){
 const ranking=(g.support_ranking||g.ranking||[]).slice(0,5),empty='아직 받은 선물이 없어요.<br>첫 응원으로 이 무대를 빛내주세요.';
 const gifts=r=>[Number(r.official_stars)>0?'응원별 ×'+number(r.official_stars):'',Number(r.stars)>0?'실버 '+number(r.stars)+'S':'',Number(r.gold)>0?'골드 '+number(r.gold)+'G':''].filter(Boolean).join(' · ');
 return '<section class="surface song-support-rank"><h2>응원 순위</h2><p class="song-support-caption">보내준 응원만큼 쌓이는 이 곡의 응원 순위</p>'+ (ranking.length?'<ol class="song-support-ranking">'+ranking.map((r,i)=>'<li><b class="song-support-position">'+(i+1)+'</b><div class="song-support-person">'+(r.profile_id?'<a href="#producer/'+esc(r.profile_id)+'" title="'+esc(r.name)+'">'+esc(r.name)+'</a>':'<strong title="'+esc(r.name)+'">'+esc(r.name)+'</strong>')+'</div><span class="song-support-gifts">'+gifts(r)+'</span></li>').join('')+'</ol>':'<p class="gift-rank-empty">'+empty+'</p>')+'</section>'+songSupportCardsHTML();
}
function giftsPanelHTML(g,title,target={}){
 if(!g)return '';
 if(target.track)return songSupportHTML(g,target.track);
 const own=me?.id===(target.track?.user_id||target.profile?.user_id),attr=target.track?`data-gift="${esc(target.track.id)}"`:`data-profile-gift="${esc(target.profile?.id||'')}"`;
 return `<section class="surface gift-rank gift-rank-pair support-showcase"><div class="gift-rank-list"><div class="section-heading"><h2>${title}</h2><span class="gift-total">${number(g.free_count)} S · ${number(g.total_gold)} G</span></div>${officialSupportHTML(g.official_ai)}<p class="gift-fineprint">보내준 응원만큼 · 1 S와 1 G는 각각 1점</p>${g.ranking.length?`<ol class="gift-ranking">${g.ranking.map(r=>`<li><b>${r.rank}</b><span>${esc(r.name)}<small>${number(r.stars)} S · ${number(r.gold)} G</small></span><em>${number(r.score)}점</em></li>`).join('')}</ol>`:'<p class="gift-rank-empty">아직 받은 선물이 없어요.<br>첫 응원으로 이 무대를 빛내주세요.</p>'}</div><aside class="gift-rank-send"><button type="button" class="gift-support-banner" ${attr} ${own?'disabled':''} aria-label="${own?'내게 도착하는 마음':'선물로 응원하기'}"><span class="gift-support-icon" aria-hidden="true">${icon('gift')}</span><span class="gift-support-copy"><small>A LITTLE GIFT, A BIG ENCORE</small><strong>${own?'내게 도착하는 마음':'선물로 응원하기'}</strong><span>${own?'방문자가 이곳에서 응원을 보낼 수 있어요.':'무료 실버부터 특별한 골드 선물까지.'}</span></span>${own?'':`<span class="gift-support-arrow" aria-hidden="true">${icon('arrow')}</span>`}</button><a class="text-link" href="#rewards">출석 · 활동하고 무료 실버 받기 ${icon('chevron')}</a><p class="gift-fineprint">실버는 순위에만 반영돼요. 수익은 유료 골드 선물로만 발생해요.</p></aside></section>`;
}

function trackModerationToolsHTML(t){const actions=(me&&me.id!==t.user_id?'<button class="text-link" data-report-track="'+esc(t.id)+'">음질 문제 신고</button>':'')+(authConfig?.track_moderator?'<button class="text-link" data-review-track="'+esc(t.id)+'">운영자 검토</button>':'');return actions?'<div class="inline-actions">'+actions+'</div>':'';}
function trackReviewHTML(d){
 const labels={inactive:'60일간 유효 재생 없음',low_quality:'음질 신고 '+d.report_threshold+'명 이상'},date=s=>s?new Date(s*1000).toLocaleDateString('ko-KR'):'재생 없음';
 return heading('음원 검토 목록')+'<p class="field-help">60일간 유효 재생이 없거나 서로 다른 회원 3명 이상이 음질 문제를 신고한 곡입니다. 자동 제거는 하지 않아요.</p><div class="tabs">'+[['candidates','검토 대상'],['all','전체 공개곡'],['removed','운영자 제거곡']].map(([v,label])=>'<a class="tab '+(d.view===v?'active':'')+'" href="#admin/track-review?view='+v+'">'+label+'</a>').join('')+'</div><form id="track-review-search" class="aifect-search"><input name="q" aria-label="검토 음원 검색" placeholder="곡 제목, 작성자 검색" maxlength="100" value="'+esc(d.q)+'"><input type="hidden" name="view" value="'+esc(d.view)+'"><button class="small-button">검색</button></form><div class="track-review-list">'+(d.tracks.length?d.tracks.map(t=>'<article class="surface"><div class="section-heading"><div><h2>'+esc(t.title)+'</h2><p>'+esc(t.producer)+' · '+(t.kind==='cover'?'커버':'제작곡')+'</p></div><button class="small-button" data-review-track="'+esc(t.id)+'">검토하기</button></div><p>'+t.reasons.map(r=>'<span class="genre-chip">'+esc(labels[r])+'</span>').join(' ')+'</p><p class="field-help">등록 '+date(t.created)+' · 마지막 유효 재생 '+date(t.last_played)+' · 신고 '+number(t.report_count)+'명</p></article>').join(''):'<div class="surface">해당하는 음원이 없어요.</div>')+'</div>'+(d.has_more?'<p class="field-help">처음 100곡입니다. 검색해서 범위를 좁혀주세요.</p>':'');
}
document.addEventListener('submit',e=>{if(e.target.id!=='track-review-search')return;e.preventDefault();const fd=new FormData(e.target);location.hash='admin/track-review?'+new URLSearchParams({view:fd.get('view'),q:fd.get('q')});});
