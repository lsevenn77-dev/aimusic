// Song-header presentation only. Playback, recording and social actions keep
// their existing delegated data attributes and server permission checks.
const songDetailIsNative=typeof inApp!=='undefined'&&inApp;
const songDescriptionIsWeb=!songDetailIsNative&&!/AIFECT-Mobile\//i.test(globalThis.navigator?.userAgent||'');
const songDescriptionMoreLabel=songDescriptionIsWeb?'… 더보기':'+더보기';
function songCreatorDescription(t){
 const text=songDescriptionIsWeb?t.creator_description:t.description;
 return typeof text==='string'&&text.trim()?text:'';
}
function songDescriptionHTML(t){
 const text=songCreatorDescription(t),label=t.kind==='cover'?'커버 소개':'곡 소개';
 return text?'<section class="song-introduction" aria-label="'+label+'" data-song-description-track="'+esc(t.id)+'"><div class="song-introduction-heading"><h3>'+label+'</h3></div><p class="song-description" id="song-description-text"><span class="song-description-content">'+esc(text)+'</span><button type="button" class="text-link song-description-toggle" aria-controls="song-description-text" aria-expanded="false" hidden>'+songDescriptionMoreLabel+'</button></p></section>':'';
}
let songDescriptionBinding=null;
function bindSongDescription(){
 const root=document.querySelector('.song-introduction'),description=root?.querySelector('.song-description'),content=root?.querySelector('.song-description-content'),button=root?.querySelector('.song-description-toggle');
 const previous=songDescriptionBinding,expanded=previous?.track===root?.dataset.songDescriptionTrack&&previous?.expanded;
 previous?.release();
 if(!root||!description||!content||!button)return;
 const text=content.textContent||'',characters=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(text),part=>part.segment):Array.from(text);
 const nativeRemainder=songDescriptionIsWeb?null:document.createElement('p');
 if(nativeRemainder){
  nativeRemainder.className='song-introduction-rest';
  nativeRemainder.id='song-introduction-rest';
  nativeRemainder.hidden=true;
  root.parentElement.append(nativeRemainder);
  button.setAttribute('aria-controls',nativeRemainder.id);
 }
 const state={track:root.dataset.songDescriptionTrack,expanded:!!expanded,active:true,width:0,lineHeight:0,release:null};
 songDescriptionBinding=state;
 const paint=(force=false)=>{
  if(!state.active||!root.isConnected)return;
  const width=description.getBoundingClientRect().width;
  const lineHeight=parseFloat(getComputedStyle(description).lineHeight);
  if(!width||(!force&&width===state.width&&lineHeight===state.lineHeight))return;
  const focused=document.activeElement===button;
  state.width=width;
  state.lineHeight=lineHeight;
  description.style.minHeight='';
  root.classList.add('is-description-ready');
  content.textContent=text;
  button.hidden=true;
  const limit=lineHeight*2+1;
  const fits=()=>description.getBoundingClientRect().height<=limit;
  const overflow=!fits();
  if(!overflow)state.expanded=false;
  root.classList.toggle('is-expanded',state.expanded);
  button.setAttribute('aria-expanded',String(state.expanded));
  button.textContent=state.expanded&&songDescriptionIsWeb?'접기':songDescriptionMoreLabel;
  button.hidden=!overflow;
  if(nativeRemainder)nativeRemainder.hidden=!state.expanded;
  if(overflow&&(!state.expanded||nativeRemainder)){
   // Include the inline control in each fit check so it stays within two lines.
   const prefix=count=>characters.slice(0,count).join('').trimEnd();
   const suffix=nativeRemainder?'…':'';
   let low=0,high=characters.length;
   while(low<high){
    const middle=Math.ceil((low+high)/2);
    content.textContent=prefix(middle)+suffix;
    if(fits())low=middle;else high=middle-1;
   }
   const start=prefix(low);
   content.textContent=start+suffix;
   if(nativeRemainder&&state.expanded){
    description.style.minHeight=description.getBoundingClientRect().height+'px';
    content.textContent=start;
    button.textContent='+접기';
    nativeRemainder.textContent=text.slice(start.length);
   }
  }
  if(focused&&!button.hidden)button.focus({preventScroll:true});
 };
 button.onclick=()=>{state.expanded=!state.expanded;paint(true);};
 const resize=()=>paint(),observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
 observer?.observe(description);if(!observer)window.addEventListener('resize',resize);
 state.release=registerRouteCleanup(()=>{
  state.active=false;
  observer?.disconnect();
  if(!observer)window.removeEventListener('resize',resize);
  nativeRemainder?.remove();
  description.style.minHeight='';
  content.textContent=text;
  button.hidden=true;
  button.onclick=null;
  root.classList.remove('is-description-ready','is-expanded');
  if(songDescriptionBinding===state)songDescriptionBinding=null;
 });
 paint(true);document.fonts?.ready.then(()=>paint(true));
}
function songDetailMetricsHTML(t){
 return '<p class="song-metrics"><span class="metric-inline song-duration" aria-label="곡 길이 '+time(t.duration)+'">'+time(t.duration)+'</span><span class="metric-inline" aria-label="재생 '+number(t.plays||0)+'회">'+icon('ui-plays')+number(t.plays||0)+'</span><span class="metric-inline" data-song-comment-count aria-label="댓글 '+number(t.comments||0)+'개">'+icon('ui-comment')+number(t.comments||0)+'</span></p>';
}
function songActionIcon(name){
 // Header actions share one button surface. Reuse the shared glyphs without
 // the separate circular-action or metric wrappers used by music lists.
 const key=name==='sing'?'mic':name==='lyrics'?(songDetailIsNative?'list':'file-text'):name;
 const svg=icon(key),classes='song-action-icon song-action-icon-'+name;
 return svg.includes('class="')?svg.replace('class="','class="'+classes+' '):svg.replace('<svg ','<svg class="'+classes+'" ');
}
function songDetailCreditsHTML(t){
 if(t.kind==='cover')return songCredits(t);
 const producer=trackNickname(t,'producer')||'창작자',href=t.producer_id?'#producer/'+esc(t.producer_id):'';
 return '<div class="song-credits">'+(hasArtist(t)?'<div><span class="song-artist-label">AI ARTIST</span>'+credits(t)+'</div>':'')+
 '<div><span class="song-producer-label">PRODUCER</span>'+(href?'<a href="'+href+'">'+producer+'</a>':'<span class="song-producer-name">'+producer+'</span>')+'</div></div>';
}
function songLyricsButtonHTML(t){
 return '<button type="button" class="small-button song-action-lyrics" id="lyrics-expand" data-track="'+esc(t.id)+'" aria-controls="expanded-song-lyrics" aria-expanded="false"'+(t.lyrics_mode==='synced'||t.has_lyrics_text?'':' disabled title="아직 등록된 가사가 없습니다."')+'>'+songActionIcon('lyrics')+'<span>가사</span></button>';
}
function songDetailActionsHTML(t){
 const id=esc(t.id),mine=!!me&&t.user_id===me.id;
 const saveLabel=songDetailIsNative?'저장':'담기';
 const listen='<button type="button" class="primary-button song-action-listen" data-play="'+id+'" data-community-toggle aria-label="노래 듣기" aria-pressed="false">'+songActionIcon('play')+'<span>듣기</span></button>';
 const like='<button type="button" class="small-button song-action-like '+(liked(t.id)?'is-active':'')+'" data-like="'+id+'" aria-label="좋아요 '+number(t.likes||0)+'개" aria-pressed="'+liked(t.id)+'">'+songActionIcon('heart')+'<span>좋아요</span><span class="song-like-count" data-like-count>'+number(t.likes||0)+'</span></button>';
 const lyrics=songLyricsButtonHTML(t);
 const save=AifectPlaylist.isPlaylistEligibleTrack(t)?'<button type="button" class="small-button song-action-save" data-add="'+id+'">'+songActionIcon('plus')+'<span>'+saveLabel+'</span></button>':'';
 if(t.kind==='cover'){
  const remove=mine?'<button type="button" class="small-button danger-button" data-delete-track="'+id+'" data-track-title="'+esc(t.title)+'" data-track-kind="cover">커버 삭제</button>':'';
  const join=t.cover_mode==='duet'&&t.duet_open&&!mine?'<a class="text-link detail-duet-entry" href="#sing/'+esc(t.original_id)+'?duet='+id+'">'+songActionIcon('sing')+'듀엣 참여</a>':'';
  return '<div class="inline-actions song-actions cover-actions'+(mine?' cover-actions-owner':'')+'" role="group" aria-label="커버 작품 기능">'+listen+like+lyrics+(globalThis.AifectUnifiedPlaylists?save:'')+remove+'</div>'+join;
 }
 const sing=t.karaoke_ready?'<a class="primary-button song-action-sing" href="#sing/'+id+'" aria-label="노래 부르기">'+songActionIcon('sing')+'<span>부르기</span></a>':'';

 const gift=mine?'':'<button type="button" class="small-button gift-entry song-action-gift" data-gift="'+id+'" aria-label="선물">'+songActionIcon('gift')+'<span>선물</span></button>';
 const trailing=songDetailIsNative?'<button type="button" class="small-button song-action-more" data-track-menu="'+id+'" aria-label="더보기" aria-haspopup="dialog">'+songActionIcon('menu')+'</button>':'<button type="button" class="small-button song-action-share" data-song-share="'+id+'" aria-haspopup="dialog">'+songActionIcon('share-2')+'<span>공유</span></button>';
 return '<div class="song-action-groups" role="group" aria-label="곡 기능"><div class="inline-actions song-actions song-actions-primary">'+listen+sing+'</div><div class="inline-actions song-actions song-actions-secondary">'+like+lyrics+save+gift+trailing+'</div></div>';
}
function songDetailHeaderHTML(t){
 const isCover=t.kind==='cover',genres=isCover?'':(t.genres?.length?t.genres:[t.genre]).filter(Boolean).join(' · '),moderation=trackModerationToolsHTML(t);
 const options=isCover||songDetailIsNative?'':'<button type="button" class="text-link song-track-options" data-track-menu="'+esc(t.id)+'" aria-haspopup="dialog">곡 옵션</button>';
 let art=cover(t).replace('loading="lazy"','loading="eager" fetchpriority="high"');
 if(isCover){
  const change=me&&t.user_id===me.id?'<button type="button" class="small-button detail-photo-change">사진 변경</button><input type="file" hidden data-cover-photo="'+esc(t.id)+'" accept="image/jpeg,image/png,image/webp" aria-label="작품 커버사진 선택">':'';
  art='<div class="detail-cover-art">'+art+change+'</div>';
 }
 return '<section class="song-detail song-detail-refined'+(isCover?' cover-detail':'')+(genres?'':' song-detail-no-meta')+'">'+
 (genres?'<span class="eyebrow song-track-meta">'+esc(genres)+'</span>':'')+
 art+'<div class="song-detail-copy"><h1 class="song-title">'+esc(t.title)+'</h1>'+
 songDetailCreditsHTML(t)+songReleaseDateHTML(t)+'<div class="song-meta-row">'+songDetailMetricsHTML(t)+
 (moderation?'<div class="song-engagement">'+moderation+'</div>':'')+options+'</div>'+(isCover?'':'<div class="song-header-divider" aria-hidden="true"></div>')+
 songDescriptionHTML(t)+songDetailActionsHTML(t)+'</div></section>';
}
