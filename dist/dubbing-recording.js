let dubbingRecorder=null;
function dubbingRecordingHTML(p,data){
 const mine=p.roles.find(r=>r.mine),record=data.recording.roles.find(r=>r.roleId===mine.id);
 return `<a class="dubbing-back" href="#dubbing/${esc(p.id)}">← 대본과 배역</a><header class="dubbing-heading"><span class="eyebrow">VOICE STUDIO · ${esc(mine.name)}</span><h1>${esc(p.title)}</h1><p>내 대사를 한 줄씩 연기하고, 서로의 목소리로 장면을 완성해요.</p></header>
 ${window.AifectMicrophoneCheck?.html()||''}
 <div class="dubbing-record-layout"><section class="dubbing-panel dubbing-record-script"><div class="dubbing-section-heading"><div><span class="eyebrow">SCRIPT & TAKES</span><h2>장면의 대사</h2></div><span class="dubbing-tag">내 배역 · ${esc(mine.name)}</span></div><p class="dubbing-record-script-hint">현재 대사 앞뒤를 함께 보며 준비하세요. 내 대사를 누르면 녹음할 위치를 바꿀 수 있어요.</p><div id="dubbing-record-lines" class="dubbing-record-lines" aria-label="전체 대본과 녹음 위치"></div><p id="dubbing-record-next" class="dubbing-record-next"></p></section>
 <aside class="dubbing-panel dubbing-record-stage"><div class="dubbing-section-heading"><span class="eyebrow">NOW RECORDING</span><span id="dubbing-record-count"></span></div><div id="dubbing-record-current"></div><div id="dubbing-record-cue" class="dubbing-record-cue" role="status" aria-live="polite">녹음 시작 전 3, 2, 1로 알려드려요</div><div class="dubbing-record-time"><span id="dubbing-record-clock">0:00</span><progress id="dubbing-record-progress" max="1" value="0" aria-label="현재 대사 녹음 진행"></progress><span id="dubbing-record-limit"></span></div>
 <div class="dubbing-record-controls"><button type="button" class="primary-button" id="dubbing-record-start">${icon('mic')} 녹음 시작</button><button type="button" class="small-button" id="dubbing-record-pause" disabled>일시정지</button><button type="button" class="small-button" id="dubbing-record-stop" disabled>이 대사 마치기</button><button type="button" class="small-button" id="dubbing-record-again" disabled>다시 녹음</button></div>
 <div class="dubbing-form-actions"><button type="button" class="small-button" id="dubbing-record-listen">${icon('audio-play')} 미리 듣기</button><button type="button" class="small-button" id="dubbing-record-save" disabled>${icon('save')} 임시 저장</button></div>
 <p class="dubbing-feedback" role="status" aria-live="polite">${record?.state==='submitted'?'내 배역의 녹음을 제출했어요. 다른 배역의 목소리를 기다리고 있어요.':'이어폰을 사용해주세요. 배경음과 다른 배역의 목소리는 별도로 재생하며 마이크 파일에 합치지 않아요.'}</p>
 <div class="dubbing-record-submit"><fieldset class="dc-privacy"><legend><h3>내 더빙 녹음 공개 설정</h3></legend><label><input type="radio" name="dubbing-visibility" value="public"> 공개 캐스팅 허용</label><label><input type="radio" name="dubbing-visibility" value="private"> 비공개 보관</label><p>공개하면 이 대본의 선택한 조합에 내 음성이 포함되며, 참여자가 대사를 미리 듣고 공동 작품으로 합성·저장·게시할 수 있어요. 원작자 녹음은 기본 조합으로 유지되어 이 대본의 새 조합에 사용됩니다. 다른 대본에 자동 재사용하지 않아요.</p><p>비공개 보관은 공개 조합에 참여하지 않고 내 작업에만 저장합니다. 공개 후 삭제 요청은 작품 관리·고객센터에서 접수하며, 이미 완성된 공동 작품의 처리 범위는 별도 안내합니다. 미완성 조합은 신규 녹음 참여 없이 30일이 지나면 삭제되며, 그 조합에만 쓰인 음성도 삭제됩니다.</p><label class="dubbing-consent"><input type="checkbox" id="dubbing-record-rights"> 공개 캐스팅을 선택한 경우 위 음성 이용 범위에 동의합니다.</label></fieldset><button class="primary-button" id="dubbing-record-submit">공개 설정에 따라 제출</button><small>모든 대사를 임시 저장한 뒤 제출해주세요. 공개 제출된 목소리는 다른 참여자의 녹음을 보호하기 위해 덮어쓰지 않습니다.</small><div id="dc-record-result" role="status"></div></div>
 <details class="dubbing-record-help"><summary>녹음은 이렇게 진행해요</summary><p>효과음을 듣고 3, 2, 1 안내에 맞춰 대사를 시작하세요. 녹음한 내 대사는 체크로 표시돼요. 다른 대사로 이동해도 녹음은 이 화면에 모아두며, 임시 저장을 누르면 지금까지 녹음한 대사를 모두 저장해요. 저장 전에는 화면을 닫지 마세요.</p></details></aside></div>`;
}
function dubbingRecordBeforeRoute(raw){
 const s=dubbingRecorder;if(!s)return true;if(raw===s.route)return !(s.dirty||s.run||s.busy);
 if(s.busy){history.replaceState(null,'','#'+s.route);toast('녹음을 저장하고 있어요. 저장 후 이동해주세요.');return false;}
 if((s.dirty||s.run)&&!confirm('아직 임시 저장하지 않은 녹음이 있습니다. 이 화면을 나가면 사라집니다. 이동할까요?')){history.replaceState(null,'','#'+s.route);return false;}
 dubbingReleaseRecorder(s);return true;
}
function dubbingReleaseRecorder(s){
 if(dubbingRecorder===s)dubbingRecorder=null;s.micCheck?.destroy();s.closed=true;cancelAnimationFrame(s.frame);
 dubbingStopGuide(s);if(s.run){try{s.run.node.port.postMessage('stop');s.run.mic.disconnect();s.run.node.disconnect();s.run.mute.disconnect();}catch{}s.run.stream.getTracks().forEach(t=>t.stop());s.run=null;}
 s.ctx?.close().catch(()=>{});
}
function dubbingStopGuide(s){clearTimeout(s.previewTimer);for(const node of s.sources||[]){node.onended=null;try{node.stop();node.disconnect();}catch{}}s.sources=[];s.preview=false;}
function dubbingRecordMessage(s,message){if(!s.closed)dubbingMessage(s.root,message);}
function dubbingRecordState(s){return s.data.recording.roles.find(r=>r.roleId===s.role);}
function dubbingRememberTake(s){
 if(!s.samples||s.cursor<.1)return;
 s.takes.set(s.line,{samples:s.samples,cursor:s.cursor,rate:s.ctx.sampleRate,takeId:s.pendingTake||crypto.randomUUID(),dirty:true});
 s.pendingTake=s.takes.get(s.line).takeId;s.dirty=true;
}
function dubbingSelectTake(s,lineId){
 dubbingStopGuide(s);s.line=lineId;const take=s.takes.get(lineId);
 s.samples=take?.samples||null;s.cursor=take?.cursor||0;s.pendingTake=take?.takeId||null;dubbingRecordDraw(s);
}
function dubbingRecordDraw(s){
 if(s.closed)return;
 const line=s.p.script.lines.find(l=>l.id===s.line),slot=s.data.lines.find(l=>l.id===s.line),state=dubbingRecordState(s),locked=state?.state==='submitted';
 const saved=s.data.lines.filter(l=>l.roleId===s.role&&l.audioUrl).length,total=s.p.script.lines.filter(l=>l.roleId===s.role).length;
 const recorded=s.data.lines.filter(l=>l.roleId===s.role&&(l.audioUrl||s.takes.has(l.id))).length,unsaved=[...s.takes.values()].filter(t=>t.dirty).length;
 s.root.querySelector('#dubbing-record-current').innerHTML=`<span class="eyebrow">${esc([line.emotion,line.direction].filter(Boolean).join(' · ')||'자연스럽게')}</span><h2>${esc(line.text)}</h2><p>${time(slot.start)}부터 · ${Math.round((slot.recordEnd-slot.start)*10)/10}초 이내</p>`;
 s.root.querySelector('#dubbing-record-count').textContent=`✓ ${recorded} / ${total}개 녹음 · ${unsaved?unsaved+'개 저장 전':'임시 저장 '+saved+'개'}`;
 const lineIndex=s.p.script.lines.findIndex(l=>l.id===s.line),next=s.p.script.lines.slice(lineIndex+1).find(l=>l.roleId===s.role);
 const list=s.root.querySelector('#dubbing-record-lines'),scroll=list.scrollTop;
 list.innerHTML=s.p.script.lines.map((l,i)=>{const take=s.data.lines.find(t=>t.id===l.id),local=s.takes.get(l.id),mine=l.roleId===s.role,current=l.id===s.line,done=mine&&(local||take?.audioUrl),roleIndex=s.p.roles.findIndex(r=>r.id===l.roleId);return `<button type="button" data-dubbing-record-line="${esc(l.id)}" class="dubbing-record-line dubbing-cast-${roleIndex%6} ${mine?'is-mine':''} ${current?'is-selected':''} ${done?'is-recorded':''}" ${current?'aria-current="true"':''} ${!mine||s.busy||s.run?'disabled':''}><span class="dubbing-record-line-number">${done?'✓ ':''}${String(i+1).padStart(2,'0')}</span><p><b class="dubbing-record-line-role">${esc(s.p.roles.find(r=>r.id===l.roleId)?.name||'')}: </b>${esc(l.text)}</p><small class="dubbing-record-line-status">${current?'현재 대사 · ':''}${mine?(local?.dirty?'✓ 녹음됨 · 저장 전':done?'✓ 임시 저장됨':'○ 미녹음'):'상대 대사'}</small></button>`;}).join('');
 list.scrollTop=scroll;
 if(s.focusedLine!==s.line){const selected=list.querySelector('[aria-current="true"]'),context=list.children[Math.max(0,Math.min(lineIndex-3,s.p.script.lines.length-10))];if(selected&&context)list.scrollTop+=context.getBoundingClientRect().top-list.getBoundingClientRect().top;s.focusedLine=s.line;}
 const nextLabel=s.root.querySelector('#dubbing-record-next');if(nextLabel)nextLabel.textContent=next?'다음 내 대사 · '+time(s.data.lines.find(l=>l.id===next.id)?.start||0)+'  '+next.text:'마지막 내 대사입니다. 녹음을 확인하고 저장해주세요.';
 s.root.querySelectorAll('[data-dubbing-record-line]').forEach(b=>b.onclick=()=>{
  dubbingSelectTake(s,b.dataset.dubbingRecordLine);
 });
 s.micCheck?.setBusy(s.busy||!!s.run);
 const set=(id,disabled)=>s.root.querySelector('#'+id).disabled=disabled;
 set('dubbing-record-start',s.busy||!!s.run||locked||s.cursor>=slot.recordEnd-slot.start-.05);
 s.root.querySelector('#dubbing-record-start').innerHTML=icon('mic')+' '+(s.cursor>0?'이어서 녹음':'녹음 시작');
 set('dubbing-record-pause',s.busy||!s.run);set('dubbing-record-stop',s.busy||!s.run);
 set('dubbing-record-again',s.busy||!!s.run||locked||(!s.samples&&!slot.audioUrl));
 set('dubbing-record-save',s.busy||!!s.run||locked||!s.dirty);set('dubbing-record-listen',s.busy||!!s.run);
 const needsConsent=locked&&s.p.casting?.isRoot&&!state.castingVisibility;
 set('dubbing-record-submit',s.busy||!!s.run||s.dirty||(locked&&!needsConsent)||saved!==total);set('dubbing-record-rights',(locked&&!needsConsent)||s.busy||!!s.run);
 s.root.querySelector('#dubbing-record-limit').textContent=time(slot.recordEnd-slot.start);
 dubbingRecordTick(s);
}
function dubbingRecordTick(s){
 if(s.closed)return;cancelAnimationFrame(s.frame);
 const slot=s.data.lines.find(l=>l.id===s.line),limit=slot.recordEnd-slot.start;
 const cursor=s.run?Math.min(limit,s.run.offset+Math.max(0,s.ctx.currentTime-s.run.t0)):s.cursor;
 const remaining=s.run?s.run.t0-s.ctx.currentTime:0;
 s.root.querySelector('#dubbing-record-clock').textContent=time(cursor);
 const cue=s.root.querySelector('#dubbing-record-cue');const cueText=s.run?(remaining>3?'효과음을 듣고 준비하세요':remaining>0?String(Math.ceil(remaining)):'지금 대사하세요'):s.cursor>0?'✓ 녹음한 대사':'녹음 시작 전 3, 2, 1로 알려드려요';
 if(cue.textContent!==cueText)cue.textContent=cueText;
 const progress=s.root.querySelector('#dubbing-record-progress');progress.max=limit;progress.value=cursor;
 if(s.run){if(cursor>=limit-.01)void dubbingPauseRecording(s,true);else s.frame=requestAnimationFrame(()=>dubbingRecordTick(s));}
}
async function dubbingRecordAudio(s){
 if(!s.ctx)s.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000});
 await s.ctx.resume();
 const decode=async url=>{if(!s.buffers.has(url)){const r=await fetch(url,{credentials:'same-origin'});if(!r.ok)throw Error('배경음 또는 이전 녹음을 불러오지 못했어요.');s.buffers.set(url,await s.ctx.decodeAudioData(await r.arrayBuffer()));}return s.buffers.get(url);};
 s.background=await decode(s.p.sound.audioUrl);
 for(const l of s.data.lines)if(l.audioUrl)await decode(l.audioUrl+'?take='+encodeURIComponent(l.takeId));
 if(s.closed)throw Error('녹음 화면이 닫혔어요.');
}
function dubbingPlayGuide(s,from,when,includeMine=false){
 dubbingStopGuide(s);
 const play=(buffer,start,offset=0,duration)=>{if(!buffer||offset>=buffer.duration)return;const src=s.ctx.createBufferSource();src.buffer=buffer;src.connect(s.ctx.destination);src.start(start,offset,duration);s.sources.push(src);};
 play(s.background,when,from);
 for(const l of s.data.lines){
  const local=s.takes.get(l.id);if((!local&&!l.audioUrl)||(!includeMine&&l.id===s.line))continue;
  const end=l.start+(local?.cursor??l.duration);if(end<=from)continue;
  let buffer;if(local){buffer=s.ctx.createBuffer(1,Math.floor(local.cursor*local.rate),local.rate);buffer.copyToChannel(local.samples.subarray(0,buffer.length),0);}else buffer=s.buffers.get(l.audioUrl+'?take='+encodeURIComponent(l.takeId));
  play(buffer,when+Math.max(0,l.start-from),Math.max(0,from-l.start));
 }
}
async function dubbingStartRecording(s){
 if(s.busy||s.run||s.closed)return;s.busy=true;s.micCheck?.prepare();dubbingRecordDraw(s);let stream;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('HTTPS 주소의 최신 브라우저에서 마이크를 허용해주세요.');
  const prepared=dubbingRecordAudio(s);prepared.catch(()=>{});
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  await prepared;if(s.closed||document.hidden)throw Error('녹음 화면으로 돌아와 다시 시작해주세요.');
  if(!dubbingRecordState(s))s.data=await api(`/api/dubbing/projects/${s.p.id}/recording/${s.role}/start`,'POST',{soundId:s.p.sound.id});
  if(dubbingRecordState(s)?.state==='submitted')throw Error('이미 제출한 배역입니다.');
  if(!s.worklet){await s.ctx.audioWorklet.addModule('/recorder-worklet.js?v=20260929');s.worklet=true;}
  if(s.closed||document.hidden)throw Error('녹음 화면으로 돌아와 다시 시작해주세요.');
 const ctx=s.ctx,slot=s.data.lines.find(l=>l.id===s.line),from=s.cursor?slot.start+s.cursor:Math.min(slot.start,slot.cueStart??slot.start),preroll=Math.max(3,slot.start+s.cursor-from),when=ctx.currentTime+.15;
  const mic=ctx.createMediaStreamSource(stream),node=new AudioWorkletNode(ctx,'aifect-recorder',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'}),mute=ctx.createGain();mute.gain.value=0;mic.connect(node).connect(mute).connect(ctx.destination);
  const run={stream,mic,node,mute,chunks:[],offset:s.cursor,t0:when+preroll};s.run=run;s.pendingTake=null;s.micCheck?.attach(stream,ctx);
  stream.getAudioTracks?.().forEach(track=>track.addEventListener('ended',()=>{if(s.run===run&&!s.closed)void dubbingPauseRecording(s);}));
  node.port.onmessage=e=>{if(e.data==='done')run.flushed?.();else if(e.data?.d instanceof Float32Array)run.chunks.push(e.data);};
  const guideFrom=Math.max(0,slot.start+s.cursor-preroll),guideWhen=when+Math.max(0,preroll-(slot.start+s.cursor));
  dubbingPlayGuide(s,guideFrom,guideWhen);s.preview=false;
  dubbingRecordMessage(s,'녹음 중 · 내 대사를 연기해주세요.');
 }catch(err){stream?.getTracks().forEach(t=>t.stop());if(!s.closed)s.micCheck?.error(err);dubbingRecordMessage(s,err.message);}
 finally{s.busy=false;dubbingRecordDraw(s);}
}
async function dubbingPauseRecording(s,ended=false){
 if(!s.run||s.busy)return;s.busy=true;const run=s.run,slot=s.data.lines.find(l=>l.id===s.line),limit=slot.recordEnd-slot.start;
 const cursor=Math.min(limit,run.offset+Math.max(0,s.ctx.currentTime-run.t0));dubbingStopGuide(s);cancelAnimationFrame(s.frame);
 await new Promise(resolve=>{const timer=setTimeout(resolve,600);run.flushed=()=>{clearTimeout(timer);resolve();};run.node.port.postMessage('stop');});
 s.micCheck?.detach(run.stream);run.stream.getTracks().forEach(t=>t.stop());run.mic.disconnect();run.node.disconnect();run.mute.disconnect();s.run=null;
 if(!s.closed){const rate=s.ctx.sampleRate,total=Math.floor(limit*rate);s.samples||=new Float32Array(total);const start=Math.round(run.offset*rate),frames=Math.min(total-start,Math.round((cursor-run.offset)*rate));if(frames>0){s.samples.set(AifectKaraoke.placeChunks(run.chunks,run.t0,rate,frames),start);s.cursor=cursor;dubbingRememberTake(s);}dubbingRecordMessage(s,ended?'✓ 이 대사를 녹음했어요. 다음 내 대사를 선택하세요. 임시 저장은 지금까지의 녹음을 모두 저장해요.':'잠시 멈췄어요. 다른 대사로 이동해도 지금까지 녹음한 내용은 이 화면에 유지돼요.');}
 s.busy=false;dubbingRecordDraw(s);
}
async function dubbingSaveRecording(s){
 if(s.busy||s.run||!s.dirty)return;s.busy=true;dubbingRecordDraw(s);dubbingRecordMessage(s,'지금까지 녹음한 대사를 모두 저장하고 있어요…');
 try{
  for(const [lineId,take] of s.takes){
  if(!take.dirty)continue;
  let data=take.samples.subarray(0,Math.floor(take.cursor*take.rate));
  if(take.rate!==48000){const offline=new OfflineAudioContext(1,Math.floor(take.cursor*48000),48000),buffer=offline.createBuffer(1,data.length,take.rate);buffer.copyToChannel(data,0);const src=offline.createBufferSource();src.buffer=buffer;src.connect(offline.destination);src.start();data=(await offline.startRendering()).getChannelData(0);}
  const record=dubbingRecordState(s);
  const r=await fetch(`/api/dubbing/projects/${s.p.id}/recording/${s.role}/lines/${lineId}?revision=${record.revision}&take=${take.takeId}`,{method:'PUT',credentials:'same-origin',headers:{'content-type':'audio/wav'},body:AifectKaraoke.encodeWav([data],48000),signal:AbortSignal.timeout(90000)});
  const result=await r.json();if(!r.ok)throw Object.assign(Error(result.error||'녹음 저장에 실패했어요.'),{status:r.status});
  s.data=result;take.dirty=false;
  }
  s.buffers.clear();dubbingRecordMessage(s,'지금까지 녹음한 대사를 모두 임시 저장했어요. 모든 내 대사를 녹음·저장하면 제출할 수 있어요.');
 }catch(err){
  let message=err.message+' 현재 녹음은 화면에 유지됩니다.';
  if(err.status===409)try{s.data=await api(`/api/dubbing/projects/${s.p.id}/recording`);message+=' 저장 상태를 갱신했어요. 미저장 녹음은 유지되며 임시 저장을 다시 누르면 이어서 저장합니다.';}catch{}
  dubbingRecordMessage(s,message);
 }
 finally{s.dirty=[...s.takes.values()].some(t=>t.dirty);s.busy=false;dubbingRecordDraw(s);}
}
function bindDubbingRecorder(view,root){
 const s={p:view.project,data:view.recordingData,role:view.project.roles.find(r=>r.mine).id,root,route:view.route,buffers:new Map(),takes:new Map(),sources:[],cursor:0,busy:false,dirty:false};
 if(dubbingRecorder)dubbingReleaseRecorder(dubbingRecorder);dubbingRecorder=s;s.micCheck=window.AifectMicrophoneCheck?.bind(root.querySelector('.microphone-check'));s.line=s.p.script.lines.find(l=>l.roleId===s.role).id;
 root.querySelector('#dubbing-record-start').onclick=()=>dubbingStartRecording(s);
 root.querySelector('#dubbing-record-pause').onclick=()=>dubbingPauseRecording(s);
 root.querySelector('#dubbing-record-stop').onclick=()=>dubbingPauseRecording(s,true);
 root.querySelector('#dubbing-record-again').onclick=()=>{dubbingStopGuide(s);s.samples=null;s.cursor=0;s.pendingTake=null;void dubbingStartRecording(s);};
 root.querySelector('#dubbing-record-save').onclick=()=>dubbingSaveRecording(s);
 root.querySelector('#dubbing-record-listen').onclick=async()=>{
  if(s.preview){dubbingStopGuide(s);dubbingRecordMessage(s,'미리 듣기를 멈췄어요.');return;}
  if(s.busy||s.run)return;s.busy=true;dubbingRecordDraw(s);
  try{await dubbingRecordAudio(s);const slot=s.data.lines.find(l=>l.id===s.line),when=s.ctx.currentTime+.1,from=Math.max(0,Math.min(slot.cueStart??slot.start,slot.start-.5));dubbingPlayGuide(s,from,when,true);s.preview=true;
   s.previewTimer=setTimeout(()=>{dubbingStopGuide(s);if(!s.closed)dubbingRecordMessage(s,'미리 듣기가 끝났어요.');},(slot.recordEnd-from+.3)*1000);
   dubbingRecordMessage(s,'배경음과 목소리 미리 듣기 · 다시 누르면 멈춰요.');
  }catch(err){dubbingRecordMessage(s,err.message);}finally{s.busy=false;dubbingRecordDraw(s);}
 };
 root.querySelector('#dubbing-record-submit').onclick=async()=>{
  const visibility=root.querySelector('[name="dubbing-visibility"]:checked')?.value,rights=root.querySelector('#dubbing-record-rights').checked;
  if(!visibility){dubbingRecordMessage(s,'내 더빙 녹음 공개 설정을 선택해주세요.');return;}
  if(visibility==='public'&&!rights){dubbingRecordMessage(s,'공개 캐스팅의 음성 이용 범위를 확인해주세요.');return;}
  if(s.busy||s.run||s.dirty)return;s.busy=true;dubbingStopGuide(s);dubbingRecordDraw(s);
  try{s.data=await api(`/api/dubbing/projects/${s.p.id}/recording/${s.role}/submit`,'POST',{revision:dubbingRecordState(s).revision,visibility,rightsAccepted:rights,licenseVersion:'casting-2026-11-01'});
   const result=s.data.casting,box=root.querySelector('#dc-record-result');
   dubbingRecordMessage(s,result?.private?'내 작업에 비공개로 보관했어요. 공개 조합에는 참여하지 않았어요.':result?.base?'원작자의 기본 녹음을 공개했어요. 다른 배역이 이 목소리에서 새 조합을 시작할 수 있어요.':'배역 녹음을 제출했어요. 모든 배역이 모이면 완성작으로 이동합니다.');
   box.innerHTML=result?.combinationId?`<a class="small-button" href="#dubbing/${esc(result.combinationId)}">참여한 작품 확인</a>`:`<a class="small-button" href="#karaoke/dubbing?tab=${result?.private?'mine&kind=recording':'discover'}">${result?.private?'내 녹음 보기':'작품찾기로'}</a>`;
  }catch(err){dubbingRecordMessage(s,err.message);if(err.status===409&&s.p.casting?.draft)void castingRetargetRecording(s);}
  finally{s.busy=false;dubbingRecordDraw(s);}
 };
 dubbingRecordDraw(s);
}
window.addEventListener('beforeunload',e=>{if(dubbingRecorder?.dirty||dubbingRecorder?.run){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&dubbingRecorder?.run)void dubbingPauseRecording(dubbingRecorder);});

