let activityResume=null;
let activityAccount=null,activityCount=null,activityBusy=false,activityReadRevision=0,activityReadObserver=null;
function activityDate(at,short=false){return new Date(at*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',...(short?{}:{hour:'2-digit',minute:'2-digit'})});}
function activityRowHTML(n){
 const gift=['gift','person_gift'].includes(n.kind),label=gift?'받은 선물':({fan_comment:'팬라운지 댓글·답글',fan_post:'새 응원글',artist_follower:'아티스트 새 팔로워',artist_release:'아티스트 신곡',crew_invite:'크루 초대',crew_approved:'크루 가입 승인',crew_request:'작품 참여 요청',dubbing_complete:'참여 더빙 완성',dubbing_participation:'더빙 참여 공개',work_status:'작품 상태·중요 안내',crew_notice:'크루 공지',duet:'듀엣 참여',cover:'커버 참여',comment:'댓글',follow:'팔로우'}[n.kind]||'활동');
 const product=gift?(n.currency==='silver'?AifectGifts.silverGiftById(n.gift_type):AifectGifts.giftById(n.gift_type)):null;
 const giftName=n.gift_name==='은화'?'실버':n.gift_name;
 const action=gift?`${product?`<img class="activity-gift-art" src="${esc(product.image)}" alt="${esc(giftName||product.name)}" title="${esc(giftName||product.name)}" width="28" height="28" loading="lazy" decoding="async">`:esc(giftName)} <b class="activity-gift-quantity">× ${number(n.quantity)}개</b>를 보냈어요.`:({fan_comment:'팬라운지에 댓글·답글을 남겼어요.',fan_post:'팬라운지에 응원글을 남겼어요.',artist_follower:'AI 아티스트를 팔로우했어요.',artist_release:'새 제작곡을 공개했어요.',crew_invite:'크루에 초대했어요.',crew_approved:'크루 가입을 승인했어요.',crew_request:'작품 참여를 요청했어요.',dubbing_complete:'함께 참여한 더빙이 완성됐어요.',dubbing_participation:'더빙 참여 작품을 공개했어요.',work_status:'작품 처리 결과가 도착했어요.',crew_notice:'크루 공지를 등록했어요.',duet:'내 듀엣에 참여했어요.',cover:'내 곡으로 커버를 공개했어요.',comment:'내 음악에 댓글을 남겼어요.',follow:'나를 팔로우했어요.'}[n.kind]||'새로운 활동을 남겼어요.');
 const href=n.href??(n.kind==='crew_notice'&&n.available?'#crew/'+encodeURIComponent(n.target)+'?tab=notice':n.available?(['person_gift','follow'].includes(n.kind)?'#producer/':'#song/')+encodeURIComponent(n.target):'');
 const giftSource=n.id?.startsWith('decoration:')?'인벤토리':n.gift_source_kind?`${n.gift_source_kind==='song'?'곡 이야기':'프로필'}${n.gift_source_title?' · '+n.gift_source_title:''}`:(n.source_title?'곡 이야기 · '+n.source_title:n.kind==='person_gift'?'프로필':'');
 const decoration=n.id?.startsWith('decoration:');
 const giftHref=decoration?'#inventory':n.available&&n.gift_source_kind&&n.gift_source_target?`#${n.gift_source_kind}/${encodeURIComponent(n.gift_source_target)}`:'';
 const giftDetail=`<div class="activity-detail activity-gift-detail"><b class="activity-value ${esc(n.currency)}">${number(n.amount)} ${n.currency==='gold'?'G':'S'}</b>${giftSource?`<span class="activity-gift-separator" aria-hidden="true">·</span><${giftHref?'a':'span'} class="activity-gift-source" title="${esc(giftSource)}" ${giftHref?`data-activity-open="${esc(n.id)}" href="${esc(giftHref)}"`:''}>${esc(giftSource)}</${giftHref?'a':'span'}>`:''}</div>`;
 const avatar=n.actor_profile_id&&n.actor_image_version?'/media/producer/'+encodeURIComponent(n.actor_profile_id)+'?v='+encodeURIComponent(n.actor_image_version||'default'):'/assets/default-avatar.png';
 const destination=gift?(giftHref||href):href;
 const purpose=gift?'선물 받은 곳 보기':['comment','fan_comment','fan_post'].includes(n.kind)?'댓글·응원 보기':n.kind==='artist_follower'?'아티스트 보기':n.kind==='work_status'?'작품 관리':n.kind.startsWith('crew_')?'크루·요청 보기':'작품 보기';
 const detail=gift?giftDetail.replace(/<a /g,'<span ').replace(/<\/a>/g,'</span>').replace(/ data-activity-open="[^"]*"/g,'').replace(/ href="[^"]*"/g,''):['artist_name','source_title','detail'].filter(k=>n[k]).map(k=>`<span title="${esc(n[k])}">${esc(n[k])}</span>`).join('');
 return `<a data-list-row class="activity-row${n.read_at?'':' is-unread'}" data-activity-id="${esc(n.id)}" data-activity-open="${esc(n.id)}" href="${esc(destination||'#notifications?unavailable=1')}" aria-label="${esc(n.actor_name)} · ${label} · ${purpose}"><div class="activity-avatar"><img src="${esc(avatar)}" alt="" loading="lazy"><span>${icon(gift?'gift':n.kind.includes('crew')?'users':['follow','artist_follower'].includes(n.kind)?'user':['comment','fan_comment','fan_post'].includes(n.kind)?'message':n.kind==='work_status'?'bell':'mic')}</span></div><div class="activity-copy"><div class="activity-meta"><span>${label}</span></div><p><strong>${esc(n.actor_name)}</strong>${n.kind==='work_status'?' · ':'님이 '}${action}</p><div class="activity-detail">${detail}</div></div><span class="activity-time"><time datetime="${new Date(n.created*1000).toISOString()}">${esc(new Date(n.created*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Seoul'}))}</time>${n.read_at?'':'<i class="activity-dot" aria-label="읽지 않음"></i>'}</span></a>`;
}
function activityGroupsHTML(items){let day='';return items.map(n=>{const next=activityDate(n.created,true),header=day===next?'':`<h2 class="activity-day">${esc(next)}</h2>`;day=next;return header+activityRowHTML(n);}).join('');}
async function notificationsView(base,raw,readApi=api){
 if(base!=='notifications')return null;
 if(!me)return {html:heading('알림')+empty('로그인하면 알림을 볼 수 있어요','내 음악에 도착한 참여와 선물을 모아드려요.','#account','로그인'),tracks:[]};
 const q=new URLSearchParams(raw.split('?')[1]||'');
 if(q.has('unavailable'))return {html:heading('알림 안내')+empty('콘텐츠를 열 수 없어요','삭제·비공개 또는 접근 권한이 변경된 콘텐츠예요. 뒤로 가면 이전 알림 목록으로 돌아갈 수 있어요.','#notifications','알림함'),tracks:[]};
 if(q.has('request')){let r;try{r=await readApi('/api/notifications/crew-requests/'+encodeURIComponent(q.get('request')));}catch{return {html:heading('참여 요청 안내')+empty('요청을 열 수 없어요','크루 가입 상태 또는 작품의 공개 상태가 변경되었어요.','#notifications?filter=crew','알림함'),tracks:[]};}return {html:heading('작품 참여 요청')+`<section class="activity-page"><p>${esc(r.title)} 작품 참여 요청이 도착했어요.</p><a class="small-button" href="${esc(r.href)}">작품 확인</a><a class="small-button" href="#notifications?filter=crew">알림함</a></section>`,tracks:[]};}
 const filter=['gifts','participation','comments','works','artists','crew'].includes(q.get('filter'))?q.get('filter'):'all',data=await readApi('/api/notifications?filter='+filter,'GET',undefined,{fresh:true});
 const resume=activityResume?.account===me.id&&activityResume.filter===filter?activityResume:null;
 activityResume=null;
 return {activity:{...data,filter,account:me.id,restoreCount:resume?.count,restoreScroll:resume?.scroll},tracks:[],html:`<section class="activity-page"><h1 class="activity-title">알림</h1><div class="activity-toolbar"><nav class="tabs" aria-label="알림 종류">${[['all','전체'],['comments','댓글·응원'],['works','작품·참여'],['artists','아티스트'],['crew','크루'],['gifts','선물']].map(([key,name])=>`<a href="#notifications?filter=${key}" class="tab ${filter===key?'active':''}" ${filter===key?'aria-current="page"':''}>${name}</a>`).join('')}</nav></div>${activitySettingsHTML()}<div id="activity-list">${data.items.length?activityGroupsHTML(data.items):`<div class="activity-empty">${icon('bell')}<h2>아직 도착한 알림이 없어요</h2><p>누군가 내 곡에 참여하거나 선물을 보내면<br>이곳에서 확인할 수 있어요.</p></div>`}</div><button class="small-button activity-more" data-activity-more ${data.next?'':'hidden'}>이전 알림 더 보기</button><p class="activity-error" role="status"></p><button type="button" class="activity-top" aria-label="알림 맨 위로" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6-6 6 6M12 4v16"/></svg></button></section>`};
}
function bindNotifications(view){
 const state=view?.activity,root=$('.activity-page');if(!state||!root||me?.id!==state.account)return;
 let disposed=false;
 void bindActivitySettings(root,state.account);paintActivityBadge(state.unread);const active=()=>!disposed&&me?.id===state.account&&root.isConnected;
 const mark=async ids=>{if(!ids.length)return;const result=await api('/api/notifications/read','POST',{ids});if(me?.id!==state.account)return;++activityReadRevision;activityAccount=state.account;activityCount=result.unread;paintActivityBadge(result.unread);if(!active())return;for(const n of state.items)if(ids.includes(n.id))n.read_at=Date.now()/1000;root.querySelectorAll('[data-activity-id]').forEach(row=>{if(ids.includes(row.dataset.activityId)){row.classList.remove('is-unread');row.querySelector('.activity-dot')?.remove();row.querySelector('[data-activity-read]')?.remove();}});};
 let loading=false,refreshing=false,restoring=false;const emptyHTML=root.querySelector('#activity-list')?.innerHTML||'';
 const draw=()=>{root.querySelector('#activity-list').innerHTML=state.items.length?activityGroupsHTML(state.items):emptyHTML;root.querySelector('[data-activity-more]').hidden=!state.next;};
 root.onclick=async e=>{
  const b=e.target.closest('[data-activity-open],[data-activity-more],[data-activity-request]');if(!b||b.disabled||!active())return;e.preventDefault();
  if(loading||restoring)return;loading=true;b.setAttribute('aria-busy','true');
  try{
   if(b.hasAttribute('data-activity-request')){await activityRequestComposer(state.account);}else if(b.hasAttribute('data-activity-more')){
    if(!state.next)return;
    const data=await api('/api/notifications?filter='+state.filter+'&before='+encodeURIComponent(state.next),'GET',undefined,{fresh:true});
    if(!active())return;const known=new Set(state.items.map(n=>n.id));state.items.push(...data.items.filter(n=>!known.has(n.id)));state.next=data.next;draw();
   }else{
    const id=b.dataset.activityOpen;await mark([id]);
    if(!active())return;
    const result=await api('/api/notifications/'+encodeURIComponent(id)+'/open','POST',{});
    if(active())location.hash=result.available?result.href:'#notifications?unavailable=1';
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
   paintActivityBadge(data.unread);if(JSON.stringify(state.items)!==previous)draw();
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

const activityPreferenceGroups=[['메시지',[['dm','DM 및 기존 크루 메시지']]],['댓글·응원',[['comment','내 작품 댓글'],['fan_comment','팬라운지 댓글·답글']]],['작품·참여',[['participation','커버·듀엣·더빙 공개 및 완성']]],['AI 아티스트',[['artist_follower','새 팔로워 · 하루 1회'],['artist_release','신곡 공개 · 하루 1회']]],['크루',[['crew_important','초대·가입 승인·작품 참여 요청']]],['선물',[['gift','선물 수신']]],['작품 상태·중요 안내',[['work_status','공개 실패·검토 반려·이용 제한']]]];
function activitySettingsHTML(){return '<details class="activity-settings"><summary>알림 설정</summary><form data-activity-settings><p>휴대폰 푸시 수신 설정이에요. 꺼도 알림함 기록은 유지됩니다. 아티스트 소식은 한국 시간 오후 8시에 하루 한 번 모아 보내요. 새 응원글은 알림함에만 표시해요.</p>'+activityPreferenceGroups.map(([group,items])=>'<fieldset><legend>'+group+'</legend>'+items.map(([key,label])=>'<label><input type="checkbox" name="'+key+'" disabled> '+label+'</label>').join('')+'</fieldset>').join('')+'<p>여기서 끌 수 있는 작품 상태 안내와 계정·결제 등 서비스 필수 안내는 별도로 처리됩니다.</p><button class="small-button" disabled>설정 저장</button><p role="status" data-preference-status></p></form><button type="button" class="text-link" data-activity-request>작품 참여 요청</button></details>';}
async function bindActivitySettings(root,account){
 const form=root.querySelector('[data-activity-settings]');if(!form)return;const status=form.querySelector('[data-preference-status]'),alive=()=>root.isConnected&&me?.id===account;
 try{const p=await api('/api/push/preferences');if(!alive())return;for(const input of form.querySelectorAll('input')){input.checked=p[input.name]!==0;input.disabled=false;}form.querySelector('button').disabled=false;}catch(e){status.textContent=e.message;return;}
 form.onsubmit=async e=>{e.preventDefault();if(!alive())return;const button=form.querySelector('button');button.disabled=true;try{const body={account_id:account};for(const input of form.querySelectorAll('input'))body[input.name]=input.checked;await api('/api/push/preferences','PUT',body);if(alive())status.textContent='알림 설정을 저장했어요.';}catch(e){if(alive())status.textContent=e.message;}finally{if(alive())button.disabled=false;}};
}

async function activityRequestComposer(account){
 const [crew,studio]=await Promise.all([api('/api/crews?summary=1&home=1'),api('/api/studio')]);if(me?.id!==account)return;
 const members=(crew.detail?.members||[]).filter(p=>p.user_id!==account),tracks=(studio.tracks||[]).filter(t=>t.status==='published');
 if(!crew.detail?.membership||!members.length||!tracks.length){toast('현재 크루원과 내 공개 작품이 있어야 요청할 수 있어요.');return;}
 dialog('<h2>작품 참여 요청</h2><form data-crew-participation class="upload-form"><label class="form-field">크루원<select name="recipient" data-dropdown="md">'+members.map(p=>'<option value="'+esc(p.user_id)+'">'+esc(p.name)+'</option>').join('')+'</select></label><label class="form-field">내 공개 작품<select name="track" data-dropdown="md">'+tracks.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.title)+'</option>').join('')+'</select></label><button class="small-button">요청 보내기</button><p class="form-error" role="alert"></p></form>');
 const form=document.querySelector('[data-crew-participation]'),requestId=crypto.randomUUID();
 form.onsubmit=busyForm(form,async fd=>{if(me?.id!==account)throw Error('로그인 계정이 바뀌었어요.');await api('/api/notifications/crew-requests','POST',{crew_id:crew.detail.crew.id,recipient_id:fd.get('recipient'),track_id:fd.get('track'),request_id:requestId});document.querySelector('#dialog').close();toast('작품 참여 요청을 보냈어요.');});
}
