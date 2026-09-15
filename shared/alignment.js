import {serializeLrc,parseLrc,MAX_LYRICS} from './lyrics.js';
export const LYRIC_LANGUAGES={ko:'한국어',en:'영어',ja:'일본어',zh:'중국어',es:'스페인어',fr:'프랑스어',de:'독일어',pt:'포르투갈어'};
export function plainLyrics(value){
 if(typeof value!=='string'||value.length>6000)throw new Error('자동 싱크용 가사는 최대 6,000자까지 입력해주세요.');
 const lines=value.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n').map(s=>s.trim()).filter(Boolean);
 if(!lines.length||lines.length>200||lines.some(s=>s.length>300))throw new Error('실제로 부르는 가사를 한 줄씩 입력해주세요. 최대 200줄, 한 줄 300자입니다.');
 if(lines.some(s=>/^\[\d{1,3}:/.test(s)||/^\[.*\]$/.test(s)))throw new Error('시간 표시나 [Verse], [Chorus] 같은 구간 이름을 빼고 실제 가사만 입력해주세요. LRC는 직접 싱크 등록을 선택해주세요.');
 return lines.join('\n');
}
export function alignedLrc(source,timings,duration){
 const lines=plainLyrics(source).split('\n');
 if(!Array.isArray(timings)||timings.length!==lines.length||!Number.isFinite(duration)||duration<5||duration>1200)throw new Error('자동 싱크 결과가 가사와 일치하지 않습니다.');
 const cues=[];let previous=-1;
 for(let i=0;i<lines.length;i++){
  const {start,end}=timings[i]||{};
  if(typeof start!=='number'||typeof end!=='number'||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration+.25||start<previous)throw new Error('자동 싱크 시간을 확인할 수 없습니다. 다시 시도해주세요.');
  const from=Math.round(start*1000)/1000,to=Math.min(Math.round(end*1000)/1000,duration);
  if(to<=from)throw new Error('시작 시간을 찾지 못한 가사가 있습니다.');
  cues.push({time:from,text:lines[i]});previous=start;
  const next=i+1<lines.length?timings[i+1]?.start:duration;
  if(next-to>=3)cues.push({time:to,text:''});
 }
 const result=serializeLrc(parseLrc(serializeLrc(cues),duration));if(result.length>MAX_LYRICS)throw new Error('가사가 너무 깁니다. 줄 수를 줄여 다시 시도해주세요.');return result;
}
