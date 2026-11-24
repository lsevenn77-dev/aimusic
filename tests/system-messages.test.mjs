import {test} from 'node:test';
import assert from 'node:assert/strict';
import {glob,readFile} from 'node:fs/promises';
import * as messages from '../shared/system-messages.js';
import {updateWelcomeCopy,WELCOME_GUIDE} from '../shared/welcome-guide.js';

test('search, retry and sign-in messages are shared by the web bundle and API',async()=>{
 assert.equal(messages.searchEmpty,'검색 결과가 없습니다.');
 assert.equal(messages.retry,'다시 시도해 주세요.');
 assert.equal(messages.signIn,'로그인 후 이용해 주세요.');
 const shell=await readFile('dist/index.html','utf8');
 assert.ok(shell.indexOf('src="system-messages.js"')>=0);
 assert.ok(shell.indexOf('src="system-messages.js"')<shell.indexOf('src="app.js'));
});

test('previous welcome system copy is updated exactly without changing custom text or resending',()=>{
 const saved={
  greeting:'{닉네임}님, 반가워요! 👋\n아이팩트에 오신 걸 환영해요.',
  intro:['내가 쓴 안내는 바꾸지 마.'],
  sections:[{id:'extra',title:'작품이에요',body:'이건 다른 안내예요.'}],
  closing:['반가워요!']
 };
 const actual=updateWelcomeCopy(structuredClone(saved));
 assert.equal(actual.greeting,WELCOME_GUIDE.greeting);
 assert.deepEqual(actual.intro,saved.intro);
 assert.deepEqual(actual.sections,saved.sections);
 assert.deepEqual(actual.closing,saved.closing);
});

test('literal errors, alerts and confirmations use polite Korean endings',async()=>{
 const literal=/(?:\bfail\(\s*\d+\s*,\s*|\b(?:toast|alert|confirm|Error)\(\s*)(['"])([^'"\n]{1,350})\1/g;
 const casual=/(?:했어|됐어|없어|있어|거야|해봐|해 봐|해줘|해 줘|바뀌어|할래)(?=[.?!]|$)/u;
 const found=[];
 for await(const file of glob(['dist/*.js','dist/crew-*/*.js','server/*.js','shared/*.js','realtime/*.js'])){
  const code=await readFile(file,'utf8');
  for(const match of code.matchAll(literal))if(casual.test(match[2]))found.push(file+' '+match[2]);
 }
 assert.deepEqual(found,[]);
});
