// Native bridge and browser recorder share the same song/MR permissions and cover upload API.
let sing=null,routeSing=null;
const K=()=>window.AifectKaraoke;
const nativeSinging=()=>window.Capacitor?.isNativePlatform?.()&&window.Capacitor.Plugins?.AifectKaraoke;
const singBusy=s=>['loading','stopping','exporting'].includes(s?.state);
const singLive=s=>['singing','preroll'].includes(s?.state);
function releaseRun(run){
 if(!run)return;run.src.onended=null;try{run.src.stop();}catch{}
 run.stream?.getTracks().forEach(t=>t.stop());for(const n of [run.mic,run.node,run.mute,run.monitor,run.gain,run.voiceGain,...(run.effects||[])])try{n?.disconnect();}catch{}
}
function cleanupSing(){
 const s=sing;if(!s)return;sing=null;s.abort?.abort();clearTimeout(s.scrollTimer);clearTimeout(s.draftTimer);cancelAnimationFrame(s.frame);
 releaseRun(s.run);s.preview?.forEach(n=>{try{n.stop();}catch{}});s.wake?.release?.().catch(()=>{});s.ctx?.close().catch(()=>{});
}
function karaokeListHTML(tracks){
 remember(tracks);return heading('노래방','마이크와 이어폰을 준비하고 MR·가사와 함께 불러보세요.')+(tracks.length?`<div class="track-list">${tracks.map((t,i)=>`<div class="live-track"><span class="track-rank">${i+1}</span>${cover(t,'mini-cover')}<div class="track-info"><a href="#song/${t.id}"><strong>${esc(t.title)}</strong></a><span>${credits(t)}</span></div><span class="track-time">${time(t.duration)}</span><a class="small-button" href="#sing/${t.id}">${icon('mic')} 부르기</a></div>`).join('')}</div>`:'<p class="surface empty-note">아직 부를 수 있는 곡이 없어요.</p>');
}
function singHTML(d){
 const t=d.track;
 return heading('노래 부르기','내 목소리로 완성하는 음악')+`<section class="surface sing" id="sing"><div class="sing-head">${cover(t,'mini-cover')}<div><strong>${esc(t.title)}</strong><span>${esc(t.artist)} · ${esc(t.producer)}</span></div></div>
 <label class="sing-monitor"><input id="sing-monitor" type="checkbox"> 이어폰으로 내 목소리 듣기 <small>이어폰 연결 후 켜주세요. 스피커에서는 울림이 생겨요.</small></label>
 <div class="sing-transport"><button class="primary-button" data-sing-start>노래 시작</button><button class="small-button" data-sing-stop hidden>그만 부르기</button><button class="small-button" data-sing-preview disabled>${icon('play')} 녹음 들어보기</button><button class="small-button" data-sing-pause disabled>일시정지</button></div>
 <p class="field-help">가사를 위아래로 밀거나 눌러 위치를 골라요. 녹음 중 이동하면 3초 전 반주부터 이어 부르고, 선택 지점 뒤의 녹음은 교체돼요.</p>
 <div class="sing-wheel" id="sing-wheel" aria-label="가사와 녹음 위치" tabindex="0">${(d.words||[]).map((line,i)=>`<button type="button" data-sing-line="${i}" data-second="${line.s}" aria-label="${time(line.s)} ${esc(line.w.map(w=>w.t).join(' '))}"><small>${time(line.s)}</small><span>${line.w.map((w,j)=>`<span data-word="${j}">${esc(w.t)}</span>`).join(' ')}</span></button>`).join('')||'<p class="field-help">아래 위치 막대로 부를 구간을 골라주세요.</p>'}</div>
 <input class="sing-seek" id="sing-seek" type="range" min="0" max="${t.duration}" step=".05" value="0" aria-label="노래 위치">
 <div class="sing-time"><span id="sing-now">0:00</span><span id="sing-duration">${time(t.duration)}</span></div>
 <label class="form-field">마이크 입력<progress id="mic-level" max="1" value="0" aria-label="마이크 입력 크기"></progress></label><p class="sing-status" id="sing-status" role="status">노래 시작을 누르면 마이크 권한을 요청해요.</p><div id="sing-panel">${singStartHTML()}</div>
 <p class="field-help">녹음과 효과는 현재 기기·브라우저에 계정별로 임시저장돼요. 같은 곡에서 이어 편집할 수 있어요. 다른 기기로 동기화되지 않으며 브라우저 데이터를 삭제하면 사라져요.</p></section>`;
}
const singStartHTML=(message='')=>`<p class="field-help">${nativeSinging()?'에코 · 룸 리버브와 실시간 이어폰 청음을 지원해요. 유선·USB 이어폰을 권장해요.':'유선·USB 이어폰을 권장해요. 스피커의 반주가 마이크에 섞이면 싱크 확인이 어려워요.'}</p>${message?`<p class="form-error">${esc(message)}</p>`:''}${nativeSinging()?`<button class="primary-button" data-sing-start>${icon('mic')} 노래방 열기</button>`:''}`;
function bindSing(id){
 cleanupSing();if(!$('#sing')||!routeSing)return;
 sing={id,owner:me?.id,data:routeSing,state:'loading',cursor:0,mix:K().defaultVocalMix()};
 const s=sing,wheel=$('#sing-wheel'),seek=$('#sing-seek');
 const begin=()=>{if(sing!==s||singBusy(s)||s.scrubbing)return;s.scrubbing=true;s.resumeMode=singLive(s)?'record':s.state==='playing'?'play':s.state==='guide'?'guide':null;s.settling=singLive(s)?finishSinging():Promise.resolve();if(s.preview)stopPreview();};
 const select=t=>{if(sing!==s)return;begin();s.cursor=clampPosition(t,s.resumeMode==='play');drawLyrics(s.cursor,false);};
 const end=async()=>{
  if(!s.scrubbing)return;const target=s.cursor,mode=s.resumeMode;s.scrubbing=false;await s.settling;if(sing!==s||s.scrubbing)return;s.cursor=target;drawLyrics(target);if(document.hidden)return;
  if(mode==='record')startSinging();else if(mode==='play')previewMix(target);else if(mode==='guide')previewGuide(target);
 };
 seek.addEventListener('pointerdown',begin);seek.addEventListener('input',()=>select(Number(seek.value)));seek.addEventListener('change',end);seek.addEventListener('pointercancel',end);
 const nearest=()=>{const rows=[...wheel.querySelectorAll('[data-second]')];return rows.reduce((best,r)=>!best||Math.abs(r.offsetTop+r.offsetHeight/2-wheel.scrollTop-wheel.clientHeight/2)<Math.abs(best.offsetTop+best.offsetHeight/2-wheel.scrollTop-wheel.clientHeight/2)?r:best,null);};
 const settle=()=>{clearTimeout(s.scrollTimer);s.scrollTimer=setTimeout(()=>{if(s.scrubbing&&!s.pointer){const row=nearest();if(row)select(Number(row.dataset.second));end();}},170);};
 wheel.addEventListener('pointerdown',()=>{if(singBusy(s))return;s.pointer=true;begin();});
 wheel.addEventListener('pointerup',()=>{s.pointer=false;settle();});wheel.addEventListener('pointercancel',()=>{s.pointer=false;settle();});
 wheel.addEventListener('wheel',()=>{begin();settle();},{passive:true});
 wheel.addEventListener('scroll',()=>{if(s.scrubbing){const row=nearest();if(row)select(Number(row.dataset.second));settle();}},{passive:true});
 wheel.addEventListener('click',e=>{const row=e.target.closest('[data-second]');if(row){clearTimeout(s.scrollTimer);s.pointer=false;select(Number(row.dataset.second));end();}});
 wheel.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const lines=s.data.words,i=K().wordAt(lines,s.cursor).line,j=Math.max(0,Math.min(lines.length-1,i+(e.key==='ArrowDown'?1:-1)));if(lines[j]){select(lines[j].s);end();}});
 $('#sing-monitor').onchange=e=>{if(s.run)s.run.monitor.gain.value=e.target.checked ? .25 : 0;};
 drawLyrics(0);renderSingPanel();void restoreSingDraft(s);
}
function setSingStatus(message){const el=$('#sing-status');if(el)el.textContent=message;}
function clampPosition(t,review=false){return Math.max(0,Math.min(t,review&&sing.voice?sing.voice.duration:sing.mr?.duration||sing.data.track.duration));}
function updateTransport(){
 if(!sing)return;const s=sing,locked=singBusy(s),live=singLive(s),preview=$('[data-sing-preview]'),pause=$('[data-sing-pause]'),guide=$('[data-sing-guide]');
 if(preview)preview.disabled=locked||live||!s.voice||s.state==='playing';if(pause)pause.disabled=locked||!(live||s.preview);if(guide)guide.disabled=locked||live;
 document.querySelectorAll('[data-sing-start],[data-sing-save],#sing-upload-form button').forEach(b=>b.disabled=locked||live);
 $('#sing-seek').disabled=locked;const start=$('.sing-transport [data-sing-start]'),stop=$('.sing-transport [data-sing-stop]');if(start){start.hidden=live;start.textContent=s.voice?'여기부터 부르기':'노래 시작';}if(stop){stop.hidden=!live;stop.disabled=locked;}
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
  try{const result=await nativeSinging().open({trackId:s.id});if(result.uploadedId){if(sing===s)cleanupSing();toast('커버곡을 올렸어요! 변환이 끝나면 공개돼요.');location.hash='studio';return;}if(sing===s){s.state='idle';$('#sing-panel').innerHTML=singStartHTML();}}
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
 if(!sing)return;const s=sing,review=s.state==='playing'||s.state==='review',duration=review&&s.voice?s.voice.duration:s.mr?.duration||s.data.track.duration,at=K().wordAt(s.data.words||[],t);
 $('#sing-now').textContent=time(Math.max(0,t));$('#sing-duration').textContent=time(duration);const seek=$('#sing-seek');seek.max=duration;seek.value=Math.min(duration,Math.max(0,t));
 const wheel=$('#sing-wheel'),row=wheel.querySelector(`[data-sing-line="${at.line}"]`);
 wheel.querySelectorAll('[data-sing-line]').forEach(el=>{el.classList.toggle('current',el===row);el.setAttribute('aria-current',el===row?'true':'false');});
 row?.querySelectorAll('[data-word]').forEach((el,i)=>{el.classList.toggle('sung',i<at.word);el.classList.toggle('singing',i===at.word);el.style.setProperty('--p',i===at.word?at.progress:0);});
 if(follow&&!s.scrubbing&&at.line!==s.shownLine){s.shownLine=at.line;if(row)wheel.scrollTop=row.offsetTop+row.offsetHeight/2-wheel.clientHeight/2;}
}
async function finishSinging(){
 const s=sing;if(!singLive(s))return;const run=s.run,ctx=s.ctx,end=Math.min(s.mr.duration,run.from+Math.max(0,ctx.currentTime-run.t0));s.state='stopping';cancelAnimationFrame(s.frame);updateTransport();setSingStatus('녹음한 구간을 정리하고 있어요…');
 run.src.onended=null;try{run.src.stop();}catch{}run.monitor.gain.value=0;
 await new Promise(resolve=>{const timer=setTimeout(resolve,600);run.flushed=()=>{clearTimeout(timer);resolve();};run.node.port.postMessage('stop');});releaseRun(run);s.wake?.release?.().catch(()=>{});
 if(sing!==s)return;
 if(end>run.recordAt+.1&&!run.chunks.length){s.run=null;s.state=s.voice?'review':'idle';renderSingPanel();setSingStatus('마이크 입력을 받지 못했어요. 브라우저의 마이크 장치를 확인해주세요. 기존 녹음은 보존했어요.');return;}
 const samples=K().mergeTake(s.voice?.getChannelData(0),run.chunks,run.t0+run.recordAt-run.from,ctx.sampleRate,run.recordAt,end);
 if(samples.length){s.voice=ctx.createBuffer(1,samples.length,ctx.sampleRate);s.voice.copyToChannel(samples,0);s.processed=null;}
 s.run=null;s.cursor=s.voice?.duration||run.recordAt;s.state=s.voice?'review':'idle';renderSingPanel();drawLyrics(s.cursor);setSingStatus(s.voice?`${time(s.voice.duration)} 녹음했어요. 들어보고 싱크·효과를 조절하세요.`:'녹음 시작 전에 멈췄어요. 기존 녹음은 그대로예요.');
 if(s.voice){try{await saveSingDraft(s);}catch{setSingStatus('녹음은 남아 있지만 임시저장하지 못했어요. 저장 공간을 확인해주세요.');}if((run.peak||0)<.00001)setSingStatus('마이크 소리가 감지되지 않았어요. 선택한 마이크와 음소거 설정을 확인하고 다시 불러주세요.');}
}
const roomControlHTML=m=>`<fieldset class="sing-mix-group sing-effects"><legend>목소리 효과</legend><div class="sing-presets" role="group" aria-label="목소리 효과 선택">${K().vocalPresets.map(p=>`<button type="button" data-vocal-preset="${p.id}" aria-pressed="${m.preset===p.id}">${p.name}</button>`).join('')}</div><p class="field-help" data-preset-description>${K().vocalPresets.find(p=>p.id===m.preset)?.description||'이전에 직접 맞춘 효과를 유지하고 있어요.'}</p><label class="form-field">효과 강도 <span data-mix-label="strength">${mixLabel('strength',m.strength??.5)}</span><input type="range" min="0" max="1" step=".01" value="${m.strength??.5}" data-mix="strength" aria-label="효과 강도" ${['original','custom'].includes(m.preset)?'disabled':''}></label><p class="field-help">버튼 하나로 목소리와 울림을 함께 맞춰요. 원래 녹음은 보존돼요.</p><div class="sing-noise"><strong>잡음 정리</strong><div class="sing-noise-options" role="group" aria-label="잡음 정리">${[[0,'끔'],[2,'기본'],[4,'강하게']].map(([n,label])=>`<button type="button" data-vocal-noise="${n}" aria-pressed="${m.noise===n}">${label}</button>`).join('')}</div></div><p class="field-help">선 마찰로 생기는 저음 진동과 작은 배경 잡음을 줄여요. 직접 부딪치는 큰 소리는 남을 수 있어요.</p><details class="sing-effect-details"><summary>세부 조절</summary><div class="sing-mix-grid">${[['echo','에코',0,.65,.01],['room','룸',0,1,.01],['size','공간 크기',0,1,.01],['noise','잡음 줄이기',0,4,1]].map(([key,label,min,max,step])=>`<label class="form-field">${label}<span data-mix-label="${key}">${mixLabel(key,m[key]??.5)}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${m[key]??.5}" data-mix="${key}" aria-label="${label}"></label>`).join('')}</div></details></fieldset>`;
const reviewHTML=m=>`<div class="sing-review"><p class="field-help">부른 구간만 저장돼요. 효과를 바꿔도 원래 목소리는 유지돼요.</p>
 ${roomControlHTML(m)}
 <details class="sing-effect-details"><summary>음량 · 싱크 조절</summary>${[['음량',[['voice','목소리',0,2,.05],['mr','반주',0,1.5,.05]]],['싱크',[['offset','목소리 싱크',-300,800,5]]]].map(([title,items])=>`<fieldset class="sing-mix-group"><legend>${title}</legend><div class="sing-mix-grid">${items.map(([key,label,min,max,step])=>`<label class="form-field">${label}<span data-mix-label="${key}">${mixLabel(key,m[key])}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${m[key]}" data-mix="${key}" aria-label="${label}"></label>`).join('')}</div></fieldset>`).join('')}
 <p class="field-help">목소리가 늦게 들리면 싱크 값을 높여주세요. 잡음 제거 강도가 높으면 작은 노랫소리도 줄어들 수 있어요.</p>
 </details><div class="inline-actions"><button class="small-button" data-sing-start>${icon('mic')} 선택한 위치부터 이어 부르기</button><button class="small-button" data-sing-draft>임시저장</button><button class="small-button" data-discard-draft>임시 녹음 삭제</button><button class="small-button" data-sing-save>${member.plan==='premium'?'부른 구간 파일로 저장':'Premium으로 파일 저장'}</button></div>
 <form id="sing-upload-form" class="upload-form"><label class="form-field">커버 소개 (선택)<textarea name="description" maxlength="1000" placeholder="어떤 마음으로 불렀는지 들려주세요."></textarea></label>
 <label class="checkbox-line rights-check"><input name="own_voice" type="checkbox" required> <span>제가 직접 부른 녹음입니다. 다른 사람의 목소리나 AI 음성 복제가 아닙니다.</span></label>
 <label class="checkbox-line rights-check"><input name="rights" type="checkbox" required> <span>이 녹음을 공개할 권리가 있고, 원곡 정보와 함께 공개되는 데 동의합니다.</span></label>
 <button class="primary-button">커버곡 올리기 ${icon('upload')}</button><div class="upload-progress" hidden><progress max="100" value="0"></progress><p role="status"></p></div><p class="form-error" role="alert"></p></form></div>`;
