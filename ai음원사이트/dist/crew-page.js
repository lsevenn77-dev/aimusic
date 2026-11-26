const crewInternalTabs=[['music','작품'],['members','멤버'],['notice','공지'],['about','소개']];
const crewWorkTypes=[['all','전체'],['original','제작곡'],['cover','커버'],['duet','듀엣'],['dubbing','더빙']];
const crewFindHref='#community/crews?browse=1';
const crewRecruitPreviewCount=4;
let mountedCrewPage=null;

function crewDetailView(detail,id,tab='music'){
 const {crew,membership}=detail,base='crew/'+encodeURIComponent(crew.id);
 const internal=crewInternalTabs.some(([key])=>key===tab);
 if(!internal&&tab!=='chat')tab='music';
 const tabs=crewInternalTabs.map(([key,label])=>
  '<a id="crew-tab-'+key+'" class="tab'+(tab===key?' active':'')+'" href="#'+base+'?tab='+key+
  '" aria-controls="crew-panel-'+key+'"'+(tab===key?' aria-current="page"':'')+'>'+label+'</a>').join('');
 const targets=[base,...crewInternalTabs.map(([key])=>base+'?tab='+key)];
 const tabPanels=crewInternalTabs.map(([key])=>'<section id="crew-panel-'+key+'" data-crew-panel="'+key+
  '" aria-labelledby="crew-tab-'+key+'"'+(tab===key?'':' hidden')+'></section>').join('');
 const join=!membership?'<button type="button" class="primary-button" data-join-crew="'+esc(crew.id)+'" '+
  (detail.other_crew||detail.banned||!crew.recruiting||crew.members>=crew.capacity?'disabled':'')+'>'+
  (detail.other_crew?'다른 크루에 가입 중':crew.join_policy==='approval'?'가입 신청':'크루 가입')+'</button>':'';
 const legacy=tab==='chat'?(membership?chatPanelHTML('크루 채팅'):'<p>크루에 가입하면 채팅에 참여할 수 있습니다.</p>'):'';
 return {html:communityNavigation('crews')+
  '<section class="crew-page" data-crew-detail'+(membership?' data-current-crew="'+esc(crew.id)+'"':'')+'>'+
  '<div hidden aria-hidden="true">'+targets.map(route=>'<span data-crew-route-target id="'+esc(route)+'"></span>').join('')+'</div>'+
  crewHeroHTML(crew,membership)+
  '<div class="crew-tabs-bar"><nav class="tabs crew-room-tabs" aria-label="크루 활동">'+tabs+'</nav>'+
  '<a class="crew-find-link" href="'+crewFindHref+'">크루 찾기 '+icon('chevron',16)+'</a></div>'+
  '<div id="crew-tab-content">'+join+tabPanels+legacy+'</div></section>',
  tracks:detail.tracks,crew,crewDetail:detail,crewTab:tab,
  chat:membership&&tab==='chat'?{path:'/api/crews/'+encodeURIComponent(id)+'/messages',crew:{id:crew.id,owner:membership.role==='owner'}}:null};
}

