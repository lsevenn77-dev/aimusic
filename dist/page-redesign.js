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
function dmInboxHTML(d,thread='',selected=''){
 rememberDmInbox(d);
 return '<div class="message-page-heading">'+heading('메시지','음악으로 이어진 대화, 이곳에서 계속해요.')+'</div><section class="message-workspace'+(thread?' has-thread':'')+'"><aside class="message-list-pane" aria-label="대화 상대 목록">'+dmInboxTabsHTML()+'<div class="dm-section-heading"><div><span class="eyebrow">INBOX</span><h2>대화 <small id="dm-inbox-count">'+number(d.conversations.length)+'</small></h2></div>'+inboxControlsHTML()+'</div><div id="dm-conversations">'+conversationListHTML(d.conversations,d.crew,selected)+'</div><p id="dm-list-error" role="status">'+esc(d.error||'')+'</p></aside>'+(thread?'<div class="message-thread-pane" aria-label="선택한 대화">'+thread+'</div>':'<div class="message-welcome"><span class="message-welcome-icon">'+icon('message')+'</span><h2>누구와 이야기할까요?</h2><p>왼쪽에서 대화상대를 선택하면<br>이곳에서 바로 대화할 수 있어요.</p><a class="primary-button" href="#following">'+icon('users')+' 새로운 대화 시작</a></div>')+'</section>';
}
async function dmWorkspaceView(view){
 // The thread must not wait for a second inbox request. Refresh the sidebar after paint.
 const inbox=me?.id&&dmInboxSnapshot?.uid===me.id?dmInboxSnapshot.data:{conversations:[]};
 const selected=view.chat.crew?'crew/'+view.chat.crew.id:view.chat.peer.id;
 return {...view,html:dmInboxHTML(inbox,view.html,selected),inbox:true,refreshInbox:true,selectedConversation:selected};
}

function dmPendingView(base,param,raw){
 if(base!=='dm'||!me)return null;
 const main=$('#main'),aside=main?.querySelector('.message-list-pane');
 if(!aside||main.dataset.account!==me.id)return null;
 const selected=raw.split('?')[0].slice(3),copy=aside.cloneNode(true);
 copy.querySelectorAll('.is-selected').forEach(e=>e.classList.remove('is-selected'));
 copy.querySelectorAll('[aria-current]').forEach(e=>e.removeAttribute('aria-current'));
 for(const link of copy.querySelectorAll('a[href^="#dm/"]'))if(link.getAttribute('href')==='#dm/'+selected){link.setAttribute('aria-current','true');link.closest('.conversation-row')?.classList.add('is-selected');}
 return {html:'<div class="message-page-heading">'+heading('메시지','음악으로 이어진 대화, 이곳에서 계속해요.')+'</div><section class="message-workspace'+(param?' has-thread':'')+'">'+copy.outerHTML+'<div class="message-thread-pane message-thread-loading" role="status"><p>대화를 불러오는 중…</p></div></section>'};
}
function singingDiscoverHTML(duets,covers=[]){
 return '<section class="sing-cover-discovery" aria-label="커버곡 둘러보기"><header><div><h2>커버 둘러보기</h2><p>다른 사람의 솔로·듀엣 커버를 들어보세요.</p></div><nav><a href="#community/covers?mode=solo">'+icon('mic')+' 솔로 커버 듣기 '+icon('chevron')+'</a><a href="#community/covers?mode=duet">'+icon('users')+' 듀엣 커버 듣기 '+icon('chevron')+'</a><a href="#community/covers">더보기 '+icon('chevron')+'</a></nav></header>'+
 (covers.length?'<div class="sing-cover-shelf">'+covers.map(t=>'<article><a href="#song/'+esc(t.id)+'">'+cover(t)+'<strong>'+esc(t.title)+'</strong></a><a class="sing-cover-person" href="#producer/'+esc(t.producer_id)+'">'+esc(t.producer)+'</a><small>'+number(t.plays||0)+'회 감상</small><button class="icon-button" data-play="'+esc(t.id)+'" aria-label="'+esc(t.title)+' 커버 듣기">'+icon('play')+'</button></article>').join('')+'</div>':'<p class="empty-inline">아직 공개된 커버곡이 없어요. 첫 목소리를 들려주세요.</p>')+'</section><section class="sing-duet-preview compact-duet"><div class="section-heading"><div><h3>참여를 기다리는 듀엣</h3><p>누군가의 목소리가 당신을 기다리고 있어요.</p></div><a class="text-link" href="#community/duets?open=1">듀엣 보기 '+icon('chevron')+'</a></div>'+ (duets.length?'<div class="sing-duet-row">'+duets.slice(0,3).map(t=>'<a href="'+(t.user_id===me?.id?'#song/'+esc(t.id):'#sing/'+esc(t.original_id)+'?duet='+esc(t.id))+'">'+cover(t,'mini-cover')+'<span><strong>'+esc(t.title)+'</strong><small>'+esc(t.producer)+(t.user_id===me?.id?' · 내 듀엣 보기':' · 듀엣 참여')+'</small></span>'+icon('plus')+'</a>').join('')+'</div>':'<p class="empty-inline">아직 참여를 기다리는 듀엣이 없어요. 아래 곡을 골라 첫 파트를 남겨보세요.</p>')+'</section>';
}
function singingHeadingHTML(title,description){return '<div class="sing-page-heading">'+heading(title,description)+'<aside class="sing-title-banner" aria-label="나의 목소리로 다시"><strong>좋아하는 노래를<br>나의 목소리로, 다시.</strong><small>SING · TOGETHER · CREATE</small></aside></div>';}
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-profile-photo-add],[data-profile-photo-delete]');if(!button)return;e.preventDefault();
 if(button.dataset.profilePhotoAdd){
  const pid=button.dataset.profilePhotoAdd;
  dialog('<h2>마이 갤러리 사진 추가</h2><p>프로필 사진·아이디 아래에 표시되며, 다른 사람에게도 공개됩니다.</p><form id="profile-gallery-upload"><label class="form-field">사진 선택<input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" required></label><p class="field-help">JPG · PNG · WebP / 장당 5MB 이하 / 최대 30장<br>WebP로 변환해 서버에 저장해요. 개인정보가 담긴 사진은 올리지 마세요.</p><button class="primary-button" type="submit">공개 사진 올리기</button><p class="gallery-upload-status" role="status"></p><p class="form-error" role="alert"></p></form>');
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

