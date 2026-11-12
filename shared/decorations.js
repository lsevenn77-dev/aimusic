// Registered SKUs. Prices live here and are quoted by the server.
export const PERIOD_LABELS=Object.freeze({P7D:'7일',P1M:'1개월',P3M:'3개월'});
export const DECORATION_PRICES_GOLD=Object.freeze({
 PROFILE_FRAME:Object.freeze({P7D:50,P1M:150,P3M:390}),
 TALKING_ROOM_THEME:Object.freeze({P7D:100,P1M:300,P3M:790})
});
const theme=(sku,name,uiMode='dark')=>Object.freeze({sku,name,uiMode,kind:'TALKING_ROOM_THEME',currency:'G',motion:'STATIC',periodPrices:DECORATION_PRICES_GOLD.TALKING_ROOM_THEME,assetPaths:Object.freeze({roomDesktop:`/assets/themes/v20261027/${sku}/background-pc.webp`,roomMobile:`/assets/themes/${sku==='theme_aurora_night'?'v20261028':'v20261027'}/${sku}/background-mobile.webp`,roomCard:`/assets/themes/v20261027/${sku}/cover.webp`})});
const frameDir='/assets/products/bunnies-v1/';
const bunny=(sku,name,file,multiplier=1,fx=null)=>{
 const overlay=frameDir+file,prices=DECORATION_PRICES_GOLD.PROFILE_FRAME;
 return Object.freeze({sku,name,kind:'PROFILE_FRAME',currency:'G',motion:fx?'LAYERED':'STATIC',
  periodPrices:multiplier===1?prices:Object.freeze(Object.fromEntries(Object.entries(prices).map(([period,gold])=>[period,gold*multiplier]))),
  assetPaths:Object.freeze({overlay,thumbnail:overlay,...(fx?{effect:frameDir+fx}:{})})});
};
export const BUNNY_FRAMES=Object.freeze([
 bunny('frame_moonlight_bunny','달빛토끼','moonlight_bunny.png'),
 bunny('frame_mecha_bunny','로봇토끼','mecha_bunny.png'),
 bunny('frame_space_bunny','우주 행성토끼','space_bunny_base.png',2,'space_bunny_fx.webp')
]);
export const DECORATIONS=Object.freeze({
 frame_aurora_ring:Object.freeze({sku:'frame_aurora_ring',name:'오로라 링',kind:'PROFILE_FRAME',currency:'G',motion:'STATIC',periodPrices:DECORATION_PRICES_GOLD.PROFILE_FRAME,assetPaths:Object.freeze({overlay:'/assets/products/aurora_ring_frame.png',thumbnail:'/assets/previews/aurora_ring_thumbnail.webp'})}),
 ...Object.fromEntries(BUNNY_FRAMES.map(p=>[p.sku,p])),
 theme_starlight_lounge:theme('theme_starlight_lounge','별빛 라운지'),
 theme_cherry_blossom:theme('theme_cherry_blossom','벚꽃 멜로디 라운지'),
 theme_aurora_night:theme('theme_aurora_night','오로라 나이트 라운지')
});
function basicRoomTheme(sku,name,uiMode) {
 const base='/assets/themes/v20261112/'+sku+'/'+uiMode+'-';
 return Object.freeze({sku,name,uiMode,assetPaths:Object.freeze({
  roomDesktop:base+'pc-2560x1440.webp',roomMobile:base+'mobile-1440x2560.webp',
  roomMobileTall:base+'mobile-tall-1440x3120.webp',roomCard:base+'card-1200x1600.webp'
 })});
}
export function roomUIMode(theme) {
 const mode=theme?.uiMode;
 if(mode==null||mode==='dark')return 'dark';
 if(mode==='light')return 'light';
 if(typeof process!=='undefined'&&process.env?.NODE_ENV==='development')console.warn('Invalid room uiMode',mode);
 return 'dark';
}
export const DEFAULT_ROOM_SKIN=basicRoomTheme('basic_dark','턴테이블','dark');
export const DEFAULT_ROOM_THEME=DEFAULT_ROOM_SKIN.sku;
export const FREE_ROOM_THEMES=Object.freeze([DEFAULT_ROOM_SKIN,basicRoomTheme('basic_light','헤드폰','light')]);
export function isRetiredRoomTheme(sku){
 return sku==='navy'||sku==='sunset'||sku==='night';
}
export function roomThemeProduct(sku){
 const product=Object.hasOwn(DECORATIONS,sku)?DECORATIONS[sku]:null;
 return product?.kind==='TALKING_ROOM_THEME'?product:FREE_ROOM_THEMES.find(t=>t.sku===sku);
}
export function quoteDecoration(sku,period){
 if(!Object.hasOwn(DECORATIONS,sku)||!Object.hasOwn(PERIOD_LABELS,period))throw new RangeError('상품과 이용 기간을 확인해주세요.');
 return {sku,period,gold:DECORATIONS[sku].periodPrices[period],currency:'G'};
}
// Epoch seconds, matching the existing inventory. Month arithmetic is in KST.
export function decorationExpiry(start,period){
 if(!Number.isSafeInteger(start)||start<0)throw new RangeError('Invalid start time');
 if(period==='P7D')return start+7*86400;
 const months=({P1M:1,P3M:3})[period];if(!months)throw new RangeError('Invalid period');
 const local=new Date((start+9*3600)*1000),y=local.getUTCFullYear(),m=local.getUTCMonth();
 const day=Math.min(local.getUTCDate(),new Date(Date.UTC(y,m+months+1,0)).getUTCDate());
 return Date.UTC(y,m+months,day,local.getUTCHours(),local.getUTCMinutes(),local.getUTCSeconds())/1000-9*3600;
}

const legacyFrameFiles=new Set(['aurora_ring_frame.png','moonlight_bunny.png','mecha_bunny.png','space_bunny_base.png','space_bunny_fx.webp','crew-basic-v2.webp','player-level-10-forest-v1.webp','crew-level-3-v2.webp','crew-level-4-v2.webp','crew-level-5-v2.webp']);
export function frameDisplayAssets(overlay,effect=null){
 const normalized=path=>{if(!path)return null;const file=path.split('?')[0].split('/').pop();return legacyFrameFiles.has(file)?'/assets/profile-frames-v1/'+file:path;};
 return {overlay:normalized(overlay),effect:normalized(effect),scale:1.5};
}
