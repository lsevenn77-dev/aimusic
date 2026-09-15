import {rows,one,run,query,now,id,fail,str,json,rate} from './db.js';
import {requireUser,hash} from './auth.js';
export const GENRES=['K-POP','Ballad','R&B','Hip-Hop','Rock','EDM','City Pop','OST','Instrumental'];
const SELECT=`SELECT t.id,t.title,t.genre,t.tags,t.description,t.ai_tool,t.participation,t.duration,t.created,t.has_cover,t.artist_id,t.producer_id,a.name artist,p.name producer,t.user_id,
 (SELECT count(*) FROM likes l WHERE l.track_id=t.id) likes,
 (SELECT count(*) FROM comments c WHERE c.track_id=t.id) comments,
 (SELECT count(DISTINCT listener||day) FROM listens l WHERE l.track_id=t.id AND l.qualified=1) plays
 FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id`;
export const trackList=(env,where='t.status=\'published\'',args=[],sort='t.created DESC',limit=100)=>rows(env,`${SELECT} WHERE ${where} ORDER BY ${sort} LIMIT ${limit}`,...args);
export async function published(env,tid){const t=await one(env,"SELECT * FROM tracks WHERE id=? AND status='published'",tid);if(!t)fail(404,'공개된 곡을 찾을 수 없습니다.');return t;}
export async function catalogRoute(req,env,path,user){
 const url=new URL(req.url),method=req.method;
 if(path==='/api/catalog'&&method==='GET'){
  const q=(url.searchParams.get('q')||'').slice(0,100),genre=url.searchParams.get('genre'),chart=url.searchParams.get('chart');
  let where="t.status='published'",args=[];
  if(q){where+=' AND (t.title LIKE ? OR a.name LIKE ? OR p.name LIKE ? OR t.genre LIKE ? OR t.tags LIKE ?)';args=Array(5).fill('%'+q+'%');}
  if(genre&&GENRES.includes(genre)){where+=' AND t.genre=?';args.push(genre);}
  let sort='t.created DESC';
  if(chart==='top')sort='(plays+likes*3+comments*2) DESC,t.created DESC';
  if(chart==='rising')sort="(SELECT count(DISTINCT listener) FROM listens l WHERE l.track_id=t.id AND l.qualified=1 AND l.started>unixepoch()-604800) DESC,t.created DESC";
  if(chart==='newcomers')where+=' AND p.created>unixepoch()-2592000 AND (SELECT count(*) FROM follows f WHERE f.kind=\'producer\' AND f.target_id=p.id)<1000';
  return json({tracks:await trackList(env,where,args,sort),artists:await rows(env,`SELECT a.*, (SELECT count(*) FROM follows f WHERE f.kind='artist' AND f.target_id=a.id) followers FROM artists a WHERE EXISTS(SELECT 1 FROM tracks t WHERE t.artist_id=a.id AND t.status='published') ORDER BY created DESC LIMIT 100`),producers:await rows(env,`SELECT p.id,p.name,p.bio,p.created,(SELECT count(*) FROM follows f WHERE f.kind='producer' AND f.target_id=p.id) followers FROM producers p WHERE EXISTS(SELECT 1 FROM tracks t WHERE t.producer_id=p.id AND t.status='published') ORDER BY created DESC LIMIT 100`)});
 }
 let m=path.match(/^\/api\/tracks\/([\w-]+)(?:\/(like|comments))?$/);
 if(m){
  const tid=m[1];await published(env,tid);
  if(!m[2]&&method==='GET')return json({track:(await trackList(env,"t.id=? AND t.status='published'",[tid]))[0]});
  if(m[2]==='like'){
   requireUser(user);
   if(method==='PUT')await run(env,'INSERT OR IGNORE INTO likes(user_id,track_id,created) VALUES(?,?,?)',user.id,tid,now());
   else if(method==='DELETE')await run(env,'DELETE FROM likes WHERE user_id=? AND track_id=?',user.id,tid);else fail(405,'지원하지 않는 요청입니다.');
   return json({ok:true});
  }
  if(m[2]==='comments'){
   if(method==='GET'){
    const sort=url.searchParams.get('sort'),order=sort==='popular'?'likes DESC,c.created DESC':sort==='timeline'?'c.timestamp IS NULL,c.timestamp ASC':'c.created DESC';
    return json({comments:await rows(env,`SELECT c.*,u.name,(c.user_id=t.user_id) creator,(SELECT count(*) FROM comment_likes l WHERE l.comment_id=c.id) likes,(SELECT count(*) FROM comment_likes l WHERE l.comment_id=c.id AND l.user_id=?) liked FROM comments c JOIN users u ON u.id=c.user_id JOIN tracks t ON t.id=c.track_id WHERE c.track_id=? ORDER BY ${order} LIMIT 500`,user?.id||'',tid)});
   }
   if(method==='POST'){
    requireUser(user);await rate(env,'comment:'+user.id,20,3600);const b=await req.json(),text=str(b.body,2000);
    const t=await published(env,tid),timestamp=b.timestamp==null?null:Number(b.timestamp);
    if(timestamp!==null&&(!Number.isFinite(timestamp)||timestamp<0||timestamp>t.duration))fail(400,'곡 안의 시간을 지정해주세요.');
    if(b.parent_id&&!await one(env,'SELECT id FROM comments WHERE id=? AND track_id=? AND parent_id IS NULL',b.parent_id,tid))fail(400,'답글 대상을 찾을 수 없습니다.');
    const cid=id();await run(env,'INSERT INTO comments(id,track_id,user_id,parent_id,body,timestamp,created) VALUES(?,?,?,?,?,?,?)',cid,tid,user.id,b.parent_id||null,text,timestamp,now());return json({id:cid},201);
   }
  }
 }
 m=path.match(/^\/api\/comments\/([\w-]+)(\/like)?$/);
 if(m){
  requireUser(user);const c=await one(env,'SELECT * FROM comments WHERE id=?',m[1]);if(!c)fail(404,'댓글을 찾을 수 없습니다.');await published(env,c.track_id);
  if(m[2]){
   if(method==='PUT')await run(env,'INSERT OR IGNORE INTO comment_likes(user_id,comment_id) VALUES(?,?)',user.id,c.id);
   else if(method==='DELETE')await run(env,'DELETE FROM comment_likes WHERE user_id=? AND comment_id=?',user.id,c.id);else fail(405,'지원하지 않는 요청입니다.');
  }else{
   if(c.user_id!==user.id)fail(403,'내 댓글만 변경할 수 있습니다.');
   if(method==='PATCH'){const b=await req.json();await run(env,'UPDATE comments SET body=?,edited=? WHERE id=?',str(b.body,2000),now(),c.id);}
   else if(method==='DELETE')await run(env,"UPDATE comments SET body='삭제된 댓글입니다.',edited=? WHERE id=?",now(),c.id);
   else fail(405,'지원하지 않는 요청입니다.');
  }return json({ok:true});
 }
 m=path.match(/^\/api\/(artists|producers)\/([\w-]+)(\/follow)?$/);
 if(m){
  const kind=m[1]==='artists'?'artist':'producer';
  const entity=await one(env,`SELECT id,name,bio,created FROM ${m[1]} WHERE id=?`,m[2]);if(!entity)fail(404,'프로필을 찾을 수 없습니다.');
  if(!m[3]&&method==='GET')return json({profile:entity,tracks:await trackList(env,`t.status='published' AND t.${kind}_id=?`,[entity.id]),followers:(await one(env,'SELECT count(*) n FROM follows WHERE kind=? AND target_id=?',kind,entity.id)).n});
  requireUser(user);
  if(method==='PUT')await run(env,'INSERT OR IGNORE INTO follows(user_id,kind,target_id,created) VALUES(?,?,?,?)',user.id,kind,entity.id,now());
  else if(method==='DELETE')await run(env,'DELETE FROM follows WHERE user_id=? AND kind=? AND target_id=?',user.id,kind,entity.id);else fail(405,'지원하지 않는 요청입니다.');
  return json({ok:true});
 }
 if(path==='/api/library'&&method==='GET'){
  requireUser(user);return json({likes:await trackList(env,"t.status='published' AND t.id IN (SELECT track_id FROM likes WHERE user_id=?)",[user.id]),playlists:await rows(env,'SELECT p.*,(SELECT count(*) FROM playlist_tracks pt WHERE pt.playlist_id=p.id) tracks FROM playlists p WHERE user_id=? ORDER BY created DESC',user.id),follows:await rows(env,'SELECT f.*,COALESCE(a.name,p.name) name FROM follows f LEFT JOIN artists a ON f.kind=\'artist\' AND a.id=f.target_id LEFT JOIN producers p ON f.kind=\'producer\' AND p.id=f.target_id WHERE f.user_id=?',user.id)});
 }
 if(path==='/api/history'&&method==='GET'){requireUser(user);return json({tracks:await trackList(env,"t.status='published' AND t.id IN (SELECT track_id FROM listens WHERE user_id=?)",[user.id],`(SELECT MAX(started) FROM listens l WHERE l.track_id=t.id AND l.user_id='${user.id.replaceAll("'",'')}') DESC`)});}
 if(path==='/api/playlists'&&method==='POST'){
  requireUser(user);await rate(env,'playlist:'+user.id,20,86400);const b=await req.json(),pid=id();await run(env,'INSERT INTO playlists(id,user_id,name,is_public,created) VALUES(?,?,?,?,?)',pid,user.id,str(b.name,80),b.is_public===true?1:0,now());return json({id:pid},201);
 }
 m=path.match(/^\/api\/playlists\/([\w-]+)(?:\/tracks\/([\w-]+))?$/);
 if(m){
  const p=await one(env,'SELECT * FROM playlists WHERE id=?',m[1]);if(!p||(!p.is_public&&p.user_id!==user?.id))fail(404,'플레이리스트를 찾을 수 없습니다.');
  if(!m[2]&&method==='GET')return json({playlist:p,tracks:await trackList(env,"t.status='published' AND t.id IN (SELECT track_id FROM playlist_tracks WHERE playlist_id=?)",[p.id],`(SELECT created FROM playlist_tracks pt WHERE pt.track_id=t.id AND pt.playlist_id='${p.id}') ASC`)});
  requireUser(user);if(p.user_id!==user.id)fail(403,'내 플레이리스트만 변경할 수 있습니다.');
  if(m[2]){
   if(method==='PUT'){await published(env,m[2]);await run(env,'INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,created) VALUES(?,?,?)',p.id,m[2],now());}
   else if(method==='DELETE')await run(env,'DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?',p.id,m[2]);else fail(405,'지원하지 않는 요청입니다.');
  }else if(method==='PATCH'){const b=await req.json();await run(env,'UPDATE playlists SET name=?,is_public=? WHERE id=?',str(b.name,80),b.is_public===true?1:0,p.id);}
  else if(method==='DELETE')await run(env,'DELETE FROM playlists WHERE id=?',p.id);else fail(405,'지원하지 않는 요청입니다.');
  return json({ok:true});
 }
 return null;
}
