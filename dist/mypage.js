// Desktop composition reuses existing routes, media, playback and social actions.
let myPageState=null,myPendingTabFocus='',myWorkSearchObserver=null;
const myDate=n=>n?new Date(n*1000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'';
const myEmpty=text=>`<p class="mp-empty">${esc(text)}</p>`;
const myLoading=()=>'<p class="mp-empty" role="status">불러오는 중…</p>';
function mySection(title,content,link='',count=null,cls=''){
 return `<section class="mp-card ${cls}"><div class="mp-section-head"><h2>${title}${count===null?'':` <span>${number(count)}</span>`}</h2>${link}</div>${content}</section>`;
}
const myAll=(href,label='전체보기')=>`<a class="mp-all" href="${esc(href)}">${label} ${icon('chevron')}</a>`;
function isMyProfile(p){return !!me?.id&&me.id===p.user_id;}

function myProfileStats(d,own){
 if(d.followers==null)return '';
 if(own){
  const followers=d.followers;
  return `<div class="mp-stats">
   <a href="#follow?tab=followers">팔로워 <b>${number(followers)}</b></a>
   <a href="#follow?tab=following">팔로잉 <b>${number(d.following_count??0)}</b></a>
   <span title="공개된 원곡·커버·듀엣·완성 더빙">작품 <b>${number(d.profile_work_count??0)}</b></span>
   <span title="내가 등록한 원곡 · 삭제 제외">제작곡 <b>${number(d.produced_track_count??(d.tracks||[]).length)}</b></span></div>`;
 }
 const publicSongs=d.public_track_count??[...(d.tracks||[]),...(d.covers||[])].filter(t=>!t.status||t.status==='published').length;
 return `<div class="mp-stats">
  <a href="#follow?tab=followers&amp;user=${encodeURIComponent(d.profile.user_id)}" data-followers="producer/${esc(d.profile.id)}" data-count="${Number(d.followers)}">팔로워 <b data-follow-count>${number(d.followers)}</b>${d.ai_followers?` · AI ${number(d.ai_followers)} 포함`:''}</a>
  <a href="#follow?tab=following&amp;user=${encodeURIComponent(d.profile.user_id)}">팔로잉 <b>${number(d.following_count||0)}</b></a><span>공개곡 <b>${number(publicSongs)}</b></span></div>`;
}

function myProfileHeader(d){
 const p=d.profile,own=isMyProfile(p),c=d.crew,bio=p.bio?.trim();
 const frame={profile_frame:p.profile_frame,profile_frame_artwork:p.profile_frame_artwork};
 const photo=p.id&&p.image_version?'/media/producer/'+encodeURIComponent(p.id)+'?v='+encodeURIComponent(p.image_version):'';
 const banner=p.id&&p.banner_version?'/media/banner/'+encodeURIComponent(p.id)+'?v='+encodeURIComponent(p.banner_version):'';
 const background=`<div class="mp-header-background" aria-hidden="true">${banner||photo?`<img src="${esc(banner||photo)}"${banner&&photo?` data-fallback="${esc(photo)}"`:''} alt="">`:''}</div>`;
 const tools=`<div class="mp-header-tools">
  <button type="button" class="fan-icon" data-mp-share aria-label="프로필 공유" title="프로필 공유">${icon('share',20)}</button>
  ${own?`<button type="button" class="fan-icon" data-mp-settings aria-label="프로필 설정" title="프로필 설정" aria-controls="mp-settings-menu" aria-expanded="false">${icon('settings',20)}</button>`:''}
 </div>`;
 const settings=own?`<nav id="mp-settings-menu" class="fan-settings-menu mp-settings-menu" aria-label="프로필 설정" hidden>
  <a href="#membership">${icon('ticket',18)}구독·이용권 관리</a>
  <a href="#payouts">${icon('wallet',18)}정산내역</a>
  <a href="#account">${icon('settings',18)}계정설정</a>
  <button type="button" data-quick-logout>${icon('logout',18)}로그아웃</button>
 </nav>`:'';
 const actions=own?`<div class="mp-header-actions mp-owner-actions">
  <a class="primary-button" href="#profile/edit">프로필 수정</a><a class="small-button" href="#studio">스튜디오</a>
 </div>`:d.followers!=null&&p.id?`<div class="mp-header-actions mp-social-actions">
  <button class="primary-button" data-follow="producer/${esc(p.id)}" aria-pressed="${followed('producer',p.id)}">${followed('producer',p.id)?'팔로잉':'팔로우'}</button>
  <a class="small-button" href="#dm/${esc(p.id)}">메시지</a><button type="button" class="small-button" data-profile-gift="${esc(p.id)}">선물하기</button>
 </div>`:'';
 return `<div class="mp-profile-area"><header class="mp-profile">${background}
  <div class="mp-avatar-space"><div class="mp-avatar${playerAvatarClass(frame)}">${avatarImage(p)}${playerBadgeHTML(frame)}</div></div>
  <div class="mp-identity"><div class="mp-byline">${tools}<h2><span data-profile-preview="${esc(p.id||(own?'self':'member:'+p.user_id))}" role="button" tabindex="0" aria-haspopup="dialog">${esc(p.name)}</span>${p.account_type==='ai_bot'?'<span class="ai-account-badge" title="공식 AI 응원 계정">AI</span>':''}</h2>
   ${p.account_type==='ai_bot'?'<p class="field-help">공식 AI 응원 계정</p>':''}
   ${p.public_id?`<p class="mp-public-id">ID · ${esc(p.public_id)} <button type="button" class="text-link" data-copy-public-id="${esc(p.public_id)}" aria-label="고유 ID 복사"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button></p>`:''}
   ${c?`<div class="mp-crew-line"><a href="#crew/${esc(c.id)}">${c.image_version?`<img src="/media/crew/${esc(c.id)}?v=${esc(c.image_version)}" alt="">`:icon('users')}${esc(c.name)}</a></div>`:''}
   </div>${settings}${bio&&bio!=='-'?`<p class="mp-profile-bio">${esc(bio)}</p>`:''}${myProfileStats(d,own)}
  </div>${actions}</header></div>`;
}

function bindMemberHeader(profile){
 const header=document.querySelector('.mp-profile');
 if(!header)return;
 const image=header.querySelector('.mp-header-background img');
 if(image){
  const fallback=()=>{
   if(image.dataset.fallback){image.src=image.dataset.fallback;delete image.dataset.fallback;}
   else image.remove();
  };
  image.addEventListener('error',fallback);
  if(image.complete&&!image.naturalWidth)fallback();
 }
 header.querySelector('[data-mp-share]').onclick=()=>shareMemberProfile(profile);
 const trigger=header.querySelector('[data-mp-settings]'),menu=header.querySelector('.mp-settings-menu');
 if(!trigger||!menu)return;
 const events=new AbortController();
 const setOpen=open=>{menu.hidden=!open;trigger.setAttribute('aria-expanded',String(open));};
 trigger.onclick=()=>{
  setOpen(menu.hidden);
  if(!menu.hidden)menu.querySelector('a').focus({preventScroll:true});
 };
 document.addEventListener('click',e=>{
  if(menu.hidden||trigger.contains(e.target))return;
  if(!menu.contains(e.target)||e.target.closest('a,button')){
   if(menu.contains(e.target))trigger.focus({preventScroll:true});
   setOpen(false);
  }
 },{capture:true,signal:events.signal});
 document.addEventListener('focusin',e=>{
  if(!menu.hidden&&!menu.contains(e.target)&&e.target!==trigger)setOpen(false);
 },{signal:events.signal});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!menu.hidden){setOpen(false);trigger.focus();e.preventDefault();}
 },{signal:events.signal});
 registerRouteCleanup(()=>{events.abort();setOpen(false);});
}

