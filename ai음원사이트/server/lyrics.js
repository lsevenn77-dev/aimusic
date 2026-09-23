import {fail,one,json} from './db.js';
import {parseLrc,serializeLrc,MAX_LYRICS,activeCueIndex} from '../shared/lyrics.js';
import {isPremium} from './membership.js';
import {plainLyrics,LYRIC_LANGUAGES} from '../shared/alignment.js';

export function listenerLyrics(track,user){
 return {lyrics_access:isPremium(user)?'full':'line',lyrics:isPremium(user)?track.lyrics:'',lyrics_access_until:isPremium(user)?user.premium_until:null};
}
export async function lyricsRoute(req,env,path,user){
 const match=path.match(/^\/api\/tracks\/([\w-]+)\/lyrics\/line$/);
 if(!match||req.method!=='GET')return null;
 const at=new URL(req.url).searchParams.get('at'),seconds=Number(at);
 const track=await one(env,"SELECT lyrics,lyrics_mode,duration FROM tracks WHERE id=? AND status='published'",match[1]);
 if(!track)fail(404,'공개된 곡을 찾을 수 없습니다.');
 if(at===null||!at.trim()||!Number.isFinite(seconds)||seconds<0||seconds>track.duration)fail(400,'곡 안의 재생 시간을 지정해주세요.');
 if(!user&&seconds>=60)fail(401,'로그인하면 전체곡 가사를 볼 수 있습니다.');
 if(track.lyrics_mode!=='synced'||!track.lyrics)return json({line:null});
 const cues=parseLrc(track.lyrics),index=activeCueIndex(cues,seconds),cue=cues[index];
 return json({line:{text:(cue?.text||'').replace(/\n/g,' / '),from:cue?.time||0,until:Math.min(cues[index+1]?.time??track.duration,user?track.duration:60),intro:index<0}});
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
