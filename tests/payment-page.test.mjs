import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paymentPageRoute} from '../server/payment-page.js';
import {publicPage} from '../server/public-pages.js';
import {PREMIUM,businessDetailsHTML,businessFooterHTML,policyLinks} from '../shared/site-info.js';

const request=(path='/checkout/toss',method='GET')=>new Request('https://aifect.test'+path,{method});
const html=()=>paymentPageRoute(request(),'/checkout/toss').text();

test('Premium product image uses a real same-origin asset with an accessible product description',async()=>{
 const page=await html(),image=page.match(/<img\b[^>]*class="checkout-product-image"[^>]*>/)?.[0];
 assert.ok(image,'Premium product image is rendered');
 const path=image.match(/src="([^"]+)"/)?.[1];
 assert.equal(new URL(path,'https://aifect.test/checkout/toss').origin,'https://aifect.test');
 assert.equal(path,'/assets/aifect-premium-product.svg');
 assert.match(image,/alt="AIFECT Premium 월 정기구독 이용권"/);
 const asset=readFileSync(new URL('../dist'+path,import.meta.url),'utf8');
 assert.match(asset,/<svg\b/);
 assert.match(asset,/viewBox="[^"]+"/);
});

test('public pricing exposes the test route and privacy states its limited Toss processing',()=>{
 const pricing=publicPage('/pricing'),privacy=publicPage('/privacy');
 assert.ok(pricing.includes('href="/checkout/toss"'));
 assert.ok(pricing.includes('실제 청구·자동결제·이용권 지급은 없습니다'));
 assert.ok(privacy.includes('토스페이먼츠(TEST 심사용)'));
 assert.ok(privacy.includes('테스트 확인 쿠키는 최대 30분'));
 assert.ok(privacy.includes('20분 동안만 유효'));
 assert.ok(privacy.includes('반환 인증 요청값을 저장하거나 승인에 사용하지 않습니다'));
 assert.ok(privacy.includes('테스트 완료는 실제 카드 등록·결제·구독 시작을 의미하지 않습니다'));
});

test('standalone checkout renders the authoritative monthly Premium product and test-only registration',async()=>{
 const page=await html(),price=PREMIUM.price.toLocaleString('ko-KR');
 assert.ok(page.includes(`<h2 id="premium-title">${PREMIUM.name}</h2>`));
 assert.ok(page.includes(`<dd id="premium-price">${price}원</dd>`));
 assert.ok(page.includes(`매월 ${price}원(부가세 포함)이 정기결제됩니다`));
 assert.ok(page.includes('해당 월에 같은 날짜가 없으면 그 달의 마지막 날'));
 assert.ok(page.includes('실제 가입 시 이용 시작일과 다음 결제일을 결제 전에 안내'));
 assert.match(page,/이번 테스트 실제 청구<\/dt><dd>0원</);
 assert.match(page,/id="checkout-submit"[^>]+ disabled>토스 테스트 카드 등록창 열기</);
 assert.match(page,/id="checkout-consent"[^>]+type="checkbox" required>/);
 assert.doesNotMatch(page,/id="checkout-consent"[^>]+checked/);
 assert.doesNotMatch(page,/name="gold"|골드|WEB_GOLD_PACKS|id="checkout-amount"/);
});

test('checkout and both callbacks use identical safe HTML and ignore all request data',async()=>{
 const expected=await html();
 for(const path of ['/checkout/toss','/checkout/toss/','/checkout/toss/success','/checkout/toss/fail']){
  const req=request(path+'?amount=1&customerKey=%3Cscript%3E&authKey=private-key');
  const response=paymentPageRoute(req,path);
  assert.equal(response.status,200);
  assert.equal(await response.text(),expected);
  const head=paymentPageRoute(request(path,'HEAD'),path);
  assert.equal(await head.text(),'');
  assert.deepEqual([...head.headers],[...response.headers]);
 }
 assert.equal(paymentPageRoute(request('/checkout/toss','POST'),'/checkout/toss'),null);
 for(const path of ['/checkout','/checkout/toss/other','/api/gold/checkout','/api/payments/toss-test/config','/pricing','/'])assert.equal(paymentPageRoute(request(path),path),null);
 assert.equal(expected.includes('private-key'),false);
});

test('checkout has static restrictive headers and no executable inline content',async()=>{
 const response=paymentPageRoute(request(),'/checkout/toss'),page=await response.text();
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
 assert.match(response.headers.get('cache-control'),/no-store/);
 assert.equal(response.headers.get('x-frame-options'),'DENY');
 const csp=response.headers.get('content-security-policy');
 assert.match(csp,/default-src 'none'/);
 assert.match(csp,/script-src 'self' https:\/\/\*\.tosspayments\.com;/);
 assert.match(csp,/connect-src 'self' https:\/\/\*\.tosspayments\.com;/);
 assert.match(csp,/frame-src https:\/\/\*\.tosspayments\.com;/);
 assert.match(csp,/frame-ancestors 'none'/);
 assert.doesNotMatch(csp,/unsafe-inline|unsafe-eval|https:\/\/\*;/);
 const scripts=[...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.match(scripts[0][1],/type="module" src="\/payment-checkout\.js"/);
 assert.equal(scripts[0][2],'');
 assert.doesNotMatch(page,/\son[a-z]+\s*=|\sstyle\s*=|javascript:|test_[cs]k_/i);
 for(const stylesheet of ['/design-system.css','/policies.css','/brand.css','/payment-checkout.css'])assert.ok(page.includes(stylesheet));
});

test('test disclosure, callback states and client selectors preserve the existing NICE checkout',async()=>{
 const page=await html();
 for(const id of ['checkout-form','checkout-order','checkout-status','checkout-error','checkout-result','result-title','result-copy','result-order-id','result-amount','result-retry'])assert.ok(page.includes(`id="${id}"`),id);
 assert.match(page,/id="checkout-status" role="status"/);
 assert.match(page,/id="checkout-error" role="alert" hidden/);
 assert.match(page,/id="checkout-result"[^>]* hidden/);
 assert.match(page,/id="result-retry"[^>]* hidden/);
 for(const text of ['TEST ONLY','실제 청구 없음','실제 청구, 자동결제, Premium 이용권 지급은 발생하지 않습니다','테스트 카드 등록 인증 후 돌아온 요청','sessionStorage','20분','AIFECT는 카드번호를 수집하지 않습니다'])assert.ok(page.includes(text),text);
 assert.ok(page.includes(businessDetailsHTML()));
 assert.ok(page.includes(businessFooterHTML()));
 for(const [url] of policyLinks)assert.ok(page.includes(`href="${url}"`));
 assert.ok(page.includes('/assets/aifect-wordmark.svg'));
 assert.doesNotMatch(page,/NICEPAY|AUTHNICE|name="(?:cardNumber|card|billingKey)"/);
 const existing=readFileSync(new URL('../dist/gold-checkout.js',import.meta.url),'utf8');
 assert.match(existing,/window\.AUTHNICE\.requestPay/);
 assert.match(existing,/api\('\/api\/gold\/checkout'/);
});
