const moodOptions=AifectGenres.MOODS.map(m=>[m.id,m.name]);
const discoverHints=['오늘은 어떤 음악이 끌려?','지금 기분에 어울리는 음악을 찾아볼까?','마음을 다독여줄 노래가 필요해?','드라이브에 함께할 음악은 어때?','집중할 때 듣고 싶은 음악이 있어?','새로운 취향을 발견해볼까?','오늘의 에너지를 채워줄 곡을 찾아봐.','잠들기 전, 어떤 노래를 들을까?'];
let discoverManifestPromise=null,discoverVisitHint='',discoverCleanup=null;
if(typeof window!=='undefined')window.addEventListener('hashchange',()=>{if(!/^#discover(?:[/?]|$)/.test(location.hash))discoverVisitHint='';});
async function loadDiscoverManifest(readApi=api){
 if(!discoverManifestPromise)discoverManifestPromise=fetch('/assets/discover/discover-manifest.json').then(r=>{if(!r.ok)throw Error('발견 이미지를 불러오지 못했어요.');return r.json();}).then(manifest=>{
  const missing=[...AifectGenres.GENRES.filter(name=>!manifest.genres.some(g=>g.name===name)).map(name=>'genre:'+name),...AifectGenres.MOODS.filter(m=>!manifest.moods.some(x=>x.id===m.id)).map(m=>'mood:'+m.id)];
  if(missing.length){console.error('Discover asset mapping missing',missing);throw Error('발견 이미지 연결 누락: '+missing.join(', '));}
  return manifest;
 }).catch(e=>{discoverManifestPromise=null;throw e;});
 return discoverManifestPromise;
}
function discoverLayoutHTML(manifest,selectedMood='',selectedGenre='전체'){
 if(!discoverVisitHint)discoverVisitHint=discoverHints[Math.floor(Math.random()*discoverHints.length)];
 const order=['comfort','energy','romance','drive','focus','sleep','workout','meditation','nostalgia','rain','night','party'];
 const moodById=new Map(AifectGenres.MOODS.map(m=>[m.id,m]));
 const genreByName=new Map(manifest.genres.map(g=>[g.name,g]));
 const shortcuts=[['charts','chart','인기 차트',''],['karaoke/duets','mic','함께 부르기','듣고, 직접 부르고'],['community/covers','users','커버곡 둘러보기','같은 곡, 다른 목소리'],['collections','library','추천 플레이리스트','취향을 나누는 선곡']];
 return `<div class="discover-photo-layout"><form id="search-form" class="discover-search" role="search">${icon('search')}<input type="search" name="q" aria-label="곡, 아티스트, 제작자 검색" placeholder="${esc(discoverVisitHint)}" maxlength="100"><button type="submit" aria-label="음악 검색">${icon('sparkles')}</button></form>
 <nav class="discover-shortcuts" aria-label="음악 즐기기">${shortcuts.map(([route,symbol,title,subtitle])=>`<a href="#${route}">${icon(symbol)}<span><strong>${title}</strong>${subtitle?`<small>${subtitle}</small>`:''}</span>${icon('chevron')}</a>`).join('')}</nav>
 <section class="discover-moods" aria-labelledby="discover-moods-title"><header class="discover-section-heading"><h2 id="discover-moods-title">오늘, 어떤 기분인가요?</h2><button type="button" data-discover-moods-toggle aria-controls="discover-mood-track">더 둘러보기 ${icon('chevron')}</button></header>
 <div class="discover-carousel"><button type="button" class="discover-prev" data-discover-scroll="-1" aria-label="이전 기분">${icon('chevron')}</button><div id="discover-mood-track" class="discover-mood-track" tabindex="0" aria-label="기분 목록 · 좌우로 이동">${order.map(id=>{const m=moodById.get(id),asset=manifest.moods.find(x=>x.id===id);return `<a class="discover-mood-card" href="#search?mood=${encodeURIComponent(id)}" ${selectedMood===id?'aria-current="page"':''} title="${esc(m.name)}"><img src="${esc(asset.file)}" alt="" draggable="false" decoding="async"><span>${icon(m.symbol)}<strong>${esc(m.name)}</strong></span></a>`;}).join('')}</div><button type="button" class="discover-next" data-discover-scroll="1" aria-label="다음 기분">${icon('chevron')}</button><div class="discover-scroll-progress" aria-hidden="true"><span></span></div></div></section>
 <section class="discover-genres" aria-labelledby="discover-genres-title"><header class="discover-section-heading"><h2 id="discover-genres-title">장르 둘러보기</h2><button type="button" data-discover-genres-toggle aria-expanded="false" aria-controls="discover-genre-grid">전체 보기 ${icon('chevron')}</button></header><div id="discover-genre-grid" class="discover-genre-grid">${AifectGenres.GENRES.map((name,i)=>`<a class="discover-genre-card" href="#search?genre=${encodeURIComponent(name)}" title="${esc(name)}" ${selectedGenre===name?'aria-current="page"':''} ${i>=20?'data-discover-extra hidden':''}><img src="${esc(genreByName.get(name).file)}" alt="" loading="lazy" decoding="async" draggable="false"><span><small>EXPLORE MUSIC</small><strong>${esc(name)}</strong></span>${icon('chevron')}</a>`).join('')}</div></section></div>`;
}
function bindDiscover(){
 discoverCleanup?.();discoverCleanup=null;
 const root=document.querySelector('.discover-photo-layout');if(!root)return;
 const track=root.querySelector('.discover-mood-track'),moodToggle=root.querySelector('[data-discover-moods-toggle]'),genreToggle=root.querySelector('[data-discover-genres-toggle]');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const toggleLabel=(button,expanded)=>{button.setAttribute('aria-expanded',String(expanded));button.innerHTML=(expanded?'접기':'전체 보기')+' '+icon('chevron');};
 moodToggle.onclick=()=>{track.scrollTo({left:track.scrollWidth,behavior:reduced?'instant':'smooth'});};
 genreToggle.onclick=()=>{const expanded=genreToggle.getAttribute('aria-expanded')!=='true';root.querySelectorAll('[data-discover-extra]').forEach(card=>card.hidden=!expanded);toggleLabel(genreToggle,expanded);};
 const update=()=>{const max=track.scrollWidth-track.clientWidth;root.querySelector('[data-discover-scroll="-1"]').disabled=track.scrollLeft<=1;root.querySelector('[data-discover-scroll="1"]').disabled=max<=0||track.scrollLeft>=max-1;const progress=root.querySelector('.discover-scroll-progress span'),ratio=Math.min(1,track.clientWidth/Math.max(1,track.scrollWidth));progress.style.width=ratio*100+'%';progress.style.marginLeft=(max>0?track.scrollLeft/max*(1-ratio)*100:0)+'%';};
 root.querySelectorAll('[data-discover-scroll]').forEach(b=>b.onclick=()=>track.scrollBy({left:Number(b.dataset.discoverScroll)*track.clientWidth*.8,behavior:reduced?'instant':'smooth'}));
 track.addEventListener('scroll',update,{passive:true});
 track.onkeydown=e=>{if(e.target!==track||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();track.scrollTo({left:e.key==='Home'?0:e.key==='End'?track.scrollWidth:track.scrollLeft+(e.key==='ArrowRight'?1:-1)*182,behavior:reduced?'instant':'smooth'});};
 // Touch uses native momentum scrolling. Mouse drag does not turn into a filter click.
 let drag=null,suppressClick=false;
 track.onpointerdown=e=>{if(e.pointerType!=='mouse'||e.button!==0||root.querySelector('.discover-moods').classList.contains('is-expanded'))return;drag={x:e.clientX,left:track.scrollLeft,id:e.pointerId};suppressClick=false;};
 track.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x;if(Math.abs(dx)>6&&!suppressClick){suppressClick=true;track.setPointerCapture(drag.id);track.classList.add('is-dragging');}if(suppressClick){e.preventDefault();track.scrollLeft=drag.left-dx;}};
 const release=()=>{if(drag&&track.hasPointerCapture(drag.id))track.releasePointerCapture(drag.id);drag=null;track.classList.remove('is-dragging');};
 track.onpointerup=release;track.onpointercancel=release;track.onpointerleave=()=>{if(!suppressClick)drag=null;};
 track.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopPropagation();suppressClick=false;}},true);
 const observer=new ResizeObserver(update);observer.observe(track);update();
 discoverCleanup=()=>{observer.disconnect();window.removeEventListener('hashchange',release);};
 window.addEventListener('hashchange',release,{once:true});
}
let collectionSearch='',collectionSort='custom',collectionFilter='all';
const isSavedPlaylist=id=>(library.saved||[]).some(p=>p.id===id);
function playlistImageURL(p){return p.image_version?'/media/playlist/'+encodeURIComponent(p.id)+'/image?v='+encodeURIComponent(p.image_version):'';}
function playlistArt(p,cls='collection-art'){if(p.image_version)return '<div class="'+cls+' collage collage-1 playlist-custom-art"><img src="'+esc(playlistImageURL(p))+'" alt="'+esc(p.name)+' 플레이리스트 이미지" loading="lazy" decoding="async"></div>';const covers=p.covers||[];return `<div class="${cls} collage collage-${Math.min(covers.length,4)}">${covers.length?covers.map(t=>cover(t,'collection-tile')).join(''):`<span>${icon('list')}</span>`}</div>`;}
function collectionCard(p){const owned=me?.id===p.user_id,inLibrary=owned||p.saved;return `<article class="collection-card ${p.locked?'collection-locked':''}"><a href="#playlist/${p.id}" class="collection-main">${playlistArt(p)}<span class="collection-kind">${p.pinned?'고정 · ':''}${owned?'내 플레이리스트':esc(p.owner_name||'리스너')+'의 선곡'}</span><h2>${p.locked?'<small class="locked-badge">보관 중</small>':''}${esc(p.name)}</h2><p>${esc(p.description||'좋아하는 음악을 모은 플레이리스트')}</p><small>${p.tracks}곡 · ${p.is_public?'공개':'비공개'}</small></a><div class="collection-card-actions">${inLibrary?`<button class="text-link ${p.pinned?'is-active':''}" data-pin-collection="${p.id}" data-pinned="${!!p.pinned}" aria-pressed="${!!p.pinned}">${p.pinned?'고정 해제':'상단 고정'}</button>`:`<button class="text-link" data-save-collection="${p.id}" data-saved="false">${icon('plus')} 보관함 저장</button>`}<a href="#playlist/${p.id}" aria-label="${esc(p.name)} 열기">열기</a></div></article>`;}
function collectionGrid(items,message='아직 플레이리스트가 없어요'){return items.length?`<div class="collection-grid">${items.map(collectionCard).join('')}</div>`:empty(message,'좋아하는 음악을 모아 나만의 플레이리스트를 만들어보세요.','#library/playlists','내 보관함');}
// The recommendation route shares the home latest-release grid, without changing library cards.
function recommendedPlaylistCard(p){
 const id=esc(p.id),name=esc(p.name),owned=me?.id===p.user_id;
 return `<article class="recommended-playlist-card"><div class="recommended-playlist-art"><a href="#playlist/${id}" aria-label="${name} 상세">${playlistArt(p,'album-art recommended-playlist-cover')}</a><button type="button" class="list-action icon-button recommended-playlist-play" data-recommended-playlist="${id}" aria-label="${name} 재생" ${!p.tracks||p.locked?'disabled':''}>${icon('ui-play-action')}</button></div><h2 class="album-title"><a href="#playlist/${id}" title="${name}">${name}</a></h2><div class="recommended-playlist-meta"><span class="recommended-playlist-owner" title="${esc(p.owner_name||'리스너')}">${icon('user')}<span>${esc(p.owner_name||'리스너')}</span></span><span>${number(p.tracks)}곡</span></div><div class="recommended-playlist-save"><small><span data-recommended-saves>${number(p.saves||0)}</span>명 저장</small>${owned?'':`<button type="button" class="text-link" data-save-collection="${id}" data-saved="${!!p.saved}" aria-pressed="${!!p.saved}">${p.saved?'보관함 저장됨':'보관함 저장'}</button>`}</div></article>`;
}
function recommendedPlaylistGrid(items,message){return items.length?`<div class="home-music-grid">${items.map(recommendedPlaylistCard).join('')}</div>`:empty(message,'좋아하는 음악을 모아 나만의 플레이리스트를 만들어보세요.','#library/playlists','내 보관함');}
function discoveryTabs(active){return `<div class="tabs explorer-tabs">${[['','추천'],['themes','기분·활동'],['genres','장르'],['following','팔로잉 신곡']].map(([id,label])=>`<a class="tab ${active===id?'active':''}" href="#discover${id?'/'+id:''}">${label}</a>`).join('')}<a class="tab" href="#collections">추천 플레이리스트</a></div>`;}
function moodCards(moods,selected=''){return `<div class="mood-grid">${moods.map((m,i)=>`<a class="mood-card mood-${i} ${selected===m.id?'selected':''}" href="#discover/mood?m=${m.id}" ${selected===m.id?'aria-current="page"':''}><span aria-hidden="true">${icon(m.symbol||'music')}</span><strong>${esc(m.name)}</strong><small>${esc(m.caption)}</small><em>${m.count}곡</em></a>`).join('')}</div>`;}
async function explorerView(base,param,raw,embedded=false,readApi=api){
 if(base==='member'){const d=await readApi('/api/members/'+encodeURIComponent(param));return {html:listenerProfileHTML(d.profile)};}
 const params=new URLSearchParams(raw.split('?')[1]||'');
 if(base==='membership'){const [,billing]=await Promise.all([me?refreshLibrary(false,readApi):null,readApi('/api/billing/status').catch(()=>undefined)]);return {html:membershipHTML(billing)};}
 if(base==='discover'){
  const active=param==='mood'?'themes':genres.includes(decodeURIComponent(param||''))?'genres':param||'',mood=params.get('m')||'',genre=params.get('g')||(genres.includes(decodeURIComponent(param||''))?decodeURIComponent(param):'전체');
  // Preserve old bookmarked filters while all new cards use the unified route.
  if(mood||genre!=='전체'){
   const target='#search?'+new URLSearchParams(mood?{mood}:{genre});
   history.replaceState(history.state,'',target);
   return explorerView('search','',target.slice(1),false,readApi);
  }
  const shell=discoverLayoutHTML(await loadDiscoverManifest(readApi));
  if(active!=='following')return {html:shell,tracks:[],discoverPage:true};
  if(!me){returnRoute=location.hash;return {discoverPage:true,html:shell+heading('팔로잉 신곡')+gate()};}
  const d=await readApi('/api/discovery?following=1');
  return {html:shell+section('팔로우한 창작자의 새 음악')+grid(d.tracks),tracks:d.tracks,discoverPage:true};
 }
 if(base==='collections'){
  const q=params.get('q')||'',sort=params.get('sort')==='recent'?'recent':'popular',d=await readApi('/api/playlists?'+new URLSearchParams({q,sort}));
  return {html:`<section class="recommended-playlists listening-home-v2 home-content-refresh" aria-label="추천 플레이리스트"><form id="collection-search" class="explorer-toolbar" role="search"><input name="q" aria-label="추천 플레이리스트 검색" placeholder="제목, 소개, 만든 사람 검색" value="${esc(q)}" maxlength="100"><select name="sort" aria-label="추천 플레이리스트 정렬"><option value="popular" ${sort==='popular'?'selected':''}>많이 저장한 순</option><option value="recent" ${sort==='recent'?'selected':''}>최신순</option></select><button class="primary-button">검색</button></form><p class="field-help">공개 목록을 저장하면 만든 사람이 추가한 곡도 함께 반영됩니다.</p>`+recommendedPlaylistGrid(d.playlists,q?'검색 결과가 없어요.':'아직 공개된 플레이리스트가 없어요.')+'</section>'};
 }
 if(base==='search')return unifiedSearchView(param,raw,readApi);
 if(base==='library'){
  if(!me){returnRoute=location.hash;return {html:gate()};}await refreshLibrary(false,readApi);const tab=param||'likes';
  let html=(embedded?'':heading('내 보관함','좋아하는 음악을 모으고, 오늘의 기분대로 들어보세요.'))+libraryTabs(tab);
  if(tab==='playlists')html+=playlistQuotaHTML()+`<div class="inline-actions playlist-actions"><button class="primary-button" id="new-playlist">${icon('plus')} 플레이리스트 만들기</button><button class="small-button" data-order-collections>목록 순서 편집</button><a class="text-link" href="#collections">다른 사람의 플레이리스트 찾기</a></div><div class="explorer-toolbar"><input id="library-search" aria-label="내 플레이리스트 검색" placeholder="내 보관함에서 검색" value="${esc(collectionSearch)}"><select id="library-filter" aria-label="플레이리스트 종류">${[['all','전체 목록'],['mine','내가 만든 목록'],['saved','저장한 공개 목록']].map(([k,v])=>`<option value="${k}" ${collectionFilter===k?'selected':''}>${v}</option>`).join('')}</select><select id="library-sort" aria-label="내 플레이리스트 정렬">${[['custom','내 순서'],['name','이름순'],['recent','최신순']].map(([k,v])=>`<option value="${k}" ${collectionSort===k?'selected':''}>${v}</option>`).join('')}</select></div><div id="library-collections">${filteredCollections()}</div>`;
  else if(tab==='artists'||tab==='producers')html+=identityCards(library.follows.filter(f=>f.kind===(tab==='artists'?'artist':'producer')).map(f=>({...f,id:f.target_id})),tab==='artists'?'artist':'producer');
  else html+=libraryOverviewHTML();
  return {html,tracks:tab==='likes'?library.likes:[]};
 }
 if(base==='playlist'){
  const d=await readApi('/api/playlists/'+param),p=d.playlist,owned=me?.id===p.user_id;
  if(p.locked&&owned)return {html:lockedPlaylistHTML(p),tracks:[],playlist:p};
  return {html:`<a class="text-link" href="#${owned||p.saved?'library/playlists':'collections'}">← ${owned||p.saved?'내 보관함':'추천 플레이리스트'}</a><section class="collection-hero">${playlistArt(p)}<div><span class="eyebrow">${p.is_public?'PUBLIC PLAYLIST':'PRIVATE PLAYLIST'}</span><h1>${esc(p.name)}</h1><p class="collection-description">${esc(p.description||'좋아하는 음악을 모아 나누는 나만의 선곡')}</p><p class="field-help">${esc(p.owner_name)} · ${d.tracks.length}곡 · ${time(p.duration)}${p.is_public?' · '+number(p.saves)+'명 저장':''}</p><div class="inline-actions playlist-actions"><button class="primary-button" data-play-all ${d.tracks.length?'':'disabled'}>전체 재생 ${icon('ui-play-action')}</button>${owned?`<button class="small-button" data-pick-playlist="${p.id}">곡 추가</button><button class="small-button" data-order-playlist="${p.id}">곡 순서 편집</button><button class="small-button" data-edit-playlist="${p.id}">이미지 · 목록 설정</button><button class="text-link" data-delete-playlist="${p.id}">삭제</button>`:`<button class="small-button ${p.saved?'is-active':''}" data-save-collection="${p.id}" data-saved="${!!p.saved}">${p.saved?'보관함 저장됨 · 해제':'내 보관함에 저장'}</button>`}${p.is_public?'<button class="small-button" data-share>링크 복사</button>':''}</div></div></section><div class="explorer-toolbar"><input id="playlist-filter" aria-label="플레이리스트 안에서 곡 검색" placeholder="이 플레이리스트에서 곡 검색"></div><div id="playlist-song-list">${list(d.tracks,owned?p.id:null)}</div>`,tracks:d.tracks,playlist:p};
 }
 return null;
}
function filteredCollections(){const items=(library.collections||library.playlists).filter(p=>(collectionFilter==='all'||(collectionFilter==='mine')===(p.user_id===me.id))&&(p.name+' '+p.description+' '+p.owner_name).toLowerCase().includes(collectionSearch.toLowerCase()));if(collectionSort==='name')items.sort((a,b)=>b.pinned-a.pinned||a.name.localeCompare(b.name,'ko'));if(collectionSort==='recent')items.sort((a,b)=>b.pinned-a.pinned||b.created-a.created);return collectionGrid(items,'조건에 맞는 플레이리스트가 없어요.');}
function bindExplorer(view){
 if(view?.discoverPage)bindDiscover();else{discoverCleanup?.();discoverCleanup=null;}
 if($('#collection-search')){const form=$('#collection-search');form.onsubmit=e=>{e.preventDefault();location.hash='collections?'+new URLSearchParams(new FormData(form));};form.elements.sort.onchange=()=>form.requestSubmit();}
 for(const [id,key] of [['library-search','search'],['library-filter','filter'],['library-sort','sort']]){const el=$('#'+id);if(el)el.oninput=()=>{if(key==='search')collectionSearch=el.value;else if(key==='filter')collectionFilter=el.value;else collectionSort=el.value;$('#library-collections').innerHTML=filteredCollections();if(typeof rememberLibraryFilters==='function')rememberLibraryFilters();};}
 if($('#playlist-filter'))$('#playlist-filter').oninput=e=>{const q=e.target.value.toLowerCase(),items=routeTracks.filter(t=>(t.title+' '+t.artist+' '+t.producer).toLowerCase().includes(q));$('#playlist-song-list').innerHTML=items.length?list(items,view?.playlist?.user_id===me?.id?view.playlist.id:null):'<p class="empty-inline">이 목록에 일치하는 곡이 없어요.</p>';};
}
async function orderCollections(){const ticket=renderId;if(!me)return askLogin();await refreshLibrary();let items=[...library.collections];if(items.length<2)return toast('두 개 이상의 목록을 모으면 순서를 편집할 수 있어요.');if(ticket!==renderId)return;dialog(`<h2>플레이리스트 목록 순서</h2><p>고정한 목록이 먼저 표시되고, 그 안에서는 저장한 순서를 따릅니다.</p><form id="collections-order"><div class="playlist-order-rows" id="collections-order-rows"></div><button class="primary-button">목록 순서 저장</button><p class="form-error" role="alert"></p></form>`);const root=$('#collections-order-rows'),paint=()=>root.innerHTML=items.map((p,i)=>`<div data-list-row class="playlist-order-row"><span>${i+1}</span><div><strong>${esc(p.name)}</strong><small>${p.pinned?'고정한 목록':'일반 목록'}</small></div><button type="button" class="list-action small-button" data-collection-move="${i}" data-dir="-1" title="${esc(p.name)} 위로" aria-label="${esc(p.name)} 위로" ${i===0?'disabled':''}>↑</button><button type="button" class="list-action small-button" data-collection-move="${i}" data-dir="1" title="${esc(p.name)} 아래로" aria-label="${esc(p.name)} 아래로" ${i===items.length-1?'disabled':''}>↓</button></div>`).join('');paint();root.onclick=e=>{const b=e.target.closest('[data-collection-move]');if(!b||b.disabled)return;items=AifectQueue.moveTrack(items,Number(b.dataset.collectionMove),Number(b.dataset.dir));paint();};const form=$('#collections-order');form.onsubmit=busyForm(form,async()=>{await api('/api/library/playlists/order','PUT',{playlist_ids:items.map(p=>p.id)});$('#dialog').close();collectionSort='custom';await render();toast('보관함의 목록 순서를 저장했습니다.');});}

