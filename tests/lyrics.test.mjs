import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLrc,serializeLrc,activeCueIndex,timestamp} from '../shared/lyrics.js';
import {lyricsFields} from '../server/lyrics.js';

test('LRC timestamps support metadata, BOM, repeated tags, offsets, fractions and blank instrumental cues',()=>{
 const cues=parseLrc('\uFEFF[ar:AIFECT]\r\n[offset:-500]\r\n[00:12.50][00:30.125]후렴\r\n[00:01]첫 줄\r\n[00:20.5]\r\n[00:01.000]번역');
 assert.deepEqual(cues,[{time:.5,text:'첫 줄\n번역'},{time:12,text:'후렴'},{time:20,text:''},{time:29.625,text:'후렴'}]);
 assert.deepEqual(parseLrc(serializeLrc(cues)),cues);assert.equal(timestamp(59.9999),'01:00.000');
});
test('the active lyric follows exact boundaries, backward/forward seeks, pause position and loop restart',()=>{
 const cues=parseLrc('[00:02]첫 줄\n[00:10.25]둘째 줄\n[00:20]');
 for(const [time,index] of [[0,-1],[1.999,-1],[2,0],[10.249,0],[10.25,1],[25,2],[3,0],[10.25,1],[10.25,1],[0,-1]])assert.equal(activeCueIndex(cues,time),index);
 assert.equal(activeCueIndex([],10),-1);assert.equal(activeCueIndex(cues,NaN),-1);
});
test('invalid or unaligned lyric input is rejected before publishing',()=>{
 for(const input of ['시간 없는 가사','[00:60]잘못된 초','[20:00.001]너무 늦음','[offset:-1000]\n[00:00.5]음수','[00:00]','x'.repeat(12001)])assert.throws(()=>parseLrc(input));
 assert.throws(()=>parseLrc('[00:10]곡을 넘김',9));
 assert.throws(()=>lyricsFields({lyrics_mode:'plain',lyrics:'untimed'}),e=>e.status===400);
 assert.throws(()=>lyricsFields({lyrics_mode:'synced',lyrics:'[00:71]곡 밖'},{duration:70}),e=>e.status===400);
 assert.deepEqual(lyricsFields({lyrics_mode:'none',lyrics:'discard'}),{mode:'none',lyrics:''});
 const original={lyrics_mode:'synced',lyrics:'[00:01.000]기존 가사',duration:70};assert.equal(lyricsFields({},original).lyrics,original.lyrics);
});
