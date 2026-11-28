function crewTagEditor(crew) {
 const {CREW_ACTIVITIES, CREW_GENRES} = AifectCrewTags;
 const options = CREW_ACTIVITIES.map(tag=>`<option ${crew?.primary_activity===tag?'selected':''}>${esc(tag)}</option>`).join('');
 const group = (name,label,tags,maximum) => `<fieldset class="crew-tag-group"><legend>${label} <small>최대 ${maximum}개</small></legend><div>
  ${tags.map(tag=>`<label><input type="checkbox" name="${name}" value="${esc(tag)}" ${crew?.[name]?.includes(tag)?'checked':''}><span>${esc(tag)}</span></label>`).join('')}
 </div></fieldset>`;
 return `<div class="crew-tag-editor"><label class="form-field">대표 활동${!crew?' (필수)':''}<select name="primary_activity" ${!crew||crew.primary_activity?'required':''}>
 <option value="">${crew?'미설정':'대표 활동 선택'}</option>${options}</select></label>
 ${group('additional_activities','추가 활동',CREW_ACTIVITIES,2)}
 ${group('music_genres','음악 장르',CREW_GENRES,3)}</div>`;
}

function bindCrewTagEditor(form) {
 const primary = form.elements.primary_activity;
 if (!primary) return;
 function update() {
  for (const [name,limit] of [['additional_activities',2],['music_genres',3]]) {
   const inputs = [...form.querySelectorAll(`[name="${name}"]`)];
   const additional = name==='additional_activities';
   if (additional) for (const input of inputs) {
    if (input.value===primary.value) input.checked=false;
   }
   const count = inputs.filter(input=>input.checked).length;
   for (const input of inputs) input.disabled = (additional && (!primary.value || input.value===primary.value)) || (!input.checked && count>=limit);
  }
 }
 form.querySelector('.crew-tag-editor').addEventListener('change',update);
 update();
}

function crewTagFormValues(form) {
 if (!form.elements.primary_activity) return {};
 const values = new FormData(form);
 return {primary_activity:values.get('primary_activity')||null,
  additional_activities:values.getAll('additional_activities'), music_genres:values.getAll('music_genres')};
}

function directoryCard(crew) {
 const open = !!crew.recruiting && crew.members<crew.capacity;
 const href = '#crew/'+encodeURIComponent(crew.id);
 const chip = (tag,cls='')=>`<span class="directory-chip ${cls}">${esc(tag)}</span>`;
 const join = AifectCrewTags.CREW_JOIN_LABELS[crew.join_policy];
 return `<article class="directory-card">
 <header>${crewPicture(crew,'directory-photo')}<div><h3 title="${esc(crew.name)}"><a href="${href}">${esc(crew.name)}</a></h3>
 <span class="directory-state ${open?'open':''}">${open?'모집 중':'모집 마감'}</span></div></header>
 <p class="directory-intro">${esc(crew.description||'')}</p>
 <div class="directory-meta">${icon('users',16)} 멤버 ${number(crew.members)} / ${number(crew.capacity)}명 <span>·</span> Lv.${number(crew.level)}</div>
 <div class="directory-activities" aria-label="활동 방향">${crew.primary_activity?chip(crew.primary_activity,'primary'):'<small>활동 미설정</small>'}${crew.additional_activities.map(tag=>chip(tag)).join('')}</div>
 ${crew.music_genres.length?`<div class="directory-genres" aria-label="음악 장르">${crew.music_genres.map(tag=>chip(tag,'genre')).join('')}</div>`:''}
 <footer><span>${esc(join||'가입 방식 미설정')}</span><a class="small-button" href="${href}" aria-label="${esc(crew.name)} 크루 보기">크루 보기 ${icon('chevron',16)}</a></footer>
 </article>`;
}

