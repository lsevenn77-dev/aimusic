// 낚시 화면 연출: 흐르는 밤바다(WebGL)와 낚싯대·줄·찌·물보라·반짝임(2D 캔버스).
// 판정과 결과는 서버가 정한다. 이 파일은 받은 결과를 보여주기만 하고 게임 상태를 바꾸지 않는다.

const VERT='attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
// 하늘·바다 색은 art/shore.svg 팔레트를 그대로 쓴다.
const FRAG=`precision highp float;
uniform vec2 R;uniform float T,H;uniform vec2 MOON;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}
vec3 sky(float e){e=clamp(e,0.,1.);
  vec3 c=mix(vec3(.79,.54,.58),vec3(.40,.36,.53),smoothstep(0.,.12,e));
  c=mix(c,vec3(.14,.21,.35),smoothstep(.1,.45,e));
  return mix(c,vec3(.035,.09,.15),smoothstep(.4,1.,e));}
float wave(vec2 x,float t){
  float h=.34*sin(dot(x,vec2(.32,.95))*1.1+t*1.25)+.2*sin(dot(x,vec2(-.6,.8))*1.9+t*1.85)+.11*sin(dot(x,vec2(.9,.43))*3.3+t*2.55);
  h+=.3*(fbm(x*.62+vec2(t*.22,t*.38))-.5)+.09*(noise(x*3.1-vec2(-t*.3,t*.95))-.5);
  return h;}
void main(){
  vec2 uv=gl_FragCoord.xy/R;float asp=R.x/R.y,hy=1.-H,f=1.25;
  vec2 p=vec2((uv.x-.5)*asp,uv.y-hy),m=vec2((MOON.x-.5)*asp,(1.-MOON.y)-hy);
  vec3 moonDir=normalize(vec3(m.x,m.y,f)),col;
  if(p.y>0.){
    col=sky(p.y/(1.-hy));
    float cl=fbm(vec2(p.x*1.3+T*.012,p.y*5.2))*smoothstep(.02,.14,p.y)*smoothstep(.55,.18,p.y);
    col=mix(col,vec3(.66,.52,.62),cl*.32);
    float s=hash(floor(gl_FragCoord.xy/2.5));
    col+=step(.9972,s)*(.55+.45*sin(T*1.7+s*60.))*.75*smoothstep(.1,.35,p.y);
    float d=length(p-m);
    col+=vec3(.9,.86,.75)*.32*exp(-d*8.);
    col=mix(col,vec3(.97,.91,.8),smoothstep(.033,.029,d));
  }else{
    float z=1.6*f/max(-p.y,1e-4),e=.05+z*.012;vec2 w=vec2(p.x*z/f,z);
    float hc=wave(w,T),dx=wave(w+vec2(e,0.),T)-hc,dz=wave(w+vec2(0.,e),T)-hc;
    vec3 n=normalize(vec3(-dx/e,1.,-dz/e));
    n=normalize(mix(n,vec3(0.,1.,0.),smoothstep(10.,70.,z)*.8));
    vec3 v=normalize(vec3(p.x,p.y,f)),r=reflect(v,n);
    float F=.03+.97*pow(1.-max(dot(n,-v),0.),5.);
    vec3 water=mix(vec3(.05,.15,.21),vec3(.2,.34,.42),smoothstep(2.,45.,z)*.7);
    water+=vec3(.05,.11,.12)*smoothstep(.15,.45,hc)*(1.-smoothstep(6.,30.,z));
    col=mix(water,sky(abs(r.y)*1.4)*.92,F);
    float g=pow(max(dot(r,moonDir),0.),340.);
    col+=vec3(1.,.93,.8)*g*2.6*(.6+.4*noise(w*2.+T));
    col=mix(col,sky(0.)*.78,smoothstep(40.,260.,z));
  }
  gl_FragColor=vec4(col,1.);
}`;

