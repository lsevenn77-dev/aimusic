// Always process the dry take; retired pitch-correction settings cannot alter playback.
const vocalPlaybackBuffer=s=>s.voice;
const vocalEffectKey=m=>JSON.stringify([m.noise,m.echo,m.room,m.size,m.tone]);
function cancelVocalEffects(s){
 clearTimeout(s?.effectTimer);if(!s?.effectJob)return;const job=s.effectJob;s.effectJob=null;job.worker.terminate();job.reject(Object.assign(new Error('효과 설정이 변경됐어요.'),{cancelled:true}));
}
async function prepareVocalEffects(s){
 const source=vocalPlaybackBuffer(s),key=vocalEffectKey(s.mix);
 if(s.processed?.source===source&&s.processed.key===key)return s.processed.buffer;
 if(s.effectJob?.source===source&&s.effectJob.key===key)return s.effectJob.promise;
 cancelVocalEffects(s);const worker=new Worker('/vocal-render-worker.js?v=20261017-tone-range'),job={worker,source,key};
 s.effectJob=job;
 const result=new Promise((resolve,reject)=>{
  job.reject=reject;worker.onerror=()=>reject(new Error('미리 듣기 효과를 준비하지 못했어요. 다시 재생해주세요.'));
  worker.onmessage=({data})=>{try{
   if(data.error){reject(new Error(data.error));return;}
   if(sing!==s||s.effectJob!==job||vocalPlaybackBuffer(s)!==source||vocalEffectKey(s.mix)!==key){reject(Object.assign(new Error('효과 설정이 변경됐어요.'),{cancelled:true}));return;}
   const buffer=s.ctx.createBuffer(1,data.samples.length,source.sampleRate);buffer.copyToChannel(data.samples,0);s.processed={key,source,buffer};resolve(buffer);
  }catch(error){reject(error);}};
  const samples=source.getChannelData(0).slice();worker.postMessage({samples,sampleRate:source.sampleRate,mix:{...s.mix}},[samples.buffer]);
 });
 job.promise=result.finally(()=>{worker.terminate();if(s.effectJob===job)s.effectJob=null;});return job.promise;
}
function refreshPreviewEffects(s){
 cancelVocalEffects(s);const preview=s.preview;
 // Keep the existing audio playing while rendering, then replace only the vocal
 // with a short crossfade. Repeated slider changes never restart the backing.
 s.effectTimer=setTimeout(async()=>{
  try{setSingStatus('효과를 반영하고 있어요…');const buffer=await prepareVocalEffects(s);if(sing===s&&s.state==='playing'&&s.preview===preview){s.previewReplaceVoice?.(buffer);setSingStatus('효과가 반영됐어요. 재생하면서 계속 조절할 수 있어요.');}}
  catch(error){if(!error.cancelled&&sing===s)setSingStatus(error.message);}
 },80);
}
