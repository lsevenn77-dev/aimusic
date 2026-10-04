// One listening/saving contract for originals, solo covers and duets.
function musicKind(t){return t.kind==='cover'?(t.cover_mode==='duet'?'듀엣':'커버'):'제작곡';}
function musicIsOpenDuet(t){return t.kind==='cover'&&t.cover_mode==='duet'&&(t.duet_open===true||t.duet_open===1);}
function musicProfileItems(d,tab='all'){
 const originals=d.tracks||[],covers=d.covers||[];
 const all=[...new Map([...originals,...covers].map(t=>[t.id,t])).values()].sort((a,b)=>(Number(b.created)||0)-(Number(a.created)||0));
 return tab==='tracks'?originals:tab==='covers'?covers:tab==='duets'?covers.filter(t=>t.cover_mode==='duet'):all;
}
function playlistSaveButton(t){return `<button type="button" class="small-button music-save" data-add="${esc(t.id)}" aria-label="${esc(t.title)} 플레이리스트에 담기">${icon('list')}<span>플레이리스트 담기</span></button>`;}
function musicPerson(t){const p={id:t.producer_id,name:t.producer||'음악가',image_version:t.producer_image_version||''};return p;}
function musicTrackCard(t,{social=true}={}){
 const p=musicPerson(t),own=!!me&&t.user_id===me.id;
 const author=p.id?`<a class="music-author" href="#producer/${esc(p.id)}">${portrait(p,'producer')}<span><strong>${esc(p.name)}</strong><small>${musicKind(t)} 공개</small></span></a>`:`<span class="music-author"><strong>${esc(p.name)}</strong></span>`;
 const participate=musicIsOpenDuet(t)&&!own?`<a class="music-participate" href="#sing/${esc(t.original_id)}?duet=${esc(t.id)}">${icon('mic')} 이 듀엣에 참여하기 ${icon('arrow')}</a>`:'';
 return `<article class="music-card${social?'':' music-card-compact'}" data-music-id="${esc(t.id)}"><header>${author}${social&&p.id&&!own?`<button class="small-button music-follow" data-follow="producer/${esc(p.id)}" aria-pressed="${followed('producer',p.id)}">${followed('producer',p.id)?'팔로잉':'팔로우'}</button>`:''}</header><div class="music-card-body"><a class="music-art" href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 상세">${cover(t)}</a><div class="music-copy"><span class="music-kind">${musicKind(t)}${t.genre?' · '+esc(t.genre):''}</span><h3><a href="#song/${esc(t.id)}">${esc(t.title)}</a></h3><p>${esc(t.description||'좋은 음악을 발견했다면, 내 플레이리스트로.')}</p>${t.kind==='cover'?`<a class="music-origin" href="#song/${esc(t.original_id)}">원곡 · ${esc(t.original_title||'원곡 듣기')}</a>`:`<div class="music-origin">${credits(t)}</div>`}</div></div><div class="music-primary-actions"><button type="button" class="primary-button" data-play="${esc(t.id)}">${icon('play')} 재생</button>${playlistSaveButton(t)}</div>${social?`<footer class="music-social-actions"><button class="text-link ${liked(t.id)?'is-active':''}" data-like="${esc(t.id)}" aria-label="${esc(t.title)} 좋아요" aria-pressed="${liked(t.id)}">${icon('heart')}<span data-like-count>${number(t.likes||0)}</span></button><a class="text-link" href="#song/${esc(t.id)}?comments=1">${icon('message')} 댓글 ${number(t.comments||0)}</a>${!own?giftButton(t):''}<span class="music-plays">${number(t.plays||0)}회 감상</span></footer>${participate}`:''}</article>`;
}
function musicListeningShortcuts(){return `<nav class="music-shortcuts" aria-label="내 음악 바로가기"><a href="#library/playlists">${icon('list')}<span>내 플레이리스트</span></a><a href="#library/likes">${icon('heart')}<span>좋아요한 음악</span></a><a href="#history">${icon('clock')}<span>최근 감상</span></a></nav>`;}
function musicMyShortcuts(){return `<nav class="music-my-links" aria-label="내 음악과 계정"><a href="#library/playlists">${icon('list')} 내 플레이리스트</a><a href="#library/likes">${icon('heart')} 좋아요한 음악</a><a href="#history">${icon('clock')} 최근 감상</a><a href="#studio">${icon('sliders')} 업로드 관리</a><a href="#karaoke/drafts">${icon('mic')} 녹음 초안</a><a href="#account">${icon('settings')} 계정 · 이용권</a></nav>`;}

function peopleListHTML(items,kind='producer'){
 return '<div class="people-list">'+items.map(p=>{
  const pid=p.target_id||p.id,href=pid?'#'+kind+'/'+encodeURIComponent(pid):'#follower/'+encodeURIComponent(p.user_id);
  return '<a class="surface people-list-row" href="'+esc(href)+'" aria-label="'+esc(p.name)+' 페이지 보기">'+portrait(p,kind)+'<span class="people-list-copy"><strong>'+esc(p.name)+'</strong><small>'+esc(p.bio||'음악으로 만나요.')+'</small></span>'+icon('chevron')+'</a>';
 }).join('')+'</div>';
}
function listenerProfileHTML(p){return '<section class="surface listener-profile">'+portrait(p,'producer')+'<h2>'+esc(p.name)+'</h2><p>'+esc(p.bio||'좋아하는 음악을 함께 듣고 있어요.')+'</p><p class="field-help">아직 공개한 음악이 없어요.</p></section>';}
