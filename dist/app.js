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
let queue=[],current=null,playSession=null,preview=false,heard=0,lastTick=0,repeatMode=0,shuffle=false,playSerial=0,pendingResume=null,reportBusy=false;
try{pendingResume=JSON.parse(sessionStorage.getItem('aifect-player-resume')||'null');}catch{}
function icons(){document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);el.removeAttribute('data-icon');});}
function toast(message,kind=''){
 const el=$('#toast');if(!el)return;
 const tone=['success','error','info'].includes(kind)?kind:/실패|못했|없습니다|없어요|오류/.test(message)?'error':/저장했|저장됐|완료|보냈|추가했|삭제했|전송했/.test(message)?'success':'info';
 el.dataset.tone=tone;el.innerHTML='<span class="toast-symbol" aria-hidden="true">'+(tone==='success'?'✓':tone==='error'?'!':'♪')+'</span><span class="toast-copy">'+esc(message)+'</span>';
 el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4500);
}
function invalidateReads(){apiRevision++;apiReads.clear();if(typeof clearNavigationSnapshots==='function')clearNavigationSnapshots();if(typeof clearCrewNavigation==='function')clearCrewNavigation();}
function invalidatesBrowseReads(path,method){
 if(method==='GET'||path==='/api/notifications/read'||/^\/api\/(playback|listens)\//.test(path))return false;
 // Delivery/read receipts cannot invalidate unrelated music or navigation.
 if(/^\/api\/dm\/[\w-]+$/.test(path)&&['POST','PATCH'].includes(method))return false;
 if(/^\/api\/crews\/[\w-]+\/messages$/.test(path)&&method==='POST')return false;
 return true;
}
function canCacheApiRead(path){return /^\/api\/(catalog|karaoke|search|playlists|cover-rankings|discovery|discover(?:\/[^?]+)?|community|library|history|follows|duets|me\/profile|followers\/[\w-]+|artists\/[\w-]+|producers\/[\w-]+)(?:\?|$)/.test(path);}
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
 if(read&&!options.fresh&&prior&&prior.revision===revision&&(prior.pending||prior.until>Date.now()))return structuredClone(await prior.promise);
 const entry={revision,pending:true,until:0};
 const request=(async()=>{
  try{const r=await fetch(path,{method,credentials:'same-origin',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});let data;try{data=await r.json();}catch{throw new Error('서버에 연결할 수 없습니다. 다시 시도해주세요.');}if(!r.ok){if((r.status===401||r.status===403)&&account===(me?.id||'guest')&&revision===apiRevision)invalidateReads();throw Object.assign(new Error(data.error||'다시 시도해주세요.'),{status:r.status});}return data;}
  finally{if(mutates)invalidateReads();}
 })();
 if(read){entry.promise=request;apiReads.set(key,entry);request.then(value=>{entry.pending=false;entry.value=structuredClone(value);entry.until=reusable?Date.now()+10000:0;entry.displayUntil=reusable?Date.now()+60000:0;if(!reusable&&apiReads.get(key)===entry)apiReads.delete(key);while(apiReads.size>60)apiReads.delete(apiReads.keys().next().value);},()=>{if(apiReads.get(key)===entry)apiReads.delete(key);});}
 return structuredClone(await request);
}
function remember(tracks){tracks.forEach(t=>trackMap.set(t.id,t));return tracks;}
const liked=id=>library.likes.some(t=>t.id===id);
const followed=(kind,id)=>library.follows.some(f=>f.kind===kind&&f.target_id===id);
function trackArtworkPath(t){
 if(t.kind==='cover')return '/media/'+encodeURIComponent(t.id)+'/cover?v='+encodeURIComponent(t.cover_version?.startsWith('profile-')?t.cover_version:'profile-'+(t.producer_image_version||'default-v1'));
 const art=t.has_cover?[t.id,t.cover_version]:t.original_has_cover?[t.original_id,t.original_cover_version]:null;
 return art?'/media/'+encodeURIComponent(art[0])+'/cover?v='+encodeURIComponent(art[1]||'original'):'';
}
function cover(t,cls='album-art'){const src=trackArtworkPath(t),performer=t.kind==='cover';return `<div class="${cls} cover cover-${src?'custom':'lime'}${performer?' cover-performer':''}">${src?`<img ${performer?'class="profile-avatar-image" ':''}decoding="async" src="${esc(src)}" alt="${esc(performer?(t.producer||t.artist||'사용자')+' 프로필 사진':t.title+' 커버')}" loading="lazy">`:`<span class="cover-word">${esc((t.title||'A').slice(0,2))}</span>`}</div>`;}
// Covers credit the singer's profile and link back to the original song.
const hasArtist=t=>t.kind!=='cover'&&(t.has_ai_artist!=null?!!t.has_ai_artist:!!t.artist_id&&!!t.artist&&!['없음','미등록','-','선택 안함','선택안함'].includes(t.artist.trim()));
const credits=t=>t.kind==='cover'?`<a href="#producer/${esc(t.producer_id)}">${esc(t.producer)}</a>${t.duet_partner_id?` & <a href="#producer/${esc(t.duet_partner_id)}">${esc(t.duet_partner)}</a>`:''} ${t.cover_mode==='duet'?'듀엣':'솔로 커버'} · <a href="#song/${esc(t.original_id)}">원곡 듣기</a>`:hasArtist(t)?`<a href="#artist/${esc(t.artist_id)}">${esc(t.artist)}</a>`:`<a href="#producer/${esc(t.producer_id)}">${esc(t.producer||'창작자')}</a>`;
const heading=(title,desc='')=>`<div class="page-heading"><div><span class="eyebrow">AI + EFFECT</span><h1>${title}</h1>${desc?`<p>${desc}</p>`:''}</div><span class="free-badge">${icon('sparkles')} 전체곡 무료 감상</span></div>`;
const empty=(title,desc,href='#upload',label='첫 곡 업로드하기')=>`<div class="surface empty-design"><div class="empty-symbol">${icon('sparkles')}</div><h2>${title}</h2><p>${desc}</p><a href="${href}" class="primary-button">${label} ${icon('arrow')}</a></div>`;
const section=(title,href)=>`<div class="section-heading"><h2>${title}</h2>${href?`<a href="${href}">모두 보기 ${icon('chevron')}</a>`:''}</div>`;
function card(t){const artist=t.kind!=='cover'&&hasArtist(t);return `<article class="album-card"><div class="album-art-wrap"><a href="#song/${esc(t.id)}">${cover(t)}</a><button class="card-play" data-play="${esc(t.id)}" aria-label="${esc(t.title)} 재생"><img src="/assets/card-play.svg" width="36" height="36" alt=""></button></div><div class="album-title-row"><a class="album-title" href="#song/${esc(t.id)}">${esc(t.title)}</a><button type="button" class="card-more" data-track-menu="${esc(t.id)}" aria-label="${esc(t.title)} 더보기"><svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 5h12M4 10h12M4 15h12"/></svg></button></div><a class="album-artist" href="#${artist?'artist/'+esc(t.artist_id):'producer/'+esc(t.producer_id)}">${esc(artist?t.artist:t.producer)}${t.kind==='cover'?'<b class="ai-mini cover-mini">COVER</b>':''}</a><span class="album-meta">${esc(t.genre)} · ${time(t.duration)}</span></article>`;}
function grid(tracks){remember(tracks);return tracks.length?`<div class="album-grid live-album-grid">${tracks.map(card).join('')}</div>`:empty('새로운 음악을 기다리고 있어요','당신의 첫 곡으로 AIFECT의 플레이리스트를 시작해보세요.');}
function songTable(tracks,{removable=null,chart=false}={}){
 remember(tracks);if(!tracks.length)return empty('아직 음악이 없어요','새로운 곡을 발견하고 나만의 취향을 채워보세요.','#discover','음악 발견하기');
 return '<div class="song-table '+(chart?'song-table-chart':'')+'"><div class="song-table-head" aria-hidden="true"><span>#</span><span>곡 정보</span><span>좋아요</span><span>댓글</span><span>재생수</span>'+(chart?'<span>이전 순위</span><span>변동</span>':'<span>길이</span>')+'<span>듣기</span><span></span></div>'+tracks.map((t,i)=>{
 const id=esc(t.id),title=esc(t.title),isLiked=liked(t.id),previous=t.previous_rank;
 const likes=chart?(t.chart_likes??t.likes):t.likes,comments=chart?(t.chart_comments??t.comments):t.comments,plays=chart?(t.chart_plays??t.plays):t.plays;
 const likeCell=chart?'<span class="song-table-stat song-table-like" aria-label="기간 내 좋아요 '+number(likes)+'개">'+icon('heart')+'<span>'+number(likes)+'</span></span>':'<button class="song-table-stat song-table-like '+(isLiked?'is-active':'')+'" data-like="'+id+'" aria-label="'+title+' 좋아요" aria-pressed="'+isLiked+'">'+icon('heart')+'<span data-like-count>'+number(likes)+'</span></button>';
 return '<article class="song-table-row" data-song-row="'+id+'"><span class="song-table-position">'+(chart?t.chart_rank||i+1:i+1)+'</span><div class="song-table-info"><a class="song-table-cover" href="#song/'+id+'" aria-label="'+title+' 곡 정보">'+cover(t,'mini-cover')+'</a><div><a href="#song/'+id+'"><strong>'+title+'</strong></a><span>'+credits(t)+'</span></div></div>'+likeCell+'<a class="song-table-stat song-table-comments" href="#song/'+id+'?comments=1" aria-label="댓글 '+number(comments)+'개">'+icon('message')+'<span>'+number(comments)+'</span></a><span class="song-table-stat song-table-plays" aria-label="재생 '+number(plays)+'회">'+icon('play')+number(plays)+'</span>'+(chart?'<span class="song-table-previous">'+(previous==null?'—':number(previous))+'</span>'+chartMovementHTML(t):'<span class="song-table-duration">'+time(t.duration)+'</span>')+'<button class="song-table-play" data-play="'+id+'" aria-label="'+title+' 재생">'+icon('play')+'</button><div class="song-table-tools"><button class="icon-button" data-track-menu="'+id+'" aria-label="'+title+' 더보기">⋯</button>'+(removable?'<button class="icon-button" data-remove-track="'+id+'" data-playlist="'+esc(removable)+'" aria-label="플레이리스트에서 제거">×</button>':'')+'</div></article>';
 }).join('')+'</div>';
}
function list(tracks,removable=null){return songTable(tracks,{removable});}

