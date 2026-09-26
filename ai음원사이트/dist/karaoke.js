// Singing in the app: the MR plays with word-by-word lyrics while the singer's voice is recorded, then the
// singer adjusts sync and volumes and uploads the mix as a cover. The MR and the recorder share one
// AudioContext clock, so only device latency (earphones, Bluetooth) is left for the sync slider.
let sing=null;
const K=()=>window.AifectKaraoke;
const nativeSinging=()=>window.Capacitor?.isNativePlatform?.()&&window.Capacitor.Plugins?.AifectKaraoke;

function cleanupSing(){
 if(!sing)return;
 try{sing.frame&&cancelAnimationFrame(sing.frame);sing.preview?.forEach(s=>{try{s.stop();}catch{}});sing.run?.src?.stop();}catch{}
 sing.run?.stream?.getTracks().forEach(t=>t.stop());sing.wake?.release?.().catch(()=>{});sing.ctx?.close().catch(()=>{});
 sing=null;
}

function karaokeListHTML(tracks){
 remember(tracks);
 return heading('노래방','원곡자가 허락한 곡을 MR과 가사로 불러보세요.')+(inApp?'':'<p class="surface empty-note">노래 부르기는 AIFECT 앱에서 할 수 있어요.</p>')
  +(tracks.length?`<div class="track-list">${tracks.map((t,i)=>`<div class="live-track"><span class="track-rank">${i+1}</span>${cover(t,'mini-cover')}<div class="track-info"><a href="#song/${t.id}"><strong>${esc(t.title)}</strong></a><span>${credits(t)}</span></div><span class="track-time">${time(t.duration)}</span>${inApp?`<a class="small-button" href="#sing/${t.id}">${icon('mic')} 부르기</a>`:''}</div>`).join('')}</div>`:'<p class="surface empty-note">아직 부를 수 있는 곡이 없어요.</p>');
}

function singHTML(d){
 if(!inApp)return heading('노래 부르기')+'<p class="surface empty-note">노래 부르기는 AIFECT 앱에서 할 수 있어요.</p>';
 const t=d.track;
 return heading('노래 부르기')+`<section class="surface sing" id="sing"><div class="sing-head">${cover(t,'mini-cover')}<div><strong>${esc(t.title)}</strong><span>${esc(t.artist)} · ${esc(t.producer)}</span></div></div>
 <div class="sing-lyrics" aria-live="polite"><p class="sing-prev"></p><p class="sing-line">♪</p><p class="sing-next">${esc(d.words[0]?.w.map(w=>w.t).join(' ')||'')}</p></div>
 <div class="sing-progress"><div id="sing-bar"></div></div><div class="sing-time"><span id="sing-now">0:00</span><span>${time(t.duration)}</span></div>
 <div id="sing-panel">${singStartHTML()}</div></section>`;
}
const singStartHTML=(message='')=>`<p class="field-help">${nativeSinging()?'에코 · 룸 리버브와 실시간 이어폰 청음을 지원해요. 유선·USB 이어폰을 권장해요.':'이어폰을 끼고 불러주세요. 스피커로 들으면 MR이 녹음에 섞여요.'}</p>${message?`<p class="form-error">${esc(message)}</p>`:''}<button class="primary-button" data-sing-start>${icon('mic')} ${nativeSinging()?'노래방 열기':'노래 시작'}</button>`;

// views.js loads the song into routeSing; bindForms then opens the screen state for it.
let routeSing=null;
function bindSing(id){cleanupSing();if($('#sing')&&routeSing)sing={id,data:routeSing,state:'idle'};}

