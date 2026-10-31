import {assertDubbingPublic} from './dubbing-access.js';
import {one,fail} from './db.js';
export async function giftBlockReason(env,uid,track){
 if(!uid)return null;
 if(track.user_id===uid)return track.personal?'본인에게는 선물할 수 없어요.':'내 작품에는 선물할 수 없어요.';
 if(track.personal)return null;
 const own=await one(env,`SELECT 1 FROM tracks t LEFT JOIN artists a ON a.id=t.artist_id LEFT JOIN producers p ON p.id=a.producer_id
 WHERE t.id=? AND (p.user_id=? OR EXISTS(SELECT 1 FROM tracks o WHERE o.id=t.original_id AND o.user_id=?))`,track.id,uid,uid);
 if(own)return '내 작품에는 선물할 수 없어요.';
 const root=track.duet_parent_id||track.id;
 if(track.cover_mode==='duet'&&await one(env,'SELECT 1 FROM tracks WHERE user_id=? AND (id=? OR (duet_parent_id=? AND ? IS NULL))',uid,root,root,track.duet_parent_id||null))return '참여한 작품에는 선물할 수 없어요.';
 return null;
}
export async function assertDubbingGiftContext(env,uid,targetProfile,projectId){
 if(projectId==null)return;
 if(typeof projectId!=='string')fail(400,'더빙 작품을 확인해주세요.');
 const p=await assertDubbingPublic(env,projectId,uid),root=p.root_id||p.id;
 const performers=`SELECT p.id,p.owner_id uid FROM dubbing_projects p
  UNION ALL SELECT r.project_id,r.user_id FROM dubbing_recordings r JOIN dubbing_projects p ON p.id=r.project_id AND p.script_key=r.script_key WHERE r.state='submitted'
  UNION ALL SELECT c.project_id,c.user_id FROM dubbing_role_claims c`;
 if(p.owner_id===uid)fail(400,'내 작품에는 선물할 수 없어요.');
 if(await one(env,`SELECT 1 FROM (${performers}) actor WHERE actor.uid=? AND (actor.id IN (?,?) OR (? IS NULL AND actor.id IN (SELECT id FROM dubbing_projects WHERE root_id=?)))`,uid,p.id,root,p.root_id,root))fail(400,'참여한 작품에는 선물할 수 없어요.');
 if(!await one(env,`SELECT 1 FROM (${performers}) target JOIN producers p ON p.user_id=target.uid WHERE target.id IN (?,?) AND p.id=?`,p.id,root,targetProfile))fail(400,'이 더빙 작품의 수신자를 선택해주세요.');
}
