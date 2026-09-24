import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {wordAt,placeChunks,encodeWav,peak,MIX_RATE} from '../shared/karaoke-audio.js';

const lines=[{s:1,e:3,w:[{t:'처음',s:1,e:2},{t:'가사',s:2,e:3}]},{s:5,e:6,w:[{t:'다음',s:5,e:6}]}];

test('the singer position follows lines and words, with progress through the current word',()=>{
 assert.deepEqual(wordAt(lines,0.5),{line:-1,word:-1,progress:0},'intro');
 assert.deepEqual(wordAt(lines,1.5),{line:0,word:0,progress:.5});
 assert.deepEqual(wordAt(lines,2.25),{line:0,word:1,progress:.25});
 assert.deepEqual(wordAt(lines,4),{line:0,word:1,progress:1},'the line stays until the next one starts');
 assert.equal(wordAt(lines,5.5).line,1);
});

test('recorded chunks land on the song timeline; audio before the start or past the end is dropped',()=>{
 const rate=10,t0=2;
 const chunks=[{t:1.5,d:Float32Array.from([1,1,1,1,1,2,2])},{t:2.2,d:Float32Array.from([3,3])},{t:2.9,d:Float32Array.from([4,4,4])}];
 assert.deepEqual([...placeChunks(chunks,t0,rate,10)],[2,2,3,3,0,0,0,0,0,4]);
});

test('the mix is a valid 16-bit stereo WAV and peaks are measured across channels',()=>{
 const wav=encodeWav([Float32Array.from([0,1,-1]),Float32Array.from([.5,-.5,2])],MIX_RATE);
 const v=new DataView(wav.buffer);
 assert.equal(String.fromCharCode(...wav.slice(0,4)),'RIFF');assert.equal(String.fromCharCode(...wav.slice(8,12)),'WAVE');
 assert.deepEqual([v.getUint16(22,true),v.getUint32(24,true),v.getUint16(34,true),v.getUint32(40,true)],[2,32000,16,12]);
 assert.deepEqual([0,1,2,3,4,5].map(i=>v.getInt16(44+i*2,true)),[0,16383,32767,-16384,-32768,32767]);
 assert.ok(Math.abs(peak([Float32Array.from([.2,-.9]),Float32Array.from([.5])])-.9)<1e-6);
});

async function singFixture(t){
 const bucket={async head(k){return k.startsWith('karaoke/one/')?{size:3}:null;},async get(k){return k.startsWith('karaoke/one/')?{body:new Uint8Array([1,2,3]),size:3}:null;}};
 const f=await fixture(t,{BUCKET:bucket});
 f.sql.exec("UPDATE tracks SET karaoke_at=1,duration=20 WHERE id='one'");
 f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,lyrics_text,words,words_state,created,updated) VALUES('one','job','ready',1,'처음 가사',?,'attention',0,0)").run(JSON.stringify(lines));
 const raw=(path,user='owner')=>worker.fetch(new Request('https://aifect.test'+path,{headers:user?{Cookie:'aifect_session='+user}:{}}),{DB:f.DB,BUCKET:bucket},{waitUntil(){}});
 return {...f,raw};
}

test('only songs with a finished MR and word timings can be sung, by signed-in listeners',async t=>{
 const f=await singFixture(t);
 assert.deepEqual((await f.call('/api/karaoke','GET',undefined,null)).body.tracks.map(x=>x.id),['one'],'the list is public');
 assert.equal((await f.call('/api/tracks/one')).body.track.karaoke_ready,true);
 assert.equal((await f.call('/api/tracks/two')).body.track.karaoke_ready,false);
 assert.equal((await f.call('/api/karaoke/one','GET',undefined,null)).status,401);
 const sing=(await f.call('/api/karaoke/one','GET',undefined,'other')).body;
 assert.deepEqual([sing.track.id,sing.words.length,sing.mr],['one',2,'/media/one/mr']);
 assert.equal((await f.raw('/media/one/mr',null)).status,401);
 assert.equal((await f.raw('/media/one/mr','other')).status,200);
 for(const change of ["UPDATE karaoke_jobs SET state='queued'","UPDATE karaoke_jobs SET state='ready',words_state='failed'","UPDATE karaoke_jobs SET words_state='ready'; UPDATE tracks SET karaoke_at=0 WHERE id='one'"]){
  f.sql.exec(change);
  assert.equal((await f.call('/api/karaoke/one','GET',undefined,'other')).status,404,change);
  assert.equal((await f.raw('/media/one/mr','other')).status,404,change);
 }
});
