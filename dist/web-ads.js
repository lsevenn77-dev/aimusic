/* One manual AdSense banner per document. No timers, song events or SPA ad refresh. */
(() => {
 const client='ca-pub-5910265378731607',slot='9273951798';
 const host=document.getElementById('web-ad');
 if(!host)return;
 const privacy=document.getElementById('ad-privacy');
 window.googlefc=window.googlefc||{};window.googlefc.callbackQueue=window.googlefc.callbackQueue||[];
 window.googlefc.callbackQueue.push({CONSENT_API_READY:()=>{
  if(!privacy||typeof window.__tcfapi!=='function')return;
  window.__tcfapi('addEventListener',0,(data,success)=>{privacy.hidden=!(success&&data?.gdprApplies);});
 }});
 if(privacy)privacy.onclick=()=>window.googlefc.callbackQueue.push({CONSENT_API_READY:()=>window.googlefc.showRevocationMessage()});
 const publicRoutes=new Set(['home','discover','charts','karaoke','community','artists','producers','artist','producer','song','collections','collection']);
 let accountKnown=false,premium=false,ready=false,near=false,loaded=false,loading=false,requested=false,failed=false,retired=false;
 let ins=null,observer=null,timeout=null;
 const allowed=()=>location.hostname==='aifect.co.kr'&&location.protocol==='https:'&&!window.Capacitor?.isNativePlatform?.()&&accountKnown&&!premium&&ready&&publicRoutes.has((location.hash.slice(1)||'home').split(/[/?]/)[0])&&!!document.querySelector('#main [data-play]');
 function update(){
  host.hidden=!allowed()||failed||retired||ins?.dataset.adStatus==='unfilled';
  if(!host.hidden&&near&&document.visibilityState==='visible')load();
 }
 function fail(){failed=true;clearTimeout(timeout);host.hidden=true;}
 function request(){
  if(requested||!allowed()||!near||retired||failed||document.visibilityState!=='visible')return;
  requested=true;
  ins=document.createElement('ins');ins.className='adsbygoogle';ins.style.display='block';
  ins.dataset.adClient=client;ins.dataset.adSlot=slot;ins.dataset.adFormat='horizontal';ins.dataset.fullWidthResponsive='false';
  host.append(ins);
  observer=new MutationObserver(()=>{
   if(ins.dataset.adStatus){clearTimeout(timeout);update();}
  });
  observer.observe(ins,{attributes:true,attributeFilter:['data-ad-status']});
  try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch{fail();}
  // A blocked/slow request must not leave an empty advertisement panel indefinitely.
  timeout=setTimeout(()=>{if(ins?.dataset.adStatus!=='filled')fail();},45000);
 }
 function load(){
  if(loaded){request();return;}if(loading)return;
  loading=true;
  const script=document.createElement('script');script.async=true;script.crossOrigin='anonymous';
  script.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+client;
  script.onload=()=>{clearTimeout(timeout);loaded=true;request();};script.onerror=fail;document.head.append(script);
  timeout=setTimeout(()=>{if(!loaded)fail();},20000);
 }
 const visibility=new IntersectionObserver(entries=>{near=entries.some(e=>e.isIntersecting);if(near)update();},{rootMargin:'200px'});
 visibility.observe(host);
 window.addEventListener('hashchange',()=>{ready=false;update();});
 document.addEventListener('visibilitychange',update);
 window.AifectWebAds={
  setMembership(value){
   accountKnown=true;premium=value?.plan==='premium';
   if(premium&&loading){retired=true;clearTimeout(timeout);observer?.disconnect();ins?.remove();}
   update();
  },
  pageLoading(){ready=false;update();},
  pageReady(){ready=true;update();}
 };
})();
