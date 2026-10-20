import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';
import {simpleDubbingText,applySimpleDubbingText,randomDubbingIdea,dubbingTimeline} from '../shared/dubbing.js';
import {dubbingQuota,reserveDubbingGeneration,dubbingDay} from '../server/dubbing-quota.js';
import {pikaSubmit} from '../server/dubbing-pika.js';

test('simple dialogue preserves unchanged line timing, IDs and sound anchors; rejects wrong roles',()=>{
 const s=sampleScript(),scene=s.scenes[0].id;
 assert.deepEqual(applySimpleDubbingText(s,scene,simpleDubbingText(s,scene)),s);
 const changed=applySimpleDubbingText(s,scene,'A: 첫 번째 대사\nB：두 번째 대사\nA: 세 번째 대사');
 assert.equal(changed.lines.length,3);assert.equal(changed.lines[0].id,s.lines[0].id);
 assert.equal(changed.soundCues[0].lineId,s.lines[0].id);
 assert.throws(()=>applySimpleDubbingText(s,scene,'C: 없는 배역'),/배역/);
 assert.throws(()=>applySimpleDubbingText(s,scene,'A: '),/대사/);
 assert.throws(()=>applySimpleDubbingText(s,scene,'화자 없는 글'),/형식/);
 assert.equal(s.lines.length,2,'input is not mutated');
 s.lines[0].text='한 대사 안의\n여러 줄도 유지해요.';
 assert.deepEqual(applySimpleDubbingText(s,scene,simpleDubbingText(s,scene)),s);
});
test('random ideas honor selected genre, cast and length and offer a different suggestion',()=>{
 const opts={genres:['사극'],roleCount:4,minutes:1.5};
 const a=randomDubbingIdea(opts,'',()=>0),b=randomDubbingIdea(opts,a,()=>0);
 assert.match(a,/사극/);assert.match(a,/4명/);assert.match(a,/90초/);assert.notEqual(a,b);
});
test('premium allows exactly three atomic daily generations; Apple entitlement and expiry are honored',async t=>{
 const f=await fixture(t),env={DB:f.DB},at=1792468800;
 f.sql.prepare('UPDATE users SET apple_premium_until=? WHERE id=?').run(at+3600,'owner');
 assert.equal((await dubbingQuota(env,'owner',at)).freeDaily,3);
 const r=await Promise.all(Array.from({length:5},()=>reserveDubbingGeneration(env,'owner',crypto.randomUUID(),'script',at)));
 assert.equal(r.filter(Boolean).length,3);
 assert.equal((await dubbingQuota(env,'owner',at)).remaining,0);
 assert.equal((await dubbingQuota(env,'other',at)).remaining,1);
 assert.equal((await dubbingQuota(env,'owner',at+3600)).freeDaily,1);
 f.sql.prepare('UPDATE users SET premium_until=? WHERE id=?').run(at+86400*3,'owner');
 assert.equal((await dubbingQuota(env,'owner',dubbingDay(at).end)).remaining,3);
});
async function setup(t){
 const bucket=memoryBucket(),f=await fixture(t,{DUBBING_ENABLED:'true',DUBBING_SOUND_ENABLED:'true',DUBBING_RECORDING_ENABLED:'true',BUCKET:bucket,TRANSCODER_TOKEN:'fixture'});
 const script=sampleScript();
 const p=(await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script})).body.project;
 await f.call(`/api/dubbing/projects/${p.id}/publish`,'POST',{revision:1,rightsAccepted:true});
 const key=f.sql.prepare('SELECT script_key FROM dubbing_projects WHERE id=?').get(p.id).script_key;
 await bucket.put('bg',new Uint8Array([1,2,3]));
 f.sql.prepare("INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated) VALUES(?,?,?,'basic',?,'ready','bg',0,0)").run(crypto.randomUUID(),p.id,key,JSON.stringify(dubbingTimeline(script)));
 return {...f,p,bucket};
}
test('completed scripts allow independent new teams, half-empty seats and replay without copying voices',async t=>{
 const f=await setup(t),path=`/api/dubbing/projects/${f.p.id}`;
 f.sql.prepare("UPDATE dubbing_projects SET state='complete' WHERE id=?").run(f.p.id);
 const request={id:crypto.randomUUID(),roleId:'role_1'};
 const start=await f.call(path+'/performances','POST',request,'other');
 assert.equal(start.status,201,JSON.stringify(start));
 assert.equal((await f.call(path+'/performances','POST',request,'other')).body.id,request.id);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_recordings').get().n,0);
 const child=(await f.call('/api/dubbing/projects/'+request.id,'GET',null,'other')).body.project;
 assert.equal(child.roles[0].mine,true);assert.equal(child.roles[1].claimed,false);assert.equal(child.sound.state,'ready');
 assert.equal(child.canEdit,false);assert.equal(child.rootId,f.p.id);
 const joined=await f.call(`/api/dubbing/projects/${request.id}/claims/role_2`,'POST',{revision:child.revision},'owner');
 assert.equal(joined.status,200,JSON.stringify(joined));
 const next=await f.call(path+'/performances','POST',{id:crypto.randomUUID(),roleId:'role_2'},'other');
 assert.equal(next.status,201);
 assert.equal((await f.call('/api/dubbing/projects?tab=open')).body.projects.length,1);
 assert.equal((await f.call('/api/dubbing/projects?tab=complete')).body.projects.length,1);
 assert.equal((await f.call(path)).body.project.versions.length,3);
});
test('only uploader deletes a script; deletion blocks descendants and preserves original financial/recording records',async t=>{
 const f=await setup(t),path=`/api/dubbing/projects/${f.p.id}`,cid=crypto.randomUUID();
 await f.call(path+'/performances','POST',{id:cid,roleId:'role_1'},'other');
 assert.equal((await f.call(path,'DELETE',{revision:2},'other')).status,403);
 assert.equal((await f.call(path,'DELETE',{revision:1})).status,409);
 assert.equal((await f.call(path,'DELETE',{revision:2})).status,200);
 for(const url of [path,`/api/dubbing/projects/${cid}`,`/api/dubbing/projects/${cid}/background`])assert.equal((await f.call(url)).status,404);
 assert.equal((await f.call('/api/dubbing/projects?tab=mine','GET',null,'other')).body.projects.length,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_projects').get().n,2,'soft deletion retains accounting references');
});
test('deleting a performance leaves the reusable script and other teams intact',async t=>{
 const f=await setup(t),path=`/api/dubbing/projects/${f.p.id}`,cid=crypto.randomUUID();
 await f.call(path+'/performances','POST',{id:cid,roleId:'role_1'},'other');
 assert.equal((await f.call('/api/dubbing/projects/'+cid,'DELETE',{revision:1},'other')).status,200);
 assert.equal((await f.call(path)).status,200);
 assert.equal((await f.call(path+'/performances','POST',{id:crypto.randomUUID(),roleId:'role_2'},'other')).status,201);
});
test('Pika rejects authentication and balance failures distinctly; uncertain success is never declared rejected',async()=>{
 const env={DUBBING_SOUND_ENABLED:'true',DUBBING_PAID_API_ENABLED:'true',PIKA_API_KEY:'test'};
 for(const status of [401,402,403,422])await assert.rejects(pikaSubmit(env,sampleScript().soundCues[0],'id',async()=>Response.json({error:{code:'test_error'}},{status})),e=>e.providerRejected&&e.providerStatus===status);
 await assert.rejects(pikaSubmit(env,sampleScript().soundCues[0],'id',async()=>new Response('gateway',{status:502})),e=>!e.providerRejected);
});
test('cover deletion is owner-only; admin snapshot removes covers across users but preserves originals and later uploads',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'});
 f.sql.exec("UPDATE tracks SET kind='cover' WHERE id IN ('one','two');UPDATE tracks SET user_id='other' WHERE id='two'");
 assert.equal((await f.call('/api/uploads/two','DELETE',{},'owner')).status,404);
 assert.equal((await f.call('/api/admin/track-review/covers/purge','GET',null,'other')).status,403);
 const d=(await f.call('/api/admin/track-review/covers/purge')).body;
 assert.equal(d.count,2);
 assert.equal((await f.call('/api/admin/track-review/covers/purge','POST',{...d,confirm:'no'})).status,409);
 const r=await f.call('/api/admin/track-review/covers/purge','POST',{snapshot:d.snapshot,count:d.count,confirm:'DELETE_ALL_COVERS'});
 assert.equal(r.body.deleted,2);assert.equal(f.sql.prepare("SELECT status FROM tracks WHERE id='three'").get().status,'published');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM tracks WHERE kind='cover' AND status!='deleted'").get().n,0);
 assert.equal((await f.call('/api/uploads/one/retry','POST',{})).status,404);
});
