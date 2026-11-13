import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {memoryBucket,options,sampleScript} from './dubbing-fixtures.mjs';
import worker from '../server/index.js';

test('original author can replace a poster after release, with inherited artwork and access checks',async t=>{
 const bucket=memoryBucket(),env={DUBBING_ENABLED:'true',BUCKET:bucket};
 const {DB,call,sql}=await fixture(t,env);
 const poster=readFileSync(new URL('../dist/assets/dubbing-genres/fantasy.webp',import.meta.url));
 const id=crypto.randomUUID(),root='/api/dubbing/projects/'+id,route=root+'/poster';
 const raw=(url,{method='GET',user='owner',body,headers={}}={})=>worker.fetch(new Request('https://aifect.test'+url,{
  method,body,headers:{Origin:'https://aifect.test',...(user?{Cookie:'aifect_session='+user}:{}),'content-type':'image/webp',...headers}
 }),{...env,DB},{waitUntil(p){p.catch(()=>{});}});
 const {body}=await call('/api/dubbing/projects','POST',{id,options,script:sampleScript()});
 assert.equal(body.project.posterUrl,'');assert.equal(body.project.canEditPoster,true);
 const upload=await raw(route,{method:'PUT',body:poster}),first=(await upload.json()).posterUrl;
 assert.equal(upload.status,200);assert.ok(first.startsWith(route+'?v='));
 assert.equal((await raw(first,{user:null})).status,404);
 assert.equal((await raw(first,{method:'HEAD'})).headers.get('content-type'),'image/webp');
 assert.deepEqual(Buffer.from(await (await raw(first)).arrayBuffer()),poster);
 assert.equal((await call(root+'/publish','POST',{revision:1,rightsAccepted:true})).status,200);
 await bucket.put('bg-key','fixture');
 sql.prepare("INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated) SELECT 'bg',id,script_key,'ai','{}','ready','bg-key',1,1 FROM dubbing_projects WHERE id=?").run(id);
 const child=crypto.randomUUID();
 const c=await call(root+'/performances','POST',{id:child,roleId:'role_1'},'other');
 assert.equal(c.status,201,JSON.stringify(c.body));
 assert.equal((await raw(route,{method:'PUT',user:'other',body:poster})).status,403);
 assert.equal((await raw('/api/dubbing/projects/'+child+'/poster',{method:'PUT',user:'other',body:poster})).status,404);
 const repeat=await raw(route,{method:'PUT',body:poster}),second=(await repeat.json()).posterUrl;
 assert.equal(repeat.status,200);assert.notEqual(first,second);
 assert.equal((await raw(first)).status,404);
 for(const bad of [new Uint8Array(21),poster.subarray(0,60)]){
  assert.equal((await raw(route,{method:'PUT',body:bad})).status,400);
 }
 const item=(await call('/api/dubbing/projects/'+child,'GET',null,'other')).body.project;
 assert.equal(item.posterUrl,second);assert.equal(item.canEditPoster,false);
 assert.equal((await call(root,'GET',null,'other')).body.project.canEditPoster,false);
 assert.equal((await call('/api/dubbing/projects?tab=open&discovery=1','GET',null,null)).body.projects[0].posterUrl,second);
 assert.equal((await call('/api/dubbing/casting/'+id,'GET',null,null)).body.root.posterUrl,second);
 assert.equal((await raw(second,{user:null})).status,200);
 sql.prepare("INSERT INTO user_blocks VALUES('other','owner',0)").run();
 assert.equal((await raw(second,{user:'other'})).status,404);
 sql.prepare('UPDATE dubbing_projects SET deleted_at=1 WHERE id=?').run(id);
 assert.equal((await raw(second)).status,404);
});
