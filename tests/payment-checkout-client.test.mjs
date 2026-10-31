import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PREMIUM} from '../shared/site-info.js';

const source=readFileSync(new URL('../dist/payment-checkout.js',import.meta.url),'utf8');
const STORAGE='aifect:toss:billing-test:v1';
const ORIGIN='https://aifect.test';
const available={available:true,test_only:true,flow:'billing_auth_preview',price:PREMIUM.price};
const order=()=>({
 test_only:true,flow:'billing_auth_preview',order_token:'signed-order.payload-signature',
 order:{id:'test-request-1',expires_at:Math.floor(Date.now()/1000)+1200},
 payment:{clientKey:'test_ck_local_fixture',customerKey:'test-browser-customer',method:'CARD',successUrl:ORIGIN+'/checkout/toss/success',failUrl:ORIGIN+'/checkout/toss/fail'}
});
const returned={test_only:true,status:'AUTH_RETURNED',provider_verified:false,entitlements_granted:false};
const drain=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));};

async function fixture(options={}){
 const elements=new Map(),calls=[],timeline=[],sdkCalls=[],markupWrites=[],stored=new Map();
 if(options.stored!==undefined)stored.set(STORAGE,options.stored);
 const element=id=>{
  if(elements.has(id))return elements.get(id);
  const listeners=new Map(),value={id,textContent:'',hidden:['checkout-error','checkout-result','result-retry'].includes(id),disabled:['checkout-submit','result-retry'].includes(id),checked:false,
   addEventListener(type,listener){const list=listeners.get(type)||[];list.push(listener);listeners.set(type,list);},
   async dispatch(type){const event={type,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};await Promise.all((listeners.get(type)||[]).map(listener=>listener(event)));await drain();return event;}
  };
  Object.defineProperty(value,'innerHTML',{set(html){markupWrites.push({id,html});},get(){return value.textContent.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}});
  elements.set(id,value);return value;
 };
 const initialURL=new URL(options.path||'/checkout/toss',ORIGIN);
 const location={origin:ORIGIN,pathname:initialURL.pathname,search:initialURL.search,hash:initialURL.hash};
 const sessionStorage={
  getItem(key){if(options.denyStorageRead)throw Error('Storage unavailable');return stored.get(key)||null;},
  setItem(key,value){timeline.push('storage:set');if(options.denyStorageWrite)throw Error('Storage unavailable');stored.set(key,value);},
  removeItem(key){timeline.push('storage:clear');stored.delete(key);}
 };
 const sdk=key=>{
  sdkCalls.push({kind:'client',key});
  return {payment(customer){sdkCalls.push({kind:'customer',customer});return {
   async requestBillingAuth(args){timeline.push('sdk:billing-auth');sdkCalls.push({kind:'billing-auth',args});if(options.billingAuth)return options.billingAuth(args,{stored,timeline});},
   async requestPayment(args){sdkCalls.push({kind:'payment',args});throw Error('Real payment must never be requested');}
  };}};
 };
 const window={};
 Object.defineProperty(window,'TossPayments',{get(){timeline.push('sdk:read');return options.missingSDK?undefined:sdk;}});
 const fetch=async(url,init)=>{
  timeline.push('fetch:'+url);
  const call={url,method:init.method,body:init.body?JSON.parse(init.body):undefined,init,searchAtRequest:location.search,hashAtRequest:location.hash};calls.push(call);
  let response;
  if(options.respond)response=await options.respond(call,calls.length);
  else if(url.endsWith('/config'))response={data:options.config||available};
  else if(url.endsWith('/orders'))response={data:order()};
  else if(url.endsWith('/auth-return'))response={data:returned};
  else throw Error('Unexpected request: '+url);
  return {ok:response.ok!==false,json:async()=>response.data};
 };
 const context=vm.createContext({
  document:{getElementById:element,createElement(){if(!options.missingSDK)throw Error('Fixture already provides the Toss SDK');return {remove(){timeline.push('sdk:remove');}};},head:{append(script){if(!options.missingSDK)throw Error('Unexpected SDK load');queueMicrotask(()=>script.onerror());}}},
  location,history:{replaceState(_state,_title,url){timeline.push('history:replace');const clean=new URL(url,ORIGIN);location.pathname=clean.pathname;location.search=clean.search;location.hash=clean.hash;}},
  sessionStorage,fetch,window,URL,URLSearchParams,Date,setTimeout,clearTimeout
 });
 vm.runInContext(source,context,{filename:'payment-checkout.js'});
 await drain();
 return {element,elements,calls,timeline,sdkCalls,markupWrites,stored,location,
  text:()=>[...elements.values()].map(node=>node.textContent).join('\n'),
  async consent(){element('checkout-consent').checked=true;await element('checkout-consent').dispatch('change');},
  async submit(){return element('checkout-form').dispatch('submit');}
 };
}

