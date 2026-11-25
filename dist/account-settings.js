// Shared by browser and server. Do not canonicalize prohibited full-width characters.
const NICKNAME_DAYS=30;
const BLOCKED_NICKNAME_PARTS=['운영자','관리자','어드민','공식계정','고객센터','admin','administrator','moderator','aifect','씨발','시발','병신','개새끼','fuck','shit'];
function nicknamePolicy(value){
 const name=typeof value==='string'?value.trim():'';
 if(name.length<2||name.length>8)return {name,error:'닉네임은 2~8자로 입력해 주세요.'};
 if(!/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9_]+$/.test(name))return {name,error:'닉네임은 한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.'};
 const key=name.toLowerCase();
 if(BLOCKED_NICKNAME_PARTS.some(word=>key.replaceAll('_','').includes(word)))return {name,error:'운영자 사칭 또는 금지어가 포함된 닉네임은 사용할 수 없습니다.'};
 return {name,key};
}

const accountSources = {web:'AIFECT 웹',google_play:'Google Play',app_store:'App Store',event:'오픈선물',grant:'운영자 지급 이용권',other:'프리미엄 이용권'};
const accountStates = {active:'이용 중',expiring:'만료 예정',pending:'결제 확인 중',grace:'결제 유예 중',hold:'결제 보류',failed:'결제 실패',refunded:'환불',expired:'만료',paused:'일시 중지',unknown:'상태 확인 필요'};
const accountPaymentStates = {verified:'구매 확인',paid:'결제 완료',pending:'결제 확인 중',cancelled:'취소',refunded:'환불',partial_refund:'부분 환불',failed:'결제 실패',expired:'만료',refund_review:'환불 확인 중',unknown:'상태 확인 필요'};
const accountStores = {
 google_play:{manage:'https://play.google.com/store/account/subscriptions',history:'https://play.google.com/store/account/orderhistory'},
 app_store:{manage:'https://apps.apple.com/account/subscriptions',history:'https://reportaproblem.apple.com/'}
};
const accountDate = seconds => seconds ? new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(seconds*1000).replaceAll(' ','').replace(/\.$/,'') : '확인되지 않음';
function accountApp(){
 const app=window.AIFECTAccountApp;
 return app && ['android','ios'].includes(app.platform) && typeof app.perform==='function' ? app : null;
}
function accountPair(label,value,rowClass=''){return `<div${rowClass?' class="'+rowClass+'"':''}><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;}
function accountLink(href,label,external=false){
 return `<a href="${esc(href)}"${external?' target="_blank" rel="noopener noreferrer"':''}>${esc(label)}${icon(external?'external':'chevron')}</a>`;
}
function accountPassHTML(p){
 const event=p.source==='event',store=accountStores[p.source],web=p.source==='web',paid=!!store||web;
 const manage=paid&&!['refunded','expired'].includes(p.state);
 const rows=[
   accountPair(paid?'구독 경로':'이용권',p.test?'Google Play 테스트 이용권':accountSources[p.source]||'프리미엄 이용권'),
   !event&&accountPair('이용 상태',accountStates[p.state]||accountStates.unknown),
   p.amount!=null&&accountPair(paid?'월 이용 금액':'이용 금액',billingPrice(p.amount),event&&p.amount===0?'ac-gift-price':''),
   p.next_billing_at&&accountPair('다음 결제일',accountDate(p.next_billing_at)),
   p.until&&!p.next_billing_at&&accountPair(event?'이용 기간':'이용 종료일',accountDate(event?p.until-1:p.until)+(event?'까지':'')),
   p.renewing===false&&p.state==='expiring'&&accountPair('자동결제','해지됨')
 ].filter(Boolean).join('');
 const note=event?'오픈 기념으로 프리미엄 혜택을 무료로 제공해 드려요. 이벤트 종료 후 자동결제되지 않아요.':p.state==='expiring'?'이용 종료일까지 모든 프리미엄 혜택을 사용할 수 있어요.':'';
 return `<div class="ac-pass${event?' ac-pass-event':''}"><dl class="ac-values">${rows}</dl>${note?`<p class="ac-note ac-pass-note">${icon('info')}<span>${note}</span></p>`:''}${manage?`<div class="ac-manage">${accountLink(store?store.manage:'#membership','구독 관리',!!store)}</div>`:''}</div>`;
}
function accountMembershipHTML(data){
 const premium=data.plan==='premium',passes=data.passes,app=accountApp();
 const special=premium&&passes.some(p=>p.source==='event')&&!passes.some(p=>p.source!=='event'&&['active','expiring','grace','pending'].includes(p.state));
 const inUse=premium&&passes.some(p=>p.state==='active');
 const canOffer=data.can_start_subscription===true;
 return `<section class="surface ac-card ac-membership ${premium?'ac-premium':''}" aria-labelledby="ac-plan">
 <div class="ac-heading"><h2 id="ac-plan">${premium?'<span class="ac-plan-icon">'+icon('sparkles')+'</span>':''}회원 등급 및 이용권</h2><span class="ac-plan-label">${premium?'PREMIUM':'FREE'}</span></div>
 <div class="ac-plan-summary"><h3>${special?'오픈 기념 무료 프리미엄':premium?'프리미엄 회원':'일반 회원'}</h3>${inUse?'<span class="ac-plan-state">이용 중</span>':''}</div>
 ${!premium?'<span class="ac-note">무료 이용 중</span><p class="ac-note">프리미엄으로 더 자유로운 음악과 창작 활동을 즐겨보세요.</p>':''}
 ${passes.map(accountPassHTML).join('')}
 ${canOffer&&app?`<button type="button" class="primary-button ac-primary" data-app-action="purchase"${app.canPurchase===true?'':' hidden'}>프리미엄 시작하기</button>`:canOffer&&data.web_checkout_available&&!inApp?'<button class="primary-button ac-primary" data-billing-subscribe>프리미엄 시작하기</button>':''}
 </section>`;
}
function accountUsageHTML(quota){
 const known=quota&&[quota.used,quota.limit,quota.remaining,quota.resets_at].every(Number.isFinite)&&quota.limit>0;
 const link=accountApp()?'<button class="text-link" data-app-action="studio">스튜디오 바로가기'+icon('chevron')+'</button>':accountLink('#studio','스튜디오 바로가기');
 return `<section class="surface ac-card ac-usage"><div class="ac-heading"><h2>이번 달 이용 현황</h2>${icon('upload')}</div><h3>제작곡 업로드</h3>
 ${known?`<div class="ac-meter"><strong>${number(Math.max(0,quota.remaining))}<span>곡 남음</span></strong><span>${number(quota.used)} / ${number(quota.limit)}곡</span></div><progress aria-label="이번 달 제작곡 업로드 사용량" value="${Math.min(quota.used,quota.limit)}" max="${quota.limit}"></progress><p class="ac-note">다음 초기화 · ${accountDate(quota.resets_at)}</p>`:'<p role="status">이용량을 확인할 수 없습니다.</p>'}
 <div class="ac-manage">${link}</div></section>`;
}
function accountPasswordHTML(){
 if(accountApp())return '<button data-app-action="password">비밀번호 변경'+icon('chevron')+'</button>';
 return `<details class="ac-password"><summary>비밀번호 변경${icon('chevron')}</summary><form id="account-password-form">
 ${formField('현재 비밀번호','current_password','password','','required maxlength="128" autocomplete="current-password"')}
 ${formField('새 비밀번호','new_password','password','','required minlength="12" maxlength="128" autocomplete="new-password"')}
 ${formField('새 비밀번호 확인','confirm_password','password','','required minlength="12" maxlength="128" autocomplete="new-password"')}
 <p class="field-help">12자 이상으로 입력해 주세요. 변경하면 다른 기기에서 다시 로그인해야 합니다.</p><button type="submit" class="small-button">비밀번호 저장</button><p class="form-error" role="alert"></p></form></details>`;
}
function accountSettingsHTML(data){
 const {account,benefits}=data,app=accountApp();
 const icons={ad_free:'bellOff',high_quality:'headphones',original_uploads:'upload',vocal_tone:'sliders',punch_in:'mic',synced_lyrics_seek:'music',premium_badge:'star',gold_nickname:'user',premium_frame:'image'};
 const labels={google:'Google',apple:'Apple',kakao:'카카오',email:'이메일'};
 const external=data.passes.some(p=>accountStores[p.source]&&!['expired','refunded','failed'].includes(p.state));
 return `<div class="ac-dashboard" data-platform="${esc(app?.platform||'web')}" data-version="${esc(app?.version||'')}"><h1>내 계정</h1><div class="ac-grid">
 ${accountMembershipHTML(data)}${accountUsageHTML(data.upload_quota)}
 <section class="surface ac-card ac-benefits${data.plan==='premium'?' ac-premium':''}"><h2>${data.plan==='premium'?'이용 중인 프리미엄 혜택':'프리미엄 전용 혜택'}</h2><ul>${benefits.map(b=>`<li data-benefit="${esc(b.id)}">${icon(icons[b.id]||'check')}<span>${esc(b.label)}</span></li>`).join('')}</ul></section>
 <div class="ac-management"><section class="surface ac-card"><h2>계정 정보</h2><dl class="ac-values"><div><dt>닉네임</dt><dd><span class="ac-nickname"${premiumNameAttribute(me.profile_id,account.id)}><span>${esc(account.nickname)}</span></span></dd></div>${accountPair('가입 이메일',account.email&&!account.email.endsWith('.invalid')?account.email:'제공되지 않음')}${accountPair('로그인 방식',labels[account.provider]||'확인되지 않음')}${accountPair('가입일',accountDate(account.created))}</dl></section>
 <section class="surface ac-card"><h2>로그인 및 보안</h2><div class="ac-links">${account.provider==='email'?accountPasswordHTML():''}<button data-ac-sessions>다른 기기 로그아웃${icon('chevron')}</button>
 ${app?'<button type="button" data-app-action="logout">로그아웃'+icon('chevron')+'</button>':'<button type="button" id="logout">로그아웃'+icon('chevron')+'</button>'}
 ${app?`<button type="button" class="ac-withdraw" data-app-action="delete"${external?' aria-describedby="ac-withdraw-note"':''}>회원 탈퇴${icon('chevron')}</button>`:`<a class="ac-withdraw" href="/account/delete" target="_blank" rel="noopener"${external?' aria-describedby="ac-withdraw-note"':''}>회원 탈퇴${icon('external')}</a>`}
 ${authConfig?.admin?accountLink('#admin','정산 관리'):''}${authConfig?.track_moderator?accountLink('#admin/track-review','음원 검토 목록'):''}</div>${external?'<p class="ac-note" id="ac-withdraw-note">회원 탈퇴 후에도 스토어 정기결제가 계속될 수 있습니다. 해당 스토어에서 구독을 확인해 주세요.</p>':''}</section>
 <section class="surface ac-card ac-payments" data-account-id="${esc(account.id)}"><h2>결제 관리</h2><h3>결제 내역</h3><div class="ac-filters" role="group" aria-label="결제 내역 필터">${[['all','전체'],['premium','프리미엄'],['gold','골드']].map(([kind,label])=>`<button data-ac-filter="${kind}" aria-pressed="${kind==='all'}">${label}</button>`).join('')}</div><div class="ac-ledger" aria-live="polite">내역을 불러오는 중…</div>${app?'<button class="text-link ac-restore" data-app-action="restore">구매 복원</button>':''}</section>
 <section class="surface ac-card"><h2>고객지원 및 정책</h2><div class="ac-links">${[['/contact','고객센터'],['/terms','이용약관'],['/privacy','개인정보처리방침'],['/refund','환불 및 해지 정책']].map(([path,label])=>accountLink(path,label,true)).join('')}</div>${app?.version?`<dl class="ac-values">${accountPair('앱 버전',app.version)}</dl>`:''}</section>
 </div></div></div>`;
}
function accountPaymentsList(entries){
 return entries.map(p=>`<li><div><strong>${esc(p.product)}</strong><span>${accountDate(p.date)} · ${esc(accountSources[p.source])}</span></div><div><strong>${p.amount==null?'금액 미확인':esc(billingPrice(p.amount))}</strong><span>${esc(accountPaymentStates[p.state]||accountPaymentStates.unknown)}${p.refunded>0?' · '+esc(billingPrice(p.refunded)):''}</span></div></li>`).join('');
}
function bindAccountPayments(panel){
 const output=panel.querySelector('.ac-ledger'),account=panel.dataset.accountId;
 let kind='all',entries=[],sequence=0,offset=0;
 async function loadPage(start){
  const ticket=++sequence;
  output.setAttribute('aria-busy','true');
  if(!start)output.textContent='내역을 불러오는 중…';
  try{
   const result=await api('/api/account/payments?kind='+kind+'&offset='+start,'GET',undefined,{fresh:true});
   if(!panel.isConnected||ticket!==sequence||me?.id!==account)return;
   if(result.account_id!==account)throw new Error('로그인 계정이 변경됐습니다. 내 계정을 다시 열어 주세요.');
   entries=start?entries.concat(result.payments):result.payments;offset=result.next_offset;
   const links=result.store_history.filter(s=>accountStores[s]).map(s=>accountLink(accountStores[s].history,accountSources[s]+' 구매 내역',true)).join('');
   output.innerHTML=(entries.length?`<ul>${accountPaymentsList(entries)}</ul>`:'<p class="ac-note">표시할 결제 내역이 없습니다.</p>')+(offset!=null?'<button class="text-link" data-ac-more>더 보기</button>':'')+(links?`<div class="ac-manage">${links}</div>`:'');
  }catch(e){
   if(!panel.isConnected||ticket!==sequence)return;
   output.innerHTML=(start?`<ul>${accountPaymentsList(entries)}</ul>`:'')+`<p role="alert">${esc(e.message)}</p><button class="text-link" data-ac-retry>다시 시도</button>`;offset=start;
  }finally{if(ticket===sequence)output.removeAttribute('aria-busy');}
 }
 panel.addEventListener('click',e=>{
  const filter=e.target.closest('[data-ac-filter]');
  if(filter){kind=filter.dataset.acFilter;panel.querySelectorAll('[data-ac-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===filter)));entries=[];void loadPage(0);}
  if(e.target.closest('[data-ac-more],[data-ac-retry]')&&!output.hasAttribute('aria-busy'))void loadPage(offset);
 });
 void loadPage(0);
}
function bindAccountSettings(data){
 const root=document.querySelector('.ac-dashboard');
 if(!root)return;
 // A native bridge can arrive after the first document render on older WebViews.
 const refreshCapabilities=()=>{
  if(!root.isConnected||me?.id!==data.account.id)return false;
  const app=accountApp();
  if(root.dataset.platform!==(app?.platform||'web')||root.dataset.version!==String(app?.version||'')){
   unbind();
   root.outerHTML=accountSettingsHTML(data);
   bindAccountSettings(data);
   const logout=$('#logout');if(logout)logout.onclick=logoutAccount;
   return true;
  }
  const buy=root.querySelector('[data-app-action="purchase"]');
  if(buy)buy.hidden=app?.canPurchase!==true;
  return false;
 };
 const refreshAfterPurchase=()=>{if(root.isConnected&&me?.id===data.account.id)void render();};
 window.addEventListener('aifect-account-refresh',refreshAfterPurchase);
 window.addEventListener('aifect-account-capabilities',refreshCapabilities);
 const unbind=registerRouteCleanup(()=>{
  window.removeEventListener('aifect-account-refresh',refreshAfterPurchase);
  window.removeEventListener('aifect-account-capabilities',refreshCapabilities);
 });
 if(refreshCapabilities())return;
 bindAccountPayments(root.querySelector('.ac-payments'));
 const passwordForm=root.querySelector('#account-password-form');
 if(passwordForm)passwordForm.onsubmit=busyForm(passwordForm,async fd=>{
  if(fd.get('new_password')!==fd.get('confirm_password'))throw new Error('새 비밀번호 확인이 일치하지 않습니다.');
  await api('/api/account/password','PUT',{current_password:fd.get('current_password'),new_password:fd.get('new_password')});
  passwordForm.reset();passwordForm.closest('details').open=false;toast('비밀번호를 변경했습니다.');
 });
 root.querySelector('[data-ac-sessions]').onclick=()=>{
  dialog('<h2>다른 기기 로그아웃</h2><p>현재 사용 중인 기기를 제외한 모든 기기에서 로그아웃할까요?</p><form id="ac-session-confirm"><div class="inline-actions"><button type="button" class="small-button">취소</button><button type="submit" class="primary-button">로그아웃</button></div><p class="form-error" role="alert"></p></form>');
  const form=$('#ac-session-confirm');form.querySelector('[type=button]').onclick=()=>$('#dialog').close();
  form.onsubmit=busyForm(form,async()=>{await api('/api/account/logout-others','POST',{});$('#dialog').close();toast('다른 기기에서 로그아웃했습니다.');});
 };
 root.addEventListener('click',e=>{const action=e.target.closest('[data-app-action]')?.dataset.appAction;if(action)accountApp()?.perform(action);});
}
function bindNicknameAvailability(form,input,status){
 if(!input||input.dataset.nicknameBound)return;input.dataset.nicknameBound='1';
 const original=input.value;let revision=0,timer;
 const submit=form.querySelector('[type=submit],button.primary-button');
 input.addEventListener('input',()=>{const serial=++revision;clearTimeout(timer);input.setCustomValidity('');if(input.value===original&&form.id!=='auth-form'){status.textContent='';if(submit)submit.disabled=false;return;}
  const result=nicknamePolicy(input.value);if(result.error){input.setCustomValidity(result.error);status.textContent=result.error;if(submit)submit.disabled=true;return;}
  status.textContent='확인 중…';if(submit)submit.disabled=true;
  timer=setTimeout(async()=>{try{const out=await api('/api/account/nickname?name='+encodeURIComponent(result.name),'GET',undefined,{fresh:true});if(serial!==revision||!input.isConnected)return;status.textContent=out.message;input.setCustomValidity(out.available?'':out.message);if(submit)submit.disabled=!out.available;}catch(e){if(serial!==revision)return;status.textContent=e.message;if(submit)submit.disabled=true;}},350);
 });
 input.addEventListener('blur',()=>{input.value=input.value.trim();});
}
function bindIdentityInputs(){
 for(const selector of ['#auth-form','#public-profile-form','#producer-form']){const form=document.querySelector(selector);if(!form)continue;const input=form.elements.name;if(!input||input.dataset.nicknameBound)continue;const status=document.createElement('p');status.className='field-help';status.setAttribute('role','status');input.closest('label').after(status);bindNicknameAvailability(form,input,status);}
}
new MutationObserver(bindIdentityInputs).observe(document.body,{childList:true,subtree:true});

document.addEventListener('click',async event=>{const button=event.target.closest('[data-copy-public-id]');if(!button)return;try{await navigator.clipboard.writeText(button.dataset.copyPublicId);toast(button.closest('.mp-own .mp-profile')?'ID가 복사되었습니다.':'고유 ID를 복사했습니다.');}catch{toast('복사할 수 없습니다. ID를 직접 선택해 주세요.');}});
