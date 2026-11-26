import {one,rows,run,now,fail} from './db.js';
import {FREE_ROOM_THEMES,DEFAULT_ROOM_SKIN,DEFAULT_ROOM_THEME,isRetiredRoomTheme,roomUIMode} from '../shared/decorations.js';
import {catalog,catalogRoomTheme,giftRuntime} from './product-catalog.js';
import {activeDecorationSQL,decorationInventory} from './decorations.js';
import {playerColumnsSQL} from './player.js';
export async function roomThemeChoices(env,uid){
 const owned=(await decorationInventory(env,uid)).filter(i=>i.available&&i.product.kind==='TALKING_ROOM_THEME');
 const paid=owned.sort((a,b)=>(a.stored-b.stored)||(b.activated_at||0)-(a.activated_at||0)).map(i=>({...i.product,paid:true,selectable:true,inventory_id:i.id,status:i.status,applied:i.applied,period_code:i.period_code,expires_at:i.expires_at,activated_at:i.activated_at,reward_deadline:i.reward_deadline,season_ends_at:i.season_ends_at}));
 return [...paid,...FREE_ROOM_THEMES.map(p=>({...p,uiMode:roomUIMode(p),selectable:true,paid:false,status:'ACTIVE',expires_at:0}))];
}
export async function assertRoomTheme(env,uid,sku){
 const product=await catalogRoomTheme(env,sku);
 if(!product)fail(400,'테마를 확인해 주세요.');
 if(!product.kind)return sku;
 if(!await one(env,`SELECT id FROM player_inventory pi WHERE pi.user_id=? AND pi.item_key=? AND ${activeDecorationSQL('pi')}`,uid,sku))fail(403,'보유 중인 유효한 테마만 선택할 수 있습니다.');
 return sku;
}
export async function saveRoomTheme(env,actor,room,sku,{creating=false}={}){
 if(room.host_id!==actor.id)fail(403,'방장만 테마를 변경할 수 있습니다.');
 await assertRoomTheme(env,actor.id,sku);
 // A late response from an earlier settings revision cannot overwrite a later save.
 await run(env,`INSERT INTO room_decorations(room_id,host_id,sku,revision,updated) VALUES(?,?,?,?,?) ON CONFLICT(room_id) ${creating?'DO NOTHING':'DO UPDATE SET host_id=excluded.host_id,sku=excluded.sku,revision=excluded.revision,updated=excluded.updated WHERE room_decorations.revision<excluded.revision'}`,room.id,actor.id,sku,room.settings_revision||0,now());
}
function themeResponse(product,expires_at=0,server_now=now(),inventory_id=null){
 return {sku:product.sku,uiMode:roomUIMode(product),assets:product.assetPaths,expires_at,server_now,inventory_id};
}
export async function resolveRoomDecoration(env,room){
 const setting=await one(env,'SELECT * FROM room_decorations WHERE room_id=? AND host_id=?',room.id,room.host_id);
 // A matching row may hold the persisted fallback for an expired purchase.
 const current=setting&&(!room.theme_sku||setting.revision===(room.settings_revision||0));
 const sku=(current&&setting.sku)||room.theme_sku||room.background||DEFAULT_ROOM_THEME;
 const product=await catalogRoomTheme(env,sku);
 if(product&&!product.kind)return themeResponse(product);
 const entitlement=product?await one(env,`SELECT id,expires_at FROM player_inventory pi WHERE pi.user_id=? AND pi.item_key=? AND ${current&&setting.inventory_id?'pi.id=?':"pi.source_ref=pi.item_key"} AND ${activeDecorationSQL('pi')}`,room.host_id,sku,...(current&&setting.inventory_id?[setting.inventory_id]:[])):null;
 if(entitlement)return themeResponse(product,entitlement.expires_at,now(),entitlement.id);
 // Persist fallback, so a later renewal does not silently re-equip an expired theme.
 if(current)await run(env,`UPDATE room_decorations SET sku=?,inventory_id=NULL,updated=? WHERE room_id=? AND host_id=? AND revision=? AND sku=? AND NOT EXISTS(SELECT 1 FROM player_inventory pi WHERE pi.user_id=? AND pi.item_key=? AND (pi.id=room_decorations.inventory_id OR (room_decorations.inventory_id IS NULL AND pi.source_ref=pi.item_key)) AND ${activeDecorationSQL('pi')})`,DEFAULT_ROOM_THEME,now(),room.id,room.host_id,setting.revision,sku,room.host_id,sku);
 return themeResponse(DEFAULT_ROOM_SKIN);
}
export function withRoomTheme(room,theme){
 return {...room,background:theme.sku,theme_sku:theme.sku,theme};
}
export async function decorateRoomResult(env,data){
 if(data.room)data={...data,room:withRoomTheme(data.room,await resolveRoomDecoration(env,data.room))};
 if(data.rooms)data={...data,rooms:await Promise.all(data.rooms.map(async r=>withRoomTheme(r,await resolveRoomDecoration(env,r))))};
 if(Array.isArray(data.members)&&data.members.length){
  const ids=[...new Set(data.members.map(m=>m.id))];
  // One bounded lookup validates every member's current equipment, including
  // ownership, funding, expiry and crew requirements. No private inventory or
  // XP history is sent to a room, and nulls explicitly clear stale decoration.
  const identities=await rows(env,`SELECT u.id,EXISTS(SELECT 1 FROM follows f JOIN producers peer ON peer.id=f.target_id WHERE f.kind='producer' AND peer.user_id=u.id AND f.user_id=?) following,
   EXISTS(SELECT 1 FROM follows f JOIN producers viewer ON viewer.id=f.target_id WHERE f.kind='producer' AND viewer.user_id=? AND f.user_id=u.id) follows_viewer,${playerColumnsSQL('u.id')} FROM users u WHERE u.id IN (${ids.map(()=>'?').join(',')}) AND u.provider!='deleted'`,data.self||'',data.self||'',...ids);
  const frames=new Map(identities.map(p=>[p.id,{following:!!p.following,follows_viewer:!!p.follows_viewer,premium_style_until:p.premium_style_until,premium_default_frame:p.premium_default_frame,profile_frame:p.profile_frame,profile_frame_artwork:p.profile_frame_artwork,profile_frame_display:p.profile_frame_display}]));
  data={...data,members:data.members.map(member=>({...member,...(frames.get(member.id)||{premium_style_until:0,premium_default_frame:0,profile_frame:null,profile_frame_artwork:null,profile_frame_display:null})}))};
 }
 const giftMessages=data.chat?.filter(message=>message.gift?.type);
 if(giftMessages?.length){
  const products=await catalog(env,giftMessages.map(message=>message.gift.type));
  data={...data,chat:data.chat.map(message=>{
   const image=giftRuntime(products.get(message.gift?.type))?.image;
   return image?{...message,gift:{...message.gift,image}}:message;
  })};
 }
 return data;
}
export async function directoryRoomThemes(env,rooms){
 if(!rooms.length)return new Map();
 const scope=rooms.map(r=>[r.id,r.host_id,r.theme_sku||null,r.settings_revision||0,r.background||DEFAULT_ROOM_THEME]);
 const settings=await rows(env,`WITH page AS (
  SELECT json_extract(value,'$[0]') id,json_extract(value,'$[1]') host_id,json_extract(value,'$[2]') chosen,
   json_extract(value,'$[3]') revision,json_extract(value,'$[4]') background FROM json_each(?)
 ), themes AS (
  SELECT page.id,page.host_id,rd.revision,rd.inventory_id,COALESCE(rd.sku,page.chosen,page.background) sku
  FROM page LEFT JOIN room_decorations rd ON rd.room_id=page.id AND rd.host_id=page.host_id
  AND (page.chosen IS NULL OR rd.revision=page.revision)
 ) SELECT themes.*,(SELECT MAX(pi.expires_at) FROM player_inventory pi WHERE pi.user_id=themes.host_id
  AND pi.item_key=themes.sku AND (pi.id=themes.inventory_id OR (themes.inventory_id IS NULL AND pi.source_ref=pi.item_key)) AND ${activeDecorationSQL('pi')}) expires_at FROM themes`,JSON.stringify(scope));
 const themes=new Map(),expired=[],server_now=now(),products=await catalog(env,settings.map(row=>row.sku));
 for(const {id,host_id,revision,sku,expires_at,inventory_id} of settings){
  const product=await catalogRoomTheme(env,sku,products),paid=product?.kind==='TALKING_ROOM_THEME';
  const active=paid&&expires_at!==null&&(expires_at===0||expires_at>server_now);
  themes.set(id,themeResponse(product&&(!paid||active)?product:DEFAULT_ROOM_SKIN,active?expires_at:0,server_now,active?inventory_id:null));
  if(revision!=null&&!active&&(paid||isRetiredRoomTheme(sku)))expired.push([id,host_id,revision,sku]);
 }
 // Match the current host and settings revision, including concurrent handoffs.
 if(expired.length)await run(env,`UPDATE room_decorations SET sku=?,inventory_id=NULL,updated=? WHERE (room_id,host_id,revision,sku) IN
  (SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]') FROM json_each(?))
  AND NOT EXISTS(SELECT 1 FROM player_inventory pi WHERE pi.user_id=room_decorations.host_id AND pi.item_key=room_decorations.sku AND (pi.id=room_decorations.inventory_id OR (room_decorations.inventory_id IS NULL AND pi.source_ref=pi.item_key)) AND ${activeDecorationSQL('pi')})`,DEFAULT_ROOM_THEME,server_now,JSON.stringify(expired));
 return themes;
}
