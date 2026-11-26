import {eligibleNoticeMember} from './notice-audience.js';
import {fail,now,one,query,rows,run} from './db.js';

const batchSize=64;
const openJob="EXISTS(SELECT 1 FROM notice_delivery_jobs j WHERE j.campaign_id=notice_delivery_items.campaign_id AND j.revision=? AND j.finished_at=0)";
const chosenRows="SELECT i.user_id FROM notice_delivery_items i JOIN notice_delivery_jobs j ON j.campaign_id=i.campaign_id WHERE i.campaign_id=? AND j.revision=? AND j.finished_at=0 AND i.state='pending' AND i.user_id IN (SELECT value FROM json_each(?))";

export async function noticeDeliveryStatus(env,id){
 const row=await one(env,`SELECT j.*, (SELECT COUNT(*) FROM notice_delivery_items i
  WHERE i.campaign_id=j.campaign_id AND i.state='sent') success,
  (SELECT COUNT(*) FROM notice_delivery_items i WHERE i.campaign_id=j.campaign_id AND i.state='failed') failed
  FROM notice_delivery_jobs j WHERE j.campaign_id=?`,id);
 if(!row)return null;
 return {id,created:row.created,finished_at:row.finished_at||null,requested:row.requested,
  recipients:row.success,success:row.success,failed:row.failed,pending:row.requested-row.success-row.failed,
  push:!!row.push,revision:row.revision,status:!row.finished_at?'processing':row.failed?'failed':'sent'};
}

export async function processNoticeBatch(env,id){
 const job=await one(env,'SELECT revision,push FROM notice_delivery_jobs WHERE campaign_id=? AND finished_at=0',id);
 if(!job)return false;
 const targets=await rows(env,`SELECT user_id FROM notice_delivery_items WHERE campaign_id=? AND state='pending'
  ORDER BY user_id LIMIT ?`,id,batchSize);
 const ids=JSON.stringify(targets.map(item=>item.user_id)),at=now();
 if(targets.length){
  const steps=[query(env,`INSERT INTO welcome_receipts(campaign_id,user_id,created,source)
   SELECT ?,u.id,?,'broadcast' FROM (${chosenRows}) chosen JOIN users u ON u.id=chosen.user_id
   WHERE ${eligibleNoticeMember} ON CONFLICT(campaign_id,user_id) DO NOTHING`,id,at,id,job.revision,ids)];
  if(job.push)steps.push(query(env,`INSERT INTO push_outbox(id,recipient,kind,target,created)
   SELECT 'official:'||r.campaign_id||':'||r.user_id,r.user_id,'official_notice',r.campaign_id,?
   FROM (${chosenRows}) chosen JOIN welcome_receipts r ON r.campaign_id=? AND r.user_id=chosen.user_id
   WHERE r.withdrawn_at=0 ON CONFLICT(id) DO NOTHING`,at,id,job.revision,ids,id));
  steps.push(query(env,`WITH delivered AS MATERIALIZED (
   SELECT r.user_id FROM welcome_receipts r WHERE r.campaign_id=? AND r.user_id IN (SELECT value FROM json_each(?))
  ) UPDATE notice_delivery_items SET
   state=CASE WHEN user_id IN (SELECT user_id FROM delivered) THEN 'sent' ELSE 'failed' END,
   reason=CASE WHEN user_id IN (SELECT user_id FROM delivered) THEN NULL
    WHEN EXISTS(SELECT 1 FROM users u WHERE u.id=notice_delivery_items.user_id AND u.provider<>'deleted') THEN 'ai_account'
    ELSE 'withdrawn' END,
   sent_at=CASE WHEN user_id IN (SELECT user_id FROM delivered) THEN ? ELSE 0 END
   WHERE campaign_id=? AND state='pending' AND user_id IN (SELECT value FROM json_each(?)) AND ${openJob}`,
   id,ids,at,id,ids,job.revision));
  try{await env.DB.batch(steps);}catch(error){
   // The whole batch rolled back. Record exactly the recipients still pending.
   console.error('Announcement delivery batch failed',id);
   await run(env,`UPDATE notice_delivery_items SET state='failed',reason='write_failed'
    WHERE campaign_id=? AND state='pending' AND user_id IN (SELECT value FROM json_each(?)) AND ${openJob}`,
    id,ids,job.revision);
  }
 }
 await run(env,`UPDATE notice_delivery_jobs SET finished_at=? WHERE campaign_id=? AND revision=? AND finished_at=0
  AND NOT EXISTS(SELECT 1 FROM notice_delivery_items WHERE campaign_id=? AND state='pending')`,at,id,job.revision,id);
 return targets.length===batchSize;
}

export async function runNoticeJobs(env,campaignId){
 if(env.AIFECT_NOTICE_READ_ONLY==='true')return;
 const jobs=campaignId?[{campaign_id:campaignId}]:await rows(env,`SELECT campaign_id FROM notice_delivery_jobs
  WHERE finished_at=0 ORDER BY created LIMIT 4`);
 for(const job of jobs){
  for(let batch=0;batch<8;batch++){
   if(!await processNoticeBatch(env,job.campaign_id))break;
  }
 }
}

export function continueNoticeJob(env,ctx,campaignId){
 if(ctx?.waitUntil)ctx.waitUntil(runNoticeJobs(env,campaignId).catch(()=>console.error('Announcement delivery is pending')));
}

export async function retryNoticeFailures(env,actor,id,revision){
 if(!Number.isSafeInteger(revision)||revision<0)fail(400,'발송 상태를 다시 확인해 주세요.');
 const status=await noticeDeliveryStatus(env,id);
 if(!status)fail(404,'발송 결과를 찾을 수 없습니다.');
 const campaign=await one(env,'SELECT author_id,withdrawn_at FROM welcome_campaigns WHERE id=?',id);
 if(campaign.author_id!==actor)fail(403,'발송한 관리자만 실패한 대상에게 다시 발송할 수 있습니다.');
 if(campaign.withdrawn_at)fail(409,'철회된 공지입니다.');
 if(status.revision>revision)return status;
 if(!status.failed||status.status==='processing'||status.revision!==revision)fail(409,'발송 상태를 다시 확인해 주세요.');
 await env.DB.batch([
  query(env,`UPDATE notice_delivery_jobs SET finished_at=0,revision=revision+1
   WHERE campaign_id=? AND revision=? AND finished_at>0
   AND EXISTS(SELECT 1 FROM welcome_campaigns WHERE id=? AND withdrawn_at=0)`,id,revision,id),
  query(env,`UPDATE notice_delivery_items SET state='pending',reason=NULL WHERE campaign_id=? AND state='failed' AND changes()=1
   AND EXISTS(SELECT 1 FROM notice_delivery_jobs WHERE campaign_id=? AND revision=? AND finished_at=0)`,id,id,revision+1)
 ]);
 return noticeDeliveryStatus(env,id);
}
