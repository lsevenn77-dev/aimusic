import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/notifications.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const requests=[],badge={setAttribute(){}},error={},root={isConnected:true,querySelectorAll:()=>[],querySelector:()=>error},listeners={};
 const c=vm.createContext({me:{id:'owner'},document:{hidden:false,querySelectorAll:()=>[badge],addEventListener:(k,fn)=>listeners[k]=fn,removeEventListener(){}},window:{addEventListener(){}},setInterval(){},$:()=>root,location:{hash:'#notifications'},toast(){},api:async(path,method,body)=>{requests.push({path,method,body});return {unread:0};}});
 vm.runInContext(source,c);c.view={activity:{account:'owner',unread:2,items:[{id:'one',read_at:0},{id:'two',read_at:0}]}};
 return {c,badge,error,requests,root,listeners,run:s=>vm.runInContext(s,c)};
}
test('opening notifications acknowledges only the loaded notifications without a read-button click',async()=>{
 const t=setup();t.run('bindNotifications(view)');await tick();assert.equal(t.requests.length,1);assert.deepEqual([...t.requests[0].body.ids],['one','two']);assert.equal(t.badge.hidden,true);assert(t.c.view.activity.items.every(n=>n.read_at>0));
});
test('hidden page waits until visible; failed acknowledgement keeps unread badge',async()=>{
 const t=setup();t.c.document.hidden=true;t.run('bindNotifications(view)');await tick();assert.equal(t.requests.length,0);
 t.c.api=async()=>{throw Error('offline');};t.c.document.hidden=false;t.listeners.visibilitychange();await tick();assert.equal(t.badge.hidden,false);assert.match(t.error.textContent,/offline/);
});
test('an older summary response cannot restore the unread count after acknowledgement',async()=>{
 const t=setup();let release;t.c.api=(path,method,body)=>method==='POST'?Promise.resolve({unread:0}):new Promise(r=>release=r);
 const pending=t.run('refreshActivityBadge()');t.run('bindNotifications(view)');await tick();assert.equal(t.badge.hidden,true);release({unread:2});await pending;assert.equal(t.badge.hidden,true);
});
test('account switch does not acknowledge another account or paint an old response',async()=>{
 const t=setup();t.c.me={id:'other'};t.run('bindNotifications(view)');await tick();assert.equal(t.requests.length,0);
});
