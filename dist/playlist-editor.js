// Unified playlists are enabled only after the server verifies the legacy data.
let unificationRead=null,unificationRetry=0;
async function checkPlaylistUnification(){
 if(globalThis.AifectUnifiedPlaylists || Date.now()<unificationRetry)return !!globalThis.AifectUnifiedPlaylists;
 if(!unificationRead){
  unificationRead=api('/api/library/unification','GET',undefined,{fresh:true})
   .then(data=>{globalThis.AifectUnifiedPlaylists=data.ready===true;})
   .catch(()=>{globalThis.AifectUnifiedPlaylists=false;})
   .finally(()=>{unificationRead=null;unificationRetry=Date.now()+15000;});
 }
 await unificationRead;
 return !!globalThis.AifectUnifiedPlaylists;
}
const itemKey=item=>JSON.stringify([item.kind,item.content_id]);
const itemRef=({kind,content_id})=>({kind,content_id});
const restrictedItems=items=>items.some(item=>item.kind==='cover'||item.kind==='dubbing');
const unifiedItemTitle=item=>item.content?.title||'이용할 수 없는 콘텐츠';


function confirmPrivatePlaylist(){
 const modal=document.createElement('dialog');
 modal.className='playlist-confirm';
 modal.setAttribute('aria-labelledby','playlist-confirm-title');
 modal.innerHTML='<p id="playlist-confirm-title">'+AifectMessages.playlistPrivatePrompt+'</p><form method="dialog" class="inline-actions"><button class="small-button" value="cancel" autofocus>취소</button><button class="primary-button" value="private">비공개로 변경</button></form>';
 document.body.append(modal);
 return new Promise(resolve=>{
  const close=()=>modal.close('cancel');
  window.addEventListener('hashchange',close,{once:true});
  modal.addEventListener('close',()=>{
   window.removeEventListener('hashchange',close);
   const confirmed=modal.returnValue==='private';modal.remove();resolve(confirmed);
  },{once:true});
  modal.showModal();
 });
}
async function selectPlaylistForItem(item){
 if(!me)return askLogin();
 return libraryPicker({kind:'playlists',item,onSelect:async(pid,selected)=>{
  const change=!!selected.is_public&&restrictedItems([item]);
  if(change&&!await confirmPrivatePlaylist())return false;
  const data=await api('/api/playlists/'+encodeURIComponent(pid)+'/items','PUT',{...itemRef(item),revision:selected.revision,confirm_private:change});
  toast(data.already_added?'이미 추가된 콘텐츠입니다.':'플레이리스트에 추가되었습니다.');
 }});
}
function unifiedPlaylistActions(p,owned){
 const id=esc(p.id),privacy=p.is_public?'공개':'비공개';
 return `<div class="collection-card-actions"><small class="ml-playlist-status" role="img" title="${privacy}" aria-label="${privacy}">${icon(p.is_public?'share':'lock')}</small>${p.saved?`<small class="ml-playlist-status" role="img" title="저장한 플레이리스트" aria-label="저장한 플레이리스트">${icon('bookmark')}</small>`:''}<button type="button" class="icon-button" data-unified-menu="${id}" data-owned="${owned?1:0}" data-saved="${p.saved?1:0}" aria-haspopup="dialog" aria-label="${esc(p.name)} 옵션">${icon('ui-menu-action')}</button></div>`;
}
function editableItemRows(items){
 return items.map((item,i)=>{
  const title=esc(unifiedItemTitle(item));
  return `<div class="playlist-order-row"><span>${i+1}</span><div><strong title="${title}">${title}</strong><small>${libraryKindName(item.kind)}</small></div><button type="button" class="small-button" data-item-up="${i}" aria-label="${title} 위로" ${i?'':'disabled'}>↑</button><button type="button" class="small-button" data-item-down="${i}" aria-label="${title} 아래로" ${i+1<items.length?'':'disabled'}>↓</button><button type="button" class="small-button" data-item-remove="${i}" aria-label="${title} 제거">제거</button></div>`;
 }).join('')||'<p class="field-help">아직 추가된 콘텐츠가 없습니다.</p>';
}
async function unifiedPlaylistEditor({id=null,initial=null,fork=false,focusItems=false,find=false,source='search'}={}){
 if(!me)return askLogin();
 const uid=me.id,ticket=renderId,request_id=crypto.randomUUID();
 const current=()=>me?.id===uid&&ticket===renderId;
 const detail=id?await api('/api/playlists/'+encodeURIComponent(id),'GET',undefined,{fresh:true}):null;
 const original=detail?.playlist||{};
 if(!current())return;
 if(fork&&!original.saved)return toast('먼저 플레이리스트를 저장해 주세요.');
 const items=[...(detail?.items||[])];
 if(initial){
  if(typeof initial==='string'){
   const track=trackMap.get(initial)||(await api('/api/tracks/'+encodeURIComponent(initial))).track;
   initial={kind:track.kind,content_id:track.id,content:track};
  }else if(!initial.content){
   if(initial.kind==='dubbing')initial={...initial,content:(await api('/api/dubbing/projects/'+encodeURIComponent(initial.content_id))).project};
   else initial={...initial,content:(await api('/api/tracks/'+encodeURIComponent(initial.content_id))).track};
  }
  items.push(initial);
 }
 if(!current())return;
 dialog(`<h2>${fork?'내 플레이리스트로 편집':id?'플레이리스트 편집':'새 플레이리스트'}</h2><form id="playlist-form" class="playlist-editor">
  <div id="playlist-design-preview" inert aria-label="플레이리스트 미리보기"></div>
  ${fork?'':imageField('대표 이미지','image',id?playlistImageURL(original):'')}
  ${!fork&&original.image_version?'<label class="checkbox-line"><input type="checkbox" name="remove_image">기본 커버 사용</label>':''}
  ${formField('제목','name','text',original.name||'','required maxlength="80"')}
  <label class="form-field">짧은 소개<textarea name="description" maxlength="600">${esc(original.description||'')}</textarea></label>
  <label class="checkbox-line"><input type="checkbox" name="is_public" ${original.is_public&&!fork?'checked':''}>공개</label><p class="field-help" data-privacy-note></p>
  <div class="mp-section-head"><strong>수록 콘텐츠 <span data-item-count></span></strong><button type="button" class="small-button" data-item-find>콘텐츠 추가</button></div>
  <div id="playlist-editor-items" class="playlist-order-rows"></div>
  <section class="playlist-candidates" aria-label="추가할 콘텐츠" hidden>
   <label class="form-field">찾을 위치<select name="item_source"><option value="search">전체 검색</option><option value="likes">좋아요</option><option value="history">최근 감상</option></select></label>
   <label class="form-field">콘텐츠 검색<input type="search" name="item_query" maxlength="100" placeholder="제목, 가수 또는 제작자"></label>
   <div class="dialog-list" data-candidate-results aria-live="polite"></div><button type="button" class="small-button" data-candidate-more hidden>더보기</button>
  </section><p class="form-error" role="alert"></p><button type="submit" class="primary-button">저장</button></form>`);
 const form=$('#playlist-form'),field=form.elements,rows=form.querySelector('#playlist-editor-items'),candidatePanel=form.querySelector('.playlist-candidates'),results=form.querySelector('[data-candidate-results]'),more=form.querySelector('[data-candidate-more]');
 const live=()=>form.isConnected&&$('#dialog').open&&current();
 const needsTitle=()=>!restrictedItems(items);
 let consent=false,previewURL='',savedId=null,serial=0,timer,candidates=[],offset=null;
 const titleCheck=libraryTitleCheck(form,()=>!fork&&id?id:'',needsTitle);
 const resetPreview=()=>{if(previewURL)URL.revokeObjectURL(previewURL);previewURL='';};
 const preview=()=>{
  const p={...original,id:id||'',name:field.name.value||'플레이리스트 제목',description:field.description.value,owner_name:me.display_name||me.name,user_id:me.id,owner_profile_id:me.profile_id,tracks:items.length,covers:items.filter(i=>i.content).slice(0,4).map(i=>({...i.content,kind:i.kind}))};
  if(field.remove_image?.checked)p.image_version='';
  const host=form.querySelector('#playlist-design-preview');host.innerHTML=recommendedPlaylistCard(p);
  if(previewURL){const art=host.querySelector('.public-playlist-cover');art.className='public-playlist-cover collage collage-1';art.innerHTML='<img src="'+esc(previewURL)+'" alt="선택한 대표 이미지">';}
 };
 const paintCandidates=()=>{
  const chosen=new Set(items.map(itemKey));
  results.innerHTML=candidates.map((i,n)=>`<button type="button" class="small-button" data-candidate="${n}" ${chosen.has(itemKey(i))?'disabled':''}>${esc(unifiedItemTitle(i))} · ${libraryKindName(i.kind)}${chosen.has(itemKey(i))?' · 추가됨':''}</button>`).join('')||'<p class="field-help">'+esc(AifectMessages.searchEmpty)+'</p>';
 };
 const paint=()=>{
  rows.innerHTML=editableItemRows(items);form.querySelector('[data-item-count]').textContent=number(items.length);
  const restricted=!needsTitle();if(restricted||!items.length)field.is_public.checked=false;
  field.is_public.disabled=restricted||!items.length;
  form.querySelector('[data-privacy-note]').textContent=restricted?'커버곡 또는 더빙이 포함된 플레이리스트는 비공개로 저장됩니다.':!items.length?'빈 플레이리스트는 비공개로 저장됩니다.':field.is_public.checked?'공개 플레이리스트입니다.':'비공개 플레이리스트입니다.';
  if(!candidatePanel.hidden)paintCandidates();preview();
 };
 const load=async(append=false)=>{
  const n=++serial;clearTimeout(timer);more.disabled=true;
  if(!append){candidates=[];results.textContent='콘텐츠를 불러오는 중입니다.';more.hidden=true;}
  try{
   const data=await api('/api/playlists/candidates?'+new URLSearchParams({source:field.item_source.value,q:field.item_query.value,limit:20,offset:append?offset:0}),'GET',undefined,{fresh:true});
   if(n!==serial||!live())return;
   candidates=append?[...candidates,...data.items]:data.items;offset=data.nextOffset;more.hidden=offset==null;paintCandidates();
  }catch(e){if(n===serial&&live())results.textContent=e.message;}finally{if(n===serial)more.disabled=false;}
 };
 const showCandidates=()=>{candidatePanel.hidden=false;field.item_query.focus();void load();};
 field.item_source.value=source;form.querySelector('[data-item-find]').onclick=showCandidates;
 more.onclick=()=>load(true);field.item_source.onchange=()=>load();field.item_query.oninput=e=>{if(e.isComposing)return;++serial;clearTimeout(timer);timer=setTimeout(load,180);};
 field.item_query.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();load();}};
 results.onclick=async e=>{
  const btn=e.target.closest('[data-candidate]');if(!btn||btn.disabled)return;
  const item=candidates[Number(btn.dataset.candidate)];if(!item||items.some(i=>itemKey(i)===itemKey(item)))return;
  if((fork||!original.is_public)&&restrictedItems([item])&&field.is_public.checked){
   if(!await confirmPrivatePlaylist()||!live())return;
   consent=true;
  }
  items.push(item);paint();
 };
 rows.onclick=e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.hasAttribute('data-item-remove'))items.splice(Number(b.dataset.itemRemove),1);
  else {const up=b.hasAttribute('data-item-up'),from=Number(up?b.dataset.itemUp:b.dataset.itemDown),to=from+(up?-1:1);[items[from],items[to]]=[items[to],items[from]];}
  paint();
 };
 field.name.oninput=preview;field.description.oninput=preview;field.is_public.onchange=paint;
 if(!fork){bindImageInputs(form);field.image.addEventListener('change',()=>{resetPreview();if(field.image.files?.[0])previewURL=URL.createObjectURL(field.image.files[0]);preview();});field.remove_image?.addEventListener('change',preview);form.querySelector('[data-reset-image]')?.addEventListener('click',()=>{resetPreview();preview();});}
 $('#dialog').addEventListener('close',()=>{resetPreview();clearTimeout(timer);++serial;},{once:true});
 paint();if(find)showCandidates();else if(focusItems)rows.scrollIntoView({block:'nearest'});
 form.onsubmit=busyForm(form,async fd=>{
  if(!live())throw Error('화면이나 계정이 변경되었습니다. 다시 열어 주세요.');
  if(!savedId){
   if(!await titleCheck())throw Error('플레이리스트 제목을 확인해 주세요.');
   const restricted=restrictedItems(items);
   if(!fork&&original.is_public&&restricted&&!consent){
    if(!await confirmPrivatePlaylist()){
     if(live()){for(let n=items.length-1;n>=0;n--)if(restrictedItems([items[n]]))items.splice(n,1);field.is_public.checked=true;paint();}
     return;
    }
    if(!live())return;
    consent=true;
   }
   const file=fd.get('image');if(file?.size)await validateImage(file);
   if(!live())return;
   const path='/api/playlists'+(id?'/'+encodeURIComponent(id):'')+(fork?'/fork':'');
   const body={name:fd.get('name'),description:fd.get('description'),is_public:!restricted&&items.length>0&&fd.has('is_public'),items:items.map(itemRef),confirm_private:consent,request_id,...(fork?{source_revision:original.revision}:id?{revision:original.revision}:{})};
   const data=await api(path,id&&!fork?'PATCH':'POST',body);savedId=id&&!fork?id:data.id;
  }
  if(!fork){
   try{
    const image=fd.get('image');
    if(image?.size)await uploadFile('/api/playlists/'+encodeURIComponent(savedId)+'/image',image);
    else if(fd.has('remove_image'))await api('/api/playlists/'+encodeURIComponent(savedId)+'/image','DELETE');
   }catch(error){
    for(const input of form.querySelectorAll('[name=name],[name=description],[name=is_public],[data-item-find],#playlist-editor-items button,.playlist-candidates button'))input.disabled=true;
    throw Error('플레이리스트는 저장되었습니다. 대표 이미지를 확인한 뒤 다시 저장해 주세요. '+error.message);
   }
  }
  if(!live())return;
  $('#dialog').close();toast(fork?'편집본이 내 플레이리스트에 저장되었습니다.':'플레이리스트가 저장되었습니다.');
  const href='#playlist/'+encodeURIComponent(savedId);if(location.hash===href)await render();else location.hash=href;
 });
}

