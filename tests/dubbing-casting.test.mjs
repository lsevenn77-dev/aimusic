import test from 'node:test';
import assert from 'node:assert/strict';
import {castingFixture} from './dubbing-casting-fixtures.mjs';
import {CASTING_TTL,expireDubbingCombinations} from '../server/dubbing-casting.js';
for(const n of [2,3,6])test(`${n} roles: real owner base, in-place participation, completion without render, explicit save`,async t=>{
 const f=await castingFixture(t,n);
 assert.equal((await f.call('/api/dubbing/casting/'+f.root)).body.baseReady,false);
 await f.base();let destination;
 for(let i=2;i<=n;i++){
  const d=await f.draft('role_'+i,'actor'+i,destination);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_combinations').get().n,destination?1:0,'no public combination before submission');
  const r=await f.submit(d.pid,'role_'+i,'actor'+i,d.rev);assert.equal(r.status,200,JSON.stringify(r.body));
  destination ||= r.body.casting.combinationId;assert.equal(r.body.casting.combinationId,destination);
  const replay=await f.submit(d.pid,'role_'+i,'actor'+i,d.rev);assert.equal(replay.status,200);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_combinations').get().n,1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_recordings WHERE project_id=?').get(destination).n,i);
 }
 const view=(await f.call('/api/dubbing/casting/'+f.root)).body;
 assert.deepEqual(view.combinations.map(c=>c.count),[n,1]);assert.equal(view.combinations[0].state,'complete');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_final_jobs').get().n,0,'no automatic rendering');
 const completed=await f.call('/api/play/works?type=dubbing');assert.ok(completed.body.works.some(p=>p.id===destination));
 const lines=(await f.call('/api/dubbing/casting/'+destination+'/lines')).body;assert.equal(lines.lines.filter(l=>l.audioUrl).length,f.p.script.lines.length);
 const timing=await f.call('/api/dubbing/casting/'+destination+'/timing','POST',{lineId:lines.lines[0].id,offset:.3},'actor2');assert.equal(timing.status,200);
 assert.equal((await f.call('/api/dubbing/casting/'+destination+'/render','POST',{rightsAccepted:true},'actor3')).status,403);
 assert.equal((await f.call('/api/dubbing/casting/'+destination+'/render','POST',{rightsAccepted:true},'actor2')).status,200);
 const job=f.sql.prepare('SELECT manifest_json FROM dubbing_final_jobs').get();assert.ok(job);assert.equal(JSON.parse(job.manifest_json).lines[0].start,lines.lines[0].start+.3);
 assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('privacy and mandatory consent keep saved voice out of casting',async t=>{
 const f=await castingFixture(t);await f.base();const d=await f.draft('role_2','actor2');
 assert.equal((await f.submit(d.pid,'role_2','actor2',d.rev,{licenseVersion:'wrong'})).status,400);
 const privateSave=await f.submit(d.pid,'role_2','actor2',d.rev,{visibility:'private',rightsAccepted:false});assert.equal(privateSave.status,200);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_combinations').get().n,0);
 assert.equal((await f.call('/api/dubbing/projects/'+d.pid,'GET',null,'other')).status,404);
 assert.equal((await f.call('/api/dubbing/casting/'+f.root+'/lines')).body.lines.filter(l=>l.audioUrl).length,f.p.script.lines.filter(l=>l.roleId==='role_1').length);
 assert.equal((await f.submit(d.pid,'role_2','actor2',d.rev)).status,200);
});
test('competing role submissions preserve loser draft and can retarget to a new combination',async t=>{
 const f=await castingFixture(t,3);await f.base();const first=await f.draft('role_2','actor2');const initial=await f.submit(first.pid,'role_2','actor2',first.rev);const pid=initial.body.casting.combinationId;
 const a=await f.draft('role_3','actor3',pid),b=await f.draft('role_3','actor4',pid);
 const results=await Promise.all([f.submit(a.pid,'role_3','actor3',a.rev),f.submit(b.pid,'role_3','actor4',b.rev)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const loser=results[0].status===409?{...a,user:'actor3'}:{...b,user:'actor4'};
 assert.equal(f.sql.prepare('SELECT state FROM dubbing_recordings WHERE project_id=?').get(loser.pid).state,'draft');
 assert.equal((await f.call('/api/dubbing/casting/'+loser.pid+'/retarget','POST',{targetId:null},loser.user)).status,200);
 assert.equal((await f.submit(loser.pid,'role_3',loser.user,loser.rev)).status,200);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_combinations').get().n,2);
});
test('30 day expiry removes exclusive audio, retains owner shared audio, retries R2 failure',async t=>{
 const f=await castingFixture(t,3);await f.base();const a=await f.draft('role_2','actor2');const pid=(await f.submit(a.pid,'role_2','actor2',a.rev)).body.casting.combinationId;
 const keys=f.sql.prepare('SELECT l.audio_key,r.user_id FROM dubbing_recording_lines l JOIN dubbing_recordings r ON r.id=l.recording_id WHERE r.project_id=?').all(pid);
 const stamp=Math.floor(Date.now()/1000);f.sql.prepare('UPDATE dubbing_combinations SET last_participation=?').run(stamp-CASTING_TTL-1);
 const del=f.env.BUCKET.delete;f.env.BUCKET.delete=async()=>{throw Error('offline');};await expireDubbingCombinations(f.env,stamp);
 assert.ok(f.sql.prepare('SELECT deleted_at FROM dubbing_projects WHERE id=?').get(pid).deleted_at);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_recordings WHERE project_id=?').get(a.pid).n,0);
 assert.ok(f.sql.prepare('SELECT attempts FROM dubbing_audio_cleanup').get().attempts);
 f.env.BUCKET.delete=del;await expireDubbingCombinations(f.env,stamp);
 for(const k of keys)assert.equal(f.env.BUCKET.objects.has(k.audio_key),k.user_id==='owner');
 assert.equal((await f.call('/api/dubbing/casting/'+f.root)).body.combinations.length,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_audio_cleanup').get().n,0);
});

test('private drafts and managed roles cannot bypass casting through legacy publish or claim endpoints',async t=>{
 const f=await castingFixture(t);await f.base();const d=await f.draft('role_2','actor2');
 const p=(await f.call('/api/dubbing/projects/'+d.pid,'GET',null,'actor2')).body.project;
 assert.equal((await f.call('/api/dubbing/projects/'+d.pid+'/publish','POST',{revision:p.revision,rightsAccepted:true},'actor2')).status,409);
 const id=(await f.submit(d.pid,'role_2','actor2',d.rev)).body.casting.combinationId;
 const combo=(await f.call('/api/dubbing/projects/'+id,'GET',null,'actor2')).body.project;
 assert.equal((await f.call('/api/dubbing/projects/'+id+'/claims/role_3','POST',{revision:combo.revision},'actor3')).status,409);
 assert.equal((await f.call('/api/dubbing/casting/'+id+'/lines')).body.canRender,false);
 assert.equal((await f.call('/api/dubbing/casting/'+id+'/render','POST',{rightsAccepted:true},'actor2')).status,403);
});

test('reads and edits do not extend expiry and actual references in a completed work preserve audio',async t=>{
 const f=await castingFixture(t,3);await f.base();const a=await f.draft('role_2','actor2');const incomplete=(await f.submit(a.pid,'role_2','actor2',a.rev)).body.casting.combinationId;
 const b=await f.draft('role_2','actor2');const complete=(await f.submit(b.pid,'role_2','actor2',b.rev)).body.casting.combinationId;
 const c=await f.draft('role_3','actor3',complete);await f.submit(c.pid,'role_3','actor3',c.rev);
 const key=f.sql.prepare("SELECT l.audio_key FROM dubbing_recording_lines l JOIN dubbing_recordings r ON r.id=l.recording_id WHERE r.project_id=? AND r.role_id='role_2'").get(incomplete).audio_key;
 f.sql.prepare("UPDATE dubbing_recording_lines SET audio_key=? WHERE recording_id=(SELECT id FROM dubbing_recordings WHERE project_id=? AND role_id='role_2')").run(key,complete);
 const stamp=Math.floor(Date.now()/1000),old=stamp-CASTING_TTL+10;f.sql.prepare('UPDATE dubbing_combinations SET last_participation=? WHERE project_id=?').run(old,incomplete);
 await f.call('/api/dubbing/casting/'+f.root);await f.call('/api/dubbing/casting/'+incomplete+'/lines');
 assert.equal(f.sql.prepare('SELECT last_participation FROM dubbing_combinations WHERE project_id=?').get(incomplete).last_participation,old);
 await expireDubbingCombinations(f.env,stamp+11);
 assert.equal(f.env.BUCKET.objects.has(key),true);
 assert.equal((await f.call('/api/dubbing/casting/'+complete+'/lines')).status,200);
 assert.equal((await f.call('/api/dubbing/casting/'+incomplete+'/lines')).status,404);
});

test('timing locks after save request and my works classify authors, drafts, makers and cast',async t=>{
 const f=await castingFixture(t,2);await f.base();const d=await f.draft('role_2','actor2');
 assert.equal((await f.call('/api/dubbing/casting/mine?kind=recording','GET',null,'actor2')).body.projects[0].id,d.pid);
 const id=(await f.submit(d.pid,'role_2','actor2',d.rev)).body.casting.combinationId;
 assert.equal((await f.call('/api/dubbing/casting/mine?kind=recording','GET',null,'actor2')).body.projects.length,0);
 assert.equal((await f.call('/api/dubbing/casting/mine?kind=produced','GET',null,'actor2')).body.projects[0].id,id);
 assert.equal((await f.call('/api/dubbing/casting/mine?kind=acted','GET',null,'owner')).body.projects[0].id,id);
 assert.equal((await f.call('/api/dubbing/casting/mine?kind=original')).body.projects[0].id,f.root);
 await f.call('/api/dubbing/casting/'+id+'/render','POST',{rightsAccepted:true},'actor2');
 assert.equal((await f.call('/api/dubbing/casting/'+id+'/timing','POST',{lineId:'line_1',offset:.2},'actor2')).status,409);
});

test('blocked participants and withdrawn original prevent new use; saved drafts remain private',async t=>{
 const f=await castingFixture(t);await f.base();const d=await f.draft('role_2','actor2');const id=(await f.submit(d.pid,'role_2','actor2',d.rev)).body.casting.combinationId;
 f.sql.prepare('INSERT INTO user_blocks(user_id,blocked_id,created) VALUES(?,?,0)').run('actor3','actor2');
 assert.equal((await f.call('/api/dubbing/casting/'+id+'/lines','GET',null,'actor3')).status,404);
 assert.equal((await f.call('/api/dubbing/casting/'+f.root,'GET',null,'actor3')).body.combinations.length,1);
 const draft=await f.draft('role_3','actor4',id);f.sql.prepare("UPDATE dubbing_projects SET visibility='private' WHERE id=?").run(f.root);
 assert.equal((await f.submit(draft.pid,'role_3','actor4',draft.rev)).status,404);
 assert.equal(f.sql.prepare('SELECT state FROM dubbing_recordings WHERE project_id=?').get(draft.pid).state,'draft');
});

test('retarget rejects unrelated, expired and occupied combinations without changing the draft',async t=>{
 const f=await castingFixture(t,3);await f.base();const a=await f.draft('role_2','actor2');
 const target=(await f.submit(a.pid,'role_2','actor2',a.rev)).body.casting.combinationId;
 const d=await f.draft('role_2','actor3'),before=f.sql.prepare('SELECT destination_id FROM dubbing_casting_drafts WHERE project_id=?').get(d.pid).destination_id;
 for(const pid of [target,f.root])assert.equal((await f.call('/api/dubbing/casting/'+d.pid+'/retarget','POST',{targetId:pid},'actor3')).status,409);
 const open=await f.draft('role_3','actor4');f.sql.prepare('UPDATE dubbing_combinations SET last_participation=0 WHERE project_id=?').run(target);
 assert.equal((await f.call('/api/dubbing/casting/'+open.pid+'/retarget','POST',{targetId:target},'actor4')).status,409);
 assert.equal(f.sql.prepare('SELECT destination_id FROM dubbing_casting_drafts WHERE project_id=?').get(d.pid).destination_id,before);
});

test('failed final rendering only restarts after an explicit creator request',async t=>{
 const f=await castingFixture(t,2);await f.base();const a=await f.draft('role_2','actor2');
 const pid=(await f.submit(a.pid,'role_2','actor2',a.rev)).body.casting.combinationId;
 await f.call('/api/dubbing/casting/'+pid+'/render','POST',{rightsAccepted:true},'actor2');
 f.sql.prepare("UPDATE dubbing_final_jobs SET state='failed',attempts=4").run();
 await f.call('/api/dubbing/casting/'+pid+'/lines');
 assert.equal(f.sql.prepare('SELECT state FROM dubbing_final_jobs').get().state,'failed');
 assert.equal((await f.call('/api/dubbing/casting/'+pid+'/render','POST',{rightsAccepted:true},'actor2')).status,200);
 assert.deepEqual({...f.sql.prepare('SELECT state,attempts FROM dubbing_final_jobs').get()},{state:'queued',attempts:0});
});

