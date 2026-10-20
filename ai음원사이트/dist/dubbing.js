// Separate page lifecycle: existing music recording and playback stay untouched.
let dubbingEditor=null;
const dubbingTabs=[['open','참여 가능한 극본'],['complete','완성된 더빙'],['popular','인기 더빙'],['latest','최신 더빙'],['mine','내 더빙']];
function dubbingListQuery(tab,genre='',offset){
 const query=new URLSearchParams({tab});if(genre)query.set('genre',genre);if(offset!==undefined)query.set('offset',String(offset));return query.toString();
}
function dubbingNewURL(genre='',manual=false){
 const query=new URLSearchParams();if(genre)query.set('genre',genre);if(manual)query.set('mode','manual');return '#dubbing/new'+(query.size?'?'+query:'');
}
function dubbingGenresHTML(tab,genre){
 return `<section class="dubbing-discover" aria-label="장르별 더빙 찾기"><div class="dubbing-section-heading"><div><span class="eyebrow">FIND YOUR STORY</span><h2>어떤 이야기에 참여할까요?</h2><p>좋아하는 장르를 고르고, 참여할 극본과 완성된 더빙을 만나보세요.</p></div><a class="small-button" href="${dubbingNewURL(genre)}">${icon('sparkles')} 새로 시작하기</a></div><nav class="dubbing-genre-filter" aria-label="더빙 장르">${['',...AifectDubbing.DUBBING_GENRES].map(g=>`<a href="#dubbing?${esc(dubbingListQuery(tab,g))}" ${genre===g?'aria-current="true"':''}>${g||'전체'}</a>`).join('')}</nav></section>`;
}
function dubbingModeNav(active='dubbing'){
 return `<nav class="dubbing-mode" aria-label="부르기 종류"><a href="#karaoke" ${active==='song'?'aria-current="page"':''}>${icon('mic')} 노래</a><a href="#dubbing" ${active==='dubbing'?'aria-current="page"':''}>${icon('users')} 더빙</a></nav>`;
}
function dubbingBeforeRoute(raw){
 if(!dubbingRecordBeforeRoute(raw))return false;
 if(dubbingRewardOperation)dubbingStopReward();
 if(!dubbingEditor||raw===dubbingEditor.route)return true;
 if(dubbingEditor.busy){history.replaceState(null,'','#'+dubbingEditor.route);toast('진행 중인 저장 또는 대본 생성이 끝난 뒤 이동해주세요.');return false;}
 if(dubbingEditor.dirty&&!confirm('아직 저장하지 않은 대본이 있습니다. 저장하지 않고 이동할까요?')){history.replaceState(null,'','#'+dubbingEditor.route);return false;}
 dubbingEditor=null;return true;
}
window.addEventListener('beforeunload',e=>{if(dubbingEditor?.dirty){e.preventDefault();e.returnValue='';}});
function dubbingShell(content){return `<div class="dubbing-page">${dubbingModeNav()}${content}</div>`;}
function dubbingEmpty(title,description,action=true){return `<div class="dubbing-empty">${icon('mic')}<h3>${title}</h3><p>${description}</p>${action?'<a class="primary-button" href="#dubbing/new?mode=manual">첫 대본 만들기</a>':''}</div>`;}
function dubbingCard(p,i){
 const open=p.reusable||['recruiting','recording'].includes(p.state)&&p.participants<p.roleCount;
 return `<a class="dubbing-card dubbing-tone-${i%3}" href="#dubbing/${esc(p.id)}"><div class="dubbing-card-stage"><span>${esc(p.genres.join(' · '))}</span><strong aria-hidden="true">${String(i+1).padStart(2,'0')}</strong><div class="dubbing-card-voices" aria-hidden="true">${Array.from({length:p.roleCount},(_,n)=>`<i>${String.fromCharCode(65+n)}</i>`).join('')}</div></div><div class="dubbing-card-copy"><div class="dubbing-card-badges"><span class="dubbing-tag">${p.visibility==='private'?'내 비공개 대본':p.state==='complete'?'완성작':p.reusable?'계속 참여 가능한 극본':open?'참여 가능 · '+(p.roleCount-p.participants)+'자리':'함께 제작 중'}</span>${p.hasSoundEffects?`<span class="dubbing-sound-badge">${icon('headphones')} 효과음 있음</span>`:''}</div><h3>${esc(p.title)}</h3><p>${esc(p.ownerName)} · 약 ${time(p.duration)}</p><div class="dubbing-card-foot"><span>${p.reusable?'새 더빙 시작 · 빈 배역 참여':p.participants+' / '+p.roleCount+'명 참여'}</span><span>${p.state==='complete'?'완성작 듣기':open?'극본 보고 참여하기':'대본 보기'} ${icon('chevron')}</span></div></div></a>`;
}
function dubbingLengthLabel(minutes){const seconds=Math.round(minutes*60);return `${seconds>=60?Math.floor(seconds/60)+'분':''}${seconds%60?' '+seconds%60+'초':''}`.trim();}
// Recent completed production requests took 21s and 41s; allow for longer scripts and load.
const dubbingGenerationEstimate='예상 생성 시간: 약 30초~3분';
async function dubbingWaitForGeneration(result,form){
 const deadline=Date.now()+10*60*1000;
 while(result.state==='running'&&form.isConnected&&Date.now()<deadline){
  dubbingMessage(form,(result.message||'대본을 만들고 있어요.')+' '+dubbingGenerationEstimate+'.');
  await new Promise(resolve=>setTimeout(resolve,4000));
  if(!form.isConnected)return result;
  result=await api('/api/dubbing/generations/'+result.id);
 }
 return result;
}
function dubbingQuotaHTML(q){
 const pending=dubbingRewardPending(),available=q?.rewardedAdAvailable&&q.adRemaining>0;
 return `<div class="dubbing-quota"><strong>${q?.freeDaily===3?'프리미엄 회원 · 하루 3회 무료':'일반 회원 · 하루 1회 무료'}</strong><p>프리미엄 회원은 AI 대본 작성이 매일 3회 무료예요.</p><p>광고 1회 시청마다 1회 추가 · 하루 최대 4회</p><span>오늘 남은 작성 <b>${Number(q?.remaining??1)}회</b> · 광고 보상 ${Number(q?.adsEarned||0)}/4회</span><p class="dubbing-muted">매일 밤 12시, 한국 시간 기준으로 새로 시작해요.</p>${pending?'<button type="button" class="small-button" data-dubbing-reward-retry>보상 다시 확인</button><small>시청한 광고의 보상을 확인해요. 광고를 다시 볼 필요 없어요.</small>':`<button type="button" class="small-button" data-dubbing-reward ${available?'':'disabled'}>광고 보고 1회 더 받기</button><small>${q?.adRemaining===0?'오늘의 광고 보상 4회를 모두 받았어요.':available?'광고를 끝까지 보면 대본 작성 1회를 받아요. 중간에 닫아도 기존 이용 횟수는 줄지 않아요.':'보상형 광고 연결을 준비하고 있어요. 무료 작성과 직접 대본 쓰기는 이용할 수 있어요.'}</small>`}</div>`;
}
function dubbingOptionsHTML(config,mode,genre=''){
 const D=AifectDubbing;
 return `<a class="dubbing-back" href="#dubbing">← 더빙 스튜디오</a><header class="dubbing-heading"><span class="eyebrow">YOUR STORY, OUR VOICES</span><h1>${mode==='ai'?'어떤 이야기를 함께 연기할까요?':'당신의 이야기를 대본으로.'}</h1><p>이야기의 분위기와 배역을 정하고, 각자의 목소리로 채울 준비를 해보세요.</p></header>
 <div class="dubbing-create-layout"><form id="dubbing-options-form" class="dubbing-panel">
 <fieldset><legend>01 <span>이야기의 장르</span><small>최대 2개</small></legend><div class="dubbing-chips">${D.DUBBING_GENRES.map(g=>`<label><input type="checkbox" name="genres" value="${g}" ${g===(genre||'일상')?'checked':''}><span>${g}</span></label>`).join('')}</div></fieldset>
 <fieldset><legend>02 <span>인원과 대본 시간</span></legend><div class="dubbing-form-grid"><label>참여 인원<select name="roleCount">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n===2?'selected':''}>${n}명</option>`).join('')}</select></label><label>대본 시간<select name="minutes">${D.DUBBING_LENGTHS.map(n=>`<option value="${n}" ${n===1?'selected':''}>${dubbingLengthLabel(n)}</option>`).join('')}</select></label></div><small class="dubbing-muted">30초부터 5분까지, 30초 단위로 선택해요.</small></fieldset>
 <fieldset><legend class="dubbing-idea-heading">03 <span>이야기의 세부사항</span><small id="dubbing-random-hint">‘랜덤’ 또는 ‘무작위’로 맡기면 대본이 완성된 뒤 이야기를 확인할 수 있어요.</small></legend><button type="button" class="small-button dubbing-random" id="dubbing-random-idea">${icon('shuffle')} 이야기 랜덤 생성</button><label>어떤 이야기를 만들까요?<textarea name="idea" rows="5" maxlength="1500" aria-describedby="dubbing-random-hint" placeholder="등장인물, 장소, 상황, 원하는 분위기와 결말을 자유롭게 적어주세요.&#10;예: 마지막 지하철에서 우연히 만난 두 친구. 어색하게 시작하지만 마지막에는 웃으며 화해하는 이야기."></textarea></label><input type="hidden" name="mood" value="랜덤"><input type="hidden" name="ending" value="랜덤"></fieldset>
 <div id="dubbing-quota">${dubbingQuotaHTML(config.quota)}</div>
 <p class="dubbing-generation-estimate">${dubbingGenerationEstimate}<small>대본 길이와 요청량에 따라 달라질 수 있어요.</small></p><p class="dubbing-feedback" role="status" aria-live="polite"></p><div class="dubbing-form-actions"><button class="primary-button dubbing-ai-button" name="create" value="ai" type="submit" disabled>${icon('sparkles')} 대본 작성하기</button><button class="small-button" name="create" value="manual" type="submit">직접 대사 쓰기</button><button type="button" class="small-button" id="dubbing-recover" hidden>이전 AI 생성 결과 확인</button></div>
 ${config.aiAvailable?'':`<p class="dubbing-muted">AI 대본은 연동 대기 중입니다. 직접 작성한 대본은 지금 저장할 수 있어요.</p>`}
 </form>
 <aside class="dubbing-panel dubbing-guide"><span class="eyebrow">HOW IT WORKS</span><h2>대본 한 편,<br>함께 만드는 장면.</h2><ol><li><b>장르 · 인원 · 시간 선택</b><p>짧은 30초 장면부터 5분 이야기까지.</p></li><li><b>세부사항 직접 입력</b><p>등장인물과 상황을 적으면 AI가 연기할 대본으로 만들어요.</p></li><li><b>배역 선택과 음향 제작</b><p>완성된 대본을 다듬고 함께할 목소리를 모집해요.</p></li></ol><div class="dubbing-guide-note">AI 음향 연출 · 작품당 ${Number(config.soundPriceGold)}G<br>상황별 효과음 + 짧은 BGM + 자동 믹싱<br><small>${config.goldChargingEnabled?'생성 전 최종 금액을 확인해요. 실패하면 자동 환급돼요.':'개발 검증 중에는 골드가 차감되지 않아요.'}</small></div></aside></div>`;
}
async function dubbingView(base,param,raw){
 if(base!=='dubbing')return null;
 const config=await api('/api/dubbing/config');
 if(!config.enabled)return {html:dubbingShell(dubbingEmpty('더빙 스튜디오를 준비하고 있어요.','이야기를 함께 연기하는 새로운 공간으로 곧 만나요.',false)),dubbing:true};
 if((param==='new'||new URLSearchParams(raw.split('?')[1]).get('tab')==='mine')&&!me){returnRoute=location.hash;return {html:gate(),dubbing:true};}
 if(param==='new'){
  const mode=new URLSearchParams(raw.split('?')[1]).get('mode')==='manual'?'manual':'ai';
  const requestedGenre=new URLSearchParams(raw.split('?')[1]).get('genre'),genre=AifectDubbing.DUBBING_GENRES.includes(requestedGenre)?requestedGenre:'';
  return {html:dubbingShell(dubbingOptionsHTML(config,mode,genre)),dubbing:true,dubbingCreate:true,config,route:raw};
 }
 if(param){
  const {project:p}=await api('/api/dubbing/projects/'+encodeURIComponent(param));
  if(!p.removed&&new URLSearchParams(raw.split('?')[1]).get('record')==='1'&&p.recordingAvailable&&p.roles.some(r=>r.mine)&&p.sound.state==='ready'){
   const recordingData=await api('/api/dubbing/projects/'+p.id+'/recording');
   return {html:dubbingShell(dubbingRecordingHTML(p,recordingData)),dubbing:true,recordingData,project:p,config,route:raw};
  }
  const editing=new URLSearchParams(raw.split('?')[1]).get('edit')==='1'&&p.canEdit;
  return {html:dubbingShell(editing?'<div id="dubbing-editor-root"></div>':dubbingDetailHTML(p)),dubbing:true,project:p,editing,config,route:raw};
 }
 const query=new URLSearchParams(raw.split('?')[1]),tab=dubbingTabs.some(t=>t[0]===query.get('tab'))?query.get('tab'):'open';
 const genre=AifectDubbing.DUBBING_GENRES.includes(query.get('genre'))?query.get('genre'):'';
 const data=await api('/api/dubbing/projects?'+dubbingListQuery(tab,genre));
 const payments=tab==='mine'?(await api('/api/dubbing/payments')).payments:[];

 return {html:dubbingShell(`<section class="dubbing-hero"><div><span class="eyebrow">AIFECT DUBBING STUDIO</span><h1>이야기에,<br>우리의 목소리를.</h1><p>한 편의 대본, 서로 다른 목소리.<br>함께 연기할 당신만의 이야기를 시작하세요.</p><div class="dubbing-form-actions"><a class="primary-button" href="#dubbing/new">${icon('sparkles')} AI 대본 만들기</a><a class="small-button" href="#dubbing/new?mode=manual">직접 대본 만들기 ${icon('arrow')}</a></div></div><div class="dubbing-hero-steps"><div class="dubbing-hero-step"><span>01</span><div><b>이야기를 고르고</b><p>30초부터 5분까지 · 1~6명의 배역</p></div></div><div class="dubbing-hero-step"><span>02</span><div><b>장면에 소리를 더하고</b><p>대본에 어울리는 효과음과 배경음악</p></div></div><div class="dubbing-hero-step"><span>03</span><div><b>함께할 목소리를 모아요</b><p>마음에 드는 배역을 선택해 참여하기</p></div></div></div></section>
 ${dubbingGenresHTML(tab,genre)}
 <nav class="dubbing-tabs" aria-label="더빙 작품 목록">${dubbingTabs.map(([key,label])=>`<a href="#dubbing?${esc(dubbingListQuery(key,genre))}" ${tab===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav>
 <section id="dubbing-list-results" aria-live="polite">${dubbingListResultsHTML(data,payments,tab,genre)}</section>`),dubbing:true,tab,genre,nextOffset:data.nextOffset,cardCount:data.projects.length,route:raw,config};
}
function dubbingListResultsHTML(data,payments,tab,genre){
 const copy={popular:['많이 사랑받는 더빙','완성된 더빙을 좋아요가 많은 순으로 보여드려요.'],latest:['새로 완성된 더빙','최근 완성된 목소리를 먼저 들어보세요.'],open:['당신의 목소리를 기다려요','새 더빙을 시작하거나, 다른 사람이 시작한 빈 배역에 참여해보세요.'],complete:['우리의 목소리로 완성한 작품','함께 완성한 목소리를 들어보세요.'],mine:['내가 쓰고, 함께하는 이야기','내 대본과 참여한 배역, 저장한 목소리를 모았어요.']}[tab];
 return ` <div class="dubbing-section-heading"><div><h2>${genre?esc(genre)+' · ':''}${copy[0]}</h2><p>${copy[1]}</p></div><span class="dubbing-tag">${genre||'모든 장르'}</span></div>
 <div class="dubbing-cards" id="dubbing-cards">${data.projects.map(dubbingCard).join('')}</div>
 ${data.projects.length?'':`<div class="dubbing-empty">${icon('mic')}<h3>${genre?esc(genre)+' ':''}${tab==='mine'?'저장한 대본이 아직 없어요.':tab==='complete'?'완성작을 기다리고 있어요.':'참여할 이야기를 기다리고 있어요.'}</h3><p>${genre?'이 장르의 첫 이야기를 직접 시작해보세요.':'짧은 대화부터 시작해도 좋아요. 함께 연기할 이야기를 만들어보세요.'}</p><a class="primary-button" href="${dubbingNewURL(genre)}">새로 시작하기</a></div>`}
 ${data.nextOffset!==null?'<button class="small-button dubbing-load-more" id="dubbing-load-more">더 보기</button>':''}
 ${payments.length?`<section class="dubbing-panel dubbing-payment-history"><h2>음향 제작 이용 내역</h2>${payments.map(p=>`<div><span>${esc(p.title)}<small>${new Date(p.created*1000).toLocaleDateString('ko-KR')} · ${Number(p.gold)}G</small></span><strong>${({charged:'제작 중',fulfilled:'제작 완료',refunded:`${Number(p.refundedGold)}G 환급`,refund_review:`${Number(p.refundedGold)}G 환급 · 확인 중`})[p.state]||'확인 중'}</strong></div>`).join('')}</section>`:''}`;
}
function dubbingListSelection(raw){
 const q=new URLSearchParams(raw.split('?')[1]);
 return {tab:dubbingTabs.some(t=>t[0]===q.get('tab'))?q.get('tab'):'open',genre:AifectDubbing.DUBBING_GENRES.includes(q.get('genre'))?q.get('genre'):''};
}
async function dubbingRefreshList(raw,ticket){
 const main=$('#main'),results=$('#dubbing-list-results');
 if(!results||!/^dubbing(?:\?|$)/.test(raw)||!/^dubbing(?:\?|$)/.test(main.dataset.route||'')||main.dataset.account!==(me?.id||'guest'))return false;
 const {tab,genre}=dubbingListSelection(raw);
 if(tab==='mine'&&!me)return false;
 main.dataset.route=raw;results.setAttribute('aria-busy','true');
 main.querySelectorAll('.dubbing-tabs a').forEach((a,i)=>{const key=dubbingTabs[i][0];a.href='#dubbing?'+dubbingListQuery(key,genre);a.toggleAttribute('aria-current',key===tab);if(key===tab)a.setAttribute('aria-current','page');});
 main.querySelectorAll('.dubbing-genre-filter a').forEach((a,i)=>{const g=['',...AifectDubbing.DUBBING_GENRES][i];a.href='#dubbing?'+dubbingListQuery(tab,g);a.toggleAttribute('aria-current',g===genre);});
 try{
  const [data,paymentData]=await Promise.all([api('/api/dubbing/projects?'+dubbingListQuery(tab,genre)),tab==='mine'?api('/api/dubbing/payments'):Promise.resolve({payments:[]})]);
  if(ticket!==renderId||!results.isConnected)return true;
  results.innerHTML=dubbingListResultsHTML(data,paymentData.payments,tab,genre);results.removeAttribute('aria-busy');
  bindDubbing({dubbing:true,tab,genre,nextOffset:data.nextOffset,cardCount:data.projects.length});icons();
 }catch(err){if(ticket===renderId&&results.isConnected){results.removeAttribute('aria-busy');results.innerHTML='<p role="alert">'+esc(err.message)+'</p><button class="small-button" id="dubbing-list-retry">다시 불러오기</button>';$('#dubbing-list-retry').onclick=()=>dubbingRefreshList(raw,++renderId);}}
 return true;
}
function dubbingSoundHTML(sound={},isOwner){
 const labels={not_started:'장면에 소리를 더해보세요',queued:'음향 제작 대기 중',planning:'대본에 맞는 음향을 구성하고 있어요',generating:'장면의 소리를 만들고 있어요',mixing:'대사에 맞춰 소리를 배치하고 있어요',ready:'배경 오디오가 준비됐어요',failed:'음향 제작을 완료하지 못했어요',unknown:'음향 요청 결과를 확인하고 있어요'};
 const working=['queued','planning','generating','mixing'].includes(sound.state);
 return `<span class="eyebrow">SOUND DIRECTION</span><h3>${labels[sound.state]||labels.not_started}</h3>
 ${sound.state==='ready'?`<p class="dubbing-muted">${sound.mode==='basic'?'기본 더빙용 무음 트랙':'대사 중 배경음을 낮춘 공통 음향 트랙'} · 모든 배역이 같은 시간축으로 녹음해요.</p><audio controls preload="metadata" src="${esc(sound.audioUrl)}" aria-label="더빙 배경 오디오 미리 듣기"></audio>`:working?`<p class="dubbing-muted">이 화면을 나가도 제작은 계속돼요.</p><progress max="100" value="${Number(sound.progress)||0}" aria-label="음향 제작 진행률"></progress><small>${Number(sound.progress)||0}% · 제작 단계 기준</small>`:`<p class="dubbing-muted">${esc(sound.error||'사건에 맞는 효과음이 중심이에요. BGM은 도입·반전·마무리에 짧고 작게 넣어요.')}</p>`}
 ${isOwner&&sound.state==='not_started'?`<div class="dubbing-form-actions"><button class="small-button" data-dubbing-sound="basic" ${sound.available?'':'disabled'}>기본 배경 준비</button><button class="primary-button" data-dubbing-sound="ai" ${sound.aiAvailable?'':'disabled'}>효과음 생성 · ${Number(sound.priceGold)}G</button></div><p class="dubbing-muted">${sound.aiAvailable?(sound.chargeGold?`생성 전 ${Number(sound.chargeGold)}G 차감을 확인해요. 제작 실패 시 자동 환급돼요.`:'현재 제작 준비 단계에서는 골드가 차감되지 않아요.'):'AI 음향 연동 대기 중 · 기본 배경에는 효과음이 포함되지 않아요.'}</p>`:''}
 ${isOwner&&sound.paymentState==='refunded'?`<p class="dubbing-payment-note">제작에 사용한 ${Number(sound.refundedGold)}G가 자동 환급됐어요.</p>`:isOwner&&sound.paymentState==='refund_review'?`<p class="dubbing-payment-note">${Number(sound.refundedGold)}G 환급 완료 · 취소된 구매분의 나머지 환급은 고객센터 확인이 필요해요.</p>`:''}
 <p class="dubbing-feedback" role="status" aria-live="polite"></p>`;
}
async function dubbingConfirmSound(sound){
 let balance=null;
 if(sound.chargeGold){try{balance=(await api('/api/gold/balance')).balance;}catch{toast('골드 잔액을 확인하지 못했어요. 잠시 뒤 다시 시도해주세요.');return false;}}
 return new Promise(resolve=>{
  const price=Number(sound.priceGold)||50,charge=Number(sound.chargeGold)||0;
  dialog(`<section class="dubbing-page"><span class="eyebrow">AI SOUND DIRECTION</span><h2>이야기에 소리를 더할까요?</h2><p>대본의 사건에 맞는 효과음을 중심으로 만들어요.<br>BGM은 도입·반전·마무리에 짧고 작게 넣고, 웅장한 절정에만 잠깐 더해요.</p><div class="dubbing-quota"><strong>작품당 ${price}G</strong><p>이번 차감 금액 <b>${charge}G</b></p>${balance===null?'':`<p>보유 ${Number(balance)}G · ${balance>=charge?`제작 후 ${Number(balance)-charge}G`:'잔액이 부족해요.'}</p>`}<small>${charge?'확인하면 골드가 차감돼요. 제작 실패 시 자동 환급되며, 같은 대본의 중복 요청에는 다시 결제하지 않아요.':'개발 검증 중으로 실제 골드는 차감되지 않아요.'}</small></div><div class="dubbing-form-actions"><button type="button" class="small-button" id="dubbing-sound-cancel">취소</button>${balance!==null&&balance<charge?'<a class="small-button" href="#gold" id="dubbing-gold-link">골드 충전</a>':''}<button type="button" class="primary-button" id="dubbing-sound-confirm" ${balance!==null&&balance<charge?'disabled':''}>${charge?charge+'G로 제작하기':'확인하고 생성'}</button></div></section>`);
  const modal=$('#dialog');let settled=false;
  const finish=ok=>{if(settled)return;settled=true;modal.removeEventListener('close',cancel);modal.close();resolve(ok);};
  const cancel=()=>finish(false);modal.addEventListener('close',cancel,{once:true});
  $('#dubbing-sound-cancel').onclick=cancel;$('#dubbing-sound-confirm').onclick=()=>finish(true);
  if($('#dubbing-gold-link'))$('#dubbing-gold-link').onclick=cancel;
 });
}
function bindDubbingSound(p){
 const panel=$('#dubbing-sound-panel');if(!panel)return;let pending=false;
 const update=sound=>{p.sound=sound;panel.innerHTML=dubbingSoundHTML(sound,p.isOwner);bind();};
 const poll=async()=>{
  if(!panel.isConnected)return;
  try{const result=await api('/api/dubbing/projects/'+p.id+'/sound');if(panel.isConnected)update(result.sound);}
  catch{if(panel.isConnected){dubbingMessage(panel,'제작 상태를 다시 확인하고 있어요.');setTimeout(poll,10000);}}
 };
 const bind=()=>{
  panel.querySelectorAll('[data-dubbing-sound]').forEach(button=>button.onclick=async()=>{
   if(pending)return;pending=true;
   if(button.dataset.dubbingSound==='ai'&&!await dubbingConfirmSound(p.sound)){pending=false;return;}
   panel.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{const result=await api('/api/dubbing/projects/'+p.id+'/sound','POST',{requestId:crypto.randomUUID(),revision:p.revision,mode:button.dataset.dubbingSound,acceptedGold:p.sound.priceGold,acceptedChargeGold:p.sound.chargeGold});if(panel.isConnected)update(result.sound);}
   catch(err){if(panel.isConnected){update(p.sound);dubbingMessage(panel,err.message);}}finally{pending=false;}
  });
  if(['queued','planning','generating','mixing'].includes(p.sound?.state))setTimeout(poll,5000);
 };bind();
}
function bindDubbingRecordEntry(p,root,route){
 let waiting=false;
 const buttons=[...root.querySelectorAll('[data-dubbing-record-entry]')];
 const message=text=>{const el=root.querySelector('.dubbing-record-entry-status');if(el)el.textContent=text;};
 const open=()=>{const target='dubbing/'+p.id+'?record=1';if(location.hash==='#'+target)void render();else location.hash=target;};
 const finish=sound=>{
  if(!root.isConnected)return;
  p.sound=sound;
  if(sound.state==='ready'){open();return;}
  if(['failed','unknown','not_started'].includes(sound.state)){
   waiting=false;buttons.forEach(b=>b.disabled=false);message(sound.error||'녹음 준비를 완료하지 못했어요. 다시 확인해주세요.');return;
  }
  message(sound.mode==='basic'?'무료 녹음을 준비하고 있어요. 준비되면 녹음 화면으로 이동해요.':'제작 중인 배경 오디오를 기다리고 있어요. 준비되면 녹음 화면으로 이동해요.');
  setTimeout(async()=>{
   if(!root.isConnected)return;
   try{finish((await api('/api/dubbing/projects/'+p.id+'/sound')).sound);}
   catch(err){if(root.isConnected){waiting=false;buttons.forEach(b=>b.disabled=false);message(err.message+' 녹음 시작을 눌러 다시 확인해주세요.');}}
  },3000);
 };
 const enter=async()=>{
  if(waiting||!root.isConnected)return;
  if(p.sound.state==='ready'){open();return;}
  waiting=true;buttons.forEach(b=>b.disabled=true);
  message('선택한 배역의 녹음을 준비하고 있어요…');
  try{finish((await api('/api/dubbing/projects/'+p.id+'/recording/prepare','POST',{})).sound);}
  catch(err){if(root.isConnected){waiting=false;buttons.forEach(b=>b.disabled=false);message(err.message);}}
 };
 buttons.forEach(b=>b.onclick=enter);
 if(new URLSearchParams(route.split('?')[1]).get('record')==='1'&&buttons.length)void enter();
}
function dubbingCueHTML(script,lineId){
 return script.soundCues.filter(c=>c.lineId===lineId&&c.label).map(c=>{
  const musicUse={intro:'도입',transition:'반전 직전',outro:'마무리',climax:'절정'}[c.musicUse];
  return `<div class="dubbing-cue-note">${icon(c.kind==='bgm'?'music':'headphones')} <span>${esc(c.label)}${c.kind==='bgm'?(musicUse?' · '+musicUse:''):c.anchor==='after'?' · 대사 직후':c.anchor==='before'?' · 대사 직전':''}</span></div>`;
 }).join('');
}
function dubbingDetailHTML(p){
 if(p.removed)return dubbingRemovedHTML(p);
 const s=p.script,role=id=>s.roles.find(r=>r.id===id),mine=p.roles.find(r=>r.mine),mineRecording=p.recording?.roles?.find(r=>r.roleId===mine?.id);
 return `<a class="dubbing-back" href="#dubbing">← 더빙 스튜디오</a><header class="dubbing-heading"><span class="eyebrow">${esc(s.genres.join(' · '))} · ${p.visibility==='private'?'비공개 대본':'배역 모집'}</span><h1>${esc(s.title)}</h1><p>${esc(p.ownerName)} · ${s.roles.length}개의 목소리 · 약 ${time(p.duration)}</p></header>
 <div class="dubbing-detail-layout"><div class="dubbing-panel dubbing-script-reader"><div class="dubbing-section-heading"><h2>대본</h2><span>${s.lines.length}개의 대사</span></div>${s.lines.map((l,i)=>`${i===0||s.lines[i-1].sceneId!==l.sceneId?`<div class="dubbing-scene-heading"><span>SCENE ${s.scenes.findIndex(sc=>sc.id===l.sceneId)+1}</span><h3>${esc(s.scenes.find(sc=>sc.id===l.sceneId)?.title||'')}</h3><p>${esc(s.scenes.find(sc=>sc.id===l.sceneId)?.description||'')}</p></div>`:''}${dubbingCueHTML(s,l.id)}<article class="dubbing-reader-line dubbing-cast-${s.roles.findIndex(r=>r.id===l.roleId)%6} ${mine?.id===l.roleId?'is-mine':''}"><span class="dubbing-line-number">${String(i+1).padStart(2,'0')}</span><div><small>${esc([l.emotion,l.direction].filter(Boolean).join(' · '))}</small><p><b>${esc(role(l.roleId)?.name||'')}: </b>${esc(l.text)}</p></div></article>`).join('')}</div>
 <aside>${p.recording?.final?`<section class="dubbing-panel"><span class="eyebrow">OUR VOICES</span><h2>${p.recording.final.audioUrl?'목소리로 완성한 장면':p.recording.final.state==='failed'?'합성 확인 필요':'완성 오디오 준비 중'}</h2>${p.recording.final.audioUrl?`<audio controls preload="metadata" src="${esc(p.recording.final.audioUrl)}" aria-label="완성된 더빙 듣기"></audio><p>${esc(p.roles.map(r=>r.name+' · '+(r.participant||'참여자')).join(' / '))}</p><button class="small-button" data-dubbing-share>작품 공유</button>`:`<p>${esc(p.recording.final.error||'모든 배역의 목소리를 배경음과 합치고 있어요. 잠시 뒤 다시 확인해주세요.')}</p><button class="small-button" onclick="render()">완성 상태 확인</button>`}</section>`:''}${mine&&p.recordingAvailable?`<section class="dubbing-panel"><span class="eyebrow">MY VOICE</span><h3>${esc(mine.name)}의 목소리</h3><p>${mineRecording?.state==='submitted'?'내 배역 녹음 제출 완료':mineRecording?.saved?mineRecording.saved+'개 대사 저장됨':'대사 한 줄부터 시작해보세요.'}</p><button type="button" class="primary-button" data-dubbing-record-entry>${icon('mic')} ${mineRecording?.state==='submitted'?'내 녹음 확인':'녹음 시작'}</button><p class="dubbing-record-entry-status dubbing-muted" role="status">${p.sound.state==='not_started'?'효과음 없이 무료로 시작할 수 있어요. AI 음향을 원하면 먼저 아래에서 제작해주세요.':p.sound.state==='ready'?'선택한 배역의 녹음 화면으로 이동해요.':'배경 오디오 준비 상태를 확인하고 녹음으로 이어져요.'}</p></section>`:''}<section id="dubbing-sound-panel" class="dubbing-panel">${dubbingSoundHTML(p.sound,p.isOwner)}</section><section class="dubbing-panel"><span class="eyebrow">CASTING</span><h2>어떤 배역을 맡을까요?</h2><p class="dubbing-muted">한 작품에서 한 배역을 선택해요.<br>${p.recordingAvailable?'배역을 선택하면 녹음 준비 화면으로 이어져요.':'녹음 기능 연결을 준비하고 있어요.'}</p><div class="dubbing-roles">${p.roles.map((r,i)=>`<article class="dubbing-role ${r.mine?'is-mine':''}"><span class="dubbing-role-avatar">${String.fromCharCode(65+i)}</span><div><h3>${esc(r.name)} <span class="dubbing-role-gender">(${AifectDubbing.dubbingGenderLabel(r.gender)})</span></h3><p>${esc(r.personality||'이 배역의 개성을 함께 만들어주세요.')}</p><small>${r.mine?'내가 맡은 배역':r.claimed?esc(r.participant)+' 참여':'참여 가능'}</small></div><button type="button" class="small-button" data-dubbing-claim="${esc(r.id)}" data-release="${r.mine?'1':''}" ${(r.mine?p.recording?.roles?.some(saved=>saved.roleId===r.id):r.claimed||mine||p.visibility!=='public')?'disabled':''}>${r.mine?(p.recording?.roles?.some(saved=>saved.roleId===r.id)?'녹음 시작됨':'예약 취소'):r.claimed?'예약됨':'선택'}</button></article>`).join('')}</div>
 <p class="dubbing-feedback" role="status" aria-live="polite"></p></section>
 ${p.isOwner?`<section class="dubbing-panel dubbing-manage"><h3>작품 관리</h3>${p.canEdit?`<a class="small-button" href="#dubbing/${esc(p.id)}?edit=1">대본 수정</a>`:'<p class="dubbing-muted">대본 수정은 모집을 중지하고 모든 배역 예약을 취소한 뒤 가능해요.</p>'}
 ${p.visibility==='private'?'<label class="dubbing-consent"><input id="dubbing-rights" type="checkbox"> 이 대본을 공개하고 다른 사람과 함께 연기할 저작권 또는 적법한 이용 권한이 있습니다.</label><button type="button" class="primary-button" id="dubbing-publish">배역 모집 시작</button>':'<button type="button" class="small-button" id="dubbing-unpublish">모집 중지 · 비공개로</button>'}</section>`:''}
 ${p.visibility==='public'?`<section class="dubbing-panel"><h2>이 대본으로 계속 함께해요</h2><p>완성된 더빙은 남기고, 누구나 새로 시작하거나 빈 배역에 합류할 수 있어요.</p><label>새로 시작할 배역<select id="dubbing-new-role">${s.roles.map((r,i)=>`<option value="${esc(r.id)}">${String.fromCharCode(65+i)} · ${esc(r.name)} (${AifectDubbing.dubbingGenderLabel(r.gender)})</option>`).join('')}</select></label><button class="primary-button" id="dubbing-start-version" ${p.sound.state==='ready'?'':'disabled'}>새 더빙 시작</button>${p.sound.state!=='ready'?'<p class="dubbing-muted">배경 오디오가 준비되면 시작할 수 있어요.</p>':''}<div class="dubbing-versions">${(p.versions||[]).map(v=>`<a href="#dubbing/${esc(v.id)}"><span><b>${esc(v.ownerName)}의 더빙${v.mine?' · 참여 중':''}</b><small>${v.state==='complete'?'완성된 더빙':v.participants<v.roleCount?'빈 배역 '+(v.roleCount-v.participants)+'자리':'녹음 중'} · ${v.participants}/${v.roleCount}명</small></span>${icon('chevron')}</a>`).join('')}</div></section>`:''}
 ${p.isOwner?'<section class="dubbing-panel"><button class="small-button danger-button" id="dubbing-delete-project">대본 · 더빙 삭제</button><p class="dubbing-feedback" role="status"></p></section>':''}
 </aside></div>${dubbingCommunityHTML(p)}`;
}
function dubbingPendingKey(){return 'aifect-dubbing-generation:'+(me?.id||'guest');}
function dubbingPending(){try{return JSON.parse(sessionStorage.getItem(dubbingPendingKey())||'null');}catch{return null;}}
function dubbingRememberPending(v){try{if(v)sessionStorage.setItem(dubbingPendingKey(),JSON.stringify(v));else sessionStorage.removeItem(dubbingPendingKey());}catch{}}
function dubbingMessage(root,message){const el=root.querySelector('.dubbing-feedback');if(el)el.textContent=message;}
function dubbingEditorHTML(e){
 const s=e.script;
 return `<a class="dubbing-back" href="${e.project?'#dubbing/'+esc(e.id):'#dubbing'}">← ${e.project?'작품으로':'더빙 스튜디오'}</a><header class="dubbing-editor-heading"><div><span class="eyebrow">SCRIPT EDITOR</span><h1>당신의 말투로 다듬어보세요.</h1><p>대본은 비공개로 저장됩니다. 저장 후 배역 모집을 시작할 수 있어요.</p></div><span class="dubbing-tag" id="dubbing-save-state">${e.dirty?'저장하지 않은 변경':'저장된 대본'}</span></header>
 <form id="dubbing-editor-form"><div class="dubbing-editor-layout"><section class="dubbing-panel dubbing-editor-main"><label class="dubbing-title-field">작품 제목<input name="title" data-db-title maxlength="100" required value="${esc(s.title)}" placeholder="이야기의 제목을 적어주세요"></label>
 <div class="dubbing-section-heading"><h2>장면과 대사</h2><button type="button" class="small-button" data-db-editor-mode>${e.detailed?'간단히 쓰기':'세부 설정'}</button><button type="button" class="small-button" data-db-add-scene>장면 추가</button></div>
 ${s.scenes.map((sc,si)=>`<section class="dubbing-editor-scene"><div class="dubbing-scene-heading"><span>SCENE ${si+1}</span><label>장면 제목<input data-db-scene="${esc(sc.id)}" data-field="title" maxlength="80" required value="${esc(sc.title)}"></label><label>장면 설명<textarea data-db-scene="${esc(sc.id)}" data-field="description" maxlength="500" rows="2" placeholder="시간, 장소, 상황을 적어주세요">${esc(sc.description)}</textarea></label></div>
 ${!e.detailed?`<label class="dubbing-simple-label">대사 쓰기<textarea class="dubbing-simple-text" data-db-simple="${esc(sc.id)}" rows="11" spellcheck="false" placeholder="A: 안녕, 오늘 어땠어?&#10;B: 너를 기다리고 있었어.&#10;A: 정말?" aria-describedby="dubbing-simple-help">${esc(e.simpleDrafts?.[sc.id]??AifectDubbing.simpleDubbingText(s,sc.id))}</textarea></label><p class="dubbing-muted" id="dubbing-simple-help">A: 대사 · B: 대사처럼 한 줄씩 적어주세요. 배역 이름은 오른쪽에서 바꿀 수 있어요.</p>`:` ${s.lines.filter(l=>l.sceneId===sc.id).map(l=>`<article class="dubbing-edit-line"><div class="dubbing-line-top"><span>${String(s.lines.indexOf(l)+1).padStart(2,'0')}</span><label class="dubbing-select-role">배역<select data-db-line="${esc(l.id)}" data-field="roleId">${s.roles.map(r=>`<option value="${esc(r.id)}" ${l.roleId===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><button type="button" class="dubbing-icon-button" data-db-move="${esc(l.id)}" data-step="-1" aria-label="대사 위로">↑</button><button type="button" class="dubbing-icon-button" data-db-move="${esc(l.id)}" data-step="1" aria-label="대사 아래로">↓</button><button type="button" class="dubbing-icon-button" data-db-remove="${esc(l.id)}" aria-label="대사 삭제">×</button></div><label>대사<textarea data-db-line="${esc(l.id)}" data-field="text" rows="3" maxlength="700" required placeholder="이 배역이 할 말을 적어주세요">${esc(l.text)}</textarea></label>
 <div class="dubbing-line-directions"><label>감정<input data-db-line="${esc(l.id)}" data-field="emotion" maxlength="80" value="${esc(l.emotion)}" placeholder="차분하게"></label><label>연기 지시<input data-db-line="${esc(l.id)}" data-field="direction" maxlength="240" value="${esc(l.direction)}" placeholder="한 박자 쉬고"></label></div><details><summary>대사 시간과 여유 조절</summary><div class="dubbing-form-grid"><label>예상 발화 (초)<input type="number" min="1" max="40" step=".1" data-db-line="${esc(l.id)}" data-field="durationSeconds" value="${l.durationSeconds}" required></label><label>다음 대사까지 (초)<input type="number" min=".3" max="8" step=".1" data-db-line="${esc(l.id)}" data-field="gapSeconds" value="${l.gapSeconds}" required></label></div></details></article>`).join('')}
 <div class="dubbing-form-actions"><button type="button" class="small-button" data-db-add-line="${esc(sc.id)}">+ 대사 추가</button>${s.scenes.length>1?`<button type="button" class="small-button" data-db-remove-scene="${esc(sc.id)}">빈 장면 삭제</button>`:''}</div>`}
</section>`).join('')}</section>
 <aside><section class="dubbing-panel"><span class="eyebrow">CHARACTERS</span><h2>${s.roles.length}개의 목소리</h2>${s.roles.map((r,i)=>`<div class="dubbing-edit-role"><span class="dubbing-role-avatar">${String.fromCharCode(65+i)}</span><div><label>배역 이름<input data-db-role="${esc(r.id)}" data-field="name" maxlength="40" required value="${esc(r.name)}"></label><label>캐릭터 성별<select data-db-role="${esc(r.id)}" data-field="gender">${AifectDubbing.DUBBING_GENDERS.map(g=>`<option value="${g}" ${(r.gender||'unspecified')===g?'selected':''}>${AifectDubbing.dubbingGenderLabel(g)}</option>`).join('')}</select></label><label>성격<textarea data-db-role="${esc(r.id)}" data-field="personality" maxlength="240" rows="2" placeholder="이 인물은 어떤 사람인가요?">${esc(r.personality)}</textarea></label></div></div>`).join('')}</section>
 <section class="dubbing-panel"><h3>대본 정보</h3><p>${esc(e.options.genres.join(' · '))} · 목표 ${dubbingLengthLabel(e.options.minutes)}</p><p id="dubbing-duration">예상 길이 계산 중</p><p class="dubbing-muted">음향과 녹음 여유를 포함해 최대 5분까지 저장할 수 있어요.</p>
 <button type="button" class="small-button" id="dubbing-regenerate" ${e.config.aiAvailable?'':'disabled'}>AI로 대본 전체 다시 만들기</button><p class="dubbing-muted">${e.config.aiAvailable?dubbingGenerationEstimate+'. 새 대본이 완성되면 현재 편집 내용이 교체됩니다.':'AI 대본 연동 대기 중'}</p></section>
 <section class="dubbing-panel dubbing-next"><h3>음향 연출</h3><p>${s.soundCues.length?`${s.soundCues.length}개의 음향 연출 위치가 대본에 연결되어 있어요.`:'필요한 음향은 다음 단계에서 AI가 대본을 분석해 구성해요.'}</p>${s.lines.map(l=>dubbingCueHTML(s,l.id)).join('')}<p class="dubbing-muted">오디오 생성은 아직 시작하지 않았어요.</p></section></aside></div>
 <div class="dubbing-save-bar"><div><p class="dubbing-feedback" role="status" aria-live="polite"></p><span class="dubbing-muted">비공개 저장 · 골드 차감 없음</span></div><button type="submit" class="primary-button" id="dubbing-save">${icon('save')} 대본 저장</button></div></form>`;
}
function dubbingMarkDirty(e){e.dirty=true;const badge=$('#dubbing-save-state');if(badge)badge.textContent='저장하지 않은 변경';dubbingDuration(e);}
function dubbingDuration(e){const el=$('#dubbing-duration');if(el){try{el.textContent='예상 길이 '+time(AifectDubbing.dubbingTimeline(e.script).duration);}catch{el.textContent='대사 시간을 확인해주세요.';}}}
function dubbingMountEditor(e){
 dubbingEditor=e;const root=$('#main .dubbing-page');if(!root)return;
 root.innerHTML=dubbingModeNav()+dubbingEditorHTML(e);icons();dubbingDuration(e);
 const form=$('#dubbing-editor-form');
 form.oninput=event=>{
  const el=event.target;
  if(el.dataset.dbSimple){
   e.simpleDrafts??={};e.simpleDrafts[el.dataset.dbSimple]=el.value;
   try{e.script=AifectDubbing.applySimpleDubbingText(e.script,el.dataset.dbSimple,el.value);dubbingMessage(form,'');}catch(err){dubbingMessage(form,err.message);}
   dubbingMarkDirty(e);return;
  }
  if(el.matches('[data-db-title]'))e.script.title=el.value;
  const target=el.dataset.dbLine?e.script.lines.find(l=>l.id===el.dataset.dbLine):el.dataset.dbRole?e.script.roles.find(r=>r.id===el.dataset.dbRole):el.dataset.dbScene?e.script.scenes.find(s=>s.id===el.dataset.dbScene):null;
  if(target&&el.dataset.field)target[el.dataset.field]=el.type==='number'?Number(el.value):el.value;
  if(el.dataset.dbRole&&el.dataset.field==='name')form.querySelectorAll(`[data-field="roleId"] option`).forEach(opt=>{if(opt.value===el.dataset.dbRole)opt.textContent=el.value;});
  dubbingMarkDirty(e);
 };
 form.onclick=event=>{
  const b=event.target.closest('button');if(!b||!form.contains(b)||e.busy)return;
  try{dubbingApplySimpleDrafts(e);}catch(err){dubbingMessage(form,err.message);return;}
  if(b.hasAttribute('data-db-editor-mode')){e.detailed=!e.detailed;dubbingMountEditor(e);return;}
  const s=e.script;
  if(b.hasAttribute('data-db-add-scene')){
   if(s.scenes.length>=12){dubbingMessage(form,'장면은 최대 12개까지 추가할 수 있어요.');return;}
   s.scenes.push({id:crypto.randomUUID(),title:'새 장면',description:''});
  }else if(b.dataset.dbAddLine){
   if(s.lines.length>=120){dubbingMessage(form,'대사는 최대 120개까지 추가할 수 있어요.');return;}
   const sceneId=b.dataset.dbAddLine,last=s.lines.findLastIndex(l=>l.sceneId===sceneId);
   const next={id:crypto.randomUUID(),order:0,sceneId,roleId:s.roles[0].id,text:'',emotion:'자연스럽게',direction:'',durationSeconds:5,gapSeconds:1};
   s.lines.splice(last<0?s.lines.length:last+1,0,next);
  }else if(b.dataset.dbRemove){
   s.lines=s.lines.filter(l=>l.id!==b.dataset.dbRemove);s.soundCues=s.soundCues.filter(c=>c.lineId!==b.dataset.dbRemove&&c.endLineId!==b.dataset.dbRemove);
  }else if(b.dataset.dbMove){
   const i=s.lines.findIndex(l=>l.id===b.dataset.dbMove),j=i+Number(b.dataset.step);
   if(j<0||j>=s.lines.length||s.lines[j].sceneId!==s.lines[i].sceneId)return;
   [s.lines[i],s.lines[j]]=[s.lines[j],s.lines[i]];
  }else if(b.dataset.dbRemoveScene){
   if(s.lines.some(l=>l.sceneId===b.dataset.dbRemoveScene)){dubbingMessage(form,'대사가 없는 장면만 삭제할 수 있어요.');return;}
   s.scenes=s.scenes.filter(sc=>sc.id!==b.dataset.dbRemoveScene);
  }else return;
  s.lines.forEach((l,i)=>l.order=i+1);dubbingMarkDirty(e);dubbingMountEditor(e);
 };
 form.onsubmit=async event=>{
  event.preventDefault();if(e.busy)return;
  try{dubbingApplySimpleDrafts(e);e.script=AifectDubbing.validateDubbingScript(e.script,e.options);}catch(err){dubbingMessage(form,err.message);return;}
  e.busy=true;form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=true);
  dubbingMessage(form,'대본을 저장하고 있어요…');
  try{
   const body={id:e.id,options:e.options,script:e.script,generationId:e.generationId,revision:e.project?.revision};
   const result=await api('/api/dubbing/projects'+(e.project?'/'+e.id:''),e.project?'PUT':'POST',body);
   e.dirty=false;e.project=result.project;dubbingEditor=null;location.hash='dubbing/'+e.id;
  }catch(err){dubbingMessage(form,err.message+' 입력한 대본은 이 화면에 유지됩니다.');}
  finally{e.busy=false;if(form.isConnected){form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=false);$('#dubbing-regenerate').disabled=!e.config.aiAvailable;}}
 };
 $('#dubbing-regenerate').onclick=async()=>{
  if(e.busy||!confirm('AI가 새 대본을 완성하면 현재 편집 내용이 교체됩니다. 다시 만들까요?'))return;
  e.busy=true;const b=$('#dubbing-regenerate');b.disabled=true;
  form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=true);
  try{
   const pending={requestId:crypto.randomUUID(),options:e.options};dubbingRememberPending(pending);dubbingMessage(form,'새 대본을 만들고 있어요. '+dubbingGenerationEstimate+'.');
   const result=await dubbingWaitForGeneration(await api('/api/dubbing/generations','POST',pending),form);
   if(result.recoverable===false)dubbingRememberPending(null);
   if(result.state!=='ready')throw new Error(result.message||'생성 중입니다. 대본 만들기 화면에서 결과를 다시 확인할 수 있어요.');
   if(dubbingEditor!==e)return;
   dubbingRememberPending(null);e.script=result.script;e.simpleDrafts={};e.generationId=result.id;e.dirty=true;dubbingMountEditor(e);
  }catch(err){dubbingMessage(form,err.message);}finally{e.busy=false;if(form.isConnected)form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=false);}
 };
}
function bindDubbing(view){
 if(!view?.dubbing)return;
 const root=$('#main .dubbing-page');if(!root)return;
 if(view.recordingData){bindDubbingRecorder(view,root);return;}
 if(view.editing){const p=view.project;dubbingMountEditor({id:p.id,project:p,script:structuredClone(p.script),options:p.options,config:view.config,route:view.route,dirty:false});return;}
 if(view.dubbingCreate){
  const form=$('#dubbing-options-form'),recover=$('#dubbing-recover');let busy=false;
  const updateCreate=()=>{form.querySelector('[value=ai]').disabled=busy||!!dubbingRewardOperation||!view.config.aiAvailable||!form.elements.idea.value.trim()||(view.config.quota?.remaining??1)<1;form.querySelector('[value=manual]').disabled=busy;$('#dubbing-random-idea').disabled=busy;recover.disabled=busy;};
  const refreshQuota=async()=>{try{view.config=await api('/api/dubbing/config');if(!form.isConnected)return;$('#dubbing-quota').innerHTML=dubbingQuotaHTML(view.config.quota);bindDubbingReward(view,form,updateCreate);}catch{}if(form.isConnected)updateCreate();};
  form.oninput=updateCreate;updateCreate();
  $('#dubbing-random-idea').onclick=()=>{
   const options={genres:[...form.querySelectorAll('[name=genres]:checked')].map(e=>e.value),roleCount:Number(form.elements.roleCount.value),minutes:Number(form.elements.minutes.value)};
   if(!options.genres.length){dubbingMessage(form,'장르를 먼저 골라주세요.');return;}
   form.elements.idea.value='(랜덤)';updateCreate();
   dubbingMessage(form,'어떤 이야기가 나올지는 대본 완성 후 확인해보세요. ‘대본 작성하기’를 눌러야 작성 횟수가 사용돼요.');
  };
  bindDubbingReward(view,form,updateCreate);
  recover.hidden=!dubbingPending();
  if(!dubbingPending())api('/api/dubbing/generations/latest').then(result=>{
   if(!form.isConnected||busy||dubbingPending()||!result.id)return;
   if(result.recoverable!==false){dubbingRememberPending({requestId:result.id,options:result.options});recover.hidden=false;}
   else{dubbingMessage(form,result.message);refreshQuota();}
  }).catch(()=>{});
  const show=async result=>{
   result=await dubbingWaitForGeneration(result,form);
   if(!form.isConnected)return;
   if(result.state!=='ready'){dubbingMessage(form,result.message||'대본 생성 중입니다. 잠시 뒤 결과 확인을 눌러주세요.');recover.hidden=result.recoverable===false;if(result.recoverable===false)dubbingRememberPending(null);return;}
   const pending=dubbingPending();dubbingRememberPending(null);
   dubbingMountEditor({id:crypto.randomUUID(),script:result.script,options:pending?.options||result.options,generationId:result.id,config:view.config,route:view.route,dirty:true});
  };
  recover.onclick=async()=>{if(busy)return;const pending=dubbingPending();if(!pending)return;busy=true;updateCreate();try{await show(await api('/api/dubbing/generations/'+pending.requestId));}catch(err){dubbingMessage(form,err.message+' 잠시 뒤 이전 결과 확인을 눌러주세요.');}finally{busy=false;await refreshQuota();}};
  form.onchange=e=>{if(e.target.name==='genres'&&form.querySelectorAll('[name=genres]:checked').length>2){e.target.checked=false;dubbingMessage(form,'장르는 최대 2개까지 선택할 수 있어요.');}};
  form.onsubmit=async event=>{
   event.preventDefault();if(busy||dubbingRewardOperation)return;
   const fd=new FormData(form);let options;
   try{options=AifectDubbing.dubbingOptions({genres:fd.getAll('genres'),roleCount:Number(fd.get('roleCount')),minutes:Number(fd.get('minutes')),mood:fd.get('mood'),ending:fd.get('ending'),idea:fd.get('idea')});}
   catch(err){dubbingMessage(form,err.message);return;}
   if(event.submitter?.value!=='ai'){dubbingMountEditor({id:crypto.randomUUID(),script:AifectDubbing.emptyDubbingScript(options),options,config:view.config,route:view.route,dirty:true});return;}
   if(!options.idea.trim()){dubbingMessage(form,'이야기의 세부사항을 먼저 적어주세요.');return;}
   if(dubbingPending()&&!confirm('이전 생성 요청이 있습니다. 먼저 결과 확인을 권장합니다. 새 요청을 시작할까요?'))return;
   const pending={requestId:crypto.randomUUID(),options};dubbingRememberPending(pending);
   busy=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);dubbingMessage(form,'이야기와 배역, 음향 연출을 구성하고 있어요… '+dubbingGenerationEstimate+'.');
   try{await show(await api('/api/dubbing/generations','POST',pending));}
   catch(err){dubbingMessage(form,err.message+' 결과 확인 버튼으로 기존 요청을 확인할 수 있어요.');recover.hidden=false;}
   finally{busy=false;if(form.isConnected)await refreshQuota();}
  };return;
 }
 if(view.project){
  const p=view.project;let busy=false;
  bindDubbingCommunity(p,root);
  bindDubbingSound(p);
  bindDubbingRecordEntry(p,root,view.route);
  const share=root.querySelector('[data-dubbing-share]');if(share)share.onclick=async()=>{const url=location.origin+'/#dubbing/'+p.id;try{if(navigator.share)await navigator.share({title:p.title,url});else{await navigator.clipboard.writeText(url);toast('작품 링크를 복사했어요.');}}catch{}};
  const mutate=async(path,method,body)=>{
   if(busy)return;if(!me){returnRoute=location.hash;location.hash='account';return;}
   busy=true;const disabled=new Map([...root.querySelectorAll('button')].map(b=>[b,b.disabled]));disabled.forEach((_,b)=>b.disabled=true);
   try{const result=await api('/api/dubbing/projects/'+p.id+path,method,{revision:p.revision,...body});if(result.deleted||result.released&&!result.project)location.hash='dubbing?tab=mine';else if(result.id&&!result.project)location.hash='dubbing/'+result.id+'?record=1';else if(path.startsWith('/claims/')&&method==='POST')location.hash='dubbing/'+p.id+'?record=1';else await render();}
   catch(err){dubbingMessage(root,err.message);disabled.forEach((value,b)=>b.disabled=value);}
   finally{busy=false;}
  };
  root.querySelectorAll('[data-dubbing-claim]').forEach(b=>b.onclick=()=>mutate('/claims/'+b.dataset.dubbingClaim,b.dataset.release?'DELETE':'POST',{}));
  const publish=$('#dubbing-publish');if(publish)publish.onclick=()=>{if(!$('#dubbing-rights').checked){dubbingMessage(root,'대본 공개 및 공동 연기에 대한 권한을 확인해주세요.');return;}void mutate('/publish','POST',{rightsAccepted:true});};
  const unpublish=$('#dubbing-unpublish');if(unpublish)unpublish.onclick=()=>mutate('/unpublish','POST',{});
  const start=$('#dubbing-start-version');if(start){const requestId=crypto.randomUUID();start.onclick=()=>mutate('/performances','POST',{id:requestId,roleId:$('#dubbing-new-role').value});}
  const remove=$('#dubbing-delete-project');if(remove)remove.onclick=()=>{if(confirm(p.rootId===p.id?'이 대본을 삭제할까요? 이 대본으로 시작한 더빙도 목록과 공유 링크에서 열 수 없게 됩니다.':'내가 시작한 이 더빙을 삭제할까요? 원본 대본과 다른 사람의 버전은 유지됩니다.'))void mutate('','DELETE',{});};
 }
 const more=$('#dubbing-load-more');
 if(more)more.onclick=async()=>{more.disabled=true;try{const d=await api('/api/dubbing/projects?'+dubbingListQuery(view.tab,view.genre,view.nextOffset));$('#dubbing-cards').insertAdjacentHTML('beforeend',d.projects.map((p,i)=>dubbingCard(p,i+view.cardCount)).join(''));view.cardCount+=d.projects.length;view.nextOffset=d.nextOffset;more.hidden=d.nextOffset===null;icons();}catch(err){toast(err.message);}finally{more.disabled=false;}};
}

function dubbingApplySimpleDrafts(e){for(const [sceneId,text] of Object.entries(e.simpleDrafts||{}))e.script=AifectDubbing.applySimpleDubbingText(e.script,sceneId,text);e.simpleDrafts={};}
