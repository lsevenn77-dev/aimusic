const dubEmbedded=new URLSearchParams(location.search).get('scriptEditor')==='android';
if(dubEmbedded)document.documentElement.classList.add('aifect-script-embedded');
function dubViewport(){
 const e=dubbingEditor;if(!e?.element)return;
 const visual=window.visualViewport;
 const h=(visual?.height??innerHeight)+(visual?.offsetTop||0)-Math.max(0,e.element.getBoundingClientRect().top)-4;
 e.element.style.setProperty('--dub-available',Math.max(160,h)+'px');
}
window.visualViewport?.addEventListener('resize',dubViewport);window.addEventListener('resize',dubViewport);
function dubNativeBack(){
 const dialog=document.querySelector('.dub-edit-dialog[open]');if(dialog){dialog.close('cancel');return 'stay';}
 const e=dubbingEditor;if(e?.busy)return 'stay';
 if(!e)return 'exit';
 dubFlushEditor();return e.unsynced&&!dubWriteLocal(e)?'confirm':'exit';
}
function dubNativeReady(account,migration,raw){
 if(!dubEmbedded||!raw)return;
 let attempts=0;
 async function recover(){
  if(typeof me==='undefined'||!me){if(++attempts<50)setTimeout(recover,160);return;}
  if(me.id!==account)return;
  const done=dubDraftKey('legacy-'+migration);
  if(localStorage.getItem(done))return;
  try{
   const legacy=JSON.parse(raw),options=legacy.options||dubDefaultOptions(),manual=legacy.manualText||'';
   if(legacy.generationId&&legacy.generation?.state==='running')dubbingRememberPending({requestId:legacy.generationId,options});
   if(!legacy.script&&!manual&&!legacy.manualTitle)return;
   const parsed=manual?AifectDubbing.parseDubbingPaste(manual,options.genres):null;
   const script=legacy.script||parsed?.script||AifectDubbing.emptyDubbingScript(options);
   if(!script.title)script.title=legacy.manualTitle||'';
   const draft={id:migration,script,sourceText:manual,notes:parsed?.notes||[],options:{...options,roleCount:script.roles.length},generationId:legacy.generation?.state==='ready'?legacy.generationId:null,updated:new Date().toISOString(),projectRevision:null};
   localStorage.setItem(dubDraftKey(migration),JSON.stringify({draft,etag:null,unsynced:true}));
   localStorage.setItem(done,'1');
   const rec=document.querySelector('[data-editor-recents]');if(rec){rec.hidden=false;rec.querySelector('div').insertAdjacentHTML('afterbegin',dubButton('resume',esc(script.title||'이 기기의 기존 작성본'),migration));}
  }catch{/* The original SharedPreferences draft remains available for another attempt. */}
 }
 void recover();
}

