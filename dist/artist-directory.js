// Directory and dashboard cards share visuals, retaining their own actions.
function artistAffiliation(a,producerName=''){
 const name=a.producer_name||producerName;
 return `<p class="directory-creator artist-ui-affiliation" title="소속 ${esc(name)}"><span>소속</span> ${esc(name)}</p>`;
}
function directoryArtistCard(a,{owner=false,producerName=''}={}){
 const key='artist/'+a.id,following=followed('artist',a.id);
 return `<article class="directory-artist artist-ui-card"><a class="directory-photo" href="#artist/${esc(a.id)}" aria-label="${esc(a.name)} 상세">${portrait(a,'artist')}</a><div class="directory-name"><a href="#artist/${esc(a.id)}" title="${esc(a.name)}">${esc(a.name)}</a>${owner?`<button type="button" data-directory-edit="${esc(a.id)}" aria-label="${esc(a.name)} 수정">${icon('edit',16)}</button>`:''}</div>${artistAffiliation(a,producerName)}<div class="directory-social"><p class="directory-followers" data-followers="${esc(key)}" data-count="${Number(a.followers)||0}">팔로워 <span data-follow-count>${number(a.followers)}</span></p><button type="button" class="directory-follow" data-follow="${esc(key)}" aria-pressed="${following}">${icon('user',14)}<span data-follow-label>${following?'팔로잉':'팔로우'}</span></button></div></article>`;
}
function ownedArtistDirectory(d,pins,pid){
 const owner=!!pins.can_manage&&me?.id===d.profile.user_id;
 return `<section class="artist-directory artist-directory-owned" data-can-manage="${owner}"><header class="directory-heading"><div><h1>소속 아티스트</h1><p>${owner?'내가 제작하고 관리하는 AI 아티스트입니다.':esc(d.profile.name)+'의 AI 아티스트입니다.'}</p></div><div class="directory-controls"><span>총 ${number(d.artists.length)}명</span>${owner?`<button type="button" class="primary-button directory-add" data-mp-artist-add>${icon('plus',18)} 아티스트 추가</button>`:''}</div></header><div class="directory-grid">${d.artists.map(a=>directoryArtistCard(a,{owner,producerName:d.profile.name})).join('')}${owner?`<button type="button" class="directory-artist artist-ui-card directory-add-card" data-mp-artist-add><span class="directory-add-symbol">${icon('plus',56)}</span><strong>아티스트 추가</strong><span>새로운 AI 아티스트를 생성하고<br>나만의 음악 세계를 확장해보세요.</span></button>`:''}</div>${!d.artists.length&&!owner?'<p class="directory-empty">등록된 아티스트가 없어요.</p>':''}${owner&&d.artists.length?`<details class="directory-pins"><summary>프로필 상단 고정 관리</summary><p>최대 3명을 프로필에 먼저 표시해요.</p><div class="profile-pins" data-pin-owner="${esc(pid)}" data-pins="${esc(JSON.stringify(pins.ids))}">${d.artists.map(a=>`<article class="directory-pin-row"><a href="#artist/${esc(a.id)}">${esc(a.name)}</a><button class="small-button" data-pin-artist="${esc(a.id)}">${pins.ids.includes(a.id)?'고정 해제':'상위 고정'}</button>${pins.ids.includes(a.id)?`<button class="small-button" data-pin-up="${esc(a.id)}" aria-label="${esc(a.name)} 위로 이동">위로</button>`:''}</article>`).join('')}</div></details>`:''}</section>`;
}
function publicArtistDirectory(d,raw){
 const q=new URLSearchParams(raw.split('?')[1]||''),view=q.get('view')==='list'?'list':'grid',sort=d.sort||'popular';
 const href=(v=view,s=sort,o=0)=>'#artists?'+new URLSearchParams({sort:s,view:v,offset:o});
 return `<section class="artist-directory"><header class="directory-heading"><div><h1>AI 아티스트</h1><p>다양한 AI 아티스트의 음악을 만나보세요.</p></div><div class="directory-controls"><span>총 ${number(d.total)}명</span><select data-directory-sort aria-label="아티스트 정렬"><option value="popular" ${sort==='popular'?'selected':''}>인기순</option><option value="recent" ${sort==='recent'?'selected':''}>최신순</option></select><nav class="directory-views" aria-label="아티스트 보기"><a href="${esc(href('grid',sort,d.offset))}" aria-label="그리드 보기" ${view==='grid'?'aria-current="true"':''}>${icon('grid',24)}</a><a href="${esc(href('list',sort,d.offset))}" aria-label="리스트 보기" ${view==='list'?'aria-current="true"':''}>${icon('list',24)}</a></nav></div></header>${d.artists.length?`<div class="directory-grid ${view==='list'?'directory-list':''}">${d.artists.map(a=>directoryArtistCard(a)).join('')}</div>`:'<p class="directory-empty">아직 공개된 AI 아티스트가 없어요.</p>'}<nav class="directory-pagination" aria-label="아티스트 페이지">${d.offset?`<a class="small-button" href="${esc(href(view,sort,Math.max(0,d.offset-50)))}">이전</a>`:''}${d.nextOffset!==null?`<a class="small-button" href="${esc(href(view,sort,d.nextOffset))}">다음</a>`:''}</nav></section>`;
}
document.addEventListener('change',e=>{
 if(!e.target.matches('[data-directory-sort]'))return;
 const q=new URLSearchParams(location.hash.split('?')[1]||'');q.set('sort',e.target.value);q.set('offset','0');location.hash='artists?'+q;
});
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-directory-edit]');if(!button)return;e.preventDefault();button.disabled=true;
 try{
  const d=await api('/api/studio'),a=d.artists.find(a=>a.id===button.dataset.directoryEdit);if(!a)throw new Error('편집 권한을 확인해주세요.');
  dialog(`<h2>아티스트 수정</h2><form id="directory-edit-form" class="upload-form">${imageField('프로필 사진','image',profileImageURL(a,'artist'),true)}${formField('아티스트 이름','name','text',a.name,'required maxlength="60"')}${bioField('소개','bio',a.bio)}${genreField(a.genre)}<button class="primary-button">아티스트 프로필 저장</button><p class="form-error" role="alert"></p></form>`);bindImageInputs();
  const form=$('#directory-edit-form');form.onsubmit=busyForm(form,async fd=>{await validateImage(fd.get('image'));await api('/api/studio/artists/'+encodeURIComponent(a.id),'PUT',textFields(fd));if(fd.get('image')?.size)await uploadFile('/api/studio/artists/'+encodeURIComponent(a.id)+'/image',fd.get('image'));$('#dialog').close();await render();toast('아티스트 프로필을 저장했어요.');});
 }catch(err){toast(err.message);}finally{button.disabled=false;}
});
