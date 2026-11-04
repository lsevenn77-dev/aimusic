import {renderGameRankings} from '/crew-game-lobby.js';
import {FISH} from './catalog.js';
import {TIERS,position,cm} from './rules.js';
import {createScene} from './scene.js';
import {bindMobileReelInput} from './mobile-input.js';
import {createRequestId} from './request-id.js';
import {animationDeadline} from './animation.js';
import {clockSample} from './timing.js';

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
let lobby,cast,screen='',pending=false,judging=false,requestId=null,clockOffset=0,clockDelay=Infinity,frame=0,frameElapsed=null,book,scene=null;
function showError(message){errorBox.textContent=message;errorBox.hidden=!message}
function paint(name,html){
  cancelAnimationFrame(frame);scene?.destroy();scene=null;screen=name;app.toggleAttribute('data-game-lobby',name==='lobby');app.classList.toggle('arcade-lobby',name==='lobby');app.classList.toggle('fishing-lobby',name==='lobby');app.innerHTML=html;window.scrollTo(0,0);
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
async function openLobby(){
  lobby=await api('lobby');cast=lobby.cast;
  document.querySelector('#back').href='/#crew/'+encodeURIComponent(lobby.crew);
 document.body.classList.toggle('practice',Boolean(lobby.practice));

  paint('lobby',`<div class="cgl-layout">
  <section class="cgl-tile cgl-hero fishing-hero"><small class="cgl-eyebrow">AIFECT CREW GAMES</small><h1>별물결 낚시터</h1>
    <p>${esc(lobby.name)}의 공동 낚시터</p><div class="cgl-fishing-art" aria-hidden="true"></div>
    <p>별빛 아래에서 오늘의 물고기를 만나보세요.</p>
    <button class="primary cgl-start" data-act="start" ${!lobby.practice&&(!lobby.open||(!cast&&!lobby.remaining))?'disabled':''}>${cast?'낚시 이어하기':lobby.practice||lobby.open?'낚시 시작':'이번 주 낚시 마감'}</button>
    <span class="pill">${lobby.practice?'연습 · 횟수 제한 없음':`오늘 남은 낚시 ${lobby.remaining} / ${lobby.dailyLimit??10}`}</span>
  </section>
  ${lobby.practice?`<section class="cgl-tile cgl-practice-info"><small class="cgl-eyebrow">PRACTICE</small><h2>편하게 연습해 보세요</h2><p>횟수 제한 없이 릴 타이밍을 익힐 수 있어요.</p><p>연습 어획액은 공식 순위에 반영되지 않고 새로고침하면 연습 기록이 초기화돼요.</p><a class="cgl-pill" href="./">공식 낚시터</a></section>`:'<section id="fishingRankings" class="crew-game-board" aria-label="주간 게임 순위"></section>'}
  <section class="cgl-tile cgl-records"><h2>${lobby.practice?'내 연습 기록':'이번 주 낚시 기록'}</h2><dl>
    <div><dt>${lobby.practice?'내 연습 어획액':'내 주간 어획액'}</dt><dd>${fmt(lobby.mine)}점</dd></div>
    ${lobby.practice?`<div><dt>이번에 발견한 어종</dt><dd>${fmt(lobby.discovered)} / 27</dd></div>`:`<div><dt>크루 주간 어획액</dt><dd>${fmt(lobby.ours)}점</dd></div><div><dt>주간 남은 기회</dt><dd>${lobby.weeklyRemaining} / ${lobby.weeklyLimit??50}</dd></div>`}
  </dl></section>
  <section class="cgl-tile cgl-collection"><h2>${lobby.practice?'나의 연습 수집 기록':'우리 크루의 바다'}</h2><p>낚은 물고기와 어종별 최고 기록을 모아봐요.</p>
    <div class="links"><button class="cgl-pill" data-act="aquarium">${lobby.practice?'연습 수족관':'크루 수족관'}</button><button data-act="book">물고기 도감</button></div>
    <div class="links cgl-text-links"><a href="./design.html">공식 어종 27종 보기 ↗</a>${lobby.practice?'':'<a href="?mode=practice">연습하기</a>'}</div>
  </section>
  <section class="cgl-tile cgl-help"><h2>조작 안내</h2><p>찌가 민트색 성공 구간에 들어오면 낚시 화면을 터치하세요.</p><p>PC는 화면 클릭 또는 스페이스바로 당길 수 있어요.</p><p>0칸에서 두 번 실패하면 물고기가 도망가요.</p></section>
  </div><p class="cgl-footnote">${lobby.practice?'연습은 공식 순위에 반영되지 않아요.':'한국시간 월요일 0시 개장 · 금요일 22시 마감 · 평가액은 게임 랭킹 점수예요.'}</p>`);
  if(!lobby.practice)renderGameRankings(document.querySelector('#fishingRankings'),{crews:lobby.crews,players:lobby.individual,crewId:lobby.crew,crewDescription:'잡은 모든 물고기의 주간 평가액 합계',playerDescription:'개인별 주간 어획액 합계'});
}
function loop(){
  cancelAnimationFrame(frame);
  const needle=document.querySelector('.needle');
  if(!needle||screen!=='play'||judging||document.hidden||app.querySelector('.stage.casting'))return;
  const animate=()=>{frameElapsed=Math.max(0,performance.now()+clockOffset-cast.start);needle.style.left=position(frameElapsed,cast.cycle)+'%';frame=requestAnimationFrame(animate)};
  animate();
}
function updateMeter(message){
  document.querySelector('.dots').textContent=cast.progress+' / '+cast.goal;
  document.querySelector('#warnings').dataset.alert=String(cast.warnings>0);
  document.querySelector('#warnings').textContent=`도주 경고 ${cast.warnings} / 2`;
  document.querySelector('#pullfeedback').textContent=message;
}
// intro: 새로 던진 낚시면 던지기·입질 연출 뒤에 당기기 막대를 보여준다
function play(intro){
  frameElapsed=null;
  paint('play',`<section class="stage${intro?' casting':''}"><button type="button" class="reel-surface" data-reel-surface aria-label="낚시 화면 · 터치해서 당기기"></button><div class="stagehead"><div><small>ON THE WATER</small><h2>${intro?'찌를 던지는 중…':'물고기가 걸렸어요'}</h2></div><div class="actions"><span id="warnings"></span><button data-act="lobby">대기실</button></div></div>
  <p class="callout" aria-hidden="true"></p>
  <div class="console"><div class="titlebar"><div class="gauge-title"><small>REEL TIMING</small><h3>릴 타이밍</h3></div><div class="capture"><span>포획 진행도</span><b class="dots"></b></div></div><div class="meter" aria-label="민트색 성공 구역에 맞춰 당기기"><i class="target" style="left:${cast.target}%;width:${cast.width}%"></i><i class="needle"></i></div><div class="stagefoot"><div><p id="pullfeedback" role="status"></p><small><span class="desktop-hint">스페이스바 또는 화면 클릭</span><span class="mobile-hint">낚시 화면을 터치해서 당기기</span></small></div></div></div></section>`);
  updateMeter('찌가 민트색 구간에 닿으면 당기세요.');
  const stage=app.querySelector('.stage');
  bindMobileReelInput({root:stage.querySelector('[data-reel-surface]'),mobile:()=>true,
    playing:()=>screen==='play'&&!dialog.open&&!stage.classList.contains('casting')&&!stage.classList.contains('ending'),
    pull:()=>{if(pending){document.querySelector('#pullfeedback').textContent='판정을 기다리는 중이에요.';return;}action(pull);},
    pointerEvents:'PointerEvent' in window});
  try{scene=createScene(stage,{goal:cast.goal,progress:cast.progress});}catch{scene=null;}
  if(!scene){stage.classList.remove('casting');stage.querySelector('h2').textContent='물고기가 걸렸어요';loop();return;}
  if(!intro){scene.hooked();loop();return}
  const currentScene=scene;
  animationDeadline(()=>currentScene.cast(),4000).then(()=>{
    if(screen!=='play'||!stage.isConnected||scene!==currentScene)return;
    try{currentScene.hooked();}catch{}
    stage.classList.remove('casting');stage.querySelector('h2').textContent='물고기가 걸렸어요';loop();
  });
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
async function pull(){
  if(screen!=='play'||dialog.open||app.querySelector('.stage.casting'))return;
  const prev=cast,elapsed=frameElapsed??Math.max(0,performance.now()+clockOffset-prev.start);
  judging=true;
  cancelAnimationFrame(frame);
  document.querySelector('#pullfeedback').textContent='당긴 위치를 판정하는 중…';
  try{scene?.pull('wait',cast.progress);}catch{}
  try{
  const result=await api('pull',{id:prev.id,seq:prev.seq+1,elapsed});cast=result.cast;
  if(cast.status!=='active'){
    // 결과는 이미 서버에 기록됐다. 낚아 올리기·놓치기 연출이 끝나면 결과 카드를 보여준다.
    cancelAnimationFrame(frame);app.querySelector('.stage')?.classList.add('ending');
    const f=fishById.get(cast.fish);
    await animationDeadline(()=>cast.status==='caught'?scene?.land(art(f),f.tier,TIERS[f.tier].name):scene?.escape(),3000);
    finish();return;
  }
  const kind=prev.seq===cast.seq?'wait':cast.progress>prev.progress?'success':cast.warnings>prev.warnings?'warning':'miss';
  updateMeter(kind==='wait'?'막대가 돌아오면 다시 당기세요.':kind==='success'?'성공! 한 칸 가까워졌어요.':
    kind==='warning'?'도주 경고! 다음 기회를 노려보세요.':'줄이 느슨해졌어요. 다시 당겨보세요.');
  // A visual effect must never prevent the authoritative counter from updating.
  try{scene?.pull(kind,cast.progress);}catch{}
  }catch(error){
    if(screen==='play')updateMeter(error.message||'판정을 확인하지 못했어요. 다시 눌러주세요.');
    throw error;
  }finally{judging=false;if(screen==='play'&&cast.status==='active')loop();}
}
// 결과 카드에서 물고기 둘레로 반짝이는 위치 [x%, y%, 지연초]
const SPARK_SPOTS=[[8,30,0],[18,78,.5],[30,10,1.1],[50,92,.3],[66,6,.8],[82,24,1.4],[92,66,.2],[74,88,1],[40,50,1.7],[12,52,1.3]];
function finish(){
  const f=fishById.get(cast.fish),caught=cast.status==='caught';
  paint('result',`<section class="result" data-tier="${caught?f.tier:''}"><small>CATCH REPORT</small><h1>${caught?'포획 성공!':'물고기가 도망갔어요'}</h1>
  <div class="trophy${caught?' caught':''}" style="--art:url(${art(f)})">${caught?'<i class="rays"></i>'+SPARK_SPOTS.map(([x,y,d])=>`<i class="spark" style="--x:${x}%;--y:${y}%;--d:${d}s"></i>`).join(''):''}<img src="${art(f)}" alt="${esc(f.name)}"></div><h2>${TIERS[f.tier].name} · ${esc(f.name)}</h2><p>${cm(cast.length)} cm · ${cast.grade}등급</p><strong>${fmt(cast.value)}점</strong><p class="badge">${lobby.practice?(caught?'이번 연습 도감에 기록했어요.':'이번 낚시의 평가액은 0점이에요.'):cast.notice==='new'?'우리 크루 도감에 처음 등록됐어요!':cast.notice==='best'?'우리 크루의 최고 길이를 경신했어요!':caught?'크루 주간 어획액에 반영됐어요.':'이번 낚시의 평가액은 0점이에요.'}</p>
  <div class="actions"><button class="primary" data-act="retry">다시 낚시</button><button data-act="lobby">대기실</button><button data-act="aquarium">수족관</button></div></section>`);
}
function specimen(f,r){
  const record=r?`최고 ${cm(r.length)} cm · ${r.grade}등급<br>${esc(r.nickname)} · ${new Date(r.end_ms).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}<br>누적 ${fmt(r.count)}마리`:'미발견';
  return `<article id="fish-${f.id}" class="specimen ${r?'':'undiscovered'}"><img loading="lazy" src="${art(f)}" alt=""><small>${TIERS[f.tier].name}</small><h3>${esc(f.name)}</h3><p>표준 ${f.standardCm} cm<br>${record}</p></article>`;
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
const actions={start,pull,lobby:openLobby,book:()=>collection('book'),aquarium:()=>collection('aquarium'),retry:async()=>{
  await openLobby();if(lobby.open&&(lobby.remaining||cast))await start();
}};
app.addEventListener('click',e=>{
  const button=e.target.closest('button');
  if(button?.dataset.fish){action(()=>collection('book',button.dataset.fish));return}
  if(button){if(actions[button.dataset.act])action(actions[button.dataset.act]);return}
  if(!mobileControls.matches&&screen==='play'&&e.target.closest('.stage'))action(pull);
});
window.addEventListener('keydown',e=>{
  if(e.code!=='Space'||screen!=='play'||dialog.open||e.target.closest?.('button:not([data-reel-surface]),a,input'))return;
  e.preventDefault();if(!e.repeat)action(pull);
});
document.addEventListener('visibilitychange',loop);
window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));
window.addEventListener('pageshow',e=>{if(e.persisted)action(openLobby)});
action(openLobby);
