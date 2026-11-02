let homeCarouselCleanup=null,homeImagesCleanup=null,homeRequestController=null;
const homeRailCleanups=new Map();
function cleanupHome(){
 homeBrowseObserver?.disconnect();homeCarouselCleanup?.();homeCarouselCleanup=null;
 homeImagesCleanup?.();homeImagesCleanup=null;
 homeRequestController?.abort();homeRequestController=null;
 for(const cleanup of homeRailCleanups.values())cleanup();homeRailCleanups.clear();
}
function homeArtworkPath(t){return trackArtworkPath(t);}
function homeCover(t,cls='album-art',eager=false){
 return `<div class="${cls} cover cover-custom home-track-art"><img src="${esc(trackArtworkPath(t))}" alt="${esc(t.title)} 커버" loading="${eager?'eager':'lazy'}" decoding="async" ${eager?'fetchpriority="high"':''}></div>`;
}
function homeReplaceArtwork(html,tracks,cls='album-art'){for(const t of tracks)html=html.replace(cover(t,cls),homeCover(t,cls));return html;}
function homeCard(t){return homeReplaceArtwork(card(t),[t]).replace('class="album-title"','class="album-title" title="'+esc(t.title)+'"');}
function homeChartHTML(tracks){
 const visible=tracks.slice(0,7);
 const table=homeReplaceArtwork(songTable(visible,{chart:true}),visible,'mini-cover').replace('song-table-chart','song-table-chart chart-ui chart-ui--compact');
 const top=visible.find((t,i)=>(t.chart_rank||i+1)===1);
 if(!top)return '<div class="home-chart-layout">'+table+'</div>';
 const art=homeArtworkPath(top);
 return '<div class="home-chart-layout">'+table+`<aside class="home-chart-feature" aria-label="현재 차트 1위 곡"><div class="home-chart-backdrop" aria-hidden="true">${art?`<img src="${esc(art)}" alt="">`:''}</div><div class="home-chart-rank"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 7 5 4 4-7 4 7 5-4-2 12H5Z"/></svg><span>#1</span></div><a class="home-chart-cover" href="#song/${esc(top.id)}" aria-label="${esc(top.title)} 곡 정보">${homeCover(top,'home-chart-art')}</a><div class="home-chart-copy"><a class="home-chart-title" href="#song/${esc(top.id)}" title="${esc(top.title)}">${esc(top.title)}</a><div class="home-chart-artist">${credits(top)}</div>${top.description?`<p>${esc(top.description)}</p>`:''}<button class="list-action home-chart-listen" data-play="${esc(top.id)}" aria-label="${esc(top.title)} 지금 듣기">${icon('ui-play-action')}<span>지금 듣기</span></button></div></aside></div>`;
}
function homeCollectionGrid(items){let html=collectionGrid(items);for(const p of items)html=homeReplaceArtwork(html,p.covers||[],'collection-tile');return html;}
function homeMore(title,href){return href?`<a class="home-more-link" href="${href}" aria-label="${esc(title)} 더보기">+ 더보기</a>`:'';}
function homeSection(title,href){return `<div class="section-heading"><h2>${esc(title)}</h2>${homeMore(title,href)}</div>`;}
function homePlaceholder(){return '<div class="release-placeholder" role="status" aria-label="음악을 불러오는 중"><div></div><span>음악을 불러오고 있어요.</span></div>';}
function homeRailHTML(id,label,content,kind){return `<div class="home-rail-shell">${kind==='profile'||id==='home-playlist-rail'?'':`<div class="home-rail-controls"><button type="button" data-home-scroll="-1" aria-controls="${id}" aria-label="${esc(label)} 이전 보기">${icon('chevron')}</button><button type="button" data-home-scroll="1" aria-controls="${id}" aria-label="${esc(label)} 다음 보기">${icon('chevron')}</button></div>`}<div id="${id}" class="home-rail home-${kind}-rail" role="region" aria-roledescription="캐러셀" aria-label="${esc(label)}" tabindex="0">${content}</div></div>`;}
function homePlaylistCard(p,tracks=null){
 let art=playlistArt(p);for(const t of p.covers||[])art=homeReplaceArtwork(art,[t],'collection-tile');
 const preview=tracks?.slice(0,3)||[],total=tracks?tracks.length:Number(p.tracks)||0,extra=Math.max(0,total-preview.length);
 return `<article class="home-playlist-card"><div class="home-playlist-art"><a href="#playlist/${esc(p.id)}" aria-label="${esc(p.name)} 상세">${art}</a><button type="button" class="list-action" data-home-playlist="${esc(p.id)}" data-playlist-name="${esc(p.name)}" aria-pressed="false" aria-label="${esc(p.name)} 재생">${icon('ui-play-action')}</button></div><a class="home-playlist-info" href="#playlist/${esc(p.id)}"><h3 class="home-playlist-name" title="${esc(p.name)}">${esc(p.name)}</h3><p class="home-playlist-description" title="${esc(p.description||'')}">${esc(p.description||'')}</p><ol class="home-playlist-preview" aria-label="수록곡 미리보기">${preview.map((t,i)=>`<li title="${esc(t.title)} · ${esc(t.artist||'')}"><span class="home-playlist-index">${String(i+1).padStart(2,'0')}</span><span class="home-playlist-song">${esc(t.title)}</span><span class="home-playlist-artist">${esc(t.artist||'')}</span></li>`).join('')}${tracks===null?'<li class="home-playlist-status">수록곡을 불러오는 중</li>':''}</ol><div class="home-playlist-count"><span>${tracks&&extra?'외 '+number(extra)+'곡':''}</span><span>${number(total)}곡 수록</span></div></a></article>`;
}
function homePlaylistQueueMatches(tracks){return !!tracks?.length&&typeof current!=='undefined'&&tracks.some(t=>t.id===current?.id)&&queue.length===tracks.length&&tracks.every((t,i)=>queue[i]===t.id);}
function syncHomePlaylistButtons(target,playlists){
 for(const b of target.querySelectorAll('[data-home-playlist]')){
  const playing=homePlaylistQueueMatches(playlists.get(b.dataset.homePlaylist))&&!audio.paused&&!audio.ended&&!window.AifectAudioAds?.active;
  b.innerHTML=icon(playing?'ui-pause-action':'ui-play-action');b.setAttribute('aria-pressed',String(playing));b.setAttribute('aria-label',b.dataset.playlistName+(playing?' 일시정지':' 재생'));
 }
}
function homeProfileCard(p,kind){return `<article class="home-profile-card"><a href="#${kind}/${esc(p.id)}" title="${esc(p.name)}"><div class="profile-frame-canvas avatar-frame-host">${avatarImage(p,kind,false)}</div><div class="home-profile-name"><span>${esc(p.name)}</span>${p.partner_badge?`<span class="partner-badge" aria-label="${esc(p.partner_badge)}">✓ ${esc(p.partner_badge)}</span>`:''}</div></a></article>`;}
function homeProfileSection(kind,title,href){return `<section id="home-${kind}s" class="listening-section home-profile-section" data-home-kind="${kind}"><div class="section-heading"><h2 id="home-${kind}-heading">${esc(title)}</h2>${kind==='producer'?'':`<a class="home-more-link" href="${href}" aria-label="${esc(title)} 전체보기">전체보기</a>`}</div><div id="home-${kind}-panel" role="group" aria-labelledby="home-${kind}-heading" aria-busy="true"><p class="home-load-message" role="status">프로필을 불러오고 있어요.</p></div></section>`;}
function mountHomeRail(target){
 homeRailCleanups.get(target.id)?.();homeRailCleanups.delete(target.id);
 const rail=target.querySelector?.('.home-rail');if(!rail?.addEventListener)return;
 const buttons=target.querySelectorAll('[data-home-scroll]'),motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 const update=()=>{const end=rail.scrollWidth-rail.clientWidth;for(const b of buttons)b.disabled=Number(b.dataset.homeScroll)<0?rail.scrollLeft<=1:rail.scrollLeft>=end-1;};
 const move=direction=>rail.scrollBy({left:direction*Math.max(rail.clientWidth*.8,160),behavior:motion.matches?'instant':'smooth'});
 const click=e=>{const b=e.target.closest('[data-home-scroll]');if(b&&!b.disabled)move(Number(b.dataset.homeScroll));};
 const key=e=>{if(!rail.contains(e.target)||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();if(e.key==='Home'||e.key==='End')rail.scrollTo({left:e.key==='Home'?0:rail.scrollWidth,behavior:motion.matches?'instant':'smooth'});else move(e.key==='ArrowLeft'?-1:1);};
 target.addEventListener('click',click);target.addEventListener('keydown',key);rail.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(update):null;observer?.observe(rail);update();
 homeRailCleanups.set(target.id,()=>{target.removeEventListener('click',click);target.removeEventListener('keydown',key);rail.removeEventListener('scroll',update);window.removeEventListener('resize',update);observer?.disconnect();});
}
function homeHTML(){return `<div class="listening-home listening-home-v2 home-content-refresh">
 <section id="home-release" aria-label="추천 음악 배너" aria-busy="true">${homePlaceholder()}</section>
 <section id="home-recommended" class="listening-section" aria-busy="true">${homeSection('추천 음악','#discover')}<p class="home-load-message">음악을 불러오고 있어요.</p></section>
 <section id="home-popular" class="listening-section" aria-busy="true">${homeSection('인기 차트','#charts')}</section>
 <section id="home-more" class="listening-section" hidden></section>
 ${homeProfileSection('artist','지금 뜨는 AI 아티스트','#artists?sort=popular')}
 <section id="home-discovery" class="listening-section" aria-busy="true">${homeSection('발견','#discover')}</section>
 ${homeProfileSection('producer','주목할 작곡가','#producers?sort=popular')}
 <div id="home-bridge" class="home-bridge" hidden><section id="home-sing" class="listening-section" aria-busy="true">${homeSection('이번엔 내 목소리로','#karaoke')}</section><section id="home-conversations" class="listening-section" aria-busy="true">${homeSection('같은 노래, 다른 목소리','#community/covers')}</section></div>
 <section id="home-library" class="listening-section">${homeSection('추천 플레이리스트','#collections')}<div id="home-curations" aria-busy="true"><p class="home-load-message" role="status">플레이리스트를 불러오고 있어요.</p></div></section>
 </div>`;}
// Escape each run before adding markup; keep Latin glyphs at the original size.
function homeFeatureTitle(title){
 return String(title??'').split(/([\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af]+)/u).map((run,i)=>i%2?`<span class="home-feature-hangul">${esc(run)}</span>`:esc(run)).join('');
}
function releaseHTML(t,next){
 const art=homeArtworkPath(t);
 const playing=typeof current!=='undefined'&&current?.id===t.id&&!audio.paused&&!audio.ended&&!window.AifectAudioAds?.active;
 return `<div class="home-feature-background" aria-hidden="true"><div class="home-feature-backdrop"${art?` style="background-image:url(&quot;${esc(art)}&quot;)"`:''}>${art?`<img src="${esc(art)}" alt="" decoding="async">`:''}</div></div><article class="home-feature-slide"><a class="home-feature-cover" href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${homeCover(t,'home-feature-art',true)}</a><div class="home-feature-copy"><span class="home-feature-label">FEATURED MUSIC</span><div class="home-feature-title-row"><h2><a href="#song/${esc(t.id)}" title="${esc(t.title)}">${homeFeatureTitle(t.title)}</a></h2><span class="home-feature-divider" aria-hidden="true"></span><button type="button" class="home-feature-play" data-play="${esc(t.id)}" data-community-toggle aria-label="${esc(t.title)} ${playing?'일시정지':'재생'}" aria-pressed="${playing}">${icon(playing?'ui-pause-action':'ui-play-action')}</button></div><div class="home-feature-artist">${credits(t)}</div>${t.description?`<p class="home-feature-description">${esc(t.description)}</p>`:''}<div class="home-feature-actions"><a class="text-link" href="#song/${esc(t.id)}">곡 정보 보기</a></div></div>${next?`<button class="home-feature-preview" data-home-next aria-label="다음 곡 ${esc(next.title)} 보기">${homeCover(next,'home-preview-art')}<span>UP NEXT</span></button>`:''}</article>`;
}
function bindHomeImages(root){
 homeImagesCleanup?.();homeImagesCleanup=null;
 if(!root?.addEventListener)return;
 const fallback=event=>{const img=event.target;if(img.tagName!=='IMG'||!img.closest('.home-track-art,.home-feature-background'))return;if(img.getAttribute('src')!=='/assets/aifect-mark.svg')img.src='/assets/aifect-mark.svg';};
 root.addEventListener('error',fallback,true);
 homeImagesCleanup=()=>root.removeEventListener('error',fallback,true);
}
// Geometry uses projected widths (perspective + rotation), with 12% overlap.
function homeFloatGeometry(width,count,coverSize=0){
 const radius=Math.min(width>=540?3:width>=360?2:1,Math.floor(count/2));
 const scales=[1,.84,.69,.55,.42],angles=[0,14,22,28,34],depth=[0,-12,-24,-36,-60];
 const widths=scales.map((s,i)=>s*Math.cos(angles[i]*Math.PI/180)*1000/(1000-depth[i]));
 const positions=[0];for(let i=1;i<5;i++)positions[i]=positions[i-1]+.88*(widths[i-1]+widths[i])/2;
 const size=coverSize||Math.min(220,Math.max(1,width-12)/(2*positions[radius]+widths[radius]));
 if(coverSize&&radius){const fit=Math.max(0,(width-88)/size-widths[radius])/(2*positions[radius]);for(let i=1;i<5;i++)positions[i]*=Math.min(.63,fit);}
 return {radius,size,positions,scales,angles,depth};
}
function homeFloatPose(slot,g){
 const d=Math.min(4,Math.abs(slot)),sign=Math.sign(slot),z=g.depth[d];
 return `translate3d(${sign*g.positions[d]*g.size*(1000-z)/1000}px,${d*d*1.5}px,${z}px) rotateY(${-sign*g.angles[d]}deg) scale(${g.scales[d]})`;
}
// Each consumer owns its cleanup; editorial slides never subscribe to audio.
function mountFeatureCarousel(root,tracks,{renderSlide=releaseHTML,label='추천 음악',previousLabel='이전 추천곡',nextLabel='다음 추천곡',dotsLabel='추천곡 선택',syncAudio=true,coverflow=false}={}){
 if(!tracks.length)return;
 const multi=tracks.length>1;
 root.innerHTML=`<div class="home-feature" role="region" aria-roledescription="캐러셀" aria-label="${esc(label)}">${multi?`<button class="home-feature-arrow home-feature-prev" aria-label="${esc(previousLabel)}">${icon('chevron')}</button>`:''}<div class="home-feature-stage">${renderSlide(tracks[0],multi?tracks[1]:null,tracks,0)}</div>${multi?`<button class="home-feature-arrow home-feature-next" aria-label="${esc(nextLabel)}">${icon('chevron')}</button><div class="home-feature-pagination"><button class="home-feature-autoplay" aria-label="자동 롤링 일시정지">${icon('pause')}</button><div class="home-feature-dots" aria-label="${esc(dotsLabel)}">${tracks.map((t,i)=>`<button data-home-slide="${i}" aria-label="${i+1}. ${esc(t.title)}" aria-pressed="${i===0}"></button>`).join('')}</div></div>`:''}</div>`;
 // Minimal DOM renderers used by navigation tests do not implement browser events.
 if(!root.addEventListener)return;
 const feature=root.querySelector('.home-feature'),stage=root.querySelector('.home-feature-stage'),motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 let index=0,timer=null,transitionTimer=null,manualPause=false,hover=false,focus=false,start=null,suppressClick=false;
 const syncPlayback=()=>{if(!syncAudio)return;const b=stage.querySelector?.('.home-feature-slide .home-feature-play');if(!b||typeof audio==='undefined')return;const playing=current?.id===tracks[index].id&&!audio.paused&&!audio.ended&&!window.AifectAudioAds?.active;b.innerHTML=icon(playing?'ui-pause-action':'ui-play-action');b.setAttribute('aria-pressed',String(playing));b.setAttribute('aria-label',tracks[index].title+(playing?' 일시정지':' 재생'));};
 const clear=()=>{clearTimeout(timer);timer=null;};
 const clearTransition=()=>{clearTimeout(transitionTimer);transitionTimer=null;stage.querySelectorAll('.home-feature-outgoing').forEach(el=>el.remove());stage.removeAttribute('data-home-direction');};
 const schedule=()=>{clear();if(multi&&!start&&!manualPause&&!hover&&!focus&&!motion.matches&&!document.hidden)timer=setTimeout(()=>{if(!root.isConnected)return cleanup();go(index+1);},5500);};
 const go=value=>{
  const target=(value+tracks.length)%tracks.length;if(target===index){schedule();return;}
  // Use the requested direction before wrapping the first/last slide index.
  const direction=value>index?'next':'previous';index=target;clearTransition();
  const old=document.createElement('div');old.className='home-feature-outgoing';old.setAttribute('aria-hidden','true');old.inert=true;
  old.innerHTML=coverflow?(stage.querySelector('.home-feature-background')?.outerHTML||''):stage.innerHTML;
  if(!coverflow)stage.setAttribute('data-home-direction',direction);
  stage.innerHTML=renderSlide(tracks[index],multi?tracks[(index+1)%tracks.length]:null,tracks,index);stage.append(old);syncPlayback();
  const finish=e=>{if(e&&e.target!==old)return;if(stage.contains(old))clearTransition();};
  old.addEventListener('animationend',finish);
  if(motion.matches)finish();else transitionTimer=setTimeout(finish,coverflow?850:500);
  if(focus)focus=feature.contains(document.activeElement);
  feature.querySelectorAll('.home-feature-dots [data-home-slide]').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));schedule();
 };
 const click=e=>{
  if(suppressClick){suppressClick=false;if(e.detail!==0){e.preventDefault();e.stopPropagation();return;}}
  const b=e.target.closest('button');if(!b)return;
  if(b.matches('.home-feature-prev'))go(index-1);
  else if(b.matches('.home-feature-next,[data-home-next]'))go(index+1);
  else if(b.hasAttribute('data-home-slide'))go(Number(b.dataset.homeSlide));
  else if(b.matches('.home-feature-autoplay')){
   manualPause=!manualPause;
   // Explicit resume takes effect while the pointer or focus is still on the toggle.
   if(!manualPause){hover=false;focus=false;}
   b.setAttribute('aria-label',manualPause?'자동 롤링 재개':'자동 롤링 일시정지');
   b.innerHTML=icon(manualPause?'play':'pause');schedule();
  }else schedule();
 };
 const enter=e=>{if(e.pointerType==='touch')return;hover=true;clear();},leave=e=>{hover=false;if(e.pointerType!=='touch')start=null;schedule();},focusIn=()=>{focus=true;clear();},focusOut=e=>{focus=feature.contains(e.relatedTarget);schedule();};
 const key=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();go(index+(e.key==='ArrowLeft'?-1:1));}};
 const down=e=>{
  if(e.isPrimary===false){if(start)start.cancelled=true;return;}
  if(e.button!=null&&e.button!==0)return;
  suppressClick=false;if(!multi)return;
  start={x:e.clientX,y:e.clientY,id:e.pointerId,axis:null,cancelled:false};clear();
 };
 const move=e=>{
  if(!start||e.pointerId!==start.id||start.cancelled)return;
  const dx=Math.abs(e.clientX-start.x),dy=Math.abs(e.clientY-start.y);
  if(!start.axis&&Math.max(dx,dy)>10){if(dx>dy*1.25)start.axis='x';else if(dy>=dx)start.axis='y';}
  if(start.axis==='x'&&dx>45)feature.setPointerCapture?.(e.pointerId);
 };
 const up=e=>{
  if(!start||e.pointerId!==start.id)return;
  const gesture=start,dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;start=null;
  if(!gesture.cancelled&&gesture.axis!=='y'&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.25){suppressClick=true;go(index+(dx<0?1:-1));}
  else schedule();
 };
 const cancel=e=>{if(!start||e.pointerId!==start.id)return;start=null;schedule();};
 const lostCapture=e=>{if(e.target===feature)cancel(e);};
 // Capture prevents a completed swipe from activating a nested song/play link.
 const listeners=[['click',click,true],['pointerenter',enter],['pointerleave',leave],['focusin',focusIn],['focusout',focusOut],['keydown',key],['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',lostCapture]];
 for(const [name,fn,options] of listeners)feature.addEventListener(name,fn,options);
 const playbackEvents=['play','pause','ended','emptied','loadedmetadata'];
 if(syncAudio&&typeof audio!=='undefined')for(const event of playbackEvents)audio.addEventListener(event,syncPlayback);
 // Only the displayed artwork is eager; preview/remaining slides load on demand.
 const motionChange=()=>{if(motion.matches)clearTransition();schedule();};
 document.addEventListener('visibilitychange',schedule);window.addEventListener('hashchange',cleanup);motion.addEventListener('change',motionChange);
 function cleanup(){clear();clearTransition();for(const [name,fn,options] of listeners)feature.removeEventListener(name,fn,options);if(syncAudio&&typeof audio!=='undefined')for(const event of playbackEvents)audio.removeEventListener(event,syncPlayback);document.removeEventListener('visibilitychange',schedule);window.removeEventListener('hashchange',cleanup);motion.removeEventListener('change',motionChange);}
 schedule();return cleanup;
}
function updateHomeAccount(){
 document.querySelectorAll('.listening-home [data-like]').forEach(b=>{b.classList.toggle('is-active',liked(b.dataset.like));b.setAttribute('aria-pressed',String(liked(b.dataset.like)));});
}

