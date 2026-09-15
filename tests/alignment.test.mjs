import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {plainLyrics,alignedLrc} from '../shared/alignment.js';
import worker from '../server/index.js';

test('alignment preserves supplied words, detects invalid timing and inserts instrumental gaps',()=>{
 assert.equal(plainLyrics('\ufeff 안녕 \r\n\r\nhello'),'안녕\nhello');
 for(const s of ['', '[Chorus]\nHello','[00:00]hello','x'.repeat(6001),Array(201).fill('가사').join('\n')])assert.throws(()=>plainLyrics(s));
 const lrc=alignedLrc('처음 가사\n다음 가사',[{start:2,end:5},{start:10,end:14}],20);assert.equal(lrc,'[00:02.000]처음 가사\n[00:05.000]\n[00:10.000]다음 가사\n[00:14.000]');
 for(const result of [[],[{start:0,end:1}],[{start:2,end:1},{start:2,end:3}],[{start:2,end:3},{start:1,end:4}],[{start:0,end:1},{start:NaN,end:4}],[{start:0,end:1},{start:10,end:30}]])assert.throws(()=>alignedLrc('one\ntwo',result,20));
});

async function jobsFixture(t){
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET duration=20,lyrics='[00:01]기존 가사',lyrics_mode='synced' WHERE id='one'");
 const bytes=new Uint8Array([1,2,3]);
 const internal=async(path,body={},token='',secret='internal-test')=>{const r=await worker.fetch(new Request('https://aifect.test'+path,{method:'POST',headers:{Authorization:'Bearer '+secret,'x-job-token':token,'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB:f.DB,TRANSCODER_TOKEN:'internal-test',BUCKET:{async get(){return {body:bytes,size:bytes.length};}}},{waitUntil(){}});return {status:r.status,body:await r.json()};};
 return {...f,internal};
}
const source={lyrics_source:'처음 가사\n다음 가사',lyrics_language:'ko'};
test('private alignment job lifecycle is idempotent and requires creator review before publication',async t=>{
 const {call,sql,internal}=await jobsFixture(t),path='/api/studio/tracks/one/lyrics/align';
 assert.equal((await call(path,'POST',source,null)).status,401);assert.equal((await call(path,'POST',source,'other')).status,404);
 let out=await call(path,'POST',source);assert.equal(out.status,202);const jid=out.body.alignment.id;
 assert.equal((await call(path,'POST',source)).body.alignment.id,jid);
 assert.equal((await call(path,'POST',{...source,lyrics_language:'not-supported'})).status,400);
 assert.equal((await internal('/internal/lyrics/claim',{},'','wrong')).status,401);
 const job=(await internal('/internal/lyrics/claim')).body.job;assert.equal(job.id,jid);assert.equal(job.duration,20);assert.equal((await internal('/internal/lyrics/claim')).body.job,null);
 const result={timings:[{start:2,end:5},{start:10,end:14}],needs_attention:true};
 assert.equal((await internal('/internal/lyrics/'+jid+'/finish',result,'wrong')).status,409);
 assert.equal((await internal('/internal/lyrics/'+jid+'/finish',{timings:[]},job.lease_token)).status,400);
 assert.equal((await internal('/internal/lyrics/'+jid+'/finish',result,job.lease_token)).status,200);
 assert.equal((await internal('/internal/lyrics/'+jid+'/finish',result,job.lease_token)).status,409);
 const ready=(await call(path)).body.alignment;assert.equal(ready.state,'ready');assert.equal(ready.needs_attention,1);
 assert.equal(sql.prepare("SELECT lyrics FROM tracks WHERE id='one'").get().lyrics,'[00:01]기존 가사');
 const profile=(await call('/api/studio/tracks/one')).body.profile;
 assert.equal((await call('/api/studio/tracks/one','PUT',{...profile,lyrics_mode:'synced',lyrics:ready.result_lrc,lyrics_job_id:jid})).status,200);
 assert.equal((await call(path)).body.alignment.state,'applied');
 assert.equal(sql.prepare("SELECT lyrics FROM tracks WHERE id='one'").get().lyrics,ready.result_lrc);
 assert.equal((await call('/api/tracks/one/lyrics/line?at=10')).body.line.text,'다음 가사');
});
test('changing source or choosing manual lyrics invalidates old work; expired leases retry within bounds',async t=>{
 const {call,sql,internal}=await jobsFixture(t),path='/api/studio/tracks/one/lyrics/align';
 await call(path,'POST',source);const old=(await internal('/internal/lyrics/claim')).body.job;
 const changed=(await call(path,'POST',{...source,lyrics_source:'새로운 가사'})).body.alignment;
 assert.notEqual(changed.id,old.id);assert.equal((await internal('/internal/lyrics/'+old.id+'/finish',{timings:[{start:1,end:2},{start:3,end:4}]},old.lease_token)).status,409);
 const profile=(await call('/api/studio/tracks/one')).body.profile;
 assert.equal((await call('/api/studio/tracks/one','PUT',{...profile,lyrics_job_id:old.id})).status,409);
 let job=(await internal('/internal/lyrics/claim')).body.job;
 sql.exec("UPDATE lyric_jobs SET lease_until=0");
 assert.equal((await internal('/internal/lyrics/'+job.id+'/fail',{},job.lease_token)).status,409);
 job=(await internal('/internal/lyrics/claim')).body.job;assert.equal(job.id,changed.id);assert.equal(sql.prepare('SELECT attempts FROM lyric_jobs').get().attempts,2);
 assert.equal((await call('/api/studio/tracks/one','PUT',{...profile,lyrics_mode:'none'})).status,200);
 assert.equal((await internal('/internal/lyrics/'+job.id+'/finish',{timings:[{start:1,end:2}]},job.lease_token)).status,409);assert.equal((await call(path)).body.alignment,null);
 await call(path,'POST',source);await internal('/internal/lyrics/claim');sql.exec('UPDATE lyric_jobs SET attempts=3,lease_until=0');assert.equal((await internal('/internal/lyrics/claim')).body.job,null);assert.equal((await call(path)).body.alignment.state,'failed');
});
test('automatic lyrics submitted during upload wait for audio conversion',async t=>{
 const {call,sql,internal}=await jobsFixture(t);
 const body={title:'가사 자동 싱크',artist:'AI',producer:'Creator',genre:'Rock',ai_tool:'QA',extension:'wav',bytes:128,rights:true,is_ai:true,lyrics_mode:'auto',...source};
 const out=await call('/api/uploads','POST',body);assert.equal(out.status,201);
 const track=sql.prepare('SELECT * FROM tracks WHERE id=?').get(out.body.id);assert.equal(track.lyrics,'');assert.equal(track.lyrics_mode,'none');
 assert.equal((await internal('/internal/lyrics/claim')).body.job,null);
 sql.prepare("UPDATE tracks SET status='published',duration=20 WHERE id=?").run(track.id);
 assert.equal((await internal('/internal/lyrics/claim')).body.job.track_id,track.id);
});
