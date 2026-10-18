let activityAccount=null,activityCount=null,activityBusy=false,activityReadRevision=0,activityReadObserver=null;
function activityDate(at,short=false){return new Date(at*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',...(short?{}:{hour:'2-digit',minute:'2-digit'})});}
function activityRowHTML(n){
 const gift=['gift','person_gift'].includes(n.kind),label=gift?'받은 선물':n.kind==='duet'?'듀엣 참여':'커버 참여';
 const action=gift?`${esc(n.gift_name==='은화'?'실버':n.gift_name)} <b>${number(n.quantity)}개</b>를 보냈어요.`:n.kind==='duet'?'내 듀엣에 참여했어요.':'내 곡으로 커버를 공개했어요.';
 const href=n.available?(n.kind==='person_gift'?'#producer/':'#song/')+encodeURIComponent(n.target):'';
 const avatar=n.actor_profile_id&&n.actor_image_version?'/media/producer/'+encodeURIComponent(n.actor_profile_id)+'?v='+encodeURIComponent(n.actor_image_version||'default'):'/assets/default-avatar.png';
 return `<article class="activity-row${n.read_at?'':' is-unread'}" data-activity-id="${esc(n.id)}"><div class="activity-avatar"><img src="${esc(avatar)}" alt="" loading="lazy"><span>${icon(gift?'gift':'mic')}</span></div><div class="activity-copy"><div class="activity-meta"><span>${label}</span><time datetime="${new Date(n.created*1000).toISOString()}">${esc(activityDate(n.created))}</time>${n.read_at?'':'<i class="activity-dot" aria-label="읽지 않음"></i>'}</div><p>${n.actor_profile_id?`<a href="#producer/${esc(n.actor_profile_id)}">${esc(n.actor_name)}</a>`:`<strong>${esc(n.actor_name)}</strong>`}님이 ${action}</p><div class="activity-detail">${n.source_title?`<span>${esc(n.source_title)}</span>`:'<span>나에게 보낸 선물</span>'}${gift?`<b class="activity-value ${n.currency}">${number(n.amount)} ${n.currency==='gold'?'G':'S'}</b>`:''}</div>${href?`<a class="activity-open" data-activity-open="${esc(n.id)}" href="${esc(href)}">${gift?'선물 받은 곳 보기':'참여곡 듣기'} ${icon('chevron')}</a>`:'<small class="activity-unavailable">현재 공개되지 않은 음악이에요.</small>'}</div>${n.read_at?'':`<button class="activity-read small-button" data-activity-read="${esc(n.id)}" aria-label="${esc(n.actor_name)}님의 ${label} 알림 읽음 처리">읽음</button>`}</article>`;
}
function activityGroupsHTML(items){let day='';return items.map(n=>{const next=activityDate(n.created,true),header=day===next?'':`<h2 class="activity-day">${esc(next)}</h2>`;day=next;return header+activityRowHTML(n);}).join('');}
async function notificationsView(base,raw){
 if(base!=='notifications')return null;
 if(!me)return {html:heading('알림')+empty('로그인하면 알림을 볼 수 있어요','내 음악에 도착한 참여와 선물을 모아드려요.','#account','로그인'),tracks:[]};
 const q=new URLSearchParams(raw.split('?')[1]||''),filter=['gifts','participation'].includes(q.get('filter'))?q.get('filter'):'all',data=await api('/api/notifications?filter='+filter);
 return {activity:{...data,filter,account:me.id},tracks:[],html:`<section class="activity-page"><header class="activity-heading"><div><span class="eyebrow">YOUR MUSIC, THEIR MOMENTS</span><h1>알림</h1><p>내 음악에 닿은 목소리와 마음을 모아봤어요.</p></div><span class="activity-heading-icon">${icon('bell')}</span></header><div class="activity-toolbar"><nav class="tabs" aria-label="알림 종류">${[['all','전체'],['participation','커버 · 듀엣'],['gifts','받은 선물']].map(([key,name])=>`<a href="#notifications?filter=${key}" class="tab ${filter===key?'active':''}" ${filter===key?'aria-current="page"':''}>${name}</a>`).join('')}</nav><div class="activity-tools"><button type="button" class="text-link" data-activity-refresh>새로고침</button><button type="button" class="text-link" data-activity-read-page>이 목록 읽음</button></div></div><p class="activity-note">날짜·시간은 한국 시간 기준이에요. 푸시를 꺼도 알림 기록은 남아요.</p><div id="activity-list">${data.items.length?activityGroupsHTML(data.items):`<div class="activity-empty">${icon('bell')}<h2>아직 도착한 알림이 없어요</h2><p>누군가 내 곡에 참여하거나 선물을 보내면<br>이곳에서 확인할 수 있어요.</p></div>`}</div><button class="small-button activity-more" data-activity-more ${data.next?'':'hidden'}>이전 알림 더 보기</button><p class="activity-error" role="status"></p></section>`};
}
function bindNotifications(view){
 const state=view?.activity,root=$('.activity-page');if(!state||!root)return;
 paintActivityBadge(state.unread);const active=()=>me?.id===state.account&&root.isConnected;
 const mark=async ids=>{if(!ids.length)return;const result=await api('/api/notifications/read','POST',{ids});if(me?.id!==state.account)return;++activityReadRevision;activityAccount=state.account;activityCount=result.unread;paintActivityBadge(result.unread);if(!active())return;for(const n of state.items)if(ids.includes(n.id))n.read_at=Date.now()/1000;root.querySelectorAll('[data-activity-id]').forEach(row=>{if(ids.includes(row.dataset.activityId)){row.classList.remove('is-unread');row.querySelector('.activity-dot')?.remove();row.querySelector('[data-activity-read]')?.remove();}});};
 const markVisible=async()=>{if(!active()||document.hidden)return;const ids=state.items.filter(n=>!n.read_at).map(n=>n.id);for(let i=0;i<ids.length;i+=50){if(!active()||document.hidden)return;await mark(ids.slice(i,i+50));}};
 const autoRead=()=>markVisible().catch(err=>{if(active())root.querySelector('.activity-error').textContent='읽음 상태를 저장하지 못했어요. '+err.message;});
 void autoRead();
 const onVisible=()=>{if(!active()){document.removeEventListener('visibilitychange',onVisible);return;}if(!document.hidden)void autoRead();};
 if(activityReadObserver)document.removeEventListener('visibilitychange',activityReadObserver);activityReadObserver=onVisible;document.addEventListener('visibilitychange',onVisible);
 root.onclick=async e=>{
  const b=e.target.closest('[data-activity-read],[data-activity-open],[data-activity-read-page],[data-activity-more],[data-activity-refresh]');if(!b||b.disabled||!active())return;e.preventDefault();b.disabled=true;
  try{
   if(b.hasAttribute('data-activity-refresh')){await render();}
   else if(b.hasAttribute('data-activity-more')){const data=await api('/api/notifications?filter='+state.filter+'&before='+encodeURIComponent(state.next));if(!active())return;const known=new Set(state.items.map(n=>n.id));state.items.push(...data.items.filter(n=>!known.has(n.id)));state.next=data.next;$('#activity-list').innerHTML=activityGroupsHTML(state.items);b.hidden=!state.next;await markVisible();}
   else if(b.hasAttribute('data-activity-read-page')){const ids=state.items.filter(n=>!n.read_at).map(n=>n.id);for(let i=0;i<ids.length;i+=50){if(!active())return;await mark(ids.slice(i,i+50));}}
   else{const id=b.dataset.activityRead||b.dataset.activityOpen;await mark([id]);if(active()&&b.dataset.activityOpen)location.hash=b.getAttribute('href');}
  }catch(err){if(active())root.querySelector('.activity-error').textContent=err.message;}finally{if(b.isConnected)b.disabled=false;}
 };
}
function paintActivityBadge(count){document.querySelectorAll('.activity-badge').forEach(b=>{b.hidden=!count;b.textContent=count>99?'99+':String(count||0);b.setAttribute('aria-label','읽지 않은 알림 '+count+'개');});}
async function refreshActivityBadge(){
 const uid=me?.id||null;if(activityAccount!==uid){activityAccount=uid;activityCount=null;paintActivityBadge(0);}
 if(!uid||document.hidden||activityBusy)return;activityBusy=true;
 const revision=activityReadRevision;
 try{const d=await api('/api/notifications/summary','GET',undefined,{fresh:true});if(uid!==me?.id||revision!==activityReadRevision)return;if(activityCount!==null&&d.unread>activityCount&&!location.hash.startsWith('#notifications'))toast('새로운 참여·선물 알림이 도착했어요. 알림에서 확인해보세요.');activityCount=d.unread;paintActivityBadge(d.unread);}catch{}finally{activityBusy=false;}
}
setInterval(refreshActivityBadge,30000);
window.addEventListener('focus',refreshActivityBadge);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshActivityBadge();});
