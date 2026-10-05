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


function musicLayout(scope){try{return localStorage.getItem('aifect-music-layout-'+scope)==='list'?'list':'grid';}catch{return 'grid';}}
function coverCollectionHTML(items,scope='covers',own=false){
 const layout=musicLayout(scope);
 return '<section class="music-collection layout-'+layout+'" data-music-collection="'+esc(scope)+'"><div class="music-collection-toolbar"><span>'+items.length+'곡</span><div role="group" aria-label="커버 보기 방식">'+[['grid','격자'],['list','목록']].map(([key,label])=>'<button type="button" data-music-layout="'+key+'" aria-pressed="'+(layout===key)+'">'+musicLayoutIcon(key)+'<span>'+label+'</span></button>').join('')+'</div></div><div class="cover-collection-items">'+items.map(t=>coverCollectionItem(t,own)).join('')+'</div></section>';
}
function musicLayoutIcon(key){return key==='list'?icon('list'):'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>';}
function coverCollectionItem(t,own=false){
 const published=!own||t.status==='published',status=({published:'공개 중',draft:'작성 중',processing:'음원 처리 중',hidden:'비공개',failed:'처리 실패'})[t.status]||'준비 중',href=published?'#song/'+esc(t.id):'#manage/'+esc(t.id);
 return '<article class="cover-collection-item" data-music-id="'+esc(t.id)+'"><a class="cover-collection-art" href="'+href+'" aria-label="'+esc(t.title)+' '+(published?'곡 상세':'관리')+'">'+cover(t)+'<span class="music-kind">'+musicKind(t)+'</span></a><div class="cover-collection-copy"><h3><a href="'+href+'">'+esc(t.title)+'</a></h3>'+(t.producer_id?'<a class="cover-collection-person" href="#producer/'+esc(t.producer_id)+'">'+esc(t.producer||'음악가')+'</a>':'<span class="cover-collection-person">'+esc(t.producer||'음악가')+'</span>')+'<small>'+(own?status:number(t.plays||0)+'회 감상')+'</small>'+(published&&t.original_id?'<a class="cover-collection-origin" href="#song/'+esc(t.original_id)+'">원곡 보기 →</a>':'')+'</div><div class="cover-collection-actions">'+(published?'<button type="button" data-play="'+esc(t.id)+'" aria-label="'+esc(t.title)+' 재생">'+icon('play')+'<span>재생</span></button><button type="button" data-add="'+esc(t.id)+'" aria-label="'+esc(t.title)+' 플레이리스트에 담기">'+icon('list')+'<span>담기</span></button>':'')+(own?'<a href="#manage/'+esc(t.id)+'">관리</a>':'')+'</div>'+(published&&!own?'<footer class="cover-collection-social"><button type="button" data-like="'+esc(t.id)+'" aria-label="'+esc(t.title)+' 좋아요" aria-pressed="'+liked(t.id)+'">'+icon('heart')+'<span data-like-count>'+number(t.likes||0)+'</span></button><a href="#song/'+esc(t.id)+'?comments=1" aria-label="'+esc(t.title)+' 댓글">'+icon('message')+'<span>'+number(t.comments||0)+'</span></a>'+giftButton(t)+'</footer>':'')+(!own&&musicIsOpenDuet(t)&&t.user_id!==me?.id?'<a class="cover-collection-join" href="#sing/'+esc(t.original_id)+'?duet='+esc(t.id)+'">'+icon('mic')+' 듀엣 참여</a>':'')+'</article>';
}
if(typeof document!=='undefined')document.addEventListener('click',e=>{
 const button=e.target.closest('[data-music-layout]');if(!button)return;
 const collection=button.closest('[data-music-collection]'),layout=button.dataset.musicLayout;if(!collection||!['grid','list'].includes(layout))return;
 collection.classList.toggle('layout-grid',layout==='grid');collection.classList.toggle('layout-list',layout==='list');collection.querySelectorAll('[data-music-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 try{localStorage.setItem('aifect-music-layout-'+collection.dataset.musicCollection,layout);}catch{}
});
function profilePhotoHTML(p){return '<div class="social-profile-photo">'+(p.image_version?'<img src="/media/producer/'+encodeURIComponent(p.id)+'?v='+encodeURIComponent(p.image_version)+'" alt="'+esc(p.name)+' 프로필 사진" decoding="async">':'<span>'+esc((p.name||'음악가').slice(0,2))+'</span>')+'</div>';}
