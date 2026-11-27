let studioData={producer:null,artists:[],tracks:[]};
let uploadFormDraft=null;
const uploadDraftControls=form=>[...form.querySelectorAll('input:not([name="genres"]),textarea,select')].filter(field=>!field.closest('#lyrics-rows'));
function rememberUploadForm(){
 const owner=me?.id,form=$('#upload-form');
 if(uploadFormDraft?.owner!==owner)uploadFormDraft=null;
 if(!owner||form?.dataset.owner!==owner||form._submitted)return;
 uploadFormDraft={
  owner,artist:form.elements.artist_id.value,genres:[...form.querySelectorAll('[name="genres"]')].map(i=>i.value),
  values:uploadDraftControls(form).map(field=>({value:field.value,checked:field.checked,files:field.type==='file'?[...field.files]:null})),
  filename:$('#auto-lyrics-filename')?.textContent||'',
  directRows:[...form.querySelectorAll('#lyrics-rows input')].map(field=>field.value),
  dirty:lyricEditor?.dirty,draft:form._draft,request:form._request
 };
}
function restoreUploadForm(form,stored){
 form._draft=stored.draft;form._request=stored.request;
 uploadDraftControls(form).forEach((field,index)=>{
  const draft=stored.values[index];if(!draft)return;
  if(field.type==='file'){
   if(!draft.files?.length)return;
   const selected=new DataTransfer();for(const file of draft.files)selected.items.add(file);field.files=selected.files;
  }else if(field.type==='checkbox')field.checked=draft.checked;
  else field.value=draft.value;
 });
 const filename=$('#auto-lyrics-filename');
 if(stored.filename&&filename){filename.textContent=stored.filename;filename.hidden=false;}
}
const bioField=(label,name,value='',hint='')=>`<label class="form-field">${label}<textarea name="${name}" maxlength="1000" placeholder="${esc(hint)}">${esc(value)}</textarea><small class="field-help">최대 1,000자</small></label>`;
function genreField(value='K-POP'){const custom=!genres.includes(value);return `<div class="genre-field"><label class="form-field">장르<select data-genre-select ${custom?'':'name="genre"'}>${genres.slice(1).map(g=>`<option value="${esc(g)}" ${g===value?'selected':''}>${esc(g)}</option>`).join('')}<option value="__custom" ${custom?'selected':''}>직접 입력</option></select></label><label class="form-field" data-custom-genre ${custom?'':'hidden'}>장르 직접 입력<input name="genre" value="${custom?esc(value):''}" maxlength="80" required ${custom?'':'disabled'} placeholder="예: Dark Contemporary Korean Folklore Fusion"></label><small class="field-help">어울리는 장르가 없으면 직접 입력하세요. 세부 분위기·스타일은 태그에도 추가할 수 있습니다.</small></div>`;}
document.addEventListener('change',e=>{if(!e.target.matches('[data-genre-select]'))return;const select=e.target,custom=select.value==='__custom',label=select.closest('.genre-field').querySelector('[data-custom-genre]'),input=label.querySelector('input');label.hidden=!custom;input.disabled=!custom;if(custom){select.removeAttribute('name');input.focus();}else select.name='genre';});
document.addEventListener('focusout',e=>{if(e.target.matches('[data-custom-genre] input'))e.target.value=e.target.value.trim();});

