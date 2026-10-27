// Song-header presentation only. Playback, recording and social actions keep
// their existing delegated data attributes and server permission checks.
const SONG_LEGACY_GUIDE_FINGERPRINTS=new Set([
 '245:a61cda3cf20c01c2', // Turn it up
 '249:26b322b910aca1a3', // Aftershock
 '261:1fe3c16dd55a8154', // Okinawa
 '253:51b0d98c815a13c9', // Blurry on purpose
 '260:c78b2a8675a2bf90', // Caught Ya!
 '246:62a798077bd721e8', // 한 번뿐이니까
 '252:c327f404418289e2', // 참 좋다
 '262:a9634f4852e8c38e', // 별일 아닌 것처럼
 '263:a9c0b353ce1d4d26', // 조금씩 멀어지고 있었나 봐
 '252:2afb568399f4deef', // 난 안 괜찮아
 '257:621a89fee184386e', // 금단증상
 '246:9a8c18631f0596b9', // 도깨비 신부
 '244:3923d0c6854e0970', // 조금 많이 좋아해서..
]);
function songDescriptionFingerprint(value){
 // A content fingerprint, not an authorship guess: edits no longer match.
 const text=value.replace(/\\r\\n|\\n|\\r|\r\n?/g,'\n').trim();
 let hash=0xcbf29ce484222325n;
 for(let i=0;i<text.length;i++)hash=BigInt.asUintN(64,(hash^BigInt(text.charCodeAt(i)))*0x100000001b3n);
 return text.length+':'+hash.toString(16);
}
function songCreatorDescription(t){
 if(typeof t.description!=='string')return '';
 const text=t.description.trim();
 if(!text||['없음','없어요','none','null','undefined','음악을 듣고 감상을 나눠보세요.'].includes(text.toLowerCase()))return '';
 return SONG_LEGACY_GUIDE_FINGERPRINTS.has(songDescriptionFingerprint(text))?'':text;
}
function songDescriptionHTML(t){
 const text=songCreatorDescription(t);
 return text?'<p class="song-description">'+esc(text)+'</p>':'';
}
function songActionIcon(name){
 const key=name==='sing'?'waveform':name;
 return icon(key).replace('<svg ','<svg class="song-action-icon song-action-icon-'+name+'" ');
}
function songDetailCreditsHTML(t){
 if(t.kind==='cover')return songCredits(t);
 const producer=esc(t.producer||'창작자'),href=t.producer_id?'#producer/'+esc(t.producer_id):'';
 return '<div class="song-credits">'+(hasArtist(t)?'<div><span>AI ARTIST</span>'+credits(t)+'</div>':'')+
 '<div><span class="song-producer-label">PRODUCER</span>'+(href?'<a href="'+href+'">'+producer+'</a>':'<span class="song-producer-name">'+producer+'</span>')+'</div></div>';
}
function songDetailActionsHTML(t){
 const id=esc(t.id),join=t.cover_mode==='duet'&&t.duet_open&&t.user_id!==me?.id,gift=t.user_id!==me?.id;
 const primary='<button type="button" class="primary-button song-action-listen" data-play="'+id+'">'+songActionIcon('play')+'<span>'+(me?'노래 듣기':'60초 미리 듣기')+'</span></button>'+
 (join?'<a class="primary-button song-action-sing" href="#sing/'+esc(t.original_id)+'?duet='+id+'">'+songActionIcon('sing')+'<span>듀엣 참여</span></a>':'')+
 (t.karaoke_ready?'<a class="primary-button song-action-sing" href="#sing/'+id+'">'+songActionIcon('sing')+'<span>노래 부르기</span></a>':'');
 const secondary='<button type="button" class="small-button song-action-like '+(liked(t.id)?'is-active':'')+'" data-like="'+id+'" aria-label="좋아요 '+number(t.likes||0)+'개" aria-pressed="'+liked(t.id)+'">'+songActionIcon('heart')+'<span>좋아요</span><span class="song-like-count" data-like-count>'+number(t.likes||0)+'</span></button>'+
 '<button type="button" class="small-button song-action-save" data-add="'+id+'">'+songActionIcon('plus')+'<span>저장</span></button>'+
 (gift?'<button type="button" class="small-button gift-entry song-action-gift" data-gift="'+id+'">'+songActionIcon('gift')+'<span>선물</span></button>':'');
 return '<div class="inline-actions song-actions"><div class="song-primary-actions'+(join||t.karaoke_ready?' has-sing':'')+'">'+primary+'</div><div class="song-secondary-actions'+(gift?' has-gift':'')+'">'+secondary+'</div></div>';
}
function songOwnerActionsHTML(t){
 if(t.kind!=='cover'||t.user_id!==me?.id)return '';
 return '<div class="song-owner-actions"><button type="button" class="small-button danger-button" data-delete-track="'+esc(t.id)+'" data-track-title="'+esc(t.title)+'" data-track-kind="cover">내 커버 삭제</button><a class="small-button" href="/api/covers/'+esc(t.id)+'/download">내 녹음 파일 저장</a></div>';
}
function songDetailHeaderHTML(t){
 const genres=(t.genres?.length?t.genres:[t.genre]).filter(Boolean).join(' · ');
 return '<section class="song-detail song-detail-refined">'+cover(t)+'<div class="song-detail-copy">'+
 '<span class="eyebrow song-track-meta">'+esc(genres)+(genres?' · ':'')+time(t.duration)+'</span><h2>'+esc(t.title)+'</h2>'+
 songDetailCreditsHTML(t)+songReleaseDateHTML(t)+songDescriptionHTML(t)+songDetailActionsHTML(t)+songOwnerActionsHTML(t)+
 '<p class="song-metrics">'+number(t.plays||0)+'회 감상 · '+number(t.comments||0)+'개 댓글'+(t.ai_comments?' · 공식 AI 응원 '+number(t.ai_comments)+'개':'')+'</p></div></section>';
}
