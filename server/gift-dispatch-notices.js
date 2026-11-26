import {giftArrivalContent} from '../shared/gift-arrival.js';
import {query,rows,run} from './db.js';
import {giftArrivalNoticeQueries} from './notice-campaigns.js';

export async function sendGiftArrivalBatch(env,job,{retry=false}={}){
 const state=retry?'failed':'pending';
 const batch=await rows(env,`SELECT a.id FROM gift_dispatch_items a WHERE a.dispatch_id=? AND a.line=0 AND a.notice_state=?
  AND EXISTS (SELECT 1 FROM gift_dispatch_items g INDEXED BY gift_dispatch_member_line
   WHERE g.dispatch_id=a.dispatch_id AND g.user_id=a.user_id AND g.state='granted')
  AND NOT EXISTS (SELECT 1 FROM gift_dispatch_items p INDEXED BY gift_dispatch_member_line
   WHERE p.dispatch_id=a.dispatch_id AND p.user_id=a.user_id AND p.state='pending')
  ORDER BY a.id LIMIT 48`,job.id,state);
 if(!batch.length)return;
 const anchors=batch.map(row=>row.id),keys=JSON.stringify(anchors);
 try{
  await env.DB.batch([
   ...giftArrivalNoticeQueries(env,job,anchors,giftArrivalContent(job.message)),
   query(env,`UPDATE gift_dispatch_items AS a SET notice_state=CASE
     WHEN EXISTS(SELECT 1 FROM welcome_receipts WHERE campaign_id='gift-'||a.id AND user_id=a.user_id) THEN 'sent'
     WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=a.user_id AND provider<>'deleted' AND account_type='human') THEN 'skipped'
     ELSE 'pending' END
    WHERE a.dispatch_id=? AND a.line=0 AND a.notice_state=? AND a.id IN (SELECT value FROM json_each(?))`,job.id,state,keys)
  ]);
 }catch(error){
  console.error('Gift arrival write failed',job.id,error.message);
  await run(env,`UPDATE gift_dispatch_items SET notice_state='failed'
   WHERE dispatch_id=? AND line=0 AND notice_state=? AND id IN (SELECT value FROM json_each(?))`,job.id,state,keys);
 }
}
