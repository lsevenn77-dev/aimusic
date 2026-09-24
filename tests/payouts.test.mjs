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
 // Past earnings: the singer earns 6,000 KRW in January and 5,000 KRW in February; the creator 50,000 KRW in February.
 const gift=(gid,month,singer,creator)=>f.sql.prepare("INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,singer_profile_id,creator_profile_id,singer_mw,creator_mw,platform_mw,month,created) VALUES(?,'owner','one',1,0,?,?,?,?,0,?,0)").run(gid,singer?'singer':null,'producer',singer,creator,month);
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

test('closing a month issues statements at the minimum, carries smaller totals, and records every reveal',async t=>{
 const f=await payoutFixture(t);
 assert.equal((await f.call('/api/admin/payouts','GET',undefined,'owner')).status,404,'operators only');
 assert.equal((await f.call('/api/studio/payout-account','PUT',account)).status,200);
 let out=await f.call('/api/admin/payouts/close','POST',{period:'2020-01'},'admin');
 assert.deepEqual([out.status,out.body.issued,out.body.carried],[201,0,1],'6,000 KRW carries');
 assert.equal((await f.call('/api/admin/payouts/close','POST',{period:'2020-01'},'admin')).status,409);
 assert.equal((await f.call('/api/admin/payouts/close','POST',{period:'2999-01'},'admin')).status,400,'only finished months');
 out=await f.call('/api/admin/payouts/close','POST',{period:'2020-02'},'admin');
 assert.deepEqual([out.body.issued,out.body.due_on],[2,'2020-03-15']);
 const list=(await f.call('/api/admin/payouts?period=2020-02','GET',undefined,'admin')).body.statements;
 const byProfile=Object.fromEntries(list.map(s=>[s.profile,s]));
 assert.deepEqual([byProfile.Singer.from_month,byProfile.Singer.gross_krw,byProfile.Singer.net_krw,byProfile.Singer.status],['2020-01',11000,11000,'held'],'carried January joins February; no account yet');
 assert.deepEqual([byProfile.QA.gross_krw,byProfile.QA.income_tax_krw,byProfile.QA.local_tax_krw,byProfile.QA.net_krw,byProfile.QA.status],[50000,1500,150,48350,'scheduled']);
 // The singer registers later; the held statement becomes payable.
 assert.equal((await f.call('/api/studio/payout-account','PUT',{...account,holder:'가수'},'other')).status,200);
 assert.equal(f.sql.prepare("SELECT status FROM payout_statements WHERE profile_id='singer'").get().status,'scheduled');
 const reveal=(await f.call(`/api/admin/payouts/${byProfile.QA.id}/account`,'GET',undefined,'admin')).body;
 assert.deepEqual(reveal,{holder:'홍길동',bank:'KB국민',account:'123456789015678',resident_number:'9001011234567'});
 assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='payout_account_view'").get().n,1);
 assert.equal((await f.call(`/api/admin/payouts/${byProfile.QA.id}/paid`,'POST',{ref:'국민 이체 0315'},'admin')).status,200);
 assert.equal((await f.call(`/api/admin/payouts/${byProfile.QA.id}/paid`,'POST',{ref:'again'},'admin')).status,409);
 const paid=f.sql.prepare('SELECT status,account_snapshot,paid_ref FROM payout_statements WHERE id=?').get(byProfile.QA.id);
 assert.deepEqual({...paid},{status:'paid',account_snapshot:'KB국민 ****5678 홍길동',paid_ref:'국민 이체 0315'});
 const studio=(await f.call('/api/studio/earnings')).body;
 assert.equal(studio.payout.statements[0].status,'paid');
 assert.deepEqual(studio.months.map(m=>[m.month,m.status]),[['2020-02','settled']]);
});
