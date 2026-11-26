import {giftThumbnail,noticeFormat} from './official-notice-content.js';
import {PERIOD_LABELS} from './decorations.js';

export const giftArrivalTitle='선물이 도착했습니다';
export const giftInventoryLink='#inventory';
const dateFormat=new Intl.DateTimeFormat('ko-KR',{
 timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
export const giftDeadlineText=timestamp=>timestamp>0?dateFormat.format(timestamp*1000)+' KST':'';
const paragraph=(text,extra={})=>({type:'p',align:'left',runs:[{text,...extra}]});
export function giftArrivalContent(message='',products=[]){
 const blocks=message?[paragraph(message)]:[];
 for(const item of products){
  const status={used:item.type==='gift'?'사용 완료':'사용 시작',recalled:'회수 완료',expired:'기한 만료',unavailable:'보유권 없음'}[item.state];
  const until=giftDeadlineText(item.expires_at),active=giftDeadlineText(item.active_until),season=giftDeadlineText(item.season_ends_at);
  const details=[
   status,until&&((item.type==='gift'?'사용 기한 ':'사용 시작 기한 ')+until),
   item.type!=='gift'&&PERIOD_LABELS[item.option]&&('이용 기간 '+PERIOD_LABELS[item.option]),
   active&&('이용 종료 '+active),season&&('시즌 종료 '+season)
  ].filter(Boolean).join(' · ');
  blocks.push({type:'p',align:'left',thumbnail:giftThumbnail(item.thumbnail),runs:[
   {text:item.name+' × '+item.quantity,bold:true},...(details?[{text:'\n'+details}]:[])
  ]});
 }
 blocks.push(paragraph('인벤토리 열기',{href:giftInventoryLink,bold:true,color:'mint'}));
 return {format:noticeFormat,title:giftArrivalTitle,blocks};
}
