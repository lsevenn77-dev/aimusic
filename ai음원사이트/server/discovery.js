import {rows,one,run,query,now,fail,str,json} from './db.js';
import {requireUser} from './auth.js';
import {trackList,published,GENRES} from './catalog.js';
import {activePlaylistSQL,membership} from './membership.js';

export const MOODS=[
 {id:'comfort',name:'우울할 때',caption:'마음을 다독이는 음악',keywords:['우울','위로','감성','슬픔'],symbol:'☁'},
 {id:'energy',name:'기분 업',caption:'오늘의 에너지를 채워요',keywords:['기분 업','기분업','신나는','활기','댄스'],symbol:'↗'},
 {id:'focus',name:'집중',caption:'작업과 공부에 몰입할 때',keywords:['집중','공부','작업','focus','lo-fi','lofi'],symbol:'◎'},
 {id:'drive',name:'드라이브',caption:'길 위에서 만나는 사운드',keywords:['드라이브','drive','여행'],symbol:'→'},
 {id:'sleep',name:'잠들기 전',caption:'하루를 천천히 마무리해요',keywords:['잠들기','수면','휴식','잔잔','sleep'],symbol:'☾'},
 {id:'workout',name:'운동',caption:'리듬에 맞춰 한 걸음 더',keywords:['운동','workout','러닝'],symbol:'ϟ'}
];
function moodFilter(mood){return {sql:'('+mood.keywords.map(()=>"lower(t.tags) LIKE ?").join(' OR ')+')',args:mood.keywords.map(k=>'%'+k.toLowerCase()+'%')};}

export async function playlistSummaries(env,userId='',where='p.is_public=1',args=[],sort='p.created DESC,p.id',limit=100){
 const data=await rows(env,`SELECT p.id,p.user_id,p.name,p.description,p.is_public,p.created,u.name owner_name,${activePlaylistSQL()} active,
 (SELECT count(*) FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=p.id AND t.status='published') tracks,
 (SELECT COALESCE(sum(t.duration),0) FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=p.id AND t.status='published') duration,
 (SELECT count(*) FROM playlist_saves s WHERE s.playlist_id=p.id) saves,
 (ps.user_id IS NOT NULL) saved,COALESCE(pref.pinned,0) pinned,COALESCE(pref.position,0) position,
 (SELECT json_group_array(json_object('id',c.id,'title',c.title,'has_cover',c.has_cover,'cover_version',c.cover_version)) FROM
  (SELECT t.id,t.title,t.has_cover,t.cover_version FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=p.id AND t.status='published' ORDER BY pt.position,pt.created,pt.track_id LIMIT 4) c) covers_json
 FROM playlists p JOIN users u ON u.id=p.user_id
 LEFT JOIN playlist_saves ps ON ps.playlist_id=p.id AND ps.user_id=?
 LEFT JOIN playlist_preferences pref ON pref.playlist_id=p.id AND pref.user_id=?
 WHERE (${where}) AND (p.user_id=? OR ${activePlaylistSQL()}) ORDER BY ${sort} LIMIT ${limit}`,userId,userId,...args,userId);
 return data.map(({covers_json,...p})=>({...p,locked:!p.active,covers:JSON.parse(covers_json||'[]')}));
}
async function accessibleLibrary(env,uid){return playlistSummaries(env,uid,'(p.user_id=? OR (p.is_public=1 AND ps.user_id IS NOT NULL))',[uid],'pinned DESC,position ASC,p.created DESC,p.id',500);}
async function libraryMember(env,uid,pid){const p=await one(env,`SELECT p.* FROM playlists p WHERE p.id=? AND (p.user_id=? OR (p.is_public=1 AND ${activePlaylistSQL()} AND EXISTS(SELECT 1 FROM playlist_saves s WHERE s.playlist_id=p.id AND s.user_id=?)))`,pid,uid,uid);if(!p)fail(404,'보관함에서 이 플레이리스트를 찾을 수 없습니다.');return p;}

