import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('dashboard and private search require a full admin, not only a track moderator',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner',TRACK_REVIEW_USER_IDS:'other'});
 for(const path of ['/api/admin/dashboard','/api/admin/dashboard/search?q=owner','/api/admin/dashboard/members']){
  assert.equal((await f.call(path,'GET',null,'')).status,401);
  assert.equal((await f.call(path,'GET',null,'other')).status,403);
  assert.equal((await f.call(path)).status,200);
 }
 assert.equal((await f.call('/api/admin/dashboard','POST',{})).status,405);
});

test('member directory filters Korean signup dates and current Premium and pages equal timestamps',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'}),at=Math.floor(Date.now()/1000);
 const midnight=Math.floor((at+32400)/86400)*86400-32400;
 const day=new Date((midnight+32400)*1000).toISOString().slice(0,10);
 const insert=f.sql.prepare('INSERT INTO users(id,name,email,provider,created,premium_until,apple_premium_until) VALUES(?,?,?,?,?,?,?)');
 for(let i=0;i<52;i++)insert.run('member-'+i,'이메일 회원','user'+i+'@example.test','email',midnight,0,0);
 insert.run('ios','private name','hidden@example.test','apple',midnight-1,0,at+3600);
 insert.run('play','subscriber','play@example.test','email',midnight,at+3600,0);
 insert.run('expired','expired','expired@example.test','email',midnight-1,at-1,0);
 insert.run('removed','removed','removed@example.test','deleted',midnight,at+3600,0);
 f.sql.prepare("INSERT INTO users(id,name,email,provider,account_type,created) VALUES('ai_9001','테스트 봇','bot@example.test','ai_service','ai_bot',?)").run(midnight);
 const get=async query=>(await f.call('/api/admin/dashboard/members?'+query)).body;
 const first=await get('group=today'),second=await get('group=today&cursor='+encodeURIComponent(first.next_cursor));
 const ids=[...first.members,...second.members].map(row=>row.id);
 assert.equal(first.members.length,50);assert.equal(second.next_cursor,null);
 assert.equal(ids.length,53);assert.equal(new Set(ids).size,53);
 assert(!ids.includes('ios')&&!ids.includes('removed')&&!ids.includes('ai_9001'));
 assert.deepEqual((await get('group=all&day='+day)).members,first.members);
 const premium=(await get('group=premium')).members;
 assert.deepEqual(premium.map(row=>row.id),['play','ios']);
 assert.match(premium[0].public_id,/^[A-Z]{3}\d{4}$/);assert.equal(premium[0].login_email,'play@example.test');
 assert.equal(premium[1].login_email,null);
 assert.equal((await f.call('/api/admin/dashboard')).body.summary.today_users,53);
 for(const q of ['group=wrong','day=2025-02-30','cursor=invalid'])
  assert.equal((await f.call('/api/admin/dashboard/members?'+q)).status,400);
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