function crewDirectoryView(data,q) {
 const {CREW_ACTIVITIES, CREW_GENRES, CREW_JOIN_LABELS} = AifectCrewTags;
 const select = (name,label,items)=>`<label class="directory-select"><span>${label}</span><select name="${name}" aria-label="${label}"><option value="">전체</option>
 ${items.map(([value,text])=>`<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select></label>`;
 return {tracks:[],crewDirectory:data,html:communityNavigation('crews','크루 탐색')+`<section class="crew-directory">
 <header class="directory-heading"><h1>크루 탐색</h1>${data.mine?`<a class="small-button" href="#crew/${encodeURIComponent(data.mine)}">${icon('users',16)} 내 크루${data.mine_name?' · '+esc(data.mine_name):''} ${icon('chevron',16)}</a>`:'<button type="button" class="small-button" data-create-crew>크루 만들기</button>'}</header>
 <form class="directory-filters">
 <div class="directory-search aifect-search">${icon('search',20)}<input type="search" name="q" maxlength="80" aria-label="크루명 또는 소개 검색" placeholder="크루명 또는 소개로 검색" value="${esc(q)}"><button class="text-link" type="submit">검색</button></div>
 <fieldset class="directory-activity-filter"><legend>활동 방향</legend><div>${['',...CREW_ACTIVITIES].map(tag=>`<label><input type="radio" name="activity" value="${esc(tag)}" ${tag?'':'checked'}><span>${esc(tag||'전체')}</span></label>`).join('')}</div></fieldset>
 <div class="directory-secondary">
 ${select('genre','음악 장르',CREW_GENRES.map(tag=>[tag,tag]))}
 ${select('recruiting','모집 상태',[['open','모집 중'],['closed','모집 마감']])}
 ${select('policy','가입 방식',Object.entries(CREW_JOIN_LABELS))}
 <button type="reset" class="text-link directory-reset">초기화</button></div></form>
 <div class="directory-results-head"><h2>검색 결과 <span data-directory-count aria-live="polite">${number(data.total)}개</span></h2>
 <select name="sort" aria-label="크루 정렬"><option value="recent">최신순</option><option value="members">인원순</option></select></div>
 <p class="directory-feedback" role="status" hidden></p><div class="directory-grid"></div><button type="button" class="small-button directory-more" hidden>더 보기</button>
 ${data.rankings?.length?`<details class="directory-ranking"><summary>크루 랭킹</summary>${crewRankingSidebarHTML(data.rankings)}</details>`:''}
 </section>`};
}

function bindDesktopCrewDirectory(initial) {
 const root = document.querySelector('.crew-directory'), form = root.querySelector('form');
 const grid = root.querySelector('.directory-grid'), count = root.querySelector('[data-directory-count]');
 const sort = root.querySelector('[name=sort]'), more = root.querySelector('.directory-more'), feedback = root.querySelector('.directory-feedback');
 let request, timer, loaded = 0;
 function paint(data,append) {
  const cards = data.crews.map(directoryCard).join('');
  if (append) grid.insertAdjacentHTML('beforeend',cards);
  else grid.innerHTML = cards || '<p class="social-empty">조건에 맞는 크루가 없습니다.</p>';
  loaded=(append?loaded:0)+data.crews.length;
  count.textContent=number(data.total)+'개';
  more.hidden=loaded>=data.total;
 }
 function cancel() {
  clearTimeout(timer);
  request?.abort();
  request=null;
 }
 async function search(append=false) {
  cancel();
  const current = request = new AbortController();
  const params = new URLSearchParams(new FormData(form));
  params.set('directory','1');
  params.set('sort',sort.value);
  if (append) params.set('offset',loaded);
  grid.setAttribute('aria-busy','true');
  more.disabled=true;
  feedback.hidden=true;
  try {
   const data = await api('/api/crews?'+params,'GET',undefined,{fresh:true,signal:current.signal});
   if (root.isConnected && !current.signal.aborted) paint(data,append);
  } catch (error) {
   if (!root.isConnected || current.signal.aborted) return;
   if (!append) {grid.replaceChildren(); count.textContent=''; more.hidden=true;}
   feedback.textContent=error.message;
   feedback.hidden=false;
  } finally {
   if (request===current) {grid.removeAttribute('aria-busy'); more.disabled=false;}
  }
 }
 form.onsubmit=e=>{e.preventDefault();void search();};
 form.oninput=e=>{if(e.target.name==='q'){cancel();more.disabled=true;timer=setTimeout(()=>search(),180);}};
 form.onchange=e=>{if(e.target.name!=='q') void search();};
 form.onreset=e=>{
  e.preventDefault();
  form.elements.q.value='';
  form.querySelector('[name=activity][value=""]').checked=true;
  for (const name of ['genre','recruiting','policy']) form.elements[name].value='';
  sort.value='recent';
  void search();
 };
 sort.onchange=()=>search();
 more.onclick=()=>search(true);
 registerRouteCleanup(cancel);
 paint(initial,false);
}

