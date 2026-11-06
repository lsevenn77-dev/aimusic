// Shared app/web flows: chosen profiles, crew activity and private conversations.
// Private gold and silver are fetched afresh on My; diamonds belong only on the settlement page.
function myBalanceSummaryHTML(wallet){
 const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 const gold=wallet?.balance,silver=wallet?.silver_balance,ready=valid(gold)&&valid(silver);
 return '<section class="my-balance-summary" aria-label="내 골드·실버와 도구함"><div class="my-balance-grid">'+
  '<a class="my-balance-card my-balance-gold" href="#gold"><span class="my-balance-label"><span class="gold-coin" aria-hidden="true">G</span>보유 골드</span><strong>'+ (valid(gold)?number(gold):'—')+' <small>G</small></strong><span class="my-balance-link">충전 · 내역 보기 '+icon('chevron')+'</span></a>'+
  '<a class="my-balance-card my-balance-silver" href="#rewards"><span class="my-balance-label"><img src="/assets/gifts/silver-coin-v1.webp" width="20" height="20" alt="">보유 실버</span><strong>'+ (valid(silver)?number(silver):'—')+' <small>S</small></strong><span class="my-balance-link">오늘의 실버 받기 '+icon('chevron')+'</span></a>'+
  '<a class="my-balance-card my-toolbox-card" href="#inventory"><span class="my-balance-label">'+icon('gift')+'인벤토리</span><strong>액자 · 아이템</strong><span class="my-balance-link">보관함 열기 '+icon('chevron')+'</span></a></div>'+
  (ready?'':'<p class="my-balance-error" role="status">잔액을 모두 불러오지 못했어요. <button type="button" class="text-link" data-my-wallet-retry>다시 불러오기</button></p>')+'</section>';
}
async function loadMyBalanceSummary(readApi=api){
 try{return myBalanceSummaryHTML(await readApi('/api/gold/balance','GET',undefined,{fresh:true}));}
 catch(e){if(e.status===401||e.status===403)throw e;return myBalanceSummaryHTML(null);}
}
let socialTimer=null;
async function loadMyCrewSummary(readApi=api){
 try{
  const d=await readApi('/api/crews?summary=1&home=1','GET',undefined,{fresh:true}),c=d.detail?.membership?d.detail.crew:null;
  return '<section class="surface my-current-crew"><h3>가입한 크루</h3>'+(c?'<a class="my-current-crew-link" href="#crew/'+esc(c.id)+'">'+crewPicture(c,'crew-circle')+'<span><strong>'+crewNameHTML(c)+'</strong><small>LV.'+number(c.level)+' · '+number(c.members)+'명</small></span>'+icon('chevron')+'</a>':'<p>현재 가입한 크루가 없어요.</p><a class="small-button" href="#community/crews?browse=1">크루 둘러보기</a>')+'</section>';
 }catch{return '<section class="surface my-current-crew"><h3>가입한 크루</h3><p>가입 정보를 불러오지 못했어요.</p><a href="#community/crews">다시 확인하기</a></section>';}
}
function crewImageEditorHTML(c){
 const src=c?.image_version?'/media/crew/'+esc(c.id)+'?v='+esc(c.image_version):'';
 return '<section class="crew-image-editor"><label class="form-field">크루 대표 사진<input name="crew_image" type="file" accept="'+crewPhotoAccept+'"></label><div class="crew-image-saved">'+(src?'<img src="'+src+'" alt="현재 크루 사진">':'<span>'+icon('users')+'</span>')+'</div><p class="field-help" data-crop-status role="status">'+crewPhotoHelp+'</p><button type="button" class="small-button" hidden data-photo-discard>사진 선택 취소</button></section>';
}
// Public crew chrome and a navigation hint only. Membership and roles stay live.
const crewNavigation=new Map();
function clearCrewNavigation(){crewNavigation.clear();}
function crewNavigationScope(){return (me?.id||'guest')+':'+(typeof apiRevision==='number'?apiRevision:0)+':';}
function rememberCrewNavigation(key,value){crewNavigation.delete(crewNavigationScope()+key);crewNavigation.set(crewNavigationScope()+key,{value:structuredClone(value),until:Date.now()+60000});while(crewNavigation.size>64)crewNavigation.delete(crewNavigation.keys().next().value);}
function peekCrewNavigation(key){const entry=crewNavigation.get(crewNavigationScope()+key);return entry?.until>Date.now()?structuredClone(entry.value):null;}
function crewNavigationCurrent(account,revision){return account===(me?.id||'guest')&&revision===(typeof apiRevision==='number'?apiRevision:0);}
function rememberCrewDiscovery(d,q,account,revision){if(q||!crewNavigationCurrent(account,revision))return;rememberCrewNavigation('discovery',{mine:d.mine||null,crews:d.crews||[]});for(const c of d.crews||[])rememberCrewNavigation(c.id,c);}
async function liveCrewDetail(id,tab='music',readApi=api,community=false){
 const account=me?.id||'guest',revision=typeof apiRevision==='number'?apiRevision:0,d=await readApi('/api/crews/'+encodeURIComponent(id));
 if(crewNavigationCurrent(account,revision)){rememberCrewNavigation(id,d.crew);const prior=peekCrewNavigation('discovery');if(d.membership)rememberCrewNavigation('discovery',{mine:id,crews:prior?.crews||[d.crew]});else if(prior?.mine===id)rememberCrewNavigation('discovery',{...prior,mine:null});}
 return crewDetailView(d,id,tab,community);
}
function crewPendingView(base,param,raw=''){
 if(base!=='crew'&&!(base==='community'&&param==='crews'))return null;
 const detail=base==='crew'&&param;
 const q=new URLSearchParams(raw.split('?')[1]||'');
 const id=detail||(!q.has('q')&&q.get('browse')!=='1'?peekCrewNavigation('discovery')?.mine:null);
 const c=id?peekCrewNavigation(id):null;
 let html=(detail?heading(c?esc(c.name):'크루','함께 듣고, 부르고, 이야기하는 음악 모임'):'')+communityNavigation('crews');
 if(c)html+='<p class="crew-meta">LV '+number(c.level)+' · '+number(c.members)+'명이 함께해요</p>';
 html+='<div class="route-loading" role="status"><span>크루를 불러오는 중…</span><div></div><div></div></div>';
 return {html,tracks:[],cached:false};
}
function listenNav(active){return `<nav class="tabs listen-tabs" aria-label="홈 메뉴">${[['home','추천'],['charts','차트'],['charts/releases','최신곡'],['search','발견'],['library/playlists','내 플레이리스트']].map(([href,label])=>`<a class="tab ${active===href?'active':''}" href="#${href}">${label}</a>`).join('')}</nav>`;}
function crewCard(c,mine){return `<a href="#crew/${esc(c.id)}" class="surface crew-card"><h2>${esc(c.name)}${mine===c.id?' · 내 크루':''}</h2><p class="crew-meta">LV${c.level} · ${c.members}/${c.capacity}명 · ${c.recruiting?'모집 중':'모집 마감'}</p><p>${esc(c.description)}</p><small>${esc(c.interests)}</small>${c.match?'<span>내가 좋아하는 장르와 맞아요</span>':''}</a>`;}
function chatComposer(dm=false,direct=false){
 return chatComposerHTML({id:'chat-compose',rich:dm,limit:2000,emojiAttributes:dm?'data-dm-emoji aria-controls="dm-emoji-picker"':'',sendAttributes:'data-chat-send'});
}
function crewEditor(c=null){
 const available=Number(c?.name_change_available_at||0)*1000,locked=available>Date.now(),days=Math.max(1,Math.ceil((available-Date.now())/86400000));
 const help=locked?`${days}일 뒤에 수정 가능합니다. (${new Date(available).toLocaleString('ko-KR')}부터)`:'크루 이름은 변경 후 30일에 한 번 수정할 수 있어요.';
 return `${c?'':'<h2>새 크루 만들기</h2>'}<form id="crew-form" data-crew="${esc(c?.id||'')}" data-version="${c?.version||1}">${formField('크루 이름','name','text',c?.name||'','required maxlength="40" aria-describedby="crew-name-help" '+(locked?'readonly aria-readonly="true"':''))}<p id="crew-name-help" class="field-help" role="status">${esc(help)}</p><label class="form-field">소개<textarea name="description" maxlength="1000">${esc(c?.description||'')}</textarea></label>${formField('관심사 · 예: Ballad, K-POP','interests','text',c?.interests||'','maxlength="160"')}<label class="checkbox-line"><input name="recruiting" type="checkbox" ${c?.recruiting===0?'':'checked'}>새 멤버 모집</label>${crewV3SettingsHTML(c)}${crewImageEditorHTML(c)}${c?'':'<p class="field-help">완성 작품·협업·감상평 미션으로 성장해요. 하루 최대 100 XP, 주간 최대 270 XP.</p><button class="primary-button">저장</button><p class="form-error" role="alert"></p>'}</form>`;
}
function crewDetailView(d,param,tab='music',community=false,discovery=''){
 const c=d.crew,m=d.membership,owner=m?.role==='owner';
 const tabs=[['music','작품'],['members','멤버'],['notice','공지'],['about','소개'],['find','크루 찾기']];
 if(!tabs.some(([key])=>key===tab)&&tab!=='chat')tab='music';
 const nav='<nav class="tabs crew-room-tabs" aria-label="크루 활동">'+tabs.map(([key,label])=>'<a class="tab '+(tab===key?'active':'')+'" href="'+(key==='find'?'#community/crews?browse=1':'#crew/'+esc(c.id)+'?tab='+key)+'" '+(tab===key?'aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>';
 let html=communityNavigation('crews')+'<section class="crew-page" '+(m?'data-current-crew="'+esc(c.id)+'"':'')+'>'+crewHeroHTML(c,m)+nav+'<div id="crew-tab-content">';
 if(!m)html+='<button class="primary-button" data-join-crew="'+esc(c.id)+'" '+(d.other_crew||d.banned||!c.recruiting||c.members>=c.capacity?'disabled':'')+'>'+(d.other_crew?'다른 크루에 가입 중':c.join_policy==='approval'?'가입 신청':'크루 가입')+'</button>';
 if(tab==='music')html+=workBrowserHTML('크루 작품',d.tracks,d.dubbings);
 if(tab==='members')html+='<div class="section-heading"><h2>멤버 <small>'+c.members+' / '+c.capacity+'</small></h2></div><div class="crew-member-grid">'+d.members.map(crewMemberProfile).join('')+'</div>'+(m&&!owner?'<button class="text-link crew-leave" data-leave-crew="'+esc(c.id)+'">크루 탈퇴</button>':'');
 if(tab==='chat')html+=m?chatPanelHTML('크루 채팅'):'<p>크루에 가입하면 채팅에 참여할 수 있어요.</p>';
 if(tab==='notice')html+='<section data-crew-notices="'+esc(c.id)+'">불러오는 중…</section>';
 if(tab==='find')html+=discovery;
 if(tab==='about')html+=crewGrowthHTML(d.growth,c,m);
 return {html:html+'</div></section>',tracks:d.tracks,crew:c,chat:m&&tab==='chat'?{path:'/api/crews/'+param+'/messages',crew:{id:c.id,owner}}:null};
}
async function improvementsView(base,param,raw,readApi=api){
 if(base==='follower'&&param){
  if(!me){returnRoute=location.hash;return {html:gate()};}
  const d=await readApi('/api/followers/'+encodeURIComponent(param));
  if(d.profile.id){const social=await readApi('/api/producers/'+encodeURIComponent(d.profile.id)+'?gift_summary=0');return {html:heading('음악가의 페이지')+personProfileHTML(social,d.profile.id),tracks:musicProfileItems(social)};}
  return {html:heading('음악 친구')+'<a class="small-button" href="#library/followers">'+icon('back')+' 팔로워 목록</a>'+listenerProfileHTML(d.profile)};
 }
 if((base==='crew'&&!param)||(base==='community'&&param==='crews')){
  const params=new URLSearchParams(raw.split('?')[1]||''),q=params.get('q')||'';
  // The crew tab resolves current membership from the home summary in one read.
  const hint=base==='community'?peekCrewNavigation('discovery'):null;
  if(hint?.mine&&!params.has('q')&&params.get('browse')!=='1'){try{return await liveCrewDetail(hint.mine,'music',readApi,true);}catch(e){if(e.status!==404)throw e;clearCrewNavigation();}}
  const account=me?.id||'guest',revision=typeof apiRevision==='number'?apiRevision:0,d=await readApi('/api/crews?q='+encodeURIComponent(q)+'&summary=1'+(!params.has('q')&&params.get('browse')!=='1'?'&home=1':''));rememberCrewDiscovery(d,q,account,revision);
  if(d.detail){if(crewNavigationCurrent(account,revision))rememberCrewNavigation(d.mine,d.detail.crew);return crewDetailView(d.detail,d.mine,'music',true);}
  if(d.mine&&!params.has('q')&&params.get('browse')!=='1')return liveCrewDetail(d.mine,'music',readApi,true);
  if(d.mine){const mine=await readApi('/api/crews/'+encodeURIComponent(d.mine));if(mine.membership){const view=crewDetailView(mine,d.mine,'find',true,crewDiscoveryHTML(d,q,true));return {...view,crewDiscovery:d};}}
  return {html:crewDiscoveryHTML(d,q),tracks:[],crewDiscovery:d};
 }
 if(base==='crew'&&param){return liveCrewDetail(param,new URLSearchParams(raw.split('?')[1]||'').get('tab')||'music',readApi);}
 if(['profile','dm','rewards','payouts'].includes(base)){
  if(!me){returnRoute=location.hash;return {html:gate()};}
  if(base==='profile'){
   // Fetch independent reads together; money remains live and is never cached.
   const knownProfile=me.profile_id;
   const [d,balances,knownSocial]=await Promise.all([
    readApi('/api/me/profile'),param!=='edit'?Promise.all([loadMyBalanceSummary(readApi),loadMyCrewSummary(readApi)]).then(parts=>parts.join('')):null,
    param!=='edit'&&knownProfile?readApi('/api/producers/'+encodeURIComponent(knownProfile)+'?gift_summary=0'):null
   ]),p=d.profile;
   if(param!=='edit'){
    if(p.id){const social=p.id===knownProfile&&knownSocial?knownSocial:await readApi('/api/producers/'+encodeURIComponent(p.id)+'?gift_summary=0');social.following_count=d.following_count;return {html:myPageHeading('나의 순간과 음악이 만나는 공간')+personProfileHTML(social,p.id,new URLSearchParams(raw.split('?')[1]||'').get('tab')||'all',balances),tracks:musicProfileItems(social,new URLSearchParams(raw.split('?')[1]||'').get('tab')||'all')};}
    return {html:myPageHeading('음악을 듣기만 해도 좋아요.')+balances+'<section class="music-self-head"><div><h2>'+esc(p.name||me.name||'내 음악')+'</h2><p class="mp-public-id">ID · '+esc(p.public_id||'발급 확인 중')+'</p><p>아직 공개한 프로필이나 음악이 없어요.</p></div><div class="inline-actions"><a class="small-button" href="#profile/edit">프로필 만들기</a><a class="small-button" href="#studio">스튜디오</a></div></section>'+playerProgressHTML(p)+musicMyShortcuts()};
   }
   return {html:'<button type="button" class="small-button" data-profile-edit>프로필 수정</button>'};
  }
  if(base==='payouts')return {html:heading('정산')+earningsHTML(await readApi('/api/studio/earnings'))};
  if(base==='rewards'){const d=await readApi('/api/gold');return {html:`<div class="rewards-page">${heading('오늘의 실버','작은 활동을 모아 좋아하는 음악에 응원해보세요.')}<div id="gift-shop-rewards">${freeRewardsHTML(d.free)}</div></div>`};}
  if(param==='notice')return dmNoticeView(raw,readApi);
  if(param==='crew')return dmWorkspaceView(await crewChatView(raw,readApi));
  if(!param){const d=await readApi('/api/dm');return {html:dmInboxHTML(d),inbox:true};}
  let d;try{d=await readApi('/api/dm/'+encodeURIComponent(param));}catch(e){if(e.status===403){const blocked=await blockedPeopleView(param,null,readApi);if(blocked)return blocked;}throw e;}return dmWorkspaceView({html:'<header class="dm-thread-header"><a href="#dm" class="small-button dm-back" aria-label="대화 목록으로 돌아가기">'+icon('back')+'</a>'+dmProfileLink(d.peer,portrait(d.peer,'producer')+'<div><h1>'+esc(chatNickname(d.peer))+'</h1></div>','dm-thread-person')+dmThreadActions(d.peer,d.settings)+'</header>'+chatPanelHTML('개인 메시지',d,d.peer),chat:{path:'/api/dm/'+param,peer:d.peer,initial:d}});
 }
 return null;
}
async function libraryProfileHTML(readApi=api){
 if(!me)return '';const d=await readApi('/api/me/profile'),p=d.profile;
 return `<section class="surface library-profile"><a href="#profile/edit" aria-label="내 프로필 수정">${portrait(p,'producer')}</a><div><h2>${userNickname(p.name,{profileId:p.id,userId:p.user_id})}</h2><div class="inline-actions"><a href="#profile/edit">프로필 수정</a><a href="#library/followers">팔로워 ${d.follower_count}</a><a href="#library/following">팔로잉 ${d.following_count}</a></div></div><div class="inline-actions"><a href="#rewards" class="small-button">오늘의 실버</a><a href="#dm" class="small-button">DM</a><a href="#payouts" class="small-button">정산</a></div></section>`;
}
function bindCrewForm(){
 const form=$('#crew-form'),modal=$('#dialog'),controller=new AbortController();
 modal.addEventListener('close',()=>{controller.abort();form.remove();},{once:true});
 const save=form.querySelector('button.primary-button'),error=formError(form);
 const photo=bindCrewPhoto(form,{save,error,signal:controller.signal});
 let created=null;
 form.onsubmit=busyForm(form,async fd=>{
  photo.check();
  if(!created){
   const d=await api('/api/crews','POST',{name:fd.get('name'),description:fd.get('description'),interests:fd.get('interests'),recruiting:fd.has('recruiting'),...(fd.has('join_policy')?{join_policy:fd.get('join_policy'),minimum_level:Number(fd.get('minimum_level'))}:{}),notice:fd.get('notice')});
   created=d.crew;form.dataset.crew=created.id;
   // The crew exists even if the independent photo PUT fails. Retry only the photo.
   for(const field of form.elements)if(field.name&&field.name!=='crew_image')field.disabled=true;
   clearCrewNavigation();try{me=(await api('/api/me')).user;updateAccount();}catch{}
  }
  let uploaded;
  try{uploaded=await photo.persist('/api/crews/'+encodeURIComponent(created.id));}
  catch(e){throw Error('크루는 생성됐어요. '+e.message);}
  if(controller.signal.aborted)return;
  toast(uploaded?'크루를 만들고 대표 사진 저장을 확인했어요.':'크루를 만들었어요.');
  modal.close();location.hash='crew/'+created.id;
 });
}
function bindImprovements(view){
 bindCrewHome(view);
 bindCrewDiscovery(view);
 document.querySelectorAll('[data-crew-invite]').forEach(button=>button.onclick=async()=>{
  if(!me)return askLogin();if(button.disabled)return;button.disabled=true;
  const rid=button.dataset.requestId||(button.dataset.requestId=crypto.randomUUID());
  try{const result=await api('/api/dm/'+encodeURIComponent(button.dataset.crewInvite)+'/crew-invite','POST',{crew_id:button.dataset.crew,request_id:rid});toast('크루 초대 메시지를 보냈어요.');location.hash='dm/'+result.peer_id;}
  catch(error){toast(error.message);button.disabled=false;}
 });
 const walletRetry=$('[data-my-wallet-retry]');if(walletRetry)walletRetry.onclick=async()=>{walletRetry.disabled=true;try{await render();}finally{walletRetry.disabled=false;}};
 const browse=$('[data-browse-crews]');if(browse)browse.onclick=()=>{const input=$('#crew-search input');input.scrollIntoView({behavior:'smooth',block:'center'});input.focus({preventScroll:true});};
 const search=$('#crew-search');if(search)search.onsubmit=e=>{e.preventDefault();location.hash='community/crews?browse=1&q='+encodeURIComponent(new FormData(search).get('q'));};
 document.querySelectorAll('[data-create-crew]').forEach(b=>b.onclick=()=>{if(!me)return askLogin();dialog(crewEditor());bindCrewForm();});
 document.querySelectorAll('[data-edit-crew]').forEach(bindCrewSettingsMenu);
 for(const action of ['join','leave'])document.querySelectorAll(`[data-${action}-crew]`).forEach(b=>b.onclick=async()=>{
  if(!me)return askLogin();if(action==='leave'&&!confirm('정말 탈퇴하시겠어요? 탈퇴하면 크루 채팅을 볼 수 없어요.'))return;
  b.disabled=true;try{const result=await api('/api/crews/'+b.dataset[action+'Crew']+'/'+action,'POST');if(result.pending)toast(result.message);clearCrewNavigation();if(action==='leave')location.hash='community/crews';else await render();}catch(e){toast(e.message);b.disabled=false;}
 });
 bindSocialChat(view);
}
document.addEventListener('click',async e=>{
 const singButton=e.target.closest('[data-sing-track]');if(singButton){e.preventDefault();try{const t=(await api('/api/tracks/'+singButton.dataset.singTrack)).track;const o=t.kind==='cover'?(await api('/api/tracks/'+t.original_id)).track:t;if(!o.karaoke_ready)return toast('아직 이 곡의 부르기를 준비하고 있어요.');location.hash='sing/'+o.id;}catch(err){toast(err.message);}}
 const report=e.target.closest('[data-report-comment]');if(report){e.preventDefault();if(!me)return askLogin();dialog(`<h2>댓글 신고</h2><form id="report-comment-form"><label class="form-field">사유<select name="reason"><option value="abuse">욕설·괴롭힘</option><option value="spam">스팸</option><option value="privacy">개인정보</option><option value="sexual">성적 콘텐츠</option><option value="other">기타</option></select></label><label class="form-field">설명<textarea name="details" maxlength="500"></textarea></label><button class="primary-button">신고 접수</button><p class="form-error" role="alert"></p></form>`);const form=$('#report-comment-form');form.onsubmit=busyForm(form,async fd=>{await api('/api/comments/'+report.dataset.reportComment+'/report','POST',{reason:fd.get('reason'),details:fd.get('details')});$('#dialog').close();toast('신고를 접수했어요.');await reloadComments(location.hash.split('/')[1].split('?')[0]);});}
});
