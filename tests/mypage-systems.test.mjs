import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {relationProgress} from '../server/relations.js';
const key=()=>crypto.randomUUID();
const friend=f=>f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','친구',0)");
const balance=f=>f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,tax_krw,created,status) VALUES('paid','owner','web',1000,10000,330,909,0,'paid');INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',100)");

test('public member ID backfill preserves existing numbers and is replay-safe',()=>{
 const sql=new DatabaseSync(':memory:');try{
  sql.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER);INSERT INTO users VALUES(\'old\',1),(\'new\',2)');
  const migration=readFileSync(new URL('../drizzle/0064_public_member_ids.sql',import.meta.url),'utf8');
  sql.exec(migration);const before=sql.prepare('SELECT * FROM public_member_ids ORDER BY number').all();sql.exec(migration);assert.deepEqual(sql.prepare('SELECT * FROM public_member_ids ORDER BY number').all(),before);
  assert.throws(()=>sql.exec('UPDATE public_member_ids SET number=999'),/immutable/);assert.throws(()=>sql.exec('DELETE FROM public_member_ids'),/reserved/);
  sql.exec("DELETE FROM users WHERE id='new';INSERT INTO users VALUES('next',3)");assert.equal(sql.prepare("SELECT number FROM public_member_ids WHERE user_id='next'").get().number,3);
 }finally{sql.close();}
});
test('registration, concurrent allocation, nickname and login preserve public identity',async t=>{
 const f=await fixture(t,{AUTH_PEPPER:'local-test-only'});
 const signup=await f.call('/api/auth/register','POST',{email:'member@example.test',name:'신규회원',password:'very-long-test-password'},null);assert.equal(signup.status,200,JSON.stringify(signup.body));
 const member=signup.body.user.id,num=f.sql.prepare('SELECT number FROM public_member_ids WHERE user_id=?').get(member).number;
 await Promise.all(Array.from({length:40},(_,i)=>f.DB.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,?)').bind('parallel-'+i,i+'@example.test','가입자'+i,i).run()));
 const counts=f.sql.prepare('SELECT count(*) n,count(DISTINCT number) unique_n FROM public_member_ids').get();assert.equal(counts.n,counts.unique_n);
 const own=(await f.call('/api/me/profile')).body.profile.public_number;assert.equal(typeof own,'number');
 assert.equal((await f.call('/api/me/profile','PUT',{name:'변경한닉네임',bio:'소개',public_number:99999})).status,200);
 assert.equal((await f.call('/api/me/profile')).body.profile.public_number,own);
 assert.equal((await f.call('/api/producers/producer','GET',null,'other')).body.profile.public_number,own);
 const login=await f.call('/api/auth/login','POST',{email:'member@example.test',password:'very-long-test-password'},null);assert.equal(login.status,200);assert.equal(login.body.user.id,member);assert.equal(f.sql.prepare('SELECT number FROM public_member_ids WHERE user_id=?').get(member).number,num);
});
test('owner-only activity and non-public works/photos cannot be read by visitors',async t=>{
 const f=await fixture(t);friend(f);
 assert.equal((await f.call('/api/me/profile?section=activity','GET',null,null)).status,401);
 const owner=await f.call('/api/producers/producer?dashboard=1'),visitor=await f.call('/api/producers/producer?dashboard=1','GET',null,'other');
 assert.ok(owner.body.tracks.some(t=>t.id==='hidden'));assert.ok(!visitor.body.tracks.some(t=>t.id==='hidden'));assert.equal(visitor.body.profile.player_xp,undefined);assert.ok(visitor.body.tracks.every(t=>t.player_xp===undefined));assert.equal(visitor.body.inventory,undefined);assert.equal(visitor.body.notifications,undefined);
 f.sql.exec("INSERT INTO profile_photos VALUES('private','producer','v1','image/png',0);INSERT INTO profile_photo_privacy VALUES('private',0)");
 assert.equal((await f.call('/api/producers/producer/gallery')).body.photos.length,1);assert.equal((await f.call('/api/producers/producer/gallery','GET',null,'other')).body.photos.length,0);
 assert.equal((await f.call('/media/profile-gallery/private','GET',null,'other')).status,404);
 assert.equal((await f.call('/api/producers/producer/gallery/private','PATCH',{is_public:true},'other')).status,403);
 assert.equal((await f.call('/api/producers/producer/gallery/private','PATCH',{is_public:true})).status,200);
 assert.equal((await f.call('/api/producers/producer/gallery','GET',null,'other')).body.photos.length,1);
});
test('relations need recipient acceptance, two public consents, and bounded server XP',async t=>{
 const f=await fixture(t);friend(f);
 const request=await f.call('/api/me/relations','POST',{profile_id:'friend'});assert.equal(request.status,201);
 const rid=request.body.relations[0].id;
 assert.equal((await f.call('/api/me/relations/'+rid,'PATCH',{action:'accept'})).status,409);
 assert.equal((await f.call('/api/me/relations/'+rid,'PATCH',{action:'accept'},'other')).status,200);
 assert.equal((await f.call('/api/producers/producer','GET',null,null)).body.relations.length,0);
 await f.call('/api/me/relations/'+rid,'PATCH',{action:'share',public:true});assert.equal((await f.call('/api/producers/producer','GET',null,null)).body.relations.length,0);
 await f.call('/api/me/relations/'+rid,'PATCH',{action:'share',public:true},'other');assert.equal((await f.call('/api/producers/producer','GET',null,null)).body.relations.length,1);
 const at=Math.floor(Date.now()/1000);
 for(let i=0;i<5;i++)f.sql.prepare('INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES(?,?,?,?,?,?)').run('msg'+i,'owner','other','test','msg'+i,at);
 assert.equal((await f.call('/api/me/relations')).body.relations[0].xp,5);
 await f.call('/api/blocks/other','PUT');assert.equal((await f.call('/api/producers/producer','GET',null,null)).body.relations.length,0);
 assert.equal(relationProgress(100).level,2);assert.equal(relationProgress(400).level,3);
});
test('gift inventory reserves paid lots once and transfers the original net value on send',async t=>{
 const f=await fixture(t);friend(f);balance(f);const request_id=key();
 const buy=await f.call('/api/me/gift-inventory/buy','POST',{gift_type:'heart',quantity:2,request_id});assert.equal(buy.status,201,JSON.stringify(buy.body));assert.equal(buy.body.items.length,2);
 assert.equal((await f.call('/api/gold/balance')).body.balance,900);
 assert.equal((await f.call('/api/me/gift-inventory/buy','POST',{gift_type:'heart',quantity:2,request_id})).body.items.length,2);assert.equal((await f.call('/api/gold/balance')).body.balance,900);
 assert.equal((await f.call('/api/me/gift-inventory','GET',null,'other')).body.items.length,0);
 const item=buy.body.items[0],sendkey=key(),send=()=>f.call('/api/me/gift-inventory/'+item.id+'/send','POST',{profile_id:'friend',request_id:sendkey});
 const results=await Promise.all([send(),send()]);results.forEach(r=>assert.equal(r.status,200,JSON.stringify(r.body)));
 assert.equal((await f.call('/api/gold/balance')).body.balance,900);assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts').get().n,1);
 const gift=f.sql.prepare('SELECT * FROM gifts').get(),lots=f.sql.prepare('SELECT sum(net_mw) net FROM gift_lots WHERE gift_id=?').get(gift.id);assert.equal(gift.net_mw,lots.net);assert.equal(gift.creator_mw+gift.platform_mw,gift.net_mw);
 assert.equal((await f.call('/api/me/gift-inventory/'+item.id+'/send','POST',{profile_id:'friend',request_id:key()})).status,409);
});
test('silver purchase, free grant, spend races, refund holds and unauthorized grants',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'});friend(f);balance(f);
 const silver=await f.call('/api/me/gift-inventory/buy','POST',{gift_type:'silver-letter',quantity:2,request_id:key()});assert.equal(silver.status,201,JSON.stringify(silver.body));assert.equal((await f.call('/api/gold/balance')).body.silver_balance,96);
 await f.call('/api/me/gift-inventory/'+silver.body.items[0].id+'/send','POST',{profile_id:'friend',request_id:key()});assert.equal((await f.call('/api/gold/balance')).body.silver_balance,96);
 const body={user_id:'owner',gift_type:'heart',quantity:1,reason:'테스트 이벤트',request_id:key()};assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',body,'other')).status,403);assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',body)).status,200);
 const reward=(await f.call('/api/me/gift-inventory')).body.items.find(i=>i.currency==='reward');assert.ok(reward);
 await f.call('/api/me/gift-inventory/'+reward.id+'/send','POST',{profile_id:'friend',request_id:key()});assert.equal(f.sql.prepare('SELECT silver FROM free_gifts WHERE id=?').get(reward.id).silver,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts WHERE id=?').get(reward.id).n,0);
 const race=await Promise.all([1,2].map(()=>f.call('/api/me/gift-inventory/buy','POST',{gift_type:'superstar',quantity:1,request_id:key()})));assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);assert.equal((await f.call('/api/gold/balance')).body.balance,0);
 const gold=(await f.call('/api/me/gift-inventory')).body.items.find(i=>i.currency==='gold');
 f.sql.exec("INSERT INTO gold_orders(id,user_id,request_id,state,created,expires,updated) VALUES('paid','owner','fixture-refund','refund_review',0,1,0)");
 assert.equal((await f.call('/api/me/gift-inventory/'+gold.id+'/send','POST',{profile_id:'friend',request_id:key()})).status,409);assert.equal(f.sql.prepare('SELECT used_at FROM gift_inventory WHERE id=?').get(gold.id).used_at,0);
});
