import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {BOT_PERSONALITIES,botPersonality,preferenceScore} from '../server/bot-personalities.js';
import {GENRES} from '../shared/genres.js';
import {BOT_DEFAULTS} from '../shared/ai-bots.js';
import {commentMusicContext,generateBotComment,validateBotComment,similarComment} from '../server/bot-comment-ai.js';
import {selectSupportBot,runBotEngine} from '../server/ai-bots.js';
const now=()=>Math.floor(Date.now()/1000);
const job={target_type:'track',target_id:'hidden',owner_id:'owner',action:'comment',slot:0};
const rock=[...BOT_PERSONALITIES].filter(([key,p])=>p.preferredGenres.some(g=>g.genre==='Rock'));
async function seed(t){
 const f=await fixture(t,{OPENAI_API_KEY:'fixture-key'});f.env={DB:f.DB,OPENAI_API_KEY:'fixture-key'};
 const add=(number,source)=>{
  const uid='ai_'+String(number).padStart(6,'0');
  f.sql.prepare("INSERT INTO users(id,email,name,provider,account_type,created) VALUES(?,?,?,'ai_service','ai_bot',0)").run(uid,uid+'@service.invalid',uid);
  f.sql.prepare("INSERT INTO producers(id,user_id,name,created) VALUES(?,?,?,0)").run(uid,uid,uid);
  f.sql.prepare('INSERT INTO ai_bots(user_id,source_key,image_sha,active,daily_limit,created,updated) VALUES(?,?,?,1,10,0,0)').run(uid,source,'image'+number);
 };
 rock.slice(0,4).forEach(([key],i)=>add(i+1,key));
 add(5,[...BOT_PERSONALITIES].find(([key,p])=>!preferenceScore(p,['Rock']))[0]);
 f.sql.prepare('UPDATE ai_bot_settings SET json=? WHERE id=1').run(JSON.stringify({...BOT_DEFAULTS,enabled:true,comments:3,gifts:false,creatorDaily:10}));
 return f;
}
const response=body=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({body})}]}]});

test('all 335 imported identities retain unique source personality combinations; every genre has candidates',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../dist/assets/ai-bot-import/catalog.json',import.meta.url),'utf8'));
 const profiles=catalog.items.map(i=>botPersonality(i));assert.ok(profiles.every(Boolean));
 assert.equal(new Set(profiles.map(p=>p.source_id)).size,335);
 assert.equal(new Set(profiles.map(p=>JSON.stringify(p.axes))).size,335);
 const json=JSON.stringify(profiles);
 for(const excluded of ['speech_samples','verbal_tic','birth_date','occupation','flirting_style','romantic_pace','relationship_system','hometown','dialect'])assert.ok(!json.includes('"'+excluded+'"'),excluded);
 for(const genre of GENRES)assert.ok(profiles.filter(p=>preferenceScore(p,[genre])>0).length>=3,genre);
 assert.equal(botPersonality({source_key:'unknown'}),null);
});

test('publication queues a stable two or three comments and never duplicates on republish',async t=>{
 const f=await seed(t);
 for(const tid of ['two','three']){
  f.sql.prepare("UPDATE tracks SET status='hidden' WHERE id=?").run(tid);
  f.sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(tid);
  const count=f.sql.prepare("SELECT count(*) n FROM ai_bot_jobs WHERE target_id=? AND action='comment'").get(tid).n;
  assert.equal(count,2+(tid.codePointAt(tid.length-1)%2));
  f.sql.prepare("UPDATE tracks SET status='hidden' WHERE id=?").run(tid);f.sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(tid);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM ai_bot_jobs WHERE target_id=?').get(tid).n,count);
 }
});

test('comment selection requires genre preference and respects duplicates, blocks and quotas',async t=>{
 const f=await seed(t);
 const first=await selectSupportBot(f.env,job,'2026-11-04',()=>0);assert.equal(first.user_id,'ai_000001');
 for(let i=0;i<20;i++){const b=await selectSupportBot(f.env,job,'2026-11-04');assert.ok(preferenceScore(botPersonality(b),['Rock'])>0);}
 f.sql.exec("UPDATE ai_bots SET daily_limit=0 WHERE number=1; INSERT INTO user_blocks VALUES('owner','ai_000002',0); UPDATE ai_bots SET active=0 WHERE number=3");
 assert.equal((await selectSupportBot(f.env,job,'2026-11-04')).user_id,'ai_000004');
 f.sql.exec("UPDATE tracks SET genre='분석 대기',genres_json='[]' WHERE id='hidden'");
 assert.equal(await selectSupportBot(f.env,job,'2026-11-04'),null);
});

