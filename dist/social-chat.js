const crewRoleLabels={owner:'크루장',deputy:'부크루장',manager:'매니저',member:'크루원'};
const crewDisplayName=p=>p.name+(p.role&&p.role!=='member'?'('+(crewRoleLabels[p.role]||'크루원')+')':'');
function crewPeopleHTML(d){return d.members.map(p=>{const content=portrait(p,'producer')+'<span class="crew-person-copy"><strong>'+userNickname(p.name,{profileId:p.id,userId:p.user_id})+'</strong><small>'+esc(crewRoleLabels[p.role]||'크루원')+'</small></span>';return ['owner','deputy'].includes(d.membership?.role)&&p.role!=='owner'?`<button class="crew-person" data-crew-member="${esc(p.id)}" data-crew="${esc(d.crew.id)}">${content}</button>`:`<a href="#producer/${esc(p.id)}">${content}</a>`;}).join('');}
const crewHellos={
 intro:['안녕하세요! 오늘부터 함께하게 됐어요.','반갑습니다. 여러분의 음악을 듣고 싶어요.','새로 가입했어요. 잘 부탁드려요!','안녕하세요, 함께 노래하게 되어 기뻐요.','첫인사 드립니다. 어떤 곡부터 들어볼까요?','반가워요! 앞으로 자주 이야기 나눠요.'],
 welcome:['어서 오세요! 함께하게 되어 반가워요.','환영합니다. 좋아하는 음악을 들려주세요!','반가워요. 편하게 이야기 나눠요.','크루에 오신 걸 환영해요!','안녕하세요! 함께 만들 음악이 기대돼요.','잘 오셨어요. 요즘 어떤 곡을 듣고 계세요?']
};
const recentCrewHellos=new Map();
function suggestCrewHello(crew,intro){
 const group=intro?'intro':'welcome',key=JSON.stringify([me?.id,crew,group]),recent=recentCrewHellos.get(key)||[];
 const options=crewHellos[group].filter(s=>!recent.includes(s)),text=options[Math.floor(Math.random()*options.length)];
 recentCrewHellos.set(key,[...recent.slice(-2),text]);return text;
}
function bindChatEnter(input,submit){
 let composing=false,pendingEnter=false;
 input.addEventListener('compositionstart',()=>{composing=true;pendingEnter=false;});
 input.addEventListener('compositionend',()=>{
  composing=false;
  // Wait for the IME's final input event, then submit the committed syllable or consonants once.
  if(pendingEnter)queueMicrotask(()=>{if(pendingEnter&&!composing){pendingEnter=false;submit();}});
 });
 input.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.shiftKey){pendingEnter=false;return;}
  if(event.repeat)return;
  if(composing||event.isComposing||event.keyCode===229){pendingEnter=true;return;}
  pendingEnter=false;event.preventDefault();submit();
 });
 // Safari may deliver compositionend before the Enter keydown with keyCode 229.
 input.addEventListener('keyup',event=>{if(event.key==='Enter'&&!event.shiftKey&&pendingEnter&&!composing){pendingEnter=false;submit();}});
 return ()=>composing;
}
function chatNickname(p){return p.chat_nickname??p.name;}
function inboxTime(at){return Number(at)>0?new Date(at*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Seoul'}):'';}
function conversationCopyHTML(p,name,emptyPreview,pinned=false){
 const preview=p.last_message_display??p.last_message;
 const pin=pinned?'<span class="dm-pin" role="img" aria-label="고정된 대화" title="고정된 대화">'+icon('dmPin')+'</span>':'';
 const mute=p.muted?'<span class="conversation-muted" role="img" aria-label="알림 끔" title="알림 끔">'+icon('bellOff')+'</span>':'';
 const dot=Number(p.unread)>0?'<i class="dm-unread-dot" aria-hidden="true"></i>':'';
 return '<div class="conversation-copy"><div class="dm-name-line"><strong title="'+esc(name)+'">'+(pinned?esc(name):userNickname(name,{profileId:p.id,userId:p.user_id}))+'</strong>'+pin+mute+dot+'</div><p>'+esc(preview?.includes('[aifect:')?AifectStickers.preview(preview):preview||emptyPreview)+'</p></div>';
}
function conversationMetaHTML(p){
 const count=Number(p.unread)||0;
 return '<div class="conversation-meta"><time>'+inboxTime(p.updated)+'</time>'+(count>0?'<span class="unread-badge" aria-label="안 읽은 메시지 '+count+'개">'+count+'</span>':'')+'</div>';
}
function dmProfileLink(p,content,cls='dm-profile-link'){return '<a class="'+cls+'" href="#producer/'+esc(p.id)+'" aria-label="'+esc(chatNickname(p))+' 프로필 보기">'+content+'</a>';}
let dmInboxFilter='all';
let dmInboxSnapshot=null;
function rememberDmInbox(data){dmInboxSnapshot={uid:me?.id,data};}

const dmInboxTabs=[['all','전체'],['unread','안 읽음'],['crew','크루'],['notice','공지']];
function dmInboxTabsHTML(){return '<div class="dm-inbox-tabs" role="group" aria-label="메시지 분류">'+dmInboxTabs.map(([key,label])=>'<button type="button" data-dm-filter="'+key+'" aria-pressed="'+(dmInboxFilter===key)+'">'+label+'</button>').join('')+'</div>';}
function dmInboxSelection(conversations,crew,filter){return {conversations:conversations.filter(p=>filter==='all'||filter==='unread'&&Number(p.unread)>0||filter==='notice'&&p.is_notice===true),crew:filter==='all'||filter==='crew'||filter==='unread'&&Number(crew?.unread)>0?crew:null};}
function conversationListHTML(conversations,crew=null,selected=''){const chosen=dmInboxSelection(conversations,crew,dmInboxFilter);conversations=chosen.conversations;crew=chosen.crew;return crewInboxHTML(crew,selected)+(conversations.length?'<div class="conversation-list">'+conversations.map(p=>'<article data-list-row class="surface conversation-row'+(selected===p.id?' is-selected':'')+(Number(p.unread)>0?' is-unread':'')+'">'+dmProfileLink(p,portrait(p,'producer'))+'<a class="conversation-open" href="#dm/'+esc(p.id)+'"'+(selected===p.id?' aria-current="true"':'')+'>'+conversationCopyHTML(p,chatNickname(p),'대화를 시작해보세요.')+conversationMetaHTML(p)+'</a></article>').join('')+'</div>':crew?'':'<div class="dm-empty" role="status"><h2>'+({all:'아직 나눈 대화가 없어요',unread:'안 읽은 메시지가 없어요',crew:'가입한 크루가 없어요',notice:'받은 공지가 없어요'}[dmInboxFilter])+'</h2><p>'+({all:'프로필에서 DM을 보내 대화를 시작해보세요.',unread:'새 메시지가 오면 여기에 표시돼요.',crew:'크루에 가입하면 크루 채팅을 볼 수 있어요.',notice:'운영자 계정의 메시지를 이곳에 모아드려요.'}[dmInboxFilter])+'</p></div>');}
function chatTextHTML(body){return esc(body).replace(/(?:[ \t]*\r?\n[ \t]*)?https:\/\/aifect\.co\.kr\/#(voice|live)\/([a-zA-Z0-9_-]{16,64})(?![a-zA-Z0-9_-])/g,(_,route,id)=>'<a class="small-button dm-room-invite" href="#'+route+'/'+id+'">방 입장하기</a>');}
function chatBodyHTML(body){return body?.includes('[aifect:')?AifectStickers.render(body,chatTextHTML):chatTextHTML(body);}
function chatHTML(messages,peer=null,crew=null){
 let day='';return messages.map(m=>{
  const currentDay=new Date(m.created*1000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}),separator=currentDay!==day?'<div class="chat-day">'+currentDay+'</div>':'';day=currentDay;
  if(m.kind==='system')return separator+'<div class="chat-system">'+esc(m.display_body??m.body)+(crew&&m.body.endsWith('님이 크루에 참여했습니다. 인사를 나눠보세요.')?' <button type="button" class="text-link" data-crew-hello="'+esc(m.id)+'" data-intro="'+(m.user_id===me?.id)+'">인사하기</button>':'')+'</div>';
  const mine=m.sender_id===me?.id||m.user_id===me?.id,name=m.chat_nickname||m.name||(mine?'나':chatNickname(peer||{}))||'리스너',label=crew?crewDisplayName({...m,name}):name;
  const delivery=m.delivery==='sending'?'<small class="chat-delivery">전송 중…</small>':m.delivery==='failed'?'<button class="chat-retry" data-chat-retry="'+esc(m.id)+'">다시 보내기</button>':'';
  const person=peer||{id:m.profile_id,name:label,image_version:m.image_version,player_xp:m.player_xp,profile_frame:m.profile_frame,profile_frame_artwork:m.profile_frame_artwork};
  const linked=!!person.id,face=portrait(person,'producer');
  const avatar=!mine?(linked?dmProfileLink(person,face):'<span class="dm-profile-link">'+face+'</span>'):'';
  const author=mine?'':'<span class="dm-author">'+userNickname(label,{profileId:person.id,userId:m.user_id||m.sender_id})+'</span>'+(crew?.owner&&m.profile_id?'<button type="button" class="icon-button chat-author-menu" data-crew-member="'+esc(m.profile_id)+'" data-crew="'+esc(crew.id)+'" aria-label="'+esc(label)+' 관리">'+icon('ui-menu-action')+'</button>':'');
  const stamp=new Date(m.created*1000).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'});
  const invitation=!crew&&m.crew_invite_id?'<a class="small-button dm-crew-invite" href="#crew/'+esc(m.crew_invite_id)+'">'+icon('users')+' 초대받은 크루 보기 '+icon('chevron')+'</a>':'';
  const body=invitation?m.body.replace('\n크루 둘러보기: https://aifect.co.kr/#crew/'+m.crew_invite_id,''):m.body;
  return separator+'<article class="dm-message '+(mine?'mine':'')+'" data-message="'+esc(m.id)+'">'+avatar+'<div class="dm-message-content">'+author+'<div class="dm-message-line"><div class="dm-bubble"><span class="chat-body">'+(m.image_id?chatImageHTML(m,!!crew):chatBodyHTML(body))+'</span>'+invitation+'</div><div class="chat-message-meta"><time>'+stamp+'</time>'+delivery+'</div></div></div></article>';
 }).join('')||'<div class="chat-empty"><span>'+icon('message')+'</span><strong>음악에서 시작되는 대화</strong><p>반가운 인사나 좋았던 음악을 나눠보세요.</p></div>';
}
function chatPanelHTML(label,initial=null,peer=null,dm=!!peer){
 // The message workspace also enables the rich editor for crew channels.
 const direct=!!peer?.id;
 const composer=(dm?dmEmojiPickerHTML():'')+chatComposer(dm,direct);
 const controls=direct?chatAttachmentTools(peer,composer):chatAttachmentTools(peer)+composer;
 return '<section class="surface chat-panel dm-chat-panel '+(direct?'dm-direct-thread':peer?'':'crew-chat-panel')+'"><button class="small-button chat-earlier" id="chat-earlier" '+(initial?.has_more?'':'hidden')+'>이전 대화 보기</button><div id="chat-log" role="log" aria-label="'+label+'">'+(initial?chatHTML(initial.messages,peer):'')+'</div><p id="chat-connection" class="quiet" role="status"></p><p id="chat-error" role="status"></p>'+controls+'</section>';
}
let socialCleanup=null;
// Only unsent work lives here; server history is always read from the API.
let chatWorkAccount=null;
const chatWork=new Map();
function chatUnsent(uid,path){
 if(chatWorkAccount!==uid){chatWork.clear();chatWorkAccount=uid;}
 if(!chatWork.has(path))chatWork.set(path,{draft:'',pending:new Map(),sending:false});
 return chatWork.get(path);
}
function patchChatLog(log,html){
 if(!document.createElement){log.innerHTML=html;return;}
 const template=document.createElement('template');template.innerHTML=html;
 const key=(node,index)=>node.dataset.message||node.className+':'+node.textContent+':'+index;
 const existing=new Map([...log.children].map((node,index)=>[key(node,index),node]));
 let cursor=log.firstElementChild;
 [...template.content.children].forEach((node,index)=>{
  const prior=existing.get(key(node,index)),next=prior?.outerHTML===node.outerHTML?prior:node;
  if(next===cursor)cursor=cursor.nextElementSibling;else log.insertBefore(next,cursor);
  if(prior&&prior!==next){if(cursor===prior)cursor=prior.nextElementSibling;prior.remove();}
  existing.delete(key(node,index));
 });
 existing.forEach(node=>node.remove());
}
function watchSocialChat(query,changed,status,revoked){
 const ticket=renderId,uid=me?.id;let source=null,retryAt=0,failures=0,lastBeat=0,lastFallback=0,closed=false;
 const current=()=>!closed&&ticket===renderId&&uid===me?.id;
 const disconnect=()=>{source?.close();source=null;};
 const connect=()=>{
  if(!current()||document.hidden||!navigator.onLine)return;
  disconnect();lastBeat=Date.now();status('');
  try{source=new EventSource('/api/chat/events'+query);}catch{failed();return;}
  source.addEventListener('change',()=>{lastBeat=Date.now();failures=0;status('');changed();});
  source.addEventListener('heartbeat',()=>{lastBeat=Date.now();failures=0;status('');});
  source.addEventListener('rotate',()=>{disconnect();retryAt=Date.now()+200;});
  source.addEventListener('retry',failed);source.onerror=failed;
  source.addEventListener('revoked',()=>{cleanup();revoked();});
 };
 const failed=()=>{if(!current())return;disconnect();failures++;retryAt=Date.now()+Math.min(15000,1000*2**Math.min(failures-1,4));status(failures>3?'새 메시지 연결을 확인하고 있어요.':'');changed();lastFallback=Date.now();};
 const visibility=()=>{disconnect();if(document.hidden||!navigator.onLine)status(navigator.onLine?'':'오프라인 · 연결되면 다시 불러옵니다');else connect();};
 const pagehide=()=>disconnect();
 const cleanup=()=>{closed=true;disconnect();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',visibility);window.removeEventListener('offline',visibility);window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',visibility);};
 const timer=setInterval(()=>{if(!current()){cleanup();return;}if(document.hidden||!navigator.onLine)return;
  if(source&&Date.now()-lastBeat>8000)failed();
  if(!source&&Date.now()>=retryAt)connect();
  if(failures&&Date.now()-lastFallback>3000){lastFallback=Date.now();changed();}
 },1000);
 document.addEventListener('visibilitychange',visibility);window.addEventListener('online',visibility);window.addEventListener('offline',visibility);window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',visibility);
 connect();return cleanup;
}
function dmWorkspaceHeight(bottom,top,inset,payoutLine,keyboard=false){return Math.max(keyboard?0:180,Math.min(bottom-inset,Number.isFinite(payoutLine)?payoutLine-12:bottom-inset)-top);}
function dmPayoutLine(){if(innerWidth<=800)return undefined;const r=document.querySelector('#sidebar a[href="#payouts"]')?.getBoundingClientRect();return r?.height>0?r.top+r.height/2:undefined;}
function bindSocialChat(view){
 if(!view?.inbox&&!view?.chat)return;
 const ticket=renderId,uid=me?.id,current=()=>ticket===renderId&&uid===me?.id;
 let inboxData=uid&&dmInboxSnapshot?.uid===uid?dmInboxSnapshot.data:null;
 let watchedCrew=null,stopCrewInbox=null;
 // The personal inbox stream tracks direct messages. Crew changes have their own stream.
 const syncCrewInbox=crew=>{
  const id=crew?.id===view.chat?.crew?.id?null:crew?.id;
  if(id===watchedCrew)return;
  stopCrewInbox?.();watchedCrew=id;
  stopCrewInbox=id?watchSocialChat('?crew='+encodeURIComponent(id),refreshInbox,()=>{},refreshInbox):null;
 };
 const paintInbox=d=>{const root=$('#dm-conversations'),html=conversationListHTML(d.conversations,d.crew,view.selectedConversation||'');if(root&&root.innerHTML!==html)root.innerHTML=html;};
 const tabs=document.querySelector('.dm-inbox-tabs');const filter=e=>{const b=e.target.closest('[data-dm-filter]');if(!b)return;dmInboxFilter=b.dataset.dmFilter;tabs.querySelectorAll('[data-dm-filter]').forEach(t=>t.setAttribute('aria-pressed',String(t.dataset.dmFilter===dmInboxFilter)));if(inboxData)paintInbox(inboxData);};tabs?.addEventListener('click',filter);
 let inboxFetching=false,inboxAgain=false,inboxVersion=0;
 const loadInbox=async()=>{if(!view?.inbox||!current())return;if(inboxFetching){inboxAgain=true;return;}inboxFetching=true;
  try{do{inboxAgain=false;const version=inboxVersion,d=await api('/api/dm');if(!current())return;if(version!==inboxVersion)continue;inboxData=d;rememberDmInbox(d);paintInbox(d);syncCrewInbox(d.crew);$('#dm-list-error').textContent='';}while(inboxAgain&&current());}
  catch(e){if(current())$('#dm-list-error').textContent=e.message;}finally{inboxFetching=false;}
 };
 const localInbox=e=>{if(current()&&view?.inbox&&e.detail){inboxVersion++;inboxData=e.detail;paintInbox(inboxData);}};const refreshInbox=()=>{void loadInbox();};if(view?.inbox){window.addEventListener('aifect:inbox-local',localInbox);window.addEventListener('aifect:inbox-refresh',refreshInbox);}
 if(view.inbox)syncCrewInbox(inboxData?.crew);
 const clearInboxEvents=()=>{stopCrewInbox?.();window.removeEventListener('aifect:inbox-local',localInbox);window.removeEventListener('aifect:inbox-refresh',refreshInbox);};
 if(view?.inbox&&!view.chat){if(view.refreshInbox)void loadInbox();const stop=watchSocialChat('',loadInbox,()=>{},()=>{$('#dm-list-error').textContent='로그인 상태를 다시 확인해주세요.';});socialCleanup=()=>{clearInboxEvents();stop();tabs?.removeEventListener('click',filter);};return;}
 if(!view?.chat)return;
 if(view.refreshInbox)void loadInbox();
 const {path,peer,crew,initial}=view.chat,form=$('#chat-compose'),log=$('#chat-log'),earlier=$('#chat-earlier'),input=form.querySelector('textarea')||form.querySelector('[data-dm-editor]'),sendButton=form.querySelector('[data-chat-send]');
 const unsent=chatUnsent(uid,path),messages=new Map((initial?.messages||[]).map(m=>[m.id,m]));
 const editor=input.dataset?.dmEditor!==undefined?AifectStickers.editor(input,toast):null;
 const draft=()=>editor?editor.get():input.value;
 const setDraft=value=>{if(editor)editor.set(value);else input.value=value;};
 const draftKey=editor&&uid?'aifect:dm-draft:'+JSON.stringify([uid,path]):null;
 if(draftKey){try{unsent.draft=sessionStorage.getItem(draftKey)??unsent.draft;}catch{}}
 const saveDraft=()=>{const value=draft();if(value===unsent.draft)return;unsent.draft=value;
  if(draftKey){try{if(value)sessionStorage.setItem(draftKey,value);else sessionStorage.removeItem(draftKey);}catch{}}
 };
 setDraft(unsent.draft);unsent.pending.forEach((m,id)=>messages.set(id,m));
 let fetching=false,again=false,initialized=!!initial,lastHTML=null,sending=false,denied=false,chatGeneration=0;
 // The direct rich editor grows intrinsically up to its CSS max-height.
 const resizeInput=()=>{saveDraft();if(peer?.id&&editor)return;input.style.height='auto';input.style.height=Math.min(120,Math.max(46,(input.scrollHeight||44)+2))+'px';};
 input.addEventListener('input',resizeInput);resizeInput();
 // Only a history read advances the cursor. A POST can return a newer message
 // before intervening messages from another member have arrived.
 let latestSequence=Math.max(0,...(initial?.messages||[]).map(m=>m.sequence||0)),joinedSequence=crew?(initial?.membership?.joined_sequence??null):null,readThrough=0;
 const acknowledge=async()=>{
  if(document.hidden||!current()||latestSequence<=readThrough)return;
  const sequence=latestSequence;
  if(peer)await api(path,'PATCH',{sequence});
  if(crew)await api('/api/crews/'+crew.id+'/read','POST',{sequence});
  if(current())readThrough=Math.max(readThrough,sequence);
 };
 const sorted=()=>[...messages.values()].sort((a,b)=>(a.sequence||Number.MAX_SAFE_INTEGER)-(b.sequence||Number.MAX_SAFE_INTEGER)||a.created-b.created);
 const merge=incoming=>incoming.forEach(m=>{if(m.request_id&&(m.user_id===uid||m.sender_id===uid)){messages.delete('pending:'+m.request_id);unsent.pending.delete('pending:'+m.request_id);}messages.set(m.id,m);});
 merge(initial?.messages||[]);
 const mobileChat=()=>window.AifectMobileInput?.isMobile()??innerWidth<=800;
 const paint=(older=false,forceBottom=false)=>{const nearBottom=forceBottom||(!mobileChat()&&document.activeElement===input)||log.scrollHeight-log.scrollTop-log.clientHeight<90,top=log.scrollTop,height=log.scrollHeight;const html=chatHTML(sorted(),peer,crew);if(html===lastHTML){if(forceBottom)log.scrollTop=log.scrollHeight;return;}lastHTML=html;patchChatLog(log,html);if(older)log.scrollTop=top+log.scrollHeight-height;else if(nearBottom)log.scrollTop=log.scrollHeight;};
 const deny=()=>{denied=true;socialCleanup?.();if(crew){chatGeneration++;unsent.pending.clear();setDraft('');saveDraft();messages.clear();latestSequence=0;lastHTML=null;paint(false,true);}if(editor)editor.disable();else input.disabled=true;sendButton.disabled=true;$('#chat-connection').textContent='연결 종료';$('#chat-error').textContent='로그인 또는 크루 가입 상태를 다시 확인해주세요.';};
 if(initial)paint(false,true);else log.innerHTML='<p class="quiet" role="status">대화를 불러오는 중…</p>';
 const load=async(older=false)=>{
  if(!current()||denied)return;if(fetching){if(!older)again=true;else earlier.disabled=false;return;}fetching=true;
  try{do{again=false;const list=sorted().filter(m=>m.sequence),cursor=older?list[0]?.sequence:latestSequence;
   const d=await api(path+(cursor?'?'+(older?'before':'after')+'='+cursor:''));if(!current())return;
   if(crew){const boundary=Number(d.membership?.joined_sequence)||0;
    if(joinedSequence!==null&&joinedSequence!==boundary){chatGeneration++;messages.clear();latestSequence=0;initialized=false;lastHTML=null;joinedSequence=boundary;paint(false,true);if(cursor){again=true;older=false;continue;}}
    joinedSequence=boundary;
   }
   if(peer){const cutoff=Number(d.settings?.cleared_sequence)||0;messages.forEach((m,id)=>{if(m.sequence&&m.sequence<=cutoff)messages.delete(id);});}
   merge(d.messages);
   if(!older)latestSequence=Math.max(latestSequence,...d.messages.map(m=>m.sequence||0));
   if(d.member_roles){const roles=new Map(d.member_roles.map(m=>[m.profile_id,m.role]));messages.forEach(m=>{if(roles.has(m.profile_id))m.role=roles.get(m.profile_id);});if(crew)crew.owner=d.membership?.role==='owner';}
   if(older||!initialized)earlier.hidden=!d.has_more;initialized=true;paint(older);$('#chat-error').textContent='';
   await acknowledge();
   void refreshMessageBadge();
   if(!older&&cursor&&d.has_more)again=true;
  }while(again&&current()&&!older);void loadInbox();}
  catch(e){if(current()){$('#chat-error').textContent=e.message;if([401,403].includes(e.status))deny();}}
  finally{fetching=false;earlier.disabled=false;if(again&&older&&current())void load();}
 };
 earlier.onclick=()=>{earlier.disabled=true;load(true);};
 const stickers=editor?bindDmEmoji(form,input,editor):null;
 const isComposing=bindChatEnter(input,()=>{if(input.isConnected&&current()&&draft().trim()&&!sendButton.disabled)form.requestSubmit();});

 log.addEventListener('click',e=>{const b=e.target.closest('[data-crew-hello]');if(!b||denied||!crew)return;
  setDraft(suggestCrewHello(crew.id,b.dataset.intro==='true'));
  b.textContent='다른 인사';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
 });
 const send=async pending=>{
  const generation=chatGeneration;
  if(sending||unsent.sending||denied||!current())return;sending=true;unsent.sending=true;sendButton.disabled=true;pending.delivery='sending';unsent.pending.set(pending.id,pending);messages.set(pending.id,pending);paint(false,true);$('#chat-error').textContent='';
  try{const result=await api(path,'POST',{body:pending.body,request_id:pending.request_id,...(pending.image_id?{image_id:pending.image_id}:{})});unsent.pending.delete(pending.id);if(!current()||generation!==chatGeneration)return;
   if(result.message){messages.delete(pending.id);merge([result.message]);paint(false,true);}else await load();
  }catch(e){if(unsent.pending.has(pending.id))pending.delivery='failed';if(current()){
   // A stream may confirm the same request before the POST response is lost.
   if(messages.has(pending.id)){pending.delivery='failed';paint();$('#chat-error').textContent=e.message;}
   if([401,403].includes(e.status))deny();
  }}finally{sending=false;unsent.sending=false;if(current())sendButton.disabled=denied;}
 };
 form.onsubmit=event=>{event.preventDefault();if(isComposing()||sending||unsent.sending||denied||form.dataset.uploading||!draft().trim()||(editor&&!editor.canSend()))return;const rid=crypto.randomUUID(),body=draft().trim();setDraft('');stickers?.sent();resizeInput();
  void send({id:'pending:'+rid,request_id:rid,body,created:Math.floor(Date.now()/1000),user_id:uid,sender_id:uid,name:me.name,profile_id:me.profile_id,role:crew?.owner?'owner':'member'});
 };
 log.addEventListener('click',event=>{const retry=event.target.closest('[data-chat-retry]');if(retry&&messages.has(retry.dataset.chatRetry))void send(messages.get(retry.dataset.chatRetry));});
 bindChatImageUpload(peer,path,send,()=>sending||denied||!current());
 // Opening a room also acknowledges older unread messages outside the last page.
 if(initial)acknowledge().then(()=>{if(current()){void refreshMessageBadge();}}).catch(e=>{if(current())$('#chat-error').textContent='읽음 상태를 반영하지 못했어요. '+e.message;});
 const query=crew?'?crew='+encodeURIComponent(crew.id):view.inbox?'':'?peer='+encodeURIComponent(path.split('/').at(-1));
 // History must not wait for the first SSE event or a stream timeout.
 if(!initial)void load();
 const stopStream=watchSocialChat(query,()=>{void load();},text=>{if(current())$('#chat-connection').textContent=text;},deny);
 const stopInbox=crew&&view.inbox?watchSocialChat('',loadInbox,()=>{},deny):()=>{};
 // Resize only the conversation pane, never scroll the whole document while typing.
 document.body.classList.add('chat-active');
 const panel=log.closest('.chat-panel');let pinned=true,frame=0;
 const onScroll=()=>{pinned=log.scrollHeight-log.scrollTop-log.clientHeight<90;};
 const anchor=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!current())return;if(pinned||(!mobileChat()&&document.activeElement===input))log.scrollTop=log.scrollHeight;});};
 const workspace=panel.closest?.('.message-workspace'),target=workspace||panel;
 const viewport=()=>{
  if(!current())return;
  // The router binds while #main is display:none. Measuring that state returns
  // top=0 and previously left the composer one header-height behind the tabs.
  if(target.getClientRects&&!target.getClientRects().length)return;
  resizeInput();
  const vv=window.visualViewport,geometry=window.AifectMobileInput?.measure();if(geometry?.scaled)return;
  const keyboard=mobileChat()&&!!geometry?.keyboard&&document.documentElement.hasAttribute('data-mobile-keyboard');
  document.body.classList.toggle('chat-keyboard',keyboard);
  if(workspace&&!mobileChat()){panel.style.height='';anchor();return;}
  const bottom=geometry?.bottom??((vv?.height||innerHeight)+(vv?.offsetTop||0));
  const header=document.querySelector('.topbar')?.getBoundingClientRect();
  const top=workspace&&mobileChat()?(keyboard?(geometry?.top||0):(header?.bottom??90)):target.getBoundingClientRect().top;
  if(workspace&&mobileChat())workspace.style.setProperty('--chat-workspace-top',top+'px');
  const nav=document.querySelector('.mobile-navigation')?.getBoundingClientRect();
  const player=document.querySelector('.player:not([hidden])')?.getBoundingClientRect();
  const boundary=keyboard?bottom:Math.min(bottom,nav?.height?nav.top:bottom,player?.height?player.top:bottom);
  const available=dmWorkspaceHeight(boundary,top,workspace?0:(keyboard?0:12),undefined,true);
  workspace?.toggleAttribute('data-chat-compact',available<340);
  target.style.height=available+'px';
  if(workspace)panel.style.height='';anchor();
 };
 const resize=new ResizeObserver(anchor);resize.observe(log);
 log.addEventListener('scroll',onScroll,{passive:true});log.addEventListener('load',anchor,true);
 input.addEventListener('focus',viewport);input.addEventListener('blur',viewport);
 window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);viewport();
 // Observe visibility/layout after RenderState.ready, not just keyboard focus.
 const layoutResize=new ResizeObserver(viewport);layoutResize.observe(target);
 const readyFrame=requestAnimationFrame(viewport);
 window.addEventListener('aifect:input-viewport',viewport);
 window.addEventListener('aifect:topbar-layout',viewport);
 socialCleanup=()=>{saveDraft();stickers?.destroy();editor?.destroy();input.removeEventListener('input',resizeInput);clearInboxEvents();tabs?.removeEventListener('click',filter);document.body.classList.remove('chat-keyboard','chat-active');stopStream();stopInbox();resize.disconnect();layoutResize.disconnect();cancelAnimationFrame(frame);cancelAnimationFrame(readyFrame);log.removeEventListener('scroll',onScroll);log.removeEventListener('load',anchor,true);input.removeEventListener('focus',viewport);input.removeEventListener('blur',viewport);window.visualViewport?.removeEventListener('resize',viewport);window.visualViewport?.removeEventListener('scroll',viewport);window.removeEventListener('resize',viewport);window.removeEventListener('aifect:input-viewport',viewport);window.removeEventListener('aifect:topbar-layout',viewport);};
}

