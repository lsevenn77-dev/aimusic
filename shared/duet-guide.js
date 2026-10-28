// Approximate vocal activity from the isolated dry take, never from the MR mix.
export function detectVocalActivity(samples,rate,offsetMs=0,duration=600){
 const step=Math.max(1,Math.round(rate*.1)),energy=[];let low=0;const alpha=1-Math.exp(-2*Math.PI*150/rate);
 for(let at=0;at<samples.length;at+=step){let sum=0,n=0;for(let i=at;i<Math.min(samples.length,at+step);i++){low+=alpha*(samples[i]-low);const high=samples[i]-low;sum+=high*high;n++;}energy.push(Math.sqrt(sum/Math.max(1,n)));}
 const sorted=energy.slice().sort((a,b)=>a-b),floor=sorted[Math.floor(sorted.length*.2)]||0,threshold=Math.max(.006,Math.min(.025,floor*3.5));
 const out=[];let start=-1,last=-1;for(let i=0;i<=energy.length+3;i++){if(i<energy.length&&energy[i]>=threshold){if(start<0)start=i;last=i;}if(start>=0&&i-last>=3){if(last-start>=1){const s=Math.max(0,start*.1-.08-offsetMs/1000),e=Math.min(duration,(last+1)*.1+.08-offsetMs/1000);if(e>s)out.push({s:+s.toFixed(2),e:+e.toFixed(2)});}start=-1;}}
 return out;
}
export function remainingRanges(activity,duration){const ranges=[];let cursor=0;for(const r of activity||[]){if(r.s-cursor>=.3)ranges.push({s:cursor,e:r.s});cursor=Math.max(cursor,r.e);}if(duration-cursor>=.3)ranges.push({s:cursor,e:duration});return ranges;}
export function lineInterval(words,index,duration){const line=words[index],parts=line?.w||[],end=Math.max(line?.s||0,...parts.map(w=>w.e||0));return {s:line?.s||0,e:Math.min(duration,end>(line?.s||0)?end:words[index+1]?.s||duration)};}
export function linePart(guide,words,index,duration){
 const override=guide?.lines?.[index];if(override)return override;if(!guide||guide.mode==='lyrics')return '';
 if(!guide.activity)return '';const {s,e}=lineInterval(words,index,duration),heard=(guide.activity||[]).reduce((n,r)=>n+Math.max(0,Math.min(e,r.e)-Math.max(s,r.s)),0),ratio=heard/Math.max(.1,e-s);
 return ratio<.2?'B':ratio>.8?'A':'partial';
}
export function partLabel(part,second=false){return part==='A'?(second?'A · 먼저 부른 파트':'A · 내 파트'):part==='B'?(second?'B · 내 파트':'B · 다음 사람'):part==='both'?'함께':part==='partial'?'빈 구간 있음 · 추정':'미지정';}

// Roles are relative to the current singer; A/B remain the stored, gender-neutral slots.
export function lineRole(part,second=false){return part==='A'?(second?'partner':'mine'):part==='B'?(second?'mine':'partner'):part==='both'?'both':part==='partial'?'partial':'';}

// Return only A/B/both slots: timings, lyrics and persisted guide schema stay intact.
// Prefer section and silence boundaries near four bars; without tempo, estimate
// a phrase from timed lyric lengths (or text length for untimed lyrics).
export function assignPhraseParts(words,duration,{bpm,beatsPerBar=4,random=Math.random}={}){
 if(!words.length)return [];
 const tempo=Number(bpm),bars=Number(beatsPerBar),timed=words.some((line,i)=>i&&line.s>words[i-1].s);
 const lengths=words.map((line,i)=>{const r=lineInterval(words,i,duration);return timed?Math.max(.5,Math.min(12,r.e-r.s)):Math.max(1,line.w.map(w=>w.t).join('').length/4);});
 const target=tempo>=40&&tempo<=240?240*(bars>=2&&bars<=12?bars:4)/tempo:Math.max(8,Math.min(16,lengths.reduce((a,b)=>a+b,0)/words.length*3));
 const section=line=>String(line.section||line.label||'').trim();
 const groups=[];let start=0,weight=0;
 for(let i=0;i<words.length;i++){
  if(i>start){const previous=lineInterval(words,i-1,duration),gap=Number(words[i].s)-previous.e,changed=section(words[i])&&section(words[i])!==section(words[i-1]);
   if(changed||gap>=1.5||weight>=target||weight>=target*.65&&Math.abs(weight-target)<=Math.abs(weight+lengths[i]-target)){groups.push({start,end:i,weight});start=i;weight=0;}}
  weight+=lengths[i];
 }
 groups.push({start,end:words.length,weight});
 // Even short songs must leave a turn for each singer.
 if(groups.length===1&&words.length>1){let sum=0,split=1;for(let i=0;i<words.length-1;i++){sum+=lengths[i];split=i+1;if(sum>=weight/2)break;}groups.splice(0,1,{start:0,end:split,weight:sum},{start:split,end:words.length,weight:weight-sum});}
 const result=Array(words.length),total={A:0,B:0};let next=random()<.5?'A':'B';
 for(const group of groups){
  const chorus=/chorus|후렴/i.test(section(words[group.start]));
  const part=chorus&&groups.length>=3&&total.A>0&&total.B>0?'both':Math.abs(total.A-total.B)<.1?next:total.A<total.B?'A':'B';
  for(let i=group.start;i<group.end;i++)result[i]=part;
  if(part!=='both'){total[part]+=group.weight;next=part==='A'?'B':'A';}
 }
 return result;
}
