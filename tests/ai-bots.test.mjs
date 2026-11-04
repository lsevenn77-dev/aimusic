import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {runBotEngine,queueBotHeartbeat,selectSupportBot} from '../server/ai-bots.js';
import {BOT_PERSONALITIES} from '../server/bot-personalities.js';
import {BOT_DEFAULTS,BOT_SEED_TEMPLATES} from '../shared/ai-bots.js';
import {sampleScript,options} from './dubbing-fixtures.mjs';
import {readFileSync} from 'node:fs';
import {popularScores} from '../server/popular-chart.js';
import {payoutRoute} from '../server/payouts.js';
const root='/api/admin/ai-bots',at=()=>Math.floor(Date.now()/1000);
async function setup(t){
 const sourceKeys=[...BOT_PERSONALITIES].filter(([key,p])=>p.preferredGenres.some(g=>g.genre==='Rock')).map(([key])=>key);
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  const r=JSON.parse(options.body);assert.equal(r.model,'gpt-6-luna');
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({body:crypto.randomUUID().replaceAll('-','')+' 반갑네요.'})}]}]});
 });
 const objects=new Map(),env={OPENAI_API_KEY:'fixture-key',DUBBING_ENABLED:'true',ADMIN_USER_IDS:'owner',BUCKET:{async put(k,v){objects.set(k,v);},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async delete(k){objects.delete(k);}}},f=await fixture(t,env);env.DB=f.DB;
 const asset=n=>{const data=new Uint8Array(24);data.set([82,73,70,70]);new DataView(data.buffer).setUint32(4,16,true);data.set([87,69,66,80],8);data[20]=n%256;data[21]=Math.floor(n/256);const sha=createHash('sha256').update(data).digest('hex');f.sql.prepare('INSERT INTO ai_bot_assets VALUES(?,?,?,?)').run(sha,24,'owner',at());objects.set('images/ai-bot-staging/'+sha,data);return {sha,source_key:'fixture:'+n,name:'응원계정'+n};};
 const importItems=async items=>{const results=[];for(let start=0;start<items.length;start+=5){const chunk=items.slice(start,start+5),preview=await f.call(root+'/import/preview','POST',{items:chunk,owned_ai:true});assert.equal(preview.status,200);const r=await f.call(root+'/import/execute','POST',{items:chunk,owned_ai:true,preview_token:preview.body.preview_token});assert.equal(r.status,200);results.push(...r.body.results);}return {status:200,body:{results}};};
 const enabled=async changes=>{const s=await f.call(root+'/settings');return f.call(root+'/settings','PUT',{revision:s.body.revision,config:{...s.body.config,enabled:true,comments:1,...changes}});};
 const seed=async(n=2)=>{const items=Array.from({length:n},(_,i)=>asset(i+1));const r=await importItems(items);assert.ok(r.body.results.every(i=>i.status==='created'),JSON.stringify(r));f.sql.exec('UPDATE ai_bots SET active=1');for(let i=0;i<n;i++)f.sql.prepare('UPDATE ai_bots SET source_key=? WHERE number=?').run(sourceKeys[i],i+1);return items;};
 const publish=()=>f.sql.exec("UPDATE tracks SET status='published' WHERE id='hidden'");
 const due=()=>f.sql.exec('UPDATE ai_bot_jobs SET due=0');
 return {...f,env,objects,asset,importItems,enabled,seed,publish,due};
}
test('defaults remain OFF, 120 templates are categorized, no public admin access',async t=>{
 const f=await setup(t);assert.equal(BOT_SEED_TEMPLATES.length,120);
 assert.equal((await f.call(root+'/settings')).body.config.enabled,false);
 assert.equal((await f.call(root+'/dashboard','GET',null,null)).status,401);
 assert.equal((await f.call(root+'/dashboard','GET',null,'other')).status,403);
 f.publish();assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_jobs').get().n,0);
 assert.equal((await runBotEngine(f.env)).stopped,true);
});
test('import validates length and duplicate nicknames including pending items and concurrent imports',async t=>{
 const f=await setup(t),items=[f.asset(701),f.asset(702),f.asset(703),f.asset(704)];
 items[0].name='Eight888';items[1].name='eight888';items[2].name='ninechars';items[3].name='유효한이름';
 const preview=await f.call(root+'/import/preview','POST',{items,owned_ai:true});
 assert.deepEqual(preview.body.items.map(i=>i.status),['ready','failed','failed','ready']);
 const [a,b]=await Promise.all([f.importItems([items[0]]),f.importItems([items[1]])]);
 assert.deepEqual([a,b].map(r=>r.body.results[0].status).sort(),['created','failed']);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bots').get().n,1);
 assert.equal(f.sql.prepare('SELECT normalized FROM account_handles').get().normalized,'ai:eight888');
 assert.equal((await f.importItems([items[2]])).body.results[0].status,'failed');
 // Members' namespace remains available when the matching bot is imported later.
 assert.equal((await f.call('/api/account/nickname','PUT',{name:'유효한이름'})).status,200);
 assert.equal((await f.importItems([items[3]])).body.results[0].status,'created');
});

