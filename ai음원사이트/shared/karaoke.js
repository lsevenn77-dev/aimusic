import {parseLrc} from './lyrics.js';
import {plainLyrics} from './alignment.js';

// Separation runs on the shared server one song at a time; long tracks would hold the queue for too long.
export const KARAOKE_MAX_SECONDS=600;

// The creator's own synced lyrics are the only word source: returns the sung lines, or '' when there is nothing to align.
export function karaokeLyrics(track){
 if(track.lyrics_mode!=='synced'||!track.lyrics)return '';
 try{
  // Imported LRC often contains section headings; they are not sung words.
  const lines=parseLrc(track.lyrics,track.duration||1200).flatMap(c=>c.text.split('\n')).map(s=>s.trim()).filter(s=>s&&!/^\[[^\]]+\]$/.test(s));
  return plainLyrics(lines.join('\n'));
 }catch{return '';}
}

const squash=s=>s.replace(/\s+/g,'');
// Worker output → stored JSON. Every line must spell exactly the creator's words, in order, inside the song.
export function karaokeWords(lyrics,lines,duration){
 const expected=lyrics.split('\n');
 if(!Array.isArray(lines)||lines.length!==expected.length)throw new Error('단어 싱크 결과가 가사와 일치하지 않습니다.');
 const limit=duration+.25,out=[];let previous=0;
 const time=v=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>limit)throw new Error('단어 싱크 시간을 확인할 수 없습니다.');return Math.round(Math.min(v,duration)*1000)/1000;};
 for(let i=0;i<lines.length;i++){
  const words=lines[i]?.words;
  if(!Array.isArray(words)||!words.length||words.length>200)throw new Error('단어 싱크 결과가 가사와 일치하지 않습니다.');
  const w=words.map(x=>{if(typeof x?.t!=='string'||x.t.length>300)throw new Error('단어 싱크 결과가 가사와 일치하지 않습니다.');const s=time(x.s),e=time(x.e);if(e<s)throw new Error('단어 싱크 시간을 확인할 수 없습니다.');return {t:x.t,s,e};});
  if(squash(w.map(x=>x.t).join(''))!==squash(expected[i]))throw new Error('단어 싱크 결과가 가사와 일치하지 않습니다.');
  if(w[0].s<previous)throw new Error('단어 싱크 순서를 확인할 수 없습니다.');
  for(let j=1;j<w.length;j++)if(w[j].s<w[j-1].s)throw new Error('단어 싱크 순서를 확인할 수 없습니다.');
  previous=w[0].s;out.push({s:w[0].s,e:w.at(-1).e,w});
 }
 return JSON.stringify(out);
}
