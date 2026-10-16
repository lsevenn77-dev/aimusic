function singingKey(s){return Math.max(-6,Math.min(6,Math.round(Number(s?.keySemitones)||0)));}
function keyName(s){const key=singingKey(s);return s?.parent?'파트너 키':key===0?'원곡 키':`${key>0?'+':''}${key} 반음`;}
function singingKeyHTML(){return `<div class="studio-key"><span>음높이</span><div class="studio-key-stepper" role="group" aria-label="반주 키 조절"><button type="button" data-key-step="-1" aria-label="키 반음 낮추기">−</button><output data-key-value aria-live="polite">원곡 키</output><button type="button" data-key-step="1" aria-label="키 반음 높이기">+</button></div></div><div class="studio-key-actions"><button type="button" data-key-reset>원곡 키로</button><button type="button" data-backing-preview>반주 듣기</button></div><p class="field-help" data-key-help>녹음 전에 −6 ~ +6 반음으로 조절하세요.</p>`;}
function updateKeyControls(){
 const s=sing;if(!s)return;const locked=(singBusy(s)&&!s.keyChange)||singLive(s)||!!s.voice||!!s.parent||!!nativeSinging(),key=singingKey(s);
 document.querySelectorAll('[data-key-step]').forEach(b=>b.disabled=locked||key+Number(b.dataset.keyStep)<-6||key+Number(b.dataset.keyStep)>6);
 document.querySelectorAll('[data-key-value],[data-recording-key]').forEach(el=>el.textContent=keyName(s));
 document.querySelectorAll('[data-key-reset]').forEach(b=>b.disabled=locked||!key);
 document.querySelectorAll('[data-backing-preview]').forEach(b=>{b.disabled=singBusy(s)||singLive(s)||!!nativeSinging();b.textContent=s.parent?(s.state==='backing'?'파트너 녹음 멈추기':'파트너 녹음 듣기'):(s.state==='backing'?'반주 멈추기':'반주 듣기');});
 document.querySelectorAll('[data-key-help]').forEach(el=>el.textContent=s.parent?'파트너가 녹음한 키에 맞춰 함께 불러요.':s.voice?'녹음된 목소리와 맞도록 이 녹음의 키를 유지합니다.':'녹음 전에 −6 ~ +6 반음으로 조절하세요. 속도는 유지됩니다.');
}
function bindKeyControls(){document.querySelectorAll('[data-key-step]').forEach(b=>b.onclick=()=>changeSingingKey(singingKey(sing)+Number(b.dataset.keyStep)));$('[data-key-reset]').onclick=()=>changeSingingKey(0);$('[data-backing-preview]').onclick=toggleBackingPreview;}
function cancelKeyWorker(s){const job=s?.keyJob;if(job){s.keyJob=null;job.worker.terminate();job.reject(Object.assign(new Error('키 설정이 변경됐어요.'),{cancelled:true}));}}
function cancelKeyProcessing(s){if(!s)return;clearTimeout(s.keyTimer);s.keyTimer=null;s.keyWait?.();s.keyWait=null;s.keyRequest=(s.keyRequest||0)+1;cancelKeyWorker(s);}
function backingBuffer(s){if(!singingKey(s)||s.parent)return s.mr;if(s.keyMR?.key!==singingKey(s)||s.keyMR?.source!==s.mr)throw new Error('변경한 키의 반주를 다시 준비해주세요.');return s.keyMR.buffer;}
async function prepareKeyBacking(s){
 const key=s.parent?0:singingKey(s);if(!key){s.keyMR=null;return;}if(s.keyMR?.key===key&&s.keyMR.source===s.mr)return;
 if(s.keyJob?.key===key)return s.keyJob.promise;
 cancelKeyWorker(s);
 const source=s.mr;
 const worker=new Worker('/pitch-worker.js?v=20261015-1');let rejectJob;
 const promise=new Promise((resolve,reject)=>{
  rejectJob=reject;
  worker.onmessage=({data})=>{if(sing!==s||s.keyJob!==job||s.mr!==source||singingKey(s)!==key){reject(Object.assign(new Error('키 설정이 변경됐어요.'),{cancelled:true}));return;}if(data.error){reject(new Error(data.error));return;}if(data.channels){const buffer=s.ctx.createBuffer(data.channels.length,data.channels[0].length,s.mr.sampleRate);data.channels.forEach((c,i)=>buffer.copyToChannel(c,i));s.keyMR={key,source,buffer};resolve();}else if(Number.isFinite(data.progress))setSingStatus(`반주를 ${key>0?'+':''}${key} 반음으로 준비하고 있어요… ${data.progress}%`);};
  worker.onerror=()=>reject(new Error('키 변환을 시작하지 못했어요. 다시 시도해주세요.'));
  const channels=Array.from({length:s.mr.numberOfChannels},(_,i)=>s.mr.getChannelData(i).slice());worker.postMessage({channels,sampleRate:s.mr.sampleRate,semitones:key},channels.map(c=>c.buffer));
 });
 const job={worker,promise,key,reject:rejectJob};s.keyJob=job;
 try{await promise;}finally{worker.terminate();if(s.keyJob===job)s.keyJob=null;}
}
async function changeSingingKey(value){
 const s=sing;if(!s||(singBusy(s)&&!s.keyChange)||singLive(s)||s.voice||s.parent||nativeSinging())return;
 const key=Math.max(-6,Math.min(6,Math.round(Number(value)||0)));if(key===singingKey(s))return;
 const change=s.keyChange||{old:singingKey(s),cached:s.keyMR,resume:s.state==='backing'};
 cancelKeyProcessing(s);const request=s.keyRequest;stopPreview();s.keyChange=change;s.keySemitones=key;s.state='loading';updateTransport();setSingStatus(`${keyName(s)} 선택 · 마지막으로 선택한 키를 준비합니다…`);
 // Let repeated taps accumulate before copying and converting the whole backing.
 await new Promise(resolve=>{s.keyWait=resolve;s.keyTimer=setTimeout(resolve,200);});
 if(sing!==s||request!==s.keyRequest)return;s.keyWait=null;s.keyTimer=null;
 try{
  if(key){await prepareSingAudio(s);if(sing!==s||request!==s.keyRequest)return;await prepareKeyBacking(s);}
  if(sing!==s||request!==s.keyRequest)return;
  s.keyChange=null;s.state='idle';queueSingDraft(s);updateTransport();setSingStatus(`${keyName(s)} 설정이 준비됐어요. 반주 듣기로 확인해보세요.`);if(change.resume&&!document.hidden)await toggleBackingPreview();
 }catch(e){if(sing===s&&request===s.keyRequest){s.keySemitones=change.old;s.keyMR=change.cached;s.keyChange=null;s.state='idle';updateTransport();setSingStatus(e.message||'키를 변경하지 못했어요.');}}
}
async function toggleBackingPreview(){
 const s=sing;if(!s||singBusy(s)||singLive(s))return;if(s.state==='backing'){stopPreview();updateTransport();setSingStatus('반주를 멈췄어요.');return;}
 stopPreview();++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';updateTransport();
 try{const ctx=await prepareSing(s);if(sing!==s||document.hidden){if(sing===s){s.state=s.voice?'review':'idle';updateTransport();}return;}const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=backingBuffer(s);gain.gain.value=s.mix.mr;src.connect(gain).connect(ctx.destination);const from=s.cursor>=s.mr.duration-.05?0:s.cursor,at=ctx.currentTime+.05;src.start(at,from);runPreview(s,[src],at,from,'backing',[gain]);s.previewMixUpdate=m=>gain.gain.setTargetAtTime(m.mr,ctx.currentTime,.015);setSingStatus(`${keyName(s)} 반주를 듣고 있어요. 녹음은 시작하지 않았어요.`);}
 catch(e){if(sing===s){s.state=s.voice?'review':'idle';updateTransport();setSingStatus(e.message||'반주를 재생하지 못했어요.');}}
}
