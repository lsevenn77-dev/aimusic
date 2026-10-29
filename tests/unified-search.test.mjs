import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {GENRES,MOODS} from '../shared/genres.js';
import {searchInitials,searchPlan} from '../shared/search.js';

test('normalization, aliases, conservative typos and initials use real fixture records without duplicates',async t=>{
 const {sql,call}=await fixture(t);
 sql.exec("UPDATE artists SET name='방탄소년단'; UPDATE tracks SET title='별일 아닌 것처럼',genre='K-POP',genres_json='[\"K-POP\"]' WHERE id='one'; UPDATE tracks SET title='사랑해',genre='Hip-Hop' WHERE id='two'; UPDATE tracks SET title='밤',genre='R&B' WHERE id='three'");
 const search=async q=>{const r=await call('/api/search?'+new URLSearchParams({q}),'GET',undefined,null);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 for(const q of ['K-POP','kpop','K pop',' 케이 팝 ','K-poo']){const r=await search(q);assert.deepEqual(r.tracks.map(v=>v.id),['one'],q);assert.equal(r.counts.tracks,1);}
 for(const q of ['BTS','방탄소년단','ㅂㅌㅅㄴㄷ','ㅂㅌㅅ']){const r=await search(q);assert.equal(r.counts.tracks,3,q);assert.equal(r.artists[0].name,'방탄소년단');assert.equal(new Set(r.tracks.map(v=>v.id)).size,r.counts.tracks);}
 for(const q of ['힙합','Hip-Hop','Hiphpo'])assert.equal((await search(q)).tracks[0].id,'two',q);
 for(const q of ['R&B','알앤비'])assert.equal((await search(q)).tracks[0].id,'three',q);
 for(const q of ['ㅅㄹㅎ','ㅂㅇㅇㄴㄱㅊㄹ'])assert.equal((await search(q)).counts.tracks,1,q);
 sql.exec("UPDATE artists SET name='아이유'");for(const q of ['IU','아이유','ㅇㅇㅇ'])assert.equal((await search(q)).artists[0].name,'아이유');
 sql.exec("UPDATE artists SET name='아이브'");assert.equal((await search('ㅇㅇㅂ')).artists[0].name,'아이브');
 for(const q of ['zzzz-no-match','%','_','*',"' OR 1=1 --"]){const r=await search(q);assert.equal(r.counts.tracks,0,q);}
 assert.equal(searchInitials('별일 아닌 것처럼'),'ㅂㅇ ㅇㄴ ㄱㅊㄹ');
 assert.equal(searchPlan('EDM').aliases.includes('electronic'),false);
 assert.deepEqual(searchPlan('IU').fuzzy,[]);
});

test('exact names outrank partial and typo matches, with stable paging and unchanged source names',async t=>{
 const {sql,call}=await fixture(t);
 sql.exec("UPDATE tracks SET title='Ballad',genre='Rock' WHERE id='one'; UPDATE tracks SET title='Balllad',genre='Rock' WHERE id='two'; UPDATE tracks SET title='A Ballad song',genre='Rock' WHERE id='three'");
 const r=await call('/api/search?q=Ballad','GET',undefined,null);assert.equal(r.status,200,JSON.stringify(r.body));
 assert.deepEqual(r.body.tracks.map(v=>v.id),['one','three','two']);assert.equal(r.body.recommended[0].id,'one');
 assert.equal(sql.prepare("SELECT title FROM tracks WHERE id='two'").get().title,'Balllad');
});

test('blocked owners and private playlists stay excluded from normalized and initial searches',async t=>{
 const {sql,call}=await fixture(t,{AIFECT_BLOCKED:['owner']});
 sql.exec("UPDATE artists SET name='방탄소년단'; UPDATE tracks SET genre='K-POP'");
 for(const q of ['케이팝','BTS','ㅂㅌㅅㄴㄷ']){const r=await call('/api/search?'+new URLSearchParams({q}),'GET',undefined,null);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.counts.tracks,0);assert.equal(r.body.counts.artists,0);}
});

test('playlist and creator matching use the same ranking, accurate totals and public scope',async t=>{
 const {sql,call}=await fixture(t);
 sql.exec("UPDATE producers SET name='음악 제작자',nickname_confirmed=1; INSERT INTO playlists(id,user_id,name,description,is_public,created) VALUES('pub','owner','드라이브 음악','',1,1),('private','owner','드라이브 음악','',0,2)");
 for(const q of ['드라이브 음악','드라이브음악','ㄷㄹㅇㅂㅇㅇ']){const r=await call('/api/search?'+new URLSearchParams({q}),'GET',undefined,null);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.counts.playlists,1,q);assert.deepEqual(r.body.playlists.map(p=>p.id),['pub']);}
 for(const q of ['음악제작자','ㅇㅇㅈㅈㅈ']){const r=await call('/api/search?'+new URLSearchParams({q}),'GET',undefined,null);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.counts.producers,1,q);assert.equal(r.body.counts.tracks,3,q);}
});

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

