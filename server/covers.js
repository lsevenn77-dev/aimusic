import * as AifectMessages from '../shared/system-messages.js';
import {validateDuetGuide} from './duet-guide.js';
import {coverClassificationWrites} from './music-classification.js';
import {one,query,now,id,fail,str,json,rate} from './db.js';
import {hash,requireUser} from './auth.js';
import {VISIBLE} from './catalog.js';
import {MAX_AUDIO} from './storage.js';
import {duetSource,otherPart} from './duets.js';
import {coverEditMetadata,coverEditLyrics,coverEditWords,readCoverEdit} from './cover-edit.js';
import {cropDuetGuide} from '../shared/recording-window.js';

// A cover is a track of kind 'cover' owned by the singer's profile. It reuses the upload,
// transcoding, playback, like and comment paths; the audio goes to /api/uploads/:id/audio then /complete.
export async function coverRoute(req,env,path,user){
 if(path!=='/api/covers')return null;
 if(req.method!=='POST')fail(405,AifectMessages.unsupportedRequest);
 requireUser(user);await rate(env,'upload-cover:'+user.id,60,60);
 const b=await req.json();
 const mode=b.cover_mode??'solo',parent=b.duet_parent_id||null;
 const publication=mode==='solo'?'solo':parent?'duet_complete':'duet_invitation';
 // New clients confirm publication intent separately from the recorder's remembered mode.
 // Keep old released clients compatible; never guess the recording type from the original song.
 if(b.publish_as!==undefined&&b.publish_as!==publication)fail(400,'선택한 공개 종류와 녹음 정보가 일치하지 않습니다. 공개 종류를 다시 확인해 주세요.');
 let part=b.duet_part||'';
 // Existing duet_part values are opaque legacy storage slots, not singer genders.
 if(b.duet_slot!==undefined){
  if(mode==='duet'&&b.duet_slot!==(parent?'second':'first')||mode==='solo'&&b.duet_slot!=='')fail(400,'듀엣 참여 순서를 확인해 주세요.');
  part=mode==='solo'?'':parent?'female':'male';
 }
 if(mode==='duet'&&!parent&&!part)part='male';
 if(!['solo','duet'].includes(mode)||mode==='solo'&&(parent||part)||mode==='duet'&&!['male','female'].includes(part))fail(400,'솔로 또는 듀엣과 부를 파트를 선택해 주세요.');
 let first=null;
 if(parent){
  if(mode!=='duet'||typeof parent!=='string')fail(400,'듀엣 참여 대상을 확인해 주세요.');
  const duet=await duetSource(env,parent,user);first=duet.source;
  if(b.duet_slot==='second')part=otherPart(first.duet_part);
  if(b.original_id!==duet.original.id||part!==otherPart(first.duet_part))fail(400,'원곡과 듀엣의 빈 파트가 일치하지 않습니다.');
 }else if(mode==='duet'&&b.duet_consent!==true)fail(400,'다른 사람이 이 녹음에 목소리를 더하는 것에 동의해 주세요.');
 if(b.own_voice!==true||b.rights!==true)fail(400,'직접 부른 녹음이고 공개할 권리가 있는지 확인해 주세요.');
 if(!['wav','flac','mp3'].includes(b.extension)||!Number.isInteger(b.bytes)||b.bytes<100||b.bytes>MAX_AUDIO)fail(400,'80MB 이하 WAV·FLAC·MP3 파일을 선택해 주세요.');
 const original=await one(env,`SELECT t.* FROM tracks t WHERE t.id=? AND t.kind='original' AND t.karaoke_at>0 AND ${VISIBLE()}`,str(b.original_id,80));
 if(!original)fail(404,'커버할 수 있는 원곡을 찾을 수 없습니다. 원곡자가 노래방 · 커버를 허락한 공개 곡만 커버할 수 있습니다.');
 const previousWindow=readCoverEdit(first?.recording_edit)?.window;
 const edit=coverEditMetadata(b.recording_edit,user,original,previousWindow),recordingEdit=edit?JSON.stringify(edit):'';
 const lyrics=edit?.window?await coverEditLyrics(env,original,edit.window):'';
 const lyricsMode=lyrics?'synced':'none';
 let guide=mode==='duet'?(first?first.duet_guide:await validateDuetGuide(env,b.duet_guide,original)):'';
 if(guide&&edit?.window&&(!first||b.recording_edit?.crop)){
  const words=await coverEditWords(env,original.id,previousWindow);
  const cropped=await coverEditWords(env,original.id,edit.window);
  const indices=cropped.map(({index})=>words.findIndex(word=>word.index===index));
  const rebase={start:edit.window.start-(previousWindow?.start??0),end:edit.window.end-(previousWindow?.start??0)};
  const next=cropDuetGuide(JSON.parse(guide),indices,rebase);
  if(!first&&next.mode==='lyrics'&&(!next.lines.some(part=>part==='A'||part==='both')||!next.lines.some(part=>part==='B'||part==='both')))fail(400,'두 사람이 부를 가사가 포함되도록 게시 범위를 조절해 주세요.');
  guide=JSON.stringify(next);
 }
 const description=str(b.description||'',1000,false),writes=[];
 // Every person has one profile; a first cover creates it from the account name.
 let profile=await one(env,'SELECT id FROM producers WHERE user_id=?',user.id);
 if(!profile){profile={id:id()};writes.push(query(env,'INSERT INTO producers(id,user_id,name,bio,created) VALUES(?,?,?,?,?)',profile.id,user.id,(user.name||'AIFECT 이용자').trim().slice(0,60)||'AIFECT 이용자','',now()));}
 let tid=id();
 if(b.request_id!==undefined){
  if(typeof b.request_id!=='string'||!/^(?:[0-9a-f-]{36}|draft:[\w:-]{1,240}:\d{1,16})$/i.test(b.request_id))fail(400,'게시 요청을 다시 시작해 주세요.');
  // Stable per owner and recording across a lost create or complete response.
  const digest=await hash('recording:'+user.id+':'+b.request_id);
  tid=[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join('-');
 }
 const result=async()=>{
  const row=await one(env,'SELECT id,user_id,producer_id,original_id,cover_mode,duet_parent_id,status,has_cover,recording_edit FROM tracks WHERE id=?',tid);
  if(!row||row.user_id!==user.id||row.original_id!==original.id||['deleted','hidden','failed'].includes(row.status))fail(409,'작품 상태가 변경되었습니다. 스튜디오에서 확인해 주세요.');
  if(row.recording_edit!==recordingEdit)fail(409,'편집 범위가 변경되었습니다. 게시 설정을 다시 열어 주세요.');
  return json({id:tid,producer_id:row.producer_id,cover_mode:row.cover_mode,duet_parent_id:row.duet_parent_id,publish_as:row.cover_mode==='solo'?'solo':row.duet_parent_id?'duet_complete':'duet_invitation',status:row.status,has_cover:row.has_cover},201);
 };
 const existing=b.request_id&&await one(env,'SELECT id,recording_edit FROM tracks WHERE id=? AND user_id=?',tid,user.id);
 if(existing){
  if(existing.recording_edit!==recordingEdit)fail(409,'편집 범위가 변경되었습니다. 게시 설정을 다시 열어 주세요.');
  await query(env,`UPDATE tracks SET original_bytes=?,original_ext=?,description=?,cover_mode=?,duet_parent_id=?,duet_part=?,duet_open=?,duet_guide=?,lyrics=?,lyrics_mode=? WHERE id=? AND kind='cover' AND original_id=? AND user_id=? AND status='uploading' AND recording_edit=?`,b.bytes,b.extension,description,mode,parent,part,mode==='duet'&&!first?1:0,guide,lyrics,lyricsMode,tid,original.id,user.id,recordingEdit).run();
  return result();
 }
 writes.push(query(env,`INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,description,ai_tool,is_ai,participation,rights_accepted,original_ext,original_bytes,created,kind,original_id,cover_mode,duet_parent_id,duet_part,duet_open,duet_guide,recording_edit,lyrics,lyrics_mode)
  VALUES(?,?,?,?,?,?,?,'',0,'보컬',?,?,?,?,'cover',?,?,?,?,?,?,?,?,?)`,tid,user.id,original.artist_id,profile.id,original.title,original.genre,description,now(),b.extension,b.bytes,now(),original.id,mode,parent,part,mode==='duet'&&!first?1:0,guide,recordingEdit,lyrics,lyricsMode));
 try{await env.DB.batch([...writes,...coverClassificationWrites(env,{trackId:tid})]);}
 catch(error){if(!b.request_id||!await one(env,'SELECT id FROM tracks WHERE id=? AND user_id=?',tid,user.id))throw error;}
 return result();
}
