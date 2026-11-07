  const RULES = {
    limit: 60,               // 제한 시간
    finishBase: 400000,      // 완주 기본 점수
    perSecond: 10000,        // 60초에서 단축한 1초당
    dnfMax: 390000,          // 미완주 최대 (진행도 비례) → 완주자가 항상 위

  };
  // Handling is shared; the equipped vehicle raises only the straight-line speed cap.
  const CAR = {
    maxSpeed: 11000, accel: 5200, boostMul: 1.32, boostTime: 1.6, boostCost: 50, boostKick: 1400,
    // 원심력: 급커브(6)는 드리프트하거나 속도가 줄어야 버팀, 중간 커브(4)는 일반 조향으로 버팀
    centrifugal: .32, steer: 1.0, scrub: .42,              // scrub: 코너에서 버티며 잃는 속도
    wallSlow: .6, driftHold: .22, driftMin: .45, driftExitPerfect: .35, driftFailAfter: .6,
    driftSteer: .9, driftCentrifugal: .5, driftScrub: .35, driftCharge: 30, driftMaxGain: 60,
    insideBonus: .12,                                       // 코너 안쪽 주행 시 진행 거리 이득
    wallCooldown: .5,                                       // 연속 충돌로 속도가 계속 깎이지 않게
  };
  function computeScore(finished, time, progress) {
    if (finished) return RULES.finishBase + Math.round((RULES.limit - Math.round(time * 100) / 100) * RULES.perSecond);
    return Math.floor(RULES.dnfMax * Math.max(0, Math.min(.999, progress)));
  }

  // ───────── 코스 (모든 사용자에게 같은 주간 코스) ─────────
  const SEG = 200, ROAD_W = 2000, RUMBLE = 3, DRAW = 260, FOV = 100, CAM_H = 1000;
  const CAM_DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180), PLAYER_Z = CAM_H * CAM_DEPTH;
  const C = { EASY: 2, MED: 4, HARD: 6 };
  const COURSES = {
    riverside: { name: '네온 리버사이드', desc: '강변 야경 서킷 · 코너 9개', layout: [
      [0, 50, 0, 0], [25, 45, 25, C.MED], [0, 60, 0, 0, 10], [20, 35, 20, -C.MED], [20, 35, 20, C.MED], [0, 40, 0, 0, -10],
      [30, 70, 30, -C.HARD], [0, 120, 0, 0, 16], [25, 50, 25, C.EASY, -16], [25, 45, 25, -C.MED], [0, 70, 0, 0],
      [35, 65, 35, C.HARD], [0, 50, 0, 0], [20, 35, 20, -C.MED], [20, 35, 20, C.MED], [0, 130, 0, 0]] },
    harbor: { name: '미드나잇 하버', desc: '항구 심야 테크니컬 · 코너 11개', layout: [
      [0, 40, 0, 0], [20, 30, 20, -C.MED], [0, 30, 0, 0], [25, 50, 25, C.HARD], [0, 50, 0, 0, 8],
      [15, 25, 15, -C.MED], [15, 25, 15, C.MED], [15, 25, 15, -C.MED], [0, 60, 0, 0, -8], [30, 60, 30, -C.HARD],
      [0, 40, 0, 0], [20, 40, 20, C.MED], [20, 35, 20, -C.EASY], [0, 50, 0, 0, 6], [25, 45, 25, C.HARD], [0, 110, 0, 0, -6]] },
    coast: { name: '선라이즈 코스트', desc: '새벽 해안 고속 · 코너 6개', layout: [
      [0, 60, 0, 0], [40, 80, 40, C.EASY, 12], [0, 50, 0, 0, -12], [35, 70, 35, -C.MED], [0, 80, 0, 0, 20],
      [30, 60, 30, C.MED, -20], [30, 50, 30, -C.EASY], [0, 60, 0, 0], [35, 80, 35, C.HARD], [0, 60, 0, 0, 10],
      [25, 40, 25, -C.MED, -10], [0, 120, 0, 0]] },
  };
  const STEP = 1 / 120;
  function newRun(speedBonus = 0) {
    return {
      topSpeed: CAR.maxSpeed * (1 + speedBonus / 280),
      t: 0, z: 0, x: 0, speed: 0, gauge: 50, boostT: 0, finished: false, ended: false, dnf: false,
      drift: false, holdT: 0, driftT: 0, driftDir: 0, charge: 0, exitT: null,
      drifts: 0, walls: 0, boosts: 0, shake: 0, sparks: [], tilt: 0, msg: null, countdown: 3.2,
      input: { left: false, right: false, boost: false }, trace: { z: [], x: [] },
    };
  }

