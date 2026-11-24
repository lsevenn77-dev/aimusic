function dubRender(e,focus=null){
 const root=e.element;
 const y=window.scrollY, panelScroll=root.querySelector(".dub-editor-layout")?.scrollTop||0;
 root.innerHTML=dubEditorHTML(e);
 dubUpdateMeter(e);
 root.querySelector(".dub-editor-layout").scrollTop=panelScroll;
 root.querySelectorAll('[data-scene-card]').forEach(el=>el.addEventListener('toggle',()=>{
  if(el.open)e.folded.delete(el.dataset.sceneCard);else e.folded.add(el.dataset.sceneCard);
 }));
 if(focus)requestAnimationFrame(()=>{const el=root.querySelector(`[data-kind="${focus.kind}"][data-key="${CSS.escape(focus.key)}"][data-field="${focus.field}"]`);el?.closest('details.dub-scene')?.setAttribute('open','');el?.focus({preventScroll:true});el?.scrollIntoView({block:'nearest'});});
 else window.scrollTo({top:y,behavior:'instant'});
}
function dubUpdateMeter(e){
 try{
  const seconds=AifectDubbing.dubbingTimeline(e.script).duration;
  e.element.querySelector('[data-editor-duration]').textContent=e.options.genres.join(' · ')+' · '+e.script.roles.length+'인극 · 예상 '+time(seconds);
 }catch{e.element.querySelector('[data-editor-duration]').textContent='음향 시작·종료 위치를 확인해 주세요.';}
}
async function dubCommit(e){
 if(e.busy||e.conflict)throw Error(e.conflict?'먼저 다른 기기와의 저장 충돌을 해결해 주세요.':'저장 중입니다.');
 const script=AifectDubbing.validateDubbingScript(e.script,e.options);
 if(script.soundCues.filter(c=>c.kind==='bgm').length>Math.max(3,e.project?.script?.soundCues?.filter(c=>c.kind==='bgm').length||0))throw Error('음향 제작에 사용할 BGM을 3개 이내로 정리해 주세요.');
 e.busy=true;e.element.inert=true;
 try{
  clearTimeout(e.timer);await dubSyncDraft(e);if(e.conflict)throw Error('작성본이 다른 기기에서 변경되었습니다.');
  const existing=!!e.project||e.projectRevision!=null;
  const saved=await api('/api/dubbing/projects'+(existing?'/'+e.id:''),existing?'PUT':'POST',{id:e.id,options:e.options,script,generationId:e.generationId||null,revision:e.projectRevision??e.project?.revision});
  e.finished=true;e.dirty=false;
  if(e.etag){
   try{await api('/api/dubbing/editor-drafts/'+e.id,'PUT',{closed:true,etag:e.etag});}
   catch(err){if(err.status!==409)toast('대본은 저장되었습니다. 자동 저장본 정리는 연결 후 다시 확인해 주세요.');}
  }
  localStorage.removeItem(dubDraftKey(e.id));dubbingEditor=null;
  location.hash='dubbing/'+saved.project.id+(dubEmbedded?'?editorSaved=1':'');
 }finally{e.busy=false;e.element.inert=false;}
}
function dubMount(e){
 const parent=$('#main .dubbing-page');if(!parent)return;
 parent.onclick=null;parent.innerHTML='<section class="dub-editor"></section>';
 e.element=parent.firstElementChild;e.folded=new Set(e.position?.folded??e.script.scenes.slice(1).map(sc=>sc.id));e.account=me.id;e.etag??=null;
 dubbingEditor=e;dubRender(e);if(e.dirty||e.unsynced) dubQueueSave(e);
 if(e.conflict){dubDraftStatus(e,'다른 기기의 변경사항을 확인해 주세요.');}
 e.element.onclick=async ev=>{
  const b=ev.target.closest('[data-edit-action]');if(!b||e.busy)return;
  try{await dubEditorAction(e,b.dataset.editAction,b.dataset.key);}catch(err){if(e.element.isConnected)dubbingMessage(e.element,err.message);}
 };
 e.element.onfocusin=ev=>{
  const el=ev.target,sc=el.closest('[data-scene-card]');if(!sc)return;
  const line=el.closest('[data-line-card]');e.position={...e.position,scene:sc.dataset.sceneCard,line:line?.dataset.lineCard,field:el.dataset.field,key:el.dataset.key,folded:[...e.folded]};
  if(window.matchMedia('(max-width:760px)').matches&&el.matches('input,textarea'))requestAnimationFrame(()=>el.scrollIntoView({block:'nearest'}));
 };
 e.element.onkeydown=ev=>{
  if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='s'){ev.preventDefault();void dubSyncDraft(e);}
  if((ev.ctrlKey||ev.metaKey)&&ev.key==='Enter'){ev.preventDefault();void dubEditorAction(e,'line-add','').catch(err=>dubbingMessage(e.element,err.message));}
 };
 e.element.oninput=ev=>{
  const el=ev.target;if(!el.matches('[data-field],[data-genre]'))return;
  if(el.dataset.genre){
   const genres=[...e.element.querySelectorAll('[data-genre]:checked')].map(x=>x.dataset.genre);if(genres.length<1||genres.length>2){el.checked=!el.checked;dubbingMessage(e.element,'장르는 1~2개를 선택해 주세요.');return;}e.options.genres=genres;e.script.genres=[...genres];
  }else{
   const {kind,key,field}=el.dataset,collections={line:'lines',scene:'scenes',role:'roles',cue:'soundCues'};
   const obj=kind==='script'?e.script:kind==='options'?e.options:e.script[collections[kind]]?.find(x=>x.id===key);
   if(!obj)return;
   if(field==='endLineId'&&!el.value)delete obj.endLineId;
   else obj[field]=['minutes','durationSeconds','gapSeconds','offsetSeconds','volume'].includes(field)?Number(el.value):el.value;
   if(kind==='cue'&&field==='durationSeconds')obj.generationSeconds=Math.max(obj.kind==='bgm'?10:1,Math.ceil(obj.durationSeconds));
   if(kind==='role'&&field==='name')for(const opt of e.element.querySelectorAll('select[data-field="roleId"] option')){if(opt.value===key)opt.textContent=el.value;}
   if(kind==='scene'&&field==='title'){
    e.element.querySelector('[data-scene-title="'+CSS.escape(key)+'"]').textContent=el.value;
    const i=e.script.scenes.indexOf(obj);e.element.querySelector('[data-edit-action="goto"][data-key="'+CSS.escape(key)+'"]').textContent=String(i+1).padStart(2,'0')+' '+el.value;
   }
   if(kind==='cue'&&['lineId','anchor','endLineId'].includes(field)){
    if(field==='anchor'&&obj.anchor==='scene')obj.lineId=e.script.lines.find(l=>l.sceneId===obj.sceneId)?.id||'';
    dubRender(e);
   }
   if(kind==='line'&&['gapSeconds','durationSeconds'].includes(field)){
    const members=e.script.lines.filter(l=>l.sceneId===obj.sceneId);const total=members.reduce((n,l)=>n+(+l.durationSeconds||0)+(+l.gapSeconds||0),0);
    e.element.querySelector('[data-scene-time="'+CSS.escape(obj.sceneId)+'"]').textContent=members.length+'대사 · '+time(total);
   }
  }
  dubQueueSave(e);dubUpdateMeter(e);
 };
 requestAnimationFrame(()=>{
  dubViewport();
  const panel=e.element.querySelector('.dub-editor-layout');
  if(e.position?.scroll!=null)panel.scrollTop=e.position.scroll;
  else if(e.position?.scene)e.element.querySelector('[data-scene-card="'+CSS.escape(e.position.scene)+'"]')?.scrollIntoView({block:'start'});
 });
 e.element.addEventListener('scroll',ev=>{if(ev.target.matches?.('.dub-editor-layout'))e.position={...e.position,scroll:ev.target.scrollTop,folded:[...e.folded]};},true);
 if(e.pendingEdit)void dubRecoverEdit(e).catch(err=>dubbingMessage(e.element,err.message));
}
async function dubbingMountEditor(e){
 // Explicitly entering a saved private project restores a compatible autosave, preserving stale edits as a separate choice.
 if(e.project){
  try{const row=await dubOpenDraft(e.id);if(row.draft){
    const stale=row.draft.projectRevision!==e.project.revision;
    if(!stale||confirm('기존 작성본과 서버 대본의 버전이 다릅니다. 작성본을 사본으로 열까요?')){
     if(stale){dubMount({...e,...row.draft,project:null,projectRevision:null,etag:null,id:crypto.randomUUID(),dirty:true});return;}
     dubMount({...e,...row.draft,etag:row.etag,conflict:!!row.conflict,unsynced:row.unsynced});return;
    }
    e.etag=row.etag;
   }}catch{}
 }
 if(!e.route||location.hash.slice(1)===e.route)dubMount(e);
}
function dubStartHTML(){
 return `<section class="dub-start dubbing-panel"><h1>새 대본 작성</h1><div class="dub-start-modes">
 ${dubButton('ai','AI 대본 작성')}${dubButton('manual','직접 대본 작성')}${dubButton('paste','기존 대본 붙여넣기')}</div><section data-editor-recents hidden><h2>작성 중인 대본</h2><div></div></section><p class="dubbing-feedback" role="status"></p></section>`;
}
function dubDefaultOptions(genre=''){return AifectDubbing.dubbingOptions({genres:[AifectDubbing.DUBBING_GENRES.includes(genre)?genre:'일상'],roleCount:2,minutes:3,mood:'랜덤',ending:'랜덤',idea:''});}
async function dubStart(view,root,initial=''){
 const options=dubDefaultOptions(new URLSearchParams(view.route.split('?')[1]).get('genre'));
 const make=()=>({id:crypto.randomUUID(),options:structuredClone(options),config:view.config,route:view.route,script:AifectDubbing.emptyDubbingScript(options),dirty:true});
 async function open(action,key){
  if(action==='ai'){location.hash='dubbing/new?mode=ai';return;}
  if(action==='resume'){const row=await dubOpenDraft(key);const d=row.draft;let project=null;if(d.projectRevision!=null){project=(await api('/api/dubbing/projects/'+d.id)).project;}
   const fork=project&&(!project.canEdit||project.revision!==d.projectRevision);
   if(fork&&!confirm('서버 대본이 변경되었습니다. 보존한 작성본을 사본으로 열까요?'))return;
   dubMount({...d,project:fork?null:project,config:view.config,route:view.route,etag:fork?null:row.etag,id:fork?crypto.randomUUID():d.id,projectRevision:fork?null:d.projectRevision,conflict:!fork&&row.conflict,unsynced:!!(fork||row.unsynced)});return;}
  const e=make();e.element=root;
  if(action==='paste'){
   let raw='';
   try{raw=sessionStorage.getItem(dubDraftKey('paste'))||'';}catch{}
   const paste=dubDialog(e,'기존 대본 붙여넣기',`<label>원문<textarea rows="12" data-raw>${esc(raw)}</textarea></label>`,'분석 미리보기',d=>d.querySelector('textarea').value);
   const field=root.querySelector('[data-raw]');field.oninput=()=>{try{sessionStorage.setItem(dubDraftKey('paste'),field.value);}catch{}};
   raw=await paste;if(!raw)return;
   const parsed=AifectDubbing.parseDubbingPaste(raw,options.genres),s=parsed.script;
   const preview=s.scenes.map(sc=>`<section><b>${esc(sc.title)}</b><p>${esc(sc.description)}</p>${s.lines.filter(l=>l.sceneId===sc.id).map(l=>`<p>${esc(s.roles.find(r=>r.id===l.roleId).name)} · ${esc(l.text)}</p>`).join('')}${s.soundCues.filter(c=>c.sceneId===sc.id).map(c=>`<p>${c.kind==='bgm'?'BGM':'효과음'} · ${esc(c.prompt)}</p>`).join('')}</section>`).join('');
   const warnings=parsed.notes.map(x=>`<p>${x.row}행 · ${esc(x.text)}</p>`).join('');
   if(!await dubDialog(e,'분석 미리보기',preview+(warnings?'<h3>장면 설명에 보존한 미분류 원문</h3>'+warnings:'')+'<details><summary>전체 원문 보기</summary><pre>'+esc(raw)+'</pre></details>','편집기에 반영'))return;
   e.script=s;e.sourceText=raw;e.notes=parsed.notes;e.options.roleCount=s.roles.length;
  }
  dubMount(e);
 }
 root.onclick=ev=>{const b=ev.target.closest('[data-edit-action]');if(b)void open(b.dataset.editAction,b.dataset.key).catch(err=>dubbingMessage(root,err.message));};
 if(initial==='manual'||initial==='paste'){await open(initial);return;}
 const list=await dubDraftList();if(!root.isConnected)return;
 const recent=root.querySelector('[data-editor-recents]');if(!recent)return;
 if(list.items.length){recent.hidden=false;recent.querySelector('div').innerHTML=list.items.map(v=>dubButton('resume',esc(v.title||'제목 없는 대본'),v.id)).join('');}
 if(list.offline)dubbingMessage(root,'현재 기기에 남은 작성본을 표시합니다.');
}

