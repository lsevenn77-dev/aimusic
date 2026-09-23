export const MAX_LYRICS=12000;
export function timestamp(seconds){
 const ms=Math.round(seconds*1000),minutes=Math.floor(ms/60000),rest=ms%60000;
 return `${String(minutes).padStart(2,'0')}:${String(Math.floor(rest/1000)).padStart(2,'0')}.${String(rest%1000).padStart(3,'0')}`;
}
export function parseLrc(input,maxSeconds=1200){
 if(typeof input!=='string'||input.length>MAX_LYRICS)throw new Error('가사는 최대 12,000자까지 등록할 수 있습니다.');
 const lines=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n'),entries=[];let offset=0;
 for(const line of lines){const m=/^\[offset:([+-]?\d+)\]$/i.exec(line.trim());if(m)offset=Number(m[1])/1000;}
 for(let i=0;i<lines.length;i++){
  let line=lines[i].trim();if(!line||/^\[(ar|al|ti|by|re|ve|length|offset):[^\]]*\]$/i.test(line))continue;
  const times=[];let m;
  while((m=/^\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/.exec(line))){times.push(Number(m[1])*60+Number(m[2])+Number('0.'+(m[3]||'0'))+offset);line=line.slice(m[0].length);}
  if(!times.length)throw new Error(`${i+1}번째 줄의 시작 시간을 지정해주세요. 예: [00:12.500] 가사`);
  const text=line.trim();if(text.length>500)throw new Error('한 줄의 가사는 500자 이하로 입력해주세요.');
  for(const value of times){const time=Math.round(value*1000)/1000;if(!Number.isFinite(time)||time<0||time>maxSeconds)throw new Error('가사 시간은 곡의 재생 범위 안으로 지정해주세요.');entries.push({time,text});}
  if(entries.length>500)throw new Error('가사는 최대 500줄까지 등록할 수 있습니다.');
 }
 if(!entries.some(c=>c.text))throw new Error('시간을 지정한 가사를 한 줄 이상 입력해주세요.');
 entries.sort((a,b)=>a.time-b.time);
 const cues=[];for(const entry of entries){const last=cues.at(-1);if(last?.time===entry.time){if(entry.text)last.text=last.text?last.text+'\n'+entry.text:last.text;}else cues.push({...entry});}
 return cues;
}
export function serializeLrc(cues){return cues.flatMap(c=>(c.text||'').split('\n').map(text=>`[${timestamp(c.time)}]${text}`)).join('\n');}
export function activeCueIndex(cues,seconds){
 if(!Number.isFinite(seconds)||seconds<0)return -1;
 let lo=0,hi=cues.length-1,found=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(cues[mid].time<=seconds){found=mid;lo=mid+1;}else hi=mid-1;}return found;
}