function createRace(courseId){
  const segs = [];
  const lastY = () => segs.length ? segs[segs.length - 1].p2.world.y : 0;
  const ease = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + .5);
  function addSeg(curve, y) {
    const i = segs.length;
    segs.push({ i, curve, sprites: [], p1: { world: { y: lastY(), z: i * SEG }, camera: {}, screen: {} }, p2: { world: { y, z: (i + 1) * SEG }, camera: {}, screen: {} } });
  }
  function addRoad(enter, hold, leave, curve, hill = 0) {
    const y0 = lastY(), y1 = y0 + hill * SEG, n = enter + hold + leave;
    for (let k = 0; k < enter; k++) addSeg(ease(0, curve, k / enter), ease(y0, y1, k / n));
    for (let k = 0; k < hold; k++) addSeg(curve, ease(y0, y1, (enter + k) / n));
    for (let k = 0; k < leave; k++) addSeg(ease(curve, 0, k / leave), ease(y0, y1, (enter + hold + k) / n));
  }
  const COURSE = COURSES[courseId];
  {
    const units = COURSE.layout.reduce((s, [a, b, c]) => s + a + b + c, 0), L = 2750 / units, r = n => Math.round(n * L);
    for (const [a, b, c, curve, hill = 0] of COURSE.layout) addRoad(r(a), r(b), r(c), curve, hill);
  }
  const FINISH_SEG = segs.length;
  const TRACK_LEN = FINISH_SEG * SEG;
  addRoad(0, 400, 0, 0);                                   // 결승 이후 여유 구간
  // 길가 장식: 가로등, 코너 바깥 화살표, 왼쪽 야자수
  for (const s of segs) {
    if (s.i % 14 === 0) { s.sprites.push({ k: 'lamp', x: -1.22 }, { k: 'lamp', x: 1.22 }); }
    if (s.i % 9 === 4 && s.i < FINISH_SEG) s.sprites.push({ k: 'palm', x: -1.9 - (s.i % 3) * .5 });
    if (Math.abs(s.curve) >= 3 && s.i % 10 === 0) s.sprites.push({ k: 'chev', x: s.curve > 0 ? -1.32 : 1.32, dir: Math.sign(s.curve) });
  }
  const segAt = z => segs[Math.max(0, Math.floor(z / SEG)) % segs.length];

  function flash(S, text, color) { S.msg = { text, color, t: S.t }; }

  function step(S, dt) {
    if (S.ended) return;
    if (S.countdown > 0) { S.countdown -= dt; S.input.boost = false; return; }
    S.t += dt;
    const seg = segAt(S.z + PLAYER_Z), sp = S.speed / CAR.maxSpeed;
    const steer = (S.input.right ? 1 : 0) - (S.input.left ? 1 : 0);
    const dx = dt * 2 * sp;
    const curveDir = Math.abs(seg.curve) >= 1.5 ? Math.sign(seg.curve) : 0;

    // 드리프트: 코너 안쪽으로 방향을 계속 누르면 시작, 코너가 끝날 무렵 떼면 성공
    if (!S.drift) {
      if (curveDir && steer === curveDir && sp > .6) { S.holdT += dt; if (S.holdT > CAR.driftHold) { S.drift = true; S.driftT = 0; S.driftDir = curveDir; S.charge = 0; S.exitT = null; } }
      else S.holdT = 0;
    } else {
      S.driftT += dt; S.charge += dt * CAR.driftCharge * (.5 + Math.abs(seg.curve) / 6);
      const inCurve = Math.sign(seg.curve) === S.driftDir && Math.abs(seg.curve) >= 1;
      if (inCurve) S.exitT = null; else if (S.exitT == null) S.exitT = S.t;
      if (steer !== S.driftDir) {
        if (S.driftT >= CAR.driftMin) {
          const perfect = S.exitT != null && S.t - S.exitT <= CAR.driftExitPerfect;
          const gain = Math.min(CAR.driftMaxGain, S.charge * (perfect ? 1.5 : 1));
          S.gauge = Math.min(100, S.gauge + gain); S.drifts++;
          if (perfect) S.speed = Math.min(S.topSpeed * 1.05, S.speed + 500);
          flash(S, perfect ? `PERFECT DRIFT +${Math.round(gain)}` : `드리프트 성공 +${Math.round(gain)}`, perfect ? '#3ef2c2' : '#d9c9ff');
        }
        S.drift = false; S.holdT = 0;
      } else if (S.exitT != null && S.t - S.exitT > CAR.driftFailAfter) {
        S.speed *= .85; S.x -= S.driftDir * .25; S.drift = false; S.holdT = 0;
        flash(S, '드리프트 실패', '#ff6fb5');
      }
    }

    // 조향과 원심력. 드리프트 중에는 원심력이 절반으로 줄고 조향도 약해짐
    // → 급커브 최고속에서 균형, 완만한 커브에서는 안쪽으로 파고들어 떼는 시점이 중요
    S.x += steer * dx * (S.drift ? CAR.driftSteer : CAR.steer);
    S.x -= dx * sp * seg.curve * CAR.centrifugal * (S.drift ? CAR.driftCentrifugal : 1);
    S.tilt += ((steer + (S.drift ? S.driftDir * .8 : 0)) - S.tilt) * Math.min(1, dt * 8);

    // 부스터
    if (S.input.boost) {
      S.input.boost = false;
      if (S.gauge >= CAR.boostCost && S.boostT <= 0) { S.gauge -= CAR.boostCost; S.boostT = CAR.boostTime; S.speed += CAR.boostKick; S.boosts++; flash(S, 'BOOST!', '#3ef2c2'); }
    }
    if (S.boostT > 0) S.boostT -= dt;

    // 속도: 자동 가속, 코너에서 버티면 감속(드리프트는 덜 잃음)
    const top = S.topSpeed * (S.boostT > 0 ? CAR.boostMul : 1);
    if (S.speed < top) S.speed = Math.min(top, S.speed + CAR.accel * dt);
    else S.speed -= (S.speed - top) * Math.min(1, dt * 2.5);
    if (seg.curve) S.speed -= S.speed * dt * CAR.scrub * (Math.abs(seg.curve) / 6) * sp * sp * (S.drift ? CAR.driftScrub : 1);

    // 벽 충돌
    if (S.wallCd > 0) S.wallCd -= dt;
    if (Math.abs(S.x) > 1) {
      S.x = Math.sign(S.x) * .9;
      if (S.drift) { S.drift = false; S.holdT = 0; }
      if (!(S.wallCd > 0)) { S.speed *= CAR.wallSlow; S.walls++; S.shake = .35; S.wallCd = CAR.wallCooldown; flash(S, '벽 충돌', '#ff6fb5'); }
    }

    // 진행: 코너 안쪽일수록 실제로 도는 거리가 짧음
    const inside = seg.curve / 6 * S.x;
    S.z += S.speed * dt * (1 + CAR.insideBonus * inside);
    if (S.shake > 0) S.shake -= dt;

    if (S.z >= TRACK_LEN) { S.finished = true; S.ended = true; }
    else if (S.t >= RULES.limit) { S.t = RULES.limit; S.dnf = true; S.ended = true; }
  }

  return {step,segs,segAt,TRACK_LEN,FINISH_SEG};
}
export { RULES,CAR,SEG,ROAD_W,RUMBLE,DRAW,FOV,CAM_H,CAM_DEPTH,PLAYER_Z,COURSES,STEP,newRun,computeScore,createRace };
