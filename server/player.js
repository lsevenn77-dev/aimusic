import {one,rows,run,query,fail,json,now} from './db.js';
import {PLAYER_ITEMS,PLAYER_RULES,playerProgress} from '../shared/player.js';
import {CREW_LEVELS,crewLevel} from '../shared/crews.js';

const sqlString=value=>"'"+String(value).replaceAll("'","''")+"'";
const rewards=Object.entries(PLAYER_ITEMS).filter(([,item])=>item.min_level||item.min_crew_level);
const crewThreshold=item=>CREW_LEVELS.find(l=>l.level===item.min_crew_level)?.xp??0;
const crewQualifiedSQL=(uid,item)=>`EXISTS(SELECT 1 FROM crew_members reward_member WHERE reward_member.user_id=${uid} AND COALESCE((SELECT sum(reward_xp.amount) FROM crew_xp reward_xp WHERE reward_xp.crew_id=reward_member.crew_id),0)>=${crewThreshold(item)})`;
const eligibleSQL=(uid,item)=>item.min_level?`COALESCE((SELECT sum(reward_xp.amount) FROM player_xp reward_xp WHERE reward_xp.user_id=${uid}),0)>=${50*item.min_level*(item.min_level-1)}`:crewQualifiedSQL(uid,item);
const usableSQL=(alias,uid)=>`(${Object.entries(PLAYER_ITEMS).map(([key,item])=>`(${alias}.item_key=${sqlString(key)}${item.membership?' AND '+crewQualifiedSQL(uid,item):''})`).join(' OR ')})`;
function rewardQueries(env,uid){return rewards.map(([key,item])=>{const source=item.min_level?'level':'crew-level';return query(env,`INSERT OR IGNORE INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at) SELECT ${sqlString('reward:'+key+':')}||u.id,u.id,${sqlString(key)},${sqlString(source)},${sqlString(key)},unixepoch() FROM users u WHERE ${uid?'u.id=? AND ':''}${eligibleSQL('u.id',item)} AND NOT EXISTS(SELECT 1 FROM player_inventory existing WHERE existing.user_id=u.id AND existing.source=${sqlString(source)} AND existing.source_ref=${sqlString(key)}) LIMIT 500`,...(uid?[uid]:[]));});}
// Grant from server XP only, once, including users who qualified before release.
export async function grantPlayerRewards(env,uid){await env.DB.batch(rewardQueries(env,uid));}

// Bounded, idempotent data backfill is separate from schema migration.
export async function playerBackfill(env){
 const result=await env.DB.batch([
  query(env,"INSERT OR IGNORE INTO player_xp(user_id,source_key,kind,amount,created) SELECT t.user_id,'track:'||t.id,iif(t.kind='cover','cover','publish'),iif(t.kind='cover',60,100),t.created FROM tracks t WHERE t.status='published' AND NOT EXISTS(SELECT 1 FROM player_xp x WHERE x.user_id=t.user_id AND x.source_key='track:'||t.id) LIMIT 500"),
  query(env,"INSERT OR IGNORE INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at) SELECT 'crew-frame:'||cm.user_id,cm.user_id,'crew-outline','crew','membership',unixepoch() FROM crew_members cm WHERE NOT EXISTS(SELECT 1 FROM player_inventory i WHERE i.user_id=cm.user_id AND i.source='crew' AND i.source_ref='membership') LIMIT 500"),
  query(env,"INSERT OR IGNORE INTO player_equipment(user_id,frame_inventory_id) SELECT cm.user_id,'crew-frame:'||cm.user_id FROM crew_members cm WHERE EXISTS(SELECT 1 FROM player_inventory i WHERE i.id='crew-frame:'||cm.user_id) AND NOT EXISTS(SELECT 1 FROM player_equipment e WHERE e.user_id=cm.user_id) LIMIT 500"),
  ...rewardQueries(env)
 ]);
 return {changes:result.map(r=>r.meta?.changes||0)};
}
export async function playerBackfillRoute(req,env){
 if(!env.TRANSCODER_TOKEN||req.headers.get('authorization')!==`Bearer ${env.TRANSCODER_TOKEN}`)fail(401,'인증이 필요합니다.');
 if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
 return json(await playerBackfill(env));
}

