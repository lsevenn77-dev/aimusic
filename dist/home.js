let homeCarouselCleanup=null;
function homeArtworkPath(t){
 const has=t.work_has_cover??(t.cover_version?.startsWith('profile-')?false:t.has_cover);
 const version=t.work_cover_version??t.cover_version;
 const art=has?[t.id,version]:t.original_has_cover?[t.original_id,t.original_cover_version]:null;
 return art?'/media/'+encodeURIComponent(art[0])+'/cover?artwork=track&v='+encodeURIComponent(art[1]||'original'):'';
}
function homeCover(t,cls='album-art',eager=false){
 const src=homeArtworkPath(t);
 return `<div class="${cls} cover ${src?'cover-custom':'cover-lime'} home-track-art"><span class="cover-word" ${src?'hidden':''}>${esc((t.title||'A').slice(0,2))}</span>${src?`<img src="${esc(src)}" alt="${esc(t.title)} 커버" loading="${eager?'eager':'lazy'}" decoding="async" ${eager?'fetchpriority="high"':''}>`:''}</div>`;
}
function homeReplaceArtwork(html,tracks,cls='album-art'){for(const t of tracks)html=html.replace(cover(t,cls),homeCover(t,cls));return html;}
function homeCard(t){return homeReplaceArtwork(card(t),[t]);}
function homeCollectionGrid(items){let html=collectionGrid(items);for(const p of items)html=homeReplaceArtwork(html,p.covers||[],'collection-tile');return html;}
function homeMore(title,href){return href?`<a class="home-more-link" href="${href}" aria-label="${esc(title)} 더보기">${icon('ui-menu')}</a>`:'';}
function homeSection(title,href){return `<div class="section-heading"><h2>${esc(title)}</h2>${homeMore(title,href)}</div>`;}
function homePlaceholder(){return '<div class="release-placeholder" role="status" aria-label="음악을 불러오는 중"><div></div><span>음악을 불러오고 있어요.</span></div>';}
function homeHTML(){return `<div class="listening-home listening-home-v2 home-content-refresh">
 <section id="home-release" aria-label="추천 음악 배너" aria-busy="true">${homePlaceholder()}</section>
 <section id="home-recommended" class="listening-section" aria-busy="true">${homeSection('추천 음악','#discover')}<p class="home-load-message">음악을 불러오고 있어요.</p></section>
 <section id="home-popular" class="listening-section" aria-busy="true">${homeSection('인기 차트','#charts')}</section>
 <section id="home-more" class="listening-section" hidden></section>
 <section id="home-discovery" class="listening-section" aria-busy="true">${homeSection('발견','#discover')}</section>
 <section id="home-library" class="listening-section">${homeSection('내 플레이리스트','#library/playlists')}<div id="home-own-playlists"></div><div id="home-curations" hidden></div></section>
 <div id="home-bridge" class="home-bridge"><section id="home-sing" class="listening-section" aria-busy="true">${homeSection('이번엔 내 목소리로','#karaoke')}</section><section id="home-conversations" class="listening-section" aria-busy="true">${homeSection('같은 노래, 다른 목소리','#community/covers')}</section></div>
 </div>`;}
