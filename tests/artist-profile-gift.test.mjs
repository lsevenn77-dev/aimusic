import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('artist preview uses its public creator and artist follow state',async t=>{
 const f=await fixture(t);
 f.sql.exec("UPDATE artists SET bio='등록된 소개글' WHERE id='artist'");
 await f.call('/api/artists/artist/follow','PUT',null,'other');
 const {body:d}=await f.call('/api/artist-preview/artist','GET',null,'other');
 assert.equal(d.profile.bio,'등록된 소개글');
 assert.equal(d.profile.producer_name,'QA');
 assert.equal(d.profile.producer_id,'producer');assert.equal(d.following,true);assert.equal(d.followers,1);
});
test('artist gifts credit one creator, bind their source and replay a concurrent send once',async t=>{
 const f=await fixture(t),path='/api/producers/producer/gifts';
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('lot','other','web',100,1000,0,'paid',1,1); INSERT INTO producers(id,user_id,name,created) VALUES('wrong','other','다른 제작자',0); INSERT INTO artists(id,producer_id,name,created) VALUES('sibling','producer','다른 아티스트',0); INSERT INTO free_gift_wallets(user_id,balance) VALUES('other',10)");
 const gift={artist_id:'artist',gift_type:'lollipop',request_id:crypto.randomUUID()};
 const send=b=>f.call(path,'POST',b,'other');
 const [first,retry]=await Promise.all([send(gift),send(gift)]);
 assert.deepEqual([first.status,retry.status].sort(),[200,201]);
 assert.equal(first.body.gift.id,retry.body.gift.id);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts').get().n,1);
 assert.equal(f.sql.prepare('SELECT creator_profile_id FROM gifts').get().creator_profile_id,'producer');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gift_lots').get().n,1);
 assert.deepEqual({...f.sql.prepare('SELECT source_type,source_id FROM gift_sources').get()},{source_type:'artist',source_id:'artist'});
 assert.equal((await send({...gift,artist_id:'sibling'})).status,409);
 assert.equal((await send({...gift,gift_type:'star'})).status,409);
 const silver={...gift,gift_type:'star',request_id:crypto.randomUUID()};
 assert.equal((await send(silver)).status,201);assert.equal((await send(silver)).status,200);
 assert.equal((await send({...silver,gift_type:'lollipop'})).status,409);
 assert.equal(f.sql.prepare('SELECT recipient_profile_id FROM free_gifts').get().recipient_profile_id,'producer');
 assert.equal(f.sql.prepare('SELECT balance FROM free_gift_wallets WHERE user_id=?').get('other').balance,9);
 assert.equal((await f.call('/api/producers/wrong/gifts','POST',{...gift,request_id:crypto.randomUUID()},'owner')).status,400);
 f.sql.exec("INSERT INTO artist_follow_blocks VALUES('artist','other','fan',1)");
 assert.equal((await send({...gift,request_id:crypto.randomUUID()})).status,403);
});
test('crew badges advance at the supplied levels; members without a crew have no badge',async t=>{
 const f=await fixture(t),path='/api/producers/producer/preview';
 assert.equal((await f.call(path)).body.crew,null);
 const {body:{crew}}=await f.call('/api/crews','POST',{name:'배지 확인'});
 for(const [index,tier] of [1,2,2,4,4,6,6,8,9,10].entries()){
  f.sql.prepare('UPDATE crews SET highest_level=? WHERE id=?').run(index+1,crew.id);
  const c=(await f.call(path)).body.crew;
  assert.equal(c.level,index+1);assert.equal(c.badge_url,'/assets/crew-badges/lv'+tier+'.webp');
 }
});
