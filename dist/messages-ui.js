const officialNoticePath='/api/notices/official';
const unifiedDmInboxPath='/api/dm?notices=unified';
const welcomeGuideHrefs=new Set(['#karaoke','#live?mode=karaoke','#voice?mode=talk','#community/crews','#karaoke/duets','#karaoke/dubbing?tab=join','#artists','#upload','#membership']);

function noticeTime(created){
 const date=new Date(Number(created)*1000);
 return Number(created)>0&&Number.isFinite(date.valueOf())?'<time class="welcome-guide-time" datetime="'+date.toISOString()+'">'+date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})+'</time>':'';
}

function noticeContentHTML(entry,headingId){
 const heading=text=>'<div class="welcome-guide-greeting"><h2 id="'+headingId+'">'+esc(text).replace(/\r?\n/g,'<br>')+'</h2></div>';
 if(entry.notice){
  const {banner,title,body}=entry.notice;
  if(typeof title!=='string'||typeof body!=='string'||typeof banner!=='string'||!/^\/assets\/[\w-]+\.webp$/.test(banner))throw new Error('공지 내용을 불러오지 못했습니다. 다시 열어 주세요.');
  const paragraphs=body.split('\n\n').map(text=>'<p>'+esc(text).replaceAll('\n','<br>')+'</p>').join('');
  const picture='<img class="official-notice-banner" src="'+esc(banner)+'" width="2172" height="724" alt="AIFECT 오픈 이벤트. 2026년 12월 31일까지 프리미엄 무료">';
  return (globalThis.AifectOfficialNotice?.noticeZoomButton(picture,'AIFECT 오픈 이벤트')??picture)+heading(title)+paragraphs;
 }
 if(entry.kind==='dm'){
  const invite=entry.crew_invite_id?'<a class="small-button dm-crew-invite" href="#crew/'+esc(entry.crew_invite_id)+'">'+icon('users')+' 초대받은 크루 보기 '+icon('chevron')+'</a>':'';
  const body=invite?entry.body.replace('\n크루 둘러보기: https://aifect.co.kr/#crew/'+entry.crew_invite_id,''):entry.body;
  return '<div class="official-notice-message">'+(entry.image_id?chatImageHTML(entry):chatBodyHTML(body))+invite+'</div>';
 }
 const g=entry.guide;
 if(!g||typeof g.greeting!=='string'||!Array.isArray(g.sections)||!g.sections.length)throw new Error('이용 안내를 불러오지 못했습니다. 다시 열어 주세요.');
 const paragraphs=items=>(Array.isArray(items)?items:[]).filter(text=>typeof text==='string').map(text=>'<p>'+esc(text)+'</p>').join('');
 const sections=g.sections.map(s=>{
  const action=welcomeGuideHrefs.has(s.href)?'<a class="text-link welcome-guide-link" href="'+esc(s.href)+'">'+esc(s.label)+' <span aria-hidden="true">→</span></a>':'';
  return '<section class="welcome-guide-section" data-welcome-section="'+esc(s.id)+'"><h3>'+esc(s.title)+'</h3><p>'+esc(s.body)+'</p>'+action+'</section>';
 }).join('');
 return '<div class="welcome-guide-intro">'+heading(g.greeting)+paragraphs(g.intro)+'</div>'+sections+'<footer class="welcome-guide-outro">'+paragraphs(g.closing)+'</footer>';
}

function officialNoticeEntryHTML(entry){
 if(entry.rich)return AifectOfficialNotice.renderNoticeEntry(entry,{renderStickers:globalThis.AifectStickers?.render});
 const headingId='official-notice-'+esc(entry.id);
 const title=entry.kind==='dm'?' aria-label="'+(entry.mine?'내 메시지':'공지 메시지')+'"':' aria-labelledby="'+headingId+'"';
 return '<div class="official-notice-entry" data-notice-id="'+esc(entry.id)+'">'+noticeTime(entry.created)+'<article class="welcome-guide'+(entry.mine?' official-notice-mine':'')+'"'+title+'>'+noticeContentHTML(entry,headingId)+'</article></div>';
}

function officialNoticeEntriesHTML(entries){
 let previous='';
 return entries.map(entry=>{
  const day=new Date(entry.created*1000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});
  const separator=day!==previous?'<div class="chat-day official-notice-day">'+esc(day)+'</div>':'';
  previous=day;
  return separator+officialNoticeEntryHTML(entry);
 }).join('');
}

