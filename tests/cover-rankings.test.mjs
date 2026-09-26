import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {rankingPeriod} from '../server/cover-rankings.js';
import {hash} from '../server/auth.js';

const stamp=s=>Date.parse(s)/1000;
async function setup(t){
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'});
 f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'; INSERT INTO producers(id,user_id,name,created) VALUES('performer','other','Cover Singer',0)");
 for(const [id,uid,pid] of [['cover-a','other','performer'],['cover-b','owner','producer']])f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id) VALUES(?,?,'artist',?,?,'Rock','',1,'wav',128,0,'published','cover','one')").run(id,uid,pid,id);
 f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('third','third@example.test','Third',0)");
 f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash('third'),'third',Date.now()/1000+3600);
 return f;
}
test('Korean calendar periods use local midnight, Monday and month boundaries',()=>{
 const at=stamp('2026-10-01T00:00:00+09:00');
 assert.equal(rankingPeriod('today',at).from,at);
 assert.equal(rankingPeriod('month',at).from,at);
 assert.equal(rankingPeriod('week',at).from,stamp('2026-09-28T00:00:00+09:00'));
 assert.equal(rankingPeriod('today',at-1).from,stamp('2026-09-30T00:00:00+09:00'));
 assert.equal(rankingPeriod('week',stamp('2026-09-27T23:59:59+09:00')).from,stamp('2026-09-21T00:00:00+09:00'));
 assert.equal(rankingPeriod('all',at).from,0);
 assert.throws(()=>rankingPeriod('invalid',at));
});
test('ranking uses like time, not cover upload time; ties and active votes are stable',async t=>{
 const f=await setup(t),at=Math.floor(Date.now()/1000),start=rankingPeriod('today',at).from;
 const vote=f.sql.prepare('INSERT INTO likes(user_id,track_id,created) VALUES(?,?,?)');
 vote.run('owner','cover-a',start);vote.run('other','cover-a',start-1);vote.run('third','cover-b',start);
 let r=await f.call('/api/cover-rankings?period=today', 'GET',null,null);
 assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(r.body.tracks.map(s=>[s.id,s.rank,s.rank_likes]),[['cover-a',1,1],['cover-b',2,1]]);
 assert.equal(r.body.time_zone,'Asia/Seoul');
 r=await f.call('/api/cover-rankings?period=all');assert.equal(r.body.tracks[0].rank_likes,2);
 await f.call('/api/tracks/cover-a/like','PUT',null,'owner');
 assert.equal((await f.call('/api/cover-rankings?period=all')).body.tracks[0].rank_likes,2,'PUT is idempotent');
 await f.call('/api/tracks/cover-a/like','DELETE',null,'owner');
 assert.deepEqual((await f.call('/api/cover-rankings?period=today')).body.tracks.map(x=>x.id),['cover-b']);
});
test('ranking filters genre, literal search and original; singers aggregate visible public covers only',async t=>{
 const f=await setup(t),at=Math.floor(Date.now()/1000);
 f.sql.prepare('INSERT INTO likes VALUES(?,?,?)').run('owner','cover-a',at);
 for(const params of ['genre=EDM','q=missing','q=%25','original_id=two'])assert.deepEqual((await f.call('/api/cover-rankings?period=all&'+params)).body.tracks,[]);
 assert.equal((await f.call('/api/cover-rankings?period=all&q=Singer&genre=Rock&original_id=one')).body.tracks.length,1);
 let r=await f.call('/api/cover-rankings?period=all&kind=singers');assert.equal(r.body.singers[0].id,'performer');assert.equal(r.body.singers[0].rank_likes,1);
 f.sql.exec("UPDATE tracks SET karaoke_at=0 WHERE id='one'");
 assert.deepEqual((await f.call('/api/cover-rankings?period=all')).body.tracks,[]);
 assert.deepEqual((await f.call('/api/cover-rankings?period=all&kind=singers')).body.singers,[]);
 for(const args of ['period=bad','genre='+('x'.repeat(81)),'kind=bad','original_id=cover-a'])assert.ok((await f.call('/api/cover-rankings?'+args)).status>=400);
});
test('cover uploader may remove another comment but cannot edit it or moderate a different cover',async t=>{
 const f=await setup(t),c=(await f.call('/api/tracks/cover-a/comments','POST',{body:'A comment'},'owner')).body.id;
 assert.equal((await f.call('/api/comments/'+c,'PATCH',{body:'changed'},'other')).status,403);
 assert.equal((await f.call('/api/comments/'+c,'DELETE',null,'third')).status,403);
 let comment=(await f.call('/api/tracks/cover-a/comments','GET',null,'other')).body.comments[0];assert.equal(comment.can_delete,true);assert.equal(comment.can_report,true);
 await f.call('/api/comments/'+c+'/like','PUT',null,'third');
 assert.equal((await f.call('/api/comments/'+c,'DELETE',null,'other')).status,200);
 assert.equal((await f.call('/api/comments/'+c,'PATCH',{body:'resurrect'},'owner')).status,409);
 assert.equal((await f.call('/api/comments/'+c+'/like','PUT',null,'third')).status,409);
 comment=(await f.call('/api/tracks/cover-a/comments')).body.comments[0];assert.equal(comment.body,'삭제된 댓글입니다.');assert.equal(comment.likes,0);assert.equal(comment.can_report,false);assert.equal(comment.can_delete,false);assert.equal(comment.deleted_by,undefined);
 assert.equal((await f.call('/api/tracks/cover-a')).body.track.comments,0);
 const original=(await f.call('/api/tracks/one/comments','POST',{body:'Original comment'},'third')).body.id;
 assert.equal((await f.call('/api/comments/'+original,'DELETE',null,'owner')).status,403,'original uploader gains no new moderation power');
});
test('reports are authenticated, deduplicated, private and reviewable with audited admin decisions',async t=>{
 const f=await setup(t),c=(await f.call('/api/tracks/cover-a/comments','POST',{body:'Reported body'},'other')).body.id,path='/api/comments/'+c+'/report',body={reason:'spam',details:'Repeated promotion'};
 assert.equal((await f.call(path,'POST',body,null)).status,401);
 assert.equal((await f.call(path,'POST',body,'other')).status,400);
 assert.equal((await f.call(path,'POST',{reason:'invalid'},'third')).status,400);
 assert.equal((await f.call(path,'POST',body,'third')).status,201);
 assert.equal((await f.call(path,'POST',body,'third')).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM comment_reports').get().n,1);
 assert.equal((await f.call('/api/admin/comment-reports','GET',null,'third')).status,403);
 const r=(await f.call('/api/admin/comment-reports')).body.reports[0];assert.equal(r.body_snapshot,'Reported body');
 assert.equal((await f.call('/api/tracks/cover-a/comments','GET',null,'third')).body.comments[0].reported,1);
 assert.equal((await f.call('/api/tracks/cover-a/comments','GET',null,'owner')).body.comments[0].reported,0);
 assert.equal((await f.call('/api/admin/comment-reports/'+r.id,'PATCH',{status:'removed'})).status,200);
 await f.call('/api/admin/comment-reports/'+r.id,'PATCH',{status:'dismissed'});
 assert.equal(f.sql.prepare('SELECT count(*) n FROM admin_audit').get().n,1,'repeat resolution does not overwrite audit');
 assert.equal((await f.call('/api/admin/comment-reports?status=removed')).body.reports.length,1);
 assert.equal((await f.call(path,'POST',body,'owner')).status,409);
 assert.ok(f.sql.prepare('SELECT deleted_at FROM comments WHERE id=?').get(c).deleted_at>0);
});
