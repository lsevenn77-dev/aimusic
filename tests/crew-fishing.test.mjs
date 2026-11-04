import test from 'node:test';
import {practiceSession} from '../dist/crew-fishing/practice.js';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {encounter,fishingRoute,fishingLimits} from '../server/crew-fishing.js';
import {FISH} from '../dist/crew-fishing/catalog.js';
import {fishValue,BASE_PRICES} from '../dist/crew-fishing/pricing.js';
import {TIERS,SIZES,weighted,season,progressAfter,formatLength} from '../dist/crew-fishing/rules.js';

const monday=Date.parse('2026-11-02T08:00:00+09:00');
test('length display splits metres at 100 cm and truncates residual centimetres to one decimal',()=>{
  for(const [units,expected] of [
    [0,'0cm'],[120000,'12cm'],[456789,'45.6cm'],[999999,'99.9cm'],
    [1000000,'1m'],[1000999,'1m'],[1001000,'1m 0.1cm'],[14309999,'14m 30.9cm'],
    [10000000,'10m'],[140300000,'140m 30cm'],[14300000,'14m 30cm']
  ])assert.equal(formatLength(units),expected);
});
async function setup(t,extraEnv={}){
  const f=await fixture(t);
  f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','테스트 크루',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','leader',0)");
  async function api(action,body,ms=monday,uid='owner'){
    const path='/api/crew-fishing/'+action;
    return (await fishingRoute(new Request('https://aifect.test'+path,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined}),{...extraEnv,DB:f.DB},path.split('?')[0],{id:uid},ms)).json();
  }
  return {...f,api};
}
test('27 species and exact probability intervals, all grade endpoints and species appraisals',()=>{
  const counts=Object.keys(TIERS).map(k=>FISH.filter(f=>f.tier===k).length);
  assert.deepEqual(counts,[10,8,5,3,1]);assert.equal(new Set(FISH.map(f=>f.id)).size,27);
  for(const [table,total] of [[TIERS,10000],[SIZES,100]]){
    const histogram={};
    for(let i=0;i<total;i++){const k=weighted(table,i);histogram[k]=(histogram[k]||0)+1}
    for(const [k,config] of Object.entries(table))assert.equal(histogram[k],config.weight);
  }
  let tierRoll=0;
  for(const [tier,cfg] of Object.entries(TIERS)){
    let gradeRoll=0;
    for(const [grade,size] of Object.entries(SIZES)){
      for(const delta of [size.min,size.max]){
        const draws=[tierRoll,0,gradeRoll,delta-size.min,0];
        const f=encounter(()=>draws.shift());
        const species=FISH.find(x=>x.id===f.fish);
        assert.equal(species.tier,tier);assert.equal(f.grade,grade);
        assert.equal(f.length,species.standardCm*(10000+delta));
        assert.equal(f.amount,fishValue(f.fish,grade));
      }
      gradeRoll+=size.weight;
    }
    tierRoll+=cfg.weight;
  }
});
test('warning survives recovery and starts only on a miss already at zero',()=>{
  let state={goal:3,progress:0,warnings:0};
  for(const [hit,p,w,end] of [[false,0,1,'active'],[true,1,1,'active'],[false,0,1,'active'],[false,0,2,'escaped']]){
    Object.assign(state,progressAfter(state,hit));
    assert.deepEqual([state.progress,state.warnings,state.status],[p,w,end]);
  }
});
test('KST calendar and Friday 22:00 boundary',()=>{
  for(const [iso,open,week] of [['2026-11-06T21:59:59',true,'2026-11-02'],['2026-11-06T22:00:00',false,'2026-11-02'],['2026-11-08T23:59:59',false,'2026-11-02'],['2026-11-09T00:00:00',true,'2026-11-09']]){
    const s=season(Date.parse(iso+'+09:00'));assert.deepEqual([s.open,s.week],[open,week]);
  }
});
test('crew auth, private roll, idempotent casts and pulls, same-pass mash and escaped result',async t=>{
  const {api,call}=await setup(t);
  assert.equal((await call('/api/crew-fishing/lobby','GET',null,null)).status,401);
  await assert.rejects(api('lobby',null,monday,'other'));
  const key=crypto.randomUUID();
  const draws=await Promise.all([key,key,crypto.randomUUID()].map(requestId=>api('cast',{requestId})));
  let c=draws[0].cast;assert.ok(draws.every(r=>r.cast.id===c.id));assert.equal(c.fish,undefined);
  assert.equal((await api('lobby')).remaining,9);
  const first={id:c.id,seq:1,hit:true,value:999999};
  const pulls=await Promise.all([api('pull',first),api('pull',first)]);
  assert.ok(pulls.every(r=>r.cast.warnings===1));
  c=(await api('pull',{id:c.id,seq:2},monday+50)).cast;assert.equal(c.seq,1);
  c=(await api('pull',{id:c.id,seq:2},monday+c.cycle)).cast;assert.equal(c.status,'escaped');assert.equal(c.value,0);
  assert.equal((await api('cast',{requestId:key})).cast.status,'escaped');
  assert.deepEqual((await api('book')).records,[]);assert.equal((await api('lobby')).ours,0);
});
test('all catches are reappraised without rewriting snapshots, length records and collection survive rollover',async t=>{
  const {api,sql}=await setup(t);
  const fish=FISH.find(f=>f.tier==='legend'), gradeCases=[['B',10000,25000,'new'],['D',8100,20000,null],['S',11500,30000,'best'],['S',11900,30000,'best'],['S',11700,30000,null]];
  for(const [grade,factor,amount,notice] of gradeCases){
    let c=(await api('cast',{requestId:crypto.randomUUID()})).cast;
    sql.prepare('UPDATE crew_fishing_casts SET fish=?,grade=?,length=?,amount=? WHERE id=?').run(fish.id,grade,fish.standardCm*factor,amount,c.id);
    for(let seq=1;seq<=c.goal;seq++){
      const phase=(c.target+c.width/2)/100;
      const ms=c.start+Math.round(c.cycle*((seq-1)+phase/2));
      c=(await api('pull',{id:c.id,seq},ms)).cast;
    }
    assert.equal(c.status,'caught');assert.equal(c.notice,notice);
    assert.equal((await api('pull',{id:c.id,seq:c.seq,value:999999999})).cast.value,fishValue(fish.id,grade));
    assert.equal(sql.prepare('SELECT amount FROM crew_fishing_casts WHERE id=?').get(c.id).amount,amount);
    if(gradeCases[2][3]===notice&&factor===11500)assert.equal((await api('lobby')).ours,BASE_PRICES[fish.id]*3);
  }
  const next=monday+7*86400000;
  const record=(await api('book',null,next)).records[0];
  assert.equal(record.length,fish.standardCm*11900);assert.equal(record.count,5);
  const total=gradeCases.reduce((sum,[grade])=>sum+fishValue(fish.id,grade),0);
  const lobby=await api('lobby');assert.equal(lobby.mine,total);assert.equal(lobby.crews[0].score,total);
  assert.equal(lobby.individual[0].score,total);
  assert.equal(lobby.individual[0].place,1);assert.equal((await api('lobby',null,next)).ours,0);
});
test('daily and weekly quotas, active casts cannot cross cutoff or be scored by another member',async t=>{
  const {api,sql}=await setup(t);
  for(let day=0;day<5;day++){
    const ms=monday+day*86400000;
    for(let i=0;i<10;i++){
      const {cast}=await api('cast',{requestId:crypto.randomUUID()},ms);
      const pull={id:cast.id,seq:1};
      if(i===0)await assert.rejects(api('pull',pull,ms,'other'));
      if(day===4&&i===9){
        const close=Date.parse('2026-11-06T22:00:00+09:00');
        await assert.rejects(api('pull',pull,close));
        await assert.rejects(api('cast',{requestId:crypto.randomUUID()},close));
      }
      sql.prepare("UPDATE crew_fishing_casts SET status='escaped' WHERE id=?").run(cast.id);
    }
    await assert.rejects(api('cast',{requestId:crypto.randomUUID()},ms));
  }
  assert.equal((await api('lobby',null,monday+4*86400000)).weeklyRemaining,0);
  assert.equal((await api('lobby',null,monday+7*86400000)).remaining,10);
});

