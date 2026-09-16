const billingDate=seconds=>seconds?new Date(seconds*1000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'}):'—';
const paymentLabels={created:'결제 준비',processing:'결과 확인 중',review:'결과 확인 중',paid:'결제 완료',failed:'결제 실패',expired:'만료',cancelled:'전액 환불',partialCancelled:'부분 환불'};
function billingHTML(data){
 if(!data)return '<section class="surface billing-panel"><p>구독 정보를 불러오지 못했습니다.</p><button class="small-button" data-billing-refresh>다시 확인</button></section>';
 const s=data.subscription,until=s?.period_end,paid=until&&until*1000>Date.now();
 const state=s?.payment_pending?'결제 결과 확인 중':s?.renewing?'Premium 구독 중':s?.state==='cancelled'?'자동갱신 해지 완료':s?.state==='failed'?'결제되지 않았어요':member.plan==='premium'?'Premium 이용 중':'무료로 음악을 듣고 있어요';
 const canStart=data.checkout_available&&!s?.payment_pending&&!paid&&!['active','pending','registering','review'].includes(s?.state);
 return `<section class="surface billing-panel" aria-label="내 구독"><div class="billing-heading"><div><span class="eyebrow">MY SUBSCRIPTION</span><h2>${state}</h2><p>${s?.payment_pending?'결제 결과를 확인하고 있습니다. 중복 결제하지 말고 아래에서 결과를 확인해주세요.':s?.renewing?`다음 결제일 ${billingDate(until)} · 4,900원 (부가세 포함)`:paid?`${billingDate(until)}까지 Premium을 이용할 수 있어요. 다음 자동결제는 없습니다.`:s?.state==='failed'?'결제하지 않은 기간의 요금은 청구하지 않습니다. 다시 시작하려면 카드를 등록해주세요.':'좋아하는 음악은 계속 무료로 감상할 수 있어요.'}</p>${s?.card_name?`<small>결제 카드 · ${esc(s.card_name)}</small>`:''}</div><div class="inline-actions">${canStart?`<button class="primary-button" data-billing-subscribe>${me?'월 4,900원으로 시작하기':'로그인하고 이용권 선택'}</button>`:''}${s?'<button class="small-button" data-billing-refresh>결제 결과 확인</button>':''}${s&&!['cancelled','failed','idle'].includes(s.state)?'<button class="text-link" data-billing-cancel>자동갱신 해지</button>':''}</div></div>${!data.checkout_available&&!s?.renewing?'<p class="billing-notice">카드 정기결제를 준비 중입니다. 가입이 열리면 이 화면에서 신청할 수 있어요.</p>':''}</section>${data.payments?.length?`<section class="surface billing-panel"><h2>결제 내역</h2><div class="billing-history"><table><thead><tr><th>결제일</th><th>이용권</th><th>금액</th><th>상태</th></tr></thead><tbody>${data.payments.map(p=>`<tr><td>${billingDate(p.created)}<small class="billing-order">주문번호 ${esc(p.id)}</small></td><td>Premium<small>${billingDate(p.period_start)} ~ ${billingDate(p.period_end)}</small></td><td>${number(p.amount)}원${p.refunded?`<small>환불 ${number(p.refunded)}원</small>`:''}</td><td>${paymentLabels[p.status]||'확인 중'}</td></tr>`).join('')}</tbody></table></div><a class="text-link" href="/refund" target="_blank" rel="noopener">환불 요청 안내 →</a></section>`:''}`;
}
function billingTermsText(html){
 const doc=new DOMParser().parseFromString(String(html).replace(/<(br|\/p|\/li|\/tr|\/h[1-6])\b[^>]*>/gi,'\n'),'text/html');
 doc.querySelectorAll('script,style,iframe,object').forEach(el=>el.remove());
 return doc.body.textContent.trim();
}
async function openBillingCheckout(){
 if(!me){returnRoute='#membership';return askLogin();}
 dialog('<h2>Premium 구독</h2><p role="status">이용 조건을 불러오고 있어요.</p>');
 const data=await api('/api/billing/status');
 if(!data.checkout_available)throw new Error('카드 정기결제를 준비 중입니다.');
 const terms=await api('/api/billing/terms');
 const day=data.billing_day;
 dialog(`<h2>Premium 구독 시작</h2><div class="billing-checkout-summary"><strong>오늘 결제 · 4,900원</strong><p>부가세 포함 · 결제일부터 1개월 이용<br>첫 갱신 예정일 ${billingDate(data.first_renewal_at)}<br>이후 매월 ${day}일 4,900원 자동결제<br>해당 날짜가 없는 달에는 마지막 날에 결제됩니다.</p></div><form id="billing-checkout-form" autocomplete="off"><div class="billing-fields"><label>카드번호<input name="cardNo" type="text" inputmode="numeric" autocomplete="off" pattern="[0-9 ]{14,19}" maxlength="19" placeholder="숫자만 입력" required></label><div class="billing-field-row"><label>만료 월 (MM)<input name="expMonth" type="text" inputmode="numeric" pattern="(0[1-9]|1[0-2])" minlength="2" maxlength="2" placeholder="MM" required></label><label>만료 연도 (YY)<input name="expYear" type="text" inputmode="numeric" pattern="[0-9]{2}" minlength="2" maxlength="2" placeholder="YY" required></label></div><label>생년월일 6자리 / 법인 사업자번호 10자리<input name="idNo" type="password" inputmode="numeric" autocomplete="off" pattern="([0-9]{6}|[0-9]{10})" maxlength="10" required></label><label>카드 비밀번호 앞 2자리<input name="cardPw" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]{2}" minlength="2" maxlength="2" required></label></div><p class="field-help">입력 정보는 카드 등록을 위해 NICEPAY에 암호화하여 전송하고 AIFECT에 저장하지 않습니다. 이후 결제에는 암호화해 보관한 결제용 키를 사용합니다.</p><div class="billing-consents">${terms.terms.map((term,i)=>`<div><label class="checkbox-line"><input type="checkbox" name="pg${i}" required><span>[필수] ${esc(term.title)} 동의</span></label><details><summary>내용 보기</summary><pre>${esc(billingTermsText(term.content))}</pre></details></div>`).join('')}<label class="checkbox-line"><input type="checkbox" name="consent" required><span>[필수] <a href="/terms" target="_blank" rel="noopener">이용약관</a>, <a href="/privacy" target="_blank" rel="noopener">개인정보처리방침</a>, <a href="/refund" target="_blank" rel="noopener">환불 정책</a>을 확인했고, 오늘 및 매월 4,900원 정기결제에 동의합니다.</span></label></div><p class="field-help">다음 결제 전 이용 혜택 화면에서 자동갱신을 해지할 수 있습니다. 해지 후에도 결제한 기간까지 이용할 수 있어요.</p><button class="primary-button">4,900원 결제하고 구독 시작</button><p class="form-error" role="alert"></p></form>`);
 const form=$('#billing-checkout-form');
 form.onsubmit=busyForm(form,async fd=>{
  const card=Object.fromEntries(['cardNo','expMonth','expYear','idNo','cardPw'].map(k=>[k,String(fd.get(k)||'').replace(/\s/g,'')]));
  form.querySelectorAll('.billing-fields input').forEach(el=>{el.value='';});
  let result;try{result=await api('/api/billing/subscribe','POST',{card,terms_version:terms.version,consent:fd.has('consent')});}finally{for(const k of Object.keys(card))card[k]='';}
  $('#dialog').close();await refreshLibrary();updateAccount();await render();
  toast(result.subscription?.payment_pending?'결제 결과를 확인 중입니다. 구독 화면에서 결과를 확인해주세요.':result.subscription?.renewing?'Premium 구독이 시작됐습니다.':'결제가 완료되지 않았습니다. 구독 내역을 확인해주세요.');
 });
}
async function openBillingCancellation(){
 const data=await api('/api/billing/status');
 dialog(`<h2>자동갱신을 해지할까요?</h2><p>다음 결제부터 청구하지 않습니다. 이미 결제한 이용권은 ${billingDate(data.subscription?.period_end)}까지 이용할 수 있어요.</p><p>이미 결제한 금액의 환불은 <a href="/refund" target="_blank" rel="noopener">환불 안내</a>에서 요청해주세요.</p><form id="billing-cancel-form"><button class="primary-button">자동갱신 해지하기</button><p class="form-error" role="alert"></p></form>`);
 const form=$('#billing-cancel-form');form.onsubmit=busyForm(form,async()=>{await api('/api/billing/cancel','POST',{});$('#dialog').close();await refreshLibrary();updateAccount();await render();toast('자동갱신을 해지했습니다.');});
}
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-billing-subscribe],[data-billing-cancel],[data-billing-refresh]');if(!button||button.disabled)return;
 button.disabled=true;
 try{if(button.hasAttribute('data-billing-subscribe'))await openBillingCheckout();else if(button.hasAttribute('data-billing-cancel'))await openBillingCancellation();else{if(me)await api('/api/billing/sync','POST',{});await refreshLibrary();updateAccount();await render();}}
 catch(err){const loading=$('#dialog-content');if($('#dialog').open&&!loading.querySelector('form'))loading.innerHTML=`<h2>구독 안내</h2><p role="alert">${esc(err.message)}</p>`;else toast(err.message);}
 finally{button.disabled=false;}
});
