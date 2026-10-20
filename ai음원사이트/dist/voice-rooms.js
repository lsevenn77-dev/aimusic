// Voice rooms deliberately do not share the recorder's media graph or MediaRecorder.
let voiceController=null;
function voiceChatMessageHTML(m){
 if(m.kind==='system')return `<article class="voice-chat-system"><p>${esc(m.body)}</p><time>${new Date(m.created).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</time></article>`;
 const time=`<time>${new Date(m.created).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</time>`;
 if(m.kind==='gift'){
  const gift=AifectGifts.giftById(m.gift?.type);
  return `<article class="voice-chat-gift"><header><b>${icon('gift')} 선물 알림</b>${time}</header><div class="voice-chat-gift-body">${gift?giftArt(gift):''}<p>${esc(m.body)}</p></div></article>`;
 }
 return `<article class="voice-chat-message"><span class="voice-chat-avatar">${avatarImage({name:m.name,profile_id:m.profile_id,image_version:m.image_version})}</span><div><header><b>${esc(m.name)}</b>${time}</header><p>${esc(m.body)}</p></div></article>`;
}
async function voiceRequest(path,body,method=body===undefined?'GET':'POST') {
 const r=await fetch('/api/voice/'+path,{method,credentials:'same-origin',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error||'토킹룸 연결에 실패했어요.'),{status:r.status});return data;
}
async function voiceView(base,id) {
 if(base!=='voice')return null;
 if(!me)return {html:heading('토킹룸','음악으로 만난 사람들과, 목소리로 더 가까이.')+'<a class="primary-button" href="#account">로그인하고 참여하기</a>'};
 if(id)return {html:voiceRoomHTML(id)};
 const status=await voiceRequest('status');
 if(!status.enabled)return {html:heading('토킹룸','음악으로 만난 사람들과, 목소리로 더 가까이.')+'<section class="voice-empty surface"><h2>토킹룸을 준비하고 있어요</h2><p>연결 준비가 끝나면 이곳에서 실시간으로 이야기할 수 있어요.</p><a class="small-button" href="#community">커뮤니티로 돌아가기</a></section>'};
 const data=await voiceRequest('rooms');
 return {html:heading('토킹룸','함께 듣고, 목소리로 이어지는 우리.')+`<section class="voice-lobby"><div class="voice-lobby-top"><span class="voice-live">TALKING ROOM</span><p>최대 30명 · 마이크 8석 · 청취자로 편하게 시작해요</p></div><details class="voice-create"><summary>+ 토킹룸 만들기</summary><form id="voice-create-form"><label>방 이름 <input name="title" maxlength="60" placeholder="오늘 듣고 싶은 음악 이야기" required></label><label>공개 범위 <select name="visibility"><option value="public">공개방</option><option value="private">초대받은 사람만</option><option value="crew">우리 크루만</option><option value="followers">팔로우만</option></select></label><label>크루 <select name="crew_id"><option value="">크루 선택</option>${data.crews.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><button class="primary-button">토킹룸 만들기</button></form></details><div class="voice-room-grid">${data.rooms.map(r=>`<a class="voice-room-card" href="#voice/${esc(r.id)}"><span>${icon('headphones')}</span><small>${r.visibility==='crew'?'크루 토킹룸':r.visibility==='private'?'비공개 토킹룸':r.visibility==='followers'?'팔로우 토킹룸':'공개 토킹룸'}</small><h2>${esc(r.title)}</h2><p>목소리로 함께하는 시간</p><b>청취자로 입장 ${icon('arrow')}</b></a>`).join('')||'<p class="voice-empty">아직 열린 방이 없어요. 첫 대화를 시작해보세요.</p>'}</div></section>`};
}
function cleanupVoiceRoute(base,id) {document.body.classList.toggle('voice-room-open',base==='voice'&&!!id);if(voiceController&&(!me||base!=='voice'||voiceController.id!==id)){const leaving=voiceController.leave();voiceController=null;return leaving;}}
function bindVoice(base,id) {
 if(base!=='voice')return;
 const create=$('#voice-create-form');if(create){const request_id=crypto.randomUUID();create.onsubmit=busyForm(create,async()=>{const b=Object.fromEntries(new FormData(create));const r=await voiceRequest('rooms',{...b,request_id});location.hash='#voice/'+r.room.id;});}
 const host=document.querySelector('[data-voice-room]');if(!host)return;
 if(!voiceController||voiceController.closed||voiceController.id!==id)voiceController=new VoiceRoomClient(id);
 voiceController.bind(host);
}
class VoiceRoomClient {
 constructor(id){this.id=id;this.preferences={music:1,voice:1,input:1,preset:'radio',noise:true,echo:true,reverb:0};this.meters=new Map();this.state=null;this.closed=false;this.joined=false;this.generation=null;this.audios=new Map();this.volumes=new Map();this.mediaQueue=Promise.resolve();this.receiveKey=null;this.retries=0;this.seenGifts=new Set();this.giftRequest=crypto.randomUUID();this.inviteRequest=crypto.randomUUID();this.onOnline=()=>this.reconnect();this.onPageHide=()=>{this.stopMedia();this.ws?.close();};window.addEventListener('pagehide',this.onPageHide);this.onVisibility=()=>{if(!document.hidden&&this.joined)this.refresh().catch(()=>this.reconnect());};window.addEventListener('online',this.onOnline);document.addEventListener('visibilitychange',this.onVisibility);}
 path(action){return `rooms/${this.id}/${action}`;}
 command(action,b={}){return voiceRequest(this.path(action),{...b,generation:this.generation});}
 status(message){const el=$('#voice-status');if(el)el.textContent=message;}
 async safe(fn){try{await fn();}catch(e){this.status(e.message);toast(e.message);}}
 bind(host){this.host=host;$('#voice-join').onclick=()=>{if(this.closed){voiceController=new VoiceRoomClient(this.id);voiceController.bind(host);}else this.safe(()=>this.join());};host.onpointerdown=()=>this.resumeSound();host.onclick=e=>{const b=e.target.closest('[data-voice]');if(b)this.safe(()=>this.action(b.dataset.voice,b.dataset.target));};
  this.bindFinalControls();const chat=$('#voice-chat-form');chat.onsubmit=busyForm(chat,async()=>{const body=chat.elements.body.value;this.chatPending=this.chatPending?.body===body?this.chatPending:{body,request_id:crypto.randomUUID()};await this.command('chat',this.chatPending);chat.reset();this.chatPending=null;await this.refresh();});
  const gift=$('#voice-gift-form');gift.onchange=()=>{this.giftRequest=crypto.randomUUID();this.giftSummary();};gift.onsubmit=busyForm(gift,async()=>{const b=Object.fromEntries(new FormData(gift));const r=await this.command('gifts',{...b,quantity:Number(b.quantity),request_id:this.giftRequest});$('#voice-gift-result').textContent=`선물을 보냈어요. 남은 ${number(r.balance)} G${r.animation_pending?' · 애니메이션 전달 대기':''}`;this.giftRequest=crypto.randomUUID();});
  const invite=$('#voice-invite-form');invite.onchange=()=>this.inviteRequest=crypto.randomUUID();invite.onsubmit=busyForm(invite,async()=>{await this.command('invite',{profile_id:invite.elements.profile_id.value,request_id:this.inviteRequest});toast('토킹룸 초대 DM을 보냈어요.');this.inviteRequest=crypto.randomUUID();});
  $('#voice-monitor').onchange=()=>this.safe(()=>this.monitor());$('#voice-input').onchange=()=>this.safe(()=>this.changeMicrophone());$('#voice-output').onchange=()=>this.safe(()=>this.output());
  this.bindAudioSettings();window.visualViewport?.removeEventListener('resize',this.onViewport);this.onViewport=()=>{if(this.host?.isConnected&&window.visualViewport)this.host.style.setProperty('--voice-viewport',window.visualViewport.height+'px');};window.visualViewport?.addEventListener('resize',this.onViewport);this.onViewport();this.giftSummary();if(this.state)this.paint();else if(!this.joinAttempted)this.safe(()=>this.join());
 }
 async join(){
  if(this.closed||this.joining)return;this.joining=true;this.joinAttempted=true;this.epoch=(this.epoch||0)+1;
  if(this.host?.isConnected)$('#voice-entry').hidden=true;
  try {
   this.status('토킹룸에 연결하는 중…');audio.pause();this.stopMedia();
   this.joinRequest=this.joinRequest||crypto.randomUUID();
   const started=Date.now(),s=await voiceRequest(this.path('join'),{request_id:this.joinRequest});this.joinRequest=null;if(s.serverNow)this.musicClock=s.serverNow-(started+Date.now())/2;
   if(this.closed){void voiceRequest(this.path('leave'),{generation:s.generation}).catch(()=>{});return;}
   this.generation=s.generation;this.state=s;if(typeof VoiceDiagnostics!=='undefined'&&!this.diagnostics)this.diagnostics=new VoiceDiagnostics(this);this.joined=true;this.retries=0;this.paint();this.socket();
   clearInterval(this.heartbeat);this.heartbeat=setInterval(()=>this.refresh().catch(e=>this.connectionError(e)),20000);
   this.status('실시간 연결됨 · 청취 중');await this.receive();
   void api('/api/dm').then(d=>{if(!this.closed&&$('#voice-contacts'))$('#voice-contacts').innerHTML='<option value="">친구 선택</option>'+d.conversations.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');}).catch(()=>{});
  }finally{this.joining=false;if(this.host?.isConnected&&!this.joined&&!this.closed)$('#voice-entry').hidden=false;}
 }
 connectionError(e){if([401,403,404,409].includes(e.status)){this.status(e.message);this.leave(false);return;}this.reconnect();}
 socket(){this.ws?.close();const u=new URL('/api/voice/'+this.path('socket'),location.href);u.searchParams.set('generation',this.generation);u.protocol=u.protocol==='https:'?'wss:':'ws:';const ws=this.ws=new WebSocket(u);ws.onmessage=e=>{try{const v=JSON.parse(e.data);if(v.type==='music'&&this.state){if(v.music?.revision>=(this.state.music?.revision??-1)){this.state.music=v.music;this.paintMusic();}return;}if(v.type==='gift')this.animateGift(v);this.refresh().catch(err=>this.connectionError(err));}catch{}};ws.onclose=e=>{if(!this.closed&&this.joined&&this.ws===ws){if([4000,4001].includes(e.code)){this.status('입장 정보가 바뀌었어요. 다시 입장해주세요.');this.leave(false);return;}clearTimeout(this.socketRetry);this.socketRetry=setTimeout(()=>{if(!this.closed)this.socket();},3000);}};}
 async refresh(){if(this.closed||!this.joined)return;if(this.refreshing){this.refreshAgain=true;return;}this.refreshing=true;const epoch=this.epoch;try{const started=Date.now(),state=await this.command('heartbeat');if(state.serverNow)this.musicClock=state.serverNow-(started+Date.now())/2;if(this.closed||epoch!==this.epoch)return;if(state.revision<(this.state?.revision??-1))return;if((state.music?.revision??-1)<(this.state?.music?.revision??-1))state.music=this.state.music;this.state=state;this.paint();await this.receive();}catch(e){if(!this.closed&&epoch===this.epoch)throw e;}finally{this.refreshing=false;if(this.refreshAgain){this.refreshAgain=false;void this.refresh().catch(e=>this.connectionError(e));}}}
 paint(){if(!this.host?.isConnected||!this.state)return;const s=this.state,self=s.members.find(p=>p.id===s.self);if(!self){this.leave(false);return;}$('#voice-entry').hidden=true;$('#voice-content').hidden=false;$('#voice-title').textContent=s.room.title;$('#voice-count').textContent=`전체 ${s.members.length}명 · 좌석 참여 ${s.members.filter(p=>p.seat!==null).length}명`;
  const person=p=>'<button class="voice-person" data-voice-person="'+esc(p.id)+'" data-level-user="'+esc(p.id)+'">'+avatarImage({name:p.name,profile_id:p.profile_id,image_version:p.image_version})+'<strong>'+esc(p.name)+'</strong><small>'+ (p.role==='host'?'방장':p.role==='admin'?'관리자':p.seat===null?'청취자':p.muted?'음소거':'마이크 켜짐')+'</small></button>';
  const seatHTML=Array.from({length:8},(_,i)=>{const p=s.members.find(p=>p.seat===i);return '<div class="voice-seat">'+(p?'<div class="voice-seat-occupant">'+(p.role==='host'?'<span class="voice-crown" aria-label="방장">'+voiceGlyph('crown')+'</span>':'')+person(p)+(p.role==='host'?'<small class="voice-host-label">방장</small>':'')+(p.id===self.id?'<button class="voice-seat-mic '+(this.stream&&!self.muted?'is-on':'')+'" data-voice="'+(this.stream&&!self.muted?'mute':'enable-mic')+'" aria-label="'+(this.stream&&!self.muted?'내 마이크 끄기':'내 마이크 켜기')+'">'+(this.stream&&!self.muted?icon('mic'):voiceGlyph('muted'))+'</button>':'<span class="voice-seat-mic '+(p.muted?'':'is-on')+'" aria-label="'+(p.muted?'음소거':'마이크 켜짐')+'">'+(p.muted?voiceGlyph('muted'):icon('mic'))+'</span>')+'</div>':'<button type="button" class="voice-seat-empty" data-voice="request-mic" data-target="'+i+'" aria-label="'+(i+1)+'번 좌석 참여 신청">'+voiceGlyph('plus')+'</button>')+'</div>';}).join('');
  if(this.seatHTML!==seatHTML){$('#voice-seats').innerHTML=seatHTML;this.seatHTML=seatHTML;}
  const listenerHTML=[...s.members].sort((a,b)=>(b.role==='host')-(a.role==='host')).map(p=>'<button class="voice-person" data-voice="participants" aria-label="'+esc(p.name)+' 참여자 목록">'+avatarImage({name:p.name,profile_id:p.profile_id,image_version:p.image_version})+'</button>').join('')+'<button class="voice-avatar-plus" data-voice="participants" aria-label="참여자 목록 열기">'+voiceGlyph('plus')+'</button>';
  if(this.listenerHTML!==listenerHTML){$('#voice-listeners').innerHTML=listenerHTML;this.listenerHTML=listenerHTML;}
  $('#voice-people-count').textContent=s.members.length;
  this.paintFinalControls();
  this.paintMusic();
  const manage=self.role==='host';$('#voice-requests').innerHTML=manage&&s.members.some(p=>p.requested)?'<h3>좌석 승인 대기 '+s.members.filter(p=>p.requested).length+'명</h3>'+s.members.filter(p=>p.requested).map(p=>`<p>${esc(p.name)} <button class="small-button" data-voice="approve-mic" data-target="${esc(p.id)}">승인</button> <button class="small-button" data-voice="reject-mic" data-target="${esc(p.id)}">거절</button></p>`).join(''):'';
  const close=this.host.querySelector('[data-voice="close"]');if(close)close.hidden=self.role!=='host';
  const cancel=this.host.querySelector('[data-voice="cancel-mic"]');if(cancel)cancel.hidden=!self.requested;
  for(const button of this.host.querySelectorAll('.voice-seat-empty'))button.disabled=self.role!=='host'&&(self.requested||self.locked||self.seat!==null);
  for(const button of this.host.querySelectorAll('.voice-seat-mic[data-voice]')){button.disabled=!!this.micBusy||self.locked;button.setAttribute('aria-busy',String(!!this.micBusy));}
  $('#voice-mic-note').textContent=self.requested?'좌석 참여 신청 중 · 방장 승인 대기':self.locked?'관리자가 마이크를 음소거했어요.':this.micBusy?'마이크 연결 중…':'';
  if(this.stream&&(self.locked||self.seat===null)){this.stopMicrophone();}
  const messages=[...s.chat,...(s.notices||[])].sort((a,b)=>a.sequence-b.sequence);const log=$('#voice-chat'),near=log.scrollHeight-log.scrollTop-log.clientHeight<60,last=messages.at(-1)?.id||'';if(log.dataset.last!==last){log.innerHTML=messages.map(m=>voiceChatMessageHTML(m).replace('class="voice-chat-message"','class="voice-chat-message'+(m.user_id===s.self?' is-self':'')+'"')).join('');log.dataset.last=last;if(near)log.scrollTop=log.scrollHeight;}
  const select=$('#voice-gift-target'),previous=select.value;select.innerHTML=s.members.filter(p=>p.id!==self.id&&p.profile_id).map(p=>`<option value="${esc(p.profile_id)}">${esc(p.name)}</option>`).join('');if([...select.options].some(o=>o.value===previous))select.value=previous;
 }
 showSheet(id){const sheet=$('#'+id);if(!sheet)return;const opening=!sheet.open;
  if(id==='voice-music-sheet'&&window.innerWidth>800){
   // A non-modal stage popover leaves the participant strip and chat interactive.
   const stage=this.host.querySelector('.voice-stage').getBoundingClientRect(),strip=$('#voice-listeners').getBoundingClientRect();
   const height=Math.min(610,Math.max(280,strip.top-stage.top-18));
   Object.assign(sheet.style,{inset:'auto',left:stage.left+'px',top:Math.max(stage.top,strip.top-height-12)+'px',width:Math.min(750,stage.width)+'px',maxHeight:height+'px',margin:'0'});
   if(!sheet.open)sheet.show();
  }else{if(id==='voice-music-sheet')sheet.removeAttribute('style');if(!sheet.open)sheet.showModal();}
  if(opening)sheet.scrollTop=0;
 }
 microphoneConstraints(){const supported=navigator.mediaDevices.getSupportedConstraints?.()||{},constraints={};for(const [key,value] of [['echoCancellation',this.preferences.echo],['noiseSuppression',this.preferences.noise],['autoGainControl',true]])if(supported[key]!==false)constraints[key]=value;if(supported.channelCount!==false)constraints.channelCount={ideal:1};const id=$('#voice-input').value;if(id)constraints.deviceId={ideal:id};return constraints;}
 watchProcessing(){const graph=this.processing,raw=this.stream,sender=this.micSender;if(!graph?.context||!raw||!sender)return;graph.context.onstatechange=()=>{if(this.closed||this.processing!==graph||this.micSender!==sender)return;const track=graph.context.state==='running'?graph.stream.getAudioTracks()[0]:raw.getAudioTracks()[0];track.enabled=sender.track?.enabled!==false;void sender.replaceTrack(track).catch(()=>this.status('마이크 장치 연결을 확인해주세요.'));};}
 async changeMicrophone(){
  if(!this.stream||!this.micSender)return;const epoch=this.epoch,attempt=this.micAttempt,sender=this.micSender;
  const raw=await navigator.mediaDevices.getUserMedia({audio:this.microphoneConstraints(),video:false});
  const graph=await VoiceAudio.microphone(raw,this.preferences.preset,this.preferences.input);graph.setReverb(this.preferences.reverb);
  if(this.closed||epoch!==this.epoch||attempt!==this.micAttempt||sender!==this.micSender){graph.close();raw.getTracks().forEach(t=>t.stop());return;}
  try{graph.stream.getAudioTracks()[0].enabled=sender.track?.enabled!==false;await sender.replaceTrack(graph.stream.getAudioTracks()[0]);}catch(e){graph.close();raw.getTracks().forEach(t=>t.stop());throw e;}
  const old=this.stream,oldGraph=this.processing;for(const track of old.getTracks())track.onended=null;if(oldGraph?.stream!==old)for(const track of oldGraph?.stream.getTracks()||[])track.onended=null;
  this.stream=raw;this.processing=graph;this.watchProcessing();raw.getAudioTracks()[0].onended=()=>{if(!this.closed&&this.stream===raw)this.safe(()=>this.mute());};graph.stream.getAudioTracks()[0].onended=raw.getAudioTracks()[0].onended;
  oldGraph?.close();old.getTracks().forEach(t=>t.stop());await this.monitor().catch(()=>{});
 }
 async roomUIAction(action,target){
  if(action==='settings'){await this.openSettings();return true;}const sheets={sound:'voice-sound',participants:'voice-members',gift:'voice-gift-sheet',share:'voice-invite-sheet'};
  if(sheets[action]){this.showSheet(sheets[action]);if(action==='sound'){this.resumeSound();void this.devices().catch(()=>{});}return true;}
  if(action==='dismiss'){for(const sheet of this.host.querySelectorAll('dialog[open]'))sheet.close();return true;}
  if(action==='copy-link'){await navigator.clipboard.writeText(location.origin+'/#voice/'+this.id);toast('초대 링크를 복사했어요.');return true;}
  if(action==='music-picker'){this.showSheet('voice-music-sheet');return true;}
  if(await this.finalAction(action,target))return true;
  if(action.startsWith('music-')){const operation=action.slice(6);await this.musicCommand(operation,operation==='remove'?{index:Number(target)}:operation==='up'?{index:Number(target),to:Number(target)-1}:{});return true;}
  return false;
 }
 bindAudioSettings(){
  for(const [id,key] of [['voice-music-volume','music'],['voice-listen-volume','voice'],['voice-input-gain','input']]){const el=$('#'+id);el.value=this.preferences[key]*100;el.setAttribute('aria-valuetext',Math.round(el.value)+'%');el.oninput=()=>{el.setAttribute('aria-valuetext',Math.round(el.value)+'%');this.preferences[key]=Number(el.value)/100;if(key==='music')this.syncPersonalVolume?.();this.processing?.setLevel(this.preferences.input);this.applyListenVolumes();this.syncMusic();};}
  const preset=$('#voice-preset');preset.value=this.preferences.preset;preset.onchange=()=>{this.preferences.preset=preset.value;this.preferences.reverb=preset.value==='studio'?.06:0;$('#voice-reverb').value=Math.round(this.preferences.reverb*100);try{this.processing?.setPreset(preset.value);this.processing?.setReverb(this.preferences.reverb);}catch{this.status('이 장치에서는 현재 음질을 유지해요.');}};
  for(const [id,operation] of [['voice-room-volume','volume'],['voice-balance','balance']]){const el=$('#'+id);el.oninput=()=>{clearTimeout(this.volumeTimer);el.setAttribute('aria-valuetext',Math.round(el.value)+'%');const value=Number(el.value)/100;this.volumeTimer=setTimeout(()=>this.safe(()=>this.musicCommand(operation,{value})),160);};}
  $('#voice-reverb').value=Math.round(this.preferences.reverb*100);$('#voice-reverb').oninput=()=>{this.preferences.reverb=Number($('#voice-reverb').value)/100;this.processing?.setReverb(this.preferences.reverb);};$('#voice-noise').checked=this.preferences.noise;$('#voice-noise').onchange=()=>{this.preferences.noise=$('#voice-noise').checked;this.safe(async()=>{const track=this.stream?.getAudioTracks()[0];if(track?.applyConstraints)await track.applyConstraints({noiseSuppression:this.preferences.noise});});};
  $('#voice-music-seek').onchange=()=>this.safe(()=>this.musicCommand('seek',{position:Number($('#voice-music-seek').value)}));
  $('#voice-music-search').onsubmit=e=>{e.preventDefault();this.safe(()=>this.searchMusic());};
  $('#voice-music-results').onclick=e=>{const b=e.target.closest('[data-music-track]');if(b)this.safe(async()=>{if(b.dataset.consent==='true'){const checkbox=b.closest('article').querySelector('input[type=checkbox]');if(!checkbox?.checked)throw Error('공동 감상 권리 확인에 동의해주세요.');await this.command('music-consent',{track_id:b.dataset.musicTrack,accept:true});}await this.musicCommand('enqueue',{track_id:b.dataset.musicTrack});await this.searchMusic();});};
  clearInterval(this.musicTimer);this.musicTimer=setInterval(()=>this.syncMusic(),1500);
 }
 async searchMusic(){
  if(!$('#voice-music-query').value.trim()){$('#voice-music-results').innerHTML='';$('#voice-results-heading').hidden=true;return;}
  const query=$('#voice-music-query').value,epoch=this.epoch,serial=this.searchSerial=(this.searchSerial||0)+1;
  const data=await voiceRequest(this.path('music-search')+'?generation='+encodeURIComponent(this.generation)+'&q='+encodeURIComponent(query));
  if(this.closed||epoch!==this.epoch||serial!==this.searchSerial)return;
  $('#voice-results-heading').hidden=false;$('#voice-search-count').textContent='검색 결과 '+data.tracks.length+'개';
  $('#voice-music-results').innerHTML=data.tracks.map(t=>'<article class="voice-music-result"><img alt="" src="'+esc(t.has_cover?'/media/'+t.id+'/cover':'/assets/voice-music-cover.svg')+'"><div><strong>'+esc(t.title)+'</strong><small>'+esc(t.artist||t.producer)+'</small></div>'+(!t.room_allowed?'<label class="voice-consent"><input type="checkbox">'+esc(data.consent)+'</label>':'')+'<time>'+time(t.duration)+'</time><button aria-label="'+esc(t.title)+' 추가" class="small-button" data-music-track="'+esc(t.id)+'" data-consent="'+!t.room_allowed+'">'+voiceGlyph('plus')+'</button></article>').join('')||'<p class="quiet">공동 감상이 허용된 곡이 없어요. 본인이 올린 원곡은 검색 후 권리를 확인하고 허용할 수 있어요.</p>';
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
  if(!track){a.pause();this.musicTrack=null;return;}
  const key=track.id+':'+this.generation;if(this.musicTrack!==key){this.musicTrack=key;this.musicNoticeText='';a.src='/api/voice/'+this.path('music-stream')+'?track_id='+encodeURIComponent(track.id)+'&generation='+encodeURIComponent(this.generation);a.load();}
  const seconds=Math.min(track.duration,Math.max(0,m.position+(m.playing?Math.max(0,Date.now()+(this.musicClock||0)-m.updated)/1000:0)));
  if(a.readyState>=1){const drift=seconds-a.currentTime;if(Math.abs(drift)>.75||(!m.playing&&Math.abs(drift)>.02))a.currentTime=seconds;a.playbackRate=1;}
  if(typeof $==='function'){const elapsed=$('#voice-music-time');if(elapsed)elapsed.textContent=this.musicNoticeText||((m.playing?'':'Ⅱ ')+time(seconds)+' / '+time(track.duration));const seek=$('#voice-music-seek');if(seek&&!seek.matches?.(':active'))seek.value=seconds;}
  if(m.playing&&typeof audio!=='undefined'&&!audio.paused)audio.pause();
  if(!m.playing)a.pause();else if(a.paused&&!a.ended)a.play().catch(()=>{this.musicNotice('소리 켜기를 눌러주세요');const b=this.host?.querySelector('[data-voice="resume-audio"]');if(b)b.hidden=false;});
 }
 musicNotice(text){this.musicNoticeText=text;const el=typeof $==='function'?$('#voice-music-time'):null;if(el)el.textContent=text;}
 resumeSound(){try{const Context=window.AudioContext||window.webkitAudioContext;if(Context&&!this.levelContext)this.levelContext=new Context({latencyHint:'interactive'});void this.levelContext?.resume().then(()=>{this.applyListenVolumes();this.syncMusic();}).catch(()=>{});}catch{}void this.processing?.context?.resume().catch(()=>{});this.syncMusic();}
 playbackGain(element,volume){
  const ctx=this.levelContext;
  // A gain node also supports mobile browsers that ignore HTMLAudio.volume.
  // Create it only on a running, user-unlocked context; otherwise retain native audio.
  if(ctx?.state==='running'&&!element.voiceGain)try{const gain=ctx.createGain(),source=ctx.createMediaElementSource(element);source.connect(gain);gain.connect(ctx.destination);element.voiceGain=gain;}catch{}
  if(element.voiceGain){element.volume=1;element.voiceGain.gain.setTargetAtTime(volume,ctx.currentTime,.02);}else element.volume=volume;
 }
 applyListenVolumes(){for(const [id,a] of this.audios)this.playbackGain(a,Math.max(0,Math.min(1,(this.volumes.get(id)??1)*this.preferences.voice)));}
 meterTrack(id,track){try{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;const ctx=this.levelContext||(this.levelContext=new Context({latencyHint:'interactive'})),source=ctx.createMediaStreamSource(new MediaStream([track])),analyser=ctx.createAnalyser();analyser.fftSize=256;source.connect(analyser);this.meters.set(id,{source,analyser});}catch{/* Playback stays independent of metering. */}}
 clearRemoteMeters(){for(const m of this.meters.values())m.source.disconnect();this.meters.clear();}
 startLevels(){if(this.levelTimer)return;this.levelTimer=setInterval(()=>{if(this.closed)return;const levels=new Map();try{if(this.processing?.analyser&&!this.state.members.find(p=>p.id===this.state.self)?.muted)levels.set(this.state.self,VoiceAudio.rms(this.processing.analyser));if(this.testGraph?.analyser){const meter=$('#voice-input-meter');if(meter)meter.value=VoiceAudio.rms(this.testGraph.analyser);}for(const [id,m] of this.meters)levels.set(id,VoiceAudio.rms(m.analyser));}catch{}for(const el of this.host?.querySelectorAll('[data-level-user]')||[]){const member=this.state.members.find(p=>p.id===el.dataset.levelUser),level=member&&!member.muted?levels.get(el.dataset.levelUser)||0:0;el.style.setProperty('--voice-level',level.toFixed(3));el.classList.toggle('is-speaking',level>.04);}},100);}
 giftSummary(){const form=$('#voice-gift-form');if(!form)return;const g=AifectGifts.GIFT_CATALOG.find(g=>g.id===form.elements.gift_type.value);$('#voice-gift-summary').textContent=`총 ${number((g?.gold||0)*Number(form.elements.quantity.value))} G · 보낸 선물은 취소할 수 없어요.`;}
 async action(action,target){if(await this.roomUIAction(action,target))return;if(action==='leave'){await this.leave();location.hash='#voice';return;}if(action==='close'){await this.command('close');this.leave(false);location.hash='#voice';return;}if(action==='enable-mic')return this.enableMic();if(action==='mute')return this.mute();if(action==='resume-audio'){this.resumeSound();if(this.musicAudio)await this.musicAudio.play();await Promise.all([...this.audios.values()].map(a=>a.play()));this.host.querySelector('[data-voice="resume-audio"]').hidden=true;return;}if(action==='request-mic'&&this.state.members.find(p=>p.id===this.state.self)?.role==='host'){this.openSeatPicker(Number(target));return;}if(action==='release-mic')this.stopMicrophone();if(['mute-user','unlock','kick','ban','admin','revoke-admin'].includes(action))await this.command('moderate',{target_id:target,operation:action==='mute-user'?'mute':action});else {const self=this.state.members.find(p=>p.id===this.state.self);if(action==='request-mic'&&['host','admin'].includes(self.role))await this.command('approve-mic',{target_id:self.id,seat:Number(target)});else await this.command(action,{target_id:target,...(action==='request-mic'&&target!==undefined?{seat:Number(target)}:{})});}await this.refresh();}
 pc(){const p=new RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}],bundlePolicy:'max-bundle'});p.onconnectionstatechange=()=>{
  if(p.connectionState!=='failed'||this.closed)return;
  if(this.publisher===p){this.reconnect();return;}
  // A failed listening transport must not tear down the user's live microphone.
  if(this.receiver===p){const epoch=this.epoch;this.receiveKey=null;clearTimeout(this.receiveRetry);this.receiveRetry=setTimeout(()=>{if(!this.closed&&epoch===this.epoch&&this.receiver===p)this.receive();},500);}
 };return p;}
 async connected(pc){if(pc.connectionState==='connected')return;await new Promise((resolve,reject)=>{const finish=error=>{clearTimeout(timer);pc.removeEventListener('connectionstatechange',check);error?reject(error):resolve();},check=()=>{if(pc.connectionState==='connected')finish();else if(['failed','closed'].includes(pc.connectionState))finish(new Error('음성 연결을 다시 시작해주세요.'));},timer=setTimeout(()=>finish(new Error('음성 연결 시간이 초과됐어요. 네트워크를 확인해주세요.')),15000);pc.addEventListener('connectionstatechange',check);check();});}
 async ice(pc){if(pc.iceGatheringState==='complete')return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',check);reject(new Error('네트워크 연결 준비가 지연돼요. 다시 시도해주세요.'));},10000);const check=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();}};pc.addEventListener('icegatheringstatechange',check);check();});}
 async enableMic(){
  if(this.micBusy)return;if(this.stream&&this.publisher?.connectionState==='connected'){await this.command('self-mute',{muted:false});for(const track of this.stream.getAudioTracks())track.enabled=true;this.micSender.track.enabled=true;await this.refresh();return;}this.stopMicTest?.();this.micClicked=performance.now();const self=this.state?.members?.find(p=>p.id===this.state.self);if(self&&(self.seat===null||self.locked))throw new Error('승인된 좌석에서 마이크를 켜주세요.');this.micBusy=true;const attempt=this.micAttempt=(this.micAttempt||0)+1,epoch=this.epoch,generation=this.generation,stale=()=>this.closed||epoch!==this.epoch||attempt!==this.micAttempt;
  try {
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('보안 연결(HTTPS)과 마이크를 지원하는 브라우저가 필요해요.');
   this.micState='requesting-permission';this.status('마이크 권한을 확인하는 중…');this.paint();const stream=await navigator.mediaDevices.getUserMedia({audio:this.microphoneConstraints(),video:false});
   if(stale()){stream.getTracks().forEach(t=>t.stop());return;}
   this.microphoneSettings=stream.getAudioTracks()[0].getSettings?.()||{};this.micState='connecting';this.status('마이크 송출을 연결하는 중…');this.pendingStream=stream;const processing=await VoiceAudio.microphone(stream,this.preferences.preset,this.preferences.input);if(this.pendingStream===stream)this.pendingStream=null;processing.setReverb(this.preferences.reverb);if(stale()){processing.close();stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;this.processing=processing;const pc=this.publisher=this.pc(),track=this.processing.stream.getAudioTracks()[0],transceiver=pc.addTransceiver(track,{direction:'sendonly'});this.micSender=transceiver.sender;this.watchProcessing();this.startLevels();if(this.processing.fallback)this.status('음향 효과를 지원하지 않아 원음으로 연결해요.');
   track.onended=stream.getAudioTracks()[0].onended=()=>{if(!stale())this.safe(()=>this.mute());};await pc.setLocalDescription(await pc.createOffer());await this.ice(pc);
   if(stale()){pc.close();return;}
   const r=await voiceRequest(this.path('publish'),{generation,request_id:crypto.randomUUID(),mid:transceiver.mid,sessionDescription:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
   if(stale()){pc.close();return;}
   await pc.setRemoteDescription(r.sessionDescription);try{const parameters=transceiver.sender.getParameters();if(parameters.encodings?.length){parameters.encodings[0].maxBitrate=32000;await transceiver.sender.setParameters(parameters);}}catch{/* Keep the established microphone on browsers without sender bitrate control. */}await this.connected(pc);if(stale())return;await voiceRequest(this.path('published'),{generation});await this.devices().catch(()=>{});await this.monitor().catch(()=>{});await this.refresh();this.micState='on';this.diagnostics?.record('micEnableMs',performance.now()-this.micClicked);this.status('마이크 송출 연결됨');
  }catch(e){if(stale())return;this.stopMicrophone();await voiceRequest(this.path('mute'),{generation}).catch(()=>{});if(stale())return;this.micState='idle';const messages={NotAllowedError:'마이크 권한을 브라우저 설정에서 허용해주세요.',NotFoundError:'사용 가능한 마이크가 없어요. 장치를 연결해주세요.',NotReadableError:'다른 앱의 마이크 사용을 종료하고 다시 시도해주세요.',OverconstrainedError:'선택한 마이크를 사용할 수 없어요. 기본 장치를 선택해주세요.'};throw new Error(messages[e.name]||e.message);}
  finally{if(attempt===this.micAttempt)this.micBusy=false;this.paint();}
 }
 async devices(){const devices=await navigator.mediaDevices.enumerateDevices();for(const [selector,kind,label] of [['#voice-input','audioinput','마이크'],['#voice-output','audiooutput','출력']]){const el=$(selector),selected=el.value;el.innerHTML='<option value="">기본 '+label+'</option>'+devices.filter(d=>d.kind===kind&&d.deviceId!=='default').map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||label+' '+(i+1))}</option>`).join('');el.value=selected;}$('#voice-output').disabled=!('setSinkId' in HTMLMediaElement.prototype);}
 async output(){const id=$('#voice-output').value;if(this.levelContext?.setSinkId)await this.levelContext.setSinkId(id);await Promise.all([...this.audios.values(),...(this.musicAudio?[this.musicAudio]:[])].map(a=>a.setSinkId?a.setSinkId(id):Promise.resolve()));}
 async monitor(){if(this.monitorContext){await this.monitorContext.close();this.monitorContext=null;}if(!this.stream||!$('#voice-monitor').checked)return;const ctx=this.monitorContext=new AudioContext();await ctx.resume();ctx.createMediaStreamSource(this.processing?.stream||this.stream).connect(ctx.destination);}
 stopMicrophone(){this.pendingStream?.getTracks().forEach(t=>t.stop());this.pendingStream=null;if(this.micSender?.track)this.micSender.track.onended=null;this.processing?.close();this.processing=null;this.micSender=null;if(this.stream){this.stream.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;}this.publisher?.close();this.publisher=null;this.monitorContext?.close().catch(()=>{});this.monitorContext=null;}
 async mute(){if(this.publisher?.connectionState==='connected'&&this.micSender?.track){this.micSender.track.enabled=false;await this.command('self-mute',{muted:true});await this.refresh();return;}this.micState='muted';++this.micAttempt;this.micBusy=false;this.stopMicrophone();await this.command('mute');await this.refresh();this.status('마이크가 꺼졌어요. 다른 사람의 목소리는 계속 들을 수 있어요.');}
 receive(){
  const members=this.state?.members||[],key=members.filter(p=>p.id!==this.state?.self&&p.publishing).map(p=>p.id+':'+p.mediaKey).sort().join('|');
  if(key===this.receiveKey||this.closed)return this.mediaQueue;this.receiveKey=key;const version=this.receiveVersion=(this.receiveVersion||0)+1;
  const epoch=this.epoch,generation=this.generation,stale=()=>this.closed||epoch!==this.epoch;
  this.mediaQueue=this.mediaQueue.catch(()=>{}).then(async()=>{
   await new Promise(resolve=>setTimeout(resolve,100));if(stale()||version!==this.receiveVersion)return;this.receiver?.close();for(const a of this.audios.values()){a.pause();a.voiceGain?.disconnect();a.voiceGain=null;a.srcObject=null;}this.audios.clear();this.clearRemoteMeters();
   const pc=this.receiver=this.pc();let mapping=[];
   pc.ontrack=e=>{
    if(stale()||this.receiver!==pc)return;const id=mapping.find(t=>t.mid===e.transceiver.mid)?.user_id;if(!id)return;
    const previous=this.audios.get(id);if(previous){previous.pause();previous.voiceGain?.disconnect();previous.srcObject=null;}this.meters.get(id)?.source.disconnect();
    const a=new Audio();a.autoplay=true;a.srcObject=new MediaStream([e.track]);a.volume=(this.volumes.get(id)??1)*this.preferences.voice;this.audios.set(id,a);this.applyListenVolumes();this.meterTrack(id,e.track);this.startLevels();
    if('jitterBufferTarget' in e.receiver)try{e.receiver.jitterBufferTarget=100;}catch{}
    a.play().catch(()=>{const b=this.host?.querySelector('[data-voice="resume-audio"]');if(b)b.hidden=false;});
   };
   const r=await voiceRequest(this.path('subscribe'),{generation});if(stale()){pc.close();return;}mapping=r.tracks||[];
   if(r.sessionDescription){await pc.setRemoteDescription(r.sessionDescription);await pc.setLocalDescription(await pc.createAnswer());await this.ice(pc);if(stale()){pc.close();return;}await voiceRequest(this.path('answer'),{generation,negotiation:r.negotiation,sessionDescription:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});if(!stale())await this.output();}
  }).catch(e=>{if(stale())return;this.receiveKey=null;this.status(e.message);if([401,403,404,409].includes(e.status))this.connectionError(e);else{clearTimeout(this.receiveRetry);this.receiveRetry=setTimeout(()=>{if(!stale())this.receive();},1500);}});
  return this.mediaQueue;
 }
 scheduleReconnect(){if(this.reconnectTimer||this.closed)return;this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;this.reconnect();},Math.min(30000,1000*2**Math.min(this.retries++,5)));}
 async reconnect(){if(this.closed||this.reconnecting)return;const reconnectStarted=performance.now();this.reconnecting=true;this.status('연결이 끊겼어요. 다시 연결하는 중…');try{await this.join();}catch(e){this.status(e.message);if([401,403,404,409].includes(e.status))this.leave(false);else this.scheduleReconnect();}finally{this.reconnecting=false;this.diagnostics?.record('reconnectMs',performance.now()-reconnectStarted);}}
 stopMedia(){this.micAttempt=(this.micAttempt||0)+1;this.micBusy=false;this.pendingStream?.getTracks().forEach(t=>t.stop());this.pendingStream=null;this.stopMicrophone();this.clearRemoteMeters();this.receiver?.close();this.receiver=null;for(const a of this.audios.values()){a.pause();a.srcObject=null;}this.audios.clear();this.receiveKey=null;}
 leave(send=true){if(this.closed)return;const leaving=send&&this.joined?fetch('/api/voice/'+this.path('leave'),{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({generation:this.generation}),signal:AbortSignal.timeout(8000)}).catch(()=>{}):Promise.resolve();this.closed=true;this.joined=false;this.stopMicTest?.();this.diagnostics?.stop();clearInterval(this.levelTimer);clearInterval(this.musicTimer);clearTimeout(this.volumeTimer);clearTimeout(this.receiveRetry);clearTimeout(this.seatInviteTimer);this.musicAudio?.pause();if(this.musicAudio){this.musicAudio.removeAttribute('src');this.musicAudio.load();}this.levelContext?.close().catch(()=>{});this.levelContext=null;clearInterval(this.heartbeat);clearTimeout(this.socketRetry);clearTimeout(this.reconnectTimer);clearTimeout(this.animationTimer);this.ws?.close();this.stopMedia();if(this.host?.isConnected){$('#voice-content').hidden=true;$('#voice-entry').hidden=false;}window.removeEventListener('online',this.onOnline);window.removeEventListener('pagehide',this.onPageHide);document.removeEventListener('visibilitychange',this.onVisibility);window.visualViewport?.removeEventListener('resize',this.onViewport);return leaving;}
 animateGift(event){if(this.seenGifts.has(event.gift.id))return;this.seenGifts.add(event.gift.id);if(this.seenGifts.size>200)this.seenGifts.delete(this.seenGifts.values().next().value);const el=$('#voice-gift-animation');if(!el)return;const g=AifectGifts.GIFT_CATALOG.find(g=>g.id===event.gift.type);el.innerHTML=(g?giftArt(g):icon('gift'))+`<strong>${esc(event.from)} → ${esc(event.to)}</strong><span>${esc(event.gift.name)} × ${number(event.gift.quantity)}</span>`;el.hidden=false;clearTimeout(this.animationTimer);this.animationTimer=setTimeout(()=>el.hidden=true,4500);}
}
