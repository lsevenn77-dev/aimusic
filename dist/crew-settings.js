const crewSettingsActions = [
 {key:'info', label:'크루 정보 수정', icon:'edit'},
 {key:'members', label:'멤버 관리', icon:'users'},
 {key:'activity', label:'가입 신청 · 운영 기록', icon:'clock'},
 {key:'leadership', label:'크루장 위임', icon:'star'}
];

function crewActionsFor(role) {
 if (!canManageCrew({role})) return [];
 return crewSettingsActions.filter(({key}) => {
  if (key==='leadership') return role==='owner';
  if (key==='members') return role==='owner'||role==='deputy';
  return true;
 });
}

function bindCrewSettingsMenu(trigger) {
 const anchor=trigger.parentElement, menu=anchor.querySelector('[role=menu]');
 const path='/api/crews/'+encodeURIComponent(trigger.dataset.editCrew);
 let request=null, detail;
 function close(restore=false) {
  request?.abort();
  request=null;
  menu.hidden=true;
  trigger.removeAttribute('aria-busy');
  trigger.setAttribute('aria-expanded','false');
  if(restore) trigger.focus({preventScroll:true});
 }
 async function open(last=false) {
  if(!me) return askLogin();
  if(!menu.hidden||request) {close(true);return;}
  const account=me.id, controller=new AbortController();
  request=controller;
  trigger.setAttribute('aria-busy','true');
  try {
   detail=await api(path,'GET',undefined,{fresh:true,signal:controller.signal});
   if(controller.signal.aborted||!trigger.isConnected||account!==me?.id) return;
   const actions=crewActionsFor(detail.membership?.role);
   if(!actions.length) {toast('크루 운영진만 설정을 열 수 있어요.');await render();return;}
   menu.innerHTML=actions.map(a=>`<button type="button" role="menuitem" tabindex="-1" data-action="${a.key}">${icon(a.icon,18)}${a.label}</button>`).join('');
   menu.hidden=false;
   trigger.setAttribute('aria-expanded','true');
   (last?menu.lastElementChild:menu.firstElementChild).focus({preventScroll:true});
  } catch(e) {
   if(!controller.signal.aborted&&trigger.isConnected) toast(e.message);
  } finally {
   if(request===controller){request=null;trigger.removeAttribute('aria-busy');}
  }
 }
 trigger.onclick=()=>open();
 anchor.onkeydown=e=>{
  const options=[...menu.children], index=options.indexOf(document.activeElement);
  if(e.key==='Escape'&&(request||!menu.hidden)) {e.preventDefault();close(true);return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)) return;
  e.preventDefault();
  if(menu.hidden){if(!request) void open(e.key==='ArrowUp'||e.key==='End');return;}
  const next=e.key==='Home'?0:e.key==='End'?options.length-1:(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
  options[next].focus();
 };
 menu.onclick=e=>{
  const item=e.target.closest('[data-action]');
  if(!item) return;
  const action=crewActionsFor(detail.membership?.role).find(a=>a.key===item.dataset.action);
  close(true);
  if(action) openCrewDialog(trigger,path,detail,action);
 };
 const dismiss=e=>{if(!anchor.contains(e.target)&&(!menu.hidden||request))close();};
 document.addEventListener('pointerdown',dismiss,true);
 document.addEventListener('focusin',dismiss);
 registerRouteCleanup(()=>{
  close();
  document.removeEventListener('pointerdown',dismiss,true);
  document.removeEventListener('focusin',dismiss);
 });
}

