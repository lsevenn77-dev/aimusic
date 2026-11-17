// Both directories use the same portrait, name and information panel.
function directoryArtistCard(artist, {management = false, owner = false} = {}) {
 const id = esc(artist.id), name = esc(artist.name);
 const href = '#artist/' + encodeURIComponent(artist.id);
 const key = 'artist/' + id;
 const details = management ? '' : `
  <p class="artist-ui-affiliation" title="소속 ${esc(artist.producer_name)}">소속 ${userNickname(artist.producer_name,{profileId:artist.producer_id})}</p>
  <a class="directory-followers" href="#follow?tab=artists&amp;artist=${encodeURIComponent(artist.id)}" data-followers="${key}" data-count="${Number(artist.followers)||0}">팔로워 <span data-follow-count>${number(artist.followers)}</span></a>`;
 let actions = '';
 if (!management) {
  actions = `<button type="button" class="directory-follow" data-follow-presentation="profile" data-follow="${key}" aria-pressed="${followed('artist',artist.id)}">${icon('user',14)}<span data-follow-label>팔로우</span></button>`;
 } else if (owner) {
  actions = `<div class="directory-card-actions">
   <button type="button" class="directory-card-action" data-directory-edit="${id}" aria-label="${name} 편집">편집</button>
   <button type="button" class="directory-card-action" data-directory-delete="${id}" aria-label="${name} 삭제">삭제</button>
  </div>`;
 }
 return `<article class="directory-artist">
  <a class="directory-photo" href="${href}" aria-label="${name} 프로필 보기" aria-haspopup="dialog">${avatarImage(artist,'artist',false)}</a>
  <div class="directory-card-info">
   <div class="directory-name"><a href="${href}" title="${name}" aria-haspopup="dialog">${name}</a></div>
   ${details}${actions}
  </div>
 </article>`;
}
function directoryAddCard() {
 return `<button type="button" class="directory-artist directory-add-card" data-mp-artist-add>
  <span class="directory-add-content">
   <span class="directory-add-symbol" aria-hidden="true">${icon('plus',36)}</span>
   <strong>아티스트 추가</strong>
   <span>새 프로필을 등록하세요.</span>
  </span>
 </button>`;
}
function ownedArtistDirectory(d,pins,pid){
 const owner=!!pins.can_manage&&me?.id===d.profile.user_id;
 return `<section class="artist-directory artist-directory-owned" data-can-manage="${owner}"><header class="directory-heading"><div><h1>소속 아티스트</h1><p>${owner?'내가 제작하고 관리하는 AI 아티스트입니다.':esc(d.profile.name)+'의 AI 아티스트입니다.'}</p></div><div class="directory-controls"><span>총 ${number(d.artists.length)}명</span>${owner?`<button type="button" class="primary-button directory-add" data-mp-artist-add>${icon('plus',18)} 아티스트 추가</button>`:''}</div></header><div class="directory-grid">${d.artists.map(a=>directoryArtistCard(a,{management:true,owner})).join('')}${owner?directoryAddCard():''}</div>${!d.artists.length&&!owner?'<p class="directory-empty">등록된 아티스트가 없어요.</p>':''}</section>`;
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
 const modal=document.createElement('dialog');modal.id='directory-editor';modal.className='compact-popup';modal.setAttribute('aria-labelledby','directory-editor-title');
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
async function deleteDirectoryArtist(a){
 if(!confirm(`“${a.name}” 아티스트를 삭제할까요?\n삭제한 아티스트는 복구할 수 없으며 프로필 상단 고정도 해제됩니다.\n음원·게시글·팔로우 등 연결 데이터가 있으면 삭제되지 않습니다.`))return;
 await api('/api/studio/artists/'+encodeURIComponent(a.id),'DELETE',{confirmation:a.id,name:a.name});
 await render();toast('아티스트를 삭제했어요.');
}
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-directory-edit],[data-directory-delete]');if(!button||button.disabled)return;e.preventDefault();button.disabled=true;
 try{
  const d=await api('/api/studio','GET',undefined,{fresh:true}),a=d.artists.find(a=>a.id===(button.dataset.directoryEdit||button.dataset.directoryDelete));if(!a)throw new Error('편집 권한을 확인해주세요.');
  if(button.hasAttribute('data-directory-delete'))await deleteDirectoryArtist(a);
  else await openDirectoryEditor(a,d,button);
 }catch(err){toast(err.message);}finally{button.disabled=false;}
});
