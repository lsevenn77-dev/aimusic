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
});
