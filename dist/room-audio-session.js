// A browser audio interruption is not necessarily a phone call. Keep this
// best-effort web guard separate from native telephony/background capabilities.
class RoomAudioSession {
 constructor(client){
  this.client=client;client.roomAudio=this;this.blocked=false;this.micNeedsGesture=false;this.disposed=false;this.revision=0;this.tracks=new Map();
  try{this.session=navigator.audioSession;this.previousType=this.session?.type;}catch{}
  this.onSessionState=()=>{
   if(this.session?.state==='interrupted')this.interrupt('session');
   else if(this.blocked&&this.session?.state==='active')this.recover();
  };
  this.session?.addEventListener?.('statechange',this.onSessionState);
  this.onNativeCall=event=>{
   this.callActive=event?.detail?.active===true;
   if(this.callActive){this.interrupt('call');this.finishCallTurn();}
   else this.recover();
  };
  this.onOnline=()=>{if(this.callTurn&&!this.callTask)this.finishCallTurn();};
  window.addEventListener('aifect:native-call',this.onNativeCall);
  window.addEventListener('online',this.onOnline);
  this.globalAudio=typeof audio!=='undefined'?audio:null;
  this.onGlobalPlay=()=>{if(this.blocked&&!this.disposed)this.quietGlobal();};
  this.globalAudio?.addEventListener?.('play',this.onGlobalPlay);
  this.onSessionState();this.updateType();
  if(window.AifectNativeCall?.active)this.onNativeCall({detail:window.AifectNativeCall});
 }
 setType(type){
  if(this.disposed||this.blocked||!this.session)return;
  try{if(this.session.type!==type)this.session.type=type;}catch{/* Partial implementations may support fewer types. */}
 }
 updateType(){
  const c=this.client;
  // A mode change retires capture without disposing the shared room session.
  // Drop only ended tracks; live capture/test tracks still guard interruptions.
  for(const [track,handler] of this.tracks)if(track.readyState==='ended'){
   track.removeEventListener?.('mute',handler);this.tracks.delete(track);
  }
  const captures=[c.stream,c.pendingStream,c.testRaw,c.testGraph?.stream].some(s=>s?.getAudioTracks?.().some(t=>t.readyState!=='ended'));
  this.setType(captures?'play-and-record':'playback');
 }
 watchMicrophone(stream){
  const c=this.client,tracks=stream?.getAudioTracks?.()||[];
  const belongs=()=>[c.stream,c.pendingStream,c.testRaw].includes(stream);
  if(this.disposed||this.blocked||this.micNeedsGesture){tracks.forEach(t=>{t.enabled=false;t.stop?.();});return false;}
  for(const track of tracks){
   if(!this.tracks.has(track)){
    const muted=()=>{if(!this.disposed&&belongs()&&track.readyState!=='ended')this.interrupt('microphone');};
    track.addEventListener?.('mute',muted);this.tracks.set(track,muted);
   }
   if(track.muted){this.interrupt('microphone');tracks.forEach(t=>{t.enabled=false;t.stop?.();});return false;}
  }
  return true;
 }
 contextChanged(context,{capture=false}={}){
  if(this.disposed||this.client.closed)return;
  // Never replace an interrupted processing graph with an audible raw mic.
  if(context?.state==='interrupted'||capture&&context?.state==='suspended')this.interrupt('context');
  else if(context?.state==='running'&&this.blocked&&this.session?.state!=='interrupted')this.recover();
 }
 zeroGain(node,context){
  const gain=node?.gain;if(!gain)return;
  const now=context?.currentTime||0;
  try{gain.cancelScheduledValues?.(now);if(gain.setValueAtTime)gain.setValueAtTime(0,now);else gain.value=0;}catch{}
 }
 quietElement(element){
  if(!element)return;
  element.muted=true;element.pause?.();
  this.zeroGain(element.voiceGain,this.client.levelContext);
 }
 quietGlobal(){
  if(this.globalAudio){
   if(!this.globalBefore)this.globalBefore={muted:this.globalAudio.muted};
   this.globalAudio.muted=true;this.globalAudio.pause?.();
  }
  // IMA can own its own output even when the shared player is paused.
  window.AifectAudioAds?.cancel?.();
 }
 quietOutputs(){
  const c=this.client;
  for(const element of new Set([...(c.audios?.values()||[]),c.musicAudio,c.liveAudio]))this.quietElement(element);
  this.zeroGain(c.livePitch?.gain,c.levelContext);
  this.zeroGain(c.liveMonitorTap?.gain,c.liveMonitorTap?.context);
  this.quietGlobal();
 }
 interrupt(reason){
  const c=this.client;if(this.disposed||c.closed)return;
  if(this.blocked){this.quietOutputs();return;}
  this.blocked=true;this.micNeedsGesture=true;this.reason=reason;this.revision++;
  c.micDesired=false;c.foregroundMicDesired=false;c.micIntentRevision=(c.micIntentRevision||0)+1;c.micAttempt=(c.micAttempt||0)+1;c.micBusy=false;
  c.setCaptureEnabled?.(false);this.quietOutputs();
  c.stopMicTest?.();c.stopMicrophone?.();c.micState='muted';c.warmSeat=c.generation;
  const generation=c.generation;
  // Retire the server publication as well. A later explicit enable waits for
  // this request so an old mute cannot retire its newly created publisher.
  if(c.joined&&c.command)this.muteTask=Promise.resolve().then(()=>c.command('mute')).then(state=>{
   if(!c.closed&&generation===c.generation&&state)c.acceptState?.(state);
  }).catch(()=>{/* The local track and publisher are already closed. */});
  c.paint?.();c.updateListening?.();
  c.status?.('기기 오디오가 일시 중단됐어요. 소리와 마이크를 껐어요.');
 }
 finishCallTurn(){
  const c=this.client,active=c.state?.karaoke?.active;
  if(this.disposed||c.closed||this.callTask)return this.callTask;
  // A listener (including the host) must never end another person's song.
  if(!this.callTurn){
   if(!active||active.user_id!==c.state.self)return;
   this.callTurn={id:active.invitation_id,generation:c.generation,request:crypto.randomUUID()};
  }
  const turn=this.callTurn;
  const current=()=>!this.disposed&&!c.closed&&c.generation===turn.generation&&c.state?.karaoke?.active?.invitation_id===turn.id&&c.state.karaoke.active.user_id===c.state.self;
  this.callTask=(async()=>{
   for(let attempt=0;attempt<3&&current();attempt++){
    try{
     const state=await c.command('karaoke',{operation:'abandon',invitation_id:turn.id,request_id:turn.request});
     if(!this.disposed&&!c.closed&&c.generation===turn.generation&&state)c.acceptState?.(state);
     this.callTurn=null;
     c.status?.('통화로 노래를 종료하고 다음 차례로 넘겼어요.');return;
    }catch{
     if(attempt<2)await new Promise(resolve=>{this.callRetryResolve=resolve;this.callRetryTimer=setTimeout(resolve,500*(attempt+1));});
    }
   }
   if(!current())this.callTurn=null;
   else c.status?.('노래는 중단됐어요. 연결이 돌아오면 차례 종료를 다시 요청해요.');
  })().finally(()=>{this.callTask=null;this.callRetryResolve=null;if(!this.callActive&&!this.callTurn)this.recover();});
  return this.callTask;
 }
 recover(){
  const c=this.client;
  if(this.disposed||c.closed||!this.blocked||this.callActive||this.callTurn||this.session?.state==='interrupted')return false;
  this.blocked=false;this.revision++;this.updateType();this.restoreGlobal();
  c.micDesired=false;c.foregroundMicDesired=false;
  c.liveNeedsResync=true;c.livePlayBlocked=false;c.musicBlocked=false;
  c.resumeSound?.();
  if(c.liveMode&&typeof liveSync==='function')liveSync(c);
  c.updateListening?.();
  return true;
 }
 async resumeByUser(){
  if(this.disposed||this.client.closed)return false;
  if(!this.blocked)return true;
  if(this.callActive||this.session?.state==='interrupted'){
   this.client.status?.('기기 오디오 사용이 끝난 뒤 다시 켜주세요.');return false;
  }
  const revision=this.revision,context=this.client.levelContext;
  try{await context?.resume?.();}catch{return false;}
  if(this.disposed||this.client.closed||this.session?.state==='interrupted')return false;
  if(revision!==this.revision)return !this.blocked;
  if(context&&context.state!=='running')return false;
  return this.recover();
 }
 async allowCapture(userInitiated=false){
  if(this.disposed||this.client.closed)return false;
  if(userInitiated){
   const intentRevision=this.client.micIntentRevision||0;
   if(this.blocked&&!await this.resumeByUser())return false;
   await this.muteTask;await this.callTask;
   if(this.callTurn)return false;
   if(this.disposed||this.client.closed||this.blocked||intentRevision!==(this.client.micIntentRevision||0))return false;
   this.micNeedsGesture=false;
  }else if(this.blocked||this.micNeedsGesture)return false;
  this.setType('play-and-record');return true;
 }
 restoreGlobal(){
  if(this.globalBefore&&this.globalAudio)this.globalAudio.muted=this.globalBefore.muted;
  this.globalBefore=null;
 }
 dispose(){
  if(this.disposed)return;
  this.disposed=true;this.revision++;
  this.session?.removeEventListener?.('statechange',this.onSessionState);
  window.removeEventListener('aifect:native-call',this.onNativeCall);
  window.removeEventListener('online',this.onOnline);
  clearTimeout(this.callRetryTimer);this.callRetryResolve?.();this.callTurn=null;
  this.globalAudio?.removeEventListener?.('play',this.onGlobalPlay);
  for(const [track,handler] of this.tracks)track.removeEventListener?.('mute',handler);
  this.tracks.clear();this.restoreGlobal();
  try{if(this.session&&this.previousType)this.session.type=this.previousType;}catch{}
 }
}