function seaRenderer(canvas){
  const gl=canvas.getContext('webgl',{antialias:false,alpha:false,powerPreference:'low-power'});
  if(!gl)return null;
  const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return gl.getShaderParameter(s,gl.COMPILE_STATUS)?s:null};
  const vs=shader(gl.VERTEX_SHADER,VERT),fs=shader(gl.FRAGMENT_SHADER,FRAG);
  if(!vs||!fs)return null;
  const prog=gl.createProgram();gl.attachShader(prog,vs);gl.attachShader(prog,fs);gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS))return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const u=name=>gl.getUniformLocation(prog,name),uR=u('R'),uT=u('T'),uH=u('H'),uM=u('MOON');
  return (w,h,t,horizon,moon)=>{
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h)}
    gl.uniform2f(uR,w,h);gl.uniform1f(uT,t);gl.uniform1f(uH,horizon);gl.uniform2f(uM,moon[0],moon[1]);
    gl.drawArrays(gl.TRIANGLES,0,3);
  };
}

const SPARK={common:'#d6f3ff',rare:'#9deada',unique:'#cdb5ff',legend:'#ffd9a0',mythic:'#ffc3dd'};
const SPARKS={common:14,rare:20,unique:28,legend:38,mythic:50};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)), lerp=(a,b,k)=>a+(b-a)*k;
const easeOut=k=>1-Math.pow(1-clamp(k,0,1),3), easeInOut=k=>(k=clamp(k,0,1))<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;

