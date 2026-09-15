import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../server/index.js';
import {hash} from '../server/auth.js';

async function fixture(t){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 t.after(()=>sql.close());
 const DB={prepare(query){return {bind(...args){const s=sql.prepare(query);return {async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){s.run(...args);return {success:true};}};}};},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 for(const uid of ['owner','other']){
  sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(uid,uid+'@example.test',uid);
  sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash(uid),uid,Math.floor(Date.now()/1000)+3600);
 }
 sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('producer','owner','QA',0); INSERT INTO artists(id,producer_id,name,created) VALUES('artist','producer','QA',0)");
 for(const tid of ['one','two','three','hidden'])sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,?)").run(tid,tid,tid==='hidden'?'hidden':'published');
 const call=async(path,method='GET',body,user='owner')=>{const r=await worker.fetch(new Request('https://aifect.test'+path,{method,headers:{Origin:'https://aifect.test',...(user?{Cookie:'aifect_session='+user}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB},{waitUntil(p){p.catch(()=>{});}});return {status:r.status,body:await r.json()};};
 return {sql,call};
}

test('playlist selection saves atomically with privacy and persistent playback order',async t=>{
 const {call,sql}=await fixture(t);
 const created=await call('/api/playlists','POST',{name:'우울할 때',track_ids:['three','one','two']});assert.equal(created.status,201);const path='/api/playlists/'+created.body.id;
 const ids=async()=> (await call(path)).body.tracks.map(x=>x.id);
 assert.deepEqual(await ids(),['three','one','two']);
 assert.equal((await call(path,'GET',null,null)).status,404);
 assert.equal((await call(path+'/order','PUT',{track_ids:['one','two','three']},'other')).status,403);
 assert.equal((await call(path+'/order','PUT',{track_ids:['one','one','three']})).status,400);
 assert.equal((await call(path+'/order','PUT',{track_ids:['one','three']})).status,409);
 assert.equal((await call(path+'/order','PUT',{track_ids:['one','hidden','three']})).status,409);
 assert.deepEqual(await ids(),['three','one','two']);
 assert.equal((await call(path+'/order','PUT',{track_ids:['two','three','one']})).status,200);
 assert.deepEqual(await ids(),['two','three','one']);
 assert.equal((await call(path+'/tracks/three','DELETE')).status,200);
 assert.equal((await call(path+'/tracks/three','PUT')).status,200);
 assert.deepEqual(await ids(),['two','one','three']);
 assert.equal((await call(path+'/tracks/one','PUT')).status,200);assert.deepEqual(await ids(),['two','one','three']);
 assert.equal((await call(path,'PATCH',{name:'기분 업',is_public:true})).status,200);
 assert.equal((await call(path,'GET',null,null)).body.playlist.name,'기분 업');
 assert.deepEqual((await call(path,'GET',null,null)).body.tracks.map(x=>x.id),['two','one','three']);
 for(const track_ids of [['one','hidden'],['one','missing'],['one','one']])assert.ok((await call('/api/playlists','POST',{name:'Invalid',track_ids})).status>=400);
 assert.equal(sql.prepare('SELECT count(*) n FROM playlists').get().n,1);
});

test('reordering published songs retains hidden members and their relative slots',async t=>{
 const {call,sql}=await fixture(t);const created=await call('/api/playlists','POST',{name:'밤 드라이브',track_ids:['one','two','three']});const pid=created.body.id,path='/api/playlists/'+pid;
 sql.exec("UPDATE tracks SET status='hidden' WHERE id='two'");
 assert.equal((await call(path+'/order','PUT',{track_ids:['three','one']})).status,200);
 assert.deepEqual(sql.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position').all(pid).map(x=>x.track_id),['three','two','one']);
 sql.exec("UPDATE tracks SET status='published' WHERE id='two'");
 assert.deepEqual((await call(path)).body.tracks.map(x=>x.id),['three','two','one']);
});
