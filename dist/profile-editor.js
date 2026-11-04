// One temporary draft shared by every own-profile edit entry point.
let profileEditor=null,profileEditorSerial=0;
function profileEditorNameError(value,original,availableAt,at=Date.now()/1000){
 if(value.trim()===original)return ''; // Preserve unchanged legacy nicknames.
 return nicknamePolicy(value).error||(availableAt>at?'닉네임은 30일에 한 번 변경할 수 있어요.':'');
}
function profileEditorHTML(p){
 const path=playerFrameURL(p),frame=path&&!AifectPlayer.PLAYER_ITEMS[p.profile_frame]?.paid?'<img class="player-frame-artwork" src="'+esc(profileFrameCanvasArtwork(path))+'" alt="" aria-hidden="true">':'';
 return `<button type="button" class="dialog-close" data-profile-edit-close aria-label="닫기" autofocus>×</button>
 <form id="profile-edit-form" novalidate>
  <div class="profile-edit-top">
   <div class="profile-edit-avatar profile-frame-canvas avatar-frame-host">${avatarImage(p,'producer',false)}${frame}</div>
   <div class="profile-edit-fields">
    <div class="profile-edit-photo-actions"><button type="button" class="small-button" data-profile-photo-change>사진 변경</button><button type="button" class="small-button" data-profile-photo-remove ${p.image_version?'':'hidden'}>사진 삭제</button></div>
    <input type="file" name="image" accept="image/jpeg,image/png,image/webp" aria-label="프로필 사진 선택" hidden>
    <label class="form-field">닉네임<input name="name" value="${esc(p.name)}" autocomplete="nickname" maxlength="8" aria-describedby="profile-edit-name-status"></label>
    <p id="profile-edit-name-status" class="field-help" role="status"></p>
   </div>
  </div>
  <label class="form-field profile-edit-bio">소개<textarea name="bio" rows="3" maxlength="1000">${esc(p.bio||'')}</textarea></label>
  <p class="form-error" role="alert"></p>
  <div class="profile-edit-actions"><button type="button" class="small-button" data-profile-edit-close>취소</button><button type="submit" class="primary-button">저장</button></div>
 </form>`;
}
function closeProfileEditor(force=false){
 const s=profileEditor;
 if(s?.saving&&!force)return;
 ++profileEditorSerial;if(!s)return;
 profileEditor=null;
 if(s.url)URL.revokeObjectURL(s.url);
 s.controller.abort();s.panel.close();s.panel.remove();
 document.documentElement.style.overflow=s.overflow;
 document.documentElement.style.scrollbarGutter=s.gutter;
 if(s.origin?.isConnected)s.origin.focus({preventScroll:true});
 if(location.hash===s.route)window.scrollTo({left:s.scrollX,top:s.scrollY,behavior:'instant'});
}
function paintProfileDraft(s){
 const img=s.panel.querySelector('.profile-avatar-image');
 img.src=s.url||(s.removed?DEFAULT_AVATAR:s.originalImage);img.hidden=false;
 s.panel.querySelector('[data-profile-photo-remove]').hidden=!(s.file||(!s.removed&&s.profile.image_version));
}
async function openProfileEditor(origin=document.activeElement){
 if(profileEditor)return;
 const serial=++profileEditorSerial,route=location.hash;
 await accountReady;if(serial!==profileEditorSerial||route!==location.hash)return;
 if(!me)return askLogin();const uid=me.id;
 try{
  const d=await api('/api/me/profile','GET',undefined,{fresh:true});
  if(serial!==profileEditorSerial||route!==location.hash||uid!==me?.id)return;
  const panel=document.createElement('dialog');panel.className='profile-edit-dialog compact-popup';panel.setAttribute('aria-label','프로필 편집');panel.setAttribute('aria-modal','true');panel.innerHTML=profileEditorHTML(d.profile);
  const s=profileEditor={panel,profile:d.profile,availableAt:d.nickname_change_available_at||0,origin,uid,route,file:null,removed:false,url:'',saving:false,selecting:0,controller:new AbortController(),scrollX:window.scrollX,scrollY:window.scrollY,overflow:document.documentElement.style.overflow,gutter:document.documentElement.style.scrollbarGutter};
  s.originalImage=panel.querySelector('.profile-avatar-image').getAttribute('src');
  document.documentElement.style.scrollbarGutter='stable';document.documentElement.style.overflow='hidden';
  document.body.append(panel);panel.showModal();panel.querySelector('[data-profile-edit-close]').focus({preventScroll:true});
  // Native dialog autofocus and scroll-lock style changes must not move the page.
  window.scrollTo({left:s.scrollX,top:s.scrollY,behavior:'instant'});
  const form=panel.querySelector('form'),name=form.elements.name,status=panel.querySelector('[role=status]'),error=panel.querySelector('[role=alert]'),submit=form.querySelector('[type=submit]');
  const validate=()=>{const message=profileEditorNameError(name.value,s.profile.name,s.availableAt);name.setCustomValidity(message);status.textContent=message;submit.disabled=s.saving||!!s.selecting||!!message;return !message;};
  name.addEventListener('input',validate);
  name.addEventListener('blur',()=>{name.value=name.value.trim();validate();});
  panel.addEventListener('cancel',e=>{e.preventDefault();closeProfileEditor();});
  panel.addEventListener('close',()=>{if(profileEditor===s)closeProfileEditor(true);});
  panel.querySelectorAll('[data-profile-edit-close]').forEach(b=>b.onclick=()=>closeProfileEditor());
  panel.querySelector('[data-profile-photo-change]').onclick=()=>form.elements.image.click();
  panel.querySelector('[data-profile-photo-remove]').onclick=()=>{
   ++selection;s.selecting=0;if(s.url)URL.revokeObjectURL(s.url);s.url='';s.file=null;s.removed=true;form.elements.image.value='';error.textContent='';paintProfileDraft(s);validate();
  };
  let selection=0;
  form.elements.image.onchange=async()=>{
   const file=form.elements.image.files?.[0];form.elements.image.value='';if(!file)return;
   const revision=++selection;s.selecting=revision;error.textContent='';validate();
   try{
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('JPG·PNG·WebP 사진을 선택해주세요.');
    if(file.size>5*1024*1024)throw Error('사진은 5MB 이하로 선택해주세요.');
    const bitmap=await decodeUploadImage(file);bitmap.close();
    if(profileEditor!==s||revision!==selection||s.selecting!==revision)return;
    if(s.url)URL.revokeObjectURL(s.url);s.url=URL.createObjectURL(file);s.file=file;s.removed=false;paintProfileDraft(s);
   }catch(e){if(profileEditor===s&&revision===selection)error.textContent=e.message;}
   finally{if(profileEditor===s&&revision===selection){s.selecting=0;validate();}}
  };
  form.onsubmit=async event=>{
   event.preventDefault();if(s.saving||s.selecting||!validate())return;
   if(form.elements.bio.value.length>1000){error.textContent='소개는 1,000자 이하로 입력해주세요.';return;}
   s.saving=true;error.textContent='';panel.setAttribute('aria-busy','true');panel.querySelectorAll('button,input,textarea').forEach(b=>b.disabled=true);submit.textContent='저장 중…';
   let out;
   try{
    const draft=new FormData();draft.set('name',name.value.trim());draft.set('bio',form.elements.bio.value);
    if(s.file)draft.set('image',await optimizeUploadImage(s.file,{allowFallback:true}));else if(s.removed)draft.set('remove_image','true');
    if(profileEditor!==s||uid!==me?.id)return;
    const response=await fetch('/api/me/profile',{method:'PUT',credentials:'same-origin',body:draft,signal:s.controller.signal});
    out=await response.json();if(!response.ok)throw Error(out.error||'프로필을 저장하지 못했어요. 다시 시도해주세요.');
   }catch(e){if(profileEditor===s)error.textContent=e.name==='AbortError'?'저장이 중단되었어요.':e.message||'프로필을 저장하지 못했어요.';return;}
   finally{
    s.saving=false;if(profileEditor===s){panel.removeAttribute('aria-busy');panel.querySelectorAll('button,input,textarea').forEach(b=>b.disabled=false);submit.textContent='저장';validate();}
   }
   if(profileEditor!==s||uid!==me?.id)return;
   closeProfileEditor(true);syncSavedProfile(out,s.profile);toast('프로필을 저장했어요.');
  };
 }catch(error){if(serial===profileEditorSerial)toast(error.message);}
}

