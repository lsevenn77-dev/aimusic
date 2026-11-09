// Device-local dry audio is scoped to the signed-in account and song. No microphone permission is used to restore it.
let draftDbPromise;
function openDraftDB(){return draftDbPromise||=new Promise((resolve,reject)=>{const r=indexedDB.open('aifect-recordings',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{draftDbPromise=null;reject(r.error);};});}
async function draftOp(mode,key,value){const db=await openDraftDB();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('drafts');const r=mode==='get'?store.get(key):mode==='delete'?store.delete(key):store.put(value);if(mode==='put')store.put(singDraftSummary(value));else if(mode==='delete')store.delete('index:'+key);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('임시저장이 중단됐어요.'));});}
const singDraftKey=s=>s.owner+':'+s.id+(s.mode==='duet'?':duet:'+s.part+':'+(s.parent||'first'):'');
function paintDraftStatus(s){if(s!==sing)return;const text=s.draftError?'저장 실패 · 다시 저장해주세요':s.draftWrite?'저장 중…':s.dirty?'저장되지 않은 변경사항':s.savedAt?'초안 저장됨 '+new Date(s.savedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false}):'';document.querySelectorAll('[data-save-status]').forEach(el=>{if(el.textContent!==text)el.textContent=text;});}
async function saveSingDraft(s=sing){
 if(!s?.owner||!s.voice?.length||singExitKind(s)!=='edit'||s.state==='stopping'||s.state==='exporting')throw new Error('녹음을 완료한 뒤 초안을 저장해주세요.');
 const revision=s.revision||0;
 if(s.draftWrite&&s.writeRevision===revision)return s.draftWrite;
 const data={key:singDraftKey(s),owner:s.owner,id:s.id,mode:s.mode,part:s.part,parent:s.parent,title:s.data.track.title,artist:s.data.track.artist,samples:s.voice?.getChannelData(0).slice()||new Float32Array(),beforePunch:s.beforePunch?.getChannelData(0),rate:s.voice?.sampleRate||32000,duetGuide:s.duetGuide,keySemitones:singingKey(s),keyEvents:s.keyEvents,mix:{...s.mix},editBaseline:s.editMixBaseline,cursor:s.cursor,description:s.description||'',coverFile:s.coverFile||null,publishRequest:s.publishRequest??=crypto.randomUUID(),updated:Date.now()};
 const write=(s.draftWrite||Promise.resolve()).catch(()=>{}).then(()=>draftOp('put',data.key,data));s.draftWrite=write;s.writeRevision=revision;paintDraftStatus(s);try{await write;s.savedAt=data.updated;s.draftError=false;if((s.revision||0)===revision)s.dirty=false;}catch(e){s.draftError=true;throw e;}finally{if(s.draftWrite===write)s.draftWrite=null;paintDraftStatus(s);}
}
async function restoreSingDraft(s){
 try{const d=await draftOp('get',singDraftKey(s));if(sing!==s||!d||d.owner!==s.owner||!(d.samples instanceof Float32Array)||d.samples.length>600*d.rate )return;
  const ctx=s.ctx||(s.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:K().MIX_RATE}));if(d.samples.length){s.voice=ctx.createBuffer(1,d.samples.length,d.rate);s.voice.copyToChannel(d.samples,0);if(d.beforePunch instanceof Float32Array&&d.beforePunch.length===d.samples.length){s.beforePunch=ctx.createBuffer(1,d.beforePunch.length,d.rate);s.beforePunch.copyToChannel(d.beforePunch,0);}}if(!s.parent&&d.duetGuide)s.duetGuide=d.duetGuide;s.mix={...s.mix,...K().restoreVocalMix(d.mix)};s.savedAt=d.updated;if(d.editBaseline)s.editMixBaseline={...K().defaultVocalMix(),...K().restoreVocalMix(d.editBaseline)};if(!canEditPaid())s.mix.tone=0;s.keySemitones=singingKey({keySemitones:d.keySemitones});if(Array.isArray(d.keyEvents)&&d.keyEvents.length&&d.keyEvents[0].at===0&&d.keyEvents.every((e,i)=>Number.isFinite(e.at)&&(!i||e.at>d.keyEvents[i-1].at)&&e.key===singingKey({keySemitones:e.key})))s.keyEvents=d.keyEvents;s.cursor=s.voice?Math.min(d.cursor||0,s.voice.duration):0;s.description=d.description||'';s.coverFile=d.coverFile||null;s.publishRequest=d.publishRequest||('draft:'+d.key+':'+d.updated);s.state=s.voice?'review':'idle';renderSingPanel();renderDuetGuide();drawLyrics(s.cursor);setSingStatus('이 기기에 임시저장한 녹음과 효과를 복원했어요.');
 }catch(e){if(sing===s)setSingStatus('임시저장을 읽지 못했어요. 브라우저 저장 공간을 확인해주세요.');}
 finally{if(sing===s&&s.state==='loading'){s.state=s.voice?'review':'idle';updateTransport();}}
}
async function removeSingDraft(s){await s.draftWrite?.catch(()=>{});await draftOp('delete',singDraftKey(s));}
function queueSingDraft(s){s.revision=(s.revision||0)+1;s.dirty=true;s.draftError=false;paintDraftStatus(s);}
function openSingDraftDelete(s=sing){
 const valid=()=>sing===s&&s?.owner===me?.id&&!!s?.owner&&!!s.voice&&!singLive(s)&&!singBusy(s),dlg=$('#dialog');
 if(!valid()||s.draftDeleteOpen||s.draftDeletePending||dlg.open)return;
 const trigger=document.activeElement;s.draftDeleteOpen=true;
 dialog('<div class="sing-draft-delete-dialog"><p class="popup-prompt">이 녹음과 초안을 삭제할까요?</p><p>지금 편집 중인 녹음과 이 기기에 저장한 초안이 삭제돼요. 삭제한 녹음은 복구할 수 없어요.</p><p class="field-help">이미 공개한 커버곡은 유지돼요.</p><div class="inline-actions"><button type="button" class="small-button" data-sing-draft-cancel>취소</button><button type="button" class="small-button danger-button" data-sing-draft-delete>초안 삭제</button></div><p class="form-error" role="alert" hidden></p></div>');
 dlg.classList.add('sing-draft-delete-popup');
 const content=dlg.querySelector('.sing-draft-delete-dialog'),cancel=content.querySelector('[data-sing-draft-cancel]'),confirm=content.querySelector('[data-sing-draft-delete]'),error=content.querySelector('[role="alert"]');
 let disposed=false;
 const active=()=>!disposed&&dlg.open&&dlg.querySelector('.sing-draft-delete-dialog')===content;
 const cleanup=()=>{
  if(disposed)return;disposed=true;s.draftDeleteOpen=false;
  dlg.removeEventListener('close',cleanup);dlg.removeEventListener('cancel',onCancel);dlg.removeEventListener('click',onOutside);
  if(!dlg.open||dlg.querySelector('.sing-draft-delete-dialog')===content||!dlg.querySelector('.sing-draft-delete-dialog'))dlg.classList.remove('sing-draft-delete-popup');
  if(sing===s&&!dlg.open&&trigger?.isConnected)trigger.focus();
 };
 const dismiss=()=>{if(active())dlg.close();cleanup();};
 const onCancel=event=>{event.preventDefault();dismiss();};
 const onOutside=event=>{if(event.target!==dlg||!active())return;const r=dlg.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dismiss();};
 dlg.addEventListener('close',cleanup);dlg.addEventListener('cancel',onCancel);dlg.addEventListener('click',onOutside);
 cancel.onclick=dismiss;
 confirm.onclick=async()=>{
  if(!active()||s.draftDeletePending)return;
  if(!valid()){dismiss();return;}
  const voice=s.voice;s.draftDeletePending=true;cancel.disabled=confirm.disabled=true;error.hidden=true;
  try{
   stopPreview();await removeSingDraft(s);
   if(valid()&&s.voice===voice){s.voice=null;s.beforePunch=null;s.editMixBaseline=null;s.coverFile=null;s.publishRequest=null;s.savedAt=0;s.processed=null;s.dirty=false;s.cursor=0;s.state='idle';renderSingPanel();drawLyrics(0);}
   dismiss();
  }catch{
   if(active()&&valid()){error.textContent='임시 녹음을 삭제하지 못했어요. 저장 공간을 확인하고 다시 시도해주세요.';error.hidden=false;cancel.disabled=confirm.disabled=false;confirm.focus();}
   else{dismiss();if(sing===s&&s.owner===me?.id)setSingStatus('임시 녹음을 삭제하지 못했어요. 다시 시도해주세요.');}
  }finally{s.draftDeletePending=false;}
 };
 cancel.focus();
}
document.addEventListener('click',async e=>{
 if(e.target.closest('[data-sing-draft]')&&singExitKind(sing)==='edit'&&!singBusy(sing)){const s=sing;try{await saveSingDraft(s);if(sing===s)setSingStatus('이 계정의 녹음을 현재 기기·브라우저에 초안을 저장했어요.');}catch{setSingStatus('임시저장하지 못했어요. 저장 공간을 확인해주세요.');}}
 if(e.target.closest('[data-discard-draft]'))openSingDraftDelete(sing);
});

