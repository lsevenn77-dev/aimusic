function myPageHeading(description){
 return '<div class="my-page-heading">'+heading('마이',description)+'<button type="button" class="small-button my-logout" data-quick-logout>로그아웃</button></div>';
}
// Artist fan pages only. Keep the shared table and its other consumers unchanged.
function artistMusicList(tracks){
 if(!tracks.length)return list(tracks);
 remember(tracks);
 return '<div class="artist-music-list" aria-label="공개한 음악">'+tracks.map((t,i)=>{
  const id=esc(t.id),title=esc(t.title),isLiked=liked(t.id);
  const credit=(name,pid,kind,cls)=>pid?'<a class="'+cls+'" href="#'+kind+'/'+esc(pid)+'" title="'+esc(name)+'">'+esc(name)+'</a>':'<span class="'+cls+'" title="'+esc(name)+'">'+esc(name)+'</span>';
  return '<article class="artist-music-row" data-list-row data-song-row="'+id+'"><span class="artist-music-position">'+(i+1)+'</span><a class="artist-music-cover" href="#song/'+id+'" aria-label="'+title+' 곡 정보">'+cover(t,'mini-cover')+'</a><div class="artist-music-info"><a class="artist-music-title" href="#song/'+id+'" title="'+title+'">'+title+'</a><div class="artist-music-credits">'+credit(t.artist,t.artist_id,'artist','artist-music-singer')+'<span class="artist-music-separator" aria-hidden="true">·</span>'+credit(t.producer,t.producer_id,'producer','artist-music-producer')+'</div></div><div class="list-actions artist-music-actions"><button type="button" class="list-action metric-inline '+(isLiked?'is-active':'')+'" data-like="'+id+'" aria-label="'+title+' 좋아요" aria-pressed="'+isLiked+'" title="좋아요">'+icon('ui-heart')+'<span class="artist-music-like-count" data-like-count>'+number(t.likes)+'</span></button><button type="button" class="list-action icon-button" data-play="'+id+'" aria-label="'+title+' 재생">'+icon('ui-play-action')+'</button><button type="button" class="list-action icon-button" data-track-menu="'+id+'" aria-label="'+title+' 더보기">'+icon('ui-menu-action')+'</button></div></article>';
 }).join('')+'</div>';
}
function artistPageHTML(d,aid,tab){return artistFanpageHTML(d,aid,tab);}

document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-gallery-photo],[data-gallery-add],[data-gallery-delete],[data-quick-logout]');if(!el)return;
 e.preventDefault();
 if(el.hasAttribute('data-quick-logout')){
  dialog('<p class="popup-prompt">로그아웃하시겠습니까?</p><div class="inline-actions"><button class="small-button" data-close-dialog>취소</button><button class="primary-button" id="confirm-logout">로그아웃</button></div>');
  $('#confirm-logout').onclick=async()=>{$('#dialog').close();await logoutAccount();};return;
 }
 if(el.dataset.galleryPhoto){if(el.closest('.artist-fanpage'))return;dialog('<h2>'+esc(el.dataset.photoLabel)+'</h2><img class="gallery-lightbox" src="'+esc(el.dataset.galleryPhoto)+'" alt="'+esc(el.dataset.photoLabel)+'">');return;}
 if(el.dataset.galleryAdd){
  const aid=el.dataset.galleryAdd,available=Math.max(0,20-Number(el.dataset.galleryCount||0));
  dialog('<h2>갤러리 사진 추가</h2><p>이 AI 가수의 갤러리에 공개됩니다.</p><form id="gallery-upload-form"><label class="form-field">사진 선택<input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" required></label><p class="field-help">JPG · PNG · WebP / 장당 5MB 이하 / 최대 20장</p><button type="submit" class="primary-button">사진 올리기</button><p class="gallery-upload-status" role="status"></p><p class="form-error" role="alert"></p></form>');
  const form=$('#gallery-upload-form');
  form.onsubmit=busyForm(form,async()=>{
   const files=[...form.elements.photos.files];if(files.length>available)throw new Error('추가할 수 있는 사진은 '+available+'장이에요.');
   const status=form.querySelector('.gallery-upload-status');
   for(let i=0;i<files.length;i++){
    status.textContent=(i+1)+' / '+files.length+' 사진 업로드 중';
    try{await uploadFile('/api/artists/'+encodeURIComponent(aid)+'/gallery',files[i],undefined,{preserveAspectRatio:true,allowFallback:true});}
    catch(error){
     // Successful earlier uploads must not be sent twice when the user retries.
     const remaining=new DataTransfer();files.slice(i).forEach(f=>remaining.items.add(f));form.elements.photos.files=remaining.files;
     status.textContent=i+'장 업로드 완료. 남은 사진을 다시 올려주세요.';throw error;
    }
   }
   $('#dialog').close();if(location.hash.startsWith('#artist/'+aid))await render();toast('갤러리에 사진을 추가했어요.');
  });return;
 }
 if(el.dataset.galleryDelete){
  const aid=el.dataset.galleryArtist,pid=el.dataset.galleryDelete;
  dialog('<p class="popup-prompt">이 사진을 삭제하시겠습니까?</p><p>AI 가수 갤러리에서 삭제되며 복구할 수 없습니다.</p><form id="gallery-delete-form"><div class="inline-actions"><button type="button" class="small-button" data-close-dialog>취소</button><button type="submit" class="primary-button">사진 삭제</button></div><p class="form-error" role="alert"></p></form>');
  const form=$('#gallery-delete-form');form.onsubmit=busyForm(form,async()=>{await api('/api/artists/'+aid+'/gallery/'+pid,'DELETE');$('#dialog').close();if(location.hash.startsWith('#artist/'+aid))await render();toast('사진을 삭제했어요.');});
 }
});

// Keep the picker inside the trusted button click: mobile browsers require user
// activation. Do not await a request, render, or timer before input.click().
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-artist-image-pick]');if(!button||button.disabled)return;
 const input=button.closest('.artist-image-editor')?.querySelector('[data-artist-image]');
 if(input&&!input.disabled)input.click();
});

document.addEventListener('change',async e=>{
 const input=e.target.closest('[data-artist-image]');if(!input||input.disabled)return;
 const file=input.files?.[0],aid=input.dataset.artistImage;if(!file)return;
 const button=input.closest('.artist-image-editor')?.querySelector('[data-artist-image-pick]');
 input.disabled=true;if(button)button.disabled=true;
 try{
  await uploadFile('/api/studio/artists/'+encodeURIComponent(aid)+'/image',file);
  if(location.hash.split('?')[0]==='#artist/'+aid)await render();
  toast('대표 이미지를 변경했어요.');
 }catch(error){toast(error.message||'사진을 변경하지 못했어요.');}
 finally{input.disabled=false;input.value='';if(button)button.disabled=false;}
});
