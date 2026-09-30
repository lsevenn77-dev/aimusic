import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
const stamp=()=>Math.floor(Date.now()/1000);
test('operator grant targets one account, persists exactly once, and expires normally',async t=>{
 const until=stamp()+30*86400,env={PREMIUM_GRANT:JSON.stringify({id:'test-30',user_id:'owner',until,expires:stamp()+3600})};
 const f=await fixture(t,env);
 assert.equal((await f.call('/api/me','GET',null,'other')).body.membership.plan,'free');
 assert.equal((await f.call('/api/me','GET',null,null)).body.user,null);
 const replies=await Promise.all(Array.from({length:3},()=>f.call('/api/me')));
 assert.ok(replies.every(r=>r.body.membership.plan==='premium'&&r.body.membership.premium_until===until));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,1);
 delete env.PREMIUM_GRANT;
 assert.equal((await f.call('/api/me')).body.membership.premium_until,until);
 f.sql.exec("UPDATE users SET premium_until=1 WHERE id='owner'");
 assert.equal((await f.call('/api/me')).body.membership.plan,'free');
});
test('expired or malformed runtime grants and client fields never grant membership',async t=>{
 for(const setting of ['{',JSON.stringify({id:'late',user_id:'owner',until:stamp()+1000,expires:stamp()-1})]){
  const f=await fixture(t,{PREMIUM_GRANT:setting});assert.equal((await f.call('/api/me')).body.membership.plan,'free');
 }
 const f=await fixture(t);assert.equal((await f.call('/api/me?premium_until=9999999999')).body.membership.plan,'free');
});
test('an already applied grant cannot be replayed after entitlement changes',async t=>{
 const f=await fixture(t,{PREMIUM_GRANT:JSON.stringify({id:'single',user_id:'owner',until:stamp()+86400,expires:stamp()+3600})});
 await f.call('/api/me');f.sql.exec("UPDATE users SET premium_until=1 WHERE id='owner'");
 assert.equal((await f.call('/api/me')).body.membership.plan,'free');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,1);
});
