import test,{before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {tossTestCheckoutRoute} from '../server/toss-test-checkout.js';
import {PREMIUM} from '../shared/site-info.js';

const ORIGIN='https://aifect.test',ROOT='/api/payments/toss-test',FLOW='billing_auth_preview';
const CLIENT='test_ck_fixture_client',PEPPER='fixture-auth-pepper-for-state-only',MID='fixture_test_merchant';
let outgoing=0;const originalFetch=globalThis.fetch;
before(()=>{globalThis.fetch=async()=>{outgoing++;throw new Error('No provider requests are allowed in a screen preview');};});
afterEach(()=>assert.equal(outgoing,0,'no request path may contact a provider'));
after(()=>{globalThis.fetch=originalFetch;});
function setup(overrides={}){
 let forbiddenAccess=0;
 const env={TOSS_TEST_CHECKOUT_ENABLED:'true',TOSS_TEST_CLIENT_KEY:CLIENT,TOSS_TEST_MID:MID,AUTH_PEPPER:PEPPER,...overrides};
 for(const name of ['DB','TOSS_TEST_SECRET_KEY','TOSS_TEST_HTTP'])Object.defineProperty(env,name,{get(){forbiddenAccess++;throw new Error('Screen preview must not access '+name);}});
 const call=async(path,method='GET',body,options={})=>{
  const headers={...(method==='GET'?{}:{Origin:ORIGIN,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin'}),...options.headers};
  const request=new Request((options.origin||ORIGIN)+path,{method,headers,...(body===undefined?{}:{body:options.raw?body:JSON.stringify(body)})});
  const response=await tossTestCheckoutRoute(request,env,path);
  if(!response)return {response,status:null,body:null};
  return {response,status:response.status,body:await response.json()};
 };
 const create=(extra={},options={})=>call(ROOT+'/orders','POST',{consent:true,...extra},options);
 const authReturn=(order,extra={},options={})=>call(ROOT+'/auth-return','POST',{order_token:order.body.order_token,customerKey:order.body.payment.customerKey,authKey:'opaque-unverified-auth-return',...extra},{...options,headers:{Cookie:order.response.headers.get('set-cookie').split(';')[0],...options.headers}});
 return {env,call,create,authReturn,untouched:()=>assert.equal(forbiddenAccess,0,'no DB, provider HTTP adapter or Toss secret may be accessed')};
}
function signedToken(order,changes){
 const payload={...JSON.parse(Buffer.from(order.body.order_token.split('.')[0],'base64url').toString('utf8')),...changes};
 const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const key=createHmac('sha256',PEPPER).update('AIFECT:TOSS-TEST:BILLING-AUTH-PREVIEW:SIGNING:v1').digest();
 const signature=createHmac('sha256',key).update('AIFECT:TOSS-TEST:BILLING-AUTH-PREVIEW:ORDER:v1:'+encoded).digest('base64url');
 return encoded+'.'+signature;
}

test('public config exposes only Premium monthly screen-preview readiness and server price',async()=>{
 const f=setup(),r=await f.call(ROOT+'/config');
 assert.equal(r.status,200);
 assert.deepEqual(r.body,{available:true,test_only:true,flow:FLOW,price:PREMIUM.price,currency:'KRW',interval:'month',client_key:CLIENT});
 assert.equal(r.body.price,4900);
 const output=JSON.stringify(r.body);for(const hidden of [MID,PEPPER,'TOSS_TEST_','products','gold','secret'])assert.equal(output.includes(hidden),false);
 assert.match(r.response.headers.get('cache-control'),/no-store/);assert.equal(r.response.headers.get('set-cookie'),null);
 assert.equal((await f.call('/api/gold/checkout')).response,null);assert.equal((await f.call(ROOT+'/unknown')).status,404);
 assert.equal((await f.call(ROOT+'/confirm','POST',{})).status,404,'previous purchase confirmation API is removed');
 f.untouched();
});

test('explicit flag, test client key, merchant and state-signing pepper gate every mutation',async()=>{
 const invalid=[{TOSS_TEST_CHECKOUT_ENABLED:'false'},{TOSS_TEST_CHECKOUT_ENABLED:true},{TOSS_TEST_CLIENT_KEY:''},{TOSS_TEST_CLIENT_KEY:'live_ck_client'},{TOSS_TEST_CLIENT_KEY:'test_gck_widget'},{TOSS_TEST_CLIENT_KEY:CLIENT+'\n'},{TOSS_TEST_MID:undefined},{TOSS_TEST_MID:''},{TOSS_TEST_MID:'merchant unsafe'},{TOSS_TEST_MID:'merchant/path'},{TOSS_TEST_MID:'m'.repeat(101)},{AUTH_PEPPER:undefined},{AUTH_PEPPER:'short'}];
 for(const extra of invalid){
  const f=setup(extra),config=await f.call(ROOT+'/config');
  assert.equal(config.body.available,false,JSON.stringify(extra));assert.equal(config.body.client_key,null);
  assert.equal((await f.create()).status,503);assert.equal((await f.call(ROOT+'/auth-return','POST',{})).status,503);f.untouched();
 }
});

test('config makes no contract guess from a merchant prefix and needs no Toss secret',async()=>{
 for(const merchant of ['bill_fixture_mid','card_fixture_mid','fixture-normal-mid']){
  const f=setup({TOSS_TEST_MID:merchant}),r=await f.call(ROOT+'/config');
  assert.equal(r.status,200);assert.equal(r.body.available,true);assert.equal(JSON.stringify(r.body).includes(merchant),false);f.untouched();
 }
});

test('guest state is signed, short-lived and bound to a secure HttpOnly browser cookie',async()=>{
 const f=setup(),r=await f.create();assert.equal(r.status,201);assert.equal(r.body.test_only,true);assert.equal(r.body.flow,FLOW);
 assert.equal(r.body.order.amount,PREMIUM.price);assert.equal(r.body.order.currency,'KRW');assert.equal(r.body.order.interval,'month');assert.match(r.body.order.id,/^abt_[a-f0-9]{32}$/);
 const p=r.body.payment;assert.deepEqual(Object.keys(p).sort(),['clientKey','customerKey','failUrl','method','successUrl']);
 assert.equal(p.clientKey,CLIENT);assert.match(p.customerKey,/^abp_[a-f0-9]{32}$/);assert.equal(p.method,'CARD');
 assert.equal(p.successUrl,ORIGIN+'/checkout/toss/success');assert.equal(p.failUrl,ORIGIN+'/checkout/toss/fail');
 assert.match(r.response.headers.get('set-cookie'),/^__Host-aifect_toss_test=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=1800$/);
 const payload=JSON.parse(Buffer.from(r.body.order_token.split('.')[0],'base64url').toString('utf8'));
 assert.equal(payload.expiresAt-payload.issuedAt,1200);assert.equal(payload.test_only,true);assert.equal(payload.flow,FLOW);assert.equal(payload.origin,ORIGIN);assert.equal(payload.merchantId,MID);
 assert.equal(JSON.stringify(r.body).includes(PEPPER),false);
 const other=await f.create({}, {headers:{Cookie:r.response.headers.get('set-cookie').split(';')[0]}});
 assert.equal(other.response.headers.get('set-cookie'),r.response.headers.get('set-cookie'),'multiple screen requests retain the browser binding');
 assert.notEqual(other.body.order.id,r.body.order.id);assert.notEqual(other.body.payment.customerKey,p.customerKey);f.untouched();
});

test('cross-origin, non-JSON, malformed and oversized requests cannot create return state',async()=>{
 const f=setup();
 for(const headers of [{Origin:'https://foreign.test'},{Origin:''},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'}])assert.equal((await f.create({}, {headers})).status,403);
 assert.equal((await f.create({}, {headers:{'Content-Type':'text/plain'}})).status,415);
 for(const raw of ['{','null','[]'])assert.equal((await f.call(ROOT+'/orders','POST',raw,{raw:true})).status,400);
 assert.equal((await f.call(ROOT+'/orders','POST','x'.repeat(4097),{raw:true})).status,413);
 assert.equal((await f.call(ROOT+'/orders','POST','{}',{raw:true,headers:{'Content-Length':'5000'}})).status,413);
 assert.equal((await f.call(ROOT+'/orders','GET')).status,405);assert.equal((await f.call(ROOT+'/auth-return','GET')).status,405);assert.equal((await f.call(ROOT+'/config','POST',{})).status,405);
 const order=await f.create();assert.equal((await f.authReturn(order,{}, {headers:{Origin:'https://foreign.test'}})).status,403);f.untouched();
});

test('screen requests require consent and cannot select gold, prices, payment or card fields',async()=>{
 const f=setup();
 for(const extra of [{consent:false},{consent:'true'},{gold:500},{amount:1},{amount:4900},{currency:'USD'},{method:'TRANSFER'},{card:{cardNo:'private'}},{billingKey:'unrequested'}])assert.equal((await f.create(extra)).status,400,JSON.stringify(extra));
 assert.equal((await f.call(ROOT+'/orders','POST',{})).status,400);f.untouched();
});

test('auth return requires our signed, unexpired, origin-bound browser state',async()=>{
 const f=setup(),o=await f.create(),other=await f.create();
 for(const token of ['',null,'bad.token',o.body.order_token+'.extra',o.body.order_token.slice(0,-4)+'xxxx'])assert.equal((await f.authReturn(o,{order_token:token})).status,403);
 assert.equal((await f.authReturn(o,{}, {headers:{Cookie:''}})).status,403);
 assert.equal((await f.authReturn(o,{}, {headers:{Cookie:other.response.headers.get('set-cookie').split(';')[0]}})).status,403);
 const cookie=o.response.headers.get('set-cookie').split(';')[0];assert.equal((await f.authReturn(o,{}, {headers:{Cookie:cookie+'; '+cookie}})).status,403);
 const payload=JSON.parse(Buffer.from(o.body.order_token.split('.')[0],'base64url').toString('utf8')),at=Math.floor(Date.now()/1000);
 for(const changes of [{issuedAt:at-1201,expiresAt:at-1},{issuedAt:at+100,expiresAt:at+1300},{expiresAt:payload.expiresAt+1},{test_only:false},{v:2},{flow:'payment'},{merchantId:'different-merchant'},{origin:'https://foreign.test'},{binding:'wrong'},{amount:1},{currency:'USD'},{interval:'year'},{orderId:'ag_paid'},{customerKey:'bad'}])assert.equal((await f.authReturn(o,{order_token:signedToken(o,changes)})).status,403,JSON.stringify(changes));
 assert.equal((await f.authReturn(o,{}, {origin:'https://another.test',headers:{Origin:'https://another.test'}})).status,403);f.untouched();
});

test('returned customer identity must match and opaque auth keys are bounded and never reflected',async()=>{
 const f=setup(),o=await f.create();
 for(const extra of [{customerKey:'different'},{customerKey:undefined},{authKey:''},{authKey:null},{authKey:'x'.repeat(201)},{authKey:'has\ncontrol'},{billingKey:'unrequested'},{paymentKey:'unrequested'}])assert.equal((await f.authReturn(o,extra)).status,400,JSON.stringify(extra));
 const r=await f.authReturn(o,{authKey:'<script>opaque-not-provider-verified</script>'});assert.equal(r.status,200);
 assert.equal(JSON.stringify(r.body).includes('opaque-not-provider-verified'),false);f.untouched();
});

test('existing state cannot bypass disablement, live keys, signing-key rotation or merchant changes',async()=>{
 for(const [changes,status] of [[{TOSS_TEST_CHECKOUT_ENABLED:'false'},503],[{TOSS_TEST_CLIENT_KEY:'live_ck_changed'},503],[{AUTH_PEPPER:'rotated-auth-pepper-for-state'},403],[{TOSS_TEST_MID:'different-merchant'},403]]){
  const f=setup(),o=await f.create();Object.assign(f.env,changes);assert.equal((await f.authReturn(o)).status,status);f.untouched();
 }
});

test('a plausible forged auth key only records an unverified return and never proves card registration',async()=>{
 const f=setup(),o=await f.create(),r=await f.authReturn(o,{authKey:'forged-not-from-toss'});
 assert.equal(r.status,200);
 assert.deepEqual(r.body,{test_only:true,flow:FLOW,status:'AUTH_RETURNED',provider_verified:false,entitlements_granted:false,order:o.body.order});
 const output=JSON.stringify(r.body);for(const hidden of ['forged-not-from-toss','billingKey','cardNo',PEPPER,MID])assert.equal(output.includes(hidden),false);
 assert.notEqual(r.body.status,'DONE');assert.notEqual(r.body.status,'REGISTERED');assert.equal(r.body.provider_verified,false);f.untouched();
});

test('duplicate and concurrent returns have no database, billing-key, charge or entitlement path',async()=>{
 const f=setup(),o=await f.create(),responses=await Promise.all([f.authReturn(o),f.authReturn(o),f.authReturn(o)]);
 assert.deepEqual(responses.map(r=>r.status),[200,200,200]);
 for(const r of responses){assert.equal(r.body.provider_verified,false);assert.equal(r.body.entitlements_granted,false);assert.equal(r.body.status,'AUTH_RETURNED');}
 f.untouched();
});

test('invented auth callbacks without our signed order cannot create a verified result',async()=>{
 const f=setup();
 const r=await f.call(ROOT+'/auth-return','POST',{customerKey:'invented',authKey:'invented'});
 assert.equal(r.status,403);assert.equal(r.body.provider_verified,undefined);assert.equal(r.body.status,undefined);assert.equal(r.body.entitlements_granted,undefined);f.untouched();
});
