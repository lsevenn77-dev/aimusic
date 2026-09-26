import {validGenre} from '../shared/genres.js';
import {one,run,query,str,fail,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {GENRES} from './catalog.js';
import {storeImage} from './images.js';
import {lyricsFields} from './lyrics.js';
import {alignmentStatus,alignmentWrite} from './alignment.js';
import {karaokeQueue,karaokeStatus} from './karaoke.js';

export async function studioRoute(req,env,path,user){
 const m=path.match(/^\/api\/studio\/(artists|producers|tracks)\/([\w-]+)(\/image|\/banner)?$/);if(!m)return null;
 requireUser(user);const [,,entityId]=m,table=m[1],kind={artists:'artist',producers:'producer',tracks:'track'}[table];
 const entity=await one(env,table==='artists'?'SELECT a.* FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=? AND p.user_id=?':`SELECT * FROM ${table} WHERE id=? AND user_id=?`,entityId,user.id);
 if(!entity||(table==='tracks'&&entity.status==='deleted'))fail(404,'내 스튜디오 항목을 찾을 수 없습니다.');
 if(m[3]){
  if(req.method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
  await rate(env,'image:'+user.id,60,3600);
  if(m[3]==='/banner'){
   // The wide image at the top of a person's profile; only people (producers) have one.
   if(table!=='producers')fail(404,'대표 이미지는 프로필에만 등록할 수 있습니다.');
   const banner=await storeImage(req,env,'banner',entityId);
   await run(env,'UPDATE producers SET banner_version=?,banner_type=? WHERE id=?',banner.version,banner.type,entityId);
   return json({ok:true,version:banner.version});
  }
  const image=await storeImage(req,env,kind,entityId);
  if(table==='tracks')await run(env,'UPDATE tracks SET has_cover=1,cover_version=?,cover_type=? WHERE id=?',image.version,image.type,entityId);
  else await run(env,`UPDATE ${table} SET image_version=?,image_type=? WHERE id=?`,image.version,image.type,entityId);
  return json({ok:true,version:image.version});
 }
 if(req.method==='GET')return json({profile:entity,...(table==='tracks'?{alignment:await alignmentStatus(env,entity.id),karaoke:await karaokeStatus(env,entity.id)}:{})});
 if(req.method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
 const b=await req.json();
 if(table==='tracks'&&entity.kind==='cover'){
  // A cover takes its title, genre and credits from the original; the singer edits the note and artwork.
  await run(env,'UPDATE tracks SET description=? WHERE id=?',str(b.description||'',1000,false),entityId);
  return json({ok:true,id:entityId});
 }
 if(table==='tracks'){
  const lyricData=lyricsFields(b,entity);
  if(!validGenre(b.genre))fail(400,'장르를 선택해주세요.');
  if(!await one(env,'SELECT id FROM artists WHERE id=? AND producer_id=?',str(b.artist_id,80),entity.producer_id))fail(404,'내 AI 아티스트를 선택해주세요.');
  const jobWrites=await alignmentWrite(env,entityId,user.id,lyricData,b);
  const guard=b.lyrics_job_id?" AND EXISTS(SELECT 1 FROM lyric_jobs WHERE track_id=tracks.id AND id=? AND state='ready')":'';
  await env.DB.batch([query(env,'UPDATE tracks SET title=?,genre=?,tags=?,description=?,ai_tool=?,participation=?,artist_id=?,lyrics=?,lyrics_mode=? WHERE id=?'+guard,str(b.title,120),b.genre,str(b.tags||'',300,false),str(b.description||'',4000,false),str(b.ai_tool,100),str(b.participation||'',100,false),b.artist_id,lyricData.lyrics,lyricData.mode,entityId,...(b.lyrics_job_id?[b.lyrics_job_id]:[])),...jobWrites]);
  if(b.lyrics_job_id&&!await one(env,"SELECT id FROM lyric_jobs WHERE track_id=? AND id=? AND state='applied'",entityId,b.lyrics_job_id))fail(409,'자동 싱크 결과가 변경됐습니다. 최신 결과를 다시 불러와주세요.');
  // Changed lyrics need new word timings; the MR itself is kept.
  const karaoke=await karaokeQueue(env,await one(env,'SELECT * FROM tracks WHERE id=?',entityId));if(karaoke.length)await env.DB.batch(karaoke);
 }else{
  const name=str(b.name,60),bio=str(b.bio||'',1000,false);
  if(table==='artists'){
   if(!validGenre(b.genre))fail(400,'장르를 선택해주세요.');
   await run(env,'UPDATE artists SET name=?,bio=?,genre=? WHERE id=?',name,bio,b.genre,entityId);
  }else await run(env,'UPDATE producers SET name=?,bio=? WHERE id=?',name,bio,entityId);
 }
 return json({ok:true,id:entityId});
}