test('practice replays keep only one fish and one award', async () => {
  let ms = 0;
  const session = practiceSession({scope:'member'}, async () => ({fish:FISH[0].id,grade:'B',goal:1,cycle:2000,target:40,width:30,amount:100,length:100000}), () => ms);
  const {cast} = await session.request('cast',{});
  ms = 500;
  assert.equal((await session.request('pull',{id:cast.id,seq:1})).cast.status,'caught');
  await session.request('pull',{id:cast.id,seq:1});
  assert.equal(session.lobby().mine,100);
  assert.equal((await session.request('book')).records[0].count,1);
});

test('account allowance grants 30 remaining after 10 casts, enforces the last cast and expires next day',async t=>{
  const env={CREW_FISHING_QUOTA_OVERRIDES:JSON.stringify({owner:{day:'2026-11-02',dayLimit:40,weekLimit:50}})};
  const {api,sql}=await setup(t,env);
  sql.exec("INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','other','member',0)");
  for(let i=0;i<10;i++){
    const {cast}=await api('cast',{requestId:crypto.randomUUID()});
    sql.prepare("UPDATE crew_fishing_casts SET status='escaped' WHERE id=?").run(cast.id);
  }
  assert.equal((await api('lobby')).remaining,30);
  assert.equal((await api('lobby')).dailyLimit,40);
  assert.equal((await api('lobby')).weeklyLimit,50);
  assert.equal((await api('lobby',null,monday,'other')).remaining,10);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM crew_fishing_casts').get().n,10);
  for(let i=0;i<30;i++){
    const attempts=await Promise.all([api('cast',{requestId:crypto.randomUUID()}),api('cast',{requestId:crypto.randomUUID()})]);
    assert.equal(attempts[0].cast.id,attempts[1].cast.id);
    sql.prepare("UPDATE crew_fishing_casts SET status='escaped' WHERE id=?").run(attempts[0].cast.id);
  }
  assert.equal((await api('lobby')).remaining,0);
  await assert.rejects(api('cast',{requestId:crypto.randomUUID()}));
  assert.equal((await api('lobby',null,monday+86400000)).remaining,10);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM crew_fishing_casts').get().n,40);
});

