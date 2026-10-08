function dmMuteButton(p){return '<button type="button" class="icon-button dm-mute" data-dm-mute="'+esc(p.id)+'" data-muted="'+(p.muted?'1':'0')+'" aria-label="'+esc(p.name)+' 알림 '+(p.muted?'켜기':'끄기')+'" aria-pressed="'+Boolean(p.muted)+'">'+icon(p.muted?'bellOff':'bell')+'</button>';}
function inboxControlsHTML(){return '<div class="inbox-tools"><button type="button" class="text-link" data-dm-read-all>모두 읽음</button><button type="button" class="icon-button" data-dm-clear="all" aria-label="내 DM 전체 삭제">'+icon('trash')+'</button></div>';}
function crewInboxHTML(c){return c?'<a class="surface conversation-row pinned-crew" href="#dm/crew/'+esc(c.id)+'"><span class="crew-inbox-art">'+(c.image_version?'<img src="/media/crew/'+esc(c.id)+'?v='+esc(c.image_version)+'" alt="">':icon('users'))+'</span><div class="conversation-copy"><small>내 크루 · 고정</small><strong>'+esc(c.name)+'</strong><p>크루 채팅</p></div>'+(c.unread?'<span class="unread-badge">'+number(c.unread)+'</span>':'')+icon('chevron')+'</a>':'';}
function dmThreadActions(p,settings={}){return '<div class="dm-thread-actions">'+dmMuteButton({...p,muted:settings?.muted})+'<button type="button" class="icon-button" data-dm-clear="'+esc(p.id)+'" aria-label="내 대화 전체 삭제">'+icon('trash')+'</button></div>';}
function chatAttachmentTools(p){return '<div class="chat-attachment-tools"><label class="icon-button" role="button" tabindex="0" aria-label="사진 보내기">'+icon('image')+'<input id="chat-image-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></label><button type="button" class="icon-button" data-profile-gift="'+esc(p.id)+'" aria-label="선물 보내기">'+icon('gift')+'</button><small>사진은 서버에 14일 동안 보관돼요.</small></div><p id="chat-upload-status" class="field-help" role="status"></p>';}
function chatImageHTML(m){return m.image_expires&&m.image_expires*1000<=Date.now()?'<span class="expired-chat-image">보관 기간이 지난 사진</span>':'<a class="chat-image" href="/media/dm/'+esc(m.image_id)+'" target="_blank" rel="noopener"><img src="/media/dm/'+esc(m.image_id)+'" alt="받은 사진" loading="lazy"></a>';}
async function uploadChatImage(path,file){const image=await optimizeUploadImage(file),r=await fetch(path,{method:'PUT',headers:{'content-type':'image/webp'},body:image});const d=await r.json();if(!r.ok)throw new Error(d.error||'이미지를 올리지 못했어요.');return d;}
function bindChatImageUpload(peer,path,send,blocked){
 const input=$('#chat-image-file');if(!input)return;input.parentElement.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}};
 input.onchange=async()=>{const file=input.files[0],uid=me?.id,ticket=renderId;if(!file||blocked())return;input.disabled=true;const compose=$('#chat-compose'),submit=compose?.querySelector('[data-chat-send]');if(compose)compose.dataset.uploading='1';if(submit)submit.disabled=true;const status=$('#chat-upload-status');status.textContent='사진을 변환하고 있어요…';
  try{const uploaded=await uploadChatImage(path+'/images',file);if(uid!==me?.id||ticket!==renderId)return;const rid=crypto.randomUUID();await send({id:'pending:'+rid,request_id:rid,body:'사진',image_id:uploaded.id,image_expires:uploaded.expires,created:Math.floor(Date.now()/1000),sender_id:uid,user_id:uid});status.textContent='';}
  catch(e){if(input.isConnected)status.textContent=e.message;}finally{input.disabled=false;input.value='';if(compose)delete compose.dataset.uploading;if(submit&&submit.isConnected)submit.disabled=false;}
 };
}
function crewHomeMedia(c,m){return '<section class="crew-home-media">'+(c.image_version?'<img class="crew-main-image" src="/media/crew/'+esc(c.id)+'?v='+esc(c.image_version)+'" alt="'+esc(c.name)+' 대표 이미지">':m?.role==='owner'?'<button type="button" class="crew-image-placeholder" data-edit-crew="'+esc(c.id)+'">'+icon('image')+' 크루 대표 이미지 설정</button>':'')+(m?'<a class="crew-chat-entry" href="#dm/crew/'+esc(c.id)+'">'+icon('message')+'<span><strong>크루 채팅창 들어가기</strong><small>크루원들과 음악과 이야기를 나눠보세요.</small></span>'+icon('chevron')+'</a>':'')+'</section>';}
async function crewChatView(raw){const cid=raw.split('?')[0].split('/')[2];if(!cid)throw new Error('크루를 선택해주세요.');const d=await api('/api/crews/'+encodeURIComponent(cid));if(!d.membership)throw new Error('가입한 크루에서 대화할 수 있어요.');return {html:'<header class="dm-thread-header"><a href="#dm" class="icon-button" aria-label="대화 목록">'+icon('back')+'</a><h1>'+esc(d.crew.name)+'</h1><a class="text-link" href="#crew/'+esc(cid)+'">크루 홈</a></header>'+chatPanelHTML('크루 채팅'),chat:{path:'/api/crews/'+cid+'/messages',crew:{id:cid,owner:d.membership.role==='owner'}}};}
let messageBadgeBusy=false,messageBadgeAccount=null;
async function refreshMessageBadge(){
 const uid=me?.id;if(!uid){paintMessageBadge(0);messageBadgeAccount=null;return;}
 if(messageBadgeBusy||document.hidden)return;messageBadgeBusy=true;
 try{const d=await api('/api/dm/summary');if(uid===me?.id){messageBadgeAccount=uid;paintMessageBadge(d.unread);}}
 catch{}finally{messageBadgeBusy=false;}
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
  if(clear){if(!confirm('내 '+(clear.dataset.dmClear==='all'?'DM 전체':'대화 기록')+'를 삭제할까요? 상대방의 기록은 유지되며 새 메시지는 다시 표시돼요.'))return;await api('/api/dm'+(clear.dataset.dmClear==='all'?'':'/'+clear.dataset.dmClear),'DELETE');if(location.hash!=='#dm')location.hash='dm';else await render();}
  void refreshMessageBadge();
 }catch(err){toast(err.message);}finally{b.disabled=false;}
});
document.addEventListener('error',e=>{if(e.target.matches?.('.chat-image img'))e.target.closest('.chat-image').outerHTML='<span class="expired-chat-image">이미지를 불러올 수 없어요. 보관 기간은 14일입니다.</span>';},true);