function myMoments(d){
 const photos=d.gallery||[],pid=d.profile.id,own=isMyProfile(d.profile);
 const thumbnails=photos.slice(0,4).map((p,i)=>`<button type="button" data-gallery-photo="${esc(p.url)}" data-photo-label="${esc(d.profile.name)} 사진 ${i+1}" aria-label="사진 ${i+1} 크게 보기"><img src="${esc(p.url)}" alt="${esc(d.profile.name)}의 순간 ${i+1}" loading="${i<5?'eager':'lazy'}"></button>`).join('');
 const slot=own?`<button type="button" class="mp-photo-add" data-profile-photo-add="${esc(pid||'')}" aria-label="갤러리 사진 등록">${icon('plus',24)}</button>`:'<span class="mp-moment-placeholder" aria-hidden="true"></span>';
 const placeholders=slot.repeat(Math.max(0,4-photos.length));
 const grid=`<div class="mp-moments">${thumbnails}${placeholders}</div>`;
 const empty=photos.length?'':myEmpty(own?'빈칸을 눌러 첫 사진을 등록하세요.':'공개된 사진이 없어요.');
 return mySection('갤러리',grid+empty,pid?myAll('#profile-gallery/'+encodeURIComponent(pid)):myAll('#profile/edit'),photos.length,'mp-moments-card');
}
function myStudioBanner(){return `<section class="mp-card mp-studio"><h2>스튜디오</h2><p>나만의 음악과 더빙을<br>제작하고 관리해보세요.</p><a class="primary-button" href="#studio">스튜디오 바로가기 ${icon('arrow')}</a></section>`;}
function myArtists(d){
 const artists=d.artists||[],own=isMyProfile(d.profile);
 const slots=artists.slice(0,3).map(a=>`<a class="artist-ui-card mp-artist-card" href="#artist/${esc(a.id)}"><div class="artist-avatar-wrapper">${portrait(a,'artist')}</div><strong title="${esc(a.name)}">${esc(a.name)}</strong></a>`);
 while(own&&slots.length<3)slots.push(`<button type="button" class="artist-ui-card mp-artist-add" data-mp-artist-add aria-label="아티스트 추가">${icon('plus')}</button>`);
 return mySection('소속 아티스트',slots.length?`<div class="mp-artists">${slots.join('')}</div>`:myEmpty('등록된 아티스트가 없어요.'),myAll('#profile-artists/'+encodeURIComponent(d.profile.id)),artists.length,'mp-artists-card');
}
function myArtistAddDialog(){
 if(!me||(!myPageState?.own&&!document.querySelector('.artist-directory[data-can-manage="true"]')))return;
 dialog(`<div class="mypage-dialog"><h2>아티스트 추가</h2><form id="mp-artist-create" class="upload-form">${formField('아티스트 이름','name','text','','required maxlength="60"')}${bioField('소개','bio')}${genreField()}${imageField('프로필 사진','image')}<button type="submit" class="primary-button">아티스트 추가</button><p class="form-error" role="alert"></p></form></div>`);
 bindImageInputs();
 const form=$('#mp-artist-create');
 form.onsubmit=busyForm(form,async fd=>{
  await validateImage(fd.get('image'));
  const {id}=await api('/api/studio/artists','POST',textFields(fd));
  if(fd.get('image')?.size)await uploadFile('/api/studio/artists/'+id+'/image',fd.get('image'));
  $('#dialog').close();await render();toast('아티스트를 추가했어요.');
 });
}

