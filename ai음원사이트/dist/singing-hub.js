function singingHubTiles(tracks){return tracks.length?tracks.map(t=>`<article class="hub-song-tile"><a href="#song/${esc(t.id)}">${cover(t,'mini-cover')}</a><div><a href="#song/${esc(t.id)}"><strong>${esc(t.title)}</strong></a><span>${credits(t)}</span></div><a class="hub-sing-plus" href="#sing/${esc(t.id)}" aria-label="${esc(t.title)} 부르기">${icon('plus')}</a></article>`).join(''):'<p class="hub-empty">조건에 맞는 곡이 없어요. 검색어나 필터를 바꿔보세요.</p>';}
function singingHubHTML(tracks,covers,duets){
 const quick=(type,title,desc,glyph)=>`<a class="hub-quick ${type}" href="#karaoke/${type==='duet'?'duets':'songs'}"><span class="hub-quick-symbol">${icon(glyph)}</span><span><strong>${title} ${icon('chevron')}</strong><small>${desc}</small></span><span class="hub-quick-arrow">${icon('arrow')}</span></a>`;
 const header=(title,sub,href)=>`<header class="hub-panel-heading"><div><h2>${title}</h2><p>${sub}</p></div><a href="${href}">더보기 ${icon('chevron')}</a></header>`;
 return `<div class="singing-hub"><section class="hub-intro"><div><h1>부르기</h1><h2>듣기만 하던 음악, 이번에는 내 목소리로.</h2><p>좋아하는 노래를, 나의 목소리로 다시 불러보세요.</p></div><span class="hub-intro-note">좋아하는 노래를<br>나의 목소리로, 다시.</span></section>
 ${singingHubNav()}
 <div class="hub-quick-grid">${quick('original','바로 부르기','지금 원하는 곡을 골라<br>나의 목소리로 불러보세요.','mic')}${quick('duet','듀엣 참여하기','누군가의 목소리가<br>당신을 기다리고 있어요.','users')}<a class="hub-quick drafts" href="#karaoke/drafts"><span class="hub-quick-symbol">${icon('edit')}</span><span><strong>내 초안 이어서 ${icon('chevron')}</strong><small>저장해 둔 초안을 이어서<br>완성해보세요.</small></span><span class="hub-quick-arrow">${icon('arrow')}</span></a></div>
 <div class="hub-panels"><section class="hub-panel hub-covers">${header('추천 커버','새롭게 공개된 목소리를 만나보세요.','#community/covers')}<div class="hub-cover-grid">${covers.length?covers.slice(0,4).map(t=>`<article><div class="hub-cover-art"><a href="#song/${esc(t.id)}">${cover(t)}</a><button data-play="${esc(t.id)}" aria-label="${esc(t.title)} 듣기">${icon('play')}</button><span>${time(t.duration)}</span></div><a href="#song/${esc(t.id)}"><strong>${esc(t.title)}</strong></a><a class="hub-artist" href="#producer/${esc(t.producer_id)}">${esc(t.producer)}</a><div class="hub-stats"><span>${icon('play')} ${number(t.plays||0)}</span><span>${icon('heart')} ${number(t.likes||0)}</span></div></article>`).join(''):'<p class="hub-empty">첫 커버의 주인공이 되어보세요.<br>공개된 커버가 여기에 모여요.</p>'}</div></section>
 <section class="hub-panel hub-popular">${header('인기 곡','원곡 재생과 좋아요로 만나는 인기 곡.','#charts')}<ol>${tracks.slice(0,5).map((t,i)=>`<li><span class="hub-rank">${i+1}</span><a href="#song/${esc(t.id)}">${cover(t,'mini-cover')}</a><div><a href="#song/${esc(t.id)}"><strong>${esc(t.title)}</strong></a><span>${credits(t)}</span></div><a class="hub-sing-link" href="#sing/${esc(t.id)}" aria-label="${esc(t.title)} 부르기">${icon('mic')}</a></li>`).join('')||'<li class="hub-empty">부를 수 있는 곡을 준비하고 있어요.</li>'}</ol></section>
 <section class="hub-panel hub-duets" id="hub-duets" tabindex="-1">${header('참여 대기 듀엣','지금, 당신의 목소리를 기다리는 듀엣이에요.','#karaoke/duets')}<div>${duets.length?duets.slice(0,3).map(t=>`<article class="hub-duet"><a href="#song/${esc(t.id)}">${cover(t,'mini-cover')}</a><div><a href="#song/${esc(t.id)}"><strong>${esc(t.title)}</strong></a><small class="hub-duet-badge">DUET</small><p>${esc(t.producer)} 님과 함께 불러요</p><span>${icon('play')} ${number(t.plays||0)} &nbsp; ${icon('comment')} ${number(t.comments||0)}</span></div><a class="hub-join" href="${t.user_id===me?.id?'#song/'+esc(t.id):'#sing/'+esc(t.original_id)+'?duet='+esc(t.id)}">${t.user_id===me?.id?'내 듀엣':'참여하기'}</a></article>`).join(''):`<div class="hub-empty hub-duet-empty">${icon('users')}<strong>함께 부를 첫 목소리를 남겨보세요.</strong><p>듀엣으로 녹음하고 공개하면<br>다른 사람이 이어 부를 수 있어요.</p><button data-hub-jump="original">부를 곡 고르기 ${icon('arrow')}</button></div>`}</div></section></div>
 <section class="hub-panel hub-catalog" id="hub-catalog" tabindex="-1"><div class="hub-catalog-heading"><div><h2>부를 수 있는 곡</h2><p>지금 바로 부를 수 있는 다양한 곡들을 만나보세요.</p></div><div class="hub-filters"><select id="karaoke-genre" aria-label="장르"><option value="">모든 장르</option>${[...new Set(tracks.flatMap(t=>t.genres||[t.genre]))].filter(Boolean).sort().map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('')}</select><select id="karaoke-mood" aria-label="분위기"><option value="">모든 분위기</option>${moodOptions.filter(([key])=>tracks.some(t=>t.moods?.includes(key))).map(([key,label])=>`<option value="${esc(key)}">${esc(label)}</option>`).join('')}</select><select id="karaoke-order" aria-label="정렬"><option value="popular">인기순</option><option value="recent">최신순</option><option value="title">제목순</option></select></div></div><div class="hub-search">${icon('search')}<input id="karaoke-search" type="search" placeholder="곡 제목, 아티스트, 제작자로 찾기" aria-label="부를 수 있는 곡 검색"><span id="karaoke-count" aria-live="polite">${tracks.length}곡</span></div><div class="hub-song-grid" id="karaoke-results">${singingHubTiles(tracks)}</div><div class="hub-catalog-footer"><a href="#library/covers">내 커버곡 ${icon('chevron')}</a><a href="#community/rankings">커버 랭킹 ${icon('chevron')}</a></div></section></div>`;
}
function bindSingingHub(view){
 if(view.singingCollection){bindSingingCollection(view);return;}
 document.querySelectorAll('[data-hub-jump]').forEach(b=>b.onclick=()=>{location.hash='karaoke/'+(b.dataset.hubJump==='duet'?'duets':'songs');});
 const update=()=>{const q=$('#karaoke-search').value.trim().toLocaleLowerCase(),genre=$('#karaoke-genre').value,mood=$('#karaoke-mood').value,order=$('#karaoke-order').value,items=view.karaokeTracks.filter(t=>(!q||[t.title,t.artist,t.producer].join(' ').toLocaleLowerCase().includes(q))&&(!genre||(t.genres||[t.genre]).includes(genre))&&(!mood||t.moods?.includes(mood)));if(order==='recent')items.sort((a,b)=>b.created-a.created);else if(order==='title')items.sort((a,b)=>a.title.localeCompare(b.title,'ko'));routeTracks=items;$('#karaoke-count').textContent=items.length+'곡';$('#karaoke-results').innerHTML=singingHubTiles(items);};
 $('#karaoke-search').oninput=update;for(const id of ['karaoke-genre','karaoke-mood','karaoke-order'])$('#'+id).onchange=update;
}

