import {one,rows,run,now,fail,json} from './db.js';
import {requireUser} from './auth.js';
import {VISIBLE} from './catalog.js';

const allowed=`NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=n.recipient AND b.blocked_id=n.actor_id) OR (b.user_id=n.actor_id AND b.blocked_id=n.recipient))`;
export async function notificationsRoute(req,env,path,user){
 if(!path.startsWith('/api/notifications'))return null;
 requireUser(user);
 if(path==='/api/notifications/read'&&req.method==='POST'){
  const b=await req.json();
  if(!Array.isArray(b.ids)||b.ids.length>50||b.ids.some(x=>typeof x!=='string'||x.length>200))fail(400,'읽음 처리할 알림을 확인해주세요.');
  if(b.ids.length)await run(env,`UPDATE activity_notifications SET read_at=? WHERE recipient=? AND read_at=0 AND id IN (${b.ids.map(()=>'?').join(',')})`,now(),user.id,...b.ids);
  return json({ok:true});
 }
 if(req.method!=='GET'||!['/api/notifications','/api/notifications/summary'].includes(path))fail(404,'알림을 찾을 수 없어요.');
 const {unread}=await one(env,`SELECT count(*) unread FROM activity_notifications n WHERE recipient=? AND read_at=0 AND ${allowed}`,user.id);
 if(path.endsWith('/summary'))return json({unread});
 const q=new URL(req.url).searchParams,filter=q.get('filter')||'all';
 if(!['all','gifts','participation'].includes(filter))fail(400,'알림 종류를 확인해주세요.');
 const before=q.get('before'),cursor=before?await one(env,'SELECT created,id FROM activity_notifications WHERE id=? AND recipient=?',before,user.id):null;
 if(before&&!cursor)fail(400,'알림 목록을 새로 열어주세요.');
 const type=filter==='gifts'?"AND n.kind IN ('gift','person_gift')":filter==='participation'?"AND n.kind IN ('cover','duet')":'';
 const items=await rows(env,`SELECT n.*,COALESCE(p.name,u.name,'탈퇴한 회원') actor_name,p.id actor_profile_id,p.image_version actor_image_version,
 CASE WHEN n.kind='person_gift' THEN EXISTS(SELECT 1 FROM producers pr WHERE pr.id=n.target) ELSE EXISTS(SELECT 1 FROM tracks t WHERE t.id=n.target AND ${VISIBLE()}) END available
 FROM activity_notifications n LEFT JOIN users u ON u.id=n.actor_id LEFT JOIN producers p ON p.user_id=n.actor_id
 WHERE n.recipient=? AND ${allowed} ${type} ${cursor?'AND (n.created<? OR (n.created=? AND n.id<?))':''}
 ORDER BY n.created DESC,n.id DESC LIMIT 31`,user.id,...(cursor?[cursor.created,cursor.created,cursor.id]:[]));
 const more=items.length>30;items.length=Math.min(items.length,30);
 return json({items:items.map(({recipient,actor_id,...item})=>item),unread,next:more?items.at(-1).id:null});
}
