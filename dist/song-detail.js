// Song-header presentation only. Playback, recording and social actions keep
// their existing delegated data attributes and server permission checks.
function songCreatorDescription(t){
 if(typeof t.description!=='string')return '';
 // The saved field is authoritative. Content cannot establish authorship.
 return t.description.trim()?t.description:'';
}
function songDescriptionHTML(t){
 const text=songCreatorDescription(t);
 return text?'<section class="song-introduction" aria-label="곡 소개"><h3>곡 소개</h3><p class="song-description">'+esc(text)+'</p></section>':'';
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
 return '<div class="song-credits">'+(hasArtist(t)?'<div><span>AI ARTIST</span>'+credits(t)+'</div>':'')+
 '<div><span class="song-producer-label">PRODUCER</span>'+(href?'<a href="'+href+'">'+producer+'</a>':'<span class="song-producer-name">'+producer+'</span>')+'</div></div>';
}
function songDetailActionsHTML(t){
 const id=esc(t.id),join=t.cover_mode==='duet'&&t.duet_open&&t.user_id!==me?.id,gift=t.user_id!==me?.id;
 const primary='<button type="button" class="small-button song-action-listen" data-play="'+id+'">'+songActionIcon('play')+'<span>'+(me?'노래 듣기':'60초 미리 듣기')+'</span></button>'+
 (join?'<a class="small-button song-action-sing" href="#sing/'+esc(t.original_id)+'?duet='+id+'">'+songActionIcon('sing')+'<span>듀엣 참여</span></a>':'')+
 (t.karaoke_ready?'<a class="small-button song-action-sing" href="#sing/'+id+'">'+songActionIcon('sing')+'<span>노래 부르기</span></a>':'');
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
 const genres=(t.genres?.length?t.genres:[t.genre]).filter(Boolean).join(' · ');
 return '<section class="song-detail song-detail-refined">'+cover(t).replace('loading="lazy"','loading="eager" fetchpriority="high"')+'<div class="song-detail-copy">'+
 '<span class="eyebrow song-track-meta">'+esc(genres)+(genres?' · ':'')+time(t.duration)+'</span><h2>'+esc(t.title)+'</h2>'+
 songDetailCreditsHTML(t)+songReleaseDateHTML(t)+songDescriptionHTML(t)+songDetailActionsHTML(t)+songOwnerActionsHTML(t)+
 '<div class="song-engagement"><p class="song-metrics"><span class="metric-inline" aria-label="재생 '+number(t.plays||0)+'회">'+icon('ui-plays')+number(t.plays||0)+'</span><span class="metric-inline" aria-label="댓글 '+number(t.comments||0)+'개">'+icon('ui-comment')+number(t.comments||0)+'</span>'+(t.ai_comments?' · 공식 AI 응원 '+number(t.ai_comments)+'개':'')+'</p>'+trackModerationToolsHTML(t)+'</div></div></section>';
}
