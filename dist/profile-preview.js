// Identity links keep their destination for modified clicks and opening a new tab.
let profilePreviewSerial=0,profilePreviewDialog=null,profilePreviewOrigin=null,profilePreviewOverflow='';
const profilePreviewSVG=path=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>';
const profilePreviewIcons={
 follow:profilePreviewSVG('M15 21H3v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 4 2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M19 14v8m-4-4h8'),
 edit:profilePreviewSVG('m15 4 5 5M3 21l5-1L21 7a2 2 0 0 0-5-5L3 15z'),
 share:profilePreviewSVG('M12 16V2m-4 4 4-4 4 4M7 10H4v12h16V10h-3'),
 close:profilePreviewSVG('m5 5 14 14M19 5 5 19')
};
async function shareMemberProfile(p){
 const route=p.id?'producer/'+encodeURIComponent(p.id):p.public_id?'member/'+encodeURIComponent(p.public_id):'';
 if(!route){toast('프로필을 먼저 저장해주세요.');return;}
 const url=new URL('/#'+route,location.origin).href;
 try{
  if(navigator.share)await navigator.share({title:p.name+' · AIFECT',url});
  else{await navigator.clipboard.writeText(url);toast('프로필 링크를 복사했어요.');}
 }catch(error){if(error.name!=='AbortError')toast('프로필 링크를 공유하지 못했어요. 다시 시도해주세요.');}
}

