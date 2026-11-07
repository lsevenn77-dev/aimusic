import test from 'node:test';
import assert from 'node:assert/strict';
import {createReel} from '../dist/crew-fishing/reel.js';

const initial={id:'fish',status:'active',start:0,cycle:1600,target:40,width:30,goal:3,progress:0,warnings:0,seq:0,lastPass:-1};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
  const requests=[],changes=[],finishes=[],errors=[],confirmed=[];
  const reel=createReel({initial,request:input=>new Promise((resolve,reject)=>requests.push({input,resolve,reject})),
    onChange:(state,kind)=>changes.push({state:{...state},kind}),onConfirmed:(state,settled)=>confirmed.push({state,settled}),
    onFinish:state=>finishes.push(state),onError:error=>errors.push(error.message)});
  const resolve=(index,state=changes[index].state)=>requests[index].resolve({cast:state});
  return {reel,requests,changes,finishes,errors,confirmed,resolve};
}
test('touch advances immediately and accepts the next pass while the first response is delayed',async()=>{
  const f=setup();
  assert.equal(f.reel.tap(400),true);
  assert.equal(f.changes[0].state.progress,1);assert.equal(f.confirmed.length,0);
  assert.equal(f.reel.tap(1200),true);
  assert.equal(f.changes[1].state.progress,2);assert.equal(f.requests.length,1);
  f.resolve(0);await tick();
  assert.equal(f.requests.length,2);assert.equal(f.confirmed[0].settled,false);
  assert.deepEqual(f.requests.map(x=>x.input.seq),[1,2]);
  assert.equal(f.changes.length,2); // A late first response must not rewind the screen.
  f.resolve(1);await tick();assert.equal(f.confirmed[1].state.progress,2);
});
test('final catch animates immediately but the species/result is revealed only after server confirmation',async()=>{
  const f=setup();
  for(let i=0;i<3;i++){
    f.reel.tap(400+i*1600);
    if(i<2){f.resolve(i);await tick();}
  }
  assert.equal(f.changes.at(-1).state.status,'caught');assert.equal(f.finishes.length,0);
  assert.equal(f.reel.tap(10400),false);
  f.resolve(2,{...f.changes[2].state,fish:'stripe-perch',value:100});await tick();
  assert.equal(f.finishes.length,1);assert.equal(f.finishes[0].fish,'stripe-perch');
});
test('failed or rejected delivery restores confirmed state and allows another input',async()=>{
  const f=setup();f.reel.tap(400);f.reel.tap(1200);
  f.requests[0].reject(Error('offline'));await tick();
  assert.equal(f.changes.at(-1).state.progress,0);assert.equal(f.errors[0],'offline');
  f.reel.tap(2000);assert.equal(f.changes.at(-1).state.progress,1);
  assert.equal(f.requests[1].input.seq,1);
  f.requests[1].resolve({cast:{...initial,seq:1,lastPass:2,warnings:1}});await tick();
  assert.equal(f.changes.at(-1).state.warnings,1);
  assert.equal(f.changes.at(-1).kind,'reset');
});
test('a slow response batches all waiting frames and retransmits an unacknowledged batch unchanged',async()=>{
  const packets=[],finish=[],calls=[];
  const r=createReel({initial,request:()=>{throw Error('unexpected single pull')},onChange(){},onFinish:c=>finish.push(c),requestBatch:frames=>{
    packets.push(frames);return new Promise((yes,no)=>calls.push({yes,no}));
  }});
  r.tap(400);r.tap(1200);r.tap(2000);
  assert.equal(packets.length,1);
  calls[0].yes({cast:{...initial,seq:1,lastPass:0,progress:1}});await tick();
  assert.deepEqual(packets[1].map(x=>x.elapsed),[1200,2000]);
  calls[1].no(Object.assign(Error('lost reply'),{retryable:true}));await tick();assert.deepEqual(packets[2],packets[1]);
  calls[2].yes({cast:{...initial,seq:3,lastPass:2,progress:3,status:'caught'}});await tick();assert.equal(finish.length,1);
});
test('leaving a game ignores late responses',async()=>{
  const f=setup();f.reel.tap(400);f.reel.dispose();f.resolve(0);await tick();
  assert.equal(f.confirmed.length,0);assert.equal(f.finishes.length,0);
  assert.equal(f.reel.tap(2000),false);
});

test('same-pass touches keep the fish active but never score twice',async()=>{
  const f=setup();f.reel.tap(400);f.resolve(0);await tick();
  assert.equal(f.reel.tap(600),true);
  assert.equal(f.changes[1].kind,'touch');assert.equal(f.changes[1].state.progress,1);
  assert.equal(f.changes[1].state.expiresAt,3600);
  f.resolve(1);await tick();
  assert.equal(f.reel.expire(3599),false);
  assert.equal(f.reel.expire(3600),true);
  assert.equal(f.changes[2].state.status,'escaped');
  assert.deepEqual(f.requests[2].input,{id:'fish',seq:3,timeout:true});
  f.resolve(2,{...f.changes[2].state,fish:'stripe-perch',value:0});await tick();
  assert.equal(f.finishes.length,1);
});
test('idle expiry waits behind in-flight touches and cannot reveal an unconfirmed result',async()=>{
  const f=setup();f.reel.tap(400);f.reel.tap(1200);
  assert.equal(f.reel.expire(4199),false);assert.equal(f.reel.expire(4200),true);
  assert.equal(f.requests.length,1);assert.equal(f.finishes.length,0);
  f.resolve(0);await tick();f.resolve(1);await tick();
  assert.equal(f.requests.length,3);assert.equal(f.requests[2].input.timeout,true);
  f.resolve(2,{...f.changes[2].state,fish:'stripe-perch',value:0});await tick();
  assert.equal(f.finishes[0].status,'escaped');
});
test('an early client timeout restores the server deadline and permits a valid touch',async()=>{
  const f=setup();f.reel.expire(3000);
  f.resolve(0,{...initial,expiresAt:3100});await tick();
  assert.equal(f.changes.at(-1).kind,'reset');assert.equal(f.changes.at(-1).state.status,'active');
  assert.equal(f.reel.tap(2800),true);
});
