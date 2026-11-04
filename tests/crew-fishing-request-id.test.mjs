import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestId} from '../dist/crew-fishing/request-id.js';
import {practiceSession} from '../dist/crew-fishing/practice.js';

test('fishing starts without randomUUID in browsers and webviews',()=>{
  for(const api of [{getRandomValues:bytes=>crypto.getRandomValues(bytes)},null]){
    const keys=Array.from({length:50},()=>createRequestId(api));
    assert.equal(new Set(keys).size,keys.length);
    for(const key of keys)assert.match(key,/^[a-z0-9-]{16,64}$/i);
  }
  assert.equal(createRequestId({randomUUID:()=> 'supported-uuid'}),'supported-uuid');
});

test('practice can create and resume a cast without the randomUUID API',async t=>{
  const randomUUID=Object.getOwnPropertyDescriptor(crypto,'randomUUID');
  Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});
  t.after(()=>{if(randomUUID)Object.defineProperty(crypto,'randomUUID',randomUUID);else delete crypto.randomUUID;});
  const practice=practiceSession({scope:'preview'},async()=>({fish:'test',grade:'B',length:100000,goal:3,cycle:3200,target:20,width:30}),()=>100);
  const first=await practice.request('cast',{}),again=await practice.request('cast',{});
  assert.equal(first.cast.status,'active');assert.equal(again.cast.id,first.cast.id);
});
