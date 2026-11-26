import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {searchText,compactSearchText,flexibleSearchCondition} from '../server/search-match.js';

const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE songs (title TEXT, artist TEXT, genre TEXT, tags TEXT)');
const add=db.prepare('INSERT INTO songs(title,artist,genre,tags) VALUES(?,?,?,?)');
add.run('좋은 날','아이유','발라드','');
add.run('Super Shy','뉴진스','K-POP','댄스');
add.run('밤 하늘','별','인디','');
add.run('Good Day','IU','POP','');
add.run('100%','A&B','ROCK','');
add.run('C++','Code','ROCK','');

function search(q){
 const m=flexibleSearchCondition(q,['title','artist','genre','tags'],['title','artist','genre']);
 return db.prepare('SELECT title FROM songs WHERE '+m.sql).all(...m.args).map(x=>x.title);
}

test('normalizes search input without changing stored content',()=>{
 assert.equal(searchText('  New   Jeans  '),'New Jeans');
 assert.equal(compactSearchText(' K-Pop · 음악 '),'kpop음악');
});
test('matches title without spaces and ignores case and punctuation',()=>{
 assert.ok(search('좋은날').includes('좋은 날'));
 assert.ok(search('GOODDAY').includes('Good Day'));
 assert.ok(search('super-shy').includes('Super Shy'));
 assert.ok(search('kpop').includes('Super Shy'));
 assert.ok(search('케이팝').includes('Super Shy'));
});
test('matches artist and song title as separate words, regardless of order',()=>{
 assert.ok(search('아이유 좋은날').includes('좋은 날'));
 assert.ok(search('좋은날 아이유').includes('좋은 날'));
 assert.ok(search('IU good day').includes('Good Day'));
 assert.ok(search('하늘 밤').includes('밤 하늘'));
});
test('uses LIKE parameters and does not treat raw wildcard input as match-all',()=>{
 assert.deepEqual(search('%'),['100%']);
 assert.ok(search('A&B').includes('100%'));
 assert.ok(search('C++').includes('C++'));
});
test('empty query does not return every track',()=>{
 assert.deepEqual(search(''),[]);
});
