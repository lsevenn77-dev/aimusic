import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';

const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function context(){
 const c=vm.createContext({crypto,esc,document:{addEventListener(){}},window:{addEventListener(){}}});
 vm.runInContext(source('profile-preview.js'),c);vm.runInContext(source('social-chat.js'),c);return c;
}
test('a shared profile becomes a safe internal action, while arbitrary external URLs and HTML remain text',()=>{
 const c=context(),body=c.memberProfileShareBody({id:'profile-123',name:'회원'}),html=c.chatTextHTML(body);
 assert.equal(body,'회원님의 프로필\nhttps://aifect.co.kr/#producer/profile-123');
 assert.match(html,/href="#producer\/profile-123"/);assert.match(html,/프로필 보기/);assert.doesNotMatch(html,/href="https:/);
 assert.match(c.chatTextHTML(c.memberProfileShareBody({public_id:'ABC1234',name:'새회원'})),/href="#member\/ABC1234"/);
 assert.equal(c.memberProfileShareBody({name:'저장 전'}),'');
 const malicious=c.chatTextHTML('<img onerror="bad()"> https://evil.test/#producer/profile-123 https://aifect.co.kr.evil.test/#producer/profile-123');
 assert.doesNotMatch(malicious,/<img|<a/);assert.match(malicious,/&lt;img/);
});
test('retrying after a lost response uses the original request and stores exactly one profile message',async t=>{
 const f=await fixture(t),c=context();f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','친구',0)");
 const body=c.memberProfileShareBody({id:'producer',name:'내프로필'}),batch={body,requests:new Map(),sent:new Set(),sending:false},recipients=[{profile_id:'friend',name:'친구'}];
 let loseResponse=true;const ids=[];
 const send=async(path,method,value)=>{
  ids.push(value.request_id);const response=await f.call(path,method,value);
  if(response.status!==201)throw Error(response.body.error);
  if(loseResponse){loseResponse=false;throw Error('response lost');}return response.body;
 };
 assert.equal((await c.sendProfileShareBatch(batch,recipients,send)).length,1);
 assert.equal(batch.sent.size,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM direct_messages').get().n,1);
 assert.equal((await c.sendProfileShareBatch(batch,recipients,send)).length,0);
 assert.equal(ids[0],ids[1]);assert.equal(batch.sent.size,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM direct_messages').get().n,1);
 assert.equal(f.sql.prepare('SELECT body FROM direct_messages').get().body,body);
 await c.sendProfileShareBatch(batch,recipients,send);assert.equal(ids.length,2,'successful recipients are not sent twice');
});
test('profile sharing respects DM blocks and stops remaining recipients after the dialog/account becomes inactive',async t=>{
 const f=await fixture(t),c=context();f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','친구',0)");
 await f.call('/api/blocks/owner','PUT',{},'other');
 const batch={body:c.memberProfileShareBody({id:'producer',name:'나'}),requests:new Map(),sent:new Set(),sending:false};
 const send=async(path,method,value)=>{const r=await f.call(path,method,value);if(r.status!==201)throw Error(r.body.error);return r.body;};
 const failed=await c.sendProfileShareBatch(batch,[{profile_id:'friend',name:'친구'}],send);
 assert.equal(failed.length,1);assert.equal(batch.sent.size,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM direct_messages').get().n,0);
 let calls=0;await c.sendProfileShareBatch(batch,[{profile_id:'friend',name:'친구'}],async()=>{calls++;},()=>false);
 assert.equal(calls,0);assert.equal(batch.sending,false);
});
