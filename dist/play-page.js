// The Play carousel reuses the home controls and doesn't subscribe to the player.
let playBannerCleanup=null,playBannerElement=null;
const playBanners=[
 {id:'song',label:'노래',heading:['오늘은 네 목소리가','주인공'],description:['좋아하는 노래를 직접 부르고','솔로·듀엣 커버에','참여해 봐.']},
 {id:'dubbing',label:'더빙',heading:['목소리 하나로','달라지는 장면'],description:['다양한 캐릭터와 장면에','나만의 목소리를','입혀봐.']},
 {id:'browse',label:'둘러보기',heading:['다른 사람들은','어떻게 표현했을까?'],description:['완성된 노래와 더빙 작품을','감상하고 새로운 목소리를','발견해 봐.']}
].map(banner=>({...banner,title:banner.heading.join(' ')}));
function playBannerHTML(banner){
 const art='/assets/play-banners/';
 const lines=parts=>parts.map(part=>`<span>${esc(part)}</span>`).join(' ');
 return `<div class="home-feature-background play-banner-art" aria-hidden="true" style="--desktop-art:url('${art}model-v3/${banner.id}-desktop.webp');--mobile-art:url('${art}selected-mobile/${banner.id}-mobile.webp')"></div>
 <a class="home-feature-slide play-banner-link" data-play-banner="${banner.id}" href="${esc(playHref(banner.id))}" aria-label="${esc(banner.title)} · ${banner.label} 탭으로 이동">
   <div class="home-feature-copy"><span class="home-feature-label">${banner.label}</span>
     <h2>${lines(banner.heading)}</h2>
     <p class="home-feature-description">${lines(banner.description)}</p>
   </div>
 </a>`;
}
// @ts-check
// PLAY is a navigation/list layer. It never creates or modifies recording state.
const playSections={song:[['recommended','추천곡','sparkles'],['duets','듀엣참여','users'],['latest','최신곡','clock'],['drafts','내 초안','list-pen']],dubbing:[['discover','작품찾기','compass'],['join','더빙참여','users'],['mine','내 작업','folder']],browse:[['recommended','추천','sparkles'],['following','팔로잉','heart'],['popular','인기','chart'],['latest','최신','clock']]};
const playTypes=[['all','전체'],['solo','솔로'],['duet','듀엣'],['dubbing','더빙']];
function playHref(mode='song',tab=playSections[mode][0][0],type='all'){
 if(mode==='song')return '#karaoke'+(tab==='recommended'?'':'/'+tab);
 return '#karaoke/'+mode+'?'+new URLSearchParams({tab,...(mode==='browse'?{type}:{})});
}
function playAlias(hash){
 const [route,query='']=hash.replace(/^#/,'').split('?'),q=new URLSearchParams(query);
 if(route==='play'||route==='karaoke/songs')return '#karaoke';
 if(route==='dubbing')return ['complete','popular','latest'].includes(q.get('tab'))?playHref('browse',q.get('tab')==='complete'?'recommended':q.get('tab'),'dubbing'):playHref('dubbing',q.get('tab')==='mine'?'mine':'discover');
 if(route==='covers'||route==='community/covers')return playHref('browse','recommended',['solo','duet'].includes(q.get('mode'))?q.get('mode'):'all');
 if(route==='community/latest')return playHref('browse','latest');
 if(route==='community/following'&&!['following','followers'].includes(q.get('people')))return playHref('browse','following',playTypes.some(([k])=>k===q.get('type'))?q.get('type'):'all');
 if(route==='community/duets')return q.get('open')==='1'?playHref('song','duets'):playHref('browse','recommended','duet');
 return null;
}
function playSelection(param,raw){
 const mode=['dubbing','browse'].includes(param)?param:'song',q=new URLSearchParams(raw.split('?')[1]||'');
 const requested=mode==='song'?param:q.get('tab');
 return {mode,tab:playSections[mode].some(([k])=>k===requested)?requested:playSections[mode][0][0],type:playTypes.some(([k])=>k===q.get('type'))?q.get('type'):'all',kind:dubbingCastingKinds.some(([k])=>k===q.get('kind'))?q.get('kind'):'original'};
}
function playTypeIcon(type){
 const label={solo:'솔로',duet:'듀엣',dubbing:'더빙'}[type];
 return `<span class="play-type-icon${type==='duet'?' play-duet-icon':type==='dubbing'?' play-dubbing-icon':''}" role="img" aria-label="${label}">${type==='duet'?icon('mic')+icon('mic'):type==='dubbing'?icon('message')+icon('waveform'):icon('mic')}</span>`;
}
function playTabs(items,active,label,href,extra=''){
 return `<nav class="tabs play-tabs ${extra}" role="tablist" aria-label="${label}">${items.map(([key,title,symbol])=>`<a class="tab ${active===key?'active':''}" role="tab" aria-selected="${active===key}" tabindex="${active===key?'0':'-1'}" ${active===key?'aria-current="page"':''} href="${esc(href(key))}">${symbol?icon(symbol):''}<span>${title}</span></a>`).join('')}</nav>`;
}
function playShell(s,content){
 const menu=s.mode==='dubbing'?[['create','더빙 만들기','plus'],...playSections.dubbing]:playSections[s.mode];
 return `<div class="play-page" data-play-mode="${s.mode}"><div class="home-content-refresh play-banner" id="play-banner" aria-label="플레이 추천 배너"></div>${playTabs([['song','노래'],['dubbing','더빙'],['browse','둘러보기']],s.mode,'플레이 종류',m=>playHref(m),'play-main-tabs')}
 <div class="play-subbar">${playTabs(menu,s.tab,'플레이 하위 메뉴',t=>s.mode==='dubbing'&&t==='create'?'#dubbing/new':playHref(s.mode,t,s.type),'play-category-tabs'+(s.mode==='dubbing'?' play-dubbing-tabs':''))}</div>
 <section class="play-content" aria-label="${playSections[s.mode].find(([k])=>k===s.tab)[1]}">${content}</section></div>`;
}
// Show the selected banner while its list loads, then retain that same carousel
// so the response cannot flash the first slide or restart its four-second clock.
function playPendingView(base,param,raw){
 if(base!=='karaoke'||param==='chart')return null;
 const play=playSelection(param,raw);
 return {play,html:playShell(play,'<div class="route-loading" role="status"><span>불러오는 중…</span><div></div><div></div><div></div></div>')};
}
function bindPlayBanner(play,root=document.querySelector('.play-page')){
 const banner=root?.querySelector('#play-banner');if(!banner)return;
 if(playBannerCleanup&&playBannerElement){
  if(banner!==playBannerElement)banner.replaceWith(playBannerElement);
  return;
 }
 playBannerElement=banner;
 const dispose=mountFeatureCarousel(banner,playBanners,{renderSlide:playBannerHTML,label:'플레이 추천',previousLabel:'이전 플레이 배너',nextLabel:'다음 플레이 배너',dotsLabel:'플레이 배너 선택',syncAudio:false,initialId:play.mode,intervalMs:4000});
 playBannerCleanup=()=>{dispose?.();playBannerElement=null;playBannerCleanup=null;};
}
function playEmpty(title,body,href,label){return `<div class="play-empty" role="status"><h2>${esc(title)}</h2><p>${esc(body)}</p>${href?`<a class="small-button" href="${esc(href)}">${esc(label)}</a>`:''}</div>`;}
function playMusicCard(t,action){
 const type=t.kind==='cover'?(t.cover_mode==='duet'?'duet':'solo'):null;
 let html=card(t);
 if(type)html=html.replace('class="album-title"','class="album-title play-work-title"').replace(`>${esc(t.title)}</a><button type="button" class="card-more"`,`>${playTypeIcon(type)}<span>${esc(t.title)}</span></a><button type="button" class="card-more"`);
 if(action){const href=action==='duet'?'#sing/'+encodeURIComponent(t.original_id)+'?duet='+encodeURIComponent(t.id):'#sing/'+encodeURIComponent(t.id);
  html=html.replace('</article>',`<a class="small-button play-record-link" href="${esc(href)}">${icon('mic')}${action==='duet'?'듀엣 참여':'노래하기'}</a></article>`);}
 return html;
}
function playDubbingCard(p){
 const href='#dubbing/'+encodeURIComponent(p.id);
 return `<article class="album-card"><div class="album-art-wrap"><a href="${href}" aria-label="${esc(p.title)} 작품 보기"><img class="album-art cover play-dubbing-art" src="${AifectDubbing.dubbingGenreArtwork(p.genres)}" alt="${esc((p.genres||[]).join(' · '))} 장르 이미지" width="640" height="640" loading="lazy" decoding="async"></a><a class="card-play" href="${href}" aria-label="${esc(p.title)} 더빙 듣기">${icon('ui-play-action',36)}</a></div><div class="album-title-row"><a class="album-title play-work-title" href="${href}">${playTypeIcon('dubbing')}<span>${esc(p.title)}</span></a></div><span class="album-artist">${userNickname(p.ownerName,{userId:p.ownerId})}</span></article>`;
}
function playDubbingArtworkError(event){
 const image=event.target;if(!image?.matches?.('img.play-dubbing-art'))return;
 const fallback=AifectDubbing.dubbingGenreArtwork();
 if(image.getAttribute('src')!==fallback)image.setAttribute('src',fallback);
}
function playSongRows(tracks,tab){
 const duet=tab==='duets';
 return `<div class="play-song-list">${tracks.map(t=>{
  const id=esc(t.id),title=esc(t.title),href=duet?'#sing/'+encodeURIComponent(t.original_id)+'?duet='+encodeURIComponent(t.id):'#song/'+encodeURIComponent(t.id);
  const artist=t.has_ai_artist?t.artist:'AI 가수 미지정',recordHref=duet?href:'#sing/'+encodeURIComponent(t.id),expandable=Number(t.completions||0)>0;
  const count=duet?`<button type="button" class="list-action count-dropdown play-duet-expand" data-play-duet-children="${id}" data-original="${esc(t.original_id)}" aria-controls="play-duet-children-${id}" aria-expanded="false" ${expandable?'':'disabled'} title="고유 참여자 ${Number(t.participants||0)}명 · 완성작 ${Number(t.completions||0)}개"><span>${Number(t.participants||0)}</span><span data-cover-arrow aria-hidden="true">${icon('ui-chevron')}</span><span class="sr-only">명 참여 · 완성작 펼치기</span></button>`:`<span class="play-song-count">${Number(t.participants||0)}<span class="sr-only">명 참여</span></span>`;
  const recordLabel=duet?'참여하기':'부르기',recordIcon=icon('mic-handheld')+`<span>${recordLabel}</span>`;
  const playback=duet?`<button type="button" class="list-action play-duet-play" data-play="${id}" title="${title} 반곡 재생" aria-label="${title} 반곡 재생">${icon('play')}</button>`:'';
  const row=`<article data-list-row class="${duet?'play-duet-row ':''}play-song-row"><a class="play-song-detail" href="${esc(href)}" aria-label="${title} ${duet?'듀엣 참여':'곡 이야기'}">${cover(t,'play-song-art')}<span class="play-song-copy"><span class="play-song-title" title="${title}">${title}</span><span class="play-song-uploader" title="${esc(t.producer)}">${trackNickname(t,'producer')}</span></span></a>${duet?'':`<span class="play-song-producer" title="제작자: ${esc(t.producer)}">${trackNickname(t,'producer')}</span><span class="play-song-artist" title="AI 가수: ${esc(artist)}">${t.has_ai_artist?trackNickname(t):esc(artist)}</span>`}${duet?'':count}<div class="list-actions${duet?' play-duet-actions':''}">${playback}${duet?count:''}<a class="list-action play-row-record play-row-sing" href="${esc(recordHref)}" title="${title} ${recordLabel}" aria-label="${title} ${recordLabel}">${recordIcon}</a><button type="button" class="list-action play-row-icon" data-track-menu="${id}" title="${title} 더보기" aria-label="${title} 더보기">${icon('ui-menu-action')}</button></div></article>`;
  return row+(duet?`<div class="play-duet-children song-cover-children" id="play-duet-children-${id}" data-parent="${id}" hidden></div>`:'');
 }).join('')}</div>`;
}
function playDuetChildrenHTML(d,parent,original){
 return d.covers.map(t=>songCoverRowHTML(t,{child:true,playChild:true})).join('')+(d.next_offset==null?'':`<button type="button" class="small-button" data-play-duet-more="${esc(parent)}" data-original="${esc(original)}" data-offset="${d.next_offset}">참여작 더 보기</button>`);
}
function bindPlayDuetChildren(root){
 if(root.dataset.playDuetBound)return;
 root.dataset.playDuetBound='true';
 root.addEventListener('click',async event=>{
  if(!(event.target instanceof Element))return;
  const button=event.target.closest('[data-play-duet-children],[data-play-duet-more]');if(!(button instanceof HTMLButtonElement)||button.disabled)return;
  event.preventDefault();event.stopPropagation();
  const parent=button.dataset.playDuetChildren||button.dataset.playDuetMore,target=document.getElementById('play-duet-children-'+parent);
  if(!target)return;
  const toggle=root.querySelector('[data-play-duet-children="'+CSS.escape(parent)+'"]');
  if(button===toggle&&target.dataset.loaded){setSongCoverExpanded(button,target,target.hidden);return;}
  button.disabled=true;button.setAttribute('aria-busy','true');
  try{
   const d=await api('/api/tracks/'+encodeURIComponent(button.dataset.original)+'/covers?view=children&parent='+encodeURIComponent(parent)+'&offset='+(button.dataset.offset||0),'GET',undefined,{fresh:true});
   if(!root.isConnected||!target.isConnected)return;
   remember(d.covers);const html=playDuetChildrenHTML(d,parent,button.dataset.original);
   if(button===toggle){target.innerHTML=html||'<p class="empty-note">아직 완성된 참여작이 없어요.</p>';target.dataset.loaded='true';setSongCoverExpanded(button,target,true);}
   else {button.insertAdjacentHTML('beforebegin',html);button.remove();}
   paintInteractions();bindSongCoverPlayback();
  }catch(error){toast(error.message);}
  finally{button.disabled=false;button.removeAttribute('aria-busy');}
 });
}
function playProjectRows(projects,tab){
 const states={script_ready:'초안',recruiting:'배역 모집 중',recording:'녹음 중',mixing:'믹싱 중',complete:'완료'};
 return `<div class="play-project-list">${projects.map(p=>`<article data-list-row class="play-project-row"><img class="play-project-symbol" src="${AifectDubbing.dubbingGenreArtwork(p.genres)}" alt="" width="52" height="52" loading="lazy" decoding="async"><div><a href="#dubbing/${esc(p.id)}"><h2>${playTypeIcon('dubbing')}<span>${esc(p.title)}</span></h2></a><p>${userNickname(p.ownerName,{userId:p.ownerId})}</p><small>${tab==='discover'?'극본 · '+p.roleCount+'개 배역':tab==='join'?'빈 배역 '+Math.max(0,p.roleCount-p.participants)+'개 · '+p.participants+' / '+p.roleCount+'명':(states[p.state]||'제작 중')+' · '+p.participants+' / '+p.roleCount+'명'}${p.visibility==='private'?' · 비공개':''}</small></div><a class="list-action small-button" href="#dubbing/${esc(p.id)}" aria-label="${esc(p.title)} ${tab==='join'?'배역 보기':tab==='mine'?'이어서 보기':'작품 보기'}" title="${esc(p.title)} 작품 열기">${tab==='join'?icon('ui-plus-action'):(tab==='discover'?'작품 보기':'이어서 보기')+icon('chevron')}</a></article>`).join('')}</div>`;
}
function playToolbar(s){
 const search=`<form id="play-search" class="play-search brand-search" role="search">${icon('search')}<input name="q" type="search" aria-label="플레이 작품 검색" placeholder="${s.mode==='song'?'곡명, 제작자, AI 가수명 검색':'작품 제목, 창작자 검색'}" maxlength="100"><button type="submit" aria-label="검색">${icon('search-star')}</button></form>`;
 return s.mode==='browse'?`<div class="play-discovery-tools">${search}<div class="play-type-filter"><select data-dropdown="sm" id="play-work-type" aria-label="작품 유형">${playTypes.map(([k,l])=>`<option value="${k}" ${s.type===k?'selected':''}>${l}</option>`).join('')}</select></div></div>`:search;
}
function playDraftRows(drafts){
 return `<section class="play-drafts" aria-label="저장한 녹음"><header class="play-draft-toolbar"><h2>저장한 녹음 <span>${drafts.length}</span></h2><button class="small-button danger-button" data-delete-all-drafts ${drafts.length?'':'disabled'}>${icon('trash')} 전체 삭제</button></header><p class="play-draft-note">이 계정으로 현재 기기·브라우저에 저장한 녹음이에요. 다른 기기에는 표시되지 않아요.<br>공개한 커버곡은 초안을 삭제해도 유지돼요.</p>`+(drafts.length?'<div class="play-draft-list">'+drafts.map(d=>{
  const query=d.parent?'duet='+encodeURIComponent(d.parent):'mode='+d.mode+'&part='+encodeURIComponent(d.part),title=d.title||'임시 저장한 녹음';
  return `<article data-list-row class="play-draft-row" data-draft-key="${esc(d.draftKey)}"><span class="play-draft-art" aria-hidden="true">${icon('mic')}</span><div class="play-draft-copy"><h3 title="${esc(title)}">${esc(title)}</h3><p><span>${esc(d.artist||'나의 목소리')}</span><span>${d.mode==='duet'?'DUET':'SOLO'} · ${time(d.duration)}</span><span>${esc(new Date(d.updated).toLocaleDateString('ko-KR'))} 저장</span></p></div><a class="list-action small-button play-draft-resume" href="#sing/${encodeURIComponent(d.id)}?${esc(query)}&draft=1">${icon('edit')} 이어하기</a><button class="list-action icon-button play-draft-delete" data-delete-draft="${esc(d.draftKey)}" data-draft-title="${esc(title)}" aria-label="${esc(title)} 삭제">${icon('trash')}</button></article>`;
 }).join('')+'</div>':`<div class="play-empty" role="status"><h3>첫 목소리를 기다리고 있어요</h3><p>녹음 후 임시 저장하면 여기에 모여요.<br>마음에 들 때까지 편집하고, 준비되면 공개하세요.</p><a class="small-button" href="#karaoke">부를 곡 찾기 ${icon('arrow')}</a></div>`)+'</section>';
}
function playResults(view){
 const s=view.play,items=view.items;
 if(!items.length)return playEmpty(s.tab==='following'?'팔로잉한 창작자의 완성작을 기다려요':'아직 표시할 작품이 없어요',s.mode==='browse'?'공개 완료된 솔로·듀엣·더빙이 여기에 모여요.':s.mode==='dubbing'?'공개된 극본을 둘러보거나 내 이야기를 시작해보세요.':'MR이 준비된 곡과 참여할 수 있는 듀엣이 여기에 모여요.',s.mode==='dubbing'?'#dubbing/new':undefined,'더빙 만들기');
 if(s.mode==='dubbing')return s.tab==='mine'?playProjectRows(items,s.tab):dubbingCastingHTML(view);
 if(s.mode==='song')return `<div class="play-song-unified">${playSongRows(items,s.tab)}</div>`;
 return `<div class="home-music-grid play-grid">${items.map(t=>t.type==='dubbing'?playDubbingCard(t):playMusicCard(t,s.mode==='song'?(s.tab==='duets'?'duet':'song'):null)).join('')}</div>`;
}
async function playView(base,param,raw,readApi=api){
 if((base==='community'&&(!param||param==='voice'))||(base==='voice'&&!param)){
  const v=await voiceView('voice',undefined,readApi.signal);return {...v,playVoice:true};
 }
 if(base!=='karaoke'||param==='chart')return null;
 const s=playSelection(param,raw),view={play:s,items:[],tracks:[],nextOffset:null};
 try{
  if((s.mode==='song'&&s.tab==='drafts'||s.mode==='dubbing'&&s.tab==='mine'||s.mode==='browse'&&s.tab==='following')&&!me){returnRoute=location.hash;return {...view,html:playShell(s,gate())};}
  if(s.mode==='song'&&s.tab==='drafts')return {...view,html:playShell(s,playDraftRows(await listSingDrafts()))};
  if(s.mode==='song'){
   const d=await readApi('/api/play/songs?'+new URLSearchParams({tab:s.tab}),'GET',undefined,{fresh:true});
   view.items=d.tracks;view.nextOffset=d.nextOffset;
  }else if(s.mode==='dubbing'){
   const d=await readApi(s.tab==='mine'?'/api/dubbing/casting/mine?kind='+s.kind:'/api/dubbing/projects?tab=open','GET',undefined,{fresh:true});view.items=d.projects;view.nextOffset=d.nextOffset;
  }else{
   const d=await readApi('/api/play/works?'+new URLSearchParams({tab:s.tab,type:s.type}),'GET',undefined,{fresh:true});view.items=d.works;view.nextOffset=d.nextOffset;view.dubbingAvailable=d.dubbingAvailable;
  }
  view.tracks=view.items.filter(t=>t.type!=='dubbing'&&s.mode!=='dubbing');
  view.html=playShell(s,playToolbar(s)+(s.mode==='dubbing'&&s.tab==='mine'?castingMineTabs(s.kind):'')+(view.dubbingAvailable===false?'<p class="field-help">더빙 목록은 현재 준비 중이에요.</p>':'')+'<div id="play-results" aria-live="polite">'+playResults(view)+'</div><button class="small-button play-more" id="play-more" '+(view.nextOffset===null?'hidden':'')+'>더 보기</button>');
 }catch(e){view.html=playShell(s,`<div class="play-empty" role="alert"><h2>목록을 불러오지 못했어요</h2><p>${esc(e.message)}</p><button class="small-button" data-play-retry>다시 불러오기</button></div>`);}
 return view;
}
function bindPlay(view){
 if(!view?.play)return;
 const root=document.querySelector('.play-page');if(!root)return;
 bindPlayBanner(view.play,root);
 root.addEventListener('error',playDubbingArtworkError,true);
 bindPlayDuetChildren(root);
 if(view.play.mode==='dubbing'&&view.play.tab!=='mine')bindDubbingCasting(view,root);
 root.querySelectorAll('img.play-dubbing-art').forEach(image=>{if(image instanceof HTMLImageElement&&image.complete&&!image.naturalWidth)playDubbingArtworkError({target:image});});
 root.querySelector('[data-play-retry]')?.addEventListener('click',()=>render());
 root.querySelectorAll('nav').forEach(nav=>nav.addEventListener('keydown',e=>{
  if(nav.getAttribute('role')!=='tablist'||!(e.target instanceof HTMLAnchorElement))return;
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  const tabs=[...nav.querySelectorAll('a')],i=tabs.indexOf(e.target);if(i<0)return;e.preventDefault();
  const next=tabs[e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];
  tabs.forEach(tab=>{tab.tabIndex=tab===next?0:-1;});next.focus();
 }));
 const typeFilter=/** @type {HTMLSelectElement} */(root.querySelector('#play-work-type'));
 if(typeFilter)typeFilter.onchange=()=>{location.hash=playHref(view.play.mode,view.play.tab,typeFilter.value);};
 const form=/** @type {HTMLFormElement} */(root.querySelector('#play-search')),more=/** @type {HTMLButtonElement} */(root.querySelector('#play-more')),results=root.querySelector('#play-results');if(!form)return;
 let query=form?.querySelector('input')?.value||'',generation=0;
 const s=view.play;
 const paint=()=>{results.innerHTML=playResults(view);remember(view.items.filter(t=>t.type!=='dubbing'&&s.mode!=='dubbing'));routeTracks=view.items.filter(t=>t.type!=='dubbing'&&s.mode!=='dubbing');more.hidden=view.nextOffset===null;if(s.mode==='dubbing'&&s.tab!=='mine')bindDubbingCasting(view,root);};
 const load=async(append=false)=>{
  const ticket=++generation;more.disabled=true;results.setAttribute('aria-busy','true');
  try{
   const params=new URLSearchParams({tab:s.tab,type:s.type,offset:String(append?view.nextOffset:0),q:query});
   const path=s.mode==='song'?'/api/play/songs?'+params:s.mode==='browse'?'/api/play/works?'+params:s.tab==='mine'?'/api/dubbing/casting/mine?'+params+'&kind='+s.kind:'/api/dubbing/projects?tab=open&offset='+(append?view.nextOffset:0)+'&q='+encodeURIComponent(query);
   const d=await api(path,'GET',undefined,{fresh:true});if(ticket!==generation||!root.isConnected)return;
   const items=d.tracks||d.works||d.projects;view.items=append?[...view.items,...items]:items;view.nextOffset=d.nextOffset;
   paint();
  }catch(e){if(ticket===generation&&root.isConnected){let note=root.querySelector('.play-load-error');if(!note){note=document.createElement('p');note.className='play-load-error';note.setAttribute('role','alert');results.before(note);}note.textContent=e.message+' · 다시 검색하거나 더 보기를 눌러주세요.';}}
  finally{if(ticket===generation&&root.isConnected){more.disabled=false;results.removeAttribute('aria-busy');}}
 };
 form.onsubmit=e=>{e.preventDefault();query=form.querySelector('input').value.trim();root.querySelector('.play-load-error')?.remove();void load();};
 more.onclick=()=>load(true);
}
