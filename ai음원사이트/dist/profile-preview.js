// All identity text shares this dialog; explicit page/action links keep their actions.
let profilePreviewSerial=0,profilePreviewDialog=null,profilePreviewOrigin=null,profilePreviewOverflow='';
const profilePreviewSVG=path=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>';
const profilePreviewIcons={
 follow:profilePreviewSVG('M15 21H3v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 4 2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M19 14v8m-4-4h8'),
 edit:profilePreviewSVG('m15 4 5 5M3 21l5-1L21 7a2 2 0 0 0-5-5L3 15z'),
 share:profilePreviewSVG('M12 16V2m-4 4 4-4 4 4M7 10H4v12h16V10h-3'),
 close:profilePreviewSVG('m5 5 14 14M19 5 5 19')
};
function memberProfileShareBody(p){
 const route=p.id?'producer/'+encodeURIComponent(p.id):p.public_id?'member/'+encodeURIComponent(p.public_id):'';
 return route?String(p.name||'회원')+'님의 프로필\nhttps://aifect.co.kr/#'+route:'';
}
async function sendProfileShareBatch(batch,people,send=api,canContinue=()=>true){
 if(batch.sending)return null;
 batch.sending=true;const failed=[];
 try{
  for(const person of people){
   if(!canContinue())break;
   const id=person.profile_id;if(!id||batch.sent.has(id))continue;
   if(!batch.requests.has(id))batch.requests.set(id,crypto.randomUUID());
   try{await send('/api/dm/'+encodeURIComponent(id),'POST',{body:batch.body,request_id:batch.requests.get(id)});batch.sent.add(id);}
   catch(error){failed.push({id,name:person.name,message:error.message||'전송하지 못했습니다.'});}
  }
  return failed;
 }finally{batch.sending=false;}
}
async function shareMemberProfile(p,popover){
 if(!me){popover?.hidePopover();return askLogin();}
 const body=memberProfileShareBody(p);if(!body){popover?.hidePopover();toast('프로필을 먼저 저장해 주세요.');return;}
 if(profilePreviewDialog)closeProfilePreview();
 const html=`<section class="profile-share-panel"><h2>프로필 공유</h2>
  <p class="profile-share-summary">${esc(p.name||'회원')}님의 프로필을 보낼 팔로워를 선택하세요.</p>
  <form id="profile-share-form"><label class="brand-search profile-share-search">${icon('search')}<input type="text" inputmode="search" enterkeyhint="search" name="q" maxlength="100" placeholder="팔로워 검색" aria-label="팔로워 검색"></label>
  <div class="profile-share-people" role="group" aria-label="공유할 팔로워 선택"></div>
  <button type="button" class="small-button" data-profile-share-more hidden>더보기</button>
  <p class="profile-share-result" role="status"></p><p class="form-error" role="alert"></p>
  <div class="profile-share-actions"><span data-profile-share-count aria-live="polite">0명 선택</span><button type="button" class="primary-button" data-profile-share-send disabled>전송</button></div></form></section>`;
 if(popover)popover.innerHTML=html;else dialog(html);
 const panel=popover||$('#dialog'),form=panel.querySelector('form'),list=form.querySelector('.profile-share-people'),submit=form.querySelector('[data-profile-share-send]'),more=form.querySelector('[data-profile-share-more]'),result=form.querySelector('[role=status]'),error=form.querySelector('[role=alert]'),uid=me.id;
 const selected=new Map(),people=new Map(),batch={body,requests:new Map(),sent:new Set(),sending:false};
 let alive=true,searchAbort,timer,next=null;
 const active=()=>alive&&form.isConnected&&(popover?popover.matches(':popover-open'):panel.open)&&uid===me?.id;
 const count=()=>{form.querySelector('[data-profile-share-count]').textContent=selected.size+'명 선택';submit.disabled=batch.sending||!selected.size;submit.textContent=batch.sending?'전송 중…':'전송';};
 const paint=()=>{
  list.innerHTML=[...people.values()].map(person=>{
   const pid=person.profile_id,sent=batch.sent.has(pid);
   return `<label class="profile-share-person"><input type="checkbox" data-profile-share-person="${esc(pid||person.key)}" ${pid&&!sent&&!batch.sending?'':'disabled'} ${selected.has(pid)?'checked':''}>${avatarImage({id:pid,name:person.name,image_version:person.image_version},'producer',false,false)}<span>${esc(person.name)}${sent?'<small>전송 완료</small>':pid?'':'<small>메시지를 받을 수 없는 프로필</small>'}</span></label>`;
  }).join('')||(form.elements.q.value.trim()?'<p class="field-help">검색된 팔로워가 없습니다.</p>':'<p class="field-help">아직 팔로워가 없습니다.</p>');
  more.hidden=next===null;count();
 };
 const load=async append=>{
  searchAbort?.abort();const controller=searchAbort=new AbortController();more.disabled=true;
  if(!append){people.clear();list.textContent='팔로워 목록을 불러오는 중…';more.hidden=true;}
  try{
   const query=new URLSearchParams({tab:'followers',sort:'name',q:form.elements.q.value.trim(),offset:append?next:0});
   const data=await api('/api/follow-management?'+query,'GET',undefined,{signal:controller.signal,fresh:true});
   if(!active()||controller.signal.aborted)return;
   next=data.next??null;for(const person of data.items)people.set(person.profile_id||person.key,person);more.textContent='더보기';paint();
  }catch(e){if(active()&&!controller.signal.aborted){if(!append)list.textContent='팔로워 목록을 불러오지 못했습니다.';more.textContent='다시 불러오기';more.hidden=false;toast(e.message);}}
  finally{if(active()&&!controller.signal.aborted)more.disabled=false;}
 };
 form.elements.q.oninput=()=>{clearTimeout(timer);searchAbort?.abort();more.hidden=true;timer=setTimeout(()=>load(false),180);};
 more.onclick=()=>{more.textContent='더보기';void load(people.size>0);};
 list.onchange=e=>{
  const input=e.target.closest('[data-profile-share-person]'),person=input&&people.get(input.dataset.profileSharePerson);
  if(!person?.profile_id||batch.sending||batch.sent.has(person.profile_id))return;
  if(input.checked)selected.set(person.profile_id,person);else selected.delete(person.profile_id);count();
 };
 // Search/IME Enter must never send a message; only the explicit send control does.
 form.onsubmit=event=>{event.preventDefault();clearTimeout(timer);void load(false);};
 submit.onclick=async()=>{
  if(batch.sending||!selected.size||!active())return;
  error.textContent='';const recipients=[...selected.values()];
  popover?.setAttribute('aria-busy','true');
  let failed;
  try{
   const pending=sendProfileShareBatch(batch,recipients,api,active);paint();
   failed=await pending;
  }finally{popover?.removeAttribute('aria-busy');}
  if(!active()||failed===null){
   if(failed?.length&&uid===me?.id&&panel.isConnected)toast(failed[0].message);
   return;
  }
  for(const id of batch.sent)selected.delete(id);
  result.textContent=batch.sent.size+'명에게 프로필을 보냈습니다.';
  if(failed.length)error.textContent=failed.map(person=>person.name+': '+person.message).join(' / ')+' 실패한 대상은 다시 전송할 수 있습니다.';
  paint();if(typeof refreshMessageBadge==='function')void refreshMessageBadge();
 };
 const closed=popover?'beforetoggle':'close';
 const dispose=registerRouteCleanup(()=>{
  alive=false;clearTimeout(timer);searchAbort?.abort();panel.removeEventListener(closed,dispose);
  if(popover)form.closest('section')?.remove();
  else if(panel.open&&form.isConnected)panel.close();
 });
 panel.addEventListener(closed,dispose,{once:true});
 if(popover&&matchMedia('(min-width:801px)').matches)form.elements.q.focus({preventScroll:true});
 await load(false);
}

