// Notice entries are server-verified administrator conversations or service guides.
const welcomeGuideHrefs=new Set(['#karaoke','#live?mode=karaoke','#voice?mode=talk','#community/crews','#karaoke/duets','#karaoke/dubbing?tab=join','#artists','#upload','#membership']);
function welcomeGuideHTML(d){
 const g=d.guide;
 if(!g||typeof g.greeting!=='string'||!Array.isArray(g.sections)||!g.sections.length)throw new Error('이용 안내를 불러오지 못했어요. 다시 열어주세요.');
 const paragraphs=items=>(Array.isArray(items)?items:[]).filter(text=>typeof text==='string').map(text=>'<p>'+esc(text)+'</p>').join('');
 const sections=g.sections.map(s=>{
  const action=welcomeGuideHrefs.has(s.href)?'<a class="text-link welcome-guide-link" href="'+esc(s.href)+'">'+esc(s.label)+' <span aria-hidden="true">→</span></a>':'';
  return '<section class="welcome-guide-section" data-welcome-section="'+esc(s.id)+'"><h3>'+esc(s.title)+'</h3><p>'+esc(s.body)+'</p>'+action+'</section>';
 }).join('');
 const created=Number(d.created),sent=created>0&&Number.isFinite(created)?'<time class="welcome-guide-time" datetime="'+new Date(created*1000).toISOString()+'">'+new Date(created*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})+'</time>':'';
 return '<section id="welcome-guide-scroll" class="welcome-guide-scroll" tabindex="0" aria-label="아이팩트 이용 안내">'+sent+'<article class="welcome-guide" aria-labelledby="welcome-guide-title"><div class="welcome-guide-intro"><div class="welcome-guide-greeting"><h2 id="welcome-guide-title">'+esc(g.greeting).replace(/\r?\n/g,'<br>')+'</h2></div>'+paragraphs(g.intro)+'</div>'+sections+'<footer class="welcome-guide-outro">'+paragraphs(g.closing)+'</footer></article></section><div id="welcome-guide-status" class="welcome-guide-status" role="status" hidden><span></span><button type="button" class="text-link" data-welcome-read-retry>다시 시도</button></div>';
}
// Acknowledgement follows visible paint and stays tied to this account and route.
function bindWelcomeNotice(view,acknowledged=()=>{}){
 const notice=view?.welcomeNotice,pane=$('#welcome-guide-scroll');
 if(!notice||!pane)return ()=>{};
 const ticket=renderId,uid=me?.id,status=$('#welcome-guide-status');
 const retry=status?.querySelector('[data-welcome-read-retry]');
 let closed=false,pending=false,done=Number(notice.read_at)>0,synced=false,retries=0,retryTimer=null;
 const current=()=>!closed&&ticket===renderId&&uid===me?.id&&!!uid&&pane.isConnected;
 const synchronize=()=>{if(synced||!current())return;synced=true;if(status)status.hidden=true;acknowledged();};
 const acknowledge=async()=>{
  const renderState=document.documentElement?.dataset?.renderState;
  if(pending||!current()||document.hidden||(renderState&&renderState!=='ready')||!pane.getClientRects().length)return;
  clearTimeout(retryTimer);retryTimer=null;
  if(done){synchronize();return;}
  pending=true;if(retry)retry.disabled=true;
  const controller=new AbortController();let timedOut=false;
  const deadline=setTimeout(()=>{timedOut=true;controller.abort();},10000);
  try{
   await api('/api/notices/welcome','PATCH',{campaign_id:notice.campaign_id},{signal:controller.signal});
   done=true;synchronize();
  }catch(error){
   if(!current())return;
   if(status){status.querySelector('span').textContent='읽음 상태를 반영하지 못했어요. '+(timedOut?'연결 응답이 늦어지고 있어요. 다시 시도해주세요.':error.message);status.hidden=false;}
   const delay=[1000,3000,8000][retries++];
   if(delay!==undefined&&(!error.status||error.status===408||error.status===429||error.status>=500))retryTimer=setTimeout(()=>{retryTimer=null;void acknowledge();},delay);
  }finally{clearTimeout(deadline);pending=false;if(retry)retry.disabled=false;}
 };
 pane.scrollTop=0;
 const frame=requestAnimationFrame(()=>{if(current()){pane.scrollTop=0;visible();}});
 const visible=()=>{if(retryTimer===null)void acknowledge();};
 const resume=()=>{if(pending)return;retries=0;clearTimeout(retryTimer);retryTimer=null;void acknowledge();};
 document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);window.addEventListener('online',resume);window.addEventListener('pageshow',resume);retry?.addEventListener('click',resume);
 const resize=typeof ResizeObserver==='function'?new ResizeObserver(visible):null;resize?.observe(pane);
 const ready=typeof MutationObserver==='function'&&document.documentElement?new MutationObserver(visible):null;ready?.observe(document.documentElement,{attributes:true,attributeFilter:['data-render-state']});
 // Following a guide link must let its already-started receipt finish within the deadline.
 return ()=>{closed=true;cancelAnimationFrame(frame);clearTimeout(retryTimer);resize?.disconnect();ready?.disconnect();document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);window.removeEventListener('pageshow',resume);retry?.removeEventListener('click',resume);};
}
async function dmNoticeView(raw,readApi=api){
 const inbox=await readApi('/api/dm'),{notices}=dmOrderedConversations(inbox.conversations);
 rememberDmInbox(inbox);
 const back='<a class="chat-ui-icon chat-ui-plain dm-back" href="#dm" aria-label="대화 목록으로 돌아가기">'+icon('back')+'</a>';
 if(!notices.length)return {html:dmInboxHTML(inbox,'<header class="dm-thread-header">'+back+'<h1>공지</h1></header><div class="dm-empty"><p>아직 받은 공지가 없어요.</p></div>','notice'),inbox:true,refreshInbox:true,selectedConversation:'notice'};
 const requested=new URLSearchParams(raw.split('?')[1]||'').get('peer'),peer=notices.find(p=>p.id===requested)||notices[0];
 const channels=notices.length>1?'<label class="dm-notice-channel"><span class="sr-only">공지 선택</span><select data-notice-channel>'+notices.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===peer.id?' selected':'')+'>'+esc(chatNickname(p))+'</option>').join('')+'</select></label>':'';
 if(peer.notice_type==='welcome'&&peer.read_only===true){
  const d=await readApi('/api/notices/welcome');
  const header='<header class="dm-thread-header">'+back+'<div class="dm-thread-person"><div><h1>공지</h1><small>'+esc(chatNickname(peer))+'</small></div></div></header>';
  return {html:dmInboxHTML(inbox,header+channels+welcomeGuideHTML(d),'notice'),inbox:true,selectedConversation:'notice',welcomeNotice:{campaign_id:d.campaign_id,read_at:d.read_at}};
 }
 const d=await readApi('/api/dm/'+encodeURIComponent(peer.id));
 return {html:dmInboxHTML(inbox,'<header class="dm-thread-header">'+back+dmProfileLink(d.peer,'<div><h1>공지</h1><small>'+esc(chatNickname(d.peer))+'</small></div>','dm-thread-person')+dmThreadActions(d.peer,d.settings)+'</header>'+channels+chatPanelHTML('공지',d,d.peer),'notice'),inbox:true,refreshInbox:true,selectedConversation:'notice',chat:{path:'/api/dm/'+peer.id,peer:d.peer,initial:d}};
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
