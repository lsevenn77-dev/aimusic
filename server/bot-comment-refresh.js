import {one,rows,query} from './db.js';

export const COMMENT_REFRESH_ID='comment-refresh:20261104';
export const COMMENT_REFRESH_PREFIX='refresh:20261104:';
export async function isRequestedCommentRefresh(env,job){
 return job.action==='comment'&&job.id.startsWith(COMMENT_REFRESH_PREFIX)&&!!await one(env,'SELECT 1 FROM ai_bot_audit WHERE id=? AND action=?',COMMENT_REFRESH_ID,'comment_refresh_requested');
}

// Part of the same D1 transaction as the successful new comment. Never touch a
// human author or a comment created after the migration snapshot. Keep IDs for
// human replies/reports and retain the original text in the audited backup.
export function replacePreviousBotComments(env,activityId,at){
 const guard="EXISTS(SELECT 1 FROM ai_bot_activities WHERE id=?)";
 return [
  query(env,`UPDATE comments SET body='',edited=?,deleted_at=?,deleted_by=? WHERE deleted_at=0
   AND user_id IN (SELECT b.user_id FROM ai_bots b JOIN users u ON u.id=b.user_id WHERE u.account_type='ai_bot' AND u.provider='ai_service')
   AND id IN (SELECT json_extract(details,'$.id') FROM ai_bot_audit WHERE action='comment_refresh_backup' AND id LIKE 'comment-refresh:20261104:backup:%') AND ${guard}`,at,at,COMMENT_REFRESH_ID,activityId),
  query(env,`INSERT OR IGNORE INTO ai_bot_audit(id,actor,action,details,created)
   SELECT ?,'owner-request:20261104','comment_refresh_replaced',json_object('first_activity_id',?,'deleted_comments',changes()),? WHERE ${guard}`,COMMENT_REFRESH_ID+':replaced',activityId,at,activityId)
 ];
}

export async function commentRefreshStatus(env){
 const counts=await one(env,`SELECT count(*) total,count(DISTINCT target_type||':'||target_id) works,
  sum(state='done') done,sum(state IN ('pending','refresh_waiting')) pending,sum(state='failed') failed,sum(state='skipped') skipped
  FROM ai_bot_jobs WHERE id LIKE 'refresh:20261104:%'`);
 const old=await one(env,`SELECT count(*) original_comments,coalesce(sum(c.deleted_at=0),0) old_comments_remaining
  FROM ai_bot_audit a JOIN comments c ON c.id=json_extract(a.details,'$.id') WHERE a.action='comment_refresh_backup' AND a.id LIKE 'comment-refresh:20261104:backup:%'`);
 const errors=await rows(env,"SELECT target_id,state,attempts,error FROM ai_bot_jobs WHERE id LIKE 'refresh:20261104:%' AND error!='' ORDER BY updated DESC LIMIT 10");
 const samples=await rows(env,`SELECT a.target_id,t.title,p.name,a.body FROM ai_bot_activities a JOIN tracks t ON t.id=a.target_id JOIN producers p ON p.user_id=a.bot_id
  WHERE a.job_id LIKE 'refresh:20261104:%' AND t.status='published' ORDER BY a.created DESC,a.id LIMIT 6`);
 return {...counts,...old,errors,samples};
}
