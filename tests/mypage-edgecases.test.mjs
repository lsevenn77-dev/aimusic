import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Worker} from 'node:worker_threads';
import {mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';

test('independent SQLite writers issue unique public numbers atomically',async()=>{
 const base=resolve('work/id-concurrency');mkdirSync(base,{recursive:true});const dir=mkdtempSync(base+sep+'test-'),path=resolve(dir,'members.sqlite');
 const sql=new DatabaseSync(path);sql.exec('PRAGMA journal_mode=WAL; CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER)');sql.exec(readFileSync(new URL('../drizzle/0064_public_member_ids.sql',import.meta.url),'utf8'));
 try{
  await Promise.all(Array.from({length:6},(_,w)=>new Promise((res,rej)=>{
   const t=new Worker(`const {workerData,parentPort}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData.path);db.exec('PRAGMA busy_timeout=10000');const q=db.prepare('INSERT INTO users VALUES(?,?)');for(let i=0;i<20;i++)q.run(workerData.w+'-'+i,i);db.close();parentPort.postMessage('done');`,{eval:true,workerData:{path,w}});t.once('error',rej);t.once('exit',code=>code?rej(Error('writer '+code)):res());
  })));
  assert.equal(sql.prepare('SELECT count(*) n FROM public_member_ids').get().n,120);
  assert.equal(sql.prepare('SELECT count(DISTINCT number) n FROM public_member_ids').get().n,120);
  assert.equal(sql.prepare('SELECT count(*) n FROM users u LEFT JOIN public_member_ids m ON m.user_id=u.id WHERE m.number IS NULL').get().n,0);
 }finally{sql.close();if(!dir.startsWith(base+sep))throw Error('Unsafe fixture cleanup path');rmSync(dir,{recursive:true,force:true});}
});

test('logout and login keep the same public ID with actual session cookies',async t=>{
 const f=await fixture(t),env={DB:f.DB,AUTH_PEPPER:'fixture-only'};
 const ctx={waitUntil(p){p.catch(()=>{});}};
 const call=async(path,body,cookie='')=>worker.fetch(new Request('https://aifect.test'+path,{method:'POST',headers:{Origin:'https://aifect.test','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body||{})}),env,ctx);
 const credentials={email:'roundtrip@example.test',name:'재로그인회원',password:'fixture-long-password'};
 const registered=await call('/api/auth/register',credentials);assert.equal(registered.status,200);const uid=(await registered.json()).user.id,number=f.sql.prepare('SELECT number FROM public_member_ids WHERE user_id=?').get(uid).number;
 const cookie=registered.headers.get('set-cookie').split(';')[0];assert.equal((await call('/api/auth/logout',{},cookie)).status,200);
 const denied=await worker.fetch(new Request('https://aifect.test/api/me/profile',{headers:{Cookie:cookie}}),env,ctx);assert.equal(denied.status,401);
 const login=await call('/api/auth/login',credentials);assert.equal(login.status,200);const fresh=login.headers.get('set-cookie').split(';')[0];
 const profile=await worker.fetch(new Request('https://aifect.test/api/me/profile',{headers:{Cookie:fresh}}),env,ctx);assert.equal((await profile.json()).profile.public_number,number);
});

test('public profiles exclude unfinished/private dubbing and deleted works',async t=>{
 const bucket=memoryBucket(),f=await fixture(t,{DUBBING_ENABLED:'true',BUCKET:bucket});
 const ids=[];for(const [state,visibility] of [['complete','public'],['script_ready','public'],['complete','private']]){
  const created=await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript()});assert.equal(created.status,201);const id=created.body.project.id;ids.push(id);f.sql.prepare('UPDATE dubbing_projects SET state=?,visibility=? WHERE id=?').run(state,visibility,id);
 }
 f.sql.exec("UPDATE tracks SET status='deleted' WHERE id='hidden'");
 const own=(await f.call('/api/producers/producer?dashboard=1')).body;assert.equal(own.dubbings.length,3);assert.ok(!own.tracks.some(t=>t.id==='hidden'));
 const visitor=(await f.call('/api/producers/producer?dashboard=1','GET',null,'other')).body;assert.deepEqual(visitor.dubbings.map(p=>p.id),[ids[0]]);assert.equal(visitor.public_track_count,3);
});

test('comments and follows create private, deduplicated, block-aware notification records',async t=>{
 const f=await fixture(t);f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','친구',0)");
 assert.equal((await f.call('/api/producers/producer/follow','PUT',null,'other')).status,200);
 await f.call('/api/producers/producer/follow','DELETE',null,'other');await f.call('/api/producers/producer/follow','PUT',null,'other');
 assert.equal((await f.call('/api/tracks/one/comments','POST',{body:'댓글 테스트'},'other')).status,201);
 const list=(await f.call('/api/notifications')).body.items;assert.equal(list.filter(n=>n.kind==='follow').length,1);assert.equal(list.filter(n=>n.kind==='comment').length,1);assert.ok(list.every(n=>n.available));
 assert.equal((await f.call('/api/notifications','GET',null,'other')).body.items.length,0);
 await f.call('/api/blocks/other','PUT');assert.equal((await f.call('/api/notifications')).body.items.length,0);
});
