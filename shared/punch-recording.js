// Shared lyric boundaries for the browser and the premium authorization API.
export function punchLyricLines(words,duration){
 const total=Number.isFinite(duration)?Math.max(0,duration):0;
 return (Array.isArray(words)?words:[]).map((line,index,all)=>{
  const start=line?.s,words=Array.isArray(line?.w)?line.w:[],text=words.map(w=>w.t).join(' ').trim();
  const ends=[line?.e,...words.map(w=>w.e)].filter(end=>Number.isFinite(end)&&end>start);
  const end=Math.min(total,ends.length?Math.max(...ends):all[index+1]?.s??total);
  return {index,start,end,text};
 }).filter(l=>l.text&&Number.isFinite(l.start)&&l.start>=0&&l.start<total&&l.end>l.start);
}
export function punchLyricRange(words,duration,first,last=first){
 if(!Number.isInteger(first)||!Number.isInteger(last))throw Error('다시 부를 가사를 선택해 주세요.');
 const lines=punchLyricLines(words,duration),a=Math.min(first,last),b=Math.max(first,last);
 if(!lines.some(l=>l.index===a)||!lines.some(l=>l.index===b))throw Error('녹음된 구간 안의 가사를 선택해 주세요.');
 const selected=lines.filter(l=>l.index>=a&&l.index<=b);
 return {start:selected[0].start,end:Math.max(...selected.map(l=>l.end)),first:a,last:b,count:selected.length};
}
export function punchClock(start,now){
 const from=Math.max(0,start-3),recordClock=now+.15+3;
 return {from,t0:recordClock-(start-from),recordClock};
}
export const punchCountdown=(clock,now)=>Math.max(0,Math.min(3,Math.ceil(clock-now)));

// All edit ranges use the backing track's clock. Dry voice playback advances
// by shift, so capture is stored at song position + shift for later mixing.
export function planPunch(range, bounds, lines, prepare, now, latency=0){
 const margin=edge=>{
  const time=range[edge];
  const nearby=lines.some(line=>line.start<time+.35&&line.end>time-.35);
  return nearby?2:1.5;
 };
 const start=Math.max(bounds.start,range.start-margin('start'));
 const end=Math.min(bounds.end,range.end+margin('end'));
 const from=Math.max(0,start-prepare),t0=now+.15+prepare-(start-from);
 return {start,end,from,t0,recordClock:t0+start,captureClock:t0+start+latency,endClock:t0+end+latency};
}

export function capturedPunch(chunks, clock, range, inputRate, rate, shift){
 const length=Math.round((range.end-range.start)*inputRate);
 if(length<=0||!chunks.length)return null;
 const input=new Float32Array(length);
 let next=0;
 for(const {t,d} of chunks){
  const offset=Math.round((t-clock)*inputRate);
  const first=Math.max(next,offset),last=Math.min(length,offset+d.length);
  if(last<=first)continue;
  // A one-frame rounding discrepancy is tolerable. An interrupted input is not.
  if(first>next+1)return null;
  input.set(d.subarray(first-offset,last-offset),first);
  next=last;
 }
 if(next<length-1)return null;
 let peak=0,clipped=0,energy=0;
 for(const value of input){
  if(!Number.isFinite(value))return null;
  const amplitude=Math.abs(value);
  peak=Math.max(peak,amplitude);energy+=value*value;
  if(amplitude>=.995)clipped++;
 }
 if(peak<.003||Math.sqrt(energy/input.length)<.0005)return null;
 const samples=inputRate===rate?input:new Float32Array(Math.floor(input.length*rate/inputRate));
 if(samples!==input)for(let i=0;i<samples.length;i++){
  const position=i*inputRate/rate,first=Math.floor(position),fraction=position-first;
  samples[i]=input[first]*(1-fraction)+(input[Math.min(first+1,input.length-1)])*fraction;
 }
 const first=Math.round((range.start+shift)*rate);
 return {samples,first,rate,range:{start:first/rate-shift,end:(first+samples.length)/rate-shift},clipped:clipped/input.length>.005};
}

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const maxGain=10**(3/20);
function boundaryStats(old,take,index,rate){
 const radius=Math.round(.025*rate),stride=Math.max(1,Math.floor(rate/6000));
 const start=Math.max(0,take.first,index-radius),end=Math.min(old.length,take.first+take.samples.length,index+radius);
 let a=0,b=0,dot=0,delta=0,count=0,priorA=0,priorB=0;
 for(let i=start;i<end;i+=stride){
  const x=old[i],y=take.samples[i-take.first];
  a+=x*x;b+=y*y;dot+=x*y;
  if(count)delta+=Math.abs((x-priorA)-(y-priorB));
  priorA=x;priorB=y;count++;
 }
 count=Math.max(1,count);
 return {a:Math.sqrt(a/count),b:Math.sqrt(b/count),corr:dot/(Math.sqrt(a*b)||1),delta:delta/count};
}

