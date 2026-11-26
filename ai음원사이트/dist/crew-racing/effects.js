// Canvas effects, baked once per game page.
function stamp(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'));
  return canvas;
}
function softSpot(ctx,x,y,r,stops) {
  const fill=ctx.createRadialGradient(x,y,r*.06,x,y,r);
  for (const [at,color] of stops) fill.addColorStop(at,color);
  ctx.fillStyle=fill; ctx.fillRect(x-r,y-r,r*2,r*2);
}
const smokeStamp=stamp(128,128,ctx=>{
  // Overlapping, off-centre lobes keep rotating puffs from reading as round lights.
  const lobes=[[51,75,33],[80,68,32],[41,49,24],[67,41,27],[85,45,18],[53,62,30],[67,57,24]];
  for (const [x,y,r] of lobes) softSpot(ctx,x,y,r,[
    [0,'rgba(240,239,255,.80)'],[.42,'rgba(213,211,231,.68)'],
    [.76,'rgba(171,167,197,.36)'],[1,'rgba(160,158,182,0)']
  ]);
});
export const jetStamp=stamp(96,192,ctx=>{
  // Paint a soft outer plume, a forked cyan flame, then its hottest white core.
  for(let y=0;y<190;y++) {
    const t=y/190, width=34*(1-t)**.76+2, mid=48+Math.sin(t*16)*t*4;
    const grad=ctx.createLinearGradient(mid-width,0,mid+width,0);
    const opacity=(1-t)**.72;
    const fringe=t>.58?'118,113,255':'41,204,255';
    grad.addColorStop(0,'transparent');
    grad.addColorStop(.18,'rgba('+fringe+','+opacity*.50+')');
    grad.addColorStop(.40,'rgba(52,255,225,'+opacity*.92+')');
    grad.addColorStop(.50,'rgba(225,255,248,'+opacity+')');
    grad.addColorStop(.60,'rgba(52,255,225,'+opacity*.92+')');
    grad.addColorStop(.82,'rgba('+fringe+','+opacity*.50+')');
    grad.addColorStop(1,'transparent');
    ctx.fillStyle=grad;ctx.fillRect(mid-width,y,2*width,1);
  }
});

// The fallback camera follows the vehicle. Keep recent wheel samples in road coordinates
// so smoke and rubber continue travelling out of view when the driver releases the turn.
export function createCanvasWheelTrail() {
  const samples=Array.from({length:32},()=>({time:-10}));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let lastState, next=0, head=0, strip=0, wasDrifting=false;
  return function drawTrail(ctx,state,carWidth,carY,carX) {
    if(state!==lastState) {
      for(const sample of samples) sample.time=-10;
      lastState=state; next=0; wasDrifting=false;
    }
    if(state.drift && !wasDrifting) {strip++; next=0;}
    wasDrifting=state.drift;
    if(state.drift && state.t>=next) {
      Object.assign(samples[head],{time:state.t,x:state.x,tilt:state.tilt,z:state.z,strip});
      head=(head+1)%samples.length; next=state.t+.035;
    }
    ctx.save();
    for(const side of [-1,1]) {
      ctx.beginPath();
      let previous=-1;
      for(let i=0;i<samples.length;i++) {
        const sample=samples[(head+i)%samples.length], age=state.t-sample.time;
        if(age<0 || age>.7) continue;
        const travel=(state.z-sample.z)/3500;
        const x=carX+carWidth*(side*.33+(sample.x-state.x)*1.2-sample.tilt*.085);
        const y=carY+travel*carWidth;
        if(previous===sample.strip)ctx.lineTo(x,y);else ctx.moveTo(x,y);
        previous=sample.strip;
      }
      ctx.lineWidth=carWidth*.055; ctx.strokeStyle='#0b0914c9'; ctx.stroke();
      if(reduced.matches)continue;
      for(let i=0;i<samples.length;i+=2){
        const index=(head+i)%samples.length,p=samples[index],age=state.t-p.time;
        if(age<0 || age>.65)continue;
        const spread=age*(side*.42-p.tilt*.48), travel=(state.z-p.z)/5500;
        const x=carX+carWidth*(side*.33+(p.x-state.x)*1.2-p.tilt*.085+spread);
        const y=carY+carWidth*(travel-age*.48), size=carWidth*(.30+age*1.1);
        ctx.globalAlpha=.76*(1-age/.65);ctx.drawImage(smokeStamp,x-size/2,y-size*.68,size,size);
      }
      ctx.globalAlpha=1;
    }
    ctx.restore();
  };
}