async function startSinging(){
 if(!sing||sing.state==='loading'||sing.state==='singing')return;
 if(nativeSinging()){
  const session=sing;++playSerial;window.AifectAudioAds?.cancel();audio.pause();session.state='loading';$('#sing-panel').innerHTML='<p class="field-help">노래방을 열고 있어요…</p>';
  try{
   const result=await nativeSinging().open({trackId:session.id});
   if(result.uploadedId){if(sing===session)cleanupSing();toast('커버곡을 올렸어요! 변환이 끝나면 공개돼요.');location.hash='studio';return;}
   if(sing===session){session.state='idle';$('#sing-panel').innerHTML=singStartHTML();}
  }catch(e){if(sing===session){session.state='idle';$('#sing-panel').innerHTML=singStartHTML(e.message||'노래방을 열지 못했어요.');}}
  return;
 }
 ++playSerial;window.AifectAudioAds?.cancel();audio.pause();sing.state='loading';$('#sing-panel').innerHTML='<p class="field-help">MR과 마이크를 준비하고 있어요…</p>';
 const ctx=sing.ctx||new (window.AudioContext||window.webkitAudioContext)({sampleRate:K().MIX_RATE,latencyHint:'interactive'});sing.ctx=ctx;ctx.resume();
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  if(!sing.mr){const r=await fetch(sing.data.mr,{credentials:'same-origin'});if(!r.ok)throw new Error('MR을 불러오지 못했어요.');sing.mr=await ctx.decodeAudioData(await r.arrayBuffer());}
  if(!sing.worklet){
   const code=`class R extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(16384);this.n=0;this.t=0;this.on=true;this.port.onmessage=()=>{this.flush();this.on=false;this.port.postMessage('done');};}
flush(){if(this.n){this.port.postMessage({t:this.t,d:this.b.slice(0,this.n)});this.n=0;}}
process(i){const c=i[0]&&i[0][0];if(c&&this.on){if(this.n+c.length>this.b.length)this.flush();if(!this.n)this.t=currentTime;this.b.set(c,this.n);this.n+=c.length;}return this.on;}}
registerProcessor('aifect-recorder',R);`;
   const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));await ctx.audioWorklet.addModule(url);URL.revokeObjectURL(url);sing.worklet=true;
  }
  const mic=ctx.createMediaStreamSource(stream),node=new AudioWorkletNode(ctx,'aifect-recorder'),mute=ctx.createGain(),src=ctx.createBufferSource(),chunks=[];
  mute.gain.value=0;mic.connect(node);node.connect(mute).connect(ctx.destination);
  node.port.onmessage=e=>{if(e.data==='done')sing?.run?.flushed?.();else chunks.push(e.data);};
  src.buffer=sing.mr;src.connect(ctx.destination);
  const t0=ctx.currentTime+.4;src.start(t0);
  sing.run={stream,node,src,chunks,t0};sing.state='singing';sing.shownLine=null;
  src.onended=()=>{if(sing?.state==='singing')finishSinging();};
  try{sing.wake=await navigator.wakeLock?.request('screen');}catch{}
  $('#sing-panel').innerHTML=`<button class="small-button" data-sing-stop>그만 부르기</button>`;
  const tick=()=>{if(!sing||sing.state!=='singing')return;drawLyrics(ctx.currentTime-t0);sing.frame=requestAnimationFrame(tick);};tick();
 }catch(e){
  sing.run?.stream?.getTracks().forEach(t=>t.stop());sing.state='idle';
  $('#sing-panel').innerHTML=singStartHTML(e.name==='NotAllowedError'?'마이크를 쓸 수 있게 허용해주세요.':e.message||'준비하지 못했어요. 다시 시도해주세요.');
 }
}

function drawLyrics(t){
 const lines=sing.data.words,at=K().wordAt(lines,t),duration=sing.mr.duration;
 $('#sing-bar').style.width=`${Math.max(0,Math.min(100,t/duration*100))}%`;$('#sing-now').textContent=time(Math.max(0,t));
 const text=i=>lines[i]?lines[i].w.map(w=>w.t).join(' '):'';
 if(at.line!==sing.shownLine){
  sing.shownLine=at.line;
  $('.sing-prev').textContent=text(at.line-1);
  $('.sing-line').innerHTML=at.line<0?'♪':lines[at.line].w.map((w,i)=>`<span data-w="${i}">${esc(w.t)}</span>`).join(' ');
  $('.sing-next').textContent=text(at.line+1);
 }
 if(at.line>=0)document.querySelectorAll('.sing-line [data-w]').forEach((el,i)=>{el.className=i<at.word?'sung':i===at.word?'singing':'';if(i===at.word)el.style.setProperty('--p',at.progress);});
}

