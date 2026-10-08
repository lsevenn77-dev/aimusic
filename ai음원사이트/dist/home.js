function homePlaceholder(){return '<div class="release-placeholder" role="status" aria-label="음악을 불러오는 중"><div></div><span>음악을 불러오고 있어요.</span></div>';}
function homeHTML(){return `<div class="listening-home"><header class="listening-heading"><h1>오늘의 음악</h1><a href="#charts" class="text-link">인기 차트 ${icon('chevron')}</a></header>${listenNav("home")}${musicListeningShortcuts()}

 <section id="home-release" aria-label="새로 도착한 음악" aria-busy="true">${homePlaceholder()}</section>
 <section id="home-more" class="listening-section" hidden></section>
 <div id="home-bridge" class="home-bridge"><section id="home-sing" class="listening-section" aria-busy="true">${section('이번엔 내 목소리로','#karaoke')}<div class="home-load-message" role="status">부를 수 있는 곡을 불러오고 있어요.</div></section><section id="home-conversations" class="listening-section" aria-busy="true">${section('같은 노래, 다른 목소리','#community/covers')}<div class="home-load-message" role="status">새로운 커버를 불러오고 있어요.</div></section></div>
 <section id="home-curations" class="listening-section" hidden></section>
 <section class="listening-section home-discover">${section('지금의 기분을 따라','#discover/themes')}<nav class="home-mood-links" aria-label="기분별 음악">${[['comfort','위로가 필요할 때','heart'],['energy','기분을 올리고 싶을 때','sparkles'],['focus','집중하고 싶을 때','sliders'],['drive','드라이브할 때','compass']].map(([id,label,symbol])=>`<a href="#discover/mood?m=${id}">${icon(symbol)}<span>${label}</span></a>`).join('')}</nav></section>
 <a class="listening-studio" href="#upload"><span class="studio-symbol">${icon('upload')}</span><div><strong>다음 음악은 당신의 곡으로.</strong><span>직접 만든 음악을 공개하고 새로운 리스너를 만나보세요.</span></div><span class="studio-label">음악 올리기 ${icon('arrow')}</span></a></div>`;}
