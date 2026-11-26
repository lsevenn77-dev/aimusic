import {WELCOME_CAMPAIGN_ID} from '../shared/welcome-guide.js';
import {PREMIUM_OPEN_NOTICE_ID} from '../shared/premium-open-notice.js';
import {noticeForMember,noticeFormat} from '../shared/official-notice-content.js';
import {query} from './db.js';

export const noticeScope=`(c.kind IN ('announcement','welcome','welcome_test') OR c.id IN ('${WELCOME_CAMPAIGN_ID}','${PREMIUM_OPEN_NOTICE_ID}'))`;
export const noticeVisible=`(${noticeScope} OR c.kind='gift') AND c.withdrawn_at=0 AND r.withdrawn_at=0`;
export const usesNoticeNickname=(kind,campaignId)=>kind==='welcome'||kind==='welcome_test'||campaignId===WELCOME_CAMPAIGN_ID;
export function bumpGiftArrivalVersion(env,targets,...args){
 return query(env,`UPDATE welcome_campaigns SET version=version+1 WHERE kind='gift' AND id IN (
  SELECT 'gift-'||a.id FROM (${targets}) touched JOIN gift_dispatch_items a
   ON a.dispatch_id=touched.dispatch_id AND a.user_id=touched.user_id AND a.line=0
 )`,...args);
}

export function recipientRichNotice(record){
 if(record.gift_content)return record.gift_content;
 const kind=record.campaign_kind??record.kind;
 if(!record.edit_json&&kind==='legacy')return null;
 const data=JSON.parse(record.edit_json??record.content_json);
 if(data.format!==noticeFormat)return null;
 return usesNoticeNickname(kind,record.campaign_id??record.legacy_id)?
  noticeForMember(data,record.nickname):data;
}
