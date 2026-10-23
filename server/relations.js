import {one,rows,run,now,id,fail,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {assertUnblocked} from './account-safety.js';
import {producerNameSQL} from './identity.js';

export function relationProgress(xp){
 xp=Math.max(0,Number(xp)||0);const level=Math.min(50,1+Math.floor(Math.sqrt(xp/100))),floor=100*(level-1)**2,next=level===50?null:100*level**2;
 return {level,xp,next_xp:next,progress:next===null?1:(xp-floor)/(next-floor)};
}
export async function relationList(env,uid,viewer=uid){
 const own=uid===viewer;
 const list=await rows(env,`SELECT r.*,p.id profile_id,${producerNameSQL()} name,p.image_version,
  COALESCE((SELECT sum(amount) FROM relation_xp WHERE relation_id=r.id),0) xp
  FROM personal_relations r JOIN users u ON u.id=CASE WHEN r.first_user=? THEN r.second_user ELSE r.first_user END
  JOIN producers p ON p.user_id=u.id WHERE (r.first_user=? OR r.second_user=?) AND u.provider!='deleted'
  AND ${own?"r.state IN ('pending','accepted')":"r.state='accepted' AND r.first_public=1 AND r.second_public=1"}
  AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=r.first_user AND b.blocked_id=r.second_user) OR (b.user_id=r.second_user AND b.blocked_id=r.first_user) OR (b.user_id=? AND b.blocked_id=u.id) OR (b.blocked_id=? AND b.user_id=u.id))
  ORDER BY r.updated DESC,r.id`,uid,uid,uid,viewer,viewer);
 return list.map(r=>({id:r.id,profile_id:r.profile_id,name:r.name,image_version:r.image_version,state:r.state,public:r.first_public===1&&r.second_public===1,...relationProgress(r.xp),...(own?{incoming:r.requested_by!==uid,share:!!(r.first_user===uid?r.first_public:r.second_public)}:{})}));
}
export async function relationRoute(req,env,path,user){
 if(!path.startsWith('/api/me/relations'))return null;requireUser(user);
 const match=path.match(/^\/api\/me\/relations(?:\/([\w-]+))?$/);if(!match)fail(404,'관계를 찾을 수 없어요.');
 if(req.method==='GET'&&!match[1])return json({relations:await relationList(env,user.id),rules:[{kind:'message',xp:5},{kind:'comment',xp:5},{kind:'like',xp:1},{kind:'gift',xp:5}],daily_rule:'각 활동은 보낸 사람별 하루 한 번 적립됩니다. 수락 이후 활동만 반영됩니다.'});
 if(req.method==='POST'&&!match[1]){
  const b=await req.json(),p=await one(env,"SELECT p.user_id FROM producers p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.provider!='deleted'",b.profile_id||'');
  if(!p||p.user_id===user.id)fail(400,'관계를 맺을 다른 회원을 선택해주세요.');assertUnblocked(env,p.user_id);await rate(env,'relation-request:'+user.id,20,86400);
  const [a,z]=[user.id,p.user_id].sort(),at=now();
  await run(env,`INSERT INTO personal_relations(id,first_user,second_user,requested_by,created,updated) VALUES(?,?,?,?,?,?)
   ON CONFLICT(first_user,second_user) DO UPDATE SET state='pending',requested_by=excluded.requested_by,first_public=0,second_public=0,updated=excluded.updated WHERE personal_relations.state IN ('ended','declined')`,id(),a,z,user.id,at,at);
  return json({relations:await relationList(env,user.id)},201);
 }
 const r=match[1]?await one(env,'SELECT * FROM personal_relations WHERE id=? AND (first_user=? OR second_user=?)',match[1],user.id,user.id):null;
 if(!r)fail(404,'관계를 찾을 수 없어요.');assertUnblocked(env,r.first_user===user.id?r.second_user:r.first_user);
 if(req.method!=='PATCH')fail(405,'지원하지 않는 요청입니다.');const b=await req.json();
 if(b.action==='accept'||b.action==='decline'){
  if(r.state!=='pending'||r.requested_by===user.id)fail(409,'상대가 보낸 대기 중인 신청만 응답할 수 있어요.');
  await run(env,"UPDATE personal_relations SET state=?,first_public=0,second_public=0,updated=? WHERE id=? AND state='pending' AND requested_by!=?",b.action==='accept'?'accepted':'declined',now(),r.id,user.id);
 }else if(b.action==='share'){
  if(r.state!=='accepted'||typeof b.public!=='boolean')fail(400,'수락한 관계의 공개 여부를 선택해주세요.');
  await run(env,`UPDATE personal_relations SET ${r.first_user===user.id?'first_public':'second_public'}=?,updated=? WHERE id=? AND state='accepted'`,b.public?1:0,now(),r.id);
 }else if(b.action==='end')await run(env,"UPDATE personal_relations SET state='ended',first_public=0,second_public=0,updated=? WHERE id=?",now(),r.id);
 else fail(400,'관계 설정을 확인해주세요.');
 return json({relations:await relationList(env,user.id)});
}
