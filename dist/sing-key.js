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
  const applied=live.param.setValueAtTime(key,Math.max(live.at,now));
  if(s.run){
   const position=Math.max(s.run.recordAt,s.run.from+(Number.isFinite(applied)?applied:now)-s.run.t0);
   const events=s.run.keyEvents;
   if(events.at(-1).at===position)events.pop();
   events.push({at:position,key});
  }
 }
 updateKeyControls();
 if(!s.run)queueSingDraft(s);
}
function connectLiveBacking(s,source,gain,at,from,duration,events){
 const ctx=s.ctx,buffer=source.buffer,rate=ctx.sampleRate,channels=Math.min(2,buffer.numberOfChannels);
 const node=new AudioWorkletNode(ctx,'aifect-backing',{numberOfInputs:1,outputChannelCount:[channels],processorOptions:{at,duration}});
 source.connect(node).connect(gain);
 // Workers produce timestamped audio ahead of the device clock. The worklet only
 // copies/crossfades PCM; pitch-search bursts cannot stall microphone capture.
 const total=Math.round(duration*rate),first=Math.round(from*rate),chunk=Math.round(.20*rate);
 let worker=null,closed=false,busy=false,generation=0,position=0,activation=0,plan=[];
 function pump(){
  if(closed||busy||!plan.some(e=>e.key)||position>=total||position>Math.max(0,(ctx.currentTime-at)*rate)+rate*.8)return;
  if(!worker){worker=new Worker('/pitch-worker.js?v=take-editor2');worker.onmessage=({data})=>{busy=false;if(closed)return;if(data.error){setSingStatus('음높이 처리를 중단했습니다. 원래 반주로 재생합니다.',true);plan=[];return;}if(data.generation===generation){node.port.postMessage(data,[data.pcm.buffer]);position=data.position+data.count;}pump();};
   worker.onerror=()=>{busy=false;plan=[];setSingStatus('음높이를 처리하지 못해 원래 반주로 재생합니다.',true);};}
  const count=Math.min(chunk,total-position),start=Math.max(0,position-Math.round(.16*rate)),length=position-start+count+Math.ceil(.40*rate);
  const inputs=Array.from({length:channels},(_,c)=>{const samples=new Float32Array(length);if(first+start<buffer.length)buffer.copyFromChannel(samples,c,first+start);return samples;});
  busy=true;worker.postMessage({live:true,generation,activation,position,start,count,rate,inputs,events:plan},inputs.map(c=>c.buffer));
 }
 function change(key,time){
  const when=Math.max(at,time,ctx.currentTime+.14);generation++;position=activation=Math.min(total,Math.max(0,Math.round((when-at)*rate)));plan=[{at:0,key}];
  if(!key)node.port.postMessage({dry:true,generation,activation,position,count:total-position});pump();return at+activation/rate;
 }
 const keys=events?.length?events:[{at:0,key:singingKey(s)}];let initial=keys[0].key;
 for(const e of keys)if(e.at<=from)initial=e.key;
 plan=[{at:0,key:initial},...keys.filter(e=>e.at>from&&e.at<from+duration).map(e=>({at:Math.round((e.at-from)*rate),key:e.key}))];
 const timer=setInterval(pump,40);pump();
 return {param:{setValueAtTime:change},at,close(){closed=true;clearInterval(timer);worker?.terminate();node.port.onmessage=null;source.disconnect();node.disconnect();}};
}
function cancelKeyProcessing(s){
 if(!s?.keyJob)return;
 const job=s.keyJob;s.keyJob=null;job.worker.terminate();job.reject(new Error('녹음 화면을 닫았습니다.'));
}
function backingBuffer(s){
 const events=s.keyEvents,key=events?.[0]?.key??singingKey(s);
 if(!key&&!(events?.length>1))return s.mr;
 if(s.keyMR?.key!==key||s.keyMR?.events!==events||s.keyMR?.source!==s.mr)throw new Error('변경한 키의 반주를 다시 준비해 주세요.');
 return s.keyMR.buffer;
}
async function prepareKeyBacking(s){
 const events=s.keyEvents,key=events?.[0]?.key??singingKey(s);
 if(!key&&!(events?.length>1)){s.keyMR=null;return;}
 const source=s.mr;
 if(s.keyMR?.key===key&&s.keyMR?.events===events&&s.keyMR.source===source)return;
 if(s.keyJob){
  if(s.keyJob.key===key&&s.keyJob.source===source&&s.keyJob.events===events)return s.keyJob.promise;
  cancelKeyProcessing(s);
 }
 const worker=new Worker('/pitch-worker.js?v=take-editor2');
 const job={worker,key,source,events};s.keyJob=job;
 job.promise=new Promise((resolve,reject)=>{
  job.reject=reject;
  const result={key,events,source},pending=s.partnerStem?[['instrument',s.instrumentStem],['partner',s.partnerStem]]:[['buffer',source]];
  let slot='';
  const next=()=>{const entry=pending.shift();if(!entry){s.keyMR=result;resolve();return;}const [part,input]=entry;slot=part;const channels=Array.from({length:input.numberOfChannels},(_,i)=>input.getChannelData(i).slice());worker.postMessage({channels,sampleRate:input.sampleRate,semitones:key,events:events?.length?events:[{at:0,key}]},channels.map(c=>c.buffer));};
  worker.onmessage=({data})=>{
   if(sing!==s||s.keyJob!==job)return;
   if(data.error){reject(new Error(data.error));return;}
   if(data.channels){const buffer=s.ctx.createBuffer(data.channels.length,data.channels[0].length,source.sampleRate);data.channels.forEach((c,i)=>buffer.copyToChannel(c,i));result[slot]=buffer;next();}
  };
  worker.onerror=()=>reject(new Error('반주 키 변환을 완료하지 못했습니다.'));
  next();
 });
 try{await job.promise;}finally{worker.terminate();if(s.keyJob===job)s.keyJob=null;}
}
async function toggleBackingPreview(){
 const s=sing;if(!s||singBusy(s)||singLive(s))return;if(s.state==='backing'){stopPreview();updateTransport();setSingStatus('반주를 멈췄습니다.');return;}
 stopPreview();++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';updateTransport();
 try{const ctx=await prepareSing(s,true);if(ctx.state!=='running')throw new Error('오디오가 일시정지되었습니다. 반주 듣기를 다시 눌러 주세요.');if(sing!==s||document.hidden){if(sing===s){s.state=s.voice?'review':'idle';updateTransport();}return;}const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=s.mr;gain.gain.value=s.mix.mr;gain.connect(ctx.destination);const from=s.cursor>=s.mr.duration-.05?0:s.cursor,at=ctx.currentTime+.05;s.previewPitch=connectLiveBacking(s,src,gain,at,from,s.mr.duration-from);src.start(at,from);runPreview(s,[src],at,from,'backing',[gain]);s.previewMixUpdate=m=>gain.gain.setTargetAtTime(m.mr,ctx.currentTime,.015);setSingStatus(`${keyName(s)} 반주를 듣고 있습니다. 녹음은 시작하지 않았습니다.`);}
 catch(e){if(sing===s){s.state=s.voice?'review':'idle';updateTransport();setSingStatus(e.message||'반주를 재생하지 못했습니다.');}}
}
