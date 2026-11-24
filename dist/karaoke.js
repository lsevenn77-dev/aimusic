function canEditPaid(){return typeof member!=='undefined'&&member.plan==='premium'&&(!member.premium_until||Number(member.premium_until)*1000>Date.now());}
// Native bridge and browser recorder share the same song/MR permissions and cover upload API.
let sing=null,routeSing=null;
const K=()=>window.AifectKaraoke;
function studioIcon(name){const path={stop:'M6 6h12v12H6Z',pause:'M8 5v14M16 5v14',check:'m5 12 4 4 10-10',original:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M6 6l12 12',hall:'M4 20V4h16v16M8 4v16M16 4v16M3 20h18M8 8h8',headphones:'M4 13v-1a8 8 0 0 1 16 0v1M4 12H2v8h4v-8Zm16 0h2v8h-4v-8Z'}[name];return path?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>':icon(name);}
const nativeSinging=()=>window.Capacitor?.isNativePlatform?.()&&window.Capacitor.Plugins?.AifectKaraoke;
const singBusy=s=>['loading','stopping','exporting','rendering'].includes(s?.state);
const singLive=s=>['singing','preroll'].includes(s?.state);
function singRouteHref(s){const q=new URLSearchParams();if(s.parent)q.set('duet',s.parent);else{q.set('mode',s.mode==='duet'?'duet':'solo');if(s.mode==='duet')q.set('part',s.part||'male');}return '#sing/'+encodeURIComponent(s.id)+'?'+q;}
async function loadSingRoute(trackId,q,readApi=api){const parent=q.get('duet'),d=await readApi(parent?'/api/duets/'+encodeURIComponent(parent):'/api/karaoke/'+encodeURIComponent(trackId));if(d.track?.id!==trackId||parent&&d.duet?.parent_id!==parent)throw new Error('참여할 듀엣을 확인하지 못했습니다. 듀엣 참여에서 다시 열어 주세요.');return {...d,chooseMode:!parent&&!['solo','duet'].includes(q.get('mode'))&&q.get('draft')!=='1',mode:parent||q.get('mode')==='duet'?'duet':'solo',part:d.duet?.part||(q.get('part')==='female'?'female':'male')};}
function singRecordingModeHTML(d){
 if(d.duet?.parent_id||d.parent)return '';
 return '<div class="sing-mode-switch" role="group" aria-label="녹음 방식">'+['solo','duet'].map(mode=>'<button type="button" data-sing-record-mode="'+mode+'" aria-pressed="'+((d.mode||'solo')===mode)+'">'+(mode==='solo'?'솔로':'듀엣')+'</button>').join('')+'</div>';
}
function singPreparationVisible(s){
 return !!s&&(s.preparationOpen??!s.voice)&&!s.startingRecording&&!singLive(s)&&!s.punchRange&&!s.punchPage&&!(s.voice&&!s.editingRecording);
}
function updateSingPreparation(){
 const s=sing,group=$('[data-sing-prep-controls]');if(!s||!group)return;
 const visible=singPreparationVisible(s),locked=singBusy(s)||!!s.modeSwitchPending||!!s.restartPending;
 group.classList.toggle('is-hidden',!visible);group.setAttribute('aria-hidden',String(!visible));group.inert=!visible;
 group.querySelectorAll('[data-sing-record-mode]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.singRecordMode===s.mode));button.disabled=!visible||locked||!!s.parent;});
 group.querySelectorAll('[data-duet-editor]').forEach(button=>button.disabled=!visible||locked);
}
function askSingModeChange(s,mode){
 const dlg=$('#dialog');if(dlg.open)return Promise.resolve(false);
 const trigger=document.activeElement,label=mode==='duet'?'듀엣':'솔로';
 return new Promise(resolve=>{
  let accepted=false;
  dialog('<div class="sing-mode-change-dialog"><p class="popup-prompt">'+label+'로 전환할까요?</p><p>현재 녹음은 비우고 처음부터 녹음합니다. 이미 저장한 초안과 오디오 설정은 유지됩니다.</p><div class="inline-actions"><button type="button" class="small-button" data-mode-cancel>취소</button><button type="button" class="primary-button" data-mode-confirm>전환하기</button></div></div>');
  dlg.classList.add('sing-mode-change-popup');
  dlg.addEventListener('close',()=>{dlg.classList.remove('sing-mode-change-popup');if(trigger?.isConnected)trigger.focus();resolve(accepted&&sing===s);},{once:true});
  dlg.querySelector('[data-mode-cancel]').onclick=()=>dlg.close();
  dlg.querySelector('[data-mode-confirm]').onclick=()=>{accepted=true;dlg.close();};
  dlg.querySelector('[data-mode-cancel]').focus();
 });
}
async function switchSingRecordingMode(mode){
 const s=sing,valid=()=>sing===s&&!!s&&!s.parent&&singPreparationVisible(s)&&!singBusy(s)&&!s.restartPending&&(!s.owner||s.owner===me?.id);
 if(!['solo','duet'].includes(mode)||!valid()||mode===s.mode||s.modeSwitchPending)return false;
 const voice=s.voice,previousMode=s.mode,trigger=document.activeElement;s.modeSwitchPending=true;updateTransport();
 try{
  if(voice&&!await askSingModeChange(s,mode))return false;
  if(s.draftWrite)await s.draftWrite;
  if(!valid()||s.voice!==voice||s.mode!==previousMode)return false;
  s.previewRequest=(s.previewRequest||0)+1;stopPreview();cleanupPunch(s);cancelKeyProcessing(s);
  Object.assign(s,{voice:null,beforePunch:null,processed:null,keyEvents:null,keyMR:null,publishRequest:null,savedAt:0,editMixBaseline:null,selection:null,punchRange:null,punchPage:null,punchSelection:null,abEnabled:false,wavePeaks:null,waveSource:null,waveRoles:null,compareFrom:null,editorStep:1,cursor:0,shownLine:-1,dirty:false,draftError:false,editingRecording:true,preparationOpen:true,state:'idle'});
  if(s.duetGuide?.activity){const {activity,...guide}=s.duetGuide;s.duetGuide=guide;}
  s.mode=mode;s.data.mode=mode;s.revision=(s.revision||0)+1;
  const href=singRouteHref(s);history.replaceState(history.state,'',href);s.routeHash=href;s.historyKey=window.navigation?.currentEntry?.key||s.historyKey;
  const main=$('#main');if(main)main.dataset.route=href.slice(1);window.AifectRender?.syncTarget?.();
  document.querySelectorAll('[data-recording-mode-label]').forEach(label=>label.textContent=mode==='duet'?'듀엣':'솔로');
  renderDuetGuide();renderSingPanel();drawLyrics(0);setSingStatus((mode==='duet'?'듀엣':'솔로')+' 녹음을 준비했습니다. 녹음 시작을 눌러 주세요.');
  return true;
 }catch(error){if(sing===s)setSingStatus(error.message||'녹음 방식을 바꾸지 못했습니다. 다시 시도해 주세요.',true);return false;}
 finally{s.modeSwitchPending=false;if(sing===s){updateTransport();if(trigger?.isConnected&&singPreparationVisible(s))trigger.focus();}}
}
async function restartSinging(){
 const s=sing;if(!s||singBusy(s)||s.startingRecording||s.modeSwitchPending||s.restartPending)return false;
 s.restartPending=true;
 try{
  if(singLive(s))await finishSinging();
  if(sing!==s)return false;
  s.previewRequest=(s.previewRequest||0)+1;stopPreview();cleanupPunch(s);
  s.editorStep=1;s.punchRange=null;s.punchPage=null;s.editingRecording=true;s.preparationOpen=true;s.cursor=0;s.shownLine=-1;s.state=s.voice?'review':'idle';
  renderSingPanel();drawLyrics(0);setSingStatus('처음부터 다시 시작할 준비가 되었습니다.');return true;
 }finally{s.restartPending=false;if(sing===s)updateTransport();}
}
// A paused take is still on the recording screen until the singer chooses 완료.
function singExitKind(s){
 if(!s)return null;
 if(singLive(s)||s.startingRecording||s.voice&&s.editingRecording)return 'record';
 return s.voice?'edit':null;
}
function askSingExit(s,kind){
 const edit=kind==='edit',dlg=document.createElement('dialog');
 dlg.id='sing-exit-dialog';dlg.className='compact-popup';
 dlg.setAttribute('aria-labelledby','sing-exit-title');
 dlg.setAttribute('aria-describedby','sing-exit-note');
 dlg.innerHTML=`<p class="popup-prompt" id="sing-exit-title">${edit?'편집한 녹음을 초안으로 저장할까요?':'녹음을 중단하고 나갈까요?'}</p>
 <p id="sing-exit-note">${edit?'초안으로 저장하면 나중에 이어서 편집할 수 있습니다. 저장하지 않으면 이번 편집 내용은 사라집니다.':'지금 나가면 진행 중인 녹음은 저장되지 않고 내 초안에도 추가되지 않습니다.'}</p>
 <p class="form-error" role="alert" hidden></p>
 <div class="sing-exit-actions"><button type="button" class="small-button" data-choice="stay" autofocus>${edit?'편집 계속':'계속 녹음'}</button>
 <button type="button" class="small-button" data-choice="discard">${edit?'저장하지 않고 나가기':'녹음 버리고 나가기'}</button>
 ${edit?'<button type="button" class="primary-button" data-choice="save">초안 저장 후 나가기</button>':''}</div>`;
 document.body.append(dlg);
 return new Promise(resolve=>{
  let saving=false;
  const finish=leave=>{dlg.close();dlg.remove();resolve(leave);};
  dlg.addEventListener('cancel',event=>{event.preventDefault();if(!saving)finish(false);});
  dlg.addEventListener('click',async event=>{
   const choice=event.target.closest('[data-choice]')?.dataset.choice;
   if(!choice||saving||!dlg.open)return;
   if(choice!=='save'){finish(choice==='discard');return;}
   saving=true;
   const buttons=dlg.querySelectorAll('button');
   buttons.forEach(button=>button.disabled=true);
   try{await saveSingDraft(s);finish(true);}
   catch{
    const error=dlg.querySelector('[role="alert"]');
    error.textContent='초안을 저장하지 못했습니다. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.';
    error.hidden=false;saving=false;
    buttons.forEach(button=>button.disabled=false);
    dlg.querySelector('[data-choice="save"]').focus();
   }
  });
  dlg.showModal();
 });
}
async function requestSingExit(s,leave){
 if(s.exitPending||sing!==s)return;
 if(singBusy(s)&&!s.startingRecording&&(!s.voice||s.state==='stopping'||s.state==='exporting')){toast('녹음을 정리한 뒤 이동해 주세요.');return;}
 const kind=singExitKind(s);
 s.exitPending=true;
 try{
  if(kind&&!await askSingExit(s,kind))return;
  if(sing!==s)return;
  cleanupSing();
  leave();
 }finally{s.exitPending=false;}
}
// Link clicks stay at the source URL while the dialog is open, including ordinary
// document links. Modified clicks and downloads leave the current take mounted.
document.addEventListener('click',event=>{
 const s=sing;
 if(!s||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 const link=event.target.closest('a[href]');
 if(!link||link.hasAttribute('download')||link.target&&link.target!=='_self'||!/^https?:$/.test(link.protocol)||link.href===location.href)return;
 if(!singExitKind(s)&&!singBusy(s))return;
 event.preventDefault();event.stopImmediatePropagation();
 void requestSingExit(s,()=>s.backGuard?location.replace(link.href):location.assign(link.href));
},true);
// Hash routes may also be requested by scripts, browser Back/Forward or a
// mobile swipe. Restore the current entry before opening a possibly long dialog.
async function retainSingRoute(s){
 const origin=s.routeHash||singRouteHref(s);
 if(s.owner&&s.owner!==me?.id)return false;
 if(location.hash===origin)return true;
 if(!singExitKind(s)&&!singBusy(s))return false;
 const destination=location.href,nav=window.navigation,key=nav?.currentEntry?.key;
 if(key&&s.historyKey&&key!==s.historyKey&&nav.entries().some(entry=>entry.key===s.historyKey)){
  try{await nav.traverseTo(s.historyKey).committed;}
  catch{/* A removed history entry falls back to the recorder URL. */}
 }
 if(sing!==s)return true;
 if(location.hash!==origin)history.pushState(history.state,'',origin);
 window.AifectRender?.syncTarget?.();
 await requestSingExit(s,()=>{
  if(key&&key!==s.historyKey&&nav.entries().some(entry=>entry.key===key))nav.traverseTo(key).finished.catch(()=>location.assign(destination));
  else location.assign(destination);
 });
 return true;
}

// Direct entry can have a different document immediately behind the recorder.
function armSingBack(s){
 if(s.backGuard||!singExitKind(s)||!s.routeHash||typeof history==='undefined')return;
 const nav=window.navigation,previous=nav?.entries()[nav.currentEntry.index-1];
 if(previous?.sameDocument)return;
 s.hadBack=history.length>1;s.backGuard=true;
 history.pushState({...history.state,singBackGuard:true},'');
 s.historyKey=nav?.currentEntry?.key;
}
window.addEventListener?.('popstate',()=>{
 const s=sing;
 if(!s?.backGuard||location.hash!==s.routeHash||history.state?.singBackGuard)return;
 history.pushState({...history.state,singBackGuard:true},'');
 s.historyKey=window.navigation?.currentEntry?.key;
 void requestSingExit(s,()=>{if(s.hadBack)history.go(-2);else location.replace('#sing/'+encodeURIComponent(s.id));});
});

function releaseRun(run){
 if(!run)return;run.pitch?.close();run.micCheck?.detach(run.stream);run.src.onended=null;try{run.src.stop();}catch{}
 run.stream?.getTracks().forEach(t=>t.stop());if(run.node?.port){run.node.port.onmessage=null;run.node.port.close?.();}for(const n of [run.src,run.mic,run.node,run.mute,run.monitor,run.gain,run.voiceGain,run.output,...(run.effects||[])])try{n?.disconnect();}catch{}
}
function cleanupSing(){
 const s=sing;if(!s)return;if(($('#dialog').classList.contains('recording-settings-dialog')||$('#dialog').classList.contains('record-settings-dialog')||$('#dialog').classList.contains('duet-editor-dialog')||$('#dialog').classList.contains('sing-draft-delete-popup')||$('#dialog').classList.contains('sing-mode-change-popup')))$('#dialog').close();sing=null;cleanupPunch(s);s.abort?.abort();s.pendingMic?.getTracks().forEach(track=>track.stop());clearTimeout(s.scrollTimer);cancelAnimationFrame(s.frame);
 s.previewPitch?.close();s.lyricResize?.disconnect();s.micObserver?.disconnect();s.micCheck?.destroy();cancelKeyProcessing(s);cancelVocalEffects(s);if($('#dialog')?.classList.contains('punch-complete-dialog'))$('#dialog').close();stopStandbyMonitor(s);releaseRun(s.run);s.preview?.forEach(n=>{try{n.stop();}catch{}});s.wake?.release?.().catch(()=>{});s.ctx?.close().catch(()=>{});
}
function karaokeListHTML(tracks,duets=[]){
 remember([...tracks,...duets]);return '<a class="small-button" href="#karaoke/drafts">초안</a>'+duetLobbyHTML(duets)+heading('노래방','마이크와 이어폰을 준비하고 MR·가사와 함께 불러 보세요.')+(tracks.length?`<div class="track-list">${tracks.map((t,i)=>`<div data-list-row class="live-track"><span class="track-rank">${i+1}</span>${cover(t,'mini-cover')}<div class="track-info"><a href="#song/${t.id}"><strong>${esc(t.title)}</strong></a><span>${credits(t)}</span></div><span class="track-time">${time(t.duration)}</span><a class="small-button" href="#sing/${t.id}">${icon('mic')} 부르기</a></div>`).join('')}</div>`:'<p class="surface empty-note">아직 부를 수 있는 곡이 없습니다.</p>');
}
function singEntryHTML(){
 return `<div class="sing-entry-page"><header class="sing-entry-heading"><h1>노래 녹음</h1><p>좋아하는 노래를 내 목소리로 녹음해 보세요.</p></header><section class="sing-entry-state" aria-labelledby="sing-entry-title"><div class="sing-entry-icon" aria-hidden="true">${icon('mic')}</div><h2 id="sing-entry-title">부를 곡을 먼저 골라 주세요</h2><p>플레이에서 곡을 선택하면 반주와 가사를 보며 녹음할 수 있습니다.</p><div class="sing-entry-actions"><a class="primary-button" href="#karaoke">부를 곡 고르기</a><a class="small-button" href="#karaoke/drafts">내 초안</a></div></section></div>`;
}
function singHTML(d){
 if(d.chooseMode)return '';
 const t=d.track;
 return `<section class="surface sing web-studio" id="sing">
 <ol class="take-steps" aria-label="녹음 후 편집 단계" hidden><li data-step-marker="1" aria-current="step"><b>1</b> 음원 편집</li><li data-step-marker="2"><b>2</b> 게시 설정</li></ol><header class="sing-head"><a class="sing-back icon-button" href="#sing/${esc(t.id)}" aria-label="노래하기로 돌아가기">${icon('chevron-left')}</a>${cover(t,"sing-artwork")}<div class="studio-song-meta"><span class="studio-page-label" data-editor-caption hidden>녹음 편집</span><h1 title="${esc(t.title)}">${esc(t.title)}</h1><p class="record-credit" title="${esc(t.producer||t.artist)}">${esc(t.producer||t.artist)}</p><p class="review-credit">${esc(t.artist)} · ${esc(t.genre||'음악')} · <span data-recording-mode-label>${d.mode==='duet'?'듀엣':'솔로'}</span> · <small data-recording-key>원곡 키</small></p></div><div class="sing-header-mode"><div class="sing-prep-controls" data-sing-prep-controls>${singRecordingModeHTML(d)}<div id="duet-guide"></div></div><button type="button" class="record-settings-icon" data-sing-settings aria-label="녹음 설정">${recordSettingsIcon()}</button></div></header>
 ${d.duet?`<div class="sing-duet-context"><span>${icon('users')}</span><div><strong>듀엣 참여 · 내 파트 녹음</strong><p><a href="#producer/${esc(d.duet.partner.producer_id)}">${userNickname(d.duet.partner.producer,{profileId:d.duet.partner.producer_id})}</a>님의 녹음에 이어 부릅니다. 상대 목소리와 반주가 함께 재생됩니다.</p></div></div>`:''}
 <div class="sing-recording"><div class="sing-punch-record-header" hidden><strong>선택 구간 녹음</strong><span data-punch-record-range></span><button type="button" class="small-button" data-punch-cancel>취소</button></div>${nativeSinging()?'':window.AifectMicrophoneCheck?.html()||''}<div class="sing-recording-info"><span data-record-mic role="status">${nativeSinging()?'앱에서 마이크 확인':'마이크 확인 필요'}</span>${duetLegendHTML(d.mode||'solo')}</div>
 <div class="sing-wheel" id="sing-wheel" aria-label="가사와 녹음 위치" tabindex="0">${(d.words||[]).map((line,i)=>`<button type="button" data-sing-line="${i}" data-second="${line.s}" aria-label="${time(line.s)} ${esc(line.w.map(w=>w.t).join(' '))}"><small>${time(line.s)}</small><span class="sing-line-text">${line.w.map((w,j)=>`<span data-word="${j}">${esc(w.t)}</span>`).join(' ')}</span></button>`).join('')||'<p class="field-help">싱크 가사가 없는 곡입니다. 아래 막대로 부를 위치를 골라 주세요.</p>'}</div>
 <div class="sing-progress"><span id="sing-now">0:00</span><input class="sing-seek" id="sing-seek" type="range" min="0" max="${t.duration}" step=".05" value="0" aria-label="노래 위치"><span id="sing-duration">${time(t.duration)}</span></div>
 <div class="sing-countdown" aria-live="polite" aria-hidden="true" data-active="false"><strong data-punch-countdown data-count="0" aria-label="녹음 대기">${'<i aria-hidden="true"></i>'.repeat(3)}</strong></div>
 <div class="sing-transport studio-transport">
  <button type="button" data-sing-redo-live aria-label="다시 시작" title="다시 시작">${icon('restart')}</button>
  <div class="studio-record-slot"><button type="button" data-sing-start class="studio-record" aria-label="녹음 시작" title="녹음 시작">${icon('mic')}</button></div>
  <button type="button" data-sing-stop aria-label="완료" title="완료" disabled>${studioIcon('check')}</button>
 </div>
 <p class="studio-position-help">가사를 누르면 일시정지하고 소절을 선택할 수 있습니다.</p></div>
 <aside id="sing-live-settings" class="studio-sidebar" aria-label="녹음 설정">${liveStudioSettingsHTML(K().defaultVocalMix())}</aside>
 <p class="sing-status" id="sing-status" role="status">${d.duet?'파트너 녹음을 먼저 듣고, 내 파트를 이어 불러 주세요.':'가사를 확인하고 녹음을 시작하세요.'}</p><div id="sing-panel">${singStartHTML()}</div>
 <p class="field-help sing-local-note">초안 저장을 선택하면 녹음과 효과를 이 기기에 보관합니다.</p></section>`;
}
function liveStudioSettingsHTML(m){return `<section class="studio-setting-card"><h2>${studioIcon('headphones')} 오디오 설정</h2>${studioRangeHTML(m,'voice','마이크 볼륨',0,2,.01)}${studioRangeHTML(m,'mr','반주 볼륨',0,1.5,.01)}<label class="sing-monitor"><span>이어폰 모니터링<small>내 목소리를 실시간으로 듣기</small></span><input id="sing-monitor" type="checkbox" role="switch" aria-label="이어폰으로 내 목소리 듣기"></label></section><section class="studio-setting-card"><h2>${icon('list')} 노래 설정</h2>${singingKeyHTML()}<div class="studio-size"><span>가사 크기</span>${lyricSizeControlsHTML()}</div></section>${spaceEffectsHTML(m,true)}`;}
function spaceEffectsHTML(m,live=false){
 const title=`<h2>${icon('sparkles')} 공간 효과</h2>`;
 const presets=[['studio','스튜디오'],['hall','홀'],['karaoke','노래방'],['custom','사용자 설정']];
 if(live)presets.unshift(['original','효과 없음']);
 return `<section class="studio-setting-card studio-space">${title}
  <div class="studio-space-presets" role="group" aria-label="목소리 효과 선택">${presets.map(([id,name])=>vocalPresetButtonHTML(id,name,m.preset===id)).join('')}</div>
  ${live?liveSpaceControlsHTML(m):`<div class="studio-extra-presets">${vocalPresetButtonHTML('original','원음',m.preset==='original')}</div>${reviewSpaceControlsHTML(m)}`}</section>`;
}
function liveSpaceControlsHTML(m){return `<div data-preset-strength>${studioRangeHTML(m,'strength','효과 강도',0,1,.01)}</div><div data-post-custom hidden>${studioRangeHTML(m,'room','잔향감',0,1,.01)}${studioRangeHTML(m,'size','룸 크기',0,1,.01)}${studioRangeHTML(m,'tone','음색 선명도',-1,2,.01)}</div>`;}
function reviewSpaceControlsHTML(m){return `<p class="field-help" data-preset-description></p><div data-preset-strength>${studioRangeHTML(m,'strength','효과 강도',0,1,.01)}</div><details class="sing-effect-details" data-custom-controls><summary>사용자 설정</summary>${studioRangeHTML(m,'echo','에코 효과',0,.65,.001)}${studioRangeHTML(m,'size','룸 크기',0,1,.01)}${studioRangeHTML(m,'room','리버브 강도',0,1,.01)}</details>`;}
const singStartHTML=(message='')=>`${message?`<p class="form-error">${esc(message)}</p>`:''}${nativeSinging()?`<p class="field-help">에코 · 룸 리버브와 실시간 이어폰 청음을 지원합니다.</p><button class="primary-button" data-sing-start>${icon('mic')} 노래방 열기</button>`:''}`;
function bindSing(id){
 cleanupSing();if(!$('#sing')||!routeSing)return;
 sing={id,routeHash:location.hash,historyKey:window.navigation?.currentEntry?.key,owner:me?.id,data:routeSing,state:'loading',cursor:0,keySemitones:0,mix:preferredRecordingMix(me?.id),mode:routeSing.mode||'solo',part:routeSing.part||'male',parent:routeSing.duet?.parent_id||null};if(!canEditPaid())sing.mix.tone=0;sing.duetGuide=sing.parent?routeSing.duet?.guide||null:{version:1,mode:'free',lines:[]};
 const s=sing,wheel=$('#sing-wheel'),seek=$('#sing-seek');
 // Re-anchor after viewport, font or lyric-size changes, without touching cue data.
 s.lyricResize=new ResizeObserver(()=>{if(sing===s&&!s.scrubbing){s.shownLine=null;drawLyrics(s.cursor||0);}});s.lyricResize.observe(wheel);
 const mic=$('#sing .microphone-check');if(mic){$('#sing-live-settings .studio-setting-card').append(mic);const paint=()=>{const status=mic.querySelector('[data-mic-status]'),toggle=mic.querySelector('[data-mic-toggle]'),label=$('[data-record-mic]');toggle.title=toggle.textContent+' · '+status.textContent;if(label){label.textContent=mic.classList.contains('is-connected')?'마이크 연결됨':/권한.*중|연결 중/.test(status.textContent)?'마이크 연결 중':/권한/.test(status.textContent)?'마이크 권한 필요':'마이크 연결 안 됨';label.title=status.textContent;label.classList.toggle('is-connected',mic.classList.contains('is-connected'));}};s.micObserver=new MutationObserver(paint);s.micObserver.observe(mic.querySelector('[data-mic-status]'),{childList:true});s.micObserver.observe(mic,{attributes:true,attributeFilter:['class']});paint();}
 s.micCheck=window.AifectMicrophoneCheck?.bind($('#sing .microphone-check'),{beforeTest(){s.monitorSerial=(s.monitorSerial||0)+1;stopStandbyMonitor(s);$('#sing-monitor').checked=false;document.querySelectorAll('[data-monitor-toggle]').forEach(b=>b.setAttribute('aria-pressed','false'));}});
 const begin=()=>{if(sing!==s||singBusy(s)||s.scrubbing||s.punchRange)return;s.scrubbing=true;s.resumeMode=singLive(s)?'record':s.state==='playing'?'play':s.state==='guide'?'guide':s.state==='backing'?'backing':null;s.settling=singLive(s)?finishSinging():Promise.resolve();if(s.preview)stopPreview();};
 const select=t=>{if(sing!==s||s.punchRange)return;begin();s.cursor=clampPosition(t,s.resumeMode==='play');drawLyrics(s.cursor,false);};
 const end=async()=>{
  if(!s.scrubbing)return;const target=s.cursor,mode=s.resumeMode;s.scrubbing=false;await s.settling;if(sing!==s||s.scrubbing)return;s.cursor=target;drawLyrics(target);if(document.hidden)return;
  if(mode==='record')startSinging();else if(mode==='play')previewMix(target);else if(mode==='guide')previewGuide(target);else if(mode==='backing')toggleBackingPreview();
 };
 seek.addEventListener('pointerdown',begin);seek.addEventListener('input',()=>select(Number(seek.value)));seek.addEventListener('change',end);seek.addEventListener('pointercancel',end);
 // A first tap pauses only; a later tap chooses the target without auto-resuming.
 const pauseLyrics=async()=>{if(sing!==s||singBusy(s))return;if(singLive(s)){s.editingRecording=true;await finishSinging();}else if(s.preview){stopPreview();updateTransport();}setSingStatus('일시정지 · 다시 부를 가사를 선택하세요.');};
 wheel.addEventListener('click',e=>{if(singBusy(s)||s.punchRange)return;if(singLive(s)||s.preview){void pauseLyrics();return;}const row=e.target.closest('[data-second]');if(row){s.cursor=clampPosition(Number(row.dataset.second));s.shownLine=-1;drawLyrics(s.cursor);setSingStatus('선택한 소절부터 다시 부를 준비가 되었습니다.');}});
 wheel.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(singLive(s)||s.preview){void pauseLyrics();return;}if(singBusy(s)||s.punchRange)return;const lines=s.data.words,i=K().wordAt(lines,s.cursor).line,j=Math.max(0,Math.min(lines.length-1,i+(e.key==='ArrowDown'?1:-1)));if(lines[j]){s.cursor=lines[j].s;s.shownLine=-1;drawLyrics(s.cursor);}});
 $('#sing-monitor').onchange=e=>setMonitorEnabled(e.target.checked);const monitorButton=$('[data-monitor-toggle]');if(monitorButton)monitorButton.onclick=()=>setMonitorEnabled(!$('#sing-monitor').checked);
 document.querySelectorAll('button[data-lyric-size]').forEach(button=>button.onclick=()=>applyLyricSize(button.dataset.lyricSize));applyLyricSize(preferredLyricSize());
 // The favorite uses the shared data-like handler, so it is saved to the account.
 const redoLive=$('[data-sing-redo-live]');if(redoLive)redoLive.onclick=()=>{void restartSinging();};
 document.querySelectorAll('[data-sing-record-mode]').forEach(button=>button.onclick=()=>{void switchSingRecordingMode(button.dataset.singRecordMode);});
 bindKeyControls();renderDuetGuide();drawLyrics(0);renderSingPanel();if(new URLSearchParams(location.hash.split('?')[1]||'').get('draft')==='1')void restoreSingDraft(s);else{s.state='idle';updateTransport();}
}
function setSingStatus(message,notice=false){const el=$('#sing-status');if(el){if(el.textContent!==message)el.textContent=message;el.classList.toggle('show-notice',notice);}}
function clampPosition(t,review=false){return Math.max(0,Math.min(t,review&&sing.voice&&sing.mode!=='duet'?sing.voice.duration:sing.mr?.duration||sing.data.track.duration));}
function updateTransport(){
 if(!sing)return;armSingBack(sing);const s=sing,locked=singBusy(s)||!!s.modeSwitchPending||!!s.restartPending,live=singLive(s),subpage=!!s.punchPage&&s.punchPage!=='record',reviewing=!!s.voice&&!s.editingRecording&&!live&&!subpage;
 document.querySelectorAll('[data-sing-preview]').forEach(b=>b.disabled=locked||live||!s.voice||s.state==='playing');
 document.querySelectorAll('[data-sing-pause]').forEach(b=>b.disabled=locked||!(live||s.preview));
 document.querySelectorAll('[data-sing-start],[data-sing-save],#sing-upload-form button,#sing-upload-form select,[data-duet-method],[data-duet-reanalyze],[data-duet-line],[data-duet-editor]').forEach(b=>b.disabled=locked||live);
 document.querySelectorAll('[data-range],[data-open-punch],[data-punch-start],[data-punch-use],[data-punch-again],[data-reset-mix],[data-ab],[data-skip],[data-step-next],[data-sync-step],[data-sync-reset],[data-edit-tool]').forEach(b=>b.disabled=locked||live||(b.matches('.take-paid')&&!canEditPaid()));
 const steps=$('.take-steps');if(steps)steps.hidden=!reviewing;
 s.micCheck?.setBusy(locked||live);
 $('#sing').classList.toggle('is-reviewing',reviewing);$('#sing').classList.toggle('is-live',live);$('#sing').classList.toggle('is-idle',!live&&!reviewing);
 $('.sing-recording').hidden=reviewing||subpage;$('#sing-live-settings').hidden=reviewing||subpage||!!s.punchRange;$('#sing-panel').hidden=!subpage&&!!s.voice&&!reviewing;$('#sing').classList.toggle('is-punch-page',subpage);$('#sing').classList.toggle('is-punch-recording',!!s.punchRange);document.querySelectorAll('[data-editor-caption]').forEach(el=>el.hidden=!reviewing);const redo=$('[data-sing-redo-live]');if(redo){redo.hidden=!!s.punchRange;redo.disabled=locked;}updateSingPreparation();
 const player=$('.studio-audio');if(player){player.querySelector('[data-sing-preview]').hidden=s.state==='playing';player.querySelector('[data-sing-pause]').hidden=s.state!=='playing';}
 $('#sing-seek').disabled=locked||!!s.punchRange;
 const start=$('.sing-transport [data-sing-start]'),stop=$('.sing-transport [data-sing-stop]');
 if(start){
  const label=live?'일시정지':s.voice&&!singPreparationVisible(s)?'재개':'녹음 시작';
  start.hidden=false;start.disabled=locked;start.title=label;start.setAttribute('aria-label',label);
  start.innerHTML=live?studioIcon('pause'):icon('mic');
 }
 if(stop){stop.hidden=false;stop.disabled=locked||!(live||s.voice);}
 if(reviewing){s.monitorSerial=(s.monitorSerial||0)+1;stopStandbyMonitor(s);$('#sing-monitor').checked=false;document.querySelectorAll('[data-monitor-toggle]').forEach(b=>b.setAttribute('aria-pressed','false'));}document.querySelectorAll('[data-monitor-toggle],#sing-monitor').forEach(b=>b.disabled=locked);refreshEffectControls();updateKeyControls();
}
async function prepareSing(s,live=false){
 const ctx=await prepareSingAudio(s);
 if(live){
  s.backingModule||=ctx.audioWorklet.addModule('/backing-worklet.js?v=take-editor2').catch(error=>{s.backingModule=null;throw error;});
  await s.backingModule;
 }else await prepareKeyBacking(s);
 return ctx;
}
async function prepareSingAudio(s){
 if(s.audioPreparation)return s.audioPreparation;
 const work=loadSingAudio(s);s.audioPreparation=work;try{return await work;}finally{if(s.audioPreparation===work)s.audioPreparation=null;}
}
// A duet invitation stores only the two processed playback tracks, aligned to
// the same 32 kHz transport as the published cover. The dry mic stays local.
async function uploadDuetStems(s,id,report){
 const rate=K().MIX_RATE,length=Math.ceil(s.mr.duration*rate);
 for(const [i,part] of ['instrument','partner'].entries()){
  const ctx=new OfflineAudioContext(2,length,rate),src=ctx.createBufferSource(),gain=ctx.createGain(),vocal=part==='partner';
  src.buffer=vocal?voiceBuffer(s):backingBuffer(s);gain.gain.value=(vocal?s.mix.voice:s.mix.mr)*(s.exportScale??1);src.connect(gain).connect(ctx.destination);
  const shift=vocal?s.mix.offset/1000:0;src.start(Math.max(0,-shift),Math.max(0,shift));
  const out=await ctx.startRendering(),file=await encodeCoverMp3(out,{signal:s.abort?.signal,onProgress:v=>report((i+v*.8)/2)});
  if(sing!==s)throw Error('녹음 화면이 닫혔습니다.');
  await uploadFile('/api/uploads/'+encodeURIComponent(id)+'/duet-'+part,file,v=>report((i+.8+.2*v/100)/2));
 }
}
async function loadDuetStems(s,ctx){
 const stems=s.data.duet.stems,read=async url=>{const r=await fetch(url,{credentials:'same-origin',signal:s.abort.signal});if(!r.ok)throw Error('듀엣 트랙을 불러오지 못했습니다. 다시 시도해 주세요.');return ctx.decodeAudioData(await r.arrayBuffer());};
 const [backing,partner]=await Promise.all([read(stems.instrument),read(stems.partner)]);
 if(backing.duration>600||Math.abs(backing.duration-partner.duration)>.06)throw Error('듀엣 트랙의 길이가 일치하지 않습니다.');
 const combined=ctx.createBuffer(2,backing.length,ctx.sampleRate);
 for(let c=0;c<2;c++){const out=combined.getChannelData(c),a=backing.getChannelData(Math.min(c,backing.numberOfChannels-1)),b=partner.getChannelData(Math.min(c,partner.numberOfChannels-1));for(let i=0;i<out.length;i++)out[i]=a[i]+(b[i]||0);}
 s.instrumentStem=backing;s.partnerStem=partner;s.mr=combined;
 if(s.editTool==='balance'&&sing===s)renderStudioEditTool('balance');
}

async function loadSingAudio(s){
 const ctx=await prepareVocalContext(s);
 if(!s.mr){s.abort=new AbortController();if(s.data.duet?.stems)await loadDuetStems(s,ctx);else {const r=await fetch(s.data.mr,{credentials:'same-origin',signal:s.abort.signal});if(!r.ok)throw new Error('반주를 불러오지 못했습니다. 다시 로그인하고 시도해 주세요.');s.mr=await ctx.decodeAudioData(await r.arrayBuffer());}}
 if(s.mr.duration>600)throw new Error('10분 이하 곡만 녹음할 수 있습니다.');
 return ctx;
}
async function resumeSingContext(s){
 if(!window.AudioContext&&!window.webkitAudioContext)throw new Error('이 브라우저는 녹음을 지원하지 않습니다. 최신 브라우저에서 열어 주세요.');
 const ctx=s.ctx||(s.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:K().MIX_RATE,latencyHint:'interactive'}));
 // Call resume in the button gesture, before timers, permission prompts or downloads.
 return ctx.resume().then(()=>ctx);
}
async function prepareVocalContext(s){
 const ctx=await resumeSingContext(s);
 if(!s.vocalWorklet){
  s.vocalPreparation||=ctx.audioWorklet.addModule('/vocal-worklet.js?v=20261117-space-bypass');
  try{await s.vocalPreparation;s.vocalWorklet=true;}finally{s.vocalPreparation=null;}
 }
 return ctx;
}
async function startSinging(){
 if(!sing||singBusy(sing)||singLive(sing)||sing.modeSwitchPending||sing.restartPending)return;
 const partIssue=duetAssignmentIssue(sing);if(partIssue){setSingStatus(partIssue);openDuetEditor();return;}
 if(nativeSinging()&&!sing.punchRange){
  const s=sing,preparationOpen=s.preparationOpen;s.preparationOpen=false;s.startingRecording=true;++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';updateTransport();$('#sing-panel').innerHTML='<p class="field-help">노래방을 열고 있습니다…</p>';
  try{const result=await nativeSinging().open({trackId:s.id,coverMode:s.mode,duetPart:s.part,duetParentId:s.parent||''});if(result.uploadedId){if(sing===s)cleanupSing();toast('커버곡을 올렸습니다! 변환이 끝나면 공개됩니다.');location.hash='studio';return;}if(sing===s){s.preparationOpen=preparationOpen;s.state='idle';$('#sing-panel').innerHTML=singStartHTML();}}
  catch(e){if(sing===s){s.preparationOpen=preparationOpen;s.state='idle';setSingStatus(e.message||'노래방을 열지 못했습니다.',true);$('#sing-panel').innerHTML=singStartHTML(e.message||'노래방을 열지 못했습니다.');}}
  finally{s.startingRecording=false;if(sing===s)updateTransport();}return;
 }
 const s=sing,preparationOpen=s.preparationOpen;if(s.punchRange&&!s.punchAuthorized){setSingStatus('프리미엄 권한을 다시 확인해 주세요.');return;}s.punchAuthorized=false;s.preparationOpen=false;s.startingRecording=true;let stream,run;stopPreview();s.micCheck?.prepare();s.monitorSerial=(s.monitorSerial||0)+1;stopStandbyMonitor(s);++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';updateTransport();setSingStatus('반주와 마이크를 준비하고 있습니다…');
 try{
  if(!window.AudioContext&&!window.webkitAudioContext)throw new Error('이 브라우저는 녹음을 지원하지 않습니다.');
  const context=s.ctx||(s.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:K().MIX_RATE,latencyHint:'interactive'}));const resume=context.resume();
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('마이크를 사용할 수 없는 브라우저입니다. HTTPS 주소에서 최신 브라우저로 열어 주세요.');
  // Request only after the user starts recording. A denied request cannot start an MR or leave a live mic.
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  if(sing!==s){stream.getTracks().forEach(t=>t.stop());return;}
  s.pendingMic=stream;await resume;if(sing!==s)return;const ctx=await prepareSing(s,true);if(ctx.state!=='running')throw new Error('오디오가 일시정지되었습니다. 노래 시작을 다시 눌러 주세요.');
  if(!stream.getAudioTracks().some(t=>t.readyState==='live'&&t.enabled))throw new Error('사용 가능한 마이크 입력이 없습니다. 브라우저의 마이크 장치를 확인해 주세요.');
  if(sing!==s||document.hidden)throw new Error('화면으로 돌아와 노래 시작을 눌러 주세요.');
  if(!s.worklet){
   await ctx.audioWorklet.addModule('/recorder-worklet.js?v=20260929');s.worklet=true;
  }
  if(sing!==s||document.hidden)throw new Error('화면으로 돌아와 다시 시작해 주세요.');
  const recordAt=clampPosition(s.cursor),from=s.punchRange?Math.max(0,recordAt-3):recordingPrerollStart(s.data?.words,recordAt);
  const t0=ctx.currentTime+.15+Math.max(0,3-(recordAt-from)),clock={t0,recordClock:t0+recordAt-from};if(recordAt>=s.mr.duration-.05)throw new Error('곡이 끝났습니다. 가사를 움직여 다시 부를 위치를 골라 주세요.');
  const mic=ctx.createMediaStreamSource(stream),node=new AudioWorkletNode(ctx,'aifect-recorder',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'}),mute=ctx.createGain(),monitor=ctx.createGain(),src=ctx.createBufferSource(),chunks=[];
  run={stream,mic,node,mute,monitor,src,chunks,recordAt,from,punchRange:s.punchRange?{...s.punchRange}:null,t0:clock.t0,recordClock:clock.recordClock??clock.t0+recordAt-from,micCheck:s.micCheck};s.run=run;s.pendingMic=null;
  s.micCheck?.attach(stream,ctx);
  const output=run.output=protectOutput(ctx);mute.gain.value=0;monitor.gain.value=$('#sing-monitor').checked ? 1 : 0;mic.connect(node);node.connect(mute).connect(ctx.destination);monitor.connect(output);run.voiceGain=ctx.createGain();run.voiceGain.gain.value=s.mix.voice;run.voiceGain.connect(monitor);run.effects=connectEffects(ctx,mic,run.voiceGain,s.mix);
  node.port.onmessage=e=>{if(e.data==='done')run.flushed?.();else if(e.data?.d instanceof Float32Array){chunks.push(e.data);run.peak=Math.max(run.peak||0,e.data.peak||0);}};
  src.buffer=s.mr;const gain=ctx.createGain();run.gain=gain;gain.gain.value=s.mix.mr;gain.connect(output);
  const duration=(run.punchRange?.end||s.mr.duration)-from;
  run.keyEvents=[{at:recordAt,key:singingKey(s)}];
  run.pitch=connectLiveBacking(s,src,gain,run.t0,from,duration,run.punchRange?s.keyEvents:null);
  src.start(run.t0,from,duration);
  stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(sing===s&&singLive(s)){finishSinging();}}));
  s.state=ctx.currentTime<run.recordClock?'preroll':'singing';if(!run.punchRange){s.dirty=true;s.revision=(s.revision||0)+1;}src.onended=()=>{if(sing===s&&singLive(s)){s.editingRecording=!!run.punchRange;finishSinging({offerPunchChoice:!!run.punchRange});}};
  $('#sing-panel').innerHTML='';bindMixControls();updateTransport();
  try{s.wake=await navigator.wakeLock?.request('screen');if(sing!==s||!singLive(s))s.wake?.release?.().catch(()=>{});}catch{}
  const tick=()=>{if(sing!==s||!singLive(s))return;const t=Math.min(run.punchRange?.end||s.mr.duration,from+Math.max(0,ctx.currentTime-run.t0));const waiting=ctx.currentTime<run.recordClock;s.state=waiting?'preroll':'singing';s.cursor=t;paintPunchCountdown(s,run);setSingStatus(waiting?`준비 · ${K().punchCountdown(run.recordClock,ctx.currentTime)}초 뒤 녹음 시작`:run.punchRange?'선택 구간 녹음 중':'녹음 중 · 가사 영역을 누르면 일시정지합니다.');drawLyrics(waiting?recordAt:t);s.frame=requestAnimationFrame(tick);};tick();
 }catch(e){releaseRun(run);stream?.getTracks().forEach(t=>t.stop());if(sing===s){s.preparationOpen=preparationOpen;s.micCheck?.error(e);s.run=null;if(s.punchRange){s.punchRange=null;s.punchPage='select';s.editingRecording=false;}paintPunchCountdown(s,null);s.state=s.voice?'review':'idle';renderSingPanel();setSingStatus(e.name==='NotAllowedError'?'마이크 권한을 허용한 뒤 다시 시작해 주세요.':e.message||'녹음을 시작하지 못했습니다.',true);}}
 finally{s.startingRecording=false;s.pendingMic=null;if(sing===s)updateTransport();}
}
function recordingLyricWindow(wheel,row){
 const s=sing,mobile=window.matchMedia?.('(max-width:1023px)').matches&&!s.punchPage&&!s.punchRange&&!$('#sing').classList.contains('is-reviewing');
 if(!mobile){for(const name of ['--record-window-height','--record-window-before','--record-window-after'])wheel.style.removeProperty(name);return null;}
 const rows=Array.from(wheel.querySelectorAll('[data-sing-line]')),index=Math.max(0,rows.indexOf(row)),current=rows[index];if(!current)return null;
 const extent=el=>{const css=getComputedStyle(el);return el.offsetHeight+parseFloat(css.marginTop)+parseFloat(css.marginBottom);},fallback=extent(current);
 const size=i=>rows[i]?extent(rows[i]):fallback;
 const before=size(index-2)+size(index-1),height=before+size(index)+size(index+1)+size(index+2)+size(index+3);
 wheel.style.setProperty('--record-window-height',height+'px');
 wheel.style.setProperty('--record-window-before',(size(0)*2)+'px');
 wheel.style.setProperty('--record-window-after',(size(rows.length-1)*3)+'px');
 // On short screens the same complete lyric list remains scrollable internally.
 return Math.max(0,current.offsetTop-parseFloat(getComputedStyle(current).marginTop)-before*Math.min(1,wheel.clientHeight/height));
}
function drawLyrics(t,follow=true){
 if(!sing)return;const s=sing,review=s.state==='playing'||s.state==='review',duration=review&&s.voice&&s.mode!=='duet'?s.voice.duration:s.mr?.duration||s.data.track.duration,at=K().wordAt(s.data.words||[],t);
 paintBackingKey(s,t);$('#sing-now').textContent=time(Math.max(0,t)).padStart(5,'0');document.querySelectorAll('[data-review-now]').forEach(v=>v.textContent=time(Math.max(0,t)));const reviewSeek=$('.studio-wave-seek');if(reviewSeek)reviewSeek.value=t;drawTakeWaveform();$('#sing-duration').textContent=time(duration).padStart(5,'0');const seek=$('#sing-seek');seek.max=duration;seek.value=Math.min(duration,Math.max(0,t));seek.style.setProperty('--position',(100*Number(seek.value)/Math.max(1,duration))+'%');seek.classList.toggle('duet-seek',s.mode==='duet');
 if(typeof paintPunchPlayback==='function')paintPunchPlayback(s);const wheel=$('#sing-wheel'),row=wheel.querySelector(`[data-sing-line="${at.line}"]`);
 if(s.paintedWheel!==wheel||s.paintedLine!==at.line){s.paintedWheel=wheel;s.paintedLine=at.line;wheel.querySelectorAll('[data-sing-line]').forEach(el=>{el.classList.toggle('current',el===row);el.setAttribute('aria-current',el===row?'true':'false');el.classList.toggle('is-distant',Number(el.dataset.singLine)>at.line+1);if(el!==row)el.querySelectorAll('.sung,.singing').forEach(word=>{word.classList.remove('sung','singing');word.style.removeProperty('--p');});});}
 row?.querySelectorAll('[data-word]').forEach((el,i)=>{el.classList.toggle('sung',i<at.word);el.classList.toggle('singing',i===at.word);el.style.setProperty('--p',i===at.word?at.progress:0);});
 if(follow&&!s.scrubbing&&at.line!==s.shownLine){s.shownLine=at.line;const mobileTop=recordingLyricWindow(wheel,row);if(mobileTop!==null)wheel.scrollTo({top:mobileTop,behavior:singLive(s)?'smooth':'instant'});else if(row)wheel.scrollTop=Math.max(0,row.offsetTop+row.offsetHeight/2-wheel.clientHeight*.3125);}
}
async function finishSinging({discardPunch=false}={}){
 const s=sing;if(!singLive(s))return;const run=s.run,ctx=s.ctx,end=Math.min(run.punchRange?.end||s.mr.duration,run.from+Math.max(0,ctx.currentTime-run.t0));s.state='stopping';cancelAnimationFrame(s.frame);paintPunchCountdown(s,null);updateTransport();setSingStatus('녹음한 구간을 정리하고 있습니다…');
 run.src.onended=null;try{run.src.stop();}catch{}run.monitor.gain.value=0;
 await new Promise(resolve=>{const timer=setTimeout(resolve,600);run.flushed=()=>{clearTimeout(timer);resolve();};run.node.port.postMessage('stop');});releaseRun(run);s.wake?.release?.().catch(()=>{});
 if(sing!==s)return;s.run=null;
 const captured=end>run.recordAt+.1&&run.chunks.length;
 if(run.punchRange){
  s.punchRange=null;s.punchAuthorized=false;s.editingRecording=false;s.state='review';s.cursor=run.recordAt;
  if(!discardPunch&&captured){
   const samples=K().replaceTakeRange(s.voice.getChannelData(0),run.chunks,run.recordClock,ctx.sampleRate,run.recordAt,end),voice=ctx.createBuffer(1,samples.length,ctx.sampleRate);voice.copyToChannel(samples,0);
   s.pendingPunch={voice,range:{start:run.recordAt,end},selection:{...s.punchSelection}};showPunchComplete(s,s.pendingPunch.range);setSingStatus('다시 녹음한 구간을 확인한 뒤 사용할지 선택해 주세요.');
  }else{s.punchPage='select';renderSingPanel();setSingStatus(discardPunch?'구간 녹음을 취소했습니다. 기존 녹음은 유지했습니다.':'녹음된 마이크 입력이 없습니다. 기존 녹음은 유지했습니다.');}return;
 }
 if(!captured){s.state=s.voice?'review':'idle';renderSingPanel();setSingStatus('녹음된 마이크 입력이 없습니다. 기존 녹음은 유지했습니다.');return;}
 const samples=K().mergeTake(s.voice?.getChannelData(0),run.chunks,run.recordClock,ctx.sampleRate,run.recordAt,end);
 if(samples.length){
  s.beforePunch=null;s.editMixBaseline=null;
  const prior=(s.keyEvents||[{at:0,key:run.keyEvents[0].key}]).filter(event=>event.at<run.recordAt);
  const events=prior.concat(run.keyEvents.filter(event=>event.at<end));
  s.keyEvents=events.filter((event,i)=>!i||event.key!==events[i-1].key);
  s.keyMR=null;
  s.voice=ctx.createBuffer(1,samples.length,ctx.sampleRate);s.voice.copyToChannel(samples,0);s.processed=null;}
 refreshVocalGuide(s);renderDuetGuide();s.cursor=s.voice?.duration||run.recordAt;s.state=s.voice?'review':'idle';renderSingPanel();drawLyrics(s.cursor);setSingStatus(`${time(s.voice.duration)} 녹음했습니다. 들어보고 싱크·효과를 조절하세요.`);
 if((run.peak||0)<.00001)setSingStatus('마이크 소리가 감지되지 않았습니다. 선택한 마이크와 음소거 설정을 확인하고 다시 불러 주세요.',true);
}
function studioRangeHTML(m,key,label,min,max,step,unit='%'){
 return `<label class="studio-range"><span><b class="studio-control-name">${['voice','mr','size','echo','room'].includes(key)?studioControlIcon(key):''}${label}</b><output data-mix-label="${key}">${mixLabel(key,m[key])}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${m[key]}" data-mix="${key}" aria-label="${label}"></label>`;
}
function studioControlIcon(key){const shape={voice:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',mr:'<path d="M9 18V5l12-3v13M9 8l12-3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="15" r="3"/>',size:'<path d="M12 2 3 7v10l9 5 9-5V7ZM3 7l9 5 9-5M12 12v10"/>',echo:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',room:'<path d="M4 9v6M8 5v14M12 2v20M16 5v14M20 9v6"/>'}[key]||'';return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">'+shape+'</svg>';}
function soundControlHTML(m,review=false){if(review)return '<div class="studio-sound">'+studioRangeHTML(m,'voice','내 목소리',0,2,.01)+studioRangeHTML(m,'mr',sing?.parent?'먼저 녹음한 목소리 + 반주':'반주',0,1.5,.01)+'</div>';return `<div class="studio-sound"><h3>소리 크기</h3>${studioRangeHTML(m,'voice','내 목소리',0,2,.01)}${studioRangeHTML(m,'mr',sing?.parent?'먼저 녹음한 목소리 + 반주':'반주',0,1.5,.01)}<div class="studio-noise"><h3>잡음 제거</h3>${studioRangeHTML(m,'noise','잡음 제거 단계',0,4,1)}<div class="studio-ticks">${['끄기','1 약','2 보통','3 강','4 최대'].map(t=>`<span>${t}</span>`).join('')}</div></div></div>`;}
const roomControlHTML=m=>`<section class="studio-reverb"><h3>리버브 추천 설정</h3><div class="sing-presets" role="group" aria-label="목소리 효과 선택">${K().vocalPresets.map(p=>`${vocalPresetButtonHTML(p.id,p.name,m.preset===p.id)}`).join('')}${vocalPresetButtonHTML('custom','사용자 설정',m.preset==='custom')}</div><p class="field-help" data-preset-description></p><div data-preset-strength>${studioRangeHTML(m,'strength','프리셋 강도',0,1,.01)}</div><details class="sing-effect-details" data-custom-controls><summary>리버브 조절 · 사용자 설정</summary>${studioRangeHTML(m,'size','룸 크기',0,1,.01)}${studioRangeHTML(m,'echo','에코 크기',0,.65,.01)}${studioRangeHTML(m,'room','리버브 강도',0,1,.01)}<details class="studio-advanced"><summary>음색 보정</summary>${studioRangeHTML(m,'tone','음색 보정',-1,2,.01)}</details></details></section>`;
function postRoomControlHTML(m){return '<section class="studio-reverb studio-post-reverb"><p>적용된 리버브 효과를 확인하고 조절해 보세요.</p><h4>추천 설정</h4><div class="sing-presets" role="group" aria-label="목소리 효과 선택">'+K().vocalPresets.map(p=>vocalPresetButtonHTML(p.id,p.name,m.preset===p.id)).join('')+vocalPresetButtonHTML('custom','사용자 설정',m.preset==='custom')+'</div><div data-post-custom>'+studioRangeHTML(m,'size','룸 크기',0,1,.01)+studioRangeHTML(m,'echo','에코 크기',0,.65,.01)+studioRangeHTML(m,'room','효과 강도',0,1,.01)+'</div><div data-preset-strength>'+studioRangeHTML(m,'strength','효과 강도',0,1,.01)+'</div><details class="studio-tone"><summary>음색 보정</summary>'+studioRangeHTML(m,'tone','음색 보정',-1,2,.01)+'</details></section>';}
const reviewHTML=m=>recordingEditorHTML(sing,m);

function openSingSettings(){
 if(sing&&!$('#sing .sing-recording').hidden){openRecordingSettings();return;}
 const s=sing;if(!s||singBusy(s))return;const before=structuredClone(s.mix);let applied=false;s.settingsOpen=true;
 dialog(`<div class="studio-settings"><h2>세부 설정</h2><div class="studio-tabs" role="tablist" aria-label="세부 설정"><button type="button" role="tab" data-studio-tab="sound" aria-selected="true" aria-controls="studio-sound-panel">${icon('sliders')} 소리 조절</button><button type="button" role="tab" data-studio-tab="reverb" aria-selected="false" aria-controls="studio-reverb-panel">${studioIcon('headphones')} 리버브</button></div><div class="studio-settings-body"><section id="studio-sound-panel" role="tabpanel">${soundControlHTML(s.mix)}</section><section id="studio-reverb-panel" role="tabpanel" hidden>${roomControlHTML(s.mix)}</section></div><button type="button" class="primary-button studio-apply" data-settings-apply>적용하기</button></div>`);
 const dlg=$('#dialog');dlg.classList.add('record-settings-dialog');bindMixControls();
 const selectTab=button=>{[...document.querySelectorAll('#dialog [data-studio-tab]')].forEach(b=>{const selected=b===button;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;$('#studio-'+b.dataset.studioTab+'-panel').hidden=!selected;});};
 [...document.querySelectorAll('#dialog [data-studio-tab]')].forEach(b=>{b.onclick=()=>selectTab(b);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const next=[...document.querySelectorAll('#dialog [data-studio-tab]')].find(v=>v!==b);selectTab(next);next.focus();}};});
 $('[data-settings-apply]').onclick=()=>{applied=true;dlg.close();};
 dlg.addEventListener('close',()=>{dlg.classList.remove('record-settings-dialog');s.settingsOpen=false;if(sing===s){if(!applied){s.mix=before;applyMixChange('preset');}else queueSingDraft(s);refreshEffectControls();}},{once:true});
}
function drawTakeWaveform(){
 const s=sing,canvas=$('#take-waveform');if(!s?.voice||!canvas||$('#sing-panel').hidden)return;
 const total=s.mode==='duet'?(s.mr?.duration||s.data.track.duration):s.voice.duration,bins=400,rect=canvas.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width*devicePixelRatio)),now=performance.now();if(!total||!rect.width)return;
 if(!s.wavePeaks||s.waveSource!==s.voice||s.waveDuration!==total){const data=s.voice.getChannelData(0);s.wavePeaks=new Float32Array(bins);for(let i=0;i<bins;i++){const begin=Math.floor(i*total*s.voice.sampleRate/bins),end=Math.min(data.length,Math.floor((i+1)*total*s.voice.sampleRate/bins));for(let j=begin;j<end;j+=Math.max(1,Math.floor((end-begin)/256)))s.wavePeaks[i]=Math.max(s.wavePeaks[i],Math.abs(data[j]));}s.waveSource=s.voice;s.waveDuration=total;}
 if(s.waveCanvas===canvas&&canvas.width===width&&now-(s.waveDrawAt||0)<80&&Math.abs(s.cursor-(s.waveCursor||0))<.2)return;s.waveCanvas=canvas;s.waveDrawAt=now;s.waveCursor=s.cursor;if(canvas.width!==width)canvas.width=width;
 if(!canvas.dataset.bound){canvas.dataset.bound='1';canvas.tabIndex=0;canvas.setAttribute('role','slider');canvas.setAttribute('aria-valuemin','0');canvas.setAttribute('aria-valuemax',String(total));canvas.setAttribute('aria-label','녹음 재생 위치');const seek=e=>{const r=canvas.getBoundingClientRect(),at=Math.max(0,Math.min(total,(e.clientX-r.left)/r.width*total));sing.compareFrom=at;if(sing.state==='playing')previewMix(at);else{sing.cursor=at;drawLyrics(at);}};canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);seek(e);};canvas.onpointermove=e=>{if(e.buttons)seek(e);};canvas.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const at=Math.max(0,Math.min(total,sing.cursor+(e.key==='ArrowRight'?1:-1)));sing.compareFrom=at;if(sing.state==='playing')previewMix(at);else{sing.cursor=at;drawLyrics(at);}}};}canvas.setAttribute('aria-valuenow',String(s.cursor));
 if(s.waveRolesFor!==s.duetGuide||s.waveRolesVoice!==s.voice||!s.waveRoles){s.waveRolesFor=s.duetGuide;s.waveRolesVoice=s.voice;const words=s.data.words||[],intervals=words.map((_,i)=>({...AifectDuetGuide.lineInterval(words,i,total),role:AifectDuetGuide.lineRole(AifectDuetGuide.linePart(s.duetGuide,words,i,total),!!s.parent)}));let j=0;s.waveRoles=Array.from({length:bins},(_,i)=>{const t=(i+.5)*total/bins;while(j+1<intervals.length&&intervals[j+1].s<=t)j++;const l=intervals[j];return s.mode!=='duet'?'mine':l&&t>=l.s&&t<l.e?l.role:'';});}
 const ctx=canvas.getContext('2d'),step=width/bins,height=canvas.height,mid=height/2;ctx.clearRect(0,0,width,height);ctx.strokeStyle='#254253';ctx.lineWidth=1;for(let i=0;i<=12;i++){ctx.beginPath();ctx.moveTo(i*width/12,0);ctx.lineTo(i*width/12,height);ctx.stroke();}for(let i=0;i<bins;i++){ctx.strokeStyle=({mine:'#e6a2c4',partner:'#8eddd2',both:'#d4d8e1'})[s.waveRoles[i]]||'#738497';ctx.lineWidth=Math.max(1,step*.5);const h=Math.max(1,Math.sqrt(s.wavePeaks[i])*mid*.85);ctx.beginPath();ctx.moveTo((i+.5)*step,mid-h);ctx.lineTo((i+.5)*step,mid+h);ctx.stroke();}if(s.abEnabled){const r=reviewRange(s);ctx.fillStyle='rgba(174,235,223,.12)';ctx.fillRect(width*r.start/total,0,width*(r.end-r.start)/total,height);}
 ctx.strokeStyle='#f2a1c6';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(width*s.cursor/total,0);ctx.lineTo(width*s.cursor/total,height);ctx.stroke();
}