test('allowances reject malformed, lowering, mismatched and excessive settings',()=>{
  const day='2026-11-02',entry={day,dayLimit:40,weekLimit:50};
  for(const raw of [undefined,'{','null','[]','"text"',JSON.stringify({other:entry}),
    ...[{day:'2026-11-03'},{dayLimit:9},{dayLimit:40.5},{weekLimit:49},{dayLimit:1001},{weekLimit:5001},{dayLimit:60}]
      .map(patch=>JSON.stringify({owner:{...entry,...patch}}))]){
    const limit=fishingLimits({CREW_FISHING_QUOTA_OVERRIDES:raw},'owner',day);
    assert.equal(limit.day,10);assert.equal(limit.week,50);
  }
  const limit=fishingLimits({CREW_FISHING_QUOTA_OVERRIDES:JSON.stringify({owner:entry})},'owner',day);
  assert.equal(limit.day,40);assert.equal(limit.week,50);
});

test('official lobby is the default and practice leaves the official quota intact', async t => {
  const {api,sql} = await setup(t);
  assert.equal((await api('lobby')).remaining, 10);
  assert.equal((await api('lobby?mode=practice')).practice, true);
  assert.ok((await api('practice-cast', {})).draw.fish);
  assert.equal((await api('lobby')).remaining, 10);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM crew_fishing_casts').get().n, 0);
});

test('official pulls judge the touched frame despite server delay, reject stale input, and never double count',async t=>{
  const {api,sql}=await setup(t);
  let c=(await api('cast',{requestId:crypto.randomUUID()})).cast;
  sql.prepare('UPDATE crew_fishing_casts SET target=40,width=30,cycle_ms=3200,goal=3 WHERE id=?').run(c.id);
  const first={id:c.id,seq:1,elapsed:800};
  const result=await api('pull',first,monday+1800);
  assert.equal(result.cast.progress,1);assert.equal(result.cast.warnings,0);
  assert.ok(result.serverTime>=result.receivedTime);
  assert.equal((await api('pull',first,monday+2200)).cast.progress,1);
  c=(await api('pull',{id:c.id,seq:2,elapsed:900},monday+1900)).cast;
  assert.equal(c.seq,1); // Same pass cannot be mashed.
  for(const elapsed of [-1,800,10000,'4000'])
    await assert.rejects(api('pull',{id:c.id,seq:2,elapsed},monday+5000));
  c=(await api('pull',{id:c.id,seq:2,elapsed:4000},monday+5000)).cast;
  assert.equal(c.progress,2);
  c=(await api('pull',{id:c.id,seq:3,elapsed:7200},monday+8200)).cast;
  assert.equal(c.status,'caught');
  assert.equal((await api('lobby')).remaining,9);
});
