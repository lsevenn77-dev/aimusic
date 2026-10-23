import {one,rows,query,run,now,id,str,fail,json,rate} from './db.js';
import {isAdmin,requireUser,hash} from './auth.js';
import {readImage} from './images.js';
import {BOT_DEFAULTS,BOT_CATEGORIES,BOT_STYLES,botConfig} from '../shared/ai-bots.js';
import {giftDay} from '../shared/gifts.js';

const base='/api/admin/ai-bots';
const audit=(env,user,action,data)=>query(env,'INSERT INTO ai_bot_audit VALUES(?,?,?,?,?)',id(),user.id,action,JSON.stringify(data),now());
const uidSQL="'ai_'||printf('%06d',COALESCE((SELECT max(number) FROM ai_bots),0)+1)";
export const botBadgeType='ai_bot';
export async function botSettings(env){const r=await one(env,'SELECT * FROM ai_bot_settings WHERE id=1');return {...r,config:botConfig(JSON.parse(r.json))};}
const paging=url=>[Math.max(1,Math.min(100,Number(url.searchParams.get('limit'))||50)),Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0))];
const assetKey=sha=>'images/ai-bot-staging/'+sha;
const sourceKey=value=>str(value,160);
const validName=value=>{const name=str(value,40);if(name.length<2)fail(400,'닉네임은 두 글자 이상 입력해주세요.');return name;};

