const genreArtwork={"Ballad":"/assets/genres/04.webp","Dark Pop":"/assets/genres/03.webp","Soul":"/assets/genres/06.webp","R&B":"/assets/genres/05.webp","Hip-Hop":"/assets/genres/07.webp","Rock":"/assets/genres/08.webp","Alternative":"/assets/genres/09.webp","Indie Pop":"/assets/genres/10.webp","K-POP":"/assets/genres/01.webp","Pop":"/assets/genres/02.webp","EDM":"/assets/genres/11.webp","Electronic":"/assets/genres/12.webp","Synth Pop":"/assets/genres/13.webp","City Pop":"/assets/genres/14.webp","Lo-fi":"/assets/genres/15.webp","Jazz":"/assets/genres/16.webp","Blues":"/assets/genres/17.webp","Folk":"/assets/genres/18.webp","Acoustic":"/assets/genres/19.webp","Country":"/assets/genres/20.webp","Classical":"/assets/genres/21.webp","Ambient":"/assets/genres/22.webp","Fusion":"/assets/genres/23.webp","Korean Folklore Fusion":"/assets/genres/24.webp","World Music":"/assets/genres/25.webp","국악":"/assets/genres/26.webp","트로트":"/assets/genres/27.webp","J-POP":"/assets/genres/28.webp","OST":"/assets/genres/29.webp","Instrumental":"/assets/genres/30.webp","Dance":"/assets/genres/31.webp","Funk":"/assets/genres/32.webp","Disco":"/assets/genres/33.webp","Metal":"/assets/genres/34.webp","Punk":"/assets/genres/35.webp","Reggae":"/assets/genres/36.webp","Latin":"/assets/genres/37.webp","Reggaeton":"/assets/genres/38.webp","Afrobeats":"/assets/genres/39.webp","House":"/assets/genres/40.webp","Techno":"/assets/genres/41.webp","Trance":"/assets/genres/42.webp","Drum & Bass":"/assets/genres/43.webp","Trap":"/assets/genres/44.webp","Gospel":"/assets/genres/45.webp","New Age":"/assets/genres/46.webp","Chillout":"/assets/genres/47.webp","Cinematic":"/assets/genres/48.webp","Orchestral":"/assets/genres/49.webp","Children":"/assets/genres/50.webp"};
function genreCardHTML(g){return `<a class="genre-photo-card" href="#discover/genres?g=${encodeURIComponent(g)}"><img src="${esc(genreArtwork[g])}" alt="" loading="lazy" decoding="async"><span><small>EXPLORE MUSIC</small><strong>${esc(g)}</strong></span>${icon('chevron')}</a>`;}
let chartPlaybackBound=false;
function syncChartPlayback(){paintChartPlayback(document);}
function paintChartPlayback(root){
 const active=typeof current!=='undefined'&&current&&!audio.paused&&!audio.ended&&!audio.error&&!window.AifectAudioAds?.active;
 root.querySelectorAll('.song-table-chart .song-table-row,.song-story-cover-row').forEach(row=>{
  const button=row.querySelector('.song-table-play[data-play]');
  const playing=!!(active&&button?.dataset.play===current.id);
  row.classList.toggle('is-chart-playing',playing);
  if(button?.dataset.rowPlayback===undefined||button.getAttribute('aria-pressed')===String(playing))return;
  button.setAttribute('aria-pressed',String(playing));
  button.setAttribute('aria-label',button.dataset.title+(playing?' 일시정지':' 재생'));
  button.innerHTML=icon(playing?'ui-pause-action':'ui-play-action');
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
 const primary=['karaoke','sing','cover','dubbing'].includes(base)?'karaoke':['community','voice','live','covers','crew','producer','artist','following'].includes(base)?'community':base==='dm'?'dm':base==='notifications'?'notifications':['mybox','inventory','follow','profile','account','studio','manage','upload','payouts','rewards'].includes(base)?'profile':['library','history'].includes(base)?'home':'home';
 const routeHref='#'+base+(param?'/'+param:'');
 const sidebarHref=['upload','manage','studio'].includes(base)?'#studio':base==='gifts'?'#gifts':routeHref;
 const matchesPage=a=>a.getAttribute('href')===routeHref||a.getAttribute('href')===sidebarHref;
 const hasSidebarPage=[...document.querySelectorAll('.sidebar .nav-link[data-view]:not([data-primary-view])')].some(matchesPage);
 document.querySelectorAll('[data-primary-view]').forEach(a=>{const inSidebar=!!a.closest('.sidebar'),active=!(inSidebar&&hasSidebarPage)&&a.dataset.primaryView===(inSidebar&&['library','history'].includes(base)?'library':primary);a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 document.querySelectorAll('.nav-link[data-view]:not([data-primary-view])').forEach(a=>{const active=matchesPage(a);a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
}
function chartHref(kind,period,genre=''){
 const query=new URLSearchParams({period});
 if(genre)query.set('genre',genre);
 return '#charts'+(kind?'/'+kind:'')+'?'+query;
}
function chartTabs(active='',period='week',genre=''){return `<nav class="tabs music-community-tabs chart-tabs aifect-main-tabs" aria-label="차트 종류">${[['','인기차트'],['covers','커버차트'],['releases','신곡차트']].map(([key,label],index)=>`<a id="chart-tab-${key||'popular'}" class="tab ${active===key?'active':''}" data-chart-tab="${key}" data-tab-tone="${['pink','mint','purple'][index]}" href="${esc(chartHref(key,period,genre))}" ${active!=='karaoke'?'aria-controls="chart-content"':''} ${active===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;}
function libraryTabs(active='likes'){if(['artists','producers'].includes(active))active='following';return `<nav class="tabs" aria-label="보관함 종류">${[['likes','좋아요'],['playlists','플레이리스트'],['history','최근 들은 곡']].map(([key,label])=>`<a class="tab ${active===key?'active':''}" href="#profile?view=library&section=${key}" ${active===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;}
function browsePlaybackActions(tracks,showCount=true){return `<div class="inline-actions playlist-actions"><button class="list-action primary-button" data-play-all ${tracks.length?'':'disabled'}>${icon('ui-play-action')} 전체 듣기</button><button class="list-action small-button" data-browse-shuffle ${tracks.length?'':'disabled'}>${icon('shuffle')} 섞어 듣기</button>${showCount?`<span class="field-help" data-browse-count>${tracks.length}곡</span>`:''}</div>`;}
function browseQuickLinks(){return `<nav class="browse-shortcuts" aria-label="음악 즐기기"><a href="#charts">${icon('chart')}<strong>인기 차트</strong></a><a href="#charts/karaoke">${icon('mic')}<strong>노래방 차트</strong><small>듣고, 직접 부르고</small></a><a href="#community/covers">${icon('users')}<strong>커버곡 둘러보기</strong><small>같은 곡, 다른 목소리</small></a><a href="#collections">${icon('library')}<strong>추천 플레이리스트</strong><small>취향을 나누는 선곡</small></a></nav>`;}
function browseSearchHTML(){return `<section class="discovery-search-hero">${heading('발견','지금의 기분에서, 다음 취향까지.')}<form id="search-form" class="aifect-search" role="search">${icon('search')}<input type="search" name="q" aria-label="곡, 아티스트, 제작자 검색" placeholder="곡, 아티스트, 제작자, 플레이리스트" maxlength="100"><button class="primary-button">검색</button></form><p class="field-help">제목이나 이름을 검색하거나, 아래에서 마음이 가는 음악을 골라 보세요.</p></section>`+section('어디서부터 들어볼까요?')+browseQuickLinks()+`<section class="discovery-mood-panel">${section('오늘, 어떤 기분인가요?')}<div class="genre-chips">${moodOptions.map(([key,label])=>`<a class="genre-chip" href="#discover/mood?m=${key}">${esc(label)}</a>`).join('')}</div></section>`+section('장르 둘러보기')+`<div class="browse-genres">${genres.filter(g=>g!=='전체').map(genreCardHTML).join('')}</div><a class="genre-photo-credits" href="/assets/genres/credits.html" target="_blank" rel="noopener">이미지 출처</a>`;}
function chartLayoutHTML(content,tracks,kind=''){
 const t=tracks[0],isCover=kind==='karaoke';
 return `<div class="chart-page-layout"><section class="chart-page-results" aria-label="음악 목록">${kind==='releases'||isCover?`<div class="chart-list-heading"><h2>${isCover?'우리들의 커버곡':'새로 공개된 곡'}</h2></div>`:''}${content}</section><aside class="chart-page-aside">${t?`<section class="chart-spotlight"><span class="eyebrow">${kind==='releases'?'JUST RELEASED':isCover?'COVER SPOTLIGHT':'ON THE CHART'}</span><a href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${cover(t,'chart-feature-art')}</a><h2><a href="#song/${esc(t.id)}">${esc(t.title)}</a></h2><p>${credits(t)}</p><button class="primary-button" data-play="${esc(t.id)}">${icon('ui-play-action')} 지금 듣기</button></section>`:''}<section class="chart-invitation"><span class="eyebrow">YOUR NEXT FAVORITE</span><h3>${isCover?'다음 목소리는 당신의 차례.':'듣다 보면, 부르고 싶어지는.'}</h3><p>좋아하는 음악에 나만의 목소리를 더해 보세요.</p><a class="small-button" href="#karaoke">${icon('mic')} 부를 곡 찾기 ${icon('arrow')}</a></section><nav class="chart-explore-links" aria-label="다른 음악 발견"><a href="#search">${icon('compass')} 기분 · 장르로 찾기 ${icon('chevron')}</a><a href="#collections">${icon('library')} 추천 플레이리스트 ${icon('chevron')}</a></nav></aside></div>`;
}
function karaokeRows(tracks,ranked=false){return tracks.length?`<div class="karaoke-browse-list">${tracks.map((t,i)=>`<article data-list-row class="karaoke-browse-row">${ranked?`<span class="browse-rank">${t.browseRank||i+1}</span>`:''}<a href="#song/${esc(t.id)}" aria-label="${esc(t.title)} 곡 정보">${cover(t,'mini-cover')}</a><div class="karaoke-browse-info"><a href="#song/${esc(t.id)}"><strong>${esc(t.title)}</strong></a><span>${credits(t)}</span><small>MR 제공</small>${trackStats(t)}${karaokeParticipationHTML(t)}</div><div class="karaoke-browse-actions"><button class="list-action small-button" data-play="${esc(t.id)}" aria-label="${esc(t.title)} 원곡 듣기">${icon('ui-play-action')} 원곡 듣기</button><a class="text-link" href="#community/rankings?period=all&amp;original_id=${esc(t.id)}">커버 랭킹</a><a class="list-action small-button" href="#sing/${esc(t.id)}">${icon('mic')} 부르기</a><a class="text-link" href="#cover/${esc(t.id)}">녹음 파일 올리기</a></div><div class="karaoke-cover-results" id="covers-${esc(t.id)}" hidden></div></article>`).join('')}</div>`:empty('아직 부를 수 있는 곡이 없습니다.','MR이 준비되고 원곡자가 커버를 허락한 곡이 여기에 표시됩니다.','#community/covers','다른 사람의 커버 둘러보기');}
function communityPeopleStrip(tracks){const seen=new Set(),people=[];for(const t of tracks){const id=t.producer_id,name=t.producer;if(!id||!name||seen.has(id))continue;seen.add(id);people.push({id,name,image_version:t.producer_image_version,kind:t.kind,cover_mode:t.cover_mode});if(people.length>=10)break;}return people.length?`<section class="community-people"><div class="community-people-heading"><div><h2>새로운 목소리</h2><p>최근 커버나 신곡을 올린 사람들의 프로필을 만나보세요.</p></div><a href="#following">팔로잉 보기</a></div><div class="community-people-row">${people.map(p=>`<a href="#producer/${esc(p.id)}"><span class="community-person-avatar profile-avatar">${avatarImage(p)}</span><strong>${userNickname(p.name,{profileId:p.id})}</strong><small>${p.kind==='cover'?(p.cover_mode==='duet'?'듀엣 공개':'커버 공개'):'신곡 공개'}</small></a>`).join('')}</div></section>`:'';}
function communityFeed(tracks){return tracks.length?'<div class="music-feed">'+tracks.map(t=>musicTrackCard(t)).join('')+'</div>':empty('아직 공개된 음악이 없습니다.','다른 음악을 둘러보거나 첫 곡을 들려 주세요.','#karaoke','부를 곡 찾기');}
function musicRowActionsHTML(t,plays=t.plays,playsIcon='ui-plays',story=false){
 const id=esc(t.id),title=esc(t.title),isLiked=liked(t.id),playCount=number(plays||0),comments=number(t.comments||0);
 const toggle=typeof inApp==='undefined'||!inApp?' data-community-toggle data-row-playback data-title="'+title+'" aria-pressed="false"':'';
 const menu=`<button type="button" class="list-action icon-button${story?' song-cover-more':''}" data-track-menu="${id}" aria-label="${title} 더보기">${icon('ui-menu-action')}</button>`;
 return `<span class="metric-inline song-table-stat song-table-plays" aria-label="재생 ${playCount}회">${icon(playsIcon)}<span>${playCount}</span></span>
 <button type="button" class="list-action metric-inline song-table-stat song-table-like ${isLiked?'is-active':''}" data-like="${id}" aria-pressed="${isLiked}" aria-label="${title} 좋아요">${icon('ui-heart')}<span data-like-count>${number(t.likes||0)}</span></button>
 <a class="list-action metric-inline song-table-stat song-table-comments" href="#song/${id}?comments=1" aria-label="댓글 ${comments}개">${icon('ui-comment')}<span>${comments}</span></a>
 <button type="button" class="list-action song-table-play${story?' song-cover-play':' chart-mobile-play'}" data-play="${id}"${toggle} aria-label="${title} 재생">${icon('ui-play-action')}</button>
 ${story?menu:'<div class="song-table-tools">'+menu+'</div>'}`;
}
function chartPageTable(tracks,kind){
 const fresh=kind==='releases',coverChart=kind==='covers';
 remember(tracks);
 return '<div class="song-table song-table-chart chart-ui '+(fresh?'chart-releases':'chart-standard')+'"><div class="song-table-head" aria-hidden="true"><span>순위</span><span></span><span>곡명 · 아티스트</span><span>변동</span><span>'+(coverChart?'커버 수':'감상 수')+'</span><span>좋아요</span><span>댓글</span><span>재생</span><span></span></div>'+tracks.map(t=>{
  const id=esc(t.id),title=esc(t.title);
  return `<article data-list-row data-chart-row="${id}" class="song-table-row" tabindex="0" aria-label="${t.chart_rank}위 ${title} 곡 정보"><span class="song-table-position">${t.chart_rank}</span><div class="chart-art-wrap"><a class="song-table-cover" href="#song/${id}" aria-label="${title} 곡 정보">${cover(t,'mini-cover')}</a><button class="list-action chart-cover-play" data-play="${id}" aria-label="${title} 재생">${icon('ui-play-action')}</button></div><div class="chart-song-copy"><a class="chart-song-title" href="#song/${id}" title="${title}"><strong>${AifectCoverPick.titleHTML(t,title)}</strong></a><div class="chart-song-credit" title="${esc(t.artist||t.producer)}">${credits(t)}</div></div>${chartMovementHTML(t)}${musicRowActionsHTML(t,coverChart?t.chart_covers:t.chart_plays,coverChart?'mic':'ui-plays')}</article>`;
 }).join('')+'</div>';
}
const chartPeriodLabels={week:'주간',month:'월간',all:'전체'};
const chartKindLabels={'':'인기',top:'인기',covers:'커버',releases:'신곡',karaoke:'커버'};
const chartPlaylistLimit=500;
function chartDate(date,short=false){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:short?'2-digit':'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 return ['year','month','day'].map(key=>parts.find(part=>part.type===key).value).join('.');
}
function chartName(view){return (chartKindLabels[view.chartKind||'']||'인기')+'차트';}
function chartDefaultName(view){return [chartName(view),chartPeriodLabels[view.chartPeriod],chartDate(new Date(),true)].filter(Boolean).join(' · ');}
function uniqueChartTracks(tracks){
 const seen=new Set();
 return tracks.filter(t=>t.id&&!seen.has(t.id)&&seen.add(t.id));
}
function playableChartTracks(tracks){return uniqueChartTracks(tracks.filter(t=>t.playable!==false&&Number(t.duration)>0));}
function shuffleBrowseTracks(tracks){
 const shuffled=[...tracks];
 for(let i=shuffled.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));
  [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
 }
 return shuffled;
}
function chartPlaybackActions(tracks,{kind='',period='week',genre=''}={}){
 const canPlay=tracks.some(t=>t.playable!==false&&Number(t.duration)>0);
 return `<div class="chart-toolbar">
  <button type="button" class="chart-action" data-chart-play-all ${canPlay?'':'disabled'}>${icon('play')}<span>전체 듣기</span></button>
  <button type="button" class="chart-action" data-chart-shuffle ${canPlay?'':'disabled'}>${icon('shuffle')}<span>섞어 듣기</span></button>
  <button type="button" class="chart-action" data-chart-playlist ${tracks.length?'':'disabled'}>${icon('plus')}<span>차트 담기</span></button>
  <details class="chart-period"><summary class="chart-action" aria-label="차트 기간: ${chartPeriodLabels[period]}"><span>${chartPeriodLabels[period]}</span>${icon('ui-chevron')}</summary>
   <nav class="chart-period-menu" aria-label="차트 기간 선택">${Object.entries(chartPeriodLabels).map(([key,label])=>`<a href="${esc(chartHref(kind,key,genre))}" ${key===period?'aria-current="true"':''}>${label}</a>`).join('')}</nav>
  </details>
 </div>`;
}
let chartPlaylistOpening=false;
async function chartPlaylistDialog(view){const ticket=renderId;
 const modal=$('#dialog');
 if(chartPlaylistOpening||modal.open)return;
 if(!me){returnRoute=location.hash;return askLogin();}
 chartPlaylistOpening=true;
 const uid=me.id,route=location.hash,tracks=uniqueChartTracks(view.tracks),name=chartDefaultName(view);
 const items=tracks.filter(AifectPlaylist.isPlaylistEligibleTrack).map(t=>({kind:t.kind,content_id:t.id}));
 const unavailable=tracks.length-items.length,canSave=items.length>0&&items.length<=chartPlaylistLimit;
 const current=()=>ticket===renderId&&location.hash===route&&me?.id===uid;
 try{
  await refreshLibrary(true);
  if(!current()||modal.open||!canCreatePlaylist())return;
  const total=(unavailable?'저장 가능 ':'전체 ')+number(items.length)+'곡';
  const scope=[chartPeriodLabels[view.chartPeriod],view.chartGenre,total].filter(Boolean).join(' · ');
  const countNote=unavailable?`차트 ${number(tracks.length)}곡 중 ${number(unavailable)}곡은 현재 담을 수 없습니다.`:'';
  const limitNote=items.length>chartPlaylistLimit?'플레이리스트에는 최대 500곡까지 담을 수 있습니다.':'';
  dialog(`<section class="chart-playlist-dialog">
   <h2 tabindex="-1" autofocus>차트 담기</h2>
   <div class="chart-playlist-summary">${icon('chart',20)}<div><strong>${esc(chartName(view))}</strong><p class="field-help">${esc(scope)}</p></div></div>
   <form id="chart-playlist-form">
    ${formField('플레이리스트 이름','name','text',name,'required maxlength="80"')}
    <p class="field-help">차트 순서대로 저장되며, 담은 곡은 내 플레이리스트에서 편집할 수 있어요.</p>
    ${countNote||limitNote?`<p class="field-help">${countNote} ${limitNote}</p>`:''}
    <p class="form-error" role="alert"></p>
    <button type="submit" class="chart-confirm" ${canSave?'':'disabled'}>${icon('plus',18)} ${items.length?total+' 담기':'담을 곡 없음'}</button>
   </form>
  </section>`);
  const form=$('#chart-playlist-form'),input=form.elements.name,confirm=form.querySelector('[type="submit"]'),close=$('#dialog-close');
  let attempt=null,awaitingReceipt=false;
  const sync=()=>{confirm.disabled=!!form._busy||!canSave||!input.value.trim();};
  form.oninput=sync;
  const preventClose=event=>{
   if(!form._busy||(event.type!=='cancel'&&event.target!==modal))return;
   event.stopImmediatePropagation();
   event.preventDefault();
  };
  modal.addEventListener('cancel',preventClose,true);
  modal.addEventListener('click',preventClose,true);
  modal.addEventListener('close',()=>{
   modal.removeEventListener('cancel',preventClose,true);
   modal.removeEventListener('click',preventClose,true);
  },{once:true});
  const submit=busyForm(form,async fd=>{
   if(!current())throw Error('차트 또는 계정이 변경되었습니다. 창을 다시 열어 주세요.');
   const enteredName=fd.get('name').trim();
   if(!attempt||(!awaitingReceipt&&attempt.name!==enteredName))attempt={name:enteredName,request_id:crypto.randomUUID()};
   try{
    await api('/api/playlists/from-chart','POST',{...attempt,items});
   }catch(error){
    if(!error.status||error.status>=500)awaitingReceipt=true;
    if(awaitingReceipt)throw Error('저장 결과를 확인하지 못했습니다. 담기 버튼을 다시 눌러 확인해 주세요.');
    throw error;
   }
   if(me?.id!==uid)return;
   if(form.isConnected&&modal.open)modal.close();
   toast('내 플레이리스트에 저장했습니다.','success');
   void refreshLibrary(true).catch(()=>{});
  });
  form.onsubmit=async event=>{
   event.preventDefault();
   if(confirm.disabled||form._busy)return;
   input.readOnly=true;close.disabled=true;
   try{await submit(event);}finally{input.readOnly=awaitingReceipt;close.disabled=false;sync();}
  };
  sync();
 }finally{chartPlaylistOpening=false;}
}
let chartToolbarCleanup=null;
function bindChartToolbar(view,root=$('.chart-toolbar')){
 chartToolbarCleanup?.();chartToolbarCleanup=null;
 if(!root)return;
 const details=root.querySelector('.chart-period'),create=root.querySelector('[data-chart-playlist]');
 if(create)create.onclick=()=>chartPlaylistDialog(view).catch(e=>toast(e.message));
 if(view&&create){
  const ticket=renderId,route=location.hash,tracks=playableChartTracks(view.tracks);
  const start=async mix=>{
   await accountReady;
   if(!root.isConnected||ticket!==renderId||location.hash!==route||!tracks.length)return;
   const queue=mix?shuffleBrowseTracks(tracks):tracks;
   if(shuffle)$('#shuffle').click();
   await play(queue[0].id,queue);
  };
  root.querySelector('[data-chart-play-all]').onclick=()=>start(false).catch(e=>toast(e.message));
  root.querySelector('[data-chart-shuffle]').onclick=()=>start(true).catch(e=>toast(e.message));
 }
 if(!details)return;
 const choose=e=>{const choice=e.target.closest('a');if(choice){const label=details.querySelector('summary span');if(label)label.textContent=choice.textContent;details.open=false;}};
 details.addEventListener('click',choose);
 const close=e=>{if(e.type==='keydown'){if(e.key==='Escape'&&details.open){details.open=false;details.querySelector('summary').focus();}}else if(!details.contains(e.target))details.open=false;};
 document.addEventListener('click',close);document.addEventListener('keydown',close);
 const cleanup=()=>{details.removeEventListener('click',choose);document.removeEventListener('click',close);document.removeEventListener('keydown',close);window.removeEventListener('hashchange',cleanup);};
 chartToolbarCleanup=cleanup;window.addEventListener('hashchange',cleanup,{once:true});
}
async function popularChartView(raw='',kind='',readApi=api){
 const selection=chartRouteSelection('charts'+(kind?'/'+kind:'')+(raw.includes('?')?'?'+raw.split('?')[1]:''));
 return chartViewFromData(selection,await readChartData(selection,readApi),raw||selection.raw);
}
// These three chart tabs share one mounted shell. The legacy karaoke chart
// keeps its own content, API and route lifecycle.
const chartDataCache=new Map(),CHART_DATA_TTL=30000;
const chartRevision=()=>typeof apiRevision==='number'?apiRevision:0;
const chartAccount=()=>me?.id||'guest';
function preserveBlockCharts(previous,next){
 const prefix=chartAccount()+':'+previous+':';
 for(const [key,entry] of [...chartDataCache])if(key.startsWith(prefix)){chartDataCache.delete(key);chartDataCache.set(chartAccount()+':'+next+':'+key.slice(prefix.length),{...entry,revision:next});}
}
function chartRouteSelection(raw=''){
 if(typeof raw!=='string')return null;
 raw=raw.replace(/^#?\/?/,'');
 const [path,query='']=raw.split('?'),[base,param,...rest]=path.split('/');
 if(base!=='charts'||param==='karaoke'||rest.length)return null;
 const params=new URLSearchParams(query),kind=['covers','releases'].includes(param)?param:'',requested=params.get('period');
 const period=['week','month','all'].includes(requested)?requested:'week';
 const genre=globalThis.AifectGenres?.GENRES.includes(params.get('genre'))?params.get('genre'):'';
 return {raw,kind,period,genre,key:kind+':'+period+(genre?':'+genre:'')};
}
function chartTargetId(raw){try{return decodeURIComponent(raw.replace(/^#/,''));}catch{return raw.replace(/^#/,'');}}
function chartRouteTargetsHTML(raw=''){
 const routes=new Set([raw,'charts','charts/top']);
 for(const kind of ['','covers','releases'])for(const period of ['','week','month','all'])routes.add('charts'+(kind?'/'+kind:'')+(period?'?period='+period:''));
 return '<div hidden aria-hidden="true" data-chart-route-targets>'+[...routes].filter(Boolean).map(route=>'<span data-chart-route-target id="'+esc(chartTargetId(route))+'"></span>').join('')+'</div>';
}
function rememberChartRouteTarget(raw,root=$('.charts-final')){
 if(!chartRouteSelection(raw))return;
 const host=root?.querySelector('[data-chart-route-targets]');if(!host)return;
 const id=chartTargetId(raw);if([...host.children].some(node=>node.id===id))return;
 const target=document.createElement('span');target.setAttribute('data-chart-route-target','');target.id=id;host.append(target);
}
function canRefreshChartRoute(raw){
 const main=$('#main'),root=main?.querySelector('.charts-final'),state=root?._chartRouteState;
 return !!(chartRouteSelection(raw)&&chartRouteSelection(main?.dataset.route)&&state&&!state.disposed&&state.account===chartAccount()&&main.dataset.account===chartAccount()&&root.querySelector('#chart-content')&&root.querySelector('.chart-tabs'));
}
function chartCacheKey(selection){return chartAccount()+':'+chartRevision()+':'+selection.key;}
function cachedChartData(selection){
 const entry=chartDataCache.get(chartCacheKey(selection));
 return entry&&entry.until>Date.now()?structuredClone(entry):null;
}
async function readChartData(selection,readApi=api,force=false){
 const account=chartAccount(),revision=chartRevision(),key=chartCacheKey(selection);
 const check=()=>{if(account!==chartAccount()||revision!==chartRevision()||readApi.signal?.aborted||readApi.current&&!readApi.current())throw Object.assign(new Error('이전 차트의 요청입니다.'),{name:'AbortError'});};
 check();const cached=!force&&cachedChartData(selection);if(cached)return cached;
 const params=new URLSearchParams({section:'tracks',full:'1',chart:{covers:'covers',releases:'new'}[selection.kind]||'listens',period:selection.period});
 if(selection.genre)params.set('genre',selection.genre);
 const data=await readApi('/api/catalog?'+params,'GET',undefined,{fresh:true});check();
 const entry={data:structuredClone(data),account,revision,until:Date.now()+CHART_DATA_TTL};
 chartDataCache.delete(key);chartDataCache.set(key,entry);
 while(chartDataCache.size>36)chartDataCache.delete(chartDataCache.keys().next().value);
 return structuredClone(entry);
}
function chartViewFromData(selection,entry,raw=selection.raw){
 const {kind,period,genre}=selection,{chart,tracks}=entry.data;
 const contentHtml=chartPlaybackActions(tracks,selection)+(tracks.length?chartPageTable(tracks,kind):empty('아직 집계된 곡이 없습니다.','선택한 차트에 해당하는 공개 제작곡이 여기에 표시됩니다.','#home','홈으로'))+(chart?.comparison?.available?'':'<p class="field-help chart-comparison-note">같은 집계 기준의 전날 기록이 준비되면 순위 변동을 표시합니다.</p>');
 return {html:'<section class="charts-final">'+chartRouteTargetsHTML(raw)+chartTabs(kind,period,genre)+'<div id="chart-content" role="region" aria-labelledby="chart-tab-'+(kind||'popular')+'">'+contentHtml+'</div></section>',contentHtml,tracks,chartPage:true,chartKind:kind,chartPeriod:period,chartGenre:genre,chartUntil:entry.until,chartRevision:entry.revision,chartAccount:entry.account};
}
function holdChartViewport(panel,pending=false){
 if(!panel?.style||!panel.getBoundingClientRect)return;
 const rect=panel.getBoundingClientRect(),scale=panel.offsetHeight?rect.height/panel.offsetHeight:1;
 const height=Math.max(pending?rect.height:0,(window.scrollY||0)>0?(window.innerHeight||0)-rect.top:0);
 panel.style.minHeight=height>0?Math.ceil(height/(scale||1))+'px':'';
}
function paintChartTabs(root,selection){
 for(const link of root.querySelectorAll('.chart-tabs a')){
  const kind=link.dataset.chartTab,active=kind===selection.kind;
  link.setAttribute('href',chartHref(kind,selection.period,selection.genre));
  link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  rememberChartRouteTarget(link.getAttribute('href'),root);
 }
 root.querySelector('#chart-content')?.setAttribute('aria-labelledby','chart-tab-'+(selection.kind||'popular'));
 rememberChartRouteTarget(selection.raw,root);
}
function bindChartRoute(view){
 if(!view?.chartPage||view.chartKind==='karaoke')return;
 // Cached navigation binds the restored DOM before updating main.dataset.route.
 const main=$('#main'),root=main?.querySelector('.charts-final'),panel=root?.querySelector('#chart-content'),selection=chartRouteSelection(location.hash)||chartRouteSelection(main?.dataset.route);
 if(!root||!panel||!selection)return;
 let state=root._chartRouteState;
 if(!state||state.disposed){
  state=root._chartRouteState={account:chartAccount(),request:0};
  const navigate=e=>{
   const link=e.target.closest('.chart-tabs a[href],.chart-period-menu a[href]');
   if(!link||e.defaultPrevented||e.button>0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||link.target&&link.target!=='_self')return;
   const href=link.getAttribute('href'),next=chartRouteSelection(href);if(!next)return;
   e.preventDefault();rememberChartRouteTarget(href,root);
   if(next.key===state.key){if(state.error)void refreshChartRoute(main.dataset.route,renderId,api,undefined,true);return;}
   location.hash=href;
  };
  root.addEventListener('click',navigate);
  const scroll=()=>{if(root.isConnected&&!state.pending)holdChartViewport(panel);};
  window.addEventListener('scroll',scroll,{passive:true});
  if(typeof registerRouteCleanup==='function')registerRouteCleanup(()=>{state.disposed=true;state.cancel?.();root.removeEventListener('click',navigate);window.removeEventListener('scroll',scroll);panel.style.minHeight='';});
 }
 Object.assign(state,{key:selection.key,revision:view.chartRevision,until:view.chartUntil,view,pending:false,error:false});
 paintChartTabs(root,selection);
}
async function refreshChartRoute(raw,ticket,readApi=api,showCurrentTab,force=false){
 if(!canRefreshChartRoute(raw))return false;
 const selection=chartRouteSelection(raw),main=$('#main'),root=main.querySelector('.charts-final'),panel=root.querySelector('#chart-content'),state=root._chartRouteState,account=chartAccount(),revision=chartRevision();
 state.cancel?.();const request=++state.request;
 main.dataset.route=raw;main.removeAttribute('aria-busy');paintChartTabs(root,selection);
 const mounted=()=>!state.disposed&&root.isConnected&&root===main.querySelector('.charts-final')&&root._chartRouteState===state&&state.request===request&&ticket===renderId&&main.dataset.route===raw&&location.hash.replace(/^#/,'')===raw&&account===chartAccount();
 let timedOut=false,timer;
 const current=()=>mounted()&&!timedOut&&revision===chartRevision()&&!readApi.signal?.aborted&&(!readApi.current||readApi.current());
 if(!force&&state.key===selection.key&&!state.pending&&!state.error&&state.revision===revision&&state.until>Date.now()){
  bindChartToolbar(state.view);bindChartPlayback();showCurrentTab?.();return true;
 }
 const paint=entry=>{
  const view=chartViewFromData(selection,entry,raw);
  holdChartViewport(panel,true);panel.innerHTML=view.contentHtml;panel.removeAttribute('aria-busy');
  Object.assign(state,{key:selection.key,revision,until:entry.until,view,pending:false,error:false});
  routeTracks=remember(view.tracks);bindBrowse(view);icons();paintInteractions();holdChartViewport(panel);
 };
 const fail=message=>{
  Object.assign(state,{key:selection.key,pending:false,error:true,view:null,until:0});routeTracks=[];
  panel.removeAttribute('aria-busy');panel.innerHTML=chartPlaybackActions([],selection)+'<div class="surface empty-design" role="alert"><h2>차트를 불러오지 못했습니다</h2><p>'+esc(message)+'</p><button type="button" class="small-button" data-chart-retry>다시 시도</button></div>';
  panel.querySelector('[data-chart-retry]').onclick=()=>refreshChartRoute(raw,renderId,api,undefined,true);holdChartViewport(panel);
 };
 const cached=!force&&cachedChartData(selection);
 if(cached&&current()){paint(cached);showCurrentTab?.();return true;}
 chartToolbarCleanup?.();chartToolbarCleanup=null;
 Object.assign(state,{key:selection.key,pending:true,error:false,view:null,until:0});routeTracks=[];
 holdChartViewport(panel,true);panel.setAttribute('aria-busy','true');panel.innerHTML=chartPlaybackActions([],selection)+'<div class="route-loading" role="status"><span>차트를 불러오는 중…</span><div></div><div></div><div></div></div>';showCurrentTab?.();
 const stopped=Symbol('chart-stopped'),controller=new AbortController();let stop;
 const cancelled=new Promise(resolve=>{stop=()=>{controller.abort();resolve(stopped);};});state.cancel=stop;
 readApi.signal?.addEventListener('abort',stop,{once:true});
 const localRead=(path,method,body,options)=>readApi(path,method,body,{...options,signal:controller.signal});localRead.signal=controller.signal;localRead.current=current;
 try{
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{if(mounted())fail('연결이 지연되고 있습니다. 다시 시도해 주세요.');timedOut=true;controller.abort();resolve(stopped);},20000);});
  const entry=await Promise.race([readChartData(selection,localRead,force),timeout,cancelled]);
  if(entry!==stopped&&current())paint(entry);
 }catch(error){
  if(error.name==='AbortError'&&mounted()&&revision!==chartRevision()&&!readApi.signal?.aborted&&(!readApi.current||readApi.current()))return refreshChartRoute(raw,ticket,readApi,showCurrentTab,true);
  if(mounted()&&!timedOut&&error.name!=='AbortError')fail(error.message);
 }finally{clearTimeout(timer);readApi.signal?.removeEventListener('abort',stop);if(state.cancel===stop)state.cancel=null;}
 return true;
}
async function browseView(base,param,raw,embedded=false,readApi=api){
 if(base==='karaoke'&&param==='browse')return playBrowseV3(raw,readApi);
 if(base==='charts'&&param!=='karaoke')return popularChartView(raw,['covers','releases'].includes(param)?param:'',readApi);
 if(base==='search')return null;
 if(base==='charts'&&param==='karaoke'||base==='karaoke'&&param==='chart'){
  const requested=new URLSearchParams(raw.includes('?')?raw.split('?')[1]:'').get('period'),period=['week','month','all'].includes(requested)?requested:'week';
  const d=await readApi('/api/cover-rankings?kind=tracks&period='+period+'&include_unranked=1&full=1'),tracks=d.tracks.filter(t=>t.kind==='cover');
  return {html:heading('노래방 차트','공개된 커버곡만 모았습니다. 선택한 기간에 받은 좋아요 순으로 만나 보세요.')+chartTabs('karaoke',period)+chartLayoutHTML(`<div class="chart-toolbar"><details class="chart-period"><summary class="chart-action">${chartPeriodLabels[period]}</summary><nav class="chart-period-menu">${Object.entries(chartPeriodLabels).map(([key,label])=>`<a href="#charts/karaoke?period=${key}">${label}</a>`).join('')}</nav></details></div>`+browsePlaybackActions(tracks)+(tracks.length?coverRankTracksHTML(tracks):empty('아직 등록된 커버곡이 없습니다','첫 커버곡이 공개되면 이곳에서 만날 수 있습니다.','#karaoke','플레이')),tracks,'karaoke'),tracks,chartPage:true,chartKind:'karaoke',chartPeriod:period};
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
  html+=tab==='covers'&&owned.length?coverCollectionHTML(owned,'my-covers',true):owned.length?`<div class="own-music-list">${owned.map(t=>`<article data-list-row class="own-music-row">${cover(t,'mini-cover')}<div><strong>${esc(t.title)}</strong><small>${esc(({published:'공개 중',draft:'작성 중',processing:'음원 처리 중',hidden:'비공개',failed:'처리 실패'})[t.status]||'준비 중')}</small></div><div class="list-actions">${t.status==='published'?`<button class="list-action icon-button" data-play="${esc(t.id)}" aria-label="${esc(t.title)} 듣기">${icon('ui-play-action')}</button>`:''}<a class="small-button" href="#manage/${esc(t.id)}">관리</a></div></article>`).join('')}</div>`:empty(tab==='covers'?'아직 내 커버곡이 없습니다.':'아직 내 제작곡이 없습니다.','좋아하는 음악으로 나만의 이야기를 시작해 보세요.',tab==='covers'?'#karaoke':'#upload',tab==='covers'?'부를 곡 찾아보기':'음악 올리기');
  return {html,tracks:published};
 }
 return null;
}
function bindBrowse(view){
 bindCommunity(view);
 bindChartPlayback();
 if(view?.chartPage){
  bindChartRoute(view);
  bindChartToolbar(view);
  routeTracks=playableChartTracks(view.tracks);
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
   panel.innerHTML=d.covers.length?'<h3>이 곡에 참여한 커버</h3><div class="karaoke-participant-list">'+d.covers.map(t=>'<article data-list-row><a href="#song/'+esc(t.id)+'">'+cover(t,'mini-cover')+'</a><div><a href="#song/'+esc(t.id)+'"><strong>'+AifectCoverPick.titleHTML(t)+'</strong></a><a href="#producer/'+esc(t.producer_id)+'">'+userNickname(t.producer,{profileId:t.producer_id})+'</a><small>'+musicKind(t)+' · '+number(t.plays||0)+'회 감상</small></div><button class="list-action small-button" data-play="'+esc(t.id)+'" aria-label="'+esc(t.producer)+'의 커버 듣기">'+icon('ui-play-action')+' 듣기</button></article>').join('')+'</div>':'<p>아직 참여한 커버가 없습니다. 첫 목소리를 남겨 보세요.</p>';
   panel.dataset.loaded='1';
  }catch(error){if(panel.isConnected)panel.innerHTML='<p role="alert">'+esc(error.message)+' 접었다 다시 누르면 재시도할 수 있습니다.</p>';}
  finally{button.disabled=false;}
 });
 if(view?.singingHub){bindSingingHub(view);return;}
 const search=$('#karaoke-search');if(search)search.oninput=()=>{const q=search.value.trim().toLocaleLowerCase(),items=view.karaokeTracks.filter(t=>[t.title,t.artist,t.producer].join(' ').toLocaleLowerCase().includes(q));routeTracks=items;$('#karaoke-count').textContent=items.length+'곡';document.querySelectorAll('[data-browse-count]').forEach(el=>el.textContent=items.length+'곡');$('#karaoke-results').innerHTML=items.length?karaokeRows(items,view.ranked):'<p class="empty-inline">일치하는 곡이 없습니다. 다른 제목이나 창작자 이름을 검색해 보세요.</p>';document.querySelectorAll('[data-play-all],[data-browse-shuffle]').forEach(b=>b.disabled=!items.length);};
 const button=$('[data-browse-shuffle]');if(button)button.onclick=async()=>{const tracks=shuffleBrowseTracks(routeTracks);if(tracks.length)try{if(view?.chartPage&&shuffle)$('#shuffle').click();await play(tracks[0].id,tracks);}catch(e){toast(e.message);}};
}

let homeBrowseObserver=null;
