// Native bridge and browser recorder share the same song/MR permissions and cover upload API.
let sing=null,routeSing=null;
const K=()=>window.AifectKaraoke;
function studioIcon(name){const path={pause:'M8 5v14M16 5v14',check:'m5 12 4 4 10-10',original:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M6 6l12 12',hall:'M4 20V4h16v16M8 4v16M16 4v16M3 20h18M8 8h8',headphones:'M4 13v-1a8 8 0 0 1 16 0v1M4 12H2v8h4v-8Zm16 0h2v8h-4v-8Z'}[name];return path?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>':icon(name);}
const nativeSinging=()=>window.Capacitor?.isNativePlatform?.()&&window.Capacitor.Plugins?.AifectKaraoke;
const singBusy=s=>['loading','stopping','exporting'].includes(s?.state);
const singLive=s=>['singing','preroll'].includes(s?.state);
function releaseRun(run){
 if(!run)return;run.src.onended=null;try{run.src.stop();}catch{}
 run.stream?.getTracks().forEach(t=>t.stop());for(const n of [run.mic,run.node,run.mute,run.monitor,run.gain,run.voiceGain,...(run.effects||[])])try{n?.disconnect();}catch{}
}
function cleanupSing(){
 const s=sing;if(!s)return;if($('#dialog').classList.contains('record-settings-dialog'))$('#dialog').close();sing=null;s.abort?.abort();clearTimeout(s.scrollTimer);clearTimeout(s.draftTimer);cancelAnimationFrame(s.frame);
 releaseRun(s.run);s.preview?.forEach(n=>{try{n.stop();}catch{}});s.wake?.release?.().catch(()=>{});s.ctx?.close().catch(()=>{});
}
function karaokeListHTML(tracks,duets=[]){
 remember([...tracks,...duets]);return '<a class="small-button" href="#karaoke/drafts">초안</a>'+duetLobbyHTML(duets)+heading('노래방','마이크와 이어폰을 준비하고 MR·가사와 함께 불러보세요.')+(tracks.length?`<div class="track-list">${tracks.map((t,i)=>`<div class="live-track"><span class="track-rank">${i+1}</span>${cover(t,'mini-cover')}<div class="track-info"><a href="#song/${t.id}"><strong>${esc(t.title)}</strong></a><span>${credits(t)}</span></div><span class="track-time">${time(t.duration)}</span><a class="small-button" href="#sing/${t.id}">${icon('mic')} 부르기</a></div>`).join('')}</div>`:'<p class="surface empty-note">아직 부를 수 있는 곡이 없어요.</p>');
}
function singHTML(d){
 const t=d.track;
 return heading('노래 부르기','가사를 보고 바로 시작하세요')+`<section class="surface sing" id="sing"><div class="sing-head">${cover(t,'mini-cover')}<div><strong>${esc(t.title)}</strong><span>${esc(t.artist)} · ${esc(t.producer)}</span></div><button type="button" class="sing-favorite ${liked(t.id)?'is-active':''}" data-like="${esc(t.id)}" aria-pressed="${liked(t.id)}" aria-label="좋아요">${icon('heart')}</button></div><div class="sing-recording">
 ${singModeHTML(d)}<div id="duet-guide"></div>${d.mode==='duet'?'<div class="duet-legend" aria-label="듀엣 파트 색상"><span class="duet-mine">● 내 파트</span><span class="duet-partner">● 파트너 파트</span></div>':''}
 <div class="sing-stage-title"><span>가사</span><small>현재 줄은 크게, 다음 줄은 미리 보여요</small></div><div class="sing-wheel" id="sing-wheel" aria-label="가사와 녹음 위치" tabindex="0">${(d.words||[]).map((line,i)=>`<button type="button" data-sing-line="${i}" data-second="${line.s}" aria-label="${time(line.s)} ${esc(line.w.map(w=>w.t).join(' '))}"><small>${time(line.s)}</small><span>${line.w.map((w,j)=>`<span data-word="${j}">${esc(w.t)}</span>`).join(' ')}</span></button>`).join('')||'<p class="field-help">아래 위치 막대로 부를 구간을 골라주세요.</p>'}</div>
 <div class="sing-progress"><input class="sing-seek" id="sing-seek" type="range" min="0" max="${t.duration}" step=".05" value="0" aria-label="노래 위치"><div class="sing-time"><span id="sing-now">0:00</span><span id="sing-duration">${time(t.duration)}</span></div></div>
 <div class="sing-live-tools"><label class="sing-monitor"><span>${studioIcon('headphones')} 모니터</span><input id="sing-monitor" type="checkbox" role="switch" aria-label="이어폰으로 내 목소리 듣기"></label><button type="button" data-sing-settings>${icon('sliders')}<span>믹서</span></button><span class="sing-lyric-size-label">Aa<span>가사 크기</span></span></div>${lyricSizeControlsHTML()}
 <label class="sing-mic-meter"><span>마이크</span><progress id="mic-level" max="1" value="0" aria-label="마이크 입력 크기"></progress></label>
 <div class="sing-transport studio-transport"><button type="button" data-sing-pause disabled>${studioIcon('pause')}<span>일시정지</span></button><button type="button" data-sing-start class="studio-record">${icon('mic')}<span>녹음 시작</span></button><button type="button" data-sing-redo-live>${icon('repeat')}<span>다시 시작</span></button><button type="button" data-sing-stop disabled>${studioIcon('check')}<span>끝내기</span></button></div>
 <button type="button" class="small-button" data-sing-review hidden>후작업으로 돌아가기</button><details class="studio-advanced"><summary>녹음 위치 변경 안내</summary><p class="field-help">가사를 밀거나 눌러 위치를 골라요. 녹음 중 이동하면 3초 전 반주부터 이어 부르고, 선택 지점 뒤의 녹음은 교체돼요.</p></details></div><p class="sing-status" id="sing-status" role="status">가사를 확인하고 녹음을 시작하세요.</p><div id="sing-panel">${singStartHTML()}</div>
 <p class="field-help sing-local-note">녹음과 효과는 현재 기기에 임시저장돼요. 같은 곡에서 이어 편집할 수 있어요.</p></section>`;
}
const singStartHTML=(message='')=>`<p class="field-help">${nativeSinging()?'에코 · 룸 리버브와 실시간 이어폰 청음을 지원해요. 유선·USB 이어폰을 권장해요.':'유선·USB 이어폰을 권장해요. 스피커의 반주가 마이크에 섞이면 싱크 확인이 어려워요.'}</p>${message?`<p class="form-error">${esc(message)}</p>`:''}${nativeSinging()?`<button class="primary-button" data-sing-start>${icon('mic')} 노래방 열기</button>`:''}`;
function bindSing(id){
 cleanupSing();if(!$('#sing')||!routeSing)return;
 sing={id,owner:me?.id,data:routeSing,state:'loading',cursor:0,mix:K().defaultVocalMix(),mode:routeSing.mode||'solo',part:routeSing.part||'male',parent:routeSing.duet?.parent_id||null};if(sing.parent)sing.mix.mr=1;sing.duetGuide=sing.parent?routeSing.duet?.guide||null:{version:1,mode:'free',lines:[]};
 const s=sing,wheel=$('#sing-wheel'),seek=$('#sing-seek');
 document.querySelectorAll('[data-sing-mode]').forEach(button=>button.onclick=async()=>{
  const mode=button.dataset.singMode;if(sing!==s||singBusy(s)||singLive(s)||s.parent||mode===s.mode)return;
  try{stopPreview();await saveSingDraft(s);if(sing===s)location.hash='sing/'+encodeURIComponent(s.id)+'?mode='+mode;}catch{setSingStatus('녹음을 임시저장하지 못했어요. 다시 시도해주세요.');}
 });
 const begin=()=>{if(sing!==s||singBusy(s)||s.scrubbing)return;s.scrubbing=true;s.resumeMode=singLive(s)?'record':s.state==='playing'?'play':s.state==='guide'?'guide':null;s.settling=singLive(s)?finishSinging():Promise.resolve();if(s.preview)stopPreview();};
 const select=t=>{if(sing!==s)return;begin();s.cursor=clampPosition(t,s.resumeMode==='play');drawLyrics(s.cursor,false);};
 const end=async()=>{
  if(!s.scrubbing)return;const target=s.cursor,mode=s.resumeMode;s.scrubbing=false;await s.settling;if(sing!==s||s.scrubbing)return;s.cursor=target;drawLyrics(target);if(document.hidden)return;
  if(mode==='record')startSinging();else if(mode==='play')previewMix(target);else if(mode==='guide')previewGuide(target);
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
 $('#sing-monitor').onchange=e=>{if(s.run)s.run.monitor.gain.value=e.target.checked ? .25 : 0;};
 document.querySelectorAll('[data-lyric-size]').forEach(button=>button.onclick=()=>applyLyricSize(button.dataset.lyricSize));applyLyricSize(preferredLyricSize());
 // The favorite uses the shared data-like handler, so it is saved to the account.
 const redoLive=$('[data-sing-redo-live]');if(redoLive)redoLive.onclick=async()=>{if(singLive(s))await finishSinging();if(sing!==s)return;s.cursor=0;s.shownLine=-1;drawLyrics(0);setSingStatus('처음부터 다시 시작할 준비가 됐어요.');};
 renderDuetGuide();drawLyrics(0);renderSingPanel();void restoreSingDraft(s);
}
function setSingStatus(message){const el=$('#sing-status');if(el)el.textContent=message;}
function clampPosition(t,review=false){return Math.max(0,Math.min(t,review&&sing.voice&&sing.mode!=='duet'?sing.voice.duration:sing.mr?.duration||sing.data.track.duration));}
function updateTransport(){
 if(!sing)return;const s=sing,locked=singBusy(s),live=singLive(s),preview=$('[data-sing-preview]'),pause=$('[data-sing-pause]'),guide=$('[data-sing-guide]');
 if(preview)preview.disabled=locked||live||!s.voice||s.state==='playing';if(pause)pause.disabled=locked||!(live||s.preview);if(guide)guide.disabled=locked||live;
 document.querySelectorAll('[data-sing-start],[data-sing-save],[data-sing-mode],#sing-upload-form button,[data-duet-method],[data-duet-reanalyze],[data-duet-line]').forEach(b=>b.disabled=locked||live);
 const reviewing=!!s.voice&&!s.editingRecording&&!live;$('#sing').classList.toggle('is-reviewing',reviewing);$('#sing').classList.toggle('is-live',live);$('#sing').classList.toggle('is-idle',!live&&!reviewing);if(reviewing&&['녹음 시작을 누르면 마이크 권한을 요청해요.','가사를 확인하고 녹음을 시작하세요.'].includes($('#sing-status').textContent))$('#sing-status').textContent='';$('.sing-recording').hidden=reviewing;$('#sing-panel').hidden=!!s.voice&&!reviewing;const back=$('[data-sing-review]');back.hidden=!s.voice;const player=$('.studio-audio');if(player){player.querySelector('[data-sing-preview]').hidden=s.state==='playing';player.querySelector('[data-sing-pause]').hidden=s.state!=='playing';}$('#sing-seek').disabled=locked;const start=$('.sing-transport [data-sing-start]'),stop=$('.sing-transport [data-sing-stop]');if(start){start.hidden=false;start.querySelector('span').textContent=s.voice?'이어 부르기':'녹음 시작';}if(stop){stop.hidden=false;stop.disabled=locked||!live;}
}
async function prepareSing(s){
 if(!window.AudioContext&&!window.webkitAudioContext)throw new Error('이 브라우저는 녹음을 지원하지 않아요. 최신 Chrome, Edge 또는 Safari에서 열어주세요.');
 const ctx=s.ctx||(s.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:K().MIX_RATE,latencyHint:'interactive'}));await ctx.resume();
 if(!s.mr){s.abort=new AbortController();const r=await fetch(s.data.mr,{credentials:'same-origin',signal:s.abort.signal});if(!r.ok)throw new Error('반주를 불러오지 못했어요. 다시 로그인하고 시도해주세요.');s.mr=await ctx.decodeAudioData(await r.arrayBuffer());}
 if(s.mr.duration>600)throw new Error('10분 이하 곡만 녹음할 수 있어요.');
 if(!s.vocalWorklet){await ctx.audioWorklet.addModule('/vocal-worklet.js?v=20260930-presets');s.vocalWorklet=true;}
 return ctx;
}
async function startSinging(){
 if(!sing||singBusy(sing)||singLive(sing))return;
 if(nativeSinging()){
  const s=sing;++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';$('#sing-panel').innerHTML='<p class="field-help">노래방을 열고 있어요…</p>';
  try{const result=await nativeSinging().open({trackId:s.id,coverMode:s.mode,duetPart:s.part,duetParentId:s.parent||''});if(result.uploadedId){if(sing===s)cleanupSing();toast('커버곡을 올렸어요! 변환이 끝나면 공개돼요.');location.hash='studio';return;}if(sing===s){s.state='idle';$('#sing-panel').innerHTML=singStartHTML();}}
  catch(e){if(sing===s){s.state='idle';$('#sing-panel').innerHTML=singStartHTML(e.message||'노래방을 열지 못했어요.');}}return;
 }
 const s=sing;let stream,run;stopPreview();++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';updateTransport();setSingStatus('반주와 마이크를 준비하고 있어요…');
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
  run={stream,mic,node,mute,monitor,src,chunks,recordAt,from,t0:ctx.currentTime+.15};s.run=run;
  mute.gain.value=0;monitor.gain.value=$('#sing-monitor').checked ? .25 : 0;mic.connect(node);node.connect(mute).connect(ctx.destination);monitor.connect(ctx.destination);run.voiceGain=ctx.createGain();run.voiceGain.gain.value=s.mix.voice;run.voiceGain.connect(monitor);run.effects=connectEffects(ctx,mic,run.voiceGain,s.mix);
  node.port.onmessage=e=>{if(e.data==='done')run.flushed?.();else if(e.data?.d instanceof Float32Array){chunks.push(e.data);run.peak=Math.max(run.peak||0,e.data.peak||0);const meter=$('#mic-level');if(meter)meter.value=Math.min(1,(e.data.peak||0)*4);}};
  src.buffer=s.mr;const gain=ctx.createGain();run.gain=gain;gain.gain.value=s.mix.mr;src.connect(gain).connect(ctx.destination);src.start(run.t0,from);
  stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(sing===s&&singLive(s)){finishSinging();}}));
  s.state=from<recordAt?'preroll':'singing';s.dirty=true;s.revision=(s.revision||0)+1;src.onended=()=>{if(sing===s&&singLive(s))finishSinging();};
  $('#sing-panel').innerHTML=roomControlHTML(s.mix)+'<div class="inline-actions"><button class="small-button" data-sing-stop>그만 부르고 확인</button></div>';bindMixControls();updateTransport();
  try{s.wake=await navigator.wakeLock?.request('screen');if(sing!==s||!singLive(s))s.wake?.release?.().catch(()=>{});}catch{}
  const tick=()=>{if(sing!==s||!singLive(s))return;const t=Math.min(s.mr.duration,from+Math.max(0,ctx.currentTime-run.t0));s.state=t<recordAt?'preroll':'singing';s.cursor=t;setSingStatus(t<recordAt?`반주 먼저 듣기 · ${Math.ceil(recordAt-t)}초 뒤 녹음 시작`:'녹음 중 · 가사를 밀면 그 위치부터 다시 불러요.');drawLyrics(t<recordAt?recordAt:t);s.frame=requestAnimationFrame(tick);};tick();
 }catch(e){releaseRun(run);stream?.getTracks().forEach(t=>t.stop());if(sing===s){s.run=null;s.state=s.voice?'review':'idle';renderSingPanel();setSingStatus(e.name==='NotAllowedError'?'마이크 권한을 허용한 뒤 다시 시작해주세요.':e.message||'녹음을 시작하지 못했어요.');}}
}
function drawLyrics(t,follow=true){
 if(!sing)return;const s=sing,review=s.state==='playing'||s.state==='review',duration=review&&s.voice&&s.mode!=='duet'?s.voice.duration:s.mr?.duration||s.data.track.duration,at=K().wordAt(s.data.words||[],t);
 $('#sing-now').textContent=time(Math.max(0,t));document.querySelectorAll('[data-review-now]').forEach(v=>v.textContent=time(Math.max(0,t)));const reviewSeek=$('.studio-wave-seek');if(reviewSeek)reviewSeek.value=t;drawTakeWaveform();$('#sing-duration').textContent=time(duration);const seek=$('#sing-seek');seek.max=duration;seek.value=Math.min(duration,Math.max(0,t));seek.style.setProperty('--position',(100*Number(seek.value)/Math.max(1,duration))+'%');seek.classList.toggle('duet-seek',s.mode==='duet');
 const wheel=$('#sing-wheel'),row=wheel.querySelector(`[data-sing-line="${at.line}"]`);
 wheel.querySelectorAll('[data-sing-line]').forEach(el=>{el.classList.toggle('current',el===row);el.setAttribute('aria-current',el===row?'true':'false');});
 row?.querySelectorAll('[data-word]').forEach((el,i)=>{el.classList.toggle('sung',i<at.word);el.classList.toggle('singing',i===at.word);el.style.setProperty('--p',i===at.word?at.progress:0);});
 if(follow&&!s.scrubbing&&at.line!==s.shownLine){s.shownLine=at.line;if(row)wheel.scrollTop=Math.max(0,row.offsetTop+row.offsetHeight/2-wheel.clientHeight*.35);}
}
async function finishSinging(){
 const s=sing;if(!singLive(s))return;const run=s.run,ctx=s.ctx,end=Math.min(s.mr.duration,run.from+Math.max(0,ctx.currentTime-run.t0));s.state='stopping';cancelAnimationFrame(s.frame);updateTransport();setSingStatus('녹음한 구간을 정리하고 있어요…');
 run.src.onended=null;try{run.src.stop();}catch{}run.monitor.gain.value=0;
 await new Promise(resolve=>{const timer=setTimeout(resolve,600);run.flushed=()=>{clearTimeout(timer);resolve();};run.node.port.postMessage('stop');});releaseRun(run);s.wake?.release?.().catch(()=>{});
 if(sing!==s)return;
 if(end>run.recordAt+.1&&!run.chunks.length){s.run=null;s.state=s.voice?'review':'idle';renderSingPanel();setSingStatus('마이크 입력을 받지 못했어요. 브라우저의 마이크 장치를 확인해주세요. 기존 녹음은 보존했어요.');return;}
 const samples=K().mergeTake(s.voice?.getChannelData(0),run.chunks,run.t0+run.recordAt-run.from,ctx.sampleRate,run.recordAt,end);
 if(samples.length){s.voice=ctx.createBuffer(1,samples.length,ctx.sampleRate);s.voice.copyToChannel(samples,0);s.processed=null;}
 s.run=null;refreshVocalGuide(s);renderDuetGuide();s.cursor=s.voice?.duration||run.recordAt;s.state=s.voice?'review':'idle';renderSingPanel();drawLyrics(s.cursor);setSingStatus(s.voice?`${time(s.voice.duration)} 녹음했어요. 들어보고 싱크·효과를 조절하세요.`:'녹음 시작 전에 멈췄어요. 기존 녹음은 그대로예요.');
 if(s.voice){try{await saveSingDraft(s);}catch{setSingStatus('녹음은 남아 있지만 임시저장하지 못했어요. 저장 공간을 확인해주세요.');}if((run.peak||0)<.00001)setSingStatus('마이크 소리가 감지되지 않았어요. 선택한 마이크와 음소거 설정을 확인하고 다시 불러주세요.');}
}
function studioRangeHTML(m,key,label,min,max,step,unit='%'){
 return `<label class="studio-range"><span><b class="studio-control-name">${['voice','mr','size','echo','room'].includes(key)?studioControlIcon(key):''}${label}</b><output data-mix-label="${key}">${mixLabel(key,m[key])}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${m[key]}" data-mix="${key}" aria-label="${label}"></label>`;
}
function studioControlIcon(key){const shape={voice:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',mr:'<path d="M9 18V5l12-3v13M9 8l12-3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="15" r="3"/>',size:'<path d="M12 2 3 7v10l9 5 9-5V7ZM3 7l9 5 9-5M12 12v10"/>',echo:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',room:'<path d="M4 9v6M8 5v14M12 2v20M16 5v14M20 9v6"/>'}[key]||'';return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">'+shape+'</svg>';}
function soundControlHTML(m,review=false){if(review)return '<div class="studio-sound">'+studioRangeHTML(m,'voice','내 목소리',0,2,.01)+studioRangeHTML(m,'mr',sing?.parent?'먼저 녹음한 목소리 + 반주':'반주',0,1.5,.01)+'</div>';return `<div class="studio-sound"><h3>소리 크기</h3>${studioRangeHTML(m,'voice','내 목소리',0,2,.01)}${studioRangeHTML(m,'mr',sing?.parent?'먼저 녹음한 목소리 + 반주':'반주',0,1.5,.01)}<div class="studio-noise"><h3>잡음 제거</h3>${studioRangeHTML(m,'noise','잡음 제거 단계',0,4,1)}<div class="studio-ticks">${['1 낮음','2 약','3 보통','4 강','5 최대'].map(t=>`<span>${t}</span>`).join('')}</div></div></div>`;}
const roomControlHTML=m=>`<section class="studio-reverb"><h3>리버브 추천 설정</h3><div class="sing-presets" role="group" aria-label="목소리 효과 선택">${K().vocalPresets.map(p=>`${vocalPresetButtonHTML(p.id,p.name,m.preset===p.id)}`).join('')}${vocalPresetButtonHTML('custom','사용자 설정',m.preset==='custom')}</div><p class="field-help" data-preset-description></p><div data-preset-strength>${studioRangeHTML(m,'strength','프리셋 강도',0,1,.01)}</div><details class="sing-effect-details" data-custom-controls><summary>리버브 조절 · 사용자 설정</summary>${studioRangeHTML(m,'size','룸 크기',0,1,.01)}${studioRangeHTML(m,'echo','에코 크기',0,.65,.01)}${studioRangeHTML(m,'room','리버브 강도',0,1,.01)}<details class="studio-advanced"><summary>음색 보정</summary>${studioRangeHTML(m,'tone','음색 보정',0,1,.01)}</details></details></section>`;
function postRoomControlHTML(m){return '<section class="studio-reverb studio-post-reverb"><p>적용된 리버브 효과를 확인하고 조절해 보세요.</p><h4>추천 설정</h4><div class="sing-presets" role="group" aria-label="목소리 효과 선택">'+K().vocalPresets.map(p=>vocalPresetButtonHTML(p.id,p.name,m.preset===p.id)).join('')+vocalPresetButtonHTML('custom','사용자 설정',m.preset==='custom')+'</div><div data-post-custom>'+studioRangeHTML(m,'size','룸 크기',0,1,.01)+studioRangeHTML(m,'echo','에코 크기',0,.65,.01)+studioRangeHTML(m,'room','효과 강도',0,1,.01)+'</div><div data-preset-strength>'+studioRangeHTML(m,'strength','효과 강도',0,1,.01)+'</div><details class="studio-tone"><summary>음색 보정</summary>'+studioRangeHTML(m,'tone','음색 보정',0,1,.01)+'</details></section>';}
const reviewHTML=m=>`<div class="sing-review studio-post"><h2>녹음이 완료되었습니다!</h2><p class="field-help">후작업을 진행해 주세요.</p><div class="studio-audio"><button type="button" class="studio-play" data-sing-preview aria-label="녹음 들어보기">${icon('play')}</button><button type="button" class="studio-play" data-sing-pause aria-label="녹음 일시정지" hidden>${studioIcon('pause')}</button><div><canvas id="take-waveform" height="90" aria-label="녹음 파형"></canvas><div class="sing-time"><span data-review-now>0:00</span><span data-review-duration>${time(sing?.mode==='duet'?sing?.mr?.duration||0:sing?.voice?.duration||0)}</span></div><input class="studio-wave-seek" type="range" min="0" max="${sing?.mode==='duet'?sing?.mr?.duration||0:sing?.voice?.duration||0}" value="${sing?.cursor||0}" step=".05" aria-label="녹음 재생 위치"></div></div>
 <section class="studio-step studio-sync"><h3>1. 싱크 조절</h3><p>내 목소리와 반주의 싱크를 맞춰주세요.</p><div class="studio-sync-scale"><span>${Math.min(-200,m.offset)}ms</span><output data-mix-label="offset">${mixLabel('offset',m.offset)}</output><span>+${Math.max(200,m.offset)}ms</span></div>${studioRangeHTML(m,'offset','목소리 싱크',Math.min(-200,m.offset),Math.max(200,m.offset),5)}</section>
 <section class="studio-step"><h3>2. 볼륨 밸런스 확인</h3><p>최종 볼륨 밸런스를 확인해 주세요.</p>${soundControlHTML(m,true)}</section><section class="studio-step"><h3>3. 리버브 효과</h3>${postRoomControlHTML(m)}</section>
 <section class="studio-step"><h3>4. 저장 및 게시</h3><p>저장 후 내 노래방에서 확인할 수 있습니다.</p><form id="sing-upload-form" class="upload-form"><div class="studio-save-actions"><button type="button" class="small-button" data-sing-redo>${icon('repeat')} 다시 부르기</button><button type="button" class="small-button" data-sing-draft>임시 저장</button><button type="submit" class="primary-button">저장 후 게시</button></div><details class="studio-publication"><summary>게시 정보 · 권리 확인</summary><label class="form-field">커버 소개 (선택)<textarea name="description" maxlength="1000" placeholder="어떤 마음으로 불렀는지 들려주세요."></textarea></label><label class="checkbox-line rights-check"><input name="own_voice" type="checkbox" required><span>제가 직접 부른 녹음이며 AI 음성 복제가 아닙니다.</span></label>${sing?.mode==='duet'&&!sing.parent?'<label class="checkbox-line rights-check"><input name="duet_consent" type="checkbox" required><span>다른 사람이 빈 파트에 목소리를 더하는 것에 동의합니다.</span></label>':''}<label class="checkbox-line rights-check"><input name="rights" type="checkbox" required><span>원곡자의 허용 범위 안에서 공개할 권리가 있습니다.</span></label></details><div class="upload-progress" hidden><progress max="100" value="0"></progress><p role="status"></p></div><p class="form-error" role="alert"></p></form><details class="studio-advanced"><summary>세부 설정 · 파일 저장 · 초안 관리</summary><div class="inline-actions"><button type="button" class="small-button" data-sing-settings>잡음 · 세부 설정</button><button class="small-button" data-sing-save>${member.plan==='premium'?'부른 구간 파일로 저장':'Premium으로 파일 저장'}</button><button class="small-button" data-discard-draft>초안 삭제</button></div><p class="field-help">초안은 현재 기기에서 이어 편집할 수 있어요.</p></details></section></div>`;
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
 const total=s.mode==='duet'?(s.mr?.duration||s.data.track.duration):s.voice.duration,bins=96,rect=canvas.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width*devicePixelRatio)),now=performance.now();if(!total||!rect.width)return;
 if(!s.wavePeaks||s.waveSource!==s.voice||s.waveDuration!==total){const data=s.voice.getChannelData(0);s.wavePeaks=new Float32Array(bins);for(let i=0;i<bins;i++){const begin=Math.floor(i*total*s.voice.sampleRate/bins),end=Math.min(data.length,Math.floor((i+1)*total*s.voice.sampleRate/bins));for(let j=begin;j<end;j+=Math.max(1,Math.floor((end-begin)/256)))s.wavePeaks[i]=Math.max(s.wavePeaks[i],Math.abs(data[j]));}s.waveSource=s.voice;s.waveDuration=total;}
 if(s.waveCanvas===canvas&&canvas.width===width&&now-(s.waveDrawAt||0)<80&&Math.abs(s.cursor-(s.waveCursor||0))<.2)return;s.waveCanvas=canvas;s.waveDrawAt=now;s.waveCursor=s.cursor;if(canvas.width!==width)canvas.width=width;
 if(!canvas.dataset.bound){canvas.dataset.bound='1';canvas.tabIndex=0;canvas.setAttribute('role','slider');canvas.setAttribute('aria-valuemin','0');canvas.setAttribute('aria-valuemax',String(total));canvas.setAttribute('aria-label','녹음 재생 위치');const seek=e=>{const r=canvas.getBoundingClientRect(),at=Math.max(0,Math.min(total,(e.clientX-r.left)/r.width*total));if(sing.state==='playing')previewMix(at);else{sing.cursor=at;drawLyrics(at);}};canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);seek(e);};canvas.onpointermove=e=>{if(e.buttons)seek(e);};canvas.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const at=Math.max(0,Math.min(total,sing.cursor+(e.key==='ArrowRight'?1:-1)));if(sing.state==='playing')previewMix(at);else{sing.cursor=at;drawLyrics(at);}}};}canvas.setAttribute('aria-valuenow',String(s.cursor));
 const ctx=canvas.getContext('2d'),step=width/bins;ctx.clearRect(0,0,width,90);for(let i=0;i<bins;i++){ctx.strokeStyle=i/bins<=s.cursor/total?'#f2a1c6':'#79546d';ctx.lineWidth=Math.max(1,step*.4);const h=Math.max(1,s.wavePeaks[i]*40);ctx.beginPath();ctx.moveTo((i+.5)*step,45-h);ctx.lineTo((i+.5)*step,45+h);ctx.stroke();}ctx.strokeStyle='#f2a1c6';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(width*s.cursor/total,0);ctx.lineTo(width*s.cursor/total,90);ctx.stroke();
}

