import test from 'node:test';
import assert from 'node:assert/strict';
import {kakaoIdentity} from '../server/native-auth.js';
import {fixture} from './fixture.mjs';

const info={id:12345,app_id:1567877,expires_in:3600};
const profile={id:12345,kakao_account:{profile:{nickname:'리스너'},email:'unverified@example.test',is_email_verified:false}};
function request(identity=info,user=profile){return async(url,options)=>{
 assert.equal(options.headers.Authorization,'Bearer test-access-token');
 return Response.json(url.endsWith('access_token_info')?identity:user);
};}
test('native Kakao identity is bound to configured app and verified subject',async()=>{
 assert.deepEqual(await kakaoIdentity('test-access-token','1567877',request()),{sub:'12345',name:'리스너',email:null});
 for(const bad of [{...info,app_id:1},{...info,id:0},{...info,id:null},{...info,expires_in:0},{...info,expires_in:-10}]){
  await assert.rejects(kakaoIdentity('test-access-token','1567877',request(bad)),e=>e.status===401);
 }
 await assert.rejects(kakaoIdentity('test-access-token','1567877',request(info,{...profile,id:9})),e=>e.status===401);
});
test('native Kakao missing configuration, invalid tokens and provider failures fail closed',async()=>{
 const unexpected=()=>{throw Error('must not request');};
 await assert.rejects(kakaoIdentity('test-access-token','',unexpected),e=>e.status===503);
 for(const token of ['',null,123,'line\nbreak','x'.repeat(4097)])await assert.rejects(kakaoIdentity(token,'1567877',unexpected),e=>e.status===400);
 await assert.rejects(kakaoIdentity('test-access-token','1567877',async()=>new Response('{}',{status:401})),e=>e.status===401);
 await assert.rejects(kakaoIdentity('test-access-token','1567877',async()=>{throw Error('network');}),e=>e.status===502);
});
test('native Kakao endpoint reuses web identity and never trusts client account fields',async t=>{
 const f=await fixture(t,{KAKAO_APP_ID:'1567877'});
 f.sql.prepare("INSERT INTO users(id,email,name,provider,subject,created) VALUES('kakao-owner','old@example.test','기존 회원','kakao','12345',0)").run();
 t.mock.method(globalThis,'fetch',request());
 const result=await f.call('/api/auth/kakao/token','POST',{accessToken:'test-access-token',userId:'other',email:'attacker@example.test'},null);
 assert.equal(result.status,200);assert.equal(result.body.user.id,'kakao-owner');assert.equal(result.body.user.email,'old@example.test');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM users WHERE provider='kakao'").get().n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM sessions WHERE user_id='kakao-owner'").get().n,1);
});
