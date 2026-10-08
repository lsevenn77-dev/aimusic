import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {profileGifts} from '../server/gifts.js';
import {allocateLots,splitGift,includedKoreanVat} from '../shared/gifts.js';

test('new tax reserve and channel fees are deducted once while historical lots preserve their value',()=>{
 const web={id:'web',gold:1000,used:0,price_krw:10000,fee_krw:400,tax_krw:includedKoreanVat(10000)},app={...web,id:'app',fee_krw:1500};
 assert.equal(web.tax_krw,909);assert.equal(allocateLots([web],1000)[0].net_mw,8691000);assert.equal(allocateLots([app],1000)[0].net_mw,7591000);
 assert.equal(splitGift('original',8691000).creator,6083700);
 assert.equal(allocateLots([{...app,tax_krw:0}],1000)[0].net_mw,8500000,'legacy purchases keep their original terms');
 const mixed=allocateLots([{...web,used:500},app],700);assert.deepEqual(mixed.map(x=>[x.purchase_id,x.gold,x.net_mw]),[['web',500,4345500],['app',200,1518200]]);
});

async function setup(t){
 const f=await fixture(t);f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('person','other','코코',0); INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('lot','owner','web',1000,10000,1500,'paid',1,1)");return f;
}
test('a person with no songs receives gold and stars, retries spend once and payouts keep the existing split',async t=>{
 const f=await setup(t),path='/api/producers/person/gifts',request={gift_type:'heart',request_id:crypto.randomUUID()};
 const first=await f.call(path,'POST',request);assert.equal(first.status,201,JSON.stringify(first.body));
 const retry=await f.call(path,'POST',request);assert.equal(retry.body.gift.id,first.body.gift.id);assert.equal(retry.body.balance,950);
 const g=f.sql.prepare('SELECT * FROM gifts').get();assert.deepEqual([g.track_id,g.creator_profile_id,g.net_mw,g.creator_mw,g.platform_mw],[null,'person',425000,297500,127500]);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gift_lots').get().n,1);
 assert.equal((await f.call('/api/tracks/one/gifts','POST',request,'other')).status,409,'recipient with no funds cannot send');
 await f.call('/api/gifts/free/claim','POST',{kind:'checkin'});
 const free={gift_type:'star',request_id:crypto.randomUUID()};assert.equal((await f.call(path,'POST',free)).body.free_balance,2);assert.equal((await f.call(path,'POST',free)).body.free_balance,2);
 assert.equal(f.sql.prepare('SELECT recipient_profile_id FROM free_gifts').get().recipient_profile_id,'person');
 const ranking=(await f.call(path)).body;assert.equal(ranking.ranking[0].score,51);assert.equal(ranking.total_gold,50);assert.equal(ranking.free_count,1);
 const wallet=(await f.call('/api/gold')).body;assert.equal(wallet.sent[0].track_id,null);assert.equal(wallet.sent[0].recipient_profile_id,'person');assert.equal(wallet.free_sent[0].recipient_profile_id,'person');
 assert.equal((await f.call('/api/studio/earnings','GET',null,'other')).body.months[0].creator_krw,297);
 assert.deepEqual(f.sql.prepare('SELECT kind,target FROM push_outbox ORDER BY id').all().map(x=>[x.kind,x.target]),[['person_gift','person'],['person_gift','person']]);
});
test('personal gifts enforce recipient, authentication, blocking and idempotency boundaries',async t=>{
 const f=await setup(t),req={gift_type:'note',request_id:crypto.randomUUID()},path='/api/producers/person/gifts';
 assert.equal((await f.call(path,'POST',req,null)).status,401);
 assert.equal((await f.call(path,'POST',req,'other')).status,400);
 assert.equal((await f.call('/api/producers/missing/gifts','POST',req)).status,404);
 f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('third','third@example.test','third',0); INSERT INTO producers(id,user_id,name,created) VALUES('third-p','third','third',0)");
 assert.equal((await f.call(path,'POST',req)).status,201);
 assert.equal((await f.call('/api/producers/third-p/gifts','POST',req)).status,409);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('other','owner',1)");
 assert.equal((await f.call(path,'POST',{...req,request_id:crypto.randomUUID()})).status,403);
 f.sql.exec("DELETE FROM user_blocks; UPDATE users SET provider='deleted' WHERE id='other'");assert.equal((await f.call(path,'POST',req)).status,404);
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,10);
});
test('profile fan ranking combines personal and song gifts and returns only the top 50',async t=>{
 const f=await setup(t);const donor=f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)'),gift=f.sql.prepare("INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,creator_profile_id,creator_mw,platform_mw,month,created) VALUES(?,?,NULL,?,0,'person',0,0,'2026-10',1)");
 for(let i=1;i<=55;i++){donor.run('fan'+i,'fan'+i+'@example.test','팬'+i);gift.run('gift'+i,'fan'+i,i);}
 f.sql.exec("INSERT INTO producers(id,user_id,name,image_version,created) VALUES('fan-profile','fan55','상위 팬','v1',0)");
 const r=await profileGifts({DB:f.DB},'person');assert.equal(r.ranking.length,50);assert.equal(r.ranking[0].gold,55);assert.equal(r.ranking[0].profile_id,'fan-profile');assert.equal(r.ranking[0].image_version,'v1');assert.equal(r.ranking[49].gold,6);assert.equal(r.ranking[49].rank,50);
 assert.equal((await profileGifts({DB:f.DB},'producer')).ranking.length,0);
});
test('crew names are display-only and mute is per member without hiding unread messages',async t=>{
 const f=await setup(t),cid=(await f.call('/api/crews','POST',{name:'양꼬치'})).body.crew.id,path='/api/crews/'+cid;
 assert.equal((await f.call(path+'/settings','PUT',{muted:true},'other')).status,403);
 await f.call(path+'/join','POST',{},'other');
 const p=(await f.call('/api/producers/person')).body.profile;assert.equal(p.name,'코코');assert.equal(p.display_name,'코코(양꼬치)');
 assert.equal(f.sql.prepare("SELECT name FROM producers WHERE id='person'").get().name,'코코');
 assert.equal((await f.call(path+'/settings','PUT',{muted:'yes'},'other')).status,400);
 assert.equal((await f.call(path+'/settings','PUT',{muted:true},'other')).body.muted,true);
 assert.equal((await f.call(path+'/settings','GET',null,'other')).body.muted,true);assert.equal((await f.call(path+'/settings')).body.muted,false);
 await f.call(path+'/messages','POST',{body:'조용한 알림',request_id:crypto.randomUUID()});
 assert.equal(f.sql.prepare("SELECT count(*) n FROM push_outbox WHERE kind='crew'").get().n,0);
 const summary=(await f.call('/api/dm/summary','GET',null,'other')).body;assert.equal(summary.crew.muted,1);assert.equal(summary.crew.unread,1);
 await f.call(path+'/settings','PUT',{muted:false},'other');
 const req={body:'다시 알림',request_id:crypto.randomUUID()};await f.call(path+'/messages','POST',req);await f.call(path+'/messages','POST',req);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM push_outbox WHERE kind='crew' AND recipient='other'").get().n,1);
});
test('migration retains existing gifts, accounting lots and stars with foreign keys enabled',t=>{
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON');const dir=new URL('../drizzle/',import.meta.url);
 for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<'0035').sort())sql.exec(readFileSync(new URL(file,dir),'utf8'));
 sql.exec("INSERT INTO users(id,email,name,created) VALUES('u','u@example.test','u',0); INSERT INTO producers(id,user_id,name,created) VALUES('p','u','p',0); INSERT INTO artists(id,producer_id,name,created) VALUES('a','p','a',0); INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES('t','u','a','p','t','Rock','',1,'wav',1,0,'published'); INSERT INTO gold_purchases(id,user_id,channel,gold,used,price_krw,fee_krw,status,created) VALUES('lot','u','web',500,1,5000,0,'paid',0); INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,creator_profile_id,creator_mw,platform_mw,month,created) VALUES('g','u','t',1,10000,'p',7000,3000,'2026-10',0); INSERT INTO gift_lots(gift_id,purchase_id,gold,net_mw) VALUES('g','lot',1,10000); INSERT INTO free_gifts(id,sender_id,track_id,request_id,created) VALUES('f','u','t','r',0)");
 sql.exec('BEGIN');sql.exec(readFileSync(new URL('0035_personal_gifts_and_crew_mute.sql',dir),'utf8'));sql.exec('COMMIT');
 assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(sql.prepare('SELECT gold FROM gift_lots').get().gold,1);assert.equal(sql.prepare('SELECT creator_mw FROM gifts').get().creator_mw,7000);assert.equal(sql.prepare('SELECT track_id FROM free_gifts').get().track_id,'t');
});
