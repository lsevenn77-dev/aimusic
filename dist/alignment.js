function cleanAutoLyricsInput(){
 const input=$('#auto-lyrics-source');if(!input)return;
 const removed=cleanLyricsTextInput(input,true);
 if(removed){const note=$('#lyrics-cleanup-note');if(note){note.hidden=false;note.textContent=`대괄호 안의 설명 ${removed}개를 자동으로 지웠습니다. [male], [female], [기타] 같은 표시도 모두 제외합니다.`;}}
}
function alignmentEditorHTML(t={},visible=false){
 const job=t.alignment,mark=t.id?'':uploadRequiredMark;
 return `<div id="auto-lyrics-editor" data-track="${t.id||''}" data-job="${esc(JSON.stringify(job||null))}" ${visible?'':'hidden'}>
  <label class="form-field upload-lyrics-language">가사 언어<select id="auto-lyrics-language" name="lyrics_language">${Object.entries(AifectAlignment.LYRIC_LANGUAGES).map(([code,name])=>`<option value="${code}" ${(job?.language||'ko')===code?'selected':''}>${name}</option>`).join('')}</select></label>
  <div class="auto-lyrics-heading"><label for="auto-lyrics-source">가사 입력${mark}</label><button type="button" class="small-button" id="auto-lyrics-pick" title="UTF-8 TXT · 최대 64KB">TXT 파일 불러오기</button></div>
  <input type="file" id="auto-lyrics-file" accept=".txt,text/plain" hidden>
  <span id="auto-lyrics-filename" class="field-help" role="status" hidden></span>
  <textarea id="auto-lyrics-source" aria-describedby="auto-lyrics-limit lyrics-cleanup-note alignment-error" name="lyrics_source" maxlength="6000" placeholder="실제 부르는 가사를 한 줄씩 입력하세요.\n반복 가사도 노래 순서대로 모두 입력하세요.">${esc(job?.source_text||'')}</textarea>
  <small id="auto-lyrics-limit" class="field-help">최대 6,000자 · 200줄 / [ ] 안의 구간 설명은 자동 제외됩니다.</small>
  <p id="lyrics-cleanup-note" class="lyrics-cleanup-note" role="status" hidden></p>
  ${t.id?'<button type="button" class="small-button" id="align-lyrics">자동 싱크 만들기</button>':'<p class="auto-lyrics-note">음원 변환 완료 후 가사 싱크가 자동 생성·적용됩니다.<br>스튜디오에서 가사를 수정할 수 있습니다.</p>'}
  <div id="alignment-status" class="alignment-status" role="status"></div><p id="alignment-error" class="form-error" role="alert"></p>
 </div>`;
}
function bindAlignmentEditor(){
 const root=$('#auto-lyrics-editor');if(!root)return;const state=lyricEditor,source=$('#auto-lyrics-source'),language=$('#auto-lyrics-language'),error=$('#alignment-error');
 let job=JSON.parse(root.dataset.job||'null');root.removeAttribute('data-job');
 const valid=()=>root.isConnected&&lyricEditor===state;
 const unchanged=()=>{try{return job?.source_text===AifectAlignment.plainLyrics(source.value)&&job.language===language.value;}catch{return false;}};
 const paint=()=>{
  if(!valid())return;const status=$('#alignment-status'),button=$('#align-lyrics');if(button){button.disabled=!!(job&&unchanged()&&['queued','processing'].includes(job.state));button.textContent=job?.state==='failed'?'가사 확인 후 다시 시도':'자동 싱크 만들기';}
  const text={queued:'음원 변환 후 자동 싱크를 시작합니다. 화면을 닫아도 계속 진행됩니다.',processing:'음원과 가사를 맞추고 있습니다. 완성되면 재생 가사에 자동으로 적용됩니다.',ready:'자동 싱크가 완성되었습니다. 미리 듣고 확인한 뒤 곡 정보를 저장해 주세요.',applied:'자동 싱크 가사가 적용되었습니다. 필요하면 미리 듣고 수정할 수 있습니다.',failed:job?.error};
  status.innerHTML=job?`<strong>${esc(text[job.state]||'')}</strong>${job.state==='ready'?`<p>${job.needs_attention?'맞추기 어려운 구간이 있습니다. ':' '}후렴과 간주 전후의 시간을 확인해 주세요.</p><button type="button" class="primary-button" id="load-aligned-lyrics" ${unchanged()?'':'disabled'}>결과 불러오기 · 미리 듣기</button>${unchanged()?'':'<p>입력한 가사가 바뀌었습니다. 새 가사로 자동 싱크를 만들어 주세요.</p>'}`:''}`:'';
  if($('#load-aligned-lyrics'))$('#load-aligned-lyrics').onclick=()=>{if(!unchanged())return;$('#lyrics-source').value=job.result_lrc;state.loadedJobId=job.id;state.dirty=true;state.build();$('#lyrics-mode').value='synced';$('#lyrics-mode').onchange();$('#lyrics-editor-error').textContent='자동 결과를 불러왔습니다. 미리 듣고 필요한 줄의 시간을 수정한 뒤, 아래 곡 정보 저장을 눌러 주세요.';};
 };
 const schedule=()=>{clearTimeout(state.alignmentTimer);if(valid()&&root.dataset.track&&['queued','processing'].includes(job?.state))state.alignmentTimer=setTimeout(poll,5000);};
 const poll=async()=>{try{const data=await api('/api/studio/tracks/'+root.dataset.track+'/lyrics/align');if(!valid())return;job=data.alignment;error.textContent='';paint();}catch{if(valid())error.textContent='진행 상태를 불러오지 못했습니다. 잠시 후 다시 확인합니다.';}finally{schedule();}};
 source.oninput=e=>{error.textContent='';source.removeAttribute('aria-invalid');if(!e.isComposing){cleanAutoLyricsInput();paint();}};language.onchange=paint;
 source.addEventListener('compositionend',()=>{if(valid()){cleanAutoLyricsInput();paint();}});
 source.addEventListener('paste',()=>setTimeout(()=>{if(valid()){cleanAutoLyricsInput();paint();}},0));
 source.addEventListener('blur',()=>{if(valid()){cleanAutoLyricsInput();paint();}});
 const importFile=$('#auto-lyrics-file'),pick=$('#auto-lyrics-pick'),filename=$('#auto-lyrics-filename');
 if(pick)pick.onclick=()=>importFile.click();
 importFile.onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
   if(file.size>65536)throw Error('TXT 파일은 64KB 이하로 선택해 주세요.');
   let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw Error('UTF-8로 저장된 TXT 파일을 선택해 주세요.');}
   const normalized=AifectAlignment.plainLyrics(text);
   if(valid()){source.value=text;cleanAutoLyricsInput();source.value=normalized;source.removeAttribute('aria-invalid');error.textContent='';if(filename){filename.textContent=file.name;filename.hidden=false;}paint();}
  }catch(err){if(valid()){error.textContent=err.message;if(filename)filename.hidden=true;}}
  finally{importFile.value='';}
 };
 if($('#align-lyrics'))$('#align-lyrics').onclick=async e=>{const button=e.currentTarget;button.disabled=true;error.textContent='';try{cleanAutoLyricsInput();const text=AifectAlignment.plainLyrics(source.value);const d=await api('/api/studio/tracks/'+root.dataset.track+'/lyrics/align','POST',{lyrics_source:text,lyrics_language:language.value});if(!valid())return;job=d.alignment;state.loadedJobId=null;paint();schedule();}catch(e){if(valid()){error.textContent=e.message;button.disabled=false;}}};
 cleanAutoLyricsInput();paint();schedule();
}
function alignmentBadge(state){const label={queued:'가사 싱크 대기',processing:'가사 싱크 작업 중',ready:'자동 가사 확인 필요',failed:'가사 싱크 재시도 필요'}[state];return label?`<small class="studio-alignment-state ${state==='ready'?'is-ready':''}">${label}</small>`:'';}
