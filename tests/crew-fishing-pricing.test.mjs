import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {FISH} from '../dist/crew-fishing/catalog.js';
import {TIERS,SIZES} from '../dist/crew-fishing/rules.js';
import {BASE_PRICES,COMMON_REFERENCE,fishValue} from '../dist/crew-fishing/pricing.js';
import {FISH_VALUE_SQL} from '../server/crew-fishing-pricing.js';
import {encounter,fishingRoute} from '../server/crew-fishing.js';
import {fixture} from './fixture.mjs';

test('species prices vary within each tier and preserve original 5/5/10/10 average ratios',()=>{
  assert.equal(COMMON_REFERENCE,8460);
  assert.equal(BASE_PRICES['tidal-anchovy'],200);
  assert.equal(BASE_PRICES['ribbon-halfbeak'],2400);
  assert.equal(BASE_PRICES['stripe-perch'],20000);
  assert.equal(BASE_PRICES['ember-clown'],28500);
  const averages=Object.keys(TIERS).map(tier=>{
    const values=FISH.filter(f=>f.tier===tier).map(f=>BASE_PRICES[f.id]);
    assert.equal(new Set(values).size,values.length);
    assert.ok(values.every(p=>Number.isSafeInteger(p)&&p>0));
    return values.reduce((a,b)=>a+b,0)/values.length;
  });
  assert.deepEqual(averages,[8460,42300,211500,2115000,21150000]);
  assert.deepEqual(averages.slice(1).map((v,i)=>v/averages[i]),[5,5,10,10]);
});

test('all 27 species × 5 grades agree between new encounters, result appraisals and SQL ranking values',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const sql=db.prepare(`SELECT ${FISH_VALUE_SQL} AS value FROM (SELECT ? AS fish,? AS grade,? AS amount)`);
  let tierRoll=0;
  for(const [tier,config] of Object.entries(TIERS)){
    const pool=FISH.filter(f=>f.tier===tier);
    for(const [index,fish] of pool.entries()){
      let gradeRoll=0;
      for(const [grade,size] of Object.entries(SIZES)){
        const draws=[tierRoll,index,gradeRoll,0,0];
        const draw=encounter(()=>draws.shift());
        const expected=Math.round(BASE_PRICES[fish.id]*size.percent/100);
        assert.equal(draw.fish,fish.id);assert.equal(draw.grade,grade);
        assert.equal(draw.amount,expected);assert.equal(fishValue(fish.id,grade),expected);
        assert.equal(sql.get(fish.id,grade,123).value,expected);
        gradeRoll+=size.weight;
      }
      assert.deepEqual(['S','A','B','C','D'].map(g=>fishValue(fish.id,g)/BASE_PRICES[fish.id]),[1.2,1.1,1,0.9,0.8]);
    }
    tierRoll+=config.weight;
  }
  for(const [fish,grade] of [['unknown','B'],['stripe-perch','unknown'],['toString','B'],['stripe-perch','toString']]){
    assert.equal(fishValue(fish,grade,123),123);assert.equal(sql.get(fish,grade,123).value,123);
  }
});

test('rank ordering uses species appraisal instead of legacy amounts and all totals agree',async t=>{
  const f=await fixture(t),ms=Date.parse('2026-11-04T10:00:00+09:00');
  f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','평가액 크루',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','leader',0),('crew','other','member',0)");
  const insert=f.sql.prepare("INSERT INTO crew_fishing_casts(id,user_id,crew_id,nickname,request_id,day,week,fish,grade,length,amount,start_ms,cycle_ms,goal,target,width,status) VALUES(?,?,'crew','QA',?,'2026-11-04','2026-11-02',?,'B',200000,?,0,3200,3,20,30,?)");
  insert.run('cheap','owner','cheap-request-key','tidal-anchovy',999999,'caught');
  insert.run('valuable','other','valuable-request-key','stripe-perch',100,'caught');
  insert.run('escaped','owner','escaped-request-key','galaxy-leviathan',250000,'escaped');
  const path='/api/crew-fishing/lobby';
  const lobby=await (await fishingRoute(new Request('https://aifect.test'+path),{DB:f.DB},path,{id:'owner'},ms)).json();
  assert.equal(lobby.mine,200);assert.equal(lobby.ours,20200);
  assert.deepEqual(lobby.individual.map(r=>[r.id,r.score,r.place]),[['other',20000,1],['owner',200,2]]);
  assert.equal(lobby.crews[0].score,20200);
  assert.equal(f.sql.prepare("SELECT amount FROM crew_fishing_casts WHERE id='cheap'").get().amount,999999);
});

test('client-supplied amount and species never set an official or practice draw price',async t=>{
  const f=await fixture(t),ms=Date.parse('2026-11-04T10:00:00+09:00');
  f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','가격 검증',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','leader',0)");
  const api=async action=>{
    const path='/api/crew-fishing/'+action;
    return (await fishingRoute(new Request('https://aifect.test'+path,{method:'POST',body:JSON.stringify({requestId:crypto.randomUUID(),fish:'injected',grade:'S',amount:1,value:1})}),{DB:f.DB},path,{id:'owner'},ms)).json();
  };
  const official=await api('cast');
  assert.equal(official.cast.fish,undefined);assert.equal(official.cast.value,undefined);
  const saved=f.sql.prepare('SELECT fish,grade,amount FROM crew_fishing_casts WHERE id=?').get(official.cast.id);
  assert.equal(saved.amount,fishValue(saved.fish,saved.grade));assert.notEqual(saved.amount,1);
  const {draw}=await api('practice-cast');assert.equal(draw.amount,fishValue(draw.fish,draw.grade));
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS total FROM crew_fishing_casts').get().total,1);
});
