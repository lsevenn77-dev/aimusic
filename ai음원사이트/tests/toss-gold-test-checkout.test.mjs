import test,{before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {tossGoldTestCheckoutRoute} from '../server/toss-gold-test-checkout.js';
import {tossTestCheckoutRoute} from '../server/toss-test-checkout.js';
import {WEB_GOLD_PACKS} from '../shared/gifts.js';

const ORIGIN='https://aifect.test',ROOT='/api/payments/toss-gold-test',FLOW='gold_card_auth_preview';
const CLIENT='test_ck_gold_fixture_client',PEPPER='fixture-auth-pepper-for-gold-state',MID='fixture_gold_test_merchant';
let outgoing=0;const originalFetch=globalThis.fetch;
before(()=>{globalThis.fetch=async()=>{outgoing++;throw new Error('Gold screen preview must never contact a provider');};});
afterEach(()=>assert.equal(outgoing,0,'no Gold screen path may make an outgoing request'));
after(()=>{globalThis.fetch=originalFetch;});
function setup(overrides={}){
 let forbiddenAccess=0;
 const env={TOSS_GOLD_TEST_CHECKOUT_ENABLED:'true',TOSS_GOLD_TEST_CLIENT_KEY:CLIENT,TOSS_GOLD_TEST_MID:MID,AUTH_PEPPER:PEPPER,...overrides};
 for(const name of ['DB','TOSS_GOLD_TEST_SECRET_KEY','TOSS_GOLD_TEST_HTTP','TOSS_TEST_CHECKOUT_ENABLED','TOSS_TEST_CLIENT_KEY','TOSS_TEST_MID','TOSS_TEST_SECRET_KEY','TOSS_TEST_HTTP'])Object.defineProperty(env,name,{get(){forbiddenAccess++;throw new Error('Gold screen must not access '+name);}});
 const call=async(path,method='GET',body,options={})=>{
  const headers={...(method==='GET'?{}:{Origin:ORIGIN,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin'}),...options.headers};
  const request=new Request((options.origin||ORIGIN)+path,{method,headers,...(body===undefined?{}:{body:options.raw?body:JSON.stringify(body)})});
  const response=await tossGoldTestCheckoutRoute(request,env,path);
  if(!response)return {response,status:null,body:null};
  return {response,status:response.status,body:await response.json()};
 };
 const create=(gold=500,extra={},options={})=>call(ROOT+'/orders','POST',{gold,consent:true,...extra},options);
 const authReturn=(order,extra={},options={})=>call(ROOT+'/auth-return','POST',{order_token:order.body.order_token,paymentKey:'opaque-unverified-gold-payment-key',orderId:order.body.order.id,amount:order.body.order.amount,currency:'KRW',...extra},{...options,headers:{Cookie:order.response.headers.get('set-cookie').split(';')[0],...options.headers}});
 return {env,call,create,authReturn,untouched:()=>assert.equal(forbiddenAccess,0,'no DB, provider adapter, Toss secret or Premium configuration may be read')};
}
function signedToken(order,changes){
 const payload={...JSON.parse(Buffer.from(order.body.order_token.split('.')[0],'base64url').toString('utf8')),...changes};
 const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const key=createHmac('sha256',PEPPER).update('AIFECT:TOSS-GOLD-TEST:CARD-AUTH-PREVIEW:SIGNING:v1').digest();
 const signature=createHmac('sha256',key).update('AIFECT:TOSS-GOLD-TEST:CARD-AUTH-PREVIEW:ORDER:v1:'+encoded).digest('base64url');
 return encoded+'.'+signature;
}

test('public Gold config exposes the three eligible web packs and dedicated TEST readiness',async()=>{
 const f=setup(),r=await f.call(ROOT+'/config');
 assert.equal(r.status,200);assert.equal(r.body.available,true);assert.equal(r.body.test_only,true);assert.equal(r.body.flow,FLOW);assert.equal(r.body.currency,'KRW');assert.equal(r.body.client_key,CLIENT);
 assert.deepEqual(r.body.products,WEB_GOLD_PACKS.map(({gold,bonus_gold,total_gold,price})=>({gold,bonus_gold,total_gold,price})));
 assert.deepEqual(r.body.products.map(p=>[p.gold,p.bonus_gold,p.total_gold,p.price]),[[500,25,525,5500],[1000,50,1050,11000],[5000,250,5250,55000]]);
 assert.equal((await f.create(10000)).status,400);
 const output=JSON.stringify(r.body);for(const hidden of [MID,PEPPER,'TOSS_','secret'])assert.equal(output.includes(hidden),false);
 assert.match(r.response.headers.get('cache-control'),/no-store/);assert.equal(r.response.headers.get('set-cookie'),null);
 assert.equal((await f.call('/api/gold/checkout')).response,null);assert.equal((await f.call('/api/payments/toss-test/config')).response,null);
 assert.equal((await f.call(ROOT+'/unknown')).status,404);assert.equal((await f.call(ROOT+'/confirm','POST',{})).status,404,'there is deliberately no approval endpoint');f.untouched();
});

test('only the separate Gold flag, TEST client key, MID and state pepper can enable the screen',async()=>{
 const invalid=[{TOSS_GOLD_TEST_CHECKOUT_ENABLED:'false'},{TOSS_GOLD_TEST_CHECKOUT_ENABLED:true},{TOSS_GOLD_TEST_CLIENT_KEY:''},{TOSS_GOLD_TEST_CLIENT_KEY:undefined},{TOSS_GOLD_TEST_CLIENT_KEY:'live_ck_client'},{TOSS_GOLD_TEST_CLIENT_KEY:'test_gck_widget'},{TOSS_GOLD_TEST_CLIENT_KEY:CLIENT+'\n'},{TOSS_GOLD_TEST_MID:undefined},{TOSS_GOLD_TEST_MID:''},{TOSS_GOLD_TEST_MID:'merchant unsafe'},{TOSS_GOLD_TEST_MID:'merchant/path'},{TOSS_GOLD_TEST_MID:'m'.repeat(101)},{AUTH_PEPPER:undefined},{AUTH_PEPPER:'short'}];
 for(const extra of invalid){
  const f=setup(extra),config=await f.call(ROOT+'/config');assert.equal(config.body.available,false,JSON.stringify(extra));assert.equal(config.body.client_key,null);
  assert.equal((await f.create()).status,503);assert.equal((await f.call(ROOT+'/auth-return','POST',{})).status,503);f.untouched();
 }
 const f=setup({TOSS_GOLD_TEST_CHECKOUT_ENABLED:undefined,TOSS_GOLD_TEST_CLIENT_KEY:undefined,TOSS_GOLD_TEST_MID:undefined});assert.equal((await f.call(ROOT+'/config')).body.available,false);f.untouched();
});

test('merchant prefixes do not imply a contract and cannot cause Premium key fallback',async()=>{
 for(const merchant of ['fixture_gold_mid','card_fixture_mid','bill_fixture_mid']){
  const f=setup({TOSS_GOLD_TEST_MID:merchant}),r=await f.call(ROOT+'/config');assert.equal(r.body.available,true);assert.equal(JSON.stringify(r.body).includes(merchant),false);f.untouched();
 }
});

test('Gold orders use server pack amounts and a dedicated signed short-lived browser state',async()=>{
 const f=setup();
 for(const pack of WEB_GOLD_PACKS){
  const r=await f.create(pack.gold);assert.equal(r.status,201);assert.equal(r.body.test_only,true);assert.equal(r.body.flow,FLOW);
  assert.deepEqual({...r.body.order,id:undefined,expires_at:undefined},{id:undefined,gold:pack.gold,bonus_gold:pack.bonus_gold,total_gold:pack.total_gold,amount:pack.price,currency:'KRW',expires_at:undefined});
  assert.match(r.body.order.id,/^agt_[a-f0-9]{32}$/);
  const p=r.body.payment;assert.equal(p.clientKey,CLIENT);assert.match(p.customerKey,/^agp_[a-f0-9]{32}$/);assert.equal(p.method,'CARD');assert.deepEqual(p.amount,{currency:'KRW',value:pack.price});assert.equal(p.orderId,r.body.order.id);assert.equal(p.orderName,`AIFECT 골드 ${pack.total_gold}G · 테스트`);
  assert.equal(p.successUrl,ORIGIN+'/checkout/toss/gold/success');assert.equal(p.failUrl,ORIGIN+'/checkout/toss/gold/fail');
  assert.match(r.response.headers.get('set-cookie'),/^__Host-aifect_toss_gold_test=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=1800$/);
  const payload=JSON.parse(Buffer.from(r.body.order_token.split('.')[0],'base64url').toString('utf8'));
  assert.equal(payload.expiresAt-payload.issuedAt,1200);assert.equal(payload.test_only,true);assert.equal(payload.flow,FLOW);assert.equal(payload.merchantId,MID);assert.equal(payload.origin,ORIGIN);
  assert.equal(JSON.stringify(r.body).includes(PEPPER),false);
  const result=await f.authReturn(r);assert.equal(result.status,200);assert.equal(result.body.provider_verified,false);assert.equal(result.body.entitlements_granted,false);
 }
 const a=await f.create(),b=await f.create(1000,{}, {headers:{Cookie:a.response.headers.get('set-cookie').split(';')[0]}});
 assert.equal(a.response.headers.get('set-cookie'),b.response.headers.get('set-cookie'));assert.notEqual(a.body.order.id,b.body.order.id);f.untouched();
});

test('unknown products, delivered quantities, client prices and missing consent cannot create Gold state',async()=>{
 const f=setup();
 for(const gold of [525,1050,499,0,-1,500.5,'500',null])assert.equal((await f.create(gold)).status,400,JSON.stringify(gold));
 for(const extra of [{consent:false},{consent:'true'},{price:1},{amount:5500},{bonus_gold:999},{total_gold:999},{currency:'USD'},{method:'TRANSFER'},{card:{cardNo:'private'}},{billingKey:'unrequested'}])assert.equal((await f.create(500,extra)).status,400,JSON.stringify(extra));
 assert.equal((await f.call(ROOT+'/orders','POST',{gold:500})).status,400);assert.equal((await f.call(ROOT+'/orders','POST',{consent:true})).status,400);f.untouched();
});

test('cross-origin, non-JSON and oversized requests cannot open or validate a Gold window',async()=>{
 const f=setup();
 for(const headers of [{Origin:'https://foreign.test'},{Origin:''},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'}])assert.equal((await f.create(500,{}, {headers})).status,403);
 assert.equal((await f.create(500,{}, {headers:{'Content-Type':'text/plain'}})).status,415);
 for(const raw of ['{','null','[]'])assert.equal((await f.call(ROOT+'/orders','POST',raw,{raw:true})).status,400);
 assert.equal((await f.call(ROOT+'/orders','POST','x'.repeat(4097),{raw:true})).status,413);assert.equal((await f.call(ROOT+'/orders','POST','{}',{raw:true,headers:{'Content-Length':'5000'}})).status,413);
 assert.equal((await f.call(ROOT+'/orders','GET')).status,405);assert.equal((await f.call(ROOT+'/auth-return','GET')).status,405);assert.equal((await f.call(ROOT+'/config','POST',{})).status,405);
 const o=await f.create();assert.equal((await f.authReturn(o,{}, {headers:{Origin:'https://foreign.test'}})).status,403);f.untouched();
});

test('signed Gold state rejects token forgery, expired windows, pack changes and cross-browser returns',async()=>{
 const f=setup(),o=await f.create(),other=await f.create();
 for(const token of ['',null,'bad.token',o.body.order_token+'.extra',o.body.order_token.slice(0,-4)+'xxxx'])assert.equal((await f.authReturn(o,{order_token:token})).status,403);
 assert.equal((await f.authReturn(o,{}, {headers:{Cookie:''}})).status,403);assert.equal((await f.authReturn(o,{}, {headers:{Cookie:other.response.headers.get('set-cookie').split(';')[0]}})).status,403);
 const cookie=o.response.headers.get('set-cookie').split(';')[0];assert.equal((await f.authReturn(o,{}, {headers:{Cookie:cookie+'; '+cookie}})).status,403);
 const payload=JSON.parse(Buffer.from(o.body.order_token.split('.')[0],'base64url').toString('utf8')),at=Math.floor(Date.now()/1000);
 for(const changes of [{issuedAt:at-1201,expiresAt:at-1},{issuedAt:at+100,expiresAt:at+1300},{expiresAt:payload.expiresAt+1},{test_only:false},{v:2},{flow:'billing_auth_preview'},{merchantId:'different-merchant'},{origin:'https://foreign.test'},{binding:'wrong'},{gold:1000},{gold:525},{amount:1},{bonus_gold:999},{total_gold:999},{currency:'USD'},{orderId:'ag_paid'},{customerKey:'bad'}])assert.equal((await f.authReturn(o,{order_token:signedToken(o,changes)})).status,403,JSON.stringify(changes));
 assert.equal((await f.authReturn(o,{}, {origin:'https://another.test',headers:{Origin:'https://another.test'}})).status,403);f.untouched();
});

test('Premium tokens and cookies cannot authorize a Gold return even with the same state pepper',async()=>{
 const request=new Request(ORIGIN+'/api/payments/toss-test/orders',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({consent:true})});
 const premium=await tossTestCheckoutRoute(request,{TOSS_TEST_CHECKOUT_ENABLED:'true',TOSS_TEST_CLIENT_KEY:'test_ck_premium_fixture',TOSS_TEST_MID:'fixture_premium_mid',AUTH_PEPPER:PEPPER});assert.equal(premium.status,201);
 const premiumBody=await premium.json(),f=setup(),o=await f.create();
 assert.equal((await f.authReturn(o,{order_token:premiumBody.order_token})).status,403);
 assert.equal((await f.authReturn(o,{}, {headers:{Cookie:premium.headers.get('set-cookie').split(';')[0]}})).status,403);f.untouched();
});

test('returned order, integer amount, currency and opaque payment key must match the signed order',async()=>{
 const f=setup(),o=await f.create();
 for(const extra of [{orderId:'different'},{orderId:undefined},{amount:1},{amount:'5500'},{amount:5500.5},{amount:undefined},{currency:'USD'},{currency:undefined},{paymentKey:''},{paymentKey:null},{paymentKey:'x'.repeat(201)},{paymentKey:'has\ncontrol'},{authKey:'billing-return'},{customerKey:'unrequested'},{billingKey:'unrequested'}])assert.equal((await f.authReturn(o,extra)).status,400,JSON.stringify(extra));
 f.untouched();
});

test('existing Gold state cannot bypass disablement, live keys, signing rotation or merchant changes',async()=>{
 for(const [changes,status] of [[{TOSS_GOLD_TEST_CHECKOUT_ENABLED:'false'},503],[{TOSS_GOLD_TEST_CLIENT_KEY:'live_ck_changed'},503],[{AUTH_PEPPER:'rotated-auth-pepper-for-state'},403],[{TOSS_GOLD_TEST_MID:'different-merchant'},403]]){
  const f=setup(),o=await f.create();Object.assign(f.env,changes);assert.equal((await f.authReturn(o)).status,status);f.untouched();
 }
});

test('a forged opaque payment key can never produce a provider-verified or paid Gold result',async()=>{
 const f=setup(),o=await f.create(),r=await f.authReturn(o,{paymentKey:'forged-not-from-toss'});assert.equal(r.status,200);
 assert.deepEqual(r.body,{test_only:true,flow:FLOW,status:'AUTH_RETURNED',provider_verified:false,entitlements_granted:false,order:o.body.order});
 assert.equal((await f.create(10000)).status,400);
 const output=JSON.stringify(r.body);for(const hidden of ['forged-not-from-toss','billingKey','cardNo',PEPPER,MID])assert.equal(output.includes(hidden),false);
 assert.notEqual(r.body.status,'DONE');assert.notEqual(r.body.status,'PAID');assert.match(r.response.headers.get('cache-control'),/no-store/);f.untouched();
});

test('duplicate and concurrent Gold returns have no wallet, settlement, provider or entitlement effect',async()=>{
 const f=setup(),o=await f.create(),responses=await Promise.all([f.authReturn(o),f.authReturn(o),f.authReturn(o)]);assert.deepEqual(responses.map(r=>r.status),[200,200,200]);
 for(const r of responses){assert.equal(r.body.provider_verified,false);assert.equal(r.body.entitlements_granted,false);assert.equal(r.body.status,'AUTH_RETURNED');}f.untouched();
});

test('invented Gold callbacks without signed browser state cannot report any successful return',async()=>{
 const f=setup(),r=await f.call(ROOT+'/auth-return','POST',{paymentKey:'invented',orderId:'invented',amount:5500,currency:'KRW'});
 assert.equal(r.status,403);assert.equal(r.body.provider_verified,undefined);assert.equal(r.body.status,undefined);assert.equal(r.body.entitlements_granted,undefined);f.untouched();
});
