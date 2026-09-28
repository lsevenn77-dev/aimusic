import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {popularScores} from '../server/popular-chart.js';
import {rankingPeriod} from '../server/ranking-period.js';
const at=Date.parse('2026-09-28T12:00:00+09:00')/1000;
function listen(f,id,track,time=at,qualified=1,user='other'){
 f.sql.prepare('INSERT INTO listens(id,track_id,listener,user_id,started,day,qualified) VALUES(?,?,?,?,?,?,?)').run(id,track,user,user,time,new Date(time*1000).toISOString().slice(0,10),qualified);
}
const scores=(f,period='today',where="t.status='published' AND t.kind='original'",args=[],limit=100)=>popularScores({DB:f.DB},rankingPeriod(period,at),where,args,limit);
function gold(f,id,track,amount,status='paid'){
 f.sql.prepare("INSERT INTO gold_purchases(id,user_id,channel,gold,used,price_krw,status,created) VALUES(?,'other','web',?,0,?,?,?)").run(id,amount,amount*10,status,at);
 f.sql.prepare("INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,creator_profile_id,creator_mw,platform_mw,month,created) VALUES(?,'other',?,?,0,'producer',0,0,'2026-09',?)").run(id,track,amount,at);
 f.sql.prepare('INSERT INTO gift_lots(gift_id,purchase_id,gold,net_mw) VALUES(?,?,?,0)').run(id,id,amount);
}
test('chart deduplicates KST listening days and commenters; ignores self, deleted and unqualified activity',async t=>{
 const f=await fixture(t),start=rankingPeriod('today',at).from;
 listen(f,'a','one',start);listen(f,'b','one',start+9*3600);listen(f,'old','one',start-1);listen(f,'skip','one',at,0);listen(f,'self','one',at,1,'owner');
 f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('other','one',?),('owner','one',?)").run(at,at);
 for(const [id,user,deleted] of [['a','other',0],['b','other',0],['c','owner',0],['d','owner',at]])f.sql.prepare("INSERT INTO comments(id,track_id,user_id,body,created,deleted_at) VALUES(?,'one',?,'hi',?,?)").run(id,user,at,deleted);
 let one=(await scores(f)).find(x=>x.id==='one');assert.equal(one.chart_plays,1);assert.equal(one.chart_likes,1);assert.equal(one.chart_comments,1);assert.equal(one.chart_score,90);
 assert.equal((await scores(f,'all')).find(x=>x.id==='one').chart_plays,2);
 f.sql.exec("UPDATE comments SET deleted_at=1; DELETE FROM likes");one=(await scores(f)).find(x=>x.id==='one');assert.equal(one.chart_comments,0);assert.equal(one.chart_likes,0);
});
test('a huge gift cannot outweigh listening and canceled purchase allocations do not count',async t=>{
 const f=await fixture(t);listen(f,'a','one');gold(f,'huge','two',1000000);gold(f,'refund','three',2000000,'refunded');
 f.sql.prepare("INSERT INTO free_gifts(id,sender_id,track_id,request_id,created) VALUES('star','other','three','star',?)").run(at);
 const all=await scores(f);assert.equal(all[0].id,'one');assert.equal(all[0].chart_score,50);assert.equal(all.find(x=>x.id==='two').chart_score,10);
 const three=all.find(x=>x.id==='three');assert.equal(three.chart_gold,0);assert.equal(three.chart_stars,1);
 f.sql.exec("UPDATE gift_lots SET gold=1 WHERE gift_id='huge'");const equal=await scores(f);assert.equal(equal.find(x=>x.id==='two').chart_score,equal.find(x=>x.id==='three').chart_score);
});
test('normalization excludes hidden tracks and remains stable across filters and limits',async t=>{
 const f=await fixture(t);listen(f,'a','one');gold(f,'g','two',2);gold(f,'hidden-g','hidden',1000000);
 f.sql.exec("UPDATE tracks SET genre='Pop' WHERE id='two'");const all=await scores(f);
 const filtered=await scores(f,'today',"t.status='published' AND t.kind='original' AND t.genre=?",['Pop'],1);
 assert.equal(filtered.length,1);assert.equal(filtered[0].chart_score,all.find(x=>x.id==='two').chart_score);assert.equal(filtered[0].chart_score,10);
 assert.deepEqual(await scores(f,'today',"t.status='published' AND t.kind='original'",[],1),all.slice(0,1));
});
test('catalog returns chart metrics for native and web clients, safe empty periods and invalid periods',async t=>{
 const f=await fixture(t);let r=await f.call('/api/catalog?section=tracks&chart=top&period=today');assert.equal(r.status,200);assert.equal(r.body.chart.period,'today');assert.equal(r.body.chart.weights.gifts,10);assert.equal(r.body.tracks[0].chart_score,0);
 assert.equal((await f.call('/api/catalog?chart=top&period=invalid')).status,400);
 r=await f.call('/api/catalog?section=tracks&chart=top&q=none');assert.deepEqual(r.body.tracks,[]);
});
