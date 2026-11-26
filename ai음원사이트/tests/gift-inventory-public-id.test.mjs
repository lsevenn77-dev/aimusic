import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

const request=()=>crypto.randomUUID();
const friend=f=>f.sql.exec("INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES('friend','other','친구',0,1)");
const identity=(f,user)=>f.sql.prepare('SELECT p.code,m.number FROM public_profile_ids p JOIN public_member_ids m ON m.user_id=p.user_id WHERE p.user_id=?').get(user);
const ledger=f=>Object.fromEntries(['public_profile_ids','public_member_ids','gold_purchases','gold_orders','gift_lots','gifts','free_gifts','payout_statements','tracks'].map(table=>[table,f.sql.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]));

test('stored seven-character IDs resolve gift recipients and legacy numeric lookups without changing identity or ledgers',async t=>{
 const f=await fixture(t);friend(f);
 const rows=f.sql.prepare('SELECT code FROM public_profile_ids').all();
 assert.equal(rows.length,f.sql.prepare('SELECT count(*) n FROM users').get().n);
 assert.equal(new Set(rows.map(p=>p.code)).size,rows.length);
 rows.forEach(p=>assert.match(p.code,/^[A-Z]{3}\d{4}$/));
 const stored=identity(f,'other'),before=ledger(f);
 const own=(await f.call('/api/me/profile','GET',undefined,'other')).body.profile;
 assert.equal(own.public_id,stored.code,'the copied profile ID is the persisted receiver ID');
 for(const query of ['public_id='+stored.code,'public_id='+stored.code.toLowerCase(),'public_id='+encodeURIComponent(' '+stored.code+' '),'number='+stored.number,'number='+stored.code]){
  const response=await f.call('/api/me/gift-inventory/recipient?'+query);
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.deepEqual(response.body.profile,{id:'friend',name:'친구',public_number:stored.number,public_id:stored.code});
  assert.equal(response.body.profile.user_id,undefined);
 }
 assert.deepEqual(ledger(f),before,'recipient reads cannot allocate identities or change payment, gift or settlement records');
 await f.call('/api/me/profile','PUT',{name:'변경친구'},'other');
 const renamed=await f.call('/api/me/gift-inventory/recipient?public_id='+stored.code);
 assert.equal(renamed.body.profile.id,'friend');assert.equal(renamed.body.profile.name,'변경친구');assert.deepEqual(identity(f,'other'),stored);
});

test('public ID gift lookup rejects malformed IDs, own profile, blocked and deleted recipients',async t=>{
 const f=await fixture(t);friend(f);
 const own=identity(f,'owner'),other=identity(f,'other'),before=ledger(f);
 for(const value of ['', 'ABC123', 'ABCD1234', '1234567', 'ABC12345', "AAA0000' OR 1=1"]){
  const response=await f.call('/api/me/gift-inventory/recipient?public_id='+encodeURIComponent(value)+'&number='+other.number);
  assert.equal(response.status,400,value);
 }
 assert.equal((await f.call('/api/me/gift-inventory/recipient?public_id='+own.code)).status,404);
 assert.equal((await f.call('/api/me/gift-inventory/recipient?public_id='+other.code,'GET',undefined,null)).status,401);
 assert.deepEqual(ledger(f),before);
 await f.call('/api/blocks/other','PUT');
 assert.equal((await f.call('/api/me/gift-inventory/recipient?public_id='+other.code)).status,403);
 f.sql.exec("DELETE FROM user_blocks; UPDATE users SET provider='deleted' WHERE id='other'");
 assert.equal((await f.call('/api/me/gift-inventory/recipient?public_id='+other.code)).status,404);
});

test('operator reward grants accept stored public codes, remain audited and idempotent, and do not credit paid revenue',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'});friend(f);
 const stored=identity(f,'other'),before=ledger(f);
 const body={public_id:stored.code.toLowerCase(),gift_type:'heart',quantity:2,reason:'운영 테스트',request_id:request()};
 assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',body,'other')).status,403);
 assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',body)).status,200);
 assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',{...body,public_id:stored.code})).status,200);
 const items=(await f.call('/api/me/gift-inventory','GET',undefined,'other')).body.items;
 assert.equal(items.length,2);items.forEach(item=>{assert.equal(item.currency,'reward');assert.equal(item.source,'reward');assert.equal(item.value,0);});
 assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='gift_inventory_grant'").get().n,1);
 assert.deepEqual(ledger(f),before);
 assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',{...body,public_id:'invalid',user_id:'owner',request_id:request()})).status,400,'a malformed explicit code must not fall back to another recipient');
 assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',{public_number:stored.number,gift_type:'heart',quantity:1,reason:'기존 관리자 호환',request_id:request()})).status,200);
 assert.equal((await f.call('/api/me/gift-inventory','GET',undefined,'other')).body.items.length,3);
 assert.deepEqual(ledger(f),before);
});

test('sending inventory to a public-code lookup result preserves original lot settlement and retry behavior',async t=>{
 const f=await fixture(t);friend(f);
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created) VALUES('paid-code','owner','web',100,1000,30,'paid',0)");
 const code=identity(f,'other').code;
 const receiver=(await f.call('/api/me/gift-inventory/recipient?public_id='+code)).body.profile;
 const bought=await f.call('/api/me/gift-inventory/buy','POST',{gift_type:'heart',quantity:1,request_id:request()});assert.equal(bought.status,201);
 const item=bought.body.items[0],body={profile_id:receiver.id,request_id:request()},path='/api/me/gift-inventory/'+item.id+'/send';
 const paidBefore=f.sql.prepare("SELECT used FROM gold_purchases WHERE id='paid-code'").get().used;
 assert.equal((await f.call(path,'POST',body)).status,200);assert.equal((await f.call(path,'POST',body)).status,200);
 assert.equal(f.sql.prepare("SELECT used FROM gold_purchases WHERE id='paid-code'").get().used,paidBefore);
 const gift=f.sql.prepare('SELECT * FROM gifts WHERE id=?').get(item.id),lot=f.sql.prepare('SELECT sum(net_mw) net FROM gift_lots WHERE gift_id=?').get(item.id);
 assert.equal(gift.creator_profile_id,'friend');assert.equal(gift.net_mw,lot.net);assert.equal(gift.creator_mw+gift.platform_mw,gift.net_mw);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts').get().n,1);assert.equal(identity(f,'other').code,code);
});
