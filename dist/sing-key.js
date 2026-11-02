function singingKey(s){return Math.max(-6,Math.min(6,Math.round(Number(s?.keySemitones)||0)));}
function keyName(s,key=singingKey(s)){return key?(key>0?'+':'')+key+' 반음':s?.parent?'파트너 키':'원곡 키';}
function singingKeyHTML(){return '<div class="studio-key"><span>음높이</span><div class="studio-key-stepper" role="group" aria-label="반주 키 조절"><button type="button" data-key-step="-1" aria-label="키 반음 낮추기">−</button><output data-key-value aria-live="polite">0</output><button type="button" data-key-step="1" aria-label="키 반음 높이기">+</button></div></div>';}
function updateKeyControls(){
 const s=sing;if(!s)return;
 const key=singingKey(s),locked=singBusy(s)||!!nativeSinging()||!!s.punchRange;
 document.querySelectorAll('[data-key-step]').forEach(b=>b.disabled=locked||Math.abs(key+Number(b.dataset.keyStep))>6);
 paintBackingKey(s,s.cursor||0,true);
}
function paintBackingKey(s,position,force=false){
 let key=singingKey(s);
 if(s.keyEvents?.length&&(s.punchRange||s.voice&&!s.editingRecording&&!s.run)){
  // Editing playback and punch-in follow the keys saved with the take.
  const events=s.keyEvents;
  let low=0,high=events.length;
  while(low+1<high){const mid=Math.floor((low+high)/2);if(events[mid].at<=position)low=mid;else high=mid;}
  key=events[low].key;
 }
 if(!force&&s.displayedKey===key)return;
 s.displayedKey=key;
 document.querySelectorAll('[data-key-value]').forEach(el=>el.textContent=key>0?'+'+key:String(key));
 document.querySelectorAll('[data-recording-key]').forEach(el=>el.textContent=keyName(s,key));
}
function bindKeyControls(){document.querySelectorAll('[data-key-step]').forEach(b=>b.onclick=()=>changeSingingKey(singingKey(sing)+Number(b.dataset.keyStep)));}
function changeSingingKey(value){
 const s=sing;if(!s||singBusy(s)||nativeSinging()||s.punchRange)return;
 const key=singingKey({keySemitones:value});
 if(key===singingKey(s))return;
 // Commit a legacy take's original key before changing the pending recording key.
 if(s.voice&&!s.keyEvents?.length)s.keyEvents=[{at:0,key:singingKey(s)}];
 s.keySemitones=key;
 const live=s.run?.pitch||s.previewPitch;
 if(live){
  const now=s.ctx.currentTime;
  live.param.setValueAtTime(key,Math.max(live.at,now));
  if(s.run){
   const position=Math.max(s.run.recordAt,s.run.from+now-s.run.t0);
   const events=s.run.keyEvents;
   if(events.at(-1).at===position)events.pop();
   events.push({at:position,key});
  }
 }
 updateKeyControls();
 if(!s.run)queueSingDraft(s);
}
function connectLiveBacking(s,source,gain,at,from,duration,events){
 const ctx=s.ctx,buffer=source.buffer,rate=buffer.sampleRate;
 // Supply 350ms of lookahead with a second, inaudible source feeding only the
 // worklet. Memory and conversion time are independent of song length.
 const lead=Math.ceil(rate*.35),first=Math.round(from*rate);
 const head=Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,c)=>{
  const data=new Float32Array(lead);buffer.copyFromChannel(data,c,first);return data;
 });
 const node=new AudioWorkletNode(ctx,'aifect-backing',{numberOfInputs:2,outputChannelCount:[head.length],processorOptions:{head,at,duration}});
 const param=node.parameters.get('semitones');
 let key=singingKey(s);
 if(events?.length){
  key=events[0].key;
  for(const e of events){if(e.at<=from)key=e.key;else if(e.at<from+duration)param.setValueAtTime(e.key,at+e.at-from);}
 }
 param.setValueAtTime(key,at);
 source.connect(node,0,0);node.connect(gain);
 const ahead=ctx.createBufferSource();ahead.buffer=buffer;ahead.connect(node,0,1);
 const aheadFrom=(first+lead)/rate;
 if(aheadFrom<buffer.duration)ahead.start(at,aheadFrom,Math.min(duration,buffer.duration-aheadFrom));
 return {param,at,close(){try{ahead.stop();}catch{}ahead.disconnect();source.disconnect();node.disconnect();}};
}
function cancelKeyProcessing(s){
 if(!s?.keyJob)return;
 const job=s.keyJob;s.keyJob=null;job.worker.terminate();job.reject(new Error('녹음 화면을 닫았어요.'));
}
function backingBuffer(s){
 const events=s.keyEvents,key=events?.[0]?.key??singingKey(s);
 if(!key&&!(events?.length>1))return s.mr;
 if(s.keyMR?.key!==key||s.keyMR?.events!==events||s.keyMR?.source!==s.mr)throw new Error('변경한 키의 반주를 다시 준비해주세요.');
 return s.keyMR.buffer;
}
async function prepareKeyBacking(s){
 const events=s.keyEvents,key=events?.[0]?.key??singingKey(s);
 if(!key&&!(events?.length>1))return;
 const source=s.mr;
 if(s.keyMR?.key===key&&s.keyMR?.events===events&&s.keyMR.source===source)return;
 if(s.keyJob){
  if(s.keyJob.key===key&&s.keyJob.source===source&&s.keyJob.events===events)return s.keyJob.promise;
  cancelKeyProcessing(s);
 }
 const worker=new Worker('/pitch-worker.js?v=20261102-live');
 const job={worker,key,source,events};s.keyJob=job;
 job.promise=new Promise((resolve,reject)=>{
  job.reject=reject;
  worker.onmessage=({data})=>{
   if(sing!==s||s.keyJob!==job)return;
   if(data.error){reject(new Error(data.error));return;}
   if(data.channels){
    const buffer=s.ctx.createBuffer(data.channels.length,data.channels[0].length,source.sampleRate);
    data.channels.forEach((c,i)=>buffer.copyToChannel(c,i));s.keyMR={key,events,source,buffer};resolve();
   }
  };
  worker.onerror=()=>reject(new Error('반주 키 변환을 완료하지 못했어요.'));
  const channels=Array.from({length:source.numberOfChannels},(_,i)=>source.getChannelData(i).slice());
  worker.postMessage({channels,sampleRate:source.sampleRate,semitones:key,events},channels.map(c=>c.buffer));
 });
 try{await job.promise;}finally{worker.terminate();if(s.keyJob===job)s.keyJob=null;}
}
async function toggleBackingPreview(){
 const s=sing;if(!s||singBusy(s)||singLive(s))return;if(s.state==='backing'){stopPreview();updateTransport();setSingStatus('반주를 멈췄어요.');return;}
 stopPreview();++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';updateTransport();
 try{const ctx=await prepareSing(s,true);if(ctx.state!=='running')throw new Error('오디오가 일시정지됐어요. 반주 듣기를 다시 눌러주세요.');if(sing!==s||document.hidden){if(sing===s){s.state=s.voice?'review':'idle';updateTransport();}return;}const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=s.mr;gain.gain.value=s.mix.mr;gain.connect(ctx.destination);const from=s.cursor>=s.mr.duration-.05?0:s.cursor,at=ctx.currentTime+.05;s.previewPitch=connectLiveBacking(s,src,gain,at,from,s.mr.duration-from);src.start(at,from);runPreview(s,[src],at,from,'backing',[gain]);s.previewMixUpdate=m=>gain.gain.setTargetAtTime(m.mr,ctx.currentTime,.015);setSingStatus(`${keyName(s)} 반주를 듣고 있어요. 녹음은 시작하지 않았어요.`);}
 catch(e){if(sing===s){s.state=s.voice?'review':'idle';updateTransport();setSingStatus(e.message||'반주를 재생하지 못했어요.');}}
}