function mixLabel(key,value){return key==='tone'?(value===0?'원음':`${value>0?'+':''}${Math.round(value*100)}%`):key==='offset'?`${value}ms`:key==='noise'?(value===0?'끄기':`${value}단계`):key==='echo'?`${(value*100).toFixed(1)}%`:`${Math.round(value*100)}%`;}
function renderSingPanel(){
 if(sing&&!canEditPaid())sing.mix.tone=0;
 if(renderPunchPage(sing)){updateTransport();return;}
 $('#sing-panel').innerHTML=sing.voice?reviewHTML(sing.mix):singStartHTML();bindMixControls();if(sing.voice){bindReview();bindStudioEditor();const seek=$('.studio-wave-seek');if(seek)seek.oninput=()=>{const at=Number(seek.value);sing.compareFrom=at;if(sing.state==='playing')previewMix(at);else{sing.cursor=at;drawLyrics(at);} };drawTakeWaveform();}updateTransport();
}
function refreshEffectControls(){
 const m=sing.mix;document.querySelectorAll('[data-post-custom]').forEach(v=>v.hidden=m.preset!=='custom');document.querySelectorAll('[data-custom-controls]').forEach(v=>{if(!v.closest('.studio-editor-inspector'))v.open=m.preset==='custom';});document.querySelectorAll('[data-preset-strength]').forEach(v=>v.hidden=m.preset==='custom');document.querySelectorAll('[data-vocal-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.vocalPreset===m.preset)));
 document.querySelectorAll('[data-mix]').forEach(input=>{const k=input.dataset.mix;input.value=m[k]??.5;input.style.setProperty('--position',100*(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))+'%');document.querySelectorAll('[data-mix-label="'+k+'"]').forEach(v=>v.textContent=k==='tone'&&v.closest('[data-post-custom]')&&v.closest('#sing-live-settings,.recording-settings')?Math.round((Number(input.value)+1)/3*100)+'%':mixLabel(k,m[k]??.5));input.disabled=singBusy(sing)||k==='tone'&&!canEditPaid()||k==='partner'&&!sing.partnerStem||k==='strength'&&['original','custom'].includes(m.preset);});
 document.querySelectorAll('[data-vocal-tone]').forEach(b=>{b.setAttribute('aria-pressed',String(Number(b.dataset.vocalTone)===m.tone));b.disabled=singBusy(sing)||!canEditPaid();});
 document.querySelectorAll('[data-vocal-noise]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.vocalNoise)===m.noise)));
 document.querySelectorAll('[data-preset-description]').forEach(note=>note.textContent=K().vocalPresets.find(p=>p.id===m.preset)?.description||'사용자 설정 · 직접 조절한 효과를 사용하고 있습니다.');
}
function applyMixChange(key){const s=sing;if(!s.settingsOpen)queueSingDraft(s);s.run?.effects?.update(s.mix);if(s.standbyMonitor){s.standbyMonitor.effects.update?.(s.mix);s.standbyMonitor.gain?.gain.setTargetAtTime(s.mix.voice,s.ctx.currentTime,.015);}if(s.run){s.run.voiceGain.gain.setTargetAtTime(s.mix.voice,s.ctx.currentTime,.015);s.run.gain.gain.setTargetAtTime(s.mix.mr,s.ctx.currentTime,.015);}if(s.state==='backing')s.previewMixUpdate?.(s.mix);if(s.state==='playing'){if(key==='offset'||key==='reset')previewMix(s.ctx.currentTime-s.previewAt,s.previewUntil??Infinity);else{s.previewMixUpdate?.(s.mix);if(!['voice','mr','partner'].includes(key))refreshPreviewEffects(s);}}if(key==='offset'){refreshVocalGuide(s);renderDuetGuide();}refreshEffectControls();}
const recordingSpaceFields=['preset','strength','presetStrengths','custom','echo','room','size','tone','noise','roomScaleVersion'];
function preferredRecordingMix(owner){
 const base=K().defaultVocalMix();
 try{
  const saved=JSON.parse(localStorage.getItem('aifect-recording-space:'+owner));
  if(!saved||!['custom',...K().vocalPresets.map(p=>p.id)].includes(saved.preset))return base;
  const space=Object.fromEntries(recordingSpaceFields.filter(key=>key in saved).map(key=>[key,saved[key]]));
  return {...base,...K().restoreVocalMix({...base,...space})};
 }catch{return base;}
}
function rememberRecordingSpace(control){
 if(!control.closest('#sing-live-settings,.recording-settings'))return;
 const settings=Object.fromEntries(recordingSpaceFields.map(key=>[key,sing.mix[key]]));
 try{localStorage.setItem('aifect-recording-space:'+sing.owner,JSON.stringify(settings));}catch{}
}
function spacePreset(m,id,strength){
 const presetStrengths={...m.presetStrengths,[m.preset]:m.strength};
 const level=strength??presetStrengths[id]??(id==='original'?m.strength:.5);
 const next=K().presetMix(m,id,level);
 return {...next,presetStrengths,tone:canEditPaid()?(id==='custom'?next.tone:m.tone):0};
}
function bindMixControls(){
 document.querySelectorAll('[data-vocal-tone]').forEach(button=>button.onclick=()=>{if(singBusy(sing)||!canEditPaid())return;sing.mix=K().editVocalMix(sing.mix,'tone',Number(button.dataset.vocalTone));applyMixChange('tone');});
 document.querySelectorAll('[data-vocal-preset]').forEach(button=>button.onclick=()=>{if(singBusy(sing))return;sing.mix=spacePreset(sing.mix,button.dataset.vocalPreset);rememberRecordingSpace(button);applyMixChange('preset');});
 document.querySelectorAll('[data-vocal-noise]').forEach(button=>button.onclick=()=>{if(singBusy(sing))return;sing.mix=K().editVocalMix(sing.mix,'noise',Number(button.dataset.vocalNoise));applyMixChange('noise');});
 document.querySelectorAll('[data-mix]').forEach(input=>input.oninput=()=>{if(singBusy(sing))return;const s=sing,k=input.dataset.mix;if(k==='tone'&&!canEditPaid()||k==='partner'&&!s.partnerStem)return;if(k==='strength')s.mix=spacePreset(s.mix,s.mix.preset,Number(input.value));else s.mix=K().editVocalMix(s.mix,k,Number(input.value));if(recordingSpaceFields.includes(k))rememberRecordingSpace(input);applyMixChange(k);});
 refreshEffectControls();
}
function bindReview(){
 const form=$('#sing-upload-form');bindWorkPhoto(form,sing);form.addEventListener('invalid',()=>{const section=form.querySelector('.studio-publication');if(section)section.open=true;},true);form.elements.description.value=sing.description||'';form.elements.description.oninput=()=>{sing.description=form.elements.description.value;queueSingDraft(sing);};form.onsubmit=busyForm(form,uploadSung);
}
function voiceBuffer(s){
 const source=vocalPlaybackBuffer(s);
 if(s.mix.preset==='original')return source;
 const key=vocalEffectKey(s.mix);if(s.processed?.key===key&&s.processed.source===source)return s.processed.buffer;
 const buffer=s.ctx.createBuffer(1,source.length,source.sampleRate);buffer.copyToChannel(K().renderVocals(source.getChannelData(0),source.sampleRate,s.mix),0);s.processed={key,source,buffer};return buffer;
}
function connectEffects(ctx,source,destination,m){
 const fx=new AudioWorkletNode(ctx,'aifect-vocal',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit',processorOptions:{mix:m,recording:true}});source.connect(fx).connect(destination);const nodes=[fx];nodes.update=m=>fx.port.postMessage(m);return nodes;
}
function protectOutput(ctx,connect=true){const c=ctx.createDynamicsCompressor();c.threshold.value=-3;c.knee.value=0;c.ratio.value=20;c.attack.value=.001;c.release.value=.08;if(connect)c.connect(ctx.destination);return c;}
function scheduleMix(ctx,from,at,s=sing,until=Infinity){
 const end=Math.min(s.mode==='duet'?s.mr.duration:s.voice.duration,until),remaining=end-from;if(remaining<=0)throw new Error('다시 들을 위치를 골라 주세요.');
 const m=s.mix,shift=m.offset/1000,g={mr:ctx.createGain(),voice:ctx.createGain()},offline=typeof ctx.startRendering==='function';g.mr.gain.value=m.mr;g.voice.gain.value=m.voice;
 const nodes=[g.mr,g.voice],master=offline?ctx.destination:protectOutput(ctx, false);
 if(!offline){const listen=ctx.createGain();listen.gain.value=s.listenVolume??1;master.connect(listen).connect(ctx.destination);s.previewListen=listen;nodes.push(master,listen);}
 g.mr.connect(master);g.voice.connect(master);
 const a=ctx.createBufferSource();a.buffer=s.instrumentStem?(s.keyMR?.instrument||s.instrumentStem):backingBuffer(s);a.connect(g.mr);a.start(at,from,remaining);const sources=[a];let activeGain;
 const addVoice=(buffer,start,position,fade=false)=>{
  const b=ctx.createBufferSource(),gain=ctx.createGain();b.buffer=buffer;b.connect(gain).connect(g.voice);nodes.push(gain);
  const v=position+shift,delay=Math.max(0,-v),available=Math.min(end-position-delay,s.voice.duration-Math.max(0,v));
  if(available<=0){gain.disconnect();return;}
  const old=activeGain?sources[1]:null,oldGain=activeGain;
  if(fade){gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(1,start+.025);if(old&&oldGain){oldGain.gain.cancelScheduledValues(start);oldGain.gain.setValueAtTime(1,start);oldGain.gain.linearRampToValueAtTime(0,start+.025);try{old.stop(start+.026);}catch{}old.onended=()=>{old.disconnect();oldGain.disconnect();const i=nodes.indexOf(oldGain);if(i>=0)nodes.splice(i,1);};}}
  b.start(start+delay,Math.max(0,v),available);sources[1]=b;activeGain=gain;
 };
 // Review playback and export consume the identical pre-rendered vocal samples.
 // The audio rendering thread only mixes buffers; the mic monitor keeps its live DSP.
 addVoice(voiceBuffer(s),at,from);
 let partnerGain;if(s.partnerStem){partnerGain=ctx.createGain();partnerGain.gain.value=m.partner??1;const partner=ctx.createBufferSource();partner.buffer=s.keyMR?.partner||s.partnerStem;partner.connect(partnerGain).connect(master);partner.start(at,from,remaining);if(sources.length<2)sources.push(null);sources.push(partner);nodes.push(partnerGain);}
 return {sources,nodes,replaceVoice:buffer=>{const start=ctx.currentTime+.01,position=from+start-at;if(position<end)addVoice(buffer,start,position,true);},updateMix:m=>{partnerGain?.gain.setTargetAtTime(m.partner??1,ctx.currentTime,.015);g.mr.gain.setTargetAtTime(m.mr,ctx.currentTime,.015);g.voice.gain.setTargetAtTime(m.voice,ctx.currentTime,.015);}};
}
function stopPreview(){
 const s=sing;if(!s)return;if(s.previewAt!=null)s.cursor=clampPosition(s.ctx.currentTime-s.previewAt,s.state==='playing');
 const sources=s.preview;s.previewPitch?.close();s.previewPitch=null;s.previewListen=null;s.previewMixUpdate=null;s.previewReplaceVoice=null;cancelVocalEffects(s);s.preview=null;s.previewAt=null;sources?.forEach(n=>{if(!n)return;n.onended=null;try{n.stop();}catch{}});s.previewNodes?.forEach(n=>n.disconnect());s.previewNodes=null;cancelAnimationFrame(s.frame);
 if(['playing','guide','backing'].includes(s.state))s.state=s.voice?'review':'idle';
}
function runPreview(s,sources,at,from,mode,nodes=[]){
 s.preview=sources;s.previewNodes=nodes;s.previewAt=at-from;s.state=mode;updateTransport();
 sources[0].onended=()=>{if(sing===s&&s.preview===sources){const repeat=s.state==='playing'&&s.abEnabled&&!s.punchPage&&s.editorStep!==2;stopPreview();updateTransport();drawLyrics(s.cursor);if(repeat)void previewMix(reviewRange(s).start);}};
 const tick=()=>{if(sing!==s||s.preview!==sources)return;s.cursor=Math.max(0,s.ctx.currentTime-s.previewAt);drawLyrics(s.cursor);s.frame=requestAnimationFrame(tick);};tick();
}
async function previewMix(from=0,until=Infinity){
 const s=sing;if(!s?.voice||singLive(s)||singBusy(s))return;if(!canEditPaid())s.mix.tone=0;
 const request=s.previewRequest=(s.previewRequest||0)+1;
 try{await prepareSing(s);if(sing!==s||request!==s.previewRequest)return;stopPreview();s.state='rendering';updateTransport();setSingStatus('미리 듣기 소리를 준비하고 있습니다…');await prepareVocalEffects(s);if(sing!==s||request!==s.previewRequest)return;s.state='review';s.ctx.resume();const duration=reviewDuration(s);from=Math.max(0,from>=duration-.02?0:from);if(s.abEnabled&&!s.punchPage&&s.editorStep!==2){const r=reviewRange(s);from=from<r.start||from>=r.end-.02?r.start:from;until=r.end;}until=Math.min(duration,until);if(from>=until){updateTransport();return;}const at=s.ctx.currentTime+.05,mix=scheduleMix(s.ctx,from,at,s,until);runPreview(s,mix.sources,at,from,'playing',mix.nodes);s.previewUntil=until;s.previewMixUpdate=mix.updateMix;s.previewReplaceVoice=mix.replaceVoice;setSingStatus('녹음 들어보기 · 위치를 옮겨도 재생이 이어집니다.');}
 catch(e){if(sing===s&&request===s.previewRequest){stopPreview();s.state='review';updateTransport();setSingStatus(e.message||'녹음을 재생하지 못했습니다. 다시 시도해 주세요.');}}
}

async function previewGuide(from=sing?.cursor||0){
 const s=sing;if(!s||singLive(s)||singBusy(s))return;stopPreview();++playSerial;window.AifectAudioAds?.cancel();audio.pause();s.state='loading';updateTransport();setSingStatus('원곡 가이드를 불러오고 있습니다…');
 try{const ctx=await prepareSing(s,true);if(!s.guide){const r=await fetch(`/media/${encodeURIComponent(s.id)}/stream`,{credentials:'same-origin',signal:s.abort?.signal});if(!r.ok)throw new Error('원곡 가이드를 불러오지 못했습니다.');s.guide=await ctx.decodeAudioData(await r.arrayBuffer());}if(sing!==s)return;const src=ctx.createBufferSource();src.buffer=s.guide;from=Math.max(0,Math.min(from,s.guide.duration-.05));const at=ctx.currentTime+.05;s.previewPitch=connectLiveBacking(s,src,ctx.destination,at,from,s.guide.duration-from);src.start(at,from);runPreview(s,[src],at,from,'guide');setSingStatus('원곡 가이드 · 일시정지 후 가사를 골라 그 위치부터 불러 보세요.');}
 catch(e){if(sing===s){s.state=s.voice?'review':'idle';updateTransport();setSingStatus(e.message||'원곡을 불러오지 못했습니다.');}}
}
async function renderSung(s,onProgress,publicationMode=s.mode){
 if(!canEditPaid())s.mix.tone=0;
 await prepareSing(s);await prepareVocalEffects(s);
 const rate=K().MIX_RATE,length=Math.ceil((publicationMode==='duet'?s.mr.duration:s.voice.duration)*rate),off=new OfflineAudioContext(2,length,rate);scheduleMix(off,0,0,{...s,mode:publicationMode});const out=await off.startRendering();const channels=[out.getChannelData(0),out.getChannelData(1)],top=K().peak(channels);let highest=top;if(publicationMode==='duet'&&!s.parent){const backing=backingBuffer(s);highest=Math.max(top,K().peak(Array.from({length:backing.numberOfChannels},(_,i)=>backing.getChannelData(i)))*s.mix.mr,K().peak([voiceBuffer(s).getChannelData(0)])*s.mix.voice);}
 s.exportScale=highest>.96?.96/highest:1;if(s.exportScale<1)for(const c of channels)for(let i=0;i<c.length;i++)c[i]*=s.exportScale;return encodeCoverMp3(out,{signal:s.abort?.signal,onProgress});
}
async function saveSung(){
 const s=sing;if(!s?.voice||singBusy(s)||singLive(s))return;stopPreview();s.state='exporting';updateTransport();setSingStatus('부른 구간을 파일로 만들고 있습니다…');
 try{const file=await renderSung(s,p=>{if(sing===s)setSingStatus('고음질 MP3로 변환 중 '+Math.round(p*100)+'%');});if(sing!==s)return;const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=`AIFECT-cover-${s.id}.mp3`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setSingStatus('녹음 파일을 저장했습니다.');}catch(e){if(sing===s)setSingStatus(e.message||'파일을 저장하지 못했습니다.');}finally{if(sing===s){s.state='review';updateTransport();}}
}
function coverPublicationHTML(s){
 return s.parent?'<p class="field-help">공개 종류: 완성 듀엣 · 함께 녹음한 두 사람의 작품으로 공개합니다.</p><input type="hidden" name="publish_as" value="duet_complete">':`<label class="form-field">공개 종류<select name="publish_as" required><option value="">공개할 종류를 선택해 주세요</option><option value="solo">솔로 커버 · 내 녹음으로 완성</option><option value="duet_invitation">듀엣 참여 모집 · 다른 사람이 이어 부르기</option></select></label><p class="field-help">녹음 모드와 별도로 선택합니다. 솔로 커버는 둘러보기, 듀엣 모집은 참여 목록에 표시됩니다.</p>`;
}
function coverPublication(s,fd){
 const kind=fd.get('publish_as');
 if(!['solo','duet_invitation','duet_complete'].includes(kind)||Boolean(s.parent)!==(kind==='duet_complete'))throw new Error('공개할 종류를 선택해 주세요. 다른 사람의 녹음에 참여한 작품은 완성 듀엣으로 공개합니다.');
 if(kind==='duet_invitation'&&!fd.has('duet_consent'))throw new Error('듀엣 참여 모집은 다른 사람이 이어 부르는 것에 동의해 주세요.');
 const mode=kind==='solo'?'solo':'duet',guide=kind==='duet_invitation'?(s.mode==='duet'?s.duetGuide:{version:1,mode:'free',lines:[]}):undefined;
 if(guide?.mode==='free'&&s.voice)guide.activity=AifectDuetGuide.detectVocalActivity(s.voice.getChannelData(0),s.voice.sampleRate,s.mix.offset,s.mr?.duration||s.data.track.duration);
 return {publish_as:kind,cover_mode:mode,duet_slot:kind==='solo'?'':s.parent?'second':'first',duet_parent_id:s.parent||null,duet_consent:kind==='duet_invitation',duet_guide:guide};
}
async function uploadSung(fd){
 const s=sing;if(!s?.voice||singBusy(s)||singLive(s))return;const publication=coverPublication(s,fd),form=$('#sing-upload-form');if(form._photoError)throw Error(form._photoError);
 s.publishRequest??=crypto.randomUUID();const photo=s.coverFile;
 stopPreview();s.state='exporting';updateTransport();
 const progress=$('#sing-upload-form .upload-progress'),note=progress.querySelector('p');progress.hidden=false;note.textContent='부른 구간을 합치고 있습니다…';
 try{
  refreshVocalGuide(s);const file=await renderSung(s,p=>{if(sing===s)note.textContent='고음질 MP3로 변환 중 '+Math.round(p*100)+'%';},publication.cover_mode);if(sing!==s)return;
  const draft=await api('/api/covers','POST',{request_id:s.publishRequest,original_id:s.id,...publication,description:fd.get('description')||'',own_voice:fd.has('own_voice'),rights:fd.has('rights'),extension:'mp3',bytes:file.size});
  if(draft.cover_mode!==publication.cover_mode||draft.publish_as!==publication.publish_as||(draft.duet_parent_id||null)!==publication.duet_parent_id)throw new Error('저장된 공개 종류가 선택과 달라 업로드를 중단했습니다. 녹음은 그대로 보관됩니다.');
  let completed={};
  if(!['published','processing','queued'].includes(draft.status)){
   await uploadFile(`/api/uploads/${draft.id}/audio`,file,value=>{progress.querySelector('progress').value=value;note.textContent=`올리는 중 ${Math.round(value)}%`;});
   if(publication.publish_as==='duet_invitation')await uploadDuetStems(s,draft.id,v=>{note.textContent='듀엣 트랙 저장 중 '+Math.round(v*100)+'%';});
   if(photo){note.textContent='커버사진을 저장하고 있습니다.';await uploadFile(`/api/uploads/${draft.id}/cover`,photo,undefined,{allowFallback:true});}
   else if(draft.has_cover)await api(`/api/studio/tracks/${draft.id}/image`,'DELETE');
   completed=await api(`/api/uploads/${draft.id}/complete`,'POST');
  }
  if(sing!==s)return;await removeSingDraft(s);s.dirty=false;cleanupSing();toast('커버곡을 올렸습니다! 변환이 끝나면 공개됩니다.');location.hash='studio';if(completed.show_upload_ad)window.AifectUploadAds?.afterCoverUpload(draft.id);
 }finally{if(sing===s){s.state='review';updateTransport();}}
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-sing-start],[data-sing-stop],[data-sing-preview],[data-sing-pause],[data-sing-guide],[data-sing-save],[data-sing-settings],[data-sing-redo]');if(!el||!sing)return;
 if(el.hasAttribute('data-sing-start')){if(singLive(sing)){sing.editingRecording=true;finishSinging();}else startSinging();}else if(el.hasAttribute('data-sing-stop')){sing.editingRecording=false;if(singLive(sing))finishSinging();else renderSingPanel();}else if(el.hasAttribute('data-sing-preview'))previewMix(el.hasAttribute('data-full-preview')?0:sing.cursor);else if(el.hasAttribute('data-sing-pause')){if(singLive(sing)){sing.editingRecording=true;finishSinging();}else{stopPreview();updateTransport();drawLyrics(sing.cursor);setSingStatus('일시정지했습니다.');}}else if(el.hasAttribute('data-sing-guide'))previewGuide();else if(el.hasAttribute('data-sing-save'))saveSung();else if(el.hasAttribute('data-sing-settings'))openSingSettings();else if(el.hasAttribute('data-sing-redo')){void restartSinging().then(restarted=>{if(restarted)$('#sing')?.scrollIntoView({block:'start'});});}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(sing){sing.micCheck?.setBusy(false);sing.monitorSerial=(sing.monitorSerial||0)+1;stopStandbyMonitor(sing);const input=$('#sing-monitor');if(input)input.checked=false;document.querySelectorAll('[data-monitor-toggle]').forEach(b=>b.setAttribute('aria-pressed','false'));}if(sing?.state==='backing'){stopPreview();updateTransport();}if(singLive(sing)){sing.editingRecording=true;finishSinging();}}});
