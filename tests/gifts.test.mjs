import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {hash} from '../server/auth.js';
import {settlementMonths} from '../server/gifts.js';
import {allocateLots,splitGift,giftMonth,giftDay,GIFT_CATALOG,GOLD_PACKS} from '../shared/gifts.js';
import {freeGiftState} from '../server/free-gifts.js';

// A web card lot (3.3% fee) and an app store lot (15% assumed fee).
const WEB={id:'web',gold:1000,used:0,price_krw:10000,fee_krw:330};
const APP={id:'app',gold:500,used:0,price_krw:5000,fee_krw:750};

test('payment fees come off first, then the cover or original split applies',()=>{
 assert.deepEqual(GOLD_PACKS.map(p=>[p.gold,p.price]),[[500,5000],[1000,10000],[5000,50000],[10000,100000]]);
 // App: 1,000 KRW -> 150 KRW store fee -> 850 KRW split 40/30/30.
 assert.deepEqual(splitGift('cover',850000),{singer:340000,creator:255000,platform:255000});
 assert.deepEqual(splitGift('original',850000),{singer:0,creator:595000,platform:255000});
 const spent=allocateLots([WEB,APP],1200);
 assert.deepEqual(spent,[{purchase_id:'web',gold:1000,net_mw:9670000},{purchase_id:'app',gold:200,net_mw:1700000}],'oldest gold first, each at its own after-fee value');
 assert.throws(()=>allocateLots([WEB,APP],1501),/부족/);
 assert.equal(giftMonth(Date.UTC(2026,8,30,15,30)/1000),'2026-10','months follow Korean time');
});

test('earnings are paid on the 25th of the next month once they reach 10,000 KRW, smaller months carry over',()=>{
 const months=settlementMonths([{month:'2020-01',singer_mw:6000000,creator_mw:0,gifts:1},{month:'2020-02',singer_mw:3000000,creator_mw:2000000,gifts:2},{month:'2020-03',singer_mw:12000000,creator_mw:0,gifts:1},{month:'2020-04',singer_mw:1000,creator_mw:0,gifts:1}],'2020-04');
 assert.deepEqual(months.map(m=>[m.month,m.status,m.payable_krw??m.carried_krw??null,m.payout_on??null]),
  [['2020-01','carried',6000,null],['2020-02','payable',11000,'2020-03-25'],['2020-03','payable',12000,'2020-04-25'],['2020-04','accruing',null,'2020-05-25']]);
});

async function giftFixture(t){
 const f=await fixture(t);
 // 'one' is an original open to covers; 'other' sings a published cover of it; 'fan' holds gold.
 f.sql.exec("UPDATE tracks SET karaoke_at=1,duration=200 WHERE id='one'");
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('singer','other','Singer',0)");
 f.sql.exec("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration) VALUES('cover','other','artist','singer','one','Rock','',1,'wav',128,0,'published','cover','one',190)");
 f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run('fan','fan@example.test','팬');
 f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash('fan'),'fan',Math.floor(Date.now()/1000)+3600);
 const lot=(p,channel,paid)=>f.sql.prepare("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES(?,?,?,?,?,?,'paid',?,?)").run(p.id,'fan',channel,p.gold,p.price_krw,p.fee_krw,paid,paid);
 lot(WEB,'web',1);lot(APP,'app',2);
 return f;
}

test('catalog prices are authoritative; request retries do not spend gold twice',async t=>{
 const f=await giftFixture(t),catalog=await f.call('/api/gifts/catalog','GET',undefined,null);
 assert.deepEqual(catalog.body.gifts.map(g=>g.gold),[1,10,50,100,300,500,1000]);
 assert.equal(catalog.body.free_gift.id,'star');
 assert.equal((await f.call('/api/tracks/cover/gifts','POST',{gift_type:'crown',gold:10,request_id:'forged-price-123456'},'fan')).status,400);
 const body={gift_type:'heart',request_id:'same-gift-request-1234'};
 const [a,b]=await Promise.all([f.call('/api/tracks/cover/gifts','POST',body,'fan'),f.call('/api/tracks/cover/gifts','POST',body,'fan')]);
 assert.equal(a.body.gift.id,b.body.gift.id);assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts').get().n,1);
 assert.equal((await f.call('/api/gold','GET',undefined,'fan')).body.balance,1450);
 assert.equal(f.sql.prepare('SELECT gift_type,gift_name FROM gifts').get().gift_name,'하트');
 assert.equal((await f.call('/api/tracks/one/gifts','POST',body,'fan')).status,409);
 assert.equal((await f.call('/api/tracks/cover/gifts','POST',{gift_type:'invalid',request_id:'other-request-1234'},'fan')).status,400);
});

