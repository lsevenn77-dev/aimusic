const crewInternalTabs=[['music','작품'],['members','멤버'],['notice','공지'],['about','소개']];
const crewFindHref='#community/crews?browse=1';
let mountedCrewPage=null;

function crewDetailView(detail,id,tab='music'){
 const {crew,membership}=detail,base='crew/'+encodeURIComponent(crew.id);
 const internal=crewInternalTabs.some(([key])=>key===tab);
 if(!internal&&tab!=='chat')tab='music';
 const tabs=crewInternalTabs.map(([key,label])=>
  '<a id="crew-tab-'+key+'" class="secondary-button" href="#'+base+'?tab='+key+
  '" aria-controls="crew-panel-'+key+'"'+(tab===key?' aria-current="page"':'')+'>'+label+'</a>').join('');
 const targets=[base,...crewInternalTabs.map(([key])=>base+'?tab='+key)];
 const tabPanels=crewInternalTabs.map(([key])=>'<section id="crew-panel-'+key+'" data-crew-panel="'+key+
  '" aria-labelledby="crew-tab-'+key+'"'+(tab===key?'':' hidden')+'></section>').join('');
 const canApply=crew.join_policy==='approval',canJoin=!detail.other_crew&&!detail.banned&&!detail.application_pending&&crew.recruiting&&crew.members<crew.capacity;
 const join=!membership?'<button type="button" class="small-button crew-join-profile" data-join-crew="'+esc(crew.id)+'" '+
  (canApply?'data-crew-application data-crew-name="'+esc(crew.name)+'" ':'')+(canJoin?'':'disabled')+'>'+
  (detail.other_crew?'다른 크루에 가입 중':detail.application_pending?'가입 승인 대기':canApply?'가입 신청':'크루 가입')+'</button>':'';
 const legacy=tab==='chat'?(membership?chatPanelHTML('크루 채팅'):'<p>크루에 가입하면 채팅에 참여할 수 있습니다.</p>'):'';
 return {html:communityNavigation('crews')+
  '<section class="crew-page" data-crew-detail'+(membership?' data-current-crew="'+esc(crew.id)+'"':'')+'>'+
  '<div hidden aria-hidden="true">'+targets.map(route=>'<span data-crew-route-target id="'+esc(route)+'"></span>').join('')+'</div>'+
  crewHeroHTML(crew,membership,join)+
  '<div class="crew-tabs-bar"><nav class="crew-room-tabs" aria-label="크루 활동">'+tabs+'</nav>'+crewExperienceHTML(crew)+'</div>'+
  '<div id="crew-tab-content">'+tabPanels+legacy+'</div></section>',
  tracks:detail.tracks,crew,crewDetail:detail,crewTab:tab,
  chat:membership&&tab==='chat'?{path:'/api/crews/'+encodeURIComponent(id)+'/messages',crew:{id:crew.id,owner:membership.role==='owner'}}:null};
}

function crewChallengeHTML(crew,membership){
 const find='<a class="crew-find-link" href="'+crewFindHref+'">크루 찾기 '+icon('chevron',16)+'</a>';
 if(!membership)return find;
 return `<section class="crew-challenge" aria-labelledby="crew-challenge-heading">
  <div class="crew-challenge-heading"><h2 id="crew-challenge-heading">크루 챌린지</h2>${find}</div>
  <div class="crew-weekly-games" data-crew-games="${esc(crew.id)}">${crewGameMenuHTML(membership.game_catalog)}</div>
 </section>`;
}

function crewExperienceHTML(crew){
 const xp=number(crew.xp)+' / '+(crew.next_xp==null?'MAX':number(crew.next_xp))+' XP';
 const next=crew.next_xp==null?'최고 레벨 달성':'다음 레벨까지 '+number(Math.max(0,crew.next_xp-crew.xp))+' XP';
 return `<div class="crew-detail-xp"><span>${xp}</span>
  <progress max="1" value="${Number(crew.progress||0)}" aria-label="크루 경험치" aria-valuetext="${xp}"></progress>
  <small>${next}</small></div>`;
}

