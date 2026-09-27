// Gold is the gift currency: 1 gold = 10 KRW (VAT included), sold in fixed packs (operator decision 2026-09-24).
export const GOLD_KRW=10;
// Fixed virtual gifts approved by the operator on 2026-09-28. Prices are server-authoritative.
export const GIFT_CATALOG=Object.freeze([
 ['note','음표',10,'좋은 음악에 작은 응원을'],['heart','하트',50,'마음에 쏙 드는 목소리'],
 ['rose','장미',100,'오늘의 무대에 꽃 한 송이'],['coffee','커피',300,'다음 곡도 기다릴게요'],
 ['microphone','마이크',500,'당신의 무대를 응원해요'],['crown','왕관',1000,'나에게는 최고의 아티스트'],
].map(([id,name,gold,description])=>Object.freeze({id,name,gold,price:gold*GOLD_KRW,description,image:`/assets/gifts/${id}.webp`})));
export const giftById=id=>GIFT_CATALOG.find(g=>g.id===id);
export const FREE_GIFT=Object.freeze({id:'star',name:'응원별',image:'/assets/gifts/star.webp',description:'매일 모아서 마음만 전해요'});
export const FREE_GIFT_REWARDS=Object.freeze({checkin:3,cover:2,listen:2,comment1:1,comment2:1,comment3:1});
export const giftDay=seconds=>new Date((seconds+9*3600)*1000).toISOString().slice(0,10);
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
// Individual creators are paid as business income: 3% income tax plus local income tax of 10% of it,
// each truncated to 10 KRW. Income tax under 1,000 KRW is not collected (소액부징수). Confirm with a tax accountant.
export function withholding(gross){
 let income=Math.floor(gross*3/100/10)*10;if(income<1000)income=0;
 const local=Math.floor(income/10/10)*10;
 return {income,local,net:gross-income-local};
}
export const BANKS=Object.freeze(['KB국민','신한','우리','하나','NH농협','IBK기업','SC제일','한국씨티','카카오뱅크','토스뱅크','케이뱅크','iM뱅크(대구)','부산','경남','광주','전북','제주','KDB산업','수협','새마을금고','신협','우체국']);