export function createScene(stage,{goal=3,progress=0}={}){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sea=document.createElement('canvas'),fx=document.createElement('canvas'),callout=stage.querySelector('.callout');
  sea.className='sea';fx.className='fx';sea.setAttribute('aria-hidden','true');fx.setAttribute('aria-hidden','true');
  stage.prepend(sea,fx);
  let drawSea=null;try{drawSea=seaRenderer(sea)}catch{drawSea=null}
  if(drawSea)stage.classList.add('live');
  const ctx=fx.getContext('2d');
  const HORIZON=.4,MOON=[.74,.15];
  let W=1,Hh=1,raf=0,last=performance.now(),time=0,alive=true;
  // 연출 상태
  const S={phase:'idle',pt:0,a:0,bend:.12,jerk:0,slack:0,shake:0,hook:null,hookTo:null,bobber:null,lure:null,lineOn:false,
    shadow:{on:false,x:0,y:0,vx:0,fade:1,thrash:0},leap:null,glow:0,goal,progress,done:null,splashAt:-1,bitten:false,nibbles:0};
  const drops=[],rings=[],sparks=[];
  const portrait=()=>Hh>W*1.05;
  const idleA=()=>portrait()?-2.02:-2.42;
  const base=()=>({x:W+W*.02,y:Hh+8});
  const rodLen=()=>portrait()?Math.min(W*.98,Hh*.62):Math.min(W*.5,Hh);
  const tipAt=a=>{const b=base(),L=rodLen();return {x:b.x+Math.cos(a)*L,y:b.y+Math.sin(a)*L}};
  const waterY=k=>Hh*HORIZON+(Hh*(1-HORIZON))*k;
  const landing=()=>portrait()?{x:W*.3,y:waterY(.13)}:{x:W*.4,y:waterY(.2)};
  const near=()=>portrait()?{x:W*.55,y:waterY(.3)}:{x:W*.6,y:waterY(.4)};
  const hookFor=p=>{const a=landing(),b=near(),k=clamp(p/Math.max(1,S.goal),0,1);return {x:lerp(a.x,b.x,k),y:lerp(a.y,b.y,k)}};
  S.a=idleA();

  function resize(){
    const r=stage.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
    W=Math.max(1,r.width);Hh=Math.max(1,r.height);
    fx.width=Math.round(W*dpr);fx.height=Math.round(Hh*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  const ro=new ResizeObserver(resize);ro.observe(stage);resize();

  function splash(x,y,n,power){
    for(let i=0;i<n;i++){const a=-Math.PI/2+(Math.random()-.5)*1.9,v=power*(.45+Math.random()*.7);drops.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:1,r:1+Math.random()*2.2})}
    ring(x,y,power*.35);
  }
  function ring(x,y,size){rings.push({x,y,r:4,grow:size,life:1})}
  function burst(x,y,tier){
    const n=SPARKS[tier]||14,c=SPARK[tier]||SPARK.common;
    for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=60+Math.random()*220;sparks.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-40,life:1,decay:.5+Math.random()*.6,size:4+Math.random()*9,rot:Math.random()*3,c})}
  }
  function say(text,tone){
    if(!callout)return;
    callout.textContent=text;callout.dataset.tone=tone||'';
    callout.classList.remove('show');void callout.offsetWidth;callout.classList.add('show');
  }

  // ───── 단계별 움직임 ─────
  function update(dt,elapsed=dt){
    time+=elapsed;S.pt+=elapsed;
    const ia=idleA(),L=landing();
    S.jerk*=Math.exp(-dt*6);S.slack=Math.max(0,S.slack-dt);S.shake=Math.max(0,S.shake-dt);S.glow=Math.max(0,S.glow-dt*.35);
    if(S.phase==='cast'){
      const t=S.pt;
      if(t<.45){S.a=lerp(ia,ia+.72,easeInOut(t/.45));S.bend=.08;S.lure={...tipAt(S.a)};S.lure.y+=16}
      else if(t<.78){const k=(t-.45)/.33;S.a=lerp(ia+.72,ia-.42,easeOut(k));S.bend=-.38*(1-k)}
      else S.a+= (ia-S.a)*Math.min(1,dt*5);
      if(t>=.6&&!S.flight){S.flight={from:tipAt(S.a),t:0}}
      if(S.flight&&!S.bobber){
        S.flight.t=Math.max(0,t-.6);const k=clamp(S.flight.t/.88,0,1),f=S.flight.from;
        S.lure={x:lerp(f.x,L.x,k),y:lerp(f.y,L.y,easeInOut(k))-Math.sin(k*Math.PI)*Hh*.22};
        if(k>=1){S.bobber={x:L.x,y:L.y};S.lure=null;splash(L.x,L.y,16,150);ring(L.x,L.y,40)}
      }
      if(S.bobber&&!S.bitten){
        S.bend+=(.12-S.bend)*Math.min(1,dt*4);
        if(t>2.75&&S.nibbles<1||t>3.0&&S.nibbles<2){S.nibbles++;S.bobber.dip=.18;ring(S.bobber.x,S.bobber.y,14)}
        if(time%0.95<dt)ring(S.bobber.x,S.bobber.y,10);
        if(t>=3.3){S.bitten=true;S.bobber=null;S.hook={...L};S.hookTo=hookFor(S.progress);splash(L.x,L.y,26,230);ring(L.x,L.y,60);S.bend=.85;S.jerk=-.15;S.shadow={on:true,x:L.x,y:L.y+16,vx:0,fade:1,thrash:.6};say('입질!','bite');S.phase='fight';S.pt=0;S.done?.();S.done=null}
      }
      if(S.bobber)S.bobber.dip=Math.max(0,(S.bobber.dip||0)-dt);
    }else if(S.phase==='fight'){
      S.a+=(ia+S.jerk-S.a)*Math.min(1,dt*10);
      const tension=S.slack>0?.15:.56+.07*Math.sin(time*8.5)+Math.max(0,S.jerk)*.9;
      S.bend+=(tension-S.bend)*Math.min(1,dt*7);
      S.hook.x+=(S.hookTo.x-S.hook.x)*Math.min(1,dt*2.4);S.hook.y+=(S.hookTo.y-S.hook.y)*Math.min(1,dt*2.4);
      const sh=S.shadow;sh.x=S.hook.x+Math.sin(time*1.7)*28;sh.y=S.hook.y+18+Math.sin(time*2.3)*5;sh.thrash=Math.max(0,sh.thrash-dt);
      if(time%.7<dt)ring(S.hook.x+(Math.random()-.5)*10,S.hook.y,12);
    }else if(S.phase==='land'){
      const t=S.pt;
      S.a+=(ia+(portrait()?.18:.36)-S.a)*Math.min(1,dt*6);S.bend+=(.95-S.bend)*Math.min(1,dt*6);
      if(t>=.32&&!S.leap){S.leap={from:{...S.hook},t:0};splash(S.hook.x,S.hook.y,40,320);ring(S.hook.x,S.hook.y,80);S.shadow.on=false}
      if(S.leap){
        const lp=S.leap;lp.t=Math.max(0,t-.32);const k=clamp(lp.t/1.05,0,1),to={x:W*.5,y:Hh*(portrait()?.3:.34)};
        lp.x=lerp(lp.from.x,to.x,easeOut(k));lp.y=lerp(lp.from.y,to.y,easeOut(k))-Math.sin(k*Math.PI)*Hh*.12;
        lp.scale=lerp(.32,1,easeOut(k));lp.rot=lerp(-.7,0,easeOut(k));
        if(k<.6&&Math.random()<dt*40)drops.push({x:lp.x,y:lp.y+10,vx:(Math.random()-.5)*60,vy:20,life:1,r:1.5+Math.random()*2});
        if(k>=.85&&!lp.burst){lp.burst=true;burst(lp.x,lp.y,S.tier);S.glow=1;say(S.tierName?S.tierName+' 포획!':'포획!','catch')}
      }
      if(t>=2.25&&S.done){S.done();S.done=null}
    }else if(S.phase==='escape'){
      const t=S.pt;S.a+=(ia+.35-S.a)*Math.min(1,dt*8);S.bend+=(0-S.bend)*Math.min(1,dt*8);
      S.shadow.x+=S.shadow.vx*dt;S.shadow.fade=Math.max(0,S.shadow.fade-dt*.9);
      if(t>=1.35&&S.done){S.done();S.done=null}
    }else{
      S.a+=(ia-S.a)*Math.min(1,dt*4);
    }
    for(const d of drops){d.vy+=520*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.life-=dt*1.4}
    for(const r of rings){r.r+=r.grow*dt*1.4;r.life-=dt*.9}
    for(const s of sparks){s.vx*=Math.exp(-dt*2.2);s.vy=s.vy*Math.exp(-dt*2.2)+30*dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt*s.decay;s.rot+=dt*2}
    for(const list of [drops,rings,sparks])for(let i=list.length-1;i>=0;i--)if(list[i].life<=0||list[i].y>Hh+40)list.splice(i,1);
  }

  // ───── 그리기 ─────
  function quadPoint(p0,c,p1,k){const u=1-k;return {x:u*u*p0.x+2*u*k*c.x+k*k*p1.x,y:u*u*p0.y+2*u*k*c.y+k*k*p1.y}}
  function drawHeadland(){
    // 오른쪽 수평선의 곶과 등대 (shore.svg 구도)
    const y=Hh*HORIZON,x0=W*.78;
    ctx.fillStyle='#16283a';ctx.beginPath();ctx.moveTo(x0-W*.12,y+1);ctx.quadraticCurveTo(x0-W*.04,y-Hh*.035,x0+W*.03,y-Hh*.05);ctx.lineTo(W+2,y-Hh*.07);ctx.lineTo(W+2,y+1);ctx.fill();
    const lx=x0+W*.06,ly=y-Hh*.055,lh=Hh*.07;
    ctx.fillStyle='#d9d3c8';ctx.fillRect(lx-3,ly-lh,6,lh);ctx.fillStyle='#253445';ctx.fillRect(lx-4,ly-lh-6,8,6);
    const blink=.55+.45*Math.sin(time*2.4);
    const g=ctx.createRadialGradient(lx,ly-lh-3,0,lx,ly-lh-3,22);g.addColorStop(0,`rgba(255,223,168,${.55*blink})`);g.addColorStop(1,'rgba(255,223,168,0)');ctx.fillStyle=g;ctx.fillRect(lx-22,ly-lh-25,44,44);
    const ang=Math.sin(time*.45)*.9+Math.PI,len=W*.32;
    const bg=ctx.createLinearGradient(lx,ly-lh-3,lx+Math.cos(ang)*len,ly-lh-3+Math.sin(ang)*len*.12);
    bg.addColorStop(0,'rgba(255,223,168,.22)');bg.addColorStop(1,'rgba(255,212,168,0)');
    ctx.fillStyle=bg;ctx.beginPath();ctx.moveTo(lx,ly-lh-3);ctx.lineTo(lx+Math.cos(ang-.05)*len,ly-lh-3+Math.sin(ang-.05)*len*.12-10);ctx.lineTo(lx+Math.cos(ang+.05)*len,ly-lh-3+Math.sin(ang+.05)*len*.12+10);ctx.fill();
  }
  function drawShadow(){
    const sh=S.shadow;if(!sh.on||sh.fade<=0)return;
    const depth=clamp((sh.y-Hh*HORIZON)/(Hh*(1-HORIZON)*.35),.45,1.3),size=(18+S.goal*5)*(portrait()?.85:1)*depth,wob=Math.sin(time*(sh.thrash>0?28:7))*(sh.thrash>0?.5:.18);
    ctx.save();ctx.translate(sh.x,sh.y);ctx.rotate(Math.sin(time*1.7)*.3+(sh.vx<0?Math.PI:0));ctx.globalAlpha=.5*sh.fade;ctx.fillStyle='#020a12';
    ctx.beginPath();ctx.ellipse(0,0,size,size*.32,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(-size*.9,0);ctx.lineTo(-size*1.45,-size*.32+wob*size*.4);ctx.lineTo(-size*1.45,size*.32+wob*size*.4);ctx.fill();
    ctx.restore();
  }
  function drawRings(){
    for(const r of rings){ctx.strokeStyle=`rgba(214,243,255,${.5*r.life})`;ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(r.x,r.y,r.r,r.r*.28,0,0,Math.PI*2);ctx.stroke()}
  }
  function drawBobber(p){
    const y=p.y+Math.sin(time*3)*1.6+(p.dip||0)*14;
    ctx.fillStyle='rgba(155,223,221,.35)';ctx.beginPath();ctx.ellipse(p.x,y+3,9,2.6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f4f6ff';ctx.beginPath();ctx.ellipse(p.x,y,4.5,5,0,0,Math.PI);ctx.fill();
    ctx.fillStyle='#fcafcd';ctx.beginPath();ctx.ellipse(p.x,y,4.5,6,0,Math.PI,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#fcafcd';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(p.x,y-6);ctx.lineTo(p.x,y-14);ctx.stroke();
  }
  function drawLine(tip,end,sag){
    const c={x:(tip.x+end.x)/2,y:(tip.y+end.y)/2+sag};
    ctx.strokeStyle='rgba(220,240,255,.78)';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(tip.x,tip.y);ctx.quadraticCurveTo(c.x,c.y,end.x,end.y);ctx.stroke();
  }
  function drawRod(){
    const b=base(),t=tipAt(S.a),L=rodLen();
    // 줄이 당기는 쪽으로 끝이 숙여지게 휜다
    const nx=-(t.y-b.y)/L,ny=(t.x-b.x)/L,s=ny>0?-1:1;
    const c={x:(b.x+t.x)/2+nx*s*S.bend*L*.22,y:(b.y+t.y)/2+ny*s*S.bend*L*.22};
    const pts=[];for(let i=0;i<=24;i++)pts.push(quadPoint(b,c,t,i/24));
    const width=i=>lerp(9,1.6,i/24);
    ctx.beginPath();
    for(let i=0;i<=24;i++){const p=pts[i],q=pts[Math.min(24,i+1)],o=pts[Math.max(0,i-1)],dx=q.x-o.x,dy=q.y-o.y,l=Math.hypot(dx,dy)||1;const px=p.x-dy/l*width(i)/2,py=p.y+dx/l*width(i)/2;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}
    for(let i=24;i>=0;i--){const p=pts[i],q=pts[Math.min(24,i+1)],o=pts[Math.max(0,i-1)],dx=q.x-o.x,dy=q.y-o.y,l=Math.hypot(dx,dy)||1;ctx.lineTo(p.x+dy/l*width(i)/2,p.y-dx/l*width(i)/2)}
    ctx.closePath();const g=ctx.createLinearGradient(b.x,b.y,t.x,t.y);g.addColorStop(0,'#2c2f3b');g.addColorStop(.25,'#7b5c46');g.addColorStop(1,'#dfb793');ctx.fillStyle=g;ctx.fill();
    // 가이드 링과 릴
    ctx.strokeStyle='#c9d7e3';ctx.lineWidth=1;for(const k of [.45,.62,.78,.9]){const p=quadPoint(b,c,t,k);ctx.beginPath();ctx.arc(p.x,p.y,2.4,0,Math.PI*2);ctx.stroke()}
    const r=quadPoint(b,c,t,.12);ctx.fillStyle='#1b2533';ctx.strokeStyle='#8fa3b5';ctx.lineWidth=2;ctx.beginPath();ctx.arc(r.x-4,r.y+10,13,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#d6f3ff';ctx.beginPath();ctx.moveTo(r.x-4,r.y+10);ctx.lineTo(r.x-4+Math.cos(time*(S.phase==='fight'&&S.jerk>.05?18:0))*10,r.y+10+Math.sin(time*(S.phase==='fight'&&S.jerk>.05?18:0))*10);ctx.stroke();
    return t;
  }
  function drawLeap(){
    const lp=S.leap;if(!lp||!S.img?.complete||!S.img.naturalWidth)return;
    const w=Math.min(W*.42,300)*lp.scale,h=w*.6;
    if(S.glow>0){const g=ctx.createRadialGradient(lp.x,lp.y,0,lp.x,lp.y,w*.9);g.addColorStop(0,`rgba(255,246,220,${.32*S.glow})`);g.addColorStop(1,'rgba(255,246,220,0)');ctx.fillStyle=g;ctx.fillRect(lp.x-w,lp.y-w,w*2,w*2)}
    // 젖은 비늘 위를 지나가는 빛: 물고기 모양 안에만 칠하려고 작은 캔버스에 먼저 그린다
    const off=S.off||(S.off=document.createElement('canvas')),oc=off.getContext('2d');off.width=Math.ceil(w);off.height=Math.ceil(h);
    oc.drawImage(S.img,0,0,w,h);
    if(lp.burst){const k=(time*1.4)%1.6-.3;oc.globalCompositeOperation='source-atop';const sg=oc.createLinearGradient(w*k-30,0,w*k+30,0);sg.addColorStop(0,'rgba(255,255,255,0)');sg.addColorStop(.5,'rgba(255,255,255,.35)');sg.addColorStop(1,'rgba(255,255,255,0)');oc.fillStyle=sg;oc.fillRect(0,0,w,h);oc.globalCompositeOperation='source-over'}
    ctx.save();ctx.translate(lp.x,lp.y);ctx.rotate(lp.rot);ctx.drawImage(off,-w/2,-h/2,w,h);ctx.restore();
  }
  function star(x,y,r,rot){ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.beginPath();for(let i=0;i<8;i++){const rr=i%2?r*.22:r;const a=i*Math.PI/4;i?ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):ctx.moveTo(rr,0)}ctx.closePath();ctx.fill();ctx.restore()}
  function draw(){
    ctx.clearRect(0,0,W,Hh);
    ctx.save();if(S.shake>0)ctx.translate((Math.random()-.5)*10*S.shake,(Math.random()-.5)*6*S.shake);
    drawHeadland();drawShadow();drawRings();
    if(S.bobber)drawBobber(S.bobber);
    const tip=drawRod();
    if(S.phase==='cast'&&S.lure){drawLine(tip,S.lure,S.flight?Math.max(0,24-S.flight.t*30):6);ctx.fillStyle='#fcafcd';ctx.beginPath();ctx.arc(S.lure.x,S.lure.y,3.5,0,Math.PI*2);ctx.fill()}
    else if(S.phase==='cast'&&S.bobber)drawLine(tip,{x:S.bobber.x,y:S.bobber.y-12},Math.hypot(tip.x-S.bobber.x,tip.y-S.bobber.y)*.12);
    else if((S.phase==='fight'||S.phase==='land'&&!S.leap)&&S.hook)drawLine(tip,S.hook,S.slack>0?40*S.slack/.6+8:4);
    else if(S.phase==='land'&&S.leap)drawLine(tip,{x:S.leap.x-Math.min(W*.42,300)*S.leap.scale*.42,y:S.leap.y},6);
    for(const d of drops){ctx.fillStyle=`rgba(225,244,255,${.85*d.life})`;ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,Math.PI*2);ctx.fill()}
    drawLeap();
    for(const s of sparks){ctx.fillStyle=s.c;ctx.globalAlpha=clamp(s.life,0,1)*(.6+.4*Math.sin(time*20+s.rot*9));star(s.x,s.y,s.size*clamp(s.life*1.4,0,1),s.rot);ctx.globalAlpha=1}
    ctx.restore();
  }

  function frame(now){
    if(!alive)return;
    raf=requestAnimationFrame(frame);
    if(document.hidden){last=now;return}
    const elapsed=Math.max(0,(now-last)/1000),dt=Math.min(.05,elapsed);last=now;
    update(dt,elapsed);draw();
    if(drawSea){const k=portrait()?.55:.7;drawSea(Math.round(W*k),Math.round(Hh*k),reduced?12:time,HORIZON,MOON)}
  }
  raf=requestAnimationFrame(frame);

  const wait=fn=>new Promise(res=>{S.done=res;fn()});
  return {
    // 던지기 → 착수 → 입질까지. 끝나면 파이팅 화면으로 넘어간다.
    cast(){
      if(reduced){this.hooked();return Promise.resolve()}
      return wait(()=>{S.phase='cast';S.pt=0;S.flight=null;S.bobber=null;S.bitten=false;S.nibbles=0});
    },
    // 이어하기: 이미 물고기가 걸린 상태로 시작
    hooked(){const L=landing();S.phase='fight';S.pt=0;S.hook={...L};S.hookTo=hookFor(S.progress);S.shadow={on:true,x:L.x,y:L.y+16,vx:0,fade:1,thrash:0};S.bend=.56},
    pull(kind,progress){
      if(S.phase!=='fight')return;
      S.progress=progress;S.hookTo=hookFor(progress);
      if(kind==='success'){S.jerk=.32;splash(S.hook.x,S.hook.y,14,170);say('당겼어요!','good')}
      else if(kind==='warning'){S.jerk=-.12;S.shadow.thrash=1;S.shake=.45;splash(S.hook.x,S.hook.y,30,260);say('도주 경고!','warn')}
      else if(kind==='miss'){S.slack=.6;ring(S.hook.x,S.hook.y,20);say('줄이 느슨해졌어요','miss')}
      else S.jerk=.08;
    },
    land(img,tier,tierName){
      S.img=new Image();S.img.src=img;S.tier=tier;S.tierName=tierName;
      if(reduced)return Promise.resolve();
      return wait(()=>{S.phase='land';S.pt=0;S.leap=null});
    },
    escape(){
      if(reduced)return Promise.resolve();
      return wait(()=>{S.phase='escape';S.pt=0;S.shadow.vx=-(W*.35);S.shadow.thrash=1;splash(S.hook.x,S.hook.y,24,240);S.shake=.3;say('물고기가 도망갔어요','warn')});
    },
    destroy(){alive=false;cancelAnimationFrame(raf);ro.disconnect();S.done?.();S.done=null}
  };
}
