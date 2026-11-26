(() => {
 const base='/api/admin/gift-dispatch';
 const kinds={gift:'선물',frame:'테두리',theme:'테마'};
 const periods={unit:'낱개',P7D:'7일',P1M:'1개월',P3M:'3개월',PERMANENT:'영구'};
 const sources={admin:'운영 보상',event:'이벤트 보상'};
 const statuses={processing:'처리 중',complete:'완료',partial:'일부 실패',failed:'실패',partly_recalled:'일부 회수',recalled:'회수 가능분 전체 회수'};
 const lineStates={pending:'처리 대기',excluded:'제외',failed:'지급 실패',granted:'지급 완료'};
 const issues={member_changed:'회원 상태 변경',product_changed:'상품 상태 변경',deadline_expired:'지급 기한 만료',permanent_owned:'영구 이용권 보유'};
 const unitStates={ready:'미사용',used:'사용 또는 활성화',expired:'기한 만료',recalled:'회수',unavailable:'회원 상태 변경'};
 const noticeStates={pending:'대기',sent:'발송 완료',failed:'발송 실패',skipped:'회원 상태 변경'};
 const date=new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul',hourCycle:'h23'});
 const time=seconds=>seconds?date.format(seconds*1000)+' KST':'';
 const n=value=>Number(value??0).toLocaleString('ko-KR');
 const {types,download}=AifectNoticeAudience;
 const deadlineText=d=>!d?'상품 기본값 없음':d.mode==='none'?'기한 없음':d.mode==='days'?'지급일부터 '+d.days+'일':d.date+' KST 당일까지';
 const optionList=(entries,placeholder='')=>(placeholder?'<option value="">'+placeholder+'</option>':'')+
  Object.entries(entries).map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join('');

 function mount(root,{api,esc:e,toast}){
  if(!root)return null;
  const $=selector=>root.querySelector(selector),all=selector=>[...root.querySelectorAll(selector)];
  const path=(suffix='',params={})=>{
   const query=new URLSearchParams(Object.entries(params).filter(([,value])=>value!==null&&value!==''));
   return base+suffix+(query.size?'?'+query:'');
  };
  const post=(suffix,data={})=>api(path(suffix),{method:'POST',body:JSON.stringify(data)});
  const btn=(label,action,attributes='')=>'<button type="button" data-gift-action="'+action+'" '+attributes+'>'+label+'</button>';
  const label=(name,input)=>'<label class="notice-field">'+name+input+'</label>';
  const select=(name,values,blank)=>'<select name="'+name+'">'+optionList(values,blank)+'</select>';
  const image=src=>{
   const url=AifectOfficialNotice.giftThumbnail(src);
   return url?'<img src="'+e(url)+'" alt="" loading="lazy">':'';
  };
  root.innerHTML=`<div class="section-heading"><h1>선물 발송 관리</h1></div>
  <div class="notice-tabs" role="tablist" aria-label="선물 발송 관리">
   ${btn('상품 지급','compose','role="tab" aria-controls="gift-compose" aria-selected="true"')}
   ${btn('발송 내역','history','role="tab" aria-controls="gift-history" aria-selected="false"')}
  </div>
  <div id="gift-compose" role="tabpanel">
   <div class="notice-compose gift-compose">
    <article class="admin-card notice-compose-card"><h2>지급 대상</h2><div data-gift-audience></div>
     <section class="gift-section"><h2>상품 선택</h2>
      <form data-gift-catalog-filter class="gift-filter">
       ${label('상품 이름 또는 ID','<input type="search" name="q" maxlength="80">')}
       ${label('상품 종류',select('type',kinds,'전체 상품'))}
       ${label('재화 구분',select('currency',{G:'골드',S:'실버'},'골드·실버'))}
       ${label('판매 구분',select('distribution',{shop:'상점 판매',grant:'지급 전용'},'전체 구분'))}
       <button type="submit">검색</button>
      </form>
      <div data-gift-catalog class="gift-catalog" aria-live="polite"></div>
      ${btn('상품 더 보기','more-products','hidden')}
     </section>
     <form data-gift-form class="gift-section">
      <h2>선택한 상품</h2><div data-gift-picked></div>
      ${label('지급 출처',select('origin',sources))}
      ${label('지급 사유 · 운영자 전용','<input name="reason" required maxlength="300">')}
      ${label('회원에게 보낼 안내 · 선택','<textarea name="message" maxlength="1000" rows="3"></textarea>')}
      <label class="notice-check"><input name="push" type="checkbox" disabled> 앱 푸시 알림 함께 발송 <span class="notice-state">연동 대기</span></label>
      <div class="notice-actions">${btn('초기화','reset')}${btn('내 계정 테스트','test','hidden')}
       <button class="notice-primary" type="submit" data-gift-review disabled>대상 및 지급 확인</button>
      </div>
      <p data-gift-form-status class="notice-state" role="status"></p>
     </form>
    </article>
    <aside class="admin-card notice-preview"><h2>지급 요약</h2>
     <div data-gift-totals></div><p class="notice-state">회원의 골드·실버를 차감하지 않습니다.</p>
     <h2>아이팩트 안내 미리보기</h2><div data-gift-notice inert></div>
    </aside>
   </div>
   <article class="admin-card gift-section"><div class="card-head"><h2>최근 발송 내역</h2>${btn('전체 내역','history')}</div><div data-gift-recent></div></article>
  </div>
  <div id="gift-history" role="tabpanel" hidden>
   <article class="admin-card" data-history-list><h2>발송 내역</h2>
    <form class="gift-filter gift-history-filter" data-gift-history-filter>
     ${label('상품·사유·작업 번호','<input type="search" name="q" maxlength="128">')}
     ${label('대상',select('audience',Object.fromEntries(Object.entries(types).slice(0,5)),'전체 대상'))}
     ${label('상품 유형',select('type',kinds,'전체 유형'))}
     ${label('지급 출처',select('origin',sources,'전체 출처'))}
     ${label('상태',select('status',statuses,'전체 상태'))}
     ${label('운영자 ID','<input name="admin_id" maxlength="128">')}
     ${label('시작일 · KST','<input name="from" type="date">')}
     ${label('종료일 · KST','<input name="to" type="date">')}
     <label class="notice-check"><input name="test" type="checkbox" value="1"> 격리 테스트 내역</label>
     <button type="submit">검색</button>
    </form>
    <p data-gift-filter-status class="notice-state" role="status"></p>
    <div data-gift-history-results aria-live="polite"></div>
    ${btn('이전','previous-history','hidden')} ${btn('다음','more-history','hidden')}
    <details class="gift-section"><summary>이전 개별 선물 지급 내역</summary><div data-gift-legacy></div>
     ${btn('이전','previous-legacy','hidden')} ${btn('다음','more-legacy','hidden')}
    </details>
   </article>
   <article class="admin-card" data-gift-detail hidden></article>
  </div>
  <dialog class="notice-dialog gift-dialog" data-gift-dialog aria-label="선물 지급 확인"></dialog>`;

  const form=$('[data-gift-form]'),catalogFilter=$('[data-gift-catalog-filter]'),historyFilter=$('[data-gift-history-filter]'),
   dialog=$('[data-gift-dialog]'),detailHost=$('[data-gift-detail]');
  let permissions={},tab='compose',catalogOffset=null,catalogTicket=0,historyTicket=0,detailTicket=0,openTicket=0;
  let picked=new Map(),catalog=new Map(),review=null,previous=null,fieldVersion=0,job=null,productFilter='',busy=false;
  let historyPages=[''],historyNext=null,legacyPage=1,memberNext=null,memberQuery='',memberIds=new Set(),adjustment=null;
  const status=message=>{$('[data-gift-form-status]').textContent=message;};
  const action=(key,parent=root)=>parent.querySelector('[data-gift-action="'+key+'"]');
  const audience=AifectNoticeAudience.create($('[data-gift-audience]'),{request:api,onChange:()=>changed(),notify:toast});
  const money=products=>['G','S'].map(currency=>{
   const total=products.filter(p=>p.currency===currency).reduce((sum,p)=>sum+p.value*(p.units??p.quantity),0);
   return total?n(total)+' '+(currency==='G'?'골드':'실버'):'';
  }).filter(Boolean).join(' · ');
  const dataOf=form=>Object.fromEntries(new FormData(form));
  const output=message=>{const el=dialog.querySelector('[data-gift-dialog-status]');if(el)el.textContent=message;};
  const errorNotice=error=>{if(dialog.open)output(error.message);else toast(error.message);};
  const withBusy=async operation=>{
   if(busy)return;
   busy=true;
   try{await operation();}catch(error){errorNotice(error);}finally{busy=false;}
  };
  function showTab(value){
   tab=value;
   for(const key of ['compose','history']){
    $('#gift-'+key).hidden=key!==tab;
    action(key).setAttribute('aria-selected',String(key===tab));
   }
  }
  function changed(){
   fieldVersion++;
   review=null;
   paintSummary();
  }
  function paintSummary(){
   const valid=review&&review.id;
   const members=review?.check.count??null,quantity=review?.quantity??null;
   const products=[...picked.values()].map(x=>({...x,value:x.value??x.prices[x.option]}));
   $('[data-gift-totals]').innerHTML=`<dl class="gift-metrics">
    <div><dt>확인된 대상</dt><dd>${members===null?'—':n(members)+'명'}</dd></div>
    <div><dt>지급 예정</dt><dd>${quantity===null?'—':n(quantity)+'개'}</dd></div>
    <div><dt>${valid?'총 표시 가치':'회원당 표시 가치'}</dt><dd>${e(money(valid?review.products:products)||'—')}</dd></div>
   </dl>`;
   $('[data-gift-notice]').innerHTML=valid?AifectOfficialNotice.renderNoticeEntry({id:'gift-preview',rich:review.notice,test:review.test}):
    '<p class="notice-preview-empty">대상을 확인하면 실제 지급 예정 상품과 안내가 표시됩니다.</p>';
   $('[data-gift-review]').disabled=!permissions.grant||!picked.size||!audience.value().type;
   action('test').hidden=!permissions.test_member;
   action('test').disabled=!picked.size;
  }
  function paintPicked(){
   $('[data-gift-picked]').innerHTML=picked.size?[...picked.values()].map(p=>`<div class="gift-pick" data-pick="${e(p.key)}">
    <div class="gift-product"><span class="gift-thumb">${image(p.thumbnail)}</span><div><strong>${e(p.name)}</strong>
      <small>${e(periods[p.option])} · ${n(p.value??p.prices[p.option])} ${p.currency==='G'?'골드':'실버'}</small></div>
     ${btn('제거','remove','aria-label="'+e(p.name)+' 제거"')}
    </div>
    <div class="gift-pick-fields">
     ${label('회원당 수량','<input aria-label="'+e(p.name)+' 회원당 수량" data-pick-field="quantity" type="number" min="1" max="100" value="'+e(p.quantity)+'" '+(p.option==='PERMANENT'?'readonly':'required')+'>')}
     ${label(p.type==='gift'?'사용 기한':'사용 시작 기한','<select data-pick-field="mode">'+
      optionList({default:'상품 기본값 · '+deadlineText(p.defaultDeadline),days:'지급일 기준',date:'지정 날짜',none:'기한 없음'})+'</select>')}
     <label class="notice-field" data-pick-when="days" hidden>일수 <input data-pick-field="days" type="number" min="1" max="3650" value="${e(p.days)}"></label>
     <label class="notice-field" data-pick-when="date" hidden>사용 마감일 · KST <input data-pick-field="date" type="date" value="${e(p.date)}"></label>
     ${p.type==='gift'?'':label('고정 시즌 종료일 · KST','<input data-pick-field="season_date" type="date" value="'+e(p.season_date)+'">')}
    </div>
    <div class="gift-quick-days" data-quick-days role="group" aria-label="지급일 기준 기간" hidden>
     ${[7,14,30,60,90].map(day=>btn(day+'일','preset-days','data-days="'+day+'"')).join('')}
    </div>
   </div>`).join(''):
    '<p class="notice-state">지급할 상품을 선택해 주세요.</p>';
   for(const node of all('[data-pick]')){
    const row=picked.get(node.dataset.pick);
    const select=node.querySelector('[data-pick-field=mode]');
    select.value=row.mode;
    paintDateInput(node,row.mode);
   }
  }
  function paintDateInput(node,mode){
   for(const field of node.querySelectorAll('[data-pick-when]')){
    field.hidden=field.dataset.pickWhen!==mode;
    field.querySelector('input').required=!field.hidden;
   }
   node.querySelector('[data-quick-days]').hidden=mode!=='days';
  }
  function addProduct(p,option,quantity=1,deadline=null){
   if(!p?.grant||!Object.hasOwn(p.options,option))return;
   const key=p.id+':'+option;
   if(picked.has(key)){toast('이미 선택한 상품과 옵션입니다.');return;}
   const defaultDeadline=p.deadline;
   picked.set(key,{...p,key,option,quantity,defaultDeadline,mode:deadline?.mode??'default',
    days:deadline?.days??7,date:deadline?.date??'',season_date:'',prices:p.options});
   paintPicked();changed();
  }
  async function loadCatalog(append=false){
   const ticket=++catalogTicket,host=$('[data-gift-catalog]');
   if(!append){catalog.clear();host.textContent='상품을 불러오는 중입니다.';}
   try{
    const data=await api(path('/catalog',{...dataOf(catalogFilter),offset:append?catalogOffset:0}));
    if(ticket!==catalogTicket)return;
    for(const p of data.products)catalog.set(p.id,p);
    host.innerHTML=catalog.size?[...catalog.values()].map(p=>`<div class="gift-product" data-catalog-id="${e(p.id)}">
      <span class="gift-thumb">${image(p.thumbnail)}</span>
      <div><strong>${e(p.name)}</strong><small>${kinds[p.type]} · ${p.currency==='G'?'골드':'실버'} ·
       ${p.distribution==='grant'?'지급 전용':p.sale?'판매 중':'판매 중지'}${p.grant?'':' · 지급 중지'}</small></div>
      ${Object.keys(p.options).length>1?'<select aria-label="'+e(p.name)+' 이용 옵션">'+Object.keys(p.options).map(o=>'<option value="'+e(o)+'">'+e(periods[o]??o)+'</option>').join('')+'</select>':''}
      ${btn('선택','add','aria-label="'+e(p.name)+' 선택" '+(permissions.grant&&p.grant?'':'disabled'))}
     </div>`).join(''):'<p class="notice-state">조건에 맞는 상품이 없습니다.</p>';
    catalogOffset=data.next;action('more-products').hidden=data.next===null;
   }catch(error){if(ticket===catalogTicket)host.textContent=error.message;}
  }
  function setDialog(label,body){
   dialog.setAttribute('aria-label',label);
   dialog.innerHTML='<h2>'+label+'</h2>'+body+'<p class="notice-state" data-gift-dialog-status role="status"></p>';
   if(!dialog.open)dialog.showModal();
  }
  function confirmationMemberRows(members){
   return members.map(m=>'<li><div><strong>'+e(m.name||'')+'</strong><code>'+e(m.id)+'</code></div>'+
    m.items.filter(i=>i.issue).map(i=>'<span>'+e(review.products[i.line].name)+' · '+e(issues[i.issue])+'</span>').join('')+'</li>').join('');
  }
  function showConfirmation(){
   const {check,products,quantity,test}=review;
   const changes=check.change;
   const difference=changes&&(changes.added.count||changes.removed.count)?
    '<p class="notice-state">추가 '+n(changes.added.count)+'명 · '+e(changes.added.ids.join(', '))+'<br>제외 '+n(changes.removed.count)+'명 · '+e(changes.removed.ids.join(', '))+'</p>':'';
   setDialog(test?'격리 테스트 지급 확인':'최종 지급 확인',`<p>${e(types[check.audience])} ${n(check.count)}명 · 지급 예정 ${n(quantity)}개</p>
    <p class="notice-state">총 표시 가치 ${e(money(products)||'—')} · 무료 지급 · 앱 푸시 미연동</p>
    ${difference}
    ${check.invalid.length?'<p class="notice-id-note">무효·탈퇴 ID '+n(check.invalid.length)+'개 · '+e(check.invalid.join(', '))+'</p>':''}
    ${check.duplicates?'<p class="notice-state">중복 ID '+n(check.duplicates)+'개를 제외했습니다.</p>':''}
    <ul class="notice-list">${products.map(p=>'<li><div><strong>'+e(p.name)+'</strong><small>'+
     e(periods[p.option]??p.option)+' · 회원당 '+n(p.quantity)+'개 · '+e(deadlineText(p.deadline))+
     (p.preview_until?' · '+e(time(p.preview_until)):'')+(p.season_ends_at?' · 시즌 종료 '+e(time(p.season_ends_at)):'')+
     '</small></div><span>'+n(p.recipients)+'명 · '+n(p.units)+'개'+(p.excluded?' · 보유로 제외 '+n(p.excluded)+'명':'')+'</span></li>').join('')}</ul>
    <details data-confirm-members><summary>확정 회원 ID와 제외 사유</summary><ul class="notice-list" data-confirm-members-list></ul>
     ${btn('다음 회원','confirm-members','hidden')}</details>
    <div class="notice-actions">${btn('취소','close')}${btn('지급 시작','confirm','class="notice-primary" '+(quantity?'':'disabled'))}</div>`);
   let cursor='';
   const details=dialog.querySelector('[data-confirm-members]'),next=action('confirm-members',dialog);
   const load=async()=>{
    if(!cursor&&details.querySelector('li'))return;
    const data=await api(path('/'+review.id+'/preview-members',{after:cursor}));
    details.querySelector('ul').insertAdjacentHTML('beforeend',confirmationMemberRows(data.members));
    cursor=data.next;next.hidden=!cursor;
   };
   details.addEventListener('toggle',()=>{if(details.open&&!details.querySelector('li'))void withBusy(load);});
   next.onclick=()=>withBusy(load);
  }
  async function prepare(test=false){
   if(!permissions.grant||!picked.size||!form.reportValidity())return;
   const fields=dataOf(form),target=audience.value(),signature=JSON.stringify([test,target]),version=fieldVersion;
   const products=[...picked.values()].map(p=>({product_id:p.id,option:p.option,quantity:Number(p.quantity),revision:p.revision,
    deadline:p.mode==='default'?null:p.mode==='days'?{mode:p.mode,days:Number(p.days)}:
     p.mode==='date'?{mode:p.mode,date:p.date}:{mode:p.mode},season_date:p.season_date||null}));
   status('대상과 상품 조건을 확인하는 중입니다.');
   try{
    const body={...fields,products,audience:target,test,push:false};
    const prior=previous?.signature===signature&&previous.check.expires>Date.now()/1000?previous.check.id:null;
    if(prior)body.previous_check=prior;
    const prepared=await post('/preview',body);
    if(version!==fieldVersion){status('변경한 내용을 다시 확인해 주세요.');return;}
    review=prepared;previous={signature,check:review.check};paintSummary();
    if(review.id){status('');showConfirmation();}
    else status('유효한 회원이 없습니다. 무효·탈퇴 ID '+review.check.invalid.join(', '));
   }catch(error){status(error.message);}
  }
  function reset(){
   form.reset();audience.set();picked.clear();previous=null;
   paintPicked();changed();status('');
  }
  const listRows=jobs=>jobs.length?'<ul class="notice-list gift-history-rows">'+jobs.map(run=>`<li>
    <div><strong>${e(run.products.map(p=>p.name).join(', '))}</strong>
     <small>${e(time(run.confirmed_at))} · ${e(types[run.audience]??run.audience)} ${n(run.target_count)}명 · ${e(run.admin_id)}</small>
     <span>${e(run.reason)}</span></div>
    <div><strong>${e(statuses[run.status])}</strong><small>지급 ${n(run.granted_members)}명 · ${n(run.granted_units)}개 · 실패 ${n(run.failed)}건</small></div>
    ${btn('상세','detail','data-job="'+e(run.id)+'"')}
   </li>`).join('')+'</ul>':'<p class="notice-state">발송 내역이 없습니다.</p>';
  async function loadRecent(){
   const host=$('[data-gift-recent]');
   try{host.innerHTML=listRows((await api(base)).jobs.slice(0,3));}catch(error){host.textContent=error.message;}
  }
  async function loadHistory(){
   const ticket=++historyTicket,host=$('[data-gift-history-results]');
   host.textContent='내역을 불러오는 중입니다.';
   $('[data-gift-filter-status]').textContent=productFilter?'상품 ID '+productFilter:'';
   try{
    const data=await api(path('',{...dataOf(historyFilter),after:historyPages.at(-1),product_id:productFilter}));
    if(ticket!==historyTicket)return;
    historyNext=data.next;host.innerHTML=listRows(data.jobs);
    action('more-history').hidden=!historyNext;action('previous-history').hidden=historyPages.length===1;
   }catch(error){if(ticket===historyTicket)host.textContent=error.message;}
  }
  const details=(name,value)=>'<div><dt>'+name+'</dt><dd>'+e(value)+'</dd></div>';
  function paintDetail(){
   const run=job;
   detailHost.innerHTML=`<div class="card-head"><h2>발송 상세</h2>${btn('내역으로','back')}</div>
    <p><strong>${e(statuses[run.status])}</strong> · ${e(time(run.confirmed_at))} · ${e(run.id)}</p>
    <dl class="gift-metrics">${[
     ['대상',n(run.target_count)+'명'],['지급',n(run.granted_members)+'명 · '+n(run.granted_units)+'개'],
     ['제외·실패',n(run.excluded)+'건 · '+n(run.failed)+'건'],['사용·활성화',n(run.used)+'개'],
     ['미사용 유효',n(run.ready)+'개'],['만료',n(run.expired)+'개'],['회수',n(run.recalled)+'개'],
     ['안내 완료·실패',n(run.notices_sent)+'명 · '+n(run.notices_failed)+'명'],
     ['안내 대기',n(run.notices_pending)+'명'],['앱 푸시','미연동']
    ].map(([key,v])=>details(key,v)).join('')}</dl>
    <dl class="gift-meta">${details('지급 출처',sources[run.origin])}${details('운영자',run.admin_id)}${details('지급 사유',run.reason)}</dl>
    <ul class="notice-list">${run.products.map(p=>'<li><div><strong>'+e(p.name)+'</strong><small>'+
     e(periods[p.option]??p.option)+' · 회원당 '+n(p.quantity)+'개 · '+e(deadlineText(p.deadline))+
     (p.season_ends_at?' · 시즌 종료 '+e(time(p.season_ends_at)):'')+'</small></div></li>').join('')}</ul>
    <div class="notice-actions">
     ${btn('복제','duplicate')}${btn('지급 처리 계속','continue',permissions.grant&&(run.pending||run.notices_pending)?'':'hidden')}
     ${btn('실패 지급 재시도','retry',permissions.grant&&run.failed?'':'hidden')}
     ${btn('실패 안내 재시도','notify',permissions.grant&&run.notices_failed?'':'hidden')}
     ${btn('기한 연장','extend',permissions.adjust&&run.ready?'':'hidden')}
     ${btn('회수','recall',permissions.adjust&&run.ready?'class="notice-danger"':'hidden')}
    </div>
    <section class="gift-section"><h2>대상별 지급 내역</h2><form data-gift-member-filter class="notice-inline">
     <input name="q" type="search" aria-label="대상 ID 또는 닉네임" placeholder="대상 ID 또는 닉네임" maxlength="128" value="${e(memberQuery)}">
     <button type="submit">검색</button></form>
     <div class="notice-actions"><output data-detail-selection>${n(memberIds.size)}명 선택</output>${btn('선택한 ID 복사','copy-members')}${btn('대상 CSV 내보내기','csv')}</div>
     <ul class="notice-list gift-member-details" data-gift-members></ul>${btn('다음 회원','members','hidden')}
    </section>
    <section class="gift-section"><h2>회수·연장 기록</h2>
     ${run.adjustments.length?'<ul class="notice-list">'+run.adjustments.map(a=>'<li><div><strong>'+
      (a.kind==='recall'?'회수':'기한 연장')+' '+n(a.quantity)+'개</strong><small>'+e(a.admin_id)+' · '+e(time(a.confirmed_at))+
      '</small><span>'+e(a.reason)+'</span>'+(a.deadline?'<small>'+e(time(a.earliest_before))+(a.latest_before!==a.earliest_before?' ~ '+e(time(a.latest_before)):'')+
      ' → '+e(time(a.deadline))+'</small>':'')+'</div></li>').join('')+'</ul>':'<p class="notice-state">회수·연장 기록이 없습니다.</p>'}
    </section>`;
  }
  async function loadMembers(append=false){
   const key=job.id,host=$('[data-gift-members]');
   if(!append)host.textContent='대상 내역을 불러오는 중입니다.';
   const data=await api(path('/'+key+'/members',{q:memberQuery,after:append?memberNext:''}));
   if(job?.id!==key||!host.isConnected)return;
   const html=data.members.map(m=>`<li><div>
    <label><input type="checkbox" data-gift-member value="${e(m.id)}" ${memberIds.has(m.id)?'checked':''}> <strong>${e(m.name||'회원')}</strong> <code>${e(m.id)}</code></label>
    <small>선물 안내 · ${e(noticeStates[m.notice_state])}</small>
    <ul class="gift-member-items">${m.items.map(i=>{
     const p=job.products[i.line];
     return '<li>'+e(p.name)+' · '+e(periods[p.option]??p.option)+' · '+n(p.quantity)+'개 · '+e(lineStates[i.state])+
      (i.issue?' ('+e(issues[i.issue])+')':'')+(i.granted_at?'<small>발급 '+e(time(i.granted_at))+(i.expires_at?' · 최초 기한 '+e(time(i.expires_at)):'')+'</small>':'')+
      i.rights.map(r=>'<small>'+e(unitStates[r.state])+' '+n(r.quantity)+'개'+(r.expires_at?' · 기한 '+e(time(r.expires_at)):'')+
       (r.active_until?' · 이용 종료 '+e(time(r.active_until)):'')+'</small>').join('')+'</li>';
    }).join('')}</ul></div>${btn('ID 복사','copy-one','data-member-id="'+e(m.id)+'"')}</li>`).join('');
   if(!append)host.replaceChildren();
   host.insertAdjacentHTML('beforeend',html||'<li>조건에 맞는 회원이 없습니다.</li>');
   memberNext=data.next;action('members',detailHost).hidden=!memberNext;
  }
  async function openDetail(key,{keep=false}={}){
   showTab('history');
   const ticket=++detailTicket;
   if(!keep){memberQuery='';memberIds.clear();}
   $('[data-history-list]').hidden=true;detailHost.hidden=false;
   detailHost.textContent='발송 상세를 불러오는 중입니다.';
   const data=await api(path('/'+key));
   if(ticket!==detailTicket)return;
   job=data;paintDetail();await loadMembers();
  }
  async function showHistory({clear=false}={}){
   detailTicket++;job=null;detailHost.hidden=true;$('[data-history-list]').hidden=false;
   if(clear){productFilter='';historyPages=[''];}
   showTab('history');await loadHistory();
  }
  async function loadLegacy(){
   const host=$('[data-gift-legacy]');
   host.textContent='이전 지급 내역을 불러오는 중입니다.';
   try{
    const result=await api('/api/admin/gift-inventory/grants?'+new URLSearchParams({gift_type:productFilter,page:legacyPage}));
    host.innerHTML=result.grants.length?'<ul class="notice-list">'+result.grants.map(g=>'<li><div><strong>'+
     e(g.gift_type)+' · '+n(g.quantity)+'개</strong><small>'+e(time(g.created))+' · '+e(g.public_id||'')+'</small><span>'+
     e(g.reason||'')+'</span></div></li>').join('')+'</ul>':'<p class="notice-state">이전 지급 내역이 없습니다.</p>';
    action('more-legacy').hidden=!result.more;action('previous-legacy').hidden=legacyPage===1;
   }catch(error){host.textContent=error.message;}
  }
  async function progress(key){
   let state;
   do{
    state=await post('/'+key+'/process');
    status('지급 대기 '+n(state.pending)+'건 · 안내 대기 '+n(state.notices_pending)+'명');
    if(dialog.open)output('지급 대기 '+n(state.pending)+'건 · 안내 대기 '+n(state.notices_pending)+'명');
   }while(state.pending||state.notices_pending);
   if(dialog.open)dialog.close();
   await openDetail(key,{keep:true});
   void loadRecent();
  }
  async function confirm(){
   const key=review.id,button=action('confirm',dialog);
   button.disabled=true;
   action('close',dialog).disabled=true;
   let started=false;
   try{
    await post('/'+key+'/confirm');started=true;
    await progress(key);reset();
   }catch(error){
    if(started){
     if(dialog.open)dialog.close();
     await openDetail(key,{keep:true});reset();toast('발송 상세에서 지급을 계속할 수 있습니다. '+error.message);
    }else if(error.status===409){
     dialog.close();status(error.message);
    }else{
     output(error.message+' 같은 작업 번호로 다시 확인할 수 있습니다.');
    }
   }finally{
    button.disabled=false;
    const close=action('close',dialog);if(close)close.disabled=false;
   }
  }
  function startAdjustment(kind){
   adjustment=null;
   const heading=kind==='recall'?'미사용 상품 회수':'사용 시작 기한 연장';
   setDialog(heading,`<form data-gift-adjust-form data-kind="${kind}">
    ${label('대상 범위','<select required name="scope"><option value="">선택해 주세요</option>'+
     (memberIds.size?'<option value="selected">선택한 '+n(memberIds.size)+'명</option>':'')+
     '<option value="all">이 발송의 전체 대상</option></select>')}
    ${kind==='extend'?label('새 종료일 · KST','<input name="date" type="date" required>'):''}
    ${label('사유','<input name="reason" maxlength="300" required>')}
    <div class="notice-actions">${btn('취소','close')}<button type="submit">적용 대상 확인</button></div>
   </form>`);
  }
  async function previewAdjustment(form){
   const fields=dataOf(form),kind=form.dataset.kind,ids=fields.scope==='all'?null:[...memberIds];
   adjustment=await post('/'+job.id+'/adjustments',{...fields,kind,ids});
   const a=adjustment;
   setDialog(kind==='recall'?'회수 확인':'기한 연장 확인',`<p>${a.scope?n(a.scope.length)+'명 선택':'이 발송의 전체 대상'} · ${n(a.quantity)}개 적용 예정</p>
    <p class="notice-state">사용·활성화 ${n(a.used)}개 · 만료 ${n(a.expired)}개 · 이미 회수 ${n(a.recalled)}개${a.unavailable?' · 회원 상태 변경 '+n(a.unavailable)+'개':''}${kind==='extend'?' · 연장 조건 제외 '+n(a.ready-a.quantity)+'개':''}</p>
    ${a.deadline?'<p>기존 '+e(time(a.earliest_before)||'—')+(a.latest_before!==a.earliest_before?' ~ '+e(time(a.latest_before)):'')+' → '+e(time(a.deadline))+'</p>':''}
    <div class="notice-actions">${btn('취소','close')}${btn(kind==='recall'?'회수 실행':'연장 실행','confirm-adjust','class="'+(kind==='recall'?'notice-danger':'notice-primary')+'" '+(a.quantity?'':'disabled'))}</div>`);
  }
  async function doAdjustment(){
   const key=job.id;
   const result=await post('/'+key+'/adjustments/'+adjustment.id);
   dialog.close();toast(n(result.quantity)+'개에 적용했습니다.');await openDetail(key,{keep:true});
  }
  async function duplicate(){
   const run=job;reset();showTab('compose');
   form.elements.origin.value=run.origin;form.elements.reason.value=run.reason;form.elements.message.value=run.message;
   for(const p of run.products){
    const {products:[current]}=await api(path('/catalog',{id:p.product_id}));
    if(current?.grant&&Object.hasOwn(current.options,p.option)){
     addProduct(current,p.option,p.quantity,p.deadline);
     if(p.season_ends_at)picked.get(current.id+':'+p.option).season_date=new Date((p.season_ends_at-86400+9*3600)*1000).toISOString().slice(0,10);
    }
   }
   paintPicked();
   status(picked.size===run.products.length?'발송 대상을 선택해 주세요.':'지급 가능한 상품만 불러왔습니다. 상품과 발송 대상을 확인해 주세요.');
  }
  async function runAction(a,b){
   if(a==='compose'){showTab('compose');return;}
   if(a==='history'||a==='back')return showHistory({clear:a==='history'});
   if(a==='more-products')return loadCatalog(true);
   if(a==='add'){
    const row=b.closest('[data-catalog-id]'),p=catalog.get(row.dataset.catalogId);
    return addProduct(p,row.querySelector('select')?.value??Object.keys(p.options)[0]);
   }
   if(a==='remove'){picked.delete(b.closest('[data-pick]').dataset.pick);paintPicked();changed();return;}
   if(a==='preset-days'){
    const input=b.closest('[data-pick]').querySelector('[data-pick-field=days]');
    input.value=b.dataset.days;input.dispatchEvent(new Event('input',{bubbles:true}));return;
   }
   if(a==='reset'){reset();return;}
   if(a==='test')return prepare(true);
   if(a==='close'){dialog.close();return;}
   if(a==='confirm')return confirm();
   if(a==='detail')return openDetail(b.dataset.job);
   if(a==='previous-history'||a==='more-history'){
    if(a==='previous-history')historyPages.pop();else historyPages.push(historyNext);
    return loadHistory();
   }
   if(a==='previous-legacy'||a==='more-legacy'){legacyPage+=a==='previous-legacy'?-1:1;return loadLegacy();}
   if(a==='duplicate')return duplicate();
   if(a==='continue')return progress(job.id);
   if(a==='retry'){
    const key=job.id,ids=memberIds.size?[...memberIds]:null;
    if(!confirmRetry(ids))return;
    await post('/'+key+'/retry',{ids,request_id:crypto.randomUUID()});
    return progress(key);
   }
   if(a==='notify'){
    const key=job.id;
    let remaining=job.notices_failed;
    while(remaining){
     const state=await post('/'+key+'/notify');
     if(state.notices_failed>=remaining)break;
     remaining=state.notices_failed;
    }
    return openDetail(key,{keep:true});
   }
   if(a==='members')return loadMembers(true);
   if(a==='copy-one'||a==='copy-members'){
    const ids=a==='copy-one'?[b.dataset.memberId]:[...memberIds];
    if(!ids.length){toast('복사할 회원을 선택해 주세요.');return;}
    await navigator.clipboard.writeText(ids.join('\n'));toast(n(ids.length)+'명의 ID를 복사했습니다.');return;
   }
   if(a==='csv')return download(await api(path('/'+job.id+'/csv'),{download:true}),'aifect-gift-members.csv');
   if(a==='extend'||a==='recall')return startAdjustment(a);
   if(a==='confirm-adjust')return doAdjustment();
  }
  const confirmRetry=ids=>window.confirm((ids?n(ids.length)+'명의':'이 발송의')+' 실패한 지급만 재시도하시겠습니까?');
  root.addEventListener('click',event=>{
   const b=event.target.closest('[data-gift-action]');
   if(b&&b.dataset.giftAction!=='confirm-members')void withBusy(()=>runAction(b.dataset.giftAction,b));
  });
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  root.addEventListener('submit',event=>{
   const node=event.target;
   event.preventDefault();
   if(node===form)void withBusy(()=>prepare());
   if(node===catalogFilter)void withBusy(()=>loadCatalog());
   if(node===historyFilter){historyPages=[''];productFilter='';void withBusy(loadHistory);}
   if(node.matches('[data-gift-member-filter]')){memberQuery=dataOf(node).q;void withBusy(()=>loadMembers());}
   if(node.matches('[data-gift-adjust-form]'))void withBusy(()=>previewAdjustment(node));
  });
  form.addEventListener('input',event=>{
   const field=event.target,row=field.closest('[data-pick]');
   if(row&&field.dataset.pickField){
    const item=picked.get(row.dataset.pick);item[field.dataset.pickField]=field.value;
    if(field.dataset.pickField==='mode')paintDateInput(row,field.value);
   }
   changed();
  });
  root.addEventListener('change',event=>{
   const input=event.target;
   if(!input.matches('[data-gift-member]'))return;
   if(input.checked)memberIds.add(input.value);else memberIds.delete(input.value);
   $('[data-detail-selection]').value=n(memberIds.size)+'명 선택';
  });
  $('[data-history-list] details').addEventListener('toggle',event=>{if(event.target.open)void loadLegacy();});
  document.addEventListener('aifect-admin-locked',()=>{
   openTicket++;catalogTicket++;historyTicket++;detailTicket++;
   permissions={};reset();job=null;productFilter='';memberIds.clear();
   detailHost.replaceChildren();$('[data-gift-history-results]').replaceChildren();$('[data-gift-recent]').replaceChildren();
   if(dialog.open)dialog.close();
  });
  paintPicked();paintSummary();
  return {
   async open(selection){
    const ticket=++openTicket;
    try{
     const settings=await api(path('/settings'));
     if(ticket!==openTicket)return;
     permissions=settings;audience.setWritable(settings.grant);audience.setRosterWritable(settings.rosters);
     if(selection?.ids?.length){showTab('compose');audience.set({type:'specific',ids:selection.ids});changed();}
     if(selection?.product_id&&selection.history){
      productFilter=selection.product_id;historyPages=[''];historyFilter.reset();await showHistory();
     }else if(selection?.product_id){
      showTab('compose');
      const {products:[p]}=await api(path('/catalog',{id:selection.product_id}));
      if(ticket!==openTicket)return;
      if(p?.grant&&permissions.grant)addProduct(p,selection.option??Object.keys(p.options)[0]);else status('현재 이 상품을 지급할 수 없습니다.');
     }
     paintSummary();
     if(tab==='compose')await Promise.all([loadCatalog(),loadRecent()]);
    }catch(error){status(error.message);}
   },
   refresh(){return tab==='compose'?Promise.all([loadCatalog(),loadRecent()]):job?openDetail(job.id,{keep:true}):loadHistory();}
  };
 }
 window.AifectGiftDispatch={mount};
})();
