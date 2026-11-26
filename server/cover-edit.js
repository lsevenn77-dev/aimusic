import {fail,one} from './db.js';
import {isPremium} from './membership.js';
import {parseLrc,serializeLrc} from '../shared/lyrics.js';
import {cropWords,validRecordingWindow,MIN_COVER_SECONDS,MAX_COVER_SECONDS} from '../shared/recording-window.js';

export function readCoverEdit(value){
 try{return value?JSON.parse(value):null;}catch{return null;}
}

export function coverEditMetadata(input,user,original,parentWindow){
 const duration=parentWindow?parentWindow.end-parentWindow.start:original.duration;
 if(input!==undefined&&(!input||typeof input!=='object'||Array.isArray(input)))fail(400,'녹음 편집 정보를 확인해 주세요.');
 const crop=input?.crop;
 const rerecorded=input?.rerecorded===true,tone=input?.tone===true,premium=!!(crop||rerecorded||tone);
 if(premium&&!isPremium(user))fail(403,'프리미엄 편집을 게시하려면 이용권이 필요합니다.');
 let window=parentWindow||null;
 if(crop){
  if(!Number.isFinite(crop.duration)||crop.duration>duration+.16||!validRecordingWindow(crop,crop.duration,MIN_COVER_SECONDS)||crop.end-crop.start>MAX_COVER_SECONDS)fail(400,'게시 구간이 녹음 길이와 일치하는지 확인해 주세요. 5초 이상 선택해야 합니다.');
  const base=parentWindow?.start??0;
  window={start:base+crop.start,end:Math.min(base+crop.end,parentWindow?.end??original.duration)};
  if(window.end-window.start<MIN_COVER_SECONDS-.02)fail(400,'게시 구간은 5초 이상이어야 합니다.');
 }
 return premium||window?{premium,rerecorded,tone,window}:null;
}

export async function coverEditWords(env,originalId,window){
 const job=await one(env,'SELECT words FROM karaoke_jobs WHERE track_id=?',originalId);
 const words=JSON.parse(job?.words||'[]');
 return window?cropWords(words,window):words.map((line,index)=>({index,line}));
}

export async function coverEditLyrics(env,original,window){
 if(!window)return '';
 const words=await coverEditWords(env,original.id,window);
 if(words.length)return serializeLrc(words.map(({line})=>({time:line.s,text:line.w.map(w=>w.t).join(' ')})));
 if(original.lyrics_mode!=='synced'||!original.lyrics)return '';
 try{
  const cues=parseLrc(original.lyrics);
  return serializeLrc(cues.filter(cue=>cue.time>=window.start&&cue.time<window.end).map(cue=>({...cue,time:cue.time-window.start})));
 }catch{return '';}
}
