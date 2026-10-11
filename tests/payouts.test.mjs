import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {hash} from '../server/auth.js';
import {residentNumber} from '../server/payouts.js';
import {withholding} from '../shared/gifts.js';

const KEY=Buffer.alloc(32,7).toString('base64');
const ADULT='900101-1234567',TODAY=new Date('2026-09-24T03:00:00Z');

test('individual payouts withhold 3.3%, skipping income tax under 1,000 KRW',()=>{
 assert.deepEqual(withholding(50000),{income:1500,local:150,net:48350});
 assert.deepEqual(withholding(33340),{income:1000,local:100,net:32240});
 assert.deepEqual(withholding(30000),{income:0,local:0,net:30000});
});

test('resident numbers are checked for shape, a real birth date, and adulthood',()=>{
 assert.equal(residentNumber(ADULT,TODAY),'9001011234567');
 for(const bad of ['900101-123456','901301-1234567','900230-1234567','900101-9234567'])assert.throws(()=>residentNumber(bad,TODAY),/주민등록번호/);
 assert.throws(()=>residentNumber('080101-3234567',TODAY),/19세 미만/);
 assert.equal(residentNumber('070924-3234567',TODAY),'0709243234567','19th birthday today');
});

async function payoutFixture(t,env={PAYOUT_ENCRYPTION_KEY:KEY,ADMIN_USER_IDS:'admin'}){
 const f=await fixture(t,env);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('singer','other','Singer',0)");
 f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run('admin','admin@example.test','운영자');
 f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash('admin'),'admin',Math.floor(Date.now()/1000)+3600);
 f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('fan','fan@test.test','팬',0)");
 // Past earnings: the singer earns 6,000 KRW in January and 5,000 KRW in February; the creator 50,000 KRW in February.
 const gift=(gid,month,singer,creator)=>f.sql.prepare("INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,singer_profile_id,creator_profile_id,singer_mw,creator_mw,platform_mw,month,created) VALUES(?,'fan','one',1,0,?,?,?,?,0,?,0)").run(gid,singer?'singer':null,'producer',singer,creator,month);
 gift('g1','2020-01',6000000,0);gift('g2','2020-02',5000000,0);gift('g3','2020-02',0,50000000);
 return f;
}
const account={holder:'홍길동',bank:'KB국민',account:'123-4567-8901-5678',resident_number:ADULT,consent:true};

test('payout details open only with earnings, stay encrypted, and are shown masked',async t=>{
 const f=await payoutFixture(t);
 f.sql.exec("DELETE FROM gifts WHERE singer_profile_id='singer'");
 assert.equal((await f.call('/api/studio/payout-account','PUT',account,'other')).status,409,'no earnings, no resident numbers collected');
 assert.equal((await f.call('/api/studio/payout-account','PUT',{...account,consent:false})).status,400);
 assert.equal((await f.call('/api/studio/payout-account','PUT',{...account,bank:'없는 은행'})).status,400);
 const out=await f.call('/api/studio/payout-account','PUT',account);
 assert.equal(out.status,200,JSON.stringify(out.body));
 assert.deepEqual(out.body.account,{holder:'홍길동',bank:'KB국민',account:'****5678',resident:'900101-1******',updated:out.body.account.updated});
 const row=f.sql.prepare("SELECT * FROM payout_accounts WHERE user_id='owner'").get();
 assert.ok(!JSON.stringify(row).includes('12345678901')&&!JSON.stringify(row).includes('1234567'),'no plaintext account or resident number');
 const missingKey=await payoutFixture(t,{});
 assert.equal((await missingKey.call('/api/studio/payout-account','PUT',account)).status,503);
});

test('month close credits diamonds; requested cash preserves account privacy and audited payment',async t=>{
 const f=await payoutFixture(t);
 assert.equal((await f.call('/api/admin/payouts','GET',undefined,'owner')).status,404);
 assert.equal((await f.call('/api/studio/payout-account','PUT',account)).status,200);
 let out=await f.call('/api/admin/payouts/close','POST',{period:'2020-01'},'admin');
 assert.deepEqual([out.status,out.body.credited,out.body.issued],[201,1,0]);
 assert.equal((await f.call('/api/diamonds','GET',undefined,'other')).body.balance,60);
 assert.equal((await f.call('/api/admin/payouts/close','POST',{period:'2020-01'},'admin')).status,409);
 assert.equal((await f.call('/api/admin/payouts/close','POST',{period:'2999-01'},'admin')).status,400);
 out=await f.call('/api/admin/payouts/close','POST',{period:'2020-02'},'admin');
 assert.equal(out.body.credited,2);
 assert.equal((await f.call('/api/diamonds','GET',undefined,'other')).body.balance,110);
 assert.equal((await f.call('/api/diamonds')).body.balance,500);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM payout_statements').get().n,0,'cash is never automatic');
 const paidRequest=await f.call('/api/diamonds/payout','POST',{diamonds:500,request_id:'payout-integration-001'});
 assert.equal(paidRequest.status,201,JSON.stringify(paidRequest));
 const sid=paidRequest.body.id;
 assert.equal(f.sql.prepare('SELECT net_krw FROM payout_statements WHERE id=?').get(sid).net_krw,48350);
 const reveal=(await f.call(`/api/admin/payouts/${sid}/account`,'GET',undefined,'admin')).body;
 assert.deepEqual(reveal,{holder:'홍길동',bank:'KB국민',account:'123456789015678',resident_number:'9001011234567'});
 assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='payout_account_view'").get().n,1);
 assert.equal((await f.call(`/api/admin/payouts/${sid}/paid`,'POST',{ref:'국민 이체 0315'},'admin')).status,200);
 assert.equal((await f.call(`/api/admin/payouts/${sid}/paid`,'POST',{ref:'again'},'admin')).status,409);
 const studio=(await f.call('/api/studio/earnings')).body;
 assert.equal(studio.payout.statements[0].status,'paid');
 assert.deepEqual(studio.months.map(m=>[m.month,m.status]),[['2020-02','settled']]);
 const current=(await f.call('/api/admin/payouts','GET',undefined,'admin')).body;
 assert.equal(current.statements[0].id,sid,'cash request months appear even without a gift close');
});
