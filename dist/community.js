// Public cover discovery shares the Android ranking API and its KST periods.
const coverPeriods=[['today','오늘의 커버','오늘, 마음을 사로잡은 목소리','heart'],['week','주간 인기 커버','이번 주 함께 듣는 커버곡','chart'],['month','이달의 커버','한 달의 취향을 모아서','mic'],['all','명예의 전당','오래도록 사랑받는 목소리','sparkles']];
function coverRankOptions(raw=''){
 const q=new URLSearchParams(raw.split('?')[1]||'');
 return {period:coverPeriods.some(([key])=>key===q.get('period'))?q.get('period'):'today',kind:q.get('kind')==='singers'?'singers':'tracks',genre:genres.includes(q.get('genre'))?q.get('genre'):'전체',q:(q.get('q')||'').trim().slice(0,100),original_id:/^[\w-]{1,100}$/.test(q.get('original_id')||'')?q.get('original_id'):''};
}
function coverRankParams(options){const p=new URLSearchParams({period:options.period,kind:options.kind});if(options.genre!=='전체')p.set('genre',options.genre);if(options.q)p.set('q',options.q);if(options.original_id)p.set('original_id',options.original_id);return p;}
function coverRankHref(options,changes={}){return '#community/rankings?'+coverRankParams({...options,...changes});}
function coverDiscoveryHTML(options){return `<section class="cover-discovery" aria-label="커버곡 랭킹 둘러보기"><div class="cover-discovery-title"><div><span class="eyebrow">YOUR VOICE, OUR PLAYLIST</span><h2>듣다 보면, 부르고 싶어지는.</h2><p>좋아요로 발견하는 우리들의 커버곡</p></div><a class="text-link" href="#karaoke">나도 불러보기 ${icon('arrow')}</a></div><nav class="cover-periods" aria-label="커버 랭킹 기간">${coverPeriods.map(([key,label,description,symbol])=>`<a class="cover-period cover-period-${key} ${key===options.period?'is-selected':''}" href="${esc(coverRankHref(options,{period:key}))}" ${key===options.period?'aria-current="page"':''}><span class="cover-period-top">${icon(symbol)}<span>${key==='today'?'TODAY':key==='week'?'THIS WEEK':key==='month'?'THIS MONTH':'ALL TIME'}</span>${icon('arrow')}</span><strong>${label}</strong><small>${description}</small></a>`).join('')}</nav></section>`;}
function coverRankingShell(options){const label=coverPeriods.find(([key])=>key===options.period)[1];return `<section class="cover-ranking" aria-labelledby="cover-ranking-title"><div class="cover-ranking-heading"><div><h2 id="cover-ranking-title">${options.original_id?'이 곡의 커버 랭킹':label}</h2><p>${options.period==='all'?'누적 좋아요':options.period==='today'?'오늘 받은 좋아요':options.period==='week'?'이번 주 받은 좋아요':'이번 달 받은 좋아요'} 순 · 한국시간 기준</p></div><nav class="cover-kind-tabs" aria-label="커버 랭킹 종류">${[['tracks','커버곡'],['singers','가수']].map(([key,title])=>`<a class="${options.kind===key?'active':''}" href="${esc(coverRankHref(options,{kind:key}))}" ${options.kind===key?'aria-current="page"':''}>${title}</a>`).join('')}</nav></div>${options.original_id?`<p class="cover-original-filter"><a class="text-link" href="#song/${esc(options.original_id)}">원곡 보기</a><a class="text-link" href="${esc(coverRankHref(options,{original_id:''}))}">전체 곡 랭킹 보기</a></p>`:''}<form id="cover-rank-filter" class="cover-rank-filter"><label><span class="sr-only">장르 선택</span><select name="genre" aria-label="커버 장르">${genres.map(g=>`<option value="${esc(g)}" ${g===options.genre?'selected':''}>${g==='전체'?'모든 장르':esc(g)}</option>`).join('')}</select></label><label class="cover-rank-search">${icon('search')}<input name="q" type="search" aria-label="커버곡 또는 가수 검색" placeholder="커버곡 또는 부른 사람 찾기" maxlength="100" value="${esc(options.q)}"></label><button class="small-button" type="submit">검색</button>${options.q||options.genre!=='전체'?`<a class="text-link" href="${esc(coverRankHref(options,{q:'',genre:'전체'}))}">초기화</a>`:''}</form><div id="cover-ranking-results" aria-busy="true"><p class="cover-ranking-status" role="status">커버 랭킹을 불러오고 있어요.</p></div><p class="cover-ranking-note">${options.period==='week'?'이번 주 월요일부터, ':options.period==='month'?'이번 달 1일부터, ':''}취소하지 않은 좋아요를 받은 공개 커버곡이 순위에 올라요.${options.kind==='singers'?' 가수 순위는 해당 커버곡의 좋아요 합계예요.':''}</p></section>`;}
function communityNavigation(tab){return '<nav class="tabs music-community-tabs" aria-label="커뮤니티">'+[['all','추천'],['covers','커버'],['duets','듀엣'],['crews','크루'],['following','팔로잉']].map(([key,label])=>'<a class="tab '+(tab===key?'active':'')+'" href="#community'+(key==='all'?'':'/'+key)+'" '+(tab===key?'aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>';}
function communityRouteOptions(base,param,raw=''){
 const tab=base==='covers'?'covers':['covers','originals','duets','following','rankings'].includes(param)?param:'all';
 const q=new URLSearchParams(raw.split('?')[1]||''),open=tab==='duets'&&q.get('open')==='1';
 const query=tab==='covers'?'?kind=cover&cover_mode='+(q.get('mode')==='duet'?'duet':'solo'):tab==='duets'?'?kind=cover&cover_mode=duet':tab==='originals'?'?kind=original':tab==='following'?'?following=1':'';
 return {tab,open,path:open?'/api/duets':'/api/community'+query};
}
function communityViewHTML(base,param,raw='',data=null){
 const {tab,open}=communityRouteOptions(base,param,raw),tracks=data?.tracks||[];
 let html=heading('커뮤니티','좋은 음악을 듣고, 담고, 함께 만들어가요.')+communityNavigation(tab);
 if(tab==='rankings'){const options={...coverRankOptions(raw),limit:50};return {html:html+coverDiscoveryHTML(options)+coverRankingShell(options),tracks:[],coverRanking:options};}
 if(tab==='following'&&!me){returnRoute=location.hash;return {html:html+gate()};}
 if(tab==='all')html+='<a class="music-crew-entry" href="#community/crews">'+icon('users')+'<div><strong>크루에서 함께 듣고 부르기</strong><small>내 크루 · 멤버들의 음악 · 크루 채팅</small></div>'+icon('chevron')+'</a>';
 if(tab==='duets')html+='<nav class="tabs" aria-label="듀엣 종류"><a class="tab '+(!open?'active':'')+'" href="#community/duets">듀엣 감상</a><a class="tab '+(open?'active':'')+'" href="#community/duets?open=1">참여를 기다리는 듀엣</a></nav>';
 const label=open?'함께 부를 파트를 남겼어요':tab==='following'?'팔로잉의 새 음악':tab==='originals'?'새로 공개된 제작곡':tab==='covers'?'새로 공개된 커버':tab==='duets'?'함께 완성한 목소리':'새로 도착한 음악';
 html+='<div class="music-community-heading"><div><h2>'+label+'</h2><p>원곡도 커버도, 마음에 들면 내 플레이리스트에.</p></div></div>';
 html+=!data?'<div class="route-loading" role="status"><span>새 음악을 불러오는 중…</span><div></div><div></div><div></div></div>':tracks.length?(tab==='all'?communityRecommendations(tracks):['covers','duets'].includes(tab)?coverCollectionHTML(tracks,'community-covers'):communityFeed(tracks)):empty('아직 공개된 음악이 없어요.','다른 탭에서 음악을 발견해보세요.','#community','전체 음악 보기');
 if(tab==='all')html+='<nav class="music-rank-links" aria-label="커버 랭킹">'+coverPeriods.map(([key,label])=>'<a href="#community/rankings?period='+key+'">'+label+'</a>').join('')+'</nav>';
 return {html,tracks};
}
function communityPendingView(base,param,raw=''){
 if(!['community','covers'].includes(base)||param==='crews')return null;
 const {tab,path}=communityRouteOptions(base,param,raw);
 const data=typeof peekApiRead==='function'?peekApiRead(path,{display:true}):null;
 return {...communityViewHTML(base,param,raw,data),cached:!!data&&!(tab==='following'&&!me)};
}
async function communityView(base,param,raw=''){
 const {tab,path}=communityRouteOptions(base,param,raw);
 if(tab==='rankings'||tab==='following'&&!me)return communityViewHTML(base,param,raw);
 return communityViewHTML(base,param,raw,await api(path));
}
function coverRankTracksHTML(tracks){return `<ol class="cover-ranked-list">${tracks.map(t=>`<li class="cover-ranked-row"><span class="cover-position">${number(t.rank)}<span class="sr-only">위</span></span><button class="cover-ranked-art" data-play="${esc(t.id)}" aria-label="${esc(t.title)} 커버 듣기">${cover(t,'mini-cover')}<span>${icon('play')}</span></button><div class="cover-ranked-info"><a href="#song/${esc(t.id)}"><strong>${esc(t.title)}</strong></a><a href="#producer/${esc(t.producer_id)}?tab=covers">${esc(t.producer)}</a><small>${esc(t.genre)} · 원곡 ${esc(t.original_title)}</small></div><span class="cover-rank-votes">${icon('heart')} ${number(t.rank_likes)}<small>랭킹 좋아요</small></span><div class="cover-ranked-actions">${giftButton(t)}<button class="icon-button ${liked(t.id)?'is-active':''}" data-like="${esc(t.id)}" aria-label="${esc(t.title)} 좋아요" aria-pressed="${liked(t.id)}">${icon('heart')}</button><a class="icon-button" href="#song/${esc(t.id)}?comments=1" aria-label="${esc(t.title)} 댓글 ${number(t.comments)}개">${icon('message')}</a><button class="icon-button" data-add="${esc(t.id)}" aria-label="${esc(t.title)} 플레이리스트에 저장">${icon('plus')}</button></div></li>`).join('')}</ol>`;}
function coverRankSingersHTML(singers){return `<ol class="cover-singer-list">${singers.map(p=>`<li class="cover-singer-row"><span class="cover-position">${number(p.rank)}<span class="sr-only">위</span></span><a href="#producer/${esc(p.id)}?tab=covers" aria-label="${esc(p.name)}의 커버곡">${portrait(p,'producer')}</a><div class="cover-singer-info"><a href="#producer/${esc(p.id)}?tab=covers"><strong>${esc(p.name)}</strong></a><p>${esc(p.bio||'이 목소리의 다른 커버도 만나보세요.')}</p><small>랭킹 커버 ${number(p.ranked_covers)}곡 · 팔로워 ${number(p.followers)}명</small></div><span class="cover-rank-votes">${icon('heart')} ${number(p.rank_likes)}<small>랭킹 좋아요</small></span><button class="small-button" data-follow="producer/${esc(p.id)}" aria-label="${esc(p.name)} 팔로우">${followed('producer',p.id)?'팔로잉':'팔로우'}</button></li>`).join('')}</ol>`;}
async function loadCoverRanking(host,options,ticket){
 const request=host.coverRequest=(host.coverRequest||0)+1;
 const isCurrent=()=>host.isConnected&&ticket===renderId&&host.coverRequest===request;
 host.setAttribute('aria-busy','true');
 try{
  const d=await api('/api/cover-rankings?'+coverRankParams(options)+'&limit='+(options.limit||50));
  // A late response must never replace another route or its playback queue.
  if(!isCurrent())return;
  const tracks=d.tracks||[],singers=d.singers||[],items=options.kind==='singers'?singers:tracks;
  if(tracks.length){remember(tracks);const ids=new Set(tracks.map(t=>t.id));routeTracks=[...tracks,...routeTracks.filter(t=>!ids.has(t.id))];}
  host.innerHTML=items.length?(options.kind==='singers'?coverRankSingersHTML(singers):`<div class="cover-rank-play"><span>${number(tracks.length)}곡</span><button class="small-button" data-cover-play-all>${icon('play')} 랭킹 전체 듣기</button></div>`+coverRankTracksHTML(tracks)+(options.limit===5?`<a class="cover-rank-more text-link" href="${esc(coverRankHref(options))}">커버 랭킹 더 보기 ${icon('arrow')}</a>`:'')):`<div class="cover-rank-empty"><span>${icon('mic')}</span><div><h3>${options.q||options.genre!=='전체'?'이 조건에 맞는 커버 랭킹이 없어요.':'아직 순위가 정해지지 않았어요.'}</h3><p>${options.q||options.genre!=='전체'?'다른 장르나 검색어로 새로운 목소리를 찾아보세요.':'커버곡을 듣고 좋아요를 남겨보세요. 다음 순위의 주인공을 함께 골라요.'}</p><a class="text-link" href="#community/covers">최신 커버 듣기</a> <a class="text-link" href="#karaoke">부를 곡 찾기</a></div></div>`;
  const playAll=host.querySelector('[data-cover-play-all]');if(playAll)playAll.onclick=async()=>{try{await accountReady;await play(tracks[0].id,tracks);}catch(e){toast(e.message);}};
 }catch(e){if(!isCurrent())return;host.innerHTML=`<div class="cover-ranking-status" role="status"><p>커버 랭킹을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p><button class="small-button" data-cover-retry>다시 시도</button></div>`;host.querySelector('[data-cover-retry]').onclick=()=>{host.innerHTML='<p class="cover-ranking-status" role="status">커버 랭킹을 불러오고 있어요.</p>';loadCoverRanking(host,options,ticket);};}
 finally{if(isCurrent())host.setAttribute('aria-busy','false');}
}
function bindCommunity(view){
 if(!view?.coverRanking)return;
 const options=view.coverRanking,form=$('#cover-rank-filter'),host=$('#cover-ranking-results');
 if(form){const submit=()=>{const next=coverRankHref(options,{genre:form.elements.genre.value,q:form.elements.q.value.trim().slice(0,100)});if(location.hash===next)render();else location.hash=next;};form.onsubmit=e=>{e.preventDefault();submit();};form.elements.genre.onchange=submit;}
 if(host){host.coverOptions=options;loadCoverRanking(host,options,renderId);}
}

function refreshCommunityRanking(){const host=$('#cover-ranking-results');if(host?.coverOptions)loadCoverRanking(host,host.coverOptions,renderId);}

// The recommendation route reuses its existing feed instead of serially fetching every shelf.
function communityRecommendations(tracks){
 const block=(title,href,items)=>items.length?'<section class="music-discovery-section"><div class="music-community-heading"><h2>'+title+'</h2><a class="text-link" href="'+href+'">더 보기</a></div>'+communityFeed(items)+'</section>':'';
 const covers=tracks.filter(t=>t.kind==='cover'&&t.cover_mode!=='duet'),duets=tracks.filter(t=>musicIsOpenDuet(t)),originals=tracks.filter(t=>t.kind!=='cover');
 const popular=[...tracks].sort((a,b)=>(Number(b.plays)||0)-(Number(a.plays)||0));
 return block('지금 함께 듣는 음악','#charts',popular.slice(0,2))+block('새로 올라온 커버','#community/covers',covers.slice(0,2))+block('같이 부를 사람을 찾고 있어요','#community/duets?open=1',duets.slice(0,2))+(typeof communityPeopleStrip==='function'?communityPeopleStrip(tracks):'')+'<section id="community-crew-preview" class="music-discovery-section" aria-label="음악으로 모이는 크루"></section>'+block('새로 공개된 제작곡','#community/originals',originals.slice(0,2));
}
async function loadCommunityCrews(host,ticket){
 if(!host)return;
 const account=me?.id||'guest',revision=typeof apiRevision==='number'?apiRevision:0,current=()=>host.isConnected&&ticket===renderId&&account===(me?.id||'guest')&&revision===(typeof apiRevision==='number'?apiRevision:0);
 const paint=d=>{
 const all=d.crews||[],mine=all.find(c=>c.id===d.mine),crews=[...all].filter(c=>c.id!==d.mine).sort((a,b)=>(Number(b.xp)||0)-(Number(a.xp)||0)).slice(0,mine?2:3);
 if(mine){host.innerHTML='<div class="music-community-heading"><h2>내 크루</h2><a class="text-link" href="#community/crews?browse=1">다른 크루 둘러보기</a></div><div class="surface my-crew-preview"><div><strong>'+esc(mine.name)+'</strong><p>'+number(mine.members)+'명 · '+esc(mine.interests||'함께 듣는 음악')+'</p></div><nav aria-label="내 크루 바로가기">'+[['chat','message','대화'],['members','users','크루원'],['music','music','음악']].map(([tab,symbol,label])=>'<a href="'+(tab==='chat'?'#dm/crew/'+esc(mine.id):'#crew/'+esc(mine.id)+'?tab='+tab)+'">'+icon(symbol)+label+'</a>').join('')+'</nav></div>';return;}
 host.innerHTML='<div class="music-community-heading"><h2>음악으로 모이는 크루</h2><a class="text-link" href="#community/crews">모두 보기</a></div>'+(crews.length?'<div class="music-crew-preview-grid">'+crews.map(c=>'<a href="#crew/'+esc(c.id)+'"><strong>'+esc(c.name)+'</strong><span>'+esc(c.interests||'함께 듣고 부르는 음악')+'</span><small>'+number(c.members)+'명 · LV '+number(c.level)+'</small></a>').join('')+'</div>':'<a class="music-crew-entry" href="#community/crews">취향이 맞는 크루를 찾아보세요.</a>');
 };
 const cached=typeof peekCrewNavigation==='function'?peekCrewNavigation('discovery'):null;if(cached&&current())paint(cached);
 try{const d=await api('/api/crews?q=');if(!current())return;if(typeof rememberCrewDiscovery==='function')rememberCrewDiscovery(d,'',account,revision);paint(d);}
 catch{if(current()&&!cached)host.innerHTML='<a class="music-crew-entry" href="#community/crews">크루 둘러보기</a>';}
}