function bindCrewDetailPanels(view){
 if(!view?.crewDetail)return;
 const root=document.querySelector('[data-crew-detail]'),main=root.closest('#main');
 const detail=view.crewDetail,base='crew/'+encodeURIComponent(detail.crew.id),viewRoute=main.dataset.route;
 const homeAlias=['crew','community/crews'].includes(viewRoute)?viewRoute:null;
 const account=me?.id||'guest',controller=new AbortController();
 const panels=[...root.querySelectorAll('[data-crew-panel]')];
 const links=[...root.querySelectorAll('.crew-room-tabs a')];
 const initialized=new Set();
 const noticePanel=panels.find(panel=>panel.dataset.crewPanel==='notice');
 let notices;
 if(view.crewTab==='chat'){
  registerRouteCleanup(()=>controller.abort());
  return;
 }
 function show(tab,noticeId){
  for(const panel of panels)panel.hidden=panel.dataset.crewPanel!==tab;
  for(const link of links){
   const selected=link.id==='crew-tab-'+tab;
   if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  if(tab==='notice')notices??=mountCrewNotices(noticePanel,detail.crew.id,controller.signal);
  notices?.select(tab==='notice'?noticeId:null);
  if(initialized.has(tab))return;
  initialized.add(tab);
  const panel=panels.find(panel=>panel.dataset.crewPanel===tab);
  if(tab==='music')mountCrewWorks(panel,detail);
  if(tab==='members')mountCrewMembers(panel,detail);
  if(tab==='about')panel.innerHTML=crewAboutHTML(detail);
  bindCrewMembershipActions(panel);
 }
 const session={root,account,base,homeAlias,main,show};
 mountedCrewPage=session;
 registerRouteCleanup(()=>{
  controller.abort();
  if(mountedCrewPage===session)mountedCrewPage=null;
 });
 show(view.crewTab,new URLSearchParams(location.hash.split('?')[1]||'').get('notice'));
}

function refreshCrewInternalTab(raw){
 const session=mountedCrewPage;
 if(!session?.root.isConnected||session.account!==(me?.id||'guest')||
    document.documentElement.dataset.renderState!=='ready'||session.main.dataset.route===raw)return false;
 let tab,noticeId;
 if(raw===session.base||raw===session.homeAlias)tab='music';
 else if(raw.startsWith(session.base+'?')){
  const params=new URLSearchParams(raw.slice(session.base.length+1));
  tab=params.get('tab');noticeId=params.get('notice');
 }
 if(!crewInternalTabs.some(([key])=>key===tab))return false;
 cleanupRouteOverlays();
 session.main.dataset.route=raw;
 session.show(tab,noticeId);
 return true;
}

function crewWorkCatalog(detail){
 const grouped=new Map();
 const unique=new Map([...(detail.tracks||[]),...(detail.dubbings||[])].map(work=>[work.kind+':'+work.id,work]));
 for(const work of unique.values()){
  const kind=workFeedKind(work),recruiting=!!work.recruiting;
  if(kind==='dubbing'&&!recruiting&&!(work.work_finished??work.state==='complete'))continue;
  // Independently joinable combinations retain their own action and date.
  const root=kind==='dubbing'&&recruiting?work.id:work.duet_parent_id||work.root_id||work.id;
  const key=kind+':'+root,date=Number(work.published_at??work.created??0);
  if(!grouped.has(key))grouped.set(key,{key,kind,root,items:[]});
  grouped.get(key).items.push({work,date,key:work.id,recruiting});
 }
 return [...grouped.values()].map(({key,kind,root,items})=>{
  items.sort(compareWorkFeed);
  const lead=items.find(item=>item.work.id===root)||items[0];
  return {key,kind,work:lead.work,date:lead.date,recruiting:lead.recruiting,
   rank:lead.work.popular_rank??Infinity,versions:items.filter(item=>item!==lead).map(item=>item.work)};
 }).sort(compareWorkFeed);
}

function crewWorkCreator({work}){
 const dubbing=work.kind==='dubbing';
 return userNickname(dubbing?work.owner_name:work.producer,{profileId:dubbing?work.owner_profile_id:work.producer_id,
  userId:dubbing?work.owner_id:work.user_id});
}

function crewWorkJoin({work,recruiting}){
 if(!recruiting||!work.can_join||(work.owner_id||work.user_id)===me?.id)return '';
 let href;
 if(work.kind==='dubbing'){
  if(work.root_id&&!work.casting_combo)href=workFeedLink(work);
  else href='#karaoke/dubbing?'+new URLSearchParams({tab:'discover',project:work.root_id||work.id,target:work.id});
 }else if(work.original_id)href='#sing/'+encodeURIComponent(work.original_id)+'?duet='+encodeURIComponent(work.id);
 return href?`<a class="small-button work-feed-join" href="${esc(href)}" aria-label="${esc(work.title)} 참여하기">참여하기</a>`:'';
}

function mountCrewWorks(panel,detail){
 const items=crewWorkCatalog(detail),state=workFeedState('crew:'+detail.crew.id);
 const previousPages=new Map([...state.pages].map(([key,page])=>[key,page.items.size]));
 state.pages.clear();
 panel.innerHTML=workFeedHTML({order:true,label:'크루 작품'});
 return mountWorkFeed(panel.querySelector('[data-work-feed]'),{
  state,restoreScroll:true,metadata:crewWorkCreator,actions:crewWorkJoin,
  emptyText:filter=>filter==='all'?'아직 공개한 크루 작품이 없습니다.':'이 유형의 크루 작품이 없습니다.',
  loadPage({filter,order,cursor}){
   const filtered=items.filter(item=>workFeedMatches(item,filter));
   if(order==='popular')filtered.sort((a,b)=>a.rank-b.rank||compareWorkFeed(a,b));
   const start=cursor||0,size=start?workFeedBatch:Math.max(workFeedBatch,previousPages.get(filter+':'+order)||0);
   const end=start+size;
   return {items:filtered.slice(start,end),next_cursor:end<filtered.length?end:null};
  }
 });
}

function mountCrewMembers(panel,detail){
 const {crew,membership,members}=detail,manage=canManageCrew(membership);
 const open=crew.recruiting&&crew.members<crew.capacity;
 const tools=manage?'<div class="crew-member-tools">'+
  '<button type="button" class="text-link" data-crew-page-action="applications">가입 신청 관리</button>'+
  '<button type="button" class="small-button" data-crew-page-invite'+(open?'':' disabled title="모집 중이며 정원이 남은 크루만 초대할 수 있습니다."')+'>멤버 초대</button></div>':'';
 panel.innerHTML='<header class="crew-section-heading"><h2>크루 멤버 <small>'+
  number(crew.members)+' / '+number(crew.capacity)+'명</small></h2>'+tools+'</header>'+
  '<ul class="crew-member-list">'+members.map(person=>crewMemberRow(person,membership)).join('')+'</ul>'+
  (membership&&membership.role!=='owner'?'<button type="button" class="text-link crew-leave" data-leave-crew="'+esc(crew.id)+'">크루 탈퇴</button>':'');
 panel.querySelector('[data-crew-page-invite]')?.addEventListener('click',()=>openCrewInvitation(detail));
 for(const button of panel.querySelectorAll('[data-crew-page-action]')){
  button.onclick=()=>openCrewMemberAction(button,crew.id,button.dataset.crewPageAction,button.dataset.crewPagePerson);
 }
}

function crewMemberRow(person,membership){
 const name=person.profile_name||person.name,profile=encodeURIComponent(person.id),self=person.user_id===me?.id;
 const role=crewRoleLabels[person.role==='operator'?'manager':person.role]||crewRoleLabels.member;
 const manage=canManageCrewMember(membership?.role,person.role)&&!self;
 return '<li class="crew-member-row"><a class="crew-member-link" href="#producer/'+profile+'" title="'+esc(name)+'">'+
  '<span class="crew-member-face player-avatar avatar-frame-host">'+avatarImage(person,'producer',false)+playerBadgeHTML(person)+'</span>'+
  '<span class="crew-member-copy"><strong'+premiumNameAttribute(person.id,person.user_id)+'>'+esc(name)+'</strong><small>'+esc(role)+'</small></span></a>'+
  '<div class="crew-member-tools">'+(me&&!self?'<a class="icon-button" href="#dm/'+profile+'" aria-label="'+esc(name)+'에게 메시지">'+icon('message',20)+'</a>':'')+
  (manage?'<button class="icon-button" type="button" data-crew-page-action="members" data-crew-page-person="'+esc(person.id)+
   '" aria-label="'+esc(name)+' 관리">'+icon('ui-menu-action',22)+'</button>':'')+'</div></li>';
}

function openCrewInvitation({crew,membership,members}){
 if(!canManageCrew(membership))return;
 const existing=new Set(members.map(person=>person.user_id));
 openMessageRecipientDialog({
  heading:'멤버 초대',formId:'crew-invite-form',sendLabel:'초대 보내기',
  filter:person=>!existing.has(person.user_id),
  send:(recipient,requestId)=>sendCrewInvite(crew.id,recipient,requestId),
  onSent:(result,active)=>{toast('크루 초대 메시지를 보냈습니다.');if(active)location.hash='dm/'+encodeURIComponent(result.peer_id);}
 });
}

function crewActivities(crew){
 return [...new Set([crew.primary_activity,...(crew.additional_activities||[])].filter(Boolean))];
}

function crewAboutHTML({crew,membership,growth}){
 const activities=crewActivities(crew),join=AifectCrewTags.CREW_JOIN_LABELS[crew.join_policy];
 const recruiting=crew.recruiting!=null&&crew.recruiting&&crew.members<crew.capacity;
 const item=(label,value)=>value?'<div><dt>'+label+'</dt><dd>'+value+'</dd></div>':'';
 const entries=item('활동 방향',activities.map(esc).join(' · '))+item('가입 방식',esc(join||''))+
  item('멤버 모집',crew.recruiting==null?'':recruiting?'모집 중':'모집 마감');
 return '<section class="crew-about"><header class="crew-section-heading"><h2>크루 소개</h2></header>'+
  (crew.description?.trim()?'<p class="crew-description">'+esc(crew.description)+'</p>':'')+
  (entries?'<dl>'+entries+'</dl>':'')+
  (membership?'<div class="crew-about-links"><a class="text-link" href="#dm/crew/'+encodeURIComponent(crew.id)+'">'+icon('message',18)+' 크루 채팅</a>'+
   '<a class="text-link" href="#live?mode=talk&amp;crew-room='+encodeURIComponent(crew.id)+'">'+icon('mic',18)+' 크루 토킹룸 만들기</a></div>':'')+
  crewGrowthHTML(growth,crew,membership)+'</section>';
}
