import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function context(extra={}){const c=vm.createContext({URLSearchParams,window:{addEventListener(){}},document:{addEventListener(){}},...extra});vm.runInContext(readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8'),c);return c;}
test('blocked navigation and failed draft saving preserve the duet parent across reload',async()=>{
 for(const state of ['loading','idle']){
  let restored='';const c=context({renderId:0,location:{hash:'#home'},setMobileMenu(){},toast(){},history:{replaceState(a,b,href){restored=href;}},saveSingDraft:async()=>{throw Error('storage full');}});
  vm.runInContext(readFileSync(new URL('../dist/views.js',import.meta.url),'utf8'),c);
  vm.runInContext(`sing={id:'original',state:'${state}',mode:'duet',parent:'first-recording',part:'female',dirty:true}`,c);
  await vm.runInContext('render()',c);assert.equal(restored,'#sing/original?duet=first-recording');
 }
});
test('join routes cannot silently fall back to a solo response; solo and first-duet routes still work',async()=>{
 let result={track:{id:'one'}},requested='';const c=context({api:async path=>(requested=path,result)});
 await assert.rejects(vm.runInContext("loadSingRoute('one',new URLSearchParams('duet=first'))",c),/참여할 듀엣/);
 result={track:{id:'one'},mr:'/media/first/stream',duet:{parent_id:'first',part:'female',partner:{producer:'친구'}}};
 const joined=await vm.runInContext("loadSingRoute('one',new URLSearchParams('duet=first'))",c);assert.equal(requested,'/api/duets/first');assert.equal(joined.mode,'duet');assert.equal(joined.part,'female');assert.equal(joined.mr,'/media/first/stream');
 result={track:{id:'one'}};assert.equal((await vm.runInContext("loadSingRoute('one',new URLSearchParams())",c)).mode,'solo');assert.equal((await vm.runInContext("loadSingRoute('one',new URLSearchParams('mode=duet'))",c)).mode,'duet');
});
