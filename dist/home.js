let homeCarouselCleanup=null,homeImagesCleanup=null,homeRequestController=null;
const homeRailCleanups=new Map();
function cleanupHome(){
 homeBrowseObserver?.disconnect();homeCarouselCleanup?.();homeCarouselCleanup=null;
 homeImagesCleanup?.();homeImagesCleanup=null;
 homeRequestController?.abort();homeRequestController=null;
 for(const cleanup of homeRailCleanups.values())cleanup();homeRailCleanups.clear();
}
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
function homeRailHTML(id,label,content,kind){return `<div class="home-rail-shell">${kind==='profile'?'':`<div class="home-rail-controls"><button type="button" data-home-scroll="-1" aria-controls="${id}" aria-label="${esc(label)} 이전 보기">${icon('chevron')}</button><button type="button" data-home-scroll="1" aria-controls="${id}" aria-label="${esc(label)} 다음 보기">${icon('chevron')}</button></div>`}<div id="${id}" class="home-rail home-${kind}-rail" role="region" aria-roledescription="캐러셀" aria-label="${esc(label)}" tabindex="0">${content}</div></div>`;}
function homePlaylistCard(p){
 let art=playlistArt(p);for(const t of p.covers||[])art=homeReplaceArtwork(art,[t],'collection-tile');
 return `<article class="home-playlist-card"><div class="home-playlist-art"><a href="#playlist/${esc(p.id)}" aria-label="${esc(p.name)} 상세">${art}</a><button type="button" class="list-action" data-home-playlist="${esc(p.id)}" aria-label="${esc(p.name)} 재생">${icon('ui-play-action')}</button></div><a class="home-playlist-name" href="#playlist/${esc(p.id)}" title="${esc(p.name)}">${esc(p.name)}</a>${p.description?`<p title="${esc(p.description)}">${esc(p.description)}</p>`:''}<small>${number(p.tracks)}곡 · ${p.is_public?'공개':'비공개'}</small></article>`;
}
function homeProfileCard(p,kind){return `<article class="home-profile-card"><a href="#${kind}/${esc(p.id)}" title="${esc(p.name)}"><div class="artist-portrait cover cover-custom profile-avatar">${avatarImage(p,kind,false)}</div><div class="home-profile-name"><span>${esc(p.name)}</span>${p.partner_badge?`<span class="partner-badge" aria-label="${esc(p.partner_badge)}">✓ ${esc(p.partner_badge)}</span>`:''}</div></a></article>`;}
function homeProfileSection(kind,title,href){return `<section id="home-${kind}s" class="listening-section home-profile-section" data-home-kind="${kind}"><div class="section-heading"><h2 id="home-${kind}-heading">${esc(title)}</h2><a class="home-more-link" href="${href}" aria-label="${esc(title)} 전체보기">전체보기</a></div><div id="home-${kind}-panel" role="group" aria-labelledby="home-${kind}-heading" aria-busy="true"><p class="home-load-message" role="status">프로필을 불러오고 있어요.</p></div></section>`;}
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
function releaseHTML(t,next,tracks=[t,next].filter(Boolean),index=0){
 const art=homeArtworkPath(t);
 const playing=typeof current!=='undefined'&&current?.id===t.id&&!audio.paused&&!audio.ended&&!window.AifectAudioAds?.active;
 // Choose each neighbouring track once, even with fewer than five slides.
 const cover=(track,eager=false)=>homeCover(track,'home-feature-art',eager).replace('<img ','<img draggable="false" ');
 const seen=new Set([index]),neighbours=[];
 for(const offset of [1,-1,2,-2]){const i=(index+offset+tracks.length)%tracks.length;if(seen.has(i))continue;seen.add(i);neighbours.push(`<button type="button" class="home-feature-rear ${offset<0?'is-left':'is-right'} ${Math.abs(offset)===2?'is-far':''}" data-home-slide="${i}" aria-label="${offset<0?'이전':'다음'} 곡 ${esc(tracks[i].title)} 보기">${cover(tracks[i])}</button>`);}
 return `<div class="home-feature-background" aria-hidden="true"><div class="home-feature-backdrop"${art?` style="background-image:url(&quot;${esc(art)}&quot;)"`:''}>${art?`<img src="${esc(art)}" alt="" decoding="async">`:''}</div></div><article class="home-feature-slide"><div class="home-feature-copy"><span class="home-feature-label">FEATURED MUSIC</span><div class="home-feature-title-row"><h2><a href="#song/${esc(t.id)}" title="${esc(t.title)}">${homeFeatureTitle(t.title)}</a></h2></div><div class="home-feature-artist">${credits(t)}</div>${t.description?`<p class="home-feature-description">${esc(t.description)}</p>`:''}<div class="home-feature-actions"><a class="home-feature-info" href="#song/${esc(t.id)}">곡 정보 보기 ${icon('chevron')}</a><button type="button" class="home-feature-play" data-play="${esc(t.id)}" data-community-toggle aria-label="${esc(t.title)} ${playing?'일시정지':'재생'}" aria-pressed="${playing}">${icon(playing?'ui-pause-action':'ui-play-action')}</button></div></div><div class="home-feature-covers">${neighbours.join('')}<a class="home-feature-cover" draggable="false" href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${cover(t,true)}</a></div></article>`;
}
function bindHomeImages(root){
 homeImagesCleanup?.();homeImagesCleanup=null;
 if(!root?.addEventListener)return;
 const fallback=event=>{const img=event.target;if(img.tagName!=='IMG'||!img.closest('.home-track-art,.home-feature-background'))return;img.hidden=true;if(img.closest('.home-feature-background'))img.parentElement.style.backgroundImage='none';const label=img.parentElement.querySelector('.cover-word');if(label)label.hidden=false;};
 root.addEventListener('error',fallback,true);
 homeImagesCleanup=()=>root.removeEventListener('error',fallback,true);
}
function mountHomeCarousel(root,tracks){
 homeCarouselCleanup?.();homeCarouselCleanup=mountFloatingHome(root,tracks);
}
// Stable track nodes: position, anticipation and floating each own a transform layer.
function homeFloatSlot(i,index,count){let d=(i-index+count)%count;if(d>count/2)d-=count;return d;}
function homeFeaturedTracks(recommended=[],fallback=[]){return [...recommended,...fallback].filter((t,i,a)=>a.findIndex(x=>x.id===t.id)===i).slice(0,7);}
function homeFloatPose(slot){
 const d=Math.abs(slot),sign=Math.sign(slot);
 return `translate3d(${sign*[0,32,55,74][d]}%,0,0) scale(${[1,.84,.68,.54][d]}) rotateY(${-sign*[0,24,32,38][d]}deg)`;
}
function mountFloatingHome(root,input){
 const tracks=homeFeaturedTracks(input);if(!tracks.length)return;
 // Reuse the existing banner markup, actions, typography and player bindings.
 root.innerHTML=`<div class="home-feature home-floating" role="region" aria-roledescription="캐러셀" aria-label="추천 음악"><div class="home-feature-stage">${releaseHTML(tracks[0],tracks[1],tracks,0)}</div>${tracks.length>1?`<button class="home-feature-arrow home-feature-prev" aria-label="이전 추천곡">${icon('chevron')}</button><button class="home-feature-arrow home-feature-next" aria-label="다음 추천곡">${icon('chevron')}</button><div class="home-feature-pagination"><button class="home-feature-autoplay" aria-label="자동 롤링 일시정지" aria-pressed="false">${icon('pause')}</button><div class="home-feature-dots" aria-label="추천곡 선택">${tracks.map((t,i)=>`<button data-home-slide="${i}" aria-label="${i+1}. ${esc(t.title)}" aria-pressed="${i===0}"></button>`).join('')}</div></div>`:''}</div>`;
 if(!root.addEventListener)return;
 const feature=root.querySelector('.home-feature'),stage=feature.querySelector('.home-feature-covers'),copy=feature.querySelector('.home-feature-copy'),bg=feature.querySelector('.home-feature-background');
 const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 stage.innerHTML=tracks.map((t,i)=>`<a class="home-floating-card" data-float-card="${i}" href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보" draggable="false"><span class="home-floating-lean"><span class="home-floating-drift" style="--float-duration:${6+i*.29}s;--float-delay:${-i*1.13}s;--float-direction:${i%2?'reverse':'normal'}">${homeCover(t,'home-feature-art',true).replace('<img ','<img draggable="false" ')}</span></span></a>`).join('');
 bg.innerHTML=tracks.map(t=>{const src=homeArtworkPath(t);return `<div class="home-floating-wash"><div class="home-feature-backdrop">${src?`<img src="${esc(src)}" alt="" decoding="async">`:''}</div></div>`;}).join('');
 const cards=[...stage.children],washes=[...bg.children],dots=[...feature.querySelectorAll('.home-feature-dots button')],animations=new Map();
 let index=0,timer=null,leadTimer=null,paused=false,hover=false,focus=false,start=null,suppressClick=false,disposed=false,leaning=false;
 const blocked=()=>paused||hover||focus||document.hidden||motion.matches;
 const animate=(el,frames,duration=850)=>{
  const previous=animations.get(el);previous?.cancel();
  const last=frames.at(-1);Object.assign(el.style,last);
  if(motion.matches)return;
  const animation=el.animate(frames,{duration,easing:'cubic-bezier(.35,0,.2,1)'});animations.set(el,animation);
  animation.onfinish=()=>{if(animations.get(el)===animation)animations.delete(el);};
 };
 const sync=()=>{const b=copy.querySelector('.home-feature-play');if(!b||typeof audio==='undefined')return;const playing=current?.id===tracks[index].id&&!audio.paused&&!audio.ended&&!window.AifectAudioAds?.active;b.innerHTML=icon(playing?'ui-pause-action':'ui-play-action');b.setAttribute('aria-pressed',String(playing));b.setAttribute('aria-label',tracks[index].title+(playing?' 일시정지':' 재생'));};
 const lean=angle=>{leaning=angle!==0;for(const card of cards){const el=card.firstElementChild;animate(el,[{transform:getComputedStyle(el).transform},{transform:`rotateY(${angle}deg)`}],500);}};
 const clear=()=>{clearTimeout(timer);clearTimeout(leadTimer);timer=leadTimer=null;};
 const schedule=(freezeTransitions=true)=>{
  clear();if(leaning&&!paused&&!document.hidden)lean(0);feature.classList.toggle('is-floating-paused',blocked());
  for(const a of animations.values())if(freezeTransitions&&(paused||document.hidden))a.pause();else if(a.playState==='paused')a.play();
  if(motion.matches){for(const a of animations.values())a.finish();animations.clear();}
  if(tracks.length>1&&!blocked()&&!disposed){leadTimer=setTimeout(()=>lean(-.7),5000);timer=setTimeout(()=>{if(!root.isConnected)return cleanup();go(index+1);},5500);}
 };
 const paint=(previous=null)=>{
  for(const [i,card] of cards.entries()){
   const slot=homeFloatSlot(i,index,tracks.length),oldSlot=homeFloatSlot(i,previous??index,tracks.length);
   const transform=homeFloatPose(slot),alpha=1;
   card.style.setProperty('--float-shade',[0,.52,.7,.8][Math.abs(slot)]);
   // The wrapping far card travels continuously behind the row, never across its face.
   const from={transform:getComputedStyle(card).transform,opacity:getComputedStyle(card).opacity};
   card.style.zIndex=String(10-Math.abs(slot));card.setAttribute('aria-current',String(slot===0));
   if(previous===null){card.style.transform=transform;card.style.opacity=alpha;}
   else {const frames=[from];if(Math.abs(slot-oldSlot)>tracks.length/2){card.style.zIndex='1';frames.push({transform:'translate3d(0,0,-180px) scale(.44) rotateY(0deg)',opacity:.12});}frames.push({transform,opacity:alpha});animate(card,frames);}
  }
  for(const [i,wash] of washes.entries()){const opacity=i===index?1:0;if(previous===null)wash.style.opacity=opacity;else animate(wash,[{opacity:getComputedStyle(wash).opacity},{opacity}]);}
  dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===index)));sync();
 };
 const go=value=>{
  const next=(value+tracks.length)%tracks.length;if(next===index){schedule();return;}
  const previous=index;index=next;
  const template=document.createElement('template');template.innerHTML=releaseHTML(tracks[index],null,tracks,index);
  copy.innerHTML=template.content.querySelector('.home-feature-copy').innerHTML;
  if(leaning)lean(0);paint(previous);schedule(false);
 };
 const click=e=>{
  if(suppressClick){suppressClick=false;e.preventDefault();e.stopPropagation();return;}
  const card=e.target.closest('[data-float-card]');if(card&&Number(card.dataset.floatCard)!==index){e.preventDefault();go(Number(card.dataset.floatCard));return;}
  const b=e.target.closest('button');if(!b)return;
  if(b.matches('.home-feature-prev'))go(index-1);else if(b.matches('.home-feature-next'))go(index+1);else if(b.hasAttribute('data-home-slide'))go(Number(b.dataset.homeSlide));
  else if(b.matches('.home-feature-autoplay')){paused=!paused;b.setAttribute('aria-pressed',String(paused));b.setAttribute('aria-label',paused?'자동 롤링 재개':'자동 롤링 일시정지');b.innerHTML=icon(paused?'play':'pause');schedule();}
 };
 const enter=e=>{if(e.pointerType==='touch')return;hover=true;schedule();},leave=()=>{hover=false;schedule();};
 const focusIn=e=>{focus=!e.target.closest('.home-feature-autoplay');schedule();},focusOut=e=>{focus=feature.contains(e.relatedTarget)&&!e.relatedTarget?.closest('.home-feature-autoplay');schedule();};
 const down=e=>{if(e.isPrimary===false||e.button>0)return;suppressClick=false;start={x:e.clientX,y:e.clientY};clear();};
 const up=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){suppressClick=true;go(index+(dx<0?1:-1));}else schedule();};
 const cancel=()=>{start=null;schedule();};
 const key=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();go(index+(e.key==='ArrowLeft'?-1:1));};
 const listeners=[['click',click],['pointerenter',enter],['pointerleave',leave],['focusin',focusIn],['focusout',focusOut],['pointerdown',down],['pointerup',up],['pointercancel',cancel],['keydown',key]];
 for(const [name,fn] of listeners)feature.addEventListener(name,fn);
 const audioEvents=['play','pause','ended','emptied','loadedmetadata'];if(typeof audio!=='undefined')for(const name of audioEvents)audio.addEventListener(name,sync);
 document.addEventListener('visibilitychange',schedule);motion.addEventListener('change',schedule);window.addEventListener('hashchange',cleanup);
 function cleanup(){disposed=true;clear();for(const a of animations.values())a.cancel();animations.clear();for(const [name,fn] of listeners)feature.removeEventListener(name,fn);if(typeof audio!=='undefined')for(const name of audioEvents)audio.removeEventListener(name,sync);document.removeEventListener('visibilitychange',schedule);motion.removeEventListener('change',schedule);window.removeEventListener('hashchange',cleanup);}
 paint();schedule();return cleanup;
}
// Each consumer owns its cleanup; editorial slides never subscribe to audio.
function mountFeatureCarousel(root,tracks,{renderSlide=releaseHTML,label='추천 음악',previousLabel='이전 추천곡',nextLabel='다음 추천곡',dotsLabel='추천곡 선택',syncAudio=true,coverflow=false}={}){
 if(!tracks.length)return;
 const multi=tracks.length>1;
 root.innerHTML=`<div class="home-feature" role="region" aria-roledescription="캐러셀" aria-label="${esc(label)}">${multi?`<button class="home-feature-arrow home-feature-prev" aria-label="${esc(previousLabel)}">${icon('chevron')}</button>`:''}<div class="home-feature-stage">${renderSlide(tracks[0],multi?tracks[1]:null,tracks,0)}</div>${multi?`<button class="home-feature-arrow home-feature-next" aria-label="${esc(nextLabel)}">${icon('chevron')}</button><div class="home-feature-pagination"><button class="home-feature-autoplay" aria-label="자동 롤링 일시정지">${icon('pause')}</button><div class="home-feature-dots" aria-label="${esc(dotsLabel)}">${tracks.map((t,i)=>`<button data-home-slide="${i}" aria-label="${i+1}. ${esc(t.title)}" aria-pressed="${i===0}"></button>`).join('')}</div></div>`:''}</div>`;
 // Minimal DOM renderers used by navigation tests do not implement browser events.
 if(!root.addEventListener)return;
 const feature=root.querySelector('.home-feature'),stage=root.querySelector('.home-feature-stage'),motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 let index=0,timer=null,fadeTimer=null,manualPause=false,hover=false,focus=false,start=null,suppressClick=false;
 const syncPlayback=()=>{if(!syncAudio)return;const b=stage.querySelector?.('.home-feature-slide .home-feature-play');if(!b||typeof audio==='undefined')return;const playing=current?.id===tracks[index].id&&!audio.paused&&!audio.ended&&!window.AifectAudioAds?.active;b.innerHTML=icon(playing?'ui-pause-action':'ui-play-action');b.setAttribute('aria-pressed',String(playing));b.setAttribute('aria-label',tracks[index].title+(playing?' 일시정지':' 재생'));};
 const clear=()=>{clearTimeout(timer);timer=null;};
 const schedule=()=>{clear();if(multi&&!manualPause&&!hover&&!focus&&!motion.matches&&!document.hidden)timer=setTimeout(()=>{if(!root.isConnected)return cleanup();go(index+1);},5500);};
 const go=value=>{
  const target=(value+tracks.length)%tracks.length;if(coverflow&&target===index)return;index=target;
  clearTimeout(fadeTimer);fadeTimer=null;
  stage.querySelectorAll('.home-feature-outgoing').forEach(el=>el.remove());
  const old=document.createElement('div');old.className='home-feature-outgoing';old.setAttribute('aria-hidden','true');old.inert=true;
  old.innerHTML=coverflow?(stage.querySelector('.home-feature-background')?.outerHTML||''):stage.innerHTML;
  stage.innerHTML=renderSlide(tracks[index],multi?tracks[(index+1)%tracks.length]:null,tracks,index);stage.append(old);syncPlayback();
  old.addEventListener('animationend',()=>old.remove(),{once:true});if(motion.matches)old.remove();else if(coverflow)fadeTimer=setTimeout(()=>{old.remove();fadeTimer=null;},850);
  if(coverflow&&focus)focus=feature.contains(document.activeElement);
  feature.querySelectorAll('.home-feature-dots [data-home-slide]').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));schedule();
 };
 const click=e=>{if(coverflow&&suppressClick){suppressClick=false;e.preventDefault();e.stopPropagation();return;}const b=e.target.closest('button');if(!b)return;if(b.matches('.home-feature-prev'))go(index-1);else if(b.matches('.home-feature-next,[data-home-next]'))go(index+1);else if(b.hasAttribute('data-home-slide'))go(Number(b.dataset.homeSlide));else if(b.matches('.home-feature-autoplay')){manualPause=!manualPause;b.setAttribute('aria-label',manualPause?'자동 롤링 재개':'자동 롤링 일시정지');b.innerHTML=icon(manualPause?'play':'pause');schedule();}else schedule();};
 const enter=e=>{if(coverflow&&e.pointerType==='touch')return;hover=true;clear();},leave=()=>{hover=false;schedule();},focusIn=()=>{focus=true;clear();},focusOut=e=>{focus=feature.contains(e.relatedTarget);schedule();};
 const key=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();go(index+(e.key==='ArrowLeft'?-1:1));}};
 const down=e=>{suppressClick=false;start={x:e.clientX,y:e.clientY};},up=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){suppressClick=coverflow;go(index+(dx<0?1:-1));}};
 const cancel=()=>{start=null;};
 const listeners=[['click',click],['pointerenter',enter],['pointerleave',leave],['focusin',focusIn],['focusout',focusOut],['keydown',key],['pointerdown',down],['pointerup',up],['pointercancel',cancel]];
 for(const [name,fn] of listeners)feature.addEventListener(name,fn);
 const playbackEvents=['play','pause','ended','emptied','loadedmetadata'];
 if(syncAudio&&typeof audio!=='undefined')for(const event of playbackEvents)audio.addEventListener(event,syncPlayback);
 // Only the displayed artwork is eager; preview/remaining slides load on demand.
 document.addEventListener('visibilitychange',schedule);window.addEventListener('hashchange',cleanup);motion.addEventListener('change',schedule);
 function cleanup(){clear();clearTimeout(fadeTimer);for(const [name,fn] of listeners)feature.removeEventListener(name,fn);if(syncAudio&&typeof audio!=='undefined')for(const event of playbackEvents)audio.removeEventListener(event,syncPlayback);document.removeEventListener('visibilitychange',schedule);window.removeEventListener('hashchange',cleanup);motion.removeEventListener('change',schedule);}
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
 let featuredCatalog=null,featuredRecommended=null,featuredSignature='';
 const paintFeatured=()=>{
  if(featuredRecommended===null&&featuredCatalog===null)return;
  const tracks=homeFeaturedTracks(featuredRecommended||[],featuredCatalog||[]),signature=JSON.stringify(tracks);
  if(signature===featuredSignature)return;featuredSignature=signature;
  addTracks(tracks);if(tracks.length){mountHomeCarousel(release,tracks);displayed.add(release);release.removeAttribute('aria-busy');}
  else paint(release,empty('첫 음악의 주인공이 되어주세요.','당신의 음악으로 새로운 취향을 시작하세요.','#upload','음악 올리기'));
 };
 const paintRelease=d=>{
  addTracks(d.tracks);featuredCatalog=d.tracks;paintFeatured();
  const more=$('#home-more');more.hidden=!d.tracks.length;paint(more,homeSection('최신곡','#charts/releases')+'<div class="home-music-grid">'+d.tracks.map(homeCard).join('')+'</div>');
 };
 const shelf=(id,title,href,d)=>{const target=$('#'+id),tracks=(d.tracks||[]).slice(0,12);addTracks(tracks);paint(target,homeSection(title,href)+(tracks.length?'<div class="home-music-grid">'+tracks.map(homeCard).join('')+'</div>':'<p class="home-empty-inline">아직 공개된 음악이 없어요.</p>'));};
 const paintDiscovery=d=>{featuredRecommended=d.tracks||[];paintFeatured();shelf('home-recommended','추천 음악','#discover',{tracks:(d.tracks||[]).slice(0,6)});shelf('home-discovery','발견','#discover',{tracks:(d.tracks||[]).slice(6,12)});};
 const paintChart=d=>{const target=$('#home-popular'),tracks=d.tracks||[];addTracks(tracks);paint(target,homeSection('인기 차트','#charts')+(tracks.length?homeChartHTML(tracks):'<p class="home-empty-inline">아직 집계된 음악이 없어요.</p>'));bindChartPlayback();};
 const paintSing=d=>{addTracks(d.tracks);paint($('#home-sing'),homeSingHTML(d.tracks));};
 const paintConversations=d=>shelf('home-conversations','같은 노래, 다른 목소리','#community/covers',{tracks:(d.tracks||[]).slice(0,6)});
 const paintCurations=d=>{const items=(d.playlists||[]).filter(p=>p.tracks>0&&p.is_public&&!p.locked).slice(0,12),target=$('#home-curations');paint(target,items.length?homeRailHTML('home-playlist-rail','추천 플레이리스트',items.map(homePlaylistCard).join(''),'playlist'):'<p class="home-empty-inline" role="status">아직 추천 플레이리스트가 없어요.</p>');mountHomeRail(target);};
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
   if(button){button.disabled=true;try{const d=await api('/api/playlists/'+encodeURIComponent(button.dataset.homePlaylist),'GET',undefined,{signal:controller.signal});if(!active(button))return;if(d.tracks?.length){remember(d.tracks);await play(d.tracks[0].id,d.tracks);}else toast('재생할 수 있는 공개곡이 없어요.');}catch(error){if(!controller.signal.aborted)toast(error.message);}finally{if(button.isConnected)button.disabled=false;}}
  },{signal:controller.signal});

 }
 for(const kind of ['artist','producer'])void loadProfiles(kind);
 const jobs=[['/api/catalog?section=tracks&limit=12',paintRelease,'home-release'],['/api/discovery?',paintDiscovery,'home-recommended'],['/api/catalog?section=tracks&chart=top&period=week&limit=12',paintChart,'home-popular'],['/api/karaoke',paintSing,'home-sing'],['/api/community?kind=cover',paintConversations,'home-conversations'],['/api/playlists?sort=popular',paintCurations,'home-curations']];
 for(const [path,show] of jobs){const cached=peekApiRead(path,{display:true});if(cached)show(cached);}
 const load=async([path,show,id])=>{const target=$('#'+id);try{const d=await api(path,'GET',undefined,{signal:controller.signal});if(!controller.signal.aborted&&id==='home-release'&&ticket===renderId&&target.isConnected&&revision!==apiRevision)return renderHome(ticket);if(active(target)){show(d);updateHomeAccount();}}catch{if(active(target)){if(id==='home-recommended'){featuredRecommended??=[];paintFeatured();}if(id==='home-release'){featuredCatalog??=[];paintFeatured();}}if(active(target)&&!displayed.has(target)){paint(target,'<div class="home-load-error"><p>음악을 불러오지 못했어요.</p><button class="small-button">다시 시도</button></div>');target.querySelector('button').onclick=()=>load([path,show,id]);if(id==='home-recommended')paint($('#home-discovery'),homeSection('발견','#discover')+'<a class="text-link" href="#discover">음악 둘러보기</a>');}}};
 const first=load(jobs[0]);for(const job of jobs.slice(1)){
  // The optional singing/community bridge is currently hidden by design.
  if(['home-sing','home-conversations'].includes(job[2])&&$('#home-bridge')?.hidden)continue;
  void load(job);
 }return first;
}