function releaseHTML(t,next){
 const art=homeArtworkPath(t);
 return `<div class="home-feature-background" aria-hidden="true">${art?`<img src="${esc(art)}" alt="" decoding="async">`:''}</div><article class="home-feature-slide"><a class="home-feature-cover" href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${homeCover(t,'home-feature-art',true)}</a><div class="home-feature-copy"><span class="home-feature-label">FEATURED MUSIC</span><h2><a href="#song/${esc(t.id)}" title="${esc(t.title)}">${esc(t.title)}</a></h2><div class="home-feature-artist">${credits(t)}</div>${t.description?`<p class="home-feature-description">${esc(t.description)}</p>`:''}<div class="home-feature-actions"><button class="primary-button" data-play="${esc(t.id)}" data-community-toggle>${icon('ui-plays')} 지금 듣기</button><a class="text-link" href="#song/${esc(t.id)}">곡 정보 보기</a></div></div>${next?`<button class="home-feature-preview" data-home-next aria-label="다음 곡 ${esc(next.title)} 보기">${homeCover(next,'home-preview-art')}<span>UP NEXT</span></button>`:''}</article>`;
}
function bindHomeImages(root){
 if(!root?.addEventListener)return;
 const fallback=event=>{const img=event.target;if(img.tagName!=='IMG'||!img.closest('.home-track-art'))return;img.hidden=true;const label=img.parentElement.querySelector('.cover-word');if(label)label.hidden=false;};
 root.addEventListener('error',fallback,true);
}
function mountHomeCarousel(root,tracks){
 homeCarouselCleanup?.();homeCarouselCleanup=null;
 if(!tracks.length)return;
 const multi=tracks.length>1;
 root.innerHTML=`<div class="home-feature" role="region" aria-roledescription="캐러셀" aria-label="추천 음악">${multi?`<button class="home-feature-arrow home-feature-prev" aria-label="이전 추천곡">${icon('chevron')}</button>`:''}<div class="home-feature-stage">${releaseHTML(tracks[0],multi?tracks[1]:null)}</div>${multi?`<button class="home-feature-arrow home-feature-next" aria-label="다음 추천곡">${icon('chevron')}</button><div class="home-feature-pagination"><button class="home-feature-autoplay" aria-label="자동 롤링 일시정지">${icon('pause')}</button><div class="home-feature-dots" aria-label="추천곡 선택">${tracks.map((t,i)=>`<button data-home-slide="${i}" aria-label="${i+1}. ${esc(t.title)}" aria-pressed="${i===0}"></button>`).join('')}</div></div>`:''}</div>`;
 // Minimal DOM renderers used by navigation tests do not implement browser events.
 if(!root.addEventListener)return;
 const feature=root.querySelector('.home-feature'),stage=root.querySelector('.home-feature-stage'),motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 let index=0,timer=null,manualPause=false,hover=false,focus=false,start=null;
 const clear=()=>{clearTimeout(timer);timer=null;};
 const schedule=()=>{clear();if(multi&&!manualPause&&!hover&&!focus&&!motion.matches&&!document.hidden)timer=setTimeout(()=>{if(!root.isConnected)return cleanup();go(index+1);},5500);};
 const go=value=>{
  index=(value+tracks.length)%tracks.length;
  stage.querySelectorAll('.home-feature-outgoing').forEach(el=>el.remove());
  const old=document.createElement('div');old.className='home-feature-outgoing';old.setAttribute('aria-hidden','true');old.inert=true;
  old.innerHTML=stage.innerHTML;stage.innerHTML=releaseHTML(tracks[index],multi?tracks[(index+1)%tracks.length]:null);stage.append(old);
  old.addEventListener('animationend',()=>old.remove(),{once:true});if(motion.matches)old.remove();
  feature.querySelectorAll('[data-home-slide]').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));schedule();
 };
 const click=e=>{const b=e.target.closest('button');if(!b)return;if(b.matches('.home-feature-prev'))go(index-1);else if(b.matches('.home-feature-next,[data-home-next]'))go(index+1);else if(b.hasAttribute('data-home-slide'))go(Number(b.dataset.homeSlide));else if(b.matches('.home-feature-autoplay')){manualPause=!manualPause;b.setAttribute('aria-label',manualPause?'자동 롤링 재개':'자동 롤링 일시정지');b.innerHTML=icon(manualPause?'play':'pause');schedule();}else schedule();};
 const enter=()=>{hover=true;clear();},leave=()=>{hover=false;schedule();},focusIn=()=>{focus=true;clear();},focusOut=e=>{focus=feature.contains(e.relatedTarget);schedule();};
 const key=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();go(index+(e.key==='ArrowLeft'?-1:1));}};
 const down=e=>{start={x:e.clientX,y:e.clientY};},up=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){go(index+(dx<0?1:-1));}};
 const cancel=()=>{start=null;};
 const listeners=[['click',click],['pointerenter',enter],['pointerleave',leave],['focusin',focusIn],['focusout',focusOut],['keydown',key],['pointerdown',down],['pointerup',up],['pointercancel',cancel]];
 for(const [name,fn] of listeners)feature.addEventListener(name,fn);
 document.addEventListener('visibilitychange',schedule);window.addEventListener('hashchange',cleanup);motion.addEventListener('change',schedule);
 function cleanup(){clear();for(const [name,fn] of listeners)feature.removeEventListener(name,fn);document.removeEventListener('visibilitychange',schedule);window.removeEventListener('hashchange',cleanup);motion.removeEventListener('change',schedule);}
 homeCarouselCleanup=cleanup;schedule();
}
function updateHomeAccount(){
 document.querySelectorAll('.listening-home [data-like]').forEach(b=>{b.classList.toggle('is-active',liked(b.dataset.like));b.setAttribute('aria-pressed',String(liked(b.dataset.like)));});
 const root=$('#home-own-playlists');if(!root)return;
 const items=(library.playlists||[]).filter(p=>!p.locked).slice(0,6);
 root.innerHTML=me?(items.length?homeCollectionGrid(items):'<p class="home-empty-inline">보관함에서 나만의 플레이리스트를 만들어보세요.</p>'):'<a class="text-link" href="#library/playlists">로그인하고 내 플레이리스트 보기 '+icon('chevron')+'</a>';
}

