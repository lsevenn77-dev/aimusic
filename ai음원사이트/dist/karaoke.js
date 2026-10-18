// Native bridge and browser recorder share the same song/MR permissions and cover upload API.
let sing=null,routeSing=null;
const K=()=>window.AifectKaraoke;
function studioIcon(name){const path={stop:'M6 6h12v12H6Z',pause:'M8 5v14M16 5v14',check:'m5 12 4 4 10-10',original:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M6 6l12 12',hall:'M4 20V4h16v16M8 4v16M16 4v16M3 20h18M8 8h8',headphones:'M4 13v-1a8 8 0 0 1 16 0v1M4 12H2v8h4v-8Zm16 0h2v8h-4v-8Z'}[name];return path?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>':icon(name);}
const nativeSinging=()=>window.Capacitor?.isNativePlatform?.()&&window.Capacitor.Plugins?.AifectKaraoke;
const singBusy=s=>['loading','stopping','exporting','rendering'].includes(s?.state);
const singLive=s=>['singing','preroll'].includes(s?.state);
function singRouteHref(s){const q=new URLSearchParams();if(s.parent)q.set('duet',s.parent);else if(s.mode==='duet'){q.set('mode','duet');q.set('part',s.part||'male');}return '#sing/'+encodeURIComponent(s.id)+(q.size?'?'+q:'');}
async function loadSingRoute(trackId,q){const parent=q.get('duet'),d=await api(parent?'/api/duets/'+encodeURIComponent(parent):'/api/karaoke/'+encodeURIComponent(trackId));if(d.track?.id!==trackId||parent&&d.duet?.parent_id!==parent)throw new Error('참여할 듀엣을 확인하지 못했어요. 듀엣 참여에서 다시 열어주세요.');return {...d,mode:parent||q.get('mode')==='duet'?'duet':'solo',part:d.duet?.part||(q.get('part')==='female'?'female':'male')};}
function releaseRun(run){
 if(!run)return;run.src.onended=null;try{run.src.stop();}catch{}
 run.stream?.getTracks().forEach(t=>t.stop());for(const n of [run.mic,run.node,run.mute,run.monitor,run.gain,run.voiceGain,...(run.effects||[])])try{n?.disconnect();}catch{}
}
function cleanupSing(){
 const s=sing;if(!s)return;if(($('#dialog').classList.contains('record-settings-dialog')||$('#dialog').classList.contains('duet-editor-dialog')))$('#dialog').close();sing=null;s.abort?.abort();clearTimeout(s.scrollTimer);clearTimeout(s.draftTimer);cancelAnimationFrame(s.frame);
 cancelKeyProcessing(s);cancelVocalEffects(s);if($('#dialog')?.classList.contains('punch-complete-dialog'))$('#dialog').close();stopStandbyMonitor(s);releaseRun(s.run);s.preview?.forEach(n=>{try{n.stop();}catch{}});s.wake?.release?.().catch(()=>{});s.ctx?.close().catch(()=>{});
}
function karaokeListHTML(tracks,duets=[]){
 remember([...tracks,...duets]);return '<a class="small-button" href="#karaoke/drafts">초안</a>'+duetLobbyHTML(duets)+heading('노래방','마이크와 이어폰을 준비하고 MR·가사와 함께 불러보세요.')+(tracks.length?`<div class="track-list">${tracks.map((t,i)=>`<div class="live-track"><span class="track-rank">${i+1}</span>${cover(t,'mini-cover')}<div class="track-info"><a href="#song/${t.id}"><strong>${esc(t.title)}</strong></a><span>${credits(t)}</span></div><span class="track-time">${time(t.duration)}</span><a class="small-button" href="#sing/${t.id}">${icon('mic')} 부르기</a></div>`).join('')}</div>`:'<p class="surface empty-note">아직 부를 수 있는 곡이 없어요.</p>');
}
function singHTML(d){
 const t=d.track;
 return `<section class="surface sing web-studio" id="sing">
 <header class="sing-head"><div class="studio-song-meta"><h1>${esc(t.title)}</h1><p>${esc(t.artist)} <span>·</span> ${esc(t.genre||'음악')} <span>·</span> ${time(t.duration)} <span>·</span> <small data-recording-key>원곡 키</small></p></div><div class="sing-header-mode">${singModeHTML(d)}</div></header>
 ${d.duet?`<div class="sing-duet-context"><span>${icon('users')}</span><div><strong>듀엣 참여 · 내 파트 녹음</strong><p><a href="#producer/${esc(d.duet.partner.producer_id)}">${esc(d.duet.partner.producer)}</a>님의 녹음에 이어 부릅니다. 상대 목소리와 반주가 함께 재생돼요.</p></div></div>`:''}
 <div class="sing-recording"><div id="duet-guide"></div>
 <div class="sing-wheel" id="sing-wheel" aria-label="가사와 녹음 위치" tabindex="0">${(d.words||[]).map((line,i)=>`<button type="button" data-sing-line="${i}" data-second="${line.s}" aria-label="${time(line.s)} ${esc(line.w.map(w=>w.t).join(' '))}"><small>${time(line.s)}</small><span class="sing-line-text">${line.w.map((w,j)=>`<span data-word="${j}">${esc(w.t)}</span>`).join(' ')}</span></button>`).join('')||'<p class="field-help">싱크 가사가 없는 곡이에요. 아래 막대로 부를 위치를 골라주세요.</p>'}</div>
 <div class="sing-progress"><span id="sing-now">0:00</span><input class="sing-seek" id="sing-seek" type="range" min="0" max="${t.duration}" step=".05" value="0" aria-label="노래 위치"><span id="sing-duration">${time(t.duration)}</span></div>
 <div class="sing-transport studio-transport"><button type="button" data-monitor-toggle aria-pressed="false">${studioIcon('headphones')}<span>모니터링</span></button><button type="button" data-sing-settings>${icon('sliders')}<span>믹서</span></button><div class="studio-record-slot"><button type="button" data-sing-start class="studio-record">${icon('mic')}<span>녹음 시작</span></button></div><button type="button" data-sing-stop disabled>${studioIcon('stop')}<span>녹음 완료</span></button><button type="button" data-sing-redo-live>${icon('restart')}<span>다시 시작</span></button></div>
 <button type="button" class="small-button" data-sing-review hidden>편집 화면으로 돌아가기</button><p class="studio-position-help">가사를 위아래로 움직이거나 눌러 부를 위치를 선택하세요.</p></div>
 <aside id="sing-live-settings" class="studio-sidebar" aria-label="녹음 설정">${liveStudioSettingsHTML(K().defaultVocalMix())}</aside>
 <p class="sing-status" id="sing-status" role="status">${d.duet?'파트너 녹음을 먼저 듣고, 내 파트를 이어 불러주세요.':'가사를 확인하고 녹음을 시작하세요.'}</p><div id="sing-panel">${singStartHTML()}</div>
 <p class="field-help sing-local-note">녹음과 효과는 이 기기의 초안에 보관됩니다.</p></section>`;
}
function liveStudioSettingsHTML(m){return `<section class="studio-setting-card"><h2>${studioIcon('headphones')} 오디오 설정</h2>${studioRangeHTML(m,'voice','마이크 볼륨',0,2,.01)}${studioRangeHTML(m,'mr','반주 볼륨',0,1.5,.01)}<label class="sing-monitor"><span>이어폰 모니터링<small>내 목소리를 실시간으로 듣기</small></span><input id="sing-monitor" type="checkbox" role="switch" aria-label="이어폰으로 내 목소리 듣기"></label></section><section class="studio-setting-card"><h2>${icon('list')} 노래 설정</h2>${singingKeyHTML()}<div class="studio-size"><span>가사 크기</span>${lyricSizeControlsHTML()}</div></section>${spaceEffectsHTML(m)}<p class="studio-side-note">이어폰을 연결하면 반주가 마이크에 섞이지 않아요.</p>`;}
function spaceEffectsHTML(m){return `<section class="studio-setting-card studio-space"><h2>${icon('sparkles')} 공간 효과</h2><div class="studio-space-presets" role="group" aria-label="목소리 효과 선택">${[['studio','스튜디오'],['hall','홀'],['karaoke','노래방'],['custom','사용자 설정']].map(([id,name])=>vocalPresetButtonHTML(id,name,m.preset===id)).join('')}</div><div class="studio-extra-presets">${vocalPresetButtonHTML('original','원음',m.preset==='original')}</div><p class="field-help" data-preset-description></p><div data-preset-strength>${studioRangeHTML(m,'strength','효과 강도',0,1,.01)}</div><details class="sing-effect-details" data-custom-controls><summary>사용자 설정</summary>${studioRangeHTML(m,'echo','에코 효과',0,.65,.001)}${studioRangeHTML(m,'size','룸 크기',0,1,.01)}${studioRangeHTML(m,'room','리버브 강도',0,1,.01)}</details></section>`;}
const singStartHTML=(message='')=>`<p class="field-help">${nativeSinging()?'에코 · 룸 리버브와 실시간 이어폰 청음을 지원해요. 유선·USB 이어폰을 권장해요.':'유선·USB 이어폰을 권장해요. 스피커의 반주가 마이크에 섞이면 싱크 확인이 어려워요.'}</p>${message?`<p class="form-error">${esc(message)}</p>`:''}${nativeSinging()?`<button class="primary-button" data-sing-start>${icon('mic')} 노래방 열기</button>`:''}`;
function bindSing(id){
 cleanupSing();if(!$('#sing')||!routeSing)return;
 sing={id,owner:me?.id,data:routeSing,state:'loading',cursor:0,keySemitones:0,mix:K().defaultVocalMix(),mode:routeSing.mode||'solo',part:routeSing.part||'male',parent:routeSing.duet?.parent_id||null};if(sing.parent)sing.mix.mr=1;sing.duetGuide=sing.parent?routeSing.duet?.guide||null:{version:1,mode:'free',lines:[]};
 const s=sing,wheel=$('#sing-wheel'),seek=$('#sing-seek');
 document.querySelectorAll('[data-sing-mode]').forEach(button=>button.onclick=async()=>{
  const mode=button.dataset.singMode;if(sing!==s||singBusy(s)||singLive(s)||s.parent||mode===s.mode)return;
  try{stopPreview();await saveSingDraft(s);if(sing===s)location.hash='sing/'+encodeURIComponent(s.id)+'?mode='+mode;}catch{setSingStatus('녹음을 임시저장하지 못했어요. 다시 시도해주세요.');}
 });
 const begin=()=>{if(sing!==s||singBusy(s)||s.scrubbing)return;s.scrubbing=true;s.resumeMode=singLive(s)?'record':s.state==='playing'?'play':s.state==='guide'?'guide':s.state==='backing'?'backing':null;s.settling=singLive(s)?finishSinging():Promise.resolve();if(s.preview)stopPreview();};
 const select=t=>{if(sing!==s)return;begin();s.cursor=clampPosition(t,s.resumeMode==='play');drawLyrics(s.cursor,false);};
 const end=async()=>{
  if(!s.scrubbing)return;const target=s.cursor,mode=s.resumeMode;s.scrubbing=false;await s.settling;if(sing!==s||s.scrubbing)return;s.cursor=target;drawLyrics(target);if(document.hidden)return;
  if(mode==='record')startSinging();else if(mode==='play')previewMix(target);else if(mode==='guide')previewGuide(target);else if(mode==='backing')toggleBackingPreview();
 };
 seek.addEventListener('pointerdown',begin);seek.addEventListener('input',()=>select(Number(seek.value)));seek.addEventListener('change',end);seek.addEventListener('pointercancel',end);
 const nearest=()=>{const rows=[...wheel.querySelectorAll('[data-second]')],anchor=wheel.scrollTop+wheel.clientHeight*.35;return rows.reduce((best,r)=>!best||Math.abs(r.offsetTop+r.offsetHeight/2-anchor)<Math.abs(best.offsetTop+best.offsetHeight/2-anchor)?r:best,null);};
 const settle=()=>{clearTimeout(s.scrollTimer);s.scrollTimer=setTimeout(()=>{if(s.scrubbing&&!s.pointer){const row=nearest();if(row)select(Number(row.dataset.second));end();}},170);};
 wheel.addEventListener('pointerdown',()=>{if(singBusy(s))return;s.pointer=true;begin();});
 wheel.addEventListener('pointerup',()=>{s.pointer=false;settle();});wheel.addEventListener('pointercancel',()=>{s.pointer=false;settle();});
 wheel.addEventListener('wheel',()=>{begin();settle();},{passive:true});
 wheel.addEventListener('scroll',()=>{if(s.scrubbing){const row=nearest();if(row)select(Number(row.dataset.second));settle();}},{passive:true});
 wheel.addEventListener('click',e=>{const row=e.target.closest('[data-second]');if(row){clearTimeout(s.scrollTimer);s.pointer=false;select(Number(row.dataset.second));end();}});
 wheel.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const lines=s.data.words,i=K().wordAt(lines,s.cursor).line,j=Math.max(0,Math.min(lines.length-1,i+(e.key==='ArrowDown'?1:-1)));if(lines[j]){select(lines[j].s);end();}});
 $('#sing-monitor').onchange=e=>setMonitorEnabled(e.target.checked);$('[data-monitor-toggle]').onclick=()=>setMonitorEnabled(!$('#sing-monitor').checked);
 document.querySelectorAll('button[data-lyric-size]').forEach(button=>button.onclick=()=>applyLyricSize(button.dataset.lyricSize));applyLyricSize(preferredLyricSize());
 // The favorite uses the shared data-like handler, so it is saved to the account.
 const redoLive=$('[data-sing-redo-live]');if(redoLive)redoLive.onclick=async()=>{if(singLive(s))await finishSinging();if(sing!==s)return;s.punchRange=null;s.editingRecording=true;s.cursor=0;s.shownLine=-1;updateTransport();drawLyrics(0);setSingStatus('처음부터 다시 시작할 준비가 됐어요.');};
 bindKeyControls();renderDuetGuide();drawLyrics(0);renderSingPanel();if(new URLSearchParams(location.hash.split('?')[1]||'').get('draft')==='1')void restoreSingDraft(s);else{s.state='idle';updateTransport();}
}
function setSingStatus(message){const el=$('#sing-status');if(el)el.textContent=message;}
function clampPosition(t,review=false){return Math.max(0,Math.min(t,review&&sing.voice&&sing.mode!=='duet'?sing.voice.duration:sing.mr?.duration||sing.data.track.duration));}
function updateTransport(){
 if(!sing)return;const s=sing,locked=singBusy(s),live=singLive(s),reviewing=!!s.voice&&!s.editingRecording&&!live;
 document.querySelectorAll('[data-sing-preview]').forEach(b=>b.disabled=locked||live||!s.voice||s.state==='playing');
 document.querySelectorAll('[data-sing-pause]').forEach(b=>b.disabled=locked||!(live||s.preview));
 document.querySelectorAll('[data-sing-start],[data-sing-save],[data-sing-mode],#sing-upload-form button,[data-duet-method],[data-duet-reanalyze],[data-duet-line],[data-duet-editor]').forEach(b=>b.disabled=locked||live);
 document.querySelectorAll('[data-range],[data-start-punch],[data-preview-selection],[data-reset-mix],[data-apply-mix],[data-sync-step],[data-sync-reset],[data-edit-tool]').forEach(b=>b.disabled=locked||live);
 $('#sing').classList.toggle('is-reviewing',reviewing);$('#sing').classList.toggle('is-live',live);$('#sing').classList.toggle('is-idle',!live&&!reviewing);
 $('.sing-recording').hidden=reviewing;$('#sing-live-settings').hidden=reviewing;$('#sing-panel').hidden=!!s.voice&&!reviewing;$('[data-sing-review]').hidden=!s.voice;
 const player=$('.studio-audio');if(player){player.querySelector('[data-sing-preview]').hidden=s.state==='playing';player.querySelector('[data-sing-pause]').hidden=s.state!=='playing';}
 $('#sing-seek').disabled=locked;const start=$('.sing-transport [data-sing-start]'),stop=$('.sing-transport [data-sing-stop]');if(start){start.hidden=false;start.disabled=locked;start.innerHTML=live?studioIcon('pause')+'<span>일시정지</span>':icon('mic')+'<span>'+(s.voice?'이어 부르기':s.parent?'내 파트 녹음':'녹음 시작')+'</span>';}if(stop){stop.hidden=false;stop.disabled=locked||!(live||s.voice);}
 if(reviewing){s.monitorSerial=(s.monitorSerial||0)+1;stopStandbyMonitor(s);$('#sing-monitor').checked=false;document.querySelectorAll('[data-monitor-toggle]').forEach(b=>b.setAttribute('aria-pressed','false'));}document.querySelectorAll('[data-monitor-toggle],#sing-monitor').forEach(b=>b.disabled=locked);refreshEffectControls();updateKeyControls();
}
async function prepareSing(s){const ctx=await prepareSingAudio(s);await prepareKeyBacking(s);return ctx;}
async function prepareSingAudio(s){
 if(s.audioPreparation)return s.audioPreparation;
 const work=loadSingAudio(s);s.audioPreparation=work;try{return await work;}finally{if(s.audioPreparation===work)s.audioPreparation=null;}
}
async function loadSingAudio(s){
 const ctx=await prepareVocalContext(s);
 if(!s.mr){s.abort=new AbortController();const r=await fetch(s.data.mr,{credentials:'same-origin',signal:s.abort.signal});if(!r.ok)throw new Error('반주를 불러오지 못했어요. 다시 로그인하고 시도해주세요.');s.mr=await ctx.decodeAudioData(await r.arrayBuffer());}
 if(s.mr.duration>600)throw new Error('10분 이하 곡만 녹음할 수 있어요.');
 return ctx;
}
async function resumeSingContext(s){
 if(!window.AudioContext&&!window.webkitAudioContext)throw new Error('이 브라우저는 녹음을 지원하지 않아요. 최신 브라우저에서 열어주세요.');
 const ctx=s.ctx||(s.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:K().MIX_RATE,latencyHint:'interactive'}));
 // Call resume in the button gesture, before timers, permission prompts or downloads.
 return ctx.resume().then(()=>ctx);
}
async function prepareVocalContext(s){
 const ctx=await resumeSingContext(s);
 if(!s.vocalWorklet){
  s.vocalPreparation||=ctx.audioWorklet.addModule('/vocal-worklet.js?v=20261017-tone-range');
  try{await s.vocalPreparation;s.vocalWorklet=true;}finally{s.vocalPreparation=null;}
 }
 return ctx;
}
async function startSinging(){
 if(!sing||singBusy(sing)||singLive(sing))return;
 const partIssue=duetAssignmentIssue(sing);if(partIssue){setSingStatus(partIssue);openDuetEditor();return;}
 if(nativeSinging()){
  const s=sing;++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';$('#sing-panel').innerHTML='<p class="field-help">노래방을 열고 있어요…</p>';
  try{const result=await nativeSinging().open({trackId:s.id,coverMode:s.mode,duetPart:s.part,duetParentId:s.parent||''});if(result.uploadedId){if(sing===s)cleanupSing();toast('커버곡을 올렸어요! 변환이 끝나면 공개돼요.');location.hash='studio';return;}if(sing===s){s.state='idle';$('#sing-panel').innerHTML=singStartHTML();}}
  catch(e){if(sing===s){s.state='idle';$('#sing-panel').innerHTML=singStartHTML(e.message||'노래방을 열지 못했어요.');}}return;
 }
 const s=sing;let stream,run;stopPreview();s.monitorSerial=(s.monitorSerial||0)+1;stopStandbyMonitor(s);++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';updateTransport();setSingStatus('반주와 마이크를 준비하고 있어요…');
 try{
  if(!window.AudioContext&&!window.webkitAudioContext)throw new Error('이 브라우저는 녹음을 지원하지 않아요.');
  const context=s.ctx||(s.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:K().MIX_RATE,latencyHint:'interactive'}));const resume=context.resume();
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('마이크를 사용할 수 없는 브라우저예요. HTTPS 주소에서 최신 브라우저로 열어주세요.');
  // Request only after the user starts recording. A denied request cannot start an MR or leave a live mic.
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  if(sing!==s){stream.getTracks().forEach(t=>t.stop());return;}
  await resume;const ctx=await prepareSing(s);if(ctx.state!=='running')throw new Error('오디오가 일시정지됐어요. 노래 시작을 다시 눌러주세요.');
  if(!stream.getAudioTracks().some(t=>t.readyState==='live'&&t.enabled))throw new Error('사용 가능한 마이크 입력이 없어요. 브라우저의 마이크 장치를 확인해주세요.');
  if(sing!==s||document.hidden)throw new Error('화면으로 돌아와 노래 시작을 눌러주세요.');
  if(!s.worklet){
   await ctx.audioWorklet.addModule('/recorder-worklet.js?v=20260929');s.worklet=true;
  }
  if(sing!==s||document.hidden)throw new Error('화면으로 돌아와 다시 시작해주세요.');
  const recordAt=clampPosition(s.cursor),from=Math.max(0,recordAt-3);if(recordAt>=s.mr.duration-.05)throw new Error('곡이 끝났어요. 가사를 움직여 다시 부를 위치를 골라주세요.');
  const mic=ctx.createMediaStreamSource(stream),node=new AudioWorkletNode(ctx,'aifect-recorder',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'}),mute=ctx.createGain(),monitor=ctx.createGain(),src=ctx.createBufferSource(),chunks=[];
  run={stream,mic,node,mute,monitor,src,chunks,recordAt,from,punchRange:s.punchRange?{...s.punchRange}:null,t0:ctx.currentTime+.15};s.run=run;
  mute.gain.value=0;monitor.gain.value=$('#sing-monitor').checked ? 1 : 0;mic.connect(node);node.connect(mute).connect(ctx.destination);monitor.connect(ctx.destination);run.voiceGain=ctx.createGain();run.voiceGain.gain.value=s.mix.voice;run.voiceGain.connect(monitor);run.effects=connectEffects(ctx,mic,run.voiceGain,s.mix);
  node.port.onmessage=e=>{if(e.data==='done')run.flushed?.();else if(e.data?.d instanceof Float32Array){chunks.push(e.data);run.peak=Math.max(run.peak||0,e.data.peak||0);const meter=$('#mic-level');if(meter)meter.value=Math.min(1,(e.data.peak||0)*4);}};
  src.buffer=backingBuffer(s);const gain=ctx.createGain();run.gain=gain;gain.gain.value=s.mix.mr;src.connect(gain).connect(ctx.destination);src.start(run.t0,from,(run.punchRange?.end||s.mr.duration)-from);
  stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(sing===s&&singLive(s)){finishSinging();}}));
  s.state=from<recordAt?'preroll':'singing';s.dirty=true;s.revision=(s.revision||0)+1;src.onended=()=>{if(sing===s&&singLive(s)){s.editingRecording=!!run.punchRange;finishSinging({offerPunchChoice:!!run.punchRange});}};
  $('#sing-panel').innerHTML='';bindMixControls();updateTransport();
  try{s.wake=await navigator.wakeLock?.request('screen');if(sing!==s||!singLive(s))s.wake?.release?.().catch(()=>{});}catch{}
  const tick=()=>{if(sing!==s||!singLive(s))return;const t=Math.min(run.punchRange?.end||s.mr.duration,from+Math.max(0,ctx.currentTime-run.t0));s.state=t<recordAt?'preroll':'singing';s.cursor=t;setSingStatus(t<recordAt?`반주 먼저 듣기 · ${Math.ceil(recordAt-t)}초 뒤 녹음 시작`:'녹음 중 · 가사를 밀면 그 위치부터 다시 불러요.');drawLyrics(t<recordAt?recordAt:t);s.frame=requestAnimationFrame(tick);};tick();
 }catch(e){releaseRun(run);stream?.getTracks().forEach(t=>t.stop());if(sing===s){s.run=null;s.state=s.voice?'review':'idle';renderSingPanel();setSingStatus(e.name==='NotAllowedError'?'마이크 권한을 허용한 뒤 다시 시작해주세요.':e.message||'녹음을 시작하지 못했어요.');}}
}
function drawLyrics(t,follow=true){
 if(!sing)return;const s=sing,review=s.state==='playing'||s.state==='review',duration=review&&s.voice&&s.mode!=='duet'?s.voice.duration:s.mr?.duration||s.data.track.duration,at=K().wordAt(s.data.words||[],t);
 $('#sing-now').textContent=time(Math.max(0,t));document.querySelectorAll('[data-review-now]').forEach(v=>v.textContent=time(Math.max(0,t)));const reviewSeek=$('.studio-wave-seek');if(reviewSeek)reviewSeek.value=t;drawTakeWaveform();$('#sing-duration').textContent=time(duration);const seek=$('#sing-seek');seek.max=duration;seek.value=Math.min(duration,Math.max(0,t));seek.style.setProperty('--position',(100*Number(seek.value)/Math.max(1,duration))+'%');seek.classList.toggle('duet-seek',s.mode==='duet');
 const wheel=$('#sing-wheel'),row=wheel.querySelector(`[data-sing-line="${at.line}"]`);
 wheel.querySelectorAll('[data-sing-line]').forEach(el=>{el.classList.toggle('current',el===row);el.setAttribute('aria-current',el===row?'true':'false');if(el!==row)el.querySelectorAll('.sung,.singing').forEach(word=>{word.classList.remove('sung','singing');word.style.removeProperty('--p');});});
 row?.querySelectorAll('[data-word]').forEach((el,i)=>{el.classList.toggle('sung',i<at.word);el.classList.toggle('singing',i===at.word);el.style.setProperty('--p',i===at.word?at.progress:0);});
 if(follow&&!s.scrubbing&&at.line!==s.shownLine){s.shownLine=at.line;if(row)wheel.scrollTop=Math.max(0,row.offsetTop+row.offsetHeight/2-wheel.clientHeight*.35);}
}
async function finishSinging({offerPunchChoice=false}={}){
 const s=sing;if(!singLive(s))return;const run=s.run,ctx=s.ctx,end=Math.min(run.punchRange?.end||s.mr.duration,run.from+Math.max(0,ctx.currentTime-run.t0));s.state='stopping';cancelAnimationFrame(s.frame);updateTransport();setSingStatus('녹음한 구간을 정리하고 있어요…');
 run.src.onended=null;try{run.src.stop();}catch{}run.monitor.gain.value=0;
 await new Promise(resolve=>{const timer=setTimeout(resolve,600);run.flushed=()=>{clearTimeout(timer);resolve();};run.node.port.postMessage('stop');});releaseRun(run);s.wake?.release?.().catch(()=>{});
 if(sing!==s)return;
 if(end>run.recordAt+.1&&!run.chunks.length){s.run=null;s.state=s.voice?'review':'idle';renderSingPanel();setSingStatus('마이크 입력을 받지 못했어요. 브라우저의 마이크 장치를 확인해주세요. 기존 녹음은 보존했어요.');return;}
 const merge=run.punchRange?K().replaceTakeRange:K().mergeTake;const samples=merge(s.voice?.getChannelData(0),run.chunks,run.t0+run.recordAt-run.from,ctx.sampleRate,run.recordAt,end);
 if(samples.length){s.voice=ctx.createBuffer(1,samples.length,ctx.sampleRate);s.voice.copyToChannel(samples,0);s.processed=null;}
 s.run=null;if(run.punchRange){s.editingRecording=offerPunchChoice;s.punchRange=null;}refreshVocalGuide(s);renderDuetGuide();s.cursor=offerPunchChoice?end:s.voice?.duration||run.recordAt;s.state=s.voice?'review':'idle';renderSingPanel();drawLyrics(s.cursor);setSingStatus(s.voice?`${time(s.voice.duration)} 녹음했어요. 들어보고 싱크·효과를 조절하세요.`:'녹음 시작 전에 멈췄어요. 기존 녹음은 그대로예요.');
 if(offerPunchChoice&&run.punchRange&&s.voice)showPunchComplete(s,run.punchRange);
 if(s.voice){try{await saveSingDraft(s);}catch{setSingStatus('녹음은 남아 있지만 임시저장하지 못했어요. 저장 공간을 확인해주세요.');}if((run.peak||0)<.00001)setSingStatus('마이크 소리가 감지되지 않았어요. 선택한 마이크와 음소거 설정을 확인하고 다시 불러주세요.');}
}
function studioRangeHTML(m,key,label,min,max,step,unit='%'){
 return `<label class="studio-range"><span><b class="studio-control-name">${['voice','mr','size','echo','room'].includes(key)?studioControlIcon(key):''}${label}</b><output data-mix-label="${key}">${mixLabel(key,m[key])}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${m[key]}" data-mix="${key}" aria-label="${label}"></label>`;
}
function studioControlIcon(key){const shape={voice:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',mr:'<path d="M9 18V5l12-3v13M9 8l12-3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="15" r="3"/>',size:'<path d="M12 2 3 7v10l9 5 9-5V7ZM3 7l9 5 9-5M12 12v10"/>',echo:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',room:'<path d="M4 9v6M8 5v14M12 2v20M16 5v14M20 9v6"/>'}[key]||'';return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">'+shape+'</svg>';}
function soundControlHTML(m,review=false){if(review)return '<div class="studio-sound">'+studioRangeHTML(m,'voice','내 목소리',0,2,.01)+studioRangeHTML(m,'mr',sing?.parent?'먼저 녹음한 목소리 + 반주':'반주',0,1.5,.01)+'</div>';return `<div class="studio-sound"><h3>소리 크기</h3>${studioRangeHTML(m,'voice','내 목소리',0,2,.01)}${studioRangeHTML(m,'mr',sing?.parent?'먼저 녹음한 목소리 + 반주':'반주',0,1.5,.01)}<div class="studio-noise"><h3>잡음 제거</h3>${studioRangeHTML(m,'noise','잡음 제거 단계',0,4,1)}<div class="studio-ticks">${['끄기','1 약','2 보통','3 강','4 최대'].map(t=>`<span>${t}</span>`).join('')}</div></div></div>`;}
const roomControlHTML=m=>`<section class="studio-reverb"><h3>리버브 추천 설정</h3><div class="sing-presets" role="group" aria-label="목소리 효과 선택">${K().vocalPresets.map(p=>`${vocalPresetButtonHTML(p.id,p.name,m.preset===p.id)}`).join('')}${vocalPresetButtonHTML('custom','사용자 설정',m.preset==='custom')}</div><p class="field-help" data-preset-description></p><div data-preset-strength>${studioRangeHTML(m,'strength','프리셋 강도',0,1,.01)}</div><details class="sing-effect-details" data-custom-controls><summary>리버브 조절 · 사용자 설정</summary>${studioRangeHTML(m,'size','룸 크기',0,1,.01)}${studioRangeHTML(m,'echo','에코 크기',0,.65,.01)}${studioRangeHTML(m,'room','리버브 강도',0,1,.01)}<details class="studio-advanced"><summary>음색 보정</summary>${studioRangeHTML(m,'tone','음색 보정',-1,2,.01)}</details></details></section>`;
function postRoomControlHTML(m){return '<section class="studio-reverb studio-post-reverb"><p>적용된 리버브 효과를 확인하고 조절해 보세요.</p><h4>추천 설정</h4><div class="sing-presets" role="group" aria-label="목소리 효과 선택">'+K().vocalPresets.map(p=>vocalPresetButtonHTML(p.id,p.name,m.preset===p.id)).join('')+vocalPresetButtonHTML('custom','사용자 설정',m.preset==='custom')+'</div><div data-post-custom>'+studioRangeHTML(m,'size','룸 크기',0,1,.01)+studioRangeHTML(m,'echo','에코 크기',0,.65,.01)+studioRangeHTML(m,'room','효과 강도',0,1,.01)+'</div><div data-preset-strength>'+studioRangeHTML(m,'strength','효과 강도',0,1,.01)+'</div><details class="studio-tone"><summary>음색 보정</summary>'+studioRangeHTML(m,'tone','음색 보정',-1,2,.01)+'</details></section>';}
const reviewHTML=m=>{
 const duration=reviewDuration(sing),range=reviewRange(sing);
 return `<div class="sing-review studio-post"><div class="studio-edit-main"><div class="studio-wave-editor"><div class="studio-time-ruler">${Array.from({length:7},(_,i)=>`<span>${time(duration*i/6)}</span>`).join('')}</div><div class="studio-wave-surface"><canvas id="take-waveform" height="240" aria-label="녹음 파형"></canvas><div class="studio-selection" aria-hidden="true"></div></div><input class="studio-wave-seek" type="range" min="0" max="${duration}" value="${sing?.cursor||0}" step=".05" aria-label="녹음 재생 위치"><div class="studio-range-handles"><label>구간 시작 <output data-range-start>${preciseTime(range.start)}</output><input type="range" data-range="start" aria-label="재녹음 구간 시작" min="0" max="${duration}" step=".05" value="${range.start}"></label><label>구간 끝 <output data-range-end>${preciseTime(range.end)}</output><input type="range" data-range="end" aria-label="재녹음 구간 끝" min="0" max="${duration}" step=".05" value="${range.end}"></label></div></div>
 <div class="studio-preview-row studio-audio"><span class="studio-current-time"><span data-review-now>${time(sing.cursor)}</span> / <span data-review-duration>${time(duration)}</span></span><button type="button" class="studio-play" data-sing-preview aria-label="녹음 들어보기">${icon('play')}</button><button type="button" class="studio-play" data-sing-pause aria-label="녹음 일시정지" hidden>${studioIcon('pause')}</button><span class="studio-selection-label">선택 구간 <strong data-range-label>${preciseTime(range.start)} – ${preciseTime(range.end)}</strong></span></div>
 <div class="studio-edit-tools" role="tablist" aria-label="녹음 편집 도구">${[['punch','mic','부분 재녹음','선택한 구간만 다시 녹음'],['sync','sliders','싱크 조절','목소리와 반주 맞추기'],['noise','sparkles','노이즈 제거','잡음을 줄여 소리 정리'],['tone','sliders','음색 보정','목소리의 밝기 조절']].map(([id,symbol,name,desc])=>`<button type="button" role="tab" id="edit-tool-${id}" data-edit-tool="${id}" aria-selected="${id==='punch'}" aria-controls="studio-edit-detail">${icon(symbol)}<span><strong>${name}</strong><small>${desc}</small></span></button>`).join('')}</div><section id="studio-edit-detail" class="studio-edit-detail" role="tabpanel"></section>
 <div class="studio-edit-actions"><button type="button" class="small-button" data-preview-selection>${icon('play')} 선택 구간 듣기</button><button type="button" class="small-button" data-reset-mix>${icon('restart')} 효과 원래대로</button><button type="button" class="primary-button" data-apply-mix>적용하기</button></div>
 <details class="studio-publish-panel" open><summary>저장 및 게시 <span>초안으로 보관하거나 커버곡 공개</span></summary><form id="sing-upload-form" class="upload-form"><div class="studio-save-actions"><button type="button" class="small-button" data-sing-redo>${icon('restart')} 다시 부르기</button><button type="button" class="small-button" data-sing-draft>임시 저장</button><button type="submit" class="primary-button">저장 후 게시</button></div><details class="studio-publication" open><summary>게시 정보 · 권리 확인</summary><label class="form-field">커버 소개 (선택)<textarea name="description" maxlength="1000" placeholder="어떤 마음으로 불렀는지 들려주세요."></textarea></label><label class="checkbox-line rights-check"><input name="own_voice" type="checkbox" required><span>제가 직접 부른 녹음이며 AI 음성 복제가 아닙니다.</span></label>${sing?.mode==='duet'&&!sing.parent?'<label class="checkbox-line rights-check"><input name="duet_consent" type="checkbox" required><span>다른 사람이 빈 파트에 목소리를 더하는 것에 동의합니다.</span></label>':''}<label class="checkbox-line rights-check"><input name="rights" type="checkbox" required><span>원곡자의 허용 범위 안에서 공개할 권리가 있습니다.</span></label></details><div class="upload-progress" hidden><progress max="100" value="0"></progress><p role="status"></p></div><p class="form-error" role="alert"></p></form><details class="studio-advanced"><summary>세부 설정 · 파일 저장 · 초안 관리</summary><div class="inline-actions"><button type="button" class="small-button" data-sing-settings>잡음 · 세부 설정</button><button class="small-button" data-sing-save>${member.plan==='premium'?'부른 구간 파일로 저장':'Premium으로 파일 저장'}</button><button class="small-button" data-discard-draft>초안 삭제</button></div><p class="field-help">초안은 현재 기기에서 이어 편집할 수 있어요.</p></details></details></div>
 <aside class="studio-sidebar studio-review-sidebar" aria-label="녹음 편집 설정"><section class="studio-setting-card" id="studio-sync-card"><h2>${icon('sliders')} 싱크 조절</h2><div class="studio-sync-buttons"><button type="button" data-sync-step="-200">−0.2초</button><button type="button" data-sync-reset>0.0초</button><button type="button" data-sync-step="200">+0.2초</button></div>${studioRangeHTML(m,'offset','목소리 싱크',-1000,1000,5)}<p class="field-help">미리 들으며 목소리와 반주를 맞춰주세요.</p></section><section class="studio-setting-card"><h2>${studioIcon('headphones')} 볼륨 밸런스</h2>${soundControlHTML(m,true)}</section>${spaceEffectsHTML(m)}<section class="studio-setting-card studio-punch-info"><h2>${icon('mic')} 부분 재녹음 정보</h2><p>선택 구간 <strong data-range-label>${preciseTime(range.start)} – ${preciseTime(range.end)}</strong></p><button type="button" class="studio-punch-button" data-start-punch>${icon('mic')} 이 구간만 다시 녹음</button><p class="field-help">선택한 구간만 교체하고 앞뒤 녹음은 보존합니다.</p></section></aside></div>`;
};
function openSingSettings(){
 const s=sing;if(!s||singBusy(s))return;const before=structuredClone(s.mix);let applied=false;s.settingsOpen=true;
 dialog(`<div class="studio-settings"><h2>세부 설정</h2><div class="studio-tabs" role="tablist" aria-label="세부 설정"><button type="button" role="tab" data-studio-tab="sound" aria-selected="true" aria-controls="studio-sound-panel">${icon('sliders')} 소리 조절</button><button type="button" role="tab" data-studio-tab="reverb" aria-selected="false" aria-controls="studio-reverb-panel">${studioIcon('headphones')} 리버브</button></div><div class="studio-settings-body"><section id="studio-sound-panel" role="tabpanel">${soundControlHTML(s.mix)}</section><section id="studio-reverb-panel" role="tabpanel" hidden>${roomControlHTML(s.mix)}</section></div><button type="button" class="primary-button studio-apply" data-settings-apply>적용하기</button></div>`);
 const dlg=$('#dialog');dlg.classList.add('record-settings-dialog');bindMixControls();
 const selectTab=button=>{[...document.querySelectorAll('#dialog [data-studio-tab]')].forEach(b=>{const selected=b===button;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;$('#studio-'+b.dataset.studioTab+'-panel').hidden=!selected;});};
 [...document.querySelectorAll('#dialog [data-studio-tab]')].forEach(b=>{b.onclick=()=>selectTab(b);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const next=[...document.querySelectorAll('#dialog [data-studio-tab]')].find(v=>v!==b);selectTab(next);next.focus();}};});
 $('[data-settings-apply]').onclick=()=>{applied=true;dlg.close();};
 dlg.addEventListener('close',()=>{dlg.classList.remove('record-settings-dialog');s.settingsOpen=false;if(sing===s){if(!applied){s.mix=before;applyMixChange('preset');}else queueSingDraft(s);refreshEffectControls();}},{once:true});
}
function drawTakeWaveform(){
 const s=sing,canvas=$('#take-waveform');if(!s?.voice||!canvas||$('#sing-panel').hidden)return;
 const total=s.mode==='duet'?(s.mr?.duration||s.data.track.duration):s.voice.duration,bins=400,rect=canvas.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width*devicePixelRatio)),now=performance.now();if(!total||!rect.width)return;
 if(!s.wavePeaks||s.waveSource!==s.voice||s.waveDuration!==total){const data=s.voice.getChannelData(0);s.wavePeaks=new Float32Array(bins);for(let i=0;i<bins;i++){const begin=Math.floor(i*total*s.voice.sampleRate/bins),end=Math.min(data.length,Math.floor((i+1)*total*s.voice.sampleRate/bins));for(let j=begin;j<end;j+=Math.max(1,Math.floor((end-begin)/256)))s.wavePeaks[i]=Math.max(s.wavePeaks[i],Math.abs(data[j]));}s.waveSource=s.voice;s.waveDuration=total;}
 if(s.waveCanvas===canvas&&canvas.width===width&&now-(s.waveDrawAt||0)<80&&Math.abs(s.cursor-(s.waveCursor||0))<.2)return;s.waveCanvas=canvas;s.waveDrawAt=now;s.waveCursor=s.cursor;if(canvas.width!==width)canvas.width=width;
 if(!canvas.dataset.bound){canvas.dataset.bound='1';canvas.tabIndex=0;canvas.setAttribute('role','slider');canvas.setAttribute('aria-valuemin','0');canvas.setAttribute('aria-valuemax',String(total));canvas.setAttribute('aria-label','녹음 재생 위치');const seek=e=>{const r=canvas.getBoundingClientRect(),at=Math.max(0,Math.min(total,(e.clientX-r.left)/r.width*total));sing.compareFrom=at;if(sing.state==='playing')previewMix(at);else{sing.cursor=at;drawLyrics(at);}};canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);seek(e);};canvas.onpointermove=e=>{if(e.buttons)seek(e);};canvas.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const at=Math.max(0,Math.min(total,sing.cursor+(e.key==='ArrowRight'?1:-1)));sing.compareFrom=at;if(sing.state==='playing')previewMix(at);else{sing.cursor=at;drawLyrics(at);}}};}canvas.setAttribute('aria-valuenow',String(s.cursor));
 const ctx=canvas.getContext('2d'),step=width/bins,height=canvas.height,mid=height/2,range=reviewRange(s);ctx.clearRect(0,0,width,height);ctx.strokeStyle='#254253';ctx.lineWidth=1;for(let i=0;i<=12;i++){ctx.beginPath();ctx.moveTo(i*width/12,0);ctx.lineTo(i*width/12,height);ctx.stroke();}for(let i=0;i<bins;i++){ctx.strokeStyle=i/bins*total>=range.start&&i/bins*total<=range.end?'#e7a0c1':'#81adc5';ctx.lineWidth=Math.max(1,step*.5);const h=Math.max(1,Math.sqrt(s.wavePeaks[i])*mid*.85);ctx.beginPath();ctx.moveTo((i+.5)*step,mid-h);ctx.lineTo((i+.5)*step,mid+h);ctx.stroke();}ctx.strokeStyle='#f2a1c6';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(width*s.cursor/total,0);ctx.lineTo(width*s.cursor/total,height);ctx.stroke();
}

