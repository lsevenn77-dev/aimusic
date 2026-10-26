import {one,rows,run,now,fail} from './db.js';
import {DECORATIONS,FREE_ROOM_THEMES,DEFAULT_ROOM_THEME} from '../shared/decorations.js';
import {activeDecorationSQL} from './decorations.js';
export async function roomThemeChoices(env,uid){
 const owned=await rows(env,`SELECT item_key,expires_at FROM player_inventory pi WHERE user_id=? AND ${activeDecorationSQL('pi')}`,uid);
 return [...FREE_ROOM_THEMES.map(p=>({...p,selectable:true,paid:false})),...Object.values(DECORATIONS).filter(p=>p.kind==='TALKING_ROOM_THEME').map(p=>({...p,paid:true,selectable:owned.some(i=>i.item_key===p.sku),expires_at:owned.find(i=>i.item_key===p.sku)?.expires_at||0}))];
}
export async function assertRoomTheme(env,uid,sku){
 if(FREE_ROOM_THEMES.some(t=>t.sku===sku))return sku;
 if(!Object.hasOwn(DECORATIONS,sku)||DECORATIONS[sku].kind!=='TALKING_ROOM_THEME')fail(400,'테마를 확인해주세요.');
 if(!await one(env,`SELECT id FROM player_inventory pi WHERE pi.user_id=? AND pi.item_key=? AND ${activeDecorationSQL('pi')}`,uid,sku))fail(403,'보유 중인 유효한 테마만 선택할 수 있어요.');
 return sku;
}
export async function saveRoomTheme(env,actor,room,sku,{creating=false}={}){
 if(room.host_id!==actor.id)fail(403,'방장만 테마를 변경할 수 있어요.');
 await assertRoomTheme(env,actor.id,sku);
 // A late response from an earlier settings revision cannot overwrite a later save.
 await run(env,`INSERT INTO room_decorations(room_id,host_id,sku,revision,updated) VALUES(?,?,?,?,?) ON CONFLICT(room_id) ${creating?'DO NOTHING':'DO UPDATE SET sku=excluded.sku,revision=excluded.revision,updated=excluded.updated WHERE room_decorations.host_id=excluded.host_id AND room_decorations.revision<excluded.revision'}`,room.id,actor.id,sku,room.settings_revision||0,now());
}
export async function resolveRoomDecoration(env,room){
 const setting=await one(env,'SELECT * FROM room_decorations WHERE room_id=? AND host_id=?',room.id,room.host_id);
 const sku=setting?.sku||room.background||DEFAULT_ROOM_THEME;
 const free=FREE_ROOM_THEMES.find(t=>t.sku===sku);
 if(free)return {sku,assets:null,expires_at:0,server_now:now()};
 const product=Object.hasOwn(DECORATIONS,sku)?DECORATIONS[sku]:null;
 const entitlement=product?.kind==='TALKING_ROOM_THEME'?await one(env,`SELECT expires_at FROM player_inventory pi WHERE pi.user_id=? AND pi.item_key=? AND ${activeDecorationSQL('pi')}`,room.host_id,sku):null;
 if(entitlement)return {sku,assets:product.assetPaths,expires_at:entitlement.expires_at,server_now:now()};
 // Persist fallback, so a later renewal does not silently re-equip an expired theme.
 if(setting)await run(env,`UPDATE room_decorations SET sku=?,updated=? WHERE room_id=? AND sku=? AND NOT EXISTS(SELECT 1 FROM player_inventory pi WHERE pi.user_id=? AND pi.item_key=? AND ${activeDecorationSQL('pi')})`,DEFAULT_ROOM_THEME,now(),room.id,sku,room.host_id,sku);
 return {sku:DEFAULT_ROOM_THEME,assets:null,expires_at:0,server_now:now()};
}
export async function decorateRoomResult(env,data){
 if(data.room)data={...data,room:{...data.room,theme:await resolveRoomDecoration(env,data.room)}};
 if(data.rooms)data={...data,rooms:await Promise.all(data.rooms.map(async r=>({...r,theme:await resolveRoomDecoration(env,r)})))};
 return data;
}
