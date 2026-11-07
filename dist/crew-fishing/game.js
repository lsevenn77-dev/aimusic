import {fishingLobby} from './lobby.js';
import {profileNickname} from '/nickname-profile-host.js';
import {renderGameRankings} from '/crew-game-lobby.js';
import {FISH} from './catalog.js';
import {TIERS,position,formatLength} from './rules.js';
import {createScene} from './scene.js';
import {bindMobileReelInput} from './mobile-input.js';
import {createRequestId} from './request-id.js';
import {animationDeadline} from './animation.js';
import {clockSample} from './timing.js';
import {createReel} from './reel.js';

const app=document.querySelector('#app'), errorBox=document.querySelector('#error');
const dialog=document.querySelector('#rules');
const mobileControls=matchMedia('(max-width:650px), (hover:none) and (pointer:coarse)');
const syncControls=()=>document.body.classList.toggle('mobile-controls',mobileControls.matches);
syncControls();
if(mobileControls.addEventListener)mobileControls.addEventListener('change',syncControls);
else mobileControls.addListener(syncControls);
document.querySelector('#rulesOpen').onclick=()=>dialog.showModal();
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('ko-KR');
const fishById=new Map(FISH.map(f=>[f.id,f]));
const art=f=>`./art/${f.id}.webp`;
let lobby,cast,screen='',pending=false,requestId=null,clockOffset=0,clockDelay=Infinity,frame=0,frameElapsed=null,book,scene=null,reel=null,biteTimer=0,idleTimer=0;
let hapticPort=null,lastBite=null;
window.addEventListener('message',event=>{
  if(event.data==='aifect:fishing-haptics'&&event.ports?.length===1&&!event.source){
    hapticPort?.close();hapticPort=event.ports[0];
  }
});
function signalBite(){
  if(lastBite===cast.id||document.hidden||now()>=cast.expiresAt)return;
  lastBite=cast.id;
  try{if(hapticPort){hapticPort.postMessage('bite');return;}}catch{/* A recreated WebView may no longer own this port. */}
  try{globalThis.navigator?.vibrate?.(65);}catch{/* Haptics are optional. */}
}
const now=()=>performance.now()+clockOffset;
function showError(message){errorBox.textContent=message;errorBox.hidden=!message}
function paint(name,html){
  clearTimeout(biteTimer);clearTimeout(idleTimer);reel?.dispose();reel=null;cancelAnimationFrame(frame);scene?.destroy();scene=null;screen=name;app.toggleAttribute('data-game-lobby',name==='lobby');app.classList.toggle('fishing-lobby',name==='lobby');app.innerHTML=html;window.scrollTo(0,0);
}
async function fetchAPI(action,data){
  const before=performance.now();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch('/api/crew-fishing/'+action+(action==='lobby' && new URLSearchParams(location.search).get('mode')==='practice'?'?mode=practice':''),{...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{cache:'no-store'}),signal:controller.signal});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'낚시 정보를 불러오지 못했어요.');
    const sample=clockSample(before,performance.now(),result);
    if(sample&&sample.delay<=clockDelay){clockOffset=sample.offset;clockDelay=sample.delay;}
    return result;
  }catch(error){
    if(controller.signal.aborted)throw Error('연결이 지연됐어요. 다시 눌러주세요. 낚시 기록은 중복으로 소모되지 않아요.');
    throw error;
  }finally{clearTimeout(timer);}
}
let practice=null;
async function api(action,data){
  if(practice && action!=='lobby')return practice.request(action,data);
  const result=await fetchAPI(action,data);
  if(!result.practice){if(action==='lobby')practice=null;return result;}
  if(practice?.scope!==result.scope){
    const {practiceSession}=await import('./practice.js');
    practice=practiceSession(result,async()=>(await fetchAPI('practice-cast',{})).draw,()=>performance.now()+clockOffset);
  }
  return practice.lobby();
}
async function refreshLobby(){
  lobby=await api('lobby');cast=lobby.cast;
  document.querySelector('#back').href='/#crew/'+encodeURIComponent(lobby.crew);
 document.body.classList.toggle('practice',Boolean(lobby.practice));
}
async function openLobby(refresh=true){
  if(refresh)await refreshLobby();
  paint('lobby',fishingLobby(lobby,cast));
  if(!lobby.practice)renderGameRankings(document.querySelector('#fishingRankings'),{crews:lobby.crews,players:lobby.individual,crewId:lobby.crew,crewDescription:'잡은 모든 물고기의 주간 평가액 합계',playerDescription:'개인별 주간 어획액 합계',unit:'원'});
}
function loop(){
  cancelAnimationFrame(frame);
  const needle=document.querySelector('.needle');
  if(!needle||screen!=='play'||cast.status!=='active'||document.hidden||app.querySelector('.stage.casting'))return;
  const animate=()=>{frameElapsed=Math.max(0,performance.now()+clockOffset-cast.start);needle.style.left=position(frameElapsed,cast.cycle)+'%';frame=requestAnimationFrame(animate)};
  animate();
}
function updateMeter(message){
  document.querySelector('#pullfeedback').textContent=message;
}
// intro: 새로 던진 낚시면 던지기·입질 연출 뒤에 당기기 막대를 보여준다
function play(intro){
  frameElapsed=null;
  const waiting=now()<cast.start;
  paint('play',`<section class="stage${waiting?' casting':''}"><button type="button" class="reel-surface" data-reel-surface aria-label="낚시 화면 · 터치해서 당기기"></button><div class="stagehead"><div><small>ON THE WATER</small><h2>${waiting?'입질을 기다리는 중…':'물고기가 걸렸어요'}</h2></div><div class="actions"><button data-act="lobby">대기실</button></div></div>
  <p class="callout" aria-hidden="true"></p>
  <div class="console"><div class="titlebar"><div class="gauge-title"><small>REEL TIMING</small><h3>릴 타이밍</h3></div></div><div class="meter" aria-label="민트색 성공 구역에 맞춰 당기기"><i class="target" style="left:${cast.target}%;width:${cast.width}%"></i><i class="needle"></i></div><div class="stagefoot"><div><p id="pullfeedback" role="status"></p><small><span class="desktop-hint">스페이스바 또는 화면 클릭</span><span class="mobile-hint">낚시 화면을 터치해서 당기기</span></small></div></div></div></section>`);
  updateMeter('찌가 민트색 구간에 닿으면 당기세요.');
  const stage=app.querySelector('.stage');
  bindMobileReelInput({root:stage.querySelector('[data-reel-surface]'),mobile:()=>true,
    playing:()=>screen==='play'&&!dialog.open&&!stage.classList.contains('casting')&&!stage.classList.contains('ending'),
    pull,
    pointerEvents:'PointerEvent' in window});
  try{scene=createScene(stage,{goal:cast.goal,progress:cast.progress});}catch{scene=null;}
  let ending=null;
  const scheduleIdle=()=>{
    clearTimeout(idleTimer);
    if(cast.status==='active'&&stage.isConnected)idleTimer=setTimeout(()=>reel?.expire(now()-cast.start),Math.max(100,cast.expiresAt-now()));
  };
  const endVisual=()=>{
    if(ending)return;
    clearTimeout(idleTimer);cancelAnimationFrame(frame);stage.classList.add('ending');
    ending=animationDeadline(()=>cast.status==='caught'?scene?.land():scene?.escape(),3000);
  };
  reel=createReel({initial:cast,request:input=>api('pull',input),
    onChange:(next,kind)=>{
      cast=next;
      if(kind==='reset'){
        ending=null;stage.classList.remove('ending');
        try{scene?.hooked();}catch{}
      }
      if(kind!=='touch')updateMeter(kind==='success'?'성공! 당겼어요.':kind==='idle'?'물고기가 도망갔어요.':kind==='warning'||kind==='miss'?'줄이 느슨해졌어요. 다시 당겨보세요.':'막대에 맞춰 다시 당기세요.');
      try{scene?.pull(kind,cast.progress);}catch{}
      if(cast.status!=='active')endVisual();else{scheduleIdle();if(kind==='reset')loop();}
    },
    onConfirmed:(next,settled)=>{if(settled){cast=next;scheduleIdle();}},
    onFinish:async next=>{
      cast=next;endVisual();await ending;
      if(screen==='play'&&stage.isConnected)finish();
    },
    onError:error=>{showError(error.message);updateMeter(error.message||'연결을 확인한 뒤 다시 당겨주세요.');}
  });
  // The persisted bite time, not the renderer, controls when fishing becomes playable.
  // Reduced motion, missing canvas and resuming a tab must all honor the same wait.
  const begin=()=>{
    if(screen!=='play'||!stage.isConnected)return;
    if(now()<cast.start){biteTimer=setTimeout(begin,cast.start-now());return;}
    try{scene?.hooked();}catch{}
    stage.classList.remove('casting');stage.querySelector('h2').textContent='물고기가 걸렸어요';
    if(waiting||intro)signalBite();
    loop();scheduleIdle();
  };
  if(waiting){
    try{Promise.resolve(scene?.cast({duration:cast.start-now(),resume:!intro})).catch(()=>{});}catch{}
    biteTimer=setTimeout(begin,Math.max(0,cast.start-now()));
  }else begin();
}
async function start(){
  const fresh=!cast||cast.status!=='active';
  if(fresh){
    // Keep one key across retries; quota changes must not reuse an older cast's key.
    requestId??=createRequestId();
    const result=await api('cast',{requestId});cast=result.cast;requestId=null;
  }
  if(cast.status==='active')play(fresh);else finish();
}
function pull(){
  if(pending||screen!=='play'||dialog.open||app.querySelector('.stage.casting'))return;
  showError('');
  reel?.tap(frameElapsed??Math.max(0,performance.now()+clockOffset-cast.start));
}
// 결과 카드에서 물고기 둘레로 반짝이는 위치 [x%, y%, 지연초]
const SPARK_SPOTS=[[8,30,0],[18,78,.5],[30,10,1.1],[50,92,.3],[66,6,.8],[82,24,1.4],[92,66,.2],[74,88,1],[40,50,1.7],[12,52,1.3]];
function finish(){
  const f=fishById.get(cast.fish),caught=cast.status==='caught';
  paint('result',`<section class="result" data-tier="${caught?f.tier:''}"><small>CATCH REPORT</small><h1>${caught?'포획 성공!':'물고기가 도망갔어요'}</h1>
  <div class="trophy${caught?' caught':''}" style="--art:url(${art(f)})">${caught?'<i class="rays"></i>'+SPARK_SPOTS.map(([x,y,d])=>`<i class="spark" style="--x:${x}%;--y:${y}%;--d:${d}s"></i>`).join(''):''}<img src="${art(f)}" alt="${esc(f.name)}"></div><h2>${TIERS[f.tier].name} · ${esc(f.name)}</h2><p>${formatLength(cast.length)} · ${cast.grade}등급</p><strong>${fmt(cast.value)}원</strong><p class="badge">${lobby.practice?(caught?'이번 연습 도감에 기록했어요.':'이번 낚시의 평가액은 0원이에요.'):cast.notice==='new'?'우리 크루 도감에 처음 등록됐어요!':cast.notice==='best'?'우리 크루의 최고 길이를 경신했어요!':caught?'크루 주간 어획액에 반영됐어요.':'이번 낚시의 평가액은 0원이에요.'}</p>
  <div class="actions"><button class="primary" data-act="retry">다시 낚시</button><button data-act="lobby">대기실</button><button data-act="aquarium">수족관</button></div></section>`);
}
function specimen(f,r){
  const record=r?`최고 ${formatLength(r.length)} · ${r.grade}등급<br>${profileNickname(r.nickname,{userId:r.user_id})}`:'미발견';
  return `<article id="fish-${f.id}" class="specimen ${r?'':'undiscovered'}"><img loading="lazy" src="${art(f)}" alt=""><small>${TIERS[f.tier].name}</small><h3>${esc(f.name)}</h3><p>표준 ${formatLength(f.standardCm*10000)}<br>${record}</p></article>`;
}
async function collection(mode,focus=''){
  book=await api('book');
  const records=new Map(book.records.map(r=>[r.fish,r])), tank=mode==='aquarium';
  const specimens=FISH.filter(f=>records.has(f.id));
  paint(mode,`<div class="titlebar"><div><small>${tank?'CREW AQUARIUM':'FIELD GUIDE'}</small><h1>${tank?(lobby.practice?'연습 수족관':'크루 수족관'):'물고기 도감'}</h1><p>${esc(book.name)} · 발견 ${records.size} / ${FISH.length}종</p></div><div class="actions"><button data-act="${tank?'book':'aquarium'}">${tank?'도감':'수족관'}</button><button data-act="lobby">대기실</button></div></div>
  ${tank?`<section class="tank"><div class="shoal">${specimens.length?specimens.map(f=>{const r=records.get(f.id),w=Math.min(200,Math.max(60,55+Math.sqrt(r.length/10000)*8));return `<button data-fish="${f.id}" title="도감 기록 보기"><img style="width:${Math.round(w)}px" src="${art(f)}" alt=""><span>${esc(f.name)}</span></button>`}).join(''):'<p>첫 물고기를 낚으면 이곳에서 만날 수 있어요.</p>'}</div></section><p class="caption">어종별 가장 큰 물고기가 헤엄쳐요. 물고기를 누르면 도감 기록을 볼 수 있어요.</p>`:
  `<div class="book">${FISH.map(f=>specimen(f,records.get(f.id))).join('')}</div>`}`);
  if(focus)document.getElementById('fish-'+focus)?.scrollIntoView({block:'center'});
}
async function action(fn){
  if(pending)return;pending=true;showError('');
  try{await fn()}catch(e){showError(e.message);if(!app.querySelector('button'))paint('error','<section class="panel"><h2>낚시터에 입장할 수 없어요</h2><p>크루 계정으로 로그인한 뒤 다시 시도해주세요.</p><button data-act="lobby">다시 확인</button></section>')}
  finally{pending=false}
}
const actions={rules:()=>dialog.showModal(),start,pull,lobby:openLobby,book:()=>collection('book'),aquarium:()=>collection('aquarium'),retry:async()=>{
  await refreshLobby();
  if(lobby.open&&(lobby.remaining||cast))await start();else await openLobby(false);
}};
app.addEventListener('click',e=>{
  if(e.target.closest('a[data-fishing-catalog]') && document.getElementById('aifect-mobile-experience')){
    e.preventDefault();
    paint('catalog',`<div class="titlebar"><h1>공식 어종 도감</h1><button data-act="lobby">대기실</button></div><div class="book">${FISH.map(f=>`<article class="specimen"><img src="${art(f)}" alt="" loading="lazy"><h2>${esc(f.name)}</h2><p>기준 길이 ${f.standardCm}cm</p><p>${esc(f.appearance)}</p></article>`).join('')}</div>`);return;
  }
  const button=e.target.closest('button');
  if(button?.dataset.fish){action(()=>collection('book',button.dataset.fish));return}
  if(button){if(actions[button.dataset.act])action(actions[button.dataset.act]);return}
  if(!mobileControls.matches&&screen==='play'&&e.target.closest('.stage'))pull();
});
window.addEventListener('keydown',e=>{
  if(e.code!=='Space'||screen!=='play'||dialog.open||e.target.closest?.('button:not([data-reel-surface]),a,input'))return;
  e.preventDefault();if(!e.repeat)pull();
});
document.addEventListener('visibilitychange',loop);
window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));
window.addEventListener('pageshow',e=>{if(e.persisted)action(openLobby)});
action(openLobby);