async function finishSinging(){
 if(!sing||sing.state!=='singing')return;
 const run=sing.run,ctx=sing.ctx;sing.state='review';cancelAnimationFrame(sing.frame);
 try{run.src.onended=null;run.src.stop();}catch{}
 await new Promise(resolve=>{run.flushed=resolve;run.node.port.postMessage('stop');setTimeout(resolve,500);});
 run.stream.getTracks().forEach(t=>t.stop());sing.wake?.release?.().catch(()=>{});
 const length=sing.mr.length,voice=ctx.createBuffer(1,length,ctx.sampleRate);
 voice.copyToChannel(K().placeChunks(run.chunks,run.t0,ctx.sampleRate,length),0);
 // The voice arrives late by the output plus input latency; start from the device's own estimate.
 sing.voice=voice;sing.mix={offset:Math.round(((ctx.outputLatency||0)+(ctx.baseLatency||0))*1000)+40,voice:1,mr:.8};
 $('#sing-panel').innerHTML=reviewHTML(sing.mix);bindReview();
}

const reviewHTML=m=>`<div class="sing-review"><p class="field-help">들어보고 목소리가 MR보다 늦거나 빠르면 싱크를 맞춰주세요.</p>
 <label class="form-field">싱크 <span data-mix-label="offset">${m.offset}ms</span><input type="range" min="-300" max="800" step="10" value="${m.offset}" data-mix="offset"></label>
 <label class="form-field">목소리 크기 <span data-mix-label="voice">${Math.round(m.voice*100)}%</span><input type="range" min="0" max="2" step=".05" value="${m.voice}" data-mix="voice"></label>
 <label class="form-field">MR 크기 <span data-mix-label="mr">${Math.round(m.mr*100)}%</span><input type="range" min="0" max="1.5" step=".05" value="${m.mr}" data-mix="mr"></label>
 <div class="inline-actions"><button class="primary-button" data-sing-preview>${icon('play')} 들어보기</button><button class="small-button" data-sing-retry>다시 부르기</button></div>
 <form id="sing-upload-form" class="upload-form"><label class="form-field">커버 소개 (선택)<textarea name="description" maxlength="1000" placeholder="어떤 마음으로 불렀는지 들려주세요."></textarea></label>
 <label class="checkbox-line rights-check"><input name="own_voice" type="checkbox" required> <span>제가 직접 부른 녹음입니다. 다른 사람의 목소리나 AI 음성 복제가 아닙니다.</span></label>
 <label class="checkbox-line rights-check"><input name="rights" type="checkbox" required> <span>이 녹음을 AIFECT에 공개할 권리가 있고, 원곡 정보와 함께 공개되는 데 동의합니다.</span></label>
 <p class="field-help">파일이 커서 Wi-Fi에서 올리는 걸 권장해요.</p><button class="primary-button">커버곡 올리기 ${icon('upload')}</button><div class="upload-progress" hidden><progress max="100" value="0"></progress><p role="status"></p></div><p class="form-error" role="alert"></p></form></div>`;

function bindReview(){
 document.querySelectorAll('[data-mix]').forEach(input=>input.oninput=()=>{
  const k=input.dataset.mix;sing.mix[k]=Number(input.value);
  $(`[data-mix-label="${k}"]`).textContent=k==='offset'?`${sing.mix.offset}ms`:`${Math.round(sing.mix[k]*100)}%`;
  if(sing.previewAt!=null)k==='offset'?previewMix(sing.ctx.currentTime-sing.previewAt):sing.gains?.[k]&&(sing.gains[k].gain.value=sing.mix[k]);
 });
 const form=$('#sing-upload-form');form.onsubmit=busyForm(form,uploadSung);
}