export async function aiBotsRoute(req,env,path,user){
 if(!path.startsWith(base))return null;
 requireUser(user);if(!isAdmin(env,user))fail(403,'운영자만 사용할 수 있어요.');
 const method=req.method,url=new URL(req.url),tail=path.slice(base.length);
 if(method!=='GET')await rate(env,'ai-bots-admin:'+user.id,2000,3600);
 if(tail==='/settings'){
  if(method==='GET'){const s=await botSettings(env);return json({config:s.config,revision:s.revision});}
  if(method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
  const b=await req.json();let config;try{config=botConfig(b.config);}catch(e){fail(400,e.message);}
  const at=now(),s=await botSettings(env);if(b.revision!==s.revision)fail(409,'설정이 변경됐어요. 새로고침해주세요.');
  const key=id();await env.DB.batch([
   query(env,'UPDATE ai_bot_settings SET json=?,revision=revision+1,updated=? WHERE id=1 AND revision=?',JSON.stringify(config),at,b.revision),
   query(env,'INSERT INTO ai_bot_audit SELECT ?,?,?,?,? WHERE changes()>0',key,user.id,'settings',JSON.stringify(config),at)
  ]);if(!await one(env,'SELECT 1 FROM ai_bot_audit WHERE id=?',key))fail(409,'설정이 변경됐어요.');
  return json({config,revision:s.revision+1});
 }
 if(tail==='/stop'&&method==='POST'){
  await env.DB.batch([query(env,"UPDATE ai_bot_settings SET json=json_set(json,'$.enabled',json('false')),revision=revision+1,updated=? WHERE id=1",now()),audit(env,user,'emergency_stop',{})]);return json({stopped:true});
 }
 if(tail==='/dashboard'&&method==='GET'){
  const day=giftDay(now()),s=await botSettings(env);
  const counts=await one(env,`SELECT (SELECT count(*) FROM ai_bots) registered,(SELECT count(*) FROM ai_bots WHERE active=1) active,
   (SELECT count(*) FROM ai_bot_activities WHERE day=? AND action='comment') comments,
   (SELECT COALESCE(sum(quantity),0) FROM ai_bot_activities WHERE day=? AND action='gift') stars,
   (SELECT count(*) FROM ai_bot_jobs WHERE state='pending') pending,(SELECT count(*) FROM ai_bot_jobs WHERE state='failed') failed`,day,day);
  return json({...counts,enabled:s.config.enabled,day});
 }
 if(tail==='/accounts'&&method==='GET'){
  const q='%'+str(url.searchParams.get('q')||'',80,false)+'%',page=paging(url);
  return json({accounts:await rows(env,`SELECT b.*,p.id profile_id,p.name,p.image_version FROM ai_bots b JOIN producers p ON p.user_id=b.user_id WHERE (p.name LIKE ? OR b.user_id LIKE ?) ORDER BY b.number LIMIT ? OFFSET ?`,q,q,...page),total:(await one(env,'SELECT count(*) n FROM ai_bots')).n});
 }
 if(tail==='/accounts/bulk'&&method==='PATCH'){
  const b=await req.json();if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>90||b.ids.some(v=>typeof v!=='string')||typeof b.active!=='boolean')fail(400,'최대 90개 계정을 선택해주세요.');
  await env.DB.batch([query(env,`UPDATE ai_bots SET active=?,updated=? WHERE user_id IN (${b.ids.map(()=>'?')})`,b.active?1:0,now(),...b.ids),audit(env,user,'accounts_bulk',{ids:b.ids,active:b.active})]);return json({ok:true});
 }
 const account=tail.match(/^\/accounts\/(ai_\d+)$/);
 if(account&&method==='PATCH'){
  const b=await req.json(),bot=await one(env,'SELECT * FROM ai_bots WHERE user_id=?',account[1]);if(!bot)fail(404,'계정을 찾을 수 없어요.');
  const name=validName(b.name),style=b.style,emoji=str(b.emoji??'',12,false),limit=b.daily_limit;
  if(!BOT_STYLES.includes(style)||!Number.isInteger(limit)||limit<0||limit>100||typeof b.active!=='boolean')fail(400,'계정 설정을 확인해주세요.');
  await env.DB.batch([query(env,'UPDATE ai_bots SET style=?,emoji=?,daily_limit=?,active=?,updated=? WHERE user_id=?',style,emoji,limit,b.active?1:0,now(),account[1]),query(env,'UPDATE users SET name=? WHERE id=?',name,account[1]),query(env,'UPDATE producers SET name=? WHERE user_id=?',name,account[1]),audit(env,user,'account_edit',{id:account[1],...b})]);return json({ok:true});
 }
 if(tail==='/assets'&&method==='POST'){
  if(!env.BUCKET)fail(503,'이미지 저장소가 연결되지 않았어요.');
  const img=await readImage(req);if(img.type!=='image/webp')fail(400,'WebP로 최적화한 이미지만 등록해주세요.');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',img.data)),n=>n.toString(16).padStart(2,'0')).join('');
  const existing=await one(env,'SELECT user_id FROM ai_bots WHERE image_sha=?',sha);if(existing)return json({sha,duplicate:true,user_id:existing.user_id});
  await env.BUCKET.put(assetKey(sha),img.data,{httpMetadata:{contentType:img.type}});
  await env.DB.batch([query(env,'INSERT OR IGNORE INTO ai_bot_assets VALUES(?,?,?,?)',sha,img.data.length,user.id,now()),audit(env,user,'asset_staged',{sha,bytes:img.data.length})]);
  return json({sha,duplicate:false});
 }
 const image=tail.match(/^\/accounts\/(ai_\d+)\/image$/);
 if(image&&method==='PUT'){
  const b=await req.json(),sha=str(b.sha,64),bot=await one(env,'SELECT * FROM ai_bots WHERE user_id=?',image[1]);if(!bot)fail(404,'계정을 찾을 수 없어요.');
  const asset=await one(env,'SELECT * FROM ai_bot_assets WHERE sha=?',sha);if(!asset)fail(400,'이미지를 먼저 등록해주세요.');
  if(await one(env,'SELECT 1 FROM ai_bots WHERE image_sha=? AND user_id!=?',sha,image[1]))fail(409,'다른 AI 계정에서 사용 중인 이미지예요.');
  const object=await env.BUCKET.get(assetKey(sha));if(!object)fail(409,'등록 이미지가 만료됐어요. 다시 선택해주세요.');
  await env.BUCKET.put(`images/producer/${image[1]}/${sha}`,object.body,{httpMetadata:{contentType:'image/webp'}});
  try{await env.DB.batch([query(env,'UPDATE ai_bots SET image_sha=?,updated=? WHERE user_id=?',sha,now(),image[1]),query(env,"UPDATE producers SET image_version=?,image_type='image/webp' WHERE id=?",sha,image[1]),audit(env,user,'account_image',{id:image[1],sha})]);}catch(e){if(/UNIQUE/.test(e.message))fail(409,'다른 AI 계정에서 사용 중인 이미지예요.');throw e;}
  return json({ok:true});
 }
 if(tail==='/import/preview'&&method==='POST'){
  const b=await req.json();if(!Array.isArray(b.items)||b.items.length>100||b.items.some(i=>!i||typeof i!=='object')||b.owned_ai!==true)fail(400,'사용 권한이 있는 AI 이미지인지 확인해주세요. 최대 100개씩 검토할 수 있어요.');
  const seen=new Set(),items=[],hashes=b.items.map(i=>String(i.sha||'')),sources=b.items.map(i=>String(i.source_key||''));
  const assets=new Set((hashes.length?await rows(env,`SELECT sha FROM ai_bot_assets WHERE sha IN (${hashes.map(()=>'?')})`,...hashes):[]).map(a=>a.sha));
  const existing=new Set();
  // Stay below D1's statement binding limit; the two columns are fetched separately.
  for(const [col,values] of [['image_sha',hashes],['source_key',sources]])if(values.length)for(const row of await rows(env,`SELECT image_sha,source_key FROM ai_bots WHERE ${col} IN (${values.map(()=>'?')})`,...values)){existing.add(row.image_sha);existing.add(row.source_key);}
  for(const raw of b.items){try{
   const item={name:validName(raw.name),source_key:sourceKey(raw.source_key),sha:str(raw.sha,64)};
   if(!/^[a-f0-9]{64}$/.test(item.sha))throw new Error('이미지 파일을 선택해주세요.');
   const duplicate=seen.has(item.sha)||seen.has(item.source_key)||existing.has(item.sha)||existing.has(item.source_key);
   seen.add(item.sha);seen.add(item.source_key);
   if(!assets.has(item.sha))throw new Error('이미지를 먼저 업로드해주세요.');
   items.push({...item,status:duplicate?'duplicate':'ready'});
  }catch(e){items.push({name:String(raw.name||''),status:'failed',error:e.message});}}
  return json({items,preview_token:await importToken(env,user,b.items)});
 }
 if(tail==='/import/execute'&&method==='POST'){
  // Keep each mutation request small enough for constrained Worker/D1 plans.
  const b=await req.json();if(!Array.isArray(b.items)||!b.items.length||b.items.length>100||b.items.some(i=>!i||typeof i!=='object')||b.owned_ai!==true||b.preview_token!==await importToken(env,user,b.items))fail(409,'먼저 동일한 항목을 미리보기에서 확인해주세요.');
  if(b.items.length>5)fail(400,'등록 실행은 한 번에 5개씩 요청해주세요.');
  const results=[];
  for(const item of b.items){try{results.push(await provisionBot(env,user,item));}catch(e){await audit(env,user,'import_failed',{source_key:String(item.source_key||'').slice(0,160),error:String(e.message).slice(0,200)}).run();results.push({source_key:item.source_key,status:'failed',error:e.status?e.message:'등록에 실패했어요. 해당 항목을 다시 실행할 수 있어요.'});}}
  return json({results});
 }
 if(tail==='/templates'){
  if(method==='GET')return json({templates:await rows(env,'SELECT * FROM ai_bot_templates ORDER BY category,id LIMIT 1000')});
  if(method==='POST'){
   const b=await req.json(),tid=id(),body=str(b.body,300),category=b.category,style=b.style;
   if(!BOT_CATEGORIES.includes(category)||!BOT_STYLES.includes(style))fail(400,'분류와 말투를 확인해주세요.');
   await env.DB.batch([query(env,'INSERT INTO ai_bot_templates VALUES(?,?,?,?,1,?)',tid,category,style,body,now()),audit(env,user,'template_add',{id:tid,category,style,body})]);return json({id:tid},201);
  }
 }
 const template=tail.match(/^\/templates\/([\w-]+)$/);
 if(template&&['PATCH','DELETE'].includes(method)){
  const b=method==='DELETE'?{}:await req.json();
  if(method==='PATCH'&&(!BOT_CATEGORIES.includes(b.category)||!BOT_STYLES.includes(b.style)||typeof b.active!=='boolean'))fail(400,'템플릿 설정을 확인해주세요.');
  await env.DB.batch([method==='DELETE'?query(env,'DELETE FROM ai_bot_templates WHERE id=?',template[1]):query(env,'UPDATE ai_bot_templates SET category=?,style=?,body=?,active=?,updated=? WHERE id=?',b.category,b.style,str(b.body,300),b.active?1:0,now(),template[1]),audit(env,user,'template_'+method.toLowerCase(),{id:template[1],...b})]);return json({ok:true});
 }
 if(tail==='/activities'&&method==='GET')return json({activities:await rows(env,`SELECT a.*,p.name FROM ai_bot_activities a LEFT JOIN producers p ON p.user_id=a.bot_id ORDER BY a.created DESC,a.id LIMIT ? OFFSET ?`,...paging(url)),jobs:await rows(env,"SELECT * FROM ai_bot_jobs WHERE state IN ('pending','failed','skipped') ORDER BY updated DESC,id DESC LIMIT 50 OFFSET ?",paging(url)[1]),audit:await rows(env,'SELECT * FROM ai_bot_audit ORDER BY created DESC,id DESC LIMIT 50 OFFSET ?',paging(url)[1])});
 if(tail==='/retry'&&method==='POST'){
  const b=await req.json(),jid=str(b.id,200);await env.DB.batch([query(env,"UPDATE ai_bot_jobs SET state='pending',attempts=0,due=?,updated=? WHERE id=? AND state='failed'",now(),now(),jid),audit(env,user,'job_retry',{id:jid})]);return json({ok:true});
 }
 if(tail==='/run'&&method==='POST'){await audit(env,user,'engine_run',{}).run();return json(await runBotEngine(env));}
 fail(404,'AI 봇 관리 항목을 찾을 수 없어요.');
}

