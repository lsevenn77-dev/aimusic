import {fail,json} from './db.js';
import {parseLrc,serializeLrc,MAX_LYRICS,activeCueIndex} from '../shared/lyrics.js';
import {published} from './catalog.js';
import {isPremium} from './membership.js';
import {plainLyrics,LYRIC_LANGUAGES} from '../shared/alignment.js';

export function listenerLyrics(track,user){
 return {has_lyrics_text:!!track.lyrics?.trim(),lyrics_access:isPremium(user)?'full':'line',lyrics:isPremium(user)?track.lyrics:'',lyrics_access_until:isPremium(user)?user.premium_until:null};
}
export async function lyricsRoute(req,env,path,user){
 const match=path.match(/^\/api\/tracks\/([\w-]+)\/lyrics\/(line|text)$/);
 if(!match||req.method!=='GET')return null;
 const detail=await published(env,match[1]);
 const source=detail.kind==='cover'?await published(env,detail.original_id):detail;
 // Only published track lyrics are readable. Alignment job drafts stay private.
 let cues=[];
 if(source.lyrics_mode==='synced'&&source.lyrics){
  try{cues=parseLrc(source.lyrics);}catch{/* Older text can be readable without a complete time map. */}
 }
 if(match[2]==='text'){
  const lines=cues.length?cues.map(c=>c.text):source.lyrics?.trim()?source.lyrics.split(/\r\n?|\n/).map(line=>line.replace(/^(?:\[\d{1,3}:[0-5]\d(?:[.:]\d{1,3})?\])+/g,'')):[];
  return json({lines,synced:cues.length>0});
 }
 const at=new URL(req.url).searchParams.get('at'),seconds=Number(at);
 const track={...source,duration:detail.duration};
 if(at===null||!at.trim()||!Number.isFinite(seconds)||seconds<0||seconds>track.duration)fail(400,'곡 안의 재생 시간을 지정해주세요.');
 if(!user&&seconds>=60)fail(401,'로그인하면 전체곡 가사를 볼 수 있습니다.');
 if(!cues.length)return json({line:null});
 const index=activeCueIndex(cues,seconds),cue=cues[index];
 return json({lines:cues.slice(Math.max(0,index-1),Math.max(0,index)+2).filter(c=>user||c.time<60).map(c=>({time:c.time,text:c.text,active:c===cue})),line:{index,text:(cue?.text||'').replace(/\n/g,' / '),from:cue?.time||0,until:Math.min(cues[index+1]?.time??track.duration,user?track.duration:60),intro:index<0}});
}
export function lyricsFields(body,existing={}){
 const mode=body.lyrics_mode??existing.lyrics_mode??'none',value=body.lyrics??existing.lyrics??'';
 if(mode==='auto'){
  try{const source=plainLyrics(body.lyrics_source),language=body.lyrics_language||'ko';if(!Object.hasOwn(LYRIC_LANGUAGES,language))throw new Error('가사 언어를 선택해주세요.');return {mode:existing.lyrics_mode||'none',lyrics:existing.lyrics||'',source,language,auto:true};}catch(e){fail(400,e.message);}
 }
 if(mode==='none')return {mode,lyrics:''};
 if(mode!=='synced')fail(400,'가사 등록 방식을 선택해주세요.');
 try{const lyrics=serializeLrc(parseLrc(value,existing.duration||1200));if(lyrics.length>MAX_LYRICS)throw new Error('시간을 포함한 가사는 최대 12,000자까지 등록할 수 있습니다.');return {mode,lyrics};}
 catch(e){fail(400,e.message);}
}