function mixLabel(key,value){return key==='offset'?`${value}ms`:key==='noise'?value?`${value}단계`:'끔':`${Math.round(value*100)}%`;}
function renderSingPanel(){
 $('#sing-panel').innerHTML=sing.voice?reviewHTML(sing.mix):singStartHTML()+roomControlHTML(sing.mix);bindMixControls();if(sing.voice)bindReview();updateTransport();
}
function refreshEffectControls(){
 const m=sing.mix;document.querySelectorAll('[data-vocal-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.vocalPreset===m.preset)));
 document.querySelectorAll('[data-vocal-noise]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.vocalNoise)===m.noise)));
 document.querySelectorAll('[data-mix]').forEach(input=>{const k=input.dataset.mix;input.value=m[k]??.5;const label=document.querySelector('[data-mix-label="'+k+'"]');if(label)label.textContent=mixLabel(k,m[k]??.5);if(k==='strength')input.disabled=['original','custom'].includes(m.preset)||singBusy(sing);});
 const note=$('[data-preset-description]');if(note)note.textContent=K().vocalPresets.find(p=>p.id===m.preset)?.description||'직접 맞춘 효과 · 버튼을 누르면 추천 설정으로 바뀌어요.';
}
function applyMixChange(key){const s=sing;queueSingDraft(s);s.run?.effects?.update(s.mix);if(s.run){s.run.voiceGain.gain.setTargetAtTime(s.mix.voice,s.ctx.currentTime,.015);s.run.gain.gain.setTargetAtTime(s.mix.mr,s.ctx.currentTime,.015);}if(s.state==='playing'){if(key==='offset')previewMix(s.ctx.currentTime-s.previewAt);else s.previewMixUpdate?.(s.mix);}refreshEffectControls();}
function bindMixControls(){
 document.querySelectorAll('[data-vocal-preset]').forEach(button=>button.onclick=()=>{if(singBusy(sing))return;sing.mix=K().presetMix(sing.mix,button.dataset.vocalPreset,.5);applyMixChange('preset');});
 document.querySelectorAll('[data-vocal-noise]').forEach(button=>button.onclick=()=>{if(singBusy(sing))return;sing.mix.noise=Number(button.dataset.vocalNoise);applyMixChange('noise');});
 document.querySelectorAll('[data-mix]').forEach(input=>input.oninput=()=>{if(singBusy(sing))return;const s=sing,k=input.dataset.mix;if(k==='strength')s.mix=K().presetMix(s.mix,s.mix.preset,Number(input.value));else{s.mix[k]=Number(input.value);if(['echo','room','size'].includes(k))s.mix.preset='custom';}applyMixChange(k);});
 refreshEffectControls();
}
function bindReview(){
 const form=$('#sing-upload-form');form.elements.description.value=sing.description||'';form.elements.description.oninput=()=>{sing.description=form.elements.description.value;queueSingDraft(sing);};form.onsubmit=busyForm(form,uploadSung);
}
function voiceBuffer(s){
 const key=JSON.stringify([s.mix.noise,s.mix.echo,s.mix.room,s.mix.size,s.mix.tone]);if(s.processed?.key===key&&s.processed.source===s.voice)return s.processed.buffer;
 const buffer=s.ctx.createBuffer(1,s.voice.length,s.voice.sampleRate);buffer.copyToChannel(K().renderVocals(s.voice.getChannelData(0),s.voice.sampleRate,s.mix),0);s.processed={key,source:s.voice,buffer};return buffer;
}
function connectEffects(ctx,source,destination,m){
 const fx=new AudioWorkletNode(ctx,'aifect-vocal',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit',processorOptions:{mix:m}});source.connect(fx).connect(destination);const nodes=[fx];nodes.update=m=>fx.port.postMessage(m);return nodes;
}
function scheduleMix(ctx,from,at,s=sing){
 const end=s.voice.duration,remaining=end-from;if(remaining<=0)throw new Error('다시 들을 위치를 골라주세요.');
 const m=s.mix,shift=m.offset/1000,g={mr:ctx.createGain(),voice:ctx.createGain()};g.mr.gain.value=m.mr;g.voice.gain.value=m.voice;g.mr.connect(ctx.destination);g.voice.connect(ctx.destination);
 const a=ctx.createBufferSource(),b=ctx.createBufferSource();a.buffer=s.mr;const offline=typeof ctx.startRendering==='function';b.buffer=offline?voiceBuffer(s):s.voice;a.connect(g.mr);const effects=offline?[]:connectEffects(ctx,b,g.voice,m);if(offline)b.connect(g.voice);a.start(at,from,remaining);
 const v=from+shift,delay=Math.max(0,-v),available=Math.min(remaining-delay,end-Math.max(0,v));if(available>0)b.start(at+delay,Math.max(0,v),available);
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
 const s=sing;if(!s?.voice||singLive(s)||singBusy(s))return;try{await prepareSing(s);}catch(e){setSingStatus(e.message);return;}if(sing!==s)return;stopPreview();s.ctx.resume();from=Math.max(0,from>=s.voice.duration-.02?0:from);const at=s.ctx.currentTime+.05,mix=scheduleMix(s.ctx,from,at);runPreview(s,mix.sources,at,from,'playing',mix.nodes);s.previewMixUpdate=mix.updateMix;setSingStatus('녹음 들어보기 · 위치를 옮겨도 재생이 이어져요.');
}
async function previewGuide(from=sing?.cursor||0){
 const s=sing;if(!s||singLive(s)||singBusy(s))return;stopPreview();++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';updateTransport();setSingStatus('원곡 가이드를 불러오고 있어요…');
 try{const ctx=await prepareSing(s);if(!s.guide){const r=await fetch(`/media/${encodeURIComponent(s.id)}/stream`,{credentials:'same-origin',signal:s.abort?.signal});if(!r.ok)throw new Error('원곡 가이드를 불러오지 못했어요.');s.guide=await ctx.decodeAudioData(await r.arrayBuffer());}if(sing!==s)return;const src=ctx.createBufferSource();src.buffer=s.guide;src.connect(ctx.destination);from=Math.max(0,Math.min(from,s.guide.duration-.05));const at=ctx.currentTime+.05;src.start(at,from);runPreview(s,[src],at,from,'guide');setSingStatus('원곡 가이드 · 일시정지 후 가사를 골라 그 위치부터 불러보세요.');}
 catch(e){if(sing===s){s.state=s.voice?'review':'idle';updateTransport();setSingStatus(e.message||'원곡을 불러오지 못했어요.');}}
}
async function renderSung(s){
 await prepareSing(s);
 const rate=K().MIX_RATE,length=Math.ceil(s.voice.duration*rate),off=new OfflineAudioContext(2,length,rate);scheduleMix(off,0,0,s);const out=await off.startRendering(),channels=[out.getChannelData(0),out.getChannelData(1)],top=K().peak(channels);if(top>.98)for(const c of channels)for(let i=0;i<c.length;i++)c[i]*=.98/top;return new Blob([K().encodeWav(channels,rate)],{type:'audio/wav'});
}
async function saveSung(){
 const s=sing;if(!s?.voice||singBusy(s)||singLive(s))return;let access;try{access=await api('/api/me');}catch(e){setSingStatus(e.message);return;}if(sing!==s)return;if(access.membership?.plan!=='premium'){toast('커버 파일 저장은 Premium 이용권이 필요해요.');return;}stopPreview();s.state='exporting';updateTransport();setSingStatus('부른 구간을 파일로 만들고 있어요…');
 try{const file=await renderSung(s);if(sing!==s)return;const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=`AIFECT-cover-${s.id}.wav`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);s.dirty=false;setSingStatus('녹음 파일을 저장했어요.');}catch(e){if(sing===s)setSingStatus(e.message||'파일을 저장하지 못했어요.');}finally{if(sing===s){s.state='review';updateTransport();}}
}
async function uploadSung(fd){
 const s=sing;if(!s?.voice||singBusy(s)||singLive(s))return;stopPreview();s.state='exporting';updateTransport();
 const progress=$('#sing-upload-form .upload-progress'),note=progress.querySelector('p');progress.hidden=false;note.textContent='부른 구간을 합치고 있어요…';
 try{const file=await renderSung(s);if(sing!==s)return;
  const draft=await api('/api/covers','POST',{original_id:s.id,description:fd.get('description')||'',own_voice:fd.has('own_voice'),rights:fd.has('rights'),extension:'wav',bytes:file.size});
  await uploadFile(`/api/uploads/${draft.id}/audio`,file,value=>{progress.querySelector('progress').value=value;note.textContent=`올리는 중 ${Math.round(value)}%`;});await api(`/api/uploads/${draft.id}/complete`,'POST');if(sing!==s)return;clearTimeout(s.draftTimer);await removeSingDraft(s);s.dirty=false;cleanupSing();toast('커버곡을 올렸어요! 변환이 끝나면 공개돼요.');location.hash='studio';
 }finally{if(sing===s){s.state='review';updateTransport();}}
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-sing-start],[data-sing-stop],[data-sing-preview],[data-sing-pause],[data-sing-guide],[data-sing-save]');if(!el||!sing)return;
 if(el.hasAttribute('data-sing-start'))startSinging();else if(el.hasAttribute('data-sing-stop'))finishSinging();else if(el.hasAttribute('data-sing-preview'))previewMix(sing.cursor);else if(el.hasAttribute('data-sing-pause')){if(singLive(sing))finishSinging();else{stopPreview();updateTransport();drawLyrics(sing.cursor);setSingStatus('일시정지했어요.');}}else if(el.hasAttribute('data-sing-guide'))previewGuide();else if(el.hasAttribute('data-sing-save'))saveSung();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&singLive(sing))finishSinging();});
window.addEventListener?.('beforeunload',e=>{if(sing?.dirty||singLive(sing)||sing?.state==='exporting'){e.preventDefault();e.returnValue='';}});

