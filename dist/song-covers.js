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
 const expandable=(t.completions||0)>0;
 return `<article data-list-row class="song-cover-row${child?' song-cover-child':''}${playChild?' play-duet-child':''}${picked?' is-composer-pick':''}${entry?' song-entry-cover':''}" data-song-cover="${id}">
  <a class="song-cover-detail${ordinal?' is-ranked':''}" href="#song/${id}" aria-label="${songPage?primary:title} 상세 보기">
   ${ordinal?`<span class="song-cover-rank" aria-label="${ordinal}${ranked?'위':'번'}">${ordinal}</span>`:''}
   <span class="song-cover-art">${cover(t,'mini-cover')}</span>
   <span class="song-cover-copy"><span class="song-cover-name"><strong title="${primary}">${songPage?trackPerformers(t):playChild?trackNickname(t,'producer'):primary}</strong>${picked?composerPickBadgeHTML():''}</span>
    ${playChild?'':`<span class="song-cover-meta" title="${esc(entry&&invitation?t.part_description:metadata)}">${entry&&invitation?esc(t.part_description):songPage?esc(metadata):trackPerformers(t)+(mode?' · '+mode:'')}</span>`}
   </span>
  </a>
  ${invitation?`<button type="button" class="list-action count-dropdown song-cover-expand" ${expandable?`data-cover-children="${id}" aria-controls="cover-children-${id}"`:'disabled'} aria-expanded="false" title="참여자 ${number(t.participants||0)}명 · 완성작 ${number(t.completions||0)}개"><span>${number(t.participants||0)}</span><span class="sr-only">명 참여</span><span data-cover-arrow aria-hidden="true">${icon('ui-chevron')}</span></button>`:''}
  ${profile&&!invitation&&!child?'<span class="mp-work-participants">0<span class="sr-only">명 참여</span></span>':''}
  ${songPage||(!profile&&!invitation&&!child)?`<button class="list-action song-cover-like" data-like="${id}" title="${primary} 좋아요" aria-label="${primary} 좋아요" aria-pressed="${liked(t.id)}">${icon('ui-heart')}<span data-like-count>${number(t.likes||0)}</span></button>`:''}
  ${!profile&&!invitation&&!child?`<span class="song-cover-plays" aria-label="재생 ${number(t.plays||0)}회">${icon('ui-plays')}${number(t.plays||0)}</span>`:''}
  ${entry&&!invitation?`<a class="list-action song-cover-comments" href="#song/${id}?comments=1" aria-label="댓글 ${number(t.comments||0)}개">${icon('ui-comment')}<span>${number(t.comments||0)}</span></a>`:''}
  <div class="list-actions">
  ${invitation&&t.can_join?`<a class="list-action primary-button song-cover-join${profile||entry?'':' song-cover-join-icon'}" href="#sing/${esc(t.original_id)}?duet=${id}${entry?'&part='+esc(t.remaining_part):''}" title="${title} 참여하기" aria-label="${title} 참여하기">${icon('ui-plus-action')}${entry?'<span>참여하기</span>':''}</a>`:''}
  ${songCoverPlayButton(t.id,entry&&invitation?'상대가 녹음한 파트 듣기':t.title,playChild)}
  <button type="button" class="list-action song-cover-more" data-track-menu="${id}" title="${title} 더보기" aria-label="${title} 더보기">${icon('ui-menu-action')}</button></div>
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
/** @param {{id:string}} t @param {SongCoverPage} d */
function songCoversPanelHTML(t,d,tab){
 if(!d)return '';
 const tabs=[['all','전체'],['duet','듀엣'],['recent','최근']];
 return `<section class="surface covers-panel song-covers-panel" data-cover-original="${esc(t.id)}" ${songPickAttributes(d.pick)}><div class="section-heading"><h2>커버곡</h2></div><nav class="tabs covers-sort" aria-label="이 곡의 커버 종류">${tabs.map(([key,label])=>`<a class="tab ${tab===key?'active':''}" href="#song/${esc(t.id)}?covers=${key}" ${tab===key?'aria-current="page"':''}>${label}<span class="song-cover-tab-count">${number(d.counts[key]||0)}</span></a>`).join('')}</nav><div class="song-cover-list" aria-live="polite">${d.covers.length?d.covers.map((t,i)=>songCoverItemHTML(t,tab,i+1)).join(''):`<p class="empty-note">${tab==='duet'?'현재 참여 가능한 듀엣 모집곡이 없어요.':'아직 공개된 완성 커버곡이 없어요.'}</p>`}${songCoversMoreHTML(d)}</div></section>`;
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
 bindSongCoverPlayback();
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
   paintInteractions();syncSongCoverPlayback();
  }catch(error){if(error.status===409&&typeof refreshComposerPickPanel==='function')await refreshComposerPickPanel(panel);toast(error.message);}
  finally{button.disabled=false;button.removeAttribute('aria-busy');}
 });
}
