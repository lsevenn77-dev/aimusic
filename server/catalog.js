import {readCoverEdit} from './cover-edit.js';
import * as AifectMessages from '../shared/system-messages.js';
import {publicContentContext,trackBlockScope,artistBlockScope} from './block-policy.js';
import {playlistEligibleSQL} from '../shared/playlist-policy.js';
import {exactSongScope,fallbackSongScope,songBlockScope} from './song-search.js';
import {songTextMatch,searchText} from './search-match.js';
import {giftBlockReason} from './gift-eligibility.js';
import {followCounts,assertArtistInteraction,producerFollowsViewer} from './follow-management.js';
import {canManageArtist} from './artist-fan-access.js';
import {fanpageData} from './artist-fanpage.js';
import {profileDashboard} from './profile-dashboard.js';
import {profileCoverParticipation} from './profile-works.js';
import {songCovers} from './song-covers.js';
import {coverPickRoute} from './song-cover-picks.js';
import {trackArtworkSQL} from './track-artwork.js';
import {profileGallery,PROFILE_GALLERY_LIMIT} from './profile-gallery.js';
import {partnerBadgeSQL} from './partner-badges.js';
import {playerIdentity,playerColumnsSQL} from './player.js';
import {appearanceDeadlineSQL} from './premium-appearance.js';
import {artistGallery,GALLERY_LIMIT} from './artist-gallery.js';
import {assertUnblocked} from './account-safety.js';
import {namedArtistSQL} from './artist-identity.js';
import {publicNameSQL,producerNameSQL} from './identity.js';
import {removeComment} from './comment-moderation.js';
import {rows,one,run,query,now,id,fail,str,json,rate} from './db.js';
import {requireUser,hash} from './auth.js';
import {discoveryRoute,playlistSummaries} from './discovery.js';

import {listenerLyrics} from './lyrics.js';
import {profileGifts} from './gifts.js';
import {GENRES,validGenre,trackClassification,genreFilterSQL} from '../shared/genres.js';
import {rankingPeriod} from './ranking-period.js';
import {CHART_WEIGHTS,CHART_ORIGINAL,pageCharts,chartPublication} from './popular-chart.js';
import {dailyChart} from './chart-movement.js';
import {supportFollowCount} from './ai-support-follows.js';
import {profileDiscovery} from './profile-discovery.js';
export {GENRES};
// A cover is public only while its original is public and still offered for karaoke (terms: hiding the original hides its covers).
export const VISIBLE=(t='t')=>`(${t}.status='published' AND (${t}.original_id IS NULL OR EXISTS(SELECT 1 FROM tracks v WHERE v.id=${t}.original_id AND v.status='published' AND v.karaoke_at>0)) AND (${t}.duet_parent_id IS NULL OR EXISTS(SELECT 1 FROM tracks dp WHERE dp.id=${t}.duet_parent_id AND dp.status='published' AND dp.cover_mode='duet' AND dp.duet_parent_id IS NULL)))`;
// Artist pages credit original releases. A cover retains the source artist's
// foreign key, but is performed by the cover uploader.
const publicArtistSongs = () => `FROM tracks t WHERE t.artist_id=a.id AND t.kind='original' AND ${VISIBLE()}`;
// Both directory queries join artist a to producer p and bind the viewer at ?1.
export const artistCardCountsSQL = () => `
 (SELECT count(*) ${publicArtistSongs()}) track_count,
 (SELECT count(*) FROM follows f JOIN users fan ON fan.id=f.user_id
  WHERE f.kind='artist' AND f.target_id=a.id AND fan.provider!='deleted'
  AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE
   (b.user_id=f.user_id AND b.blocked_id IN (?1,p.user_id)) OR
   (b.blocked_id=f.user_id AND b.user_id IN (?1,p.user_id)))
  AND NOT EXISTS(SELECT 1 FROM artist_follow_blocks ab WHERE ab.artist_id=a.id AND ab.user_id=f.user_id)
 ) followers`;
