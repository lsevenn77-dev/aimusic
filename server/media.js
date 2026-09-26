import {validGenre} from '../shared/genres.js';
import {one,rows,run,query,now,id,fail,str,json,rate} from './db.js';
import {requireUser,hash} from './auth.js';
import {published,GENRES,VISIBLE} from './catalog.js';
import {storeImage} from './images.js';
import {studioRoute} from './studio.js';
import {lyricsFields} from './lyrics.js';
import {alignmentInternalRoute,alignmentWrite} from './alignment.js';
import {KARAOKE_TERMS_VERSION} from '../shared/site-info.js';
import {MAX_AUDIO,put,objectResponse,parseRange} from './storage.js';
import {karaokeQueue,karaokeInternalRoute} from './karaoke.js';
export {parseRange};
export async function listener(req,user){return user?.id||await hash((req.headers.get('cf-connecting-ip')||'local')+'|'+(req.headers.get('user-agent')||'')+'|'+new Date().toISOString().slice(0,10));}
export async function mediaRoute(req,env,path,user){
 const method=req.method;
 const studio=await studioRoute(req,env,path,user);if(studio)return studio;
 if(path==='/api/studio'&&method==='GET'){
  requireUser(user);return json({producer:await one(env,'SELECT * FROM producers WHERE user_id=?',user.id),artists:await rows(env,'SELECT a.* FROM artists a JOIN producers p ON a.producer_id=p.id WHERE p.user_id=?',user.id),tracks:await rows(env,`SELECT t.id,t.title,t.status,t.error,t.created,t.duration,t.has_cover,t.cover_version,t.artist_id,t.kind,t.original_id,o.title original_title,o.has_cover original_has_cover,o.cover_version original_cover_version,j.state alignment_state FROM tracks t LEFT JOIN tracks o ON o.id=t.original_id LEFT JOIN lyric_jobs j ON j.track_id=t.id WHERE t.user_id=? AND t.status!='deleted' ORDER BY t.created DESC LIMIT 100`,user.id)});
 }
 if(path==='/api/studio/profile'&&method==='PUT'){
  requireUser(user);const b=await req.json(),p=await one(env,'SELECT id FROM producers WHERE user_id=?',user.id),pid=p?.id||id();
  if(p)await run(env,'UPDATE producers SET name=?,bio=? WHERE id=?',str(b.name,60),str(b.bio||'',1000,false),p.id);
  else await run(env,'INSERT INTO producers(id,user_id,name,bio,created) VALUES(?,?,?,?,?)',pid,user.id,str(b.name,60),str(b.bio||'',1000,false),now());
  return json({ok:true,id:pid});
 }
 if(path==='/api/uploads'&&method==='POST'){
  requireUser(user);await rate(env,'upload:'+user.id,20,86400);
  const b=await req.json(),title=str(b.title,120),artistName=str(b.artist,60),producerName=str(b.producer,60),tool=str(b.ai_tool,100),lyricData=lyricsFields(b);
  if(b.rights!==true||b.is_ai!==true)fail(400,'AI 제작 여부와 음원 권리 보유 확인이 필요합니다.');
  if(b.karaoke!==true)fail(400,'노래방 MR 제공과 커버 허락에 동의해야 업로드할 수 있습니다.');
  if(!validGenre(b.genre)||!['wav','flac','mp3'].includes(b.extension)||!Number.isInteger(b.bytes)||b.bytes<100||b.bytes>MAX_AUDIO)fail(400,'지원하는 장르와 80MB 이하 WAV·FLAC·MP3 파일을 선택해주세요.');
  let producer=await one(env,'SELECT * FROM producers WHERE user_id=?',user.id);
  if(!producer){producer={id:id()};await run(env,'INSERT INTO producers(id,user_id,name,bio,created) VALUES(?,?,?,?,?)',producer.id,user.id,producerName,str(b.producer_bio||'',1000,false),now());}
  let artist=b.artist_id?await one(env,'SELECT id FROM artists WHERE producer_id=? AND id=?',producer.id,str(b.artist_id,80)):await one(env,'SELECT id FROM artists WHERE producer_id=? AND name=?',producer.id,artistName);
  if(b.artist_id&&!artist)fail(404,'내 AI 아티스트를 선택해주세요.');
  if(!artist){artist={id:id()};await run(env,'INSERT INTO artists(id,producer_id,name,bio,genre,created) VALUES(?,?,?,?,?,?)',artist.id,producer.id,artistName,str(b.artist_bio||'',1000,false),b.genre,now());}
  const tid=id(),jobWrites=lyricData.auto?await alignmentWrite(env,tid,user.id,lyricData):[];
  await env.DB.batch([query(env,'INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,tags,description,ai_tool,participation,rights_accepted,original_ext,original_bytes,created,lyrics,lyrics_mode,karaoke_terms,karaoke_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',tid,user.id,artist.id,producer.id,title,b.genre,str(b.tags||'',300,false),str(b.description||'',4000,false),tool,str(b.participation||'',100,false),now(),b.extension,b.bytes,now(),lyricData.lyrics,lyricData.mode,KARAOKE_TERMS_VERSION,now()),...jobWrites]);
  return json({id:tid,artist_id:artist.id,producer_id:producer.id},201);
 }
 const removal=path.match(/^\/api\/uploads\/([\w-]+)$/);
 if(removal&&method==='DELETE'){
  requireUser(user);const track=await one(env,'SELECT id,status FROM tracks WHERE id=? AND user_id=?',removal[1],user.id);if(!track)fail(404,'내 업로드를 찾을 수 없습니다.');
  // Keep the ledger's track reference; deletion is irreversible through all publishing routes.
  await env.DB.batch([
   query(env,"UPDATE tracks SET status='deleted',lease_token=NULL,lease_until=0,error=NULL WHERE id=? AND user_id=?",track.id,user.id),
   query(env,'DELETE FROM lyric_jobs WHERE track_id=?',track.id),
   query(env,'DELETE FROM karaoke_jobs WHERE track_id=?',track.id)
  ]);return json({ok:true});
 }
 let m=path.match(/^\/api\/uploads\/([\w-]+)\/(audio|cover|complete|retry|unpublish|karaoke)$/);
 if(m){
  requireUser(user);const t=await one(env,'SELECT * FROM tracks WHERE id=? AND user_id=?',m[1],user.id);if(!t)fail(404,'내 업로드를 찾을 수 없습니다.');
  if(t.status==='deleted')fail(404,'삭제된 곡입니다.');const action=m[2];
  if(action==='karaoke'&&method==='POST'){
   if(t.kind==='cover')fail(400,'커버곡은 노래방 MR 대상이 아닙니다.');
   // Tracks uploaded before the clause existed opt in here; an existing consent keeps its original version and time.
   if((await req.json().catch(()=>({}))).accept!==true)fail(400,'노래방 MR 제공과 커버 허락에 동의해주세요.');
   if(!t.karaoke_at){
    const at=now();await run(env,"UPDATE tracks SET karaoke_terms=?,karaoke_at=? WHERE id=? AND karaoke_at=0",KARAOKE_TERMS_VERSION,at,t.id);
    const writes=await karaokeQueue(env,{...t,karaoke_at:at});if(writes.length)await env.DB.batch(writes);
   }
   return json({ok:true});
  }
  if(action==='unpublish'&&method==='POST'){await run(env,"UPDATE tracks SET status='hidden' WHERE id=?",t.id);return json({ok:true});}
  if(action==='retry'&&method==='POST'){
   if(!['failed','hidden'].includes(t.status)||!await env.BUCKET.head(`original/${t.id}.${t.original_ext}`))fail(409,'다시 처리할 원본이 없습니다.');
   await run(env,"UPDATE tracks SET status='queued',error=NULL,attempts=0,lease_until=0 WHERE id=?",t.id);return json({ok:true});
  }
  if(t.status!=='uploading')fail(409,'이미 제출한 업로드입니다.');
  if(action==='audio'&&method==='PUT'){
   if(Number(req.headers.get('content-length'))!==t.original_bytes)fail(400,'원본 파일 용량이 일치하지 않습니다.');
   await put(env,`original/${t.id}.${t.original_ext}`,req,MAX_AUDIO,'application/octet-stream');return json({ok:true});
  }
  if(action==='cover'&&method==='PUT'){
   const image=await storeImage(req,env,'track',t.id);await run(env,'UPDATE tracks SET has_cover=1,cover_version=?,cover_type=? WHERE id=?',image.version,image.type,t.id);return json({ok:true});
  }
  if(action==='complete'&&method==='POST'){
   const original=await env.BUCKET.head(`original/${t.id}.${t.original_ext}`);if(original?.size!==t.original_bytes)fail(409,'음원 파일 업로드를 먼저 완료해주세요.');
   await run(env,"UPDATE tracks SET status='queued' WHERE id=? AND status='uploading'",t.id);return json({ok:true});
  }
 }
 m=path.match(/^\/media\/([\w-]+)\/(cover|preview|stream)$/);
 if(m&&['GET','HEAD'].includes(method)){
  const kind=m[2],t=kind==='cover'?await one(env,`SELECT t.*,${VISIBLE()} visible FROM tracks t WHERE t.id=? AND t.status!='deleted' AND (${VISIBLE()} OR t.user_id=?)`,m[1],user?.id||''):await published(env,m[1]);if(!t)fail(404,'커버를 찾을 수 없습니다.');if(kind==='stream')requireUser(user);
  if(kind==='cover'&&t.cover_version)return objectResponse(req,env,`images/track/${t.id}/${t.cover_version}`,t.cover_type,!!t.visible);
  return objectResponse(req,env,`${kind}/${t.id}.${kind==='cover'?'jpg':'m4a'}`,kind==='cover'?'image/jpeg':'audio/mp4',kind==='cover'&&!!t.visible);
 }
 m=path.match(/^\/media\/(artist|producer|banner)\/([\w-]+)$/);
 if(m&&['GET','HEAD'].includes(method)){
  const kind=m[1],owner=kind==='artist'?'artist':'producer',p=await one(env,kind==='artist'?'SELECT a.*,p.user_id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=?':'SELECT * FROM producers WHERE id=?',m[2]);
  const version=kind==='banner'?p?.banner_version:p?.image_version;
  if(!version)fail(404,'프로필 이미지를 찾을 수 없습니다.');
  const isPublic=!!await one(env,`SELECT t.id FROM tracks t WHERE t.${owner}_id=? AND ${VISIBLE()} LIMIT 1`,p.id);
  if(!isPublic&&p.user_id!==user?.id)fail(404,'프로필 이미지를 찾을 수 없습니다.');
  return objectResponse(req,env,`images/${kind}/${p.id}/${version}`,kind==='banner'?p.banner_type:p.image_type,isPublic);
 }
 m=path.match(/^\/api\/playback\/([\w-]+)$/);
 if(m&&method==='POST'){
  const t=await published(env,m[1]),lid=id(),who=await listener(req,user);await rate(env,'play:'+who,150,3600);
  await run(env,'INSERT INTO listens(id,track_id,listener,user_id,started,day) VALUES(?,?,?,?,?,?)',lid,t.id,who,user?.id||null,now(),new Date().toISOString().slice(0,10));
  return json({id:lid,src:`/media/${t.id}/${user?'stream':'preview'}`,preview:!user,duration:t.duration});
 }
 m=path.match(/^\/api\/listens\/([\w-]+)$/);
 if(m&&method==='PATCH'){
  const l=await one(env,'SELECT l.*,t.duration FROM listens l JOIN tracks t ON t.id=l.track_id WHERE l.id=?',m[1]);
  if(!l||l.listener!==await listener(req,user))fail(404,'재생 세션이 만료됐습니다.');
  const b=await req.json(),seconds=Number(b.seconds),max=Math.min(now()-l.started+2,l.duration,user?7200:60);
  if(!Number.isFinite(seconds)||seconds<l.seconds||seconds>max)fail(400,'잘못된 재생 기록입니다.');
  await run(env,'UPDATE listens SET seconds=?,qualified=? WHERE id=?',seconds,seconds>=Math.min(30,l.duration*.6)?1:0,l.id);return json({ok:true});
 }
 return null;
}
export async function internalRoute(req,env,path){
 if(!env.TRANSCODER_TOKEN||req.headers.get('authorization')!==`Bearer ${env.TRANSCODER_TOKEN}`)fail(401,'인증이 필요합니다.');
 const alignment=await alignmentInternalRoute(req,env,path);if(alignment)return alignment;
 const karaoke=await karaokeInternalRoute(req,env,path);if(karaoke)return karaoke;
 if(path==='/internal/health'&&req.method==='GET'){
  await one(env,'SELECT 1 healthy');await env.BUCKET.head('__aifect_healthcheck__');return json({database:true,storage:true});
 }
 if(path==='/internal/jobs/claim'&&req.method==='POST'){
  await run(env,"UPDATE tracks SET status='failed',error='변환 시간이 초과됐습니다. 다시 시도해주세요.' WHERE status='processing' AND lease_until<? AND attempts>=3",now());
  const token=id();const job=await query(env,"UPDATE tracks SET status='processing',lease_until=?,lease_token=?,attempts=attempts+1 WHERE id=(SELECT id FROM tracks WHERE (status='queued' OR (status='processing' AND lease_until<?)) AND attempts<3 ORDER BY created LIMIT 1) RETURNING id,original_ext,CASE WHEN cover_version='' THEN has_cover ELSE 0 END has_cover,lease_token",now()+900,token,now()).first();return json({job});
 }
 const m=path.match(/^\/internal\/jobs\/([\w-]+)\/(original|cover-source|stream|preview|cover|finish|fail)$/);if(!m)fail(404,'경로를 찾을 수 없습니다.');
 const t=await one(env,"SELECT * FROM tracks WHERE id=? AND status='processing' AND lease_token=? AND lease_until>?",m[1],req.headers.get('x-job-token')||'',now());if(!t)fail(409,'변환 작업이 만료됐습니다.');const action=m[2];
 if(['original','cover-source'].includes(action)&&req.method==='GET')return objectResponse(req,env,action==='original'?`original/${t.id}.${t.original_ext}`:`cover-source/${t.id}`,'application/octet-stream');
 if(['stream','preview','cover'].includes(action)&&req.method==='PUT'){
  await put(env,`${action}/${t.id}.${action==='cover'?'jpg':'m4a'}`,req,MAX_AUDIO,action==='cover'?'image/jpeg':'audio/mp4');return json({ok:true});
 }
 if(action==='finish'&&req.method==='POST'){
  const b=await req.json(),duration=Number(b.duration);if(!Number.isFinite(duration)||duration<5||duration>1200)fail(400,'음원은 5초 이상 20분 이하여야 합니다.');
  for(const kind of ['stream','preview',...(t.has_cover&&!t.cover_version?['cover']:[])])if(!await env.BUCKET.head(`${kind}/${t.id}.${kind==='cover'?'jpg':'m4a'}`))fail(409,'변환 파일이 누락됐습니다.');
  await run(env,"UPDATE tracks SET status='published',duration=?,error=NULL,lease_until=0,lease_token=NULL WHERE id=? AND lease_token=?",duration,t.id,t.lease_token);
  // A fresh transcode means fresh audio, so any earlier MR no longer matches it.
  const writes=await karaokeQueue(env,{...t,status:'published',duration},{mr:'auto'});if(writes.length)await env.DB.batch(writes);
  return json({ok:true});
 }
 if(action==='fail'&&req.method==='POST'){await run(env,"UPDATE tracks SET status='failed',error='파일을 변환하지 못했습니다. 음원 형식과 파일을 확인해주세요.',lease_until=0 WHERE id=? AND lease_token=?",t.id,t.lease_token);return json({ok:true});}
 fail(405,'지원하지 않는 요청입니다.');
}
