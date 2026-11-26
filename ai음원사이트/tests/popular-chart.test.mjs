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
 let one=(await scores(f)).find(x=>x.id==='one');assert.equal(one.chart_plays,1);assert.equal(one.chart_likes,1);assert.equal(one.chart_comments,1);assert.equal(one.chart_score,80);
 assert.equal((await scores(f,'all')).find(x=>x.id==='one').chart_plays,2);
 f.sql.exec("UPDATE comments SET deleted_at=1; DELETE FROM likes");one=(await scores(f)).find(x=>x.id==='one');assert.equal(one.chart_comments,0);assert.equal(one.chart_likes,0);
});
test('a huge gift cannot outweigh listening and canceled purchase allocations do not count',async t=>{
 const f=await fixture(t);listen(f,'a','one');gold(f,'huge','two',1000000);gold(f,'refund','three',2000000,'refunded');
 f.sql.prepare("INSERT INTO free_gifts(id,sender_id,track_id,request_id,created) VALUES('star','other','three','star',?)").run(at);
 const all=await scores(f);assert.equal(all[0].id,'one');assert.equal(all[0].chart_score,55);assert.equal(all.find(x=>x.id==='two').chart_score,0);
 const three=all.find(x=>x.id==='three');assert.equal(three.chart_gold,0);assert.equal(three.chart_stars,1);
 f.sql.exec("UPDATE gift_lots SET gold=1 WHERE gift_id='huge'");const equal=await scores(f);assert.equal(equal.find(x=>x.id==='two').chart_score,equal.find(x=>x.id==='three').chart_score);
});
test('normalization excludes hidden tracks and remains stable across filters and limits',async t=>{
 const f=await fixture(t);listen(f,'a','one');gold(f,'g','two',2);gold(f,'hidden-g','hidden',1000000);
 f.sql.exec("UPDATE tracks SET genre='Pop' WHERE id='two'");const all=await scores(f);
 const filtered=await scores(f,'today',"t.status='published' AND t.kind='original' AND t.genre=?",['Pop'],1);
 assert.equal(filtered.length,1);assert.equal(filtered[0].chart_score,all.find(x=>x.id==='two').chart_score);assert.equal(filtered[0].chart_score,0);
 assert.deepEqual(await scores(f,'today',"t.status='published' AND t.kind='original'",[],1),all.slice(0,1));
});
test('catalog returns chart metrics for native and web clients, safe empty periods and invalid periods',async t=>{
 const f=await fixture(t);let r=await f.call('/api/catalog?section=tracks&chart=top&period=today');assert.equal(r.status,200);assert.equal(r.body.chart.period,'today');assert.deepEqual(r.body.chart.weights,{plays:55,reactions:25,covers:20});assert.equal(r.body.tracks[0].chart_score,0);
 assert.equal((await f.call('/api/catalog?chart=top&period=invalid')).status,400);
 r=await f.call('/api/catalog?section=tracks&chart=top&q=none');assert.deepEqual(r.body.tracks,[]);
});

test('yesterday movement uses KST dates, distinguishes new from missing history, and freezes the prior day',async t=>{
 const {dailyChart,chartDay}=await import('../server/chart-movement.js'),f=await fixture(t),env={DB:f.DB};
 const before=Date.parse('2026-10-31T23:59:00+09:00')/1000,after=before+120;
 assert.equal(chartDay(before),'2026-10-31');assert.equal(chartDay(after),'2026-11-01');
 const first=await dailyChart(env,rankingPeriod('month',before));assert.equal(first.comparison.available,false);assert.ok(first.tracks.every(t=>t.chart_movement==='unavailable'));
 const old=f.sql.prepare('SELECT * FROM chart_daily_snapshots').get();
 listen(f,'new-listen','three',after);
 const next=await dailyChart(env,rankingPeriod('month',after));assert.equal(next.comparison.date,'2026-10-31');assert.equal(next.comparison.available,true);
 assert.equal(next.tracks.find(t=>t.id==='three').rank_change,1);assert.equal(next.tracks.find(t=>t.id==='one').chart_movement,'down');
 assert.deepEqual(f.sql.prepare("SELECT * FROM chart_daily_snapshots WHERE day='2026-10-31'").get(),old);
 f.sql.exec("UPDATE tracks SET status='published' WHERE id='hidden'");
 const added=await dailyChart(env,rankingPeriod('month',after+65));assert.equal(added.tracks.find(t=>t.id==='hidden').chart_movement,'new');
});
test('filtered and limited chart requests keep the complete public snapshot and global ranks',async t=>{
 const {chartDay}=await import('../server/chart-movement.js'),f=await fixture(t),stamp=Math.floor(Date.now()/1000),today=chartDay(stamp),yesterday=chartDay(stamp-86400);
 f.sql.prepare('INSERT INTO chart_daily_snapshots VALUES(?,?,?,?)').run(yesterday,'v2:top:week',stamp-86400,JSON.stringify(['two','one','three']));
 const r=await f.call('/api/catalog?section=tracks&chart=top&period=week&q=two&limit=1');assert.equal(r.status,200);assert.equal(r.body.tracks.length,1);assert.equal(r.body.tracks[0].chart_rank,3);assert.equal(r.body.tracks[0].rank_change,-2);assert.equal(r.body.chart.comparison.available,true);
 assert.deepEqual(JSON.parse(f.sql.prepare('SELECT ranks_json FROM chart_daily_snapshots WHERE day=?').get(today).ranks_json),['one','three','two']);
});
test('rank movement reports up, down, unchanged, new and unavailable without inferring fake history',async()=>{
 const {rankChanges}=await import('../server/chart-movement.js'),current=['b','a','c','d'].map(id=>({id}));
 const compared=rankChanges(current,['a','b','c']);assert.deepEqual(compared.map(t=>t.chart_movement),['up','down','same','new']);assert.deepEqual(compared.map(t=>t.rank_change),[1,-1,0,null]);assert.ok(rankChanges(current,null).every(t=>t.chart_movement==='unavailable'));assert.ok(rankChanges(current,[]).every(t=>t.chart_movement==='new'));
});

