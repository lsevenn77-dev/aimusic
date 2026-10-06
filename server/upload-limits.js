import {now,one,query,fail} from './db.js';
export function uploadMonth(at=now()){
 const d=new Date((at+9*3600)*1000),year=d.getUTCFullYear(),month=d.getUTCMonth();
 return {start:Date.UTC(year,month,1)/1000-9*3600,end:Date.UTC(year,month+1,1)/1000-9*3600,label:`${year}-${String(month+1).padStart(2,'0')}`};
}
const countedTime="CASE WHEN uploaded_at>0 THEN uploaded_at WHEN uploaded_at=0 AND status!='uploading' THEN created ELSE 0 END";
const countSQL=`SELECT count(*) FROM tracks WHERE user_id=? AND kind='original' AND ${countedTime}>=? AND ${countedTime}<?`;
export async function uploadQuota(env,user,at=now()){
 const month=uploadMonth(at),limit=Number(user?.premium_until)>at?20:5;
 const used=user?Number((await one(env,`SELECT (${countSQL}) used`,user.id,month.start,month.end)).used):0;
 return {limit,used,remaining:Math.max(0,limit-used),month:month.label,resets_at:month.end,covers_unlimited:true};
}
export async function requireUploadQuota(env,user){
 const quota=await uploadQuota(env,user);if(!quota.remaining)fail(429,`이번 달 제작곡 ${quota.limit}곡을 모두 올렸어요. 다음 달 1일에 다시 올릴 수 있어요. 커버곡은 제한 없이 올릴 수 있어요.`);
 return quota;
}
export async function completeUpload(env,track,user){
 const at=now(),month=uploadMonth(at);
 // Claim the last available slot and submit the track in one atomic statement.
 const updated=await query(env,`UPDATE tracks SET status='queued',uploaded_at=? WHERE id=? AND user_id=? AND status='uploading' AND (kind='cover' OR (${countSQL}) < (SELECT CASE WHEN MAX(premium_until,apple_premium_until)>? THEN 20 ELSE 5 END FROM users WHERE id=?)) RETURNING id`,at,track.id,user.id,user.id,month.start,month.end,at,user.id).first();
 if(!updated){await requireUploadQuota(env,user);fail(409,'이미 제출한 업로드입니다.');}
}
