/* Google IMA audio-only VAST. The server returns disabled until real inventory
   is configured. No sample ads, display ads or fallback banners are requested. */
(()=>{
 let userId=null,free=false,config=null,generation=0,sdkPromise=null,display=null,loader=null,initialized=false,active=null,requestId=0;
 let cadence=AifectAudioAdsCore.createAudioAdCadence();
 const storageKey=()=>`aifect-audio-ad-count:${userId}`;
 const eligible=()=>free&&!!userId&&!inApp;
 const panel=$('.player'),controls=['#previous','#next','#seek','#shuffle','#repeat'];
 const container=document.createElement('div');container.id='ima-audio-container';document.body.append(container);
 async function getConfig(){
  try{const response=await fetch('/api/ads/audio',{credentials:'same-origin',signal:AbortSignal.timeout(4000)});return response.ok?await response.json():null;}catch{return null;}
 }
 function initialize(){if(display&&!initialized){try{display.initialize();initialized=true;}catch{}}}
 // IMA initialization must occur in a user gesture, including on mobile browsers.
 document.addEventListener('click',event=>{if(event.isTrusted&&eligible())initialize();},{capture:true});
 function prepare(){
  if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise(resolve=>{
   let settled=false;
   const done=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
   const timer=setTimeout(()=>done(false),8000);
   const script=document.createElement('script');script.async=true;script.src='https://imasdk.googleapis.com/js/sdkloader/ima3.js';
   script.onerror=()=>done(false);
   script.onload=()=>{
    if(settled)return;
    try{
     const ima=window.google.ima;
     display=new ima.AdDisplayContainer(container,audio);loader=new ima.AdsLoader(display);
     loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,managerLoaded,false);
     loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR,event=>{if(active?.id===event.getUserRequestContext()?.id)finish(active);},false);
     done(true);
    }catch{done(false);}
   };document.head.append(script);
  });return sdkPromise;
 }
 function playingUI(paused){
  if(!active)return;active.paused=paused;
  $('#play-toggle').innerHTML=paused?icon('play'):'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
  $('#play-toggle').setAttribute('aria-label',paused?'광고 이어 듣기':'광고 일시정지');
  if('mediaSession' in navigator)navigator.mediaSession.playbackState=paused?'paused':'playing';
 }
 function finish(item){
  if(!item||active!==item)return;
  clearTimeout(item.timeout);clearInterval(item.watchdog);
  // Keep the audio event guard active until IMA has released custom playback.
  try{item.manager?.destroy();}catch{}audio.pause();
  active=null;
  try{loader?.contentComplete();}catch{}
  panel.classList.remove('audio-ad-active');controls.forEach((s,i)=>$(s).disabled=item.disabled[i]);
  $('#now-playing').innerHTML=item.markup;$('#listen-mode').textContent=item.mode;
  $('#play-toggle').innerHTML=icon('play');$('#play-toggle').setAttribute('aria-label','재생');
  window.dispatchEvent(new Event('aifect-ad-end'));item.resolve();
 }
 function managerLoaded(event){
  const item=active,ima=window.google.ima;
  if(!item||item.id!==event.getUserRequestContext()?.id){try{event.getAdsManager(audio).destroy();}catch{}return;}
  const settings=new ima.AdsRenderingSettings();settings.restoreCustomPlaybackStateOnAdBreakComplete=true;settings.loadVideoTimeout=8000;
  let manager;
  try{manager=event.getAdsManager(audio,settings);}catch{finish(item);return;}
  item.manager=manager;
  const listen=(name,fn)=>manager.addEventListener(ima.AdEvent.Type[name],()=>{if(active===item)fn();},false);
  manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR,()=>finish(item),false);
  for(const name of ['CONTENT_RESUME_REQUESTED','ALL_ADS_COMPLETED'])listen(name,()=>finish(item));
  listen('CONTENT_PAUSE_REQUESTED',()=>audio.pause());
  listen('STARTED',()=>{clearTimeout(item.timeout);item.progressAt=Date.now();playingUI(false);});
  listen('PAUSED',()=>playingUI(true));
  listen('RESUMED',()=>{item.progressAt=Date.now();playingUI(false);});
  listen('AD_PROGRESS',()=>{
   const remaining=manager.getRemainingTime();
   if(remaining!==item.remaining){item.progressAt=Date.now();item.remaining=remaining;}
   $('#audio-ad-status').textContent=Number.isFinite(remaining)&&remaining>=0?`${Math.ceil(remaining)}초 후 음악이 이어집니다`:'광고 후 음악이 이어집니다';
   $('#audio-ad-skip').hidden=!manager.getAdSkippableState();
  });
  listen('SKIPPABLE_STATE_CHANGED',()=>{$('#audio-ad-skip').hidden=!manager.getAdSkippableState();});
  item.watchdog=setInterval(()=>{if(!item.paused&&Date.now()-item.progressAt>15000)finish(item);},1000);
  try{manager.setVolume(audio.volume);manager.init(640,100,ima.ViewMode.NORMAL);manager.start();}catch{finish(item);}
 }
 async function beforeTrack(){
  if(active){await active.promise;return;}
  if(!eligible()||!config?.enabled||!cadence.due||audio.volume===0||audio.muted)return;
  // Do not initialize outside a gesture or interrupt music to request permission.
  if(!initialized)return;
  const identity=generation;
  const fresh=await getConfig();
  if(identity!==generation||!eligible())return;
  if(!fresh){cadence.attempted();return;}
  config=fresh;if(!config.enabled)return;
  if(active){await active.promise;return;}
  cadence.attempted();
  const item={id:++requestId,paused:false,progressAt:Date.now(),remaining:null,markup:$('#now-playing').innerHTML,mode:$('#listen-mode').textContent,disabled:controls.map(s=>$(s).disabled)};
  item.promise=new Promise(resolve=>item.resolve=resolve);active=item;
  audio.pause();setPlayerVisible(true);panel.classList.add('audio-ad-active');controls.forEach(s=>$(s).disabled=true);
  $('#now-playing').innerHTML='<span class="audio-ad-label">광고</span><div><strong>AIFECT 무료 음악 감상</strong><span id="audio-ad-status" role="status">음성광고를 준비하고 있어요</span></div><button type="button" id="audio-ad-skip" hidden>광고 건너뛰기</button>';
  $('#listen-mode').textContent='음성광고';$('#play-toggle').setAttribute('aria-label','광고 일시정지');
  $('#audio-ad-skip').onclick=()=>{if(item.manager?.getAdSkippableState())item.manager.skip();};
  window.dispatchEvent(new Event('aifect-ad-start'));
  item.timeout=setTimeout(()=>finish(item),8000);
  try{
   const ima=window.google.ima,request=new ima.AdsRequest(),tag=new URL(config.tag);
   tag.searchParams.set('correlator',String(Date.now()));
   // Never send the current browser URL: it can contain authentication parameters.
   tag.searchParams.set('description_url','https://aifect.co.kr/');
   request.adTagUrl=tag.href;request.linearAdSlotWidth=640;request.linearAdSlotHeight=100;
   request.setAdWillAutoPlay(true);request.setAdWillPlayMuted(false);
   loader.requestAds(request,{id:item.id});
  }catch{finish(item);}
  await item.promise;
 }
 window.AifectAudioAds={
  get active(){return !!active;},
  setMembership(value,id){
   const changed=userId!==(id||null);generation++;userId=id||null;free=value?.plan==='free';config=null;
   if(changed){finish(active);let saved=0;try{saved=sessionStorage.getItem(storageKey());}catch{}cadence=AifectAudioAdsCore.createAudioAdCadence(saved,count=>{try{sessionStorage.setItem(storageKey(),String(count));}catch{}});}
   if(!eligible()){finish(active);cadence.reset();return;}
   const identity=generation;
   void getConfig().then(value=>{if(identity!==generation)return;config=value;if(config?.enabled)void prepare();});
  },
  completed(value){if(eligible()&&config?.enabled)cadence.complete(value);},
  beforeTrack,
  cancel(){generation++;finish(active);},
  pause(){if(active?.manager)active.manager.pause();},
  resume(){if(active?.manager)active.manager.resume();},
  toggle(){if(active?.manager){if(active.paused)active.manager.resume();else active.manager.pause();}},
  volume(value){active?.manager?.setVolume(value);}
 };
})();
