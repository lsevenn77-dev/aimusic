import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {uploadMonth,uploadQuota} from '../server/upload-limits.js';
const at=()=>Math.floor(Date.now()/1000);
const payload={title:'새 제작곡',artist:'QA',producer:'QA',ai_tool:'QA',rights:true,is_ai:true,karaoke:true,genre:'Rock',extension:'wav',bytes:128};
const setup=t=>fixture(t,{BUCKET:{head:async()=>({size:128})}});
test('monthly quota rolls over at Korean midnight on the first',()=>{
 assert.equal(uploadMonth(Date.parse('2026-09-30T14:59:59Z')/1000).label,'2026-09');
 const month=uploadMonth(Date.parse('2026-09-30T15:00:00Z')/1000);assert.equal(month.label,'2026-10');assert.equal(month.start,Date.parse('2026-09-30T15:00:00Z')/1000);
});
test('free members get five completed originals and abandoned drafts cost no slots',async t=>{
 const f=await setup(t),drafts=[];
 for(let i=0;i<7;i++){const r=await f.call('/api/uploads','POST',payload);assert.equal(r.status,201);drafts.push(r.body.id);}
 assert.equal((await uploadQuota({DB:f.DB},{id:'owner'})).used,0);
 assert.equal((await f.call(`/api/uploads/${drafts[6]}/unpublish`,'POST')).status,409);
 await f.call('/api/uploads/'+drafts[6],'DELETE');assert.equal((await uploadQuota({DB:f.DB},{id:'owner'})).used,0);
 const out=await Promise.all(drafts.slice(0,6).map(id=>f.call(`/api/uploads/${id}/complete`,'POST')));
 assert.equal(out.filter(r=>r.status===200).length,5);assert.equal(out.filter(r=>r.status===429).length,1);
 const used=(await f.call('/api/membership')).body.membership.upload_quota;assert.deepEqual([used.used,used.limit,used.remaining],[5,5,0]);
 await f.call('/api/uploads/'+drafts[0],'DELETE');assert.equal((await f.call('/api/uploads','POST',payload)).status,429);
});
test('missing audio never consumes an upload slot',async t=>{
 const f=await fixture(t,{BUCKET:{head:async()=>null}}),draft=await f.call('/api/uploads','POST',payload);
 assert.equal((await f.call('/api/uploads/'+draft.body.id+'/complete','POST')).status,409);
 assert.equal((await f.call('/api/me')).body.membership.upload_quota.used,0);
});
test('premium gets twenty originals; upgrading retains this month usage and expiry restores free cap',async t=>{
 const f=await setup(t);f.sql.prepare("UPDATE users SET premium_until=? WHERE id='owner'").run(at()+1000);
 for(let i=0;i<20;i++){const r=await f.call('/api/uploads','POST',payload);assert.equal(r.status,201);assert.equal((await f.call('/api/uploads/'+r.body.id+'/complete','POST')).status,200);}
 assert.equal((await f.call('/api/uploads','POST',payload)).status,429);
 f.sql.exec("UPDATE users SET premium_until=1 WHERE id='owner'");
 const q=(await f.call('/api/me')).body.membership.upload_quota;assert.deepEqual([q.limit,q.used,q.remaining],[5,20,0]);
});
test('covers remain unlimited by plan and only free successful cover submissions request an ad',async t=>{
 const f=await setup(t);f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'");
 for(let i=0;i<22;i++){
  const d=await f.call('/api/covers','POST',{original_id:'one',extension:'wav',bytes:128,own_voice:true,rights:true});assert.equal(d.status,201);
  const done=await f.call('/api/uploads/'+d.body.id+'/complete','POST');assert.equal(done.status,200);assert.equal(done.body.show_upload_ad,true);
 }
 assert.equal((await f.call('/api/me')).body.membership.upload_quota.used,0);
 f.sql.prepare("UPDATE users SET premium_until=? WHERE id='owner'").run(at()+1000);
 const d=await f.call('/api/covers','POST',{original_id:'one',extension:'wav',bytes:128,own_voice:true,rights:true});
 assert.equal((await f.call('/api/uploads/'+d.body.id+'/complete','POST')).body.show_upload_ad,false);
});
