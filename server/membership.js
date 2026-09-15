import {one,rows,run,now,fail,json} from './db.js';

export const isPremium=user=>!!user&&Number(user.premium_until)>now();
export const playlistLimit=user=>isPremium(user)?10:2;

// Fixed limits allow correlated subqueries on D1/SQLite. The owner index bounds
// each lookup to one account. Expiry takes effect on reads without a cron job.
export function activePlaylistSQL(alias='p'){
 const choices=limit=>`SELECT choice.id FROM playlists choice JOIN users owner ON owner.id=choice.user_id
 WHERE choice.user_id=${alias}.user_id
 ORDER BY EXISTS(SELECT 1 FROM json_each(owner.playlist_selection) selected WHERE selected.value=choice.id) DESC,choice.created,choice.id LIMIT ${limit}`;
 return `(${alias}.id IN (${choices(2)}) OR (EXISTS(SELECT 1 FROM users member WHERE member.id=${alias}.user_id AND member.premium_until>unixepoch()) AND ${alias}.id IN (${choices(10)})))`;
}
export async function membership(env,user){
 if(!user)return {plan:'free',playlist_limit:2,owned_count:0,active_ids:[],locked_count:0,full_lyrics:false,premium_until:null,checkout_available:false};
 const owned=await rows(env,`SELECT p.id,${activePlaylistSQL()} active FROM playlists p WHERE p.user_id=? ORDER BY p.created,p.id`,user.id);
 return {plan:isPremium(user)?'premium':'free',playlist_limit:playlistLimit(user),owned_count:owned.length,active_ids:owned.filter(p=>p.active).map(p=>p.id),locked_count:owned.filter(p=>!p.active).length,full_lyrics:isPremium(user),premium_until:isPremium(user)?user.premium_until:null,checkout_available:false};
}
export async function requireActivePlaylist(env,p){
 if(!await one(env,`SELECT p.id FROM playlists p WHERE p.id=? AND ${activePlaylistSQL()}`,p.id))fail(403,'보관 중인 플레이리스트입니다. 내 보관함에서 사용할 목록을 선택해주세요.');
}
export async function membershipRoute(req,env,path,user){
 if(path==='/api/membership'&&req.method==='GET')return json({membership:await membership(env,user)});
 if(path==='/api/library/playlists/active'&&req.method==='PUT'){
  if(!user)fail(401,'로그인 후 이용해주세요.');
  const ids=(await req.json()).playlist_ids;
  const owned=await rows(env,'SELECT id FROM playlists WHERE user_id=?',user.id),limit=playlistLimit(user);
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length!==Math.min(limit,owned.length)||ids.some(id=>typeof id!=='string'||!owned.some(p=>p.id===id)))fail(400,`내 플레이리스트에서 사용할 목록 ${Math.min(limit,owned.length)}개를 선택해주세요.`);
  await run(env,'UPDATE users SET playlist_selection=? WHERE id=?',JSON.stringify(ids),user.id);
  return json({membership:await membership(env,user)});
 }
 return null;
}
