import * as AifectMessages from '../shared/system-messages.js';
import {one,rows,run,query,now,fail,json} from './db.js';
import {uploadQuotaQuery,uploadQuotaResult} from './upload-limits.js';

export const isPremium=user=>!!user&&Number(user.premium_until)>now();
export const playlistLimit=()=>null;
export function activePlaylistSQL(){return '(1=1)';}
export async function membership(env,user){
 if(!user)return {plan:'free',playlist_limit:null,playlists_unlimited:true,owned_count:0,active_ids:[],locked_count:0,full_lyrics:true,premium_until:null,checkout_available:false};
 const at=now(),[playlists,quota]=await env.DB.batch([
  query(env,`SELECT count(*) n FROM playlists WHERE user_id=?`,user.id),
  uploadQuotaQuery(env,user,at)
 ]),owned=playlists.results;
 return {upload_quota:uploadQuotaResult(user,quota.results[0].used,at),plan:isPremium(user)?'premium':'free',playlist_limit:playlistLimit(user),playlists_unlimited:true,owned_count:owned[0].n,active_ids:[],locked_count:0,full_lyrics:true,premium_until:isPremium(user)?user.premium_until:null,checkout_available:false};
}
export async function requireActivePlaylist(env,p){
 if(!await one(env,`SELECT p.id FROM playlists p WHERE p.id=? AND ${activePlaylistSQL()}`,p.id))fail(403,'보관 중인 플레이리스트입니다. 내 보관함에서 사용할 목록을 선택해 주세요.');
}
export async function membershipRoute(req,env,path,user){
 if(path==='/api/membership'&&req.method==='GET')return json({membership:await membership(env,user)});
 if(path==='/api/library/playlists/active'&&req.method==='PUT'){
  if(!user)fail(401,AifectMessages.signIn);
  const ids=(await req.json()).playlist_ids;
  if(!Array.isArray(ids)||ids.some(x=>typeof x!=='string'))fail(400,'목록을 확인해 주세요.');
  // Older app clients may still send a selection. All owned lists stay active.
  return json({membership:await membership(env,user)});
 }
 return null;
}
