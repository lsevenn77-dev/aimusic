/* AIFECT Studio: scoped management UI. Existing edit/upload flows are unchanged. */
const studioLegacyBindForms=bindStudioForms;
const studioManage={type:'original',status:'all',search:'',searchOpen:false,selected:new Set(),loading:false};
const studioKinds={original:'제작곡',cover:'커버곡'};
const studioProcessing=new Set(['uploading','queued','processing']);
const studioStatusText={published:'공개',hidden:'비공개',uploading:'업로드 중',queued:'변환 대기',processing:'변환 중',failed:'변환 실패',removed:'운영자 비공개'};
function studioResetFilters(type='original'){
 Object.assign(studioManage,{type,status:'all',search:'',searchOpen:false});
 studioManage.selected.clear();
}
// Match the compact Korean title search used by the service, preserving literal punctuation searches.
function studioSearchKey(text){return text.normalize('NFKC').toLowerCase().replace(/[\s\u200b-\u200d\p{P}\p{S}]/gu,'');}
function studioFiltered(data=studioData){
 const {type,status,search}=studioManage,query=studioSearchKey(search);
 return (data.tracks||[]).filter(t=>
  t.kind===type&&
  (status==='all'||(status==='processing'?studioProcessing.has(t.status):t.status===status))&&
  (!search||(query?studioSearchKey(t.title||'').includes(query):(t.title||'').includes(search)))
 );
}
function studioManagedRows(data){
 const tracks=studioFiltered(data);
 const available=new Set(tracks.map(t=>t.id));
 for(const id of studioManage.selected)if(!available.has(id))studioManage.selected.delete(id);
 return tracks;
}
function studioRow(t){
 const selected=studioManage.selected.has(t.id);
 const kind=t.kind==='cover'?'커버곡':'제작곡';
 const state=Object.hasOwn(studioStatusText,t.status)?t.status:'unknown';
 const actions=`<a class="studio-action" href="#manage/${esc(t.id)}">수정</a>${t.status==='published'?`<a class="studio-action" href="#song/${esc(t.id)}">보기</a><button type="button" class="studio-action" data-studio-hide="${esc(t.id)}">비공개</button>`:t.status==='hidden'||t.status==='failed'?`<button type="button" class="studio-action" data-studio-retry="${esc(t.id)}">${t.status==='hidden'?'다시 공개':'재시도'}</button>`:''}<button type="button" class="studio-action is-danger" data-studio-delete="${esc(t.id)}" data-track-title="${esc(t.title)}" data-track-kind="${esc(t.kind)}">삭제</button>`;
 return `<article class="studio-work-row ${selected?'is-selected':''}">
  <label class="studio-work-select"><input type="checkbox" data-studio-select="${esc(t.id)}" aria-label="${esc(t.title)} 선택" ${selected?'checked':''}></label>
  <div class="studio-work-info">${cover(t,'mini-cover')}<div class="studio-work-details"><strong title="${esc(t.title)}">${esc(t.title)}</strong>
   <div class="studio-work-meta"><span>${kind}</span><span class="studio-status is-${state}">${studioStatusText[state]||'상태 확인 필요'}</span></div>
  </div></div>
  <div class="studio-work-actions">${actions}</div>
 </article>`;
}
function studioResultsHTML(data){
 const list=studioManagedRows(data);
 return `<div class="studio-work-list">${list.length?list.map(studioRow).join(''):'<p class="studio-empty">해당하는 작품이 없습니다.</p>'}</div>
 <div class="studio-list-footer"><span>${list.length}개 표시</span></div>`;
}
// One fresh /api/me response supplies both the server-resolved entitlement and
// its upload_quota. Never infer a plan from the default/cached global member.
const studioQuota={status:'loading',membership:null};
let studioQuotaCleanup;
function studioQuotaValid(value){
 const q=value?.upload_quota;
 return ['free','premium'].includes(value?.plan)&&Number.isSafeInteger(q?.used)&&q.used>=0&&Number.isSafeInteger(q?.limit)&&q.limit>0&&q.covers_unlimited===true;
}
function studioQuotaCrown(){
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 6 5 4 4-7 4 7 5-4-2 13H5L3 6Zm2 10h14"/></svg>';
}
function studioUploadLink(){
 return `<a class="small-button studio-upload" href="#upload">${icon('plus')} 음원 업로드</a>`;
}
function studioQuotaCard(value=studioQuota.membership,status=studioQuota.status){
 const ready=status==='ready'&&studioQuotaValid(value),loading=status==='loading';
 if(!ready)return `<section class="studio-quota-card studio-quota-pending" data-quota-state="${loading?'loading':'error'}" aria-label="이번 달 제작곡 한도" aria-busy="${loading}">
  <div class="studio-quota-copy" role="status"><h2>${loading?'이번 달 제작곡 정보를 확인하고 있어요.':'이용권과 제작곡 사용량을 확인하지 못했어요.'}</h2><p>회원등급과 남은 제작곡 수는 조회가 완료되면 표시돼요.</p></div>
  <div class="studio-quota-pending-actions">${loading?'':'<button type="button" class="small-button studio-quota-retry" data-studio-quota-refresh>다시 확인</button>'}${studioUploadLink()}</div></section>`;
 const q=value.upload_quota,premium=value.plan==='premium',progress=Math.min(100,q.used/q.limit*100),remaining=Math.max(0,q.limit-q.used);
 const usage=`${number(q.used)} / ${number(q.limit)}`;
 const benefits=`<ul class="studio-quota-benefits"><li>${icon('check')}<span>제작곡 월 ${premium?number(q.limit):'10'}곡까지 업로드</span></li><li>${icon('check')}<span>전체곡 AAC 256kbps 고음질 감상</span></li><li>${icon('check')}<span>커버 업로드 무제한 · 광고 없음</span></li></ul>`;
 return `<section class="studio-quota-card" data-quota-state="${value.plan}" aria-label="이번 달 제작곡 한도">
  <div class="studio-quota-upload-card">
   <div class="studio-quota-meter" style="--studio-quota-progress:${progress}%" role="progressbar" aria-label="이번 달 제작곡 업로드" aria-valuemin="0" aria-valuemax="${q.limit}" aria-valuenow="${Math.min(q.used,q.limit)}" aria-valuetext="${q.used} / ${q.limit}곡 업로드"><div class="studio-quota-summary"><span>이번 달 제작곡</span><strong>${usage}곡</strong></div></div>
   <div class="studio-quota-copy"><p class="studio-quota-eyebrow">MY STUDIO</p><h2>완성한 음악을 들려주세요.</h2><p>나만의 제작곡을 아이팩트에 공개해보세요.</p></div>
   <div class="studio-quota-upload-actions">${studioUploadLink()}${remaining?'':'<span class="studio-quota-remaining">이번 달 제작곡 한도를 모두 사용했어요.</span>'}</div>
   <p class="studio-quota-note">매월 1일 초기화(한국시간) · 커버곡 무제한</p>
  </div>
  <aside class="studio-quota-membership" aria-label="프리미엄 ${premium?'이용 현황':'안내'}">
   <div class="studio-quota-membership-copy"><div class="studio-quota-membership-head"><div class="studio-quota-membership-heading">${premium?`<span class="studio-premium-state">${studioQuotaCrown()} PREMIUM 이용 중</span>`:`<p class="studio-quota-eyebrow">${studioQuotaCrown()} PREMIUM</p><h2><span>더 많은 음악을,</span> <span>더 자유롭게.</span></h2>`}</div>
    <div class="studio-quota-art" aria-hidden="true"><div class="studio-quota-art-shape"><div class="studio-quota-disc"></div><div class="studio-quota-sleeve"><div class="studio-quota-wave"><span style="--wave-height:8px"></span><span style="--wave-height:15px"></span><span style="--wave-height:24px"></span><span style="--wave-height:15px"></span><span style="--wave-height:34px"></span><span style="--wave-height:42px"></span><span style="--wave-height:23px"></span><span style="--wave-height:32px"></span><span style="--wave-height:19px"></span><span style="--wave-height:11px"></span><span style="--wave-height:6px"></span></div></div></div></div>
   </div>${benefits}</div>
   ${premium?'':`<a class="small-button studio-upgrade" href="#membership">혜택 보기 ${icon('arrow')}</a>`}
  </aside>
 </section>`;
}
function bindStudioQuota(root){
 studioQuotaCleanup?.();
 const owner=typeof me==='undefined'?null:me?.id;if(!owner)return;
 let disposed=false,pending=null,controller,timer;
 const current=()=>!disposed&&root.isConnected&&me?.id===owner;
 function paint(){
  if(!current())return;
  const card=root.querySelector('.studio-quota-card');
  const html=studioQuotaCard();
  // Do not replace focused links on unchanged background reads.
  if(card&&html!==lastHTML){card.outerHTML=html;lastHTML=html;}
 }
 let lastHTML='';
 function schedule(){
  clearTimeout(timer);if(!current())return;
  const value=studioQuota.membership;
  const boundaries=[value?.premium_until,value?.upload_quota?.resets_at].filter(at=>Number.isFinite(at)&&at*1000>Date.now()).map(at=>at*1000-Date.now()+150);
  timer=setTimeout(()=>{if(!current())cleanup();else if(!document.hidden)void refresh();else schedule();},Math.min(30000,...boundaries));
 }
 function refresh(){
  if(!current()){cleanup();return Promise.resolve();}
  if(pending)return pending;
  controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  pending=(async()=>{
   try{
    const result=await api('/api/me','GET',undefined,{fresh:true,signal:controller.signal});
    if(!current())return;
    if(result.user?.id!==owner||!studioQuotaValid(result.membership))throw new Error('Unverified studio quota');
    studioQuota.membership=result.membership;studioQuota.status='ready';
   }catch{
    if(!current())return;
    studioQuota.membership=null;studioQuota.status='error';
   }finally{
    clearTimeout(timeout);pending=null;
    if(current()){paint();schedule();}
   }
  })();
  return pending;
 }
 const resume=()=>{if(!document.hidden)void refresh();};
 const retry=e=>{if(e.target.closest('[data-studio-quota-refresh]')){studioQuota.status='loading';paint();void refresh();}};
 const routeChanged=()=>{if(!/^#(?:studio|manage)(?:\?|$)/.test(location.hash))cleanup();};
 function cleanup(){
  if(disposed)return;disposed=true;clearTimeout(timer);controller?.abort();observer.disconnect();
  window.removeEventListener('focus',resume);window.removeEventListener('pageshow',resume);window.removeEventListener('hashchange',routeChanged);
  document.removeEventListener('visibilitychange',resume);root.removeEventListener('click',retry);
 }
 const observer=new MutationObserver(()=>{if(!current())cleanup();});
 observer.observe(root.parentNode,{childList:true});
 window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);window.addEventListener('hashchange',routeChanged);
 document.addEventListener('visibilitychange',resume);root.addEventListener('click',retry);
 studioQuotaCleanup=cleanup;void refresh();
}
function studioWorksHTML(d){
 const {type,status}=studioManage,original=type==='original',kind=studioKinds[type];
 const tracks=d.tracks.filter(t=>t.kind===type);
 const stats=[['전체 '+kind,tracks.length],['공개곡',tracks.filter(t=>t.status==='published').length]];
 if(original)stats.push(['업로드·변환 중',tracks.filter(t=>studioProcessing.has(t.status)).length,'처리 중']);
 stats.push(['비공개곡',tracks.filter(t=>t.status==='hidden').length]);
 const filters=[['all','전체'],['published','공개'],['hidden','비공개']];
 if(original)filters.push(['processing','처리 중']);
 const choices=[...filters,...['failed','removed'].filter(key=>status===key||tracks.some(t=>t.status===key)).map(key=>[key,studioStatusText[key]])];
 return `<div class="studio-glance" aria-label="${kind} 현황">${stats.map(([label,value,compact])=>`<div><span${compact?' class="studio-stat-label-full"':''}>${label}</span>${compact?`<span class="studio-stat-label-compact">${compact}</span>`:''}<strong>${number(value)}</strong></div>`).join('')}</div>
 <div class="studio-works-surface">
  <div class="studio-filters${studioManage.searchOpen?' is-search-open':''}">
   <div class="studio-filter-buttons" role="group" aria-label="작품 상태">${choices.map(([key,label])=>`<button type="button" class="studio-filter-button" data-studio-filter="${key}" aria-pressed="${key===status}">${label}</button>`).join('')}</div>
   <div class="studio-filter-tools">
    <button type="button" class="studio-search-toggle" data-studio-search-action="open" aria-label="작품 검색 열기" aria-controls="studio-search-field" aria-expanded="${studioManage.searchOpen}">${icon('search')}</button>
    <button type="button" class="studio-search-back" data-studio-search-action="close" aria-label="검색 닫기">${icon('chevron-left')}</button>
    <span class="brand-search" id="studio-search-field">${icon('search')}<input type="search" data-studio-search value="${esc(studioManage.search)}" placeholder="작품 제목 검색" aria-label="작품 검색" maxlength="120"><span class="search-sparkle" aria-hidden="true">${icon('search-star')}</span></span>
   </div>
  </div>
  <div class="studio-bulk-bar"><label class="studio-select-all"><input type="checkbox" data-studio-select-all> <span>전체 선택</span></label><span class="studio-selected-count" aria-live="polite">0개 선택</span>
   <div class="studio-bulk-actions" hidden><button type="button" class="studio-bulk-button" data-studio-bulk="hide" disabled>선택 비공개</button><button type="button" class="studio-bulk-button is-danger" data-studio-bulk="delete" disabled>선택 삭제</button><button type="button" class="studio-bulk-button is-danger studio-delete-all" data-studio-bulk="all-delete">전체 삭제</button></div>
  </div>
  <div class="studio-list-area">${studioResultsHTML(d)}</div>
 </div>`;
}
function studioManagerHTML(d){
 studioQuota.status='loading';studioQuota.membership=null;
 return `<section class="studio-manager" data-studio-root>
  <header class="studio-topbar"><div class="studio-heading"><span class="studio-heading-label" aria-hidden="true">AIFECT STUDIO</span><h1>스튜디오</h1><p class="studio-subtitle">내가 제작한 곡과 커버곡을 한곳에서 관리하세요.</p></div></header>
  ${studioQuotaCard()}
  <nav class="studio-main-tabs aifect-main-tabs" role="tablist" aria-label="작품 종류">${Object.entries(studioKinds).map(([id,label],index)=>`<button type="button" role="tab" id="studio-tab-${id}" aria-controls="studio-works" data-studio-type="${id}" data-tab-tone="${['pink','mint','purple'][index]}" aria-selected="${studioManage.type===id}" tabindex="${studioManage.type===id?'0':'-1'}" class="studio-main-tab">${label}</button>`).join('')}</nav>
  <div id="studio-works" role="tabpanel" aria-labelledby="studio-tab-${studioManage.type}" data-studio-pane="works">${studioWorksHTML(d)}</div>
 </section>`;
}
studioHTML=studioManagerHTML;

function studioSyncBulk(){
 const root=document.querySelector('[data-studio-root]');if(!root)return;
 root.inert=studioManage.loading;
 const visible=studioManagedRows(),checked=visible.filter(t=>studioManage.selected.has(t.id));
 const all=root.querySelector('[data-studio-select-all]');if(all){all.checked=visible.length>0&&checked.length===visible.length;all.indeterminate=checked.length>0&&checked.length<visible.length;all.disabled=!visible.length;}
 const count=root.querySelector('.studio-selected-count');if(count)count.textContent=`${checked.length}개 선택`;
 const actions=root.querySelector('.studio-bulk-actions');if(actions)actions.hidden=checked.length===0;
 const hide=root.querySelector('[data-studio-bulk="hide"]');if(hide)hide.disabled=!checked.some(t=>t.status==='published')||studioManage.loading;
 const del=root.querySelector('[data-studio-bulk="delete"]');if(del)del.disabled=!checked.length||studioManage.loading;
 const allDel=root.querySelector('[data-studio-bulk="all-delete"]');if(allDel)allDel.disabled=studioManage.loading||!checked.length;
 root.querySelectorAll('[data-studio-select]').forEach(input=>{input.checked=studioManage.selected.has(input.dataset.studioSelect);input.closest('.studio-work-row')?.classList.toggle('is-selected',input.checked);});
}
function studioPaintResults(){
 const area=document.querySelector('[data-studio-root] .studio-list-area');if(!area)return;
 area.innerHTML=studioResultsHTML();studioSyncBulk();
}
function studioPaintWorks(){
 const pane=document.querySelector('[data-studio-pane="works"]');if(!pane)return;
 pane.setAttribute('aria-labelledby','studio-tab-'+studioManage.type);
 pane.innerHTML=studioWorksHTML(studioData);studioSyncBulk();
}
function studioSetSearchOpen(open){
 studioManage.searchOpen=open;
 const root=document.querySelector('[data-studio-root]');if(!root)return;
 root.querySelector('.studio-filters')?.classList.toggle('is-search-open',open);
 root.querySelector('[data-studio-search-action="open"]')?.setAttribute('aria-expanded',String(open));
}
function studioCloseSearch(){
 const root=document.querySelector('[data-studio-root]');if(!root)return;
 const input=root.querySelector('[data-studio-search]');
 if(input)input.value='';
 if(studioManage.search){studioManage.search='';studioManage.selected.clear();studioPaintResults();}
 studioSetSearchOpen(false);
 root.querySelector('[data-studio-search-action="open"]')?.focus();
}
async function studioLoadComplete(data=studioData,read=api){
 const total=Number(data.track_total??data.tracks.length),seen=new Set(data.tracks.map(t=>t.id));
 const changed=()=>new Error("작품 목록이 바뀌었어요. 다시 불러온 뒤 시도해주세요.");
 if(!Number.isSafeInteger(total)||total<seen.size||seen.size!==data.tracks.length)throw changed();
 while(data.tracks.length<total){
  const page=await read("/api/studio?offset="+data.tracks.length,"GET",undefined,{fresh:true});
  if(!page.tracks?.length)throw new Error("작품 목록을 전부 불러오지 못했어요. 삭제는 진행되지 않았습니다.");
  if(Number(page.track_total)!==total||page.tracks.length+data.tracks.length>total)throw changed();
  for(const track of page.tracks){if(seen.has(track.id))throw changed();seen.add(track.id);data.tracks.push(track);}
 }
 return data;
}
async function studioBulkDialog(kind,singleId=null){
 if(studioManage.loading)return;
 studioManage.loading=true;studioSyncBulk();
 try{
  const root=document.querySelector('[data-studio-root]'),owner=me?.id;
  const snapshot=kind==='all-delete'?await studioLoadComplete(await api('/api/studio','GET',undefined,{fresh:true})):studioData;
  if(!owner||owner!==me?.id||!root?.isConnected)return;
  const filtered=studioFiltered(snapshot);
  const candidates=kind==='all-delete'?filtered:filtered.filter(t=>singleId?t.id===singleId:studioManage.selected.has(t.id));
  const targets=kind==='hide'?candidates.filter(t=>t.status==='published'):candidates;
  if(!targets.length){toast(kind==='hide'?'비공개로 변경할 공개 작품이 없습니다.':'처리할 작품이 없습니다.');return;}
  const deleting=kind!=='hide',all=kind==='all-delete';
  const originals=targets.filter(t=>t.kind==='original').length;
  const targetLabel=targets.length===1?'이 작품을':`${all?'현재 목록의':'선택한'} 작품 ${targets.length}개를`;
  dialog(`<p class="popup-prompt">${targetLabel} ${deleting?'삭제':'비공개'}하시겠습니까?</p>
   ${deleting?`<p class="studio-confirm-detail">삭제하면 복구할 수 없습니다. 받은 선물과 정산 내역은 유지됩니다.${all?' 현재 필터와 검색 결과의 모든 작품이 대상입니다.':''}</p>`:''}
   ${deleting&&originals?`<p class="studio-confirm-warning">제작곡 ${originals}개가 포함돼 있습니다. 연결된 노래방·다른 회원의 커버곡도 재생할 수 없게 됩니다.</p>`:''}
   <form id="studio-bulk-confirm-form">${deleting?'<label class="form-field studio-confirm-input">확인하려면 <strong>삭제</strong>를 입력하세요.<input name="verify" autocomplete="off" placeholder="삭제" required></label>':''}
   <div class="inline-actions"><button type="button" class="small-button" data-close-dialog>취소</button><button type="submit" class="primary-button ${deleting?'danger-button':''}">${deleting?'삭제':'비공개 처리'}</button></div>
   <p class="studio-progress" role="status" aria-live="polite"></p><p class="form-error" role="alert"></p></form>`);
  const form=document.getElementById('studio-bulk-confirm-form');
  form.onsubmit=busyForm(form,async fd=>{
   if(deleting&&fd.get('verify')!=='삭제')throw new Error('확인란에 삭제를 정확히 입력해주세요.');
   if(studioManage.loading||!root.isConnected||me?.id!==owner)return;
   studioManage.loading=true;studioSyncBulk();
   const modal=form.closest("dialog"),preventClose=e=>e.preventDefault();
   modal.addEventListener("cancel",preventClose);
   const closeButtons=[...modal.querySelectorAll("[data-close-dialog],.dialog-close")];closeButtons.forEach(b=>b.disabled=true);
   const succeeded=[],failed=[];
   try{
    for(const t of targets){
     try{
      if(me?.id!==owner||!root.isConnected)throw Error("화면 또는 로그인 계정이 변경됐습니다.");
      if(deleting)await uploadRequest("/api/uploads/"+encodeURIComponent(t.id),"DELETE");
      else await api("/api/uploads/"+encodeURIComponent(t.id)+"/unpublish","POST");
      succeeded.push(t);
     }catch(err){failed.push({t,error:err});}
     form.querySelector(".studio-progress").textContent=(succeeded.length+failed.length)+" / "+targets.length+"개 처리 중";
    }
    if(me?.id!==owner||!root.isConnected)return;
    if(deleting&&succeeded.length)clearDeletedStudioTracks(new Set(succeeded.map(t=>t.id)));
    studioManage.selected=new Set(failed.map(f=>f.t.id));modal.close();
    let refreshFailed=false;
    if(succeeded.length){try{await refreshLibrary(true);await render();}catch{refreshFailed=true;}}
    if(failed.length||refreshFailed){
     dialog("<p class=\"popup-prompt\">작품 처리 결과: 성공 "+succeeded.length+"개 · 실패 "+failed.length+"개</p>"+(refreshFailed?"<p>처리 결과를 목록에 반영하지 못했습니다. 새로고침해 주세요.</p>":"")+"<ul>"+failed.map(f=>"<li>"+esc(f.t.title)+" · "+esc(f.error.message)+"</li>").join("")+"</ul><button type=\"button\" class=\"small-button\" data-close-dialog>닫기</button>");
    }else toast(succeeded.length+"개 작품을 "+(deleting?"삭제했습니다.":"비공개로 변경했습니다."));
   }finally{modal.removeEventListener("cancel",preventClose);closeButtons.forEach(b=>b.disabled=false);studioManage.loading=false;studioSyncBulk();}
  });
 }catch(err){toast(err.message);}finally{studioManage.loading=false;studioSyncBulk();}
}
function bindStudioManager(){
 const root=document.querySelector('[data-studio-root]');if(!root||root.dataset.studioBound)return;
 root.dataset.studioBound='true';studioSyncBulk();
 function changeFilter(value){
  studioManage.status=value;studioManage.selected.clear();
  root.querySelectorAll('[data-studio-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.studioFilter===value)));
  studioPaintResults();
 }
 root.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!e.isComposing&&studioManage.searchOpen&&e.target.matches('[data-studio-search]')&&matchMedia('(max-width:767px)').matches){
   e.preventDefault();studioCloseSearch();return;
  }
  const tab=e.target.closest('[data-studio-type]');
  if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();
  const tabs=[...root.querySelectorAll('[data-studio-type]')];
  const next=tabs[e.key==='Home'?0:e.key==='End'?1:1-tabs.indexOf(tab)];
  next.focus();next.click();
 });
 root.addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button)return;
  const {studioType:type,studioFilter:filter,studioBulk:bulk,studioSearchAction:searchAction}=button.dataset;
  const {studioDelete,studioHide,studioRetry}=button.dataset;
  if(filter===undefined&&type===undefined&&bulk===undefined&&searchAction===undefined&&!studioDelete&&!studioHide&&!studioRetry)return;
  e.preventDefault();e.stopPropagation();
  if(studioManage.loading)return;
  if(searchAction==='open'){studioSetSearchOpen(true);root.querySelector('[data-studio-search]')?.focus();return;}
  if(searchAction==='close'){studioCloseSearch();return;}
  if(studioDelete||studioHide){await studioBulkDialog(studioDelete?'delete':'hide',studioDelete||studioHide);return;}
  if(studioRetry){studioManage.loading=true;button.disabled=true;try{await api('/api/uploads/'+encodeURIComponent(studioRetry)+'/retry','POST');await render();}catch(err){toast(err.message);}finally{studioManage.loading=false;button.disabled=false;studioSyncBulk();}return;}
  if(filter!==undefined){changeFilter(filter);}
  else if(type!==undefined&&type!==studioManage.type){
   studioResetFilters(type);
   root.querySelectorAll('[data-studio-type]').forEach(tab=>{
    const active=tab.dataset.studioType===type;
    tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
   });
   studioPaintWorks();
  }else if(bulk!==undefined)await studioBulkDialog(bulk);
 });
 root.addEventListener('change',e=>{
  const el=e.target;
  if(el.matches('[data-studio-select-all]')){
   const rows=studioFiltered();for(const t of rows){if(el.checked)studioManage.selected.add(t.id);else studioManage.selected.delete(t.id);}
   root.querySelectorAll('[data-studio-select]').forEach(input=>{input.checked=el.checked;});studioSyncBulk();
  }else if(el.matches('[data-studio-select]')){
   if(el.checked)studioManage.selected.add(el.dataset.studioSelect);else studioManage.selected.delete(el.dataset.studioSelect);
   studioSyncBulk();
  }
 });
 root.addEventListener('input',e=>{
  if(!e.target.matches('[data-studio-search]'))return;
  studioManage.search=e.target.value.trim();
  // Keep an active desktop query visible if the viewport narrows to mobile.
  if(studioManage.search)studioSetSearchOpen(true);
  studioManage.selected.clear();studioPaintResults();
 });
}
bindStudioForms=function(){studioLegacyBindForms();bindStudioManager();const root=document.querySelector('[data-studio-root]');if(root)bindStudioQuota(root);};
