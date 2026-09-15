const paths={home:'m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',compass:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM16 8l-3 5-5 3 3-5z',chart:'M4 20V11m8 9V4m8 16v-7',users:'M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m22 0v-2a4 4 0 0 0-3-3.9M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm5-3.9a4 4 0 0 1 0 7.8',library:'M4 4v16M8 4v16m5-15 6-1 3 15-6 1z',gift:'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z',sliders:'M4 3v7m0 4v7m8-18v13m0 4v1m8-18v1m0 4v13M1 10h6m2 6h6m2-12h6',external:'M14 3h7v7m-9 2 9-9M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6',arrow:'M4 12h16m-6-6 6 6-6 6',chevron:'m9 5 7 7-7 7',search:'M21 21l-5-5m2-6a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4',plus:'M12 5v14M5 12h14',play:'m8 4 12 8-12 8z',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',shuffle:'M3 4h3l12 16h3m-4-4 4 4-4 3M3 20h3l5-7m2-2 5-7h3m-4-3 4 3-4 4',previous:'M5 4v16M20 4 8 12l12 8z',next:'M19 4v16M4 4l12 8-12 8z',repeat:'m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3',volume:'m11 5-6 4H2v6h3l6 4ZM15 8a7 7 0 0 1 0 8m3-11a11 11 0 0 1 0 14',list:'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',menu:'M3 6h18M3 12h18M3 18h18',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',sparkles:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4',upload:'M12 16V3m-5 5 5-5 5 5M3 15v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5'};
const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n]||paths.sparkles}"/></svg>`;
// Static design prototype. No authentication, uploads, or audio services are connected.
const tracks = [
  {title:'파도가 잠든 밤',artist:0,producer:0,genre:'R&B',mood:'몽환적인 밤',cover:'ocean',time:'3:42',tag:'AIFECT PICK',plays:'24.8K',likes:'1,284',comments:128},
  {title:'Afterglow',artist:1,producer:1,genre:'City Pop',mood:'노을빛 드라이브',cover:'orange',type:'AFTER<br>GLOW',time:'2:58',plays:'18.2K',likes:'962',comments:86},
  {title:'Blue Hour',artist:2,producer:2,genre:'Instrumental',mood:'편안한 오후',cover:'blue',type:'blue<br>hour.',time:'3:16',plays:'12.6K',likes:'831',comments:54},
  {title:'너의 궤도',artist:0,producer:0,genre:'K-POP',mood:'우주를 닮은 감성',cover:'nova',time:'3:28',plays:'10.4K',likes:'724',comments:42},
  {title:'A Little Closer',artist:3,producer:1,genre:'Ballad',mood:'조금 더 가까이',cover:'lime',type:'a little<br>closer.',time:'2:47',plays:'8.9K',likes:'612',comments:38}
];
const artists = [
  {name:'NOVA',cover:'nova',bio:'익숙한 밤을 낯설게 만드는 목소리.',genre:'R&B · K-POP',followers:'2.4K',producer:0},
  {name:'milo',cover:'orange',bio:'일상의 틈에서 찾은 선명한 멜로디.',genre:'City Pop · EDM',followers:'1.8K',producer:1},
  {name:'SORA',cover:'blue',bio:'마음이 쉬어가는 소리를 만듭니다.',genre:'Instrumental · OST',followers:'964',producer:2},
  {name:'off:beat',cover:'lime',bio:'조금 다른 리듬, 같은 마음.',genre:'Ballad · Rock',followers:'528',producer:1}
];
const producers = [
  {name:'Studio lune',initial:'sl.',cover:'lime',bio:'기술과 감성 사이, 새로운 음악을 만듭니다.',followers:'1.2K'},
  {name:'milo studio',initial:'m.',cover:'orange',bio:'평범한 순간을 오래 듣고 싶은 음악으로.',followers:'842'},
  {name:'SORA lab',initial:'s.',cover:'blue',bio:'소리로 기록하는 느린 시간.',followers:'620'}
];
const genres = ['전체','K-POP','Ballad','R&B','Hip-Hop','Rock','EDM','City Pop','OST','Instrumental'];
const artistName = t => artists[t.artist].name;
const songLink = t => `#song/${tracks.indexOf(t)}`;
const route = () => location.hash.slice(1).split('/');
const pick = (items, id) => items[Number(id)] || items[0];
function art(t, cls='album-art') {
  return `<div class="${cls} cover cover-${t.cover}" role="img" aria-label="${t.title} 앨범 커버">${cls==='album-art' ? `${t.type ? `<span class="album-typography">${t.type}</span><span class="cover-micro">${artistName(t)} · ORIGINAL SOUND</span>` : ''}${t.tag ? `<span class="cover-label">${t.tag}</span>` : ''}<span class="album-play">${icon('play')}</span>` : ''}</div>`;
}
function albums(items=tracks) {
  return `<div class="album-grid">${items.map(t=>`<article class="album-card"><a href="${songLink(t)}">${art(t)}<h3 class="album-title">${t.title}</h3></a><div class="album-meta"><a href="#artist/${t.artist}">${artistName(t)} <span class="ai-mini">AI</span></a><span class="dot">·</span>${t.genre}</div><a class="producer-credit" href="#producer/${t.producer}">by ${producers[t.producer].name}</a></article>`).join('')}</div>`;
}
function chart(items=tracks, full=false) {
  return `<div class="chart-list ${full?'large-chart':''}">${items.map((t,i)=>`<div class="chart-row"><span class="chart-number">${i+1}</span><span class="chart-change">${i===2?'–':'↑'}</span>${art(t,'chart-thumb')}<a href="${songLink(t)}" class="chart-song">${t.title}<small>${artistName(t)} · ${producers[t.producer].name}</small></a><span class="chart-time">${t.time}</span><button class="icon-button" data-demo="60초 미리 듣기" aria-label="${t.title} 미리 듣기 시안">${icon('play')}</button></div>`).join('')}</div>`;
}
const heading=(title,sub='',right='')=>`<div class="page-heading"><div><h1>${title}</h1>${sub?`<p>${sub}</p>`:''}</div>${right}</div>`;
const section=(title,sub='',link='',label='전체 보기')=>`<div class="section-heading"><h2>${title}</h2>${sub?`<span>${sub}</span>`:''}${link?`<a href="#${link}">${label}${icon('chevron')}</a>`:''}</div>`;
const mockTable=(heads,rows)=>`<div class="table-scroll"><table class="simple-table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const tabs=(items, selected=0)=>`<nav class="view-tabs" aria-label="화면 선택">${items.map(([name,href],i)=>`<a href="#${href}" class="${i===selected?'selected':''}" ${i===selected?'aria-current="page"':''}>${name}</a>`).join('')}</nav>`;
const follow=(type)=>`<button class="small-button" data-demo="로그인 후 ${type} 팔로우">${icon('plus')} 팔로우</button>`;
const genreNav=(selected='전체')=>`<nav class="genre-row" aria-label="장르">${genres.map(g=>`<a href="#discover/${encodeURIComponent(g)}" class="${g===selected?'selected':''}">${g}</a>`).join('')}</nav>`;
const previewNotice=()=>`<div class="preview-notice"><div><span class="tiny-eyebrow">60 SECONDS TO FALL IN LOVE</span><p>미리 듣기는 60초, 좋아하는 음악은 끝까지.</p><span>무료 회원가입 후 모든 곡을 전체 감상하세요.</span></div><a class="small-button" href="#account">무료로 시작하기 ${icon('arrow')}</a></div>`;
function artistCards(items=artists) {
  return `<div class="artist-grid">${items.map(a=>`<article class="artist-card"><a href="#artist/${artists.indexOf(a)}"><div class="artist-portrait cover-${a.cover}" role="img" aria-label="${a.name} AI 아티스트 프로필">${a.cover==='nova'?'':a.name[0]}</div><h3>${a.name}<span class="ai-chip">AI</span></h3><p>${a.bio}<br>${a.genre}</p></a><div class="card-follow"><span>${a.followers} 팔로워</span>${follow('아티스트')}</div></article>`).join('')}</div>`;
}
function producerCards() {
  return `<div class="producer-grid">${producers.map((p,i)=>`<article class="producer-card surface"><div class="producer-monogram cover-${p.cover}">${p.initial}</div><span class="eyebrow">PRODUCER</span><a href="#producer/${i}"><h2>${p.name}</h2></a><p>${p.bio}</p><a class="producer-artists" href="#producer/${i}">${artists.filter(a=>a.producer===i).map(a=>a.name).join(' · ')} ${icon('arrow')}</a><div class="card-follow"><span>${p.followers} 팔로워</span>${follow('제작자')}</div></article>`).join('')}</div>`;
}
const chartTabs=[['TOP 100','charts'],['급상승','charts/rising'],['신인','charts/newcomers'],['신규 발매','charts/releases']];
const libraryTabs=[['좋아요 한 곡','library'],['플레이리스트','library/playlists'],['팔로우 아티스트','library/artists'],['팔로우 제작자','library/producers']];
const studioTabs=[['대시보드','studio'],['내 음원','manage'],['제작자 프로필','producer/0'],['음원 업로드','upload']];
const views = {
  home:()=>`${heading('발견의 시작, AIFECT.','새로운 AI 음악을 발견하고, 당신의 아티스트를 만나세요.',`<a class="free-badge" href="#account">${icon('sparkles')}모든 음악, 무료로</a>`)}
    <div class="hero-grid"><section class="hero aifect-hero"><div class="hero-art" role="img" aria-label="달빛이 비치는 밤바다"></div><div class="hero-copy"><span class="eyebrow"><span class="line"></span>AIFECT PICKS · 01</span><h2>파도가 잠든 밤</h2><p>NOVA의 목소리로 물드는 푸른 밤.<br>당신의 하루 끝에 닿을 새로운 사운드.</p><div class="hero-credits"><a href="#artist/0">NOVA <span class="ai-chip">AI ARTIST</span></a><span>×</span><a href="#producer/0">Studio lune</a></div><div class="hero-actions"><button class="primary-button" data-demo="60초 미리 듣기">${icon('play')}60초 미리 듣기</button><a href="#song/0" class="text-link">곡 이야기 ${icon('arrow')}</a></div></div><div class="hero-bottom"><span>R&B</span><b></b><span>3:42</span><span>24.8K PLAYS</span></div></section>
    <section class="spotlight"><div class="spotlight-top">ARTIST SPOTLIGHT ${icon('sparkles')}</div><a href="#artist/0" class="artist-feature"><img class="artist-feature-photo" src="assets/nova.png" alt="가상 AI 아티스트 NOVA"><div><h3>NOVA</h3><span>밤을 닮은 목소리 <b class="ai-chip">AI</b></span></div></a><p>음악을 좋아하게 되는 순간,<br>새로운 아티스트의 이야기가 시작됩니다.</p><div class="spotlight-footer"><span><strong>2.4K</strong> 팔로워</span><a class="small-button" href="#artist/0">만나보기 ${icon('arrow')}</a></div></section></div>
    ${genreNav()}<section>${section('지금, 귀 기울일 음악','당신의 다음 플레이리스트','discover')}${albums()}</section>
    <div class="bottom-grid"><section>${section('오늘의 TOP 100','가장 많이 사랑받은 음악','charts')}${chart(tracks.slice(0,3))}</section><section>${section('지금 떠오르는 사운드','먼저 발견하는 즐거움','charts/rising')}${chart([tracks[4],tracks[2],tracks[1]])}</section></div>
    <section class="section-space">${section('오늘 처음 만나는 아티스트','좋아하는 음악에서, 좋아하는 아티스트로','artists')}${artistCards(artists.slice(1))}</section>${previewNotice()}`,
  discover:(id)=>{
    let selected='전체'; try { const decoded=decodeURIComponent(id||''); if(genres.includes(decoded)) selected=decoded; } catch {}
    const items=selected==='전체'?tracks:tracks.filter(t=>t.genre===selected);
    return `${heading('새로운 취향을 발견하세요','좋은 음악과의 첫 만남에는 로그인이 필요 없어요.')}${genreNav(selected)}${section(selected==='전체'?'오늘의 추천':selected,'AIFECT가 소개하는 음악')}${items.length?albums(items):`<div class="surface empty-design"><span class="eyebrow">COMING SOON</span><h2>새로운 사운드가 찾아옵니다.</h2><p>이 장르의 음악은 아직 준비 중이에요. 다른 장르에서 취향을 발견해 보세요.</p><a href="#discover" class="small-button">전체 음악 보기</a></div>`}<div class="section-space">${section('방금 도착한 음악','','charts/releases')}${chart([...tracks].reverse(),true)}</div>${previewNotice()}`;
  },
  charts:(id)=>{
    const names={rising:'급상승 차트',newcomers:'신인 차트',releases:'신규 발매'};
    const selected={rising:1,newcomers:2,releases:3}[id]||0;
    const items=id==='rising'?[tracks[4],tracks[2],tracks[1],tracks[0],tracks[3]]:id==='newcomers'?[tracks[4],tracks[2],tracks[1]]:id==='releases'?[...tracks].reverse():tracks;
    return `${heading(names[id]||'TOP 100','지금의 취향을 읽고, 다음의 취향을 발견하세요.',`<span class="pill">예시 순위</span>`)}${tabs(chartTabs,selected)}<div class="surface">${section(names[id]||'오늘의 TOP 100',id==='releases'?'발매일순':'디자인 시안 · 샘플 음악')}${chart(items,true)}</div><section class="section-space">${section('이 음악을 만든 사람들','','producers')}${producerCards()}</section>`;
  },
  artists:()=>`${heading('당신의 다음 아티스트','음악 너머의 이야기. 좋아하는 AI 아티스트와 더 가까이.')}${artistCards()}<section class="section-space">${section('아티스트의 새로운 음악','','charts/releases')}${albums()}</section>`,
  producers:()=>`${heading('음악 뒤에 있는 상상력','좋아하는 음악을 만든 제작자를 만나고, 다음 작품도 함께하세요.')}${producerCards()}<div class="section-space">${section('제작자가 들려주는 음악')}${albums()}</div>`,
  artist:(id)=>{
    const a=pick(artists,id), index=artists.indexOf(a), p=producers[a.producer];
    return `${heading('AI 아티스트')}<section class="profile-hero"><div class="artist-portrait cover-${a.cover}" role="img" aria-label="${a.name} 프로필">${a.cover==='nova'?'':a.name[0]}</div><div><span class="eyebrow">AI ARTIST · ${a.genre}</span><h2>${a.name}</h2><p>${a.bio}<br>팔로워 ${a.followers} · 누적 재생 ${index===0?'35.2K':'12.6K'}</p><div class="inline-actions">${follow('아티스트')}<a class="small-button" href="#producer/${a.producer}">제작자 ${p.name} ${icon('arrow')}</a></div></div></section><section class="section-space">${section('대표곡 & 모든 음악')}${albums(tracks.filter(t=>t.artist===index))}</section>`;
  },
  producer:(id)=>{
    const p=pick(producers,id), index=producers.indexOf(p);
    return `${heading('제작자 프로필')}<section class="profile-hero"><div class="artist-portrait cover-${p.cover}">${p.initial}</div><div><span class="eyebrow">PRODUCER / CREATOR</span><h2>${p.name}</h2><p>${p.bio}<br>${p.followers} 팔로워 · ${tracks.filter(t=>t.producer===index).length}곡 공개</p>${follow('제작자')}</div></section><section class="section-space">${section('함께하는 AI 아티스트')}${artistCards(artists.filter(a=>a.producer===index))}</section><section class="section-space">${section('제작한 모든 음악')}${albums(tracks.filter(t=>t.producer===index))}</section>`;
  },
  song:(id)=>{
    const t=pick(tracks,id), a=artists[t.artist], p=producers[t.producer];
    return `${heading('곡 이야기', '',`<a class="text-link" href="#discover">더 많은 음악 ${icon('arrow')}</a>`)}<div class="song-detail">${art(t)}<div><span class="eyebrow">SINGLE · ${t.genre}</span><h2>${t.title}</h2><div class="song-credits"><a href="#artist/${t.artist}"><span>AI ARTIST</span><strong>${a.name} <b class="ai-chip">AI</b></strong></a><a href="#producer/${t.producer}"><span>PRODUCER</span><strong>${p.name} ${icon('external')}</strong></a></div><p class="song-description">${t.mood}. 한 번 더 듣고 싶은 순간을 담은 음악.<br><span class="song-date">${t.time} · 2026. 09. 12 발매</span></p><div class="track-stats"><span>${icon('play')} ${t.plays}</span><span>${icon('heart')} ${t.likes}</span><a href="#song/${tracks.indexOf(t)}/comments">댓글 ${t.comments}</a></div><div class="inline-actions"><button class="primary-button" data-demo="60초 미리 듣기">${icon('play')}60초 미리 듣기</button><button class="small-button" data-demo="로그인 후 좋아요">${icon('heart')} 좋아요</button><button class="icon-button" aria-label="플레이리스트에 추가" data-demo="로그인 후 플레이리스트 추가">${icon('plus')}</button></div></div></div>
      <div class="song-columns"><section class="surface comments-panel">${section('이 음악에 남긴 마음',`${t.comments}개의 댓글`)}<div class="comment-composer"><span class="comment-avatar">나</span><div><button class="comment-placeholder" data-demo="로그인 후 댓글 작성">이 순간, 어떤 마음으로 듣고 있나요?</button><div class="comment-compose-bottom"><label><input type="checkbox" checked> 현재 재생 시간 0:42 첨부</label><a class="small-button" href="#account">로그인하고 댓글 남기기</a></div></div></div><div class="comment-sort"><button class="selected" data-demo="인기순 정렬">인기순</button><button data-demo="최신순 정렬">최신순</button><button data-demo="타임라인순 정렬">타임라인순</button></div>
      ${comment('서','서늘한 오후','cover-blue','0:42','여기서 보컬이 들어오는 순간, 공기가 달라지는 느낌이에요.','48')}
      <div class="creator-reply"><span class="comment-avatar cover-lime">${p.initial}</span><div><strong>${p.name} <span class="creator-badge">제작자</span></strong><p>그 순간을 함께 느껴주셔서 고마워요. 오래 남는 음악이 되었으면 해요.</p><span class="comment-age">1시간 전 · 답글</span></div></div>
      ${comment('우','우주를 걷는 중','cover-orange','1:24','퇴근길에 발견했는데, 오늘 하루가 조금 좋아졌어요.','31')}
      ${comment('밤','밤의 플레이리스트','cover-lime','','이런 음악을 더 자주 만나고 싶어요. 다음 곡도 기다릴게요.','12')}</section>
      <aside class="song-sidebar"><section class="surface"><span class="eyebrow">ABOUT THIS TRACK</span><h3>소리 뒤의 이야기</h3><p>${a.bio} 새로운 소리와 사람의 감각이 만나 완성한 곡입니다.</p><div class="track-tags"><a href="#discover/${encodeURIComponent(t.genre)}">#${t.genre}</a><a href="#search">#${t.mood.replaceAll(' ','')}</a><a href="#search">#AI음악</a></div><details><summary>AI 제작 정보</summary><dl class="production-info"><dt>제작자</dt><dd>${p.name}</dd><dt>활용 도구</dt><dd>Suno · 예시</dd><dt>AI 생성 음악</dt><dd>예</dd><dt>참여 범위</dt><dd>작사 · 작곡 · 편곡</dd></dl></details><details><summary>가사</summary><p>파도가 잠든 밤<br>너의 목소리만 남아<br>멀어진 시간 너머<br>다시 나를 부른다</p><span class="comment-age">디자인용 예시 가사</span></details></section><section class="signup-card"><span class="eyebrow">KEEP THE MUSIC GOING</span><h3>60초 다음의 이야기.</h3><p>무료 가입하고 전체곡을 감상하세요.<br>듣던 1:00 지점부터 이어집니다.</p><a class="primary-button" href="#account">무료 회원가입</a></section></aside></div>`;
  },
  library:(id)=>`${heading('내 보관함','좋아하는 음악과 아티스트, 한곳에.',`<span class="pill">회원 화면 예시</span>`)}${tabs(libraryTabs,({playlists:1,artists:2,producers:3}[id]||0))}${id==='artists'?artistCards():id==='producers'?producerCards():id==='playlists'?`<div class="playlist-grid">${[['오늘 밤의 BGM','ocean','공개 · 12곡'],['조용한 작업실','blue','비공개 · 8곡'],['내가 발견한 음악','lime','공개 · 5곡']].map(([name,cover,info])=>`<a class="playlist-card surface" href="#playlist"><div class="playlist-art cover-${cover}">${icon('library')}</div><h2>${name}</h2><p>${info}</p></a>`).join('')}<button class="surface new-playlist" data-demo="플레이리스트 만들기">${icon('plus')}새 플레이리스트</button></div>`:`<div class="surface">${section('좋아요 한 음악','5곡')}${chart(tracks,true)}</div>`}`,
  playlist:()=>`${heading('오늘 밤의 BGM','하루의 끝에 듣고 싶은 음악만 모았어요.',`<button class="small-button" data-demo="플레이리스트 공개 설정">공개 ${icon('users')}</button>`)}<div class="inline-actions playlist-actions"><button class="primary-button" data-demo="플레이리스트 재생">${icon('play')}전체 재생</button><button class="small-button" data-demo="플레이리스트 편집">편집</button></div><div class="surface">${chart(tracks,true)}</div>`,
  history:()=>`${heading('최근 들은 음악','어제의 발견을 오늘도 다시.',`<span class="pill">회원 화면 예시</span>`)}<div class="surface">${section('오늘')}${chart(tracks.slice(0,3),true)}${section('어제')}${chart(tracks.slice(3),true)}</div>`,
  search:()=>`${heading('어떤 음악을 찾고 있나요?','곡, AI 아티스트, 제작자, 장르와 태그로 발견하세요.')}<form class="aifect-search" id="search-form"><label class="sr-only" for="search-input">검색어</label>${icon('search')}<input id="search-input" placeholder="곡, 아티스트, 제작자, 장르 검색" autocomplete="off"><button class="primary-button" type="submit">검색</button></form><p class="search-caption">지금 만날 수 있는 예시: NOVA · Studio lune · 파도가 잠든 밤</p>${genreNav()}<section id="search-results">${section('추천 음악')}${albums()}</section><section class="section-space">${section('추천 제작자')}${producerCards()}</section>`,
  account:()=>`<div class="login-layout"><section class="login-story"><span class="eyebrow">AI + EFFECT</span><h1>좋은 음악이 <br>당신에게 남기는 <br><em>새로운 감각.</em></h1><p>모든 곡을 무료로 듣고,<br>좋아하는 아티스트의 팬이 되어보세요.</p><div class="login-perks"><span>${icon('play')} 전체곡 무료 감상</span><span>${icon('heart')} 좋아요 · 댓글 · 플레이리스트</span><span>${icon('users')} 아티스트 & 제작자 팔로우</span></div></section><section class="login-card surface"><span class="eyebrow">WELCOME TO AIFECT</span><h2>음악은 여기서 시작돼요.</h2><p>로그인 또는 무료 회원가입</p><button class="social-login google" data-demo="Google 로그인"><b>G</b>Google로 계속하기</button><button class="social-login apple" data-demo="Apple 로그인">Apple로 계속하기</button><button class="social-login kakao" data-demo="카카오 로그인">카카오로 계속하기</button><div class="login-divider">또는</div><button class="social-login email" data-demo="이메일 로그인">이메일로 계속하기</button><p class="login-note">가입 후 60초 미리 듣기 지점에서<br>전체곡 감상을 이어갈 수 있어요.</p><a class="text-link" href="#home">먼저 음악 둘러보기 ${icon('arrow')}</a><span class="design-caption">로그인 화면 디자인 시안입니다.</span></section></div>`,
  studio:()=>`${heading('창작자 스튜디오','Studio lune님, 당신의 음악이 새로운 취향이 되고 있어요.',`<a class="primary-button" href="#upload">${icon('plus')}음원 업로드</a>`)}${tabs(studioTabs)}<div class="stats-grid">${[['누적 재생','35,240','이번 주 +18.6%'],['좋아요','2,008','이번 주 +12.4%'],['제작자 팔로워','1,200','이번 주 +86명'],['새 댓글','24','이번 주 남겨진 마음']].map(([label,value,detail])=>`<div class="stat-card"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`).join('')}</div><div class="surface section-space">${section('내 음악의 반응','예시 데이터')}${mockTable(['음악','재생','좋아요','댓글'],tracks.filter(t=>t.producer===0).map(t=>[`<a href="${songLink(t)}">${t.title}</a>`,t.plays,t.likes,t.comments]))}</div><div class="section-space surface">${section('청취자가 남긴 마음')}<p class="subtle">“보컬이 들어오는 순간, 공기가 달라지는 느낌이에요.”</p><a href="#song/0" class="text-link">댓글에 답하기 ${icon('arrow')}</a></div>`,
  upload:()=>`${heading('새로운 음악을 들려주세요','당신의 음악을 기다리는 누군가에게.',`<span class="pill">업로드 화면 시안</span>`)}${tabs(studioTabs,3)}<div class="upload-layout"><section class="surface upload-form"><h2>음원과 커버</h2><div class="file-zones"><button class="file-zone" data-demo="원본 음원 선택">${icon('upload')}<strong>원본 음원 선택</strong><span>WAV · FLAC · MP3</span></button><button class="file-zone" data-demo="커버 이미지 선택">${icon('plus')}<strong>앨범 커버 선택</strong><span>정사각형 이미지</span></button></div><h2>기본 정보</h2><div class="form-grid">${field('곡 제목','새로운 곡의 이름')}${field('AI 아티스트','NOVA')}${field('제작자 / Creator','Studio lune')}<label class="form-field">장르<select>${genres.slice(1).map(g=>`<option>${g}</option>`).join('')}</select></label>${field('태그','몽환적인, 밤, 드라이브')}${field('AI 제작 도구','Suno, Udio 등')}</div><label class="form-field">곡 소개<textarea rows="3" placeholder="이 음악에 담긴 이야기를 들려주세요."></textarea></label><label class="form-field">가사 <span class="optional">선택</span><textarea rows="3" placeholder="가사가 있는 곡이라면 입력해 주세요."></textarea></label><h2>제작 참여 정보</h2><label class="checkbox-line"><input type="checkbox" checked> AI를 활용해 생성한 음악입니다.</label><div class="participation"><span>직접 참여한 부분</span><label><input type="checkbox"> 작사</label><label><input type="checkbox"> 작곡</label><label><input type="checkbox"> 편곡</label></div><label class="checkbox-line rights-check"><input type="checkbox"> [필수] 업로드하는 음원과 커버에 필요한 권리를 보유하고 있습니다.</label><div class="inline-actions"><button class="small-button" data-demo="음원 임시 저장">임시 저장</button><button class="primary-button" data-demo="음원 등록">음원 등록 ${icon('arrow')}</button></div></section><aside class="upload-guide surface"><span class="eyebrow">BEFORE YOU SHARE</span><h2>상상에는<br>나만의 목소리를.</h2><p>AI 아티스트와 제작자 이름은 곡에 함께 표시됩니다.</p><p>다른 사람의 목소리를 허락 없이 모방하거나, 타인의 음악을 재업로드할 수 없어요.</p><p>음원·가사·커버의 권리를 확인하고 공유해 주세요.</p><a href="#song/0" class="text-link">곡 상세 화면 미리 보기 ${icon('arrow')}</a></aside></div>`,
  manage:()=>`${heading('내 음원','공개한 곡과 준비 중인 음악을 관리하세요.',`<a class="primary-button" href="#upload">${icon('plus')}음원 업로드</a>`)}${tabs(studioTabs,1)}<div class="surface">${mockTable(['음악','AI 아티스트','상태','관리'],tracks.filter(t=>t.producer===0).map(t=>[t.title,artistName(t),'<span class="status-published">공개 중</span>',`<button class="small-button" data-demo="음원 수정">수정</button>`]))}</div>`,
  admin:()=>`${heading('운영자 콘솔','콘텐츠 검토 화면 시안',`<span class="pill">ADMIN PREVIEW</span>`)}<div class="surface">${section('콘텐츠 검토','샘플 데이터')}${mockTable(['음악','제작자','검토 상태'],tracks.slice(0,3).map(t=>[t.title,producers[t.producer].name,'검토 대기']))}</div>`
};
function field(label,placeholder) { return `<label class="form-field">${label}<input placeholder="${placeholder}"></label>`; }
function comment(initial,name,cover,time,message,likes) {
  return `<article class="comment"><span class="comment-avatar ${cover}">${initial}</span><div class="comment-content"><strong>${name}</strong><span class="comment-age">2시간 전</span><p>${time?`<button class="timestamp" data-demo="${time} 구간으로 이동">${time}</button> `:''}${message}</p><div class="comment-actions"><button data-demo="로그인 후 댓글 좋아요">${icon('heart')} ${likes}</button><button data-demo="로그인 후 답글 작성">답글</button><button class="comment-more" aria-label="댓글 더 보기" data-demo="내 댓글 수정·삭제 및 신고 메뉴">···</button></div></div></article>`;
}
function decorate(){document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
function render(){
  const [requested,id,anchor]=route();
  const view=Object.hasOwn(views,requested)?requested:'home';
  document.getElementById('main').innerHTML=views[view](id);
  document.querySelectorAll('[data-view]').forEach(el=>{
    const group={artist:'artists',producer:'producers',upload:'studio',manage:'studio',playlist:'library'};
    const active=el.dataset.view===(group[view]||view);
    el.classList.toggle('active',active); if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('menu-toggle').setAttribute('aria-expanded','false');
  decorate();
  if(anchor==='comments')document.querySelector('.comments-panel')?.scrollIntoView({block:'start'});else window.scrollTo(0,0);
}
let toastTimer;
function toast(message){const el=document.getElementById('toast');el.textContent=message+' · 디자인 시안으로 실제 기능은 연결되지 않았어요.';el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3400);}
document.addEventListener('click',e=>{const button=e.target.closest('[data-demo]');if(button)toast(button.dataset.demo);});
document.addEventListener('submit',e=>{
  if(e.target.id!=='search-form')return;
  e.preventDefault();
  const query=document.getElementById('search-input').value.trim().toLowerCase();
  const items=tracks.filter(t=>[t.title,artistName(t),producers[t.producer].name,t.genre,t.mood].join(' ').toLowerCase().includes(query));
  document.getElementById('search-results').innerHTML=section('검색 화면 미리보기',`${items.length}곡 · 예시 데이터`)+(items.length?albums(items):'<div class="surface empty-design"><h2>일치하는 예시 음악이 없어요.</h2><p>NOVA, Studio lune 또는 R&B로 검색해 보세요.</p></div>');
});
document.getElementById('menu-toggle').addEventListener('click',()=>{const open=document.getElementById('sidebar').classList.toggle('open');document.getElementById('menu-toggle').setAttribute('aria-expanded',String(open));});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.getElementById('sidebar').classList.remove('open');document.getElementById('menu-toggle').setAttribute('aria-expanded','false');}});
window.addEventListener('hashchange',render);
render();
