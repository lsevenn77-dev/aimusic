import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('dashboard and private search require a full admin, not only a track moderator',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner',TRACK_REVIEW_USER_IDS:'other'});
 for(const path of ['/api/admin/dashboard','/api/admin/dashboard/search?q=owner']){
  assert.equal((await f.call(path,'GET',null,'')).status,401);
  assert.equal((await f.call(path,'GET',null,'other')).status,403);
  assert.equal((await f.call(path)).status,200);
 }
 assert.equal((await f.call('/api/admin/dashboard','POST',{})).status,405);
});

test('dashboard reads real tables and separates paid purchases from diamond exchanges, free and refunded gold',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'}),at=Math.floor(Date.now()/1000);
 const lot=(id,channel,price,status='paid')=>f.sql.prepare('INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,tax_krw,status,created,paid_at) VALUES(?,\'owner\',?,500,?,100,50,?,?,?)').run(id,channel,price,status,at,at);
 lot('web','web',5500);lot('app','google_play',6500);lot('ios','apple',6500);
 lot('exchange','diamond',50000);lot('test','google_play',0);lot('refund','web',5500,'refunded');
 f.sql.prepare("UPDATE users SET created=?,premium_until=? WHERE id='owner'").run(at,at+3600);
 f.sql.prepare("INSERT INTO listens(id,track_id,listener,started,day,qualified) VALUES('ok','one','other',?,'2026-10-12',1),('short','two','other',?,'2026-10-12',0)").run(at,at);
 const {status,body}=await f.call('/api/admin/dashboard?days=30');
 assert.equal(status,200,JSON.stringify(body));
 assert.equal(body.days,30);assert.equal(body.summary.users,2);assert.equal(body.summary.new_users,1);
 assert.equal(body.summary.active_subscribers,1);assert.equal(body.summary.published_tracks,3);
 assert.equal(body.summary.qualified_plays,1);assert.equal(body.top_tracks[0].id,'one');
 assert.deepEqual([body.revenue.gold_gross_krw,body.revenue.gold_orders,body.revenue.gold_fee_krw,body.revenue.gold_tax_krw],[18500,3,300,150]);
 assert.deepEqual(body.recent_gold.map(x=>x.id).sort(),['app','ios','web']);
 for(const days of [7,90])assert.equal((await f.call('/api/admin/dashboard?days='+days)).body.days,days);
 assert.equal((await f.call('/api/admin/dashboard?days=99999')).body.days,7);
});

test('admin search excludes deleted accounts and handles SQL metacharacters as input',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'});
 f.sql.exec("INSERT INTO users(id,name,email,created,provider) VALUES('gone','owner gone','gone@example.test',0,'deleted')");
 const result=await f.call('/api/admin/dashboard/search?q=owner');
 assert.equal(result.status,200);assert.deepEqual(result.body.users.map(x=>x.id),['owner']);
 assert.deepEqual((await f.call('/api/admin/dashboard/search?q='+encodeURIComponent("' OR 1=1 --"))).body.users,[]);
 assert.equal((await f.call('/api/admin/dashboard/search?q=x')).body.users.length,0);
});