window.addEventListener?.('beforeunload',e=>{if(singExitKind(sing)||sing?.state==='exporting'){e.preventDefault();e.returnValue='';}});

function duetLobbyHTML(tracks){return `<section class="surface duet-lobby"><h2>커버 둘러보기</h2><p class="field-help">다른 사람의 솔로·듀엣 커버를 들어보세요.</p><div class="cover-browse-links"><a class="small-button" href="#community/covers?mode=solo">솔로 커버 듣기</a><a class="small-button" href="#community/covers?mode=duet">듀엣 커버 듣기</a></div><h2>참여를 기다리는 듀엣</h2>${tracks.length?tracks.map(t=>`<div class="duet-invitation">${cover(t,'mini-cover')}<div><a href="#song/${esc(t.id)}"><strong>${esc(t.title)}</strong></a><p>${trackNickname(t,'producer')} · 먼저 녹음한 목소리</p></div><a class="primary-button" href="${t.user_id===me?.id?'#song/'+esc(t.id):'#sing/'+esc(t.original_id)+'?duet='+esc(t.id)}">${t.user_id===me?.id?'내 듀엣 보기':'듀엣 참여'}</a></div>`).join(''):'<p class="empty-note">아직 참여를 기다리는 듀엣이 없습니다. 아래 곡을 골라 첫 파트를 남겨 보세요.</p>'}</section>`;}
function duetTime(seconds){const n=Math.round(Math.max(0,seconds)*10);return Math.floor(n/600)+':'+String(Math.floor(n%600/10)).padStart(2,'0')+'.'+n%10;}
function refreshVocalGuide(s){if(s)s.waveRoles=null;if(s?.mode==='duet'&&!s.parent&&s.voice&&s.duetGuide?.mode==='free')s.duetGuide.activity=AifectDuetGuide.detectVocalActivity(s.voice.getChannelData(0),s.voice.sampleRate,s.mix.offset,s.mr?.duration||s.data.track.duration);}
function duetRoleLabel(part,second=false){return part==='both'?'함께':part==='A'?(second?'상대 파트':'내 파트'):part==='B'?(second?'내 파트':'상대 파트'):part==='partial'?'일부 빈 구간':'미지정';}
function duetAssignmentIssue(s){
 if(s?.mode!=='duet'||s.parent||s.duetGuide?.mode!=='lyrics')return '';
 const lines=s.data.words.map((_,i)=>s.duetGuide.lines?.[i]||''),missing=lines.filter(p=>!['A','B','both'].includes(p)).length;
 if(missing)return '아직 '+missing+'줄의 파트가 비어 있습니다. 아래에서 선택해 주세요.';
 if(!lines.length||!lines.some(p=>p==='A'||p==='both')||!lines.some(p=>p==='B'||p==='both'))return '내 파트와 파트너가 부를 파트를 모두 지정해 주세요.';
 return '';
}
function duetLegendHTML(mode){return '<div class="duet-color-key"'+(mode?' data-sing-part-legend'+(mode==='duet'?'':' hidden'):'')+' aria-label="듀엣 파트 색상"><span data-role="mine"><i></i>내 파트</span><span data-role="partner"><i></i>상대 파트</span><span data-role="both"><i></i>함께</span></div>';}
function renderDuetGuide(){
 const s=sing,host=$('#duet-guide');if(!s||!host)return;host.innerHTML='';
 document.querySelectorAll('[data-sing-part-legend]').forEach(legend=>legend.hidden=s.mode!=='duet');
 if(s.mode!=='duet'){
  document.querySelectorAll('[data-sing-line]').forEach((row,i)=>{
   row.querySelector('.duet-line-badge')?.remove();row.querySelector('.duet-line-mic')?.remove();delete row.dataset.partRole;
   const line=s.data.words[i];if(line)row.setAttribute('aria-label',time(line.s)+' '+line.w.map(word=>word.t).join(' '));
  });
  updateSingPreparation();return;
 }
 const second=!!s.parent,guide=s.duetGuide,words=s.data.words||[],duration=s.mr?.duration||s.data.track.duration;
 host.innerHTML='<button type="button" class="small-button" data-duet-editor>'+(second?'파트 보기':'파트 나누기')+'</button>';
 host.querySelector('[data-duet-editor]').onclick=openDuetEditor;
 document.querySelectorAll('[data-sing-line]').forEach((row,i)=>{
  row.querySelector('.duet-line-badge')?.remove();row.querySelector('.duet-line-mic')?.remove();
  const p=AifectDuetGuide.linePart(guide,words,i,duration),role=AifectDuetGuide.lineRole(p,second);row.dataset.partRole=role;row.setAttribute('aria-label',time(words[i].s)+' '+duetRoleLabel(p,second)+' '+words[i].w.map(w=>w.t).join(' '));

 });
 updateTransport();
}
function duetEditorDraft(s){
 const draft={...s,duetGuide:JSON.parse(JSON.stringify(s.duetGuide||{version:1,mode:'free',lines:[]}))};
 // A fresh manual editor starts without guessing the singers from the audio.
 if(!s.parent&&s.data.words?.length&&!draft.duetGuide.activity&&!draft.duetGuide.lines?.some(Boolean))draft.duetGuide.mode='lyrics';
 return draft;
}
function duetEditorHTML(s){
 const second=!!s.parent,guide=s.duetGuide,words=s.data.words||[],duration=s.mr?.duration||s.data.track.duration;
 const modes=second?'':'<div class="duet-methods" role="tablist" aria-label="파트 나누는 방법">'+[['lyrics','가사별로 지정'],['random','랜덤 지정']].map(([id,label])=>'<button type="button" role="tab" data-duet-method="'+id+'" aria-selected="'+((s.duetEditorMode||'lyrics')===id)+'" aria-pressed="'+((s.duetEditorMode||'lyrics')===id)+'"'+(!words.length?' disabled':'')+'>'+label+'</button>').join('')+'</div>';
 const brush=s.duetBrush||'A';
 const brushes=second?'':'<div class="duet-brushes" role="group" aria-label="지정할 파트">'+[['A','내 파트','mine'],['B','상대 파트','partner'],['both','함께 부르기','both']].map(([value,label,role])=>'<button type="button" data-duet-brush="'+value+'" data-part-role="'+role+'" aria-pressed="'+(brush===value)+'">'+label+'</button>').join('')+'</div>';
 const rows=words.map((line,i)=>{const part=AifectDuetGuide.linePart(guide,words,i,duration),role=AifectDuetGuide.lineRole(part,second),text=line.w.map(w=>w.t).join(' ');return '<button type="button" role="checkbox" aria-checked="'+!!part+'" class="duet-edit-line" data-edit-line="'+i+'" data-part-role="'+role+'" '+(second?'disabled':'data-duet-line="'+i+'"')+' aria-label="'+esc(text)+' · '+duetRoleLabel(part,second)+'"><span class="duet-edit-check" aria-hidden="true"></span><span class="duet-edit-lyric">'+esc(text)+'</span></button>';}).join('');
 return '<section class="duet-editor"><h2>'+(second?'듀엣 파트 보기':'듀엣 파트 나누기')+'</h2>'+modes+brushes+'<div class="duet-editor-lines" aria-label="가사 파트 지정">'+rows+(!words.length?'<p class="empty-note">싱크 가사가 없는 곡은 자유롭게 나눠 불러 주세요.</p>':'')+'</div><p data-duet-note role="status">'+(second?'내 파트 · 함께 · 상대 파트를 색으로 확인하세요.':'클릭·드래그 또는 여러 줄을 차례로 터치해 지정하세요.')+'</p><div class="duet-editor-footer">'+(!second?'<button type="button" class="small-button" data-duet-reset>'+icon('restart')+' 초기화</button>':'')+'<button type="button" class="primary-button" data-duet-done>'+(second?'닫기':'적용하기')+'</button></div></section>';
}
function openDuetEditor(){
 const s=sing;if(!s||singBusy(s)||singLive(s))return;const draft=duetEditorDraft(s);
 dialog(duetEditorHTML(draft));const dlg=$('#dialog');dlg.classList.add('duet-editor-dialog');
 const bind=()=>{
  const host=$('#dialog-content');
  const redraw=()=>{const scroll=host.querySelector('.duet-editor-lines')?.scrollTop||0;host.innerHTML=duetEditorHTML(draft);bind();host.querySelector('.duet-editor-lines').scrollTop=scroll;};
  host.querySelectorAll('[data-duet-method]').forEach(b=>{
   b.onclick=()=>{draft.duetEditorMode=b.dataset.duetMethod;if(draft.duetEditorMode==='random'&&!draft.duetRandomized){draft.duetGuide={...draft.duetGuide,mode:'lyrics',lines:AifectDuetGuide.assignPhraseParts(s.data.words,s.mr?.duration||s.data.track.duration,{bpm:s.data.track.bpm,beatsPerBar:s.data.track.beats_per_bar})};draft.duetRandomized=true;}redraw();};
   b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...host.querySelectorAll('[data-duet-method]')],index=tabs.indexOf(b),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+1)%tabs.length;tabs[next].focus();tabs[next].click();};
  });
  host.querySelectorAll('[data-duet-brush]').forEach(b=>b.onclick=()=>{draft.duetBrush=b.dataset.duetBrush;host.querySelectorAll('[data-duet-brush]').forEach(v=>v.setAttribute('aria-pressed',String(v===b)));});
  const rows=[...host.querySelectorAll('[data-duet-line]')];let dragStart=null,dragged=false;
  const assign=b=>{
   const i=Number(b.dataset.duetLine),value=draft.duetBrush||'A',guide=draft.duetGuide;
   // Materialize legacy activity-derived parts before changing one line.
   if(guide.mode!=='lyrics')guide.lines=s.data.words.map((_,j)=>AifectDuetGuide.linePart(guide,s.data.words,j,s.mr?.duration||s.data.track.duration));
   guide.mode='lyrics';guide.lines||=[];while(guide.lines.length<s.data.words.length)guide.lines.push('');guide.lines[i]=value;
   const row=b.closest('[data-edit-line]');row.dataset.partRole=AifectDuetGuide.lineRole(value,false);row.setAttribute('aria-label',s.data.words[i].w.map(w=>w.t).join(' ')+' · '+duetRoleLabel(value));
   row.setAttribute('aria-checked','true');
   host.querySelector('[data-duet-note]').textContent=duetAssignmentIssue(draft)||'적용하기를 누르면 선택한 파트가 저장됩니다.';
  };
  rows.forEach(b=>{
   b.onclick=()=>{if(!dragged)assign(b);};
   b.onpointerdown=e=>{dragged=false;dragStart=null;if(e.pointerType!=='mouse'||e.button!==0)return;dragStart=Number(b.dataset.duetLine);};
   b.onpointerenter=e=>{if(e.pointerType!=='mouse'||!(e.buttons&1)||dragStart===null)return;const end=Number(b.dataset.duetLine);dragged=true;rows.slice(Math.min(dragStart,end),Math.max(dragStart,end)+1).forEach(assign);};
   b.onpointerup=()=>{dragStart=null;};b.onpointercancel=()=>{dragStart=null;dragged=false;};
   b.onkeydown=()=>{dragged=false;};
  });
  const reset=host.querySelector('[data-duet-reset]');if(reset)reset.onclick=()=>{draft.duetGuide={version:1,mode:s.data.words.length?'lyrics':'free',lines:s.data.words.map(()=>'')};draft.duetEditorMode='lyrics';draft.duetRandomized=false;redraw();};
  host.querySelector('[data-duet-done]').onclick=()=>{if(sing!==s){dlg.close();return;}const issue=duetAssignmentIssue(draft);if(issue){host.querySelector('[data-duet-note]').textContent=issue;return;}if(!s.parent){s.duetGuide=draft.duetGuide;queueSingDraft(s);renderDuetGuide();drawLyrics(s.cursor);}dlg.close();};
 };
 bind();dlg.addEventListener('close',()=>dlg.classList.remove('duet-editor-dialog'),{once:true});
}

