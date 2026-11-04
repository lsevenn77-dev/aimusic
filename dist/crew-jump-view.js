import {stageRenderer} from './crew-jump-art/stage.js';
import {gameSounds} from './crew-jump-art/sounds.js';
import {start,step,VERSION,LIMIT,HZ,speedBand,multiplier,FLOOR,WIDTH,HEIGHT,RUNNER_X} from './crew-jump-core.js';

import {mountOutfitShop} from './crew-jump-art/outfit-shop.js';

export function mount(root,{crew,viewer,api,esc}){
 const url='/api/crews/'+encodeURIComponent(crew)+'/jump';
 root.innerHTML=`<link rel="stylesheet" href="/crew-jump.css"><section class="jump-club"><header><a class="text-link" href="#crew/${encodeURIComponent(crew)}">‹ 크루로</a><div><button class="small-button" data-pause hidden>일시정지</button> <button class="small-button" data-rules>게임 규칙</button></div></header>
 <section class="jump-lobby" aria-label="크루게임 대기실">
   <nav class="arc-game-choice" aria-label="크루게임 선택"><b>별빛 점프</b><a class="small-button" href="/crew-rhythm/?crew=${encodeURIComponent(crew)}">♫ 리듬게임 · Double Tap ›</a></nav>
   <div class="arc-top">
    <h1 class="arc-intro"><img src="/crew-jump-art/arcade-intro.webp" width="315" height="546" alt="AIFECT 크루 점프게임. 장애물을 넘고 별 젤리를 모으며 달려요."></h1>
    <section class="jump-board" aria-label="주간 순위판"><p>순위를 불러오는 중…</p></section>
   </div>
   <div class="arc-bottom">
    <section class="jump-cover" aria-label="게임 시작">
     <div class="jump-start-actions" aria-live="polite"><img class="arc-start-art" src="/crew-jump-art/arcade-start.webp" width="556" height="352" alt="게임 준비 중"></div>
    </section>
    <section class="jump-shop arc-tile" aria-labelledby="jump-shop-title">
     <h2 id="jump-shop-title">의상 상점</h2>
     <div class="arc-look-window" aria-hidden="true"><img src="/crew-jump-art/outfits/street.webp" alt=""><img src="/crew-jump-art/outfits/idol.webp" alt=""><img src="/crew-jump-art/outfits/princess.webp" alt=""></div>
     <small data-equipped-look>실버 의상 · 골드 의상</small><button class="small-button arc-pill" data-shop>둘러보기 <span aria-hidden="true">›</span></button>
    </section>
    <section class="arc-result arc-tile" aria-label="내 게임 결과"><h2>✧ 게임 결과 ✧</h2><div data-result-card></div></section>
   </div>
   <div class="jump-brief" aria-live="polite">내 도전 정보를 불러오는 중…</div>
  </section>
  <dialog class="surface jump-dialog arc-store-dialog" aria-labelledby="arc-store-title"><header><h2 id="arc-store-title">의상 상점</h2><button type="button" class="small-button" data-shop-close>닫기</button></header>
   <p class="arc-look-balance" data-shop-balance></p><div class="arc-fitting"><div class="arc-run-model" aria-hidden="true"></div><div aria-live="polite"><small>달리기 미리보기</small><h3 data-look-name></h3><b data-look-price></b></div></div>
   <div class="arc-look-shelves"></div><div class="arc-look-actions"><button type="button" class="primary-button" data-look-action disabled>의상 선택</button><button type="button" class="small-button" data-shop-retry hidden>다시 확인</button></div><p class="arc-look-note" data-shop-status role="status"></p></dialog>
 <div class="jump-stage" hidden aria-label="점프게임"><canvas width="960" height="540" tabindex="0" aria-label="스페이스 또는 화면을 눌러 점프"></canvas><div class="jump-hud" hidden><span>점수 <b>0</b></span><span>남은 시간 <b>${LIMIT/HZ}초</b></span><span>콤보 <b>0</b></span><small class="jump-speed"></small><span class="jump-mode" data-game-mode></span></div><div class="jump-overlay"></div></div>
 <dialog class="jump-wide-dialog" aria-label="가로 게임 화면"><div class="jump-wide-layout"><div class="jump-wide-controls"><button class="small-button" type="button" data-wide-pause hidden>일시정지</button><button class="small-button" type="button" data-wide-exit>축소</button></div></div></dialog><div class="jump-summary" aria-live="polite"></div><dialog class="surface jump-dialog"><h2>주간 게임 규칙</h2><p>화면을 누르거나 스페이스바로 점프하세요. 공중에서 한 번 더 점프할 수 있어요. 장애물에 닿으면 도전이 끝나요.</p><p>별 젤리를 연속으로 모으면 콤보 보너스! 낮에는 10초마다 1.2배로 가속해요. 70초부터 야간 도로에서 네온 링을 모으세요. 밤에는 5초마다 1.1배로 가속하고 ${LIMIT/HZ}초에 완주해요.</p><p>공식 도전은 하루 3회. 한국시간 월요일 0시부터 금요일 22시까지, 크루원별 주간 최고점 상위 10개를 합산해요. 참여 미션 보상은 크루 경험치이며, 현재 지급은 꺼져 있어요. 리듬게임에서도 별도의 공식 도전에 참여할 수 있어요.</p><button class="primary-button" data-close>확인</button></dialog></section>`;
 const $=s=>root.querySelector(s),canvas=$('canvas'),ctx=canvas.getContext('2d'),layer=$('.jump-overlay'),hud=$('.jump-hud'),summary=$('.jump-summary'),dialog=$('.jump-dialog:not(.arc-store-dialog)'),shop=$('.arc-store-dialog');
 const waiting=$('.jump-lobby'),stage=$('.jump-stage');
 const outfitShop=mountOutfitShop(shop,{api,url,esc,onChange:wardrobe=>{
  $('[data-equipped-look]').textContent='착용 중 · '+wardrobe.outfits.find(item=>item.id===wardrobe.equipped).name;
 }});
 let scene;
 let frame=0,dead=false,phase='loading',wasOfficial=false,info,game,round=null,origin=0,queued=0,taps=[],requestId=null,pressed=null;
 const abort=new AbortController(),events={signal:abort.signal};
 const sounds=gameSounds(abort.signal);
 function listen(el,name,fn){el.addEventListener(name,fn,events)}
 const wideDialog=$('.jump-wide-dialog'),wideLayout=$('.jump-wide-layout'),widePause=$('[data-wide-pause]');
 const stageAnchor=document.createComment('jump-stage-home');stage.before(stageAnchor);
 function leaveWide(){
  if(wideDialog.open)wideDialog.close();
  stageAnchor.after(stage);
  document.body.classList.remove('crew-jump-playing');
 }
 function enterWide(){
  if(!matchMedia('(max-width: 1100px), (pointer: coarse) and (max-height: 600px)').matches)return;
  widePause.hidden=true;
  widePause.textContent='일시정지';
  // A body-level modal stays above the app shell and does not depend on native fullscreen.
  document.body.append(wideDialog);
  wideLayout.prepend(stage);
  stage.hidden=false;layer.hidden=false;layer.textContent='게임 준비 중…';
  document.body.classList.add('crew-jump-playing');
  wideDialog.showModal();
 }
 listen(wideDialog,'cancel',e=>{e.preventDefault();leaveWide()});
 listen($('[data-wide-exit]'),'click',leaveWide);
 listen(widePause,'click',()=>{$('[data-pause]').click();widePause.textContent=$('[data-pause]').textContent});
 function panel(eyebrow,title,body,buttons){
  layer.classList.remove('counting');
  layer.hidden=false;layer.innerHTML='<div class="jump-copy"><small>'+eyebrow+'</small><h1>'+title+'</h1><p>'+body+'</p><div class="jump-actions">'+buttons+'</div></div>';
 }
 const btn=(key,label,primary=false)=>'<button class="'+(primary?'primary-button':'small-button')+'" data-do="'+key+'">'+label+'</button>';
 const resultKey=viewer?'aifect.jump.last:'+encodeURIComponent(viewer)+':'+encodeURIComponent(crew):null;
 let last=null;
 try{const value=resultKey&&JSON.parse(sessionStorage.getItem(resultKey));if(value&&['score','jellies','maxCombo','tick'].every(k=>Number.isFinite(value[k])&&value[k]>=0))last=value}catch{}
 function rememberRun(official,score){last={official,score,meters:Math.floor(game.distance/50),jellies:game.jellies,maxCombo:game.maxCombo,tick:game.tick};try{if(resultKey)sessionStorage.setItem(resultKey,JSON.stringify(last))}catch{}}
 function resultCard(){
  const f=n=>Number(n).toLocaleString('ko-KR');
  $('[data-result-card]').innerHTML='<img class="arc-cheer" src="/crew-jump-art/arcade-cheer.webp" alt="" width="152" height="144"><span class="arc-result-label">'+(last?(last.official?'최근 공식 도전':'최근 연습'):'최근 도전')+'</span><strong class="arc-score">'+(last?f(last.score)+'<small>점</small>':'첫 도전 전')+'</strong><dl>'+
    [['주행 거리',Number.isFinite(last?.meters)?f(last.meters)+' m':'—'],['수집한 아이템',last?f(last.jellies)+'개':'—'],['최대 콤보',last?'×'+last.maxCombo:'—']].map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+v+'</dd></div>').join('')+'</dl><div class="arc-result-actions">'+(last?btn(last.official&&info.open&&info.remaining?'official':'practice',last.official&&info.open&&info.remaining?'다시 도전':'다시 연습'):'')+'<a class="small-button" href="#crew/'+encodeURIComponent(crew)+'">크루로 돌아가기</a></div>';
 }
 function standings(title,description,records,own,kind){
  const list=records.filter(row=>row.place<=100).map(row=>{
   const key=kind==='crew'?row.crew_id:row.profile_id;
   const avatar=key&&row.image_version?'<img alt="" loading="lazy" src="/media/'+kind+'/'+encodeURIComponent(key)+'?v='+encodeURIComponent(row.image_version)+'">':'';
   return '<li><b>'+Number(row.place)+'</b><i class="arc-avatar" aria-hidden="true">'+esc(Array.from(row.name||'✦')[0])+avatar+'</i><span>'+esc(row.name)+'</span><strong>'+Number(row.points).toLocaleString()+'점</strong></li>';
  }).join('');
  return '<section class="jump-leaders"><div class="arc-rank-title"><h2>'+title+'</h2><small>TOP 100</small></div><p>'+description+'</p><div class="arc-scroll" tabindex="0" role="region" aria-label="'+title+' 최대 100위">'+
   (list?'<ol>'+list+'</ol>':'<div class="arc-empty"><span aria-hidden="true">✧</span>아직 공식 기록이 없어요.</div>')+
   '</div><div class="arc-own">'+own+'</div></section>';
 }
 function board(){
  const team=info.teamRank?'우리 크루 '+info.teamRank+'위 · '+Number(info.team).toLocaleString()+'점':'우리 크루 · 기록 없음';
  const personal=info.personalRank?'내 순위 '+info.personalRank+'위 · '+Number(info.best).toLocaleString()+'점':'내 순위 · 기록 없음';
  $('.jump-board').innerHTML=standings('크루 순위','크루원 상위 10명의 주간 최고점 합계',info.ranking,team,'crew')+
   standings('개인 순위','개인별 주간 최고점',info.individualRanking||[],personal,'producer');
 }
 function lobby(){leaveWide();board();resultCard();waiting.hidden=false;stage.hidden=true;summary.hidden=true;$('.jump-board').hidden=false;
  phase='lobby';$('[data-shop]').disabled=false;$('[data-pause]').hidden=true;$('[data-rules]').disabled=false;hud.hidden=true;
  const official=info.open&&info.remaining>0;
  const label=official?'공식 도전 시작':info.remaining<=0?'오늘 공식 도전 완료':'공식 도전 마감';
  $('.jump-start-actions').innerHTML = '<button type="button" class="arc-start" data-do="official"'+(official?'':' disabled')+' aria-label="'+label+'"><img class="arc-start-art" src="/crew-jump-art/arcade-start.webp" width="556" height="352" alt=""><span class="arc-start-status">'+label+'<small>'+(info.remaining<=0?'한국시간 자정에 3회 초기화':'오늘 남은 횟수 '+info.remaining+' / 3회')+'</small></span></button>';
  $('.jump-brief').innerHTML = `<div class="jump-session">
    <strong>${label}</strong>${btn('practice','연습하기 · 랭킹 미반영')}
    <span>공식 도전은 시작할 때 1회 차감돼요. 연습은 횟수 제한이 없어요.</span>
   </div><dl>
    <div><dt>오늘 남은 공식 도전</dt><dd>${info.remaining} / 3회</dd></div>
    <div><dt>내 주간 최고점</dt><dd>${info.best == null ? '기록 없음' : Number(info.best).toLocaleString()+'점'}</dd></div>
    <div><dt>오늘의 참여 미션</dt><dd>${info.participated ? '공식 도전 완료' : '공식 도전 1회'}</dd></div>
   </dl>`;
 }
 async function refresh(show=true){
  try{const res=await api(url,'GET',undefined,{fresh:true});if(dead)return;info=res;if(show)lobby();}
  catch(e){if(!dead){leaveWide();phase='error';$('.jump-start-actions').replaceChildren();waiting.hidden=false;stage.hidden=true;$('.jump-board').hidden=true;$('.jump-brief').innerHTML='<p>'+esc(e.message)+'</p>'+btn('refresh','다시 확인');}}
 }
 function draw(){scene.draw(game);
  const speed=hud.querySelector('small'),stage=speedBand(game.tick);if(speed.dataset.stage!==String(stage)){speed.dataset.stage=stage;speed.textContent=(stage>=7?'야간 도로 · ':'')+Number(multiplier(game.tick).toFixed(2))+'×';if(stage&&!matchMedia('(prefers-reduced-motion: reduce)').matches)speed.animate([{opacity:.3},{opacity:1}],{duration:400})}
  const nums=hud.querySelectorAll('b');nums[0].textContent=game.score.toLocaleString();nums[1].textContent=Math.ceil((LIMIT-game.tick)/HZ)+'초';nums[2].textContent='×'+game.combo;
 }
 async function finish(){
  leaveWide();phase='result';$('[data-pause]').hidden=true;$('[data-rules]').disabled=false;queued=0;hud.hidden=true;const saved=round;
  const before=info.best;if(!saved)rememberRun(false,game.score);
  const buttons=()=>(!wasOfficial||info.open&&info.remaining>0?btn('again',wasOfficial?'다시 공식 도전':'다시 연습',true):'')+btn('lobby','대기실로')+'<a class="small-button" href="#crew/'+encodeURIComponent(crew)+'">크루로 돌아가기</a>';
  const stats=()=>game.score.toLocaleString()+'점 · 생존 '+(game.tick/HZ).toFixed(1)+'초<br>수집 아이템 '+game.jellies+'개 · 최대 콤보 '+game.maxCombo;
  panel('RUN RESULT',game.finished==='survived'?'별빛 도시 완주!':'도전 결과',stats(),saved?'':buttons());
  summary.textContent='연습 기록 · 주간 최고 '+(info.best??'—')+'점 · 공식 도전 '+info.remaining+'회 남음';
  if(saved){
   phase='saving';summary.textContent='서버 검증 중 · 아직 확정되지 않은 기록이에요.';
   try{const result=await api(url+'/finish','POST',{id:saved.id,inputs:taps});if(dead)return;
    rememberRun(true,result.score);info=await api(url,'GET',undefined,{fresh:true});if(dead)return;
    board();summary.textContent=(before===null||result.score>before?'주간 최고점 갱신! · ':'')+'공식 '+result.score+'점 · 주간 최고 '+info.best+'점 · '+(info.remaining?'공식 도전 '+info.remaining+'회 남음':'오늘 공식 도전 3회를 모두 사용했어요.');
    layer.querySelector('.jump-actions').innerHTML=buttons();round=null;
   }catch(e){if(dead)return;summary.textContent=e.message;layer.querySelector('.jump-actions').innerHTML=btn('retry','기록 다시 제출')+btn('lobby','대기실로')}
   phase='result';
  }
 }
 function advance(t){
  if(dead)return;
  if(t<origin){layer.textContent=String(Math.ceil((origin-t)/1000));frame=requestAnimationFrame(advance);return}
  phase='play';widePause.hidden=!!round;$('[data-pause]').hidden=!!round;layer.hidden=true;hud.hidden=false;
  const target=Math.min(LIMIT,Math.floor((t-origin)*HZ/1000));
  let jumpSound, rewardSound;
  while(game.tick<target&&!game.finished){
   const jump=queued>0;
   if(jump)queued--;
   if(jump&&game.tick+1<LIMIT)taps.push(game.tick+1);
   const previousJellies=game.jellies;
   step(game,jump);
   if(game.jumped===game.tick)jumpSound=game.jumps===2?'double':'jump';
   if(game.jellies>previousJellies){
    if(game.combo>0&&game.combo%5===0)rewardSound='combo';
    else rewardSound??='star';
   }
  }
  if(game.finished)sounds.play(game.finished==='survived'?'finish':'collision');
  else {
   if(jumpSound)sounds.play(jumpSound);
   if(rewardSound)sounds.play(rewardSound);
  }
  draw();if(game.finished){void finish();return}frame=requestAnimationFrame(advance);
 }
 async function begin(official){
  if(phase!=='lobby')return;
  if(official&&(!info.open||info.remaining<=0)){summary.hidden=false;summary.textContent=info.remaining<=0?'오늘 공식 도전 3회를 모두 사용했어요. 한국시간 자정에 초기화돼요.':'공식 도전 기간이 아니에요.';return;}
  if(outfitShop.busy){summary.hidden=false;summary.textContent='의상 처리가 끝난 뒤 시작해주세요.';return;}
  phase='starting';$('[data-rules]').disabled=true;
  sounds.unlock();enterWide();
  waiting.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   scene??=stageRenderer(ctx);
   const wardrobe=await outfitShop.refresh();
   if(dead)return;
   await scene.ready(wardrobe.equipped);
   if(dead||document.hidden){if(!dead)await refresh();return}
   round=official?await api(url+'/start','POST',{requestId:requestId??=crypto.randomUUID()}):null;
   if(dead||document.hidden){if(round)abandon();if(!dead)await refresh();return}
   if((round?.version??info.version)!==VERSION)throw Error('규칙이 바뀌었어요. 새로고침해주세요.');
   wasOfficial=official;requestId=null;game=start(round?.seed??info.seed);taps=[];queued=0;pressed=null;
   origin=performance.now()+(round?round.starts-round.serverNow:3000);phase='countdown';$('.jump-board').hidden=true;
   waiting.hidden=true;stage.hidden=false;summary.hidden=false;layer.hidden=false;
   $('[data-game-mode]').textContent=official?'공식 도전 · 랭킹 반영':'연습 · 랭킹 미반영';
   layer.classList.add('counting');layer.textContent='3';canvas.focus({preventScroll:true});draw();summary.textContent=official?'공식 도전':'연습 모드 · 랭킹 미반영';frame=requestAnimationFrame(advance);
  }catch(e){if(!dead){if(e.status===409)requestId=null;await refresh();if(!dead){summary.hidden=false;summary.textContent=e.message}}}
 }
 listen(root,'click',e=>{
  if(e.target.closest('[data-shop]')&&phase==='lobby')outfitShop.open();
  if(e.target.closest('[data-close]'))dialog.close();
  if(e.target.closest('[data-rules]')&&!['starting','countdown','play'].includes(phase))dialog.showModal();
  if(e.target.closest('[data-pause]')&&!round){
   if(phase==='play'){pausedAt=performance.now();phase='paused';cancelAnimationFrame(frame);queued=0;$('[data-pause]').textContent='계속하기';layer.hidden=false;layer.textContent='일시정지'}
   else if(phase==='paused'){origin+=performance.now()-pausedAt;pausedAt=0;$('[data-pause]').textContent='일시정지';canvas.focus();frame=requestAnimationFrame(advance)}
  }
  const act=e.target.closest('[data-do]')?.dataset.do;
  if(act==='official'||act==='practice')void begin(act==='official');
  if(act==='lobby'||act==='refresh'){layer.classList.remove('counting');ctx.clearRect(0,0,WIDTH,HEIGHT);void refresh()}
  if(act==='again'&&phase==='result'){const official=wasOfficial;lobby();if(!official||info.remaining&&info.open)void begin(official)}
  if(act==='retry'&&phase==='result')void finish();
 });
 function jump(){if(phase==='play'&&game.jumps+queued<2)queued++}
 listen(canvas,'pointerdown',e=>{if(e.isPrimary&&e.button===0&&pressed===null){e.preventDefault();pressed=e.pointerId;canvas.setPointerCapture(e.pointerId);jump()}});
 listen(canvas,'lostpointercapture',()=>pressed=null);
 listen(canvas,'keydown',e=>{if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();if(!e.repeat)jump()}});
 let pausedAt=0;
 function abandon(){
  if(!round||!['starting','countdown','play'].includes(phase))return;
  void fetch(url+'/abandon',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:round.id}),keepalive:true}).catch(()=>{});
  round=null;cancelAnimationFrame(frame);phase='abandoned';
 }
 listen(document,'visibilitychange',()=>{
  if(document.hidden)sounds.quiet();
  if(document.hidden&&round){abandon();if(phase==='abandoned'){leaveWide();hud.hidden=true;panel('OFFICIAL RUN','도전을 종료했어요','공식 도전 중 화면을 떠나 이번 기록은 집계되지 않아요.',btn('lobby','대기실로'));summary.textContent='';}}
  else if(!round&&['countdown','play'].includes(phase)){if(document.hidden){pausedAt=performance.now();cancelAnimationFrame(frame)}else if(pausedAt){origin+=performance.now()-pausedAt;pausedAt=0;frame=requestAnimationFrame(advance)}}
 });
 listen(window,'pagehide',abandon);
 const clear=()=>{leaveWide();wideDialog.remove();stageAnchor.remove();abandon();dead=true;outfitShop.destroy();abort.abort();cancelAnimationFrame(frame);if(dialog.open)dialog.close();if(shop.open)shop.close()};
 void refresh();return clear;
}
