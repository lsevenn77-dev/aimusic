const crewRoleLabels={owner:'크루장',deputy:'부크루장',operator:'운영자',manager:'매니저',member:'크루원'};
const crewDisplayName=p=>p.name+(p.role&&p.role!=='member'?'('+(crewRoleLabels[p.role]||'크루원')+')':'');
function crewPeopleHTML(d){return d.members.map(p=>{const content=portrait(p,'producer')+`<strong>${esc(crewDisplayName(p))}</strong>`;return d.membership?.role==='owner'&&p.role!=='owner'?`<button class="crew-person" data-crew-member="${esc(p.id)}" data-crew="${esc(d.crew.id)}">${content}</button>`:`<a href="#producer/${esc(p.id)}">${content}</a>`;}).join('');}
function conversationListHTML(conversations){return conversations.length?`<div class="conversation-list">${conversations.map(p=>`<a class="surface conversation-row" href="#dm/${esc(p.id)}">${portrait(p,'producer')}<div class="conversation-copy"><strong>${esc(p.name)}</strong><p>${esc(p.last_message||'대화를 시작해보세요.')}</p></div><div class="conversation-meta"><time>${new Date(p.updated*1000).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})}</time>${p.unread?`<span class="unread-badge" aria-label="안 읽은 메시지 ${p.unread}개">${number(p.unread)}</span>`:''}</div></a>`).join('')}</div>`:'<div class="surface dm-empty"><h2>아직 나눈 대화가 없어요</h2><p>프로필의 DM 보내기로 대화를 시작해보세요.<br>대화를 나눈 사람별로 이곳에 모아둘게요.</p><a class="small-button" href="#following">팔로우한 사람 보기</a></div>';}
function chatHTML(messages,peer=null,crew=null){
 let day='';return messages.map(m=>{
  const currentDay=new Date(m.created*1000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}),separator=currentDay!==day?`<div class="chat-day">${currentDay}</div>`:'';day=currentDay;
  if(m.kind==='system')return separator+`<div class="chat-system">${esc(m.body)}</div>`;
  const mine=m.sender_id===me?.id||m.user_id===me?.id,name=m.name||(mine?'나':peer?.name)||'리스너',label=crew?crewDisplayName({...m,name}):name;
  const author=crew?.owner&&!mine&&m.profile_id?`<button class="chat-author" data-crew-member="${esc(m.profile_id)}" data-crew="${esc(crew.id)}">${esc(label)}</button>`:`<strong>${esc(label)}</strong>`;
  return separator+`<article class="chat-message ${mine?'mine':''}" data-message="${esc(m.id)}">${author}${label.endsWith(')')?'':')'} <span class="chat-body">${esc(m.body)}</span></article>`;
 }).join('')||'<p class="quiet chat-empty">첫 이야기를 남겨보세요.</p>';
}
function chatPanelHTML(label,initial=null,peer=null){return `<section class="surface chat-panel"><button class="small-button chat-earlier" id="chat-earlier" ${initial?.has_more?'':'hidden'}>이전 대화 보기</button><div id="chat-log" role="log" aria-label="${label}">${initial?chatHTML(initial.messages,peer):''}</div><p id="chat-error" role="status"></p>${chatComposer()}</section>`;}
function bindSocialChat(view){
 const ticket=renderId;
 if(view?.inbox){let fetching=false;const load=async()=>{if(fetching||document.hidden||ticket!==renderId)return;fetching=true;try{const d=await api('/api/dm');if(ticket===renderId){const root=$('#dm-conversations'),html=conversationListHTML(d.conversations);if(root.innerHTML!==html)root.innerHTML=html;}}catch(e){if(ticket===renderId)$('#dm-list-error').textContent=e.message;}finally{fetching=false;}};socialTimer=setInterval(load,3000);return;}
 if(!view?.chat)return;
 const {path,peer,crew,initial}=view.chat,form=$('#chat-compose'),log=$('#chat-log'),earlier=$('#chat-earlier');
 const messages=new Map((initial?.messages||[]).map(m=>[m.id,m]));let request=crypto.randomUUID(),fetching=false,initialized=!!initial,lastHTML=null;
 const sorted=()=>[...messages.values()].sort((a,b)=>a.sequence-b.sequence);
 const paint=(older=false,forceBottom=false)=>{const nearBottom=forceBottom||log.scrollHeight-log.scrollTop-log.clientHeight<90,top=log.scrollTop,height=log.scrollHeight;const html=chatHTML(sorted(),peer,crew);if(html===lastHTML)return;lastHTML=html;log.innerHTML=html;if(older)log.scrollTop=top+log.scrollHeight-height;else if(nearBottom)log.scrollTop=log.scrollHeight;};
 paint(false,true);
 const load=async(older=false)=>{
  if(fetching||ticket!==renderId||document.hidden&&!older)return;fetching=true;const list=sorted(),cursor=older?list[0]?.sequence:list.at(-1)?.sequence;
  try{const d=await api(path+(cursor?'?'+(older?'before':'after')+'='+cursor:''));if(ticket!==renderId)return;
   d.messages.forEach(m=>messages.set(m.id,m));
   if(d.member_roles){const roles=new Map(d.member_roles.map(m=>[m.profile_id,m.role]));messages.forEach(m=>{if(roles.has(m.profile_id))m.role=roles.get(m.profile_id);});if(crew)crew.owner=d.membership?.role==='owner';}
   if(older||!initialized)earlier.hidden=!d.has_more;initialized=true;paint(older);$('#chat-error').textContent='';
   if(peer&&d.messages.length)await api(path,'PATCH');
  }catch(e){if(ticket===renderId){$('#chat-error').textContent=e.message;if(e.status===403){form.querySelectorAll('textarea,button').forEach(b=>b.disabled=true);clearInterval(socialTimer);}}}finally{fetching=false;earlier.disabled=false;}
 };
 earlier.onclick=()=>{earlier.disabled=true;load(true);};
 const input=form.querySelector('textarea');input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();if(input.value.trim()&&!form.querySelector('button').disabled)form.requestSubmit();}});
 form.onsubmit=busyForm(form,async fd=>{if(ticket!==renderId)return;const result=await api(path,'POST',{body:fd.get('body'),request_id:request});if(ticket!==renderId)return;form.reset();request=crypto.randomUUID();if(result.message){messages.set(result.message.id,result.message);paint(false,true);}else await load();});
 if(peer&&initial?.messages.length)api(path,'PATCH').catch(()=>{});
 if(!initial)load();socialTimer=setInterval(load,2500);
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
