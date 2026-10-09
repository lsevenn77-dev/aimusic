import {artistGallery,GALLERY_LIMIT} from './artist-gallery.js';
import {assertUnblocked} from './account-safety.js';
import {namedArtistSQL} from './artist-identity.js';
import {publicCrewNameSQL as publicNameSQL,producerNameSQL,memberNameSQL} from './identity.js';
import {removeComment} from './comment-moderation.js';
import {rows,one,run,query,now,id,fail,str,json,rate} from './db.js';
import {requireUser,hash} from './auth.js';
import {discoveryRoute,playlistSummaries} from './discovery.js';
import {isPremium,playlistLimit,activePlaylistSQL,requireActivePlaylist} from './membership.js';
import {listenerLyrics} from './lyrics.js';
import {profileGifts} from './gifts.js';
import {GENRES,validGenre} from '../shared/genres.js';
import {rankingPeriod} from './ranking-period.js';
import {popularScores,CHART_WEIGHTS} from './popular-chart.js';
export {GENRES};
// A cover is public only while its original is public and still offered for karaoke (terms: hiding the original hides its covers).
export const VISIBLE=(t='t')=>`(${t}.status='published' AND (${t}.original_id IS NULL OR EXISTS(SELECT 1 FROM tracks v WHERE v.id=${t}.original_id AND v.status='published' AND v.karaoke_at>0)) AND (${t}.duet_parent_id IS NULL OR EXISTS(SELECT 1 FROM tracks dp WHERE dp.id=${t}.duet_parent_id AND dp.status='published' AND dp.cover_mode='duet' AND dp.duet_parent_id IS NULL)))`;
// A song can be sung once its MR and word timings are built and its creator still offers it for karaoke.
export const SINGABLE=(t='t')=>`(${t}.kind='original' AND ${t}.karaoke_at>0 AND EXISTS(SELECT 1 FROM karaoke_jobs k WHERE k.track_id=${t}.id AND k.state='ready' AND k.mr_ready=1 AND k.words_state IN ('ready','attention')))`;
// Covers keep the original's AI artist in artist_id; their performer is the uploader's profile.
const SELECT=`SELECT t.id,t.title,t.genre,t.tags,t.description,CASE WHEN t.kind='cover' THEN o.lyrics_mode ELSE t.lyrics_mode END lyrics_mode,t.ai_tool,t.participation,t.duration,t.created,t.has_cover,t.cover_version,CASE WHEN ${namedArtistSQL()} THEN t.artist_id ELSE NULL END artist_id,(t.kind='original' AND ${namedArtistSQL()}) has_ai_artist,t.producer_id,p.image_version producer_image_version,(SELECT state FROM lyric_jobs WHERE track_id=t.id AND state!='cancelled') alignment_state,
 CASE WHEN t.cover_mode='duet' AND t.duet_parent_id IS NOT NULL THEN (${producerNameSQL('fp')})||' & '||(${producerNameSQL()})||' · 듀엣' WHEN t.kind='cover' THEN (${producerNameSQL()})||CASE WHEN t.cover_mode='duet' THEN ' · 듀엣' ELSE ' · 커버' END WHEN ${namedArtistSQL()} THEN a.name ELSE ${producerNameSQL()} END artist,${memberNameSQL()} producer,t.user_id,t.kind,t.original_id,CASE WHEN t.kind='cover' THEN o.performance_mode ELSE t.performance_mode END performance_mode,t.cover_mode,t.duet_parent_id,t.duet_part,t.duet_open,dt.producer_id duet_partner_id,${producerNameSQL("fp")} duet_partner,(t.kind='original' AND t.karaoke_at>0) accepts_covers,
 o.title original_title,o.has_cover original_has_cover,o.cover_version original_cover_version,CASE WHEN ${namedArtistSQL()} THEN a.name ELSE ${producerNameSQL('op')} END original_artist,o.producer_id original_producer_id,${producerNameSQL('op')} original_producer,
 (SELECT count(*) FROM likes l WHERE l.track_id=t.id) likes,
 (SELECT count(*) FROM comments c WHERE c.track_id=t.id AND c.deleted_at=0) comments,
 (SELECT count(*) FROM tracks cv WHERE cv.original_id=t.id AND ${VISIBLE('cv')}) covers,
 (SELECT count(DISTINCT listener||day) FROM listens l WHERE l.track_id=t.id AND l.qualified=1) plays,
 (SELECT COALESCE(sum(g.gold),0) FROM gifts g WHERE g.track_id=t.id) gift_gold,
 (SELECT count(*) FROM free_gifts g WHERE g.track_id=t.id) gift_stars
 FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id LEFT JOIN tracks o ON o.id=t.original_id LEFT JOIN producers op ON op.id=o.producer_id LEFT JOIN tracks dt ON dt.id=t.duet_parent_id LEFT JOIN producers fp ON fp.id=dt.producer_id`;
