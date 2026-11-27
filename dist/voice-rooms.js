// Voice rooms deliberately do not share the recorder's media graph or MediaRecorder.
let voiceController=null;
function setVoiceFocus(active){
 document.documentElement?.toggleAttribute('data-room-mobile',active&&window.innerWidth<=800);
 document.querySelector?.('#main')?.toggleAttribute('data-room-entered',active);
 document.querySelector?.('.page-wrap')?.toggleAttribute('data-room-focus',active&&window.innerWidth<=800);
 document.querySelector?.('#main')?.toggleAttribute('data-room-focus',active&&window.innerWidth<=800);
}

let voiceEntryAudio=null;
function prepareVoiceListening(id=null){
 // Keep the room-entry gesture across routing/API awaits. This opens playback
 // only: listeners never need microphone permission or a publishing seat.
 if(voiceController&&!voiceController.closed&&voiceController.id===id){voiceController.resumeSound();return;}
 if(voiceEntryAudio){clearTimeout(voiceEntryAudio.timer);void voiceEntryAudio.context.close().catch(()=>{});voiceEntryAudio=null;}
 try{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
  const pending=voiceEntryAudio={id,context:new Context({latencyHint:'interactive'})};
  void pending.context.resume().catch(()=>{});
  pending.timer=setTimeout(()=>{if(voiceEntryAudio===pending){voiceEntryAudio=null;void pending.context.close().catch(()=>{});}},15000);
 }catch{/* The room's explicit listening button remains available. */}
}
function prepareVoiceEntryClick(e){
 if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||typeof me==='undefined'||!me)return;
 const link=e.target.closest?.('a[href]');if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
 const url=new URL(link.href,location.href),match=url.hash.match(/^#voice\/([^/?#]+)$/);
 if(match&&url.origin===location.origin&&url.pathname===location.pathname&&url.search===location.search)prepareVoiceListening(match[1]);
}
if(typeof document!=='undefined')document.addEventListener('click',prepareVoiceEntryClick);
function talkGiftPeople(from,to){
 return `<span class="talk-gift-from">${esc(from)}</span><img class="talk-gift-direction" src="/assets/gift-direction-double-chevron.svg" alt=""><span class="talk-gift-to">${esc(to)}</span>`;
}
function roomGiftAsset(value){return typeof catalogImagePath==='function'&&catalogImagePath(value)?value:null;}
function voiceChatMessageHTML(m,liveMode=false){
 const time='';
 if(m.kind==='system')return `<article class="voice-chat-system"><p>${esc(m.body).replace(/라이브 노래방|토킹룸|방 설정/g,word=>'<strong>'+word+'</strong>')}</p>${time}</article>`;
 if(m.kind==='gift'){
  const image=roomGiftAsset(m.gift?.image);
  const gift=image?{image}:AifectGifts.giftById(m.gift?.type);
  if(!liveMode){
   if(!m.name||!m.recipient_name||!m.gift?.name||!m.gift.quantity)return `<article class="talk-gift-notice">${esc(m.body)}</article>`;
   const item=`${esc(m.gift.name)} ×${number(m.gift.quantity)}`;
   return `<article class="talk-gift-notice"><span class="sr-only">${esc(m.name)}님이 ${esc(m.recipient_name)}님에게 ${esc(m.gift.name)} ${number(m.gift.quantity)}개를 보냈습니다.</span>${gift?giftArt(gift):''}<span aria-hidden="true">${talkGiftPeople(m.name,m.recipient_name)} · ${item}</span></article>`;
  }
  return `<article class="voice-chat-gift"><header><b>${icon('gift')} 선물 알림</b>${time}</header><div class="voice-chat-gift-body">${gift?giftArt(gift):''}<p>${esc(m.body)}</p></div></article>`;
 }
 return `<article class="voice-chat-message"><span class="voice-chat-avatar">${avatarImage({name:m.name,profile_id:m.profile_id,user_id:m.user_id,image_version:m.image_version})}</span><div><header><b>${memberNickname(m)}</b>${time}</header><p>${m.body?.includes('[aifect:')?AifectStickers.render(m.body,esc):esc(m.body)}</p></div></article>`;
}
async function voiceRequest(path,body,method=body===undefined?'GET':'POST',signal) {
 const r=await fetch('/api/voice/'+path,{method,signal,credentials:'same-origin',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error||'토킹룸 연결에 실패했습니다.'),{status:r.status});return data;
}
// Retry only a known, unallocated publication rejected while the previous one
// retires. The capture stays silent; mute/leave/generation changes cancel retries.
async function publishAfterCleanup(client,body,stale){
 for(let attempt=0;attempt<9;attempt++){
  if(stale()||client.micDesired===false)return null;
  try{return await voiceRequest(client.path('publish'),body);}
  catch(error){
   const pending=error.status===409&&error.message.includes('이전 송출 연결을 정리');
   if(!pending)throw error;
   if(attempt===8)throw new Error('이전 마이크 연결 정리가 지연되고 있습니다. 잠시 후 마이크를 다시 켜 주세요.');
   client.setMicPhase('cleanup');
   await new Promise(resolve=>setTimeout(resolve,Math.min(3000,1000+attempt*500)));
  }
 }
}
async function voiceView(base,id,signal) {
 if(base!=='voice')return null;
 if(id){if(!me)return {html:heading('토킹룸')+gate()};return {html:voiceRoomHTML(id)};}
 return {html:liveDirectoryHTML('talk'),voiceLobby:true};
}
function cleanupVoiceRoute(base,id) {setVoiceFocus(!!me&&['voice','live'].includes(base)&&!!voiceController&&voiceController.id===id&&voiceController.joined&&!voiceController.closed);if(voiceController&&(!me||!['voice','live'].includes(base)||voiceController.id!==id)){const leaving=voiceController.leave();voiceController=null;return leaving;}}
function bindVoice(base,id) {
 if(base!=='voice'&&!(base==='community'&&!id))return;
 const host=document.querySelector('[data-voice-room]');
 if(!host){bindVoiceLobby();return;}
 if(!voiceController||voiceController.closed||voiceController.id!==id)voiceController=new VoiceRoomClient(id);
 if(voiceEntryAudio&&(voiceEntryAudio.id===null||voiceEntryAudio.id===id)){clearTimeout(voiceEntryAudio.timer);voiceController.levelContext=voiceEntryAudio.context;voiceEntryAudio=null;}
 voiceController.bind(host);
}
class VoiceRoomClient {
 constructor(id){this.id=id;this.micAttempt=1;this.micState="muted";this.preferences={music:1,voice:1,input:1,preset:'studio',noise:true,echo:true,reverb:0};this.meters=new Map();this.state=null;this.closed=false;this.joined=false;this.generation=null;this.audios=new Map();this.volumes=new Map();this.mediaQueue=Promise.resolve();this.receiveKey=null;this.retries=0;this.seenGifts=new Set();this.talkGiftQueue=[];this.giftRequest=crypto.randomUUID();this.inviteRequest=crypto.randomUUID();this.onOnline=()=>this.reconnect();this.onPageHide=()=>{this.foregroundMicDesired=false;this.stopMedia();this.ws?.close();};window.addEventListener('pagehide',this.onPageHide);this.onVisibility=()=>{if(!document.hidden&&this.joined)void this.restoreForeground();};window.addEventListener('pageshow',this.onVisibility);window.addEventListener('focus',this.onVisibility);window.addEventListener('online',this.onOnline);document.addEventListener('visibilitychange',this.onVisibility);}
 path(action){return `rooms/${this.id}/${action}`;}
 command(action,b={}){return voiceRequest(this.path(action),{...b,generation:this.generation});}
 acceptState(state){
  if(this.closed||!state||state.generation!==this.generation||state.revision<(this.state?.revision??-1))return false;
  if((state.music?.revision??-1)<(this.state?.music?.revision??-1))state.music=this.state.music;
  // Audio snapshots carry the base skin. Keep the Site-verified entitlement
  // until the room's owner or settings revision actually changes.
  const before=this.state?.room;
  if(!state.room?.theme&&before?.theme&&state.room?.id===before.id&&state.room.host_id===before.host_id&&(state.room.settings_revision||0)===(before.settings_revision||0))state.room={...state.room,theme:before.theme,theme_sku:before.theme.sku,background:before.theme.sku};
  if(state.members&&this.state?.members){
   const previous=new Map(this.state.members.map(p=>[p.id,p]));
   state.members=state.members.map(p=>({...previous.get(p.id),...p}));
  }
  const signature=JSON.stringify([state.revision,state.music?.revision,state.karaoke?.revision,state.members,state.chat,state.notices,state.room,state.seat_invites]);
  this.state=state;if(signature!==this.statePaintKey){this.statePaintKey=signature;this.paint();void this.receive();}return true;
 }
 status(message,connected=false){
  const el=$('#voice-status');if(!el)return;
  el.textContent=message;
  el.toggleAttribute?.('data-connected',connected);
 }
 async safe(fn){
  try{await fn();}catch(e){
   this.status(e.message);
   if(e.roomMicPermission)this.showRoomNotice('마이크 권한을 확인해주세요.');
   else toast(e.message);
  }
 }
 bind(host){this.host=host;if(!this.roomAudio&&typeof RoomAudioSession==='function')this.roomAudio=new RoomAudioSession(this);if(!this.liveMode){this.waitForMusicGesture??=!this.levelContext&&!window.AifectNativeTalkAudio;try{const v=localStorage.getItem('aifect.talkingRoom.listenVolume');if(v!==null&&Number.isFinite(Number(v)))this.preferences.music=Math.max(0,Math.min(1,Number(v)));}catch{}}this.resumeSound();$('#voice-join').onclick=()=>{if(this.closed){voiceController=new VoiceRoomClient(this.id);voiceController.bind(host);}else this.safe(()=>this.join());};const unlock=()=>this.unlockListening();host.onpointerdown=unlock;host.onclick=e=>{unlock();const b=e.target.closest('[data-voice]');if(b)this.safe(()=>this.action(b.dataset.voice,b.dataset.target,b));};
  this.bindFinalControls();
  const chat=$('#voice-chat-form'),stickers=this.stickers;
  chat.onsubmit=busyForm(chat,async()=>{
   if(this.chatEditor.canSend?.()===false)return;
   const text=this.chatEditor.get(),body=stickers?.body()??text;
   if(!body.trim())return;
   this.chatPending=this.chatPending?.body===body?this.chatPending:{body,request_id:crypto.randomUUID()};
   await this.command('chat',this.chatPending);
   if(this.closed||chat!==$('#voice-chat-form'))return;
   // A confirmed own send returns to the conversation; passive arrivals keep history in place.
   if(typeof window!=='undefined'&&window.innerWidth<=800){this.roomChatAtEnd=true;const log=$('#voice-chat');if(log)log.scrollTop=log.scrollHeight;}
   this.toggleEmojiPicker(false);
   if(!this.chatEditor.isComposing?.()&&this.chatEditor.get()===text)this.chatEditor.set('');
   stickers?.clear();this.chatPending=null;this.finishChatInteraction?.();
   await this.refresh();
  });
  const gift=$('#voice-gift-form');gift.onchange=()=>{this.giftRequest=crypto.randomUUID();this.giftSummary();};gift.onsubmit=busyForm(gift,()=>this.openGiftDialog());
  $('#voice-monitor').onchange=()=>this.safe(()=>this.monitor());$('#voice-input').onchange=()=>this.safe(()=>this.changeMicrophone());$('#voice-output').onchange=()=>this.safe(()=>this.output());
  this.bindAudioSettings();bindRoomViewport(this);this.giftSummary();if(this.state)this.paint();else if(!this.joinAttempted)this.safe(()=>this.join());
 }
 async join(){
  if(this.closed||this.joining)return;this.joining=true;this.joinAttempted=true;this.epoch=(this.epoch||0)+1;
  if(this.host?.isConnected)$('#voice-entry').hidden=true;
  try {
   this.status('토킹룸에 연결하는 중…');audio.pause();this.stopMedia();
   this.joinRequest=this.joinRequest||crypto.randomUUID();
   const started=Date.now(),s=await voiceRequest(this.path('join'),{request_id:this.joinRequest});this.joinRequest=null;this.musicClockRtt=undefined;this.setMusicClock(s.serverNow,started);
   if(this.closed){void voiceRequest(this.path('leave'),{generation:s.generation}).catch(()=>{});return;}
   this.generation=s.generation;this.state=s;if(typeof VoiceDiagnostics!=='undefined'&&!this.diagnostics)this.diagnostics=new VoiceDiagnostics(this);this.joined=true;setVoiceFocus(true);this.onViewport?.();this.retries=0;this.paint();if(this.closed)return;this.socket();
   clearInterval(this.heartbeat);this.heartbeat=setInterval(()=>this.refresh().catch(e=>this.connectionError(e)),20000);
   await this.receive();

  }finally{this.joining=false;if(this.host?.isConnected&&!this.joined&&!this.closed)$('#voice-entry').hidden=false;}
 }
 connectionError(e){if([401,403,404,409].includes(e.status)){this.status(e.message);this.leave(false);return;}this.reconnect();}
 socket(){if(this.closed||!this.joined||this.ws&&this.ws.readyState<2&&this.socketGeneration===this.generation)return;clearTimeout(this.socketRetry);this.ws?.close();const u=new URL('/api/voice/'+this.path('socket'),location.href);u.searchParams.set('generation',this.generation);u.protocol=u.protocol==='https:'?'wss:':'ws:';this.socketGeneration=this.generation;const ws=this.ws=new WebSocket(u);
  {
   ws.onopen=()=>{
    if(this.closed||this.ws!==ws)return;
    const blocked=this.isListeningBlocked();
    this.status(this.roomAudio?.blocked?'기기 오디오 일시 중단 · 소리와 마이크 꺼짐':blocked?'실시간 연결됨 · 청취 대기':this.liveMode&&this.state?.karaoke?.phase==='singing'&&this.state.karaoke.active?.user_id===this.state.self?'실시간 연결됨 · 가창 중':'실시간 연결됨 · 청취 중',true);
   };
  }
  ws.onmessage=e=>{if(this.closed||this.ws!==ws)return;try{const v=JSON.parse(e.data);if(v.type==='state'){this.acceptState(v.state);return;}if(v.type==='music'&&this.state){if(v.music?.revision>=(this.state.music?.revision??-1)){this.state.music=v.music;this.paintMusic();}return;}if(v.type==='gift')this.animateGift(v);this.refresh().catch(err=>this.connectionError(err));}catch{}};ws.onclose=e=>{if(!this.closed&&this.joined&&this.ws===ws){if([4000,4001].includes(e.code)){this.status('입장 정보가 바뀌었습니다. 다시 입장해 주세요.');this.leave(false);return;}this.status('실시간 연결 복구 중…');clearTimeout(this.socketRetry);this.socketRetry=setTimeout(()=>{if(!this.closed)this.socket();},3000);}};}
 async refresh(){
  if(this.closed||!this.joined)return;
  if(this.refreshTask){this.refreshAgain=true;return this.refreshTask;}
  this.refreshing=true;
  this.refreshTask=(async()=>{
   try{do{
    this.refreshAgain=false;const epoch=this.epoch,started=Date.now(),state=await this.command('heartbeat');
    if(this.closed||epoch!==this.epoch)return;
    this.setMusicClock(state.serverNow,started);
    if(state.revision<(this.state?.revision??-1))continue;
    if((state.music?.revision??-1)<(this.state?.music?.revision??-1))state.music=this.state.music;
    this.acceptState(state);
   }while(this.refreshAgain&&!this.closed&&this.joined);}
   finally{this.refreshing=false;}
  })();
  try{return await this.refreshTask;}finally{this.refreshTask=null;}
 }
 paint(){if(!this.host?.isConnected||!this.state)return;const s=this.state,self=s.members.find(p=>p.id===s.self);if(!self){this.leave(false);return;}$('#voice-entry').hidden=true;$('#voice-content').hidden=false;$('#voice-title').textContent=s.room.title;$('#voice-title').title=s.room.title;
  const occupancy=this.host.querySelector('[data-room-occupancy]');
  if(occupancy)occupancy.textContent=s.members.length+' / '+(s.room.max_members??'–');
  const micOn=roomMicIsOn(this,self);
  const seated=Array.from({length:8},(_,i)=>s.members.find(p=>(this.optimisticSeat&&p.id===s.self?this.optimisticSeat.seat:p.seat)===i));
  const seatEntries=seated.map((p,i)=>({key:String(i),html:'<div class="voice-seat">'+(p?`<div class="voice-seat-occupant"><button type="button" class="voice-person" data-voice="talk-profile" data-target="${esc(p.id)}" data-level-user="${esc(p.id)}" aria-label="${esc(p.name)} 프로필">${roomMemberAvatar(p,false,!this.liveMode)}<strong title="${esc(p.name)}">${p.role==='host'?'<span class="room-host-crown" aria-label="방장">'+voiceGlyph('crown')+'</span>':''}<span>${userNickname(p.name,{profileId:p.profile_id,userId:p.id})}</span></strong></button>${roomRelationButton(p,s.self,true)}</div>`:'<button type="button" class="voice-seat-empty" data-voice="request-mic" data-target="'+i+'" aria-label="'+(i+1)+'번 좌석 참여 신청"><span class="seat-disc">'+voiceGlyph('plus')+'</span></button>')+'</div>'}));
  const seats=$('#voice-seats');
  if(patchRoomChildren(seats,seatEntries))this.positionTalkGift();
  seated.forEach((member,index)=>{
   if(!member||this.liveMode)return;
   const muted=member.id===s.self?!micOn:!!member.muted;
   setRoomAvatarMuted(seats.children[index].querySelector('.room-member-photo'),muted);
  });
  const listenerHTML=[...s.members].sort((a,b)=>(b.role==='host')-(a.role==='host')).map(p=>'<button class="voice-person" data-voice="participants" aria-label="'+esc(p.name)+' 참여자 목록">'+avatarImage({name:p.name,profile_id:p.profile_id,user_id:p.id,image_version:p.image_version})+'</button>').join('')+'<button class="voice-avatar-plus" data-voice="participants" aria-label="참여자 목록 열기">'+voiceGlyph('plus')+'</button>';
  if(this.listenerHTML!==listenerHTML){$('#voice-listeners').innerHTML=listenerHTML;this.listenerHTML=listenerHTML;}

  this.paintFinalControls();
  this.updateRoomNotice(self,micOn);
  if(!this.liveMode)this.paintTalkPanel(self,micOn);
  this.updateRoomClock?.();
  this.paintMusic();
  this.updateListening();
  const close=this.host.querySelector('[data-voice="close"]');if(close)close.hidden=true;
  const cancel=this.host.querySelector('.voice-cancel-request');if(cancel)cancel.hidden=!self.requested;
  for(const button of this.host.querySelectorAll('.voice-seat-empty'))button.disabled=self.role!=='host'&&(self.requested||self.locked||!!this.seatCommandPending);
  for(const button of this.host.querySelectorAll('.voice-seat-mic[data-voice]')){button.disabled=self.locked;button.setAttribute('aria-busy',String(!!this.micBusy));}
  this.paintMicNote(self);
  if(self.locked||self.seat===null){if(this.stream||this.pendingStream||this.preparingMic||this.micBusy){this.micDesired=false;this.micAttempt=(this.micAttempt||0)+1;this.micBusy=false;this.stopMicrophone();}this.warmSeat=null;}else this.warmMicrophone();
  const requests=s.members.filter(p=>p.requested&&(self.role==='host'||(!this.liveMode&&p.id===self.id)));
  const log=$('#voice-chat'),chatKey=JSON.stringify([s.self,this.liveMode,s.chat,s.notices,requests.map(p=>[p.id,p.name])]);
  if(this.chatLog!==log||this.chatPaintKey!==chatKey){
   this.chatLog=log;this.chatPaintKey=chatKey;
   const messages=[...s.chat,...(s.notices||[])].filter(m=>!this.liveMode||m.kind!=='system'||!(/님 차례예요[.] 15초 안에 시작을 눌러주세요[.]$|^3초 뒤 .+ 시작!$/.test(m.body))).sort((a,b)=>a.sequence-b.sequence);
   const atEnd=log.scrollHeight-log.scrollTop-log.clientHeight<=2;
   // WebKit need not anchor overflow content when the bounded history drops its oldest row.
   const top=log.getBoundingClientRect().top;
   const anchor=atEnd?null:[...log.children].find(row=>row.getBoundingClientRect().bottom>top);
   const anchorY=anchor?.getBoundingClientRect().top;
   const entries=messages.map((m,index)=>{
    const previous=messages[index-1],delta=m.created-previous?.created;
    const grouped=!!m.user_id&&!m.kind&&!previous?.kind&&previous?.user_id===m.user_id&&delta>=0&&delta<300000
     &&new Date(m.created).toDateString()===new Date(previous.created).toDateString();
    const classes='voice-chat-message'+(m.user_id===s.self?' is-self':'')+(grouped?' is-grouped':'');
    return {key:m.id,html:voiceChatMessageHTML(m,this.liveMode).replace('class="voice-chat-message"','class="'+classes+'"')};
   });
   if(this.liveMode)entries.unshift({key:'earphone-guide',html:voiceChatMessageHTML({kind:'system',body:'이어폰을 사용하면 반주가 마이크에 섞이지 않습니다.'})});
   entries.push(...requests.map(p=>({key:'request:'+p.id,html:voiceChatMessageHTML({kind:'system',body:p.name+'님이 좌석 참여를 신청했습니다.'})})));
   patchRoomChildren(log,entries);
   if(atEnd)log.scrollTop=log.scrollHeight;
   else if(anchor?.isConnected)log.scrollTop+=anchor.getBoundingClientRect().top-anchorY;
  }
  const select=$('#voice-gift-target'),previous=select.value;select.innerHTML=s.members.filter(p=>p.id!==self.id&&p.profile_id).map(p=>`<option value="${esc(p.profile_id)}">${esc(p.name)}</option>`).join('');if([...select.options].some(o=>o.value===previous))select.value=previous;
 }
 paintMicNote(self){
  $('#voice-mic-note').toggleAttribute('data-progress',['permission','capture','processing','ice','signaling','transport','failed'].includes(this.micState));
  $('#voice-mic-note').textContent=self.requested?'좌석 참여 신청 중 · 방장 승인 대기':self.locked?'관리자가 마이크를 음소거했습니다.':({permission:'마이크 권한 확인 중…',capture:'마이크 장치 준비 중…',processing:'음향 처리 준비 중…',ice:'네트워크 경로 준비 중…',signaling:'음성 서버에 송출 등록 중…',cleanup:'이전 마이크 연결 정리 중…',transport:'음성 연결 확인 중…',failed:'마이크 연결 실패 · 다시 눌러 재시도',muted:'마이크 꺼짐',on:'마이크 켜짐'}[this.micState]||'');
 }
 showSheet(id){this.showTalkPopup(id,this.actionTrigger);}
 microphoneConstraints(){const supported=navigator.mediaDevices.getSupportedConstraints?.()||{},constraints={};for(const [key,value] of [['echoCancellation',this.preferences.echo],['noiseSuppression',this.preferences.noise],['autoGainControl',true]])if(supported[key]!==false)constraints[key]=value;if(supported.channelCount!==false)constraints.channelCount={ideal:1};const id=$('#voice-input').value;if(id)constraints.deviceId={ideal:id};return constraints;}
 watchProcessing(){
  const graph=this.processing,raw=this.stream,sender=this.micSender;if(!graph?.context||!raw||!sender)return;
  graph.context.onstatechange=()=>{
   if(this.closed||this.processing!==graph||this.micSender!==sender)return;
   this.roomAudio?.contextChanged(graph.context,{capture:true});
   if(this.roomAudio?.blocked||graph.context.state!=='running'){
    this.setCaptureEnabled(false);return;
   }
   const track=graph.stream.getAudioTracks()[0];
   track.enabled=sender.track?.enabled!==false&&!this.roomAudio?.micNeedsGesture;
   void sender.replaceTrack(track).catch(()=>this.status('마이크 장치 연결을 확인해 주세요.'));
  };
 }

