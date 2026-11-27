function fanHeaderBackground(profile,settings,artistId){
 const media='/media/'+(settings.banner_version?'artist-banner/':'artist/')+encodeURIComponent(artistId)+'?v='+encodeURIComponent(settings.banner_version||profile.image_version||'');
 if(settings.banner_version)return '<div class="fan-header-background" aria-hidden="true"><img src="'+esc(media)+'" alt=""></div>';
 if(!profile.image_version)return '';
 return '<div class="fan-header-background fan-header-profile" aria-hidden="true"><img class="fan-background-blur" src="'+esc(media)+'" alt=""></div>';
}
function artistFanpageHTML(d,aid,tab='home'){
 const tabs=[['home','홈'],['music','음악'],['gallery','갤러리'],['lounge','팬라운지'],['news','소식'],['profile','프로필']];
 if(!tabs.some(t=>t[0]===tab))tab='home';
 const portraitOwner=d.can_manage&&d.can_edit_portrait!==false;
 const p=d.profile,photos=d.gallery||[],s=d.fanpage?.settings||{},producer=d.fanpage?.producer,href=t=>'#artist/'+esc(aid)+'?tab='+t;
 const more=(title,t,body)=>'<section class="fan-section"><div class="section-heading"><h2>'+title+'</h2><a href="'+href(t)+'">더보기</a></div>'+body+'</section>';
 const stream=kind=>'<div data-fan-feed="'+kind+'" role="region" aria-label="'+(kind==='news'?'공식 소식':'팬 응원글')+'"><p role="status">불러오는 중…</p></div>';
 const gallery='<section class="fan-section"><div class="section-heading"><h2>총 '+photos.length+'장</h2>'+(d.can_manage?'<div class="inline-actions"><button class="fan-icon" data-fan-photo-manage title="사진 관리" aria-label="사진 관리">'+icon('settings',20)+'</button><button class="fan-icon fan-photo-add" data-gallery-add="'+esc(aid)+'" data-gallery-count="'+photos.length+'" title="사진 추가" aria-label="사진 추가" '+(photos.length>=20?'disabled':'')+'>'+icon('image',20)+icon('plus',12)+'</button></div>':'')+'</div>'+(photos.length?'<div class="artist-photo-grid">'+photos.map((photo,i)=>'<figure><button class="artist-photo" data-fan-photo="'+i+'" aria-label="사진 '+(i+1)+' 크게 보기"><img src="'+esc(photo.url)+'" alt="'+esc(p.name)+' 사진 '+(i+1)+'" loading="lazy" decoding="async"></button><button class="fan-photo-like" data-photo-like="'+esc(photo.id)+'" aria-label="사진 '+(i+1)+' 좋아요" aria-pressed="'+!!photo.liked_by_me+'">'+icon('ui-heart',16)+'<span data-photo-like-count>'+number(photo.like_count||0)+'</span></button>'+(d.can_manage?'<button class="gallery-delete" data-gallery-delete="'+esc(photo.id)+'" data-gallery-artist="'+esc(aid)+'" aria-label="사진 삭제" title="사진 삭제">'+icon('trash',16)+'</button>':'')+'</figure>').join('')+'</div>':'<p class="fan-empty">아직 등록된 사진이 없습니다.</p>')+'</section>';
 const cards=photos.map((photo,i)=>({...photo,index:i})).filter(photo=>photo.carousel!==false).slice(0,10);
 const carousel=cards.length?'<section class="fan-carousel" aria-label="아티스트 포토카드" aria-roledescription="캐러셀" data-fan-carousel data-card-count="'+cards.length+'"><div class="fan-card-stage">'+cards.map((photo,i)=>'<button class="fan-photocard" data-fan-photo="'+photo.index+'" data-card-index="'+i+'" aria-label="사진 '+(photo.index+1)+' 크게 보기"><span class="fan-card-float"><img draggable="false" src="'+esc(photo.url)+'" alt="'+esc(p.name)+' 포토카드 '+(i+1)+'" decoding="async"><span class="fan-card-reflection" aria-hidden="true"><img draggable="false" src="'+esc(photo.url)+'" alt=""></span></span></button>').join('')+'</div>'+(cards.length>1?'<button class="fan-carousel-arrow fan-carousel-prev" data-fan-prev aria-label="이전 포토카드">'+icon('chevron-left',22)+'</button><button class="fan-carousel-arrow fan-carousel-next" data-fan-next aria-label="다음 포토카드">'+icon('arrow',22)+'</button><div class="fan-carousel-controls"><button data-fan-pause aria-label="포토카드 자동 넘김 일시정지" aria-pressed="false">'+icon('pause',16)+'</button><div class="fan-carousel-dots" aria-label="포토카드 선택">'+cards.map((photo,i)=>'<button data-fan-dot="'+i+'" aria-label="포토카드 '+(i+1)+'" aria-pressed="'+(i===0)+'"></button>').join('')+'</div></div>':'')+'<span class="sr-only" data-fan-counter>01 / '+String(cards.length).padStart(2,'0')+'</span></section>':'';
 let content='';
 if(tab==='gallery')content=gallery;
 if(tab==='music')content='<div class="fan-music-tools"><button class="small-button" data-play-all>전체듣기</button><button class="small-button" data-fan-shuffle>섞어듣기</button><select data-dropdown="md" data-fan-sort aria-label="음악 정렬"><option value="recent">최신순</option><option value="plays">인기순</option><option value="likes">좋아요순</option></select></div><div data-fan-music>'+artistMusicList(d.tracks)+'</div>';
 if(tab==='lounge'||tab==='news')content='<section class="fan-section"><div class="section-heading">'+(tab==='news'?'<h2>공식 소식</h2>':'<p class="fan-lounge-prompt">응원의 한마디를 남겨 보세요.</p>')+''+((tab==='lounge'||d.can_manage)?'<button class="small-button" data-fan-compose="'+tab+'">'+(tab==='news'?'소식 쓰기':'응원글 쓰기')+'</button>':'')+'</div>'+stream(tab)+'</section>';
 if(tab==='profile')content='<section class="fan-profile">'+[['상세 소개',s.introduction||p.bio],['음악 스타일과 콘셉트',s.concept],['세계관',s.world]].map(([title,text])=>'<section><h2>'+title+'</h2><p>'+esc(text||'아직 등록된 소개가 없습니다.')+'</p></section>').join('')+(producer?'<section><h2>소속 제작자</h2><a href="#producer/'+esc(producer.id)+'">'+userNickname(producer.name,{profileId:producer.id})+'</a></section>':'')+(d.fanpage?.operators?.length?'<section><h2>공식 운영자</h2>'+d.fanpage.operators.map(o=>'<p><a href="#producer/'+esc(o.id)+'">'+userNickname(o.name,{profileId:o.id})+'</a></p>').join('')+'</section>':'')+(d.can_manage?'<button class="small-button" data-fan-settings>프로필 편집</button>':'')+(portraitOwner?'<button class="small-button" data-fan-operators>공식 운영자 관리</button>':'')+'</section>';
 if(tab==='home')content='<div class="fan-home-columns"><div class="fan-home-music">'+more('최신 음악','music',artistMusicList(d.tracks.slice(0,3)))+'</div><div class="fan-home-updates">'+more('최근 공식 소식','news',stream('news'))+more('최신 팬 응원글','lounge',stream('lounge'))+'</div></div>';
 const headerActions='<div class="fan-header-actions"><button class="fan-icon" data-share aria-label="팬페이지 공유">'+icon('share',20)+'</button>'+(d.can_manage?'<div class="fan-settings-anchor"><button class="fan-icon" data-fan-menu-toggle aria-label="아티스트 설정" aria-expanded="false" aria-controls="fan-header-menu">'+icon('settings',20)+'</button><div class="fan-settings-menu" id="fan-header-menu" aria-label="아티스트 관리" hidden><div class="artist-image-editor"><button type="button" data-artist-image-pick '+(!portraitOwner?'disabled title="대표 이미지는 제작자만 변경할 수 있습니다"':'')+'>대표 이미지 변경</button>'+(portraitOwner?'<input type="file" accept="image/jpeg,image/png,image/webp" data-artist-image="'+esc(aid)+'" aria-label="대표 이미지 사진 선택" hidden>':'')+'</div><button type="button" data-fan-banner>배경 이미지 변경</button><a href="'+href('gallery')+'">갤러리 관리</a></div></div>':'')+'</div>';
 const intro=(p.bio||'').trim()||'새로운 음악으로 만나 뵙겠습니다.';
 const stats='<div class="fan-stats"><span class="fan-stats-group">'+
  '<span>공개곡 '+number(d.tracks.length)+'</span><span aria-hidden="true">·</span>'+
  '<a href="#artist-followers/'+encodeURIComponent(aid)+'" data-followers="artist/'+esc(aid)+'" data-count="'+Number(d.followers||0)+'">팔로워 <span data-follow-count>'+number(d.followers||0)+'</span></a></span>'+
  '<span class="fan-stats-divider" aria-hidden="true">·</span>'+
  '<button type="button" class="primary-button fan-follow-button" data-follow-presentation="profile" data-follow="artist/'+esc(aid)+'" aria-pressed="'+followed('artist',aid)+'"><span data-follow-label>'+ (followed('artist',aid)?'팔로우중':'팔로우') +'</span></button></div>';
 return '<article class="artist-fanpage" data-fanpage="'+esc(JSON.stringify({aid,tab,photos,settings:s,can_manage:!!d.can_manage,is_owner:!!portraitOwner,operators:d.fanpage?.operators||[],tracks:d.tracks}))+'"><div class="fan-hero-shell" style="--fan-focus:'+Number(s.focus_x??50)+'% '+Number(s.focus_y??50)+'%;--fan-mobile-focus:'+Number(s.mobile_x??50)+'% '+Number(s.mobile_y??50)+'%">'+fanHeaderBackground(p,s,aid)+'<header class="fan-header">'+headerActions+'<div class="fan-identity"><div class="fan-photo-follow">'+portrait(p,'artist')+'</div><div class="fan-identity-text"><h1><span data-profile-preview="artist:'+esc(aid)+'" role="button" tabindex="0" aria-haspopup="dialog">'+esc(p.name)+'</span></h1><div class="fan-bio-summary"><p class="fan-bio" id="fan-artist-bio" data-fan-bio data-expanded="false">'+esc(intro)+'</p><button type="button" class="fan-bio-toggle" data-fan-bio-toggle aria-controls="fan-artist-bio" aria-expanded="false" hidden>+더보기</button></div>'+(producer?'<a class="fan-affiliation" href="#producer/'+esc(producer.id)+'">소속 '+esc(producer.name)+'</a>':'')+stats+'</div></div></header>'+carousel+'</div><nav class="profile-content-tabs fan-tabs aifect-main-tabs" aria-label="아티스트 카테고리">'+tabs.map(([key,title],index)=>'<a href="'+href(key)+'" data-tab-tone="'+['pink','mint','purple'][index%3]+'" '+(tab===key?'class="active" aria-current="page"':'')+'>'+title+'</a>').join('')+'</nav><div class="fan-content">'+content+'</div></article>';
}

