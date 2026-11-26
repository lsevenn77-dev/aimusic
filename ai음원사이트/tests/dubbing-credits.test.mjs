import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {dubbingQuota,dubbingDay,reserveDubbingGeneration} from '../server/dubbing-quota.js';

const path='/api/admin/dubbing/script-credits';
async function setup(t){
 const f=await fixture(t,{DUBBING_ENABLED:'true',ADMIN_USER_IDS:'other'});
 f.sql.exec("INSERT INTO account_handles(user_id,normalized) VALUES('owner','코코')");
 return {...f,env:{DB:f.DB},grant(body={}){return f.call(path,'POST',{requestId:crypto.randomUUID(),userId:'owner',amount:3,reason:'운영자 추가 지급',...body},'other');}};
}
test('only administrators can find accounts or grant credits, with exact handle matching',async t=>{
 const f=await setup(t);
 for(const method of ['GET','POST']){
  const url=path+(method==='GET'?'?q=코코':'');
  assert.equal((await f.call(url,method,method==='POST'?{amount:3}:null,null)).status,401);
  assert.equal((await f.call(url,method,method==='POST'?{amount:3}:null)).status,403);
 }
 const found=await f.call(path+'?q=코코','GET',null,'other');
 assert.equal(found.status,200);assert.equal(found.body.account.id,'owner');assert.equal(found.body.account.handle,'코코');
 assert.equal((await f.call(path+'?q=코','GET',null,'other')).status,404);
 assert.doesNotMatch(JSON.stringify(found.body),/@example|email|token/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_script_credits').get().n,0);
});
test('three-credit grant is atomic, audited once, and safely replayable',async t=>{
 const f=await setup(t),requestId=crypto.randomUUID();
 const results=await Promise.all([f.grant({requestId}),f.grant({requestId})]);
 assert.deepEqual(results.map(r=>r.status),[200,200]);
 assert.equal((await dubbingQuota(f.env,'owner')).bonusRemaining,3);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_script_credits').get().n,1);
 const audit=f.sql.prepare("SELECT * FROM admin_audit WHERE action='dubbing-script-credit'").all();
 assert.equal(audit.length,1);assert.equal(audit[0].admin_id,'other');assert.equal(JSON.parse(audit[0].target).amount,3);
 assert.equal((await f.grant({requestId,amount:4})).status,409);
 assert.equal((await f.grant({requestId,userId:'other'})).status,409);
 assert.equal((await dubbingQuota(f.env,'other')).bonusRemaining,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_script_rewards').get().n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM gold_purchases').get().n,0);
});
test('invalid or deleted accounts and invalid amounts never receive credits',async t=>{
 const f=await setup(t);
 for(const amount of [0,-1,21,1.5,'3'])assert.equal((await f.grant({amount})).status,400);
 assert.equal((await f.grant({reason:' '})).status,400);
 assert.equal((await f.grant({requestId:'invalid'})).status,400);
 assert.equal((await f.grant({userId:'missing'})).status,404);
 f.sql.exec("UPDATE users SET provider='deleted' WHERE id='owner'");
 assert.equal((await f.grant()).status,404);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_script_credits').get().n,0);
});
test('daily allowance is used before bonus and concurrent requests cannot exceed three bonus turns',async t=>{
 const f=await setup(t),at=Date.parse('2026-10-20T04:00:00Z')/1000;
 assert.equal((await f.grant()).status,200);
 const first=crypto.randomUUID();assert.ok(await reserveDubbingGeneration(f.env,'owner',first,'script',at));
 assert.equal(f.sql.prepare('SELECT quota_source FROM dubbing_generations WHERE id=?').get(first).quota_source,'daily');
 assert.equal((await dubbingQuota(f.env,'owner',at)).bonusRemaining,3);
 const results=await Promise.all(Array.from({length:8},()=>reserveDubbingGeneration(f.env,'owner',crypto.randomUUID(),'script',at)));
 assert.equal(results.filter(Boolean).length,3);
 const quota=await dubbingQuota(f.env,'owner',at);
 assert.equal(quota.bonusUsed,3);assert.equal(quota.remaining,0);assert.equal(quota.used,4);
 assert.equal(await reserveDubbingGeneration(f.env,'owner',first,'script',at),null);
});
test('unspent bonus survives Korean midnight and failures release the original bonus turn',async t=>{
 const f=await setup(t),at=Date.parse('2026-10-20T14:59:00Z')/1000;
 await f.grant();
 await reserveDubbingGeneration(f.env,'owner',crypto.randomUUID(),'script',at);
 const bonusId=crypto.randomUUID();await reserveDubbingGeneration(f.env,'owner',bonusId,'script',at);
 let quota=await dubbingQuota(f.env,'owner',dubbingDay(at).end);
 assert.equal(quota.bonusRemaining,2);assert.equal(quota.dailyRemaining,1);assert.equal(quota.remaining,3);
 const tomorrow=crypto.randomUUID();await reserveDubbingGeneration(f.env,'owner',tomorrow,'script',dubbingDay(at).end);
 assert.equal(f.sql.prepare('SELECT quota_source FROM dubbing_generations WHERE id=?').get(tomorrow).quota_source,'daily');
 f.sql.prepare("UPDATE dubbing_generations SET state='unknown' WHERE id=?").run(bonusId);
 assert.equal((await dubbingQuota(f.env,'owner',at)).bonusRemaining,2);
 f.sql.prepare("UPDATE dubbing_generations SET result_json='{\"quotaRestored\":true}' WHERE id=?").run(bonusId);
 assert.equal((await dubbingQuota(f.env,'owner',at)).bonusRemaining,3);
 f.sql.prepare("UPDATE dubbing_generations SET result_json=NULL,state='failed' WHERE id=?").run(bonusId);
 assert.equal((await dubbingQuota(f.env,'owner',at)).bonusRemaining,3);
});
