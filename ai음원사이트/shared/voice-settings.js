import {DEFAULT_ROOM_THEME,isRetiredRoomTheme,roomThemeProduct} from './decorations.js';

// Older rooms stored a palette in background even when theme_sku held paid artwork.
export function upgradeRoomBackground(room){
 if(!room||(!isRetiredRoomTheme(room.background)&&!isRetiredRoomTheme(room.theme_sku)))return false;
 const chosen=room.theme_sku||room.background;
 room.background=isRetiredRoomTheme(chosen)?DEFAULT_ROOM_THEME:chosen;
 // Without a stored SKU the Site may hold the owner's choice in room_decorations.
 if(room.theme_sku)room.theme_sku=room.background;
 return true;
}

export function roomSettings(input,actor,previous={}) {
 const seating_mode=input.seating_mode??previous.seating_mode??'approval';
 if(!['approval','free'].includes(seating_mode))throw Error('좌석 참여 방식을 확인해 주세요.');
 const title=String(input.title??previous.title??'').trim();
 const visibility=input.visibility??previous.visibility??'public';
 const max_members=Number(input.max_members??previous.max_members??30);
 const background=input.theme_sku??input.background??previous.theme_sku??previous.background??DEFAULT_ROOM_THEME;
 const announcement=String(input.announcement??previous.announcement??'').trim();
 const crew_id=visibility==='crew'?(input.crew_id??previous.crew_id):null;
 if(!title||title.length>60||!['public','private','crew','followers'].includes(visibility)||!Number.isInteger(max_members)||max_members<2||max_members>30||!roomThemeProduct(background)||announcement.length>200)throw Error('방 설정 내용을 확인해 주세요.');
 if(visibility==='crew'&&(!crew_id||!actor.crews?.includes(crew_id)))throw Error('방장이 속한 크루를 선택해 주세요.');
 return {seating_mode,title,visibility,max_members,background,theme_sku:background,announcement,crew_id};
}
