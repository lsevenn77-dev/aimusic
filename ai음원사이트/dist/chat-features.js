function dmMuteButton(p){return '<button type="button" class="icon-button dm-mute" data-dm-mute="'+esc(p.id)+'" data-muted="'+(p.muted?'1':'0')+'" aria-label="'+esc(p.name)+' 알림 '+(p.muted?'켜기':'끄기')+'" aria-pressed="'+Boolean(p.muted)+'">'+icon(p.muted?'bellOff':'bell')+'</button>';}
function inboxControlsHTML(){return '<div class="inbox-tools"><button type="button" class="text-link" data-dm-read-all>모두 읽음</button><a href="#dm/blocked" class="text-link">차단 관리</a></div>';}
function crewInboxHTML(c,selected=''){return c?'<a class="surface conversation-row pinned-crew'+(selected==='crew/'+c.id?' is-selected':'')+'" href="#dm/crew/'+esc(c.id)+'"'+(selected==='crew/'+c.id?' aria-current="true"':'')+'><span class="crew-inbox-art">'+(c.image_version?'<img src="/media/crew/'+esc(c.id)+'?v='+esc(c.image_version)+'" alt="">':icon('users'))+'</span><div class="conversation-copy"><small>내 크루 · 고정</small><strong>'+esc(c.name)+'</strong><p>크루 채팅</p></div>'+(c.unread?'<span class="unread-badge">'+number(c.unread)+'</span>':'')+icon('chevron')+'</a>':'';}
function dmThreadActions(p,settings={}){return '<div class="dm-thread-actions">'+dmMuteButton({...p,muted:settings?.muted})+'<button type="button" class="icon-button" data-dm-clear="'+esc(p.id)+'" aria-label="이 대화방 내용 전체 삭제" title="이 대화방 내용 전체 삭제">'+icon('trash')+'</button>'+(p.user_id?'<button type="button" class="small-button dm-block-button" data-person-block="'+esc(p.user_id)+'" data-block-name="'+esc(p.name)+'">차단</button>':'')+'</div>';}
function chatAttachmentTools(p){return '<div class="chat-attachment-tools"><label class="icon-button" role="button" tabindex="0" aria-label="사진 보내기">'+icon('image')+'<input id="chat-image-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>'+(p?'<button type="button" class="icon-button" data-profile-gift="'+esc(p.id)+'" aria-label="선물 보내기">'+icon('gift')+'</button>':'')+'<small>사진은 서버에 14일 동안 보관돼요.</small></div><p id="chat-upload-status" class="field-help" role="status"></p>';}
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
async function crewChatView(raw){const cid=raw.split('?')[0].split('/')[2];if(!cid)throw new Error('크루를 선택해주세요.');const d=await api('/api/crews/'+encodeURIComponent(cid));if(!d.membership)throw new Error('가입한 크루에서 대화할 수 있어요.');return {html:'<header class="dm-thread-header"><a href="#dm" class="icon-button" aria-label="대화 목록">'+icon('back')+'</a><a class="dm-thread-person" href="#crew/'+esc(cid)+'"><span class="crew-chat-avatar">'+icon('users')+'</span><div><h1>'+esc(d.crew.name)+'</h1><small>'+number(d.crew.members)+'명 · 크루 홈 보기</small></div></a>'+crewMuteButton(d.crew.id,d.membership.muted)+'</header>'+chatPanelHTML('크루 채팅'),chat:{path:'/api/crews/'+cid+'/messages',crew:{id:cid,owner:d.membership.role==='owner'}}};}
let messageBadgeBusy=false,messageBadgeAccount=null,messageBadgeAgain=false,messageBadgeVersion=0;
async function blockedPeopleView(profileId='',known=null){
 const d=known||await api('/api/blocks'),people=profileId?d.blocks.filter(p=>p.profile_id===profileId):d.blocks;
 if(profileId&&!people.length)return null;
 const inbox=await api('/api/dm'),thread='<header class="dm-thread-header"><a class="small-button" href="#dm">'+icon('back')+' 대화 목록</a><h1>차단 관리</h1></header><section class="blocked-people"><p>차단한 상대와는 메시지를 주고받을 수 없어요. 기존 대화는 삭제되지 않으며, 해제하면 다시 확인할 수 있어요.</p>'+ (people.length?people.map(p=>'<article><strong>'+esc(p.name)+'</strong><button class="small-button" data-person-unblock="'+esc(p.id)+'" data-block-name="'+esc(p.name)+'">차단 해제</button></article>').join(''):'<p class="social-empty">차단한 이용자가 없어요.</p>')+'</section>';
 return {html:dmInboxHTML(inbox,thread,profileId),inbox:true,selectedConversation:profileId};
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-person-block],[data-person-unblock]');if(!b)return;e.preventDefault();
 if(b.disabled)return;const blocking=!!b.dataset.personBlock,uid=me?.id,target=b.dataset.personBlock||b.dataset.personUnblock;
 if(!uid||!target)return;
 if(!confirm(b.dataset.blockName+'님을 '+(blocking?'차단할까요?\n서로 메시지를 보낼 수 없고 상대의 콘텐츠가 숨겨져요. 차단 관리에서 해제할 수 있어요.':'차단 해제할까요?')))return;
 b.disabled=true;
 try{await api('/api/blocks/'+encodeURIComponent(target),blocking?'PUT':'DELETE');if(uid!==me?.id)return;socialCleanup?.();await render();void refreshMessageBadge();toast(blocking?'상대방을 차단했어요.':'차단을 해제했어요.');}
 catch(err){if(uid===me?.id)toast(err.message);}finally{if(b.isConnected)b.disabled=false;}
});
async function refreshMessageBadge(){
 const version=++messageBadgeVersion,uid=me?.id;if(!uid){paintMessageBadge(0);messageBadgeAccount=null;return;}
 if(document.hidden)return;
 if(messageBadgeBusy){messageBadgeAgain=true;return;}messageBadgeBusy=true;
 try{const d=await api('/api/dm/summary','GET',undefined,{fresh:true});if(uid===me?.id&&version===messageBadgeVersion){messageBadgeAccount=uid;paintMessageBadge(d.unread);}}
 catch{}finally{messageBadgeBusy=false;if(messageBadgeAgain){messageBadgeAgain=false;void refreshMessageBadge();}}
}
function paintMessageBadge(count){document.querySelectorAll('[data-primary-view="dm"],#sidebar a[href="#dm"],.header-messages').forEach(link=>{let badge=link.querySelector('.nav-message-badge');if(!badge){badge=document.createElement('b');badge.className='nav-message-badge';link.append(badge);}badge.hidden=!count;badge.textContent=count>99?'99+':String(count||0);badge.setAttribute('aria-label','안 읽은 메시지 '+count+'개');});}
setInterval(()=>{if(messageBadgeAccount!==me?.id)paintMessageBadge(0);void refreshMessageBadge();},8000);
window.addEventListener('focus',refreshMessageBadge);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshMessageBadge();});
if(typeof accountReady!=='undefined')Promise.resolve(accountReady).then(refreshMessageBadge);
document.addEventListener('click',async e=>{
 const mute=e.target.closest('[data-dm-mute]'),clear=e.target.closest('[data-dm-clear]'),read=e.target.closest('[data-dm-read-all]');if(!mute&&!clear&&!read)return;e.preventDefault();e.stopPropagation();const b=mute||clear||read;if(b.disabled)return;b.disabled=true;
 try{
  if(mute){const muted=mute.dataset.muted!=='1';await api('/api/dm/'+mute.dataset.dmMute+'/settings','PUT',{muted});mute.dataset.muted=muted?'1':'0';mute.setAttribute('aria-pressed',String(muted));mute.setAttribute('aria-label','대화 알림 '+(muted?'켜기':'끄기'));mute.innerHTML=icon(muted?'bellOff':'bell');toast(muted?'이 대화의 푸시 알림을 껐어요.':'이 대화의 푸시 알림을 켰어요.');}
  if(read){await api('/api/dm/read-all','POST');await render();}
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
 const b=e.target.closest('[data-crew-mute]');if(b){e.preventDefault();if(b.disabled)return;b.disabled=true;try{const muted=b.dataset.muted!=='1';await api('/api/crews/'+b.dataset.crewMute+'/settings','PUT',{muted});b.dataset.muted=muted?'1':'0';b.setAttribute('aria-pressed',String(muted));b.setAttribute('aria-label','크루 알림 '+(muted?'켜기':'끄기'));b.innerHTML=icon(muted?'bellOff':'bell');toast(muted?'크루 알림을 껐어요.':'크루 알림을 켰어요.');}catch(err){toast(err.message);}finally{b.disabled=false;}return;}
 const rank=e.target.closest('[data-gift-ranking]');if(!rank)return;e.preventDefault();const serial=++giftDialogSerial;dialog('<h2>선물 랭킹 TOP 50</h2><p role="status">불러오는 중…</p>');try{const d=await api('/api/producers/'+encodeURIComponent(rank.dataset.giftRanking)+'/gifts');if(serial!==giftDialogSerial||!$('#dialog').open)return;dialog('<h2>선물 랭킹 TOP 50</h2><p class="field-help">누적 응원 · 1 G와 1 S는 각각 1점</p><ol class="profile-fan-ranking">'+d.ranking.map(r=>'<li><b>'+r.rank+'</b>'+(r.profile_id?'<a href="#producer/'+esc(r.profile_id)+'" data-close-dialog>':'<span>')+('<span class="fan-initial profile-avatar">'+avatarImage(r)+'</span>')+'<span>'+esc(r.name)+'<small>'+number(r.gold)+' G · '+number(r.stars)+' S'+'</small></span>'+(r.profile_id?'</a>':'</span>')+'<strong>'+number(r.score)+'점</strong></li>').join('')+'</ol>'+(!d.ranking.length?'<p>아직 받은 선물이 없어요.</p>':''));}catch(err){if(serial===giftDialogSerial)dialog('<h2>선물 랭킹</h2><p>'+esc(err.message)+'</p>');}
});