test('checking the test acknowledgement cannot start an unavailable or failed configuration',async()=>{
 for(const config of [{...available,available:false},{...available,test_only:false},{...available,flow:'another-flow'}]){
  const f=await fixture({config});await f.consent();
  assert.equal(f.element('checkout-submit').disabled,true);
  assert.equal((await f.submit()).defaultPrevented,true);
  assert.deepEqual(f.calls.map(c=>c.url),['/api/payments/toss-test/config']);
  assert.equal(f.sdkCalls.length,0);
  assert.match(f.element('checkout-status').textContent,/준비 중/);
 }
 const failed=await fixture({respond:async()=>({ok:false,data:{error:'연결을 확인해주세요'}})});
 await failed.consent();await failed.submit();
 assert.equal(failed.element('checkout-submit').disabled,true);
 assert.equal(failed.calls.length,1);
 assert.equal(failed.element('checkout-error').hidden,false);
});

test('a server-signed request is saved before SDK billing authentication, and no payment is requested',async()=>{
 const f=await fixture({billingAuth:async(_args,{stored})=>{
  assert.equal(JSON.parse(stored.get(STORAGE)).order_token,'signed-order.payload-signature');
 }});
 assert.equal(f.element('checkout-submit').disabled,true);
 await f.consent();assert.equal(f.element('checkout-submit').disabled,false);
 await f.submit();
 assert.deepEqual(f.calls.map(c=>[c.url,c.method]),[['/api/payments/toss-test/config','GET'],['/api/payments/toss-test/orders','POST']]);
 assert.deepEqual(f.calls[1].body,{consent:true});
 assert.ok(f.timeline.indexOf('fetch:/api/payments/toss-test/orders')<f.timeline.indexOf('storage:set'));
 assert.ok(f.timeline.indexOf('storage:set')<f.timeline.indexOf('sdk:billing-auth'));
 const auth=f.sdkCalls.find(c=>c.kind==='billing-auth');
 assert.deepEqual(JSON.parse(JSON.stringify(auth.args)),{method:'CARD',successUrl:ORIGIN+'/checkout/toss/success',failUrl:ORIGIN+'/checkout/toss/fail'});
 assert.equal(f.sdkCalls.filter(c=>c.kind==='payment').length,0);
 assert.equal(f.stored.has(STORAGE),false,'a fulfilled dismissal must clear its stale state');
 assert.match(f.element('checkout-status').textContent,/실제 구독은 시작되지 않았습니다/);
});

test('an unavailable SDK fails before issuing test state and offers a deliberate retry',async()=>{
 const f=await fixture({missingSDK:true});await f.consent();await f.submit();
 assert.deepEqual(f.calls.map(c=>c.url),['/api/payments/toss-test/config']);
 assert.equal(f.stored.has(STORAGE),false);assert.equal(f.sdkCalls.length,0);
 assert.equal(f.element('checkout-submit').disabled,false);
 assert.equal(f.element('checkout-error').hidden,false);
 assert.match(f.element('checkout-error').textContent,/카드 등록창을 불러오지 못했어요/);
});

test('provider cancellation clears pending state and enables another deliberate attempt',async()=>{
 const f=await fixture({billingAuth:async()=>{throw Object.assign(Error('provider text'),{code:'USER_CANCEL'});}});
 await f.consent();await f.submit();
 assert.equal(f.stored.has(STORAGE),false);
 assert.equal(f.element('checkout-submit').disabled,false);
 assert.equal(f.element('checkout-consent').checked,true);
 assert.equal(f.element('checkout-error').hidden,false);
 assert.equal(f.element('checkout-error').textContent,'테스트 카드 등록을 취소했어요.');
 assert.match(f.element('checkout-status').textContent,/실제 청구·자동결제·Premium 지급은 발생하지 않았어요/);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});

test('success callback removes codes before requests and reports only an unverified authentication return',async()=>{
 const authKey='private-auth-code',customerKey='private-customer-code';
 const f=await fixture({path:`/checkout/toss/success?authKey=${authKey}&customerKey=${customerKey}#private-fragment`,stored:JSON.stringify(order())});
 assert.equal(f.timeline[0],'history:replace');
 assert.equal(f.location.search,'');assert.equal(f.location.hash,'');
 assert.deepEqual(f.calls.map(c=>[c.url,c.method]),[['/api/payments/toss-test/auth-return','POST']]);
 assert.deepEqual(f.calls[0].body,{order_token:'signed-order.payload-signature',customerKey,authKey});
 assert.equal(f.calls[0].searchAtRequest,'');assert.equal(f.calls[0].hashAtRequest,'');
 assert.equal(f.sdkCalls.length,0);
 assert.equal(f.element('checkout-order').hidden,true);assert.equal(f.element('checkout-result').hidden,false);
 assert.equal(f.element('result-title').textContent,'테스트 카드 인증 화면에서 돌아왔어요');
 assert.match(f.element('result-copy').textContent,/빌링키 발급과 결제 승인은 실행하지 않았으며/);
 assert.match(f.element('result-copy').textContent,/카드 등록 완료나 실제 구독 시작을 의미하지 않습니다/);
 assert.equal(f.element('result-amount').textContent,'0원');
 assert.equal(f.element('result-order-id').textContent,'test-request-1');
 assert.equal(f.stored.has(STORAGE),false);assert.equal(f.element('result-retry').hidden,true);
 assert.equal(f.text().includes(authKey),false);assert.equal(f.text().includes(customerKey),false);
});