 async changeMicrophone(){
  if(!this.stream||!this.micSender||this.roomAudio?.blocked||this.roomAudio?.micNeedsGesture)return;const epoch=this.epoch,attempt=this.micAttempt,sender=this.micSender;
  this.roomAudio?.setType('play-and-record');
  const raw=await navigator.mediaDevices.getUserMedia({audio:this.microphoneConstraints(),video:false});
  raw.getAudioTracks().forEach(t=>t.enabled=false);
  if(this.closed||epoch!==this.epoch||attempt!==this.micAttempt||sender!==this.micSender){raw.getTracks().forEach(t=>t.stop());return;}
  this.pendingStream=raw;if(this.roomAudio?.watchMicrophone(raw)===false){this.pendingStream=null;return;}
  let graph;
  try{graph=await VoiceAudio.microphone(raw,this.preferences.preset,this.preferences.input,this.liveVocalMix);graph.setReverb(this.preferences.reverb);}
  catch(error){raw.getTracks().forEach(t=>t.stop());if(this.pendingStream===raw)this.pendingStream=null;if(error.code==='AUDIO_INTERRUPTED')this.roomAudio?.interrupt('context');throw error;}
  if(this.closed||epoch!==this.epoch||attempt!==this.micAttempt||sender!==this.micSender){graph.close();raw.getTracks().forEach(t=>t.stop());return;}
  try{const enabled=sender.track?.enabled!==false&&!this.roomAudio?.blocked&&!this.roomAudio?.micNeedsGesture;raw.getAudioTracks().forEach(t=>t.enabled=enabled);graph.stream.getAudioTracks()[0].enabled=enabled;await sender.replaceTrack(graph.stream.getAudioTracks()[0]);}catch(e){graph.close();raw.getTracks().forEach(t=>t.stop());throw e;}
  if(this.closed||epoch!==this.epoch||attempt!==this.micAttempt||sender!==this.micSender){graph.close();raw.getTracks().forEach(t=>t.stop());return;}
  if(this.pendingStream===raw)this.pendingStream=null;
  const old=this.stream,oldGraph=this.processing;for(const track of old.getTracks())track.onended=null;if(oldGraph?.stream!==old)for(const track of oldGraph?.stream.getTracks()||[])track.onended=null;
  this.stream=raw;this.processing=graph;this.watchProcessing();raw.getAudioTracks()[0].onended=()=>{if(!this.closed&&this.stream===raw)this.safe(()=>this.mute());};graph.stream.getAudioTracks()[0].onended=raw.getAudioTracks()[0].onended;
  oldGraph?.close();old.getTracks().forEach(t=>t.stop());await this.monitor().catch(()=>{});
 }
 async roomUIAction(action,target){
  if(['mute-user','unlock'].includes(action)&&!this.canManageMember(target))return true;
  if(action==='toggle-mic'){this.toggleMic();return true;}
  if(action==='exit-seat'){
   const own=target===this.state.self;if(own){this.micDesired=false;this.micAttempt=(this.micAttempt||0)+1;this.micBusy=false;this.stopMicrophone();}
   const state=await this.command(own?'release-mic':'moderate',own?{}:{target_id:target,operation:'remove-seat'});this.acceptState(state);return true;
  }
  if(action==='gift'){if(this.talkPopup?.open&&['dialog','voice-gift-sheet'].includes(this.talkPopup.id)){this.closeRoomPopup();return true;}await this.openGiftDialog();return true;}

  if(action==='settings'){await this.openSettings();return true;}if(action==='share'){await this.openRoomShare();return true;}const sheets={sound:'voice-sound',participants:'voice-members',share:'voice-invite-sheet'};
  if(sheets[action]){this.showSheet(sheets[action]);if(action==='sound'){if(this.liveMode)this.resumeSound();void this.devices().catch(()=>{});}return true;}
  if(action==='dismiss'){for(const sheet of this.host.querySelectorAll('dialog[open]'))sheet.close();return true;}
  if(action==='copy-link'){await navigator.clipboard.writeText(location.origin+'/#voice/'+this.id);toast('초대 링크를 복사했습니다.');return true;}
  if(action==='music-picker'){this.showSheet('voice-music-sheet');return true;}
  if(action==='music-add-selected'){await this.addSelectedRoomSongs();return true;}
  if(await this.finalAction(action,target))return true;
  if(action.startsWith('music-')){const operation=action.slice(6);await this.musicCommand(operation,operation==='remove'?{index:Number(target)}:operation==='up'?{index:Number(target),to:Number(target)-1}:{});return true;}
  return false;
 }
 bindAudioSettings(){
  for(const [id,key] of [['voice-music-volume','music'],['voice-listen-volume','voice'],['voice-input-gain','input']]){const el=$('#'+id);el.value=this.preferences[key]*100;el.setAttribute('aria-valuetext',Math.round(el.value)+'%');el.oninput=()=>{el.setAttribute('aria-valuetext',Math.round(el.value)+'%');const value=Number(el.value)/100;if(key==='music'&&this.setPersonalVolume){this.setPersonalVolume(value);return;}this.preferences[key]=value;this.processing?.setLevel(this.preferences.input);this.applyListenVolumes();this.syncMusic();};}
  this.bindRoomEcho();
  for(const [id,operation] of [['voice-room-volume','volume'],['voice-balance','balance']]){const el=$('#'+id);el.oninput=()=>{clearTimeout(this.volumeTimer);el.setAttribute('aria-valuetext',Math.round(el.value)+'%');const value=Number(el.value)/100;this.volumeTimer=setTimeout(()=>this.safe(()=>this.musicCommand(operation,{value})),160);};}
  $('#voice-noise').checked=this.preferences.noise;$('#voice-noise').onchange=()=>{this.preferences.noise=$('#voice-noise').checked;this.safe(async()=>{const track=this.stream?.getAudioTracks()[0];if(track?.applyConstraints)await track.applyConstraints({noiseSuppression:this.preferences.noise});});};
  $('#voice-music-seek').onchange=()=>this.safe(()=>this.musicCommand('seek',{position:Number($('#voice-music-seek').value)}));
  $('#voice-music-search').onsubmit=e=>{e.preventDefault();clearTimeout(this.searchTimer);this.safe(()=>this.searchMusic());};
  const scheduleMusic=()=>{this.searchTimer=scheduleSearchInput(this.searchTimer,()=>this.safe(()=>this.searchMusic()));};
  $('#voice-music-query').oninput=e=>{clearTimeout(this.searchTimer);this.searchSerial=(this.searchSerial||0)+1;this.searchAbort?.abort();if(!e.isComposing)scheduleMusic();};
  $('#voice-music-query').oncompositionend=scheduleMusic;
  this.musicSelection=new Map();
  $('#voice-music-results').onclick=e=>{
   const button=e.target.closest('[data-music-track]');if(!button||button.disabled)return;
   const id=button.dataset.musicTrack;
   if(this.musicSelection.has(id))this.musicSelection.delete(id);
   else{
    const consent=button.closest('article').querySelector('input[type=checkbox]');
    if(consent&&!consent.checked){consent.focus();toast('공동 감상 권리 확인에 동의해 주세요.');return;}
    this.musicSelection.set(id,!!consent);
   }
   this.paintMusicSelection();
  };
  $('#voice-music-results').onchange=e=>{
   if(e.target.type==='checkbox'&&!e.target.checked){
    const id=e.target.closest('article').querySelector('[data-music-track]').dataset.musicTrack;
    this.musicSelection.delete(id);this.paintMusicSelection();
   }
  };
  $('#voice-music-sheet').onclose=()=>{
   if(!$('#voice-music-sheet').open&&!this.addingRoomSongs){this.musicSelection.clear();this.paintMusicSelection();}
  };
  clearInterval(this.musicTimer);this.musicTimer=setInterval(()=>this.syncMusic(),1500);
 }
 paintMusicSelection(){
  if(!this.musicSelection)return;
  const queue=new Set((this.state?.music?.queue||[]).map(t=>t.id));
  const owner=this.state?.self===this.state?.room?.host_id;
  for(const id of queue)this.musicSelection.delete(id);
  for(const button of this.host.querySelectorAll('[data-music-track]')){
   const id=button.dataset.musicTrack,already=queue.has(id),selected=this.musicSelection.has(id);
   button.disabled=!owner||already||!!this.addingRoomSongs;
   button.setAttribute('aria-pressed',String(selected));button.textContent=already?'추가됨':selected?'선택됨':'선택';
  }
  const footer=this.host.querySelector('#room-playlist-actions');if(!footer)return;
  footer.hidden=!owner;const add=footer.querySelector('[data-voice="music-add-selected"]');
  add.disabled=!owner||!this.musicSelection.size||!!this.addingRoomSongs;
  add.textContent=this.addingRoomSongs?'추가 중…':this.musicSelection.size?this.musicSelection.size+'곡 추가하기':'추가하기';
 }
 async addSelectedRoomSongs(){
  if(this.addingRoomSongs||this.state.self!==this.state.room.host_id||!this.musicSelection.size)return;
  const sheet=this.host.querySelector('#voice-music-sheet'),epoch=this.epoch;
  this.addingRoomSongs=true;this.paintMusicSelection();
  try{
   for(const [id,needsConsent] of [...this.musicSelection]){
    if(this.closed||this.epoch!==epoch||this.liveMode||!sheet.open)return;
    if(needsConsent){await this.command('music-consent',{track_id:id,accept:true});this.searchCache?.clear();this.musicSelection.set(id,false);}
    if(!this.state.music.queue.some(t=>t.id===id))await this.musicCommand('enqueue',{track_id:id,queue_revision:this.state.music.revision});
    this.musicSelection.delete(id);
   }
   if(sheet.open&&this.talkPopup===sheet){sheet.close();toast('방 플레이리스트에 추가했습니다.');}
  }finally{this.addingRoomSongs=false;if(!sheet.open)this.musicSelection.clear();if(this.host.isConnected)this.paintMusicSelection();}
 }
 async searchMusic(){
  const query=$('#voice-music-query').value.trim(),epoch=this.epoch;
  if(this.searchPending?.query===query&&this.searchPending.serial===this.searchSerial)return this.searchPending.promise;
  const serial=this.searchSerial=(this.searchSerial||0)+1;this.searchAbort?.abort();
  if(!query){$('#voice-music-results').innerHTML='';$('#voice-music-results').dataset.state='initial';$('#voice-results-heading').hidden=true;$('#voice-playlist-empty').hidden=!!this.state?.music?.queue?.length;return;}
  const controller=this.searchAbort=new AbortController();this.searchCache ||= new Map();const cached=this.searchCache.get(query);
  $('#voice-playlist-empty').hidden=true;$('#voice-music-results').dataset.state='loading';$('#voice-results-heading').hidden=false;$('#voice-search-count').textContent='검색 중…';$('#voice-music-results').setAttribute('aria-busy','true');
  const started=performance.now(),promise=cached&&Date.now()-cached.at<30000?Promise.resolve(cached.data):voiceRequest(this.path('music-search')+'?generation='+encodeURIComponent(this.generation)+'&q='+encodeURIComponent(query),undefined,'GET',controller.signal);
  this.searchPending={query,serial,promise};
  let data;try{data=await promise;}catch(e){if(e.name!=='AbortError'&&serial===this.searchSerial){$('#voice-music-results').dataset.state='error';$('#voice-search-count').textContent='검색 실패';$('#voice-music-results').textContent=e.message;}return;}finally{if(serial===this.searchSerial){this.searchPending=null;$('#voice-music-results').setAttribute('aria-busy','false');}}
  if(this.closed||epoch!==this.epoch||serial!==this.searchSerial)return;
  this.diagnostics?.record('musicSearchMs',performance.now()-started);this.searchCache.set(query,{at:Date.now(),data});if(this.searchCache.size>20)this.searchCache.delete(this.searchCache.keys().next().value);
  $('#voice-music-results').dataset.state=data.tracks.length?'results':'empty';$('#voice-results-heading').hidden=false;$('#voice-search-count').textContent='검색 결과 '+data.tracks.length+'개';
  $('#voice-music-results').innerHTML=data.tracks.map(t=>'<article class="voice-music-result"><img alt="" src="'+esc(t.cover||trackArtworkPath(t))+'"><div><strong>'+esc(t.title)+'</strong><small>'+esc(roomTrackCredit(t))+'</small></div>'+(!t.room_allowed?'<label class="voice-consent"><input type="checkbox">'+esc(data.consent)+'</label>':'')+'<time>'+time(t.duration)+'</time><button aria-label="'+esc(t.title)+' 추가" class="small-button" data-music-track="'+esc(t.id)+'" data-consent="'+!t.room_allowed+'">'+voiceGlyph('plus')+'</button></article>').join('')||'<p class="quiet">공동 감상이 허용된 곡이 없습니다. 본인이 올린 원곡은 검색 후 권리를 확인하고 허용할 수 있습니다.</p>';
  this.paintMusicSelection();
 }
 async musicCommand(operation,input={}){
  if(this.state?.members.find(m=>m.id===this.state.self)?.role!=='host')throw Error('방장만 음악을 관리할 수 있습니다.');
  const epoch=this.epoch,music=this.state.music,command={operation:operation==='up'?'move':operation,...input,request_id:crypto.randomUUID()};
  if(operation==='ended')command.revision=music.revision;
  if(['play','next','previous','restart','ended','remove'].includes(operation))command.wait_for_audio=true;
  const state=await this.command('music',command);if(this.closed||epoch!==this.epoch||state.revision<(this.state?.revision??-1))return;this.acceptState(state);if(operation==='clear')$('#voice-music-sheet').scrollTop=0;
 }
 paintMusic(){
  this.paintFinalMusic();this.syncMusic();this.applyListenVolumes();
 }
 setMusicClock(serverNow,sent,received=Date.now()){
  if(!serverNow)return;
  const rtt=received-sent;
  // A delayed heartbeat response can move the estimated clock backwards.
  if(!this.liveMode){
   if(rtt<0||rtt>(this.musicClockRtt??Infinity)+100)return;
   this.musicClockRtt=Math.min(this.musicClockRtt??Infinity,rtt);
  }
  this.musicClock=serverNow-(sent+received)/2;
 }
 createMusicAudio(){
  const a=new Audio();
  a.preload='auto';
  a.onloadedmetadata=a.oncanplay=a.onseeked=()=>this.syncMusic();
  a.onpause=a.onvolumechange=a.onseeking=()=>this.updateMusicIndicator();
  a.onstalled=()=>{if(a.readyState<3)a.onwaiting();};
  a.onwaiting=()=>{
   if(this.state?.music?.playing&&!this.closed){this.musicAudible=false;this.musicNotice('음악 버퍼링 중');}
  };
  a.onplaying=()=>{
   if(this.closed||a.paused||a.seeking||!this.state?.music?.playing||this.roomAudio?.blocked)return;
   this.musicAudible=true;this.musicBlocked=false;this.musicNotice('');this.updateListening();
  };
  a.onended=()=>{
   if(!a.ended||!this.state?.music?.playing||this.closed)return;
   this.musicAudible=false;
   this.updateMusicIndicator();
   if(this.state.members.find(p=>p.id===this.state.self)?.role==='host')this.safe(()=>this.musicCommand('ended'));
  };
  a.onerror=async()=>{
   if(!a.error||!this.musicTrack||this.closed)return;
   this.updateMusicIndicator();
   const key=this.musicTrack;let message=a.error.code===3?'지원하지 않는 음악 형식입니다.':'음악 네트워크 연결을 확인해 주세요.';
   try{
    const response=await fetch(a.src,{method:'HEAD',credentials:'same-origin'});
    if([401,403].includes(response.status))message='공동 음악 접근 권한을 확인해 주세요.';
    else if([404,409].includes(response.status))message='곡이 변경되었거나 더 이상 공개되지 않습니다.';
   }catch{}
   if(!this.closed&&this.musicTrack===key&&a.error){this.musicAudible=false;this.musicNotice(message);}
  };
  return a;
 }
 get personalMusicVolume(){return this.playerMusicMuted?0:this.preferences.music;}
 syncMusic(){
  const m=this.state?.music;
  if(!m||this.closed||this.liveMode)return;
  const track=m.queue[m.index],prior=this.musicTimeline;
  if(!track){
   this.musicTimeline={key:null};this.musicTarget=null;this.musicPlayTask=null;this.musicAudible=false;
   if(this.musicTrack&&this.musicAudio){this.musicAudio.pause();this.musicAudio.removeAttribute?.('src');this.musicAudio.load();}
   this.musicTrack=null;this.musicBlocked=false;this.musicNotice('');return;
  }
  const key=track.id+':'+this.generation,a=this.musicAudio??=this.createMusicAudio();
  const sourceChanged=this.musicTrack!==key;
  if(sourceChanged){
   this.musicTrack=key;this.musicPlayTask=null;this.musicBlocked=false;this.musicAudible=false;this.musicNoticeText='';
   a.src='/api/voice/'+this.path('music-stream')+'?track_id='+encodeURIComponent(track.id)+'&generation='+encodeURIComponent(this.generation);
  }
  if(!prior||prior.key!==key||prior.starts!==m.starts){
   // A late entrant joins the moving clock. Everyone already in the room
   // starts a new track at its first sample, regardless of load time.
   this.musicTarget=!prior&&m.playing?'room':m.position;
   this.musicAudible=false;
  }else if(m.revision!==prior.revision||m.playing!==prior.playing){
   // Queue edits rebase the same moving position at m.updated on the server.
   const priorAtUpdate=Math.min(track.duration,prior.position+(prior.playing?Math.max(0,m.updated-prior.updated)/1000:0));
   if(!m.playing||!prior.playing||Math.abs(m.position-priorAtUpdate)>.005)this.musicTarget=m.position;
  }
  this.musicTimeline={key,starts:m.starts,revision:m.revision,position:m.position,updated:m.updated,playing:m.playing};
  if(this.roomAudio?.blocked){if(m.playing)this.musicTarget='room';this.roomAudio.quietElement(a);this.musicAudible=false;this.musicNotice('기기 오디오 일시 중단');return;}
  this.playbackGain(a,Math.max(0,Math.min(1,m.volume*this.personalMusicVolume)));
  this.updateMusicIndicator?.();
  const expected=Math.min(track.duration,m.position+(m.playing?Math.max(0,Date.now()+(this.musicClock||0)-m.updated)/1000:0));
  if(!m.playing){
   this.musicPlayTask=null;this.musicAudible=false;this.musicBlocked=false;
   if(!a.paused)a.pause();
  }else{
   if(typeof audio!=='undefined'&&!audio.paused)audio.pause();
   if(this.waitForMusicGesture){this.musicTarget='room';this.musicBlocked=true;this.musicNotice(this.listeningPrompt());this.updateListening();return;}
  }
  if(a.readyState>=1&&this.musicTarget!=null){
   const target=this.musicTarget==='room'?expected:this.musicTarget;
   this.musicTarget=null;
   if(Math.abs(a.currentTime-target)>.025){this.musicAudible=false;a.currentTime=target;}
  }
  const outputReady=!a.voiceGain||this.levelContext?.state==='running';
  const mediaReady=!a.error&&a.readyState>=3&&!a.seeking&&outputReady;
  const seek=this.host?.querySelector?.('#voice-music-seek');
  if(seek&&!seek.matches(':active'))seek.value=a.currentTime;
  if(!m.playing){
   a.playbackRate=1;
   if(m.pendingStart==null){this.musicNotice('');return;}
   if(!a.error)this.musicNotice('음악 준비 중…');
   if(mediaReady&&this.state.self===this.state.room?.host_id&&this.musicReadyRequest!==m.pendingStart){
    const revision=this.musicReadyRequest=m.pendingStart;
    void this.musicCommand('ready',{start_revision:revision}).catch(()=>{
     // A transient failure can retry while this start is still current.
     if(this.musicReadyRequest===revision)this.musicReadyRequest=null;
    });
   }
   return;
  }
  if(a.error)return;
  // WKWebView can stay at HAVE_METADATA until play() asks for more data.
  const canStartBuffering=window.AifectNativeTalkAudio&&outputReady&&!a.seeking;
  if(!mediaReady&&!canStartBuffering){
   this.musicAudible=false;this.musicNotice('음악 준비 중…');return;
  }
  // Rate correction never replays samples. Hard seeks belong to transport
  // changes and late joins, never paint, buffering, or heartbeat callbacks.
  const drift=expected-a.currentTime;
  const rate=this.musicAudible&&Math.abs(drift)>.12?1+Math.max(-.04,Math.min(.04,drift/8)):1;
  if(Math.abs(a.playbackRate-rate)>.001)a.playbackRate=rate;
  if(!this.musicAudible)this.musicNotice('음악 준비 중…');
  if(a.paused&&!a.ended&&!this.musicPlayTask){
   const pending=a.play();this.musicPlayTask=pending;
   pending.catch(error=>{
    if(this.closed||this.musicPlayTask!==pending||this.musicTrack!==key||!this.state?.music?.playing||error.name==='AbortError')return;
    this.musicBlocked=true;
    if(error.name==='NotAllowedError')this.waitForMusicGesture=true;
    this.musicNotice(this.listeningPrompt());this.updateListening();
   }).finally(()=>{if(this.musicPlayTask===pending)this.musicPlayTask=null;});
  }
 }
 updateMusicIndicator(){
  const a=this.musicAudio;
  const playing=!!(this.musicAudible&&this.state?.music?.playing&&this.state.music.volume>0&&this.personalMusicVolume>0&&a&&!a.paused&&!a.ended&&!a.seeking&&!a.error&&!a.muted&&a.volume>0&&!this.roomAudio?.blocked);
  const mini=this.host?.querySelector?.('#voice-music-player');
  if(mini&&mini.hasAttribute?.('data-playing')!==playing)mini.toggleAttribute?.('data-playing',playing);
 }
 musicNotice(text){
  this.updateMusicIndicator?.();
  this.musicNoticeText=text;
  const mini=this.host?.querySelector?.('#voice-music-player');
  if(!mini)return;
  const status=mini.querySelector('.talk-music-status');
  if(status){if(status.textContent!==text)status.textContent=text;status.hidden=!text;}
  const credit=mini.querySelector('.talk-track small:not(.talk-music-status)');
  if(credit)credit.hidden=!!text;
  mini.setAttribute('aria-busy',String(!!text&&!this.musicBlocked&&!this.musicAudio?.error&&(this.state?.music?.playing||this.state?.music?.pendingStart!=null)));
 }
 async restoreForeground(){
  if(this.closed||!this.joined||this.foregroundPending)return;
  this.foregroundPending=true;
  try{
   await this.refresh();
   if(this.closed||document.hidden)return;
   this.liveNeedsResync=true;this.liveStartClock=null;this.livePlayBlocked=false;
   // Preserve explicit per-user/music volume and microphone OFF intent.
   this.resumeSound();
   if(!this.ws||this.ws.readyState>=2)this.socket();
   if(this.receiver?.connectionState==='failed'||this.receiver?.connectionState==='closed')this.receiveKey=null;
   await this.receive();
   // Returning to a page never re-enables a retired or interrupted microphone.
   this.foregroundMicDesired=false;
   if(this.liveMode)liveSync(this);
  }catch{this.scheduleReconnect();}finally{this.foregroundPending=false;}
 }
 resumeSound(userInitiated=false){
  if(this.closed)return;
  if(this.roomAudio?.blocked){
   this.roomAudio.quietOutputs();this.updateListening();
   if(userInitiated)void this.roomAudio.resumeByUser().then(restored=>{if(restored&&!this.closed)this.resumeSound();});
   return;
  }
  try{const Context=window.AudioContext||window.webkitAudioContext;if(Context&&!this.levelContext)this.levelContext=new Context({latencyHint:'interactive'});
   if(this.levelContext)this.levelContext.onstatechange=()=>{if(!this.closed){this.roomAudio?.contextChanged(this.levelContext);this.applyListenVolumes();this.syncMusic();this.updateListening();}};
   const resumed=this.levelContext?.resume();
   void resumed?.then(()=>{if(this.closed||this.roomAudio?.blocked)return;this.applyListenVolumes();for(const a of this.audios.values())this.playRemote(a);this.syncMusic();this.updateListening();}).catch(()=>this.updateListening());
  }catch{}
  for(const a of this.audios?.values()||[])this.playRemote(a);
  void this.processing?.context?.resume().catch(()=>{});this.syncMusic();this.updateListening();
 }
 isListeningBlocked(){
  return !!(this.roomAudio?.blocked||this.musicBlocked||this.levelContext&&this.levelContext.state!=='running'||[...(this.audios?.values()||[])].some(a=>a.voiceBlocked));
 }
 unlockListening(){
  const blocked=this.waitForMusicGesture||this.isListeningBlocked();this.waitForMusicGesture=false;
  // A real desktop pointer/click gesture replaces the removed unlock button.
  if(this.liveMode||blocked)this.resumeSound(!this.liveMode&&!!this.host?.hasAttribute?.('data-room-pc-controls'));
 }
 listeningPrompt(){return !this.liveMode?'화면을 눌러 소리를 켜 주세요':'대화 듣기를 눌러 소리를 켜 주세요';}
 updateListening(){
  const button=this.host?.querySelector('[data-voice="resume-audio"]'),blocked=this.isListeningBlocked();
  if(button)button.hidden=!blocked;
  if(this.ws?.readyState===1&&$('#voice-status')?.hasAttribute('data-connected')){
   this.status(this.roomAudio?.blocked?'기기 오디오 일시 중단 · 소리와 마이크 꺼짐':blocked?'실시간 연결됨 · 청취 대기':this.liveMode&&this.state?.karaoke?.phase==='singing'&&this.state.karaoke.active?.user_id===this.state.self?'실시간 연결됨 · 가창 중':'실시간 연결됨 · 청취 중',true);
  }
 }
 playRemote(a){
  if(this.roomAudio?.blocked){this.roomAudio.quietElement(a);return;}
  const active=()=>!this.closed&&[...this.audios.values()].includes(a);
  const blocked=()=>{if(!active())return;a.voiceBlocked=!(a.voiceStream&&this.levelContext?.state==='running');this.updateListening();};
  try{void a.play()?.then(()=>{if(active()){a.voiceBlocked=false;this.updateListening();}},blocked);}catch{blocked();}
 }
 playbackGain(element,volume){
  if(this.roomAudio?.blocked){this.roomAudio.quietElement(element);return;}
  if(!element.voiceStream)element.muted=false;
  const ctx=this.levelContext;
  // A gain node also supports mobile browsers that ignore HTMLAudio.volume.
  // Create it only on a running, user-unlocked context; otherwise retain native audio.
  if(ctx?.state==='running'&&!element.voiceGain)try{
   // Live WebRTC audio is a MediaStream, not a URL-backed music resource.
   // Pull the remote stream directly; the media-element source can yield silence.
   const gain=ctx.createGain(),source=element.srcObject?ctx.createMediaStreamSource(element.srcObject):ctx.createMediaElementSource(element);
   source.connect(gain);gain.connect(ctx.destination);element.voiceGain=gain;element.voiceSource=source;element.voiceStream=!!element.srcObject;
  }catch{}
  if(element.voiceGain){
   const nativeFallback=element.voiceStream&&ctx.state!=='running';
   if(element.voiceStream)element.muted=!nativeFallback;
   element.volume=nativeFallback?volume:1;element.voiceGain.gain.setTargetAtTime(nativeFallback?0:volume,ctx.currentTime,.02);
  }else element.volume=volume;
 }
 releaseRemote(a){a.pause();a.voiceSource?.disconnect();a.voiceGain?.disconnect();a.voiceSource=null;a.voiceGain=null;a.srcObject=null;}
 applyListenVolumes(){for(const [id,a] of this.audios)this.playbackGain(a,this.state?.members?.find(p=>p.id===id)?.muted?0:Math.max(0,Math.min(1,(this.volumes.get(id)??1)*this.preferences.voice)));}
 meterTrack(id,track){try{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;const ctx=this.levelContext||(this.levelContext=new Context({latencyHint:'interactive'})),source=ctx.createMediaStreamSource(new MediaStream([track])),analyser=ctx.createAnalyser();analyser.fftSize=256;source.connect(analyser);this.meters.set(id,{source,analyser});}catch{/* Playback stays independent of metering. */}}
 clearRemoteMeters(){for(const m of this.meters.values())m.source.disconnect();this.meters.clear();}
 startLevels(){
  if(this.levelTimer)return;
  this.levelTimer=setInterval(()=>{
   if(this.closed||document.hidden||!this.state)return;
   const members=new Map(this.state.members.map(p=>[p.id,p])),levels=new Map();
   try{
    if(this.processing?.analyser&&!members.get(this.state.self)?.muted)levels.set(this.state.self,VoiceAudio.rms(this.processing.analyser));
    if(this.testGraph?.analyser){const level=VoiceAudio.rms(this.testGraph.analyser);for(const meter of this.host.querySelectorAll('#voice-input-meter,.talk-test-meter'))meter.value=level;}
    for(const [id,m] of this.meters)if(!members.get(id)?.muted)levels.set(id,VoiceAudio.rms(m.analyser));
   }catch{}
   for(const el of this.host?.querySelectorAll('[data-level-user]')||[]){
    const level=levels.get(el.dataset.levelUser)||0,speaking=level>.04;
    const value=speaking?level.toFixed(2):'0';
    if(el._voiceLevel!==value){el.style.setProperty('--voice-level',value);el._voiceLevel=value;}
    if(el.classList.contains('is-speaking')!==speaking)el.classList.toggle('is-speaking',speaking);
   }
  },100);
 }
 async openGiftDialog(){
  if(this.closed||!this.joined||!this.host?.isConnected)throw Error('토킹룸에 다시 입장한 뒤 선물해 주세요.');
  const generation=this.generation,state=this.state,recipients=(state?.members||[]).filter(p=>p.id!==state.self&&p.profile_id).map(p=>({id:p.profile_id,name:p.name}));
  if(!recipients.length){this.showSheet('voice-gift-sheet');return this.loadGiftChoices();}
  const form=$('#voice-gift-form'),select=$('#voice-gift-target');
  const recipient=recipients.find(p=>p.id===select?.value)||recipients[0],giftId=form?.elements.gift_type?.value;
  const quantity=Math.max(1,Math.min(100,Math.trunc(Number(form?.elements.quantity?.value)||1)));
  $('#voice-gift-sheet')?.close();
  const modal=$('#dialog');
  if(modal?.open){if(this.talkPopup===modal)this.closeRoomPopup();return;}
  if(modal)dialog('<section class="gift-dialog gift-dialog--compact" data-room-gift-loading aria-busy="true"><header class="gift-dialog-header"><h2>선물하기</h2></header><p role="status">선물과 잔액을 불러오는 중…</p></section>');
  const opening=profileGiftDialog(recipient.id,{id:giftId,quantity,roomGift:{
   recipients,
   onRecipientChange:profile_id=>{if(select&&recipients.some(p=>p.id===profile_id))select.value=profile_id;},
   send:async({profile_id,gift_type,quantity,request_id})=>{
    if(this.closed||!this.joined||!this.host?.isConnected||this.generation!==generation)throw Error('토킹룸 입장 정보가 바뀌었습니다. 선물하기를 다시 열어 주세요.');
    if(!recipients.some(p=>p.id===profile_id)||!this.state?.members.some(p=>p.id!==this.state.self&&p.profile_id===profile_id))throw Error('받는 사람이 토킹룸을 나갔습니다. 선물하기를 다시 열어 주세요.');
    return this.command('gifts',{profile_id,gift_type,quantity,request_id});
   }
  }});
  if(!modal)return opening;
  // Closing the shared shell invalidates this load, including a late error response.
  const serial=giftDialogSerial;
  const cancelLoad=()=>{if(!modal.open&&serial===giftDialogSerial)++giftDialogSerial;};
  modal.addEventListener('close',cancelLoad);
  try{await opening;}finally{
   modal.removeEventListener('close',cancelLoad);
   if(serial===giftDialogSerial&&modal.open&&modal.querySelector('[data-room-gift-loading]'))modal.close();
  }
 }
 giftSummary(){const form=$('#voice-gift-form');if(!form)return;const g=this.roomGiftChoices?.find(g=>g.id===form.elements.gift_type.value);$('#voice-gift-summary').textContent=g?`총 ${number(g.gold*Number(form.elements.quantity.value))} g · 보낸 선물은 취소할 수 없습니다.`:'';}
 async loadGiftChoices(){
  const form=$('#voice-gift-form');
  if(!form?.isConnected)return;
  const select=form.elements.gift_type,result=$('#voice-gift-result');
  const previous=select.value,send=form.querySelector('button.primary-button');
  send.disabled=true;select.replaceChildren();this.roomGiftChoices=[];this.giftSummary();
  result.textContent='판매 중인 선물을 불러오고 있습니다.';
  try{
   const {gifts}=await api('/api/gifts/catalog','GET',undefined,{fresh:true});
   if(this.closed||!form.isConnected)return;
   this.roomGiftChoices=gifts;
   select.innerHTML=gifts.map(g=>`<option value="${esc(g.id)}">${esc(g.name)} · ${number(g.gold)} g</option>`).join('');
   if(gifts.some(g=>g.id===previous))select.value=previous;
   send.disabled=!gifts.length;this.giftSummary();
   result.textContent=gifts.length?'':'현재 판매 중인 골드 선물이 없습니다.';
  }catch(error){if(form.isConnected)result.textContent=error.message;}
 }
 async action(action,target,button){this.actionTrigger=button;if(action==='dismiss'&&button){button.closest('dialog')?.close();return;}if(action==='resume-audio'){this.resumeSound(true);return;}if(await this.roomUIAction(action,target))return;if(action==='leave'){if(!this.joined){this.leave(false);location.hash='#voice';return;}const isProfile=this.pendingRoomNavigation&&/^#(?:producer|member|artist)\//.test(new URL(this.pendingRoomNavigation).hash);$('#talk-leave-title').textContent=isProfile?'방에서 나가 프로필 페이지로 이동할까요?':'방에서 나갈까요?';this.showSheet('talk-leave');return;}if(action==='confirm-leave'){const destination=this.pendingRoomNavigation||new URL(this.liveMode?'#live':'#voice',location.href).href;await this.leave();if(voiceController===this)voiceController=null;location.href=destination;return;}if(action==='close'){await this.command('close');this.leave(false);location.hash='#voice';return;}if(action==='enable-mic'){this.micIntentRevision=(this.micIntentRevision||0)+1;this.micDesired=true;return this.enableMic(true);}if(action==='mute')return this.mute();if(!this.liveMode&&['request-mic','cancel-mic','approve-mic','reject-mic'].includes(action))return this.talkSeatAction(action,target,button);
  if(action==='request-mic'&&this.state.members.find(p=>p.id===this.state.self)?.role==='host'){this.openSeatPicker(Number(target));return;}if(action==='release-mic'){
   if(this.seatReleasePending)return;this.seatReleasePending=true;
   this.micDesired=false;this.micAttempt=(this.micAttempt||0)+1;this.stopMicrophone();
   try{this.acceptState(await this.command('release-mic',{invitation_id:this.state?.karaoke?.active?.invitation_id}));}
   finally{this.seatReleasePending=false;this.paint();}return;
  }if(['mute-user','unlock','kick','ban','admin','revoke-admin'].includes(action))await this.command('moderate',{target_id:target,operation:action==='mute-user'?'mute':action});else {const self=this.state.members.find(p=>p.id===this.state.self);if(action==='request-mic'&&['host','admin'].includes(self.role))await this.command('approve-mic',{target_id:self.id,seat:Number(target)});else await this.command(action,{target_id:target,...(action==='request-mic'&&target!==undefined?{seat:Number(target)}:{})});}await this.refresh();}
 pc(){const p=new RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}],bundlePolicy:'max-bundle',iceCandidatePoolSize:1});p.onconnectionstatechange=()=>{
  if(p.connectionState!=='failed'||this.closed)return;
  if(this.publisher===p){this.reconnect();return;}
  // A failed listening transport must not tear down the user's live microphone.
  if(this.receiver===p){const epoch=this.epoch;this.receiveKey=null;clearTimeout(this.receiveRetry);this.receiveRetry=setTimeout(()=>{if(!this.closed&&epoch===this.epoch&&this.receiver===p)this.receive();},500);}
 };return p;}
 async connected(pc){if(pc.connectionState==='connected')return;await new Promise((resolve,reject)=>{const finish=error=>{clearTimeout(timer);pc.removeEventListener('connectionstatechange',check);error?reject(error):resolve();},check=()=>{if(pc.connectionState==='connected')finish();else if(['failed','closed'].includes(pc.connectionState))finish(new Error('음성 연결을 다시 시작해 주세요.'));},timer=setTimeout(()=>finish(new Error('음성 연결 시간이 초과되었습니다. 네트워크를 확인해 주세요.')),15000);pc.addEventListener('connectionstatechange',check);check();});}
 async ice(pc){
  const started=performance.now();
  await new Promise((resolve,reject)=>{
   let done=false,softExpired=false,soft,hard;
   const candidates=()=>pc.localDescription?.sdp?.match(/^a=candidate:/gm)?.length||0;
   const finish=error=>{
    if(done)return;done=true;clearTimeout(soft);clearTimeout(hard);
    for(const event of ['icegatheringstatechange','icecandidate','connectionstatechange'])pc.removeEventListener(event,check);
    this.diagnostics?.record('iceGatherMs',performance.now()-started);
    if(!error&&pc.iceGatheringState!=='complete')this.diagnostics?.record('icePartialCandidates',candidates());
    error?reject(error):resolve();
   };
   const check=()=>{
    if(pc.connectionState==='closed'){finish(new Error('음성 연결이 취소되었습니다.'));return;}
    const count=candidates();
    if(count&&(pc.iceGatheringState==='complete'||softExpired)){finish();return;}
    if(pc.iceGatheringState==='complete')finish(new Error('음성 연결 경로를 찾지 못했습니다. 네트워크를 바꿔 다시 시도해 주세요.'));
   };
   // A blocked STUN query may keep gathering alive long after host candidates
   // exist. Send the candidates we have, then verify the actual SFU connection.
   soft=setTimeout(()=>{softExpired=true;check();},1500);
   hard=setTimeout(()=>finish(candidates()?undefined:new Error('음성 연결 경로를 찾지 못했습니다. Wi-Fi나 모바일 네트워크를 바꿔 다시 시도해 주세요.')),10000);
   for(const event of ['icegatheringstatechange','icecandidate','connectionstatechange'])pc.addEventListener(event,check);
   check();
  });
 }
 setMicPhase(phase,started){
  if(started!==undefined)this.diagnostics?.record('mic'+this.micState[0].toUpperCase()+this.micState.slice(1)+'Ms',performance.now()-started);
  this.micState=phase;
  const self=this.state?.members?.find(p=>p.id===this.state.self);
  if(self&&this.host?.isConnected){
   this.paintMicNote(self);
   const mic=this.host.querySelector('.talk-seat-controls [data-voice="toggle-mic"]');
   if(mic)mic.disabled=self.locked||self.seat==null||!!this.micBusy;
  }
  return this.micPhaseStarted=performance.now();
 }
 async captureMicrophone(){
  if(this.roomAudio?.blocked||this.roomAudio?.micNeedsGesture)return null;
  this.roomAudio?.setType('play-and-record');
  if(this.stream?.getAudioTracks().some(t=>t.readyState==='live'))return this.stream;
  if(this.preparingMic)return this.preparingMic;
  const epoch=this.epoch,attempt=this.micAttempt;
  const promise=navigator.mediaDevices.getUserMedia({audio:this.microphoneConstraints(),video:false}).then(stream=>{
   if(this.closed||epoch!==this.epoch||attempt!==this.micAttempt||this.roomAudio?.blocked||this.roomAudio?.micNeedsGesture){stream.getTracks().forEach(t=>t.stop());return null;}
   stream.getAudioTracks().forEach(t=>t.enabled=false);
   this.stream=stream;if(this.roomAudio?.watchMicrophone(stream)===false)return null;return stream;
  });
  this.preparingMic=promise;try{return await promise;}finally{if(this.preparingMic===promise)this.preparingMic=null;}
 }
 warmMicrophone(){
  if(this.roomAudio?.blocked||this.roomAudio?.micNeedsGesture)return;
  const key=this.generation;if(this.warmSeat===key||this.micBusy||this.stream||!navigator.permissions?.query)return;
  this.warmSeat=key;const epoch=this.epoch,attempt=this.micAttempt;
  // Querying permission never prompts. Capture only after an existing grant, always disabled.
  void navigator.permissions.query({name:'microphone'}).then(async permission=>{
   const self=this.state?.members.find(p=>p.id===this.state.self);
   if(permission.state!=='granted'||this.roomAudio?.blocked||this.roomAudio?.micNeedsGesture||this.closed||epoch!==this.epoch||attempt!==this.micAttempt||self?.seat==null||self.locked||this.micBusy)return;
   this.preparedPublisher ||= this.pc();await this.captureMicrophone();
  }).catch(()=>{/* A browser without permission queries uses the explicit mic button. */});
 }
 toggleMic(){
  this.micIntentRevision=(this.micIntentRevision||0)+1;
  const active=this.micDesired??(!!this.stream&&!this.state?.members.find(p=>p.id===this.state.self)?.muted);
  this.micDesired=!active;
  if(!this.micDesired)this.setCaptureEnabled(false);
  this.paint();
  if(this.micBusy)return;
  void this.safe(()=>this.micDesired?this.enableMic(true):this.mute());
 }
 setCaptureEnabled(enabled){
  enabled=!!enabled&&!this.roomAudio?.blocked&&!this.roomAudio?.micNeedsGesture;
  for(const stream of new Set([this.stream,this.pendingStream,this.processing?.stream]))for(const t of stream?.getAudioTracks()||[])t.enabled=enabled;
  if(this.micSender?.track)this.micSender.track.enabled=enabled;
 }
 syncMicIntent(){
  if(this.roomAudio?.blocked||this.roomAudio?.micNeedsGesture)this.micDesired=false;
  if(this.micSync)return this.micSync;
  const epoch=this.epoch,pc=this.publisher,attempt=this.micAttempt;
  const stale=()=>this.closed||epoch!==this.epoch||this.publisher!==pc||attempt!==this.micAttempt;
  const pending=(async()=>{
   while(!stale()&&pc?.connectionState==='connected'){
    const desired=this.micDesired===true,sequence=this.micSequence=(this.micSequence||0)+1;
    if(!desired)this.setCaptureEnabled(false);
    const state=await this.command('self-mute',{muted:!desired,sequence});
    if(stale())return;
    this.acceptState(state);
    if(desired!==this.micDesired)continue;
    this.setCaptureEnabled(desired);this.micState=desired?'on':'muted';this.paint();return;
   }
  })().catch(e=>{if(!stale()){this.micDesired=false;this.setCaptureEnabled(false);this.micState='failed';this.paint();throw e;}}).finally(()=>{if(this.micSync===pending)this.micSync=null;});
  this.micSync=pending;return pending;
 }
 async enableMic(userInitiated=false){
  const intentRevision=this.micIntentRevision||0,attemptBeforePermission=this.micAttempt;
  if(this.roomAudio&&!await this.roomAudio.allowCapture(userInitiated)){
   if(intentRevision===(this.micIntentRevision||0)){this.micDesired=false;this.setCaptureEnabled(false);this.paint();}
   return;
  }
  // Both direct clicks and a continuation of an earlier click can yield while
  // checking the session. Never revive an intent retired during that await.
  if(intentRevision!==(this.micIntentRevision||0)||attemptBeforePermission!==this.micAttempt||this.roomAudio?.blocked||this.roomAudio?.micNeedsGesture)return;
  if(userInitiated)this.micDesired=true;
  if(this.micDesired===undefined)this.micDesired=true;
  if(this.micBusy)return;
  if(this.stream&&this.publisher?.connectionState==='connected')return this.syncMicIntent();
  this.stopMicTest?.();this.micClicked=performance.now();const self=this.state?.members?.find(p=>p.id===this.state.self);
  if(self&&(self.seat===null||self.locked))throw new Error('승인된 좌석에서 마이크를 켜 주세요.');
  this.micBusy=true;
  // A pre-warmed capture belongs to the current attempt. Do not invalidate it when enabling.
  const attempt=this.micAttempt=this.micAttempt||1,epoch=this.epoch,generation=this.generation,stale=()=>this.closed||epoch!==this.epoch||attempt!==this.micAttempt;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('보안 연결(HTTPS)과 마이크를 지원하는 브라우저가 필요합니다.');
   let stage=this.setMicPhase('permission');
   if(navigator.permissions?.query)try{this.microphonePermission=(await navigator.permissions.query({name:'microphone'})).state;}catch{this.microphonePermission='unsupported';}
   if(stale())return;
   stage=this.setMicPhase('capture',stage);const stream=await this.captureMicrophone();
   if(stale()||!stream)return;
   this.microphoneSettings=stream.getAudioTracks()[0].getSettings?.()||{};
   stage=this.setMicPhase('processing',stage);this.pendingStream=stream;
   const processing=await VoiceAudio.microphone(stream,this.preferences.preset,this.preferences.input,this.liveVocalMix);if(this.pendingStream===stream)this.pendingStream=null;
   processing.setReverb(this.preferences.reverb);if(stale()){processing.close();stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;this.processing=processing;
   const pc=this.publisher=this.preparedPublisher||this.pc();this.preparedPublisher=null;const track=processing.stream.getAudioTracks()[0];track.enabled=false;
   const transceiver=pc.addTransceiver(track,{direction:'sendonly'});this.micSender=transceiver.sender;
   this.watchProcessing();this.startLevels();
   track.onended=stream.getAudioTracks()[0].onended=()=>{if(!stale()){this.micDesired=false;this.micAttempt++;this.stopMicrophone();this.micState='failed';this.safe(async()=>{this.acceptState(await this.command('mute'));this.status('마이크 장치 연결이 끊겼습니다. 장치를 확인한 뒤 다시 켜 주세요.');});}};
   stage=this.setMicPhase('ice',stage);await pc.setLocalDescription(await pc.createOffer());await this.ice(pc);if(stale()){pc.close();return;}
   stage=this.setMicPhase('signaling',stage);
   const r=await publishAfterCleanup(this,{generation,request_id:crypto.randomUUID(),mid:transceiver.mid,sessionDescription:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}},stale);
   if(!r||stale()){pc.close();return;}
   stage=this.setMicPhase('transport',stage);await pc.setRemoteDescription(r.sessionDescription);
   try{const parameters=transceiver.sender.getParameters();if(parameters.encodings?.length){parameters.encodings[0].maxBitrate=32000;await transceiver.sender.setParameters(parameters);}}catch{}
   await this.connected(pc);if(stale())return;
   // Register silent first. A rapid OFF during setup can never briefly publish audible audio.
   const state=await voiceRequest(this.path('published'),{generation,muted:true});if(stale())return;
   this.acceptState(state);this.micState='transport';this.setMicPhase('muted',stage);
   await this.syncMicIntent();if(stale())return;
   this.diagnostics?.record('micEnableMs',performance.now()-this.micClicked);
   void Promise.allSettled([this.devices(),this.monitor()]);
  }catch(e){
   if(stale())return;
   if(e.code==='AUDIO_INTERRUPTED'&&this.roomAudio){this.roomAudio.interrupt('context');return;}
   this.diagnostics?.record('micFailedStageMs',performance.now()-this.micPhaseStarted);
   this.micDesired=false;this.stopMicrophone();this.micState='failed';
   // Block a new attempt until the old publisher reservation is retired.
   await voiceRequest(this.path('mute'),{generation}).catch(()=>{});if(stale())return;
   const messages={NotAllowedError:'마이크 권한을 브라우저 설정에서 허용해 주세요.',NotFoundError:'사용 가능한 마이크가 없습니다. 장치를 연결해 주세요.',NotReadableError:'다른 앱의 마이크 사용을 종료하고 다시 시도해 주세요.',OverconstrainedError:'선택한 마이크를 사용할 수 없습니다. 기본 장치를 선택해 주세요.'};
   throw Object.assign(new Error(messages[e.name]||e.message),{roomMicPermission:e.name==='NotAllowedError'});
  }finally{if(attempt===this.micAttempt)this.micBusy=false;this.paint();}
 }

 async devices(){const devices=await navigator.mediaDevices.enumerateDevices();for(const [selector,kind,label] of [['#voice-input','audioinput','마이크'],['#voice-output','audiooutput','출력']]){const el=$(selector),selected=el.value;el.innerHTML='<option value="">기본 '+label+'</option>'+devices.filter(d=>d.kind===kind&&d.deviceId!=='default').map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||label+' '+(i+1))}</option>`).join('');el.value=selected;}$('#voice-output').disabled=!('setSinkId' in HTMLMediaElement.prototype);}
 async output(){const id=$('#voice-output').value;if(this.levelContext?.setSinkId)await this.levelContext.setSinkId(id);await Promise.all([...this.audios.values(),...(this.musicAudio?[this.musicAudio]:[])].map(a=>a.setSinkId?a.setSinkId(id):Promise.resolve()));}
 async monitor(){if(this.roomAudio?.blocked)return;const ticket=this.monitorTicket=(this.monitorTicket||0)+1,old=this.monitorContext;this.monitorContext=null;if(old)await old.close().catch(()=>{});if(ticket!==this.monitorTicket||this.closed||!this.stream||!$('#voice-monitor').checked)return;const ctx=this.monitorContext=new AudioContext();await ctx.resume();if(ticket!==this.monitorTicket||this.closed||!this.stream||!$('#voice-monitor').checked){await ctx.close().catch(()=>{});return;}ctx.createMediaStreamSource(this.processing?.stream||this.stream).connect(ctx.destination);}
 stopMicrophone(){this.monitorTicket=(this.monitorTicket||0)+1;this.micSync=null;this.preparedPublisher?.close();this.preparedPublisher=null;this.preparingMic=null;this.pendingStream?.getTracks().forEach(t=>t.stop());this.pendingStream=null;if(this.micSender?.track)this.micSender.track.onended=null;this.processing?.close();this.processing=null;this.micSender=null;if(this.stream){this.stream.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;}this.publisher?.close();this.publisher=null;this.monitorContext?.close().catch(()=>{});this.monitorContext=null;this.roomAudio?.updateType();}
 async mute(){this.micIntentRevision=(this.micIntentRevision||0)+1;this.micDesired=false;this.setCaptureEnabled(false);if(this.publisher?.connectionState==='connected'&&this.micSender?.track)return this.syncMicIntent();this.micState='muted';this.micAttempt=(this.micAttempt||0)+1;this.micBusy=false;this.stopMicrophone();const state=await this.command('mute');this.acceptState(state);this.paint();}
 receive(){
  const members=this.state?.members||[],key=members.filter(p=>p.id!==this.state?.self&&p.publishing).map(p=>p.id+':'+p.mediaKey).sort().join('|');
  if(key===this.receiveKey||this.closed)return this.mediaQueue;this.receiveKey=key;const version=this.receiveVersion=(this.receiveVersion||0)+1;
  const epoch=this.epoch,generation=this.generation,stale=()=>this.closed||epoch!==this.epoch||version!==this.receiveVersion;
  if(this.receiver&&this.receiver.connectionState!=='connected')this.receiver.close();
  this.mediaQueue=this.mediaQueue.catch(()=>{}).then(async()=>{
   await new Promise(resolve=>setTimeout(resolve,100));if(stale()||version!==this.receiveVersion)return;this.receiver?.close();for(const a of this.audios.values())this.releaseRemote(a);this.audios.clear();this.clearRemoteMeters();
   const pc=this.receiver=this.pc();let mapping=[];
   pc.ontrack=e=>{
    if(stale()||version!==this.receiveVersion||this.receiver!==pc)return;const id=mapping.find(t=>t.mid===e.transceiver.mid)?.user_id;if(!id)return;
    const previous=this.audios.get(id);if(previous)this.releaseRemote(previous);this.meters.get(id)?.source.disconnect();
    const a=new Audio();a.muted=!!this.roomAudio?.blocked;a.autoplay=true;a.srcObject=new MediaStream([e.track]);a.volume=(this.volumes.get(id)??1)*this.preferences.voice;this.audios.set(id,a);this.applyListenVolumes();this.meterTrack(id,e.track);this.startLevels();
    if('jitterBufferTarget' in e.receiver)try{e.receiver.jitterBufferTarget=100;}catch{}
    this.playRemote(a);
   };
   const r=await voiceRequest(this.path('subscribe'),{generation});if(stale()||version!==this.receiveVersion){pc.close();return;}mapping=r.tracks||[];
   if(r.sessionDescription){
    const started=performance.now();await pc.setRemoteDescription(r.sessionDescription);await pc.setLocalDescription(await pc.createAnswer());await this.ice(pc);if(stale()){pc.close();return;}
    await voiceRequest(this.path('answer'),{generation,negotiation:r.negotiation,sessionDescription:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
    if(stale()){pc.close();return;}await this.connected(pc);if(stale())return;
    this.diagnostics?.record('receiveConnectMs',performance.now()-started);
    // An unavailable output device must not recreate an otherwise healthy SFU session.
    try{await this.output();}catch{if(!stale())this.status('출력 장치를 확인해 주세요. 소리 설정에서 기본 출력을 선택할 수 있습니다.');}
   }else{pc.close();if(this.receiver===pc)this.receiver=null;}
  }).catch(e=>{if(stale()||version!==this.receiveVersion)return;this.receiveKey=null;this.status(e.message);if([401,403,404,409].includes(e.status))this.connectionError(e);else{clearTimeout(this.receiveRetry);this.receiveRetry=setTimeout(()=>{if(!stale())this.receive();},1500);}});
  return this.mediaQueue;
 }
 scheduleReconnect(){if(this.reconnectTimer||this.closed)return;this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;this.reconnect();},Math.min(30000,1000*2**Math.min(this.retries++,5)));}
 async reconnect(){if(this.closed||this.reconnecting)return;const reconnectStarted=performance.now();this.reconnecting=true;this.status('연결이 끊겼습니다. 다시 연결하는 중…');try{await this.join();}catch(e){this.status(e.message);if([401,403,404,409].includes(e.status))this.leave(false);else this.scheduleReconnect();}finally{this.reconnecting=false;this.diagnostics?.record('reconnectMs',performance.now()-reconnectStarted);}}
 stopMedia(){this.micDesired=false;this.micState='disconnected';this.warmSeat=null;this.micAttempt=(this.micAttempt||0)+1;this.micBusy=false;this.pendingStream?.getTracks().forEach(t=>t.stop());this.pendingStream=null;this.stopMicrophone();this.clearRemoteMeters();this.receiver?.close();this.receiver=null;for(const a of this.audios.values())this.releaseRemote(a);this.audios.clear();this.receiveKey=null;}
 leave(send=true){if(this.closed)return;this.chatEditor?.destroy();document.documentElement?.style.removeProperty('--room-toast-bottom');this.roomLayoutEvents?.abort();this.roomResizeObserver?.disconnect();if(this.roomLayoutFrame)cancelAnimationFrame(this.roomLayoutFrame);clearTimeout(this.roomNoticeTimer);document.querySelector?.('#main')?.style?.removeProperty('--voice-top');clearInterval(this.roomClock);this.roomDM?.destroy();this.roomDMUnreadStop?.();document.documentElement?.removeAttribute('data-room-popup');this.roomTitleObserver?.disconnect();this.talkViewEvents?.abort();this.controlEvents?.abort();this.roomShareAbort?.abort();clearTimeout(this.roomShareTimer);this.releaseRoomExternal?.();const leaving=send&&this.joined?fetch('/api/voice/'+this.path('leave'),{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({generation:this.generation}),signal:AbortSignal.timeout(8000)}).catch(()=>{}):Promise.resolve();this.closed=true;this.talkGiftQueue.length=0;this.finishTalkGift();setVoiceFocus(false);this.joined=false;this.stopMicTest?.();this.diagnostics?.stop();clearInterval(this.levelTimer);clearInterval(this.musicTimer);clearTimeout(this.volumeTimer);clearTimeout(this.searchTimer);this.searchAbort?.abort();window.removeEventListener('resize',this.onViewport);clearTimeout(this.receiveRetry);clearTimeout(this.seatInviteTimer);this.musicAudio?.pause();if(this.musicAudio){this.musicAudio.removeAttribute('src');this.musicAudio.load();}this.levelContext?.close().catch(()=>{});this.levelContext=null;clearInterval(this.heartbeat);clearTimeout(this.socketRetry);clearTimeout(this.reconnectTimer);clearTimeout(this.animationTimer);this.ws?.close();this.stopMedia();this.roomAudio?.dispose();if(this.host?.isConnected){$('#voice-content').hidden=true;$('#voice-entry').hidden=false;}window.removeEventListener('online',this.onOnline);window.removeEventListener('pagehide',this.onPageHide);document.removeEventListener('visibilitychange',this.onVisibility);window.removeEventListener('pageshow',this.onVisibility);window.removeEventListener('focus',this.onVisibility);window.visualViewport?.removeEventListener('resize',this.onViewport);window.visualViewport?.removeEventListener('scroll',this.onViewport);return leaving;}
 animateGift(event){
  if(this.closed||!event.gift?.id||this.seenGifts.has(event.gift.id))return;
  this.seenGifts.add(event.gift.id);
  if(this.seenGifts.size>200)this.seenGifts.delete(this.seenGifts.values().next().value);
  const gift=event.gift,still=roomGiftAsset(gift.artwork)||roomGiftAsset(gift.image)||AifectGifts.giftById(gift.type)?.image;
  if(document.hidden)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden||
   document.documentElement.hasAttribute('data-aifect-room-inactive')||['low','static'].includes(document.documentElement.dataset.previewQuality);
  const imageURL=(!reduced&&roomGiftAsset(gift.animation))||still,effect=!reduced&&roomGiftAsset(gift.effect);
  if(!this.liveMode){
   if(imageURL){this.talkGiftQueue.push({event,imageURL,still,effect});this.playNextTalkGift();}
   return;
  }
  const el=$('#voice-gift-animation');if(!el)return;
  const art=imageURL?giftArt({image:imageURL}):icon('gift');
  el.innerHTML=(effect?'<span class="live-product-gift-art">'+art+'<img alt="" src="'+esc(effect)+'"></span>':art)+
   `<strong>${esc(event.from)} → ${esc(event.to)}</strong><span>${esc(gift.name)} × ${number(gift.quantity)}</span>`;
  if(still&&imageURL!==still)el.querySelector('.gift-art').addEventListener('error',e=>{e.target.src=still;},{once:true});
  el.hidden=false;clearTimeout(this.animationTimer);
  this.animationTimer=setTimeout(()=>{el.hidden=true;el.replaceChildren();},4500);
 }
 playNextTalkGift(){
  if(this.activeTalkGift||this.closed||!this.talkGiftQueue.length)return;
  const layer=this.host?.querySelector('.talk-gift-effect');
  if(!layer?.isConnected){this.talkGiftQueue.length=0;return;}
  const {event,imageURL,still,effect}=this.talkGiftQueue.shift();
  if(document.hidden){this.talkGiftQueue.length=0;return;}
  const image=new Image();
  this.activeTalkGift={layer,image,targetId:event.gift.target_id};
  image.className='talk-gift-art';
  image.alt='';
  image.onerror=()=>{
   if(still&&image.getAttribute('src')!==still)image.src=still;
   else this.finishTalkGift();
  };
  image.onload=()=>{
   clearTimeout(this.animationTimer);
   if(!layer.isConnected){this.finishTalkGift();return;}
   layer.innerHTML=`<span class="talk-gift-caption">${talkGiftPeople(event.from,event.to)}</span>`;
   layer.prepend(image);
   if(effect){
    const overlay=new Image();overlay.className='talk-gift-art product-gift-overlay';overlay.alt='';
    overlay.onerror=()=>overlay.remove();overlay.src=effect;image.after(overlay);
   }
   layer.hidden=false;
   this.positionTalkGift();
   const observer=new ResizeObserver(()=>this.positionTalkGift());
   observer.observe(this.host);
   observer.observe(this.host.querySelector('#voice-seats'));
   this.activeTalkGift.observer=observer;
   this.animationTimer=setTimeout(()=>this.finishTalkGift(),window.matchMedia('(prefers-reduced-motion: reduce)').matches?400:1700);
  };
  // A stalled image may skip its effect, but must never hold up the following gifts or the chat log.
  this.animationTimer=setTimeout(()=>this.finishTalkGift(),5000);
  image.src=imageURL;
 }
 positionTalkGift(){
  const active=this.activeTalkGift;
  if(!active||active.layer.hidden)return;
  const {layer,targetId}=active;
  const seats=this.host.querySelector('#voice-seats');
  const grid=seats.getBoundingClientRect(),room=this.host.getBoundingClientRect();
  const occupant=targetId?seats.querySelector(`[data-voice-person="${CSS.escape(targetId)}"]`):null;
  const seat=occupant?.closest('.voice-seat').getBoundingClientRect();
  // Keep the effect inside the shared stage and clear of the music bar, composer and mic controls.
  const half=layer.offsetWidth/2;
  const center=grid.left+grid.width/2;
  let x=center,y=grid.top+(grid.height-layer.offsetHeight)/2;
  if(seat){
   x=seat.left+seat.width/2;
   // Use the space above the inner shoulder of the seat, away from the adjacent row's avatar.
   x+=Math.sign(center-x)*Math.min(seat.width*.40,active.image.offsetWidth*.47);
   y=seat.top-active.image.offsetHeight*.58;
  }
  layer.style.left=Math.max(grid.left+half,Math.min(x,grid.right-half))-room.left-this.host.clientLeft+'px';
  layer.style.top=Math.max(grid.top-4,y)-room.top-this.host.clientTop+'px';
 }
 finishTalkGift(){
  const active=this.activeTalkGift;
  if(!active)return;
  clearTimeout(this.animationTimer);
  active.image.onload=active.image.onerror=null;
  active.observer?.disconnect();
  active.layer.hidden=true;
  active.layer.replaceChildren();
  this.activeTalkGift=null;
  this.playNextTalkGift();
 }
}
