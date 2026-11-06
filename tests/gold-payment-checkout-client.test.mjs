import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {WEB_GOLD_PACKS} from '../shared/gifts.js';

const source=readFileSync(new URL('../dist/gold-payment-checkout.js',import.meta.url),'utf8');
const STORAGE='aifect:toss:gold-test:v1',ORIGIN='https://aifect.test',API='/api/payments/toss-gold-test';
const plain=value=>JSON.parse(JSON.stringify(value));
const products=()=>WEB_GOLD_PACKS.map(({gold,bonus_gold,total_gold,price})=>({gold,bonus_gold,total_gold,price}));
const available=()=>({available:true,test_only:true,flow:'gold_card_auth_preview',currency:'KRW',client_key:'test_ck_gold_fixture',products:products()});
function order(gold=500){
 const pack=WEB_GOLD_PACKS.find(pack=>pack.gold===gold);
 return {test_only:true,flow:'gold_card_auth_preview',order_token:'signed-gold-state.signature',
  order:{id:'agt_'+'a'.repeat(32),gold:pack.gold,bonus_gold:pack.bonus_gold,total_gold:pack.total_gold,amount:pack.price,currency:'KRW',expires_at:Math.floor(Date.now()/1000)+1200},
  payment:{clientKey:'test_ck_gold_fixture',customerKey:'agp_'+'b'.repeat(32),method:'CARD',amount:{currency:'KRW',value:pack.price},orderId:'agt_'+'a'.repeat(32),orderName:`AIFECT 골드 ${pack.total_gold}G · 테스트`,successUrl:ORIGIN+'/checkout/toss/gold/success',failUrl:ORIGIN+'/checkout/toss/gold/fail'}
 };
}
const returned=(gold=500)=>({test_only:true,flow:'gold_card_auth_preview',status:'AUTH_RETURNED',provider_verified:false,entitlements_granted:false,order:order(gold).order});
const drain=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));};

