import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {analyzeMusic,classifyNext,queueClassification,classificationFields} from '../server/music-classification.js';
import {normalizeClassification} from '../shared/genres.js';

const result={genres:['Funk','Pop'],moods:['energy','drive'],reason:'리듬과 베이스',suggested_genre:''};
const response=()=>Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(result)}]}],usage:{total_input_tokens:150,total_output_tokens:50}});
test('provider receives audio and server key; validates taxonomy and sanitizes provider failures',async()=>{
 let sent;const r=await analyzeMusic({GEMINI_API_KEY:'private-key'},new Uint8Array([1,2]),{fetcher:async(url,options)=>{sent={url,...options};return response();}});
 assert.deepEqual(r.genres,result.genres);assert.equal(sent.headers['x-goog-api-key'],'private-key');assert(!sent.url.includes('private-key'));assert.equal(JSON.parse(sent.body).store,false);assert.equal(JSON.parse(sent.body).input[1].mime_type,'audio/m4a');
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