// A song can be sung once its MR and word timings are built and its creator still offers it for karaoke.
export const SINGABLE=(t='t')=>`(${t}.kind='original' AND ${t}.karaoke_at>0 AND EXISTS(SELECT 1 FROM karaoke_jobs k WHERE k.track_id=${t}.id AND k.state='ready' AND k.mr_ready=1 AND k.words_state IN ('ready','attention')))`;
const trackCommentCountSQL="(SELECT count(*) FROM comments c JOIN users cu ON cu.id=c.user_id WHERE c.track_id=t.id AND c.deleted_at=0 AND cu.account_type='human')";
// Covers keep the original's AI artist in artist_id; their performer is the uploader's profile.
const SELECT=`SELECT t.id,t.title,t.genre,t.genres_json,t.moods_json,t.classification_source,t.classification_updated,t.tags,t.description,CASE WHEN t.kind='cover' THEN o.lyrics_mode ELSE t.lyrics_mode END lyrics_mode,t.ai_tool,t.participation,t.duration,t.created,t.release_date,${trackArtworkSQL()},CASE WHEN ${namedArtistSQL()} THEN t.artist_id ELSE NULL END artist_id,(t.kind='original' AND ${namedArtistSQL()}) has_ai_artist,t.producer_id,p.image_version producer_image_version,${playerColumnsSQL('p.user_id')},(SELECT state FROM lyric_jobs WHERE track_id=t.id AND state!='cancelled') alignment_state,
 CASE WHEN t.cover_mode='duet' AND t.duet_parent_id IS NOT NULL THEN (${producerNameSQL('fp')})||' & '||(${producerNameSQL()})||' · 듀엣' WHEN t.kind='cover' THEN (${producerNameSQL()})||CASE WHEN t.cover_mode='duet' THEN ' · 듀엣' ELSE ' · 커버' END WHEN ${namedArtistSQL()} THEN a.name ELSE ${producerNameSQL()} END artist,${producerNameSQL()} producer,t.user_id,t.kind,t.original_id,CASE WHEN t.kind='cover' THEN o.performance_mode ELSE t.performance_mode END performance_mode,t.cover_mode,t.duet_parent_id,t.duet_part,t.duet_open,dt.producer_id duet_partner_id,${producerNameSQL("fp")} duet_partner,(t.kind='original' AND t.karaoke_at>0) accepts_covers,
 o.title original_title,o.has_cover original_has_cover,o.cover_version original_cover_version,CASE WHEN ${namedArtistSQL()} THEN a.name ELSE ${producerNameSQL('op')} END original_artist,o.producer_id original_producer_id,${producerNameSQL('op')} original_producer,
 (SELECT count(*) FROM likes l WHERE l.track_id=t.id) likes,
 ${trackCommentCountSQL} comments,
 (SELECT count(*) FROM tracks cv WHERE cv.original_id=t.id AND ${VISIBLE('cv')}) covers,
 (SELECT count(DISTINCT listener||day) FROM listens l WHERE l.track_id=t.id AND l.qualified=1) plays,
 (SELECT COALESCE(sum(g.gold),0) FROM gifts g WHERE g.track_id=t.id) gift_gold,
 (SELECT COALESCE(sum(g.silver),0) FROM free_gifts g WHERE g.track_id=t.id) gift_stars
 FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id LEFT JOIN tracks o ON o.id=t.original_id LEFT JOIN producers op ON op.id=o.producer_id LEFT JOIN tracks dt ON dt.id=t.duet_parent_id LEFT JOIN producers fp ON fp.id=dt.producer_id`;