async function castingRetargetRecording(s){
 const box=s.root.querySelector('#dc-record-result');try{const data=await api('/api/dubbing/casting/'+s.p.casting.draft.rootId,'GET',undefined,{fresh:true});if(!box.isConnected)return;
 const choices=data.combinations.filter(c=>c.state!=='complete'&&!c.members.some(m=>m.roleId===s.role));
 box.innerHTML='<p class="dc-help">저장된 녹음을 유지한 채 참여할 조합을 다시 선택하세요.</p><label>참여 조합 <select id="dc-retarget">'+choices.map((c,i)=>`<option value="${c.base?'':esc(c.id)}">${esc(c.base?'기본 녹음에서 새 조합':c.count+'/'+data.root.roleCount+' 조합 '+(i+1)+' · '+c.members.map(m=>m.name).join(', '))}</option>`).join('')+'</select></label><button type="button" class="small-button" id="dc-retarget-save">조합 변경</button>';
 box.querySelector('#dc-retarget-save').disabled=!choices.length;box.querySelector('#dc-retarget-save').onclick=async event=>{event.currentTarget.disabled=true;try{await api('/api/dubbing/casting/'+s.p.id+'/retarget','POST',{targetId:box.querySelector('select').value||null});box.textContent='조합을 변경했어요. 공개 설정을 확인하고 다시 제출해주세요.';}catch(e){dubbingRecordMessage(s,e.message);event.currentTarget.disabled=false;}};
 }catch(e){dubbingRecordMessage(s,e.message+' 임시 저장한 녹음은 내 작업에서 다시 열 수 있어요.');}
}