test('one-gold balloon preserves fractional earnings and spends once',async t=>{
 const f=await giftFixture(t),body={gift_type:'balloon',request_id:'balloon-request-12345'};
 const result=await f.call('/api/tracks/cover/gifts','POST',body,'fan');
 assert.equal(result.status,201,JSON.stringify(result.body));assert.equal(result.body.balance,1499);
 assert.equal((await f.call('/api/tracks/cover/gifts','POST',body,'fan')).body.balance,1499);
 const gift=f.sql.prepare('SELECT * FROM gifts').get();
 assert.deepEqual([gift.gold,gift.net_mw,gift.singer_mw,gift.creator_mw,gift.platform_mw],[1,9670,3868,2901,2901]);
 assert.equal((await f.call('/api/tracks/cover/gifts')).body.ranking[0].score,1);
 assert.equal((await f.call('/api/tracks/cover/gifts','POST',{...body,gold:0},'fan')).status,400);
});

test('daily free rewards are account and Korean-day limited; activity requires real listening',async t=>{
 const f=await giftFixture(t);
 assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'checkin'},null)).status,401);
 assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'listen'},'fan')).status,409);
 await Promise.all([f.call('/api/gifts/free/claim','POST',{kind:'checkin'},'fan'),f.call('/api/gifts/free/claim','POST',{kind:'checkin'},'fan')]);
 assert.equal((await f.call('/api/gifts/free','GET',undefined,'fan')).body.balance,3);
 const at=Math.floor(Date.now()/1000),day=giftDay(at);
 f.sql.exec('UPDATE tracks SET duration=200');
 const listen=f.sql.prepare("INSERT INTO listens(id,track_id,listener,user_id,started,seconds,day,qualified) VALUES(?,?,'fan','fan',?,?,?,1)");
 for(let n=0;n<5;n++)listen.run('repeat'+n,'one',at,120,day);
 assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'listen'},'fan')).status,409,'five plays of the same song count once');
 for(const tid of ['two','three','hidden','cover'])listen.run(tid,tid,at,119,day);
 assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'listen'},'fan')).status,409,'59.5 percent does not qualify');
 f.sql.exec('UPDATE listens SET seconds=120');
 assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'listen'},'fan')).body.balance,5);
 assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'listen'},'fan')).body.balance,5);
 assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'cover'},'fan')).status,409);
 f.sql.prepare("UPDATE tracks SET user_id='fan',created=? WHERE id='cover'").run(at);
 assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'cover'},'fan')).body.balance,7);
 const comment=f.sql.prepare("INSERT INTO comments(id,track_id,user_id,body,created,deleted_at) VALUES(?,'one','fan',?,?,?)");
 comment.run('deleted','삭제된 댓글',at,at);comment.run('short','ㅋ',at,0);
 assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'comment1'},'fan')).status,409);
 for(let n=1;n<=4;n++)comment.run('c'+n,'음악이 좋아요 '+n,at,0);
 for(let n=1;n<=3;n++)assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'comment'+n},'fan')).body.balance,7+n);
 assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'comment4'},'fan')).status,400);
 assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'comment3'},'fan')).body.balance,10);
 const tomorrow=await freeGiftState({DB:f.DB},'fan',Math.floor(Date.now()/1000)+86400);
 assert.equal(tomorrow.balance,10);assert.ok(tomorrow.rewards.every(r=>!r.claimed));assert.equal(tomorrow.rewards[1].eligible,false);
 assert.equal(giftDay(Date.UTC(2026,8,28,14,59,59)/1000),'2026-09-28');assert.equal(giftDay(Date.UTC(2026,8,28,15)/1000),'2026-09-29');
});

test('free cheers add ranking points but never paid balances or revenue; duplicate and overspend protection',async t=>{
 const f=await giftFixture(t);await f.call('/api/gifts/free/claim','POST',{kind:'checkin'},'fan');
 const body={gift_type:'star',request_id:'free-gift-request-1234'};
 const [a,b]=await Promise.all([f.call('/api/tracks/cover/gifts','POST',body,'fan'),f.call('/api/tracks/cover/gifts','POST',body,'fan')]);
 assert.equal(a.body.gift.id,b.body.gift.id);assert.equal(a.body.gift.gold,0);assert.equal(a.body.free_balance,2);
 const wallet=(await f.call('/api/gold','GET',undefined,'fan')).body;assert.equal(wallet.balance,1500);assert.equal(wallet.sent.length,0);assert.equal(wallet.free_sent.length,1);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM gift_lots').get().n,0);
 const rank=(await f.call('/api/tracks/cover/gifts')).body;assert.equal(rank.free_count,1);assert.equal(rank.total_gold,0);assert.deepEqual(rank.ranking,[{rank:1,name:'팬',profile_id:null,image_version:null,gold:0,stars:1,score:1,gifts:1}]);
 await f.call('/api/tracks/cover/gifts','POST',{gift_type:'note',request_id:'paid-with-star-12345'},'fan');
 const mixed=(await f.call('/api/tracks/cover/gifts')).body.ranking[0];assert.equal(mixed.score,11);assert.equal(mixed.gold,10);assert.equal(mixed.stars,1);
 assert.equal((await f.call('/api/studio/earnings','GET',undefined,'other')).body.months[0].gifts,1);
 assert.equal((await f.call('/api/tracks/one/gifts','POST',{...body,request_id:'own-free-gift-12345'},'owner')).status,400);
 const results=await Promise.all([1,2,3].map(n=>f.call('/api/tracks/cover/gifts','POST',{gift_type:'star',request_id:'free-gift-parallel-00'+n},'fan')));
 assert.equal(results.filter(r=>r.status===201).length,2);assert.equal((await f.call('/api/gifts/free','GET',undefined,'fan')).body.balance,0);
 assert.equal((await f.call('/api/tracks/cover/gifts','POST',{gift_type:'star',gold:10,request_id:'invalid-free-123456'},'fan')).status,400);
});