function mixLabel(key,value){return key==='tone'?(value===0?'원음':`${value>0?'+':''}${Math.round(value*100)}%`):key==='offset'?`${value}ms`:key==='noise'?(value===0?'끄기':`${value}단계`):key==='echo'?`${(value*100).toFixed(1)}%`:`${Math.round(value*100)}%`;}
function renderSingPanel(){
 $('#sing-panel').innerHTML=sing.voice?reviewHTML(sing.mix):singStartHTML();bindMixControls();if(sing.voice){bindReview();bindStudioEditor();const seek=$('.studio-wave-seek');seek.oninput=()=>{const at=Number(seek.value);sing.compareFrom=at;if(sing.state==='playing')previewMix(at);else{sing.cursor=at;drawLyrics(at);} };drawTakeWaveform();}updateTransport();
}
function refreshEffectControls(){
 const m=sing.mix;document.querySelectorAll('[data-post-custom]').forEach(v=>v.hidden=m.preset!=='custom');document.querySelectorAll('[data-custom-controls]').forEach(v=>v.open=m.preset==='custom');document.querySelectorAll('[data-preset-strength]').forEach(v=>v.hidden=m.preset==='custom');document.querySelectorAll('[data-vocal-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.vocalPreset===m.preset)));
 document.querySelectorAll('[data-mix]').forEach(input=>{const k=input.dataset.mix;input.value=m[k]??.5;document.querySelectorAll('[data-mix-label="'+k+'"]').forEach(v=>v.textContent=mixLabel(k,m[k]??.5));input.disabled=singBusy(sing)||k==='strength'&&['original','custom'].includes(m.preset);});
 document.querySelectorAll('[data-vocal-tone]').forEach(b=>{b.setAttribute('aria-pressed',String(Number(b.dataset.vocalTone)===m.tone));b.disabled=singBusy(sing);});
 document.querySelectorAll('[data-vocal-noise]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.vocalNoise)===m.noise)));
 document.querySelectorAll('[data-preset-description]').forEach(note=>note.textContent=K().vocalPresets.find(p=>p.id===m.preset)?.description||'사용자 설정 · 직접 조절한 효과를 사용하고 있어요.');
}
function applyMixChange(key){const s=sing;if(!s.settingsOpen)queueSingDraft(s);s.run?.effects?.update(s.mix);if(s.standbyMonitor){s.standbyMonitor.effects.update?.(s.mix);s.standbyMonitor.gain?.gain.setTargetAtTime(s.mix.voice,s.ctx.currentTime,.015);}if(s.run){s.run.voiceGain.gain.setTargetAtTime(s.mix.voice,s.ctx.currentTime,.015);s.run.gain.gain.setTargetAtTime(s.mix.mr,s.ctx.currentTime,.015);}if(s.state==='backing')s.previewMixUpdate?.(s.mix);if(s.state==='playing'){if(key==='offset'||key==='reset')previewMix(s.ctx.currentTime-s.previewAt,s.previewUntil??Infinity);else{s.previewMixUpdate?.(s.mix);if(!['voice','mr'].includes(key))refreshPreviewEffects(s);}}if(key==='offset'){refreshVocalGuide(s);renderDuetGuide();}refreshEffectControls();}
function bindMixControls(){
 document.querySelectorAll('[data-vocal-tone]').forEach(button=>button.onclick=()=>{if(singBusy(sing))return;sing.mix=K().editVocalMix(sing.mix,'tone',Number(button.dataset.vocalTone));applyMixChange('tone');});
 document.querySelectorAll('[data-vocal-preset]').forEach(button=>button.onclick=()=>{if(singBusy(sing))return;sing.mix=K().presetMix(sing.mix,button.dataset.vocalPreset,.5);applyMixChange('preset');});
 document.querySelectorAll('[data-vocal-noise]').forEach(button=>button.onclick=()=>{if(singBusy(sing))return;sing.mix=K().editVocalMix(sing.mix,'noise',Number(button.dataset.vocalNoise));applyMixChange('noise');});
 document.querySelectorAll('[data-mix]').forEach(input=>input.oninput=()=>{if(singBusy(sing))return;const s=sing,k=input.dataset.mix;if(k==='strength')s.mix=K().presetMix(s.mix,s.mix.preset,Number(input.value));else s.mix=K().editVocalMix(s.mix,k,Number(input.value));applyMixChange(k);});
 refreshEffectControls();
}
function bindReview(){
 const form=$('#sing-upload-form');form.addEventListener('invalid',()=>{form.querySelector('.studio-publication').open=true;},true);form.elements.description.value=sing.description||'';form.elements.description.oninput=()=>{sing.description=form.elements.description.value;queueSingDraft(sing);};form.onsubmit=busyForm(form,uploadSung);
}
function voiceBuffer(s){
 const source=vocalPlaybackBuffer(s),key=vocalEffectKey(s.mix);if(s.processed?.key===key&&s.processed.source===source)return s.processed.buffer;
 const buffer=s.ctx.createBuffer(1,source.length,source.sampleRate);buffer.copyToChannel(K().renderVocals(source.getChannelData(0),source.sampleRate,s.mix),0);s.processed={key,source,buffer};return buffer;
}
function connectEffects(ctx,source,destination,m){
 const fx=new AudioWorkletNode(ctx,'aifect-vocal',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit',processorOptions:{mix:m}});source.connect(fx).connect(destination);const nodes=[fx];nodes.update=m=>fx.port.postMessage(m);return nodes;
}
function scheduleMix(ctx,from,at,s=sing,until=Infinity){
 const end=Math.min(s.mode==='duet'?s.mr.duration:s.voice.duration,until),remaining=end-from;if(remaining<=0)throw new Error('다시 들을 위치를 골라주세요.');
 const m=s.mix,shift=m.offset/1000,g={mr:ctx.createGain(),voice:ctx.createGain()},offline=typeof ctx.startRendering==='function';g.mr.gain.value=m.mr;g.voice.gain.value=m.voice;
 const nodes=[g.mr,g.voice],master=offline?ctx.destination:ctx.createDynamicsCompressor();
 if(!offline){master.threshold.value=-1;master.knee.value=0;master.ratio.value=20;master.attack.value=.003;master.release.value=.08;master.connect(ctx.destination);nodes.push(master);}
 g.mr.connect(master);g.voice.connect(master);
 const a=ctx.createBufferSource();a.buffer=backingBuffer(s);a.connect(g.mr);a.start(at,from,remaining);const sources=[a];let activeGain;
 const addVoice=(buffer,start,position,fade=false)=>{
  const b=ctx.createBufferSource(),gain=ctx.createGain();b.buffer=buffer;b.connect(gain).connect(g.voice);nodes.push(gain);
  const v=position+shift,delay=Math.max(0,-v),available=Math.min(end-position-delay,s.voice.duration-Math.max(0,v));
  if(available<=0){gain.disconnect();return;}
  const old=sources[1],oldGain=activeGain;
  if(fade){gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(1,start+.025);if(old&&oldGain){oldGain.gain.cancelScheduledValues(start);oldGain.gain.setValueAtTime(1,start);oldGain.gain.linearRampToValueAtTime(0,start+.025);try{old.stop(start+.026);}catch{}old.onended=()=>{old.disconnect();oldGain.disconnect();const i=nodes.indexOf(oldGain);if(i>=0)nodes.splice(i,1);};}}
  b.start(start+delay,Math.max(0,v),available);sources[1]=b;activeGain=gain;
 };
 // Review playback and export consume the identical pre-rendered vocal samples.
 // The audio rendering thread only mixes buffers; the mic monitor keeps its live DSP.
 addVoice(voiceBuffer(s),at,from);
 return {sources,nodes,replaceVoice:buffer=>{const start=ctx.currentTime+.01,position=from+start-at;if(position<end)addVoice(buffer,start,position,true);},updateMix:m=>{g.mr.gain.setTargetAtTime(m.mr,ctx.currentTime,.015);g.voice.gain.setTargetAtTime(m.voice,ctx.currentTime,.015);}};
}
function stopPreview(){
 const s=sing;if(!s)return;if(s.previewAt!=null)s.cursor=clampPosition(s.ctx.currentTime-s.previewAt,s.state==='playing');
 const sources=s.preview;s.previewMixUpdate=null;s.previewReplaceVoice=null;cancelVocalEffects(s);s.preview=null;s.previewAt=null;sources?.forEach(n=>{n.onended=null;try{n.stop();}catch{}});s.previewNodes?.forEach(n=>n.disconnect());s.previewNodes=null;cancelAnimationFrame(s.frame);
 if(['playing','guide','backing'].includes(s.state))s.state=s.voice?'review':'idle';
}
function runPreview(s,sources,at,from,mode,nodes=[]){
 s.preview=sources;s.previewNodes=nodes;s.previewAt=at-from;s.state=mode;updateTransport();
 sources[0].onended=()=>{if(sing===s&&s.preview===sources){stopPreview();updateTransport();drawLyrics(s.cursor);}};
 const tick=()=>{if(sing!==s||s.preview!==sources)return;s.cursor=Math.max(0,s.ctx.currentTime-s.previewAt);drawLyrics(s.cursor);s.frame=requestAnimationFrame(tick);};tick();
}
async function previewMix(from=0,until=Infinity){
 const s=sing;if(!s?.voice||singLive(s)||singBusy(s))return;
 const request=s.previewRequest=(s.previewRequest||0)+1;
 try{await prepareSing(s);if(sing!==s||request!==s.previewRequest)return;stopPreview();s.state='rendering';updateTransport();setSingStatus('미리 듣기 소리를 준비하고 있어요…');await prepareVocalEffects(s);if(sing!==s||request!==s.previewRequest)return;s.state='review';s.ctx.resume();const duration=reviewDuration(s);from=Math.max(0,from>=duration-.02?0:from);until=Math.min(duration,until);if(from>=until){updateTransport();return;}const at=s.ctx.currentTime+.05,mix=scheduleMix(s.ctx,from,at,s,until);runPreview(s,mix.sources,at,from,'playing',mix.nodes);s.previewUntil=until;s.previewMixUpdate=mix.updateMix;s.previewReplaceVoice=mix.replaceVoice;setSingStatus('녹음 들어보기 · 위치를 옮겨도 재생이 이어져요.');}
 catch(e){if(sing===s&&request===s.previewRequest){stopPreview();s.state='review';updateTransport();setSingStatus(e.message||'녹음을 재생하지 못했어요. 다시 시도해주세요.');}}
}

async function previewGuide(from=sing?.cursor||0){
 const s=sing;if(!s||singLive(s)||singBusy(s))return;stopPreview();++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';updateTransport();setSingStatus('원곡 가이드를 불러오고 있어요…');
 try{const ctx=await prepareSing(s);if(!s.guide){const r=await fetch(`/media/${encodeURIComponent(s.id)}/stream`,{credentials:'same-origin',signal:s.abort?.signal});if(!r.ok)throw new Error('원곡 가이드를 불러오지 못했어요.');s.guide=await ctx.decodeAudioData(await r.arrayBuffer());}if(sing!==s)return;const src=ctx.createBufferSource();src.buffer=s.guide;src.connect(ctx.destination);from=Math.max(0,Math.min(from,s.guide.duration-.05));const at=ctx.currentTime+.05;src.start(at,from);runPreview(s,[src],at,from,'guide');setSingStatus('원곡 가이드 · 일시정지 후 가사를 골라 그 위치부터 불러보세요.');}
 catch(e){if(sing===s){s.state=s.voice?'review':'idle';updateTransport();setSingStatus(e.message||'원곡을 불러오지 못했어요.');}}
}
async function renderSung(s){
 await prepareSing(s);await prepareVocalEffects(s);
 const rate=K().MIX_RATE,length=Math.ceil((s.mode==='duet'?s.mr.duration:s.voice.duration)*rate),off=new OfflineAudioContext(2,length,rate);scheduleMix(off,0,0,s);const out=await off.startRendering();const channels=[out.getChannelData(0),out.getChannelData(1)],top=K().peak(channels);if(top>.98)for(const c of channels)for(let i=0;i<c.length;i++)c[i]*=.98/top;return new Blob([K().encodeWav(channels,rate)],{type:'audio/wav'});
}
async function saveSung(){
 const s=sing;if(!s?.voice||singBusy(s)||singLive(s))return;let access;try{access=await api('/api/me');}catch(e){setSingStatus(e.message);return;}if(sing!==s)return;if(access.membership?.plan!=='premium'){toast('커버 파일 저장은 Premium 이용권이 필요해요.');return;}stopPreview();s.state='exporting';updateTransport();setSingStatus('부른 구간을 파일로 만들고 있어요…');
 try{const file=await renderSung(s);if(sing!==s)return;const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=`AIFECT-cover-${s.id}.wav`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);s.dirty=false;setSingStatus('녹음 파일을 저장했어요.');}catch(e){if(sing===s)setSingStatus(e.message||'파일을 저장하지 못했어요.');}finally{if(sing===s){s.state='review';updateTransport();}}
}
async function uploadSung(fd){
 const s=sing;if(!s?.voice||singBusy(s)||singLive(s))return;stopPreview();s.state='exporting';updateTransport();
 const progress=$('#sing-upload-form .upload-progress'),note=progress.querySelector('p');progress.hidden=false;note.textContent='부른 구간을 합치고 있어요…';
 try{refreshVocalGuide(s);const file=await renderSung(s);if(sing!==s)return;
  const draft=await api('/api/covers','POST',{original_id:s.id,cover_mode:s.mode,duet_slot:s.mode==='duet'?(s.parent?'second':'first'):'',duet_parent_id:s.parent,duet_consent:fd.has('duet_consent'),duet_guide:s.mode==='duet'&&!s.parent?s.duetGuide:undefined,description:fd.get('description')||'',own_voice:fd.has('own_voice'),rights:fd.has('rights'),extension:'wav',bytes:file.size});
  await uploadFile(`/api/uploads/${draft.id}/audio`,file,value=>{progress.querySelector('progress').value=value;note.textContent=`올리는 중 ${Math.round(value)}%`;});const completed=await api(`/api/uploads/${draft.id}/complete`,'POST');if(sing!==s)return;clearTimeout(s.draftTimer);await removeSingDraft(s);s.dirty=false;cleanupSing();toast('커버곡을 올렸어요! 변환이 끝나면 공개돼요.');location.hash='studio';if(completed.show_upload_ad)window.AifectUploadAds?.afterCoverUpload(draft.id);
 }finally{if(sing===s){s.state='review';updateTransport();}}
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-sing-start],[data-sing-stop],[data-sing-preview],[data-sing-pause],[data-sing-guide],[data-sing-save],[data-sing-settings],[data-sing-redo],[data-sing-review]');if(!el||!sing)return;
 if(el.hasAttribute('data-sing-start')){if(singLive(sing)){sing.editingRecording=true;finishSinging();}else startSinging();}else if(el.hasAttribute('data-sing-stop')){sing.editingRecording=false;if(singLive(sing))finishSinging();else renderSingPanel();}else if(el.hasAttribute('data-sing-preview'))previewMix(sing.cursor);else if(el.hasAttribute('data-sing-pause')){if(singLive(sing)){sing.editingRecording=true;finishSinging();}else{stopPreview();updateTransport();drawLyrics(sing.cursor);setSingStatus('일시정지했어요.');}}else if(el.hasAttribute('data-sing-guide'))previewGuide();else if(el.hasAttribute('data-sing-save'))saveSung();else if(el.hasAttribute('data-sing-settings'))openSingSettings();else if(el.hasAttribute('data-sing-redo')){stopPreview();sing.punchRange=null;sing.editingRecording=true;sing.cursor=0;renderSingPanel();drawLyrics(0);$('#sing').scrollIntoView({block:'start'});}else if(el.hasAttribute('data-sing-review')){sing.editingRecording=false;renderSingPanel();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(sing){sing.monitorSerial=(sing.monitorSerial||0)+1;stopStandbyMonitor(sing);const input=$('#sing-monitor');if(input)input.checked=false;document.querySelectorAll('[data-monitor-toggle]').forEach(b=>b.setAttribute('aria-pressed','false'));}if(sing?.state==='backing'){stopPreview();updateTransport();}if(singLive(sing))finishSinging();}});
