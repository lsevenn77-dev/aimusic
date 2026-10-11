import {one,rows,run,fail,json,now} from './db.js';
import {PLAYER_ITEMS,PLAYER_RULES,playerProgress} from '../shared/player.js';

// The equipped item must still belong to this account and satisfy its grant conditions.
export const playerColumnsSQL=uid=>`COALESCE((SELECT sum(px.amount) FROM player_xp px WHERE px.user_id=${uid}),0) player_xp,
 (SELECT pi.item_key FROM player_equipment pe JOIN player_inventory pi ON pi.id=pe.frame_inventory_id AND pi.user_id=pe.user_id WHERE pe.user_id=${uid} AND pi.revoked=0 AND (pi.expires_at=0 OR pi.expires_at>unixepoch()) AND pi.item_key='crew-outline' AND EXISTS(SELECT 1 FROM crew_members pcm WHERE pcm.user_id=pe.user_id)) profile_frame`;
export async function playerIdentity(env,uid){
 const p=await one(env,`SELECT ${playerColumnsSQL('u.id')} FROM users u WHERE u.id=?`,uid);
 return p?{...p,player_level:playerProgress(p.player_xp).level}:{};
}
export async function playerSummary(env,uid){
 const [identity,inventory,crew,recent]=await Promise.all([
  playerIdentity(env,uid),
  rows(env,'SELECT pi.*,pe.frame_inventory_id=pi.id equipped FROM player_inventory pi LEFT JOIN player_equipment pe ON pe.user_id=pi.user_id WHERE pi.user_id=? ORDER BY pi.granted_at DESC,pi.id',uid),
  one(env,'SELECT c.id,c.name FROM crew_members cm JOIN crews c ON c.id=cm.crew_id WHERE cm.user_id=?',uid),
  rows(env,'SELECT kind,amount,created FROM player_xp WHERE user_id=? ORDER BY created DESC,source_key DESC LIMIT 20',uid)
 ]);
 return {player:playerProgress(identity.player_xp),profile:identity,crew:crew||null,rules:PLAYER_RULES,recent,
  inventory:inventory.filter(i=>PLAYER_ITEMS[i.item_key]).map(i=>{
   const item=PLAYER_ITEMS[i.item_key],reason=i.revoked?'사용이 종료된 아이템이에요.':i.expires_at&&i.expires_at<=now()?'사용 기간이 끝났어요.':item.membership&&!crew?'크루에 가입하면 사용할 수 있어요.':'';
   return {id:i.id,item_key:i.item_key,...item,source:i.source,granted_at:i.granted_at,expires_at:i.expires_at,available:!reason,reason,equipped:!reason&&!!i.equipped};
  })};
}
export async function playerRoute(req,env,path,user){
 if(!['/api/me/player','/api/me/player/equipment'].includes(path))return null;
 if(!user)fail(401,'로그인 후 이용해주세요.');
 if(path.endsWith('/equipment')){
  if(req.method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
  const b=await req.json();
  if(!Object.hasOwn(b,'frame_inventory_id')||(b.frame_inventory_id!==null&&typeof b.frame_inventory_id!=='string'))fail(400,'장착할 액자를 선택해주세요.');
  const target=b.frame_inventory_id;
  // A single conditional statement closes the leave/expiry/equip race.
  if(target!==null){
   const i=await one(env,"SELECT id FROM player_inventory WHERE id=? AND user_id=? AND item_key='crew-outline' AND revoked=0 AND (expires_at=0 OR expires_at>unixepoch()) AND EXISTS(SELECT 1 FROM crew_members WHERE user_id=?)",target,user.id,user.id);
   if(!i)fail(409,'지금 사용할 수 없는 액자예요. 보관함을 새로 확인해주세요.');
  }
  await run(env,`INSERT INTO player_equipment(user_id,frame_inventory_id) SELECT ?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM player_inventory WHERE id=? AND user_id=? AND item_key='crew-outline' AND revoked=0 AND (expires_at=0 OR expires_at>unixepoch()) AND EXISTS(SELECT 1 FROM crew_members WHERE user_id=?)) ON CONFLICT(user_id) DO UPDATE SET frame_inventory_id=excluded.frame_inventory_id`,user.id,target,target,target,user.id,user.id);
 }else if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 return json(await playerSummary(env,user.id));
}
