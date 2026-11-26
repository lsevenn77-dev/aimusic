// One singer at a time. Reuses the authenticated voice room, SFU and karaoke MR catalogue.
function liveVoiceMix(c){
 if(!c.liveVocalMix)c.liveVocalMix=typeof AifectKaraoke!=='undefined'?AifectKaraoke.defaultVocalMix():{echo:0,room:0,size:.5,tone:0,noise:2};
 return c.liveVocalMix;
}
function liveVocalSettingsHTML(){
 const effects=[['room','리버브',0,100,1],['echo','에코',0,65,.1],['size','룸 크기',0,100,1],['tone','음색',-100,200,1]];
 const presets=[['original','원음'],['karaoke','노래방'],['studio','스튜디오'],['hall','홀'],['rap','랩'],['custom','사용자 설정']];
 return `<div class="live-vocal-settings"><details class="live-sound-card" open><summary>음량</summary><label for="voice-input-gain">내 목소리 <output data-value-for="voice-input-gain">100%</output></label><div id="live-voice-volume-slot"></div><label for="live-mr-volume">음원 <output data-value-for="live-mr-volume">75%</output></label><div id="live-music-volume-slot"></div></details><details class="live-sound-card"><summary>목소리 효과</summary><div class="live-preset-grid" role="group" aria-label="목소리 효과">${presets.map(([id,label])=>`<button type="button" data-live-preset="${id}" aria-pressed="false">${label}</button>`).join('')}</div><details data-live-custom><summary>잡음 · 세부 설정</summary><label for="live-fx-noise">잡음 제거</label><select id="live-fx-noise" data-live-noise aria-label="잡음 제거">${[0,1,2,3,4].map(level=>`<option value="${level}">${level?level+'단계':'끔'}</option>`).join('')}</select>${effects.map(([key,label,min,max,step])=>`<label for="live-fx-${key}">${label}<output ${key==='echo'?'data-live-echo-value':'data-value-for="live-fx-'+key+'"'}></output></label><input id="live-fx-${key}" data-live-fx="${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="0">`).join('')}</details><p id="live-effect-status" role="status" hidden></p></details></div>`;
}
function bindLiveVocalSettings(c){
 const sound=c.host.querySelector('#voice-sound');liveVoiceMix(c);
 const body=sound.querySelector('.room-popup-body')||sound;
 body.insertAdjacentHTML('afterbegin',liveVocalSettingsHTML());
 // Keep the common event-bound controls, but move their live-room inputs into
 // the new sections. The old preset card stays mounted for shared bindings.
 sound.querySelector('#voice-preset').closest('.voice-effect-card').hidden=true;
 sound.querySelector('#voice-input-gain').closest('.voice-audio-card').hidden=true;
 sound.querySelector('#live-voice-volume-slot').append(c.host.querySelector('#voice-input-gain'));
 sound.querySelector('#live-music-volume-slot').append(c.host.querySelector('#live-mr-volume'));
 const monitoring=document.createElement('details');monitoring.className='live-sound-card';
 monitoring.innerHTML='<summary>모니터링 · 청취 음량</summary>';
 body.insertBefore(monitoring,sound.querySelector('#voice-monitor').closest('.voice-audio-card'));
 monitoring.append(sound.querySelector('#voice-monitor').closest('.voice-audio-card'));
 monitoring.append(sound.querySelector('#voice-music-volume').closest('label'));
 const advanced=sound.querySelector('.voice-audio-extra');
 advanced.append(c.host.querySelector('#live-delay').closest('label'));
 advanced.append(sound.querySelector('.voice-mic-test'));
 const note=sound.querySelector('.voice-sheet-heading p');if(note)note.textContent='내 목소리와 음원, 공간 효과를 조절하세요.';
 const controls=sound.querySelector('[data-live-custom]'),noise=sound.querySelector('[data-live-noise]');
 const paint=()=>{
  const mix=liveVoiceMix(c);
  for(const button of sound.querySelectorAll('[data-live-preset]'))button.setAttribute('aria-pressed',String(mix.preset===button.dataset.livePreset));
  for(const input of sound.querySelectorAll('[data-live-fx]')){input.value=Number((mix[input.dataset.liveFx]*100).toFixed(1));c.updateDesignField(input);if(input.dataset.liveFx==='echo')sound.querySelector('[data-live-echo-value]').textContent=Number(input.value).toFixed(1)+'%';}
  noise.value=mix.noise??0;
 };
 const apply=()=>{
  c.processing?.setMix?.(c.liveVocalMix);
  if(c.testGraph!==c.processing)c.testGraph?.setMix?.(c.liveVocalMix);
  paint();
 };
 for(const button of sound.querySelectorAll('[data-live-preset]'))button.onclick=()=>{
  const id=button.dataset.livePreset,mix=liveVoiceMix(c);
  c.liveVocalMix=id==='rap'?{...mix,preset:'rap',echo:0,room:.03,size:.1,tone:.15}:AifectKaraoke.presetMix(mix,id,.5);
  controls.open=id==='custom';apply();
 };
 for(const input of sound.querySelectorAll('[data-live-fx]'))input.oninput=()=>{
  c.liveVocalMix=AifectKaraoke.editVocalMix(liveVoiceMix(c),input.dataset.liveFx,Number(input.value)/100);apply();
 };
 noise.onchange=()=>{c.liveVocalMix={...liveVoiceMix(c),noise:Number(noise.value)};apply();};
 controls.open=c.liveVocalMix.preset==='custom';paint();
}
function liveEffectAvailability(c){
 const supported=!c.processing||c.processing.supportsMix!==false;
 for(const input of c.host.querySelectorAll('[data-live-fx],[data-live-preset],[data-live-noise]'))input.disabled=!supported;
 const note=c.host.querySelector('#live-effect-status');
 if(note){note.hidden=supported;note.textContent=supported?'':'이 브라우저에서 공간 효과를 연결하지 못했습니다. 현재 원음으로 전달 중입니다.';}
}
function liveKaraokeRoomHTML(id){
 const stage=`<div id="live-karaoke-stage"><section class="live-stage-main">
  <div class="room-key" role="group" aria-label="반주 키"><button type="button" data-voice="karaoke-key" data-target="-1" aria-label="키 낮추기">−</button><button type="button" data-voice="karaoke-key" data-target="reset" aria-label="원키로 복원">원키</button><button type="button" data-voice="karaoke-key" data-target="1" aria-label="키 높이기">+</button></div>
  <div class="live-stage-top"><span id="live-phase" role="status">가창자 기다리는 중</span></div>
  <div id="live-current" class="live-current"><span>${icon('mic')}</span><strong>다음 가창자를 기다리는 중</strong></div>
  <div id="live-countdown" class="live-countdown" hidden aria-label="노래 시작 카운트"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" pathLength="100"/></svg><strong></strong><i class="live-start-dot" aria-hidden="true"></i><i class="live-start-dot" aria-hidden="true"></i><i class="live-start-dot" aria-hidden="true"></i></div><div id="live-lyrics" class="live-lyrics" aria-live="off"><p>노래가 시작되면 가사가 여기에 나옵니다.</p></div>
  <span class="room-event-notice" role="status" aria-atomic="true"></span><div id="live-actions" class="live-actions"></div><div id="live-invite" class="live-start-popup" hidden role="status"><p>15초 이내로 시작을 눌러 주세요.</p><output id="live-invite-count"></output><div id="room-turn-action"></div></div>
  <div class="live-song-progress"><span class="live-time-icon" aria-hidden="true">${icon('music')}</span><span id="live-timer">0:00 / 0:00</span><progress id="live-progress" max="100" value="0" aria-label="곡 진행률"></progress></div>


 </section>
 <section class="live-request-area" aria-label="노래 신청과 예약 순서"><span class="live-reserve-slot"><button type="button" class="live-request-button" data-voice="karaoke-search-open">${voiceGlyph('talkMic')}<span><strong>예약</strong><small id="live-queue-count">0명 대기</small></span></button></span><ol id="live-queue" class="live-queue" aria-label="예약 순서"></ol></section>
 </div><div class="room-live-guide"><p id="live-stage-note" class="live-stage-note"></p>
  <button class="small-button live-audio-unlock" id="live-audio-unlock" type="button" data-voice="karaoke-resume" hidden>소리 켜기</button></div>`;
 const search=`<dialog id="live-search-sheet" class="voice-sheet compact-popup" aria-labelledby="live-search-title"><header class="live-search-heading room-popup-heading"><h2 id="live-search-title">노래 예약하기</h2><button type="button" class="room-popup-mobile-close" data-voice="dismiss" aria-label="예약 닫기">${voiceGlyph('close')}</button></header>${roomSongSearchHTML('karaoke')}<nav class="live-search-tabs" role="tablist" aria-label="예약할 곡"><button type="button" role="tab" data-live-library="mine" aria-selected="true">나의 곡</button><button type="button" role="tab" data-live-library="popular" aria-selected="false">인기곡</button></nav><div id="live-results" class="live-results" aria-live="polite"></div><footer class="live-search-pages" hidden><button type="button" data-song-page="previous" aria-label="이전 검색 페이지">이전</button><output></output><button type="button" data-song-page="next" aria-label="다음 검색 페이지">다음</button></footer></dialog>`;
 const audio=`<div class="live-audio-settings"><label>내 반주 음량 <input id="live-mr-volume" type="range" min="0" max="100" value="75"></label><label>청취 싱크 보정 <input id="live-delay" type="range" min="0" max="500" step="50" value="200"><output id="live-delay-value">200ms</output></label></div>`;
 return voiceRoomHTML(id,false)
  .replace('class="voice-room"','class="voice-room live-karaoke-room"')
  .replace('href="#voice">← 토킹룸','href="#live">〈 라이브 노래방')
  .replace('좌석을 눌러 참여 신청해 보세요.','신청 순서대로 한 명씩 노래합니다.')
  .replace('id="voice-title">토킹룸','id="voice-title">라이브 노래방')
  .replace('토킹룸 종료','노래방 종료')

  .replace('<div id="voice-seats" class="voice-seats"></div>',stage+'<div id="voice-seats" class="voice-seats"></div>')
  .replace('<dialog id="voice-members"',search+'<dialog id="voice-members"')
  .replace('<section id="voice-host-audio"',audio+'<section id="voice-host-audio"');
}
function prepareLiveEntryClick(e){
 if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||!me)return;
 const link=e.target.closest?.('a[href]');if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
 const url=new URL(link.href,location.href),match=url.hash.match(/^#live\/([^/?#]+)$/);
 if(match&&url.origin===location.origin&&url.pathname===location.pathname&&url.search===location.search)prepareVoiceListening(match[1]);
}
document.addEventListener('click',prepareLiveEntryClick);
function liveNow(c){return Date.now()+(c.musicClock||0);}
function liveDesktopPresentation(c){
 return typeof roomUsesDesktopControls==='function'?roomUsesDesktopControls():!!c.host?.hasAttribute?.('data-room-pc-controls');
}
function liveUpdatePresentation(c){
 const pc=liveDesktopPresentation(c),k=c.state?.karaoke,active=k?.active;
 // A session remains started through audio pause/buffering; only the server's
 // turn/phase and start time determine the singer's personal controls.
 const started=active?.user_id===c.state?.self&&k.phase==='singing'&&Number.isFinite(k.startsAt)&&liveNow(c)>=k.startsAt;
 const sound=c.host.querySelector('#live-actions [data-voice="sound"]');if(sound)sound.hidden=!started;
 const key=c.host.querySelector('.room-key');if(key)key.hidden=pc&&!started;
 for(const button of c.host.querySelectorAll('#live-actions [data-voice="karaoke-mic-toggle"],#live-actions [data-voice="karaoke-abandon"]'))button.hidden=pc&&!started;
 const abandon=c.host.querySelector('#live-actions [data-voice="karaoke-abandon"]');
 if(abandon?.parentElement&&abandon.dataset.desktopIcon!==String(pc)){
  abandon.dataset.desktopIcon=String(pc);
  abandon.innerHTML=voiceGlyph('seatDown');
  abandon.setAttribute('aria-label',pc?'가창 내려가기':'그만 부르기');abandon.title=pc?'가창 내려가기':'그만 부르기';
 }
 const timerRow=c.host.querySelector('.live-song-progress'),stage=c.host.querySelector('#live-karaoke-stage'),main=c.host.querySelector('.live-stage-main');
 if(timerRow?.parentElement&&stage&&main){
  if(pc){
   if(timerRow.parentElement!==stage)stage.insertBefore(timerRow,c.host.querySelector('.live-request-area'));
   timerRow.querySelector('#live-progress')?.remove();
  }else{
   if(timerRow.parentElement!==main)main.append(timerRow);
   if(!timerRow.querySelector('#live-progress'))timerRow.insertAdjacentHTML('beforeend','<progress id="live-progress" max="100" value="0" aria-label="곡 진행률"></progress>');
  }
  const guide=c.host.querySelector('.room-live-guide');
  if(guide){
   // Playback recovery belongs to the stage, never a new row under reservations.
   if(guide.parentElement!==main)main.append(guide);
  }
 }

}
function liveStopAudio(c){
 c.liveAbort?.abort();c.liveAbort=null;clearTimeout(c.liveEndTimer);
 if(c.livePitch?.node?.port){c.livePitch.node.port.onmessage=null;c.livePitch.node.port.close?.();}
 c.livePitch?.source.disconnect();c.livePitch?.node.disconnect();c.livePitch?.gain?.disconnect();c.livePitch=null;c.livePitchPending=null;
 if(c.liveAudio){c.liveAudio.pause();c.liveAudio.removeAttribute('src');c.liveAudio.load();c.liveAudio=null;}
 c.liveKeyDesired=null;c.liveKeyTurn=null;c.liveStartClock=null;c.livePlaybackTurn=null;c.livePitchLatency=0;c.liveToken=(c.liveToken||0)+1;c.liveWords=null;c.liveTrack=null;c.liveLyricHTML=null;
}
function livePrepareTrack(c,active){
 if(c.liveTrack===active.track.id)return;
 liveStopAudio(c);c.liveTrack=active.track.id;c.liveError='';c.livePlayBlocked=false;c.livePlayPending=false;
 const token=c.liveToken=(c.liveToken||0)+1,controller=new AbortController();c.liveAbort=controller;
 fetch('/api/karaoke/'+encodeURIComponent(active.track.id),{credentials:'same-origin',signal:controller.signal})
  .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'반주를 불러오지 못했습니다.');return d;})
  .then(d=>{
   if(c.closed||c.liveToken!==token||c.liveTrack!==active.track.id)return;
   c.liveWords=Array.isArray(d.words)?d.words:[];
   if(!d.mr||!c.liveWords.length)throw Error('반주와 시간 가사가 준비되지 않았습니다.');
   const a=new Audio(d.mr);a.muted=!!c.roomAudio?.blocked;a.preload='auto';a.volume=c.liveVolume??.75;
   a.onended=()=>{const turn=c.state?.karaoke?.active?.invitation_id;clearTimeout(c.liveEndTimer);c.liveEndTimer=setTimeout(()=>{const k=c.state?.karaoke;if(c.liveAudio===a&&k?.active?.invitation_id===turn&&k?.active?.user_id===c.state.self&&k.phase==='singing')c.safe(()=>liveKaraokeAction(c,'karaoke-finish'));},Math.ceil((c.livePitchLatency||0)*1000));};
   a.onerror=()=>{if(c.liveAudio===a){c.liveError='반주를 재생할 수 없습니다. 네트워크와 곡 상태를 확인해 주세요.';paintLiveKaraoke(c);}};
   a.oncanplay=()=>{if(c.liveAudio===a)paintLiveKaraoke(c);};
   c.liveAudio=a;c.livePitchError='';a.load();
   livePitchGraph(c).catch(e=>{c.livePitchError=e.message;});liveSync(c);
  })
  .catch(e=>{if(!controller.signal.aborted&&!c.closed&&c.liveToken===token){c.liveError=e.message;paintLiveKaraoke(c);}});
}
async function livePitchGraph(c){
 const audio=c.liveAudio,ctx=c.levelContext;
 if(!audio||!ctx?.audioWorklet)throw Error('이 기기에서 반주 키 조절을 시작할 수 없습니다.');
 if(c.livePitch||c.livePitchPending)return c.livePitchPending;
 const pending=(async()=>{
  c.liveWorkletModule ||= ctx.audioWorklet.addModule('/room-backing-worklet.js').catch(e=>{c.liveWorkletModule=null;throw e;});
  await c.liveWorkletModule;
  if(c.closed||c.liveAudio!==audio)return;
  const node=new AudioWorkletNode(ctx,'room-backing',{outputChannelCount:[2]});
  node.port.onmessage=({data})=>{if(c.livePitch?.node===node&&Number.isFinite(data?.latency))c.livePitchLatency=data.latency;};
  const source=ctx.createMediaElementSource(audio);
  const gain=ctx.createGain();gain.gain.value=c.roomAudio?.blocked?0:(c.liveVolume??.75);audio.volume=1;
  source.connect(node).connect(gain).connect(ctx.destination);
  c.livePitch={source,node,gain,key:null};c.livePitchError='';
 })();
 c.livePitchPending=pending;
 try{await pending;}finally{if(c.livePitchPending===pending)c.livePitchPending=null;}
}
function liveSetVolume(c,value){
 if(!c.liveAudio)return;
 if(c.roomAudio?.blocked){c.roomAudio.quietElement(c.liveAudio);c.roomAudio.zeroGain(c.livePitch?.gain,c.levelContext);return;}
 c.liveAudio.muted=false;
 if(c.livePitch?.gain){c.liveAudio.volume=1;c.livePitch.gain.gain.setTargetAtTime(value,c.levelContext.currentTime,.015);}
 else c.liveAudio.volume=value;
}
function liveTrackReady(c){
 const a=c.liveAudio;if(!a||a.readyState<2||!c.liveWords?.length||c.liveError)return false;
 if(!a.buffered)return true;
 for(let i=0;i<a.buffered.length;i++)if(a.buffered.start(i)<=.1&&a.buffered.end(i)>=Math.min(3,a.duration||3))return true;
 return a.readyState===4;
}
function isLiveSingerTurn(c){
 const {karaoke,self}=c.state||{};
 return !!self&&karaoke?.active?.user_id===self&&['ready','singing'].includes(karaoke.phase);
}
function disconnectLiveMonitor(c){
 const tap=c.liveMonitorTap;
 if(!tap)return;
 try{tap.source.disconnect(tap.gain);}catch{/* The capture graph may already be retired. */}
 try{tap.gain.disconnect();}catch{}
 c.liveMonitorTap=null;
}
function syncLiveMonitor(c){
 if(c.roomAudio?.blocked||!c.liveMonitorEnabled||c.closed||!isLiveSingerTurn(c)||!c.micSender?.track?.enabled){
  disconnectLiveMonitor(c);
  return;
 }
 const member=c.state.members.find(person=>person.id===c.state.self);
 // Monitoring is local. A transient publication/transport snapshot must not
 // repeatedly cut the singer's headphones while their local track is enabled.
 if(!member||member.locked||member.muted){
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
  c.status('내 목소리 듣기를 연결하지 못했습니다. 출력 장치를 확인하고 다시 켜 주세요.');
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
 clearInterval(c.liveTimer);c.liveVolume??=c.preferences?.music??.75;c.liveDelayMs??=200;
 liveEffectAvailability(c);
 const monitor=c.host.querySelector('#voice-monitor');
 monitor.checked=!!c.liveMonitorEnabled;
 monitor.onchange=()=>setLiveMonitor(c,monitor.checked);
 const form=c.host.querySelector('#live-search');
 form.onsubmit=e=>{e.preventDefault();c.safe(()=>liveSearchSongs(c));};
 for(const tab of c.host.querySelectorAll('[data-live-library]'))tab.onclick=()=>{c.liveLibrary=tab.dataset.liveLibrary;form.querySelector('#live-query').value='';c.safe(()=>liveSearchSongs(c));};
 const volume=c.host.querySelector('#live-mr-volume'),delay=c.host.querySelector('#live-delay');
 volume.value=Math.round(c.liveVolume*100);volume.oninput=()=>{c.liveVolume=Number(volume.value)/100;liveSetVolume(c,c.liveVolume);};
 delay.value=c.liveDelayMs;delay.oninput=()=>{c.liveDelayMs=Number(delay.value);c.host.querySelector('#live-delay-value').textContent=c.liveDelayMs+'ms';liveSync(c);};
 c.liveTimer=setInterval(()=>liveSync(c),200);
}
async function liveSearchSongs(c,offset=0){
 const q=c.host.querySelector('#live-query').value.trim(),out=c.host.querySelector('#live-results'),collection=c.liveLibrary||'mine';
 for(const tab of c.host.querySelectorAll('[data-live-library]'))tab.setAttribute('aria-selected',String(tab.dataset.liveLibrary===collection&&!q));
 c.liveSearchAbort?.abort();const controller=c.liveSearchAbort=new AbortController(),serial=c.liveSearchSerial=(c.liveSearchSerial||0)+1;
 out.dataset.state='loading';out.setAttribute('aria-busy','true');out.textContent='노래를 불러오는 중…';
 try{
  const data=await voiceRequest(c.path('karaoke-search')+'?generation='+encodeURIComponent(c.generation)+'&q='+encodeURIComponent(q)+'&collection='+collection+'&offset='+offset,undefined,'GET',controller.signal);
  if(c.closed||serial!==c.liveSearchSerial||!out.isConnected)return;
  const pages=c.host.querySelector('.live-search-pages');
  if(pages?.querySelector){
   pages.hidden=!offset&&data.next==null;
   pages.querySelector('output').textContent=(Math.floor(offset/30)+1)+'페이지';
   const prev=pages.querySelector('[data-song-page=previous]'),next=pages.querySelector('[data-song-page=next]');
   prev.disabled=!offset;next.disabled=data.next==null;
   prev.onclick=()=>c.safe(()=>liveSearchSongs(c,Math.max(0,offset-30)));
   next.onclick=()=>c.safe(()=>liveSearchSongs(c,data.next));
  }
  out.scrollTop=0;out.dataset.state=data.tracks.length?'results':q?'no-results':'empty';out.setAttribute('aria-busy','false');
  out.innerHTML=data.tracks.slice(0,30).map(t=>`<div class="live-result"><img src="${esc(t.cover||trackArtworkPath(t))}" width="38" height="38" alt=""><div><strong title="${esc(t.title)}">${esc(t.title)}</strong><small>${esc(roomTrackCredit(t))}</small></div><time>${time(t.duration||0)}</time><button class="small-button" type="button" data-voice="karaoke-request" data-target="${esc(t.id)}">예약</button></div>`).join('')||`<p class="quiet">${q?'부를 수 있는 곡을 찾지 못했습니다.':collection==='mine'?'아직 부른 곡이 없습니다.':'최근 예약 기록이 없습니다.'}</p>`;
 }catch(error){if(controller.signal.aborted||c.closed)return;out.dataset.state='error';out.setAttribute('aria-busy','false');out.textContent='곡을 불러오지 못했습니다. 검색을 눌러 다시 시도해 주세요.';throw error;}
}
function liveMicIntent(c){
 const guard=c.roomAudio,intent=c.micIntentRevision||0,generation=c.generation,epoch=c.epoch;
 return ()=>!c.closed&&c.roomAudio===guard&&(c.micIntentRevision||0)===intent&&c.generation===generation&&c.epoch===epoch;
}
async function liveKaraokeAction(c,action,target){
 if(action==='karaoke-begin'){
  const sameIntent=liveMicIntent(c);
  if(c.roomAudio&&!await c.roomAudio.allowCapture(true))return;
  if(!sameIntent())return;
  const audioRevision=c.roomAudio?.revision;
  const id=target,k=c.state?.karaoke;
  const current=()=>sameIntent()&&c.roomAudio?.revision===audioRevision&&!c.roomAudio?.blocked&&!c.roomAudio?.micNeedsGesture&&c.state?.karaoke?.active?.invitation_id===id&&c.state.karaoke.active.user_id===c.state.self;
  if(!id||!current()||!['invited','ready'].includes(k.phase)||c.liveStartingId===id)return;
  c.liveStartingId=id;c.resumeSound?.();paintLiveKaraoke(c);
  try{
   const audio=c.liveAudio;
   if(audio){c.livePriming=true;audio.muted=true;Promise.resolve(audio.play()).then(()=>{if(c.liveAudio===audio&&c.state?.karaoke?.phase!=='singing'){audio.pause();audio.currentTime=0;}}).catch(()=>{}).finally(()=>{audio.muted=!!c.roomAudio?.blocked;c.livePriming=false;});}
   if(k.phase==='invited'){
    const state=await c.command('karaoke',{operation:'accept',invitation_id:id,request_id:crypto.randomUUID()});
    if(!c.acceptState(state))await c.refresh();
   }
   if(!current()||c.state.karaoke.phase!=='ready')return;
   // The original button gesture already authorized capture. A delayed accept
   // response must not turn into a new gesture after an interruption or mute.
   c.micDesired=true;await c.enableMic(false);
   while(current()&&c.state.karaoke.phase==='ready'&&liveNow(c)<c.state.karaoke.readyExpiresAt){
    if(c.liveError)throw Error(c.liveError);
    if(liveTrackReady(c)&&c.state.members.some(p=>p.id===c.state.self&&p.publishing&&!p.muted)){
     const state=await c.command('karaoke',{operation:'start',invitation_id:id,request_id:crypto.randomUUID()});
     if(!c.acceptState(state))await c.refresh();
     break;
    }
    await new Promise(resolve=>setTimeout(resolve,100));
   }
  }finally{if(c.liveStartingId===id)c.liveStartingId=null;if(!c.closed)paintLiveKaraoke(c);}
  return;
 }
 if(action==='karaoke-key'){
  const active=c.state?.karaoke?.active;
  if(!active||!(active.user_id===c.state.self||c.state.room.host_id===c.state.self))return;
  if(c.liveKeyTurn!==active.invitation_id){c.liveKeyTurn=active.invitation_id;c.liveKeyDesired=active.key||0;}
  const key=target==='reset'?0:c.liveKeyDesired+Number(target);
  if(!Number.isInteger(key)||Math.abs(key)>8)return;
  c.liveKeyDesired=key;c.resumeSound();paintLiveKaraoke(c);
  if(c.liveKeySending)return;
  const turn=active.invitation_id;
  const current=()=>!c.closed&&c.state?.karaoke?.active?.invitation_id===turn;
  c.liveKeySending=true;
  try{
   await livePitchGraph(c);
   while(current()){
    const desired=c.liveKeyDesired;
    if(c.livePitch){c.livePitch.node.port.postMessage(desired);c.livePitch.key=desired;}
    c.acceptState(await c.command('karaoke',{operation:'key',invitation_id:turn,key:desired}));
    if(c.liveKeyDesired===desired)break;
   }
  }finally{c.liveKeySending=false;if(current()){c.liveKeyDesired=null;c.liveKeyTurn=null;}if(!c.closed)paintLiveKaraoke(c);}
  return;
 }
 if(action==='karaoke-mic-toggle'){if(isLiveSingerTurn(c))c.toggleMic();return;}
 if(action==='karaoke-monitor'){
  if(isLiveSingerTurn(c))setLiveMonitor(c,!c.liveMonitorEnabled);
  return;
 }
 if(action==='karaoke-search-open'){if(c.state?.karaoke?.active?.user_id===c.state?.self&&c.state?.self)return;c.showSheet('live-search-sheet');if(c.host.querySelector('#live-search-sheet').open)await liveSearchSongs(c);return;}
 if(action==='karaoke-resume'){
  if(c.roomAudio?.blocked&&!await c.roomAudio.resumeByUser())return;
  c.resumeSound();c.livePlayBlocked=false;if(c.liveAudio&&c.state?.karaoke?.phase==='singing'){try{await c.liveAudio.play();c.host.querySelector('#live-audio-unlock').hidden=true;}catch(e){c.livePlayBlocked=true;throw e;}}return;
 }
 if(action==='karaoke-retry'){c.liveTrack=null;const active=c.state?.karaoke?.active;if(active)livePrepareTrack(c,active);return;}
 const operation=action.slice('karaoke-'.length);
 if(!['request','cancel','call','accept','start','abandon','finish','next'].includes(operation))return;
 const sameIntent=liveMicIntent(c);
 if(['accept','start'].includes(operation)&&c.roomAudio&&!await c.roomAudio.allowCapture(true))return;
 if(['accept','start'].includes(operation)&&!sameIntent())return;
 const audioRevision=c.roomAudio?.revision;
 const captureCurrent=()=>sameIntent()&&c.roomAudio?.revision===audioRevision&&!c.roomAudio?.blocked&&!c.roomAudio?.micNeedsGesture;
 const command={operation,request_id:crypto.randomUUID()};
 if(c.liveCommandPending)return;
 if(operation==='start'&&!liveTrackReady(c))throw Error('반주를 불러온 뒤 시작해 주세요.');
 if(operation==='request')command.track_id=target;
 if(operation==='cancel'&&target)command.target_id=target;
 if(['accept','start','abandon','finish','next'].includes(operation))command.invitation_id=target||c.state?.karaoke?.active?.invitation_id;
 c.liveCommandPending=true;paintLiveKaraoke(c);
 try{
  if(operation==='start'){
   // Unlock this singer's prepared media during the actual start-button gesture.
   // The muted check is paused at zero before the server's three-second countdown.
   const prepared=c.liveAudio,volume=c.liveVolume??.75;
   c.livePriming=true;liveSetVolume(c,0);
   try{await prepared.play();prepared.pause();prepared.currentTime=0;}finally{liveSetVolume(c,volume);c.livePriming=false;}
   if(!captureCurrent())return;
  }
  const result=await c.command('karaoke',command);
  if(!c.acceptState?.(result))await c.refresh();
  if(operation==='request'){c.host.querySelector('#live-search-sheet')?.close();toast('노래를 예약했습니다.');}
 }
 finally{c.liveCommandPending=false;paintLiveKaraoke(c);}
 // Permission prompts can remain unanswered. Keep the give-up control usable.
 if(operation==='accept'&&captureCurrent()&&c.state?.karaoke?.active?.invitation_id===command.invitation_id&&c.state.karaoke.phase==='ready'){
  c.micDesired=true;await c.enableMic(false);
 }
}
function paintLiveKaraoke(c){
 const s=c.state,k=s?.karaoke;if(!s||!c.host?.isConnected)return;
 if(s.room.mode!=='karaoke')return;
 const self=s.members.find(p=>p.id===s.self),host=self?.role==='host',active=k?.active,singer=s.members.find(p=>p.id===active?.user_id);


 const current=c.host.querySelector('#live-current');
 const singerMuted=singer?.id===s.self?!roomMicIsOn(c,self):!!singer?.muted;
 const avatar=singer?roomMemberAvatar({...singer,muted:singerMuted},false,false,true):'';
 const view=singer?`<span class="room-singer-avatar"><button type="button" data-voice="talk-profile" data-target="${esc(singer.id)}" aria-label="${esc(singer.name)} 프로필">${avatar}</button>${typeof roomRelationButton==='function'?roomRelationButton(singer,s.self,true):''}</span><strong>${singer.role==='host'?'<span class="room-host-crown" aria-label="방장">'+voiceGlyph('crown')+'</span>':''}<span>${userNickname(singer.name,{profileId:singer.profile_id,userId:singer.id})}</span></strong>`:'<span>'+icon('mic')+'</span><strong>가창자 대기 중</strong>';
 if(c.liveCurrentHTML!==view){
  const identity=singer&&JSON.stringify([singer.profile_id,singer.image_version,view.replace(avatar,'')]);
  if(singer&&identity===c.liveSingerIdentity)setRoomAvatarMuted(current.querySelector('.room-member-photo'),singerMuted);
  else current.innerHTML=view;
  c.liveCurrentHTML=view;c.liveSingerIdentity=identity;
 }
 c.host.dataset.singerProfile=singer?.publishing&&!singer.muted?singer.profile_id||'':'';
 for(const btn of c.host.querySelectorAll('[data-voice="karaoke-key"]')){
  const key=c.liveKeyTurn===active?.invitation_id&&c.liveKeyDesired!=null?c.liveKeyDesired:(active?.key||0);
  btn.disabled=!active||(!host&&singer?.id!==s.self)||!!c.liveCommandPending||Math.abs(key+Number(btn.dataset.target))>8;
  if(btn.dataset.target==='reset')btn.textContent=key?(key>0?'+':'−')+Math.abs(key):'원키';
 }
 const isSinger=active?.user_id===s.self;
 c.host.dataset.livePhase=k?.phase||'idle';
 const callAction=c.host.querySelector('#room-turn-action'),starting=c.liveStartingId===active?.invitation_id;
 const startHTML=isSinger&&['invited','ready'].includes(k.phase)?`<button class="primary-button" data-voice="karaoke-begin" data-target="${esc(active.invitation_id)}" ${starting?'disabled':''}>${starting?'시작 준비 중…':'시작'}</button>`:'';
 if(callAction.innerHTML!==startHTML)callAction.innerHTML=startHTML;
 const buttons=[];
 if(isSinger&&k.phase==='singing')buttons.push(`<button type="button" data-voice="sound" aria-controls="voice-sound" aria-haspopup="dialog" aria-label="소리 설정" title="소리 설정">${voiceGlyph('talkSliders')}</button>`);
 if(isSinger&&['ready','singing'].includes(k.phase)){
  const micOn=roomMicIsOn(c,self),label=micOn?'음소거':'마이크 켜기';
  buttons.push(`<button type="button" data-voice="karaoke-mic-toggle" aria-label="${label}" title="${label}" data-on="${micOn}" aria-pressed="${micOn}" aria-busy="${!!c.micBusy}">${voiceGlyph(micOn?'talkMicOff':'talkMic')}</button>`);
 }
 if(isSinger){const pc=liveDesktopPresentation(c),label=pc?'가창 내려가기':'그만 부르기';buttons.push(`<button type="button" data-voice="karaoke-abandon" data-target="${esc(active.invitation_id)}" aria-label="${label}" title="${label}">${voiceGlyph('seatDown')}</button>`);}
 if(active&&c.liveError)buttons.push('<button type="button" data-voice="karaoke-retry">반주 다시 불러오기</button>');
 const actions=c.host.querySelector('#live-actions'),actionsHTML=buttons.join('');if(actions._roomActions!==actionsHTML){actions.innerHTML=actionsHTML;actions._roomActions=actionsHTML;}
 for(const button of c.host.querySelectorAll('#live-actions button[data-voice^="karaoke-"]'))button.disabled=!!c.liveCommandPending||(button.dataset.voice==='karaoke-mic-toggle'&&(!!c.micBusy||!!self?.locked));
 for(const button of c.host.querySelectorAll('[data-voice^="karaoke-"]'))if(c.liveCommandPending)button.disabled=true;
 const monitorToggle=c.host.querySelector('#live-monitor-toggle');
 if(monitorToggle){
  monitorToggle.disabled=!isLiveSingerTurn(c)||!!c.liveCommandPending;
  monitorToggle.setAttribute('aria-pressed',String(!!c.liveMonitorEnabled));
  monitorToggle.title=isLiveSingerTurn(c)?'이어폰으로 내 목소리를 바로 듣습니다.':'내 노래 차례에 모니터링을 켤 수 있습니다.';
  monitorToggle.querySelector('span').textContent='내 목소리 듣기 '+(c.liveMonitorEnabled?'켜짐':'꺼짐');
 }
 // Static picker/result buttons are not rebuilt with the stage controls.
 for(const button of c.host.querySelectorAll('[data-voice="karaoke-search-open"],#live-results [data-voice="karaoke-request"]'))button.disabled=!!c.liveCommandPending||isSinger;
 c.host.querySelector('#live-queue-count').textContent=(k?.queue?.length||0)+'명 대기';
 const visible=k?.queue||[];
 const queueHTML=Array.from({length:Math.max(6,visible.length)},(_,i)=>{
  const q=visible[i];
  if(!q)return `<li><span class="room-empty-order">${i+1}</span><strong>순서</strong></li>`;
  const person=s.members.find(p=>p.id===q.user_id),name=person?.name||q.name;
  return `<li class="${q.now?'is-current':''}" ${q.now?'aria-current="true"':''} title="${esc(name)} · ${esc(q.track.title)}"><button type="button" class="live-queue-avatar" data-voice="talk-profile" data-target="${esc(q.user_id)}" aria-label="${esc(name)} 프로필">${roomMemberAvatar({...person,name})}</button><strong>${person?.role==='host'?'<span class="room-host-crown" aria-label="방장">'+voiceGlyph('crown')+'</span>':''}<span>${userNickname(name,{profileId:person?.profile_id,userId:q.user_id})}</span></strong></li>`;
 }).join('');
 const queue=c.host.querySelector('#live-queue');if(c.liveQueueHTML!==queueHTML){queue.innerHTML=queueHTML;c.liveQueueHTML=queueHTML;}
 if(active)livePrepareTrack(c,active);else {if(c.liveAudio||c.liveTrack||c.liveAbort)liveStopAudio(c);c.liveError='';}
 c.host.querySelector('#live-stage-note').textContent=c.liveError||'';
 liveSync(c);
}
function liveRenderLyrics(c,seconds){
 const node=c.host?.querySelector('#live-lyrics'),lines=c.liveWords;if(!node)return;
 if(!lines?.length){const msg=c.liveError||'반주와 가사를 준비하고 있습니다.';if(node.textContent!==msg)node.textContent=msg;return;}
 const next=lines.findIndex(line=>(line.s??line.w?.[0]?.s??0)>seconds);
 const idx=next<0?lines.length-1:Math.max(0,next-1);
 const shown=liveDesktopPresentation(c)?[idx-1,idx,idx+1,idx+2,idx+3,idx+4]:[idx-1,idx,idx+1,idx+2];
 const html=shown.map(i=>`<p class="${i===idx?'is-current':''}">${(lines[i]?.w||[]).map(w=>`<span class="${seconds>=w.s?'is-sung':''}">${esc(w.t)}</span>`).join(' ')}</p>`).join('');
 if(html!==c.liveLyricHTML){node.innerHTML=html;c.liveLyricHTML=html;}
}
function liveSync(c){
 const k=c.state?.karaoke,active=k?.active;if(c.closed||!c.host?.isConnected)return;
 liveUpdatePresentation(c);
 syncRoomSingerMonitor(c);syncLiveMonitor(c);
 c.updateListening?.();liveEffectAvailability(c);
 const phase=c.host.querySelector('#live-phase'),timer=c.host.querySelector('#live-timer'),progress=c.host.querySelector('#live-progress');
 const invite=c.host.querySelector('#live-invite');
 if(invite)invite.hidden=!active||active.user_id!==c.state.self||!['invited','ready'].includes(k.phase);
 if(!active){const count=c.host.querySelector('#live-countdown');if(count)count.hidden=true;phase.textContent='가창자 대기 중';timer.textContent='0:00 / 0:00';if(progress)progress.value=0;const lyrics=c.host.querySelector('#live-lyrics');if(lyrics)lyrics.textContent='노래를 신청하면 이곳에서 가사를 함께 볼 수 있습니다.';return;}
 const now=liveNow(c),isSinger=c.state?.self===active.user_id,duration=Number.isFinite(active.track.duration)&&active.track.duration>0?active.track.duration:0;
 const waiting=k.phase!=='singing'||now<k.startsAt;
 const seconds=waiting?0:Math.max(0,Math.min(duration,(now-k.startsAt-(isSinger?0:c.liveDelayMs||0))/1000));
 if(k.phase==='invited'){
  const remaining=Math.max(0,Math.ceil((k.inviteExpiresAt-now)/1000));
  phase.textContent=remaining?'응답 대기 · '+remaining+'초':'다음 예약자로 이동 중';
  if(invite){invite.hidden=!isSinger||!remaining;invite.querySelector('#live-invite-count').textContent=remaining+'초';}
  const begin=c.host.querySelector('[data-voice="karaoke-begin"]');if(begin)begin.disabled=!remaining||c.liveStartingId===active.invitation_id;
 }else if(k.phase==='ready'){
  const remaining=Number.isFinite(k.readyExpiresAt)?Math.max(0,Math.ceil((k.readyExpiresAt-now)/1000)):null;
  phase.textContent=remaining===0?'다음 예약자로 이동 중':'마이크 준비'+(remaining===null?' 중':' · '+remaining+'초');
  if(invite){invite.hidden=!isSinger||remaining===0;invite.querySelector('#live-invite-count').textContent=(remaining??0)+'초';}
  const begin=c.host.querySelector('[data-voice="karaoke-begin"]');if(begin)begin.disabled=remaining===0||c.liveStartingId===active.invitation_id;
 }else phase.textContent=now<k.startsAt?Math.max(1,Math.ceil((k.startsAt-now)/1000))+'초 뒤 시작':'노래하는 중 · LIVE';
 timer.textContent=time(seconds)+' / '+time(duration);if(progress){progress.max=duration;progress.value=seconds;}
 const audio=c.liveAudio;
 if(c.roomAudio?.blocked)c.roomAudio.quietElement(audio);
 if(audio&&!c.livePriming&&!c.roomAudio?.blocked){
  const key=c.liveKeyTurn===active.invitation_id&&c.liveKeyDesired!=null?c.liveKeyDesired:(active.key||0);
  if(!c.livePitch&&!c.livePitchPending&&!c.livePitchError){
   livePitchGraph(c).catch(e=>{c.livePitchError=e.message;c.status?.(e.message);});
  }
  if(c.livePitch&&c.livePitch.key!==key){c.livePitch.node.port.postMessage(key);c.livePitch.key=key;}
  // Do not play an unshifted accompaniment while the singer is in a different key.
  liveSetVolume(c,key&&!c.livePitch?0:(c.liveVolume??.75));
  if(waiting||seconds<=0){if(!audio.paused)audio.pause();if(audio.readyState>=1&&audio.currentTime>.1)audio.currentTime=0;}
  else{
   // Seek once at entry or foreground recovery, not on every 200ms UI tick.
   const fresh=c.livePlaybackTurn!==active.invitation_id||c.liveNeedsResync;
   if(audio.readyState>=1&&fresh){if(Math.abs(seconds-audio.currentTime)>.5)audio.currentTime=Math.min(seconds,Math.max(0,duration-.1));c.livePlaybackTurn=active.invitation_id;c.liveNeedsResync=false;c.liveLastSync=now;}
   else if(!audio.paused&&!audio.seeking&&audio.readyState>=3&&now-(c.liveLastSync||0)>10000){c.liveLastSync=now;if(Math.abs(seconds-audio.currentTime)>1.5)audio.currentTime=Math.min(seconds,Math.max(0,duration-.1));}
   if(audio.paused&&!audio.ended&&!c.livePlayBlocked&&!c.livePlayPending){c.livePlayPending=true;audio.play().then(()=>{const btn=c.host?.querySelector('#live-audio-unlock');if(btn)btn.hidden=true;}).catch(()=>{c.livePlayBlocked=true;const btn=c.host?.querySelector('#live-audio-unlock');if(btn)btn.hidden=false;}).finally(()=>{c.livePlayPending=false;});}
  }
 }
 const audible=audio&&k.phase==='singing'&&!waiting?Math.max(0,audio.currentTime-(c.livePitchLatency||0)):seconds;
 liveRenderLyrics(c,audible);
 const countdown=c.host.querySelector('#live-countdown');
 if(countdown){
  if(c.liveStartClock?.turn!==active.invitation_id&&k.phase==='singing')c.liveStartClock={turn:active.invitation_id,at:(c.levelContext?.currentTime||0)+Math.max(0,(k.startsAt-now)/1000)};
  const first=c.liveWords?.[0]?.w?.[0]?.s||0;
  const pc=c.host.hasAttribute?.('data-room-pc-controls');
  const left=pc?(k.startsAt-now)/1000:waiting&&k.phase==='singing'?(c.levelContext?.state==='running'?c.liveStartClock.at-c.levelContext.currentTime:(k.startsAt-now)/1000):first-audible;
  countdown.hidden=k.phase!=='singing'||!(left>0&&left<=3);
  if(!countdown.hidden){
   const beat=String(Math.ceil(left));
   if(pc){countdown.dataset.beats=beat;countdown.removeAttribute('data-ending');}
   countdown.querySelector('strong').textContent=beat;countdown.querySelector('circle').style.strokeDashoffset=String(100*(1-left/3));
  }
 }
 if(audio&&k.phase==='singing'&&!waiting){timer.textContent=time(audible)+' / '+time(duration);if(progress)progress.value=audible;}
 if(c.liveError)c.host.querySelector('#live-stage-note').textContent=c.liveError;
}

const productionVoiceView=voiceView;
voiceView=async function(base,id,signal){
 if(base!=='live')return productionVoiceView(base,id,signal);
 if(id){if(!me)return {html:heading('라이브 노래방')+gate()};return {html:liveKaraokeRoomHTML(id)};}
 return {html:liveDirectoryHTML('karaoke'),liveLobby:true};
};
const productionCleanupVoiceRoute=cleanupVoiceRoute;
cleanupVoiceRoute=function(base,id){
 if(base!=='live')return productionCleanupVoiceRoute(base,id);
 const valid=!!me&&voiceController&&voiceController.id===id&&!voiceController.closed;
 setVoiceFocus(!!valid&&!!voiceController.joined);
 if(voiceController&&!valid){
  const work=voiceController.leave();voiceController=null;return work;
 }
};
const productionBindVoice=bindVoice;
bindVoice=function(base,id){
 if(base!=='live')return productionBindVoice(base,id);
 if(!id){bindVoiceLobby();return;}
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
  bindLiveVocalSettings(this);
  this.livePageHide ||= ()=>{this.liveAudio?.pause();this.liveNeedsResync=true;};window.addEventListener('pagehide',this.livePageHide);
  const retry=host.querySelector('#voice-join');if(retry)retry.onclick=()=>{if(this.closed){voiceController=new VoiceRoomClient(this.id);voiceController.liveMode=true;voiceController.bind(host);}else this.safe(()=>this.join());};
 }
 return result;
};
const productionVoicePaint=VoiceRoomClient.prototype.paint;
VoiceRoomClient.prototype.paint=function(){
 const mode=this.state?.room?.mode;
 if(!this.closed&&this.joined&&mode&&((mode==='karaoke')!==!!this.liveMode)&&this===voiceController){
  const nextRoute=(mode==='karaoke'?'live/':'voice/')+this.id;
  const oldRoute=(this.liveMode?'live/':'voice/')+this.id;
  if(location.hash.split('?')[0]!=='#'+oldRoute)return;
  // A mode is a view of the same membership, not a new room session.
  // The server clears its queue/seat publishers; retain the listener, socket,
  // heartbeat, generation and audio context and retire only local mode resources.
  const template=document.createElement('template');
  template.innerHTML=mode==='karaoke'?liveKaraokeRoomHTML(this.id):voiceRoomHTML(this.id);
  const host=template.content.firstElementChild;
  if(!host)throw Error('방 화면을 전환하지 못했습니다. 다시 시도해 주세요.');
  const draft=this.chatEditor?.get()||'';
  this.micDesired=false;this.micAttempt++;this.micBusy=false;
  this.stopMicrophone();this.stopMicTest();this.micState='muted';this.warmSeat=this.generation;
  disconnectLiveMonitor(this);liveStopAudio(this);clearInterval(this.liveTimer);
  window.removeEventListener('pagehide',this.livePageHide);
  this.musicAudio?.pause();this.searchAbort?.abort();this.liveSearchAbort?.abort();
  clearTimeout(this.searchTimer);this.searchSerial=(this.searchSerial||0)+1;
  clearTimeout(this.volumeTimer);clearTimeout(this.roomShareTimer);this.roomShareAbort?.abort();
  this.liveSearchSerial=(this.liveSearchSerial||0)+1;
  this.roomDM?.destroy();this.roomDM=null;this.closeRoomPopup();this.releaseRoomExternal();
  this.host.replaceWith(host);this.liveMode=mode==='karaoke';
  for(const key of ['seatHTML','listenerHTML','talkRequestKey','talkThemeKey','memberHTML','musicHTML','liveCurrentHTML','liveQueueHTML','liveLyricHTML'])this[key]=null;
  history.replaceState(history.state,'','#'+nextRoute);
  document.querySelector('#main').dataset.route=nextRoute;
  this.bind(host);this.chatEditor.set(draft);
  this.onViewport?.();
  return;
 }
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
  if(action==='copy-link'){await navigator.clipboard.writeText(location.origin+'/#live/'+this.id);toast('초대 링크를 복사했습니다.');return;}
  if(action==='music-picker')return;
  if(action?.startsWith('karaoke-')){this.actionTrigger=button;return liveKaraokeAction(this,action,target);}

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

// A singer's new server-confirmed turn enables local monitoring once. UI repaints
// and reopening settings never override the singer's subsequent choice.
function syncRoomSingerMonitor(c){
 if(c.roomAudio?.blocked){disconnectLiveMonitor(c);return;}
 const k=c.state?.karaoke,turn=k?.phase==='singing'&&k.active?.user_id===c.state.self?k.active.invitation_id:null;
 if(turn&&turn!==c.liveMonitorTurn){c.liveMonitorTurn=turn;c.liveMonitorEnabled=true;const el=c.host?.querySelector('#voice-monitor');if(el)el.checked=true;}
 if(!isLiveSingerTurn(c)){c.liveMonitorEnabled=false;const el=c.host?.querySelector('#voice-monitor');if(el)el.checked=false;disconnectLiveMonitor(c);}
}
