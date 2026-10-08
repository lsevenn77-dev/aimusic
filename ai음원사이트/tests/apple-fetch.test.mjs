import test from 'node:test';
import assert from 'node:assert/strict';
import appleFetch,{Headers} from '../server/apple-fetch.js';

test('Apple OCSP transport preserves binary bodies and exposes node-fetch buffer',async t=>{
 const bytes=Buffer.from([0,128,255,32]);
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  assert.equal(url,'https://ocsp.example.test');
  assert.equal(init.method,'POST');assert.deepEqual(init.body,bytes);
  assert.equal(init.headers.get('Content-Type'),'application/ocsp-request');
  assert.equal(init.timeout,undefined);assert.ok(init.signal);
  return new Response(bytes,{status:200});
 });
 const response=await appleFetch('https://ocsp.example.test',{method:'POST',body:bytes,headers:new Headers({'Content-Type':'application/ocsp-request'}),timeout:30000});
 assert.equal(response.ok,true);assert.deepEqual(await response.buffer(),bytes);
});
test('Apple OCSP transport preserves failed status and propagates aborts',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
 assert.equal((await appleFetch('https://ocsp.example.test')).ok,false);
 t.mock.method(globalThis,'fetch',async(url,init)=>{init.signal.throwIfAborted();});
 const controller=new AbortController();controller.abort();
 await assert.rejects(appleFetch('https://ocsp.example.test',{signal:controller.signal,timeout:30000}),{name:'AbortError'});
});
test('short Apple OCSP requests use encoded GET without changing the binary response',async t=>{
 const bytes=Buffer.from([251,255,255]);
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  assert.equal(url,'http://ocsp.apple.com/responder/%2B%2F%2F%2F');
  assert.equal(init.method,'GET');assert.equal(init.body,undefined);
  assert.equal(init.headers.get('Content-Type'),null);assert.equal(init.headers.get('Accept'),'application/ocsp-response');
  return new Response(bytes);
 });
 assert.deepEqual(await (await appleFetch('http://ocsp.apple.com/responder',{method:'POST',headers:{'Content-Type':'application/ocsp-request'},body:bytes})).buffer(),bytes);
});
test('large Apple OCSP requests retain POST per RFC 5019',async t=>{
 const bytes=Buffer.alloc(256);
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  assert.equal(url,'http://ocsp.apple.com/responder');assert.equal(init.method,'POST');assert.deepEqual(init.body,bytes);
  return new Response('ok');
 });
 await appleFetch('http://ocsp.apple.com/responder',{method:'POST',headers:{'Content-Type':'application/ocsp-request'},body:bytes});
});