test('successful support follows its creator once with an AI label and never changes human follows/rank metrics',async t=>{
 const f=await setup(t);await f.seed(1);await f.enabled();f.publish();f.due();await runBotEngine(f.env);await runBotEngine(f.env);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_support_follows').get().n,1);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM follows').get().n,0);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_audit WHERE action='follow'").get().n,1);
 const own=(await f.call('/api/me/profile')).body;assert.equal(own.follower_count,1);assert.equal(own.human_followers,0);assert.equal(own.ai_followers,1);assert.equal(own.followers[0].account_type,'ai_bot');
 for(const path of ['/api/producers/producer','/api/producers/producer/preview']){const d=(await f.call(path)).body;assert.equal(d.followers,1);assert.equal(d.ai_followers,1);assert.equal(d.human_followers,0);}
 const added=(await f.call('/api/producers/producer/follow','PUT',null,'other')).body;assert.equal(added.followers,2);assert.equal(added.human_followers,1);assert.equal(added.ai_followers,1);
 f.due();await runBotEngine(f.env);assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_support_follows').get().n,1);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','ai_000001',0)");
 const blocked=(await f.call('/api/me/profile')).body;assert.equal(blocked.follower_count,1);assert.equal(blocked.ai_followers,0);assert.ok(blocked.followers.every(x=>x.user_id!=='ai_000001'));
 assert.throws(()=>f.sql.exec("INSERT INTO ai_support_follows VALUES('other','owner','fake',0)"),/Official AI/);
});

