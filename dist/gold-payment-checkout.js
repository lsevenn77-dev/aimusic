// Screen-only Toss TEST card authentication. No approval or Gold delivery is requested.
const API='/api/payments/toss-gold-test',STORAGE='aifect:toss:gold-test:v1',FLOW='gold_card_auth_preview';
const byId=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),rawAmount=params.get('amount'),requestedGold=params.get('gold');
const returned={paymentKey:params.get('paymentKey'),orderId:params.get('orderId'),amount:/^[1-9]\d{0,11}$/.test(rawAmount||'')?Number(rawAmount):NaN};
const resultPath=location.pathname.replace(/\/$/,'');
// Authentication values leave the address bar before any SDK load or network request.
if(location.search||location.hash)history.replaceState(null,'',location.pathname);
const form=byId('checkout-form'),submit=byId('checkout-submit'),consent=byId('checkout-consent');
const status=byId('checkout-status'),error=byId('checkout-error'),retry=byId('result-retry');
const radios=Array.from(document.querySelectorAll('input[name="gold"]'));
const initialProducts=new Map(radios.map(r=>[Number(r.value),{gold:Number(r.value),price:Number(r.dataset.price),bonus_gold:Number(r.dataset.bonusGold),total_gold:Number(r.dataset.totalGold)}]));
let products=new Map(),ready=false,busy=false,redirecting=false,currentOrder=null,sdkPromise=null,clientKey=null;
const number=value=>value.toLocaleString('ko-KR');
const safePositive=value=>Number.isSafeInteger(value)&&value>0;
function samePack(a,b){return !!a&&!!b&&['gold','price','bonus_gold','total_gold'].every(key=>a[key]===b[key]);}
function validProducts(list){
 if(!Array.isArray(list)||!initialProducts.size||list.length!==initialProducts.size)return false;
 const seen=new Set();
 return list.every(pack=>pack&&initialProducts.has(pack.gold)&&!seen.has(pack.gold)&&seen.add(pack.gold)&&safePositive(pack.price)&&pack.price<=100000&&Number.isSafeInteger(pack.bonus_gold)&&pack.bonus_gold===Math.floor(pack.gold*5/100)&&pack.total_gold===pack.gold+pack.bonus_gold&&samePack(pack,initialProducts.get(pack.gold)));
}
function chosenPack(){const radio=radios.find(r=>r.checked);return radio&&/^[1-9]\d*$/.test(radio.value)?products.get(Number(radio.value)):null;}
function renderPack(pack){
 byId('checkout-total-gold').textContent=number(pack.total_gold)+' G';
 byId('checkout-base-gold').textContent=number(pack.gold)+' G';
 byId('checkout-bonus-gold').textContent=number(pack.bonus_gold)+' G';
 byId('checkout-amount').textContent=number(pack.price)+'원';
}
function message(text){error.textContent=text;error.hidden=!text;}
function updateButton(){for(const radio of radios)radio.disabled=busy;submit.disabled=!ready||busy||!consent.checked||!chosenPack();}
function clearOrder(){try{sessionStorage.removeItem(STORAGE);}catch{/* No durable test data. */}}
function validSummary(summary){
 const pack=summary&&initialProducts.get(summary.gold);
 return !!pack&&typeof summary.id==='string'&&summary.id.length>0&&summary.id.length<=100&&summary.currency==='KRW'&&summary.amount===pack.price&&summary.bonus_gold===pack.bonus_gold&&summary.total_gold===pack.total_gold&&Number.isSafeInteger(summary.expires_at)&&summary.expires_at*1000>Date.now();
}
function loadOrder(){
 try{
  const order=JSON.parse(sessionStorage.getItem(STORAGE)||'null');
  if(order?.test_only===true&&order.flow===FLOW&&typeof order.order_token==='string'&&order.order_token.length>0&&order.order_token.length<=4000&&validSummary(order.order))return order;
 }catch{/* Missing or inaccessible state cannot validate a return. */}
 clearOrder();return null;
}
function saveOrder(order){
 try{sessionStorage.setItem(STORAGE,JSON.stringify(order));}catch{throw new Error('테스트 요청 확인을 위해 브라우저의 세션 저장소를 허용해주세요.');}
}
async function api(path,body){
 const response=await fetch(API+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
 let data;try{data=await response.json();}catch{throw new Error('연결 결과를 확인하지 못했어요. 잠시 후 다시 시도해주세요.');}
 if(!response.ok)throw new Error(data.error||'테스트 요청을 확인하지 못했어요.');
 return data;
}
function loadSDK(){
 if(window.TossPayments)return Promise.resolve(window.TossPayments);
 if(sdkPromise)return sdkPromise;
 sdkPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://js.tosspayments.com/v2/standard';script.async=true;
  const timeout=setTimeout(()=>{script.remove();sdkPromise=null;reject(new Error('토스 테스트 결제창을 불러오지 못했어요. 인터넷 연결과 팝업 차단 설정을 확인해주세요.'));},15000);
  script.onload=()=>{clearTimeout(timeout);if(window.TossPayments)resolve(window.TossPayments);else{sdkPromise=null;reject(new Error('토스 테스트 결제창을 불러오지 못했어요.'));}};
  script.onerror=()=>{clearTimeout(timeout);script.remove();sdkPromise=null;reject(new Error('토스 테스트 결제창을 불러오지 못했어요. 인터넷 연결을 확인해주세요.'));};
  document.head.append(script);
 });
 return sdkPromise;
}
function showResult(title,copy,order){
 byId('checkout-order').hidden=true;byId('checkout-result').hidden=false;
 byId('result-title').textContent=title;byId('result-copy').textContent=copy;
 byId('result-order-id').textContent=order?.order?.id||'—';byId('result-amount').textContent='0원';
}
async function checkReturn(){
 retry.hidden=true;retry.disabled=true;message('');
 if(!currentOrder||!returned.paymentKey||returned.paymentKey.length>200||/[\u0000-\u0020\u007f]/.test(returned.paymentKey)||returned.orderId!==currentOrder.order.id||returned.amount!==currentOrder.order.amount){
  clearOrder();showResult('테스트 요청을 확인할 수 없어요','이 브라우저에서 시작한 요청이 없거나 만료됐어요. 새 골드 결제 테스트를 시작해주세요.',currentOrder);return;
 }
 showResult('돌아온 테스트 요청을 확인하고 있어요','주문 금액과 브라우저 확인 정보를 검사합니다.',currentOrder);
 try{
  const data=await api('/auth-return',{order_token:currentOrder.order_token,paymentKey:returned.paymentKey,orderId:returned.orderId,amount:returned.amount,currency:'KRW'});
  if(data.test_only!==true||data.flow!==FLOW||data.status!=='AUTH_RETURNED'||data.provider_verified!==false||data.entitlements_granted!==false||!validSummary(data.order)||data.order.id!==currentOrder.order.id||data.order.amount!==currentOrder.order.amount)throw new Error('테스트 결과 형식을 확인하지 못했어요.');
  clearOrder();returned.paymentKey=null;returned.orderId=null;returned.amount=NaN;
  showResult('테스트 카드 결제창에서 돌아왔어요','이 브라우저에서 시작한 주문과 금액임을 확인했어요. 토스페이먼츠에 결제 승인을 요청하지 않았으며, 카드 결제 성공이나 골드 지급을 확인한 결과가 아닙니다.',currentOrder);
  status.textContent='실제 청구 0원 · 골드 지급 없음 · 자동충전·정기결제 없음';
 }catch(e){
  showResult('돌아온 테스트 요청을 확인하지 못했어요','새 주문을 만들기 전에 같은 요청의 확인을 다시 시도할 수 있어요.',currentOrder);message(e.message);retry.hidden=false;
 }finally{retry.disabled=false;}
}
consent.addEventListener('change',updateButton);
for(const radio of radios)radio.addEventListener('change',()=>{const pack=chosenPack();if(pack)renderPack(pack);updateButton();});
retry.addEventListener('click',()=>{void checkReturn();});
window.addEventListener('pageshow',event=>{
 if(!event.persisted||!redirecting)return;
 redirecting=false;busy=false;clearOrder();
 status.textContent='테스트 주문서로 돌아왔어요. 실제 청구와 골드 지급은 없습니다.';updateButton();
});
form.addEventListener('submit',async event=>{
 event.preventDefault();const pack=chosenPack();if(!ready||busy||!consent.checked||!pack)return;
 busy=true;message('');updateButton();
 try{
  const order=await api('/orders',{gold:pack.gold,consent:true}),payment=order.payment;
  if(order.test_only!==true||order.flow!==FLOW||typeof order.order_token!=='string'||!order.order_token||!validSummary(order.order)||order.order.gold!==pack.gold||!payment||payment.clientKey!==clientKey||!/^test_ck_[A-Za-z0-9_-]+$/.test(payment.clientKey)||payment.method!=='CARD'||payment.amount?.currency!=='KRW'||payment.amount.value!==pack.price||payment.orderId!==order.order.id||typeof payment.customerKey!=='string'||!payment.customerKey||typeof payment.orderName!=='string'||!payment.orderName||payment.successUrl!==location.origin+'/checkout/toss/gold/success'||payment.failUrl!==location.origin+'/checkout/toss/gold/fail')throw new Error('테스트 전용 상품과 금액을 확인하지 못했어요.');
  saveOrder(order);currentOrder=order;renderPack({...order.order,price:order.order.amount});
  const TossPayments=await loadSDK(),toss=TossPayments(payment.clientKey).payment({customerKey:payment.customerKey});
  status.textContent='토스 테스트 카드 결제창을 열고 있어요. 실제 청구·골드 지급은 하지 않습니다.';
  // Use Toss's supported full-page flow: an embedded PC gateway can remain blank.
  // A resolved redirect request is not a cancellation. Keep the signed state for
  // the same-tab return, which still never approves a payment or grants Gold.
  await toss.requestPayment({method:'CARD',windowTarget:'self',amount:payment.amount,orderId:payment.orderId,orderName:payment.orderName,successUrl:payment.successUrl,failUrl:payment.failUrl,card:{flowMode:'DEFAULT',useEscrow:false,useCardPoint:false,useAppCardOnly:false}});
  redirecting=true;status.textContent='토스 테스트 카드 결제창으로 이동하고 있어요. 실제 청구와 골드 지급은 없습니다.';
 }catch(e){clearOrder();status.textContent='실제 청구·골드 지급·자동충전은 발생하지 않았어요.';message(e.code==='USER_CANCEL'?'골드 결제 테스트를 취소했어요.':e.message||'토스 테스트 결제창을 열지 못했어요.');}
 finally{busy=redirecting;updateButton();}
});
async function init(){
 if(resultPath.endsWith('/success')){currentOrder=loadOrder();status.textContent='테스트 인증 복귀 확인';await checkReturn();return;}
 if(resultPath.endsWith('/fail')){currentOrder=loadOrder();clearOrder();showResult('골드 결제 테스트가 완료되지 않았어요','취소되었거나 테스트 결제창에서 오류가 발생했어요. 실제 청구와 골드 지급은 없습니다.',currentOrder);status.textContent='새 테스트는 아래 버튼에서 다시 시작할 수 있어요.';return;}
 currentOrder=loadOrder();
 try{
  const config=await api('/config');
  if(config.test_only!==true||config.flow!==FLOW||config.currency!=='KRW'||!validProducts(config.products))throw new Error('골드 테스트 상품 정보를 확인하지 못했어요.');
  products=new Map(config.products.map(pack=>[pack.gold,pack]));clientKey=config.client_key;
  // A product link may select only an exact server-validated pack, never its price.
  if(radios.some(radio=>radio.value===requestedGold&&products.has(Number(radio.value))))for(const radio of radios)radio.checked=radio.value===requestedGold;
  ready=config.available===true&&typeof clientKey==='string'&&/^test_ck_[A-Za-z0-9_-]+$/.test(clientKey);
  const pack=chosenPack();if(pack)renderPack(pack);
  status.textContent=ready?'골드 테스트 결제창을 사용할 수 있어요. 아래 테스트 안내를 확인해주세요.':'골드용 토스 테스트 연결 준비 중이에요. 현재 결제창은 열리지 않으며 실제 결제도 받지 않습니다.';
 }catch(e){status.textContent='골드 테스트 연결 상태를 확인하지 못했어요.';message(e.message);}
 updateButton();
}
void init();