async function fixture(options={}){
 const elements=new Map(),calls=[],timeline=[],sdkCalls=[],markupWrites=[],stored=new Map();
 if(options.stored!==undefined)stored.set(STORAGE,options.stored);
 const element=id=>{
  if(elements.has(id))return elements.get(id);
  const listeners=new Map(),node={id,textContent:'',hidden:['checkout-error','checkout-result','result-retry'].includes(id),disabled:['checkout-submit','result-retry'].includes(id),checked:false,dataset:{},
   addEventListener(type,listener){const list=listeners.get(type)||[];list.push(listener);listeners.set(type,list);},
   async dispatch(type){const event={type,target:node,currentTarget:node,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};await Promise.all((listeners.get(type)||[]).map(listener=>listener(event)));await drain();return event;}
  };
  Object.defineProperty(node,'innerHTML',{set(html){markupWrites.push({id,html});},get(){return node.textContent.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}});
  elements.set(id,node);return node;
 };
 const radios=WEB_GOLD_PACKS.map(pack=>Object.assign(element('checkout-gold-'+pack.gold),{name:'gold',value:String(pack.gold),checked:pack.gold===500,dataset:{price:String(pack.price),bonusGold:String(pack.bonus_gold),totalGold:String(pack.total_gold)}}));
 const initialURL=new URL(options.path||'/checkout/toss/gold',ORIGIN);
 const location={origin:ORIGIN,pathname:initialURL.pathname,search:initialURL.search,hash:initialURL.hash};
 const sessionStorage={getItem(key){if(options.denyStorageRead)throw Error('Storage unavailable');return stored.get(key)||null;},setItem(key,value){timeline.push('storage:set');if(options.denyStorageWrite)throw Error('Storage unavailable');stored.set(key,value);},removeItem(key){timeline.push('storage:clear');stored.delete(key);}};
 const sdk=key=>{sdkCalls.push({kind:'client',key});return {payment(customer){sdkCalls.push({kind:'customer',customer});return {
  async requestPayment(args){timeline.push('sdk:payment');sdkCalls.push({kind:'payment',args:plain(args)});if(options.payment)return options.payment(args,{stored,timeline});},
  async requestBillingAuth(args){sdkCalls.push({kind:'billing-auth',args});throw Error('Gold must never register recurring billing');}
 };}};};
 const windowListeners=new Map(),window={addEventListener(type,listener){windowListeners.set(type,listener);}};Object.defineProperty(window,'TossPayments',{get(){timeline.push('sdk:read');return options.missingSDK?undefined:sdk;}});
 const fetch=async(url,init)=>{
  timeline.push('fetch:'+url);const call={url,method:init.method,body:init.body?JSON.parse(init.body):undefined,searchAtRequest:location.search,hashAtRequest:location.hash};calls.push(call);
  let response;if(options.respond)response=await options.respond(call,calls.length);else if(url.endsWith('/config'))response={data:options.config||available()};else if(url.endsWith('/orders'))response={data:order(call.body.gold)};else if(url.endsWith('/auth-return'))response={data:returned()};else throw Error('Unexpected request: '+url);
  return {ok:response.ok!==false,json:async()=>response.data};
 };
 const document={getElementById:element,querySelectorAll(){return radios;},querySelector(){return radios.find(radio=>radio.checked)||null;},createElement(){if(!options.missingSDK)throw Error('Fixture already provides SDK');return {remove(){timeline.push('sdk:remove');}};},head:{append(script){if(!options.missingSDK)throw Error('Unexpected SDK load');queueMicrotask(()=>script.onerror());}}};
 const context=nicknameContext({document,location,history:{replaceState(_state,_title,url){timeline.push('history:replace');const clean=new URL(url,ORIGIN);location.pathname=clean.pathname;location.search=clean.search;location.hash=clean.hash;}},sessionStorage,fetch,window,URL,URLSearchParams,Date,setTimeout,clearTimeout});
 vm.runInContext(source,context,{filename:'gold-payment-checkout.js'});await drain();
 return {element,elements,radios,calls,timeline,sdkCalls,markupWrites,stored,location,showPage:persisted=>windowListeners.get('pageshow')?.({persisted}),text:()=>[...elements.values()].map(node=>node.textContent).join('\n'),
  async consent(){element('checkout-consent').checked=true;await element('checkout-consent').dispatch('change');},async submit(){return element('checkout-form').dispatch('submit');},
  async select(gold){const radio=radios.find(radio=>radio.value===String(gold));assert.ok(radio);if(radio.disabled)return false;for(const item of radios)item.checked=item===radio;await radio.dispatch('change');return true;}
 };
}

test('unavailable, wrong-flow or invalid product configuration cannot open a Gold test window',async()=>{
 const configs=[{...available(),available:false},{...available(),test_only:false},{...available(),flow:'billing_auth_preview'},{...available(),currency:'USD'},{...available(),client_key:'live_ck_must_not_open'}];
 const malformed=available();malformed.products[0].total_gold=999;configs.push(malformed);
 const missing=available();missing.products.pop();configs.push(missing);
 for(const config of configs){const f=await fixture({config});await f.consent();await f.submit();assert.equal(f.element('checkout-submit').disabled,true);assert.deepEqual(f.calls.map(call=>call.url),[API+'/config']);assert.equal(f.sdkCalls.length,0);}
});

test('all available choices update totals from the server catalog and query values do not select a price',async()=>{
 const f=await fixture({path:'/checkout/toss/gold?gold=10000&amount=1'});
 assert.equal(f.radios.find(radio=>radio.checked).value,'500');
 for(const pack of WEB_GOLD_PACKS){await f.select(pack.gold);for(const [id,expected] of [['checkout-total-gold',pack.total_gold+'G'],['checkout-base-gold',pack.gold+'G'],['checkout-bonus-gold',pack.bonus_gold+'G'],['checkout-amount',pack.price+'원']])assert.equal(f.element(id).textContent.replaceAll(',','').replace(/\s/g,''),expected);}
 assert.equal(f.calls.length,1);assert.equal(f.sdkCalls.length,0);assert.equal(f.location.search,'');
});

