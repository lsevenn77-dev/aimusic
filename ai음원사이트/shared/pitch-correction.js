// Offline monophonic vocal correction. Analysis uses a YIN difference function;
// synthesis repositions pitch-synchronous grains without resampling their contents.
// Musical gestures, unvoiced sounds and the original take remain intact. No model,
// source recording, or third-party DSP implementation is bundled here.
const ANALYSIS_RATE=8000,HOP=160,WINDOW=256,MAX_LAG=114;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=a=>{a.sort((x,y)=>x-y);return a[a.length>>1];};
export const correctionLevel=v=>[1,2].includes(Number(v))?Number(v):0;

export function detectPitch(frame,rate=ANALYSIS_RATE){
 const maxLag=Math.min(Math.floor(rate/70),Math.floor(frame.length/2)-1),minLag=Math.max(2,Math.floor(rate/1000)),size=frame.length-maxLag;
 let energy=0,mean=0;for(let i=0;i<frame.length;i++)mean+=frame[i];mean/=frame.length;
 for(let i=0;i<frame.length;i++)energy+=(frame[i]-mean)**2;
 if(energy/frame.length<.000004)return null;
 const diff=new Float64Array(maxLag+1);let cumulative=0,candidate=0;
 for(let tau=1;tau<=maxLag;tau++){
  let sum=0;for(let j=0;j<size;j++){const delta=frame[j]-frame[j+tau];sum+=delta*delta;}
  cumulative+=sum;diff[tau]=cumulative?sum*tau/cumulative:1;
  if(tau>minLag&&diff[tau-1]<.12&&diff[tau]>=diff[tau-1]){candidate=tau-1;break;}
 }
 if(!candidate)return null;
 const y0=diff[candidate-1],y1=diff[candidate],y2=diff[candidate+1],denominator=y0-2*y1+y2;
 const lag=candidate+(denominator?clamp((y0-y2)/(2*denominator),-.5,.5):0),hz=rate/lag;
 return hz>=70&&hz<=1000?{hz,confidence:1-y1}:null;
}
function downsample(input,rate){
 const size=Math.ceil(input.length*ANALYSIS_RATE/rate),out=new Float32Array(size),ratio=rate/ANALYSIS_RATE;
 // Box integration suppresses high harmonics before pitch analysis; the output
 // recording is synthesized from the full-band original, never this downsample.
 for(let n=0;n<size;n++){const a=n*ratio,b=Math.min(input.length,(n+1)*ratio);let sum=0;for(let j=Math.floor(a);j<b;j++)sum+=input[j]*(Math.min(b,j+1)-Math.max(a,j));out[n]=sum/Math.max(1,b-a);}
 return out;
}
export function analyzeVocalPitch(input,rate,onProgress=()=>{}){
 const small=downsample(input,rate),frames=[],frame=new Float32Array(WINDOW+MAX_LAG),half=Math.floor(frame.length/2);
 for(let at=0;at<small.length;at+=HOP){
  for(let j=0;j<frame.length;j++)frame[j]=small[at+j-half]||0;
  const detected=detectPitch(frame),hz=detected?.hz||0;
  frames.push({sample:at*rate/ANALYSIS_RATE,hz,note:hz?69+12*Math.log2(hz/440):0,confidence:detected?.confidence||0});
  if(frames.length%40===0)onProgress(Math.floor(65*at/small.length));
 }
 return frames;
}
function correctionCurve(frames,level){
 const raw=new Float32Array(frames.length),amount=level===1?.45:.72;
 for(let i=0;i<frames.length;i++){
  const f=frames[i];if(!f.hz||f.confidence<.9)continue;
  const nearby=frames.slice(Math.max(0,i-6),i+7).filter(v=>v.hz&&v.confidence>=.9&&Math.abs(v.note-f.note)<.65).map(v=>v.note);
  if(nearby.length<7)continue;
  const center=median(nearby),spread=median(nearby.map(n=>Math.abs(n-center))),error=Math.round(center)-center;
  // Never drag a bend between notes to a new note, or fix a large wrong note.
  if(spread>.22||Math.abs(error)>.46||Math.abs(error)<.035||Math.abs(f.note-center)>.45)continue;
  raw[i]=clamp(error*amount,-.32,.32);
 }
 const smooth=new Float32Array(raw.length);
 for(let i=0;i<raw.length;i++){
  if(!frames[i].hz)continue;let value=0,weight=0;
  for(let j=Math.max(0,i-3);j<=Math.min(raw.length-1,i+3);j++){const w=4-Math.abs(i-j);value+=raw[j]*w;weight+=w;}
  smooth[i]=value/weight;
 }
 return smooth;
}
function frameAt(frames,sample,rate){return frames[Math.min(frames.length-1,Math.max(0,Math.round(sample/(rate*.02))))];}
function interpolate(input,position){const i=Math.floor(position),fraction=position-i;return (input[i]||0)*(1-fraction)+(input[i+1]||0)*fraction;}
function peakNear(input,predicted,radius){
 let best=clamp(Math.round(predicted),0,input.length-1),value=-Infinity;
 const start=Math.max(1,Math.ceil(predicted-radius)),end=Math.min(input.length-2,Math.floor(predicted+radius));
 for(let i=start;i<=end;i++)if(input[i]>value){value=input[i];best=i;}
 return best;
}
export function correctVocalPitch(input,rate,level,onProgress=()=>{}){
 if(!(input instanceof Float32Array)||!Number.isFinite(rate)||rate<8000||rate>96000||input.length>rate*600)throw new Error('음정 보정은 10분 이하의 녹음에서 사용할 수 있어요.');
 if(!input.every(Number.isFinite))throw new Error('녹음 데이터를 확인하지 못했어요.');
 level=correctionLevel(level);const output=input.slice();
 if(!level||input.length<rate*.15){onProgress(100);return {samples:output,correctedSeconds:0};}
 const frames=analyzeVocalPitch(input,rate,onProgress),curve=correctionCurve(frames,level);
 let corrected=0;
 for(let first=0;first<frames.length;){
  if(!frames[first].hz){first++;continue;}
  let last=first+1;
  while(last<frames.length&&last-first<500&&frames[last].hz&&Math.abs(frames[last].note-frames[last-1].note)<2)last++;
  const start=Math.max(0,Math.round(frames[first].sample)),end=Math.min(input.length,Math.round((frames[last-1].sample)+rate*.01));
  const active=curve.subarray(first,last).some(v=>Math.abs(v)>.004);
  if(end-start>=rate*.16&&active){
   const marks=[],period=rate/frames[first].hz;
   let mark=peakNear(input,start+period,period*.5);
   while(mark<end-period){
    marks.push(mark);const p=rate/frameAt(frames,mark,rate).hz;
    if(!Number.isFinite(p)||p<=0)break;
    const next=peakNear(input,mark+p,p*.22);if(next<=mark)break;mark=next;
   }
   if(marks.length>=5){
    const sum=new Float32Array(end-start),weight=new Float32Array(end-start);let sourceIndex=1,target=marks[1];
    while(target<marks.at(-2)){
     while(sourceIndex<marks.length-2&&Math.abs(marks[sourceIndex+1]-target)<Math.abs(marks[sourceIndex]-target))sourceIndex++;
     const center=marks[sourceIndex],left=center-marks[sourceIndex-1],right=marks[sourceIndex+1]-center;
     // No resampling inside a grain: vowel/formant detail keeps its original scale.
     for(let sample=Math.ceil(target-left);sample<=Math.floor(target+right);sample++){
      const relative=sample-target,p=relative<0?left:right,w=.5+.5*Math.cos(Math.PI*relative/p),index=sample-start;
      if(index>=0&&index<sum.length){sum[index]+=interpolate(input,center+relative)*w;weight[index]+=w;}
     }
     const fi=clamp(Math.round(target/(rate*.02)),first,last-1),shift=2**(curve[fi]/12),p=rate/frames[fi].hz;
     target+=p/shift;
    }
    const fade=rate*.025,begin=marks[1],finish=marks.at(-2);
    for(let i=0;i<sum.length;i++){
     const at=start+i,blend=clamp(Math.min((at-begin)/fade,(finish-at)/fade),0,1);
     if(weight[i]>.2&&blend>0){output[at]=input[at]*(1-blend)+sum[i]/weight[i]*blend;if(blend===1)corrected++;}
    }
   }
  }
  first=last;onProgress(65+Math.floor(34*last/frames.length));
 }
 onProgress(100);return {samples:output,correctedSeconds:corrected/rate};
}
