import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {koreanInitials,initialQuery,initialGlob,typoDistance,scoreTrackTypo} from '../server/search-fallback.js';

test('extracts Korean initial consonants, including normalized compatibility Jamo',()=>{
 assert.equal(koreanInitials('좋은 날'),'ㅈㅇㄴ');
 assert.equal(koreanInitials('슈퍼 샤이'),'ㅅㅍㅅㅇ');
 assert.equal(koreanInitials('ㄱㄴㄷ'),'ㄱㄴㄷ');
 assert.equal(initialQuery('ㅈㅇ ㄴ'),'ㅈㅇㄴ');
 assert.equal(initialQuery('ㅅㅍㅅㅇ'),'ㅅㅍㅅㅇ');
 assert.equal(initialQuery('하늘'),'');
 assert.equal(initialQuery('ㅏㅓ'),'');
 assert.ok(initialGlob('ㅈㅇㄴ').includes('[자-짛]'));
});

test('corrects one-character Korean/English typos, insertions and adjacent transpositions',()=>{
 assert.equal(typoDistance('좋은낟','좋은날'),1);
 assert.equal(typoDistance('supershyy','supershy'),1);
 assert.equal(typoDistance('supershyyy','supershy'),2);
 assert.equal(typoDistance('supershy','supr eshy'.replace(/ /g,'')),1);
 assert.ok(Number.isFinite(scoreTrackTypo('좋은낟',{title:'좋은 날',artist:'아이유',producer:'제작자'})));
 assert.ok(Number.isFinite(scoreTrackTypo('아이유 좋은낟',{title:'좋은 날',artist:'아이유',producer:'제작자'})));
 assert.equal(scoreTrackTypo('ㅈㅇㄴ',{title:'좋은 날'}),Infinity);
 assert.equal(scoreTrackTypo('못찾을곡제목',{title:'좋은 날'}),Infinity);
});

test('song search returns initial matches and typo suggestions without exposing private tracks',async t=>{
 const {sql,call}=await fixture(t);
 const setTitle=sql.prepare('UPDATE tracks SET title=? WHERE id=?');
 setTitle.run('좋은 날','one');
 setTitle.run('슈퍼 샤이','two');
 setTitle.run('Super Shy','three');
 setTitle.run('좋은 님','hidden');
 sql.prepare('UPDATE artists SET name=? WHERE id=?').run('아이유','artist');
 const search=async (q,path='/api/search')=>(await call(path+'?q='+encodeURIComponent(q),'GET',null,null)).body;
 let result=await search('ㅈㅇㄴ');
 assert.deepEqual(result.tracks.map(s=>s.id),['one']);
 assert.equal(result.search_correction,undefined);
 result=await search('ㅅㅍ ㅅㅇ');
 assert.deepEqual(result.tracks.map(s=>s.id),['two']);
 result=await search('좋은낟');
 assert.deepEqual(result.tracks.map(s=>s.id),['one']);
 assert.deepEqual(result.search_correction,{type:'typo',suggestion:'좋은 날'});
 result=await search('아이유 좋은낟');
 assert.ok(result.tracks.some(s=>s.id==='one'));
 result=await search('슈퍼샤잉');
 assert.deepEqual(result.tracks.map(s=>s.id),['two']);
 result=await search('Super Shyy');
 assert.deepEqual(result.tracks.map(s=>s.id),['three']);
 result=await search('Supershyyy');
 assert.deepEqual(result.tracks.map(s=>s.id),['three']);
 result=await search('좋은 날');
 assert.ok(result.tracks.some(s=>s.id==='one'));
 assert.equal(result.search_correction,undefined);
 result=await search('못찾을곡제목');
 assert.deepEqual(result.tracks,[]);
 assert.equal(result.search_correction,undefined);
 assert.deepEqual((await search('ㅈㅇㄴ','/api/catalog')).tracks.map(s=>s.id),['one']);
 assert.deepEqual((await search('좋은낟','/api/catalog')).tracks.map(s=>s.id),['one']);
 const filtered=(await call('/api/catalog?section=tracks&genre=Pop&q='+encodeURIComponent('좋은낟'),'GET',null,null)).body;
 assert.deepEqual(filtered.tracks,[]);
});

test('both search endpoints exclude hidden, deleted and blocked songs from every match and suggestion',async t=>{
 const {sql,call}=await fixture(t,{AIFECT_BLOCKED:['other']});
 sql.exec("UPDATE tracks SET title='좋은 날',status='hidden' WHERE id='one'; UPDATE tracks SET title='좋은 날',status='deleted' WHERE id='two'; UPDATE tracks SET title='좋은 날',user_id='other' WHERE id='three'");
 for(const path of ['/api/search','/api/catalog?section=tracks']){
  for(const q of ['좋은날','ㅈㅇㄴ','좋은낟']){
   const response=await call(path+(path.includes('?')?'&':'?')+new URLSearchParams({q}),'GET',null,null);
   assert.equal(response.status,200);assert.deepEqual(response.body.tracks,[]);assert.equal(response.body.search_correction,undefined);
   assert.deepEqual(response.body.recommended||[],[]);
  }
 }
});

test('catalog and unified search rank the exact title first and suppress near misses',async t=>{
 const {sql,call}=await fixture(t);
 sql.exec("UPDATE tracks SET title='Super Shy' WHERE id='one'; UPDATE tracks SET title='Super Shy Remix',created=9 WHERE id='two'; UPDATE tracks SET title='Super Shyy' WHERE id='three'");
 for(const path of ['/api/search','/api/catalog']){
  const response=await call(path+'?q=Super%20Shyy','GET',null,null);
  assert.equal(response.status,200);assert.deepEqual(response.body.tracks.map(x=>x.id),['three']);assert.equal(response.body.search_correction,undefined);
  const exact=await call(path+'?q=SUPER%20SHY','GET',null,null);assert.equal(exact.body.tracks[0].id,'one');
 }
});

test('spaced genre aliases cannot match unrelated K and POP tokens on either route',async t=>{
 const {sql,call}=await fixture(t);
 sql.exec("UPDATE tracks SET genre='K-POP' WHERE id='one'; UPDATE tracks SET title='Okinawa',genre='Indie Pop' WHERE id='two'");
 for(const path of ['/api/search','/api/catalog']){
  for(const q of ['K-POP','KPOP','K POP','케이팝']){
   const result=await call(path+'?'+new URLSearchParams({q}),'GET',null,null);
   assert.equal(result.status,200);assert.deepEqual(result.body.tracks.map(t=>t.id),['one'],path+' '+q);
  }
 }
});