test('same-tab test CARD redirect retains signed state and prevents another order while leaving',async()=>{
 const f=await fixture({payment:async(_args,{stored})=>assert.equal(JSON.parse(stored.get(STORAGE)).order_token,'signed-gold-state.signature')});
 await f.select(1000);await f.consent();assert.equal(f.element('checkout-submit').disabled,false);await f.submit();
 assert.deepEqual(f.calls.map(call=>[call.url,call.method]),[[API+'/config','GET'],[API+'/orders','POST']]);assert.deepEqual(f.calls[1].body,{gold:1000,consent:true});
 assert.ok(f.timeline.indexOf('fetch:'+API+'/orders')<f.timeline.indexOf('storage:set'));assert.ok(f.timeline.indexOf('storage:set')<f.timeline.indexOf('sdk:payment'));
 const payment=f.sdkCalls.find(call=>call.kind==='payment');
 assert.deepEqual(payment.args,{method:'CARD',windowTarget:'self',amount:{currency:'KRW',value:11000},orderId:order(1000).payment.orderId,orderName:order(1000).payment.orderName,successUrl:ORIGIN+'/checkout/toss/gold/success',failUrl:ORIGIN+'/checkout/toss/gold/fail',card:{flowMode:'DEFAULT',useEscrow:false,useCardPoint:false,useAppCardOnly:false}});
 assert.equal(f.sdkCalls.some(call=>call.kind==='billing-auth'),false);assert.equal(f.stored.has(STORAGE),true);
 assert.equal(f.element('checkout-submit').disabled,true);await f.submit();assert.equal(f.calls.length,2);
 const saved=f.stored.get(STORAGE),state=JSON.parse(saved);
 const callback=await fixture({path:`/checkout/toss/gold/success?paymentKey=test-return&orderId=${state.order.id}&amount=${state.order.amount}`,stored:saved,respond:async()=>({data:returned(1000)})});
 assert.equal(callback.calls.length,1);assert.equal(callback.calls[0].url,API+'/auth-return');assert.equal(callback.stored.has(STORAGE),false);
});

test('returning through browser back restores a usable order form without replaying payment',async()=>{
 const f=await fixture();await f.consent();await f.submit();
 f.showPage(false);assert.equal(f.stored.has(STORAGE),true);assert.equal(f.element('checkout-submit').disabled,true);
 f.showPage(true);assert.equal(f.stored.has(STORAGE),false);assert.equal(f.element('checkout-submit').disabled,false);assert.equal(f.calls.length,2);
 await f.select(1000);await f.submit();assert.equal(f.calls.filter(call=>call.url.endsWith('/orders')).length,2);
});

test('a selected order with inconsistent server totals cannot invoke the SDK payment method',async()=>{
 const bad=order();bad.order.amount=1;bad.payment.amount.value=1;
 const f=await fixture({respond:async call=>({data:call.url.endsWith('/config')?available():bad})});await f.consent();await f.submit();
 assert.equal(f.sdkCalls.some(call=>call.kind==='payment'),false);assert.equal(f.element('checkout-error').hidden,false);assert.equal(f.stored.has(STORAGE),false);
});

test('cancellation clears pending Gold state and re-enables a deliberate attempt',async()=>{
 const f=await fixture({payment:async()=>{throw Object.assign(Error('provider-private-message'),{code:'USER_CANCEL'});}});await f.consent();await f.submit();
 assert.equal(f.stored.has(STORAGE),false);assert.equal(f.element('checkout-submit').disabled,false);assert.equal(f.element('checkout-error').hidden,false);assert.match(f.element('checkout-error').textContent,/취소/);assert.equal(f.text().includes('provider-private-message'),false);
});