function preferredLyricSize(){try{const value=localStorage.getItem('aifect-recording-lyric-size');return ['small','normal','large'].includes(value)?value:'normal';}catch{return 'normal';}}
function lyricSizeControlsHTML(){const size=preferredLyricSize();return '<div class="sing-lyric-sizes" role="group" aria-label="녹음 가사 크기">'+[['small','작게'],['normal','보통'],['large','크게']].map(([key,label])=>'<button type="button" data-lyric-size="'+key+'" aria-pressed="'+(size===key)+'">'+label+'</button>').join('')+'</div>';}
function applyLyricSize(size){
 if(!['small','normal','large'].includes(size))size='normal';
 const stage=$('#sing');stage.dataset.lyricSize=size;stage.classList.remove('lyrics-large');document.querySelectorAll('button[data-lyric-size]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lyricSize===size)));
 try{localStorage.setItem('aifect-recording-lyric-size',size);}catch{}
 if(sing){sing.shownLine=-1;drawLyrics(sing.cursor||0);}
}
function vocalPresetButtonHTML(id,name,selected){const symbol={original:'original',karaoke:'mic',studio:'headphones',hall:'hall',custom:'sliders'}[id]||'sliders';return '<button type="button" class="studio-preset-tile" data-vocal-preset="'+id+'" aria-pressed="'+selected+'"><span class="studio-preset-icon">'+studioIcon(symbol)+'</span><span>'+name+'</span></button>';}

function preciseTime(t){return time(Math.floor(t))+'.'+Math.floor((t%1)*10);}
function reviewDuration(s){return s?.mode==='duet'?(s.mr?.duration||s.data.track.duration||0):(s?.voice?.duration||0);}
function reviewRange(s){const total=reviewDuration(s);return K().normalizeTakeRange(s.selection?.start??0,s.selection?.end??Math.min(15,total),total);}
function refreshStudioSelection(){
 const s=sing;if(!s?.voice)return;const r=reviewRange(s),total=reviewDuration(s);s.selection=r;
 document.querySelectorAll('[data-range]').forEach(input=>input.value=r[input.dataset.range]);
 document.querySelectorAll('[data-range-start]').forEach(el=>el.textContent=preciseTime(r.start));document.querySelectorAll('[data-range-end]').forEach(el=>el.textContent=preciseTime(r.end));
 document.querySelectorAll('[data-range-label]').forEach(el=>el.textContent=preciseTime(r.start)+' – '+preciseTime(r.end));
 const shade=$('.studio-selection');if(shade){shade.style.left=(100*r.start/total)+'%';shade.style.width=(100*(r.end-r.start)/total)+'%';}

 s.waveCanvas=null;drawTakeWaveform();
}
function renderStudioEditTool(tool){
 const s=sing,host=$('#studio-edit-detail');if(!s||!host)return;
 if(!editTools.some(([id])=>id===tool)||tool==='tone'&&!canEditPaid())tool='sync';
 s.editTool=tool;
 document.querySelectorAll('[data-edit-tool]').forEach(b=>{const selected=b.dataset.editTool===tool;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
 host.setAttribute('aria-labelledby','edit-tool-'+tool);
 const m=s.mix;
 if(tool==='sync'){
  host.innerHTML=`<h3>목소리 타이밍</h3><div class="studio-sync-steps"><button type="button" data-sync-step="-200">−0.2초</button><button type="button" data-sync-reset>0초</button><button type="button" data-sync-step="200">+0.2초</button></div><label class="studio-range"><span>미세 조절 <output data-sync-value></output></span><input type="range" data-edit-sync min="-1000" max="1000" step="5" aria-label="목소리 타이밍"></label><div class="take-directions"><span>목소리 앞당기기(빨리)</span><span>목소리 늦추기(늦게)</span></div>`;
  const slider=host.querySelector('[data-edit-sync]'),value=host.querySelector('output');
  const paint=()=>{const ui=-s.mix.offset;slider.value=ui;value.textContent=(ui>0?'+':'')+ui+' ms';slider.setAttribute('aria-valuetext',value.textContent);};
  const set=ui=>{if(singBusy(s)||singLive(s))return;s.mix=K().editVocalMix(s.mix,'offset',-Math.max(-1000,Math.min(1000,ui)));paint();applyMixChange('offset');};
  slider.oninput=()=>set(Number(slider.value));host.querySelectorAll('[data-sync-step]').forEach(b=>b.onclick=()=>set(-s.mix.offset+Number(b.dataset.syncStep)));host.querySelector('[data-sync-reset]').onclick=()=>set(0);paint();
 }else if(tool==='balance'){
  const joinedMix=s.parent&&!s.data.duet?.stems;
  host.innerHTML='<h3>볼륨 밸런스</h3>'+studioRangeHTML(m,'voice','내 목소리',0,2,.01)+(s.mode==='duet'?studioRangeHTML(m,'partner','상대 목소리',0,1.5,.01):'')+studioRangeHTML(m,'mr',joinedMix?'반주 · 상대 목소리':'반주',0,1.5,.01)+(s.mode==='duet'&&!s.partnerStem?'<p>'+(!s.parent?'아직 상대 녹음이 없습니다.':joinedMix?'이전 듀엣은 상대 목소리와 반주를 함께 조절합니다.':'상대 녹음을 준비하고 있습니다.')+'</p>':'');
 }else if(tool==='noise'){
  host.innerHTML=`<h3>노이즈 제거</h3><p>배경 잡음을 줄일 강도를 선택하세요.</p><div class="studio-noise-levels">${['끄기','약하게','보통','강하게','최대로'].map((name,i)=>`<button type="button" data-vocal-noise="${i}" aria-pressed="${m.noise===i}">${name}</button>`).join('')}</div>`;
 }else if(tool==='space')host.innerHTML=spaceEffectsHTML(m);
 else host.innerHTML=`<h3>목소리의 밝기</h3><div class="studio-tone-levels" role="group" aria-label="음색 선택">${[[-1,'묵직하게'],[0,'원음'],[1,'밝게'],[2,'더 밝게']].map(([n,label])=>`<button type="button" class="small-button" data-vocal-tone="${n}" aria-pressed="${m.tone===n}">${label}</button>`).join('')}</div>${studioRangeHTML(m,'tone','음색 보정',-1,2,.01)}`;
 bindMixControls();
}
function showEditorStep(s,step,focus=false){
 if(sing!==s||focus&&singBusy(s))return;stopPreview();s.editorStep=step;
 document.querySelectorAll('[data-step-marker]').forEach(el=>{if(Number(el.dataset.stepMarker)===step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
 document.querySelectorAll('[data-edit-step]').forEach(el=>el.hidden=Number(el.dataset.editStep)!==step);
 updateTransport();if(focus)(step===2?$('#sing-upload-form h2'):$('[data-edit-tool][aria-selected=true]'))?.focus();
 if(step===1)drawTakeWaveform();
}
function bindStudioEditor(){
 const s=sing;s.editPaid=canEditPaid();s.editMixBaseline??={...s.mix};renderStudioEditTool(s.editTool||'sync');refreshStudioSelection();
 document.querySelectorAll('[data-range]').forEach(input=>input.oninput=()=>{if(singBusy(s))return;const playing=s.state==='playing';stopPreview();const r=reviewRange(s),key=input.dataset.range;
  r[key]=Number(input.value);if(key==='start')r.start=Math.min(r.start,r.end-.1);else r.end=Math.max(r.end,r.start+.1);s.selection=K().normalizeTakeRange(r.start,r.end,reviewDuration(s));refreshStudioSelection();updateTransport();if(playing)previewMix(s.selection.start);});
 const tabs=[...document.querySelectorAll('[data-edit-tool]')];tabs.forEach(b=>{b.onclick=()=>renderStudioEditTool(b.dataset.editTool);b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const allowed=tabs.filter(t=>!t.disabled),i=allowed.indexOf(b),next=allowed[e.key==='Home'?0:e.key==='End'?allowed.length-1:(i+(e.key==='ArrowRight'?1:-1)+allowed.length)%allowed.length];next?.focus();if(next)next.click();};});
 $('[data-reset-mix]').onclick=()=>{if(s.beforePunch){stopPreview();s.voice=s.beforePunch;s.beforePunch=null;s.processed=null;refreshVocalGuide(s);renderDuetGuide();drawLyrics(s.cursor);}s.mix={...s.editMixBaseline};if(!canEditPaid())s.mix.tone=0;applyMixChange('reset');renderStudioEditTool(s.editTool);setSingStatus('편집 전 소리로 복원했습니다.');};
 $('[data-open-punch]').onclick=()=>openPunchSelection(s);
 $('[data-ab]').onclick=e=>{const playing=s.state==='playing';stopPreview();s.abEnabled=!s.abEnabled;e.currentTarget.setAttribute('aria-pressed',String(s.abEnabled));$('#take-ab-range').hidden=!s.abEnabled;refreshStudioSelection();updateTransport();if(playing)previewMix(s.abEnabled?reviewRange(s).start:s.cursor);};
 document.querySelectorAll('[data-skip]').forEach(b=>b.onclick=()=>{const forward=Number(b.dataset.skip)>0,r=s.abEnabled?reviewRange(s):{start:0,end:reviewDuration(s)},points=[r.start,...s.data.words.map(l=>l.s).filter(t=>t>r.start&&t<r.end),r.end],at=forward?(points.find(t=>t>s.cursor+.1)??r.end):([...points].reverse().find(t=>t<s.cursor-.1)??r.start);if(s.state==='playing')previewMix(at);else{s.cursor=at;drawLyrics(at);}});
 $('[data-listen-volume]').oninput=e=>{s.listenVolume=Number(e.target.value);s.previewListen?.gain.setTargetAtTime(s.listenVolume,s.ctx.currentTime,.015);};
 $('[data-wave-zoom]').onclick=e=>{const wave=$('.studio-wave-editor'),on=wave.classList.toggle('take-enlarged');e.currentTarget.setAttribute('aria-pressed',String(on));e.currentTarget.setAttribute('aria-label',on?'파형 축소':'파형 확대');drawTakeWaveform();};
 $('[data-step-next]').onclick=()=>showEditorStep(s,2,true);$('[data-step-back]').onclick=()=>showEditorStep(s,1,true);showEditorStep(s,s.editorStep||1);paintDraftStatus(s);
}

function stopStandbyMonitor(s=sing){const m=s?.standbyMonitor;if(!m)return;s.standbyMonitor=null;s.micCheck?.detach(m.stream);m.stream.getTracks().forEach(t=>t.stop());for(const n of [m.mic,m.gain,...m.effects])try{n.disconnect();}catch{}}
async function setMonitorEnabled(enabled){
 const s=sing;if(!s)return;const input=$('#sing-monitor');s.monitorSerial=(s.monitorSerial||0)+1;const serial=s.monitorSerial;input.checked=enabled;document.querySelectorAll('[data-monitor-toggle]').forEach(b=>b.setAttribute('aria-pressed',String(enabled)));
 if(s.run){s.run.monitor.gain.setTargetAtTime(enabled?1:0,s.ctx.currentTime,.015);return;}stopStandbyMonitor(s);if(!enabled){s.micCheck?.stop();s.micCheck?.setBusy(false);setSingStatus('모니터링을 껐습니다.');return;}s.micCheck?.prepare();s.micCheck?.setBusy(true);
 try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('마이크를 사용할 수 없습니다.');const ready=prepareVocalContext(s).then(ctx=>({ctx}),error=>({error}));const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});if(sing!==s||serial!==s.monitorSerial||document.hidden){stream.getTracks().forEach(t=>t.stop());return;}const monitor={stream,effects:[]};s.standbyMonitor=monitor;const prepared=await ready;if(prepared.error)throw prepared.error;const ctx=prepared.ctx;if(ctx.state!=='running')throw new Error('오디오가 일시정지되었습니다. 모니터링을 다시 눌러 주세요.');if(sing!==s||serial!==s.monitorSerial||document.hidden){stream.getTracks().forEach(t=>t.stop());if(s.standbyMonitor===monitor)stopStandbyMonitor(s);return;}const mic=ctx.createMediaStreamSource(stream),gain=ctx.createGain();gain.gain.value=s.mix.voice;gain.connect(ctx.destination);Object.assign(s.standbyMonitor,{mic,gain,effects:connectEffects(ctx,mic,gain,s.mix)});s.micCheck?.attach(stream,ctx);s.micCheck?.setBusy(false);setSingStatus('이어폰 모니터링 중 · 녹음은 아직 시작하지 않았습니다.');}
 catch(e){if(serial===s.monitorSerial)stopStandbyMonitor(s);if(sing===s&&serial===s.monitorSerial){s.micCheck?.setBusy(false);s.micCheck?.error(e);input.checked=false;document.querySelectorAll('[data-monitor-toggle]').forEach(b=>b.setAttribute('aria-pressed','false'));setSingStatus(e.name==='NotAllowedError'?'모니터링하려면 마이크 권한을 허용해 주세요.':e.message||'모니터링을 시작하지 못했습니다.');}}
}

function showPunchComplete(s,range){
 if(sing!==s)return;s.punchPage='result';s.editingRecording=false;s.state='review';renderSingPanel();drawLyrics(range.start);$('#punch-page')?.scrollIntoView({block:'start'});$('#punch-page h2')?.focus();
}

// UI-only helpers; recording samples, merge, DSP and persistence stay in the existing engine.
function recordSettingsIcon(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M5 3v5m0 4v9M12 3v10m0 4v4M19 3v2m0 4v12"/><path d="M3 8h4v4H3zM10 13h4v4h-4zM17 5h4v4h-4z"/></svg>';}
function recordingPrerollStart(words,target){const i=(words||[]).findIndex(line=>Math.abs(line.s-target)<.05);return i>0?words[i-1].s:Math.max(0,target-3);}
function openRecordingSettings(){
 const s=sing;if(!s||singBusy(s)||s.settingsOpen)return;
 const sidebar=$('#sing-live-settings'),nodes=[...sidebar.children];s.settingsOpen=true;
 dialog('<div class="recording-settings"><h2>녹음 설정</h2><div class="recording-setting-tabs" role="tablist" aria-label="녹음 설정">'+[['audio','오디오'],['song','노래'],['space','공간 효과']].map(([id,label],i)=>'<button type="button" id="record-tab-'+id+'" role="tab" data-record-tab="'+id+'" aria-controls="record-panel-'+id+'" aria-selected="'+!i+'" tabindex="'+(i?-1:0)+'">'+label+'</button>').join('')+'</div><div class="recording-settings-body"></div><button type="button" class="primary-button" data-record-settings-done>닫기</button></div>');
 const dlg=$('#dialog'),body=dlg.querySelector('.recording-settings-body');dlg.classList.add('recording-settings-dialog');
 nodes.forEach((node,i)=>{body.append(node);if(i<3){const id=['audio','song','space'][i];node.id='record-panel-'+id;node.setAttribute('role','tabpanel');node.setAttribute('aria-labelledby','record-tab-'+id);node.hidden=i!==0;}});
 const tabs=[...dlg.querySelectorAll('[data-record-tab]')],select=b=>{tabs.forEach((tab,i)=>{const active=tab===b;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;nodes[i].hidden=!active;});};
 tabs.forEach((b,i)=>{b.onclick=()=>select(b);b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=tabs[e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3];select(next);next.focus();};});
 dlg.querySelector('[data-record-settings-done]').onclick=()=>dlg.close();
 dlg.addEventListener('close',()=>{nodes.forEach(node=>{node.hidden=false;node.removeAttribute('role');node.removeAttribute('aria-labelledby');node.removeAttribute('id');sidebar.append(node);});dlg.classList.remove('recording-settings-dialog');s.settingsOpen=false;if(sing===s){queueSingDraft(s);$('#sing .record-settings-icon')?.focus();}},{once:true});
}