function closeProfilePreview(){
 ++profilePreviewSerial;
 if(!profilePreviewDialog)return;
 const panel=profilePreviewDialog;profilePreviewDialog=null;panel.close();panel.remove();
 document.body.style.overflow=profilePreviewOverflow;
 if(profilePreviewOrigin?.isConnected)profilePreviewOrigin.focus({preventScroll:true});
 profilePreviewOrigin=null;
}
function profilePreviewActions(d, own) {
 const p=d.profile, id=encodeURIComponent(p.id||''), artist=!!d.artist;
 if(own&&!artist)return `<a class="primary-button" href="#profile/edit">${profilePreviewIcons.edit}<span>프로필 수정</span></a><button type="button" class="small-button" data-preview-share="${esc(p.id||'')}">${profilePreviewIcons.share}<span>공유</span></button><a class="small-button" href="#profile">${icon('chevron')}<span>내 페이지</span></a>`;
 if(!p.id)return p.public_id?`<a class="small-button" href="#member/${esc(p.public_id)}">프로필 보기</a>`:'';
 const fan='#artist/'+id, following=!!d.following;
 return `<button type="button" class="primary-button" data-follow="${artist?'artist':'producer'}/${esc(p.id)}" aria-pressed="${following}">${profilePreviewIcons.follow}<span data-follow-label>${following?'팔로잉':'팔로우'}</span></button>
 <a class="small-button" href="${artist?fan+'?tab=lounge&amp;compose=1':'#dm/'+id}" ${artist?'data-preview-lounge':'data-preview-message'}>${icon('message')}<span>${artist?'응원글':'메시지'}</span></a>
 <a class="small-button" href="${artist?fan:'#producer/'+id}">${icon('chevron')}<span>${artist?'팬페이지':'더보기'}</span></a>
 <button type="button" class="small-button" data-preview-gift="${esc(p.id)}">${icon('gift')}<span>선물 보내기</span></button>`;
}
function profilePreviewHTML(d){
 const p=d.profile, artist=!!d.artist, own=!!me&&p.user_id===me.id, kind=artist?'artist':'producer';
 const tools=artist?'':own?'<span class="profile-preview-own">내 프로필</span>':`<button type="button" data-preview-report>신고</button><span aria-hidden="true">|</span><button type="button" data-person-block="${esc(p.user_id)}" data-block-name="${esc(p.name)}">차단</button>`;
 const followers=artist?'tab=artists&amp;artist='+encodeURIComponent(p.id):'tab=followers&amp;user='+encodeURIComponent(p.user_id);
 const affiliation=artist&&p.producer_name?`<span class="preview-affiliation"><span title="${esc(p.producer_name)}">${esc(p.producer_name)}</span> 소속</span>`:'';
 const crew=!artist&&d.crew?`<a class="profile-preview-crew" href="#crew/${encodeURIComponent(d.crew.id)}" title="${esc(d.crew.name)}">${d.crew.badge_url?`<img src="${esc(d.crew.badge_url)}" alt="크루 레벨 ${Number(d.crew.level)}" width="14" height="14">`:''}<span>${esc(d.crew.name)}</span></a>`:'';
 return `<section class="profile-preview-card" data-profile-kind="${artist?'artist':'user'}">
 <div class="profile-preview-image-slot"><button type="button" class="profile-preview-photo${playerAvatarClass(p)}" aria-label="프로필 사진 크게 보기">${avatarImage(p,kind,false)}${playerBadgeHTML(p)}</button></div>
 <div class="profile-preview-info"><header class="profile-preview-header">
 <h2 id="profile-preview-title" title="${esc(p.name)}">${esc(p.name)}</h2>
 <div class="profile-preview-tools">${tools}<button type="button" class="profile-preview-close" data-preview-close aria-label="프로필 미리보기 닫기">${profilePreviewIcons.close}</button></div></header>
 ${artist?'':`<p class="mp-public-id">ID · ${esc(p.public_id||'발급 확인 중')}</p>`}
 <p class="profile-preview-bio" title="${esc(p.bio||'')}">${esc(p.bio||'')}</p>
 <div class="profile-preview-stats"><a class="preview-count" href="#follow?${followers}" data-followers="${kind}/${esc(p.id||'')}" data-count="${Number(d.followers||0)}" ${d.ai_followers?'title="AI 팔로워 '+number(d.ai_followers)+'명 포함"':''}><strong data-follow-count>${number(d.followers||0)}</strong> 팔로워</a>
 ${artist?affiliation:`<a class="preview-count" href="#follow?tab=following&amp;user=${encodeURIComponent(p.user_id)}"><strong>${number(d.following_count||0)}</strong> 팔로잉</a>${crew}`}</div></div>
 <nav class="profile-preview-actions" aria-label="프로필 작업">${profilePreviewActions(d,own)}</nav></section>`;
}
async function openProfilePreview(id,origin){
 closeProfilePreview();const serial=profilePreviewSerial,route=location.hash;
 await accountReady;const uid=me?.id;
 try{
  let d;
  if(id==='self'){
   if(!me)return askLogin();
   if(me.profile_id)id=me.profile_id;
   else{const own=await api('/api/me/profile');d={profile:own.profile,followers:own.follower_count,ai_followers:own.ai_followers,following_count:own.following_count,crew:null};}
  }
  if(!d&&id.startsWith('artist:'))d=await api('/api/artist-preview/'+encodeURIComponent(id.slice(7)));
  if(!d&&id.startsWith('member:'))d=await api('/api/member-preview/'+encodeURIComponent(id.slice(7)));
  if(!d)d=await api('/api/producers/'+encodeURIComponent(id)+'/preview');
  if(serial!==profilePreviewSerial||route!==location.hash||uid!==me?.id)return;
  const kind=d.artist?'artist':'producer';
  if(d.following!==undefined&&d.profile.id&&!pendingFollows.has(kind+'/'+d.profile.id))updateFollowLocal(kind,d.profile.id,d.following,d.profile);
  const panel=document.createElement('dialog');panel.className='profile-preview';panel.setAttribute('aria-labelledby','profile-preview-title');panel.setAttribute('aria-modal','true');panel.innerHTML=profilePreviewHTML(d);
  panel.querySelectorAll('[data-profile-preview]').forEach(image=>{image.removeAttribute('data-profile-preview');image.removeAttribute('tabindex');image.removeAttribute('role');image.removeAttribute('aria-haspopup');});
  // Close only the participant menu; the shared profile dialog sits above the active room.
  if(typeof voiceController!=='undefined'&&voiceController?.talkPopup?.open)voiceController.closeRoomPopup();
  profilePreviewOrigin=origin;profilePreviewOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';profilePreviewDialog=panel;document.body.append(panel);
  panel.showModal();panel.querySelector('[data-preview-close]').focus();
  panel.addEventListener('cancel',event=>{event.preventDefault();closeProfilePreview();});
  panel.addEventListener('keydown',event=>{
   if(event.key!=='Tab')return;
   const controls=[...panel.querySelectorAll('a[href],button:not(:disabled)')],first=controls[0],last=controls.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  panel.addEventListener('click',async event=>{
   const target=event.target;
   if(target===panel){const r=panel.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeProfilePreview();return;}
   if(target.closest('[data-preview-close]'))return closeProfilePreview();
   const gift=target.closest('[data-preview-gift]');if(gift){closeProfilePreview();await (d.artist?profileGiftDialog(d.profile.producer_id,{artistId:d.profile.id}):profileGiftDialog(gift.dataset.previewGift));return;}
   if(target.closest('[data-preview-report]')){closeProfilePreview();if(!me)return askLogin();toast('사용자 프로필 신고는 아직 연결되지 않았어요. 신고가 접수되지 않았습니다.');return;}
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
 '.fan-affiliation','.sing-duet-context a','.fan-post-author a','.cover-collection-item .music-author'
].join(',');
function previewTarget(target){
 const marked=target.closest('[data-profile-preview]');
 const link=target.closest('a[href]');
 if(link){
  const route=/^#(producer|artist)\/([\w-]+)$/.exec(link.getAttribute('href'));
  if(route&&(link.matches(profilePreviewLinks)||marked))
   return {key:(route[1]==='artist'?'artist:':'')+route[2],origin:link};
  return null;
 }
 return marked?{key:marked.dataset.profilePreview,origin:marked}:null;
}
document.addEventListener('click',event=>{
 const hit=previewTarget(event.target);
 if(!hit||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 const origin=hit.origin,button=event.target.closest('button');
 if(origin.closest('dialog,label,[contenteditable="true"]')||(button&&button!==origin))return;
 event.preventDefault();event.stopImmediatePropagation();void openProfilePreview(hit.key,origin);
},true);
document.addEventListener('keydown',event=>{
 if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!['Enter',' '].includes(event.key)||!event.target.matches('[data-profile-preview]')||event.target.closest('dialog,label')||event.target.closest('button'))return;
 const hit=previewTarget(event.target);if(!hit)return;
 event.preventDefault();event.stopImmediatePropagation();void openProfilePreview(hit.key,hit.origin);
},true);
window.addEventListener('hashchange',closeProfilePreview);
window.addEventListener('popstate',event=>{if(!event.photoOverlayHandled&&!document.querySelector('.photo-lightbox[open]'))closeProfilePreview();});
