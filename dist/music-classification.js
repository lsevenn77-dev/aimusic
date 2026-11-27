function uploadGenresHTML(){
 return `<div class="music-classification upload-genres" data-upload-genres>
  <input type="hidden" name="classification_fields" value="1"><input type="hidden" name="classification_mode" value="manual">
  <div class="upload-genre-heading"><label for="upload-genre-search">등록 장르${uploadRequiredMark}</label><button type="button" class="small-button upload-genre-auto" data-genre-auto>${icon('sparkles')} 자동 장르 기입</button></div>
  <div class="upload-genre-values" data-genre-values aria-label="등록 장르"></div>
  <div class="upload-genre-panel">
   <div class="upload-genre-search">${icon('search')}<input type="text" inputmode="search" autocomplete="off" id="upload-genre-search" maxlength="80" placeholder="장르 검색 또는 직접 입력" aria-label="장르 검색 또는 직접 입력" aria-describedby="upload-genre-status" aria-controls="upload-genre-results"><button type="button" class="small-button" data-genre-add>추가</button></div>
   <ul id="upload-genre-results" class="upload-genre-results" aria-label="장르 검색 결과" hidden></ul>
   <div class="upload-genre-recommend"><strong>추천 장르</strong><div class="upload-genre-chips">${AifectGenres.RECOMMENDED_GENRES.map(g=>`<button type="button" data-genre-recommend="${esc(g)}" aria-pressed="false"><span aria-hidden="true">+</span> ${esc(g)}</button>`).join('')}</div></div>
  </div>
  <p id="upload-genre-status" class="field-help" role="status"></p>
  <fieldset><legend>기분 · 활동 <small>최대 4개</small></legend><div class="classification-options">${AifectGenres.MOODS.map(m=>`<label><input type="checkbox" name="moods" value="${m.id}"><span>${m.name}</span></label>`).join('')}</div></fieldset>
 </div>`;
}

function bindUploadGenres(form,initial=[]){
 const host=form.querySelector('[data-upload-genres]'),search=host.querySelector('#upload-genre-search'),values=host.querySelector('[data-genre-values]');
 const results=host.querySelector('#upload-genre-results'),status=host.querySelector('#upload-genre-status'),auto=host.querySelector('[data-genre-auto]');
 const audioFile=form.elements.audio;
 const chosen=[...initial];
 let analysis=null;
 const hasGenre=genre=>chosen.some(item=>AifectGenres.genreIdentity(item)===AifectGenres.genreIdentity(genre));
 function render(){
  values.innerHTML=chosen.length?chosen.map((g,i)=>`<span class="upload-genre-chip"><input type="hidden" name="genres" value="${esc(g)}"><span>${esc(g)}</span><button type="button" data-genre-remove="${i}" aria-label="${esc(g)} 장르 삭제">×</button></span>`).join(''):'<span class="upload-genre-placeholder">장르를 추가해 주세요.</span>';
  for(const button of host.querySelectorAll('[data-genre-recommend]')){
   const added=hasGenre(button.dataset.genreRecommend);
   button.setAttribute('aria-pressed',String(added));button.firstElementChild.textContent=added?'✓':'+';
  }
  search.setCustomValidity(chosen.length?'':'장르를 추가해 주세요.');
  if(chosen.length)search.removeAttribute('aria-invalid');
 }
 function renderSearch(){
  const query=search.value.trim(),matches=query?AifectGenres.searchGenres(query).filter(g=>!hasGenre(g)):[];
  results.hidden=!matches.length;
  results.innerHTML=matches.map(g=>`<li><button type="button" data-genre-result="${esc(g)}">${esc(g)}</button></li>`).join('');
 }
 function add(raw){
  const genre=AifectGenres.canonicalGenre(raw);
  if(!AifectGenres.validGenre(genre)||genre==='분석 대기')return '장르를 1~80자로 입력해 주세요.';
  if(hasGenre(genre))return '이미 추가한 장르입니다.';
  if(chosen.length>=3)return '장르는 최대 3개까지 등록할 수 있습니다.';
  chosen.push(genre);return '';
 }
 function addFromSearch(name=search.value){
  const error=add(name);
  if(!error)search.value='';
  status.textContent=error;render();renderSearch();search.focus({preventScroll:true});
 }
 search.addEventListener('input',()=>{status.textContent='';renderSearch();});
 search.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();if(!form._busy)addFromSearch();}
  if(e.key==='Escape')results.hidden=true;
 });
 host.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button||form._busy)return;
  if(button.hasAttribute('data-genre-add'))addFromSearch();
  if(button.hasAttribute('data-genre-result'))addFromSearch(button.dataset.genreResult);
  if(button.hasAttribute('data-genre-remove')){
   const index=Number(button.dataset.genreRemove);
   chosen.splice(index,1);status.textContent='';render();renderSearch();
   (values.querySelector(`[data-genre-remove="${Math.min(index,chosen.length-1)}"]`)||search).focus({preventScroll:true});
  }
  if(button.hasAttribute('data-genre-recommend')){status.textContent=add(button.dataset.genreRecommend);render();renderSearch();}
 });
 audioFile.addEventListener('change',()=>analysis?.abort());
 auto.addEventListener('click',async()=>{
  if(analysis||form._busy)return;
  if(chosen.length>=3){status.textContent='장르를 삭제하면 자동 기입 결과를 추가할 수 있습니다.';return;}
  const file=audioFile.files[0],ext=file?.name.split('.').pop().toLowerCase();
  if(!file||file.size<100||file.size>80*1024*1024||!['wav','flac','mp3'].includes(ext)){
   status.textContent='80MB 이하 WAV·FLAC·MP3 음원을 먼저 선택해 주세요.';audioFile.focus();return;
  }
  const controller=analysis=new AbortController(),timeout=setTimeout(()=>controller.abort('timeout'),130000);
  auto.disabled=true;auto.setAttribute('aria-busy','true');status.textContent='음원에서 장르를 분석하고 있습니다…';
  try{
   const response=await fetch('/api/studio/upload-genre-analysis?ext='+ext,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/octet-stream'},body:file,signal:controller.signal});
   const result=await response.json();
   if(!response.ok||!Array.isArray(result.genres))throw Error(result.error||'자동 장르 기입을 완료하지 못했습니다.');
   if(!form.isConnected||audioFile.files[0]!==file||form._busy)return;
   const previous=chosen.length;
   for(const genre of result.genres)if(typeof genre==='string')add(genre);
   status.textContent=chosen.length>previous?'분석한 장르를 추가했습니다.':'추가할 장르가 없습니다.';
   render();renderSearch();
  }catch(error){
   if(form.isConnected)status.textContent=controller.signal.aborted?(controller.signal.reason==='timeout'?'분석 시간이 초과되었습니다. 다시 시도해 주세요.':'음원이 바뀌었습니다. 자동 장르 기입을 다시 눌러 주세요.'):error.message;
  }finally{clearTimeout(timeout);analysis=null;auto.disabled=false;auto.removeAttribute('aria-busy');}
 });
 render();
}

