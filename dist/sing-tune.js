const vocalTuneLevel=s=>[1,2].includes(Number(s?.mix?.pitchCorrection))?Number(s.mix.pitchCorrection):0;
const canVocalTune=()=>member.plan==='premium'&&Number(member.premium_until)*1000>Date.now();
function vocalTuneHTML(s){
 const allowed=canVocalTune(),level=vocalTuneLevel(s);
 return `<section class="vocal-tune"><div class="vocal-tune-heading"><h3>자연스러운 음정 보정</h3><span class="vocal-tune-premium">${icon('crown')} Premium</span></div><p>작게 벗어난 음정을 다듬고 목소리의 떨림과 개성을 살려요.</p><div class="vocal-tune-options" role="group" aria-label="음정 보정 강도">${['끔','약하게','보통'].map((label,i)=>`<button type="button" data-vocal-tune="${i}" aria-pressed="${level===i}" ${i&&!allowed?'disabled':''}>${label}${i&&!allowed?' · 잠금':''}</button>`).join('')}</div>${!allowed?'<p class="vocal-tune-locked">Premium 구독자가 사용할 수 있어요.</p><a class="small-button" href="#membership" data-tune-membership>Premium 혜택 보기</a>':'<p class="field-help">녹음 후 내 목소리에만 적용돼요. 크게 틀린 음이나 원곡 멜로디를 자동으로 맞추지는 않아요.</p><button type="button" class="small-button" data-tune-compare>보정 전 듣기</button>'}<p class="vocal-tune-status" data-tune-status role="status"></p></section>`;
}
function refreshTuneControls(){
 if(!sing)return;const level=vocalTuneLevel(sing),busy=singBusy(sing)||singLive(sing),allowed=canVocalTune();
 document.querySelectorAll('[data-vocal-tune]').forEach(b=>{const n=Number(b.dataset.vocalTune);b.setAttribute('aria-pressed',String(level===n));b.disabled=(busy&&sing.state!=='tuning')||(n>0&&(!allowed||busy));});
 document.querySelectorAll('[data-tune-compare]').forEach(b=>{b.disabled=!level||!allowed||busy;b.textContent=sing.compareRaw?'보정 후 듣기':'보정 전 듣기';b.setAttribute('aria-pressed',String(!!sing.compareRaw));});
 document.querySelectorAll('[data-tune-status]').forEach(el=>el.textContent=sing.tuneMessage||(!level?'원래 음정을 유지합니다.':sing.tuned?.source===sing.voice&&sing.tuned.level===level?(sing.tuned.correctedSeconds>.1?'미리 듣기와 저장에 같은 보정이 적용됩니다.':'보정할 작은 음정 차이가 없어 원음을 유지했어요.'):'들어보기 전에 음정을 분석합니다.'));
}
function cancelVocalTuning(s){const job=s?.tuneJob;if(job){s.tuneJob=null;job.worker.terminate();job.reject(new Error('음정 보정을 취소했어요. 원음은 그대로예요.'));}}
async function authorizeVocalTuning(s){
 try{return await api('/api/pitch-correction/access','GET',undefined,{fresh:true});}
 catch(e){if(sing===s){s.mix.pitchCorrection=0;s.tuned=null;s.compareRaw=false;if(e.status===401||e.status===403)member={...member,plan:'free',premium_until:null};refreshTuneControls();}throw e;}
}
function vocalPlaybackBuffer(s){
 if(!vocalTuneLevel(s)||s.compareRaw)return s.voice;
 if(s.tuned?.source!==s.voice||s.tuned.level!==vocalTuneLevel(s))throw new Error('음정 보정을 먼저 완료해주세요.');
 return s.tuned.buffer;
}
async function prepareVocalTuning(s){
 const level=vocalTuneLevel(s),source=s.voice,request=s.tuneRequest;if(!level)return;
 const access=await authorizeVocalTuning(s);if(sing!==s||!source||s.voice!==source||vocalTuneLevel(s)!==level||s.tuneRequest!==request)throw new Error('녹음 화면이 변경됐어요.');
 s.tuneAccessUntil=access.expires*1000;
 if(s.tuned?.source===s.voice&&s.tuned.level===level)return;
 if(s.tuneJob?.source===s.voice&&s.tuneJob.level===level)return s.tuneJob.promise;
 cancelVocalTuning(s);const worker=new Worker('/api/pitch-correction/worker.js?v=20261016-1');let rejectJob;
 const promise=new Promise((resolve,reject)=>{
  rejectJob=reject;
  worker.onmessage=({data})=>{
   if(sing!==s||s.voice!==source){reject(new Error('녹음이 변경되어 보정을 중단했어요.'));return;}
   if(data.error){reject(new Error(data.error));return;}
   if(data.samples){const buffer=s.ctx.createBuffer(1,data.samples.length,source.sampleRate);buffer.copyToChannel(data.samples,0);resolve({buffer,correctedSeconds:data.correctedSeconds});}
   else if(Number.isFinite(data.progress)){s.tuneMessage=`음정을 다듬고 있어요… ${Math.max(0,Math.min(100,data.progress))}%`;refreshTuneControls();setSingStatus(s.tuneMessage);}
  };
  worker.onerror=()=>reject(new Error('음정 보정을 시작하지 못했어요. 구독 상태와 연결을 확인해주세요.'));
  const samples=source.getChannelData(0).slice();worker.postMessage({samples,sampleRate:source.sampleRate,level},[samples.buffer]);
 });
 const job={worker,level,source,reject:rejectJob};s.tuneJob=job;
 job.promise=(async()=>{try{const result=await promise;const renewed=await authorizeVocalTuning(s);if(sing!==s||s.voice!==source||vocalTuneLevel(s)!==level||s.tuneJob!==job)throw new Error('녹음이 변경되어 보정을 중단했어요.');s.tuneAccessUntil=renewed.expires*1000;s.tuned={...result,source,level};}finally{worker.terminate();if(s.tuneJob===job){s.tuneJob=null;s.tuneMessage='';refreshTuneControls();}}})();
 return job.promise;
}
async function changeVocalTuning(value){
 const s=sing;if(!s?.voice||singLive(s)||s.state==='exporting')return;
 const level=[1,2].includes(value)?value:0;if(level&&(!canVocalTune()||singBusy(s)))return;
 const resume=s.state==='playing',until=s.previewUntil,previous=vocalTuneLevel(s),serial=s.tuneRequest=(s.tuneRequest||0)+1;
 stopPreview();cancelVocalTuning(s);s.mix.pitchCorrection=level;s.compareRaw=false;s.compareFrom=null;s.state=level?'tuning':'review';s.tuneMessage=level?'음정을 분석할 준비를 하고 있어요…':'';updateTransport();
 try{if(level)await prepareVocalTuning(s);if(sing!==s||s.tuneRequest!==serial)return;queueSingDraft(s);setSingStatus(level?'음정 보정이 준비됐어요. 보정 전·후를 비교해보세요.':'음정 보정을 껐어요. 원래 음정으로 들어보세요.');}
 catch(e){if(sing===s&&s.tuneRequest===serial){s.mix.pitchCorrection=s.mix.pitchCorrection===0?0:previous;setSingStatus(e.message);}}
 finally{if(sing===s&&s.tuneRequest===serial){s.state='review';s.tuneMessage='';updateTransport();if(resume)void previewMix(s.cursor,until??Infinity);}}
}
function bindTuneControls(){
 document.querySelectorAll('[data-vocal-tune]').forEach(b=>b.onclick=()=>changeVocalTuning(Number(b.dataset.vocalTune)));
 document.querySelectorAll('[data-tune-compare]').forEach(b=>b.onclick=()=>{const s=sing;if(!s||singBusy(s)||!vocalTuneLevel(s))return;const from=s.compareFrom??s.cursor;stopPreview();s.compareFrom=from;s.compareRaw=!s.compareRaw;refreshTuneControls();void previewMix(from);});
 document.querySelectorAll('[data-tune-membership]').forEach(b=>b.onclick=()=>{if(sing?.voice)void saveSingDraft(sing);});refreshTuneControls();
}