async function trackPicker(pid){const ticket=renderId;
 if(!me)return askLogin();const d=await api('/api/playlists/'+pid);await refreshLibrary();const members=new Set(d.tracks.map(t=>t.id)),chosen=new Map();let items=library.likes,token=0;
 if(ticket!==renderId)return;dialog(`<h2>플레이리스트에 곡 추가</h2><p>${esc(d.playlist.name)}에 담을 곡을 선택하세요.</p><div class="tabs"><button type="button" class="tab active" data-picker-source="likes">좋아요</button><button type="button" class="tab" data-picker-source="history">최근 들은 곡</button><button type="button" class="tab" data-picker-source="search">검색</button></div><form id="picker-search" class="explorer-toolbar" hidden><input name="q" aria-label="추가할 곡 검색" placeholder="곡이나 아티스트 검색" maxlength="100"><button class="small-button">검색</button></form><form id="picker-add"><div class="likes-track-picker" id="picker-tracks"></div><button class="primary-button" id="picker-submit">선택한 곡 담기 (0)</button><p class="form-error" role="alert"></p></form>`);
 const root=$('#picker-tracks'),paint=()=>{root.innerHTML=items.length?items.map(t=>`<label data-list-row class="likes-pick-row"><input type="checkbox" value="${t.id}" ${members.has(t.id)?'disabled':chosen.has(t.id)?'checked':''}>${cover(t,'mini-cover')}<span><strong>${esc(t.title)}</strong><small>${esc(t.artist)}${members.has(t.id)?' · 이미 담긴 곡':''}</small></span></label>`).join(''):'<p class="empty-inline">선택할 곡이 없어요. 검색에서 음악을 찾아보세요.</p>';};paint();
 root.onchange=e=>{const input=e.target.closest('input');if(!input)return;const t=items.find(t=>t.id===input.value);if(input.checked)chosen.set(t.id,t);else chosen.delete(input.value);$('#picker-submit').textContent=`선택한 곡 담기 (${chosen.size})`;};
 const select=async(source,q='')=>{const n=++token;try{const data=source==='likes'?{tracks:library.likes}:await api(source==='history'?'/api/history':'/api/search?q='+encodeURIComponent(q));if(n!==token||!root.isConnected)return;items=data.tracks;paint();}catch(e){if(root.isConnected)root.innerHTML=`<p class="form-error">${esc(e.message)}</p>`;}};
 document.querySelectorAll('[data-picker-source]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-picker-source]').forEach(x=>x.classList.toggle('active',x===b));$('#picker-search').hidden=b.dataset.pickerSource!=='search';select(b.dataset.pickerSource);});$('#picker-search').onsubmit=e=>{e.preventDefault();select('search',new FormData(e.target).get('q'));};
 const form=$('#picker-add');form.onsubmit=busyForm(form,async()=>{if(!chosen.size)throw Error('담을 곡을 선택해주세요.');for(const tid of chosen.keys()){await api(`/api/playlists/${pid}/tracks/${tid}`,'PUT');members.add(tid);chosen.delete(tid);}$('#dialog').close();await render();toast('선택한 곡을 플레이리스트에 담았습니다.');});
}