function openCrewDialog(trigger,path,detail,action) {
 const modal=document.createElement('dialog'),route=location.hash;
 modal.className='crew-action-dialog compact-popup';
 modal.setAttribute('role','dialog');
 modal.setAttribute('aria-modal','true');
 modal.setAttribute('aria-labelledby','crew-action-title');
 modal.innerHTML=`<header><h2 id="crew-action-title">${action.label}</h2><button type="button" class="dialog-close" aria-label="닫기" autofocus>×</button></header>
 <div class="crew-action-tools"></div><div class="crew-action-body"></div><p class="form-error" role="alert"></p><footer></footer>`;
 const body=modal.querySelector('.crew-action-body'),tools=modal.querySelector('.crew-action-tools');
 const footer=modal.querySelector('footer'),error=modal.querySelector('[role=alert]');
 const controller=new AbortController();
 const ui={modal,body,tools,footer,error,path,signal:controller.signal,refresh:false,dirty:()=>false};
 let busy=false;
 function dismiss() {
  if(!busy&&(!ui.dirty()||confirm('저장하지 않은 변경사항을 버리고 닫을까요?'))) modal.close();
 }
 ui.run=async fn=>{
  if(busy||!modal.open) return;
  busy=true;
  modal.setAttribute('aria-busy','true');
  const focus=document.activeElement;
  for(const part of [body,tools,footer]) part.inert=true;
  error.textContent='';
  try {await fn();}
  catch(e){if(e.status===403)ui.refresh=true;if(modal.open)error.textContent=e.message;}
  finally{
   busy=false;
   modal.removeAttribute('aria-busy');
   for(const part of [body,tools,footer])part.inert=false;
   if(modal.open&&modal.contains(focus))focus.focus({preventScroll:true});
  }
 };
 modal.querySelector('.dialog-close').onclick=dismiss;
 modal.oncancel=e=>{e.preventDefault();dismiss();};
 modal.onclick=e=>{
  if(e.target.closest('[data-cancel]')){dismiss();return;}
  if(e.target!==modal)return;
  const r=modal.getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss();
 };
 modal.addEventListener('close',async()=>{
  controller.abort();
  modal.remove();
  if(location.hash!==route||!trigger.isConnected) return;
  if(ui.refresh){clearCrewNavigation();await render();}
  if(location.hash===route)(document.querySelector('[data-edit-crew]')||document.querySelector('#main')).focus({preventScroll:true});
 },{once:true});
 document.body.append(modal);
 modal.showModal();
 if(action.key==='info') bindCrewInfo(ui,detail);
 if(action.key==='members') bindCrewMemberList(ui,detail);
 if(action.key==='activity') bindCrewActivity(ui);
 if(action.key==='leadership') bindCrewTransfer(ui,detail);
}

function crewInfoValues(form) {
 const values={};
 for(const key of ['name','description','interests','recruiting','join_policy','minimum_level','member_limit','notice']){
  const field=form.elements[key];
  if(field.disabled||field.readOnly) continue;
  values[key]=field.type==='checkbox'?field.checked:field.type==='number'?field.valueAsNumber:field.value;
 }
 return values;
}
function changedCrewFields(before,after) {
 return Object.fromEntries(Object.entries(after).filter(([key,value])=>before[key]!==value));
}

function bindCrewInfo(ui,detail) {
 const {body,footer,modal,error}=ui, owner=detail.membership.role==='owner';
 body.innerHTML=crewEditor(detail.crew);
 const form=body.querySelector('form'), file=form.elements.crew_image;
 if(!owner){
  form.elements.name.readOnly=true;
  for(const key of ['join_policy','minimum_level','member_limit']) form.elements[key].disabled=true;
  form.querySelector('#crew-name-help').textContent='크루 이름은 크루장만 변경할 수 있어요.';
 }
 for(const key of ['minimum_level','member_limit'])form.elements[key].required=true;
 const saved=crewInfoValues(form);
 let version=detail.crew.version,photo=null,editingPhoto=false,previewURL='';
 const changes=()=>changedCrewFields(saved,crewInfoValues(form));
 ui.dirty=()=>editingPhoto||!!photo||Object.keys(changes()).length>0;
 footer.innerHTML='<button type="button" class="small-button" data-cancel>취소</button><button type="submit" form="crew-form" class="primary-button">저장</button>';
 const save=footer.querySelector('[type=submit]'),preview=form.querySelector('.crew-image-saved');
 file.onchange=async()=>{
  const selected=file.files[0];
  if(!selected||editingPhoto)return;
  editingPhoto=true;save.disabled=file.disabled=true;
  error.textContent='';
  const host=form.querySelector('.crew-image-editor');
  try{
   const cropped=await cropPhotoEditor(selected,{host,signal:ui.signal});
   if(!modal.open)return;
   photo=cropped;
   URL.revokeObjectURL(previewURL);
   previewURL=URL.createObjectURL(photo);
   preview.innerHTML=`<img src="${previewURL}" alt="저장할 크루 사진">`;
  }catch(e){if(e.status===403)ui.refresh=true;if(modal.open)error.textContent=e.message;}
  finally{editingPhoto=false;save.disabled=file.disabled=false;file.value='';}
 };
 ui.signal.addEventListener('abort',()=>URL.revokeObjectURL(previewURL),{once:true});
 form.addEventListener('invalid',e=>{error.textContent=e.target.validationMessage;},true);
 form.onsubmit=e=>{
  e.preventDefault();
  if(editingPhoto)return;
  void ui.run(async()=>{
   const patch=changes();
   if(patch.name!==undefined&&!confirm('크루 이름을 변경하면 30일(720시간) 동안 다시 변경할 수 없어요. 변경할까요?'))return;
   if(Object.keys(patch).length){
    const updated=await api(ui.path,'PATCH',{...patch,version});
    version=updated.crew.version;
    Object.assign(saved,patch);
    ui.refresh=true;
   }
   if(photo){
    try{await uploadChatImage(ui.path+'/image',photo);}
    catch(e){throw new Error((ui.refresh?'입력한 정보는 저장됐어요. 사진 저장을 다시 시도해주세요. ':'')+e.message);}
    invalidateReads();
    photo=null;ui.refresh=true;
   }
   if(modal.open){if(ui.refresh)toast('크루 정보를 저장했어요.');modal.close();}
  });
 };
}

