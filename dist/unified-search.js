let searchPreviousRoute='',searchOrigin=null,searchResizeCleanup=null;
function searchState(raw){
 const [path,query='']=raw.replace(/^#/,'').split('?'),params=new URLSearchParams(query);
 const genre=params.get('genre')||'',mood=params.get('mood')||'',q=decodeURIComponent(path.split('/')[1]||'');
 const label=genre||AifectGenres.MOODS.find(m=>m.id===mood)?.name||q;
 return {q,genre,mood,label,params};
}
function searchRoute(raw){return /^search(?:[/?]|$)/.test(raw);}
function syncSearchNavigation(raw){
 if(searchRoute(raw)){
  const saved=history.state?.aifectSearch;
  if(saved)searchOrigin=saved;
  else{
   searchOrigin=searchRoute(searchPreviousRoute)?{...searchOrigin,depth:(searchOrigin?.depth||0)+1}:{route:searchPreviousRoute||'home',depth:searchPreviousRoute?1:0};
   history.replaceState({...history.state,aifectSearch:searchOrigin},'');
  }
  const input=document.querySelector('#global-search input[name="q"]');if(input)input.value=searchState(raw).label;
 }else if(searchRoute(searchPreviousRoute)){
  const input=document.querySelector('#global-search input[name="q"]');if(input)input.value='';
 }
 searchPreviousRoute=raw;
}
function searchBack(){
 const origin=history.state?.aifectSearch;
 if(origin?.depth>0)history.go(-origin.depth);else location.hash=origin?.route||'home';
}
function searchQuery(state){const query=new URLSearchParams();if(state.q)query.set('q',state.q);if(state.genre)query.set('genre',state.genre);if(state.mood)query.set('mood',state.mood);return query;}
async function unifiedSearchView(param,raw){
 const state=searchState(raw),tab=['tracks','artists','producers','playlists'].includes(state.params.get('type'))?state.params.get('type'):'tracks';
 const d=await api('/api/search?'+searchQuery(state)),counts=d.counts||Object.fromEntries(['tracks','artists','producers','playlists'].map(k=>[k,d[k].length]));
 let html='<div class="unified-search-results"><button type="button" class="text-link search-back" data-search-back>'+icon('chevron-left')+' 돌아가기</button>';
 if(d.recommended?.length)html+='<section class="listening-home-v2 home-content-refresh search-recommendations" aria-label="추천 검색결과">'+section('추천 검색결과')+'<div class="home-music-grid search-recommendation-shelf" tabindex="0" aria-label="추천 검색결과 · 좌우로 이동">'+d.recommended.slice(0,6).map(homeCard).join('')+'</div></section>';
 html+='<div class="search-gradient-divider" aria-hidden="true"></div><section class="search-all-results" aria-label="전체 검색결과"><div class="section-heading search-results-heading"><h2>전체 검색결과</h2>'+`<span class="search-result-count" role="status">${number(counts[tab])}${tab==='tracks'?'곡':'개'}</span></div><nav class="tabs search-type-tabs" aria-label="검색 유형">`;
 html+=[['tracks','노래'],['artists','아티스트'],['producers','제작자'],['playlists','플레이리스트']].map(([key,label])=>{const params=new URLSearchParams(state.params);params.set('type',key);return `<a class="tab ${tab===key?'active':''}" ${tab===key?'aria-current="page"':''} href="#search${state.q?'/'+encodeURIComponent(state.q):''}?${esc(params)}">${label} <span>${number(counts[key])}</span></a>`;}).join('')+'</nav><div id="search-result-items">';
 html+=!d[tab].length?empty('검색 결과가 없어요.','다른 검색어나 결과 탭을 선택해보세요.','#discover','음악 발견하기'):tab==='tracks'?list(d.tracks):tab==='playlists'?collectionGrid(d.playlists):identityCards(d[tab],tab==='artists'?'artist':'producer');
 html+='</div>'+(tab==='tracks'&&d.has_more?'<button class="small-button" data-search-more>더 보기</button>':'')+'</section></div>';
 return {html,tracks:remember([...d.tracks,...(d.recommended||[])]),unifiedSearch:{state,tracks:d.tracks,offset:d.tracks.length}};
}
function bindUnifiedSearch(view){
 searchResizeCleanup?.();searchResizeCleanup=null;
 const back=document.querySelector('[data-search-back]');if(back)back.onclick=searchBack;
 const shelf=document.querySelector('.search-recommendation-shelf');
 if(shelf){
  // Reuse homeCard and its grid gap; fit six slots on PC and three on mobile.
  const resize=()=>{const columns=matchMedia('(max-width:800px)').matches?3:6,gap=parseFloat(getComputedStyle(shelf).columnGap)||0,width=(shelf.clientWidth-(columns-1)*gap)/columns;shelf.style.gridTemplateColumns=`repeat(6,${width}px)`;shelf.style.gridAutoColumns=width+'px';refreshSearchSkin();};
  const observer=new ResizeObserver(resize);observer.observe(shelf);resize();searchResizeCleanup=()=>observer.disconnect();
 }
 const more=document.querySelector('[data-search-more]');
 if(more&&view?.unifiedSearch){const state=view.unifiedSearch;more.onclick=async()=>{more.disabled=true;try{const query=searchQuery(state.state);query.set('offset',state.offset);const d=await api('/api/search?'+query);if(!more.isConnected)return;state.tracks.push(...d.tracks);state.offset+=d.tracks.length;remember(d.tracks);routeTracks=state.tracks;document.querySelector('#search-result-items').innerHTML=list(state.tracks);more.hidden=!d.has_more;icons();paintInteractions();}catch(e){toast(e.message);}finally{more.disabled=false;}};}
}

// Shared skin, applied only to search controls. Existing handlers, names, values,
// filtering, sort controls and IME composition remain on their original nodes.
function normalizeSearchInputs(root=document){
 const selector='input[type="search"],input[aria-label*="검색"],input[placeholder*="검색"],#global-search input,#search-form input[name="q"],#library-search,#playlist-filter';
 for(const input of root.querySelectorAll(selector)){
  if(input.type==='hidden'||input.closest('.brand-search')||input.tagName!=='INPUT')continue;
  const parent=input.parentElement,single=parent.matches('#global-search,.discover-search,.aifect-search,.crew-discovery-search')&&parent.querySelectorAll('input:not([type="hidden"]),select').length===1;
  const shell=single?parent:document.createElement('span');
  if(!single){input.before(shell);shell.append(input);}
  shell.classList.add('brand-search');if(parent.matches('.discover-search'))shell.classList.add('brand-search-wide');
  shell.querySelector(':scope > i')?.remove();
  if(!shell.querySelector(':scope > svg'))shell.insertAdjacentHTML('afterbegin',icon('search'));
  const button=shell.querySelector(':scope > button');
  if(button){button.setAttribute('aria-label',button.getAttribute('aria-label')||'검색');button.innerHTML=icon('search-star');}
  else shell.insertAdjacentHTML('beforeend','<span class="search-sparkle" aria-hidden="true">'+icon('search-star')+'</span>');
 }
}
function markHorizontalScrollers(){
 for(const el of document.querySelectorAll('#main *,#dialog *,#global-search,.topbar .tabs')){
  if(el.matches('input,textarea,select,svg,svg *')||el.classList.contains('brand-horizontal-scroll'))continue;
  const style=getComputedStyle(el);if(['auto','scroll'].includes(style.overflowX)&&el.scrollWidth>el.clientWidth+1){el.classList.add('brand-horizontal-scroll');if(el.scrollHeight<=el.clientHeight+1)el.classList.add('brand-horizontal-only');}
 }
}
let searchSkinFrame=0;
function refreshSearchSkin(){if(searchSkinFrame)return;searchSkinFrame=requestAnimationFrame(()=>{searchSkinFrame=0;normalizeSearchInputs();markHorizontalScrollers();const topbar=document.querySelector('.topbar'),wrap=document.querySelector('.page-wrap');if(topbar&&wrap)wrap.style.setProperty('--topbar-height',topbar.offsetHeight+'px');});}
new MutationObserver(refreshSearchSkin).observe(document.body,{childList:true,subtree:true});
window.addEventListener('resize',refreshSearchSkin,{passive:true});refreshSearchSkin();

