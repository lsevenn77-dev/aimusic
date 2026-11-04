import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {start,step,replay,distanceAt,multiplier,LIMIT,RUNNER_X} from '../shared/crew-jump.js';
import {jumpRoute,seasonTime} from '../server/crew-jump.js';
const env={CREW_JUMP_START_MONDAY:'2026-11-02'},monday=Date.parse('2026-11-02T00:00:00+09:00');
test('fixed time and cumulative speed boundaries, no score or acceleration on terminal tick',()=>{
 const s=start('clock');s.pattern={obstacles:[],jellies:[]};
 for(let i=0;i<7;i++)assert.ok(Math.abs(multiplier(i*600)-[1,1.2,1.44,1.728,2.0736,2.48832,2.985984][i])<1e-9);
 assert.equal(multiplier(4200),multiplier(4199));
 for(let stage=0;stage<14;stage++)assert.equal(multiplier(4200+stage*300),1.2**6*1.1**stage);
 assert.equal(multiplier(8400),multiplier(8399));
 while(s.tick<8399)step(s);assert.equal(s.finished,null);const points=s.score,dist=s.distance;
 step(s,true);step(s,true);assert.deepEqual([s.tick,s.finished,s.score,s.distance],[8400,'survived',points,dist]);
});
test('double jump requires new input and resets on landing',()=>{
 const s=start('jump');step(s,true);assert.equal(s.jumps,1);step(s,true);const v=s.vy;step(s,true);assert.ok(s.vy<v);assert.equal(s.jumps,2);
 while(s.y>0)step(s);assert.equal(s.jumps,0);step(s,true);assert.equal(s.jumps,1);
});
function clearPath(seed){
 const inputs=[];
 for(const o of start(seed).pattern.obstacles){
  let lo=0,hi=LIMIT;while(lo<hi){const mid=(lo+hi)>>1;if(distanceAt(mid)+RUNNER_X<o.x)lo=mid+1;else hi=mid}
  if(o.type==='bird'&&o.bottom>80)continue;
  if(o.height>=145)inputs.push(lo-25,lo-10);else inputs.push(lo-19);
 }
 return inputs;
}
test('later bands require double jumps and have closer encounters; 100 weekly routes remain clearable',()=>{
 for(let n=0;n<100;n++){
  const seed='test'+n,inputs=clearPath(seed);
  const within=(a,b)=>start(seed).pattern.obstacles.filter(o=>o.x>=distanceAt(a*60)+RUNNER_X&&o.x<distanceAt(b*60)+RUNNER_X);
  assert.ok(within(60,70).length>within(0,10).length);
  assert.ok(within(20,35).some(o=>o.height>150));
  const pattern=start(seed).pattern;
  for(const bird of pattern.obstacles.filter(o=>o.type==='bird'))assert.ok(!pattern.jellies.some(j=>j.x>=bird.x-20&&j.x<=bird.x+bird.width+20));
  const r=replay(seed,inputs);assert.equal(r.finished,'survived');assert.ok(r.jellies>0&&r.maxCombo>0);assert.equal(replay(seed,inputs).score,r.score);
 }
 assert.equal(replay('collision',[]).finished,'collision');for(const bad of [[-1],[3,2],[4,4],[LIMIT-1]])assert.throws(()=>replay('collision',bad));
});
test('server accepts a full 140 second replay only after the new finish time',async t=>{
 const f=await fixture(t);seedCrew(f);
 const call=(action,body,ms)=>jumpRoute(new Request('https://aifect.test/',{method:'POST',body:JSON.stringify(body)}),{DB:f.DB,...env},'/api/crews/preview/jump/'+action,{id:'owner'},ms).then(r=>r.json());
 const run=await call('start',{requestId:'full-seventy-seconds'},monday);
 const inputs=clearPath(run.seed);
 await assert.rejects(call('finish',{id:run.id,inputs},run.starts+70000),{status:409});
 const record=await call('finish',{id:run.id,inputs},run.starts+140000);
 assert.equal(record.score,replay(run.seed,inputs).score);
});
test('KST weekly window, midnight, and inactive season',()=>{
 const at=ms=>seasonTime(ms,env);assert.equal(at(monday-1).open,false);assert.equal(at(monday).open,true);assert.equal(at(monday+86400000).day,'2026-11-03');
 const end=monday+(4*24+22)*3600000;assert.ok(at(end-1).open);assert.equal(at(end).open,false);
 assert.equal(at(monday+7*86400000).open,true);assert.notEqual(at(monday).seed,at(monday+7*86400000).seed);assert.equal(seasonTime(monday,{}).open,false);
});
function seedCrew(f){
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('preview','owner','별빛',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('preview','owner','leader',0)");
}
test('API verifies membership, daily quota, concurrent starts, server replay, idempotent finish and no XP',async t=>{
 const f=await fixture(t);seedCrew(f);let ms=monday;
 const call=(action,body,uid='owner')=>jumpRoute(new Request('https://aifect.test/',{method:body?'POST':'GET',body:body&&JSON.stringify(body)}),{DB:f.DB,...env},'/api/crews/preview/jump'+action,uid?{id:uid}:null,ms).then(x=>x.json());
 await assert.rejects(call('',undefined,'other'),{status:403});await assert.rejects(call('',undefined,null),{status:401});
 let data=await call('');assert.equal(data.remaining,3);assert.equal(data.team,0);
 const key={requestId:'local-fixture-first'};
 const [a,b]=await Promise.all([call('/start',key),call('/start',key)]);assert.equal(a.id,b.id);
 await assert.rejects(call('/start',{requestId:'competing-tab-key'}),{status:409});
 const result={id:a.id,inputs:[],score:99999999};
 await assert.rejects(call('/finish',result),{status:409});ms+=15000;
 const stored=await call('/finish',result);assert.equal(stored.score,replay(data.seed,[]).score);assert.deepEqual(await call('/finish',result),stored);
 for(let i=0;i<2;i++){const r=await call('/start',{requestId:'local-fixture-round'+i});ms+=15000;await call('/finish',{...result,id:r.id})}
 await assert.rejects(call('/start',{requestId:'local-fixture-fourth'}),{status:409});data=await call('');
 assert.equal(data.best,stored.score);assert.equal(data.team,stored.score);assert.equal(data.participated,true);assert.equal(data.remaining,0);
 assert.equal(f.sql.prepare('select count(*) n from crew_xp').get().n,0);
});
test('crew total keeps each distinct member’s maximum and only the first ten scores',async t=>{
 const f=await fixture(t);seedCrew(f);
 const insert=f.sql.prepare("INSERT INTO crew_jump_runs(id,user_id,crew_id,week,day,request_id,seed,version,starts,score) VALUES(?,?,'preview','2026-11-02','2026-11-02',?,'s','v',0,?)");
 for(let i=1;i<=12;i++){const u='u'+i;f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(u,u+'@example.test',u);for(let k=0;k<2;k++)insert.run(u+k,u,'r'+k,i*10-k)}
 const res=await jumpRoute(new Request('https://aifect.test/'),{...env,DB:f.DB},'/api/crews/preview/jump',{id:'owner'},monday);
 const data=await res.json();assert.equal(data.team,750);assert.equal(data.teamRank,1);assert.equal(data.ranking[0].members,10);assert.equal(data.participated,false);
});
test('playtest scoring caps combo bonuses, misses reset combo and terminal frames award nothing',()=>{
 const s=start('points');s.pattern={obstacles:[],jellies:Array.from({length:20},()=>({x:RUNNER_X,height:24}))};
 step(s);assert.equal(s.jellies,20);assert.equal(s.maxCombo,20);
 assert.equal(s.score,2000+55+9*10);
 step(s);assert.equal(s.jellies,20);assert.equal(s.combo,20);
 s.pattern.jellies.push({x:0,height:0});step(s);assert.equal(s.combo,0);
 assert.throws(()=>replay('air',[1,2,3]));
});
test('abandoned runs never score, do not restore attempts, and cutoff allows time for submission',async t=>{
 const f=await fixture(t);seedCrew(f);
 const call=(action,body,time)=>jumpRoute(new Request('https://aifect.test/',{method:'POST',body:JSON.stringify(body)}),{DB:f.DB,...env},'/api/crews/preview/jump/'+action,{id:'owner'},time).then(x=>x.json());
 const r=await call('start',{requestId:'abandon-then-try'},monday);await call('abandon',{id:r.id},monday+2000);
 await assert.rejects(call('finish',{id:r.id,inputs:[]},monday+12000),{status:409});
 await call('start',{requestId:'second-after-exit'},monday+5000);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM crew_jump_runs').get().n,2);
 const close=monday+118*3600000;
 await assert.rejects(call('start',{requestId:'before-the-close'},close-60000),{status:409});
 assert.equal(f.sql.prepare('SELECT COUNT(score) n FROM crew_jump_runs').get().n,0);
});

test('three abandoned attempts exhaust the account quota across crews until KST midnight',async t=>{
 const f=await fixture(t);seedCrew(f);
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('second','owner','두 번째',0)");
 const midnight=monday+86400000;let ms=midnight-600000;
 const call=(action,body,crew='preview')=>jumpRoute(new Request('https://aifect.test/',{method:body?'POST':'GET',body:body&&JSON.stringify(body)}),{DB:f.DB,...env},'/api/crews/'+crew+'/jump'+action,{id:'owner'},ms).then(r=>r.json());
 for(let i=0;i<3;i++){
  const key={requestId:'abandoned-quota-round-'+i};
  const run=await call('/start',key);
  assert.equal((await call('/start',key)).id,run.id); // Retry the last slot without consuming another one.
  await call('/abandon',{id:run.id});ms+=10000;
 }
 assert.equal((await call('')).remaining,0);
 const attempts=await Promise.allSettled([call('/start',{requestId:'fourth-tab-one'}),call('/start',{requestId:'fourth-tab-two'})]);
 for(const result of attempts){assert.equal(result.status,'rejected');assert.equal(result.reason.status,409);assert.match(result.reason.message,/3회를 모두 사용/)}
 f.sql.exec("UPDATE crew_members SET crew_id='second' WHERE user_id='owner'");
 assert.equal((await call('',undefined,'second')).remaining,0);
 await assert.rejects(call('/start',{requestId:'other-crew-attempt'},'second'),{status:409,message:/3회를 모두 사용/});
 f.sql.exec("UPDATE crew_members SET crew_id='preview' WHERE user_id='owner'");
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM crew_jump_runs').get().n,3);
 ms=midnight-1;assert.equal((await call('')).remaining,0);
 ms=midnight;assert.equal((await call('')).remaining,3);
 await call('/start',{requestId:'first-after-midnight'});
 assert.equal((await call('')).remaining,2);
});

test('weekly standings rank competing crews, share ties, and ignore practice / abandoned attempts',async t=>{
 const f=await fixture(t);seedCrew(f);
 for(const [c,u,score] of [['a','p1',901],['b','p2',901],['preview','owner',750],['preview','other',null]]){
  if(c!=='preview'){f.sql.prepare('INSERT INTO crews(id,owner_id,name,created) VALUES(?,?,?,0)').run(c,'owner',c);f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(u,u+'@test.invalid',u)}
  f.sql.prepare("INSERT INTO crew_jump_runs(id,user_id,crew_id,week,day,request_id,seed,version,starts,score) VALUES(?,?,?,'2026-11-02','2026-11-02','r','s','v',0,?)").run(c+u,u,c,score);
 }
 const res=await jumpRoute(new Request('https://aifect.test/'),{...env,DB:f.DB},'/api/crews/preview/jump',{id:'owner'},monday);
 const data=await res.json();assert.deepEqual(data.ranking.map(x=>x.place),[1,1,3]);assert.equal(data.teamRank,3);assert.equal(data.participated,true);
 assert.deepEqual(data.individualRanking.map(row=>[row.place,row.points]),[[1,901],[1,901],[3,750]]);
 assert.equal(data.personalRank,3);assert.equal(data.best,750);
 assert.equal(data.individualRanking.filter(row=>row.mine).length,1);
});

test('both weekly boards include place 100 and retain the viewer outside the displayed ranks',async t=>{
 const f=await fixture(t);seedCrew(f);
 const person=f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)');
 const team=f.sql.prepare("INSERT INTO crews(id,owner_id,name,created) VALUES(?,'owner',?,0)");
 const run=f.sql.prepare("INSERT INTO crew_jump_runs(id,user_id,crew_id,week,day,request_id,seed,version,starts,score) VALUES(?,?,?,'2026-11-02','2026-11-02','r','s','v',0,?)");
 for(let n=1;n<=102;n++){const id='rank'+n;person.run(id,id+'@test.invalid',id);team.run(id,id);run.run(id,id,id,1000-n)}
 run.run('my-rank','owner','preview',1);
 const data=await (await jumpRoute(new Request('https://aifect.test/'),{...env,DB:f.DB},'/api/crews/preview/jump',{id:'owner'},monday)).json();
 for(const list of [data.ranking,data.individualRanking]){assert.deepEqual(list.map(r=>r.place),[...Array.from({length:100},(_,i)=>i+1),103])}
 assert.equal(data.personalRank,103);assert.equal(data.teamRank,103);
});
