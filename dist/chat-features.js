function dmMuteButton(p){return '<button type="button" class="icon-button dm-mute" data-dm-mute="'+esc(p.id)+'" data-muted="'+(p.muted?'1':'0')+'" aria-label="'+esc(chatNickname(p))+' 알림 '+(p.muted?'켜기':'끄기')+'" aria-pressed="'+Boolean(p.muted)+'">'+icon(p.muted?'bellOff':'bell')+'</button>';}
function inboxControlsHTML(){
 return '<button type="button" class="dm-friends-trigger" data-dm-find aria-label="친구 찾기" title="친구 찾기"><svg xmlns="http://www.w3.org/2000/svg" class="lucide lucide-user-round-plus" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 21a8 8 0 0 1 13.292-6"/><circle cx="10" cy="8" r="5"/><path d="M19 16v6"/><path d="M22 19h-6"/></svg></button>';
}
function crewInboxHTML(c,selected=''){return c?'<a data-list-row class="surface conversation-row pinned-crew'+(selected==='crew/'+c.id?' is-selected':'')+(Number(c.unread)>0?' is-unread':'')+'" href="#dm/crew/'+esc(c.id)+'"'+(selected==='crew/'+c.id?' aria-current="true"':'')+'><span class="crew-inbox-art">'+(c.image_version?'<img src="/media/crew/'+esc(c.id)+'?v='+esc(c.image_version)+'" alt="">':icon('users'))+'</span>'+conversationCopyHTML(c,'크루채팅 · '+c.name,'크루원들과 대화해보세요.',true)+conversationMetaHTML(c)+'</a>':'';}
function dmThreadActions(p,settings={}){return '<div class="dm-thread-actions">'+dmMuteButton({...p,muted:settings?.muted})+'<button type="button" class="icon-button" data-dm-clear="'+esc(p.id)+'" aria-label="이 대화방 내용 전체 삭제" title="이 대화방 내용 전체 삭제">'+icon('trash')+'</button>'+(p.user_id?'<button type="button" class="text-link dm-block-button" data-person-block="'+esc(p.user_id)+'" data-block-name="'+esc(p.name)+'">차단</button>':'')+'</div>';}
function dmEmojiPickerHTML(){
 return '<section id="dm-emoji-picker" class="cat-picker" role="dialog" aria-label="고양이 미니이모티콘" hidden></section>';
}
function bindDmEmoji(form,input,editor){
 const toggle=form.querySelector('[data-dm-emoji]'),picker=form.parentElement.querySelector('#dm-emoji-picker');
 if(!toggle||!picker)return;
 const listeners=new AbortController(),options={signal:listeners.signal};
 const show=open=>{
  picker.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
  if(open){input.blur();picker.querySelector('[data-cat-tab][aria-pressed=true]')?.focus({preventScroll:true});}
 };
 const close=()=>{show(false);editor.focus();};
 const stickers=AifectStickers.bind({picker,form,input,toggle,inline:editor,close,glyph:voiceGlyph});
 toggle.addEventListener('pointerdown',()=>{if(picker.hidden)editor.remember();},options);
 toggle.addEventListener('click',()=>{if(input.contentEditable!=='false'){if(picker.hidden)show(true);else close();}},options);
 const outside=event=>{if(!picker.hidden&&!picker.contains(event.target)&&!toggle.contains(event.target))show(false);};
 document.addEventListener('pointerdown',outside,options);
 // WebKit can focus the main landmark between touchend and the button click.
 // Dismiss on the actual pointer target, or the destination of a keyboard Tab.
 document.addEventListener('keyup',event=>{if(event.key==='Tab')outside(event);},options);
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!picker.hidden){event.preventDefault();close();}
 },options);
 return {...stickers, sent(){stickers.clear();if(!picker.hidden)show(false);},
  destroy(){listeners.abort();stickers.destroy();show(false);toggle.disabled=true;}};
}
function chatAttachmentTools(p,inlineComposer=''){
 const photo='<label class="chat-ui-icon chat-ui-plain" role="button" tabindex="0" aria-label="사진 보내기">'+icon('image')+'<input id="chat-image-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>';
 const gift=p?chatIconButton('present','선물 보내기','type="button" data-profile-gift="'+esc(p.id)+'"','surface'):'';
 return '<div class="chat-attachment-tools">'+photo+inlineComposer+gift+'</div><p id="chat-upload-status" class="field-help" role="status"></p>';
}
function chatImageHTML(m,crew=false){const media=crew?'/media/crew-chat/':'/media/dm/';return m.image_expires&&m.image_expires*1000<=Date.now()?'<span class="expired-chat-image">보관 기간이 지난 사진</span>':'<a class="chat-image" href="'+media+esc(m.image_id)+'" target="_blank" rel="noopener"><img src="'+media+esc(m.image_id)+'" alt="받은 사진" loading="lazy"></a>';}
async function uploadChatImage(path,file){const image=await optimizeUploadImage(file),r=await fetch(path,{method:'PUT',headers:{'content-type':'image/webp'},body:image});const d=await r.json();if(!r.ok)throw new Error(d.error||'이미지를 올리지 못했어요.');return d;}
function bindChatImageUpload(peer,path,send,blocked){
 const input=$('#chat-image-file');if(!input)return;input.parentElement.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}};
 input.onchange=async()=>{const file=input.files[0],uid=me?.id,ticket=renderId;if(!file||blocked())return;input.disabled=true;const compose=$('#chat-compose'),submit=compose?.querySelector('[data-chat-send]');if(compose)compose.dataset.uploading='1';if(submit)submit.disabled=true;const status=$('#chat-upload-status');status.textContent='사진을 변환하고 있어요…';
  try{const uploaded=await uploadChatImage(path.replace(/\/messages$/,'')+'/images',file);if(uid!==me?.id||ticket!==renderId)return;const rid=crypto.randomUUID();await send({id:'pending:'+rid,request_id:rid,body:'사진',image_id:uploaded.id,image_expires:uploaded.expires,created:Math.floor(Date.now()/1000),sender_id:uid,user_id:uid});status.textContent='';}
  catch(e){if(input.isConnected)status.textContent=e.message;}finally{input.disabled=false;input.value='';if(compose)delete compose.dataset.uploading;if(submit&&submit.isConnected)submit.disabled=false;}
 };
}
function crewHomeMedia(c,m){return '<section class="crew-home-media">'+(c.image_version?'<img class="crew-main-image" src="/media/crew/'+esc(c.id)+'?v='+esc(c.image_version)+'" alt="'+esc(c.name)+' 대표 이미지">':m?.role==='owner'?'<button type="button" class="crew-image-placeholder" data-edit-crew="'+esc(c.id)+'">'+icon('image')+' 크루 대표 이미지 설정</button>':'')+(m?'<a class="crew-chat-entry" href="#dm/crew/'+esc(c.id)+'">'+icon('message')+'<span><strong>크루 채팅창 들어가기</strong><small>크루원들과 음악과 이야기를 나눠보세요.</small></span>'+icon('chevron')+'</a>':'')+'</section>';}
async function crewChatView(raw,readApi=api){const cid=raw.split('?')[0].split('/')[2];if(!cid)throw new Error('크루를 선택해주세요.');const initial=await readApi('/api/crews/'+encodeURIComponent(cid)+'/messages'),d=initial;if(!d.membership)throw new Error('가입한 크루에서 대화할 수 있어요.');return {html:'<header class="dm-thread-header"><a href="#dm" class="icon-button" aria-label="대화 목록">'+icon('back')+'</a><a class="dm-thread-person dm-crew-person" href="#crew/'+esc(cid)+'"><span class="crew-chat-avatar">'+icon('users')+'</span><div class="dm-crew-heading"><h1 title="'+esc(d.crew.name)+'">'+esc(d.crew.name)+'</h1><small class="dm-crew-home-label">크루 홈 보기</small></div></a>'+crewMuteButton(d.crew.id,d.membership.muted)+'</header>'+chatPanelHTML('크루 채팅',initial,null,true),chat:{path:'/api/crews/'+cid+'/messages',initial,crew:{id:cid,owner:d.membership.role==='owner'}}};}
let messageBadgeBusy=false,messageBadgeAccount=null,messageBadgeAgain=false,messageBadgeVersion=0;
async function blockedPeopleView(profileId='',known=null,readApi=api,layout=dmInboxHTML){
 const d=known||await readApi('/api/blocks'),people=profileId?d.blocks.filter(p=>p.profile_id===profileId):d.blocks;
 if(profileId&&!people.length)return null;
 const inbox=me?.id&&dmInboxSnapshot?.uid===me.id?dmInboxSnapshot.data:{conversations:[]},thread='<header class="dm-thread-header"><a class="small-button" href="#dm">'+icon('back')+' 대화 목록</a><h1>차단 관리</h1></header><section class="blocked-people"><p>차단한 상대와는 메시지를 주고받을 수 없어요. 기존 대화는 삭제되지 않으며, 해제하면 다시 확인할 수 있어요.</p>'+ (people.length?people.map(p=>'<article><strong>'+userNickname(p.name,{profileId:p.profile_id,userId:p.id})+'</strong><button class="small-button" data-person-unblock="'+esc(p.id)+'" data-block-name="'+esc(p.name)+'">차단 해제</button></article>').join(''):'<p class="social-empty">차단한 이용자가 없어요.</p>')+'</section>';
 return {html:layout(inbox,thread,profileId),inbox:true,refreshInbox:true,selectedConversation:profileId};
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-person-block],[data-person-unblock]');if(!b)return;e.preventDefault();
 if(b.disabled)return;const blocking=!!b.dataset.personBlock,uid=me?.id,target=b.dataset.personBlock||b.dataset.personUnblock;
 if(!uid||!target)return;
 if(!confirm(b.dataset.blockName+'님을 '+(blocking?'차단할까요?\n서로 메시지를 보낼 수 없고 상대의 콘텐츠가 숨겨져요. 차단 관리에서 해제할 수 있어요.':'차단 해제할까요?')))return;
 b.disabled=true;
 try{await api('/api/blocks/'+encodeURIComponent(target),blocking?'PUT':'DELETE');if(uid!==me?.id)return;if(b.closest('.profile-preview'))closeProfilePreview();socialCleanup?.();await render();void refreshMessageBadge();toast(blocking?'상대방을 차단했어요.':'차단을 해제했어요.');}
 catch(err){if(uid===me?.id)toast(err.message);}finally{if(b.isConnected)b.disabled=false;}
});
async function refreshMessageBadge(){
 const version=++messageBadgeVersion,uid=me?.id;if(!uid){paintMessageBadge(0);messageBadgeAccount=null;return;}
 if(document.hidden)return;
 if(messageBadgeBusy){messageBadgeAgain=true;return;}messageBadgeBusy=true;
 try{const d=await api('/api/dm/summary','GET',undefined,{fresh:true});if(uid===me?.id&&version===messageBadgeVersion){messageBadgeAccount=uid;paintMessageBadge(d.unread);document.querySelectorAll('.voice-room [data-voice=inbox]').forEach(b=>b.toggleAttribute('data-unread-dm',d.direct_unread>0));}}
 catch{}finally{messageBadgeBusy=false;if(messageBadgeAgain){messageBadgeAgain=false;void refreshMessageBadge();}}
}
function paintMessageBadge(count){document.querySelectorAll('[data-primary-view="dm"],#sidebar a[href="#dm"],.header-messages').forEach(link=>{let badge=link.querySelector('.nav-message-badge');if(!badge){badge=document.createElement('b');badge.className='nav-message-badge';link.append(badge);}badge.hidden=!count;badge.textContent='';badge.setAttribute('aria-label','안 읽은 메시지 '+count+'개');});}
setInterval(()=>{if(messageBadgeAccount!==me?.id)paintMessageBadge(0);void refreshMessageBadge();},8000);
window.addEventListener('focus',refreshMessageBadge);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshMessageBadge();});
if(typeof accountReady!=='undefined')Promise.resolve(accountReady).then(refreshMessageBadge);
document.addEventListener('click',async e=>{
 const mute=e.target.closest('[data-dm-mute]'),clear=e.target.closest('[data-dm-clear]'),read=e.target.closest('[data-dm-read-all]');if(!mute&&!clear&&!read)return;e.preventDefault();e.stopPropagation();const b=mute||clear||read;if(b.disabled)return;b.disabled=true;
 try{
  if(mute){const muted=mute.dataset.muted!=='1';await api('/api/dm/'+mute.dataset.dmMute+'/settings','PUT',{muted});mute.dataset.muted=muted?'1':'0';mute.setAttribute('aria-pressed',String(muted));mute.setAttribute('aria-label','대화 알림 '+(muted?'켜기':'끄기'));mute.innerHTML=icon(muted?'bellOff':'bell');updateInboxMute(mute.dataset.dmMute,muted);toast(muted?'이 대화의 푸시 알림을 껐어요.':'이 대화의 푸시 알림을 켰어요.');}
  if(read){await readAllMessages();}
  if(clear){
   const peer=clear.dataset.dmClear,uid=me?.id,route=location.hash;
   if(!uid||!peer||peer==='all')return;
   if(!confirm('이 대화방의 내용을 전부 삭제할까요?\n내 화면의 이전 메시지와 사진이 모두 사라집니다. 상대방의 기록과 다른 대화방은 유지되며, 새 메시지는 계속 받을 수 있어요.'))return;
   await api('/api/dm/'+encodeURIComponent(peer),'DELETE');
   if(uid!==me?.id)return;
   if(route===location.hash)await render();
   toast('이 대화방의 내용을 모두 삭제했어요.');
  }
  void refreshMessageBadge();
 }catch(err){toast(err.message);}finally{b.disabled=false;}
});
document.addEventListener('error',e=>{if(e.target.matches?.('.chat-image img'))e.target.closest('.chat-image').outerHTML='<span class="expired-chat-image">이미지를 불러올 수 없어요. 보관 기간은 14일입니다.</span>';},true);