async function importToken(env,user,items){
 // Preview approval is scoped to the exact bytes, item order, operator, and current staging state.
 const hashes=items.slice(0,100).map(i=>String(i.sha||''));
 const assets=hashes.length?await rows(env,`SELECT sha,created,created_by FROM ai_bot_assets WHERE sha IN (${hashes.map(()=>'?')}) ORDER BY sha`,...hashes):[];
 return hash(JSON.stringify({operator:user.id,items,assets}));
}
async function provisionBot(env,user,item){
 const name=validName(item.name),source=sourceKey(item.source_key),sha=str(item.sha,64),asset=await one(env,'SELECT * FROM ai_bot_assets WHERE sha=?',sha);
 if(!asset)fail(400,'이미지를 먼저 등록해주세요.');
 const duplicate=await one(env,'SELECT user_id,source_key,image_sha FROM ai_bots WHERE source_key=? OR image_sha=?',source,sha);if(duplicate){
  // Repair an interrupted R2 copy without making a second identity.
  if(duplicate.source_key===source&&duplicate.image_sha===sha){const staged=await env.BUCKET.get(assetKey(sha));if(staged)await env.BUCKET.put(`images/producer/${duplicate.user_id}/${sha}`,staged.body,{httpMetadata:{contentType:'image/webp'}});}
  return {source_key:source,status:'duplicate',user_id:duplicate.user_id};
 }
 const object=await env.BUCKET.get(assetKey(sha));if(!object)fail(409,'이미지 파일을 다시 등록해주세요.');
 // Sequence allocation, credentials-free identity, profile, metadata and audit are one D1 transaction.
 // The immutable content-addressed object is copied to the final producer path after allocation.
 const token=id();await env.DB.batch([
  query(env,`INSERT INTO users(id,email,name,provider,account_type,created) VALUES(${uidSQL},'bot-'||?||'@service.invalid',?,'ai_service','ai_bot',?)`,token,name,now()),
  query(env,`INSERT INTO ai_bots(user_id,source_key,image_sha,style,emoji,created,updated) SELECT id,?,?,CASE CAST(substr(id,4) AS INTEGER)%3 WHEN 0 THEN 'warm' WHEN 1 THEN 'polite' ELSE 'cheerful' END,CASE CAST(substr(id,4) AS INTEGER)%3 WHEN 0 THEN '✨' WHEN 1 THEN '🌱' ELSE '🎶' END,?,? FROM users WHERE email=?`,source,sha,now(),now(),'bot-'+token+'@service.invalid'),
  query(env,`INSERT INTO producers(id,user_id,name,bio,image_version,image_type,created,nickname_confirmed) SELECT user_id,user_id,?,'공식 AI 응원 계정',?,'image/webp',?,1 FROM ai_bots WHERE source_key=?`,name,sha,now(),source),
  audit(env,user,'account_import',{source_key:source,sha,name,owned_ai:true})
 ]);
 const bot=await one(env,'SELECT user_id FROM ai_bots WHERE source_key=?',source);
 try{await env.BUCKET.put(`images/producer/${bot.user_id}/${sha}`,object.body,{httpMetadata:{contentType:'image/webp'}});}
 catch(e){await env.DB.batch([query(env,'UPDATE ai_bots SET active=0 WHERE user_id=?',bot.user_id),audit(env,user,'image_copy_failed',{id:bot.user_id,sha})]);throw e;}
 return {source_key:source,status:'created',user_id:bot.user_id};
}

