// Public crew/community layouts use the existing catalog, membership and action hooks.
function publicMusicDate(created){return created?new Date(Number(created)*1000).toLocaleDateString('ko-KR',{month:'long',day:'numeric',timeZone:'Asia/Seoul'}):'';}
function crewPicture(c,cls='crew-hero-picture'){return '<span class="'+cls+'">'+(c.image_version?'<img src="/media/crew/'+esc(c.id)+'?v='+esc(c.image_version)+'" alt="'+esc(c.name)+'">':icon('users'))+'</span>';}
function crewNameHTML(c){return '<span class="crew-name-color">'+esc(c.name)+'</span>';}
function canManageCrew(membership){
 return ['owner','deputy','manager','operator'].includes(membership?.role);
}
function crewHeroHTML(c,m){
 const frame=c.level>=10?4:c.level>=8?3:c.level>=5?2:c.level>=3?1:0;
 const levelTag=c.level>=7?'<span class="crew-max-badge">'+(c.level===10?'최고 레벨 크루':'함께 성장하는 크루')+'</span>':'';
 const settings=canManageCrew(m)?`<div class="crew-settings-anchor"><button type="button" class="crew-settings-trigger" data-edit-crew="${esc(c.id)}" aria-label="크루 설정" aria-haspopup="menu" aria-expanded="false" aria-controls="crew-settings-menu" title="크루 설정">${icon('settings',22)}</button><div id="crew-settings-menu" class="fan-settings-menu" role="menu" aria-label="크루 관리" hidden></div></div>`:'';
 const game=m?`<div class="crew-weekly-games" data-crew-games="${esc(c.id)}" data-banner-ends="${Number(m.game_catalog?.banner_ends_at)||0}" data-week-ends="${Number(m.game_catalog?.ends_at)||0}">${crewGameMenuHTML(m.game_catalog)}</div>`:'';
 const next=c.next_xp==null?'최고 레벨':'다음 레벨까지 '+number(Math.max(0,c.next_xp-c.xp))+' XP';
 return `<header class="crew-detail-header crew-frame-${frame}">
   <div class="crew-identity">${crewPicture(c,'crew-detail-picture')}<div class="crew-identity-copy"><h1 title="${esc(c.name)}">${crewNameHTML(c)}</h1><span>멤버 ${number(c.members)} / ${number(c.capacity)}명</span> ${levelTag}</div>${settings}</div>
   ${game}
   <div class="crew-detail-xp"><div><span><strong>Lv.${number(c.level)}</strong> ${number(c.xp)} / ${c.next_xp==null?'MAX':number(c.next_xp)} XP</span><small>${next}</small></div><progress max="1" value="${Number(c.progress||0)}" aria-label="크루 경험치"></progress></div>
 </header>`;
}
function crewMemberProfile(p){
 const name=p.profile_name||p.name,role=crewRoleLabels[p.role==='operator'?'manager':p.role];
 return `<a class="crew-member-profile" href="#producer/${esc(p.id)}" title="${esc(name)}">
   <span class="crew-member-face player-avatar avatar-frame-host">${avatarImage(p,'producer',false)}${playerBadgeHTML(p)}</span>
   <strong>${esc(name)}</strong>${p.role!=='member'&&role?`<small>${esc(role)}</small>`:''}
 </a>`;
}
function crewMusicRows(tracks){return tracks.length?songTable(tracks):'<p class="social-empty">조건에 맞는 음악이 없어요. 검색어나 필터를 바꿔보세요.</p>';}
function crewHomeLayout(d,intro){
 const c=d.crew,tracks=d.tracks||[],members=d.members||[],gs=[...new Set(tracks.map(t=>t.genre).filter(Boolean))].sort();
 return '<div class="crew-home-layout"><div class="crew-home-main">'+(d.membership?'<a class="crew-chat-entry" href="#dm/crew/'+esc(c.id)+'">'+icon('message')+'<span><strong>크루 채팅방 들어가기</strong><small>크루원들과 음악과 이야기를 나눠보세요.</small></span>'+icon('chevron')+'</a>':'<p class="social-empty">크루에 가입하면 함께 대화할 수 있어요.</p>')+
 '<form id="crew-music-filter" class="crew-music-filter"><label class="crew-music-search">'+icon('search')+'<input name="q" type="search" maxlength="100" aria-label="크루 음악 검색" placeholder="크루 곡에서 검색하기…"></label><select data-dropdown="md" name="sort" aria-label="크루 음악 정렬"><option value="recent">최신순</option><option value="plays">재생순</option><option value="likes">좋아요순</option></select><select data-dropdown="md" name="genre" aria-label="크루 음악 장르"><option value="">모든 장르</option>'+gs.map(g=>'<option>'+esc(g)+'</option>').join('')+'</select><select data-dropdown="sm" name="period" aria-label="공개 기간"><option value="all">전체 기간</option><option value="week">최근 7일</option><option value="month">최근 30일</option></select></form><div class="section-heading"><h2>크루의 최신 음악</h2><span id="crew-music-count" role="status">'+number(tracks.length)+'곡</span></div><div id="crew-music-results">'+(tracks.length?crewMusicRows(tracks):'<p class="social-empty">아직 공개한 크루 음악이 없어요.</p>')+'</div><p class="field-help">최근 공개된 최대 60곡에서 검색하고 정렬해요.</p></div><aside class="social-side-column"><section class="social-side-card"><div class="section-heading"><h2>크루 소개</h2><a href="#crew/'+esc(c.id)+'?tab=about">더보기 '+icon('chevron')+'</a></div>'+intro+'</section><section class="social-side-card"><div class="section-heading"><h2>크루원 <small>'+number(c.members)+'명</small></h2><a href="#crew/'+esc(c.id)+'?tab=members">전체보기 '+icon('chevron')+'</a></div><div class="crew-member-preview">'+members.slice(0,5).map(p=>'<a href="#producer/'+esc(p.id)+'">'+portrait(p,'producer')+'<strong>'+userNickname(p.name,{profileId:p.id,userId:p.user_id})+'</strong><small>'+esc(crewRoleLabels[p.role]||'크루원')+'</small></a>').join('')+'</div></section><section class="social-side-card"><h2>최근 공개 활동</h2><div class="crew-activity">'+(tracks.length?tracks.slice(0,4).map(t=>'<a data-list-row href="#song/'+esc(t.id)+'">'+cover(t,'mini-cover')+'<span><strong>'+trackNickname(t,'producer')+'</strong>님의 '+(t.kind==='cover'?'커버':'새 음악')+'<b>'+esc(t.title)+'</b></span></a>').join(''):'<p class="field-help">새로 공개한 음악이 여기에 표시돼요.</p>')+'</div></section></aside></div>';
}
function filterCrewMusic(tracks,{q='',sort='recent',genre='',period='all'}={},now=Date.now()){
 const term=q.trim().toLocaleLowerCase(),cutoff=period==='week'?now/1000-7*86400:period==='month'?now/1000-30*86400:0;
 return tracks.filter(t=>(!genre||t.genre===genre)&&(!cutoff||Number(t.created)>=cutoff)&&(!term||[t.title,t.producer,t.artist].some(v=>String(v||'').toLocaleLowerCase().includes(term)))).sort((a,b)=>(sort==='plays'?Number(b.plays||0)-Number(a.plays||0):sort==='likes'?Number(b.likes||0)-Number(a.likes||0):0)||Number(b.created||0)-Number(a.created||0));
}
function bindCrewHome(view){
 const form=$('#crew-music-filter');if(!form)return;
 const update=()=>{const value=n=>form.elements[n].value,items=filterCrewMusic(view.tracks,{q:value('q'),sort:value('sort'),genre:value('genre'),period:value('period')});$('#crew-music-results').innerHTML=crewMusicRows(items);$('#crew-music-count').textContent=number(items.length)+'곡';routeTracks=items;};
 form.onsubmit=e=>{e.preventDefault();update();};form.addEventListener('input',update);form.addEventListener('change',update);
}
function communityLandingHTML(tracks,data,tab='all',{open=false,login=false}={}){
 const tags=[['커버','#community/covers'],['듀엣','#community/duets'],['크루','#community/crews?browse=1'],['플레이리스트','#collections']];
 const genreCounts=new Map();tracks.forEach(t=>{if(t.genre)genreCounts.set(t.genre,(genreCounts.get(t.genre)||0)+1);});
 const genreTags=[...genreCounts].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([g])=>[g,'#discover/genres?g='+encodeURIComponent(g)]);
 const subtitle=tab==='covers'?'새로 공개된 커버':tab==='duets'?(open?'함께 부를 목소리를 기다려요':'함께 완성한 듀엣'):tab==='following'?'팔로잉의 새 음악':tab==='originals'?'새로 공개된 제작곡':'';
 const feed=login?gate():!data?'<div class="route-loading" role="status">새 음악을 불러오는 중…</div>':tracks.length?'<div class="music-feed">'+tracks.map(communityConceptCard).join('')+'</div>':empty('아직 공개된 음악이 없어요.','새로운 음악과 목소리를 기다리고 있어요.','#karaoke','부를 곡 찾기');
 return '<div class="community-landing-layout community-redesign"><div class="community-feed-column">'+communityNavigation(tab)+''+(subtitle?'<div class="community-feed-heading"><h2>'+subtitle+'</h2>'+(tab==='duets'?'<nav aria-label="듀엣 종류"><a href="#community/duets" '+(!open?'aria-current="page"':'')+'>듀엣 감상</a><a href="#community/duets?open=1" '+(open?'aria-current="page"':'')+'>참여 대기</a></nav>':'')+'</div>':'')+feed+'</div><aside class="social-side-column community-side-column"><div id="community-crew-preview" class="community-side-crews"><p class="social-side-card" role="status">크루를 불러오는 중…</p></div><section class="social-side-card"><h2>음악으로 이어지는 관심사</h2><p class="field-help">좋아하는 장르로 더 찾아보세요.</p><nav class="community-tag-cloud" aria-label="커뮤니티 음악 탐색">'+[...tags,...genreTags].map(([label,href])=>'<a href="'+esc(href)+'">#'+esc(label)+'</a>').join('')+'</nav></section><section class="community-side-invitation"><span class="community-orbit" aria-hidden="true"></span><p>당신의 음악이<br><strong>누군가의 하루를 바꿀 수 있어요.</strong></p><a href="#upload">음원 올리기 '+icon('chevron')+'</a></section><section class="social-side-card community-cover-rank-links"><h2>커버 랭킹</h2><nav class="community-tag-cloud" aria-label="커버 랭킹 기간">'+[['today','오늘'],['week','이번 주'],['month','이달'],['all','명예의 전당']].map(([key,label])=>'<a href="#community/rankings?period='+key+'">'+label+'</a>').join('')+'</nav></section></aside></div>';
}

