import {one,rows,run,now,fail,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {voiceCall} from './voice-bridge.js';
import {publicNameSQL,producerNameSQL} from './identity.js';
import {VISIBLE} from './catalog.js';
import {dubbingVisibleSQL} from './dubbing-access.js';

export const allowed=`(n.actor_id IS NULL OR EXISTS(SELECT 1 FROM users au WHERE au.id=n.actor_id AND au.provider!='deleted')) AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=n.recipient AND b.blocked_id=n.actor_id) OR (b.user_id=n.actor_id AND b.blocked_id=n.recipient))`;
// Only the exact ledger receipt can establish a legacy work source. A recipient
// profile identifies who was paid, even when the gift originated in a room.
const giftJoins=` LEFT JOIN gifts g ON n.kind IN ('gift','person_gift') AND n.currency='gold' AND g.id=substr(n.id,6,length(n.id)-6-length(n.recipient)) AND n.id='gift:'||g.id||':'||n.recipient AND g.sender_id=n.actor_id
 LEFT JOIN free_gifts f ON n.kind IN ('gift','person_gift') AND n.currency='silver' AND f.id=substr(n.id,6) AND n.id='star:'||f.id AND f.sender_id=n.actor_id
 LEFT JOIN gift_sources gs ON gs.currency=n.currency AND gs.gift_id=COALESCE(g.id,f.id)`;
const giftFields=`COALESCE(g.gift_type,f.gift_type) gift_type,
 COALESCE(gs.source_type,CASE WHEN COALESCE(g.track_id,f.track_id) IS NOT NULL THEN 'work' END) source_type,
 COALESCE(gs.source_id,g.track_id,f.track_id) source_id,
 COALESCE(gs.work_kind,CASE WHEN COALESCE(g.track_id,f.track_id) IS NOT NULL THEN 'song' END) work_kind,
 COALESCE(gs.source_title,CASE WHEN COALESCE(g.track_id,f.track_id) IS NOT NULL THEN n.source_title END,'') gift_source_title`;
export async function notificationsRoute(req,env,path,user){
 if(!path.startsWith('/api/notifications'))return null;
 requireUser(user);
 if(path==='/api/notifications/crew-requests'&&req.method==='POST'){
  const b=await req.json();if(!/^[\w-]{16,80}$/.test(b.request_id||''))fail(400,'요청 ID를 확인해주세요.');
  await rate(env,'crew-request:'+user.id,30,3600);
  const key='crew-request:'+user.id+':'+b.request_id;
  const prior=await one(env,'SELECT * FROM crew_participation_requests WHERE id=?',key);
  if(prior){if(prior.recipient!==b.recipient_id||prior.track_id!==b.track_id||prior.crew_id!==b.crew_id)fail(409,'이미 사용된 요청 ID입니다.');return json({id:key});}
  await run(env,`INSERT OR IGNORE INTO crew_participation_requests(id,crew_id,sender,recipient,track_id,created)
   SELECT ?,cm.crew_id,cm.user_id,peer.user_id,t.id,? FROM crew_members cm JOIN crew_members peer ON peer.crew_id=cm.crew_id JOIN tracks t ON t.user_id=cm.user_id
   JOIN users u ON u.id=peer.user_id WHERE cm.user_id=? AND cm.crew_id=? AND peer.user_id=? AND peer.user_id!=cm.user_id AND t.id=? AND ${VISIBLE()} AND u.provider!='deleted'
   AND NOT EXISTS(SELECT 1 FROM user_blocks WHERE (user_id=cm.user_id AND blocked_id=peer.user_id) OR (user_id=peer.user_id AND blocked_id=cm.user_id))`,key,now(),user.id,b.crew_id,b.recipient_id,b.track_id);
  if(!await one(env,'SELECT 1 FROM crew_participation_requests WHERE id=?',key))fail(403,'내 공개 작품과 현재 크루원을 선택해주세요.');return json({id:key},201);
 }
 const request=path.match(/^\/api\/notifications\/crew-requests\/(.+)$/);
 if(request&&req.method==='GET'){
  const item=await one(env,'SELECT r.*,t.title FROM crew_participation_requests r JOIN tracks t ON t.id=r.track_id JOIN crew_members cm ON cm.crew_id=r.crew_id AND cm.user_id=r.recipient WHERE r.id=? AND r.recipient=?',decodeURIComponent(request[1]),user.id);
  if(!item)fail(404,'참여 요청을 찾을 수 없어요.');
  const access=await resolveNotification(env,{kind:'cover',target:item.track_id,recipient:user.id});if(!access.available)fail(404,'참여 작품을 볼 수 없어요.');return json({title:item.title,href:access.href});
 }
 const open=path.match(/^\/api\/notifications\/([^/]+)\/open$/);
 if(open&&req.method==='POST'){
  const n=await one(env,`SELECT n.* FROM activity_notifications n WHERE n.id=? AND n.recipient=? AND ${allowed}`,decodeURIComponent(open[1]),user.id);
  if(!n)fail(404,'알림을 찾을 수 없어요.');
  const resolved=await resolveNotification(env,n,{opening:true});await run(env,'UPDATE activity_notifications SET read_at=? WHERE id=? AND recipient=?',now(),n.id,user.id);
  return json(resolved);
 }
 if(path==='/api/notifications/read'&&req.method==='POST'){
  const b=await req.json();
  if(!Array.isArray(b.ids)||b.ids.length>50||b.ids.some(x=>typeof x!=='string'||x.length>200))fail(400,'읽음 처리할 알림을 확인해주세요.');
  if(b.ids.length)await run(env,`UPDATE activity_notifications SET read_at=? WHERE recipient=? AND read_at=0 AND id IN (${b.ids.map(()=>'?').join(',')})`,now(),user.id,...b.ids);
  const {unread}=await one(env,`SELECT count(*) unread FROM activity_notifications n WHERE recipient=? AND read_at=0 AND ${allowed}`,user.id);
  return json({ok:true,unread});
 }
 if(req.method!=='GET'||!['/api/notifications','/api/notifications/summary'].includes(path))fail(404,'알림을 찾을 수 없어요.');
 const {unread}=await one(env,`SELECT count(*) unread FROM activity_notifications n WHERE recipient=? AND read_at=0 AND ${allowed}`,user.id);
 if(path.endsWith('/summary'))return json({unread});
 const q=new URL(req.url).searchParams,filter=q.get('filter')||'all';
 if(!['all','gifts','participation','comments','works','artists','crew'].includes(filter))fail(400,'알림 종류를 확인해주세요.');
 const before=q.get('before'),cursor=before?await one(env,'SELECT created,id FROM activity_notifications WHERE id=? AND recipient=?',before,user.id):null;
 if(before&&!cursor)fail(400,'알림 목록을 새로 열어주세요.');
 const type=filter==='gifts'?"AND n.kind IN ('gift','person_gift')":filter==='participation'?"AND n.kind IN ('cover','duet','dubbing_participation','dubbing_complete','work_status')":filter==='comments'?"AND n.kind IN ('comment','fan_comment','fan_post')":filter==='works'?"AND n.kind IN ('cover','duet','dubbing_participation','dubbing_complete','work_status')":filter==='artists'?"AND n.kind IN ('follow','artist_follower','artist_release')":filter==='crew'?"AND n.kind IN ('crew_notice','crew_invite','crew_approved','crew_request')":'';
 const items=await rows(env,`SELECT n.*,CASE WHEN n.kind='work_status' AND n.actor_id IS NULL THEN 'AIFECT' ELSE COALESCE(${publicNameSQL('u')},'탈퇴한 회원') END actor_name,p.id actor_profile_id,p.image_version actor_image_version,
 ${giftFields},(SELECT name FROM artists WHERE id=n.artist_id) artist_name
 FROM activity_notifications n LEFT JOIN users u ON u.id=n.actor_id LEFT JOIN producers p ON p.user_id=n.actor_id
 ${giftJoins}
 WHERE n.recipient=? AND ${allowed} ${type} ${cursor?'AND (n.created<? OR (n.created=? AND n.id<?))':''}
 ORDER BY n.created DESC,n.id DESC LIMIT 21`,user.id,...(cursor?[cursor.created,cursor.created,cursor.id]:[]));
 const more=items.length>20;items.length=Math.min(items.length,20);
 return json({items:await Promise.all(items.map(async n=>{const {recipient,actor_id,...item}=n;return {...item,...await resolveNotification(env,n)};})),unread,next:more?items.at(-1).id:null});
}

// Room access is enforced by the normal room entry flow. Check liveness only
// on open: listing a page must neither wake 20 rooms nor create memberships.
async function resolveGift(env,n,opening){
 const receipt='source_type' in n?n:await one(env,`SELECT ${giftFields} FROM activity_notifications n ${giftJoins} WHERE n.id=? AND n.recipient=?`,n.id,n.recipient);
 const decoration=n.id?.startsWith('decoration:');
 const type=decoration?'inventory':receipt?.source_type;
 const id=decoration?n.id.slice(11):receipt?.source_id;
 const routes={profile:'producer',talking_room:'voice',karaoke:'live',work:receipt?.work_kind==='dubbing'?'dubbing':'song',inventory:'inventory',shop:'gifts'};
 const route=routes[type];
 let title=decoration?n.gift_name:receipt?.gift_source_title||'';
 let href='',reason='source';
 if(route&&id){
  href='#'+route+(['inventory','gifts'].includes(route)?'':'/'+encodeURIComponent(id));
  reason='content';
  if(route==='voice'||route==='live'){
   if(opening){
    const response=await voiceCall(env,{id:n.recipient},id,'presence');
    if(!response.ok&&response.status!==404&&response.status!==410)fail(503,'방 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
    const state=response.ok?await response.json():null;
    if(!state?.active||(state.mode==='karaoke')!==(route==='live')){href='';reason='room';}
   }
  }else if(['producer','song','dubbing'].includes(route)){
   const queries={
    producer:`SELECT p.user_id owner,${producerNameSQL()} title FROM producers p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.provider!='deleted'`,
    song:`SELECT t.user_id owner,t.title FROM tracks t JOIN users u ON u.id=t.user_id WHERE t.id=? AND u.provider!='deleted' AND ${VISIBLE()}`,
    dubbing:`SELECT p.owner_id owner,p.title FROM dubbing_projects p JOIN users u ON u.id=p.owner_id WHERE p.id=? AND p.visibility='public' AND u.provider!='deleted' AND ${dubbingVisibleSQL()}`
   };
   const current=await one(env,`SELECT t.title FROM (${queries[route]}) t WHERE NOT EXISTS(SELECT 1 FROM user_blocks WHERE (user_id=? AND blocked_id=t.owner) OR (user_id=t.owner AND blocked_id=?))`,id,n.recipient,n.recipient);
   if(current)title=current.title;
   else href='';
  }
 }
 return {source_type:type||null,source_id:id||null,gift_source_kind:route||null,gift_source_target:id||null,gift_source_title:title,
  href,available:Number(!!href),unavailable_reason:href?'':reason,unavailable:href?'':reason==='source'?'이 선물의 발생 위치를 확인할 수 없어요.':reason==='room'?'종료되었거나 삭제된 방이에요.':'삭제·비공개 또는 접근 권한이 변경된 콘텐츠예요.'};
}

// Revalidate at click/dispatch time: stored history never grants access to content.
export async function resolveNotification(env,n,{opening=false}={}){
 if(n.kind==='gift'||n.kind==='person_gift')return resolveGift(env,n,opening);
 const enc=encodeURIComponent,blocked=async uid=>uid&&await one(env,'SELECT 1 FROM user_blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)',n.recipient,uid,uid,n.recipient);
 let href='',ok=false;
 if(n.target_kind==='fan'){
  const p=await one(env,`SELECT f.*,pr.user_id owner FROM artist_fan_posts f JOIN artists a ON a.id=f.artist_id JOIN producers pr ON pr.id=a.producer_id JOIN users u ON u.id=f.user_id WHERE f.id=? AND f.deleted=0 AND u.provider!='deleted' AND (f.parent_id IS NULL OR EXISTS(SELECT 1 FROM artist_fan_posts root WHERE root.id=f.parent_id AND root.deleted=0))`,n.target);
  ok=!!p&&!await blocked(p.user_id)&&!await blocked(p.owner);href='#artist/'+enc(p?.artist_id||n.artist_id)+'?tab=lounge&post='+enc(n.target);
 }else if(n.target_kind==='artist'){
  const a=await one(env,"SELECT p.user_id FROM artists a JOIN producers p ON p.id=a.producer_id JOIN users u ON u.id=p.user_id WHERE a.id=? AND u.provider!='deleted'",n.target);
  ok=!!a&&!await blocked(a.user_id);href='#artist/'+enc(n.target);
 }else if(n.target_kind==='work'){
  ok=!!await one(env,"SELECT 1 FROM tracks WHERE id=? AND user_id=? AND status!='deleted'",n.target,n.recipient);href='#studio?track='+enc(n.target);
 }else if(n.target_kind==='dubbing_manage'){
  ok=!!await one(env,'SELECT 1 FROM dubbing_projects WHERE id=? AND owner_id=? AND deleted_at=0',n.target,n.recipient);href='#dubbing/'+enc(n.target);
 }else if(n.target_kind==='dubbing'){
  const p=await one(env,`SELECT p.owner_id FROM dubbing_projects p JOIN users u ON u.id=p.owner_id WHERE p.id=? AND p.visibility='public' AND p.state='complete' AND u.provider!='deleted' AND ${dubbingVisibleSQL()}`,n.target);
  ok=!!p&&!await blocked(p.owner_id);href='#dubbing/'+enc(n.target);
 }else if(n.target_kind==='crew'||n.kind==='crew_notice'){
  const c=await one(env,'SELECT c.owner_id,c.join_policy,EXISTS(SELECT 1 FROM crew_members WHERE crew_id=c.id AND user_id=?) member FROM crews c WHERE c.id=? AND NOT EXISTS(SELECT 1 FROM crew_bans WHERE crew_id=c.id AND user_id=?)',n.recipient,n.target,n.recipient);
  ok=!!c&&!await blocked(c.owner_id)&&!!(c.member||n.kind==='crew_invite');
  if(n.kind==='crew_invite')ok=ok&&!!await one(env,'SELECT 1 FROM direct_messages WHERE id=? AND recipient_id=? AND crew_invite_id=?',n.entity_id,n.recipient,n.target);
  if(n.kind==='crew_request')ok=ok&&!!await one(env,'SELECT 1 FROM crew_participation_requests WHERE id=? AND recipient=?',n.entity_id,n.recipient);
  href=n.kind==='crew_request'?'#notifications?request='+enc(n.entity_id):'#crew/'+enc(n.target)+(n.kind==='crew_notice'?'?tab=notice':'');
 }else if(n.kind==='follow'){
  const p=await one(env,"SELECT p.user_id FROM producers p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.provider!='deleted'",n.target);ok=!!p&&!await blocked(p.user_id);href='#producer/'+enc(n.target);
 }else{
  const t=await one(env,`SELECT t.user_id FROM tracks t JOIN users u ON u.id=t.user_id WHERE t.id=? AND u.provider!='deleted' AND ${VISIBLE()}`,n.target);ok=!!t&&!await blocked(t.user_id);href='#song/'+enc(n.target);
  if(n.kind==='comment'){
   const cid=n.entity_id||n.id.slice(8),c=await one(env,'SELECT id FROM comments WHERE id=? AND track_id=? AND deleted_at=0',cid,n.target);ok=ok&&!!c;href+='?comment='+enc(cid);
  }
 }
 return {available:Number(ok),href:ok?href:'',unavailable:ok?'':'삭제·비공개 또는 접근 권한이 변경된 콘텐츠예요.'};
}
