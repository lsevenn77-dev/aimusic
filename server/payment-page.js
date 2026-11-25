import {brandPublicMarkup} from '../shared/web-brand.js';
import {PREMIUM, premiumBenefitItemsHTML, businessDetailsHTML, businessFooterHTML, policyLinks, escapeHTML as esc} from '../shared/site-info.js';

const routes=new Set(['/checkout/toss','/checkout/toss/success','/checkout/toss/fail']);
const number=value=>value.toLocaleString('ko-KR');
const policyNavigation=()=>policyLinks.map(([url,label])=>`<a href="${url}">${label}</a>`).join('');

function paymentPage(){
 return `<!doctype html>
<html lang="ko">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width,initial-scale=1">
 <meta name="robots" content="noindex,nofollow">
 <meta name="referrer" content="no-referrer">
 <meta name="theme-color" content="#0c121b">
 <title>Premium 정기결제 테스트 | AIFECT</title>
 <link rel="stylesheet" href="/brand.css?v=20261007-reference">
 <link rel="stylesheet" href="/design-system.css?v=20261017-lavender-mint">
 <link rel="stylesheet" href="/policies.css">
 <link rel="stylesheet" href="/payment-checkout.css">
 <script type="module" src="/payment-checkout.js"></script>
</head>
<body class="checkout-site">
 <header class="checkout-header">
  <a class="checkout-brand" href="/#home" aria-label="AIFECT 홈"><span class="aifect-lockup"><img class="aifect-wordmark-logo" src="/assets/brand/20261117/aifect-wordmark-horizontal.webp" width="1044" height="227" alt="AIFECT"></span></a>
  <a href="/#home">음악으로 돌아가기</a>
 </header>
 <main class="checkout-main">
  <header class="checkout-heading">
   <p class="checkout-kicker">TOSS PAYMENTS · TEST ONLY</p>
   <h1>Premium 정기결제 테스트</h1>
   <p class="checkout-lead">토스페이먼츠의 테스트 카드 등록 흐름을 확인하세요.</p>
  </header>
  <div class="checkout-test-note" id="checkout-test-note">
   <strong>테스트 전용 · 실제 청구 없음</strong>
   <p>테스트 카드 등록 인증만 진행합니다. 실제 청구, 자동결제, Premium 이용권 지급은 발생하지 않습니다.</p>
  </div>
  <p class="checkout-status" id="checkout-status" role="status" aria-live="polite">테스트 결제 가능 여부를 확인하고 있습니다.</p>
  <p class="checkout-error" id="checkout-error" role="alert" hidden></p>
  <section id="checkout-order" aria-label="Premium 테스트 카드 등록">
   <form id="checkout-form" aria-describedby="checkout-test-note">
    <div class="checkout-layout">
     <section class="checkout-product" aria-labelledby="premium-title">
      <img class="checkout-product-image" src="/assets/aifect-premium-product.svg" width="120" height="120" alt="AIFECT Premium 월 정기구독 이용권">
      <p class="checkout-kicker">PREMIUM · 월 정기구독</p>
      <h2 id="premium-title">${esc(PREMIUM.name)}</h2>
      <p class="checkout-product-price">월 ${number(PREMIUM.price)}원 <small>부가세 포함</small></p>
      <p class="checkout-product-copy">음악을 더 편하게 듣고, 더 많이 모아 보세요.</p>
      <ul class="checkout-benefits">${premiumBenefitItemsHTML()}</ul>
      <p class="checkout-field-help">고음질 준비 중인 곡은 AAC 128kbps로 제공됩니다. 플레이리스트 생성과 공개 플레이리스트 저장에는 개수 제한이 없습니다.</p>
      <div class="checkout-billing-info"><h3>실제 구독의 결제 주기</h3><p>월 단위 자동갱신 상품으로 매월 ${number(PREMIUM.price)}원(부가세 포함)이 정기결제됩니다. 가입일부터 1개월마다 갱신되며, 해당 월에 같은 날짜가 없으면 그 달의 마지막 날을 기준으로 합니다.</p><p id="premium-next-billing-copy">실제 가입 시 이용 시작일과 다음 결제일을 결제 전에 안내합니다. 이 테스트는 구독을 시작하거나 자동결제를 예약하지 않습니다.</p><p>다음 결제 전 언제든 해지를 요청할 수 있습니다. 해지·청약철회·이용 중 환불 기준은 <a href="/refund">환불 · 해지 정책</a>에서 확인하세요.</p></div>
     </section>
     <section class="checkout-summary" aria-labelledby="checkout-summary-title">
      <div class="checkout-summary-heading"><h2 id="checkout-summary-title">테스트 진행 확인</h2></div>
      <dl class="checkout-totals">
       <div><dt>상품</dt><dd>Premium</dd></div>
       <div><dt>결제 주기</dt><dd>매월</dd></div>
       <div class="checkout-monthly-price"><dt>상품 월 이용료<small>부가세 포함</small></dt><dd id="premium-price">${number(PREMIUM.price)}원</dd></div>
       <div class="checkout-total-amount"><dt>이번 테스트 실제 청구</dt><dd>0원</dd></div>
      </dl>
      <p class="checkout-field-help">토스페이먼츠 테스트 카드 등록 인증<br>실제 카드 결제·Premium 활성화 없음</p>
      <label class="checkout-consent" for="checkout-consent"><input id="checkout-consent" name="consent" type="checkbox" required><span>TEST 전용 카드 등록 확인이며 실제 청구·자동결제·Premium 지급이 없음을 확인했습니다.</span></label>
      <button class="checkout-primary" id="checkout-submit" type="submit" disabled>토스 테스트 카드 등록창 열기</button>
      <p class="checkout-fine">위 확인은 테스트 진행을 위한 것으로, 실제 Premium 구독이나 정기결제에 대한 동의가 아닙니다.</p>
     </section>
    </div>
   </form>
  </section>
  <section class="checkout-result" id="checkout-result" aria-labelledby="result-title" hidden>
   <p class="checkout-kicker">TEST ONLY</p>
   <h2 id="result-title">테스트 카드 등록 결과 확인</h2>
   <p id="result-copy">테스트 카드 등록 인증 후 돌아온 요청을 확인하고 있습니다.</p>
   <dl class="checkout-result-details"><div><dt>테스트 요청번호</dt><dd id="result-order-id">—</dd></div><div><dt>실제 청구 금액</dt><dd id="result-amount">0원</dd></div></dl>
   <p class="checkout-field-help">실제 청구·자동결제·Premium 이용권 지급은 발생하지 않습니다.</p>
   <div class="checkout-result-actions"><button class="checkout-primary" id="result-retry" type="button" hidden>테스트 결과 다시 확인</button><a class="checkout-secondary" href="/checkout/toss">새 카드 등록 테스트</a><a href="/#home">음악으로 돌아가기</a></div>
  </section>
  <noscript><p class="checkout-error">테스트 결제를 확인하려면 브라우저의 JavaScript를 켜 주세요.</p></noscript>
  <section class="checkout-information" aria-labelledby="checkout-info-title">
   <h2 id="checkout-info-title">테스트 카드 등록 안내</h2>
   <p>AIFECT Premium 월 정기구독을 위한 카드 등록 절차를 테스트합니다. 카드 등록 인증 후 돌아온 결과를 확인하며, 이 테스트로 결제 승인을 요청하거나 실제 구독을 시작하지 않습니다.</p>
   <h3>테스트 정보 처리</h3>
   <p>카드 인증 정보는 토스페이먼츠의 테스트 카드 등록창에서 처리합니다. 이 화면에서 AIFECT는 카드번호를 수집하지 않습니다. 테스트 요청 확인용 쿠키는 최대 30분, 브라우저 sessionStorage의 요청 정보는 20분 동안만 유효합니다. 취소하거나 반환 요청을 확인하면 세션의 요청 정보를 지웁니다. 실제 결제·자동결제 예약·이용권 기록은 생성하지 않습니다.</p>
   <nav class="checkout-policy-links" aria-label="결제 및 개인정보 안내">${policyNavigation()}</nav>
   <details class="checkout-merchant"><summary>판매자 · 고객센터 정보</summary>${businessDetailsHTML()}</details>
  </section>
 </main>
 <footer class="page-footer">${brandPublicMarkup(businessFooterHTML())}</footer>
</body>
</html>`;
}

export function paymentPageRoute(req,path){
 if(!['GET','HEAD'].includes(req.method)||!routes.has(path.replace(/\/$/,'')))return null;
 if(PREMIUM.catalogVisible===false&&path.replace(/\/$/,'')==='/checkout/toss')return new Response(null,{status:302,headers:{location:'/checkout/toss/gold','cache-control':'no-store, max-age=0'}});
 return new Response(req.method==='HEAD'?null:paymentPage(),{headers:{
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store, max-age=0',
  'pragma':'no-cache',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'x-robots-tag':'noindex, nofollow',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; script-src 'self' https://*.tosspayments.com; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' https://*.tosspayments.com; frame-src https://*.tosspayments.com; object-src 'none'; base-uri 'none'; form-action 'self' https://*.tosspayments.com; frame-ancestors 'none'"
 }});
}
