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
function homeProfileCard(p,kind){return `<article class="home-profile-card"><a href="#${kind}/${esc(p.id)}" title="${esc(p.name)}"><div class="artist-portrait cover cover-custom profile-avatar">${avatarImage(p,kind,false)}</div><div class="home-profile-name"><span>${esc(p.name)}</span>${p.partner_badge?`<span class="partner-badge" aria-label="${esc(p.partner_badge)}">✓ ${esc(p.partner_badge)}</span>`:''}</div></a></article>`;}
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
function releaseHTML(t,next,tracks=[t,next].filter(Boolean),index=0){
 const art=homeArtworkPath(t);
 const playing=typeof current!=='undefined'&&current?.id===t.id&&!audio.paused&&!audio.ended&&!window.AifectAudioAds?.active;
 // Choose each neighbouring track once, even with fewer than five slides.
 const cover=(track,eager=false)=>homeCover(track,'home-feature-art',eager).replace('<img ','<img draggable="false" ');
 const seen=new Set([index]),neighbours=[];
 for(const offset of [1,-1,2,-2]){const i=(index+offset+tracks.length)%tracks.length;if(seen.has(i))continue;seen.add(i);neighbours.push(`<button type="button" class="home-feature-rear ${offset<0?'is-left':'is-right'} ${Math.abs(offset)===2?'is-far':''}" data-home-slide="${i}" aria-label="${offset<0?'이전':'다음'} 곡 ${esc(tracks[i].title)} 보기">${cover(tracks[i])}</button>`);}
 return `<div class="home-feature-background" aria-hidden="true"><div class="home-feature-backdrop"${art?` style="background-image:url(&quot;${esc(art)}&quot;)"`:''}>${art?`<img src="${esc(art)}" alt="" decoding="async">`:''}</div></div><article class="home-feature-slide"><div class="home-feature-copy"><span class="home-feature-label">TRENDING NOW</span><div class="home-feature-title-row"><h2><a href="#song/${esc(t.id)}" title="${esc(t.title)}"><span class="home-feature-title-text">${homeFeatureTitle(t.title)}</span></a></h2></div><div class="home-feature-artist-row"><div class="home-feature-artist">${credits(t)}</div></div>${t.description?`<p class="home-feature-description">${esc(t.description)}</p>`:''}<div class="home-feature-actions"><a class="home-feature-info" href="#song/${esc(t.id)}">곡 정보 보기 ${icon('chevron')}</a><button type="button" class="home-feature-play" data-play="${esc(t.id)}" data-community-toggle aria-label="${esc(t.title)} ${playing?'일시정지':'재생'}" aria-pressed="${playing}">${icon(playing?'ui-pause-action':'ui-play-action')}</button></div></div><div class="home-feature-covers">${neighbours.join('')}<a class="home-feature-cover" draggable="false" href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${cover(t,true)}</a></div></article>`;
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
// Stable track nodes glide between fixed poses without idle motion.
function homeFloatSlot(i,index,count){let d=(i-index+count)%count;if(d>count/2)d-=count;return d;}
function homeFeaturedTracks(recommended=[],fallback=[]){return [...recommended,...fallback].filter((t,i,a)=>a.findIndex(x=>x.id===t.id)===i).slice(0,7);}
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
// One player button is moved between its desktop actions and mobile artist row.
// The title alone animates; no duplicated links or player event handlers.
function mountHomeFeatureCopy(feature,copy,motion){
 let animation=null,lastKey='',lastText=null,disposed=false;
 const update=()=>{
  if(disposed)return;
  const mobile=getComputedStyle(feature).getPropertyValue?.('--feature-mobile').trim()==='1';
  const button=copy.querySelector('.home-feature-play'),destination=copy.querySelector(mobile?'.home-feature-artist-row':'.home-feature-actions');
  if(button&&destination&&button.parentElement!==destination)destination.append(button);
  const link=copy.querySelector('.home-feature-title-row h2 a'),text=link?.querySelector('.home-feature-title-text');
  if(!text)return;
  const distance=mobile?Math.max(0,text.scrollWidth-link.clientWidth):0;
  const key=[text.textContent,link.clientWidth,distance,mobile,motion.matches].join('|');
  if(key===lastKey&&text===lastText)return;lastKey=key;lastText=text;animation?.cancel();animation=null;
  if(!mobile||motion.matches||distance<=1)return;
  const travel=distance/24*1000,total=travel+3300;
  animation=text.animate([{transform:'translateX(0)',offset:0},{transform:'translateX(0)',offset:1500/total},{transform:`translateX(${-distance}px)`,offset:(1500+travel)/total},{transform:`translateX(${-distance}px)`,offset:(3000+travel)/total},{transform:'translateX(0)',offset:1}],{duration:total,iterations:Infinity,easing:'linear'});
 };
 const observer=new ResizeObserver(update);observer.observe(copy);
 motion.addEventListener('change',update);document.fonts?.ready.then(update);update();
 return {update,cleanup(){disposed=true;observer.disconnect();motion.removeEventListener('change',update);animation?.cancel();}};
}
function mountFloatingHome(root,input){
 const tracks=input.filter((t,i,a)=>a.findIndex(x=>x.id===t.id)===i);if(!tracks.length)return;
 root.innerHTML=`<div class="home-feature home-floating" role="region" aria-roledescription="캐러셀" aria-label="추천 음악"><div class="home-feature-stage">${releaseHTML(tracks[0],tracks[1],tracks,0)}</div></div>`;
 if(!root.addEventListener)return;
 const feature=root.querySelector('.home-feature'),stage=feature.querySelector('.home-feature-covers'),copy=feature.querySelector('.home-feature-copy'),bg=feature.querySelector('.home-feature-background');
 const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 stage.innerHTML=tracks.map((t,i)=>`<a class="home-floating-card" data-float-card="${i}" data-track-id="${esc(t.id)}" href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보" draggable="false"><span class="home-floating-lean"><span class="home-floating-drift">${homeCover(t,'home-feature-art',true).replace('<img ','<img draggable="false" ')}</span></span></a>`).join('');
 const cards=[...stage.children];
 const copyLayout=mountHomeFeatureCopy(feature,copy,motion);
 if(tracks.length>1)stage.insertAdjacentHTML('beforeend',`<button type="button" class="home-feature-arrow home-feature-prev" aria-label="이전 추천곡">${icon('chevron')}</button><button type="button" class="home-feature-arrow home-feature-next" aria-label="다음 추천곡">${icon('chevron')}</button>`);
 if(tracks.length>1)stage.insertAdjacentHTML('beforeend',`<div class="home-feature-pagination"><button class="home-feature-autoplay" aria-label="자동 롤링 일시정지" aria-pressed="false">${icon('pause')}</button><div class="home-feature-dots" aria-label="추천곡 선택">${tracks.map((t,i)=>`<button data-home-slide="${i}" aria-label="${i+1}. ${esc(t.title)}" aria-pressed="${i===0}"></button>`).join('')}</div></div>`);
 // One compositing group caps total artwork opacity, including during crossfades.
 bg.innerHTML='<div class="home-floating-washes"><div class="home-floating-wash"></div><div class="home-floating-wash"></div></div>';
 const washes=[...bg.querySelector('.home-floating-washes').children],dots=[...feature.querySelectorAll('.home-feature-dots button')],animations=new Map();
 let index=0,timer=null,paused=false,hover=false,focus=false,start=null,suppressClick=false,disposed=false,busy=false,pending=null,washIndex=0;
 const measure=()=>{const mobile=getComputedStyle(feature).getPropertyValue?.('--feature-mobile').trim()==='1',thumb=document.querySelector?.('#home-recommended .album-art');return homeFloatGeometry(stage.clientWidth,tracks.length,mobile?Math.min(156,stage.clientWidth*.46):(thumb?.getBoundingClientRect().width||Math.min(198,stage.clientWidth*.36)));};
 let geometry=measure(),resizePending=false;
 const blocked=()=>paused||hover||focus||start!==null||document.hidden||motion.matches;
 const animate=(el,frames,duration=750)=>{
  animations.get(el)?.cancel();Object.assign(el.style,frames.at(-1));
  if(motion.matches)return null;
  const animation=el.animate(frames,{duration,easing:'cubic-bezier(0.22, 1, 0.36, 1)'});animations.set(el,animation);
  animation.onfinish=()=>{if(animations.get(el)===animation)animations.delete(el);};return animation;
 };
 // Decode before exposing either a cover or its background. Failed artwork stays navy.
 const ready=cards.map(card=>{
  const img=card.querySelector('img');if(!img)return Promise.resolve();
  return img.decode().then(()=>{if(!disposed){img.classList.add('is-decoded');const reflection=document.createElement('span');reflection.className='home-feature-reflection';reflection.setAttribute('aria-hidden','true');const reflected=img.cloneNode();reflected.alt='';reflection.append(reflected);card.querySelector('.home-floating-drift').append(reflection);}}).catch(()=>{if(!disposed){img.hidden=true;const label=card.querySelector('.cover-word');if(label)label.hidden=false;}});
 });
 const sync=()=>{const b=copy.querySelector('.home-feature-play');if(!b||typeof audio==='undefined')return;const playing=current?.id===tracks[index].id&&!audio.paused&&!audio.ended&&!window.AifectAudioAds?.active;b.innerHTML=icon(playing?'ui-pause-action':'ui-play-action');b.setAttribute('aria-pressed',String(playing));b.setAttribute('aria-label',tracks[index].title+(playing?' 일시정지':' 재생'));};
 const clear=()=>{clearTimeout(timer);timer=null;};
 const schedule=(freezeTransitions=true)=>{
  clear();feature.classList.toggle('is-floating-paused',blocked());
  for(const a of animations.values())if((freezeTransitions&&paused)||document.hidden)a.pause();else if(a.playState==='paused')a.play();
  if(motion.matches){for(const a of [...animations.values()])a.finish();}
  if(tracks.length>1&&!blocked()&&!disposed)timer=setTimeout(()=>{timer=null;if(!root.isConnected)return cleanup();go(index+1);},7000);
 };
 const state=slot=>({transform:homeFloatPose(slot,geometry),opacity:Math.abs(slot)<=geometry.radius?[1,.88,.60,.30,0][Math.min(4,Math.abs(slot))]:0,filter:`brightness(${[1,.78,.60,.44,.25][Math.min(4,Math.abs(slot))]}) blur(${[0,.2,.7,1.3,2][Math.min(4,Math.abs(slot))]}px)`});
 const paint=(previous=null,direction=1)=>{
  stage.style.setProperty('--feature-cover',geometry.size+'px');feature.style.setProperty('--feature-cover',geometry.size+'px');
  let transition=null;
  cards.forEach((card,i)=>{
   const slot=homeFloatSlot(i,index,tracks.length),old=homeFloatSlot(i,previous??index,tracks.length),visible=Math.abs(slot)<=geometry.radius;
   const end=state(slot),from={transform:getComputedStyle(card).transform,opacity:getComputedStyle(card).opacity,filter:getComputedStyle(card).filter};
   card.style.zIndex=String(20-Math.abs(slot));card.setAttribute('aria-current',String(slot===0));card.setAttribute('aria-hidden',String(!visible));card.tabIndex=visible?0:-1;card.style.pointerEvents=visible?'':'none';
   if(previous===null){Object.assign(card.style,end);return;}
   const frames=[from];
   if(Math.abs(slot-old)>tracks.length/2){
    // Reposition only while fully invisible outside the row; never cross its face.
    frames.push({...state(old-direction),opacity:0,offset:.45});
    frames.push({...state(slot+direction),opacity:0,offset:.55});
   }
   frames.push(end);const a=animate(card,frames);if(i===index)transition=a;
  });
  dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===index)));sync();return transition;
 };
 const background=(initial=false)=>{
  const next=initial?washIndex:1-washIndex,el=washes[next],old=washes[washIndex];
  el.replaceChildren();const source=cards[index].querySelector('img.is-decoded');
  if(source){const img=source.cloneNode();img.alt='';el.append(img);}
  if(initial){el.style.opacity=1;return;}
  el.style.zIndex='1';old.style.zIndex='0';old.style.opacity=1;
  const a=animate(el,[{opacity:0},{opacity:1}],900);washIndex=next;
  const finish=()=>{old.style.opacity=0;old.replaceChildren();};
  if(a){const done=a.onfinish;a.onfinish=()=>{done();finish();};}else finish();
  return a;
 };
 const finish=()=>{
  busy=false;if(resizePending){resizePending=false;geometry=measure();paint();}
  const target=pending;pending=null;if(target!==null&&target!==index)go(target);else if(timer===null)schedule();
 };
 const go=async value=>{
  const next=((value%tracks.length)+tracks.length)%tracks.length;
  if(busy){pending=next;return;}if(next===index){schedule();return;}
  busy=true;clear();await ready[next];if(disposed)return;
  const previous=index,direction=homeFloatSlot(next,index,tracks.length)<0?-1:1;index=next;
  const template=document.createElement('template');template.innerHTML=releaseHTML(tracks[index],null,tracks,index);
  copy.innerHTML=template.content.querySelector('.home-feature-copy').innerHTML;sync();copyLayout.update();
  const a=background();paint(previous,direction);
  if(a){const done=a.onfinish;a.onfinish=()=>{done();finish();};schedule(false);}else finish();
 };
 const click=e=>{
  if(suppressClick){suppressClick=false;e.preventDefault();e.stopPropagation();return;}
  const card=e.target.closest('[data-float-card]');if(card&&Number(card.dataset.floatCard)!==index){e.preventDefault();go(Number(card.dataset.floatCard));return;}
  const b=e.target.closest('button');if(!b)return;
  if(b.matches('.home-feature-prev'))go(index-1);
  else if(b.matches('.home-feature-next'))go(index+1);
  else if(b.hasAttribute('data-home-slide'))go(Number(b.dataset.homeSlide));
  else if(b.matches('.home-feature-autoplay')){paused=!paused;b.setAttribute('aria-pressed',String(paused));b.setAttribute('aria-label',paused?'자동 롤링 재개':'자동 롤링 일시정지');b.innerHTML=icon(paused?'play':'pause');schedule();}
 };
 const enter=e=>{if(e.pointerType&&e.pointerType!=='mouse')return;hover=true;schedule();},leave=()=>{hover=false;schedule();};
 const focusIn=e=>{focus=!!e.target.matches?.(':focus-visible')&&!e.target.closest('.home-feature-autoplay');schedule();},focusOut=e=>{focus=feature.contains(e.relatedTarget)&&!!e.relatedTarget?.matches?.(':focus-visible')&&!e.relatedTarget?.closest('.home-feature-autoplay');schedule();};
 const down=e=>{if(e.isPrimary===false||e.button>0)return;suppressClick=false;start={x:e.clientX,y:e.clientY};e.target?.setPointerCapture?.(e.pointerId);clear();};
 const up=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){suppressClick=true;go(index+(dx<0?1:-1));}else schedule();};
 const cancel=()=>{start=null;schedule();};
 const key=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();go(index+(e.key==='ArrowLeft'?-1:1));};
 const listeners=[['click',click],['pointerenter',enter],['pointerleave',leave],['focusin',focusIn],['focusout',focusOut],['pointerdown',down],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel],['keydown',key]];
 for(const [name,fn] of listeners)feature.addEventListener(name,fn);
 const resize=new ResizeObserver(()=>{if(busy){resizePending=true;for(const a of [...animations.values()])a.finish();}geometry=measure();paint();});resize.observe(stage);
 const recommended=document.querySelector?.('#home-recommended');if(recommended)resize.observe(recommended);
 const audioEvents=['play','pause','ended','emptied','loadedmetadata'];if(typeof audio!=='undefined')for(const name of audioEvents)audio.addEventListener(name,sync);
 const reschedule=()=>schedule();document.addEventListener('visibilitychange',reschedule);motion.addEventListener('change',reschedule);window.addEventListener('hashchange',cleanup);
 function cleanup(){disposed=true;clear();resize.disconnect();copyLayout.cleanup();for(const a of animations.values())a.cancel();animations.clear();for(const [name,fn] of listeners)feature.removeEventListener(name,fn);if(typeof audio!=='undefined')for(const name of audioEvents)audio.removeEventListener(name,sync);document.removeEventListener('visibilitychange',reschedule);motion.removeEventListener('change',reschedule);window.removeEventListener('hashchange',cleanup);}
 paint();feature.classList.add('is-ready');schedule();ready[0].then(()=>{if(!disposed&&index===0&&!busy)background(true);});return cleanup;
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
 const load=async([path,show,id])=>{const target=$('#'+id);try{const d=await api(path,'GET',undefined,{signal:controller.signal});if(!controller.signal.aborted&&id==='home-release'&&ticket===renderId&&target.isConnected&&revision!==apiRevision)return renderHome(ticket);if(active(target)){show(d);updateHomeAccount();}}catch{if(active(target)){if(id==='home-recommended'){featuredRecommended??=[];paintFeatured();}if(id==='home-release'){featuredCatalog??=[];paintFeatured();}}if(active(target)&&!displayed.has(target)){paint(target,'<div class="home-load-error"><p>음악을 불러오지 못했어요.</p><button class="small-button">다시 시도</button></div>');target.querySelector('button').onclick=()=>load([path,show,id]);if(id==='home-recommended')paint($('#home-discovery'),homeSection('발견','#discover')+'<a class="text-link" href="#discover">음악 둘러보기</a>');}}};
 const first=load(jobs[0]);for(const job of jobs.slice(1)){
  // The optional singing/community bridge is currently hidden by design.
  if(['home-sing','home-conversations'].includes(job[2])&&$('#home-bridge')?.hidden)continue;
  void load(job);
 }return first;
}
