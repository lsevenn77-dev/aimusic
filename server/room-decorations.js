import {one,rows,run,now,fail} from './db.js';
import {DECORATIONS,FREE_ROOM_THEMES,DEFAULT_ROOM_THEME} from '../shared/decorations.js';
import {activeDecorationSQL} from './decorations.js';
import {playerColumnsSQL} from './player.js';
export async function roomThemeChoices(env,uid){
 // A stock purchase is not active equipment. Prefer the latest explicitly
 // activated, still-valid paid theme, then offer the free backgrounds.
 const owned=await rows(env,`SELECT item_key,expires_at,(SELECT max(created) FROM decoration_redemptions dr WHERE dr.active_inventory_id=pi.id) activated,(SELECT max(rowid) FROM decoration_redemptions dr WHERE dr.active_inventory_id=pi.id) activation_order FROM player_inventory pi WHERE user_id=? AND ${activeDecorationSQL('pi')} ORDER BY COALESCE(activated,pi.granted_at) DESC,COALESCE(activation_order,0) DESC,pi.id`,uid);
 const paid=Object.values(DECORATIONS).filter(p=>p.kind==='TALKING_ROOM_THEME'&&owned.some(i=>i.item_key===p.sku)).sort((a,b)=>owned.findIndex(i=>i.item_key===a.sku)-owned.findIndex(i=>i.item_key===b.sku)).map(p=>({...p,paid:true,selectable:true,expires_at:owned.find(i=>i.item_key===p.sku).expires_at}));
 return [...paid,...FREE_ROOM_THEMES.map(p=>({...p,selectable:true,paid:false}))];
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
 await run(env,`INSERT INTO room_decorations(room_id,host_id,sku,revision,updated) VALUES(?,?,?,?,?) ON CONFLICT(room_id) ${creating?'DO NOTHING':'DO UPDATE SET host_id=excluded.host_id,sku=excluded.sku,revision=excluded.revision,updated=excluded.updated WHERE room_decorations.revision<excluded.revision'}`,room.id,actor.id,sku,room.settings_revision||0,now());
}
export async function resolveRoomDecoration(env,room){
 const setting=await one(env,'SELECT * FROM room_decorations WHERE room_id=? AND host_id=?',room.id,room.host_id);
 // A matching row may hold the persisted fallback for an expired purchase.
 const current=setting&&(!room.theme_sku||setting.revision===(room.settings_revision||0));
 const sku=(current&&setting.sku)||room.theme_sku||room.background||DEFAULT_ROOM_THEME;
 const free=FREE_ROOM_THEMES.find(t=>t.sku===sku);
 if(free)return {sku,assets:null,expires_at:0,server_now:now()};
 const product=Object.hasOwn(DECORATIONS,sku)?DECORATIONS[sku]:null;
 const entitlement=product?.kind==='TALKING_ROOM_THEME'?await one(env,`SELECT expires_at FROM player_inventory pi WHERE pi.user_id=? AND pi.item_key=? AND ${activeDecorationSQL('pi')}`,room.host_id,sku):null;
 if(entitlement)return {sku,assets:product.assetPaths,expires_at:entitlement.expires_at,server_now:now()};
 // Persist fallback, so a later renewal does not silently re-equip an expired theme.
 if(current)await run(env,`UPDATE room_decorations SET sku=?,updated=? WHERE room_id=? AND host_id=? AND revision=? AND sku=? AND NOT EXISTS(SELECT 1 FROM player_inventory pi WHERE pi.user_id=? AND pi.item_key=? AND ${activeDecorationSQL('pi')})`,DEFAULT_ROOM_THEME,now(),room.id,room.host_id,setting.revision,sku,room.host_id,sku);
 return {sku:DEFAULT_ROOM_THEME,assets:null,expires_at:0,server_now:now()};
}
export async function decorateRoomResult(env,data){
 if(data.room)data={...data,room:{...data.room,theme:await resolveRoomDecoration(env,data.room)}};
 if(data.rooms)data={...data,rooms:await Promise.all(data.rooms.map(async r=>({...r,theme:await resolveRoomDecoration(env,r)})))};
 if(Array.isArray(data.members)&&data.members.length){
  const ids=[...new Set(data.members.map(m=>m.id))];
  // One bounded lookup validates every member's current equipment, including
  // ownership, funding, expiry and crew requirements. No private inventory or
  // XP history is sent to a room, and nulls explicitly clear stale decoration.
  const identities=await rows(env,`SELECT u.id,${playerColumnsSQL('u.id')} FROM users u WHERE u.id IN (${ids.map(()=>'?').join(',')}) AND u.provider!='deleted'`,...ids);
  const frames=new Map(identities.map(p=>[p.id,{profile_frame:p.profile_frame,profile_frame_artwork:p.profile_frame_artwork}]));
  data={...data,members:data.members.map(member=>({...member,...(frames.get(member.id)||{profile_frame:null,profile_frame_artwork:null})}))};
 }
 return data;
}
