import {brandPublicMarkup} from '../shared/web-brand.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {goldPaymentPageRoute} from '../server/gold-payment-page.js';
import {WEB_GOLD_PACKS} from '../shared/gifts.js';
import {businessDetailsHTML,businessFooterHTML,policyLinks} from '../shared/site-info.js';
const req=(path='/checkout/toss/gold',method='GET')=>new Request('https://aifect.test'+path,{method});
const html=()=>goldPaymentPageRoute(req(),'/checkout/toss/gold').text();

test('Gold SSR uses all eligible web packs and clearly distinguishes TEST amounts from charge',async()=>{
 const page=await html();
 assert.equal((page.match(/type="radio"/g)||[]).length,WEB_GOLD_PACKS.length);
 assert.doesNotMatch(page,/110,000원/);
 assert.match(page,/원결제수단|결제에 사용한 카드로만/);
 for(const pack of WEB_GOLD_PACKS){
  assert.ok(page.includes(`value="${pack.gold}" data-price="${pack.price}" data-bonus-gold="${pack.bonus_gold}" data-total-gold="${pack.total_gold}"`));
  assert.ok(page.includes(`${pack.total_gold.toLocaleString('ko-KR')} <small>G</small>`));
  assert.ok(page.includes(`${pack.price.toLocaleString('ko-KR')}원`));
 }
 assert.equal((page.match(/ checked/g)||[]).length,1);
 assert.match(page,/id="checkout-gold-500"[^>]* checked>/);
 for(const [id,text] of [['checkout-total-gold','525 G'],['checkout-base-gold','500 G'],['checkout-bonus-gold','25 G'],['checkout-amount','5,500원']])assert.ok(page.includes(`id="${id}">${text}<`));
 assert.match(page,/이번 테스트 실제 청구<\/dt><dd>0원</);
 assert.match(page,/id="checkout-submit"[^>]* disabled>/);
 assert.match(page,/실제 청구·골드 지급·선물 발송·창작자 정산은 발생하지 않습니다/);
 assert.match(page,/자동충전·정기결제는 없습니다/);
});

test('Gold routes share static safe HTML and never echo callback data or intercept Premium/API routes',async()=>{
 const expected=await html();
 for(const path of ['/checkout/toss/gold','/checkout/toss/gold/','/checkout/toss/gold/success','/checkout/toss/gold/fail']){
  const response=goldPaymentPageRoute(req(path+'?paymentKey=private-key&orderId=%3Cscript%3E&amount=1'),path);
  assert.equal(response.status,200);assert.equal(await response.text(),expected);
  const head=goldPaymentPageRoute(req(path,'HEAD'),path);assert.equal(await head.text(),'');assert.deepEqual([...head.headers],[...response.headers]);
 }
 assert.equal(goldPaymentPageRoute(req('/checkout/toss/gold','POST'),'/checkout/toss/gold'),null);
 for(const path of ['/checkout/toss','/checkout/toss/success','/checkout/toss/fail','/api/payments/toss-gold-test/orders','/api/gold/checkout'])assert.equal(goldPaymentPageRoute(req(path),path),null);
 assert.equal(expected.includes('private-key'),false);
});

test('Gold page applies checkout-only security policy and loads external code without inline execution',async()=>{
 const response=goldPaymentPageRoute(req(),'/checkout/toss/gold'),page=await response.text(),csp=response.headers.get('content-security-policy');
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('x-frame-options'),'DENY');assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('x-robots-tag'),/noindex/);
 for(const rule of ["default-src 'none'","script-src 'self' https://*.tosspayments.com","connect-src 'self' https://*.tosspayments.com","frame-src https://*.tosspayments.com","frame-ancestors 'none'"])assert.ok(csp.includes(rule));
 assert.doesNotMatch(csp,/unsafe-inline|unsafe-eval/);
 const scripts=[...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,1);assert.match(scripts[0][1],/type="module" src="\/gold-payment-checkout\.js"/);assert.equal(scripts[0][2],'');
 assert.doesNotMatch(page,/\son[a-z]+\s*=|\sstyle\s*=|javascript:|test_[cs]k_/i);
 for(const path of ['/payment-checkout.css','/gold-payment-checkout.css','/policies.css','/brand.css','/design-system.css'])assert.ok(page.includes(path));
});

test('Gold page reuses merchant, policy and exact brand assets and exposes accessible result states',async()=>{
 const page=await html();assert.ok(page.includes(businessDetailsHTML()));assert.ok(page.includes(brandPublicMarkup(businessFooterHTML())));
 for(const [url] of policyLinks)assert.ok(page.includes(`href="${url}"`));
 for(const url of ['/refund#gold','/terms#gold'])assert.ok(page.includes(`href="${url}"`));
 assert.doesNotMatch(page,/href="\/checkout\/toss"|Premium 테스트/,'Gold review must not advertise recurring-card testing');
 assert.ok(page.includes('/assets/brand/20261117/aifect-wordmark-horizontal.webp'));
 assert.match(page,/src="\/assets\/aifect-gold-product\.svg"[^>]+alt="AIFECT 골드 충전 상품"/);
 const asset=readFileSync(new URL('../dist/assets/aifect-gold-product.svg',import.meta.url),'utf8');assert.match(asset,/<svg\b/);assert.match(asset,/AIFECT 골드 충전 상품/);
 assert.match(page,/id="checkout-status" role="status"/);assert.match(page,/id="checkout-error" role="alert" hidden/);assert.match(page,/id="checkout-result"[^>]* hidden/);assert.match(page,/id="result-retry"[^>]* hidden/);
 assert.match(page,/AI 더빙 음향 제작/);assert.match(page,/제작 실패 시 차감한 골드는 자동 환급/);assert.match(page,/브라우저 sessionStorage의 서명된 요청 정보는 20분/);
});