export async function officialSupport(env,type,target,owner=false){
 if(!target)return {quantity:0,gifts:[],cash_value:0,excluded_from_rankings:true};
 const where=owner?'g.owner_id=?':'g.target_type=? AND g.target_id=?',args=owner?[target]:[type,target];
 const gifts=await rows(env,`SELECT g.id,g.sender_id,g.quantity,g.created,p.name,p.image_version,p.id profile_id,'ai_bot' account_type FROM ai_support_gifts g JOIN producers p ON p.user_id=g.sender_id WHERE ${owner?'g.owner_id=?':'g.target_type=? AND g.target_id=?'} ORDER BY g.created DESC LIMIT 100`,...(owner?[target]:[type,target]));
 const total=await one(env,`SELECT COALESCE(sum(g.quantity),0) quantity FROM ai_support_gifts g WHERE ${where}`,...args);
 return {quantity:total.quantity,gifts,cash_value:0,excluded_from_rankings:true};
}

// Reuse the existing authenticated transcoder poll even when Sites has no cron.
// Throttle per DB binding/isolate; the durable engine lease still prevents races.
const heartbeatDue=new WeakMap();
export function queueBotHeartbeat(env,ctx,at=now()){
 if(!env.DB||!ctx?.waitUntil||at<(heartbeatDue.get(env.DB)||0))return;
 heartbeatDue.set(env.DB,at+60);
 ctx.waitUntil(runBotEngine(env,at).catch(()=>{console.error('AI support processing pending');}));
}

