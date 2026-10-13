// Page composition only: player, chat and recording controllers keep their existing hooks.
function profileGalleryHTML(d,id){
 const own=!!me&&d.profile.user_id===me.id,photos=d.gallery||[],limit=d.gallery_limit||30;
 if(!own&&!photos.length)return '';
 return '<section class="profile-gallery-strip" aria-label="프로필 갤러리"><div class="section-heading"><div><span class="eyebrow">MY GALLERY</span><h2>나의 순간들 <small>'+photos.length+'</small></h2></div>'+(own?'<button type="button" class="small-button" data-profile-photo-add="'+esc(id)+'" '+(photos.length>=limit?'disabled':'')+'>'+icon('plus')+' 사진 추가</button>':'')+'</div>'+
 (photos.length?'<div class="profile-gallery-photos" tabindex="0" aria-label="갤러리 사진 · 좌우로 넘겨보세요">'+photos.map((p,i)=>'<figure><button type="button" class="profile-gallery-photo" data-gallery-photo="'+esc(p.url)+'" data-photo-label="'+esc(d.profile.display_name||d.profile.name)+' 사진 '+(i+1)+'" aria-label="사진 '+(i+1)+' 크게 보기"><img src="'+esc(p.url)+'" alt="'+esc(d.profile.display_name||d.profile.name)+' 갤러리 사진 '+(i+1)+'" loading="'+(i<4?'eager':'lazy')+'" decoding="async"></button>'+(own?'<button type="button" class="profile-photo-delete" data-profile-photo-delete="'+esc(p.id)+'" data-profile-photo-owner="'+esc(id)+'" aria-label="갤러리 사진 '+(i+1)+' 삭제">'+icon('trash')+'</button>':'')+'</figure>').join('')+'</div>':
 '<button type="button" class="profile-gallery-empty" data-profile-photo-add="'+esc(id)+'">'+icon('image')+'<strong>내 페이지에 사진을 채워보세요</strong><span>음악과 함께 나의 순간을 소개해요 · 사진 추가</span></button>')+
 (own?'<p class="field-help gallery-privacy-note">프로필을 방문한 누구나 볼 수 있는 공개 사진이에요. 최대 '+limit+'장 · 사진을 누르면 크게 볼 수 있어요.</p>':'')+'</section>';
}
function libraryOverviewHTML(){
 const collections=library.collections||library.playlists||[];
 return '<div class="library-overview"><section class="library-playlists-pane"><div class="section-heading"><h2>나의 플레이리스트</h2><a class="text-link" href="#library/playlists">모두 보기 '+icon('chevron')+'</a></div>'+collectionGrid(collections.slice(0,4),'아직 모아둔 플레이리스트가 없어요.')+'<div class="inline-actions"><button class="small-button" id="new-playlist">'+icon('plus')+' 새 플레이리스트</button><a class="text-link" href="#collections">공개 목록 둘러보기</a></div></section><section class="library-likes-pane"><div class="section-heading"><h2>좋아하는 음악</h2><span>'+number(library.likes.length)+'곡</span></div>'+browsePlaybackActions(library.likes)+'<button class="text-link" data-organize-likes '+(library.likes.length?'':'disabled')+'>선택해서 플레이리스트 만들기</button>'+list(library.likes)+'</section></div>';
}
function dmInboxHTML(d){
 return heading('메시지','음악으로 이어진 대화, 이곳에서 계속해요.')+'<section class="message-workspace"><aside class="message-list-pane"><div class="dm-section-heading"><div><span class="eyebrow">INBOX</span><h2>대화 <small>'+number(d.conversations.length)+'</small></h2></div>'+inboxControlsHTML()+'</div><div id="dm-conversations">'+conversationListHTML(d.conversations,d.crew)+'</div><p id="dm-list-error" role="status"></p></aside><div class="message-welcome"><span class="message-welcome-icon">'+icon('message')+'</span><span class="eyebrow">MUSIC BRINGS US TOGETHER</span><h2>좋은 음악 다음엔,<br>좋은 대화.</h2><p>목록에서 대화를 선택하거나<br>함께 듣고 싶은 사람에게 먼저 인사해보세요.</p><a class="primary-button" href="#following">'+icon('users')+' 팔로잉에서 대화 시작</a><div class="message-discover"><a href="#community">'+icon('compass')+' 새로운 목소리 만나기 '+icon('arrow')+'</a><a href="#profile">'+icon('user')+' 내 음악 페이지 '+icon('arrow')+'</a></div></div></section>';
}
function singingDiscoverHTML(duets){
 return '<section class="sing-discover" aria-label="커버곡 둘러보기"><div class="sing-discover-cards"><a class="sing-discover-card solo" href="#community/covers?mode=solo"><span class="sing-discover-symbol">'+icon('mic')+'</span><span class="eyebrow">YOUR VOICE, YOUR STAGE</span><h2>혼자서도 빛나는<br>나의 목소리</h2><p>솔로 커버곡 둘러보기 '+icon('arrow')+'</p></a><a class="sing-discover-card duet" href="#community/covers?mode=duet"><span class="sing-discover-symbol">'+icon('users')+'</span><span class="eyebrow">BETTER TOGETHER</span><h2>함께라서 새로운<br>우리의 하모니</h2><p>듀엣 커버곡 둘러보기 '+icon('arrow')+'</p></a></div><div class="sing-duet-preview"><div class="section-heading"><h3>함께 부를 목소리를 기다려요</h3><a class="text-link" href="#community/duets?open=1">듀엣 보기 '+icon('chevron')+'</a></div>'+ (duets.length?'<div class="sing-duet-row">'+duets.slice(0,3).map(t=>'<a href="'+(t.user_id===me?.id?'#song/'+esc(t.id):'#sing/'+esc(t.original_id)+'?duet='+esc(t.id))+'">'+cover(t,'mini-cover')+'<span><strong>'+esc(t.title)+'</strong><small>'+esc(t.producer)+(t.user_id===me?.id?' · 내 듀엣 보기':' · 듀엣 참여')+'</small></span>'+icon('plus')+'</a>').join('')+'</div>':'<p class="empty-inline">아직 참여를 기다리는 듀엣이 없어요. 부를 곡을 고르고 듀엣을 열어보세요.</p>')+'</div></section>';
}
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-profile-photo-add],[data-profile-photo-delete]');if(!button)return;e.preventDefault();
 if(button.dataset.profilePhotoAdd){
  const pid=button.dataset.profilePhotoAdd;
  dialog('<h2>마이 갤러리 사진 추가</h2><p>마이페이지 맨 위에 표시되며, 다른 사람에게도 공개됩니다.</p><form id="profile-gallery-upload"><label class="form-field">사진 선택<input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" required></label><p class="field-help">JPG · PNG · WebP / 장당 5MB 이하 / 최대 30장<br>WebP로 변환해 서버에 저장해요. 개인정보가 담긴 사진은 올리지 마세요.</p><button class="primary-button" type="submit">공개 사진 올리기</button><p class="gallery-upload-status" role="status"></p><p class="form-error" role="alert"></p></form>');
  const form=$('#profile-gallery-upload');
  form.onsubmit=busyForm(form,async()=>{
   const files=[...form.elements.photos.files],current=await api('/api/producers/'+encodeURIComponent(pid)+'/gallery'),available=current.limit-current.photos.length;
   if(!files.length)throw Error('사진을 선택해주세요.');
   if(files.length>available)throw Error('사진을 '+available+'장 더 올릴 수 있어요.');
   let done=0;
   try{for(const file of files){
    form.querySelector('.gallery-upload-status').textContent=(done+1)+' / '+files.length+' 사진 저장 중…';
    await uploadFile('/api/producers/'+encodeURIComponent(pid)+'/gallery',file);done++;
   }}catch(error){
    // Remove successful files from a partial retry; never upload them a second time.
    const remaining=new DataTransfer();files.slice(done).forEach(file=>remaining.items.add(file));form.elements.photos.files=remaining.files;
    form.querySelector('.gallery-upload-status').textContent=done+'장 저장됨. 남은 사진만 다시 시도해주세요.';
    if(done)await render();
    throw error;
   }
   $('#dialog').close();await render();toast('마이 갤러리에 사진을 추가했어요.');
  });
 }else{
  const pid=button.dataset.profilePhotoOwner,photo=button.dataset.profilePhotoDelete;
  dialog('<h2>갤러리 사진을 삭제할까요?</h2><p>이 사진은 마이페이지와 서버에서 삭제됩니다. 다시 올리려면 원본 사진이 필요해요.</p><form id="profile-gallery-delete"><div class="inline-actions"><button type="button" class="small-button" data-close-dialog>취소</button><button type="submit" class="primary-button">사진 삭제</button></div><p class="form-error" role="alert"></p></form>');
  const form=$('#profile-gallery-delete');form.onsubmit=busyForm(form,async()=>{await api('/api/producers/'+encodeURIComponent(pid)+'/gallery/'+encodeURIComponent(photo),'DELETE');$('#dialog').close();await render();toast('사진을 삭제했어요.');});
 }
});

