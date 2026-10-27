import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {nicknamePolicy} from '../shared/nickname-policy.js';
const migration=readFileSync(new URL('../drizzle/0079_rare_leader.sql',import.meta.url),'utf8');
test('policy trims edges, rejects prohibited input, and browser uses the same policy',()=>{
 for(const value of ['가나','AB','Ab_123','abcdefghijkl','ㄱㅏ'])assert.equal(nicknamePolicy(value).error,undefined,value);
 assert.equal(nicknamePolicy('  Veil  ').name,'Veil');
 for(const value of ['a','abcdefghijklm','두 글자','two words','😀a','a-b','a.b','ＡＢ','a\nB','a\u200bB','관리자2','AIFECT_공식','Ad_min','씨발12'])assert.ok(nicknamePolicy(value).error,value);
 const shared=readFileSync(new URL('../shared/nickname-policy.js',import.meta.url),'utf8').replaceAll('export ','');
 assert.ok(readFileSync(new URL('../dist/account-settings.js',import.meta.url),'utf8').startsWith(shared));
});
test('migration backfills with collision retries, preserves valid codes and all old keys, replays safely',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER); INSERT INTO users VALUES('old',1),('missing',2); CREATE TABLE public_profile_ids(user_id TEXT PRIMARY KEY,code TEXT NOT NULL); INSERT INTO public_profile_ids VALUES('old','AAA0000'); CREATE TABLE works(owner TEXT REFERENCES users(id)); INSERT INTO works VALUES('old'); CREATE TABLE public_member_ids(number INTEGER PRIMARY KEY,user_id TEXT); INSERT INTO public_member_ids VALUES(91,'old')");
  // First candidate collides with preserved AAA0000; the allocator must generate another.
  let calls=0;db.function('random',()=>calls++<4?0:1);
  db.exec(migration);assert.equal(db.prepare("SELECT code FROM public_profile_ids WHERE user_id='old'").get().code,'AAA0000');
  assert.equal(db.prepare("SELECT code FROM public_profile_ids WHERE user_id='missing'").get().code,'BBB0001');
  const before=db.prepare('SELECT * FROM public_profile_ids ORDER BY user_id').all();db.exec(migration);assert.deepEqual(db.prepare('SELECT * FROM public_profile_ids ORDER BY user_id').all(),before);
  assert.equal(db.prepare('SELECT number FROM public_member_ids').get().number,91);assert.equal(db.prepare('SELECT owner FROM works').get().owner,'old');
  assert.throws(()=>db.exec("UPDATE public_profile_ids SET code='XYZ1234'"),/immutable/);
  assert.throws(()=>db.exec('DELETE FROM public_profile_ids'),/reserved/);
  assert.throws(()=>db.exec("INSERT INTO users VALUES('collision-exhausted',3)"),/allocation_exhausted/);
  assert.equal(db.prepare("SELECT count(*) n FROM users WHERE id='collision-exhausted'").get().n,0);
 }finally{db.close();}
});
test('signup availability is anonymous, duplicate signup is atomic, native-compatible payload remains additive',async t=>{
 const f=await fixture(t,{AUTH_PEPPER:'local-only'});
 const available=await f.call('/api/account/nickname?name=Fresh_01','GET',undefined,null);assert.equal(available.status,200);assert.equal(available.body.message,'사용 가능한 닉네임입니다');
 const signup=await f.call('/api/auth/register','POST',{email:'new@example.test',password:'test-password-long',name:'  Fresh_01  ',public_id:'AAA0000'},null);assert.equal(signup.status,200,JSON.stringify(signup));
 const uid=signup.body.user.id;const code=f.sql.prepare('SELECT code FROM public_profile_ids WHERE user_id=?').get(uid).code;assert.match(code,/^[A-Z]{3}\d{4}$/);assert.notEqual(code,'AAA0000');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM nickname_changes WHERE user_id=?').get(uid).n,0);
 const dup=await f.call('/api/auth/register','POST',{email:'second@example.test',password:'test-password-long',name:'fresh_01'},null);assert.equal(dup.status,409);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM users WHERE email='second@example.test'").get().n,0);
 const ids=await f.call('/api/me/profile');assert.equal(typeof ids.body.profile.public_number,'number');assert.match(ids.body.profile.public_id,/^[A-Z]{3}\d{4}$/);
 for(const name of ['a','longlonglong1','공 백','가😀','a-b','ADMIN_1'])assert.equal((await f.call('/api/account/nickname','PUT',{name})).status,400,name);
});
test('30-day limit covers all writers, exact boundary, unchanged legacy names and initial OAuth setup',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('/api/me/profile','PUT',{name:'변경닉네임'})).status,200);
 for(const path of ['/api/account/nickname','/api/me/profile','/api/studio/profile','/api/studio/producers/producer'])assert.equal((await f.call(path,'PUT',{name:'다른닉네임',bio:'소개'})).status,429,path);
 assert.equal((await f.call('/api/me/profile','PUT',{name:'변경닉네임',bio:'소개수정'})).status,200);
 assert.equal(f.sql.prepare("SELECT bio FROM producers WHERE user_id='owner'").get().bio,'소개수정');
 assert.throws(()=>f.sql.exec("UPDATE nickname_changes SET changed_at=changed_at+1"),/nickname_cooldown/);
 f.sql.exec("DELETE FROM nickname_changes; INSERT INTO nickname_changes VALUES('owner',unixepoch()-2592000)");
 assert.equal((await f.call('/api/account/nickname','PUT',{name:'기간후변경'})).status,200);
 f.sql.exec("UPDATE users SET provider='google',name='Private Name' WHERE id='other'");
 assert.equal((await f.call('/api/account/nickname','PUT',{name:'최초설정'},'other')).status,200);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM nickname_changes WHERE user_id='other'").get().n,0);
 assert.equal((await f.call('/api/account/nickname','PUT',{name:'첫변경'},'other')).status,200);
 assert.equal((await f.call('/api/account/nickname','PUT',{name:'두번째변경'},'other')).status,429);
 f.sql.exec("UPDATE producers SET name='기존 공백 닉네임',nickname_confirmed=1 WHERE user_id='owner'");
 assert.equal((await f.call('/api/me/profile','PUT',{name:'기존 공백 닉네임',bio:'유지'})).status,200);
});
test('duplicates remain untouched; concurrent claims, stable ID search and profile routes preserve related data',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES('friend','other','QA',0,1)");
 assert.equal((await f.call('/api/me/profile','PUT',{name:'QA',bio:'중복유지'})).status,200);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM producers WHERE name='QA'").get().n,2);
 const tables=['tracks','users','crews','gifts','payout_statements','follows','public_member_ids'];
 const before=Object.fromEntries(tables.map(n=>[n,f.sql.prepare('SELECT * FROM '+n+' ORDER BY rowid').all()]));
 const code=f.sql.prepare("SELECT code FROM public_profile_ids WHERE user_id='owner'").get().code;
 const results=await Promise.all(['owner','other'].map(uid=>f.call('/api/account/nickname','PUT',{name:'Same_Name'},uid)));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const changed=results[0].status===200?'owner':'other';
 const winnerCode=f.sql.prepare('SELECT code FROM public_profile_ids WHERE user_id=?').get(changed).code;
 const search=await f.call('/api/search?q='+winnerCode.toLowerCase());assert.equal(search.status,200,JSON.stringify(search));assert.equal(search.body.producers[0].user_id,changed);
 assert.equal((await f.call('/api/search?q=same_name')).body.producers.length,1);
 assert.equal((await f.call('/api/members/'+code)).body.profile.user_id,'owner');
 assert.equal((await f.call('/api/producers/producer')).body.profile.public_id,code);
 for(const n of tables.filter(n=>n!=='users'))assert.deepEqual(f.sql.prepare('SELECT * FROM '+n+' ORDER BY rowid').all(),before[n],n);
 assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.throws(()=>f.sql.prepare('INSERT INTO public_profile_ids VALUES(?,?)').run('invalid','AbC1234'),/CHECK/);
 assert.throws(()=>f.sql.prepare('INSERT INTO public_profile_ids VALUES(?,?)').run('duplicate',code),/UNIQUE/);
});
