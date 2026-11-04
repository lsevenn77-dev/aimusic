import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {BOT_PERSONALITIES,preferenceScore} from '../server/bot-personalities.js';
import {BOT_DEFAULTS} from '../shared/ai-bots.js';
import {runBotEngine} from '../server/ai-bots.js';
import {commentRefreshStatus} from '../server/bot-comment-refresh.js';

const migration=readFileSync(new URL('../drizzle/0093_refresh_bot_comments_20261104.sql',import.meta.url),'utf8');
async function seed(t){
 const f=await fixture(t);f.env={DB:f.DB,OPENAI_API_KEY:'fixture-key'};
 const profiles=[...BOT_PERSONALITIES].filter(([,p])=>preferenceScore(p,['Rock'])>0).slice(0,10);
 for(const [i,[source]] of profiles.entries()){
  const uid='ai_'+String(800000+i);
  f.sql.prepare("INSERT INTO users(id,email,name,provider,account_type,created) VALUES(?,?,?,'ai_service','ai_bot',0)").run(uid,uid+'@service.invalid',uid);
  f.sql.prepare('INSERT INTO producers(id,user_id,name,created) VALUES(?,?,?,0)').run(uid,uid,uid);
  f.sql.prepare('INSERT INTO ai_bots(user_id,source_key,image_sha,active,daily_limit,created,updated) VALUES(?,?,?,1,10,0,0)').run(uid,source,'refresh-image'+i);
 }
 f.sql.exec(`INSERT INTO comments(id,track_id,user_id,body,created) VALUES('old-bot','one','ai_800000','이전 정형 댓글',1),('member','one','other','회원 댓글 유지',2);
  INSERT INTO comments(id,track_id,user_id,parent_id,body,created) VALUES('reply','one','other','old-bot','회원 답글 유지',3);
  INSERT INTO ai_bot_jobs(id,target_type,target_id,owner_id,category,action,slot,due,state,created,updated) VALUES('old-job','track','one','owner','original','comment',0,0,'done',0,0),('old-gift','track','one','owner','original','gift',0,0,'done',0,0);
  INSERT INTO ai_bot_activities VALUES('old-activity','old-job','ai_800000','owner','track','one','comment','이전 정형 댓글',0,0,'2000-01-01');
  INSERT INTO ai_support_follows VALUES('ai_800000','owner','old-activity',0);`);
 f.sql.prepare('UPDATE ai_bot_settings SET json=? WHERE id=1').run(JSON.stringify({...BOT_DEFAULTS,enabled:true,comments:3,gifts:true,creatorDaily:0,humanThreshold:1,probability:0}));
 f.sql.exec(migration);
 return f;
}
const response=()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({body:crypto.randomUUID().replaceAll('-','')+' 좋네요.'})}]}]});

test('refresh snapshots old official comments, retires only comment jobs and queues two or three per eligible work',async t=>{
 const f=await seed(t);
 assert.equal(f.sql.prepare("SELECT body FROM comments WHERE id='old-bot'").get().body,'이전 정형 댓글');
 assert.equal(f.sql.prepare("SELECT action FROM ai_bot_jobs WHERE id='old-job'").get().action,'comment_before_20261104');
 assert.equal(f.sql.prepare("SELECT state FROM ai_bot_jobs WHERE id='old-gift'").get().state,'done');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_jobs WHERE state='pending'").get().n,0);
 for(const tid of ['one','two','three'])assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_jobs WHERE target_id=? AND action='comment'").get(tid).n,2+tid.codePointAt(tid.length-1)%2);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_jobs WHERE target_id='hidden'").get().n,0);
 f.sql.exec(migration);assert.equal((await commentRefreshStatus(f.env)).total,9);
});

test('failed generation preserves old comments; successful refresh preserves humans, replies and follows and is idempotent',async t=>{
 const f=await seed(t);
 t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
 await runBotEngine(f.env);
 assert.equal(f.sql.prepare("SELECT deleted_at FROM comments WHERE id='old-bot'").get().deleted_at,0);
 f.sql.exec("UPDATE ai_bot_jobs SET due=0 WHERE state='pending'");
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return response();});
 await runBotEngine(f.env);
 const status=await commentRefreshStatus(f.env);assert.equal(status.done,9);assert.equal(status.old_comments_remaining,0);
 assert.equal(f.sql.prepare("SELECT body FROM comments WHERE id='member'").get().body,'회원 댓글 유지');
 assert.equal(f.sql.prepare("SELECT parent_id FROM comments WHERE id='reply'").get().parent_id,null);
 assert.equal(f.sql.prepare("SELECT body FROM comments WHERE id='reply'").get().body,'회원 답글 유지');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_support_follows').get().n,1);
 assert.equal(f.sql.prepare("SELECT state FROM ai_bot_jobs WHERE id='old-job'").get().state,'done');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM ai_bot_activities WHERE id='old-activity'").get().n,1);
 assert.equal(f.sql.prepare("SELECT json_extract(details,'$.deleted_comments') n FROM ai_bot_audit WHERE action='comment_refresh_replaced'").get().n,1);
 for(const tid of ['one','two','three'])assert.equal(f.sql.prepare("SELECT count(DISTINCT user_id) n FROM comments WHERE track_id=? AND id LIKE 'ai-comment-refresh:%' AND deleted_at=0").get(tid).n,3);
 await runBotEngine(f.env);assert.equal(calls,9);
 const cid=f.sql.prepare("SELECT id FROM comments WHERE id LIKE 'ai-comment-refresh:%' LIMIT 1").get().id;
 assert.equal((await f.call('/api/comments/'+cid+'/like','PUT',{},'other')).status,200);
 assert.equal((await f.call('/api/comments/'+cid+'/report','POST',{reason:'other',details:'fixture only'},'other')).status,201);
 assert.equal((await f.call('/api/comments/'+cid,'DELETE',null,'owner')).status,200);
});

test('stop during refresh generation prevents both deletion and insertion',async t=>{
 const f=await seed(t);
 t.mock.method(globalThis,'fetch',async()=>{f.sql.exec("UPDATE ai_bot_settings SET json=json_set(json,'$.enabled',json('false')),revision=revision+1 WHERE id=1");return response();});
 await runBotEngine(f.env);
 assert.equal((await commentRefreshStatus(f.env)).done,0);
 assert.equal(f.sql.prepare("SELECT body FROM comments WHERE id='old-bot'").get().body,'이전 정형 댓글');
});