window.addEventListener?.('beforeunload',e=>{if(sing?.dirty||singLive(sing)||sing?.state==='exporting'){e.preventDefault();e.returnValue='';}});

function duetLobbyHTML(tracks){return `<section class="surface duet-lobby"><h2>커버 둘러보기</h2><p class="field-help">다른 사람의 솔로·듀엣 커버를 들어보세요.</p><div class="cover-browse-links"><a class="small-button" href="#community/covers?mode=solo">솔로 커버 듣기</a><a class="small-button" href="#community/covers?mode=duet">듀엣 커버 듣기</a></div><h2>참여를 기다리는 듀엣</h2>${tracks.length?tracks.map(t=>`<div class="duet-invitation">${cover(t,'mini-cover')}<div><a href="#song/${esc(t.id)}"><strong>${esc(t.title)}</strong></a><p>${esc(t.producer)} · 먼저 녹음한 목소리</p></div><a class="primary-button" href="${t.user_id===me?.id?'#song/'+esc(t.id):'#sing/'+esc(t.original_id)+'?duet='+esc(t.id)}">${t.user_id===me?.id?'내 듀엣 보기':'듀엣 참여'}</a></div>`).join(''):'<p class="empty-note">아직 참여를 기다리는 듀엣이 없어요. 아래 곡을 골라 첫 파트를 남겨보세요.</p>'}</section>`;}
function singModeHTML(d){const choices=d.duet?'<strong>듀엣 참여</strong>':`<div class="sing-mode inline-actions" role="group" aria-label="커버 녹음 종류">${['solo','duet'].map(mode=>`<button type="button" data-sing-mode="${mode}" aria-pressed="${d.mode===mode}" class="${d.mode===mode?'primary-button':'small-button'}">${mode==='solo'?'솔로':'듀엣'}</button>`).join('')}</div>`;return choices+(d.mode==='duet'?`<p class="field-help">${d.duet?esc(d.duet.partner.producer)+'의 목소리를 들으며 내 파트를 불러주세요.':'내 파트를 먼저 녹음하면 다른 사람이 이어 불러 함께 완성해요.'}</p>`:'');}