test('gifts spend the oldest gold, freeze each share, and feed the rankings',async t=>{
 const f=await giftFixture(t);
 assert.equal((await f.call('/api/gold','GET',undefined,'fan')).body.balance,1500);
 assert.equal((await f.call('/api/tracks/cover/gifts','POST',{gold:5},'fan')).status,400,'minimum gift');
 assert.equal((await f.call('/api/tracks/cover/gifts','POST',{gold:2000},'fan')).status,409,'not enough gold');
 assert.equal((await f.call('/api/tracks/cover/gifts','POST',{gold:100},'other')).status,400,'no gifts to your own song');
 assert.equal((await f.call('/api/tracks/hidden/gifts','POST',{gold:100},'fan')).status,404);
 const out=await f.call('/api/tracks/cover/gifts','POST',{gold:1200},'fan');
 assert.equal(out.status,201,JSON.stringify(out.body));assert.equal(out.body.balance,300);
 const g=f.sql.prepare('SELECT * FROM gifts').get();
 assert.deepEqual({net:g.net_mw,singer:g.singer_mw,creator:g.creator_mw,platform:g.platform_mw,singerProfile:g.singer_profile_id,creatorProfile:g.creator_profile_id},
  {net:11370000,singer:4548000,creator:3411000,platform:3411000,singerProfile:'singer',creatorProfile:'producer'});
 assert.deepEqual(f.sql.prepare('SELECT id,used FROM gold_purchases ORDER BY paid_at').all().map(r=>[r.id,r.used]),[['web',1000],['app',200]]);
 // A gift straight to the original: 70% to its creator.
 assert.equal((await f.call('/api/tracks/one/gifts','POST',{gold:100},'fan')).status,201);
 const direct=f.sql.prepare("SELECT * FROM gifts WHERE track_id='one'").get();
 assert.deepEqual([direct.net_mw,direct.singer_profile_id,direct.creator_mw,direct.platform_mw],[850000,null,595000,255000]);
 const coverRank=(await f.call('/api/tracks/cover/gifts')).body;
 assert.deepEqual([coverRank.total_gold,coverRank.ranking[0]],[1200,{rank:1,name:'팬',profile_id:null,image_version:null,gold:1200,stars:0,score:1200,gifts:1}]);
 assert.deepEqual((await f.call('/api/producers/singer')).body.gifts.ranking.map(r=>[r.name,r.gold]),[['팬',1200]]);
 assert.deepEqual((await f.call('/api/producers/producer')).body.gifts.ranking.map(r=>[r.name,r.gold]),[['팬',100]],'a cover\'s fans belong to its singer');
 const covers=(await f.call('/api/tracks/one/covers?sort=gifts')).body.covers;assert.equal(covers[0].gift_gold,1200);
 const singerEarnings=(await f.call('/api/studio/earnings','GET',undefined,'other')).body.months[0];
 assert.deepEqual([singerEarnings.singer_krw,singerEarnings.creator_krw,singerEarnings.status],[4548,0,'accruing']);
 const creatorEarnings=(await f.call('/api/studio/earnings','GET',undefined,'owner')).body.months[0];
 assert.deepEqual([creatorEarnings.singer_krw,creatorEarnings.creator_krw,creatorEarnings.total_krw],[0,4006,4006]);
 assert.equal((await f.call('/api/gold/checkout','POST',{gold:100},'fan')).status,409,'no payment channel yet');
});

test('a lot can never be overspent or spent after a refund, and a failed batch leaves no gift behind',async t=>{
 const f=await giftFixture(t);
 assert.throws(()=>f.sql.exec("UPDATE gold_purchases SET used=used+501 WHERE id='app'"),/CHECK constraint/);
 f.sql.exec("UPDATE gold_purchases SET status='refunded' WHERE id='app'");
 assert.throws(()=>f.sql.exec("UPDATE gold_purchases SET used=used+1 WHERE id='app'"),/CHECK constraint/);
 await assert.rejects(f.DB.batch([
  f.DB.prepare('UPDATE gold_purchases SET used=used+? WHERE id=?').bind(10,'app'),
  f.DB.prepare("INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,creator_profile_id,creator_mw,platform_mw,month,created) VALUES('x','fan','one',10,1,'producer',1,0,'2026-09',0)").bind(),
 ]),/CHECK constraint/);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts').get().n,0);
 assert.equal((await f.call('/api/gold','GET',undefined,'fan')).body.balance,1000,'refunded gold is gone from the balance');
});