function communityCrewSidebarHTML(d){
 const crews=[...(d.crews||[])].sort((a,b)=>Number(b.xp||0)-Number(a.xp||0)).slice(0,5);
 return '<section class="social-side-card"><div class="section-heading"><h2>추천 크루</h2><a href="#community/crews?browse=1">더보기 '+icon('chevron')+'</a></div><div class="community-crew-circles">'+crews.map(c=>'<a href="#crew/'+esc(c.id)+'">'+crewPicture(c,'crew-circle')+'<strong>'+crewNameHTML(c)+'</strong><small>'+number(c.members)+'명</small></a>').join('')+(crews.length?'':'<p class="field-help">첫 크루를 만나보세요.</p>')+'</div><div class="community-crew-invite"><span>'+icon('mic')+'</span><h3>좋은 음악은,<br>좋은 사람들과 더 멀리.</h3><p>크루와 함께 더 특별한 음악을 만들어요.</p><a class="small-button" href="#community/crews?browse=1">크루 둘러보기 '+icon('arrow')+'</a></div></section>'+crewRankingSidebarHTML(d.rankings);
}
function crewRankingSidebarHTML(rankings){
 const items=[...(rankings||[])].sort((a,b)=>Number(b.level||1)-Number(a.level||1)||Number(b.xp||0)-Number(a.xp||0)).slice(0,5);
 return '<section class="social-side-card crew-ranking-card"><div class="section-heading"><h2>크루 랭킹</h2><span class="crew-ranking-label">TOP 5</span></div><p class="crew-ranking-rule">레벨순 · 같은 레벨은 누적 XP순</p>'+(items.length?'<ol class="community-crew-ranking">'+items.map((c,i)=>'<li><a href="#crew/'+esc(c.id)+'"><span class="crew-rank-position">'+(i+1)+'<span class="sr-only">위</span></span>'+crewPicture(c,'crew-rank-picture')+'<span class="crew-rank-copy"><strong>'+crewNameHTML(c)+'</strong><small>'+number(c.members)+'명</small></span><span class="crew-rank-stats"><b>LV '+number(c.level)+'</b><small>'+number(c.xp)+' XP</small></span></a></li>').join('')+'</ol>':'<p class="field-help">'+(rankings?'아직 등록된 크루가 없어요.':'크루 랭킹을 불러오는 중…')+'</p>')+'</section>';
}

