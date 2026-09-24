function busyForm(form,work){return async ev=>{ev.preventDefault();const button=form.querySelector('button.primary-button'),error=form.querySelector('.form-error');if(button?.disabled)return;if(button)button.disabled=true;if(error)error.textContent='';try{await work(new FormData(form));}catch(e){if(error)error.textContent=e.message;else toast(e.message);}finally{if(button)button.disabled=false;}};}
function bindForms(base,param){
 if($('#search-form'))$('#search-form').onsubmit=e=>{e.preventDefault();location.hash='search/'+encodeURIComponent(new FormData(e.target).get('q'));};
 if($('#auth-form')){
  const form=$('#auth-form');$('#auth-switch').onclick=()=>{const signup=form.dataset.mode!=='register';form.dataset.mode=signup?'register':'login';$('#signup-name').hidden=!signup;form.elements.name.required=signup;form.elements.password.autocomplete=signup?'new-password':'current-password';$('#auth-title').textContent=signup?'무료 회원가입':'이메일로 로그인';$('#auth-submit').textContent=signup?'가입하고 음악 듣기':'로그인';$('#auth-switch').textContent=signup?'이미 회원이신가요? 로그인':'처음 오셨나요? 무료 회원가입';};
  form.onsubmit=busyForm(form,async fd=>{const d=await api('/api/auth/'+form.dataset.mode,'POST',Object.fromEntries(fd));me=d.user;await refreshLibrary();updateAccount();toast('반가워요! 이제 전체곡을 들을 수 있습니다.');try{await resumeAfterLogin();}catch(e){toast(e.message);}if(location.hash===returnRoute)await render();else location.hash=returnRoute;});
  if(authConfig.googleClientId)prepareGoogle().catch(e=>toast(e.message));
 }
 if($('#logout'))$('#logout').onclick=async()=>{try{await api('/api/auth/logout','POST');audio.pause();audio.removeAttribute('src');me=null;playSession=null;library={likes:[],playlists:[],follows:[]};setMembership(null);current=null;setCurrentLyrics(null);setPlayerVisible(false);sessionStorage.removeItem('aifect-player-resume');pendingResume=null;updateAccount();await render();toast('로그아웃했습니다.');}catch(e){toast(e.message);}};
 if($('#comment-form')){
  const form=$('#comment-form');form.onsubmit=busyForm(form,async fd=>{if(!me){askLogin();return;}const ts=fd.has('with_time')&&current?.id===param?Math.floor(audio.currentTime):null;await api(`/api/tracks/${param}/comments`,'POST',{body:fd.get('body'),timestamp:ts});form.reset();await reloadComments(param);toast('댓글을 등록했습니다.');});
  $('#comment-sort').onchange=()=>reloadComments(param).catch(e=>toast(e.message));
 }
 if($('#new-playlist'))$('#new-playlist').onclick=()=>playlistDialog().catch(e=>toast(e.message));
 if($('#upload-form'))$('#upload-form').onsubmit=busyForm($('#upload-form'),upload);
 if($('#cover-upload-form'))$('#cover-upload-form').onsubmit=busyForm($('#cover-upload-form'),uploadCover);
 bindStudioForms();bindMoodFields();bindLyricsPanel();if(base==='sing')bindSing(param);
}
let googleScriptPromise;
async function prepareGoogle(){
 const old=document.querySelector('.social-login.google');let host=$('#google-signin');if(!old&&!host)return;
 if(old){host=document.createElement('div');host.id='google-signin';old.replaceWith(host);}else host.replaceChildren();
 const {nonce}=await api('/api/auth/google/nonce','POST');
 googleScriptPromise ||=new Promise((resolve,reject)=>{if(window.google?.accounts?.id)return resolve();const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=resolve;script.onerror=()=>{googleScriptPromise=null;reject(new Error('Google 로그인 버튼을 불러오지 못했습니다.'));};document.head.appendChild(script);});
 await googleScriptPromise;if(!host.isConnected)return;
 google.accounts.id.initialize({client_id:authConfig.googleClientId,nonce,auto_select:false,callback:async result=>{try{saveResume();const d=await api('/api/auth/google/token','POST',{credential:result.credential});me=d.user;await refreshLibrary();updateAccount();await resumeAfterLogin();location.hash=returnRoute;await render();toast('Google 계정으로 로그인했습니다.');}catch(e){toast(e.message);await prepareGoogle();}}});
 google.accounts.id.renderButton(host,{theme:'outline',size:'large',type:'standard',text:'continue_with',width:Math.min(host.parentElement.clientWidth-60,340),locale:'ko',click_listener:saveResume});
}
async function reloadComments(tid){const {comments}=await api(`/api/tracks/${tid}/comments?sort=${$('#comment-sort')?.value||'latest'}`);if($('#comments'))$('#comments').innerHTML=commentsHTML(comments,trackMap.get(tid));}
async function upload(fd){
 applyLyrics(fd);
 const file=fd.get('audio'),image=fd.get('cover');if(!file?.size)throw new Error('음원 파일을 선택해주세요.');if(file.size>80*1024*1024)throw new Error('음원은 80MB 이하로 업로드해주세요.');
 for(const name of ['cover','artist_image','producer_image'])await validateImage(fd.get(name));
 const body={...textFields(fd),participation:fd.getAll('participation').join(', '),rights:fd.has('rights'),is_ai:fd.has('is_ai'),karaoke:fd.has('karaoke'),extension:file.name.split('.').pop().toLowerCase(),bytes:file.size};
 const progress=$('.upload-progress');progress.hidden=false;progress.querySelector('p').textContent='업로드를 준비하고 있습니다.';
 const form=$('#upload-form'),fingerprint=JSON.stringify([body,file.name,file.lastModified]);
 let draft=form._draft;if(!draft||draft.fingerprint!==fingerprint){draft={...await api('/api/uploads','POST',body),fingerprint};form._draft=draft;}
 const {id,artist_id,producer_id}=draft;
 await api('/api/studio/profile','PUT',{name:body.producer,bio:body.producer_bio});
 await api(`/api/studio/artists/${artist_id}`,'PUT',{name:body.artist,bio:body.artist_bio,genre:body.genre});
 for(const [name,kind,entityId] of [['artist_image','artists',artist_id],['producer_image','producers',producer_id]]){if(fd.get(name)?.size){progress.querySelector('p').textContent='프로필 사진을 업로드하고 있습니다.';await uploadFile(`/api/studio/${kind}/${entityId}/image`,fd.get(name));}}
 await uploadFile(`/api/uploads/${id}/audio`,file,value=>{progress.querySelector('progress').value=value;progress.querySelector('p').textContent=`음원 업로드 ${Math.round(value)}%`;});
 if(image?.size){progress.querySelector('p').textContent='커버를 업로드하고 있습니다.';await uploadFile(`/api/uploads/${id}/cover`,image);}
 await api(`/api/uploads/${id}/complete`,'POST');toast('업로드 완료! 음원 변환이 끝나면 공개됩니다.');location.hash='studio';
}
// Same three steps as a song upload: create the draft, send the audio, then mark it complete for transcoding.
async function uploadCover(fd){
 const form=$('#cover-upload-form'),file=fd.get('audio'),image=fd.get('cover');
 if(!file?.size)throw new Error('커버 녹음 파일을 선택해주세요.');if(file.size>80*1024*1024)throw new Error('녹음 파일은 80MB 이하로 올려주세요.');
 await validateImage(image);
 const body={original_id:form.dataset.original,description:fd.get('description')||'',own_voice:fd.has('own_voice'),rights:fd.has('rights'),extension:file.name.split('.').pop().toLowerCase(),bytes:file.size};
 const progress=form.querySelector('.upload-progress');progress.hidden=false;progress.querySelector('p').textContent='업로드를 준비하고 있습니다.';
 const fingerprint=JSON.stringify([body,file.name,file.lastModified]);let draft=form._draft;if(!draft||draft.fingerprint!==fingerprint){draft={...await api('/api/covers','POST',body),fingerprint};form._draft=draft;}
 await uploadFile(`/api/uploads/${draft.id}/audio`,file,value=>{progress.querySelector('progress').value=value;progress.querySelector('p').textContent=`녹음 업로드 ${Math.round(value)}%`;});
 if(image?.size){progress.querySelector('p').textContent='이미지를 업로드하고 있습니다.';await uploadFile(`/api/uploads/${draft.id}/cover`,image);}
 await api(`/api/uploads/${draft.id}/complete`,'POST');toast('커버곡을 올렸어요! 변환이 끝나면 공개됩니다.');location.hash='studio';
}
async function giftDialog(tid){
 const gold=await api('/api/gold'),t=trackMap.get(tid),presets=[10,50,100,500,1000].filter(n=>n<=gold.balance);
 dialog(`<h2>선물하기</h2><p>${esc(t?.title||'')}${t?` · ${esc(t.kind==='cover'?t.producer+' 커버':t.artist)}`:''}</p><p class="gift-balance">보유 골드<strong>${number(gold.balance)}</strong></p>${gold.balance<10?`<p class="field-help">선물하려면 골드가 10개 이상 필요해요.${gold.checkout_available?'':' 골드 충전은 결제 준비가 끝나면 열려요.'}</p><a class="small-button" href="#gold">골드 보기</a>`:`<form id="gift-form"><div class="gift-presets">${presets.map(n=>`<button type="button" class="small-button" data-gift-amount="${n}">${number(n)}골드</button>`).join('')}</div><label class="form-field">보낼 골드<input name="gold" type="number" min="10" max="${Math.min(100000,gold.balance)}" step="1" value="${Math.min(100,gold.balance)}" required></label><p class="field-help">1골드 = ${gold.gold_krw}원. 보낸 선물은 되돌릴 수 없어요.</p><button class="primary-button">선물 보내기</button><p class="form-error" role="alert"></p></form>`}`);
 const form=$('#gift-form');if(!form)return;
 form.querySelectorAll('[data-gift-amount]').forEach(b=>b.onclick=()=>{form.elements.gold.value=b.dataset.giftAmount;});
 form.onsubmit=busyForm(form,async fd=>{const n=Number(fd.get('gold')),r=await api(`/api/tracks/${tid}/gifts`,'POST',{gold:n});$('#dialog').close();toast(`${number(n)}골드를 선물했어요! 남은 골드 ${number(r.balance)}`);await render();});
}
function uploadFile(url,file,onprogress=()=>{}){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');xhr.upload.onprogress=e=>{if(e.lengthComputable)onprogress(e.loaded/e.total*100);};xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300)resolve();else{let message='업로드에 실패했습니다. 다시 시도해주세요.';try{message=JSON.parse(xhr.responseText).error||message;}catch{}reject(new Error(message));}};xhr.onerror=()=>reject(new Error('연결이 끊어졌습니다. 파일을 유지한 상태로 다시 업로드해주세요.'));xhr.send(file);});}
async function playlistDialog(existing=null,initialTrack=null){if(!me)return askLogin();await refreshLibrary();if(!existing&&!canCreatePlaylist())return;if(existing?.locked)return selectActivePlaylists();dialog(`<h2>${existing?'플레이리스트 설정':'새 플레이리스트'}</h2><form id="playlist-form">${formField('이름','name','text',existing?.name||'','required maxlength="80"')}<label class="form-field">소개<textarea name="description" maxlength="600" placeholder="어떤 순간에 들으면 좋을까요?">${esc(existing?.description||'')}</textarea></label><label class="checkbox-line"><input name="is_public" type="checkbox" ${existing?.is_public?'checked':''}> 링크로 누구나 볼 수 있게 공개</label><button class="primary-button">저장</button><p class="form-error" role="alert"></p></form>`);const form=$('#playlist-form');form.onsubmit=busyForm(form,async fd=>{const d=await api(existing?`/api/playlists/${existing.id}`:'/api/playlists',existing?'PATCH':'POST',{name:fd.get('name'),description:fd.get('description'),is_public:fd.has('is_public'),...(!existing&&initialTrack?{track_ids:[initialTrack]}:{})});$('#dialog').close();await refreshLibrary();location.hash='playlist/'+(existing?.id||d.id);await render();});}
async function addToPlaylist(tid){if(!me)return askLogin();await refreshLibrary();dialog(`<h2>플레이리스트에 추가</h2><div class="dialog-list">${library.playlists.filter(p=>!p.locked).map(p=>`<button class="small-button" data-save-track="${tid}" data-playlist="${p.id}">${esc(p.name)} <span>${p.tracks}곡</span></button>`).join('')}</div><button class="primary-button" id="dialog-new-playlist">새 플레이리스트 만들기</button>`);$('#dialog-new-playlist').onclick=()=>playlistDialog(null,tid).catch(e=>toast(e.message));}
async function playlistOrderDialog(pid){
 const data=await api('/api/playlists/'+pid);let tracks=[...data.tracks];if(!tracks.length){toast('플레이리스트에 곡을 먼저 담아주세요.');return;}
 dialog(`<h2>재생 순서 편집</h2><p>${esc(data.playlist.name)} · 화살표로 순서를 바꾸고 저장하세요.</p><form id="playlist-order-form"><div id="playlist-order-rows" class="playlist-order-rows"></div><button class="primary-button">순서 저장</button><p class="form-error" role="alert"></p></form>`);
 const rows=$('#playlist-order-rows'),paint=()=>{rows.innerHTML=tracks.map((t,i)=>`<div class="playlist-order-row"><span>${i+1}</span><div><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></div><button type="button" class="small-button" data-order-index="${i}" data-direction="-1" aria-label="${esc(t.title)} 위로" ${i===0?'disabled':''}>↑</button><button type="button" class="small-button" data-order-index="${i}" data-direction="1" aria-label="${esc(t.title)} 아래로" ${i===tracks.length-1?'disabled':''}>↓</button></div>`).join('');};paint();
 rows.onclick=e=>{const button=e.target.closest('[data-order-index]');if(!button||button.disabled)return;const i=Number(button.dataset.orderIndex),j=i+Number(button.dataset.direction);if(j<0||j>=tracks.length)return;[tracks[i],tracks[j]]=[tracks[j],tracks[i]];paint();};
 const form=$('#playlist-order-form');form.onsubmit=busyForm(form,async()=>{await api(`/api/playlists/${pid}/order`,'PUT',{track_ids:tracks.map(t=>t.id)});$('#dialog').close();await render();toast('플레이리스트 재생 순서를 저장했습니다.');});
}
document.addEventListener('click',async ev=>{
 const el=ev.target.closest('button,a');if(!el||el.disabled)return;
 try{
  if(el.matches('[data-play],[data-play-all],[data-like],[data-follow],[data-add],[data-seek]'))await accountReady;
  if(el.hasAttribute('data-play')){if($('#dialog').open)$('#dialog').close();await play(el.dataset.play,routeTracks.some(t=>t.id===el.dataset.play)?routeTracks:null);}
  else if(el.hasAttribute('data-play-all')){if(routeTracks.length)await play(routeTracks[0].id,routeTracks);else toast('먼저 곡을 추가해주세요.');}
  else if(el.dataset.gift){if(!me)return askLogin();await giftDialog(el.dataset.gift);}
  else if(el.dataset.closePeriod){if(confirm(`${el.dataset.closePeriod} 정산을 마감할까요? 마감한 달은 되돌릴 수 없어요.`)){const r=await api('/api/admin/payouts/close','POST',{period:el.dataset.closePeriod});toast(`정산서 ${r.issued}건을 만들었어요. 이월 ${r.carried}건.`);location.hash='admin/'+r.period;await render();}}
  else if(el.dataset.revealPayout){const a=await api(`/api/admin/payouts/${el.dataset.revealPayout}/account`);dialog(`<h2>정산 계좌</h2><p>이 조회는 기록돼요.</p><dl class="business-details"><div><dt>예금주</dt><dd>${esc(a.holder)}</dd></div><div><dt>은행</dt><dd>${esc(a.bank)}</dd></div><div><dt>계좌번호</dt><dd>${esc(a.account)}</dd></div><div><dt>주민등록번호</dt><dd>${esc(a.resident_number)}</dd></div></dl>`);}
  else if(el.dataset.payStatement){dialog(`<h2>지급 완료 기록</h2><form id="pay-form"><label class="form-field">이체 메모 (선택)<input name="ref" maxlength="100" placeholder="예: 국민 이체 3/15"></label><button class="primary-button">지급 완료로 기록</button><p class="form-error" role="alert"></p></form>`);const form=$('#pay-form'),sid=el.dataset.payStatement;form.onsubmit=busyForm(form,async fd=>{await api(`/api/admin/payouts/${sid}/paid`,'POST',{ref:fd.get('ref')||''});$('#dialog').close();toast('지급 완료로 기록했어요.');await render();});}
  else if(el.dataset.like){if(!me)return askLogin();el.disabled=true;const tid=el.dataset.like,wasLiked=liked(tid),prior=trackMap.get(tid);await api(`/api/tracks/${tid}/like`,wasLiked?'DELETE':'PUT');await refreshLibrary();const count=library.likes.find(t=>t.id===tid)?.likes??Math.max(0,(prior?.likes||0)-1);if(prior)trackMap.set(tid,{...prior,likes:count});document.querySelectorAll('[data-like]').forEach(b=>{if(b.dataset.like!==tid)return;b.classList.toggle('is-active',liked(tid));b.setAttribute('aria-pressed',String(liked(tid)));const label=b.querySelector('[data-like-count]');if(label){label.textContent=number(count);b.setAttribute('aria-label',`좋아요 ${number(count)}개`);}});document.querySelectorAll('[data-stat-track]').forEach(s=>{if(s.dataset.statTrack!==tid)return;const item=s.children[1];item.setAttribute('aria-label',`좋아요 ${number(count)}개`);item.querySelector('span').textContent=number(count);});toast(liked(el.dataset.like)?'좋아요에 저장했습니다.':'좋아요를 취소했습니다.');}
  else if(el.dataset.follow){if(!me)return askLogin();const [kind,id]=el.dataset.follow.split('/');await api(`/api/${kind==='artist'?'artists':'producers'}/${id}/follow`,followed(kind,id)?'DELETE':'PUT');await refreshLibrary();el.textContent=followed(kind,id)?'팔로잉':'팔로우';}
  else if(el.dataset.add)await addToPlaylist(el.dataset.add);
  else if(el.dataset.saveTrack){await api(`/api/playlists/${el.dataset.playlist}/tracks/${el.dataset.saveTrack}`,'PUT');$('#dialog').close();toast('플레이리스트에 추가했습니다.');}
  else if(el.dataset.removeTrack){await api(`/api/playlists/${el.dataset.playlist}/tracks/${el.dataset.removeTrack}`,'DELETE');await render();}
  else if(el.hasAttribute('data-organize-likes'))await playlistFromLikes();
  else if(el.dataset.pickPlaylist)await trackPicker(el.dataset.pickPlaylist);
  else if(el.dataset.orderPlaylist)await playlistOrderDialog(el.dataset.orderPlaylist);
  else if(el.dataset.editPlaylist){const d=await api('/api/playlists/'+el.dataset.editPlaylist);await playlistDialog(d.playlist);}
  else if(el.dataset.deletePlaylist){if(confirm('이 플레이리스트를 삭제할까요?')){await api('/api/playlists/'+el.dataset.deletePlaylist,'DELETE');location.hash='library/playlists';}}
  else if(el.dataset.commentLike){if(!me)return askLogin();await api(`/api/comments/${el.dataset.commentLike}/like`,el.dataset.liked==='true'?'DELETE':'PUT');await reloadComments(location.hash.split('/')[1]?.split('?')[0]);}
  else if(el.dataset.deleteComment){if(confirm('댓글을 삭제할까요?')){await api('/api/comments/'+el.dataset.deleteComment,'DELETE');await reloadComments(location.hash.split('/')[1]?.split('?')[0]);}}
  else if(el.dataset.editComment||el.dataset.reply){if(!me)return askLogin();const edit=el.dataset.editComment;dialog(`<h2>${edit?'댓글 수정':'답글 남기기'}</h2><form id="reply-form"><textarea name="body" required maxlength="2000" aria-label="${edit?'댓글 수정':'답글'}">${esc(edit?el.dataset.body:'')}</textarea><button class="primary-button">등록</button><p class="form-error" role="alert"></p></form>`);const form=$('#reply-form');form.onsubmit=busyForm(form,async fd=>{await api(edit?`/api/comments/${edit}`:`/api/tracks/${el.dataset.track}/comments`,edit?'PATCH':'POST',{body:fd.get('body'),parent_id:el.dataset.reply||null});$('#dialog').close();await reloadComments(location.hash.split('/')[1]?.split('?')[0]);});}
  else if(el.hasAttribute('data-seek')){if(current?.id!==el.dataset.track)await play(el.dataset.track);if(el.hasAttribute('data-lyric-index')&&!hasFullLyrics(current)){refreshLyricsPanel();toast('전체 싱크 가사는 Premium에서 이용할 수 있어요.');return;}const seconds=Number(el.dataset.seek);if(preview&&seconds>=60){askLogin();return;}audio.currentTime=seconds;await audio.play();}
  else if(el.dataset.hideTrack){if(confirm('이 곡을 비공개로 전환할까요?')){await api(`/api/uploads/${el.dataset.hideTrack}/unpublish`,'POST');await render();}}
  else if(el.dataset.karaokeTrack){if(!$('#karaoke-accept')?.checked){toast('동의 항목을 먼저 체크해주세요.');return;}await api(`/api/uploads/${el.dataset.karaokeTrack}/karaoke`,'POST',{accept:true});toast('노래방 MR 제공 · 커버 허락에 동의했습니다.');await render();}
  else if(el.dataset.karaokeRegenerate){if(confirm('지금 노래방 MR을 지우고 원곡에서 보컬을 다시 분리할까요?')){await api(`/api/studio/tracks/${el.dataset.karaokeRegenerate}/karaoke`,'POST',{});toast('노래방 MR을 다시 만들기 시작했어요.');await render();}}
  else if(el.dataset.retryTrack){await api(`/api/uploads/${el.dataset.retryTrack}/retry`,'POST');await render();}
  else if(el.hasAttribute('data-share')){await navigator.clipboard.writeText(location.href);toast('공개 링크를 복사했습니다.');}
  else if(el.dataset.playerAction&&['shuffle','repeat','previous'].includes(el.dataset.playerAction)){
   $('#'+el.dataset.playerAction).click();
   if(el.dataset.playerAction==='shuffle')el.textContent=shuffle?'셔플 켜짐':'셔플 끔';
   if(el.dataset.playerAction==='repeat')el.textContent=['반복 끔','전체 반복','한 곡 반복'][repeatMode];
  }
  else if(el.hasAttribute('data-oauth'))saveResume();
 }catch(e){toast(e.message);}finally{el.disabled=false;}
});
audio.ontimeupdate=()=>{$('#elapsed').textContent=time(audio.currentTime);$('#seek').value=audio.currentTime;};
audio.onplay=()=>{if(!current||!playSession){audio.pause();return;}setPlayerVisible(true);lastTick=performance.now();$('#play-toggle').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';$('#play-toggle').setAttribute('aria-label','일시정지');};
audio.onpause=()=>{$('#play-toggle').innerHTML=icon('play');$('#play-toggle').setAttribute('aria-label','재생');report();};
audio.onended=()=>{if(!current||!playSession)return;report();if(preview&&current.duration>=60){setPlayerVisible(false);saveResume();dialog('<h2>좋은 음악은 끝까지.</h2><p>무료 회원가입 후 60초 지점부터 이어 들으세요.</p><a class="primary-button" href="#account" id="preview-login">무료 회원가입 후 전체곡 듣기</a>');$('#preview-login').onclick=()=>{$('#dialog').close();returnRoute='#song/'+current.id;};return;}if(repeatMode===2)play(current.id).catch(e=>toast(e.message));else nextTrack(1,true).catch(e=>toast(e.message));};
audio.onerror=()=>{if(audio.src)toast('음원을 불러오지 못했습니다. 재생을 다시 눌러주세요.');};
setInterval(()=>{if(!audio.paused&&!audio.seeking&&audio.readyState>=3){const n=performance.now();if(lastTick)heard+=Math.min((n-lastTick)/1000,1.1);lastTick=n;}else lastTick=0;},1000);
setInterval(report,10000);
$('#play-toggle').onclick=async()=>{try{if(!current){if(queue.length)await play(queue[0]);else if(routeTracks.length)await play(routeTracks[0].id,routeTracks);else toast('먼저 음악을 선택해주세요.');}else if(!playSession||preview!==!me)await play(current.id,null,audio.currentTime);else if(audio.paused)await audio.play();else audio.pause();}catch(e){toast(e.message);}};
$('#next').onclick=()=>nextTrack(1).catch(e=>toast(e.message));$('#previous').onclick=()=>{if(audio.currentTime>3)audio.currentTime=0;else nextTrack(-1).catch(e=>toast(e.message));};
$('#shuffle').onclick=()=>{shuffle=!shuffle;$('#shuffle').classList.toggle('is-active',shuffle);$('#shuffle').setAttribute('aria-pressed',String(shuffle));};
$('#repeat').onclick=()=>{repeatMode=(repeatMode+1)%3;$('#repeat').classList.toggle('is-active',!!repeatMode);$('#repeat').setAttribute('aria-pressed',String(!!repeatMode));const label=['반복 끔','전체 반복','한 곡 반복'][repeatMode];$('#repeat').setAttribute('aria-label',label);toast(label);};
$('#volume').oninput=e=>audio.volume=Number(e.target.value);$('#seek').oninput=e=>{if(current)audio.currentTime=Number(e.target.value);};
$('#queue-toggle').onclick=queueDialog;
$('#player-close').onclick=closePlayer;
$('#dialog-close').onclick=()=>$('#dialog').close();$('#menu-toggle').onclick=()=>$('.sidebar').classList.toggle('open');
window.addEventListener('hashchange',render);window.addEventListener('pagehide',saveResume);
async function boot(){
 accountReady=(async()=>{try{authConfig=await api('/api/me');me=authConfig.user;await refreshLibrary();}catch(e){toast(e.message);}finally{updateAccount();updateHomeAccount();}})();
 const firstRender=render();await accountReady;
 if(me&&pendingResume)try{await resumeAfterLogin();}catch(e){toast(e.message);}
 await firstRender;
}
icons();boot();
