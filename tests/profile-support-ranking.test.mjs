import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {hash} from '../server/auth.js';
import {popularScores} from '../server/popular-chart.js';

function addBot(f,id,name){
 f.sql.prepare("INSERT INTO users(id,email,name,provider,account_type,created) VALUES(?,?,?,'ai_service','ai_bot',0)").run(id,id+'@bots.invalid',name);
 f.sql.prepare('INSERT INTO producers(id,user_id,name,nickname_confirmed,image_version,created) VALUES(?,?,?,1,?,0)').run(id,id,name,'image-v1');
}
function addSupport(f,id,bot,owner,quantity,created=100,type='track',target='one'){
 f.sql.prepare('INSERT INTO ai_support_gifts(id,job_id,sender_id,owner_id,target_type,target_id,quantity,created) VALUES(?,?,?,?,?,?,?,?)').run(id,'job:'+id,bot,owner,type,target,quantity,created);
}
async function paidFixture(t){
 const f=await fixture(t);
 f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run('fan','fan@example.test','팬');
 f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash('fan'),'fan',Math.floor(Date.now()/1000)+3600);
 f.sql.exec("INSERT INTO producers(id,user_id,name,nickname_confirmed,created) VALUES('fan-profile','fan','실제 팬',1,0),('singer','other','커버 가수',1,0)");
 f.sql.exec("UPDATE tracks SET duration=180,karaoke_at=1 WHERE id='one'; INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,duration) VALUES('support-cover','other','artist','singer','커버 작품','Rock','',1,'mp3',128,0,'published','cover','one',180)");
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('human-lot','fan','web',100,1000,0,'paid',0,1)");
 for(const [target,quantity] of [['tracks/one',2],['producers/producer',1],['tracks/support-cover',5]]){
  const r=await f.call('/api/'+target+'/gifts','POST',{gift_type:'lollipop',quantity,request_id:'paid-support-'+target.replace('/','-')},'fan');assert.equal(r.status,201,JSON.stringify(r.body));
 }
 assert.equal((await f.call('/api/gifts/free/claim','POST',{kind:'checkin'},'fan')).status,200);
 for(const target of ['tracks/one','producers/producer','tracks/support-cover']){
  const r=await f.call('/api/'+target+'/gifts','POST',{gift_type:'star',request_id:'free-support-'+target.replace('/','-')},'fan');assert.equal(r.status,201,JSON.stringify(r.body));
 }
 return f;
}

