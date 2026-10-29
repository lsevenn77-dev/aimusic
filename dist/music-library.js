// Private library presentation. Playback, likes and playlist editors use existing services.
const musicLibraryCategories=[['likes','좋아요'],['history','최근 감상'],['playlists','플레이리스트']];
let musicLibraryState=null,musicLibraryRequest=0;
function musicLibraryOptions(raw){
 const p=new URLSearchParams(raw.split('?')[1]||'');
 return {section:musicLibraryCategories.some(([key])=>key===p.get('section'))?p.get('section'):'likes',q:(p.get('q')||'').slice(0,100),sort:['recent','oldest','title','custom'].includes(p.get('sort'))?p.get('sort'):p.get('sort')==='name'?'title':'recent',filter:['mine','saved'].includes(p.get('filter'))?p.get('filter'):'all'};
}
function musicLibraryHref(options){return menuHref('profile',{view:'library',section:options.section,q:options.q||null,sort:options.sort||'recent',filter:options.filter||'all'});}
async function musicLibraryRead(options,offset=0,readApi=api){return readApi('/api/me/music-library?'+new URLSearchParams({...options,offset,limit:12}),'GET',undefined,{fresh:true});}
function musicLibraryTabs(s){return musicLibraryCategories.map(([key,label])=>`<button type="button" role="tab" id="ml-tab-${key}" aria-controls="ml-panel" aria-selected="${s.options.section===key}" tabindex="${s.options.section===key?0:-1}" data-library-tab="${key}">${label}<span aria-label="${s.data.counts[key]===null?'집계 미지원':number(s.data.counts[key])+'개'}">${s.data.counts[key]===null?'—':number(s.data.counts[key])}</span></button>`).join('');}
function musicLibraryRows(s){
 if(s.options.section==='playlists')return s.data.items.length?`<div class="ml-playlists">${s.data.items.map(collectionCard).join('')}</div>`:myEmpty(s.options.q?'검색 결과가 없어요.':'아직 플레이리스트가 없어요.');
 if(!s.data.items.length)return myEmpty(s.options.q?'검색 결과가 없어요.':s.options.section==='likes'?'좋아요를 누른 음악이 없어요.':'아직 감상한 음악이 없어요.');
 return `<div class="ml-song-list">${s.data.items.map(t=>`<article data-list-row class="ml-song" data-library-track="${esc(t.id)}"><a class="song-table-info" href="#song/${esc(t.id)}">${cover(t,'mini-cover')}<span class="ml-song-copy"><strong title="${esc(t.title)}">${esc(t.title)}</strong><small>${esc(t.producer||'')}${t.has_ai_artist?' · AI '+esc(t.artist):''}</small></span></a><div class="ml-song-actions"><button class="list-action icon-button" data-like="${esc(t.id)}" aria-pressed="${!!t.liked}" title="${esc(t.title)} 좋아요" aria-label="${esc(t.title)} 좋아요">${icon('ui-heart')}</button><button class="list-action icon-button song-table-play" data-play="${esc(t.id)}" title="${esc(t.title)} 재생" aria-label="${esc(t.title)} 재생">${icon('ui-play-action')}</button><button class="list-action icon-button" data-track-menu="${esc(t.id)}" title="${esc(t.title)} 더보기" aria-label="${esc(t.title)} 더보기">${icon('ui-menu-action')}</button></div></article>`).join('')}</div>`;
}
function musicLibraryPanel(s){
 const {options:o,data:d}=s;
 return `${o.section==='playlists'?'<div class="ml-playlist-actions"><button class="primary-button" id="new-playlist">'+icon('plus')+' 플레이리스트 만들기</button><button class="small-button" data-order-collections>목록 순서 편집</button><a class="text-link" href="#collections">플레이리스트 찾기</a></div>':''}<form id="ml-search" class="ml-toolbar" role="search"><label class="ml-search-box"><span class="sr-only">보관함 내 검색</span><input name="q" placeholder="보관함 내 검색" value="${esc(o.q)}" maxlength="100"><button type="submit" class="icon-button" title="보관함 검색" aria-label="보관함 검색">${icon('search')}</button></label>${o.section==='playlists'?`<select name="filter" aria-label="플레이리스트 종류">${[['all','전체 목록'],['mine','내가 만든 목록'],['saved','저장한 목록']].map(([k,l])=>`<option value="${k}" ${o.filter===k?'selected':''}>${l}</option>`).join('')}</select>`:''}<select name="sort" aria-label="보관함 정렬">${[['recent','최신순'],['oldest','오래된순'],['title','이름순'],...(o.section==='playlists'?[['custom','내 순서']]:[])].map(([k,l])=>`<option value="${k}" ${o.sort===k?'selected':''}>${l}</option>`).join('')}</select></form><p class="ml-result-count">${number(d.total)}${o.section==='playlists'?'개 목록':'곡'}${o.section==='history'?' · 곡별 최근 감상순':''}</p><div id="ml-items">${musicLibraryRows(s)}</div><button class="small-button ml-more" id="ml-more" ${d.nextOffset===null?'hidden':''}>더보기</button>`;
}
function musicLibraryHTML(s){return `<section class="mp-library" id="music-library" data-account="${esc(s.account)}" aria-label="내 보관함"><div class="mp-section-head"><h2>내 보관함</h2></div><div class="ml-tabs" role="tablist" aria-label="보관함 카테고리">${musicLibraryTabs(s)}</div><div class="ml-status sr-only" role="status" aria-live="polite"></div><div id="ml-panel" role="tabpanel" tabindex="0" aria-labelledby="ml-tab-${s.options.section}">${musicLibraryPanel(s)}</div></section>`;}
function musicLibraryAside(recommendation){
 const tracks=recommendation?.tracks||[];
 const content=tracks.length?`<div class="ml-recommendations" data-library-gesture-ignore>${tracks.slice(0,4).map(t=>`<article class="ml-recommendation"><a href="#song/${esc(t.id)}">${cover(t,'mini-cover')}<span><strong>${esc(t.title)}</strong><small>${esc(t.producer||t.artist)}</small></span></a><button class="icon-button" data-play="${esc(t.id)}" title="${esc(t.title)} 추천 음악 재생" aria-label="${esc(t.title)} 추천 음악 재생">${icon('ui-play-action')}</button></article>`).join('')}</div>`:myEmpty(recommendation===null?'추천 음악을 불러오지 못했어요.':'아직 추천할 음악이 없어요.');
 return mySection('추천 보관 콘텐츠',content,myAll('#discover','음악 둘러보기'));
}
async function musicLibraryView(raw,readApi=api){
 const options=musicLibraryOptions(raw),account=me?.id;
 const [data,recommendation]=await Promise.all([musicLibraryRead(options,0,readApi),readApi('/api/discovery').catch(()=>null)]);
 const s={options,data,account,memory:new Map(),recommendation};
 return {musicLibrary:s,tracks:[...(options.section==='playlists'?[]:data.items),...(recommendation?.tracks||[]).slice(0,4)],html:musicLibraryHTML(s),libraryAside:musicLibraryAside(recommendation)};
}
function musicLibraryRemember(s){
 const tracks=s.options.section==='playlists'?[]:s.data.items;remember(tracks);routeTracks=tracks;
 // The legacy library read is capped; preserve the authoritative liked state on every loaded page.
 for(const t of tracks){library.likes=library.likes.filter(x=>x.id!==t.id);if(t.liked)library.likes.push(t);}
}
function musicLibraryCenter(){
 const strip=$('#music-library .ml-tabs'),active=strip?.querySelector('[aria-selected="true"]');if(!active)return;
 strip.scrollTo({left:Math.max(0,active.offsetLeft-(strip.clientWidth-active.offsetWidth)/2),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
function musicLibraryGo(section,focus=false){
 const s=musicLibraryState;if(!s||section===s.options.section)return;
 s.memory.set(s.options.section,{...s.options});s.focus=focus;
 location.hash=musicLibraryHref(s.memory.get(section)||{section,q:'',sort:'recent',filter:'all'});
}
// A direction lock excludes vertical drags and short diagonal gestures. Screen-edge gestures belong to the OS.
function boundedCategorySwipe(start,end,index,count){
 const dx=end.x-start.x,dy=end.y-start.y;
 if(start.cancelled||start.x<28||start.x>start.width-28||end.time-start.time>700||Math.abs(dx)<64||Math.abs(dx)<Math.abs(dy)*1.8)return index;
 return Math.max(0,Math.min(count-1,index+(dx<0?1:-1)));
}
function musicLibrarySwipe(start,end,index){return boundedCategorySwipe(start,end,index,musicLibraryCategories.length);}
function bindMusicLibrary(s){
 const root=$('#music-library');if(!root||me?.id!==s.account)return;musicLibraryState=s;musicLibraryRemember(s);
 root.onclick=async e=>{
  const tab=e.target.closest('[data-library-tab]');if(tab){musicLibraryGo(tab.dataset.libraryTab,true);return;}
  const like=e.target.closest('[data-like]');if(like){e.stopPropagation();try{await toggleLike(like);await refreshMusicLibraryRoute(location.hash.slice(1),renderId,true);}catch(err){toast(err.message);}}
 };
 root.querySelector('.ml-tabs').onkeydown=e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
  const i=musicLibraryCategories.findIndex(([key])=>key===s.options.section),n=e.key==='Home'?0:e.key==='End'?musicLibraryCategories.length-1:Math.max(0,Math.min(musicLibraryCategories.length-1,i+(e.key==='ArrowRight'?1:-1)));musicLibraryGo(musicLibraryCategories[n][0],true);
 };
 bindMusicLibraryPanel(s);musicLibraryCenter();paintInteractions();
}
function bindMusicLibraryPanel(s){
 const root=$('#music-library'),panel=$('#ml-panel'),form=$('#ml-search');
 if(form){form.onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(form));location.hash=musicLibraryHref({...s.options,...values});};form.querySelectorAll('select').forEach(el=>el.onchange=()=>form.requestSubmit());}
 const more=$('#ml-more');if(more)more.onclick=async()=>{
  const uid=me?.id,request=++musicLibraryRequest;more.disabled=true;
  try{const data=await musicLibraryRead(s.options,s.data.nextOffset);if(request!==musicLibraryRequest||!root.isConnected||uid!==me?.id)return;s.data={...data,items:[...s.data.items,...data.items]};$('#ml-items').innerHTML=musicLibraryRows(s);more.hidden=data.nextOffset===null;musicLibraryRemember(s);paintInteractions();}
  catch(e){toast(e.message);}finally{more.disabled=false;}
 };
 if($('#new-playlist'))$('#new-playlist').onclick=()=>playlistDialog().catch(e=>toast(e.message));
 bindCategorySwipe(panel,()=>musicLibraryCategories.findIndex(([key])=>key===s.options.section),musicLibraryCategories.length,n=>musicLibraryGo(musicLibraryCategories[n][0]));
}
function bindCategorySwipe(panel,getIndex,count,onChange){
 let start=null;
 panel.addEventListener('touchstart',e=>{
  start=null;if(innerWidth>=1000||e.touches.length!==1||e.target.closest('button,input,select,textarea,[role="slider"],[data-library-gesture-ignore]'))return;
  for(let node=e.target;node&&node!==panel;node=node.parentElement){if(node.scrollWidth>node.clientWidth+2&&['auto','scroll'].includes(getComputedStyle(node).overflowX))return;}
  const t=e.touches[0];start={x:t.clientX,y:t.clientY,width:innerWidth,time:e.timeStamp};
 },{passive:true});
 panel.addEventListener('touchmove',e=>{if(!start)return;if(e.touches.length!==1){start.cancelled=true;return;}const t=e.touches[0],dx=Math.abs(t.clientX-start.x),dy=Math.abs(t.clientY-start.y);if(dy>12&&dy>dx)start.cancelled=true;},{passive:true});
 panel.addEventListener('touchcancel',()=>{start=null;},{passive:true});
 panel.addEventListener('touchend',e=>{if(!start)return;const t=e.changedTouches[0],i=getIndex(),n=boundedCategorySwipe(start,{x:t.clientX,y:t.clientY,time:e.timeStamp},i,count);start=null;if(i!==n)onChange(n);},{passive:true});
}
async function refreshMusicLibraryRoute(raw,ticket,force=false,readApi=api){
 const root=$('#music-library'),s=musicLibraryState;
 if(typeof myPageState!=='undefined'&&myPageState?.tab!=='library')return false;
 if(!s||!root||s.account!==me?.id||!/^profile\?/.test(raw)||new URLSearchParams(raw.split('?')[1]).get('view')!=='library')return false;
 const options=musicLibraryOptions(raw),request=++musicLibraryRequest,oldPanel=$('#ml-panel');
 oldPanel.setAttribute('aria-busy','true');
 oldPanel.innerHTML='<p class="mp-muted" role="status">불러오는 중…</p>';
 try{
  const data=await musicLibraryRead(options,0,readApi);
  if(request!==musicLibraryRequest||!root.isConnected||ticket!==renderId||s.account!==me?.id)return true;
  s.options=options;s.data=data;root.querySelector('.ml-tabs').innerHTML=musicLibraryTabs(s);
  const panel=document.createElement('div');panel.id='ml-panel';panel.className=force?'':'ml-enter';panel.setAttribute('role','tabpanel');panel.tabIndex=0;panel.setAttribute('aria-labelledby','ml-tab-'+options.section);panel.innerHTML=musicLibraryPanel(s);oldPanel.replaceWith(panel);
  $('#main').dataset.route=raw;root.querySelector('.ml-status').textContent=musicLibraryCategories.find(([key])=>key===options.section)[1]+' 선택';
  bindMusicLibraryPanel(s);musicLibraryRemember(s);musicLibraryCenter();paintInteractions();
  if(s.focus){$('#ml-tab-'+options.section)?.focus({preventScroll:true});s.focus=false;}
 }catch(e){if(root.isConnected&&request===musicLibraryRequest&&ticket===renderId&&s.account===me?.id){oldPanel.removeAttribute('aria-busy');oldPanel.innerHTML='';root.querySelector('.ml-status').classList.remove('sr-only');root.querySelector('.ml-status').innerHTML=esc(e.message)+' <button class="text-link" id="ml-retry">다시 시도</button>';$('#ml-retry').onclick=()=>refreshMusicLibraryRoute(raw,renderId,true);}}
 return true;
}
