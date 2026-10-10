import {validateDuetGuide} from './duet-guide.js';
import {coverClassificationWrites} from './music-classification.js';
import {one,query,now,id,fail,str,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {VISIBLE} from './catalog.js';
import {MAX_AUDIO} from './storage.js';
import {duetSource,otherPart} from './duets.js';

// A cover is a track of kind 'cover' owned by the singer's profile. It reuses the upload,
// transcoding, playback, like and comment paths; the audio goes to /api/uploads/:id/audio then /complete.
export async function coverRoute(req,env,path,user){
 if(path!=='/api/covers')return null;
 if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
 requireUser(user);await rate(env,'upload-cover:'+user.id,60,60);
 const b=await req.json();
 const mode=b.cover_mode??'solo',parent=b.duet_parent_id||null;
 let part=b.duet_part||'';
 // Existing duet_part values are opaque legacy storage slots, not singer genders.
 if(b.duet_slot!==undefined){
  if(mode==='duet'&&b.duet_slot!==(parent?'second':'first')||mode==='solo'&&b.duet_slot!=='')fail(400,'듀엣 참여 순서를 확인해주세요.');
  part=mode==='solo'?'':parent?'female':'male';
 }
 if(mode==='duet'&&!parent&&!part)part='male';
 if(!['solo','duet'].includes(mode)||mode==='solo'&&(parent||part)||mode==='duet'&&!['male','female'].includes(part))fail(400,'솔로 또는 듀엣과 부를 파트를 선택해주세요.');
 let first=null;
 if(parent){
  if(mode!=='duet'||typeof parent!=='string')fail(400,'듀엣 참여 대상을 확인해주세요.');
  const duet=await duetSource(env,parent,user);first=duet.source;
  if(b.duet_slot==='second')part=otherPart(first.duet_part);
  if(b.original_id!==duet.original.id||part!==otherPart(first.duet_part))fail(400,'원곡과 듀엣의 빈 파트가 일치하지 않아요.');
 }else if(mode==='duet'&&b.duet_consent!==true)fail(400,'다른 사람이 이 녹음에 목소리를 더하는 것에 동의해주세요.');
 if(b.own_voice!==true||b.rights!==true)fail(400,'직접 부른 녹음이고 공개할 권리가 있는지 확인해주세요.');
 if(!['wav','flac','mp3'].includes(b.extension)||!Number.isInteger(b.bytes)||b.bytes<100||b.bytes>MAX_AUDIO)fail(400,'80MB 이하 WAV·FLAC·MP3 파일을 선택해주세요.');
 const original=await one(env,`SELECT t.* FROM tracks t WHERE t.id=? AND t.kind='original' AND t.karaoke_at>0 AND ${VISIBLE()}`,str(b.original_id,80));
 if(!original)fail(404,'커버할 수 있는 원곡을 찾을 수 없습니다. 원곡자가 노래방 · 커버를 허락한 공개 곡만 커버할 수 있어요.');
 const guide=mode==='duet'?(first?first.duet_guide:await validateDuetGuide(env,b.duet_guide,original)):'';
 const description=str(b.description||'',1000,false),writes=[];
 // Every person has one profile; a first cover creates it from the account name.
 let profile=await one(env,'SELECT id FROM producers WHERE user_id=?',user.id);
 if(!profile){profile={id:id()};writes.push(query(env,'INSERT INTO producers(id,user_id,name,bio,created) VALUES(?,?,?,?,?)',profile.id,user.id,(user.name||'AIFECT 이용자').trim().slice(0,60)||'AIFECT 이용자','',now()));}
 const tid=id();
 writes.push(query(env,`INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,description,ai_tool,is_ai,participation,rights_accepted,original_ext,original_bytes,created,kind,original_id,cover_mode,duet_parent_id,duet_part,duet_open,duet_guide)
  VALUES(?,?,?,?,?,?,?,'',0,'보컬',?,?,?,?,'cover',?,?,?,?,?,?)`,tid,user.id,original.artist_id,profile.id,original.title,original.genre,description,now(),b.extension,b.bytes,now(),original.id,mode,parent,part,mode==='duet'&&!first?1:0,guide));
 await env.DB.batch([...writes,...coverClassificationWrites(env,{trackId:tid})]);
 return json({id:tid,producer_id:profile.id},201);
}