function homeSingHTML(tracks){
 const tile=(t,featured)=>`<article class="sing-discovery-tile ${featured?'is-featured':''}"><a class="sing-discovery-art" href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${homeCover(t,'mini-cover')}</a><div class="sing-discovery-copy"><a href="#song/${esc(t.id)}"><h3>${esc(t.title)}</h3></a><span class="sing-discovery-credits">${credits(t)}</span><small>${esc(t.genre)} · ${time(t.duration)}</small>${featured?'<p>좋아하는 이 곡을,<br>이제 당신의 목소리로.</p>':''}<div class="sing-discovery-actions"><button class="small-button" data-play="${esc(t.id)}" data-community-toggle aria-label="${esc(t.title)} 원곡 재생">${icon('ui-play-action')} 재생</button><a class="small-button sing-discovery-start" href="#sing/${esc(t.id)}" aria-label="${esc(t.title)} 부르기">${icon('mic')} 부르기</a></div><a class="sing-discovery-covers" href="#song/${esc(t.id)}?covers=all">다른 목소리 만나기 ${icon('chevron')}</a></div></article>`;
 if(!tracks.length)return homeSection('이번엔 내 목소리로','#karaoke')+'<div class="home-empty-inline"><p>다음에 부를 음악을 준비하고 있어요.</p><a href="#community/covers" class="text-link">먼저 커버곡 들어보기</a></div>';
 const featured=tracks.slice(0,3),more=tracks.slice(3,6);
 return `<div class="sing-discovery"><header class="sing-discovery-heading"><div><h2>이번엔 내 목소리로</h2><p>좋아하는 노래를, 나만의 목소리로 불러보세요.</p></div>${homeMore('이번엔 내 목소리로','#karaoke')}</header><div class="sing-discovery-featured"><div class="sing-discovery-label">${icon('mic')} 당신의 목소리를 기다리는 곡</div><div class="sing-discovery-grid">${featured.map(t=>tile(t,true)).join('')}</div></div>${more.length?`<div class="sing-discovery-subheading"><h3>${icon('mic')} 이런 곡은 어때요?</h3><a class="text-link" href="#karaoke">더 많은 곡 둘러보기 ${icon('chevron')}</a></div><div class="sing-discovery-grid sing-discovery-more">${more.map(t=>tile(t,false)).join('')}</div>`:''}</div>`;
}