function crewMuteButton(id,muted){return '<button type="button" class="icon-button" data-crew-mute="'+esc(id)+'" data-muted="'+(muted?'1':'0')+'" aria-pressed="'+!!muted+'" aria-label="크루 알림 '+(muted?'켜기':'끄기')+'">'+icon(muted?'bellOff':'bell')+'</button>';}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-crew-mute]');if(b){e.preventDefault();if(b.disabled)return;b.disabled=true;try{const muted=b.dataset.muted!=='1';await api('/api/crews/'+b.dataset.crewMute+'/settings','PUT',{muted});b.dataset.muted=muted?'1':'0';b.setAttribute('aria-pressed',String(muted));b.setAttribute('aria-label','크루 알림 '+(muted?'켜기':'끄기'));b.innerHTML=icon(muted?'bellOff':'bell');updateInboxMute(b.dataset.crewMute,muted,true);toast(muted?'크루 알림을 껐어요.':'크루 알림을 켰어요.');}catch(err){toast(err.message);}finally{b.disabled=false;}return;}
});
async function readAllMessages(){
 const uid=me?.id;if(!uid)return;const prior=dmInboxSnapshot?.uid===uid?dmInboxSnapshot.data:null;
 const optimistic=prior?{...prior,unread:0,direct_unread:0,conversations:prior.conversations.map(p=>({...p,unread:0})),crew:prior.crew?{...prior.crew,unread:0}:null}:null;
 const publish=data=>window.dispatchEvent(new CustomEvent('aifect:inbox-local',{detail:data}));
 if(optimistic){rememberDmInbox(optimistic);publish(optimistic);}paintMessageBadge(0);
 try{await api('/api/dm/read-all','POST');}
 catch(error){if(uid===me?.id&&optimistic&&dmInboxSnapshot?.data===optimistic){rememberDmInbox(prior);publish(prior);paintMessageBadge(prior.unread??(prior.conversations.reduce((sum,p)=>sum+Number(p.unread||0),0)+Number(prior.crew?.unread||0)));}throw error;}
 finally{if(uid===me?.id){window.dispatchEvent(new Event('aifect:inbox-refresh'));void refreshMessageBadge();}}
}


// Update presentation immediately from the successful settings response; counts stay intact.
function updateInboxMute(id,muted,crew=false){
 if(!me?.id||dmInboxSnapshot?.uid!==me.id)return;
 const prior=dmInboxSnapshot.data;
 const data={...prior,conversations:prior.conversations.map(p=>!crew&&p.id===id?{...p,muted}:p),crew:crew&&prior.crew?.id===id?{...prior.crew,muted}:prior.crew};
 rememberDmInbox(data);window.dispatchEvent(new CustomEvent('aifect:inbox-local',{detail:data}));
}