function bindCrewMemberList(ui,detail) {
 const {body,tools}=ui;
 tools.innerHTML='<input type="search" aria-label="멤버 닉네임 검색" placeholder="닉네임 검색">';
 const search=tools.querySelector('input');
 function show(){
  const role=detail.membership?.role;
  const members=detail.members.filter(m=>m.role!=='owner');
  const visible=members.filter(m=>(m.profile_name||m.name).toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
  body.innerHTML=visible.map(m=>{
   const name=esc(m.profile_name||m.name),value=m.role==='operator'?'manager':m.role;
   const options=Object.entries(crewRoleLabels).filter(([k])=>k!=='owner').map(([k,v])=>`<option value="${k}" ${k===value?'selected':''}>${v}</option>`).join('');
   return `<div class="crew-manage-row" data-member="${esc(m.id)}"><a href="#producer/${esc(m.id)}">${name}</a><div class="crew-row-actions">
    ${role==='owner'?`<select aria-label="${name} 직책">${options}</select>`:`<span>${esc(crewRoleLabels[value])}</span>`}
    ${role==='owner'||(role==='deputy'&&m.role!=='deputy')?`<button type="button" class="small-button" data-kick aria-label="${name} 강퇴">강퇴</button>`:''}</div></div>`;
  }).join('')||`<p>${members.length?'검색 결과가 없어요.':'관리할 멤버가 없어요.'}</p>`;
 }
 search.oninput=show;
 function update(control,kick){
  const id=control.closest('[data-member]').dataset.member,person=detail.members.find(m=>m.id===id);
  if(!person)return;
  const role=detail.membership?.role;
  if(role!=='owner'&&!(kick&&role==='deputy'&&person.role!=='deputy'))return;
  if(kick&&!confirm(`${person.profile_name||person.name}님을 강퇴할까요? 이 크루에 다시 가입할 수 없게 됩니다.`))return;
  void ui.run(async()=>{
   try {
    detail=await api(ui.path+'/members/'+encodeURIComponent(id),kick?'DELETE':'PATCH',kick?undefined:{role:control.value});
    ui.refresh=true;
    if(ui.modal.open)toast(kick?'멤버를 강퇴했어요.':'직책을 변경했어요.');
   } finally {if(ui.modal.open)show();}
  });
 }
 body.onchange=e=>{if(e.target.matches('select'))update(e.target,false);};
 body.onclick=e=>{const b=e.target.closest('[data-kick]');if(b)update(b,true);};
 show();
}

function bindCrewActivity(ui) {
 const {body,tools}=ui;
 tools.innerHTML='<div class="crew-activity-tabs" role="tablist" aria-label="크루 운영"><button id="crew-tab-applications" role="tab" aria-controls="crew-panel" data-tab="applications">가입 신청</button><button id="crew-tab-audit" role="tab" aria-controls="crew-panel" data-tab="audit">운영 기록</button></div>';
 body.id='crew-panel';body.setAttribute('role','tabpanel');
 const tabs=[...tools.querySelectorAll('[role=tab]')];
 let current='',serial=0;
 const labels={application_approved:'가입 승인',application_rejected:'가입 거절',settings_changed:'설정 변경',role_changed:'직책 변경',member_removed:'멤버 강퇴',leadership_transferred:'크루장 위임',growth_adjusted:'경험치 정정'};
 async function load(tab){
  const ticket=++serial;
  current=tab;
  for(const b of tabs){const active=b.dataset.tab===tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;if(active)body.setAttribute('aria-labelledby',b.id);}
  body.innerHTML='<p role="status">불러오는 중…</p>';body.scrollTop=0;
  ui.error.textContent='';
  try{
   const d=await api(ui.path+'/'+tab,'GET',undefined,{fresh:true,signal:ui.signal});
   if(!ui.modal.open||ticket!==serial)return;
   body.innerHTML=tab==='applications'?d.applications.map(a=>`<div class="crew-manage-row" data-applicant="${esc(a.user_id)}"><strong>${esc(a.name)}</strong><div class="crew-row-actions"><button class="small-button" data-decision="approve">승인</button><button class="small-button" data-decision="reject">거절</button></div></div>`).join('')||'<p>대기 중인 가입 신청이 없어요.</p>':
    d.events.map(e=>`<article class="crew-audit-event"><strong>${esc(labels[e.action]||e.action)}</strong><small>${esc(new Date(e.created*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</small>${e.detail?`<p>${esc(e.detail)}</p>`:''}</article>`).join('')||'<p>아직 운영 기록이 없어요.</p>';
  }catch(e){if(ui.modal.open&&ticket===serial){ui.error.textContent=e.message;body.innerHTML='<button class="small-button" data-retry>다시 불러오기</button>';}}
 }
 for(const b of tabs){
  b.onclick=()=>{if(current!==b.dataset.tab)void load(b.dataset.tab);};
  b.onkeydown=e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const next=tabs[e.key==='Home'?0:e.key==='End'?1:1-tabs.indexOf(b)];next.focus();next.click();}};
 }
 body.onclick=e=>{
  if(e.target.closest('[data-retry]')){void load(current);return;}
  const b=e.target.closest('[data-decision]');
  if(!b)return;
  const id=b.closest('[data-applicant]').dataset.applicant;
  void ui.run(async()=>{
   await api(ui.path+'/applications/'+encodeURIComponent(id),'POST',{decision:b.dataset.decision});
   ui.refresh=true;
   if(ui.modal.open){toast(b.dataset.decision==='approve'?'가입을 승인했어요.':'가입을 거절했어요.');await load('applications');}
  });
 };
 void load('applications');
}

