import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {runLyricBatch,queueLyricAnalysis} from '../server/lyric-analysis.js';
import {LYRIC_ANALYSIS_VERSION} from '../shared/lyric-semantics.js';

function measured(DB,before=async()=>{}){
 const calls=[];
 return {calls,DB:{...DB,prepare(sql){const statement=DB.prepare(sql);return {bind(...args){
  const bound=statement.bind(...args);
  return Object.fromEntries(Object.entries(bound).map(([method,fn])=>[method,async(...values)=>{
   calls.push(sql);await before(sql);return fn(...values);
  }]));
 }};}}};
}
async function completed(t){
 const f=await fixture(t);await runLyricBatch({DB:f.DB});
 f.sql.exec('UPDATE lyric_analysis_control SET lease_until=0');return f;
}

test('completed queue uses one read, makes no changes, and still picks up newly edited lyrics',async t=>{
 const f=await completed(t),m=measured(f.DB);
 const before=f.sql.prepare('SELECT * FROM lyric_analysis_control').all();
 assert.equal((await runLyricBatch({DB:m.DB})).idle,true);
 assert.equal(m.calls.length,1);assert.match(m.calls[0],/^SELECT/);
 assert.deepEqual(f.sql.prepare('SELECT * FROM lyric_analysis_control').all(),before);
 f.sql.exec("UPDATE tracks SET lyrics='너를 사랑해' WHERE id='one'");
 const result=await runLyricBatch({DB:m.DB});assert.equal(result.processed,1);
 assert.equal(f.sql.prepare("SELECT state FROM lyric_analysis_jobs WHERE track_id='one'").get().state,'done');
 assert.ok(f.sql.prepare("SELECT 1 FROM lyric_search_tags WHERE track_id='one' AND tag_id='love'").get());
});

test('missing scan state and changed analysis version still seed and finish their scans',async t=>{
 const f=await fixture(t);f.sql.exec('DELETE FROM lyric_analysis_jobs');
 const first=await runLyricBatch({DB:f.DB});assert.equal(first.seeded,4);assert.equal(first.processed,4);
 f.sql.exec("UPDATE lyric_analysis_control SET version='previous-version',lease_until=0");
 assert.equal((await runLyricBatch({DB:f.DB})).seeded,4);
 const control=f.sql.prepare('SELECT version,scan_done FROM lyric_analysis_control').get();
 assert.equal(control.version,LYRIC_ANALYSIS_VERSION);assert.equal(control.scan_done,1);
});

test('idle preflight preserves live leases and future retries but recovers expired jobs',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 const f=await completed(t),at=Math.floor(Date.now()/1000),m=measured(f.DB);
 f.sql.prepare("UPDATE lyric_analysis_jobs SET state='queued',attempts=1,lease_until=? WHERE track_id='one'").run(at+30);
 assert.equal((await runLyricBatch({DB:m.DB})).idle,true);assert.equal(m.calls.length,1);
 f.sql.prepare('UPDATE lyric_analysis_control SET lease_until=?').run(at+45);
 assert.equal((await runLyricBatch({DB:m.DB})).busy,true);assert.equal(m.calls.length,2);
 t.mock.timers.tick(46000);
 f.sql.exec("UPDATE lyric_analysis_jobs SET state='processing',attempts=3,lease_until=0 WHERE track_id='two'");
 const result=await runLyricBatch({DB:m.DB});assert.equal(result.processed,1);
 assert.equal(f.sql.prepare("SELECT state FROM lyric_analysis_jobs WHERE track_id='one'").get().state,'no_lyrics');
 assert.equal(f.sql.prepare("SELECT state FROM lyric_analysis_jobs WHERE track_id='two'").get().state,'failed');
});

test('heartbeat coalesces in-flight work and waits 30 seconds after completion',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 const f=await completed(t),pending=[];let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const m=measured(f.DB,()=>gate),env={DB:m.DB,BUCKET:{}},ctx={waitUntil(p){pending.push(p);}};
 queueLyricAnalysis(env,ctx);assert.equal(pending.length,1);
 t.mock.timers.tick(60000);queueLyricAnalysis(env,ctx);assert.equal(pending.length,1);
 release();await Promise.all(pending);assert.equal(m.calls.length,1);
 t.mock.timers.tick(29999);queueLyricAnalysis(env,ctx);assert.equal(pending.length,1);
 t.mock.timers.tick(1);queueLyricAnalysis(env,ctx);assert.equal(pending.length,2);
 await Promise.all(pending);assert.equal(m.calls.length,2);
 queueLyricAnalysis({...env,LYRIC_ANALYSIS_DISABLED:'true'},ctx);assert.equal(pending.length,2);
});

test('page reads and denied internal requests never run analysis; authenticated worker processes queued edits',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 const f=await fixture(t),m=measured(f.DB),pending=[];
 const env={DB:m.DB,BUCKET:{},TRANSCODER_TOKEN:'fixture-encoder-token'},ctx={waitUntil(p){pending.push(p);}};
 const call=async(path,{method='GET',token,user}={})=>{
  const response=await worker.fetch(new Request('https://aifect.test'+path,{method,headers:{
   Origin:'https://aifect.test','content-type':'application/json',
   ...(token?{authorization:'Bearer '+token}:{}),...(user?{Cookie:'aifect_session='+user}:{})
  },...(method==='POST'?{body:'{}'}:{})}),env,ctx);
  await Promise.all(pending.splice(0));return response;
 };
 for(const path of ['/api/catalog?section=tracks&limit=12','/api/search?q=love','/api/studio'])
  assert.equal((await call(path,{user:'owner'})).status,200,path);
 assert.equal((await call('/internal/jobs/claim',{method:'POST',token:'wrong'})).status,401);
 assert.equal((await call('/internal/lyrics/claim',{method:'POST',token:'wrong'})).status,401);
 assert.ok(m.calls.every(sql=>!sql.includes('lyric_analysis_control')));
 assert.equal(f.sql.prepare("SELECT count(*) n FROM lyric_analysis_jobs WHERE state='queued'").get().n,4);
 assert.equal((await call('/internal/jobs/claim',{method:'POST',token:env.TRANSCODER_TOKEN})).status,200);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM lyric_analysis_jobs WHERE state='no_lyrics'").get().n,4);
 f.sql.exec("UPDATE tracks SET lyrics='혼자 남아 외로워' WHERE id='one'");
 t.mock.timers.tick(30000);
 assert.equal((await call('/internal/jobs/claim',{method:'POST',token:env.TRANSCODER_TOKEN})).status,200);
 assert.equal(f.sql.prepare("SELECT state FROM lyric_analysis_jobs WHERE track_id='one'").get().state,'done');
 assert.ok(f.sql.prepare("SELECT 1 FROM lyric_search_tags WHERE track_id='one' AND tag_id='lonely'").get());
});
