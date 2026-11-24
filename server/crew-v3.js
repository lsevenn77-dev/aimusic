import * as AifectMessages from '../shared/system-messages.js';
import {producerNameSQL} from './identity.js';
import {crewCapacitySQL} from './crew-growth.js';
import {one,rows,query,run,now,id,json,fail,str} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {playerProgress} from '../shared/player.js';
export const CREW_ROLE_LIMITS=Object.freeze({deputy:2,manager:3});
export const CREW_ROLE_ALIAS=Object.freeze({owner:'leader',deputy:'deputy',operator:'manager',manager:'manager',member:'member'});
export const auditCrew=(env,cid,uid,action,detail='')=>query(env,'INSERT INTO crew_audit(id,crew_id,actor_id,action,detail,created) VALUES(?,?,?,?,?,?)',id(),cid,uid,action,detail,now());
export function crewSettings(b,c={}){
 const policy=b.join_policy??c.join_policy??'open',minimum=Number(b.minimum_level??c.minimum_level??1),notice=str(b.notice??c.notice??'',1000,false);
 if(!['open','approval','invite_only'].includes(policy)||!Number.isInteger(minimum)||minimum<1||minimum>100)fail(400,'가입 방식과 최소 레벨을 확인해 주세요.');
 return {join_policy:policy,minimum_level:minimum,notice};
}
export async function assertCrewLevel(env,c,uid){const xp=await one(env,'SELECT COALESCE(sum(amount),0) xp FROM player_xp WHERE user_id=?',uid);if(playerProgress(xp.xp).level<c.minimum_level)fail(403,'크루 가입 최소 레벨에 도달하지 않았습니다.');}
export async function crewV3Route(req,env,path,user){
 const adjustment=path.match(/^\/api\/crews\/([\w-]+)\/growth-adjustments$/);
 if(adjustment){requireUser(user);if(!isAdmin(env,user))fail(403,'서비스 관리자만 경험치를 정정할 수 있습니다.');if(req.method!=='POST')fail(405,AifectMessages.unsupportedRequest);const b=await req.json(),cid=adjustment[1],reason=str(b.reason,500);if(!Number.isSafeInteger(b.amount)||Math.abs(b.amount)>100000||!/^[-\w]{16,64}$/.test(b.request_id||''))fail(400,'정정 값과 요청 ID를 확인해 주세요.');const key='adjustment:'+cid+':'+b.request_id,prior=await one(env,'SELECT amount FROM crew_xp WHERE id=?',key);if(prior){if(prior.amount!==b.amount)fail(409,'이미 사용한 요청 ID입니다.');return json({ok:true});}await env.DB.batch([query(env,'INSERT OR IGNORE INTO crew_xp(id,crew_id,user_id,amount,created) SELECT ?,id,owner_id,?,? FROM crews WHERE id=? AND COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=crews.id),0)+?>=0',key,b.amount,now(),cid,b.amount),query(env,"INSERT INTO crew_audit(id,crew_id,actor_id,action,detail,created) SELECT ?,?,?,'growth_adjusted',?,? WHERE changes()>0",id(),cid,user.id,JSON.stringify({amount:b.amount,reason,request_id:b.request_id}),now())]);if(!await one(env,'SELECT 1 FROM crew_xp WHERE id=?',key))fail(409,'경험치와 크루 상태를 확인해 주세요.');return json({ok:true});}
 const transfer=path.match(/^\/api\/crews\/([\w-]+)\/leadership$/);
 if(transfer){requireUser(user);if(req.method!=='POST')fail(405,AifectMessages.unsupportedRequest);const cid=transfer[1],b=await req.json();const c=await one(env,'SELECT owner_id FROM crews WHERE id=?',cid);if(c?.owner_id!==user.id)fail(403,'크루장만 위임할 수 있습니다.');const target=await one(env,'SELECT user_id FROM crew_members WHERE crew_id=? AND user_id=? AND user_id!=?',cid,b.user_id,user.id);if(!target)fail(400,'현재 크루원을 선택해 주세요.');await env.DB.batch([query(env,'UPDATE crews SET owner_id=?,version=version+1 WHERE id=? AND owner_id=?',target.user_id,cid,user.id),query(env,"UPDATE crew_members SET role=CASE WHEN user_id=? THEN 'owner' WHEN user_id=? THEN 'member' ELSE role END WHERE crew_id=? AND EXISTS(SELECT 1 FROM crews WHERE id=? AND owner_id=?)",target.user_id,user.id,cid,cid,target.user_id),auditCrew(env,cid,user.id,'leadership_transferred',target.user_id)]);return json({ok:true});}
 const m=path.match(/^\/api\/crews\/([\w-]+)\/(applications|audit)(?:\/([\w-]+))?$/);if(!m)return null;requireUser(user);
 const [,cid,action,target]=m,c=await one(env,'SELECT * FROM crews WHERE id=?',cid);if(!c)fail(404,'크루를 찾을 수 없습니다.');
 const actor=await one(env,'SELECT role FROM crew_members WHERE crew_id=? AND user_id=?',cid,user.id);
 if(!['owner','deputy','manager','operator'].includes(actor?.role))fail(403,'크루 운영진만 이용할 수 있습니다.');
 if(action==='audit'){if(req.method!=='GET')fail(405,AifectMessages.unsupportedRequest);return json({events:await rows(env,'SELECT action,detail,created FROM crew_audit WHERE crew_id=? ORDER BY created DESC,id DESC LIMIT 100',cid)});}
 if(req.method==='GET')return json({applications:await rows(env,"SELECT a.user_id,p.name,a.created FROM crew_applications a JOIN producers p ON p.user_id=a.user_id WHERE a.crew_id=? AND a.state='pending' ORDER BY a.created",cid)});
 if(req.method!=='POST'||!target)fail(405,AifectMessages.unsupportedRequest);
 const b=await req.json();if(!['approve','reject'].includes(b.decision))fail(400,'승인 또는 거절을 선택해 주세요.');
 const application=await one(env,'SELECT * FROM crew_applications WHERE crew_id=? AND user_id=?',cid,target);if(!application)fail(404,'가입 신청이 없습니다.');
 if(application.state!=='pending'){if(application.state===(b.decision==='approve'?'approved':'rejected'))return json({ok:true});fail(409,'이미 처리한 신청입니다.');}
 if(b.decision==='reject'){await env.DB.batch([query(env,"UPDATE crew_applications SET state='rejected' WHERE crew_id=? AND user_id=? AND state='pending'",cid,target),auditCrew(env,cid,user.id,'application_rejected',target)]);return json({ok:true});}
 await assertCrewLevel(env,c,target);
 try{await env.DB.batch([
 query(env,`INSERT INTO crew_members(crew_id,user_id,role,joined,joined_sequence) SELECT c.id,?,'member',?,COALESCE((SELECT max(rowid) FROM crew_messages WHERE crew_id=c.id),0)+1 FROM crews c WHERE c.id=? AND c.recruiting=1 AND NOT EXISTS(SELECT 1 FROM crew_bans WHERE crew_id=c.id AND user_id=?) AND (SELECT count(*) FROM crew_members WHERE crew_id=c.id)<(${crewCapacitySQL()}) AND EXISTS(SELECT 1 FROM crew_applications WHERE crew_id=c.id AND user_id=? AND state='pending')`,target,now(),cid,target,target),
 query(env,`INSERT INTO crew_messages(id,crew_id,user_id,body,request_id,created,kind) SELECT ?,?,?,COALESCE((SELECT ${producerNameSQL()} FROM producers p WHERE p.user_id=?),'크루원')||'님이 크루에 참여했습니다. 인사를 나눠 보세요.',?,?,'system' WHERE changes()=1`,id(),cid,target,target,'join:'+id(),now()),
 query(env,"UPDATE crew_applications SET state='approved' WHERE crew_id=? AND user_id=? AND EXISTS(SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?)",cid,target,cid,target),
 query(env,"INSERT INTO crew_audit(id,crew_id,actor_id,action,detail,created) SELECT ?,?,?,'application_approved',?,? WHERE EXISTS(SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?)",id(),cid,user.id,target,now(),cid,target)
 ]);}catch(e){if(/UNIQUE/.test(e.message))fail(409,'이미 다른 크루에 가입했습니다.');throw e;}
 if(!await one(env,'SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?',cid,target))fail(409,'정원 또는 가입 상태가 변경되었습니다.');return json({ok:true});
}