function duetTime(seconds){const n=Math.round(Math.max(0,seconds)*10);return Math.floor(n/600)+':'+String(Math.floor(n%600/10)).padStart(2,'0')+'.'+n%10;}
function refreshVocalGuide(s){if(s?.mode==='duet'&&!s.parent&&s.voice&&s.duetGuide?.mode==='free')s.duetGuide.activity=AifectDuetGuide.detectVocalActivity(s.voice.getChannelData(0),s.voice.sampleRate,s.mix.offset,s.mr?.duration||s.data.track.duration);}
function duetRoleLabel(part,second=false){return part==='both'?'같이':part==='A'?(second?'상대 파트':'내 파트'):part==='B'?(second?'내 파트':'상대 파트'):part==='partial'?'일부 빈 구간':'미지정';}
function duetAssignmentIssue(s){
 if(s?.mode!=='duet'||s.parent||s.duetGuide?.mode!=='lyrics')return '';
 const lines=s.data.words.map((_,i)=>s.duetGuide.lines?.[i]||''),missing=lines.filter(p=>!p).length;
 if(missing)return '아직 '+missing+'줄의 파트가 비어 있어요. 아래에서 선택해주세요.';
 if(!lines.length||!lines.some(p=>p==='A'||p==='both')||!lines.some(p=>p==='B'||p==='both'))return '내 파트와 파트너가 부를 파트를 모두 지정해주세요.';
 return '';
}
function duetLegendHTML(){return '<div class="duet-color-key" aria-label="듀엣 파트 색상"><span data-role="mine"><i></i>내 파트</span><span data-role="both"><i></i>같이</span><span data-role="partner"><i></i>상대 파트</span></div>';}
function renderDuetGuide(){
 const s=sing,host=$('#duet-guide');if(!s||!host)return;host.innerHTML='';if(s.mode!=='duet')return;
 const second=!!s.parent,guide=s.duetGuide,words=s.data.words||[],duration=s.mr?.duration||s.data.track.duration;
 host.innerHTML='<div class="duet-guide-card"><div><strong>'+(second?'함께 부를 파트':'듀엣 파트')+'</strong><p>'+(second?'상대 목소리를 들으며 내 차례를 불러요.':'가사마다 내 파트 · 같이 · 상대 파트를 선택하세요.')+'</p></div><button type="button" class="small-button" data-duet-editor>'+icon('users')+(second?'파트 보기':'파트 나누기')+'</button></div>'+duetLegendHTML();
 host.querySelector('[data-duet-editor]').onclick=openDuetEditor;
 document.querySelectorAll('[data-sing-line]').forEach((row,i)=>{
  row.querySelector('.duet-line-badge')?.remove();row.querySelector('.duet-line-mic')?.remove();
  const p=AifectDuetGuide.linePart(guide,words,i,duration),role=AifectDuetGuide.lineRole(p,second);row.dataset.partRole=role;row.setAttribute('aria-label',time(words[i].s)+' '+duetRoleLabel(p,second)+' '+words[i].w.map(w=>w.t).join(' '));
  if(role==='partial'){const badge=document.createElement('b');badge.className='duet-line-badge';badge.textContent='빈 구간 있음 · 추정';row.append(badge);}
 });
 updateTransport();
}
function duetEditorDraft(s){
 const draft={...s,duetGuide:JSON.parse(JSON.stringify(s.duetGuide||{version:1,mode:'free',lines:[]}))};
 // A fresh manual editor starts without guessing the singers from the audio.
 if(!s.parent&&s.data.words?.length&&!draft.duetGuide.activity&&!draft.duetGuide.lines?.some(Boolean))draft.duetGuide.mode='lyrics';
 return draft;
}
function duetEditorHTML(s){
 const second=!!s.parent,guide=s.duetGuide,words=s.data.words||[],duration=s.mr?.duration||s.data.track.duration;
 const modes=second?'':'<div class="duet-methods" role="group" aria-label="파트 나누는 방법">'+[['lyrics','가사별로 지정'],['free','자유롭게 부르기']].map(([id,label])=>'<button type="button" data-duet-method="'+id+'" aria-pressed="'+(guide?.mode===id)+'"'+(id==='lyrics'&&!words.length?' disabled':'')+'>'+label+'</button>').join('')+'</div>';
 const help=second?'먼저 정한 파트를 확인하고 내 차례를 불러주세요.':guide?.mode==='lyrics'?'각 가사 줄 오른쪽의 색을 선택해서 파트를 지정하세요.':'원하는 구간을 먼저 부르세요. 녹음 후 비어 있는 구간을 추정해요.';
 const rows=words.map((line,i)=>{const part=AifectDuetGuide.linePart(guide,words,i,duration),role=AifectDuetGuide.lineRole(part,second),text=line.w.map(w=>w.t).join(' ');return '<div class="duet-edit-line" data-edit-line="'+i+'" data-part-role="'+role+'"><div class="duet-edit-lyric"><span>'+esc(text)+'</span></div>'+(second?'<span class="duet-part-label">'+duetRoleLabel(part,true)+'</span>':'<div class="duet-part-choices" role="group" aria-label="'+esc(text)+' 파트">'+[['A','내 파트'],['both','같이'],['B','상대 파트']].map(([value,label])=>'<button type="button" data-duet-line="'+i+'" data-duet-part="'+value+'" aria-label="'+(i+1)+'번째 가사 '+label+'" title="'+label+'" aria-pressed="'+(part===value)+'"><i aria-hidden="true"></i></button>').join('')+'</div>')+'</div>';}).join('');
 return '<section class="duet-editor"><h2>'+(second?'듀엣 파트 보기':'듀엣 파트 나누기')+'</h2>'+duetLegendHTML()+modes+'<p class="duet-editor-help">'+help+'</p><div class="duet-editor-lines">'+rows+(!words.length?'<p class="empty-note">싱크 가사가 없는 곡은 자유롭게 나눠 불러주세요.</p>':'')+'</div><p data-duet-note role="status">'+(duetAssignmentIssue(s)||(second?'내 파트 · 같이 · 상대 파트를 색으로 확인하세요.':'적용하기를 누르면 선택한 파트가 저장돼요.'))+'</p><div class="duet-editor-footer">'+(!second?'<button type="button" class="small-button" data-duet-reset>'+icon('restart')+' 전체 초기화</button>':'')+'<button type="button" class="primary-button" data-duet-done>'+(second?'닫기':'적용하기')+'</button></div></section>';
}
function openDuetEditor(){
 const s=sing;if(!s||singBusy(s)||singLive(s))return;const draft=duetEditorDraft(s);
 dialog(duetEditorHTML(draft));const dlg=$('#dialog');dlg.classList.add('duet-editor-dialog');
 const bind=()=>{
  const host=$('#dialog-content');
  const redraw=()=>{const scroll=host.querySelector('.duet-editor-lines')?.scrollTop||0;host.innerHTML=duetEditorHTML(draft);bind();host.querySelector('.duet-editor-lines').scrollTop=scroll;};
  host.querySelectorAll('[data-duet-method]').forEach(b=>b.onclick=()=>{draft.duetGuide.mode=b.dataset.duetMethod;refreshVocalGuide(draft);redraw();});
  host.querySelectorAll('[data-duet-line]').forEach(b=>b.onclick=()=>{
   const i=Number(b.dataset.duetLine),value=b.dataset.duetPart,guide=draft.duetGuide;
   guide.mode='lyrics';guide.lines||=[];while(guide.lines.length<s.data.words.length)guide.lines.push('');guide.lines[i]=value;
   const row=b.closest('[data-edit-line]');row.dataset.partRole=AifectDuetGuide.lineRole(value,false);row.querySelectorAll('[data-duet-part]').forEach(v=>v.setAttribute('aria-pressed',String(v.dataset.duetPart===value)));
   host.querySelectorAll('[data-duet-method]').forEach(v=>v.setAttribute('aria-pressed',String(v.dataset.duetMethod==='lyrics')));
   host.querySelector('[data-duet-note]').textContent=duetAssignmentIssue(draft)||'적용하기를 누르면 선택한 파트가 저장돼요.';
  });
  const reset=host.querySelector('[data-duet-reset]');if(reset)reset.onclick=()=>{draft.duetGuide={version:1,mode:s.data.words.length?'lyrics':'free',lines:s.data.words.map(()=>'')};redraw();};
  host.querySelector('[data-duet-done]').onclick=()=>{if(sing!==s){dlg.close();return;}const issue=duetAssignmentIssue(draft);if(issue){host.querySelector('[data-duet-note]').textContent=issue;return;}if(!s.parent){s.duetGuide=draft.duetGuide;queueSingDraft(s);renderDuetGuide();drawLyrics(s.cursor);}dlg.close();};
 };
 bind();dlg.addEventListener('close',()=>dlg.classList.remove('duet-editor-dialog'),{once:true});
}

