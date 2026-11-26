import {WELCOME_CAMPAIGN_ID} from '../shared/welcome-guide.js';
import {PREMIUM_OPEN_NOTICE_ID} from '../shared/premium-open-notice.js';
import {noticeForMember,noticeFormat} from '../shared/official-notice-content.js';

export const noticeScope=`(c.kind IN ('announcement','welcome') OR c.id IN ('${WELCOME_CAMPAIGN_ID}','${PREMIUM_OPEN_NOTICE_ID}'))`;
export const noticeVisible=`${noticeScope} AND c.withdrawn_at=0 AND r.withdrawn_at=0`;

export function recipientRichNotice(record){
 const kind=record.campaign_kind??record.kind;
 if(!record.edit_json&&kind==='legacy')return null;
 const data=JSON.parse(record.edit_json??record.content_json);
 if(data.format!==noticeFormat)return null;
 return kind==='welcome'||record.campaign_id===WELCOME_CAMPAIGN_ID||record.legacy_id===WELCOME_CAMPAIGN_ID?
  noticeForMember(data,record.nickname):data;
}
