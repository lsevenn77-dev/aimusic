// Gold is the gift currency: 1 gold = 10 KRW (VAT included), sold in fixed packs (operator decision 2026-09-24).
export const GOLD_KRW=10;
export const GOLD_PACKS=Object.freeze([100,500,1000,5000].map(gold=>Object.freeze({gold,price:gold*GOLD_KRW})));
export const GIFT_MIN_GOLD=10,GIFT_MAX_GOLD=100000;
// Payment fees come off first: app stores are assumed at 15%, web card payments record the actual fee per purchase.
// VAT is not deducted before the split.
export const APP_STORE_FEE_BP=1500;
// Shares of what remains after payment fees, in basis points.
export const GIFT_SPLITS=Object.freeze({
 cover:Object.freeze({singer:4000,creator:3000,platform:3000}),
 original:Object.freeze({singer:0,creator:7000,platform:3000}),
});
// Monthly settlement: earnings of the 1st to the last day are paid on the 15th of the next month, from 10,000 KRW.
export const MIN_PAYOUT_KRW=10000,PAYOUT_DAY=15;

// Amounts below are milli-won (1/1000 KRW) so per-gift shares keep their precision until settlement.
export function splitGift(kind,netMw){
 const s=GIFT_SPLITS[kind];if(!s)throw new Error('선물 대상을 확인해주세요.');
 const singer=Math.floor(netMw*s.singer/10000),creator=Math.floor(netMw*s.creator/10000);
 return {singer,creator,platform:netMw-singer-creator};
}
// Oldest gold is spent first; each purchase keeps its own after-fee value per gold.
export function allocateLots(lots,gold){
 const out=[];let left=gold;
 for(const lot of lots){
  if(!left)break;
  const take=Math.min(left,lot.gold-lot.used);if(take<=0)continue;
  out.push({purchase_id:lot.id,gold:take,net_mw:Math.round(take*(lot.price_krw-lot.fee_krw)*1000/lot.gold)});left-=take;
 }
 if(left)throw Object.assign(new Error('골드가 부족해요.'),{shortBy:left});
 return out;
}
// Settlement periods follow Korean calendar months.
export const giftMonth=seconds=>new Date((seconds+9*3600)*1000).toISOString().slice(0,7);
export const wonFromMw=mw=>Math.floor(mw/1000);
