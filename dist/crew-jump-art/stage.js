export function stageRenderer(ctx){
const W=960,H=540,GROUND=452,PX=190,scale=1,JUMP2_V=820;
let bgT=0,G=null;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const city = []; for (let x = 0; x < 1400;) { const w = 40 + rnd() * 70; city.push({ x, w, h: 90 + rnd() * 190, spire: rnd() < .25 }); x += w + 6 + rnd() * 18; }
  const cityB = []; for (let x = 0; x < 1100;) { const w = 50 + rnd() * 80; cityB.push({ x, w, h: 60 + rnd() * 110 }); x += w + 4; }
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 240 + rnd() * 120, y: 40 + rnd() * 120, s: .7 + rnd() * .7 }));
  const trees = Array.from({ length: 5 }, (_, i) => ({ x: i * 300 + rnd() * 120, s: .8 + rnd() * .5 }));
  function star(x, y, r1, r2, rot = -Math.PI / 2) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / 5; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath();
  }
  function sparkle(x, y, r) { // 4갈래 반짝이 (AIFECT 로고 느낌)
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
  }
  const wrap = (v, m) => ((v % m) + m) % m;

  function drawBg(scroll) {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#5f5fd9'); sky.addColorStop(.55, '#9b8cf0'); sky.addColorStop(1, '#d9c4f5');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // 구름
    ctx.fillStyle = 'rgba(255,214,240,.55)';
    for (const c of clouds) {
      const x = wrap(c.x - scroll * .03, W + 300) - 150;
      ctx.beginPath(); ctx.ellipse(x, c.y, 70 * c.s, 22 * c.s, 0, 0, 7); ctx.ellipse(x + 40 * c.s, c.y - 12 * c.s, 46 * c.s, 22 * c.s, 0, 0, 7); ctx.fill();
    }

    // 관람차 + 큰 별
    const fx = 690, fy = 170;
    ctx.save(); ctx.translate(fx, fy);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 120, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 108, 0, 7); ctx.stroke();
    ctx.rotate(bgT * .08);
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 120, Math.sin(a) * 120); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(Math.cos(a) * 120 - 5, Math.sin(a) * 120 - 4, 10, 8); }
    ctx.restore();
    ctx.save(); ctx.translate(fx, fy);
    ctx.shadowColor = '#bfe9ff'; ctx.shadowBlur = 30; ctx.fillStyle = '#e8f6ff'; sparkle(0, 0, 54);
    ctx.shadowBlur = 0; ctx.fillStyle = '#7fc8ff'; sparkle(0, 0, 22);
    ctx.strokeStyle = 'rgba(160,230,255,.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 150, 34, -.25, 0, 7); ctx.stroke();
    ctx.restore();

    // 먼 도시
    ctx.fillStyle = 'rgba(92,86,190,.75)';
    const s1 = scroll * .12;
    for (const b of city) {
      const x = wrap(b.x - s1, 1400) - 120; const top = GROUND - 60 - b.h;
      ctx.fillRect(x, top, b.w, b.h + 60);
      if (b.spire) { ctx.beginPath(); ctx.moveTo(x + b.w / 2 - 6, top); ctx.lineTo(x + b.w / 2, top - 60); ctx.lineTo(x + b.w / 2 + 6, top); ctx.fill(); }
    }
    // 가까운 건물 + 창문
    const s2 = scroll * .22;
    for (const b of cityB) {
      const x = wrap(b.x - s2, 1100) - 120, top = GROUND - 40 - b.h;
      ctx.fillStyle = 'rgba(70,64,160,.9)'; ctx.fillRect(x, top, b.w, b.h + 40);
      ctx.fillStyle = 'rgba(190,210,255,.35)';
      for (let wy = top + 12; wy < GROUND - 50; wy += 18) for (let wx = x + 8; wx < x + b.w - 10; wx += 16) ctx.fillRect(wx, wy, 7, 9);
    }

    // 벚나무
    const s3 = scroll * .4;
    for (const t of trees) {
      const x = wrap(t.x - s3, 1500) - 200, s = t.s;
      ctx.fillStyle = '#5b3f7a'; ctx.fillRect(x - 6 * s, GROUND - 150 * s, 12 * s, 150 * s);
      ctx.fillStyle = '#f3a9d8';
      for (const [ox, oy, r] of [[-50, -170, 55], [10, -195, 62], [60, -165, 50], [-15, -140, 48], [40, -135, 40]]) { ctx.beginPath(); ctx.arc(x + ox * s, GROUND + oy * s, r * s, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,220,240,.7)';
      for (const [ox, oy, r] of [[-30, -190, 22], [30, -210, 20], [70, -180, 16]]) { ctx.beginPath(); ctx.arc(x + ox * s, GROUND + oy * s, r * s, 0, 7); ctx.fill(); }
    }

    // 난간
    const s4 = scroll * .7;
    ctx.fillStyle = 'rgba(235,225,255,.85)';
    ctx.fillRect(0, GROUND - 58, W, 5); ctx.fillRect(0, GROUND - 32, W, 3);
    for (let x = -wrap(s4, 70); x < W; x += 70) ctx.fillRect(x, GROUND - 58, 5, 58);

    // 바닥
    const fg = ctx.createLinearGradient(0, GROUND, 0, H);
    fg.addColorStop(0, '#c7b6ff'); fg.addColorStop(.12, '#9f8be8'); fg.addColorStop(1, '#5a4bb5');
    ctx.fillStyle = fg; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#efe6ff'; ctx.fillRect(0, GROUND, W, 5);
    ctx.fillStyle = 'rgba(60,45,140,.35)';
    for (let x = -wrap(scroll, 96); x < W; x += 96) ctx.fillRect(x, GROUND + 5, 3, H - GROUND);
    ctx.fillRect(0, GROUND + 40, W, 2);
  }

  function drawSpike(e) {
    for (let i = 0; i < e.n; i++) {
      const x = e.x + i * 34;
      const g = ctx.createLinearGradient(x, GROUND - e.h, x + 34, GROUND);
      g.addColorStop(0, '#f2ecff'); g.addColorStop(1, '#8f78e8');
      ctx.fillStyle = g; ctx.strokeStyle = '#3d2f8f'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x + 17, GROUND - e.h); ctx.lineTo(x + 34, GROUND); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(x + 17, GROUND - e.h + 6); ctx.lineTo(x + 11, GROUND - 6); ctx.lineTo(x + 15, GROUND - 6); ctx.fill();
    }
  }
  function drawBlock(e) {
    // top 블록은 아래 블록(78) 위에 얹힌 윗칸만 그림
    const yy = GROUND - e.h, h = e.top ? e.h - 78 : e.h;
    ctx.fillStyle = '#2b2766'; ctx.strokeStyle = '#a796ff'; ctx.lineWidth = 3;
    roundRect(e.x, yy, e.w, h, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3a3486'; roundRect(e.x + 6, yy + 6, e.w - 12, h - 12, 5); ctx.fill();
    ctx.fillStyle = '#d7f0ff'; ctx.shadowColor = '#9fdcff'; ctx.shadowBlur = 10;
    sparkle(e.x + e.w / 2, yy + h / 2, Math.min(18, h / 2 - 6)); ctx.shadowBlur = 0;
  }
  function drawBird(e) {
    const y = e.by ?? e.y, flap = Math.sin(bgT * 16 + e.ph);
    ctx.save(); ctx.translate(e.x, y);
    ctx.shadowColor = 'rgba(255,255,255,.7)'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#3b2a86';
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 12, 0, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#5a43c4';                                                                        // 날개
    ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(10, -4); ctx.lineTo(2, -4 - 20 * flap); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(20, 2); ctx.lineTo(32, -2); ctx.lineTo(30, 8); ctx.fill();          // 꼬리
    ctx.fillStyle = '#ff8fb8'; ctx.beginPath(); ctx.moveTo(-22, -2); ctx.lineTo(-32, 2); ctx.lineTo(-21, 5); ctx.fill(); // 부리 (플레이어 쪽)
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-13, -3, 3.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a1238'; ctx.beginPath(); ctx.arc(-14, -3, 1.7, 0, 7); ctx.fill();
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawJelly(e) {
    const bob = Math.sin(bgT * 5 + e.x * .03) * 3;
    ctx.save(); ctx.shadowColor = 'rgba(255,220,80,.9)'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffd84d'; ctx.strokeStyle = '#e09a00'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    star(e.x, e.y + bob, e.r + 3, (e.r + 3) * .5); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(e.x - 4, e.y + bob - 5, 4, 2.5, -.5, 0, 7); ctx.fill();
    ctx.restore();
  }

  const SHEET = new Image(); let sheetOk = false;
  SHEET.onload = () => { sheetOk = true; };
  SHEET.src = '/crew-jump-art/crew-runner.webp';
  const FR = {"run":[[0,0,152,168,88.0],[154,0,157,168,90.0],[313,0,154,164,90.0],[469,0,151,168,83.0],[622,0,147,161,84.0],[771,0,151,167,85.0]],"jump":[[924,0,146,148,81.0],[0,170,148,152,83.0],[150,170,141,145,84.0],[293,170,145,136,84.0],[440,170,144,152,81.0],[586,170,158,146,83.0]],"djump":[[746,170,138,140,78.0],[886,170,129,146,72.0],[0,324,132,150,71.0],[134,324,128,133,70.0]],"fall":[[264,324,131,147,72.0]],"land":[[397,324,147,138,70.0]],"idle":[[546,324,133,139,74.0]],"hit":[[681,324,141,153,70.0],[824,324,128,130,63.0],[954,324,144,139,78.0]]};
  const SPR = 0.68;   // 시트 프레임 높이 약 165px → 화면 약 112px

  function crewFrame(g) {
    if (!g) return FR.run[Math.floor(bgT * 11) % 6];
    if (g.dead) return FR.hit[Math.min(2, Math.floor((.7 - g.dead) / .7 * 3))];
    if (g.onGround) return g.landT > 0 ? FR.land[0] : FR.run[Math.floor(g.runPhase * .8) % 6];
    if (g.jumps === 2 && g.djT < .32) return FR.djump[Math.min(3, Math.floor(g.djT / .08))];
    if (g.jumps === 1 && g.jumpT < .07) return FR.jump[1];
    if (g.vy < -450) return FR.jump[2];
    if (g.vy < 150) return FR.jump[3];
    return g.jumps === 2 ? FR.fall[0] : FR.jump[4];
  }
  function drawCrew(x, feet, g) {
    if (!sheetOk) return drawCrewVector(x, feet, g);
    const f = crewFrame(g);
    ctx.drawImage(SHEET, f[0], f[1], f[2], f[3], x - f[4] * SPR, feet - f[3] * SPR + 2, f[2] * SPR, f[3] * SPR);
  }

  // 이미지가 아직 안 불렸을 때 쓰는 벡터 캐릭터
  function drawCrewVector(x, feet, g) {
    const air = g && !g.onGround, ph = g ? g.runPhase : bgT * 8;
    const spin = g && g.jumps === 2 && !g.onGround ? Math.max(0, Math.min(1, (-g.vy) / JUMP2_V)) : 0;
    ctx.save(); ctx.translate(x, feet);
    if (spin) ctx.rotate(-spin * .35);
    const bob = air ? 0 : Math.abs(Math.sin(ph)) * -3;

    // 스카프 (뒤로 날림)
    ctx.fillStyle = '#7c4dff';
    const wave = Math.sin(bgT * 14) * 5;
    ctx.beginPath(); ctx.moveTo(-6, -50 + bob); ctx.quadraticCurveTo(-30, -56 + wave, -52, -46 + wave); ctx.lineTo(-48, -38 + wave); ctx.quadraticCurveTo(-28, -44, -4, -42 + bob); ctx.fill();

    // 다리
    ctx.strokeStyle = '#232045'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    const l1 = air ? .7 : Math.sin(ph) * .9, l2 = air ? -.3 : -Math.sin(ph) * .9;
    for (const a of [l2, l1]) { ctx.beginPath(); ctx.moveTo(0, -20 + bob); ctx.lineTo(Math.sin(a) * 14, -4 + bob - (air ? 6 : 0)); ctx.stroke(); }
    ctx.fillStyle = '#ffffff';
    for (const a of [l2, l1]) { ctx.beginPath(); ctx.ellipse(Math.sin(a) * 14 + 3, -2 + bob - (air ? 6 : 0), 7, 4.5, 0, 0, 7); ctx.fill(); }

    // 몸 (흰 후드 + 검은 조끼)
    ctx.fillStyle = '#ffffff'; roundRect(-14, -48 + bob, 28, 30, 9); ctx.fill();
    ctx.fillStyle = '#26234d'; roundRect(-14, -40 + bob, 28, 20, 6); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-2, -40 + bob, 4, 20);
    // 팔
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7;
    const arm = air ? -1.2 : Math.sin(ph + Math.PI) * .9;
    ctx.beginPath(); ctx.moveTo(4, -42 + bob); ctx.lineTo(4 + Math.sin(arm) * 14, -30 + bob + Math.cos(arm) * 2); ctx.stroke();

    // 머리
    const hy = -70 + bob;
    ctx.fillStyle = '#e7e2ff';  // 뒷머리 + 포니테일
    ctx.beginPath(); ctx.ellipse(-24, hy + 2 + Math.sin(bgT * 12) * 2, 16, 9, -.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(0, hy, 24, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe9e1'; ctx.beginPath(); ctx.ellipse(5, hy + 5, 17, 16, 0, 0, 7); ctx.fill();   // 얼굴
    ctx.fillStyle = '#e7e2ff';                                                                       // 앞머리
    ctx.beginPath(); ctx.moveTo(-22, hy - 2); ctx.quadraticCurveTo(2, hy - 34, 24, hy - 4); ctx.quadraticCurveTo(14, hy - 10, 12, hy - 2); ctx.quadraticCurveTo(6, hy - 12, 0, hy - 4); ctx.quadraticCurveTo(-8, hy - 12, -12, hy + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c8b9ff'; ctx.beginPath(); ctx.ellipse(-4, hy - 16, 14, 5, -.3, 0, 7); ctx.fill();
    // 눈
    ctx.fillStyle = '#6a3fd6'; ctx.beginPath(); ctx.ellipse(13, hy + 4, 3.6, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(14, hy + 2, 1.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,140,170,.45)'; ctx.beginPath(); ctx.ellipse(10, hy + 12, 4, 2.5, 0, 0, 7); ctx.fill();
    // 헤드폰
    ctx.strokeStyle = '#2a2650'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(-2, hy, 26, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
    ctx.fillStyle = '#2a2650'; ctx.beginPath(); ctx.arc(-6, hy + 4, 11, 0, 7); ctx.fill();
    ctx.fillStyle = '#7b5cff'; ctx.beginPath(); ctx.arc(-6, hy + 4, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff'; sparkle(-6, hy + 4, 5);
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const shake = G && G.shake ? (Math.random() - .5) * 10 * G.shake / .35 : 0;
    ctx.translate(shake, 0);
    const scroll = G ? G.dist : bgT * 120;
    drawBg(scroll);
    if (G) {
      for (const e of G.ents) { if (e.k === 'spike') drawSpike(e); else if (e.k === 'block') drawBlock(e); }
      for (const e of G.ents) if (e.k === 'bird') drawBird(e);
      for (const e of G.ents) if (e.k === 'jelly' && !e.got) drawJelly(e);
      // 그림자
      const sh = Math.max(.3, 1 - (GROUND - G.y) / 260);
      ctx.fillStyle = `rgba(40,30,110,${.35 * sh})`; ctx.beginPath(); ctx.ellipse(PX, GROUND + 3, 20 * sh, 5 * sh, 0, 0, 7); ctx.fill();
      // 2단 점프 잔상
      if (G.jumps === 2 && !G.onGround) { ctx.globalAlpha = .25; drawCrew(PX - 14, G.y + 10, G); ctx.globalAlpha = 1; }
      drawCrew(PX, G.y, G);
      for (const p of G.parts) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        if (p.txt) { ctx.font = '22px Jua, sans-serif'; ctx.fillStyle = '#fff6c2'; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 4; ctx.textAlign = 'center'; ctx.strokeText(p.txt, p.x, p.y); ctx.fillText(p.txt, p.x, p.y); }
        else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    } else {
      drawCrew(PX + 40, GROUND, null);
    }
  }


let prev=null,parts=[];
function sparks(x,y,c,text){
 for(let n=0;n<7;n++)parts.push({x,y,vx:(Math.random()-.5)*160,vy:-30-Math.random()*95,r:2+Math.random()*2,life:.32,max:.32,c});
 if(text)parts.push({x,y:y-18,vx:0,vy:-70,life:.52,max:.52,txt:text});
}
return {ready:()=>SHEET.decode(),draw(s){
 if(!s){G=null;bgT=0;prev=null;parts=[];draw();return}
 bgT=s.tick/60;const dt=prev?Math.max(0,Math.min(.16,(s.tick-prev.tick)/60)):0;
 if(!prev||prev.tick>s.tick){prev=null;parts=[]}
 if(s.jumps!==prev?.jumps&&prev)sparks(PX,s.jumps===2?GROUND-s.y-38:GROUND-s.y,s.jumps===2?'#c9b8ff':'white');
 if(prev&&s.jellies>prev.jellies)sparks(PX+22,GROUND-s.y-32,'#ffe27a','+'+(s.jellyPoints-prev.jellyPoints));
 for(const p of parts){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(!p.txt)p.vy+=400*dt}
 parts=parts.filter(p=>p.life>0);
 const ents=[];
 for(let i=s.nextObstacle;i<s.pattern.obstacles.length;i++){
 const o=s.pattern.obstacles[i],x=o.x-s.distance;if(x>W+80)break;if(x+o.width<0)continue;
 ents.push({k:o.type,x:o.type==='bird'?x+o.width/2:x,y:GROUND-o.bottom-o.height/2,w:o.width,h:o.height,n:o.width/34,ph:i});
 }
 for(let i=s.nextJelly;i<s.pattern.jellies.length;i++){const j=s.pattern.jellies[i],x=j.x-s.distance;if(x>W+20)break;if(x>-20)ents.push({k:'jelly',x,y:GROUND-j.height,r:15})}
 G={t:bgT,dist:s.distance,ents,parts,y:GROUND-s.y,vy:-s.vy*60,onGround:s.jumps===0,jumps:s.jumps,landT:.09-(s.tick-s.landed)/60,jumpT:(s.tick-s.jumped)/60,djT:(s.tick-s.jumped)/60,runPhase:s.distance/38,dead:s.finished==='collision'?.62:0,shake:0};
 draw();prev={tick:s.tick,jumps:s.jumps,jellies:s.jellies,jellyPoints:s.jellyPoints};
}};
}