// The equipped item must still belong to this account and satisfy its grant conditions.
export const playerColumnsSQL=uid=>{
 const equipped=select=>`(SELECT ${select} FROM player_equipment pe JOIN player_inventory pi ON pi.id=pe.frame_inventory_id AND pi.user_id=pe.user_id WHERE pe.user_id=${uid} AND pi.revoked=0 AND (pi.expires_at=0 OR pi.expires_at>unixepoch()) AND ${usableSQL('pi','pe.user_id')})`;
 const artwork=`CASE pi.item_key ${Object.entries(PLAYER_ITEMS).map(([key,item])=>`WHEN ${sqlString(key)} THEN ${sqlString(item.artwork)}`).join(' ')} END`;
 return `COALESCE((SELECT sum(px.amount) FROM player_xp px WHERE px.user_id=${uid}),0) player_xp,${equipped('pi.item_key')} profile_frame,${equipped(artwork)} profile_frame_artwork`;
};
export async function playerIdentity(env,uid){
 const p=await one(env,`SELECT ${playerColumnsSQL('u.id')} FROM users u WHERE u.id=?`,uid);
 return p?{...p,player_level:playerProgress(p.player_xp).level}:{};
}
export async function playerSummary(env,uid){
 await grantPlayerRewards(env,uid);
 const [identity,inventory,crew,recent]=await Promise.all([
  playerIdentity(env,uid),
  rows(env,'SELECT pi.*,pe.frame_inventory_id=pi.id equipped FROM player_inventory pi LEFT JOIN player_equipment pe ON pe.user_id=pi.user_id WHERE pi.user_id=? ORDER BY pi.granted_at DESC,pi.id',uid),
  one(env,'SELECT c.id,c.name,COALESCE((SELECT sum(cx.amount) FROM crew_xp cx WHERE cx.crew_id=c.id),0) xp FROM crew_members cm JOIN crews c ON c.id=cm.crew_id WHERE cm.user_id=?',uid),
  rows(env,'SELECT kind,amount,created FROM player_xp WHERE user_id=? ORDER BY created DESC,source_key DESC LIMIT 20',uid)
 ]);
 const currentCrew=crew?{...crew,level:crewLevel(crew.xp).level}:null;
 return {player:playerProgress(identity.player_xp),profile:identity,crew:currentCrew,rules:PLAYER_RULES,recent,
  rewards:rewards.filter(([key])=>!inventory.some(i=>i.item_key===key)).map(([key,item])=>({item_key:key,...item,owned:false,available:false,equipped:false,reason:item.min_level?`유저 레벨 ${item.min_level} 달성 시 자동 지급`:`크루 레벨 ${item.min_crew_level} 이상 가입 시 자동 지급`})),
  inventory:inventory.filter(i=>PLAYER_ITEMS[i.item_key]).map(i=>{
   const item=PLAYER_ITEMS[i.item_key],reason=i.revoked?'사용이 종료된 아이템이에요.':i.expires_at&&i.expires_at<=now()?'사용 기간이 끝났어요.':item.membership&&!crew?'크루에 가입하면 사용할 수 있어요.':item.min_crew_level&&currentCrew.level<item.min_crew_level?`크루 레벨 ${item.min_crew_level} 이상에서 사용할 수 있어요.`:'';
   return {id:i.id,item_key:i.item_key,...item,owned:true,source:i.source,granted_at:i.granted_at,expires_at:i.expires_at,available:!reason,reason,equipped:!reason&&!!i.equipped};
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
   const i=await one(env,`SELECT pi.id FROM player_inventory pi WHERE pi.id=? AND pi.user_id=? AND pi.revoked=0 AND (pi.expires_at=0 OR pi.expires_at>unixepoch()) AND ${usableSQL('pi','pi.user_id')}`,target,user.id);
   if(!i)fail(409,'지금 사용할 수 없는 액자예요. 보관함을 새로 확인해주세요.');
  }
  await run(env,`INSERT INTO player_equipment(user_id,frame_inventory_id) SELECT ?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM player_inventory pi WHERE pi.id=? AND pi.user_id=? AND pi.revoked=0 AND (pi.expires_at=0 OR pi.expires_at>unixepoch()) AND ${usableSQL('pi','pi.user_id')}) ON CONFLICT(user_id) DO UPDATE SET frame_inventory_id=excluded.frame_inventory_id`,user.id,target,target,target,user.id);
 }else if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 return json(await playerSummary(env,user.id));
}
