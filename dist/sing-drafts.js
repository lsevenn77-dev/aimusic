// Device-local dry audio is scoped to the signed-in account and song. No microphone permission is used to restore it.
let draftDbPromise;
function openDraftDB(){return draftDbPromise||=new Promise((resolve,reject)=>{const r=indexedDB.open('aifect-recordings',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{draftDbPromise=null;reject(r.error);};});}
async function draftOp(mode,key,value){const db=await openDraftDB();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('drafts');const r=mode==='get'?store.get(key):mode==='delete'?store.delete(key):store.put(value);if(mode==='put')store.put(singDraftSummary(value));else if(mode==='delete')store.delete('index:'+key);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('임시저장이 중단됐어요.'));});}
const singDraftKey=s=>s.owner+':'+s.id+(s.mode==='duet'?':duet:'+s.part+':'+(s.parent||'first'):'');
async function saveSingDraft(s=sing){
 if(!s||!s.owner||!s.voice&&s.mode!=='duet')return;const revision=s.revision||0;
 const data={key:singDraftKey(s),owner:s.owner,id:s.id,mode:s.mode,part:s.part,parent:s.parent,title:s.data.track.title,artist:s.data.track.artist,samples:s.voice?.getChannelData(0).slice()||new Float32Array(),rate:s.voice?.sampleRate||32000,duetGuide:s.duetGuide,mix:{...s.mix},cursor:s.cursor,description:s.description||'',updated:Date.now()};
 s.draftWrite=(s.draftWrite||Promise.resolve()).catch(()=>{}).then(()=>draftOp('put',data.key,data));await s.draftWrite;
 if((s.revision||0)===revision)s.dirty=false;
}
async function restoreSingDraft(s){
 try{const d=await draftOp('get',singDraftKey(s));if(sing!==s||!d||d.owner!==s.owner||!(d.samples instanceof Float32Array)||d.samples.length>600*d.rate )return;
  const ctx=s.ctx||(s.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:K().MIX_RATE}));if(d.samples.length){s.voice=ctx.createBuffer(1,d.samples.length,d.rate);s.voice.copyToChannel(d.samples,0);}if(!s.parent&&d.duetGuide)s.duetGuide=d.duetGuide;s.mix={...s.mix,...K().restoreVocalMix(d.mix)};s.cursor=Math.min(d.cursor||0,s.voice?.duration||s.data.track.duration);s.description=d.description||'';s.state=s.voice?'review':'idle';renderSingPanel();renderDuetGuide();drawLyrics(s.cursor);setSingStatus('이 기기에 임시저장한 녹음과 효과를 복원했어요.');
 }catch(e){if(sing===s)setSingStatus('임시저장을 읽지 못했어요. 브라우저 저장 공간을 확인해주세요.');}
 finally{if(sing===s&&s.state==='loading'){s.state=s.voice?'review':'idle';updateTransport();}}
}
async function removeSingDraft(s){await s.draftWrite?.catch(()=>{});await draftOp('delete',singDraftKey(s));}
function queueSingDraft(s){clearTimeout(s.draftTimer);s.revision=(s.revision||0)+1;s.dirty=true;s.draftTimer=setTimeout(()=>saveSingDraft(s).catch(()=>{if(sing===s)setSingStatus('임시저장하지 못했어요. 저장 공간을 확인해주세요.');}),450);}
document.addEventListener('click',async e=>{
 if(e.target.closest('[data-sing-draft]')&&sing){const s=sing;try{if(singLive(s))await finishSinging();await saveSingDraft(s);if(sing===s)setSingStatus('이 계정의 녹음을 현재 기기·브라우저에 임시저장했어요.');}catch{setSingStatus('임시저장하지 못했어요. 저장 공간을 확인해주세요.');}}
 if(e.target.closest('[data-discard-draft]')&&sing?.voice&&!singLive(sing)&&!singBusy(sing)&&confirm('이 기기에 임시저장한 녹음을 삭제할까요?')){const s=sing;try{stopPreview();clearTimeout(s.draftTimer);await removeSingDraft(s);s.voice=null;s.processed=null;s.dirty=false;s.cursor=0;s.state='idle';renderSingPanel();drawLyrics(0);}catch(e){setSingStatus('임시 녹음을 삭제하지 못했어요. 다시 시도해주세요.');}}
});

function singDraftSummary(d){const suffix=d.key.slice((d.owner+':'+d.id).length),legacy=suffix.startsWith(':duet:')?suffix.slice(6).split(':'):null;return {key:'index:'+d.key,draftKey:d.key,owner:d.owner,id:d.id,title:d.title||'',artist:d.artist||'',mode:d.mode||(legacy?'duet':'solo'),part:d.part||legacy?.[0]||'male',parent:d.parent||(legacy?.[1]!=='first'?legacy?.[1]:'')||'',duration:(d.samples?.length||0)/Math.max(1,d.rate||32000),updated:d.updated||0};}
async function listSingDrafts(){
 if(!me?.id)return [];const owner=me.id,db=await openDraftDB(),prefix=owner+':';
 const keys=await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readonly'),keys=[],r=tx.objectStore('drafts').openKeyCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));r.onsuccess=()=>{const c=r.result;if(c){keys.push(c.key);c.continue();}};tx.oncomplete=()=>resolve(keys);tx.onerror=()=>reject(tx.error);});
 const entries=[];for(const key of keys){let meta=await draftOp('get','index:'+key);if(!meta){const d=await draftOp('get',key);if(!d||d.owner!==owner)continue;meta=singDraftSummary(d);await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(meta);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}if(meta.owner===owner&&meta.duration>0)entries.push(meta);}
 if(entries.some(d=>!d.title))try{const tracks=(await api('/api/karaoke')).tracks||[];for(const d of entries){if(!d.title){const song=tracks.find(t=>t.id===d.id);if(song){d.title=song.title;d.artist=song.artist;await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(d);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}}}}catch{}
 if(me?.id!==owner)return [];return entries.sort((a,b)=>b.updated-a.updated);
}
function karaokeDraftsHTML(drafts){return heading('초안','이 기기·브라우저에 저장한 녹음이에요. 다른 기기에는 표시되지 않아요.')+'<a class="small-button" href="#karaoke">부르기로 돌아가기</a>'+ (drafts.length?'<div class="recording-drafts">'+drafts.map(d=>{const query=d.parent?'duet='+encodeURIComponent(d.parent):'mode='+d.mode+'&part='+encodeURIComponent(d.part);return '<a class="surface recording-draft" href="#sing/'+encodeURIComponent(d.id)+'?'+esc(query)+'"><span class="draft-mic">'+icon('mic')+'</span><span><strong>'+esc(d.title||'임시 저장한 녹음')+'</strong><small>'+ (d.mode==='duet'?'듀엣':'솔로')+' · '+time(d.duration)+' · '+esc(new Date(d.updated).toLocaleDateString('ko-KR'))+'</small></span><b>이어 편집</b></a>';}).join('')+'</div>':'<p class="surface empty-note">아직 저장된 초안이 없어요. 녹음 후 임시 저장하면 여기에 모여요.</p>');}
