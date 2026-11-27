import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/song-entry.js',import.meta.url),'utf8');
function setup(){
 const requests=[],notices=[],list={innerHTML:'old rows',setAttribute(){},removeAttribute(){}},buttons=['all','duet'].map(tab=>({dataset:{songEntryTab:tab},classList:{toggle(){}},setAttribute(){},querySelector(){return {textContent:''};}}));
 const panel={isConnected:true,dataset:{coverOriginal:'one',pickId:'',pickRevision:'0',pickManage:'true',pickExists:'false'},querySelector(){return list;},querySelectorAll(){return buttons;}};
 const c=vm.createContext({document:{addEventListener(){},querySelector:()=>panel},location:{hash:'#sing/one'},me:{id:'owner'},trackMap:new Map([['b',{id:'b',producer:'B'}]]),URLSearchParams,esc:String,number:String,remember(){},paintInteractions(){},syncSongCoverPlayback(){},toast:m=>notices.push(m),$:()=>({close(){}}),api:(...args)=>new Promise((resolve,reject)=>requests.push({args,resolve,reject}))});
 vm.runInContext(source,c);c.songEntryListHTML=d=>d.covers.map(t=>t.id).join(',');
 return {c,panel,list,requests,notices};
}
test('a late old-tab response cannot overwrite a newer tab or a new account',async()=>{
 const f=setup(),first=f.c.loadSongEntryTab(f.panel,'all'),second=f.c.loadSongEntryTab(f.panel,'duet');
 f.requests[1].resolve({covers:[{id:'duet'}],counts:{all:1,duet:1},pick:{revision:1}});await second;
 f.requests[0].resolve({covers:[{id:'old'}],counts:{all:1,duet:1},pick:{revision:0}});await first;assert.equal(f.list.innerHTML,'duet');
 const third=f.c.loadSongEntryTab(f.panel,'all');f.c.me={id:'other'};f.requests[2].resolve({covers:[{id:'private-old-account'}]});await third;assert(!f.list.innerHTML.includes('private-old-account'));
});
test('list failures render retry state and never masquerade as a zero-count result',async()=>{
 const f=setup(),pending=f.c.loadSongEntryTab(f.panel,'all');f.requests[0].reject(Error('network unavailable'));await pending;
 assert.match(f.list.innerHTML,/role="alert"/);assert.match(f.list.innerHTML,/data-song-entry-retry/);assert.doesNotMatch(f.list.innerHTML,/아직 등록된|0개/);
});
test('double-clicking sends one write; failed saving preserves PICK metadata and row order',async()=>{
 const f=setup(),button={dataset:{pickOriginal:'one',composerPick:'b'},disabled:false},pending=f.c.changeComposerPick(button);
 await f.c.changeComposerPick(button);assert.equal(f.requests.length,1);assert.equal(button.disabled,true);
 f.requests[0].reject(Error('save failed'));await pending;
 assert.equal(f.panel.dataset.pickId,'');assert.equal(f.panel.dataset.pickRevision,'0');assert.equal(f.list.innerHTML,'old rows');assert.equal(button.disabled,false);assert.deepEqual(f.notices,['save failed']);
 const retry=f.c.changeComposerPick(button);assert.equal(f.requests.length,2);f.requests[1].reject(Error('retry failed'));await retry;
});
