/* AIFECT Studio: scoped management UI. Existing edit/upload flows are unchanged. */
const studioLegacyHTML=studioHTML;
const studioLegacyBindForms=bindStudioForms;
const studioManage={panel:'works',type:'all',status:'all',search:'',selected:new Set(),loading:false};
const studioStatusText={published:'공개',hidden:'비공개',uploading:'업로드 중',queued:'변환 대기',processing:'변환 중',failed:'변환 실패',removed:'운영자 비공개'};
const studioStatusOptions=[['all','전체 상태'],['published','공개'],['hidden','비공개'],['processing','처리 중'],['failed','실패']];

function studioResetFilters(){Object.assign(studioManage,{panel:'works',type:'all',status:'all',search:''});studioManage.selected.clear();}
function studioFiltered(data=studioData){
 const s=studioManage;
 return (data.tracks||[]).filter(t=>
  (s.type==='all'||t.kind===s.type)&&
  (s.status==='all'||(s.status==='processing'?['uploading','queued','processing'].includes(t.status):t.status===s.status))&&
  (!s.search||(t.title||'').toLocaleLowerCase().includes(s.search.toLocaleLowerCase()))
 );
}
function studioManagedRows(){
 const tracks=studioFiltered();
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
function studioResultsHTML(){
 const list=studioManagedRows();
 return `<div class="studio-work-list">${list.length?list.map(studioRow).join(''):'<p class="studio-empty">해당하는 작품이 없습니다.</p>'}</div>
 <div class="studio-list-footer"><span>${list.length}개 표시</span></div>`;
}
function studioWorksHTML(d){
 const total=Number(d.track_total??d.tracks.length),published=d.tracks.filter(t=>t.status==='published').length,hidden=d.tracks.filter(t=>t.status==='hidden').length;
 const typeTabs=[['all','전체'],['original','제작곡'],['cover','커버곡']].map(([key,label])=>`<button type="button" role="tab" data-studio-type="${key}" aria-selected="${studioManage.type===key}" class="studio-type-tab ${studioManage.type===key?'active':''}">${label}</button>`).join('');
 return `<div class="studio-glance" aria-label="작품 현황"><div><span>전체 작품</span><strong>${number(total)}</strong></div><div><span>공개</span><strong>${number(published)}${total>d.tracks.length?'+':''}</strong></div><div><span>비공개</span><strong>${number(hidden)}${total>d.tracks.length?'+':''}</strong></div>
 ${d.upload_quota?`<div class="studio-quota-mini"><span>이번 달 제작곡</span><strong>${d.upload_quota.used} / ${d.upload_quota.limit}</strong></div>`:''}</div>
 <div class="studio-works-surface">
  <div class="studio-filters">
   <div class="studio-type-tabs" role="tablist" aria-label="작품 종류">${typeTabs}</div>
   <div class="studio-filter-tools"><input type="search" data-studio-search value="${esc(studioManage.search)}" placeholder="작품 검색" aria-label="작품 검색" maxlength="120">
    <select data-studio-status aria-label="공개 상태 필터">${studioStatusOptions.map(([key,label])=>`<option value="${key}" ${studioManage.status===key?'selected':''}>${label}</option>`).join('')}</select></div>
  </div>
  <div class="studio-bulk-bar"><label class="studio-select-all"><input type="checkbox" data-studio-select-all> <span>전체 선택</span></label><span class="studio-selected-count" aria-live="polite">0개 선택</span>
   <div class="studio-bulk-actions"><button type="button" class="studio-bulk-button" data-studio-bulk="hide" disabled>선택 비공개</button><button type="button" class="studio-bulk-button is-danger" data-studio-bulk="delete" disabled>선택 삭제</button><button type="button" class="studio-bulk-button is-danger studio-delete-all" data-studio-bulk="all-delete">전체 삭제</button></div>
  </div>
  <div class="studio-list-area">${studioResultsHTML()}</div>
 </div>`;
}
function studioManagerHTML(d){
 const legacy=studioLegacyHTML({...d,tracks:[]}),profileAt=legacy.indexOf(section('내 프로필')),artistsAt=legacy.indexOf(section('AI 가수 · 아티스트 프로필'),profileAt);
 if(profileAt<0||artistsAt<0)return legacy;
 const panes=[['works','작품 관리'],['profile','내 프로필'],['artists','AI 아티스트']];
 studioManage.selected=new Set([...studioManage.selected].filter(id=>d.tracks.some(t=>t.id===id)));
 return `<section class="studio-manager" data-studio-root>
  <header class="studio-topbar"><div><h1>스튜디오</h1><p class="studio-subtitle">내 작품과 프로필을 한곳에서 관리하세요.</p></div>
   <div class="studio-top-actions"><a class="studio-top-link" href="#studio/payouts">정산 내역</a><a class="primary-button" href="#upload">음원 업로드 ${icon('plus')}</a></div></header>
  <nav class="studio-main-tabs" role="tablist" aria-label="스튜디오 관리 메뉴">${panes.map(([id,label])=>`<button type="button" role="tab" data-studio-panel="${id}" aria-selected="${studioManage.panel===id}" class="studio-main-tab ${studioManage.panel===id?'active':''}">${label}</button>`).join('')}</nav>
  <div data-studio-pane="works" ${studioManage.panel==='works'?'':'hidden'}>${studioWorksHTML(d)}</div>
  <div data-studio-pane="profile" class="studio-editor-pane" ${studioManage.panel==='profile'?'':'hidden'}>${legacy.slice(profileAt,artistsAt)}</div>
  <div data-studio-pane="artists" class="studio-editor-pane" ${studioManage.panel==='artists'?'':'hidden'}>${legacy.slice(artistsAt)}</div>
 </section>`;
}
studioHTML=studioManagerHTML;

function studioSyncBulk(){
 const root=document.querySelector('[data-studio-root]');if(!root)return;
 root.inert=studioManage.loading;
 const visible=studioManagedRows(),checked=visible.filter(t=>studioManage.selected.has(t.id));
 const all=root.querySelector('[data-studio-select-all]');if(all){all.checked=visible.length>0&&checked.length===visible.length;all.indeterminate=checked.length>0&&checked.length<visible.length;all.disabled=!visible.length;}
 const count=root.querySelector('.studio-selected-count');if(count)count.textContent=`${checked.length}개 선택`;
 const hide=root.querySelector('[data-studio-bulk="hide"]');if(hide)hide.disabled=!checked.some(t=>t.status==='published')||studioManage.loading;
 const del=root.querySelector('[data-studio-bulk="delete"]');if(del)del.disabled=!checked.length||studioManage.loading;
 const allDel=root.querySelector('[data-studio-bulk="all-delete"]');if(allDel)allDel.disabled=studioManage.loading||!visible.length;
 root.querySelectorAll('[data-studio-select]').forEach(input=>input.closest('.studio-work-row')?.classList.toggle('is-selected',input.checked));
}
function studioPaintResults(){
 const area=document.querySelector('[data-studio-root] .studio-list-area');if(!area)return;
 area.innerHTML=studioResultsHTML();studioSyncBulk();
}
function studioPaintWorks(){
 const pane=document.querySelector('[data-studio-pane="works"]');if(!pane)return;
 pane.innerHTML=studioWorksHTML(studioData);studioSyncBulk();
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
  const verb=deleting?'삭제':'비공개로 변경';
  const label=singleId?(deleting?'작품 삭제':'작품 비공개'):all?'전체 삭제':deleting?'선택 삭제':'선택 비공개';
  dialog(`<h2>${label}</h2><p>${targets.length}개 작품을 ${verb}할까요?</p>${singleId?`<p>${esc(targets[0].title)}</p>`:''}
   <p class="studio-confirm-detail">${all?'현재 선택한 작품 종류·상태·검색 필터에 해당하는 모든 작품이 대상입니다.':'선택한 작품만 처리합니다.'}${deleting?' 삭제하면 복구할 수 없습니다. 받은 선물과 정산 내역은 유지됩니다.':' 공개 목록과 검색 결과에서 숨겨집니다.'}</p>
   ${deleting&&originals?`<p class="studio-confirm-warning">제작곡 ${originals}개가 포함돼 있습니다. 연결된 노래방·다른 회원의 커버곡도 재생할 수 없게 됩니다.</p>`:''}
   <form id="studio-bulk-confirm-form">${deleting?'<label class="form-field studio-confirm-input">확인하려면 <strong>삭제</strong>를 입력하세요.<input name="verify" autocomplete="off" placeholder="삭제" required></label>':''}
   <div class="inline-actions"><button type="button" class="small-button" data-close-dialog>취소</button><button type="submit" class="primary-button ${deleting?'danger-button':''}">${targets.length}개 ${verb}</button></div>
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
     dialog("<h2>작품 처리 결과</h2><p>성공 "+succeeded.length+"개 · 실패 "+failed.length+"개</p>"+(refreshFailed?"<p>처리 결과를 목록에 반영하지 못했습니다. 새로고침해 주세요.</p>":"")+"<ul>"+failed.map(f=>"<li>"+esc(f.t.title)+" · "+esc(f.error.message)+"</li>").join("")+"</ul><button type=\"button\" class=\"small-button\" data-close-dialog>닫기</button>");
    }else toast(succeeded.length+"개 작품을 "+(deleting?"삭제했습니다.":"비공개로 변경했습니다."));
   }finally{modal.removeEventListener("cancel",preventClose);closeButtons.forEach(b=>b.disabled=false);studioManage.loading=false;studioSyncBulk();}
  });
 }catch(err){toast(err.message);}finally{studioManage.loading=false;studioSyncBulk();}
}
function bindStudioManager(){
 const root=document.querySelector('[data-studio-root]');if(!root||root.dataset.studioBound)return;
 root.dataset.studioBound='true';studioSyncBulk();
 root.addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button)return;
  const panel=button.dataset.studioPanel,type=button.dataset.studioType,bulk=button.dataset.studioBulk;
  const {studioDelete,studioHide,studioRetry}=button.dataset;
  if(panel===undefined&&type===undefined&&bulk===undefined&&!studioDelete&&!studioHide&&!studioRetry)return;
  e.preventDefault();e.stopPropagation();
  if(studioManage.loading)return;
  if(studioDelete||studioHide){await studioBulkDialog(studioDelete?'delete':'hide',studioDelete||studioHide);return;}
  if(studioRetry){studioManage.loading=true;button.disabled=true;try{await api('/api/uploads/'+encodeURIComponent(studioRetry)+'/retry','POST');await render();}catch(err){toast(err.message);}finally{studioManage.loading=false;button.disabled=false;studioSyncBulk();}return;}
  if(panel!==undefined){
   studioManage.panel=panel;
   root.querySelectorAll('[data-studio-panel]').forEach(btn=>{const active=btn.dataset.studioPanel===panel;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));});
   root.querySelectorAll('[data-studio-pane]').forEach(pane=>pane.hidden=pane.dataset.studioPane!==panel);
  }else if(type!==undefined){
   studioManage.type=type;studioManage.selected.clear();studioPaintWorks();
  }else if(bulk!==undefined)await studioBulkDialog(bulk);
 });
 root.addEventListener('change',e=>{
  const el=e.target;
  if(el.matches('[data-studio-status]')){studioManage.status=el.value;studioManage.selected.clear();studioPaintResults();}
  else if(el.matches('[data-studio-select-all]')){
   const rows=studioFiltered();for(const t of rows){if(el.checked)studioManage.selected.add(t.id);else studioManage.selected.delete(t.id);}
   root.querySelectorAll('[data-studio-select]').forEach(input=>{input.checked=el.checked;});studioSyncBulk();
  }else if(el.matches('[data-studio-select]')){
   if(el.checked)studioManage.selected.add(el.dataset.studioSelect);else studioManage.selected.delete(el.dataset.studioSelect);
   studioSyncBulk();
  }
 });
 root.addEventListener('input',e=>{
  if(!e.target.matches('[data-studio-search]'))return;
  studioManage.search=e.target.value.trim();studioManage.selected.clear();studioPaintResults();
 });
}
bindStudioForms=function(){studioLegacyBindForms();bindStudioManager();};
