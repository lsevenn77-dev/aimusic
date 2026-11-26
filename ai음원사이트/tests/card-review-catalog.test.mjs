import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as AifectSite from '../shared/site-info.js';
import {publicPage} from '../server/public-pages.js';
import {paymentPageRoute} from '../server/payment-page.js';
const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
function view(){
 const c=vm.createContext({AifectSite,document:{addEventListener(){}},Date,setTimeout,clearTimeout,inApp:false,me:{id:'member'},heading:(a,b)=>`<h1>${a}</h1><p>${b}</p>`,esc:String,number:v=>Number(v).toLocaleString('ko-KR')});
 for(const file of ['membership.js','billing.js','gold-checkout.js'])vm.runInContext(source(file),c);
 return c;
}
test('card review hides recurring sales across public pricing and the common footer',()=>{
 assert.equal(AifectSite.PREMIUM.catalogVisible,false);
 const pricing=publicPage('/pricing');
 assert.doesNotMatch(pricing,/legal-plan premium|id="details"|href="\/checkout\/toss"|Premium 월|매월 4,900원/);
 assert.match(pricing,/href="\/checkout\/toss\/gold"/);
 for(const amount of ['5,500원','11,000원','55,000원'])assert.ok(pricing.includes(amount));
 assert.match(pricing,/구독 수익 배분 기준/); // Retain historical accounting and cancellation policy.
 const footer=AifectSite.businessFooterHTML();
 assert.doesNotMatch(footer,/footer-premium|footer-dot|Premium/);
 assert.match(footer,/사업자등록번호/);assert.match(footer,/href="\/refund"/);
 assert.doesNotMatch(publicPage('/pricing/app'),/id="app-premium"|5,900원/);
 assert.match(publicPage('/pricing/app'),/기존 앱 구독 관리/);
 assert.doesNotMatch(publicPage('/contact'),/Premium은 웹 월/);
 assert.match(publicPage('/refund'),/자동갱신 해지/);
});
test('old Premium test entry redirects to Gold while return handlers remain available',()=>{
 for(const path of ['/checkout/toss','/checkout/toss/'])for(const method of ['GET','HEAD']){
  const response=paymentPageRoute(new Request('https://aifect.test'+path+'?amount=1',{method}),path);
  assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/checkout/toss/gold');
 }
 for(const path of ['/checkout/toss/success','/checkout/toss/fail'])assert.equal(paymentPageRoute(new Request('https://aifect.test'+path),path).status,200);
});
test('ordinary and review accounts cannot start a new subscription, without losing management',async()=>{
 const c=view();
 for(const state of [{checkout_available:true},{review_only:true}]){
  const html=c.membershipHTML({...state,subscription:null,payments:[]});
  assert.match(html,/내 구독 관리/);assert.match(html,/골드 충전 상품 보기/);
  assert.doesNotMatch(html,/data-billing-subscribe|membership-premium-title|정기결제<\/a>|토스 TEST 카드 등록/);
 }
 await assert.rejects(c.openBillingCheckout(),/신규 정기결제 상품은 제공하지 않습니다/);
 const html=c.membershipHTML({subscription:{state:'active',renewing:true,period_end:Math.floor(Date.now()/1000)+86400,price:4900},payments:[{id:'existing',status:'paid',amount:4900}]});
 for(const value of ['data-billing-cancel','data-billing-refresh','결제 내역','4,900원'])assert.ok(html.includes(value));
 assert.doesNotMatch(html,/data-billing-subscribe/);
});
test('home adds app downloads, keeps the seven current service banners and hides only the Premium promotion',()=>{
 const c=vm.createContext({AifectSite});vm.runInContext(source('home.js'),c);
 assert.deepEqual(Array.from(vm.runInContext('homeBanners',c),b=>b.id),['open-event','app-download','studio','play','participate','artists','karaoke','talking','crew']);
});

test('the web review catalog flag does not alter native app subscription entry',()=>{
 const c=view();c.inApp=true;
 assert.match(c.billingHTML({checkout_available:true,subscription:null,payments:[]}),/data-billing-subscribe/);
});