const profileWorkTypes={
 all:{label:'전체 유형',path:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'},
 original:{label:'제작곡',color:'#8EDDD2',path:'<path d="M9 18V6l11-3v12M9 9l11-3"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="15" rx="3" ry="2.5"/>'},
 solo:{label:'솔로',color:'#C4B5FD',path:'<circle cx="12" cy="7.5" r="3.5"/><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"/>'},
 duet:{label:'듀엣',color:'#F3A6CF',path:'<circle cx="8" cy="8" r="3"/><circle cx="17" cy="8" r="2.7"/><path d="M2 20v-1a6 6 0 0 1 12 0v1m2-6a5 5 0 0 1 6 5v1"/>'},
 dubbing:{label:'더빙',color:'#8BCFF3',path:'<path d="m3 8 17-5 1 4-17 5zM4 12h17v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM7 7l3 3m3-5 3 3"/>'},
 script:{label:'대본',color:'#F2D477',path:'<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h6"/>'}
};
const profileWorkTabs={
 all:{label:'전체',types:Object.keys(profileWorkTypes)},original:{label:'제작곡',types:['original']},
 complete:{label:'완성곡',types:['all','solo','duet','dubbing']},recruit:{label:'모집중',types:['all','duet','dubbing','script']}
};
function profileWorkIcon(type,tooltip=false){
 const {label,color,path}=profileWorkTypes[type];
 const svg=`<svg class="mp-type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${color?' style="color:'+color+'"':''}>${path}</svg>`;
 return tooltip?`<span class="mp-type-tip" tabindex="0" role="img" aria-label="${label}" data-label="${label}">${svg}</span>`:svg;
}
function profileWorkCatalog(d){
 const works=new Map();
 for(const t of [...(d.tracks||[]),...(d.covers||[]),...(d.dubbings||[])]){
  const dub=t.kind==='dubbing',finished=dub?!!t.work_finished:!!t.work_public;
  const type=dub?(!t.root_id&&!finished?'script':'dubbing'):t.kind==='original'?'original':t.cover_mode==='duet'?'duet':'solo';
  let section=null;
  if(type==='original')section='original';
  else if(dub){if(finished)section='complete';else if(t.work_open)section='recruit';}
  else if(finished){
   if(type==='solo'||(t.duet_parent_id&&!t.duet_open))section='complete';
   else if(t.recruiting)section='recruit';
  }
  const mine=!!me&&me.id===(dub?t.owner_id:t.user_id);
  // Supplemental duet parents are returned for context. Only actual performers own the work.
  if(!dub&&t.producer_id!==d.profile.id&&t.duet_partner_id!==d.profile.id)continue;
  const key=(dub?'dubbing:':'track:')+t.id;
  works.set(key,{key,t,type,section,mine,nickname:dub?t.owner_name:t.work_nickname,date:Number(t.published_at||t.created)||0});
 }
 return [...works.values()].sort((a,b)=>b.date-a.date||(a.key<b.key?-1:a.key>b.key?1:0));
}
function profileWorksHref(d,tab='all',type='',query=''){
 const base=isMyProfile(d.profile)?'#profile/works':'#profile-works/'+encodeURIComponent(d.profile.id);
 const params=new URLSearchParams({tab});
 if(type&&type!=='all'&&profileWorkTabs[tab].types.includes(type))params.set('type',type);
 if(query)params.set('q',query);
 return base+'?'+params;
}
// These flags come from the authenticated profile projection, never from card type alone.
function profileWorkJoin({t,section,mine}){
 if(section!=='recruit')return null;
 const dub=t.kind==='dubbing';
 if(!(dub?t.work_open:t.recruiting))return {reason:'모집이 마감되었어요.'};
 if(mine)return {reason:'본인 작품에는 참여할 수 없어요.'};
 if(!me)return {reason:'로그인 후 참여할 수 있어요.'};
 if(dub&&t.viewer_claimed)return {reason:'이미 참여 중인 작품이에요.'};
 if(!t.can_join)return {reason:'현재 이 작품에 참여할 권한이 없어요.'};
 if(!dub&&!t.original_id)return {reason:'원곡을 확인할 수 없어요.'};
 return {href:dub?(t.casting_combo||!t.root_id
  ?'#karaoke/dubbing?tab=discover&project='+encodeURIComponent(t.root_id||t.id)+'&target='+encodeURIComponent(t.id)
  :null):'#sing/'+encodeURIComponent(t.original_id)+'?duet='+encodeURIComponent(t.id)};
}
function profileWorkCard({t,type,section,mine,nickname,key},{showManagement=false}={}){
 const id=encodeURIComponent(t.id),title=esc(t.title),dub=t.kind==='dubbing';
 const canPlay=dub?!!(t.work_finished&&t.audio_ready):!!t.work_public;
 const detail=dub?'#dubbing/'+id:canPlay?'#song/'+id:'#manage/'+id;
 const art=dub?`<img class="mp-dub-cover" loading="lazy" src="${esc(AifectDubbing.dubbingGenreArtwork(t.genres||[]))}" alt="">`:cover(t,'mp-track-cover');
 const privateWork=dub?t.visibility==='private':!!t.status&&t.status!=='published';
 const mark=privateWork?`<span class="mp-private-state" aria-label="비공개" title="비공개">${icon('lock',14)}</span>`:'';
 const join=profileWorkJoin({t,section,mine}),reasonId='mp-join-'+(dub?'dubbing-':'track-')+id;
 return `<article class="mp-catalog-card" data-work-kind="${type}"><div class="album-art-wrap mp-card-art"><a href="${detail}" aria-label="${title} 상세보기">${art}${mark}</a>
  ${canPlay?`<button type="button" class="card-play" ${dub?'data-mp-dubbing-play':'data-play'}="${esc(t.id)}" aria-label="${title} 재생">${icon('ui-play-action',36)}</button>`:''}</div>
  <div class="mp-card-title">${profileWorkIcon(type,true)}<a href="${detail}" title="${title}">${title}</a>
  ${!dub&&canPlay&&(!mine||showManagement)?`<button type="button" class="card-more" data-track-menu="${esc(t.id)}" aria-label="${title} 더보기">${icon('ui-menu-action')}</button>`:''}</div>
  <small class="mp-card-nick" title="${esc(nickname||'')}">${dub?userNickname(nickname,{userId:t.owner_id}):trackPerformers(t)}</small>
  <div class="mp-card-actions">${mine&&showManagement?`<a class="mp-card-action" href="${dub?detail:'#manage/'+id}">관리</a>`:''}
  ${join?`<button type="button" class="mp-card-action mp-card-join" data-mp-work-join="${esc(key||(dub?'dubbing:':'track:')+t.id)}" ${join.reason?`disabled aria-describedby="${reasonId}"`:''}>참여하기</button><small id="${reasonId}" class="mp-join-reason" role="status">${esc(join.reason||'')}</small>`:''}</div></article>`;
}
function bindProfileWorkJoins(root,d){
 root.querySelectorAll('[data-mp-work-join]:not(:disabled)').forEach(button=>button.onclick=async()=>{
  const route=location.hash,status=button.parentElement.querySelector('.mp-join-reason');
  button.disabled=true;status.textContent='참여 가능 여부를 확인하고 있어요.';
  try{
   const current=await api('/api/producers/'+encodeURIComponent(d.profile.id)+'?dashboard=1&work_list=1','GET',undefined,{fresh:true});
   if(!button.isConnected||location.hash!==route)return;
   const work=profileWorkCatalog(current).find(w=>w.key===button.dataset.mpWorkJoin);
   const join=work&&profileWorkJoin(work);
   if(!join||join.reason){status.textContent=join?.reason||'모집이 마감되었거나 작품을 이용할 수 없어요.';return;}
   if(join.href){location.hash=join.href;return;}
   // Legacy dubbings claim an empty role through their existing API, then record.
   const {project:p}=await api('/api/dubbing/projects/'+encodeURIComponent(work.t.id),'GET',undefined,{fresh:true});
   if(!button.isConnected||location.hash!==route)return;
   if(p.removed||p.isOwner||!p.recordingAvailable||p.visibility!=='public'||!['recruiting','recording'].includes(p.state)||p.roles.some(r=>r.mine)||!p.roles.some(r=>!r.claimed)){
    status.textContent='현재 참여할 수 있는 배역이 없어요.';return;
   }
   dialog(`<div class="mypage-dialog"><h2>참여할 배역 선택</h2><p>${esc(p.title)}</p><div class="mp-join-roles">${p.roles.filter(r=>!r.claimed).map(r=>`<button type="button" class="small-button" data-mp-join-role="${esc(r.id)}">${esc(r.name)}</button>`).join('')}</div><p class="mp-join-feedback" role="status"></p></div>`);
   $('#dialog').querySelectorAll('[data-mp-join-role]').forEach(choice=>choice.onclick=async()=>{
    const choices=$('#dialog').querySelectorAll('[data-mp-join-role]'),feedback=$('#dialog .mp-join-feedback');
    choices.forEach(b=>b.disabled=true);
    try{await api('/api/dubbing/projects/'+encodeURIComponent(p.id)+'/claims/'+encodeURIComponent(choice.dataset.mpJoinRole),'POST',{revision:p.revision});$('#dialog').close();location.hash='dubbing/'+encodeURIComponent(p.id)+'?record=1';}
    catch(error){feedback.textContent=error.message;status.textContent=error.message;}
   });
   status.textContent='';button.disabled=false;
  }catch(error){if(button.isConnected){status.textContent=error.message||'참여 권한을 확인하지 못했어요.';button.disabled=true;}}
 });
}
function myWorksHTML(d,column='all'){
 const catalog=profileWorkCatalog(d);
 const section=(tab,limit)=>{
  const works=catalog.filter(w=>w.section===tab);
  return mySection(profileWorkTabs[tab].label,works.length?`<div class="mp-catalog-grid">${works.slice(0,limit).map(w=>profileWorkCard(w)).join('')}</div>`:myEmpty('아직 작품이 없어요.'),myAll(profileWorksHref(d,tab)),works.length,'mp-catalog-section mp-catalog-'+tab);
 };
 const own=isMyProfile(d.profile);
 if(column==='main')return `<div class="mp-work-main">${section('original',4)}${section('complete',3)}</div>`;
 if(column==='aside')return section('recruit',4);
 return `<div class="mp-work-shelves">
  <div>${section('original',4)}${section('complete',3)}</div>
  <div>${section('recruit',4)}${own?'':myStudioBanner()}</div>
 </div>`;
}
function profileWorksPage(d,q){
 const catalog=profileWorkCatalog(d),tab=Object.hasOwn(profileWorkTabs,q.get('tab'))?q.get('tab'):'all';
 const types=profileWorkTabs[tab].types,type=types.includes(q.get('type'))?q.get('type'):types[0];
 const own=isMyProfile(d.profile),back=own?'#profile':'#producer/'+encodeURIComponent(d.profile.id);
 return {profileWorks:{d,catalog,tab,type,query:q.get('q')||''},tracks:[...(d.tracks||[]),...(d.covers||[])],
  html:`<section class="mp-catalog-page"><header class="mp-catalog-heading"><a class="mp-back" href="${back}" aria-label="${esc(d.profile.name||'회원')} 프로필로 돌아가기">${icon('arrow',18)}</a><h1>${esc(d.profile.name||'회원')}의 작품</h1></header>
  <div class="mp-catalog-tools">
  <nav class="mp-catalog-tabs" aria-label="작품 상태">${Object.entries(profileWorkTabs).map(([key,{label}])=>`<a data-work-tab="${key}" href="${esc(profileWorksHref(d,key,type,q.get('q')))}" ${key===tab?'aria-current="page"':''}>${label} <span>${number(key==='all'?catalog.length:catalog.filter(w=>w.section===key).length)}</span></a>`).join('')}</nav>
  <button type="button" class="mp-search-toggle icon-button" aria-label="작품 검색 열기" aria-expanded="false" aria-controls="mp-work-search">${icon('search',18)}</button>
  <div class="mp-search-panel" id="mp-work-search"><label class="brand-search mp-work-search">${icon('search',18)}<input type="search" aria-label="${own?'내 작품':'작품'} 검색" placeholder="작품 검색" value="${esc(q.get('q')||'')}"></label><button type="button" class="mp-search-close icon-button" aria-label="작품 검색 닫기">${icon('plus',18)}</button></div>
  <select data-mp-types aria-label="작품 유형">${types.map(k=>`<option value="${k}" ${k===type?'selected':''}>${profileWorkTypes[k].label}</option>`).join('')}</select></div><div class="mp-catalog-results" aria-live="polite"></div></section>`};
}
function bindProfileWorks(s){
 const root=document.querySelector('.mp-catalog-page'),search=root.querySelector('input'),select=root.querySelector('[data-mp-types]');
 const toggle=root.querySelector('.mp-search-toggle');
 const expand=open=>{root.classList.toggle('mp-search-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'작품 검색 닫기':'작품 검색 열기');if(open)search.focus();else toggle.focus();};
 toggle.onclick=()=>expand(toggle.getAttribute('aria-expanded')!=='true');
 root.querySelector('.mp-search-close').onclick=()=>expand(false);
 search.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();expand(false);}};
 // Read the shared search control; do not change the top bar or its responsive rules.
 const globalSearch=document.querySelector('#global-search');
 const sizeSearch=()=>{const height=globalSearch?.getBoundingClientRect().height;root.style.setProperty('--mp-control-height',(height||42)+'px');};
 sizeSearch();
 const searchSize=myWorkSearchObserver=new ResizeObserver(()=>{if(!root.isConnected){searchSize.disconnect();return;}sizeSearch();});
 if(globalSearch)searchSize.observe(globalSearch);
 const paint=(updateURL=true)=>{
  const scoped=s.catalog.filter(w=>s.tab==='all'||w.section===s.tab),query=search.value.trim().toLocaleLowerCase();
  const items=scoped.filter(w=>(s.type==='all'||s.type===w.type)&&(!query||[w.t.title,w.nickname,w.t.original_title].some(v=>v?.toLocaleLowerCase().includes(query))));
  root.querySelector('.mp-catalog-results').innerHTML=items.length?`<div class="mp-catalog-grid">${items.map(w=>profileWorkCard(w,{showManagement:true})).join('')}</div>`:myEmpty(scoped.length?'검색 조건에 맞는 작품이 없어요.':'아직 작품이 없어요.');
  for(const link of root.querySelectorAll('[data-work-tab]'))link.href=profileWorksHref(s.d,link.dataset.workTab,s.type,search.value);
  if(updateURL){
   const href=profileWorksHref(s.d,s.tab,s.type,search.value);
   history.replaceState(history.state,'',href);$('#main').dataset.route=href.slice(1);window.AifectRender?.syncTarget();
  }
  icons();paintInteractions();bindProfileWorkJoins(root,s.d);
 };
 window.AifectDropdown.mount(select,{renderIcon:profileWorkIcon});
 select.onchange=()=>{s.type=select.value;paint();};
 search.oninput=()=>paint();paint(false);
}

function mySegment(active){return `<div class="mp-segment" role="tablist" aria-label="마이페이지" data-active="${active}"><span class="mp-segment-slide" aria-hidden="true"></span>${[['works','내 작품'],['library','내 보관함'],['activity','내 활동']].map(([key,label])=>`<button type="button" role="tab" id="mp-tab-${key}" aria-controls="mp-content" aria-selected="${active===key}" tabindex="${active===key?0:-1}" data-mp-tab="${key}">${label}</button>`).join('')}</div>`;}
function myWorksBanner(){return `<div class="mp-works-banner">${icon('sparkles',16)}<span>음악의 시작부터 완성까지, <span class="mp-works-banner-accent">나의 모든 작품을 한눈에.</span></span></div>`;}
async function myPageView(base,param,raw,readApi=api){
 if(base==='member'){
  const {profile}=await readApi('/api/members/'+encodeURIComponent(param));
  return {memberHeader:profile,html:`<div class="mypage-layout mp-member-page">${myProfileHeader({profile})}<p class="field-help">아직 공개한 음악이 없어요.</p></div>`};
 }
 if(base==='profile-gallery')return myGalleryView(param,readApi);
 if(base==='relations')return myRelationsView(readApi);
 if(base==='gift-inventory')return myGiftInventoryView(readApi);
 const full=(base==='profile'&&param==='works')||base==='profile-works';
 if(!full&&!((base==='profile'&&param!=='edit')||base==='producer'))return null;
 if(base==='profile'&&!me){returnRoute=location.hash;return {html:gate()};}
 let d;
 if(base==='profile'){
  const self=me.profile_id?{profile:{id:me.profile_id}}:await readApi('/api/me/profile','GET',undefined,{fresh:true});
  d=self.profile.id?await readApi('/api/producers/'+encodeURIComponent(self.profile.id)+'?dashboard=1&work_list=1','GET',undefined,{fresh:true}):{profile:self.profile,followers:self.follower_count,following_count:self.following_count,tracks:[],covers:[],dubbings:[],artists:[],gallery:[]};
 }else d=await readApi('/api/producers/'+encodeURIComponent(param)+'?dashboard=1&work_list=1','GET',undefined,{fresh:true});
 const own=isMyProfile(d.profile),q=new URLSearchParams(raw.split('?')[1]||''),tab=own&&['activity','library'].includes(q.get('view'))?q.get('view'):'works';
 if(full)return profileWorksPage(d,q);
 const collection=own&&tab==='library'?await myLibraryView(raw,readApi):own&&tab==='works'&&['covers','originals'].includes(q.get('section'))?await browseView('library',q.get('section'),raw,true,readApi):null;
 const state={d,own,tab,account:me?.id||'',activity:null};
 return {mypage:state,musicLibrary:collection?.musicLibrary,tracks:collection?.tracks||[...(d.tracks||[]),...(d.covers||[])],
  html:`<div class="mypage-layout mp-member-page mp-dashboard ${own?'mp-own':''}">${myProfileHeader(d)}
   <div class="mp-profile-collections">${myMoments(d)}${myArtists(d)}</div>
   ${own?mySegment(tab)+myWorksBanner():''}<div class="mp-main"><div id="mp-content" ${own?'role="tabpanel" aria-labelledby="mp-tab-'+tab+'"':''}>${collection?collection.html:tab==='works'?myWorksHTML(d,own?'main':'all'):myLoading()}</div></div>
   ${own?`<aside class="mp-aside" id="mp-aside"><div id="mp-aside-content">${collection?.libraryAside??(tab==='activity'?myLoading():myWorksHTML(d,'aside'))}</div>${myStudioBanner()}</aside>`:''}
   </div>`};
}
async function myActivityData(readApi=api){
 const paths={wallet:'/api/gold/balance',player:'/api/me/player',activity:'/api/me/profile?section=activity',inventory:'/api/me/gift-inventory'};
 return Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,path])=>{try{return [key,await readApi(path,'GET',undefined,{fresh:true})];}catch(e){return [key,{error:e.message}];}})));
}
function myError(d){return d?.error?`<p class="mp-empty" role="alert">${esc(d.error)} <button class="text-link" data-mp-retry>다시 시도</button></p>`:'';}
function myActivityHTML(a){
 const p=a.player?.player,owned=a.player?.inventory||[],items=a.inventory?.items||[];
 const balance=(label,v,unit,href,art)=>`<a class="mp-asset" href="${href}">${art}<span><small>${label}</small><strong>${Number.isFinite(v)?number(v):'—'} ${unit}</strong></span>${icon('chevron')}</a>`;
 const groups=inventoryGiftGroups(items);
 const decorations=[...(a.player?.stored_decorations||[]),...(a.player?.decorations||[])];
 const preview=[...owned.map(i=>`<a href="#inventory"><img src="${esc(i.artwork)}" alt="${esc(i.name)}"><small>${i.equipped?'사용 중':i.available?'사용 가능':'사용 제한'}</small></a>`),...decorations.map(i=>`<a href="#inventory"><img src="${esc(i.product.assetPaths.thumbnail||i.product.assetPaths.roomCard)}" alt="${esc(i.product.name)}"><small>${i.stored?'사용 전 보관':i.available?'사용 가능':'기간 만료'}</small></a>`),...groups.map(i=>`<a href="#inventory"><img src="${esc(i.image)}" alt="${esc(i.gift_name)}"><strong>× ${i.quantity}</strong></a>`)];
 return `<div class="mp-activity-grid">${mySection('보유 자산',`<div class="mp-assets">${balance('보유 골드',a.wallet?.balance,'G','#gold','<span class="gold-coin">G</span>')}${balance('보유 실버',a.wallet?.silver_balance,'S','#rewards','<img src="/assets/gifts/silver-coin-v1.webp" alt="">')}</div>${myError(a.wallet)}`,'',null,'mp-assets-card')}
 ${mySection('내 레벨',p?`<div class="mp-level"><strong>Lv.${p.level}</strong><span>${number(p.xp)} / ${p.next_xp===null?'MAX':number(p.next_xp)} XP</span></div><progress value="${p.progress}" max="1" aria-label="내 레벨 경험치"></progress>`:myError(a.player),myAll('#inventory','상세'),null,'mp-level-card')}
 ${mySection('인벤토리',myError(a.inventory)+myError(a.player)+(preview.length?`<div class="mp-items">${preview.slice(0,4).join('')}</div>`:!a.inventory?.error&&!a.player?.error?myEmpty('보유한 상품이 없어요.'):'') ,myAll('#inventory'),null,'mp-inventory-card')}</div>`;
}
function myRelationsRows(items,publicView=false){return items.length?`<div class="mp-relations">${items.map(r=>`<a class="mp-relation" href="${publicView?'#producer/'+esc(r.profile_id):'#relations'}"><span class="mp-mini-avatar">${avatarImage({id:r.profile_id,name:r.name,image_version:r.image_version})}</span><span><strong>${memberNickname(r)} ${icon('heart')}</strong><small>Lv.${r.level} · ${number(r.xp)} / ${r.next_xp===null?'MAX':number(r.next_xp)} XP</small><progress value="${r.progress}" max="1" aria-label="${esc(r.name)} 관계 경험치"></progress></span></a>`).join('')}</div>`:myEmpty('관계를 맺은 회원이 없어요. 프로필에서 관계를 신청해보세요.');}
function myActivityAside(d,a){
 const c=d.crew,received=a.activity?.received||[];
 const rows=items=>`<div class="mp-activity-rows">${items.join('')}</div>`;
 return mySection('내 크루',c?`<a class="mp-my-crew" href="#crew/${esc(c.id)}">${crewPicture(c,'crew-circle')}<span><strong>${crewNameHTML(c)}</strong><small>크루 멤버 ${number(c.members)}명</small></span>${icon('chevron')}</a><p class="mp-muted">${esc(c.description||'음악을 함께 나누는 우리 크루')}</p>`:myEmpty('현재 소속된 크루가 없어요.'),myAll(c?'#crew/'+c.id:'#community/crews?browse=1'))+
 mySection('받은 선물',myError(a.activity)||(received.length?rows(received.slice(0,3).map(g=>`<a href="${g.sender_profile_id?'#producer/'+esc(g.sender_profile_id):'#notifications?filter=gifts'}"><span class="mp-mini-avatar">${avatarImage({id:g.sender_profile_id,name:g.sender_name,image_version:g.image_version})}</span><span><strong>${userNickname(g.sender_name,{profileId:g.sender_profile_id,userId:g.sender_id})}</strong><small>${esc(g.gift_name||'선물')} × ${g.quantity}</small></span><time>${myDate(g.created)}</time></a>`)):myEmpty('아직 받은 선물이 없어요.')),myAll('#notifications?filter=gifts'))+
 mySection('보낸 선물 내역',`<a class="mp-all" href="#gold/history">받은 대상 · 선물 · 수량 · 보낸 날짜 ${icon('chevron')}</a>`)+
 mySection('계정 관리',`<nav class="mp-account-links"><a href="#membership">${icon('ticket')} 구독 · 이용권 관리 ${icon('chevron')}</a><a href="#payouts">${icon('wallet')} 정산 내역 ${icon('chevron')}</a></nav>`);
}
async function mySelectTab(tab,updateURL=true,readApi=api){
 const s=myPageState;if(!s?.own||s.account!==me?.id)return;
 if(updateURL){location.hash=myTabHref(tab);return;}
 s.tab=tab;const request=s.request=(s.request||0)+1;
 const segment=$('.mp-segment');segment.dataset.active=tab;segment.querySelectorAll('[role="tab"]').forEach(b=>{const active=b.dataset.mpTab===tab;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;});
 const content=$('#mp-content'),aside=$('#mp-aside-content');content.setAttribute('aria-labelledby','mp-tab-'+tab);content.removeAttribute('aria-busy');
 if(tab==='works'){content.innerHTML=myWorksHTML(s.d,'main');aside.innerHTML=myWorksHTML(s.d,'aside');routeTracks=remember([...(s.d.tracks||[]),...(s.d.covers||[])]);icons();paintInteractions();bindProfileWorkJoins(document.querySelector('.mp-dashboard'),s.d);syncSongCoverPlayback();return;}
 content.setAttribute('aria-busy','true');
 content.innerHTML=myLoading();aside.innerHTML=myLoading();
 try{
  const result=tab==='library'?await myLibraryView(location.hash.slice(1),readApi):await myActivityData(readApi);
  if(myPageState!==s||s.request!==request||s.tab!==tab||me?.id!==s.account||!content.isConnected)return;
  if(tab==='library'){content.innerHTML=result.html;aside.innerHTML=result.libraryAside;remember(result.tracks||[]);bindMusicLibrary(result.musicLibrary);}
  else{s.activity=result;content.innerHTML=myActivityHTML(result);aside.innerHTML=myActivityAside(s.d,result);routeTracks=[];}
  content.removeAttribute('aria-busy');icons();paintInteractions();
 }catch(e){if(myPageState===s&&s.request===request&&content.isConnected){content.removeAttribute('aria-busy');content.innerHTML=myEmpty(e.message);aside.innerHTML='';const retry=document.createElement('button');retry.className='small-button';retry.textContent='다시 시도';retry.onclick=()=>mySelectTab(tab,false);content.append(retry);}}
}
async function refreshMyPageRoute(raw,ticket,readApi=api,showCurrentTab){
 const s=myPageState,main=$('#main');
 if(!s?.own||s.account!==me?.id||!main?.querySelector('.mp-own')||!/^profile(?:\?|$)/.test(raw))return false;
 const q=new URLSearchParams(raw.split('?')[1]||''),tab=['activity','library'].includes(q.get('view'))?q.get('view'):'works';
 // Legacy works collections use their existing list view, not the dashboard fast path.
 if(['covers','originals'].includes(q.get('section'))||['covers','originals'].includes(new URLSearchParams((main.dataset.route||'').split('?')[1]||'').get('section')))return false;
 if(s.tab===tab)return false;
 main.dataset.route=raw;
 const pending=mySelectTab(tab,false,readApi);
 if(ticket===renderId)showCurrentTab?.();
 await pending;
 if(ticket===renderId&&myPendingTabFocus===tab)$('#mp-tab-'+tab)?.focus({preventScroll:true});myPendingTabFocus='';
 return true;
}
const profileMobileLayout=window.matchMedia?.('(max-width: 800px)');
function placeProfileArtists(){
 const page=document.querySelector('.mp-dashboard');
 if(!page)return;
 const artists=page.querySelector('.mp-artists-card'),studio=page.querySelector('.mp-studio');
 if(!artists||!studio)return;
 // Move the existing section so cards and delegated actions keep their identity.
 if(profileMobileLayout.matches){
  if(artists.nextElementSibling!==studio)studio.before(artists);
 }else{
  const collections=page.querySelector('.mp-profile-collections');
  if(artists.parentElement!==collections)collections.append(artists);
 }
}
profileMobileLayout?.addEventListener('change',placeProfileArtists);
function bindMyPage(view){
 myWorkSearchObserver?.disconnect();myWorkSearchObserver=null;
 const s=myPageState=view?.mypage||null,profile=s?.d.profile||view?.memberHeader;
 if(profile)bindMemberHeader(profile);
 if(view?.profileWorks)bindProfileWorks(view.profileWorks);
 if(!s){myPendingTabFocus='';return;}
 bindProfileWorkJoins(document.querySelector('.mp-dashboard'),s.d);
 if(profileMobileLayout)placeProfileArtists();
 if(s.tab==='activity')void mySelectTab('activity',false);
 if(view.musicLibrary)bindMusicLibrary(view.musicLibrary);
 if(myPendingTabFocus===s.tab)$('#mp-tab-'+s.tab)?.focus({preventScroll:true});
 myPendingTabFocus='';
}
document.addEventListener('keydown',e=>{
 const b=e.target.closest('[data-mp-tab]');if(!b||e.ctrlKey||e.metaKey||e.altKey||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=['works','library','activity'],i=tabs.indexOf(b.dataset.mpTab),key=tabs[e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];myPendingTabFocus=key;$('[data-mp-tab="'+key+'"]').focus({preventScroll:true});void mySelectTab(key);
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-mp-artist-add],[data-mp-tab],[data-mp-retry],[data-mp-artists],[data-mp-recent],[data-mp-dubbing-play]');if(!b)return;e.preventDefault();
 if(b.hasAttribute('data-mp-artist-add')){myArtistAddDialog();return;}
 if(b.dataset.mpTab){void mySelectTab(b.dataset.mpTab);return;}
 if(b.hasAttribute('data-mp-retry')){void mySelectTab('activity',false);return;}
 if(b.hasAttribute('data-mp-artists')){dialog('<div class="mypage-dialog"><h2>소속 아티스트</h2>'+identityCards(myPageState.d.artists||[],'artist')+'</div>');return;}
 if(b.dataset.mpDubbingPlay){b.disabled=true;try{const d=await api('/api/dubbing/projects/'+encodeURIComponent(b.dataset.mpDubbingPlay)),p=d.project||d,url=p.recording?.final?.audioUrl;if(!b.isConnected)return;if(url)myDubbingDialog(p,url);else location.hash='dubbing/'+b.dataset.mpDubbingPlay;}catch(err){toast(err.message);}finally{b.disabled=false;}}
});

function myDubbingDialog(p,url){
 audio.pause();
 dialog('<div class="mp-dub-dialog"><h2>'+esc(p.title)+'</h2><audio controls autoplay src="'+esc(url)+'" aria-label="완성된 더빙 듣기"></audio><a class="text-link" href="#dubbing/'+esc(p.id)+'">작품 상세</a></div>');
 const player=$('#dialog audio');$('#dialog').addEventListener('close',()=>{player.pause();player.removeAttribute('src');player.load();},{once:true});
}
document.addEventListener('click',e=>{if(e.target.closest('#dialog .mypage-dialog a[href^="#"],#dialog .mp-dub-dialog a[href^="#"]'))$('#dialog').close();});
window.addEventListener('hashchange',()=>{if($('#dialog .mp-dub-dialog')&&$('#dialog').open)$('#dialog').close();});
