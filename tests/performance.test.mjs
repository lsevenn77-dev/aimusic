import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture} from './fixture.mjs';

function client(fetch){
 const context=vm.createContext({fetch,structuredClone,URL,Map,Date,console,AifectGenres:{GENRES:[]},window:{},Audio:class{},sessionStorage:{getItem:()=>null},document:{querySelectorAll:()=>[]}});
 vm.runInContext(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),context);
 vm.runInContext("toast=()=>{};me={id:'owner'};",context);
 return {run:code=>vm.runInContext(code,context),context};
}
test('navigation reads are deduplicated and account scoped; writes invalidate pending and completed cache entries',async()=>{
 let calls=0,release;const c=client(async()=>{calls++;if(calls===1)await new Promise(r=>release=r);return {ok:true,json:async()=>({value:calls})};});
 const first=c.run("api('/api/catalog?section=tracks')"),second=c.run("api('/api/catalog?section=tracks')");assert.equal(calls,1);release();await Promise.all([first,second]);
 await c.run("api('/api/catalog?section=tracks')");assert.equal(calls,1);
 await c.run("me={id:'other'};api('/api/catalog?section=tracks')");assert.equal(calls,2);
 await c.run("api('/api/tracks/one/like','PUT')");
 await c.run("api('/api/catalog?section=tracks')");assert.equal(calls,4);
 for(const path of ['/api/gold','/api/studio/earnings','/api/crews/id','/api/dm','/api/me?state=1']){
  const before=calls;await c.run(`api('${path}')`);await c.run(`api('${path}')`);assert.equal(calls,before+2,path+' must stay fresh');
 }
});
test('a read finishing after mutation cannot restore an invalidated cached response',async()=>{
 let release,calls=0;const c=client(async(path,options)=>{calls++;if(options.method==='GET'&&calls===1)await new Promise(r=>release=r);return {ok:true,json:async()=>({value:calls})};});
 const first=c.run("api('/api/library')");await c.run("api('/api/tracks/one/like','PUT')");release();await first;await c.run("api('/api/library')");assert.equal(calls,3);
});
test('like feedback is immediate, duplicate clicks are ignored and failure rolls it back without fetching the library',async()=>{
 const requests=[];let release;const c=client(async(path)=>{requests.push(path);await new Promise(r=>release=r);return {ok:false,status:503,json:async()=>({error:'offline'})};});
 c.run("trackMap.set('one',{id:'one',title:'One',likes:4});");
 const work=c.run("toggleLike({dataset:{like:'one'}})");
 assert.equal(c.run("liked('one')"),true);assert.equal(c.run("trackMap.get('one').likes"),5);
 await c.run("toggleLike({dataset:{like:'one'}})");assert.equal(requests.length,1);
 release();await assert.rejects(work,/offline/);assert.equal(c.run("liked('one')"),false);assert.equal(c.run("trackMap.get('one').likes"),4);assert.deepEqual(requests,['/api/tracks/one/like']);
});
test('lightweight startup state preserves nickname privacy and only includes the current account interactions',async t=>{
 const f=await fixture(t);f.sql.exec("INSERT INTO likes(user_id,track_id,created) VALUES('owner','one',0); INSERT INTO follows(user_id,kind,target_id,created) VALUES('owner','artist','artist',0); UPDATE users SET provider='google',name='Private OAuth Name' WHERE id='other'; INSERT INTO producers(id,user_id,name,created) VALUES('other-profile','other','Private OAuth Name',0)");
 const owner=await f.call('/api/me?state=1');assert.equal(owner.status,200);assert.deepEqual(owner.body.interaction_state.likes,[{id:'one'}]);assert.deepEqual(owner.body.interaction_state.follows,[{kind:'artist',target_id:'artist'}]);
 const other=await f.call('/api/me?state=1','GET',null,'other');assert.equal(other.body.user.name,'리스너 other');assert.deepEqual(other.body.interaction_state,{likes:[],follows:[]});
 const guest=await f.call('/api/me?state=1','GET',null,null);assert.equal(guest.body.user,null);assert.equal(guest.body.interaction_state,undefined);
 f.sql.exec("UPDATE sessions SET expires=0 WHERE user_id='owner'");assert.equal((await f.call('/api/me?state=1')).body.user,null);
});
