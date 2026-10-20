import {one,rows,query,now,id,fail,str,json} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {dubbingSettings} from './dubbing-settings.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {reconcileDubbingGold} from './dubbing-gold.js';
export async function dubbingAdminRoute(req,env,path,user){
 if(!path.startsWith('/api/admin/dubbing'))return null;
 requireUser(user);if(!isAdmin(env,user))fail(403,'관리자만 확인할 수 있습니다.');
 if(path==='/api/admin/dubbing'&&req.method==='GET'){
  const n=Number(new URL(req.url).searchParams.get('days')||30),days=[7,30,90].includes(n)?n:30,cutoff=now()-days*86400;
  const [summary,generations,assets,gold,jobs,payments,settings]=await Promise.all([
   one(env,`SELECT (SELECT COUNT(*) FROM dubbing_projects) projects,(SELECT COUNT(*) FROM dubbing_recordings WHERE state='submitted') submitted_roles,
    (SELECT COUNT(*) FROM dubbing_projects WHERE state='complete') completed,(SELECT COUNT(*) FROM track_reports WHERE dubbing_id IS NOT NULL AND status IN ('pending','appealed')) open_reports,
    (SELECT COUNT(*) FROM dubbing_script_rewards WHERE completed_at>=?) ad_rewards`,cutoff),
   rows(env,`SELECT CASE WHEN input_hash LIKE 'sound-plan:%' THEN 'sound_plan' ELSE 'script' END kind,state,COUNT(*) count,
    SUM(COALESCE(json_extract(usage_json,'$.inputTokens'),0)) input_tokens,SUM(COALESCE(json_extract(usage_json,'$.outputTokens'),0)) output_tokens FROM dubbing_generations WHERE created>=? GROUP BY kind,state`,cutoff),
   one(env,`SELECT COUNT(DISTINCT a.provider_id) provider_jobs,COUNT(CASE WHEN a.state='submitting' AND a.provider_id IS NULL THEN 1 END) unconfirmed_requests,
    COALESCE(SUM(CASE WHEN json_extract(a.billing_json,'$.state')='settled' THEN json_extract(a.billing_json,'$.chargeMicroUsd') ELSE 0 END),0) settled_micro_usd,
    COALESCE(SUM(CASE WHEN json_extract(a.billing_json,'$.state')='settled' THEN json_extract(a.billing_json,'$.estimatedKrw') ELSE 0 END),0) estimated_krw,
    COUNT(CASE WHEN a.state!='pending' AND (json_extract(a.billing_json,'$.state') IS NOT 'settled' OR json_extract(a.billing_json,'$.chargeMicroUsd') IS NULL) THEN 1 END) unsettled_costs,
    COUNT(CASE WHEN json_extract(a.billing_json,'$.state')='settled' AND json_extract(a.billing_json,'$.estimatedKrw') IS NULL THEN 1 END) missing_fx
    FROM dubbing_provider_usage a WHERE a.created>=?`,cutoff),
   rows(env,`SELECT state,COUNT(*) count,SUM(gold) gold,COALESCE(SUM((SELECT SUM(refunded_gold) FROM dubbing_gold_lots l WHERE l.job_id=o.job_id)),0) refunded_gold FROM dubbing_gold_orders o WHERE created>=? GROUP BY state`,cutoff),
   rows(env,`SELECT j.id,j.project_id,p.title,'sound' kind,j.state,j.mode,j.error,j.attempts,j.updated updated,0 can_retry FROM dubbing_sound_jobs j JOIN dubbing_projects p ON p.id=j.project_id WHERE j.state IN ('failed','unknown')
    UNION ALL SELECT j.id,j.project_id,p.title,'final' kind,j.state,'mix' mode,j.error,j.attempts,j.updated updated,CASE WHEN ${dubbingVisibleSQL()} THEN 1 ELSE 0 END can_retry FROM dubbing_final_jobs j JOIN dubbing_projects p ON p.id=j.project_id WHERE j.state='failed' ORDER BY updated DESC LIMIT 100`),
   rows(env,`SELECT o.job_id,o.project_id,COALESCE(p.title,'삭제된 작품') title,o.gold,o.state,o.reason,o.created,
    COALESCE((SELECT SUM(refunded_gold) FROM dubbing_gold_lots l WHERE l.job_id=o.job_id),0) refunded_gold FROM dubbing_gold_orders o LEFT JOIN dubbing_projects p ON p.id=o.project_id ORDER BY o.created DESC LIMIT 100`),dubbingSettings(env)
  ]);
  return json({days,summary,generations,pika:assets,gold,jobs,payments,settings,flags:{enabled:env.DUBBING_ENABLED==='true',charging:env.DUBBING_GOLD_ENABLED==='true',paidAPI:env.DUBBING_PAID_API_ENABLED==='true'},costNote:'Pika 정산 완료 청구액 기준입니다. 원화는 생성 당시 환율 설정이 있는 건의 추정치이며 OpenAI 비용은 포함하지 않습니다.'});
 }
 if(path==='/api/admin/dubbing/settings'&&req.method==='PUT'){
  const body=await req.json();if(!Number.isSafeInteger(body.soundGold)||body.soundGold<1||body.soundGold>10000||!Number.isSafeInteger(body.version)||body.version<0)fail(400,'가격은 1~10,000G 정수로 입력해주세요.');
  const at=now(),result=await env.DB.batch([
   query(env,"INSERT INTO admin_audit(id,admin_id,action,target,created) SELECT ?,?,'dubbing-price',?,? WHERE COALESCE((SELECT version FROM dubbing_settings WHERE key='default'),0)=?",id(),user.id,JSON.stringify({soundGold:body.soundGold,fromVersion:body.version}),at,body.version),
   query(env,`INSERT INTO dubbing_settings(key,sound_gold,version,updated,updated_by) SELECT 'default',?,1,?,? WHERE COALESCE((SELECT version FROM dubbing_settings WHERE key='default'),0)=?
    ON CONFLICT(key) DO UPDATE SET sound_gold=excluded.sound_gold,version=dubbing_settings.version+1,updated=excluded.updated,updated_by=excluded.updated_by WHERE dubbing_settings.version=? RETURNING key`,body.soundGold,at,user.id,body.version,body.version)
  ]);if(!result[1].results.length)fail(409,'가격 설정이 변경됐습니다. 새로고침 후 확인해주세요.');return json({settings:await dubbingSettings(env)});
 }
 if(path==='/api/admin/dubbing/reconcile'&&req.method==='POST'){await reconcileDubbingGold(env);return json({ok:true});}
 const match=path.match(/^\/api\/admin\/dubbing\/final\/([\w-]+)\/retry$/);
 if(match&&req.method==='POST'){
  const body=await req.json(),note=str(body.note,500),at=now();
  const allowed=`id=? AND state='failed' AND updated=? AND EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=dubbing_final_jobs.project_id AND p.script_key=dubbing_final_jobs.script_key AND ${dubbingVisibleSQL()}
   AND (SELECT COUNT(*) FROM dubbing_recordings r WHERE r.project_id=p.id AND r.state='submitted')=p.role_count)`;
  const result=await env.DB.batch([
   query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created) SELECT ?,?,'dubbing-final-retry',?,? WHERE EXISTS(SELECT 1 FROM dubbing_final_jobs WHERE ${allowed})`,id(),user.id,JSON.stringify({job:match[1],note}),at,match[1],body.updated),
   query(env,`UPDATE dubbing_final_jobs SET state='queued',attempts=0,lease_token=NULL,lease_until=0,error='',updated=? WHERE ${allowed} RETURNING id`,at,match[1],body.updated)
  ]);if(!result[1].results.length)fail(409,'작업 상태나 참여자가 변경됐습니다.');return json({ok:true});
 }
 fail(404,'관리자 더빙 경로를 찾을 수 없습니다.');
}