function preferredLyricSize(){try{const value=localStorage.getItem('aifect-recording-lyric-size');return ['small','normal','large'].includes(value)?value:'normal';}catch{return 'normal';}}
function lyricSizeControlsHTML(){const size=preferredLyricSize();return '<div class="sing-lyric-sizes" role="group" aria-label="녹음 가사 크기">'+[['small','작게'],['normal','보통'],['large','크게']].map(([key,label])=>'<button type="button" data-lyric-size="'+key+'" aria-pressed="'+(size===key)+'">'+label+'</button>').join('')+'</div>';}
function applyLyricSize(size){
 if(!['small','normal','large'].includes(size))size='normal';
 const stage=$('#sing');stage.dataset.lyricSize=size;stage.classList.remove('lyrics-large');document.querySelectorAll('button[data-lyric-size]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lyricSize===size)));
 try{localStorage.setItem('aifect-recording-lyric-size',size);}catch{}
 if(sing){sing.shownLine=-1;drawLyrics(sing.cursor||0);}
}
function vocalPresetButtonHTML(id,name,selected){const symbol={original:'original',karaoke:'mic',studio:'headphones',hall:'hall',custom:'sliders'}[id]||'sliders';return '<button type="button" class="studio-preset-tile" data-vocal-preset="'+id+'" aria-pressed="'+selected+'"><span class="studio-preset-icon">'+studioIcon(symbol)+'</span><span>'+name+'</span></button>';}

function preciseTime(t){return time(Math.floor(t))+'.'+Math.floor((t%1)*10);}
function reviewDuration(s){return s?.mode==='duet'?(s.mr?.duration||s.data.track.duration||0):(s?.voice?.duration||0);}
function reviewRange(s){const total=reviewDuration(s);return K().normalizeTakeRange(s.selection?.start??0,s.selection?.end??Math.min(15,total),total);}
function refreshStudioSelection(){
 const s=sing;if(!s?.voice)return;const r=reviewRange(s),total=reviewDuration(s);s.selection=r;
 document.querySelectorAll('[data-range]').forEach(input=>input.value=r[input.dataset.range]);
 document.querySelectorAll('[data-range-start]').forEach(el=>el.textContent=preciseTime(r.start));document.querySelectorAll('[data-range-end]').forEach(el=>el.textContent=preciseTime(r.end));
 document.querySelectorAll('[data-range-label]').forEach(el=>el.textContent=preciseTime(r.start)+' – '+preciseTime(r.end));
 const shade=$('.studio-selection');if(shade){shade.style.left=(100*r.start/total)+'%';shade.style.width=(100*(r.end-r.start)/total)+'%';}
 if(s.editTool==='punch')renderStudioEditTool('punch');
 s.waveCanvas=null;drawTakeWaveform();
}
function renderStudioEditTool(tool){
 const s=sing,host=$('#studio-edit-detail');if(!s||!host)return;s.editTool=tool;document.querySelectorAll('[data-edit-tool]').forEach(b=>{const selected=b.dataset.editTool===tool;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});host.setAttribute('aria-labelledby','edit-tool-'+tool);
 const r=reviewRange(s),lines=(s.data.words||[]).filter((line,i,all)=>line.s<r.end&&(all[i+1]?.s??reviewDuration(s))>r.start);
 host.innerHTML=tool==='punch'?`<div class="studio-selected-lyrics">${icon('mic')}<h3>선택한 구간의 가사</h3>${lines.length?lines.map(l=>`<p>${esc(l.w.map(w=>w.t).join(' '))}</p>`).join(''):'<p>이 구간에는 표시할 싱크 가사가 없어요.</p>'}<small>파형 아래 시작·끝 손잡이로 구간을 조절하세요.</small></div>`:tool==='sync'?`<h3>반주와 목소리의 타이밍</h3>${studioRangeHTML(s.mix,'offset','목소리 싱크',-1000,1000,5)}<p>재생 중에도 5ms 단위로 조절할 수 있어요.</p>`:tool==='noise'?`<h3>노이즈 제거</h3><p>작은 배경 잡음을 줄입니다. 강하게 적용하면 작은 목소리도 줄어들 수 있어요.</p><div class="studio-noise-levels">${['끄기','약하게','보통','강하게','최대로'].map((name,i)=>`<button type="button" data-vocal-noise="${i}" aria-pressed="${s.mix.noise===i}">${name}</button>`).join('')}</div>`:`<h3>목소리의 밝기</h3><div class="studio-tone-levels" role="group" aria-label="음색 보정 비교">${[[-1,'묵직하게'],[0,'원음'],[1,'밝게'],[2,'더 밝게']].map(([value,label])=>`<button type="button" class="small-button" data-vocal-tone="${value}" aria-pressed="${s.mix.tone===value}">${label}</button>`).join('')}</div>${studioRangeHTML(s.mix,'tone','음색 보정',-1,2,.01)}<p>0은 원래 음색이에요. 왼쪽은 저음이 묵직하고 부드럽게, 오른쪽은 고음이 밝고 또렷하게 변해요. 노래의 음높이는 유지됩니다.</p>`;
 bindMixControls();
}
function bindStudioEditor(){
 const s=sing;s.editMixBaseline={...s.mix};renderStudioEditTool(s.editTool||'punch');refreshStudioSelection();
 document.querySelectorAll('[data-range]').forEach(input=>input.oninput=()=>{if(singBusy(s)||singLive(s))return;stopPreview();const r=reviewRange(s),key=input.dataset.range;r[key]=Number(input.value);if(key==='start')r.start=Math.min(r.start,r.end-.1);else r.end=Math.max(r.end,r.start+.1);s.selection=K().normalizeTakeRange(r.start,r.end,reviewDuration(s));refreshStudioSelection();updateTransport();});
 const tools=[...document.querySelectorAll('[data-edit-tool]')];tools.forEach((b,i)=>{b.onclick=()=>renderStudioEditTool(b.dataset.editTool);b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?tools.length-1:(i+(e.key==='ArrowRight'?1:-1)+tools.length)%tools.length;tools[index].focus();renderStudioEditTool(tools[index].dataset.editTool);};});
 document.querySelectorAll('[data-sync-step]').forEach(b=>b.onclick=()=>{s.mix=K().editVocalMix(s.mix,'offset',Math.max(-1000,Math.min(1000,s.mix.offset+Number(b.dataset.syncStep))));applyMixChange('offset');});
 $('[data-sync-reset]').onclick=()=>{s.mix=K().editVocalMix(s.mix,'offset',0);applyMixChange('offset');};
 $('[data-preview-selection]').onclick=()=>{const r=reviewRange(s);previewMix(r.start,r.end);};
 $('[data-reset-mix]').onclick=()=>{s.mix={...s.editMixBaseline};applyMixChange('reset');renderStudioEditTool(s.editTool);setSingStatus('편집을 시작할 때의 효과로 되돌렸어요.');};
 $('[data-apply-mix]').onclick=async()=>{try{await saveSingDraft(s);s.editMixBaseline={...s.mix};setSingStatus('효과를 초안에 적용했어요. 저장 및 게시에서 공개할 수 있어요.');}catch{setSingStatus('효과를 저장하지 못했어요. 다시 시도해주세요.');}};
 $('[data-start-punch]').onclick=async()=>{if(singBusy(s)||singLive(s))return;stopPreview();s.punchRange={...reviewRange(s)};s.cursor=s.punchRange.start;s.editingRecording=true;updateTransport();drawLyrics(s.cursor);await startSinging();};
}
function stopStandbyMonitor(s=sing){const m=s?.standbyMonitor;if(!m)return;s.standbyMonitor=null;m.stream.getTracks().forEach(t=>t.stop());for(const n of [m.mic,m.gain,...m.effects])try{n.disconnect();}catch{}}
async function setMonitorEnabled(enabled){
 const s=sing;if(!s)return;const input=$('#sing-monitor');s.monitorSerial=(s.monitorSerial||0)+1;const serial=s.monitorSerial;input.checked=enabled;document.querySelectorAll('[data-monitor-toggle]').forEach(b=>b.setAttribute('aria-pressed',String(enabled)));
 if(s.run){s.run.monitor.gain.setTargetAtTime(enabled?1:0,s.ctx.currentTime,.015);return;}stopStandbyMonitor(s);if(!enabled){setSingStatus('모니터링을 껐어요.');return;}
 try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('마이크를 사용할 수 없어요.');const ready=prepareVocalContext(s).then(ctx=>({ctx}),error=>({error}));const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});if(sing!==s||serial!==s.monitorSerial||document.hidden){stream.getTracks().forEach(t=>t.stop());return;}const monitor={stream,effects:[]};s.standbyMonitor=monitor;const prepared=await ready;if(prepared.error)throw prepared.error;const ctx=prepared.ctx;if(ctx.state!=='running')throw new Error('오디오가 일시정지됐어요. 모니터링을 다시 눌러주세요.');if(sing!==s||serial!==s.monitorSerial||document.hidden){stream.getTracks().forEach(t=>t.stop());if(s.standbyMonitor===monitor)stopStandbyMonitor(s);return;}const mic=ctx.createMediaStreamSource(stream),gain=ctx.createGain();gain.gain.value=s.mix.voice;gain.connect(ctx.destination);Object.assign(s.standbyMonitor,{mic,gain,effects:connectEffects(ctx,mic,gain,s.mix)});setSingStatus('이어폰 모니터링 중 · 녹음은 아직 시작하지 않았어요.');}
 catch(e){if(serial===s.monitorSerial)stopStandbyMonitor(s);if(sing===s&&serial===s.monitorSerial){input.checked=false;document.querySelectorAll('[data-monitor-toggle]').forEach(b=>b.setAttribute('aria-pressed','false'));setSingStatus(e.name==='NotAllowedError'?'모니터링하려면 마이크 권한을 허용해주세요.':e.message||'모니터링을 시작하지 못했어요.');}}
}