function identityCards(items,kind){return items.length?`<div class="artist-grid">${items.map(p=>`<article class="artist-card surface"><a href="#${kind}/${p.id}">${portrait(p,kind)}<h3>${esc(p.name)}</h3></a><p>${esc(p.bio||'새로운 음악으로 만나요.')}</p><div class="card-follow"><span>${p.followers==null?'팔로잉':number(p.followers)+' 팔로워'}</span><button class="small-button" data-follow="${kind}/${p.id}">${followed(kind,p.id)?'팔로잉':'팔로우'} ${icon('plus')}</button></div></article>`).join('')}</div>`:empty('새로운 창작자를 기다려요','음원을 공개하면 아티스트와 제작자 프로필이 여기에 표시됩니다.');}
function gate(){return heading('나의 음악을 시작하세요')+empty('로그인이 필요해요','무료 회원가입 후 전체곡 듣기, 보관함, 업로드를 이용할 수 있습니다.','#account','로그인 · 회원가입');}
async function refreshLibrary(fresh=false){const uid=me?.id,readRevision=apiRevision,revision=followRevision,likesVersion=likeRevision,data=me?await api('/api/library','GET',undefined,{fresh}):{likes:[],playlists:[],follows:[]};if(uid!==me?.id||readRevision!==apiRevision)return;if(revision!==followRevision||pendingFollows.size)data.follows=library.follows;if(likesVersion!==likeRevision||pendingLikes.size)data.likes=library.likes;library=data;remember(library.likes);setMembership(library.membership);paintInteractions();if(typeof updateHomeAccount==='function')updateHomeAccount();}
function paintInteractions(){
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
 document.querySelectorAll('[data-follow]').forEach(button=>{if(button.dataset.follow!==key)return;button.textContent=following?'팔로잉':'팔로우';button.disabled=busy;button.setAttribute('aria-pressed',String(following));button.setAttribute('aria-busy',String(busy));});
 if(followers!==undefined)document.querySelectorAll('[data-followers]').forEach(node=>{if(node.dataset.followers!==key)return;node.dataset.count=String(followers);node.textContent=number(followers)+' 팔로워';});
}
async function toggleFollow(button){
 if(!me)return askLogin();const key=button.dataset.follow;if(pendingFollows.has(key))return;
 const [kind,id]=key.split('/'),uid=me.id,prior=library.follows.find(f=>f.kind===kind&&f.target_id===id),following=!prior;
 const counter=[...document.querySelectorAll('[data-followers]')].find(node=>node.dataset.followers===key),oldCount=counter?Number(counter.dataset.count):undefined;
 pendingFollows.set(key,uid);updateFollowLocal(kind,id,following,prior||{name:button.closest('article,section')?.querySelector('h2,h3')?.textContent||''});paintFollowState(key,following,true,oldCount===undefined?undefined:Math.max(0,oldCount+(following?1:-1)));
 try{const result=await api('/api/'+(kind==='artist'?'artists':'producers')+'/'+id+'/follow',following?'PUT':'DELETE');if(me?.id!==uid)return;updateFollowLocal(kind,id,result.following,result.profile);paintFollowState(key,result.following,false,result.followers);}
 catch(error){if(me?.id===uid){updateFollowLocal(kind,id,!!prior,prior);paintFollowState(key,!!prior,false,oldCount);}throw error;}
 finally{if(pendingFollows.get(key)===uid)pendingFollows.delete(key);if(me?.id===uid)paintFollowState(key,followed(kind,id),false);}
}
const DEFAULT_AVATAR='/assets/default-avatar.svg';
function avatarImage(p={},kind='producer'){
 const id=p.profile_id||p.id,src=id&&p.image_version?'/media/'+kind+'/'+encodeURIComponent(id)+'?v='+encodeURIComponent(p.image_version):DEFAULT_AVATAR;
 return '<img class="profile-avatar-image" src="'+esc(src)+'" alt="'+esc(p.name||'사용자')+' 프로필 사진" loading="lazy" decoding="async">';
}
// Keep every photo surface usable when an old or unavailable upload fails to load.
document.addEventListener('error',event=>{
 const image=event.target;if(!image.matches?.('img.profile-avatar-image'))return;
 if(image.getAttribute('src')!==DEFAULT_AVATAR)image.src=DEFAULT_AVATAR;
 else image.hidden=true;
},true);
function updateAccount(){const accountTarget=me?'#profile':'#account';$('.profile').href=accountTarget;$('.header-login').href=accountTarget;$('.profile').innerHTML=`<span class="avatar profile-avatar ${playerAvatarClass(me)}">${avatarImage(me||{})}${playerBadgeHTML(me)}</span><span><strong>${esc(me?(me.display_name||me.name):'무료로 시작하기')}</strong><small>${me?'내 계정 · '+(member.plan==='premium'?'Premium':'무료 회원'):'로그인 · 회원가입'}</small></span>${icon('chevron')}`;$('.header-login').textContent=me?'내 계정':'로그인';if(typeof refreshActivityBadge==='function')void refreshActivityBadge();}
function askLogin(){returnRoute=location.hash;saveResume();location.hash='account';toast('무료로 가입하고 음악을 이어 들어보세요.');return false;}
function saveResume(){saveQueue();if(current){pendingResume={id:current.id,time:preview?Math.min(audio.currentTime,60):audio.currentTime};sessionStorage.setItem('aifect-player-resume',JSON.stringify(pendingResume));}}
function dialog(html){$('#dialog-content').innerHTML=html;if(!$('#dialog').open)$('#dialog').showModal();}
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
 try{sessionStorage.removeItem('aifect-player-resume');}catch{}
 setCurrentLyrics(null);$('#elapsed').textContent='0:00';$('#duration').textContent='0:00';$('#seek').value=0;$('#seek').max=0;
 setPlayerVisible(false);
 if(restoreFocus)$('#main').focus({preventScroll:true});
}
function formField(label,name,type='text',value='',extra=''){return `<label class="form-field">${label}<input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;}
async function play(tid,tracks=null,start=0){
 countAdListening();
 const serial=++playSerial;if(!window.AifectAudioAds?.active)audio.pause();report();
 await window.AifectAudioAds?.beforeTrack();if(serial!==playSerial)return;
 const [{track:t},session]=await Promise.all([api('/api/tracks/'+tid),api('/api/playback/'+tid,'POST')]);if(serial!==playSerial)return;remember([t]);
 current=t;playSession=session.id;preview=session.preview;heard=0;lastTick=0;
 if(tracks?.length)queue=[...new Set(tracks.map(t=>t.id))];else if(!queue.includes(tid))queue=[tid];saveQueue();
 audio.src=session.src;$('#now-playing').innerHTML=`<a href="#song/${t.id}" aria-label="${esc(t.title)} 곡 보기">${cover(t,'mini-cover')}</a><div><strong title="${esc(t.title)}">${esc(t.title)}</strong><span>${esc(t.artist)}</span></div>`;
 $('#player-actions').innerHTML=`<button class="icon-button" data-like="${t.id}" aria-label="좋아요">${icon('heart')}</button>${giftButton(t,'small-button gift-entry player-gift').replace('<span>선물</span>','<span>선물하기</span>')}<button class="small-button" data-add="${t.id}">${icon('list')} 리스트에 추가</button><button class="small-button" data-sing-track="${t.id}">${icon('mic')} 부르기</button><a class="small-button player-comments" href="#song/${t.id}?comments=1">${icon('message')} 댓글 보기</a>`;
 $('#listen-mode').textContent=preview?'60초 미리 듣기':session.bitrate_kbps===256?'AAC 256':'AAC 128';$('#seek').max=preview?Math.min(t.duration,60):t.duration;$('#duration').textContent=time($('#seek').max);
 if(start)audio.currentTime=Math.min(start,preview?59.9:t.duration);
 setCurrentLyrics(t);refreshLyricsPanel();setPlayerVisible(true);
 try{await audio.play();}catch(e){if(e.name==='NotAllowedError')toast('재생 버튼을 눌러 음악을 이어 들어보세요.');else if(e.name!=='AbortError')throw new Error('음원을 재생할 수 없습니다. 잠시 후 다시 시도해주세요.');}
}
async function resumeAfterLogin(){if(pendingResume){const r=pendingResume;sessionStorage.removeItem('aifect-player-resume');pendingResume=null;await play(r.id,null,r.time);}}
async function report(){if(!playSession||heard<1||reportBusy)return;reportBusy=true;try{await api('/api/listens/'+playSession,'PATCH',{seconds:Math.floor(heard)});}catch{}finally{reportBusy=false;}}
async function nextTrack(delta,automatic=false){if(!queue.length){if(automatic)setPlayerVisible(false);return;}let i=queue.indexOf(current?.id);if(shuffle&&queue.length>1){const choices=queue.filter(id=>id!==current?.id);await play(choices[Math.floor(Math.random()*choices.length)]);return;}i+=delta;if(automatic&&i>=queue.length&&!repeatMode){setPlayerVisible(false);return;}i=(i+queue.length)%queue.length;await play(queue[i]);}

function portrait(p,kind){return '<div class="artist-portrait cover cover-custom profile-avatar'+(kind==='producer'?playerAvatarClass(p):'')+'">'+avatarImage(p,kind)+(kind==='producer'?playerBadgeHTML(p):'')+'</div>';}

function trackStats(t,cls='card-stats'){return '<div class="public-track-stats '+cls+'" data-stat-track="'+t.id+'" aria-label="곡 활동"><span aria-label="재생 '+number(t.plays)+'회">'+icon('play')+'<span>'+number(t.plays)+'</span></span><span aria-label="좋아요 '+number(t.likes)+'개">'+icon('heart')+'<span>'+number(t.likes)+'</span></span><a href="#song/'+t.id+'?comments=1" aria-label="댓글 '+number(t.comments)+'개 보기">'+icon('message')+'<span>'+number(t.comments)+'</span></a></div>';}
