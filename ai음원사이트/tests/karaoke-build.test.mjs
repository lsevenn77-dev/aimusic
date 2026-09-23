import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {karaokeLyrics,karaokeWords} from '../shared/karaoke.js';

// Workers-only stream used by storage.put; a pass-through is enough for the in-memory bucket.
globalThis.FixedLengthStream??=class{constructor(){const t=new TransformStream();this.readable=t.readable;this.writable=t.writable;}};

function memoryBucket(){
 const files=new Map();
 return {files,
  async head(key){return files.has(key)?{size:files.get(key).length}:null;},
  async get(key){const b=files.get(key);return b?{body:b,size:b.length}:null;},
  async put(key,body){files.set(key,typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(await new Response(body).arrayBuffer()));},
 };
}
async function karaokeFixture(t){
 const BUCKET=memoryBucket(),f=await fixture(t,{BUCKET});
 f.sql.exec("UPDATE tracks SET duration=20,karaoke_terms='2026-09-24',karaoke_at=1,lyrics='[00:01]처음 가사\n[00:05]다음 가사',lyrics_mode='synced' WHERE id='one'");
 BUCKET.files.set('stream/one.m4a',new Uint8Array([1,2,3]));
 const env={DB:f.DB,BUCKET,TRANSCODER_TOKEN:'internal-test'};
 const internal=async(path,{method='POST',body={},token='',raw}={})=>{const r=await worker.fetch(new Request('https://aifect.test'+path,{method,headers:{Authorization:'Bearer internal-test','x-job-token':token,...(raw?{'content-length':String(raw.length)}:{'Content-Type':'application/json'})},body:method==='GET'?undefined:raw||JSON.stringify(body)}),env,{waitUntil(){}});return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():null};};
 const owner=async(path,{method='GET',raw,user='owner'}={})=>worker.fetch(new Request('https://aifect.test'+path,{method,headers:{Origin:'https://aifect.test',Cookie:'aifect_session='+user,...(raw?{'content-length':String(raw.length)}:{})},body:raw}),env,{waitUntil(){}});
 return {...f,BUCKET,env,internal,owner};
}
const words=[{words:[{t:'처음',s:1,e:1.5},{t:'가사',s:1.5,e:2}]},{words:[{t:'다음',s:5,e:5.4},{t:'가사',s:5.4,e:6}]}];

test('karaoke lyrics come only from the creator synced lyrics and word output must spell them exactly',()=>{
 assert.equal(karaokeLyrics({lyrics_mode:'synced',lyrics:'[00:01]처음 가사\n[00:03]\n[00:05]다음 가사',duration:20}),'처음 가사\n다음 가사');
 assert.equal(karaokeLyrics({lyrics_mode:'none',lyrics:''}),'');
 assert.equal(JSON.parse(karaokeWords('처음 가사\n다음 가사',words,20))[1].s,5);
 for(const bad of [[],[words[0]],[words[0],{words:[{t:'다른',s:5,e:6}]}],[words[1],words[0]],[words[0],{words:[{t:'다음',s:5,e:5.4},{t:'가사',s:25,e:26}]}],[words[0],{words:[{t:'다음',s:5,e:4}]}]])
  assert.throws(()=>karaokeWords('처음 가사\n다음 가사',bad,20));
});

test('consent queues a separation; the worker builds MR and word timings that only the owner can hear',async t=>{
 const {sql,call,internal,owner,BUCKET}=await karaokeFixture(t);
 sql.exec("UPDATE tracks SET karaoke_at=0 WHERE id='one'");
 assert.equal((await call('/api/studio/tracks/one/karaoke','POST',{})).status,409,'no build without consent');
 assert.equal((await call('/api/uploads/one/karaoke','POST',{accept:true})).status,200);
 const job=(await internal('/internal/karaoke/claim')).body.job;
 assert.equal(job.track_id,'one');assert.equal(job.mr_source,'auto');assert.equal(job.mr_ready,0);assert.equal(job.lyrics_text,'처음 가사\n다음 가사');
 assert.equal((await internal('/internal/karaoke/claim')).body.job,null,'one song at a time');
 assert.equal((await internal(`/internal/karaoke/${job.id}/audio`,{method:'GET',token:job.lease_token})).status,200);
 assert.equal((await internal(`/internal/karaoke/${job.id}/finish`,{body:{words},token:job.lease_token})).status,409,'MR must exist before finishing');
 for(const kind of ['vocals','mr'])assert.equal((await internal(`/internal/karaoke/${job.id}/${kind}`,{method:'PUT',token:job.lease_token,raw:new Uint8Array([7,8,9])})).status,200);
 assert.equal((await internal(`/internal/karaoke/${job.id}/finish`,{body:{words:[words[0],words[0]]},token:job.lease_token})).status,400);
 assert.equal((await internal(`/internal/karaoke/${job.id}/finish`,{body:{words},token:'wrong'})).status,409);
 assert.equal((await internal(`/internal/karaoke/${job.id}/finish`,{body:{words,needs_attention:true},token:job.lease_token})).status,200);
 const status=(await call('/api/studio/tracks/one/karaoke')).body.karaoke;
 assert.deepEqual({state:status.state,mr_ready:status.mr_ready,vocals_ready:status.vocals_ready,words_state:status.words_state},{state:'ready',mr_ready:1,vocals_ready:1,words_state:'attention'});
 assert.ok(BUCKET.files.has('karaoke/one/mr.m4a'));
 assert.equal((await owner('/api/studio/tracks/one/karaoke/mr')).status,200);
 assert.equal((await owner('/api/studio/tracks/one/karaoke/mr',{user:'other'})).status,404);
 assert.equal((await call('/api/studio/tracks/one')).body.karaoke.state,'ready');
});