function unifiedPlaylistRows(items,owned,mixed){
 if(!items.length)return '<p class="empty-inline">표시할 콘텐츠가 없습니다.</p>';
 return items.map(i=>{
  const cid=esc(i.content_id),title=esc(unifiedItemTitle(i)),kind=esc(i.kind),href='#'+(i.kind==='dubbing'?'dubbing/':'song/')+encodeURIComponent(i.content_id);
  const item=i.content;
  const playButton=mixed?'data-unified-play="'+cid+'" data-kind="'+kind+'"':'data-play="'+cid+'"';
  return `<article class="mybox-item"><div class="mybox-item-main">${i.available?`<a href="${href}">${cover({...item,kind:i.kind},'mini-cover')}<span><strong title="${title}">${title}</strong><small>${libraryKindName(i.kind)}${i.kind==='dubbing'?'':' · '+(i.kind==='cover'?trackPerformers(item):trackNickname(item))}</small></span></a>`:`<strong>${title}</strong><small>${libraryKindName(i.kind)}</small>`}</div><div class="mybox-item-actions">${i.available?`<button class="icon-button" ${playButton} aria-label="${title} 재생">${icon('ui-play-action')}</button>${i.kind!=='dubbing'?`<button class="icon-button" data-track-menu="${cid}" aria-label="${title} 옵션">${icon('ui-menu-action')}</button>`:''}`:''}${owned?`<button class="icon-button" data-unified-remove="${cid}" data-kind="${kind}" aria-label="${title} 제거">${icon('ui-minus-action')}</button>`:''}</div></article>`;
 }).join('');
}
function unifiedPlaylistDetail(data,owned){
 const p=data.playlist,id=esc(p.id),audioOnly=data.items.every(item=>item.available&&item.kind!=='dubbing');
 const card={...p,tracks:data.items.length,covers:data.items.filter(i=>i.content).slice(0,4).map(i=>({...i.content,kind:i.kind}))};
 const showRows=items=>audioOnly&&items.length?list(items.map(i=>i.content),owned?p.id:null):unifiedPlaylistRows(items,owned,!audioOnly);
 const html=`<section class="unified-playlist-detail"><a class="text-link" href="${owned||p.saved?'#profile?view=library&section=playlists':'#collections'}">← ${owned||p.saved?'내 보관함':'추천 플레이리스트'}</a>
 <div class="unified-playlist-preview">${recommendedPlaylistCard(card)}</div>
 <p class="ml-playlist-status">${icon(p.is_public?'share':'lock')} ${p.is_public?'공개':'비공개'} ${p.saved?icon('bookmark'):''}</p>
 <div class="inline-actions playlist-actions"><button class="primary-button" ${audioOnly?'data-play-all':'data-unified-all'} ${data.items.some(i=>i.available)?'':'disabled'}>전체 재생 ${icon('ui-play-action')}</button>
 ${owned?`<button class="small-button" data-pick-playlist="${id}">콘텐츠 추가</button><button class="small-button" data-order-playlist="${id}">순서 변경</button><button class="small-button" data-edit-playlist="${id}">편집</button><button class="text-link" data-delete-playlist="${id}">삭제</button>`:`<button class="small-button" data-playlist-save="${id}" aria-pressed="${!!p.saved}">${p.saved?'저장 해제':'저장'}</button>${p.saved?`<button class="small-button" data-playlist-fork="${id}">내 플레이리스트로 편집</button>`:''}`}
 ${p.is_public?'<button class="small-button" data-share>링크 복사</button>':''}</div>
 <div class="explorer-toolbar"><input type="search" id="playlist-filter" aria-label="플레이리스트 내 콘텐츠 검색" placeholder="콘텐츠 검색"></div>
 <div id="playlist-song-list">${showRows(data.items)}</div></section>`;
 return {html,tracks:data.tracks,playlist:p,playlistItems:data.items,showPlaylistRows:showRows};
}
function bindUnifiedPlaylistDetail(view){
 const container=$('.unified-playlist-detail');if(!container)return;
 const p=view.playlist;
 $('#playlist-filter').oninput=e=>{
  const q=e.target.value.trim().toLocaleLowerCase();
  $('#playlist-song-list').innerHTML=view.showPlaylistRows(view.playlistItems.filter(i=>[unifiedItemTitle(i),i.content?.artist,i.content?.producer].some(text=>String(text||'').toLocaleLowerCase().includes(q))));
 };
 container.onclick=async event=>{
  const button=event.target.closest('[data-unified-all],[data-unified-play],[data-unified-remove]');if(!button||button.disabled)return;
  button.disabled=true;
  try{
   if(button.hasAttribute('data-unified-remove')){
    const ref={kind:button.dataset.kind,content_id:button.dataset.unifiedRemove};
    try{await api('/api/playlists/'+encodeURIComponent(p.id)+'/items','DELETE',{...ref,revision:p.revision});await render();}
    catch(err){
     if(err.status!==409||!button.isConnected)throw err;
     toast(err.message);await unifiedPlaylistEditor({id:p.id,focusItems:true});
    }
   }else await startTypedPlaylist(p.id,button.dataset.unifiedPlay?{kind:button.dataset.kind,content_id:button.dataset.unifiedPlay}:null);
  }catch(error){toast(error.message);}finally{if(button.isConnected)button.disabled=false;}
 };
}

