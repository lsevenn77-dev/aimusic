import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {originRequest,tryPublicOrigin} from '../server/cafe24-origin.js';
import {publicMusicRoute} from '../server/public-music.js';
import {render} from '../ops/cafe24/renderer.mjs';
test('Cafe24 receives only public display fields and render output matches Sites; credentials never cross', async t=>{
 const f=await fixture(t),shell='<main id="main"></main>',env={DB:f.DB,CAFE24_ORIGIN_KEY:'test',ASSETS:{fetch:()=>new Response(shell)}};
 const req=new Request('https://aifect.co.kr/music/one?token=should-never-forward',{headers:{Cookie:'secret=secret'}});
 const path=new URL(req.url).pathname;
 const remote=await tryPublicOrigin(req,env,path,async(e,action,body)=>{
  const {target,data}=JSON.parse(body);assert.equal(target,path);assert.equal(action,'page');
  assert.ok(data.tracks.length);assert.ok(!/user_id|original_key|email|should-never-forward|secret=/.test(body));
  const r=await render(target,data,shell);r.headers.set('x-aifect-rendered','1');return r;});
 assert.equal(remote.headers.get('x-aifect-web-origin'),'cafe24');
 assert.equal(await remote.text(),await (await publicMusicRoute(req,env,path)).text());
 const lost=await tryPublicOrigin(req,env,path,async()=>{throw Error('down')});
 assert.equal(lost.status,200);assert.ok(!(await lost.text()).includes('secret='));
 for(const p of ['/api/account','/admin/','/mcp','/checkout/toss','/media/one/stream','/music/one/../../internal'])
  assert.equal(await tryPublicOrigin(req,env,p,()=>{throw Error('must not contact origin')}),null);
});
test('wire request uses fixed TLS origin, no redirects and a stable encoder endpoint',async()=>{
 const mock=(url,init)=>({url,init}),env={CAFE24_ORIGIN_KEY:'k'};
 const r=await originRequest(env,'webp',new Uint8Array([1]),'image/png',1000,mock,'release1');
 assert.equal(r.url,'https://billing.aifect.co.kr/aifect-origin/v1/webp');assert.equal(r.init.redirect,'error');
 assert.deepEqual(Object.keys(r.init.headers).sort(),['authorization','content-type']);
});
