// Fanpage-only presentation and bindings; player, follow and gallery storage stay shared.
let artistFanData=null;
function fanLink(aid,tab){return '#artist/'+esc(aid)+(tab==='home'?'':'?tab='+tab);}
function fanPhotos(d){const photos=d.gallery||[],ids=d.fanpage?.carousel_ids||[];return ids.map(id=>photos.find(p=>p.id===id)).filter(Boolean).slice(0,10);}
function fanCarouselHTML(d){
 const photos=fanPhotos(d);if(!photos.length)return '';
 return '<section class="fan-carousel" aria-label="아티스트 포토카드" aria-roledescription="캐러셀" tabindex="0"><div class="fan-card-stage">'+photos.map((p,i)=>'<button type="button" class="fan-card" data-fan-photo="'+esc(p.id)+'" aria-label="사진 '+(i+1)+' 크게 보기"><img src="'+esc(p.url)+'" alt="'+esc(d.profile.name)+' 사진 '+(i+1)+'" decoding="async" '+(i>2?'loading="lazy"':'')+'></button>').join('')+'</div>'+(photos.length>1?'<div class="fan-carousel-controls"><button type="button" data-fan-prev aria-label="이전 포토카드">'+icon('chevron-left')+'</button><output data-fan-count>01 / '+String(photos.length).padStart(2,'0')+'</output><button type="button" data-fan-next aria-label="다음 포토카드">'+icon('chevron')+'</button><button type="button" data-fan-pause aria-label="자동 넘김 일시정지" aria-pressed="false">'+icon('player-pause')+'</button></div>':'')+'</section>';
}
function fanPostsHTML(posts,d,compact=false){
 if(!posts.length)return '<p class="fan-empty">아직 올라온 '+(compact?'글이':'게시물이')+' 없어요.</p>';
 const roots=posts.filter(p=>!p.parent_id),row=(p,reply=false)=>'<article class="fan-post'+(reply?' fan-reply':'')+'" data-fan-post="'+esc(p.id)+'"><header>'+(p.profile_id?'<a href="#producer/'+esc(p.profile_id)+'">'+esc(p.name)+'</a>':'<strong>'+esc(p.name)+'</strong>')+(p.official?'<span class="fan-official">공식</span>':'')+(p.pinned?'<span class="fan-pinned">고정</span>':'')+'<time datetime="'+new Date(p.created*1000).toISOString()+'">'+new Date(p.created*1000).toLocaleDateString('ko-KR')+'</time></header>'+(p.title?'<h3>'+esc(p.title)+'</h3>':'')+'<p>'+esc(p.body)+'</p>'+(!compact?'<div class="fan-post-actions"><button type="button" data-fan-action="like" aria-pressed="'+!!p.liked+'" aria-label="응원글 좋아요">'+icon('ui-heart')+' '+number(p.likes)+'</button>'+(!reply&&p.kind==='lounge'?'<button type="button" data-fan-action="reply">답글</button>':'')+(p.can_edit?'<button type="button" data-fan-action="edit">수정</button>':'')+(p.can_edit||d.can_manage?'<button type="button" data-fan-action="delete">삭제</button>':'')+(!p.reported?'<button type="button" data-fan-action="report">신고</button>':'<span>신고 접수됨</span>')+(d.can_manage&&!reply?'<button type="button" data-fan-action="pin">'+(p.pinned?'고정 해제':'상단 고정')+'</button>':'')+'</div>':'')+'</article>';
 return roots.slice(0,compact?3:300).map(p=>row(p)+(!compact?posts.filter(r=>r.parent_id===p.id).reverse().map(r=>row(r,true)).join(''):'')).join('');
}
function fanCompose(kind='lounge',post=null,parent=null){
 return '<form class="fan-compose" data-fan-compose="'+kind+'"'+(post?' data-edit="'+esc(post.id)+'"':'')+(parent?' data-parent="'+esc(parent)+'"':'')+'>'+(kind==='news'?'<label class="form-field">제목<input name="title" maxlength="160" required value="'+esc(post?.title||'')+'"></label>':'')+'<label class="form-field"><span>'+(parent?'답글':kind==='news'?'공식 소식':'응원 메시지')+'</span><textarea name="body" maxlength="'+(kind==='news'?8000:2000)+'" required placeholder="'+(kind==='news'?'발매 소식이나 근황을 전해주세요.':'아티스트에게 응원을 전해주세요.')+'">'+esc(post?.body||'')+'</textarea></label><button type="submit" class="primary-button">'+(post?'수정 저장':'등록')+'</button><p class="form-error" role="alert"></p></form>';
}
function artistFanpageHTML(d,aid,tab){
 artistFanData={...d,aid};tab=['home','music','gallery','lounge','news','profile'].includes(tab)?tab:'home';
 const p=d.profile,s=d.fanpage||{},photos=d.gallery||[],manage=d.can_manage;
 const more=(label,t)=>'<div class="section-heading"><h2>'+label+'</h2><a href="'+fanLink(aid,t)+'">더보기</a></div>';
 let html='<div class="artist-fanpage" data-fan-artist="'+esc(aid)+'"><header class="fan-header" style="--fan-dx:'+Number(s.desktop_x??50)+'%;--fan-dy:'+Number(s.desktop_y??50)+'%;--fan-mx:'+Number(s.mobile_x??50)+'%;--fan-my:'+Number(s.mobile_y??50)+'%">'+(s.banner_url?'<div class="fan-background" aria-hidden="true"><img src="'+esc(s.banner_url)+'" alt=""></div>':'')+'<div class="fan-header-main">'+((d.can_manage_portrait??manage)?'<div class="artist-image-editor">'+portrait(p,'artist')+'<button type="button" class="fan-text-button" data-artist-image-pick>대표 이미지 변경</button><input type="file" accept="image/jpeg,image/png,image/webp" data-artist-image="'+esc(aid)+'" aria-label="대표 이미지 사진 선택" hidden></div>':portrait(p,'artist'))+'<div class="fan-identity"><span class="eyebrow">AI ARTIST</span><h1>'+esc(p.name)+'</h1><p class="fan-intro" title="'+esc(s.intro||p.bio||'')+'">'+esc(s.intro||(p.bio||'').split('\n')[0]||'새로운 음악으로 만나요.')+'</p><div class="fan-stats"><span data-followers="artist/'+esc(aid)+'" data-count="'+Number(d.followers)+'">'+number(d.followers)+' 팔로워</span><span>공개곡 '+d.tracks.length+'</span></div>'+(d.producer?'<a class="fan-producer" href="#producer/'+esc(d.producer.id)+'">제작자 '+esc(d.producer.name)+'</a>':'')+'<div class="fan-header-actions"><button class="primary-button" data-follow="artist/'+esc(aid)+'">'+(followed('artist',aid)?'팔로잉':'팔로우')+'</button><button type="button" class="fan-text-button" data-share>공유</button>'+(manage?'<button type="button" class="fan-text-button" data-fan-settings aria-label="팬페이지 꾸미기"><span class="fan-settings-prefix">팬페이지 </span>꾸미기</button>':'')+'</div></div></div></header>'+fanCarouselHTML(d)+'<nav class="profile-content-tabs fan-tabs" aria-label="아티스트 카테고리">'+[['home','홈'],['music','음악'],['gallery','갤러리'],['lounge','팬라운지'],['news','소식'],['profile','프로필']].map(([k,label])=>'<a href="'+fanLink(aid,k)+'"'+(tab===k?' class="active" aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav><div class="fan-tab-content">';
 if(tab==='home'){
  html+=more('최신 음악','music')+artistMusicList(d.tracks.slice(0,3));
  const featured=[...d.tracks].sort((a,b)=>(b.likes||0)-(a.likes||0)).slice(0,3);
  if(featured.length)html+=more('대표 음악','music')+artistMusicList(featured);
  html+=more('최근 소식','news')+fanPostsHTML(d.news||[],d,true)+more('팬들의 응원','lounge')+fanPostsHTML(d.lounge||[],d,true);
 }else if(tab==='music')html+='<div class="fan-music-toolbar"><button class="small-button" data-play-all>전체듣기</button><button class="small-button" data-fan-shuffle>섞어듣기</button><label>정렬 <select data-fan-sort><option value="latest">최신순</option><option value="popular">좋아요순</option><option value="title">곡명순</option></select></label></div><div data-fan-music>'+artistMusicList(d.tracks)+'</div>';
 else if(tab==='gallery')html+='<section class="artist-gallery"><div class="section-heading"><h2>갤러리 <small>'+photos.length+'</small></h2>'+(manage?'<button class="small-button" data-gallery-add="'+esc(aid)+'" data-gallery-count="'+photos.length+'" '+(photos.length>=20?'disabled':'')+'>사진 추가</button><button class="fan-text-button" data-fan-gallery-manage>순서·캐러셀 편집</button>':'')+'</div>'+(photos.length?'<div class="artist-photo-grid">'+photos.map((photo,i)=>'<figure><button type="button" class="artist-photo" data-fan-photo="'+esc(photo.id)+'" aria-label="사진 '+(i+1)+' 크게 보기"><img src="'+esc(photo.url)+'" alt="'+esc(p.name)+' 사진 '+(i+1)+'" loading="lazy" decoding="async"></button>'+(manage?'<button class="gallery-delete" data-gallery-delete="'+esc(photo.id)+'" data-gallery-artist="'+esc(aid)+'" aria-label="사진 '+(i+1)+' 삭제">삭제</button>':'')+'</figure>').join('')+'</div>':'<p class="fan-empty">아직 등록된 사진이 없어요.</p>')+'</section>';
 else if(tab==='lounge')html+='<section aria-label="팬라운지">'+(typeof me!=='undefined'&&me?fanCompose():'<p class="fan-empty"><a href="#login">로그인</a> 후 응원을 남겨주세요.</p>')+fanPostsHTML(d.lounge||[],d)+'</section>';
 else if(tab==='news')html+='<section aria-label="공식 소식">'+(manage?'<button class="small-button" data-fan-news>소식 쓰기</button>':'')+fanPostsHTML(d.news||[],d)+'</section>';
 else html+='<section class="fan-profile"><h2>아티스트 소개</h2><p>'+esc(p.bio||'소개를 준비하고 있어요.')+'</p>'+(s.style?'<h2>음악 스타일과 콘셉트</h2><p>'+esc(s.style)+'</p>':'')+(s.world?'<h2>아티스트 세계관</h2><p>'+esc(s.world)+'</p>':'')+(d.producer?'<h2>소속 제작자</h2><a href="#producer/'+esc(d.producer.id)+'">'+esc(d.producer.name)+' 프로필</a>':'')+'</section>';
 return html+'</div></div>';
}
function fanBindCompose(form,post=null){
 const request=crypto.randomUUID();
 form.onsubmit=busyForm(form,async()=>{
  const data=artistFanData,body={kind:form.dataset.fanCompose,body:form.elements.body.value,title:form.elements.title?.value||'',request_id:request,parent_id:form.dataset.parent||null,...(post?{revision:post.revision}:{})};
  await api('/api/artists/'+data.aid+'/posts'+(post?'/'+post.id:''),post?'PATCH':'POST',body);
  if($('#dialog').open)$('#dialog').close();await render();toast(post?'수정했어요.':'등록했어요.');
 });
}
function bindArtistFanpage(){
 const root=document.querySelector('.artist-fanpage');if(!root)return;
 // Cached routes contain HTML only; hydrate current data through the ordinary API.
 const aid=root.dataset.fanArtist;
 if(!artistFanData||artistFanData.aid!==aid){void api('/api/artists/'+aid).then(d=>{if(root.isConnected){artistFanData={...d,aid};bindFanForms(root);}});}else bindFanForms(root);
 const bg=root.querySelector('.fan-background img');if(bg){if(bg.complete&&!bg.naturalWidth)bg.parentElement.remove();else bg.onerror=()=>bg.parentElement.remove();}
 const carousel=root.querySelector('.fan-carousel');if(!carousel)return;
 const cards=[...carousel.querySelectorAll('.fan-card')],n=cards.length;
 let index=0,timer=null,hover=false,focus=false,touch=false,manual=false,start=null,suppressUntil=0;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const paint=()=>{cards.forEach((card,i)=>{let delta=(i-index+n)%n;if(delta>n/2)delta-=n;const abs=Math.abs(delta);card.style.setProperty('--fan-offset',delta);card.style.setProperty('--fan-depth',abs);card.style.zIndex=String(10-abs);card.dataset.distance=String(abs);card.hidden=abs>4;card.tabIndex=abs>2?-1:0;card.setAttribute('aria-hidden',String(abs>4));});const out=carousel.querySelector('[data-fan-count]');if(out)out.textContent=String(index+1).padStart(2,'0')+' / '+String(n).padStart(2,'0');};
 const sync=()=>{clearInterval(timer);timer=null;if(n>1&&!hover&&!focus&&!touch&&!manual&&!document.hidden&&!reduced.matches)timer=setInterval(()=>move(1),5000);};
 const move=delta=>{index=(index+delta+n)%n;paint();sync();};
 const enter=()=>{hover=true;sync();},leave=()=>{hover=false;sync();},focusIn=()=>{focus=true;sync();},focusOut=e=>{focus=carousel.contains(e.relatedTarget);sync();};
 const down=e=>{if(e.pointerType==='mouse')return;touch=true;start={x:e.clientX,y:e.clientY};sync();};
 const up=e=>{if(start){const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dx)>36&&Math.abs(dx)>Math.abs(dy)*1.3){move(dx<0?1:-1);suppressUntil=Date.now()+500;}}touch=false;start=null;sync();};
 const click=e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopPropagation();suppress=false;return;}if(e.target.closest('[data-fan-prev]'))move(-1);if(e.target.closest('[data-fan-next]'))move(1);if(e.target.closest('[data-fan-pause]')){manual=!manual;const b=carousel.querySelector('[data-fan-pause]');b.setAttribute('aria-pressed',String(manual));b.setAttribute('aria-label',manual?'자동 넘김 시작':'자동 넘김 일시정지');b.innerHTML=icon(manual?'ui-play-action':'player-pause');}};
 const key=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}};
 const bindings=[[carousel,'mouseenter',enter],[carousel,'mouseleave',leave],[carousel,'focusin',focusIn],[carousel,'focusout',focusOut],[carousel,'pointerdown',down],[document,'pointerup',up],[document,'pointercancel',up],[carousel,'keydown',key],[document,'visibilitychange',sync],[reduced,'change',sync]];
 bindings.forEach(([el,event,fn])=>el.addEventListener(event,fn));carousel.addEventListener('click',click,true);paint();sync();
 registerRouteCleanup(()=>{clearInterval(timer);bindings.forEach(([el,event,fn])=>el.removeEventListener(event,fn));carousel.removeEventListener('click',click,true);});
}
function bindFanForms(root){root.querySelectorAll('[data-fan-compose]').forEach(f=>fanBindCompose(f));}
function fanLightbox(photoId){
 const d=artistFanData,photos=d.gallery||[];let index=Math.max(0,photos.findIndex(p=>p.id===photoId));if(!photos.length)return;
 dialog('<div class="fan-lightbox" tabindex="0"><img class="gallery-lightbox" alt=""><div class="fan-lightbox-controls"><button type="button" data-light-prev aria-label="이전 사진">'+icon('chevron-left')+'</button><output aria-live="polite"></output><button type="button" data-light-next aria-label="다음 사진">'+icon('chevron')+'</button></div></div>');
 const box=$('#dialog-content .fan-lightbox'),img=box.querySelector('img');
 const paint=()=>{img.src=photos[index].url;img.alt=d.profile.name+' 사진 '+(index+1);box.querySelector('output').textContent=(index+1)+' / '+photos.length;box.querySelectorAll('button').forEach(b=>b.disabled=photos.length<2);};
 const move=step=>{index=(index+step+photos.length)%photos.length;paint();};box.onclick=e=>{if(e.target.closest('[data-light-prev]'))move(-1);if(e.target.closest('[data-light-next]'))move(1);};box.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}};paint();box.focus();
}
async function fanSettingsDialog(){
 const d=artistFanData,s=d.fanpage||{},aid=d.aid;
 dialog('<h2>팬페이지 꾸미기</h2><form id="fan-settings-form"><label class="form-field">헤더 배경<input type="file" name="banner" accept="image/jpeg,image/png,image/webp"></label><p class="field-help">JPG · PNG · WebP / 5MB 이하 / 최대 8192×8192px</p><div class="fan-banner-preview"><img alt="배경 미리보기" '+(s.banner_url?'src="'+esc(s.banner_url)+'"':'hidden')+'></div><label><input type="checkbox" name="remove"> 배경 삭제</label><div class="fan-focus-fields">'+[['desktop','PC'],['mobile','모바일']].map(([k,label])=>'<fieldset><legend>'+label+' 초점</legend>'+['x','y'].map(axis=>'<label>'+axis.toUpperCase()+' <input type="range" min="0" max="100" name="'+k+'_'+axis+'" value="'+Number(s[k+'_'+axis]??50)+'"></label>').join('')+'</fieldset>').join('')+'</div><label class="form-field">한 줄 소개<input name="intro" maxlength="200" value="'+esc(s.intro||'')+'"></label><label class="form-field">음악 스타일과 콘셉트<textarea name="style" maxlength="4000">'+esc(s.style||'')+'</textarea></label><label class="form-field">세계관<textarea name="world" maxlength="8000">'+esc(s.world||'')+'</textarea></label><button class="primary-button">저장</button><p class="form-error" role="alert"></p></form>');
 const form=$('#fan-settings-form'),img=form.querySelector('img');let objectURL=null;const urls=[];
 const preview=()=>{const mode=form.dataset.previewMode||'desktop';img.style.objectPosition=form.elements[mode+'_x'].value+'% '+form.elements[mode+'_y'].value+'%';img.parentElement.style.aspectRatio=mode==='mobile'?'1.8':'4';};
 form.oninput=e=>{if(e.target.name?.startsWith('mobile'))form.dataset.previewMode='mobile';if(e.target.name?.startsWith('desktop'))form.dataset.previewMode='desktop';preview();};
 form.elements.banner.onchange=async()=>{const file=form.elements.banner.files[0];if(!file)return;try{await fanValidateImage(file);objectURL=URL.createObjectURL(file);urls.push(objectURL);img.src=objectURL;img.hidden=false;form.elements.remove.checked=false;preview();}catch(e){form.elements.banner.value='';toast(e.message);}};
 const cleanup=()=>urls.forEach(u=>URL.revokeObjectURL(u));$('#dialog').addEventListener('close',cleanup,{once:true});preview();
 form.onsubmit=busyForm(form,async()=>{
  let current=s;
  if(form.elements.remove.checked)current=(await api('/api/artists/'+aid+'/banner','DELETE')).settings;
  else if(form.elements.banner.files[0]){await fanValidateImage(form.elements.banner.files[0]);const file=form.elements.banner.files[0];current=(await fanUploadBanner(aid,file)).settings;}
  await api('/api/artists/'+aid+'/fanpage','PATCH',{revision:current.revision||0,intro:form.elements.intro.value,style:form.elements.style.value,world:form.elements.world.value,...Object.fromEntries(['desktop_x','desktop_y','mobile_x','mobile_y'].map(k=>[k,Number(form.elements[k].value)]))});
  $('#dialog').close();await render();toast('팬페이지를 저장했어요.');
 });
}
async function fanValidateImage(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG·PNG·WebP 이미지를 선택해주세요.');if(file.size>5*1024*1024)throw new Error('사진은 5MB 이하로 선택해주세요.');
 const image=await createImageBitmap(file);try{if(image.width<1||image.height<1||image.width>8192||image.height>8192||image.width*image.height>40000000)throw new Error('이미지는 최대 8192×8192px입니다.');}finally{image.close();}
}
function fanGalleryManager(){
 const d=artistFanData,s=d.fanpage||{},photos=[...d.gallery],selected=new Set(s.carousel_ids||[]);
 dialog('<h2>사진 순서·캐러셀</h2><p class="field-help">순서를 조정하고 캐러셀에 보여줄 사진을 최대 10장 선택하세요.</p><form id="fan-photo-order"><div data-fan-order></div><button class="primary-button">저장</button><p class="form-error" role="alert"></p></form>');
 const form=$('#fan-photo-order'),container=form.querySelector('[data-fan-order]');
 const paint=()=>{container.innerHTML=photos.map((p,i)=>'<div class="fan-order-row" data-order-id="'+esc(p.id)+'"><img src="'+esc(p.url)+'" alt="사진 '+(i+1)+'"><label><input type="checkbox" '+(selected.has(p.id)?'checked':'')+'> 캐러셀 '+(i+1)+'</label><button type="button" data-order-up aria-label="사진 '+(i+1)+' 앞으로" '+(!i?'disabled':'')+'>↑</button><button type="button" data-order-down aria-label="사진 '+(i+1)+' 뒤로" '+(i===photos.length-1?'disabled':'')+'>↓</button></div>').join('');};
 container.onchange=e=>{const row=e.target.closest('[data-order-id]');if(!row)return;if(e.target.checked){if(selected.size>=10){e.target.checked=false;toast('캐러셀은 최대 10장이에요.');return;}selected.add(row.dataset.orderId);}else selected.delete(row.dataset.orderId);};
 container.onclick=e=>{const b=e.target.closest('button'),row=b?.closest('[data-order-id]');if(!row)return;const i=photos.findIndex(p=>p.id===row.dataset.orderId),next=i+(b.hasAttribute('data-order-up')?-1:1);if(next<0||next>=photos.length)return;[photos[i],photos[next]]=[photos[next],photos[i]];paint();};paint();
 form.onsubmit=busyForm(form,async()=>{await api('/api/artists/'+d.aid+'/fanpage','PATCH',{revision:s.revision||0,photo_order:photos.map(p=>p.id),carousel_ids:photos.filter(p=>selected.has(p.id)).map(p=>p.id)});$('#dialog').close();await render();toast('사진 순서를 저장했어요.');});
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-fan-photo],[data-fan-settings],[data-fan-gallery-manage],[data-fan-news],[data-fan-action],[data-fan-shuffle]');if(!b||b.disabled)return;e.preventDefault();
 try{
  const d=artistFanData;if(!d)return;
  if(b.dataset.fanPhoto){fanLightbox(b.dataset.fanPhoto);return;}
  if(b.hasAttribute('data-fan-settings')){await fanSettingsDialog();return;}
  if(b.hasAttribute('data-fan-gallery-manage')){fanGalleryManager();return;}
  if(b.hasAttribute('data-fan-shuffle')){const tracks=[...d.tracks];for(let i=tracks.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tracks[i],tracks[j]]=[tracks[j],tracks[i]];}if(tracks.length)await play(tracks[0].id,tracks);return;}
  if(b.hasAttribute('data-fan-news')){dialog('<h2>공식 소식 쓰기</h2>'+fanCompose('news'));fanBindCompose($('#dialog-content form'));return;}
  if(typeof me==='undefined'||!me){toast('로그인 후 이용해주세요.');return;}
  const p=[...(d.news||[]),...(d.lounge||[])].find(p=>p.id===b.closest('[data-fan-post]')?.dataset.fanPost);if(!p)return;
  const action=b.dataset.fanAction,url='/api/artists/'+d.aid+'/posts/'+p.id;
  if(action==='edit'||action==='reply'){dialog('<h2>'+(action==='reply'?'응원에 답글':'게시물 수정')+'</h2>'+fanCompose(p.kind,action==='edit'?p:null,action==='reply'?p.id:null));fanBindCompose($('#dialog-content form'),action==='edit'?p:null);return;}
  if(action==='report'){dialog('<h2>게시물 신고</h2><form id="fan-report"><label class="form-field">신고 사유<textarea name="reason" maxlength="500" required></textarea></label><button class="primary-button">신고 접수</button><p class="form-error" role="alert"></p></form>');const form=$('#fan-report');form.onsubmit=busyForm(form,async()=>{await api(url+'/report','POST',{reason:form.elements.reason.value});$('#dialog').close();await render();toast('신고를 접수했어요.');});return;}
  if(action==='delete'){dialog('<h2>게시물을 삭제할까요?</h2><form id="fan-delete"><button class="primary-button">삭제</button><p class="form-error" role="alert"></p></form>');const form=$('#fan-delete');form.onsubmit=busyForm(form,async()=>{await api(url,'DELETE');$('#dialog').close();await render();});return;}
  b.disabled=true;
  if(action==='like')await api(url+'/like',p.liked?'DELETE':'PUT');
  if(action==='pin')await api(url+'/pin','PATCH',{pinned:!p.pinned});
  await render();
 }catch(error){toast(error.message);}finally{b.disabled=false;}
});
document.addEventListener('change',e=>{
 const sort=e.target.closest('[data-fan-sort]');if(!sort||!artistFanData)return;
 const tracks=[...artistFanData.tracks];if(sort.value==='title')tracks.sort((a,b)=>a.title.localeCompare(b.title,'ko'));if(sort.value==='popular')tracks.sort((a,b)=>(b.likes||0)-(a.likes||0));
 document.querySelector('[data-fan-music]').innerHTML=artistMusicList(tracks);routeTracks=tracks;icons();paintInteractions();
});

async function fanUploadBanner(aid,file){
 invalidateReads();
 try{const r=await fetch('/api/artists/'+encodeURIComponent(aid)+'/banner',{method:'PUT',credentials:'same-origin',headers:{'content-type':file.type},body:file});const data=await r.json();if(!r.ok)throw new Error(data.error||'배경을 저장하지 못했어요.');return data;}finally{invalidateReads();}
}