const profileImageURL=(p,kind)=>p?.image_version?`/media/${kind}/${p.id}?v=${p.image_version}`:'';
const bannerURL=p=>p?.banner_version?`/media/banner/${p.id}?v=${p.banner_version}`:'';
function imageField(label,name,src='',round=false,required=false){return `<div class="image-field ${round?'is-portrait':''}"><div class="image-preview ${round?'profile-avatar':''}">${src||round?`<img class="${round?'profile-avatar-image':''}" src="${esc(src||DEFAULT_AVATAR)}" alt="${label} 미리보기">`:`<span>${icon('plus')}</span>`}</div><div class="image-field-controls"><label class="form-field"><span>${label}${required?uploadRequiredMark:''}</span><input type="file" name="${name}" accept="image/jpeg,image/png,image/webp" ${required?'required':''} aria-label="${label}" data-image-input></label><p class="field-help">${required?'JPG · PNG · WebP · 최대 5MB · 정사각형 권장<br>최대 1,600px WebP로 자동 압축합니다.':'JPG · PNG · WebP / 최대 5MB<br>업로드 시 WebP로 자동 압축합니다 (최대 1600px).<br>정사각형 이미지를 권장합니다.'}</p><span class="image-selection" role="status"></span><button type="button" class="text-link" data-reset-image hidden>선택 취소</button></div></div>`;}
function uploadQuotaHTML(q){return q?`<section class="upload-quota" aria-label="이번 달 제작곡 업로드"><strong>이번 달 제작곡 ${q.used} / ${q.limit}곡 · ${q.remaining}곡 남음</strong><p>매월 1일 한국시간에 새로 시작합니다. 커버곡은 제한 없이 올릴 수 있습니다.</p></section>`:'';}
const uploadRequiredMark='<span class="upload-required-mark" aria-hidden="true">*</span>';
function uploadHTML(d){
 const producer=d.producer;
 return `<div class="upload-page-heading"><h1>음원 업로드</h1>
  <div class="upload-heading-tools"><span>${uploadRequiredMark} 필수 입력</span><button type="button" class="small-button upload-qa-button" data-upload-qa><span aria-hidden="true">?</span> 업로드 Q&A</button></div>
 </div>${uploadQuotaHTML(d.upload_quota)}
 <div class="upload-layout"><form id="upload-form" class="surface upload-form">
  <section class="upload-section">
   <h2>음원 및 커버 이미지</h2>
   <div class="upload-files">
    <label class="file-zone"><strong>원본 음원${uploadRequiredMark}</strong><span>WAV · FLAC · MP3 · 최대 80MB · 5초~20분</span><input name="audio" type="file" accept=".wav,.flac,.mp3" required aria-label="원본 음원"></label>
    ${imageField('커버 이미지','cover','',false,true)}
   </div>
  </section>
  <section class="upload-section"><h2>곡 기본 정보</h2>
   ${formField(`<span>곡 제목${uploadRequiredMark}</span>`,'title','text','','required maxlength="120" placeholder="곡 제목 · 최대 120자"')}
  </section>
  <section class="upload-section"><h2>제작자 및 아티스트</h2>
   <div class="upload-profile-grid">
    <div><h3>작곡가 · 제작자</h3>
     ${formField(`<span>작곡가 / 제작자 이름${uploadRequiredMark}</span>`,'producer','text',producer?.name||me.name,'required maxlength="60"')}
     ${imageField('작곡가 / 제작자 사진','producer_image',profileImageURL(producer,'producer'),true)}
     ${bioField('작곡가 / 제작자 소개','producer_bio',producer?.bio||'','작업 스타일이나 음악 활동을 소개해 주세요.')}
     <p class="field-help">프로필을 수정하면 기존 곡에도 반영됩니다.</p>
    </div>
    <div><h3>AI 가수 · 아티스트</h3>
     <label class="form-field">표시할 이름<select name="artist_id" id="upload-artist"><option value="none">내 활동명으로 표시</option><option value="">새 AI 가수 만들기</option>${d.artists.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label>
     <div id="upload-artist-fields"></div>
    </div>
   </div>
  </section>
  <section class="upload-section"><h2>장르 및 곡 소개</h2>
   ${uploadGenresHTML()}
   <label class="form-field">곡 소개<textarea name="description" maxlength="4000" placeholder="곡에 담은 이야기를 소개해 주세요. (최대 4,000자)"></textarea></label>
  </section>
  ${lyricsEditorHTML()}
  <section class="upload-section"><h2>제작 크레딧 및 태그</h2>
   ${productionCreditsFieldsHTML('',true)}${participationFields()}${songTagFieldHTML()}
  </section>
  <section class="upload-section"><h2>등록 동의${uploadRequiredMark}</h2>
   ${originalUploadConsentHTML()}
   <button type="submit" class="primary-button" id="upload-submit">음원 등록 ${icon('upload')}</button>
   <div class="upload-progress" hidden><progress aria-label="파일 전송 진행률" max="100" value="0"></progress><p role="status" aria-live="polite"></p><small>전송이 끝날 때까지 이 화면을 유지해 주세요.</small></div>
  </section>
  <p class="form-error" role="alert"></p>
 </form></div>`;
}
function uploadQaHTML(){
 return `<div class="upload-qa"><h2>업로드 Q&A</h2><dl>
  <dt>어떤 파일을 준비해야 하나요?</dt><dd>5초~20분, 80MB 이하 WAV·FLAC·MP3와 5MB 이하 JPG·PNG·WebP 커버가 필요합니다. 커버는 정사각형을 권장하며 최대 1,600px WebP로 압축됩니다.</dd>
  <dt>장르는 어떻게 추가하나요?</dt><dd>최대 3개까지 등록할 수 있으며 첫 장르가 대표 장르입니다. 검색·직접 입력·추천 버튼을 함께 사용하세요. 자동 장르 기입을 누르면 AI가 선택한 음원을 분석해 빈자리에 추가합니다.</dd>
  <dt>어떤 가사 방식을 선택하나요?</dt><dd>자동 싱크는 음원 변환 후 적용됩니다. 가사가 없는 곡은 ‘가사가 없는 노래’, 스튜디오에서 가사를 추가할 곡은 ‘나중에 등록’을 선택하세요. 타임코드를 직접 지정하거나 LRC 파일을 불러올 수도 있습니다.</dd>
  <dt>가사 파일과 입력 제한은 무엇인가요?</dt><dd>자동 싱크는 최대 6,000자·200줄·줄당 300자입니다. 반복 가사는 모두 적고, 대괄호 안 설명은 자동으로 제외합니다. UTF-8 TXT(자동 싱크) 또는 LRC·TXT(직접 싱크)는 최대 64KB입니다.</dd>
  <dt>등록하면 어디에 표시되나요?</dt><dd>커버는 곡 목록과 플레이어에, 제작자와 아티스트의 사진·소개는 각 프로필에 표시됩니다. 프로필은 스튜디오에서 수정할 수 있습니다. 감상용 음원과 60초 미리 듣기가 자동으로 생성됩니다.</dd>
  <dt>업로드 횟수와 이용 조건은 어디에서 확인하나요?</dt><dd>이번 달 제작곡 한도는 화면 상단에 표시됩니다. 매월 1일 한국시간에 초기화되며 커버곡은 제한이 없습니다. 저작권과 반주·커버 이용허락은 <a href="/terms#original-upload" target="_blank" rel="noopener">음원 이용허락 약관</a>에서 확인할 수 있습니다.</dd>
 </dl></div>`;
}
function artistUploadFields(a){return `${formField(`<span>AI 가수 / 아티스트 이름${uploadRequiredMark}</span>`,'artist','text',a?.name||'','required maxlength="60"')}${imageField('AI 가수 / 아티스트 사진','artist_image',profileImageURL(a,'artist'),true)}${bioField('AI 가수 / 아티스트 소개','artist_bio',a?.bio||'','목소리, 음악 스타일과 세계관을 소개해 주세요.')}${a?'<p class="field-help">프로필을 수정하면 기존 곡에도 반영됩니다.</p>':''}`;}
function participationFields(value=''){return `<div class="participation">사람이 참여한 부분 ${['작사','작곡','편곡','보컬','믹싱'].map(v=>`<label><input type="checkbox" name="participation" value="${v}" ${value.split(',').map(s=>s.trim()).includes(v)?'checked':''}>${v}</label>`).join('')}</div>`;}
function studioHTML(d){return heading('스튜디오','음악, 이미지, 프로필을 한곳에서 관리하세요.')+uploadQuotaHTML(d.upload_quota)+`<div class="stats-grid"><div class="stat-card"><span>공개한 음악</span><strong>${d.tracks.filter(t=>t.status==='published').length}</strong></div><div class="stat-card"><span>업로드 · 변환 중</span><strong>${d.tracks.filter(t=>['queued','processing','uploading'].includes(t.status)).length}</strong></div><div class="stat-card"><span>AI 아티스트</span><strong>${d.artists.length}</strong></div></div><div class="section-heading"><h2>내 음원 · 앨범 커버</h2><a class="primary-button" href="#upload">음원 업로드 ${icon('plus')}</a></div><div class="surface">${d.tracks.length?d.tracks.map(t=>`<div class="studio-track"><div class="studio-track-title">${cover(t,'mini-cover')}<div><strong>${esc(t.title)}${t.kind==='cover'?' <b class="ai-mini cover-mini">COVER</b>':''}</strong><p>${{uploading:'파일 전송 대기',queued:'변환 대기',processing:'음원 변환 중',published:'공개됨',hidden:'비공개',failed:'변환 실패'}[t.status]}</p>${alignmentBadge(t.alignment_state)}<small class="classification-summary">${t.classification_source==='ai'?'AI · '+esc(AifectGenres.parseList(t.genres_json).join(' · '))+' / '+esc(AifectGenres.parseList(t.moods_json).map(id=>AifectGenres.MOODS.find(m=>m.id===id)?.name||id).join(' · ')):t.classification_state==='failed'?'AI 분류를 완료하지 못했습니다. 곡 정보에서 다시 요청할 수 있습니다.':['queued','processing'].includes(t.classification_state)?'AI가 장르와 기분을 분석하고 있습니다.':''}</small>${t.error?`<small class="form-error">${esc(t.error)}</small>`:''}</div></div><div class="inline-actions studio-track-actions"><a class="small-button" href="#manage/${t.id}">수정</a><button type="button" class="small-button danger-button" data-delete-track="${t.id}" data-track-title="${esc(t.title)}" data-track-kind="${t.kind}">삭제</button>${t.status==='published'?`<a class="small-button" href="#song/${t.id}">곡 보기</a><button class="small-button" data-hide-track="${t.id}">비공개</button>`:['failed','hidden'].includes(t.status)?`<button class="small-button" data-retry-track="${t.id}">${t.status==='hidden'?'다시 공개':'다시 변환'}</button>`:''}</div></div>`).join(''):'아직 업로드한 곡이 없습니다.'}</div>${section('내 프로필')}<a class="small-button" href="#profile/edit">프로필 수정</a>${section('AI 가수 · 아티스트 프로필')}<div class="artist-editors">${d.artists.length?d.artists.map(a=>`<details class="surface artist-editor"><summary>${portrait(a,'artist')}<div><strong>${userNickname(a.name,{artistId:a.id,entityType:'artist'})}</strong><span>${esc(a.genre)} · 사진과 소개 수정</span></div>${icon('chevron')}</summary><form class="upload-form artist-form" data-id="${a.id}">${imageField('AI 가수 / 아티스트 사진','image',profileImageURL(a,'artist'),true)}${formField('AI 가수 / 아티스트 이름','name','text',a.name,'required maxlength="60"')}${bioField('AI 가수 / 아티스트 소개','bio',a.bio)}${genreField(a.genre)}<button class="primary-button">아티스트 프로필 저장</button><p class="form-error" role="alert"></p></form></details>`).join(''):'<p class="quiet">음원 업로드에서 첫 AI 아티스트를 등록해 보세요.</p>'}</div>`;}
function originalUploadConsentHTML(){
 return `<div class="rights-check"><p class="field-help" id="upload-rights-note">${esc(AifectSite.AI_UPLOAD_RIGHTS_NOTE)}</p><label class="checkbox-line"><input name="upload_consent_version" value="${esc(AifectSite.ORIGINAL_UPLOAD_TERMS_VERSION)}" type="checkbox" required aria-describedby="upload-rights-note"><span>${esc(AifectSite.ORIGINAL_UPLOAD_TERMS_TEXT)}</span></label><a href="/terms#original-upload" target="_blank" rel="noopener">음원 이용허락 약관 보기</a></div>`;
}
function karaokeStatusHTML(t){if(t.karaoke_at)return karaokePanelHTML(t);return `<div class="rights-check karaoke-optin"><p>이 곡은 노래방 MR 제공 · 커버 허락 조항이 생기기 전에 올라왔습니다. 동의하면 노래방과 커버곡 기능에 포함됩니다.</p><label class="checkbox-line"><input type="checkbox" id="karaoke-accept"> <span>${esc(AifectSite.KARAOKE_TERMS_TEXT)} <a href="/terms#karaoke" target="_blank" rel="noopener">약관 보기</a></span></label><button type="button" class="small-button" data-karaoke-track="${t.id}">동의하고 노래방에 포함하기</button></div>`;}
const KARAOKE_STATE={queued:'노래방 MR을 만들 차례를 기다리고 있습니다. 한 곡씩 차례로 만들어서 시간이 걸릴 수 있습니다.',processing:'보컬을 분리해 노래방 MR을 만들고 있습니다.',ready:'노래방 MR이 준비되었습니다. 들어보고 보컬이 남아 있으면 직접 만든 반주 파일로 바꿀 수 있습니다.'};
const KARAOKE_WORDS={ready:'가사 단어별 싱크까지 완료되었습니다.',attention:'가사 단어별 싱크를 맞췄습니다. 일부 구간은 정확하지 않을 수 있습니다.',failed:'가사 단어별 싱크를 맞추지 못했습니다. 등록한 가사가 실제로 부르는 내용과 같은지 확인해 주세요.'};
function karaokePanelHTML(t){const k=t.karaoke,busy=k&&['queued','processing'].includes(k.state);
 const state=!k?'곡 변환이 끝나면 노래방 MR을 자동으로 만듭니다.':k.state==='failed'?esc(k.error||'노래방 MR을 만들지 못했습니다.'):k.state==='processing'&&k.mr_source==='upload'?'올린 반주 파일을 변환하고 있습니다.':KARAOKE_STATE[k.state]||'';
 const words=!k?'':!k.has_lyrics?'싱크 가사가 없어서 노래방에 가사가 나오지 않습니다. 아래에서 가사를 싱크로 등록하면 단어별 싱크를 자동으로 맞춥니다.':busy?'가사 단어별 싱크도 함께 맞춥니다.':KARAOKE_WORDS[k.words_state]||'';
 return `<div class="rights-check karaoke-panel"><div class="form-section-heading"><h2>노래방 MR</h2></div><p><strong>${state}</strong></p>${words?`<p class="field-help">${words}</p>`:''}${k?.mr_ready?`<audio controls preload="none" src="/api/studio/tracks/${t.id}/karaoke/mr?v=${k.updated}"></audio>`:''}<div class="inline-actions"><button type="button" class="small-button" data-karaoke-regenerate="${t.id}" ${busy?'disabled':''}>자동으로 다시 만들기</button><label class="small-button">내 반주 파일로 바꾸기<input type="file" accept=".wav,.flac,.mp3" data-karaoke-upload="${t.id}" hidden></label></div><p class="field-help">직접 올리는 반주는 원곡과 길이가 같은 WAV·FLAC·MP3 파일이어야 합니다. (80MB 이하)</p><p class="field-help">노래방 MR 제공 · 커버 허락 동의: ${new Date(t.karaoke_at*1000).toLocaleDateString('ko-KR')} · 약관 ${esc(t.karaoke_terms)}</p></div>`;}
