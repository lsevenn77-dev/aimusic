import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {GENRES,MOODS} from '../shared/genres.js';

test('unified search uses exact taxonomy independently of the display label and excludes hidden works',async t=>{
 const {sql,call}=await fixture(t);
 sql.prepare("UPDATE tracks SET title='unrelated title',genre='Rock',genres_json=?,moods_json=? WHERE id IN ('one','hidden')").run('["K-POP"]','["romance"]');
 sql.exec("UPDATE tracks SET title='K-POP 설렘 · 사랑' WHERE id='two'");
 for(const filter of ['genre=K-POP','mood=romance']){
  const r=await call('/api/search?'+filter,'GET',undefined,null);assert.equal(r.status,200,JSON.stringify(r.body));
  assert.deepEqual(r.body.tracks.map(t=>t.id),['one']);assert.equal(r.body.counts.tracks,1);
  assert.deepEqual(r.body.recommended.map(t=>t.id),['one']);assert.equal(r.body.artists.length,1);
 }
 const changed=await call('/api/search?q=K-POP','GET',undefined,null);assert.ok(changed.body.tracks.some(t=>t.id==='two'));
 assert.equal((await call('/api/search?mood=unknown','GET',undefined,null)).status,400);
 assert.equal((await call('/api/search?genre=%00','GET',undefined,null)).status,400);
 const none=await call('/api/search?mood=sleep','GET',undefined,null);assert.equal(none.body.counts.tracks,0);assert.deepEqual(none.body.recommended,[]);
});

test('track totals and subsequent pages remain exact beyond the first hundred results',async t=>{
 const {sql,call}=await fixture(t);
 const insert=sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,'owner','artist','producer',?,'K-POP','QA',1,'wav',128,?,'published')");
 for(let n=0;n<105;n++)insert.run('search-'+n,'page sample '+n,n);
 const first=(await call('/api/search?genre=K-POP','GET',undefined,null)).body;
 assert.equal(first.counts.tracks,105);assert.equal(first.tracks.length,100);assert.equal(first.has_more,true);
 const last=(await call('/api/search?genre=K-POP&offset=100','GET',undefined,null)).body;
 assert.equal(last.tracks.length,5);assert.equal(last.has_more,false);
 assert.equal(new Set([...first.tracks,...last.tracks].map(t=>t.id)).size,105);
});

test('every existing genre and mood is accepted by unified search',async t=>{
 const {call}=await fixture(t);
 for(const genre of GENRES)assert.equal((await call('/api/search?'+new URLSearchParams({genre}),'GET',undefined,null)).status,200,genre);
 for(const {id} of MOODS)assert.equal((await call('/api/search?mood='+id,'GET',undefined,null)).status,200,id);
});

test('restoration never opens a playback session or plays media; user playback still does',async()=>{
 const source=readFileSync('dist/app.js','utf8'),restore=source.slice(source.indexOf('async function resumeAfterLogin()'),source.indexOf('async function report()'));
 const elements=new Map(),element=()=>({textContent:'',value:0,max:0,innerHTML:'',setAttribute(){}});
 const calls=[],audio={paused:true,pause(){this.paused=true;},play(){throw Error('restore must not play');}};
 const c=vm.createContext({pendingResume:{id:'one',time:23},current:null,playSerial:0,me:{id:'owner'},preview:false,restoredPosition:0,audio,
  api:async path=>{calls.push(path);return {track:{id:'one',duration:60}};},remember(){},renderPlayerActions(){},setCurrentLyrics(){},refreshLyricsPanel(){},setPlayerVisible(){},playerClock:String,icon:()=>'',window:{},$:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);}});
 vm.runInContext(restore,c);await c.resumeAfterLogin();assert.deepEqual(calls,['/api/tracks/one']);assert.equal(c.audio.paused,true);assert.equal(c.restoredPosition,23);assert.equal(elements.get('#seek').value,23);
 assert.match(source.slice(source.indexOf('async function play('),source.indexOf('async function resumeAfterLogin()')),/await audio\.play\(\)/);
});

