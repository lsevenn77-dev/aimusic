// Inlined in <head>: independent of the app bundle and all network requests.
(()=>{
 const root=document.documentElement;
 const messageRoute=()=>root.toggleAttribute('data-message-route',/^#dm(?:[/?]|$)/.test(location.hash));messageRoute();
 window.addEventListener('hashchange',messageRoute);
 // Restore the shell before the first paint, independently of network/bundle timing.
 try{root.toggleAttribute('data-mobile-topbar-collapsed',localStorage.getItem('aifect-mobile-topbar-collapsed')==='1');}catch{}
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
 // CSS :target tracks URL changes before hashchange callbacks can run.
 // Keep this hidden marker ahead of page IDs; it never participates in layout.
 function syncTarget(){
  const marker=document.querySelector?.('[data-render-target]');
  if(!marker)return true;
  const raw=location.hash.slice(1)||'home';
  if(document.getElementById('main')?.dataset.route!==raw)return false;
  if(!location.hash)history.replaceState(history.state,'',location.pathname+location.search+'#home');
  let targetId;
  try{targetId=decodeURIComponent(raw);}catch{targetId=new URLSearchParams('r='+raw.replaceAll('+','%2B').replaceAll('&','%26')).get('r');}
  // Tab directories keep hidden URL targets alongside their persistent shells.
  // Drop the generic ID to avoid duplicates. The initial shell needs one
  // retarget; subsequent native tab/history navigations already target it.
  const tabTarget=[...(document.querySelectorAll?.('[data-play-route-target],[data-community-route-target],[data-mypage-route-target],[data-chart-route-target]')||[])].find(target=>target.id===targetId);
  if(tabTarget){
   if(marker.id)marker.removeAttribute('id');
   if(!tabTarget.matches(':target'))location.replace(location.href);
   return tabTarget.matches(':target');
  }
  marker.id=targetId;
  // Updating an ID alone does not update :target. Same-fragment replacement
  // retargets without a new history entry, document reload or hashchange event.
  if(!marker.matches(':target'))location.replace(location.href);
  return marker.matches(':target');
 }
 function arm(){clearTimeout(timer);timer=setTimeout(()=>fail(epoch),20000);}
 window.AifectRender={
  mount,
  syncTarget,
  connect(callback){retry=callback;},
  begin(raw,previous,onTimeout,options={}){
   ++epoch;expired=false;cancel=onTimeout;
   // Retention is opt-in by a router that can update an already mounted shell.
   // It never reveals incomplete bootstrap or bypasses a previous failure.
   if(state()!=='ready'||raw!==previous&&!options.retain){root.dataset.renderState='loading';mount();}
   arm();return epoch;
  },
  ready(id){
   if(id!==epoch||expired||assetsFailed||!syncTarget())return;
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
  const critical=target?.matches?.('link[rel="stylesheet"],script[src]')&&(/^\/?(?:cached-)?aifect-app-[a-f0-9]{16}\.(js|css)(?:\?|$)/.test(asset)||asset==='/canonical-origin.js');
  if(critical){assetsFailed=true;fail();}
  // ResizeObserver defers further layout notifications to the next frame. This
  // browser advisory has no script exception and is not a failed app startup.
  else if(target===window&&!initialized&&state()==='loading'&&(event.error||!/^ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)\.?$/.test(event.message||'')))fail();
 },true);
 window.addEventListener('unhandledrejection',event=>{
  if(!initialized&&state()==='loading'&&event.reason?.name!=='AbortError')fail();
 });
 // Restoring a bfcache entry retains a valid page; an interrupted entry retries.
 window.addEventListener('pageshow',event=>{if(event.persisted&&state()!=='ready'){if(retry)retry();else arm();}});
 arm();
})();