test('lyric edits re-align words on the kept MR; regenerate separates again',async t=>{
 const {sql,call,internal}=await karaokeFixture(t);
 await call('/api/studio/tracks/one/karaoke','POST',{});
 sql.exec("UPDATE karaoke_jobs SET state='ready',mr_ready=1,vocals_ready=1,words='[]',words_state='ready'");
 const profile=(await call('/api/studio/tracks/one')).body.profile;
 assert.equal((await call('/api/studio/tracks/one','PUT',{...profile,title:'제목만 변경'})).status,200);
 assert.equal(sql.prepare('SELECT state FROM karaoke_jobs').get().state,'ready','unchanged lyrics keep the build');
 assert.equal((await call('/api/studio/tracks/one','PUT',{...profile,lyrics:'[00:01]바뀐 가사'})).status,200);
 let job=(await internal('/internal/karaoke/claim')).body.job;
 assert.equal(job.mr_ready,1);assert.equal(job.vocals_ready,1);assert.equal(job.lyrics_text,'바뀐 가사');
 assert.equal((await internal(`/internal/karaoke/${job.id}/vocals`,{method:'GET',token:job.lease_token})).status,404,'vocals are only served once they exist');
 assert.equal((await call('/api/studio/tracks/one/karaoke','POST',{})).status,202);
 job=(await internal('/internal/karaoke/claim')).body.job;
 assert.equal(job.mr_ready,0);assert.equal(job.mr_source,'auto');assert.equal(job.vocals_ready,0);
});

test('creator MR upload replaces separation and a wrong-length file is reported to the creator',async t=>{
 const {sql,internal,owner,BUCKET}=await karaokeFixture(t);
 assert.equal((await owner('/api/studio/tracks/one/karaoke/mr?ext=ogg',{method:'PUT',raw:new Uint8Array(10)})).status,400);
 assert.equal((await owner('/api/studio/tracks/one/karaoke/mr?ext=wav',{method:'PUT',raw:new Uint8Array(10),user:'other'})).status,404);
 assert.equal((await owner('/api/studio/tracks/one/karaoke/mr?ext=wav',{method:'PUT',raw:new Uint8Array(10)})).status,202);
 assert.equal(BUCKET.files.get('karaoke/one/mr-source.wav').length,10);
 const job=(await internal('/internal/karaoke/claim')).body.job;
 assert.equal(job.mr_source,'upload');assert.equal(job.mr_ext,'wav');
 assert.equal((await internal(`/internal/karaoke/${job.id}/mr-source`,{method:'GET',token:job.lease_token})).status,200);
 assert.equal((await internal(`/internal/karaoke/${job.id}/fail`,{body:{reason:'duration_mismatch'},token:job.lease_token})).status,200);
 const row=sql.prepare('SELECT state,error FROM karaoke_jobs').get();
 assert.equal(row.state,'failed');assert.match(row.error,/길이가 원곡과 다릅니다/);
});

test('fresh transcodes rebuild the MR, long songs are refused, unconsented songs never queue',async t=>{
 const {sql,internal,env,BUCKET}=await karaokeFixture(t);
 sql.exec("UPDATE tracks SET status='processing',lease_token='tx',lease_until=9999999999 WHERE id IN ('one','two','three')");
 sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='three'");
 for(const tid of ['one','two','three'])for(const kind of ['stream','preview'])BUCKET.files.set(`${kind}/${tid}.m4a`,new Uint8Array([1]));
 const finish=async(tid,duration)=>(await worker.fetch(new Request(`https://aifect.test/internal/jobs/${tid}/finish`,{method:'POST',headers:{Authorization:'Bearer internal-test','x-job-token':'tx','Content-Type':'application/json'},body:JSON.stringify({duration})}),env,{waitUntil(){}})).status;
 assert.equal(await finish('one',20),200);
 assert.equal(await finish('two',20),200);
 assert.equal(await finish('three',700),200);
 const rows=Object.fromEntries(sql.prepare('SELECT track_id,state,error FROM karaoke_jobs').all().map(r=>[r.track_id,r]));
 assert.equal(rows.one.state,'queued');
 assert.equal(rows.two,undefined,'no consent, no MR');
 assert.equal(rows.three.state,'failed');assert.match(rows.three.error,/10분 이하/);
 const job=(await internal('/internal/karaoke/claim')).body.job;assert.equal(job.track_id,'one');
 assert.equal((await internal('/internal/karaoke/claim')).body.job,null);
});
