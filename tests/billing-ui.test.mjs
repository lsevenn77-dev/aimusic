import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PREMIUM} from '../shared/site-info.js';
import {publicPage} from '../server/public-pages.js';

function billingView(data){
 const context=vm.createContext({document:{addEventListener(){}},Date,member:{plan:'free'},me:{id:'owner'},AifectSite:{PREMIUM},esc:String,number:v=>Number(v).toLocaleString('ko-KR')});
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
 for(const route of ['/pricing','/terms','/contact']){
  const html=publicPage(route);assert.match(html,/4,900원/);
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
 assert.deepEqual(calls,['/api/gold']);assert.deepEqual(navigations,['/checkout/toss/gold']);
 navigations.length=0;context.inApp=true;
 await assert.rejects(context.openGoldCheckout(500),/앱 내 골드/);assert.deepEqual(navigations,[]);
});
