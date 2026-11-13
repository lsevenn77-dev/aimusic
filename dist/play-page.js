// The Play carousel reuses the home controls and doesn't subscribe to the player.
let playBannerCleanup=null,playBannerElement=null,playBannerMode=null;
const playBanners=[
 {id:'song',label:'노래',heading:['오늘은 네 목소리가','주인공'],description:['좋아하는 노래를 직접 부르고','솔로·듀엣 커버에','참여해 봐.']},
 {id:'dubbing',label:'더빙',heading:['목소리 하나로','달라지는 장면'],description:['다양한 캐릭터와 장면에','나만의 목소리를','입혀봐.']},
 {id:'browse',label:'둘러보기',heading:['다른 사람들은','어떻게 표현했을까?'],description:['완성된 노래와 더빙 작품을','감상하고 새로운 목소리를','발견해 봐.']}
].map(banner=>({...banner,title:banner.heading.join(' ')}));
function playBannerHTML(banner){
 const art='/assets/play-banners/';
 const desktopArt=banner.id==='browse'?'desktop-wide-20261109':'desktop-background-20261109';
 const lines=parts=>parts.map(part=>`<span>${esc(part)}</span>`).join(' ');
 return `<div class="home-feature-background play-banner-art" data-play-art="${banner.id}" aria-hidden="true" style="--desktop-art:url('${art}${desktopArt}/${banner.id}-desktop.webp');--mobile-art:url('${art}selected-mobile/${banner.id}-mobile.webp')"></div>
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
// A Play tab is a state of this shell, not a new page. Keep the existing hashes
// so deep links, aliases, native links and browser history share one route path.
function playRouteSelection(raw){
 raw=String(raw||'').replace(/^#\/?/,'');
 raw=(playAlias('#'+raw)||'#'+raw).slice(1);
 const [route]=raw.split('?'),[base,param]=route.split('/');
 return base==='karaoke'&&param!=='chart'&&route.split('/').length<=2?playSelection(param,raw):null;
}
function playRouteTargetsHTML(raw=''){
 const routes=new Set(['#play','#karaoke/songs','#karaoke/dubbing','#karaoke/browse']);
 for(const [mode,tabs] of Object.entries(playSections))for(const [tab] of tabs){
  for(const [type] of mode==='browse'?playTypes:[['all']])routes.add(playHref(mode,tab,type));
 }
 for(const [kind] of dubbingCastingKinds)routes.add('#karaoke/dubbing?tab=mine&kind='+kind);
 if(raw)routes.add('#'+raw.replace(/^#/,''));
 return '<div data-play-route-targets hidden aria-hidden="true">'+[...routes].map(href=>'<span data-play-route-target id="'+esc(href.slice(1))+'"></span>').join('')+'</div>';
}
function playSubtabs(s){
 const menu=s.mode==='dubbing'?[['create','더빙 만들기','plus'],...playSections.dubbing]:playSections[s.mode];
 return playTabs(menu,s.tab,'플레이 하위 메뉴',t=>s.mode==='dubbing'&&t==='create'?'#dubbing/new':playHref(s.mode,t,s.type),'play-category-tabs'+(s.mode==='dubbing'?' play-dubbing-tabs':''));
}
function playTypeIcon(type){
 const label={solo:'솔로',duet:'듀엣',dubbing:'더빙'}[type];
 return `<span class="play-type-icon${type==='duet'?' play-duet-icon':type==='dubbing'?' play-dubbing-icon':''}" role="img" aria-label="${label}">${type==='duet'?icon('mic')+icon('mic'):type==='dubbing'?icon('message')+icon('waveform'):icon('mic')}</span>`;
}
function playTabs(items,active,label,href,extra=''){
 const primary=extra==='play-main-tabs';
 return `<nav class="tabs play-tabs ${extra}${primary?' aifect-main-tabs':''}" role="tablist" aria-label="${label}">${items.map(([key,title,symbol],index)=>`<a class="tab ${active===key?'active':''}" role="tab" aria-selected="${active===key}" tabindex="${active===key?'0':'-1'}" ${active===key?'aria-current="page"':''} ${primary?`data-tab-tone="${['pink','mint','purple'][index]}"`:''} href="${esc(href(key))}">${symbol?icon(symbol):''}<span>${title}</span></a>`).join('')}</nav>`;
}
function playShell(s,content,raw=''){
 return `<div class="play-page" data-play-mode="${s.mode}">${playRouteTargetsHTML(raw)}<div class="home-content-refresh play-banner" id="play-banner" aria-label="플레이 추천 배너"></div>${playTabs([['song','노래'],['dubbing','더빙'],['browse','둘러보기']],s.mode,'플레이 종류',m=>playHref(m),'play-main-tabs')}
 <div class="play-subbar">${playSubtabs(s)}</div>
 <section class="play-content" aria-label="${playSections[s.mode].find(([k])=>k===s.tab)[1]}">${content}</section></div>`;
}
// Show the selected banner while its list loads, then retain that same carousel
// so the response cannot flash the first slide or restart its four-second clock.
function playPendingView(base,param,raw){
 if(base!=='karaoke'||param==='chart')return null;
 const play=playSelection(param,raw);
 const view={play,raw,items:[],tracks:[],nextOffset:null,pending:true};
 return {...view,html:playShell(play,playContentHTML(view),raw)};
}
function selectPlayBanner(mode){
 if(!playBanners.some(banner=>banner.id===mode))return;
 playBannerCleanup?.select?.(mode);playBannerMode=mode;
}
function bindPlayBanner(play,root=document.querySelector('.play-page')){
 const banner=root?.querySelector('#play-banner');if(!banner)return;
 if(playBannerCleanup&&playBannerElement){
  if(banner!==playBannerElement)banner.replaceWith(playBannerElement);
  if(playBannerMode!==play.mode)selectPlayBanner(play.mode);
  return;
 }
 playBannerElement=banner;playBannerMode=play.mode;
 const dispose=mountFeatureCarousel(banner,playBanners,{renderSlide:playBannerHTML,label:'플레이 추천',previousLabel:'이전 플레이 배너',nextLabel:'다음 플레이 배너',dotsLabel:'플레이 배너 선택',syncAudio:false,initialId:play.mode,intervalMs:4000,retainOnRoute:()=>typeof location!=='undefined'&&!!playRouteSelection(location.hash.slice(1))&&banner.isConnected});
 playBannerCleanup=Object.assign(()=>{dispose?.();playBannerElement=null;playBannerMode=null;playBannerCleanup=null;},{select:dispose?.select});
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
 return `<article class="album-card"><div class="album-art-wrap"><a href="${href}" aria-label="${esc(p.title)} 작품 보기"><img class="album-art cover play-dubbing-art" src="${esc(p.posterUrl||AifectDubbing.dubbingGenreArtwork(p.genres))}" alt="" width="640" height="640" loading="lazy" decoding="async"></a><button type="button" class="card-play" data-mp-dubbing-play="${esc(p.id)}" aria-label="${esc(p.title)} 더빙 듣기">${icon('ui-play-action',36)}</button></div><div class="album-title-row"><a class="album-title play-work-title" href="${href}">${playTypeIcon('dubbing')}<span>${esc(p.title)}</span></a></div><span class="album-artist">${userNickname(p.ownerName,{userId:p.ownerId})}</span></article>`;
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
 return `<div class="play-project-list">${projects.map(p=>`<article data-list-row class="play-project-row"><img class="play-project-symbol" src="${esc(p.posterUrl||AifectDubbing.dubbingGenreArtwork(p.genres))}" alt="" width="52" height="52" loading="lazy" decoding="async"><div><a href="#dubbing/${esc(p.id)}"><h2>${playTypeIcon('dubbing')}<span>${esc(p.title)}</span></h2></a><p>${userNickname(p.ownerName,{userId:p.ownerId})}</p><small>${tab==='discover'?'극본 · '+p.roleCount+'개 배역':tab==='join'?'빈 배역 '+Math.max(0,p.roleCount-p.participants)+'개 · '+p.participants+' / '+p.roleCount+'명':(states[p.state]||'제작 중')+' · '+p.participants+' / '+p.roleCount+'명'}${p.visibility==='private'?' · 비공개':''}</small></div><a class="list-action small-button" href="#dubbing/${esc(p.id)}" aria-label="${esc(p.title)} ${tab==='join'?'배역 보기':tab==='mine'?'이어서 보기':'작품 보기'}" title="${esc(p.title)} 작품 열기">${tab==='join'?icon('ui-plus-action'):(tab==='discover'?'작품 보기':'이어서 보기')+icon('chevron')}</a></article>`).join('')}</div>`;
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
 if(view.discovery)return dubDiscoveryHTML(view);
 if(!items.length)return playEmpty(s.tab==='following'?'팔로잉한 창작자의 완성작을 기다려요':'아직 표시할 작품이 없어요',s.mode==='browse'?'공개 완료된 솔로·듀엣·더빙이 여기에 모여요.':s.mode==='dubbing'?'공개된 극본을 둘러보거나 내 이야기를 시작해보세요.':'MR이 준비된 곡과 참여할 수 있는 듀엣이 여기에 모여요.',s.mode==='dubbing'?'#dubbing/new':undefined,'더빙 만들기');
 if(s.mode==='dubbing')return s.tab==='mine'?playProjectRows(items,s.tab):dubbingCastingHTML(view);
 if(s.mode==='song')return `<div class="play-song-unified">${playSongRows(items,s.tab)}</div>`;
 return `<div class="home-music-grid play-grid">${items.map(t=>t.type==='dubbing'?playDubbingCard(t):playMusicCard(t,s.mode==='song'?(s.tab==='duets'?'duet':'song'):null)).join('')}</div>`;
}
const playNavigationCache=new Map();
const playCacheAccount=()=>typeof me==='undefined'?'guest':me?.id||'guest';
const playCacheRevision=()=>typeof apiRevision==='number'?apiRevision:0;
function cachedPlayView(raw){
 const key=playCacheAccount()+':'+raw,entry=playNavigationCache.get(key);
 if(!entry)return null;
 if(entry.revision!==playCacheRevision()||entry.until<=Date.now()){playNavigationCache.delete(key);return null;}
 return {...entry.view,play:{...entry.view.play},items:[...entry.view.items],tracks:[...entry.view.tracks]};
}
function cachePlayView(view){
 if(view.pending||view.error||view.gated||view.play.mode==='song'&&view.play.tab==='drafts'||view.account!==playCacheAccount()||view.revision!==playCacheRevision())return;
 const key=view.account+':'+view.raw;
 const {html,...data}=view;playNavigationCache.delete(key);
 playNavigationCache.set(key,{view:data,revision:view.revision,until:Date.now()+30000});
 while(playNavigationCache.size>24)playNavigationCache.delete(playNavigationCache.keys().next().value);
}
function playListHTML(view){
 if(view.pending)return '<div class="route-loading" role="status"><span>불러오는 중…</span><div></div><div></div><div></div></div>';
 if(view.error)return `<div class="play-empty" role="alert"><h2>목록을 불러오지 못했어요</h2><p>${esc(view.error)}</p><button class="small-button" data-play-retry>다시 불러오기</button></div>`;
 if(view.gated)return gate();
 if(view.play.mode==='song'&&view.play.tab==='drafts')return playDraftRows(view.drafts||[]);
 return (view.dubbingAvailable===false?'<p class="field-help">더빙 목록은 현재 준비 중이에요.</p>':'')+playResults(view);
}
function playToolsHidden(view){return view.discovery||view.gated||view.play.mode==='song'&&view.play.tab==='drafts';}
function playExtraHTML(view){return !view.gated&&view.play.mode==='dubbing'&&view.play.tab==='mine'?castingMineTabs(view.play.kind):'';}
function playContentHTML(view){
 return `<div data-play-tools ${playToolsHidden(view)?'hidden':''}>${playToolbar(view.play)}</div><div data-play-extra>${playExtraHTML(view)}</div><div id="play-results" aria-live="polite"${view.pending?' aria-busy="true"':''}>${playListHTML(view)}</div><button class="small-button play-more" id="play-more" ${(view.nextOffset==null||view.pending||view.error||view.gated)?'hidden':''}>더 보기</button>`;
}
function playDataPath(s,query='',offset=0){
 const params=new URLSearchParams({tab:s.tab});
 if(s.mode==='browse')params.set('type',s.type);
 if(query)params.set('q',query);
 if(offset)params.set('offset',String(offset));
 return s.mode==='song'?'/api/play/songs?'+params:s.mode==='browse'?'/api/play/works?'+params:s.tab==='mine'?'/api/dubbing/casting/mine?'+new URLSearchParams({kind:s.kind,...(query?{q:query}:{}),...(offset?{offset:String(offset)}:{})}):'/api/dubbing/projects?'+new URLSearchParams({tab:'open',...(query?{q:query}:{}),...(offset?{offset:String(offset)}:{})});
}
async function playView(base,param,raw,readApi=api){
 if((base==='community'&&(!param||param==='voice'))||(base==='voice'&&!param)){
  const v=await voiceView('voice',undefined,readApi.signal);return {...v,playVoice:true};
 }
 if(base!=='karaoke'||param==='chart')return null;
 const s=playSelection(param,raw),view={play:s,raw,account:playCacheAccount(),revision:playCacheRevision(),items:[],tracks:[],nextOffset:null,query:''};
 try{
  if((s.mode==='song'&&s.tab==='drafts'||s.mode==='dubbing'&&s.tab==='mine'||s.mode==='browse'&&s.tab==='following')&&!me){returnRoute=location.hash;view.gated=true;}
  else if(s.mode==='song'&&s.tab==='drafts')view.drafts=await listSingDrafts();
  else{
   const cached=cachedPlayView(raw);
   if(cached)return {...cached,html:playShell(s,playContentHTML(cached),raw)};
   if(typeof isDubDiscovery==='function'&&isDubDiscovery(view)){view.discovery=await readDubDiscovery(view,readApi);}else{
   const d=await readApi(playDataPath(s),'GET',undefined,{fresh:true});
   view.items=d.tracks||d.works||d.projects||[];view.nextOffset=d.nextOffset??null;view.dubbingAvailable=d.dubbingAvailable;
   view.tracks=view.items.filter(t=>t.type!=='dubbing'&&s.mode!=='dubbing');
   }
   cachePlayView(view);
  }
 }catch(e){if(e.name==='AbortError')throw e;view.error=e.message;}
 view.html=playShell(s,playContentHTML(view),raw);
 return view;
}
function canRefreshPlayRoute(raw){
 const main=document.querySelector('#main');
 return !!(playRouteSelection(raw)&&playRouteSelection(main?.dataset.route)&&main?.dataset.account===playCacheAccount()&&main.querySelector('.play-page [data-play-tools]'));
}
function playSetTabState(nav,selected,mode,type){
 nav?.querySelectorAll('a[role="tab"]').forEach(tab=>{
  const s=playRouteSelection(tab.getAttribute('href'));
  const active=!!s&&(mode?s.tab===selected:s.mode===selected);
  tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
  if(active)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
  if(mode&&s)tab.setAttribute('href',playHref(mode,s.tab,type));
 });
}
// Hold enough space for the current viewport when a shorter tab replaces a long
// list. Release that extra space as the reader scrolls up, never jump to the top.
function holdPlayViewport(root,pending=false){
 const content=root.querySelector('.play-content');if(!content?.getBoundingClientRect)return;
 const rect=content.getBoundingClientRect(),scale=content.offsetHeight?rect.height/content.offsetHeight:1;
 const height=Math.max(pending?rect.height:0,(window.scrollY||0)>0?window.innerHeight-rect.top:0);
 content.style.minHeight=height>0?Math.ceil(height/(scale||1))+'px':'';
}
function paintPlayRoute(view,raw){
 const main=document.querySelector('#main'),root=main.querySelector('.play-page'),s=view.play;
 const changedMode=root.dataset.playMode!==s.mode;
 holdPlayViewport(root,true);
 root._playListCleanup?.();root._playView=view;
 root.dataset.playMode=s.mode;
 playSetTabState(root.querySelector('.play-main-tabs'),s.mode);
 if(changedMode)root.querySelector('.play-subbar').innerHTML=playSubtabs(s);
 else playSetTabState(root.querySelector('.play-category-tabs'),s.tab,s.mode,s.type);
 const tools=root.querySelector('[data-play-tools]');
 if(changedMode)tools.innerHTML=playToolbar(s);
 tools.hidden=!!playToolsHidden(view);
 const field=tools.querySelector('input');if(field)field.value=view.query||'';
 const type=tools.querySelector('#play-work-type');if(type)type.value=s.type;
 const extra=root.querySelector('[data-play-extra]'),extraHTML=playExtraHTML(view);
 if(extra.innerHTML!==extraHTML)extra.innerHTML=extraHTML;
 root.querySelector('.play-content').setAttribute('aria-label',playSections[s.mode].find(([key])=>key===s.tab)[1]);
 root.querySelector('.play-load-error')?.remove();
 const results=root.querySelector('#play-results');results.innerHTML=playListHTML(view);
 if(view.pending)results.setAttribute('aria-busy','true');else results.removeAttribute('aria-busy');
 const more=root.querySelector('#play-more');more.hidden=view.nextOffset==null||!!(view.pending||view.error||view.gated);more.disabled=false;
 // Remember any direct-link query too, so back/forward stays inside the shell.
 if(![...root.querySelectorAll('[data-play-route-target]')].some(target=>target.id===raw)){
  const target=document.createElement('span');target.setAttribute('data-play-route-target','');target.id=raw;root.querySelector('[data-play-route-targets]').append(target);
 }
 main.dataset.route=raw;main.classList.toggle('secondary-page',s.mode==='song'&&s.tab==='drafts');
 routeTracks=remember(view.tracks||[]);
 bindPlay(view);icons();paintInteractions();
 holdPlayViewport(root,!!view.pending);
 return root;
}
async function refreshPlayRoute(raw,ticket,readApi=api,visible){
 if(!canRefreshPlayRoute(raw))return false;
 const play=playRouteSelection(raw),account=playCacheAccount(),revision=playCacheRevision();
 const cached=cachedPlayView(raw),pending=cached||{play,raw,account,revision,items:[],tracks:[],nextOffset:null,pending:true};
 const root=paintPlayRoute(pending,raw),mounted=()=>ticket===renderId&&root.isConnected&&root._playView===pending,current=()=>mounted()&&account===playCacheAccount();
 visible?.();
 let timedOut=false;
 const timer=setTimeout(()=>{if(current()){timedOut=true;paintPlayRoute({...pending,pending:false,error:'연결이 지연되고 있어요. 다시 시도해주세요.'},raw);}},20000);
 try{
  // The first shell is visible while boot resolves the account. A quick tab
  // click must not settle a guest gate or read before that identity is known.
  await (typeof accountReady==='undefined'?undefined:accountReady);
  if(!mounted()||timedOut)return true;
  if(account!==playCacheAccount()||revision!==playCacheRevision()){void render();return true;}
  if(cached&&cachedPlayView(raw))return true;
  const view=await playView('karaoke',raw.split('/')[1]?.split('?')[0],raw,readApi);
  if(!current()||timedOut)return true;
  if(revision!==playCacheRevision()){void render();return true;}
  paintPlayRoute(view,raw);
 }catch(e){if(current()&&e.name!=='AbortError')paintPlayRoute({...pending,pending:false,error:e.message},raw);}
 finally{clearTimeout(timer);}
 return true;
}
function bindPlay(view){
 if(!view?.play)return;
 const root=document.querySelector('.play-page');if(!root)return;
 root._playListCleanup?.();root._playView=view;
 bindPlayBanner(view.play,root);
 if(!root.dataset.playBound){
  root.dataset.playBound='true';
  root.addEventListener('error',playDubbingArtworkError,true);
  bindPlayDuetChildren(root);
  root.addEventListener('click',event=>{
   if(!(event.target instanceof Element))return;
   if(!event.defaultPrevented&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&(event.button==null||event.button===0)){
    const tab=event.target.closest('.play-main-tabs a[role="tab"]');
    if(tab)selectPlayBanner(playRouteSelection(tab.getAttribute('href'))?.mode);
   }
   if(event.target.closest('[data-play-retry]')){playNavigationCache.delete(playCacheAccount()+':'+root._playView.raw);void render();}
  });
  root.addEventListener('keydown',e=>{
   if(!(e.target instanceof HTMLAnchorElement))return;
   const nav=e.target.closest('nav[role="tablist"]');if(!nav||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
   const tabs=[...nav.querySelectorAll('a')],i=tabs.indexOf(e.target);if(i<0)return;e.preventDefault();
   const next=tabs[e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];
   tabs.forEach(tab=>{tab.tabIndex=tab===next?0:-1;});next.focus({preventScroll:true});
  });
  const scroll=()=>{if(root.isConnected&&!root._playView?.pending)holdPlayViewport(root);};
  window.addEventListener('scroll',scroll,{passive:true});
  if(typeof registerRouteCleanup==='function')registerRouteCleanup(()=>{window.removeEventListener('scroll',scroll);root._playListCleanup?.();});
 }
 root.classList?.toggle('dub-discovery-active',typeof isDubDiscovery==='function'&&isDubDiscovery(view));
 if(view.discovery){bindDubDiscovery(view,root);return;}
 if(!view.pending&&!view.error&&!view.gated&&view.play.mode==='dubbing'&&view.play.tab!=='mine')bindDubbingCasting(view,root);
 root.querySelectorAll('img.play-dubbing-art').forEach(image=>{if(image instanceof HTMLImageElement&&image.complete&&!image.naturalWidth)playDubbingArtworkError({target:image});});
 const typeFilter=root.querySelector('#play-work-type');
 if(typeFilter)typeFilter.onchange=()=>{location.hash=playHref(view.play.mode,view.play.tab,typeFilter.value);};
 const form=root.querySelector('#play-search'),more=root.querySelector('#play-more'),results=root.querySelector('#play-results');if(!form)return;
 form.inert=!!view.pending;
 const controller=new AbortController(),account=playCacheAccount(),routeTicket=renderId;
 let generation=0;
 root._playListCleanup=()=>{generation++;controller.abort();};
 const current=()=>root.isConnected&&root._playView===view&&!controller.signal.aborted&&account===playCacheAccount()&&routeTicket===renderId;
 const s=view.play;
 const paint=()=>{
  holdPlayViewport(root,true);results.innerHTML=playResults(view);
  view.tracks=view.items.filter(t=>t.type!=='dubbing'&&s.mode!=='dubbing');routeTracks=remember(view.tracks);more.hidden=view.nextOffset==null;
  cachePlayView(view);
  if(s.mode==='dubbing'&&s.tab!=='mine')bindDubbingCasting(view,root);
  icons();paintInteractions();holdPlayViewport(root);
 };
 const load=async(append=false)=>{
  if(view.pending||!current()||append&&view.nextOffset==null)return;
  const ticket=++generation,revision=playCacheRevision();more.disabled=true;results.setAttribute('aria-busy','true');
  try{
   const d=await api(playDataPath(s,view.query||'',append?view.nextOffset:0),'GET',undefined,{fresh:true,signal:controller.signal});
   if(ticket!==generation||!current()||revision!==playCacheRevision())return;
   const items=d.tracks||d.works||d.projects||[];view.items=append?[...view.items,...items]:items;view.nextOffset=d.nextOffset??null;view.revision=revision;
   paint();
  }catch(e){if(e.name!=='AbortError'&&ticket===generation&&current()){let note=root.querySelector('.play-load-error');if(!note){note=document.createElement('p');note.className='play-load-error';note.setAttribute('role','alert');results.before(note);}note.textContent=e.message+' · 다시 검색하거나 더 보기를 눌러주세요.';}}
  finally{if(ticket===generation&&current()){more.disabled=false;results.removeAttribute('aria-busy');}}
 };
 form.onsubmit=e=>{e.preventDefault();view.query=form.querySelector('input').value.trim();root.querySelector('.play-load-error')?.remove();void load();};
 more.onclick=()=>load(true);
}
