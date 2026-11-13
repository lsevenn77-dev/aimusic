import {fail, json, now, one, rate, run} from './db.js';
import {hash} from './auth.js';
import {dubbingRecordingStatus} from './dubbing-recording.js';

// Existing finals have no historic ledger. A newly finalized edition has a known zero baseline.
export const dubbingPlayCountSQL=(alias='p')=>`(SELECT CASE
 WHEN COUNT(*)>0 THEN COUNT(*)
 WHEN EXISTS(SELECT 1 FROM dubbing_final_jobs fj WHERE fj.project_id=${alias}.id AND fj.script_key=${alias}.script_key
  AND fj.state='ready' AND json_valid(fj.output_meta) AND json_extract(fj.output_meta,'$.playTracking')=1) THEN 0
 ELSE NULL END FROM dubbing_plays dp WHERE dp.project_id=${alias}.id)`;


export async function recordDubbingPlay(req,env,project,user){
 if(req.method!=='POST')fail(405,'재생 요청을 확인해주세요.');
 if(project.visibility!=='public'||project.state!=='complete')fail(404,'공개된 완성본을 찾을 수 없습니다.');
 const {requestId}=await req.json();
 if(typeof requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))fail(400,'재생 식별자를 확인해주세요.');
 const recording=await dubbingRecordingStatus(env,project,user);
 if(!recording.final?.audioUrl)fail(404,'완성 음원이 준비되지 않았습니다.');
 const exists=await one(env,'SELECT 1 present FROM dubbing_plays WHERE project_id=? AND request_id=?',project.id,requestId);
 if(!exists){
  const listener=user?.id||await hash(req.headers.get('cf-connecting-ip')||'anonymous');
  await rate(env,'dubbing-play:'+listener,60,60);
  await run(env,'INSERT INTO dubbing_plays(project_id,request_id,started) VALUES(?,?,?) ON CONFLICT DO NOTHING',project.id,requestId,now());
 }
 return json({recorded:true});
}
