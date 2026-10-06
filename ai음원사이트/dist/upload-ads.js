/* One in-page display placement per upload. Loading ads never holds an upload,
   opens a popup, or touches the music player. Inventory is off until approved. */
(()=>{
 let owner=null,free=false,generation=0,pending=null,active=null,sdk=null;
 const attempted=new Set();
 const eligible=()=>!!owner&&free&&!inApp;
 const key=()=>`aifect-upload-ads:${owner}`;
 function claim(id){
  if(!id||attempted.has(id))return false;
  attempted.add(id);while(attempted.size>100)attempted.delete(attempted.values().next().value);
  try{sessionStorage.setItem(key(),JSON.stringify([...attempted]));}catch{}
  return true;
 }
 function clear(){active?.observer?.disconnect();if(active?.timer)clearTimeout(active.timer);active?.panel?.remove();active=null;}
 function cancel(){generation++;pending=null;clear();}
 async function config(){
  try{const r=await fetch('/api/ads/upload',{credentials:'same-origin',signal:AbortSignal.timeout(4000)});return r.ok?await r.json():null;}catch{return null;}
 }
 function prepare(client){
  if(sdk)return sdk;
  sdk=new Promise(resolve=>{
   let done=false;const script=document.createElement('script');
   const finish=ok=>{if(done)return;done=true;clearTimeout(timer);resolve(ok);if(!ok){script.remove();sdk=null;}};
   const timer=setTimeout(()=>finish(false),6000);
   script.async=true;script.crossOrigin='anonymous';
   script.src=`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
   script.onload=()=>finish(true);script.onerror=()=>finish(false);document.head.append(script);
  });return sdk;
 }
 async function display(item,host){
  const ticket=generation;clear();
  const valid=()=>ticket===generation&&eligible()&&host.isConnected;
  const settings=await config();
  if(!valid()||!settings?.enabled||!/^ca-pub-\d{16}$/.test(settings.client||'')||!/^\d{10}$/.test(settings.slot||''))return;
  if(!await prepare(settings.client)||!valid())return;
  // Keep controls and ad separate. No modal, floating overlay or autoplay media.
  const panel=document.createElement('aside');panel.className='upload-ad';panel.setAttribute('aria-label','광고');
  const label=document.createElement('span');label.className='upload-ad-label';label.textContent='광고';
  const slot=document.createElement('ins');slot.className='adsbygoogle';slot.style.display='block';
  slot.setAttribute('data-ad-client',settings.client);slot.setAttribute('data-ad-slot',settings.slot);
  slot.setAttribute('data-ad-format','horizontal');slot.setAttribute('data-full-width-responsive','false');
  panel.append(label,slot);
  if(host.id==='main')host.firstElementChild?.after(panel);else host.append(panel);
  if(slot.getBoundingClientRect().width<=0){panel.remove();return;}
  const state={panel,slot};active=state;
  state.observer=new MutationObserver(()=>{
   if(active!==state)return;
   const status=slot.getAttribute('data-ad-status');
   if(status==='unfilled'||status==='unfill-optimized')clear();
   else if(status==='filled')clearTimeout(state.timer);
  });state.observer.observe(slot,{attributes:true,attributeFilter:['data-ad-status']});
  state.timer=setTimeout(()=>{if(active===state&&slot.getAttribute('data-ad-status')!=='filled')clear();},10000);
  try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch{clear();}
 }
 function run(item,host){if(host)void display(item,host).catch(()=>{});}
 window.AifectUploadAds={
  setMembership(value,id){
   const next=id||null,nextFree=value?.plan==='free';
   if(next===owner&&nextFree===free)return;
   cancel();owner=next;free=nextFree;attempted.clear();
   try{const stored=JSON.parse(sessionStorage.getItem(key())||'[]');if(Array.isArray(stored))stored.filter(x=>typeof x==='string').slice(-100).forEach(id=>attempted.add(id));}catch{}
  },
  duringOriginalUpload(id,form){
   if(!eligible()||!form?.isConnected||!claim(id))return;
   cancel();run({id},form);
  },
  afterCoverUpload(id){
   if(!eligible()||!claim(id))return;
   cancel();pending={id};this.routeReady('studio');
  },
  routeReady(base){
   const main=document.querySelector('#main');
   if(base!=='studio'||location.hash!=='#studio'||main?.dataset.route!=='studio'||main.hasAttribute('aria-busy')||!pending)return;
   const item=pending;pending=null;run(item,main);
  },
  cancel
 };
 window.addEventListener('hashchange',()=>{
  // A cover finishes just before the studio route mounts. Keep only that request.
  if(pending&&location.hash==='#studio'){generation++;clear();return;}
  cancel();
 });
})();
