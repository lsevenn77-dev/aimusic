import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';
import worker from '../server/index.js';

async function setup(t){
 t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,9,20,22,29,10)});
 // These tests only enqueue jobs; no real paid provider may be called.
 t.mock.method(globalThis,'fetch',async()=>{throw Error('Unexpected external request');});
 const settings={DUBBING_ENABLED:'true',DUBBING_SOUND_ENABLED:'true',DUBBING_PAID_API_ENABLED:'true',DUBBING_GOLD_ENABLED:'true',
  TRANSCODER_TOKEN:'local-test',PIKA_API_KEY:'mock-only',BUCKET:memoryBucket()};
 const f=await fixture(t,settings),env={...settings,DB:f.DB};
 const create=async()=>{const r=await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript()});assert.equal(r.status,201);return r.body.project;};
 const queue=async(p,{mobile=false,mode='ai',requestId=crypto.randomUUID()}={})=>{
  const r=await worker.fetch(new Request('https://aifect.test/api/dubbing/projects/'+p.id+'/sound',{method:'POST',
   headers:{Origin:'https://aifect.test',Cookie:'aifect_session=owner','Content-Type':'application/json',
    'User-Agent':mobile?'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 SamsungBrowser/30.0 Mobile Safari/537.36':'Mozilla/5.0 (Macintosh) Safari/605.1.15'},
   body:JSON.stringify({requestId,mode,revision:p.revision,acceptedGold:50,acceptedChargeGold:50})}),env,{waitUntil(p){p.catch(()=>{});}});
  return {status:r.status,body:await r.json(),retry:r.headers.get('retry-after')};
 };
 const seed=gold=>f.sql.prepare("INSERT INTO gold_purchases(id,user_id,channel,gold,used,price_krw,status,created,paid_at) VALUES(?,'owner','test',?,0,1000,'paid',0,0)").run(crypto.randomUUID(),gold);
 const counted=()=>f.sql.prepare("SELECT COALESCE(SUM(count),0) n FROM rate_limits WHERE key LIKE 'dubbing-sound-start:%'").get().n;
 const charged=()=>f.sql.prepare('SELECT COALESCE(SUM(used),0) n FROM gold_purchases').get().n;
 return {...f,create,queue,seed,counted,charged};
}

test('mobile and desktop can create audio despite an exhausted legacy daily counter',async t=>{
 const f=await setup(t);f.seed(500);
 const at=Math.floor(Date.now()/1000),key='dubbing-sound:owner:'+Math.floor(at/86400);
 f.sql.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,10,?)').run(key,at+86400);
 for(let i=0;i<4;i++)assert.equal((await f.queue(await f.create(),{mobile:i%2===1})).status,202);
 assert.equal(f.counted(),4);assert.equal(f.charged(),200);
 assert.equal(f.sql.prepare('SELECT count FROM rate_limits WHERE key=?').get(key).count,10);
});

test('rejected payments and stale revisions do not exhaust audio admission',async t=>{
 const f=await setup(t),p=await f.create();
 for(let i=0;i<8;i++)assert.equal((await f.queue(p,{mobile:true})).status,409);
 assert.equal(f.counted(),0);assert.equal(f.charged(),0);
 f.seed(100);
 assert.equal((await f.queue({...p,revision:0})).status,409);assert.equal(f.counted(),0);
 assert.equal((await f.queue(p,{mobile:true})).status,202);assert.equal(f.counted(),1);assert.equal(f.charged(),50);
});

test('concurrent burst admission is atomic with Gold, replays and polling remain available, and expires in a minute',async t=>{
 const f=await setup(t);f.seed(1000);
 const projects=[];for(let i=0;i<8;i++)projects.push(await f.create());
 const results=await Promise.all(projects.map((p,i)=>f.queue(p,{mobile:i%2===1})));
 assert.equal(results.filter(r=>r.status===202).length,6);
 const rejected=results.map((r,i)=>({r,p:projects[i]})).filter(({r})=>r.status===429);
 assert.equal(rejected.length,2);assert.equal(f.counted(),6);assert.equal(f.charged(),300);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_sound_jobs').get().n,6);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_gold_orders').get().n,6);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_sound_assets').get().n,6);
 for(const {r} of rejected){assert.equal(r.retry,'50');assert.equal(r.body.retryAfterSeconds,50);assert.match(r.body.error,/골드는 차감되지 않았습니다/);}
 const accepted=projects[results.findIndex(r=>r.status===202)];
 assert.equal((await f.queue(accepted,{mobile:true})).status,200);
 assert.equal((await f.call('/api/dubbing/projects/'+accepted.id+'/sound')).status,200);
 assert.equal(f.counted(),6);assert.equal(f.charged(),300);
 t.mock.timers.tick(51000);
 assert.equal((await f.queue(rejected[0].p,{mobile:true})).status,202);
 assert.equal(f.charged(),350);
});

test('a payment race rolls back admission along with its job and charge',async t=>{
 const f=await setup(t);f.seed(60);const a=await f.create(),b=await f.create();
 const results=await Promise.all([f.queue(a),f.queue(b,{mobile:true})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[202,409]);assert.equal(f.counted(),1);assert.equal(f.charged(),50);
 f.seed(50);const loser=results[0].status===409?a:b;
 assert.equal((await f.queue(loser,{mobile:true})).status,202);assert.equal(f.counted(),2);assert.equal(f.charged(),100);
});

test('free recording backgrounds share burst protection without charging or counting repeat taps',async t=>{
 const f=await setup(t),p=await f.create(),requestId=crypto.randomUUID();
 const results=await Promise.all([f.queue(p,{mode:'basic',requestId}),f.queue(p,{mode:'basic',requestId,mobile:true})]);
 assert.ok(results.every(r=>[200,202].includes(r.status)));assert.equal(f.counted(),1);assert.equal(f.charged(),0);
 for(let i=0;i<5;i++)assert.equal((await f.queue(await f.create(),{mode:'basic'})).status,202);
 assert.equal((await f.queue(await f.create(),{mode:'basic',mobile:true})).status,429);
 assert.equal((await f.queue(p,{mode:'basic',mobile:true})).status,200);
 assert.equal(f.counted(),6);assert.equal(f.charged(),0);
});
