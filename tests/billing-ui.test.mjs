import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PREMIUM} from '../shared/site-info.js';
import {publicPage} from '../server/public-pages.js';

function billingView(data){
 const context=vm.createContext({document:{addEventListener(){}},Date,member:{plan:'free'},me:{id:'owner'},AifectSite:{PREMIUM:{...PREMIUM,catalogVisible:true}},esc:String,number:v=>Number(v).toLocaleString('ko-KR')});
 vm.runInContext(fs.readFileSync(new URL('../dist/billing.js',import.meta.url),'utf8'),context);
 return context.billingHTML(data);
}
test('new subscription entry uses the server price while renewing subscriptions show their own price',()=>{
 const fresh=billingView({price:5900,checkout_available:true,subscription:null});
 assert.match(fresh,/월 5,900원으로 시작하기/);
 const legacy=billingView({price:5900,subscription:{state:'active',renewing:true,price:4900,period_end:Math.floor(Date.now()/1000)+86400},payments:[{id:'old',amount:4900,status:'paid'}]});
 assert.match(legacy,/다음 결제일[^<]*4,900원/);assert.doesNotMatch(legacy,/다음 결제일[^<]*5,900원/);
 assert.match(legacy,/<td>4,900원/);
});
test('public pricing and refund examples agree with the current subscription policy',()=>{
 for(const route of ['/pricing','/terms']){
  const html=publicPage(route,{premiumCatalogVisible:true});assert.match(html,/4,900원/);
 }
 const html=publicPage('/pricing');assert.match(html,/순매출의 50%/);assert.match(html,/50%를 플랫폼/);assert.match(html,/운영자가 월별 실제 결제/);
 assert.match(publicPage('/refund'),/1,633원을 공제하고 3,267원을 환불/);
});

test('Premium review entry navigates to Toss TEST before requesting NICEPAY terms or card details',async()=>{
 const calls=[],navigations=[],dialogs=[];
 const context=vm.createContext({document:{addEventListener(){}},me:{id:'review'},dialog:html=>dialogs.push(html),api:async path=>{calls.push(path);return{review_only:true,checkout_available:false};},location:{assign:path=>navigations.push(path)}});
 vm.runInContext(fs.readFileSync(new URL('../dist/billing.js',import.meta.url),'utf8'),context);
 await context.openBillingCheckout();
 assert.deepEqual(calls,['/api/billing/status']);assert.deepEqual(navigations,['/checkout/toss']);
 assert.ok(dialogs.every(html=>!html.includes('cardNo')));
 const html=billingView({review_only:true,checkout_available:false});assert.match(html,/토스 TEST/);assert.doesNotMatch(html,/NICEPAY/);
});

test('Gold review entry routes only to Toss, never creates a legacy order or loads the NICEPAY SDK',async()=>{
 const calls=[],navigations=[];
 const context=vm.createContext({document:{addEventListener(){}},me:{id:'review'},inApp:false,renderId:1,api:async path=>{calls.push(path);return{review_only:true,checkout_available:false,web_packs:[{gold:500,price:5500,total_gold:525}]};},location:{assign:path=>navigations.push(path)}});
 vm.runInContext(fs.readFileSync(new URL('../dist/gold-checkout.js',import.meta.url),'utf8'),context);
 await context.openGoldCheckout(500);
 assert.deepEqual(calls,['/api/gold']);assert.deepEqual(navigations,['/checkout/toss/gold?gold=500']);
 navigations.length=0;context.inApp=true;
 await assert.rejects(context.openGoldCheckout(500),/앱 내 골드/);assert.deepEqual(navigations,[]);
});

test('ordinary and expired review users can discover the public TEST path without real checkout permissions',async()=>{
 const data={checkout_available:false,review_only:false,test_checkout_available:true,web_packs:[{gold:1000,price:11000,total_gold:1050,bonus_gold:50}],balance:0};
 const calls=[],navigations=[];
 const context=vm.createContext({document:{addEventListener(){}},me:{id:'ordinary'},inApp:false,renderId:1,heading:()=>'',number:String,esc:String,AifectGifts:{GIFT_SETTLEMENT_NOTICE:''},api:async path=>{calls.push(path);return data;},location:{assign:path=>navigations.push(path)}});
 vm.runInContext(fs.readFileSync(new URL('../dist/gold-checkout.js',import.meta.url),'utf8'),context);
 const html=context.goldHTML(data);
 assert.match(html,/data-buy-gold="1000" >TEST 주문서/);
 assert.match(html,/실제 충전은 준비 중/);
 assert.doesNotMatch(html,/href="#membership"|Premium · 정기결제/);
 await context.openGoldCheckout(1000);
 assert.deepEqual(calls,['/api/gold']);
 assert.deepEqual(navigations,['/checkout/toss/gold?gold=1000']);
 data.test_checkout_available=false;
 assert.match(context.goldHTML(data),/data-buy-gold="1000" disabled>결제 준비 중/);
 await assert.rejects(context.openGoldCheckout(1000),/골드 충전 준비 중/);
 context.inApp=true;data.test_checkout_available=true;data.packs=data.web_packs;
 assert.doesNotMatch(context.goldHTML(data),/>TEST 주문서/);
 await assert.rejects(context.openGoldCheckout(1000),/앱 내 골드/);
 assert.deepEqual(navigations,['/checkout/toss/gold?gold=1000']);
});
