function dubButton(action,label,id='',extra=''){
 return `<button type="button" class="small-button" data-edit-action="${action}" data-key="${esc(id)}" ${extra}>${label}</button>`;
}
function dubChoices(rows,value){return rows.map(([key,label])=>`<option value="${esc(key)}" ${key===value?'selected':''}>${esc(label)}</option>`).join('');}
function dubField(label,kind,id,name,value,rows=0){
 const attrs=`data-kind="${kind}" data-key="${esc(id)}" data-field="${name}"`;
 return `<label>${label}${rows?`<textarea ${attrs} rows="${rows}">${esc(value??'')}</textarea>`:`<input ${attrs} value="${esc(value??'')}">`}</label>`;
}
function dubPick(label,kind,id,name,value,choices){
 return `<label>${label}<select data-kind="${kind}" data-key="${esc(id)}" data-field="${name}">${dubChoices(choices,value)}</select></label>`;
}
function dubLineView(e,l){
 const roles=e.script.roles.map(r=>[r.id,r.name]);
 return `<article class="dub-line" data-line-card="${esc(l.id)}"><div class="dub-line-head">${dubPick('화자','line',l.id,'roleId',l.roleId,roles)}<details><summary>대사 작업</summary><div class="dub-actions">
 ${dubButton('line-up','위로',l.id)}${dubButton('line-down','아래로',l.id)}${dubButton('line-copy','복제',l.id)}${dubButton('line-delete','삭제',l.id)}${dubButton('ai-line','AI 수정',l.id)}</div></details></div>
 ${dubField('대사','line',l.id,'text',l.text,2)}
 <details><summary>연기와 시간</summary><div class="dub-fields">${dubField('감정','line',l.id,'emotion',l.emotion)}${dubField('연기 지시','line',l.id,'direction',l.direction)}${dubField('발화 시간(초)','line',l.id,'durationSeconds',l.durationSeconds)}${dubField('대사 뒤 여유(초)','line',l.id,'gapSeconds',l.gapSeconds)}</div></details></article>`;
}
function dubCueView(e,c){
 const rows=e.script.lines.filter(l=>l.sceneId===c.sceneId).map(l=>[l.id,l.order+'. '+l.text.slice(0,27)]);
 const end=e.script.lines.filter(l=>l.order>=(e.script.lines.find(l=>l.id===c.lineId)?.order||0)).map(l=>[l.id,l.order+'. '+l.text.slice(0,27)]);
 const music=c.kind==='bgm',label=music?'BGM':c.kind==='ambient'?'환경음':'효과음';
 return `<article class="dub-cue" data-cue-card="${esc(c.id)}"><div class="dub-line-head"><strong>${label}</strong>${dubButton('cue-delete','삭제',c.id)}</div>
 ${dubField(music?'음악 설명':'효과음 설명','cue',c.id,'prompt',c.prompt,2)}
 <details><summary>위치와 연출</summary><div class="dub-fields">
 ${dubPick('연결 대사','cue',c.id,'lineId',c.lineId,rows)}${dubPick('시작 위치','cue',c.id,'anchor',c.anchor,[['before','대사 전'],['start','대사 시작'],['after','대사 후'],['scene','장면 시작']])}
 ${music?dubPick('종료 대사','cue',c.id,'endLineId',c.endLineId||'',[['','지정 길이'],...end]):''}
 ${dubField(music?'음악 분위기·이름':'연출 이름','cue',c.id,'label',c.label||'')}${dubField('길이(초)','cue',c.id,'durationSeconds',c.durationSeconds)}
 ${dubField('시작 지연(초)','cue',c.id,'offsetSeconds',c.offsetSeconds)}${dubField('볼륨 (0~0.5)','cue',c.id,'volume',c.volume)}
 </div></details></article>`;
}
function dubSceneView(e,sc,i){
 const lines=e.script.lines.filter(l=>l.sceneId===sc.id),cues=e.script.soundCues.filter(c=>c.sceneId===sc.id);
 const pieces=lines.map(l=>{
  const at=cues.filter(c=>c.lineId===l.id);
  return at.filter(c=>c.anchor!=='after').map(c=>dubCueView(e,c)).join('')+dubLineView(e,l)+at.filter(c=>c.anchor==='after').map(c=>dubCueView(e,c)).join('');
 });
 const len=lines.reduce((n,l)=>n+(+l.durationSeconds||0)+(+l.gapSeconds||0),0);
 return `<details class="dub-scene" data-scene-card="${esc(sc.id)}" ${e.folded.has(sc.id)?'':'open'}>
 <summary><span>SCENE ${String(i+1).padStart(2,'0')}</span><b data-scene-title="${esc(sc.id)}">${esc(sc.title)||'새 장면'}</b><small data-scene-time="${esc(sc.id)}">${lines.length}대사 · ${time(len)}</small></summary><div class="dub-scene-body">
 ${dubField('장면 제목','scene',sc.id,'title',sc.title)}${dubField('장면 설명','scene',sc.id,'description',sc.description,2)}
 <details><summary>장면 작업</summary><div class="dub-actions">${[['scene-up','위로'],['scene-down','아래로'],['scene-copy','복제'],['scene-delete','삭제'],['ai-scene','AI 수정']].map(([a,t])=>dubButton(a,t,sc.id)).join('')}</div></details>
 ${pieces.join('')}${cues.filter(c=>!lines.some(l=>l.id===c.lineId)).map(c=>dubCueView(e,c)).join('')}
 ${dubButton('line-add','+ 대사',sc.id)}</div></details>`;
}
function dubInfoView(e){
 const D=AifectDubbing,o=e.options,s=e.script;
 const choice=a=>a.map(v=>[v,v]),remove=s.roles.length>1;
 return `<aside class="dub-info" ${e.info?'':'hidden'}><div class="dub-line-head"><h2>작품 설정</h2>${dubButton('info','접기')}</div><fieldset><legend>장르 · 최대 2개</legend>${D.DUBBING_GENRES.map(g=>`<label class="dub-check"><input type="checkbox" data-genre="${g}" ${o.genres.includes(g)?'checked':''}>${g}</label>`).join('')}</fieldset>
 ${dubPick('목표 시간','options','','minutes',String(o.minutes),D.DUBBING_LENGTHS.map(n=>[String(n),dubbingLengthLabel(n)]))}
 ${dubPick('분위기','options','','mood',o.mood,choice(D.DUBBING_MOODS))}${dubPick('결말','options','','ending',o.ending,choice(D.DUBBING_ENDINGS))}
 <h3>등장인물 ${s.roles.length}명</h3>${s.roles.map((r,i)=>`<section>${dubField(String.fromCharCode(65+i)+' · 배역 이름','role',r.id,'name',r.name)}${dubPick('성별','role',r.id,'gender',r.gender||'unspecified',D.DUBBING_GENDERS.map(v=>[v,D.dubbingGenderLabel(v)]))}${dubField('성격','role',r.id,'personality',r.personality,2)}${remove?dubButton('role-delete','배역 삭제',r.id):''}</section>`).join('')}
 ${s.roles.length<6?dubButton('role-add','+ 배역'):''}</aside>`;
}
function dubEditorHTML(e){
 const s=e.script;
 return `<header class="dub-editor-head"><h1>대본 편집</h1><span role="status" data-editor-status>${e.unsynced?'편집 중':'비공개 작성본'}</span>${dubButton('retry','동기화')}${dubButton('save','대본 저장','')}</header>
 <div class="dub-actions" data-editor-conflict ${e.conflict?'':'hidden'}>다른 기기의 변경사항이 있어요. ${dubButton('fork','내 버전을 사본으로 저장')}${dubButton('remote','서버 버전 열기')}</div>
 <p class="dubbing-feedback" role="status"></p><div class="dub-editor-layout ${e.info?'with-info':''}">
 <nav class="dub-index" aria-label="장면 목록">${s.scenes.map((sc,i)=>dubButton('goto',String(i+1).padStart(2,'0')+' '+esc(sc.title),sc.id)).join('')}</nav>
 <section class="dub-cards">${dubField('작품 제목','script','','title',s.title)}${e.sourceText?'<details><summary>붙여넣은 원문과 분류 확인</summary><pre>'+esc(e.sourceText)+'</pre>'+(e.notes||[]).map(n=>'<p>'+n.row+'행 · '+esc(n.text)+'</p>').join('')+'</details>':''}<div class="dub-line-head"><span data-editor-duration></span>${dubButton('info','작품 설정')}</div>
 ${s.scenes.map((sc,i)=>dubSceneView(e,sc,i)).join('')}
 </section>${dubInfoView(e)}</div>
 <div class="dub-addbar" aria-label="추가 메뉴">${[['line-add','+ 대사'],['scene-add','+ 장면'],['sfx-add','+ 효과음'],['bgm-add','+ BGM']].map(([a,t])=>dubButton(a,t)).join('')}${e.undo?dubButton('undo','실행 취소'):''}</div>`;
}
