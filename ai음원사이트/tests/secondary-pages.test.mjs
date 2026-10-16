import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setup(entries=[]){
 const records=new Map(entries.map(d=>[d.key,d])),handlers=[];
 const c=vm.createContext({me:{id:'owner'},document:{addEventListener(type,fn){handlers.push(fn);}},esc,icon:()=>'<svg></svg>',heading:title=>'<h1>'+title+'</h1>',time:String,number:String,section:()=>'',cover:()=>'<img alt="">',credits:t=>esc(t.artist),Date,URLSearchParams});
 vm.runInContext(read('sing-drafts.js'),c);
 // Async transactional adapter: writes commit together; abort rolls every write back.
 c.openDraftDB=async()=>({transaction(){let pending=0,stopped=false;const copy=new Map(records),tx={objectStore:()=>store,abort(){stopped=true;queueMicrotask(()=>tx.onabort?.());}};
  const issue=work=>{const request={};pending++;queueMicrotask(()=>{if(stopped)return;try{request.result=work();request.onsuccess?.();}catch(error){tx.error=error;tx.abort();}if(!--pending&&!stopped)queueMicrotask(()=>{if(stopped)return;records.clear();for(const [k,v] of copy)records.set(k,v);tx.oncomplete?.();});});return request;};
  const store={get:key=>issue(()=>copy.get(key)),delete:key=>issue(()=>copy.delete(key))};return tx;}});
 return {c,records,handlers};
}
const record=(key,owner='owner')=>({key,owner,id:key.split(':')[1],title:'Song',samples:new Float32Array([1]),rate:1});
const withIndex=d=>[d,{key:'index:'+d.key,owner:d.owner,draftKey:d.key}];
test('individual draft deletion atomically removes audio and index, independent of the original song',async()=>{
 const {c,records}=setup([...withIndex(record('owner:missing-original')),...withIndex(record('owner:keep'))]);
 assert.equal(await c.deleteLocalDrafts(['owner:missing-original'],'owner'),1);
 assert.equal(records.has('owner:missing-original'),false);assert.equal(records.has('index:owner:missing-original'),false);
 assert.equal(records.has('owner:keep'),true);assert.equal(records.has('index:owner:keep'),true);
});
test('bulk deletion is a deduplicated snapshot and cannot delete other accounts or later drafts',async()=>{
 const {c,records}=setup([...withIndex(record('owner:one')),...withIndex(record('owner:two')),...withIndex(record('owner:later')),...withIndex(record('other:one','other')),...withIndex(record('owner:bad','other'))]);
 assert.equal(await c.deleteLocalDrafts(['owner:one','owner:one','owner:two','other:one','owner:bad','index:owner:later','owner:missing'],'owner'),2);
 for(const key of ['owner:later','index:owner:later','other:one','index:other:one','owner:bad'])assert.equal(records.has(key),true,key);
});
test('account change before storage opens rejects without removing anything',async()=>{
 const {c,records}=setup(withIndex(record('owner:one'))),open=c.openDraftDB;c.openDraftDB=async()=>{c.me={id:'other'};return open();};
 await assert.rejects(c.deleteLocalDrafts(['owner:one'],'owner'),/계정/);assert.equal(records.size,2);
});
test('account change during a transaction aborts all pending deletions',async()=>{
 const {c,records}=setup(withIndex(record('owner:one')));const promise=c.deleteLocalDrafts(['owner:one'],'owner');queueMicrotask(()=>{c.me={id:'other'};});
 await assert.rejects(promise,/취소/);assert.equal(records.size,2);
});
test('storage failure is surfaced rather than reporting successful deletion',async()=>{
 const {c,records}=setup(withIndex(record('owner:one')));c.openDraftDB=async()=>{throw new Error('unavailable');};
 await assert.rejects(c.deleteLocalDrafts(['owner:one'],'owner'),/unavailable/);assert.equal(records.size,2);
});
test('draft rendering offers separate edit/delete controls, empty state and safe labels',()=>{
 const {c}=setup();const html=c.karaokeDraftsHTML([{draftKey:'owner:<bad>',id:'gone',mode:'solo',title:'<img onerror=x>',duration:10,updated:0}]);
 assert.match(html,/data-delete-draft="owner:&lt;bad&gt;"/);assert.match(html,/data-delete-all-drafts/);assert.match(html,/#sing\/gone\?mode=solo/);assert.doesNotMatch(html,/<img onerror/);
 assert.match(c.karaokeDraftsHTML([]),/data-delete-all-drafts disabled/);assert.match(c.karaokeDraftsHTML([]),/첫 목소리/);
 assert.match(read('sing-drafts.js'),/복구할 수 없어요/);assert.match(read('sing-drafts.js'),/cancel-draft-delete'\)\.onclick=\(\)=>\$\('#dialog'\)\.close/);
});
test('MR cards retain the six actual song IDs, cover counts and co-located play/sing actions',()=>{
 const {c}=setup();vm.runInContext(read('home.js'),c);const tracks=Array.from({length:8},(_,i)=>({id:'song'+i,title:'Title '+i,artist:'<Singer>',covers:i,duration:100}));
 const html=c.homeSingHTML(tracks);assert.equal((html.match(/class="home-sing-tile"/g)||[]).length,6);
 for(let i=0;i<6;i++){assert.match(html,new RegExp('data-play="song'+i+'"'));assert.match(html,new RegExp('#sing/song'+i));assert.match(html,new RegExp('#song/song'+i+'\\?covers=recent'));assert.match(html,new RegExp('<strong>'+i+'</strong>곡'));}
 assert.doesNotMatch(html,/song6|<Singer>/);assert.match(html,/home-sing-pattern.*aria-hidden="true"/);
});
test('responsive cards and studio spacing are packaged after previous theme layers',()=>{
 const css=read('secondary-pages.css');assert.match(css,/home-sing-grid\{display:grid;grid-template-columns:repeat\(2/);assert.match(css,/@media\(max-width:650px\).*home-sing-grid\{grid-template-columns:1fr/s);
 assert.match(css,/studio-payout-callout\{[^}]*margin-top:28px/);assert.match(read('views.js'),/class="studio-payout-callout"/);
 assert.ok(read('index.html').indexOf('secondary-pages.css')>read('index.html').indexOf('release-refinements.css'));
});
test('shuffle uses the reference horizontal crossing arrows in playback, queue and browse actions',()=>{
 const c=vm.createContext({});vm.runInContext(read('icons.js'),c);
 const svg=vm.runInContext("icon('shuffle')",c);
 assert.match(svg,/M3 7h3c5 0 7 10 12 10h3/);assert.match(svg,/M14\.1 9\.4/);assert.doesNotMatch(svg,/M6 3h12a3|M3 5h3c5/);
 assert.match(read('index.html'),/id="shuffle"[^>]*aria-pressed="false"><i data-icon="shuffle"/);
 assert.match(read('browse.js'),/icon\('shuffle'\)/);assert.match(read('explorer.js'),/icon\('shuffle'\)/);
 assert.match(read('actions.js'),/button\.setAttribute\('aria-pressed',String\(shuffle\)\)/);
 assert.doesNotMatch(read('secondary-pages.css'),/#shuffle\s+svg\s*\{/);
 assert.match(read('style.css'),/\.player-buttons svg\{width:15px;height:15px\}/);
});
