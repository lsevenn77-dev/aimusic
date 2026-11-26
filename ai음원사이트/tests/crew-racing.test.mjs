import test from 'node:test';
import assert from 'node:assert/strict';
import {decorationsFixture} from './decorations-fixture.mjs';
import {validateRace} from '../server/crew-racing.js';
import {CARS,SPEED_RULES} from '../dist/crew-racing/catalog.js';
import {CAR,createRace,newRun,STEP,computeScore} from '../dist/crew-racing/physics.js';

test('each paid tier gains two actual km/h on the straight and retains the same acceleration',()=>{
  const race=createRace('riverside');
  for(const [index,car] of CARS.entries()){
    const s=newRun(car.speedBonus);s.countdown=0;
    race.step(s,STEP);assert.equal(s.speed,CAR.accel*STEP);
    for(let i=0;i<720;i++){s.z=0;race.step(s,STEP);}
    assert.equal(Math.round(s.speed/CAR.maxSpeed*280),280+2*index);
    s.gauge=100;s.input.boost=true;
    for(let i=0;i<170;i++){s.z=0;race.step(s,STEP);}
    assert.ok(Math.abs(s.speed/CAR.maxSpeed*280-(280+2*index)*CAR.boostMul)<1e-6);
  }
});

test('official replay uses the equipped car at start despite a later equip, and preserves in-flight legacy runs',async t=>{
  const f=await decorationsFixture(t);
  f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('racecrew','owner','레이싱',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('racecrew','owner','leader',0)");
  const post=(action,payload)=>f.call('/api/crew-racing/'+action,'POST',payload);
  const {course,remaining}= (await f.call('/api/crew-racing/lobby')).body;
  assert.equal((await post('start',{course})).status,409);
  assert.equal((await f.call('/api/crew-racing/lobby')).body.remaining,remaining);
  await post('buy',{car:'pearl'});await post('equip',{car:'pearl'});
  const {id,equipped,speedBonus}=(await post('start',{course,rules:SPEED_RULES,car:'c3',speedBonus:100})).body;
  assert.equal(equipped,'pearl');assert.equal(speedBonus,10);
  await post('equip',{car:'c2'});
  f.sql.prepare('UPDATE crew_racing_runs SET starts=starts-65000 WHERE id=?').run(id);
  const expected=bonus=>{const race=createRace(course),s=newRun(bonus);while(!s.ended)race.step(s,STEP);return computeScore(s.finished,s.t,s.z/race.TRACK_LEN);};
  assert.notEqual(expected(0),expected(10));
  assert.deepEqual((await post('finish',{id,events:[],speedBonus:1})).body,{score:expected(10)});
  f.sql.prepare("INSERT INTO crew_racing_runs SELECT 'old-run',user_id,crew_id,week,course,starts,NULL FROM crew_racing_runs WHERE id=?").run(id);
  assert.deepEqual((await post('finish',{id:'old-run',events:[]})).body,{score:expected(0)});
});

test('racing garage defaults to the sunset coupe and charges each owned car once',async t=>{
  const f=await decorationsFixture(t,{gold:150});
  const post=(action,car,user)=>f.call('/api/crew-racing/'+action,'POST',{car},user);
  assert.equal((await f.call('/api/crew-racing/lobby')).body.equipped,'c2');
  const wallet=async uid=>(await f.call('/api/crew-racing/garage','GET',null,uid)).body.balance;
  assert.equal(await wallet(''),null);assert.deepEqual(await wallet('other'),{S:0,G:0});
  assert.deepEqual(await wallet('owner'),{S:0,G:150});
  assert.equal((await post('equip','c1')).status,403);
  assert.equal((await post('buy','c1','')).status,401);
  assert.equal((await post('buy','c1')).status,200);
  assert.equal((await post('buy','c1')).status,200);
  assert.equal(f.sql.prepare("SELECT used FROM gold_purchases WHERE id='funds'").get().used,100);
  const equipped=(await post('equip','c1')).body;
  assert.equal(equipped.equipped,'c1');assert.deepEqual(equipped.balance,{S:0,G:50});
  assert.equal((await post('buy','pearl')).status,409);
  f.sql.exec("INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',201)");
  assert.deepEqual((await post('buy','c3')).body.balance,{S:1,G:50});
  assert.deepEqual((await post('buy','c3')).body.balance,{S:1,G:50});
  assert.equal((await post('buy','c5')).status,409);
  assert.equal(f.sql.prepare("SELECT balance FROM free_gift_wallets WHERE user_id='owner'").get().balance,1);
  f.sql.exec("INSERT INTO gold_orders(id,user_id,request_id,state,created,expires,updated) VALUES('funds','owner','refund','refund_review',0,1,0)");
  assert.deepEqual(await wallet('owner'),{S:1,G:0});
});

test('racing leaderboard uses one verified weekly best per crew member',async t=>{
  const f=await decorationsFixture(t);
  f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('racecrew','owner','레이싱',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('racecrew','owner','leader',0)");
  const lobby=async()=>(await f.call('/api/crew-racing/lobby')).body;
  const {course}=await lobby();
  for(let i=0;i<2;i++){
    const start=await f.call('/api/crew-racing/start','POST',{course,rules:SPEED_RULES});
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
