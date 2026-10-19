const crewRoleLabels={owner:'크루장',deputy:'부크루장',operator:'운영자',manager:'매니저',member:'크루원'};
const crewDisplayName=p=>p.name+(p.role&&p.role!=='member'?'('+(crewRoleLabels[p.role]||'크루원')+')':'');
function crewPeopleHTML(d){return d.members.map(p=>{const content=portrait(p,'producer')+'<span class="crew-person-copy"><strong>'+esc(p.name)+'</strong><small>'+esc(crewRoleLabels[p.role]||'크루원')+'</small></span>';return d.membership?.role==='owner'&&p.role!=='owner'?`<button class="crew-person" data-crew-member="${esc(p.id)}" data-crew="${esc(d.crew.id)}">${content}</button>`:`<a href="#producer/${esc(p.id)}">${content}</a>`;}).join('');}
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
function dmProfileLink(p,content,cls='dm-profile-link'){return '<a class="'+cls+'" href="#producer/'+esc(p.id)+'" aria-label="'+esc(p.name)+' 프로필 보기">'+content+'</a>';}
let dmInboxFilter='all';
let dmInboxSnapshot=null;
function rememberDmInbox(data){dmInboxSnapshot={uid:me?.id,data};}

const dmInboxTabs=[['all','전체'],['unread','안 읽음'],['crew','크루'],['notice','공지']];
function dmInboxTabsHTML(){return '<div class="dm-inbox-tabs" role="group" aria-label="메시지 분류">'+dmInboxTabs.map(([key,label])=>'<button type="button" data-dm-filter="'+key+'" aria-pressed="'+(dmInboxFilter===key)+'">'+label+'</button>').join('')+'</div>';}
function dmInboxSelection(conversations,crew,filter){return {conversations:conversations.filter(p=>filter==='all'||filter==='unread'&&Number(p.unread)>0||filter==='notice'&&p.is_notice===true),crew:filter==='all'||filter==='crew'||filter==='unread'&&Number(crew?.unread)>0?crew:null};}
function conversationListHTML(conversations,crew=null,selected=''){const chosen=dmInboxSelection(conversations,crew,dmInboxFilter);conversations=chosen.conversations;crew=chosen.crew;return crewInboxHTML(crew,selected)+(conversations.length?'<div class="conversation-list">'+conversations.map(p=>'<article class="surface conversation-row'+(selected===p.id?' is-selected':'')+'">'+dmProfileLink(p,portrait(p,'producer'))+'<a class="conversation-open" href="#dm/'+esc(p.id)+'"'+(selected===p.id?' aria-current="true"':'')+'><div class="conversation-copy"><strong>'+esc(p.name)+'</strong><p>'+esc(p.last_message||'대화를 시작해보세요.')+'</p></div><div class="conversation-meta"><time>'+new Date(p.updated*1000).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})+'</time>'+(p.unread?'<span class="unread-badge" aria-label="안 읽은 메시지 '+p.unread+'개">'+number(p.unread)+'</span>':'')+'</div></a>'+dmMuteButton(p)+'</article>').join('')+'</div>':crew?'':'<div class="dm-empty" role="status"><h2>'+({all:'아직 나눈 대화가 없어요',unread:'안 읽은 메시지가 없어요',crew:'가입한 크루가 없어요',notice:'받은 공지가 없어요'}[dmInboxFilter])+'</h2><p>'+({all:'프로필에서 DM을 보내 대화를 시작해보세요.',unread:'새 메시지가 오면 여기에 표시돼요.',crew:'크루에 가입하면 크루 채팅을 볼 수 있어요.',notice:'운영자 계정의 메시지를 이곳에 모아드려요.'}[dmInboxFilter])+'</p></div>');}
function chatBodyHTML(body){return esc(body).replace(/(?:[ \t]*\r?\n[ \t]*)?https:\/\/aifect\.co\.kr\/#voice\/([a-zA-Z0-9_-]{16,64})(?![a-zA-Z0-9_-])/g,(_,id)=>'<a class="small-button dm-room-invite" href="#voice/'+id+'">토킹룸 입장하기</a>');}
function chatHTML(messages,peer=null,crew=null){
 let day='';return messages.map(m=>{
  const currentDay=new Date(m.created*1000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}),separator=currentDay!==day?'<div class="chat-day">'+currentDay+'</div>':'';day=currentDay;
  if(m.kind==='system')return separator+'<div class="chat-system">'+esc(m.body)+'</div>';
  const mine=m.sender_id===me?.id||m.user_id===me?.id,name=m.name||(mine?'나':peer?.name)||'리스너',label=crew?crewDisplayName({...m,name}):name;
  const delivery=m.delivery==='sending'?'<small class="chat-delivery">전송 중…</small>':m.delivery==='failed'?'<button class="chat-retry" data-chat-retry="'+esc(m.id)+'">다시 보내기</button>':'';
  const person=peer||{id:m.profile_id,name:label,image_version:m.image_version,player_xp:m.player_xp,profile_frame:m.profile_frame,profile_frame_artwork:m.profile_frame_artwork};
  const linked=!!person.id,face=portrait(person,'producer');
  const avatar=!mine?(linked?dmProfileLink(person,face):'<span class="dm-profile-link">'+face+'</span>'):'';
  const author=mine?'':crew?.owner&&m.profile_id?'<button class="dm-author chat-author" data-crew-member="'+esc(m.profile_id)+'" data-crew="'+esc(crew.id)+'">'+esc(label)+'</button>':linked?dmProfileLink(person,esc(label),'dm-author'):'<span class="dm-author">'+esc(label)+'</span>';
  const stamp=new Date(m.created*1000).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'});
  const invitation=!crew&&m.crew_invite_id?'<a class="small-button dm-crew-invite" href="#crew/'+esc(m.crew_invite_id)+'">'+icon('users')+' 초대받은 크루 보기 '+icon('chevron')+'</a>':'';
  const body=invitation?m.body.replace('\n크루 둘러보기: https://aifect.co.kr/#crew/'+m.crew_invite_id,''):m.body;
  return separator+'<article class="dm-message '+(mine?'mine':'')+'" data-message="'+esc(m.id)+'">'+avatar+'<div class="dm-message-content">'+author+'<div class="dm-message-line"><div class="dm-bubble"><span class="chat-body">'+(m.image_id?chatImageHTML(m,!!crew):chatBodyHTML(body))+'</span>'+invitation+'</div><div class="chat-message-meta"><time>'+stamp+'</time>'+delivery+'</div></div></div></article>';
 }).join('')||'<div class="chat-empty"><span>'+icon('message')+'</span><strong>음악에서 시작되는 대화</strong><p>반가운 인사나 좋았던 음악을 나눠보세요.</p></div>';
}
function chatPanelHTML(label,initial=null,peer=null){return '<section class="surface chat-panel dm-chat-panel '+(peer?'':'crew-chat-panel')+'"><button class="small-button chat-earlier" id="chat-earlier" '+(initial?.has_more?'':'hidden')+'>이전 대화 보기</button><div id="chat-log" role="log" aria-label="'+label+'">'+(initial?chatHTML(initial.messages,peer):'')+'</div><p id="chat-connection" class="quiet" role="status"></p><p id="chat-error" role="status"></p>'+chatAttachmentTools(peer)+chatComposer()+'</section>';}
let socialCleanup=null;
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
function dmWorkspaceHeight(bottom,top,inset,payoutLine){return Math.max(180,Math.min(bottom-inset,Number.isFinite(payoutLine)?payoutLine-12:bottom-inset)-top);}
function dmPayoutLine(){if(innerWidth<=800)return undefined;const r=document.querySelector('#sidebar a[href="#payouts"]')?.getBoundingClientRect();return r?.height>0?r.top+r.height/2:undefined;}
function bindSocialChat(view){
 if(!view?.inbox&&!view?.chat)return;
 const ticket=renderId,uid=me?.id,current=()=>ticket===renderId&&uid===me?.id;
 let inboxData=uid&&dmInboxSnapshot?.uid===uid?dmInboxSnapshot.data:null;
 const paintInbox=d=>{const root=$('#dm-conversations'),html=conversationListHTML(d.conversations,d.crew,view.selectedConversation||'');if(root&&root.innerHTML!==html)root.innerHTML=html;const count=$('#dm-inbox-count');if(count)count.textContent=number(d.conversations.length);};
 const tabs=document.querySelector('.dm-inbox-tabs');const filter=e=>{const b=e.target.closest('[data-dm-filter]');if(!b)return;dmInboxFilter=b.dataset.dmFilter;tabs.querySelectorAll('[data-dm-filter]').forEach(t=>t.setAttribute('aria-pressed',String(t.dataset.dmFilter===dmInboxFilter)));if(inboxData)paintInbox(inboxData);};tabs?.addEventListener('click',filter);
 let inboxFetching=false,inboxAgain=false,inboxVersion=0;
 const loadInbox=async()=>{if(!view?.inbox||!current())return;if(inboxFetching){inboxAgain=true;return;}inboxFetching=true;
  try{do{inboxAgain=false;const version=inboxVersion,d=await api('/api/dm');if(!current())return;if(version!==inboxVersion)continue;inboxData=d;rememberDmInbox(d);paintInbox(d);$('#dm-list-error').textContent='';}while(inboxAgain&&current());}
  catch(e){if(current())$('#dm-list-error').textContent=e.message;}finally{inboxFetching=false;}
 };
 const localInbox=e=>{if(current()&&view?.inbox&&e.detail){inboxVersion++;inboxData=e.detail;paintInbox(inboxData);}};const refreshInbox=()=>{void loadInbox();};if(view?.inbox){window.addEventListener('aifect:inbox-local',localInbox);window.addEventListener('aifect:inbox-refresh',refreshInbox);}
 const clearInboxEvents=()=>{window.removeEventListener('aifect:inbox-local',localInbox);window.removeEventListener('aifect:inbox-refresh',refreshInbox);};
 if(view?.inbox&&!view.chat){if(view.refreshInbox)void loadInbox();const workspace=document.querySelector('.message-workspace');const fit=()=>{if(!current()||!workspace||innerWidth<=800){if(workspace)workspace.style.height='';return;}const top=workspace.getBoundingClientRect().top;const playerHeight=document.querySelector('.player:not([hidden])')?.getBoundingClientRect().height||0;workspace.style.height=dmWorkspaceHeight(innerHeight,top,16+playerHeight,dmPayoutLine())+'px';};fit();window.addEventListener('resize',fit);const stop=watchSocialChat('',loadInbox,()=>{},()=>{$('#dm-list-error').textContent='로그인 상태를 다시 확인해주세요.';});socialCleanup=()=>{clearInboxEvents();stop();window.removeEventListener('resize',fit);tabs?.removeEventListener('click',filter);};return;}
 if(!view?.chat)return;
 if(view.refreshInbox)void loadInbox();
 const {path,peer,crew,initial}=view.chat,form=$('#chat-compose'),log=$('#chat-log'),earlier=$('#chat-earlier'),input=form.querySelector('textarea'),sendButton=form.querySelector('[data-chat-send]');
 const messages=new Map((initial?.messages||[]).map(m=>[m.id,m]));let fetching=false,again=false,initialized=!!initial,lastHTML=null,sending=false,denied=false,chatGeneration=0;
 // Only a history read advances the cursor. A POST can return a newer message
 // before intervening messages from another member have arrived.
 let latestSequence=Math.max(0,...(initial?.messages||[]).map(m=>m.sequence||0)),joinedSequence=crew?(initial?.membership?.joined_sequence??null):null;
 const sorted=()=>[...messages.values()].sort((a,b)=>(a.sequence||Number.MAX_SAFE_INTEGER)-(b.sequence||Number.MAX_SAFE_INTEGER)||a.created-b.created);
 const merge=incoming=>incoming.forEach(m=>{if(m.request_id&&(m.user_id===uid||m.sender_id===uid))messages.delete('pending:'+m.request_id);messages.set(m.id,m);});
 const paint=(older=false,forceBottom=false)=>{const nearBottom=forceBottom||document.activeElement===input||log.scrollHeight-log.scrollTop-log.clientHeight<90,top=log.scrollTop,height=log.scrollHeight;const html=chatHTML(sorted(),peer,crew);if(html===lastHTML){if(forceBottom)log.scrollTop=log.scrollHeight;return;}lastHTML=html;log.innerHTML=html;if(older)log.scrollTop=top+log.scrollHeight-height;else if(nearBottom)log.scrollTop=log.scrollHeight;};
 const deny=()=>{denied=true;socialCleanup?.();if(crew){chatGeneration++;messages.clear();latestSequence=0;lastHTML=null;paint(false,true);}input.disabled=true;sendButton.disabled=true;$('#chat-connection').textContent='연결 종료';$('#chat-error').textContent='로그인 또는 크루 가입 상태를 다시 확인해주세요.';};
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
   if(peer&&d.messages.some(m=>m.recipient_id===uid&&!m.read_at))await api(path,'PATCH');
   if(crew&&latestSequence)await api('/api/crews/'+crew.id+'/read','POST',{sequence:latestSequence});
   void refreshMessageBadge();void loadInbox();
   if(!older&&cursor&&d.has_more)again=true;
  }while(again&&current()&&!older);}
  catch(e){if(current()){$('#chat-error').textContent=e.message;if([401,403].includes(e.status))deny();}}
  finally{fetching=false;earlier.disabled=false;if(again&&older&&current())void load();}
 };
 earlier.onclick=()=>{earlier.disabled=true;load(true);};
 const isComposing=bindChatEnter(input,()=>{if(input.isConnected&&current()&&input.value.trim()&&!sendButton.disabled)form.requestSubmit();});
 const send=async pending=>{
  const generation=chatGeneration;
  if(sending||denied||!current())throw new Error('전송 중인 메시지가 있어요. 잠시 후 사진을 다시 선택해주세요.');sending=true;sendButton.disabled=true;pending.delivery='sending';messages.set(pending.id,pending);paint(false,true);$('#chat-error').textContent='';
  try{const result=await api(path,'POST',{body:pending.body,request_id:pending.request_id,...(pending.image_id?{image_id:pending.image_id}:{})});if(!current()||generation!==chatGeneration)return;
   if(result.message){messages.delete(pending.id);merge([result.message]);paint(false,true);}else await load();
  }catch(e){if(current()){
   // A stream may confirm the same request before the POST response is lost.
   if(messages.has(pending.id)){pending.delivery='failed';paint();$('#chat-error').textContent=e.message;}
   if([401,403].includes(e.status))deny();
  }}finally{sending=false;if(current())sendButton.disabled=denied;}
 };
 form.onsubmit=event=>{event.preventDefault();if(isComposing()||sending||denied||form.dataset.uploading||!input.value.trim())return;const rid=crypto.randomUUID(),body=input.value.trim();input.value='';
  void send({id:'pending:'+rid,request_id:rid,body,created:Math.floor(Date.now()/1000),user_id:uid,sender_id:uid,name:me.name,profile_id:me.profile_id,role:crew?.owner?'owner':'member'});
 };
 log.addEventListener('click',event=>{const retry=event.target.closest('[data-chat-retry]');if(retry&&messages.has(retry.dataset.chatRetry))void send(messages.get(retry.dataset.chatRetry));});
 bindChatImageUpload(peer,path,send,()=>sending||denied||!current());
 // Opening a room also acknowledges older unread messages outside the last page.
 if(peer&&initial)api(path,'PATCH').then(()=>{if(current()){void refreshMessageBadge();void loadInbox();}}).catch(e=>{if(current())$('#chat-error').textContent='읽음 상태를 반영하지 못했어요. '+e.message;});
 const query=crew?'?crew='+encodeURIComponent(crew.id):view.inbox?'':'?peer='+encodeURIComponent(path.split('/').at(-1));
 // History must not wait for the first SSE event or a stream timeout.
 if(!initial)void load();
 const stopStream=watchSocialChat(query,()=>{void load();void loadInbox();},text=>{if(current())$('#chat-connection').textContent=text;},deny);
 const stopInbox=crew&&view.inbox?watchSocialChat('',loadInbox,()=>{},deny):()=>{};
 // Resize only the conversation pane, never scroll the whole document while typing.
 document.body.classList.add('chat-active');
 const panel=log.closest('.chat-panel'),viewportHeightAtOpen=innerHeight;let pinned=true,frame=0;
 const onScroll=()=>{pinned=log.scrollHeight-log.scrollTop-log.clientHeight<90;};
 const anchor=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!current())return;if(document.activeElement===input||pinned)log.scrollTop=log.scrollHeight;});};
 const viewport=()=>{if(!current())return;const vv=window.visualViewport;const bottom=(vv?.height||innerHeight)+(vv?.offsetTop||0);const workspace=panel.closest?.('.message-workspace'),target=workspace||panel;const top=target.getBoundingClientRect().top;const keyboard=document.activeElement===input&&Math.max(viewportHeightAtOpen,innerHeight)-(vv?.height||innerHeight)>120;document.body.classList.toggle('chat-keyboard',keyboard);const playerHeight=document.querySelector('.player:not([hidden])')?.getBoundingClientRect().height||0;const inset=keyboard?12:(innerWidth<=800?78:16)+playerHeight;target.style.height=dmWorkspaceHeight(bottom,top,inset,keyboard?undefined:dmPayoutLine())+'px';if(workspace)panel.style.height='';anchor();};
 const resize=new ResizeObserver(anchor);resize.observe(log);
 log.addEventListener('scroll',onScroll,{passive:true});log.addEventListener('load',anchor,true);
 input.addEventListener('focus',viewport);input.addEventListener('blur',viewport);
 window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);viewport();
 socialCleanup=()=>{clearInboxEvents();tabs?.removeEventListener('click',filter);document.body.classList.remove('chat-keyboard','chat-active');stopStream();stopInbox();resize.disconnect();cancelAnimationFrame(frame);log.removeEventListener('scroll',onScroll);log.removeEventListener('load',anchor,true);input.removeEventListener('focus',viewport);input.removeEventListener('blur',viewport);window.visualViewport?.removeEventListener('resize',viewport);window.removeEventListener('resize',viewport);};
}

