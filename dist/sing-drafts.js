// Device-local dry audio is scoped to the signed-in account and song. No microphone permission is used to restore it.
let draftDbPromise;
function openDraftDB(){return draftDbPromise||=new Promise((resolve,reject)=>{const r=indexedDB.open('aifect-recordings',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{draftDbPromise=null;reject(r.error);};});}
async function draftOp(mode,key,value){const db=await openDraftDB();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('drafts');const r=mode==='get'?store.get(key):mode==='delete'?store.delete(key):store.put(value);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('임시저장이 중단됐어요.'));});}
const singDraftKey=s=>s.owner+':'+s.id;
async function saveSingDraft(s=sing){
 if(!s?.voice||!s.owner)return;const revision=s.revision||0;
 const data={key:singDraftKey(s),owner:s.owner,id:s.id,samples:s.voice.getChannelData(0).slice(),rate:s.voice.sampleRate,mix:{...s.mix},cursor:s.cursor,description:s.description||'',updated:Date.now()};
 s.draftWrite=(s.draftWrite||Promise.resolve()).catch(()=>{}).then(()=>draftOp('put',data.key,data));await s.draftWrite;
 if((s.revision||0)===revision)s.dirty=false;
}
async function restoreSingDraft(s){
 try{const d=await draftOp('get',singDraftKey(s));if(sing!==s||!d||d.owner!==s.owner||!(d.samples instanceof Float32Array)||d.samples.length>600*d.rate||!d.samples.length)return;
  const ctx=s.ctx||(s.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:K().MIX_RATE}));s.voice=ctx.createBuffer(1,d.samples.length,d.rate);s.voice.copyToChannel(d.samples,0);s.mix={...s.mix,...K().restoreRoomMix(d.mix)};s.cursor=Math.min(d.cursor||0,s.voice.duration);s.description=d.description||'';s.state='review';renderSingPanel();drawLyrics(s.cursor);setSingStatus('이 기기에 임시저장한 녹음과 효과를 복원했어요.');
 }catch(e){if(sing===s)setSingStatus('임시저장을 읽지 못했어요. 브라우저 저장 공간을 확인해주세요.');}
 finally{if(sing===s&&s.state==='loading'){s.state=s.voice?'review':'idle';updateTransport();}}
}
async function removeSingDraft(s){await s.draftWrite?.catch(()=>{});await draftOp('delete',singDraftKey(s));}
function queueSingDraft(s){clearTimeout(s.draftTimer);s.revision=(s.revision||0)+1;s.dirty=true;s.draftTimer=setTimeout(()=>saveSingDraft(s).catch(()=>{if(sing===s)setSingStatus('임시저장하지 못했어요. 저장 공간을 확인해주세요.');}),450);}
document.addEventListener('click',async e=>{
 if(e.target.closest('[data-sing-draft]')&&sing){const s=sing;try{if(singLive(s))await finishSinging();await saveSingDraft(s);if(sing===s)setSingStatus('이 계정의 녹음을 현재 기기·브라우저에 임시저장했어요.');}catch{setSingStatus('임시저장하지 못했어요. 저장 공간을 확인해주세요.');}}
 if(e.target.closest('[data-discard-draft]')&&sing?.voice&&!singLive(sing)&&!singBusy(sing)&&confirm('이 기기에 임시저장한 녹음을 삭제할까요?')){const s=sing;try{stopPreview();clearTimeout(s.draftTimer);await removeSingDraft(s);s.voice=null;s.processed=null;s.dirty=false;s.cursor=0;s.state='idle';renderSingPanel();drawLyrics(0);}catch(e){setSingStatus('임시 녹음을 삭제하지 못했어요. 다시 시도해주세요.');}}
});
