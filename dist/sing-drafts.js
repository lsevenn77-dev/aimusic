// Device-local dry audio is scoped to the signed-in account and song. No microphone permission is used to restore it.
let draftDbPromise;
function openDraftDB(){return draftDbPromise||=new Promise((resolve,reject)=>{const r=indexedDB.open('aifect-recordings',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{draftDbPromise=null;reject(r.error);};});}
async function draftOp(mode,key,value){const db=await openDraftDB();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('drafts');const r=mode==='get'?store.get(key):mode==='delete'?store.delete(key):store.put(value);if(mode==='put')store.put(singDraftSummary(value));else if(mode==='delete')store.delete('index:'+key);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('임시저장이 중단됐어요.'));});}
const singDraftKey=s=>s.owner+':'+s.id+(s.mode==='duet'?':duet:'+s.part+':'+(s.parent||'first'):'');
async function saveSingDraft(s=sing){
 if(!s||!s.owner||!s.voice&&s.mode!=='duet')return;const revision=s.revision||0;
 const data={key:singDraftKey(s),owner:s.owner,id:s.id,mode:s.mode,part:s.part,parent:s.parent,title:s.data.track.title,artist:s.data.track.artist,samples:s.voice?.getChannelData(0).slice()||new Float32Array(),rate:s.voice?.sampleRate||32000,duetGuide:s.duetGuide,keySemitones:singingKey(s),mix:{...s.mix},cursor:s.cursor,description:s.description||'',updated:Date.now()};
 s.draftWrite=(s.draftWrite||Promise.resolve()).catch(()=>{}).then(()=>draftOp('put',data.key,data));await s.draftWrite;
 if((s.revision||0)===revision)s.dirty=false;
}
async function restoreSingDraft(s){
 try{const d=await draftOp('get',singDraftKey(s));if(sing!==s||!d||d.owner!==s.owner||!(d.samples instanceof Float32Array)||d.samples.length>600*d.rate )return;
  const ctx=s.ctx||(s.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:K().MIX_RATE}));if(d.samples.length){s.voice=ctx.createBuffer(1,d.samples.length,d.rate);s.voice.copyToChannel(d.samples,0);}if(!s.parent&&d.duetGuide)s.duetGuide=d.duetGuide;s.mix={...s.mix,...K().restoreVocalMix(d.mix)};s.keySemitones=s.parent?0:singingKey({keySemitones:d.keySemitones});s.cursor=s.voice?Math.min(d.cursor||0,s.voice.duration):0;s.description=d.description||'';s.state=s.voice?'review':'idle';renderSingPanel();renderDuetGuide();drawLyrics(s.cursor);setSingStatus('이 기기에 임시저장한 녹음과 효과를 복원했어요.');
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
function karaokeDraftsHTML(drafts){return heading('초안','완성 전의 목소리도, 소중하게 모아두세요.')+`<section class="draft-workspace"><header class="draft-toolbar"><div><span class="eyebrow">MY RECORDINGS</span><h2>저장한 녹음 <em>${drafts.length}</em></h2></div><div class="inline-actions"><a class="small-button" href="#karaoke">${icon('mic')} 새로 부르기</a><button class="small-button danger-button" data-delete-all-drafts ${drafts.length?'':'disabled'}>${icon('trash')} 전체 삭제</button></div></header><div class="draft-local-note">${icon('info')}<p>이 계정으로 현재 기기·브라우저에 저장한 녹음이에요. 다른 기기에는 표시되지 않아요.<br>공개한 커버곡은 초안을 삭제해도 유지돼요.</p></div>`+(drafts.length?'<div class="recording-drafts">'+drafts.map(d=>{const query=d.parent?'duet='+encodeURIComponent(d.parent):'mode='+d.mode+'&part='+encodeURIComponent(d.part);return `<article class="recording-draft" data-draft-key="${esc(d.draftKey)}"><span class="draft-mic">${icon('mic')}</span><div class="draft-info"><span class="draft-kind">${d.mode==='duet'?'DUET':'SOLO'} · ${time(d.duration)}</span><h3>${esc(d.title||'임시 저장한 녹음')}</h3><small>${esc(d.artist||'나의 목소리')} · ${esc(new Date(d.updated).toLocaleDateString('ko-KR'))} 저장</small></div><div class="draft-actions"><a class="small-button" href="#sing/${encodeURIComponent(d.id)}?${esc(query)}&draft=1">${icon('edit')} 이어 편집</a><button class="icon-button" data-delete-draft="${esc(d.draftKey)}" data-draft-title="${esc(d.title||'임시 저장한 녹음')}" aria-label="${esc(d.title||'초안')} 삭제">${icon('trash')}</button></div></article>`;}).join('')+'</div>':`<div class="draft-empty"><span class="draft-mic">${icon('mic')}</span><h3>첫 목소리를 기다리고 있어요</h3><p>녹음 후 임시 저장하면 여기에 모여요.<br>마음에 들 때까지 편집하고, 준비되면 공개하세요.</p><a class="primary-button" href="#karaoke">부를 곡 찾기 ${icon('arrow')}</a></div>`)+'</section>';}

