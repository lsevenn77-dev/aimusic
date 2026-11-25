import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
const origin='https://aifect.test';
async function setup(t){const f=await fixture(t);const env={DB:f.DB,AUTH_PEPPER:'fixture-only'};const send=async(path,body,cookie='',method='PUT',from=origin)=>worker.fetch(new Request(origin+path,{method,headers:{Origin:from,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),env,{waitUntil(p){p.catch(()=>{});}});return {...f,send};}
test('nickname reservations cover signup, every edit route, normalized duplicates and simultaneous claims',async t=>{
 const f=await setup(t);
 assert.equal((await f.call('/api/account/nickname','PUT',{name:'other'})).status,409,'legacy account names are also reserved');
 assert.equal((await f.call('/api/account/nickname?name=Unique')).body.available,true);
 const changed=await f.call('/api/account/nickname','PUT',{name:'Unique'});assert.equal(changed.status,200);assert.equal(changed.body.user.id,'owner');assert.equal(changed.body.user.name,'Unique');
 assert.equal((await f.call('/api/account/nickname?name=unique', 'GET',undefined,'other')).body.available,false);
 for(const path of ['/api/account/nickname','/api/me/profile','/api/studio/profile'])assert.equal((await f.call(path,'PUT',{name:'UNIQUE'},'other')).status,409,path);
 assert.equal((await f.call('/api/studio/producers/producer','PUT',{name:'other',bio:''})).status,409);
 const registered=await f.send('/api/auth/register',{email:'new@example.test',password:'fixture-password-123',name:'UNIQUE'},'', 'POST');assert.equal(registered.status,409);
 f.sql.exec("DELETE FROM nickname_changes");
 const results=await Promise.all(['owner','other'].map(uid=>f.call('/api/account/nickname','PUT',{name:'같은아이디'},uid)));assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(f.sql.prepare("SELECT count(*) n FROM account_handles WHERE normalized='같은아이디'").get().n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM tracks WHERE user_id='owner'").get().n,4);
 const email=f.sql.prepare("SELECT email FROM users WHERE id='owner'").get().email;await f.call('/api/account/nickname','PUT',{name:'이메일 그대로',email:'changed@example.test'});assert.equal(f.sql.prepare("SELECT email FROM users WHERE id='owner'").get().email,email);
});
test('password change verifies existing credentials, rotates sessions, preserves ownership and blocks cross-origin requests',async t=>{
 const f=await setup(t),old='original-password-123',next='new-password-456';
 const r=await f.send('/api/auth/register',{email:'account@example.test',password:old,name:'새계정'},'', 'POST');assert.equal(r.status,200);const user=(await r.json()).user,cookie=r.headers.get('set-cookie').split(';')[0];
 const second=await f.send('/api/auth/login',{email:user.email,password:old},'', 'POST'),otherSession=second.headers.get('set-cookie').split(';')[0];
 assert.equal((await f.send('/api/account/password',{current_password:old,new_password:next})).status,401);
 assert.equal((await f.send('/api/account/password',{current_password:'wrong-password',new_password:next},cookie)).status,403);
 assert.equal((await f.send('/api/account/password',{current_password:old,new_password:'short'},cookie)).status,400);
 assert.equal((await f.send('/api/account/password',{current_password:old,new_password:next},cookie,'PUT','https://other.test')).status,403);
 const changed=await f.send('/api/account/password',{current_password:old,new_password:next},cookie);assert.equal(changed.status,200);const rotated=changed.headers.get('set-cookie').split(';')[0];assert.notEqual(rotated,cookie);
 for(const stale of [cookie,otherSession])assert.equal((await (await f.send('/api/me',null,stale,'GET')).json()).user,null);
 assert.equal((await (await f.send('/api/me',null,rotated,'GET')).json()).user.id,user.id);
 assert.equal((await f.send('/api/auth/login',{email:user.email,password:old},'', 'POST')).status,401);
 assert.equal((await f.send('/api/auth/login',{email:user.email,password:next},'', 'POST')).status,200);
 f.sql.prepare("UPDATE users SET provider='google' WHERE id=?").run(user.id);assert.equal((await f.send('/api/account/password',{current_password:next,new_password:old},rotated)).status,400);
});
test('다른 기기 로그아웃은 현재 세션과 다른 회원을 보존하고 폐기 대상의 푸시만 해제한다',async t=>{
 const f=await setup(t);
 const {hash}=await import('../server/auth.js');
 const self=await hash('owner'),other=await hash('other'),second=await hash('second-device');
 f.sql.prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,'owner',unixepoch()+3600)").run(second);
 for(const [name,uid,token] of [['current','owner',self],['old','owner',second],['parallel','other',other]]){
  f.sql.prepare("INSERT INTO push_devices(token,user_id,session_token,updated) VALUES(?,?,?,unixepoch())").run(name,uid,token);
 }
 assert.equal((await f.call('/api/account/logout-others','POST',{},null)).status,401);
 const stream=await f.send('/api/chat/events',null,'aifect_session=second-device','GET');
 assert.equal(stream.status,200);
 const reader=stream.body.getReader(),decoder=new TextDecoder();
 assert.match(decoder.decode((await reader.read()).value),/event: change/);
 const current='aifect_session=owner';
 assert.equal((await f.send('/api/account/logout-others',{},current,'POST','https://elsewhere.test')).status,403);
 assert.equal((await f.send('/api/account/logout-others',{user_id:'other'},current,'POST')).status,200);
 assert.equal((await f.call('/api/me','GET',undefined,'owner')).body.user.id,'owner');
 assert.equal((await f.call('/api/me','GET',undefined,'second-device')).body.user,null);
 assert.equal((await f.call('/api/me','GET',undefined,'other')).body.user.id,'other');
 assert.match(decoder.decode((await reader.read()).value),/event: revoked/);
 assert.equal((await reader.read()).done,true);
 assert.deepEqual(f.sql.prepare('SELECT token FROM push_devices ORDER BY token').all().map(r=>r.token),['current','parallel']);
 assert.equal((await f.call('/api/account/logout-others','POST',{},'second-device')).status,401);
 assert.equal((await f.call('/api/account/logout-others','POST',{},'owner')).status,200);
});
