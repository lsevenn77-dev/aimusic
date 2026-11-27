// Post-recording editor. The two steps share the same take and publication form.
const editTools=[['sync','sliders','싱크 조절'],['balance','volume','볼륨 밸런스'],['noise','mic','노이즈 제거'],['space','headphones','공간 효과'],['tone','sliders','음색 보정',true],['punch','mic','일부 구간 재녹음',true],['crop','scissors','구간 크롭',true]];
const premiumCrown='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m3 6 5 4 4-6 4 6 5-4-2 12H5Z"/></svg>';
function refreshTakeEntitlement(){
 if(typeof sing==='undefined'||!sing)return;const s=sing,paid=canEditPaid();if(s.editPaid===paid)return;s.editPaid=paid;
 if(!paid){
  s.mix.tone=0;
  if(singLive(s)&&s.run?.punchRange)void finishSinging({discardPunch:true});
  if(s.state==='playing')stopPreview();
  if(editTools.some(([id,,,premium])=>id===s.editTool&&premium)&&!singBusy(s)&&!singLive(s))renderStudioEditTool('sync');
 }
 if(s.voice)updateTransport();
}
function recordingEditorHTML(s,m){
 const duration=reviewDuration(s);
 const totalTime=time(duration);
 return `<div class="sing-review studio-post studio-editor-clean"><div class="studio-edit-main take-editor">
 <div data-edit-step="1">
 <div class="studio-wave-editor"><div class="take-wave-header"><div class="studio-time-ruler">${Array.from({length:5},(_,i)=>`<span data-wave-tick="${i}">${time(duration*i/4)}</span>`).join('')}</div><div class="take-wave-zoom"><button type="button" data-zoom-by="2" aria-label="음파 확대" title="음파 확대">+</button><button type="button" data-zoom-by=".5" aria-label="음파 축소" title="음파 축소">−</button></div></div>
 <div class="studio-wave-surface"><canvas id="take-waveform" height="140" tabindex="0" role="slider" aria-valuemin="0" aria-label="녹음 재생 위치"></canvas><i data-take-playhead aria-hidden="true"></i>${['start','end'].map((key,i)=>`<div class="take-range-handle" role="slider" tabindex="0" data-range-handle="${key}" aria-label="구간 ${i?'종료':'시작'}" hidden></div>`).join('')}</div>
 <input type="range" data-wave-pan min="0" max="${duration}" step=".01" aria-label="확대한 음파의 탐색 위치" hidden></div>
 <div class="take-transport studio-audio"><span class="take-time"><b data-review-now>${time(s.cursor)}</b> / ${totalTime}</span><div class="take-navigation"><button type="button" class="take-play" data-sing-preview aria-label="재생"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 4.5v15l13-7.5z"/></svg></button><button type="button" class="take-play" data-sing-pause aria-label="일시정지" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg></button></div><div class="take-view"><label>${icon('volume')}<input type="range" data-listen-volume aria-label="재생 볼륨" min="0" max="1" step=".01" value="${s.listenVolume??1}"></label><button type="button" data-wave-zoom aria-label="화면 넓게 보기" aria-pressed="false">${studioIcon('maximize')}</button></div></div>
 <div class="take-tool-workspace"><div class="studio-edit-tools" role="tablist" aria-label="녹음 편집 도구">${editTools.map(([id,symbol,name,premium])=>`<button type="button" role="tab" id="edit-tool-${id}" data-edit-tool="${id}" ${premium?'class="take-paid"':''} aria-selected="${id==='sync'}" aria-controls="studio-edit-detail">${studioIcon(symbol)}<strong>${name}</strong>${premium?`<span class="take-premium">${premiumCrown}프리미엄</span>`:''}</button>`).join('')}</div><section id="studio-edit-detail" class="studio-edit-detail" role="tabpanel"></section></div>
 <footer class="take-footer"><div class="take-restore"><button type="button" class="small-button" data-reset-mix>${icon('restart')} 원본 복원</button><button type="button" class="small-button" data-punch-undo ${s.punchUndo?.length?'':'hidden'}>직전 재녹음 취소</button></div><span data-save-status role="status"></span><div><button type="button" class="small-button" data-sing-draft>초안 저장</button><button type="button" class="primary-button" data-step-next>게시 설정 ${icon('arrow')}</button></div></footer></div>
 <form id="sing-upload-form" class="upload-form studio-publish-panel" data-edit-step="2" hidden><section class="studio-publication"><h2 tabindex="-1">게시 설정</h2><div class="take-mobile-publication">${coverPublicationHTML(s)}</div><div class="take-publish-grid listening-publish-fields"><div class="take-publish-fields">${coverListeningFields(s.data.duet?.partner||s.data.track,s.listeningTemplate,{duration:reviewDuration(s),playable:true})}<p data-inherited-photo-status class="field-help" hidden><span role="status"></span> <button type="button" class="text-link" data-retry-inherited-photo>다시 시도</button></p><label class="form-field">한마디 (선택)<textarea name="description" maxlength="1000" rows="2" placeholder="감상 화면에 남길 한마디를 적어 주세요."></textarea></label></div><div class="studio-rights"><h3 class="take-desktop">게시 전 동의</h3><label class="take-desktop take-all checkbox-line"><input data-consent-all type="checkbox"><span>전체 동의</span></label><label class="checkbox-line rights-check"><input name="own_voice" type="checkbox" required><span>제가 직접 부른 녹음이며 AI 음성 복제가 아닙니다.</span></label><label class="checkbox-line rights-check"${s.parent?' data-joined-consent':''}><input name="duet_consent" type="checkbox"><span>듀엣 참여 모집 시 다른 사람이 이 녹음에 이어 부르는 것에 동의합니다.</span></label><label class="checkbox-line rights-check"><input name="rights" type="checkbox" required><span>원곡자의 허용 범위 안에서 공개할 권리가 있습니다.</span></label></div></div></section>
 <details class="studio-advanced take-mobile-management"><summary>녹음 관리</summary><div class="inline-actions"><button type="button" class="small-button" data-sing-redo>다시 부르기</button><button type="button" class="small-button" data-sing-save>파일로 저장</button><button type="button" class="small-button" data-discard-draft>초안 삭제</button></div></details>
 <footer class="take-footer"><button type="button" class="small-button" data-step-back><span data-edit-step-name>음원 편집</span></button><span data-save-status role="status"></span><div><button type="button" class="small-button" data-sing-draft>초안 저장</button><button type="submit" class="primary-button">게시하기</button></div></footer><div class="upload-progress" hidden><progress max="100" value="0"></progress><p role="status"></p></div><p class="form-error" role="alert"></p></form></div></div>`;
}

