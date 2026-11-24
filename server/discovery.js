import {pageParams,libraryTransaction} from './library-transactions.js';
import {publicPlaylistSQL,restrictedSQL} from './playlist-visibility.js';
import {playlistEligibleSQL} from '../shared/playlist-policy.js';
import {followCounts} from './follow-management.js';
import {unifiedSearch} from './search.js';
import {assertUnblocked} from './account-safety.js';
import {trackArtworkSQL} from './track-artwork.js';
import {namedArtistSQL} from './artist-identity.js';
import {publicNameSQL,producerNameSQL} from './identity.js';
import {validGenre,MOODS,genreFilterSQL} from '../shared/genres.js';
import {rows,one,query,fail,json} from './db.js';
import {requireUser} from './auth.js';
import {trackList,published,GENRES,VISIBLE} from './catalog.js';
import {activePlaylistSQL,membership} from './membership.js';
import {profileDiscovery} from './profile-discovery.js';

export {MOODS};
function moodFilter(mood){return {sql:'EXISTS(SELECT 1 FROM json_each(t.moods_json) jm WHERE jm.value=?)',args:[mood.id]};}

export async function playlistSummaries(env,userId='',where='p.is_public=1',args=[],sort='p.created DESC,p.id',limit=100,sortArgs=[],scope={}){
 const visible="("+ (scope.visible||VISIBLE()) +") AND t.kind IN ('original','cover')";
 const data=await rows(env,(scope.cte||'')+`SELECT p.id,p.user_id,p.name,p.description,${publicPlaylistSQL()} is_public,${restrictedSQL()} restricted,p.created,p.updated,p.revision,p.image_version,${publicNameSQL()} owner_name,${activePlaylistSQL()} active,
 (SELECT count(*) FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=p.id AND ${visible})
  +(SELECT count(*) FROM playlist_extra_items x WHERE x.playlist_id=p.id) tracks,
 (SELECT count(*) FROM playlist_items i WHERE i.playlist_id=p.id) item_count,
 (SELECT COALESCE(sum(t.duration),0) FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=p.id AND ${visible}) duration,
 COALESCE(pref.position,0) position,
 EXISTS(SELECT 1 FROM playlist_saves saved WHERE saved.user_id=? AND saved.playlist_id=p.id) saved,
 (SELECT json_group_array(json_object('id',c.id,'title',c.title,'artist',c.artist,'kind',c.kind,'producer_id',c.producer_id,'producer',c.producer,'user_id',c.user_id,'artist_id',c.artist_id,'has_ai_artist',c.has_ai_artist,'duet_partner_id',c.duet_partner_id,'duet_partner',c.duet_partner,'artwork_id',c.artwork_id,'work_has_cover',c.work_has_cover,'work_cover_version',c.work_cover_version,'original_id',c.original_id,'original_has_cover',c.original_has_cover,'original_cover_version',c.original_cover_version,'has_cover',c.has_cover,'cover_version',c.cover_version)) FROM
  (SELECT t.id,t.title,t.kind,t.original_id,t.producer_id,t.user_id,t.artist_id,${namedArtistSQL()} has_ai_artist,${producerNameSQL('preview_producer')} producer,first_producer.id duet_partner_id,${producerNameSQL('first_producer')} duet_partner,o.has_cover original_has_cover,o.cover_version original_cover_version,${trackArtworkSQL()},
   CASE WHEN t.cover_mode='duet' AND t.duet_parent_id IS NOT NULL THEN (${producerNameSQL('first_producer')})||' & '||(${producerNameSQL('preview_producer')})||' · 듀엣'
    WHEN t.kind='cover' THEN (${producerNameSQL('preview_producer')})||CASE WHEN t.cover_mode='duet' THEN ' · 듀엣' ELSE ' · 커버' END
    WHEN ${namedArtistSQL()} THEN a.name ELSE ${producerNameSQL('preview_producer')} END artist
   FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id LEFT JOIN tracks o ON o.id=t.original_id
   LEFT JOIN artists a ON a.id=t.artist_id LEFT JOIN producers preview_producer ON preview_producer.id=t.producer_id
   LEFT JOIN tracks dt ON dt.id=t.duet_parent_id LEFT JOIN producers first_producer ON first_producer.id=dt.producer_id
   WHERE pt.playlist_id=p.id AND ${visible} ORDER BY pt.position,
    CASE WHEN substr(pt.playlist_id,1,9)='from-box-' THEN 0 ELSE pt.created END,
    CASE WHEN substr(pt.playlist_id,1,9)='from-box-' THEN t.kind ELSE '' END,pt.track_id LIMIT 4) c) covers_json
 FROM playlists p JOIN users u ON u.id=p.user_id
 LEFT JOIN playlist_preferences pref ON pref.playlist_id=p.id AND pref.user_id=?
 WHERE (${where}) AND (p.user_id=? OR ${publicPlaylistSQL()}${scope.includeUnavailable?' OR EXISTS(SELECT 1 FROM playlist_saves unav WHERE unav.playlist_id=p.id AND unav.user_id=?)':''}) ORDER BY ${sort} LIMIT ${limit}`,...(scope.args||[]),userId,userId,...args,userId,...(scope.includeUnavailable?[userId]:[]),...sortArgs);
 return data.map(({covers_json,...p})=>p.user_id!==userId&&!p.is_public?{id:p.id,name:'이용할 수 없는 플레이리스트',saved:true,unavailable:true,covers:[],tracks:0}:{...p,locked:false,covers:JSON.parse(covers_json||'[]')});
}
async function accessibleLibrary(env,uid){return playlistSummaries(env,uid,'(p.user_id=? OR (p.is_public=1 AND EXISTS(SELECT 1 FROM playlist_saves s WHERE s.user_id=? AND s.playlist_id=p.id)))',[uid,uid],'position ASC,p.updated DESC,p.id',20);}