test('a delayed order locks product choices to its displayed amount until cancellation completes',async()=>{
 let releaseOrder;const heldOrder=new Promise(resolve=>{releaseOrder=resolve;});
 let f;f=await fixture({respond:async call=>{if(call.url.endsWith('/config'))return {data:available()};await heldOrder;return {data:order(call.body.gold)};},payment:async args=>{
  assert.equal(args.amount.value,55000);assert.ok(f.radios.every(radio=>radio.disabled));
  throw Object.assign(Error('cancelled'),{code:'USER_CANCEL'});
 }});
 await f.select(5000);await f.consent();const submitting=f.submit();await drain();
 assert.ok(f.radios.every(radio=>radio.disabled));assert.equal(f.element('checkout-submit').disabled,true);
 assert.equal(await f.select(500),false,'disabled native radios cannot change the pending selection');
 assert.equal(f.radios.find(radio=>radio.checked).value,'5000');assert.equal(f.element('checkout-amount').textContent,'55,000원');
 assert.equal(f.sdkCalls.length,0);assert.deepEqual(f.calls.at(-1).body,{gold:5000,consent:true});
 releaseOrder();await submitting;
 assert.ok(f.radios.every(radio=>!radio.disabled));assert.equal(f.element('checkout-submit').disabled,false);
 assert.equal(f.radios.find(radio=>radio.checked).value,'5000');assert.equal(f.element('checkout-amount').textContent,'55,000원');
 assert.equal(f.stored.has(STORAGE),false);assert.match(f.element('checkout-error').textContent,/취소/);
});

test('callback strips query first and posts only its bound signed request without provider approval',async()=>{
 const state=order(),paymentKey='private-payment-key',query=new URLSearchParams({paymentKey,orderId:state.order.id,amount:String(state.order.amount)});
 const f=await fixture({path:'/checkout/toss/gold/success?'+query+'#private-fragment',stored:JSON.stringify(state)});
 assert.equal(f.timeline[0],'history:replace');assert.equal(f.location.search,'');assert.equal(f.location.hash,'');assert.equal(f.sdkCalls.length,0);
 assert.deepEqual(f.calls.map(call=>[call.url,call.method]),[[API+'/auth-return','POST']]);assert.deepEqual(f.calls[0].body,{order_token:state.order_token,paymentKey,orderId:state.order.id,amount:5500,currency:'KRW'});
 assert.equal(f.calls[0].searchAtRequest,'');assert.equal(f.calls[0].hashAtRequest,'');assert.equal(f.element('checkout-result').hidden,false);assert.equal(f.element('checkout-order').hidden,true);
 assert.equal(f.text().includes(paymentKey),false);assert.equal(f.stored.has(STORAGE),false);assert.equal(f.element('result-retry').hidden,true);
 assert.match(f.element('result-copy').textContent,/승인|검증/);assert.match(f.text(),/지급.*않|지급 없음|지급되지|골드 지급은 없/);
});

test('unexpected verified-provider or granted-entitlement responses never become successful results',async()=>{
 const state=order(),path=`/checkout/toss/gold/success?paymentKey=private&orderId=${state.order.id}&amount=5500`;
 for(const data of [{...returned(),provider_verified:true},{...returned(),entitlements_granted:true},{...returned(),test_only:false}]){const f=await fixture({path,stored:JSON.stringify(state),respond:async()=>({data})});assert.equal(f.element('checkout-error').hidden,false);assert.equal(f.element('result-retry').hidden,false);assert.equal(f.stored.has(STORAGE),true);}
});

test('missing, broken, expired or unreadable browser state cannot post returned payment keys',async()=>{
 const state=order(),expired=order();expired.order.expires_at=Math.floor(Date.now()/1000)-1;
 for(const options of [{},{stored:'{broken'},{stored:JSON.stringify(expired)},{stored:JSON.stringify(state),denyStorageRead:true}]){const f=await fixture({...options,path:`/checkout/toss/gold/success?paymentKey=private&orderId=${state.order.id}&amount=5500`});assert.equal(f.calls.length,0);assert.equal(f.sdkCalls.length,0);assert.equal(f.element('checkout-result').hidden,false);assert.equal(f.element('result-retry').hidden,true);assert.equal(f.text().includes('private'),false);}
});