export async function discoveryRoute(req,env,path,user){
 const url=new URL(req.url),method=req.method;
 if(path==='/api/discovery'&&method==='GET'){
  const mood=MOODS.find(m=>m.id===url.searchParams.get('mood')),genre=url.searchParams.get('genre'),following=url.searchParams.get('following')==='1';
  if(url.searchParams.has('mood')&&!mood)fail(400,'분위기를 다시 선택해주세요.');
  let where="t.status='published'",args=[];
  if(mood){const f=moodFilter(mood);where+=' AND '+f.sql;args.push(...f.args);}
  if(genre&&GENRES.includes(genre)){where+=' AND t.genre=?';args.push(genre);}
  if(following){requireUser(user);where+=" AND EXISTS(SELECT 1 FROM follows f WHERE f.user_id=? AND ((f.kind='artist' AND f.target_id=t.artist_id) OR (f.kind='producer' AND f.target_id=t.producer_id)))";args.push(user.id);}
  const filters=MOODS.map(moodFilter),counts=await one(env,`SELECT ${filters.map((f,i)=>`COALESCE(sum(CASE WHEN ${f.sql} THEN 1 ELSE 0 END),0) n${i}`).join(',')} FROM tracks t WHERE t.status='published'`,...filters.flatMap(f=>f.args));
  return json({tracks:await trackList(env,where,args,following?'t.created DESC':'(plays+likes*3) DESC,t.created DESC'),moods:MOODS.map((m,i)=>({id:m.id,name:m.name,caption:m.caption,symbol:m.symbol,count:counts['n'+i]})),basis:following?'following':mood?'tags':'popular'});
 }
 if(path==='/api/search'&&method==='GET'){
  const q=(url.searchParams.get('q')||'').trim().slice(0,100);if(!q)return json({tracks:[],artists:[],producers:[],playlists:[]});const pattern='%'+q+'%';
  return json({
   tracks:await trackList(env,"t.status='published' AND (t.title LIKE ? OR a.name LIKE ? OR p.name LIKE ? OR t.genre LIKE ? OR t.tags LIKE ?)",Array(5).fill(pattern),'t.created DESC',100),
   artists:await rows(env,"SELECT a.*,(SELECT count(*) FROM follows f WHERE f.kind='artist' AND f.target_id=a.id) followers FROM artists a WHERE (a.name LIKE ? OR a.bio LIKE ?) AND EXISTS(SELECT 1 FROM tracks t WHERE t.artist_id=a.id AND t.status='published') ORDER BY a.name LIMIT 100",pattern,pattern),
   producers:await rows(env,"SELECT p.id,p.name,p.bio,p.image_version,(SELECT count(*) FROM follows f WHERE f.kind='producer' AND f.target_id=p.id) followers FROM producers p WHERE (p.name LIKE ? OR p.bio LIKE ?) AND EXISTS(SELECT 1 FROM tracks t WHERE t.producer_id=p.id AND t.status='published') ORDER BY p.name LIMIT 100",pattern,pattern),
   playlists:await playlistSummaries(env,user?.id||'',`p.is_public=1 AND ${activePlaylistSQL()} AND (p.name LIKE ? OR p.description LIKE ? OR u.name LIKE ?)`,[pattern,pattern,pattern])
  });
 }
 if(path==='/api/playlists'&&method==='GET'){
  const q=(url.searchParams.get('q')||'').slice(0,100),sort=url.searchParams.get('sort')==='popular'?'saves DESC,p.created DESC,p.id':'p.created DESC,p.id';
  return json({playlists:await playlistSummaries(env,user?.id||'',`p.is_public=1 AND ${activePlaylistSQL()} AND EXISTS(SELECT 1 FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=p.id AND t.status='published') AND (p.name LIKE ? OR p.description LIKE ? OR u.name LIKE ?)`,Array(3).fill('%'+q+'%'),sort)});
 }
 if(path==='/api/library'&&method==='GET'){
  requireUser(user);const items=await accessibleLibrary(env,user.id);
  return json({membership:await membership(env,user),likes:await trackList(env,"t.status='published' AND t.id IN (SELECT track_id FROM likes WHERE user_id=?)",[user.id],'t.created DESC',500),playlists:items.filter(p=>p.user_id===user.id),saved:items.filter(p=>p.user_id!==user.id),collections:items,
   follows:await rows(env,"SELECT f.*,COALESCE(a.name,p.name) name,COALESCE(a.bio,p.bio) bio,COALESCE(a.image_version,p.image_version) image_version FROM follows f LEFT JOIN artists a ON f.kind='artist' AND a.id=f.target_id LEFT JOIN producers p ON f.kind='producer' AND p.id=f.target_id WHERE f.user_id=?",user.id)});
 }
 let m=path.match(/^\/api\/playlists\/([\w-]+)\/save$/);
 if(m){
  requireUser(user);
  if(method==='DELETE'){await run(env,'DELETE FROM playlist_saves WHERE user_id=? AND playlist_id=?',user.id,m[1]);await run(env,'DELETE FROM playlist_preferences WHERE user_id=? AND playlist_id=? AND NOT EXISTS(SELECT 1 FROM playlists WHERE id=? AND user_id=?)',user.id,m[1],m[1],user.id);return json({ok:true});}
  if(method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
  const p=await one(env,`SELECT p.* FROM playlists p WHERE id=? AND is_public=1 AND ${activePlaylistSQL()}`,m[1]);if(!p)fail(404,'공개 플레이리스트를 찾을 수 없습니다.');if(p.user_id===user.id)fail(400,'내 플레이리스트는 이미 보관함에 있습니다.');
  await run(env,'INSERT OR IGNORE INTO playlist_saves(user_id,playlist_id,created) VALUES(?,?,?)',user.id,p.id,now());return json({ok:true});
 }
 if(path==='/api/library/playlists/order'&&method==='PUT'){
  requireUser(user);const b=await req.json(),ids=b.playlist_ids;if(!Array.isArray(ids)||ids.length>500||ids.some(x=>typeof x!=='string')||new Set(ids).size!==ids.length)fail(400,'목록 순서를 다시 확인해주세요.');
  const stored=await accessibleLibrary(env,user.id);if(ids.length!==stored.length||ids.some(id=>!stored.some(p=>p.id===id)))fail(409,'보관함이 변경됐습니다. 다시 열어주세요.');
  if(ids.length)await env.DB.batch(ids.map((id,i)=>query(env,'INSERT INTO playlist_preferences(user_id,playlist_id,position) VALUES(?,?,?) ON CONFLICT(user_id,playlist_id) DO UPDATE SET position=excluded.position',user.id,id,i)));
  return json({ok:true});
 }
 m=path.match(/^\/api\/library\/playlists\/([\w-]+)$/);
 if(m&&method==='PATCH'){
  requireUser(user);await libraryMember(env,user.id,m[1]);const b=await req.json();if(typeof b.pinned!=='boolean')fail(400,'고정 여부를 확인해주세요.');
  await run(env,'INSERT INTO playlist_preferences(user_id,playlist_id,pinned) VALUES(?,?,?) ON CONFLICT(user_id,playlist_id) DO UPDATE SET pinned=excluded.pinned',user.id,m[1],b.pinned?1:0);return json({ok:true});
 }
 return null;
}
