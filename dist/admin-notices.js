(() => {
 const base='/api/admin/notices';
 const $=(selector,root)=>root.querySelector(selector);
 const esc=value=>AifectNoticeAudience.esc(value);
 const labels=()=>AifectNoticeAudience.types;
 const blank=()=>AifectNoticeEditor.blank();
 const emptyAudience=()=>({type:'',ids:[]});
 const states={processing:'발송 처리 중',sent:'발송 완료',failed:'실패 대상 있음',partially_withdrawn:'일부 철회',withdrawn:'전체 철회'};
 const stamp=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'});
 const date=seconds=>seconds?stamp.format(seconds*1000):'—';
 const count=value=>value==null?'—':Number(value).toLocaleString('ko-KR');
 const btn=(label,action,style='')=>'<button type="button" class="'+style+'" data-action="'+action+'">'+label+'</button>';
 const optionMap=values=>Object.entries(values).map(([value,label])=>'<option value="'+esc(value)+'">'+esc(label)+'</option>').join('');
 const previewMarkup=()=>`<div class="notice-preview-head"><h2>미리보기</h2><div class="notice-segment" role="group" aria-label="미리보기 화면">
  <button type="button" data-mode="pc" aria-pressed="true">PC웹</button><button type="button" data-mode="mobile" aria-pressed="false">모바일웹</button>
  <button type="button" data-mode="app" aria-pressed="false">앱</button></div></div>
  <div class="notice-preview-frame" data-preview-frame><div class="dm-thread-header"><div class="dm-thread-person"><div><h3>아이팩트 안내</h3></div></div></div>
   <div class="notice-preview-body" data-preview-body></div><div class="official-notice-channel-note">아이팩트 공식 안내 채널입니다.</div></div>`;

 function create(root,{request,toast}){
  const lifetime=new AbortController(),opts={signal:lifetime.signal};
  const api=(path,options={})=>request(base+path,{signal:lifetime.signal,...options});
  const write=(path,method,data)=>api(path,{method,body:JSON.stringify(data)});
  const editorUpload=file=>api('/images',{method:'POST',body:file,headers:{'content-type':'image/webp'}});
  let settings=null,draft=null,dirty=false,revision=0,saving=null,timer=null,active='compose',composeBlocked=false,
   welcomeBlocked=false,editBlocked=false,sendPending=false,plan=null,planNext=null,sendRequest=null,submitting=false,
   historyTicket=0,draftTicket=0,historyNext=null,draftNext=null,detail=null,detailTicket=0,recipientNext=null,
   editData=null,welcomeData=null,welcomeDirty=false,welcomeKey=null,editKey=null,withdrawRequest=null,
   testing=false,testSettingPending=false,deliveryTimer=null,deliveryTicket=0;
  const testRequests=new Map();
  const picked=new Map();
  const status=(selector,message)=>{$(selector,root).textContent=message;};
  const backupKey=()=>settings?'aifect:notice-draft:'+settings.operator:null;
  const sendKey=()=>settings?'aifect:notice-send:'+settings.operator:null;
  const modal=name=>$('[data-notice-dialog="'+name+'"]',root);
  const action=name=>$('[data-action="'+name+'"]',root);
  const panel=tab=>$('[data-notice-panel="'+tab+'"]',root);
  function cache(key,value){
   if(!key)return;
   try{if(value==null)sessionStorage.removeItem(key);else sessionStorage.setItem(key,JSON.stringify(value));}catch{}
  }
  function cached(key){
   if(!key)return null;
   try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}
  }

  root.innerHTML=`<div class="section-heading"><div><h1>공지 채팅 관리</h1></div></div>
   <div class="notice-tabs" role="tablist" aria-label="공지 채팅 관리">
    ${Object.entries({compose:'공지 작성',drafts:'임시 저장',history:'발송 내역',welcome:'환영 메시지'}).map(([key,label])=>
      '<button type="button" id="notice-tab-'+key+'" role="tab" data-notice-tab="'+key+'" aria-controls="notice-panel-'+key+'" aria-selected="'+(key==='compose')+'">'+label+'</button>').join('')}
   </div>
   <p class="notice-state" data-notice-start role="status">공지 채팅을 불러오는 중입니다.</p>
   <section id="notice-panel-compose" data-notice-panel="compose" role="tabpanel" aria-labelledby="notice-tab-compose" hidden>
    <div class="notice-compose">
     <article class="admin-card notice-compose-card"><div data-audience></div><div data-compose-editor></div>
      <label class="notice-check"><input type="checkbox" data-push disabled> 앱 푸시 알림도 함께 발송</label>
      <p class="notice-help" data-push-status></p>
      <details class="notice-test-setting"><summary>테스트 수신 계정 설정</summary>
       <form class="notice-inline" data-test-setting><label class="notice-field">회원 고유 ID <input name="public_id" maxlength="100" autocomplete="off"></label>
        <button type="submit">테스트 계정 저장</button></form>
       <p class="notice-state" data-test-setting-error role="alert"></p>
      </details>
      <p class="notice-help" data-test-recipient role="status"></p>
      <p class="notice-state" data-compose-status role="status"></p>
      <div class="notice-actions">
       ${btn('임시 저장','save-draft')+btn('테스트 발송','test')+btn('발송하기','confirm-send','notice-primary')}
      </div><button type="button" data-action="save-copy" hidden>새 초안으로 저장</button>
      <button type="button" data-action="retry-send" hidden>이전 발송 결과 확인</button>
      <section class="notice-result" data-delivery-result hidden aria-label="최근 발송 결과">
       <p data-delivery-status role="status"></p><div class="notice-actions">
        <button type="button" data-delivery-detail>발송 결과 보기</button>${btn('발송 내역','open-history')}</div></section>
     </article>
     <aside class="admin-card notice-preview" data-preview-for="compose">${previewMarkup()}</aside>
    </div>
    <article class="admin-card notice-recent"><div class="card-head"><h2>최근 발송 내역</h2>${btn('전체 내역','open-history')}</div>
     <div data-recent role="status"></div></article>
   </section>
   <section id="notice-panel-drafts" data-notice-panel="drafts" role="tabpanel" aria-labelledby="notice-tab-drafts" hidden>
    <article class="admin-card"><div class="card-head"><h2>임시 저장</h2>${btn('새 공지','new-draft')}</div>
     <p class="notice-state" data-draft-status role="status"></p><ul class="notice-list" data-draft-list></ul>
     <button type="button" data-action="more-drafts" hidden>더 보기</button></article>
   </section>
   <section id="notice-panel-history" data-notice-panel="history" role="tabpanel" aria-labelledby="notice-tab-history" hidden>
    <article class="admin-card"><h2>발송 내역</h2>
     <form class="notice-filters" data-history-form>
      <label>시작일 <input type="date" name="from"></label><label>종료일 <input type="date" name="to"></label>
      <label>제목 <input type="search" name="title" maxlength="200"></label>
      <label>발송 대상 <select name="audience"><option value="">전체 유형</option>${optionMap(labels())}</select></label>
      <label>상태 <select name="status"><option value="">전체 상태</option>${optionMap(states)}</select></label>
      <label>운영자 ID <input type="search" name="actor" maxlength="128"></label>
      <label>테스트 <select name="test"><option value="production">정식 발송</option><option value="test">테스트만</option><option value="all">모두 보기</option></select></label>
      <div class="notice-actions"><button type="submit" class="notice-primary">조회</button>${btn('새로고침','refresh-history')}</div>
     </form>
     <p class="notice-help">기본 조회 기간은 최근 30일입니다. 읽음률은 철회된 수신자를 제외한 유효 수신자 기준입니다.</p>
     <p data-history-status role="status"></p><div class="data-table-wrap notice-table-wrap" data-history-list></div>
     <button type="button" data-action="more-history" hidden>더 보기</button>
    </article>
   </section>
   <section id="notice-panel-welcome" data-notice-panel="welcome" role="tabpanel" aria-labelledby="notice-tab-welcome" hidden>
    <div class="notice-compose"><article class="admin-card notice-compose-card">
     <h2>환영 메시지</h2><label class="notice-check"><input type="checkbox" data-welcome-enabled> 신규 가입 시 환영 메시지 발송</label>
     <p class="notice-help">저장 이후 가입한 회원부터 적용됩니다. {닉네임}은 실제 공개 닉네임으로 표시됩니다.</p>
     <div data-welcome-editor></div><p class="notice-help" data-test-recipient role="status"></p>
     <p class="notice-help" data-welcome-delivery></p><p class="notice-state" data-welcome-status role="status"></p>
     <div class="notice-actions">${btn('테스트 발송','test-welcome')+btn('설정 저장','save-welcome','notice-primary')}</div>
    </article><aside class="admin-card notice-preview" data-preview-for="welcome">${previewMarkup()}</aside></div>
   </section>
   <dialog class="notice-dialog" data-notice-dialog="confirm" aria-label="공지 발송 확인">
    <h2>공지 발송 확인</h2><div data-confirm-info></div><p data-confirm-status role="alert"></p>
    <div class="notice-actions"><button type="button" data-action="more-targets" hidden>명단 더 보기</button>
     <button type="button" data-close="confirm">취소</button>${btn('발송','send','notice-primary')}</div>
   </dialog>
   <dialog class="notice-dialog notice-dialog-wide" data-notice-dialog="detail" aria-label="발송 상세">
    <div class="card-head"><h2>발송 상세</h2><button type="button" data-close="detail">닫기</button></div>
    <p data-detail-status role="status"></p><div data-detail-info></div><div data-detail-recipients></div>
   </dialog>
   <dialog class="notice-dialog notice-dialog-wide" data-notice-dialog="edit" aria-label="발송된 공지 수정">
    <h2>공지 수정</h2><div class="notice-compose"><div data-edit-editor></div><aside class="notice-preview" data-preview-for="edit">${previewMarkup()}</aside></div>
    <p data-edit-status role="alert"></p><div class="notice-actions"><button type="button" data-close="edit">취소</button>${btn('수정 저장','edit-save','notice-primary')}</div>
   </dialog>
   <dialog class="notice-dialog" data-notice-dialog="withdraw" aria-label="공지 철회">
    <h2>공지 철회</h2><div data-withdraw-info></div><label class="notice-field">철회 사유 <textarea data-withdraw-reason rows="3" maxlength="500"></textarea></label>
    <p data-withdraw-status role="alert"></p><div class="notice-actions"><button type="button" data-close="withdraw">취소</button>${btn('철회','withdraw','notice-danger')}</div>
   </dialog>`;

  for(const preview of root.querySelectorAll('[data-preview-for]')){
   preview.addEventListener('click',event=>{
    if(AifectOfficialNotice.openNoticeImage(event))return;
    if(event.target.closest('a')){event.preventDefault();return;}
    const mode=event.target.closest('[data-mode]')?.dataset.mode;
    if(!mode)return;
    const frame=$('[data-preview-frame]',preview);
    frame.classList.toggle('is-mobile',mode==='mobile');frame.classList.toggle('is-app',mode==='app');
    for(const b of preview.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
   },opts);
  }

  function preview(kind,content,entry={}){
   const target=$('[data-preview-body]',$('[data-preview-for="'+kind+'"]',root));
   if(!content.title&&!content.blocks.some(b=>b.type==='image'||b.type==='hr'||b.runs?.length)){
    target.innerHTML='<p class="notice-preview-empty">제목과 본문을 작성해 주세요.</p>';return;
   }
   target.innerHTML=AifectOfficialNotice.renderNoticeEntry({id:'preview-'+kind,created:Math.floor(Date.now()/1000),...entry,rich:content},
    {imageURL:AifectOfficialNotice.adminNoticeAssetURL,renderStickers:globalThis.AifectStickers?.render});
  }
  const selection=AifectNoticeAudience.create($('[data-audience]',root),{request,onChange:changeDraft});
  const composer=AifectNoticeEditor.create($('[data-compose-editor]',root),{
   onChange:content=>{preview('compose',content);changeDraft();updateButtons();},onUpload:blocked=>{composeBlocked=blocked;updateButtons();},upload:editorUpload
  });
  const welcome=AifectNoticeEditor.create($('[data-welcome-editor]',root),{
   onChange:content=>{welcomeDirty=true;welcomeKey=null;preview('welcome',content);updateButtons();},
   onUpload:blocked=>{welcomeBlocked=blocked;updateButtons();},upload:editorUpload
  });
  const editor=AifectNoticeEditor.create($('[data-edit-editor]',root),{
   onChange:content=>{editKey=null;preview('edit',content,editData||{});},
   onUpload:blocked=>{editBlocked=blocked;updateButtons();},upload:editorUpload
  });
  const welcomeEnabled=$('[data-welcome-enabled]',root),push=$('[data-push]',root),testSetting=$('[data-test-setting]',root);
  const wantsPush=()=>!!settings?.push.available&&push.checked;
  const hasContent=content=>content.title.trim()&&content.blocks.some(block=>block.type==='image'||
   block.runs?.some(run=>run.sticker||run.text.trim()));
  welcomeEnabled.onchange=()=>{welcomeKey=null;welcomeDirty=true;};
  push.onchange=changeDraft;
  function renderTestSetting(){
   const test=settings.test,member=test?.member;
   for(const label of root.querySelectorAll('[data-test-recipient]'))label.textContent=member?
    '테스트 수신 '+member.name+' · '+member.public_id:test?'테스트 수신 '+test.public_id+' · '+test.error:'';
   testSetting.elements.public_id.value=test?.public_id||'';
   testSetting.closest('details').hidden=!settings.manage;
  }
  testSetting.addEventListener('submit',async event=>{
   event.preventDefault();
   if(testSettingPending||testing)return;
   testSettingPending=true;updateButtons();status('[data-test-setting-error]','');
   try{
    settings.test=await write('/settings','PUT',{public_id:testSetting.elements.public_id.value});
    testRequests.clear();renderTestSetting();toast('테스트 수신 계정을 저장했습니다.');
   }catch(error){status('[data-test-setting-error]',error.message);toast(error.message);}
   finally{testSettingPending=false;updateButtons();}
  },opts);
  function updateButtons(){
   const manage=!!settings?.manage;
   const audience=selection.value(),ready=!composeBlocked&&hasContent(composer.read());
   for(const button of panel('compose').querySelectorAll('[data-action]')){
    const key=button.dataset.action;
    if(key==='open-history')continue;
    button.disabled=!manage||sendPending||(['save-draft','save-copy'].includes(key)&&composeBlocked)||
     (key==='confirm-send'&&(!ready||!audience.type||(audience.type==='specific'&&!audience.ids.length)))||
     (key==='test'&&(!ready||!settings?.test?.member||testing||testSettingPending));
   }
   action('test-welcome').disabled=!manage||!welcomeData||welcomeBlocked||!settings?.test?.member||testing||
    testSettingPending||!hasContent(welcome.read());
   action('save-welcome').disabled=!manage||welcomeBlocked||!welcomeData;
   action('edit-save').disabled=!manage||editBlocked||!editData;
   welcomeEnabled.disabled=!manage;
   push.disabled=!manage||!settings?.push.available;
   for(const control of testSetting.elements)control.disabled=!manage||testing||testSettingPending;
  }
  function loadComposer(data=null){
   clearTimeout(timer);revision++;dirty=false;
   draft=data?.id?{id:data.id,version:data.version}:null;
   const body=data?.content??blank();
   push.checked=data?.push===true;composer.load(body);selection.set(data?.audience??emptyAudience());preview('compose',body);updateButtons();
   action('save-copy').hidden=true;status('[data-compose-status]',data?.updated?'마지막 저장 '+date(data.updated):'');
   cache(backupKey(),null);
  }
  function backup(){
   if(!draft)draft={id:crypto.randomUUID(),version:0};
   cache(backupKey(),{...draft,content:composer.read(),audience:selection.value(),push:push.checked});
  }
  function changeDraft(){
   if(!settings?.manage)return;
   revision++;dirty=true;backup();
   status('[data-compose-status]','자동 저장을 기다리는 중입니다.');
   clearTimeout(timer);timer=setTimeout(()=>void saveDraft(),650);
   updateButtons();
  }
  async function saveDraft(force=false){
   if(!settings?.manage)return false;
   if(saving){
    await saving;
    if(saving||!dirty)return !dirty;
   }
   clearTimeout(timer);
   if(!dirty&&!force)return true;
   if(composeBlocked){status('[data-compose-status]','이미지 업로드 상태를 확인해 주세요.');return false;}
   if(!draft)draft={id:crypto.randomUUID(),version:0};
   const key=draft.id,version=draft.version,ticket=revision;
   const payload={content:composer.read(),audience:selection.value(),push:push.checked,version};
   status('[data-compose-status]','임시 저장 중입니다.');
   saving=(async()=>{
    try{
     const stored=await write('/drafts/'+key,'PUT',payload);
     if(draft?.id!==key)return false;
     draft={id:key,version:stored.version};
     dirty=ticket!==revision;
     if(dirty){backup();clearTimeout(timer);timer=setTimeout(()=>void saveDraft(),200);}
     else cache(backupKey(),null);
     action('save-copy').hidden=true;status('[data-compose-status]','마지막 저장 '+date(stored.updated));
     return !dirty;
    }catch(error){
     if(lifetime.signal.aborted)return false;
     action('save-copy').hidden=error.status!==409;
     status('[data-compose-status]',error.message+' 작성한 내용은 현재 화면에 보관되어 있습니다.');
     return false;
    }
   })();
   try{return await saving;}finally{saving=null;}
  }

  async function resumeCompose(copy){
   if(!copy)return;
   loadComposer(copy);
   dirty=true;backup();
   await saveDraft();
  }
  async function preserveDraft(){
   if(!dirty)return true;
   if(await saveDraft())return true;
   return confirm('자동 저장하지 못한 작성 내용이 있습니다. 다른 공지로 이동하시겠습니까?');
  }
  function guardExit(event){
   if(!dirty&&!composeBlocked&&!welcomeDirty&&!editData&&!sendPending)return;
   event.preventDefault();event.returnValue='';
  }
  window.addEventListener('beforeunload',guardExit,opts);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty)void saveDraft();},opts);

  async function loadRecent(){
   try{
    const {items}=await api('');
    const recent=$('[data-recent]',root);
    recent.innerHTML=items.slice(0,5).map(row=>'<button type="button" class="notice-recent-row" data-history-id="'+esc(row.id)+'"><b>'+
     esc(row.title)+'</b><span>'+esc(states[row.status])+'</span><time>'+date(row.created)+'</time></button>').join('')||'<p>최근 30일간 발송한 공지가 없습니다.</p>';
   }catch(error){if(!lifetime.signal.aborted)status('[data-recent]',error.message);}
  }
  async function loadDrafts(append=false){
   const ticket=++draftTicket;
   status('[data-draft-status]','임시 저장한 공지를 불러오는 중입니다.');
   try{
    const data=await api('/drafts'+(append&&draftNext?'?after='+encodeURIComponent(draftNext):''));
    if(ticket!==draftTicket)return;
    const list=$('[data-draft-list]',root);
    if(!append)list.replaceChildren();
    list.insertAdjacentHTML('beforeend',data.drafts.map(row=>'<li data-draft-id="'+esc(row.id)+'" data-version="'+row.version+'"><div><b>'+
     esc(row.title||'제목 없음')+'</b><time>'+date(row.updated)+'</time></div><div class="notice-actions">'+
     btn('이어쓰기','load-draft')+btn('복제','copy-draft')+btn('삭제','remove-draft','notice-danger')+'</div></li>').join(''));
    draftNext=data.next;action('more-drafts').hidden=!draftNext;
    status('[data-draft-status]',list.childElementCount?'':'임시 저장한 공지가 없습니다.');
   }catch(error){if(!lifetime.signal.aborted&&ticket===draftTicket)status('[data-draft-status]',error.message);}
  }
  function historyParams(){
   const data=new FormData($('[data-history-form]',root));
   return new URLSearchParams([...data.entries()].filter(([,value])=>value));
  }
  const tableHeaders=['제목','대상','상태','최초 / 유효','읽음 / 미읽음','읽음률','발송 일시','운영자','관리'];
  const histories=items=>items.map(row=>{
   const cells=[esc((row.test?'[테스트] ':'')+row.title),esc(labels()[row.audience]||row.audience),
    esc(states[row.status])+(row.edited_at?' <small>수정됨</small>':''),count(row.original)+' / '+count(row.active),
    count(row.read)+' / '+count(row.unread),row.read_rate==null?'—':row.read_rate+'%',date(row.created),esc(row.author_id||'—'),
    '<button type="button" data-history-id="'+esc(row.id)+'">상세</button>'];
   return '<tr>'+cells.map((cell,index)=>'<td data-label="'+tableHeaders[index]+'">'+cell+'</td>').join('')+'</tr>';
  }).join('');
  async function loadHistory(append=false){
   const ticket=++historyTicket,params=historyParams();
   if(append&&historyNext)params.set('after',historyNext);
   status('[data-history-status]','발송 내역을 불러오는 중입니다.');
   try{
    const data=await api('?'+params);
    if(ticket!==historyTicket)return;
    const region=$('[data-history-list]',root);
    if(!append)region.innerHTML='<table class="notice-table"><thead><tr>'+tableHeaders.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody></tbody></table>';
    $('tbody',region).insertAdjacentHTML('beforeend',histories(data.items));
    historyNext=data.next;action('more-history').hidden=!historyNext;
    status('[data-history-status]',$('tbody',region).children.length?'':'조건에 맞는 발송 내역이 없습니다.');
   }catch(error){if(!lifetime.signal.aborted&&ticket===historyTicket)status('[data-history-status]',error.message);}
  }

  async function loadWelcome(){
   if(welcomeData)return;
   status('[data-welcome-status]','환영 메시지를 불러오는 중입니다.');
   try{
    welcomeData=await api('/welcome');
    welcome.load(welcomeData.content);welcomeEnabled.checked=welcomeData.enabled;
    preview('welcome',welcomeData.content);
    welcomeDelivery(welcomeData);
    status('[data-welcome-status]',welcomeData.updated?'마지막 저장 '+date(welcomeData.updated):'');
   }catch(error){status('[data-welcome-status]',error.message);}finally{updateButtons();}
  }
  async function saveWelcome(){
   if(!welcomeData||welcomeBlocked)return;
   action('save-welcome').disabled=true;
   const payload={version:welcomeData.version,content:welcome.read(),enabled:welcomeEnabled.checked,
    request_id:welcomeKey??=crypto.randomUUID()};
   status('[data-welcome-status]','환영 메시지를 저장하고 있습니다.');
   try{
    welcomeData=await write('/welcome','PUT',payload);welcomeKey=null;welcomeDirty=false;welcomeDelivery(welcomeData);
    status('[data-welcome-status]','저장했습니다. '+date(welcomeData.updated));
   }catch(error){status('[data-welcome-status]',error.message);}finally{updateButtons();}
  }
  function welcomeDelivery({delivery}){
   status('[data-welcome-delivery]',delivery?'가입 시 발송 성공 '+count(delivery.sent)+'명 · 실패 '+
    count(delivery.failed)+'명'+(delivery.pending?' · 대기 '+count(delivery.pending)+'명':''):'');
  }

  function selectTab(tab){
   active=tab;
   for(const button of root.querySelectorAll('[data-notice-tab]')){
    const selected=button.dataset.noticeTab===tab;
    button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;
   }
   for(const node of root.querySelectorAll('[data-notice-panel]'))node.hidden=node.dataset.noticePanel!==tab;
   if(dirty)void saveDraft();
   if(tab==='drafts')void loadDrafts();
   if(tab==='history')void loadHistory();
   if(tab==='welcome')void loadWelcome();
  }

  function confirmRows(members){
   return members.map(m=>'<li><span>'+esc(m.name||'')+'</span><code>'+esc(m.public_id||'')+'</code></li>').join('');
  }
  function confirmScreen(nextPlan){
   plan=nextPlan;planNext=plan.next;
   const changed=plan.change;
   selection.confirmed(plan.count);
   $('[data-confirm-info]',root).innerHTML='<dl class="notice-summary"><div><dt>제목</dt><dd>'+esc(sendRequest.content.title)+
    '</dd></div><div><dt>발송 대상</dt><dd>'+esc(labels()[plan.audience])+'</dd></div><div><dt>대상 인원</dt><dd>'+count(plan.count)+
    '명</dd></div><div><dt>첨부 이미지</dt><dd>'+count(sendRequest.content.blocks.filter(block=>block.type==='image').length)+
    '장</dd></div><div><dt>앱 푸시</dt><dd>'+(sendRequest.push?'발송':'미발송')+'</dd></div></dl>'+
    (changed?'<p>대상 변경 · 추가 '+count(changed.added.count)+'명, 제외 '+count(changed.removed.count)+'명</p>':'')+
    (plan.duplicates?'<p>중복 ID '+count(plan.duplicates)+'개를 제외했습니다.</p>':'')+
    (plan.excluded?.length?'<details class="notice-id-note"><summary>제외된 회원 '+count(plan.excluded.length)+'명</summary><ul>'+
     plan.excluded.map(item=>'<li>'+esc(item.public_id||'회원 정보 없음')+' · '+esc(AifectNoticeAudience.exclusionText[item.reason])+'</li>').join('')+'</ul></details>':'')+
    '<ul class="notice-member-results" data-confirm-members>'+confirmRows(plan.members||[])+'</ul>';
   action('more-targets').hidden=!planNext;
   action('send').textContent=count(plan.count)+'명에게 발송';
   action('send').disabled=!plan.count;
   if(!modal('confirm').open)modal('confirm').showModal();
  }
  async function openConfirm(){
   if(sendPending||composeBlocked)return;
   if(!selection.value().type){status('[data-compose-status]','발송 대상을 선택해 주세요.');return;}
   sendPending=true;updateButtons();
   const inputs=[$('[data-compose-editor]',root),$('[data-audience]',root),push];
   for(const node of inputs)node.inert=true;
   try{
    const content=AifectOfficialNotice.cleanNoticeContent(composer.read(),{required:true});
    if(!(await saveDraft()))return;
    const audience=selection.value(),push=wantsPush();
    status('[data-compose-status]','발송 대상을 확인하고 있습니다.');
    const checked=await write('/targets','POST',{audience,content,push});
    sendRequest={request_id:crypto.randomUUID(),content,push,check_id:checked.id,draft};
    status('[data-confirm-status]',checked.count?'':'발송할 수 있는 회원이 없습니다.');
    status('[data-compose-status]','');
    confirmScreen(checked);
   }catch(error){status('[data-compose-status]',error.message);}
   finally{for(const node of inputs)node.inert=false;sendPending=false;updateButtons();}
  }
  async function sendTest(purpose='announcement'){
   if(testing||testSettingPending)return;
   const widget=purpose==='welcome'?welcome:composer;
   if(widget.busy()||!settings?.test?.member)return;
   testing=true;updateButtons();
   try{
    const content=AifectOfficialNotice.cleanNoticeContent(widget.read(),{required:true});
    const fingerprint=JSON.stringify(content),previous=testRequests.get(purpose);
    const request_id=previous?.fingerprint===fingerprint?previous.request_id:crypto.randomUUID();
    testRequests.set(purpose,{fingerprint,request_id});
    const result=await write('/test','POST',{request_id,content,purpose,push:false});
    if(result.recipients!==1)throw new Error('테스트 메시지의 수신 결과를 확인해 주세요.');
    testRequests.delete(purpose);toast('테스트 메시지를 1명에게 발송했습니다.');
   }catch(error){
    if(error.status&&error.status<500)testRequests.delete(purpose);
    if(error.status===422||error.status===409){
     try{settings=await api('/settings');renderTestSetting();}catch{}
    }
    toast(error.message);
   }finally{testing=false;updateButtons();}
  }
  async function moreTargets(){
   if(!planNext)return;
   const id=plan.id,after=planNext;
   try{
    const page=await api('/targets/'+id+'?after='+encodeURIComponent(after));
    if(plan?.id!==id||planNext!==after)return;
    $('[data-confirm-members]',root).insertAdjacentHTML('beforeend',confirmRows(page.members));planNext=page.next;action('more-targets').hidden=!planNext;
   }catch(error){status('[data-confirm-status]',error.message);}
  }
  function recoveredSend(){
   const last=cached(sendKey());action('retry-send').hidden=!last;
   if(last)status('[data-compose-status]','이전 발송 요청의 결과를 확인할 수 있습니다.');
  }
  async function send(retry=false){
   if(submitting)return;
   const payload=retry?cached(sendKey()):sendRequest;
   if(!payload)return;
   submitting=true;sendPending=true;updateButtons();
   action('send').disabled=true;
   cache(sendKey(),payload);
   const channel=modal('confirm').open?'[data-confirm-status]':'[data-compose-status]';
   status(channel,'발송 결과를 확인하고 있습니다.');
   try{
    const result=await write(payload.test?'/test':'','POST',payload);
    cache(sendKey(),null);action('retry-send').hidden=true;
    if(modal('confirm').open)modal('confirm').close();
    if(payload.test){toast('테스트 메시지를 1명에게 발송했습니다.');return;}
    if(!retry||draft?.id===payload.draft?.id)loadComposer();
    watchDelivery(result);
    void loadRecent();
   }catch(error){
    if(error.data?.check){
     cache(sendKey(),null);action('retry-send').hidden=true;sendRequest={...payload,check_id:error.data.check.id};
     confirmScreen(error.data.check);
     status('[data-confirm-status]',error.message);
    }else{
     if(error.status&&error.status<500){cache(sendKey(),null);action('retry-send').hidden=true;}
     else action('retry-send').hidden=false;
     status(channel,error.message);
    }
   }finally{submitting=false;sendPending=false;updateButtons();action('send').disabled=!(plan?.count);}
  }
  function deliveryMessage(result){
   if(result.status==='processing')return '발송 처리 중 · '+count(result.success||0)+'명 성공 · '+count(result.pending)+'명 대기';
   return count(result.success??result.recipients)+'명 성공 · '+count(result.failed??0)+'명 실패'+
    (result.finished_at||result.created?' · '+date(result.finished_at??result.created):'');
  }
  function watchDelivery(result){
   const current=++deliveryTicket;
   clearTimeout(deliveryTimer);
   const section=$('[data-delivery-result]',root),link=$('[data-delivery-detail]',root);
   section.hidden=false;link.dataset.historyId=result.id;
   status('[data-delivery-status]',deliveryMessage(result));
   if(result.status!=='processing')return;
   const poll=async()=>{
    try{
     const next=await api('/history/'+encodeURIComponent(result.id)+'/delivery');
     if(current!==deliveryTicket)return;
     status('[data-delivery-status]',deliveryMessage(next));
     if(next.status==='processing')deliveryTimer=setTimeout(poll,1500);
     else{
      if(detail?.id===result.id&&modal('detail').open)void openDetail(result.id);
      void (active==='history'?loadHistory():loadRecent());
     }
    }catch(error){
     if(current!==deliveryTicket||lifetime.signal.aborted)return;
     status('[data-delivery-status]','발송 상태를 조회하지 못했습니다. '+error.message);
     deliveryTimer=setTimeout(poll,4000);
    }
   };
   deliveryTimer=setTimeout(poll,1500);
  }

  function detailPath(part=''){return '/history/'+encodeURIComponent(detail.id)+part;}
  function renderDetail(data){
   detail=data;const canChange=settings?.manage&&!data.withdrawn_at&&data.status!=='processing';
   const canRetry=canChange&&data.delivery?.failed&&data.author_id===settings.operator;
   $('[data-detail-info]',root).innerHTML=`<h3>${esc((data.test?'[테스트] ':'')+data.title)}</h3>
    <dl class="notice-summary"><div><dt>대상</dt><dd>${esc(labels()[data.audience]||data.audience)}</dd></div>
     <div><dt>상태</dt><dd>${esc(states[data.status])}</dd></div><div><dt>발송 일시</dt><dd>${date(data.created)}</dd></div>
     <div><dt>운영자</dt><dd>${esc(data.author_id||'—')}</dd></div><div><dt>최초 / 유효</dt><dd>${count(data.original)} / ${count(data.active)}명</dd></div>
     <div><dt>읽음 / 미읽음</dt><dd>${count(data.read)} / ${count(data.unread)}명</dd></div><div><dt>앱 푸시</dt><dd>${data.push?'발송 요청':'미발송'}</dd></div></dl>
    ${data.delivery?'<p class="notice-help">'+esc(deliveryMessage(data.delivery))+'</p>':data.failed?'<p>자동 발송 실패 '+count(data.failed)+'명</p>':''}
    <div class="notice-detail-preview">${AifectOfficialNotice.renderNoticeEntry({id:'admin-detail',rich:data.content,created:data.created,edited_at:data.edited_at},
     {imageURL:AifectOfficialNotice.adminNoticeAssetURL,renderStickers:globalThis.AifectStickers?.render})}</div>
    <div class="notice-actions">${btn('공지 ID 복사','copy-id')}${settings?.manage?btn('복제','duplicate-notice'):''}
     ${canChange?(data.audience==='welcome'?'':btn('수정','edit'))+btn('전체 철회','withdraw-all','notice-danger'):''}
     ${canRetry?btn('실패 대상 재시도','retry-failures','notice-primary'):''}</div>
    <details class="notice-audit"><summary>변경 이력</summary>${auditHTML(data.history)}</details>`;
   $('[data-detail-recipients]',root).innerHTML=`<h3>수신 회원</h3>
    <form class="notice-filters" data-recipient-form><label>닉네임 또는 ID <input name="q" type="search" maxlength="128"></label>
     <label>수신 상태 <select name="status"><option value="all">전체</option><option value="read">읽음</option><option value="unread">미읽음</option><option value="withdrawn">철회</option></select></label>
     <div class="notice-actions"><button type="submit">조회</button>${btn('수신 명단 CSV','recipient-csv')}</div></form>
    <p data-recipient-status role="status"></p><div class="notice-detail-actions"><span data-picked></span>${canChange?btn('선택 회원 철회','withdraw-some','notice-danger'):''}</div>
    <ul class="notice-list" data-recipient-list></ul><button type="button" data-action="more-recipients" hidden>더 보기</button>`;
   picked.clear();updatePicked();
   const form=$('[data-recipient-form]',root);form.addEventListener('submit',event=>{event.preventDefault();void loadRecipients();},opts);
   $('[data-recipient-list]',root).addEventListener('change',event=>{
    const item=event.target;
    if(item.dataset.recipient!==undefined){
     if(item.checked)picked.set(item.value,Number(item.dataset.read));else picked.delete(item.value);
     updatePicked();
    }
   },opts);
  }
  function auditHTML(history){
   if(!history.length)return '<p>기존 발송에서 개별 변경 이력을 찾을 수 없습니다.</p>';
   const names={'notice:send':'발송','notice:test':'테스트 발송','notice:edit':'수정','notice:withdraw':'철회','notice:welcome':'환영 메시지 설정','notice:signup_failed':'가입 시 자동 발송 실패'};
   return '<ul>'+history.map(entry=>{
    const line='<b>'+esc(names[entry.action]||entry.action)+'</b> '+esc(entry.admin_id)+' · '+date(entry.created);
    const previous=entry.details.before,next=entry.details.after;
    const explain=previous&&next?'<details><summary>수정 전후 본문</summary>'+
     '<pre>'+esc(previous.format===1?previous.title+'\n'+AifectOfficialNotice.noticePlainText(previous):JSON.stringify(previous,null,2))+
     '</pre><pre>'+esc(next.title+'\n'+AifectOfficialNotice.noticePlainText(next))+'</pre></details>':
     entry.action==='notice:signup_failed'?'<p>'+(entry.details.reason==='write_failed'?'수신 기록을 저장하지 못했습니다.':'가입 시 적용된 환영 메시지를 확인할 수 없습니다.')+'</p>':
     entry.details.reason?'<p>'+esc(entry.details.reason)+' · '+count(entry.details.recipients)+'명</p>':'';
    return '<li>'+line+explain+'</li>';
   }).join('')+'</ul>';
  }
  async function openDetail(id){
   const current=++detailTicket;
   if(!modal('detail').open)modal('detail').showModal();
   status('[data-detail-status]','발송 상세를 불러오는 중입니다.');
   $('[data-detail-info]',root).replaceChildren();$('[data-detail-recipients]',root).replaceChildren();detail=null;
   try{
    const data=await api('/history/'+encodeURIComponent(id));
    if(current!==detailTicket||!modal('detail').open)return;
    renderDetail(data);status('[data-detail-status]','');void loadRecipients();
    if(data.delivery?.status==='processing')watchDelivery(data.delivery);
   }catch(error){if(current===detailTicket)status('[data-detail-status]',error.message);}
  }
  function updatePicked(){
   status('[data-picked]',count(picked.size)+'명 선택');
   const withdraw=action('withdraw-some');if(withdraw)withdraw.disabled=!picked.size;
  }
  function recipientParams(){return new URLSearchParams(new FormData($('[data-recipient-form]',root)));}
  async function loadRecipients(append=false,csv=false){
   if(!detail)return;
   const id=detail.id,ticket=++detailTicket,params=recipientParams();
   if(append&&recipientNext)params.set('after',recipientNext);
   if(csv)params.set('format','csv');
   status('[data-recipient-status]',csv?'수신 명단을 내보내는 중입니다.':'수신 회원을 불러오는 중입니다.');
   try{
    const data=await api(detailPath('/recipients')+'?'+params,csv?{download:true}:{});
    if(ticket!==detailTicket||detail?.id!==id)return;
    if(csv){await AifectNoticeAudience.download(data,'aifect-notice-recipients.csv');status('[data-recipient-status]','수신 명단을 내려받았습니다.');return;}
    const list=$('[data-recipient-list]',root),canSelect=settings?.manage&&!detail.withdrawn_at&&detail.status!=='processing';
    if(!append)list.replaceChildren();
    list.insertAdjacentHTML('beforeend',data.members.map(m=>'<li><label>'+
     (canSelect&&!m.withdrawn_at?'<input type="checkbox" data-recipient data-read="'+Number(!!m.read_at)+'" value="'+esc(m.id)+'"'+(picked.has(m.id)?' checked':'')+'> ':'')+
     '<b>'+esc(m.name||'')+'</b> <code>'+esc(m.public_id||'')+'</code></label><span>'+
     (m.withdrawn_at?'철회 '+date(m.withdrawn_at):m.read_at?'읽음 '+date(m.read_at):'미읽음')+'</span>'+
     (m.public_id?'<button type="button" data-copy-value="'+esc(m.public_id)+'" aria-label="회원 고유 ID 복사">복사</button>':'')+'</li>').join(''));
    recipientNext=data.next;action('more-recipients').hidden=!recipientNext;
    status('[data-recipient-status]',list.children.length?'':'조건에 맞는 수신 회원이 없습니다.');
   }catch(error){if(detail?.id===id&&ticket===detailTicket)status('[data-recipient-status]',error.message);}
  }
  async function retryFailures(button){
   if(!detail?.delivery?.failed)return;
   button.disabled=true;
   const id=detail.id;
   try{
    const result=await write(detailPath('/retry'),'POST',{revision:detail.delivery.revision});
    watchDelivery(result);
    if(detail?.id===id&&modal('detail').open)await openDetail(id);
   }catch(error){status('[data-detail-status]',error.message);}
   finally{button.disabled=false;}
  }
  function openEdit(){
   editData=detail;editKey=null;
   editor.load(detail.content);preview('edit',detail.content,detail);
   status('[data-edit-status]','');updateButtons();modal('edit').showModal();
  }
  async function saveEdit(){
   if(!editData||editBlocked)return;
   action('edit-save').disabled=true;
   try{
    const data=await write('/history/'+encodeURIComponent(editData.id),'PATCH',{
     content:editor.read(),version:editData.version,request_id:editKey??=crypto.randomUUID()
    });
    modal('edit').close();editData=null;renderDetail(data);status('[data-detail-status]','수정 사항을 저장했습니다.');
    void loadRecipients();void (active==='history'?loadHistory():loadRecent());
   }catch(error){status('[data-edit-status]',error.message);}finally{updateButtons();}
  }
  function openWithdraw(scope){
   const ids=scope==='specific'?[...picked.keys()]:[];
   if(scope==='specific'&&!ids.length)return;
   const number=scope==='all'?detail.active:ids.length,read=scope==='all'?detail.read:[...picked.values()].filter(Boolean).length;
   withdrawRequest={id:detail.id,version:detail.version,scope,ids,request_id:crypto.randomUUID()};
   $('[data-withdraw-info]',root).innerHTML='<p><strong>'+esc(detail.title)+'</strong></p><p>'+
    (scope==='all'?'전체 수신자':'선택 회원')+' '+count(number)+'명 · 읽은 회원 '+count(read)+'명</p>'+
    (ids.length?'<p class="notice-id-note">'+esc(ids.join(', '))+'</p>':'');
   $('[data-withdraw-reason]',root).value='';status('[data-withdraw-status]','');modal('withdraw').showModal();
  }
  async function confirmWithdraw(){
   if(!withdrawRequest)return;
   const reason=$('[data-withdraw-reason]',root).value.trim();
   if(!reason){status('[data-withdraw-status]','철회 사유를 입력해 주세요.');return;}
   const button=action('withdraw');button.disabled=true;
   try{
    const {id,...data}=withdrawRequest;
    const updated=await write('/history/'+encodeURIComponent(id)+'/withdraw','POST',{...data,reason});
    modal('withdraw').close();withdrawRequest=null;renderDetail(updated);status('[data-detail-status]','철회를 반영했습니다.');
    void loadRecipients();void (active==='history'?loadHistory():loadRecent());
   }catch(error){status('[data-withdraw-status]',error.message);}finally{button.disabled=false;}
  }

  async function editDraftRow(button,key){
   const row=button.closest('[data-draft-id]'),id=row.dataset.draftId;
   if(key==='remove-draft'){
    if(!confirm('이 임시 저장 공지를 삭제하시겠습니까?'))return;
    await write('/drafts/'+id,'DELETE',{version:Number(row.dataset.version)});
    if(id===draft?.id)loadComposer();
    await loadDrafts();return;
   }
   if(!(await preserveDraft()))return;
   const data=await api('/drafts/'+id);
   if(key==='copy-draft'){loadComposer({content:data.content});changeDraft();}else loadComposer(data);
   selectTab('compose');composer.focus();
  }
  const handlers={
   'new-draft':async()=>{if(await preserveDraft()){loadComposer();selectTab('compose');composer.focus();}},
   'save-draft':()=>saveDraft(true),'confirm-send':openConfirm,'test':()=>sendTest(),'test-welcome':()=>sendTest('welcome'),
   'save-copy':()=>{draft=null;changeDraft();return saveDraft();},'retry-send':()=>send(true),
   'open-history':()=>selectTab('history'),'more-drafts':()=>loadDrafts(true),
   'load-draft':button=>editDraftRow(button,'load-draft'),'copy-draft':button=>editDraftRow(button,'copy-draft'),
   'remove-draft':button=>editDraftRow(button,'remove-draft'),
   'refresh-history':()=>loadHistory(),'more-history':()=>loadHistory(true),'save-welcome':saveWelcome,
   'more-targets':moreTargets,'send':()=>send(),'more-recipients':()=>loadRecipients(true),'retry-failures':retryFailures,
   'recipient-csv':()=>loadRecipients(false,true),'copy-id':()=>navigator.clipboard.writeText(detail.id).then(()=>toast('공지 ID를 복사했습니다.')),
   'duplicate-notice':async()=>{if(await preserveDraft()){loadComposer({content:detail.content});changeDraft();modal('detail').close();selectTab('compose');composer.focus();}},
   'edit':openEdit,'edit-save':saveEdit,'withdraw-all':()=>openWithdraw('all'),'withdraw-some':()=>openWithdraw('specific'),'withdraw':confirmWithdraw
  };
  root.addEventListener('click',async event=>{
   if(AifectOfficialNotice.openNoticeImage(event))return;
   const control=event.target.closest('button');
   if(!control||control.disabled)return;
   const {noticeTab,close,historyId,copyValue}=control.dataset,key=control.dataset.action;
   try{
    if(noticeTab)selectTab(noticeTab);
    else if(close){if(close!=='confirm'||!submitting)modal(close).close();if(close==='edit')editData=null;}
    else if(historyId)await openDetail(historyId);
    else if(copyValue){await navigator.clipboard.writeText(copyValue);toast('회원 고유 ID를 복사했습니다.');}
    else if(key&&handlers[key])await handlers[key](control);
   }catch(error){if(!lifetime.signal.aborted)toast(error.message);}
  },opts);
  $('.notice-tabs',root).addEventListener('keydown',event=>{
   const buttons=[...root.querySelectorAll('[data-notice-tab]')],index=buttons.indexOf(document.activeElement);
   if(index<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();
   const to=event.key==='Home'?0:event.key==='End'?buttons.length-1:(buttons.length+index+(event.key==='ArrowRight'?1:-1))%buttons.length;
   buttons[to].focus();selectTab(buttons[to].dataset.noticeTab);
  },opts);
  modal('confirm').addEventListener('cancel',event=>{if(submitting)event.preventDefault();},opts);
  modal('edit').addEventListener('close',()=>{editData=null;},opts);
  $('[data-history-form]',root).addEventListener('submit',event=>{event.preventDefault();void loadHistory();},opts);

  let ready=null;
  function start(){
   return ready??=(async()=>{
    try{
     settings=await api('/settings');
     const backupCopy=cached(backupKey());
     $('[data-notice-start]',root).hidden=true;
     status('[data-push-status]',settings.push.reason);
     renderTestSetting();
     for(const widget of [composer,welcome,editor,selection])widget.setWritable(settings.manage);
     loadComposer();selectTab('compose');updateButtons();
     await resumeCompose(backupCopy);
     recoveredSend();void loadRecent();
    }catch(error){
     if(!lifetime.signal.aborted)status('[data-notice-start]',error.message);
     ready=null;
    }
   })();
  }
  return {start,async seed(ids){
   await start();
   if(!settings?.manage||!(await preserveDraft()))return;
   loadComposer();
   selection.set({type:'specific',ids});changeDraft();selectTab('compose');composer.focus();
  },refresh(){
   if(active==='history')return loadHistory();
   if(active==='drafts')return loadDrafts();
   if(active==='welcome'){if(!welcomeDirty){welcomeData=null;return loadWelcome();}return;}
   return loadRecent();
  },prepareLogout:async()=>!sendPending&&await preserveDraft(),dispose(clear=false){
   clearTimeout(timer);clearTimeout(deliveryTimer);
   if(clear){cache(backupKey(),null);cache(sendKey(),null);}
   lifetime.abort();root.replaceChildren();
  }};
 }

 let page=null;
 document.addEventListener('aifect-admin-notices',event=>{
  const root=document.getElementById('notice-admin-content');
  if(!root)return;
  page??=create(root,event.detail);
  if(event.detail.ids)void page.seed(event.detail.ids);else void page.start();
 });
 document.addEventListener('aifect-admin-notices-refresh',()=>{void page?.refresh();});
 document.addEventListener('aifect-admin-notices-logout',event=>{if(page)event.detail.waitUntil(page.prepareLogout());});
 document.addEventListener('aifect-admin-notices-reset',event=>{page?.dispose(!!event.detail?.clear);page=null;});
})();