test('personal support ranking sums every AI receipt with human gifts without changing financial or global rankings',async t=>{
 const f=await paidFixture(t),env={DB:f.DB},period={from:0,until:Math.floor(Date.now()/1000)+3600};
 const before=(await f.call('/api/producers/producer/gifts')).body;
 const beforeTrack=(await f.call('/api/tracks/one/gifts')).body;
 const beforeEarnings=(await f.call('/api/studio/earnings')).body;
 const beforeChart=await popularScores(env,period,'1=1',[],100);
 const ledger=()=>['gifts','gift_lots','free_gifts','gold_purchases','payout_statements'].map(table=>[table,f.sql.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]);
 const beforeLedger=ledger();
 assert.deepEqual([before.total_gold,before.free_count,before.gift_count],[3,2,2]);
 assert.deepEqual(before.support_ranking.map(r=>[r.profile_id,r.account_type,r.gold,r.stars,r.official_stars,r.score]),[['fan-profile','human',3,2,0,5]]);
 addBot(f,'ai_000001','첫 응원');addBot(f,'ai_000002','두 번째 응원');
 for(let n=0;n<120;n++)addSupport(f,'all-receipts-'+n,'ai_000001','owner',2,100+n,n%2?'dubbing':'track',n%2?'finished-dubbing':'one');
 addSupport(f,'other-bot','ai_000002','owner',3,220);
 addSupport(f,'other-recipient','ai_000001','other',20,221,'track','support-cover');
 const after=(await f.call('/api/producers/producer/gifts')).body;
 assert.equal(after.official_ai.gifts.length,100,'history preview intentionally stays bounded');
 assert.equal(after.official_ai.quantity,243);
 const ai=after.support_ranking.find(r=>r.profile_id==='ai_000001');
 assert.deepEqual([ai.rank,ai.account_type,ai.gold,ai.stars,ai.official_stars,ai.score,ai.gifts],[1,'ai_bot',0,0,240,240,120]);
 assert.equal(ai.image_version,'image-v1');assert.match(ai.public_id,/^[A-Z]{3}[0-9]{4}$/);
 assert.deepEqual(after.ranking,before.ranking,'ordinary fan ranking remains byte-for-byte compatible');
 assert.deepEqual([after.total_gold,after.free_count,after.gift_count],[before.total_gold,before.free_count,before.gift_count]);
 const track=(await f.call('/api/tracks/one/gifts')).body;
 assert.deepEqual(track.ranking,beforeTrack.ranking);assert.equal(track.total_gold,beforeTrack.total_gold);assert.equal(track.free_count,beforeTrack.free_count);assert.equal('support_ranking' in track,false);
 const earnings=(await f.call('/api/studio/earnings')).body;
 for(const key of ['activity','breakdown','months'])assert.deepEqual(earnings[key],beforeEarnings[key],key);
 assert.deepEqual(await popularScores(env,period,'1=1',[],100),beforeChart);
 assert.deepEqual(ledger(),beforeLedger,'reading combined support never writes money or settlement tables');
 const singer=(await f.call('/api/producers/singer/gifts')).body;
 assert.deepEqual([singer.total_gold,singer.free_count],[5,1]);
 assert.deepEqual(singer.support_ranking.map(r=>[r.profile_id,r.gold,r.stars,r.official_stars,r.score]),[['ai_000001',0,0,20,20],['fan-profile',5,1,0,6]],'cover recipient is the singer, never counted again for the original creator');
 f.sql.exec("UPDATE producers SET name='바뀐 공식 이름',image_version='image-v2' WHERE id='ai_000001'");
 const renamed=(await f.call('/api/producers/producer/gifts')).body.support_ranking[0];
 assert.equal(renamed.name,'바뀐 공식 이름');assert.equal(renamed.image_version,'image-v2');assert.equal(renamed.official_stars,240);assert.equal(renamed.profile_id,ai.profile_id);assert.equal(renamed.public_id,ai.public_id);
});

test('support ranking orders ties by first support then stable account ID and limits after aggregation',async t=>{
 const f=await fixture(t);
 for(let n=52;n>=1;n--){const id='ai_'+String(n).padStart(6,'0');addBot(f,id,'응원 '+n);addSupport(f,'tie-'+id,id,'owner',1,100);}
 // Later receipt makes the last inserted account the top supporter, even though its original row is outside the first 50.
 addSupport(f,'second-receipt','ai_000052','owner',1,101);
 let result=(await f.call('/api/producers/producer/gifts')).body;
 assert.equal(result.support_ranking.length,50);
 assert.equal(result.support_ranking[0].profile_id,'ai_000052');assert.equal(result.support_ranking[0].score,2);
 assert.deepEqual(result.support_ranking.slice(1,4).map(r=>r.profile_id),['ai_000001','ai_000002','ai_000003']);
 assert.deepEqual(result.support_ranking.map(r=>r.rank),Array.from({length:50},(_,i)=>i+1));
 assert.equal(result.total_gold,0);assert.equal(result.free_count,0);assert.deepEqual(result.ranking,[]);
 f.sql.exec("UPDATE ai_support_gifts SET created=90 WHERE id='tie-ai_000051'");
 result=(await f.call('/api/producers/producer/gifts')).body;
 assert.equal(result.support_ranking[1].profile_id,'ai_000051','first support breaks equal-score ties before account ID');
});