function renderHome(ticket){
 cleanupHome();
 const controller=homeRequestController=new AbortController();
 const main=$('#main');routeTracks=[];main.classList.remove('motion-enter');main.innerHTML=homeHTML();main.removeAttribute('aria-busy');window.scrollTo({top:0,behavior:'instant'});updateHomeAccount();bindHomeImages(main);
 const revision=apiRevision,displayed=new Set();
 const active=target=>!controller.signal.aborted&&ticket===renderId&&target?.isConnected&&revision===apiRevision;
 const addTracks=tracks=>{remember(tracks);const known=new Set(routeTracks.map(t=>t.id));routeTracks.push(...tracks.filter(t=>!known.has(t.id)));};
 const paint=(target,html)=>{if(target.innerHTML!==html)target.innerHTML=html;displayed.add(target);target.removeAttribute('aria-busy');};
 const release=$('#home-release');
 const paintRelease=d=>{
  addTracks(d.tracks);
  homeCarouselCleanup?.();
  homeCarouselCleanup=mountFeatureCarousel(release,d.tracks.slice(0,6));
  if(d.tracks.length){
   displayed.add(release);
   release.removeAttribute('aria-busy');
  }else{
   paint(release,empty('첫 음악의 주인공이 되어주세요.','당신의 음악으로 새로운 취향을 시작하세요.','#upload','음악 올리기'));
  }
  const more=$('#home-more');more.hidden=!d.tracks.length;paint(more,homeSection('최신곡','#charts/releases')+'<div class="home-music-grid">'+d.tracks.map(homeCard).join('')+'</div>');
 };
 const shelf=(id,title,href,d)=>{const target=$('#'+id),tracks=(d.tracks||[]).slice(0,12);addTracks(tracks);paint(target,homeSection(title,href)+(tracks.length?'<div class="home-music-grid">'+tracks.map(homeCard).join('')+'</div>':'<p class="home-empty-inline">아직 공개된 음악이 없어요.</p>'));};
 const paintDiscovery=d=>{shelf('home-recommended','추천 음악','#discover',{tracks:(d.tracks||[]).slice(0,6)});shelf('home-discovery','발견','#discover',{tracks:(d.tracks||[]).slice(6,12)});};
 const paintChart=d=>{const target=$('#home-popular'),tracks=d.tracks||[];addTracks(tracks);paint(target,homeSection('인기 차트','#charts')+(tracks.length?homeChartHTML(tracks):'<p class="home-empty-inline">아직 집계된 음악이 없어요.</p>'));bindChartPlayback();};
 const paintSing=d=>{addTracks(d.tracks);paint($('#home-sing'),homeSingHTML(d.tracks));};
 const paintConversations=d=>shelf('home-conversations','같은 노래, 다른 목소리','#community/covers',{tracks:(d.tracks||[]).slice(0,6)});
 const homePlaylists=new Map();let curationSequence=0;
 const syncCurations=()=>syncHomePlaylistButtons($('#home-curations'),homePlaylists);
 for(const event of ['play','pause','ended','emptied','loadedmetadata'])audio.addEventListener(event,syncCurations,{signal:controller.signal});
 const paintCurations=d=>{
  const items=(d.playlists||[]).filter(p=>p.tracks>0&&p.is_public&&!p.locked).slice(0,6),target=$('#home-curations'),sequence=++curationSequence;
  paint(target,items.length?'<div class="home-playlist-grid">'+items.map(p=>homePlaylistCard(p)).join('')+'</div>':'<p class="home-empty-inline" role="status">아직 추천 플레이리스트가 없어요.</p>');
  for(const p of items)void (async()=>{
   try{
    const detail=await api('/api/playlists/'+encodeURIComponent(p.id),'GET',undefined,{signal:controller.signal});
    if(!active(target)||sequence!==curationSequence)return;
    const card=[...target.querySelectorAll('[data-home-playlist]')].find(b=>b.dataset.homePlaylist===p.id)?.closest('.home-playlist-card');
    if(!card)return;
    if(!detail.playlist.is_public||detail.playlist.locked){card.remove();homePlaylists.delete(p.id);return;}
    homePlaylists.set(p.id,detail.tracks||[]);card.outerHTML=homePlaylistCard(detail.playlist,detail.tracks||[]);syncCurations();
   }catch{if(active(target)&&sequence===curationSequence){const b=[...target.querySelectorAll('[data-home-playlist]')].find(b=>b.dataset.homePlaylist===p.id),status=b?.closest('.home-playlist-card').querySelector('.home-playlist-status');if(status)status.textContent='수록곡은 상세에서 확인';}}
  })();
 };
 const profileRequests={artist:0,producer:0};
 const loadProfiles=async kind=>{
  const target=$('#home-'+kind+'-panel');if(!target?.isConnected)return;const sequence=++profileRequests[kind];
  target.setAttribute('aria-busy','true');
  homeRailCleanups.get(target.id)?.();homeRailCleanups.delete(target.id);
  target.innerHTML='<p class="home-load-message" role="status">프로필을 불러오고 있어요.</p>';
  const path='/api/discovery/profiles?'+new URLSearchParams({kind,sort:'popular'});
  const show=d=>{if(!active(target)||sequence!==profileRequests[kind])return;const items=(d.profiles||[]).slice(0,10),label=kind==='artist'?'지금 뜨는 AI 아티스트':'주목할 작곡가';paint(target,items.length?homeRailHTML('home-'+kind+'-rail',label,items.map(p=>homeProfileCard(p,kind)).join(''),'profile'):'<p class="home-empty-inline" role="status">아직 공개곡이 있는 프로필이 없어요.</p>');mountHomeRail(target);};
  const cached=peekApiRead(path,{display:true});if(cached)show(cached);
  try{show(await api(path,'GET',undefined,{signal:controller.signal}));}catch{if(active(target)&&sequence===profileRequests[kind]&&!cached){paint(target,'<div class="home-load-error" role="alert"><p>프로필을 불러오지 못했어요.</p><button type="button" class="small-button" data-home-profile-retry="'+kind+'">다시 시도</button></div>');}}
 };
 if(main.addEventListener){
  main.addEventListener('click',async e=>{
   const retry=e.target.closest('[data-home-profile-retry]'),button=e.target.closest('[data-home-playlist]');
   if(retry)void loadProfiles(retry.dataset.homeProfileRetry);
   if(button){
    e.preventDefault();e.stopPropagation();button.disabled=true;
    try{
     const id=button.dataset.homePlaylist;
     if(homePlaylistQueueMatches(homePlaylists.get(id))){$('#play-toggle').click();return;}
     const d=await api('/api/playlists/'+encodeURIComponent(id),'GET',undefined,{signal:controller.signal});if(!active(button))return;
     homePlaylists.set(id,d.tracks||[]);
     if(d.tracks?.length){remember(d.tracks);await play(d.tracks[0].id,d.tracks);}else toast('재생할 수 있는 공개곡이 없어요.');
    }catch(error){if(!controller.signal.aborted)toast(error.message);}finally{if(button.isConnected)button.disabled=false;if(!controller.signal.aborted)syncCurations();}
   }
  },{signal:controller.signal});

 }
 for(const kind of ['artist','producer'])void loadProfiles(kind);
 const jobs=[['/api/catalog?section=tracks&limit=12',paintRelease,'home-release'],['/api/discovery?',paintDiscovery,'home-recommended'],['/api/catalog?section=tracks&chart=top&period=week&limit=12',paintChart,'home-popular'],['/api/karaoke',paintSing,'home-sing'],['/api/community?kind=cover',paintConversations,'home-conversations'],['/api/playlists?sort=popular',paintCurations,'home-curations']];
 for(const [path,show] of jobs){const cached=peekApiRead(path,{display:true});if(cached)show(cached);}
 const load=async([path,show,id])=>{const target=$('#'+id);try{const d=await api(path,'GET',undefined,{signal:controller.signal});if(!controller.signal.aborted&&id==='home-release'&&ticket===renderId&&target.isConnected&&revision!==apiRevision)return renderHome(ticket);if(active(target)){show(d);updateHomeAccount();}}catch{if(active(target)&&!displayed.has(target)){paint(target,'<div class="home-load-error"><p>음악을 불러오지 못했어요.</p><button class="small-button">다시 시도</button></div>');target.querySelector('button').onclick=()=>load([path,show,id]);if(id==='home-recommended')paint($('#home-discovery'),homeSection('발견','#discover')+'<a class="text-link" href="#discover">음악 둘러보기</a>');}}};
 const first=load(jobs[0]);for(const job of jobs.slice(1)){
  // The optional singing/community bridge is currently hidden by design.
  if(['home-sing','home-conversations'].includes(job[2])&&$('#home-bridge')?.hidden)continue;
  void load(job);
 }return first;
}