function bindCrewDetailPanels(view){
 if(!view?.crewDetail||!crewInternalTabs.some(([key])=>key===view.crewTab))return;
 const root=document.querySelector('[data-crew-detail]'),main=root.closest('#main');
 const detail=view.crewDetail,base='crew/'+encodeURIComponent(detail.crew.id),viewRoute=main.dataset.route;
 const homeAlias=['crew','community/crews'].includes(viewRoute)?viewRoute:null;
 const account=me?.id||'guest',controller=new AbortController();
 const panels=[...root.querySelectorAll('[data-crew-panel]')];
 const links=[...root.querySelectorAll('.crew-room-tabs .tab')];
 const initialized=new Set();
 function show(tab){
  for(const panel of panels)panel.hidden=panel.dataset.crewPanel!==tab;
  for(const link of links){
   const selected=link.id==='crew-tab-'+tab;
   link.classList.toggle('active',selected);
   if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  if(initialized.has(tab))return;
  initialized.add(tab);
  const panel=panels.find(panel=>panel.dataset.crewPanel===tab);
  if(tab==='music')mountCrewWorks(panel,detail);
  if(tab==='members')mountCrewMembers(panel,detail);
  if(tab==='notice')mountCrewNotices(panel,detail.crew.id,controller.signal);
  if(tab==='about')panel.innerHTML=crewAboutHTML(detail);
  bindCrewMembershipActions(panel);
 }
 const session={root,account,base,homeAlias,main,show};
 mountedCrewPage=session;
 registerRouteCleanup(()=>{
  controller.abort();
  if(mountedCrewPage===session)mountedCrewPage=null;
 });
 show(view.crewTab);
}

function refreshCrewInternalTab(raw){
 const session=mountedCrewPage;
 if(!session?.root.isConnected||session.account!==(me?.id||'guest')||
    document.documentElement.dataset.renderState!=='ready'||session.main.dataset.route===raw)return false;
 let tab;
 if(raw===session.base||raw===session.homeAlias)tab='music';
 else if(raw.startsWith(session.base+'?tab='))tab=raw.slice(session.base.length+5);
 if(!crewInternalTabs.some(([key])=>key===tab))return false;
 cleanupRouteOverlays();
 session.main.dataset.route=raw;
 session.show(tab);
 return true;
}

function crewWorkKind(work){
 if(work.kind==='original'||work.kind==='dubbing')return work.kind;
 return work.cover_mode==='duet'?'duet':'cover';
}

function crewWorkIcon(kind,withLabel=false){
 const art=kind==='cover'?'<span class="crew-cover-icon" aria-hidden="true">'+icon('mic',17)+'</span>':profileWorkIcon(kind);
 const label=crewWorkTypes.find(([key])=>key===kind)?.[1];
 return withLabel?'<span class="crew-work-type" role="img" aria-label="'+label+'" title="'+label+'">'+art+'</span>':art;
}

function crewWorkLink(work){
 return (work.kind==='dubbing'?'#dubbing/':'#song/')+encodeURIComponent(work.id);
}

function crewWorkCreator(work){
 const dub=work.kind==='dubbing',name=dub?work.owner_name:work.producer;
 return userNickname(name,{profileId:dub?work.owner_profile_id:work.producer_id,userId:dub?work.owner_id:work.user_id});
}

function crewWorkArt(work,cls){
 if(work.kind==='dubbing')return '<img class="'+cls+'" loading="lazy" decoding="async" alt="" src="'+
  esc(work.posterUrl||AifectDubbing.dubbingGenreArtwork(work.genres||[]))+'">';
 return cover(work,cls);
}

function crewWorkPlay(work,cls){
 const dub=work.kind==='dubbing',id=esc(work.id),title=esc(work.title);
 if(dub&&!(work.state==='complete'&&work.audio_ready))return '';
 const action=dub?'data-mp-dubbing-play':'data-play';
 return '<button type="button" class="'+cls+'" '+action+'="'+id+'" aria-label="'+title+' 재생">'+icon('ui-play-action',36)+'</button>';
}

function crewWorkJoinHref(work){
 if(!work.recruiting||!work.can_join)return '';
 if(work.kind==='dubbing'){
  const params=new URLSearchParams({tab:'discover',project:work.root_id||work.id,target:work.id});
  return '#karaoke/dubbing?'+params;
 }
 return work.cover_mode==='duet'&&work.original_id?
  '#sing/'+encodeURIComponent(work.original_id)+'?duet='+encodeURIComponent(work.id):'';
}

function crewWorkDate(work){return Number(work.published_at??work.created??0);}

function crewWorkCatalog(detail){
 const recruiting=[],grouped=new Map();
 for(const work of [...(detail.tracks||[]),...(detail.dubbings||[])]){
  const kind=crewWorkKind(work),join=crewWorkJoinHref(work);
  if(join)recruiting.push({work,kind,join});
  if(work.recruiting||(kind==='dubbing'&&!(work.work_finished??work.state==='complete')))continue;
  const parent=work.duet_parent_id||work.root_id,root=parent||work.id,key=kind+':'+root;
  let group=grouped.get(key);
  if(!group){group={key,kind,root,items:[]};grouped.set(key,group);}
  group.items.push(work);
 }
 const newest=(a,b)=>crewWorkDate(b)-crewWorkDate(a)||a.id.localeCompare(b.id);
 recruiting.sort((a,b)=>newest(a.work,b.work));
 const groups=[...grouped.values()].map(group=>{
  group.items.sort(newest);
  const lead=group.items.find(work=>work.id===group.root)||group.items[0];
  const versions=group.items.filter(work=>work.id!==group.root);
  return {...group,lead,versions,date:crewWorkDate(group.items[0]),rank:lead.popular_rank??Infinity};
 });
 groups.sort((a,b)=>b.date-a.date||a.key.localeCompare(b.key));
 return {recruiting,groups};
}

function crewRecruitRow({work,kind,join}){
 const title=esc(work.title),href=crewWorkLink(work);
 return '<article class="crew-recruit-row"><a href="'+href+'" class="crew-recruit-art" aria-label="'+title+' 상세보기">'+
  crewWorkArt(work,'crew-recruit-cover')+'</a><div class="crew-recruit-copy">'+
  '<a class="crew-work-title" href="'+href+'" title="'+title+'">'+crewWorkIcon(kind,true)+'<strong>'+title+'</strong></a>'+
  '<div class="crew-recruit-meta"><small class="crew-work-creator">'+crewWorkCreator(work)+'</small><span>모집 중</span></div></div>'+
  '<a class="small-button crew-join-work" href="'+esc(join)+'" aria-label="'+title+' 참여하기">참여하기</a></article>';
}

function crewWorkCard(group){
 const {lead,kind,versions}=group,title=esc(lead.title),href=crewWorkLink(lead);
 const list=versions.length?'<details class="crew-work-versions"><summary>참여 버전 '+number(versions.length)+'개</summary>'+
  versions.map(version=>'<div class="crew-work-version"><a href="'+crewWorkLink(version)+'" title="'+esc(version.title)+'">'+
   esc(kind==='dubbing'?version.owner_name||version.title:version.producer||version.title)+'</a>'+
   crewWorkPlay(version,'icon-button')+'</div>').join('')+'</details>':'';
 return '<article class="album-card crew-work-card" data-crew-work="'+esc(group.key)+'"><div class="album-art-wrap">'+
  '<a href="'+href+'" aria-label="'+title+' 상세보기">'+crewWorkArt(lead,'album-art')+'</a>'+crewWorkPlay(lead,'card-play')+'</div>'+
  '<div class="album-title-row">'+crewWorkIcon(kind,true)+'<a class="album-title" href="'+href+'" title="'+title+'">'+title+'</a></div>'+
  '<small class="crew-work-creator">'+crewWorkCreator(lead)+'</small>'+list+'</article>';
}

function mountCrewWorks(panel,detail){
 const {recruiting,groups}=crewWorkCatalog(detail);
 panel.innerHTML=(recruiting.length?'<section class="crew-recruitment" aria-labelledby="crew-recruit-title">'+
  '<header class="crew-section-heading"><h2 id="crew-recruit-title">참여 가능한 작품 <small>'+number(recruiting.length)+'</small></h2>'+
  (recruiting.length>crewRecruitPreviewCount?'<button type="button" class="text-link" data-crew-recruit-more aria-expanded="false" aria-controls="crew-recruit-list">전체보기 '+icon('chevron',16)+'</button>':'')+
  '</header><div class="crew-recruit-list" id="crew-recruit-list">'+recruiting.slice(0,crewRecruitPreviewCount).map(crewRecruitRow).join('')+'</div></section>':'')+
  '<section class="crew-works" aria-labelledby="crew-works-title"><header class="crew-section-heading"><h2 id="crew-works-title">크루 작품 '+
  '<small data-crew-work-count aria-live="polite">'+number(groups.length)+'개</small></h2></header>'+
  '<div class="crew-works-toolbar"><div class="crew-work-filters" role="group" aria-label="작품 유형">'+
  crewWorkTypes.map(([kind,label])=>'<button type="button" data-crew-work-filter="'+kind+'" aria-pressed="'+(kind==='all')+'">'+
  (kind==='all'?'':crewWorkIcon(kind))+label+'</button>').join('')+'</div>'+
  '<select data-dropdown="sm" data-crew-work-order aria-label="작품 정렬"><option value="recent">최신순</option><option value="popular">인기순</option></select></div>'+
  '<div class="crew-work-grid" data-crew-work-grid></div><p class="crew-empty" data-crew-work-empty hidden></p></section>';
 const list=panel.querySelector('#crew-recruit-list'),more=panel.querySelector('[data-crew-recruit-more]');
 if(more)more.onclick=()=>{
  const expanded=more.getAttribute('aria-expanded')==='true';
  if(!expanded)list.insertAdjacentHTML('beforeend',recruiting.slice(crewRecruitPreviewCount).map(crewRecruitRow).join(''));
  else while(list.children.length>crewRecruitPreviewCount)list.lastElementChild.remove();
  more.setAttribute('aria-expanded',String(!expanded));
  more.innerHTML=(expanded?'전체보기':'접기')+icon('chevron',16);
 };
 const order=panel.querySelector('[data-crew-work-order]'),grid=panel.querySelector('[data-crew-work-grid]');
 const count=panel.querySelector('[data-crew-work-count]'),empty=panel.querySelector('[data-crew-work-empty]');
 const filters=[...panel.querySelectorAll('[data-crew-work-filter]')];
 let kind='all';
 function paint(){
  const items=groups.filter(group=>kind==='all'||group.kind===kind);
  if(order.value==='popular')items.sort((a,b)=>a.rank-b.rank||b.date-a.date||a.key.localeCompare(b.key));
  grid.innerHTML=items.map(crewWorkCard).join('');
  count.textContent=number(items.length)+'개';
  empty.hidden=items.length>0;
  empty.textContent=kind==='all'?'아직 공개한 크루 작품이 없습니다.':'이 유형의 크루 작품이 없습니다.';
 }
 for(const filter of filters)filter.onclick=()=>{
  if(kind===filter.dataset.crewWorkFilter)return;
  kind=filter.dataset.crewWorkFilter;
  for(const button of filters)button.setAttribute('aria-pressed',String(button===filter));
  paint();
 };
 order.onchange=paint;
 paint();
}

function mountCrewMembers(panel,detail){
 const {crew,membership,members}=detail,manage=canManageCrew(membership);
 const open=crew.recruiting&&crew.members<crew.capacity;
 const tools=manage?'<div class="crew-member-tools">'+
  '<button type="button" class="text-link" data-crew-page-action="activity">가입 신청 관리</button>'+
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
