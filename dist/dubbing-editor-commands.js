function dubDialog(e,title,inner,approve='적용',read=null){
 const dialog=document.createElement('dialog');
 dialog.className='dub-edit-dialog';dialog.innerHTML=`<form method="dialog"><h2>${esc(title)}</h2><div class="dub-dialog-body">${inner}</div><footer><button class="small-button" value="cancel">취소</button><button class="primary-button" value="ok">${esc(approve)}</button></footer></form>`;
 e.element.append(dialog);
 return new Promise(resolve=>{
  dialog.addEventListener('close',()=>{const val=dialog.returnValue==='ok'?(read?read(dialog):true):null;dialog.remove();resolve(val);},{once:true});
  dialog.addEventListener('click',ev=>{if(ev.target===dialog)dialog.close('cancel');});dialog.showModal();
 });
}
async function dubApplyEdit(e,action,id){
 const s=e.script,target=s.lines.find(l=>l.id===id),sc=s.scenes.find(x=>x.id===(target?.sceneId||id));
 const lines=action==='ai-line'?[target]:s.lines.filter(l=>l.sceneId===id);
 if(!lines.length||lines.some(l=>!l.text.trim()))throw Error('수정할 대사를 먼저 입력해주세요.');
 if(!e.config.aiAvailable)throw Error('AI 대본 연동을 사용할 수 없어요.');
 const modes=action==='ai-line'?[['natural','자연스럽게'],['shorter','짧게'],['longer','길게'],['emotion','감정 강화']]:[['scene','선택 장면 수정'],['flow','대화 흐름 개선']];
 const mode=await dubDialog(e,'AI 수정',`<label>수정 방법<select>${dubChoices(modes,modes[0][0])}</select></label><p>기존 AI 대본 작성 횟수 1회를 사용해요. 변경안을 확인한 후 적용할 수 있어요.</p>`,'변경안 만들기',d=>d.querySelector('select').value);
 if(!mode)return;
 const edit={mode,scene:sc.title,description:sc.description,lines:lines.map(l=>({id:l.id,speaker:s.roles.find(r=>r.id===l.roleId)?.name||'',text:l.text}))};
 const pending={requestId:crypto.randomUUID(),options:structuredClone(e.options),edit};
 e.pendingEdit=pending;dubQueueSave(e);dubWriteLocal(e);
 await dubRecoverEdit(e,true);
}
async function dubRecoverEdit(e,submit=false){
 if(e.aiBusy||!e.pendingEdit)return;
 e.aiBusy=true;const pending=e.pendingEdit;
 const status=m=>{if(e.element.isConnected)dubbingMessage(e.element,m);};
 try{
  status('AI 변경안을 만들고 있어요…');
  let result;
  if(submit)result=await api('/api/dubbing/generations','POST',pending);
  else try{result=await api('/api/dubbing/generations/'+pending.requestId);}catch(err){if(err.status!==404)throw err;result=await api('/api/dubbing/generations','POST',pending);}
  result=await dubbingWaitForGeneration(result,e.element);
  if(dubbingEditor!==e)return;
  if(result.state==='running'){status('AI가 작성 중이에요. 동기화를 눌러 결과를 확인하세요.');return;}
  if(result.state!=='ready'||!Array.isArray(result.suggestions)){e.pendingEdit=null;dubQueueSave(e);throw Error(result.message||'변경안을 불러오지 못했어요.');}
  const before=pending.edit.lines,after=result.suggestions;
  if(after.length!==before.length||after.some((v,i)=>v.id!==before[i].id))throw Error('AI 대사 번호가 달라 변경안을 적용할 수 없어요.');
  const current=()=>before.every(l=>e.script.lines.find(v=>v.id===l.id)?.text===l.text);
  if(!current()){e.pendingEdit=null;dubQueueSave(e);throw Error('작성 중에 원문이 달라졌어요. 현재 대사로 다시 요청해주세요.');}
  const body=before.map((l,i)=>`<section><b>${esc(l.speaker)}</b><p>원문 · ${esc(l.text)}</p><p>제안 · ${esc(after[i].text)}</p></section>`).join('');
  const apply=await dubDialog(e,'AI 변경안 비교',body);e.pendingEdit=null;
  if(apply&&current()){e.undo=structuredClone(e.script);after.forEach(v=>{e.script.lines.find(l=>l.id===v.id).text=v.text;});dubRender(e);}
  dubQueueSave(e);status(apply?'변경안을 적용했어요.':'기존 대사를 유지했어요.');
 }finally{e.aiBusy=false;}
}
async function dubEditorAction(e,action,key){
 const s=e.script,D=AifectDubbing;
 const line=s.lines.find(l=>l.id===key);
 let scene=s.scenes.find(sc=>sc.id===(line?.sceneId||key||e.position?.scene))||s.scenes[0];
 const members=s.lines.filter(l=>l.sceneId===scene.id);
 const remove=async label=>await dubDialog(e,label+' 삭제',`<p>${esc(label)}을 삭제할까요? 실행 취소로 되돌릴 수 있어요.</p>`,'삭제');
 if(action==='goto'){e.folded.delete(key);const el=e.element.querySelector('[data-scene-card="'+CSS.escape(key)+'"]');el.open=true;el.scrollIntoView({block:'start'});e.position={scene:key};dubWriteLocal(e);return;}
 if(action==='info'){e.info=!e.info;dubRender(e);if(e.info)e.element.querySelector('.dub-info').scrollIntoView({block:'nearest'});return;}
 if(action==='retry'){await dubSyncDraft(e);await dubRecoverEdit(e);return;}
 if(action==='ai-line'||action==='ai-scene'){await dubApplyEdit(e,action,key);return;}
 if(action==='save'){await dubCommit(e);return;}
 if(action==='fork'){
  const old=e.id;e.id=crypto.randomUUID();e.project=null;e.projectRevision=null;e.etag=null;e.conflict=false;e.draftId=e.id;dubQueueSave(e);const written=dubWriteLocal(e);
  const prev=dubReadLocal(old);if(written&&prev?.unsynced)localStorage.removeItem(dubDraftKey(old));dubRender(e);return;
 }
 if(action==='remote'){
  if(!await dubDialog(e,'서버 버전 열기','현재 기기 작성본을 먼저 사본으로 보관한 후 서버 버전을 엽니다.','열기'))return;
  const remote=await api('/api/dubbing/editor-drafts/'+e.id,'GET',undefined,{fresh:true});
  const copy={...dubDraftSnapshot(e),id:crypto.randomUUID(),projectRevision:null};localStorage.setItem(dubDraftKey(copy.id),JSON.stringify({draft:copy,etag:null,unsynced:true}));
  localStorage.removeItem(dubDraftKey(e.id));dubMount({...e,...remote.draft,etag:remote.etag,conflict:false,unsynced:false,dirty:false});return;
 }
 if(action==='undo'){if(e.undo){e.script=e.undo;e.undo=null;e.options.roleCount=e.script.roles.length;dubQueueSave(e);dubRender(e);}return;}
 const undo=structuredClone(s);let focus=null;
 if(action==='scene-add'||action==='scene-copy'){
  if(s.scenes.length>=12)throw Error('장면은 최대 12개예요.');
  const id=action==='scene-copy'?D.duplicateEditorScene(s,scene.id):crypto.randomUUID();
  if(action==='scene-add')s.scenes.push({id,title:'새 장면',description:''});e.position={scene:id};focus={kind:'scene',key:id,field:'title'};
 }else if(action==='scene-delete'){
  if(s.scenes.length===1)throw Error('장면이 하나 이상 필요해요.');
  if(!await remove(scene.title||'장면'))return;
  const lost=new Set(members.map(l=>l.id));s.scenes=s.scenes.filter(sc=>sc!==scene);s.lines=s.lines.filter(l=>l.sceneId!==scene.id);s.soundCues=s.soundCues.filter(c=>c.sceneId!==scene.id);
  for(const cue of s.soundCues)if(lost.has(cue.endLineId))delete cue.endLineId;
  e.position={scene:s.scenes[0].id};
 }else if(action==='scene-up'||action==='scene-down'){
  const i=s.scenes.indexOf(scene),j=i+(action==='scene-up'?-1:1);if(!s.scenes[j])return;
  [s.scenes[i],s.scenes[j]]=[s.scenes[j],scene];
 }else if(action==='line-add'||action==='line-copy'){
  if(s.lines.length>=120)throw Error('대사는 최대 120개예요.');
  const anchor=line||members.find(l=>l.id===e.position?.line)||members.at(-1);
  const role=anchor?.roleId||s.roles[0].id;
  const next=action==='line-copy'?{...line,id:crypto.randomUUID()}:D.editorLine(scene.id,role);
  const index=anchor?s.lines.indexOf(anchor)+1:s.lines.length;s.lines.splice(index,0,next);
  for(const cue of s.soundCues)if(cue.sceneId===scene.id&&!cue.lineId)cue.lineId=next.id;
  e.position={scene:scene.id,line:next.id};focus={kind:'line',key:next.id,field:'text'};
 }else if(action==='line-up'||action==='line-down'){
  const i=s.lines.indexOf(line),j=i+(action==='line-up'?-1:1);if(s.lines[j]?.sceneId!==scene.id)return;
  [s.lines[i],s.lines[j]]=[s.lines[j],line];
 }else if(action==='line-delete'){
  if(!await remove('대사'))return;
  const next=members[members.indexOf(line)+1]||members[members.indexOf(line)-1];
  s.lines=s.lines.filter(l=>l!==line);for(const c of s.soundCues){if(c.lineId===key)c.lineId=next?.id||'';if(c.endLineId===key)delete c.endLineId;}
 }else if(action==='sfx-add'||action==='bgm-add'){
  const music=action==='bgm-add';if(s.soundCues.length>=24||(music&&s.soundCues.filter(c=>c.kind==='bgm').length>=3))throw Error('음향은 총 24개, BGM은 최대 3개예요.');
  const anchor=members.find(l=>l.id===e.position?.line)||members.at(-1);const cue=D.editorCue(scene.id,anchor?.id||'',music?'bgm':'sfx');s.soundCues.push(cue);
  focus={kind:'cue',key:cue.id,field:'prompt'};
 }else if(action==='cue-delete'){if(!await remove('음향'))return;s.soundCues=s.soundCues.filter(c=>c.id!==key);}
 else if(action==='role-add'){if(s.roles.length>=6)throw Error('배역은 최대 6명이에요.');s.roles.push({id:crypto.randomUUID(),name:'배역 '+(s.roles.length+1),gender:'unspecified',personality:''});e.options.roleCount=s.roles.length;}
 else if(action==='role-delete'){if(s.roles.length<=1||s.lines.some(l=>l.roleId===key))throw Error('이 배역의 대사를 다른 화자로 옮겨주세요.');if(!await remove('배역'))return;s.roles=s.roles.filter(r=>r.id!==key);e.options.roleCount=s.roles.length;}
 else return;
 D.orderEditorLines(s);
 for(const c of s.soundCues){if(c.anchor==='scene')c.lineId=s.lines.find(l=>l.sceneId===c.sceneId)?.id||'';}
 const index=new Map(s.lines.map((l,i)=>[l.id,i]));
 if(s.soundCues.some(c=>c.endLineId&&index.get(c.endLineId)<index.get(c.lineId))){e.script=undo;throw Error('BGM 종료 대사가 시작보다 앞서요. 음향 위치를 먼저 옮겨주세요.');}
 e.undo=undo;e.folded.delete(e.position?.scene||scene.id);
 dubQueueSave(e);dubRender(e,focus);
}