function officialNoticeTimeline(feed){
 const content=feed.items.length?officialNoticeEntriesHTML(feed.items):'<div class="dm-empty"><p>아직 받은 공지가 없습니다.</p></div>';
 return (feed.missingAnchor?'<p class="official-notice-channel-note" role="status">이 공지는 확인할 수 없습니다.</p>':'')+
  '<section class="welcome-guide-scroll" data-official-notice-scroll tabindex="0" aria-label="공지 내역"><button type="button" class="small-button official-notice-earlier" data-official-notice-earlier'+(feed.before?'':' hidden')+'>이전 공지 보기</button><div data-official-notice-items>'+content+'</div></section><div class="welcome-guide-status" data-official-notice-status role="status" hidden><span></span><button type="button" class="text-link" data-official-notice-retry>다시 시도</button></div><footer class="official-notice-channel-note">아이팩트 공식 안내 채널입니다.</footer>';
}

function knownOfficialNoticePath(ids){
 return officialNoticePath+'?'+ids.map(id=>'known='+encodeURIComponent(id)).join('&');
}
const compareOfficialNotices=(a,b)=>Number(a.created)-Number(b.created)||(a.id<b.id?-1:a.id>b.id?1:0);

function bindOfficialNotices(host,feed,{anchor='',onRead=()=>{}}={}){
 const pane=host?.querySelector('[data-official-notice-scroll]');
 if(!pane)return ()=>{};
 const list=pane.querySelector('[data-official-notice-items]');
 const earlier=pane.querySelector('[data-official-notice-earlier]');
 const status=host.querySelector('[data-official-notice-status]');
 const retry=status.querySelector('[data-official-notice-retry]');
 const events=new AbortController(),options={signal:events.signal};
 const ticket=renderId,uid=me?.id;
 const current=()=>!events.signal.aborted&&ticket===renderId&&uid===me?.id&&!!uid&&pane.isConnected;
 const knownRead=new Set(),items=new Map();
 let before=feed.before,loading=false,refreshing=false,refreshAgain=false,acking=false,ackFrame=null,retryTimer=null,retries=0,positioned=false;
 const remember=entries=>entries.forEach(entry=>{
  items.set(entry.id,entry);
  if(entry.read_at||entry.mine)knownRead.add(entry.id);
 });
 remember(feed.items);
 const children=()=>Array.from(list.children).filter(node=>node.dataset.noticeId);
 const jump=node=>{if(node)pane.scrollTop+=node.getBoundingClientRect().top-pane.getBoundingClientRect().top-12;};
 const showError=error=>{
  if(!current())return;
  status.querySelector('span').textContent='읽음 상태를 반영하지 못했습니다. '+error.message;
  status.hidden=false;
 };
 const acknowledge=async()=>{
  ackFrame=null;
  const renderState=document.documentElement?.dataset?.renderState;
  if(acking||!current()||document.hidden||(renderState&&renderState!=='ready')||!pane.getClientRects().length)return;
  if(!positioned){
   const initial=feed.items.find(entry=>entry.id===anchor||entry.legacy_id===anchor)||feed.items.at(-1);
   jump(children().find(node=>node.dataset.noticeId===initial?.id));
   positioned=true;
  }
  if(retryTimer!==null||retries>3)return;
  const bounds=pane.getBoundingClientRect();
  const ids=children().filter(node=>{
   if(knownRead.has(node.dataset.noticeId))return false;
   const rect=node.querySelector('article').getBoundingClientRect();
   return Math.min(bounds.bottom,rect.bottom)-Math.max(bounds.top,rect.top)>=Math.min(rect.height,48)&&rect.height>0;
  }).map(node=>node.dataset.noticeId).slice(0,100);
  if(!ids.length)return;
  acking=true;
  const controller=new AbortController();
  const deadline=setTimeout(()=>controller.abort(),10000);
  try{
   const updated=await api(officialNoticePath,'PATCH',{ids},{signal:controller.signal});
   ids.forEach(id=>knownRead.add(id));
   if(current()){retries=0;status.hidden=true;onRead(updated);schedule();}
  }catch(error){
   if(!current())return;
   showError(error);
   const delay=[1000,3000,8000][retries++];
   if(delay!==undefined&&(!error.status||error.status===408||error.status===429||error.status>=500)){
    retryTimer=setTimeout(()=>{retryTimer=null;schedule();},delay);
   }else retries=4;
  }finally{clearTimeout(deadline);acking=false;}
 };
 const schedule=()=>{if(current()&&ackFrame===null)ackFrame=requestAnimationFrame(acknowledge);};
 const repaint=sorted=>{
  const oldNodes=children();
  const same=(entry,node)=>{
   const previous=items.get(entry?.id);
   return entry?.id===node.dataset.noticeId&&entry.version===previous?.version&&
    (!entry.gift||JSON.stringify(entry.rich)===JSON.stringify(previous?.rich));
  };
  if(sorted.length===oldNodes.length&&sorted.every((entry,index)=>same(entry,oldNodes[index])))return;
  const bounds=pane.getBoundingClientRect(),nextById=new Map(sorted.map(entry=>[entry.id,entry]));
  const visible=oldNodes.find(node=>nextById.has(node.dataset.noticeId)&&node.getBoundingClientRect().bottom>bounds.top);
  const offset=visible?.getBoundingClientRect().top;
  const template=document.createElement('template');
  template.innerHTML=officialNoticeEntriesHTML(sorted)||'<div class="dm-empty"><p>아직 받은 공지가 없습니다.</p></div>';
  const existing=new Map(oldNodes.map(node=>[node.dataset.noticeId,node]));
  for(const node of Array.from(template.content.children)){
   const saved=existing.get(node.dataset.noticeId);
   if(saved&&same(nextById.get(node.dataset.noticeId),saved))node.replaceWith(saved);
  }
  list.replaceChildren(template.content);
  const anchorNode=visible&&children().find(node=>node.dataset.noticeId===visible.dataset.noticeId);
  if(anchorNode)pane.scrollTop+=anchorNode.getBoundingClientRect().top-offset;
 };
 earlier.onclick=async()=>{
  if(!current()||!before||loading)return;
  loading=true;earlier.disabled=true;
  try{
   const older=await api(officialNoticePath+'?before='+encodeURIComponent(before),'GET',undefined,{signal:events.signal,fresh:true});
   if(!current())return;
   const additions=older.items.filter(entry=>!items.has(entry.id));
   repaint([...items.values(),...additions].sort(compareOfficialNotices));
   remember(additions);before=older.before;earlier.hidden=!before;
   earlier.textContent='이전 공지 보기';earlier.removeAttribute('title');
   schedule();
  }catch(error){
   if(current()){earlier.textContent='이전 공지 다시 시도';earlier.setAttribute('title',error.message);}
  }finally{loading=false;earlier.disabled=false;}
 };
 const refresh=async()=>{
  if(!current())return;
  if(refreshing){refreshAgain=true;return;}
  refreshing=true;
  try{
   do{
    refreshAgain=false;
    const latest=await api(officialNoticePath,'GET',undefined,{signal:events.signal,fresh:true});
    if(!current())return;
    const first=latest.items[0],earlierIds=latest.before&&first?
     [...items.values()].filter(entry=>compareOfficialNotices(entry,first)<0).map(entry=>entry.id):[];
    const merged=new Map(latest.items.map(entry=>[entry.id,entry]));
    for(let start=0;start<earlierIds.length;start+=100){
     const older=await api(knownOfficialNoticePath(earlierIds.slice(start,start+100)),'GET',undefined,{signal:events.signal,fresh:true});
     if(!current())return;
     for(const entry of older.items)merged.set(entry.id,entry);
    }
    const sorted=[...merged.values()].sort(compareOfficialNotices);
    repaint(sorted);
    if(!earlierIds.length||!latest.before)before=latest.before;
    earlier.hidden=!before;
    items.clear();remember(sorted);schedule();
   }while(refreshAgain&&current());
  }catch{/* The feed stays available and the next inbox event or focus can retry. */}
  finally{refreshing=false;}
 };
 const resume=()=>{
  retries=0;clearTimeout(retryTimer);retryTimer=null;schedule();void refresh();
 };
 pane.addEventListener('scroll',schedule,{...options,passive:true});
 document.addEventListener('visibilitychange',resume,options);
 for(const type of ['focus','online','pageshow'])window.addEventListener(type,resume,options);
 retry.addEventListener('click',resume,options);
 const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
 resize?.observe(pane);
 const ready=typeof MutationObserver==='function'?new MutationObserver(schedule):null;
 if(document.documentElement)ready?.observe(document.documentElement,{attributes:true,attributeFilter:['data-render-state']});
 schedule();
 const dispose=()=>{
  events.abort();if(ackFrame!==null)cancelAnimationFrame(ackFrame);
  clearTimeout(retryTimer);resize?.disconnect();ready?.disconnect();
 };
 return Object.assign(dispose,{refresh});
}
async function dmNoticeView(raw,readApi=api,knownInbox=null,layout=dmInboxHTML){
 const params=new URLSearchParams(raw.split('?')[1]||'');
 const peer=params.get('peer')||raw.split('?')[0].split('/')[1];
 const anchor=params.get('entry')||(peer==='premium-open-event-20261231-v1'?'campaign:'+peer:peer==='aifect-guide'?peer:params.get('peer')||'');
 const [inbox,initial]=await Promise.all([knownInbox||readApi(unifiedDmInboxPath),readApi(officialNoticePath)]);
 let feed=initial;
 if(/^(campaign|dm):[\w-]{1,100}$/.test(anchor)&&!feed.items.some(entry=>entry.id===anchor)){
  const anchorFeed=await readApi(knownOfficialNoticePath([anchor]));
  feed={...initial,items:[...initial.items,...anchorFeed.items].sort(compareOfficialNotices),missingAnchor:!anchorFeed.items.length};
 }
 rememberDmInbox(inbox);
 const back='<a class="chat-ui-icon chat-ui-plain dm-back" href="#dm" aria-label="대화 목록으로 돌아가기">'+icon('back')+'</a>';
 const header='<header class="dm-thread-header">'+back+'<div class="dm-thread-person"><div><h1>'+esc(feed.channel.name)+'</h1></div></div></header>';
 return {html:layout(inbox,header+officialNoticeTimeline(feed),'notice'),inbox:true,selectedConversation:'notice',noticeFeed:feed,noticeAnchor:anchor};
}
function dmFriendFinderHTML(){
 return '<header class="dm-thread-header"><a href="#dm" class="icon-button dm-finder-back" aria-label="뒤로 가기">'+icon('back')+'</a><h1>친구 찾기</h1></header>'+
  '<section class="dm-friend-finder"><label class="dm-search brand-search">'+icon('search')+'<input type="search" data-dm-friend-query aria-label="닉네임 또는 아이디 검색" placeholder="닉네임 또는 아이디 검색" maxlength="100" autocomplete="off" enterkeyhint="search"></label>'+
  '<p class="dm-finder-status" role="status" aria-live="polite"></p><button type="button" class="text-link dm-finder-retry" hidden>다시 시도</button><ul class="dm-finder-results" aria-label="회원 검색 결과"></ul></section>';
}
function bindDmFriendFinder(panel,addTarget){
 const input=panel.querySelector('[data-dm-friend-query]'),results=panel.querySelector('.dm-finder-results');
 const status=panel.querySelector('.dm-finder-status'),retry=panel.querySelector('.dm-finder-retry'),uid=me.id;
 let timer,controller,version=0;
 function invalidate(){
  version++;clearTimeout(timer);controller?.abort();controller=null;
  results.replaceChildren();results.removeAttribute('aria-busy');retry.hidden=true;status.textContent='';
 }
 function schedule(delay=275){
  invalidate();
  const query=input.value.trim(),ticket=version;
  if(!query)return;
  const current=()=>ticket===version&&uid===me?.id&&panel.isConnected&&location.hash.split('?')[0]==='#dm/tools/friends';
  timer=setTimeout(async()=>{
   if(!current())return;
   controller=new AbortController();results.setAttribute('aria-busy','true');status.textContent='검색 중…';
   try{
    const {members}=await api('/api/dm/recipients/search?q='+encodeURIComponent(query),'GET',undefined,{signal:controller.signal,fresh:true});
    if(!current())return;
    results.innerHTML=members.map(person=>{
     const route='dm/'+encodeURIComponent(person.id);addTarget(route);
     return '<li><a class="dm-finder-person" href="#'+esc(route)+'"><span class="artist-portrait profile-avatar">'+avatarImage({...person,name:person.nickname},'producer',false)+'</span><span class="dm-finder-identity"><strong'+premiumNameAttribute(person.profile_id||person.id,person.user_id)+'>'+esc(person.nickname)+'</strong><small>'+esc(person.public_id)+'</small></span></a></li>';
    }).join('');
    status.textContent=members.length?'검색 결과 '+members.length+'명':AifectMessages.searchEmpty;
   }catch(error){
    if(!current())return;
    status.textContent='검색하지 못했습니다. 다시 시도해 주세요.';retry.hidden=false;
   }finally{if(current())results.removeAttribute('aria-busy');}
  },delay);
 }
 input.oninput=event=>{if(event.isComposing)invalidate();else schedule();};
 input.oncompositionstart=invalidate;input.oncompositionend=()=>schedule();
 retry.onclick=()=>schedule(0);
 results.onclick=event=>{
  const link=event.target.closest('a.dm-finder-person');
  if(!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();history.replaceState(history.state,'',link.hash);void render();
 };
 input.focus({preventScroll:true});
 return invalidate;
}
document.addEventListener('click',event=>{
 if(event.target.closest('[data-official-notice-scroll]')&&globalThis.AifectOfficialNotice?.openNoticeImage(event))return;
 if(event.target.closest('[data-dm-find]'))location.hash='dm/tools/friends';
});
// Every mobile thread has a real list history entry, including shared URLs and reloads.
(() => {
 let previous=location.hash;
 const thread=hash=>/^#dm\/.+/.test(hash);
 const notice=hash=>/^#dm\/notice(?:\?|$)/.test(hash);
 function remember(){
  const route=location.hash;
  if(thread(route)&&!history.state?.aifectDmBack){
   if(previous!=='#dm'&&!thread(previous)){
    history.replaceState(history.state,'',location.pathname+location.search+'#dm');
    history.pushState({...history.state,aifectDmBack:true},'',location.pathname+location.search+route);
   }else history.replaceState({...history.state,aifectDmBack:previous==='#dm'||!notice(route)},'');
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
