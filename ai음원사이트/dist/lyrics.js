let lyricEditor=null,currentCues=[],lyricPanelState=null;
function lyricsEditorHTML(t={}){const mode=t.alignment&&['queued','processing','ready','failed'].includes(t.alignment.state)?'auto':t.lyrics_mode||(t.id?'none':'auto');return `<section id="lyrics-editor" class="lyrics-editor" data-duration="${Number(t.duration)||1200}"><div class="form-section-heading"><span>♪</span><h2>노래에 맞춰 흐르는 가사</h2></div><label class="form-field">가사 등록 방식<select name="lyrics_mode" id="lyrics-mode"><option value="auto" ${mode==='auto'?'selected':''}>가사 입력하고 자동 싱크 (추천)</option><option value="none" ${mode==='none'?'selected':''}>가사 없음 / 나중에 등록</option><option value="synced" ${mode==='synced'?'selected':''}>직접 싱크 등록 / LRC</option></select></label>${alignmentEditorHTML(t,mode==='auto')}<div id="lyrics-edit-body" ${mode!=='synced'?'hidden':''}><p class="field-help">LRC 파일에 담긴 시간을 불러오거나, 가사를 붙여넣고 음원을 들으며 줄마다 시작 시간을 지정하세요.</p><label class="form-field">가사 파일 불러오기<input id="lyrics-file" type="file" accept=".lrc,.txt"><small class="field-help">LRC 또는 TXT · UTF-8 · 최대 64KB</small></label><label class="form-field">가사 붙여넣기<textarea id="lyrics-source" maxlength="12000" placeholder="가사를 한 줄씩 입력하거나, 시간 정보가 있는 LRC 내용을 붙여넣으세요.">${esc(t.lyrics||'')}</textarea></label><button type="button" id="lyrics-build" class="small-button">가사 줄 불러오기</button><div class="lyric-preview-player"><audio id="lyrics-audio" preload="metadata" ${t.duration>0?`src="/api/studio/tracks/${t.id}/lyrics/audio"`:''}></audio><div class="inline-actions"><button type="button" id="lyrics-preview-play" class="small-button" disabled>음원 미리 듣기</button><output id="lyrics-clock">00:00.000</output><button type="button" id="lyrics-stamp-next" class="small-button" disabled>다음 줄에 현재 시간 찍기</button></div><input id="lyrics-preview-seek" type="range" min="0" max="0" step="0.01" value="0" aria-label="가사 싱크 미리 듣기 위치" disabled><p class="field-help" id="lyrics-audio-help">${t.status==='published'?'공개된 음원을 들으며 시간을 조정할 수 있습니다.':'위에서 원본 음원을 선택하면 미리 들으며 시간을 지정할 수 있어요. LRC 파일은 음원 재생 없이 불러올 수 있습니다.'}</p></div><div id="lyrics-rows" class="lyrics-rows"></div><p class="field-help">분:초.밀리초 형식으로 직접 수정할 수 있어요. 예: 00:12.500. 가사를 저장하면 리스너 화면에서 해당 시간에 자동으로 표시됩니다.</p><p id="lyrics-editor-error" class="form-error" role="alert"></p></div></section>`;}
function cleanupLyricsEditor(){if(lyricEditor){clearTimeout(lyricEditor.alignmentTimer);for(const event of ['onpause','onplay','ontimeupdate','onloadedmetadata','onerror'])lyricEditor.audio[event]=null;lyricEditor.audio.pause();lyricEditor.audio.removeAttribute('src');lyricEditor.audio.load();if(lyricEditor.url)URL.revokeObjectURL(lyricEditor.url);lyricEditor=null;}lyricPanelState=null;}
function bindLyricsEditor(){
 const root=$('#lyrics-editor');if(!root)return;
 const source=$('#lyrics-source'),player=$('#lyrics-audio'),box=$('#lyrics-rows'),error=$('#lyrics-editor-error'),mode=$('#lyrics-mode');
 const state=lyricEditor={root,audio:player,url:null,dirty:false};
 function rowsFrom(cues){box.innerHTML=cues.flatMap(c=>(c.text||'').split('\n').map(text=>({time:c.time,text}))).map((c,i)=>`<div class="lyric-edit-row"><button type="button" class="lyric-number" data-preview-row="${i}" aria-label="${i+1}번째 가사부터 미리 듣기">${i+1}</button><input class="lyric-time-input" aria-label="${i+1}번째 가사 시작 시간" placeholder="00:00.000" value="${c.time==null?'':AifectLyrics.timestamp(c.time)}"><input class="lyric-text-input" aria-label="${i+1}번째 가사" maxlength="500" value="${esc(c.text)}"><button type="button" class="text-link" data-stamp-row="${i}">현재 시간</button></div>`).join('');state.dirty=false;}
 function buildRows(){
  error.textContent='';const text=source.value;if(text.length>AifectLyrics.MAX_LYRICS)throw new Error('가사는 최대 12,000자까지 입력해주세요.');
  if(/\[\d{1,3}:/.test(text))rowsFrom(AifectLyrics.parseLrc(text,Number(root.dataset.duration)));
  else{const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(!lines.length||lines.length>500)throw new Error('가사를 1줄 이상, 500줄 이하로 입력해주세요.');rowsFrom(lines.map(text=>({time:null,text})));}
 }
 state.build=buildRows;
 mode.onchange=()=>{$('#lyrics-edit-body').hidden=mode.value!=='synced';$('#auto-lyrics-editor').hidden=mode.value!=='auto';if(mode.value!=='synced')player.pause();};
 source.oninput=()=>{state.dirty=true;};
 $('#lyrics-build').onclick=()=>{try{buildRows();}catch(e){error.textContent=e.message;}};
 $('#lyrics-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>65536)throw new Error('가사 파일은 64KB 이하로 선택해주세요.');let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error('UTF-8로 저장된 LRC 또는 TXT 파일을 선택해주세요.');}if(!root.isConnected)return;source.value=text;state.dirty=true;mode.value='synced';mode.onchange();buildRows();}catch(err){error.textContent=err.message;}};
 const ready=()=>{const available=Number.isFinite(player.duration)&&player.duration>0;$('#lyrics-preview-play').disabled=!available;$('#lyrics-stamp-next').disabled=!available;$('#lyrics-preview-seek').disabled=!available;if(available){$('#lyrics-preview-seek').max=player.duration;root.dataset.duration=player.duration;}};
 player.onloadedmetadata=ready;
 player.ontimeupdate=()=>{$('#lyrics-clock').textContent=AifectLyrics.timestamp(player.currentTime);$('#lyrics-preview-seek').value=player.currentTime;let selected=-1;const rows=[...box.children];rows.forEach((row,i)=>{const parts=row.querySelector('.lyric-time-input').value.split(':');const seconds=parts.length===2?Number(parts[0])*60+Number(parts[1]):-1;if(seconds>=0&&seconds<=player.currentTime)selected=i;});rows.forEach((row,i)=>row.classList.toggle('is-preview-current',i===selected));};
 player.onplay=()=>{audio.pause();$('#lyrics-preview-play').textContent='미리 듣기 일시정지';};
 player.onpause=()=>{$('#lyrics-preview-play').textContent='음원 미리 듣기';};
 player.onerror=()=>{error.textContent='이 브라우저에서 원본을 미리 듣지 못했습니다. LRC로 등록하거나 음원 변환 후 스튜디오에서 시간을 지정해주세요.';};
 $('#lyrics-preview-play').onclick=async()=>{try{if(player.paused)await player.play();else player.pause();}catch{error.textContent='음원을 먼저 선택해주세요.';}};
 $('#lyrics-preview-seek').oninput=e=>{player.currentTime=Number(e.target.value);};
 function stamp(row){if(!Number.isFinite(player.duration))throw new Error('음원을 먼저 선택해주세요.');const input=row.querySelector('.lyric-time-input');input.value=AifectLyrics.timestamp(player.currentTime);input.setCustomValidity('');row.classList.add('has-time');}
 root.addEventListener('click',e=>{const previewButton=e.target.closest('[data-preview-row]');if(previewButton){const input=previewButton.closest('.lyric-edit-row').querySelector('.lyric-time-input');const parts=input.value.split(':');if(parts.length===2&&Number.isFinite(Number(parts[1]))){player.currentTime=Number(parts[0])*60+Number(parts[1]);player.play().catch(()=>{error.textContent='음원이 준비된 뒤 다시 미리 들어주세요.';});}return;}const button=e.target.closest('[data-stamp-row]');if(!button)return;try{stamp(button.closest('.lyric-edit-row'));}catch(err){error.textContent=err.message;}});
 $('#lyrics-stamp-next').onclick=()=>{try{if(state.dirty||!box.children.length)buildRows();const row=[...box.children].find(row=>!row.querySelector('.lyric-time-input').value);if(!row){error.textContent='모든 줄의 시간이 지정됐어요. 각 줄의 시간을 직접 수정할 수 있습니다.';return;}stamp(row);row.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(e){error.textContent=e.message;}};
 const fileInput=$('#upload-form input[name="audio"]');if(fileInput)fileInput.addEventListener('change',()=>{player.pause();if(state.url)URL.revokeObjectURL(state.url);const file=fileInput.files[0];if(file){state.url=URL.createObjectURL(file);player.src=state.url;}else{player.removeAttribute('src');player.load();}ready();});
 if(source.value){try{buildRows();}catch(e){error.textContent=e.message;}}bindAlignmentEditor();
}
function applyLyrics(fd){
 if(fd.get('lyrics_mode')==='auto'){fd.set('lyrics_source',AifectAlignment.plainLyrics($('#auto-lyrics-source').value));fd.set('lyrics_language',$('#auto-lyrics-language').value);fd.delete('lyrics');return;}
 if(fd.get('lyrics_mode')!=='synced'){fd.set('lyrics_mode','none');fd.set('lyrics','');return;}
 if(!lyricEditor)throw new Error('가사 편집기를 다시 열어주세요.');
 if(lyricEditor.dirty||!$('#lyrics-rows').children.length)lyricEditor.build();
 const rows=[...$('#lyrics-rows').children],text=rows.map((row,i)=>{const input=row.querySelector('.lyric-time-input'),value=input.value.trim();if(!/^\d{1,3}:[0-5]\d(?:[.:]\d{1,3})?$/.test(value))throw new Error(`${i+1}번째 가사 시작 시간을 지정해주세요.`);return `[${value}]${row.querySelector('.lyric-text-input').value}`;}).join('\n');
 const normalized=AifectLyrics.serializeLrc(AifectLyrics.parseLrc(text,Number(lyricEditor.root.dataset.duration)));if(normalized.length>AifectLyrics.MAX_LYRICS)throw new Error('시간을 포함한 가사는 최대 12,000자까지 등록할 수 있습니다.');fd.set('lyrics',normalized);if(lyricEditor.loadedJobId)fd.set('lyrics_job_id',lyricEditor.loadedJobId);
}
const hasFullLyrics=t=>!!me&&t?.lyrics_access==='full'&&Number(t.lyrics_access_until)*1000>Date.now();
let lyricLines=[],lyricDisplay=null,lyricRequest=0,lyricPending=null,lyricRetryAt=0;
const LYRIC_PREFETCH_SECONDS=3,LYRIC_TRANSITION_GRACE=1.5;
function resetLyricLines(){lyricLines=[];lyricDisplay=null;lyricRequest++;lyricPending=null;lyricRetryAt=0;}
function lyricsPanel(t){
 if(t.lyrics_mode!=='synced')return `<section class="surface lyrics-panel"><h2>가사</h2><p class="field-help">아직 등록된 가사가 없습니다.</p></section>`;
 const full=hasFullLyrics(t);let cues=[];if(full){try{cues=AifectLyrics.parseLrc(t.lyrics);}catch{}}
 return `<section class="surface lyrics-panel" id="song-lyrics" data-track="${t.id}" data-mode="${full?'full':'line'}"><div class="section-heading"><h2>${full?'싱크 가사':'지금 흐르는 가사'} <span class="synced-badge">${full?'PREMIUM':'한 줄 가사'}</span></h2>${full?'<button class="small-button" id="lyrics-follow" aria-pressed="true">자동 따라가기 켜짐</button>':''}</div><div class="lyrics-toolbar"><p id="lyrics-play-status">이 곡을 재생하면 현재 가사가 표시됩니다.</p><button class="small-button" data-play="${t.id}">이 곡 재생 ${icon('play')}</button></div>${full?`<div class="lyrics-scroll" tabindex="0" role="region" aria-label="시간에 맞춰 표시되는 가사">${cues.map((c,i)=>`<button type="button" class="lyric-line" data-lyric-index="${i}" data-seek="${c.time}" data-track="${t.id}" aria-label="${time(c.time)} 가사로 이동"><span class="lyric-line-time">${time(c.time)}</span><span>${esc(c.text||'♪ 간주')}</span></button>`).join('')}</div>`:'<div class="lyrics-current-line" id="current-lyric-line">♪ 음악을 재생해주세요</div><div class="lyrics-upgrade"><span>전체 가사와 자동 따라가기는 Premium에서</span><a href="#membership">이용 혜택 보기 →</a></div>'}</section>`;
}
function clearFullLyrics(){
 for(const [id,t] of trackMap)if(t.lyrics_access==='full')trackMap.set(id,{...t,lyrics:'',lyrics_access:'line',lyrics_access_until:null});
 if(current?.lyrics_access==='full'){current={...current,lyrics:'',lyrics_access:'line',lyrics_access_until:null};currentCues=[];resetLyricLines();}
 const panel=$('#song-lyrics');if(panel?.dataset.mode==='full'){const t=trackMap.get(panel.dataset.track);if(t){panel.outerHTML=lyricsPanel(t);bindLyricsPanel();}}
}
function refreshLyricsPanel(){const panel=$('#song-lyrics');if(panel&&current?.id===panel.dataset.track){panel.outerHTML=lyricsPanel(current);bindLyricsPanel();}}
function setCurrentLyrics(t){resetLyricLines();try{currentCues=hasFullLyrics(t)&&t.lyrics_mode==='synced'?AifectLyrics.parseLrc(t.lyrics):[];}catch{currentCues=[];}updateSyncedLyrics(true);}
function bindLyricsPanel(){
 const panel=$('#song-lyrics');if(!panel)return;const track=trackMap.get(panel.dataset.track);if(current?.id===track?.id){current=track;try{currentCues=hasFullLyrics(track)?AifectLyrics.parseLrc(track.lyrics):[];}catch{currentCues=[];}}
 const state=lyricPanelState={panel,follow:true,index:-2};const follow=$('#lyrics-follow'),scroller=panel.querySelector('.lyrics-scroll');
 if(follow&&scroller){const setFollow=value=>{state.follow=value;follow.textContent=value?'자동 따라가기 켜짐':'자동 따라가기 꺼짐';follow.setAttribute('aria-pressed',String(value));};follow.onclick=()=>{setFollow(!state.follow);updateSyncedLyrics(true);};for(const event of ['wheel','touchmove'])scroller.addEventListener(event,()=>setFollow(false),{passive:true});}
 updateSyncedLyrics(true);
}
function containsLyricTime(line,seconds){return line?.id===current?.id&&seconds>=line.from&&(seconds<line.until||(line.until>=current.duration&&seconds<=current.duration));}
function lineAtTime(seconds=audio.currentTime){return lyricLines.find(line=>containsLyricTime(line,seconds))||null;}
async function fetchCurrentLine(seconds=audio.currentTime,prefetch=false){
 if(!current||hasFullLyrics(current)||lyricPending||Date.now()<lyricRetryAt||lineAtTime(seconds))return;
 const t=current;seconds=Math.max(0,Math.min(seconds,t.duration));if(!me&&seconds>=60)return;
 const token=++lyricRequest;lyricPending={token,seconds,prefetch};
 try{
  const d=await api(`/api/tracks/${t.id}/lyrics/line?at=${seconds}`);if(token!==lyricRequest||t.id!==current?.id)return;
  const line=d.line?{...d.line,id:t.id}:{id:t.id,from:0,until:me?t.duration:Math.min(t.duration,60),text:'',intro:false};
  if(!containsLyricTime(line,seconds))throw new Error('Invalid lyric interval');
  // Only keep nearby lines in memory; free listeners never receive a full transcript.
  lyricLines=[...lyricLines.filter(c=>c.from!==line.from),line].slice(-3);lyricRetryAt=0;
 }
 catch{if(token===lyricRequest)lyricRetryAt=Date.now()+5000;}
 finally{if(token===lyricRequest){lyricPending=null;updateSyncedLyrics(true);}}
}
function updateSyncedLyrics(force=false){
 if(current?.lyrics_access==='full'&&!hasFullLyrics(current))clearFullLyrics();
 const limitReached=!me&&audio.currentTime>=60,full=hasFullLyrics(current),hasLyrics=current?.lyrics_mode==='synced',index=limitReached?-1:AifectLyrics.activeCueIndex(currentCues,audio.currentTime),cue=currentCues[index],hud=$('#player-lyric');
 const line=lineAtTime();if(line)lyricDisplay=line;
 // Bridge a slow natural transition briefly, but never carry a line across a seek.
 const display=line||(lyricDisplay&&lyricDisplay.id===current?.id&&audio.currentTime>=lyricDisplay.from&&audio.currentTime<lyricDisplay.until+LYRIC_TRANSITION_GRACE?lyricDisplay:null);
 const text=limitReached?'로그인하고 전체곡을 이어 들으세요':full?(cue?.text||'♪ '+(index<0?'전주':'간주')):display?(display.text||'♪ '+(display.intro?'전주':'간주')):'♪';
 if(hud){hud.hidden=!hasLyrics;hud.href=current?'#song/'+current.id:'#home';hud.textContent=hasLyrics?text:'';}
 const state=lyricPanelState;if(state?.panel.isConnected){const active=current?.id===state.panel.dataset.track,indexHere=active?index:-1;
  if(state.panel.dataset.mode==='line'){const el=$('#current-lyric-line');if(el)el.textContent=active?text:'♪ 음악을 재생해주세요';const status=$('#lyrics-play-status');if(status)status.textContent=active?(lyricRetryAt>Date.now()&&!line?'가사를 불러오지 못했어요. 잠시 후 다시 시도합니다.':'음악에 맞춰 현재 가사 한 줄이 바뀝니다.'):'이 곡을 재생하면 현재 가사가 표시됩니다.';}
  else if(force||state.index!==indexHere){state.index=indexHere;state.panel.querySelectorAll('.lyric-line').forEach((line,i)=>{line.classList.toggle('is-current',i===indexHere);if(i===indexHere)line.setAttribute('aria-current','true');else line.removeAttribute('aria-current');});$('#lyrics-play-status').textContent=!active?'이 곡을 재생하면 현재 가사를 따라갑니다.':index<0?'♪ 첫 가사를 기다리고 있어요.':'가사를 누르면 해당 구간으로 이동해요.';
   if(state.follow&&indexHere>=0){const scroller=state.panel.querySelector('.lyrics-scroll'),el=scroller.children[indexHere];if(el){const top=el.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-scroller.clientHeight/2+el.clientHeight/2;scroller.scrollTo({top,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}
  }
 }
 if(hasLyrics&&!full&&!limitReached){
  if(!line)void fetchCurrentLine();
  else if(!audio.paused&&line.until-audio.currentTime<=LYRIC_PREFETCH_SECONDS&&line.until<current.duration&&(me||line.until<60)&&!lineAtTime(line.until))void fetchCurrentLine(line.until,true);
 }
}
audio.addEventListener('seeking',()=>{lyricDisplay=null;lyricRequest++;lyricPending=null;lyricRetryAt=0;updateSyncedLyrics(true);});
for(const event of ['timeupdate','seeked','loadedmetadata','ended','emptied'])audio.addEventListener(event,()=>updateSyncedLyrics());
