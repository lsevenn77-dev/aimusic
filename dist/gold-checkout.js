const goldOrderLabels={created:'결제 대기',approving:'승인 확인 중',checking:'결과 확인 중',paid:'충전 완료',cancelled:'결제 취소',refund_review:'환불 확인 중',failed:'결제 실패',expired:'만료'};
function paymentKindTabs(active){return `<nav class="tabs" aria-label="구매 상품"><a class="tab ${active==='premium'?'active':''}" href="#membership">Premium · 정기결제</a><a class="tab ${active==='gold'?'active':''}" href="#gold">골드 충전 · 결제</a></nav>`;}
function goldHTML(d,history=false){
 const ready=!inApp&&(d.checkout_available||d.review_only),packs=inApp?d.packs:(d.web_packs||[]);
 return heading('골드 충전','좋아하는 음악에 선물하는 골드. 필요한 만큼, 한 번씩 결제해요.')+paymentKindTabs('gold')+`<div class="gold-page">
  <section class="surface gold-card" aria-labelledby="gold-balance-title">
   <div class="gold-wallet-summary"><span class="eyebrow" id="gold-balance-title">선물에 쓸 수 있는 보유 골드</span><strong class="gold-balance">${number(d.balance)} <small>G</small></strong><a class="small-button gold-shop-link" href="#gifts">선물 종류 · 무료 실버 보기</a></div>
   <div class="gold-wallet-copy"><p>골드는 선물에 사용하는 수량이에요. 받은 사람의 정산액은 별도로 계산돼요.</p></div>
  </section>
  <section class="gold-products" aria-labelledby="gold-products-title">
   <header class="gold-section-heading"><h2 id="gold-products-title">충전 상품</h2><p class="field-help">신용카드 일시불 결제 · 표시 금액은 부가세 포함 · ${inApp?'인앱결제는 해당 스토어 상품 기준':'웹 1회 한도 100,000원 · 골드 5% 추가 지급'} · 자동충전 및 정기결제 없음</p></header>
   ${d.review_only?'<p class="billing-notice">심사 계정 · 토스 TEST 주문서에서 상품을 선택하고 테스트 연결 상태를 확인할 수 있어요. 실제 청구·골드 지급은 없습니다.</p>':''}
   <div class="gold-packs">${packs.map(p=>`<article class="surface gold-pack">
    <div class="gold-pack-main"><span class="gold-pack-label">제공 골드</span><strong>${number(p.total_gold??p.gold)} <small>G</small></strong></div>
    ${p.bonus_gold?`<p class="gold-bonus"><span>${number(p.gold)}G + ${number(p.bonus_gold)}G</span><span>5% 추가 증정</span></p>`:''}
    <div class="gold-pack-purchase"><span class="gold-pack-price">${number(p.price)}원</span><button class="primary-button" data-buy-gold="${p.gold}" ${ready?'':'disabled'}>${d.review_only?'토스 TEST 주문서':ready?'충전하기':'결제 준비 중'}</button></div>
   </article>`).join('')}</div>
   <div class="gold-purchase-notes"><p class="field-help">${esc(AifectGifts.GIFT_SETTLEMENT_NOTICE)} 추가 골드를 포함한 총 수량과 실제 결제 내역을 기준으로 계산해요.</p><p class="field-help">${inApp?'구매금액과 제공 골드 수량을 확인한 후 결제해주세요.':'토스 웹 충전 골드는 결제일로부터 1년 안에 사용하거나 환불을 신청할 수 있어요. 잔액은 양도할 수 없고, 환불은 원결제수단으로만 처리해요.'} 골드의 충전 가격은 창작자에게 지급되는 정산 단가와 다릅니다. <a href="/refund#gold" target="_blank" rel="noopener">골드 환불 안내</a> · <a href="/terms#gold" target="_blank" rel="noopener">골드 이용 안내</a></p>${!ready?'<p class="billing-notice">골드 충전은 심사와 결제 준비가 끝나면 열려요. 무료 실버는 지금 모아서 보낼 수 있어요.</p>':''}</div>
  </section>
  <section class="surface gold-orders" aria-labelledby="gold-orders-title"><header class="gold-section-heading"><h2 id="gold-orders-title">충전 내역</h2></header><div class="gift-history gold-order-list">${d.orders?.length?d.orders.map(o=>`<div class="gift-row gold-order-row"><span class="gold-order-detail"><span class="gold-order-amount">${number(o.gold)} G · ${number(o.price_krw)}원</span><small class="gold-order-id">주문번호 ${esc(o.id)}</small></span><strong class="gold-order-state">${o.review_only?'심사 전용 · 결제되지 않음':goldOrderLabels[o.state]||'확인 중'}</strong>${!o.review_only?`<button class="small-button" data-gold-sync="${esc(o.id)}">결과 확인</button>`:''}</div>`).join(''):'<p class="empty-note">아직 충전 내역이 없어요.</p>'}</div></section>
  <div class="gold-page-footer">${history?sentGiftHistoryHTML(d):'<a class="small-button gold-history-link" href="#gold/history">보낸 선물 내역 보기</a>'}</div>
 </div>`;
}
function sentGiftHistoryHTML(d){
 const rows=d.items||[],labels={artist:'AI 아티스트',work:'곡',profile:'유저',message:'유저',inventory:'유저',room:'방'};
 return `<section class="surface gift-history" aria-label="보낸 선물 내역">${rows.length?rows.map(g=>{
  const kind=g.target_type,label=kind==='work'&&g.work_kind==='dubbing'?'더빙':labels[kind]||'유저';
  const route=kind==='artist'?'artist/'+g.target_id:kind==='work'?(g.work_kind==='dubbing'?'dubbing/':'song/')+g.target_id:g.recipient_profile_id?'producer/'+g.recipient_profile_id:'';
  const name=kind==='inventory'?(g.recipient_name||'회원'):g.target_name;
  return `<div class="gift-row"><span>${route?`<a href="#${esc(route)}">${esc(name)}</a>`:esc(name)}<small>${label} · ${esc(g.gift_name||'선물')} × ${number(g.quantity||1)}</small></span><strong>${number(g.value)} ${g.currency==='gold'?'G':'S'}</strong><time datetime="${new Date(g.created*1000).toISOString()}">${new Date(g.created*1000).toLocaleString('ko-KR')}</time></div>`;
 }).join(''):'<p>아직 보낸 선물이 없어요.</p>'}</section><nav class="gift-history-pages" aria-label="선물 내역 페이지">${d.offset?`<a class="small-button" href="#gold/history?offset=${Math.max(0,d.offset-50)}">이전</a>`:''}${d.next_offset!=null?`<a class="small-button" href="#gold/history?offset=${d.next_offset}">다음</a>`:''}</nav>`;
}
let niceGoldSdk;
function loadGoldSDK(){
 if(window.AUTHNICE)return Promise.resolve();
 if(niceGoldSdk)return niceGoldSdk;
 niceGoldSdk=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://pay.nicepay.co.kr/v1/js/';script.onload=()=>window.AUTHNICE?resolve():reject(new Error('결제창을 불러오지 못했어요.'));script.onerror=()=>{niceGoldSdk=null;script.remove();reject(new Error('결제창 연결을 확인해주세요.'));};document.head.append(script);});return niceGoldSdk;
}
async function openGoldCheckout(gold,view=null){
 const ticket=renderId;
 if(!me){returnRoute='#gold';return askLogin();}
 if(inApp)throw new Error('앱 내 골드 결제는 준비 중입니다.');
 const d=await api('/api/gold'),pack=(d.web_packs||[]).find(p=>p.gold===gold);if(!pack||(!d.checkout_available&&!d.review_only))throw new Error('골드 충전 준비 중입니다.');
 if(ticket!==renderId)return;
 // Review accounts always use the isolated Toss TEST flow, never the legacy PG.
 if(d.review_only){if(view)view.review();else location.assign('/checkout/toss/gold');return;}
 const requestId=crypto.randomUUID();
 if(ticket!==renderId)return;
 (view?.render||dialog)(`<h2>골드 충전 · 결제</h2><div class="billing-checkout-summary"><strong>${number(pack.total_gold??pack.gold)}골드</strong>${pack.bonus_gold?`<p class="gold-bonus">기본 ${number(pack.gold)}G + 추가 ${number(pack.bonus_gold)}G (5%)</p>`:''}<p>이번 결제금액 <b>${number(pack.price)}원</b> (부가세 포함)</p><p>결제 승인 후 로그인한 계정에 지급돼요.<br>신용카드 일시불로 한 번만 결제해요.<br>카드를 등록하거나 다음 달 자동결제하지 않아요.</p></div><p>골드는 선물에 사용하며, 받은 창작자의 수익은 세금·결제 수수료와 배분 기준을 반영해 별도로 계산합니다.</p><form id="gold-checkout-form">${d.review_only?'<p class="billing-notice">심사 전용입니다. 실제 카드 인증을 진행하지 마세요. 서버에서 결제 승인을 차단합니다.</p>':'<label class="checkbox-line"><input type="checkbox" name="consent" required> <span>충전 금액과 제공 수량, <a href="/terms#gold" target="_blank" rel="noopener">이용약관</a> 및 <a href="/refund#gold" target="_blank" rel="noopener">환불 정책</a>을 확인하고 이번 단건 구매에 동의합니다.</span></label>'}<button class="primary-button">${d.review_only?'토스 TEST 주문서 열기':number(pack.price)+'원 결제'}</button><p class="form-error" role="alert"></p></form>`);
 const form=$('#gold-checkout-form');form.onsubmit=busyForm(form,async fd=>{
  await loadGoldSDK();const result=await api('/api/gold/checkout','POST',{gold,request_id:requestId,consent:fd.has('consent')});
  $('#dialog').close();window.AUTHNICE.requestPay({...result.payment,fnError:()=>{toast('결제가 완료되지 않았어요. 충전 내역에서 결과를 확인해주세요.');if(location.hash.startsWith('#gold'))render();}});
 });
}
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-buy-gold],[data-gold-sync]');if(!button||button.disabled)return;button.disabled=true;
 try{if(button.hasAttribute('data-buy-gold'))await openGoldCheckout(Number(button.dataset.buyGold));else{await api('/api/gold/orders/'+encodeURIComponent(button.dataset.goldSync),'POST',{});await render();}}
 catch(err){toast(err.message);}finally{button.disabled=false;}
});
