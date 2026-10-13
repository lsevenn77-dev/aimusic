import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

function addCrew(f,id,xp,created=0){
 f.sql.prepare("INSERT INTO crews(id,owner_id,name,created) VALUES(?,'owner',?,?)").run(id,id,created);
 if(xp)f.sql.prepare("INSERT INTO crew_xp(id,crew_id,user_id,amount,created) VALUES(?,?,'owner',?,0)").run('xp-'+id,id,xp);
}
test('global crew rankings sort level then accumulated XP, including beyond discovery limit',async t=>{
 const f=await fixture(t);
 for(let i=0;i<105;i++)addCrew(f,'new-'+i,0,100+i);
 for(const [id,xp] of [['leader',4600],['runner',3200],['third',1600],['fourth',900],['fifth',800],['sixth',100]])addCrew(f,id,xp);
 const r=await f.call('/api/crews','GET',null,null);
 assert.equal(r.status,200);assert.equal(r.body.crews.length,100);
 assert.ok(!r.body.crews.some(c=>c.id==='leader'));
 assert.deepEqual(r.body.rankings.map(c=>[c.id,c.level,c.xp]),[['leader',5,4600],['runner',5,3200],['third',4,1600],['fourth',3,900],['fifth',3,800]]);
 const search=await f.call('/api/crews?q=not-found','GET',null,null);
 assert.equal(search.body.crews.length,0);assert.deepEqual(search.body.rankings,r.body.rankings);
});
test('empty crews and exact XP ties produce stable rankings without fake entries',async t=>{
 const f=await fixture(t);
 assert.deepEqual((await f.call('/api/crews','GET',null,null)).body.rankings,[]);
 addCrew(f,'b',0,2);addCrew(f,'a',0,2);addCrew(f,'old',0,1);
 for(let i=0;i<2;i++)assert.deepEqual((await f.call('/api/crews','GET',null,null)).body.rankings.map(c=>c.id),['old','a','b']);
});
