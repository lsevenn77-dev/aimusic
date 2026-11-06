const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=s=>`${Math.floor((Number(s)||0)/60)}:${String(Math.floor((Number(s)||0)%60)).padStart(2,'0')}`;
const number=n=>Number(n||0).toLocaleString('ko-KR');
const genres=['전체',...AifectGenres.GENRES];
let me=null,authConfig={},library={likes:[],playlists:[],follows:[]},trackMap=new Map(),renderId=0,routeTracks=[],returnRoute='#home',toastTimer;
let accountReady=Promise.resolve(),followRevision=0,likeRevision=0;
const pendingFollows=new Map();
const pendingLikes=new Map(),apiReads=new Map();let apiRevision=0;
const audio=new Audio();audio.preload='metadata';audio.volume=.75;
// True inside the AIFECT Android/iOS app (Capacitor shell around this site).
const inApp=!!window.Capacitor?.isNativePlatform?.();
let queue=[],current=null,playSession=null,preview=false,heard=0,lastTick=0,repeatMode=0,shuffle=false,playSerial=0,pendingResume=null,reportBusy=false,restoredPosition=0;
try{pendingResume=JSON.parse(sessionStorage.getItem('aifect-player-resume')||localStorage.getItem('aifect-player-resume')||'null');const modes=JSON.parse(localStorage.getItem('aifect-player-modes')||'{}');shuffle=modes.shuffle===true;repeatMode=[0,1,2].includes(modes.repeatMode)?modes.repeatMode:0;}catch{}
function icons(){document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);el.removeAttribute('data-icon');});decorateNativeAudioPlay();}
function toast(message,kind=''){
 const el=$('#toast');if(!el)return;
 if(el.dataset.message===message&&el.classList.contains('show'))return;
 el.dataset.message=message;
 const tone=['success','error','info'].includes(kind)?kind:/실패|못했|없습니다|없어요|오류/.test(message)?'error':/저장했|저장됐|완료|보냈|추가했|삭제했|전송했/.test(message)?'success':'info';
 el.dataset.tone=tone;el.innerHTML='<span class="toast-symbol" aria-hidden="true">'+(tone==='success'?'✓':tone==='error'?'!':'♪')+'</span><span class="toast-copy">'+esc(message)+'</span>';
 el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),document.querySelector('[data-voice-room]')?2400:4500);
}
function invalidateReads(){apiRevision++;apiReads.clear();if(typeof clearNavigationSnapshots==='function')clearNavigationSnapshots();if(typeof clearCrewNavigation==='function')clearCrewNavigation();}
function invalidatesBrowseReads(path,method){
 if(method==='GET'||path==='/api/notifications/read'||/^\/api\/(playback|listens)\//.test(path))return false;
 // Delivery/read receipts cannot invalidate unrelated music or navigation.
 if(/^\/api\/dm\/[\w-]+$/.test(path)&&['POST','PATCH'].includes(method))return false;
 if(/^\/api\/crews\/[\w-]+\/messages$/.test(path)&&method==='POST')return false;
 return true;
}
function canCacheApiRead(path){return /^\/api\/(catalog|karaoke|search|playlists|cover-rankings|discovery(?:\/profiles)?|discover(?:\/[^?]+)?|community|library|history|follows|duets|me\/profile|followers\/[\w-]+|artists\/[\w-]+|producers\/[\w-]+)(?:\?|$)/.test(path);}
function peekApiRead(path,options={}){
 if(!canCacheApiRead(path))return null;
 const entry=apiReads.get((me?.id||'guest')+':'+path);
 return entry&&!entry.pending&&entry.revision===apiRevision&&(options.display?entry.displayUntil:entry.until)>Date.now()?structuredClone(entry.value):null;
}
async function api(path,method='GET',body,options={}){
 const read=method==='GET',mutates=invalidatesBrowseReads(path,method);
 if(mutates)invalidateReads();
 const account=me?.id||'guest',key=account+':'+path,revision=apiRevision;
 // Ten seconds, memory only, account scoped. Money, chat, permissions and studio always stay live.
 const reusable=canCacheApiRead(path);
 const prior=apiReads.get(key);
 if(read&&!options.fresh&&prior&&prior.revision===revision&&(prior.pending?!prior.signal?.aborted&&prior.signal===options.signal:prior.until>Date.now()))return structuredClone(await prior.promise);
 const entry={revision,pending:true,until:0,signal:options.signal};
 const request=(async()=>{
  try{const r=await fetch(path,{method,credentials:'same-origin',signal:options.signal,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});let data;try{data=await r.json();}catch{throw new Error('서버에 연결할 수 없습니다. 다시 시도해주세요.');}if(!r.ok){if((r.status===401||r.status===403)&&account===(me?.id||'guest')&&revision===apiRevision)invalidateReads();throw Object.assign(new Error(data.error||'다시 시도해주세요.'),{status:r.status});}return data;}
  finally{if(mutates)invalidateReads();}
 })();
 if(read){entry.promise=request;apiReads.set(key,entry);request.then(value=>{entry.pending=false;entry.value=structuredClone(value);entry.until=reusable?Date.now()+10000:0;entry.displayUntil=reusable?Date.now()+60000:0;if(!reusable&&apiReads.get(key)===entry)apiReads.delete(key);while(apiReads.size>60)apiReads.delete(apiReads.keys().next().value);},()=>{if(apiReads.get(key)===entry)apiReads.delete(key);});}
 return structuredClone(await request);
}
function remember(tracks){tracks.forEach(t=>trackMap.set(t.id,t));return tracks;}
const liked=id=>library.likes.some(t=>t.id===id);
const followed=(kind,id)=>library.follows.some(f=>f.kind===kind&&f.target_id===id);
function trackArtworkPath(t){
 // Older cached payloads can still carry a synthetic performer version.
 let source=t.artwork_id,version=t.cover_version;
 if(source===undefined){
  version=t.work_cover_version??version;
  if((t.work_has_cover??t.has_cover)&&!version?.startsWith('profile-'))source=t.id;
  else if(t.original_has_cover&&!t.original_cover_version?.startsWith('profile-')){source=t.original_id;version=t.original_cover_version;}
 }
 return source?`/media/${encodeURIComponent(source)}/cover?artwork=track&v=${encodeURIComponent(version||'original')}`:'/assets/aifect-mark.svg';
}
function cover(t,cls='album-art'){
 return `<div class="${cls} cover cover-custom"><img decoding="async" src="${esc(trackArtworkPath(t))}" alt="${esc(t.title||'작품')} 커버" loading="lazy"></div>`;
}
// Covers credit the singer's profile and link back to the original song.
const hasArtist=t=>t.kind!=='cover'&&(t.has_ai_artist!=null?!!t.has_ai_artist:!!t.artist_id&&!!t.artist&&!['없음','미등록','-','선택 안함','선택안함'].includes(t.artist.trim()));
const credits=t=>t.kind==='cover'?`<a href="#producer/${esc(t.producer_id)}">${userNickname(t.producer,{profileId:t.producer_id})}</a>${t.duet_partner_id?` & <a href="#producer/${esc(t.duet_partner_id)}">${userNickname(t.duet_partner,{profileId:t.duet_partner_id})}</a>`:''} ${t.cover_mode==='duet'?'듀엣':'솔로 커버'} · <a href="#song/${esc(t.original_id)}">원곡 듣기</a>`:hasArtist(t)?`<a href="#artist/${esc(t.artist_id)}">${userNickname(t.artist,{artistId:t.artist_id,entityType:'artist'})}</a>`:`<a href="#producer/${esc(t.producer_id)}">${userNickname(t.producer||'창작자',{profileId:t.producer_id})}</a>`;
const heading=(title,desc='')=>`<div class="page-heading"><div><span class="eyebrow">AI + EFFECT</span><h1>${title}</h1>${desc?`<p>${desc}</p>`:''}</div><span class="free-badge">${icon('sparkles')} 전체곡 무료 감상</span></div>`;
const empty=(title,desc,href='#upload',label='첫 곡 업로드하기')=>`<div class="surface empty-design"><div class="empty-symbol">${icon('sparkles')}</div><h2>${title}</h2><p>${desc}</p><a href="${href}" class="primary-button">${label} ${icon('arrow')}</a></div>`;
const section=(title,href)=>`<div class="section-heading"><h2>${title}</h2>${href?`<a href="${href}">모두 보기 ${icon('chevron')}</a>`:''}</div>`;
function card(t){const artist=t.kind!=='cover'&&hasArtist(t);return `<article class="album-card"><div class="album-art-wrap"><a href="#song/${esc(t.id)}">${cover(t)}</a><button class="card-play" data-play="${esc(t.id)}" aria-label="${esc(t.title)} 재생">${icon('ui-play-action',36)}</button></div><div class="album-title-row"><a class="album-title" href="#song/${esc(t.id)}">${esc(t.title)}</a><button type="button" class="card-more" data-track-menu="${esc(t.id)}" aria-label="${esc(t.title)} 더보기">${icon('ui-menu-action')}</button></div><a class="album-artist" href="#${artist?'artist/'+esc(t.artist_id):'producer/'+esc(t.producer_id)}">${t.kind==='cover'?trackPerformers(t):trackNickname(t)}${t.kind==='cover'?'<b class="ai-mini cover-mini">COVER</b>':''}</a></article>`;}
function grid(tracks){remember(tracks);return tracks.length?`<div class="album-grid live-album-grid">${tracks.map(card).join('')}</div>`:empty('새로운 음악을 기다리고 있어요','당신의 첫 곡으로 AIFECT의 플레이리스트를 시작해보세요.');}
function songTable(tracks,{removable=null,chart=false}={}){
 remember(tracks);if(!tracks.length)return empty('아직 음악이 없어요','새로운 곡을 발견하고 나만의 취향을 채워보세요.','#discover','음악 발견하기');
 return '<div class="music-list-region"><div class="song-table '+(chart?'song-table-chart':'')+'"><div class="song-table-head" aria-hidden="true"><span>#</span><span>곡 정보</span><span>좋아요</span><span>댓글</span><span>재생수</span>'+(chart?'<span>변동</span>':'')+'<span>듣기</span><span></span></div>'+tracks.map((t,i)=>{
 const id=esc(t.id),title=esc(t.title),isLiked=liked(t.id);
 const likes=chart?(t.chart_likes??t.likes):t.likes,comments=chart?(t.chart_comments??t.comments):t.comments,plays=chart?(t.chart_plays??t.plays):t.plays;
 const likeCell=chart?'<span class="list-action metric-inline song-table-stat song-table-like" aria-label="기간 내 좋아요 '+number(likes)+'개">'+icon('ui-heart')+'<span>'+number(likes)+'</span></span>':'<button class="list-action metric-inline song-table-stat song-table-like '+(isLiked?'is-active':'')+'" data-like="'+id+'" aria-label="'+title+' 좋아요" aria-pressed="'+isLiked+'">'+icon('ui-heart')+'<span data-like-count>'+number(likes)+'</span></button>';
 return '<article data-list-row class="song-table-row" data-song-row="'+id+'"><span class="song-table-position">'+(chart?t.chart_rank||i+1:i+1)+'</span><div class="song-table-info"><a class="song-table-cover" href="#song/'+id+'" aria-label="'+title+' 곡 정보">'+cover(t,'mini-cover')+'</a><div><a href="#song/'+id+'"><strong>'+title+'</strong></a><span>'+credits(t)+'</span></div></div>'+likeCell+'<a class="list-action metric-inline song-table-stat song-table-comments" href="#song/'+id+'?comments=1" aria-label="댓글 '+number(comments)+'개">'+icon('ui-comment')+'<span>'+number(comments)+'</span></a><span class="metric-inline song-table-stat song-table-plays" aria-label="재생 '+number(plays)+'회">'+icon('ui-plays')+number(plays)+'</span>'+(chart?chartMovementHTML(t):'')+'<button class="list-action song-table-play" data-play="'+id+'" aria-label="'+title+' 재생">'+icon('ui-play-action')+'</button><div class="song-table-tools">'+(removable?'<button class="list-action icon-button" data-remove-track="'+id+'" data-playlist="'+esc(removable)+'" aria-label="플레이리스트에서 제거">'+icon('ui-minus-action')+'</button>':'')+'<button class="list-action icon-button" data-track-menu="'+id+'" aria-label="'+title+' 더보기">'+icon('ui-menu-action')+'</button></div></article>';
 }).join('')+'</div></div>';
}
function list(tracks,removable=null){return songTable(tracks,{removable});}

function identityCards(items,kind){return items.length?`<div class="artist-grid">${items.map(p=>`<article class="artist-card surface"><a href="#${p.public_id&&!p.id?'member/'+esc(p.public_id):kind+'/'+esc(p.id)}">${portrait(p,kind)}<h3>${userNickname(p.name,{profileId:kind==='artist'?null:p.id,artistId:p.id,entityType:kind,userId:p.user_id})}</h3>${p.public_id?`<p class="mp-public-id">ID · ${esc(p.public_id)}</p>`:''}</a><p>${esc(p.bio||'새로운 음악으로 만나요.')}</p><div class="card-follow"><span>${p.followers==null?'팔로잉':number(p.followers)+' 팔로워'}</span>${p.id?`<button class="small-button" data-follow="${kind}/${p.id}">${followed(kind,p.id)?'팔로잉':'팔로우'} ${icon('plus')}</button>`:''}</div></article>`).join('')}</div>`:empty('새로운 창작자를 기다려요','음원을 공개하면 아티스트와 제작자 프로필이 여기에 표시됩니다.');}
function gate(){return heading('나의 음악을 시작하세요')+empty('로그인이 필요해요','무료 회원가입 후 전체곡 듣기, 보관함, 업로드를 이용할 수 있습니다.','#account','로그인 · 회원가입');}
async function refreshLibrary(fresh=false,readApi=api){const uid=me?.id,readRevision=apiRevision,revision=followRevision,likesVersion=likeRevision,data=me?await readApi('/api/library','GET',undefined,{fresh}):{likes:[],playlists:[],follows:[]};if(uid!==me?.id||readRevision!==apiRevision)return;if(revision!==followRevision||pendingFollows.size)data.follows=library.follows;if(likesVersion!==likeRevision||pendingLikes.size)data.likes=library.likes;library=data;remember(library.likes);setMembership(library.membership);paintInteractions();if(typeof updateHomeAccount==='function')updateHomeAccount();}
function paintInteractions(){
 document.querySelectorAll('[data-track-like-label]').forEach(label=>{label.textContent=liked(label.closest('[data-like]').dataset.like)?'좋아요 해제':'좋아요';});
 document.querySelectorAll('[data-like]').forEach(b=>{const tid=b.dataset.like;b.classList.toggle('is-active',liked(tid));b.setAttribute('aria-pressed',String(liked(tid)));b.disabled=pendingLikes.has(tid);const count=trackMap.get(tid)?.likes,label=b.querySelector('[data-like-count]');if(label&&count!=null){label.textContent=number(count);b.setAttribute('aria-label',`좋아요 ${number(count)}개`);}});
 document.querySelectorAll('[data-follow]').forEach(b=>{const [kind,id]=b.dataset.follow.split('/');paintFollowState(b.dataset.follow,followed(kind,id),pendingFollows.has(b.dataset.follow));});
}
async function toggleLike(button){
 if(!me)return askLogin();const tid=button.dataset.like;if(pendingLikes.has(tid))return;
 const uid=me.id,wasLiked=liked(tid),prior=trackMap.get(tid),oldCount=Number(prior?.likes||0),oldEntry=library.likes.find(t=>t.id===tid);
 const paint=(active,count)=>{library.likes=library.likes.filter(t=>t.id!==tid);if(active)library.likes.unshift({...oldEntry,...prior,id:tid,likes:count});if(prior)trackMap.set(tid,{...prior,likes:count});likeRevision++;paintInteractions();document.querySelectorAll('[data-stat-track]').forEach(s=>{if(s.dataset.statTrack!==tid)return;const item=s.children[1];if(item){item.setAttribute('aria-label',`좋아요 ${number(count)}개`);const span=item.querySelector('span');if(span)span.textContent=number(count);}});};
 pendingLikes.set(tid,uid);paint(!wasLiked,Math.max(0,oldCount+(wasLiked?-1:1)));
 try{await api(`/api/tracks/${tid}/like`,wasLiked?'DELETE':'PUT');if(me?.id!==uid)return;toast(wasLiked?'좋아요를 취소했습니다.':'좋아요에 저장했습니다.');if(typeof refreshCommunityRanking==='function')refreshCommunityRanking();}
 catch(e){if(me?.id===uid)paint(wasLiked,oldCount);throw e;}
 finally{pendingLikes.delete(tid);if(me?.id===uid)paintInteractions();}
}
function updateFollowLocal(kind,id,following,profile){
 library.follows=library.follows.filter(f=>!(f.kind===kind&&f.target_id===id));
 if(following)library.follows.unshift({...profile,kind,target_id:id});
 followRevision++;
}
function paintFollowState(key,following,busy,followers){
 document.querySelectorAll('[data-follow]').forEach(button=>{
  if(button.dataset.follow!==key)return;
  const label=button.querySelector('[data-follow-label]')||button;
  label.textContent=label.dataset.followLabel||(following?'팔로잉':'팔로우');
  button.disabled=busy;
  button.setAttribute('aria-pressed',String(following));
  button.setAttribute('aria-busy',String(busy));
 });
 if(followers!==undefined)document.querySelectorAll('[data-followers]').forEach(node=>{if(node.dataset.followers!==key)return;node.dataset.count=String(followers);const value=node.querySelector('[data-follow-count]');if(value)value.textContent=number(followers);else node.textContent=number(followers)+' 팔로워';});
}
async function toggleFollow(button){
 if(!me)return askLogin();const key=button.dataset.follow;if(pendingFollows.has(key))return;
 const [kind,id]=key.split('/'),uid=me.id,prior=library.follows.find(f=>f.kind===kind&&f.target_id===id),following=!prior;
 const counter=[...document.querySelectorAll('[data-followers]')].find(node=>node.dataset.followers===key),oldCount=counter?Number(counter.dataset.count):undefined;
 pendingFollows.set(key,uid);updateFollowLocal(kind,id,following,prior||{name:button.closest('article,section')?.querySelector('h2,h3')?.textContent||''});paintFollowState(key,following,true,oldCount===undefined?undefined:Math.max(0,oldCount+(following?1:-1)));
 try{const result=await api('/api/'+(kind==='artist'?'artists':'producers')+'/'+id+'/follow',following?'PUT':'DELETE');if(me?.id!==uid)return;updateFollowLocal(kind,id,result.following,result.profile);paintFollowState(key,result.following,false,result.followers);if(typeof window!=='undefined'&&window.dispatchEvent)window.dispatchEvent(new CustomEvent('aifect:follow-saved',{detail:{kind,id,following:result.following}}));}
 catch(error){if(me?.id===uid){updateFollowLocal(kind,id,!!prior,prior);paintFollowState(key,!!prior,false,oldCount);}throw error;}
 finally{if(pendingFollows.get(key)===uid)pendingFollows.delete(key);if(me?.id===uid)paintFollowState(key,followed(kind,id),false);}
}
const DEFAULT_AVATAR='/assets/default-avatar.svg';
function avatarImage(p={},kind='producer',allowPreview=true,decorate=true){
 const id=p.profile_id||p.id,src=id&&p.image_version?'/media/'+kind+'/'+encodeURIComponent(id)+'?v='+encodeURIComponent(p.image_version):DEFAULT_AVATAR;
 const preview=allowPreview&&id&&['producer','artist'].includes(kind)?' data-profile-preview="'+esc(kind==='artist'?'artist:'+id:p.profile_id||(p===me?me.profile_id:p.id)||'self')+'" tabindex="0" role="button" aria-haspopup="dialog"':'';
 return '<img class="profile-avatar-image"'+(decorate&&kind==='producer'&&id?' data-avatar-profile="'+esc(p.profile_id||(p===me?me.profile_id:p.id))+'"':'')+preview+' src="'+esc(src)+'" alt="'+esc(p.name||'사용자')+' 프로필 사진" loading="lazy" decoding="async">';
}
// Keep every photo surface usable when an old or unavailable upload fails to load.
document.addEventListener('error',event=>{
 const image=event.target;
 if(image.matches?.('.cover img:not(.profile-avatar-image)')&&image.getAttribute('src')!=='/assets/aifect-mark.svg'){image.src='/assets/aifect-mark.svg';return;}
 if(!image.matches?.('img.profile-avatar-image'))return;
 if(image.getAttribute('src')!==DEFAULT_AVATAR)image.src=DEFAULT_AVATAR;
 else image.hidden=true;
},true);
function updateAccount(){
 $('.header-login').href=me?'#profile':'#account';
 const identity=me?`<span class="sidebar-account-copy"><span class="sidebar-account-line"><strong>${userNickname(me.name,{profileId:me.profile_id,userId:me.id})}</strong><span class="sidebar-account-plan${member.plan==='premium'?' is-premium':''}">${member.plan==='premium'?'PREMIUM':'FREE'}</span></span><small>${me.public_id?'ID #'+esc(me.public_id):'ID 발급 확인 중'}</small></span>`:`<span class="avatar profile-avatar ${playerAvatarClass(me)}">${avatarImage({})}${playerBadgeHTML(me)}</span><span><strong>무료로 시작하기</strong><small>로그인 · 회원가입</small></span>`;
 $('.profile').innerHTML=identity+icon('chevron');$('.header-login').textContent=me?'내 계정':'로그인';if(typeof refreshActivityBadge==='function')void refreshActivityBadge();
}
function askLogin(){returnRoute=location.hash;saveResume();location.hash='account';toast('무료로 가입하고 음악을 이어 들어보세요.');return false;}
function saveResume(){saveQueue();try{localStorage.setItem('aifect-player-modes',JSON.stringify({shuffle,repeatMode}));if(current){pendingResume={id:current.id,time:playSession?(preview?Math.min(audio.currentTime,60):audio.currentTime):restoredPosition};const value=JSON.stringify(pendingResume);sessionStorage.setItem('aifect-player-resume',value);localStorage.setItem('aifect-player-resume',value);}}catch{}}

// Presentation only: preserve gift surfaces, dialog events and form handlers.
function prepareCompactPopup(modal,content){
 const excluded=content.querySelector('.gift-dialog,.gift-success,.gift-recipient-dialog,.shop-checkout,.shop-theme-preview,#gift-dialog-retry,#mp-inventory-buy,#mp-inventory-recipient');
 modal.classList.toggle('compact-popup',!excluded);
 if(excluded){modal.setAttribute('aria-label','AIFECT');return;}
 const label=content.querySelector('.popup-prompt,h2');
 modal.setAttribute('aria-label',label?.textContent?.trim()||'AIFECT');
}
function dialog(html){const modal=$('#dialog'),content=$('#dialog-content');if(!modal._giftSurfaceCleanup){modal.addEventListener('close',function(){if(!this.open)this.classList.remove('gift-sheet');});modal._giftSurfaceCleanup=true;}content.innerHTML=html;modal.classList.toggle('gift-sheet',!!content.querySelector('.gift-dialog,.gift-success'));if(typeof prepareCompactPopup==='function')prepareCompactPopup(modal,content);if(!modal.open){if(typeof voiceController!=='undefined'&&voiceController?.joined&&!voiceController.closed&&voiceController.host?.isConnected)voiceController.adoptRoomPopup(modal);else modal.showModal();}decorateNativeAudioPlay();}
// Match content padding to the actual player height, including wrapped controls and safe areas.
if(typeof ResizeObserver==='function')new ResizeObserver(entries=>{const h=entries[0].target.getBoundingClientRect().height;if(h)document.body.style.setProperty('--player-height',Math.ceil(h)+'px');}).observe($('.player'));
function setPlayerVisible(visible){$('.player').hidden=!visible;document.body.classList.toggle('has-player',visible);}
function countAdListening(){
 if(current&&playSession&&!window.AifectAudioAds?.active)window.AifectAudioAds?.completed({session:playSession,preview,duration:audio.duration,listened:AifectAudioAdsCore.playedSeconds(audio.played)});
}
function closePlayer(){
 const restoreFocus=$('.player').contains(document.activeElement);
 countAdListening();
 ++playSerial;window.AifectAudioAds?.cancel();audio.pause();void report();
 current=null;playSession=null;preview=false;heard=0;lastTick=0;pendingResume=null;
 audio.removeAttribute('src');audio.load();
 try{sessionStorage.removeItem('aifect-player-resume');localStorage.removeItem('aifect-player-resume');}catch{}
 setCurrentLyrics(null);$('#elapsed').textContent='0:00';$('#duration').textContent='0:00';$('#seek').value=0;$('#seek').max=0;
 window.AifectPlayerShell?.close();setPlayerVisible(false);
 if(restoreFocus)$('#main').focus({preventScroll:true});
}
function formField(label,name,type='text',value='',extra=''){return `<label class="form-field">${label}<input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;}
async function play(tid,tracks=null,start=0){
 countAdListening();
 const serial=++playSerial;if(!window.AifectAudioAds?.active)audio.pause();report();
 await window.AifectAudioAds?.beforeTrack();if(serial!==playSerial)return;
 const [{track:t},session]=await Promise.all([api('/api/tracks/'+tid),api('/api/playback/'+tid,'POST')]);if(serial!==playSerial)return;remember([t]);
 restoredPosition=0;current=t;playSession=session.id;preview=session.preview;heard=0;lastTick=0;
 if(tracks?.length)queue=[...new Set(tracks.map(t=>t.id))];else if(!queue.includes(tid))queue=[tid];saveQueue();
 audio.src=session.src;
 renderPlayerActions(t);
 $('#listen-mode').textContent=preview?'60초 미리 듣기':session.bitrate_kbps===256?'AAC 256':'AAC 128';$('#seek').max=preview?Math.min(t.duration,60):t.duration;$('#duration').textContent=playerClock($('#seek').max);
 audio.currentTime=Math.min(Math.max(0,Number(start)||0),preview?59.9:t.duration);
 setCurrentLyrics(t);refreshLyricsPanel();setPlayerVisible(true);
 try{await audio.play();}catch(e){if(e.name==='NotAllowedError')toast('재생 버튼을 눌러 음악을 이어 들어보세요.');else if(e.name!=='AbortError')throw new Error('음원을 재생할 수 없습니다. 잠시 후 다시 시도해주세요.');}
}
async function resumeAfterLogin(){
 // Restore metadata only. Playback sessions, ads and audio.play require a user action.
 if(!pendingResume||current)return;
 const saved=pendingResume,serial=playSerial;
 const {track:t}=await api('/api/tracks/'+encodeURIComponent(saved.id));
 if(serial!==playSerial||current)return;
 remember([t]);current=t;preview=!me;restoredPosition=Math.max(0,Math.min(Number(saved.time)||0,preview?Math.min(t.duration,60):t.duration));
 audio.pause();audio.currentTime=restoredPosition;renderPlayerActions(t);setCurrentLyrics(t);refreshLyricsPanel();
 $('#seek').max=preview?Math.min(t.duration,60):t.duration;$('#seek').value=restoredPosition;
 $('#elapsed').textContent=playerClock(restoredPosition);$('#duration').textContent=playerClock($('#seek').max);
 $('#listen-mode').textContent=preview?'60초 미리 듣기':'';
 $('#play-toggle').innerHTML=icon('player-play');$('#play-toggle').setAttribute('aria-label','재생');
 window.AifectPlayerShell?.paintModes();setPlayerVisible(true);
}

async function report(){if(!playSession||heard<1||reportBusy)return;reportBusy=true;try{await api('/api/listens/'+playSession,'PATCH',{seconds:Math.floor(heard)});}catch{}finally{reportBusy=false;}}
async function nextTrack(delta,automatic=false){if(!queue.length){if(automatic)setPlayerVisible(false);return;}let i=queue.indexOf(current?.id);if(shuffle&&queue.length>1){const choices=queue.filter(id=>id!==current?.id);await play(choices[Math.floor(Math.random()*choices.length)]);return;}i+=delta;if(automatic&&i>=queue.length&&!repeatMode){setPlayerVisible(false);return;}i=(i+queue.length)%queue.length;await play(queue[i]);}

function portrait(p,kind){return '<div class="artist-portrait cover cover-custom profile-avatar'+(kind==='producer'?playerAvatarClass(p):'')+'">'+avatarImage(p,kind)+(kind==='producer'?playerBadgeHTML(p):'')+'</div>';}

function trackStats(t,cls='card-stats'){return '<div class="public-track-stats '+cls+'" data-stat-track="'+t.id+'" aria-label="곡 활동"><span aria-label="재생 '+number(t.plays)+'회">'+icon('ui-plays')+'<span>'+number(t.plays)+'</span></span><span aria-label="좋아요 '+number(t.likes)+'개">'+icon('ui-heart')+'<span>'+number(t.likes)+'</span></span><a href="#song/'+t.id+'?comments=1" aria-label="댓글 '+number(t.comments)+'개 보기">'+icon('ui-comment')+'<span>'+number(t.comments)+'</span></a></div>';}


// A decorative overlay leaves the native play hit area, accessibility, keyboard,
// timeline, volume and media menu in the browser's control.
function decorateNativeAudioPlay(){
 if(typeof CSS==='undefined'||!CSS.supports?.('selector(audio::-webkit-media-controls-play-button)'))return;
 document.querySelectorAll('audio[controls]').forEach(media=>{
  if(media.parentElement.classList.contains('native-audio-play'))return;
  const frame=document.createElement('span'),art=document.createElement('span');
  frame.className='native-audio-play';art.className='native-audio-play-art';
  art.setAttribute('aria-hidden','true');art.innerHTML=icon('audio-play');
  media.before(frame);frame.append(media,art);
  const sync=()=>{frame.classList.toggle('is-playing',!media.paused);art.style.left=(media.offsetLeft+12)+'px';art.style.top=(media.offsetTop+media.offsetHeight/2)+'px';};
  for(const event of ['play','pause','ended','emptied'])media.addEventListener(event,sync);
  sync();
 });
}