function updateQueueButton(){const button=$('#queue-toggle'),count=$('#queue-count');if(button)button.setAttribute('aria-label',`재생목록 열기 · ${queue.length}곡`);if(count){count.textContent=number(queue.length);count.hidden=!queue.length;}}
function saveQueue(){updateQueueButton();try{const value=JSON.stringify({ids:queue,tracks:queue.map(id=>({id,title:trackMap.get(id)?.title,artist:trackMap.get(id)?.artist}))});sessionStorage.setItem('aifect-queue',value);localStorage.setItem('aifect-queue',value);}catch{}}
function trackMenu(tid,anchor=null){
 const t=trackMap.get(tid);if(!t)return;const id=esc(tid);
 const row=(name,label,attrs,extra='')=>`<button type="button" class="track-option ${extra}" ${attrs}>${icon(name)}<span>${label}</span>${icon('chevron')}</button>`;
 const html=`<nav class="track-options" aria-label="곡 옵션">
 ${row('play','지금 재생',`data-play="${id}"`,'track-option-now')}
 ${row('next','다음에 재생',`data-queue-insert="${id}" data-placement="next"`)}
 ${row('list','재생목록 맨 뒤에 추가',`data-queue-insert="${id}" data-placement="last"`)}
 ${row('plus','플레이리스트에 저장',`data-add="${id}"`)}
 ${row('heart',`<span data-track-like-label>${liked(tid)?'좋아요 해제':'좋아요'}</span>`,`data-like="${id}" aria-pressed="${liked(tid)}"`)}
 ${anchor?row('share','공유하기',`data-share="${id}"`):''}
 ${anchor&&me?.id!==t.user_id?row('info','음질 문제 신고',`data-report-track="${id}"`):''}
 ${giftButton(t,'track-option').replace('</button>',icon('chevron')+'</button>')}
 <a class="track-option" href="#song/${id}" data-close-dialog>${icon('info')}<span>곡 정보 · 가사 · 댓글</span>${icon('chevron')}</a>
 ${me?.id&&me.id===t.user_id?row('trash','곡 삭제',`data-delete-track="${id}" data-track-title="${esc(t.title)}" data-track-kind="${esc(t.kind)}"`,'track-option-delete'):''}
 </nav>`;
 if(anchor)chartTrackPopover(html,anchor);else dialog(html);
 paintInteractions();
}
function chartTrackPopover(html,anchor){
 let menu=document.getElementById('chart-track-menu');
 if(!menu){menu=document.createElement('div');menu.id='chart-track-menu';menu.popover='auto';menu.className='chart-track-popover';document.body.append(menu);}
 menu._chartCleanup?.();
 if(menu.matches(':popover-open'))menu.hidePopover();
 menu.innerHTML=html;menu.style.visibility='hidden';
 anchor.setAttribute('aria-controls',menu.id);anchor.setAttribute('aria-expanded','true');
 menu.showPopover();
 const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight;
 menu.style.maxHeight=Math.max(80,height-16)+'px';menu.style.maxWidth=Math.max(80,width-16)+'px';
 const rect=anchor.getBoundingClientRect(),size=menu.getBoundingClientRect(),x=Math.max(left+8,Math.min(rect.right-size.width,left+width-size.width-8)),below=rect.bottom+6;
 const y=Math.max(top+8,Math.min(below+size.height<=top+height-8?below:rect.top-size.height-6,top+height-size.height-8));
 menu.style.left=x+'px';menu.style.top=y+'px';menu.style.visibility='';
 const close=()=>{if(menu.matches(':popover-open'))menu.hidePopover();cleanup();};
 const onScroll=e=>{if(!menu.contains(e.target))close();};
 const onToggle=e=>{if(e.newState==='closed')cleanup();};
 const cleanup=()=>{anchor.setAttribute('aria-expanded','false');window.removeEventListener('scroll',onScroll,true);window.removeEventListener('resize',close);window.removeEventListener('hashchange',close);menu.removeEventListener('toggle',onToggle);};
 menu._chartCleanup=cleanup;menu.addEventListener('toggle',onToggle);
 window.addEventListener('scroll',onScroll,true);window.addEventListener('resize',close);window.addEventListener('hashchange',close,{once:true});
 menu.onclick=e=>{if(e.target.closest('a,button'))close();};
 menu.onkeydown=e=>{
  if(e.key==='Escape'){e.preventDefault();close();anchor.focus();}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...menu.querySelectorAll('a,button')],index=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();}
 };
 menu.querySelector('button,a')?.focus();
}
// Native dialog keeps ESC and focus trapping. Backdrop dismissal is scoped to this menu.
$('#dialog').addEventListener('click',event=>{
 const modal=event.currentTarget;if(event.target!==modal||!modal.querySelector('.track-options'))return;
 const rect=modal.getBoundingClientRect();
 if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)modal.close();
});
function queueDialog(){
 const waiting=queue.filter(id=>id!==current?.id).length;
 dialog(`<section class="queue-panel"><header class="queue-panel-head"><span class="queue-panel-icon">${icon('list')}</span><div><h2>재생목록</h2><p>총 ${number(queue.length)}곡 · 대기 ${number(waiting)}곡</p></div></header><div class="queue-toolbar"><button class="small-button ${shuffle?'is-active':''}" data-player-action="shuffle" aria-pressed="${shuffle}">${icon('shuffle')} ${shuffle?'셔플 켜짐':'셔플 끔'}</button><button class="small-button ${repeatMode?'is-active':''}" data-player-action="repeat" aria-label="반복 모드: ${['반복 끔','전체 반복','한 곡 반복'][repeatMode]}">${icon('repeat')} ${['반복 끔','전체 반복','한 곡 반복'][repeatMode]}</button><button class="text-link" data-clear-queue ${waiting?'':'disabled'}>대기곡 비우기</button></div><div class="queue-list-heading"><strong>지금 듣는 순서</strong><span>곡을 누르면 재생 · ↑↓ 순서 변경</span></div><div id="editable-queue">${queue.length?queue.map((tid,i)=>{const t=trackMap.get(tid)||{id:tid,title:'음악'},active=tid===current?.id;return `<div data-list-row class="queue-edit-row ${active?'is-current':''}" ${active?'aria-current="true"':''}><span class="queue-position">${i+1}</span><button class="queue-title" data-queue-play="${esc(tid)}" aria-label="${esc(t.title)} 재생"><span class="queue-art">${cover(t,'mini-cover')}<span class="queue-play-hint">${icon('ui-play-action')}</span></span><span class="queue-row-copy"><strong>${esc(t.title)}</strong><small>${esc(t.kind==='cover'?t.producer:t.artist&&t.artist!=='없음'?t.artist:t.producer||'')}</small>${active?`<span class="queue-playing-label">${audio.paused?'일시정지':'지금 재생 중'}</span>`:''}</span></button><div class="queue-row-tools"><button data-move-queue="${i}" data-dir="-1" aria-label="${esc(t.title)} 위로 이동" title="위로 이동" ${i===0?'disabled':''}>↑</button><button data-move-queue="${i}" data-dir="1" aria-label="${esc(t.title)} 아래로 이동" title="아래로 이동" ${i===queue.length-1?'disabled':''}>↓</button>${active?`<span class="queue-current-mark" aria-label="현재 선택한 곡">${icon('volume')}</span>`:`<button data-remove-queue="${esc(tid)}" aria-label="${esc(t.title)} 대기곡 제거" title="목록에서 제거">${icon('ui-minus-action')}</button>`}</div></div>`;}).join(''):'<div class="queue-empty"><strong>아직 담긴 곡이 없어요.</strong><p>곡의 더보기에서 ‘다음에 재생’을 선택해보세요.</p><a class="text-link" href="#discover" data-close-dialog>음악 둘러보기</a></div>'}</div><p class="queue-footnote">여기서 곡을 빼거나 순서를 바꿔도, 보관함에 저장한 플레이리스트는 그대로예요.</p></section>`);
}
function moodFieldHTML(tags=''){return `<fieldset class="mood-fields"><legend>이 음악은 언제 들으면 좋을까요?</legend><p class="field-help">선택한 분위기는 발견 화면에서 음악을 찾는 데 사용됩니다.</p><div class="mood-checks">${moodOptions.map(([id,label])=>`<label><input type="checkbox" data-mood-tag="${label}" ${tags.split(',').map(t=>t.trim()).includes(label)?'checked':''}><span>${label}</span></label>`).join('')}</div></fieldset>`;}
function bindMoodFields(){if(document.querySelector('.music-classification'))return;const input=document.querySelector('input[name="tags"]');if(!input)return;const field=document.createElement('div');field.innerHTML=moodFieldHTML(input.value);input.closest('label').after(field);field.onchange=()=>{const labels=moodOptions.map(x=>x[1]),other=input.value.split(',').map(t=>t.trim()).filter(t=>t&&!labels.includes(t)),chosen=[...field.querySelectorAll('input:checked')].map(x=>x.dataset.moodTag);input.value=[...other,...chosen].join(', ');};input.addEventListener('input',()=>field.querySelectorAll('input').forEach(c=>c.checked=input.value.split(',').map(t=>t.trim()).includes(c.dataset.moodTag)));}
document.addEventListener('click',async e=>{const b=e.target.closest('button,a');if(!b||b.disabled)return;try{
 if(b.dataset.recommendedPlaylist){const ticket=renderId,account=me?.id;b.disabled=true;const d=await api('/api/playlists/'+encodeURIComponent(b.dataset.recommendedPlaylist));if(ticket!==renderId||account!==me?.id||!b.isConnected)return;if(d.tracks?.length){remember(d.tracks);await play(d.tracks[0].id,d.tracks);}else toast('재생할 수 있는 공개곡이 없어요.');}
 else if(b.dataset.saveCollection){if(!me)return askLogin();const saved=b.dataset.saved==='true';b.disabled=true;await api(`/api/playlists/${b.dataset.saveCollection}/save`,saved?'DELETE':'PUT');await refreshLibrary();if(location.hash.startsWith('#playlist/'))await render();else{b.dataset.saved=String(!saved);b.textContent=saved?'보관함 저장':'보관함 저장됨';if(b.closest('.recommended-playlist-card')){b.setAttribute('aria-pressed',String(!saved));const count=b.closest('.recommended-playlist-card').querySelector('[data-recommended-saves]');if(count){const p=await api('/api/playlists/'+encodeURIComponent(b.dataset.saveCollection));if(count.isConnected)count.textContent=number(p.playlist.saves||0);}}}toast(saved?'보관함에서 저장을 해제했습니다.':'추천 플레이리스트를 내 보관함에 저장했습니다.');}
 else if(b.dataset.pinCollection){b.disabled=true;await api('/api/library/playlists/'+b.dataset.pinCollection,'PATCH',{pinned:b.dataset.pinned!=='true'});await render();}
 else if(b.hasAttribute('data-order-collections'))await orderCollections();
 else if(b.dataset.trackMenu)trackMenu(b.dataset.trackMenu,b.closest('.charts-final')?b:null);
 else if(b.dataset.queuePlay){$('#dialog').close();await play(b.dataset.queuePlay);}
 else if(b.dataset.queueInsert){if(b.dataset.queueInsert===current?.id)return toast('지금 재생 중인 곡입니다.');if(queue.length>=500)return toast('현재 재생목록에는 최대 500곡까지 담을 수 있어요.');queue=AifectQueue.insertTrack(queue,b.dataset.queueInsert,current?.id,b.dataset.placement);saveQueue();$('#dialog').close();toast(b.dataset.placement==='next'?'다음에 재생할 곡으로 담았습니다.':'재생목록 맨 뒤에 담았습니다.');}
 else if(b.hasAttribute('data-move-queue')){queue=AifectQueue.moveTrack(queue,Number(b.dataset.moveQueue),Number(b.dataset.dir));saveQueue();queueDialog();}
 else if(b.dataset.removeQueue){queue=AifectQueue.removeTrack(queue,b.dataset.removeQueue,current?.id);saveQueue();queueDialog();}
 else if(b.hasAttribute('data-clear-queue')){queue=AifectQueue.clearWaiting(current?.id);saveQueue();queueDialog();}
 else if(b.hasAttribute('data-close-dialog'))$('#dialog').close();
 }catch(err){toast(err.message);}finally{b.disabled=false;}});

try{const restored=AifectQueue.restoreQueue(sessionStorage.getItem('aifect-queue')||localStorage.getItem('aifect-queue'));queue=restored.ids;remember(restored.tracks);}catch{}

updateQueueButton();
