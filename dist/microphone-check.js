// Input-only meter: never records, uploads or plays the microphone through speakers.
window.AifectMicrophoneCheck=(()=>{
 const help='말하거나 손뼉을 쳐서 입력을 확인하세요. 테스트 소리는 저장되지 않아요.';
 function html(){return `<section class="microphone-check" aria-label="마이크 연결 확인"><div class="microphone-check-info"><strong data-mic-status role="status" aria-live="polite">마이크 연결 안 됨</strong><small data-mic-device>녹음 전에 마이크를 켜서 확인하세요.</small></div><div class="microphone-check-input"><div class="microphone-check-bars" role="meter" aria-label="마이크 입력 음량" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${'<i></i>'.repeat(16)}</div><small data-mic-hint>${help}</small></div><button type="button" class="small-button" data-mic-toggle aria-pressed="false">마이크 켜기</button></section>`;}
 function bind(root,{beforeTest=()=>{}}={}){
  if(!root)return;
  const status=root.querySelector('[data-mic-status]'),device=root.querySelector('[data-mic-device]'),hint=root.querySelector('[data-mic-hint]'),button=root.querySelector('[data-mic-toggle]'),meter=root.querySelector('[role="meter"]'),bars=[...meter.children];
  let serial=0,closed=false,busy=false,pending=false,pendingContext=null,current=null,frame=0;
  const set=(text,note=current&&!current.owned?'녹음·모니터링에 사용 중인 마이크 입력이에요.':help)=>{if(closed)return;if(status.textContent!==text)status.textContent=text;hint.textContent=note;};
  const controls=()=>{button.disabled=busy||!!current&&!current.owned;button.textContent=pending?'취소':current?(current.owned?'마이크 끄기':'마이크 사용 중'):'마이크 켜기';button.setAttribute('aria-pressed',String(!!current));};
  const level=value=>{meter.setAttribute('aria-valuenow',String(value));bars.forEach((bar,i)=>bar.classList.toggle('is-active',i<Math.ceil(value/100*bars.length)));};
  function release(){
   ++serial;pending=false;pendingContext?.close().catch(()=>{});pendingContext=null;cancelAnimationFrame(frame);frame=0;
   const old=current;current=null;
   if(old){for(const remove of old.listeners)remove();for(const n of [old.source,old.analyser,old.mute])try{n.disconnect();}catch{}
    if(old.owned){old.stream.getTracks().forEach(t=>t.stop());old.ctx.close().catch(()=>{});}}
   level(0);root.classList.remove('is-connected');controls();
  }
  function stop(message='마이크 연결 안 됨'){release();device.textContent='녹음 전에 마이크를 켜서 확인하세요.';set(message);}
  function error(err){
   stop();const message={NotAllowedError:'마이크 권한이 꺼져 있어요',SecurityError:'마이크 권한이 꺼져 있어요',NotFoundError:'연결된 마이크가 없어요',DevicesNotFoundError:'연결된 마이크가 없어요',NotReadableError:'마이크를 사용할 수 없어요',AbortError:'마이크 연결이 중단됐어요'}[err?.name]||'마이크 입력을 확인하지 못했어요';
   const note=err?.name==='NotAllowedError'||err?.name==='SecurityError'?'주소창의 사이트 권한에서 마이크를 허용한 뒤 다시 켜주세요.':err?.name==='NotFoundError'?'마이크를 연결한 뒤 다시 켜주세요.':'다른 앱의 마이크 사용과 브라우저 입력 장치를 확인한 뒤 다시 켜주세요.';
   set(message,note);
  }
  function connect(stream,ctx,owned){
   const track=stream.getAudioTracks().find(t=>t.readyState==='live');
   if(!track)throw Object.assign(Error('No live microphone'),{name:'NotFoundError'});
   const item={stream,ctx,owned,listeners:[],source:null,analyser:null,mute:null,connectedAt:performance.now(),lastSignal:-Infinity,lastText:0};current=item;
   item.source=ctx.createMediaStreamSource(stream);item.analyser=ctx.createAnalyser();item.analyser.fftSize=1024;
   item.mute=ctx.createGain();item.mute.gain.value=0;item.source.connect(item.analyser).connect(item.mute).connect(ctx.destination);
   const samples=new Float32Array(item.analyser.fftSize);
   device.textContent=track.label||'기본 마이크';root.classList.add('is-connected');set('마이크 연결됨 · 소리를 내보세요');controls();
   const ended=()=>{if(current===item)stop('마이크 연결이 끊겼어요');};track.addEventListener('ended',ended);item.listeners.push(()=>track.removeEventListener('ended',ended));
   function tick(){
    if(closed||current!==item)return;
    if(track.readyState!=='live'){ended();return;}
    item.analyser.getFloatTimeDomainData(samples);let sum=0;for(const sample of samples)sum+=sample*sample;
    const rms=Math.sqrt(sum/samples.length),now=performance.now(),usable=ctx.state==='running'&&track.enabled&&!track.muted;
    const value=usable?Math.min(100,Math.round(Math.sqrt(rms)*200)):0;level(value);
    if(usable&&rms>.003)item.lastSignal=now;
    if(now-item.lastText>500){item.lastText=now;
     if(!track.enabled||track.muted)set('마이크 입력이 음소거됐어요','장치의 음소거와 브라우저 입력 설정을 확인하세요.');
     else if(ctx.state!=='running')set('마이크 입력이 일시정지됐어요','화면으로 돌아와 마이크를 다시 켜주세요.');
     else if(now-item.lastSignal<800)set('마이크 연결됨 · 입력 감지됨');
     else if(now-Math.max(item.connectedAt,item.lastSignal)>4000)set('마이크 연결됨 · 소리가 감지되지 않아요','말해도 표시가 움직이지 않으면 입력 장치와 음소거를 확인하세요.');
     else set('마이크 연결됨 · 소리를 내보세요');
    }
    frame=requestAnimationFrame(tick);
   }
   tick();
  }
  async function start(){
   if(closed||busy||current&&!current.owned)return;
   stop();beforeTest();
   if(!navigator.mediaDevices?.getUserMedia||!(window.AudioContext||window.webkitAudioContext)){set('이 브라우저에서는 마이크를 사용할 수 없어요','HTTPS 주소에서 최신 Chrome, Edge 또는 Safari로 열어주세요.');return;}
   const request=++serial;let ctx,stream;pending=true;set('마이크 권한 확인 중…','브라우저에서 마이크 접근을 허용해주세요.');controls();
   try{
    ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});pendingContext=ctx;
    const ready=ctx.resume();ready.catch(()=>{});
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    if(closed||serial!==request||document.hidden){stream.getTracks().forEach(t=>t.stop());await ctx.close();return;}
    await ready;if(ctx.state!=='running')throw Error('Audio suspended');
    if(closed||serial!==request||document.hidden){stream.getTracks().forEach(t=>t.stop());await ctx.close();return;}
    pending=false;pendingContext=null;connect(stream,ctx,true);
   }catch(err){
    const relevant=!closed&&serial===request;
    if(current&&current.stream===stream)release();else{stream?.getTracks().forEach(t=>t.stop());ctx?.close().catch(()=>{});}
    if(relevant){pendingContext=null;pending=false;error(err);}
   }
  }
  function attach(stream,ctx){
   if(closed)return;release();
   // Borrow the recorder/monitor stream; only its owner may close it.
   try{connect(stream,ctx,false);}catch{release();set('마이크 입력 표시를 사용할 수 없어요','녹음 상태와 브라우저의 입력 장치를 확인하세요.');}
  }
  const hidden=()=>{if(document.hidden)stop('마이크 확인이 중지됐어요');};
  const pagehide=()=>stop('마이크 확인이 중지됐어요');
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pagehide);
  button.onclick=()=>pending||current?stop():void start();
  return {start,stop,error,attach,detach(stream){if(current?.stream===stream)stop();},setBusy(value){busy=!!value;controls();},prepare(){stop();set('마이크 연결 중…');},destroy(){stop();closed=true;button.onclick=null;document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pagehide);}};
 }
 return {html,bind};
})();
