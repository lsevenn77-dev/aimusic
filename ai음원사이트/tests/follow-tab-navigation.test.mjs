import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('dist/follow-management.js','utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function context(api=async()=>({items:[]})){
 const c=vm.createContext({URLSearchParams,structuredClone,Date,Map,Set,me:{id:'owner'},apiRevision:0,followRevision:0,api,esc:String,icon:()=>'',location:{hash:'#follow'},document:{querySelector:()=>null},window:{},gate:()=>'<p>login</p>'});vm.runInContext(source,c);return c;
}
test('concurrent tab reads share one request and cached values cannot be mutated by consumers',async()=>{
 const waiting=deferred();let calls=0;const c=context(()=>{calls++;return waiting.promise;});
 const a=c.readFollowData('tab=followers&q='),b=c.readFollowData('q=&tab=followers');assert.equal(calls,1);
 waiting.resolve({items:[{name:'one'}]});const first=await a,second=await b;first.items[0].name='changed';assert.equal(second.items[0].name,'one');
 assert.equal((await c.readFollowData('tab=followers&q=')).items[0].name,'one');assert.equal(calls,1);
});
test('account and relationship revisions reject late data and force a fresh read',async()=>{
 const waiting=deferred();let calls=0;const c=context(()=>++calls===1?waiting.promise:Promise.resolve({items:[{name:'current'}]}));
 const old=c.readFollowData('tab=following');c.followRevision++;waiting.resolve({items:[{name:'old'}]});await assert.rejects(old,{name:'AbortError'});
 assert.equal((await c.readFollowData('tab=following')).items[0].name,'current');c.me={id:'different'};await c.readFollowData('tab=following');assert.equal(calls,3);
});
test('a failed read can retry instead of poisoning the request cache',async()=>{
 let count=0;const c=context(async()=>{if(!count++)throw Error('offline');return {items:[]};});await assert.rejects(c.readFollowData('tab=blocks'),/offline/);await c.readFollowData('tab=blocks');assert.equal(count,2);
});
test('twenty native hash/history selections retain the same page and account boundary',()=>{
 const c=context(),selected=[],main={dataset:{route:'follow'}},root={_followPage:{account:'owner',context:'owner::',select:s=>selected.push(s.tab)}};
 c.document.querySelector=s=>s==='.fm-stable'?root:s==='#main'?main:null;
 let closedOverlays=0;c.cleanupRouteOverlays=()=>closedOverlays++;
 for(let i=0;i<20;i++){const tab=['followers','following','blocks'][i%3];assert.equal(c.refreshFollowRoute('follow?tab='+tab),true);assert.equal(main.dataset.route,'follow?tab='+tab);}
 assert.equal(selected.length,20);assert.equal(closedOverlays,20);c.refreshFollowRoute(main.dataset.route);assert.equal(closedOverlays,20);assert.equal(root._followPage.account,'owner');c.me={id:'other'};assert.equal(c.refreshFollowRoute('follow?tab=followers'),false);
});
test('personal shell has three tabs, scoped hidden route targets and no artist-management link',async()=>{
 const c=context(),view=await c.followManagementView('follow?tab=followers');assert.equal((view.html.match(/data-follow-tab=/g)||[]).length,3);assert.match(view.html,/data-follow-route-target/);assert.doesNotMatch(view.html,/AI 아티스트|tab=artists/);
 vm.runInContext(readFileSync('dist/menu-integration.js','utf8'),c);assert.equal(c.menuAlias('#follow?tab=artists&artist=one'),'#follow?tab=followers');assert.equal(c.menuAlias('#follow?tab=unknown'),'#follow?tab=followers');
 assert.equal(c.followSelection('follow?tab=artists'),null);assert.equal(c.followSelection('artist/one'),null);
 assert.doesNotMatch(view.html,/<h1/);assert.equal((view.html.match(/data-follow-count-tab=/g)||[]).length,3);
 for(const tab of ['followers','following','blocks']){const panel=c.followPanelHTML(tab);assert.match(panel,/검색어 지우기/);assert.doesNotMatch(panel,/fm-count|fm-mode|fm-bulk|fm-result-head/);}
});

function searchHarness(){
 const c=context(),timers=new Map(),queries=[],reads=[];let serial=0,cancelled=0;
 c.setTimeout=(fn,delay)=>{assert.equal(delay,275);timers.set(++serial,fn);return serial;};c.clearTimeout=id=>timers.delete(id);
 const input={value:'',readOnly:false,disabled:false,focus(){this.focused=true;}},clear={};
 const control=c.bindFollowSearch(input,clear,{pending:q=>queries.push(q),read:()=>reads.push(c.normalizeFollowSearch(input.value)),cancelRead:()=>cancelled++});
 return {input,clear,control,queries,reads,timers,get cancelled(){return cancelled;},type(value,composing=false){input.value=value;input.oninput({isComposing:composing});},flush(){const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());}};
}
test('nickname search debounces the latest normalized query and coalesces equivalent input events',()=>{
 const h=searchHarness();h.type('E');h.type('Ec');h.type('  ECHO  ');assert.equal(h.timers.size,1);assert.deepEqual(h.reads,[]);h.flush();assert.deepEqual(h.reads,['echo']);
 h.type('echo');h.input.onsearch();assert.equal(h.timers.size,0);assert.equal(h.clear.hidden,false);
});
test('IME composition cancels an earlier search and sends the completed Hangul only once',()=>{
 const h=searchHarness();h.type('h');h.input.oncompositionstart();h.type('하',true);h.type('하루한국'.normalize('NFD'),true);assert.equal(h.timers.size,0);assert.equal(h.cancelled,1);h.flush();assert.deepEqual(h.reads,[]);
 h.input.oncompositionend();h.input.oninput({isComposing:false});assert.equal(h.timers.size,1);h.flush();assert.deepEqual(h.reads,['하루한국']);
});
test('clear immediately restores the unfiltered query and cancels pending search work',()=>{
 const h=searchHarness();h.type('하루한국');h.clear.onclick();assert.deepEqual(h.reads,['']);assert.equal(h.input.value,'');assert.equal(h.clear.hidden,true);assert.equal(h.input.focused,true);h.flush();assert.deepEqual(h.reads,['']);
 h.type('retry');h.control.cancel();h.flush();assert.deepEqual(h.reads,['']);
 h.input.readOnly=true;h.control.sync();assert.equal(h.clear.disabled,true);h.clear.onclick();assert.equal(h.input.value,'retry');
});
