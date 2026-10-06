import {PREMIUM} from './site-info.js';
import {GOLD_PACKS} from './gifts.js';
export const PLAY_PACKAGE='kr.co.aifect.app';
export const PLAY_PRODUCTS=Object.freeze([
 {id:'aifect_premium_monthly',type:'subs',name:'AIFECT Premium',price:PREMIUM.price,basePlan:'monthly'},
 ...GOLD_PACKS.map(p=>({id:`aifect_gold_${p.gold}`,type:'inapp',name:`골드 ${p.gold.toLocaleString('ko-KR')}G`,gold:p.gold,price:p.price})),
]);
export const playProduct=id=>PLAY_PRODUCTS.find(p=>p.id===id);
