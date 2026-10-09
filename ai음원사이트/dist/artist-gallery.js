function myPageHeading(description){
 return '<div class="my-page-heading">'+heading('마이',description)+'<button type="button" class="small-button my-logout" data-quick-logout>로그아웃</button></div>';
}
function artistPageHTML(d,aid,tab){
 const gallery=tab==='gallery',photos=d.gallery||[],p=d.profile;
 return heading('AI 가수')+'<section class="profile-hero surface">'+portrait(p,'artist')+'<div><span class="eyebrow">AI ARTIST</span><h2>'+esc(p.name)+'</h2><p>'+esc(p.bio||'새로운 음악으로 만나요.')+'</p><div class="inline-actions"><span data-followers="artist/'+esc(aid)+'" data-count="'+Number(d.followers)+'">'+number(d.followers)+' 팔로워</span><button class="primary-button" data-follow="artist/'+esc(aid)+'">'+(followed('artist',aid)?'팔로잉':'팔로우')+'</button></div></div></section>'+
 '<nav class="profile-content-tabs" aria-label="AI 가수 콘텐츠"><a href="#artist/'+esc(aid)+'" '+(!gallery?'class="active" aria-current="page"':'')+'>음악 <span>'+d.tracks.length+'</span></a><a href="#artist/'+esc(aid)+'?tab=gallery" '+(gallery?'class="active" aria-current="page"':'')+'>갤러리 <span>'+photos.length+'</span></a></nav>'+
 (gallery?'<section class="artist-gallery" aria-label="'+esc(p.name)+' 갤러리"><div class="section-heading"><div><h2>갤러리</h2><p class="field-help">'+esc(p.name)+'의 다양한 모습을 만나보세요.</p></div>'+(d.can_manage?'<button class="small-button" data-gallery-add="'+esc(aid)+'" data-gallery-count="'+photos.length+'" '+(photos.length>=30?'disabled':'')+'>'+icon('plus')+' 사진 추가</button>':'')+'</div>'+
 (photos.length?'<div class="artist-photo-grid">'+photos.map((photo,i)=>'<figure><button class="artist-photo" data-gallery-photo="'+esc(photo.url)+'" data-photo-label="'+esc(p.name)+' 사진 '+(i+1)+'" aria-label="'+esc(p.name)+' 사진 '+(i+1)+' 크게 보기"><img src="'+esc(photo.url)+'" alt="'+esc(p.name)+' 사진 '+(i+1)+'" loading="lazy" decoding="async"></button>'+(d.can_manage?'<button class="gallery-delete" data-gallery-delete="'+esc(photo.id)+'" data-gallery-artist="'+esc(aid)+'" aria-label="사진 '+(i+1)+' 삭제">삭제</button>':'')+'</figure>').join('')+'</div>':'<div class="surface gallery-empty"><h3>아직 등록된 사진이 없어요</h3><p>'+ (d.can_manage?'사진 추가를 눌러 이 AI 가수의 첫 모습을 공유해보세요.':'새로운 사진이 올라오면 여기에서 볼 수 있어요.')+'</p></div>')+'</section>':section('공개한 음악')+list(d.tracks));
}
document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-gallery-photo],[data-gallery-add],[data-gallery-delete],[data-quick-logout]');if(!el)return;
 e.preventDefault();
 if(el.hasAttribute('data-quick-logout')){
  dialog('<h2>로그아웃할까요?</h2><p>이 기기에서 계정 연결이 해제돼요.</p><div class="inline-actions"><button class="small-button" data-close-dialog>취소</button><button class="primary-button" id="confirm-logout">로그아웃</button></div>');
  $('#confirm-logout').onclick=async()=>{$('#dialog').close();await logoutAccount();};return;
 }
 if(el.dataset.galleryPhoto){dialog('<h2>'+esc(el.dataset.photoLabel)+'</h2><img class="gallery-lightbox" src="'+esc(el.dataset.galleryPhoto)+'" alt="'+esc(el.dataset.photoLabel)+'">');return;}
 if(el.dataset.galleryAdd){
  const aid=el.dataset.galleryAdd,available=30-Number(el.dataset.galleryCount||0);
  dialog('<h2>갤러리 사진 추가</h2><p>이 AI 가수의 갤러리에 공개됩니다.</p><form id="gallery-upload-form"><label class="form-field">사진 선택<input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" required></label><p class="field-help">JPG · PNG · WebP / 장당 5MB 이하 / 최대 30장</p><button type="submit" class="primary-button">사진 올리기</button><p class="gallery-upload-status" role="status"></p><p class="form-error" role="alert"></p></form>');
  const form=$('#gallery-upload-form');
  form.onsubmit=busyForm(form,async()=>{
   const files=[...form.elements.photos.files];if(files.length>available)throw new Error('추가할 수 있는 사진은 '+available+'장이에요.');
   const status=form.querySelector('.gallery-upload-status');
   for(let i=0;i<files.length;i++){
    status.textContent=(i+1)+' / '+files.length+' 사진 업로드 중';
    try{await uploadFile('/api/artists/'+encodeURIComponent(aid)+'/gallery',files[i]);}
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
  dialog('<h2>이 사진을 삭제할까요?</h2><p>AI 가수 갤러리에서 제거됩니다.</p><form id="gallery-delete-form"><div class="inline-actions"><button type="button" class="small-button" data-close-dialog>취소</button><button type="submit" class="primary-button">사진 삭제</button></div><p class="form-error" role="alert"></p></form>');
  const form=$('#gallery-delete-form');form.onsubmit=busyForm(form,async()=>{await api('/api/artists/'+aid+'/gallery/'+pid,'DELETE');$('#dialog').close();if(location.hash.startsWith('#artist/'+aid))await render();toast('사진을 삭제했어요.');});
 }
});
