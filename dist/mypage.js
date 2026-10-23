// Desktop composition reuses existing routes, media, playback and social actions.
let myPageState=null;
const myDate=n=>n?new Date(n*1000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'';
const myEmpty=text=>`<p class="mp-empty">${esc(text)}</p>`;
const myLoading=()=>'<p class="mp-empty" role="status">불러오는 중…</p>';
function mySection(title,content,link='',count=null,cls=''){
 return `<section class="mp-card ${cls}"><div class="mp-section-head"><h2>${title}${count===null?'':` <span>${number(count)}</span>`}</h2>${link}</div>${content}</section>`;
}
const myAll=(href,label='전체보기')=>`<a class="mp-all" href="${esc(href)}">${label} ${icon('chevron')}</a>`;
function myKind(t){return t.kind==='dubbing'?'dubbing':t.cover_mode==='duet'?'duet':'cover';}
function myKindIcon(kind){
 const path=kind==='dubbing'?'<path d="M7 19l-4 3v-6A8 8 0 0 1 3 5a8 8 0 0 1 6-2h6a8 8 0 0 1 0 16H7Zm1-9v3m4-6v9m4-7v5"/>':kind==='duet'?'<path d="M7 2a2 2 0 0 0-2 2v7a2 2 0 0 0 4 0V4a2 2 0 0 0-2-2Zm-5 8v1a5 5 0 0 0 10 0v-1M7 16v5m-3 0h6M18 2a2 2 0 0 0-2 2v7a2 2 0 0 0 4 0V4a2 2 0 0 0-2-2Zm-5 8v1a5 5 0 0 0 10 0v-1M18 16v5m-3 0h6"/>':'<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm7 8v2a7 7 0 0 1-14 0v-2m7 9v3m-4 0h8"/>';
 return `<svg class="mp-kind mp-kind-${kind}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${{cover:'커버',duet:'듀엣',dubbing:'더빙'}[kind]}">${path}</svg>`;
}
function myProfileHeader(d){
 const p=d.profile,own=me?.id===p.user_id,c=d.crew,publicSongs=d.public_track_count??[...(d.tracks||[]),...(d.covers||[])].filter(t=>!t.status||t.status==='published').length;
 return `<header class="mp-profile"><div class="mp-avatar">${avatarImage(p)}</div><div class="mp-identity"><h2>${esc(p.name)}</h2><p class="mp-public-id">ID: ${Number.isSafeInteger(p.public_number)?p.public_number:'발급 확인 중'}</p><div class="mp-crew-line">${c?`<a href="#crew/${esc(c.id)}">${c.image_version?`<img src="/media/crew/${esc(c.id)}?v=${esc(c.image_version)}" alt="">`:icon('users')}${esc(c.name)}</a>`:'소속 크루 없음'}</div><div class="mp-stats"><${own?'a href="#library/followers"':'span'} data-followers="producer/${esc(p.id||'')}" data-count="${Number(d.followers||0)}"><b data-follow-count>${number(d.followers||0)}</b> 팔로워</${own?'a':'span'}><${own?'a href="#following"':'span'}><b>${number(d.following_count||0)}</b> 팔로잉</${own?'a':'span'}><span><b>${number(publicSongs)}</b> 공개곡</span></div></div><div class="mp-profile-actions">${own?'<a class="primary-button" href="#profile/edit">프로필 수정</a><a class="small-button" href="#studio">스튜디오</a>':`<button class="primary-button" data-follow="producer/${esc(p.id)}" aria-pressed="${followed('producer',p.id)}">${followed('producer',p.id)?'팔로잉':'팔로우'}</button><button class="mp-more" data-profile-preview="${esc(p.id)}" aria-label="프로필 더보기 · 선물·차단·신고">${icon('more')}</button>`}</div></header>`;
}
function myMoments(d){
 const photos=d.gallery||[],pid=d.profile.id,own=me?.id===d.profile.user_id;
 return mySection('갤러리',photos.length?`<div class="mp-moments">${photos.slice(0,10).map((p,i)=>`<button type="button" data-gallery-photo="${esc(p.url)}" data-photo-label="${esc(d.profile.name)} 사진 ${i+1}" aria-label="사진 ${i+1} 크게 보기"><img src="${esc(p.url)}" alt="${esc(d.profile.name)}의 순간 ${i+1}" loading="${i<5?'eager':'lazy'}"></button>`).join('')}</div>`:myEmpty(own?'아직 등록한 사진이 없어요. 전체보기에서 순간을 기록해보세요.':'공개된 사진이 없어요.'),pid?myAll('#profile-gallery/'+encodeURIComponent(pid)):myAll('#profile/edit'),photos.length,'mp-moments-card');
}
function myStudioBanner(){return `<section class="mp-card mp-studio"><h2>스튜디오</h2><p>나만의 음악과 더빙을<br>제작하고 관리해보세요.</p><a class="primary-button" href="#studio">스튜디오 바로가기 ${icon('arrow')}</a></section>`;}
function myArtists(d){return mySection('소속 아티스트',d.artists?.length?`<div class="mp-artists">${d.artists.slice(0,3).map(a=>`<a href="#artist/${esc(a.id)}">${portrait(a,'artist')}<strong>${esc(a.name)}</strong></a>`).join('')}</div>`:myEmpty('등록된 아티스트가 없어요.'),myAll('#profile-artists/'+encodeURIComponent(d.profile.id)),d.artists?.length||0);}
function myTrackCard(t,compact=false){
 if(t.kind!=='dubbing'&&(!t.status||t.status==='published'))return playMusicCard(t,null);
 if(t.kind==='dubbing')return playDubbingCard({...t,ownerName:t.owner_name||'',genres:t.genres||[]});
 const dub=t.kind==='dubbing',published=dub?t.visibility==='public':!t.status||t.status==='published',href=dub?'#dubbing/'+esc(t.id):published?'#song/'+esc(t.id):'#manage/'+esc(t.id),own=me?.id===(t.user_id||t.owner_id);
 const title=String(t.title||'').replace(/\s*\((?:Cover|Duet|더빙)\)\s*$/i,'');
 return `<article class="mp-work ${compact?'mp-work-compact':''}"><div class="mp-work-art"><a href="${href}" aria-label="${esc(title)} 상세">${dub?`<div class="mp-dubbing-art">${myKindIcon('dubbing')}<span>${esc((t.genres||[]).join(' · '))}</span></div>`:cover(t)}</a>${dub&&t.state==='complete'?`<button class="mp-play" data-mp-dubbing-play="${esc(t.id)}" aria-label="${esc(title)} 재생">${icon('play')}</button>`:!dub&&published?`<button class="mp-play" data-play="${esc(t.id)}" aria-label="${esc(title)} 재생">${icon('play')}</button>`:''}<span class="mp-duration">${time(t.duration||0)}</span></div><div class="mp-work-copy"><div class="mp-title"><a href="${href}">${compact?'':myKindIcon(myKind(t))}<span>${esc(title)}</span></a>${!dub&&published?`<button class="mp-more" data-track-menu="${esc(t.id)}" aria-label="${esc(title)} 더보기">${icon('more')}</button>`:''}</div><div class="mp-work-meta"><span>${dub?({complete:'완성',recording:'녹음 중',recruiting:'참여 모집'}[t.state]||'작성 중'):number(t.plays||0)+'회 감상'}</span><span class="${published?'mp-public':'mp-private'}">${published?'공개':'비공개'}</span></div>${own?`<a class="mp-manage" href="${dub?href:'#manage/'+esc(t.id)}">관리</a>`:''}</div></article>`;
}
function myWorksHTML(d){
 const all=[...(d.covers||[]),...(d.dubbings||[])],counts={all:all.length,cover:0,duet:0,dubbing:0};all.forEach(t=>counts[myKind(t)]++);
 return mySection('제작곡',d.tracks?.length?`<div class="mp-originals home-music-grid">${d.tracks.slice(0,3).map(t=>myTrackCard(t,true)).join('')}</div>`:myEmpty('등록된 제작곡이 없어요.'),myAll('#producer-songs/'+encodeURIComponent(d.profile.id)),d.tracks?.length||0)+
 mySection('커버 · 듀엣 · 더빙',`<div class="mp-work-controls"><div class="mp-filters" role="group" aria-label="작품 종류">${[['all','전체'],['cover','커버'],['duet','듀엣'],['dubbing','더빙']].map(([key,label])=>`<button data-mp-filter="${key}" aria-pressed="${key==='all'}">${key==='all'?'':myKindIcon(key)}${label} <span>${counts[key]}</span></button>`).join('')}</div><label class="sr-only" for="mp-sort">작품 정렬</label><select id="mp-sort"><option value="recent">최신순</option><option value="plays">재생순</option></select>${me?.id===d.profile.user_id?'<label class="sr-only" for="mp-visibility">작품 공개 범위</label><select id="mp-visibility"><option value="all">모든 공개 범위</option><option value="public">공개</option><option value="private">비공개</option></select>':''}</div><div class="inline-actions"><a class="text-link" href="${esc(opportunityHref(d.profile.id,'duet'))}">참여 가능 · 듀엣</a><a class="text-link" href="${esc(opportunityHref(d.profile.id,'dubbing'))}">참여 가능 · 더빙</a></div><div id="mp-recordings" class="mp-recordings home-music-grid">${all.length?all.sort((a,b)=>b.created-a.created).map(t=>myTrackCard(t)).join(''):myEmpty('아직 등록된 커버·듀엣·더빙이 없어요.')}</div>`, '',all.length);
}
function myWorksAside(d,own){return myArtists(d)+myStudioBanner()+mySection('참여 가능한 듀엣','<div id="mp-open-duets">'+myLoading()+'</div>',myAll(opportunityHref(d.profile.id,'duet')))+mySection('참여 가능한 더빙','<div id="mp-open-dubbing">'+myLoading()+'</div>',myAll(opportunityHref(d.profile.id,'dubbing')));}
function mySegment(active){return `<div class="mp-segment" role="tablist" aria-label="마이페이지" data-active="${active}"><span class="mp-segment-slide" aria-hidden="true"></span>${[['works','내 작품'],['activity','내 활동']].map(([key,label])=>`<button type="button" role="tab" id="mp-tab-${key}" aria-controls="mp-content" aria-selected="${active===key}" tabindex="${active===key?0:-1}" data-mp-tab="${key}">${label}</button>`).join('')}</div>`;}
async function myPageView(base,param,raw){
 if(base==='profile-gallery')return myGalleryView(param);
 if(base==='relations')return myRelationsView();
 if(base==='gift-inventory')return myGiftInventoryView();
 if(!((base==='profile'&&param!=='edit')||base==='producer'))return null;
 if(base==='profile'&&!me){returnRoute=location.hash;return {html:gate()};}
 let d;
 if(base==='profile'){
  const self=await api('/api/me/profile','GET',undefined,{fresh:true});
  d=self.profile.id?await api('/api/producers/'+encodeURIComponent(self.profile.id)+'?dashboard=1','GET',undefined,{fresh:true}):{profile:self.profile,followers:self.follower_count,following_count:self.following_count,tracks:[],covers:[],dubbings:[],artists:[],gallery:[]};
 }else d=await api('/api/producers/'+encodeURIComponent(param)+'?dashboard=1','GET',undefined,{fresh:true});
 const own=me?.id===d.profile.user_id,tab=own&&new URLSearchParams(raw.split('?')[1]||'').get('view')==='activity'?'activity':'works';
 const state={d,own,tab,account:me?.id||'',activity:null};
 return {mypage:state,tracks:[...(d.tracks||[]),...(d.covers||[])],html:`<div class="mypage-layout"><div class="mp-main"><div class="mp-heading">${heading('마이','나의 순간과 음악이 만나는 공간')}</div>${myProfileHeader(d)}${myMoments(d)}${own?mySegment(tab):''}<div id="mp-content" ${own?'role="tabpanel" aria-labelledby="mp-tab-'+tab+'"':''}>${tab==='works'?myWorksHTML(d):myLoading()}</div></div><aside class="mp-aside" id="mp-aside">${tab==='works'?myWorksAside(d,own):myLoading()}</aside></div>`};
}
async function myActivityData(){
 const paths={wallet:'/api/gold/balance',diamonds:'/api/diamonds',player:'/api/me/player',membership:'/api/membership',activity:'/api/me/profile?section=activity',notifications:'/api/notifications',relations:'/api/me/relations',inventory:'/api/me/gift-inventory'};
 return Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,path])=>{try{return [key,await api(path,'GET',undefined,{fresh:true})];}catch(e){return [key,{error:e.message}];}})));
}
function myError(d){return d?.error?`<p class="mp-empty" role="alert">${esc(d.error)} <button class="text-link" data-mp-retry>다시 시도</button></p>`:'';}
function myActivityHTML(a){
 const p=a.player?.player,m=a.membership?.membership,owned=a.player?.inventory||[],items=a.inventory?.items||[];
 const balance=(label,v,unit,href,iconHTML)=>`<a class="mp-asset" href="${href}">${iconHTML}<span><small>${label}</small><strong>${Number.isFinite(v)?number(v):'—'} ${unit}</strong></span>${icon('chevron')}</a>`;
 const inventoryGroups=new Map();for(const i of items){const prior=inventoryGroups.get(i.gift_type);if(prior)prior.quantity++;else inventoryGroups.set(i.gift_type,{...i,quantity:1});}
 return `<div class="mp-activity-grid">${mySection('보유 자산',`<div class="mp-assets">${balance('보유 골드',a.wallet?.balance,'G','#gold','<span class="gold-coin">G</span>')}${balance('보유 실버',a.wallet?.silver_balance,'S','#rewards','<img src="/assets/gifts/silver-coin-v1.webp" alt="">')}${balance('다이아 · 정산',a.diamonds?.available,'D','#payouts',icon('diamond'))}</div>${myError(a.wallet)}${myError(a.diamonds)}`,'',null,'mp-assets-card')}
 ${mySection('내 레벨',p?`<div class="mp-level"><strong>Lv.${p.level}</strong><span>${number(p.xp)} / ${p.next_xp===null?'MAX':number(p.next_xp)} XP</span></div><progress value="${p.progress}" max="1" aria-label="내 레벨 경험치"></progress>`:myError(a.player),myAll('#inventory','상세'),null,'mp-level-card')}
 ${mySection('보유 이용권',m?`<a class="mp-pass" href="#membership">${icon('ticket')}<span>${m.plan==='premium'?'Premium 이용권':'사용 중인 이용권 없음'}<strong>${m.plan==='premium'?'1개':'0개'}</strong>${m.premium_until?`<small>${myDate(m.premium_until)}까지</small>`:''}</span>${icon('chevron')}</a>`:myError(a.membership),myAll('#membership','관리'),null,'mp-pass-card')}
 ${mySection('인벤토리',myError(a.inventory)||(items.length?`<div class="mp-items">${[...inventoryGroups.values()].slice(0,4).map(i=>`<a href="#gift-inventory"><img src="${esc(i.image)}" alt="${esc(i.gift_name)}"><strong>× ${i.quantity}</strong></a>`).join('')}</div>`:myEmpty('보관 중인 선물이 없어요.')) ,myAll('#gift-inventory'),null,'mp-inventory-card')}
 ${mySection('내 도구함',myError(a.player)||(owned.length?`<div class="mp-items">${owned.slice(0,4).map(i=>`<a href="#inventory"><img src="${esc(i.artwork)}" alt="${esc(i.name)}"><small>${i.equipped?'사용 중':!i.available?'사용 대기':i.expires_at?Math.max(0,Math.ceil((i.expires_at-Date.now()/1000)/86400))+'일 남음':'사용 가능'}</small></a>`).join('')}</div>`:myEmpty('보유한 꾸미기 아이템이 없어요.')),myAll('#inventory'),null,'mp-toolbox-card')}
 ${mySection('나의 관계',myError(a.relations)||myRelationsRows((a.relations?.relations||[]).filter(r=>r.state==='accepted').slice(0,3)),myAll('#relations'),null,'mp-relations-card')}</div>`;
}
function myRelationsRows(items,publicView=false){return items.length?`<div class="mp-relations">${items.map(r=>`<a class="mp-relation" href="${publicView?'#producer/'+esc(r.profile_id):'#relations'}"><span class="mp-mini-avatar">${avatarImage({id:r.profile_id,name:r.name,image_version:r.image_version})}</span><span><strong>${esc(r.name)} ${icon('heart')}</strong><small>Lv.${r.level} · ${number(r.xp)} / ${r.next_xp===null?'MAX':number(r.next_xp)} XP</small><progress value="${r.progress}" max="1" aria-label="${esc(r.name)} 관계 경험치"></progress></span></a>`).join('')}</div>`:myEmpty('관계를 맺은 회원이 없어요. 프로필에서 관계를 신청해보세요.');}
function myActivityAside(d,a){
 const c=d.crew,received=a.activity?.received||[],recent=a.activity?.recent||[],notes=a.notifications?.items||[];
 const rows=items=>`<div class="mp-activity-rows">${items.join('')}</div>`;
 return mySection('내 크루',c?`<a class="mp-my-crew" href="#crew/${esc(c.id)}">${crewPicture(c,'crew-circle')}<span><strong>${esc(c.name)}</strong><small>크루 멤버 ${number(c.members)}명</small></span>${icon('chevron')}</a><p class="mp-muted">${esc(c.description||'음악을 함께 나누는 우리 크루')}</p>`:myEmpty('현재 소속된 크루가 없어요.'),myAll(c?'#crew/'+c.id:'#community/crews?browse=1'))+
 mySection('받은 선물',myError(a.activity)||(received.length?rows(received.slice(0,3).map(g=>`<a href="${g.sender_profile_id?'#producer/'+esc(g.sender_profile_id):'#notifications?filter=gifts'}"><span class="mp-mini-avatar">${avatarImage({id:g.sender_profile_id,name:g.sender_name,image_version:g.image_version})}</span><span><strong>${esc(g.sender_name)}</strong><small>${esc(g.gift_name||'선물')} × ${g.quantity}</small></span><time>${myDate(g.created)}</time></a>`)):myEmpty('아직 받은 선물이 없어요.')),myAll('#notifications?filter=gifts'))+
 mySection('최근 활동',myError(a.activity)||(recent.length?rows(recent.slice(0,3).map(r=>`<a href="#${esc(r.route)}/${esc(r.target)}">${icon(r.kind==='like'?'heart':r.kind==='comment'?'message':'gift')}<span><strong>${{like:'음악에 좋아요를 눌렀어요',comment:'댓글을 남겼어요',gift:'선물을 보냈어요'}[r.kind]}</strong><small>${esc(r.title||'')}</small></span><time>${myDate(r.created)}</time></a>`)):myEmpty('최근 활동이 없어요.')), '<button class="mp-all" data-mp-recent>전체보기 '+icon('chevron')+'</button>')+
 mySection('알림 기록',myError(a.notifications)||(notes.length?rows(notes.slice(0,3).map(n=>`<a href="#notifications">${icon(n.kind.includes('gift')?'gift':'bell')}<span><strong>${esc(n.actor_name)}</strong><small>${esc(n.gift_name||n.source_title||'새로운 활동 알림')}</small></span><time>${myDate(n.created)}</time></a>`)):myEmpty('새로운 알림이 없어요.')),myAll('#notifications'))+
 mySection('계정 관리',`<nav class="mp-account-links"><a href="#membership">${icon('ticket')} 구독 · 이용권 관리 ${icon('chevron')}</a><a href="#payouts">${icon('wallet')} 정산 내역 ${icon('chevron')}</a><a href="#account">${icon('settings')} 계정 설정 ${icon('chevron')}</a></nav>`);
}
async function mySelectTab(tab,updateURL=true){
 const s=myPageState;if(!s?.own||s.account!==me?.id)return;s.tab=tab;
 if(updateURL){const href='#profile'+(tab==='activity'?'?view=activity':'');history.replaceState(null,'',href);$('#main').dataset.route=href.slice(1);}
 const segment=$('.mp-segment');segment.dataset.active=tab;segment.querySelectorAll('[role="tab"]').forEach(b=>{const active=b.dataset.mpTab===tab;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;});
 const content=$('#mp-content'),aside=$('#mp-aside');content.setAttribute('aria-labelledby','mp-tab-'+tab);
 if(tab==='works'){content.innerHTML=myWorksHTML(s.d);aside.innerHTML=myWorksAside(s.d,true);void myLoadOpportunities(s);return;}
 content.innerHTML=myLoading();aside.innerHTML=myLoading();content.setAttribute('aria-busy','true');
 const a=await myActivityData();if(myPageState!==s||s.tab!==tab||me?.id!==s.account||!content.isConnected)return;
 s.activity=a;content.innerHTML=myActivityHTML(a);aside.innerHTML=myActivityAside(s.d,a);content.removeAttribute('aria-busy');icons();
}
async function myLoadOpportunities(s){await Promise.all(['duet','dubbing'].map(async type=>{const root=$(type==='duet'?'#mp-open-duets':'#mp-open-dubbing');if(!root)return;try{const d=await api('/api/producers/'+encodeURIComponent(s.d.profile.id)+'/opportunities?type='+type);if(myPageState!==s||!root.isConnected)return;root.innerHTML=opportunityCards(d.items.slice(0,3),type);}catch(e){if(root.isConnected)root.innerHTML=myEmpty(e.message);}}));}
function bindMyPage(view){if(!view?.mypage)return;const s=view.mypage;myPageState=s;if(s.tab==='activity')void mySelectTab('activity',false);else void myLoadOpportunities(s);}
function myFilterWorks(){
 const root=$('#mp-recordings');if(!root||!myPageState)return;const key=$('[data-mp-filter][aria-pressed="true"]')?.dataset.mpFilter||'all',visibility=$('#mp-visibility')?.value||'all',sort=$('#mp-sort')?.value;
 const items=[...(myPageState.d.covers||[]),...(myPageState.d.dubbings||[])].filter(t=>(key==='all'||myKind(t)===key)&&(visibility==='all'||(t.kind==='dubbing'?t.visibility==='public':t.status==='published')===(visibility==='public'))).sort((a,b)=>(sort==='plays'?(b.plays||0)-(a.plays||0):0)||b.created-a.created);
 root.innerHTML=items.length?items.map(t=>myTrackCard(t)).join(''):myEmpty('선택한 조건에 맞는 작품이 없어요.');
}
document.addEventListener('change',e=>{if(e.target.matches('#mp-sort,#mp-visibility'))myFilterWorks();});
document.addEventListener('keydown',e=>{
 const b=e.target.closest('[data-mp-tab]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const key=e.key==='Home'?'works':e.key==='End'?'activity':b.dataset.mpTab==='works'?'activity':'works';$('[data-mp-tab="'+key+'"]').focus();void mySelectTab(key);
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-mp-tab],[data-mp-filter],[data-mp-retry],[data-mp-opportunity-retry],[data-mp-originals],[data-mp-artists],[data-mp-recent],[data-mp-dubbing-play]');if(!b)return;e.preventDefault();
 if(b.dataset.mpTab){void mySelectTab(b.dataset.mpTab);return;}
 if(b.dataset.mpFilter){b.parentElement.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));myFilterWorks();return;}
 if(b.hasAttribute('data-mp-retry')){void mySelectTab('activity',false);return;}
 if(b.hasAttribute('data-mp-opportunity-retry')){void myLoadOpportunities(myPageState);return;}
 if(b.hasAttribute('data-mp-originals')){dialog('<div class="mypage-dialog"><h2>내 제작곡</h2>'+((myPageState.d.tracks||[]).map(t=>myTrackCard(t,true)).join('')||myEmpty('등록된 제작곡이 없어요.'))+'</div>');return;}
 if(b.hasAttribute('data-mp-artists')){dialog('<div class="mypage-dialog"><h2>소속 아티스트</h2>'+identityCards(myPageState.d.artists||[],'artist')+'</div>');return;}
 if(b.hasAttribute('data-mp-recent')){dialog('<div class="mypage-dialog"><h2>최근 활동</h2>'+((myPageState.activity?.activity?.recent||[]).map(r=>`<p><a href="#${esc(r.route)}/${esc(r.target)}">${esc(r.title||'선물')} · ${myDate(r.created)}</a></p>`).join('')||myEmpty('최근 활동이 없어요.'))+'</div>');return;}
 if(b.dataset.mpDubbingPlay){b.disabled=true;try{const d=await api('/api/dubbing/projects/'+encodeURIComponent(b.dataset.mpDubbingPlay)),p=d.project||d,url=p.recording?.final?.audioUrl;if(!b.isConnected)return;if(url)myDubbingDialog(p,url);else location.hash='dubbing/'+b.dataset.mpDubbingPlay;}catch(err){toast(err.message);}finally{b.disabled=false;}}
});

function myDubbingDialog(p,url){
 audio.pause();
 dialog('<div class="mp-dub-dialog"><h2>'+esc(p.title)+'</h2><audio controls autoplay src="'+esc(url)+'" aria-label="완성된 더빙 듣기"></audio><a class="text-link" href="#dubbing/'+esc(p.id)+'">작품 상세</a></div>');
 const player=$('#dialog audio');$('#dialog').addEventListener('close',()=>{player.pause();player.removeAttribute('src');player.load();},{once:true});
}
document.addEventListener('click',e=>{if(e.target.closest('#dialog .mypage-dialog a[href^="#"],#dialog .mp-dub-dialog a[href^="#"]'))$('#dialog').close();});
window.addEventListener('hashchange',()=>{if($('#dialog .mp-dub-dialog')&&$('#dialog').open)$('#dialog').close();});
