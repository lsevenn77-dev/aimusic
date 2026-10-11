import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {createAdminPasswordHash,isConsoleAdmin} from '../server/admin-session.js';

const PASSWORD='test-only-admin-passphrase';
async function setup(t){
 const f=await fixture(t),env={DB:f.DB,ADMIN_PASSWORD_HASH:await createAdminPasswordHash(PASSWORD)};
 const request=async(path,{method='GET',body,cookie='',origin='https://aifect.test',ip='127.0.0.1',extraEnv={}}={})=>{
  const res=await worker.fetch(new Request('https://aifect.test'+path,{method,headers:{origin,cookie,'cf-connecting-ip':ip,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{...env,...extraEnv},{waitUntil(p){p.catch(()=>{});}});
  const data=await res.text();return {status:res.status,body:res.headers.get('content-type')?.includes('json')?JSON.parse(data):data,headers:res.headers};
 };
 const login=async()=>{const r=await request('/api/admin/login',{method:'POST',body:{password:PASSWORD}});assert.equal(r.status,200,JSON.stringify(r.body));return r.headers.get('set-cookie').split(';')[0];};
 return {...f,env,request,login};
}

test('standalone admin session is private, hashed, and never becomes a member login',async t=>{
 const f=await setup(t);
 assert.equal((await f.request('/api/admin/login',{method:'POST',body:{password:'wrong'}})).status,401);
 const logged=await f.request('/api/admin/login',{method:'POST',body:{password:PASSWORD}}),setCookie=logged.headers.get('set-cookie'),cookie=setCookie.split(';')[0];
 assert.match(setCookie,/Secure; HttpOnly; SameSite=Strict; Max-Age=7200/);
 assert.equal(logged.headers.get('cache-control'),'private, no-store');
 const saved=f.sql.prepare('SELECT * FROM admin_sessions').get();
 assert.notEqual(saved.token_hash,cookie.split('=')[1]);assert.ok(!JSON.stringify(saved).includes(PASSWORD));
 assert.equal((await f.request('/api/admin/session',{cookie})).body.authenticated,true);
 assert.equal((await f.request('/api/me',{cookie})).body.user,null);
 assert.equal((await f.request('/api/me',{cookie:'aifect_session='+cookie.split('=')[1]})).body.user,null);
 assert.equal(isConsoleAdmin({id:'admin-console'}),false);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM users').get().n,2,'no fake member added');
 assert.equal((await f.request('/api/admin/logout',{method:'POST',cookie})).status,200);
 assert.equal((await f.request('/api/admin/session',{cookie})).body.authenticated,false);
 assert.equal((await f.request('/api/admin/dashboard',{cookie})).status,401);
});

test('all dashboard operations require authentication and successful moderation is audited',async t=>{
 const f=await setup(t),cookie=await f.login();
 for(const path of ['/api/admin/dashboard','/api/admin/dashboard/search?q=QA','/api/admin/comment-reports','/api/admin/track-review','/api/admin/payouts','/api/admin/diamonds']){
  assert.equal((await f.request(path)).status,401,path);
  const r=await f.request(path,{cookie});assert.equal(r.status,200,path+JSON.stringify(r.body));
 }
 const path='/api/admin/track-review/one/visibility',body={action:'remove'};
 assert.equal((await f.request(path,{method:'POST',body})).status,401);
 assert.equal((await f.request(path,{method:'POST',body,cookie,origin:'https://attacker.test'})).status,403);
 assert.equal((await f.request(path,{method:'POST',body,cookie})).status,200);
 assert.equal(f.sql.prepare("SELECT admin_id FROM admin_audit WHERE action='track:remove'").get().admin_id,'admin-console');
 assert.equal((await f.request(path,{method:'POST',body:{action:'restore'},cookie})).status,200);
});

test('old, forged and rotated sessions fail; login is rate limited and rejects cross-site requests',async t=>{
 const f=await setup(t),cookie=await f.login();
 assert.equal((await f.request('/api/admin/login',{method:'POST',body:{password:PASSWORD},origin:'https://attacker.test'})).status,403);
 assert.equal((await f.request('/api/admin/session',{cookie:'__Host-aifect_admin='+'0'.repeat(64)})).body.authenticated,false);
 assert.equal((await f.request('/api/admin/session',{cookie,extraEnv:{ADMIN_PASSWORD_HASH:await createAdminPasswordHash('different-test-password')}})).body.authenticated,false);
 f.sql.exec('UPDATE admin_sessions SET expires=0');
 assert.equal((await f.request('/api/admin/dashboard',{cookie})).status,401);
 for(let i=0;i<5;i++)assert.equal((await f.request('/api/admin/login',{method:'POST',body:{password:'wrong'},ip:'192.0.2.2'})).status,401);
 assert.equal((await f.request('/api/admin/login',{method:'POST',body:{password:PASSWORD},ip:'192.0.2.2'})).status,429);
 assert.equal((await f.request('/api/admin/login',{method:'POST',body:{password:PASSWORD},extraEnv:{ADMIN_PASSWORD_HASH:''}})).status,503);
});

test('old admin URLs are removed and the new dashboard uses the asset route',async t=>{
 const f=await setup(t),extraEnv={ASSETS:{fetch(req){return new Response(new URL(req.url).pathname);}}};
 for(const path of ['/admin','/admin/','/admin.html'])assert.equal((await f.request(path,{extraEnv})).status,404);
 const r=await f.request('/admin/dashboard',{extraEnv});assert.equal(r.status,200);assert.equal(r.body,'/admin/dashboard');
});