function studioWorkBackHTML(fromWorks){
 return fromWorks?'<a href="#profile" class="text-link">← 내 작품으로</a>':'<a href="#studio" class="text-link">← 스튜디오로</a>';
}
function trackEditHTML(t,d,fromWorks=false){return heading('곡 · 커버 · 가사 수정','수정한 정보는 공개된 곡에 바로 반영됩니다.')+`${studioWorkBackHTML(fromWorks)}${trackCoverFormHTML(t)}<form id="track-edit-form" data-id="${t.id}" class="surface upload-form track-editor">${formField('곡 제목','title','text',t.title,'required maxlength="120"')}${releaseDateField(t)}<label class="form-field">표시할 이름<select name="artist_id"><option value="none">AI 가수 선택 안 함 · 내 활동명으로 표시</option>${d.artists.map(a=>`<option value="${a.id}" ${a.id===t.artist_id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>${musicClassificationHTML(t)}${songTagFieldHTML(t.tags)}<label class="form-field">곡 소개<textarea name="description" maxlength="4000">${esc(t.description)}</textarea></label>${productionCreditsFieldsHTML(t.ai_tool)}${participationFields(t.participation)}${karaokeStatusHTML(t)}${lyricsEditorHTML(t)}<button class="primary-button">곡 정보 저장</button><p class="form-error" role="alert"></p></form>`;}
function bindImageInputs(root=document){
 root.querySelectorAll('[data-image-input]').forEach(input=>{
  if(input.dataset.bound)return;input.dataset.bound='true';
  const box=input.closest('.image-field'),preview=box.querySelector('.image-preview'),status=box.querySelector('.image-selection'),reset=box.querySelector('[data-reset-image]');preview.dataset.saved=preview.innerHTML;let url='';
  input.onchange=async()=>{if(url)URL.revokeObjectURL(url);status.textContent='';input.setCustomValidity('');const file=input.files[0];if(!file){preview.innerHTML=preview.dataset.saved;reset.hidden=true;return;}
   try{await validateImage(file);url=URL.createObjectURL(file);preview.innerHTML='';const img=document.createElement('img');img.src=url;img.alt='선택한 이미지 미리보기';preview.append(img);status.textContent=file.name;reset.hidden=false;}
   catch(e){input.setCustomValidity(e.message);input.reportValidity();status.textContent=e.message;preview.innerHTML=preview.dataset.saved;reset.hidden=false;}
  };reset.onclick=()=>{input.value='';input.onchange();};
 });
}
function workPhotoField(src,custom=false){
 return `<fieldset class="work-photo"><legend>작품 커버사진</legend><img class="work-photo-preview" src="${esc(src)}" data-saved-src="${esc(src)}" alt="현재 작품 커버사진"><div class="work-photo-actions">
 <button type="button" class="small-button" data-pick-photo>커버사진 변경</button><input hidden type="file" name="cover" accept="image/jpeg,image/png,image/webp">
 <button type="button" class="small-button" data-cancel-photo hidden>선택 취소</button>
 ${custom?'<button type="button" class="small-button" data-inherit-photo>원곡 커버로 되돌리기</button>':''}
 <small class="field-help">JPG · PNG · WebP · 최대 5MB</small><span role="status" class="work-photo-status"></span></div></fieldset>`;
}
function bindWorkPhoto(form,session){
 const field=form?.querySelector('.work-photo');if(!field)return;
 const input=field.querySelector('input'),img=field.querySelector('img'),cancel=field.querySelector('[data-cancel-photo]'),status=field.querySelector('[role=status]');
 const pick=file=>{
  const previous=img.dataset.previewUrl;if(previous)URL.revokeObjectURL(previous);
  delete img.dataset.previewUrl;
  form._photo=file;cancel.hidden=!file;form._photoError='';status.textContent=file?.name||'';
  if(file){
   const url=URL.createObjectURL(file);img.dataset.previewUrl=url;
   img.onload=img.onerror=()=>{URL.revokeObjectURL(url);};img.src=url;
  }else{input.value='';img.src=img.dataset.savedSrc;}
 };
 const changed=file=>{pick(file);if(session){session.coverFile=file;queueSingDraft(session);}};
 field.querySelector('[data-pick-photo]').onclick=()=>{if(!form._busy)input.click();};
 cancel.onclick=()=>{if(!form._busy)changed(null);};input.oncancel=cancel.onclick;
 input.onchange=()=>{
  if(form._busy)return;
  const file=input.files[0];
  if(file&&(!file.size||file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))){
   changed(null);form._photoError='5MB 이하의 JPG·PNG·WebP 이미지를 선택해 주세요.';status.textContent=form._photoError;cancel.hidden=false;return;
  }
  changed(file||null);
 };
 if(session?.coverFile)pick(session.coverFile);
}
function workPhotoEditor(t){
 return `<form id="work-photo-editor" data-id="${esc(t.id)}" class="surface upload-form track-cover-editor">${workPhotoField(trackArtworkPath(t),!!t.work_has_cover)}<button type="submit" class="primary-button">커버사진 저장</button><p class="form-error" role="alert"></p></form>`;
}
function applyWorkPhoto(profile){
 const update=t=>{if(t?.id===profile.id)Object.assign(t,{artwork_id:profile.artwork_id,cover_version:profile.cover_version,has_cover:profile.has_cover,work_cover_version:profile.work_cover_version,work_has_cover:profile.work_has_cover});};
 update(trackMap.get(profile.id));update(current);library.likes.forEach(update);
 if(current?.id===profile.id){const art=$('#now-playing .mini-cover');if(art)art.outerHTML=cover(current,'mini-cover');window.dispatchEvent(new Event('aifect-artwork-change'));}
}
function bindWorkPhotoEditor(form){
 bindWorkPhoto(form);
 const save=async reset=>{
  if(!reset&&form._photoError)throw Error(form._photoError);
  const url='/api/studio/tracks/'+encodeURIComponent(form.dataset.id)+'/image';
  if(reset)await api(url,'DELETE');
  else{
   if(!form._photo)throw Error('저장할 커버사진을 선택해 주세요.');
   await uploadFile(url,form._photo,undefined,{allowFallback:true});
  }
  const {profile}=await api('/api/studio/tracks/'+encodeURIComponent(form.dataset.id),'GET',undefined,{fresh:true});
  applyWorkPhoto(profile);
  if(typeof markMyWorkChanged==='function')markMyWorkChanged('track:'+profile.id);
  if(form.isConnected){const host=form.parentNode;form.outerHTML=workPhotoEditor(profile);bindWorkPhotoEditor(host.querySelector('#work-photo-editor'));}
  toast(reset?'원곡 커버로 되돌렸습니다.':'커버사진을 저장했습니다.');
 };
 form.onsubmit=busyForm(form,()=>save(false));
 const reset=form.querySelector('[data-inherit-photo]');
 if(reset)reset.onclick=busyForm(form,()=>save(true));
}
function trackCoverFormHTML(t){
 return `<form id="track-cover-form" data-id="${esc(t.id)}" class="surface upload-form track-cover-editor"><h2>앨범 커버 변경</h2>${imageField('새 앨범 커버 선택','image',t.has_cover?`/media/${t.id}/cover?v=${t.cover_version||'original'}`:'').replace('업로드 시 WebP로 자동 압축합니다 (최대 1600px).','사진을 자동으로 압축해 저장합니다 (최대 1600px).')}<button type="submit" class="primary-button">앨범 커버 저장</button><p class="field-help">사진을 선택한 뒤 저장해 주세요. 곡 정보와 가사는 바뀌지 않습니다.</p><div class="upload-progress" hidden><progress aria-label="커버 전송 진행률" max="100" value="0"></progress><p role="status" aria-live="polite"></p></div><p class="form-error" role="alert"></p></form>`;
}
function bindTrackCoverForm(){
 const form=$('#track-cover-form');if(!form)return;
 bindUploadForm(form,async fd=>{
  const file=fd.get('image');if(!file?.size)throw new Error('새 앨범 커버 사진을 먼저 선택해 주세요.');
  await validateImage(file);uploadStage(form,'앨범 커버를 저장하고 있습니다.');
  await uploadFile(`/api/studio/tracks/${form.dataset.id}/image`,file,p=>uploadStage(form,'앨범 커버를 저장하고 있습니다.',p),{allowFallback:true});
  // Read the new version so cached old artwork is never reused after saving.
  const {profile}=await api(`/api/studio/tracks/${form.dataset.id}`,'GET',undefined,{fresh:true});
  if(typeof markMyWorkChanged==='function')markMyWorkChanged('track:'+profile.id);
  const cached=trackMap.get(profile.id);if(cached)Object.assign(cached,{artwork_id:profile.artwork_id,has_cover:profile.has_cover,cover_version:profile.cover_version,work_has_cover:profile.work_has_cover,work_cover_version:profile.work_cover_version});
  form.querySelector('.image-preview img').src=`/media/${profile.id}/cover?v=${profile.cover_version}`;
  const preview=form.querySelector('.image-preview');preview.dataset.saved=preview.innerHTML;
  form.querySelector('input[type="file"]').value='';form.querySelector('[data-reset-image]').hidden=true;
  form.querySelector('.image-selection').textContent='저장된 앨범 커버';
  if(current?.id===profile.id){Object.assign(current,{artwork_id:profile.artwork_id,has_cover:profile.has_cover,cover_version:profile.cover_version,work_has_cover:profile.work_has_cover,work_cover_version:profile.work_cover_version});const art=$('#now-playing .mini-cover');if(art)art.outerHTML=cover(current,'mini-cover');}
  uploadStage(form,'앨범 커버를 저장했습니다.',100,'done');toast('앨범 커버를 저장했습니다.');
 });
}
async function validateImage(file){if(!file?.size)return;if(file.size>5*1024*1024)throw new Error('이미지는 5MB 이하로 업로드해 주세요.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG·PNG·WebP 이미지를 선택해 주세요.');const bitmap=await decodeUploadImage(file);const ok=bitmap.width>0&&bitmap.height>0;bitmap.close();if(!ok)throw new Error('올바른 이미지 파일을 선택해 주세요.');}
function textFields(fd){const fields=Object.fromEntries([...fd].filter(([,v])=>typeof v==='string'));if(fd.has('classification_fields')){fields.genres=fd.getAll('genres');fields.moods=fd.getAll('moods');fields.genre=fields.genres[0]||'분석 대기';}return fields;}
function finishStudioWorkEdit(form){
 if(typeof markMyWorkChanged==='function')markMyWorkChanged('track:'+form.dataset.id);
 if(!form.isConnected)return;
 if(new URLSearchParams(location.hash.split('?')[1]||'').get('from')==='works'){location.hash='profile';return;}
 return render();
}
function bindStudioForms(){
 bindDiamondForms();
 if($('#work-photo-editor'))bindWorkPhotoEditor($('#work-photo-editor'));
 if($('#cover-upload-form'))bindWorkPhoto($('#cover-upload-form'));
 const uploadForm=$('#upload-form');
 const remembered=uploadForm&&uploadFormDraft?.owner===me?.id?uploadFormDraft:null;
 if(uploadForm){
  uploadForm.dataset.owner=me.id;
  bindUploadGenres(uploadForm,remembered?.genres);
  const qa=$('[data-upload-qa]');qa.onclick=()=>dialog(uploadQaHTML());
  const select=$('#upload-artist'),fields=$('#upload-artist-fields'),profileDrafts=new Map();
  let selected=select.value;
  select.onchange=()=>{
   profileDrafts.set(selected,[...fields.childNodes]);selected=select.value;
   if(profileDrafts.has(selected))fields.replaceChildren(...profileDrafts.get(selected));
   else fields.innerHTML=selected==='none'?'':artistUploadFields(studioData.artists.find(a=>a.id===selected));
   bindImageInputs(fields);
  };
  if(remembered){
   select.value=remembered.artist;
   if(select.value!==remembered.artist)select.value='none';
   if(select.value!=='none')select.onchange();
   if(select.value===remembered.artist)restoreUploadForm(uploadForm,remembered);
   uploadFormDraft=null;
  }
 }
 bindImageInputs();bindLyricsEditor();bindTrackCoverForm();bindProductionCredits();bindSongTagSuggestions();
 if(remembered){
  const rows=uploadForm.querySelectorAll('#lyrics-rows input');
  if(rows.length===remembered.directRows.length)rows.forEach((field,index)=>{field.value=remembered.directRows[index];});
  if(lyricEditor)lyricEditor.dirty=!!remembered.dirty;
  for(const field of uploadForm.querySelectorAll('input[name="audio"],[data-image-input]'))if(field.files.length)field.dispatchEvent(new Event('change',{bubbles:true}));
 }

 const payout=$('#payout-form');if(payout)payout.onsubmit=busyForm(payout,async fd=>{await api('/api/studio/payout-account','PUT',{holder:fd.get('holder'),bank:fd.get('bank'),account:fd.get('account'),resident_number:fd.get('resident_number'),consent:fd.has('consent')});toast('정산 정보를 저장했습니다.');await render();});
 const coverEdit=$('#cover-edit-form');if(coverEdit)coverEdit.onsubmit=busyForm(coverEdit,async fd=>{await api(`/api/studio/tracks/${coverEdit.dataset.id}`,'PUT',{description:fd.get('description')||'',release_date:fd.get('release_date')||''});toast('커버곡 정보를 저장했습니다.');await finishStudioWorkEdit(coverEdit);});
 document.querySelectorAll('.artist-form').forEach(form=>{form.onsubmit=busyForm(form,async fd=>{await validateImage(fd.get('image'));await api(`/api/studio/artists/${form.dataset.id}`,'PUT',textFields(fd));if(fd.get('image')?.size)await uploadFile(`/api/studio/artists/${form.dataset.id}/image`,fd.get('image'));toast('AI 아티스트 사진과 소개를 저장했습니다.');await render();});});
 const mr=$('[data-karaoke-upload]');if(mr)mr.onchange=async()=>{const file=mr.files[0];if(!file)return;const ext=file.name.split('.').pop().toLowerCase();
  if(!['wav','flac','mp3'].includes(ext)||file.size>80*1024*1024){toast('반주 파일은 80MB 이하 WAV·FLAC·MP3만 올릴 수 있습니다.');mr.value='';return;}
  try{toast('반주 파일을 올리고 있습니다…');await uploadFile(`/api/studio/tracks/${mr.dataset.karaokeUpload}/karaoke/mr?ext=${ext}`,file);toast('반주 파일을 올렸습니다. 변환이 끝나면 여기에서 들을 수 있습니다.');await render();}catch(e){toast(e.message);mr.value='';}};
 const track=$('#track-edit-form');if(track)track.onsubmit=busyForm(track,async fd=>{applyLyrics(fd);await api(`/api/studio/tracks/${track.dataset.id}`,'PUT',{...textFields(fd),...productionCreditPayload(fd),participation:fd.getAll('participation').join(', ')});toast('곡 정보를 저장했습니다.');await finishStudioWorkEdit(track);});
}
function coverUploadHTML(o){return heading('커버곡 올리기','원곡자가 허락한 곡을 내 목소리로 들려 주세요.')+`<div class="upload-layout"><form id="cover-upload-form" class="surface upload-form" data-original="${o.id}"><div class="cover-original">${cover(o,'mini-cover')}<div><span class="eyebrow">원곡</span><strong>${esc(o.title)}</strong><p>${trackNickname(o)} · ${trackNickname(o,'producer')}</p></div></div>${o.accepts_covers?`<label class="file-zone">${icon('upload')}<strong>커버 녹음 파일 선택</strong><span>WAV · FLAC · MP3 / 최대 80MB</span><input name="audio" type="file" accept=".wav,.flac,.mp3" required aria-label="커버 녹음 파일 선택"></label><fieldset class="sing-mix-group"><legend>공개 종류</legend><label class="form-field">솔로 커버 · 듀엣 참여 모집<select name="cover_kind" required><option value="">공개할 종류를 선택해 주세요</option><option value="solo">솔로 커버 · 내 녹음으로 완성</option><option value="duet">듀엣 참여 모집 · 다른 사람이 이어 부르기</option></select></label><p class="field-help">듀엣은 내 파트를 먼저 올린 뒤 다른 사람이 이어 불러 완성합니다. 반주는 곡 끝까지 포함해 주세요.</p><label class="checkbox-line"><input name="duet_consent" type="checkbox">다른 사람이 이 녹음에 목소리를 더하는 것에 동의합니다. (듀엣 필수)</label></fieldset>${workPhotoField(trackArtworkPath(o))}<label class="form-field">커버 소개 (선택)<textarea name="description" maxlength="1000" placeholder="어떤 마음으로 불렀는지 들려 주세요."></textarea></label><label class="checkbox-line rights-check"><input name="own_voice" type="checkbox" required> <span>제가 직접 부른 녹음입니다. 다른 사람의 목소리나 AI 음성 복제가 아닙니다.</span></label><label class="checkbox-line rights-check"><input name="rights" type="checkbox" required> <span>이 녹음을 AIFECT에 공개할 권리가 있고, 원곡 정보와 함께 공개되는 데 동의합니다.</span></label><button class="primary-button">커버곡 올리기 ${icon('upload')}</button><div class="upload-progress" hidden><progress aria-label="파일 전송 진행률" max="100" value="0"></progress><p role="status" aria-live="polite"></p><small>전송이 끝날 때까지 이 화면을 유지해 주세요.</small></div><p class="form-error" role="alert"></p>`:'<p class="empty-note">원곡자가 노래방 · 커버를 허락하지 않은 곡이라 커버를 올릴 수 없습니다.</p>'}</form><aside class="surface upload-guide"><span class="eyebrow">COVER</span><h2>원곡을<br>내 목소리로.</h2><p>커버곡은 횟수 제한 없이 올릴 수 있습니다. 무료회원은 업로드 완료 후 광고가 표시될 수 있습니다.</p><p>커버곡은 원곡 페이지의 커버곡 목록과 내 프로필의 커버곡 탭에 함께 표시됩니다.</p><p>원곡이 비공개로 바뀌면 커버곡도 함께 비공개가 됩니다.</p></aside></div>`;}
function coverEditHTML(t,fromWorks=false){return heading('커버곡 수정','작품의 커버사진과 소개를 수정할 수 있습니다.')+`${studioWorkBackHTML(fromWorks)}${workPhotoEditor(t)}<form id="cover-edit-form" data-id="${t.id}" class="surface upload-form track-editor"><p class="field-help"><a href="#song/${t.original_id}">원곡 「${esc(t.title)}」 보기</a></p>${releaseDateField(t)}<label class="form-field">커버 소개<textarea name="description" maxlength="1000">${esc(t.description)}</textarea></label><button class="primary-button">저장</button><p class="form-error" role="alert"></p></form>`;}
function earningsOverviewHTML(e){
 const a=e.activity||{},original=Number(a.original_streams)||0,covers=Number(a.cover_streams)||0,total=original+covers,share=total?original/total*100:0;
 const schedule=e.current_schedule||AifectGifts.earningsSchedule(e.current_month);
 return `<section class="surface payout-overview" aria-labelledby="payout-overview-title"><div class="payout-activity"><h2 id="payout-overview-title">누적 스트리밍</h2><div class="payout-donut ${total?'':'is-empty'}" style="--original-share:${share}%" role="img" aria-label="총 ${number(total)}회, 원곡 ${number(original)}회, 커버곡 ${number(covers)}회"><div><strong>${number(total)}</strong><span>스트리밍</span></div></div><ul class="payout-legend"><li><i class="original"></i>원곡 <strong>${number(original)}회</strong></li><li><i class="cover"></i>커버곡 <strong>${number(covers)}회</strong></li></ul></div><div class="payout-summary"><p class="payout-period">전체 기간 · 실제 집계</p><dl class="payout-counts"><div><dt>선물 예상 다이아</dt><dd>${diamondNumber((e.breakdown?.estimated_earnings_krw||0)/100)} <span><span class="diamond-emoji" aria-label="다이아">💎</span></span></dd></div><div><dt>스트리밍 수</dt><dd>${number(total)} <span>회</span></dd></div></dl><div class="payout-schedule"><h3>매월 5일, 전월 정산 다이아를 확인하세요</h3><p>확정된 다이아는 골드 전환 또는 현금 정산을 신청할 수 있습니다. 25일까지 신청하면 같은 달 25일, 이후 신청하면 다음 달 25일 지급 예정입니다.</p><small>${esc(e.current_month)} 수익 · ${esc(schedule.available_on)} 공개 · 운영자 마감 후 다이아 확정</small></div><p class="field-help">스트리밍 수는 내 원곡·커버곡의 유효 재생을 집계합니다.</p></div></section>`;
}
function earningsHTML(e){const label={accruing:'적립 중',payable:'정산 예정',carried:'다음 달로 이월',settled:'다이아 확정',pending_review:'마감 검토 중'},s=e.splits,p=e.payout;
 const statementStatus=st=>st.status==='paid'?`지급 완료 · ${new Date(st.paid_at*1000).toLocaleDateString('ko-KR')}`:st.status==='held'?'정산 정보 등록 후 지급':`지급 예정 · ${st.due_on}`;
 const history=diamondHistoryHTML(e.diamonds);
 return '<div class="payout-management">'+diamondWalletHTML(e.diamonds)+earningsOverviewHTML(e)+`<section class="surface earnings payout-months" aria-labelledby="payout-months-title"><header class="payout-card-heading"><h2 id="payout-months-title">월별 예상 수익</h2></header><p class="field-help">월별 예상 수익은 다음 달 5일부터 확인할 수 있습니다. 마감 전 예상 수익은 아직 사용할 수 없는 다이아입니다.</p>${e.months.length?`<div class="table-scroll" tabindex="0" role="region" aria-label="월별 예상 수익 표 · 좌우로 스크롤"><table class="earnings-table"><thead><tr><th>기간</th><th>커버 가창</th><th>원곡</th><th>합계</th><th>상태</th></tr></thead><tbody>${e.months.map(m=>{const available=m.earnings_available===true;return `<tr><td>${esc(m.month)}</td>${available?`<td>${diamondNumber(m.singer_krw/100)} <span class="diamond-emoji" aria-label="다이아">💎</span></td><td>${diamondNumber(m.creator_krw/100)} <span class="diamond-emoji" aria-label="다이아">💎</span></td><td>${diamondNumber(m.total_krw/100)} <span class="diamond-emoji" aria-label="다이아">💎</span></td><td>${label[m.status]}${m.status==='payable'?` · ${esc(m.payout_on)} · ${number(m.payable_krw)}원`:''}</td>`:`<td colspan="3" class="payout-pending">${esc(m.available_on)}에 확인할 수 있습니다</td><td>집계 중 · 마감 후 다이아 확정</td>`}</tr>`;}).join('')}</tbody></table></div>`:'<p class="empty-note">아직 집계된 선물 수익이 없습니다.</p>'}<details class="payout-rules"><summary>수익 배분 · 파트너 · 다이아 안내</summary>${AifectGifts.settlementPolicyHTML()}</details></section>`
 +(history?`<section class="payout-history-panel" aria-label="다이아 내역">${history}</section>`:'')
 +(p.statements.length?`<section class="surface earnings payout-statements" aria-labelledby="payout-statements-title"><header class="payout-card-heading"><h2 id="payout-statements-title">정산 내역</h2></header><div class="table-scroll" tabindex="0" role="region" aria-label="정산 내역 표 · 좌우로 스크롤"><table class="earnings-table"><thead><tr><th>정산 기간</th><th>수익</th><th>원천징수</th><th>지급액</th><th>상태</th></tr></thead><tbody>${p.statements.map(st=>`<tr><td>${st.from_month===st.period?st.period:`${st.from_month} ~ ${st.period}`}</td><td>${number(st.gross_krw)}원</td><td>${number(st.income_tax_krw+st.local_tax_krw)}원</td><td>${number(st.net_krw)}원</td><td>${statementStatus(st)}</td></tr>`).join('')}</tbody></table></div></section>`:'')
 +`<section class="surface earnings payout-account" aria-labelledby="payout-account-title"><header class="payout-card-heading"><h2 id="payout-account-title">정산 정보</h2></header>${p.account?`<dl class="payout-account-summary"><div><dt>정산 계좌</dt><dd><strong>${esc(p.account.bank)} ${esc(p.account.account)}</strong></dd></div><div><dt>예금주</dt><dd>${esc(p.account.holder)}</dd></div><div><dt>주민등록번호</dt><dd>${esc(p.account.resident)}</dd></div></dl>`:''}${p.can_register||p.account?`<details ${p.account?'':'open'}><summary>${p.account?'정산 정보 수정':'정산 정보 등록'}</summary><form id="payout-form" class="upload-form"><div class="payout-account-fields">${formField('예금주 (실명)','holder','text','','required maxlength="40" autocomplete="name"')}<label class="form-field">은행<select name="bank" required><option value="">선택</option>${p.banks.map(b=>`<option>${esc(b)}</option>`).join('')}</select></label>${formField('계좌번호','account','text','','required inputmode="numeric" autocomplete="off" placeholder="숫자만 입력"')}${formField('주민등록번호 (원천징수용)','resident_number','password','','required inputmode="numeric" autocomplete="off" placeholder="13자리"')}</div><label class="checkbox-line rights-check"><input name="consent" type="checkbox" required> <span>예금주 실명, 은행, 계좌번호, 주민등록번호를 선물 수익 지급과 원천징수 · 지급명세서 제출을 위해 처리하는 데 동의합니다. 계좌번호와 주민등록번호는 암호화해 보관합니다. <a href="/privacy" target="_blank" rel="noopener">개인정보처리방침</a></span></label><button class="primary-button">정산 정보 저장</button><p class="form-error" role="alert"></p></form></details>`:'<p class="empty-note">받은 선물 수익이 생기면 정산 정보를 등록할 수 있습니다.</p>'}<p class="field-help">개인 창작자 기준으로 사업소득세 3% · 지방소득세 0.3%를 원천징수합니다(소득세 1,000원 미만은 제외). 사업자로 정산받으려면 고객센터로 문의해 주세요.</p></section></div>`;}
function adminHTML(d){const status={scheduled:'지급 예정',held:'계좌 미등록',paid:'지급 완료'};
 return heading('정산 관리','월 수익을 다이아로 확정하고 신청한 지급 결과를 기록합니다.')+'<a class="small-button" href="#admin/partners">파트너 검증 · 스트리밍 · 다이아 관리</a>'+`<section class="surface earnings"><p>미지급 정산서 ${number(d.unpaid.n)}건 · ${number(d.unpaid.krw)}원</p>${d.closable?`<p class="field-help">${d.closable}을 마감하면 검증된 선물 수익이 다이아로 확정됩니다. 이용자는 확정 다이아를 골드로 전환하거나 현금 정산을 신청할 수 있습니다.</p><button class="primary-button" data-close-period="${d.closable}">${d.closable} 마감하기</button>`:'<p class="field-help">마감할 수 있는 달이 없습니다. 끝난 달만 마감할 수 있습니다.</p>'}</section>`
 +(d.periods.length?`<div class="tabs">${d.periods.map(p=>`<a class="tab ${p.period===d.period?'active':''}" href="#admin/${p.period}">${p.period}</a>`).join('')}</div>`:'')
 +(d.statements.length?`<div class="surface earnings"><div class="table-scroll"><table class="earnings-table"><thead><tr><th>프로필</th><th>이메일</th><th>기간</th><th>수익</th><th>원천징수</th><th>지급액</th><th>계좌</th><th>상태</th><th></th></tr></thead><tbody>${d.statements.map(st=>`<tr><td>${esc(st.profile)}</td><td>${esc(st.email)}</td><td>${st.from_month===st.period?st.period:`${st.from_month} ~ ${st.period}`}</td><td>${number(st.gross_krw)}원</td><td>${number(st.income_tax_krw+st.local_tax_krw)}원</td><td>${number(st.net_krw)}원</td><td>${st.account_snapshot?esc(st.account_snapshot):st.bank?`${esc(st.bank)} ****${esc(st.account_last4)} ${esc(st.holder)}`:'-'}</td><td>${status[st.status]}${st.paid_ref?` · ${esc(st.paid_ref)}`:''}</td><td class="inline-actions">${st.bank?`<button class="small-button" data-reveal-payout="${st.id}">계좌 보기</button>`:''}${st.status==='scheduled'?`<button class="small-button" data-pay-statement="${st.id}">지급 완료</button>`:''}</td></tr>`).join('')}</tbody></table></div></div>`:`<p class="surface empty-note">${d.period?'이 달에는 정산서가 없습니다.':'아직 마감한 달이 없습니다.'}</p>`);}

function releaseDateField(t){return formField('발매일','release_date','date',t.release_date||trackDefaultReleaseDate(t),'min="1900-01-01" max="2199-12-31"')+'<small class="field-help">기본값은 업로드 날짜입니다. 발매일을 바꿔도 업로드 기록은 유지됩니다.</small>'; }
function trackDefaultReleaseDate(t){const d=new Date(Number(t.created)*1000+9*3600000);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):'';}