function homeSingHTML(tracks){
 const tile=(t,featured)=>`<article class="sing-discovery-tile ${featured?'is-featured':''}"><a class="sing-discovery-art" href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${homeCover(t,'mini-cover')}</a><div class="sing-discovery-copy"><a href="#song/${esc(t.id)}"><h3>${esc(t.title)}</h3></a><span class="sing-discovery-credits">${credits(t)}</span><small>${esc(t.genre)} · ${time(t.duration)}</small>${featured?'<p>좋아하는 이 곡을,<br>이제 당신의 목소리로.</p>':''}<div class="sing-discovery-actions"><button class="small-button" data-play="${esc(t.id)}" data-community-toggle aria-label="${esc(t.title)} 원곡 재생">${icon('ui-play-action')} 재생</button><a class="small-button sing-discovery-start" href="#sing/${esc(t.id)}" aria-label="${esc(t.title)} 부르기">${icon('mic')} 부르기</a></div><a class="sing-discovery-covers" href="#song/${esc(t.id)}?covers=all">다른 목소리 만나기 ${icon('chevron')}</a></div></article>`;
 if(!tracks.length)return section('이번엔 내 목소리로','#karaoke')+'<div class="home-empty-inline"><p>다음에 부를 음악을 준비하고 있어요.</p><a href="#community/covers" class="text-link">먼저 커버곡 들어보기</a></div>';
 const featured=tracks.slice(0,3),more=tracks.slice(3,6);
 return `<div class="sing-discovery"><header class="sing-discovery-heading"><div><h2>이번엔 내 목소리로</h2><p>좋아하는 노래를, 나만의 목소리로 불러보세요.</p></div>${homeMore('이번엔 내 목소리로','#karaoke')}</header><div class="sing-discovery-featured"><div class="sing-discovery-label">${icon('mic')} 당신의 목소리를 기다리는 곡</div><div class="sing-discovery-grid">${featured.map(t=>tile(t,true)).join('')}</div></div>${more.length?`<div class="sing-discovery-subheading"><h3>${icon('mic')} 이런 곡은 어때요?</h3><a class="text-link" href="#karaoke">더 많은 곡 둘러보기 ${icon('chevron')}</a></div><div class="sing-discovery-grid sing-discovery-more">${more.map(t=>tile(t,false)).join('')}</div>`:''}</div>`;
}

