import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {communityPeriod,rankArtists,scoreWorks} from '../server/community-rankings.js';
test('community windows are half-open Monday/month KST boundaries',()=>{
 const at=Date.parse('2026-10-25T15:00:00Z')/1000;assert.equal(communityPeriod('week',at).from,at);assert.equal(communityPeriod('week',at-1).until,at);
 assert.equal(new Date(communityPeriod('month',at).until*1000).toISOString(),'2026-10-31T15:00:00.000Z');
});
test('AI artist ranking groups immutable artist IDs, ignores covers and bounds prolific artists',()=>{
 const r=id=>({id,artist_id:'a',artist_name:'Same',kind:'original',score:100,listeners:1,gold:1,silver:1,original_count:4});
 const ranked=rankArtists([r('1'),r('2'),r('3'),{...r('4'),score:1},{...r('5'),artist_id:'b',score:50},{...r('6'),kind:'cover',score:1000}]);assert.equal(ranked.length,2);assert.equal(ranked[0].score,100);assert.equal(ranked[1].id,'b');
});
test('live ranking API separates original artists from completed covers and accepts dubbing category',async t=>{
 const f=await fixture(t),n=Math.floor(Date.now()/1000);f.sql.exec("UPDATE tracks SET duration=100,karaoke_at=1;UPDATE tracks SET kind='cover',original_id='one' WHERE id='three';INSERT INTO artists(id,producer_id,name,created) VALUES('other-artist','producer','QA',0);UPDATE tracks SET artist_id='other-artist' WHERE id='two'");
 f.sql.prepare('INSERT INTO likes(user_id,track_id,created) VALUES(?,?,?)').run('other','one',n);f.sql.prepare('INSERT INTO likes(user_id,track_id,created) VALUES(?,?,?)').run('other','two',n);f.sql.prepare('INSERT INTO likes(user_id,track_id,created) VALUES(?,?,?)').run('other','three',n);
 const result=await f.call('/api/community/rankings?category=aiArtist');assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.rows.length,2);assert.equal(result.body.rows[0].name,'QA');assert.notEqual(result.body.rows[0].id,result.body.rows[1].id);
 const work=await f.call('/api/community/rankings?category=work&workKind=solo');assert.equal(work.status,200,JSON.stringify(work.body));assert.deepEqual(work.body.rows.map(r=>r.id),['three']);
 const dub=await f.call('/api/community/rankings?category=work&workKind=dubbing');assert.equal(dub.status,200,JSON.stringify(dub.body));
});
test('crew settings enforce approval, minimum level, one membership, permissions and version conflicts',async t=>{
 const f=await fixture(t);const made=await f.call('/api/crews','POST',{name:'Approval',join_policy:'approval',member_limit:2});assert.equal(made.status,201,JSON.stringify(made.body));const path='/api/crews/'+made.body.crew.id;
 assert.equal((await f.call(path+'/join','POST',{},'other')).status,202);assert.equal((await f.call(path+'/applications','GET',null,'other')).status,403);
 assert.equal((await f.call(path+'/applications/other','POST',{decision:'approve'})).status,200);
 assert.equal((await f.call(path+'/applications/other','POST',{decision:'approve'})).status,200);
 assert.equal((await f.call(path,'PATCH',{notice:'Hello',version:1})).status,200);assert.equal((await f.call(path,'PATCH',{notice:'Stale',version:1})).status,409);
 assert.equal((await f.call(path,'PATCH',{name:'No'},'other')).status,403);
 assert.equal((await f.call(path+'/audit')).body.events.some(e=>e.action==='settings_changed'),true);
});
test('crew role limits, deputy kicking and cosmetic titles cannot elevate a member',async t=>{
 const f=await fixture(t),made=await f.call('/api/crews','POST',{name:'Roles'}),cid=made.body.crew.id,path='/api/crews/'+cid;
 for(let i=1;i<=7;i++){f.sql.prepare("INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)").run('u'+i,'u'+i+'@example.test','u'+i);f.sql.prepare("INSERT INTO producers(id,user_id,name,created) VALUES(?,?,?,0)").run('p'+i,'u'+i,'u'+i);f.sql.prepare("INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES(?,?,'member',0)").run(cid,'u'+i);}
 for(const i of [1,2])assert.equal((await f.call(path+'/members/p'+i,'PATCH',{role:'deputy'})).status,200);
 assert.equal((await f.call(path+'/members/p3','PATCH',{role:'deputy'})).status,409);
 for(const i of [3,4,5])assert.equal((await f.call(path+'/members/p'+i,'PATCH',{role:'manager'})).status,200);
 assert.equal((await f.call(path+'/members/p6','PATCH',{role:'manager'})).status,409);
 await f.call(path+'/join','POST',{},'other');assert.equal((await f.call(path,'PATCH',{title:'크루장',notice:'hack'},'other')).status,403);
 const profile=f.sql.prepare("SELECT id FROM producers WHERE user_id='other'").get().id;await f.call(path+'/members/'+profile,'PATCH',{role:'deputy'});
 // Free one deputy slot and promote the authenticated second account.
 await f.call(path+'/members/p2','PATCH',{role:'member'});assert.equal((await f.call(path+'/members/'+profile,'PATCH',{role:'deputy'})).status,200);
 assert.equal((await f.call(path+'/members/p7','DELETE',null,'other')).status,200);assert.equal((await f.call(path+'/members/p6','PATCH',{role:'manager'},'other')).status,403);
});
test('server ranking ignores future, hidden, self and cover activity and caps repeated listening',async t=>{
 const f=await fixture(t),n=Math.floor(Date.now()/1000),end=communityPeriod('week',n).until;
 f.sql.exec("UPDATE tracks SET duration=100,karaoke_at=1;UPDATE tracks SET kind='cover',original_id='one' WHERE id='three'");
 for(const [uid,tid,stamp] of [['owner','one',n],['other','two',end],['other','hidden',n],['other','three',n]])f.sql.prepare('INSERT INTO likes(user_id,track_id,created) VALUES(?,?,?)').run(uid,tid,stamp);
 assert.equal((await f.call('/api/community/rankings?category=aiArtist')).body.rows.length,0);
 for(let i=0;i<10;i++)f.sql.prepare("INSERT INTO listens(id,track_id,listener,user_id,started,seconds,day,qualified) VALUES(?,'one','same','other',?,100,'2026-10-23',1)").run('listen-'+i,n);
 const result=(await f.call('/api/community/rankings?category=aiArtist')).body.rows;assert.equal(result.length,1);assert.equal(result[0].listeners,1);
});
