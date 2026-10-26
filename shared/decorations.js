// The four approved SKUs. Prices live here and are quoted by the server.
export const PERIOD_LABELS=Object.freeze({P7D:'7일',P1M:'1개월',P3M:'3개월'});
export const DECORATION_PRICES_GOLD=Object.freeze({
 PROFILE_FRAME:Object.freeze({P7D:50,P1M:150,P3M:390}),
 TALKING_ROOM_THEME:Object.freeze({P7D:100,P1M:300,P3M:790})
});
const theme=(sku,name,prefix)=>Object.freeze({sku,name,kind:'TALKING_ROOM_THEME',currency:'G',motion:'STATIC',periodPrices:DECORATION_PRICES_GOLD.TALKING_ROOM_THEME,assetPaths:Object.freeze({roomDesktop:`/assets/products/${prefix}_pc.webp`,roomMobile:`/assets/products/${prefix}_mobile.webp`,roomCard:`/assets/products/${prefix}_card.webp`})});
export const DECORATIONS=Object.freeze({
 frame_aurora_ring:Object.freeze({sku:'frame_aurora_ring',name:'오로라 링',kind:'PROFILE_FRAME',currency:'G',motion:'STATIC',periodPrices:DECORATION_PRICES_GOLD.PROFILE_FRAME,assetPaths:Object.freeze({overlay:'/assets/products/aurora_ring_frame.png',thumbnail:'/assets/previews/aurora_ring_thumbnail.webp'})}),
 theme_starlight_lounge:theme('theme_starlight_lounge','별빛 라운지','starlight_lounge'),
 theme_cherry_blossom:theme('theme_cherry_blossom','벚꽃 멜로디 라운지','cherry_blossom_lounge'),
 theme_aurora_night:theme('theme_aurora_night','오로라 나이트 라운지','aurora_night_lounge')
});
export const FREE_ROOM_THEMES=Object.freeze([{sku:'navy',name:'차분한 다크'},{sku:'sunset',name:'차분한 노을'},{sku:'night',name:'밤하늘'}]);
export const DEFAULT_ROOM_THEME='navy';
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