test('saved Gemini audible evidence is reused for originals, never inherited as cover vocal evidence',async t=>{
 const f=await seed(t);
 f.sql.prepare("INSERT INTO music_classification_jobs(track_id,state,result_json,updated) VALUES('hidden','done',?,0)").run(JSON.stringify({genres:['Rock'],moods:['energy'],reason:'선명한 보컬과 힘 있는 비트가 들린다.',sample:true,model:'fixture-Gemini'}));
 let track=f.sql.prepare("SELECT * FROM tracks WHERE id='hidden'").get();
 const original=await commentMusicContext(f.env,job,track);assert.ok(original.audioEvidence.reason.includes('보컬'));assert.equal(original.audioEvidence.sample,true);
 f.sql.exec("UPDATE tracks SET lyrics='다시 시작하는 오늘' WHERE id='one'; UPDATE tracks SET kind='cover',original_id='one',classification_source='original',lyrics='' WHERE id='hidden'");
 track=f.sql.prepare("SELECT * FROM tracks WHERE id='hidden'").get();const cover=await commentMusicContext(f.env,job,track);
 assert.equal(cover.audioEvidence,null);assert.equal(cover.allowAIComment,false);assert.equal(cover.lyrics,'다시 시작하는 오늘');
 assert.throws(()=>validateBotComment('목소리가 정말 좋네요.',cover),/보컬/);
 assert.throws(()=>validateBotComment('AI 기술이 많이 발전했네요.',cover),/AI/);
 assert.equal(validateBotComment('가사에 담긴 시작의 마음이 와닿네요.',cover),'가사에 담긴 시작의 마음이 와닿네요.');
});

test('Luna receives personality and evidence without examples; invalid outputs are retried without template fallback',async t=>{
 const f=await seed(t),bot=f.sql.prepare('SELECT * FROM ai_bots WHERE number=1').get(),target=f.sql.prepare("SELECT * FROM tracks WHERE id='hidden'").get();
 let calls=0;
 const fetcher=async(url,options)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body),input=JSON.parse(body.input);
  assert.equal(body.model,'gpt-6-luna');assert.equal(body.store,false);assert.ok(input.personality.axes);assert.equal(input.music.genres[0],'Rock');
  for(const term of ['speech_samples','seed-general','template','previousComments'])assert.ok(!JSON.stringify(input).includes(term));
  return response(calls===1?'목소리가 정말 좋네요.':'록 장르를 좋아해서 반가워요.');
 };
 assert.equal(await generateBotComment(f.env,{job,target,bot,personality:botPersonality(bot)},fetcher),'록 장르를 좋아해서 반가워요.');assert.equal(calls,2);
 await assert.rejects(generateBotComment(f.env,{job,target,bot,personality:botPersonality(bot)},async()=>new Response('busy',{status:429})),/429/);
 assert.ok(similarComment('록 장르를 좋아해서 반가워요!','록 장르를 좋아해서 반가워요 😊'));
 assert.throws(()=>validateBotComment('가사가 공감되네요.',{lyrics:'',audioEvidence:null,allowAIComment:false}),/가사/);
});

test('two or three distinct actors post only generated comments, provider failure retries and stop during generation wins',async t=>{
 const f=await seed(t);let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return response(crypto.randomUUID().replaceAll('-','')+' 반갑네요.');});
 f.sql.exec("UPDATE tracks SET status='published' WHERE id='hidden'; UPDATE ai_bot_jobs SET due=0");
 assert.equal((await runBotEngine(f.env)).failed,0);
 const rows=f.sql.prepare('SELECT * FROM comments').all();assert.equal(rows.length,2);assert.equal(new Set(rows.map(r=>r.user_id)).size,2);assert.equal(calls,2);
 await runBotEngine(f.env);assert.equal(calls,2);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='two'; UPDATE tracks SET status='published' WHERE id='two'; UPDATE ai_bot_jobs SET due=0");
 t.mock.method(globalThis,'fetch',async()=>new Response('error',{status:503}));await runBotEngine(f.env);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM comments WHERE track_id='two'").get().n,0);
 assert.ok(f.sql.prepare("SELECT attempts FROM ai_bot_jobs WHERE target_id='two'").get().attempts>0);
 f.sql.exec('UPDATE ai_bot_jobs SET due=0');
 t.mock.method(globalThis,'fetch',async()=>{f.sql.exec("UPDATE ai_bot_settings SET json=json_set(json,'$.enabled',json('false')),revision=revision+1 WHERE id=1");return response('록 음악을 좋아해서 반가워요.');});
 await runBotEngine(f.env);assert.equal(f.sql.prepare("SELECT count(*) n FROM comments WHERE track_id='two'").get().n,0);
});
