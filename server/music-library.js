import {rows,one,json,fail} from './db.js';
import {requireUser} from './auth.js';
import {trackList,VISIBLE} from './catalog.js';
import {playlistSummaries} from './discovery.js';
import {activePlaylistSQL} from './membership.js';
import {publicNameSQL,producerNameSQL} from './identity.js';

// Independent music-library reads; existing playlist, like and playback writes stay unchanged.
export async function musicLibraryRoute(req,env,path,user){
 if(path!=='/api/me/music-library')return null;
 requireUser(user);if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 const p=new URL(req.url).searchParams,section=p.get('section')||'saved';
 if(!['saved','likes','history','playlists'].includes(section))fail(400,'보관함 분류를 확인해주세요.');
 const q=(p.get('q')||'').trim().slice(0,100),sort=['recent','oldest','title','custom'].includes(p.get('sort'))?p.get('sort'):'recent';
 const offset=Math.max(0,Math.min(100000,Math.floor(Number(p.get('offset'))||0))),limit=Math.max(1,Math.min(50,Math.floor(Number(p.get('limit'))||12)));
 const blocked=env.AIFECT_BLOCKED||[],scope=VISIBLE()+(blocked.length?' AND t.user_id NOT IN ('+blocked.map(()=>'?').join(',')+')':''),uid=user.id;
 const sources={likes:{condition:'EXISTS(SELECT 1 FROM likes l WHERE l.track_id=t.id AND l.user_id=?)',date:'(SELECT created FROM likes l WHERE l.track_id=t.id AND l.user_id=?)'},history:{condition:'EXISTS(SELECT 1 FROM listens l WHERE l.track_id=t.id AND l.user_id=?)',date:'(SELECT MAX(started) FROM listens l WHERE l.track_id=t.id AND l.user_id=?)'}};
 const counts={saved:null};
 for(const [key,s] of Object.entries(sources))counts[key]=(await one(env,`SELECT count(*) n FROM tracks t WHERE ${scope} AND ${s.condition}`,...blocked,uid)).n;
 const collectionWhere='(p.user_id=? OR (p.is_public=1 AND EXISTS(SELECT 1 FROM playlist_saves ps WHERE ps.playlist_id=p.id AND ps.user_id=?))) AND (p.user_id=? OR '+activePlaylistSQL()+')';
 const collectionCount=async(extra='',args=[])=> (await one(env,`SELECT count(*) n FROM playlists p JOIN users u ON u.id=p.user_id WHERE ${collectionWhere}${extra}`,uid,uid,uid,...args)).n;
 counts.playlists=await collectionCount();
 const response={section,counts,items:[],total:0,nextOffset:null,capabilities:{saved:false,downloads:false}};
 if(section==='saved')return json(response);
 if(section==='playlists'){
  const filter=['mine','saved'].includes(p.get('filter'))?p.get('filter'):'all',extra=(filter==='mine'?' AND p.user_id=?':filter==='saved'?' AND p.user_id!=?':'')+(q?' AND (p.name LIKE ? OR p.description LIKE ? OR '+publicNameSQL()+' LIKE ?)':''),args=[...(filter==='all'?[]:[uid]),...(q?Array(3).fill('%'+q+'%'):[])];
  response.total=await collectionCount(extra,args);
  const order=sort==='title'?'p.name COLLATE NOCASE,p.id':sort==='oldest'?'COALESCE(ps.created,p.created),p.id':sort==='custom'?'pinned DESC,position,p.created DESC,p.id':'COALESCE(ps.created,p.created) DESC,p.id';
  response.items=await playlistSummaries(env,uid,collectionWhere+extra,[uid,uid,uid,...args],order,`${limit+1} OFFSET ${offset}`);
 }else{
  const s=sources[section],search=q?' AND (t.title LIKE ? OR a.name LIKE ? OR ('+producerNameSQL()+') LIKE ?)':'',searchArgs=q?Array(3).fill('%'+q+'%'):[];
  response.total=(await one(env,`SELECT count(*) n FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id WHERE ${scope} AND ${s.condition}${search}`,...blocked,uid,...searchArgs)).n;
  // Only the validated account ID is interpolated into the internal ORDER BY expression.
  const stamp=s.date.replace('?',"'"+uid.replaceAll("'","''")+"'"),order=sort==='title'?'t.title COLLATE NOCASE,t.id':stamp+(sort==='oldest'?' ASC':' DESC')+',t.id';
  response.items=await trackList(env,scope+' AND '+s.condition+search,[...blocked,uid,...searchArgs],order,`${limit+1} OFFSET ${offset}`);
  if(response.items.length){const ids=response.items.map(t=>t.id),source=section==='likes'?'likes':'listens',date=section==='likes'?'MAX(created)':'MAX(started)',dates=await rows(env,`SELECT track_id,${date} at FROM ${source} WHERE user_id=? AND track_id IN (${ids.map(()=>'?').join(',')}) GROUP BY track_id`,uid,...ids),map=new Map(dates.map(d=>[d.track_id,d.at]));response.items=response.items.map(t=>({...t,library_at:map.get(t.id)}));}
 }
 if(response.items.length>limit){response.items.pop();response.nextOffset=offset+limit;}
 if(section!=='playlists'&&response.items.length){const ids=response.items.map(t=>t.id),liked=new Set((await rows(env,`SELECT track_id FROM likes WHERE user_id=? AND track_id IN (${ids.map(()=>'?').join(',')})`,uid,...ids)).map(t=>t.track_id));response.items=response.items.map(t=>({...t,liked:liked.has(t.id)}));}
 return json(response);
}
