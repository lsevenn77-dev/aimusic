import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture} from './fixture.mjs';

const addEmpty=f=>f.sql.exec("INSERT INTO artists(id,producer_id,name,created) VALUES('empty','producer','삭제 검증',0)");
const confirmation={confirmation:'empty',name:'삭제 검증'};

test('artist deletion requires ownership and confirmation of the current identity',async t=>{
 const f=await fixture(t);addEmpty(f);
 assert.equal((await f.call('/api/studio/artists/empty','DELETE',confirmation,null)).status,401);
 assert.equal((await f.call('/api/studio/artists/empty','DELETE',confirmation,'other')).status,404);
 for(const body of [{},{confirmation:'different',name:'삭제 검증'},{confirmation:'empty',name:'이전 이름'}])
  assert.equal((await f.call('/api/studio/artists/empty','DELETE',body)).status,409);
 assert.equal(f.sql.prepare("SELECT name FROM artists WHERE id='empty'").get().name,'삭제 검증');
});

test('confirmed deletion removes only an unused artist and its pin, preserving media and other artists',async t=>{
 const f=await fixture(t);addEmpty(f);
 f.sql.exec("UPDATE artists SET image_version='kept',image_type='image/png' WHERE id='empty'; INSERT INTO artists(id,producer_id,name,created) VALUES('last','producer','마지막',0); INSERT INTO profile_artist_pins VALUES('producer','[\"artist\",\"empty\",\"last\"]')");
 assert.equal((await f.call('/api/studio/artists/empty','DELETE',confirmation)).status,200);
 assert.equal(f.sql.prepare("SELECT id FROM artists WHERE id='empty'").get(),undefined);
 assert.deepEqual(JSON.parse(f.sql.prepare("SELECT ids_json FROM profile_artist_pins WHERE producer_id='producer'").get().ids_json),['artist','last']);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM tracks').get().n,4);
 assert.ok(f.sql.prepare("SELECT id FROM artists WHERE id='artist'").get());
 assert.equal((await f.call('/api/studio/artists/empty','DELETE',confirmation)).status,404);
 assert.equal((await f.call('/api/studio')).body.artists.some(a=>a.id==='empty'),false);
});

test('artists with tracks cannot be deleted, including hidden or previously deleted tracks',async t=>{
 const f=await fixture(t);
 for(const status of ['published','hidden','deleted']){
  f.sql.prepare('UPDATE tracks SET status=?').run(status);
  assert.equal((await f.call('/api/studio/artists/artist','DELETE',{confirmation:'artist',name:'QA'})).status,409);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM tracks').get().n,4);
  assert.ok(f.sql.prepare("SELECT id FROM artists WHERE id='artist'").get());
 }
});

test('all linked creative and social records prevent cascading artist deletion',async t=>{
 const records=[
  "INSERT INTO artist_photos VALUES('photo','empty','v','image/png',0)",
  "INSERT INTO artist_fan_settings(artist_id,introduction) VALUES('empty','보존할 소개')",
  "INSERT INTO artist_fan_operators VALUES('empty','other','owner',0)",
  "INSERT INTO artist_follow_blocks VALUES('empty','other','fan',0)",
  "INSERT INTO follows VALUES('other','artist','empty',0)",
  "INSERT INTO artist_fan_posts(id,artist_id,user_id,kind,body,request_id,created) VALUES('post','empty','other','lounge','보존할 글','post',0)",
  "INSERT INTO activity_notifications(id,recipient,kind,target,artist_id,created) VALUES('notice','owner','fan_post','post','empty',0)"
 ];
 for(const sql of records)await t.test(sql.split(' ')[2],async st=>{
  const f=await fixture(st);addEmpty(f);f.sql.exec(sql);
  f.sql.exec("INSERT INTO profile_artist_pins VALUES('producer','[\"empty\"]')");
  assert.equal((await f.call('/api/studio/artists/empty','DELETE',confirmation)).status,409);
  assert.ok(f.sql.prepare("SELECT id FROM artists WHERE id='empty'").get());
  assert.equal(f.sql.prepare("SELECT ids_json FROM profile_artist_pins WHERE producer_id='producer'").get().ids_json,'["empty"]');
 });
});

test('cancel sends no delete request; confirmation sends exactly the selected artist and refreshes after success',async()=>{
 const calls=[];let accepted=false;
 const ctx=vm.createContext({document:{addEventListener(){}},confirm:()=>accepted,api:async(...args)=>calls.push(args),render:async()=>calls.push('render'),toast:msg=>calls.push(msg)});
 vm.runInContext(readFileSync('dist/artist-directory.js','utf8'),ctx);
 const artist={id:'selected',name:'선택한 아티스트'};
 await ctx.deleteDirectoryArtist(artist);assert.deepEqual(calls,[]);
 accepted=true;await ctx.deleteDirectoryArtist(artist);
 assert.equal(calls[0][0],'/api/studio/artists/selected');assert.equal(calls[0][1],'DELETE');
 assert.equal(calls[0][2].confirmation,'selected');assert.equal(calls[0][2].name,artist.name);
 assert.equal(calls[1],'render');assert.equal(calls.length,3);
 calls.length=0;ctx.api=async()=>{throw new Error('연결 데이터 보호');};
 await assert.rejects(ctx.deleteDirectoryArtist(artist),/연결 데이터 보호/);assert.deepEqual(calls,[]);
});
