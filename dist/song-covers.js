// @ts-check
// Song-page lists share the existing routes, artwork, player, likes and track menu.
/** @param {string} trackId @param {string} trackTitle */
function songCoverPlayButton(trackId,trackTitle,playChild=false){
 const id=esc(trackId),title=esc(trackTitle);
 return `<button type="button" class="list-action song-cover-play${playChild?' play-duet-play':''}" data-play="${id}" data-community-toggle data-song-cover-toggle data-title="${title}" title="${title} 재생" aria-label="${title} 재생" aria-pressed="false"><span class="song-cover-play-art">${icon(playChild?'play':'ui-play-action')}<span class="song-cover-pause" hidden>${icon(playChild?'pause':'ui-pause-action')}</span></span></button>`;
}
/** @param {SongCover} t */
function songCoverRowHTML(t,{ranked=false,child=false,invitation=false,profile=false,playChild=false,songPage=false,position=0,entry=false}={}){
 const id=esc(t.id),title=esc(t.title),duet=t.cover_mode==='duet';
 const performer=(child||songPage)&&t.duet_partner?[t.duet_partner,t.producer].filter(Boolean).join(' & '):t.producer;
 const primary=songPage?esc(performer||'참여자'):playChild?esc(t.producer||'참여자'):title;
 const mode=duet?'듀엣':t.cover_mode==='solo'?'솔로':'';
 const metadata=songPage?mode:[performer,mode].filter(Boolean).join(' · ');
 const picked=songPage&&!!t.is_composer_pick,ordinal=picked?0:ranked?t.rank:position;
 const expandable=(t.completions||0)>0,story=songPage&&!entry&&(typeof inApp==='undefined'||!inApp);
 const join=invitation&&t.can_join?`<a class="list-action primary-button song-cover-join${profile||entry?'':' song-cover-join-icon'}" href="#sing/${esc(t.original_id)}?duet=${id}${entry?'&part='+esc(t.remaining_part):''}" title="${title} 참여하기" aria-label="${title} 참여하기">${icon('ui-plus-action')}${entry?'<span>참여하기</span>':''}</a>`:'';
 return `<article data-list-row class="song-cover-row${child?' song-cover-child':''}${playChild?' play-duet-child':''}${picked?' is-composer-pick':''}${entry?' song-entry-cover':''}${story?' song-story-cover-row':''}" data-song-cover="${id}">
  <a class="song-cover-detail${ordinal?' is-ranked':''}" href="#song/${id}" aria-label="${songPage?primary:title} 상세 보기">
   ${ordinal?`<span class="song-cover-rank" aria-label="${ordinal}${ranked?'위':'번'}">${ordinal}</span>`:''}
   <span class="song-cover-art">${cover(t,'mini-cover')}</span>
   <span class="song-cover-copy"><span class="song-cover-name"><strong title="${primary}">${songPage?trackPerformers(t):playChild?trackNickname(t,'producer'):primary}</strong>${picked?composerPickBadgeHTML():''}</span>
    ${playChild?'':`<span class="song-cover-meta" title="${esc(entry&&invitation?t.part_description:metadata)}">${entry&&invitation?esc(t.part_description):songPage?esc(metadata):trackPerformers(t)+(mode?' · '+mode:'')}</span>`}
   </span>
  </a>
  ${invitation?`<button type="button" class="list-action count-dropdown song-cover-expand" ${expandable?`data-cover-children="${id}" aria-controls="cover-children-${id}"`:'disabled'} aria-expanded="false" title="참여자 ${number(t.participants||0)}명 · 완성작 ${number(t.completions||0)}개"><span>${number(t.participants||0)}</span><span class="sr-only">명 참여</span><span data-cover-arrow aria-hidden="true">${icon('ui-chevron')}</span></button>`:''}
  ${profile&&!invitation&&!child?'<span class="mp-work-participants">0<span class="sr-only">명 참여</span></span>':''}
  ${story?join+`<div class="list-actions song-story-cover-actions">${musicRowActionsHTML(t,t.plays,'ui-plays',true)}</div>`:`
  ${songPage||(!profile&&!invitation&&!child)?`<button class="list-action song-cover-like" data-like="${id}" title="${primary} 좋아요" aria-label="${primary} 좋아요" aria-pressed="${liked(t.id)}">${icon('ui-heart')}<span data-like-count>${number(t.likes||0)}</span></button>`:''}
  ${!profile&&!invitation&&!child?`<span class="song-cover-plays" aria-label="재생 ${number(t.plays||0)}회">${icon('ui-plays')}${number(t.plays||0)}</span>`:''}
  ${entry&&!invitation?`<a class="list-action song-cover-comments" href="#song/${id}?comments=1" aria-label="댓글 ${number(t.comments||0)}개">${icon('ui-comment')}<span>${number(t.comments||0)}</span></a>`:''}
  <div class="list-actions">${join}
  ${songCoverPlayButton(t.id,entry&&invitation?'상대가 녹음한 파트 듣기':t.title,playChild)}
  <button type="button" class="list-action song-cover-more" data-track-menu="${id}" title="${title} 더보기" aria-label="${title} 더보기">${icon('ui-menu-action')}</button></div>`}
 </article>`;
}
/** @param {SongCover} t */
function songCoverItemHTML(t,view,position=1,entry=false){
 const row=songCoverRowHTML(t,{songPage:true,position,ranked:view==='all',invitation:view==='duet',child:view==='children',entry});
 if(view!=='duet')return row;
 return `<div class="song-cover-group">${row}${(t.completions||0)>0?`<div class="song-cover-children" id="cover-children-${esc(t.id)}" hidden></div>`:''}</div>`;
}
/** @param {SongCoverPage} d */
function songCoversMoreHTML(d,parent=''){
 return d.next_offset==null?'':`<button type="button" class="small-button song-cover-load" data-cover-load="${d.next_offset}" data-cover-view="${esc(d.view)}" data-cover-parent="${esc(parent)}" data-pick-revision="${d.pick?.revision||0}">더 보기</button>`;
}
/** @param {string} raw @returns {SongCoverTab} */
function songCoverTabFromRoute(raw){
 const tab=new URLSearchParams(raw.split('?')[1]).get('covers');
 return tab==='duet'||tab==='recent'?tab:'all';
}
/** @param {string} raw @param {SongCoverTab} [tab] */
function songCoverRoute(raw,tab){
 const [path,query]=raw.split('?'),params=new URLSearchParams(query);
 if(tab)params.set('covers',tab);else params.delete('covers');
 return params.size?path+'?'+params:path;
}
/** @param {SongCoverPage} d @param {SongCoverTab} tab */
function songCoverListHTML(d,tab){
 return (d.covers.length?d.covers.map((t,i)=>songCoverItemHTML(t,tab,i+1)).join(''):`<p class="empty-note">${tab==='duet'?'현재 참여 가능한 듀엣 모집곡이 없습니다.':'아직 공개된 완성 커버곡이 없습니다.'}</p>`)+songCoversMoreHTML(d);
}
/** @param {{id:string}} t @param {SongCoverPage|null} d @param {SongCoverTab} tab */
function songCoversPanelHTML(t,d,tab,webRoute=''){
 if(!d)return '';
 /** @type {[SongCoverTab,string][]} */
 const tabs=[['all','전체'],['duet','듀엣'],['recent','최근']];
 const route=webRoute||'song/'+t.id;
 const links=tabs.map(([key,label])=>`<a class="tab ${tab===key?'active':''}" href="#${esc(songCoverRoute(route,key))}" ${webRoute?'data-song-cover-tab="'+key+'"':''} ${tab===key?'aria-current="page"':''}>${label}<span class="song-cover-tab-count">${number(d.counts[key]||0)}</span></a>`).join('');
 // The first-paint guard recognizes these fragments before hashchange fires.
 const targets=webRoute?'<div hidden aria-hidden="true">'+[...new Set([route,songCoverRoute(route),...tabs.map(([key])=>songCoverRoute(route,key))])].map(raw=>{
  let id=raw;try{id=decodeURIComponent(raw);}catch{ id=new URLSearchParams('r='+raw.replaceAll('+','%2B').replaceAll('&','%26')).get('r')||raw; }
  return '<span data-song-cover-route-target id="'+esc(id)+'"></span>';
 }).join('')+'</div>':'';
 const list=songCoverListHTML(d,tab);
 const viewport=webRoute?`<div class="song-cover-viewport" aria-live="polite"><div class="song-cover-list">${list}</div></div>`:`<div class="song-cover-list" aria-live="polite">${list}</div>`;
 return `<section class="surface covers-panel song-covers-panel" data-cover-original="${esc(t.id)}" ${webRoute?'data-song-cover-tabs':''} ${songPickAttributes(d.pick)}>${targets}<div class="section-heading"><h2>커버곡</h2></div><nav class="tabs covers-sort" aria-label="이 곡의 커버 종류">${links}</nav>${viewport}</section>`;
}
/** @typedef {{list:HTMLElement, signature:string, checkedAt:number, counts:SongCoverPage['counts'], pick?:SongCoverPage['pick'], tracks?:SongCover[]}} CachedSongCoverTab */
/** @type {WeakMap<HTMLElement,{selectRoute:(raw:string)=>boolean, refresh:()=>Promise<void>}>} */
const songCoverTabPanels=new WeakMap();
const songCoverCacheAge=30000;
/** @param {SongCoverPage} page */
function songCoverPageSignature(page){
 return JSON.stringify([page.covers,page.total,page.next_offset,page.pick?.revision]);
}
/** @param {string} raw */
function refreshSongCoverRoute(raw){
 const panel=/** @type {HTMLElement|null} */(document.querySelector('[data-song-cover-tabs]'));
 return !!(panel&&songCoverTabPanels.get(panel)?.selectRoute(raw));
}
/** @param {SongCoverPage} initial @param {string} route */
function bindSongCoverTabs(initial,route){
 const panel=/** @type {HTMLElement|null} */(document.querySelector('[data-song-cover-tabs]'));if(!panel)return;
 const viewport=/** @type {HTMLElement} */(panel.querySelector('.song-cover-viewport'));
 const links=/** @type {NodeListOf<HTMLAnchorElement>} */(panel.querySelectorAll('[data-song-cover-tab]'));
 const base=songCoverRoute(route),account=me?.id||'guest',endpoint='/api/tracks/'+encodeURIComponent(panel.dataset.coverOriginal)+'/covers?view=';
 const isMounted=()=>panel.isConnected&&account===(me?.id||'guest');
 let active=songCoverTabFromRoute(route);
 /** @type {Map<SongCoverTab,CachedSongCoverTab>} */
 const cache=new Map([[active,{list:/** @type {HTMLElement} */(viewport.firstElementChild),signature:songCoverPageSignature(initial),checkedAt:Date.now(),counts:initial.counts,pick:initial.pick}]]);
 /** @type {Map<SongCoverTab,{controller:AbortController,promise:Promise<void>}>} */
 const pending=new Map();
 /** @param {CachedSongCoverTab} entry */
 function show(entry){
  if((entry.pick?.revision||0)>=Number(panel.dataset.pickRevision))applySongPickAttributes(panel,entry.pick);
  for(const link of links){
   const count=link.querySelector('.song-cover-tab-count'),value=number(entry.counts[link.dataset.songCoverTab]||0);
   if(count.textContent!==value)count.textContent=value;
  }
  if(viewport.firstElementChild!==entry.list){
   if(entry.tracks){
    remember(entry.tracks.filter(track=>!pendingLikes.has(track.id)));
    delete entry.tracks;
   }
   viewport.replaceChildren(entry.list);
   paintLikeButtons(entry.list);paintChartPlayback(entry.list);
  }
  viewport.style.minBlockSize='';
  viewport.removeAttribute('aria-busy');
 }
 /** @param {SongCoverTab} tab */
 function load(tab){
  const running=pending.get(tab);if(running)return running.promise;
  const controller=new AbortController(),{signal}=controller;
  const promise=(async()=>{
   const previous=cache.get(tab),read=(suffix='')=>api(endpoint+tab+suffix,'GET',undefined,{fresh:true,signal});
   let page=await read();
   const signature=songCoverPageSignature(page);
   if(!isMounted()||signal.aborted)return;
   let entry=previous;
   if(!entry||entry.signature!==signature){
    // Keep the range already revealed by “더 보기” when refreshing this tab.
    const shown=previous?.list.querySelectorAll(':scope > .song-cover-row,:scope > .song-cover-group').length||0;
    while(page.next_offset!==null&&page.covers.length<shown){
     const next=await read('&offset='+page.next_offset+'&pick_revision='+(page.pick?.revision||0));
     if(!isMounted()||signal.aborted)return;
     page={...next,covers:[...page.covers,...next.covers]};
    }
    const list=document.createElement('div');list.className='song-cover-list';list.innerHTML=songCoverListHTML(page,tab);
    entry={list,signature,checkedAt:0,counts:page.counts,pick:page.pick,tracks:page.covers};
   }
   // The public ranking and personal views can have different counts for
   // blocked performers. Compare counts against the same view's last result.
   if(previous&&(previous.pick?.revision!==page.pick?.revision||Object.keys(previous.counts).some(key=>previous.counts[key]!==page.counts[key]))){
    for(const [key,cached] of cache)if(key!==tab)cached.checkedAt=0;
   }
   entry.checkedAt=Date.now();entry.counts=page.counts;entry.pick=page.pick;cache.set(tab,entry);
   if(tab===active)show(entry);
  })().finally(()=>{if(pending.get(tab)?.controller===controller)pending.delete(tab);});
  pending.set(tab,{controller,promise});return promise;
 }
 function revalidate(){
  const tab=active,entry=cache.get(tab);
  if(!isMounted()||document.hidden||entry&&Date.now()-entry.checkedAt<songCoverCacheAge)return;
  void load(tab).catch(error=>{
   if(!isMounted()||error.name==='AbortError'||active!==tab||cache.has(tab))return;
   viewport.removeAttribute('aria-busy');
   viewport.innerHTML='<div class="song-cover-list"><p class="empty-note">'+esc(error.message)+'</p><button type="button" class="small-button song-cover-load" data-song-cover-retry>다시 시도</button></div>';
  });
 }
 /** @param {string} raw */
 function selectRoute(raw){
  if(!isMounted()||songCoverRoute(raw)!==base)return false;
  const tab=songCoverTabFromRoute(raw);if(tab===active)return true;
  active=tab;
  for(const link of links){
   const selected=link.dataset.songCoverTab===tab;
   link.classList.toggle('active',selected);
   if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  const entry=cache.get(tab);
  if(entry)show(entry);
  else{
   viewport.style.minBlockSize=viewport.getBoundingClientRect().height+'px';
   viewport.setAttribute('aria-busy','true');
   viewport.innerHTML='<div class="song-cover-list"><p class="empty-note" role="status">커버곡을 불러오는 중…</p></div>';
  }
  revalidate();
  return true;
 }
 function cancelReads(){for(const {controller} of pending.values())controller.abort();pending.clear();}
 songCoverTabPanels.set(panel,{selectRoute,refresh:()=>{
  cancelReads();for(const entry of cache.values())entry.checkedAt=0;
  return load(active);
 }});
 panel.addEventListener('click',event=>{
  if(!(event.target instanceof Element))return;
  const link=event.target.closest('[data-song-cover-tab][aria-current="page"]');
  if(link&&!event.button&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey)event.preventDefault();
  if(event.target.closest('[data-song-cover-retry]'))revalidate();
 });
 const timer=window.setInterval(revalidate,songCoverCacheAge/2);
 document.addEventListener('visibilitychange',revalidate);window.addEventListener('focus',revalidate);
 registerRouteCleanup(()=>{
  cancelReads();clearInterval(timer);songCoverTabPanels.delete(panel);
  document.removeEventListener('visibilitychange',revalidate);window.removeEventListener('focus',revalidate);
 });
}
function composerPickBadgeHTML(){return '<span class="composer-pick-badge" title="작곡가가 선택한 커버" aria-label="작곡가 PICK">'+icon('composer-pin')+'<span>PICK</span></span>';}
function songPickAttributes(pick){return `data-pick-id="${esc(pick?.cover_id||'')}" data-pick-exists="${!!(pick?.has_pick||pick?.cover_id)}" data-pick-revision="${pick?.revision||0}" data-pick-manage="${!!pick?.can_manage}" data-pick-performer="${esc([pick?.cover?.duet_partner,pick?.cover?.producer].filter(Boolean).join(' & ')||'표시할 수 없는 커버')}"`;}
let songCoverPlaybackBound=false;
function syncSongCoverPlayback(){
 /** @type {NodeListOf<HTMLButtonElement>} */(document.querySelectorAll('[data-song-cover-toggle]')).forEach(button=>{
  const playing=current?.id===button.dataset.play&&!audio.paused&&!audio.ended&&!window.AifectAudioAds?.active;
  button.setAttribute('aria-pressed',String(playing));
  button.setAttribute('aria-label',button.dataset.title+(playing?' 일시정지':' 재생'));
  button.setAttribute('title',button.dataset.title+(playing?' 일시정지':' 재생'));
  /** @type {HTMLElement} */(button.querySelector('.song-cover-pause')).hidden=!playing;
 });
}
/** @param {HTMLButtonElement} button @param {HTMLElement} target @param {boolean} expanded */
function setSongCoverExpanded(button,target,expanded){
 target.hidden=!expanded;button.setAttribute('aria-expanded',String(expanded));
 // Chevron direction follows aria-expanded in CSS; preserve its SVG path.
}
function bindSongCoverPlayback(){
 if(!songCoverPlaybackBound){songCoverPlaybackBound=true;for(const event of ['play','pause','ended','emptied','loadedmetadata'])audio.addEventListener(event,syncSongCoverPlayback);}
 syncSongCoverPlayback();
}
function bindSongCoverList(){
 const panel=/** @type {HTMLElement} */(document.querySelector('.song-covers-panel'));if(!panel)return;
 if(panel.hasAttribute('data-song-cover-tabs')||panel.querySelector('.song-story-cover-row'))bindChartPlayback();
 else bindSongCoverPlayback();
 if(panel.dataset.coverBound)return;panel.dataset.coverBound='true';
 panel.addEventListener('click',async event=>{
  if(!(event.target instanceof Element))return;
  const button=/** @type {HTMLButtonElement} */(event.target.closest('[data-cover-children],[data-cover-load]'));if(!button||button.disabled)return;
  // Row navigation is a sibling link, never a click handler around controls.
  event.preventDefault();event.stopPropagation();
  const parent=button.dataset.coverChildren||button.dataset.coverParent||'',view=parent?'children':button.dataset.coverView;
  const target=button.dataset.coverChildren?document.getElementById('cover-children-'+parent):button.parentElement;
  if(button.dataset.coverChildren&&target.dataset.loaded){setSongCoverExpanded(button,target,target.hidden);return;}
  button.disabled=true;button.setAttribute('aria-busy','true');
  try{
   const d=await api('/api/tracks/'+encodeURIComponent(panel.dataset.coverOriginal)+'/covers?view='+view+'&offset='+(button.dataset.coverLoad||0)+(parent?'&parent='+encodeURIComponent(parent):'')+'&pick_revision='+(button.dataset.pickRevision||panel.dataset.pickRevision||0));
   if(!panel.isConnected||!button.isConnected)return;
   remember(d.covers);
   const offset=Number(button.dataset.coverLoad||0);
   const html=d.covers.map((t,i)=>songCoverItemHTML(t,view,offset+i+1,panel.dataset.songEntry==='true')).join('')+songCoversMoreHTML(d,parent);
   if(button.dataset.coverChildren){target.innerHTML=html||'<p class="empty-note">아직 완성된 참여작 없음</p>';target.dataset.loaded='true';setSongCoverExpanded(button,target,true);}
   else {button.insertAdjacentHTML('beforebegin',html);button.remove();}
   if(panel.hasAttribute('data-song-cover-tabs')){paintLikeButtons(target);paintChartPlayback(target);}
   else {paintInteractions();syncSongCoverPlayback();syncChartPlayback();}
  }catch(error){if(!button.isConnected)return;if(error.status===409&&typeof refreshComposerPickPanel==='function')await refreshComposerPickPanel(panel);toast(error.message);}
  finally{button.disabled=false;button.removeAttribute('aria-busy');}
 });
}