document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-crew-member]');if(!button)return;event.preventDefault();
 try{
  const cid=button.dataset.crew,pid=button.dataset.crewMember,d=await api('/api/crews/'+cid),person=d.members.find(p=>p.id===pid);
  if(!person)return toast('이미 크루에서 나간 멤버예요.');
  if(!['owner','deputy'].includes(d.membership?.role))return void(location.hash='producer/'+pid);
  dialog(`<h2>${userNickname(person.name,{profileId:pid,userId:person.user_id})}</h2><a class="text-link" href="#producer/${esc(pid)}" data-close-dialog>프로필 보기</a><form id="crew-role-form" ${d.membership?.role==='owner'?'':'hidden'}><label class="form-field">크루 직책<select name="role">${Object.entries(crewRoleLabels).filter(([role])=>role!=='owner').map(([role,label])=>`<option value="${role}" ${person.role===role?'selected':''}>${label}</option>`).join('')}</select></label><p class="field-help">직책 변경은 크루장, 강퇴는 크루장·부크루장이 할 수 있어요.</p><button class="primary-button">직책 저장</button><p class="form-error" role="alert"></p></form><button class="small-button crew-kick" id="crew-kick">크루에서 강퇴</button>`);
  const refresh=async()=>{const draft=$('#chat-compose textarea')?.value;$('#dialog').close();await render();if(draft&&$('#chat-compose textarea'))$('#chat-compose textarea').value=draft;};
  const form=$('#crew-role-form');form.onsubmit=busyForm(form,async fd=>{await api(`/api/crews/${cid}/members/${pid}`,'PATCH',{role:fd.get('role')});await refresh();});
  $('#crew-kick').onclick=async()=>{if(!confirm(person.name+'님을 강퇴할까요? 이 크루에 다시 가입할 수 없게 됩니다.'))return;try{await api(`/api/crews/${cid}/members/${pid}`,'DELETE');await refresh();}catch(e){toast(e.message);}};
 }catch(e){toast(e.message);}
});
