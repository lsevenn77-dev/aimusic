export const MIN_COVER_SECONDS=5;
export const MAX_COVER_SECONDS=1200;
export const MIN_EDIT_SECONDS=.1;

export function validRecordingWindow(range,duration,minimum=MIN_EDIT_SECONDS){
 if(!range||typeof range!=='object')return false;
 const {start,end}=range;
 return Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end<=duration&&end-start>=minimum-1e-7;
}

function intersect(start,end,range){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=range.start||start>=range.end)return null;
 return {s:Math.max(start,range.start)-range.start,e:Math.min(end,range.end)-range.start};
}

// The original indices keep duet assignments aligned even when the first
// or last lyric is partially retained. Timings are relative to the new audio.
export function cropWords(words,range){
 return (words||[]).flatMap((line,index)=>{
  const times=intersect(line.s,line.e??words[index+1]?.s??range.end,range);
  if(!times)return [];
  const timed=line.w?.some(word=>Number.isFinite(word.s)&&Number.isFinite(word.e)&&word.e>word.s);
  const w=timed?line.w.flatMap(word=>{
   const span=intersect(word.s,word.e,range);
   return span?[{...word,...span}]:[];
  }):line.w;
  return w?.length?[{index,line:{...line,...times,w}}]:[];
 });
}

export function cropDuetGuide(guide,indices,range){
 if(!guide)return null;
 const lines=guide.mode==='lyrics'?indices.map(i=>guide.lines[i]):[];
 const activity=guide.activity?.flatMap(interval=>{
  const span=intersect(interval.s,interval.e,range);
  return span?[span]:[];
 });
 return {...guide,lines,...(activity?{activity}:{})};
}