let typedPlaylistPlayback=null,typedPlaybackRequest=0;
function clearTypedPlaylist(){
 typedPlaylistPlayback=null;++typedPlaybackRequest;
}
async function playTypedItem(session,item,tracks){
 const ref=itemRef(item);session.ref=ref;
 if(item.kind==='dubbing')await playDubbingEdition(item.content_id,null,session);
 else await play(item.content_id,tracks,0,session);
}
async function startTypedPlaylist(pid,ref){
 const request=++typedPlaybackRequest,account=me?.id;
 const d=await api('/api/playlists/'+encodeURIComponent(pid),'GET',undefined,{fresh:true});
 if(request!==typedPlaybackRequest||account!==me?.id)return;
 const playable=d.items.filter(i=>i.available);
 const item=ref?playable.find(i=>itemKey(i)===itemKey(ref)):playable[0];
 if(!item)throw Error('현재 재생할 수 있는 콘텐츠가 없습니다.');
 const session=typedPlaylistPlayback={pid,account,ref:null};
 await playTypedItem(session,item,d.tracks);
 if(me&&typedPlaylistPlayback===session)void api('/api/playlists/'+encodeURIComponent(pid)+'/played','POST').catch(()=>{});
}
async function advanceTypedPlaylist(delta,automatic){
 const session=typedPlaylistPlayback,request=++typedPlaybackRequest;
 if(!session)return;
 if(session.account!==me?.id){clearTypedPlaylist();return;}
 let d;
 try{d=await api('/api/playlists/'+encodeURIComponent(session.pid),'GET',undefined,{fresh:true});}
 catch(error){if(request===typedPlaybackRequest)clearTypedPlaylist();throw error;}
 if(request!==typedPlaybackRequest||session!==typedPlaylistPlayback||session.account!==me?.id)return;
 const items=d.items.filter(i=>i.available);
 const index=items.findIndex(i=>itemKey(i)===itemKey(session.ref));
 if(!items.length||index<0){clearTypedPlaylist();return;}
 let next=index+delta;
 if(automatic&&repeatMode===2)next=index;
 else if(shuffle&&items.length>1)next=(index+1+Math.floor(Math.random()*(items.length-1)))%items.length;
 else if(automatic&&next>=items.length&&!repeatMode){clearTypedPlaylist();setPlayerVisible(false);return;}
 next=(next+items.length)%items.length;
 await playTypedItem(session,items[next],d.tracks);
}
document.addEventListener('click',event=>{
 const add=event.target.closest('[data-unified-add]');
 if(add){selectPlaylistForItem({kind:add.dataset.kind,content_id:add.dataset.unifiedAdd}).catch(error=>toast(error.message));return;}
 const button=event.target.closest('[data-unified-menu]');if(!button)return;
 const id=esc(button.dataset.unifiedMenu),owned=button.dataset.owned==='1',saved=button.dataset.saved==='1';
 dialog(`<h2>플레이리스트 옵션</h2><div class="dialog-list">${owned?`<button class="small-button" data-edit-playlist="${id}">편집</button><button class="small-button" data-delete-playlist="${id}">삭제</button>`:`${saved?`<button class="small-button" data-playlist-fork="${id}">내 플레이리스트로 편집</button>`:''}<button class="small-button" data-playlist-save="${id}" aria-pressed="${saved}">${saved?'저장 해제':'저장'}</button>`}</div>`);
});
