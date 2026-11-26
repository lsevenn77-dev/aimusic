import {one,query,now,fail} from './db.js';
import {DEFAULT_ROOM_THEME} from '../shared/decorations.js';
import {catalogRoomTheme} from './product-catalog.js';
import {activeDecorationSQL,stockDecorationSQL,themeActivationQueries} from './decorations.js';

export async function selectRoomEntitlement(env,uid,sku,inventoryId,confirm=false){
 const product=await catalogRoomTheme(env,sku);if(!product)fail(400,'테마를 확인해 주세요.');
 if(!product.kind)return {sku,inventoryId:null,transport:sku};
 // Old clients may omit an ID only for an already active right. Never choose stock implicitly.
 const item=inventoryId?await one(env,`SELECT pi.*,COALESCE(pi.period_code,co.period_code) option_period
  FROM player_inventory pi LEFT JOIN decoration_orders co ON co.inventory_id=pi.id WHERE pi.user_id=? AND pi.item_key=?
  AND (pi.id=? OR pi.id=(SELECT active_inventory_id FROM decoration_redemptions WHERE inventory_id=? AND user_id=?))
  ORDER BY pi.source='decoration' DESC LIMIT 1`,uid,sku,inventoryId,inventoryId,uid):
  await one(env,`SELECT * FROM player_inventory pi WHERE pi.user_id=? AND pi.item_key=? AND ${activeDecorationSQL('pi')} ORDER BY pi.granted_at,pi.id LIMIT 1`,uid,sku);
 if(!item||item.revoked)fail(403,'보유 중인 유효한 테마만 선택할 수 있습니다.');
 if(item.source==='decoration_stock'){
  if(!confirm)fail(409,'테마 사용 시작을 먼저 확인해 주세요.');
  if(!item.option_period||!await one(env,`SELECT id FROM player_inventory pi WHERE pi.id=? AND ${stockDecorationSQL('pi')}`,item.id))
   fail(403,'테마의 이용 기간이나 결제 상태를 확인해 주세요.');
  item.period_code=item.option_period;
  return {sku,inventoryId:item.id,stock:item,transport:DEFAULT_ROOM_THEME};
 }
 if(!await one(env,`SELECT id FROM player_inventory pi WHERE pi.id=? AND ${activeDecorationSQL('pi')}`,item.id))fail(403,'테마 사용 기간이 종료되었거나 사용 권한이 없습니다.');
 return {sku,inventoryId:item.id,transport:DEFAULT_ROOM_THEME};
}
export async function themeApplicationReplay(env,uid,key,roomId,action,fingerprint){
 const old=await one(env,'SELECT * FROM room_theme_applications WHERE user_id=? AND request_id=?',uid,key);
 // Creation has always returned the original room for a repeated room ID.
 // Never activate another entitlement from a changed creation retry.
 if(old&&(old.room_id!==roomId||old.action!==action||(action!=='create'&&old.fingerprint!==fingerprint)))fail(409,'이미 다른 테마 적용에 사용한 요청 번호입니다.');
 return old;
}
export async function commitRoomTheme(env,uid,room,choice,{key,action,fingerprint}){
 if(room.host_id!==uid)fail(403,'방장만 테마를 변경할 수 있습니다.');
 const replay=()=>themeApplicationReplay(env,uid,key,room.id,action,fingerprint);
 if(await replay())return;
 const at=now(),activation=choice.stock?themeActivationQueries(env,uid,choice.stock,key,at):null;
 try{
  // D1 batch is transactional. The receipt guard rejects a stale room revision;
  // redemption guards recheck stock ownership/funding inside this same commit.
  await env.DB.batch([
   query(env,'INSERT INTO room_theme_applications(user_id,request_id,room_id,action,fingerprint,revision,created) VALUES(?,?,?,?,?,?,?)',uid,key,room.id,action,fingerprint,room.settings_revision||0,at),
   ...(activation?.queries||[]),
   query(env,`INSERT INTO room_decorations(room_id,host_id,sku,revision,updated,inventory_id) VALUES(?,?,?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET host_id=excluded.host_id,sku=excluded.sku,revision=excluded.revision,updated=excluded.updated,inventory_id=excluded.inventory_id`,room.id,uid,choice.sku,room.settings_revision||0,at,activation?.activeId||choice.inventoryId)
  ]);
 }catch(e){
  if(await replay())return;
  if(/constraint|decoration_|room_theme_/i.test(e.message))fail(409,'테마 또는 방 상태가 바뀌었습니다. 이용권은 새로 사용되지 않았습니다. 방 설정을 다시 열어 주세요.');
  throw e;
 }
}
