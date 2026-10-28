// @ts-check
// Song-page lists share the existing routes, artwork, player, likes and track menu.
/** @param {SongCover} t */
function songCoverRowHTML(t,{ranked=false,child=false,invitation=false,profile=false}={}){
 const id=esc(t.id),title=esc(t.title),duet=t.cover_mode==='duet';
 const performer=child&&t.duet_partner?[t.duet_partner,t.producer].filter(Boolean).join(' & '):t.producer;
 const metadata=[performer,duet?'듀엣':t.cover_mode==='solo'?'솔로':''].filter(Boolean).join(' · ');
 const expandable=(t.completions||0)>0;
 return `<article data-list-row class="song-cover-row${child?' song-cover-child':''}" data-song-cover="${id}">
  <a class="song-cover-detail${ranked?' is-ranked':''}" href="#song/${id}" aria-label="${title} 상세 보기">
   ${ranked?`<span class="song-cover-rank" aria-label="${t.rank}위">${t.rank}</span>`:''}
   <span class="song-cover-art">${cover(t,'mini-cover')}</span>
   <span class="song-cover-copy"><strong title="${title}">${title}</strong>
    <span class="song-cover-meta" title="${esc(metadata)}">${esc(metadata)}</span>
   </span>
  </a>
  ${invitation?`<button type="button" class="list-action count-dropdown song-cover-expand" ${expandable?`data-cover-children="${id}" aria-controls="cover-children-${id}"`:'disabled'} aria-expanded="false" title="참여자 ${number(t.participants||0)}명 · 완성작 ${number(t.completions||0)}개"><span>${number(t.participants||0)}</span><span class="sr-only">명 참여</span><span data-cover-arrow aria-hidden="true">${icon('ui-chevron')}</span></button>`:''}
  ${profile&&!invitation&&!child?'<span class="mp-work-participants">0<span class="sr-only">명 참여</span></span>':''}
  ${!profile&&!invitation&&!child?`<button class="list-action song-cover-like" data-like="${id}" title="${title} 좋아요" aria-label="${title} 좋아요" aria-pressed="${liked(t.id)}">${icon('ui-heart')}<span data-like-count>${number(t.likes||0)}</span></button><span class="song-cover-plays" aria-label="재생 ${number(t.plays||0)}회">${icon('ui-plays')}${number(t.plays||0)}</span>`:''}
  <div class="list-actions">
  ${invitation&&t.can_join?`<a class="list-action primary-button song-cover-join${profile?'':' song-cover-join-icon'}" href="#sing/${esc(t.original_id)}?duet=${id}" title="${title} 참여하기" aria-label="${title} 참여하기">${icon('ui-plus-action')}</a>`:''}
  <button type="button" class="list-action song-cover-play" data-play="${id}" data-community-toggle data-song-cover-toggle data-title="${title}" title="${title} 재생" aria-label="${title} 재생" aria-pressed="false"><span class="song-cover-play-art">${icon('ui-play-action')}<span class="song-cover-pause" hidden>${icon('ui-pause-action')}</span></span></button>
  <button type="button" class="list-action song-cover-more" data-track-menu="${id}" title="${title} 더보기" aria-label="${title} 더보기">${icon('ui-menu-action')}</button></div>
 </article>`;
}
/** @param {SongCover} t */
function songCoverItemHTML(t,view){
 const row=songCoverRowHTML(t,{ranked:view==='all',invitation:view==='duet',child:view==='children'});
 if(view!=='duet')return row;
 return `<div class="song-cover-group">${row}${(t.completions||0)>0?`<div class="song-cover-children" id="cover-children-${esc(t.id)}" hidden></div>`:''}</div>`;
}
/** @param {SongCoverPage} d */
function songCoversMoreHTML(d,parent=''){
 return d.next_offset==null?'':`<button type="button" class="small-button song-cover-load" data-cover-load="${d.next_offset}" data-cover-view="${esc(d.view)}" data-cover-parent="${esc(parent)}">더 보기</button>`;
}
/** @param {{id:string}} t @param {SongCoverPage} d */
function songCoversPanelHTML(t,d,tab){
 if(!d)return '';
 const tabs=[['all','전체'],['duet','듀엣'],['recent','최근']];
 return `<section class="surface covers-panel song-covers-panel" data-cover-original="${esc(t.id)}"><div class="section-heading"><h2>커버곡</h2>${d.accepts_covers?`<a class="small-button" href="#cover/${esc(t.id)}">${icon('ui-plus-action')} 이 곡 커버 올리기</a>`:''}</div><nav class="tabs covers-sort" aria-label="이 곡의 커버 종류">${tabs.map(([key,label])=>`<a class="tab ${tab===key?'active':''}" href="#song/${esc(t.id)}?covers=${key}" ${tab===key?'aria-current="page"':''}>${label}<span class="song-cover-tab-count">${number(d.counts[key]||0)}</span></a>`).join('')}</nav><div class="song-cover-list" aria-live="polite">${d.covers.length?d.covers.map(t=>songCoverItemHTML(t,tab)).join(''):`<p class="empty-note">${tab==='duet'?'현재 참여 가능한 듀엣 모집곡이 없어요.':'아직 공개된 완성 커버곡이 없어요.'}</p>`}${songCoversMoreHTML(d)}</div></section>`;
}
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
 bindSongCoverPlayback();
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
   const d=await api('/api/tracks/'+encodeURIComponent(panel.dataset.coverOriginal)+'/covers?view='+view+'&offset='+(button.dataset.coverLoad||0)+(parent?'&parent='+encodeURIComponent(parent):''));
   if(!panel.isConnected)return;
   remember(d.covers);
   const html=d.covers.map(t=>songCoverItemHTML(t,view)).join('')+songCoversMoreHTML(d,parent);
   if(button.dataset.coverChildren){target.innerHTML=html||'<p class="empty-note">아직 완성된 참여작 없음</p>';target.dataset.loaded='true';setSongCoverExpanded(button,target,true);}
   else {button.insertAdjacentHTML('beforebegin',html);button.remove();}
   paintInteractions();syncSongCoverPlayback();
  }catch(error){toast(error.message);}
  finally{button.disabled=false;button.removeAttribute('aria-busy');}
 });
}
