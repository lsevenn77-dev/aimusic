import {renderGameRankings} from '/crew-game-lobby.js';
import { RULES,CAR,SEG,ROAD_W,RUMBLE,DRAW,FOV,CAM_H,CAM_DEPTH,PLAYER_Z,COURSES,STEP,newRun,computeScore,createRace } from "./physics.js";
import {CARS,raceCalendar} from "./catalog.js";
(() => {
  // 코스별 연습 주행과 점수 규칙
  const $ = id => document.getElementById(id);
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  const clock = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`; };


  const isoWeek = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); };
  const WEEK = isoWeek(new Date());
  // 검수용: 주소 끝에 #course=harbor 를 붙이면 그 코스로 열림 (화면에는 선택 메뉴 없음)
  const forced = ((globalThis.location && location.hash) || '').match(/course=(\w+)/);
  // 기준: 2026년 45주(11/2 월요일 시작)가 레이싱 1회차 · 네온 리버사이드
  const COURSE_ID = forced && Object.hasOwn(COURSES, forced[1]) ? forced[1] : raceCalendar().course;
  const COURSE=COURSES[COURSE_ID];
  const {step,segs,segAt,TRACK_LEN,FINISH_SEG}=createRace(COURSE_ID);
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
    p.screen.scale = CAM_DEPTH / p.camera.z;
    p.screen.x = v.w / 2 + p.screen.scale * p.camera.x * v.w / 2;
    p.screen.y = v.horizon - p.screen.scale * p.camera.y * v.ys;
    p.screen.w = p.screen.scale * ROAD_W * v.w / 2;
  }
  let skyOffset = 0;
  // 배경 (고정 시드)
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const towers = []; for (let x = 0; x < 1; ) { const w = .012 + rnd() * .03; towers.push({ x, w, h: .05 + rnd() * .16 * (x > .45 && x < .75 ? 1.8 : 1), spire: rnd() < .2 }); x += w + .002; }
  const hills = Array.from({ length: 24 }, (_, i) => ({ x: i / 24, h: .02 + rnd() * .05 }));

  function drawBg(v, off) {
    const { w } = v, hz = v.horizon;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#2a2266'); sky.addColorStop(.45, '#6b48b8'); sky.addColorStop(.8, '#d77fc0'); sky.addColorStop(1, '#f2a7c6');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, hz + 2);
    // 구름 띠
    ctx.fillStyle = 'rgba(255,190,225,.18)';
    for (let i = 0; i < 6; i++) { const cx = ((i * .23 - off * .2) % 1.2 + 1.2) % 1.2 * w - w * .1; ctx.beginPath(); ctx.ellipse(cx, hz * (.35 + (i % 3) * .1), w * .14, hz * .03, 0, 0, 7); ctx.fill(); }
    // 먼 산
    ctx.fillStyle = '#4b3a8e';
    ctx.beginPath(); ctx.moveTo(0, hz);
    for (let i = 0; i <= 48; i++) { const f = i / 48, hh = hills[i % 24].h; ctx.lineTo(f * w, hz - hh * v.h * .6 - Math.sin((f + off * .3) * 9) * v.h * .01); }
    ctx.lineTo(w, hz); ctx.fill();
    // 도시 스카이라인 (오른쪽 강 건너)
    const base = hz - v.h * .005;
    for (const t of towers) {
      const x = ((t.x - off * .5) % 1 + 1) % 1 * w * 1.1 - w * .05, bw = t.w * w, bh = t.h * v.h * .55;
      const g = ctx.createLinearGradient(0, base - bh, 0, base); g.addColorStop(0, '#5a4fb5'); g.addColorStop(1, '#2a2468');
      ctx.fillStyle = g; ctx.fillRect(x, base - bh, bw, bh);
      if (t.spire) { ctx.fillRect(x + bw / 2 - 1.5, base - bh - bh * .35, 3, bh * .35); ctx.fillStyle = '#ff6fb5'; ctx.fillRect(x + bw / 2 - 2, base - bh - bh * .35, 4, 4); }
      ctx.fillStyle = 'rgba(255,225,170,.55)';
      for (let yy = base - bh + 5; yy < base - 4; yy += 7) for (let xx = x + 3; xx < x + bw - 3; xx += 6) if ((xx * 7 + yy * 3) % 5 < 2) ctx.fillRect(xx, yy, 2, 3);
    }
    // 관람차
    const fx = ((0.82 - off * .5) % 1 + 1) % 1 * w * 1.1 - w * .05, fr = v.h * .085, fy = base - fr - 2;
    ctx.save(); ctx.strokeStyle = 'rgba(255,140,220,.85)'; ctx.lineWidth = 2; ctx.shadowColor = '#ff6fb5'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(fx, fy, fr, 0, 7); ctx.stroke();
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + performance.now() / 9000; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr); ctx.stroke(); }
    ctx.restore();
    // 강 (수평선 아래로 반사광)
    const wg = ctx.createLinearGradient(0, hz, 0, hz + v.h * .12);
    wg.addColorStop(0, '#5a3f9e'); wg.addColorStop(1, '#1a1640');
    ctx.fillStyle = wg; ctx.fillRect(0, hz, w, v.h * .2);
    ctx.fillStyle = 'rgba(255,200,240,.25)';
    for (let i = 0; i < 40; i++) { const x = ((i * .061 - off * .5) % 1 + 1) % 1 * w, y = hz + 3 + (i % 7) * v.h * .012; ctx.fillRect(x, y, 10 + (i % 4) * 8, 1.5); }
  }

  function quad(x1, y1, w1, x2, y2, w2, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x1 + w1, y1); ctx.closePath(); ctx.fill(); }

  function drawSegment(s, v) {
    const a = s.p1.screen, b = s.p2.screen;
    const alt = Math.floor(s.i / RUMBLE) % 2;
    // 도로 바깥 (어두운 강변 둔치)
    ctx.fillStyle = alt ? '#191838' : '#1c1b3e'; ctx.fillRect(0, b.y, v.w, a.y - b.y + 1);
    // 아스팔트
    quad(a.x, a.y, a.w, b.x, b.y, b.w, alt ? '#2b2a3f' : '#302f45');
    // 가장자리 흰 선
    const e1 = a.w * .03, e2 = b.w * .03;
    quad(a.x - a.w + e1, a.y, e1, b.x - b.w + e2, b.y, e2, 'rgba(235,235,255,.8)');
    quad(a.x + a.w - e1, a.y, e1, b.x + b.w - e2, b.y, e2, 'rgba(235,235,255,.8)');
    // 차선 점선
    if (alt) for (const f of [-1 / 3, 1 / 3]) quad(a.x + a.w * f, a.y, a.w * .012, b.x + b.w * f, b.y, b.w * .012, 'rgba(255,255,255,.45)');
    // 결승선 체크무늬
    if (s.i === FINISH_SEG || s.i === FINISH_SEG + 1) {
      const n = 12; for (let k = 0; k < n; k++) { const f0 = -1 + 2 * k / n, f1 = -1 + 2 * (k + 1) / n; ctx.fillStyle = (k + s.i) % 2 ? '#fff' : '#222'; ctx.beginPath(); ctx.moveTo(a.x + a.w * f0, a.y); ctx.lineTo(a.x + a.w * f1, a.y); ctx.lineTo(b.x + b.w * f1, b.y); ctx.lineTo(b.x + b.w * f0, b.y); ctx.fill(); }
    }
    // 네온 가드레일 (양쪽 세로 벽면)
    for (const side of [-1, 1]) {
      const xa = a.x + side * a.w * 1.04, xb = b.x + side * b.w * 1.04;
      const ha = a.scale * 420 * v.ys, hb = b.scale * 420 * v.ys;
      ctx.fillStyle = '#26244f';
      ctx.beginPath(); ctx.moveTo(xa, a.y); ctx.lineTo(xb, b.y); ctx.lineTo(xb, b.y - hb); ctx.lineTo(xa, a.y - ha); ctx.fill();
      const lit = s.i % 4 < 2;
      ctx.fillStyle = lit ? '#5ff7d2' : '#2bbf9b';
      ctx.beginPath(); ctx.moveTo(xa, a.y - ha); ctx.lineTo(xb, b.y - hb); ctx.lineTo(xb, b.y - hb * .62); ctx.lineTo(xa, a.y - ha * .62); ctx.fill();
      ctx.fillStyle = lit ? 'rgba(200,150,255,.9)' : 'rgba(150,100,230,.6)';
      ctx.beginPath(); ctx.moveTo(xa, a.y - ha * .3); ctx.lineTo(xb, b.y - hb * .3); ctx.lineTo(xb, b.y - hb * .18); ctx.lineTo(xa, a.y - ha * .18); ctx.fill();
    }
  }

  function drawSprite(s, sp, v) {
    const a = s.p1.screen, sc = a.scale, x = a.x + sc * sp.x * ROAD_W * v.w / 2, y = a.y;
    const u = sc * v.w / 2;   // 월드 1 단위 → 화면
    if (y > s.clip + 2) return;
    if (sp.k === 'lamp') {
      const h = 1500 * u, wdt = Math.max(1, 40 * u);
      ctx.fillStyle = '#3a3870'; ctx.fillRect(x - wdt / 2, y - h, wdt, h);
      const dir = -Math.sign(sp.x);   // 등 팔은 도로 쪽으로
      ctx.save(); ctx.shadowColor = '#7ffbe0'; ctx.shadowBlur = 14; ctx.fillStyle = '#c8fff2';
      ctx.fillRect(dir > 0 ? x : x - wdt * 6, y - h, wdt * 6, Math.max(1, wdt * .9)); ctx.restore();
    } else if (sp.k === 'palm') {
      const h = 1700 * u, tw = Math.max(1, 60 * u);
      ctx.fillStyle = '#152a2c'; ctx.fillRect(x - tw / 2, y - h, tw, h);
      ctx.fillStyle = '#1d4a43';
      for (let i = 0; i < 6; i++) { const ang = -Math.PI / 2 + (i - 2.5) * .5; ctx.beginPath(); ctx.ellipse(x + Math.cos(ang) * 260 * u, y - h + Math.sin(ang) * 120 * u + 80 * u, 360 * u, 70 * u, ang, 0, 7); ctx.fill(); }
    } else if (sp.k === 'chev') {
      const bw = 900 * u, bh = 380 * u, top = y - 520 * u - bh;
      ctx.fillStyle = 'rgba(70,40,140,.92)'; ctx.fillRect(x - bw / 2, top, bw, bh);
      ctx.save(); ctx.shadowColor = '#e0c8ff'; ctx.shadowBlur = 10; ctx.fillStyle = '#efe4ff';
      for (let k = 0; k < 3; k++) {
        const cx = x + (k - 1) * bw * .26, d = sp.dir;   // dir>0 오른쪽 코너 → 화살표는 오른쪽
        ctx.beginPath(); ctx.moveTo(cx + d * bw * .1, top + bh / 2); ctx.lineTo(cx - d * bw * .04, top + bh * .15); ctx.lineTo(cx - d * bw * .12, top + bh * .15); ctx.lineTo(cx + d * bw * .02, top + bh / 2); ctx.lineTo(cx - d * bw * .12, top + bh * .85); ctx.lineTo(cx - d * bw * .04, top + bh * .85); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

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
    const v = { w: r.width, h: r.height, horizon: r.height * (portrait ? .4 : .5), ys: portrait ? r.width * .62 : r.height / 2 };
    const shake = S.shake > 0 ? (Math.random() - .5) * 12 * S.shake : 0;
    ctx.save(); ctx.translate(shake, 0);

    const base = segAt(S.z), basePct = (S.z % SEG) / SEG;
    const pSeg = segAt(S.z + PLAYER_Z), pPct = ((S.z + PLAYER_Z) % SEG) / SEG;
    const pY = pSeg.p1.world.y + (pSeg.p2.world.y - pSeg.p1.world.y) * pPct;
    skyOffset += pSeg.curve * (S.speed / CAR.maxSpeed) * .0006;
    drawBg(v, skyOffset);

    let maxy = v.h, x = 0, dx = -(base.curve * basePct);
    const list = [];
    for (let n = 0; n < DRAW; n++) {
      const s = segs[base.i + n]; if (!s) break;
      project(s.p1, S.x * ROAD_W - x, pY + CAM_H, S.z, v);
      project(s.p2, S.x * ROAD_W - x - dx, pY + CAM_H, S.z, v);
      x += dx; dx += s.curve;
      s.clip = maxy;
      if (s.p1.camera.z <= CAM_DEPTH || s.p2.screen.y >= s.p1.screen.y || s.p2.screen.y >= maxy) continue;
      list.push(s); maxy = s.p2.screen.y;
    }
    // 고스트 위치
    const gz = ghostZ(S.t), gSeg = segAt(gz + PLAYER_Z);
    for (let k = list.length - 1; k >= 0; k--) {
      const s = list[k];
      drawSegment(s, v);
      for (const sp of s.sprites) drawSprite(s, sp, v);
      if (ghost && s === gSeg && gz > S.z + 50) {
        const pct = ((gz + PLAYER_Z) % SEG) / SEG, a = s.p1.screen, b = s.p2.screen;
        const gx = ghostX(S.t);
        const sc = a.scale + (b.scale - a.scale) * pct;
        const sx = a.x + (b.x - a.x) * pct + sc * gx * ROAD_W * v.w / 2, sy = a.y + (b.y - a.y) * pct;
        const cw = sc * 1500 * v.w / 2;
        if (cw > 4 && sy <= s.clip + 2) { drawCarAny(sx, sy, cw, { ghost: true }); tag(sx, sy - cw * .7, 'BEST', Math.max(10, Math.min(16, cw * .14))); }
      }
    }

    // 속도선 (부스터)
    if (S.boostT > 0) {
      ctx.save(); ctx.strokeStyle = 'rgba(200,255,240,.35)'; ctx.lineWidth = 2;
      for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2 + S.t * 3, r0 = v.w * (.25 + (i % 5) * .05), r1 = r0 + v.w * .12; ctx.beginPath(); ctx.moveTo(v.w / 2 + Math.cos(a) * r0, v.horizon + Math.sin(a) * r0 * .55); ctx.lineTo(v.w / 2 + Math.cos(a) * r1, v.horizon + Math.sin(a) * r1 * .55); ctx.stroke(); }
      ctx.restore();
    }

    // 플레이어 차량
    // 시안 비율: 차는 화면 폭의 약 1/5, 아래쪽에 도로가 보이도록 조금 위에 둠
    const carW = portrait ? v.w * .34 : Math.min(v.w * .2, v.h * .36);
    const carY = v.h - (portrait ? v.h * .25 : v.h * .14);
    const bounce = S.speed > 100 ? Math.sin(S.t * 40) * .8 : 0;
    // 드리프트 스파크·타이어 자국
    if (S.drift || S.shake > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) { const sx = carW * (i % 2 ? .38 : -.38) + (Math.random() - .5) * carW * .1, sy = carY - Math.random() * carW * .08; ctx.fillStyle = `rgba(${200 + Math.random() * 55},${120 + Math.random() * 60},255,.9)`; ctx.fillRect(v.w / 2 + sx + (Math.random() - .5) * 20, sy + Math.random() * 14, 2, 2); }
      ctx.restore();
      ctx.strokeStyle = 'rgba(10,10,20,.35)'; ctx.lineWidth = carW * .06;
      for (const sx of [-.38, .38]) { ctx.beginPath(); ctx.moveTo(v.w / 2 + carW * sx, carY); ctx.quadraticCurveTo(v.w / 2 + carW * sx - S.tilt * carW * .3, carY + v.h * .1, v.w / 2 + carW * sx - S.tilt * carW * .5, v.h + 10); ctx.stroke(); }
    }
    drawCarAny(v.w / 2 + S.tilt * carW * .06, carY + bounce, carW, {
      tilt: S.tilt * (S.drift ? 2.2 : 1), boost: S.boostT > 0,
      yaw: S.tilt * (S.drift ? .42 : .16), roll: S.tilt * (S.drift ? .05 : .025),
    });
    ctx.restore();
  }

  // ───────── 진행 ─────────
  let S = null, raf = 0, last = 0, acc = 0, paused = false;
  let starting=false;
  async function startRun() {
    if(starting)return;
    starting=true;
    let session=null;
    try{
      await lobbyReady;
      if(crewMember&&!forced)session=(await api('start',{course:COURSE_ID})).id;
    }catch(e){alert(e.message);return;}
    finally{starting=false;}

    S = newRun(); Object.assign(S,{session,ticks:0,events:[],mask:0}); ghost = store.get('rc-ghost-' + COURSE_ID, null); paused = false; acc = 0; last = performance.now(); skyOffset = 0;
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
    // 3D 월드가 준비됐으면 3D로, 아니면 기존 2D 의사 3D로 그림 (물리·점수는 같음)
    const w3 = window.__world3d;
    cv.hidden = !!w3?.carReady;
    if (w3?.carReady) w3.render(S, paused ? 0 : dt); else render(S);
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
  function pause() { if (!S || S.ended || paused) return; paused = true; S.input.left = S.input.right = S.input.boost = false; $('pauseKind').textContent = '연습 주행'; $('pauseNote').textContent = '중간에 그만두면 이번 주행은 저장하지 않아요.'; $('pauseOv').hidden = false; }
  function resume() { if (!paused) return; paused = false; last = performance.now(); $('pauseOv').hidden = true; }
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
    if (S.finished) { const best = store.get('rc-best-' + COURSE_ID, null); if (!best || S.t < best) store.set('rc-best-' + COURSE_ID, S.t); }

    const prev = store.get('rc-ghost-' + COURSE_ID, null), newGhost = !quit && (!prev || score > prev.score);
    if (newGhost) { record(S); store.set('rc-ghost-' + COURSE_ID, { score, finished: S.finished, time: S.t, z: S.trace.z, x: S.trace.x }); }
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
  function toLobby() { cancelAnimationFrame(raf); S = null; $('race').hidden = true; $('lobbyView').hidden = false; document.body.classList.remove('racing'); updateLobby(); }
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

  $('practiceBtn').onclick = startRun;

  $('practiceAgainBtn').onclick = startRun;
  $('lobbyBtn').onclick = toLobby;
  addEventListener('resize', () => { if ($('race').hidden) drawMap(); });

  // 3D 차량이 준비됐으면 그 이미지를, 아니면 2D 차량을 그림
  function drawCarAny(cx, by, w, o = {}) {
    if (o.ghost) return drawCar(cx, by, w, o);
    const sprite = rearSprites.get(carId);
    if (!sprite?.naturalWidth) return;
    const h = w * sprite.naturalHeight / sprite.naturalWidth;
    ctx.save();
    ctx.translate(cx, by);
    ctx.rotate(o.roll || 0);
    ctx.drawImage(sprite, -w / 2, -h, w, h);
    ctx.restore();
  }

  let carId='c2', owned=new Set(['c2']), signedIn=false, crewMember=false;
  const rearSprites = new Map();
  function prepareRearSprite() {
    if (rearSprites.has(carId)) return;
    const image = new Image();
    rearSprites.set(carId, image);
    image.src = './rear/' + carId + '.webp';
  }
  prepareRearSprite();
  function renderShop() {

    const g = $('garage'); g.textContent = '';
    for (const c of CARS) {
      const on = c.id === carId;
      const card = document.createElement('div'); card.className = 'carcard' + (on ? ' on' : '');
      const th = document.createElement('div'); th.className = 'thumb';
      const im = new Image(960,540); im.src = './showroom/'+c.id+'.webp'; im.alt=c.name; im.decoding='async'; th.append(im);
      const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = c.name;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'act';
      if (on) { b.classList.add('equipped'); b.textContent = '장착 중'; b.disabled = true; }
      else if(owned.has(c.id)){b.textContent='장착하기';b.onclick=()=>changeCar('equip',c,b);}
      else{b.textContent=fmt(c.price)+c.currency+' · 구매';b.disabled=!signedIn;b.onclick=()=>changeCar('buy',c,b);}

      card.append(th, nm, b); g.append(card);
    }
  }

  async function api(action,body){
    const response=await fetch('/api/crew-racing/'+action,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'요청을 처리하지 못했어요.');
    return data;
  }
  function garageState(data){
    owned=new Set(data.owned);carId=data.equipped;
    prepareRearSprite();
    window.__world3d?.setCar?.(carId);renderShop();
  }
  async function loadLobby(){
    try{
      const data=await api('lobby');
      signedIn=data.signedIn;crewMember=data.crewMember;garageState(data);document.querySelector('[data-race-mode]').textContent=crewMember&&!forced?'공식 랭킹 도전':'연습 모드';
      updateLobby();
      renderGameRankings($('racingRankings'),{crews:data.ranking,players:data.individualRanking,crewId:data.crew});
      $('garageStatus').textContent=signedIn?'':'로그인하면 차량을 구매하고 장착할 수 있어요.';
    }catch{
      $('garageStatus').textContent='차고 정보를 불러오지 못했어요. 새로고침해서 다시 시도해주세요.';
      $('racingRankings').textContent='순위를 불러오지 못했어요.';
    }
  }
  async function changeCar(action,c,button){
    if(action==='buy'&&!confirm(c.name+'를 '+c.price+c.currency+'에 구매할까요?'))return;
    button.disabled=true;
    try{garageState(await api(action,{car:c.id}));$('garageStatus').textContent=action==='buy'?'구매했어요. 장착하기를 눌러주세요.':c.name+' 장착 완료';}
    catch(e){button.disabled=false;$('garageStatus').textContent=e.message;}
  }

  // 자동 검사용 (게임 동작에는 영향 없음)
  window.__race = { newRun, step, computeScore, segAt, TRACK_LEN, FINISH_SEG, STEP, CAR, RULES, PLAYER_Z, ghostTimeAt, ghostZ, ghostX, hasGhost, segs, SEG, MAP_K: .0016, COURSE_ID,
    getCar: () => carId };
  const crew = new URLSearchParams(location.search).get('crew');
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(crew)) $('crewBack').href='/#crew/'+crew;
  updateLobby(); renderShop(); const lobbyReady=loadLobby();
})();
