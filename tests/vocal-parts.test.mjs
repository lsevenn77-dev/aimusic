import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {normalizeVocalParts} from '../shared/vocal-parts.js';
import {analyzeVocalParts,queueVocalParts,vocalPartsNext,readVocalParts} from '../server/vocal-parts.js';
const words=['남자 가사','여자 가사','함께 부르는 가사','모호한 구간'].map((t,i)=>({s:i*3,e:i*3+2,w:[{t,s:i*3,e:i*3+2}]}));
const mixed={arrangement:'mixed_duet',confidence:.96,reason:'두 리드 파트가 번갈아 부름',segments:[{start:0,end:0,part:'male',confidence:.95},{start:1,end:1,part:'female',confidence:.95},{start:2,end:2,part:'both',confidence:.95},{start:3,end:3,part:'female',confidence:.4}]};
const response=(r=mixed)=>Response.json({steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(r)}]}]});
function seed(sql,id='one'){
 sql.prepare('UPDATE tracks SET karaoke_at=1,duration=12 WHERE id=?').run(id);
 sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,words,created,updated) VALUES(?,?,'ready',1,'ready',?,0,0)").run(id,'job-'+id,JSON.stringify(words));
}
const audioBucket={head:async()=>({size:2}),get:async()=>({arrayBuffer:async()=>new Uint8Array([1,2]).buffer})};

