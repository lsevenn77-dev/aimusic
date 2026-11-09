import {WEB_GOLD_PACKS} from '../shared/gifts.js';
import {businessDetailsHTML,businessFooterHTML,policyLinks} from '../shared/site-info.js';

const routes=new Set(['/checkout/toss/gold','/checkout/toss/gold/success','/checkout/toss/gold/fail']);
const number=value=>value.toLocaleString('ko-KR');
function goldPaymentPage(){
 const initial=WEB_GOLD_PACKS[0];
 return `<!doctype html>
<html lang="ko"><head>
 <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#0c121b">
 <title>골드 단건결제 테스트 | AIFECT</title>
 <link rel="stylesheet" href="/brand.css?v=20261007-reference"><link rel="stylesheet" href="/design-system.css?v=20261017-lavender-mint"><link rel="stylesheet" href="/policies.css"><link rel="stylesheet" href="/payment-checkout.css"><link rel="stylesheet" href="/gold-payment-checkout.css">
 <script type="module" src="/gold-payment-checkout.js"></script>
</head><body class="checkout-site checkout-gold-site">
 <header class="checkout-header"><a class="checkout-brand" href="/#home" aria-label="AIFECT 홈"><span class="aifect-lockup"><img class="aifect-wordmark-logo" src="/assets/aifect-wordmark.svg?v=20261007-reference" width="148" height="36" alt="AIFECT"></span></a><a href="/#home">음악으로 돌아가기</a></header>
 <main class="checkout-main">
  <header class="checkout-heading"><p class="checkout-kicker">TOSS PAYMENTS · TEST ONLY</p><h1>골드 단건결제 테스트</h1><p class="checkout-lead">골드 상품과 토스페이먼츠의 테스트 카드 결제 흐름을 확인하세요.</p></header>
  <div class="checkout-test-note" id="checkout-test-note"><strong>테스트 전용 · 실제 청구 없음</strong><p>카드 인증 화면 확인용입니다. 결제 승인을 요청하지 않으며 실제 청구·골드 지급·선물 발송·창작자 정산은 발생하지 않습니다. 자동충전·정기결제는 없습니다.</p></div>
  <p class="checkout-status" id="checkout-status" role="status" aria-live="polite">골드용 테스트 결제 가능 여부를 확인하고 있습니다.</p><p class="checkout-error" id="checkout-error" role="alert" hidden></p>
  <section id="checkout-order" aria-label="골드 테스트 주문 선택"><form id="checkout-form" aria-describedby="checkout-test-note"><div class="checkout-layout">
   <section class="checkout-product" aria-label="골드 충전 상품">
    <div class="checkout-gold-intro"><img class="checkout-product-image" src="/assets/aifect-gold-product.svg" width="80" height="80" alt="AIFECT 골드 충전 상품"><div><h2>AIFECT 골드</h2><p>음악에 선물하고 AI 더빙 음향 제작에 사용해요.</p></div></div>
    <fieldset class="checkout-products"><legend>골드 상품 선택</legend><p class="checkout-field-help">1회 한도 100,000원(부가세 포함) · 기본 골드 5% 추가</p><div class="checkout-pack-list">
     ${WEB_GOLD_PACKS.map((pack,index)=>`<label class="checkout-pack" for="checkout-gold-${pack.gold}"><input type="radio" name="gold" id="checkout-gold-${pack.gold}" value="${pack.gold}" data-price="${pack.price}" data-bonus-gold="${pack.bonus_gold}" data-total-gold="${pack.total_gold}"${index===0?' checked':''}><span class="checkout-pack-copy"><strong>${number(pack.total_gold)} <small>G</small></strong><span>기본 ${number(pack.gold)}G + 추가 ${number(pack.bonus_gold)}G</span></span><span class="checkout-pack-price">${number(pack.price)}원</span></label>`).join('')}
    </div></fieldset>
   </section>
   <section class="checkout-summary" aria-labelledby="checkout-summary-title"><div class="checkout-summary-heading"><h2 id="checkout-summary-title">테스트 주문 확인</h2></div>
    <dl class="checkout-totals" aria-live="polite" aria-atomic="true"><div class="checkout-total-gold"><dt>총 골드 수량</dt><dd id="checkout-total-gold">${number(initial.total_gold)} G</dd></div><div><dt>기본 골드</dt><dd id="checkout-base-gold">${number(initial.gold)} G</dd></div><div><dt>웹 추가 골드</dt><dd id="checkout-bonus-gold">${number(initial.bonus_gold)} G</dd></div><div class="checkout-total-amount"><dt>상품 결제금액<small>부가세 포함 · 테스트 표시 금액</small></dt><dd id="checkout-amount">${number(initial.price)}원</dd></div><div class="checkout-test-charge"><dt>이번 테스트 실제 청구</dt><dd>0원</dd></div></dl>
    <p class="checkout-field-help">신용카드 단건결제 테스트 · 자동갱신 없음<br>표시 수량은 상품 확인용이며 지급되지 않습니다.</p>
    <label class="checkout-consent" for="checkout-consent"><input id="checkout-consent" name="consent" type="checkbox" required><span>TEST 전용이며 실제 청구·골드 지급·자동충전·정기결제가 없음을 확인했습니다.</span></label>
    <button class="checkout-primary" id="checkout-submit" type="submit" disabled>토스 골드 테스트 결제창 열기</button><p class="checkout-fine">위 확인은 테스트 진행을 위한 것으로 실제 상품 구매 동의가 아닙니다.</p>
   </section>
  </div></form></section>
  <section class="checkout-result" id="checkout-result" aria-labelledby="result-title" hidden><p class="checkout-kicker">TEST ONLY</p><h2 id="result-title">골드 결제 테스트 결과 확인</h2><p id="result-copy">테스트 카드 인증 후 돌아온 요청을 확인하고 있습니다.</p><dl class="checkout-result-details"><div><dt>테스트 주문번호</dt><dd id="result-order-id">—</dd></div><div><dt>실제 청구 금액</dt><dd id="result-amount">0원</dd></div></dl><p class="checkout-field-help">실제 청구·골드 지급·선물 발송·정기결제는 발생하지 않습니다.</p><div class="checkout-result-actions"><button class="checkout-primary" id="result-retry" type="button" hidden>테스트 결과 다시 확인</button><a class="checkout-secondary" href="/checkout/toss/gold">새 골드 결제 테스트</a><a href="/#home">음악으로 돌아가기</a></div></section>
  <noscript><p class="checkout-error">테스트 결제를 확인하려면 브라우저의 JavaScript를 켜주세요.</p></noscript>
  <section class="checkout-information" aria-labelledby="checkout-info-title"><h2 id="checkout-info-title">골드와 테스트 안내</h2><p>골드는 공개 음악·회원에게 선물하거나 AI 더빙 음향 제작에 사용하는 재화입니다. 음향 제작 요청 전 표시된 골드 비용을 확인하며, 제작 실패 시 차감한 골드는 자동 환급됩니다. 골드 구매 가격은 창작자의 정산 단가와 다르며, 선물을 받은 창작자 수익은 세금·실제 결제 수수료·수익 배분 기준을 반영해 별도로 계산합니다. 이 테스트에서는 골드를 지급하거나 수익을 적립하지 않습니다.</p><h3>충전 후 사용과 환불</h3><p>토스로 충전한 웹 골드는 결제시점부터 1년 이내에 사용하거나 환불을 신청할 수 있습니다. 다른 회원에게 골드 잔액을 양도할 수 없습니다. 환불은 결제에 사용한 카드로만 처리합니다.</p><p><a href="/#home">공개 음악 선택</a> → 곡의 선물하기 → 골드 선물과 수량 선택 → 보내기. <a href="/#gifts">선물 종류 보기</a></p><h3>테스트 정보 처리</h3><p>카드 정보는 토스페이먼츠의 테스트 결제창에서 처리하며 이 화면에서 AIFECT는 카드번호를 수집하지 않습니다. 테스트 확인 쿠키는 최대 30분, 브라우저 sessionStorage의 서명된 요청 정보는 20분 동안만 유효합니다. 인증 후 돌아온 결제 식별값은 저장하거나 결제 승인에 사용하지 않습니다. 취소·반환 확인 시 세션 요청 정보를 지우며 실제 결제·골드 잔액·정산 기록을 생성하지 않습니다.</p><nav class="checkout-policy-links" aria-label="골드 결제 및 개인정보 안내"><a href="/terms#gold">골드 이용 안내</a><a href="/refund#gold">골드 환불 안내</a>${policyLinks.map(([url,label])=>`<a href="${url}">${label}</a>`).join('')}</nav><details class="checkout-merchant"><summary>판매자 · 고객센터 정보</summary>${businessDetailsHTML()}</details></section>
 </main><footer class="page-footer">${businessFooterHTML()}</footer>
</body></html>`;
}

export function goldPaymentPageRoute(req,path){
 if(!['GET','HEAD'].includes(req.method)||!routes.has(path.replace(/\/$/,'')))return null;
 return new Response(req.method==='HEAD'?null:goldPaymentPage(),{headers:{
  'content-type':'text/html; charset=utf-8','cache-control':'no-store, max-age=0','pragma':'no-cache','x-content-type-options':'nosniff','x-frame-options':'DENY','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; script-src 'self' https://*.tosspayments.com; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' https://*.tosspayments.com; frame-src https://*.tosspayments.com; object-src 'none'; base-uri 'none'; form-action 'self' https://*.tosspayments.com; frame-ancestors 'none'"
 }});
}