export const trackListQuery=(env,where=VISIBLE(),args=[],sort='t.created DESC',limit=100,includeStatus=false,profileWorks=false)=>{
 const block=trackBlockScope(env);
 const fields=[includeStatus?'t.status':'',profileWorks?`${producerNameSQL()} work_nickname,${chartPublication()} published_at,${VISIBLE()} work_public`:''].filter(Boolean);
 const select=fields.length?SELECT.replace('SELECT t.id,','SELECT t.id,'+fields.join(',')+','):SELECT;
 return query(env,`${select} WHERE ${where}${block.sql} ORDER BY ${sort} LIMIT ${limit}`,...args,...block.args);
};
export const trackList=async(...args)=>(await trackListQuery(...args).all()).results.map(trackClassification);
// Rank the full visible set before paging or promoting its one composer PICK.
export async function rankedSongCovers(env,where,args,sort,offset,limit,pickId){
 const blocked=env.AIFECT_BLOCKED||[],block=blocked.length?' AND t.user_id NOT IN ('+blocked.map(()=>'?').join(',')+')':'';
 const select=SELECT.replace('SELECT t.id,','SELECT t.id,t.first_published_at,');
 const result=await rows(env,`SELECT * FROM (SELECT t.*,ROW_NUMBER() OVER(ORDER BY ${sort},t.id) rank FROM (${select} WHERE ${where}${block}) t) t ORDER BY (t.id=?) DESC,rank LIMIT ? OFFSET ?`,...args,...blocked,pickId||'',limit,offset);
 return result.map(trackClassification);
}
export async function published(env,tid){const t=await one(env,`SELECT t.* FROM tracks t WHERE t.id=? AND ${VISIBLE()}`,tid);if(!t)fail(404,'공개된 곡을 찾을 수 없습니다.');if(!env.AIFECT_PUBLIC_CONTENT)assertUnblocked(env,t.user_id);return t;}
async function trackComments(env,track,user,order='c.created DESC',commentId=null){
 const uid=user?.id||'',tid=track.id;
 const list=await rows(env,`SELECT u.account_type,c.id,c.track_id,c.user_id,c.parent_id,c.body,c.timestamp,c.created,c.edited,c.deleted_at,p.id profile_id,p.image_version,${publicNameSQL()} name,(c.user_id=t.user_id) creator,
 ${appearanceDeadlineSQL('u')} premium_style_until,
 (SELECT count(*) FROM comment_likes l WHERE l.comment_id=c.id) likes,(SELECT count(*) FROM comment_likes l WHERE l.comment_id=c.id AND l.user_id=?) liked,EXISTS(SELECT 1 FROM comment_reports r WHERE r.comment_id=c.id AND r.user_id=?) reported FROM comments c JOIN users u ON u.id=c.user_id JOIN tracks t ON t.id=c.track_id LEFT JOIN producers p ON p.user_id=c.user_id WHERE c.track_id=? AND c.deleted_at=0 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=c.user_id) OR (b.blocked_id=? AND b.user_id=c.user_id)) ${commentId?'AND c.id=?':''} ORDER BY ${order} LIMIT 500`,uid,uid,tid,uid,uid,...(commentId?[commentId]:[]));
 return list.map(c=>({...c,can_delete:!!user&&(c.user_id===uid||track.user_id===uid),can_report:!!user&&c.user_id!==uid&&!c.reported}));
}
export const COVER_SORTS={popular:'likes DESC,plays DESC,t.created DESC',gifts:'(gift_gold+gift_stars) DESC,likes DESC,t.created DESC',plays:'plays DESC,likes DESC,t.created DESC',recent:'t.created DESC'};
export async function catalogRoute(req,env,path,user){
 const pickMatch=path.match(/^\/api\/tracks\/([\w-]+)\/cover-pick$/);
 if(pickMatch)return coverPickRoute(req,env,pickMatch[1],user);
 const url=new URL(req.url),method=req.method;const discovery=await discoveryRoute(req,env,path,user);if(discovery)return discovery;
 if(path==='/api/community'&&method==='GET'){
  const kind=url.searchParams.get('kind'),following=url.searchParams.get('following')==='1';
  let where=VISIBLE(),args=[];
  if(kind){if(!['cover','original'].includes(kind))fail(400,'곡 종류를 확인해 주세요.');where+=' AND t.kind=?';args.push(kind);}
  const mode=url.searchParams.get('cover_mode');if(mode){if(!['solo','duet'].includes(mode))fail(400,'커버 종류를 확인해 주세요.');where+=" AND t.kind='cover' AND t.cover_mode=?";args.push(mode);}
  if(url.searchParams.get('completed')==='1')where+=" AND t.kind='cover' AND (t.cover_mode='solo' OR t.duet_parent_id IS NOT NULL)";
  if(following){requireUser(user);where+=" AND EXISTS(SELECT 1 FROM follows f WHERE f.user_id=? AND ((f.kind='producer' AND f.target_id=t.producer_id) OR (f.kind='artist' AND f.target_id=t.artist_id)))";args.push(user.id);}
  return json({tracks:await trackList(env,where,args,'t.created DESC',60)});
 }
 if(path==='/api/catalog'&&method==='GET'){
  // Explicit discovery entry only; the existing unfiltered producer list is unchanged.
  if(url.searchParams.get('section')==='producers'&&url.searchParams.get('sort')==='popular')return json({producers:await profileDiscovery(env,'producer','popular',100)});
  if(url.searchParams.get('section')==='artists'&&url.searchParams.get('directory')==='1'){
   const sort=url.searchParams.get('sort')==='recent'?'recent':'popular',offset=Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0)),size=50;
   const block=artistBlockScope(env);
   const where=`${namedArtistSQL()} AND EXISTS(SELECT 1 ${publicArtistSongs()})${block.sql}`;
   const [artists,count]=await Promise.all([
    rows(env,`SELECT a.*,${producerNameSQL()} producer_name,${artistCardCountsSQL()}
     FROM artists a JOIN producers p ON p.id=a.producer_id WHERE ${where}
     ORDER BY ${sort==='popular'?'followers DESC,':''}a.created DESC,a.id LIMIT ? OFFSET ?`,user?.id||'',...block.args,size,offset),
    one(env,`SELECT count(*) n FROM artists a JOIN producers p ON p.id=a.producer_id WHERE ${where}`,...block.args)
   ]);
   return json({artists,total:count.n,sort,offset,nextOffset:offset+artists.length<count.n?offset+size:null});
  }

  const q=searchText(url.searchParams.get('q')),genre=url.searchParams.get('genre'),chart=url.searchParams.get('chart');
  let where=VISIBLE()+" AND t.kind='original'",args=[];
  if(q&&chart){const match=songTextMatch(q);where+=' AND '+match.sql;args=match.args;}
  if(genre&&validGenre(genre)){where+=' AND '+genreFilterSQL();args.push(genre,genre);}
  let sort='t.created DESC';

  const ranked=['top','rising','releases',...pageCharts].includes(chart);
  if(ranked){env=publicContentContext(env);where+=' AND '+CHART_ORIGINAL();}
  const section=url.searchParams.get('section')||'all';
  if(!['all','tracks','artists','producers'].includes(section))fail(400,'목록 종류를 확인해 주세요.');
  const requested=Number(url.searchParams.get('limit')||100),limit=Number.isFinite(requested)?Math.max(1,Math.min(100,Math.trunc(requested))):100;
  const period=ranked?rankingPeriod(url.searchParams.get('period')||(chart==='top'?'week':'all')):null;
  let comparison=null,correction=null;
  const artistScope=artistBlockScope(env,'a.id','(SELECT p.user_id FROM producers p WHERE p.id=a.producer_id)'),producerScope=artistBlockScope({...env,AIFECT_BLOCKED_ARTISTS:[]});
  const loaders={
   tracks:async()=>{
    if(q&&!chart){
     const block=songBlockScope(env.AIFECT_BLOCKED||[],env.AIFECT_BLOCKED_ARTISTS||[]);
     const scope=where+block.sql,params=[...args,...block.args];
     const load=song=>trackList({...env,AIFECT_BLOCKED:[],AIFECT_BLOCKED_ARTISTS:[]},song.where,[...params,...song.args,...song.sortArgs],song.sort+',t.created DESC,t.id',limit);
     const direct=await load(exactSongScope(q,scope));
     if(direct.length)return direct;
     const fallback=await fallbackSongScope(env,q,scope,params);
     if(!fallback)return [];
     correction=fallback.correction;
     return load(fallback);
    }
    if(!period)return trackList(env,where,args,sort,limit);
    const daily=await dailyChart(env,period,chart);comparison=daily.comparison;
    if(!daily.tracks.length)return [];
    const chunks=[];for(let i=0;i<daily.tracks.length;i+=40)chunks.push(daily.tracks.slice(i,i+40));
    const tracks=(await Promise.all(chunks.map(chunk=>trackList(env,where+' AND t.id IN ('+chunk.map(()=>'?').join(',')+')',[...args,...chunk.map(s=>s.id)],'t.id',40)))).flat();
    const byId=new Map(tracks.map(t=>[t.id,t]));
    const selected=daily.tracks.filter(s=>byId.has(s.id));
    return (url.searchParams.get('full')==='1'?selected:selected.slice(0,limit)).map(s=>({...byId.get(s.id),...s,covers:s.chart_covers??byId.get(s.id).covers}));
   },
   artists:()=>rows(env,`SELECT a.*, (SELECT count(*) FROM follows f WHERE f.kind='artist' AND f.target_id=a.id) followers FROM artists a WHERE ${namedArtistSQL()}${artistScope.sql} AND EXISTS(SELECT 1 FROM tracks t WHERE t.artist_id=a.id AND t.kind='original' AND t.status='published') ORDER BY created DESC LIMIT ${limit}`,...artistScope.args),
   producers:()=>rows(env,`SELECT p.id,${playerColumnsSQL('p.user_id')},${producerNameSQL()} name,p.bio,p.created,p.image_version,(SELECT count(*) FROM follows f WHERE f.kind='producer' AND f.target_id=p.id) followers FROM producers p WHERE 1${producerScope.sql} AND EXISTS(SELECT 1 FROM tracks t WHERE t.producer_id=p.id AND ${VISIBLE()}) ORDER BY created DESC LIMIT ${limit}`,...producerScope.args)
  };
  const sections=section==='all'?Object.keys(loaders):[section];
  const result=Object.fromEntries(await Promise.all(sections.map(async key=>[key,await loaders[key]()])));
  if(correction)result.search_correction=correction;
  if(period)result.chart=pageCharts.includes(chart)?{...period,basis:chart==='covers'?'published_solo_covers':'qualified_listens',comparison}:{...period,weights:CHART_WEIGHTS,basis:'normalized_engagement',max_score:100,comparison};
  return json(result);
 }
 let m=path.match(/^\/api\/tracks\/([\w-]+)(?:\/(like|comments|covers))?$/);
 if(m){
  const tid=m[1],detail=await published(env,tid);if(method!=='GET'&&detail.kind==='original')await assertArtistInteraction(env,detail.artist_id,user?.id);
  if(!m[2]&&method==='GET'){
   const [tracks,karaoke,ai,editorial]=await Promise.all([
    trackList(env,`t.id=? AND ${VISIBLE()}`,[tid],'t.created DESC',1),
    one(env,`SELECT 1 FROM tracks t WHERE t.id=? AND ${SINGABLE()}`,tid),
    one(env,"SELECT count(*) n FROM comments c JOIN users u ON u.id=c.user_id WHERE c.track_id=? AND c.deleted_at=0 AND u.account_type='ai_bot'",tid),
    one(env,`SELECT json_extract(target,'$.before') original_description,json_extract(target,'$.after') generated_description
      FROM admin_audit WHERE id=? AND action='track_description_editorial' AND json_valid(target)`,'public-copy-0078:'+tid)
   ]);
   const track=tracks[0];
   let creatorDescription=track?.description??'';
   // The 0078 audit records the exact replacement and the preceding creator text.
   if(editorial?.generated_description?.replaceAll('\r\n','\n')===creatorDescription.replaceAll('\r\n','\n')){
    creatorDescription=editorial.original_description??'';
    if(['0000','-','없음'].includes(creatorDescription.trim()))creatorDescription='';
   }
   const lyricSource=detail.kind==='cover'&&!readCoverEdit(detail.recording_edit)?.window?await one(env,'SELECT lyrics FROM tracks WHERE id=?',detail.original_id):detail;
   return json({track:{...track,creator_description:creatorDescription,gift_block_reason:await giftBlockReason(env,user?.id,detail),ai_comments:ai.n,...listenerLyrics(lyricSource,user),karaoke_ready:!!karaoke}});
  }
  if(m[2]==='covers'){
   if(method!=='GET')fail(405,AifectMessages.unsupportedRequest);
   if(url.searchParams.has('view'))return songCovers(env,detail,url.searchParams,user);
   const sort=url.searchParams.get('sort')||'popular';if(!Object.hasOwn(COVER_SORTS,sort))fail(400,'정렬 기준을 확인해 주세요.');
   const mode=url.searchParams.get('mode')||'all';if(!['all','solo','duet'].includes(mode))fail(400,'커버 종류를 확인해 주세요.');
   const filter=mode==='all'?'':" AND t.cover_mode='"+mode+"'";
   const base=`t.original_id=? AND t.kind='cover' AND ${VISIBLE()}`;
   const blocked=env.AIFECT_BLOCKED||[];
   const [covers,counts]=await Promise.all([trackList(env,`${base}${filter}`,[tid],COVER_SORTS[sort]+',t.id',100),one(env,`SELECT count(*) 'all',count(CASE WHEN t.cover_mode='solo' THEN 1 END) solo,count(CASE WHEN t.cover_mode='duet' THEN 1 END) duet FROM tracks t WHERE ${base}${blocked.length?' AND t.user_id NOT IN ('+blocked.map(()=>'?').join(',')+')':''}`,tid,...blocked)]);
   return json({covers,counts,sort,mode,accepts_covers:detail.kind==='original'&&detail.karaoke_at>0});
  }
  if(m[2]==='like'){
   requireUser(user);
   if(method==='PUT')await run(env,'INSERT OR IGNORE INTO likes(user_id,track_id,created) VALUES(?,?,?)',user.id,tid,now());
   else if(method==='DELETE')await run(env,'DELETE FROM likes WHERE user_id=? AND track_id=?',user.id,tid);else fail(405,AifectMessages.unsupportedRequest);
   return json({ok:true});
  }
  if(m[2]==='comments'){
   if(method==='GET'){
    const sort=url.searchParams.get('sort'),order=sort==='popular'?'likes DESC,c.created DESC':sort==='timeline'?'c.timestamp IS NULL,c.timestamp ASC':'c.created DESC';
    return json({comments:await trackComments(env,detail,user,order)});
   }
   if(method==='POST'){
    requireUser(user);
    const b=await req.json(),text=str(b.body,2000),parentId=b.parent_id||null,requestId=b.request_id;
    const timestamp=b.timestamp==null?null:Number(b.timestamp);
    if(timestamp!==null&&(!Number.isFinite(timestamp)||timestamp<0||timestamp>detail.duration))fail(400,'곡 안의 시간을 지정해 주세요.');
    if(requestId!=null&&(!parentId||typeof requestId!=='string'||!/^[\w-]{16,64}$/.test(requestId)))fail(400,'답글 등록 요청을 다시 시작해 주세요.');
    const cid=requestId?'reply-'+await hash(JSON.stringify([user.id,tid,parentId,requestId])):id();
    const saved=requestId&&await one(env,'SELECT id FROM comments WHERE id=?',cid);
    if(!saved){
     await rate(env,'comment:'+user.id,20,3600);
     if(parentId){
      const parent=await one(env,'SELECT user_id FROM comments WHERE id=? AND track_id=? AND parent_id IS NULL AND deleted_at=0',parentId,tid);
      if(!parent)fail(400,'답글 대상을 찾을 수 없습니다.');
      assertUnblocked(env,parent.user_id);
     }
     const inserted=await one(env,`INSERT INTO comments(id,track_id,user_id,parent_id,body,timestamp,created)
      SELECT ?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM comments WHERE id=? AND track_id=? AND parent_id IS NULL AND deleted_at=0)
      ON CONFLICT(id) DO NOTHING RETURNING id`,cid,tid,user.id,parentId,text,timestamp,now(),parentId,parentId,tid);
     if(!inserted&&!(requestId&&await one(env,'SELECT id FROM comments WHERE id=?',cid)))fail(400,'답글 대상을 찾을 수 없습니다.');
    }
    if(!requestId)return json({id:cid},201);
    const [[reply],count]=await Promise.all([trackComments(env,detail,user,undefined,cid),one(env,`SELECT ${trackCommentCountSQL} n FROM tracks t WHERE t.id=?`,tid)]);
    return json({id:cid,reply:reply||null,comment_count:count.n},201);
   }
  }
 }
 m=path.match(/^\/api\/comments\/([\w:-]+)(\/like)?$/);
 if(m){
  requireUser(user);const c=await one(env,'SELECT * FROM comments WHERE id=?',m[1]);if(!c)fail(404,'댓글을 찾을 수 없습니다.');const track=await published(env,c.track_id);if(track.kind==='original')await assertArtistInteraction(env,track.artist_id,user?.id);if(c.deleted_at)fail(409,'이미 삭제된 댓글입니다.');
  if(m[2]){
   if(method==='PUT')await run(env,'INSERT OR IGNORE INTO comment_likes(user_id,comment_id) VALUES(?,?)',user.id,c.id);
   else if(method==='DELETE')await run(env,'DELETE FROM comment_likes WHERE user_id=? AND comment_id=?',user.id,c.id);else fail(405,AifectMessages.unsupportedRequest);
  }else{
   if(c.user_id!==user.id&&!(method==='DELETE'&&track.user_id===user.id))fail(403,'내 댓글 또는 내 작품의 댓글만 삭제할 수 있습니다.');
   if(method==='PATCH'){const b=await req.json();await run(env,'UPDATE comments SET body=?,edited=? WHERE id=? AND deleted_at=0',str(b.body,2000),now(),c.id);}
   else if(method==='DELETE')await removeComment(env,c.id,user.id);
   else fail(405,AifectMessages.unsupportedRequest);
  }return json({ok:true});
 }
 m=path.match(/^\/api\/(artists|producers)\/([\w-]+)(\/follow)?$/);
 if(m){
  const kind=m[1]==='artists'?'artist':'producer';
  const entity=await one(env,`SELECT id,${kind==='producer'?producerNameSQL('producers'):'name'} name,bio,created,image_version${kind==='producer'?',banner_version,user_id,(SELECT account_type FROM users WHERE id=producers.user_id) account_type,'+partnerBadgeSQL('producers.user_id')+' partner_eligible,'+producerNameSQL('producers')+' display_name':''} FROM ${m[1]} WHERE id=?${kind==='artist'?' AND '+namedArtistSQL('name'):''}`,m[2]);if(!entity)fail(404,'프로필을 찾을 수 없습니다.');
  const partnerBadge=entity.partner_eligible?'공식 파트너':null;delete entity.partner_eligible;
  const owner=kind==='producer'?entity:await one(env,'SELECT p.user_id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=?',entity.id);assertUnblocked(env,owner?.user_id);
  if(kind==='artist')await assertArtistInteraction(env,entity.id,user?.id);
  if(!m[3]&&method==='GET'){
   const own=kind==='producer'&&user?.id===entity.user_id,dashboardRequested=kind==='producer'&&url.searchParams.get('dashboard')==='1',manage=own&&dashboardRequested;
   const profileWorks=kind==='producer'&&dashboardRequested&&url.searchParams.get('work_list')==='1';
   const feedShell=profileWorks&&own&&url.searchParams.get('feed_shell')==='1';
   const workLimit=profileWorks?-1:500;
   const [count,tracks,covers,gifts,identity,gallery,inviteCrew,dashboard,ai,followsViewer]=await Promise.all([
    followCounts(env,owner.user_id,user?.id,kind==='artist'?entity.id:''),
    feedShell?[]:trackList(env,`${manage?"((t.user_id=? AND t.status!='deleted') OR "+VISIBLE()+')':VISIBLE()} AND t.kind='original' AND t.${kind}_id=?`,[...(manage?[user.id]:[]),entity.id], 't.created DESC',workLimit,manage,profileWorks),
    kind==='producer'?(feedShell?[]:trackList(env,`${manage?"((t.user_id=? AND t.status!='deleted') OR "+VISIBLE()+')':VISIBLE()} AND t.kind='cover' AND (t.producer_id=? OR dt.producer_id=? OR EXISTS(SELECT 1 FROM tracks child WHERE child.duet_parent_id=t.id AND child.producer_id=? AND ${VISIBLE('child')}))`,[...(manage?[user.id]:[]),entity.id,entity.id,entity.id], 't.created DESC',workLimit,manage,profileWorks)):null,
    kind==='producer'&&!dashboardRequested&&url.searchParams.get('gift_summary')!=='0'?profileGifts(env,entity.id):null,
    own||dashboardRequested?playerIdentity(env,entity.user_id):null,
    kind==='producer'?profileGallery(env,entity.id,own):artistGallery(env,entity.id,user),
    kind==='producer'&&user&&entity.user_id!==user.id?one(env,'SELECT c.id,c.name FROM crew_members cm JOIN crews c ON c.id=cm.crew_id WHERE cm.user_id=? AND NOT EXISTS(SELECT 1 FROM crew_members target WHERE target.crew_id=c.id AND target.user_id=?) AND NOT EXISTS(SELECT 1 FROM crew_bans WHERE crew_id=c.id AND user_id=?)',user.id,entity.user_id,entity.user_id):null,
    kind==='producer'?profileDashboard(env,entity,user,profileWorks,feedShell):null,
    kind==='producer'?supportFollowCount(env,entity.user_id,user?.id||null):0,
    kind==='producer'?producerFollowsViewer(env,entity.user_id,user?.id):false
   ]);
   if(dashboardRequested)await profileCoverParticipation(env,covers,user);
   const profileIdentity=identity&&!own?{premium_style_until:identity.premium_style_until,premium_default_frame:identity.premium_default_frame,profile_frame:identity.profile_frame,profile_frame_artwork:identity.profile_frame_artwork}:identity;
   // Profile visitors receive public works, never their owner's private XP totals.
   if(!own)for(const track of [...tracks,...(covers||[])])delete track.player_xp;
   return json({profile:kind==='producer'?{...entity,partner_badge:partnerBadge,...profileIdentity,public_number:dashboard.public_number,public_id:dashboard.public_id}:entity,tracks,followers:count.followers,human_followers:Math.max(0,count.followers-ai),ai_followers:ai,follows_viewer:followsViewer,gallery,...(kind==='producer'?{...dashboard,following_count:count.following,covers,gifts,invite_crew:inviteCrew,gallery_limit:PROFILE_GALLERY_LIMIT}:{can_manage:await canManageArtist(env,entity.id,user),can_edit_portrait:user?.id===owner?.user_id,gallery_limit:GALLERY_LIMIT,fanpage:await fanpageData(env,entity.id)})});
  }
  requireUser(user);
  if(method==='PUT')await run(env,'INSERT OR IGNORE INTO follows(user_id,kind,target_id,created) VALUES(?,?,?,?)',user.id,kind,entity.id,now());
  else if(method==='DELETE')await run(env,'DELETE FROM follows WHERE user_id=? AND kind=? AND target_id=?',user.id,kind,entity.id);else fail(405,AifectMessages.unsupportedRequest);
  const [ai,counts,followsViewer]=await Promise.all([
   kind==='producer'?supportFollowCount(env,entity.user_id,user.id):0,
   followCounts(env,owner.user_id,user.id,kind==='artist'?entity.id:''),
   kind==='producer'?producerFollowsViewer(env,entity.user_id,user.id):false
  ]);
  return json({ok:true,following:method==='PUT',profile:entity,followers:counts.followers,human_followers:Math.max(0,counts.followers-ai),ai_followers:ai,follows_viewer:followsViewer});
 }
 if(path==='/api/history'&&method==='GET'){requireUser(user);return json({tracks:await trackList(env,VISIBLE()+" AND t.id IN (SELECT track_id FROM listens WHERE user_id=?)",[user.id],`(SELECT MAX(started) FROM listens l WHERE l.track_id=t.id AND l.user_id='${user.id.replaceAll("'",'')}') DESC`)});}

 return null;
}