test('unexpected provider approval or entitlement claims do not become successful UI',async()=>{
 for(const data of [{...returned,provider_verified:true},{...returned,entitlements_granted:true},{...returned,test_only:false}]){
  const f=await fixture({path:'/checkout/toss/success?authKey=code&customerKey=customer',stored:JSON.stringify(order()),respond:async()=>({data})});
  assert.equal(f.element('result-title').textContent,'돌아온 테스트 요청을 확인하지 못했어요');
  assert.equal(f.element('result-retry').hidden,false);
  assert.equal(f.element('checkout-error').hidden,false);
  assert.match(f.element('checkout-error').textContent,/결과 형식/);
  assert.equal(f.stored.has(STORAGE),true);
 }
});

test('missing, corrupt, expired or inaccessible return state cannot post authentication codes',async()=>{
 const expired=order();expired.order.expires_at=Math.floor(Date.now()/1000)-1;
 for(const options of [{},{stored:'{broken'},{stored:JSON.stringify(expired)},{stored:JSON.stringify(order()),denyStorageRead:true}]){
  const f=await fixture({...options,path:'/checkout/toss/success?authKey=private&customerKey=private-customer'});
  assert.equal(f.calls.length,0);assert.equal(f.sdkCalls.length,0);
  assert.equal(f.timeline[0],'history:replace');
  assert.equal(f.element('checkout-result').hidden,false);
  assert.equal(f.element('result-title').textContent,'테스트 요청을 확인할 수 없어요');
  assert.match(f.element('result-copy').textContent,/없거나 만료/);
  assert.equal(f.element('result-retry').hidden,true);
  assert.equal(f.text().includes('private'),false);
 }
});

test('fail callback discards provider error text and authentication parameters without network requests',async()=>{
 const injection='<img src=x onerror=alert(1)>',query=new URLSearchParams({code:injection,message:injection,authKey:'private-auth',customerKey:'private-customer'});
 const f=await fixture({path:'/checkout/toss/fail?'+query.toString(),stored:JSON.stringify(order())});
 assert.equal(f.timeline[0],'history:replace');
 assert.equal(f.calls.length,0);assert.equal(f.sdkCalls.length,0);assert.equal(f.stored.has(STORAGE),false);
 assert.equal(f.element('checkout-result').hidden,false);
 assert.equal(f.element('result-title').textContent,'테스트 카드 등록이 완료되지 않았어요');
 assert.equal(f.text().includes(injection),false);assert.equal(f.text().includes('private-auth'),false);
 assert.equal(f.markupWrites.length,0);
});

test('server failure offers retry of the same return state without creating a new request or SDK flow',async()=>{
 const injection='<img src=x onerror=alert(1)>',path='/checkout/toss/success?authKey=private-auth&customerKey=private-customer';
 const f=await fixture({path,stored:JSON.stringify(order()),respond:async(_call,count)=>count===1?{ok:false,data:{error:injection}}:{data:returned}});
 assert.equal(f.element('result-retry').hidden,false);assert.equal(f.element('result-retry').disabled,false);
 assert.equal(f.element('checkout-error').textContent,injection);
 assert.equal(f.element('checkout-error').hidden,false);assert.equal(f.markupWrites.length,0);
 assert.equal(f.stored.has(STORAGE),true);
 await f.element('result-retry').dispatch('click');
 assert.deepEqual(f.calls.map(c=>[c.url,c.method]),[['/api/payments/toss-test/auth-return','POST'],['/api/payments/toss-test/auth-return','POST']]);
 assert.deepEqual(f.calls[0].body,f.calls[1].body);
 assert.equal(f.sdkCalls.length,0);assert.equal(f.stored.has(STORAGE),false);
 assert.equal(f.element('checkout-error').hidden,true);assert.equal(f.element('result-retry').hidden,true);
 assert.equal(f.element('result-title').textContent,'테스트 카드 인증 화면에서 돌아왔어요');
});

test('sessionStorage write denial fails closed before any SDK authentication request',async()=>{
 const f=await fixture({denyStorageWrite:true});await f.consent();await f.submit();
 assert.equal(f.calls.filter(c=>c.url.endsWith('/orders')).length,1);
 assert.equal(f.sdkCalls.length,0);assert.equal(f.stored.has(STORAGE),false);
 assert.equal(f.element('checkout-submit').disabled,false);
 assert.equal(f.element('checkout-error').hidden,false);
 assert.match(f.element('checkout-error').textContent,/세션 저장소를 허용/);
 assert.match(f.element('checkout-status').textContent,/실제 청구·자동결제·Premium 지급은 발생하지 않았어요/);
});