let artistFanpageCleanup=null;
function bindArtistFanpage(){
 artistFanpageCleanup?.();artistFanpageCleanup=null;
 const root=document.querySelector('[data-fanpage]');if(!root)return;
 const d=JSON.parse(root.dataset.fanpage),base='/api/artists/'+encodeURIComponent(d.aid)+'/fanpage',controller=new AbortController(),signal=controller.signal;
 artistFanpageCleanup=registerRouteCleanup(()=>controller.abort());
 const on=(el,event,fn,options={})=>el?.addEventListener(event,fn,{...options,signal});
 const bio=root.querySelector('[data-fan-bio]'),bioToggle=root.querySelector('[data-fan-bio-toggle]');
 if(bio&&bioToggle){
  let expanded=false,lastWidth=-1;
  const paintBio=()=>{
   bio.dataset.expanded=String(expanded);
   bioToggle.setAttribute('aria-expanded',String(expanded));
   bioToggle.textContent=expanded?'접기':'+더보기';
  };
  const measureBio=()=>{
   if(signal.aborted||!root.isConnected)return;
   // Measure the actual two-line layout, including explicit line breaks.
   bio.dataset.expanded='false';
   const overflow=bio.scrollHeight>bio.clientHeight+1;
   if(!overflow)expanded=false;
   bioToggle.hidden=!overflow;
   paintBio();
  };
  on(bioToggle,'click',()=>{expanded=!expanded;paintBio();});
  measureBio();
  if(typeof ResizeObserver!=='undefined'){
   const observer=new ResizeObserver(()=>{
    if(bio.clientWidth===lastWidth)return;
    lastWidth=bio.clientWidth;measureBio();
   });
   observer.observe(bio);
   signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
  }else on(document.defaultView,'resize',measureBio);
  document.fonts?.ready.then(measureBio);
  on(document.fonts,'loadingdone',measureBio);
 }
 const menu=root.querySelector('[id="fan-header-menu"]'),menuToggle=root.querySelector('[data-fan-menu-toggle]');
 const closeMenu=(restore=false)=>{if(!menu)return;menu.hidden=true;menuToggle.setAttribute('aria-expanded','false');if(restore)menuToggle.focus();};
 on(menuToggle,'click',()=>{menu.hidden=!menu.hidden;menuToggle.setAttribute('aria-expanded',String(!menu.hidden));});
 on(document,'click',e=>{if(menu&&!menu.hidden&&!menu.contains(e.target)&&!menuToggle.contains(e.target))closeMenu();});
 on(document,'keydown',e=>{if(e.key==='Escape'&&menu&&!menu.hidden){e.preventDefault();closeMenu(true);}});
 // Keep file selection inside the existing trusted document click handler.
 on(menu,'click',e=>{if(e.target.closest('button:not(:disabled),a'))queueMicrotask(()=>closeMenu());});
 const header=root.querySelector('.fan-hero-shell'),pageWrap=root.closest?.('.page-wrap');
 const tabs=root.querySelector('.fan-tabs'),active=tabs?.querySelector('[aria-current="page"]');
 const revealTab=()=>{
  if(!active||tabs.scrollWidth<=tabs.clientWidth)return;
  const tab=active.getBoundingClientRect(),view=tabs.getBoundingClientRect();
  const offset=tab.left<view.left?tab.left-view.left:Math.max(0,tab.right-view.right);
  if(offset)tabs.scrollBy({left:offset,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 };
 if(tabs&&typeof ResizeObserver!=='undefined'){
  const observer=new ResizeObserver(revealTab);
  observer.observe(tabs);
  signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
 }else if(tabs){
  requestAnimationFrame(revealTab);
  on(document.defaultView,'resize',revealTab);
 }
 const fitHeader=()=>{
  if(!header||!pageWrap)return;
  const hero=header.getBoundingClientRect(),area=pageWrap.getBoundingClientRect();
  header.style.setProperty('--fan-bleed-left',Math.max(0,hero.left-area.left)+'px');
  header.style.setProperty('--fan-bleed-right',Math.max(0,area.right-hero.right)+'px');
 };
 fitHeader();
 if(typeof ResizeObserver!=='undefined'){
  const observer=new ResizeObserver(fitHeader);
  for(const el of [root,pageWrap])if(el)observer.observe(el);
  signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
 }else on(document.defaultView,'resize',fitHeader);
 const read=async(path,method='GET',body)=>{const result=await api(base+path,method,body,method==='GET'?{signal}:{});if(signal.aborted||!root.isConnected)throw new DOMException('화면이 변경되었습니다.','AbortError');return result;};
 const refresh=async()=>{if(root.isConnected)await render();};
 const settings=()=>({...d.settings,focus_x:d.settings.focus_x??50,focus_y:d.settings.focus_y??50,mobile_x:d.settings.mobile_x??50,mobile_y:d.settings.mobile_y??50});
 root.querySelector('.fan-header-background img')?.addEventListener('error',e=>e.target.closest('.fan-header-background').remove(),{once:true,signal});
 const carousel=root.querySelector('[data-fan-carousel]'),stage=root.querySelector('.fan-card-stage'),cards=[...root.querySelectorAll('[data-card-index]')],reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let currentIndex=0,paused=false,hover=false,touch=false,focus=false,timer,movingUntil=0,gesture=null,suppressClickUntil=0;
 const transitions=new Set();
 const cancelTransitions=()=>{for(const animation of transitions)animation.cancel();transitions.clear();movingUntil=0;};
 const paint=(dragX=0)=>{
  const width=carousel?.clientWidth||600,g=typeof homeFloatGeometry==='function'?homeFloatGeometry(width,cards.length,Math.min(width<540?156:300,width*(width<540?.46:.28))):null;
  if(g)carousel.style.setProperty('--fan-card-size',g.size+'px');
  cards.forEach((card,i)=>{
   let offset=(i-currentIndex+cards.length)%cards.length;if(offset>cards.length/2)offset-=cards.length;
   const previous=Number(card.dataset.offset),wrap=card.hasAttribute('data-offset')&&Math.abs(previous-offset)>cards.length/2;
   const from=getComputedStyle(card),previousPose={transform:dragX?'translateX('+dragX+'px) '+(from.transform==='none'?'':from.transform):from.transform,opacity:from.opacity,filter:from.filter};
   card.dataset.offset=offset;
   if(g){
    card.style.transform=homeFloatPose(offset,g);card.style.opacity=String(Math.abs(offset)>g.radius?0:[1,.88,.60,.30,0][Math.min(4,Math.abs(offset))]);
    card.style.filter='brightness('+[1,.78,.60,.44,.25][Math.min(4,Math.abs(offset))]+') blur('+[0,.2,.7,1.3,2][Math.min(4,Math.abs(offset))]+'px)';
    card.setAttribute('aria-hidden',String(Math.abs(offset)>g.radius));card.style.pointerEvents=Math.abs(offset)>g.radius?'none':'';card.tabIndex=Math.abs(offset)>g.radius?-1:0;
   }
   card.style.zIndex=String(20-Math.abs(offset));card.setAttribute('aria-current',String(offset===0));
   if(card.hasAttribute('data-motion-ready')&&!reduced.matches){
    const computed=getComputedStyle(card),to={transform:computed.transform,opacity:computed.opacity,filter:computed.filter};
    const direction=previous<offset?1:-1;
    // Fade out at the edge, recycle invisibly, then enter from the other edge.
    const frames=wrap?[previousPose,{transform:previousPose.transform+` translateX(${-direction*40}px)`,opacity:0,offset:.45},{transform:to.transform+` translateX(${direction*40}px)`,opacity:0,offset:.55},to]:[previousPose,to];
    const animation=card.animate(frames,{duration:750,easing:'cubic-bezier(0.22, 1, 0.36, 1)'});
    transitions.add(animation);animation.onfinish=animation.oncancel=()=>transitions.delete(animation);
   }
   card.setAttribute('data-motion-ready','true');
  });
  root.querySelectorAll('[data-fan-dot]').forEach(dot=>dot.setAttribute('aria-pressed',String(Number(dot.dataset.fanDot)===currentIndex)));
  const count=root.querySelector('[data-fan-counter]');if(count)count.textContent=String(currentIndex+1).padStart(2,'0')+' / '+String(cards.length).padStart(2,'0');
 };
 const move=(delta,dragX=0)=>{if(cards.length<2||transitions.size||performance.now()<movingUntil)return;movingUntil=performance.now()+(reduced.matches?0:750);currentIndex=(currentIndex+delta+cards.length)%cards.length;paint(dragX);};
 const schedule=()=>{
  clearTimeout(timer);const stopped=signal.aborted||paused||hover||touch||focus||document.hidden;
  if(carousel)carousel.dataset.motionPaused=String(stopped);
  for(const animation of transitions){if(reduced.matches)animation.finish();else if(document.hidden)animation.pause();else animation.play();}
  if(!stopped&&cards.length>1&&!reduced.matches)timer=setTimeout(()=>{timer=null;if(!root.isConnected)return controller.abort();move(1);schedule();},7000);
 };
 if(carousel){
  const finishDrag=(event,cancelled=false)=>{
   if(!gesture||(event&&event.pointerId!==gesture.pointerId))return;
   const drag=gesture;gesture=null;touch=false;
   const dx=event&&Number.isFinite(event.clientX)?event.clientX-drag.x:drag.dx,dy=event&&Number.isFinite(event.clientY)?event.clientY-drag.y:drag.dy;
   const horizontal=drag.axis==='x'||(!drag.axis&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy));
   carousel.classList.remove('is-dragging');
   if(stage)stage.style.transform='';
   if(carousel.hasPointerCapture?.(drag.pointerId))carousel.releasePointerCapture(drag.pointerId);
   if(horizontal){
    suppressClickUntil=Date.now()+500;
    cancelTransitions();
    if(!cancelled&&Math.abs(dx)>40)move(dx<0?1:-1,drag.visualX);
    else{movingUntil=performance.now()+(reduced.matches?0:750);paint(drag.visualX);}
   }
   schedule();
  };
  paint();schedule();
  if(typeof ResizeObserver!=='undefined'){
   const sizeObserver=new ResizeObserver(()=>{finishDrag(null,true);cancelTransitions();cards.forEach(c=>c.removeAttribute('data-motion-ready'));paint();});
   sizeObserver.observe(carousel);signal.addEventListener('abort',()=>sizeObserver.disconnect(),{once:true});
  }
  root.querySelectorAll('[data-fan-dot]').forEach(dot=>on(dot,'click',()=>{move(Number(dot.dataset.fanDot)-currentIndex);schedule();}));
  on(carousel,'pointerenter',e=>{if(e.pointerType==='mouse'){hover=true;schedule();}});
  on(carousel,'pointerleave',()=>{hover=false;schedule();});
  on(carousel,'focusin',()=>{focus=true;schedule();});
  on(carousel,'focusout',()=>{queueMicrotask(()=>{focus=carousel.contains(document.activeElement);schedule();});});
  on(document,'visibilitychange',()=>{if(document.hidden)finishDrag(null,true);schedule();});
  on(reduced,'change',schedule);
  signal.addEventListener('abort',()=>{gesture=null;touch=false;clearTimeout(timer);cancelTransitions();if(stage)stage.style.transform='';carousel.classList.remove('is-dragging');},{once:true});
  on(root.querySelector('[data-fan-prev]'),'click',()=>{move(-1);schedule();});on(root.querySelector('[data-fan-next]'),'click',()=>{move(1);schedule();});
  on(root.querySelector('[data-fan-pause]'),'click',e=>{paused=!paused;e.currentTarget.setAttribute('aria-pressed',String(paused));e.currentTarget.innerHTML=icon(paused?'play':'pause',16);e.currentTarget.setAttribute('aria-label',paused?'포토카드 자동 넘김 시작':'포토카드 자동 넘김 일시정지');schedule();});
  on(carousel,'keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);schedule();}});
  on(carousel,'pointerdown',e=>{
   if(cards.length<2||gesture||e.isPrimary===false||e.button>0||!stage?.contains(e.target))return;
   gesture={pointerId:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,visualX:0,axis:''};touch=true;schedule();
  });
  on(carousel,'pointermove',e=>{
   if(!gesture||e.pointerId!==gesture.pointerId)return;
   const drag=gesture;drag.dx=e.clientX-drag.x;drag.dy=e.clientY-drag.y;
   if(!drag.axis){
    if(Math.max(Math.abs(drag.dx),Math.abs(drag.dy))<=8)return;
    if(Math.abs(drag.dy)>=Math.abs(drag.dx)){drag.axis='y';finishDrag(e,true);return;}
    drag.axis='x';cancelTransitions();carousel.classList.add('is-dragging');
    // Capture only after a horizontal gesture so ordinary taps and page scrolling remain native.
    try{carousel.setPointerCapture?.(e.pointerId);}catch{/* The pointer may already have been cancelled by the browser. */}
   }
   if(e.cancelable)e.preventDefault();
   const limit=(carousel.clientWidth||600)*.5;
   drag.visualX=Math.max(-limit,Math.min(limit,drag.dx));
   stage.style.transform='translateX('+drag.visualX+'px)';
  });
  on(document,'pointerup',e=>finishDrag(e));
  on(document,'pointercancel',e=>finishDrag(e,true));
  on(carousel,'lostpointercapture',e=>{if(e.target===carousel)finishDrag(e,true);});
  on(document.defaultView,'blur',()=>{hover=false;finishDrag(null,true);});
  on(carousel,'dragstart',e=>{if(stage?.contains(e.target))e.preventDefault();});
  on(carousel,'click',e=>{if(e.detail!==0&&Date.now()<suppressClickUntil){e.preventDefault();e.stopPropagation();}},{capture:true});
 }
 let lightboxOpen=false,previousPaused=false;
 const openPhoto=index=>{
  if(!d.photos.length)return;index=(index+d.photos.length)%d.photos.length;
  if(!lightboxOpen){previousPaused=paused;paused=true;schedule();dialog('<div class="fan-lightbox"><h2>포토카드</h2><img class="gallery-lightbox" alt=""><div class="inline-actions"><button class="small-button" data-light-prev aria-label="이전 사진">이전</button><span data-light-count></span><button class="small-button" data-light-next aria-label="다음 사진">다음</button></div></div>');lightboxOpen=true;const box=$('#dialog');box.addEventListener('close',()=>{lightboxOpen=false;paused=previousPaused;schedule();},{once:true});box.querySelector('[data-light-prev]').onclick=()=>openPhoto(Number(box.dataset.photoIndex)-1);box.querySelector('[data-light-next]').onclick=()=>openPhoto(Number(box.dataset.photoIndex)+1);const keys=e=>{if(e.key==='ArrowLeft')openPhoto(Number(box.dataset.photoIndex)-1);if(e.key==='ArrowRight')openPhoto(Number(box.dataset.photoIndex)+1);};box.addEventListener('keydown',keys,{signal});let swipe=null;box.querySelector('.gallery-lightbox').addEventListener('pointerdown',e=>{swipe={x:e.clientX,y:e.clientY};},{signal});box.addEventListener('pointerup',e=>{if(swipe&&Math.abs(e.clientX-swipe.x)>40&&Math.abs(e.clientX-swipe.x)>Math.abs(e.clientY-swipe.y))openPhoto(Number(box.dataset.photoIndex)+(e.clientX<swipe.x?1:-1));swipe=null;},{signal});}
  const box=$('#dialog');box.dataset.photoIndex=index;const img=box.querySelector('.gallery-lightbox');img.src=d.photos[index].url;img.alt='사진 '+(index+1);box.querySelector('[data-light-count]').textContent=(index+1)+' / '+d.photos.length;
 };
 root.querySelectorAll('[data-fan-photo]').forEach(el=>on(el,'click',()=>openPhoto(Number(el.dataset.fanPhoto))));
 // Mutations are serialized per photo; only server counts become durable state.
 const pendingLikes=new Set();let photoRead=0;
 const paintPhotoLike=photo=>{root.querySelectorAll('[data-photo-like]').forEach(el=>{if(el.dataset.photoLike!==photo.id)return;el.setAttribute('aria-pressed',String(!!photo.liked_by_me));el.disabled=pendingLikes.has(photo.id);el.setAttribute('aria-busy',String(el.disabled));el.querySelector('[data-photo-like-count]').textContent=number(photo.like_count||0);});};
 const syncPhotoLikes=async()=>{if(signal.aborted||document.hidden||pendingLikes.size||!root.querySelector('[data-photo-like]'))return;const ticket=++photoRead;try{const result=await api('/api/artists/'+encodeURIComponent(d.aid)+'/gallery','GET',undefined,{signal});if(signal.aborted||ticket!==photoRead||pendingLikes.size)return;for(const photo of result.photos){const local=d.photos.find(p=>p.id===photo.id);if(local){Object.assign(local,{like_count:photo.like_count,liked_by_me:photo.liked_by_me});paintPhotoLike(local);}}}catch{/* Keep the last verified counts while offline. */}};
 on(root,'click',async e=>{const el=e.target.closest('[data-photo-like]');if(!el)return;e.preventDefault();e.stopPropagation();if(!me){toast('로그인 후 좋아요를 눌러 주세요.');return;}const photo=d.photos.find(p=>p.id===el.dataset.photoLike);if(!photo||pendingLikes.has(photo.id))return;
  ++photoRead;const before={like_count:photo.like_count||0,liked_by_me:!!photo.liked_by_me};pendingLikes.add(photo.id);photo.liked_by_me=!before.liked_by_me;photo.like_count=Math.max(0,before.like_count+(photo.liked_by_me?1:-1));paintPhotoLike(photo);
  try{const result=await api('/api/artists/'+encodeURIComponent(d.aid)+'/gallery/'+encodeURIComponent(photo.id)+'/like',photo.liked_by_me?'PUT':'DELETE');Object.assign(photo,result);}catch(err){Object.assign(photo,before);toast(err.message);}finally{pendingLikes.delete(photo.id);if(!signal.aborted)paintPhotoLike(photo);}
 });
 if(typeof window!=='undefined')on(window,'focus',syncPhotoLikes);on(document,'visibilitychange',syncPhotoLikes);
 const photoSyncTimer=root.querySelector('[data-photo-like]')?setInterval(syncPhotoLikes,30000):null;
 signal.addEventListener('abort',()=>{if(photoSyncTimer)clearInterval(photoSyncTimer);},{once:true});
 on(root.querySelector('[data-fan-shuffle]'),'click',async()=>{if(!routeTracks.length)return;const tracks=[...routeTracks];for(let i=tracks.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tracks[i],tracks[j]]=[tracks[j],tracks[i]];}try{await play(tracks[0].id,tracks);}catch(e){toast(e.message);}});
 on(root.querySelector('[data-fan-sort]'),'change',e=>{const sort=e.target.value,tracks=[...d.tracks].sort((a,b)=>Number(b[sort==='recent'?'created':sort]||0)-Number(a[sort==='recent'?'created':sort]||0));root.querySelector('[data-fan-music]').innerHTML=artistMusicList(tracks);routeTracks=remember(tracks);icons();paintInteractions();});
 function postHTML(p){
  const own=me?.id===p.user_id,canDelete=!!me&&p.can_delete,comment=p.kind==='lounge',button=(action,text)=>'<button class="fan-text-button'+(action==='like'&&p.liked?' is-active':'')+'" '+(comment?'data-comment-action="'+action+'" ':'')+'data-post-action="'+action+'" data-post-id="'+esc(p.id)+'" '+(action==='reply'?'aria-label="답글 '+p.replies+'개" ':'')+(action==='like'?'aria-label="응원글 좋아요 '+p.likes+'개" aria-pressed="'+!!p.liked+'"':'')+'>'+text+'</button>';
   const nickname=p.producer_id
    ? '<a href="#producer/'+esc(p.producer_id)+'">'+userNickname(p.author,{profileId:p.producer_id})+'</a>'
    : '<span'+(comment?premiumNameAttribute(p.profile_id,p.user_id):'')+'>'+esc(p.author)+'</span>';
   const author='<span class="fan-post-author comment-author" data-profile-preview="'+esc(p.profile_id||p.producer_id||'member:'+p.user_id)+'" tabindex="0" role="button" aria-haspopup="dialog"><span class="fan-post-avatar">'+avatarImage({profile_id:p.profile_id,name:p.author,image_version:p.image_version},'producer',false)+'</span>'+nickname+'</span>';
   const extra=(!p.official&&p.operator?'<span class="fan-official">공식 운영자</span>':'')+(p.pinned?'<span>고정</span>':'');
   const meta=comment
    ? commentMetaHTML({created:p.created,creator:p.official,edited:p.edited},author,{className:'fan-post-meta',extra})
    : '<div class="fan-post-meta">'+author+(p.official?'<span class="fan-official">공식 제작자</span>':'')+extra+'<time datetime="'+new Date(p.created*1000).toISOString()+'">'+new Date(p.created*1000).toLocaleDateString('ko-KR')+'</time>'+(p.edited?' · 수정됨':'')+'</div>';
   return '<article class="fan-post" '+(comment&&!p.deleted?'data-comment-card data-comment-id="'+esc(p.id)+'" tabindex="0" aria-label="응원글" ':'')+'data-post="'+esc(p.id)+'">'+meta+(p.title?'<h3>'+esc(p.title)+'</h3>':'')+'<p class="fan-post-body"'+(comment?' data-comment-body':'')+'>'+(p.deleted?'삭제된 글입니다.':esc(p.body))+'</p>'+(!p.deleted?'<div class="fan-post-actions'+(comment?' comment-actions-row':'')+'">'+button('like',icon('ui-heart',16)+' '+p.likes)+(comment?button('reply',icon('message')+'<span>답글 '+p.replies+'</span>'):'')+(own?button('edit','수정'):me?button('report','신고'):'')+(canDelete?button('delete','삭제'):'')+(d.can_manage&&!p.parent_id?button('pin',p.pinned?'고정 해제':'상단 고정'):'')+'</div>':'')+'<div data-fan-replies="'+esc(p.id)+'"></div></article>';
 }
 const postMap=new Map(),feedRequests=new WeakMap();
 async function loadFeed(target,kind,offset=0,parent=null){
  const request=(feedRequests.get(target)||0)+1,editRevision=commentEditRevision;feedRequests.set(target,request);
  try{const res=await read('/posts'+(parent?'/'+encodeURIComponent(parent)+'/replies':'')+'?kind='+kind+'&offset='+offset);if(signal.aborted||!target.isConnected||feedRequests.get(target)!==request)return;
   if(!offset&&editRevision!==commentEditRevision)return loadFeed(target,kind,offset,parent);
   res.items.forEach(p=>postMap.set(p.id,p));target.querySelector('[data-feed-more]')?.remove();
   const items=d.tab==='home'&&!parent?res.items.slice(0,3):res.items;
   if(parent){
    // The API pages from newest to oldest, so older pages go above the loaded replies.
    const loaded=new Set(offset?[...target.children].map(el=>el.dataset.post):[]);
    const replies=items.filter(p=>!loaded.has(p.id)).reverse();
    const html=replies.map(postHTML).join('');
    if(offset)target.insertAdjacentHTML('afterbegin',html);else replaceCommentRows(target,html||'<p class="fan-empty">아직 답글이 없습니다.</p>');
   }else{
    const html=items.map(postHTML).join('');
    if(offset)target.insertAdjacentHTML('beforeend',html);else replaceCommentRows(target,html||'<p class="fan-empty">'+(kind==='news'?'아직 등록된 소식이 없습니다.':'첫 응원글을 남겨 보세요.')+'</p>');
   }
   if(res.next!==null&&(parent||d.tab!=='home')){const button=document.createElement('button');button.className='small-button';button.dataset.feedMore='';button.textContent='더 불러오기';button.onclick=()=>{button.disabled=true;void loadFeed(target,kind,res.next,parent);};target.append(button);}
   return res;
  }catch(e){if(!signal.aborted&&feedRequests.get(target)===request){target.innerHTML='<p role="alert">'+esc(e.message)+'</p>';}}
 }
 function updateReplyCount(parentId,count){
  const parent=postMap.get(parentId),button=root.querySelector('[data-post-action="reply"][data-post-id="'+CSS.escape(parentId)+'"]');
  if(parent)parent.replies=count;
  if(button){button.setAttribute('aria-label','답글 '+count+'개');button.querySelector('span').textContent='답글 '+count;}
 }
 const focusId=new URLSearchParams(location.hash.split('?')[1]||'').get('post');
 root.querySelectorAll('[data-fan-feed]').forEach(el=>{
  if(focusId&&el.dataset.fanFeed==='lounge')void (async()=>{
   try{const res=await read('/posts?kind=lounge&focus='+encodeURIComponent(focusId));if(signal.aborted||!el.isConnected)return;res.items.forEach(p=>postMap.set(p.id,p));
    const parent=res.items.find(p=>!p.parent_id),reply=parent&&res.items.find(p=>p.parent_id===parent.id);
    el.innerHTML=res.items.filter(p=>p!==reply).map(postHTML).join('')||'<p class="fan-empty">삭제되었거나 볼 수 없는 응원글·댓글입니다.</p>';
    if(reply)el.querySelector('[data-fan-replies="'+CSS.escape(parent.id)+'"]').innerHTML='<div data-reply-list>'+postHTML(reply)+'</div>';
    const node=[...el.querySelectorAll('[data-post]')].find(n=>n.dataset.post===focusId);if(node){node.setAttribute('tabindex','-1');node.scrollIntoView({block:'center'});node.focus({preventScroll:true});}
   }catch(e){if(!signal.aborted)el.innerHTML='<p role="status">'+esc(e.message)+'</p>';}
  })();else void loadFeed(el,el.dataset.fanFeed);
 });
 function compose(kind,p=null,parent=null){
  if(!me){toast('로그인 후 작성해 주세요.');return;}
  dialog('<h2>'+(p?'글 수정':kind==='news'?'공식 소식':'팬 응원글')+'</h2><form id="fan-post-form" class="upload-form">'+(kind==='news'?'<label class="form-field">제목<input name="title" maxlength="160" value="'+esc(p?.title||'')+'" required></label>':'')+'<label class="form-field">내용<textarea name="body" maxlength="2000" rows="5" required>'+esc(p?.body||'')+'</textarea></label><button class="primary-button">저장</button><p class="form-error" role="alert"></p></form>');
  const form=$('#fan-post-form'),requestId=crypto.randomUUID();form.onsubmit=busyForm(form,async fd=>{
   await read('/posts'+(p?'/'+p.id:''),p?'PUT':'POST',{kind,title:fd.get('title')||'',body:fd.get('body'),parent_id:parent,request_id:requestId});
   $('#dialog').close();
   const list=root.querySelector('[data-fan-feed="lounge"]');
   if(!p&&kind==='lounge'&&list)await loadFeed(list,kind);
   else await refresh();
  });
 }
 root.querySelectorAll('[data-fan-compose]').forEach(el=>on(el,'click',()=>compose(el.dataset.fanCompose)));
 if(d.tab==='lounge'&&new URLSearchParams(location.hash.split('?')[1]).get('compose')==='1'&&!history.state?.fanComposeHandled){
  history.replaceState({...history.state,fanComposeHandled:true},'');
  requestAnimationFrame(()=>{
   if(signal.aborted||!root.isConnected)return;
   if(me){compose('lounge');document.querySelector('#fan-post-form textarea')?.focus();}
   else root.querySelector('[data-fan-compose="lounge"]')?.focus();
  });
 }
 on(root,'click',async e=>{
  const el=e.target.closest('[data-post-action]');if(!el||el.disabled)return;const p=postMap.get(el.dataset.postId),action=el.dataset.postAction;if(!p)return;
  if(action==='edit'){
   if(p.kind==='lounge')openCommentEditor(el,async text=>{
    await read('/posts/'+encodeURIComponent(p.id),'PUT',{kind:p.kind,title:p.title||'',body:text});
    const current=postMap.get(p.id);
    if(current){current.body=text;current.edited=Math.floor(Date.now()/1000);}
   });
   else compose(p.kind,p);
   return;
  }
  if(action==='reply'){
   const parentId=p.parent_id||p.id,target=root.querySelector('[data-fan-replies="'+parentId+'"]');
   const existing=target.querySelector('.fan-reply-form');if(existing){existing.elements.body.focus({preventScroll:true});return;}
   let list=target.querySelector('[data-reply-list]');
   if(!list){list=document.createElement('div');list.dataset.replyList='';list.innerHTML='<p role="status">답글을 불러오는 중…</p>';target.append(list);}
   if(me){
    const form=document.createElement('form');form.className='fan-reply-form';
    form.innerHTML='<label class="form-field">답글<textarea data-comment-input name="body" rows="1" maxlength="2000" placeholder="응원의 답글을 남겨 보세요." required></textarea></label><div class="fan-reply-controls"><button type="button" class="fan-text-button" data-reply-cancel>취소</button><button class="small-button" type="submit">등록</button></div><p class="form-error" role="alert"></p>';
    target.append(form);form.elements.body.focus({preventScroll:true});
    const requestId=globalThis.crypto?.randomUUID?.()||('reply-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),cancel=form.querySelector('[data-reply-cancel]');
    cancel.onclick=()=>{form.remove();el.focus({preventScroll:true});};
    form.onsubmit=busyForm(form,async fd=>{
     cancel.disabled=true;
     try{
      await read('/posts','POST',{kind:p.kind,title:'',body:fd.get('body'),parent_id:parentId,reply_to_id:p.id,request_id:requestId});
      if(signal.aborted||!target.isConnected)return;
      form.remove();el.focus({preventScroll:true});
      const result=await loadFeed(list,p.kind,0,parentId);
      if(result)updateReplyCount(parentId,result.parent_replies);
     }finally{cancel.disabled=false;}
    });
   }
   // The editor exists before the request, so repeated clicks preserve the draft and focus.
   if(!list.dataset.loaded){list.dataset.loaded='true';const result=await loadFeed(list,p.kind,0,parentId);if(!result)delete list.dataset.loaded;}
   return;
  }
  if(!me){toast(AifectMessages.signIn);return;}
  if(action==='delete'||action==='report'){
   dialog((action==='delete'?'<p class="popup-prompt">이 글을 삭제하시겠습니까?</p><p>삭제하면 복구할 수 없습니다.</p>':'<h2>응원글 신고</h2>')+'<form id="fan-action-form" class="upload-form">'+(action==='report'?'<label class="form-field">신고 사유<textarea name="reason" maxlength="500" required></textarea></label>':'')+'<button class="primary-button">'+(action==='delete'?'삭제':'신고 접수')+'</button><p class="form-error" role="alert"></p></form>');const form=$('#fan-action-form');form.onsubmit=busyForm(form,async fd=>{await read('/posts/'+p.id+(action==='report'?'/report':''),action==='report'?'POST':'DELETE',action==='report'?{reason:fd.get('reason')}:undefined);$('#dialog').close();
    const list=el.closest('[data-reply-list]');
    if(action==='delete'&&p.parent_id&&list){
     const result=await loadFeed(list,p.kind,0,p.parent_id);
     if(result)updateReplyCount(p.parent_id,result.parent_replies);
    }else await refresh();
    toast(action==='report'?'신고를 접수했습니다.':'삭제했습니다.');});return;
  }
  el.disabled=true;try{await read('/posts/'+p.id+'/'+action,action==='like'&&p.liked?'DELETE':'PUT',action==='pin'?{pinned:!p.pinned}:undefined);await refresh();}catch(err){toast(err.message);el.disabled=false;}
 });
 on(root.querySelector('[data-fan-photo-manage]'),'click',()=>{
  let photos=d.photos.map(p=>({...p,carousel:p.carousel!==false}));
  dialog('<h2 class="popup-title-clearance">사진 순서와 캐러셀</h2><form id="fan-photos-form"><div data-photo-rows></div><p class="field-help">갤러리 최대 20장 · 캐러셀 최대 10장</p><button class="primary-button">저장</button><p class="form-error" role="alert"></p></form>');const form=$('#fan-photos-form'),area=form.querySelector('[data-photo-rows]');
  const paintRows=()=>{area.innerHTML=photos.map((p,i)=>'<div class="fan-photo-edit"><img src="'+esc(p.url)+'" alt="사진 '+(i+1)+'"><label><input type="checkbox" data-photo-toggle="'+i+'" '+(p.carousel?'checked':'')+'> 캐러셀</label><button type="button" class="fan-text-button" data-photo-up="'+i+'" '+(!i?'disabled':'')+'>위로</button><button type="button" class="fan-text-button" data-photo-down="'+i+'" '+(i===photos.length-1?'disabled':'')+'>아래로</button></div>').join('');};paintRows();
  area.onchange=e=>{const i=Number(e.target.dataset.photoToggle);if(e.target.checked&&photos.filter(p=>p.carousel).length>=10){e.target.checked=false;toast('캐러셀은 최대 10장까지 선택해 주세요.');return;}photos[i].carousel=e.target.checked;};
  area.onclick=e=>{const b=e.target.closest('[data-photo-up],[data-photo-down]');if(!b)return;const i=Number(b.dataset.photoUp??b.dataset.photoDown),j=i+(b.hasAttribute('data-photo-up')?-1:1);[photos[i],photos[j]]=[photos[j],photos[i]];paintRows();};
  form.onsubmit=busyForm(form,async()=>{await read('/photos','PUT',{photos:photos.map(p=>({id:p.id,carousel:!!p.carousel}))});$('#dialog').close();await refresh();});
 });

 on(root.querySelector('[data-fan-operators]'),'click',()=>{
  dialog('<h2>공식 운영자 관리</h2><form id="fan-operators-form" class="upload-form"><label class="form-field">운영자 제작자 프로필 링크 또는 ID<input name="profile" required></label><p class="field-help">승인된 운영자는 배경·갤러리·소식·응원글 고정을 관리할 수 있습니다.</p><button class="primary-button">운영자 승인</button><p class="form-error" role="alert"></p></form><div class="fan-operator-list">'+d.operators.map(o=>'<p>'+esc(o.name)+' <button class="small-button" data-operator-remove="'+esc(o.id)+'">승인 해제</button></p>').join('')+'</div>');
  const form=$('#fan-operators-form');form.onsubmit=busyForm(form,async fd=>{const value=String(fd.get('profile')).trim(),producerId=value.includes('#producer/')?value.split('#producer/')[1].split('?')[0]:value;await read('/operators','PUT',{producer_id:producerId});$('#dialog').close();await refresh();});
  $('#dialog').querySelectorAll('[data-operator-remove]').forEach(button=>{button.onclick=async()=>{button.disabled=true;try{await read('/operators','DELETE',{producer_id:button.dataset.operatorRemove});$('#dialog').close();await refresh();}catch(e){toast(e.message);button.disabled=false;}};});
 });
 on(root.querySelector('[data-fan-settings]'),'click',()=>{
  const s=settings();dialog('<h2 class="popup-title-clearance">아티스트 프로필</h2><form id="fan-settings-form" class="upload-form">'+[['introduction','상세 소개',4000],['concept','음악 스타일과 콘셉트',2000],['world','세계관',4000]].map(([key,label,max])=>'<label class="form-field">'+label+'<textarea name="'+key+'" rows="4" maxlength="'+max+'">'+esc(s[key]||'')+'</textarea></label>').join('')+'<button class="primary-button">저장</button><p class="form-error" role="alert"></p></form>');const form=$('#fan-settings-form');form.onsubmit=busyForm(form,async fd=>{await read('','PUT',{...s,...Object.fromEntries(fd)});$('#dialog').close();await refresh();});
 });
 on(root.querySelector('[data-fan-banner]'),'click',()=>{
  const s=settings();let previewURL=null;
  dialog('<h2>헤더 배경</h2><form id="fan-banner-form" class="upload-form"><label class="form-field">배경 사진<input type="file" name="image" accept="image/jpeg,image/png,image/webp"></label><p class="field-help">JPG · PNG · WebP, 5MB 이하, 가로·세로 320~8000px</p><div class="fan-banner-preview"><img alt="배경 미리보기" '+(s.banner_version?'src="/media/artist-banner/'+esc(d.aid)+'?v='+esc(s.banner_version)+'"':'hidden')+'></div><label class="form-field">미리보기 화면<select data-banner-device><option value="pc">PC</option><option value="mobile">모바일</option></select></label>'+[['focus_x','PC 가로 초점'],['focus_y','PC 세로 초점'],['mobile_x','모바일 가로 초점'],['mobile_y','모바일 세로 초점']].map(([key,label])=>'<label class="form-field">'+label+'<input type="range" name="'+key+'" min="0" max="100" value="'+s[key]+'"></label>').join('')+'<div class="inline-actions"><button class="primary-button">저장</button><button type="button" class="small-button" data-banner-remove>배경 삭제</button></div><p class="form-error" role="alert"></p></form>');
  const form=$('#fan-banner-form'),img=form.querySelector('.fan-banner-preview img'),preview=form.querySelector('.fan-banner-preview');
  const paintPreview=()=>{const mobile=form.querySelector('[data-banner-device]').value==='mobile';preview.classList.toggle('mobile',mobile);img.style.objectPosition=form.elements[mobile?'mobile_x':'focus_x'].value+'% '+form.elements[mobile?'mobile_y':'focus_y'].value+'%';};form.oninput=paintPreview;paintPreview();
  const validate=async file=>{if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('JPG·PNG·WebP, 5MB 이하 사진을 선택해 주세요.');const bitmap=await createImageBitmap(file);const valid=Math.min(bitmap.width,bitmap.height)>=320&&Math.max(bitmap.width,bitmap.height)<=8000;bitmap.close();if(!valid)throw new Error('사진의 가로·세로는 320~8000px이어야 합니다.');};
  form.elements.image.onchange=async()=>{const file=form.elements.image.files[0];try{await validate(file);if(previewURL)URL.revokeObjectURL(previewURL);if(file){previewURL=URL.createObjectURL(file);img.src=previewURL;img.hidden=false;}}catch(e){form.querySelector('.form-error').textContent=e.message;form.elements.image.value='';}};
  $('#dialog').addEventListener('close',()=>{if(previewURL)URL.revokeObjectURL(previewURL);},{once:true});
  form.onsubmit=busyForm(form,async fd=>{const file=fd.get('image');await validate(file?.size?file:null);if(file?.size)await uploadFile(base+'/banner',file);await read('','PUT',{...s,...Object.fromEntries(['focus_x','focus_y','mobile_x','mobile_y'].map(k=>[k,Number(fd.get(k))]))});$('#dialog').close();await refresh();});
  form.querySelector('[data-banner-remove]').onclick=async e=>{e.currentTarget.disabled=true;try{await read('/banner','DELETE');$('#dialog').close();await refresh();}catch(err){form.querySelector('.form-error').textContent=err.message;e.currentTarget.disabled=false;}};
 });
}
