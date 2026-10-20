import {one,fail} from './db.js';
// Shared by public reads and workers. An appeal does not silently republish a removed work.
export const dubbingVisibleSQL=(alias='p')=>`${alias}.deleted_at=0
 AND (${alias}.root_id IS NULL OR EXISTS(SELECT 1 FROM dubbing_projects root JOIN users ru ON ru.id=root.owner_id WHERE root.id=${alias}.root_id AND root.deleted_at=0 AND ru.provider!='deleted'))
 AND NOT EXISTS(SELECT 1 FROM track_reports dr WHERE dr.dubbing_id IN (${alias}.id,${alias}.root_id) AND dr.status IN ('removed','appealed','upheld'))`;
export async function dubbingRemoved(env,pid){return !!await one(env,"SELECT id FROM track_reports WHERE dubbing_id=? AND status IN ('removed','appealed','upheld') LIMIT 1",pid);}
export async function assertDubbingCreator(env,uid){
 const r=await one(env,`SELECT COUNT(DISTINCT r.dubbing_id) n FROM track_reports r JOIN dubbing_projects p ON p.id=r.dubbing_id
 WHERE p.owner_id=? AND r.status IN ('removed','appealed','upheld')`,uid);
 if(r.n>=3)fail(403,'반복된 권리 침해로 더빙 제작과 참여가 제한되어 있습니다. 내 더빙에서 이의신청을 할 수 있어요.');
}
export async function assertDubbingPublic(env,pid,uid=''){
 const p=await one(env,`SELECT p.* FROM dubbing_projects p JOIN users u ON u.id=p.owner_id WHERE p.id=? AND p.visibility='public' AND u.provider!='deleted' AND ${dubbingVisibleSQL()}
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.owner_id) OR (b.blocked_id=? AND b.user_id=p.owner_id))`,pid,uid,uid);
 if(!p)fail(404,'더빙 작품을 찾을 수 없습니다.');return p;
}
