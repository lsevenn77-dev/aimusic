// Lock screen, notification and headset controls for the player.
// Inside the Android/iOS app the native MediaSession plugin also keeps playback alive in the background;
// in browsers the standard Media Session API gives the same controls where supported.
(()=>{
 const native=window.Capacitor?.isNativePlatform?.()&&window.Capacitor.Plugins?.MediaSession;
 const web=!native&&'mediaSession' in navigator?navigator.mediaSession:null;
 if(!native&&!web)return;
 const call=(method,...args)=>{try{const r=native?native[method](...args):null;r?.catch?.(()=>{});}catch{}};
 const absolute=path=>new URL(path,location.origin).href;
 function artwork(t){
  const art=t.has_cover?[t.id,t.cover_version]:t.original_has_cover?[t.original_id,t.original_cover_version]:null;
  return [{src:art?absolute(`/media/${art[0]}/cover?v=${art[1]||'original'}`):absolute('/assets/aifect-mark.svg'),sizes:'512x512',type:art?'image/jpeg':'image/svg+xml'}];
 }
 let shownId=null,lastPosition=0;
 function metadata(){
  if(!current||current.id===shownId)return;shownId=current.id;
  const data={title:current.title,artist:current.artist||'',album:'AIFECT',artwork:artwork(current)};
  if(native)call('setMetadata',data);else web.metadata=new MediaMetadata(data);
 }
 function state(value){if(native)call('setPlaybackState',{playbackState:value});else web.playbackState=value;}
 function position(force=false){
  const duration=audio.duration,now=Date.now();
  if(!Number.isFinite(duration)||duration<=0||(!force&&now-lastPosition<5000))return;lastPosition=now;
  const data={duration,playbackRate:audio.playbackRate||1,position:Math.min(audio.currentTime,duration)};
  if(native)call('setPositionState',data);else try{web.setPositionState(data);}catch{}
 }
 audio.addEventListener('play',()=>{metadata();state('playing');position(true);});
 audio.addEventListener('pause',()=>{state('paused');position(true);});
 audio.addEventListener('emptied',()=>{if(!audio.src){shownId=null;state('none');}});
 audio.addEventListener('seeked',()=>position(true));
 audio.addEventListener('timeupdate',()=>position());
 const seek=seconds=>{if(Number.isFinite(seconds))audio.currentTime=Math.max(0,Math.min(seconds,audio.duration||seconds));};
 const handlers={
  play:()=>audio.play().catch(()=>{}),
  pause:()=>audio.pause(),
  previoustrack:()=>nextTrack(-1),
  nexttrack:()=>nextTrack(1),
  seekto:d=>seek(d?.seekTime),
  seekbackward:()=>seek(audio.currentTime-10),
  seekforward:()=>seek(audio.currentTime+10),
  stop:()=>audio.pause(),
 };
 for(const [action,handler] of Object.entries(handlers)){
  if(native)call('setActionHandler',{action},details=>{try{handler(details);}catch{}});
  else try{web.setActionHandler(action,handler);}catch{}
 }
})();