test('only confident mixed lead parts are colored; low-confidence lines stay unassigned',()=>{
 assert.deepEqual(normalizeVocalParts(mixed,4).lines,['male','female','both','unknown']);
 for(const arrangement of ['solo','same_gender_group','instrumental'])assert.deepEqual(normalizeVocalParts({...mixed,arrangement},4).lines,[]);
 assert.equal(normalizeVocalParts({...mixed,confidence:.6},4).arrangement,'uncertain');
 assert.equal(normalizeVocalParts({...mixed,segments:[mixed.segments[0]]},4).arrangement,'uncertain');
});
test('out-of-range, duplicate or malformed lyric indices cannot silently color the wrong lines',()=>{
 for(const segments of [[{...mixed.segments[0],end:4}],[mixed.segments[0],mixed.segments[0]],[{...mixed.segments[0],start:-1}],[{...mixed.segments[0],part:'A'}],[{...mixed.segments[0],confidence:'1'}]])assert.throws(()=>normalizeVocalParts({...mixed,segments},4));
});
test('full audio plus exact line timestamps are submitted, with private credentials and sanitized errors',async()=>{
 let request;await analyzeVocalParts({GEMINI_API_KEY:'secret'},new Uint8Array([1,2]),words,{fetcher:async(url,options)=>{request={url,...options};return response();}});
 const payload=JSON.parse(request.body);assert.equal(payload.store,false);assert.equal(payload.input[1].data,'AQI=');assert(payload.input[0].text.includes('same_gender_group'));assert(payload.input[0].text.includes('"line":3'));assert(!request.url.includes('secret'));
 await assert.rejects(analyzeVocalParts({GEMINI_API_KEY:'secret'},new Uint8Array([1]),words,{fetcher:async()=>new Response('secret',{status:500})}),e=>e.status===502&&!e.message.includes('secret'));
});
test('legacy and newly prepared songs queue once; ready results survive refresh and MR is untouched',async t=>{
 const {sql,DB,call}=await fixture(t);seed(sql);const prior=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return response();};t.after(()=>globalThis.fetch=prior);
 const env={DB,GEMINI_API_KEY:'secret',BUCKET:audioBucket};await queueVocalParts(env);await queueVocalParts(env);
 assert.equal(sql.prepare('SELECT count(*) n FROM karaoke_vocal_parts').get().n,1);
 const before=sql.prepare('SELECT * FROM karaoke_jobs').get();
 const results=await Promise.all([vocalPartsNext(env),vocalPartsNext(env)]);assert.equal(results.filter(r=>r.state==='done').length,1);assert.equal(calls,1);
 assert.deepEqual(sql.prepare('SELECT * FROM karaoke_jobs').get(),before);assert.equal((await vocalPartsNext(env)).idle,true);assert.equal(calls,1);
 const song=await call('/api/karaoke/one');assert.equal(song.status,200);assert.deepEqual(song.body.words,words);assert.equal(song.body.mr,'/media/one/mr');assert.deepEqual(song.body.vocal_parts.lines,['male','female','both','unknown']);
 assert.equal((await call('/api/karaoke/one','GET',undefined,null)).status,401);
 assert.equal((await call('/api/karaoke')).body.tracks[0].vocal_parts_status,'done');
});
test('covers, deleted songs, unfinished MR and songs without consent are never queued',async t=>{
 const {sql,DB}=await fixture(t);for(const id of ['one','two','three','hidden'])seed(sql,id);
 sql.exec("UPDATE tracks SET kind='cover' WHERE id='one';UPDATE tracks SET status='deleted' WHERE id='two';UPDATE tracks SET karaoke_at=0 WHERE id='three';UPDATE karaoke_jobs SET state='processing' WHERE track_id='hidden'");
 await queueVocalParts({DB});assert.equal(sql.prepare('SELECT count(*) n FROM karaoke_vocal_parts').get().n,0);
});
test('new timing revision invalidates displayed results and stale analysis cannot overwrite it',async t=>{
 const {sql,DB}=await fixture(t);seed(sql);const prior=globalThis.fetch;t.after(()=>globalThis.fetch=prior);
 const env={DB,GEMINI_API_KEY:'secret',BUCKET:audioBucket};globalThis.fetch=async()=>{sql.exec("UPDATE karaoke_jobs SET id='replacement' WHERE track_id='one'");return response();};
 assert.equal((await vocalPartsNext(env)).stale,'one');assert.equal((await readVocalParts(env,'one')).vocal_parts,null);
 globalThis.fetch=async()=>response();assert.equal((await vocalPartsNext(env)).state,'done');
 sql.exec("UPDATE karaoke_jobs SET id='next-revision' WHERE track_id='one'");assert.equal((await readVocalParts(env,'one')).vocal_parts,null);
});
test('deletion or expired lease during provider request cannot publish labels',async t=>{
 for(const mutation of ["UPDATE tracks SET status='deleted' WHERE id='one'","UPDATE karaoke_vocal_parts SET lease_until=0 WHERE track_id='one'"]){
  const {sql,DB}=await fixture(t);seed(sql);const prior=globalThis.fetch;t.after(()=>globalThis.fetch=prior);globalThis.fetch=async()=>{sql.exec(mutation);return response();};
  assert.equal((await vocalPartsNext({DB,GEMINI_API_KEY:'secret',BUCKET:audioBucket})).stale,'one');assert.equal((await readVocalParts({DB},'one')).vocal_parts,null);
 }
});
test('same-gender groups are excluded and uncertain arrangements remain neutral',async t=>{
 const {sql,DB}=await fixture(t);seed(sql);seed(sql,'two');const prior=globalThis.fetch;t.after(()=>globalThis.fetch=prior);
 const env={DB,GEMINI_API_KEY:'secret',BUCKET:audioBucket};globalThis.fetch=async()=>response({...mixed,arrangement:'same_gender_group',segments:[]});assert.equal((await vocalPartsNext(env)).state,'excluded');
 globalThis.fetch=async()=>response({...mixed,confidence:.5});assert.equal((await vocalPartsNext(env)).state,'review');
 assert.equal((await readVocalParts(env,'one')).vocal_parts,null);assert.equal((await readVocalParts(env,'two')).vocal_parts,null);
});
test('missing/oversized full audio never falls back to preview; provider failures retry only three times',async t=>{
 const {sql,DB}=await fixture(t);seed(sql);seed(sql,'two');const keys=[];const prior=globalThis.fetch;t.after(()=>globalThis.fetch=prior);
 const env={DB,GEMINI_API_KEY:'secret',BUCKET:{head:async k=>{keys.push(k);return {size:15*1024*1024};}}};globalThis.fetch=async()=>{throw Error('should not fetch');};
 assert.equal((await vocalPartsNext(env)).state,'failed');assert.deepEqual(keys,['stream/one.m4a']);
 env.BUCKET=audioBucket;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({steps:[]});};
 for(let i=0;i<3;i++){sql.exec("UPDATE karaoke_vocal_parts SET lease_until=0 WHERE track_id='two'");const r=await vocalPartsNext(env);assert.equal(r.state,i===2?'failed':'queued');}
 assert.equal((await vocalPartsNext(env)).idle,true);assert.equal(calls,3);
});