export async function runBotEngine(env,at=now()){
 const s=await botSettings(env),c=s.config;if(!c.enabled)return {stopped:true,processed:0};
 const token=id(),lease=await one(env,"UPDATE ai_bot_settings SET lease_token=?,lease_until=? WHERE id=1 AND lease_until<=? AND revision=? RETURNING id",token,at+120,at,s.revision);if(!lease)return {busy:true,processed:0};
 let processed=0,failed=0;
 try{
  const batch=Math.max(1,Math.min(15,Math.floor(Number(env.AI_BOTS_BATCH_SIZE)||3)));
  const jobs=await rows(env,`SELECT * FROM ai_bot_jobs WHERE state='pending' AND due<=? ORDER BY ${c.newPriority?`EXISTS(SELECT 1 FROM users newbie WHERE newbie.id=ai_bot_jobs.owner_id AND newbie.created>=${at-604800}) DESC,`:''}due,id LIMIT ?`,at,batch);
  for(const job of jobs){
   try{await processBotJob(env,job,s,token,at);processed++;}
   catch(e){failed++;await run(env,"UPDATE ai_bot_jobs SET attempts=attempts+1,state=CASE WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,due=?,updated=?,error=? WHERE id=? AND state='pending'",at+Math.min(3600,60*2**job.attempts),at,String(e.message).slice(0,300),job.id);}
  }
 }finally{await run(env,"UPDATE ai_bot_settings SET lease_token='',lease_until=0 WHERE id=1 AND lease_token=?",token);}
 return {processed,failed};
}
async function processBotJob(env,j,s,token,at){
 const c=s.config,day=giftDay(at),target=j.target_type==='track'?await one(env,"SELECT t.*,t.user_id owner_id,u.account_type FROM tracks t JOIN users u ON u.id=t.user_id WHERE t.id=? AND t.status='published' AND (t.kind='original' OR t.duet_open=0)",j.target_id):await one(env,"SELECT p.*,u.account_type FROM dubbing_projects p JOIN users u ON u.id=p.owner_id WHERE p.id=? AND p.state='complete' AND p.visibility='public' AND p.deleted_at=0 AND NOT EXISTS(SELECT 1 FROM track_reports r WHERE r.dubbing_id=p.id AND r.status IN ('removed','appealed','upheld'))",j.target_id);
 const skip=reason=>run(env,"UPDATE ai_bot_jobs SET state='skipped',error=?,updated=? WHERE id=? AND state='pending'",reason,at,j.id);
 if(!target||target.account_type!=='human'||target.owner_id!==j.owner_id)return skip('대상이 비공개·삭제되었거나 지원 대상이 아닙니다.');
 const kind=j.category.replace(/^first:/,''),first=j.category.startsWith('first:'),category=first?'first':kind;
 if(!c.kinds.includes(kind)||c.newOnly&&!first||j.action==='comment'&&j.slot>=c.comments||j.action==='gift'&&!c.gifts)return skip('현재 지원 설정에서 제외되었습니다.');
 const column=j.target_type==='track'?'track_id':'dubbing_id';
 const real=(await one(env,`SELECT count(DISTINCT member_id) n FROM (SELECT c.user_id member_id FROM comments c JOIN users u ON u.id=c.user_id WHERE c.${column}=? AND c.deleted_at=0 AND u.account_type='human' AND c.user_id!=? UNION SELECT l.user_id FROM likes l JOIN users u ON u.id=l.user_id WHERE l.${column}=? AND u.account_type='human' AND l.user_id!=?)`,j.target_id,j.owner_id,j.target_id,j.owner_id)).n;
 if(real>=c.humanThreshold)return skip('실제 회원 응원이 충분합니다.');
 if(j.action==='comment'&&Math.random()*100>=c.probability)return skip('작성 확률에 따라 생략되었습니다.');
 const ownerCount=(await one(env,'SELECT count(DISTINCT target_type||target_id) n FROM ai_bot_activities WHERE owner_id=? AND day=?',j.owner_id,day)).n;
 const already=await one(env,'SELECT 1 FROM ai_bot_activities WHERE target_type=? AND target_id=?',j.target_type,j.target_id);
 if(c.creatorDaily===0||ownerCount>=c.creatorDaily&&!already)return skip('창작자 일일 지원 한도입니다.');
 const bot=await one(env,`SELECT b.* FROM ai_bots b WHERE b.active=1 AND b.daily_limit>(SELECT count(*) FROM ai_bot_activities a WHERE a.bot_id=b.user_id AND a.day=?) AND NOT EXISTS(SELECT 1 FROM ai_bot_activities a WHERE a.bot_id=b.user_id AND a.target_type=? AND a.target_id=? AND a.action=?) AND NOT EXISTS(SELECT 1 FROM user_blocks WHERE (user_id=? AND blocked_id=b.user_id) OR (blocked_id=? AND user_id=b.user_id)) ORDER BY b.number LIMIT 1`,day,j.target_type,j.target_id,j.action,j.owner_id,j.owner_id);
 if(!bot)throw new Error('활성 계정 또는 계정별 일일 여유가 없습니다.');
 let body='',quantity=0;
 if(j.action==='comment'){
  const template=await one(env,`SELECT * FROM ai_bot_templates t WHERE active=1 AND category IN (?,?,'general') AND NOT EXISTS(SELECT 1 FROM ai_bot_activities a WHERE a.target_type=? AND a.target_id=? AND a.action='comment' AND substr(a.body,1,length(t.body))=t.body) ORDER BY (category=?) DESC,(style=?) DESC,random() LIMIT 1`,category,kind,j.target_type,j.target_id,category,bot.style);
  if(!template)return skip('사용 가능한 미중복 템플릿이 없습니다.');body=template.body+(bot.emoji?' '+bot.emoji:'');
 }else quantity=c.giftMin+Math.floor(Math.random()*(c.giftMax-c.giftMin+1));
 const aid='activity:'+j.id,comments=j.action==='comment',limit=comments?c.dailyComments:c.dailyGifts;
 const liveTarget=j.target_type==='track'?"EXISTS(SELECT 1 FROM tracks WHERE id=? AND user_id=? AND status='published' AND (kind='original' OR duet_open=0))":"EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND owner_id=? AND state='complete' AND visibility='public' AND deleted_at=0)";
 const guard=`EXISTS(SELECT 1 FROM ai_bot_settings WHERE id=1 AND revision=? AND lease_token=? AND lease_until>? AND json_extract(json,'$.enabled')=1) AND EXISTS(SELECT 1 FROM ai_bots b WHERE b.user_id=? AND b.active=1 AND b.daily_limit>(SELECT count(*) FROM ai_bot_activities a WHERE a.bot_id=b.user_id AND a.day='${day}')) AND (SELECT COALESCE(${comments?'count(*)':'sum(quantity)'},0) FROM ai_bot_activities WHERE day=? AND action=?) + ?<=? AND ${liveTarget}`;
 await env.DB.batch([
  query(env,`INSERT OR IGNORE INTO ai_bot_activities(id,job_id,bot_id,owner_id,target_type,target_id,action,body,quantity,created,day) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,aid,j.id,bot.user_id,j.owner_id,j.target_type,j.target_id,j.action,body,quantity,at,day,s.revision,token,at,bot.user_id,day,j.action,comments?1:quantity,limit,j.target_id,j.owner_id),
  comments?query(env,`INSERT OR IGNORE INTO comments(id,track_id,dubbing_id,user_id,body,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ai_bot_activities WHERE id=?)`,'ai-comment-'+j.target_type+'-'+j.target_id+'-'+j.slot,j.target_type==='track'?j.target_id:null,j.target_type==='dubbing'?j.target_id:null,bot.user_id,body,at,aid):query(env,`INSERT OR IGNORE INTO ai_support_gifts(id,job_id,sender_id,owner_id,target_type,target_id,quantity,created) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ai_bot_activities WHERE id=?)`,'gift:'+j.id,j.id,bot.user_id,j.owner_id,j.target_type,j.target_id,quantity,at,aid),
  query(env,"UPDATE ai_bot_jobs SET state='done',updated=?,error='' WHERE id=? AND EXISTS(SELECT 1 FROM ai_bot_activities WHERE id=?)",at,j.id,aid)
 ]);
 // Daily caps pause work until the next KST day; stopping leaves jobs untouched.
 if(!await one(env,'SELECT 1 FROM ai_bot_activities WHERE id=?',aid)){
  const current=await botSettings(env);if(current.revision!==s.revision||!current.config.enabled)return;
  await run(env,'UPDATE ai_bot_jobs SET due=?,updated=? WHERE id=? AND state=\'pending\'',Math.floor(Date.parse(giftDay(at+86400)+'T00:00:00+09:00')/1000),at,j.id);
 }
}
