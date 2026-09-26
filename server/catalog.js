import {removeComment} from './comment-moderation.js';
import {rows,one,run,query,now,id,fail,str,json,rate} from './db.js';
import {requireUser,hash} from './auth.js';
import {discoveryRoute,playlistSummaries} from './discovery.js';
import {isPremium,playlistLimit,activePlaylistSQL,requireActivePlaylist} from './membership.js';
import {listenerLyrics} from './lyrics.js';
import {profileGifts} from './gifts.js';
import {GENRES,validGenre} from '../shared/genres.js';
export {GENRES};
// A cover is public only while its original is public and still offered for karaoke (terms: hiding the original hides its covers).
export const VISIBLE=(t='t')=>`(${t}.status='published' AND (${t}.original_id IS NULL OR EXISTS(SELECT 1 FROM tracks v WHERE v.id=${t}.original_id AND v.status='published' AND v.karaoke_at>0)))`;
// A song can be sung once its MR and word timings are built and its creator still offers it for karaoke.
export const SINGABLE=(t='t')=>`(${t}.kind='original' AND ${t}.karaoke_at>0 AND EXISTS(SELECT 1 FROM karaoke_jobs k WHERE k.track_id=${t}.id AND k.state='ready' AND k.mr_ready=1 AND k.words_state IN ('ready','attention')))`;
// Covers keep the original's AI artist in artist_id; their performer is the uploader's profile.
const SELECT=`SELECT t.id,t.title,t.genre,t.tags,t.description,t.lyrics_mode,t.ai_tool,t.participation,t.duration,t.created,t.has_cover,t.cover_version,t.artist_id,t.producer_id,(SELECT state FROM lyric_jobs WHERE track_id=t.id AND state!='cancelled') alignment_state,
 CASE WHEN t.kind='cover' THEN p.name||' · 커버' ELSE a.name END artist,p.name producer,t.user_id,t.kind,t.original_id,(t.kind='original' AND t.karaoke_at>0) accepts_covers,
 o.title original_title,o.has_cover original_has_cover,o.cover_version original_cover_version,a.name original_artist,o.producer_id original_producer_id,op.name original_producer,
 (SELECT count(*) FROM likes l WHERE l.track_id=t.id) likes,
 (SELECT count(*) FROM comments c WHERE c.track_id=t.id AND c.deleted_at=0) comments,
 (SELECT count(*) FROM tracks cv WHERE cv.original_id=t.id AND ${VISIBLE('cv')}) covers,
 (SELECT count(DISTINCT listener||day) FROM listens l WHERE l.track_id=t.id AND l.qualified=1) plays,
 (SELECT COALESCE(sum(g.gold),0) FROM gifts g WHERE g.track_id=t.id) gift_gold
 FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id LEFT JOIN tracks o ON o.id=t.original_id LEFT JOIN producers op ON op.id=o.producer_id`;
