import {RoomReverb,roomGain,restoreRoomMix} from './room-reverb.js';
const thresholds=[0,.004,.008,.016,.032];
const clamp=(x,a,b)=>Number.isFinite(x)?Math.max(a,Math.min(b,x)):a;
export const vocalPresets=[
 {id:'original',name:'원음',description:'울림과 음색 보정 없이 담백하게'},
 {id:'karaoke',name:'노래방',description:'익숙한 에코와 풍성한 울림'},
 {id:'studio',name:'스튜디오',description:'또렷한 목소리와 짧고 부드러운 울림'},
 {id:'hall',name:'홀',description:'넓은 공간에서 부르는 듯한 긴 울림'}
];
const customValues=m=>({echo:clamp(m.echo??0,0,.65),room:clamp(m.room??0,0,1),size:clamp(m.size??.5,0,1),tone:clamp(m.tone??0,0,1),noise:Math.round(clamp(m.noise??0,0,4))});
export function editVocalMix(mix,key,value){
 const next={...mix,[key]:value};if(['echo','room','size','tone'].includes(key))next.preset='custom';
 if(next.preset==='custom')next.custom=customValues(next);return next;
}
export function presetMix(mix,id,strength=.5){
 if(mix.preset==='custom')mix={...mix,custom:customValues(mix)};
 if(id==='custom'){const custom=customValues(mix.custom||mix);return {...mix,...custom,custom,preset:'custom',roomScaleVersion:2};}
 if(!vocalPresets.some(p=>p.id===id))return {...mix,preset:'custom'};
 const a=clamp(strength,0,1),p={original:[0,0,.5,0],karaoke:[.24,.65,.55,.65],studio:[.025,.3,.15,1],hall:[.07,.9,.95,.7]}[id];
 return {...mix,preset:id,strength:a,echo:p[0]*a,room:p[1]*a,size:p[2],tone:p[3]*a,roomScaleVersion:2};
}
export const defaultVocalMix=()=>presetMix({offset:80,voice:1,mr:.8,noise:2},'studio',.5);
export function restoreVocalMix(mix={}){
 const m=restoreRoomMix(mix);if(m.custom)m.custom=customValues(m.custom);
 // Existing custom drafts keep their exact effect values, including noise off.
 return {...m,preset:vocalPresets.some(p=>p.id===m.preset)?m.preset:'custom',strength:clamp(m.strength??.5,0,1),tone:clamp(m.tone??0,0,1),size:clamp(m.size??.5,0,1),noise:Math.round(clamp(m.noise??0,0,4))};
}
// RBJ Butterworth high-pass, two sections. Coefficients are precomputed off the audio path.
class HighPass {
 constructor(rate,hz){const w=2*Math.PI*hz/rate,c=Math.cos(w),alpha=Math.sin(w)/Math.SQRT2,a0=1+alpha;this.b0=(1+c)/2/a0;this.b1=-(1+c)/a0;this.a1=-2*c/a0;this.a2=(1-alpha)/a0;this.z1=0;this.z2=0;}
 process(x){const y=this.b0*x+this.z1;this.z1=this.b1*x-this.a1*y+this.z2;this.z2=this.b0*x-this.a2*y;return y;}
}
export class NoiseCleaner {
 constructor(rate){
  this.filters=[65,80,100,120].map(h=>[new HighPass(rate,h),new HighPass(rate,h)]);
  this.attack=1-Math.exp(-1/(rate*.002));this.release=1-Math.exp(-1/(rate*.12));this.up=1-Math.exp(-1/(rate*.003));this.down=1-Math.exp(-1/(rate*.07));
  this.lowCoefficient=1-Math.exp(-2*Math.PI*90/rate);this.rumbleAttack=1-Math.exp(-1/(rate*.001));this.rumbleRelease=1-Math.exp(-1/(rate*.07));
  this.low=0;this.lowEnvelope=0;this.envelope=0;this.gain=1;this.rumbleGain=1;this.blend=0;
 }
 process(x,level){
  level=Math.round(clamp(level,0,4));let filtered=x;
  // Keep each filter warm across live mode changes; no buffer allocation or look-ahead.
  for(let i=0;i<4;i++){const f=this.filters[i],y=f[1].process(f[0].process(x));if(i===level-1)filtered=y;}
  this.low+=(x-this.low)*this.lowCoefficient;
  this.lowEnvelope+=(Math.abs(this.low)-this.lowEnvelope)*this.attack;
  const a=Math.abs(filtered);this.envelope+=(a-this.envelope)*(a>this.envelope?this.attack:this.release);
  const threshold=thresholds[level],ratio=threshold?Math.min(1,this.envelope/threshold):1;
  const target=.005+.995*ratio*ratio;
  this.gain+=(target-this.gain)*(target>this.gain?this.up:this.down);
  // Loud low-frequency handling noise can open a conventional noise gate. Attenuate only
  // when it dominates the vocal band; this is not speech/music source separation.
  const rumble=level>=2&&this.lowEnvelope>.04&&this.lowEnvelope>this.envelope*2.5?Math.max(.16,this.envelope/(this.lowEnvelope*.8)):1;
  this.rumbleGain+=(rumble-this.rumbleGain)*(rumble<this.rumbleGain?this.rumbleAttack:this.rumbleRelease);
  this.blend+=((level?1:0)-this.blend)*this.up;
  return x+(filtered*this.gain*this.rumbleGain-x)*this.blend;
 }
}
export class VocalTone {
 constructor(rate){this.low=0;this.high=0;this.envelope=0;this.amount=0;this.lowC=1-Math.exp(-2*Math.PI*250/rate);this.highC=1-Math.exp(-2*Math.PI*3500/rate);this.attack=1-Math.exp(-1/(rate*.008));this.release=1-Math.exp(-1/(rate*.12));this.smooth=1-Math.exp(-1/(rate*.015));}
 process(x,amount){
  this.amount+=(clamp(amount,0,1)-this.amount)*this.smooth;
  this.low+=(x-this.low)*this.lowC;this.high+=(x-this.high)*this.highC;
  const tone=x-this.low*.22+(x-this.high)*.10,a=Math.abs(tone);
  this.envelope+=(a-this.envelope)*(a>this.envelope?this.attack:this.release);
  const gain=this.envelope>.18?Math.pow(.18/this.envelope,.6):1;
  return x+(tone*gain*1.18-x)*this.amount;
 }
}
export class VocalProcessor {
 constructor(rate,mix={}){this.noise=new NoiseCleaner(rate);this.tone=new VocalTone(rate);this.room=new RoomReverb(rate);this.echo=new Float32Array(Math.round(rate*.235));this.at=0;this.echoLevel=0;this.roomLevel=0;this.size=.5;this.ramp=1-Math.exp(-1/(rate*.015));this.update(mix);}
 update(m){this.mix={echo:clamp(m.echo??0,0,.65),room:clamp(m.room??0,0,1),size:clamp(m.size??.5,0,1),tone:clamp(m.tone??0,0,1),noise:Math.round(clamp(m.noise??0,0,4))};}
 process(input){
  const m=this.mix,dry=this.tone.process(this.noise.process(Number.isFinite(input)?clamp(input,-1,1):0,m.noise),m.tone);
  this.echoLevel+=(m.echo-this.echoLevel)*this.ramp;this.roomLevel+=(roomGain(m.room)-this.roomLevel)*this.ramp;this.size+=(m.size-this.size)*this.ramp;
  const delayed=this.echo[this.at];this.echo[this.at]=dry+delayed*.32;if(++this.at===this.echo.length)this.at=0;
  return dry+delayed*this.echoLevel+this.room.process(dry,this.size)*this.roomLevel;
 }
}
export function renderVocals(input,rate,mix){const processor=new VocalProcessor(rate,mix),out=new Float32Array(input.length);for(let i=0;i<input.length;i++)out[i]=processor.process(input[i]);return out;}