// Schedules the MR and the shifted voice on any context: the live one for preview, an offline one for the upload.
function scheduleMix(ctx,from,at){
 const m=sing.mix,shift=m.offset/1000,g={mr:ctx.createGain(),voice:ctx.createGain()};g.mr.gain.value=m.mr;g.voice.gain.value=m.voice;
 const a=ctx.createBufferSource(),b=ctx.createBufferSource();a.buffer=sing.mr;b.buffer=sing.voice;
 a.connect(g.mr).connect(ctx.destination);b.connect(g.voice).connect(ctx.destination);
 a.start(at,from);const v=from+shift;if(v>=0)b.start(at,v);else b.start(at-v,0);
 return {sources:[a,b],gains:g};
}
function stopPreview(){sing.preview?.forEach(s=>{try{s.stop();}catch{}});sing.preview=null;sing.previewAt=null;cancelAnimationFrame(sing.frame);const b=$('[data-sing-preview]');if(b)b.innerHTML=`${icon('play')} 들어보기`;}
function previewMix(from=0){
 stopPreview();const ctx=sing.ctx;ctx.resume();
 const at=ctx.currentTime+.05,{sources,gains}=scheduleMix(ctx,Math.max(0,from),at);
 sing.preview=sources;sing.gains=gains;sing.previewAt=at-Math.max(0,from);
 sources[0].onended=()=>{if(sing?.preview===sources)stopPreview();};
 $('[data-sing-preview]').innerHTML='■ 멈추기';
 const tick=()=>{if(!sing?.preview)return;drawLyrics(ctx.currentTime-sing.previewAt);sing.frame=requestAnimationFrame(tick);};tick();
}

async function uploadSung(fd){
 stopPreview();
 const progress=$('#sing-upload-form .upload-progress'),note=progress.querySelector('p');progress.hidden=false;note.textContent='노래를 합치고 있어요…';
 const rate=K().MIX_RATE,length=Math.ceil(sing.mr.duration*rate),off=new OfflineAudioContext(2,length,rate);
 scheduleMix(off,0,0);
 const out=await off.startRendering(),channels=[out.getChannelData(0),out.getChannelData(1)],top=K().peak(channels);
 if(top>.98)for(const c of channels)for(let i=0;i<c.length;i++)c[i]*=.98/top;
 const file=new Blob([K().encodeWav(channels,rate)],{type:'audio/wav'});
 const draft=await api('/api/covers','POST',{original_id:sing.id,description:fd.get('description')||'',own_voice:fd.has('own_voice'),rights:fd.has('rights'),extension:'wav',bytes:file.size});
 await uploadFile(`/api/uploads/${draft.id}/audio`,file,value=>{progress.querySelector('progress').value=value;note.textContent=`올리는 중 ${Math.round(value)}%`;});
 await api(`/api/uploads/${draft.id}/complete`,'POST');
 cleanupSing();toast('커버곡을 올렸어요! 변환이 끝나면 공개돼요.');location.hash='studio';
}

document.addEventListener('click',e=>{
 const el=e.target.closest('[data-sing-start],[data-sing-stop],[data-sing-preview],[data-sing-retry]');if(!el||!sing)return;
 if(el.hasAttribute('data-sing-start'))startSinging();
 else if(el.hasAttribute('data-sing-stop'))finishSinging();
 else if(el.hasAttribute('data-sing-preview'))sing.preview?stopPreview():previewMix(0);
 else if(el.hasAttribute('data-sing-retry')){stopPreview();sing.state='idle';sing.voice=null;$('#sing-panel').innerHTML=singStartHTML();drawLyrics(-1);}
});
