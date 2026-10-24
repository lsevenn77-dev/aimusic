// Shared lyric boundaries for the browser and the premium authorization API.
export function punchLyricLines(words,duration){
 const total=Number.isFinite(duration)?Math.max(0,duration):0;
 return (Array.isArray(words)?words:[]).map((line,index,all)=>{
  const start=Number(line.s),text=(line.w||[]).map(w=>w.t).join(' ').trim();
  const ends=[line.e,...(line.w||[]).map(w=>w.e)].filter(Number.isFinite);
  const end=Math.min(total,ends.length?Math.max(...ends):Number(all[index+1]?.s)||total);
  return {index,start,end,text};
 }).filter(l=>l.text&&Number.isFinite(l.start)&&l.start>=0&&l.start<total&&l.end>l.start);
}
export function punchLyricRange(words,duration,first,last=first){
 if(!Number.isInteger(first)||!Number.isInteger(last))throw Error('다시 부를 가사를 선택해주세요.');
 const lines=punchLyricLines(words,duration),a=Math.min(first,last),b=Math.max(first,last);
 if(!lines.some(l=>l.index===a)||!lines.some(l=>l.index===b))throw Error('녹음된 구간 안의 가사를 선택해주세요.');
 const selected=lines.filter(l=>l.index>=a&&l.index<=b);
 return {start:selected[0].start,end:Math.max(...selected.map(l=>l.end)),first:a,last:b,count:selected.length};
}
export function punchClock(start,now){
 const from=Math.max(0,start-3),recordClock=now+.15+3;
 return {from,t0:recordClock-(start-from),recordClock};
}
export const punchCountdown=(clock,now)=>Math.max(0,Math.min(3,Math.ceil(clock-now)));