async function authorizePunch(s,range){
 const url='/api/karaoke/'+encodeURIComponent(s.id)+'/rerecord';
 return api(url,range?'POST':'GET',range?{...range,duration:punchBounds(s).end,manual:true,parent:s.parent}:undefined);
}
function punchLines(s){return K().punchLyricLines(s.data.words,reviewDuration(s));}
function punchBounds(s){
 const shift=s.mix.offset/1000;
 let start=Math.max(0,-shift),end=Math.min(reviewDuration(s),s.voice.duration-shift);
 const take=s.punchCandidates?.[s.punchCandidate];
 if(s.punchPage==='result'&&take){
  start=Math.max(start,take.first/take.rate-shift);
  end=Math.min(end,(take.first+take.samples.length)/take.rate-shift);
 }
 return {start,end:Math.max(start,end)};
}
function fitTakeRange(range,bounds){
 const r=K().normalizeTakeRange((range?.start??bounds.start)-bounds.start,(range?.end??bounds.end)-bounds.start,bounds.end-bounds.start);
 return {start:r.start+bounds.start,end:r.end+bounds.start};
}
function activeTakeRange(s){
 if(s.editTool==='crop')return s.cropSelection??{start:0,end:reviewDuration(s)};
 if(s.editTool==='punch')return s.punchSelection;
 return null;
}
function editRangeFields(s){
 const r=activeTakeRange(s);
 return '<div class="take-range-fields">'+['start','end'].map((key,i)=>
  '<label>구간 '+(i?'종료':'시작')+' <input inputmode="decimal" data-take-time="'+key+'" aria-label="구간 '+(i?'종료':'시작')+' 시간(초)" value="'+(r?.[key]?.toFixed(2)??'')+'"><span>초</span></label>').join('')+
  '<output data-take-length></output><button type="button" class="small-button" data-punch-focus="start">시작점 확대</button><button type="button" class="small-button" data-punch-focus="end">종료점 확대</button></div>';
}
function setTakeRange(s,range,source='time'){
 if(singBusy(s)||singLive(s)||s.punchPreparing||s.editAction)return;
 if(s.preview)stopPreview();
 if(s.editTool==='crop'){s.cropSelection=range;s.cropNotice='';}
 else{
  s.punchSelection=range;
  if(source!=='lyric'){s.punchLineStart=null;s.punchLineEnd=null;}
  if(s.punchPage==='result')recalculatePunch(s);
 }
 paintTakeEditor(s);updateTransport();
}
function choosePunchLine(s,index){
 if(s.punchLineStart==null||s.punchLineEnd!=null){s.punchLineStart=index;s.punchLineEnd=null;}
 else s.punchLineEnd=index;
 const r=K().punchLyricRange(s.data.words,reviewDuration(s),s.punchLineStart,s.punchLineEnd??s.punchLineStart);
 s.punchDefault=fitTakeRange(r,punchBounds(s));
 setTakeRange(s,{...s.punchDefault},'lyric');
}
function openPremiumEditor(tool){
 const name=editTools.find(entry=>entry[0]===tool)[2];
 dialog('<h2>'+name+'</h2><p>프리미엄 회원이 사용할 수 있는 편집 기능입니다.</p><div class="inline-actions"><button type="button" class="small-button" data-close-dialog>닫기</button><a class="primary-button" href="#membership" data-take-membership>프리미엄 혜택 보기</a></div>');
 $('[data-take-membership]').onclick=()=>$('#dialog').close();
}
function cleanupPunch(s){
 if(!s)return;
 s.punchRequest=(s.punchRequest||0)+1;s.punchPreparing=false;s.pendingPunch=null;s.punchAuthorized=false;
 s.punchRange=null;s.punchPage=null;s.punchCandidates=[];s.punchCandidate=-1;s.punchNotice='';
}
function returnPunchLyrics(){
 const wheel=$('#sing-wheel'),progress=$('.sing-recording .sing-progress');
 if(wheel&&progress&&wheel.parentElement!==progress.parentElement){
  progress.before(wheel);
  wheel.querySelectorAll('.take-punch-done,.take-line-timing').forEach(row=>row.classList.remove('take-punch-done','take-line-timing'));
  if(sing)sing.shownLine=null;
 }
}
function renderPunchEditor(s,host){
 if(s.punchRange){
  host.innerHTML='<div class="take-punch-running"><div class="take-punch-readout"><strong data-punch-live-state>마이크 준비 중</strong><span data-punch-live-count aria-live="polite"></span><span data-punch-live-mic></span><span data-punch-live-left></span></div><div data-punch-live-lyrics></div><div class="studio-punch-actions"><button type="button" class="small-button" data-punch-stop>중단</button><button type="button" class="small-button" data-punch-cancel>취소</button></div></div>';
  host.querySelector('[data-punch-live-lyrics]').append($('#sing-wheel'));
  s.shownLine=null;
  host.querySelector('[data-punch-stop]').onclick=()=>finishSinging();
  host.querySelector('[data-punch-cancel]').onclick=()=>{
   if(singLive(s)){void finishSinging({discardPunch:true});return;}
   if(s.state!=='loading')return;
   s.punchRange=null;s.punchPage=s.punchReturn||'select';s.punchNotice='구간 녹음을 취소했습니다.';
   s.pendingMic?.getTracks().forEach(track=>track.stop());s.state='review';
   returnPunchLyrics();renderStudioEditTool('punch');updateTransport();
  };
  return;
 }
 s.punchPage??='select';
 const result=s.punchPage==='result';
 const lines=punchLines(s),bounds=punchBounds(s);
 const firstLine=lines.find(l=>l.end>bounds.start&&l.start<bounds.end);
 s.punchSelection=fitTakeRange(s.punchSelection??(firstLine||{start:bounds.start,end:Math.min(bounds.end,bounds.start+5)}),bounds);
 if(result)recalculatePunch(s);
 host.innerHTML='<div class="take-punch-settings"><h3>'+(result?'다시 부른 구간 확인':'일부 구간 재녹음')+'</h3>'+editRangeFields(s)+
 (result?'<p data-punch-applied></p>'+
  '<div class="take-candidate-list" role="group" aria-label="재녹음 후보" '+(s.punchCandidates.length>1?'':'hidden')+'>'+
  s.punchCandidates.map((take,index)=>'<button type="button" class="small-button" data-punch-candidate="'+index+'" aria-pressed="'+(index===s.punchCandidate)+'">녹음 '+take.number+'</button>').join('')+'</div>'+
  '<div class="studio-punch-actions" role="group" aria-label="기존 녹음과 새 녹음 비교"><button type="button" class="small-button" data-punch-compare="old">기존 녹음</button><button type="button" class="small-button" data-punch-compare="new">새 녹음</button></div>'+
  '<div class="studio-punch-actions"><button type="button" class="small-button" data-punch-listen="start">시작 연결부</button><button type="button" class="small-button" data-punch-listen="full">전체 구간</button><button type="button" class="small-button" data-punch-listen="end">종료 연결부</button></div>'+
  '<div class="studio-punch-actions"><button type="button" class="small-button" data-punch-again>같은 구간 다시 부르기</button><button type="button" class="small-button" data-punch-back>기존 녹음 유지</button><button type="button" class="primary-button" data-punch-use>새 녹음 적용</button></div>'
  :'<div class="studio-punch-lyrics" role="group" aria-label="다시 부를 가사">'+
   (lines.map(line=>'<button type="button" data-punch-line="'+line.index+'" aria-pressed="false" '+(line.start>=bounds.end||line.end<=bounds.start?'disabled':'')+'><time>'+line.start.toFixed(2)+'초</time><strong>'+esc(line.text)+'</strong><span aria-hidden="true">✓</span></button>').join('')||'<p class="field-help">싱크 가사가 없습니다. 음파나 시간 입력으로 구간을 지정해 주세요.</p>')+'</div>'+
   '<div class="take-capture-options"><label>준비 시간 <select data-punch-preroll>'+[3,5,8].map(n=>'<option '+((s.punchPreroll??5)===n?'selected ':'')+'value="'+n+'">'+n+'초</option>').join('')+'</select></label>'+
   '<label><input type="checkbox" data-punch-snap '+(s.punchSnap?'checked':'')+'> 가사 경계에 맞추기</label>'+
   '<label><input type="checkbox" data-punch-monitor '+(s.punchMonitor?'checked':'')+'> 이어폰 모니터링</label></div>'+
   '<p class="field-help">이어폰을 사용하고 카운트다운이 끝나면 선택 구간 앞부터 이어 불러 주세요.</p>'+
   '<div class="studio-punch-actions"><button type="button" class="small-button take-range-reset" data-punch-reset title="범위 초기화" aria-label="범위 초기화">'+icon('restart')+'</button><button type="button" class="primary-button" data-punch-start>'+icon('mic')+' 재녹음 시작</button></div>')+
   '<p class="take-edit-message" data-take-message role="status"></p></div>';
 bindEditRange(s,host);
 for(const b of host.querySelectorAll('[data-punch-line]'))b.onclick=()=>choosePunchLine(s,Number(b.dataset.punchLine));
 for(const b of host.querySelectorAll('[data-punch-candidate]'))b.onclick=()=>{
  stopPreview();s.punchCandidate=Number(b.dataset.punchCandidate);s.pendingPunch=null;
  s.punchSelection=fitTakeRange(s.punchSelection,punchBounds(s));recalculatePunch(s);paintTakeEditor(s);updateTransport();
 };
 for(const b of host.querySelectorAll('[data-punch-listen]'))b.onclick=()=>previewPunchSelection(s,b.dataset.punchListen);
 for(const b of host.querySelectorAll('[data-punch-compare]'))b.onclick=()=>{
  const playing=s.state==='playing',at=playing?s.ctx.currentTime-s.previewAt:s.cursor,until=s.previewUntil;
  s.punchCompare=b.dataset.punchCompare;paintTakeEditor(s);
  if(playing)void previewMix(at,until);
  else void previewPunchSelection(s,s.punchListenPart||'full',at);
 };
 if(result){
  host.querySelector('[data-punch-back]').onclick=()=>{
   stopPreview();cleanupPunch(s);renderStudioEditTool('punch');updateTransport();
  };
  host.querySelector('[data-punch-use]').onclick=()=>void acceptPunchResult(s);
  host.querySelector('[data-punch-again]').onclick=()=>void startSelectedPunch(s);
 }else{
  host.querySelector('[data-punch-reset]').onclick=()=>{
   const basis=s.punchDefault??firstLine??{start:bounds.start,end:Math.min(bounds.end,bounds.start+5)};
   setTakeRange(s,fitTakeRange(basis,bounds),'reset');
  };
  host.querySelector('[data-punch-start]').onclick=()=>void startSelectedPunch(s);
  host.querySelector('[data-punch-preroll]').onchange=e=>s.punchPreroll=Number(e.target.value);
  host.querySelector('[data-punch-snap]').onchange=e=>s.punchSnap=e.target.checked;
  host.querySelector('[data-punch-monitor]').onchange=e=>s.punchMonitor=e.target.checked;
 }
}
function renderCropEditor(s,host){
 const duration=reviewDuration(s);
 s.cropSelection=fitTakeRange(s.cropSelection??s.crop,{start:0,end:duration});
 host.innerHTML='<h3>구간 크롭</h3>'+editRangeFields(s)+'<p data-crop-length></p><div class="studio-punch-actions">'+
  '<button type="button" class="small-button" data-crop-reset>전체 구간</button><button type="button" class="small-button" data-crop-preview>미리 듣기</button><button type="button" class="primary-button" data-crop-apply>게시 범위 적용</button></div><p class="take-edit-message" data-take-message role="status"></p>';
 bindEditRange(s,host);
 host.querySelector('[data-crop-reset]').onclick=()=>setTakeRange(s,{start:0,end:reviewDuration(s)});
 host.querySelector('[data-crop-preview]').onclick=()=>{
  const r=s.cropSelection;void previewMix(r.start,r.end,{fade:true});
 };
 host.querySelector('[data-crop-apply]').onclick=()=>void applyTakeCrop(s);
}
function bindEditRange(s,host){
 for(const input of host.querySelectorAll('[data-take-time]')){
  input.oninput=()=>{
   const key=input.dataset.takeTime,value=input.value.trim().replace(',','.'),n=Number(value),r=activeTakeRange(s);
   const bounds=s.editTool==='punch'?punchBounds(s):{start:0,end:reviewDuration(s)};
   const lower=key==='start'?bounds.start:r.start+.1,upper=key==='end'?bounds.end:r.end-.1;
   const roundedBoundary=Math.abs(n-lower)<.005?lower:Math.abs(n-upper)<.005?upper:n;
   const invalid=!/^\d+(?:\.\d{0,2})?$/.test(value)||roundedBoundary<lower||roundedBoundary>upper;
   input.setAttribute('aria-invalid',String(invalid));
   if(!invalid)setTakeRange(s,{...r,[key]:roundedBoundary});
   paintTakeEditor(s);
  };
  input.onblur=()=>{input.removeAttribute('aria-invalid');input.value=activeTakeRange(s)[input.dataset.takeTime].toFixed(2);paintTakeEditor(s);};
  input.onkeydown=e=>{if(e.key==='Enter')input.blur();};
 }
 for(const button of host.querySelectorAll('[data-punch-focus]'))button.onclick=()=>{
  updateTakeView(s,Math.max(s.takeZoom||1,16),activeTakeRange(s)[button.dataset.punchFocus]);
 };
}
function punchPreviewVoice(s){
 if(s.editTool!=='punch'||s.punchPage!=='result'||s.punchCompare!=='new'||!s.pendingPunch?.plan)return s.voice;
 const pending=s.pendingPunch;
 if(!pending.voice){
  const voice=s.ctx.createBuffer(1,s.voice.length,s.voice.sampleRate);
  voice.copyToChannel(s.voice.getChannelData(0),0);voice.copyToChannel(pending.plan.samples,0,pending.plan.first);
  pending.voice=voice;
 }
 return pending.voice;
}
function recalculatePunch(s){
 const take=s.punchCandidates?.[s.punchCandidate];
 if(!take||!s.punchSelection)return;
 const r=s.punchSelection;
 if(s.pendingPunch?.take===take&&s.pendingPunch.source===s.voice&&s.pendingPunch.offset===s.mix.offset&&s.pendingPunch.start===r.start&&s.pendingPunch.end===r.end)return;
 const plan=K().analyzePunch(s.voice.getChannelData(0),take,r,punchLines(s),s.mix.offset/1000);
 s.pendingPunch={take,plan,source:s.voice,offset:s.mix.offset,start:r.start,end:r.end,voice:null};
}
const poorPunchJoin='연결 부분을 확인해 주세요. 앞뒤 가사까지 조금 더 넓게 다시 부르면 자연스럽게 연결될 수 있어요.';
function previewPunchSelection(s,part,at){
 const r=s.pendingPunch?.plan?.range??s.punchSelection,max=reviewDuration(s);
 const from=part==='full'?r.start:Math.max(0,r[part]-2);
 const end=part==='full'?r.end:Math.min(max,r[part]+2);
 s.punchListenPart=part;
 return previewMix(at>=from&&at<end-.01?at:from,end);
}
async function applyTakeCrop(s){
 if(s.editAction||singBusy(s)||singLive(s)||!canEditPaid())return;
 const range=s.cropSelection,duration=reviewDuration(s);
 const full=range.start===0&&Math.abs(range.end-duration)<.005;
 if(!full&&range.end-range.start<K().MIN_COVER_SECONDS-1e-7)return;
 stopPreview();s.editAction=true;s.cropNotice='';updateTransport();
 try{
  if(!full)await api('/api/karaoke/'+encodeURIComponent(s.id)+'/crop','POST',{...range,duration,parent:s.parent});
  if(sing!==s||!canEditPaid())return;
  s.crop=full?null:{...range,duration};
  s.publishRequest=null;queueSingDraft(s);s.cropNotice=full?'전체 녹음을 게시하도록 설정했습니다.':'게시 범위를 적용했습니다.';
 }catch(e){if(sing===s)s.cropNotice=e.message;}
 finally{if(sing===s){s.editAction=false;paintTakeEditor(s);updateTransport();}}
}
async function startSelectedPunch(s=sing){
 if(sing!==s||!canEditPaid()||singBusy(s)||singLive(s)||s.punchPreparing||s.startingRecording||!s.punchSelection)return;
 if(s.punchSelection.end-s.punchSelection.start<.1-1e-7)return;
 const request=s.punchRequest=(s.punchRequest||0)+1;
 const ready=resumeSingContext(s).then(()=>null,e=>e);
 stopPreview();s.punchPreparing=true;s.punchNotice='';updateTransport();
 try{
  const {range}=await authorizePunch(s,s.punchSelection),error=await ready;if(error)throw error;
  if(sing!==s||s.punchRequest!==request||!canEditPaid())return;
  s.punchReturn=s.punchPage==='result'?'result':'select';
  s.punchSelection=range;s.punchRange=range;s.punchAuthorized=true;s.punchPage='record';
  renderStudioEditTool('punch');updateTransport();
  await startSinging();
 }catch(e){if(sing===s&&s.punchRequest===request){s.punchNotice=e.message;paintTakeEditor(s);}}
 finally{if(sing===s&&s.punchRequest===request){s.punchPreparing=false;updateTransport();}}
}
function paintPunchLive(s,run){
 const count=$('[data-punch-live-count]');if(!count)return;
 const now=s.ctx.currentTime,wait=run.recordClock-now,n=wait>0&&wait<=3?Math.ceil(wait):0;
 const state=wait>0?'준비 재생':'녹음 중';
 for(const [el,value] of [[count,n?String(n):''],[$('[data-punch-live-state]'),state],
  [$('[data-punch-live-mic]'),(run.livePeak??0)>.995?'입력 과다':(run.livePeak??0)>.001?'마이크 입력 감지':'마이크 연결됨'],
  [$('[data-punch-live-left]'),Math.max(0,Math.ceil(run.punchPlan.end+run.punchPlan.t0-Math.max(run.recordClock,now)))+'초 남음']]){
  if(el&&el.textContent!==value)el.textContent=value;
 }
 if(!run.lyricEnds){
  run.lyricEnds=[...$('#sing-wheel').querySelectorAll('[data-sing-line]')].map(row=>{
   const line=s.data.words[Number(row.dataset.singLine)];
   return {row,end:line?.e??line?.w?.at(-1)?.e};
  }).filter(line=>line.end>run.punchPlan.start&&line.end<=run.punchPlan.end).sort((a,b)=>a.end-b.end);
 }
 while(run.lyricEnds[0]?.end<=s.cursor)run.lyricEnds.shift().row.classList.add('take-punch-done');
}
function recordPunchWave(run,chunk,rate){
 const stride=Math.max(1,Math.round(rate*.02)),offset=Math.round((chunk.t-run.punchPlan.captureClock)*rate);
 const peaks=run.punchPeaks,limit=Math.min(chunk.d.length,peaks.length*stride-offset);
 for(let i=Math.max(0,-offset);i<limit;i++){
  const bin=Math.floor((offset+i)/stride);peaks[bin]=Math.max(peaks[bin],Math.abs(chunk.d[i]));
 }
 run.livePeak=chunk.peak;run.waveVersion=(run.waveVersion||0)+1;
}
function completePunch(s,run,discard){
 const take=discard?null:K().capturedPunch(run.chunks,run.punchPlan.captureClock,run.punchPlan,s.ctx.sampleRate,s.voice.sampleRate,s.mix.offset/1000);
 s.punchRange=null;s.punchAuthorized=false;s.editingRecording=false;s.state='review';s.cursor=run.punchRange.start;
 s.punchPage=s.punchReturn||'select';
 if(take){
  take.number=s.punchAttempt=(s.punchAttempt||0)+1;
  s.punchCandidates=[...(s.punchCandidates||[]),take].slice(-3);
  s.punchCandidate=s.punchCandidates.length-1;s.punchPage='result';s.punchCompare='new';s.pendingPunch=null;
  s.punchSelection=fitTakeRange(run.punchRange,punchBounds(s));
  s.punchNotice=take.clipped?'입력 레벨이 너무 높았습니다. 마이크 입력을 낮추고 다시 불러 주세요.':'';
 }else s.punchNotice=discard?'구간 녹음을 취소했습니다.':'녹음된 신호가 없거나 녹음이 중단되었습니다. 마이크 연결을 확인하고 다시 불러 주세요.';
 returnPunchLyrics();
 renderStudioEditTool(canEditPaid()?'punch':'sync');updateTransport();drawLyrics(s.cursor);
}
async function acceptPunchResult(s){
 const pending=s.pendingPunch;
 if(s.editAction||!canEditPaid()||singBusy(s)||!pending?.plan||pending.plan.warning)return;
 stopPreview();s.editAction=true;updateTransport();
 try{
  await authorizePunch(s,s.punchSelection);
  if(sing!==s||pending!==s.pendingPunch||!canEditPaid())return;
  s.punchCompare='new';
  const previous=s.voice,next=punchPreviewVoice(s),plan=pending.plan;
  s.beforePunch??=previous;
  (s.punchUndo??=[]).push({first:plan.first,samples:previous.getChannelData(0).slice(plan.first,plan.end),range:plan.range});
  s.voice=next;s.processed=null;s.cursor=plan.range.start;cleanupPunch(s);
  s.publishRequest=null;queueSingDraft(s);refreshVocalGuide(s);renderDuetGuide();renderStudioEditTool('sync');
  $('[data-punch-undo]').hidden=false;setSingStatus('다시 부른 구간을 적용했습니다.');
 }catch(e){if(sing===s)s.punchNotice=e.message;}
 finally{if(sing===s){s.editAction=false;paintTakeEditor(s);updateTransport();drawLyrics(s.cursor);}}
}
function undoPunchEdit(s){
 const previous=s.punchUndo?.pop();if(!previous)return;
 stopPreview();cleanupPunch(s);
 const next=s.ctx.createBuffer(1,s.voice.length,s.voice.sampleRate);
 next.copyToChannel(s.voice.getChannelData(0),0);next.copyToChannel(previous.samples,0,previous.first);
 s.voice=next;s.processed=null;s.cursor=previous.range.start;
 if(!s.punchUndo.length&&!s.legacyPunch)s.beforePunch=null;
 s.publishRequest=null;queueSingDraft(s);refreshVocalGuide(s);renderDuetGuide();renderStudioEditTool('sync');
 $('[data-punch-undo]').hidden=!s.punchUndo.length;updateTransport();drawLyrics(s.cursor);
}