document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-crew-member]');if(!button)return;event.preventDefault();
 try{
  const cid=button.dataset.crew,pid=button.dataset.crewMember,d=await api('/api/crews/'+cid),person=d.members.find(p=>p.id===pid);
  if(!person)return toast('이미 크루에서 나간 멤버예요.');
  if(d.membership?.role!=='owner')return void(location.hash='producer/'+pid);
  dialog(`<h2>${esc(person.name)}</h2><a class="text-link" href="#producer/${esc(pid)}" data-close-dialog>프로필 보기</a><form id="crew-role-form"><label class="form-field">크루 직책<select name="role">${Object.entries(crewRoleLabels).filter(([role])=>role!=='owner').map(([role,label])=>`<option value="${role}" ${person.role===role?'selected':''}>${label}</option>`).join('')}</select></label><p class="field-help">직책 변경과 강퇴는 크루장만 할 수 있어요.</p><button class="primary-button">직책 저장</button><p class="form-error" role="alert"></p></form><button class="small-button crew-kick" id="crew-kick">크루에서 강퇴</button>`);
  const refresh=async()=>{const draft=$('#chat-compose textarea')?.value;$('#dialog').close();await render();if(draft&&$('#chat-compose textarea'))$('#chat-compose textarea').value=draft;};
  const form=$('#crew-role-form');form.onsubmit=busyForm(form,async fd=>{await api(`/api/crews/${cid}/members/${pid}`,'PATCH',{role:fd.get('role')});await refresh();});
  $('#crew-kick').onclick=async()=>{if(!confirm(person.name+'님을 강퇴할까요? 이 크루에 다시 가입할 수 없게 됩니다.'))return;try{await api(`/api/crews/${cid}/members/${pid}`,'DELETE');await refresh();}catch(e){toast(e.message);}};
 }catch(e){toast(e.message);}
});
