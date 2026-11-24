import * as AifectMessages from '../shared/system-messages.js';
import {dubbingPosterSQL} from './dubbing-poster.js';
import {one,rows,query,json,fail} from './db.js';
import {requireUser} from './auth.js';
import {trackList,VISIBLE,SINGABLE} from './catalog.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {assertUnblocked} from './account-safety.js';
import {namedArtistSQL} from './artist-identity.js';

export async function profileCollectionsRoute(req,env,path,user){
 const m=path.match(/^\/api\/producers\/([\w-]+)\/(opportunities|originals|pinned-artists)$/);if(!m)return null;
 const [,pid,action]=m,p=await one(env,"SELECT p.* FROM producers p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.provider!='deleted'",pid);
 if(!p)fail(404,'프로필을 찾을 수 없습니다.');assertUnblocked(env,p.user_id);
 if(action==='pinned-artists'){
  if(req.method==='PUT'){
   requireUser(user);if(user.id!==p.user_id)fail(403,'본인의 아티스트만 고정할 수 있습니다.');
   const b=await req.json(),ids=b.ids;if(!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'))fail(400,'서로 다른 아티스트를 최대 3명까지 고정해 주세요.');
   const owned=await rows(env,`SELECT a.id FROM artists a WHERE a.producer_id=? AND ${namedArtistSQL()}`,pid);
   if(ids.some(x=>!owned.some(a=>a.id===x)))fail(403,'소속 아티스트만 고정할 수 있습니다.');
   await query(env,'INSERT INTO profile_artist_pins(producer_id,ids_json) VALUES(?,?) ON CONFLICT(producer_id) DO UPDATE SET ids_json=excluded.ids_json',pid,JSON.stringify(ids)).run();
  }else if(req.method!=='GET')fail(405,AifectMessages.unsupportedRequest);
  const saved=await one(env,'SELECT ids_json FROM profile_artist_pins WHERE producer_id=?',pid);
  return json({ids:JSON.parse(saved?.ids_json||'[]'),can_manage:user?.id===p.user_id});
 }
 if(req.method!=='GET')fail(405,'조회만 지원합니다.');
 const q=new URL(req.url).searchParams,offset=Math.max(0,Math.min(10000,Math.floor(Number(q.get('offset'))||0))),sort=q.get('sort')==='plays'?'plays DESC,t.created DESC,t.id':'t.created DESC,t.id';
 if(action==='originals'){
  const all=await trackList(env,`${VISIBLE()} AND t.kind='original' AND t.producer_id=?`,[pid],sort,offset+25);
  return json({profile:{id:p.id,name:p.name},tracks:all.slice(offset,offset+24),nextOffset:all.length>offset+24?offset+24:null});
 }
 const type=q.get('type')||'duet';if(!['duet','dubbing'].includes(type))fail(400,'작품 종류를 확인해 주세요.');
 let items=[];
 if(type==='duet')items=await trackList(env,`${VISIBLE()} AND t.user_id=? AND t.kind='cover' AND t.cover_mode='duet' AND t.duet_parent_id IS NULL AND t.duet_open=1 AND t.duet_part IN ('male','female') AND t.original_key!='' AND EXISTS(SELECT 1 FROM tracks o WHERE o.id=t.original_id AND ${VISIBLE('o')} AND ${SINGABLE('o')})`,[p.user_id],sort,offset+25);
 else if(env.DUBBING_ENABLED==='true')items=await rows(env,`SELECT p.id,${dubbingPosterSQL} posterUrl,p.title,p.owner_id,p.state,p.role_count roleCount,p.created,p.duration,p.options_json,(SELECT name FROM producers WHERE user_id=p.owner_id) owner_name,EXISTS(SELECT 1 FROM dubbing_role_claims vc WHERE vc.project_id=p.id AND vc.user_id=?) viewer_claimed,(SELECT count(*) FROM dubbing_role_claims c WHERE c.project_id=p.id) participants FROM dubbing_projects p JOIN users u ON u.id=p.owner_id WHERE u.provider!='deleted' AND p.visibility='public' AND ${dubbingVisibleSQL()} AND p.state IN ('recruiting','recording') AND EXISTS(SELECT 1 FROM dubbing_recordings r WHERE r.project_id=p.id AND r.user_id=? AND r.script_key=p.script_key AND EXISTS(SELECT 1 FROM dubbing_recording_lines l WHERE l.recording_id=r.id)) AND (SELECT count(*) FROM dubbing_role_claims c WHERE c.project_id=p.id)<p.role_count AND EXISTS(SELECT 1 FROM dubbing_sound_jobs j WHERE j.project_id=p.id AND j.script_key=p.script_key AND j.state='ready' AND j.output_key!='') AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.owner_id) OR (b.blocked_id=? AND b.user_id=p.owner_id)) ORDER BY p.created DESC,p.id LIMIT ? OFFSET ?`,user?.id||'',p.user_id,user?.id||'',user?.id||'',25,offset);
 if(type==='duet')items=items.slice(offset);
 return json({profile:{id:p.id,name:p.name},items:items.slice(0,24).map(t=>({...t,type,can_participate:!!user&&!(type==='duet'?user.id===p.user_id:t.viewer_claimed)})),nextOffset:items.length>24?offset+24:null});
}
