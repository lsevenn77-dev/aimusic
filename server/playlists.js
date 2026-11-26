import {playlistPrivatePrompt} from '../shared/system-messages.js';
import {publicContentContext} from './block-policy.js';
import {normalizePlaylistTitle} from '../shared/playlist-policy.js';
import {one,rows,query,run,now,id,str,fail,json,rate} from './db.js';
import {requireUser,hash} from './auth.js';
import {playlistSummaries} from './discovery.js';
import {libraryTransaction} from './library-transactions.js';
import {typedItems,legacyItems,itemKey,storedItems,hydrateItems,newItemsCondition,playlistCandidates,restrictedSQL,publicPlaylistSQL} from './playlist-items.js';

const isRestricted=items=>items.some(i=>i.kind!=='original');
function title(value){
 const name=str(value,80);
 if(!normalizePlaylistTitle(name))fail(400,'플레이리스트 이름을 입력해 주세요.');
 return name;
}
const visiblePlaylist=`(p.user_id=? OR ${publicPlaylistSQL()})`;
async function getPlaylist(env,pid,user){
 const p=await one(env,`SELECT p.*,${restrictedSQL()} restricted FROM playlists p WHERE p.id=? AND ${visiblePlaylist}`,pid,user?.id||'');
 if(!p)fail(404,'플레이리스트를 찾을 수 없습니다.');
 return p;
}
async function requestItems(env,body){
 if(body.items!==undefined)return typedItems(body.items);
 return legacyItems(env,body.track_ids??[]);
}
async function validateAdditions(env,uid,items,conditions,missingMessage='추가할 수 있는 콘텐츠를 찾을 수 없습니다.'){
 if(!items.length)return;
 const [sql,args]=newItemsCondition(env,uid,items);
 if(!(await one(env,`SELECT (${sql}) ok`,...args)).ok)fail(404,missingMessage);
 conditions.push([sql,args]);
}
function initialVisibility(body,items){
 if(body.is_public!==true)return 0;
 if(!items.length)fail(400,'콘텐츠를 추가한 뒤 공개할 수 있습니다.');
 if(isRestricted(items))fail(400,'커버곡 또는 더빙이 포함된 플레이리스트는 비공개로만 저장할 수 있습니다.');
 return 1;
}
function appendMembers(env,pid,items,at){
 const raw=JSON.stringify(items);
 return [
  query(env,`INSERT INTO playlist_tracks(playlist_id,track_id,position,created)
   SELECT ?,json_extract(value,'$.content_id'),json_extract(value,'$.position'),? FROM json_each(?) WHERE json_extract(value,'$.kind') IN ('original','cover')`,pid,at,raw),
  query(env,`INSERT INTO playlist_extra_items(playlist_id,kind,content_id,position,created)
   SELECT ?,'dubbing',json_extract(value,'$.content_id'),json_extract(value,'$.position'),? FROM json_each(?) WHERE json_extract(value,'$.kind')='dubbing'`,pid,at,raw)
 ];
}
function applyMembers(env,pid,stored,items){
 const old=new Set(stored.map(itemKey)),desired=new Map(items.map((i,position)=>[itemKey(i),{...i,position}]));
 const removal=stored.filter(i=>!desired.has(itemKey(i))),updates=[],added=[];
 for(const [key,i] of desired)if(!old.has(key))added.push(i);
 for(const i of stored)if(desired.has(itemKey(i))&&desired.get(itemKey(i)).position!==i.position)updates.push(desired.get(itemKey(i)));
 const statements=[];
 for(const [table,idCol,kind] of [['playlist_tracks','track_id',"(SELECT t.kind FROM tracks t WHERE t.id=playlist_tracks.track_id)"],['playlist_extra_items','content_id','playlist_extra_items.kind']]){
  const match=`json_extract(j.value,'$.content_id')=${table}.${idCol} AND json_extract(j.value,'$.kind')=${kind}`;
  if(removal.length)statements.push(query(env,`DELETE FROM ${table} WHERE playlist_id=? AND EXISTS(SELECT 1 FROM json_each(?) j WHERE ${match})`,pid,JSON.stringify(removal)));
  if(updates.length){
   const raw=JSON.stringify(updates);
   statements.push(query(env,`WITH positions AS (SELECT json_extract(value,'$.content_id') cid,json_extract(value,'$.kind') kind,json_extract(value,'$.position') pos FROM json_each(?))
    UPDATE ${table} SET position=x.pos FROM positions x WHERE playlist_id=? AND x.cid=${table}.${idCol} AND x.kind=${kind}`,raw,pid));
  }
 }
 if(added.length)statements.push(...appendMembers(env,pid,added,now()));
 return statements;
}
async function copyImage(env,source,pid) {
 if(!source?.image_version)return null;
 const version=id(),key=`images/playlist/${pid}/${version}`;
 const file=await env.BUCKET?.get(`images/playlist/${source.id}/${source.image_version}`);
 if(!file)fail(409,'원본 대표 이미지를 가져올 수 없습니다. 다시 시도해 주세요.');
 await env.BUCKET.put(key,file.body,{httpMetadata:{contentType:source.image_type,cacheControl:'private, no-store'}});
 return {key,version,type:source.image_type};
}
async function playlistBody(req){
 const text=await req.text();
 if(!text.trim())return {};
 let body;
 try{body=JSON.parse(text);}catch{fail(400,'입력 내용을 확인해 주세요.');}
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'입력 내용을 확인해 주세요.');
 return body;
}

