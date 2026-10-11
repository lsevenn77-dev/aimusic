// Legacy gift display reference only; purchases and settlement use channel prices and paid lots.
export const GOLD_KRW=10;
// Fixed virtual gifts approved by the operator on 2026-09-28. Prices are server-authoritative.
export const GIFT_CATALOG=Object.freeze([
 ['balloon','풍선',1,'가볍게 띄우는 작은 응원'],
 ['note','음표',10,'좋은 음악에 작은 응원을'],['heart','하트',50,'마음에 쏙 드는 목소리'],
 ['rose','장미',100,'오늘의 무대에 꽃 한 송이'],['coffee','커피',300,'다음 곡도 기다릴게요'],
 ['microphone','마이크',500,'당신의 무대를 응원해요'],['crown','왕관',1000,'나에게는 최고의 아티스트'],
].map(([id,name,gold,description])=>Object.freeze({id,name,gold,price:gold*GOLD_KRW,description,image:`/assets/gifts/${id}.webp`})));
export const giftById=id=>GIFT_CATALOG.find(g=>g.id===id);
export const FREE_GIFT=Object.freeze({id:'star',name:'응원별',image:'/assets/gifts/star.webp',description:'매일 모아서 마음만 전해요'});
export const FREE_GIFT_REWARDS=Object.freeze({checkin:3,cover:2,listen:2,comment1:1,comment2:1,comment3:1});
export const giftDay=seconds=>new Date((seconds+9*3600)*1000).toISOString().slice(0,10);
// VAT-inclusive channel prices approved 2026-10-11. Existing paid lots keep their actual price.
export const APP_GOLD_KRW=13,WEB_GOLD_KRW=11;
export const GOLD_PACKS=Object.freeze([500,1000,5000,10000].map(gold=>Object.freeze({gold,price:gold*APP_GOLD_KRW})));
// The web promotion increases delivered quantity; store SKUs retain the base quantity.
export const WEB_GOLD_BONUS_PERCENT=5;
export const WEB_GOLD_PACKS=Object.freeze(GOLD_PACKS.map(p=>{
 const bonus_gold=Math.floor(p.gold*WEB_GOLD_BONUS_PERCENT/100);
 return Object.freeze({...p,price:p.gold*WEB_GOLD_KRW,bonus_gold,total_gold:p.gold+bonus_gold});
}));
export const GIFT_MIN_GOLD=10,GIFT_MAX_GOLD=100000;
// Payment fees come off first: app stores are assumed at 15%, web card payments record the actual fee per purchase.
// New KRW purchases reserve Korean VAT separately; existing lots keep their recorded terms.
export const includedKoreanVat=price=>Math.round(price/11);
export const DIAMOND_KRW=100,DIAMOND_GOLD=10,PARTNER_MIN_KRW=1000000;
export const diamondsFromMw=mw=>mw/(DIAMOND_KRW*1000);
export const GIFT_SETTLEMENT_NOTICE="세금·결제 수수료를 제외한 개인·원곡 선물 수익은 일반 창작자 60%·파트너 70%, 커버곡 선물은 가창자 70%를 다이아로 적립합니다.";
export function settlementPolicyHTML(){return `<div class="table-scroll"><table class="earnings-table"><thead><tr><th>구분</th><th>일반 창작자</th><th>파트너 창작자</th></tr></thead><tbody><tr><td>스트리밍 수익풀</td><td>50%</td><td>50%</td></tr><tr><td>개인·원곡 골드 선물</td><td>60%</td><td>70%</td></tr><tr><td>개인·원곡 선물의 플랫폼 몫</td><td>40%</td><td>30%</td></tr><tr><td>커버곡 선물</td><td colspan="2">가창자 70% · 플랫폼 30% (등급 공통)</td></tr><tr><td>인증</td><td>없음</td><td>공식 파트너 배지</td></tr></tbody></table></div><p>모든 수익 배분은 환불·취소 금액, 세금과 실제 결제 수수료를 제외한 금액을 기준으로 합니다. 커버곡 선물은 원곡자에게 배분하지 않습니다. 커버곡의 유효 재생은 스트리밍 수익 계산에서 원곡 창작자에게 반영합니다.</p><h3>파트너 승급</h3><ol><li>스트리밍과 골드 선물의 누적 세전 확정 정산금 합계가 100만 원 이상이면 검증 대상이 됩니다.</li><li>운영자가 환불·취소·부정 재생·자가 후원 등 비정상 수익을 제외하고 확인한 후 승급합니다. 조건 달성만으로 검증 없이 승급하지 않습니다.</li><li>운영자가 직접 선정한 공식 파트너도 허용하며 선정 사유를 기록합니다.</li><li>파트너 7:3은 승급 이후 발생한 개인·원곡 선물부터 적용하고, 이미 확정된 수익에는 소급 적용하지 않습니다. 스트리밍은 등급과 관계없이 5:5입니다.</li><li>정상 활동과 인정 실적을 유지하면 등급을 유지합니다. 다이아를 사용하거나 현금 정산해도 누적 실적은 감소하지 않으며, 환불·부정 수익 제외는 실적에서 차감됩니다.</li></ol><h3>골드와 다이아</h3><p>골드는 선물을 보내는 재화, 다이아는 확정된 수익입니다. 1다이아는 세전 정산금 100원이며 10골드로 전환할 수 있습니다. 500다이아 → 5,000골드로 추가 차감 없이 전환합니다. 웹 신규 결제의 5% 추가 골드 혜택은 다이아 전환에는 적용하지 않습니다. 전환한 골드는 현금 정산할 수 없고 전환을 되돌릴 수 없습니다.</p><p>현금 정산은 확정된 다이아만 가능하며 별도 환전 수수료 10%는 적용하지 않습니다. 100다이아(1만 원) 이상부터 월 1회 신청할 수 있고, 신청 다음 달 25일에 지급 예정입니다. 계좌·본인 확인과 필요한 원천징수 후 지급하며, 환불·부정 수익 검토 중에는 지급·전환이 보류될 수 있습니다. 무료 응원별은 다이아 적립·현금 정산 대상이 아닙니다.</p>`;}
export const APP_STORE_FEE_BP=1500;
// Shares of what remains after payment fees, in basis points.
export const GIFT_SPLITS=Object.freeze({
 cover:Object.freeze({singer:7000,creator:0,platform:3000}),
 original:Object.freeze({singer:0,creator:6000,platform:4000}),
});
// Monthly settlement: earnings of the 1st to the last day are paid on the 25th of the next month, from 10,000 KRW.
export const MIN_PAYOUT_KRW=10000,PAYOUT_DAY=25,EARNINGS_AVAILABLE_DAY=5;
export function earningsSchedule(month,seconds=Date.now()/1000){
 const [year,m]=month.split('-').map(Number);
 const next=day=>new Date(Date.UTC(year,m,day)).toISOString().slice(0,10);
 const available_on=next(EARNINGS_AVAILABLE_DAY);
 return {available_on,earnings_available:giftDay(seconds)>=available_on,payout_on:next(PAYOUT_DAY)};
}

// Amounts below are milli-won (1/1000 KRW) so per-gift shares keep their precision until settlement.
export function splitGift(kind,netMw,partner=false){
 const s=kind==='original'&&partner?{singer:0,creator:7000}:GIFT_SPLITS[kind];if(!s)throw new Error('선물 대상을 확인해주세요.');
 const singer=Math.floor(netMw*s.singer/10000),creator=Math.floor(netMw*s.creator/10000);
 return {singer,creator,platform:netMw-singer-creator};
}
// Oldest gold is spent first; each purchase keeps its own after-fee value per gold.
export function allocateLots(lots,gold){
 const out=[];let left=gold;
 for(const lot of lots){
  if(!left)break;
  const take=Math.min(left,lot.gold-lot.used);if(take<=0)continue;
  out.push({purchase_id:lot.id,gold:take,net_mw:Math.round(take*Math.max(0,lot.price_krw-lot.fee_krw-(lot.tax_krw||0))*1000/lot.gold)});left-=take;
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
