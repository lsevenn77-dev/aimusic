// One singer at a time. Reuses the authenticated voice room, SFU and karaoke MR catalogue.
// The final current lobby renderer is reused, including room art and form fields.
const productionVoiceLobbyHTML=voiceLobbyHTML;
voiceLobbyHTML=function(data,enabled){return productionVoiceLobbyHTML({...data,rooms:(data.rooms||[]).filter(r=>r.mode!=='karaoke')},enabled);};
function liveKaraokeLobbyHTML(data,enabled=true){
 let html=productionVoiceLobbyHTML({...data,rooms:(data.rooms||[]).filter(r=>r.mode==='karaoke')},enabled,false);
 if(!me&&enabled)html=html.replace('id="v3-create-room" ','id="v3-create-room" disabled ');
 return html.replace('class="community-v3"','class="community-v3 live-lobby"')
  .replace('지금 열려 있는 토킹룸','라이브 노래방')
  .replace('공개된 방만 보여줘 · 방장 승인 후 마이크에 참여할 수 있어','한 명씩 노래하고 함께 응원해요 · 최대 30명')
  .replaceAll('href="#voice/','href="#live/')
  .replaceAll('함께 듣는 중','청취자로 입장')
  .replace('아직 열린 공개 토킹룸이 없어요.','아직 열린 노래방이 없어요.')
  .replace('토킹룸 서비스 연결을 준비하고 있어요.','라이브 노래방 연결을 준비하고 있어요.')
  .replace('id="v3-create-title">방 만들기','id="v3-create-title">라이브 노래방 만들기')
  +(me?'':'<p class="quiet live-login"><a class="text-link" href="#account">로그인하면 노래방을 만들거나 참여할 수 있어요.</a></p>');
}
function liveVoiceMix(c){
 if(!c.liveVocalMix)c.liveVocalMix=typeof AifectKaraoke!=='undefined'?AifectKaraoke.defaultVocalMix():{echo:0,room:0,size:.5,tone:0,noise:2};
 return c.liveVocalMix;
}
function liveVocalSettingsHTML(){
 const effects=[['room','리버브',0,100],['echo','에코',0,65],['size','룸 크기',0,100],['tone','음색',-100,200]];
 return `<div class="live-vocal-settings"><section class="live-sound-card"><h3>음량</h3><label for="voice-input-gain">내 목소리 <output data-value-for="voice-input-gain">100%</output></label><div id="live-voice-volume-slot"></div><label for="live-mr-volume">음원 <output data-value-for="live-mr-volume">75%</output></label><div id="live-music-volume-slot"></div></section><section class="live-sound-card"><h3>공간 효과</h3>${effects.map(([key,label,min,max])=>`<label for="live-fx-${key}">${label}<output data-value-for="live-fx-${key}"></output></label><input id="live-fx-${key}" data-live-fx="${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="1" value="0">`).join('')}<p id="live-effect-status" role="status" hidden></p></section></div>`;
}
function bindLiveVocalSettings(c){
 const sound=c.host.querySelector('#voice-sound'),mix=liveVoiceMix(c);
 sound.querySelector('#live-voice-volume-slot').append(c.host.querySelector('#voice-input-gain'));
 sound.querySelector('#live-music-volume-slot').append(c.host.querySelector('#live-mr-volume'));
 const advanced=sound.querySelector('.voice-audio-extra');
 advanced.querySelector('summary').textContent='장치 · 고급 설정';
 advanced.append(c.host.querySelector('#live-delay').closest('label'));
 advanced.append(sound.querySelector('.voice-mic-test'));
 sound.querySelector('.voice-sheet-heading p').textContent='내 목소리와 음원, 공간 효과를 조절하세요.';
 for(const input of sound.querySelectorAll('[data-live-fx]')){
  input.value=Math.round(mix[input.dataset.liveFx]*100);c.updateDesignField(input);
  input.oninput=()=>{
   c.liveVocalMix={...liveVoiceMix(c),preset:'custom',[input.dataset.liveFx]:Number(input.value)/100};
   c.processing?.setMix?.(c.liveVocalMix);
   if(c.testGraph!==c.processing)c.testGraph?.setMix?.(c.liveVocalMix);
   c.updateDesignField(input);
  };
 }
}
function liveEffectAvailability(c){
 const supported=!c.processing||c.processing.supportsMix!==false;
 for(const input of c.host.querySelectorAll('[data-live-fx]'))input.disabled=!supported;
 const note=c.host.querySelector('#live-effect-status');
 if(note){note.hidden=supported;note.textContent=supported?'':'이 브라우저에서 공간 효과를 연결하지 못했어요. 현재 원음으로 전달 중이에요.';}
}
function liveKaraokeRoomHTML(id){
 const stage=`<div id="live-karaoke-stage"><section class="live-stage-main">
  <div class="live-stage-top"><div class="live-room-caption"><span>LIVE KARAOKE</span><strong id="live-room-name"></strong></div><span id="live-phase" role="status">가창자 기다리는 중</span></div>
  <div id="live-current" class="live-current"><span>${icon('mic')}</span><strong>다음 가창자를 기다리는 중</strong></div>
  <p id="live-song" class="live-song"></p>
  <div id="live-lyrics" class="live-lyrics" aria-live="off"><p>노래가 시작되면 가사가 여기에 나와요.</p></div>
  <div id="live-next-card" class="live-next-card" hidden></div>
  <div class="live-song-progress"><span id="live-timer">0:00 / 0:00</span><progress id="live-progress" max="100" value="0" aria-label="곡 진행률"></progress></div>
  <div id="live-actions" class="live-actions"></div>
  <p id="live-invite" class="live-invite" role="status" hidden></p>
  <button class="small-button live-audio-unlock" id="live-audio-unlock" type="button" data-voice="karaoke-resume" hidden>소리 켜기</button>
  <p class="live-stage-note" id="live-stage-note">이어폰을 사용하면 반주가 마이크에 섞이지 않아요.</p>
  <div class="live-sound-toolbar" role="group" aria-label="소리와 모니터링">
   <button type="button" class="small-button" id="live-monitor-toggle" data-voice="karaoke-monitor" aria-pressed="false" disabled title="내 노래 차례에 모니터링을 켤 수 있어요.">${icon('headphones')}<span>내 목소리 듣기 꺼짐</span></button>
   <button type="button" class="small-button" data-voice="sound" aria-label="소리 설정">${icon('sliders')}<span>소리 설정</span></button>
  </div>
 </section>
 <section class="live-request-area" aria-label="노래 신청과 예약 순서"><button type="button" class="live-request-button" data-voice="karaoke-search-open">${icon('mic')}<span><strong>노래 신청하기</strong><small id="live-queue-count">0명 대기</small></span></button><ol id="live-queue" class="live-queue" tabindex="0" aria-label="예약 순서, 좌우로 스크롤"></ol></section>
 </div>`;
 const search=`<dialog id="live-search-sheet" class="voice-sheet" aria-labelledby="live-search-title"><button type="button" class="voice-dialog-close" data-voice="dismiss" aria-label="닫기">×</button><h2 id="live-search-title">부를 노래 찾기</h2><form id="live-search" class="live-search" role="search"><label for="live-query">곡명 또는 아티스트</label><div><input id="live-query" type="search" maxlength="80" placeholder="곡명 또는 아티스트 검색" required><button type="submit" class="small-button">${icon('search')} 검색</button></div></form><div id="live-results" class="live-results" aria-live="polite"></div></dialog>`;
 const audio=`<div class="live-audio-settings"><label>내 반주 음량 <input id="live-mr-volume" type="range" min="0" max="100" value="75"></label><label>청취 싱크 보정 <input id="live-delay" type="range" min="0" max="500" step="50" value="200"><output id="live-delay-value">200ms</output></label></div>`;
 return voiceRoomHTML(id,false).replace(/<button\b[^>]*data-voice="sound"[^>]*>[\s\S]*?<\/button>/,'')
  .replace('class="voice-room"','class="voice-room live-karaoke-room"')
  .replace('href="#voice">← 토킹룸','href="#live">〈 라이브 노래방')
  .replace('좌석을 눌러 참여 신청해보세요.','신청 순서대로 한 명씩 노래해요.')
  .replace('id="voice-title">토킹룸','id="voice-title">라이브 노래방')
  .replace('토킹룸 종료','노래방 종료')
  .replace('<p id="voice-sound-current"',liveVocalSettingsHTML()+'<p id="voice-sound-current"')
  .replace('<div id="voice-seats" class="voice-seats"></div>',stage+'<div id="voice-seats" class="voice-seats"></div>')
  .replace('<dialog id="voice-members"',search+'<dialog id="voice-members"')
  .replace('<section id="voice-host-audio"',audio+'<section id="voice-host-audio"');
}
function bindLiveKaraokeLobby(){
 bindVoiceLobby();
 const form=document.querySelector('#voice-create-form');if(!form)return;
 const request_id=crypto.randomUUID();
 form.onsubmit=busyForm(form,async()=>{
  if(!me){location.hash='#account';return;}
  prepareVoiceListening();
  const b=Object.fromEntries(new FormData(form));
  const result=await voiceRequest('rooms',{...b,max_members:Number(b.max_members),mode:'karaoke',request_id});
  location.hash='#live/'+result.room.id;
 });
}
function prepareLiveEntryClick(e){
 if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||!me)return;
 const link=e.target.closest?.('a[href]');if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
 const url=new URL(link.href,location.href),match=url.hash.match(/^#live\/([^/?#]+)$/);
 if(match&&url.origin===location.origin&&url.pathname===location.pathname&&url.search===location.search)prepareVoiceListening(match[1]);
}
document.addEventListener('click',prepareLiveEntryClick);
function liveNow(c){return Date.now()+(c.musicClock||0);}
function liveStopAudio(c){
 c.liveAbort?.abort();c.liveAbort=null;
 if(c.liveAudio){c.liveAudio.pause();c.liveAudio.removeAttribute('src');c.liveAudio.load();c.liveAudio=null;}
 c.liveToken=(c.liveToken||0)+1;c.liveWords=null;c.liveTrack=null;c.liveLyricHTML=null;
}
function livePrepareTrack(c,active){
 if(c.liveTrack===active.track.id)return;
 liveStopAudio(c);c.liveTrack=active.track.id;c.liveError='';c.livePlayBlocked=false;c.livePlayPending=false;
 const token=c.liveToken=(c.liveToken||0)+1,controller=new AbortController();c.liveAbort=controller;
 fetch('/api/karaoke/'+encodeURIComponent(active.track.id),{credentials:'same-origin',signal:controller.signal})
  .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'반주를 불러오지 못했어요.');return d;})
  .then(d=>{
   if(c.closed||c.liveToken!==token||c.liveTrack!==active.track.id)return;
   c.liveWords=Array.isArray(d.words)?d.words:[];
   if(!d.mr||!c.liveWords.length)throw Error('반주와 시간 가사가 준비되지 않았어요.');
   const a=new Audio(d.mr);a.preload='auto';a.volume=c.liveVolume??.75;
   a.onended=()=>{const k=c.state?.karaoke;if(k?.active?.user_id===c.state.self&&k.phase==='singing')c.safe(()=>liveKaraokeAction(c,'karaoke-finish'));};
   a.onerror=()=>{if(c.liveAudio===a){c.liveError='반주를 재생할 수 없어요. 네트워크와 곡 상태를 확인해주세요.';paintLiveKaraoke(c);}};
   a.oncanplay=()=>{if(c.liveAudio===a)paintLiveKaraoke(c);};
   c.liveAudio=a;a.load();liveSync(c);
  })
  .catch(e=>{if(!controller.signal.aborted&&!c.closed&&c.liveToken===token){c.liveError=e.message;paintLiveKaraoke(c);}});
}
function liveTrackReady(c){return !!c.liveAudio&&c.liveAudio.readyState>=2&&!!c.liveWords?.length&&!c.liveError;}
function isLiveSingerTurn(c){
 const {karaoke,self}=c.state||{};
 return !!self&&karaoke?.active?.user_id===self&&['ready','singing'].includes(karaoke.phase);
}
function disconnectLiveMonitor(c){
 const tap=c.liveMonitorTap;
 if(!tap)return;
 tap.source.disconnect(tap.gain);
 tap.gain.disconnect();
 c.liveMonitorTap=null;
}
function syncLiveMonitor(c){
 if(!c.liveMonitorEnabled||c.closed||!isLiveSingerTurn(c)||!c.micSender?.track?.enabled){
  disconnectLiveMonitor(c);
  return;
 }
 const member=c.state.members.find(person=>person.id===c.state.self);
 if(!member?.publishing||member.locked||member.muted){
  disconnectLiveMonitor(c);
  return;
 }
 // Tap the vocal after its effects, before the outgoing MediaStream. A selected
 // output device uses the room's already unlocked playback context instead.
 const graph=c.processing;
 const processed=graph?.analyser&&graph.context?.state==='running';
 const direct=processed&&!c.levelContext?.sinkId;
 const context=direct?graph.context:c.levelContext;
 const input=direct?graph.analyser:(processed?graph.stream:c.stream);
 if(context?.state!=='running'||!input){disconnectLiveMonitor(c);return;}
 if(c.liveMonitorTap?.input===input&&c.liveMonitorTap.context===context)return;
 disconnectLiveMonitor(c);
 try{
  const source=direct?graph.analyser:context.createMediaStreamSource(input);
  const gain=context.createGain();
  gain.gain.value=.75;
  source.connect(gain);
  gain.connect(context.destination);
  c.liveMonitorTap={input,context,source,gain};
 }catch{
  c.liveMonitorEnabled=false;
  c.host.querySelector('#voice-monitor').checked=false;
  c.status('내 목소리 듣기를 연결하지 못했어요. 출력 장치를 확인하고 다시 켜주세요.');
  paintLiveKaraoke(c);
 }
}
function setLiveMonitor(c,enabled){
 c.liveMonitorEnabled=enabled;
 const checkbox=c.host.querySelector('#voice-monitor');
 if(checkbox)checkbox.checked=enabled;
 if(enabled)c.resumeSound();
 paintLiveKaraoke(c);
}
function bindLiveKaraoke(c){
 clearInterval(c.liveTimer);c.liveVolume??=.75;c.liveDelayMs??=200;
 bindLiveVocalSettings(c);liveEffectAvailability(c);
 const monitor=c.host.querySelector('#voice-monitor');
 monitor.checked=!!c.liveMonitorEnabled;
 monitor.onchange=()=>setLiveMonitor(c,monitor.checked);
 const form=c.host.querySelector('#live-search');
 form.onsubmit=e=>{e.preventDefault();c.safe(async()=>{
  const q=form.querySelector('#live-query').value.trim(),out=c.host.querySelector('#live-results');
  if(!q)return;out.textContent='노래를 찾는 중…';
  c.liveSearchAbort?.abort();const controller=c.liveSearchAbort=new AbortController(),serial=c.liveSearchSerial=(c.liveSearchSerial||0)+1;
  let data;try{data=await voiceRequest(c.path('karaoke-search')+'?generation='+encodeURIComponent(c.generation)+'&q='+encodeURIComponent(q),undefined,'GET',controller.signal);}catch(e){if(controller.signal.aborted||c.closed||serial!==c.liveSearchSerial)return;out.textContent='검색하지 못했어요. 잠시 후 다시 검색해주세요.';throw e;}
  if(c.closed||!out.isConnected||serial!==c.liveSearchSerial)return;
  out.innerHTML=data.tracks.length?data.tracks.map(t=>`<div class="live-result"><div><strong>${esc(t.title)}</strong><small>${esc(t.artist||'')} · ${time(t.duration)}</small></div><button class="small-button" type="button" data-voice="karaoke-request" data-target="${esc(t.id)}">신청</button></div>`).join(''):'<p class="quiet">MR과 가사가 준비된 곡을 찾지 못했어요.</p>';
 });};
 const volume=c.host.querySelector('#live-mr-volume'),delay=c.host.querySelector('#live-delay');
 volume.value=Math.round(c.liveVolume*100);volume.oninput=()=>{c.liveVolume=Number(volume.value)/100;if(c.liveAudio)c.liveAudio.volume=c.liveVolume;};
 delay.value=c.liveDelayMs;delay.oninput=()=>{c.liveDelayMs=Number(delay.value);c.host.querySelector('#live-delay-value').textContent=c.liveDelayMs+'ms';liveSync(c);};
 c.liveTimer=setInterval(()=>liveSync(c),200);
}
async function liveKaraokeAction(c,action,target){
 if(action==='karaoke-monitor'){
  if(isLiveSingerTurn(c))setLiveMonitor(c,!c.liveMonitorEnabled);
  return;
 }
 if(action==='karaoke-search-open'){c.showSheet('live-search-sheet');c.host.querySelector('#live-query').focus();return;}
 if(action==='karaoke-resume'){
  c.resumeSound();c.livePlayBlocked=false;if(c.liveAudio&&c.state?.karaoke?.phase==='singing'){try{await c.liveAudio.play();c.host.querySelector('#live-audio-unlock').hidden=true;}catch(e){c.livePlayBlocked=true;throw e;}}return;
 }
 if(action==='karaoke-retry'){c.liveTrack=null;const active=c.state?.karaoke?.active;if(active)livePrepareTrack(c,active);return;}
 const operation=action.slice('karaoke-'.length);
 if(!['request','cancel','call','accept','start','abandon','finish','next'].includes(operation))return;
 const command={operation,request_id:crypto.randomUUID()};
 if(c.liveCommandPending)return;
 if(operation==='start'&&!liveTrackReady(c))throw Error('반주를 불러온 뒤 시작해주세요.');
 if(operation==='request')command.track_id=target;
 if(operation==='cancel'&&target)command.target_id=target;
 if(['accept','start','abandon','finish','next'].includes(operation))command.invitation_id=target||c.state?.karaoke?.active?.invitation_id;
 c.liveCommandPending=true;paintLiveKaraoke(c);
 try{
  if(operation==='start'){
   // Unlock this singer's prepared media during the actual start-button gesture.
   // The muted check is paused at zero before the server's three-second countdown.
   const prepared=c.liveAudio,volume=prepared.volume;
   c.livePriming=true;prepared.volume=0;
   try{await prepared.play();prepared.pause();prepared.currentTime=0;}finally{prepared.volume=volume;c.livePriming=false;}
   if(c.closed)return;
  }
  const result=await c.command('karaoke',command);
  if(!c.acceptState?.(result))await c.refresh();
  if(operation==='request'){c.host.querySelector('#live-search-sheet')?.close();toast('노래를 신청했어요.');}
 }
 finally{c.liveCommandPending=false;paintLiveKaraoke(c);}
 // Permission prompts can remain unanswered. Keep the give-up control usable.
 if(operation==='accept'&&!c.closed&&c.state?.karaoke?.active?.invitation_id===command.invitation_id&&c.state.karaoke.phase==='ready'){
  c.micDesired=true;await c.enableMic();
 }
}
function paintLiveKaraoke(c){
 const s=c.state,k=s?.karaoke;if(!s||!c.host?.isConnected)return;
 if(s.room.mode!=='karaoke'){location.hash='#voice/'+c.id;return;}
 const self=s.members.find(p=>p.id===s.self),host=self?.role==='host',active=k?.active,singer=s.members.find(p=>p.id===active?.user_id);
 c.host.querySelector('#live-room-name').textContent=s.room.title||'라이브 노래방';
 c.host.querySelector('#voice-count').textContent='전체 '+s.members.length+'명 · 1인 가창';
 c.host.querySelector('#live-current').innerHTML=singer?`${avatarImage({name:singer.name,profile_id:singer.profile_id,image_version:singer.image_version})}<strong>${esc(singer.name)}</strong><small>${k.phase==='invited'?'응답 기다리는 중':k.phase==='ready'?'마이크 준비 중':'노래하는 중'}</small>`:`<span>${icon('mic')}</span><strong>${k?.queue?.length?'다음 가창자를 기다리는 중':'노래 신청을 기다리는 중'}</strong>`;
 c.host.querySelector('#live-song').textContent=active?active.track.title+' · '+active.track.artist:'신청 순서대로 노래를 불러봐요.';
 const hasQueued=k?.queue?.some(q=>q.user_id===s.self),isSinger=active?.user_id===s.self,singingMic=!!singer?.publishing&&!singer.muted;
 const buttons=[];
 const next=k?.queue?.[0],nextName=next&&(s.members.find(p=>p.id===next.user_id)?.name||next.name);
 const nextCard=c.host.querySelector('#live-next-card');
 if(nextCard){nextCard.hidden=!!active||!next;nextCard.innerHTML=!active&&next?`${avatarImage({...s.members.find(p=>p.id===next.user_id),name:nextName})}<div><small>다음 순서</small><strong>${esc(nextName)}님</strong><p>${esc(next.track.title)} · ${esc(next.track.artist)}</p></div>`:'';}
 c.host.dataset.livePhase=k?.phase||'idle';
 if(!active&&host&&next)buttons.push(`<button class="primary-button" data-voice="karaoke-call">${esc(nextName)}님 부르기</button>`);
 if(isSinger&&k.phase==='invited')buttons.push(`<button class="primary-button" data-voice="karaoke-accept" data-target="${esc(active.invitation_id)}" ${liveNow(c)>=k.inviteExpiresAt?'disabled':''}>부르기</button>`);
 if(isSinger&&k.phase==='ready'&&!singingMic)buttons.push('<button class="primary-button" data-voice="enable-mic">마이크 켜기</button>');
 if(isSinger&&k.phase==='ready')buttons.push(`<button class="primary-button" data-voice="karaoke-start" ${singingMic&&liveTrackReady(c)?'':'disabled'}>3·2·1 카운트다운 시작</button>`);
 if(active&&host&&!isSinger&&k.phase==='ready')buttons.push('<span class="quiet">가창자가 준비를 마치면 시작해요.</span>');
 if(active&&c.liveError)buttons.push('<button class="small-button" data-voice="karaoke-retry">반주 다시 불러오기</button>');
 if(isSinger&&k.phase==='singing')buttons.push(`<button class="small-button" data-voice="${self.muted?'enable-mic':'mute'}">${self.muted?'마이크 켜기':'마이크 끄기'}</button>`);
 if(active&&(host||isSinger))buttons.push(`<button class="small-button" data-voice="karaoke-abandon" data-target="${esc(active.invitation_id)}">노래 포기</button>`);
 if(active&&host&&next)buttons.push(`<button class="small-button" data-voice="karaoke-next">${esc(nextName)}님 부르기</button>`);
 if(hasQueued)buttons.push('<button class="small-button" data-voice="karaoke-cancel">내 신청 취소</button>');
 c.host.querySelector('#live-actions').innerHTML=buttons.join('');
 for(const button of c.host.querySelectorAll('[data-voice^="karaoke-"]'))if(c.liveCommandPending)button.disabled=true;
 const monitorToggle=c.host.querySelector('#live-monitor-toggle');
 if(monitorToggle){
  monitorToggle.disabled=!isLiveSingerTurn(c)||!!c.liveCommandPending;
  monitorToggle.setAttribute('aria-pressed',String(!!c.liveMonitorEnabled));
  monitorToggle.title=isLiveSingerTurn(c)?'이어폰으로 내 목소리를 바로 들어요.':'내 노래 차례에 모니터링을 켤 수 있어요.';
  monitorToggle.querySelector('span').textContent='내 목소리 듣기 '+(c.liveMonitorEnabled?'켜짐':'꺼짐');
 }
 // Static picker/result buttons are not rebuilt with the stage controls.
 for(const button of c.host.querySelectorAll('[data-voice="karaoke-search-open"],#live-results [data-voice="karaoke-request"]'))button.disabled=!!c.liveCommandPending;
 c.host.querySelector('#live-queue-count').textContent=(k?.queue?.length||0)+'명 대기';
 c.host.querySelector('#live-queue').innerHTML=k?.queue?.length?k.queue.map((q,i)=>{const person=s.members.find(p=>p.id===q.user_id);return `<li${i===0?' class="is-next"':''}><span>${i+1}</span><span class="live-queue-avatar">${avatarImage({...person,name:person?.name||q.name})}</span><div><strong>${esc(person?.name||q.name)}</strong><small title="${esc(q.track.title)}">${esc(q.track.title)}</small><small>${esc(q.track.artist)}</small></div>${host?`<button type="button" class="small-button" data-voice="karaoke-cancel" data-target="${esc(q.user_id)}" aria-label="${esc(person?.name||q.name)}님 신청 제외">×</button>`:''}</li>`;}).join(''):'<li class="live-queue-empty">첫 번째 노래를 신청해보세요.</li>';
 if(active)livePrepareTrack(c,active);else {if(c.liveAudio||c.liveTrack||c.liveAbort)liveStopAudio(c);c.liveError='';}
 c.host.querySelector('#live-stage-note').textContent=c.liveError||(isLiveSingerTurn(c)?'이어폰을 연결하고 ‘내 목소리 듣기’를 켜면 노래하면서 들을 수 있어요.':'이어폰을 사용하면 반주가 마이크에 섞이지 않아요.');
 liveSync(c);
}
function liveRenderLyrics(c,seconds){
 const node=c.host?.querySelector('#live-lyrics'),lines=c.liveWords;if(!node)return;
 if(!lines?.length){const msg=c.liveError||'반주와 가사를 준비하고 있어요.';if(node.textContent!==msg)node.textContent=msg;return;}
 let idx=lines.findIndex(l=>seconds<l.e+.6);if(idx<0)idx=lines.length-1;
 const shown=[idx-1,idx,idx+1].filter(i=>i>=0&&i<lines.length);
 const html=shown.map(i=>`<p class="${i===idx?'is-current':''}">${lines[i].w.map(w=>`<span class="${seconds>=w.s?'is-sung':''}">${esc(w.t)}</span>`).join(' ')}</p>`).join('');
 if(html!==c.liveLyricHTML){node.innerHTML=html;c.liveLyricHTML=html;}
}
function liveSync(c){
 const k=c.state?.karaoke,active=k?.active;if(c.closed||!c.host?.isConnected)return;
 syncLiveMonitor(c);
 liveEffectAvailability(c);
 const phase=c.host.querySelector('#live-phase'),timer=c.host.querySelector('#live-timer'),progress=c.host.querySelector('#live-progress');
 const invite=c.host.querySelector('#live-invite');
 if(invite)invite.hidden=!active||!['invited','ready'].includes(k.phase);
 if(!active){phase.textContent='가창자 대기 중';timer.textContent='0:00 / 0:00';progress.value=0;const lyrics=c.host.querySelector('#live-lyrics');if(lyrics)lyrics.textContent='노래를 신청하면 이곳에서 가사를 함께 볼 수 있어요.';return;}
 const now=liveNow(c),isSinger=c.state?.self===active.user_id,duration=active.track.duration;
 const waiting=k.phase!=='singing'||now<k.startsAt;
 const seconds=waiting?0:Math.max(0,Math.min(duration,(now-k.startsAt-(isSinger?0:c.liveDelayMs||0))/1000));
 if(k.phase==='invited'){
  const remaining=Math.max(0,Math.ceil((k.inviteExpiresAt-now)/1000));
  phase.textContent=remaining?'응답 대기 · '+remaining+'초':'다음 예약자로 이동 중';
  if(invite)invite.textContent=isSinger?'10초 안에 부르기를 눌러주세요. 누르면 마이크를 연결해요.':'응답이 없으면 다음 예약자로 자동 이동해요.';
  const accept=c.host.querySelector('[data-voice="karaoke-accept"]');if(accept)accept.disabled=!remaining||!!c.liveCommandPending;
 }else if(k.phase==='ready'){
  const remaining=Number.isFinite(k.readyExpiresAt)?Math.max(0,Math.ceil((k.readyExpiresAt-now)/1000)):null;
  phase.textContent=remaining===0?'다음 예약자로 이동 중':'마이크 준비'+(remaining===null?' 중':' · '+remaining+'초');
  if(invite)invite.textContent=isSinger?'10초 안에 마이크를 켜고 카운트다운을 시작해주세요.':'준비 시간이 지나면 다음 예약자로 자동 이동해요.';
  const mic=c.host.querySelector('#live-actions [data-voice="enable-mic"]'),start=c.host.querySelector('[data-voice="karaoke-start"]');
  if(mic)mic.disabled=remaining===0;
  if(start)start.disabled=remaining===0||!!c.liveCommandPending||!liveTrackReady(c)||!c.state.members?.some(p=>p.id===active.user_id&&p.publishing&&!p.muted);
 }else phase.textContent=now<k.startsAt?Math.max(1,Math.ceil((k.startsAt-now)/1000))+'초 뒤 시작':'노래하는 중 · LIVE';
 timer.textContent=time(seconds)+' / '+time(duration);progress.max=duration;progress.value=seconds;
 const audio=c.liveAudio;
 if(audio&&!c.livePriming){
  audio.volume=c.liveVolume??.75;
  if(waiting||seconds<=0){if(!audio.paused)audio.pause();if(audio.readyState>=1&&audio.currentTime>.1)audio.currentTime=0;}
  else{
   if(audio.readyState>=1&&Math.abs(seconds-audio.currentTime)>.28)audio.currentTime=Math.min(seconds,Math.max(0,duration-.1));
   if(audio.paused&&!audio.ended&&!c.livePlayBlocked&&!c.livePlayPending){c.livePlayPending=true;audio.play().then(()=>{const btn=c.host?.querySelector('#live-audio-unlock');if(btn)btn.hidden=true;}).catch(()=>{c.livePlayBlocked=true;const btn=c.host?.querySelector('#live-audio-unlock');if(btn)btn.hidden=false;}).finally(()=>{c.livePlayPending=false;});}
  }
 }
 liveRenderLyrics(c,seconds);
 if(c.liveError)c.host.querySelector('#live-stage-note').textContent=c.liveError;
}