function singingHubNav(active='recommend'){
 const tabs=[['recommend','추천','#karaoke'],['duets','듀엣','#karaoke/duets'],['songs','원곡','#karaoke/songs'],['drafts','내 초안','#karaoke/drafts'],['ranking','랭킹','#charts/karaoke']];
 return (typeof dubbingModeNav==='function'?dubbingModeNav('song'):'')+'<nav class="hub-tabs" aria-label="부르기 메뉴">'+tabs.map(([key,label,href])=>`<a href="${href}" ${key===active?'class="active" aria-current="page"':''}>${label}</a>`).join('')+'</nav>';
}
function singingCollectionCards(tracks,duet){
 return tracks.map(t=>{
  const own=duet&&t.user_id===me?.id,join=own?'#song/'+esc(t.id):duet?'#sing/'+esc(t.original_id)+'?duet='+esc(t.id):'#sing/'+esc(t.id)+'?mode=solo';
  return `<article class="sing-collection-card${duet?' is-duet':''}" data-music-id="${esc(t.id)}">
   <div class="sing-card-art"><a href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${cover(t,'sing-card-cover')}</a><span class="sing-card-kind">${icon(duet?'users':'mic')}${duet?(own?'내 반곡':'참여 대기'):'MR 준비 완료'}</span><span class="sing-card-duration">${time(t.duration)}</span></div>
   <div class="sing-card-copy"><span class="sing-card-genre">${esc((t.genres||[t.genre]).filter(Boolean).slice(0,2).join(' · '))}</span><h2><a href="#song/${esc(t.id)}">${esc(t.title)}</a></h2>
   ${duet?`<a class="sing-card-person" href="#producer/${esc(t.producer_id)}">${esc(t.producer||'음악가')}</a><p class="sing-card-invitation">${own?'다음 목소리를 기다리는 내 반곡이에요.':'먼저 부른 목소리에, 당신의 목소리를 더해주세요.'}</p>`:`<div class="sing-card-person">${credits(t)}</div><p class="sing-card-invitation">원곡을 듣고, 내 목소리로 불러보세요.</p>`}
   <div class="sing-card-actions"><button type="button" class="small-button" data-play="${esc(t.id)}" aria-label="${esc(t.title)} ${duet?'반곡':'원곡'} 듣기">${icon('play')} ${duet?'반곡 듣기':'원곡 듣기'}</button><a class="primary-button" href="${join}" aria-label="${esc(t.title)} ${own?'내 반곡 보기':duet?'듀엣 참여하기':'바로 부르기'}">${icon(own?'arrow':'mic')}${own?'내 반곡 보기':duet?'참여하기':'부르기'}</a></div></div>
  </article>`;
 }).join('');
}
function singingCollectionEmpty(duet,filtered=false){
 return `<div class="sing-collection-empty">${icon(duet?'users':'search')}<h2>${filtered?'일치하는 곡이 없어요':duet?'아직 참여를 기다리는 반곡이 없어요':'아직 부를 수 있는 곡이 없어요'}</h2><p>${filtered?'다른 제목이나 이름으로 검색하거나 필터를 초기화해보세요.':duet?'좋아하는 곡의 첫 파트를 남기고 함께 부를 사람을 만나보세요.':'MR이 준비된 음악이 여기에 모여요.'}</p>${filtered?'<button type="button" class="small-button" data-sing-filter-reset>필터 초기화</button>':`<a class="primary-button" href="${duet?'#karaoke/songs':'#karaoke'}">${duet?'부를 곡 고르기':'부르기로 돌아가기'} ${icon('arrow')}</a>`}</div>`;
}
function singingCollectionHTML(tracks,kind){
 const duet=kind==='duets',genres=[...new Set(tracks.flatMap(t=>t.genres||[t.genre]))].filter(Boolean).sort();
 return `<div class="singing-hub singing-collection"><a class="sing-collection-back" href="#karaoke">← 부르기로</a>
  <header class="sing-collection-hero${duet?' is-duet':''}"><div><span class="eyebrow">${duet?'SING TOGETHER':'YOUR VOICE, YOUR STAGE'}</span><h1>${duet?'듀엣 참여하기':'바로 부르기'}</h1><p>${duet?'누군가 남긴 반곡, 당신의 목소리로 완성해요.':'부르고 싶은 곡을 골라 나만의 무대를 시작해요.'}</p></div><span class="sing-collection-symbol" aria-hidden="true">${icon(duet?'users':'mic')}</span></header>
  ${singingHubNav(kind)}<section class="sing-collection-browser" aria-label="${duet?'참여 대기 반곡':'부를 수 있는 곡'} 목록">
  <div class="sing-collection-toolbar"><label class="sing-collection-search">${icon('search')}<input id="sing-collection-search" type="search" aria-label="${duet?'반곡':'원곡'} 검색" placeholder="${duet?'곡 제목, 부른 사람으로 찾기':'곡 제목, 아티스트로 찾기'}"></label><div class="sing-collection-filters"><select id="sing-collection-genre" aria-label="장르"><option value="">모든 장르</option>${genres.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('')}</select><select id="sing-collection-order" aria-label="정렬"><option value="${duet?'recent':'popular'}">${duet?'최신순':'인기순'}</option><option value="${duet?'popular':'recent'}">${duet?'인기순':'최신순'}</option><option value="title">제목순</option></select></div></div>
  <div class="sing-collection-caption"><h2>${duet?'함께 부를 반곡':'부를 수 있는 곡'}</h2><span id="sing-collection-count" aria-live="polite">${tracks.length}곡</span></div><div class="sing-collection-grid" id="sing-collection-results">${tracks.length?singingCollectionCards(tracks,duet):singingCollectionEmpty(duet)}</div></section></div>`;
}
function filterSingingCollection(tracks,{q='',genre='',order='recent'},duet){
 const query=q.trim().toLocaleLowerCase(),items=tracks.filter(t=>(!query||[t.title,t.artist,t.producer].join(' ').toLocaleLowerCase().includes(query))&&(!genre||(t.genres||[t.genre]).includes(genre)));
 if(order==='title')items.sort((a,b)=>a.title.localeCompare(b.title,'ko'));
 else if(order==='recent')items.sort((a,b)=>Number(b.created||0)-Number(a.created||0));
 else if(duet)items.sort((a,b)=>Number(b.plays||0)-Number(a.plays||0)||Number(b.created||0)-Number(a.created||0));
 // Original popularity follows the server's ranked catalog order.
 return items;
}
function bindSingingCollection(view){
 const search=$('#sing-collection-search'),genre=$('#sing-collection-genre'),order=$('#sing-collection-order'),results=$('#sing-collection-results'),duet=view.singingCollection==='duets';
 const update=()=>{const items=filterSingingCollection(view.karaokeTracks,{q:search.value,genre:genre.value,order:order.value},duet);routeTracks=items;$('#sing-collection-count').textContent=items.length+'곡';results.innerHTML=items.length?singingCollectionCards(items,duet):singingCollectionEmpty(duet,!!(search.value.trim()||genre.value));};
 search.oninput=update;genre.onchange=order.onchange=update;
 results.onclick=e=>{if(e.target.closest('[data-sing-filter-reset]')){search.value='';genre.value='';order.value=duet?'recent':'popular';update();search.focus();}};
 update();
}
