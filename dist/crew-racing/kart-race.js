import {renderGameRankings} from '/crew-game-lobby.js';
import {mountRacingLobby,decorateRankings} from './lobby.js';
import {drivingHud} from './driving.js';
import {createCanvasWheelTrail, jetStamp} from './effects.js';
import {arcadeScenery} from './arcade.js';
import {createShowroom} from './showroom.js';
import { RULES,CAR,SEG,ROAD_W,DRAW,CAM_H,CAM_DEPTH,PLAYER_Z,COURSES,STEP,newRun,computeScore,createRace } from "./physics.js?v=kart2";
import {CARS,raceCalendar,SPEED_RULES} from "./catalog.js?v=kart2";
(() => {
  // 코스별 연습 주행과 점수 규칙
  const $ = id => document.getElementById(id);
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  const clock = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`; };


  const isoWeek = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); };
  const WEEK = isoWeek(new Date());
  // 검수용: 주소 끝에 #course=harbor 를 붙이면 그 코스로 열림 (화면에는 선택 메뉴 없음)
  const forced = ((globalThis.location && location.hash) || '').match(/course=(\w+)/);
  // 기준: 2026년 45주(11/2 월요일 시작)가 레이싱 1회차 · 별빛 놀이공원
  const COURSE_ID = forced && Object.hasOwn(COURSES, forced[1]) ? forced[1] : raceCalendar().course;
  const COURSE=COURSES[COURSE_ID];
  const {step,segs,segAt,TRACK_LEN,FINISH_SEG}=createRace(COURSE_ID);
  const updateDrivingFeedback = drivingHud(CAR, segAt, PLAYER_Z);
  const drawWheelTrail = createCanvasWheelTrail();
  // 고스트: 내 공식 도전 중 가장 높은 점수의 주행을 그대로 재생 (0.05초마다 위치를 기록)
  // 서버 연결 시: 서버가 검증한 내 최고 점수 주행 기록을 내려줌
  const GHOST_DT = .05;
  let ghost = null;   // 이번 주행에서 쫓는 고스트 { score, finished, time, z: [], x: [] }. 출발할 때 고정
  const hasGhost = () => !!ghost;
  function ghostZ(t) {
    if (!ghost || t <= 0) return 0;
    const z = ghost.z, f = t / GHOST_DT, i = Math.floor(f), n = z.length - 1;
    if (i >= n) return z[n] + (ghost.finished ? (t - n * GHOST_DT) * 9000 : 0);
    return z[i] + (z[i + 1] - z[i]) * (f - i);
  }
  function ghostX(t) {
    if (!ghost || t <= 0) return 0;
    const x = ghost.x, f = t / GHOST_DT, i = Math.floor(f), n = x.length - 1;
    return i >= n ? x[n] : x[i] + (x[i + 1] - x[i]) * (f - i);
  }
  // 고스트가 위치 z를 지난 시각
  function ghostTimeAt(z) {
    const a = ghost.z, n = a.length - 1; if (z >= a[n]) return n * GHOST_DT;
    let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] <= z) lo = m; else hi = m; }
    return (lo + (a[hi] > a[lo] ? (z - a[lo]) / (a[hi] - a[lo]) : 0)) * GHOST_DT;
  }
  function record(S) {
    const tr = S.trace; if (S.t < tr.z.length * GHOST_DT) return;
    tr.z.push(Math.round(S.z)); tr.x.push(Math.round(S.x * 1000) / 1000);
  }

  // ───────── 저장 (서버 연결 전 데모) ─────────
  const store = {
    get(k, d) { try { const v = localStorage.getItem('aifect.crew-racing.v1.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('aifect.crew-racing.v1.' + k, JSON.stringify(v)); } catch {} },
  };

  // ───────── 주행 상태와 물리 (고정 시간 간격 → 같은 입력이면 같은 결과) ─────────
  // ───────── 그리기 ─────────
  const cv = $('cv'), ctx = cv.getContext('2d');
  function project(p, camX, camY, camZ, v) {
    p.camera.x = (p.world.x || 0) - camX; p.camera.y = p.world.y - camY; p.camera.z = p.world.z - camZ;
    p.screen.scale = CAM_DEPTH * v.zoom / p.camera.z;
    p.screen.x = v.w / 2 + p.screen.scale * p.camera.x * v.w / 2;
    p.screen.y = v.horizon - p.screen.scale * p.camera.y * v.ys;
    p.screen.w = p.screen.scale * ROAD_W * v.w / 2;
  }
  let skyOffset = 0;
  let scenery=null, lastDrawTime=0, boostCamera=0;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  // 차량 (뒤에서 본 모습). ghost=true면 반투명 보라 홀로그램
  function drawCar(cx, by, w, o = {}) {
    const h = w * .5;
    ctx.save(); ctx.translate(cx, by); ctx.rotate((o.tilt || 0) * .05);
    if (o.ghost) ctx.globalAlpha = .55;
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(0, 0, w * .55, h * .12, 0, 0, 7); ctx.fill();
    // 바퀴
    ctx.fillStyle = o.ghost ? 'rgba(120,80,220,.6)' : '#111019';
    rr(-w * .48, -h * .42, w * .17, h * .42, w * .04); ctx.fill(); rr(w * .31, -h * .42, w * .17, h * .42, w * .04); ctx.fill();
    // 차체 아래
    const body = ctx.createLinearGradient(0, -h * .9, 0, 0);
    if (o.ghost) { body.addColorStop(0, 'rgba(210,190,255,.55)'); body.addColorStop(1, 'rgba(120,80,220,.5)'); }
    else { body.addColorStop(0, '#ffffff'); body.addColorStop(.5, '#e4e0f6'); body.addColorStop(1, '#a9a3c9'); }
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(-w * .5, -h * .25); ctx.quadraticCurveTo(-w * .52, -h * .7, -w * .36, -h * .78); ctx.lineTo(w * .36, -h * .78); ctx.quadraticCurveTo(w * .52, -h * .7, w * .5, -h * .25); ctx.quadraticCurveTo(w * .45, -h * .1, w * .3, -h * .1); ctx.lineTo(-w * .3, -h * .1); ctx.quadraticCurveTo(-w * .45, -h * .1, -w * .5, -h * .25); ctx.fill();
    // 캐빈
    ctx.beginPath(); ctx.moveTo(-w * .34, -h * .76); ctx.quadraticCurveTo(-w * .3, -h * 1.12, -w * .12, -h * 1.16); ctx.lineTo(w * .12, -h * 1.16); ctx.quadraticCurveTo(w * .3, -h * 1.12, w * .34, -h * .76); ctx.fill();
    // 뒷유리
    const glass = ctx.createLinearGradient(0, -h * 1.1, 0, -h * .8);
    glass.addColorStop(0, o.ghost ? 'rgba(60,30,120,.6)' : '#3a3660'); glass.addColorStop(1, o.ghost ? 'rgba(30,20,80,.6)' : '#15142a');
    ctx.fillStyle = glass; ctx.beginPath(); ctx.moveTo(-w * .27, -h * .82); ctx.quadraticCurveTo(-w * .24, -h * 1.06, -w * .1, -h * 1.09); ctx.lineTo(w * .1, -h * 1.09); ctx.quadraticCurveTo(w * .24, -h * 1.06, w * .27, -h * .82); ctx.closePath(); ctx.fill();
    // 민트 LED 바
    ctx.save(); ctx.shadowColor = o.ghost ? '#c9a8ff' : '#3ef2c2'; ctx.shadowBlur = w * .08;
    ctx.strokeStyle = o.ghost ? '#e2d2ff' : '#7dffe1'; ctx.lineWidth = Math.max(2, h * .07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-w * .38, -h * .55); ctx.quadraticCurveTo(0, -h * .5, w * .38, -h * .55); ctx.stroke(); ctx.restore();
    // 디퓨저
    ctx.fillStyle = o.ghost ? 'rgba(90,60,180,.6)' : '#2a2346'; rr(-w * .3, -h * .26, w * .6, h * .14, h * .05); ctx.fill();
    ctx.save(); ctx.shadowColor = '#b46bff'; ctx.shadowBlur = w * .05; ctx.fillStyle = '#c08bff';
    rr(-w * .26, -h * .2, w * .1, h * .04, 2); ctx.fill(); rr(w * .16, -h * .2, w * .1, h * .04, 2); ctx.fill(); ctx.restore();
    // 부스터 불꽃
    if (o.boost) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const sx of [-.18, .18]) { const g = ctx.createRadialGradient(w * sx, -h * .14, 0, w * sx, -h * .14, w * .16); g.addColorStop(0, 'rgba(220,255,250,.95)'); g.addColorStop(.4, 'rgba(62,242,194,.7)'); g.addColorStop(1, 'rgba(62,242,194,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(w * sx, -h * .1, w * .16, w * .1, 0, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    if (o.ghost) { ctx.globalAlpha = .9; ctx.strokeStyle = '#d9c4ff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-w * .5, -h * .25); ctx.quadraticCurveTo(-w * .52, -h * .7, -w * .36, -h * .78); ctx.lineTo(w * .36, -h * .78); ctx.quadraticCurveTo(w * .52, -h * .7, w * .5, -h * .25); ctx.stroke(); }
    ctx.restore();
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function tag(x, y, text, size) {
    ctx.save(); ctx.font = `700 ${size}px "Noto Sans KR", sans-serif`; const tw = ctx.measureText(text).width + size * 1.2, th = size * 1.6;
    ctx.fillStyle = 'rgba(40,30,90,.8)'; ctx.strokeStyle = 'rgba(220,200,255,.7)'; ctx.lineWidth = 1;
    rr(x - tw / 2, y - th, tw, th, th / 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - th / 2); ctx.restore();
  }

  function render(S) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const portrait = r.height > r.width;
    const elapsed=Math.max(0,Math.min(.10,S.t-lastDrawTime)); lastDrawTime=S.t;
    const target=S.boostT>0 && !reducedMotion.matches ? 1 : 0;
    boostCamera+=(target-boostCamera)*(1-Math.exp(-elapsed*6));
    const v = { w: r.width, h: r.height, horizon: r.height * (portrait ? .4 : .5), ys: (portrait ? r.width * .62 : r.height / 2)*(1-.065*boostCamera), zoom:1-.055*boostCamera };
    const shake = S.shake > 0 && !reducedMotion.matches ? Math.sin(S.t*57)*8*S.shake : 0;
    ctx.save(); ctx.translate(shake, 0);

    const base = segAt(S.z), basePct = (S.z % SEG) / SEG;
    const cameraLane=S.x*.73;
    const carX=v.w*(.5+(S.x-cameraLane)*v.zoom);
    const carW = portrait ? v.w*.305 : Math.min(v.w*.25,v.h*.32);
    const carY = v.h - (portrait ? v.h*.32 : v.h*.14);
    const pSeg = segAt(S.z + PLAYER_Z), pPct = ((S.z + PLAYER_Z) % SEG) / SEG;
    const pY = pSeg.p1.world.y + (pSeg.p2.world.y - pSeg.p1.world.y) * pPct;
    skyOffset += pSeg.curve*(S.speed/CAR.maxSpeed)*.032*elapsed;
    scenery.drawBackground(ctx,v,skyOffset,S.x,S.z/TRACK_LEN);

    let maxy = v.h, x = 0, dx = -(base.curve * basePct);
    const list = [];
    for (let n = 0; n < DRAW; n++) {
      const s = segs[base.i + n]; if (!s) break;
      project(s.p1, cameraLane * ROAD_W - x, pY + CAM_H, S.z, v);
      project(s.p2, cameraLane * ROAD_W - x - dx, pY + CAM_H, S.z, v);
      x += dx; dx += s.curve;
      s.clip = maxy;
      if (s.p1.camera.z <= CAM_DEPTH || s.p2.screen.y >= s.p1.screen.y || s.p2.screen.y >= maxy) continue;
      list.push(s); maxy = s.p2.screen.y;
    }
    // 고스트 위치
    const gz = ghostZ(S.t), gSeg = segAt(gz + PLAYER_Z);
    for (let k = list.length - 1; k >= 0; k--) {
      const s = list[k];
      scenery.drawRoad(ctx,s,v,FINISH_SEG);
      for (const sp of s.sprites) scenery.drawProp(ctx,s,sp,v,S.t);
      if (ghost && s === gSeg && gz >= S.z) {
        const pct = ((gz + PLAYER_Z) % SEG) / SEG;
        const depth = PLAYER_Z + (gz - S.z), ratio = PLAYER_Z / depth;
        const sc = CAM_DEPTH * v.zoom / depth;
        const ground = s.p1.world.y + (s.p2.world.y - s.p1.world.y) * pct;
        const roadY = v.horizon + sc * (pY + CAM_H - ground) * v.ys;
        const sx = v.w/2 + sc * (s.p1.camera.x + (s.p2.camera.x-s.p1.camera.x)*pct + ghostX(S.t)*ROAD_W) * v.w/2;
        // Anchor both bumpers to the player plane; distance and road elevation supply the perspective.
        const sy = v.horizon + ratio*(carY-v.horizon) + sc*(pY-ground)*v.ys;
        const cw = carW * ratio;
        if (cw > 4 && roadY <= s.clip + 2) {
          drawCarAny(sx, sy, cw, { ghost: true });
          if(cw>=20)tag(sx, sy - cw - 4, 'BEST', Math.max(10, Math.min(16, cw * .14)));
        }
      }
    }

    scenery.drawSpeed(ctx,v,S,boostCamera);
    const bounce = S.speed > 100 ? Math.sin(S.t * 40) * .8 : 0;
    // 드리프트 스파크·타이어 자국
    if (S.drift || S.shake > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) { const sx = carW * (i % 2 ? .38 : -.38) + (Math.random() - .5) * carW * .1, sy = carY - Math.random() * carW * .08; ctx.fillStyle = `rgba(${200 + Math.random() * 55},${120 + Math.random() * 60},255,.9)`; ctx.fillRect(carX + sx + (Math.random() - .5) * 20, sy + Math.random() * 14, 2, 2); }
      ctx.restore();
    }
    drawWheelTrail(ctx,S,carW,carY,carX);
    drawCarAny(carX + S.tilt * carW * .06, carY + bounce, carW, {
      tilt: S.tilt * (S.drift ? 2.2 : 1), boost: S.boostT > 0,
      yaw: S.tilt * (S.drift ? .42 : .16), roll: S.tilt * (S.drift ? .05 : .025),
    });
    ctx.restore();
  }

  // ───────── 진행 ─────────
  let S = null, raf = 0, last = 0, acc = 0, paused = false;
  let starting=false;
  async function startRun(practiceOnly = false) {
    if(starting)return;
    starting=true;
    let session=null, runCar, bonus;
    try{
      await lobbyReady;
      runCar=carId; bonus=CARS.find(c=>c.id===runCar).speedBonus;
      if(!practiceOnly&&crewMember&&!forced){const data=await api('start',{course:COURSE_ID,rules:SPEED_RULES});session=data.id;runCar=data.equipped;bonus=data.speedBonus;renderQuota(data);}
    }catch(e){alert(e.message);return;}
    finally{starting=false;}

    S = newRun(bonus); Object.assign(S,{runCar,session,ticks:0,events:[],mask:0}); ghost = store.get('rc-ghost-' + COURSE_ID, null); paused = false; acc = 0; last = performance.now(); skyOffset = 0;
    boostCamera=0; lastDrawTime=0;
    scenery??=arcadeScenery();
    $('race').classList.add('arcade-view');
    document.body.classList.add('racing');
    $('lobbyView').hidden = true; $('race').hidden = false;
    $('resultOv').hidden = true; $('pauseOv').hidden = true; $('readyOv').hidden = false;
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (!paused && !S.ended) { acc += dt; while (acc >= STEP && !S.ended) {
      const mask=Number(S.input.left)|Number(S.input.right)<<1|Number(S.input.boost)<<2;
      if(mask!==S.mask){S.events.push([S.ticks,mask]);S.mask=mask;}
      S.ticks++;step(S, STEP);record(S);acc-=STEP;
    } if (S.ended) finish(); }
    render(S);
    updateDrivingFeedback(S, paused);
    hud(); if (S.ended) cancelAnimationFrame(raf);
  }
  let msgTimer = 0;
  function hud() {
    if (S.countdown > 0) $('countTxt').textContent = Math.ceil(S.countdown - .2) > 0 ? Math.ceil(S.countdown - .2) : 'GO';
    if (S.countdown <= 0) $('readyOv').hidden = true;
    $('timeTxt').textContent = clock(S.t);
    const pct = Math.min(1, S.z / TRACK_LEN), gp = Math.min(1, ghostZ(S.t) / TRACK_LEN);
    $('progFill').style.width = pct * 100 + '%'; $('progDot').style.left = pct * 100 + '%'; $('ghostDot').style.left = gp * 100 + '%'; $('ghostDot').hidden = !ghost;
    const g = $('gapTxt');
    if (!ghost) { g.textContent = '첫 기록 도전'; g.classList.remove('ahead'); }
    else if (S.t < .3) { g.textContent = '내 고스트와 출발'; g.classList.remove('ahead'); }
    else {
      // 같은 위치를 고스트보다 몇 초 늦게 지나는지. 고스트가 멈춘 지점(미완주)을 넘어서면 앞선 것
      const beyond = S.z > ghost.z[ghost.z.length - 1], gap = beyond ? -.01 : S.t - ghostTimeAt(Math.min(S.z, TRACK_LEN));
      g.textContent = beyond && !ghost.finished ? '고스트 추월' : `${Math.abs(gap).toFixed(2)}초 ${gap > 0 ? '뒤' : '앞'}`; g.classList.toggle('ahead', gap <= 0);
    }
    $('speedTxt').firstChild.textContent = Math.round(S.speed / CAR.maxSpeed * 280);
    $('gaugeFill').style.width = S.gauge + '%'; $('mGauge').style.width = S.gauge + '%';
    const ready = S.gauge >= CAR.boostCost && S.boostT <= 0;
    $('boostBtn').classList.toggle('off', !ready); $('mBoost').classList.toggle('off', !ready);
    if (S.msg && S.msg.shown !== true) {
      const m = $('msg'); m.textContent = S.msg.text; m.style.color = S.msg.color; m.classList.add('on'); S.msg.shown = true;
      clearTimeout(msgTimer); msgTimer = setTimeout(() => m.classList.remove('on'), 900);
    }
  }
  function pause() {
    if (!S || S.ended || paused) return;
    paused = true;
    cancelAnimationFrame(raf);
    S.input.left = S.input.right = S.input.boost = false;
    updateDrivingFeedback(S,true);
    $('pauseKind').textContent = S.session ? '공식 주행' : '연습 주행';
    $('pauseNote').textContent = '중간에 그만두면 이번 주행은 저장하지 않아요.';
    $('pauseOv').hidden = false;
  }
  function resume() {
    if (!paused) return;
    paused = false;
    last = performance.now();
    $('pauseOv').hidden = true;
    raf = requestAnimationFrame(loop);
  }
  function finish(quit) {
    if (S.resultShown) return; S.resultShown = true; S.ended = true;
    if (quit) S.dnf = true;
    const progress = Math.min(1, S.z / TRACK_LEN), score = computeScore(S.finished, S.t, progress);
    $('resKind').textContent = S.session?'공식 주행':'연습 주행';
    $('resState').textContent = S.finished ? '완주' : quit ? '도중에 그만둠' : '시간 초과 · 미완주';
    $('resTime').textContent = S.finished ? clock(S.t) : `${Math.round(progress * 100)}% 주행`;
    $('resScore').textContent = fmt(score) + '점';
    const saved = S.finished ? RULES.limit - Math.round(S.t * 100) / 100 : 0;
    $('resBreak').innerHTML = S.finished
      ? `<tr><td>완주 기본 점수</td><td>${fmt(RULES.finishBase)}</td></tr><tr><td>60초에서 ${saved.toFixed(2)}초 단축 × 10,000</td><td>+${fmt(saved * RULES.perSecond)}</td></tr>${ghost && ghost.finished ? `<tr><td>내 고스트(${clock(ghost.time)})와 차이</td><td>${(S.t - ghost.time > 0 ? '+' : '') + (S.t - ghost.time).toFixed(2)}초</td></tr>` : ''}`
      : `<tr><td>주행 진행도 ${Math.round(progress * 100)}% × 390,000</td><td>${fmt(score)}</td></tr><tr><td colspan="2" class="muted" style="text-align:left">완주하면 최소 400,000점이에요.</td></tr>`;
    $('rDrift').textContent = S.drifts; $('rWall').textContent = S.walls; $('rBoost').textContent = S.boosts;
    if (S.finished) {
      const best = store.get('rc-best-' + COURSE_ID, null);
      const newBest = !best || S.t < best;
      if (newBest) store.set('rc-best-' + COURSE_ID, S.t);
      $('resState').textContent = newBest ? (best ? '완주 · 개인 최고 기록 갱신' : '완주 · 첫 개인 기록') : '완주 · 내 최고 ' + clock(best);
    }

    const prev = store.get('rc-ghost-' + COURSE_ID, null), newGhost = !quit && (!prev || score > prev.score);
    if (newGhost) { record(S); store.set('rc-ghost-' + COURSE_ID, { score, finished: S.finished, time: S.t, car: S.runCar, z: S.trace.z, x: S.trace.x }); }
    $('resNotice').textContent = quit ? '이번 주행은 저장하지 않았어요.' : newGhost ? '이 브라우저의 코스 최고 점수예요. 다음 주행에서 내 고스트와 달려보세요.' : '연습 주행을 마쳤어요.';

    $('readyOv').hidden = true; $('pauseOv').hidden = true; $('resultOv').hidden = false;
    if(!quit&&S.session){
      const run=S;
      api('finish',{id:run.session,events:run.events}).then(result=>{
        if(S===run)$('resNotice').textContent='공식 '+fmt(result.score)+'점 · 서버 랭킹에 저장했어요.';
        return loadLobby();
      }).catch(e=>{if(S===run)$('resNotice').textContent=e.message;});
    }
  }
  function toLobby() { cancelAnimationFrame(raf); S = null; $('race').hidden = true; $('lobbyView').hidden = false; document.body.classList.remove('racing'); updateLobby(); loadLobby(); }
  function updateLobby() {

    $('weekTxt').textContent = `WEEK ${WEEK} · 이번 주 ${crewMember&&!forced?'공식':'연습'} 코스`; $('courseName').textContent = COURSE.name; $('courseDesc').textContent = COURSE.desc;
    $('pauseCourse').textContent = COURSE.name; $('hudCourse').textContent = COURSE.name;
    const best = store.get('rc-best-' + COURSE_ID, null); $('bestTxt').textContent = best ? clock(best) : '-';
    const g = store.get('rc-ghost-' + COURSE_ID, null); $('ghostTxt').textContent = g ? fmt(g.score) : '-';
    $('targetTxt').textContent = g ? (g.finished ? '내 고스트 ' + clock(g.time) : `내 고스트 ${fmt(g.score)}점`) : '내 연습 최고 점수가 고스트가 돼요';
    drawMap();
  }
  // 코스 지도: 커브를 누적해 위에서 본 모양
  function drawMap() {
    const c = $('mapCv'), r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return;
    c.width = r.width * dpr; c.height = r.height * dpr; const m = c.getContext('2d'); m.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pts = []; let a = -Math.PI / 2, x = 0, y = 0;
    for (let i = 0; i < FINISH_SEG; i++) { a += segs[i].curve * .0016; x += Math.cos(a); y += Math.sin(a); if (i % 4 === 0) pts.push([x, y]); }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const s = Math.min((r.width - 30) / (maxx - minx), (r.height - 30) / (maxy - miny)), ox = (r.width - (maxx - minx) * s) / 2, oy = (r.height - (maxy - miny) * s) / 2;
    m.lineCap = 'round'; m.lineJoin = 'round';
    for (const [w, col, blur] of [[9, 'rgba(62,242,194,.25)', 0], [4, '#3ef2c2', 10]]) {
      m.strokeStyle = col; m.lineWidth = w; m.shadowColor = '#3ef2c2'; m.shadowBlur = blur; m.beginPath();
      pts.forEach(([px, py], i) => m[i ? 'lineTo' : 'moveTo'](ox + (px - minx) * s, oy + (py - miny) * s)); m.stroke();
    }
    const [sx, sy] = pts[0], [ex, ey] = pts[pts.length - 1];
    m.shadowBlur = 0; m.fillStyle = '#fff'; m.beginPath(); m.arc(ox + (sx - minx) * s, oy + (sy - miny) * s, 5, 0, 7); m.fill();
    m.fillStyle = '#ff6fb5'; m.beginPath(); m.arc(ox + (ex - minx) * s, oy + (ey - miny) * s, 5, 0, 7); m.fill();
  }

  // ───────── 입력 ─────────
  const keyMap = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  addEventListener('keydown', e => {
    if (!S || $('race').hidden) return;
    if (keyMap[e.code]) { e.preventDefault(); S.input[keyMap[e.code]] = true; }
    else if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && !paused) S.input.boost = true; }
    else if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); paused ? resume() : pause(); }
  });
  addEventListener('keyup', e => { if (S && keyMap[e.code]) S.input[keyMap[e.code]] = false; });
  function holdBtn(id, key) {
    const b = $(id), on = e => { e.preventDefault(); if (S) { S.input[key] = true; b.classList.add('on'); } }, off = () => { if (S) S.input[key] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  }
  holdBtn('mLeft', 'left'); holdBtn('mRight', 'right');
  $('mBoost').addEventListener('pointerdown', e => { e.preventDefault(); if (S && !paused) S.input.boost = true; });
  $('boostBtn').onclick = () => { if (S && !paused) S.input.boost = true; };
  addEventListener('blur', () => { if (S && !S.ended) { S.input.left = S.input.right = false; pause(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S && !S.ended) pause(); });
  $('pauseBtn').onclick = () => (paused ? resume() : pause());
  $('resumeBtn').onclick = resume;
  $('quitBtn').onclick = () => { paused = false; finish(true); };

  $('practiceBtn').onclick = () => startRun();

  $('practiceAgainBtn').onclick = () => startRun(true);
  $('lobbyBtn').onclick = toLobby;
  addEventListener('resize', () => { if ($('race').hidden) drawMap(); });

  function drawCarAny(cx, by, w, o = {}) {
    ctx.save();
    ctx.translate(cx,by);
    ctx.rotate(o.roll || 0);
    ctx.scale(1-Math.abs(o.yaw||0)*.12,1);
    if(o.ghost)ctx.globalAlpha=.42;
    ctx.fillStyle='rgba(8,7,21,.48)';
    ctx.beginPath();ctx.ellipse(0,-w*.025,w*.50,w*.096,0,0,Math.PI*2);ctx.fill();
    const id=o.ghost ? (ghost.car || S.runCar) : S.runCar;
    if(!scenery.drawKart(ctx,id,w,o.boost ? jetStamp : null))drawCar(0,0,w,o);
    ctx.restore();
  }

  let carId='c2', owned=new Set(['c2']), signedIn=null, crewMember=false;
  let balance=null,walletPhase='loading',garageEpoch=0,garagePending=false;
  const showroom=createShowroom(CARS,changeCar,refreshGarage);
  function renderShop(){showroom.update({carId,owned,signedIn,balance,walletPhase,busy:garagePending});}

  async function api(action,body){
    const response=await fetch('/api/crew-racing/'+action,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'요청을 처리하지 못했어요.');
    return data;
  }
  function garageState(data){
    signedIn=data.signedIn;
    if(Object.hasOwn(data,'balance')){balance=data.balance;walletPhase='ready';}
    owned=new Set(data.owned);carId=CARS.some(c=>c.id===data.equipped)?data.equipped:'c2';
    renderShop();
  }
  async function refreshGarage(){
    if(garagePending)return;
    const ticket=++garageEpoch;balance=null;walletPhase='loading';renderShop();
    try{const data=await api('garage');if(ticket===garageEpoch)garageState(data);}
    catch{if(ticket===garageEpoch){walletPhase='error';renderShop();}}
  }
  function renderQuota(data){
    $('practiceBtn').textContent = crewMember&&!forced ? '▶ 이번 주 레이싱 도전' : '▶ 연습 주행 시작';
    $('raceQuota').textContent=crewMember&&!forced?`오늘 남은 공식 도전 ${data.remaining} / ${data.dailyLimit??3}회 · 한국시간 자정 초기화`:'연습 · 횟수 제한 없음';
  }
  async function loadLobby(){
    const snapshot=garageEpoch;
    try{
      const data=await api('lobby');
      crewMember=data.crewMember;renderQuota(data);if(garageEpoch===snapshot)garageState(data);document.querySelector('[data-race-mode]').textContent=crewMember&&!forced?'공식 랭킹 도전':'연습 모드';
      updateLobby();
      renderGameRankings($('racingRankings'),{crews:data.ranking,players:data.individualRanking,crewId:data.crew});
      decorateRankings($('racingRankings'));
      $('garageStatus').textContent=signedIn?'':'로그인하면 차량을 구매하고 장착할 수 있어요.';
    }catch{
      $('garageStatus').textContent='차고 정보를 불러오지 못했어요. 새로고침해서 다시 시도해주세요.';
      $('racingRankings').textContent='순위를 불러오지 못했어요.';
    }
  }
  async function changeCar(action,c,button){
    if(garagePending)return;
    if(action==='buy'&&!confirm(c.name+'를 '+c.price+c.currency+'에 구매할까요?'))return;
    ++garageEpoch;garagePending=true;button.disabled=true;
    try{garageState(await api(action,{car:c.id}));$('garageStatus').textContent=action==='buy'?'구매했어요. 장착하기를 눌러주세요.':c.name+' 장착 완료';}
    catch(e){$('garageStatus').textContent=e.message;garagePending=false;await refreshGarage();}
    finally{garagePending=false;renderShop();showroom.focusSelection();}
  }

  // 자동 검사용 (게임 동작에는 영향 없음)
  window.__race = { newRun, step, computeScore, segAt, TRACK_LEN, FINISH_SEG, STEP, CAR, RULES, PLAYER_Z, ghostTimeAt, ghostZ, ghostX, hasGhost, segs, SEG, MAP_K: .0016, COURSE_ID,
    getCar: () => carId };
  const crew = new URLSearchParams(location.search).get('crew');
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(crew)) $('crewBack').href='/#crew/'+crew;
  mountRacingLobby(() => startRun(true));
  updateLobby(); renderShop(); const lobbyReady=loadLobby();
})();