function paintPunchCountdown(s,run){
 const header=$('.sing-punch-record-header'),countdown=$('.sing-countdown');if(!header||!countdown)return;
 const active=!!run?.punchRange;header.hidden=!active;
 if(active)header.querySelector('[data-punch-record-range]').textContent=preciseTime(run.punchRange.start)+' – '+preciseTime(run.punchRange.end);
 header.querySelector('[data-punch-cancel]').onclick=()=>finishSinging({discardPunch:true});
 const remaining=run?run.recordClock-s.ctx.currentTime:0;const n=remaining>0&&remaining<=3?Math.ceil(remaining):0;countdown.hidden=false;
 const number=countdown.querySelector('[data-punch-countdown]');
 if(number.dataset.count!==String(n)){
  number.dataset.count=String(n);number.setAttribute('aria-label',n?n+'초 뒤 녹음 시작':'녹음 대기');
  countdown.dataset.active=String(n>0);countdown.setAttribute('aria-hidden',String(n===0));
  // Reuse the three nodes so opacity can fade. The existing audio clock owns
  // all timing: 111 -> 110 -> 100 -> 000, with no extra timer or audio delay.
  number.querySelectorAll('i').forEach((dot,i)=>dot.classList.toggle('is-visible',i<n));
 }
}

function takeView(s){
 const duration=reviewDuration(s),length=duration/(s.takeZoom||1);
 const left=Math.max(0,Math.min(duration-length,(s.takeCenter??duration/2)-length/2));
 return {start:left,end:left+length,length};
}
function updateTakeView(s,zoom,center){
 s.takeZoom=Math.max(1,Math.min(zoom,Math.max(1,reviewDuration(s)/1.25)));
 s.takeCenter=center;paintTakeEditor(s);
}
function paintTakeEditor(s){
 const canvas=$('#take-waveform');if(!canvas)return;
 const r=activeTakeRange(s),view=takeView(s),total=reviewDuration(s);
 for(const tick of document.querySelectorAll('[data-wave-tick]')){
  const t=view.start+view.length*Number(tick.dataset.waveTick)/4;
  tick.textContent=s.takeZoom>1?t.toFixed(2)+'초':time(t);
 }
 const pan=$('[data-wave-pan]');pan.hidden=!(s.takeZoom>1);pan.value=view.start+view.length/2;
 for(const handle of document.querySelectorAll('[data-range-handle]')){
  const key=handle.dataset.rangeHandle,t=r?.[key];
  handle.hidden=!r||t<view.start-.001||t>view.end+.001;
  handle.inert=!!s.punchRange;
  if(!handle.hidden){
   const bounds=s.editTool==='punch'?punchBounds(s):{start:0,end:total};
   const position=100*(t-view.start)/(view.length||1);
   handle.style.setProperty('--handle-position',Math.max(0,Math.min(100,position))+'%');
   handle.dataset.edge=position<1?'left':position>99?'right':'';
   handle.setAttribute('aria-valuemin',String(key==='start'?bounds.start:r.start+.1));
   handle.setAttribute('aria-valuemax',String(key==='end'?bounds.end:r.end-.1));
   handle.setAttribute('aria-valuenow',String(t));handle.setAttribute('aria-valuetext',t.toFixed(2)+'초');
  }
 }
 for(const input of document.querySelectorAll('[data-take-time]'))if(r&&input!==document.activeElement)input.value=r[input.dataset.takeTime].toFixed(2);
 const length=$('[data-take-length]');if(length&&r)length.textContent=(r.end-r.start).toFixed(2)+'초';
 for(const line of document.querySelectorAll('[data-punch-line]')){
  const item=s.data.words[Number(line.dataset.punchLine)],end=item.e??item.w?.at(-1)?.e??r?.end;
  line.setAttribute('aria-pressed',String(!!r&&item.s<r.end&&end>r.start));
 }
 const plan=s.pendingPunch?.plan,applied=$('[data-punch-applied]');
 if(applied)applied.textContent=plan?'자동 연결 범위 '+plan.range.start.toFixed(2)+'–'+plan.range.end.toFixed(2)+'초':'이 범위에서 연결점을 계산하지 못했습니다.';
 for(const button of document.querySelectorAll('[data-punch-compare]'))button.setAttribute('aria-pressed',String(button.dataset.punchCompare===s.punchCompare));
 for(const button of document.querySelectorAll('[data-punch-candidate]'))button.setAttribute('aria-pressed',String(Number(button.dataset.punchCandidate)===s.punchCandidate));
 const invalid=!!$('[data-take-time][aria-invalid=true]');
 const note=$('[data-take-message]');
 const cropShort=s.editTool==='crop'&&r&&r.end-r.start<K().MIN_COVER_SECONDS-1e-7&&r.end-r.start<total-.005;
 if(note)note.textContent=invalid?'녹음 안에서 시작과 종료 시간을 확인해 주세요.':s.editTool==='crop'?(s.cropNotice||(cropShort?'게시할 구간은 5초 이상이어야 합니다.':'')):
  s.punchNotice||(plan?.warning?poorPunchJoin:'');
 const crop=$('[data-crop-length]');if(crop&&r)crop.textContent='게시 길이 '+(r.end-r.start).toFixed(2)+'초'+(s.crop?' · 적용 '+s.crop.start.toFixed(2)+'–'+s.crop.end.toFixed(2)+'초':'');
 for(const b of document.querySelectorAll('[data-punch-start],[data-punch-use],[data-punch-again],[data-crop-preview],[data-crop-apply]')){
  b.disabled=!!(invalid||singBusy(s)||singLive(s)||s.punchPreparing||s.editAction||!canEditPaid()
   ||b.hasAttribute('data-punch-start')&&(!r||r.end-r.start<.1-1e-7)
   ||b.hasAttribute('data-punch-use')&&(!plan||plan.warning)
   ||b.hasAttribute('data-crop-apply')&&cropShort);
 }
 drawTakeWaveform();
}
function bindTakeWave(s){
 const canvas=$('#take-waveform');
 const surface=canvas.parentElement;
 const allowed=()=>!singBusy(s)&&!singLive(s)&&!s.punchPreparing&&!s.editAction;
 const position=event=>{
  const rect=surface.getBoundingClientRect(),view=takeView(s);
  return view.start+Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*view.length;
 };
 const seek=at=>{
  if(s.state==='playing'&&s.previewFade&&s.editTool==='crop')at=Math.max(s.cropSelection.start,Math.min(s.cropSelection.end-.01,at));
  if(s.state==='playing')void previewMix(at,s.previewUntil,{fade:s.previewFade});
  else{s.cursor=at;drawLyrics(at);}
 };
 const bound=(key,value)=>{
  const bounds=s.editTool==='punch'?punchBounds(s):{start:0,end:reviewDuration(s)},r=activeTakeRange(s);
  if(s.editTool==='punch'&&s.punchSnap){
   const times=punchLines(s).map(line=>line[key]).filter(t=>t>=bounds.start&&t<=bounds.end);
   value=times.reduce((closest,t)=>Math.abs(t-value)<Math.abs(closest-value)?t:closest,value+(key==='start'?-.12:.12));
   if(!times.includes(value))value+=(key==='start'?.12:-.12);
  }
  const lower=key==='start'?bounds.start:r.start+.1,upper=key==='end'?bounds.end:r.end-.1;
  setTakeRange(s,{...r,[key]:Math.max(lower,Math.min(value,upper))});
 };
 for(const handle of surface.querySelectorAll('[data-range-handle]')){
  const key=handle.dataset.rangeHandle;let delta=0;
  handle.onpointerdown=e=>{if(allowed()){e.preventDefault();handle.focus({preventScroll:true});delta=activeTakeRange(s)[key]-position(e);handle.setPointerCapture(e.pointerId);}};
  handle.onpointermove=e=>{if(allowed()&&handle.hasPointerCapture(e.pointerId))bound(key,position(e)+delta);};
  handle.onkeydown=e=>{
   const step={ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1}[e.key];
   if(!step||!allowed())return;e.preventDefault();
   bound(key,activeTakeRange(s)[key]+step*(e.shiftKey?.1:.01));
  };
 }
 let drag=null;
 canvas.onpointerdown=e=>{
  if(!allowed()||e.button!==0)return;
  drag={id:e.pointerId,x:e.clientX,at:position(e),moved:false};
  canvas.setPointerCapture(e.pointerId);
 };
 canvas.onpointermove=e=>{
  if(!drag||drag.id!==e.pointerId||!allowed())return;
  if(Math.abs(e.clientX-drag.x)>3)drag.moved=true;
  if(!drag.moved||!activeTakeRange(s))return;
  const at=position(e),bounds=s.editTool==='punch'?punchBounds(s):{start:0,end:reviewDuration(s)};
  if(Math.abs(at-drag.at)>=.1)setTakeRange(s,fitTakeRange({start:Math.min(at,drag.at),end:Math.max(at,drag.at)},bounds));
 };
 canvas.onpointerup=e=>{
  if(!drag||drag.id!==e.pointerId)return;
  if(allowed()&&(!drag.moved||!activeTakeRange(s)))seek(position(e));
  drag=null;
 };
 canvas.onpointercancel=()=>drag=null;
 canvas.onkeydown=e=>{
  if(!allowed()||!['ArrowRight','ArrowLeft'].includes(e.key))return;e.preventDefault();
  seek(Math.max(0,Math.min(reviewDuration(s),s.cursor+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:.1))));
 };
 for(const b of document.querySelectorAll('[data-zoom-by]'))b.onclick=()=>{
  const view=takeView(s),center=s.cursor>=view.start&&s.cursor<=view.end?s.cursor:(view.start+view.end)/2;
  updateTakeView(s,(s.takeZoom||1)*Number(b.dataset.zoomBy),center);
 };
 $('[data-wave-pan]').oninput=e=>updateTakeView(s,s.takeZoom,Number(e.target.value));
}
const takePeakCache=new WeakMap();
function waveformPeak(buffer,start,end){
 const samples=buffer.getChannelData(0),rate=buffer.sampleRate,block=256;
 let peaks=takePeakCache.get(buffer);
 if(!peaks){
  peaks=new Float32Array(Math.ceil(samples.length/block));
  for(let i=0;i<samples.length;i++){const bin=i>>8;peaks[bin]=Math.max(peaks[bin],Math.abs(samples[i]));}
  takePeakCache.set(buffer,peaks);
 }
 let first=Math.max(0,Math.floor(start*rate)),last=Math.min(samples.length,Math.ceil(end*rate)),peak=0;
 while(first<last&&first%block)peak=Math.max(peak,Math.abs(samples[first++]));
 while(first+block<=last){peak=Math.max(peak,peaks[first>>8]);first+=block;}
 while(first<last)peak=Math.max(peak,Math.abs(samples[first++]));
 return peak;
}
function inWindow(t,range){return !!range&&t>=range.start&&t<range.end;}
function drawTakeWaveform(){
 const s=sing,canvas=$('#take-waveform');if(!s?.voice||!canvas)return;
 const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
 const view=takeView(s),range=activeTakeRange(s),plan=s.pendingPunch?.plan,run=s.run?.punchPlan?s.run:null;
 const take=s.editTool==='punch'&&s.punchPage==='result'?s.pendingPunch?.take:null;
 const ratio=Math.min(2,devicePixelRatio||1);
 const width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio);
 const x=t=>100*(t-view.start)/(view.length||1);
 const playhead=$('[data-take-playhead]'),position=x(s.cursor);
 playhead.hidden=position<0||position>100;
 playhead.style.left=position+'%';
 canvas.setAttribute('aria-valuemax',String(reviewDuration(s)));
 canvas.setAttribute('aria-valuenow',String(s.cursor));canvas.setAttribute('aria-valuetext',s.cursor.toFixed(2)+'초');
 const key=[width,height,view.start,view.end,s.editTool,range?.start,range?.end,run?.waveVersion,s.mix.offset,plan?.first,plan?.end,s.punchCompare].join(':');
 if(s.wavePaint?.canvas===canvas&&s.wavePaint.voice===s.voice&&s.wavePaint.take===take&&s.wavePaint.key===key)return;
 s.wavePaint={canvas,voice:s.voice,take,key};
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d'),bins=Math.max(12,Math.floor(rect.width/3)),step=width/bins,mid=height/2,shift=s.mix.offset/1000;
 if(range){
  ctx.fillStyle='rgba(205,182,242,.14)';
  ctx.fillRect(x(range.start)*width/100,0,(x(range.end)-x(range.start))*width/100,height);
 }
 if(take&&plan){
  ctx.fillStyle='rgba(142,221,210,.18)';
  ctx.fillRect(x(plan.range.start)*width/100,0,(x(plan.range.end)-x(plan.range.start))*width/100,height);
 }
 const history=s.punchUndo||[];
 for(let i=0;i<bins;i++){
  const begin=view.start+i*view.length/bins,end=begin+view.length/bins,t=(begin+end)/2;
  const selected=inWindow(t,range);
  let amp=waveformPeak(s.voice,begin+shift,end+shift);
  let color=selected?'#CDB6F2':history.some(edit=>t+shift>=edit.first/s.voice.sampleRate&&t+shift<(edit.first+edit.samples.length)/s.voice.sampleRate)?'#8EDDD2':'#9BAFC8';
  if(s.editTool==='crop'&&!selected)color='rgba(155,175,200,.32)';
  if(take&&t+shift>=take.first/take.rate&&t+shift<(take.first+take.samples.length)/take.rate){
   if(s.punchCompare==='new'){
    const captured=inWindow(t,plan?.range);
    const samples=captured?plan.samples:take.samples,origin=captured?plan.first:take.first;
    const from=Math.max(0,Math.floor((begin+shift)*take.rate)-origin),until=Math.min(samples.length,Math.ceil((end+shift)*take.rate)-origin);
    amp=0;
    for(let j=from;j<until;j+=Math.max(1,Math.floor((until-from)/100)))amp=Math.max(amp,Math.abs(samples[j]));
    color=captured?'#8EDDD2':'#72AAA6';
   }
  }
  if(run&&inWindow(t,run.punchPlan)&&t<s.cursor){
   const peak=run.punchPeaks[Math.floor((t-run.punchPlan.start)/.02)];
   if(peak>0){amp=peak;color=selected?'#8EDDD2':'#72AAA6';}
  }
  const half=Math.max(1,Math.sqrt(amp)*mid*.88);
  ctx.fillStyle=color;ctx.fillRect((i+.25)*step,mid-half,Math.max(1,step*.5),2*half);
 }
}
