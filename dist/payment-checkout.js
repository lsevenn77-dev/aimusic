// Screen-only Toss TEST billing authentication. No billing keys or payments are issued.
const API='/api/payments/toss-test',STORAGE='aifect:toss:billing-test:v1';
const byId=id=>document.getElementById(id);
const form=byId('checkout-form'),submit=byId('checkout-submit'),consent=byId('checkout-consent');
const status=byId('checkout-status'),error=byId('checkout-error'),retry=byId('result-retry');
const params=new URLSearchParams(location.search);
const returned={customerKey:params.get('customerKey'),authKey:params.get('authKey')};
const resultPath=location.pathname.replace(/\/$/,'');
// Remove authentication codes before loading the third-party SDK or following links.
if(location.search||location.hash)history.replaceState(null,'',location.pathname);
let ready=false,busy=false,currentOrder=null,sdkPromise=null;
function message(text){error.textContent=text;error.hidden=!text;}
function updateButton(){submit.disabled=!ready||busy||!consent.checked;}
function saveOrder(order){
 try{sessionStorage.setItem(STORAGE,JSON.stringify(order));}catch{throw new Error('테스트 요청 확인을 위해 브라우저의 세션 저장소를 허용해주세요.');}
}
function loadOrder(){
 try{const order=JSON.parse(sessionStorage.getItem(STORAGE)||'null');
  if(order?.order?.expires_at*1000>Date.now()&&typeof order.order_token==='string')return order;
  sessionStorage.removeItem(STORAGE);
 }catch{/* Corrupt or unavailable session storage cannot validate a return. */}
 return null;
}
function clearOrder(){try{sessionStorage.removeItem(STORAGE);}catch{/* No durable test data. */}}
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
  const timeout=setTimeout(()=>{script.remove();sdkPromise=null;reject(new Error('토스 카드 등록창을 불러오지 못했어요. 인터넷 연결과 팝업 차단 설정을 확인해주세요.'));},15000);
  script.onload=()=>{clearTimeout(timeout);if(window.TossPayments)resolve(window.TossPayments);else{sdkPromise=null;reject(new Error('토스 카드 등록창을 불러오지 못했어요.'));}};
  script.onerror=()=>{clearTimeout(timeout);script.remove();sdkPromise=null;reject(new Error('토스 카드 등록창을 불러오지 못했어요. 인터넷 연결을 확인해주세요.'));};
  document.head.append(script);
 });
 return sdkPromise;
}
function showResult(title,copy,order){
 byId('checkout-order').hidden=true;byId('checkout-result').hidden=false;
 byId('result-title').textContent=title;byId('result-copy').textContent=copy;
 byId('result-order-id').textContent=order?.order?.id||'—';
 byId('result-amount').textContent='0원';
}
async function checkReturn(){
 retry.hidden=true;retry.disabled=true;message('');
 if(!currentOrder||!returned.customerKey||!returned.authKey){
  clearOrder();showResult('테스트 요청을 확인할 수 없어요','이 브라우저에서 시작한 요청이 없거나 만료됐어요. 새 카드 등록 테스트를 시작해주세요.',currentOrder);return;
 }
 showResult('돌아온 테스트 요청을 확인하고 있어요','요청번호와 브라우저 확인 정보를 검사합니다.',currentOrder);
 try{
  const data=await api('/auth-return',{order_token:currentOrder.order_token,...returned});
  if(data.test_only!==true||data.status!=='AUTH_RETURNED'||data.provider_verified!==false||data.entitlements_granted!==false)throw new Error('테스트 결과 형식을 확인하지 못했어요.');
  clearOrder();returned.authKey=null;returned.customerKey=null;
  showResult('테스트 카드 인증 화면에서 돌아왔어요','이 브라우저에서 시작한 요청임을 확인했어요. 빌링키 발급과 결제 승인은 실행하지 않았으며, 카드 등록 완료나 실제 구독 시작을 의미하지 않습니다.',currentOrder);
  status.textContent='실제 청구 0원 · 자동결제 예약 없음 · 이용권 지급 없음';
 }catch(e){
  showResult('돌아온 테스트 요청을 확인하지 못했어요','새 카드 등록 요청을 만들기 전에 같은 요청의 확인을 다시 시도할 수 있어요.',currentOrder);
  message(e.message);retry.hidden=false;
 }finally{retry.disabled=false;}
}
consent.addEventListener('change',updateButton);
retry.addEventListener('click',()=>{void checkReturn();});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(!ready||busy||!consent.checked)return;
 busy=true;message('');updateButton();
 try{
  const TossPayments=await loadSDK();
  const order=await api('/orders',{consent:true});
  if(order.test_only!==true||order.flow!=='billing_auth_preview')throw new Error('테스트 전용 요청인지 확인하지 못했어요.');
  saveOrder(order);currentOrder=order;
  const {clientKey,customerKey,method,successUrl,failUrl}=order.payment;
  if(!/^test_ck_/.test(clientKey)||method!=='CARD'||new URL(successUrl).origin!==location.origin||new URL(failUrl).origin!==location.origin)throw new Error('테스트 카드 등록 연결을 확인하지 못했어요.');
  const payment=TossPayments(clientKey).payment({customerKey});
  status.textContent='토스 테스트 카드 등록창을 열고 있어요. 실제 카드 청구는 하지 않습니다.';
  await payment.requestBillingAuth({method:'CARD',successUrl,failUrl});
  // A redirect normally leaves this page; dismissal returns here in some browsers.
  clearOrder();
  status.textContent='카드 등록창이 닫혔어요. 실제 구독은 시작되지 않았습니다.';
 }catch(e){
  clearOrder();status.textContent='실제 청구·자동결제·Premium 지급은 발생하지 않았어요.';
  message(e.code==='USER_CANCEL'?'테스트 카드 등록을 취소했어요.':e.message||'토스 카드 등록창을 열지 못했어요.');
 }finally{busy=false;updateButton();}
});
async function init(){
 if(resultPath.endsWith('/success')){currentOrder=loadOrder();status.textContent='테스트 인증 복귀 확인';await checkReturn();return;}
 if(resultPath.endsWith('/fail')){
  currentOrder=loadOrder();clearOrder();
  showResult('테스트 카드 등록이 완료되지 않았어요','취소되었거나 카드 등록창에서 오류가 발생했어요. 실제 청구나 구독 시작은 없습니다.',currentOrder);
  status.textContent='새 테스트는 아래 버튼에서 다시 시작할 수 있어요.';return;
 }
 currentOrder=loadOrder();
 try{
  const config=await api('/config');
  ready=config.available===true&&config.test_only===true&&config.flow==='billing_auth_preview';
  byId('premium-price').textContent=Number(config.price).toLocaleString('ko-KR')+'원';
  status.textContent=ready?'테스트 카드 등록창을 사용할 수 있어요. 아래 테스트 안내를 확인해주세요.':'토스 테스트 연결 준비 중이에요. 현재 카드 등록창은 열리지 않으며 실제 결제도 받지 않습니다.';
 }catch(e){status.textContent='테스트 연결 상태를 확인하지 못했어요.';message(e.message);}
 updateButton();
}
void init();