function releaseHTML(t){
 const art=cover(t,'release-art').replace('loading="lazy"','loading="eager" fetchpriority="high"');
 return `<article class="release-feature"><a class="release-art-link" href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${art}</a><div class="release-copy"><span class="release-kicker">NEW RELEASE <span>새로 도착한 음악</span></span><h2><a href="#song/${esc(t.id)}">${esc(t.title)}</a></h2><div class="release-credits">${credits(t)}</div><p class="release-meta">${esc(t.genre)}<span>·</span>${time(t.duration)}</p><div class="release-actions"><button class="primary-button" data-play="${esc(t.id)}">${icon('play')} 지금 듣기</button><button class="icon-button ${liked(t.id)?'is-active':''}" data-like="${esc(t.id)}" aria-label="${esc(t.title)} 좋아요" aria-pressed="${liked(t.id)}">${icon('heart')}</button>${playlistSaveButton(t)}</div>${trackStats(t)}</div></article>`;
}
function homeSingHTML(tracks){return section('이번엔 내 목소리로','#karaoke')+(tracks.length?`<div class="home-sing-card"><span class="home-section-label">${icon('mic')} MR이 준비된 음악</span>${tracks.slice(0,3).map(t=>`<article class="home-sing-track"><a href="#song/${esc(t.id)}">${cover(t,'mini-cover')}</a><div><a href="#song/${esc(t.id)}"><strong>${esc(t.title)}</strong></a><span>${credits(t)}</span><small>${esc(t.genre)} · ${time(t.duration)}</small></div><button class="icon-button" data-play="${esc(t.id)}" aria-label="${esc(t.title)} 원곡 듣기">${icon('play')}</button></article>`).join('')}<p>반주에 맞춰 부르고, 나만의 커버를 남겨보세요.</p><div class="home-sing-actions"><a class="small-button" href="#sing/${esc(tracks[0].id)}">${icon('mic')} 노래 부르기</a><a href="#song/${esc(tracks[0].id)}?covers=recent" class="text-link">이 곡의 커버 ${icon('chevron')}</a></div></div>`:'<div class="home-empty-inline"><p>다음에 부를 음악을 준비하고 있어요.</p><a href="#community/covers" class="text-link">먼저 커버곡 들어보기</a></div>');}
function updateHomeAccount(){
 document.querySelectorAll('.listening-home [data-like]').forEach(b=>{b.classList.toggle('is-active',liked(b.dataset.like));b.setAttribute('aria-pressed',String(liked(b.dataset.like)));});
 const root=$('#home-personal');if(!root)return;
 const playlists=(library.collections||library.playlists||[]).filter(p=>p.tracks>0&&!p.locked).slice(0,3),likes=library.likes||[];
 root.hidden=!me||!(playlists.length||likes.length);if(root.hidden){root.innerHTML='';return;}
 root.innerHTML=`<div class="home-personal-heading"><h2>내 음악 이어 듣기</h2><a href="#library">보관함 ${icon('chevron')}</a></div><div class="home-personal-links">${likes.length?`<a href="#library/likes"><span class="personal-heart">${icon('heart')}</span><div><strong>좋아요한 음악</strong><small>${number(likes.length)}곡</small></div>${icon('chevron')}</a>`:''}${playlists.map(p=>`<a href="#playlist/${esc(p.id)}">${playlistArt(p,'personal-art')}<div><strong>${esc(p.name)}</strong><small>${number(p.tracks)}곡</small></div>${icon('chevron')}</a>`).join('')}</div>`;
}
function renderHome(ticket){
 homeBrowseObserver?.disconnect();
 const main=$('#main');routeTracks=[];main.classList.remove('motion-enter');main.innerHTML=homeHTML();main.removeAttribute('aria-busy');window.scrollTo({top:0,behavior:'instant'});updateHomeAccount();
 // These shelves are public; startup authentication may settle while they load.
 const revision=apiRevision;
 const active=target=>ticket===renderId&&target?.isConnected&&revision===apiRevision;
 const addTracks=tracks=>{remember(tracks);const known=new Set(routeTracks.map(t=>t.id));routeTracks.push(...tracks.filter(t=>!known.has(t.id)));};
 const release=$('#home-release'),sing=$('#home-sing'),conversations=$('#home-conversations'),curations=$('#home-curations');
 const displayed=new Set();
 const paint=(target,html)=>{if(target.innerHTML!==html)target.innerHTML=html;displayed.add(target);target.removeAttribute('aria-busy');};
 const fail=(target,retry)=>{if(displayed.has(target))return;target.innerHTML='<div class="home-load-error"><p>음악을 불러오지 못했어요.</p><button class="small-button">다시 시도</button></div>';target.querySelector('button').onclick=retry;target.removeAttribute('aria-busy');};
 const paintRelease=d=>{addTracks(d.tracks);paint(release,d.tracks.length?releaseHTML(d.tracks[0]):empty('첫 음악의 주인공이 되어주세요.','당신의 음악으로 새로운 취향을 시작하세요.','#upload','음악 올리기'));const more=$('#home-more');more.hidden=d.tracks.length<2;paint(more,d.tracks.length>1?section('새롭게 도착한 음악','#charts/releases')+`<div class="browse-rail">${d.tracks.slice(1,7).map(card).join('')}</div>`:'');updateHomeAccount();};
 const paintSing=d=>{addTracks(d.tracks);paint(sing,homeSingHTML(d.tracks));};
 const paintConversations=d=>{const tracks=d.tracks.slice(0,2);addTracks(tracks);paint(conversations,section('같은 노래, 다른 목소리','#community/covers')+(tracks.length?'<div class="music-feed">'+tracks.map(t=>musicTrackCard(t,{social:false})).join('')+'</div>':'<a class="first-cover-invite" href="#karaoke"><span>'+icon('mic')+'</span><div><strong>첫 커버를 들려주세요.</strong><p>좋아하는 곡을 내 목소리로 불러보세요.</p></div>'+icon('arrow')+'</a>'));updateHomeAccount();};
 const paintCurations=d=>{const items=d.playlists.filter(p=>p.tracks>0).slice(0,4);curations.hidden=!items.length;paint(curations,items.length?section('취향을 나누는 플레이리스트','#collections')+collectionGrid(items):'');};
 for(const [path,show] of [['/api/catalog?section=tracks&limit=12',paintRelease],['/api/karaoke',paintSing],['/api/community?kind=cover',paintConversations],['/api/playlists?sort=popular',paintCurations]]){const cached=peekApiRead(path,{display:true});if(cached)show(cached);}
 const loadRelease=async()=>{if(!displayed.has(release))release.setAttribute('aria-busy','true');try{const d=await api('/api/catalog?section=tracks&limit=12');if(active(release))paintRelease(d);}catch{if(active(release))fail(release,loadRelease);}finally{if(active(release))release.removeAttribute('aria-busy');}};
 const loadSing=async()=>{try{const d=await api('/api/karaoke');if(active(sing))paintSing(d);}catch{if(active(sing))fail(sing,loadSing);}finally{if(active(sing))sing.removeAttribute('aria-busy');}};
 const loadConversations=async()=>{try{const d=await api('/api/community?kind=cover');if(active(conversations))paintConversations(d);}catch{if(active(conversations))fail(conversations,loadConversations);}finally{if(active(conversations))conversations.removeAttribute('aria-busy');}};
 const loadCurations=async()=>{try{const d=await api('/api/playlists?sort=popular');if(active(curations))paintCurations(d);}catch{/* Optional shelf; retain the last visible selection on refresh failure. */}};
 // Load the first playable song independently; artwork below the fold is lazy.
 const first=loadRelease();
 if('IntersectionObserver' in window){homeBrowseObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){homeBrowseObserver.unobserve(entry.target);void loadSing();void loadConversations();void loadCurations();}},{rootMargin:'180px'});homeBrowseObserver.observe($('#home-bridge'));}else{void loadSing();void loadConversations();void loadCurations();}
 return first;
}
