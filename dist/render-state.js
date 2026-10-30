// Inlined in <head>: independent of the app bundle and all network requests.
(()=>{
 const root=document.documentElement;
 root.dataset.renderState='loading';
 let epoch=0,timer,expired=false,assetsFailed=false,retry=null,cancel=null,initialized=false;
 const state=()=>root.dataset.renderState;
 function mount(){
  const message=document.getElementById('route-pending-message');
  const actions=document.getElementById('route-pending-actions');
  if(message)message.textContent=state()==='error'?'화면을 준비하지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.':'AIFECT 화면을 준비하고 있어요.';
  if(actions)actions.hidden=state()!=='error';
  const button=document.getElementById('route-retry');
  if(button)button.onclick=()=>{if(!initialized||assetsFailed||!retry)location.reload();else retry();};
  const main=document.getElementById('main');
  if(main){main.inert=state()!=='ready';if(state()!=='ready')main.setAttribute('aria-busy','true');}
 }
 function fail(id=epoch){
  if(id!==epoch||state()==='error')return;
  expired=true;clearTimeout(timer);cancel?.();
  root.dataset.renderState='error';mount();
 }
 function arm(){clearTimeout(timer);timer=setTimeout(()=>fail(epoch),20000);}
 window.AifectRender={
  mount,
  connect(callback){retry=callback;},
  begin(raw,previous,onTimeout){
   ++epoch;expired=false;cancel=onTimeout;
   if(state()!=='ready'||raw!==previous){root.dataset.renderState='loading';mount();}
   arm();return epoch;
  },
  ready(id){
   if(id!==epoch||expired||assetsFailed)return;
   clearTimeout(timer);cancel=null;initialized=true;
   root.dataset.renderState='ready';mount();
   document.getElementById('main')?.removeAttribute('aria-busy');
  },
  fail
 };
 // A missing/invalid bundle or stylesheet cannot leave an indefinite skeleton.
 window.addEventListener('error',event=>{
  const target=event.target;
  const asset=target?.getAttribute?.('src')||target?.getAttribute?.('href')||'';
  const critical=target?.matches?.('link[rel="stylesheet"],script[src]')&&(/^\/?aifect-app-[a-f0-9]{16}\.(js|css)(?:\?|$)/.test(asset)||asset==='/canonical-origin.js');
  if(critical){assetsFailed=true;fail();}
  else if(target===window&&!initialized&&state()==='loading')fail();
 },true);
 window.addEventListener('unhandledrejection',event=>{
  if(!initialized&&state()==='loading'&&event.reason?.name!=='AbortError')fail();
 });
 // Restoring a bfcache entry retains a valid page; an interrupted entry retries.
 window.addEventListener('pageshow',event=>{if(event.persisted&&state()!=='ready'){if(retry)retry();else arm();}});
 arm();
})();
