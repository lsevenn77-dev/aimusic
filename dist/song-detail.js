// Song-header presentation only. Playback, recording and social actions keep
// their existing delegated data attributes and server permission checks.
function songCreatorDescription(t){
 if(typeof t.description!=='string')return '';
 // The saved field is authoritative. Content cannot establish authorship.
 return t.description.trim()?t.description:'';
}
function songDescriptionHTML(t){
 const text=songCreatorDescription(t);
 return text?'<section class="song-introduction" aria-label="곡 소개" data-song-description-track="'+esc(t.id)+'"><div class="song-introduction-heading"><h3>곡 소개</h3></div><p class="song-description" id="song-description-text"><span class="song-description-content">'+esc(text)+'</span><button type="button" class="text-link song-description-toggle" aria-controls="song-description-text" aria-expanded="false" hidden>+더보기</button></p></section>':'';
}
let songDescriptionBinding=null;
function bindSongDescription(){
 const root=document.querySelector('.song-introduction'),description=root?.querySelector('.song-description'),content=root?.querySelector('.song-description-content'),button=root?.querySelector('.song-description-toggle');
 const previous=songDescriptionBinding,expanded=previous?.track===root?.dataset.songDescriptionTrack&&previous?.expanded;
 previous?.release();
 if(!root||!description||!content||!button)return;
 const text=content.textContent||'',characters=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(text),part=>part.segment):Array.from(text);
 const state={track:root.dataset.songDescriptionTrack,expanded:!!expanded,active:true,width:0,release:null};
 songDescriptionBinding=state;
 const paint=(force=false)=>{
  if(!state.active||!root.isConnected)return;
  const width=description.getBoundingClientRect().width;
  if(!width||(!force&&width===state.width))return;
  const focused=document.activeElement===button;
  state.width=width;root.classList.add('is-description-ready');content.textContent=text;button.hidden=true;
  const limit=parseFloat(getComputedStyle(description).lineHeight)*2+1,overflow=description.getBoundingClientRect().height>limit;
  if(!overflow)state.expanded=false;
  root.classList.toggle('is-expanded',state.expanded);button.setAttribute('aria-expanded',String(state.expanded));button.textContent=state.expanded?'접기':'+더보기';button.hidden=!overflow;
  if(overflow&&!state.expanded){
   // Fit the actual inline button with the preview, preserving the saved text.
   const preview=count=>characters.slice(0,count).join('').trimEnd()+'…';
   let low=0,high=characters.length;
   while(low<high){const middle=Math.ceil((low+high)/2);content.textContent=preview(middle);if(description.getBoundingClientRect().height<=limit)low=middle;else high=middle-1;}
   content.textContent=preview(low);
  }
  if(focused&&!button.hidden)button.focus({preventScroll:true});
 };
 button.onclick=()=>{state.expanded=!state.expanded;paint(true);};
 const resize=()=>paint(),observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
 observer?.observe(description);if(!observer)window.addEventListener('resize',resize);
 state.release=registerRouteCleanup(()=>{state.active=false;observer?.disconnect();if(!observer)window.removeEventListener('resize',resize);content.textContent=text;button.hidden=true;button.onclick=null;root.classList.remove('is-description-ready','is-expanded');if(songDescriptionBinding===state)songDescriptionBinding=null;});
 paint(true);document.fonts?.ready.then(()=>paint(true));
}
function songDetailMetricsHTML(t){
 return '<p class="song-metrics"><span class="metric-inline song-duration" aria-label="곡 길이 '+time(t.duration)+'">'+time(t.duration)+'</span><span class="metric-inline" aria-label="재생 '+number(t.plays||0)+'회">'+icon('ui-plays')+number(t.plays||0)+'</span><span class="metric-inline" aria-label="댓글 '+number(t.comments||0)+'개">'+icon('ui-comment')+number(t.comments||0)+'</span></p>';
}
function songActionIcon(name){
 // Header actions share one button surface. Reuse the shared glyphs without
 // the separate circular-action or metric wrappers used by music lists.
 const key=name==='sing'?'waveform':name==='lyrics'?'list':name;
 const svg=icon(key),classes='song-action-icon song-action-icon-'+name;
 return svg.includes('class="')?svg.replace('class="','class="'+classes+' '):svg.replace('<svg ','<svg class="'+classes+'" ');
}
function songDetailCreditsHTML(t){
 if(t.kind==='cover')return songCredits(t);
 const producer=esc(t.producer||'창작자'),href=t.producer_id?'#producer/'+esc(t.producer_id):'';
 return '<div class="song-credits">'+(hasArtist(t)?'<div><span class="song-artist-label">AI ARTIST</span>'+credits(t)+'</div>':'')+
 '<div><span class="song-producer-label">PRODUCER</span>'+(href?'<a href="'+href+'">'+producer+'</a>':'<span class="song-producer-name">'+producer+'</span>')+'</div></div>';
}
function songDetailActionsHTML(t){
 const id=esc(t.id),join=t.cover_mode==='duet'&&t.duet_open&&t.user_id!==me?.id,gift=t.user_id!==me?.id;
 const primary='<button type="button" class="primary-button song-action-listen" data-play="'+id+'">'+songActionIcon('play')+'<span>노래 듣기</span></button>'+
 (join?'<a class="small-button song-action-sing" href="#sing/'+esc(t.original_id)+'?duet='+id+'">'+songActionIcon('sing')+'<span>듀엣 참여</span></a>':'')+
 (t.karaoke_ready?'<a class="primary-button song-action-sing" href="#sing/'+id+'">'+songActionIcon('sing')+'<span>노래 부르기</span></a>':'');
 const secondary='<button type="button" class="small-button song-action-like '+(liked(t.id)?'is-active':'')+'" data-like="'+id+'" aria-label="좋아요 '+number(t.likes||0)+'개" aria-pressed="'+liked(t.id)+'">'+songActionIcon('heart')+'<span>좋아요</span><span class="song-like-count" data-like-count>'+number(t.likes||0)+'</span></button>'+
 '<button type="button" class="small-button song-action-save" data-add="'+id+'">'+songActionIcon('plus')+'<span>저장</span></button>'+
 (gift?'<button type="button" class="small-button gift-entry song-action-gift" data-gift="'+id+'">'+songActionIcon('gift')+'<span>선물</span></button>':'')+
 '<button type="button" class="small-button song-action-lyrics" id="lyrics-expand" data-track="'+id+'" aria-controls="expanded-song-lyrics" aria-expanded="false"'+(t.lyrics_mode==='synced'?'':' disabled title="아직 등록된 가사가 없습니다."')+'>'+songActionIcon('lyrics')+'<span>가사</span></button>';
 return '<div class="inline-actions song-actions" role="group" aria-label="곡 기능">'+primary+secondary+'</div>';
}
function songOwnerActionsHTML(t){
 if(t.kind!=='cover'||t.user_id!==me?.id)return '';
 return '<div class="song-owner-actions"><button type="button" class="small-button danger-button" data-delete-track="'+esc(t.id)+'" data-track-title="'+esc(t.title)+'" data-track-kind="cover">내 커버 삭제</button><a class="small-button" href="/api/covers/'+esc(t.id)+'/download">내 녹음 파일 저장</a></div>';
}
function songDetailHeaderHTML(t){
 const genres=(t.genres?.length?t.genres:[t.genre]).filter(Boolean).join(' · '),moderation=trackModerationToolsHTML(t);
 return '<section class="song-detail song-detail-refined'+(genres?'':' song-detail-no-meta')+'">'+
 (genres?'<span class="eyebrow song-track-meta">'+esc(genres)+'</span>':'')+
 cover(t).replace('loading="lazy"','loading="eager" fetchpriority="high"')+'<div class="song-detail-copy"><h1 class="song-title">'+esc(t.title)+'</h1>'+
 songDetailCreditsHTML(t)+songReleaseDateHTML(t)+'<div class="song-meta-row">'+songDetailMetricsHTML(t)+
 (moderation?'<div class="song-engagement">'+moderation+'</div>':'')+'</div><div class="song-header-divider" aria-hidden="true"></div>'+
 songDescriptionHTML(t)+songDetailActionsHTML(t)+songOwnerActionsHTML(t)+'</div></section>';
}
