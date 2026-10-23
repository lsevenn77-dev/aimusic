import {one,rows,query,run,now,id,json,fail,str} from './db.js';
import {requireUser} from './auth.js';
import {playerProgress} from '../shared/player.js';
export const CREW_ROLE_LIMITS=Object.freeze({deputy:2,manager:3});
export const CREW_ROLE_ALIAS=Object.freeze({owner:'leader',deputy:'deputy',operator:'manager',manager:'manager',member:'member'});
export const auditCrew=(env,cid,uid,action,detail='')=>query(env,'INSERT INTO crew_audit(id,crew_id,actor_id,action,detail,created) VALUES(?,?,?,?,?,?)',id(),cid,uid,action,detail,now());
export function crewSettings(b,c={}){
 const policy=b.join_policy??c.join_policy??'open',minimum=Number(b.minimum_level??c.minimum_level??1),limit=Number(b.member_limit??c.member_limit??0),notice=str(b.notice??c.notice??'',1000,false);
 if(!['open','approval','invite_only'].includes(policy)||!Number.isInteger(minimum)||minimum<1||minimum>100||!Number.isInteger(limit)||limit<0||limit>150)fail(400,'가입 방식, 레벨, 정원을 확인해주세요.');
 return {join_policy:policy,minimum_level:minimum,member_limit:limit,notice};
}
export async function assertCrewLevel(env,c,uid){const xp=await one(env,'SELECT COALESCE(sum(amount),0) xp FROM player_xp WHERE user_id=?',uid);if(playerProgress(xp.xp).level<c.minimum_level)fail(403,'크루 가입 최소 레벨에 도달하지 않았어요.');}
export async function crewV3Route(req,env,path,user){
 const m=path.match(/^\/api\/crews\/([\w-]+)\/(applications|audit)(?:\/([\w-]+))?$/);if(!m)return null;requireUser(user);
 const [,cid,action,target]=m,c=await one(env,'SELECT * FROM crews WHERE id=?',cid);if(!c)fail(404,'크루를 찾을 수 없어요.');
 const actor=await one(env,'SELECT role FROM crew_members WHERE crew_id=? AND user_id=?',cid,user.id);
 if(!['owner','deputy','manager','operator'].includes(actor?.role))fail(403,'크루 운영진만 이용할 수 있어요.');
 if(action==='audit'){if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');return json({events:await rows(env,'SELECT action,detail,created FROM crew_audit WHERE crew_id=? ORDER BY created DESC,id DESC LIMIT 100',cid)});}
 if(req.method==='GET')return json({applications:await rows(env,"SELECT a.user_id,p.name,a.created FROM crew_applications a JOIN producers p ON p.user_id=a.user_id WHERE a.crew_id=? AND a.state='pending' ORDER BY a.created",cid)});
 if(req.method!=='POST'||!target)fail(405,'지원하지 않는 요청입니다.');
 const b=await req.json();if(!['approve','reject'].includes(b.decision))fail(400,'승인 또는 거절을 선택해주세요.');
 const application=await one(env,'SELECT * FROM crew_applications WHERE crew_id=? AND user_id=?',cid,target);if(!application)fail(404,'가입 신청이 없어요.');
 if(application.state!=='pending'){if(application.state===(b.decision==='approve'?'approved':'rejected'))return json({ok:true});fail(409,'이미 처리한 신청이에요.');}
 if(b.decision==='reject'){await env.DB.batch([query(env,"UPDATE crew_applications SET state='rejected' WHERE crew_id=? AND user_id=? AND state='pending'",cid,target),auditCrew(env,cid,user.id,'application_rejected',target)]);return json({ok:true});}
 await assertCrewLevel(env,c,target);
 try{await env.DB.batch([
 query(env,`INSERT INTO crew_members(crew_id,user_id,role,joined,joined_sequence) SELECT c.id,?,'member',?,COALESCE((SELECT max(rowid) FROM crew_messages WHERE crew_id=c.id),0)+1 FROM crews c WHERE c.id=? AND c.recruiting=1 AND NOT EXISTS(SELECT 1 FROM crew_bans WHERE crew_id=c.id AND user_id=?) AND (SELECT count(*) FROM crew_members WHERE crew_id=c.id)<CASE WHEN c.member_limit>0 THEN c.member_limit ELSE CASE WHEN COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=c.id),0)>=3000 THEN 150 WHEN COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=c.id),0)>=1500 THEN 100 WHEN COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=c.id),0)>=500 THEN 50 WHEN COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=c.id),0)>=100 THEN 20 ELSE 10 END END AND EXISTS(SELECT 1 FROM crew_applications WHERE crew_id=c.id AND user_id=? AND state='pending')`,target,now(),cid,target,target),
 query(env,"UPDATE crew_applications SET state='approved' WHERE crew_id=? AND user_id=? AND EXISTS(SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?)",cid,target,cid,target),
 query(env,"INSERT INTO crew_audit(id,crew_id,actor_id,action,detail,created) SELECT ?,?,?,'application_approved',?,? WHERE EXISTS(SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?)",id(),cid,user.id,target,now(),cid,target)
 ]);}catch(e){if(/UNIQUE/.test(e.message))fail(409,'이미 다른 크루에 가입했어요.');throw e;}
 if(!await one(env,'SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?',cid,target))fail(409,'정원 또는 가입 상태가 변경됐어요.');return json({ok:true});
}
