import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../dist/notifications.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function items(start,count){return Array.from({length:count},(_,index)=>({id:String(start+index),created:100-start-index,read_at:0}));}
function client(api){
 const listeners=new Map(),frames=[],cleanups=[],scrolls=[],list={innerHTML:'first page'},more={disabled:false,hidden:false},error={};
 const root={isConnected:true,querySelectorAll:()=>[],querySelector(selector){
  if(selector==='#activity-list')return list;
  if(selector==='[data-activity-more]')return more;
  if(selector==='.activity-error')return error;
  return null;
 }};
 const add=(event,fn)=>{const callbacks=listeners.get(event)||new Set();callbacks.add(fn);listeners.set(event,callbacks);};
 const remove=(event,fn)=>listeners.get(event)?.delete(fn);
 const context=vm.createContext({
  me:{id:'owner'},api,AbortController,URLSearchParams,
  document:{hidden:false,querySelectorAll:()=>[],addEventListener:add,removeEventListener:remove},
  window:{scrollY:0,addEventListener:add,removeEventListener:remove,scrollTo(value){scrolls.push(value);}},
  location:{hash:'#notifications'},setInterval(){return 1;},clearInterval(){},
  requestAnimationFrame(fn){frames.push(fn);},registerRouteCleanup(fn){cleanups.push(fn);},
  $:()=>root,icon:()=>'',esc:String,number:String,heading:()=>'',empty:()=>''
 });
 vm.runInContext(source,context);
 vm.runInContext("activityGroupsHTML=items=>items.map(item=>item.id).join(',');",context);
 return {context,root,list,more,error,frames,cleanups,scrolls,
  run:code=>vm.runInContext(code,context),
  fire(event){for(const fn of [...(listeners.get(event)||[])])fn();},
  bind(state){context.view={activity:{account:'owner',filter:'all',unread:0,items:items(0,20),next:'older',...state}};vm.runInContext('bindNotifications(view)',context);return context.view.activity;}
 };
}

test('returning to a deep notification list renders the fresh first page without waiting for older pages',async()=>{
 const calls=[],older=deferred(),c=client(async(path,method,body,options)=>{
  calls.push({path,options});return path.includes('before=')?older.promise:{items:items(0,20),next:'older',unread:1};
 });
 c.run("activityResume={account:'owner',filter:'all',count:60,scroll:1200};");
 const view=await c.run("notificationsView('notifications','notifications')");
 assert.equal(calls.length,1);assert.equal(view.activity.items.length,20);
 assert.equal(view.activity.restoreCount,60);assert.equal(view.activity.restoreScroll,1200);
 assert.equal(calls[0].options.fresh,true);assert.equal(c.run('activityResume'),null);
});

test('older notification pages restore after paint, deduplicate, and pause polling and load-more',async()=>{
 const older=deferred(),calls=[],c=client(async(path,method,body,options)=>{
  calls.push({path,method,options});return older.promise;
 });
 const state=c.bind({restoreCount:40,restoreScroll:1200});
 assert.equal(calls.length,0);assert.equal(c.more.disabled,true);assert.equal(c.list.innerHTML,'first page');
 const restoring=c.frames.shift()();await tick();assert.equal(calls.length,1);
 c.fire('focus');c.fire('visibilitychange');
 await c.root.onclick({target:{closest:()=>({disabled:true})},preventDefault(){}});
 assert.equal(calls.filter(call=>call.path.startsWith('/api/notifications?')).length,1,'restoration must not race a fresh first page or manual pagination');
 assert.equal(calls[0].options.fresh,true);assert.equal(calls[0].options.signal.aborted,false);
 older.resolve({items:[...items(19,21)],next:null});await restoring;
 assert.equal(state.items.length,40);assert.equal(new Set(state.items.map(item=>item.id)).size,40);
 assert.equal(c.scrolls.length,1);assert.equal(c.scrolls[0].top,1200);assert.equal(c.more.disabled,false);
 assert.equal(calls[0].options.signal.aborted,true);
});

test('user interaction abandons pending scroll restoration and permits manual pagination',async()=>{
 const older=deferred(),calls=[],c=client(async(path,method,body,options)=>{calls.push({path,options});return older.promise;});
 const state=c.bind({restoreCount:40,restoreScroll:1200});const restoring=c.frames.shift()();await tick();
 c.fire('wheel');assert.equal(calls[0].options.signal.aborted,true);assert.equal(c.more.disabled,false);
 older.resolve({items:items(20,20),next:null});await restoring;
 assert.equal(state.items.length,20);assert.equal(c.scrolls.length,0);
});

test('route cleanup and account changes discard delayed older pages and never restore scroll',async()=>{
 for(const reason of ['route','account']){
  const older=deferred(),c=client(async()=>older.promise),state=c.bind({restoreCount:40,restoreScroll:1200});
  const restoring=c.frames.shift()();await tick();
  if(reason==='route'){c.context.location.hash='#profile';c.cleanups.forEach(fn=>fn());}
  else c.context.me={id:'different'};
  older.resolve({items:items(20,20),next:null});await restoring;
  assert.equal(state.items.length,20);assert.equal(c.scrolls.length,0);assert.equal(c.more.disabled,false);
 }
});

test('failed restoration keeps the first page usable and repeated cursors cannot loop',async()=>{
 const c=client(async()=>{throw Error('offline');}),state=c.bind({restoreCount:40,restoreScroll:1200});
 await c.frames.shift()();assert.equal(state.items.length,20);assert.equal(c.more.disabled,false);assert.equal(c.error.textContent,'offline');assert.equal(c.scrolls.length,0);
 let calls=0;const repeated=client(async()=>{calls++;return {items:items(20,5),next:'older'};});
 repeated.bind({restoreCount:60,restoreScroll:1200});await repeated.frames.shift()();
 assert.equal(calls,1);assert.equal(repeated.more.disabled,false);assert.equal(repeated.scrolls.length,0);
});

test('restoration stops cyclic cursors when duplicate pages do not increase the restored count',async()=>{
 const cursors=[],c=client(async path=>{
  const cursor=new URL(path,'https://local.test').searchParams.get('before');
  cursors.push(cursor);
  assert.ok(cursors.length<=2,'cyclic cursors must not keep requesting pages');
  return {items:items(0,20),next:cursor==='older'?'oldest':'older'};
 });
 const state=c.bind({restoreCount:60,restoreScroll:1200});await c.frames.shift()();
 assert.deepEqual(cursors,['older','oldest']);assert.equal(state.items.length,20);
 assert.equal(c.more.disabled,false);assert.equal(c.scrolls.length,0);
});
