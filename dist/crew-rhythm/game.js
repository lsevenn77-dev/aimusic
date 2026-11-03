(() => {
  // ───────── 설정: 점수 규칙·판정 (서버도 같은 값으로 검증) ─────────
  const RULES = {
    base: { normal: 500000, hard: 1000000, hell: 2000000 },
    weight: { perfect: 1, great: .8, good: .5, bad: 0, miss: 0 },
    window: { perfect: .045, great: .090, good: .135, bad: .180 },   // ±초. bad 범위 밖으로 지나가면 MISS
    // 체력: 0이 되면 즉시 게임 오버. BAD·MISS는 콤보도 끊김
    life: { start: 100, perfect: 1, great: .5, good: 0, bad: -6, miss: -10 },
    comboBonus: .10,            // 기본점 × 10% × (최대 콤보 / 전체 노트)
    longReleaseGrace: .12,      // 롱노트 끝 이 시간 전부터 떼도 성공
    leadIn: 2.2,                // 시작 전 노트가 내려오는 준비 시간
    lookahead: { normal: 1.55, hard: 1.2, hell: .95 },  // 노트가 화면에 보이는 시간
  };
  const LANE_COLORS = ['#3ef2c2', '#ff5fae', '#b46bff', '#3cd8ff'];   // 민트 / 핑크 / 퍼플 / 시안
  const KEYS = { KeyF: 0, KeyG: 1, KeyH: 2, KeyJ: 3 };
  const KEY_LABEL = ['F', 'G', 'H', 'J'];
  const $ = id => document.getElementById(id);
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  const mmss = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

  // 점수 계산: 판정 가중치 합 기준 기본 점수 + 최대 콤보 비례 보너스
  function computeScore(counts, maxCombo, total, diff) {
    const base = RULES.base[diff], w = RULES.weight;
    const acc = (counts.perfect * w.perfect + counts.great * w.great + counts.good * w.good + (counts.bad || 0) * w.bad + counts.miss * w.miss) / total;
    const main = Math.round(base * acc);
    const bonus = Math.round(base * RULES.comboBonus * maxCombo / total);
    return { main, bonus, total: main + bonus, acc };
  }
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
    const span = mobile ? w * .96 : Math.min(w * .82, h * 1.65);
    return { w, h, cx: w / 2, judgeY, horizon, span };
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
    // 판정선
    c.save(); c.shadowColor = '#d9c9ff'; c.shadowBlur = 16; c.strokeStyle = 'rgba(235,228,255,.85)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(projX(v, -.02, 0), v.judgeY); c.lineTo(projX(v, 1.02, 0), v.judgeY); c.stroke(); c.restore();

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

    // 입력 링 + 타격광
    for (let i = 0; i < 4; i++) drawRing(c, v, i, pressed && pressed[i], fx, now, opts.labels);
  }

  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  function rr(c, x, y, w, h, r) { r = Math.min(r, h / 2, w / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // 입체 캡슐 노트: 아래 두께 → 몸통 → 위 반사광
  function drawNote(c, v, lane, d, sizeMul) {
    const s = sc(d), inset = .09 / 4;   // 레인 폭의 9%씩 안쪽
    const xl = projX(v, lane / 4 + inset, d), xr = projX(v, (lane + 1) / 4 - inset, d);
    const y = projY(v, d), hgt = Math.max(4, v.span * .034 * s * sizeMul), w = xr - xl;
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

  // 입력 링: 어두운 중심 + 이중 발광 테두리, 성공한 레인만 타격광
  function drawRing(c, v, i, isDown, fx, now, labels) {
    const x = projX(v, (i + .5) / 4, 0), y = v.judgeY, rx = v.span / 4 * .36, ry = rx * .45;
    const col = LANE_COLORS[i];
    const hit = fx && fx[i] && now - fx[i].t < .22 ? fx[i] : null;
    const k = hit ? 1 - (now - hit.t) / .22 : 0;
    const pulse = 1 + (isDown ? .06 : 0) + k * .12;
    c.save();
    if (hit) {   // 타격광: 짧은 방사형 + 빛줄기
      const R = rx * (1.6 + (1 - k) * .6);
      const rg = c.createRadialGradient(x, y, 0, x, y, R);
      rg.addColorStop(0, hexA('#ffffff', .85 * k)); rg.addColorStop(.3, hexA(col, .7 * k)); rg.addColorStop(1, hexA(col, 0));
      c.fillStyle = rg; c.beginPath(); c.ellipse(x, y, R, R * .75, 0, 0, 7); c.fill();
      c.strokeStyle = hexA(col, .9 * k); c.lineWidth = 2;
      for (let a = 0; a < 9; a++) { const ang = Math.PI + (a / 8) * Math.PI, L = rx * (1.2 + (a % 3) * .35) * (1.2 - k * .4); c.beginPath(); c.moveTo(x + Math.cos(ang) * rx * .5, y + Math.sin(ang) * ry); c.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L * .9); c.stroke(); }
    }
    c.fillStyle = isDown ? hexA(col, .22) : 'rgba(4,6,18,.9)';
    c.beginPath(); c.ellipse(x, y, rx * pulse, ry * pulse, 0, 0, 7); c.fill();
    c.shadowColor = col; c.shadowBlur = 20 + k * 20;
    c.strokeStyle = col; c.lineWidth = Math.max(3, rx * .1);
    c.beginPath(); c.ellipse(x, y, rx * pulse, ry * pulse, 0, 0, 7); c.stroke();
    c.shadowBlur = 6; c.strokeStyle = hexA('#ffffff', .7); c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(x, y, rx * pulse * .8, ry * pulse * .8, 0, 0, 7); c.stroke();
    c.restore();
    if (labels) {
      c.save(); c.font = `italic 800 ${Math.round(rx * .42)}px "Exo 2", sans-serif`; c.textAlign = 'center'; c.fillStyle = 'rgba(238,241,255,.9)';
      c.fillText(labels[i], x, y + ry + rx * .55); c.restore();
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
  const CHART = {"bpm":136.69,"firstBeat":0.4357,"duration":60.0,"version":"double-tap-preview-v1","charts":{"normal":[[0.4357,3,0.0],[0.8747,3,0.0],[1.3136,1,0.0],[2.1915,0,0.659],[3.0695,0,0.0],[3.5084,1,0.0],[4.8253,0,0.0],[5.2643,0,0.0],[5.7033,1,0.0],[6.5812,0,0.0],[7.0202,0,0.0],[7.8981,3,0.0],[8.3371,2,0.0],[14.4826,3,0.0],[14.9215,1,0.0],[15.3605,1,0.0],[16.2384,2,0.0],[16.6774,0,0.0],[17.1163,2,0.0],[17.9943,2,0.0],[18.4332,0,0.0],[18.8722,2,0.0],[19.3112,1,0.0],[19.7501,3,0.0],[20.1891,0,0.0],[20.6281,3,0.0],[21.067,1,0.0],[21.506,2,0.0],[21.945,0,0.0],[22.3839,2,0.0],[23.2619,2,0.0],[23.7008,0,0.0],[24.1398,3,0.0],[24.5787,0,0.0],[25.0177,2,0.0],[25.4567,0,0.0],[25.8956,1,0.0],[26.3346,0,0.0],[26.7736,2,0.0],[27.2125,0,0.0],[27.6515,2,0.0],[28.0905,0,0.0],[28.5294,2,0.0],[28.9684,1,0.0],[29.4074,2,0.0],[30.2853,2,0.0],[30.7243,3,0.0],[31.6022,1,0.0],[32.0411,2,0.0],[32.4801,1,0.0],[32.9191,2,0.0],[33.358,0,0.0],[34.236,0,0.658],[35.1139,1,0.0],[35.5529,3,0.658],[36.4308,2,0.0],[37.3087,2,0.0],[37.7477,0,0.0],[38.1867,2,0.0],[38.6256,1,0.0],[39.0646,0,0.0],[39.5035,1,0.0],[39.9425,2,0.0],[40.3815,0,0.658],[41.2594,0,0.0],[41.6984,3,0.0],[42.1373,0,0.0],[42.5763,3,0.0],[43.0153,0,1.756],[45.2101,3,0.0],[45.6491,0,0.0],[46.088,2,0.0],[46.9659,2,0.0],[47.8439,3,0.658],[48.7218,2,0.0],[50.4777,2,1.756],[54.8673,3,0.0],[55.3063,0,0.0],[55.7452,3,1.097],[57.0621,0,0.0],[57.5011,2,0.658],[58.379,3,0.0],[58.818,0,0.0],[59.257,2,0.524]],"hard":[[0.4357,1,0.0],[0.4357,3,0.0],[0.8747,3,0.0],[1.3136,1,0.0],[1.7526,0,0.0],[1.9721,0,0.0],[2.1915,1,0.0],[2.1915,3,0.0],[2.411,0,0.0],[2.6305,0,0.0],[2.85,1,0.0],[3.0695,0,0.0],[3.289,0,0.0],[3.5084,1,0.0],[3.9474,1,0.0],[4.8253,0,0.0],[5.0448,0,0.0],[5.2643,1,0.0],[5.4838,0,0.0],[5.7033,0,0.0],[5.7033,2,0.0],[5.9227,1,0.0],[6.1422,0,0.0],[6.3617,0,0.0],[6.5812,1,0.0],[6.8007,0,0.0],[7.0202,0,0.0],[7.8981,3,0.0],[8.3371,2,0.0],[8.9955,2,0.0],[9.215,1,0.0],[9.4345,2,0.0],[9.6539,2,0.0],[9.8734,3,0.0],[10.0929,1,0.0],[11.8488,2,0.0],[14.4826,1,0.0],[14.4826,3,0.0],[14.9215,1,0.0],[15.141,1,0.0],[15.3605,2,0.0],[16.0189,3,0.0],[16.2384,2,0.0],[16.4579,1,0.0],[16.6774,0,0.0],[16.8969,3,0.0],[17.1163,2,0.0],[17.3358,2,0.0],[17.5553,0,0.0],[17.7748,1,0.0],[17.9943,0,0.0],[17.9943,2,0.0],[18.2138,3,0.0],[18.4332,0,0.0],[18.8722,2,0.0],[19.3112,1,0.0],[19.5307,2,0.0],[19.7501,3,0.0],[19.9696,1,0.0],[20.1891,0,0.0],[20.4086,3,0.0],[20.6281,3,0.0],[20.8475,2,0.0],[21.067,1,0.0],[21.2865,2,0.0],[21.506,2,0.0],[21.7255,1,0.0],[21.945,0,0.0],[22.1644,1,0.0],[22.3839,0,0.0],[22.3839,2,0.0],[22.8229,0,0.0],[23.2619,2,0.0],[23.7008,0,0.0],[23.9203,2,0.0],[24.1398,3,0.0],[24.3593,3,0.0],[24.5787,0,0.0],[24.7982,3,0.0],[25.0177,2,0.0],[25.2372,2,0.0],[25.4567,0,0.0],[25.6762,2,0.0],[25.8956,1,0.0],[26.1151,2,0.0],[26.3346,0,0.0],[26.7736,2,0.0],[27.2125,0,0.0],[27.432,3,0.0],[27.6515,2,0.0],[27.871,2,0.0],[28.0905,0,0.0],[28.3099,1,0.0],[28.5294,2,0.0],[28.7489,1,0.0],[28.9684,1,0.0],[29.4074,2,0.0],[29.6268,3,0.0],[30.2853,2,0.0],[30.7243,2,0.0],[30.9437,3,0.0],[31.1632,2,0.0],[31.3827,3,0.0],[31.6022,1,0.0],[32.0411,2,0.0],[32.2606,3,0.0],[32.4801,1,0.0],[32.9191,2,0.0],[33.358,0,0.0],[33.797,2,0.0],[34.236,0,0.0],[34.6749,2,0.0],[35.1139,0,0.0],[35.5529,3,0.0],[35.7723,1,0.0],[35.9918,0,0.0],[36.4308,2,0.0],[36.6503,3,0.0],[37.3087,0,0.0],[37.3087,2,0.0],[37.7477,0,0.0],[38.1867,0,0.0],[38.1867,2,0.0],[38.6256,1,0.0],[39.0646,0,0.0],[39.0646,2,0.0],[39.5035,1,0.0],[39.9425,2,0.0],[40.162,1,0.0],[40.3815,0,0.0],[40.8204,3,0.0],[41.0399,2,0.0],[41.2594,0,0.0],[41.6984,3,0.0],[42.1373,0,0.0],[42.3568,3,0.0],[42.5763,3,0.0],[42.7958,2,0.0],[43.0153,0,0.0],[43.2347,1,0.0],[43.4542,2,0.878],[44.5516,3,0.0],[44.9906,3,0.0],[45.2101,2,0.0],[45.6491,0,0.0],[45.8685,2,0.0],[46.088,2,0.0],[46.3075,3,0.0],[46.527,0,0.0],[46.7465,2,0.0],[46.9659,2,0.0],[47.8439,3,0.0],[48.0634,3,0.0],[48.2828,0,0.0],[48.5023,3,0.0],[48.7218,2,0.0],[49.1608,0,0.0],[49.3803,2,0.0],[49.5997,3,0.0],[49.8192,3,0.0],[50.0387,1,0.0],[50.2582,3,0.0],[50.4777,2,0.0],[50.9166,0,0.0],[51.1361,3,0.0],[51.3556,3,0.0],[51.7946,1,0.0],[52.2335,3,1.756],[54.4284,1,0.0],[54.8673,3,0.0],[55.0868,2,0.0],[55.3063,0,0.0],[55.7452,3,0.0],[55.9647,2,0.0],[56.4037,0,0.0],[56.6232,3,0.0],[56.8427,1,0.0],[57.0621,0,0.0],[57.2816,1,0.0],[57.5011,2,0.0],[57.7206,1,0.0],[57.9401,1,0.0],[58.379,3,0.0],[58.5985,3,0.0],[58.818,0,0.0],[59.257,2,0.0],[59.4764,3,0.0]],"hell":[[0.4357,1,0.0],[0.4357,3,0.0],[0.8747,3,0.0],[1.3136,1,0.0],[1.3136,3,0.0],[1.7526,0,0.0],[1.8623,0,0.0],[1.9721,1,0.0],[2.1915,0,0.0],[2.1915,2,0.0],[2.411,0,0.0],[2.5208,1,0.0],[2.6305,0,0.0],[2.85,0,0.0],[3.0695,1,0.0],[3.0695,3,0.0],[3.1792,0,0.0],[3.289,0,0.0],[3.5084,1,0.0],[3.6182,0,0.0],[3.9474,1,0.0],[4.4961,3,0.0],[4.8253,0,0.0],[5.0448,0,0.0],[5.2643,1,0.0],[5.4838,0,0.0],[5.5935,0,0.0],[5.7033,1,0.0],[5.7033,3,0.0],[5.9227,0,0.0],[6.0325,0,0.0],[6.1422,1,0.0],[6.3617,0,0.0],[6.5812,0,0.0],[6.5812,2,0.0],[6.6909,1,0.0],[6.8007,0,0.0],[7.0202,0,0.0],[7.8981,3,0.0],[8.2273,3,0.0],[8.3371,2,0.0],[8.5565,2,0.0],[8.776,3,0.0],[8.8858,1,0.0],[8.9955,2,0.0],[9.215,1,0.0],[9.4345,2,0.0],[9.6539,2,0.0],[9.8734,3,0.0],[10.0929,1,0.0],[10.2027,1,0.0],[10.3124,2,0.0],[10.5319,1,0.0],[11.4098,2,0.0],[11.8488,2,0.0],[12.2877,3,0.0],[12.3975,2,0.0],[12.5072,3,0.0],[12.7267,3,0.0],[12.8364,2,0.0],[12.9462,3,0.0],[13.0559,3,0.0],[13.2754,2,0.0],[13.3851,3,0.0],[13.6046,3,0.0],[13.7144,2,0.0],[14.1533,2,0.0],[14.4826,1,0.0],[14.4826,3,0.0],[14.9215,1,0.0],[15.0313,1,0.0],[15.141,2,0.0],[15.3605,1,0.0],[15.3605,3,0.0],[15.7995,0,0.0],[16.0189,3,0.0],[16.2384,0,0.0],[16.2384,2,0.0],[16.4579,1,0.0],[16.6774,0,0.0],[16.7871,2,0.0],[16.8969,3,0.0],[17.1163,2,0.0],[17.3358,2,0.0],[17.5553,0,0.0],[17.6651,0,0.0],[17.7748,1,0.0],[17.8845,1,0.0],[17.9943,0,0.0],[17.9943,2,0.0],[18.104,2,0.0],[18.2138,3,0.0],[18.4332,0,0.0],[18.543,1,0.0],[18.6527,2,0.0],[18.7625,2,0.0],[18.8722,3,0.0],[19.0917,2,0.0],[19.3112,1,0.0],[19.5307,2,0.0],[19.7501,1,0.0],[19.7501,3,0.0],[19.8599,0,0.0],[19.9696,1,0.0],[20.0794,0,0.0],[20.1891,0,0.0],[20.4086,3,0.0],[20.5183,3,0.0],[20.6281,2,0.0],[20.7378,3,0.0],[20.8475,3,0.0],[21.067,1,0.0],[21.1768,3,0.0],[21.2865,2,0.0],[21.506,0,0.0],[21.506,2,0.0],[21.6157,3,0.0],[21.7255,1,0.0],[21.945,0,0.0],[22.0547,0,0.0],[22.1644,1,0.0],[22.3839,0,0.0],[22.3839,2,0.0],[22.6034,1,0.0],[22.8229,0,0.0],[23.0424,1,0.0],[23.1521,0,0.0],[23.2619,2,0.0],[23.4813,1,0.0],[23.5911,3,0.0],[23.7008,0,0.0],[23.9203,2,0.0],[24.1398,1,0.0],[24.1398,3,0.0],[24.2495,2,0.0],[24.3593,3,0.0],[24.5787,0,0.0],[24.6885,0,0.0],[24.7982,3,0.0],[24.908,1,0.0],[25.0177,0,0.0],[25.0177,2,0.0],[25.1275,3,0.0],[25.2372,2,0.0],[25.3469,1,0.0],[25.4567,0,0.0],[25.6762,2,0.0],[25.8956,1,0.0],[25.8956,3,0.0],[26.0054,1,0.0],[26.1151,2,0.0],[26.3346,0,0.0],[26.4443,0,0.0],[26.5541,1,0.0],[26.6638,0,0.0],[26.7736,2,0.0],[26.9931,1,0.0],[27.2125,0,0.0],[27.432,3,0.0],[27.6515,0,0.0],[27.6515,2,0.0],[27.871,2,0.0],[28.0905,0,0.0],[28.2002,0,0.0],[28.3099,1,0.0],[28.4197,1,0.0],[28.5294,0,0.0],[28.5294,2,0.0],[28.7489,1,0.0],[28.8587,1,0.0],[28.9684,2,0.0],[29.0781,0,0.0],[29.1879,3,0.0],[29.2976,3,0.0],[29.4074,2,0.0],[29.6268,3,0.0],[29.9561,2,0.0],[30.1755,0,0.0],[30.2853,2,0.0],[30.395,2,0.0],[30.7243,3,0.0],[30.834,0,0.0],[30.9437,3,0.0],[31.1632,2,0.0],[31.3827,3,0.0],[31.6022,1,0.0],[31.9314,1,0.0],[32.0411,0,0.0],[32.0411,2,0.0],[32.2606,3,0.0],[32.4801,1,0.0],[32.5899,3,0.0],[32.6996,3,0.0],[32.9191,2,0.0],[33.1386,3,0.0],[33.358,0,0.0],[33.4678,1,0.0],[33.6873,3,0.0],[33.797,2,0.0],[33.9067,3,0.0],[34.0165,3,0.0],[34.236,0,0.0],[34.3457,1,0.0],[34.6749,2,0.0],[34.7847,3,0.0],[34.8944,3,0.0],[35.1139,0,0.0],[35.4431,1,0.0],[35.5529,3,0.0],[35.7723,1,0.0],[35.9918,0,0.0],[36.2113,3,0.0],[36.4308,2,0.0],[36.5405,3,0.0],[36.6503,3,0.0],[36.76,2,0.0],[36.8698,0,0.0],[36.9795,1,0.0],[37.3087,0,0.0],[37.3087,2,0.0],[37.4185,0,0.0],[37.6379,3,0.0],[37.7477,0,0.0],[37.8574,1,0.0],[38.1867,0,0.0],[38.1867,2,0.0],[38.2964,1,0.0],[38.6256,1,0.0],[38.7354,2,0.0],[39.0646,0,0.0],[39.0646,2,0.0],[39.1743,1,0.0],[39.5035,1,0.0],[39.723,0,0.0],[39.9425,2,0.0],[40.0523,1,0.0],[40.162,1,0.0],[40.2717,2,0.0],[40.3815,0,0.0],[40.601,2,0.0],[40.8204,3,0.0],[41.0399,2,0.0],[41.2594,0,0.0],[41.6984,3,0.0],[41.9179,1,0.0],[42.1373,0,0.0],[42.2471,1,0.0],[42.3568,3,0.0],[42.5763,3,0.0],[42.686,1,0.0],[42.7958,3,0.0],[43.0153,0,0.0],[43.2347,1,0.0],[43.4542,2,0.0],[43.6737,1,0.0],[43.8932,1,0.0],[44.0029,2,0.0],[44.1127,1,0.0],[44.3322,2,0.0],[44.5516,3,0.0],[44.8809,1,0.0],[44.9906,3,0.0],[45.2101,3,0.0],[45.3198,2,0.0],[45.4296,3,0.0],[45.6491,0,0.0],[45.7588,0,0.0],[45.8685,2,0.0],[46.088,2,0.0],[46.1978,3,0.0],[46.3075,2,0.0],[46.527,0,0.0],[46.6367,2,0.0],[46.7465,2,0.0],[46.9659,1,0.0],[46.9659,3,0.0],[47.0757,1,0.0],[47.1854,2,0.0],[47.4049,0,0.0],[47.6244,2,0.0],[47.8439,3,0.0],[48.0634,3,0.0],[48.2828,0,0.0],[48.5023,3,0.0],[48.7218,0,0.0],[48.7218,2,0.0],[48.9413,3,0.0],[49.1608,0,0.0],[49.3803,2,0.0],[49.5997,3,0.0],[49.8192,3,0.0],[50.0387,1,0.0],[50.1484,2,0.0],[50.2582,3,0.0],[50.4777,2,0.0],[50.6971,3,0.0],[50.9166,0,0.0],[51.1361,3,0.0],[51.3556,3,0.0],[51.5751,2,0.0],[51.7946,1,0.0],[52.2335,3,0.439],[52.892,2,0.0],[53.0017,2,0.0],[53.1115,3,0.0],[53.5504,1,0.0],[54.4284,1,0.0],[54.6478,2,0.0],[54.7576,0,0.0],[54.8673,3,0.0],[55.0868,2,0.0],[55.3063,0,0.0],[55.416,0,0.0],[55.5258,2,0.0],[55.7452,3,0.0],[55.9647,2,0.0],[56.1842,0,0.0],[56.4037,0,0.0],[56.5134,3,0.0],[56.6232,3,0.0],[56.8427,1,0.0],[56.9524,1,0.0],[57.0621,0,0.0],[57.1719,0,0.0],[57.2816,1,0.0],[57.5011,2,0.0],[57.7206,1,0.0],[57.9401,1,0.0],[58.1596,3,0.0],[58.2693,0,0.0],[58.379,3,0.0],[58.5985,3,0.0],[58.818,0,0.0],[58.9277,1,0.0],[59.0375,3,0.0],[59.257,2,0.0],[59.4764,3,0.0]]}};

  const crew = new URLSearchParams(location.search).get('crew');
  if (crew && /^(preview|[a-zA-Z0-9_-]{1,80})$/.test(crew)) {
    $('backLink').href = '/#crew-jump/' + encodeURIComponent(crew);
  }
  function notesFor(d) {
    // 롱노트 구간과 겹치는 같은 레인 노트는 제거 (채보 버전 고정 후 서버도 같은 규칙)
    const raw = CHART.charts[d].map(([t, lane, len]) => ({ t, lane, len }));
    const longs = raw.filter(n => n.len > 0);
    return raw.filter(n => !longs.some(L => L !== n && L.lane === n.lane && n.t > L.t - .001 && n.t <= L.t + L.len + .06))
      .map((n, i) => ({ ...n, id: i, done: false, holding: false, judge: null }));
  }

  // ───────── 대기실 ─────────
  const practiceBests = new Map();
  function updateLobby() {
    const best = practiceBests.get(diff);
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
    const r = pcv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (pcv.width !== Math.round(r.width * dpr)) { pcv.width = Math.round(r.width * dpr); pcv.height = Math.round(r.height * dpr); }
    if (!previewNotes) previewNotes = notesFor(diff);
    const now = 14 + (ts / 1000) % 16;
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = makeView(r.width, r.height, r.width <= 720);
    const fx = [];
    for (const n of previewNotes) if (!n.len && n.t <= now && n.t > now - .2) fx[n.lane] = { t: n.t };
    drawStage(pctx, v, now, previewNotes.filter(n => n.t + (n.len || 0) > now - .1), RULES.lookahead[diff], fx, null, {});
  }

  // ───────── 게임 상태 ─────────
  let G = null, raf = 0;
  const pressed = [false, false, false, false];
  const pointerLane = new Map();


  let starting = false;
  async function startGame() {
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
      beginRun();
      $('startReason').hidden = true;
    } catch (error) {
      toLobby();
      $('startReason').textContent = '음원을 열지 못했어요. 연결을 확인한 뒤 다시 시작해 주세요.';
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
      gain, diff, notes, total: notes.length, look: RULES.lookahead[diff],
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
    $('readyMeta').textContent = `RIRI · ${diff.toUpperCase()} · 연습 모드`;
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

  function judgeOf(dt) {
    const a = Math.abs(dt), W = RULES.window;
    return a <= W.perfect ? 'perfect' : a <= W.great ? 'great' : a <= W.good ? 'good' : a <= W.bad ? 'bad' : null;
  }
  function addLife(dv) {
    G.life = Math.max(0, Math.min(RULES.life.start, G.life + dv));
    if (G.life <= 0 && !G.ended) finish('gameover');
  }
  function register(j, lane) {
    G.counts[j]++;
    if (j === 'miss' || j === 'bad') G.combo = 0;
    else { G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.fx[lane] = { t: songTime(), j }; }   // 타격광은 성공한 레인만
    G.judgeText = { j, t: songTime() };
    addLife(RULES.life[j]);
    hud();
  }
  function press(lane) {
    if (!G || G.paused || G.ended || songTime() < 0) return;
    const t = songTime();
    G.beam[lane] = t;
    let best = null;
    for (const n of G.notes) {
      if (n.done || n.holding || n.lane !== lane) continue;
      const dt = t - n.t;
      if (dt < -RULES.window.bad) break;   // 노트는 시간순, 아직 먼 노트
      if (Math.abs(dt) <= RULES.window.bad) { best = n; break; }
    }
    if (!best) return;
    const j = judgeOf(t - best.t);
    if (best.len && j !== 'bad') {
      best.holding = true;
      best.judge = j;
      G.fx[lane] = { t, j };
    } else {
      best.done = true;
      register(j, lane);
    }
  }
  function release(lane, t = songTime()) {
    if (!G) return;
    for (const n of G.notes) {
      if (n.holding && n.lane === lane) {
        n.holding = false; n.done = true;
        // 롱노트는 한 번만 집계: 끝까지 유지하면 머리 판정, 일찍 떼면 MISS
        register(t >= n.t + n.len - RULES.longReleaseGrace ? n.judge : 'miss', lane);
      }
    }
  }

  function update() {
    const t = songTime();
    for (const n of G.notes) {
      if (n.done) continue;
      if (n.holding) { if (t >= n.t + n.len) { n.holding = false; n.done = true; register(n.judge, n.lane); } continue; }
      if (t - n.t > RULES.window.bad) { n.done = true; register('miss', n.lane); if (G.ended) return; }
      else if (n.t - t > 2) break;
    }
    if (!G.ended && t > G.lastT + 1.2 && G.notes.every(n => n.done)) finish();
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
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    $('pauseMeta').textContent = 'RIRI · ' + G.diff.toUpperCase() + ' · 연습 모드';
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
    G.ended = true; G.endReason = reason || 'clear';
    // 그만하기·게임 오버: 남은 노트는 MISS
    if (reason) { for (const n of G.notes) if (!n.done) { n.done = true; n.holding = false; G.counts.miss++; } G.combo = 0; }
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
  }
  function toLobby() {
    const wasPlaying = !$('play').hidden;
    cancelAnimationFrame(raf);
    if (G && !G.ended) { try { G.src.stop(); } catch {} }
    G = null;
    $('play').hidden = true; $('lobbyView').hidden = false; document.body.classList.remove('playing');
    updateLobby();
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

  $('practiceBtn').onclick = $('practiceAgainBtn').onclick = startGame;
  $('lobbyBtn').onclick = toLobby;
  function previewLoop(ts) { if ($('play').hidden) { drawPreview(ts); requestAnimationFrame(previewLoop); } }
  updateLobby(); requestAnimationFrame(previewLoop);
})();
