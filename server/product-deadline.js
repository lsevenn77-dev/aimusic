import {fail} from './db.js';

export function parseProductDeadline(value){
 if(value==null)return null;
 if(typeof value!=='object'||Array.isArray(value))fail(400,'지급 기한을 확인해 주세요.');
 if(value.mode==='none')return {mode:'none'};
 if(value.mode==='days'&&Number.isInteger(value.days)&&value.days>0&&value.days<=3650)return {mode:'days',days:value.days};
 if(value.mode==='date'&&typeof value.date==='string'&&/^20\d{2}-\d\d-\d\d$/.test(value.date)){
  const midnight=Date.parse(value.date+'T00:00:00Z');
  if(Number.isFinite(midnight)&&new Date(midnight).toISOString().slice(0,10)===value.date)return {mode:'date',date:value.date};
 }
 fail(400,'지급일 기준 일수 또는 유효한 한국 날짜를 입력해 주세요.');
}

export function productGrantExpiry(deadline,at){
 if(!deadline||deadline.mode==='none')return null;
 if(deadline.mode==='days')return at+deadline.days*86400;
 return Date.parse(deadline.date+'T00:00:00+09:00')/1000+86400;
}