// Integrate with the exact current Sites talking-room client without replacing its code.
// Give the live mode a community tab without replacing the current community source.
const productionCommunityNavigation=communityNavigation;
communityNavigation=function(tab){
 const html=productionCommunityNavigation(tab);
 const link=`<a class="tab ${tab==='live'?'active':''}" href="#live" ${tab==='live'?'aria-current="page"':''}>라이브 노래방</a>`;
 return html.includes('href="#live"')?html:html.replace(/<nav\b[^>]*>/,opening=>opening+link);
};
const productionVoiceView=voiceView;
voiceView=async function(base,id,signal){
 if(base!=='live')return productionVoiceView(base,id,signal);
 if(id){if(!me)return {html:heading('라이브 노래방')+gate()};return {html:liveKaraokeRoomHTML(id)};}
 let data={rooms:[],crews:[]},enabled=false;
 try{
  const status=await voiceRequest('status',undefined,'GET',signal);
  enabled=!!status.enabled;
  if(enabled){
   const [rooms,options]=await Promise.all([voiceRequest(me?'rooms':'public-rooms',undefined,'GET',signal),me?voiceRequest('options',undefined,'GET',signal):Promise.resolve({})]);
   data={...rooms,...options};
  }
 }catch(e){return {html:heading('라이브 노래방')+'<p role="alert">'+esc(e.message)+'</p>'};}
 return {html:communityNavigation('live')+liveKaraokeLobbyHTML(data,enabled),liveLobby:true};
};
const productionCleanupVoiceRoute=cleanupVoiceRoute;
cleanupVoiceRoute=function(base,id){
 if(base!=='live')return productionCleanupVoiceRoute(base,id);
 const valid=!!me&&voiceController?.liveMode&&voiceController.id===id&&!voiceController.closed;
 setVoiceFocus(!!valid&&!!voiceController.joined);
 if(voiceController&&!valid){
  const work=voiceController.leave();voiceController=null;return work;
 }
};
const productionBindVoice=bindVoice;
bindVoice=function(base,id){
 if(base!=='live')return productionBindVoice(base,id);
 if(!id){bindLiveKaraokeLobby();return;}
 const host=document.querySelector('[data-voice-room]');if(!host)return;
 if(!voiceController||voiceController.closed||voiceController.id!==id||!voiceController.liveMode){
  if(voiceController&&!voiceController.closed)voiceController.leave();
  voiceController=new VoiceRoomClient(id);
 }
 voiceController.liveMode=true;
 if(voiceEntryAudio&&(voiceEntryAudio.id===null||voiceEntryAudio.id===id)){
  clearTimeout(voiceEntryAudio.timer);voiceController.levelContext=voiceEntryAudio.context;voiceEntryAudio=null;
 }
 voiceController.bind(host);
};
const productionVoiceBind=VoiceRoomClient.prototype.bind;
VoiceRoomClient.prototype.bind=function(host){
 if(this.liveMode)liveVoiceMix(this);
 const result=productionVoiceBind.call(this,host);
 if(this.liveMode){
  bindLiveKaraoke(this);
  this.livePageHide ||= ()=>liveStopAudio(this);window.addEventListener('pagehide',this.livePageHide);
  const retry=host.querySelector('#voice-join');if(retry)retry.onclick=()=>{if(this.closed){voiceController=new VoiceRoomClient(this.id);voiceController.liveMode=true;voiceController.bind(host);}else this.safe(()=>this.join());};
 }
 return result;
};
const productionVoicePaint=VoiceRoomClient.prototype.paint;
VoiceRoomClient.prototype.paint=function(){
 const result=productionVoicePaint.call(this);
 if(this.liveMode){
  const isSinger=this.state?.karaoke?.active?.user_id===this.state?.self&&['ready','singing'].includes(this.state?.karaoke?.phase);
  if(!isSinger&&(this.micDesired||this.stream||this.pendingStream)){
   this.micDesired=false;this.micAttempt=(this.micAttempt||0)+1;this.stopMicrophone();this.micState='muted';
  }
  paintLiveKaraoke(this);
 }
 return result;
};
const productionWarmMicrophone=VoiceRoomClient.prototype.warmMicrophone;
VoiceRoomClient.prototype.warmMicrophone=function(...a){
 if(this.liveMode&&(this.state?.karaoke?.active?.user_id!==this.state?.self||!['ready','singing'].includes(this.state?.karaoke?.phase)))return;
 return productionWarmMicrophone.apply(this,a);
};
const productionVoiceAction=VoiceRoomClient.prototype.action;
VoiceRoomClient.prototype.action=async function(action,target,button){
 if(this.liveMode){
  if(action==='copy-link'){await navigator.clipboard.writeText(location.origin+'/#live/'+this.id);toast('초대 링크를 복사했어요.');return;}
  if(action==='music-picker')return;
  if(action?.startsWith('karaoke-'))return liveKaraokeAction(this,action,target);
  if(action==='leave'){await this.leave();location.hash='#live';return;}
  if(action==='close'){await this.command('close');this.leave(false);location.hash='#live';return;}
 }
 return productionVoiceAction.call(this,action,target,button);
};
const productionVoiceLeave=VoiceRoomClient.prototype.leave;
const productionMonitor=VoiceRoomClient.prototype.monitor;
VoiceRoomClient.prototype.monitor=async function(){
 if(this.liveMode){syncLiveMonitor(this);return;}
 return productionMonitor.call(this);
};
const productionStopMicrophone=VoiceRoomClient.prototype.stopMicrophone;
VoiceRoomClient.prototype.stopMicrophone=function(){
 if(this.liveMode)disconnectLiveMonitor(this);
 return productionStopMicrophone.call(this);
};
VoiceRoomClient.prototype.leave=function(...a){
 if(this.liveMode){clearInterval(this.liveTimer);this.liveSearchAbort?.abort();window.removeEventListener('pagehide',this.livePageHide);liveStopAudio(this);}
 return productionVoiceLeave.apply(this,a);
};
