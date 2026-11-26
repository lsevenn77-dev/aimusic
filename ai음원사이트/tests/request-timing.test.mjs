import test from 'node:test';
import assert from 'node:assert/strict';
import {observeReadRequest} from '../server/request-timing.js';

test('timing preserves native statement methods and batch arguments without logging private values',async()=>{
 let time=0;const logs=[],secret='private-user-token-and-sql';
 const meta={duration:0.3,rows_read:4,rows_written:0,served_by_region:'ENAM',served_by_colo:'IAD',served_by_primary:true,unwanted:secret};
 class Statement{
  #args=[];
  bind(...args){this.#args=args;return this;}
  async first(column){time+=200;return column?this.#args[0]:{value:this.#args[0]};}
  async all(){time+=250;return {results:[{value:this.#args[0]}],meta};}
  async run(){time+=220;return {success:true,meta};}
  async raw(){time+=210;return [[this.#args[0]]];}
 }
 const DB={prepare(){return new Statement();},async batch(statements){assert.ok(statements.every(s=>s instanceof Statement));return Promise.all(statements.map(s=>s.run()));}};
 const request=new Request('https://aifect.test/api/producers/'+secret+'?email='+secret,{headers:{'x-aifect-timing':'1',cookie:secret,'cf-ray':'0123456789abcdef-ICN'}});
 const response=await observeReadRequest(request,{DB},{},async(_req,env)=>{
  const statement=env.DB.prepare(secret).bind(secret);
  assert.deepEqual(await statement.first(),{value:secret});assert.equal(await statement.first('value'),secret);
  assert.deepEqual((await statement.all()).results,[{value:secret}]);
  assert.deepEqual(await statement.raw(),[[secret]]);
  assert.equal((await env.DB.batch([statement]))[0].success,true);
  return new Response('unchanged body',{status:202,headers:{'cache-control':'private, no-store'}});
 },{clock:()=>time,log:event=>logs.push(event)});
 assert.equal(response.status,202);assert.equal(await response.text(),'unchanged body');
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.match(response.headers.get('server-timing'),/sql_ms=0.3;region=ENAM;colo=IAD/);
 assert.equal(logs.length,1);assert.equal(logs[0].route,'/api/producers/:id');
 assert.equal(logs[0].completed_db_operations.length,5);
 assert.ok(!JSON.stringify(logs).includes(secret));assert.ok(!response.headers.get('server-timing').includes(secret));
});

test('ordinary fast responses stay unchanged; slow response time excludes later background work',async()=>{
 let time=0,finish;const logs=[];
 const DB={prepare(){return {bind(){return this;},all(){return new Promise(resolve=>{finish=()=>resolve({results:[],meta:{duration:0.1}});});}};}};
 const request=new Request('https://aifect.test/api/catalog?private=not-logged');
 const original=Response.json({ok:true});
 const fast=await observeReadRequest(request,{DB},{},async()=>original,{clock:()=>time,log:event=>logs.push(event)});
 assert.equal(fast,original);assert.equal(logs.length,0);
 let background;
 const slow=await observeReadRequest(request,{DB},{},async(_req,env)=>{
  background=env.DB.prepare('private query').bind('private parameter').all();time=1200;return original;
 },{clock:()=>time,log:event=>logs.push(event)});
 assert.equal(slow,original);assert.equal(logs[0].response_ms,1200);
 time=9000;finish();await background;
 assert.equal(logs[0].completed_db_operations.length,0);
 assert.equal(slow.headers.get('server-timing'),null);
});

test('writes, financial/auth endpoints and internal jobs retain the original database identity',async()=>{
 const env={DB:{}},logs=[];
 for(const [path,method] of [['/mcp','GET'],['/internal/jobs/claim','POST'],['/api/account/password','PUT'],['/api/gold','GET'],['/api/catalog','POST']]){
  const response=await observeReadRequest(new Request('https://aifect.test'+path,{method,headers:{'x-aifect-timing':'1'}}),env,{},async(_req,actual)=>{assert.equal(actual,env);return Response.json({ok:true});},{log:event=>logs.push(event)});
  assert.equal(response.status,200);assert.equal(response.headers.get('server-timing'),null);
 }
 assert.equal(logs.length,0);
});