function singDraftSummary(d){const suffix=d.key.slice((d.owner+':'+d.id).length),legacy=suffix.startsWith(':duet:')?suffix.slice(6).split(':'):null;return {key:'index:'+d.key,draftKey:d.key,owner:d.owner,id:d.id,title:d.title||'',artist:d.artist||'',mode:d.mode||(legacy?'duet':'solo'),part:d.part||legacy?.[0]||'male',parent:d.parent||(legacy?.[1]!=='first'?legacy?.[1]:'')||'',duration:(d.samples?.length||0)/Math.max(1,d.rate||32000),updated:d.updated||0};}
async function listSingDrafts(){
 if(!me?.id)return [];const owner=me.id,db=await openDraftDB(),prefix=owner+':';
 const keys=await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readonly'),keys=[],r=tx.objectStore('drafts').openKeyCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));r.onsuccess=()=>{const c=r.result;if(c){keys.push(c.key);c.continue();}};tx.oncomplete=()=>resolve(keys);tx.onerror=()=>reject(tx.error);});
 const entries=[];for(const key of keys){let meta=await draftOp('get','index:'+key);if(!meta){const d=await draftOp('get',key);if(!d||d.owner!==owner)continue;meta=singDraftSummary(d);await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(meta);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}if(meta.owner===owner&&meta.duration>0)entries.push(meta);}
 if(entries.some(d=>!d.title))try{const tracks=(await api('/api/karaoke')).tracks||[];for(const d of entries){if(!d.title){const song=tracks.find(t=>t.id===d.id);if(song){d.title=song.title;d.artist=song.artist;await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(d);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}}}}catch{}
 if(me?.id!==owner)return [];return entries.sort((a,b)=>b.updated-a.updated);
}
function karaokeDraftsHTML(drafts){return heading('초안','완성 전의 목소리도, 소중하게 모아두세요.')+`<section class="draft-workspace"><header class="draft-toolbar"><div><span class="eyebrow">MY RECORDINGS</span><h2>저장한 녹음 <em>${drafts.length}</em></h2></div><div class="inline-actions"><a class="small-button" href="#karaoke">${icon('play')} 플레이로 이동</a><button class="small-button danger-button" data-delete-all-drafts ${drafts.length?'':'disabled'}>${icon('trash')} 전체 삭제</button></div></header><div class="draft-local-note">${icon('info')}<p>이 계정으로 현재 기기·브라우저에 저장한 녹음이에요. 다른 기기에는 표시되지 않아요.<br>공개한 커버곡은 초안을 삭제해도 유지돼요.</p></div>`+(drafts.length?'<div class="recording-drafts">'+drafts.map(d=>{const query=d.parent?'duet='+encodeURIComponent(d.parent):'mode='+d.mode+'&part='+encodeURIComponent(d.part);return `<article class="recording-draft" data-draft-key="${esc(d.draftKey)}"><span class="draft-mic">${icon('mic')}</span><div class="draft-info"><span class="draft-kind">${d.mode==='duet'?'DUET':'SOLO'} · ${time(d.duration)}</span><h3>${esc(d.title||'임시 저장한 녹음')}</h3><small>${esc(d.artist||'나의 목소리')} · ${esc(new Date(d.updated).toLocaleDateString('ko-KR'))} 저장</small></div><div class="draft-actions"><a class="small-button" href="#sing/${encodeURIComponent(d.id)}?${esc(query)}&draft=1">${icon('edit')} 이어 편집</a><button class="icon-button" data-delete-draft="${esc(d.draftKey)}" data-draft-title="${esc(d.title||'임시 저장한 녹음')}" aria-label="${esc(d.title||'초안')} 삭제">${icon('trash')}</button></div></article>`;}).join('')+'</div>':`<div class="draft-empty"><span class="draft-mic">${icon('mic')}</span><h3>첫 목소리를 기다리고 있어요</h3><p>녹음 후 임시 저장하면 여기에 모여요.<br>마음에 들 때까지 편집하고, 준비되면 공개하세요.</p><a class="primary-button" href="#karaoke">부를 곡 찾기 ${icon('arrow')}</a></div>`)+'</section>';}

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
 dialog(`<div class="draft-delete-dialog"><p class="popup-prompt">${esc(title)}</p><p>현재 계정의 이 기기 녹음만 삭제합니다.<br><strong>삭제한 초안은 복구할 수 없어요.</strong><br>이미 공개한 커버곡은 삭제하지 않아요.</p><div class="inline-actions"><button class="small-button" id="cancel-draft-delete">취소</button><button class="primary-button" id="confirm-draft-delete">${one?'초안 삭제':'전체 삭제'}</button></div><p id="draft-delete-error" class="form-error" role="alert"></p></div>`);
 $('#cancel-draft-delete').onclick=()=>$('#dialog').close();
 $('#confirm-draft-delete').onclick=async()=>{const button=$('#confirm-draft-delete');button.disabled=true;try{const count=await deleteLocalDrafts(keys,owner);$('#dialog').close();if(me?.id===owner){toast(count+'개의 초안을 삭제했어요.');if(location.hash===route)await render();}}catch(error){const note=$('#draft-delete-error');if(note)note.textContent=error.message;button.disabled=false;}};
 $('#cancel-draft-delete').focus();
});
