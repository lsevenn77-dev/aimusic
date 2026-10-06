import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/index.js';

test('legacy page visits enter the registered Google login origin',async()=>{
 const response=await worker.fetch(new Request('https://wavv-music-design-lseve.sassy-auk-0975.chatgpt.site/?from=app'),{},{});
 assert.equal(response.status,308);assert.equal(response.headers.get('Location'),'https://aifect.co.kr/?from=app');
 const canonical=await worker.fetch(new Request('https://aifect.co.kr/'),{ASSETS:{fetch:()=>new Response('site')}},{});
 assert.equal(canonical.status,200);assert.equal(await canonical.text(),'site');
 const local=await worker.fetch(new Request('http://127.0.0.1:4184/'),{ASSETS:{fetch:()=>new Response('local')}},{});
 assert.equal(local.status,200);
});