// Only identity labels use this helper; authored post/comment text is never renamed.
function profileIdentityName(value,oldName,newName){
 const text=value.trim(),tail=text.slice(oldName.length);
 return text.startsWith(oldName)&&(tail===''||tail===' 프로필 사진'||/^\([^]*\)(?: 프로필 사진)?$/.test(tail))?value.replace(oldName,newName):value;
}
// Update identity displays in place: no route render, playback teardown or scroll jump.
function syncSavedProfile(out,previous){
 const p=out.profile,oldName=previous.name;
 invalidateReads();me={...me,...out.user};updateAccount();
 const updateTrack=t=>{if(t.producer_id===p.id){t.producer=p.name;t.producer_image_version=p.image_version;}if(t.duet_partner_id===p.id)t.duet_partner=p.name;if(t.user_id===p.user_id&&t.work_nickname===oldName)t.work_nickname=p.name;};
 trackMap.forEach(updateTrack);library.likes.forEach(updateTrack);
 for(const f of library.follows)if(f.kind==='producer'&&f.target_id===p.id)Object.assign(f,{name:p.name,image_version:p.image_version});
 if(typeof myPageState!=='undefined'&&myPageState?.d.profile.user_id===p.user_id){
  Object.assign(myPageState.d.profile,p);for(const t of [...(myPageState.d.tracks||[]),...(myPageState.d.covers||[])])updateTrack(t);
  const region=document.querySelector('.mp-profile-area');if(region){region.outerHTML=myProfileHeader(myPageState.d);bindMemberHeader(myPageState.d.profile);}
 }
 const identities=new Set();
 const src=p.image_version?'/media/producer/'+encodeURIComponent(p.id)+'?v='+encodeURIComponent(p.image_version):DEFAULT_AVATAR;
 for(const img of document.querySelectorAll('img')){
  if(img.dataset.avatarProfile===p.id||img.getAttribute('src')?.split('?')[0]==='/media/producer/'+encodeURIComponent(p.id)){
   img.src=src;img.hidden=false;if(img.classList.contains('profile-avatar-image'))img.alt=profileIdentityName(img.alt,oldName,p.name);
   const author=img.closest('[data-comment-card]')?.querySelector('.song-comment-meta strong');if(author)identities.add(author);
   const libraryName=img.closest('.library-profile')?.querySelector('h2');if(libraryName)identities.add(libraryName);
  }
 }
 for(const el of document.querySelectorAll('a[href],[data-user-id],[data-profile-id],[data-profile-preview]')){
  const href=(el.getAttribute('href')||'').split('?')[0];
  if(href==='#producer/'+p.id||p.public_id&&href==='#member/'+p.public_id||el.dataset.userId===p.user_id||el.dataset.profileId===p.id||el.dataset.profilePreview===p.id)identities.add(el);
 }
 if(typeof myPageState!=='undefined'&&myPageState?.own)document.querySelectorAll('.mp-card-nick').forEach(el=>identities.add(el));
 for(const el of identities){
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode()))node.textContent=profileIdentityName(node.textContent,oldName,p.name);
  for(const attr of ['title','aria-label']){const value=el.getAttribute(attr);if(value)el.setAttribute(attr,profileIdentityName(value,oldName,p.name));}
 }
 if(typeof updateHomeAccount==='function')updateHomeAccount();
 window.dispatchEvent(new CustomEvent('aifect:profile-saved',{detail:{profile:p,previous}}));
}
async function handleProfileEditRoute(){
 if(!/^#\/?profile\/edit(?:\?|$)/.test(location.hash))return false;
 await accountReady;if(!me){askLogin();return true;}
 const main=document.querySelector('#main'),prior=main?.dataset.route;
 const back=prior&&!/^profile\/edit(?:\?|$)/.test(prior)?'#'+prior:'#profile';
 history.replaceState(history.state,'',back);
 if(!prior||main.dataset.account!==me.id||/^profile\/edit(?:\?|$)/.test(prior))await render();
 await openProfileEditor();return true;
}
document.addEventListener('click',event=>{
 const trigger=event.target.closest('a[href="#profile/edit"],[data-profile-edit]');
 if(!trigger||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 event.preventDefault();event.stopImmediatePropagation();
 let origin=trigger;
 if(trigger.closest('.profile-preview')){closeProfilePreview();origin=document.activeElement;}
 void openProfileEditor(origin);
},true);
window.addEventListener('hashchange',()=>closeProfileEditor(true));
