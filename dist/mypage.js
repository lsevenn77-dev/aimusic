// Desktop composition reuses existing routes, media, playback and social actions.
let myPageState=null,myPendingTabFocus='';
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
 const frame={profile_frame:p.profile_frame,profile_frame_artwork:p.profile_frame_artwork};
 const followers=d.human_followers??Math.max(0,(d.followers||0)-(d.ai_followers||0));
 const stats=own?`<div class="mp-stats"><a href="#community/following?people=followers">팔로워 <b>${number(followers)}</b></a><a href="#community/following?people=following">팔로잉 <b>${number(d.profile_following_count??d.following_count??0)}</b></a><span title="공개된 원곡·커버·듀엣·완성 더빙">작품 <b>${number(d.profile_work_count??0)}</b></span><span title="내가 등록한 원곡 · 삭제 제외">제작곡 <b>${number(d.produced_track_count??(d.tracks||[]).length)}</b></span></div>`:'';
 return `<header class="mp-profile"><div class="mp-avatar-space"><div class="mp-avatar${playerAvatarClass(frame)}">${avatarImage(p)}${playerBadgeHTML(frame)}</div></div><div class="mp-identity">${own?'<p class="mp-category">ARTIST PROFILE</p>':''}<h2>${esc(p.name)}${p.account_type==='ai_bot'?'<span class="ai-account-badge" title="공식 AI 응원 계정">AI</span>':''}</h2>${p.account_type==='ai_bot'?'<p class="field-help">공식 AI 응원 계정</p>':''}<p class="mp-public-id">ID · ${esc(p.public_id||'발급 확인 중')}${p.public_id?` <button type="button" class="text-link" data-copy-public-id="${esc(p.public_id)}" aria-label="고유 ID 복사">${own?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>':'복사'}</button>`:''}</p><div class="mp-crew-line">${c?`<a href="#crew/${esc(c.id)}">${c.image_version?`<img src="/media/crew/${esc(c.id)}?v=${esc(c.image_version)}" alt="">`:icon('users')}${esc(c.name)}</a>`:'소속 크루 없음'}</div>${p.bio?`<p class="mp-profile-bio">${esc(p.bio)}</p>`:''}${own?stats:`<div class="mp-stats"><${own?'a href="#community/following?people=followers"':'span'} data-followers="producer/${esc(p.id||'')}" data-count="${Number(d.followers||0)}"><b data-follow-count>${number(d.followers||0)}</b> 팔로워${d.ai_followers?` · AI ${number(d.ai_followers)} 포함`:''}</${own?'a':'span'}><${own?'a href="#community/following?people=following"':'span'}><b>${number(d.following_count||0)}</b> 팔로잉</${own?'a':'span'}><span><b>${number(publicSongs)}</b> 공개곡</span></div>`}</div><div class="mp-profile-actions">${own?'<a class="primary-button" href="#profile/edit">프로필 수정</a><a class="small-button" href="#studio">스튜디오</a>':`<button class="primary-button" data-follow="producer/${esc(p.id)}" aria-pressed="${followed('producer',p.id)}">${followed('producer',p.id)?'팔로잉':'팔로우'}</button><a class="small-button" href="#dm/${esc(p.id)}">메시지</a><button type="button" class="small-button" data-profile-gift="${esc(p.id)}">선물하기</button><button class="mp-more" data-profile-preview="${esc(p.id)}" aria-label="프로필 더보기 · 선물·차단·신고">${icon('ui-menu-action')}</button>`}</div></header>`;
}
function myMoments(d){
 const photos=d.gallery||[],pid=d.profile.id,own=me?.id===d.profile.user_id;
 return mySection('갤러리',photos.length?`<div class="mp-moments">${photos.slice(0,10).map((p,i)=>`<button type="button" data-gallery-photo="${esc(p.url)}" data-photo-label="${esc(d.profile.name)} 사진 ${i+1}" aria-label="사진 ${i+1} 크게 보기"><img src="${esc(p.url)}" alt="${esc(d.profile.name)}의 순간 ${i+1}" loading="${i<5?'eager':'lazy'}"></button>`).join('')}</div>`:myEmpty(own?'아직 등록한 사진이 없어요. 전체보기에서 순간을 기록해보세요.':'공개된 사진이 없어요.'),pid?myAll('#profile-gallery/'+encodeURIComponent(pid)):myAll('#profile/edit'),photos.length,'mp-moments-card');
}
function myStudioBanner(){return `<section class="mp-card mp-studio"><h2>스튜디오</h2><p>나만의 음악과 더빙을<br>제작하고 관리해보세요.</p><a class="primary-button" href="#studio">스튜디오 바로가기 ${icon('arrow')}</a></section>`;}
function myArtists(d){
 const artists=d.artists||[],own=me?.id===d.profile.user_id;
 const slots=artists.slice(0,3).map(a=>`<a class="artist-ui-card mp-artist-card" href="#artist/${esc(a.id)}"><div class="artist-avatar-wrapper">${portrait(a,'artist')}</div><strong title="${esc(a.name)}">${esc(a.name)}</strong>${artistAffiliation(a,d.profile.name)}</a>`);
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

function myTrackCard(t,compact=false){
 if(t.kind!=='dubbing'&&(!t.status||t.status==='published'))return playMusicCard(t,null);
 if(t.kind==='dubbing')return playDubbingCard({...t,ownerName:t.owner_name||'',genres:t.genres||[]});
 const dub=t.kind==='dubbing',published=dub?t.visibility==='public':!t.status||t.status==='published',href=dub?'#dubbing/'+esc(t.id):published?'#song/'+esc(t.id):'#manage/'+esc(t.id),own=me?.id===(t.user_id||t.owner_id);
 const title=String(t.title||'').replace(/\s*\((?:Cover|Duet|더빙)\)\s*$/i,'');
 return `<article class="mp-work ${compact?'mp-work-compact':''}"><div class="mp-work-art"><a href="${href}" aria-label="${esc(title)} 상세">${dub?`<div class="mp-dubbing-art">${myKindIcon('dubbing')}<span>${esc((t.genres||[]).join(' · '))}</span></div>`:cover(t)}</a>${dub&&t.state==='complete'?`<button class="mp-play" data-mp-dubbing-play="${esc(t.id)}" aria-label="${esc(title)} 재생">${icon('ui-play-action')}</button>`:!dub&&published?`<button class="mp-play" data-play="${esc(t.id)}" aria-label="${esc(title)} 재생">${icon('ui-play-action')}</button>`:''}</div><div class="mp-work-copy"><div class="mp-title"><a href="${href}">${compact?'':myKindIcon(myKind(t))}<span>${esc(title)}</span></a>${!dub&&published?`<button class="mp-more" data-track-menu="${esc(t.id)}" aria-label="${esc(title)} 더보기">${icon('ui-menu-action')}</button>`:''}</div><div class="mp-work-meta"><span>${dub?({complete:'완성',recording:'녹음 중',recruiting:'참여 모집'}[t.state]||'작성 중'):icon('ui-plays')+number(t.plays||0)}</span><span class="${published?'mp-public':'mp-private'}">${published?'공개':'비공개'}</span></div>${own?`<a class="mp-manage" href="${dub?href:'#manage/'+esc(t.id)}">관리</a>`:''}</div></article>`;
}
function myWorksHTML(d){
 const all=[...(d.covers||[]),...(d.dubbings||[])],counts={all:all.length,cover:0,duet:0,dubbing:0};all.forEach(t=>counts[myKind(t)]++);
 return mySection('제작곡',d.tracks?.length?`<div class="mp-originals home-music-grid">${d.tracks.slice(0,3).map(t=>myTrackCard(t,true)).join('')}</div>`:myEmpty('등록된 제작곡이 없어요.'),myAll('#producer-songs/'+encodeURIComponent(d.profile.id)),d.tracks?.length||0)+
 mySection('커버 · 듀엣 · 더빙',`<div class="mp-work-controls"><div class="mp-filters" role="group" aria-label="작품 종류">${[['all','전체'],['cover','커버'],['duet','듀엣'],['dubbing','더빙']].map(([key,label])=>`<button data-mp-filter="${key}" aria-pressed="${key==='all'}">${label} <span>${counts[key]}</span></button>`).join('')}</div><label class="sr-only" for="mp-sort">작품 정렬</label><select data-dropdown="md" id="mp-sort"><option value="recent">최신순</option><option value="plays">재생순</option></select>${me?.id===d.profile.user_id?'<label class="sr-only" for="mp-visibility">작품 공개 범위</label><select data-dropdown="md" id="mp-visibility"><option value="all">모든 공개 범위</option><option value="public">공개</option><option value="private">비공개</option></select>':''}</div><div class="inline-actions"><a class="text-link" href="${esc(opportunityHref(d.profile.id,'duet'))}">참여 가능 · 듀엣</a><a class="text-link" href="${esc(opportunityHref(d.profile.id,'dubbing'))}">참여 가능 · 더빙</a></div>${me?.id===d.profile.user_id?castingMineTabs(''):''}<div id="mp-recordings" class="mp-recordings mp-work-list">${all.length?all.sort((a,b)=>b.created-a.created).map(t=>myWorkItemHTML(t)).join(''):myEmpty('아직 등록된 커버·듀엣·더빙이 없어요.')}</div>`, '',all.length);
}
function myWorkItemHTML(t,child=false){
 const dub=t.kind==='dubbing',id=esc(t.id),title=esc(t.title),published=!t.status||t.status==='published';
 const expandable=!child&&(t.completions||0)>0;
 let row;
 if(!dub&&published){
  row=songCoverRowHTML(t,{child,invitation:!child&&t.cover_mode==='duet'&&!t.duet_parent_id,profile:true});
  row=row.replace('data-cover-children=', 'data-mp-children=').replace('aria-controls="cover-children-', 'aria-controls="mp-children-');
 }else{
  const href=dub?'#dubbing/'+id:'#manage/'+id;
  const metadata=[t.performers||t.owner_name||t.producer,dub?'더빙':'커버',dub?({complete:'완성',recording:'녹음 중',recruiting:'참여 모집'}[t.state]||'작성 중'):'비공개 · '+({hidden:'비공개',processing:'처리 중',uploading:'업로드 중',failed:'처리 실패'}[t.status]||'작성 중')].filter(Boolean).join(' · ');
  const art=dub?`<img src="${esc(AifectDubbing.dubbingGenreArtwork(t.genres||[]))}" alt="" loading="lazy">`:cover(t,'mini-cover');
  row=`<article data-list-row class="song-cover-row${child?' song-cover-child':''}"><a class="song-cover-detail" href="${href}" aria-label="${title} 상세 보기"><span class="song-cover-art">${art}</span><span class="song-cover-copy"><strong title="${title}">${title}</strong><span class="song-cover-meta" title="${esc(metadata)}">${esc(metadata)}</span></span></a>
   ${!child?`<button type="button" class="list-action count-dropdown song-cover-expand" ${expandable?`data-mp-children="${id}" aria-controls="mp-children-${id}"`:'disabled'} aria-expanded="false"><span>${number(t.completed_participants||0)}</span><span class="sr-only">명 참여</span><span data-cover-arrow aria-hidden="true">${icon('ui-chevron')}</span></button>`:''}
   <div class="list-actions">
   ${!child&&t.can_join?`<a class="list-action primary-button song-cover-join" href="${href}" title="${title} 참여하기" aria-label="${title} 참여하기">${icon('ui-plus-action')}</a>`:''}
   ${dub&&t.state==='complete'?`<button type="button" class="list-action song-cover-play" data-mp-dubbing-play="${id}" title="${title} 재생" aria-label="${title} 재생">${icon('ui-play-action')}</button>`:''}
   <button type="button" class="list-action song-cover-more" data-mp-work-menu="${id}" data-mp-work-href="${href}" data-mp-work-title="${title}" aria-label="${title} 더보기" aria-haspopup="dialog">${icon('ui-menu-action')}</button></div></article>`;
 }
 return `<div class="mp-work-group" data-mp-work="${id}" data-mp-kind="${dub?'dubbing':'duet'}" data-mp-original="${esc(t.original_id||'')}">${row}${expandable?`<div class="song-cover-children" id="mp-children-${id}" hidden></div>`:''}</div>`;
}
let myWorkListBound=false;
function bindMyWorkList(){
 if(myWorkListBound)return;myWorkListBound=true;
 for(const event of ['play','pause','ended','emptied','loadedmetadata'])audio.addEventListener(event,syncSongCoverPlayback);
 document.addEventListener('click',async e=>{
  const control=e.target.closest('#mp-recordings button,#mp-recordings a');if(control)e.stopPropagation();
  const menu=e.target.closest('[data-mp-work-menu]');
  if(menu){
   e.preventDefault();e.stopPropagation();
   const href=menu.dataset.mpWorkHref;
   dialog(`<div class="mypage-dialog"><h2>${esc(menu.dataset.mpWorkTitle)}</h2><div class="dialog-actions"><a class="small-button" href="${esc(href)}">${href.startsWith('#manage/')?'작품 관리':'작품 상세'}</a></div></div>`);
   return;
  }
  const b=e.target.closest('[data-mp-children],[data-mp-child-more]');if(!b||b.disabled)return;
  e.preventDefault();e.stopPropagation();
  const group=b.closest('.mp-work-group'),target=group.querySelector('.song-cover-children'),toggle=group.querySelector('[data-mp-children]');
  if(b===toggle&&target.dataset.loaded){setSongCoverExpanded(toggle,target,target.hidden);return;}
  const dub=group.dataset.mpKind==='dubbing',offset=b.dataset.mpChildMore||0;
  b.disabled=true;b.setAttribute('aria-busy','true');
  try{
   const url=dub?'/api/dubbing/projects/'+encodeURIComponent(group.dataset.mpWork)+'/completed?offset='+offset:'/api/tracks/'+encodeURIComponent(group.dataset.mpOriginal)+'/covers?view=children&parent='+encodeURIComponent(group.dataset.mpWork)+'&offset='+offset;
   const d=await api(url);if(!group.isConnected)return;
   const items=dub?d.items:d.covers;if(!dub)remember(items);
   const html=items.map(t=>myWorkItemHTML(t,true)).join('')+(d.next_offset==null?'':`<button type="button" class="small-button" data-mp-child-more="${d.next_offset}">더 보기</button>`);
   if(b===toggle){target.innerHTML=items.length?`<h3>완성된 참여작 ${number(d.total)}개</h3>${html}`:myEmpty('아직 공개된 완성 참여작이 없어요.');target.dataset.loaded='true';setSongCoverExpanded(toggle,target,true);}
   else{b.insertAdjacentHTML('beforebegin',html);b.remove();}
   icons();paintInteractions();syncSongCoverPlayback();
  }catch(err){toast(err.message);}finally{b.disabled=false;b.removeAttribute('aria-busy');}
 });
}
function myWorksAside(d,own){return myArtists(d)+(own?'':myStudioBanner())+mySection('참여 가능한 듀엣','<div id="mp-open-duets">'+myLoading()+'</div>',myAll(opportunityHref(d.profile.id,'duet')))+mySection('참여 가능한 더빙','<div id="mp-open-dubbing">'+myLoading()+'</div>',myAll(opportunityHref(d.profile.id,'dubbing')));}
function mySegment(active){return `<div class="mp-segment" role="tablist" aria-label="마이페이지" data-active="${active}"><span class="mp-segment-slide" aria-hidden="true"></span>${[['works','내 작품'],['library','내 보관함'],['activity','내 활동']].map(([key,label])=>`<button type="button" role="tab" id="mp-tab-${key}" aria-controls="mp-content" aria-selected="${active===key}" tabindex="${active===key?0:-1}" data-mp-tab="${key}">${label}</button>`).join('')}</div>`;}
async function myPageView(base,param,raw,readApi=api){
 if(base==='profile-gallery')return myGalleryView(param,readApi);
 if(base==='relations')return myRelationsView(readApi);
 if(base==='gift-inventory')return myGiftInventoryView(readApi);
 if(!((base==='profile'&&param!=='edit')||base==='producer'))return null;
 if(base==='profile'&&!me){returnRoute=location.hash;return {html:gate()};}
 let d;
 if(base==='profile'){
  const self=await readApi('/api/me/profile','GET',undefined,{fresh:true});
  d=self.profile.id?await readApi('/api/producers/'+encodeURIComponent(self.profile.id)+'?dashboard=1','GET',undefined,{fresh:true}):{profile:self.profile,followers:self.follower_count,following_count:self.following_count,tracks:[],covers:[],dubbings:[],artists:[],gallery:[]};
 }else d=await readApi('/api/producers/'+encodeURIComponent(param)+'?dashboard=1','GET',undefined,{fresh:true});
 const own=me?.id===d.profile.user_id,q=new URLSearchParams(raw.split('?')[1]||''),tab=own&&['activity','library'].includes(q.get('view'))?q.get('view'):'works';
 const collection=own&&tab==='library'?await myLibraryView(raw,readApi):own&&tab==='works'&&['covers','originals'].includes(q.get('section'))?await browseView('library',q.get('section'),raw,true,readApi):null;
 const state={d,own,tab,account:me?.id||'',activity:null};
 return {mypage:state,musicLibrary:collection?.musicLibrary,tracks:collection?.tracks||[...(d.tracks||[]),...(d.covers||[])],html:`<div class="mypage-layout ${own?'mp-own':''}"><div class="mp-main">${own?'':`<div class="mp-heading">${heading('마이','나의 순간과 음악이 만나는 공간')}</div>`}${myProfileHeader(d)}${myMoments(d)}${own?mySegment(tab):''}<div id="mp-content" ${own?'role="tabpanel" aria-labelledby="mp-tab-'+tab+'"':''}>${collection?collection.html:tab==='works'?myWorksHTML(d):myLoading()}</div></div><aside class="mp-aside" id="mp-aside">${own?'<div id="mp-aside-content">'+(collection?.libraryAside??(tab==='activity'?myLoading():myWorksAside(d,true)))+'</div>':myWorksAside(d,false)}</aside>${own?'<div class="mp-account-footer"><button type="button" class="small-button" id="logout">로그아웃</button></div>':''}</div>`};
}
async function myActivityData(readApi=api){
 const paths={wallet:'/api/gold/balance',player:'/api/me/player',activity:'/api/me/profile?section=activity',notifications:'/api/notifications',inventory:'/api/me/gift-inventory'};
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
async function mySelectTab(tab,updateURL=true,readApi=api){
 const s=myPageState;if(!s?.own||s.account!==me?.id)return;
 if(updateURL){location.hash=myTabHref(tab);return;}
 s.tab=tab;const request=s.request=(s.request||0)+1;
 const segment=$('.mp-segment');segment.dataset.active=tab;segment.querySelectorAll('[role="tab"]').forEach(b=>{const active=b.dataset.mpTab===tab;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;});
 const content=$('#mp-content'),aside=$('#mp-aside-content');content.setAttribute('aria-labelledby','mp-tab-'+tab);content.removeAttribute('aria-busy');
 if(tab==='works'){content.innerHTML=myWorksHTML(s.d);aside.innerHTML=myWorksAside(s.d,true);routeTracks=remember([...(s.d.tracks||[]),...(s.d.covers||[])]);void myLoadOpportunities(s);icons();paintInteractions();syncSongCoverPlayback();return;}
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
async function refreshMyPageRoute(raw,ticket,readApi=api){
 const s=myPageState,main=$('#main');
 if(!s?.own||s.account!==me?.id||!main?.querySelector('.mp-own')||!/^profile(?:\?|$)/.test(raw))return false;
 const q=new URLSearchParams(raw.split('?')[1]||''),tab=['activity','library'].includes(q.get('view'))?q.get('view'):'works';
 // Legacy works collections use their existing list view, not the dashboard fast path.
 if(['covers','originals'].includes(q.get('section'))||['covers','originals'].includes(new URLSearchParams((main.dataset.route||'').split('?')[1]||'').get('section')))return false;
 if(s.tab===tab)return false;
 main.dataset.route=raw;await mySelectTab(tab,false,readApi);
 if(ticket===renderId&&myPendingTabFocus===tab)$('#mp-tab-'+tab)?.focus({preventScroll:true});myPendingTabFocus='';
 return true;
}
async function myLoadOpportunities(s){await Promise.all(['duet','dubbing'].map(async type=>{const root=$(type==='duet'?'#mp-open-duets':'#mp-open-dubbing');if(!root)return;try{const d=await api('/api/producers/'+encodeURIComponent(s.d.profile.id)+'/opportunities?type='+type);if(myPageState!==s||!root.isConnected)return;root.innerHTML=opportunityCards(d.items.slice(0,3),type);}catch(e){if(root.isConnected)root.innerHTML=myEmpty(e.message);}}));}
function bindMyPage(view){bindMyWorkList();syncSongCoverPlayback();if(!view?.mypage){myPendingTabFocus='';return;}const s=view.mypage;myPageState=s;if(s.tab==='activity')void mySelectTab('activity',false);if(view.musicLibrary)bindMusicLibrary(view.musicLibrary);else void myLoadOpportunities(s);if(myPendingTabFocus===s.tab)$('#mp-tab-'+s.tab)?.focus({preventScroll:true});myPendingTabFocus='';}
function myFilterWorks(){
 const root=$('#mp-recordings');if(!root||!myPageState)return;const key=$('[data-mp-filter][aria-pressed="true"]')?.dataset.mpFilter||'all',visibility=$('#mp-visibility')?.value||'all',sort=$('#mp-sort')?.value;
 const items=[...(myPageState.d.covers||[]),...(myPageState.d.dubbings||[])].filter(t=>(key==='all'||myKind(t)===key)&&(visibility==='all'||(t.kind==='dubbing'?t.visibility==='public':t.status==='published')===(visibility==='public'))).sort((a,b)=>(sort==='plays'?(b.plays||0)-(a.plays||0):0)||b.created-a.created);
 root.innerHTML=items.length?items.map(t=>myWorkItemHTML(t)).join(''):myEmpty('선택한 조건에 맞는 작품이 없어요.');
 syncSongCoverPlayback();
}
document.addEventListener('change',e=>{if(e.target.matches('#mp-sort,#mp-visibility'))myFilterWorks();});
document.addEventListener('keydown',e=>{
 const b=e.target.closest('[data-mp-tab]');if(!b||e.ctrlKey||e.metaKey||e.altKey||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=['works','library','activity'],i=tabs.indexOf(b.dataset.mpTab),key=tabs[e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];myPendingTabFocus=key;$('[data-mp-tab="'+key+'"]').focus({preventScroll:true});void mySelectTab(key);
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-mp-artist-add],[data-mp-tab],[data-mp-filter],[data-mp-retry],[data-mp-opportunity-retry],[data-mp-originals],[data-mp-artists],[data-mp-recent],[data-mp-dubbing-play]');if(!b)return;e.preventDefault();
 if(b.hasAttribute('data-mp-artist-add')){myArtistAddDialog();return;}
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
