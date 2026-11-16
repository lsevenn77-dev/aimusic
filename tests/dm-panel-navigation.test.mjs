import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/social-chat.js',import.meta.url),'utf8');
const path='/api/dm/peer';
const history=(sequences,cutoff=0,more=false)=>({
 peer:{id:'peer'},settings:{cleared_sequence:cutoff},
 messages:sequences.map(sequence=>({id:'m'+sequence,sequence})),has_more:more
});
function fixture(responses){
 const paths=[],cache=new Map(),controller=new AbortController();
 const context=vm.createContext({document:{addEventListener(){}},api:async(url,_method,_body,{signal})=>{
  paths.push(url);assert.equal(signal,controller.signal);return responses.shift()();
 }});
 vm.runInContext(source,context);
 return {paths,cache,controller,read:()=>context.readDmPanel(path,cache,controller.signal)};
}

test('reopening a direct chat validates access with a cursor and applies the current clear boundary',async()=>{
 const f=fixture([()=>history([1,2,3]),()=>history([4,5],2),()=>{throw Object.assign(Error('blocked'),{status:403});}]);
 await f.read();
 const reopened=await f.read();assert.deepEqual(Array.from(reopened.messages,m=>m.sequence),[3,4,5]);
 assert.equal(reopened.has_more,false);
 await assert.rejects(f.read(),/blocked/);assert.equal(f.cache.size,0);
 assert.deepEqual(f.paths,[path,path+'?after=3',path+'?after=5']);
});

test('a late response from an aborted selection cannot populate the thread cache',async()=>{
 let release;const f=fixture([()=>new Promise(resolve=>{release=resolve;})]);
 const first=f.read();f.controller.abort();release(history([1]));await assert.rejects(first,{name:'AbortError'});assert.equal(f.cache.size,0);
});

test('a long unread interval reopens at the latest page and preserves older pagination',async()=>{
 const f=fixture([()=>history([1]),()=>history([2,3],0,true),()=>history([103,104],0,true)]);
 await f.read();const d=await f.read();assert.deepEqual(d.messages.map(m=>m.sequence),[103,104]);assert.equal(d.has_more,true);
 assert.deepEqual(f.paths,[path,path+'?after=1',path]);
});