test('only authenticated transcoder polling runs unattended support, throttles repeat polls and respects OFF',async t=>{
 const f=await setup(t);await f.seed();await f.enabled({commentMin:0,commentMax:0,giftDelayMin:0,giftDelayMax:0});f.publish();f.due();
 const pending=[],ctx={waitUntil(p){pending.push(p);}},env={...f.env,TRANSCODER_TOKEN:'fixture-encoder-token'};
 const poll=async token=>{
  const r=await worker.fetch(new Request('https://aifect.test/internal/jobs/claim',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{}'}),env,ctx);
  await Promise.all(pending.splice(0));return r;
 };
 assert.equal((await poll('wrong')).status,401);assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_activities').get().n,0);
 assert.equal((await poll('fixture-encoder-token')).status,200);assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_activities').get().n,2);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='two'; UPDATE tracks SET status='published' WHERE id='two'; UPDATE ai_bot_jobs SET due=0");
 assert.equal((await poll('fixture-encoder-token')).status,200);assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_activities').get().n,2);
 await f.call(root+'/stop','POST',{});queueBotHeartbeat(env,ctx,at()+61);await Promise.all(pending.splice(0));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_activities').get().n,2);
});
test('import preview and execute create unique service profiles, reject duplicates and never issue credentials',async t=>{
 const f=await setup(t),items=await f.seed();
 assert.equal(f.sql.prepare("SELECT count(*) n FROM users WHERE account_type='ai_bot' AND password IS NULL AND subject IS NULL").get().n,2);
 assert.equal(f.sql.prepare('SELECT min(user_id) id FROM ai_bots').get().id,'ai_000001');
 assert.equal((await f.importItems(items)).body.results[0].status,'duplicate');
 assert.equal((await f.call(root+'/import/execute','POST',{items,owned_ai:true,preview_token:'forged'})).status,409);
 assert.equal((await f.call('/api/producers/ai_000001/preview')).body.profile.account_type,'ai_bot');
 assert.throws(()=>f.sql.exec("INSERT INTO sessions VALUES('bad','ai_000001',9999999999)"),/service account/);
 assert.throws(()=>f.sql.exec("UPDATE users SET password='secret' WHERE id='ai_000001'"),/immutable/);
 assert.throws(()=>f.sql.exec("UPDATE users SET account_type='ai_bot' WHERE id='owner'"),/immutable/);
});
test('publish queues delayed jobs, processes once under concurrent runs, keeps ledgers and charts human',async t=>{
 const f=await setup(t);await f.seed(3);await f.enabled({comments:2});f.publish();
 const jobs=f.sql.prepare('SELECT * FROM ai_bot_jobs').all();assert.equal(jobs.length,3);
 for(const j of jobs){const lo=j.action==='comment'?300:600,hi=j.action==='comment'?900:1800;assert.ok(j.due-j.created>=lo&&j.due-j.created<=hi);}
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='hidden'");f.publish();assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_jobs').get().n,3);
 const beforeChart=await popularScores(f.env,{from:0,until:at()+3600},'1=1',[],100);
 f.due();await Promise.all([runBotEngine(f.env),runBotEngine(f.env)]);await runBotEngine(f.env);
 assert.deepEqual(await popularScores(f.env,{from:0,until:at()+3600},'1=1',[],100),beforeChart);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_activities').get().n,3);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM comments').get().n,2);
 const comments=(await f.call('/api/tracks/hidden/comments')).body.comments;assert.ok(comments.every(c=>c.account_type==='ai_bot'));assert.notEqual(comments[0].body,comments[1].body);
 for(const table of ['gold_purchases','gifts','gift_lots','free_gifts','free_gift_wallets','listens','likes'])assert.equal(f.sql.prepare('SELECT count(*) n FROM '+table).get().n,0,table);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM player_xp WHERE user_id IN (SELECT user_id FROM ai_bots)").get().n,0);
 const g=(await f.call('/api/tracks/hidden/gifts')).body;assert.equal(g.total_gold,0);assert.equal(g.ranking.length,0);assert.ok(g.official_ai.quantity>=1);
 const dashboard=(await f.call('/api/admin/dashboard')).body;assert.equal(dashboard.summary.users,2);
});
test('emergency stop, hidden works, real reactions and per-creator cap suppress automatic activity',async t=>{
 const f=await setup(t);await f.seed();await f.enabled();f.publish();f.due();await f.call(root+'/stop','POST',{});
 await runBotEngine(f.env);assert.equal(f.sql.prepare('SELECT count(*) n FROM comments').get().n,0);
 await f.enabled({humanThreshold:1});f.sql.exec("INSERT INTO comments(id,track_id,user_id,body,created) VALUES('real','hidden','other','응원합니다',0)");await runBotEngine(f.env);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_jobs WHERE state='skipped'").get().n,2);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='hidden'");assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_support_gifts').get().n,0);
});
test('daily caps defer work, worker failures retry without partial gift, stale setting writes conflict',async t=>{
 const f=await setup(t);await f.seed();await f.enabled({dailyComments:0,dailyGifts:0});f.publish();f.due();await runBotEngine(f.env);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_activities').get().n,0);
 const settings=await f.call(root+'/settings');await f.enabled({dailyComments:10,dailyGifts:10});
 assert.equal((await f.call(root+'/settings','PUT',settings.body)).status,409);
 f.sql.exec("CREATE TRIGGER test_gift_failure BEFORE INSERT ON ai_support_gifts BEGIN SELECT RAISE(ABORT,'fixture R2/DB failure'); END");f.due();await runBotEngine(f.env);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_activities WHERE action='gift'").get().n,0);
 assert.equal(f.sql.prepare("SELECT attempts FROM ai_bot_jobs WHERE action='gift'").get().attempts,1);
 f.sql.exec('DROP TRIGGER test_gift_failure');f.due();await runBotEngine(f.env);assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_support_gifts').get().n,1);
});
test('500 distinct profiles import in bounded batches and indexed queue remains bounded',async t=>{
 const f=await setup(t),start=performance.now();
 for(let batch=0;batch<5;batch++){const items=Array.from({length:100},(_,i)=>f.asset(batch*100+i));const r=await f.importItems(items);assert.equal(r.status,200);assert.ok(r.body.results.every(i=>i.status==='created'));}
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bots').get().n,500);
 assert.equal(f.sql.prepare('SELECT max(user_id) id FROM ai_bots').get().id,'ai_000500');
 const plan=f.sql.prepare("EXPLAIN QUERY PLAN SELECT * FROM ai_bot_jobs WHERE state='pending' AND due<=? ORDER BY due,id LIMIT 15").all(at());assert.ok(plan.some(r=>r.detail.includes('ai_jobs_due')));
 t.diagnostic('500-account fixture import milliseconds: '+Math.round(performance.now()-start));
 await f.enabled();f.sql.exec('UPDATE ai_bots SET active=1');const known=[...BOT_PERSONALITIES].find(([key,p])=>p.preferredGenres.some(g=>g.genre==='Rock'))[0];f.sql.prepare('UPDATE ai_bots SET source_key=? WHERE number=1').run(known);f.publish();f.due();let queries=0;
 const DB={prepare(sql){const p=f.DB.prepare(sql);return {bind(...args){const statement=p.bind(...args);return Object.fromEntries(['first','all','run'].map(method=>[method,async()=>{queries++;return statement[method]();}]));}};},batch:statements=>f.DB.batch(statements)};
 const tickStart=performance.now();const tick=await runBotEngine({...f.env,DB});assert.equal(tick.failed,0);assert.ok(queries<50);
 t.diagnostic('500-profile engine tick: '+queries+' SQL statements, '+Math.round(performance.now()-tickStart)+' ms (local fixture, not production latency)');
});
test('first-work eligibility is captured when published, not lost if a second work appears before processing',async t=>{
 const f=await setup(t);await f.seed();f.sql.exec('DELETE FROM tracks');await f.enabled({newOnly:true});
 for(const tid of ['first-work','later-work'])f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',100,0,'published')").run(tid,tid);
 f.due();await runBotEngine(f.env);await runBotEngine(f.env);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_activities WHERE target_id='first-work'").get().n,2);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_activities WHERE target_id='later-work'").get().n,0);
});
test('completed dubbing and closed duets receive support; open duet and recruiting scripts do not',async t=>{
 const f=await setup(t);await f.seed(4);await f.enabled({creatorDaily:10});
 const created=await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript()});assert.equal(created.status,201,JSON.stringify(created));
 const pid=created.body.project.id;
 f.sql.prepare("UPDATE dubbing_projects SET visibility='public',state='recruiting' WHERE id=?").run(pid);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_jobs WHERE target_type='dubbing'").get().n,0);
 f.sql.prepare("UPDATE dubbing_projects SET state='complete' WHERE id=?").run(pid);
 f.sql.exec("UPDATE tracks SET kind='cover',cover_mode='duet',duet_open=1 WHERE id='hidden';UPDATE tracks SET status='published' WHERE id='hidden'");
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_jobs WHERE target_type='track'").get().n,0);
 f.sql.exec("UPDATE tracks SET duet_open=0 WHERE id='hidden'");f.due();
 const result=await runBotEngine(f.env);assert.equal(result.failed,0,JSON.stringify(f.sql.prepare('SELECT error FROM ai_bot_jobs').all()));
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_support_gifts WHERE target_type='dubbing'").get().n,1);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM comments WHERE dubbing_id=?').get(pid).n,1);
 const cm=await f.call('/api/dubbing/projects/'+pid+'/comments');assert.equal(cm.status,200);assert.equal(cm.body.comments[0].account_type,'ai_bot');
 assert.equal((await f.call('/api/producers/ai_000001/gifts','POST',{gift_type:'lollipop',quantity:1,request_id:crypto.randomUUID()})).status,400);
});
test('retired, blocked and quota-limited targets skip, and bot profiles cannot enter real finance APIs',async t=>{
 const f=await setup(t);await f.seed();await f.enabled({creatorDaily:0});f.publish();f.due();await runBotEngine(f.env);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_activities').get().n,0);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_jobs WHERE state='skipped'").get().n,2);
 const p=await f.call('/api/producers/ai_000001');assert.equal(p.body.profile.account_type,'ai_bot');assert.equal(p.body.profile.bio,'공식 AI 응원 계정');
 const stats=await f.call('/api/admin/dashboard');assert.equal(stats.body.summary.users,2);assert.equal(stats.body.summary.creators,1);
 await assert.rejects(payoutRoute(new Request('https://aifect.test/api/studio/payout-account'),f.env,'/api/studio/payout-account',{id:'ai_000001'}),e=>e.status===403);
 assert.throws(()=>f.sql.exec("INSERT INTO likes(user_id,track_id,created) VALUES('ai_000001','one',0)"),/service account/);
});
test('gift bot selection starts at a random index, wraps, and skips inactive/capped/blocked profiles',async t=>{
 const f=await setup(t);await f.seed(5);
 const job={target_type:'track',target_id:'one',action:'gift',owner_id:'owner'},day='2026-10-24';
 assert.equal((await selectSupportBot(f.env,job,day,()=>.5)).user_id,'ai_000003');
 assert.equal((await selectSupportBot(f.env,job,day,()=>.99)).user_id,'ai_000005');
 f.sql.exec("UPDATE ai_bots SET daily_limit=0 WHERE number=5; UPDATE ai_bots SET active=0 WHERE number=1; INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','ai_000002',0)");
 assert.equal((await selectSupportBot(f.env,job,day,()=>.99)).user_id,'ai_000003');
 f.sql.exec('UPDATE ai_bots SET active=0');assert.equal(await selectSupportBot(f.env,job,day),null);
});