export async function discoveryRoute(req,env,path,user){
 const url=new URL(req.url),method=req.method;
 if(path==='/api/discovery/profiles'&&method==='GET'){
  const kind=url.searchParams.get('kind'),sort=url.searchParams.get('sort')||'popular';
  if(!['artist','producer'].includes(kind)||!['popular','latest'].includes(sort))fail(400,'프로필 탐색 조건을 확인해 주세요.');
  return json({profiles:await profileDiscovery(env,kind,sort),sort});
 }
 const member=path.match(/^\/api\/members\/([A-Za-z]{3}[0-9]{4})$/);
 if(member&&method==='GET'){
  const profile=await one(env,`SELECT p.id,u.id user_id,m.code public_id,${publicNameSQL()} name,COALESCE(p.bio,'') bio,COALESCE(p.image_version,'') image_version FROM public_profile_ids m JOIN users u ON u.id=m.user_id LEFT JOIN producers p ON p.user_id=u.id WHERE m.code=? AND u.provider!='deleted'`,member[1].toUpperCase());
  if(!profile)fail(404,'프로필을 찾을 수 없습니다.');assertUnblocked(env,profile.user_id);return json({profile,counts:await followCounts(env,profile.user_id,user?.id)});
 }

 if(path==='/api/discovery'&&method==='GET'){
  const mood=MOODS.find(m=>m.id===url.searchParams.get('mood')),genre=url.searchParams.get('genre'),following=url.searchParams.get('following')==='1';
  if(url.searchParams.has('mood')&&!mood)fail(400,'분위기를 다시 선택해 주세요.');
  let where=VISIBLE()+" AND t.kind='original'",args=[];
  if(mood){const f=moodFilter(mood);where+=' AND '+f.sql;args.push(...f.args);}
  if(genre&&validGenre(genre)){where+=' AND '+genreFilterSQL();args.push(genre,genre);}
  if(following){requireUser(user);where+=" AND EXISTS(SELECT 1 FROM follows f WHERE f.user_id=? AND ((f.kind='artist' AND f.target_id=t.artist_id) OR (f.kind='producer' AND f.target_id=t.producer_id)))";args.push(user.id);}
  const filters=MOODS.map(moodFilter),[counts,tracks]=await Promise.all([one(env,`SELECT ${filters.map((f,i)=>`COALESCE(sum(CASE WHEN ${f.sql} THEN 1 ELSE 0 END),0) n${i}`).join(',')} FROM tracks t WHERE ${VISIBLE()} AND t.kind='original'`,...filters.flatMap(f=>f.args)),trackList(env,where,args,following?'t.created DESC':'(plays+likes*3) DESC,t.created DESC')]);
  return json({tracks,moods:MOODS.map((m,i)=>({id:m.id,name:m.name,caption:m.caption,symbol:m.symbol,count:counts['n'+i]})),basis:following?'following':mood?'ai':'popular'});
 }
 if(path==='/api/search'&&method==='GET')return unifiedSearch(env,user,url.searchParams);
 if(path==='/api/playlists'&&method==='GET'){
  const q=(url.searchParams.get('q')||'').slice(0,100),{limit,offset}=pageParams(url.searchParams),sort='p.created DESC,p.id';
  const blocked=q?(env.AIFECT_BLOCKED||[]):[],block=blocked.length?' AND p.user_id NOT IN (SELECT value FROM json_each(?))':'';
  const playlists=await playlistSummaries(env,user?.id||'',`${publicPlaylistSQL()}${block} AND ${activePlaylistSQL()} AND EXISTS(SELECT 1 FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=p.id AND ${VISIBLE()} AND ${playlistEligibleSQL()}) AND (instr(lower(p.name),lower(?))>0 OR instr(lower(p.description),lower(?))>0 OR instr(lower(${publicNameSQL()}),lower(?))>0)`,[...(blocked.length?[JSON.stringify(blocked)]:[]),...Array(3).fill(q)],sort,`${limit+1} OFFSET ${offset}`);
  const nextOffset=playlists.length>limit?offset+limit:null;if(nextOffset!==null)playlists.pop();return json({playlists,nextOffset});
 }
 if(path==='/api/follows'&&method==='GET'){
  requireUser(user);
  return json({follows:await rows(env,`SELECT f.*,COALESCE(a.name,(${producerNameSQL()}),CASE WHEN m.id IS NOT NULL THEN ${publicNameSQL('m')} END) name,COALESCE(a.bio,p.bio) bio,COALESCE(a.image_version,p.image_version) image_version FROM follows f LEFT JOIN users m ON f.kind='member' AND m.id=f.target_id LEFT JOIN artists a ON f.kind='artist' AND a.id=f.target_id LEFT JOIN producers p ON f.kind='producer' AND p.id=f.target_id WHERE f.user_id=? AND (a.id IS NOT NULL OR p.id IS NOT NULL OR m.id IS NOT NULL) ORDER BY f.created DESC,f.target_id`,user.id)});
 }
 if(path==='/api/library'&&method==='GET'){
  requireUser(user);
  const [items,plan,likes,follows]=await Promise.all([accessibleLibrary(env,user.id),membership(env,user),trackList(env,VISIBLE()+" AND t.id IN (SELECT track_id FROM likes WHERE user_id=?)",[user.id],'t.created DESC',500),rows(env,`SELECT f.*,COALESCE(a.name,(${producerNameSQL()}),CASE WHEN m.id IS NOT NULL THEN ${publicNameSQL('m')} END) name,COALESCE(a.bio,p.bio) bio,COALESCE(a.image_version,p.image_version) image_version FROM follows f LEFT JOIN users m ON f.kind='member' AND m.id=f.target_id LEFT JOIN artists a ON f.kind='artist' AND a.id=f.target_id LEFT JOIN producers p ON f.kind='producer' AND p.id=f.target_id WHERE f.user_id=?`,user.id)]);
  return json({membership:plan,likes,playlists:items,collections:items,follows});
 }
 if(path==='/api/library/playlists/order'&&method==='PUT'){
  requireUser(user);const b=await req.json(),ids=b.playlist_ids;if(!Array.isArray(ids)||ids.length>500||ids.some(x=>typeof x!=='string')||new Set(ids).size!==ids.length)fail(400,'목록 순서를 다시 확인해 주세요.');
  const stored=await accessibleLibrary(env,user.id);if(ids.length!==stored.length||ids.some(id=>!stored.some(p=>p.id===id)))fail(409,'보관함이 변경됐습니다. 다시 열어 주세요.');
  // Reorder this bounded window while preserving the ranks of every later page.
  if(ids.length)await libraryTransaction(env,[],[query(env,`WITH ranked AS (SELECT p.id,ROW_NUMBER() OVER(ORDER BY COALESCE(pref.position,0),p.updated DESC,p.id)-1 rank FROM playlists p LEFT JOIN playlist_preferences pref ON pref.playlist_id=p.id AND pref.user_id=? WHERE p.user_id=? OR (p.is_public=1 AND EXISTS(SELECT 1 FROM playlist_saves s WHERE s.playlist_id=p.id AND s.user_id=?))) INSERT INTO playlist_preferences(user_id,playlist_id,position) SELECT ?,id,CASE WHEN rank<? THEN (SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE value=ranked.id) ELSE rank END FROM ranked WHERE 1 ON CONFLICT(user_id,playlist_id) DO UPDATE SET position=excluded.position`,user.id,user.id,user.id,user.id,ids.length,JSON.stringify(ids))]);
  return json({ok:true});
 }
 return null;
}
