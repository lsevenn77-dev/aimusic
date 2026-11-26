import {one,rows} from './db.js';
// Official follows never enter the human follows table used by charts/settlement.
const visible="u.account_type='ai_bot' AND u.provider!='deleted' AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=f.bot_id AND b.blocked_id=f.owner_id) OR (b.user_id=f.owner_id AND b.blocked_id=f.bot_id))";
export async function supportFollowCount(env,ownerId,viewer=ownerId){
 return (await one(env,`SELECT count(*) n FROM ai_support_follows f JOIN users u ON u.id=f.bot_id WHERE f.owner_id=? AND ${visible} AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=f.bot_id AND b.blocked_id=?) OR (b.user_id=? AND b.blocked_id=f.bot_id))`,ownerId,viewer||'',viewer||'')).n;
}
export async function supportFollowers(env,ownerId){
 return rows(env,`SELECT p.id,u.id user_id,p.name,p.bio,p.image_version,'producer' profile_kind,u.account_type,f.created FROM ai_support_follows f JOIN users u ON u.id=f.bot_id JOIN producers p ON p.user_id=u.id WHERE f.owner_id=? AND ${visible} ORDER BY f.created DESC,f.bot_id LIMIT 200`,ownerId);
}