function mixLabel(key,value){return key==='offset'?`${value}ms`:key==='noise'?`${value+1}단계`:`${Math.round(value*100)}%`;}
function renderSingPanel(){
 $('#sing-panel').innerHTML=sing.voice?reviewHTML(sing.mix):singStartHTML();bindMixControls();if(sing.voice){bindReview();const seek=$('.studio-wave-seek');seek.oninput=()=>{const at=Number(seek.value);if(sing.state==='playing')previewMix(at);else{sing.cursor=at;drawLyrics(at);} };drawTakeWaveform();}updateTransport();
}
function refreshEffectControls(){
 const m=sing.mix;document.querySelectorAll('[data-post-custom]').forEach(v=>v.hidden=m.preset!=='custom');document.querySelectorAll('[data-custom-controls]').forEach(v=>v.open=m.preset==='custom');document.querySelectorAll('[data-preset-strength]').forEach(v=>v.hidden=m.preset==='custom');document.querySelectorAll('[data-vocal-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.vocalPreset===m.preset)));
 document.querySelectorAll('[data-mix]').forEach(input=>{const k=input.dataset.mix;input.value=m[k]??.5;document.querySelectorAll('[data-mix-label="'+k+'"]').forEach(v=>v.textContent=mixLabel(k,m[k]??.5));input.disabled=singBusy(sing)||k==='strength'&&['original','custom'].includes(m.preset);});
 document.querySelectorAll('[data-preset-description]').forEach(note=>note.textContent=K().vocalPresets.find(p=>p.id===m.preset)?.description||'사용자 설정 · 직접 조절한 효과를 사용하고 있어요.');
}
function applyMixChange(key){const s=sing;if(!s.settingsOpen)queueSingDraft(s);s.run?.effects?.update(s.mix);if(s.run){s.run.voiceGain.gain.setTargetAtTime(s.mix.voice,s.ctx.currentTime,.015);s.run.gain.gain.setTargetAtTime(s.mix.mr,s.ctx.currentTime,.015);}if(s.state==='playing'){if(key==='offset')previewMix(s.ctx.currentTime-s.previewAt);else s.previewMixUpdate?.(s.mix);}if(key==='offset'){refreshVocalGuide(s);renderDuetGuide();}refreshEffectControls();}
function bindMixControls(){
 document.querySelectorAll('[data-vocal-preset]').forEach(button=>button.onclick=()=>{if(singBusy(sing))return;sing.mix=K().presetMix(sing.mix,button.dataset.vocalPreset,.5);applyMixChange('preset');});
 document.querySelectorAll('[data-vocal-noise]').forEach(button=>button.onclick=()=>{if(singBusy(sing))return;sing.mix=K().editVocalMix(sing.mix,'noise',Number(button.dataset.vocalNoise));applyMixChange('noise');});
 document.querySelectorAll('[data-mix]').forEach(input=>input.oninput=()=>{if(singBusy(sing))return;const s=sing,k=input.dataset.mix;if(k==='strength')s.mix=K().presetMix(s.mix,s.mix.preset,Number(input.value));else s.mix=K().editVocalMix(s.mix,k,Number(input.value));applyMixChange(k);});
 refreshEffectControls();
}
function bindReview(){
 const form=$('#sing-upload-form');form.addEventListener('invalid',()=>{form.querySelector('.studio-publication').open=true;},true);form.elements.description.value=sing.description||'';form.elements.description.oninput=()=>{sing.description=form.elements.description.value;queueSingDraft(sing);};form.onsubmit=busyForm(form,uploadSung);
}
function voiceBuffer(s){
 const key=JSON.stringify([s.mix.noise,s.mix.echo,s.mix.room,s.mix.size,s.mix.tone]);if(s.processed?.key===key&&s.processed.source===s.voice)return s.processed.buffer;
 const buffer=s.ctx.createBuffer(1,s.voice.length,s.voice.sampleRate);buffer.copyToChannel(K().renderVocals(s.voice.getChannelData(0),s.voice.sampleRate,s.mix),0);s.processed={key,source:s.voice,buffer};return buffer;
}
function connectEffects(ctx,source,destination,m){
 const fx=new AudioWorkletNode(ctx,'aifect-vocal',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit',processorOptions:{mix:m}});source.connect(fx).connect(destination);const nodes=[fx];nodes.update=m=>fx.port.postMessage(m);return nodes;
}
function scheduleMix(ctx,from,at,s=sing){
 const end=s.mode==='duet'?s.mr.duration:s.voice.duration,remaining=end-from;if(remaining<=0)throw new Error('다시 들을 위치를 골라주세요.');
 const m=s.mix,shift=m.offset/1000,g={mr:ctx.createGain(),voice:ctx.createGain()};g.mr.gain.value=m.mr;g.voice.gain.value=m.voice;g.mr.connect(ctx.destination);g.voice.connect(ctx.destination);
 const a=ctx.createBufferSource(),b=ctx.createBufferSource();a.buffer=s.mr;const offline=typeof ctx.startRendering==='function';b.buffer=offline?voiceBuffer(s):s.voice;a.connect(g.mr);const effects=offline?[]:connectEffects(ctx,b,g.voice,m);if(offline)b.connect(g.voice);a.start(at,from,remaining);
 const v=from+shift,delay=Math.max(0,-v),available=Math.min(remaining-delay,s.voice.duration-Math.max(0,v));if(available>0)b.start(at+delay,Math.max(0,v),available);
 return {sources:[a,b],nodes:[...effects,g.mr,g.voice],updateMix:m=>{effects.update?.(m);g.mr.gain.setTargetAtTime(m.mr,ctx.currentTime,.015);g.voice.gain.setTargetAtTime(m.voice,ctx.currentTime,.015);}};
}
function stopPreview(){
 const s=sing;if(!s)return;if(s.previewAt!=null)s.cursor=clampPosition(s.ctx.currentTime-s.previewAt,s.state==='playing');
 const sources=s.preview;s.previewMixUpdate=null;s.preview=null;s.previewAt=null;sources?.forEach(n=>{n.onended=null;try{n.stop();}catch{}});s.previewNodes?.forEach(n=>n.disconnect());s.previewNodes=null;cancelAnimationFrame(s.frame);
 if(['playing','guide'].includes(s.state))s.state=s.voice?'review':'idle';
}
function runPreview(s,sources,at,from,mode,nodes=[]){
 s.preview=sources;s.previewNodes=nodes;s.previewAt=at-from;s.state=mode;updateTransport();
 sources[0].onended=()=>{if(sing===s&&s.preview===sources){stopPreview();updateTransport();drawLyrics(s.cursor);}};
 const tick=()=>{if(sing!==s||s.preview!==sources)return;s.cursor=Math.max(0,s.ctx.currentTime-s.previewAt);drawLyrics(s.cursor);s.frame=requestAnimationFrame(tick);};tick();
}
async function previewMix(from=0){
 const s=sing;if(!s?.voice||singLive(s)||singBusy(s))return;try{await prepareSing(s);}catch(e){setSingStatus(e.message);return;}if(sing!==s)return;stopPreview();s.ctx.resume();from=Math.max(0,from>=(s.mode==='duet'?s.mr.duration:s.voice.duration)-.02?0:from);const at=s.ctx.currentTime+.05,mix=scheduleMix(s.ctx,from,at);runPreview(s,mix.sources,at,from,'playing',mix.nodes);s.previewMixUpdate=mix.updateMix;setSingStatus('녹음 들어보기 · 위치를 옮겨도 재생이 이어져요.');
}
async function previewGuide(from=sing?.cursor||0){
 const s=sing;if(!s||singLive(s)||singBusy(s))return;stopPreview();++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';updateTransport();setSingStatus('원곡 가이드를 불러오고 있어요…');
 try{const ctx=await prepareSing(s);if(!s.guide){const r=await fetch(`/media/${encodeURIComponent(s.id)}/stream`,{credentials:'same-origin',signal:s.abort?.signal});if(!r.ok)throw new Error('원곡 가이드를 불러오지 못했어요.');s.guide=await ctx.decodeAudioData(await r.arrayBuffer());}if(sing!==s)return;const src=ctx.createBufferSource();src.buffer=s.guide;src.connect(ctx.destination);from=Math.max(0,Math.min(from,s.guide.duration-.05));const at=ctx.currentTime+.05;src.start(at,from);runPreview(s,[src],at,from,'guide');setSingStatus('원곡 가이드 · 일시정지 후 가사를 골라 그 위치부터 불러보세요.');}
 catch(e){if(sing===s){s.state=s.voice?'review':'idle';updateTransport();setSingStatus(e.message||'원곡을 불러오지 못했어요.');}}
}
async function renderSung(s){
 await prepareSing(s);
 const rate=K().MIX_RATE,length=Math.ceil((s.mode==='duet'?s.mr.duration:s.voice.duration)*rate),off=new OfflineAudioContext(2,length,rate);scheduleMix(off,0,0,s);const out=await off.startRendering(),channels=[out.getChannelData(0),out.getChannelData(1)],top=K().peak(channels);if(top>.98)for(const c of channels)for(let i=0;i<c.length;i++)c[i]*=.98/top;return new Blob([K().encodeWav(channels,rate)],{type:'audio/wav'});
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
  await uploadFile(`/api/uploads/${draft.id}/audio`,file,value=>{progress.querySelector('progress').value=value;note.textContent=`올리는 중 ${Math.round(value)}%`;});const completed=await api(`/api/uploads/${draft.id}/complete`,'POST');if(sing!==s)return;clearTimeout(s.draftTimer);await removeSingDraft(s);s.dirty=false;cleanupSing();toast('커버곡을 올렸어요! 변환이 끝나면 공개돼요.');location.hash='studio';if(completed.show_upload_ad)void window.AifectAudioAds?.afterCoverUpload(draft.id);
 }finally{if(sing===s){s.state='review';updateTransport();}}
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-sing-start],[data-sing-stop],[data-sing-preview],[data-sing-pause],[data-sing-guide],[data-sing-save],[data-sing-settings],[data-sing-redo],[data-sing-review]');if(!el||!sing)return;
 if(el.hasAttribute('data-sing-start'))startSinging();else if(el.hasAttribute('data-sing-stop')){sing.editingRecording=false;finishSinging();}else if(el.hasAttribute('data-sing-preview'))previewMix(sing.cursor);else if(el.hasAttribute('data-sing-pause')){if(singLive(sing)){sing.editingRecording=true;finishSinging();}else{stopPreview();updateTransport();drawLyrics(sing.cursor);setSingStatus('일시정지했어요.');}}else if(el.hasAttribute('data-sing-guide'))previewGuide();else if(el.hasAttribute('data-sing-save'))saveSung();else if(el.hasAttribute('data-sing-settings'))openSingSettings();else if(el.hasAttribute('data-sing-redo')){stopPreview();sing.editingRecording=true;sing.cursor=0;renderSingPanel();drawLyrics(0);$('#sing').scrollIntoView({block:'start'});}else if(el.hasAttribute('data-sing-review')){sing.editingRecording=false;renderSingPanel();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&singLive(sing))finishSinging();});