test('operator tests only selected existing public works, keeps deduplication, permissions and zero-cash gifts',async t=>{
 const f=await setup(t),body={target_type:'track',target_id:'one',confirmed:true};await f.seed();
 assert.equal((await f.call(root+'/test-existing','POST',body)).status,409);
 await f.enabled({humanThreshold:100});
 assert.equal((await f.call(root+'/test-existing','POST',body,'other')).status,403);
 assert.equal((await f.call(root+'/test-existing','POST',{...body,confirmed:false})).status,400);
 assert.equal((await f.call(root+'/test-existing','POST',{...body,target_id:'hidden'})).status,404);
 assert.ok((await f.call(root+'/existing-targets')).body.targets.some(t=>t.id==='one'));
 assert.equal((await f.call(root+'/test-existing','POST',body)).status,200);
 const before=f.sql.prepare('SELECT count(*) n FROM ai_bot_jobs').get().n;
 await f.call(root+'/test-existing','POST',body);assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_jobs').get().n,before);
 await runBotEngine(f.env);assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_activities').get().n,2);
 await f.call(root+'/test-existing','POST',body);await runBotEngine(f.env);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_activities').get().n,2);
 assert.equal(f.sql.prepare('SELECT sum(cash_value) n FROM ai_support_gifts').get().n,0);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts').get().n,0);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_audit WHERE action='test_existing'").get().n,3);
});

test('reviewed Saigram catalogue contains exactly 335 real AI assets and imports only those 335 in a disposable database',async t=>{
 const f=await setup(t),catalog=JSON.parse(readFileSync(new URL('../dist/assets/ai-bot-import/catalog.json',import.meta.url),'utf8'));
 assert.equal(catalog.items.length,335);assert.ok(catalog.items.every(i=>i.status==='ready'));
 const items=[];
 for(const row of catalog.items){const data=readFileSync(new URL('../dist'+row.image,import.meta.url));assert.equal(createHash('sha256').update(data).digest('hex'),row.sha);assert.ok(data.includes(Buffer.from('WEBP')));f.sql.prepare('INSERT INTO ai_bot_assets VALUES(?,?,?,?)').run(row.sha,data.length,'owner',at());f.objects.set('images/ai-bot-staging/'+row.sha,data);items.push({name:row.name,source_key:row.source_key,sha:row.sha});}
 const result=await f.importItems(items);assert.ok(result.body.results.every(r=>r.status==='created'));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bots').get().n,335);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bots WHERE active=1').get().n,0);
 assert.equal((await f.call(root+'/settings')).body.config.enabled,false);
 assert.equal((await f.call('/api/admin/dashboard')).body.summary.users,2);
});
