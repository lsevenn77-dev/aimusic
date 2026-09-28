const goldOrderLabels={created:'결제 대기',approving:'승인 확인 중',checking:'결과 확인 중',paid:'충전 완료',cancelled:'결제 취소',refund_review:'환불 확인 중',failed:'결제 실패',expired:'만료'};
function paymentKindTabs(active){return `<nav class="tabs" aria-label="구매 상품"><a class="tab ${active==='premium'?'active':''}" href="#membership">Premium · 정기결제</a><a class="tab ${active==='gold'?'active':''}" href="#gold">골드 충전 · 단건결제</a></nav>`;}
function goldHTML(d){
 const ready=!inApp&&(d.checkout_available||d.review_only);
 return heading('골드 충전','좋아하는 음악에 선물하는 골드. 필요한 만큼, 한 번씩 결제해요.')+paymentKindTabs('gold')+`<section class="surface gold-card"><span class="eyebrow">선물에 쓸 수 있는 보유 골드</span><strong class="gold-balance">${number(d.balance)} <small>G</small></strong><p>골드는 선물에 사용하는 수량이에요. 받은 사람의 정산액은 별도로 계산돼요.</p><a class="text-link" href="#gifts">선물 종류 · 무료 응원별 보기 →</a></section>${section('충전 상품')}<p class="field-help">표시 금액은 부가세 포함 · 보너스 골드 없음 · 자동충전 및 정기결제 없음</p>${d.review_only?'<p class="billing-notice">심사 계정 · NICEPAY 단건결제창까지 확인할 수 있어요. 실제 카드 인증이나 결제를 진행하지 마세요. 서버에서 승인·골드 지급을 차단합니다.</p>':''}<div class="gold-packs">${d.packs.map(p=>`<article class="surface gold-pack"><strong>${number(p.gold)} <small>골드</small></strong><span>${number(p.price)}원</span><button class="primary-button" data-buy-gold="${p.gold}" ${ready?'':'disabled'}>${d.review_only?'심사용 결제창 확인':ready?'단건 충전하기':'결제 준비 중'}</button></article>`).join('')}</div><p class="field-help">구매금액과 제공 골드 수량을 확인한 후 결제해주세요. 골드의 충전 가격은 창작자에게 지급되는 정산 단가와 다릅니다. <a href="/refund#gold" target="_blank" rel="noopener">골드 환불 안내</a> · <a href="/terms#gold" target="_blank" rel="noopener">골드 이용 안내</a></p>${!ready?'<p class="billing-notice">골드 충전은 심사와 결제 준비가 끝나면 열려요. 무료 응원별은 지금 모아서 보낼 수 있어요.</p>':''}${section('충전 내역')}<div class="surface gift-history">${d.orders?.length?d.orders.map(o=>`<div class="gift-row"><span>${number(o.gold)} G · ${number(o.price_krw)}원<small>${esc(o.id)}</small></span><strong>${o.review_only?'심사 전용 · 결제되지 않음':goldOrderLabels[o.state]||'확인 중'}</strong>${!o.review_only?`<button class="small-button" data-gold-sync="${esc(o.id)}">결과 확인</button>`:''}</div>`).join(''):'<p>아직 충전 내역이 없어요.</p>'}</div>${section('보낸 골드 선물')}<div class="surface gift-history">${d.sent.length?d.sent.map(g=>`<div class="gift-row"><a href="#song/${esc(g.track_id)}">${esc(g.gift_name||'골드 선물')} · ${esc(g.title)}</a><strong>${number(g.gold)} G</strong><time>${new Date(g.created*1000).toLocaleDateString('ko-KR')}</time></div>`).join(''):'<p>아직 보낸 선물이 없어요.</p>'}</div>${section('보낸 무료 응원별')}<p class="field-help">응원 효과와 순위에 반영돼요. 현금 가치나 수익 정산은 없어요.</p><div class="surface gift-history">${d.free_sent?.length?d.free_sent.map(g=>`<div class="gift-row"><a href="#song/${esc(g.track_id)}">${esc(g.title)}</a><strong>★ 1</strong></div>`).join(''):'<p>아직 보낸 응원별이 없어요.</p>'}</div>`;
}
let niceGoldSdk;
function loadGoldSDK(){
 if(window.AUTHNICE)return Promise.resolve();
 if(niceGoldSdk)return niceGoldSdk;
 niceGoldSdk=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://pay.nicepay.co.kr/v1/js/';script.onload=()=>window.AUTHNICE?resolve():reject(new Error('결제창을 불러오지 못했어요.'));script.onerror=()=>{niceGoldSdk=null;script.remove();reject(new Error('결제창 연결을 확인해주세요.'));};document.head.append(script);});return niceGoldSdk;
}
async function openGoldCheckout(gold){
 if(!me){returnRoute='#gold';return askLogin();}
 if(inApp)throw new Error('앱 내 골드 결제는 준비 중입니다.');
 const d=await api('/api/gold'),pack=d.packs.find(p=>p.gold===gold);if(!pack||(!d.checkout_available&&!d.review_only))throw new Error('골드 충전 준비 중입니다.');
 const requestId=crypto.randomUUID();
 dialog(`<h2>골드 충전 · 단건결제</h2><div class="billing-checkout-summary"><strong>${number(pack.gold)}골드</strong><p>이번 결제금액 <b>${number(pack.price)}원</b> (부가세 포함)</p><p>결제 승인 후 로그인한 계정에 지급돼요.<br>카드를 등록하거나 다음 달 자동결제하지 않아요.</p></div><p>골드는 선물에 사용하며, 받은 창작자의 수익은 결제 수수료와 배분 기준을 반영해 별도로 계산합니다.</p><form id="gold-checkout-form">${d.review_only?'<p class="billing-notice">심사 전용입니다. 실제 카드 인증을 진행하지 마세요. 서버에서 결제 승인을 차단합니다.</p>':'<label class="checkbox-line"><input type="checkbox" name="consent" required> <span>충전 금액과 제공 수량, <a href="/terms#gold" target="_blank" rel="noopener">이용약관</a> 및 <a href="/refund#gold" target="_blank" rel="noopener">환불 정책</a>을 확인하고 이번 단건 구매에 동의합니다.</span></label>'}<button class="primary-button">${d.review_only?'NICEPAY 심사용 결제창 열기':number(pack.price)+'원 단건결제'}</button><p class="form-error" role="alert"></p></form>`);
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
