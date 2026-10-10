function musicClassificationHTML(track=null){
 const selected=track?.genres||AifectGenres.parseList(track?.genres_json),chosen=selected?.length?selected:track?.genre?[track.genre]:[],moods=track?.moods||AifectGenres.parseList(track?.moods_json);
 if(track?.kind==='cover')return `<section class="music-classification"><strong>원곡의 장르 · 기분</strong><p class="field-help">커버곡은 원곡의 분류를 그대로 사용해요. 원곡의 분류가 바뀌면 함께 반영돼요.</p><p>${chosen.map(esc).join(' · ')}</p><p class="field-help">${moods.map(id=>esc(AifectGenres.MOODS.find(m=>m.id===id)?.name||id)).join(' · ')}</p></section>`;
 return `<section class="music-classification"><input type="hidden" name="classification_fields" value="1"><div class="classification-heading"><div><strong>${track?'장르 · 기분':'AI 장르 · 기분 분류'}</strong><p class="field-help">${track?'어울리는 장르와 기분을 여러 개 선택할 수 있어요.':'업로드한 음악을 Gemini가 듣고 장르와 기분을 자동으로 정해요. 변환 후 스튜디오에서 확인할 수 있어요.'}</p></div>${track?`<button type="button" class="small-button" data-reclassify="${esc(track.id)}">AI로 다시 분류</button>`:'<span class="classification-badge">자동</span>'}</div><details ${track?'open':''}><summary>${track?'분류 확인 · 수정':'직접 선택하기 (선택 사항)'}</summary><fieldset><legend>장르 <small>최대 3개 · 첫 항목이 대표 장르</small></legend><div class="classification-options">${[...new Set([...chosen,...AifectGenres.GENRES])].filter(g=>g!=='분석 대기').map(g=>`<label><input type="checkbox" name="genres" value="${esc(g)}" ${chosen.includes(g)?'checked':''}><span>${esc(g)}</span></label>`).join('')}</div></fieldset><fieldset><legend>기분 · 활동 <small>최대 4개</small></legend><div class="classification-options">${AifectGenres.MOODS.map(m=>`<label><input type="checkbox" name="moods" value="${m.id}" ${moods.includes(m.id)?'checked':''}><span>${m.name}</span></label>`).join('')}</div></fieldset></details><p class="field-help" data-classification-status role="status">${track?.classification_source==='ai'?'음악을 분석한 AI 분류가 적용되어 있어요.':''}</p></section>`;
}
document.addEventListener('change',e=>{
 const input=e.target;if(!input.matches('.music-classification input[type="checkbox"]'))return;
 const host=input.closest('.music-classification'),max=input.name==='genres'?3:4;
 if(host.querySelectorAll(`input[name="${input.name}"]:checked`).length>max){input.checked=false;toast(`최대 ${max}개까지 선택할 수 있어요.`);}
});
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-reclassify]');if(!button||button.disabled)return;
 const status=button.closest('.music-classification').querySelector('[data-classification-status]');button.disabled=true;
 try{await api(`/api/studio/tracks/${button.dataset.reclassify}/classification`,'POST',{});status.textContent='AI 분석을 요청했어요. 잠시 후 스튜디오에서 결과를 확인해주세요.';await api('/api/studio','GET',undefined,{fresh:true});}
 catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
