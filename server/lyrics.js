import {fail} from './db.js';
import {parseLrc,serializeLrc,MAX_LYRICS} from '../shared/lyrics.js';
export function lyricsFields(body,existing={}){
 const mode=body.lyrics_mode??existing.lyrics_mode??'none',value=body.lyrics??existing.lyrics??'';
 if(mode==='none')return {mode,lyrics:''};
 if(mode!=='synced')fail(400,'가사 등록 방식을 선택해주세요.');
 try{const lyrics=serializeLrc(parseLrc(value,existing.duration||1200));if(lyrics.length>MAX_LYRICS)throw new Error('시간을 포함한 가사는 최대 12,000자까지 등록할 수 있습니다.');return {mode,lyrics};}
 catch(e){fail(400,e.message);}
}
