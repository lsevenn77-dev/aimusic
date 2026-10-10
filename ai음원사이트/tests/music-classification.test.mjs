import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {analyzeMusic,classifyNext,queueClassification,classificationFields,musicClassificationInternal} from '../server/music-classification.js';
import {normalizeClassification} from '../shared/genres.js';

const result={genres:['Funk','Pop'],moods:['energy','drive'],reason:'리듬과 베이스',suggested_genre:''};
const response=()=>Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(result)}]}],usage:{total_input_tokens:150,total_output_tokens:50,total_thought_tokens:20,total_cached_tokens:0}});
test('provider receives audio and server key; validates taxonomy and sanitizes provider failures',async()=>{
 let sent;const r=await analyzeMusic({GEMINI_API_KEY:'private-key'},new Uint8Array([1,2]),{fetcher:async(url,options)=>{sent={url,...options};return response();}});
 assert.deepEqual(r.genres,result.genres);assert.equal(sent.headers['x-goog-api-key'],'private-key');assert(!sent.url.includes('private-key'));assert.equal(JSON.parse(sent.body).store,false);assert.equal(JSON.parse(sent.body).input[1].mime_type,'audio/m4a');
 assert.equal(r.usage.thought,20,'billing records include separately billed thinking tokens');
 assert.throws(()=>normalizeClassification({...result,genres:['made-up']}));assert.throws(()=>normalizeClassification({...result,moods:['not-a-mood']}));
 await assert.rejects(analyzeMusic({GEMINI_API_KEY:'private-key'},new Uint8Array([1]),{fetcher:async()=>new Response('private-key provider detail',{status:403})}),e=>e.status===502&&!e.message.includes('private-key'));
});
test('secondary genres and multiple moods are searchable; unrelated tags do not decide moods',async t=>{
 const {call,sql}=await fixture(t);
 sql.prepare("UPDATE tracks SET genre='Funk',genres_json=?,moods_json=?,tags='수면 집중' WHERE id='one'").run(JSON.stringify(result.genres),JSON.stringify(result.moods));
 const tracks=(await call('/api/catalog?genre=Pop')).body.tracks;assert.deepEqual(tracks.map(x=>x.id),['one']);assert.deepEqual(tracks[0].genres,['Funk','Pop']);
 for(const mood of ['energy','drive'])assert((await call('/api/discovery?mood='+mood)).body.tracks.some(t=>t.id==='one'));
 assert(!(await call('/api/discovery?mood=sleep')).body.tracks.some(t=>t.id==='one'));
 assert((await call('/api/catalog?genre=Rock')).body.tracks.some(t=>t.id==='two'));
 assert.equal((await call('/api/admin/music-classification')).status,403);
 assert.equal((await call('/internal/music-classification/enqueue','POST',{})).status,401);
});
test('queued analysis is exclusive, preserves prior metadata and tags, and uses persisted cache',async t=>{
 const {sql,DB}=await fixture(t);const prior=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return response();};t.after(()=>globalThis.fetch=prior);
 const env={DB,GEMINI_API_KEY:'private-key',BUCKET:{head:async()=>({size:2,etag:'same-audio'}),get:async()=>({arrayBuffer:async()=>new Uint8Array([1,2]).buffer})}};
 sql.exec("UPDATE tracks SET tags='keep this' WHERE id='one'");await queueClassification(env,'one');
 const [a,b]=await Promise.all([classifyNext(env),classifyNext(env)]);assert.equal([a,b].filter(x=>x.id==='one').length,1);assert.equal(calls,1);
 let row=sql.prepare("SELECT * FROM tracks WHERE id='one'").get();assert.equal(row.genre,'Funk');assert.equal(row.tags,'keep this');
 const history=sql.prepare("SELECT * FROM music_classification_history WHERE track_id='one'").get();assert.equal(JSON.parse(history.before_json).genre,'Rock');
 await queueClassification(env,'one');assert.equal((await classifyNext(env)).cached,true);assert.equal(calls,1);
});
test('manual edit or deletion during analysis wins over a late response',async t=>{
 const {sql,DB}=await fixture(t);const prior=globalThis.fetch;t.after(()=>globalThis.fetch=prior);
 const env={DB,GEMINI_API_KEY:'private-key',BUCKET:{head:async()=>({size:2,etag:'new'}),get:async()=>({arrayBuffer:async()=>new Uint8Array([1,2]).buffer})}};
 globalThis.fetch=async()=>{sql.exec("UPDATE tracks SET genre='Jazz',classification_revision=classification_revision+1 WHERE id='one'");return response();};
 await queueClassification(env,'one');assert.equal((await classifyNext(env)).skipped,'one');assert.equal(sql.prepare("SELECT genre FROM tracks WHERE id='one'").get().genre,'Jazz');assert.equal(sql.prepare('SELECT count(*) n FROM music_classification_history').get().n,0);
});
test('malformed AI output retries without changing a track; missing audio is terminal',async t=>{
 const {sql,DB}=await fixture(t);const prior=globalThis.fetch;t.after(()=>globalThis.fetch=prior);globalThis.fetch=async()=>Response.json({steps:[]});
 const env={DB,GEMINI_API_KEY:'private-key',BUCKET:{head:async()=>({size:2,etag:'bad'}),get:async()=>({arrayBuffer:async()=>new Uint8Array([1,2]).buffer})}};
 await queueClassification(env,'one');assert.equal((await classifyNext(env)).retry,true);assert.equal(sql.prepare("SELECT genre FROM tracks WHERE id='one'").get().genre,'Rock');
 await queueClassification(env,'two');env.BUCKET.head=async()=>null;assert.equal((await classifyNext(env)).retry,false);assert.equal(sql.prepare("SELECT state FROM music_classification_jobs WHERE track_id='two'").get().state,'failed');
});
test('upload and edit accept multiple fields and preserve legacy single-genre callers',()=>{
 assert.deepEqual(classificationFields({genres:['Jazz','Soul'],moods:['night','comfort']}),{genres:['Jazz','Soul'],moods:['night','comfort']});
 assert.equal(classificationFields({genre:'Pop'},{genre:'Rock',genres_json:'["Rock"]'}).genres[0],'Pop');
 assert.throws(()=>classificationFields({genres:['Rock','Pop','Funk','Soul']}));
 assert.deepEqual(classificationFields({}).genres,['분석 대기']);
});

