const crewRoleLabels={owner:'크루장',deputy:'부크루장',operator:'운영자',manager:'매니저',member:'크루원'};
const crewDisplayName=p=>p.name+(p.role&&p.role!=='member'?'('+(crewRoleLabels[p.role]||'크루원')+')':'');
function crewPeopleHTML(d){return d.members.map(p=>{const content=portrait(p,'producer')+`<strong>${esc(crewDisplayName(p))}</strong>`;return d.membership?.role==='owner'&&p.role!=='owner'?`<button class="crew-person" data-crew-member="${esc(p.id)}" data-crew="${esc(d.crew.id)}">${content}</button>`:`<a href="#producer/${esc(p.id)}">${content}</a>`;}).join('');}
function dmProfileLink(p,content,cls='dm-profile-link'){return '<a class="'+cls+'" href="#producer/'+esc(p.id)+'" aria-label="'+esc(p.name)+' 프로필 보기">'+content+'</a>';}
function conversationListHTML(conversations){return conversations.length?'<div class="conversation-list">'+conversations.map(p=>'<article class="surface conversation-row">'+dmProfileLink(p,portrait(p,'producer'))+'<a class="conversation-open" href="#dm/'+esc(p.id)+'"><div class="conversation-copy"><strong>'+esc(p.name)+'</strong><p>'+esc(p.last_message||'대화를 시작해보세요.')+'</p></div><div class="conversation-meta"><time>'+new Date(p.updated*1000).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})+'</time>'+(p.unread?'<span class="unread-badge" aria-label="안 읽은 메시지 '+p.unread+'개">'+number(p.unread)+'</span>':'')+'</div></a></article>').join('')+'</div>':'<div class="surface dm-empty"><h2>아직 나눈 대화가 없어요</h2><p>프로필의 DM 보내기로 대화를 시작해보세요.<br>대화를 나눈 사람별로 이곳에 모아둘게요.</p><a class="small-button" href="#following">팔로우한 사람 보기</a></div>';}
function chatHTML(messages,peer=null,crew=null){
 let day='';return messages.map(m=>{
  const currentDay=new Date(m.created*1000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}),separator=currentDay!==day?'<div class="chat-day">'+currentDay+'</div>':'';day=currentDay;
  if(m.kind==='system')return separator+'<div class="chat-system">'+esc(m.body)+'</div>';
  const mine=m.sender_id===me?.id||m.user_id===me?.id,name=m.name||(mine?'나':peer?.name)||'리스너',label=crew?crewDisplayName({...m,name}):name;
  const delivery=m.delivery==='sending'?'<small class="chat-delivery">전송 중…</small>':m.delivery==='failed'?'<button class="chat-retry" data-chat-retry="'+esc(m.id)+'">다시 보내기</button>':'';
  if(peer)return separator+'<article class="dm-message '+(mine?'mine':'')+'" data-message="'+esc(m.id)+'">'+(!mine?dmProfileLink(peer,portrait(peer,'producer')):'')+'<div class="dm-message-content">'+(!mine?dmProfileLink(peer,esc(peer.name),'dm-author'):'')+'<div class="dm-bubble"><span class="chat-body">'+esc(m.body)+'</span></div>'+delivery+'</div></article>';
  const author=crew?.owner&&!mine&&m.profile_id?'<button class="chat-author" data-crew-member="'+esc(m.profile_id)+'" data-crew="'+esc(crew.id)+'">'+esc(label)+'</button>':'<strong>'+esc(label)+'</strong>';
  return separator+'<article class="chat-message '+(mine?'mine':'')+'" data-message="'+esc(m.id)+'">'+author+(label.endsWith(')')?'':')')+' <span class="chat-body">'+esc(m.body)+'</span>'+delivery+'</article>';
 }).join('')||'<div class="chat-empty"><span>'+icon('message')+'</span><strong>음악에서 시작되는 대화</strong><p>반가운 인사나 좋았던 음악을 나눠보세요.</p></div>';
}
function chatPanelHTML(label,initial=null,peer=null){return '<section class="surface chat-panel '+(peer?'dm-chat-panel':'crew-chat-panel')+'"><button class="small-button chat-earlier" id="chat-earlier" '+(initial?.has_more?'':'hidden')+'>이전 대화 보기</button><div id="chat-log" role="log" aria-label="'+label+'">'+(initial?chatHTML(initial.messages,peer):'')+'</div><p id="chat-connection" class="quiet" role="status"></p><p id="chat-error" role="status"></p>'+chatComposer()+'</section>';}
let socialCleanup=null;
function watchSocialChat(query,changed,status,revoked){
 const ticket=renderId,uid=me?.id;let source=null,retryAt=0,failures=0,lastBeat=0,lastFallback=0,closed=false;
 const current=()=>!closed&&ticket===renderId&&uid===me?.id;
 const disconnect=()=>{source?.close();source=null;};
 const connect=()=>{
  if(!current()||document.hidden||!navigator.onLine)return;
  disconnect();lastBeat=Date.now();status('연결 중…');
  try{source=new EventSource('/api/chat/events'+query);}catch{failed();return;}
  source.addEventListener('change',()=>{lastBeat=Date.now();failures=0;status('대화 연결됨');changed();});
  source.addEventListener('heartbeat',()=>{lastBeat=Date.now();failures=0;status('대화 연결됨');});
  source.addEventListener('rotate',()=>{disconnect();retryAt=Date.now()+200;});
  source.addEventListener('retry',failed);source.onerror=failed;
  source.addEventListener('revoked',()=>{cleanup();revoked();});
 };
 const failed=()=>{if(!current())return;disconnect();failures++;retryAt=Date.now()+Math.min(15000,1000*2**Math.min(failures-1,4));status('다시 연결 중 · 새 대화를 자동으로 확인합니다');changed();lastFallback=Date.now();};
 const visibility=()=>{disconnect();if(document.hidden||!navigator.onLine)status(navigator.onLine?'대기 중':'오프라인 · 연결되면 다시 불러옵니다');else connect();};
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
function bindSocialChat(view){
 const ticket=renderId,uid=me?.id,current=()=>ticket===renderId&&uid===me?.id;
 if(view?.inbox){let fetching=false,again=false;const load=async()=>{if(!current())return;if(fetching){again=true;return;}fetching=true;
  try{do{again=false;const d=await api('/api/dm');if(!current())return;const root=$('#dm-conversations'),html=conversationListHTML(d.conversations);if(root.innerHTML!==html)root.innerHTML=html;$('#dm-list-error').textContent='';}while(again&&current());}
  catch(e){if(current()){$('#dm-list-error').textContent=e.message;if([401,403].includes(e.status))socialCleanup?.();}}finally{fetching=false;}
 };socialCleanup=watchSocialChat('',load,()=>{},()=>{$('#dm-list-error').textContent='로그인 상태를 다시 확인해주세요.';});return;}
 if(!view?.chat)return;
 const {path,peer,crew,initial}=view.chat,form=$('#chat-compose'),log=$('#chat-log'),earlier=$('#chat-earlier'),input=form.querySelector('textarea'),sendButton=form.querySelector('button');
 const messages=new Map((initial?.messages||[]).map(m=>[m.id,m]));let fetching=false,again=false,initialized=!!initial,lastHTML=null,sending=false,denied=false,chatGeneration=0;
 // Only a history read advances the cursor. A POST can return a newer message
 // before intervening messages from another member have arrived.
 let latestSequence=Math.max(0,...(initial?.messages||[]).map(m=>m.sequence||0)),joinedSequence=crew?(initial?.membership?.joined_sequence??null):null;
 const sorted=()=>[...messages.values()].sort((a,b)=>(a.sequence||Number.MAX_SAFE_INTEGER)-(b.sequence||Number.MAX_SAFE_INTEGER)||a.created-b.created);
 const merge=incoming=>incoming.forEach(m=>{if(m.request_id&&(m.user_id===uid||m.sender_id===uid))messages.delete('pending:'+m.request_id);messages.set(m.id,m);});
 const paint=(older=false,forceBottom=false)=>{const nearBottom=forceBottom||log.scrollHeight-log.scrollTop-log.clientHeight<90,top=log.scrollTop,height=log.scrollHeight;const html=chatHTML(sorted(),peer,crew);if(html===lastHTML)return;lastHTML=html;log.innerHTML=html;if(older)log.scrollTop=top+log.scrollHeight-height;else if(nearBottom)log.scrollTop=log.scrollHeight;};
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
   merge(d.messages);
   if(!older)latestSequence=Math.max(latestSequence,...d.messages.map(m=>m.sequence||0));
   if(d.member_roles){const roles=new Map(d.member_roles.map(m=>[m.profile_id,m.role]));messages.forEach(m=>{if(roles.has(m.profile_id))m.role=roles.get(m.profile_id);});if(crew)crew.owner=d.membership?.role==='owner';}
   if(older||!initialized)earlier.hidden=!d.has_more;initialized=true;paint(older);$('#chat-error').textContent='';
   if(peer&&d.messages.some(m=>m.recipient_id===uid&&!m.read_at))await api(path,'PATCH');
   if(!older&&cursor&&d.has_more)again=true;
  }while(again&&current()&&!older);}
  catch(e){if(current()){$('#chat-error').textContent=e.message;if([401,403].includes(e.status))deny();}}
  finally{fetching=false;earlier.disabled=false;if(again&&older&&current())void load();}
 };
 earlier.onclick=()=>{earlier.disabled=true;load(true);};
 input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();if(input.value.trim()&&!sendButton.disabled)form.requestSubmit();}});
 const send=async pending=>{
  const generation=chatGeneration;
  if(sending||denied||!current())return;sending=true;sendButton.disabled=true;pending.delivery='sending';messages.set(pending.id,pending);paint(false,true);$('#chat-error').textContent='';
  try{const result=await api(path,'POST',{body:pending.body,request_id:pending.request_id});if(!current()||generation!==chatGeneration)return;
   if(result.message){messages.delete(pending.id);merge([result.message]);paint(false,true);}else await load();
  }catch(e){if(current()){
   // A stream may confirm the same request before the POST response is lost.
   if(messages.has(pending.id)){pending.delivery='failed';paint();$('#chat-error').textContent=e.message;}
   if([401,403].includes(e.status))deny();
  }}finally{sending=false;if(current())sendButton.disabled=denied;}
 };
 form.onsubmit=event=>{event.preventDefault();if(sending||denied||!input.value.trim())return;const rid=crypto.randomUUID(),body=input.value.trim();input.value='';
  void send({id:'pending:'+rid,request_id:rid,body,created:Math.floor(Date.now()/1000),user_id:uid,sender_id:uid,name:me.name,profile_id:me.profile_id,role:crew?.owner?'owner':'member'});
 };
 log.addEventListener('click',event=>{const retry=event.target.closest('[data-chat-retry]');if(retry&&messages.has(retry.dataset.chatRetry))void send(messages.get(retry.dataset.chatRetry));});
 if(peer&&initial?.messages.some(m=>m.recipient_id===uid&&!m.read_at))api(path,'PATCH').catch(()=>{});
 const query=crew?'?crew='+encodeURIComponent(crew.id):'?peer='+encodeURIComponent(path.split('/').at(-1));
 // History must not wait for the first SSE event or a stream timeout.
 if(!initial)void load();
 socialCleanup=watchSocialChat(query,()=>load(),text=>{if(current())$('#chat-connection').textContent=text;},deny);
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
