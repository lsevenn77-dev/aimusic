import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('legacy page visits enter the registered Google login origin',async t=>{
 const {DB}=await fixture(t);
 const response=await worker.fetch(new Request('https://wavv-music-design-lseve.sassy-auk-0975.chatgpt.site/?from=app'),{},{});
 assert.equal(response.status,308);assert.equal(response.headers.get('Location'),'https://aifect.co.kr/?from=app');
 const canonical=await worker.fetch(new Request('https://aifect.co.kr/'),{DB,ASSETS:{fetch:()=>new Response('site')}},{});
 assert.equal(canonical.status,200);assert.equal(canonical.headers.get('Location'),null);
 const local=await worker.fetch(new Request('http://127.0.0.1:4184/'),{DB,ASSETS:{fetch:()=>new Response('local')}},{});
 assert.equal(local.status,200);
});
test('browser origin normalization preserves the login route behind a host-normalizing proxy',()=>{
 const script=readFileSync(new URL('../dist/canonical-origin.js',import.meta.url),'utf8');
 let target;const location={hostname:'wavv-music-design-lseve.sassy-auk-0975.chatgpt.site',pathname:'/',search:'?from=app',hash:'#account',replace:url=>target=url};
 vm.runInNewContext(script,{location});assert.equal(target,'https://aifect.co.kr/?from=app#account');
 target=undefined;location.hostname='aifect.co.kr';vm.runInNewContext(script,{location});assert.equal(target,undefined);
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');assert.match(html,/<head><script src="\/canonical-origin.js"><\/script>/);
});