function showPunchComplete(s,range){
 if(sing!==s)return;const dlg=$('#dialog');
 dialog(`<div class="punch-complete"><span class="punch-complete-icon">${studioIcon('check')}</span><h2>선택 구간 녹음을 마쳤어요</h2><p><strong>${preciseTime(range.start)} – ${preciseTime(range.end)}</strong><br>편집 화면으로 돌아갈까요?<br>같은 구간을 다시 녹음할 수도 있어요.</p><div class="punch-complete-actions"><button type="button" class="small-button" data-punch-again>${icon('restart')} 다시 녹음</button><button type="button" class="primary-button" data-punch-edit>편집 화면으로</button></div></div>`);
 dlg.classList.add('punch-complete-dialog');let retry=false;
 dlg.addEventListener('close',()=>{dlg.classList.remove('punch-complete-dialog');if(sing!==s||retry)return;s.editingRecording=false;renderSingPanel();drawLyrics(s.cursor);},{once:true});
 $('[data-punch-edit]').onclick=()=>dlg.close();
 $('[data-punch-again]').onclick=async()=>{if(sing!==s||singBusy(s))return;retry=true;dlg.close();s.punchRange={...range};s.selection={...range};s.editingRecording=true;s.cursor=range.start;updateTransport();drawLyrics(s.cursor);await startSinging();};
 $('[data-punch-edit]').focus();
}
