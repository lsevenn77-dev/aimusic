import {FISH} from './catalog.js';
import {TIERS,position,cm} from './rules.js';
import {createScene} from './scene.js';

const app=document.querySelector('#app'), errorBox=document.querySelector('#error');
const dialog=document.querySelector('#rules');
document.querySelector('#rulesOpen').onclick=()=>dialog.showModal();
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('ko-KR');
const fishById=new Map(FISH.map(f=>[f.id,f]));
const art=f=>`./art/${f.id}.webp`;
let lobby,cast,screen='',pending=false,requestId=null,clockOffset=0,frame=0,book,scene=null;
function showError(message){errorBox.textContent=message;errorBox.hidden=!message}
function paint(name,html){
  cancelAnimationFrame(frame);scene?.destroy();scene=null;screen=name;app.innerHTML=html;window.scrollTo(0,0);
}
async function fetchAPI(action,data){
  const before=performance.now();
  const response=await fetch('/api/crew-fishing/'+action,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{cache:'no-store'});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'낚시 정보를 불러오지 못했어요.');
  if(result.serverTime)clockOffset=result.serverTime-(before+performance.now())/2;
  return result;
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
function rank(title,list){
  return `<section class="panel"><div class="titlebar"><h2>${title}</h2><small>WEEKLY</small></div>${list.length?
    '<ol class="ranklist">'+list.map(r=>`<li><em>${r.place}위</em> ${esc(r.name)} <strong>${fmt(r.score)}점</strong></li>`).join('')+'</ol>':
    '<p>이번 주 첫 어획을 기다리고 있어요.</p>'}</section>`;
}
async function openLobby(){
  lobby=await api('lobby');cast=lobby.cast;
  document.querySelector('#back').href='/#crew/'+encodeURIComponent(lobby.crew);
 document.body.classList.toggle('practice',Boolean(lobby.practice));
 if(lobby.practice){paint('lobby',`<div class="intro"><section class="hero"><div><small>CREW FISHING CLUB</small><h1>별물결 낚시터</h1><p>${esc(lobby.name)} 크루의 낚시터에서 별빛 아래 첫 입질을 기다려 보세요.</p><div class="actions"><button class="primary" data-act="start">${cast?'낚시 이어하기':'낚시 시작'}</button><span class="pill">연습 · 횟수 제한 없음</span></div></div></section><aside class="panel stats"><div><span>내 연습 어획액</span><strong>${fmt(lobby.mine)}점</strong></div><div><span>이번에 발견한 어종</span><strong>${fmt(lobby.discovered)} / 27</strong></div></aside></div><section class="panel"><h2>나의 연습 수집 기록</h2><p>이번에 낚은 물고기를 감상하세요. 새로고침하면 연습 기록이 초기화돼요.</p><div class="actions"><button data-act="aquarium">연습 수족관</button><button data-act="book">물고기 도감</button><a href="./design.html">27종 원화 보기</a></div></section>`);return;}

  paint('lobby',`<div class="intro"><section class="hero"><div><small>CREW FISHING CLUB</small><h1>별물결 낚시터</h1>
  <p>${esc(lobby.name)}의 공동 낚시터 · 오늘은 어떤 물고기가 찾아올까요?</p>
  <div class="actions"><button class="primary" data-act="start" ${!lobby.open||(!cast&&!lobby.remaining)?'disabled':''}>${cast?'낚시 이어하기':lobby.open?'낚시 시작':'이번 주 낚시 마감'}</button><span class="pill">오늘 남은 낚시 ${lobby.remaining} / 10</span></div></div></section>
  <aside class="panel stats"><div><span>내 주간 어획액</span><strong>${fmt(lobby.mine)}점</strong></div><div><span>크루 주간 어획액</span><strong>${fmt(lobby.ours)}점</strong></div><div><span>주간 남은 기회</span><strong>${lobby.weeklyRemaining} / 50</strong></div></aside></div>
  <div class="twocol">${rank('크루 랭킹',lobby.crews)}${rank('개인 랭킹',lobby.individual)}</div>
  <section class="panel"><div class="titlebar"><div><small>CREW COLLECTION</small><h2>우리 크루의 바다</h2></div></div>
  <div class="links"><button data-act="aquarium">크루 수족관</button><button data-act="book">물고기 도감</button><a href="./design.html">27종 디자인 시안 ↗</a></div></section>
  <p class="caption">한국시간 월요일 0시 개장 · 금요일 22시 마감 · 평가액은 게임 랭킹 점수예요.</p>`);
}
function loop(){
  cancelAnimationFrame(frame);
  const needle=document.querySelector('.needle');
  if(!needle||screen!=='play'||document.hidden||app.querySelector('.stage.casting'))return;
  const animate=()=>{needle.style.left=position(performance.now()+clockOffset-cast.start,cast.cycle)+'%';frame=requestAnimationFrame(animate)};
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
  paint('play',`<section class="stage${intro?' casting':''}"><div class="stagehead"><div><small>ON THE WATER</small><h2>${intro?'찌를 던지는 중…':'물고기가 걸렸어요'}</h2></div><div class="actions"><span id="warnings"></span><button data-act="lobby">대기실</button></div></div>
  <p class="callout" aria-hidden="true"></p>
  <div class="console"><div class="titlebar"><div class="gauge-title"><small>REEL TIMING</small><h3>릴 타이밍</h3></div><div class="capture"><span>포획 진행도</span><b class="dots"></b></div></div><div class="meter" aria-label="민트색 성공 구역에 맞춰 당기기"><i class="target" style="left:${cast.target}%;width:${cast.width}%"></i><i class="needle"></i></div><div class="stagefoot"><div><p id="pullfeedback" role="status"></p><small>스페이스바 또는 터치</small></div><button class="primary" data-act="pull">당기기</button></div></div></section>`);
  updateMeter('찌가 민트색 구간에 닿으면 당기세요.');
  const stage=app.querySelector('.stage');
  scene=createScene(stage,{goal:cast.goal,progress:cast.progress});
  if(!intro){scene.hooked();loop();return}
  scene.cast().then(()=>{
    if(screen!=='play'||!stage.isConnected)return;
    stage.classList.remove('casting');stage.querySelector('h2').textContent='물고기가 걸렸어요';loop();
  });
}
async function start(){
  const fresh=!cast||cast.status!=='active';
  if(fresh){
    // Tabs showing the same available cast share its idempotency key.
    requestId??='crew-fishing-'+lobby.day+'-'+lobby.remaining;
    const result=await api('cast',{requestId});cast=result.cast;requestId=null;
  }
  if(cast.status==='active')play(fresh);else finish();
}
async function pull(){
  if(screen!=='play'||dialog.open||app.querySelector('.stage.casting'))return;
  const prev=cast;
  const result=await api('pull',{id:prev.id,seq:prev.seq+1});cast=result.cast;
  if(cast.status!=='active'){
    // 결과는 이미 서버에 기록됐다. 낚아 올리기·놓치기 연출이 끝나면 결과 카드를 보여준다.
    cancelAnimationFrame(frame);app.querySelector('.stage')?.classList.add('ending');
    const f=fishById.get(cast.fish);
    if(cast.status==='caught')await scene?.land(art(f),f.tier,TIERS[f.tier].name);else await scene?.escape();
    finish();return;
  }
  const kind=prev.seq===cast.seq?'wait':cast.progress>prev.progress?'success':cast.warnings>prev.warnings?'warning':'miss';
  scene?.pull(kind,cast.progress);
  updateMeter(kind==='wait'?'막대가 돌아오면 다시 당기세요.':kind==='success'?'성공! 한 칸 가까워졌어요.':
    kind==='warning'?'도주 경고! 다음 기회를 노려보세요.':'줄이 느슨해졌어요. 다시 당겨보세요.');
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
  if(screen==='play'&&e.target.closest('.stage'))action(pull);
});
window.addEventListener('keydown',e=>{
  if(e.code!=='Space'||screen!=='play'||dialog.open||e.target.closest?.('button:not([data-act="pull"]),a,input'))return;
  e.preventDefault();if(!e.repeat)action(pull);
});
document.addEventListener('visibilitychange',loop);
window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));
window.addEventListener('pageshow',e=>{if(e.persisted)action(openLobby)});
action(openLobby);