function bindCrewTransfer(ui,detail) {
 const eligible=detail.members.filter(m=>m.role!=='owner'&&m.user_id!==me?.id);
 ui.body.innerHTML=`<label class="form-field">새 크루장<select><option value="">크루원 선택</option>${eligible.map(m=>`<option value="${esc(m.user_id)}">${esc(m.profile_name||m.name)}</option>`).join('')}</select></label><p class="field-help">${eligible.length?'위임하면 내 직책은 크루원이 돼요. 다시 크루장이 되려면 새 크루장이 위임해야 해요.':'위임할 수 있는 크루원이 없어요.'}</p>`;
 ui.footer.innerHTML='<button class="small-button" data-cancel>취소</button><button class="primary-button" data-transfer disabled>위임하기</button>';
 const select=ui.body.querySelector('select'),button=ui.footer.querySelector('[data-transfer]');
 select.disabled=!eligible.length;
 select.onchange=()=>{button.disabled=!select.value;};
 ui.dirty=()=>!!select.value;
 button.onclick=()=>{
  const person=eligible.find(m=>m.user_id===select.value);
  if(!person||detail.membership.role!=='owner')return;
  if(!confirm(`${person.profile_name||person.name}님에게 크루장 권한을 위임하고 크루원으로 전환할까요?`))return;
  void ui.run(async()=>{
   await api(ui.path+'/leadership','POST',{user_id:person.user_id});
   ui.refresh=true;
   if(ui.modal.open){toast('크루장 권한을 위임했어요.');ui.modal.close();}
  });
 };
}
