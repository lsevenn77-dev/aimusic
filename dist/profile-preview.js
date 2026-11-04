// One delegated trigger survives route renders without replacing nickname links.
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
function profilePreviewHTML(d){
 const p=d.profile,own=!!me&&p.user_id===me.id,kind=d.artist?'artist':'producer',key=kind+'/'+p.id,c=d.crew;
 const header=d.artist?'<span class="profile-preview-own">AI 아티스트</span>':own?'<span class="profile-preview-own">내 프로필</span>':'<button type="button" data-preview-report>신고</button><span aria-hidden="true">|</span><button type="button" data-person-block="'+esc(p.user_id)+'" data-block-name="'+esc(p.name)+'">차단</button>';
 const buttons=d.artist?'<a class="small-button" href="#artist/'+encodeURIComponent(p.id)+'">팬페이지 보기</a>':own?'<a class="primary-button" href="#profile/edit">'+profilePreviewIcons.edit+'<span>프로필 수정</span></a><button type="button" class="small-button" data-preview-share="'+esc(p.id||'')+'">'+profilePreviewIcons.share+'<span>공유</span></button><a class="small-button" href="#profile">'+icon('chevron')+'<span>내 페이지</span></a>':!p.id?(p.public_id?'<a class="small-button" href="#member/'+esc(p.public_id)+'">프로필 보기</a>':''):'<button type="button" class="primary-button" data-follow="'+esc(key)+'" aria-pressed="'+!!d.following+'">'+profilePreviewIcons.follow+'<span data-follow-label>'+(d.following?'팔로잉':'팔로우')+'</span></button><a class="small-button" href="#dm/'+esc(p.id)+'" data-preview-message>'+icon('message')+'<span>메시지</span></a><a class="small-button" href="#producer/'+esc(p.id)+'">'+icon('chevron')+'<span>더보기</span></a><button type="button" class="small-button profile-preview-gift" data-preview-gift="'+esc(p.id)+'">'+icon('gift')+'<span>선물 보내기</span></button>';
 return '<section class="profile-preview-card"><button type="button" class="profile-preview-photo'+playerAvatarClass(p)+'" aria-label="프로필 사진 크게 보기">'+avatarImage(p,kind,false)+playerBadgeHTML(p)+'</button><header class="profile-preview-header"><h2 id="profile-preview-title" title="'+esc(p.name)+'">'+esc(p.name)+(p.account_type==='ai_bot'?'<span class="ai-account-badge" title="공식 AI 응원 계정">AI</span>':'')+'</h2>'+(d.artist?'':'<p class="mp-public-id">ID · '+esc(p.public_id||'발급 확인 중')+'</p>')+'<div class="profile-preview-tools">'+header+'<button type="button" class="profile-preview-close" data-preview-close aria-label="프로필 미리보기 닫기">'+profilePreviewIcons.close+'</button></div></header><p class="profile-preview-bio">'+esc(p.bio||'')+'</p><div class="profile-preview-stats"><a class="preview-count" href="#follow?'+(d.artist?'tab=artists&amp;artist='+encodeURIComponent(p.id):'tab=followers&amp;user='+encodeURIComponent(p.user_id))+'" data-followers="'+esc(key)+'" data-count="'+Number(d.followers||0)+'"><strong data-follow-count>'+number(d.followers)+'</strong><span>팔로워'+(d.ai_followers?' · AI '+number(d.ai_followers)+' 포함':'')+'</span></a>'+(d.artist?'':'<a class="preview-count" href="#follow?tab=following&amp;user='+encodeURIComponent(p.user_id)+'"><strong>'+number(d.following_count)+'</strong><span>팔로잉</span></a>')+(c?'<a class="small-button profile-preview-crew" href="#crew/'+esc(c.id)+'" title="'+esc(c.name)+'">'+(c.image_version?'<img src="/media/crew/'+encodeURIComponent(c.id)+'?v='+encodeURIComponent(c.image_version)+'" alt="">':'')+'<span>'+esc(c.name)+'</span>'+icon('chevron')+'</a>':'')+'</div><nav class="profile-preview-actions" aria-label="프로필 작업">'+buttons+'</nav></section>';
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
  if(!d.artist&&d.following!==undefined&&d.profile.id&&!pendingFollows.has('producer/'+d.profile.id))updateFollowLocal('producer',d.profile.id,d.following,d.profile);
  const panel=document.createElement('dialog');panel.className='profile-preview compact-popup';panel.setAttribute('aria-labelledby','profile-preview-title');panel.setAttribute('aria-modal','true');panel.innerHTML=profilePreviewHTML(d);
  panel.querySelectorAll('[data-profile-preview]').forEach(image=>{image.removeAttribute('data-profile-preview');image.removeAttribute('tabindex');image.removeAttribute('role');image.removeAttribute('aria-haspopup');});
  profilePreviewOrigin=origin;profilePreviewOverflow=document.body.style.overflow;document.body.style.overflow='hidden';profilePreviewDialog=panel;document.body.append(panel);panel.showModal();panel.querySelector('[data-preview-close]').focus();
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
   const gift=target.closest('[data-preview-gift]');if(gift){closeProfilePreview();await profileGiftDialog(gift.dataset.previewGift);return;}
   if(target.closest('[data-preview-report]')){closeProfilePreview();if(!me)return askLogin();toast('사용자 프로필 신고는 아직 연결되지 않았어요. 신고가 접수되지 않았습니다.');return;}
   const share=target.closest('[data-preview-share]');
   if(share)return shareMemberProfile(d.profile);
   if(target.closest('[data-person-block]')&&!me){event.stopPropagation();closeProfilePreview();return askLogin();}
   if(target.closest('a')){const needsLogin=target.closest('[data-preview-message]')&&!me;closeProfilePreview();if(needsLogin){event.preventDefault();askLogin();}}
  });
 }catch(error){if(serial===profilePreviewSerial)toast(error.message);}
}
document.addEventListener('click',event=>{
 const image=event.target.closest('[data-profile-preview]');
 if(!image||image.closest('dialog,label,[contenteditable="true"]')||(image.closest('button')&&image.closest('button')!==image)||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 event.preventDefault();event.stopImmediatePropagation();void openProfilePreview(image.dataset.profilePreview,image);
},true);
document.addEventListener('keydown',event=>{
 if(!['Enter',' '].includes(event.key)||!event.target.matches('[data-profile-preview]')||event.target.closest('dialog,label')||event.target.closest('button'))return;
 event.preventDefault();event.stopImmediatePropagation();void openProfilePreview(event.target.dataset.profilePreview,event.target);
},true);
window.addEventListener('hashchange',closeProfilePreview);
window.addEventListener('popstate',event=>{if(!event.photoOverlayHandled&&!document.querySelector('.photo-lightbox[open]'))closeProfilePreview();});
