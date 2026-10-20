import {dubbingSettings,dubbingPriceSQL} from './dubbing-settings.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {one,rows,query,run,now,id,json,fail} from './db.js';
import {requireUser} from './auth.js';
import {dubbingTimeline} from '../shared/dubbing.js';
import {pikaAvailable,pikaSubmit,pikaPoll,pikaRequest} from './dubbing-pika.js';
import {dubbingAIAvailable,generateDubbingSoundPlan} from './dubbing-ai.js';
import {dubbingGoldEnabled,dubbingChargeWrites,dubbingPayment,refundDubbingGold,reconcileDubbingGold} from './dubbing-gold.js';

const active=`${dubbingVisibleSQL()} AND p.script_key=j.script_key AND p.first_recorded_at=0 AND EXISTS(SELECT 1 FROM users u WHERE u.id=p.owner_id AND u.provider!='deleted')`;
// Protect against bursts, not a hidden daily quota shared by desktop and mobile.
const soundStartLimit=6,soundStartWindow=60;
export async function dubbingSoundStatus(env,p){
 const priceGold=(await dubbingSettings(env)).soundGold;
 const j=await one(env,'SELECT * FROM dubbing_sound_jobs WHERE project_id=? AND script_key=?',p.id,p.script_key);
 if(!j)return {state:'not_started',available:env.DUBBING_SOUND_ENABLED==='true'&&!!env.TRANSCODER_TOKEN,aiAvailable:pikaAvailable(env)&&!!env.TRANSCODER_TOKEN,progress:0,priceGold,chargeGold:dubbingGoldEnabled(env)?priceGold:0};
 const counts=await one(env,"SELECT COUNT(*) total,SUM(CASE WHEN state='completed' THEN 1 ELSE 0 END) done FROM dubbing_sound_assets WHERE job_id=?",j.id);
 return {id:j.id,state:j.state,mode:j.mode,available:env.DUBBING_SOUND_ENABLED==='true',aiAvailable:pikaAvailable(env),
  progress:j.state==='ready'?100:j.state==='mixing'?90:Math.round(10+70*(counts.done||0)/Math.max(1,counts.total)),
  error:j.error,...await dubbingPayment(env,j.id),audioUrl:j.state==='ready'?`/api/dubbing/projects/${p.id}/background`:null};
}
export async function dubbingSoundProjectRoute(req,env,p,user,action){
 if(!['sound','background'].includes(action))return null;
 if(action==='background'&&['GET','HEAD'].includes(req.method)){
  const j=await one(env,"SELECT output_key FROM dubbing_sound_jobs WHERE project_id=? AND script_key=? AND state='ready'",p.id,p.script_key);
  const object=j?.output_key&&await env.BUCKET.get(j.output_key);if(!object)fail(404,'배경 오디오가 아직 준비되지 않았습니다.');
  return new Response(req.method==='HEAD'?null:object.body,{headers:{'content-type':'audio/mp4','cache-control':'private, no-store','x-content-type-options':'nosniff',...(object.size?{'content-length':String(object.size)}:{})}});
 }
 if(action!=='sound')fail(405,'지원하지 않는 요청입니다.');
 if(req.method==='GET')return json({sound:await dubbingSoundStatus(env,p)});
 requireUser(user);if(p.owner_id!==user.id)fail(403,'작품 작성자만 음향을 만들 수 있습니다.');
 if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
 const body=await req.json();
 if(!/^[0-9a-f-]{36}$/.test(body.requestId||'')||!['ai','basic'].includes(body.mode))fail(400,'음향 요청을 확인해주세요.');
 const existing=await one(env,'SELECT * FROM dubbing_sound_jobs WHERE project_id=? AND script_key=?',p.id,p.script_key);
 if(existing){if(existing.mode!==body.mode)fail(409,'이 대본에 이미 배경 오디오 작업이 있습니다.');return json({sound:await dubbingSoundStatus(env,p)});}
 if(body.revision!==p.revision||p.first_recorded_at)fail(409,'대본이 변경되었거나 녹음이 시작되었습니다.');
 if(env.DUBBING_SOUND_ENABLED!=='true'||!env.TRANSCODER_TOKEN)fail(503,'음향 합성 서버 연결을 기다리고 있습니다.');
 const priceGold=(await dubbingSettings(env)).soundGold;
 const script=JSON.parse(p.script_json);
 if(body.mode==='ai'){
  if(!pikaAvailable(env))fail(503,'Pika 연결과 유료 API 실행 승인이 필요합니다.');
  if(body.acceptedGold!==priceGold||body.acceptedChargeGold!==(dubbingGoldEnabled(env)?priceGold:0))fail(409,'음향 제작 가격이 변경되었습니다. 화면을 새로 열어 차감 금액을 확인해주세요.');
  if(!script.soundCues.length&&!dubbingAIAvailable(env))fail(503,'직접 작성한 대본의 AI 음향 연출 연결을 기다리고 있습니다.');
  script.soundCues.forEach(pikaRequest);
 }
 const timeline=dubbingTimeline(script),jid=body.requestId,at=now();
 const bucket=Math.floor(at/soundStartWindow),rateKey=`dubbing-sound-start:${user.id}:${bucket}`,retryAt=(bucket+1)*soundStartWindow;
 const jobExists='EXISTS(SELECT 1 FROM dubbing_sound_jobs WHERE id=? AND project_id=? AND script_key=?)';
 if(body.mode==='basic')timeline.sounds=[];
 // Admission, counting and payment commit together. Replays and rejected payments
 // never consume another slot, and concurrent requests cannot bypass the limit.
 const writes=[query(env,`INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,created,updated)
 SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND revision=? AND script_key=? AND first_recorded_at=0 AND ${dubbingVisibleSQL('dubbing_projects')}) AND (?='basic' OR ${dubbingPriceSQL}=?)
 AND COALESCE((SELECT count FROM rate_limits WHERE key=?),0)<?
 `,jid,p.id,p.script_key,body.mode,JSON.stringify(timeline),at,at,p.id,p.revision,p.script_key,body.mode,priceGold,rateKey,soundStartLimit),
 query(env,`INSERT INTO rate_limits(key,count,expires) SELECT ?,1,? WHERE changes()>0
 ON CONFLICT(key) DO UPDATE SET count=count+1`,rateKey,retryAt)];
 if(body.mode==='ai')writes.push(...await dubbingChargeWrites(env,{jobId:jid,userId:user.id,projectId:p.id,scriptKey:p.script_key,priceGold}));
 for(const cue of timeline.sounds)writes.push(query(env,`INSERT INTO dubbing_sound_assets(job_id,cue_id,updated) SELECT ?,?,? WHERE ${jobExists} ON CONFLICT DO NOTHING`,jid,cue.id,at,jid,p.id,p.script_key));
 try{await env.DB.batch(writes);}catch(e){
  if(/unique|constraint/i.test(e.message)){
   const replay=await one(env,'SELECT mode FROM dubbing_sound_jobs WHERE project_id=? AND script_key=?',p.id,p.script_key);
   if(replay?.mode===body.mode)return json({sound:await dubbingSoundStatus(env,p)});
   fail(409,'잔액 또는 작업 상태가 변경되었습니다. 다시 확인해주세요.');
  }throw e;
 }
 const saved=await one(env,'SELECT mode FROM dubbing_sound_jobs WHERE project_id=? AND script_key=?',p.id,p.script_key);
 if(!saved){
  const count=await one(env,'SELECT count FROM rate_limits WHERE key=?',rateKey);
  if(count?.count>=soundStartLimit){
   const retryAfterSeconds=Math.max(1,retryAt-now());
   return json({error:`음향 제작 요청이 잠시 몰렸어요. ${retryAfterSeconds}초 후 다시 시도해주세요. 골드는 차감되지 않았습니다.`,retryAfterSeconds},429,{'Retry-After':String(retryAfterSeconds)});
  }
 }
 if(!saved||saved.mode!==body.mode)fail(409,'대본 또는 음향 작업이 변경되었습니다.');
 return json({sound:await dubbingSoundStatus(env,p)},202);
}
async function checkpoint(env,j,fields,args=[]){
 const write=query(env,`UPDATE dubbing_sound_jobs SET ${fields},updated=? WHERE id=? AND lease_token=? AND lease_until>? AND state IN ('queued','planning','generating','mixing') AND EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=dubbing_sound_jobs.project_id AND p.script_key=dubbing_sound_jobs.script_key AND p.first_recorded_at=0 AND ${dubbingVisibleSQL()}) RETURNING id`,...args,now(),j.id,j.lease_token,now());
 const updated=fields.startsWith("state='ready'")?(await env.DB.batch([write,query(env,"UPDATE dubbing_gold_orders SET state='fulfilled',updated=? WHERE job_id=? AND state='charged' AND EXISTS(SELECT 1 FROM dubbing_sound_jobs WHERE id=? AND state='ready')",now(),j.id,j.id)]))[0].results[0]:await write.first();
 if(!updated)fail(409,'음향 작업이 변경되었거나 만료되었습니다.');
 if(/^state='(failed|unknown)'/.test(fields))await refundDubbingGold(env,j.id);
}
async function saveAsset(env,j,a,result){
 const fx=Number(env.DUBBING_USD_KRW_RATE),charge=result.billing.chargeMicroUsd;
 const billing={...result.billing,actualUsd:charge===null?null:charge/1e6,
  estimatedKrw:charge!==null&&Number.isFinite(fx)&&fx>0?Math.round(charge/1e6*fx*100)/100:null,
  fxRate:Number.isFinite(fx)&&fx>0?fx:null,fxAsOf:env.DUBBING_USD_KRW_AS_OF||null};
 const changed=await env.DB.batch([
 query(env,`UPDATE dubbing_sound_assets SET state=?,provider_id=?,output_url=?,usage_json=?,billing_json=?,attempts=0,updated=?
 WHERE job_id=? AND cue_id=? AND EXISTS(SELECT 1 FROM dubbing_sound_jobs WHERE id=? AND lease_token=? AND lease_until>?) RETURNING cue_id`,
 result.status,result.id,result.url,JSON.stringify(result.usage),JSON.stringify(billing),now(),j.id,a.cue_id,j.id,j.lease_token,now()),
 // A cancellation can revoke the content lease while the paid request is in flight.
 // Retain its response in the pre-reserved, anonymous cost ledger without reviving content.
 query(env,`UPDATE dubbing_provider_usage SET provider_id=?,state=?,usage_json=?,billing_json=?,updated=?
 WHERE job_id=? AND cue_id=? AND (state NOT IN ('completed','failed') OR ? IN ('completed','failed'))`,
 result.id,result.status,JSON.stringify(result.usage),JSON.stringify(billing),now(),j.id,a.cue_id,result.status)
 ]);
 if(!changed[0].results.length)fail(409,'음향 작업이 변경되었습니다.');
 if(result.status==='failed')await checkpoint(env,j,"state='failed',error=?,lease_token=NULL,lease_until=0",['Pika 음향 생성에 실패했습니다. 비용과 작업 기록을 확인한 뒤 다시 진행해주세요.']);
}
export async function dubbingSoundInternalRoute(req,env,path){
 if(!path.startsWith('/internal/dubbing/'))return null;
 // media.internalRoute has already authenticated TRANSCODER_TOKEN.
 if(env.DUBBING_ENABLED!=='true'||env.DUBBING_SOUND_ENABLED!=='true')return json({job:null});
 if(path==='/internal/dubbing/claim'&&req.method==='POST'){
  await run(env,"UPDATE dubbing_sound_jobs SET state='failed',error='작업 재시도 한도를 초과했습니다.',lease_token=NULL,lease_until=0 WHERE state IN ('queued','planning','generating','mixing') AND lease_until<? AND attempts>=4",now());
  await reconcileDubbingGold(env);
  const j=await query(env,`UPDATE dubbing_sound_jobs SET lease_token=?,lease_until=?,attempts=attempts+1,updated=? WHERE id=(
   SELECT j.id FROM dubbing_sound_jobs j JOIN dubbing_projects p ON p.id=j.project_id WHERE ${active} AND j.state IN ('queued','planning','generating','mixing') AND j.lease_until<? AND j.next_poll<=? AND j.attempts<4 ORDER BY j.created LIMIT 1)
   RETURNING id,lease_token`,id(),now()+600,now(),now(),now()).first();return json({job:j});
 }
 const m=path.match(/^\/internal\/dubbing\/([\w-]+)\/(step|heartbeat|output|finish|fail)$/);if(!m)fail(404,'음향 작업 경로가 없습니다.');
 const j=await one(env,`SELECT j.*,p.owner_id,p.script_json,p.options_json FROM dubbing_sound_jobs j JOIN dubbing_projects p ON p.id=j.project_id
 WHERE j.id=? AND j.lease_token=? AND j.lease_until>? AND ${active}`,m[1],req.headers.get('x-job-token')||'',now());
 if(!j)fail(409,'음향 작업이 변경되었거나 만료되었습니다.');
 const action=m[2];
 if(action==='heartbeat'&&req.method==='POST'){await checkpoint(env,j,'lease_until=?',[now()+600]);return json({ok:true});}
 if(action==='fail'&&req.method==='POST'){await checkpoint(env,j,"state='failed',error=?,lease_until=0,lease_token=NULL",['생성 파일 검증 또는 합성에 실패했습니다. 원본 작업은 보존되어 있습니다.']);return json({ok:true});}
 if(action==='step'&&req.method==='POST'){
  await checkpoint(env,j,'lease_until=?',[now()+600]);
  if(j.next_poll>now())return json({state:j.state,waitSeconds:j.next_poll-now()});
  let timeline=JSON.parse(j.timeline_json);
  if(j.state==='planning'){
   await checkpoint(env,j,"state='unknown',error=?,lease_token=NULL,lease_until=0",['음향 연출 요청 결과를 확인해야 합니다. 자동 재요청하지 않았습니다.']);return json({state:'unknown'});
  }
  if(j.state==='queued'&&j.mode==='ai'&&!timeline.sounds.length){
   await checkpoint(env,j,"state='planning'");
   const gid=j.id;
   await run(env,"INSERT INTO dubbing_generations(id,user_id,input_hash,state,created,updated) VALUES(?,?,?,'running',?,?)",gid,j.owner_id,'sound-plan:'+j.script_key,now(),now());
   try{
    const plan=await generateDubbingSoundPlan(env,JSON.parse(j.script_json),JSON.parse(j.options_json));timeline=dubbingTimeline(plan.script);
    await run(env,"UPDATE dubbing_generations SET state='sound_ready',usage_json=?,provider_id=?,updated=? WHERE id=?",JSON.stringify(plan.usage),plan.providerRequestId,now(),gid);
    const writes=[query(env,"UPDATE dubbing_sound_jobs SET timeline_json=?,state='generating',updated=? WHERE id=? AND lease_token=? AND lease_until>?",JSON.stringify(timeline),now(),j.id,j.lease_token,now())];
    for(const c of timeline.sounds)writes.push(query(env,"INSERT INTO dubbing_sound_assets(job_id,cue_id,updated) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM dubbing_sound_jobs WHERE id=? AND lease_token=? AND lease_until>?)",j.id,c.id,now(),j.id,j.lease_token,now()));
    await env.DB.batch(writes);
   }catch(e){
    await run(env,"UPDATE dubbing_generations SET state='unknown',usage_json=?,provider_id=?,updated=? WHERE id=?",JSON.stringify(e.usage||{}),e.providerRequestId||'',now(),gid);
    await checkpoint(env,j,"state='unknown',error=?,lease_token=NULL,lease_until=0",['음향 연출 결과를 확인하지 못했습니다. 자동 재요청하지 않았습니다.']);return json({state:'unknown'});
   }
  }
  const assets=await rows(env,'SELECT * FROM dubbing_sound_assets WHERE job_id=? ORDER BY cue_id',j.id);
  const a=assets.find(a=>a.state!=='completed');
  if(!a){
   await checkpoint(env,j,"state='mixing'");
   return json({state:'mixing',timeline,assets:assets.map(a=>({cueId:a.cue_id,url:a.output_url}))});
  }
  if(a.state==='submitting'||a.state==='failed'){
   await checkpoint(env,j,"state='unknown',error=?,lease_token=NULL,lease_until=0",['음향 생성 요청 결과 확인이 필요합니다. 중복 결제를 막기 위해 자동 재요청하지 않습니다.']);return json({state:'unknown'});
  }
  await checkpoint(env,j,"state='generating'");
  if(a.state==='pending'){
   if(!pikaAvailable(env))fail(503,'유료 음향 API 실행이 비활성화되어 있습니다.');
   const reservation=await env.DB.batch([
    query(env,"UPDATE dubbing_sound_assets SET state='submitting',updated=? WHERE job_id=? AND cue_id=? AND state='pending' RETURNING cue_id",now(),j.id,a.cue_id),
    query(env,`INSERT OR IGNORE INTO dubbing_provider_usage(job_id,cue_id,state,created,updated) SELECT ?,?,'submitting',?,? WHERE EXISTS(SELECT 1 FROM dubbing_sound_assets WHERE job_id=? AND cue_id=? AND state='submitting')`,j.id,a.cue_id,j.created,now(),j.id,a.cue_id)
   ]);
   if(!reservation[0].results.length)return json({state:'generating',waitSeconds:2});
   try{await saveAsset(env,j,a,await pikaSubmit(env,timeline.sounds.find(c=>c.id===a.cue_id),`${j.id}:${a.cue_id}`));}
   catch{await checkpoint(env,j,"state='unknown',error=?,lease_token=NULL,lease_until=0",['Pika 요청 응답 확인이 필요합니다. 자동 재요청하지 않았습니다.']);return json({state:'unknown'});}
  }else{
   try{await saveAsset(env,j,a,await pikaPoll(env,a.provider_id));}
   catch(e){
    if(e.status===409)throw e;
    await run(env,'UPDATE dubbing_sound_assets SET attempts=attempts+1 WHERE job_id=? AND cue_id=?',j.id,a.cue_id);
    if(a.attempts>=4){await checkpoint(env,j,"state='failed',error=?,lease_token=NULL,lease_until=0",['음향 상태 조회가 반복해서 실패했습니다. 기존 Pika 작업 ID를 보존했습니다.']);return json({state:'failed'});}
   }
  }
  const current=await one(env,'SELECT state FROM dubbing_sound_jobs WHERE id=?',j.id);
  if(current.state==='failed')return json({state:'failed'});
  await checkpoint(env,j,'next_poll=?',[now()+10]);return json({state:'generating',waitSeconds:10});
 }
 const outputKey=`dubbing/${j.owner_id}/${j.project_id}/audio/${j.id}/${j.lease_token}.m4a`;
 if(action==='output'&&req.method==='PUT'){
  if(j.state!=='mixing'||req.headers.get('content-type')!=='audio/mp4')fail(400,'합성 파일 형식이 올바르지 않습니다.');
  const length=Number(req.headers.get('content-length'));if(!Number.isSafeInteger(length)||length<24||length>12*1024*1024)fail(413,'합성 파일 크기를 확인해주세요.');
  const data=await req.arrayBuffer();if(data.byteLength!==length||new TextDecoder().decode(data.slice(4,8))!=='ftyp')fail(400,'오디오 컨테이너를 확인해주세요.');
  await env.BUCKET.put(outputKey,data,{httpMetadata:{contentType:'audio/mp4',cacheControl:'private, no-store'}});
  await checkpoint(env,j,'output_key=?',[outputKey]);return json({ok:true});
 }
 if(action==='finish'&&req.method==='POST'){
  if(j.state!=='mixing'||j.output_key!==outputKey||!await env.BUCKET.head(outputKey))fail(409,'합성 파일 저장이 완료되지 않았습니다.');
  const meta=await req.json(),timeline=JSON.parse(j.timeline_json);
  if(!Number.isFinite(meta.duration)||Math.abs(meta.duration-timeline.duration)>.1||meta.sampleRate!==48000||!Number.isFinite(meta.peakDb)||meta.peakDb>-1)fail(400,'합성 오디오 검증에 실패했습니다.');
  await checkpoint(env,j,"state='ready',output_meta=?,lease_until=0,lease_token=NULL",[JSON.stringify({duration:meta.duration,sampleRate:48000,peakDb:meta.peakDb})]);return json({ok:true});
 }
 fail(405,'지원하지 않는 요청입니다.');
}
