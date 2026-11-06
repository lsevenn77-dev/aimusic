let activityResume=null;
let activityAccount=null,activityCount=null,activityBusy=false,activityReadRevision=0,activityReadObserver=null;
function activityDate(at,short=false){return new Date(at*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',...(short?{}:{hour:'2-digit',minute:'2-digit'})});}
function activityRowHTML(n){
 const gift=['gift','person_gift'].includes(n.kind),label=gift?'받은 선물':({fan_comment:'팬라운지 댓글·답글',fan_post:'새 응원글',artist_follower:'아티스트 새 팔로워',artist_release:'아티스트 신곡',crew_invite:'크루 초대',crew_approved:'크루 가입 승인',crew_request:'작품 참여 요청',dubbing_complete:'참여 더빙 완성',dubbing_participation:'더빙 참여 공개',work_status:'작품 상태·중요 안내',crew_notice:'크루 공지',duet:'듀엣 참여',cover:'커버 참여',comment:'댓글',follow:'팔로우'}[n.kind]||'활동');
 const product=gift?(n.currency==='silver'?AifectGifts.silverGiftById(n.gift_type):AifectGifts.giftById(n.gift_type)):null;
 const giftName=n.gift_name==='은화'?'실버':n.gift_name;
 const action=gift?`${product?`<img class="activity-gift-art" src="${esc(product.image)}" alt="${esc(giftName||product.name)}" title="${esc(giftName||product.name)}" width="28" height="28" loading="lazy" decoding="async">`:esc(giftName)} <b class="activity-gift-quantity">× ${number(n.quantity)}개</b>를 보냈어요.`:({fan_comment:'팬라운지에 댓글·답글을 남겼어요.',fan_post:'팬라운지에 응원글을 남겼어요.',artist_follower:'AI 아티스트를 팔로우했어요.',artist_release:'새 제작곡을 공개했어요.',crew_invite:'크루에 초대했어요.',crew_approved:'크루 가입을 승인했어요.',crew_request:'작품 참여를 요청했어요.',dubbing_complete:'함께 참여한 더빙이 완성됐어요.',dubbing_participation:'더빙 참여 작품을 공개했어요.',work_status:'작품 처리 결과가 도착했어요.',crew_notice:'크루 공지를 등록했어요.',duet:'내 듀엣에 참여했어요.',cover:'내 곡으로 커버를 공개했어요.',comment:'내 음악에 댓글을 남겼어요.',follow:'나를 팔로우했어요.'}[n.kind]||'새로운 활동을 남겼어요.');
 const href=n.href??(n.kind==='crew_notice'&&n.available?'#crew/'+encodeURIComponent(n.target)+'?tab=notice':!gift&&n.available?(n.kind==='follow'?'#producer/':'#song/')+encodeURIComponent(n.target):'');
 const passive=gift&&(['talking_room','karaoke','message'].includes(n.source_type)||n.clickable===false);
 const rowTag=passive?'div':'a';
 const sourceLabel={artist:'아티스트 프로필',message:'메시지',profile:'프로필',talking_room:'토킹룸',karaoke:'노래방',work:'작품 상세',inventory:'인벤토리',shop:'선물 상점'}[n.source_type];
 const giftSource=sourceLabel?[sourceLabel,n.gift_source_title].filter(Boolean).join(' · '):'출처 확인 불가';
 const giftDetail=`<div class="activity-detail activity-gift-detail"><b class="activity-value ${esc(n.currency)}">${number(n.amount)} ${n.currency==='gold'?'G':'S'}</b><span class="activity-gift-separator" aria-hidden="true">·</span><span class="activity-gift-source" title="${esc(giftSource)}">${esc(giftSource)}</span></div>`;
 const avatar=n.actor_profile_id&&n.actor_image_version?'/media/producer/'+encodeURIComponent(n.actor_profile_id)+'?v='+encodeURIComponent(n.actor_image_version||'default'):'/assets/default-avatar.png';
 const destination=href||'#notifications?unavailable='+encodeURIComponent(n.unavailable_reason||'1');
 const purpose=gift?'선물 받은 곳 보기':['comment','fan_comment','fan_post'].includes(n.kind)?'댓글·응원 보기':n.kind==='artist_follower'?'아티스트 보기':n.kind==='work_status'?'작품 관리':n.kind.startsWith('crew_')?'크루·요청 보기':'작품 보기';
 const detail=gift?giftDetail:['artist_name','source_title','detail'].filter(k=>n[k]).map(k=>`<span title="${esc(n[k])}">${k==='artist_name'?userNickname(n[k],{artistId:n.artist_id,entityType:'artist'}):esc(n[k])}</span>`).join('');
 const created=new Date(n.created*1000);
 const time=created.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Seoul'});
 const unreadDot=n.read_at?'':'<i class="activity-dot" aria-label="읽지 않음"></i>';
 return `<${rowTag} data-list-row class="activity-row${n.read_at?'':' is-unread'}" data-activity-id="${esc(n.id)}" ${passive?'':`data-activity-open="${esc(n.id)}" href="${esc(destination)}"`} aria-label="${esc(n.actor_name)} · ${label}${passive?'':' · '+purpose}">
  <div class="activity-avatar">${unreadDot}<img src="${esc(avatar)}" alt="" loading="lazy"></div>
  <div class="activity-copy">
   <div class="activity-meta"><span>${label}</span><span aria-hidden="true">·</span><time datetime="${created.toISOString()}">${esc(time)}</time></div>
   <p><strong>${userNickname(n.actor_name,{profileId:n.actor_profile_id,userId:n.actor_user_id})}</strong>${n.kind==='work_status'?' · ':'님이 '}${action}</p><div class="activity-detail">${detail}</div>
  </div>
 </${rowTag}>`;
}
function activityGroupsHTML(items){let day='';return items.map(n=>{const next=activityDate(n.created,true),header=day===next?'':`<h2 class="activity-day">${esc(next)}</h2>`;day=next;return header+activityRowHTML(n);}).join('');}
/*! Lucide settings icon (ISC), https://lucide.dev/icons/settings
 * Copyright (c) 2026 Lucide Icons and Contributors
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
const activitySettingsIcon='<svg class="lucide lucide-settings" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>';
async function notificationsView(base,raw,readApi=api){
 if(base!=='notifications')return null;
 if(!me)return {html:empty('로그인하면 알림을 볼 수 있어요','내 음악에 도착한 참여와 선물을 모아드려요.','#account','로그인'),tracks:[]};
 const q=new URLSearchParams(raw.split('?')[1]||'');
 if(q.has('unavailable')){
  const message={room:'종료되었거나 삭제된 방이에요.',source:'이 선물의 발생 위치를 확인할 수 없어요.'}[q.get('unavailable')]||'삭제·비공개 또는 접근 권한이 변경된 콘텐츠예요.';
  return {html:heading('알림 안내')+empty('콘텐츠를 열 수 없어요',message+' 뒤로 가면 이전 알림 목록으로 돌아갈 수 있어요.','#notifications','알림함'),tracks:[]};
 }
 if(q.has('request')){let r;try{r=await readApi('/api/notifications/crew-requests/'+encodeURIComponent(q.get('request')));}catch{return {html:heading('참여 요청 안내')+empty('요청을 열 수 없어요','크루 가입 상태 또는 작품의 공개 상태가 변경되었어요.','#notifications?filter=crew','알림함'),tracks:[]};}return {html:heading('작품 참여 요청')+`<section class="activity-page"><p>${esc(r.title)} 작품 참여 요청이 도착했어요.</p><a class="small-button" href="${esc(r.href)}">작품 확인</a><a class="small-button" href="#notifications?filter=crew">알림함</a></section>`,tracks:[]};}
 const filter=['gifts','participation','comments','works','artists','crew'].includes(q.get('filter'))?q.get('filter'):'all',data=await readApi('/api/notifications?filter='+filter,'GET',undefined,{fresh:true});
 const resume=activityResume?.account===me.id&&activityResume.filter===filter?activityResume:null;
 activityResume=null;
 const tabs=[['all','전체'],['comments','댓글·응원'],['works','작품참여'],['artists','아티스트'],['crew','크루'],['gifts','선물']];
 return {activity:{...data,filter,account:me.id,restoreCount:resume?.count,restoreScroll:resume?.scroll},tracks:[],html:`<section class="activity-page activity-inbox" aria-label="알림">
  <div class="activity-toolbar"><nav class="tabs" aria-label="알림 종류">
   ${tabs.map(([key,name])=>`<a href="#notifications?filter=${key}" class="tab ${key==='all'?'activity-tab-all ':''}${filter===key?'active':''}" ${filter===key?'aria-current="page"':''}>${name}</a>`).join('')}
  </nav><button type="button" class="activity-settings-trigger" aria-label="알림 설정" title="알림 설정" aria-haspopup="dialog" aria-controls="activity-preferences">${activitySettingsIcon}<span>알림 설정</span></button></div>
  ${activitySettingsHTML()}<div id="activity-list">${data.items.length?activityGroupsHTML(data.items):`<div class="activity-empty">${icon('bell')}<h2>아직 도착한 알림이 없어요</h2><p>누군가 내 곡에 참여하거나 선물을 보내면<br>이곳에서 확인할 수 있어요.</p></div>`}</div>
  <button class="small-button activity-more" data-activity-more ${data.next?'':'hidden'}>이전 알림 더 보기</button><p class="activity-error" role="status"></p><button type="button" class="activity-top" aria-label="알림 맨 위로" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6-6 6 6M12 4v16"/></svg></button></section>`};
}
function bindNotifications(view){
 const state=view?.activity,root=$('.activity-page');if(!state||!root||me?.id!==state.account)return;
 let disposed=false;
 bindActivitySettings(root,state.account);paintActivityBadge(state.unread);const active=()=>!disposed&&me?.id===state.account&&root.isConnected;
 const mark=async ids=>{if(!ids.length)return;const result=await api('/api/notifications/read','POST',{ids});if(me?.id!==state.account)return;++activityReadRevision;activityAccount=state.account;activityCount=result.unread;paintActivityBadge(result.unread);if(!active())return;for(const n of state.items)if(ids.includes(n.id))n.read_at=Date.now()/1000;root.querySelectorAll('[data-activity-id]').forEach(row=>{if(ids.includes(row.dataset.activityId)){row.classList.remove('is-unread');row.querySelector('.activity-dot')?.remove();row.querySelector('[data-activity-read]')?.remove();}});};
 const acknowledge=async through=>{
  if(!active()||!Number.isSafeInteger(through))return;
  try{
   const ids=state.items.filter(n=>!n.read_at).map(n=>n.id);
   const result=await api('/api/notifications/read','POST',{through});
   if(me?.id!==state.account)return;
   ++activityReadRevision;activityAccount=state.account;activityCount=result.unread;paintActivityBadge(result.unread);
   if(!active())return;
   for(const n of state.items)if(ids.includes(n.id))n.read_at=Date.now()/1000;
   root.querySelectorAll('[data-activity-id]').forEach(row=>{if(ids.includes(row.dataset.activityId)){row.classList.remove('is-unread');row.querySelector('.activity-dot')?.remove();}});
  }catch(error){if(active())root.querySelector('.activity-error').textContent=error.message;}
 };
 void acknowledge(state.read_through);
 let loading=false,refreshing=false,restoring=false;const emptyHTML=root.querySelector('#activity-list')?.innerHTML||'';
 const draw=()=>{root.querySelector('#activity-list').innerHTML=state.items.length?activityGroupsHTML(state.items):emptyHTML;root.querySelector('[data-activity-more]').hidden=!state.next;};
 root.onclick=async e=>{
  const b=e.target.closest('[data-activity-open],[data-activity-more]');if(!b||b.disabled||!active())return;e.preventDefault();
  if(loading||restoring)return;loading=true;b.setAttribute('aria-busy','true');
  try{
   if(b.hasAttribute('data-activity-more')){
    if(!state.next)return;
    const data=await api('/api/notifications?filter='+state.filter+'&before='+encodeURIComponent(state.next),'GET',undefined,{fresh:true});
    if(!active())return;const known=new Set(state.items.map(n=>n.id));state.items.push(...data.items.filter(n=>!known.has(n.id)));state.next=data.next;draw();
   }else{
    const id=b.dataset.activityOpen;await mark([id]);
    if(!active())return;
    const result=await api('/api/notifications/'+encodeURIComponent(id)+'/open','POST',{});
    if(active())location.hash=result.available?result.href:'#notifications?unavailable='+encodeURIComponent(result.unavailable_reason||'1');
   }
  }catch(err){if(active())root.querySelector('.activity-error').textContent=err.message;}finally{loading=false;b.removeAttribute('aria-busy');}
 };
 const refresh=async()=>{
  if(!active()||document.hidden||loading||refreshing||restoring)return;refreshing=true;
  const revision=activityReadRevision;
  try{const data=await api('/api/notifications?filter='+state.filter,'GET',undefined,{fresh:true});
   if(!active()||loading||revision!==activityReadRevision)return;
   const previous=JSON.stringify(state.items);const old=new Map(state.items.map(n=>[n.id,n]));data.items.forEach(n=>old.set(n.id,n));
   // Retain loaded older pages and their cursor; only the newest page is polled.
   state.items=[...old.values()].sort((a,b)=>b.created-a.created||(a.id<b.id?1:-1));
   if(!state.next&&state.items.length<=20)state.next=data.next;
   paintActivityBadge(data.unread);if(JSON.stringify(state.items)!==previous)draw();await acknowledge(data.read_through);
  }catch{}finally{refreshing=false;}
 };
 const timer=setInterval(refresh,30000),visible=()=>{if(!document.hidden)void refresh();};
 window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
 const cleanupLayout=bindActivityLayout(root,active);
 let cancelRestore=()=>{};
 if(state.restoreCount&&typeof requestAnimationFrame==='function'){
  const controller=new AbortController(),more=root.querySelector('[data-activity-more]');
  const events=['wheel','touchstart','pointerdown','keydown','input'];
  restoring=true;more.disabled=true;
  cancelRestore=()=>{
   controller.abort();restoring=false;more.disabled=false;
   events.forEach(event=>window.removeEventListener(event,cancelRestore,true));
  };
  events.forEach(event=>window.addEventListener(event,cancelRestore,{capture:true,passive:true}));
  // Show the fresh first page before restoring older, cursor-dependent pages.
  requestAnimationFrame(async()=>{
   const visited=new Set();
   try{
    while(active()&&!controller.signal.aborted&&state.next&&state.items.length<state.restoreCount){
     const cursor=state.next;
     if(visited.has(cursor))return;
     visited.add(cursor);
     const page=await api('/api/notifications?filter='+state.filter+'&before='+encodeURIComponent(cursor),'GET',undefined,{fresh:true,signal:controller.signal});
     if(!active()||controller.signal.aborted)return;
     const known=new Set(state.items.map(n=>n.id));
     state.items.push(...page.items.filter(n=>!known.has(n.id)));state.next=page.next;draw();
    }
    if(active()&&!controller.signal.aborted&&state.restoreScroll)window.scrollTo({top:state.restoreScroll,behavior:'instant'});
   }catch(error){if(active()&&!controller.signal.aborted)root.querySelector('.activity-error').textContent=error.message;}
   finally{cancelRestore();}
  });
 }
 if(typeof registerRouteCleanup==='function')registerRouteCleanup(()=>{if(me?.id===state.account&&!/^#notifications(?:\?filter=|$)/.test(location.hash))activityResume={account:state.account,filter:state.filter,count:state.items.length,scroll:window.scrollY};disposed=true;cancelRestore();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);cleanupLayout();});
}
function bindActivityLayout(root,active){
 const top=root.querySelector('.activity-top'),tabs=root.querySelector('.tabs');
 if(!top||!tabs||typeof ResizeObserver==='undefined')return ()=>{};
 let moving=false,unlock;
 const layout=()=>{
  if(!active())return;
  const header=document.querySelector('.topbar'),rect=header?.getBoundingClientRect();
  root.style.setProperty('--activity-header',Math.max(0,rect?.bottom||0)+'px');
  let bottom=16;
  document.querySelectorAll('.player,.mobile-navigation,#player-extension,#player-action-panel,#player-lyric').forEach(el=>{const r=el.getBoundingClientRect();if(r.height&&r.width&&getComputedStyle(el).visibility!=='hidden'&&!el.hidden)bottom=Math.max(bottom,innerHeight-r.top+12);});
  top.style.bottom=bottom+'px';top.hidden=window.scrollY<500;
  const r=root.getBoundingClientRect();top.style.right=Math.max(16,innerWidth-r.right)+'px';
  root.classList.toggle('tabs-stuck',r.top<Math.max(0,rect?.bottom||0)-1);
  if(window.scrollY<2){moving=false;top.disabled=false;}
 };
 top.onclick=()=>{if(moving)return;moving=true;top.disabled=true;window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});clearTimeout(unlock);unlock=setTimeout(()=>{moving=false;top.disabled=false;},1500);};
 const reveal=()=>{if(!active())return;const selected=tabs.querySelector('.active');if(selected)tabs.scrollLeft=Math.max(0,selected.offsetLeft-tabs.offsetLeft-(tabs.clientWidth-selected.offsetWidth)/2);layout();};requestAnimationFrame(()=>requestAnimationFrame(reveal));
 const observer=new ResizeObserver(layout);document.querySelectorAll('.topbar,.player,.mobile-navigation,#player-extension').forEach(el=>observer.observe(el));
 window.addEventListener('scroll',layout,{passive:true});window.addEventListener('resize',layout);window.visualViewport?.addEventListener('resize',layout);layout();
 return ()=>{observer.disconnect();clearTimeout(unlock);window.removeEventListener('scroll',layout);window.removeEventListener('resize',layout);window.visualViewport?.removeEventListener('resize',layout);};
}

function paintActivityBadge(count){document.querySelectorAll('.activity-badge').forEach(b=>{b.hidden=!count;b.textContent='';b.setAttribute('aria-label','읽지 않은 알림 '+count+'개');});}
async function refreshActivityBadge(){
 const uid=me?.id||null;if(activityAccount!==uid){activityAccount=uid;activityCount=null;paintActivityBadge(0);}
 if(!uid||document.hidden||activityBusy)return;activityBusy=true;
 const revision=activityReadRevision;
 try{const d=await api('/api/notifications/summary','GET',undefined,{fresh:true});if(uid!==me?.id||revision!==activityReadRevision)return;if(activityCount!==null&&d.unread>activityCount&&!location.hash.startsWith('#notifications'))toast('새로운 활동 알림이 도착했어요. 알림에서 확인해보세요.');activityCount=d.unread;paintActivityBadge(d.unread);}catch{}finally{activityBusy=false;}
}
setInterval(refreshActivityBadge,30000);
window.addEventListener('focus',refreshActivityBadge);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshActivityBadge();});

const activityPreferenceGroups=[['메시지',[['dm','DM 및 기존 크루 메시지']]],['댓글·응원',[['comment','내 작품 댓글'],['fan_comment','팬라운지 댓글·답글']]],['작품참여',[['participation','커버·듀엣·더빙 공개 및 완성']]],['AI 아티스트',[['artist_follower','새 팔로워 · 하루 1회'],['artist_release','신곡 공개 · 하루 1회']]],['크루',[['crew_important','초대·가입 승인·작품 참여 요청']]],['선물',[['gift','선물 수신']]],['작품 상태·중요 안내',[['work_status','공개 실패·검토 반려·이용 제한']]]];
function activitySettingsHTML(){
 const groups=activityPreferenceGroups.map(([group,items])=>`<fieldset><legend>${group}</legend>
  ${items.map(([key,label])=>`<label><input type="checkbox" name="${key}" disabled>${label}</label>`).join('')}</fieldset>`).join('');
 return `<dialog class="compact-popup" id="activity-preferences" aria-labelledby="activity-preferences-title">
  <header><h2 id="activity-preferences-title" tabindex="-1" autofocus>알림 설정</h2><button type="button" class="activity-settings-close" aria-label="알림 설정 닫기">×</button></header>
  <form data-activity-settings>
   <div class="activity-preferences-scroll">
    <p>푸시 알림을 꺼도 알림함 기록은 유지됩니다.</p>
    <div class="activity-preference-groups">${groups}</div>
    <p>아티스트 소식은 한국 시간 오후 8시에 하루 한 번 모아 보내며, 새 응원글은 알림함에서만 확인할 수 있어요. 계정·결제 등 서비스 필수 안내는 별도로 처리됩니다.</p>
   </div>
   <footer><p role="status" data-preference-status></p><button type="submit" class="small-button" disabled>설정 저장</button></footer>
  </form>
 </dialog>`;
}

function bindActivitySettings(root,account){
 const form=root.querySelector('[data-activity-settings]');
 if(!form)return;
 const modal=form.closest('dialog'),status=form.querySelector('[data-preference-status]');
 const inputs=[...form.querySelectorAll('input')],save=form.querySelector('[type="submit"]');
 let opening=0,pendingSave;
 const active=id=>modal.open&&root.isConnected&&me?.id===account&&id===opening;
 const lock=disabled=>{for(const input of inputs)input.disabled=disabled;save.disabled=disabled;};

 root.querySelector('.activity-settings-trigger').onclick=async()=>{
  const id=++opening;
  lock(true);
  form.reset();
  status.textContent='설정을 불러오는 중이에요.';
  modal.showModal();
  form.querySelector('.activity-preferences-scroll').scrollTop=0;
  try{
   if(pendingSave)await pendingSave.catch(()=>{});
   if(!active(id))return;
   const prefs=await api('/api/push/preferences','GET',undefined,{fresh:true});
   if(!active(id))return;
   for(const input of inputs)input.checked=prefs[input.name]!==0;
   lock(false);
   status.textContent='';
  }catch(error){if(active(id))status.textContent=error.message;}
 };
 modal.querySelector('.activity-settings-close').onclick=()=>modal.close();
 form.onsubmit=async event=>{
  event.preventDefault();
  const id=opening;
  if(!active(id)||save.disabled)return;
  const body={account_id:account};
  for(const input of inputs)body[input.name]=input.checked;
  lock(true);
  status.textContent='저장 중이에요.';
  pendingSave=api('/api/push/preferences','PUT',body);
  try{
   await pendingSave;
   if(active(id))status.textContent='알림 설정을 저장했어요.';
  }catch(error){if(active(id))status.textContent=error.message;}
  finally{pendingSave=null;if(active(id))lock(false);}
 };
}
