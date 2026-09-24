import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function fixture(open){
 const panel={innerHTML:''},ctx=vm.createContext({inApp:false,window:{Capacitor:{isNativePlatform:()=>true,Plugins:{AifectKaraoke:{open}}}},document:{addEventListener(){}},audio:{pause(){}},$:()=>panel,esc:s=>s,icon:()=>'',toast(){},location:{hash:''}});
 vm.runInContext(readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8'),ctx);
 vm.runInContext("sing={id:'song',state:'idle'}",ctx);
 return {ctx,panel,run:()=>vm.runInContext('startSinging()',ctx),state:()=>vm.runInContext('sing.state',ctx)};
}
test('new Android builds open the native room once without opening a WebView microphone',async()=>{
 let done,calls=0;const f=fixture(({trackId})=>{assert.equal(trackId,'song');calls++;return new Promise(r=>done=r);});
 const run=f.run();await f.run();assert.equal(calls,1);assert.equal(f.state(),'loading');done({uploadedId:null});await run;
 assert.equal(f.state(),'idle');assert.match(f.panel.innerHTML,/에코 · 룸 리버브/);
});
test('native permission/launch failure returns to a retryable song page',async()=>{
 const f=fixture(async()=>{throw new Error('다시 로그인해주세요.');});await f.run();assert.equal(f.state(),'idle');assert.match(f.panel.innerHTML,/다시 로그인/);
});
test('closing a native room does not overwrite a different page',async()=>{
 let done;const f=fixture(()=>new Promise(r=>done=r)),run=f.run();vm.runInContext('sing=null',f.ctx);f.panel.innerHTML='new page';done({uploadedId:null});await run;assert.equal(f.panel.innerHTML,'new page');
});
