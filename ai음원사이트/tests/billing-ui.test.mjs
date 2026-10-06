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
  const html=publicPage(route);assert.match(html,/5,900원/);assert.doesNotMatch(html,/4,900원/);
 }
 const html=publicPage('/pricing');assert.match(html,/순매출의 50%/);assert.match(html,/50%를 플랫폼/);assert.match(html,/자동 집계와 정산 명세는 준비 중/);
 assert.match(publicPage('/refund'),/1,966원을 공제하고 3,934원을 환불/);
});
