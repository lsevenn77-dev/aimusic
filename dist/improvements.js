// Shared app/web flows: chosen profiles, crew activity and private conversations.
let socialTimer=null;
// Public crew chrome and a navigation hint only. Membership and roles stay live.
const crewNavigation=new Map();
function clearCrewNavigation(){crewNavigation.clear();}
function crewNavigationScope(){return (me?.id||'guest')+':'+(typeof apiRevision==='number'?apiRevision:0)+':';}
function rememberCrewNavigation(key,value){crewNavigation.delete(crewNavigationScope()+key);crewNavigation.set(crewNavigationScope()+key,{value:structuredClone(value),until:Date.now()+60000});while(crewNavigation.size>64)crewNavigation.delete(crewNavigation.keys().next().value);}
function peekCrewNavigation(key){const entry=crewNavigation.get(crewNavigationScope()+key);return entry?.until>Date.now()?structuredClone(entry.value):null;}
function crewNavigationCurrent(account,revision){return account===(me?.id||'guest')&&revision===(typeof apiRevision==='number'?apiRevision:0);}
function rememberCrewDiscovery(d,q,account,revision){if(q||!crewNavigationCurrent(account,revision))return;rememberCrewNavigation('discovery',{mine:d.mine||null,crews:d.crews||[]});for(const c of d.crews||[])rememberCrewNavigation(c.id,c);}
async function liveCrewDetail(id,tab='chat'){
 const account=me?.id||'guest',revision=typeof apiRevision==='number'?apiRevision:0,d=await api('/api/crews/'+encodeURIComponent(id));
 if(crewNavigationCurrent(account,revision)){rememberCrewNavigation(id,d.crew);const prior=peekCrewNavigation('discovery');if(d.membership)rememberCrewNavigation('discovery',{mine:id,crews:prior?.crews||[d.crew]});else if(prior?.mine===id)rememberCrewNavigation('discovery',{...prior,mine:null});}
 return crewDetailView(d,id,tab);
}
function crewPendingView(base,param,raw=''){
 if(base!=='crew'&&!(base==='community'&&param==='crews'))return null;
 const hint=peekCrewNavigation('discovery'),q=new URLSearchParams(raw.split('?')[1]||''),id=base==='crew'?param:!q.has('q')&&q.get('browse')!=='1'?hint?.mine:null,c=id?peekCrewNavigation(id):null;
 let html=heading(c?esc(c.name):'크루','함께 듣고, 부르고, 이야기하는 음악 모임')+communityNavigation('crews');
 if(c)html+='<p class="crew-meta">LV '+number(c.level)+' · '+number(c.members)+'명이 함께해요</p>';
 html+='<div class="route-loading" role="status"><span>크루를 불러오는 중…</span><div></div><div></div></div>';
 return {html,tracks:[],cached:false};
}
function listenNav(active){return `<nav class="tabs listen-tabs" aria-label="듣기 메뉴">${[['home','추천'],['charts','차트'],['charts/releases','최신곡'],['search','발견'],['library/playlists','내 플레이리스트']].map(([href,label])=>`<a class="tab ${active===href?'active':''}" href="#${href}">${label}</a>`).join('')}</nav>`;}
function crewCard(c,mine){return `<a href="#crew/${esc(c.id)}" class="surface crew-card"><h2>${esc(c.name)}${mine===c.id?' · 내 크루':''}</h2><p class="crew-meta">LV${c.level} · ${c.members}/${c.capacity}명 · ${c.recruiting?'모집 중':'모집 마감'}</p><p>${esc(c.description)}</p><small>${esc(c.interests)}</small>${c.match?'<span>내가 좋아하는 장르와 맞아요</span>':''}</a>`;}
function chatComposer(){return `<form id="chat-compose"><label class="form-field">메시지<textarea name="body" maxlength="2000" required rows="1" placeholder="메시지 입력" aria-description="Enter로 보내기, Shift+Enter로 줄바꿈"></textarea></label><button class="primary-button">보내기</button><p class="form-error" role="alert"></p></form>`;}
function crewEditor(c=null){return `<h2>${c?'크루 소개 · 모집 수정':'새 크루 만들기'}</h2><form id="crew-form" data-crew="${esc(c?.id||'')}">${formField('크루 이름','name','text',c?.name||'','required maxlength="40" '+(c?'readonly':''))}<label class="form-field">소개<textarea name="description" maxlength="1000">${esc(c?.description||'')}</textarea></label>${formField('관심사 · 예: Ballad, K-POP','interests','text',c?.interests||'','maxlength="160"')}<label class="checkbox-line"><input name="recruiting" type="checkbox" ${c?.recruiting===0?'':'checked'}>새 멤버 모집</label><p class="field-help">처음에는 10명까지 함께해요. 공개곡 +1 XP, 받은 선물 1골드당 +1 XP, 하루 첫 채팅 +10 XP를 모아 최대 150명까지 성장해요.</p><button class="primary-button">저장</button><p class="form-error" role="alert"></p></form>`;}
function crewDetailView(d,param,tab='chat'){
 const c=d.crew,m=d.membership,allowed=['chat','members','music','about'];if(!allowed.includes(tab))tab='chat';
 const intro='<section class="surface crew-intro"><p>'+esc(c.description)+'</p><p>'+esc(c.interests)+'</p><strong class="crew-meta">LV'+c.level+' · '+c.members+'/'+c.capacity+'명 · '+c.xp+' XP</strong><p>'+(c.next_xp?'다음 레벨까지 '+(c.next_xp-c.xp)+' XP':'최고 레벨이에요.')+'</p><p class="field-help">공개곡당 1 XP · 받은 선물 1골드당 1 XP · 하루 첫 크루 채팅 10 XP</p><div class="inline-actions">'+(m?'<button class="small-button" data-leave-crew="'+esc(c.id)+'">크루 탈퇴</button>'+(m.role==='owner'?'<button class="small-button" data-edit-crew="'+esc(c.id)+'">소개 · 모집 수정</button>':''):'<button class="primary-button" data-join-crew="'+esc(c.id)+'" '+(d.banned||!c.recruiting||c.members>=c.capacity?'disabled':'')+'>'+(d.banned?'가입할 수 없는 크루':c.recruiting?'크루 가입하기':'모집 마감')+'</button>')+'</div></section>';
 let html='<div class="crew-room-heading"><div><span class="eyebrow">'+(m?'MY CREW':'MUSIC CREW')+'</span><h1>'+esc(c.name)+'</h1><p>LV '+c.level+' · '+c.members+'명이 함께해요</p></div><a href="#community/crews?browse=1" class="text-link">'+icon('search')+' 크루 둘러보기</a></div>'+communityNavigation('crews');
 if(m){html+='<nav class="tabs crew-room-tabs" aria-label="내 크루 활동">'+[['chat','대화'],['members','크루원'],['music','음악'],['about','소개']].map(([key,label])=>'<a class="tab '+(tab===key?'active':'')+'" href="#crew/'+esc(c.id)+'?tab='+key+'" '+(tab===key?'aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>';
  if(tab==='chat')html+='<p class="crew-chat-intro">크루원들과 지금 듣는 음악과 이야기를 나눠보세요.</p>'+chatPanelHTML('크루 채팅');
  if(tab==='members')html+=section('함께하는 크루원')+'<div class="crew-people">'+crewPeopleHTML(d)+'</div>';
  if(tab==='music')html+=section('크루의 최신 음악')+(d.tracks.length?communityFeed(d.tracks):'<p class="surface crew-intro">아직 공개한 크루 음악이 없어요.</p>');
  if(tab==='about')html+=intro;
 }else html+=intro+section('크루 멤버')+'<div class="crew-people">'+crewPeopleHTML(d)+'</div>'+section('크루의 최신 음악')+communityFeed(d.tracks);
 return {html,tracks:d.tracks,crew:c,chat:m&&tab==='chat'?{path:'/api/crews/'+param+'/messages',crew:{id:c.id,owner:m.role==='owner'}}:null};
}
async function improvementsView(base,param,raw){
 if(base==='follower'&&param){
  if(!me){returnRoute=location.hash;return {html:gate()};}
  const d=await api('/api/followers/'+encodeURIComponent(param));
  if(d.profile.id){const social=await api('/api/producers/'+encodeURIComponent(d.profile.id));return {html:heading('음악가의 페이지')+personProfileHTML(social,d.profile.id),tracks:musicProfileItems(social)};}
  return {html:heading('음악 친구')+'<a class="small-button" href="#library/followers">'+icon('back')+' 팔로워 목록</a>'+listenerProfileHTML(d.profile)};
 }
 if(base==='following'){
  if(!me){returnRoute=location.hash;return {html:gate()};}
  const uid=me.id,revision=followRevision,d=await api('/api/follows');if(me?.id!==uid)return {html:gate()};
  if(revision===followRevision&&!pendingFollows.size)library.follows=d.follows;
  const people=library.follows.filter(p=>p.kind==='producer').map(p=>({...p,id:p.target_id})),artists=library.follows.filter(p=>p.kind==='artist').map(p=>({...p,id:p.target_id}));
  return {html:heading('팔로우','내가 팔로우한 사람들의 음악을 만나보세요.')+(people.length?peopleListHTML(people,'producer'):empty('아직 팔로우한 사람이 없어요','마음에 드는 프로필에서 팔로우를 눌러보세요.','#community','커뮤니티 둘러보기'))+(artists.length?section('팔로우한 AI 아티스트')+peopleListHTML(artists,'artist'):'')};
 }
 if(base==='discover'&&!param)return {html:browseSearchHTML()};
 if(base==='community'&&param==='crews'){
  const params=new URLSearchParams(raw.split('?')[1]||''),q=params.get('q')||'',hint=peekCrewNavigation('discovery');
  if(hint?.mine&&!params.has('q')&&params.get('browse')!=='1'){try{return await liveCrewDetail(hint.mine);}catch(e){if(e.status!==404)throw e;clearCrewNavigation();}}
  const account=me?.id||'guest',revision=typeof apiRevision==='number'?apiRevision:0,d=await api('/api/crews?q='+encodeURIComponent(q));rememberCrewDiscovery(d,q,account,revision);
  if(d.mine&&!params.has('q')&&params.get('browse')!=='1')return liveCrewDetail(d.mine);
  let html=heading('크루','함께 듣고, 부르고, 이야기하는 음악 모임')+communityNavigation('crews')+`<div class="inline-actions">${d.mine?`<a href="#crew/${esc(d.mine)}" class="primary-button">${icon('users')} 내 크루 들어가기</a>`:`<button class="small-button" data-browse-crews>${icon('search')} 크루 둘러보기</button><button class="primary-button" data-create-crew>크루 만들기</button>`}<a href="#community/covers" class="small-button">모든 커버곡</a></div><p>${d.mine?'우리 크루의 새로운 음악과 이야기를 만나보세요.':'취향이 맞는 크루에 가입해 함께 듣고 불러보세요.'}</p><form id="crew-search" class="aifect-search"><input name="q" value="${esc(q)}" maxlength="80" placeholder="크루 · 관심사 찾기" aria-label="크루 · 관심사"><button class="small-button">찾기</button></form>`;
  const tracks=d.tracks||[];if(tracks.length)html+=section(d.mine?'우리 크루의 최신 음악':'크루에서 나온 새 음악',d.mine?'#crew/'+d.mine:'#community/covers')+communityFeed(tracks.slice(0,6));
  html+=section('함께할 크루')+(d.crews.length?`<div class="crew-grid">${d.crews.map(c=>crewCard(c,d.mine)).join('')}</div>`:'<p class="surface">아직 크루가 없어요. 좋아하는 음악으로 첫 모임을 만들어보세요.</p>');return {html,tracks};
 }
 if(base==='crew'&&param){return liveCrewDetail(param,new URLSearchParams(raw.split('?')[1]||'').get('tab')||'chat');}
 if(['profile','dm','rewards','payouts'].includes(base)||base==='library'&&param==='followers'){
  if(!me){returnRoute=location.hash;return {html:gate()};}
  if(base==='profile'){
   const d=await api('/api/me/profile'),p=d.profile;
   if(param!=='edit'){
    if(p.id){const social=await api('/api/producers/'+encodeURIComponent(p.id));social.following_count=d.following_count;return {html:heading('마이','내 플레이리스트와 공개한 음악을 한곳에')+personProfileHTML(social,p.id,new URLSearchParams(raw.split('?')[1]||'').get('tab')||'all'),tracks:musicProfileItems(social,new URLSearchParams(raw.split('?')[1]||'').get('tab')||'all')};}
    return {html:heading('마이','음악을 듣기만 해도 좋아요.')+'<section class="music-self-head"><div><h2>'+esc(p.name||me.name||'내 음악')+'</h2><p>아직 공개한 프로필이나 음악이 없어요.</p></div><a class="small-button" href="#profile/edit">프로필 만들기</a></section>'+musicMyShortcuts()};
   }
   return {html:heading('프로필 수정')+`<div class="inline-actions account-menu" style="margin-bottom:24px"><a class="small-button" href="#profile">내 페이지</a><a class="small-button" href="#account">계정·이용권</a><button type="button" class="small-button" id="logout">로그아웃</button></div><form id="public-profile-form" class="surface upload-form profile-form">${p.id?portrait(p,'producer'):''}<label class="form-field">프로필 사진<input name="image" type="file" accept="image/png,image/jpeg,image/webp"><small>JPG·PNG·WebP · 5MB 이하</small></label>${formField('공개 닉네임','name','text',p.name,'required maxlength="60"')}<p class="field-help">댓글·선물·크루·DM에는 이 이름이 표시돼요.</p><label class="form-field">소개<textarea name="bio" maxlength="1000">${esc(p.bio)}</textarea></label><button class="primary-button">프로필 저장</button><p class="form-error" role="alert"></p></form>`};
  }
  if(base==='library'){const d=await api('/api/me/profile');return {html:heading('팔로워')+libraryTabs('followers')+(d.followers.length?peopleListHTML(d.followers,'producer'):'<p class="surface">아직 팔로워가 없어요.</p>')};}
  if(base==='payouts')return {html:heading('정산')+earningsHTML(await api('/api/studio/earnings'))};
  if(base==='rewards'){const d=await api('/api/gold');return {html:`<div class="rewards-page">${heading('오늘의 응원별','작은 활동을 모아 좋아하는 음악에 응원해보세요.')}<div id="gift-shop-rewards">${freeRewardsHTML(d.free)}</div></div>`};}
  if(!param){const d=await api('/api/dm');return {html:heading('메시지','노래로 만난 사람들과 바로 대화하세요.')+`<div class="dm-home-actions"><a href="#following">${icon('users')}<strong>팔로잉</strong><small>내가 팔로우한 사람</small></a><a href="#community">${icon('compass')}<strong>사람 찾기</strong><small>새로운 목소리 만나기</small></a><a href="#profile">${icon('user')}<strong>내 페이지</strong><small>프로필과 내 음악</small></a></div><div class="dm-section-heading"><h2>대화</h2><span>${number(d.conversations.length)}명과 대화 중</span></div><div id="dm-conversations">`+conversationListHTML(d.conversations)+'</div><p id="dm-list-error" role="status"></p>',inbox:true};}
  const d=await api('/api/dm/'+encodeURIComponent(param));return {html:'<header class="dm-thread-header"><a href="#dm" class="small-button dm-back" aria-label="대화 목록으로 돌아가기">'+icon('back')+' 뒤로</a>'+dmProfileLink(d.peer,portrait(d.peer,'producer')+'<div><h1>'+esc(d.peer.name)+'</h1><small>프로필 보기</small></div>','dm-thread-person')+'</header>'+chatPanelHTML('개인 메시지',d,d.peer),chat:{path:'/api/dm/'+param,peer:d.peer,initial:d}};
 }
 return null;
}
async function libraryProfileHTML(){
 if(!me)return '';const d=await api('/api/me/profile'),p=d.profile;
 return `<section class="surface library-profile"><a href="#profile" aria-label="내 프로필 수정">${p.id?portrait(p,'producer'):`<span class="avatar">${esc(p.name[0])}</span>`}</a><div><h2>${esc(p.name)}</h2><div class="inline-actions"><a href="#profile">프로필 수정</a><a href="#library/followers">팔로워 ${d.follower_count}</a><a href="#library/following">팔로잉 ${d.following_count}</a></div></div><div class="inline-actions"><a href="#rewards" class="small-button">오늘의 응원별</a><a href="#dm" class="small-button">DM</a><a href="#payouts" class="small-button">정산</a></div></section>`;
}
function bindCrewForm(){const form=$('#crew-form');form.onsubmit=busyForm(form,async fd=>{const cid=form.dataset.crew;const d=await api('/api/crews'+(cid?'/'+cid:''),cid?'PATCH':'POST',{name:fd.get('name'),description:fd.get('description'),interests:fd.get('interests'),recruiting:fd.has('recruiting')});$('#dialog').close();location.hash='crew/'+d.crew.id;if(cid)await render();});}
function bindImprovements(view){
 const profile=$('#public-profile-form');if(profile)profile.onsubmit=busyForm(profile,async fd=>{
  await api('/api/me/profile','PUT',{name:fd.get('name'),bio:fd.get('bio')});const image=fd.get('image');
  if(image?.size){if(image.size>5*1024*1024)throw new Error('사진은 5MB 이하로 선택해주세요.');const r=await fetch('/api/me/profile/image',{method:'PUT',headers:{'content-type':image.type},body:image});if(!r.ok)throw new Error((await r.json()).error);}
  me=(await api('/api/me')).user;updateAccount();toast('프로필을 저장했어요.');location.hash='library';
 });
 const browse=$('[data-browse-crews]');if(browse)browse.onclick=()=>{const input=$('#crew-search input');input.scrollIntoView({behavior:'smooth',block:'center'});input.focus({preventScroll:true});};
 const search=$('#crew-search');if(search)search.onsubmit=e=>{e.preventDefault();location.hash='community/crews?browse=1&q='+encodeURIComponent(new FormData(search).get('q'));};
 document.querySelectorAll('[data-create-crew],[data-edit-crew]').forEach(b=>b.onclick=async()=>{if(!me)return askLogin();dialog(crewEditor(b.dataset.editCrew?view.crew:null));bindCrewForm();});
 for(const action of ['join','leave'])document.querySelectorAll(`[data-${action}-crew]`).forEach(b=>b.onclick=async()=>{
  if(!me)return askLogin();if(action==='leave'&&!confirm('크루에서 탈퇴할까요? 크루장은 먼저 가입한 멤버에게 위임되고, 마지막 멤버가 나가면 크루와 채팅이 삭제돼요.'))return;
  b.disabled=true;try{await api('/api/crews/'+b.dataset[action+'Crew']+'/'+action,'POST');if(action==='leave')location.hash='community/crews';else await render();}catch(e){toast(e.message);b.disabled=false;}
 });
 bindSocialChat(view);
}
document.addEventListener('click',async e=>{
 const singButton=e.target.closest('[data-sing-track]');if(singButton){e.preventDefault();try{const t=(await api('/api/tracks/'+singButton.dataset.singTrack)).track;const o=t.kind==='cover'?(await api('/api/tracks/'+t.original_id)).track:t;if(!o.karaoke_ready)return toast('아직 이 곡의 부르기를 준비하고 있어요.');location.hash='sing/'+o.id;}catch(err){toast(err.message);}}
 const report=e.target.closest('[data-report-comment]');if(report){e.preventDefault();if(!me)return askLogin();dialog(`<h2>댓글 신고</h2><form id="report-comment-form"><label class="form-field">사유<select name="reason"><option value="abuse">욕설·괴롭힘</option><option value="spam">스팸</option><option value="privacy">개인정보</option><option value="sexual">성적 콘텐츠</option><option value="other">기타</option></select></label><label class="form-field">설명<textarea name="details" maxlength="500"></textarea></label><button class="primary-button">신고 접수</button><p class="form-error" role="alert"></p></form>`);const form=$('#report-comment-form');form.onsubmit=busyForm(form,async fd=>{await api('/api/comments/'+report.dataset.reportComment+'/report','POST',{reason:fd.get('reason'),details:fd.get('details')});$('#dialog').close();toast('신고를 접수했어요.');await reloadComments(location.hash.split('/')[1].split('?')[0]);});}
});
