function homePlaceholder(kind){
 const artists=kind==='artists';
 return `<p class="home-load-message" role="status">${artists?'아티스트를':'새 음악을'} 불러오고 있어요.</p><div class="${artists?'artist-grid':'album-grid live-album-grid'} home-placeholders" aria-hidden="true">${Array.from({length:artists?4:5},()=>artists?'<div class="artist-card surface"><div class="home-ghost-portrait"></div><div class="home-ghost-line"></div><div class="home-ghost-line short"></div></div>':'<div class="album-card"><div class="album-art home-ghost-art"></div><div class="home-ghost-line"></div><div class="home-ghost-line short"></div></div>').join('')}</div>`;
}
function homeHTML(){
 return heading('오늘, 어떤 음악을 만나볼까요?','취향을 넓히는 새로운 음악과 창작자를 발견하세요.')+`
 <section class="hero aifect-hero">
  <div class="hero-copy"><span class="eyebrow">THE NEXT SOUND</span><h2>상상이 음악이 되는 곳.<br>당신의 다음 플레이리스트.</h2><p>AI가 열어준 가능성, 창작자가 담아낸 감성.<br>마음에 닿는 새로운 사운드를 만나보세요.</p><div class="hero-actions"><a class="primary-button" href="#discover">음악 둘러보기 ${icon('play')}</a><a href="#upload" class="text-link">내 음악 공개하기 ${icon('arrow')}</a></div><span class="hero-bottom">DISCOVER · LISTEN · CONNECT</span></div>
  <div class="live-hero-art" aria-hidden="true"><div>A<span>IFECT</span></div></div>
 </section>
 <nav class="home-explorer-links" aria-label="새로운 음악 찾기"><a href="#discover/themes"><span>MOOD</span><strong>오늘 기분에 맞는 음악</strong><small>위로부터 기분 전환까지 →</small></a><a href="#collections"><span>PLAYLIST</span><strong>함께 나누는 플레이리스트</strong><small>다른 사람의 선곡 만나기 →</small></a><a href="#discover/following"><span>FOLLOWING</span><strong>내가 팔로우한 창작자</strong><small>새롭게 공개된 음악 듣기 →</small></a></nav>
 ${section('새롭게 도착한 음악','#charts/releases')}<section id="home-tracks" class="home-section" aria-label="새롭게 도착한 음악" aria-busy="true">${homePlaceholder('tracks')}</section>
 ${section('새로운 목소리를 만나보세요','#artists')}<section id="home-artists" class="home-section" aria-label="새로운 목소리를 만나보세요" aria-busy="true">${homePlaceholder('artists')}</section>
 <div class="preview-notice"><div><span class="tiny-eyebrow">YOUR NEXT FAVORITE</span><p>60초의 첫 만남, 회원은 전체곡을 무료로.</p></div><a class="primary-button" id="home-start" href="#account">무료로 시작하기 ${icon('arrow')}</a></div>`;
}
function updateHomeAccount(){
 const link=$('#home-start');if(!link)return;
 link.href=me?'#discover':'#account';
 link.innerHTML=(me?'음악 발견하기':'무료로 시작하기')+' '+icon('arrow');
 document.querySelectorAll('#home-artists [data-follow]').forEach(button=>{
  const [kind,id]=button.dataset.follow.split('/');
  button.innerHTML=(followed(kind,id)?'팔로잉':'팔로우')+' '+icon('plus');
 });
}
function renderHome(ticket){
 const main=$('#main');routeTracks=[];
 // The top stays still and never waits for account, catalog or image requests.
 if(typeof AifectMotion!=='undefined')AifectMotion.enter(main,'home/');
 main.classList.remove('motion-enter');main.innerHTML=homeHTML();main.removeAttribute('aria-busy');
 updateHomeAccount();window.scrollTo({top:0,behavior:'instant'});
 const load=async(kind,limit)=>{
  const target=$('#home-'+kind);if(!target)return;
  target.setAttribute('aria-busy','true');
  try{
   const data=await api(`/api/catalog?section=${kind}&limit=${limit}`);
   if(ticket!==renderId||!target.isConnected)return;
   if(kind==='tracks'){routeTracks=remember(data.tracks);target.innerHTML=grid(data.tracks);}
   else target.innerHTML=identityCards(data.artists,'artist');
   target.classList.add('home-ready');
  }catch{
   if(ticket!==renderId||!target.isConnected)return;
   target.innerHTML=`<div class="home-load-error"><p>${kind==='tracks'?'음악':'아티스트'} 목록을 불러오지 못했어요.</p><button class="small-button">다시 불러오기</button></div>`;
   target.querySelector('button').onclick=()=>{target.innerHTML=homePlaceholder(kind);void load(kind,limit);};
  }finally{if(ticket===renderId&&target.isConnected)target.removeAttribute('aria-busy');}
 };
 // Each section can succeed or retry independently; neither waits for images.
 return Promise.all([load('tracks',5),load('artists',4)]);
}