test('55/25/20 separates cover credit, deduplicates saves and uses only linked public completed covers',async t=>{
 const f=await fixture(t);
 f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'; INSERT INTO playlists(id,user_id,name,created) VALUES('p','other','saved',0),('p2','other','again',0)");
 f.sql.prepare("INSERT INTO playlist_tracks VALUES('p','one',?,0),('p2','one',?,0)").run(at,at);
 f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('other','one',?)").run(at);
 for(const [id,status,original,mode] of [['c1','published','one','solo'],['c2','published','one','solo'],['hidden-cover','hidden','one','solo'],['open-duet','published','one','duet'],['unlinked','published',null,'solo']]){
  f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,?,'cover',?,?)").run(id,id,status,original,mode);
  listen(f,id+'listen',id);f.sql.prepare('INSERT INTO likes(user_id,track_id,created) VALUES(?,?,?)').run('other',id,at);
 }
 listen(f,'original','one');listen(f,'again','one');
 let one=(await scores(f)).find(x=>x.id==='one');
 assert.equal(one.chart_plays,1);assert.equal(one.chart_reactions,1);assert.equal(one.chart_cover_reactions,1);assert.equal(one.chart_covers,2);assert.equal(one.chart_score,100);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE kind='cover'");
 one=(await scores(f)).find(x=>x.id==='one');assert.equal(one.chart_score,80);assert.equal(one.chart_plays,1);assert.equal(one.chart_cover_reactions,0);assert.equal(one.chart_covers,0);
});

test('rising evaluates absolute growth and smoothed rate across consecutive seven-day windows',async t=>{
 const f=await fixture(t),score=()=>popularScores({DB:f.DB},rankingPeriod('all',at),"1=1",[],-1,'rising');
 for(let i=0;i<8;i++){
  f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run('fan'+i,'fan'+i+'@example.test','fan');
  listen(f,'recent'+i,'one',at-10,1,'fan'+i);
  if(i<5)listen(f,'prior'+i,'one',at-604801,1,'fan'+i);
  if(i<4)listen(f,'new'+i,'two',at-10,1,'fan'+i);
 }
 const result=await score();assert.equal(result[0].id,'two');assert.equal(result.find(x=>x.id==='one').chart_growth,3);assert.equal(result[0].chart_growth,4);assert.equal(result[0].chart_growth_rate,.8);assert.ok(!result.some(x=>x.id==='three'));
});

test('new releases use first publication, include day 30, and reject hidden/cover/participation tracks',async t=>{
 const f=await fixture(t),score=()=>popularScores({DB:f.DB},rankingPeriod('all',at),'1=1',[],-1,'releases');
 f.sql.prepare("UPDATE tracks SET first_published_at=? WHERE id='one'").run(at-2592000);
 f.sql.prepare("UPDATE tracks SET first_published_at=? WHERE id='two'").run(at-2592001);
 f.sql.prepare("UPDATE tracks SET created=?,first_published_at=? WHERE id='three'").run(at-86400,at-2592001);
 assert.deepEqual((await score()).map(t=>t.id),['one']);
 f.sql.exec("UPDATE tracks SET duet_parent_id='two' WHERE id='one'");assert.equal((await score()).length,0);
});

test('complete chart result exceeds pagination and weekly home results remain an exact prefix',async t=>{
 const f=await fixture(t);
 for(let i=0;i<110;i++)f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,duration) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,'published',60)").run('extra'+i,'extra'+i);
 const home=(await f.call('/api/catalog?section=tracks&chart=top&period=week&limit=7')).body.tracks;
 const all=(await f.call('/api/catalog?section=tracks&chart=top&period=week&full=1')).body.tracks;
 assert.equal(all.length,113);assert.deepEqual(home,all.slice(0,7));assert.equal(all.at(-1).chart_rank,113);
});

test('chart periods isolate qualified listens, public solo covers and first-release eligibility',async t=>{
 const f=await fixture(t),period=rankingPeriod('today',at);
 const {pageScores}=await import('../server/popular-chart.js');
 const ranked=kind=>pageScores({DB:f.DB},period,kind);
 f.sql.prepare("UPDATE tracks SET first_published_at=?,karaoke_at=1").run(at-2592001);
 f.sql.prepare("UPDATE tracks SET first_published_at=? WHERE id='two'").run(at-2592000);
 listen(f,'qualified','two');listen(f,'old','one',period.from-1);
 const insert=f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,first_published_at,status,kind,original_id,cover_mode) VALUES(?,'other','artist','producer','QA','Rock','QA',1,'wav',128,0,?,?,'cover','one',?)");
 for(const [id,time,status,mode] of [['valid',at,'published','solo'],['older',period.from-1,'published','solo'],['hidden-cover',at,'hidden','solo'],['duet',at,'published','duet']])insert.run(id,time,status,mode);
 assert.equal((await ranked('listens'))[0].id,'two');
 const [first]=await ranked('covers');assert.equal(first.id,'one');assert.equal(first.chart_covers,1);
 const detail=await f.call('/api/tracks/one/covers?mode=solo');
 assert.equal((await pageScores({DB:f.DB},rankingPeriod('all',at),'covers'))[0].chart_covers,detail.body.counts.solo);
 assert.deepEqual((await ranked('new')).map(t=>t.id),['two']);
});