function closeProfilePreview(reason,restoreFocus=true){
 ++profilePreviewSerial;
 if(!profilePreviewDialog)return;
 const panel=profilePreviewDialog;profilePreviewDialog=null;
 const room=typeof voiceController!=='undefined'?voiceController:null;
 if(room?.talkPopup===panel){room.talkPopup=null;room.popupTrigger=null;document.documentElement.removeAttribute('data-room-popup');}
 panel.close();panel.remove();
 document.body.style.overflow=profilePreviewOverflow;
 if(restoreFocus&&profilePreviewOrigin?.isConnected)profilePreviewOrigin.focus({preventScroll:true});
 profilePreviewOrigin=null;
 if(reason==='dismiss')document.dispatchEvent(new Event('aifect-profile-dismiss'));
}
function profileFollowButton(key,following,followsViewer,managementAction=null){
 const mutual=following&&followsViewer&&!key.startsWith('artist/');
 const label=following?(mutual?'맞팔중':'팔로우중'):followsViewer&&!key.startsWith('artist/')?'맞팔로우':'팔로우';
 return `<button type="button" class="primary-button" data-follow-presentation="profile" data-follows-viewer="${!!followsViewer}" data-follow="${esc(key)}" aria-pressed="${!!following}" aria-label="${label+(following?', 팔로우 취소':'')}" ${managementAction!==null?'data-fm-relation':''} ${managementAction?'data-fm="'+managementAction+'"':''}>${profilePreviewIcons.follow}<span data-follow-label>${label}</span></button>`;
}
function profilePreviewActions(d, own) {
 const p=d.profile, id=encodeURIComponent(p.id||''), artist=!!d.artist;
 if(own&&!artist)return `<a class="primary-button" href="#profile/edit">${profilePreviewIcons.edit}<span>프로필 수정</span></a><button type="button" class="small-button" data-preview-share="${esc(p.id||'')}">${profilePreviewIcons.share}<span>공유</span></button><a class="small-button" href="#profile">${icon('chevron')}<span>내 페이지</span></a>`;
 if(!p.id)return p.public_id?`<a class="small-button" href="#member/${esc(p.public_id)}">프로필 보기</a>`:'';
 const fan='#artist/'+id, following=!!d.following;
 return `${profileFollowButton((artist?'artist/':'producer/')+p.id,following,!artist&&d.follows_viewer)}
 <a class="small-button" href="${artist?fan+'?tab=lounge&amp;compose=1':'#dm/'+id}" ${artist?'data-preview-lounge':'data-preview-message'}>${icon('message')}<span>${artist?'응원글':'메시지'}</span></a>
 <a class="small-button" href="${artist?fan:'#producer/'+id}">${icon('chevron')}<span>${artist?'팬페이지':'더보기'}</span></a>
 <button type="button" class="small-button" data-preview-gift="${esc(p.id)}">${icon('gift')}<span>선물 보내기</span></button>`;
}
function profilePreviewHTML(d){
 const p=d.profile, artist=!!d.artist, own=!!me&&p.user_id===me.id, kind=artist?'artist':'producer';
 const tools=artist?'':own?'<span class="profile-preview-own">내 프로필</span>':`<button type="button" data-preview-report>신고</button><span aria-hidden="true">|</span><button type="button" data-person-block="${esc(p.user_id)}" data-block-name="${esc(p.name)}">차단</button>`;
 const followers=artist?'tab=artists&amp;artist='+encodeURIComponent(p.id):'tab=followers&amp;user='+encodeURIComponent(p.user_id);
 const affiliation=artist&&p.producer_name?`<span class="preview-affiliation"><span title="${esc(p.producer_name)}">${userNickname(p.producer_name,{profileId:p.producer_id})}</span> 소속</span>`:'';
 const crew=!artist&&d.crew?`<a class="profile-preview-crew" href="#crew/${encodeURIComponent(d.crew.id)}" title="${esc(d.crew.name)}">${d.crew.badge_url?`<img src="${esc(d.crew.badge_url)}" alt="크루 레벨 ${Number(d.crew.level)}" width="14" height="14">`:''}<span>${esc(d.crew.name)}</span></a>`:'';
 return `<section class="profile-preview-card" data-profile-kind="${artist?'artist':'user'}">
 <div class="profile-preview-image-slot"><button type="button" class="profile-preview-photo${playerAvatarClass(p)}" aria-label="프로필 사진 크게 보기">${avatarImage(p,kind,false)}${playerBadgeHTML(p)}</button></div>
 <div class="profile-preview-info"><header class="profile-preview-header">
 <h2 id="profile-preview-title"${artist?'':premiumNameAttribute(p.id,p.user_id)} title="${esc(p.name)}">${esc(p.name)}</h2>
 <div class="profile-preview-tools">${tools}<button type="button" class="profile-preview-close" data-preview-close aria-label="프로필 미리보기 닫기">${profilePreviewIcons.close}</button></div></header>
 ${artist?'':`<p class="mp-public-id">ID · ${esc(p.public_id||'발급 확인 중')}</p>`}
 <p class="profile-preview-bio" title="${esc(p.bio||'')}">${esc(p.bio||'')}</p>
 <div class="profile-preview-stats"><a class="preview-count" href="#follow?${followers}" data-followers="${kind}/${esc(p.id||'')}" data-count="${Number(d.followers||0)}" ${d.ai_followers?'title="AI 팔로워 '+number(d.ai_followers)+'명 포함"':''}><strong data-follow-count>${number(d.followers||0)}</strong> 팔로워</a>
 ${artist?affiliation:`<a class="preview-count" href="#follow?tab=following&amp;user=${encodeURIComponent(p.user_id)}"><strong>${number(d.following_count||0)}</strong> 팔로잉</a>${crew}`}</div></div>
 <nav class="profile-preview-actions" aria-label="프로필 작업">${profilePreviewActions(d,own)}</nav></section>`;
}
async function openProfilePreview(id,origin){
 closeProfilePreview();const serial=profilePreviewSerial,route=location.hash;
 const originRoom=typeof voiceController!=='undefined'&&voiceController?.joined?voiceController:null;
 const roomTicket=originRoom?.settingsTicket;
 await accountReady;const uid=me?.id,revision=followRevision;
 try{
  let d;
  if(id==='self'){
   if(!me)return askLogin();
   if(me.profile_id)id=me.profile_id;
   else{const own=await api('/api/me/profile');d={profile:own.profile,followers:own.follower_count,ai_followers:own.ai_followers,following_count:own.following_count,crew:null};}
  }
  if(!d&&id.startsWith('artist:'))d=await api('/api/artist-preview/'+encodeURIComponent(id.slice(7)));
  if(!d&&id.startsWith('public:')){const member=await api('/api/members/'+encodeURIComponent(id.slice(7)));id='member:'+member.profile.user_id;}
  if(!d&&id.startsWith('member:'))d=await api('/api/member-preview/'+encodeURIComponent(id.slice(7)));
  if(!d)d=await api('/api/producers/'+encodeURIComponent(id)+'/preview');
  if(serial!==profilePreviewSerial||route!==location.hash||uid!==me?.id||originRoom&&(originRoom.closed||originRoom.settingsTicket!==roomTicket))return;
  // A page follow may finish while this preview is loading. Read its new state
  // before allowing an older response to replace the shared follow state.
  if(revision!==followRevision)return openProfilePreview(id,origin);
  const kind=d.artist?'artist':'producer';
  if(d.following!==undefined&&d.profile.id&&!pendingFollows.has(kind+'/'+d.profile.id))updateFollowLocal(kind,d.profile.id,d.following,d.profile);
  const panel=document.createElement('dialog');panel.className='profile-preview';panel.setAttribute('aria-labelledby','profile-preview-title');panel.setAttribute('aria-modal','true');panel.innerHTML=profilePreviewHTML(d);
  panel.querySelectorAll('img[data-profile-preview]').forEach(image=>{image.removeAttribute('data-profile-preview');image.removeAttribute('tabindex');image.removeAttribute('role');image.removeAttribute('aria-haspopup');});
  // Close only the participant menu; the shared profile dialog sits above the active room.
  if(typeof voiceController!=='undefined'&&voiceController?.talkPopup?.open)voiceController.closeRoomPopup();
  profilePreviewOrigin=origin;profilePreviewOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';profilePreviewDialog=panel;document.body.append(panel);
  if(d.profile.id)paintFollowState(kind+'/'+d.profile.id,followed(kind,d.profile.id),pendingFollows.has(kind+'/'+d.profile.id),undefined,d.follows_viewer);
  const room=typeof voiceController!=='undefined'?voiceController:null;
  if(room?.joined&&!room.closed&&room.host?.isConnected)room.adoptRoomPopup(panel,origin);
  else{
   if(origin?.closest?.('.fm-page')){
    panel.classList.add('fm-profile-dialog');
    panel.querySelector('[data-preview-close]').remove();
   }
   panel.showModal();
   (panel.querySelector('[data-preview-close]')||panel.querySelector('.profile-preview-photo')).focus();
  }
  panel.addEventListener('cancel',event=>{event.preventDefault();closeProfilePreview('dismiss');});
  panel.addEventListener('keydown',event=>{
   if(event.key!=='Tab')return;
   const controls=[...panel.querySelectorAll('a[href],button:not(:disabled),[data-user-nickname][tabindex="0"]')],first=controls[0],last=controls.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  panel.addEventListener('click',async event=>{
   const target=event.target;
   if(target===panel){const r=panel.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeProfilePreview('dismiss');return;}
   if(room?.joined&&target.closest('[data-preview-message]')&&d.profile.id){
    event.preventDefault();closeProfilePreview(undefined,false);
    const sheet=room.host.querySelector('#room-inbox');room.showSheet('room-inbox');room.roomDM?.destroy();
    room.roomDM=roomMessages(room,sheet);await room.safe(()=>room.roomDM.thread(d.profile.id));return;
   }
   if(target.closest('[data-preview-close]'))return closeProfilePreview('dismiss');
   const gift=target.closest('[data-preview-gift]');if(gift){closeProfilePreview();await (d.artist?profileGiftDialog(d.profile.producer_id,{artistId:d.profile.id}):profileGiftDialog(gift.dataset.previewGift));return;}
   if(target.closest('[data-preview-report]')){closeProfilePreview();if(!me)return askLogin();toast('사용자 프로필 신고는 아직 연결되지 않았습니다. 신고가 접수되지 않았습니다.');return;}
   const share=target.closest('[data-preview-share]');
   if(share)return shareMemberProfile(d.profile);
   if(target.closest('[data-person-block]')&&!me){event.stopPropagation();closeProfilePreview();return askLogin();}
   if(target.closest('[data-preview-lounge]')&&location.hash===target.closest('a').hash){event.preventDefault();closeProfilePreview();document.querySelector('[data-fan-compose="lounge"]')?.click();return;}
   if(target.closest('a')){const needsLogin=target.closest('[data-preview-message]')&&!me;closeProfilePreview();if(needsLogin){event.preventDefault();askLogin();}}
  });
 }catch(error){if(serial===profilePreviewSerial)toast(error.message);}
}
// Only profile credits and identity cards opt in. Playback, room controls, management
// buttons, and links to a specific tab retain their own actions.
const profilePreviewLinks=[
 '.home-profile-card>a','.album-artist','.home-feature-artist a','.song-table-info a',
 '.song-credits a','.directory-photo','.directory-name a','.artist-card>a','.mp-artist-card',
 '.music-author','.crew-member-profile','.community-people-row a','.crew-person',
 '.dm-profile-link','.song-detail-producer a','.sing-card-person','.sing-cover-person',
 '.fan-affiliation','.sing-duet-context a','.fan-post-author a','.cover-collection-item .music-author',
 '.dm-thread-person','.dm-author','.cover-collection-person','.people-list-row',
 '.crew-member-preview a','.crew-people a','.song-support-person a','.official-ai-support a',
 '.ranking-row','.ranking-place a','.song-cover-performer','.song-cover-person',
 '.singing-person','.studio-artist-name','.chart-song-credit a','.hub-artist',
 '.hub-song-tile a','.hub-popular a','.community-song-credit a','.sing-card-person a',
 '.crew-manage-row a','.mp-manage-row a','.mp-relation','.mp-activity-rows a',
 '.song-support-person a','.karaoke-participation a'
].join(',');
function previewTarget(target){
 const nickname=target.closest('[data-user-nickname]');
 if(nickname)return {key:nickname.dataset.profilePreview,origin:nickname};
 const marked=target.closest('[data-profile-preview]');
 const link=target.closest('a[href]');
 if(link){
  const route=/^#(producer|artist|member|follower)\/([\w-]+)$/.exec(link.getAttribute('href'));
  if(route&&(link.matches(profilePreviewLinks)||marked))
   return {key:(route[1]==='artist'?'artist:':route[1]==='member'?'public:':route[1]==='follower'?'member:':'')+route[2],origin:link};
  return null;
 }
 return marked?{key:marked.dataset.profilePreview,origin:marked}:null;
}
document.addEventListener('click',event=>{
 const hit=previewTarget(event.target);
 if(!hit||event.button!==0)return;
 const origin=hit.origin,button=event.target.closest('button');
 if(origin.closest('[contenteditable="true"]')||(!('userNickname' in origin.dataset)&&(origin.closest('label')||(button&&button!==origin))))return;
 event.preventDefault();if(origin.dataset.profileStop!=='false')event.stopImmediatePropagation();void openProfilePreview(hit.key,origin);
},true);
document.addEventListener('keydown',event=>{
 if(event.isComposing||!['Enter',' '].includes(event.key)||!event.target.matches('[data-profile-preview],a[href]'))return;
 const hit=previewTarget(event.target);if(!hit)return;
 if(hit.origin.closest('[contenteditable="true"]')||(!('userNickname' in hit.origin.dataset)&&(hit.origin.closest('label')||hit.origin.closest('button'))))return;
 event.preventDefault();if(hit.origin.dataset.profileStop!=='false')event.stopImmediatePropagation();void openProfilePreview(hit.key,hit.origin);
},true);
// Room gestures and selection handlers must not run before the nickname's click.
for(const type of ['pointerdown','pointerup','touchstart','touchend','dblclick','auxclick'])document.addEventListener(type,event=>{
 const hit=event.target.closest('[data-user-nickname]');if(!hit)return;
 if(hit.dataset.profileStop!=='false')event.stopImmediatePropagation();
 if(type==='auxclick')event.preventDefault();
},true);
window.addEventListener('hashchange',closeProfilePreview);
window.addEventListener('popstate',event=>{if(!event.photoOverlayHandled&&!document.querySelector('.photo-lightbox[open]'))closeProfilePreview();});
