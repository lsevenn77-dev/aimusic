const genreArtwork={"Ballad":"/assets/genres/04.webp","Dark Pop":"/assets/genres/03.webp","Soul":"/assets/genres/06.webp","R&B":"/assets/genres/05.webp","Hip-Hop":"/assets/genres/07.webp","Rock":"/assets/genres/08.webp","Alternative":"/assets/genres/09.webp","Indie Pop":"/assets/genres/10.webp","K-POP":"/assets/genres/01.webp","Pop":"/assets/genres/02.webp","EDM":"/assets/genres/11.webp","Electronic":"/assets/genres/12.webp","Synth Pop":"/assets/genres/13.webp","City Pop":"/assets/genres/14.webp","Lo-fi":"/assets/genres/15.webp","Jazz":"/assets/genres/16.webp","Blues":"/assets/genres/17.webp","Folk":"/assets/genres/18.webp","Acoustic":"/assets/genres/19.webp","Country":"/assets/genres/20.webp","Classical":"/assets/genres/21.webp","Ambient":"/assets/genres/22.webp","Fusion":"/assets/genres/23.webp","Korean Folklore Fusion":"/assets/genres/24.webp","World Music":"/assets/genres/25.webp","국악":"/assets/genres/26.webp","트로트":"/assets/genres/27.webp","J-POP":"/assets/genres/28.webp","OST":"/assets/genres/29.webp","Instrumental":"/assets/genres/30.webp","Dance":"/assets/genres/31.webp","Funk":"/assets/genres/32.webp","Disco":"/assets/genres/33.webp","Metal":"/assets/genres/34.webp","Punk":"/assets/genres/35.webp","Reggae":"/assets/genres/36.webp","Latin":"/assets/genres/37.webp","Reggaeton":"/assets/genres/38.webp","Afrobeats":"/assets/genres/39.webp","House":"/assets/genres/40.webp","Techno":"/assets/genres/41.webp","Trance":"/assets/genres/42.webp","Drum & Bass":"/assets/genres/43.webp","Trap":"/assets/genres/44.webp","Gospel":"/assets/genres/45.webp","New Age":"/assets/genres/46.webp","Chillout":"/assets/genres/47.webp","Cinematic":"/assets/genres/48.webp","Orchestral":"/assets/genres/49.webp","Children":"/assets/genres/50.webp"};
function genreCardHTML(g){return `<a class="genre-photo-card" href="#discover/genres?g=${encodeURIComponent(g)}"><img src="${esc(genreArtwork[g])}" alt="" loading="lazy" decoding="async"><span><small>EXPLORE MUSIC</small><strong>${esc(g)}</strong></span>${icon('chevron')}</a>`;}
let chartPlaybackBound=false;
function syncChartPlayback(){
 const active=typeof current!=='undefined'&&current&&!audio.paused&&!audio.ended&&!audio.error&&!window.AifectAudioAds?.active;
 document.querySelectorAll('.song-table-chart .song-table-row').forEach(row=>{
  const button=row.querySelector('.song-table-play[data-play]');
  const playing=!!(active&&button?.dataset.play===current.id);
  row.classList.toggle('is-chart-playing',playing);
 });
}
function bindChartPlayback(){
 if(typeof audio==='undefined')return;
 if(!chartPlaybackBound){
  chartPlaybackBound=true;
  for(const event of ['play','pause','ended','emptied','loadedmetadata','error'])audio.addEventListener(event,syncChartPlayback);
 }
 syncChartPlayback();
}
function chartMovementHTML(t){
 const state=t.chart_movement,delta=Math.abs(Number(t.rank_change)||0),labels={up:`어제보다 ${delta}위 상승`,down:`어제보다 ${delta}위 하락`,same:'어제와 같은 순위',new:'새롭게 차트 진입',unavailable:'전날 비교 기록 없음'},label=labels[state]||labels.unavailable;
 return `<div class="chart-score chart-movement ${Object.hasOwn(labels,state)?state:'unavailable'}" aria-label="${label}" title="${label}"><strong aria-hidden="true">${state==='up'?'<span class="chart-direction">▲</span><span>'+delta+'</span>':state==='down'?'<span class="chart-direction">▼</span><span>'+delta+'</span>':state==='new'?'NEW':'—'}</strong></div>`;
}
// Shared navigation for listening, singing and the community on desktop and mobile.
function updateBrowseNavigation(base,param){
 const primary=['karaoke','sing','cover','dubbing'].includes(base)?'karaoke':['community','voice','live','covers','crew','producer','artist','following'].includes(base)?'community':base==='dm'?'dm':base==='notifications'?'notifications':['inventory','follow','profile','account','studio','manage','upload','payouts','rewards'].includes(base)?'profile':['library','history'].includes(base)?'home':'home';
 const routeHref='#'+base+(param?'/'+param:'');
 const sidebarHref=['upload','manage','studio'].includes(base)?'#studio':base==='gifts'?'#gifts':routeHref;
 const matchesPage=a=>a.getAttribute('href')===routeHref||a.getAttribute('href')===sidebarHref;
 const hasSidebarPage=[...document.querySelectorAll('.sidebar .nav-link[data-view]:not([data-primary-view])')].some(matchesPage);
 document.querySelectorAll('[data-primary-view]').forEach(a=>{const inSidebar=!!a.closest('.sidebar'),active=!(inSidebar&&hasSidebarPage)&&a.dataset.primaryView===(inSidebar&&['library','history'].includes(base)?'library':primary);a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 document.querySelectorAll('.nav-link[data-view]:not([data-primary-view])').forEach(a=>{const active=matchesPage(a);a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
}
function chartTabs(active='',period='week'){return `<nav class="tabs music-community-tabs chart-tabs" aria-label="차트 종류">${[['','인기차트'],['covers','커버차트'],['releases','신곡차트']].map(([key,label])=>`<a class="tab ${active===key?'active':''}" href="#charts${key?'/'+key:''}?period=${period}" ${active===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;}
function libraryTabs(active='likes'){if(['artists','producers'].includes(active))active='following';return `<nav class="tabs" aria-label="보관함 종류">${[['likes','좋아요'],['playlists','플레이리스트'],['history','최근 들은 곡']].map(([key,label])=>`<a class="tab ${active===key?'active':''}" href="#profile?view=library&section=${key}" ${active===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;}
function browsePlaybackActions(tracks,showCount=true){return `<div class="inline-actions playlist-actions"><button class="list-action primary-button" data-play-all ${tracks.length?'':'disabled'}>${icon('ui-play-action')} 전체 듣기</button><button class="list-action small-button" data-browse-shuffle ${tracks.length?'':'disabled'}>${icon('shuffle')} 섞어 듣기</button>${showCount?`<span class="field-help" data-browse-count>${tracks.length}곡</span>`:''}</div>`;}
function browseQuickLinks(){return `<nav class="browse-shortcuts" aria-label="음악 즐기기"><a href="#charts">${icon('chart')}<strong>인기 차트</strong></a><a href="#charts/karaoke">${icon('mic')}<strong>노래방 차트</strong><small>듣고, 직접 부르고</small></a><a href="#community/covers">${icon('users')}<strong>커버곡 둘러보기</strong><small>같은 곡, 다른 목소리</small></a><a href="#collections">${icon('library')}<strong>추천 플레이리스트</strong><small>취향을 나누는 선곡</small></a></nav>`;}
function browseSearchHTML(){return `<section class="discovery-search-hero">${heading('발견','지금의 기분에서, 다음 취향까지.')}<form id="search-form" class="aifect-search" role="search">${icon('search')}<input type="search" name="q" aria-label="곡, 아티스트, 제작자 검색" placeholder="곡, 아티스트, 제작자, 플레이리스트" maxlength="100"><button class="primary-button">검색</button></form><p class="field-help">제목이나 이름을 검색하거나, 아래에서 마음이 가는 음악을 골라보세요.</p></section>`+section('어디서부터 들어볼까요?')+browseQuickLinks()+`<section class="discovery-mood-panel">${section('오늘, 어떤 기분인가요?')}<div class="genre-chips">${moodOptions.map(([key,label])=>`<a class="genre-chip" href="#discover/mood?m=${key}">${esc(label)}</a>`).join('')}</div></section>`+section('장르 둘러보기')+`<div class="browse-genres">${genres.filter(g=>g!=='전체').map(genreCardHTML).join('')}</div><a class="genre-photo-credits" href="/assets/genres/credits.html" target="_blank" rel="noopener">이미지 출처</a>`;}
function chartLayoutHTML(content,tracks,kind=''){
 const t=tracks[0],isCover=kind==='karaoke';
 return `<div class="chart-page-layout"><section class="chart-page-results" aria-label="음악 목록">${kind==='releases'||isCover?`<div class="chart-list-heading"><h2>${isCover?'우리들의 커버곡':'새로 공개된 곡'}</h2></div>`:''}${content}</section><aside class="chart-page-aside">${t?`<section class="chart-spotlight"><span class="eyebrow">${kind==='releases'?'JUST RELEASED':isCover?'COVER SPOTLIGHT':'ON THE CHART'}</span><a href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${cover(t,'chart-feature-art')}</a><h2><a href="#song/${esc(t.id)}">${esc(t.title)}</a></h2><p>${credits(t)}</p><button class="primary-button" data-play="${esc(t.id)}">${icon('ui-play-action')} 지금 듣기</button></section>`:''}<section class="chart-invitation"><span class="eyebrow">YOUR NEXT FAVORITE</span><h3>${isCover?'다음 목소리는 당신의 차례.':'듣다 보면, 부르고 싶어지는.'}</h3><p>좋아하는 음악에 나만의 목소리를 더해보세요.</p><a class="small-button" href="#karaoke">${icon('mic')} 부를 곡 찾기 ${icon('arrow')}</a></section><nav class="chart-explore-links" aria-label="다른 음악 발견"><a href="#search">${icon('compass')} 기분 · 장르로 찾기 ${icon('chevron')}</a><a href="#collections">${icon('library')} 추천 플레이리스트 ${icon('chevron')}</a></nav></aside></div>`;
}
function karaokeRows(tracks,ranked=false){return tracks.length?`<div class="karaoke-browse-list">${tracks.map((t,i)=>`<article data-list-row class="karaoke-browse-row">${ranked?`<span class="browse-rank">${t.browseRank||i+1}</span>`:''}<a href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${cover(t,'mini-cover')}</a><div class="karaoke-browse-info"><a href="#song/${esc(t.id)}"><strong>${esc(t.title)}</strong></a><span>${credits(t)}</span><small>MR 제공</small>${trackStats(t)}${karaokeParticipationHTML(t)}</div><div class="karaoke-browse-actions"><button class="list-action small-button" data-play="${esc(t.id)}" aria-label="${esc(t.title)} 원곡 듣기">${icon('ui-play-action')} 원곡 듣기</button><a class="text-link" href="#community/rankings?period=all&amp;original_id=${esc(t.id)}">커버 랭킹</a><a class="list-action small-button" href="#sing/${esc(t.id)}">${icon('mic')} 부르기</a><a class="text-link" href="#cover/${esc(t.id)}">녹음 파일 올리기</a></div><div class="karaoke-cover-results" id="covers-${esc(t.id)}" hidden></div></article>`).join('')}</div>`:empty('아직 부를 수 있는 곡이 없어요.','MR이 준비되고 원곡자가 커버를 허락한 곡이 여기에 표시돼요.','#community/covers','다른 사람의 커버 둘러보기');}
function communityPeopleStrip(tracks){const seen=new Set(),people=[];for(const t of tracks){const id=t.producer_id,name=t.producer;if(!id||!name||seen.has(id))continue;seen.add(id);people.push({id,name,image_version:t.producer_image_version,kind:t.kind,cover_mode:t.cover_mode});if(people.length>=10)break;}return people.length?`<section class="community-people"><div class="community-people-heading"><div><h2>새로운 목소리</h2><p>최근 커버나 신곡을 올린 사람들의 프로필을 만나보세요.</p></div><a href="#following">팔로잉 보기</a></div><div class="community-people-row">${people.map(p=>`<a href="#producer/${esc(p.id)}"><span class="community-person-avatar profile-avatar">${avatarImage(p)}</span><strong>${userNickname(p.name,{profileId:p.id})}</strong><small>${p.kind==='cover'?(p.cover_mode==='duet'?'듀엣 공개':'커버 공개'):'신곡 공개'}</small></a>`).join('')}</div></section>`:'';}
function communityFeed(tracks){return tracks.length?'<div class="music-feed">'+tracks.map(t=>musicTrackCard(t)).join('')+'</div>':empty('아직 공개된 음악이 없어요.','다른 음악을 둘러보거나 첫 곡을 들려주세요.','#karaoke','부를 곡 찾기');}
function chartPageTable(tracks,kind){
 const fresh=kind==='releases',coverChart=kind==='covers';
 remember(tracks);
 return '<div class="song-table song-table-chart chart-ui '+(fresh?'chart-releases':'chart-standard')+'"><div class="song-table-head" aria-hidden="true"><span>순위</span><span></span><span>곡명 · 아티스트</span><span>변동</span><span>'+(coverChart?'커버 수':'감상 수')+'</span><span>좋아요</span><span>댓글</span><span>재생</span><span></span></div>'+tracks.map(t=>{
  const id=esc(t.id),title=esc(t.title),isLiked=liked(t.id);
  return `<article data-list-row data-chart-row="${id}" class="song-table-row" tabindex="0" aria-label="${t.chart_rank}위 ${title} 곡 정보"><span class="song-table-position">${t.chart_rank}</span><div class="chart-art-wrap"><a class="song-table-cover" href="#song/${id}" aria-label="${title} 곡 정보">${cover(t,'mini-cover')}</a><button class="list-action chart-cover-play" data-play="${id}" aria-label="${title} 재생">${icon('ui-play-action')}</button></div><div class="chart-song-copy"><a class="chart-song-title" href="#song/${id}" title="${title}"><strong>${title}</strong></a><div class="chart-song-credit" title="${esc(t.artist||t.producer)}">${credits(t)}</div></div>${chartMovementHTML(t)}<span class="metric-inline song-table-stat song-table-plays">${icon(coverChart?'mic':'ui-plays')}<span>${number(coverChart?t.chart_covers:t.chart_plays)}</span></span><button class="list-action metric-inline song-table-stat song-table-like ${isLiked?'is-active':''}" data-like="${id}" aria-pressed="${isLiked}" aria-label="${title} 좋아요">${icon('ui-heart')}<span data-like-count>${number(t.likes)}</span></button><a class="list-action metric-inline song-table-stat song-table-comments" href="#song/${id}?comments=1" aria-label="댓글 ${number(t.comments)}개">${icon('ui-comment')}<span>${number(t.comments)}</span></a><button class="list-action song-table-play chart-mobile-play" data-play="${id}" aria-label="${title} 재생">${icon('ui-play-action')}</button><div class="song-table-tools"><button class="list-action icon-button" data-track-menu="${id}" aria-label="${title} 더보기">${icon('ui-menu-action')}</button></div></article>`;
 }).join('')+'</div>';
}
const chartPeriodLabels={week:'주간',month:'월간',all:'전체'};
const chartKindLabels={'':'인기',top:'인기',covers:'커버',releases:'신곡',karaoke:'커버'};
function chartDate(date,short=false){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:short?'2-digit':'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 return ['year','month','day'].map(key=>parts.find(part=>part.type===key).value).join('.');
}
function chartDefaultName(view){return `${chartKindLabels[view.chartKind||'']}차트 · ${chartPeriodLabels[view.chartPeriod]} · ${chartDate(new Date(),true)}`;}
function chartPlaybackActions(tracks,kind='',period='week'){
 const playable=tracks.filter(t=>t.playable!==false&&Number(t.duration)>0);
 return `${chartTabs(kind,period)}<div class="chart-toolbar"><button class="chart-action chart-listen" data-play-all ${playable.length?'':'disabled'}>${icon('ui-plays')}<span>전체 듣기</span></button><button class="chart-action chart-shuffle" data-browse-shuffle ${playable.length?'':'disabled'}>${icon('shuffle')}<span>섞어 듣기</span></button><button class="chart-action chart-create" data-chart-playlist ${tracks.length?'':'disabled'}>${icon('list-plus')}<span>플리 만들기</span></button><details class="chart-period"><summary class="chart-action" aria-label="차트 기간: ${chartPeriodLabels[period]}"><span>${chartPeriodLabels[period]}</span>${icon('ui-chevron')}</summary><nav class="chart-period-menu" aria-label="차트 기간 선택">${Object.entries(chartPeriodLabels).map(([key,label])=>`<a href="#charts${kind?'/'+kind:''}?period=${key}" ${key===period?'aria-current="true"':''}>${label}</a>`).join('')}</nav></details></div>`;
}
let chartPlaylistOpening=false,chartPlaylistSaving=false;
function chartPlaylistIds(tracks,range,selected=[]){const picked=new Set(selected);return [...new Set(tracks.filter(t=>range==='all'||picked.has(t.id)).map(t=>t.id))];}
async function chartPlaylistDialog(view){const ticket=renderId;
 if(chartPlaylistOpening||chartPlaylistSaving||($('#dialog')?.open&&$('#chart-playlist-form')))return;
 if(!me){returnRoute=location.hash;return askLogin();}
 chartPlaylistOpening=true;
 // Use the full ranked API result held by the view, never DOM rows. Keep the
 // first occurrence so the picker, displayed total and saved count agree.
 const seen=new Set(),uid=me.id,tracks=view.tracks.filter(t=>t.id&&!seen.has(t.id)&&seen.add(t.id)).map(t=>({...t})),name=chartDefaultName(view);
 try{
  await refreshLibrary(true);if(me?.id!==uid)return;
  if(!canCreatePlaylist())return;
  if(ticket!==renderId)return;dialog(`<section class="chart-playlist-dialog"><h2>차트로 플리 만들기</h2><form id="chart-playlist-form">${formField('플레이리스트 이름','name','text',name,'required maxlength="80"')}<fieldset class="chart-range"><legend>담을 곡</legend><label><input type="radio" name="range" value="selected" aria-controls="chart-track-picker"> 선택 지정 <span data-chart-selected-count aria-live="polite">0곡</span></label><label><input type="radio" name="range" value="all" checked> 차트 전체 <span>${number(tracks.length)}곡</span></label></fieldset><div id="chart-track-picker" class="chart-track-picker" hidden>${tracks.map((t,i)=>`<label class="chart-pick-row"><input type="checkbox" name="track_ids" value="${esc(t.id)}"><span class="chart-pick-rank">${t.chart_rank||i+1}</span><span class="chart-pick-copy"><strong>${esc(t.title||t.id)}</strong><small>${trackNickname(t)}</small></span></label>`).join('')}</div><p class="field-help">선택한 차트의 순서대로 내 플레이리스트에 저장해요.</p><p class="form-error" role="alert"></p><div class="chart-dialog-actions"><button type="submit" class="small-button chart-confirm">만들기</button></div></form></section>`);
  const form=$('#chart-playlist-form'),modal=$('#dialog'),confirm=form.querySelector('[type="submit"]'),picker=form.querySelector('#chart-track-picker');let createdId=null;
  const syncSelection=()=>{const fd=new FormData(form),selected=fd.get('range')==='selected',count=chartPlaylistIds(tracks,'selected',fd.getAll('track_ids')).length;picker.hidden=!selected;form.querySelector('[data-chart-selected-count]').textContent=number(count)+'곡';confirm.disabled=!!form._busy||!(selected?count:tracks.length);};
  let editedName=false;
  form.oninput=e=>{if(e.target.name==='name')editedName=true;};
  form.onchange=syncSelection;syncSelection();
  const preventCancel=e=>{if(form._busy)e.preventDefault();};modal.addEventListener('cancel',preventCancel);modal.addEventListener('close',()=>modal.removeEventListener('cancel',preventCancel),{once:true});
  const submit=busyForm(form,async fd=>{
   if(ticket!==renderId)throw Error('차트가 변경됐어요. 창을 다시 열어주세요.');
   if(me?.id!==uid)throw Error('계정이 변경됐어요. 창을 다시 열어주세요.');
   const ids=chartPlaylistIds(tracks,fd.get('range'),fd.getAll('track_ids'));
   if(!ids.length)throw Error('담을 곡이 없어요.');
   if(ids.length>500)throw Error('기존 플레이리스트는 최대 500곡까지 저장할 수 있어요. 선택 지정으로 500곡 이하를 선택해주세요.');
   chartPlaylistSaving=true;
   try{
    if(!createdId)createdId=(await api('/api/playlists','POST',{name:editedName||fd.get('name')!==name?fd.get('name'):chartDefaultName(view),is_public:false,track_ids:ids})).id;
    modal.close();toast('내 플레이리스트에 저장했습니다.');
    try{await refreshLibrary(true);}catch{/* Creation succeeded; never repeat POST to retry a library read. */}
    if(me?.id===uid)location.hash='#playlist/'+createdId;
   }finally{chartPlaylistSaving=false;}
  });
  form.onsubmit=async event=>{await submit(event);syncSelection();};
 }finally{chartPlaylistOpening=false;}
}
let chartToolbarCleanup=null;
function bindChartToolbar(view){
 chartToolbarCleanup?.();chartToolbarCleanup=null;
 const root=$('.chart-toolbar');if(!root)return;
 const details=root.querySelector('.chart-period'),create=root.querySelector('[data-chart-playlist]');
 create.onclick=()=>chartPlaylistDialog(view).catch(e=>toast(e.message));
 details.addEventListener('click',e=>{const choice=e.target.closest('a');if(choice){details.querySelector('summary span').textContent=choice.textContent;details.open=false;}});
 const close=e=>{if(e.type==='keydown'){if(e.key==='Escape'&&details.open){details.open=false;details.querySelector('summary').focus();}}else if(!details.contains(e.target))details.open=false;};
 document.addEventListener('click',close);document.addEventListener('keydown',close);
 const cleanup=()=>{document.removeEventListener('click',close);document.removeEventListener('keydown',close);window.removeEventListener('hashchange',cleanup);};
 chartToolbarCleanup=cleanup;window.addEventListener('hashchange',cleanup,{once:true});
}
async function popularChartView(raw='',kind='',readApi=api){
 const query=new URLSearchParams(raw.includes('?')?raw.split('?')[1]:''),requested=query.get('period'),period=['week','month','all'].includes(requested)?requested:'week';
 const d=await readApi('/api/catalog?section=tracks&full=1&chart='+({covers:'covers',releases:'new'}[kind]||'listens')+'&period='+period);
 const chart=d.chart,tracks=d.tracks;
 return {html:'<section class="charts-final">'+chartPlaybackActions(tracks,kind,period)+(tracks.length?chartPageTable(tracks,kind):empty('아직 집계된 곡이 없어요.','선택한 차트에 해당하는 공개 제작곡이 여기에 표시됩니다.','#home','홈으로'))+(chart?.comparison?.available?'':'<p class="field-help chart-comparison-note">같은 집계 기준의 전날 기록이 준비되면 순위 변동을 표시해요.</p>')+'</section>',tracks,chartPage:true,chartKind:kind,chartPeriod:period};
}
async function browseView(base,param,raw,embedded=false,readApi=api){
 if(base==='karaoke'&&param==='browse')return playBrowseV3(raw,readApi);
 if(base==='charts'&&param!=='karaoke')return popularChartView(raw,['covers','releases'].includes(param)?param:'',readApi);
 if(base==='search')return null;
 if(base==='charts'&&param==='karaoke'||base==='karaoke'&&param==='chart'){
  const requested=new URLSearchParams(raw.includes('?')?raw.split('?')[1]:'').get('period'),period=['week','month','all'].includes(requested)?requested:'week';
  const d=await readApi('/api/cover-rankings?kind=tracks&period='+period+'&include_unranked=1&full=1'),tracks=d.tracks.filter(t=>t.kind==='cover');
  return {html:heading('노래방 차트','공개된 커버곡만 모았어요. 선택한 기간에 받은 좋아요 순으로 만나요.')+chartTabs('karaoke',period)+chartLayoutHTML(`<div class="chart-toolbar"><details class="chart-period"><summary class="chart-action">${chartPeriodLabels[period]}</summary><nav class="chart-period-menu">${Object.entries(chartPeriodLabels).map(([key,label])=>`<a href="#charts/karaoke?period=${key}">${label}</a>`).join('')}</nav></details><button class="chart-action chart-create" data-chart-playlist ${tracks.length?'':'disabled'}>${icon('list-plus')}<span>플리 만들기</span></button></div>`+browsePlaybackActions(tracks)+(tracks.length?coverRankTracksHTML(tracks):empty('아직 등록된 커버곡이 없어요','첫 커버곡이 공개되면 이곳에서 만날 수 있어요.','#karaoke','플레이')),tracks,'karaoke'),tracks,chartPage:true,chartKind:'karaoke',chartPeriod:period};
 }
 if(base==='karaoke'&&param==='drafts'){if(!me){returnRoute=location.hash;return {html:gate()};}return {html:karaokeDraftsHTML(await listSingDrafts())};}
 if(base==='karaoke'&&['songs','duets'].includes(param)){
  const duet=param==='duets',d=await readApi(duet?'/api/duets':'/api/karaoke','GET',undefined,{fresh:duet});
  const tracks=duet?d.tracks.filter(t=>musicIsOpenDuet(t)&&!t.duet_parent_id&&t.original_id):d.tracks;
  return {html:singingCollectionHTML(tracks,param),tracks,karaokeTracks:tracks,singingHub:true,singingCollection:param};
 }
 if(base==='karaoke'){
  const [d,duets]=await Promise.all([readApi('/api/karaoke'),readApi('/api/duets')]),tracks=d.tracks.map((t,i)=>({...t,browseRank:i+1}));
  remember([...(d.recent_covers||[]),...duets.tracks]);return {html:singingHubHTML(tracks,d.recent_covers||[],duets.tracks),tracks,karaokeTracks:tracks,singingHub:true};
 }
 if(base==='community'||base==='covers')return communityView(base,param,raw,readApi);
 if(base==='history'||base==='library'&&['history','covers','originals'].includes(param)){
  if(!me){returnRoute=location.hash;return {html:gate()};}
  const tab=base==='history'?'history':param;let html=(embedded?'':heading('내 보관함','좋아하는 음악과 내가 남긴 목소리를 한곳에서.'))+(embedded&&tab!=='history'?'':libraryTabs(tab));
  if(tab==='history'){const d=await readApi('/api/history');return {html:html+browsePlaybackActions(d.tracks)+list(d.tracks),tracks:d.tracks};}
  const d=await readApi('/api/studio'),owned=d.tracks.filter(t=>t.kind===(tab==='covers'?'cover':'original')),published=owned.filter(t=>t.status==='published');
  html+=`<div class="inline-actions playlist-actions"><a class="primary-button" href="#${tab==='covers'?'karaoke':'upload'}">${icon('plus')} ${tab==='covers'?'플레이로 이동':'제작곡 올리기'}</a><a class="text-link" href="#studio">스튜디오에서 관리</a></div>`;
  html+=tab==='covers'&&owned.length?coverCollectionHTML(owned,'my-covers',true):owned.length?`<div class="own-music-list">${owned.map(t=>`<article data-list-row class="own-music-row">${cover(t,'mini-cover')}<div><strong>${esc(t.title)}</strong><small>${esc(({published:'공개 중',draft:'작성 중',processing:'음원 처리 중',hidden:'비공개',failed:'처리 실패'})[t.status]||'준비 중')}</small></div><div class="list-actions">${t.status==='published'?`<button class="list-action icon-button" data-play="${esc(t.id)}" aria-label="${esc(t.title)} 듣기">${icon('ui-play-action')}</button>`:''}<a class="small-button" href="#manage/${esc(t.id)}">관리</a></div></article>`).join('')}</div>`:empty(tab==='covers'?'아직 내 커버곡이 없어요.':'아직 내 제작곡이 없어요.','좋아하는 음악으로 나만의 이야기를 시작해보세요.',tab==='covers'?'#karaoke':'#upload',tab==='covers'?'부를 곡 찾아보기':'음악 올리기');
  return {html,tracks:published};
 }
 return null;
}
function bindBrowse(view){
 bindCommunity(view);
 bindChartPlayback();
 if(view?.chartPage){
  bindChartToolbar(view);
  routeTracks=view.tracks.filter(t=>t.playable!==false&&Number(t.duration)>0);
  document.querySelectorAll('[data-chart-row]').forEach(row=>{
   row.onclick=e=>{if(!e.target.closest('a,button')&&!window.getSelection()?.toString())location.hash='#song/'+row.dataset.chartRow;};
   row.onkeydown=e=>{if(e.target===row&&e.key==='Enter')location.hash='#song/'+row.dataset.chartRow;};
  });
 }
 const results=$('#karaoke-results');if(results)results.addEventListener('click',async e=>{
  const button=e.target.closest('[data-karaoke-covers]');if(!button)return;
  const panel=document.getElementById(button.getAttribute('aria-controls')),uid=me?.id;
  if(!panel)return;
  if(!panel.hidden){panel.hidden=true;button.setAttribute('aria-expanded','false');return;}
  panel.hidden=false;button.setAttribute('aria-expanded','true');
  if(panel.dataset.loaded)return;
  button.disabled=true;panel.innerHTML='<p role="status">참여 커버를 불러오는 중…</p>';
  try{const d=await api('/api/tracks/'+encodeURIComponent(button.dataset.karaokeCovers)+'/covers?sort=recent');
   if(!panel.isConnected||uid!==me?.id)return;remember(d.covers);
   panel.innerHTML=d.covers.length?'<h3>이 곡에 참여한 커버</h3><div class="karaoke-participant-list">'+d.covers.map(t=>'<article data-list-row><a href="#song/'+esc(t.id)+'">'+cover(t,'mini-cover')+'</a><div><a href="#song/'+esc(t.id)+'"><strong>'+esc(t.title)+'</strong></a><a href="#producer/'+esc(t.producer_id)+'">'+userNickname(t.producer,{profileId:t.producer_id})+'</a><small>'+musicKind(t)+' · '+number(t.plays||0)+'회 감상</small></div><button class="list-action small-button" data-play="'+esc(t.id)+'" aria-label="'+esc(t.producer)+'의 커버 듣기">'+icon('ui-play-action')+' 듣기</button></article>').join('')+'</div>':'<p>아직 참여한 커버가 없어요. 첫 목소리를 남겨보세요.</p>';
   panel.dataset.loaded='1';
  }catch(error){if(panel.isConnected)panel.innerHTML='<p role="alert">'+esc(error.message)+' 접었다 다시 누르면 재시도할 수 있어요.</p>';}
  finally{button.disabled=false;}
 });
 if(view?.singingHub){bindSingingHub(view);return;}
 const search=$('#karaoke-search');if(search)search.oninput=()=>{const q=search.value.trim().toLocaleLowerCase(),items=view.karaokeTracks.filter(t=>[t.title,t.artist,t.producer].join(' ').toLocaleLowerCase().includes(q));routeTracks=items;$('#karaoke-count').textContent=items.length+'곡';document.querySelectorAll('[data-browse-count]').forEach(el=>el.textContent=items.length+'곡');$('#karaoke-results').innerHTML=items.length?karaokeRows(items,view.ranked):'<p class="empty-inline">일치하는 곡이 없어요. 다른 제목이나 창작자 이름을 검색해보세요.</p>';document.querySelectorAll('[data-play-all],[data-browse-shuffle]').forEach(b=>b.disabled=!items.length);};
 const button=$('[data-browse-shuffle]');if(button)button.onclick=async()=>{const tracks=[...routeTracks];for(let i=tracks.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tracks[i],tracks[j]]=[tracks[j],tracks[i]];}if(tracks.length)try{if(view?.chartPage&&shuffle)$('#shuffle').click();await play(tracks[0].id,tracks);}catch(e){toast(e.message);}};
}

let homeBrowseObserver=null;