function renderHome(ticket){
 homeBrowseObserver?.disconnect();homeCarouselCleanup?.();homeCarouselCleanup=null;
 const main=$('#main');routeTracks=[];main.classList.remove('motion-enter');main.innerHTML=homeHTML();main.removeAttribute('aria-busy');window.scrollTo({top:0,behavior:'instant'});updateHomeAccount();bindHomeImages(main);
 const revision=apiRevision,displayed=new Set();
 const active=target=>ticket===renderId&&target?.isConnected&&revision===apiRevision;
 const addTracks=tracks=>{remember(tracks);const known=new Set(routeTracks.map(t=>t.id));routeTracks.push(...tracks.filter(t=>!known.has(t.id)));};
 const paint=(target,html)=>{if(target.innerHTML!==html)target.innerHTML=html;displayed.add(target);target.removeAttribute('aria-busy');};
 const release=$('#home-release');
 const paintRelease=d=>{
  addTracks(d.tracks);if(d.tracks.length){mountHomeCarousel(release,d.tracks.slice(0,6));displayed.add(release);release.removeAttribute('aria-busy');}else paint(release,empty('첫 음악의 주인공이 되어주세요.','당신의 음악으로 새로운 취향을 시작하세요.','#upload','음악 올리기'));
  const more=$('#home-more');more.hidden=!d.tracks.length;paint(more,homeSection('최신곡','#charts/releases')+'<div class="home-music-grid">'+d.tracks.map(homeCard).join('')+'</div>');
 };
 const shelf=(id,title,href,d)=>{const target=$('#'+id),tracks=(d.tracks||[]).slice(0,12);addTracks(tracks);paint(target,homeSection(title,href)+(tracks.length?'<div class="home-music-grid">'+tracks.map(homeCard).join('')+'</div>':'<p class="home-empty-inline">아직 공개된 음악이 없어요.</p>'));};
 const paintDiscovery=d=>{shelf('home-recommended','추천 음악','#discover',{tracks:(d.tracks||[]).slice(0,6)});shelf('home-discovery','발견','#discover',{tracks:(d.tracks||[]).slice(6,12)});};
 const paintChart=d=>{const target=$('#home-popular'),tracks=d.tracks||[];addTracks(tracks);paint(target,homeSection('인기 차트','#charts')+(tracks.length?homeReplaceArtwork(songTable(tracks,{chart:true}),tracks,'mini-cover'):'<p class="home-empty-inline">아직 집계된 음악이 없어요.</p>'));};
 const paintSing=d=>{addTracks(d.tracks);paint($('#home-sing'),homeSingHTML(d.tracks));};
 const paintConversations=d=>shelf('home-conversations','같은 노래, 다른 목소리','#community/covers',{tracks:(d.tracks||[]).slice(0,6)});
 const paintCurations=d=>{const items=(d.playlists||[]).filter(p=>p.tracks>0).slice(0,6),target=$('#home-curations');target.hidden=!items.length;paint(target,items.length?'<h3 class="home-curation-title">취향을 나누는 플레이리스트</h3>'+homeCollectionGrid(items):'');};
 const jobs=[['/api/catalog?section=tracks&limit=12',paintRelease,'home-release'],['/api/discovery?',paintDiscovery,'home-recommended'],['/api/catalog?section=tracks&chart=top&period=week&limit=12',paintChart,'home-popular'],['/api/karaoke',paintSing,'home-sing'],['/api/community?kind=cover',paintConversations,'home-conversations'],['/api/playlists?sort=popular',paintCurations,'home-curations']];
 for(const [path,show] of jobs){const cached=peekApiRead(path,{display:true});if(cached)show(cached);}
 const load=async([path,show,id])=>{const target=$('#'+id);try{const d=await api(path);if(id==='home-release'&&ticket===renderId&&target.isConnected&&revision!==apiRevision)return renderHome(ticket);if(active(target)){show(d);updateHomeAccount();}}catch{if(active(target)&&!displayed.has(target)){paint(target,'<div class="home-load-error"><p>음악을 불러오지 못했어요.</p><button class="small-button">다시 시도</button></div>');target.querySelector('button').onclick=()=>load([path,show,id]);if(id==='home-recommended')paint($('#home-discovery'),homeSection('발견','#discover')+'<a class="text-link" href="#discover">음악 둘러보기</a>');}}};
 const first=load(jobs[0]);for(const job of jobs.slice(1))void load(job);return first;
}
