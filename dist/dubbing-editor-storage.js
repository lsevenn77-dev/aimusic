const dubDraftKey=(id)=>'aifect-script-editor-v1:'+me.id+':'+id;
function dubReadLocal(id){try{return JSON.parse(localStorage.getItem(dubDraftKey(id)));}catch{return null;}}
async function dubDraftList(){
 const drafts=new Map(),prefix=dubDraftKey('');
 let offline=false;
 try{
  let cursor=null;
  do{
   const page=await api('/api/dubbing/editor-drafts'+(cursor?'?cursor='+encodeURIComponent(cursor):''),'GET',undefined,{fresh:true});
   for(const x of page.items)drafts.set(x.id,x);
   cursor=page.cursor;
  }while(cursor);
 }catch{offline=true;}
 try{for(const key of Object.keys(localStorage).filter(k=>k.startsWith(prefix))){
  const row=JSON.parse(localStorage.getItem(key));if(row?.draft&&!row.closed&&(row.unsynced||!drafts.has(row.draft.id)))drafts.set(row.draft.id,{id:row.draft.id,title:row.draft.script.title,updated:row.draft.updated});
 }}catch{}
 return {offline,items:[...drafts.values()].sort((a,b)=>new Date(b.updated)-new Date(a.updated))};
}
async function dubOpenDraft(id){
 const local=dubReadLocal(id);
 try{
  const remote=await api('/api/dubbing/editor-drafts/'+id,'GET',undefined,{fresh:true});
  if(local?.unsynced)return {...local,conflict:local.etag!==remote.etag,remote};
  if(local?.draft?.position&&local.etag===remote.etag)remote.draft.position=local.draft.position;
  return remote;
 }catch(error){
  if(local?.draft&&!local.closed)return {...local,conflict:error.status===404&&!!local.etag};
  throw error;
 }
}
function dubDraftSnapshot(e){
 const {id,script,options,generationId,sourceText,notes,position,pendingEdit,projectRevision}=e;
 return {id,script,options,generationId,sourceText,notes,position,pendingEdit,projectRevision:projectRevision??e.project?.revision??null,updated:new Date().toISOString()};
}
function dubDraftStatus(e,message){
 const badge=e.element?.querySelector('[data-editor-status]');if(badge)badge.textContent=message;
}
function dubWriteLocal(e){
 if(e.finished||!me||e.account!==me.id)return false;
 try{localStorage.setItem(dubDraftKey(e.id),JSON.stringify({etag:e.etag??null,draft:dubDraftSnapshot(e),unsynced:e.unsynced}));return true;}
 catch{dubDraftStatus(e,'기기 저장 공간을 확인해 주세요.');return false;}
}
function dubQueueSave(e){
 if(e.finished)return;
 e.change=(e.change||0)+1;e.unsynced=true;e.dirty=true;
 // Copy the full script only after an idle interval; lifecycle events flush immediately.
 clearTimeout(e.localTimer);e.localTimer=setTimeout(()=>dubWriteLocal(e),200);
 clearTimeout(e.timer);e.timer=setTimeout(()=>{void dubSyncDraft(e);},900);
 dubDraftStatus(e,'편집 중');
}
async function dubSyncDraft(e){
 if(e.saving)return e.saving;
 if(e.finished||!e.unsynced||e.conflict||e.account!==me?.id)return;
 clearTimeout(e.localTimer);dubWriteLocal(e);
 e.saving=(async()=>{
  const serial=e.change;
  dubDraftStatus(e,'자동 저장 중…');
  try{
   const row=await api('/api/dubbing/editor-drafts/'+e.id,'PUT',{draft:dubDraftSnapshot(e),etag:e.etag??null});
   e.etag=row.etag;
   if(serial===e.change){e.unsynced=false;e.dirty=false;}
   dubWriteLocal(e);dubDraftStatus(e,e.unsynced?'편집 중':'자동 저장됨 · 비공개');
  }catch(err){
   if(err.status===409){e.conflict=true;dubDraftStatus(e,'다른 기기에서 변경됨 · 내 작성본 보존');e.element?.querySelector('[data-editor-conflict]')?.removeAttribute('hidden');}
   else dubDraftStatus(e,dubWriteLocal(e)?'기기에 저장됨 · 동기화 재시도':'자동 저장 실패 · 재시도');
  }finally{e.saving=null;}
  if(!e.finished&&serial!==e.change&&!e.conflict&&e.account===me?.id)await dubSyncDraft(e);
 })();
 return e.saving;
}
function dubFlushEditor(){
 const e=dubbingEditor;if(!e?.element||e.finished)return;
 clearTimeout(e.localTimer);
 if(e.unsynced||e.position) dubWriteLocal(e);
 if(e.unsynced)void dubSyncDraft(e);
}
window.addEventListener('pagehide',dubFlushEditor);
document.addEventListener('visibilitychange',()=>{if(document.hidden)dubFlushEditor();});
window.addEventListener('online',dubFlushEditor);

