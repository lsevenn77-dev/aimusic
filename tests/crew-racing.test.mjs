import test from 'node:test';
import assert from 'node:assert/strict';
import {decorationsFixture} from './decorations-fixture.mjs';
import {validateRace} from '../server/crew-racing.js';

test('racing garage defaults to the sunset coupe and charges each owned car once',async t=>{
  const f=await decorationsFixture(t,{gold:150});
  const post=(action,car,user)=>f.call('/api/crew-racing/'+action,'POST',{car},user);
  assert.equal((await f.call('/api/crew-racing/lobby')).body.equipped,'c2');
  assert.equal((await post('equip','c1')).status,403);
  assert.equal((await post('buy','c1','')).status,401);
  assert.equal((await post('buy','c1')).status,200);
  assert.equal((await post('buy','c1')).status,200);
  assert.equal(f.sql.prepare("SELECT used FROM gold_purchases WHERE id='funds'").get().used,100);
  assert.equal((await post('equip','c1')).body.equipped,'c1');
  assert.equal((await post('buy','pearl')).status,409);
  f.sql.exec("INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',201)");
  assert.equal((await post('buy','c3')).status,200);
  assert.equal((await post('buy','c3')).status,200);
  assert.equal((await post('buy','c5')).status,409);
  assert.equal(f.sql.prepare("SELECT balance FROM free_gift_wallets WHERE user_id='owner'").get().balance,1);
});

test('racing leaderboard uses one verified weekly best per crew member',async t=>{
  const f=await decorationsFixture(t);
  f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('racecrew','owner','레이싱',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('racecrew','owner','leader',0)");
  const lobby=async()=>(await f.call('/api/crew-racing/lobby')).body;
  const {course}=await lobby();
  for(let i=0;i<2;i++){
    const start=await f.call('/api/crew-racing/start','POST',{course});
    assert.equal(start.status,200);
    const id=start.body.id;
    f.sql.prepare('UPDATE crew_racing_runs SET starts=starts-65000 WHERE id=?').run(id);
    const finish=()=>f.call('/api/crew-racing/finish','POST',{id,events:[]});
    const result=await finish();
    assert.equal(result.status,200);
    assert.deepEqual((await finish()).body,result.body);
  }
  const {ranking,individualRanking}=await lobby();
  assert.equal(ranking.length,1);
  assert.equal(individualRanking.length,1);
  assert.equal(ranking[0].points,individualRanking[0].points);
  assert.throws(()=>validateRace(course,[],500));
  assert.throws(()=>validateRace(course,[[8,1],[7,2]],65000));
});