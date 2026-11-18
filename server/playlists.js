import {publicContentContext} from './block-policy.js';
import {normalizePlaylistTitle,playlistEligibleSQL} from '../shared/playlist-policy.js';
import {one,rows,query,run,now,id,str,fail,json,rate} from './db.js';
import {requireUser,hash} from './auth.js';
import {VISIBLE,trackList} from './catalog.js';
import {playlistSummaries} from './discovery.js';
import {playlistCandidates} from './playlist-policy.js';
import {libraryTransaction} from './library-transactions.js';

const title=value=>{const name=str(value,80);if(!normalizePlaylistTitle(name))fail(400,'이름을 입력해주세요.');return name;};
const idsInput=ids=>{if(!Array.isArray(ids)||ids.length>500||ids.some(x=>typeof x!=='string'||!x)||new Set(ids).size!==ids.length)fail(400,'플레이리스트에 담을 곡을 확인해주세요.');return ids;};
const trackCondition=(ids)=>[`(SELECT count(*) FROM tracks t WHERE t.id IN (SELECT value FROM json_each(?)) AND ${VISIBLE()} AND ${playlistEligibleSQL()})=?`,[JSON.stringify(ids),ids.length]];
const touch=(env,p)=>query(env,'UPDATE playlists SET revision=revision+1,updated=? WHERE id=?',now(),p.id);
async function availableTitle(env,name,exclude=''){
 // Never allow a new title to bypass not-yet-indexed legacy rows.
 if(await one(env,'SELECT id FROM playlists WHERE name_key IS NULL LIMIT 1'))fail(503,'기존 보관함을 안전하게 정리하고 있어요. 잠시 후 다시 시도해주세요.');
 return !await one(env,'SELECT id FROM playlists WHERE name_key=? AND id!=? LIMIT 1',normalizePlaylistTitle(name),exclude);
}
async function requireTitle(env,name,exclude=''){if(!await availableTitle(env,name,exclude))fail(409,'이미 사용 중인 플레이리스트 제목입니다.');}
async function getPlaylist(env,pid,user){
 const p=await one(env,`SELECT p.* FROM playlists p WHERE p.id=? AND (p.user_id=? OR p.is_public=1)`,pid,user?.id||'');
 if(!p)fail(404,'플레이리스트를 찾을 수 없습니다.');return p;
}
async function createPlaylist(req,env,user,source=null){
 requireUser(user);const b=await req.json(),name=title(b.name),key=normalizePlaylistTitle(name),ids=idsInput(b.track_ids??[]),pub=b.is_public===true?1:0;
 const requestId=b.request_id===undefined?id():str(b.request_id,100),fingerprint=await hash(JSON.stringify({source:source?.id||null,name,ids,pub,description:b.description||'',revision:b.source_revision??null}));
 const replay=async()=>{const saved=await one(env,'SELECT * FROM library_requests WHERE user_id=? AND request_id=?',user.id,requestId);if(saved&&saved.fingerprint!==fingerprint)fail(409,'같은 요청 식별자로 다른 내용을 저장할 수 없습니다.');return saved;};
 const prior=await replay();if(prior)return json({id:prior.result_id,replayed:true},200);
 await rate(env,'playlist-create:'+user.id,30,60);await requireTitle(env,name);
 if(pub&&!ids.length)fail(400,'곡을 담은 뒤 공개할 수 있어요.');
 const [condition,args]=trackCondition(ids,user.id);
 if(!(await one(env,`SELECT (${condition}) ok`,...args)).ok)fail(400,'플레이리스트에는 제작곡만 추가할 수 있어요.');
 const pid=id(),at=now(),conditions=[[condition,args]],statements=[
  query(env,'INSERT INTO playlist_title_claims(key) VALUES(?)',key),
  query(env,'INSERT INTO playlists(id,user_id,name,name_key,is_public,created,updated,description,source_id) VALUES(?,?,?,?,?,?,?,?,?)',pid,user.id,name,key,pub,at,at,str(b.description||'',600,false),source?.id||null),
  query(env,'INSERT INTO playlist_tracks(playlist_id,track_id,created,position) SELECT ?,value,?,CAST(key AS INTEGER) FROM json_each(?)',pid,at,JSON.stringify(ids)),
  query(env,'INSERT INTO library_requests(user_id,request_id,fingerprint,result_id,created) VALUES(?,?,?,?,?)',user.id,requestId,fingerprint,pid,at)
 ];
 if(source){
  if(source.user_id===user.id)fail(400,'저장한 다른 사람의 플레이리스트를 선택해주세요.');
  if(b.source_revision!==source.revision)fail(409,'원본이 변경됐어요. 편집 화면을 다시 열어주세요.');
  conditions.push([`EXISTS(SELECT 1 FROM playlists p JOIN playlist_saves s ON s.playlist_id=p.id WHERE p.id=? AND p.revision=? AND p.is_public=1 AND s.user_id=? )`,[source.id,source.revision,user.id]]);
  statements.push(query(env,'DELETE FROM playlist_saves WHERE user_id=? AND playlist_id=?',user.id,source.id));
 }
 try{await libraryTransaction(env,conditions,statements);}catch(e){const raced=await replay();if(raced)return json({id:raced.result_id,replayed:true});throw e;}
 return json({id:pid},201);
}
export async function playlistsRoute(req,env,path,user){
 const method=req.method,params=new URL(req.url).searchParams;
 if(path==='/api/playlists/title-availability'&&method==='GET'){
  requireUser(user);const name=title(params.get('name'));let exclude=params.get('exclude')||'';
  if(exclude&&!await one(env,'SELECT id FROM playlists WHERE id=? AND user_id=?',exclude,user.id))exclude='';
  return json({available:await availableTitle(env,name,exclude)});
 }
 if(path==='/api/playlists/candidates'&&method==='GET')return playlistCandidates(req,env,user);
 if(path==='/api/playlists'&&method==='POST')return createPlaylist(req,env,user);
 const m=path.match(/^\/api\/playlists\/([\w-]+)(?:\/(save|fork|order|played|tracks)(?:\/([\w-]+))?)?$/);if(!m)return null;
 const [,pid,action,tid]=m;
 // Removing an inaccessible bookmark must remain possible, without disclosing its source.
 if(action==='save'&&method==='DELETE'){requireUser(user);await run(env,'DELETE FROM playlist_saves WHERE user_id=? AND playlist_id=?',user.id,pid);return json({saved:false});}
 // Successful clone retries work even after the original becomes unavailable.
 if(action==='fork'&&method==='POST'){
  requireUser(user);const copy=req.clone(),b=await copy.json();
  const prior=b.request_id&&await one(env,'SELECT result_id FROM library_requests WHERE user_id=? AND request_id=?',user.id,b.request_id);
  if(prior){const source={id:pid};return createPlaylist(req,env,user,source);}
 }
 const p=await getPlaylist(env,pid,user);
 if(!action&&method==='GET')env=publicContentContext(env);
 if(!action&&method==='GET')return json({playlist:(await playlistSummaries(env,user?.id||'','p.id=?',[pid]))[0],tracks:await trackList(env,`${VISIBLE()} AND ${playlistEligibleSQL()} AND t.id IN (SELECT track_id FROM playlist_tracks WHERE playlist_id=?)`,[pid],`(SELECT position FROM playlist_tracks pt WHERE pt.playlist_id='${pid}' AND pt.track_id=t.id),t.id`,500)});
 requireUser(user);
 if(action==='save'&&method==='PUT'){
  if(p.user_id===user.id||!p.is_public)fail(400,'다른 사람의 공개 플레이리스트만 저장할 수 있어요.');
  await libraryTransaction(env,[[`EXISTS(SELECT 1 FROM playlists p WHERE p.id=? AND p.is_public=1 )`,[pid]]],[query(env,'INSERT OR IGNORE INTO playlist_saves(user_id,playlist_id,created) VALUES(?,?,?)',user.id,pid,now())]);return json({saved:true});
 }
 if(action==='fork'&&method==='POST')return createPlaylist(req,env,user,p);
 if(action==='played'&&method==='POST'){await run(env,'INSERT INTO playlist_recents VALUES(?,?,?) ON CONFLICT(user_id,playlist_id) DO UPDATE SET played=excluded.played',user.id,pid,now());return json({ok:true});}
 if(p.user_id!==user.id)fail(403,'내 플레이리스트만 변경할 수 있습니다.');
 const conditions=[['EXISTS(SELECT 1 FROM playlists WHERE id=? AND user_id=? AND revision=?)',[pid,user.id,p.revision]]],statements=[];
 if(action==='order'&&method==='PUT'){
  const b=await req.json(),ids=idsInput(b.track_ids),stored=await rows(env,`SELECT pt.track_id,(${VISIBLE()} AND ${playlistEligibleSQL()}) visible FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=? ORDER BY pt.position,pt.created,pt.track_id`,pid),visible=stored.filter(t=>t.visible).map(t=>t.track_id);
  if(visible.length!==ids.length||ids.some(x=>!visible.includes(x)))fail(409,'플레이리스트가 변경됐습니다. 다시 열어 순서를 확인해주세요.');
  let next=0;const all=stored.map(t=>t.visible?ids[next++]:t.track_id);
  statements.push(query(env,'UPDATE playlist_tracks SET position=(SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE value=track_id) WHERE playlist_id=?',JSON.stringify(all),pid));
 }else if(action==='tracks'&&tid&&['PUT','DELETE'].includes(method)){
  if(method==='PUT'){
   const actual=await one(env,'SELECT kind FROM tracks WHERE id=?',tid);if(actual?.kind!=='original')fail(400,'플레이리스트에는 제작곡만 추가할 수 있어요.');
   const condition=trackCondition([tid],user.id);if(!(await one(env,`SELECT (${condition[0]}) ok`,...condition[1])).ok)fail(404,'재생 가능한 곡을 찾을 수 없어요.');conditions.push(condition);
   if(await one(env,'SELECT track_id FROM playlist_tracks WHERE playlist_id=? AND track_id=?',pid,tid))return json({ok:true,already_added:true});
   conditions.push(['(SELECT count(*) FROM playlist_tracks WHERE playlist_id=?)<500',[pid]]);
   statements.push(query(env,'INSERT INTO playlist_tracks(playlist_id,track_id,created,position) SELECT ?,?,?,COALESCE(MAX(position)+1,0) FROM playlist_tracks WHERE playlist_id=?',pid,tid,now(),pid));
  }else{statements.push(query(env,'DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?',pid,tid),query(env,'UPDATE playlists SET is_public=0 WHERE id=? AND NOT EXISTS(SELECT 1 FROM playlist_tracks WHERE playlist_id=?)',pid,pid));}
 }else if(!action&&method==='PATCH'){
  const b=await req.json(),name=title(b.name??p.name),key=normalizePlaylistTitle(name),pub=b.is_public===undefined?p.is_public:b.is_public===true?1:0;
  if(b.revision!==undefined&&b.revision!==p.revision)fail(409,'다른 기기에서 변경됐어요. 다시 열어주세요.');
  if(key!==p.name_key){await requireTitle(env,name,pid);statements.push(query(env,'INSERT INTO playlist_title_claims(key) VALUES(?)',key));}
  if(pub){conditions.push([`EXISTS(SELECT 1 FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=? AND ${VISIBLE()} AND ${playlistEligibleSQL()})`,[pid]]);if(!await one(env,`SELECT pt.track_id FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=? AND ${VISIBLE()} AND ${playlistEligibleSQL()} LIMIT 1`,pid))fail(400,'곡을 담은 뒤 공개할 수 있어요.');}
  statements.push(query(env,'UPDATE playlists SET name=?,name_key=?,description=?,is_public=? WHERE id=?',name,key,str(b.description??p.description,600,false),pub,pid));
  if(key!==p.name_key)statements.push(query(env,'DELETE FROM playlist_title_claims WHERE key=? AND NOT EXISTS(SELECT 1 FROM playlists WHERE name_key=?)',p.name_key,p.name_key));
 }else if(!action&&method==='DELETE'){
  statements.push(query(env,'DELETE FROM playlists WHERE id=?',pid),query(env,'DELETE FROM playlist_title_claims WHERE key=? AND NOT EXISTS(SELECT 1 FROM playlists WHERE name_key=?)',p.name_key,p.name_key));
 }else fail(405,'지원하지 않는 요청입니다.');
 statements.push(touch(env,p));await libraryTransaction(env,conditions,statements);return json({ok:true});
}