// Periodicity distinguishes a held vowel from breath/noise. A low-energy
// boundary is still preferred even when both candidates have a stable pitch.
function periodicity(samples,index,rate){
 const width=Math.round(rate*.023),begin=index-width;
 if(begin<0||index+width>=samples.length)return 0;
 const step=Math.max(1,Math.floor(rate/6500));
 let best=0;
 for(let lag=Math.round(rate/650);lag<=rate/75;lag+=step){
  let dot=0,a=0,b=0;
  for(let i=begin;i<index;i+=step){
   const x=samples[i],y=samples[i+lag];dot+=x*y;a+=x*x;b+=y*y;
  }
  if(a*b>1e-9)best=Math.max(best,dot/Math.sqrt(a*b));
 }
 return best;
}

function findJoin(old,take,target,outer,direction,rate){
 const step=Math.max(1,Math.round(rate*.005)),candidates=[];
 for(let index=target;direction*(index-outer)<=0;index+=direction*step){
  const at=clamp(index,1,old.length-1),stats=boundaryStats(old,take,at,rate);
  const prior=old[at-1]||0,next=take.samples[at-take.first]||0;
  const level=Math.max(stats.a,stats.b),mismatch=Math.abs(stats.a-stats.b);
  const crossing=Math.abs(prior)+Math.abs(next)+Math.abs(prior-next);
  const score=level+mismatch*.35+stats.delta*.4+crossing*.16+level*(1-stats.corr)*.25
   +Math.abs(at-target)/rate*.055;
  candidates.push({at,stats,score});
 }
 candidates.sort((a,b)=>a.score-b.score);
 let chosen=null;
 for(const candidate of candidates.slice(0,6)){
  const {at,stats}=candidate,energy=Math.min(stats.a,stats.b);
  const held=energy>.01?Math.min(periodicity(old,at,rate),periodicity(take.samples,at-take.first,rate)):0;
  const score=candidate.score+held*energy*.5;
  if(!chosen||score<chosen.score)chosen={...candidate,score,held};
 }
 if(!chosen)return {at:target,frames:0,gain:1,risk:false};
 const {at,stats,held}=chosen,{a,b,corr,delta}=stats,level=Math.max(a,b);
 const seconds=level<.007?.12:Math.min(a,b)<.012?.065:held>.77||corr<-.3?.009:delta>.024?.018:.032;
 const gain=Math.min(a,b)>.006?clamp(a/b,1/maxGain,maxGain):1;
 return {at,frames:Math.max(2,Math.round(seconds*rate)),gain,risk:Math.min(a,b)>.035&&held>.77&&corr<.15};
}

export function analyzePunch(old,take,range,lines,shift){
 const {rate,first,samples}=take,last=Math.min(old.length,first+samples.length);
 const a=Math.max(0,Math.round((range.start+shift)*rate)),b=Math.min(old.length,Math.round((range.end+shift)*rate));
 if(a<first||b>last||b<=a)return null;
 // Look outward only within recorded overlap and stop before neighboring lyrics.
 const left=lines.reduce((value,line)=>line.end<=range.start?Math.max(value,line.end):value,range.start-.42);
 const right=lines.reduce((value,line)=>line.start>=range.end?Math.min(value,line.start):value,range.end+.42);
 const begin=a===0?{at:0,frames:0,gain:1}:findJoin(old,take,a,Math.min(a,Math.max(1,first,Math.round((left+shift)*rate))),-1,rate);
 const finish=b===old.length?{at:b,frames:0,gain:1}:findJoin(old,take,b,Math.max(b,Math.min(last,old.length-1,Math.round((right+shift)*rate))),1,rate);
 const start=begin.at,end=finish.at;
 if(end<=start)return null;
 let voicedBefore=0,voicedAfter=0;
 for(let i=a;i<b;i+=Math.max(1,Math.floor(rate/4000))){
  if(Math.abs(old[i])>.01)voicedBefore++;
  if(Math.abs(samples[i-first])>.006)voicedAfter++;
 }
 const startFade=Math.min(begin.frames,Math.floor((end-start)/2)),endFade=Math.min(finish.frames,Math.floor((end-start)/2));
 const next=new Float32Array(end-start);
 for(let i=start;i<end;i++){
  const position=i-start,fraction=position/Math.max(1,end-start-1);
  const gain=begin.gain*(1-fraction)+finish.gain*fraction;
  // Complementary gains avoid a peak boost when vocals are correlated.
  const wet=Math.min(1,startFade?position/startFade:1,endFade?(end-1-i)/endFade:1);
  const sample=samples[i-first],adjusted=clamp(sample*gain,-.998,.998);
  next[position]=old[i]*(1-wet)+adjusted*wet;
 }
 return {first:start,end,range:{start:start/rate-shift,end:end/rate-shift},samples:next,warning:!!(take.clipped||begin.risk||finish.risk||voicedBefore>rate*.004&&voicedAfter<voicedBefore*.04),
  fades:{start:startFade/rate,end:endFade/rate}};
}
