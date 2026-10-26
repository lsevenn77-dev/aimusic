// Premium punch-in pages reuse the current recorder, mix, lyrics and local draft.
function recordingEditorHTML(s,m){
 const duration=reviewDuration(s),premium='<span class="studio-premium-label">프리미엄</span>';
 return `<div class="sing-review studio-post studio-editor-clean"><div class="studio-edit-main"><div class="studio-wave-editor"><div class="studio-time-ruler">${Array.from({length:7},(_,i)=>`<span>${time(duration*i/6)}</span>`).join('')}</div><div class="studio-wave-surface"><canvas id="take-waveform" height="140" aria-label="녹음 파형"></canvas></div><input class="studio-wave-seek" type="range" min="0" max="${duration}" value="${s.cursor||0}" step=".05" aria-label="녹음 재생 위치"></div>
 <div class="studio-preview-row studio-audio"><span class="studio-current-time"><span data-review-now>${time(s.cursor)}</span> / ${time(duration)}</span><div><button type="button" class="studio-play" data-sing-preview aria-label="녹음 들어보기">${icon('audio-play')}</button><button type="button" class="studio-play" data-sing-pause aria-label="녹음 일시정지" hidden>${studioIcon('pause')}</button></div><div class="studio-rerecord-entry"><button type="button" class="small-button" data-open-punch>${icon('mic')} 일부 구간 재녹음 ${premium}</button><small>다시 부를 가사는 다음 화면에서 선택해요.</small></div></div>
 <div class="studio-edit-tools" role="tablist" aria-label="녹음 편집 도구">${[['sync','sliders','싱크 조절'],['noise','sparkles','노이즈 제거'],['tone','sliders','음색 보정']].map(([id,symbol,name])=>`<button type="button" role="tab" id="edit-tool-${id}" data-edit-tool="${id}" aria-selected="${id==='tone'}" aria-controls="studio-edit-detail">${icon(symbol)}<strong>${name}</strong></button>`).join('')}</div><section id="studio-edit-detail" class="studio-edit-detail" role="tabpanel"></section>
 <div class="studio-edit-actions"><button type="button" class="small-button" data-reset-mix>${icon('restart')} 원래대로</button><button type="button" class="primary-button" data-apply-mix>효과 적용</button></div>
 <form id="sing-upload-form" class="upload-form studio-publish-panel"><section class="studio-publication"><h3>게시 정보</h3>${coverPublicationHTML(s)}<label class="form-field">커버 소개 (선택)<textarea name="description" maxlength="1000" rows="2" placeholder="이 커버에 대한 소개를 입력해주세요."></textarea></label><div class="studio-rights"><label class="checkbox-line rights-check"><input name="own_voice" type="checkbox" required><span>제가 직접 부른 녹음이며 AI 음성 복제가 아닙니다.</span></label>${!s.parent?'<label class="checkbox-line rights-check"><input name="duet_consent" type="checkbox"><span>듀엣 참여 모집 선택 시, 다른 사람이 이 녹음에 이어 부르는 것에 동의합니다.</span></label>':''}<label class="checkbox-line rights-check"><input name="rights" type="checkbox" required><span>원곡자의 허용 범위 안에서 공개할 권리가 있습니다.</span></label></div></section>
 <div class="studio-save-actions"><div><button type="button" class="small-button" data-sing-redo>${icon('restart')} 다시 부르기</button><button type="button" class="small-button" data-sing-preview data-full-preview>${icon('audio-play')} 전체 미리듣기</button></div><div><button type="button" class="small-button" data-sing-draft>임시 저장</button><button type="submit" class="primary-button">저장 후 게시</button></div></div><div class="upload-progress" hidden><progress max="100" value="0"></progress><p role="status"></p></div><p class="form-error" role="alert"></p></form>
 <details class="studio-advanced"><summary>세부 설정 · 파일 저장 · 초안 관리</summary><div class="inline-actions"><button type="button" class="small-button" data-sing-settings>잡음 · 세부 설정</button><button type="button" class="small-button" data-sing-save>${member.plan==='premium'?'부른 구간 파일로 저장':'프리미엄으로 파일 저장'}</button><button type="button" class="small-button" data-discard-draft>초안 삭제</button></div><p class="field-help">초안은 현재 기기에서 이어 편집할 수 있어요.</p></details></div>
 <aside class="studio-sidebar studio-review-sidebar studio-editor-inspector" aria-label="녹음 편집 설정"><h2>소리 설정</h2><section class="studio-setting-card"><h3>${studioIcon('headphones')} 볼륨 밸런스</h3>${soundControlHTML(m,true)}</section>${spaceEffectsHTML(m)}</aside></div>`;
}
function cleanupPunch(s){if(!s)return;s.punchRequest=(s.punchRequest||0)+1;s.punchPreparing=false;s.pendingPunch=null;s.punchAuthorized=false;}
async function authorizePunch(s,body){
 return api('/api/karaoke/'+encodeURIComponent(s.id)+'/rerecord',body===undefined?'GET':'POST',body);
}
async function openPunchSelection(s=sing){
 if(sing!==s||!s.voice||singBusy(s)||singLive(s))return;
 const request=s.punchRequest=(s.punchRequest||0)+1;stopPreview();
 try{await authorizePunch(s);if(sing!==s||request!==s.punchRequest)return;
  s.pendingPunch=null;s.punchPage='select';s.editingRecording=false;s.punchLineStart=null;s.punchLineEnd=null;s.punchManual=false;s.state='review';renderSingPanel();$('#punch-page')?.scrollIntoView({block:'start'});$('#punch-page h2')?.focus();
 }catch(e){if(sing!==s||request!==s.punchRequest)return;setSingStatus(e.message);if(e.status===403||/프리미엄/.test(e.message)){s.punchPage='premium';renderSingPanel();}}
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
 if(s.punchPage==='premium'){
  panel.innerHTML=`<section id="punch-page" class="studio-punch-page"><button class="small-button" data-punch-back>← 편집 화면</button><h2 tabindex="-1">일부 구간 재녹음</h2><p>가사를 골라 필요한 부분만 다시 부르는 프리미엄 회원 전용 기능이에요.</p><a class="primary-button" href="#membership">프리미엄 혜택 보기</a></section>`;
 }else if(s.punchPage==='select'){
  const lines=K().punchLyricLines(s.data.words,reviewDuration(s));let r;try{r=punchSelectedRange(s);}catch{}
  panel.innerHTML=`<section id="punch-page" class="studio-punch-page"><header><button type="button" class="small-button" data-punch-back>← 편집 화면</button><span class="studio-premium-label">프리미엄</span></header><h2 tabindex="-1">다시 부를 가사를 선택하세요</h2><p>한 줄만 누르거나, 여러 줄의 시작·끝 줄을 선택하세요.</p><div class="studio-punch-lyrics" role="group" aria-label="다시 부를 가사">${lines.map(l=>{const selected=r&&l.index>=r.first&&l.index<=r.last;return `<button type="button" data-punch-line="${l.index}" aria-pressed="${!!selected}"><time>${preciseTime(l.start)} – ${preciseTime(l.end)}</time><span class="studio-punch-marker">${selected&&l.index===r.first?'시작':selected&&l.index===r.last?'끝':''}</span><strong>${esc(l.text)}</strong></button>`;}).join('')||'<p class="empty-note">현재 녹음 구간에 선택할 싱크 가사가 없어요. 편집 화면에서 전체 녹음을 이어갈 수 있어요.</p>'}</div><div class="studio-punch-summary"><strong>${r?'선택한 가사 '+r.count+'줄':'다시 부를 가사를 선택해주세요.'}</strong><span>${r?preciseTime(r.start)+' – '+preciseTime(r.end)+' · '+(r.end-r.start).toFixed(1)+'초':''}</span></div>
  ${r?`<details class="studio-punch-fine"><summary>시간 미세 조정</summary><p>필요할 때만 시작·끝 시간을 조절해요.</p><label>구간 시작 <input type="number" data-punch-time="start" value="${r.start.toFixed(2)}" min="0" max="${reviewDuration(s)}" step="0.05"></label><label>구간 끝 <input type="number" data-punch-time="end" value="${r.end.toFixed(2)}" min="0" max="${reviewDuration(s)}" step="0.05"></label></details>`:''}
  <div class="studio-punch-actions"><button type="button" class="small-button" data-punch-back>취소</button><button type="button" class="primary-button" data-punch-start ${r?'':'disabled'}>${icon('mic')} 이 구간 녹음하기</button></div><p class="field-help">3·2·1 후 녹음이 시작돼요. 앞뒤 녹음은 그대로 유지해요.</p><p data-punch-error role="alert"></p></section>`;
  panel.querySelectorAll('[data-punch-line]').forEach(b=>b.onclick=()=>selectPunchLine(s,Number(b.dataset.punchLine)));
  panel.querySelectorAll('[data-punch-time]').forEach(input=>input.oninput=()=>{const start=Number(panel.querySelector('[data-punch-time="start"]').value),end=Number(panel.querySelector('[data-punch-time="end"]').value);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>reviewDuration(s)||end-start<.1){panel.querySelector('[data-punch-error]').textContent='시작·끝 시간을 확인해주세요.';return;}s.punchManual=true;s.selection={start,end};const summary=panel.querySelector('.studio-punch-summary span');summary.textContent=preciseTime(start)+' – '+preciseTime(end)+' · '+(end-start).toFixed(1)+'초';});
  panel.querySelector('[data-punch-start]').onclick=()=>startSelectedPunch(s);
 }else if(s.punchPage==='result'&&s.pendingPunch){
  const p=s.pendingPunch;
  panel.innerHTML=`<section id="punch-page" class="studio-punch-page"><header><button type="button" class="small-button" data-punch-back>← 기존 녹음 유지</button><span class="studio-premium-label">프리미엄</span></header><h2 tabindex="-1">다시 녹음한 구간을 확인하세요</h2><p>${preciseTime(p.range.start)} – ${preciseTime(p.range.end)}</p><div class="studio-punch-result-lyrics">${K().punchLyricLines(s.data.words,reviewDuration(s)).filter(l=>l.start<p.range.end&&l.end>p.range.start).map(l=>'<p>'+esc(l.text)+'</p>').join('')}</div><canvas id="punch-waveform" height="110" aria-label="다시 녹음한 구간의 파형"></canvas><div class="studio-punch-preview"><button type="button" class="studio-play" data-punch-preview aria-label="녹음 결과 듣기">${icon('audio-play')}</button><label>녹음 결과 듣기<input type="range" data-punch-seek min="0" max="${p.range.end-p.range.start}" value="0" step=".05" aria-label="녹음 결과 재생 위치"></label><output data-punch-progress>0:00 / ${time(p.range.end-p.range.start)}</output></div><div class="studio-punch-actions"><button type="button" class="small-button" data-punch-again>${icon('restart')} 다시 녹음</button><button type="button" class="primary-button" data-punch-use>${studioIcon('check')} 이 녹음 사용</button></div><p class="field-help">확인하면 선택한 구간만 바꾸고 편집 화면으로 돌아가요.</p><p data-punch-error role="alert"></p></section>`;
  panel.querySelector('[data-punch-preview]').onclick=()=>s.state==='playing'?(stopPreview(),updateTransport(),paintPunchPlayback(s)):previewPunchResult(s,p.range.start);
  panel.querySelector('[data-punch-seek]').oninput=e=>{if(s.state==='playing')previewPunchResult(s,p.range.start+Number(e.target.value));else{s.cursor=p.range.start+Number(e.target.value);paintPunchPlayback(s);}};
  panel.querySelector('[data-punch-again]').onclick=()=>startSelectedPunch(s,true);
  panel.querySelector('[data-punch-use]').onclick=()=>acceptPunchResult(s);
  requestAnimationFrame(()=>paintPunchPlayback(s));
 }
 panel.querySelectorAll('[data-punch-back]').forEach(b=>b.onclick=()=>punchBackToEditor(s));return true;
}
async function startSelectedPunch(s=sing,retry=false){
 if(sing!==s||singBusy(s)||singLive(s)||s.punchPreparing)return;
 s.punchPreparing=true;const page=s.punchPage,request=s.punchRequest=(s.punchRequest||0)+1;let resume;
 try{resume=resumeSingContext(s).then(()=>null,e=>e);stopPreview();const r=retry?s.pendingPunch?.selection:punchSelectedRange(s);if(!r)throw Error('다시 부를 가사를 선택해주세요.');
  const authorization=await authorizePunch(s,{duration:reviewDuration(s),first:r.first,last:r.last,manual:!!s.punchManual,start:r.start,end:r.end});const error=await resume;if(error)throw error;
  if(sing!==s||s.punchRequest!==request||s.punchPage!==page)return;
  s.punchSelection={...r};s.punchRange=authorization.range;s.selection={...authorization.range};s.pendingPunch=null;s.punchAuthorized=true;s.punchPage='record';s.cursor=s.punchRange.start;s.editingRecording=true;s.state='review';updateTransport();drawLyrics(s.cursor);$('#sing')?.scrollIntoView({block:'start'});await startSinging();
 }catch(e){if(sing!==s||request!==s.punchRequest)return;const note=$('[data-punch-error]');if(note)note.textContent=e.message;setSingStatus(e.message);}
 finally{s.punchPreparing=false;}
}
function paintPunchCountdown(s,run){
 const header=$('.sing-punch-record-header'),countdown=$('.sing-countdown');if(!header||!countdown)return;
 const active=!!run?.punchRange;header.hidden=!active;
 if(!active){countdown.hidden=true;return;}
 header.querySelector('[data-punch-record-range]').textContent=preciseTime(run.punchRange.start)+' – '+preciseTime(run.punchRange.end);
 header.querySelector('[data-punch-cancel]').onclick=()=>finishSinging({discardPunch:true});
 const n=K().punchCountdown(run.recordClock,s.ctx.currentTime);countdown.hidden=!n;
 const number=countdown.querySelector('[data-punch-countdown]');if(number.textContent!==String(n))number.textContent=String(n);
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
 try{stopPreview();s.state='rendering';updateTransport();paintPunchPlayback(s);await prepareVocalEffects(s,p.voice);if(sing!==s||s.pendingPunch!==p||s.punchPage!=='result')return;
  s.state='review';await s.ctx.resume();const view={...s,voice:p.voice},at=s.ctx.currentTime+.05;from=from>=p.range.end-.02?p.range.start:Math.max(p.range.start,from);const mix=scheduleMix(s.ctx,from,at,view,p.range.end);runPreview(s,mix.sources,at,from,'playing',mix.nodes);paintPunchPlayback(s);
 }catch(e){if(sing===s&&s.pendingPunch===p){s.state='review';updateTransport();paintPunchPlayback(s);if(!e.cancelled)setSingStatus(e.message);}}
}
async function acceptPunchResult(s=sing){
 const p=s.pendingPunch;if(sing!==s||!p||singBusy(s))return;
 try{await authorizePunch(s);if(sing!==s||s.pendingPunch!==p)return;stopPreview();s.voice=p.voice;s.processed=null;s.pendingPunch=null;s.punchPage=null;s.punchRange=null;s.editingRecording=false;s.state='review';s.cursor=p.range.start;s.dirty=true;s.revision=(s.revision||0)+1;refreshVocalGuide(s);renderDuetGuide();renderSingPanel();drawLyrics(s.cursor);$('#sing')?.scrollIntoView({block:'start'});await saveSingDraft(s);setSingStatus('선택한 구간을 바꾸고 초안에 저장했어요. 앞뒤 녹음은 유지했어요.');}
 catch(e){if(sing===s)setSingStatus(e.message||'녹음을 저장하지 못했어요.');}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&sing?.punchRange&&singLive(sing))void finishSinging({discardPunch:true});});
