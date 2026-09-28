import {now,fail} from './db.js';

// Period boundaries use the Korean calendar, independent of browser timezone.
export function rankingPeriod(period,at=now()){
 const local=new Date((at+32400)*1000),y=local.getUTCFullYear(),m=local.getUTCMonth(),d=local.getUTCDate();
 const midnight=Date.UTC(y,m,d)/1000-32400;
 const periods={today:{label:'오늘',from:midnight},week:{label:'이번 주',from:midnight-((local.getUTCDay()+6)%7)*86400},month:{label:'이달',from:Date.UTC(y,m,1)/1000-32400},all:{label:'명예의 전당',from:0}};
 if(!Object.hasOwn(periods,period))fail(400,'랭킹 기간을 확인해주세요.');
 return {period,...periods[period],until:at,time_zone:'Asia/Seoul'};
}
