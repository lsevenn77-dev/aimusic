let dubbingRecorder=null;
function dubbingRecordingHTML(p,data){
 const mine=p.roles.find(r=>r.mine),record=data.recording.roles.find(r=>r.roleId===mine.id);
 return `<a class="dubbing-back" href="#dubbing/${esc(p.id)}">← 대본과 배역</a><header class="dubbing-heading"><span class="eyebrow">VOICE STUDIO · ${esc(mine.name)}</span><h1>${esc(p.title)}</h1><p>내 대사를 한 줄씩 연기하고, 서로의 목소리로 장면을 완성해요.</p></header>
 <div class="dubbing-record-layout"><section class="dubbing-panel dubbing-record-script"><div class="dubbing-section-heading"><div><span class="eyebrow">SCRIPT & TAKES</span><h2>장면의 대사</h2></div><span class="dubbing-tag">내 배역 · ${esc(mine.name)}</span></div><p class="dubbing-record-script-hint">현재 대사 앞뒤를 함께 보며 준비하세요. 내 대사를 누르면 녹음할 위치를 바꿀 수 있어요.</p><div id="dubbing-record-lines" class="dubbing-record-lines" aria-label="전체 대본과 녹음 위치"></div><p id="dubbing-record-next" class="dubbing-record-next"></p></section>
 <aside class="dubbing-panel dubbing-record-stage"><div class="dubbing-section-heading"><span class="eyebrow">NOW RECORDING</span><span id="dubbing-record-count"></span></div><div id="dubbing-record-current"></div><div class="dubbing-record-time"><span id="dubbing-record-clock">0:00</span><progress id="dubbing-record-progress" max="1" value="0" aria-label="현재 대사 녹음 진행"></progress><span id="dubbing-record-limit"></span></div>
 <div class="dubbing-record-controls"><button type="button" class="primary-button" id="dubbing-record-start">${icon('mic')} 녹음 시작</button><button type="button" class="small-button" id="dubbing-record-pause" disabled>일시정지</button><button type="button" class="small-button" id="dubbing-record-stop" disabled>이 대사 마치기</button><button type="button" class="small-button" id="dubbing-record-again" disabled>다시 녹음</button></div>
 <div class="dubbing-form-actions"><button type="button" class="small-button" id="dubbing-record-listen">${icon('play')} 미리 듣기</button><button type="button" class="small-button" id="dubbing-record-save" disabled>${icon('save')} 임시 저장</button></div>
 <p class="dubbing-feedback" role="status" aria-live="polite">${record?.state==='submitted'?'내 배역의 녹음을 제출했어요. 다른 배역의 목소리를 기다리고 있어요.':'이어폰을 사용해주세요. 배경음과 다른 배역의 목소리는 별도로 재생하며 마이크 파일에 합치지 않아요.'}</p>
 <div class="dubbing-record-submit"><label class="dubbing-consent"><input type="checkbox" id="dubbing-record-rights"> 내 음성을 이 공동 작품에 사용하고 공개하는 데 동의합니다.</label><button class="primary-button" id="dubbing-record-submit">내 배역 녹음 제출</button><small>모든 대사를 저장해야 제출할 수 있어요. 제출 후에는 목소리를 변경할 수 없어요.</small></div>
 <details class="dubbing-record-help"><summary>녹음은 이렇게 진행해요</summary><p>내 대사를 선택하고 녹음을 시작하세요. 시간이 끝나도 이 화면에서 듣고 다시 녹음할 수 있어요. 대사마다 임시 저장하면 다음 방문에도 이어서 진행할 수 있어요.</p></details></aside></div>`;
}
function dubbingRecordBeforeRoute(raw){
 const s=dubbingRecorder;if(!s)return true;if(raw===s.route)return !(s.dirty||s.run||s.busy);
 if(s.busy){history.replaceState(null,'','#'+s.route);toast('녹음을 저장하고 있어요. 저장 후 이동해주세요.');return false;}
 if((s.dirty||s.run)&&!confirm('저장하지 않은 현재 대사 녹음은 사라집니다. 이동할까요?')){history.replaceState(null,'','#'+s.route);return false;}
 dubbingReleaseRecorder(s);return true;
}
function dubbingReleaseRecorder(s){
 if(dubbingRecorder===s)dubbingRecorder=null;s.closed=true;cancelAnimationFrame(s.frame);
 dubbingStopGuide(s);if(s.run){try{s.run.node.port.postMessage('stop');s.run.mic.disconnect();s.run.node.disconnect();s.run.mute.disconnect();}catch{}s.run.stream.getTracks().forEach(t=>t.stop());s.run=null;}
 s.ctx?.close().catch(()=>{});
}
function dubbingStopGuide(s){clearTimeout(s.previewTimer);for(const node of s.sources||[]){node.onended=null;try{node.stop();node.disconnect();}catch{}}s.sources=[];s.preview=false;}
function dubbingRecordMessage(s,message){if(!s.closed)dubbingMessage(s.root,message);}
function dubbingRecordState(s){return s.data.recording.roles.find(r=>r.roleId===s.role);}
function dubbingRecordDraw(s){
 if(s.closed)return;
 const line=s.p.script.lines.find(l=>l.id===s.line),slot=s.data.lines.find(l=>l.id===s.line),state=dubbingRecordState(s),locked=state?.state==='submitted';
 const saved=s.data.lines.filter(l=>l.roleId===s.role&&l.audioUrl).length,total=s.p.script.lines.filter(l=>l.roleId===s.role).length;
 s.root.querySelector('#dubbing-record-current').innerHTML=`<span class="eyebrow">${esc([line.emotion,line.direction].filter(Boolean).join(' · ')||'자연스럽게')}</span><h2>${esc(line.text)}</h2><p>${time(slot.start)}부터 · ${Math.round((slot.recordEnd-slot.start)*10)/10}초 이내</p>`;
 s.root.querySelector('#dubbing-record-count').textContent=`${saved} / ${total}개 저장`;
 const lineIndex=s.p.script.lines.findIndex(l=>l.id===s.line),next=s.p.script.lines.slice(lineIndex+1).find(l=>l.roleId===s.role);
 const list=s.root.querySelector('#dubbing-record-lines'),scroll=list.scrollTop;
 list.innerHTML=s.p.script.lines.map((l,i)=>{const take=s.data.lines.find(t=>t.id===l.id),mine=l.roleId===s.role,current=l.id===s.line,roleIndex=s.p.roles.findIndex(r=>r.id===l.roleId);return `<button type="button" data-dubbing-record-line="${esc(l.id)}" class="dubbing-record-line dubbing-cast-${roleIndex%6} ${mine?'is-mine':''} ${current?'is-selected':''}" ${current?'aria-current="true"':''} ${!mine||s.busy||s.run?'disabled':''}><span class="dubbing-record-line-number">${String(i+1).padStart(2,'0')}</span><p><b class="dubbing-record-line-role">${esc(s.p.roles.find(r=>r.id===l.roleId)?.name||'')}: </b>${esc(l.text)}</p><small class="dubbing-record-line-status">${current?'현재 대사':next?.id===l.id?'다음 내 대사':take?.audioUrl?'저장됨':mine?'내 대사':'상대 대사'}</small></button>`;}).join('');
 list.scrollTop=scroll;
 if(s.focusedLine!==s.line){const selected=list.querySelector('[aria-current="true"]'),context=list.children[Math.max(0,Math.min(lineIndex-3,s.p.script.lines.length-10))];if(selected&&context)list.scrollTop+=context.getBoundingClientRect().top-list.getBoundingClientRect().top;s.focusedLine=s.line;}
 const nextLabel=s.root.querySelector('#dubbing-record-next');if(nextLabel)nextLabel.textContent=next?'다음 내 대사 · '+time(s.data.lines.find(l=>l.id===next.id)?.start||0)+'  '+next.text:'마지막 내 대사입니다. 녹음을 확인하고 저장해주세요.';
 s.root.querySelectorAll('[data-dubbing-record-line]').forEach(b=>b.onclick=()=>{
  if(s.dirty&&!confirm('현재 대사의 저장하지 않은 녹음을 버리고 다른 대사로 이동할까요?'))return;
  dubbingStopGuide(s);s.line=b.dataset.dubbingRecordLine;s.samples=null;s.cursor=0;s.dirty=false;s.pendingTake=null;dubbingRecordDraw(s);
 });
 const set=(id,disabled)=>s.root.querySelector('#'+id).disabled=disabled;
 set('dubbing-record-start',s.busy||!!s.run||locked||s.cursor>=slot.recordEnd-slot.start-.05);
 s.root.querySelector('#dubbing-record-start').innerHTML=icon('mic')+' '+(s.cursor>0?'이어서 녹음':'녹음 시작');
 set('dubbing-record-pause',s.busy||!s.run);set('dubbing-record-stop',s.busy||!s.run);
 set('dubbing-record-again',s.busy||!!s.run||locked||(!s.samples&&!slot.audioUrl));
 set('dubbing-record-save',s.busy||!!s.run||locked||!s.dirty||s.cursor<.1);set('dubbing-record-listen',s.busy||!!s.run);
 set('dubbing-record-submit',s.busy||!!s.run||s.dirty||locked||saved!==total);set('dubbing-record-rights',locked||s.busy||!!s.run);
 s.root.querySelector('#dubbing-record-limit').textContent=time(slot.recordEnd-slot.start);
 dubbingRecordTick(s);
}
function dubbingRecordTick(s){
 if(s.closed)return;cancelAnimationFrame(s.frame);
 const slot=s.data.lines.find(l=>l.id===s.line),limit=slot.recordEnd-slot.start;
 const cursor=s.run?Math.min(limit,s.run.offset+Math.max(0,s.ctx.currentTime-s.run.t0)):s.cursor;
 s.root.querySelector('#dubbing-record-clock').textContent=s.run&&s.ctx.currentTime<s.run.t0?'준비 '+Math.ceil(s.run.t0-s.ctx.currentTime):time(cursor);
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
 for(const l of s.data.lines){if(!l.audioUrl||(!includeMine&&l.id===s.line))continue;const end=l.start+l.duration;if(end<=from)continue;play(s.buffers.get(l.audioUrl+'?take='+encodeURIComponent(l.takeId)),when+Math.max(0,l.start-from),Math.max(0,from-l.start));}
}
async function dubbingStartRecording(s){
 if(s.busy||s.run||s.closed)return;s.busy=true;dubbingRecordDraw(s);let stream;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('HTTPS 주소의 최신 브라우저에서 마이크를 허용해주세요.');
  const prepared=dubbingRecordAudio(s);prepared.catch(()=>{});
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  await prepared;if(s.closed||document.hidden)throw Error('녹음 화면으로 돌아와 다시 시작해주세요.');
  if(!dubbingRecordState(s))s.data=await api(`/api/dubbing/projects/${s.p.id}/recording/${s.role}/start`,'POST',{soundId:s.p.sound.id});
  if(dubbingRecordState(s)?.state==='submitted')throw Error('이미 제출한 배역입니다.');
  if(!s.worklet){await s.ctx.audioWorklet.addModule('/recorder-worklet.js?v=20260929');s.worklet=true;}
  if(s.closed||document.hidden)throw Error('녹음 화면으로 돌아와 다시 시작해주세요.');
  const ctx=s.ctx,slot=s.data.lines.find(l=>l.id===s.line),preroll=Math.min(s.cursor?0.4:1,slot.start+s.cursor),when=ctx.currentTime+.15;
  const mic=ctx.createMediaStreamSource(stream),node=new AudioWorkletNode(ctx,'aifect-recorder',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'}),mute=ctx.createGain();mute.gain.value=0;mic.connect(node).connect(mute).connect(ctx.destination);
  const run={stream,mic,node,mute,chunks:[],offset:s.cursor,t0:when+preroll};s.run=run;s.pendingTake=null;
  node.port.onmessage=e=>{if(e.data==='done')run.flushed?.();else if(e.data?.d instanceof Float32Array)run.chunks.push(e.data);};
  dubbingPlayGuide(s,slot.start+s.cursor-preroll,when);s.preview=false;
  dubbingRecordMessage(s,'녹음 중 · 내 대사를 연기해주세요.');
 }catch(err){stream?.getTracks().forEach(t=>t.stop());dubbingRecordMessage(s,err.message);}
 finally{s.busy=false;dubbingRecordDraw(s);}
}
async function dubbingPauseRecording(s,ended=false){
 if(!s.run||s.busy)return;s.busy=true;const run=s.run,slot=s.data.lines.find(l=>l.id===s.line),limit=slot.recordEnd-slot.start;
 const cursor=Math.min(limit,run.offset+Math.max(0,s.ctx.currentTime-run.t0));dubbingStopGuide(s);cancelAnimationFrame(s.frame);
 await new Promise(resolve=>{const timer=setTimeout(resolve,600);run.flushed=()=>{clearTimeout(timer);resolve();};run.node.port.postMessage('stop');});
 run.stream.getTracks().forEach(t=>t.stop());run.mic.disconnect();run.node.disconnect();run.mute.disconnect();s.run=null;
 if(!s.closed){const rate=s.ctx.sampleRate,total=Math.floor(limit*rate);s.samples||=new Float32Array(total);const start=Math.round(run.offset*rate),frames=Math.min(total-start,Math.round((cursor-run.offset)*rate));if(frames>0)s.samples.set(AifectKaraoke.placeChunks(run.chunks,run.t0,rate,frames),start);s.cursor=cursor;s.dirty=cursor>=.1;dubbingRecordMessage(s,ended?'이 대사 구간이 끝났어요. 들어보고 저장하거나 다시 녹음해주세요.':'잠시 멈췄어요. 이어서 녹음하거나 지금까지의 목소리를 저장할 수 있어요.');}
 s.busy=false;dubbingRecordDraw(s);
}
async function dubbingSaveRecording(s){
 if(s.busy||s.run||!s.samples||s.cursor<.1)return;s.busy=true;dubbingRecordDraw(s);dubbingRecordMessage(s,'내 목소리를 저장하고 있어요…');
 try{
  let data=s.samples.subarray(0,Math.floor(s.cursor*s.ctx.sampleRate));
  if(s.ctx.sampleRate!==48000){const offline=new OfflineAudioContext(1,Math.floor(s.cursor*48000),48000),buffer=offline.createBuffer(1,data.length,s.ctx.sampleRate);buffer.copyToChannel(data,0);const src=offline.createBufferSource();src.buffer=buffer;src.connect(offline.destination);src.start();data=(await offline.startRendering()).getChannelData(0);}
  const record=dubbingRecordState(s),take=s.pendingTake||crypto.randomUUID();s.pendingTake=take;
  const r=await fetch(`/api/dubbing/projects/${s.p.id}/recording/${s.role}/lines/${s.line}?revision=${record.revision}&take=${take}`,{method:'PUT',credentials:'same-origin',headers:{'content-type':'audio/wav'},body:AifectKaraoke.encodeWav([data],48000),signal:AbortSignal.timeout(90000)});
  const result=await r.json();if(!r.ok)throw Object.assign(Error(result.error||'녹음 저장에 실패했어요.'),{status:r.status});
  s.data=result;s.buffers.clear();s.dirty=false;s.pendingTake=null;dubbingRecordMessage(s,'임시 저장했어요. 다른 대사를 선택하거나 모두 마쳤다면 배역 녹음을 제출해주세요.');
 }catch(err){
  let message=err.message+' 현재 녹음은 화면에 유지됩니다.';
  if(err.status===409)try{s.data=await api(`/api/dubbing/projects/${s.p.id}/recording`);s.pendingTake=null;message+=' 저장 상태를 갱신했어요. 임시 저장을 다시 누르면 현재 목소리로 교체됩니다.';}catch{}
  dubbingRecordMessage(s,message);
 }
 finally{s.busy=false;dubbingRecordDraw(s);}
}
function bindDubbingRecorder(view,root){
 const s={p:view.project,data:view.recordingData,role:view.project.roles.find(r=>r.mine).id,root,route:view.route,buffers:new Map(),sources:[],cursor:0,busy:false,dirty:false};
 if(dubbingRecorder)dubbingReleaseRecorder(dubbingRecorder);dubbingRecorder=s;s.line=s.p.script.lines.find(l=>l.roleId===s.role).id;
 root.querySelector('#dubbing-record-start').onclick=()=>dubbingStartRecording(s);
 root.querySelector('#dubbing-record-pause').onclick=()=>dubbingPauseRecording(s);
 root.querySelector('#dubbing-record-stop').onclick=()=>dubbingPauseRecording(s,true);
 root.querySelector('#dubbing-record-again').onclick=()=>{if(s.dirty&&!confirm('현재 대사 녹음을 새로 시작할까요?'))return;dubbingStopGuide(s);s.samples=null;s.cursor=0;s.dirty=false;s.pendingTake=null;void dubbingStartRecording(s);};
 root.querySelector('#dubbing-record-save').onclick=()=>dubbingSaveRecording(s);
 root.querySelector('#dubbing-record-listen').onclick=async()=>{
  if(s.preview){dubbingStopGuide(s);dubbingRecordMessage(s,'미리 듣기를 멈췄어요.');return;}
  if(s.busy||s.run)return;s.busy=true;dubbingRecordDraw(s);
  try{await dubbingRecordAudio(s);const slot=s.data.lines.find(l=>l.id===s.line),when=s.ctx.currentTime+.1;dubbingPlayGuide(s,Math.max(0,slot.start-.5),when,!s.samples);s.preview=true;
   if(s.samples&&s.cursor){const buffer=s.ctx.createBuffer(1,Math.floor(s.cursor*s.ctx.sampleRate),s.ctx.sampleRate);buffer.copyToChannel(s.samples.subarray(0,buffer.length),0);const src=s.ctx.createBufferSource();src.buffer=buffer;src.connect(s.ctx.destination);src.start(when+.5);s.sources.push(src);}
   s.previewTimer=setTimeout(()=>{dubbingStopGuide(s);if(!s.closed)dubbingRecordMessage(s,'미리 듣기가 끝났어요.');},(slot.recordEnd-slot.start+.8)*1000);
   dubbingRecordMessage(s,'배경음과 목소리 미리 듣기 · 다시 누르면 멈춰요.');
  }catch(err){dubbingRecordMessage(s,err.message);}finally{s.busy=false;dubbingRecordDraw(s);}
 };
 root.querySelector('#dubbing-record-submit').onclick=async()=>{
  if(!root.querySelector('#dubbing-record-rights').checked){dubbingRecordMessage(s,'공동 작품 공개에 동의한 뒤 제출해주세요.');return;}
  if(s.busy||s.run||s.dirty)return;s.busy=true;dubbingStopGuide(s);dubbingRecordDraw(s);
  try{s.data=await api(`/api/dubbing/projects/${s.p.id}/recording/${s.role}/submit`,'POST',{revision:dubbingRecordState(s).revision,rightsAccepted:true});dubbingRecordMessage(s,s.data.recording.final?'모든 배역이 모였어요. 완성 오디오를 합성하고 있습니다.':'배역 녹음을 제출했어요. 다른 참여자의 녹음을 기다립니다.');}
  catch(err){dubbingRecordMessage(s,err.message);}finally{s.busy=false;dubbingRecordDraw(s);}
 };
 dubbingRecordDraw(s);
}
window.addEventListener('beforeunload',e=>{if(dubbingRecorder?.dirty||dubbingRecorder?.run){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&dubbingRecorder?.run)void dubbingPauseRecording(dubbingRecorder);});
