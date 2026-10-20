import {one,rows,query,run,now,json} from './db.js';
import {retrieveDubbingScript} from './dubbing-ai.js';
import {dubbingTimeline} from '../shared/dubbing.js';

// Only GET the existing provider response. Recovery must never submit another job.
export async function reconcileDubbingGeneration(env,g){
 if(g.state==='running'&&g.provider_id){
  // CAS limits browser/worker polling without a new table or a provider submission.
  const locked=await query(env,"UPDATE dubbing_generations SET updated=? WHERE id=? AND state='running' AND updated<=? RETURNING id",now(),g.id,now()-4).first();
  if(locked){
   try{
    const options=JSON.parse(g.result_json).options;
    if(!options)throw new Error('Missing saved settings');
    const result=await retrieveDubbingScript(env,g.provider_id,options);
    if(result.state!=='running')await run(env,"UPDATE dubbing_generations SET state='ready',result_json=?,usage_json=?,error='',updated=? WHERE id=? AND state='running'",
     JSON.stringify({script:result.script,model:result.model,options}),JSON.stringify(result.usage),now(),g.id);
   }catch(e){
    if(e.status)await run(env,"UPDATE dubbing_generations SET state='failed',error=?,usage_json=?,updated=? WHERE id=? AND state='running'",
     e.message,JSON.stringify(e.usage||{}),now(),g.id);
    // Transient GET failures retain the provider ID; the next poll can recover.
   }
  }
 }else if(g.state==='running'&&!g.provider_id&&g.updated<now()-180){
  await run(env,"UPDATE dubbing_generations SET state='unknown',updated=? WHERE id=? AND state='running' AND provider_id='' AND updated=?",now(),g.id,g.updated);
 }
 g=await one(env,'SELECT * FROM dubbing_generations WHERE id=?',g.id);
 if(g?.state==='unknown'&&!g.provider_id){
  // A lost submission acknowledgement cannot be fetched. Keep the unknown cost
  // outcome for audit but release the user's free script turn, not a Gold refund.
  await run(env,`UPDATE dubbing_generations SET result_json=json_set(COALESCE(result_json,'{}'),'$.quotaRestored',json('true')),
   error='이전 요청의 조회 번호를 받지 못해 대본을 복구할 수 없어요. 무료 작성 횟수는 복원됐어요. 새 대본은 직접 작성 버튼을 눌러 시작해주세요.'
   WHERE id=? AND state='unknown' AND provider_id=''`,g.id);
  g=await one(env,'SELECT * FROM dubbing_generations WHERE id=?',g.id);
 }
 return g;
}
export async function generationResult(env,g){
 g=await reconcileDubbingGeneration(env,g);
 if(!g)return json({error:'생성 요청을 찾을 수 없습니다.'},404);
 const data=JSON.parse(g.result_json||'{}'),terminal=['failed','unknown'].includes(g.state);
 if(g.state==='ready'&&!data.options&&data.script)data.options={
  genres:data.script.genres,roleCount:data.script.roles.length,
  minutes:Math.max(.5,Math.min(5,Math.round(dubbingTimeline(data.script).duration/30)/2)),
  mood:'랜덤',ending:'랜덤',idea:''
 };
 return json({id:g.id,state:g.state,...(g.state==='ready'?{...data,usage:JSON.parse(g.usage_json)}:{}),
  recoverable:g.state==='running'||g.state==='ready',quotaRestored:g.state==='failed'||!!data.quotaRestored,
  message:g.state==='running'?'대본을 만들고 있어요. 완료되면 자동으로 열려요. 이 화면을 나가도 이전 결과 확인으로 이어볼 수 있어요.':terminal?g.error||'생성 결과를 확인할 수 없어요.':g.error||''
 },g.state==='running'?202:200);
}
// Called only after media.internalRoute authenticates TRANSCODER_TOKEN.
export async function dubbingGenerationInternalRoute(req,env,path){
 if(path!=='/internal/dubbing-generations/reconcile')return null;
 if(req.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405);
 if(env.DUBBING_ENABLED!=='true')return json({checked:0});
 const pending=await rows(env,`SELECT g.* FROM dubbing_generations g JOIN users u ON u.id=g.user_id
  WHERE g.state='running' AND g.input_hash NOT LIKE 'sound-plan:%' AND u.provider!='deleted'
  AND g.updated<=? ORDER BY g.updated LIMIT 3`,now()-4);
 await Promise.all(pending.map(g=>reconcileDubbingGeneration(env,g)));
 return json({checked:pending.length});
}
