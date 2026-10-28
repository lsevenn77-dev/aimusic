// @ts-check
// Home composes existing catalog, library and player actions; it owns no playback or ranking logic.
let homeCleanup=null,homeCarouselCleanup=null;
function cleanupHome(){homeCleanup?.();homeCleanup=null;homeCarouselCleanup?.();homeCarouselCleanup=null;homeBrowseObserver?.disconnect();}
function homeHeading(title,href='',label='모두 보기'){return `<header class="home-heading"><h2>${title}</h2>${href?`<a href="${href}">${label} ${icon('chevron')}</a>`:''}</header>`;}
function homePlaceholder(){return '<div class="home-placeholder" role="status">음악을 불러오고 있어요.</div>';}
function homeEmpty(message,href='',label='둘러보기'){return `<div class="home-empty"><p>${message}</p>${href?`<a href="${href}">${label} ${icon('chevron')}</a>`:''}</div>`;}
function homeShortcuts(personal=false){
 const items=personal?[['library','내 보관함','#library'],['heart','좋아요한 노래','#library/likes'],['clock','최근 감상','#library/history'],['list','플레이리스트','#library/playlists']]:[['star','추천','#home'],['chart','인기 차트','#charts'],['clock','최신곡','#charts/releases'],['compass','발견','#search']];
 return `<nav class="home-shortcuts ${personal?'home-library-shortcuts':''}" aria-label="${personal?'개인 보관함':'주요 카테고리'}">${items.map(([symbol,label,href],i)=>`<a href="${href}" ${!personal&&i===0?'class="is-selected" data-home-jump="home-recommended"':''}>${icon(symbol)}<span>${label}</span></a>`).join('')}</nav>`;
}
function homeDiscoverHTML(){return homeHeading('발견','#discover/genres','기분 · 장르')+`<div class="home-moods">${[['comfort','위로가 필요할 때','마음을 다독이는 음악','heart'],['energy','기분을 올려줘','리듬에 몸을 맡겨요','sparkles'],['focus','집중이 필요할 때','음악과 함께 몰입해요','sliders'],['drive','어디든 떠나볼까','길 위에서 만나는 음악','compass']].map(([id,title,caption,symbol])=>`<a href="#discover/mood?m=${id}">${icon(symbol)}<strong>${title}</strong><span>${caption}</span></a>`).join('')}</div>`;}
function homeHTML(){
 const sections=[['release','새로 도착한 음악',homePlaceholder()],['categories','주요 카테고리 바로가기',homeShortcuts()],['recommended','추천 음악',homeHeading('추천 음악','#discover')+homePlaceholder()],['popular','인기 차트',homeHeading('인기 차트','#charts','전체 보기')+homePlaceholder()],['latest','최신곡',homeHeading('최신곡','#charts/releases')+homePlaceholder()],['discover','발견',homeDiscoverHTML()],['playlists','내 플레이리스트',homeHeading('내 플레이리스트','#library/playlists','보관함')],['library','개인 보관함 바로가기',homeShortcuts(true)],['history','최근 들은 음악',homeHeading('최근 들은 음악','#library/history','전체 보기')+homePlaceholder()],['sing','이번엔 내 목소리로',homeHeading('이번엔 내 목소리로','#karaoke','부르기')+homePlaceholder()],['conversations','같은 노래, 다른 목소리',homeHeading('같은 노래, 다른 목소리','#community/covers','더보기')+homePlaceholder()],['curations','취향을 나누는 플레이리스트',homeHeading('취향을 나누는 플레이리스트','#collections')+homePlaceholder()],['people','음악 뒤의 사람들',homeHeading('음악 뒤의 사람들','#producers')+homePlaceholder()]];
 return `<div class="aifect-home" id="home-root"><h1 class="sr-only">홈</h1>${sections.map(([id,title,html],i)=>`<section id="home-${id}" data-home-section="${i+1}" aria-label="${title}">${html}</section>`).join('')}</div>`;
}
/** @param {HomeTrack} t */
function homeArtist(t){const valid=value=>value&&!['null','undefined','-'].includes(String(value).trim());const base=hasArtist(t)?t.artist:t.producer||t.artist;return [base,t.kind==='cover'?t.duet_partner:''].filter(valid).join(' & ')||'AIFECT 음악가';}
/** @param {HomeTrack} t */
function homeArt(t,cls='home-art',eager=false){let html=cover(t,cls);if(eager)html=html.replace('loading="lazy"','loading="eager" fetchpriority="high"');return html.replace(/<\/div>$/,`<span class="home-image-fallback" aria-hidden="true">${esc((t.title||'A').slice(0,2))}</span></div>`);}
/** @param {HomeTrack} t */
function homePlay(t,list=false){return `<button class="${list?'list-action ':''}home-play" data-play="${esc(t.id)}" data-community-toggle data-home-play aria-label="${esc(t.title)} 재생" aria-pressed="false">${list?icon('play'):icon('audio-play',36)}<span class="home-pause" aria-hidden="true">${icon('pause')}</span></button>`;}
/** @param {HomeTrack[]} tracks */
function releaseHTML(tracks){return `<div class="home-hero" role="region" aria-roledescription="슬라이드" aria-label="새로 도착한 음악"><div class="home-hero-rail" tabindex="0">${tracks.map((t,i)=>`<article class="home-hero-slide" role="group" aria-roledescription="슬라이드" aria-label="${i+1} / ${tracks.length}" ${i?'inert aria-hidden="true"':''}>${homeArt(t,'home-hero-cover',i===0)}<div class="home-hero-copy"><span>새로 도착한 음악</span><h2><a href="#song/${esc(t.id)}">${esc(t.title)}</a></h2><p>${esc(homeArtist(t))}</p></div>${homePlay(t)}</article>`).join('')}</div>${tracks.length>1?`<div class="home-hero-controls"><button data-home-prev aria-label="이전 음악">${icon('back')}</button><div class="home-hero-dots">${tracks.map((t,i)=>`<button data-home-slide="${i}" aria-label="${i+1}번 음악: ${esc(t.title)}" aria-current="${i===0}"><span></span></button>`).join('')}</div><button data-home-next aria-label="다음 음악">${icon('chevron')}</button><button data-home-auto aria-label="자동 전환 일시정지">${icon('pause')}</button></div>`:''}</div>`;}
/** @param {HomeTrack} t @param {{rank?:number,singable?:boolean,recommended?:boolean}} options */
function homeRowHTML(t,{rank=0,singable=false,recommended=false}={}){
 const title=esc(t.title),id=esc(t.id);
 const stats=recommended?`<div class="home-row-stats"><span aria-label="재생 ${number(t.plays||0)}회">${icon('play')} ${number(t.plays||0)}</span><button class="list-action" data-like="${id}" title="${title} 좋아요" aria-label="${title} 좋아요" aria-pressed="${liked(t.id)}">${icon('heart')} <span data-like-count>${number(t.likes||0)}</span></button><a class="list-action" href="#song/${id}?comments=1" title="${title} 댓글" aria-label="${title} 댓글 ${number(t.comments||0)}개">${icon('message')} ${number(t.comments||0)}</a></div>`:'';
 const record=singable?`<a class="list-action home-sing-button" href="#sing/${id}" title="${title} 부르기" aria-label="${title} 부르기">부르기</a>`:'';
 return `<article data-list-row class="home-row ${recommended?'home-recommend-row':''} ${singable?'home-sing-row':''}">${rank?`<span class="home-rank">${rank}</span>`:''}<a class="home-row-detail" href="#song/${id}">${homeArt(t)}<span class="home-row-copy"><strong>${title}</strong><span>${esc(homeArtist(t))}</span></span></a><div class="list-actions">${stats}${record}${homePlay(t,true)}${singable?'':`<button class="list-action home-menu" data-track-menu="${id}" title="${title} 목록 액션" aria-label="${title} 목록 액션">${icon('menu')}</button>`}</div>${singable?`<a class="sr-only" href="#song/${id}?covers=all">${title} 다른 목소리 만나기</a>`:''}</article>`;
}
/** @param {HomeTrack[]} tracks */
function homeSingHTML(tracks){return homeHeading('이번엔 내 목소리로','#karaoke','부르기')+(tracks.length?`<div class="home-rows">${tracks.slice(0,3).map(t=>homeRowHTML(t,{singable:true})).join('')}</div>`:homeEmpty('다음에 부를 음악을 준비하고 있어요.','#community/covers','커버곡 들어보기'));}
/** @param {HomeTrack} t */
function homeAlbumHTML(t,compact=false){return `<article class="home-album ${compact?'is-compact':''}"><div class="home-album-art"><a href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${homeArt(t)}</a>${homePlay(t)}</div><a class="home-album-title" href="#song/${esc(t.id)}">${esc(t.title)}</a><p>${esc(homeArtist(t))}</p>${t.kind==='cover'&&t.original_id?`<a class="home-original" href="#song/${esc(t.original_id)}?covers=all">다른 목소리 ${icon('chevron')}</a>`:''}</article>`;}
function homeRail(html,label,cls=''){return `<div class="home-rail ${cls}" tabindex="0" role="group" aria-label="${label} 가로 목록">${html}</div>`;}
/** @param {HomePlaylist[]} items */
function homePlaylistCards(items){return homeRail(items.map(p=>`<a class="home-public-playlist" href="#playlist/${esc(p.id)}">${playlistArt(p,'home-playlist-art')}<strong>${esc(p.name)}</strong><span>${number(p.tracks)}곡 · ${esc(p.owner_name||'AIFECT')}</span></a>`).join(''),'공개 플레이리스트','home-public-rail');}
/** @param {HomePerson[]} items */
function homePeopleHTML(items){return homeRail(items.map(p=>`<a class="home-person" href="#producer/${esc(p.id)}">${portrait(p,'producer')}<strong>${esc(p.name)}</strong><p>${esc(p.bio&&p.bio!=='-'?p.bio:'프로필에서 이 음악가의 곡을 만나보세요.')}</p><span>프로필 보기 ${icon('chevron')}</span></a>`).join(''),'음악 뒤의 사람들','home-people-rail');}
function updateHomeAccount(){
 const root=$('#home-root');if(!root)return;
 document.querySelectorAll('.aifect-home [data-like]').forEach(b=>b.setAttribute('aria-pressed',String(liked(b.getAttribute('data-like')))));
 const target=$('#home-playlists');if(!target)return;
 const items=me?(library.playlists||[]).filter(p=>!p.locked).slice(0,3):[];
 target.innerHTML=homeHeading('내 플레이리스트','#library/playlists','보관함')+`<a class="home-own-playlist" href="#library/playlists">${icon('list')}<span><strong>나만의 플레이리스트</strong><small>${me?(items.length?esc(items.map(p=>p.name).join(' · ')):'좋아하는 음악을 모아보세요'):'로그인하고 좋아하는 음악을 모아보세요'}</small></span>${icon('chevron')}</a>`;
}
function syncHomePlayback(){document.querySelectorAll('[data-home-play]').forEach(button=>{const playing=current?.id===button.getAttribute('data-play')&&!audio.paused;button.setAttribute('aria-pressed',String(playing));const t=trackMap.get(button.getAttribute('data-play'));if(t)button.setAttribute('aria-label',t.title+(playing?' 일시정지':' 재생'));});}
/** @param {HTMLElement} root */
function bindHome(root){
 const controller=new AbortController(),options={signal:controller.signal};homeCleanup=()=>controller.abort();
 root.addEventListener('click',event=>{const jump=/** @type {Element} */(event.target).closest('[data-home-jump]');if(jump){event.preventDefault();document.getElementById(jump.getAttribute('data-home-jump'))?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}},options);
 root.addEventListener('error',event=>{const img=event.target;if(img instanceof HTMLImageElement&&img.closest('.home-art,.home-hero-cover')){img.hidden=true;img.parentElement.classList.add('image-failed');}},{...options,capture:true});
 for(const name of ['play','pause','ended','emptied'])audio.addEventListener(name,syncHomePlayback,options);
}
/** @param {HTMLElement} root */
function bindHomeCarousel(root){
 homeCarouselCleanup?.();homeCarouselCleanup=null;
 const rail=root.querySelector('.home-hero-rail'),slides=[...root.querySelectorAll('.home-hero-slide')];if(!rail||slides.length<2)return;
 const controller=new AbortController(),options={signal:controller.signal},reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let index=0,timer=null,frame=0,automatic=!reduced.matches,hover=false,focused=false,visible=true;
 const paint=()=>{slides.forEach((slide,i)=>{slide.toggleAttribute('inert',i!==index);slide.setAttribute('aria-hidden',String(i!==index));});root.querySelectorAll('[data-home-slide]').forEach((dot,i)=>dot.setAttribute('aria-current',String(i===index)));const auto=root.querySelector('[data-home-auto]');auto.setAttribute('aria-label',automatic?'자동 전환 일시정지':'자동 전환 시작');auto.innerHTML=icon(automatic?'pause':'play');};
 const schedule=()=>{clearTimeout(timer);if(automatic&&!reduced.matches&&!hover&&!focused&&visible&&!document.hidden)timer=setTimeout(()=>go(index+1,false),8000);};
 const go=(next,manual=true)=>{index=(next+slides.length)%slides.length;if(manual)automatic=false;rail.scrollTo({left:index*rail.clientWidth,behavior:reduced.matches?'instant':'smooth'});paint();schedule();};
 root.addEventListener('click',event=>{const button=/** @type {Element} */(event.target).closest('button');if(!button)return;if(button.hasAttribute('data-home-prev'))go(index-1);if(button.hasAttribute('data-home-next'))go(index+1);if(button.hasAttribute('data-home-slide'))go(Number(button.getAttribute('data-home-slide')));if(button.hasAttribute('data-home-auto')){automatic=!automatic;paint();schedule();}},options);
 root.addEventListener('pointerenter',()=>{hover=true;schedule();},options);root.addEventListener('pointerleave',()=>{hover=false;schedule();},options);
 root.addEventListener('focusin',()=>{focused=true;automatic=false;paint();schedule();},options);root.addEventListener('focusout',()=>{focused=false;schedule();},options);
 rail.addEventListener('pointerdown',()=>{automatic=false;paint();schedule();},options);
 rail.addEventListener('keydown',event=>{const e=/** @type {KeyboardEvent} */(event);if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();go(index+(e.key==='ArrowRight'?1:-1));}},options);
 rail.addEventListener('scroll',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{index=Math.max(0,Math.min(slides.length-1,Math.round(rail.scrollLeft/rail.clientWidth)));paint();});},{...options,passive:true});
 document.addEventListener('visibilitychange',schedule,options);reduced.addEventListener('change',()=>{if(reduced.matches)automatic=false;paint();schedule();},options);
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();}):null;observer?.observe(root);
 paint();schedule();homeCarouselCleanup=()=>{clearTimeout(timer);cancelAnimationFrame(frame);controller.abort();observer?.disconnect();};
}
function renderHome(ticket){
 cleanupHome();const main=$('#main'),account=me?.id||'';routeTracks=[];main.classList.remove('motion-enter');main.innerHTML=homeHTML();main.removeAttribute('aria-busy');window.scrollTo({top:0,behavior:'instant'});bindHome($('#home-root'));updateHomeAccount();
 const active=target=>ticket===renderId&&target?.isConnected&&account===(me?.id||'');
 const addTracks=tracks=>{remember(tracks);const known=new Set(routeTracks.map(t=>t.id));for(const t of tracks)if(!known.has(t.id)){known.add(t.id);routeTracks.push(t);}};
 const displayed=new Set();
 const paint=(target,html)=>{const changed=target.innerHTML!==html;if(changed)target.innerHTML=html;displayed.add(target);target.removeAttribute('aria-busy');syncHomePlayback();return changed;};
 const load=(id,path,show)=>{
  const target=$('#'+id),cached=peekApiRead(path,{display:true});
  if(cached)show(cached,target);else target.setAttribute('aria-busy','true');
  const fail=element=>{if(displayed.has(element))return;const heading=element.querySelector('.home-heading')?.outerHTML||'';element.innerHTML=heading+homeEmpty('음악을 불러오지 못했어요.')+'<button class="small-button">다시 시도</button>';element.querySelector('button').onclick=run;};
  const run=async()=>{
   if(!active(target))return;
   try{
    // A like or playlist mutation must not strand shelves that have not entered view yet.
    // In-flight pre-mutation results are discarded and reread against the new revision.
    for(let attempt=0;attempt<3;attempt++){
     const revision=apiRevision,d=await api(path);if(!active(target))return;
     if(revision!==apiRevision)continue;show(d,target);return;
    }
    fail(target);
   }catch{if(active(target)){fail(target);if(id==='home-release')fail($('#home-latest'));}}
   finally{if(active(target))target.removeAttribute('aria-busy');}
  };
  return {target,run};
 };
 const release=load('home-release','/api/catalog?section=tracks&limit=12',(d,target)=>{const tracks=d.tracks||[];addTracks(tracks);if(paint(target,tracks.length?releaseHTML(tracks.slice(0,5)):homeEmpty('새로운 음악을 기다리고 있어요.','#charts','음악 둘러보기')))bindHomeCarousel(target);paint($('#home-latest'),homeHeading('최신곡','#charts/releases')+(tracks.length?homeRail(tracks.map(t=>homeAlbumHTML(t)).join(''),'최신곡'):homeEmpty('아직 공개된 음악이 없어요.')));});
 const recommended=load('home-recommended','/api/discovery',(d,target)=>{const tracks=(d.tracks||[]).slice(0,3);addTracks(tracks);paint(target,homeHeading('추천 음악','#discover')+(tracks.length?`<div class="home-rows">${tracks.map(t=>homeRowHTML(t,{recommended:true})).join('')}</div>`:homeEmpty('새로운 추천 음악을 준비하고 있어요.')));});
 const shelves=[
  load('home-popular','/api/catalog?section=tracks&chart=top&period=week&limit=12',(d,target)=>{const tracks=(d.tracks||[]).slice(0,5);addTracks(tracks);paint(target,homeHeading('인기 차트','#charts','전체 보기')+(tracks.length?`<div class="home-rows">${tracks.map((t,i)=>homeRowHTML(t,{rank:t.chart_rank||i+1})).join('')}</div>`:homeEmpty('아직 차트에 오른 음악이 없어요.')));}),
  load('home-sing','/api/karaoke',(d,target)=>{const tracks=d.tracks||[];addTracks(tracks);paint(target,homeSingHTML(tracks));}),
  load('home-conversations','/api/community?kind=cover',(d,target)=>{const tracks=(d.tracks||[]).slice(0,8);addTracks(tracks);paint(target,homeHeading('같은 노래, 다른 목소리','#community/covers','더보기')+(tracks.length?homeRail(tracks.map(t=>homeAlbumHTML(t)).join(''),'커버 음악'):homeEmpty('첫 커버를 들려주세요.','#karaoke','부르기')));}),
  load('home-curations','/api/playlists?sort=popular',(d,target)=>{const items=(d.playlists||[]).filter(p=>p.tracks>0&&!p.locked).slice(0,6);paint(target,homeHeading('취향을 나누는 플레이리스트','#collections')+(items.length?homePlaylistCards(items):homeEmpty('공개 플레이리스트를 기다리고 있어요.','#library/playlists','내 플레이리스트')));}),
  load('home-people','/api/catalog?section=producers&limit=5',(d,target)=>{const items=d.producers||[];paint(target,homeHeading('음악 뒤의 사람들','#producers')+(items.length?homePeopleHTML(items):homeEmpty('새로운 음악가를 기다리고 있어요.')));})
 ];
 if(me)shelves.push(load('home-history','/api/history',(d,target)=>{const tracks=(d.tracks||[]).slice(0,12);addTracks(tracks);paint(target,homeHeading('최근 들은 음악','#library/history','전체 보기')+(tracks.length?homeRail(tracks.map(t=>homeAlbumHTML(t,true)).join(''),'최근 들은 음악','home-history-rail'):homeEmpty('음악을 재생하면 여기에 모여요.')));}));
 else paint($('#home-history'),homeHeading('최근 들은 음악','#library/history','전체 보기')+homeEmpty('로그인하면 최근 들은 음악을 이어서 감상할 수 있어요.','#account','로그인'));
 if(typeof IntersectionObserver==='function'){const jobs=new Map(shelves.map(job=>[job.target,job.run]));homeBrowseObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){homeBrowseObserver.unobserve(entry.target);jobs.get(/** @type {HTMLElement} */(entry.target))?.();}},{rootMargin:'300px'});for(const job of shelves)homeBrowseObserver.observe(job.target);}else shelves.forEach(job=>job.run());
 recommended.run();return release.run();
}
