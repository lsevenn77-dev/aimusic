// node signup-source.test.mjs — 출처 쿠키·기록 도우미 검사
import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import { cleanSource, sourceFromRequest, withSourceCookie, rememberSignupSource } from '../server/signup-source.js';

const req = (url, cookie) => new Request(url, { headers: cookie ? { cookie } : {} });

// 값 정리: 영소문자·숫자·_·- 24자까지만
assert.equal(cleanSource('YT'), 'yt');
assert.equal(cleanSource('ig_bio'), 'ig_bio');
assert.equal(cleanSource('<script>'), null);
assert.equal(cleanSource('x'.repeat(25)), null);
assert.equal(cleanSource(''), null);

// 쿠키 읽기 — 다른 쿠키 사이에서도, '=' 이 들어간 다른 쿠키가 있어도
assert.equal(sourceFromRequest(req('https://aifect.co.kr/', 'sid=a=b; aifect_src=ig; x=1')), 'ig');
assert.equal(sourceFromRequest(req('https://aifect.co.kr/', 'aifect_src=bad!')), null);

// 첫 방문: ?src=yt → 쿠키를 심는다(본문·상태 유지)
const r1 = withSourceCookie(req('https://aifect.co.kr/?src=yt#song/1'), new Response('page', { status: 200, headers: { 'content-type': 'text/html' } }));
assert.match(r1.headers.get('set-cookie'), /^aifect_src=yt; Path=\/; Max-Age=2592000; SameSite=None; Secure$/);
assert.equal(r1.headers.get('content-type'), 'text/html');
assert.equal(await r1.text(), 'page');

// 이미 출처가 있으면 덮어쓰지 않는다(첫 방문 우선)
const r2 = withSourceCookie(req('https://aifect.co.kr/?src=yt', 'aifect_src=ig'), new Response('page'));
assert.equal(r2.headers.get('set-cookie'), null);

// src 가 없거나 이상하면 응답을 그대로 돌려준다
const base = new Response('page');
assert.equal(withSourceCookie(req('https://aifect.co.kr/'), base), base);
assert.equal(withSourceCookie(req('https://aifect.co.kr/?src=%3Cx%3E'), base), base);

// 계정 기록: 쿠키 값 → 없으면 fallback → 둘 다 없으면 기록 안 함
const calls = [];
const env = { DB: { prepare: (sql) => ({ bind: (...a) => ({ run: async () => calls.push([sql, a]) }) }) } };
await rememberSignupSource(env, req('https://aifect.co.kr/api/auth/google', 'aifect_src=yt'), 'u1');
await rememberSignupSource(env, req('https://aifect.co.kr/api/auth/kakao/token'), 'u2', 'app');
await rememberSignupSource(env, req('https://aifect.co.kr/api/auth/google'), 'u3');
assert.deepEqual(calls.map(c => c[1]), [['yt', 'u1'], ['app', 'u2']]);
assert.match(calls[0][0], /signup_source IS NULL/);

console.log('ok — signup-source 테스트 통과');

test('signup stores the first source and login leaves it unchanged in the admin report',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'});
 const credentials={name:'경로확인',email:'source@example.test',password:'demo-test-password'};
 const auth=(path,source)=>worker.fetch(new Request('https://aifect.test/api/auth/'+path,{method:'POST',
  headers:{origin:'https://aifect.test','content-type':'application/json',cookie:'aifect_src='+source},
  body:JSON.stringify(credentials)}),{DB:f.DB,AUTH_PEPPER:'fixture-pepper'});
 assert.equal((await auth('register','yt_s')).status,200);
 assert.equal((await auth('login','ig')).status,200);
 const directory=(await f.call('/api/admin/dashboard/members')).body.members;
 assert.equal(directory.find(x=>x.login_email===credentials.email).signup_source,'yt_s');
 assert.equal(directory.find(x=>x.id==='owner').signup_source,null);
 assert.deepEqual((await f.call('/api/admin/dashboard?days=7')).body.signup_sources,[{src:'yt_s',count:1}]);
 assert.equal(sourceFromRequest(req('https://aifect.test/','aifect_src=%zz')),null);
});