function musicClassificationHTML(track=null){
 const selected=track?.genres||AifectGenres.parseList(track?.genres_json),chosen=selected?.length?selected:track?.genre?[track.genre]:[],moods=track?.moods||AifectGenres.parseList(track?.moods_json);
 if(track?.kind==='cover')return `<section class="music-classification"><strong>원곡의 장르 · 기분</strong><p class="field-help">커버곡은 원곡의 분류를 그대로 사용합니다. 원곡의 분류가 바뀌면 함께 반영됩니다.</p><p>${chosen.map(esc).join(' · ')}</p><p class="field-help">${moods.map(id=>esc(AifectGenres.MOODS.find(m=>m.id===id)?.name||id)).join(' · ')}</p></section>`;
 return `<section class="music-classification"><input type="hidden" name="classification_fields" value="1"><div class="classification-heading"><div><strong>${track?'장르 · 기분':'AI 장르 · 기분 분류'}</strong><p class="field-help">${track?'어울리는 장르와 기분을 여러 개 선택할 수 있습니다.':'업로드한 음악을 Gemini가 듣고 장르와 기분을 자동으로 정합니다. 변환 후 스튜디오에서 확인할 수 있습니다.'}</p></div>${track?`<button type="button" class="small-button" data-reclassify="${esc(track.id)}">AI로 다시 분류</button>`:'<span class="classification-badge">자동</span>'}</div><details ${track?'open':''}><summary>${track?'분류 확인 · 수정':'직접 선택하기 (선택 사항)'}</summary><fieldset><legend>장르 <small>최대 3개 · 첫 항목이 대표 장르</small></legend><div class="classification-options">${[...new Set([...chosen,...AifectGenres.GENRES])].filter(g=>g!=='분석 대기').map(g=>`<label><input type="checkbox" name="genres" value="${esc(g)}" ${chosen.includes(g)?'checked':''}><span>${esc(g)}</span></label>`).join('')}</div></fieldset><fieldset><legend>기분 · 활동 <small>최대 4개</small></legend><div class="classification-options">${AifectGenres.MOODS.map(m=>`<label><input type="checkbox" name="moods" value="${m.id}" ${moods.includes(m.id)?'checked':''}><span>${m.name}</span></label>`).join('')}</div></fieldset></details><p class="field-help" data-classification-status role="status">${track?.classification_source==='ai'?'음악을 분석한 AI 분류가 적용되어 있습니다.':''}</p></section>`;
}
document.addEventListener('change',e=>{
 const input=e.target;if(!input.matches('.music-classification input[type="checkbox"]'))return;
 const host=input.closest('.music-classification'),max=input.name==='genres'?3:4;
 if(host.querySelectorAll(`input[name="${input.name}"]:checked`).length>max){input.checked=false;toast(`최대 ${max}개까지 선택할 수 있습니다.`);}
});
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-reclassify]');if(!button||button.disabled)return;
 const status=button.closest('.music-classification').querySelector('[data-classification-status]');button.disabled=true;
 try{await api(`/api/studio/tracks/${button.dataset.reclassify}/classification`,'POST',{});status.textContent='AI 분석을 요청했습니다. 잠시 후 스튜디오에서 결과를 확인해 주세요.';await api('/api/studio','GET',undefined,{fresh:true});}
 catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
