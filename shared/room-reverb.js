// Matches the native wet-only room; changing the room never delays the direct vocal.
const clamp=(n,lo,hi)=>Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):lo;
export const roomGain=amount=>clamp(amount,0,1)*.5;
export function restoreRoomMix(mix={}){
 return {...mix,room:clamp((Number.isFinite(mix.room)?mix.room:.16)*(mix.roomScaleVersion>=2?1:2),0,1),roomScaleVersion:2};
}
class Comb{
 constructor(rate,seconds){this.data=new Float32Array(Math.round(rate*seconds));this.at=0;this.damp=0;}
 process(x,feedback){const y=this.data[this.at];this.damp=y*.65+this.damp*.35;this.data[this.at]=x+this.damp*feedback;if(++this.at===this.data.length)this.at=0;return y;}
}
class AllPass{
 constructor(rate,seconds){this.data=new Float32Array(Math.round(rate*seconds));this.at=0;}
 process(x){const delayed=this.data[this.at],y=delayed-x;this.data[this.at]=x+delayed*.5;if(++this.at===this.data.length)this.at=0;return y;}
}
export class RoomReverb{
 constructor(rate){
  if(!Number.isFinite(rate)||rate<8000||rate>192000)throw new RangeError('Invalid sample rate');
  this.delay=new Float32Array(Math.round(rate*.012));this.at=0;this.low=0;this.high=0;
  this.lowCoefficient=1-Math.exp(-2*Math.PI*140/rate);this.highCoefficient=1-Math.exp(-2*Math.PI*5500/rate);
  this.combs=[.0297,.0371,.0411,.0437].map(t=>new Comb(rate,t));this.diffusers=[.005,.0017].map(t=>new AllPass(rate,t));
 }
 process(input,size=.5){
  if(!Number.isFinite(input))input=0;
  this.low+=(input-this.low)*this.lowCoefficient;this.high+=(input-this.low-this.high)*this.highCoefficient;
  const delayed=this.delay[this.at];this.delay[this.at]=this.high;if(++this.at===this.delay.length)this.at=0;
  let wet=0;for(const c of this.combs)wet+=c.process(delayed,.57+clamp(size,0,1)*.2);
  wet*=.25;for(const d of this.diffusers)wet=d.process(wet);return wet;
 }
}
const impulses=new Map();
export function roomImpulse(rate,size=.5){
 const key=rate+':'+size;if(impulses.has(key))return impulses.get(key);
 const room=new RoomReverb(rate),data=new Float32Array(Math.ceil(rate*3));
 for(let i=0;i<data.length;i++)data[i]=room.process(i===0?1:0,size);
 if(impulses.size>=4)impulses.delete(impulses.keys().next().value);impulses.set(key,data);return data;
}