window.addEventListener?.('beforeunload',e=>{if(sing?.dirty||singLive(sing)||sing?.state==='exporting'){e.preventDefault();e.returnValue='';}});

function duetLobbyHTML(tracks){return `<section class="surface duet-lobby"><div class="inline-actions"><a class="small-button" href="#community/covers?mode=solo">솔로 커버 듣기</a><a class="small-button" href="#community/covers?mode=duet">듀엣 커버 듣기</a></div><h2>참여를 기다리는 듀엣</h2>${tracks.length?tracks.map(t=>`<div class="duet-invitation">${cover(t,'mini-cover')}<div><a href="#song/${esc(t.id)}"><strong>${esc(t.title)}</strong></a><p>${esc(t.producer)} · 먼저 녹음한 목소리</p></div><a class="primary-button" href="${t.user_id===me?.id?'#song/'+esc(t.id):'#sing/'+esc(t.original_id)+'?duet='+esc(t.id)}">${t.user_id===me?.id?'내 듀엣 보기':'듀엣 참여'}</a></div>`).join(''):'<p class="empty-note">아직 참여를 기다리는 듀엣이 없어요. 아래 곡을 골라 첫 파트를 남겨보세요.</p>'}</section>`;}
function singModeHTML(d){const choices=d.duet?'<strong>듀엣</strong>':`<div class="sing-mode inline-actions" role="group" aria-label="커버 녹음 종류">${['solo','duet'].map(mode=>`<button type="button" data-sing-mode="${mode}" aria-pressed="${d.mode===mode}" class="${d.mode===mode?'primary-button':'small-button'}">${mode==='solo'?'솔로':'듀엣'}</button>`).join('')}</div>`;return choices+(d.mode==='duet'?`<p class="field-help">${d.duet?esc(d.duet.partner.producer)+'의 목소리를 들으며 내 파트를 불러주세요.':'내 파트를 먼저 녹음하면 다른 사람이 이어 불러 함께 완성해요.'}</p>`:'');}

