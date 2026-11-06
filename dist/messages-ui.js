// Notice entries are existing, server-verified administrator conversations.
async function dmNoticeView(raw,readApi=api){
 const inbox=await readApi('/api/dm'),{notices}=dmOrderedConversations(inbox.conversations);
 rememberDmInbox(inbox);
 const back='<a class="chat-ui-icon chat-ui-plain dm-back" href="#dm" aria-label="대화 목록으로 돌아가기">'+icon('back')+'</a>';
 if(!notices.length)return {html:dmInboxHTML(inbox,'<header class="dm-thread-header">'+back+'<h1>공지채팅</h1></header><div class="dm-empty"><p>아직 받은 공지가 없어요.</p></div>','notice'),inbox:true,refreshInbox:true,selectedConversation:'notice'};
 const requested=new URLSearchParams(raw.split('?')[1]||'').get('peer'),peer=notices.find(p=>p.id===requested)||notices[0];
 const d=await readApi('/api/dm/'+encodeURIComponent(peer.id));
 const channels=notices.length>1?'<label class="dm-notice-channel"><span class="sr-only">공지 대화 선택</span><select data-notice-channel>'+notices.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===peer.id?' selected':'')+'>'+esc(chatNickname(p))+'</option>').join('')+'</select></label>':'';
 return {html:dmInboxHTML(inbox,'<header class="dm-thread-header">'+back+dmProfileLink(d.peer,'<div><h1>공지채팅</h1><small>'+esc(chatNickname(d.peer))+'</small></div>','dm-thread-person')+dmThreadActions(d.peer,d.settings)+'</header>'+channels+chatPanelHTML('공지채팅',d,d.peer),'notice'),inbox:true,refreshInbox:true,selectedConversation:'notice',chat:{path:'/api/dm/'+peer.id,peer:d.peer,initial:d}};
}
document.addEventListener('change',event=>{if(event.target.matches('[data-notice-channel]'))location.hash='dm/notice?peer='+encodeURIComponent(event.target.value);});
document.addEventListener('click',event=>{
 if(!event.target.closest('[data-dm-new]'))return;
 dialog('<h2>새 메시지</h2><form id="dm-new-search"><label class="form-field">닉네임 검색<input type="search" name="q" required autocomplete="off" placeholder="대화할 상대의 닉네임"></label><button class="small-button" type="submit">검색</button></form><div id="dm-new-results" role="status"><p>닉네임으로 대화 상대를 찾아보세요.</p></div>');
 const form=$('#dm-new-search'),result=$('#dm-new-results');let revision=0;
 form.onsubmit=async e=>{e.preventDefault();const version=++revision,uid=me?.id,q=form.elements.q.value.trim();if(!q)return;
  result.textContent='찾는 중…';
  try{const data=await api('/api/search?q='+encodeURIComponent(q));if(version!==revision||uid!==me?.id||!result.isConnected)return;
   const people=(data.producers||[]).filter(p=>p.id!==me?.profile_id&&p.user_id!==me?.id);
   result.innerHTML=people.length?people.map(p=>'<a class="dm-new-person" href="#dm/'+esc(p.id)+'" data-close-dialog>'+portrait(p,'producer')+'<strong>'+userNickname(p.name,{profileId:p.id,userId:p.user_id})+'</strong>'+icon('message')+'</a>').join(''):'<p>검색 결과가 없어요.</p>';
  }catch(error){if(version===revision&&result.isConnected)result.textContent=error.message;}
 };
 form.elements.q.focus({preventScroll:true});
});
// Every mobile thread has a real list history entry, including shared URLs and reloads.
(() => {
 let previous=location.hash;
 const thread=hash=>/^#dm\/.+/.test(hash);
 function remember(){
  const route=location.hash;
  if(thread(route)&&!history.state?.aifectDmBack){
   if(previous!=='#dm'&&!thread(previous)){
    history.replaceState(history.state,'',location.pathname+location.search+'#dm');
    history.pushState({...history.state,aifectDmBack:true},'',location.pathname+location.search+route);
   }else history.replaceState({...history.state,aifectDmBack:true},'');
  }
  previous=route;
 }
 if(thread(previous)&&!history.state?.aifectDmBack)previous='';
 remember();window.addEventListener('hashchange',remember);
 document.addEventListener('click',event=>{
  const back=event.target.closest('.message-workspace a[href="#dm"]');if(!back||!thread(location.hash))return;
  event.preventDefault();if(history.state?.aifectDmBack)history.back();else location.hash='dm';
 });
})();
