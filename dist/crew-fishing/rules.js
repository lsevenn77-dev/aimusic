// Balance values are independent of fish illustrations and collection records.
export const TIERS = {
  common: {name:'일반', weight:5500, goal:3, cycle:1600},
  rare:   {name:'레어', weight:4000, goal:4, cycle:1400},
  unique: {name:'유니크', weight:440, goal:5, cycle:1250},
  legend: {name:'전설', weight:59, goal:6, cycle:1100},
  mythic: {name:'신화', weight:1, goal:7, cycle:1000}
};
export const SIZES = {
  S: {weight:5, min:1500, max:2500, percent:120},
  A: {weight:15, min:500, max:1499, percent:110},
  B: {weight:50, min:-500, max:499, percent:100},
  C: {weight:20, min:-1500, max:-501, percent:90},
  D: {weight:10, min:-2500, max:-1501, percent:80}
};
export const LIMITS = {day:10, week:50, width:30, warnings:2};
export const IDLE_MS = 3000;
// Stored lengths use 1/10,000 cm units. Truncate at 0.1 cm before splitting;
// displaying metres never changes the stored length or size-grade calculation.
export function formatLength(units){
  const tenths=Math.trunc(units/1000);
  const metres=Math.trunc(tenths/1000);
  const centimetres=(tenths%1000)/10;
  const remainder=centimetres.toLocaleString('ko-KR',{maximumFractionDigits:1})+'cm';
  return metres?metres.toLocaleString('ko-KR')+'m'+(centimetres?' '+remainder:''):remainder;
}
export function season(ms){
  const kst = new Date(ms + 9*3600000);
  const day = kst.toISOString().slice(0,10);
  const weekday = (kst.getUTCDay()+6)%7;
  const open = weekday<4 || (weekday===4 && kst.getUTCHours()<22);
  kst.setUTCDate(kst.getUTCDate()-weekday);
  return {day, week:kst.toISOString().slice(0,10), open};
}
export function weighted(table, roll){
  for(const [key,entry] of Object.entries(table)){
    if(roll<entry.weight)return key;
    roll-=entry.weight;
  }
  throw new RangeError('draw outside distribution');
}
export function position(elapsed,cycle){
  const phase=(Math.max(0,elapsed)%cycle)/cycle;
  return 100*(1-Math.abs(2*phase-1));
}
export function progressAfter(cast,hit){
  const progress=Math.max(0,cast.progress+(hit?1:-1));
  const warnings=cast.warnings+Number(!hit && cast.progress===0);
  const status=progress>=cast.goal?'caught':warnings>=LIMITS.warnings?'escaped':'active';
  return {progress,warnings,status};
}