test('new covers inherit all original labels; manual original edits update covers without analysis',async t=>{
 const {sql,call,DB}=await fixture(t);
 sql.prepare("UPDATE tracks SET karaoke_at=1,genre='Funk',genres_json=?,moods_json=? WHERE id='one'").run(JSON.stringify(result.genres),JSON.stringify(result.moods));
 const uploaded=await call('/api/covers','POST',{original_id:'one',own_voice:true,rights:true,extension:'wav',bytes:128});
 assert.equal(uploaded.status,201,JSON.stringify(uploaded.body));const tid=uploaded.body.id;
 let cover=sql.prepare('SELECT * FROM tracks WHERE id=?').get(tid);
 assert.deepEqual(JSON.parse(cover.genres_json),result.genres);assert.deepEqual(JSON.parse(cover.moods_json),result.moods);assert.equal(cover.classification_source,'original');
 assert.deepEqual(await queueClassification({DB},tid),{inherited:true});assert.equal(sql.prepare('SELECT count(*) n FROM music_classification_jobs').get().n,0);
 const original=(await call('/api/studio/tracks/one')).body.profile;
 assert.equal((await call('/api/studio/tracks/one','PUT',{...original,genre:'Jazz',genres:['Jazz','Soul'],moods:['night']})).status,200);
 cover=sql.prepare('SELECT * FROM tracks WHERE id=?').get(tid);assert.equal(cover.genre,'Jazz');assert.deepEqual(JSON.parse(cover.genres_json),['Jazz','Soul']);assert.deepEqual(JSON.parse(cover.moods_json),['night']);
});

test('old cover jobs never call Gemini; bulk enqueue cancels their leases and inherits original labels',async t=>{
 const {sql,DB,call}=await fixture(t);sql.exec("UPDATE tracks SET kind='cover',original_id='one' WHERE id='two'; INSERT INTO music_classification_jobs(track_id,state,updated) VALUES('two','queued',0)");
 const env={DB,GEMINI_API_KEY:'private-key',MUSIC_CLASSIFICATION_ADMIN_TOKEN:'admin-test',BUCKET:{head(){throw Error('Cover audio must not be read')}}};
 assert.deepEqual(await classifyNext(env),{idle:true});
 const res=await musicClassificationInternal(new Request('https://aifect.test/internal/music-classification/enqueue',{method:'POST',headers:{authorization:'Bearer admin-test'}}),env,'/internal/music-classification/enqueue');
 assert.equal(res.status,200);assert.equal(sql.prepare("SELECT count(*) n FROM music_classification_jobs WHERE state='queued'").get().n,3);assert.equal(sql.prepare("SELECT state FROM music_classification_jobs WHERE track_id='two'").get().state,'inherited');
 const cover=(await call('/api/studio/tracks/two/classification','POST',{}));assert.deepEqual(cover.body,{inherited:true});
 assert.equal(sql.prepare("SELECT classification_source FROM tracks WHERE id='two'").get().classification_source,'original');
});

test('a single original AI result also updates linked solo and duet covers',async t=>{
 const {sql,DB}=await fixture(t);sql.exec("UPDATE tracks SET kind='cover',original_id='one' WHERE id IN ('two','three'); UPDATE tracks SET cover_mode='duet',duet_parent_id='two' WHERE id='three'");
 const prior=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return response();};t.after(()=>globalThis.fetch=prior);
 const env={DB,GEMINI_API_KEY:'private-key',BUCKET:{head:async()=>({size:2,etag:'original'}),get:async()=>({arrayBuffer:async()=>new Uint8Array([1,2]).buffer})}};
 await queueClassification(env,'one');await classifyNext(env);assert.equal(calls,1);
 for(const row of sql.prepare("SELECT * FROM tracks WHERE kind='cover'").all()){assert.deepEqual(JSON.parse(row.genres_json),result.genres);assert.deepEqual(JSON.parse(row.moods_json),result.moods);assert.equal(row.classification_source,'original');}
});
