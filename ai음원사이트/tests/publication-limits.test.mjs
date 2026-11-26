import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {crewPeriod,growthLevel} from '../shared/crew-growth.js';
import {crewCapacitySQL} from '../server/crew-growth.js';

test('personal publication rewards combine originals and covers at three, retain history and reset at KST midnight',async t=>{
 const f=await fixture(t),day=crewPeriod(Math.floor(Date.now()/1000)).start;
 f.sql.exec('DELETE FROM player_xp');
 const insert=f.sql.prepare('INSERT OR IGNORE INTO player_xp VALUES(?,?,?,?,?)');
 for(let i=0;i<6;i++)insert.run('owner','pub:'+i,i%2?'cover':'publish',i%2?60:100,day+i);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM player_xp WHERE user_id='owner'").get().n,3);
 insert.run('owner','tomorrow','publish',100,day+86400);
 insert.run('owner','listen','listen',10,day+10);
 insert.run('owner','pub:0','publish',100,day+86401);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM player_xp WHERE user_id='owner'").get().n,5);
 insert.run('other','other','publish',100,day);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM player_xp WHERE user_id='other'").get().n,1);
});
test('crew publication evidence admits five per member/day, without duplicate source or retry credit',async t=>{
 const f=await fixture(t),day=crewPeriod(Math.floor(Date.now()/1000)).start;
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('c','owner','Crew',0),('d','other','Other',0)");
 const insert=f.sql.prepare('INSERT OR IGNORE INTO crew_growth_events(id,crew_id,user_id,source_id,kind,created) VALUES(?,?,?,?,?,?)');
 for(let i=0;i<7;i++)insert.run('work:'+i,'c','owner','s:'+i,'work',day+i);
 insert.run('partner','c','owner','s:0','activity',day+8);
 assert.equal(f.sql.prepare("SELECT count(DISTINCT source_id) n FROM crew_growth_events WHERE credited=1").get().n,5);
 insert.run('retry','d','owner','s:6','activity',day+86400);
 assert.equal(f.sql.prepare("SELECT credited FROM crew_growth_events WHERE id='retry'").get().credited,0);
 insert.run('new','d','owner','new','work',day+86400);
 insert.run('other','c','other','other','work',day);
 assert.equal(f.sql.prepare("SELECT credited FROM crew_growth_events WHERE id='new'").get().credited,1);
 assert.equal(f.sql.prepare("SELECT credited FROM crew_growth_events WHERE id='other'").get().credited,1);
});
test('crew XP cannot bypass 184-day maturity in growth view, capacity or retained earned levels',async t=>{
 const f=await fixture(t),at=Math.floor(Date.now()/1000);
 assert.equal(growthLevel(999999,1,at,at).level,1);
 assert.equal(growthLevel(999999,1,at,at+184*86400-1).level,9);
 assert.equal(growthLevel(18500,1,at,at+184*86400).level,10);
 assert.equal(growthLevel(0,5,at,at).level,5,'existing earned levels remain');
 f.sql.prepare("INSERT INTO crews(id,owner_id,name,created,growth_started) VALUES('c','owner','Crew',?,?)").run(at,at);
 f.sql.prepare("INSERT INTO crew_xp VALUES('test','c','owner',999999,?)").run(at);
 const capacity=()=>f.sql.prepare('SELECT '+crewCapacitySQL()+' capacity FROM crews c').get().capacity;
 assert.equal(capacity(),10);
 f.sql.prepare("UPDATE crews SET growth_started=?").run(at-184*86400);assert.equal(capacity(),50);
});
