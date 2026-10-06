import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLrc,serializeLrc,activeCueIndex,timestamp,cleanLyricAnnotations} from '../shared/lyrics.js';
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
test('upload removes every square-bracket annotation while retaining timing tags and instrumental cues',()=>{
 assert.deepEqual(parseLrc('[Verse 1]\n[00:02][soft vocal]안녕 [강조]\n[00:04][Instrumental]\n[00:08][Chorus]다시 만나'),[{time:2,text:'안녕'},{time:4,text:''},{time:8,text:'다시 만나'}]);
 assert.equal(lyricsFields({lyrics_mode:'synced',lyrics:'[Custom section]\n[00:02]실제 [설명]가사'}).lyrics,'[00:02.000]실제 가사');
 assert.equal(lyricsFields({lyrics_mode:'auto',lyrics_source:'[male]\n첫 가사\n[female][기타][Guitar Solo]\n다음 [임의 설명]가사'}).source,'첫 가사\n다음 가사');
 assert.deepEqual(parseLrc('[00:02][male]첫 가사\n[00:04][female][기타]다음 가사'),[{time:2,text:'첫 가사'},{time:4,text:'다음 가사'}]);
});

test('live annotation cleanup preserves caret, incomplete typing and LRC timing while removing arbitrary blocks',()=>{
 const value='앞 [male]뒤 [기타]끝';
 assert.deepEqual(cleanLyricAnnotations(value,false,{start:value.length,end:value.length}),{text:'앞 뒤 끝',removed:2,selectionStart:5,selectionEnd:5});
 assert.deepEqual(cleanLyricAnnotations(value,false,{start:4,end:11}),{text:'앞 뒤 끝',removed:2,selectionStart:2,selectionEnd:4});
 assert.deepEqual(cleanLyricAnnotations('가사 [male'),{text:'가사 [male',removed:0},'wait for a closing bracket during typing');
 assert.deepEqual(cleanLyricAnnotations('[남성 [조용하게]]첫 가사\n[기타\n솔로]다음 가사'),{text:'첫 가사\n다음 가사',removed:2});
 const timed='[00:12.500][male]가사';assert.equal(cleanLyricAnnotations(timed,true,{start:timed.length,end:timed.length}).selectionStart,'[00:12.500]가사'.length);
 assert.throws(()=>lyricsFields({lyrics_mode:'auto',lyrics_source:cleanLyricAnnotations('[00:12.500][male]가사',true).text}),e=>e.status===400,'pasting LRC into auto mode must still require the LRC editor');
});
test('invalid or unaligned lyric input is rejected before publishing',()=>{
 for(const input of ['시간 없는 가사','[00:60]잘못된 초','[20:00.001]너무 늦음','[offset:-1000]\n[00:00.5]음수','[00:00]','x'.repeat(12001)])assert.throws(()=>parseLrc(input));
 assert.throws(()=>parseLrc('[00:10]곡을 넘김',9));
 assert.throws(()=>lyricsFields({lyrics_mode:'plain',lyrics:'untimed'}),e=>e.status===400);
 assert.throws(()=>lyricsFields({lyrics_mode:'synced',lyrics:'[00:71]곡 밖'},{duration:70}),e=>e.status===400);
 assert.deepEqual(lyricsFields({lyrics_mode:'none',lyrics:'discard'}),{mode:'none',lyrics:''});
 const original={lyrics_mode:'synced',lyrics:'[00:01.000]기존 가사',duration:70};assert.equal(lyricsFields({},original).lyrics,original.lyrics);
});
