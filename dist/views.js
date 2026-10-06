// Only browsing surfaces are kept. Editors, messages, money and membership stay live.
const navigationSnapshots=new Map();let navigationRefreshCleanup=null;
function clearNavigationSnapshots(){navigationSnapshots.clear();}
function canCacheRoute(raw){
 const [route]=raw.replace(/^#/,'').split('?'),[base,param]=route.split('/');
 if(['charts','discover','search','collections','artists','producers','artist','following','history'].includes(base))return true;
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
 icons();paintInteractions();bindForms(base,param);bindGiftClaims($('#gift-shop-rewards'));bindExplorer(explorer);bindBrowse(explorer);bindImprovements(explorer);
 if(base==='community'&&!param)void loadCommunityCrews($('#community-crew-preview'),ticket);
}
function watchCachedNavigation(main){
 let touched=false;const initialScroll=window.scrollY||0,mark=()=>{touched=true;};
 const events=['input','change','pointerdown','keydown','wheel','touchstart'];
 events.forEach(event=>main.addEventListener(event,mark,{passive:true}));
 const cleanup=()=>events.forEach(event=>main.removeEventListener(event,mark));
 navigationRefreshCleanup=cleanup;
 return {changed:()=>touched||(window.scrollY||0)!==initialScroll||!!(main.contains(document.activeElement)&&document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')),cleanup};
}
async function render(){
 setMobileMenu(false);

 const ticket=++renderId,raw=location.hash.slice(1)||'home',[baseQuery,paramQuery]=raw.split('/'),[base]=baseQuery.split('?'),param=paramQuery?.split('?')[0];
 if(sing){
  if(singLive(sing))await finishSinging();
  if(singBusy(sing)){history.replaceState(null,'','#sing/'+sing.id);toast('녹음을 정리한 뒤 이동해주세요.');return;}
  if(sing.dirty){try{await saveSingDraft(sing);}catch(e){history.replaceState(null,'','#sing/'+sing.id);toast('임시저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해주세요.');return;}}
 }
 clearInterval(socialTimer);socialTimer=null;socialCleanup?.();socialCleanup=null;
 cleanupLyricsEditor();cleanupSing();
 updateBrowseNavigation(base,param);
 const main=$('#main'),account=me?.id||'guest';navigationRefreshCleanup?.();navigationRefreshCleanup=null;
 const previous=navigationSnapshots.get(navigationKey(main.dataset.route));if(previous&&main.dataset.account===account)previous.scroll=window.scrollY||0;
 let cached=navigationSnapshots.get(navigationKey(raw));
 const pendingView=(typeof crewPendingView==='function'?crewPendingView(base,param,raw):null)||(typeof communityPendingView==='function'?communityPendingView(base,param,raw):null);
 if(!(cached&&cached.account===account&&cached.revision===apiRevision&&cached.until>Date.now())&&pendingView?.cached&&canCacheRoute(raw))cached={...pendingView,account,revision:apiRevision,until:Date.now()+60000,explorer:pendingView,scroll:0};
 const restored=canCacheRoute(raw)&&cached&&cached.account===account&&cached.revision===apiRevision&&cached.until>Date.now();
 let refreshWatch=null;
 if(restored){routeTracks=remember(cached.tracks);main.innerHTML=cached.html;main.removeAttribute('aria-busy');bindRenderedRoute(base,param,cached.explorer,ticket);window.scrollTo({top:cached.scroll||0,behavior:'instant'});refreshWatch=watchCachedNavigation(main);}
 else main.setAttribute('aria-busy','true');
 if(!restored&&base!=='home'&&(pendingView||main.dataset.route!==raw||main.dataset.account!==account)){const titles={charts:'차트',karaoke:'부르기',community:'커뮤니티',library:'내 보관함',following:'팔로우',gifts:'선물함',gold:'골드',dm:'DM 메시지',crew:'크루',payouts:'정산',rewards:'오늘의 응원별',song:'곡 이야기',producer:'프로필',artist:'AI 아티스트',profile:'내 프로필',account:'내 계정',upload:'음원 업로드',studio:'창작자 스튜디오',search:'음악 검색',discover:'음악 발견',history:'최근 들은 음악'};main.classList.remove('motion-enter');main.innerHTML=pendingView?.html||heading(titles[base]||'음악 둘러보기')+'<div class="route-loading" role="status"><span>불러오는 중…</span><div></div><div></div><div></div></div>';window.scrollTo({top:0,behavior:'instant'});}
 main.dataset.account=account;
 main.dataset.route=raw;let html='',nextTracks=[];
 try{
  if(base==='home')return await renderHome(ticket);
  await accountReady;if(ticket!==renderId)return;
  if(account!==(me?.id||'guest'))return render();
  const readRevision=apiRevision;
  const profileHeader=base==='library'?libraryProfileHTML().catch(error=>({error})):null;
  const explorer=await improvementsView(base,param,raw)||await browseView(base,param,raw)||await explorerView(base,param,raw);
  if(explorer){html=explorer.html;nextTracks=remember(explorer.tracks||[]);}
  else if(['discover','charts','artists','producers','search'].includes(base)){
   let query='';const genre=base==='discover'?decodeURIComponent(param||'전체'):'전체',searchValue=base==='search'?decodeURIComponent(param||''):'';
   if(base==='charts')query='?chart='+({rising:'rising',newcomers:'newcomers',releases:'releases'}[param]||'top');
   if(base==='discover'&&genre!=='전체')query='?genre='+encodeURIComponent(genre);
   if(base==='search')query='?q='+encodeURIComponent(searchValue);
   query+=(query?'&':'?')+'section='+(['artists','producers'].includes(base)?base:'tracks');
   const data=await api('/api/catalog'+query);nextTracks=remember(data.tracks||[]);
   if(base==='discover')html=heading('음악 발견','장르를 넘나들며 새로운 취향을 찾아보세요.')+`<div class="genre-chips">${genres.map(g=>`<a class="genre-chip ${g===genre?'active':''}" href="#discover/${encodeURIComponent(g)}">${g}</a>`).join('')}</div>`+grid(data.tracks);
   else if(base==='charts')html=heading('AIFECT 차트','실제 감상과 좋아요·댓글로 함께 만드는 차트입니다.')+chartTabs(param||'')+list(data.tracks);
   else if(base==='artists'||base==='producers')html=heading(base==='artists'?'AI 아티스트':'제작자',base==='artists'?'새로운 목소리, 새로운 세계.':'당신이 좋아하는 음악을 만드는 사람들.')+identityCards(data[base],base==='artists'?'artist':'producer');
   else html=heading('음악 검색')+`<form id="search-form" class="aifect-search">${icon('search')}<input name="q" aria-label="곡, 아티스트, 제작자 검색" placeholder="곡, 아티스트, 제작자, 태그" value="${esc(searchValue)}" maxlength="100"><button class="primary-button">검색</button></form><p class="search-caption">${searchValue?`“${esc(searchValue)}” 검색 결과 ${data.tracks.length}곡`:'어떤 음악을 찾고 계신가요?'}</p>`+list(data.tracks);
  }else if(base==='song'){
   const {track:t}=await api('/api/tracks/'+param);remember([t]);nextTracks=[t];
   const coverSort=new URLSearchParams(paramQuery?.split('?')[1]||'').get('covers')||'popular';
   const [{comments},coverData,giftData]=await Promise.all([api('/api/tracks/'+param+'/comments'),t.kind==='original'?api('/api/tracks/'+param+'/covers?sort='+encodeURIComponent(coverSort)):null,api('/api/tracks/'+param+'/gifts')]);if(coverData)remember(coverData.covers);
   html=heading('곡 이야기')+`<section class="song-detail">${cover(t)}<div><span class="eyebrow">${esc(t.genre)} · ${time(t.duration)}</span><h2>${esc(t.title)}</h2>${songCredits(t)}<p class="song-description">${esc(t.description||'음악을 듣고 감상을 나눠보세요.')}</p><div class="inline-actions"><button class="primary-button" data-play="${t.id}">${icon('play')} ${me?'전체곡 듣기':'60초 미리 듣기'}</button>${t.karaoke_ready?`<a class="primary-button" href="#sing/${t.id}">${icon('mic')} 노래 부르기</a>`:''}<button class="small-button ${liked(t.id)?'is-active':''}" data-like="${t.id}" aria-label="좋아요 ${number(t.likes)}개" aria-pressed="${liked(t.id)}">${icon('heart')} <span data-like-count>${number(t.likes)}</span></button><button class="small-button" data-add="${t.id}">${icon('plus')} 저장</button>${me?.id===t.user_id?'':`<button class="small-button gift-entry" data-gift="${t.id}">${icon('gift')} 선물하기</button>`}</div>${t.cover_mode==='duet'&&t.duet_open&&t.user_id!==me?.id?`<a class="primary-button" href="#sing/${esc(t.original_id)}?duet=${esc(t.id)}">듀엣 참여</a>`:''}${t.kind==='cover'?`<a class="small-button" href="${member.plan==='premium'?'/api/covers/'+t.id+'/download':'#membership'}">${member.plan==='premium'?'커버 파일 다운로드':'Premium으로 커버 다운로드'}</a>`:''}<p class="song-metrics">${number(t.plays)}회 감상 · ${number(t.comments)}개 댓글</p></div></section>${lyricsPanel(t)}${coversPanelHTML(t,coverData,coverSort)}${giftsPanelHTML(giftData,'응원 순위',{track:t})}<div class="song-columns"><section class="surface comments-panel"><div class="section-heading"><h2>함께 듣는 이야기</h2><select id="comment-sort" aria-label="댓글 정렬"><option value="latest">최신순</option><option value="popular">인기순</option><option value="timeline">타임라인순</option></select></div><form id="comment-form"><textarea name="body" maxlength="2000" required placeholder="${me?'이 곡의 어떤 순간이 좋았나요?':'로그인 후 감상을 남겨보세요.'}" aria-label="댓글"></textarea><div class="comment-compose-bottom"><label><input name="with_time" type="checkbox" checked> 현재 재생 시간 포함</label><button class="primary-button">댓글 등록</button></div><p class="form-error" role="alert"></p></form><div id="comments">${commentsHTML(comments,t)}</div></section><aside class="song-sidebar"><section class="surface"><h3>이 음악의 크레딧</h3><dl class="production-info"><dt>AI 도구</dt><dd>${esc(t.ai_tool)}</dd><dt>사람의 참여</dt><dd>${esc(t.participation||'—')}</dd><dt>장르</dt><dd>${esc(t.genre)}</dd><dt>태그</dt><dd>${esc(t.tags||'—')}</dd></dl></section></aside></div>`;
   html=html.replace('<p class="song-metrics">',trackModerationToolsHTML(t)+'<p class="song-metrics">');
  }else if(base==='artist'||base==='producer'){
   const d=await api(`/api/${base==='artist'?'artists':'producers'}/${param}`);nextTracks=remember(d.tracks);
   if(base==='producer'){const q=new URLSearchParams(paramQuery?.split('?')[1]||''),tab=['tracks','covers','duets'].includes(q.get('tab'))?q.get('tab'):'all';remember(d.covers||[]);nextTracks=musicProfileItems(d,tab);html=heading('음악가의 페이지')+personProfileHTML(d,param,tab);}
   else html=heading(base==='artist'?'AI 아티스트':'제작자')+`<section class="profile-hero surface">${portrait(d.profile,base)}<div><span class="eyebrow">${base==='artist'?'AI ARTIST':'PRODUCER'}</span><h2>${esc(d.profile.name)}</h2><p>${esc(d.profile.bio||'새로운 음악으로 만나요.')}</p><div class="inline-actions"><span><span data-followers="${base}/${esc(param)}" data-count="${Number(d.followers)}">${number(d.followers)} 팔로워</span> · ${d.tracks.length}곡</span><button class="primary-button" data-follow="${base}/${param}">${followed(base,param)?'팔로잉':'팔로우'}</button></div></div></section>`+section('공개한 음악')+list(d.tracks);
  }else if(['library','history','studio','upload','manage','cover','gold','admin','sing'].includes(base)&&!me){returnRoute=location.hash;html=gate();}
  else if(base==='library'){
   await refreshLibrary();const tab=param||'likes';nextTracks=library.likes;
   html=heading('내 보관함','좋아하는 음악과 창작자를 한곳에서.')+`<div class="tabs">${[['likes','좋아요'],['playlists','플레이리스트'],['artists','아티스트'],['producers','제작자']].map(([k,v])=>`<a class="tab ${tab===k?'active':''}" href="#library/${k}">${v}</a>`).join('')}</div>`;
   if(tab==='playlists')html+=`<div class="playlist-actions"><button class="primary-button" id="new-playlist">${icon('plus')} 플레이리스트 만들기</button></div>`+playlistsHTML(library.playlists);
   else if(tab==='artists'||tab==='producers')html+=identityCards(library.follows.filter(f=>f.kind===(tab==='artists'?'artist':'producer')).map(f=>({...f,id:f.target_id})),tab==='artists'?'artist':'producer');
   else html+=`<div class="inline-actions playlist-actions"><button class="primary-button" data-organize-likes ${library.likes.length?'':'disabled'}>좋아요한 곡으로 플레이리스트 만들기 ${icon('plus')}</button><span class="field-help">우울할 때, 기분 업… 기분에 맞게 모아보세요.</span></div>`+list(library.likes);
  }else if(base==='history'){const d=await api('/api/history');nextTracks=remember(d.tracks);html=heading('최근 들은 음악','다시 듣고 싶은 순간을 찾아보세요.')+list(d.tracks);}
  else if(base==='playlist'){
   const d=await api('/api/playlists/'+param);nextTracks=remember(d.tracks);const owned=me?.id===d.playlist.user_id;
   html=heading(esc(d.playlist.name),`${d.tracks.length}곡 · ${d.playlist.is_public?'공개 플레이리스트':'나만 보는 플레이리스트'}`)+`<div class="inline-actions playlist-actions"><button class="primary-button" data-play-all>전체 재생 ${icon('play')}</button>${owned?`<button class="small-button" data-pick-playlist="${param}">좋아요한 곡 담기</button><button class="small-button" data-order-playlist="${param}">곡 순서 편집</button><button class="small-button" data-edit-playlist="${param}">이름 · 공개 설정</button><button class="small-button" data-delete-playlist="${param}">삭제</button>`:''}${d.playlist.is_public?`<button class="small-button" data-share>링크 복사</button>`:''}</div>`+list(d.tracks,owned?param:null);
  }else if(base==='account')html=accountHTML()+(authConfig?.track_moderator?'<p><a class="small-button" href="#admin/track-review">음원 검토 목록 →</a></p>':'');
  else if(base==='upload'){studioData=await api('/api/studio');html=uploadHTML(studioData);}
  else if(base==='karaoke'){const [d,duets]=await Promise.all([api('/api/karaoke'),api('/api/duets')]);nextTracks=[...d.tracks,...duets.tracks];html=karaokeListHTML(d.tracks,duets.tracks);}
  else if(base==='sing'){const q=new URLSearchParams(paramQuery?.split('?')[1]||'');const parent=q.get('duet');routeSing=await api(parent?'/api/duets/'+encodeURIComponent(parent):'/api/karaoke/'+param);if(routeSing.track.id!==param)throw new Error('듀엣의 원곡을 확인해주세요.');routeSing.mode=routeSing.duet||q.get('mode')==='duet'?'duet':'solo';routeSing.part=routeSing.duet?.part||(q.get('part')==='female'?'female':'male');html=singHTML(routeSing);}
  else if(base==='cover'){const {track:o}=await api('/api/tracks/'+param);remember([o]);html=coverUploadHTML(o);}
  else if(base==='gifts')html=giftShopHTML(me?await api('/api/gold'):null);
  else if(base==='gold')html=goldHTML(await api('/api/gold'));
  else if(base==='admin'&&param==='track-review'){const q=new URLSearchParams(paramQuery?.split('?')[1]||'');html=trackReviewHTML(await api('/api/admin/track-review?'+q.toString()));}
  else if(base==='admin')html=adminHTML(await api('/api/admin/payouts'+(param?'?period='+encodeURIComponent(param):'')));
  else if(base==='manage'&&param){studioData=await api('/api/studio');const {profile,alignment,karaoke}=await api('/api/studio/tracks/'+param);html=profile.kind==='cover'?coverEditHTML(profile):trackEditHTML({...profile,alignment,karaoke},studioData);}
  else if(base==='studio'||base==='manage'){
   const d=await api('/api/studio');
   studioData=d;html=studioHTML(d)+`<a class="primary-button" href="#payouts">정산 내역 보기</a>`;
  }else html=heading('페이지를 찾을 수 없어요')+empty('잠시 길을 잃었네요','홈에서 새로운 음악을 발견해보세요.','#home','홈으로 이동');
  if(profileHeader){const header=await profileHeader;if(header.error)throw header.error;html=header+html;}
  if(['search','discover','charts','collections'].includes(base))html=listenNav(base==='search'||base==='discover'?'search':base)+html;
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
 if(me)return heading('내 계정')+`<div class="surface login-card"><h2>${esc(me.name)}님, 반가워요.</h2><p>${me.email.endsWith('.invalid')?'소셜 로그인 계정':esc(me.email)}</p><p>${member.plan==='premium'?'Premium · AAC 256kbps 고음질':'무료 회원 · AAC 128kbps'} 감상</p><p>내 플레이리스트 ${member.owned_count} / ${member.playlist_limit}개 · ${member.full_lyrics?'전체 싱크 가사':'현재·다음 가사'}</p><p><a class="text-link" href="#membership">무료 · Premium 혜택 보기 →</a></p><p><a class="text-link" href="#gold">골드 · 보낸 선물 →</a></p>${authConfig?.admin?'<p><a class="text-link" href="#admin">정산 관리 →</a></p>':''}<div class="inline-actions"><a class="primary-button" href="#library">내 보관함</a><button class="small-button" id="logout">로그아웃</button></div></div>${accountSettingsHTML()}`;
 const error=location.hash.includes('?error=')?decodeURIComponent(location.hash.split('?error=')[1]):'';
 return `<section class="login-layout"><div class="login-story"><span class="eyebrow">AIFECT · AI + EFFECT</span><h1>새로운 취향의 시작.<br><em>마음껏, 무료로.</em></h1><p>회원이 되면 모든 곡을 끝까지 들을 수 있어요.<br>좋아하는 음악을 모으고 창작자와 이야기를 나눠보세요.</p><div class="login-perks"><span>${icon('play')} 전체곡 무료 스트리밍</span><span>${icon('heart')} 좋아요와 나만의 플레이리스트</span><span>${icon('users')} 아티스트 · 제작자 팔로우</span></div></div><div class="surface login-card"><span class="eyebrow">WELCOME TO AIFECT</span><h2 id="auth-title">이메일로 로그인</h2><p>새로운 음악이 기다리고 있어요.</p>${error?`<p class="form-error">${esc(error)}</p>`:''}<form id="auth-form" data-mode="login"><div id="signup-name" hidden>${formField('닉네임','name','text','','maxlength="40" autocomplete="nickname"')}</div>${formField('이메일','email','email','','required autocomplete="email"')}${formField('비밀번호','password','password','','required minlength="12" maxlength="128" autocomplete="current-password" placeholder="12자 이상"')}<button class="primary-button full-width" id="auth-submit">로그인</button><p class="form-error" role="alert"></p></form><button class="text-link auth-switch" id="auth-switch">처음 오셨나요? 무료 회원가입</button><div class="login-divider">소셜 계정으로 계속하기</div>${inApp&&authConfig.providers?.includes('google')?'<p class="login-note">앱에서는 Google 로그인을 준비 중이에요. 이메일 · 카카오 · Apple로 계속해주세요.</p>':''}${[['google','Google'],['kakao','카카오'],['apple','Apple']].filter(([p])=>!(inApp&&p==='google')).map(([p,n])=>authConfig.providers?.includes(p)?`<a class="social-login ${p}" href="/api/auth/${p}" data-oauth>${n}로 계속하기</a>`:`<button class="social-login ${p}" disabled>${n} · 연결 준비 중</button>`).join('')}<p class="login-note">회원은 모든 곡을 무료로 감상할 수 있습니다.</p><p class="policy-note"><a href="/terms" target="_blank" rel="noopener">이용약관</a> · <a href="/privacy" target="_blank" rel="noopener">개인정보처리방침</a> · <a href="/contact" target="_blank" rel="noopener">고객센터</a></p></div></section>`;
}
function playlistsHTML(items){return `<div class="playlist-grid">${items.map(p=>`<a class="playlist-card surface" href="#playlist/${p.id}"><div class="playlist-art cover-lime">${icon('list')}</div><h2>${esc(p.name)}</h2><p>${p.tracks}곡 · ${p.is_public?'공개':'비공개'}</p></a>`).join('')}</div>`;}
function commentsHTML(comments,t){
 comments=comments.filter(c=>!c.deleted_at);
 const row=c=>`<article class="live-comment ${c.parent_id?'is-reply':''}"><div class="comment-avatar">${esc(c.name.slice(0,1))}</div><div><div><strong>${esc(c.name)}</strong>${c.creator?'<span class="creator-badge">PRODUCER</span>':''}<span class="comment-age">${new Date(c.created*1000).toLocaleDateString('ko-KR')}${c.edited?' · 수정됨':''}</span></div><p>${c.timestamp!==null?`<button class="timestamp" data-seek="${c.timestamp}" data-track="${t.id}">${time(c.timestamp)}</button>`:''}${esc(c.body)}</p><div class="inline-actions"><button class="text-link ${c.liked?'is-active':''}" data-comment-like="${c.id}" data-liked="${!!c.liked}">${icon('heart')} ${c.likes}</button>${!c.parent_id?`<button class="text-link" data-reply="${c.id}" data-track="${t.id}">답글</button>`:''}${c.can_report?`<button class="text-link" data-report-comment="${c.id}">신고</button>`:''}${c.can_delete&&me?.id!==c.user_id?`<button class="text-link" data-delete-comment="${c.id}">삭제</button>`:''}${me?.id===c.user_id?`<button class="text-link" data-edit-comment="${c.id}" data-body="${esc(c.body)}">수정</button><button class="text-link" data-delete-comment="${c.id}">삭제</button>`:''}</div></div></article>`;
 return comments.length?comments.filter(c=>!c.parent_id).map(c=>row(c)+comments.filter(r=>r.parent_id===c.id).map(row).join('')).join(''):'<p class="quiet">첫 감상을 남겨보세요.</p>';
}
function songCredits(t){return t.kind==='cover'?`<div class="song-credits"><div><span>COVER BY</span><a href="#producer/${esc(t.producer_id)}">${esc(t.producer)}</a>${t.duet_partner_id?` & <a href="#producer/${esc(t.duet_partner_id)}">${esc(t.duet_partner)}</a>`:''}<small>${t.cover_mode==='duet'?(t.duet_open?'듀엣 · 참여 대기':'듀엣'):'솔로'}</small></div><div><span>ORIGINAL</span><a href="#song/${esc(t.original_id)}">${esc(t.original_title)} · ${esc(t.original_artist)}</a></div></div>`:`<div class="song-credits"><div><span>${hasArtist(t)?'AI ARTIST':'PRODUCER'}</span>${credits(t)}</div></div>`;}
function coversPanelHTML(t,d,sort){if(!d)return '';const tabs=[['popular','좋아요순'],['gifts','선물순'],['plays','재생순'],['recent','최신순']];
 return `<section class="surface covers-panel"><div class="section-heading"><h2>커버곡 <small>${number(d.covers.length)}</small></h2>${d.accepts_covers?`<a class="small-button" href="#cover/${t.id}">${icon('plus')} 이 곡 커버 올리기</a>`:''}</div>${d.accepts_covers?`<a class="text-link cover-song-rank-link" href="#community/rankings?period=all&amp;original_id=${esc(t.id)}">${icon('chart')} 이 곡의 오늘 · 이달 · 역대 커버 랭킹 →</a>`:''}${d.covers.length?`<div class="tabs covers-sort">${tabs.map(([k,v])=>`<a class="tab ${sort===k?'active':''}" href="#song/${t.id}?covers=${k}">${v}</a>`).join('')}</div>${list(d.covers)}`:`<p class="empty-note">${d.accepts_covers?'아직 커버곡이 없어요. 첫 커버의 주인공이 되어보세요.':'원곡자가 커버를 허락하지 않은 곡이에요.'}</p>`}</section>`;}
function profileMusicCards(items){return '<div class="music-feed">'+items.map(t=>musicTrackCard(t)).join('')+'</div>';}
function personProfileHTML(d,id,tab='all'){
 const p=d.profile,own=!!me&&p.user_id===me.id,items=musicProfileItems(d,tab),total=musicProfileItems(d).length,duets=(d.covers||[]).filter(t=>t.cover_mode==='duet').length;
 const following=own&&Number.isFinite(d.following_count)?'<a href="#following"><b>'+number(d.following_count)+'</b> 팔로잉</a>':'';
 return '<section class="person-profile social-profile social-profile-square">'+profilePhotoHTML(p)+'<div class="social-profile-main">'+'<div class="social-profile-identity"><span class="eyebrow">MY MUSIC, OUR CONNECTION</span><h2>'+esc(p.name)+'</h2><p>'+esc(p.bio||'음악으로 나를 소개해요.')+'</p><div class="music-profile-stats"><'+(own?'a href="#library/followers"':'span')+' data-followers="producer/'+esc(id)+'" data-count="'+Number(d.followers||0)+'">'+number(d.followers||0)+' 팔로워</'+(own?'a':'span')+'>'+following+'<span><b>'+total+'</b> 공개 음악</span></div></div><div class="social-profile-actions">'+(own?'<a class="primary-button" href="#profile/edit">프로필 수정</a><a class="small-button" href="#dm">메시지</a>':'<button class="primary-button" data-follow="producer/'+esc(id)+'" aria-pressed="'+followed('producer',id)+'">'+(followed('producer',id)?'팔로잉':'팔로우')+'</button><a class="small-button" href="#dm/'+esc(id)+'">메시지</a><button class="small-button gift-entry" data-profile-gift="'+esc(id)+'">'+icon('gift')+' 선물</button>')+'</div></div></section>'+(own?musicMyShortcuts():'')+'<nav class="profile-content-tabs" aria-label="프로필 음악">'+[['all','전체',total],['tracks','제작곡',(d.tracks||[]).length],['covers','커버',(d.covers||[]).length],['duets','듀엣',duets]].map(([key,label,n])=>'<a class="'+(tab===key?'active':'')+'" href="'+(own?'#profile':'#producer/'+esc(id))+'?tab='+key+'" '+(tab===key?'aria-current="page"':'')+'>'+label+'<span>'+n+'</span></a>').join('')+'</nav>'+(items.length?(['covers','duets'].includes(tab)?coverCollectionHTML(items,'profile-covers'):profileMusicCards(items)):'<p class="music-profile-empty">이 탭에 공개된 음악이 없어요.</p>')+giftsPanelHTML(d.gifts,'받은 응원',{profile:p});
}
function giftsPanelHTML(g,title,target={}){if(!g)return '';const own=me?.id===(target.track?.user_id||target.profile?.user_id),attr=target.track?`data-gift="${esc(target.track.id)}"`:`data-profile-gift="${esc(target.profile?.id||'')}"`;return `<section class="surface gift-rank gift-rank-pair"><div class="gift-rank-list"><div class="section-heading"><h2>${title}</h2><span class="gift-total">★ ${number(g.free_count)} · ${number(g.total_gold)} G</span></div><p class="gift-fineprint">보내준 응원만큼 · ★ 1과 1 G는 각각 1점</p>${g.ranking.length?`<ol class="gift-ranking">${g.ranking.map(r=>`<li><b>${r.rank}</b><span>${esc(r.name)}<small>★ ${number(r.stars)} · ${number(r.gold)} G</small></span><em>${number(r.score)}점</em></li>`).join('')}</ol>`:'<p class="gift-rank-empty">아직 받은 선물이 없어요.<br>첫 응원으로 이 무대를 빛내주세요.</p>'}</div><aside class="gift-rank-send"><h3>${own?'내 음악에 도착하는 마음':'이 음악이 좋았다면'}</h3><p>무료 응원별도, 특별한 골드 선물도.</p><div class="gift-quick-grid">${[AifectGifts.FREE_GIFT,...AifectGifts.GIFT_CATALOG].map(item=>`<button type="button" ${attr} data-gift-type="${item.id}" ${own?'disabled':''} aria-label="${esc(item.name)} ${item.gold?item.gold+' G':'★ 1'} 선물 선택">${giftArt(item)}<span>${esc(item.name)}</span><b>${item.gold?number(item.gold)+' G':'★ 1'}</b></button>`).join('')}</div><a class="text-link" href="#gifts">출석 · 활동하고 무료 별 받기 →</a><p class="gift-fineprint">응원별은 순위에만 반영돼요. 수익은 유료 골드 선물로만 발생해요.</p></aside></section>`;}

function trackModerationToolsHTML(t){return '<div class="inline-actions">'+(me&&me.id!==t.user_id?'<button class="text-link" data-report-track="'+esc(t.id)+'">음질 문제 신고</button>':'')+(authConfig?.track_moderator?'<button class="text-link" data-review-track="'+esc(t.id)+'">운영자 검토</button>':'')+'</div>';}
function trackReviewHTML(d){
 const labels={inactive:'60일간 유효 재생 없음',low_quality:'음질 신고 '+d.report_threshold+'명 이상'},date=s=>s?new Date(s*1000).toLocaleDateString('ko-KR'):'재생 없음';
 return heading('음원 검토 목록')+'<p class="field-help">60일간 유효 재생이 없거나 서로 다른 회원 3명 이상이 음질 문제를 신고한 곡입니다. 자동 제거는 하지 않아요.</p><div class="tabs">'+[['candidates','검토 대상'],['all','전체 공개곡'],['removed','운영자 제거곡']].map(([v,label])=>'<a class="tab '+(d.view===v?'active':'')+'" href="#admin/track-review?view='+v+'">'+label+'</a>').join('')+'</div><form id="track-review-search" class="aifect-search"><input name="q" aria-label="검토 음원 검색" placeholder="곡 제목, 작성자 검색" maxlength="100" value="'+esc(d.q)+'"><input type="hidden" name="view" value="'+esc(d.view)+'"><button class="small-button">검색</button></form><div class="track-review-list">'+(d.tracks.length?d.tracks.map(t=>'<article class="surface"><div class="section-heading"><div><h2>'+esc(t.title)+'</h2><p>'+esc(t.producer)+' · '+(t.kind==='cover'?'커버':'제작곡')+'</p></div><button class="small-button" data-review-track="'+esc(t.id)+'">검토하기</button></div><p>'+t.reasons.map(r=>'<span class="genre-chip">'+esc(labels[r])+'</span>').join(' ')+'</p><p class="field-help">등록 '+date(t.created)+' · 마지막 유효 재생 '+date(t.last_played)+' · 신고 '+number(t.report_count)+'명</p></article>').join(''):'<div class="surface">해당하는 음원이 없어요.</div>')+'</div>'+(d.has_more?'<p class="field-help">처음 100곡입니다. 검색해서 범위를 좁혀주세요.</p>':'');
}
document.addEventListener('submit',e=>{if(e.target.id!=='track-review-search')return;e.preventDefault();const fd=new FormData(e.target);location.hash='admin/track-review?'+new URLSearchParams({view:fd.get('view'),q:fd.get('q')});});