function duetTime(seconds){const n=Math.round(Math.max(0,seconds)*10);return Math.floor(n/600)+':'+String(Math.floor(n%600/10)).padStart(2,'0')+'.'+n%10;}
function refreshVocalGuide(s){if(s?.mode==='duet'&&!s.parent&&s.voice&&s.duetGuide?.mode==='free')s.duetGuide.activity=AifectDuetGuide.detectVocalActivity(s.voice.getChannelData(0),s.voice.sampleRate,s.mix.offset,s.mr?.duration||s.data.track.duration);}
function renderDuetGuide(){
 const s=sing,host=$('#duet-guide');if(!s||!host)return;const editorOpen=host.querySelector('.duet-part-editor')?.open,guideOpen=host.querySelector('.duet-guide-box')?.open;host.innerHTML='';if(s.mode!=='duet')return;
 const second=!!s.parent,guide=s.duetGuide,words=s.data.words||[],duration=s.mr?.duration||s.data.track.duration;
 const method=second?'<strong>내 파트: B · 함께</strong>':'<div class="inline-actions" role="group" aria-label="듀엣 파트 나누는 방법">'+[['free','자유 구간'],['lyrics','가사 파트 지정']].map(([id,label])=>'<button type="button" class="small-button" data-duet-method="'+id+'" aria-pressed="'+(guide?.mode===id)+'">'+label+'</button>').join('')+'</div>';
 let html='<details class="duet-guide-box"><summary>파트 지정 · 빈 구간 보기</summary>'+method+'<p class="field-help">'+(guide?.mode==='lyrics'?'A는 먼저 부르는 사람, B는 참여하는 사람, 함께는 둘 다 불러요.':guide?'목소리가 없는 구간을 자동으로 추정해요. 작은 목소리·잡음 때문에 다를 수 있어 가사별로 수정할 수 있어요.':'이전 녹음에는 구간 정보가 없어요. 목소리를 들으며 원하는 구간을 자유롭게 불러주세요.')+'</p>';
 if(guide?.mode==='free'&&guide.activity){const ranges=AifectDuetGuide.remainingRanges(guide.activity,duration);html+='<p><strong>아직 부르지 않은 구간 · 추정</strong></p><div class="inline-actions">'+ranges.slice(0,24).map(r=>'<button type="button" class="small-button" data-duet-seek="'+r.s+'">'+duetTime(r.s)+'–'+duetTime(r.e)+'</button>').join('')+(ranges.length?'':'<span>감지된 빈 구간이 없어요.</span>')+'</div>';}
 if(!second&&guide?.mode==='free'&&s.voice)html+='<button type="button" class="small-button" data-duet-reanalyze>음성 구간 다시 표시</button>';
 if(words.length&&guide){html+='<details class="duet-part-editor"><summary>'+ (second?'가사별 파트 보기':'가사별 파트 지정·수정')+'</summary>'+words.map((line,i)=>{const p=AifectDuetGuide.linePart(guide,words,i,duration);return '<div class="duet-part-row"><span>'+time(line.s)+' '+esc(line.w.map(w=>w.t).join(' '))+'</span>'+(second?'<strong>'+AifectDuetGuide.partLabel(p,true)+'</strong>':'<select data-duet-line="'+i+'" aria-label="'+esc(line.w.map(w=>w.t).join(' '))+' 파트">'+[['',guide.mode==='free'?'자동 표시':'선택'],['A','A · 내 파트'],['B','B · 다음 사람'],['both','함께']].map(([v,l])=>'<option value="'+v+'"'+(guide.lines?.[i]===v||!guide.lines?.[i]&&!v?' selected':'')+'>'+l+'</option>').join('')+'</select>')+'</div>';}).join('')+'</details>';}
 else if(!words.length&&!second)html+='<p class="field-help">싱크 가사가 없는 곡은 자유 구간으로 녹음해주세요.</p>';
 host.innerHTML=html+'</details>';if(guideOpen)host.querySelector('.duet-guide-box').open=true;if(editorOpen&&host.querySelector('.duet-part-editor'))host.querySelector('.duet-part-editor').open=true;
 host.querySelectorAll('[data-duet-method]').forEach(b=>{b.disabled=singBusy(s)||singLive(s)||b.dataset.duetMethod==='lyrics'&&!words.length;b.onclick=()=>{s.duetGuide.mode=b.dataset.duetMethod;if(s.duetGuide.mode==='lyrics')s.duetGuide.lines=words.map((_,i)=>s.duetGuide.lines?.[i]||'');refreshVocalGuide(s);queueSingDraft(s);renderDuetGuide();};});
 host.querySelectorAll('[data-duet-line]').forEach(input=>{input.disabled=singBusy(s)||singLive(s);input.onchange=()=>{while(s.duetGuide.lines.length<words.length)s.duetGuide.lines.push('');s.duetGuide.lines[Number(input.dataset.duetLine)]=input.value;queueSingDraft(s);renderDuetGuide();};});
 host.querySelectorAll('[data-duet-seek]').forEach(b=>b.onclick=()=>{if(singBusy(s)||singLive(s))return;stopPreview();s.cursor=Number(b.dataset.duetSeek);drawLyrics(s.cursor);});
 const again=host.querySelector('[data-duet-reanalyze]');if(again)again.onclick=()=>{s.duetGuide.lines=[];refreshVocalGuide(s);queueSingDraft(s);renderDuetGuide();};
 document.querySelectorAll('[data-sing-line]').forEach((row,i)=>{
  row.querySelector('.duet-line-badge')?.remove();row.querySelector('.duet-line-mic')?.remove();
  const p=AifectDuetGuide.linePart(guide,words,i,duration),role=AifectDuetGuide.lineRole(p,second);row.dataset.partRole=role;row.setAttribute('aria-label',time(words[i].s)+' '+AifectDuetGuide.partLabel(p,second)+' '+words[i].w.map(w=>w.t).join(' '));
  if(['mine','partner','both'].includes(role)){const marker=document.createElement('span');marker.className='duet-line-mic';marker.setAttribute('aria-hidden','true');marker.innerHTML=role==='both'?'<i class="duet-mine">'+icon('mic')+'</i><i class="duet-partner">'+icon('mic')+'</i>':icon('mic');row.prepend(marker);}
  if(role==='partial'){const badge=document.createElement('b');badge.className='duet-line-badge';badge.textContent='빈 구간 있음 · 추정';row.append(badge);}
 });
 updateTransport();
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