export const trackList=(env,where=VISIBLE(),args=[],sort='t.created DESC',limit=100)=>rows(env,`${SELECT} WHERE ${where} ORDER BY ${sort} LIMIT ${limit}`,...args);
export async function published(env,tid){const t=await one(env,`SELECT t.* FROM tracks t WHERE t.id=? AND ${VISIBLE()}`,tid);if(!t)fail(404,'공개된 곡을 찾을 수 없습니다.');return t;}
const COVER_SORTS={popular:'likes DESC,plays DESC,t.created DESC',gifts:'gift_gold DESC,likes DESC,t.created DESC',plays:'plays DESC,likes DESC,t.created DESC',recent:'t.created DESC'};
export async function catalogRoute(req,env,path,user){
 const url=new URL(req.url),method=req.method;const discovery=await discoveryRoute(req,env,path,user);if(discovery)return discovery;
 if(path==='/api/community'&&method==='GET'){
  const kind=url.searchParams.get('kind'),following=url.searchParams.get('following')==='1';
  let where=VISIBLE(),args=[];
  if(kind){if(!['cover','original'].includes(kind))fail(400,'곡 종류를 확인해주세요.');where+=' AND t.kind=?';args.push(kind);}
  if(following){requireUser(user);where+=" AND EXISTS(SELECT 1 FROM follows f WHERE f.user_id=? AND ((f.kind='producer' AND f.target_id=t.producer_id) OR (f.kind='artist' AND f.target_id=t.artist_id)))";args.push(user.id);}
  return json({tracks:await trackList(env,where,args,'t.created DESC',60)});
 }
 if(path==='/api/catalog'&&method==='GET'){
  const q=(url.searchParams.get('q')||'').slice(0,100),genre=url.searchParams.get('genre'),chart=url.searchParams.get('chart');
  let where=VISIBLE()+" AND t.kind='original'",args=[];
  if(q){where+=' AND (t.title LIKE ? OR a.name LIKE ? OR p.name LIKE ? OR t.genre LIKE ? OR t.tags LIKE ?)';args=Array(5).fill('%'+q+'%');}
  if(genre&&validGenre(genre)){where+=' AND t.genre=?';args.push(genre);}
  let sort='t.created DESC';
  if(chart==='top')sort='(plays+likes*3+comments*2) DESC,t.created DESC';
  if(chart==='rising')sort="(SELECT count(DISTINCT listener) FROM listens l WHERE l.track_id=t.id AND l.qualified=1 AND l.started>unixepoch()-604800) DESC,t.created DESC";
  if(chart==='newcomers')where+=' AND p.created>unixepoch()-2592000 AND (SELECT count(*) FROM follows f WHERE f.kind=\'producer\' AND f.target_id=p.id)<1000';
  const section=url.searchParams.get('section')||'all';
  if(!['all','tracks','artists','producers'].includes(section))fail(400,'목록 종류를 확인해주세요.');
  const requested=Number(url.searchParams.get('limit')||100),limit=Number.isFinite(requested)?Math.max(1,Math.min(100,Math.trunc(requested))):100;
  const loaders={
   tracks:()=>trackList(env,where,args,sort,limit),
   artists:()=>rows(env,`SELECT a.*, (SELECT count(*) FROM follows f WHERE f.kind='artist' AND f.target_id=a.id) followers FROM artists a WHERE EXISTS(SELECT 1 FROM tracks t WHERE t.artist_id=a.id AND t.kind='original' AND t.status='published') ORDER BY created DESC LIMIT ${limit}`),
   producers:()=>rows(env,`SELECT p.id,p.name,p.bio,p.created,p.image_version,(SELECT count(*) FROM follows f WHERE f.kind='producer' AND f.target_id=p.id) followers FROM producers p WHERE EXISTS(SELECT 1 FROM tracks t WHERE t.producer_id=p.id AND ${VISIBLE()}) ORDER BY created DESC LIMIT ${limit}`)
  };
  const sections=section==='all'?Object.keys(loaders):[section];
  return json(Object.fromEntries(await Promise.all(sections.map(async key=>[key,await loaders[key]()]))));
 }
 let m=path.match(/^\/api\/tracks\/([\w-]+)(?:\/(like|comments|covers))?$/);
 if(m){
  const tid=m[1],detail=await published(env,tid);
  if(!m[2]&&method==='GET')return json({track:{...(await trackList(env,`t.id=? AND ${VISIBLE()}`,[tid]))[0],...listenerLyrics(detail,user),covers:(await one(env,`SELECT count(*) n FROM tracks t WHERE t.original_id=? AND ${VISIBLE()}`,tid)).n,karaoke_ready:!!await one(env,`SELECT 1 FROM tracks t WHERE t.id=? AND ${SINGABLE()}`,tid)}});
  if(m[2]==='covers'){
   if(method!=='GET')fail(405,'지원하지 않는 요청입니다.');
   const sort=url.searchParams.get('sort')||'popular';if(!Object.hasOwn(COVER_SORTS,sort))fail(400,'정렬 기준을 확인해주세요.');
   return json({covers:await trackList(env,`t.original_id=? AND ${VISIBLE()}`,[tid],COVER_SORTS[sort],100),sort,accepts_covers:detail.kind==='original'&&detail.karaoke_at>0});
  }
  if(m[2]==='like'){
   requireUser(user);
   if(method==='PUT')await run(env,'INSERT OR IGNORE INTO likes(user_id,track_id,created) VALUES(?,?,?)',user.id,tid,now());
   else if(method==='DELETE')await run(env,'DELETE FROM likes WHERE user_id=? AND track_id=?',user.id,tid);else fail(405,'지원하지 않는 요청입니다.');
   return json({ok:true});
  }
  if(m[2]==='comments'){
   if(method==='GET'){
    const sort=url.searchParams.get('sort'),order=sort==='popular'?'likes DESC,c.created DESC':sort==='timeline'?'c.timestamp IS NULL,c.timestamp ASC':'c.created DESC';
    const uid=user?.id||'';
    const list=await rows(env,`SELECT c.id,c.track_id,c.user_id,c.parent_id,c.body,c.timestamp,c.created,c.edited,c.deleted_at,u.name,(c.user_id=t.user_id) creator,(SELECT count(*) FROM comment_likes l WHERE l.comment_id=c.id) likes,(SELECT count(*) FROM comment_likes l WHERE l.comment_id=c.id AND l.user_id=?) liked,EXISTS(SELECT 1 FROM comment_reports r WHERE r.comment_id=c.id AND r.user_id=?) reported FROM comments c JOIN users u ON u.id=c.user_id JOIN tracks t ON t.id=c.track_id WHERE c.track_id=? ORDER BY ${order} LIMIT 500`,uid,uid,tid);
    return json({comments:list.map(c=>({...c,can_delete:!!user&&!c.deleted_at&&(c.user_id===uid||(detail.kind==='cover'&&detail.user_id===uid)),can_report:!!user&&!c.deleted_at&&c.user_id!==uid&&!c.reported}))});
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
  requireUser(user);const c=await one(env,'SELECT * FROM comments WHERE id=?',m[1]);if(!c)fail(404,'댓글을 찾을 수 없습니다.');const track=await published(env,c.track_id);if(c.deleted_at)fail(409,'이미 삭제된 댓글입니다.');
  if(m[2]){
   if(method==='PUT')await run(env,'INSERT OR IGNORE INTO comment_likes(user_id,comment_id) VALUES(?,?)',user.id,c.id);
   else if(method==='DELETE')await run(env,'DELETE FROM comment_likes WHERE user_id=? AND comment_id=?',user.id,c.id);else fail(405,'지원하지 않는 요청입니다.');
  }else{
   if(c.user_id!==user.id&&!(method==='DELETE'&&track.kind==='cover'&&track.user_id===user.id))fail(403,'내 댓글 또는 내 커버곡의 댓글만 삭제할 수 있습니다.');
   if(method==='PATCH'){const b=await req.json();await run(env,'UPDATE comments SET body=?,edited=? WHERE id=? AND deleted_at=0',str(b.body,2000),now(),c.id);}
   else if(method==='DELETE')await removeComment(env,c.id,user.id);
   else fail(405,'지원하지 않는 요청입니다.');
  }return json({ok:true});
 }
 m=path.match(/^\/api\/(artists|producers)\/([\w-]+)(\/follow)?$/);
 if(m){
  const kind=m[1]==='artists'?'artist':'producer';
  const entity=await one(env,`SELECT id,name,bio,created,image_version${kind==='producer'?',banner_version':''} FROM ${m[1]} WHERE id=?`,m[2]);if(!entity)fail(404,'프로필을 찾을 수 없습니다.');
  if(!m[3]&&method==='GET'){
   const followers=(await one(env,'SELECT count(*) n FROM follows WHERE kind=? AND target_id=?',kind,entity.id)).n;
   const tracks=await trackList(env,`${VISIBLE()} AND t.kind='original' AND t.${kind}_id=?`,[entity.id]);
   if(kind==='artist')return json({profile:entity,tracks,followers});
   return json({profile:entity,tracks,covers:await trackList(env,`${VISIBLE()} AND t.kind='cover' AND t.producer_id=?`,[entity.id]),followers,gifts:await profileGifts(env,entity.id)});
  }
  requireUser(user);
  if(method==='PUT')await run(env,'INSERT OR IGNORE INTO follows(user_id,kind,target_id,created) VALUES(?,?,?,?)',user.id,kind,entity.id,now());
  else if(method==='DELETE')await run(env,'DELETE FROM follows WHERE user_id=? AND kind=? AND target_id=?',user.id,kind,entity.id);else fail(405,'지원하지 않는 요청입니다.');
  return json({ok:true});
 }
 if(path==='/api/history'&&method==='GET'){requireUser(user);return json({tracks:await trackList(env,VISIBLE()+" AND t.id IN (SELECT track_id FROM listens WHERE user_id=?)",[user.id],`(SELECT MAX(started) FROM listens l WHERE l.track_id=t.id AND l.user_id='${user.id.replaceAll("'",'')}') DESC`)});}
 if(path==='/api/playlists'&&method==='POST'){
  requireUser(user);await rate(env,'playlist:'+user.id,20,86400);const b=await req.json(),pid=id(),ids=b.track_ids??[];
  if(!Array.isArray(ids)||ids.length>500||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'))fail(400,'플레이리스트에 담을 곡을 확인해주세요.');
  for(const tid of ids)await published(env,tid);
  await env.DB.batch([query(env,`INSERT INTO playlists(id,user_id,name,is_public,created,description)
   SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM playlists WHERE user_id=?) <
   (SELECT CASE WHEN premium_until>unixepoch() THEN 10 ELSE 2 END FROM users WHERE id=?)`,pid,user.id,str(b.name,80),b.is_public===true?1:0,now(),str(b.description||'',600,false),user.id,user.id),
   ...ids.map((tid,i)=>query(env,'INSERT INTO playlist_tracks(playlist_id,track_id,created,position) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM playlists WHERE id=?)',pid,tid,now(),i,pid))]);
  if(!await one(env,'SELECT id FROM playlists WHERE id=?',pid))fail(409,`${isPremium(user)?'Premium':'무료'} 회원은 플레이리스트를 최대 ${playlistLimit(user)}개까지 만들 수 있습니다. 기존 목록에 곡을 추가하거나 보관함을 정리해주세요.`);
  return json({id:pid},201);
 }
 m=path.match(/^\/api\/playlists\/([\w-]+)\/order$/);
 if(m&&method==='PUT'){
  requireUser(user);const p=await one(env,'SELECT * FROM playlists WHERE id=?',m[1]);if(!p||p.user_id!==user.id)fail(403,'내 플레이리스트만 편집할 수 있습니다.');await requireActivePlaylist(env,p);
  const b=await req.json(),ids=b.track_ids;if(!Array.isArray(ids)||ids.length>500||ids.some(x=>typeof x!=='string')||new Set(ids).size!==ids.length)fail(400,'곡 순서를 다시 확인해주세요.');
  const stored=await rows(env,`SELECT pt.track_id,${VISIBLE()} visible FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=? ORDER BY pt.position,pt.created,pt.track_id`,p.id),visible=stored.filter(x=>x.visible).map(x=>x.track_id);
  if(visible.length!==ids.length||ids.some(x=>!visible.includes(x)))fail(409,'플레이리스트가 변경됐습니다. 다시 열어 순서를 확인해주세요.');
  let next=0;const all=stored.map(x=>x.visible?ids[next++]:x.track_id);
  if(all.length)await env.DB.batch(all.map((tid,i)=>query(env,'UPDATE playlist_tracks SET position=? WHERE playlist_id=? AND track_id=?',i,p.id,tid)));
  return json({ok:true});
 }
 m=path.match(/^\/api\/playlists\/([\w-]+)(?:\/tracks\/([\w-]+))?$/);
 if(m){
  const p=await one(env,`SELECT p.*,${activePlaylistSQL()} active FROM playlists p WHERE p.id=?`,m[1]);if(!p||((!p.is_public||!p.active)&&p.user_id!==user?.id))fail(404,'플레이리스트를 찾을 수 없습니다.');
  if(!m[2]&&method==='GET')return json({playlist:(await playlistSummaries(env,user?.id||'','p.id=?',[p.id]))[0],tracks:p.active?await trackList(env,VISIBLE()+" AND t.id IN (SELECT track_id FROM playlist_tracks WHERE playlist_id=?)",[p.id],`(SELECT position FROM playlist_tracks pt WHERE pt.track_id=t.id AND pt.playlist_id='${p.id}') ASC,t.created,t.id`,500):[]});
  requireUser(user);if(p.user_id!==user.id)fail(403,'내 플레이리스트만 변경할 수 있습니다.');
  if(m[2]||method!=='DELETE')await requireActivePlaylist(env,p);
  if(m[2]){
   if(method==='PUT'){await published(env,m[2]);if((await one(env,'SELECT count(*) n FROM playlist_tracks WHERE playlist_id=?',p.id)).n>=500)fail(400,'플레이리스트에는 최대 500곡까지 담을 수 있습니다.');await run(env,'INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,created,position) SELECT ?,?,?,COALESCE(MAX(position)+1,0) FROM playlist_tracks WHERE playlist_id=?',p.id,m[2],now(),p.id);}
   else if(method==='DELETE')await run(env,'DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?',p.id,m[2]);else fail(405,'지원하지 않는 요청입니다.');
  }else if(method==='PATCH'){const b=await req.json();await run(env,'UPDATE playlists SET name=?,is_public=?,description=? WHERE id=?',str(b.name,80),b.is_public===true?1:0,str(b.description??p.description,600,false),p.id);}
  else if(method==='DELETE')await run(env,'DELETE FROM playlists WHERE id=?',p.id);else fail(405,'지원하지 않는 요청입니다.');
  return json({ok:true});
 }
 return null;
}
