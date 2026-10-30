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
 return `<section class="artist-directory artist-directory-owned" data-can-manage="${owner}"><header class="directory-heading"><div><h1>소속 아티스트</h1><p>${owner?'내가 제작하고 관리하는 AI 아티스트입니다.':esc(d.profile.name)+'의 AI 아티스트입니다.'}</p></div><div class="directory-controls"><span>총 ${number(d.artists.length)}명</span>${owner?`<button type="button" class="primary-button directory-add" data-mp-artist-add>${icon('plus',18)} 아티스트 추가</button>`:''}</div></header><div class="directory-grid">${d.artists.map(a=>directoryArtistCard(a,{owner,producerName:d.profile.name})).join('')}${owner?`<button type="button" class="directory-artist artist-ui-card directory-add-card" data-mp-artist-add><span class="directory-add-symbol">${icon('plus',56)}</span><strong>아티스트 추가</strong><span>새로운 AI 아티스트를 생성하고<br>나만의 음악 세계를 확장해보세요.</span></button>`:''}</div>${!d.artists.length&&!owner?'<p class="directory-empty">등록된 아티스트가 없어요.</p>':''}</section>`;
}
function publicArtistDirectory(d){
 const sort=d.sort||'popular';
 const href=o=>'#artists?'+new URLSearchParams({sort,offset:o});
 return `<section class="artist-directory"><header class="directory-heading"><div><h1>AI 아티스트</h1><p>다양한 AI 아티스트의 음악을 만나보세요.</p></div><div class="directory-controls"><span>총 ${number(d.total)}명</span><select data-dropdown="md" data-directory-sort aria-label="아티스트 정렬"><option value="popular" ${sort==='popular'?'selected':''}>인기순</option><option value="recent" ${sort==='recent'?'selected':''}>최신순</option></select></div></header>${d.artists.length?`<div class="directory-grid">${d.artists.map(a=>directoryArtistCard(a)).join('')}</div>`:'<p class="directory-empty">아직 공개된 AI 아티스트가 없어요.</p>'}<nav class="directory-pagination" aria-label="아티스트 페이지">${d.offset?`<a class="small-button" href="${esc(href(Math.max(0,d.offset-50)))}">이전</a>`:''}${d.nextOffset!==null?`<a class="small-button" href="${esc(href(d.nextOffset))}">다음</a>`:''}</nav></section>`;
}
// Draft pin operations use the same ordered IDs and three-artist limit as the API.
function directoryPinChange(ids,id,action){
 const next=[...ids],index=next.indexOf(id);
 if(action==='up'){if(index>0)[next[index-1],next[index]]=[next[index],next[index-1]];}
 else if(action==='remove'){if(index>=0)next.splice(index,1);}
 else if(index<0){if(next.length>=3)throw new Error('최대 3명까지 고정할 수 있어요. 먼저 한 명을 해제해주세요.');next.push(id);}
 return next;
}
async function openDirectoryEditor(a,d,trigger){
 if(document.querySelector('#directory-editor'))return;
 const pinURL='/api/producers/'+encodeURIComponent(d.producer.id)+'/pinned-artists';
 const savedPins=await api(pinURL,'GET',undefined,{fresh:true});
 if(!savedPins.can_manage)throw new Error('편집 권한을 확인해주세요.');
 let ids=[...savedPins.ids],baselinePins=JSON.stringify(ids);
 const modal=document.createElement('dialog');modal.id='directory-editor';modal.setAttribute('aria-labelledby','directory-editor-title');
 modal.innerHTML=`<header><h2 id="directory-editor-title">아티스트 수정</h2><button type="button" class="dialog-close" data-directory-close aria-label="닫기">×</button></header><form id="directory-edit-form" class="upload-form">${imageField('프로필 사진','image',profileImageURL(a,'artist'),true)}${formField('아티스트 이름','name','text',a.name,'required maxlength="60"')}${bioField('소개','bio',a.bio)}${genreField(a.genre)}<section class="directory-editor-pins"><label class="checkbox-line"><input type="checkbox" data-directory-pin>프로필 상단 고정</label><p class="field-help">최대 3명 · 아래 순서대로 표시해요. 변경 후 프로필을 저장해주세요.</p><div data-directory-pin-list></div></section><p class="form-error" role="alert"></p><footer><button type="submit" class="primary-button">프로필 저장</button></footer></form>`;
 document.body.append(modal);
 const form=modal.querySelector('form'),pin=form.querySelector('[data-directory-pin]'),list=form.querySelector('[data-directory-pin-list]');
 const paintPins=()=>{pin.checked=ids.includes(a.id);list.innerHTML=ids.map((id,i)=>`<div class="directory-editor-pin-row"><span title="${esc(d.artists.find(x=>x.id===id)?.name||id)}">${i+1}. ${esc(d.artists.find(x=>x.id===id)?.name||id)}</span><button type="button" class="small-button" data-directory-pin-up="${esc(id)}" ${i===0?'disabled':''} aria-label="${esc(d.artists.find(x=>x.id===id)?.name||id)} 위로 이동">위로</button><button type="button" class="small-button" data-directory-pin-remove="${esc(id)}" aria-label="${esc(d.artists.find(x=>x.id===id)?.name||id)} 고정 해제">해제</button></div>`).join('');};
 paintPins();bindImageInputs(form);form.elements.bio.rows=3;
 const snapshot=()=>JSON.stringify([...new FormData(form)].map(([k,v])=>[k,typeof v==='string'?v:(v.size?[v.name,v.size,v.lastModified]:null)]).concat([['pins',ids],['genre-choice',form.querySelector('[data-genre-select]').value]]));
 const initial=snapshot();
 const requestClose=()=>{
  if(form._busy)return;
  if(snapshot()===initial){modal.close();return;}
  if(modal.querySelector('.directory-discard'))return;
  const confirmation=document.createElement('div');confirmation.className='directory-discard';confirmation.setAttribute('role','alertdialog');confirmation.setAttribute('aria-label','저장하지 않은 변경 사항');
  confirmation.innerHTML='<p>저장하지 않은 변경 사항이 있어요. 저장하지 않고 닫을까요?</p><div><button type="button" class="small-button" data-keep-editing>계속 수정</button><button type="button" class="small-button" data-discard>저장 없이 닫기</button></div>';
  form.inert=true;modal.append(confirmation);
  confirmation.querySelector('[data-keep-editing]').onclick=()=>{form.inert=false;confirmation.remove();modal.querySelector('[data-directory-close]').focus();};
  confirmation.querySelector('[data-discard]').onclick=()=>modal.close();confirmation.querySelector('[data-keep-editing]').focus();
 };
 modal.querySelector('[data-directory-close]').onclick=requestClose;
 modal.addEventListener('cancel',e=>{e.preventDefault();requestClose();});
 const warn=e=>{if(snapshot()!==initial){e.preventDefault();e.returnValue='';}};
 window.addEventListener('beforeunload',warn);
 modal.addEventListener('close',()=>{window.removeEventListener('beforeunload',warn);modal.remove();trigger?.focus();},{once:true});
 pin.onchange=()=>{try{ids=directoryPinChange(ids,a.id,pin.checked?'add':'remove');formError(form).textContent='';}catch(err){formError(form).textContent=err.message;}paintPins();};
 list.onclick=e=>{if(form._busy)return;const b=e.target.closest('[data-directory-pin-up],[data-directory-pin-remove]');if(!b)return;ids=directoryPinChange(ids,b.dataset.directoryPinUp||b.dataset.directoryPinRemove,b.dataset.directoryPinUp?'up':'remove');paintPins();};
 form.onsubmit=busyForm(form,async fd=>{
  const pendingIds=[...ids],pinsChanged=JSON.stringify(pendingIds)!==baselinePins;
  const controls=[...form.querySelectorAll('input,select,textarea,button')],disabled=controls.map(c=>c.disabled);
  controls.forEach(c=>c.disabled=true);
  try{
   await validateImage(fd.get('image'));
   if(pinsChanged){const latest=await api(pinURL,'GET',undefined,{fresh:true});if(JSON.stringify(latest.ids)!==baselinePins)throw new Error('다른 화면에서 상단 고정이 변경됐어요. 다시 열어 최신 상태를 확인해주세요.');}
   await api('/api/studio/artists/'+encodeURIComponent(a.id),'PUT',textFields(fd));
   if(fd.get('image')?.size)await uploadFile('/api/studio/artists/'+encodeURIComponent(a.id)+'/image',fd.get('image'));
   if(pinsChanged){await api(pinURL,'PUT',{ids:pendingIds});baselinePins=JSON.stringify(pendingIds);}
   modal.close();await render();toast('아티스트 프로필을 저장했어요.');
  }finally{controls.forEach((c,i)=>c.disabled=disabled[i]);}
 });
 modal.showModal();
}
document.addEventListener('change',e=>{
 if(!e.target.matches('[data-directory-sort]'))return;
 const q=new URLSearchParams(location.hash.split('?')[1]||'');q.delete('view');q.set('sort',e.target.value);q.set('offset','0');location.hash='artists?'+q;
});
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-directory-edit]');if(!button)return;e.preventDefault();button.disabled=true;
 try{
  const d=await api('/api/studio'),a=d.artists.find(a=>a.id===button.dataset.directoryEdit);if(!a)throw new Error('편집 권한을 확인해주세요.');
  await openDirectoryEditor(a,d,button);
 }catch(err){toast(err.message);}finally{button.disabled=false;}
});