function crewGameMenuHTML(catalog,now=Date.now()){
 if(!catalog?.banner_ends_at || now>=catalog.banner_ends_at*1000 ||
    now<Date.parse(catalog.week_start+'T00:00:00+09:00'))return '';
 const game=catalog.games.find(game=>game.id===catalog.active_game_id);
 if(!game)return '<span class="field-help">이번 주 크루 경쟁 게임을 준비 중이에요.</span>';
 return `<a class="crew-game-entry" href="${esc(game.href)}"><img src="${esc(game.banner_art)}" width="900" height="300" alt="이번 주 크루 경쟁 게임: ${esc(game.banner_title)}. 플레이"></a>${catalog.mode==='test'?'<small>테스트 중</small>':''}`;
}
function bindCrewGameMenu(){
 const root=document.querySelector('[data-crew-games]');
 if(!root||root.dataset.bound)return;
 root.dataset.bound='1';
 const account=me?.id;
 let alive=true,busy=false,boundary,lastMarkup;
 let close=Number(root.dataset.bannerEnds)*1000,weekEnd=Number(root.dataset.weekEnds)*1000;
 function expire(){
  if(close && Date.now()>=close && root.firstChild){root.replaceChildren();lastMarkup='';}
 }
 function schedule(){
  clearTimeout(boundary);
  const now=Date.now(),next=close>now?close:weekEnd;
  if(next>now)boundary=setTimeout(refresh,next-now);
 }
 async function refresh(){
  if(!alive)return;
  expire();
  if(busy||document.hidden)return;
  busy=true;
  try{
   const data=await api('/api/crews/'+encodeURIComponent(root.dataset.crewGames)+'/games','GET',undefined,{fresh:true});
   if(!alive||!root.isConnected||account!==me?.id)return;
   close=data.banner_ends_at*1000;weekEnd=data.ends_at*1000;
   const markup=crewGameMenuHTML(data);
   if(markup!==lastMarkup){root.innerHTML=markup;lastMarkup=markup;}
  }catch(e){
   if(alive&&[401,403].includes(e.status)){root.replaceChildren();lastMarkup='';}
  }finally{busy=false;if(alive)schedule();}
 }
 const timer=setInterval(refresh,30000);
 document.addEventListener('visibilitychange',refresh);
 registerRouteCleanup(()=>{alive=false;clearInterval(timer);clearTimeout(boundary);document.removeEventListener('visibilitychange',refresh);});
 schedule();void refresh();
}
