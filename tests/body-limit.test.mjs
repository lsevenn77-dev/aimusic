import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';

test('JSON body limits inspect actual bytes even without or with an understated content-length',async t=>{
 const f=await fixture(t),body=JSON.stringify({name:'QA',bio:'',padding:'x'.repeat(40000)});
 for(const length of [undefined,'10',String(body.length)]){
  const r=await worker.fetch(new Request('https://aifect.test/api/me/profile',{method:'PUT',headers:{Origin:'https://aifect.test',Cookie:'aifect_session=owner','Content-Type':'application/json',...(length?{'content-length':length}:{})},body}),{DB:f.DB},{waitUntil(){}});
  assert.equal(r.status,413);
 }
 assert.equal((await f.call('/api/me/profile','PUT',{name:'QA',bio:'valid'})).status,200);
});
