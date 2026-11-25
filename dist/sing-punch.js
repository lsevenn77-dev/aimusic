// Post-recording editor. The two steps share the same take and publication form.
const editTools=[['sync','sliders','싱크 조절'],['balance','volume','볼륨 밸런스'],['noise','mic','노이즈 제거'],['space','headphones','공간 효과'],['tone','sliders','음색 보정']];
const editorLock=()=>'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
function refreshTakeEntitlement(){
 if(typeof sing==='undefined'||!sing)return;const s=sing,paid=canEditPaid();if(s.editPaid===paid)return;s.editPaid=paid;
 if(!paid){s.mix.tone=0;if(s.punchPage&&s.punchPage!=='record'){cleanupPunch(s);s.punchPage=null;s.punchRange=null;}if(s.editTool==='tone')s.editTool='sync';if(s.state==='playing')stopPreview();}
 if(s.voice&&!singBusy(s)&&!singLive(s))renderSingPanel();else refreshEffectControls();
}
function recordingEditorHTML(s,m){
 const duration=reviewDuration(s),paid=canEditPaid(),locked=paid?'':' disabled',lock=paid?'':editorLock(),r=reviewRange(s);
 return `<div class="sing-review studio-post studio-editor-clean"><div class="studio-edit-main take-editor">
 <div data-edit-step="1"><div class="take-wave-tools">${s.mode==='duet'?duetLegendHTML():''}<div class="take-tools"><button type="button" class="small-button" data-ab aria-pressed="${!!s.abEnabled}" aria-controls="take-ab-range">${icon('repeat')} 구간 반복 (A-B)</button><button type="button" class="small-button take-paid" data-open-punch ${locked}>${lock||icon('mic')} 일부 구간 재녹음</button></div></div>
 <div class="studio-wave-editor"><div class="studio-time-ruler">${Array.from({length:7},(_,i)=>`<span>${time(duration*i/6)}</span>`).join('')}</div><div class="studio-wave-surface"><canvas id="take-waveform" height="140" aria-label="녹음 파형"></canvas></div>
 <div id="take-ab-range" ${s.abEnabled?'':'hidden'}>${['start','end'].map((k,i)=>`<label>${i?'B · 끝':'A · 시작'} <output data-range-${k}></output><input type="range" data-range="${k}" min="0" max="${duration}" value="${r[k]}" step=".05"></label>`).join('')}</div></div>
 <div class="take-transport studio-audio"><span class="take-time"><b data-review-now>${time(s.cursor)}</b> / ${time(duration)}</span><div class="take-navigation"><button type="button" data-skip="-1" aria-label="이전 소절">${icon('previous')}</button><button type="button" class="take-play" data-sing-preview aria-label="재생">${icon('audio-play')}</button><button type="button" class="take-play" data-sing-pause aria-label="일시정지" hidden>${studioIcon('pause')}</button><button type="button" data-skip="1" aria-label="다음 소절">${icon('next')}</button></div><div class="take-view"><label>${icon('volume')}<input type="range" data-listen-volume aria-label="재생 볼륨" min="0" max="1" step=".01" value="${s.listenVolume??1}"></label><button type="button" data-wave-zoom aria-label="파형 확대" aria-pressed="false">${icon('external')}</button></div></div>
 <div class="take-tool-workspace"><div class="studio-edit-tools" role="tablist" aria-label="녹음 편집 도구">${editTools.map(([id,symbol,name])=>`<button type="button" role="tab" id="edit-tool-${id}" data-edit-tool="${id}" ${id==='tone'?'class="take-paid"'+locked:''} aria-selected="${id==='sync'}" aria-controls="studio-edit-detail">${id==='tone'&&lock?lock:studioIcon(symbol)}<strong>${name}</strong></button>`).join('')}</div><section id="studio-edit-detail" class="studio-edit-detail" role="tabpanel"></section></div>
 <footer class="take-footer"><button type="button" class="small-button" data-reset-mix>${icon('restart')} 원본 복원</button><span data-save-status role="status"></span><div><button type="button" class="small-button" data-sing-draft>초안 저장</button><button type="button" class="primary-button" data-step-next>게시 설정 ${icon('arrow')}</button></div></footer></div>
 <form id="sing-upload-form" class="upload-form studio-publish-panel" data-edit-step="2" hidden><section class="studio-publication"><h2 tabindex="-1">게시 설정</h2><div class="take-mobile-publication">${coverPublicationHTML(s)}</div><div class="take-publish-grid"><div class="take-publish-fields">${workPhotoField(trackArtworkPath(s.data.track))}<label class="form-field">커버 소개 (선택)<textarea name="description" maxlength="1000" rows="2" placeholder="이 커버에 대한 소개를 입력해 주세요."></textarea></label></div><div class="studio-rights"><h3 class="take-desktop">게시 전 동의</h3><label class="take-desktop take-all checkbox-line"><input data-consent-all type="checkbox"><span>전체 동의</span></label><label class="checkbox-line rights-check"><input name="own_voice" type="checkbox" required><span>제가 직접 부른 녹음이며 AI 음성 복제가 아닙니다.</span></label><label class="checkbox-line rights-check"${s.parent?' data-joined-consent':''}><input name="duet_consent" type="checkbox"><span>듀엣 참여 모집 시 다른 사람이 이 녹음에 이어 부르는 것에 동의합니다.</span></label><label class="checkbox-line rights-check"><input name="rights" type="checkbox" required><span>원곡자의 허용 범위 안에서 공개할 권리가 있습니다.</span></label></div></div></section>
 <details class="studio-advanced take-mobile-management"><summary>녹음 관리</summary><div class="inline-actions"><button type="button" class="small-button" data-sing-redo>다시 부르기</button><button type="button" class="small-button" data-sing-save>파일로 저장</button><button type="button" class="small-button" data-discard-draft>초안 삭제</button></div></details>
 <footer class="take-footer"><button type="button" class="small-button" data-step-back><span data-edit-step-name>음원 편집</span></button><span data-save-status role="status"></span><div><button type="button" class="small-button" data-sing-draft>초안 저장</button><button type="submit" class="primary-button">저장 후 게시</button></div></footer><div class="upload-progress" hidden><progress max="100" value="0"></progress><p role="status"></p></div><p class="form-error" role="alert"></p></form></div></div>`;
}