export const trackList=(env,where=VISIBLE(),args=[],sort='t.created DESC',limit=100)=>{
 const blocked=env.AIFECT_BLOCKED||[];
 return rows(env,`${SELECT} WHERE ${where}${blocked.length?' AND t.user_id NOT IN ('+blocked.map(()=>'?').join(',')+')':''} ORDER BY ${sort} LIMIT ${limit}`,...args,...blocked);
};
export async function published(env,tid){const t=await one(env,`SELECT t.* FROM tracks t WHERE t.id=? AND ${VISIBLE()}`,tid);if(!t)fail(404,'공개된 곡을 찾을 수 없습니다.');assertUnblocked(env,t.user_id);return t;}
const COVER_SORTS={popular:'likes DESC,plays DESC,t.created DESC',gifts:'(gift_gold+gift_stars) DESC,likes DESC,t.created DESC',plays:'plays DESC,likes DESC,t.created DESC',recent:'t.created DESC'};
export async function catalogRoute(req,env,path,user){
 const url=new URL(req.url),method=req.method;const discovery=await discoveryRoute(req,env,path,user);if(discovery)return discovery;
 if(path==='/api/community'&&method==='GET'){
  const kind=url.searchParams.get('kind'),following=url.searchParams.get('following')==='1';
  let where=VISIBLE(),args=[];
  if(kind){if(!['cover','original'].includes(kind))fail(400,'곡 종류를 확인해주세요.');where+=' AND t.kind=?';args.push(kind);}
  const mode=url.searchParams.get('cover_mode');if(mode){if(!['solo','duet'].includes(mode))fail(400,'커버 종류를 확인해주세요.');where+=" AND t.kind='cover' AND t.cover_mode=?";args.push(mode);}
  if(following){requireUser(user);where+=" AND EXISTS(SELECT 1 FROM follows f WHERE f.user_id=? AND ((f.kind='producer' AND f.target_id=t.producer_id) OR (f.kind='artist' AND f.target_id=t.artist_id)))";args.push(user.id);}
  return json({tracks:await trackList(env,where,args,'t.created DESC',60)});
 }
 if(path==='/api/catalog'&&method==='GET'){
  const q=(url.searchParams.get('q')||'').slice(0,100),genre=url.searchParams.get('genre'),chart=url.searchParams.get('chart');
  let where=VISIBLE()+" AND t.kind='original'",args=[];
  if(q){where+=` AND (t.title LIKE ? OR a.name LIKE ? OR (${producerNameSQL()}) LIKE ? OR t.genre LIKE ? OR t.tags LIKE ?)`;args=Array(5).fill('%'+q+'%');}
  if(genre&&validGenre(genre)){where+=' AND t.genre=?';args.push(genre);}
  let sort='t.created DESC';

  if(chart==='rising')sort="(SELECT count(DISTINCT listener) FROM listens l WHERE l.track_id=t.id AND l.qualified=1 AND l.started>unixepoch()-604800) DESC,t.created DESC";
  if(chart==='newcomers')where+=' AND p.created>unixepoch()-2592000 AND (SELECT count(*) FROM follows f WHERE f.kind=\'producer\' AND f.target_id=p.id)<1000';
  const section=url.searchParams.get('section')||'all';
  if(!['all','tracks','artists','producers'].includes(section))fail(400,'목록 종류를 확인해주세요.');
  const requested=Number(url.searchParams.get('limit')||100),limit=Number.isFinite(requested)?Math.max(1,Math.min(100,Math.trunc(requested))):100;
  const period=chart==='top'?rankingPeriod(url.searchParams.get('period')||'week'):null;
  const loaders={
   tracks:async()=>{
    if(!period)return trackList(env,where,args,sort,limit);
    const scores=await popularScores(env,period,where,args,limit);
    if(!scores.length)return [];
    const tracks=await trackList(env,'t.id IN ('+scores.map(()=>'?').join(',')+')',scores.map(s=>s.id),'t.id',limit);
    const byId=new Map(tracks.map(t=>[t.id,t]));
    return scores.map((s,i)=>({...byId.get(s.id),...s,chart_rank:i+1}));
   },
   artists:()=>rows(env,`SELECT a.*, (SELECT count(*) FROM follows f WHERE f.kind='artist' AND f.target_id=a.id) followers FROM artists a WHERE ${namedArtistSQL()} AND EXISTS(SELECT 1 FROM tracks t WHERE t.artist_id=a.id AND t.kind='original' AND t.status='published') ORDER BY created DESC LIMIT ${limit}`),
   producers:()=>rows(env,`SELECT p.id,${producerNameSQL()} name,p.bio,p.created,p.image_version,(SELECT count(*) FROM follows f WHERE f.kind='producer' AND f.target_id=p.id) followers FROM producers p WHERE EXISTS(SELECT 1 FROM tracks t WHERE t.producer_id=p.id AND ${VISIBLE()}) ORDER BY created DESC LIMIT ${limit}`)
  };
  const sections=section==='all'?Object.keys(loaders):[section];
  const result=Object.fromEntries(await Promise.all(sections.map(async key=>[key,await loaders[key]()])));
  if(period)result.chart={...period,weights:CHART_WEIGHTS,basis:'normalized_engagement',max_score:100};
  return json(result);
 }
 let m=path.match(/^\/api\/tracks\/([\w-]+)(?:\/(like|comments|covers))?$/);
 if(m){
  const tid=m[1],detail=await published(env,tid);
  if(!m[2]&&method==='GET'){
   const [tracks,karaoke]=await Promise.all([trackList(env,`t.id=? AND ${VISIBLE()}`,[tid]),one(env,`SELECT 1 FROM tracks t WHERE t.id=? AND ${SINGABLE()}`,tid)]);
   return json({track:{...tracks[0],...listenerLyrics(detail.kind==='cover'?await one(env,'SELECT lyrics FROM tracks WHERE id=?',detail.original_id):detail,user),karaoke_ready:!!karaoke}});
  }
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
    const list=await rows(env,`SELECT c.id,c.track_id,c.user_id,c.parent_id,c.body,c.timestamp,c.created,c.edited,c.deleted_at,${publicNameSQL()} name,(c.user_id=t.user_id) creator,(SELECT count(*) FROM comment_likes l WHERE l.comment_id=c.id) likes,(SELECT count(*) FROM comment_likes l WHERE l.comment_id=c.id AND l.user_id=?) liked,EXISTS(SELECT 1 FROM comment_reports r WHERE r.comment_id=c.id AND r.user_id=?) reported FROM comments c JOIN users u ON u.id=c.user_id JOIN tracks t ON t.id=c.track_id WHERE c.track_id=? AND c.deleted_at=0 ORDER BY ${order} LIMIT 500`,uid,uid,tid);
    return json({comments:list.map(c=>({...c,can_delete:!!user&&!c.deleted_at&&(c.user_id===uid||(detail.kind==='cover'&&detail.user_id===uid)),can_report:!!user&&!c.deleted_at&&c.user_id!==uid&&!c.reported}))});
   }
   if(method==='POST'){
    requireUser(user);await rate(env,'comment:'+user.id,20,3600);const b=await req.json(),text=str(b.body,2000);
    const t=await published(env,tid),timestamp=b.timestamp==null?null:Number(b.timestamp);
    if(timestamp!==null&&(!Number.isFinite(timestamp)||timestamp<0||timestamp>t.duration))fail(400,'곡 안의 시간을 지정해주세요.');
    if(b.parent_id){const parent=await one(env,'SELECT user_id FROM comments WHERE id=?',b.parent_id);if(parent)assertUnblocked(env,parent.user_id);}
   if(b.parent_id&&!await one(env,'SELECT id FROM comments WHERE id=? AND track_id=? AND parent_id IS NULL AND deleted_at=0',b.parent_id,tid))fail(400,'답글 대상을 찾을 수 없습니다.');
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
  const entity=await one(env,`SELECT id,${kind==='producer'?producerNameSQL('producers'):'name'} name,bio,created,image_version${kind==='producer'?',banner_version,user_id':''} FROM ${m[1]} WHERE id=?${kind==='artist'?' AND '+namedArtistSQL('name'):''}`,m[2]);if(!entity)fail(404,'프로필을 찾을 수 없습니다.');if(kind==='producer')entity.display_name=(await one(env,`SELECT ${memberNameSQL()} name FROM producers p WHERE p.id=?`,entity.id)).name;
  const owner=kind==='producer'?entity:await one(env,'SELECT p.user_id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=?',entity.id);assertUnblocked(env,owner?.user_id);
  if(!m[3]&&method==='GET'){
   const [count,tracks,covers,gifts]=await Promise.all([
    one(env,'SELECT count(*) n FROM follows WHERE kind=? AND target_id=?',kind,entity.id),
    trackList(env,`${VISIBLE()} AND t.kind='original' AND t.${kind}_id=?`,[entity.id]),
    kind==='producer'?trackList(env,`${VISIBLE()} AND t.kind='cover' AND (t.producer_id=? OR dt.producer_id=?)`,[entity.id,entity.id]):null,
    kind==='producer'?profileGifts(env,entity.id):null
   ]);
   return json({profile:entity,tracks,followers:count.n,...(kind==='producer'?{covers,gifts}:{gallery:await artistGallery(env,entity.id),can_manage:user?.id===owner?.user_id,gallery_limit:GALLERY_LIMIT})});
  }
  requireUser(user);
  if(method==='PUT')await run(env,'INSERT OR IGNORE INTO follows(user_id,kind,target_id,created) VALUES(?,?,?,?)',user.id,kind,entity.id,now());
  else if(method==='DELETE')await run(env,'DELETE FROM follows WHERE user_id=? AND kind=? AND target_id=?',user.id,kind,entity.id);else fail(405,'지원하지 않는 요청입니다.');
  return json({ok:true,following:method==='PUT',profile:entity,followers:(await one(env,'SELECT count(*) n FROM follows WHERE kind=? AND target_id=?',kind,entity.id)).n});
 }
 if(path==='/api/history'&&method==='GET'){requireUser(user);return json({tracks:await trackList(env,VISIBLE()+" AND t.id IN (SELECT track_id FROM listens WHERE user_id=?)",[user.id],`(SELECT MAX(started) FROM listens l WHERE l.track_id=t.id AND l.user_id='${user.id.replaceAll("'",'')}') DESC`)});}
 if(path==='/api/playlists'&&method==='POST'){
  requireUser(user);await rate(env,'playlist:'+user.id,20,86400);const b=await req.json(),pid=id(),ids=b.track_ids??[];
  if(!Array.isArray(ids)||ids.length>500||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'))fail(400,'플레이리스트에 담을 곡을 확인해주세요.');
  for(const tid of ids)await published(env,tid);
  await env.DB.batch([query(env,`INSERT INTO playlists(id,user_id,name,is_public,created,description)
   SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM playlists WHERE user_id=?) <
   (SELECT CASE WHEN MAX(premium_until,apple_premium_until)>unixepoch() THEN 10 ELSE 2 END FROM users WHERE id=?)`,pid,user.id,str(b.name,80),b.is_public===true?1:0,now(),str(b.description||'',600,false),user.id,user.id),
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
