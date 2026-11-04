import {renderGameRankings} from '/crew-game-lobby.js';
import {VERSION,RULES,CHART,notesFor,computeScore,createRhythmRun,advanceRhythm,inputRhythm,completeRhythm} from "./core.js";
(() => {
  // ───────── 설정: 점수 규칙·판정 (서버도 같은 값으로 검증) ─────────

  const LANE_COLORS = ['#3ef2c2', '#ff5fae', '#b46bff', '#3cd8ff'];   // 민트 / 핑크 / 퍼플 / 시안
  const KEYS = { KeyF: 0, KeyG: 1, KeyH: 2, KeyJ: 3 };
  const KEY_LABEL = ['F', 'G', 'H', 'J'];
  const $ = id => document.getElementById(id);
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  const mmss = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

  // 점수 계산: 판정 가중치 합 기준 기본 점수 + 최대 콤보 비례 보너스
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let syncMs = store.get('aifect.crew-rhythm.sync', 0);
  let diff = 'hard';
  let actx = null, decoded = null;

  // ───────── 공통 렌더러: 레인·노트·링이 같은 좌표계를 씀 ─────────
  // A shared projection keeps note travel, lane edges and touch targets aligned.
  function makeView(w, h, mobile) {
    const judgeY = h * .84;
    const horizon = h * .08;
    const span = mobile ? w * .96 : Math.min(w * .82, h * 1.32, 1120);
    return { w, h, cx: w / 2, judgeY, horizon, span };
  }
  function sizeCanvas(canvas, context) {
    const rect = canvas.getBoundingClientRect();
    const area = Math.max(1, rect.width * rect.height);
    const scale = Math.min(window.devicePixelRatio || 1, Math.sqrt(8294400 / area));
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(width / (rect.width || 1), 0, 0, height / (rect.height || 1), 0, 0);
    return rect;
  }
  function depth(d) {
    const z = Math.max(-.2, d);
    return z / (.78 + .32 * z);
  }
  const sc = d => 1 - .64 * depth(d);
  const projY = (v, d) => v.judgeY - (v.judgeY - v.horizon) * depth(d);
  const projX = (v, frac, d) => v.cx + (frac - .5) * v.span * sc(d);

  function drawStage(c, v, now, notes, look, fx, pressed, opts = {}) {
    const { w, h } = v;
    // 배경
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b0e2a'); bg.addColorStop(.6, '#0a0c22'); bg.addColorStop(1, '#05061a');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    // 별
    c.fillStyle = 'rgba(200,210,255,.5)';
    for (let i = 0; i < 70; i++) { const x = (i * 137.5) % w, y = ((i * 71.3) % (v.horizon + 120)); c.fillRect(x, y, 1.4, 1.4); }
    // 이퀄라이저 (양쪽)
    drawEq(c, v, opts.eq, now);

    // 레인 바닥 (판정선 아래 조금 + 먼 곳)
    const dFar = 1.15, dNear = -.16;
    for (let i = 0; i < 4; i++) {
      const l = i / 4, r = (i + 1) / 4;
      const g = c.createLinearGradient(0, projY(v, dFar), 0, projY(v, dNear));
      g.addColorStop(0, 'rgba(10,14,40,0)'); g.addColorStop(.75, hexA(LANE_COLORS[i], pressed && pressed[i] ? .20 : .07)); g.addColorStop(1, hexA(LANE_COLORS[i], pressed && pressed[i] ? .32 : .12));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(projX(v, l, dFar), projY(v, dFar)); c.lineTo(projX(v, r, dFar), projY(v, dFar)); c.lineTo(projX(v, r, dNear), projY(v, dNear)); c.lineTo(projX(v, l, dNear), projY(v, dNear)); c.closePath(); c.fill();
    }
    // 레인 경계선
    for (let i = 0; i <= 4; i++) {
      const f = i / 4, edgeCol = i === 0 ? LANE_COLORS[0] : i === 4 ? LANE_COLORS[3] : LANE_COLORS[i - 1];
      const g = c.createLinearGradient(0, projY(v, dFar), 0, projY(v, dNear));
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, hexA(edgeCol, i % 4 === 0 ? .9 : .45));
      c.strokeStyle = g; c.lineWidth = i % 4 === 0 ? 2.5 : 1.2;
      c.beginPath(); c.moveTo(projX(v, f, dFar), projY(v, dFar)); c.lineTo(projX(v, f, dNear), projY(v, dNear)); c.stroke();
    }
    // 누른 레인 직사각형 빛기둥: 누른 순간 밝게 번쩍, 누르고 있는 동안은 은은하게
    if (opts.beam) for (let i = 0; i < 4; i++) {
      const since = now - opts.beam[i], flash = since >= 0 && since < .14 ? 1 - since / .14 : 0;
      const a = Math.max(flash, pressed && pressed[i] ? .35 : 0);
      if (a <= 0) continue;
      const l = i / 4 + .004, r = (i + 1) / 4 - .004, top = .55, bot = -.06;
      const g = c.createLinearGradient(0, projY(v, top), 0, projY(v, bot));
      g.addColorStop(0, hexA(LANE_COLORS[i], 0)); g.addColorStop(.7, hexA(LANE_COLORS[i], .28 * a)); g.addColorStop(1, hexA('#ffffff', .55 * a));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(projX(v, l, top), projY(v, top)); c.lineTo(projX(v, r, top), projY(v, top)); c.lineTo(projX(v, r, bot), projY(v, bot)); c.lineTo(projX(v, l, bot), projY(v, bot)); c.closePath(); c.fill();
      c.save(); c.strokeStyle = hexA(LANE_COLORS[i], .9 * a); c.lineWidth = 2; c.shadowColor = LANE_COLORS[i]; c.shadowBlur = 14 * a; c.stroke(); c.restore();
    }
    for (let i = 0; i < 4; i++) drawPad(c, v, i, pressed && pressed[i], fx, now, opts.labels);
    // A note's center crosses this line on its beat (depth zero).
    c.save(); c.shadowColor = '#cdeaff'; c.shadowBlur = 5; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(projX(v, 0, 0), v.judgeY); c.lineTo(projX(v, 1, 0), v.judgeY); c.stroke(); c.restore();

    // 노트 (먼 것부터)
    const vis = [];
    for (const n of notes) {
      if (n.done && !(n.len && n.holding)) continue;
      const d0 = (n.t - now) / look, d1 = n.len ? (n.t + n.len - now) / look : d0;
      if (d0 > dFar + .05 && d1 > dFar) continue;
      if (d1 < -.25) continue;
      vis.push([n, d0, d1]);
    }
    vis.sort((a, b) => b[1] - a[1]);
    for (const [n, d0, d1] of vis) {
      if (n.len) drawLong(c, v, n, Math.max(n.holding ? 0 : -1, d0), Math.min(d1, dFar));
      else drawNote(c, v, n.lane, d0, 1);
    }

  }

  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  function rr(c, x, y, w, h, r) { r = Math.min(r, h / 2, w / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  const NOTE_INSET = .09;
  const noteHeight = (v, scale, size) => Math.max(4, v.span * .034 * scale * size);
  // 입체 캡슐 노트: 아래 두께 → 몸통 → 위 반사광
  function drawNote(c, v, lane, d, sizeMul) {
    const s = sc(d), inset = NOTE_INSET / 4;
    const xl = projX(v, lane / 4 + inset, d), xr = projX(v, (lane + 1) / 4 - inset, d);
    const y = projY(v, d), hgt = noteHeight(v, s, sizeMul), w = xr - xl;
    const col = LANE_COLORS[lane];
    c.save();
    c.fillStyle = hexA(col, .55); rr(c, xl, y - hgt / 2 + hgt * .32, w, hgt, hgt / 2); c.fill();          // 두께
    c.shadowColor = col; c.shadowBlur = 18 * s;
    const g = c.createLinearGradient(0, y - hgt / 2, 0, y + hgt / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.35, col); g.addColorStop(1, hexA(col, .85));
    c.fillStyle = g; rr(c, xl, y - hgt / 2, w, hgt, hgt / 2); c.fill();
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,.65)'; rr(c, xl + w * .12, y - hgt / 2 + hgt * .12, w * .76, hgt * .22, hgt * .11); c.fill();   // 반사광
    c.restore();
  }

  // 롱노트: 머리·몸통·끝을 같은 투영으로 연결
  function drawLong(c, v, n, d0, d1) {
    const col = LANE_COLORS[n.lane], inset = .2;
    const a = Math.max(d0, -.15), b = Math.max(a, d1);
    const l = (n.lane + inset) / 4, r = (n.lane + 1 - inset) / 4;
    c.save();
    const g = c.createLinearGradient(0, projY(v, b), 0, projY(v, a));
    g.addColorStop(0, hexA(col, .35)); g.addColorStop(1, hexA(col, n.holding ? .85 : .6));
    c.fillStyle = g; c.shadowColor = col; c.shadowBlur = n.holding ? 22 : 10;
    c.beginPath(); c.moveTo(projX(v, l, b), projY(v, b)); c.lineTo(projX(v, r, b), projY(v, b)); c.lineTo(projX(v, r, a), projY(v, a)); c.lineTo(projX(v, l, a), projY(v, a)); c.closePath(); c.fill();
    c.shadowBlur = 0; c.strokeStyle = hexA('#ffffff', .35); c.lineWidth = 1; c.stroke();
    c.restore();
    if (d1 <= 1.15) drawNote(c, v, n.lane, d1, .8);   // 끝
    drawNote(c, v, n.lane, n.holding ? 0 : d0, 1.05);   // 머리
  }

  function drawPad(c, v, i, isDown, fx, now, labels) {
    const x = projX(v, (i + .5) / 4, 0);
    const rx = v.span / 8 * (1 - 2 * NOTE_INSET);
    const ry = noteHeight(v, sc(0), 1) / 2;
    const y = v.judgeY + 5 + ry;
    const col = LANE_COLORS[i];
    const hit = fx && fx[i] && now - fx[i].t < .22 ? fx[i] : null;
    const k = hit ? 1 - (now - hit.t) / .22 : 0;
    c.save();
    if (hit) {   // 타격광: 짧은 방사형 + 빛줄기
      const R = rx * (1.6 + (1 - k) * .6);
      const rg = c.createRadialGradient(x, y, 0, x, y, R);
      rg.addColorStop(0, hexA('#ffffff', .85 * k)); rg.addColorStop(.3, hexA(col, .7 * k)); rg.addColorStop(1, hexA(col, 0));
      c.fillStyle = rg; c.beginPath(); c.ellipse(x, y, R, R * .75, 0, 0, 7); c.fill();
      c.strokeStyle = hexA(col, .9 * k); c.lineWidth = 2;
      for (let a = 0; a < 9; a++) { const ang = Math.PI + (a / 8) * Math.PI, L = rx * (1.2 + (a % 3) * .35) * (1.2 - k * .4); c.beginPath(); c.moveTo(x + Math.cos(ang) * rx * .5, y + Math.sin(ang) * ry); c.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L * .9); c.stroke(); }
    }
    c.translate(0, y - v.judgeY);
    c.globalAlpha = isDown ? 1 : .48 + k * .52;
    drawNote(c, v, i, 0, 1);
    c.restore();
    if (labels) {
      c.save(); c.font = `italic 800 ${Math.round(rx * .42)}px "Exo 2", sans-serif`; c.textAlign = 'center'; c.fillStyle = 'rgba(238,241,255,.9)';
      c.fillText(labels[i], x, Math.min(v.h - 3, y + ry * 1.64 + Math.min(rx * .55, v.h * .1))); c.restore();
    }
  }

  function drawEq(c, v, data, now) {
    const n = 12, margin = v.w * .022;
    const bottom = projY(v, .32);
    const available = projX(v, 0, .32) - margin * 2;
    const step = Math.min(v.w * .011, available / n);
    const bw = step * .7;
    if (bw < 1) return;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? margin : v.w - margin - n * step;
      for (let i = 0; i < n; i++) {
        const val = data ? data[(i * 3 + (side > 0 ? 7 : 2)) % data.length] / 255
          : .45 + .32 * Math.sin(now * 3 + i * .8 + side);
        const bars = Math.round(val * 14);
        for (let b = 0; b < bars; b++) {
          c.fillStyle = hexA(b > 10 ? '#ff5fae' : b > 6 ? '#b46bff' : '#6a5cff', .55);
          c.fillRect(x0 + i * step, bottom - b * (bw * .75 + 2), bw, bw * .75);
        }
      }
    }
  }

  // ───────── 로딩 ─────────

  const crew = new URLSearchParams(location.search).get('crew');
  if (crew && /^(preview|[a-zA-Z0-9_-]{1,80})$/.test(crew)) {
    const fromCrew = new URLSearchParams(location.search).get('from') === 'crew';
    $('backLink').href = (fromCrew ? '/#crew/' : '/#crew-jump/') + encodeURIComponent(crew);
    if (fromCrew) $('backLink').textContent = '‹ 크루로';
  }

  // ───────── 대기실 ─────────
  const practiceBests = new Map();
  function updateLobby() {
    const best = lobbyInfo ? lobbyInfo.bests.find(row=>row.difficulty===diff) : practiceBests.get(diff);
    $('practiceBest').textContent = best ? fmt(best.score) : '기록 없음';
    $('practiceCombo').textContent = best ? fmt(best.combo) : '—';
    $('bestDiff').textContent = diff.toUpperCase();
    if (CHART) $('noteCount').textContent = `${diff.toUpperCase()} 노트 ${notesFor(diff).length}개`;
    document.querySelectorAll('.diff').forEach(b => b.setAttribute('aria-pressed', b.dataset.d === diff));
    $('syncVal').textContent = $('syncVal2').textContent = `${syncMs > 0 ? '+' : ''}${syncMs} ms`;
  }
  document.querySelectorAll('.diff').forEach(b => b.onclick = () => { diff = b.dataset.d; previewNotes = null; updateLobby(); });
  const bumpSync = dv => { syncMs = Math.max(-300, Math.min(300, syncMs + dv)); store.set('aifect.crew-rhythm.sync', syncMs); updateLobby(); };
  $('syncMinus').onclick = $('syncMinus2').onclick = () => bumpSync(-10);
  $('syncPlus').onclick = $('syncPlus2').onclick = () => bumpSync(10);
  $('rulesBtn').onclick = () => alertPanel();
  function alertPanel() {
    const el = document.querySelector('.howto'); el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.animate([{ outline: '2px solid #3ef2c2' }, { outline: '2px solid transparent' }], { duration: 1200 });
  }

  // 대기실 미리보기: 같은 렌더러로 소리 없이 노트만 흘림
  const pcv = $('previewCv'), pctx = pcv.getContext('2d');
  let previewNotes = null;
  function drawPreview(ts) {
    if (!CHART || !$('play').hidden) return;
    const r = sizeCanvas(pcv, pctx);
    if (!previewNotes) previewNotes = notesFor(diff);
    const now = 14 + (ts / 1000) % 16;
    const v = makeView(r.width, r.height, r.width <= 720);
    const fx = [];
    for (const n of previewNotes) if (!n.len && n.t <= now && n.t > now - .2) fx[n.lane] = { t: n.t };
    drawStage(pctx, v, now, previewNotes.filter(n => n.t + (n.len || 0) > now - .1), RULES.lookahead[diff], fx, null, {});
  }

  // ───────── 게임 상태 ─────────
  let G = null, raf = 0;
  const pressed = [false, false, false, false];
  const pointerLane = new Map();


  let starting = false, lobbyInfo=null, pendingSession=null, startKey=null, pendingReport=null;
  async function startGame(official=false) {
    if (starting || (G && !G.ended)) return;
    starting = true;
    $('practiceBtn').disabled = $('practiceAgainBtn').disabled = true;
    $('startReason').hidden = false;
    $('startReason').textContent = '음원을 준비하고 있어요…';
    try {
      actx ??= new (window.AudioContext || window.webkitAudioContext)();
      await actx.resume();
      if (!decoded) {
        const response = await fetch('/crew-rhythm/double-tap.m4a');
        if (!response.ok) throw new Error('audio ' + response.status);
        decoded = await actx.decodeAudioData(await response.arrayBuffer());
      }
      let session=null;
      if(official){
        await lobbyReady;
        session=await api('start',{difficulty:diff,requestId:startKey??=crypto.randomUUID()});
        if(session.version!==VERSION)throw new Error('게임 규칙이 바뀌었어요. 새로고침해주세요.');
        startKey=null;
      }
      pendingSession=session;beginRun();
      $('startReason').hidden = true;
    } catch (error) {
      toLobby();
      $('startReason').hidden=false;$('startReason').textContent = error.message || '게임을 준비하지 못했어요. 다시 시도해주세요.';
      console.error(error);
    } finally {
      starting = false;
      $('practiceBtn').disabled = $('practiceAgainBtn').disabled = false;
    }
  }
  function beginRun() {
    const notes = notesFor(diff);
    const analyser = actx.createAnalyser(); analyser.fftSize = 64;
    const gain = actx.createGain(); gain.gain.value = .9;
    analyser.connect(gain).connect(actx.destination);
    G = {
      ...createRhythmRun(diff),session:pendingSession,events:[],gain, diff, notes, total: notes.length, look: RULES.lookahead[diff],
      counts: { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 }, combo: 0, maxCombo: 0,
      life: RULES.life.start, beam: [-9, -9, -9, -9], endReason: '',
      fx: [], judgeText: null, analyser, eq: new Uint8Array(analyser.frequencyBinCount),
      startAt: actx.currentTime + RULES.leadIn, src: null, paused: false, ended: false,
      lastT: notes.reduce((m, n) => Math.max(m, n.t + n.len), 0),
    };
    const src = actx.createBufferSource(); src.buffer = decoded; src.connect(analyser); src.start(G.startAt); G.src = src;
    pressed.fill(false); pointerLane.clear();
    document.body.classList.add('playing');
    $('lobbyView').hidden = true; $('play').hidden = false;
    $('resultOv').hidden = true; $('pauseOv').hidden = true;
    $('hudDiff').textContent = $('diffM').textContent = diff.toUpperCase();
    $('readyMeta').textContent = `RIRI · ${diff.toUpperCase()} · ${G.session?'공식 도전':'연습 모드'}`;
    $('readyHint').textContent = matchMedia('(pointer: coarse)').matches ? '레인을 터치해서 입력해요' : 'F G H J 로 입력해요';
    $('readyOv').hidden = false;
    hud();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }

  // 음원 시계 하나로 노트·판정·화면을 맞춤
  function songTime() {
    const lat = (actx.outputLatency || 0) + (actx.baseLatency || 0) * 0;
    return actx.currentTime - G.startAt - lat - syncMs / 1000;
  }

  function feedback() {
    for(const e of G.judgements.splice(0)){
      if(e.j!=='miss'&&e.j!=='bad')G.fx[e.lane]={t:e.t,j:e.j};
      G.judgeText={j:e.j,t:e.t};
    }
    hud();
    if(G.over&&!G.ended)finish('gameover');
  }
  function timedInput(lane,down,t=songTime()) {
    if(!G||G.paused||G.ended||t<0)return;
    const ms=Math.max(Math.round(t*1000),Math.round(G.clock*1000));
    G.events.push([ms,lane,Number(down)]);
    inputRhythm(G,lane,down,ms/1000);
    if(down){G.beam[lane]=ms/1000;const held=G.notes.find(n=>n.holding&&n.lane===lane);if(held)G.fx[lane]={t:ms/1000,j:held.judge};}
    feedback();
  }
  function press(lane){timedInput(lane,true);}
  function release(lane,t=songTime()){timedInput(lane,false,t);}
  function update() {
    const t=songTime();if(t<0)return;
    advanceRhythm(G,Math.max(G.clock,Math.round(t*1000)/1000));feedback();
    if(!G.ended&&t>G.lastT+1.2&&G.notes.every(n=>n.done))finish();
  }

  function hud() {
    if (!G) return;
    const s = computeScore(G.counts, G.maxCombo, G.total, G.diff).total;
    $('scorePc').textContent = $('scoreM').textContent = fmt(s);
    $('comboPc').firstChild.textContent = $('comboM').firstChild.textContent = G.combo;
    for (const id of ['lifePc', 'lifeM']) {
      const el = $(id); el.style.width = G.life + '%'; el.parentElement.classList.toggle('low', G.life <= 30);
    }
  }

  // ───────── 화면 ─────────
  const cv = $('cv'), ctx = cv.getContext('2d');
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!G) return;
    const r = sizeCanvas(cv, ctx);
    const mobile = r.width <= 720;
    const v = makeView(r.width, r.height, mobile);
    const t = songTime();
    if (!G.paused && !G.ended) update();
    // 준비 카운트다운
    if (!$('readyOv').hidden) {
      if (t >= -.45) $('readyOv').hidden = true;
      else $('countTxt').textContent = Math.ceil(-t - .45) || 'GO';
    }
    G.analyser.getByteFrequencyData(G.eq);
    drawStage(ctx, v, t, G.notes, G.look, G.fx, pressed, { eq: G.eq, labels: mobile ? null : KEY_LABEL, beam: G.beam });
    // 판정 문구
    if (G.judgeText && t - G.judgeText.t < .45) {
      const k = 1 - (t - G.judgeText.t) / .45, j = G.judgeText.j;
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.6);
      const size = Math.round(Math.min(v.span * .11, 64) * (1 + (1 - k) * .08));
      ctx.font = `italic 900 ${size}px "Exo 2", sans-serif`; ctx.textAlign = 'center';
      const y = v.judgeY - v.span * .2;
      const g = ctx.createLinearGradient(0, y - size, 0, y);
      const cols = { perfect: ['#ffd1ec', '#ff5fae'], great: ['#d6f6ff', '#3cd8ff'], good: ['#fff2c7', '#ffd36b'], bad: ['#e7d3ff', '#b46bff'], miss: ['#b9bbd6', '#6b6f99'] }[j];
      g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
      ctx.shadowColor = cols[1]; ctx.shadowBlur = 20; ctx.fillStyle = g;
      ctx.fillText(j.toUpperCase(), v.cx, y);
      if (G.combo > 1 && j !== 'miss' && j !== 'bad') { ctx.shadowBlur = 0; ctx.font = `italic 800 ${Math.round(size * .55)}px "Exo 2", sans-serif`; ctx.fillStyle = 'rgba(238,241,255,.9)'; ctx.fillText(`${G.combo} COMBO`, v.cx, y + size * .7); }
      ctx.restore();
    }
    // 진행
    const p = Math.max(0, Math.min(1, t / CHART.duration));
    $('progPc').style.width = $('progM').style.width = p * 100 + '%';
    $('timeTxt').textContent = `${mmss(t)} / ${mmss(CHART.duration)}`;
  }

  function pause() {
    if (!G || G.paused || G.ended) return;
    G.paused = true; pressed.fill(false); pointerLane.clear(); actx.suspend();

    $('pauseMeta').textContent = 'RIRI · ' + G.diff.toUpperCase() + (G.session?' · 공식 도전':' · 연습 모드');
    $('pauseNote').textContent = '계속하기를 누르면 같은 지점에서 이어져요.';
    $('pauseOv').hidden = false;
  }
  async function resume() {
    if (!G || !G.paused) return;
    $('pauseOv').hidden = true;
    await actx.resume(); G.paused = false;
    // 일시정지 중에 손을 뗀 롱노트는 재개 시점에 정리
    for (let i = 0; i < 4; i++) if (!pressed[i]) release(i);
  }
  function finish(reason) {
    if (!G || G.ended) return;
    const finishAt=Math.max(0,Math.round(Math.max(songTime(),G.clock)*1000));
    G.ended = true; G.endReason = reason || 'clear';
    // 그만하기·게임 오버: 남은 노트는 MISS
    if (reason) completeRhythm(G);
    try { G.src.stop(); } catch {}
    if (actx.state === 'suspended') actx.resume();
    const res = computeScore(G.counts, G.maxCombo, G.total, G.diff);

    cancelAnimationFrame(raf);
    G.src.disconnect();
    G.analyser.disconnect();
    G.gain.disconnect();
    $('resEnd').hidden = G.endReason === 'clear';
    $('resEnd').textContent = G.endReason === 'gameover' ? '게임 오버 · 체력 소진' : '도중에 그만둠';
    $('rB').textContent = G.counts.bad;
    $('resKind').textContent=G.session?'공식 도전':'연습 · 주간 랭킹 미반영';
    $('resDiff').textContent = G.diff.toUpperCase();
    $('resScore').textContent = fmt(res.total);
    $('resCombo').textContent = G.maxCombo;
    $('resAcc').textContent = (res.acc * 100).toFixed(1) + '%';
    $('resBonus').textContent = '+' + fmt(res.bonus);
    $('rP').textContent = G.counts.perfect; $('rG').textContent = G.counts.great; $('rO').textContent = G.counts.good; $('rM').textContent = G.counts.miss;

    const previous = practiceBests.get(G.diff);
    const improved = !previous || res.total > previous.score;
    practiceBests.set(G.diff, {
      score: Math.max(res.total, previous?.score ?? 0),
      combo: Math.max(G.maxCombo, previous?.combo ?? 0)
    });
    $('resNotice').textContent = previous
      ? (improved ? '연습 최고 기록 갱신 · +' + fmt(res.total - previous.score) + '점' : '이번 접속 최고 기록 · ' + fmt(previous.score) + '점')
      : '이번 접속의 첫 연습 기록';

    $('pauseOv').hidden = true; $('readyOv').hidden = true; $('resultOv').hidden = false;
    $('officialAgainBtn').hidden=!G.session;$('officialAgainBtn').disabled=Boolean(G.session);
    $('retryReportBtn').hidden=true;
    if(G.session){pendingReport={id:G.session.id,events:G.events,finishAt,reason:G.endReason};savePending();void submitReport();}
  }
  function toLobby() {
    const wasPlaying = !$('play').hidden;
    cancelAnimationFrame(raf);
    if (G && !G.ended) { try { G.src.stop(); } catch {} if(G.session)void api('abandon',{id:G.session.id}).catch(()=>{}); }
    G = null;
    $('play').hidden = true; $('lobbyView').hidden = false; document.body.classList.remove('playing');
    updateLobby();void loadLobby();
    if (wasPlaying) requestAnimationFrame(previewLoop);
  }

  // ───────── 입력: 키보드 + 멀티터치 ─────────
  addEventListener('keydown', e => {
    if (!G || $('play').hidden) return;
    if (e.code in KEYS) { e.preventDefault(); if (e.repeat) return; const l = KEYS[e.code]; pressed[l] = true; press(l); }
    else if (e.code === 'Escape' || e.code === 'Space') { e.preventDefault(); if (!G.ended) (G.paused ? resume() : pause()); }
  });
  addEventListener('keyup', e => { if (e.code in KEYS && G) { const l = KEYS[e.code]; pressed[l] = false; if (!G.paused) release(l); } });
  function laneAt(x) {
    const r = cv.getBoundingClientRect(), mobile = r.width <= 720, v = makeView(r.width, r.height, mobile);
    const f = (x - r.left - (v.cx - v.span / 2)) / v.span;
    return Math.max(0, Math.min(3, Math.floor(f * 4)));
  }
  const playEl = $('play');
  playEl.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || !G || G.ended || G.paused) return;
    if (e.target.closest('.overlay') && !$('readyOv').contains(e.target)) return;
    e.preventDefault();
    const l = laneAt(e.clientX); pointerLane.set(e.pointerId, l); pressed[l] = true; press(l);
    try { playEl.setPointerCapture(e.pointerId); } catch {}
  });
  const up = e => {
    if (!pointerLane.has(e.pointerId)) return;
    const l = pointerLane.get(e.pointerId); pointerLane.delete(e.pointerId);
    if (![...pointerLane.values()].includes(l)) { pressed[l] = false; if (G && !G.paused) release(l); }
  };
  playEl.addEventListener('pointerup', up); playEl.addEventListener('pointercancel', up);
  addEventListener('blur', () => { if (G && !G.ended) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.ended) pause(); });

  $('pauseBtnPc').onclick = $('pauseBtnM').onclick = () => G && !G.ended && (G.paused ? resume() : pause());
  $('resumeBtn').onclick = resume;
  $('quitBtn').onclick = () => { G.paused = false; finish('quit'); };

  $('practiceBtn').onclick = $('practiceAgainBtn').onclick = ()=>startGame(false);
  $('officialBtn').onclick=$('officialAgainBtn').onclick=()=>{if(pendingReport)return;toLobby();void startGame(true);};
  $('retryReportBtn').onclick=()=>void submitReport();
  $('retryLobbyReportBtn').onclick=()=>void submitReport();
  $('lobbyBtn').onclick = toLobby;
  function previewLoop(ts) { if ($('play').hidden) { drawPreview(ts); requestAnimationFrame(previewLoop); } }
  async function api(action,body){
    const response=await fetch('/api/crew-rhythm/'+action,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
    const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'기록을 확인하지 못했어요.'),{status:response.status});return data;
  }
  async function loadLobby(){
    try{
      lobbyInfo=await api('lobby');
      if(!pendingReport){try{pendingReport=JSON.parse(sessionStorage.getItem('aifect.rhythm.pending:'+lobbyInfo.userId));if(pendingReport)void submitReport();}catch{}}
      $('officialBtn').disabled=Boolean(pendingReport)||!lobbyInfo.open||!lobbyInfo.remaining;
      $('retryLobbyReportBtn').hidden=!pendingReport;
      $('officialStatus').textContent=lobbyInfo.open?`오늘 남은 공식 도전 ${lobbyInfo.remaining} / 3회 · 금요일 22시 마감`:'이번 주 공식 도전이 마감됐어요.';
      $('teamScore').textContent=fmt(lobbyInfo.team)+'점';
      renderGameRankings($('rhythmRankings'),{crews:lobbyInfo.ranking,players:lobbyInfo.individualRanking,crewId:lobbyInfo.crew});
      updateLobby();
    }catch(e){$('officialBtn').disabled=true;$('officialStatus').textContent=e.message;}
  }
  async function submitReport(){
    if(!pendingReport)return;
    const report=pendingReport;$('resNotice').textContent='서버에서 기록을 확인하고 있어요…';$('retryReportBtn').hidden=true;
    try{
      const result=await api('finish',report);
      if(pendingReport!==report)return;
      pendingReport=null;savePending();
      if(G?.session?.id===report.id){$('resScore').textContent=fmt(result.score);$('resNotice').textContent='공식 '+fmt(result.score)+'점 · 서버 랭킹에 저장했어요.';}
      await loadLobby();$('officialAgainBtn').disabled=!lobbyInfo?.open||!lobbyInfo.remaining;
    }catch(e){
      $('resNotice').textContent='기록 전송 대기 · '+e.message;$('retryReportBtn').hidden=false;$('retryLobbyReportBtn').hidden=false;
      if([400,404,409].includes(e.status)){pendingReport=null;savePending();$('resNotice').textContent='기록이 승인되지 않았어요 · '+e.message;void loadLobby();}
    }
  }
  function savePending(){try{const key='aifect.rhythm.pending:'+lobbyInfo.userId;if(pendingReport)sessionStorage.setItem(key,JSON.stringify(pendingReport));else sessionStorage.removeItem(key);}catch{}}
  addEventListener('pagehide',()=>{if(G?.session&&!G.ended)void fetch('/api/crew-rhythm/abandon',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:G.session.id}),keepalive:true}).catch(()=>{});});
  const lobbyReady=loadLobby();
  updateLobby(); requestAnimationFrame(previewLoop);
})();
