// Voice rooms deliberately do not share the recorder's media graph or MediaRecorder.
let voiceController=null;
const voiceShellState=new Map();
function setVoiceFocus(active){
 if(active){for(const el of (document.querySelectorAll?.('#sidebar,.topbar,.mobile-navigation,#player,.site-footer,.page-footer')||[])){if(!voiceShellState.has(el))voiceShellState.set(el,{hidden:el.hidden,display:el.style.display});el.hidden=true;el.style.display='none';}}
 else{for(const [el,old] of voiceShellState){el.hidden=old.hidden;el.style.display=old.display;}voiceShellState.clear();}
 const wrap=document.querySelector?.('.page-wrap');if(wrap)wrap.toggleAttribute('data-room-focus',active);
 document.querySelector?.('#main')?.toggleAttribute('data-room-focus',active);
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
function voiceChatMessageHTML(m,liveMode=false){
 const time=liveMode?`<time>${new Date(m.created).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</time>`:'';
 if(m.kind==='system')return `<article class="voice-chat-system"><p>${esc(m.body)}</p>${time}</article>`;
 if(m.kind==='gift'){
  const gift=AifectGifts.giftById(m.gift?.type);
  if(!liveMode){
   if(!m.name||!m.recipient_name||!m.gift?.name||!m.gift.quantity)return `<article class="talk-gift-notice">${esc(m.body)}</article>`;
   const item=`${esc(m.gift.name)} ×${number(m.gift.quantity)}`;
   return `<article class="talk-gift-notice"><span class="sr-only">${esc(m.name)}님이 ${esc(m.recipient_name)}님에게 ${esc(m.gift.name)} ${number(m.gift.quantity)}개를 보냈습니다.</span>${gift?giftArt(gift):''}<span aria-hidden="true">${talkGiftPeople(m.name,m.recipient_name)} · ${item}</span></article>`;
  }
  return `<article class="voice-chat-gift"><header><b>${icon('gift')} 선물 알림</b>${time}</header><div class="voice-chat-gift-body">${gift?giftArt(gift):''}<p>${esc(m.body)}</p></div></article>`;
 }
 return `<article class="voice-chat-message"><span class="voice-chat-avatar">${avatarImage({name:m.name,profile_id:m.profile_id,image_version:m.image_version})}</span><div><header><b>${esc(m.name)}</b>${time}</header><p>${m.body?.includes('[aifect:')?AifectStickers.render(m.body,esc):esc(m.body)}</p></div></article>`;
}
async function voiceRequest(path,body,method=body===undefined?'GET':'POST',signal) {
 const r=await fetch('/api/voice/'+path,{method,signal,credentials:'same-origin',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error||'토킹룸 연결에 실패했어요.'),{status:r.status});return data;
}
async function voiceView(base,id,signal) {
 if(base!=='voice')return null;
 if(id){if(!me)return {html:heading('토킹룸')+gate()};return {html:voiceRoomHTML(id)};}
 return {html:liveDirectoryHTML('talk'),voiceLobby:true};
}
function cleanupVoiceRoute(base,id) {setVoiceFocus(!!me&&base==='voice'&&!!voiceController&&voiceController.id===id&&voiceController.joined&&!voiceController.closed);if(voiceController&&(!me||base!=='voice'||voiceController.id!==id)){const leaving=voiceController.leave();voiceController=null;return leaving;}}
function bindVoice(base,id) {
 if(base!=='voice'&&!(base==='community'&&!id))return;
 const host=document.querySelector('[data-voice-room]');
 if(!host){bindVoiceLobby();return;}
 if(!voiceController||voiceController.closed||voiceController.id!==id)voiceController=new VoiceRoomClient(id);
 if(voiceEntryAudio&&(voiceEntryAudio.id===null||voiceEntryAudio.id===id)){clearTimeout(voiceEntryAudio.timer);voiceController.levelContext=voiceEntryAudio.context;voiceEntryAudio=null;}
 voiceController.bind(host);
}
class VoiceRoomClient {
 constructor(id){this.id=id;this.micAttempt=1;this.micState="muted";this.preferences={music:1,voice:1,input:1,preset:'studio',noise:true,echo:true,reverb:0};this.meters=new Map();this.state=null;this.closed=false;this.joined=false;this.generation=null;this.audios=new Map();this.volumes=new Map();this.mediaQueue=Promise.resolve();this.receiveKey=null;this.retries=0;this.seenGifts=new Set();this.talkGiftQueue=[];this.giftRequest=crypto.randomUUID();this.inviteRequest=crypto.randomUUID();this.onOnline=()=>this.reconnect();this.onPageHide=()=>{this.stopMedia();this.ws?.close();};window.addEventListener('pagehide',this.onPageHide);this.onVisibility=()=>{if(!document.hidden&&this.joined)this.refresh().catch(()=>this.reconnect());};window.addEventListener('online',this.onOnline);document.addEventListener('visibilitychange',this.onVisibility);}
 path(action){return `rooms/${this.id}/${action}`;}
 command(action,b={}){return voiceRequest(this.path(action),{...b,generation:this.generation});}
 acceptState(state){
  if(this.closed||!state||state.generation!==this.generation||state.revision<(this.state?.revision??-1))return false;
  if((state.music?.revision??-1)<(this.state?.music?.revision??-1))state.music=this.state.music;
  if(state.members&&this.state?.members){
   const previous=new Map(this.state.members.map(p=>[p.id,p]));
   state.members=state.members.map(p=>({...previous.get(p.id),...p}));
  }
  this.state=state;this.paint();void this.receive();return true;
 }
 status(message,connected=false){
  const el=$('#voice-status');if(!el)return;
  el.textContent=message;
  el.toggleAttribute?.('data-connected',connected);
 }
 async safe(fn){try{await fn();}catch(e){this.status(e.message);toast(e.message);}}
 bind(host){this.host=host;if(!this.liveMode){this.waitForMusicGesture??=!this.levelContext;try{const v=localStorage.getItem('aifect.talkingRoom.listenVolume');if(v!==null&&Number.isFinite(Number(v)))this.preferences.music=Math.max(0,Math.min(1,Number(v)));}catch{}}this.resumeSound();$('#voice-join').onclick=()=>{if(this.closed){voiceController=new VoiceRoomClient(this.id);voiceController.bind(host);}else this.safe(()=>this.join());};const unlock=()=>{const blocked=this.waitForMusicGesture||this.host.querySelector('[data-voice=resume-audio]')?.hidden===false;this.waitForMusicGesture=false;if(this.liveMode||blocked)this.resumeSound();};host.onpointerdown=unlock;host.onclick=e=>{unlock();const b=e.target.closest('[data-voice]');if(b)this.safe(()=>this.action(b.dataset.voice,b.dataset.target,b));};
  this.bindFinalControls();
  const chat=$('#voice-chat-form'),stickers=this.stickers;
  chat.onsubmit=busyForm(chat,async()=>{
   const text=chat.elements.body.value,body=stickers?.body()??text;
   if(!body.trim())return;
   this.chatPending=this.chatPending?.body===body?this.chatPending:{body,request_id:crypto.randomUUID()};
   await this.command('chat',this.chatPending);
   if(this.closed||chat!==$('#voice-chat-form'))return;
   this.toggleEmojiPicker(false);
   if(chat.elements.body.value===text)chat.reset();
   stickers?.clear();this.chatPending=null;
   await this.refresh();
  });
  const gift=$('#voice-gift-form');gift.onchange=()=>{this.giftRequest=crypto.randomUUID();this.giftSummary();};gift.onsubmit=busyForm(gift,()=>this.openGiftDialog());
  $('#voice-monitor').onchange=()=>this.safe(()=>this.monitor());$('#voice-input').onchange=()=>this.safe(()=>this.changeMicrophone());$('#voice-output').onchange=()=>this.safe(()=>this.output());
  this.bindAudioSettings();window.visualViewport?.removeEventListener('resize',this.onViewport);window.removeEventListener('resize',this.onViewport);this.onViewport=()=>{if(this.host?.isConnected){if(this.joined){setVoiceFocus(true);}const height=window.visualViewport?.height||window.innerHeight,top=Math.max(0,this.host.getBoundingClientRect().top);this.host.style?.setProperty('--voice-viewport',Math.max(0,height-top-(window.innerWidth>800?16:0))+'px');}};window.visualViewport?.addEventListener('resize',this.onViewport);window.addEventListener('resize',this.onViewport);this.onViewport();this.giftSummary();if(this.state)this.paint();else if(!this.joinAttempted)this.safe(()=>this.join());
 }
 async join(){
  if(this.closed||this.joining)return;this.joining=true;this.joinAttempted=true;this.epoch=(this.epoch||0)+1;
  if(this.host?.isConnected)$('#voice-entry').hidden=true;
  try {
   this.status('토킹룸에 연결하는 중…');audio.pause();this.stopMedia();
   this.joinRequest=this.joinRequest||crypto.randomUUID();
   const started=Date.now(),s=await voiceRequest(this.path('join'),{request_id:this.joinRequest});this.joinRequest=null;if(s.serverNow)this.musicClock=s.serverNow-(started+Date.now())/2;
   if(this.closed){void voiceRequest(this.path('leave'),{generation:s.generation}).catch(()=>{});return;}
   this.generation=s.generation;this.state=s;if(typeof VoiceDiagnostics!=='undefined'&&!this.diagnostics)this.diagnostics=new VoiceDiagnostics(this);this.joined=true;setVoiceFocus(true);this.onViewport?.();this.retries=0;this.paint();if(this.closed)return;this.socket();
   clearInterval(this.heartbeat);this.heartbeat=setInterval(()=>this.refresh().catch(e=>this.connectionError(e)),20000);
   await this.receive();

  }finally{this.joining=false;if(this.host?.isConnected&&!this.joined&&!this.closed)$('#voice-entry').hidden=false;}
 }
 connectionError(e){if([401,403,404,409].includes(e.status)){this.status(e.message);this.leave(false);return;}this.reconnect();}
 socket(){this.ws?.close();const u=new URL('/api/voice/'+this.path('socket'),location.href);u.searchParams.set('generation',this.generation);u.protocol=u.protocol==='https:'?'wss:':'ws:';const ws=this.ws=new WebSocket(u);
  {
   ws.onopen=()=>{
    if(this.closed||this.ws!==ws)return;
    const blocked=this.host.querySelector('[data-voice=resume-audio]')?.hidden===false;
    this.status(blocked?'실시간 연결됨 · 청취 대기':this.liveMode&&this.state?.karaoke?.phase==='singing'&&this.state.karaoke.active?.user_id===this.state.self?'실시간 연결됨 · 가창 중':'실시간 연결됨 · 청취 중',true);
   };
  }
  ws.onmessage=e=>{try{const v=JSON.parse(e.data);if(v.type==='state'){this.acceptState(v.state);return;}if(v.type==='music'&&this.state){if(v.music?.revision>=(this.state.music?.revision??-1)){this.state.music=v.music;this.paintMusic();}return;}if(v.type==='gift')this.animateGift(v);this.refresh().catch(err=>this.connectionError(err));}catch{}};ws.onclose=e=>{if(!this.closed&&this.joined&&this.ws===ws){if([4000,4001].includes(e.code)){this.status('입장 정보가 바뀌었어요. 다시 입장해주세요.');this.leave(false);return;}this.status('실시간 연결 복구 중…');clearTimeout(this.socketRetry);this.socketRetry=setTimeout(()=>{if(!this.closed)this.socket();},3000);}};}
 async refresh(){if(this.closed||!this.joined)return;if(this.refreshing){this.refreshAgain=true;return;}this.refreshing=true;const epoch=this.epoch;try{const started=Date.now(),state=await this.command('heartbeat');if(state.serverNow)this.musicClock=state.serverNow-(started+Date.now())/2;if(this.closed||epoch!==this.epoch)return;if(state.revision<(this.state?.revision??-1))return;if((state.music?.revision??-1)<(this.state?.music?.revision??-1))state.music=this.state.music;this.state=state;this.paint();await this.receive();}catch(e){if(!this.closed&&epoch===this.epoch)throw e;}finally{this.refreshing=false;if(this.refreshAgain){this.refreshAgain=false;void this.refresh().catch(e=>this.connectionError(e));}}}
 paint(){if(!this.host?.isConnected||!this.state)return;const s=this.state,self=s.members.find(p=>p.id===s.self);if(!self){this.leave(false);return;}$('#voice-entry').hidden=true;$('#voice-content').hidden=false;$('#voice-title').textContent=s.room.title;$('#voice-title').title=s.room.title;
  const micOn=!!this.micSender?.track?.enabled&&!self.muted;
  const seatHTML=Array.from({length:8},(_,i)=>{const p=s.members.find(p=>p.seat===i);return '<div class="voice-seat">'+(p?`<div class="voice-seat-occupant"><button type="button" class="voice-person" data-voice="talk-profile" data-target="${esc(p.id)}" data-level-user="${esc(p.id)}" aria-label="${esc(p.name)} 프로필">${roomMemberAvatar(p)}<strong title="${esc(p.name)}">${p.role==='host'?'<span class="room-host-crown" aria-label="방장">'+voiceGlyph('crown')+'</span>':''}<span>${esc(p.name)}</span></strong></button>${roomRelationButton(p,s.self,true)}</div>`:'<button type="button" class="voice-seat-empty" data-voice="request-mic" data-target="'+i+'" aria-label="'+(i+1)+'번 좌석 참여 신청">'+voiceGlyph('plus')+'</button>')+'</div>';}).join('');
  if(this.seatHTML!==seatHTML){$('#voice-seats').innerHTML=seatHTML;this.seatHTML=seatHTML;this.positionTalkGift();}
  const listenerHTML=[...s.members].sort((a,b)=>(b.role==='host')-(a.role==='host')).map(p=>'<button class="voice-person" data-voice="participants" aria-label="'+esc(p.name)+' 참여자 목록">'+avatarImage({name:p.name,profile_id:p.profile_id,image_version:p.image_version})+'</button>').join('')+'<button class="voice-avatar-plus" data-voice="participants" aria-label="참여자 목록 열기">'+voiceGlyph('plus')+'</button>';
  if(this.listenerHTML!==listenerHTML){$('#voice-listeners').innerHTML=listenerHTML;this.listenerHTML=listenerHTML;}

  this.paintFinalControls();
  if(!this.liveMode)this.paintTalkPanel(self,micOn);
  this.updateRoomClock?.();
  this.paintMusic();
  this.updateListening();
  const close=this.host.querySelector('[data-voice="close"]');if(close)close.hidden=true;
  const cancel=this.host.querySelector('.voice-cancel-request');if(cancel)cancel.hidden=!self.requested;
  for(const button of this.host.querySelectorAll('.voice-seat-empty'))button.disabled=self.role!=='host'&&(self.requested||self.locked||!!this.seatCommandPending);
  for(const button of this.host.querySelectorAll('.voice-seat-mic[data-voice]')){button.disabled=self.locked;button.setAttribute('aria-busy',String(!!this.micBusy));}
  $('#voice-mic-note').toggleAttribute('data-progress',['permission','capture','processing','ice','signaling','transport','failed'].includes(this.micState));
  $('#voice-mic-note').textContent=self.requested?'좌석 참여 신청 중 · 방장 승인 대기':self.locked?'관리자가 마이크를 음소거했어요.':({permission:'마이크 권한 확인 중…',capture:'마이크 장치 준비 중…',processing:'음향 처리 준비 중…',ice:'네트워크 경로 준비 중…',signaling:'음성 서버에 송출 등록 중…',transport:'음성 연결 확인 중…',failed:'마이크 연결 실패 · 다시 눌러 재시도',muted:'마이크 꺼짐',on:'마이크 켜짐'}[this.micState]||'');
  if(self.locked||self.seat===null){if(this.stream||this.pendingStream||this.preparingMic||this.micBusy){this.micDesired=false;this.micAttempt=(this.micAttempt||0)+1;this.micBusy=false;this.stopMicrophone();}this.warmSeat=null;}else this.warmMicrophone();
  const messages=[...s.chat,...(s.notices||[])].sort((a,b)=>a.sequence-b.sequence),requests=s.members.filter(p=>p.requested&&(self.role==='host'||(!this.liveMode&&p.id===self.id)));
  const log=$('#voice-chat'),near=log.scrollHeight-log.scrollTop-log.clientHeight<60,last=(messages.at(-1)?.id||'')+JSON.stringify(requests.map(p=>[p.id,p.requestedSeat,p.requestExpires]));
  if(log.dataset.last!==last){log.innerHTML=messages.map(m=>voiceChatMessageHTML(m,this.liveMode).replace('class="voice-chat-message"','class="voice-chat-message'+(m.user_id===s.self?' is-self':'')+'"')).join('')+requests.map(p=>!this.liveMode?voiceChatMessageHTML({kind:'system',body:p.name+'님이 좌석 참여를 신청했어요.'}):`<article class="voice-seat-request">${avatarImage({name:p.name,profile_id:p.profile_id,image_version:p.image_version})}<div><b>${esc(p.name)}</b><p>${Number(p.requestedSeat)+1}번 좌석 참여 신청</p><button class="small-button" data-voice="approve-mic" data-target="${esc(p.id)}">수락</button><button class="small-button" data-voice="reject-mic" data-target="${esc(p.id)}">거절</button></div></article>`).join('');log.dataset.last=last;if(near)log.scrollTop=log.scrollHeight;}
  const select=$('#voice-gift-target'),previous=select.value;select.innerHTML=s.members.filter(p=>p.id!==self.id&&p.profile_id).map(p=>`<option value="${esc(p.profile_id)}">${esc(p.name)}</option>`).join('');if([...select.options].some(o=>o.value===previous))select.value=previous;
 }
 showSheet(id){this.showTalkPopup(id,this.actionTrigger);}
 microphoneConstraints(){const supported=navigator.mediaDevices.getSupportedConstraints?.()||{},constraints={};for(const [key,value] of [['echoCancellation',this.preferences.echo],['noiseSuppression',this.preferences.noise],['autoGainControl',true]])if(supported[key]!==false)constraints[key]=value;if(supported.channelCount!==false)constraints.channelCount={ideal:1};const id=$('#voice-input').value;if(id)constraints.deviceId={ideal:id};return constraints;}
 watchProcessing(){const graph=this.processing,raw=this.stream,sender=this.micSender;if(!graph?.context||!raw||!sender)return;graph.context.onstatechange=()=>{if(this.closed||this.processing!==graph||this.micSender!==sender)return;const track=graph.context.state==='running'?graph.stream.getAudioTracks()[0]:raw.getAudioTracks()[0];track.enabled=sender.track?.enabled!==false;void sender.replaceTrack(track).catch(()=>this.status('마이크 장치 연결을 확인해주세요.'));};}
 async changeMicrophone(){
  if(!this.stream||!this.micSender)return;const epoch=this.epoch,attempt=this.micAttempt,sender=this.micSender;
  const raw=await navigator.mediaDevices.getUserMedia({audio:this.microphoneConstraints(),video:false});
  const graph=await VoiceAudio.microphone(raw,this.preferences.preset,this.preferences.input,this.liveMode?liveVoiceMix(this):undefined);graph.setReverb(this.preferences.reverb);
  if(this.closed||epoch!==this.epoch||attempt!==this.micAttempt||sender!==this.micSender){graph.close();raw.getTracks().forEach(t=>t.stop());return;}
  try{graph.stream.getAudioTracks()[0].enabled=sender.track?.enabled!==false;await sender.replaceTrack(graph.stream.getAudioTracks()[0]);}catch(e){graph.close();raw.getTracks().forEach(t=>t.stop());throw e;}
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
  if(action==='copy-link'){await navigator.clipboard.writeText(location.origin+'/#voice/'+this.id);toast('초대 링크를 복사했어요.');return true;}
  if(action==='music-picker'){this.showSheet('voice-music-sheet');return true;}
  if(await this.finalAction(action,target))return true;
  if(action.startsWith('music-')){const operation=action.slice(6);await this.musicCommand(operation,operation==='remove'?{index:Number(target)}:operation==='up'?{index:Number(target),to:Number(target)-1}:{});return true;}
  return false;
 }
 bindAudioSettings(){
  for(const [id,key] of [['voice-music-volume','music'],['voice-listen-volume','voice'],['voice-input-gain','input']]){const el=$('#'+id);el.value=this.preferences[key]*100;el.setAttribute('aria-valuetext',Math.round(el.value)+'%');el.oninput=()=>{el.setAttribute('aria-valuetext',Math.round(el.value)+'%');this.preferences[key]=Number(el.value)/100;if(key==='music')this.syncPersonalVolume?.();this.processing?.setLevel(this.preferences.input);this.applyListenVolumes();this.syncMusic();};}
  this.bindRoomEcho();
  for(const [id,operation] of [['voice-room-volume','volume'],['voice-balance','balance']]){const el=$('#'+id);el.oninput=()=>{clearTimeout(this.volumeTimer);el.setAttribute('aria-valuetext',Math.round(el.value)+'%');const value=Number(el.value)/100;this.volumeTimer=setTimeout(()=>this.safe(()=>this.musicCommand(operation,{value})),160);};}
  $('#voice-noise').checked=this.preferences.noise;$('#voice-noise').onchange=()=>{this.preferences.noise=$('#voice-noise').checked;this.safe(async()=>{const track=this.stream?.getAudioTracks()[0];if(track?.applyConstraints)await track.applyConstraints({noiseSuppression:this.preferences.noise});});};
  $('#voice-music-seek').onchange=()=>this.safe(()=>this.musicCommand('seek',{position:Number($('#voice-music-seek').value)}));
  $('#voice-music-search').onsubmit=e=>{e.preventDefault();clearTimeout(this.searchTimer);this.safe(()=>this.searchMusic());};
  $('#voice-music-query').oninput=()=>{clearTimeout(this.searchTimer);this.searchSerial=(this.searchSerial||0)+1;this.searchAbort?.abort();this.searchTimer=setTimeout(()=>this.safe(()=>this.searchMusic()),220);};
  $('#voice-music-results').onclick=e=>{const b=e.target.closest('[data-music-track]');if(b&&!b.disabled)this.safe(async()=>{b.disabled=true;try{if(b.dataset.consent==='true'){const checkbox=b.closest('article').querySelector('input[type=checkbox]');if(!checkbox?.checked)throw Error('공동 감상 권리 확인에 동의해주세요.');await this.command('music-consent',{track_id:b.dataset.musicTrack,accept:true});b.dataset.consent='false';b.closest('article').querySelector('.voice-consent')?.remove();this.searchCache?.clear();}await this.musicCommand('enqueue',{track_id:b.dataset.musicTrack});toast('재생목록에 추가했어요. 재생 버튼을 눌러 시작하세요.');}finally{b.disabled=false;}});};
  clearInterval(this.musicTimer);this.musicTimer=setInterval(()=>this.syncMusic(),1500);
 }
 async searchMusic(){
  const query=$('#voice-music-query').value.trim(),epoch=this.epoch;
  if(this.searchPending?.query===query&&this.searchPending.serial===this.searchSerial)return this.searchPending.promise;
  const serial=this.searchSerial=(this.searchSerial||0)+1;this.searchAbort?.abort();
  if(!query){$('#voice-music-results').innerHTML='';$('#voice-results-heading').hidden=true;return;}
  const controller=this.searchAbort=new AbortController();this.searchCache ||= new Map();const cached=this.searchCache.get(query);
  $('#voice-results-heading').hidden=false;$('#voice-search-count').textContent='검색 중…';$('#voice-music-results').setAttribute('aria-busy','true');
  const started=performance.now(),promise=cached&&Date.now()-cached.at<30000?Promise.resolve(cached.data):voiceRequest(this.path('music-search')+'?generation='+encodeURIComponent(this.generation)+'&q='+encodeURIComponent(query),undefined,'GET',controller.signal);
  this.searchPending={query,serial,promise};
  let data;try{data=await promise;}catch(e){if(e.name!=='AbortError'&&serial===this.searchSerial){$('#voice-search-count').textContent='검색 실패';$('#voice-music-results').textContent=e.message;}return;}finally{if(serial===this.searchSerial){this.searchPending=null;$('#voice-music-results').setAttribute('aria-busy','false');}}
  if(this.closed||epoch!==this.epoch||serial!==this.searchSerial)return;
  this.diagnostics?.record('musicSearchMs',performance.now()-started);this.searchCache.set(query,{at:Date.now(),data});if(this.searchCache.size>20)this.searchCache.delete(this.searchCache.keys().next().value);
  $('#voice-results-heading').hidden=false;$('#voice-search-count').textContent='검색 결과 '+data.tracks.length+'개';
  $('#voice-music-results').innerHTML=data.tracks.map(t=>'<article class="voice-music-result"><img alt="" src="'+esc(trackArtworkPath(t))+'"><div><strong>'+esc(t.title)+'</strong><small>'+esc(t.artist||t.producer)+'</small></div>'+(!t.room_allowed?'<label class="voice-consent"><input type="checkbox">'+esc(data.consent)+'</label>':'')+'<time>'+time(t.duration)+'</time><button aria-label="'+esc(t.title)+' 추가" class="small-button" data-music-track="'+esc(t.id)+'" data-consent="'+!t.room_allowed+'">'+voiceGlyph('plus')+'</button></article>').join('')||'<p class="quiet">공동 감상이 허용된 곡이 없어요. 본인이 올린 원곡은 검색 후 권리를 확인하고 허용할 수 있어요.</p>';
 }
 async musicCommand(operation,input={}){
  if(this.state?.members.find(m=>m.id===this.state.self)?.role!=='host')throw Error('방장만 음악을 관리할 수 있어요.');
  const epoch=this.epoch,music=this.state.music,command={operation:operation==='up'?'move':operation,...input,request_id:crypto.randomUUID()};
  if(operation==='ended')command.revision=music.revision;
  const state=await this.command('music',command);if(this.closed||epoch!==this.epoch||state.revision<(this.state?.revision??-1))return;this.state=state;this.paint();if(operation==='clear')$('#voice-music-sheet').scrollTop=0;
 }
 paintMusic(){
  this.paintFinalMusic();this.syncMusic();this.applyListenVolumes();
 }
 syncMusic(){
  const m=this.state?.music;if(!m||this.closed)return;const track=m.queue[m.index];
  if(!this.musicAudio){if(!track)return;const a=this.musicAudio=new Audio();a.preload='auto';a.onloadedmetadata=()=>this.syncMusic();a.onended=()=>{if(this.state?.members.find(p=>p.id===this.state.self)?.role==='host')this.safe(()=>this.musicCommand('ended'));};a.onwaiting=()=>this.musicNotice('음악 버퍼링 중');a.onplaying=()=>{this.musicNoticeText='';};a.onerror=async()=>{const key=this.musicTrack;let text=a.error?.code===3?'지원하지 않는 음악 형식이에요.':'음악 네트워크 연결을 확인해주세요.';try{const response=await fetch(a.src,{method:'HEAD',credentials:'same-origin'});if([401,403].includes(response.status))text='공동 음악 접근 권한을 확인해주세요.';else if([404,409].includes(response.status))text='곡이 변경되었거나 더 이상 공개되지 않아요.';}catch{}if(!this.closed&&this.musicTrack===key)this.musicNotice(text);};}
  const a=this.musicAudio;this.playbackGain(a,Math.max(0,Math.min(1,m.volume*this.preferences.music)));
  if(!track){a.pause();this.musicTrack=null;this.musicBlocked=false;return;}
  const key=track.id+':'+this.generation;if(this.musicTrack!==key){this.musicTrack=key;this.musicNoticeText='';a.src='/api/voice/'+this.path('music-stream')+'?track_id='+encodeURIComponent(track.id)+'&generation='+encodeURIComponent(this.generation);a.load();}
  const seconds=Math.min(track.duration,Math.max(0,m.position+(m.playing?Math.max(0,Date.now()+(this.musicClock||0)-m.updated)/1000:0)));
  if(a.readyState>=1){const drift=seconds-a.currentTime;if(Math.abs(drift)>.75||(!m.playing&&Math.abs(drift)>.02))a.currentTime=seconds;a.playbackRate=1;}
  if(typeof $==='function'){const elapsed=$('#voice-music-time');if(elapsed)elapsed.textContent=this.musicNoticeText||((m.playing?'':'Ⅱ ')+time(seconds)+' / '+time(track.duration));const seek=$('#voice-music-seek');if(seek&&!seek.matches?.(':active'))seek.value=seconds;}
  if(m.playing&&typeof audio!=='undefined'&&!audio.paused)audio.pause();
  if(this.waitForMusicGesture&&m.playing){this.musicBlocked=true;this.updateListening();return;}
  if(!m.playing){a.pause();this.musicBlocked=false;}else if(a.paused&&!a.ended)a.play().then(()=>{this.musicBlocked=false;this.updateListening();}).catch(error=>{if(!this.liveMode&&error?.name==='NotAllowedError')this.waitForMusicGesture=true;this.musicBlocked=true;this.musicNotice('대화 듣기를 눌러 소리를 켜주세요');this.updateListening();});
 }
 musicNotice(text){this.musicNoticeText=text;const el=typeof $==='function'?$('#voice-music-time'):null;if(el)el.textContent=text;}
 resumeSound(){
  if(this.closed)return;
  try{const Context=window.AudioContext||window.webkitAudioContext;if(Context&&!this.levelContext)this.levelContext=new Context({latencyHint:'interactive'});
   if(this.levelContext)this.levelContext.onstatechange=()=>{if(!this.closed){this.applyListenVolumes();this.updateListening();}};
   const resumed=this.levelContext?.resume();
   void resumed?.then(()=>{if(this.closed)return;this.applyListenVolumes();for(const a of this.audios.values())this.playRemote(a);this.syncMusic();this.updateListening();}).catch(()=>this.updateListening());
  }catch{}
  for(const a of this.audios?.values()||[])this.playRemote(a);
  void this.processing?.context?.resume().catch(()=>{});this.syncMusic();this.updateListening();
 }
 updateListening(){
  const button=this.host?.querySelector('[data-voice="resume-audio"]');if(!button)return;
  const blocked=this.musicBlocked||this.levelContext&&this.levelContext.state!=='running'||[...(this.audios?.values()||[])].some(a=>a.voiceBlocked);
  const changed=button.hidden===Boolean(blocked);
  button.hidden=!blocked;
  if(this.ws?.readyState===1&&$('#voice-status')?.hasAttribute('data-connected')){
   this.status(blocked?'실시간 연결됨 · 청취 대기':this.liveMode&&this.state?.karaoke?.phase==='singing'&&this.state.karaoke.active?.user_id===this.state.self?'실시간 연결됨 · 가창 중':'실시간 연결됨 · 청취 중',true);
  }
 }
 playRemote(a){
  const active=()=>!this.closed&&[...this.audios.values()].includes(a);
  const blocked=()=>{if(!active())return;a.voiceBlocked=!(a.voiceStream&&this.levelContext?.state==='running');this.updateListening();};
  try{void a.play()?.then(()=>{if(active()){a.voiceBlocked=false;this.updateListening();}},blocked);}catch{blocked();}
 }
 playbackGain(element,volume){
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
 startLevels(){if(this.levelTimer)return;this.levelTimer=setInterval(()=>{if(this.closed)return;const levels=new Map();try{if(this.processing?.analyser&&!this.state.members.find(p=>p.id===this.state.self)?.muted)levels.set(this.state.self,VoiceAudio.rms(this.processing.analyser));if(this.testGraph?.analyser){const level=VoiceAudio.rms(this.testGraph.analyser);for(const meter of this.host.querySelectorAll('#voice-input-meter,.talk-test-meter'))meter.value=level;}for(const [id,m] of this.meters)levels.set(id,VoiceAudio.rms(m.analyser));}catch{}for(const el of this.host?.querySelectorAll('[data-level-user]')||[]){const member=this.state.members.find(p=>p.id===el.dataset.levelUser),level=member&&!member.muted?levels.get(el.dataset.levelUser)||0:0;el.style.setProperty('--voice-level',level.toFixed(3));el.classList.toggle('is-speaking',level>.04);}},100);}
 async openGiftDialog(){
  if(this.closed||!this.joined||!this.host?.isConnected)throw Error('토킹룸에 다시 입장한 뒤 선물해주세요.');
  const generation=this.generation,state=this.state,recipients=(state?.members||[]).filter(p=>p.id!==state.self&&p.profile_id).map(p=>({id:p.profile_id,name:p.name}));
  if(!recipients.length){if(!$('#voice-gift-sheet')?.open)this.showSheet('voice-gift-sheet');return;}
  const form=$('#voice-gift-form'),select=$('#voice-gift-target');
  const recipient=recipients.find(p=>p.id===select?.value)||recipients[0],gift=AifectGifts.GIFT_CATALOG.find(g=>g.id===form?.elements.gift_type?.value)||AifectGifts.GIFT_CATALOG[0];
  const quantity=Math.max(1,Math.min(100,Math.trunc(Number(form?.elements.quantity?.value)||1)));
  $('#voice-gift-sheet')?.close();
  const modal=$('#dialog');
  if(modal?.open)return;
  if(modal)dialog('<section class="gift-dialog gift-dialog--compact" data-room-gift-loading aria-busy="true"><header class="gift-dialog-header"><h2>선물하기</h2></header><p role="status">선물과 잔액을 불러오는 중…</p></section>');
  const opening=profileGiftDialog(recipient.id,{id:gift.id,quantity,roomGift:{
   recipients,
   onRecipientChange:profile_id=>{if(select&&recipients.some(p=>p.id===profile_id))select.value=profile_id;},
   send:async({profile_id,gift_type,quantity,request_id})=>{
    if(this.closed||!this.joined||!this.host?.isConnected||this.generation!==generation)throw Error('토킹룸 입장 정보가 바뀌었어요. 선물하기를 다시 열어주세요.');
    if(!recipients.some(p=>p.id===profile_id)||!this.state?.members.some(p=>p.id!==this.state.self&&p.profile_id===profile_id))throw Error('받는 사람이 토킹룸을 나갔어요. 선물하기를 다시 열어주세요.');
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
 giftSummary(){const form=$('#voice-gift-form');if(!form)return;const g=AifectGifts.GIFT_CATALOG.find(g=>g.id===form.elements.gift_type.value);$('#voice-gift-summary').textContent=`총 ${number((g?.gold||0)*Number(form.elements.quantity.value))} G · 보낸 선물은 취소할 수 없어요.`;}
 async action(action,target,button){this.actionTrigger=button;if(action==='dismiss'&&button){button.closest('dialog')?.close();return;}if(action==='resume-audio'){this.resumeSound();return;}if(await this.roomUIAction(action,target))return;if(action==='leave'){if(!this.joined){this.leave(false);location.hash='#voice';return;}this.showSheet('talk-leave');return;}if(action==='confirm-leave'){await this.command('leave');this.leave(false);location.hash=this.liveMode?'#live':'#voice';return;}if(action==='leave'){await this.leave();location.hash='#voice';return;}if(action==='close'){await this.command('close');this.leave(false);location.hash='#voice';return;}if(action==='enable-mic')return this.enableMic();if(action==='mute')return this.mute();if(!this.liveMode&&['request-mic','cancel-mic','approve-mic','reject-mic'].includes(action))return this.talkSeatAction(action,target,button);
  if(action==='request-mic'&&this.state.members.find(p=>p.id===this.state.self)?.role==='host'){this.openSeatPicker(Number(target));return;}if(action==='release-mic')this.stopMicrophone();if(['mute-user','unlock','kick','ban','admin','revoke-admin'].includes(action))await this.command('moderate',{target_id:target,operation:action==='mute-user'?'mute':action});else {const self=this.state.members.find(p=>p.id===this.state.self);if(action==='request-mic'&&['host','admin'].includes(self.role))await this.command('approve-mic',{target_id:self.id,seat:Number(target)});else await this.command(action,{target_id:target,...(action==='request-mic'&&target!==undefined?{seat:Number(target)}:{})});}await this.refresh();}
 pc(){const p=new RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}],bundlePolicy:'max-bundle',iceCandidatePoolSize:1});p.onconnectionstatechange=()=>{
  if(p.connectionState!=='failed'||this.closed)return;
  if(this.publisher===p){this.reconnect();return;}
  // A failed listening transport must not tear down the user's live microphone.
  if(this.receiver===p){const epoch=this.epoch;this.receiveKey=null;clearTimeout(this.receiveRetry);this.receiveRetry=setTimeout(()=>{if(!this.closed&&epoch===this.epoch&&this.receiver===p)this.receive();},500);}
 };return p;}
 async connected(pc){if(pc.connectionState==='connected')return;await new Promise((resolve,reject)=>{const finish=error=>{clearTimeout(timer);pc.removeEventListener('connectionstatechange',check);error?reject(error):resolve();},check=()=>{if(pc.connectionState==='connected')finish();else if(['failed','closed'].includes(pc.connectionState))finish(new Error('음성 연결을 다시 시작해주세요.'));},timer=setTimeout(()=>finish(new Error('음성 연결 시간이 초과됐어요. 네트워크를 확인해주세요.')),15000);pc.addEventListener('connectionstatechange',check);check();});}
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
    if(pc.connectionState==='closed'){finish(new Error('음성 연결이 취소됐어요.'));return;}
    const count=candidates();
    if(count&&(pc.iceGatheringState==='complete'||softExpired)){finish();return;}
    if(pc.iceGatheringState==='complete')finish(new Error('음성 연결 경로를 찾지 못했어요. 네트워크를 바꿔 다시 시도해주세요.'));
   };
   // A blocked STUN query may keep gathering alive long after host candidates
   // exist. Send the candidates we have, then verify the actual SFU connection.
   soft=setTimeout(()=>{softExpired=true;check();},1500);
   hard=setTimeout(()=>finish(candidates()?undefined:new Error('음성 연결 경로를 찾지 못했어요. Wi-Fi나 모바일 네트워크를 바꿔 다시 시도해주세요.')),10000);
   for(const event of ['icegatheringstatechange','icecandidate','connectionstatechange'])pc.addEventListener(event,check);
   check();
  });
 }
 setMicPhase(phase,started){
  if(started!==undefined)this.diagnostics?.record('mic'+this.micState[0].toUpperCase()+this.micState.slice(1)+'Ms',performance.now()-started);
  this.micState=phase;this.paint();return this.micPhaseStarted=performance.now();
 }
 async captureMicrophone(){
  if(this.stream?.getAudioTracks().some(t=>t.readyState==='live'))return this.stream;
  if(this.preparingMic)return this.preparingMic;
  const epoch=this.epoch,attempt=this.micAttempt;
  const promise=navigator.mediaDevices.getUserMedia({audio:this.microphoneConstraints(),video:false}).then(stream=>{
   if(this.closed||epoch!==this.epoch||attempt!==this.micAttempt){stream.getTracks().forEach(t=>t.stop());return null;}
   stream.getAudioTracks().forEach(t=>t.enabled=false);
   this.stream=stream;return stream;
  });
  this.preparingMic=promise;try{return await promise;}finally{if(this.preparingMic===promise)this.preparingMic=null;}
 }
 warmMicrophone(){
  const key=this.generation;if(this.warmSeat===key||this.micBusy||this.stream||!navigator.permissions?.query)return;
  this.warmSeat=key;const epoch=this.epoch,attempt=this.micAttempt;
  // Querying permission never prompts. Capture only after an existing grant, always disabled.
  void navigator.permissions.query({name:'microphone'}).then(async permission=>{
   const self=this.state?.members.find(p=>p.id===this.state.self);
   if(permission.state!=='granted'||this.closed||epoch!==this.epoch||attempt!==this.micAttempt||self?.seat==null||self.locked||this.micBusy)return;
   this.preparedPublisher ||= this.pc();await this.captureMicrophone();
  }).catch(()=>{/* A browser without permission queries uses the explicit mic button. */});
 }
 toggleMic(){
  const active=this.micDesired??(!!this.stream&&!this.state?.members.find(p=>p.id===this.state.self)?.muted);
  this.micDesired=!active;
  if(!this.micDesired)this.setCaptureEnabled(false);
  this.paint();
  if(this.micBusy)return;
  void this.safe(()=>this.micDesired?this.enableMic():this.mute());
 }
 setCaptureEnabled(enabled){
  for(const t of this.stream?.getAudioTracks()||[])t.enabled=enabled;
  if(this.micSender?.track)this.micSender.track.enabled=enabled;
 }
 syncMicIntent(){
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
 async enableMic(){
  if(this.micDesired===undefined)this.micDesired=true;
  if(this.micBusy)return;
  if(this.stream&&this.publisher?.connectionState==='connected')return this.syncMicIntent();
  this.stopMicTest?.();this.micClicked=performance.now();const self=this.state?.members?.find(p=>p.id===this.state.self);
  if(self&&(self.seat===null||self.locked))throw new Error('승인된 좌석에서 마이크를 켜주세요.');
  this.micBusy=true;
  // A pre-warmed capture belongs to the current attempt. Do not invalidate it when enabling.
  const attempt=this.micAttempt=this.micAttempt||1,epoch=this.epoch,generation=this.generation,stale=()=>this.closed||epoch!==this.epoch||attempt!==this.micAttempt;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('보안 연결(HTTPS)과 마이크를 지원하는 브라우저가 필요해요.');
   let stage=this.setMicPhase('permission');
   if(navigator.permissions?.query)try{this.microphonePermission=(await navigator.permissions.query({name:'microphone'})).state;}catch{this.microphonePermission='unsupported';}
   if(stale())return;
   stage=this.setMicPhase('capture',stage);const stream=await this.captureMicrophone();
   if(stale()||!stream)return;
   this.microphoneSettings=stream.getAudioTracks()[0].getSettings?.()||{};
   stage=this.setMicPhase('processing',stage);this.pendingStream=stream;
   const processing=await VoiceAudio.microphone(stream,this.preferences.preset,this.preferences.input,this.liveMode?liveVoiceMix(this):undefined);if(this.pendingStream===stream)this.pendingStream=null;
   processing.setReverb(this.preferences.reverb);if(stale()){processing.close();stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;this.processing=processing;
   const pc=this.publisher=this.preparedPublisher||this.pc();this.preparedPublisher=null;const track=processing.stream.getAudioTracks()[0];track.enabled=false;
   const transceiver=pc.addTransceiver(track,{direction:'sendonly'});this.micSender=transceiver.sender;
   this.watchProcessing();this.startLevels();
   track.onended=stream.getAudioTracks()[0].onended=()=>{if(!stale()){this.micDesired=false;this.micAttempt++;this.stopMicrophone();this.micState='failed';this.safe(async()=>{this.acceptState(await this.command('mute'));this.status('마이크 장치 연결이 끊겼어요. 장치를 확인한 뒤 다시 켜주세요.');});}};
   stage=this.setMicPhase('ice',stage);await pc.setLocalDescription(await pc.createOffer());await this.ice(pc);if(stale()){pc.close();return;}
   stage=this.setMicPhase('signaling',stage);
   const r=await voiceRequest(this.path('publish'),{generation,request_id:crypto.randomUUID(),mid:transceiver.mid,sessionDescription:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
   if(stale()){pc.close();return;}
   stage=this.setMicPhase('transport',stage);await pc.setRemoteDescription(r.sessionDescription);
   try{const parameters=transceiver.sender.getParameters();if(parameters.encodings?.length){parameters.encodings[0].maxBitrate=32000;await transceiver.sender.setParameters(parameters);}}catch{}
   await this.connected(pc);if(stale())return;
   // Register silent first. A rapid OFF during setup can never briefly publish audible audio.
   const state=await voiceRequest(this.path('published'),{generation,muted:true});if(stale())return;
   this.acceptState(state);this.micState='transport';this.setMicPhase('muted',stage);
   await this.syncMicIntent();if(stale())return;
   this.diagnostics?.record('micEnableMs',performance.now()-this.micClicked);this.status(this.micDesired?'마이크 송출 연결됨':'마이크 꺼짐 · 연결 유지');
   void Promise.allSettled([this.devices(),this.monitor()]);
  }catch(e){
   if(stale())return;
   this.diagnostics?.record('micFailedStageMs',performance.now()-this.micPhaseStarted);
   this.micDesired=false;this.stopMicrophone();this.micState='failed';
   // Block a new attempt until the old publisher reservation is retired.
   await voiceRequest(this.path('mute'),{generation}).catch(()=>{});if(stale())return;
   const messages={NotAllowedError:'마이크 권한을 브라우저 설정에서 허용해주세요.',NotFoundError:'사용 가능한 마이크가 없어요. 장치를 연결해주세요.',NotReadableError:'다른 앱의 마이크 사용을 종료하고 다시 시도해주세요.',OverconstrainedError:'선택한 마이크를 사용할 수 없어요. 기본 장치를 선택해주세요.'};
   throw new Error(messages[e.name]||e.message);
  }finally{if(attempt===this.micAttempt)this.micBusy=false;this.paint();}
 }

 async devices(){const devices=await navigator.mediaDevices.enumerateDevices();for(const [selector,kind,label] of [['#voice-input','audioinput','마이크'],['#voice-output','audiooutput','출력']]){const el=$(selector),selected=el.value;el.innerHTML='<option value="">기본 '+label+'</option>'+devices.filter(d=>d.kind===kind&&d.deviceId!=='default').map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||label+' '+(i+1))}</option>`).join('');el.value=selected;}$('#voice-output').disabled=!('setSinkId' in HTMLMediaElement.prototype);}
 async output(){const id=$('#voice-output').value;if(this.levelContext?.setSinkId)await this.levelContext.setSinkId(id);await Promise.all([...this.audios.values(),...(this.musicAudio?[this.musicAudio]:[])].map(a=>a.setSinkId?a.setSinkId(id):Promise.resolve()));}
 async monitor(){const ticket=this.monitorTicket=(this.monitorTicket||0)+1,old=this.monitorContext;this.monitorContext=null;if(old)await old.close().catch(()=>{});if(ticket!==this.monitorTicket||this.closed||!this.stream||!$('#voice-monitor').checked)return;const ctx=this.monitorContext=new AudioContext();await ctx.resume();if(ticket!==this.monitorTicket||this.closed||!this.stream||!$('#voice-monitor').checked){await ctx.close().catch(()=>{});return;}ctx.createMediaStreamSource(this.processing?.stream||this.stream).connect(ctx.destination);}
 stopMicrophone(){this.monitorTicket=(this.monitorTicket||0)+1;this.micSync=null;this.preparedPublisher?.close();this.preparedPublisher=null;this.preparingMic=null;this.pendingStream?.getTracks().forEach(t=>t.stop());this.pendingStream=null;if(this.micSender?.track)this.micSender.track.onended=null;this.processing?.close();this.processing=null;this.micSender=null;if(this.stream){this.stream.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;}this.publisher?.close();this.publisher=null;this.monitorContext?.close().catch(()=>{});this.monitorContext=null;}
 async mute(){this.micDesired=false;this.setCaptureEnabled(false);if(this.publisher?.connectionState==='connected'&&this.micSender?.track)return this.syncMicIntent();this.micState='muted';this.micAttempt=(this.micAttempt||0)+1;this.micBusy=false;this.stopMicrophone();const state=await this.command('mute');this.acceptState(state);this.paint();}
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
    const a=new Audio();a.autoplay=true;a.srcObject=new MediaStream([e.track]);a.volume=(this.volumes.get(id)??1)*this.preferences.voice;this.audios.set(id,a);this.applyListenVolumes();this.meterTrack(id,e.track);this.startLevels();
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
    try{await this.output();}catch{if(!stale())this.status('출력 장치를 확인해주세요. 소리 설정에서 기본 출력을 선택할 수 있어요.');}
   }else{pc.close();if(this.receiver===pc)this.receiver=null;}
  }).catch(e=>{if(stale()||version!==this.receiveVersion)return;this.receiveKey=null;this.status(e.message);if([401,403,404,409].includes(e.status))this.connectionError(e);else{clearTimeout(this.receiveRetry);this.receiveRetry=setTimeout(()=>{if(!stale())this.receive();},1500);}});
  return this.mediaQueue;
 }
 scheduleReconnect(){if(this.reconnectTimer||this.closed)return;this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;this.reconnect();},Math.min(30000,1000*2**Math.min(this.retries++,5)));}
 async reconnect(){if(this.closed||this.reconnecting)return;const reconnectStarted=performance.now();this.reconnecting=true;this.status('연결이 끊겼어요. 다시 연결하는 중…');try{await this.join();}catch(e){this.status(e.message);if([401,403,404,409].includes(e.status))this.leave(false);else this.scheduleReconnect();}finally{this.reconnecting=false;this.diagnostics?.record('reconnectMs',performance.now()-reconnectStarted);}}
 stopMedia(){this.micDesired=false;this.micState='disconnected';this.warmSeat=null;this.micAttempt=(this.micAttempt||0)+1;this.micBusy=false;this.pendingStream?.getTracks().forEach(t=>t.stop());this.pendingStream=null;this.stopMicrophone();this.clearRemoteMeters();this.receiver?.close();this.receiver=null;for(const a of this.audios.values())this.releaseRemote(a);this.audios.clear();this.receiveKey=null;}
 leave(send=true){if(this.closed)return;clearInterval(this.roomClock);this.roomDM?.destroy();this.roomTitleObserver?.disconnect();this.talkViewEvents?.abort();this.roomShareAbort?.abort();clearTimeout(this.roomShareTimer);this.releaseRoomExternal?.();const leaving=send&&this.joined?fetch('/api/voice/'+this.path('leave'),{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({generation:this.generation}),signal:AbortSignal.timeout(8000)}).catch(()=>{}):Promise.resolve();this.closed=true;this.talkGiftQueue.length=0;this.finishTalkGift();setVoiceFocus(false);this.joined=false;this.stopMicTest?.();this.diagnostics?.stop();clearInterval(this.levelTimer);clearInterval(this.musicTimer);clearTimeout(this.volumeTimer);clearTimeout(this.searchTimer);this.searchAbort?.abort();window.removeEventListener('resize',this.onViewport);clearTimeout(this.receiveRetry);clearTimeout(this.seatInviteTimer);this.musicAudio?.pause();if(this.musicAudio){this.musicAudio.removeAttribute('src');this.musicAudio.load();}this.levelContext?.close().catch(()=>{});this.levelContext=null;clearInterval(this.heartbeat);clearTimeout(this.socketRetry);clearTimeout(this.reconnectTimer);clearTimeout(this.animationTimer);this.ws?.close();this.stopMedia();if(this.host?.isConnected){$('#voice-content').hidden=true;$('#voice-entry').hidden=false;}window.removeEventListener('online',this.onOnline);window.removeEventListener('pagehide',this.onPageHide);document.removeEventListener('visibilitychange',this.onVisibility);window.visualViewport?.removeEventListener('resize',this.onViewport);return leaving;}
 animateGift(event){
  if(this.closed||!event.gift?.id||this.seenGifts.has(event.gift.id))return;
  this.seenGifts.add(event.gift.id);
  if(this.seenGifts.size>200)this.seenGifts.delete(this.seenGifts.values().next().value);
  if(!this.liveMode){
   const gift=AifectGifts.giftById(event.gift.type);
   if(gift){this.talkGiftQueue.push({event,imageURL:gift.image});this.playNextTalkGift();}
   return;
  }
  const el=$('#voice-gift-animation');if(!el)return;const g=AifectGifts.GIFT_CATALOG.find(g=>g.id===event.gift.type);el.innerHTML=(g?giftArt(g):icon('gift'))+`<strong>${esc(event.from)} → ${esc(event.to)}</strong><span>${esc(event.gift.name)} × ${number(event.gift.quantity)}</span>`;el.hidden=false;clearTimeout(this.animationTimer);this.animationTimer=setTimeout(()=>el.hidden=true,4500);
 }
 playNextTalkGift(){
  if(this.activeTalkGift||this.closed||!this.talkGiftQueue.length)return;
  const layer=this.host?.querySelector('.talk-gift-effect');
  if(!layer?.isConnected){this.talkGiftQueue.length=0;return;}
  const {event,imageURL}=this.talkGiftQueue.shift();
  const image=new Image();
  this.activeTalkGift={layer,image,targetId:event.gift.target_id};
  image.className='talk-gift-art';
  image.alt='';
  image.onerror=()=>this.finishTalkGift();
  image.onload=()=>{
   clearTimeout(this.animationTimer);
   if(!layer.isConnected){this.finishTalkGift();return;}
   layer.innerHTML=`<span class="talk-gift-caption">${talkGiftPeople(event.from,event.to)}</span>`;
   layer.prepend(image);
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