// Delete only the confirmed snapshot of this account's drafts, never the whole store.
// Raw audio and lightweight index records are removed in the same transaction.
async function deleteLocalDrafts(keys,owner){
 if(!owner||me?.id!==owner)throw new Error('로그인한 계정을 다시 확인해주세요.');
 const selected=[...new Set(keys)].filter(key=>typeof key==='string'&&key.startsWith(owner+':'));
 if(!selected.length)return 0;
 const db=await openDraftDB();if(me?.id!==owner)throw new Error('계정이 변경되어 삭제를 취소했어요.');
 return new Promise((resolve,reject)=>{let removed=0;const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');
  for(const key of selected){const request=store.get(key);request.onsuccess=()=>{if(me?.id!==owner){tx.abort();return;}const draft=request.result;if(!draft||draft.owner!==owner)return;store.delete(key);store.delete('index:'+key);removed++;};}
  tx.oncomplete=()=>resolve(removed);tx.onerror=()=>reject(tx.error||new Error('저장 공간을 확인하고 다시 시도해주세요.'));tx.onabort=()=>reject(tx.error||new Error('삭제가 취소됐어요. 다시 확인해주세요.'));
 });
}
document.addEventListener('click',e=>{
 const one=e.target.closest('[data-delete-draft]'),all=e.target.closest('[data-delete-all-drafts]');
 if(!one&&!all||!me?.id)return;
 const owner=me.id,route=location.hash,keys=one?[one.dataset.deleteDraft]:Array.from(document.querySelectorAll('[data-draft-key]'),el=>el.dataset.draftKey);
 if(!keys.length)return;
 const title=one?'“'+one.dataset.draftTitle+'” 초안을 삭제할까요?':keys.length+'개의 초안을 모두 삭제할까요?';
 dialog(`<div class="draft-delete-dialog"><span class="draft-mic">${icon('trash')}</span><h2>${esc(title)}</h2><p>현재 계정의 이 기기 녹음만 삭제합니다.<br><strong>삭제한 초안은 복구할 수 없어요.</strong><br>이미 공개한 커버곡은 삭제하지 않아요.</p><div class="inline-actions"><button class="small-button" id="cancel-draft-delete">취소</button><button class="primary-button" id="confirm-draft-delete">${one?'초안 삭제':'전체 삭제'}</button></div><p id="draft-delete-error" class="form-error" role="alert"></p></div>`);
 $('#cancel-draft-delete').onclick=()=>$('#dialog').close();
 $('#confirm-draft-delete').onclick=async()=>{const button=$('#confirm-draft-delete');button.disabled=true;try{const count=await deleteLocalDrafts(keys,owner);$('#dialog').close();if(me?.id===owner){toast(count+'개의 초안을 삭제했어요.');if(location.hash===route)await render();}}catch(error){const note=$('#draft-delete-error');if(note)note.textContent=error.message;button.disabled=false;}};
 $('#cancel-draft-delete').focus();
});