async function createPlaylist(req,env,user,{sourceId=null,fromChart=false}={}){
 requireUser(user);
 const b=await playlistBody(req),name=title(b.name);
 const description=str(b.description??'',600,false),requestId=fromChart||b.request_id!==undefined?str(b.request_id,100):id();
 // Compare retries against the submitted snapshot before resolving current IDs.
 // Legacy clients retain the v2 fingerprint, including its "ids" field and raw
 // description, if a completed request is retried after a track is removed.
 const selection=fromChart||b.items!==undefined?{items:typedItems(b.items)}:{ids:b.track_ids??[]};
 const fingerprint=await hash(JSON.stringify({source:sourceId,name,...selection,pub:Number(!fromChart&&b.is_public===true),description:b.description||'',revision:b.source_revision??null,...(fromChart?{chart:true}:{})}));
 const replay=async()=>{
  const saved=await one(env,'SELECT * FROM library_requests WHERE user_id=? AND request_id=?',user.id,requestId);
  if(saved && saved.fingerprint!==fingerprint)fail(409,'같은 요청 식별자로 다른 내용을 저장할 수 없습니다.');
  return saved;
 };
 const prior=await replay();if(prior)return json({id:prior.result_id,replayed:true});
 const items=selection.items??await legacyItems(env,selection.ids),pub=fromChart?0:initialVisibility(b,items);
 if(fromChart&&(!items.length||items.some(item=>item.kind==='dubbing')))fail(400,'차트에서 저장할 수 있는 곡을 확인해 주세요.');
 if(items.length>500)fail(400,'플레이리스트에는 콘텐츠를 최대 500개까지 추가할 수 있습니다.');
 const source=sourceId?await getPlaylist(env,sourceId,user):null;
 const conditions=[];
 if(source){
  if(source.user_id===user.id)fail(400,'저장한 다른 사용자의 플레이리스트를 선택해 주세요.');
  if(b.source_revision!==source.revision)fail(409,'원본이 변경되었습니다. 편집 화면을 다시 열어 주세요.');
  conditions.push([`EXISTS(SELECT 1 FROM playlists p JOIN playlist_saves s ON s.playlist_id=p.id WHERE p.id=? AND p.revision=? AND ${publicPlaylistSQL()} AND s.user_id=?)`,[source.id,source.revision,user.id]]);
 }
 await rate(env,'playlist-create:'+user.id,30,60);
 await validateAdditions(env,user.id,items,conditions,fromChart?'차트에 현재 담을 수 없는 곡이 있습니다. 차트를 다시 열어 확인해 주세요.':undefined);
 const pid=id(),at=now(),image=await copyImage(env,source,pid);
 try{
  const statements=[query(env,'INSERT INTO playlists(id,user_id,name,name_key,is_public,created,updated,description,source_id,image_version,image_type) VALUES(?,?,?,?,?,?,?,?,?,?,?)',pid,user.id,name,normalizePlaylistTitle(name),pub,at,at,description,sourceId,image?.version||'',image?.type||''),
   ...appendMembers(env,pid,items.map((i,position)=>({...i,position})),at),
   query(env,'INSERT INTO library_requests(user_id,request_id,fingerprint,result_id,created) VALUES(?,?,?,?,?)',user.id,requestId,fingerprint,pid,at)];
  if(source)statements.push(query(env,'DELETE FROM playlist_saves WHERE user_id=? AND playlist_id=?',user.id,source.id));
  await libraryTransaction(env,conditions,statements);
 }catch(e){
  if(image)await env.BUCKET.delete(image.key).catch(()=>{});
  const raced=await replay();if(raced)return json({id:raced.result_id,replayed:true});
  throw e;
 }
 return json({id:pid},201);
}

