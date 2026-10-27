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
 return {mode,tab:playSections[mode].some(([k])=>k===requested)?requested:playSections[mode][0][0],type:playTypes.some(([k])=>k===q.get('type'))?q.get('type'):'all'};
}
function playTypeIcon(type){
 const label={solo:'솔로',duet:'듀엣',dubbing:'더빙'}[type];
 return `<span class="play-type-icon${type==='duet'?' play-duet-icon':type==='dubbing'?' play-dubbing-icon':''}" role="img" aria-label="${label}">${type==='duet'?icon('mic')+icon('mic'):type==='dubbing'?icon('message')+icon('waveform'):icon('mic')}</span>`;
}
function playTabs(items,active,label,href,extra=''){
 return `<nav class="tabs play-tabs ${extra}" role="tablist" aria-label="${label}">${items.map(([key,title,symbol])=>`<a class="tab ${active===key?'active':''}" role="tab" aria-selected="${active===key}" tabindex="${active===key?'0':'-1'}" ${active===key?'aria-current="page"':''} href="${esc(href(key))}">${symbol?icon(symbol):''}<span>${title}</span></a>`).join('')}</nav>`;
}
function playShell(s,content){
 return `<div class="play-page">${heading('플레이','노래하고, 연기하고, 새로운 목소리를 만나보세요.')}${playTabs([['song','노래'],['dubbing','더빙'],['browse','둘러보기']],s.mode,'플레이 종류',m=>playHref(m),'play-main-tabs')}
 <div class="play-subbar">${playTabs(playSections[s.mode],s.tab,'플레이 하위 메뉴',t=>playHref(s.mode,t,s.type),'play-category-tabs')}${s.mode==='dubbing'?'<a class="primary-button play-create" href="#dubbing/new">'+icon('plus')+' 더빙 만들기</a>':''}</div>
 <section class="play-content" aria-label="${playSections[s.mode].find(([k])=>k===s.tab)[1]}">${content}</section></div>`;
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
 return `<article class="album-card"><div class="album-art-wrap"><a href="${href}" aria-label="${esc(p.title)} 작품 보기"><img class="album-art cover play-dubbing-art" src="${AifectDubbing.dubbingGenreArtwork(p.genres)}" alt="${esc((p.genres||[]).join(' · '))} 장르 이미지" width="640" height="640" loading="lazy" decoding="async"></a><a class="card-play" href="${href}" aria-label="${esc(p.title)} 더빙 듣기">${icon('audio-play',36)}</a></div><div class="album-title-row"><a class="album-title play-work-title" href="${href}">${playTypeIcon('dubbing')}<span>${esc(p.title)}</span></a></div><span class="album-artist">${esc(p.ownerName)}</span><span class="album-meta">${esc((p.genres||[]).join(' · '))} · ${time(p.duration)}</span></article>`;
}
function playDubbingArtworkError(event){
 const image=event.target;if(!image?.matches?.('img.play-dubbing-art'))return;
 const fallback=AifectDubbing.dubbingGenreArtwork();
 if(image.getAttribute('src')!==fallback)image.setAttribute('src',fallback);
}
function playSongRows(tracks,tab){
 const duet=tab==='duets';
 return `<div class="play-song-list">${tracks.map(t=>{
  const href=duet?'#sing/'+encodeURIComponent(t.original_id)+'?duet='+encodeURIComponent(t.id):'#song/'+encodeURIComponent(t.id);
  const artist=duet?t.original_artist:(t.has_ai_artist?t.artist:'AI 가수 미지정');
  return `<a class="play-song-row" href="${esc(href)}" aria-label="${esc(t.title)} ${duet?'듀엣 참여':'곡 이야기'}">${cover(t,'play-song-art')}<span class="play-song-title" title="${esc(t.title)}">${esc(t.title)}</span><span class="play-song-producer" title="제작자: ${esc(t.producer)}">${esc(t.producer)}</span><span class="play-song-artist" title="AI 가수: ${esc(artist)}">${esc(artist)}</span><span class="play-song-count">${esc(t.participants)}명 참여</span></a>`;
 }).join('')}</div>`;
}
function playProjectRows(projects,tab){
 const states={script_ready:'초안',recruiting:'배역 모집 중',recording:'녹음 중',mixing:'믹싱 중',complete:'완료'};
 return `<div class="play-project-list">${projects.map(p=>`<article class="play-project-row"><img class="play-project-symbol" src="${AifectDubbing.dubbingGenreArtwork(p.genres)}" alt="" width="52" height="52" loading="lazy" decoding="async"><div><a href="#dubbing/${esc(p.id)}"><h2>${playTypeIcon('dubbing')}<span>${esc(p.title)}</span></h2></a><p>${esc(p.ownerName)} · ${esc((p.genres||[]).join(' · '))} · ${time(p.duration)}</p><small>${tab==='discover'?'극본 · '+p.roleCount+'개 배역':(states[p.state]||'제작 중')+' · '+p.participants+' / '+p.roleCount+'명'}${p.visibility==='private'?' · 비공개':''}</small></div><a class="small-button" href="#dubbing/${esc(p.id)}">${tab==='discover'?'작품 보기':tab==='join'?'배역 보기':'이어서 보기'}${icon('chevron')}</a></article>`).join('')}</div>`;
}
function playToolbar(s){return `<form id="play-search" class="aifect-search play-search">${icon('search')}<input name="q" type="search" aria-label="플레이 작품 검색" placeholder="${s.mode==='song'?'곡명, 제작자, AI 가수명 검색':'작품 제목, 창작자 검색'}" maxlength="100"><button class="small-button" type="submit">검색</button></form>${s.mode==='browse'?`<label class="play-type-filter"><span>작품 유형</span><select id="play-work-type">${playTypes.map(([k,l])=>`<option value="${k}" ${s.type===k?'selected':''}>${l}</option>`).join('')}</select></label>`:''}`;}
function playResults(view){
 const s=view.play,items=view.items;
 if(!items.length)return playEmpty(s.tab==='following'?'팔로잉한 창작자의 완성작을 기다려요':'아직 표시할 작품이 없어요',s.mode==='browse'?'공개 완료된 솔로·듀엣·더빙이 여기에 모여요.':s.mode==='dubbing'?'공개된 극본을 둘러보거나 내 이야기를 시작해보세요.':'MR이 준비된 곡과 참여할 수 있는 듀엣이 여기에 모여요.',s.mode==='dubbing'?'#dubbing/new':undefined,'더빙 만들기');
 if(s.mode==='dubbing')return playProjectRows(items,s.tab);
 if(s.mode==='song')return `<div class="play-song-desktop">${playSongRows(items,s.tab)}</div><div class="home-music-grid play-grid play-song-mobile">${items.map(t=>playMusicCard(t,s.tab==='duets'?'duet':'song')).join('')}</div>`;
 return `<div class="home-music-grid play-grid">${items.map(t=>t.type==='dubbing'?playDubbingCard(t):playMusicCard(t,s.mode==='song'?(s.tab==='duets'?'duet':'song'):null)).join('')}</div>`;
}
async function playView(base,param,raw){
 if((base==='community'&&(!param||param==='voice'))||(base==='voice'&&!param)){
  const v=await voiceView('voice');return {...v,playVoice:true};
 }
 if(base!=='karaoke'||param==='chart')return null;
 const s=playSelection(param,raw),view={play:s,items:[],tracks:[],nextOffset:null};
 try{
  if((s.mode==='song'&&s.tab==='drafts'||s.mode==='dubbing'&&s.tab==='mine'||s.mode==='browse'&&s.tab==='following')&&!me){returnRoute=location.hash;return {...view,html:playShell(s,gate())};}
  if(s.mode==='song'&&s.tab==='drafts')return {...view,html:playShell(s,karaokeDraftsHTML(await listSingDrafts()).replace(/^.*?(?=<section class="draft-workspace">)/s,''))};
  if(s.mode==='song'){
   const d=await api('/api/play/songs?'+new URLSearchParams({tab:s.tab}),'GET',undefined,{fresh:true});
   view.items=d.tracks;view.nextOffset=d.nextOffset;
  }else if(s.mode==='dubbing'){
   const d=await api(s.tab==='join'?'/api/play/participate':'/api/dubbing/projects?tab='+(s.tab==='mine'?'mine':'open'),'GET',undefined,{fresh:true});view.items=d.projects;view.nextOffset=d.nextOffset;
  }else{
   const d=await api('/api/play/works?'+new URLSearchParams({tab:s.tab,type:s.type}),'GET',undefined,{fresh:true});view.items=d.works;view.nextOffset=d.nextOffset;view.dubbingAvailable=d.dubbingAvailable;
  }
  view.tracks=view.items.filter(t=>t.type!=='dubbing'&&s.mode!=='dubbing');
  view.html=playShell(s,playToolbar(s)+(view.dubbingAvailable===false?'<p class="field-help">더빙 목록은 현재 준비 중이에요.</p>':'')+'<div id="play-results" aria-live="polite">'+playResults(view)+'</div><button class="small-button play-more" id="play-more" '+(view.nextOffset===null?'hidden':'')+'>더 보기</button>');
 }catch(e){view.html=playShell(s,`<div class="play-empty" role="alert"><h2>목록을 불러오지 못했어요</h2><p>${esc(e.message)}</p><button class="small-button" data-play-retry>다시 불러오기</button></div>`);}
 return view;
}
function bindPlay(view){
 if(!view?.play)return;
 const root=document.querySelector('.play-page');if(!root)return;
 root.addEventListener('error',playDubbingArtworkError,true);
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
 const all=[...view.items],s=view.play;
 const paint=()=>{results.innerHTML=playResults(view);remember(view.items.filter(t=>t.type!=='dubbing'&&s.mode!=='dubbing'));routeTracks=view.items.filter(t=>t.type!=='dubbing'&&s.mode!=='dubbing');more.hidden=view.nextOffset===null;};
 const load=async(append=false)=>{
  const ticket=++generation;more.disabled=true;results.setAttribute('aria-busy','true');
  try{
   const params=new URLSearchParams({tab:s.tab,type:s.type,offset:String(append?view.nextOffset:0),q:query});
   const path=s.mode==='song'?'/api/play/songs?'+params:s.mode==='browse'?'/api/play/works?'+params:s.tab==='join'?'/api/play/participate?'+params:'/api/dubbing/projects?tab='+(s.tab==='mine'?'mine':'open')+'&offset='+(append?view.nextOffset:0);
   const d=await api(path,'GET',undefined,{fresh:true});if(ticket!==generation||!root.isConnected)return;
   const items=d.tracks||d.works||d.projects;view.items=append?[...view.items,...items]:items;view.nextOffset=d.nextOffset;
   // The legacy script/my-work service has no text query. Keep its paging accessible while filtering loaded records.
   if(s.mode==='dubbing'&&s.tab!=='join'){if(append)all.push(...items);else all.splice(0,all.length,...items);view.items=all.filter(t=>[t.title,t.ownerName].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));}
   paint();
  }catch(e){if(ticket===generation&&root.isConnected){let note=root.querySelector('.play-load-error');if(!note){note=document.createElement('p');note.className='play-load-error';note.setAttribute('role','alert');results.before(note);}note.textContent=e.message+' · 다시 검색하거나 더 보기를 눌러주세요.';}}
  finally{if(ticket===generation&&root.isConnected){more.disabled=false;results.removeAttribute('aria-busy');}}
 };
 form.onsubmit=e=>{e.preventDefault();query=form.querySelector('input').value.trim();root.querySelector('.play-load-error')?.remove();void load();};
 more.onclick=()=>load(true);
}
