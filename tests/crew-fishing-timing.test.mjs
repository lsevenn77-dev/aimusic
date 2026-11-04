import test from 'node:test';
import assert from 'node:assert/strict';
import {clockSample,inputElapsed} from '../dist/crew-fishing/timing.js';
import {position} from '../dist/crew-fishing/rules.js';

test('database latency does not shift the needle clock by half a second',()=>{
  // 100 ms each way, 900 ms server processing, a server epoch 1,000,000 ms ahead.
  const sample=clockSample(1000,2100,{receivedTime:1001100,serverTime:1002000});
  assert.equal(sample.offset,1000000);
  assert.equal(sample.delay,200);
  assert.equal(clockSample(0,10,{}),null);
});

test('a displayed hit remains a hit after delayed delivery; invalid timestamps are rejected',()=>{
  const cast={start:10000},cycle=3200,elapsed=800;
  assert.equal(position(inputElapsed(cast,elapsed,11800),cycle),50);
  assert.equal(position(11800-cast.start,cycle),87.5);
  for(const value of [-1,NaN,Infinity,'800',2300,0])
    assert.throws(()=>inputElapsed(cast,value,12001),RangeError);
  assert.equal(inputElapsed(cast,undefined,11800),1800);
});