function cleanupPunch(s){if(!s)return;s.punchRequest=(s.punchRequest||0)+1;s.punchPreparing=false;s.pendingPunch=null;s.punchAuthorized=false;}
async function authorizePunch(s,body){
 return api('/api/karaoke/'+encodeURIComponent(s.id)+'/rerecord',body===undefined?'GET':'POST',body);
}
async function openPunchSelection(s=sing){
 if(sing!==s||!canEditPaid()||!s.voice||singBusy(s)||singLive(s))return;
 const request=s.punchRequest=(s.punchRequest||0)+1;stopPreview();
 try{await authorizePunch(s);if(sing!==s||request!==s.punchRequest)return;
  s.pendingPunch=null;s.punchPage='select';s.editingRecording=false;s.punchLineStart=null;s.punchLineEnd=null;s.punchManual=false;s.state='review';renderSingPanel();$('#punch-page')?.scrollIntoView({block:'start'});$('#punch-page h2')?.focus();
 }catch(e){if(sing!==s||request!==s.punchRequest)return;setSingStatus(e.message);if(e.status===403){await refreshLibrary(true);if(sing===s)renderSingPanel();}}
}
function punchBackToEditor(s=sing){
 if(sing!==s)return;stopPreview();cleanupPunch(s);s.punchPage=null;s.punchRange=null;s.editingRecording=false;s.state='review';renderSingPanel();drawLyrics(s.cursor);$('[data-open-punch]')?.focus();
}
function punchSelectedRange(s){
 const selected=K().punchLyricRange(s.data.words,reviewDuration(s),s.punchLineStart,s.punchLineEnd??s.punchLineStart);
 return s.punchManual?{...selected,...reviewRange(s)}:selected;
}
function selectPunchLine(s,index){
 if(sing!==s||singBusy(s))return;
 if(s.punchLineStart===null||s.punchLineEnd!==null){s.punchLineStart=index;s.punchLineEnd=null;}else s.punchLineEnd=index;
 s.punchManual=false;const r=punchSelectedRange(s);s.selection={start:r.start,end:r.end};renderSingPanel();$('[data-punch-line="'+index+'"]')?.focus({preventScroll:true});
}
function renderPunchPage(s){
 if(!s?.punchPage||s.punchPage==='record')return false;
 const panel=$('#sing-panel');
 if(s.punchPage==='select'){
  const lines=K().punchLyricLines(s.data.words,reviewDuration(s));let r;try{r=punchSelectedRange(s);}catch{}
  panel.innerHTML=`<section id="punch-page" class="studio-punch-page"><header><button type="button" class="small-button" data-punch-back>← 편집 화면</button></header><h2 tabindex="-1">다시 부를 가사를 선택하세요</h2><p>한 줄만 누르거나, 여러 줄의 시작·끝 줄을 선택하세요.</p><div class="studio-punch-lyrics" role="group" aria-label="다시 부를 가사">${lines.map(l=>{const selected=r&&l.index>=r.first&&l.index<=r.last;return `<button type="button" data-punch-line="${l.index}" aria-pressed="${!!selected}"><time>${preciseTime(l.start)} – ${preciseTime(l.end)}</time><span class="studio-punch-marker">${selected&&l.index===r.first?'시작':selected&&l.index===r.last?'끝':''}</span><strong>${esc(l.text)}</strong></button>`;}).join('')||'<p class="empty-note">현재 녹음 구간에 선택할 싱크 가사가 없습니다. 편집 화면에서 전체 녹음을 이어갈 수 있습니다.</p>'}</div><div class="studio-punch-summary"><strong>${r?'선택한 가사 '+r.count+'줄':'다시 부를 가사를 선택해 주세요.'}</strong><span>${r?preciseTime(r.start)+' – '+preciseTime(r.end)+' · '+(r.end-r.start).toFixed(1)+'초':''}</span></div>
  ${r?`<details class="studio-punch-fine"><summary>시간 미세 조정</summary><p>필요할 때만 시작·끝 시간을 조절합니다.</p><label>구간 시작 <input type="number" data-punch-time="start" value="${r.start.toFixed(2)}" min="0" max="${reviewDuration(s)}" step="0.05"></label><label>구간 끝 <input type="number" data-punch-time="end" value="${r.end.toFixed(2)}" min="0" max="${reviewDuration(s)}" step="0.05"></label></details>`:''}
  <div class="studio-punch-actions"><button type="button" class="small-button" data-punch-back>취소</button><button type="button" class="primary-button" data-punch-start ${r?'':'disabled'}>${icon('mic')} 이 구간 녹음하기</button></div><p class="field-help">3·2·1 후 녹음이 시작됩니다. 앞뒤 녹음은 그대로 유지합니다.</p><p data-punch-error role="alert"></p></section>`;
  panel.querySelectorAll('[data-punch-line]').forEach(b=>b.onclick=()=>selectPunchLine(s,Number(b.dataset.punchLine)));
  panel.querySelectorAll('[data-punch-time]').forEach(input=>input.oninput=()=>{const start=Number(panel.querySelector('[data-punch-time="start"]').value),end=Number(panel.querySelector('[data-punch-time="end"]').value);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>reviewDuration(s)||end-start<.1){panel.querySelector('[data-punch-error]').textContent='시작·끝 시간을 확인해 주세요.';return;}s.punchManual=true;s.selection={start,end};const summary=panel.querySelector('.studio-punch-summary span');summary.textContent=preciseTime(start)+' – '+preciseTime(end)+' · '+(end-start).toFixed(1)+'초';});
  panel.querySelector('[data-punch-start]').onclick=()=>startSelectedPunch(s);
 }else if(s.punchPage==='result'&&s.pendingPunch){
  const p=s.pendingPunch;
  panel.innerHTML=`<section id="punch-page" class="studio-punch-page"><header><button type="button" class="small-button" data-punch-back>← 기존 녹음 유지</button></header><h2 tabindex="-1">다시 녹음한 구간을 확인하세요</h2><p>${preciseTime(p.range.start)} – ${preciseTime(p.range.end)}</p><div class="studio-punch-result-lyrics">${K().punchLyricLines(s.data.words,reviewDuration(s)).filter(l=>l.start<p.range.end&&l.end>p.range.start).map(l=>'<p>'+esc(l.text)+'</p>').join('')}</div><canvas id="punch-waveform" height="110" aria-label="다시 녹음한 구간의 파형"></canvas><div class="studio-punch-preview"><button type="button" class="studio-play" data-punch-preview aria-label="녹음 결과 듣기">${icon('audio-play')}</button><label>녹음 결과 듣기<input type="range" data-punch-seek min="0" max="${p.range.end-p.range.start}" value="0" step=".05" aria-label="녹음 결과 재생 위치"></label><output data-punch-progress>0:00 / ${time(p.range.end-p.range.start)}</output></div><div class="studio-punch-actions"><button type="button" class="small-button" data-punch-again>${icon('restart')} 다시 녹음</button><button type="button" class="primary-button" data-punch-use>${studioIcon('check')} 이 녹음 사용</button></div><p class="field-help">확인하면 선택한 구간만 바꾸고 편집 화면으로 돌아갑니다.</p><p data-punch-error role="alert"></p></section>`;
  panel.querySelector('[data-punch-preview]').onclick=()=>s.state==='playing'?(stopPreview(),updateTransport(),paintPunchPlayback(s)):previewPunchResult(s,p.range.start);
  panel.querySelector('[data-punch-seek]').oninput=e=>{if(s.state==='playing')previewPunchResult(s,p.range.start+Number(e.target.value));else{s.cursor=p.range.start+Number(e.target.value);paintPunchPlayback(s);}};
  panel.querySelector('[data-punch-again]').onclick=()=>startSelectedPunch(s,true);
  panel.querySelector('[data-punch-use]').onclick=()=>acceptPunchResult(s);
  requestAnimationFrame(()=>paintPunchPlayback(s));
 }
 panel.querySelectorAll('[data-punch-back]').forEach(b=>b.onclick=()=>punchBackToEditor(s));return true;
}
async function startSelectedPunch(s=sing,retry=false){
 if(sing!==s||!canEditPaid()||singBusy(s)||singLive(s)||s.punchPreparing)return;
 s.punchPreparing=true;const page=s.punchPage,request=s.punchRequest=(s.punchRequest||0)+1;let resume;
 try{resume=resumeSingContext(s).then(()=>null,e=>e);stopPreview();const r=retry?s.pendingPunch?.selection:punchSelectedRange(s);if(!r)throw Error('다시 부를 가사를 선택해 주세요.');
  const authorization=await authorizePunch(s,{duration:reviewDuration(s),first:r.first,last:r.last,manual:!!s.punchManual,start:r.start,end:r.end});const error=await resume;if(error)throw error;
  if(sing!==s||s.punchRequest!==request||s.punchPage!==page)return;
  s.punchSelection={...r};s.punchRange=authorization.range;s.selection={...authorization.range};s.pendingPunch=null;s.punchAuthorized=true;s.punchPage='record';s.cursor=s.punchRange.start;s.editingRecording=true;s.state='review';updateTransport();drawLyrics(s.cursor);$('#sing')?.scrollIntoView({block:'start'});await startSinging();
 }catch(e){if(sing!==s||request!==s.punchRequest)return;const note=$('[data-punch-error]');if(note)note.textContent=e.message;setSingStatus(e.message);}
 finally{s.punchPreparing=false;}
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
function paintPunchPlayback(s){
 if(sing!==s||s.punchPage!=='result'||!s.pendingPunch)return;const p=s.pendingPunch,elapsed=Math.max(0,Math.min(p.range.end-p.range.start,s.cursor-p.range.start));
 const button=$('[data-punch-preview]');if(button){button.innerHTML=s.state==='playing'?studioIcon('pause'):icon('audio-play');button.setAttribute('aria-label',s.state==='playing'?'녹음 결과 일시정지':'녹음 결과 듣기');button.disabled=singBusy(s);}
 const seek=$('[data-punch-seek]'),progress=$('[data-punch-progress]');if(seek&&!seek.matches(':active'))seek.value=elapsed;if(progress)progress.textContent=time(elapsed)+' / '+time(p.range.end-p.range.start);
 const canvas=$('#punch-waveform');if(!canvas)return;const rect=canvas.getBoundingClientRect();if(!rect.width)return;canvas.width=Math.round(rect.width*devicePixelRatio);const ctx=canvas.getContext('2d'),data=p.voice.getChannelData(0),start=Math.floor(p.range.start*p.voice.sampleRate),end=Math.min(data.length,Math.ceil(p.range.end*p.voice.sampleRate)),bins=180,mid=canvas.height/2;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#b7b6ff';
 for(let i=0;i<bins;i++){let peak=0,a=start+Math.floor((end-start)*i/bins),b=start+Math.floor((end-start)*(i+1)/bins);for(let j=a;j<b;j+=Math.max(1,Math.floor((b-a)/64)))peak=Math.max(peak,Math.abs(data[j]));const x=(i+.5)*canvas.width/bins,h=Math.max(1,Math.sqrt(peak)*mid*.85);ctx.beginPath();ctx.moveTo(x,mid-h);ctx.lineTo(x,mid+h);ctx.stroke();}
}
async function previewPunchResult(s=sing,from=s.pendingPunch?.range.start){
 const p=s.pendingPunch;if(sing!==s||!p||singBusy(s)||singLive(s))return;
 try{stopPreview();s.state='rendering';updateTransport();paintPunchPlayback(s);await prepareKeyBacking(s);await prepareVocalEffects(s,p.voice);if(sing!==s||s.pendingPunch!==p||s.punchPage!=='result')return;
  s.state='review';await s.ctx.resume();const view={...s,voice:p.voice},at=s.ctx.currentTime+.05;from=from>=p.range.end-.02?p.range.start:Math.max(p.range.start,from);const mix=scheduleMix(s.ctx,from,at,view,p.range.end);runPreview(s,mix.sources,at,from,'playing',mix.nodes);paintPunchPlayback(s);
 }catch(e){if(sing===s&&s.pendingPunch===p){s.state='review';updateTransport();paintPunchPlayback(s);if(!e.cancelled)setSingStatus(e.message);}}
}
async function acceptPunchResult(s=sing){
 const p=s.pendingPunch;if(sing!==s||!canEditPaid()||!p||singBusy(s))return;
 try{await authorizePunch(s);if(sing!==s||s.pendingPunch!==p)return;stopPreview();s.beforePunch??=s.voice;s.voice=p.voice;s.processed=null;s.pendingPunch=null;s.punchPage=null;s.punchRange=null;s.editingRecording=false;s.state='review';s.cursor=p.range.start;s.dirty=true;s.revision=(s.revision||0)+1;refreshVocalGuide(s);renderDuetGuide();renderSingPanel();drawLyrics(s.cursor);$('#sing')?.scrollIntoView({block:'start'});setSingStatus('선택한 구간을 바꿨습니다. 앞뒤 녹음은 유지했습니다.');}
 catch(e){if(sing===s)setSingStatus(e.message||'녹음을 저장하지 못했습니다.');}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&sing?.punchRange&&singLive(sing))void finishSinging({discardPunch:true});});