test('forged callback amount, order id or missing payment key cannot post even with valid saved state',async()=>{
 const state=order();
 for(const query of [{paymentKey:'private',orderId:state.order.id,amount:'1'},{paymentKey:'private',orderId:state.order.id,amount:'05500'},{paymentKey:'private',orderId:state.order.id,amount:'5500.0'},{paymentKey:'private',orderId:'different-order',amount:'5500'},{orderId:state.order.id,amount:'5500'}]){
  const f=await fixture({path:'/checkout/toss/gold/success?'+new URLSearchParams(query),stored:JSON.stringify(state)});
  assert.equal(f.calls.length,0);assert.equal(f.sdkCalls.length,0);assert.equal(f.stored.has(STORAGE),false);assert.equal(f.element('checkout-result').hidden,false);assert.equal(f.element('result-retry').hidden,true);assert.equal(f.text().includes('private'),false);
 }
});

test('fail callback clears state and never reflects raw provider error HTML',async()=>{
 const injection='<img src=x onerror=alert(1)>',query=new URLSearchParams({message:injection,code:injection,paymentKey:'private-key'});
 const f=await fixture({path:'/checkout/toss/gold/fail?'+query,stored:JSON.stringify(order())});assert.equal(f.timeline[0],'history:replace');assert.equal(f.calls.length,0);assert.equal(f.sdkCalls.length,0);assert.equal(f.stored.has(STORAGE),false);assert.equal(f.text().includes(injection),false);assert.equal(f.text().includes('private-key'),false);assert.equal(f.markupWrites.length,0);assert.equal(f.element('checkout-result').hidden,false);
});

test('retry repeats the same return check after server failure without creating orders or reopening SDK',async()=>{
 const state=order(),path=`/checkout/toss/gold/success?paymentKey=private&orderId=${state.order.id}&amount=5500`,injection='<img src=x onerror=alert(1)>';
 const f=await fixture({path,stored:JSON.stringify(state),respond:async(_call,count)=>count===1?{ok:false,data:{error:injection}}:{data:returned()}});
 assert.equal(f.element('result-retry').hidden,false);assert.equal(f.element('result-retry').disabled,false);assert.equal(f.element('checkout-error').textContent,injection);assert.equal(f.markupWrites.length,0);assert.equal(f.stored.has(STORAGE),true);
 await f.element('result-retry').dispatch('click');assert.deepEqual(f.calls.map(call=>[call.url,call.method]),[[API+'/auth-return','POST'],[API+'/auth-return','POST']]);assert.deepEqual(f.calls[0].body,f.calls[1].body);assert.equal(f.sdkCalls.length,0);assert.equal(f.stored.has(STORAGE),false);assert.equal(f.element('result-retry').hidden,true);assert.equal(f.element('checkout-error').hidden,true);
});

test('session write denial fails closed before any SDK CARD request and leaves no pending state',async()=>{
 const f=await fixture({denyStorageWrite:true});await f.consent();await f.submit();assert.equal(f.calls.filter(call=>call.url.endsWith('/orders')).length,1);assert.equal(f.sdkCalls.length,0);assert.equal(f.stored.has(STORAGE),false);assert.equal(f.element('checkout-submit').disabled,false);assert.equal(f.element('checkout-error').hidden,false);assert.match(f.element('checkout-error').textContent,/세션 저장소/);
});

test('SDK load failure clears its already-issued signed state without invoking any payment method',async()=>{
 const f=await fixture({missingSDK:true});await f.consent();await f.submit();assert.deepEqual(f.calls.map(call=>call.url),[API+'/config',API+'/orders']);assert.equal(f.sdkCalls.length,0);assert.equal(f.stored.has(STORAGE),false);assert.equal(f.element('checkout-submit').disabled,false);assert.equal(f.element('checkout-error').hidden,false);
});