export async function playlistsRoute(req,env,path,user){
 const method=req.method,params=new URL(req.url).searchParams;
 if(path==='/api/playlists/title-availability'&&method==='GET'){
  // Older clients still preflight names. Keep validation without a uniqueness check.
  requireUser(user);title(params.get('name'));
  return json({available:true});
 }
 if(path==='/api/playlists/candidates'&&method==='GET')return playlistCandidates(req,env,user);
 if(path==='/api/playlists/from-chart'&&method==='POST')return createPlaylist(req,env,user,{fromChart:true});
 if(path==='/api/playlists'&&method==='POST')return createPlaylist(req,env,user);
 const m=path.match(/^\/api\/playlists\/([\w-]+)(?:\/(save|fork|order|played|items|tracks)(?:\/([\w-]+))?)?$/);if(!m)return null;
 const [,pid,action,tid]=m;
 if(action==='save'&&method==='DELETE'){requireUser(user);await run(env,'DELETE FROM playlist_saves WHERE user_id=? AND playlist_id=?',user.id,pid);return json({saved:false});}
 if(action==='fork'&&method==='POST')return createPlaylist(req,env,user,{sourceId:pid});
 const p=await getPlaylist(env,pid,user),uid=user?.id||'';
 if(!action&&method==='GET'){
  const memberOfPublic=!!(p.is_public&&!p.restricted),context=memberOfPublic?publicContentContext(env):env;
  const stored=await storedItems(env,pid),items=await hydrateItems(context,uid,stored,memberOfPublic);
  // The initial ACL check, item hydration, and a simultaneous private conversion
  // can interleave. Only return data if the same authorized revision still exists.
  const playlist=(await playlistSummaries(context,uid,'p.id=? AND p.revision=?',[pid,p.revision]))[0];
  if(!playlist)fail(404,'플레이리스트를 찾을 수 없습니다.');
  return json({playlist,items:p.user_id===uid?items:items.filter(i=>i.available),tracks:items.filter(i=>i.available&&i.kind!=='dubbing').map(i=>i.content)});
 }
 requireUser(user);
 if(action==='save'&&method==='PUT'){
  if(p.user_id===uid||!p.is_public)fail(400,'다른 사용자의 공개 플레이리스트만 저장할 수 있습니다.');
  await libraryTransaction(env,[[`EXISTS(SELECT 1 FROM playlists p WHERE p.id=? AND ${publicPlaylistSQL()})`,[pid]]],[query(env,'INSERT OR IGNORE INTO playlist_saves(user_id,playlist_id,created) VALUES(?,?,?)',uid,pid,now())]);return json({saved:true});
 }
 if(action==='played'&&method==='POST'){
  await run(env,`INSERT INTO playlist_recents SELECT ?,p.id,? FROM playlists p WHERE p.id=? AND ${visiblePlaylist} ON CONFLICT(user_id,playlist_id) DO UPDATE SET played=excluded.played`,uid,now(),pid,uid);
  return json({ok:true});
 }
 if(p.user_id!==uid)fail(403,'내 플레이리스트만 변경할 수 있습니다.');
 const conditions=[['EXISTS(SELECT 1 FROM playlists WHERE id=? AND user_id=? AND revision=?)',[pid,uid,p.revision]]];
 if(!action&&method==='DELETE'){
  await libraryTransaction(env,conditions,[query(env,'DELETE FROM playlists WHERE id=?',pid)]);
  return json({ok:true});
 }
 const b=await playlistBody(req);
 if(b.revision!==undefined && b.revision!==p.revision)fail(409,'플레이리스트가 변경되었습니다. 다시 열어 주세요.');
 const stored=await storedItems(env,pid),old=new Set(stored.map(itemKey));
 let items=stored,name=b.name===undefined||b.name===p.name?p.name:title(b.name),pub=b.is_public===undefined?Number(p.is_public&&!p.restricted):Number(b.is_public===true);
 if(action==='order' && method==='PUT'){
  const ordered=await requestItems(env,b);
  const candidates=b.items!==undefined?stored:(await hydrateItems(env,uid,stored)).filter(i=>i.available&&i.kind!=='dubbing');
  const keys=new Set(candidates.map(itemKey));
  if(ordered.length!==keys.size||ordered.some(i=>!keys.has(itemKey(i))))fail(409,'플레이리스트가 변경되었습니다. 순서를 다시 확인해 주세요.');
  let index=0;items=stored.map(i=>keys.has(itemKey(i))?ordered[index++]:i);
 }else if((action==='items'||action==='tracks'&&tid)&&['PUT','DELETE'].includes(method)){
  const item=action==='items'?typedItems([b])[0]:(await legacyItems(env,[tid]))[0],key=itemKey(item);
  if(method==='PUT'){
   if(old.has(key))return json({ok:true,already_added:true});
   items=[...stored,item];
  }else items=stored.filter(i=>itemKey(i)!==key);
 }else if(!action&&method==='PATCH'){
  if(b.items!==undefined||b.track_ids!==undefined)items=await requestItems(env,b);
 }else fail(405,'지원하지 않는 요청입니다.');
 if(items.length>500 && items.length>stored.length)fail(400,'플레이리스트에는 콘텐츠를 최대 500개까지 추가할 수 있습니다.');
 const restricted=isRestricted(items);
 if(restricted){
  if(p.is_public&&!p.restricted && b.confirm_private!==true)fail(409,playlistPrivatePrompt);
  if(b.is_public===true)fail(400,'커버곡 또는 더빙이 포함된 플레이리스트는 비공개로만 저장할 수 있습니다.');
  pub=0;
 }
 if(!items.length){if(b.is_public===true)fail(400,'콘텐츠를 추가한 뒤 공개할 수 있습니다.');pub=0;}
 if(pub&&b.is_public===true && !(await hydrateItems(env,uid,items)).some(i=>i.available))fail(400,'공개할 수 있는 제작곡을 추가해 주세요.');
 await validateAdditions(env,uid,items.filter(i=>!old.has(itemKey(i))),conditions);
 const statements=[...(items===stored?[]:applyMembers(env,pid,stored,items)),
  query(env,'UPDATE playlists SET name=?,name_key=?,description=?,is_public=?,updated=?,revision=revision+1 WHERE id=?',name,normalizePlaylistTitle(name),str(b.description??p.description,600,false),pub,now(),pid)];
 await libraryTransaction(env,conditions,statements);
 return json({ok:true,is_public:!!pub,restricted,revision:p.revision+1});
}
