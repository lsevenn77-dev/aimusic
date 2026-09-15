import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import worker from '../server/index.js';

const origin='https://aifect.test';
const client='aifect-test.apps.googleusercontent.com';
const callback='/api/auth/google/callback';
const keys=await generateKeyPair('RS256');
const jwk={...await exportJWK(keys.publicKey),kid:'test-key',alg:'RS256',use:'sig'};

function fixture(t){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../drizzle/0000_natural_black_tom.sql',import.meta.url),'utf8'));
 t.after(()=>sqlite.close());
 const DB={prepare(sql){return {bind(...args){const stmt=sqlite.prepare(sql);return {
  async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){stmt.run(...args);return {success:true};}
 };}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
 const env={DB,GOOGLE_CLIENT_ID:client};
 const send=(path,{body,cookie,from=origin,method='POST',type='application/x-www-form-urlencoded'}={})=>worker.fetch(new Request(origin+path,{method,headers:{Origin:from,'Content-Type':type,...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:body}),env,{waitUntil(p){p.catch(()=>{});}});
 const start=async()=>{const r=await send('/api/auth/google/nonce');assert.equal(r.status,200);const c=r.headers.get('set-cookie');assert.match(c,/HttpOnly; SameSite=None; Secure/);return {...await r.json(),cookie:c.split(';')[0]};};
 const post=(state,credential,csrf='test-csrf')=>send(callback,{from:'https://accounts.google.com',cookie:state.cookie+'; g_csrf_token=test-csrf',body:new URLSearchParams({credential,g_csrf_token:csrf})});
 return {sqlite,send,start,post};
}

async function token(nonce,overrides={},key=keys.privateKey){
 return new SignJWT({nonce,email:'listener@example.test',email_verified:true,name:'테스트 리스너',...overrides})
  .setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(overrides.iss||'https://accounts.google.com')
  .setAudience(overrides.aud||client).setSubject('google-subject').setIssuedAt().setExpirationTime(overrides.exp||'5m').sign(key);
}

test('Google redirect authentication uses signed identity and browser-bound single-use state',async t=>{
 t.mock.method(globalThis,'fetch',async url=>{assert.equal(String(url),'https://www.googleapis.com/oauth2/v3/certs');return Response.json({keys:[jwk]});});
 await t.test('valid Google POST creates a secure session and returning login reuses the identity',async t=>{
  const f=fixture(t),state=await f.start(),signed=await token(state.nonce);
  const result=await f.post(state,signed);assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/#account?welcome=1');
  const cookies=result.headers.getSetCookie();assert.ok(cookies.some(x=>/aifect_google_oauth=;.*Max-Age=0/.test(x)));
  const session=cookies.find(x=>x.startsWith('aifect_session='));assert.match(session,/HttpOnly; SameSite=Lax;.*Secure/);
  const me=await f.send('/api/me',{method:'GET',cookie:session.split(';')[0]});assert.equal((await me.json()).user.provider,'google');
  assert.match((await f.post(state,signed)).headers.get('location'),/error=/);
  const next=await f.start();assert.equal((await f.post(next,await token(next.nonce))).status,303);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM users').get().n,1);
 });
 await t.test('missing or mismatched double-submit CSRF cannot consume the login state',async t=>{
  const f=fixture(t),state=await f.start(),signed=await token(state.nonce);
  for(const csrf of ['', 'other-csrf'])assert.match((await f.post(state,signed,csrf)).headers.get('location'),/error=/);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM users').get().n,0);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM oauth_states').get().n,1);
 });
 await t.test('a different browser and expired state cannot sign in',async t=>{
  const f=fixture(t),state=await f.start(),signed=await token(state.nonce);
  assert.match((await f.post({...state,cookie:'aifect_google_oauth=other'},signed)).headers.get('location'),/error=/);
  f.sqlite.exec('UPDATE oauth_states SET expires=0');
  assert.match((await f.post(state,signed)).headers.get('location'),/error=/);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
 });
 for(const [name,claims] of Object.entries({audience:{aud:'other-client'},issuer:{iss:'https://attacker.invalid'},nonce:{nonce:'wrong'},expiry:{exp:1},unverifiedEmail:{email_verified:false}})){
  await t.test(`rejects invalid ${name}`,async t=>{const f=fixture(t),state=await f.start();assert.match((await f.post(state,await token(state.nonce,claims))).headers.get('location'),/error=/);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM users').get().n,0);});
 }
 await t.test('rejects a forged signature',async t=>{const f=fixture(t),state=await f.start(),attacker=await generateKeyPair('RS256');assert.match((await f.post(state,await token(state.nonce,{},attacker.privateKey))).headers.get('location'),/error=/);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n,0);});
 await t.test('ordinary authentication endpoints still require the same origin',async t=>{const f=fixture(t);assert.equal((await f.send('/api/auth/google/nonce',{from:'https://attacker.invalid'})).status,403);assert.equal((await f.send('/api/auth/google/token',{from:'https://accounts.google.com',type:'application/json',body:'{}'})).status,403);});
});
