import {MONTHLY_ORIGINAL_LIMITS} from '../shared/site-info.js';
import {effectiveUntilSQL} from './premium-event.js';
import {now,query,fail} from './db.js';
import {readCoverEdit} from './cover-edit.js';
import {isPremium} from './membership.js';
export function uploadMonth(at=now()){
 const d=new Date((at+9*3600)*1000),year=d.getUTCFullYear(),month=d.getUTCMonth();
 return {start:Date.UTC(year,month,1)/1000-9*3600,end:Date.UTC(year,month+1,1)/1000-9*3600,label:`${year}-${String(month+1).padStart(2,'0')}`};
}
const countedTime="CASE WHEN uploaded_at>0 THEN uploaded_at WHEN uploaded_at=0 AND status!='uploading' THEN created ELSE 0 END";
const countSQL=`SELECT count(*) FROM tracks WHERE user_id=? AND kind='original' AND ${countedTime}>=? AND ${countedTime}<?`;
export async function uploadQuota(env,user,at=now()){
 const used=user?Number((await uploadQuotaQuery(env,user,at).first()).used):0;
 return uploadQuotaResult(user,used,at);
}
export function uploadQuotaQuery(env,user,at=now()){
 const month=uploadMonth(at);
 return query(env,`SELECT (${countSQL}) used`,user.id,month.start,month.end);
}
export function uploadQuotaResult(user,used,at=now()){
 const month=uploadMonth(at),limit=Math.max(Number(user?.premium_until)||0,Number(user?.apple_premium_until)||0)>at?MONTHLY_ORIGINAL_LIMITS.premium:MONTHLY_ORIGINAL_LIMITS.free;
 used=Number(used)||0;
 return {limit,used,remaining:Math.max(0,limit-used),month:month.label,resets_at:month.end,covers_unlimited:true};
}
export async function requireUploadQuota(env,user){
 const quota=await uploadQuota(env,user);if(!quota.remaining)fail(429,`이번 달 제작곡 ${quota.limit}곡을 모두 올렸습니다. 다음 달 1일에 다시 올릴 수 있습니다. 커버곡은 제한 없이 올릴 수 있습니다.`);
 return quota;
}
export async function completeUpload(env,track,user){
 const at=now(),month=uploadMonth(at);
 const premiumEdit=readCoverEdit(track.recording_edit)?.premium===true;
 if(premiumEdit&&!isPremium(user))fail(403,'프리미엄 편집을 게시하려면 이용권이 필요합니다.');
 // Claim the last available slot and submit the track in one atomic statement.
 const updated=await query(env,`UPDATE tracks SET status='queued',uploaded_at=? WHERE id=? AND user_id=? AND status='uploading'
  AND recording_edit=? AND (?=0 OR (SELECT ${effectiveUntilSQL} FROM users u WHERE id=?)>?)
  AND (kind='cover' OR (${countSQL}) < (SELECT CASE WHEN ${effectiveUntilSQL}>? THEN ${MONTHLY_ORIGINAL_LIMITS.premium} ELSE ${MONTHLY_ORIGINAL_LIMITS.free} END FROM users u WHERE id=?)) RETURNING id`,at,track.id,user.id,track.recording_edit||'',premiumEdit?1:0,user.id,at,user.id,month.start,month.end,at,user.id).first();
 if(!updated){if(track.kind!=='cover')await requireUploadQuota(env,user);fail(409,'게시 요청이 변경되었습니다. 다시 시도해 주세요.');}
}
